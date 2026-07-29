import type {
  FrameMessage,
  InspectionResult,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../worker/protocol';
import { complexToPixel, panViewport, pixelToComplex, zoomViewportAt } from '../domain/viewport';
import { COMPONENT_CATALOG, type CatalogComponent } from '../catalog/components';
import { button, element, replaceChildren } from './dom';
import { setIcon } from './icons';
import { createSemanticLegend } from './semantic-legend';
import {
  DEFAULT_VIEWPORT,
  formatCoordinate,
  formatMagnification,
  isDefaultViewport,
  MAX_SCALE,
  MIN_SCALE,
  SEMANTIC_VIEWS,
  type SemanticView,
  type Viewport,
  ZOOM_FACTOR,
} from './view-state';

interface ApplicationState {
  viewport: Viewport;
  semanticView: SemanticView;
  catalogVisible: boolean;
  requestId: number;
  activeRequestId: number;
  frameStage: 'none' | 'coarse' | 'stable';
  dragging: boolean;
  selectedCatalogId?: string;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

const RENDER_DELAY_MS = 65;
// An intentional device-independent cap keeps the first CPU renderer within
// the representative 768–1024 px performance target on high-DPI displays.
const MAX_RENDER_EDGE = 1024;

export function mountApplication(host: HTMLElement): () => void {
  const state: ApplicationState = {
    viewport: { ...DEFAULT_VIEWPORT },
    semanticView: 'stability',
    catalogVisible: true,
    requestId: 0,
    activeRequestId: 0,
    frameStage: 'none',
    dragging: false,
  };

  const worker = new Worker(new URL('../worker/render.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mandelbrot-renderer',
  });
  const renderCanvas = element('canvas', {
    className: 'explorer__canvas',
    attributes: {
      'aria-label':
        'Interactive Mandelbrot set. Use arrow keys to pan, plus and minus to zoom, and Enter to inspect the center.',
      tabindex: '0',
    },
  });
  const presentationCanvas = element('canvas', {
    className: 'explorer__presentation',
    attributes: { 'aria-hidden': 'true' },
  });
  const possibleCanvasContext = renderCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  });
  const possiblePresentationContext = presentationCanvas.getContext('2d', {
    alpha: false,
  });
  if (!possibleCanvasContext || !possiblePresentationContext) {
    throw new Error('This browser does not support the 2D canvas renderer.');
  }
  const canvasContext = possibleCanvasContext;
  const presentationContext = possiblePresentationContext;

  const statusText = element('span', { text: 'Preparing first view…' });
  const status = element('div', {
    className: 'status status--working',
    attributes: {
      role: 'status',
      'aria-label': 'Render status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });
  status.append(
    element('span', {
      className: 'status__indicator',
      attributes: { 'aria-hidden': 'true' },
    }),
    statusText,
  );

  const magnification = element('output', {
    className: 'coordinates__magnification',
    text: formatMagnification(state.viewport.spanY),
    attributes: { 'aria-label': 'Magnification' },
  });
  const centerCoordinates = element('span', {
    className: 'coordinates__center',
  });
  const coordinateReadout = element('div', {
    className: 'coordinates',
    attributes: { 'aria-label': 'Current view' },
  });
  coordinateReadout.append(magnification, centerCoordinates);

  const semanticSelect = element('select', {
    className: 'select',
    attributes: {
      id: 'semantic-view',
      'aria-describedby': 'semantic-view-description',
    },
  });
  for (const view of SEMANTIC_VIEWS) {
    semanticSelect.append(element('option', { text: view.label, attributes: { value: view.id } }));
  }
  const semanticDescription = element('p', {
    className: 'control-description',
    text: SEMANTIC_VIEWS[0].description,
    attributes: { id: 'semantic-view-description' },
  });

  const catalogToggle = button('Catalog', {
    className: 'toggle-button',
    title: 'Show named components and internal addresses',
    pressed: state.catalogVisible,
  });
  const catalogStatus = element('span', {
    className: 'toggle-button__state',
    text: 'Shown',
  });
  catalogToggle.append(catalogStatus);

  const resetButton = button('', {
    className: 'icon-button',
    title: 'Restore the full-set view (0)',
  });
  setIcon(resetButton, 'reset', 'Reset');
  const zoomOutButton = button('', {
    className: 'icon-button icon-button--compact',
    title: 'Zoom out (−)',
  });
  setIcon(zoomOutButton, 'zoomOut');
  zoomOutButton.setAttribute('aria-label', 'Zoom out');
  const zoomInButton = button('', {
    className: 'icon-button icon-button--compact',
    title: 'Zoom in (+)',
  });
  setIcon(zoomInButton, 'zoomIn');
  zoomInButton.setAttribute('aria-label', 'Zoom in');

  const feedback = element('div', {
    className: 'feedback',
    attributes: {
      role: 'status',
      'aria-label': 'Interaction feedback',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });

  const guidance = createGuidance();
  const inspector = createInspector();
  const legend = createSemanticLegend();
  const catalogOverlay = element('div', {
    className: 'catalog-overlay',
    attributes: {
      'aria-label': 'Named Mandelbrot components',
    },
  });

  const header = createHeader(guidance.show);
  const controls = element('section', {
    className: 'controls',
    attributes: {
      'aria-label': 'Explorer controls',
    },
  });
  const viewControl = element('div', { className: 'field' });
  viewControl.append(
    element('label', {
      className: 'field__label',
      text: 'Interior view',
      attributes: { for: 'semantic-view' },
    }),
    semanticSelect,
    semanticDescription,
  );
  const controlActions = element('div', { className: 'controls__actions' });
  const zoomGroup = element('div', {
    className: 'button-group',
    attributes: { role: 'group', 'aria-label': 'Zoom controls' },
  });
  zoomGroup.append(zoomOutButton, zoomInButton);
  controlActions.append(catalogToggle, zoomGroup, resetButton);
  controls.append(viewControl, controlActions);

  const canvasShell = element('section', {
    className: 'explorer explorer--catalog-visible',
    attributes: {
      id: 'explorer',
      'aria-labelledby': 'explorer-heading',
    },
  });
  const explorerHeading = element('h2', {
    className: 'visually-hidden',
    text: 'Mandelbrot explorer',
    attributes: { id: 'explorer-heading' },
  });
  const canvasStack = element('div', { className: 'explorer__stack' });
  const interactionHint = element('p', {
    className: 'explorer__hint',
    text: 'Scroll to zoom · drag to pan · click to inspect',
  });
  canvasStack.append(presentationCanvas, renderCanvas, catalogOverlay, interactionHint, feedback);
  const explorerFooter = element('footer', { className: 'explorer__footer' });
  explorerFooter.append(status, coordinateReadout);
  canvasShell.append(explorerHeading, canvasStack, explorerFooter);

  const sidePanel = element('aside', {
    className: 'side-panel',
    attributes: { 'aria-label': 'Interpretation' },
  });
  sidePanel.append(inspector.element, legend.element);

  const workspace = element('main', { className: 'workspace' });
  const primary = element('div', { className: 'primary' });
  primary.append(controls, canvasShell);
  workspace.append(primary, sidePanel);

  replaceChildren(host, [header, workspace, guidance.element]);
  updateCoordinateReadout();

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let dragOrigin: CanvasPoint | undefined;
  let dragViewport: Viewport | undefined;

  function showFeedback(message: string): void {
    feedback.textContent = message;
    feedback.classList.add('feedback--visible');
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedback.classList.remove('feedback--visible');
    }, 2600);
  }

  function updateCoordinateReadout(): void {
    magnification.value = formatMagnification(state.viewport.spanY);
    magnification.textContent = magnification.value;
    centerCoordinates.textContent = `center ${formatCoordinate(
      state.viewport.center.re,
    )} ${state.viewport.center.im < 0 ? '−' : '+'} ${formatCoordinate(
      Math.abs(state.viewport.center.im),
    )}i`;
    resetButton.disabled = isDefaultViewport(state.viewport);
    zoomInButton.disabled = state.viewport.spanY <= MIN_SCALE;
    zoomOutButton.disabled = state.viewport.spanY >= MAX_SCALE;
  }

  function dimensions(): { width: number; height: number } {
    const rect = renderCanvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const scale = Math.min(pixelRatio, MAX_RENDER_EDGE / Math.max(rect.width, rect.height));
    return {
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
    };
  }

  function scheduleRender(immediate = false): void {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    if (state.activeRequestId > 0) {
      worker.postMessage({
        type: 'cancel',
        requestId: state.activeRequestId,
      } satisfies MainToWorkerMessage);
    }
    status.className = 'status status--working';
    statusText.textContent = 'Rendering preview…';
    renderTimer = setTimeout(requestRender, immediate ? 0 : RENDER_DELAY_MS);
  }

  function requestRender(): void {
    const size = dimensions();
    state.requestId += 1;
    state.activeRequestId = state.requestId;
    state.frameStage = 'none';
    worker.postMessage({
      type: 'render',
      requestId: state.activeRequestId,
      viewport: state.viewport,
      size,
      semanticView: state.semanticView,
    } satisfies MainToWorkerMessage);
  }

  function presentFrame(frame: FrameMessage): void {
    if (frame.requestId !== state.activeRequestId) return;

    const pixels = new ImageData(frame.rgba, frame.width, frame.height);
    renderCanvas.width = frame.width;
    renderCanvas.height = frame.height;
    canvasContext.imageSmoothingEnabled = false;
    canvasContext.putImageData(pixels, 0, 0);
    state.frameStage = frame.stage;
    updateCatalogOverlay();

    if (frame.stage === 'coarse') {
      statusText.textContent = `Refining view · ${Math.round(frame.progress * 100)}%`;
    } else {
      status.className = 'status status--ready';
      statusText.textContent = 'Stable frame';
      presentationCanvas.width = frame.width;
      presentationCanvas.height = frame.height;
      presentationContext.drawImage(renderCanvas, 0, 0);
    }
  }

  function zoom(direction: 'in' | 'out', anchor: CanvasPoint = { x: 0.5, y: 0.5 }): void {
    const factor = direction === 'in' ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const requestedScale = state.viewport.spanY * factor;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, requestedScale));
    if (nextScale === state.viewport.spanY) {
      showFeedback(
        direction === 'in'
          ? 'Purposeful zoom limit reached. This keeps the analysis reliable.'
          : 'Already showing the complete Mandelbrot set.',
      );
      canvasShell.classList.remove('explorer--bounded');
      requestAnimationFrame(() => canvasShell.classList.add('explorer--bounded'));
      return;
    }
    const size = dimensions();
    state.viewport = zoomViewportAt(
      state.viewport,
      size,
      anchor.x * size.width,
      anchor.y * size.height,
      nextScale / state.viewport.spanY,
    );
    updateCoordinateReadout();
    scheduleRender();
  }

  function resetView(): void {
    state.viewport = {
      center: { ...DEFAULT_VIEWPORT.center },
      spanY: DEFAULT_VIEWPORT.spanY,
    };
    inspector.clear();
    updateCoordinateReadout();
    showFeedback('Full-set view restored.');
    scheduleRender(true);
  }

  function canvasPoint(event: PointerEvent | WheelEvent): CanvasPoint {
    const rect = renderCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function inspectAt(point: CanvasPoint): void {
    const size = dimensions();
    const complexPoint = pixelToComplex(
      state.viewport,
      size,
      point.x * size.width,
      point.y * size.height,
    );
    inspectPoint(complexPoint);
  }

  function inspectPoint(
    complexPoint: { readonly re: number; readonly im: number },
    component?: CatalogComponent,
  ): void {
    if (component) {
      state.selectedCatalogId = component.id;
    } else {
      delete state.selectedCatalogId;
    }
    inspector.loading(complexPoint.re, complexPoint.im, component);
    state.requestId += 1;
    worker.postMessage({
      type: 'inspect',
      requestId: state.requestId,
      point: complexPoint,
    } satisfies MainToWorkerMessage);
  }

  function updateCatalogOverlay(): void {
    if (!state.catalogVisible) {
      catalogOverlay.replaceChildren();
      return;
    }
    const size = dimensions();
    const markers = COMPONENT_CATALOG.flatMap((component) => {
      const point = complexToPixel(state.viewport, size, component.center);
      if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) {
        return [];
      }
      const marker = button('', {
        className: `catalog-marker catalog-marker--period-${component.period}`,
        title: `${component.label}, period ${component.period}`,
      });
      marker.setAttribute('aria-label', `Inspect ${component.label}, period ${component.period}`);
      marker.style.left = `${(point.x / size.width) * 100}%`;
      marker.style.top = `${(point.y / size.height) * 100}%`;
      marker.append(
        element('span', {
          className: 'catalog-marker__dot',
          attributes: { 'aria-hidden': 'true' },
        }),
        element('span', {
          className: 'catalog-marker__label',
          text: component.label,
        }),
      );
      marker.addEventListener('click', () => {
        inspectPoint(component.center, component);
      });
      return [marker];
    });
    replaceChildren(catalogOverlay, markers);
  }

  semanticSelect.addEventListener('change', () => {
    state.semanticView = semanticSelect.value as SemanticView;
    const selected = SEMANTIC_VIEWS.find((view) => view.id === state.semanticView);
    semanticDescription.textContent = selected?.description ?? '';
    legend.update(state.semanticView);
    scheduleRender(true);
  });

  catalogToggle.addEventListener('click', () => {
    state.catalogVisible = !state.catalogVisible;
    catalogToggle.setAttribute('aria-pressed', String(state.catalogVisible));
    catalogStatus.textContent = state.catalogVisible ? 'Shown' : 'Hidden';
    showFeedback(
      state.catalogVisible
        ? 'Catalog overlay enabled. Named components appear as catalog data becomes available.'
        : 'Catalog overlay hidden.',
    );
    canvasShell.classList.toggle('explorer--catalog-visible', state.catalogVisible);
    updateCatalogOverlay();
  });

  resetButton.addEventListener('click', resetView);
  zoomInButton.addEventListener('click', () => zoom('in'));
  zoomOutButton.addEventListener('click', () => zoom('out'));

  renderCanvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 'in' : 'out', canvasPoint(event));
    },
    { passive: false },
  );

  renderCanvas.addEventListener('pointerdown', (event) => {
    renderCanvas.setPointerCapture(event.pointerId);
    state.dragging = false;
    dragOrigin = { x: event.clientX, y: event.clientY };
    dragViewport = state.viewport;
    renderCanvas.classList.add('explorer__canvas--grabbing');
  });

  renderCanvas.addEventListener('pointermove', (event) => {
    if (!dragOrigin || !dragViewport) return;
    const dx = event.clientX - dragOrigin.x;
    const dy = event.clientY - dragOrigin.y;
    if (Math.hypot(dx, dy) > 3) state.dragging = true;
    if (!state.dragging) return;
    state.viewport = panViewport(dragViewport, dimensions(), dx, dy);
    updateCoordinateReadout();
  });

  const finishPointer = (event: PointerEvent): void => {
    if (!dragOrigin) return;
    renderCanvas.releasePointerCapture(event.pointerId);
    renderCanvas.classList.remove('explorer__canvas--grabbing');
    if (state.dragging) {
      scheduleRender();
    } else {
      inspectAt(canvasPoint(event));
    }
    dragOrigin = undefined;
    dragViewport = undefined;
    state.dragging = false;
  };
  renderCanvas.addEventListener('pointerup', finishPointer);
  renderCanvas.addEventListener('pointercancel', () => {
    dragOrigin = undefined;
    dragViewport = undefined;
    state.dragging = false;
    renderCanvas.classList.remove('explorer__canvas--grabbing');
  });

  renderCanvas.addEventListener('keydown', (event) => {
    switch (event.key) {
      case '+':
      case '=':
        zoom('in');
        break;
      case '-':
      case '_':
        zoom('out');
        break;
      case '0':
      case 'Home':
        resetView();
        break;
      case 'ArrowLeft':
        state.viewport = panViewport(state.viewport, dimensions(), dimensions().width * 0.1, 0);
        scheduleRender();
        break;
      case 'ArrowRight':
        state.viewport = panViewport(state.viewport, dimensions(), dimensions().width * -0.1, 0);
        scheduleRender();
        break;
      case 'ArrowUp':
        state.viewport = panViewport(state.viewport, dimensions(), 0, dimensions().height * 0.1);
        scheduleRender();
        break;
      case 'ArrowDown':
        state.viewport = panViewport(state.viewport, dimensions(), 0, dimensions().height * -0.1);
        scheduleRender();
        break;
      case 'Enter':
        inspectAt({ x: 0.5, y: 0.5 });
        break;
      default:
        return;
    }
    event.preventDefault();
    updateCoordinateReadout();
  });

  worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data;
    switch (message.type) {
      case 'frame':
        presentFrame(message);
        break;
      case 'inspection':
        inspector.show(
          message.result,
          COMPONENT_CATALOG.find((component) => component.id === state.selectedCatalogId),
        );
        break;
      case 'error':
        status.className = 'status status--error';
        statusText.textContent = 'Render interrupted. Adjust the view or reset to try again.';
        break;
      case 'cancelled':
        break;
    }
  });
  worker.addEventListener('error', () => {
    status.className = 'status status--error';
    statusText.textContent = 'Renderer unavailable. Reload the page to start a new worker.';
  });

  const resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(canvasStack);
  scheduleRender(true);

  return () => {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    resizeObserver.disconnect();
    worker.terminate();
    host.replaceChildren();
  };
}

function createHeader(showGuidance: () => void): HTMLElement {
  const header = element('header', { className: 'site-header' });
  const identity = element('div', { className: 'identity' });
  const mark = element('span', {
    className: 'identity__mark',
    text: 'M',
    attributes: { 'aria-hidden': 'true' },
  });
  const title = element('div');
  title.append(
    element('h1', { className: 'identity__title', text: 'Mandelbrot Interiority' }),
    element('p', {
      className: 'identity__subtitle',
      text: 'A structural view from the inside',
    }),
  );
  identity.append(mark, title);
  const aboutButton = button('', {
    className: 'icon-button icon-button--quiet',
    title: 'How to use the explorer',
  });
  setIcon(aboutButton, 'info', 'Guide');
  aboutButton.addEventListener('click', showGuidance);
  header.append(identity, aboutButton);
  return header;
}

function createGuidance(): {
  readonly element: HTMLElement;
  readonly show: () => void;
} {
  const root = element('section', {
    className: 'guidance guidance--visible',
    attributes: {
      'aria-labelledby': 'guidance-title',
    },
  });
  const heading = element('h2', {
    text: 'Start with structure',
    attributes: { id: 'guidance-title' },
  });
  const copy = element('p', {
    text: 'This view colors evidence about attracting behavior—not simply whether a point is black or escaped.',
  });
  const tips = element('ul', { className: 'guidance__tips' });
  for (const tip of [
    'Scroll or use + and − to zoom',
    'Drag or use arrow keys to pan',
    'Select a point to inspect the evidence',
  ]) {
    tips.append(element('li', { text: tip }));
  }
  const dismiss = button('Explore', { className: 'primary-button' });
  dismiss.addEventListener('click', () => root.classList.remove('guidance--visible'));
  const close = button('', {
    className: 'icon-button icon-button--quiet guidance__close',
    title: 'Dismiss guide',
  });
  setIcon(close, 'close');
  close.setAttribute('aria-label', 'Dismiss guide');
  close.addEventListener('click', () => root.classList.remove('guidance--visible'));
  root.append(close, heading, copy, tips, dismiss);
  return {
    element: root,
    show: () => root.classList.add('guidance--visible'),
  };
}

function createInspector(): {
  readonly element: HTMLElement;
  readonly loading: (re: number, im: number, component?: CatalogComponent) => void;
  readonly show: (result: InspectionResult, component?: CatalogComponent) => void;
  readonly clear: () => void;
} {
  const root = element('section', {
    className: 'inspector',
    attributes: { 'aria-labelledby': 'inspector-heading' },
  });
  const heading = element('h2', {
    className: 'eyebrow',
    text: 'Point evidence',
    attributes: { id: 'inspector-heading' },
  });
  const body = element('div', { className: 'inspector__body' });
  root.append(heading, body);

  const clear = (): void => {
    replaceChildren(body, [
      element('p', {
        className: 'empty-state',
        text: 'Select a point in the image to examine its classification and supporting evidence.',
      }),
    ]);
  };

  const loading = (re: number, im: number, component?: CatalogComponent): void => {
    replaceChildren(body, [
      component
        ? element('h3', {
            className: 'inspector__selection',
            text: component.label,
          })
        : undefined,
      element('p', {
        className: 'inspector__coordinate',
        text: `${formatCoordinate(re)} ${im < 0 ? '−' : '+'} ${formatCoordinate(Math.abs(im))}i`,
      }),
      element('p', { className: 'loading-line', text: 'Computing evidence…' }),
    ]);
  };

  const show = (result: InspectionResult, component?: CatalogComponent): void => {
    const orbit = result.orbit;
    const statusLabel: Record<typeof orbit.status, string> = {
      escaped: 'Escaped',
      'attracting-cycle': 'Attracting cycle',
      unresolved: 'Unresolved',
    };
    const badge = element('p', {
      className: `classification classification--${orbit.status}`,
      text: statusLabel[orbit.status],
    });
    const facts = element('dl', { className: 'facts' });
    const addFact = (term: string, value: string): void => {
      facts.append(element('dt', { text: term }), element('dd', { text: value }));
    };
    if (component) {
      addFact('Catalog period', String(component.period));
      if (component.internalAddress) {
        addFact('Internal address', component.internalAddress.join(' → '));
      }
      if (component.angledInternalAddress) {
        addFact(
          'Angled address',
          component.angledInternalAddress
            .map(
              (step) =>
                `${step.fromPeriod} → ${step.toPeriod} at ${step.rotation.numerator}/${step.rotation.denominator}`,
            )
            .join('; '),
        );
      }
      if (component.characteristicRays) {
        addFact(
          'Characteristic rays',
          component.characteristicRays
            .map((ray) => `${ray.numerator}/${ray.denominator}`)
            .join(' and '),
        );
      }
    }
    addFact('Iterations', String(orbit.iterations));
    if (orbit.status === 'escaped') {
      addFact('Escape iteration', String(orbit.escapeIteration));
      addFact('Final magnitude', Math.sqrt(orbit.magnitudeSquared).toPrecision(7));
    }
    if (orbit.status === 'attracting-cycle') {
      addFact('Detected period', String(orbit.period));
      addFact('Multiplier magnitude', orbit.multiplierMagnitude.toPrecision(7));
      addFact('Multiplier angle', `${((orbit.multiplierAngle * 180) / Math.PI).toFixed(3)}°`);
      addFact(
        'Stability exponent κ',
        Number.isFinite(orbit.stabilityExponent) ? orbit.stabilityExponent.toPrecision(7) : '∞',
      );
    }
    addFact(
      'Evidence',
      orbit.evidence.length > 0
        ? orbit.evidence.map(formatEvidence).join(', ')
        : 'No conclusive evidence at current quality',
    );
    replaceChildren(body, [
      component
        ? element('h3', {
            className: 'inspector__selection',
            text: component.label,
          })
        : undefined,
      element('p', {
        className: 'inspector__coordinate',
        text: `${formatCoordinate(result.point.re)} ${
          result.point.im < 0 ? '−' : '+'
        } ${formatCoordinate(Math.abs(result.point.im))}i`,
      }),
      badge,
      facts,
    ]);
  };

  clear();
  return { element: root, loading, show, clear };
}

function formatEvidence(evidence: string): string {
  return evidence
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
