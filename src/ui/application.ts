import type { Complex, EvidenceSource } from '../domain';
import type {
  FrameMessage,
  InspectionResult,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../worker/protocol';
import {
  complexToPixel,
  panViewport,
  pixelToComplex,
  zoomViewportAt,
  zoomViewportToRect,
} from '../domain/viewport';
import { COMPONENT_CATALOG, type CatalogComponent } from '../catalog/components';
import { button, element, replaceChildren } from './dom';
import { setIcon } from './icons';
import { createSemanticLegend } from './semantic-legend';
import { parseBenchmarkParams } from './benchmark-params';
import {
  DEFAULT_VIEWPORT,
  DEFAULT_QUALITY_PROFILE_ID,
  formatCoordinate,
  formatCoordinateForViewport,
  formatMagnification,
  getQualityProfile,
  isDefaultViewport,
  MAX_SCALE,
  MIN_SCALE,
  QUALITY_PROFILES,
  SEMANTIC_VIEWS,
  describePeriodPolicy,
  type QualityProfile,
  type QualityProfileId,
  type SemanticView,
  type Viewport,
  ZOOM_FACTOR,
} from './view-state';
import { RendererWorkerClient } from './renderer-worker-client';
import {
  createRenderTraceRing,
  expectedWorkerCount,
  viewKeyHash,
  type RenderTrace,
} from './worker-timing-marks';

interface ApplicationState {
  viewport: Viewport;
  semanticView: SemanticView;
  catalogVisible: boolean;
  requestId: number;
  activeRequestId: number;
  activeInspectionRequestId: number;
  frameStage: 'none' | 'coarse' | 'stable';
  dragging: boolean;
  interactionMode: InteractionMode;
  qualityProfile: QualityProfileId;
  selectedPoint?: Complex;
  selectedCatalogId?: string;
  requestStartedAtMs: number;
  cancelRequestedAtMs: number;
  cancelRequestedRequestId: number;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

type InteractionMode = 'pan' | 'region';
const RENDER_DELAY_MS = 65;
const LABEL_MAGNIFICATION_THRESHOLD = 2;
const MIN_REGION_SIZE_PX = 12;

declare global {
  interface Window {
    __MI_PHASE1_TEST__?: {
      failRenderer(): void;
    };
    /**
     * Opt-in (?perf=1) render-trace diagnostic boundary, performance plan §8.
     * Absent unless requested; exposes the bounded ring's snapshot, the most
     * recently completed trace, and the live viewport for the Stage A
     * evidence harness.
     */
    __miRenderTrace?: {
      readonly snapshot: () => readonly RenderTrace[];
      readonly viewport: () => Viewport;
      lastTrace: RenderTrace | undefined;
    };
  }
}

export function mountApplication(host: HTMLElement): () => void {
  performance.mark('mi:app-mount');
  // Opt-in benchmark parameters (plan §8/§9): validated query parameters for
  // the Stage A evidence harness. Absent parameters leave every default —
  // viewport, quality profile, classifier mode, trace hook — untouched.
  const benchmark = parseBenchmarkParams(window.location.search);
  let perfHook: NonNullable<Window['__miRenderTrace']> | undefined;
  const renderTraces = createRenderTraceRing({
    ...(benchmark.perfEnabled
      ? {
          onTraceCompleted: (trace: RenderTrace) => {
            if (perfHook !== undefined) perfHook.lastTrace = trace;
          },
        }
      : {}),
  });
  const longTaskObserver = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          renderTraces.noteMainThreadLongTask(entry.duration);
          performance.mark('mi:long-task', {
            detail: { startTime: entry.startTime, duration: entry.duration },
          });
        }
      })
    : undefined;
  longTaskObserver?.observe({ type: 'longtask', buffered: true });
  const state: ApplicationState = {
    viewport: benchmark.viewport ? { ...benchmark.viewport } : { ...DEFAULT_VIEWPORT },
    semanticView: 'stability',
    catalogVisible: true,
    requestId: 0,
    activeRequestId: 0,
    activeInspectionRequestId: 0,
    frameStage: 'none',
    dragging: false,
    interactionMode: 'pan',
    qualityProfile: benchmark.qualityProfile ?? DEFAULT_QUALITY_PROFILE_ID,
    requestStartedAtMs: 0,
    cancelRequestedAtMs: 0,
    cancelRequestedRequestId: 0,
  };
  if (benchmark.perfEnabled) {
    perfHook = {
      snapshot: () => renderTraces.snapshot(),
      viewport: () => ({ ...state.viewport }),
      lastTrace: undefined,
    };
    window.__miRenderTrace = perfHook;
  }

  const renderCanvas = element('canvas', {
    className: 'explorer__canvas',
    attributes: {
      'aria-label':
        'Interactive Mandelbrot set. Use arrow keys to pan, plus and minus to zoom, and Enter to inspect the center.',
      'aria-describedby': 'explorer-interaction-hint selected-point-status',
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
  const retryRendererButton = button('Retry renderer', {
    className: 'status__retry',
  });
  retryRendererButton.hidden = true;
  status.append(
    element('span', {
      className: 'status__indicator',
      attributes: { 'aria-hidden': 'true' },
    }),
    statusText,
    retryRendererButton,
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
  const qualitySelect = element('select', {
    className: 'select select--compact',
    attributes: {
      id: 'render-quality',
      'aria-describedby': 'render-quality-description',
    },
  });
  for (const profile of QUALITY_PROFILES) {
    qualitySelect.append(
      element('option', { text: profile.label, attributes: { value: profile.id } }),
    );
  }
  qualitySelect.value = state.qualityProfile;
  const qualityDescription = element('p', {
    className: 'control-description',
    text: currentQualityProfile().description,
    attributes: { id: 'render-quality-description' },
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
  const panToolButton = button('', {
    className: 'tool-button',
    title: 'Drag to pan',
    pressed: true,
  });
  setIcon(panToolButton, 'pan', 'Pan');
  const regionToolButton = button('', {
    className: 'tool-button',
    title: 'Drag a box to zoom into an area',
    pressed: false,
  });
  setIcon(regionToolButton, 'region', 'Zoom area');

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
      role: 'group',
      'aria-label': 'Named Mandelbrot components',
    },
  });
  const zoomSelection = element('div', {
    className: 'zoom-selection',
    attributes: { 'aria-hidden': 'true' },
  });
  const selectedPointMarker = element('div', {
    className: 'selected-point-marker',
    attributes: { 'aria-hidden': 'true' },
  });
  selectedPointMarker.hidden = true;
  const selectedPointStatus = element('p', {
    className: 'visually-hidden',
    text: 'No point selected.',
    attributes: {
      id: 'selected-point-status',
      'aria-live': 'polite',
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
  const qualityControl = element('div', { className: 'field field--quality' });
  qualityControl.append(
    element('label', {
      className: 'field__label',
      text: 'Quality',
      attributes: { for: 'render-quality' },
    }),
    qualitySelect,
    qualityDescription,
  );
  const controlFields = element('div', { className: 'controls__fields' });
  controlFields.append(viewControl, qualityControl);
  const controlActions = element('div', { className: 'controls__actions' });
  const pointerToolGroup = element('div', {
    className: 'button-group tool-group',
    attributes: { role: 'group', 'aria-label': 'Pointer tool' },
  });
  pointerToolGroup.append(panToolButton, regionToolButton);
  const zoomGroup = element('div', {
    className: 'button-group',
    attributes: { role: 'group', 'aria-label': 'Zoom controls' },
  });
  zoomGroup.append(zoomOutButton, zoomInButton);
  controlActions.append(pointerToolGroup, catalogToggle, zoomGroup, resetButton);
  controls.append(controlFields, controlActions);

  const canvasShell = element('section', {
    className: 'explorer explorer--catalog-visible',
    attributes: {
      id: 'explorer',
      'aria-labelledby': 'explorer-heading',
      'data-render-stage': 'none',
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
    text: 'Drag to pan · Shift-drag to zoom area · click to inspect',
    attributes: { id: 'explorer-interaction-hint' },
  });
  canvasStack.append(
    presentationCanvas,
    renderCanvas,
    catalogOverlay,
    selectedPointMarker,
    zoomSelection,
    interactionHint,
    selectedPointStatus,
    feedback,
  );
  const explorerFooter = element('footer', { className: 'explorer__footer' });
  const revision = element('span', {
    className: 'build-revision',
    text: __MI_COMMIT_SHA__,
    attributes: { 'aria-label': 'Build revision' },
  });
  explorerFooter.append(status, coordinateReadout, revision);
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
  let pointerSession:
    | {
        readonly pointerId: number;
        readonly kind: InteractionMode;
        readonly origin: CanvasPoint;
        latest: CanvasPoint;
        readonly viewport: Viewport;
        feedbackMarked: boolean;
        readonly catalogInspect?: CatalogComponent;
      }
    | undefined;

  function currentQualityProfile(): QualityProfile {
    return getQualityProfile(state.qualityProfile);
  }

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
    canvasShell.classList.toggle(
      'explorer--expanded-labels',
      DEFAULT_VIEWPORT.spanY / state.viewport.spanY >= LABEL_MAGNIFICATION_THRESHOLD &&
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) <= 22,
    );
    updateSelectedPointMarker();
  }

  function formattedSelectedPoint(point: Complex): string {
    const size = dimensions();
    return `${formatCoordinateForViewport(point.re, state.viewport.spanY, size.height)} ${
      point.im < 0 ? '−' : '+'
    } ${formatCoordinateForViewport(Math.abs(point.im), state.viewport.spanY, size.height)}i`;
  }

  function updateSelectedPointMarker(): void {
    if (!state.selectedPoint) {
      selectedPointMarker.hidden = true;
      return;
    }
    const size = dimensions();
    const point = complexToPixel(state.viewport, size, state.selectedPoint);
    const visible = point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height;
    selectedPointMarker.hidden = !visible;
    if (!visible) return;
    selectedPointMarker.style.left = `${(point.x / size.width) * 100}%`;
    selectedPointMarker.style.top = `${(point.y / size.height) * 100}%`;
  }

  function applyPresentationPreview(transform: string, origin = 'center'): void {
    renderCanvas.style.transform = transform;
    renderCanvas.style.transformOrigin = origin;
    catalogOverlay.style.transform = transform;
    catalogOverlay.style.transformOrigin = origin;
  }

  function clearPresentationPreview(): void {
    renderCanvas.style.removeProperty('transform');
    renderCanvas.style.removeProperty('transform-origin');
    catalogOverlay.style.removeProperty('transform');
    catalogOverlay.style.removeProperty('transform-origin');
  }

  function dimensions(): { width: number; height: number } {
    const rect = canvasStack.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const scale = Math.min(
      pixelRatio,
      currentQualityProfile().maxRenderEdge / Math.max(rect.width, rect.height),
    );
    return {
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
    };
  }

  function scheduleRender(immediate = false): void {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    if (state.activeRequestId > 0 && state.frameStage !== 'stable') {
      state.cancelRequestedAtMs = performance.now();
      state.cancelRequestedRequestId = state.activeRequestId;
      performance.mark('mi:cancellation-requested', {
        detail: { requestId: state.activeRequestId },
      });
      workerClient.post({
        type: 'cancel',
        requestId: state.activeRequestId,
      } satisfies MainToWorkerMessage);
    }
    status.className = 'status status--working';
    statusText.textContent = 'Rendering preview…';
    renderTimer = setTimeout(requestRender, immediate ? 0 : RENDER_DELAY_MS);
  }

  function requestSemanticView(): void {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    status.className = 'status status--working';
    statusText.textContent = 'Applying interior view…';
    requestRender();
  }

  function requestRender(): void {
    renderTimer = undefined;
    const size = dimensions();
    state.requestId += 1;
    state.activeRequestId = state.requestId;
    state.frameStage = 'none';
    canvasShell.dataset['renderStage'] = 'requested';
    canvasShell.dataset['renderRequestId'] = String(state.activeRequestId);
    const quality = currentQualityProfile();
    state.requestStartedAtMs = performance.now();
    performance.mark('mi:render-request', {
      detail: { requestId: state.activeRequestId },
    });
    workerClient.post({
      type: 'render',
      requestId: state.activeRequestId,
      viewport: state.viewport,
      size,
      semanticView: state.semanticView,
      quality: quality.quality,
      ...(benchmark.classifierMode === undefined
        ? {}
        : { classifierMode: benchmark.classifierMode }),
      ...(benchmark.bandOrder === undefined ? {} : { bandOrder: benchmark.bandOrder }),
      ...(benchmark.yieldMechanism === undefined
        ? {}
        : { yieldMechanism: benchmark.yieldMechanism }),
    } satisfies MainToWorkerMessage);
    renderTraces.beginRequest({
      requestId: state.activeRequestId,
      viewKeyHash: viewKeyHash(state.viewport, state.semanticView, quality.quality),
      width: size.width,
      height: size.height,
      profile: quality.id,
      backend: 'cpu',
      workerCount: expectedWorkerCount(
        typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
      ),
    });
  }

  function presentFrame(frame: FrameMessage): void {
    if (frame.requestId !== state.activeRequestId) return;

    const pixels = new ImageData(frame.rgba, frame.width, frame.height);
    renderCanvas.width = frame.width;
    renderCanvas.height = frame.height;
    canvasContext.imageSmoothingEnabled = false;
    canvasContext.putImageData(pixels, 0, 0);
    state.frameStage = frame.stage;
    canvasShell.dataset['renderStage'] = frame.stage;
    canvasShell.dataset['renderRequestId'] = String(frame.requestId);
    retryRendererButton.hidden = true;
    if (frame.stage === 'coarse') clearPresentationPreview();
    updateCatalogOverlay();
    updateSelectedPointMarker();
    requestAnimationFrame(() => {
      performance.mark(`mi:${frame.stage}-presented`, {
        detail: { requestId: frame.requestId },
      });
      renderTraces.recordFrame(frame, {
        requestToPresentMs: performance.now() - state.requestStartedAtMs,
        colorizeMs: frame.workerTiming?.colorizeMs,
        bandsElapsedMs: frame.workerTiming?.bandsElapsedMs,
        yieldWaitMs: frame.workerTiming?.yieldWaitMs,
        yieldCount: frame.workerTiming?.yieldCount,
      });
    });

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
          ? 'Reached the current reliable zoom limit for this renderer and numerical budget.'
          : 'Already showing the complete Mandelbrot set.',
      );
      canvasShell.classList.remove('explorer--bounded');
      requestAnimationFrame(() => canvasShell.classList.add('explorer--bounded'));
      return;
    }
    const size = dimensions();
    applyPresentationPreview(
      `scale(${state.viewport.spanY / nextScale})`,
      `${anchor.x * 100}% ${anchor.y * 100}%`,
    );
    performance.mark('mi:interaction-feedback');
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
    delete state.selectedPoint;
    delete state.selectedCatalogId;
    inspector.clear();
    selectedPointStatus.textContent = 'No point selected.';
    clearPresentationPreview();
    updateCatalogSelection();
    updateCoordinateReadout();
    showFeedback('Full-set view restored.');
    scheduleRender(true);
  }

  function canvasPoint(event: PointerEvent | WheelEvent): CanvasPoint {
    const rect = canvasStack.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function startPointerSession(event: PointerEvent, catalogInspect?: CatalogComponent): void {
    if (event.button !== 0 || !event.isPrimary) return;
    renderCanvas.setPointerCapture(event.pointerId);
    state.dragging = false;
    const origin = canvasPoint(event);
    pointerSession = {
      pointerId: event.pointerId,
      kind: state.interactionMode === 'region' || event.shiftKey ? 'region' : 'pan',
      origin,
      latest: origin,
      viewport: state.viewport,
      feedbackMarked: false,
      ...(catalogInspect === undefined ? {} : { catalogInspect }),
    };
    if (pointerSession.kind === 'pan') {
      renderCanvas.classList.add('explorer__canvas--grabbing');
    } else {
      canvasShell.classList.add('explorer--selecting');
      updateZoomSelection(origin, origin);
    }
  }

  function cancelPointerSession(announce: boolean): void {
    const session = pointerSession;
    if (!session) return;
    if (session.kind === 'pan') {
      state.viewport = session.viewport;
      updateCoordinateReadout();
    }
    if (renderCanvas.hasPointerCapture(session.pointerId)) {
      renderCanvas.releasePointerCapture(session.pointerId);
    }
    pointerSession = undefined;
    state.dragging = false;
    clearPresentationPreview();
    renderCanvas.classList.remove('explorer__canvas--grabbing');
    canvasShell.classList.remove('explorer--selecting');
    zoomSelection.removeAttribute('style');
    if (announce) {
      showFeedback(session.kind === 'region' ? 'Area selection cancelled.' : 'Pan cancelled.');
    }
  }

  function updateZoomSelection(origin: CanvasPoint, latest: CanvasPoint): void {
    const left = Math.min(origin.x, latest.x) * 100;
    const top = Math.min(origin.y, latest.y) * 100;
    zoomSelection.style.left = `${left}%`;
    zoomSelection.style.top = `${top}%`;
    zoomSelection.style.width = `${Math.abs(latest.x - origin.x) * 100}%`;
    zoomSelection.style.height = `${Math.abs(latest.y - origin.y) * 100}%`;
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

  function inspectPoint(complexPoint: Complex, component?: CatalogComponent): void {
    state.selectedPoint = complexPoint;
    if (component) {
      state.selectedCatalogId = component.id;
    } else {
      delete state.selectedCatalogId;
    }
    inspector.loading(formattedSelectedPoint(complexPoint), component);
    selectedPointStatus.textContent = `Selected point c = ${formattedSelectedPoint(
      complexPoint,
    )}. Computing evidence.`;
    state.requestId += 1;
    state.activeInspectionRequestId = state.requestId;
    workerClient.post({
      type: 'inspect',
      requestId: state.activeInspectionRequestId,
      point: complexPoint,
      quality: currentQualityProfile().quality,
    } satisfies MainToWorkerMessage);
    updateCatalogSelection();
    updateSelectedPointMarker();
  }

  function updateCatalogSelection(): void {
    for (const marker of catalogOverlay.querySelectorAll<HTMLButtonElement>('.catalog-marker')) {
      const selected = marker.dataset['catalogId'] === state.selectedCatalogId;
      marker.classList.toggle('catalog-marker--selected', selected);
      if (selected) {
        marker.setAttribute('aria-current', 'true');
      } else {
        marker.removeAttribute('aria-current');
      }
    }
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
        className: [
          'catalog-marker',
          `catalog-marker--period-${component.period}`,
          component.id === state.selectedCatalogId ? 'catalog-marker--selected' : '',
          point.x / size.width > 0.76 ? 'catalog-marker--left-facing' : '',
        ]
          .filter(Boolean)
          .join(' '),
        title: `${component.label}, period ${component.period}`,
      });
      marker.dataset['catalogId'] = component.id;
      marker.setAttribute('aria-label', `Inspect ${component.label}, period ${component.period}`);
      if (component.id === state.selectedCatalogId) {
        marker.setAttribute('aria-current', 'true');
      }
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
      marker.addEventListener('pointerdown', (event) => {
        startPointerSession(event, component);
      });
      marker.addEventListener('click', (event) => {
        if (event.detail !== 0) return;
        inspectPoint(component.center, component);
      });
      return [marker];
    });
    replaceChildren(catalogOverlay, markers);
  }

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || pointerSession === undefined) return;
    event.preventDefault();
    cancelPointerSession(true);
  };
  document.addEventListener('keydown', onDocumentKeydown);

  semanticSelect.addEventListener('change', () => {
    state.semanticView = semanticSelect.value as SemanticView;
    const selected = SEMANTIC_VIEWS.find((view) => view.id === state.semanticView);
    semanticDescription.textContent = selected?.description ?? '';
    legend.update(state.semanticView);
    requestSemanticView();
  });

  qualitySelect.addEventListener('change', () => {
    state.qualityProfile = qualitySelect.value as QualityProfileId;
    const profile = currentQualityProfile();
    qualityDescription.textContent = profile.description;
    // Plan §4 recommended framing, driven by the profile's period policy
    // (never a hardcoded period/iteration count): the guaranteed systematic
    // budget plus the honest opportunistic caveat.
    showFeedback(`${profile.label} quality selected · ${describePeriodPolicy(profile.policy)}`);
    scheduleRender(true);
    if (state.selectedPoint) {
      inspectPoint(
        state.selectedPoint,
        COMPONENT_CATALOG.find((component) => component.id === state.selectedCatalogId),
      );
    }
  });

  function setInteractionMode(mode: InteractionMode): void {
    state.interactionMode = mode;
    panToolButton.setAttribute('aria-pressed', String(mode === 'pan'));
    regionToolButton.setAttribute('aria-pressed', String(mode === 'region'));
    canvasShell.classList.toggle('explorer--region-tool', mode === 'region');
    interactionHint.textContent =
      mode === 'region'
        ? 'Drag a box to zoom · click to inspect'
        : 'Drag to pan · Shift-drag to zoom area · click to inspect';
  }

  panToolButton.addEventListener('click', () => setInteractionMode('pan'));
  regionToolButton.addEventListener('click', () => setInteractionMode('region'));

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
    startPointerSession(event);
  });

  renderCanvas.addEventListener('pointermove', (event) => {
    if (pointerSession?.pointerId !== event.pointerId) return;
    const latest = canvasPoint(event);
    pointerSession.latest = latest;
    const rect = canvasStack.getBoundingClientRect();
    const dxCss = (latest.x - pointerSession.origin.x) * rect.width;
    const dyCss = (latest.y - pointerSession.origin.y) * rect.height;
    if (Math.hypot(dxCss, dyCss) > 3) state.dragging = true;
    if (!state.dragging) return;
    if (pointerSession.kind === 'region') {
      updateZoomSelection(pointerSession.origin, latest);
    } else {
      const size = dimensions();
      applyPresentationPreview(`translate3d(${dxCss}px, ${dyCss}px, 0)`);
      if (!pointerSession.feedbackMarked) {
        performance.mark('mi:interaction-feedback');
        pointerSession.feedbackMarked = true;
      }
      state.viewport = panViewport(
        pointerSession.viewport,
        size,
        dxCss * (size.width / rect.width),
        dyCss * (size.height / rect.height),
      );
      updateCoordinateReadout();
    }
  });

  const finishPointer = (event: PointerEvent): void => {
    if (pointerSession?.pointerId !== event.pointerId) return;
    if (renderCanvas.hasPointerCapture(event.pointerId)) {
      renderCanvas.releasePointerCapture(event.pointerId);
    }
    renderCanvas.classList.remove('explorer__canvas--grabbing');
    canvasShell.classList.remove('explorer--selecting');
    zoomSelection.removeAttribute('style');
    const session = pointerSession;
    if (state.dragging && session.kind === 'region') {
      const rect = canvasStack.getBoundingClientRect();
      const widthCss = Math.abs(session.latest.x - session.origin.x) * rect.width;
      const heightCss = Math.abs(session.latest.y - session.origin.y) * rect.height;
      if (widthCss >= MIN_REGION_SIZE_PX && heightCss >= MIN_REGION_SIZE_PX) {
        const size = dimensions();
        const next = zoomViewportToRect(session.viewport, size, {
          x1: session.origin.x * size.width,
          y1: session.origin.y * size.height,
          x2: session.latest.x * size.width,
          y2: session.latest.y * size.height,
        });
        if (next.spanY === session.viewport.spanY) {
          showFeedback(
            session.viewport.spanY <= MIN_SCALE
              ? 'Reached the current reliable zoom limit for this renderer and numerical budget.'
              : 'That selection already covers the current view.',
          );
        } else {
          const centerX = ((session.origin.x + session.latest.x) / 2) * 100;
          const centerY = ((session.origin.y + session.latest.y) / 2) * 100;
          applyPresentationPreview(
            `scale(${session.viewport.spanY / next.spanY})`,
            `${centerX}% ${centerY}%`,
          );
          performance.mark('mi:interaction-feedback');
          state.viewport = next;
          updateCoordinateReadout();
          showFeedback('Zoomed to selected area.');
          scheduleRender();
        }
      } else {
        inspectAt(session.latest);
      }
    } else if (state.dragging) {
      scheduleRender();
    } else if (session.catalogInspect) {
      inspectPoint(session.catalogInspect.center, session.catalogInspect);
    } else {
      inspectAt(canvasPoint(event));
    }
    pointerSession = undefined;
    state.dragging = false;
  };
  renderCanvas.addEventListener('pointerup', finishPointer);
  renderCanvas.addEventListener('pointercancel', () => {
    cancelPointerSession(false);
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
        applyPresentationPreview('translate3d(10%, 0, 0)');
        performance.mark('mi:interaction-feedback');
        state.viewport = panViewport(state.viewport, dimensions(), dimensions().width * 0.1, 0);
        scheduleRender();
        break;
      case 'ArrowRight':
        applyPresentationPreview('translate3d(-10%, 0, 0)');
        performance.mark('mi:interaction-feedback');
        state.viewport = panViewport(state.viewport, dimensions(), dimensions().width * -0.1, 0);
        scheduleRender();
        break;
      case 'ArrowUp':
        applyPresentationPreview('translate3d(0, 10%, 0)');
        performance.mark('mi:interaction-feedback');
        state.viewport = panViewport(state.viewport, dimensions(), 0, dimensions().height * 0.1);
        scheduleRender();
        break;
      case 'ArrowDown':
        applyPresentationPreview('translate3d(0, -10%, 0)');
        performance.mark('mi:interaction-feedback');
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

  function handleWorkerMessage(message: WorkerToMainMessage): void {
    switch (message.type) {
      case 'frame':
        presentFrame(message);
        break;
      case 'inspection':
        if (message.requestId !== state.activeInspectionRequestId) break;
        inspector.show(
          message.result,
          COMPONENT_CATALOG.find((component) => component.id === state.selectedCatalogId),
          currentQualityProfile(),
          formattedSelectedPoint(message.result.point),
        );
        selectedPointStatus.textContent = `Selected point c = ${formattedSelectedPoint(
          message.result.point,
        )}. Outcome: ${message.result.orbit.status.replace('-', ' ')}.`;
        break;
      case 'cancelled':
        performance.mark('mi:cancellation-acknowledged', {
          detail: { requestId: message.requestId },
        });
        if (message.requestId === state.cancelRequestedRequestId && state.cancelRequestedAtMs > 0) {
          renderTraces.recordCancellation(
            message.requestId,
            performance.now() - state.cancelRequestedAtMs,
          );
          state.cancelRequestedAtMs = 0;
          state.cancelRequestedRequestId = 0;
        }
        break;
      case 'error':
        break;
    }
  }

  const workerClient = new RendererWorkerClient(
    () =>
      new Worker(new URL('../worker/render.worker.ts', import.meta.url), {
        type: 'module',
        name: 'mandelbrot-renderer',
      }),
    {
      onMessage: handleWorkerMessage,
      onRecovering: () => {
        renderTraces.failOpenRequests();
        status.className = 'status status--working';
        statusText.textContent = 'Renderer interrupted. Recovering automatically…';
        retryRendererButton.hidden = true;
      },
      onPersistentFailure: () => {
        renderTraces.failOpenRequests();
        clearPresentationPreview();
        status.className = 'status status--error';
        statusText.textContent = 'Renderer could not recover. Controls remain available.';
        retryRendererButton.hidden = false;
      },
    },
  );
  retryRendererButton.addEventListener('click', () => {
    status.className = 'status status--working';
    statusText.textContent = 'Retrying renderer…';
    retryRendererButton.hidden = true;
    workerClient.retry();
  });
  if (import.meta.env.DEV) {
    window.__MI_PHASE1_TEST__ = {
      failRenderer: () => workerClient.simulateUnexpectedFailure(),
    };
  }

  const resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(canvasStack);
  scheduleRender(true);

  return () => {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    resizeObserver.disconnect();
    longTaskObserver?.disconnect();
    document.removeEventListener('keydown', onDocumentKeydown);
    workerClient.dispose();
    if (import.meta.env.DEV) delete window.__MI_PHASE1_TEST__;
    delete window.__miRenderTrace;
    perfHook = undefined;
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
    'Drag to pan; choose Zoom area or hold Shift to draw a zoom box',
    'Select a point to inspect the evidence',
    'Choose Quick, Balanced, or Detailed to change the numerical search budget',
  ]) {
    tips.append(element('li', { text: tip }));
  }
  const dismiss = button('Explore', { className: 'primary-button' });
  dismiss.addEventListener('click', () => {
    performance.mark('mi:guidance-interaction');
    root.classList.remove('guidance--visible');
  });
  const close = button('', {
    className: 'icon-button icon-button--quiet guidance__close',
    title: 'Dismiss guide',
  });
  setIcon(close, 'close');
  close.setAttribute('aria-label', 'Dismiss guide');
  close.addEventListener('click', () => {
    performance.mark('mi:guidance-interaction');
    root.classList.remove('guidance--visible');
  });
  root.append(close, heading, copy, tips, dismiss);
  return {
    element: root,
    show: () => root.classList.add('guidance--visible'),
  };
}

function createInspector(): {
  readonly element: HTMLElement;
  readonly loading: (coordinate: string, component?: CatalogComponent) => void;
  readonly show: (
    result: InspectionResult,
    component: CatalogComponent | undefined,
    quality: QualityProfile,
    coordinate: string,
  ) => void;
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
  const help = element('details', { className: 'measurement-help' });
  help.append(element('summary', { text: 'How to read these values' }));
  const definitions = element('dl');
  for (const [term, description] of [
    ['Detected period p', 'The number of iterations in one complete attracting cycle.'],
    [
      'Multiplier magnitude |λ|',
      'How much a nearby displacement shrinks after one complete cycle. Smaller means stronger attraction; values approaching 1 are weaker.',
    ],
    [
      'Multiplier angle arg λ',
      'How much that displacement rotates after one complete cycle. It is shown in degrees and encoded as hue plus stripe orientation in Multiplier view.',
    ],
    [
      'Stability exponent κ',
      'Attraction strength per iteration: κ = −ln|λ| / p. Larger values settle faster; ∞ marks a superattracting center.',
    ],
    [
      'Quality',
      'The numerical search budget. Quality systematically checks through the profile’s period ceiling within its iteration budget; higher periods may appear when independently found and verified, but unresolved still means no claim within that budget.',
    ],
  ] as const) {
    definitions.append(element('dt', { text: term }), element('dd', { text: description }));
  }
  help.append(definitions);
  root.append(heading, body, help);

  const clear = (): void => {
    replaceChildren(body, [
      element('p', {
        className: 'empty-state',
        text: 'Select a point in the image to examine its classification and supporting evidence.',
      }),
    ]);
  };

  const loading = (coordinate: string, component?: CatalogComponent): void => {
    replaceChildren(body, [
      component
        ? element('h3', {
            className: 'inspector__selection',
            text: component.label,
          })
        : undefined,
      element('p', {
        className: 'inspector__coordinate',
        text: `c = ${coordinate}`,
      }),
      element('p', { className: 'loading-line', text: 'Computing evidence…' }),
    ]);
  };

  const show = (
    result: InspectionResult,
    component: CatalogComponent | undefined,
    quality: QualityProfile,
    coordinate: string,
  ): void => {
    const orbit = result.orbit;
    const statusLabel: Record<typeof orbit.status, string> = {
      escaped: 'Escaped',
      'attracting-cycle': 'Attracting cycle',
      unresolved: 'Unresolved',
    };
    const badge = element('p', {
      className: `classification classification--${orbit.status} inspector__classification`,
      text: statusLabel[orbit.status],
    });
    const facts = element('dl', { className: 'facts' });
    const addFact = (term: string, value: string, valueClassName?: string): void => {
      facts.append(
        element('dt', { text: term }),
        element('dd', {
          ...(valueClassName ? { className: valueClassName } : {}),
          text: value,
        }),
      );
    };
    addFact('Parameter c', coordinate);
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
    addFact('Quality', `${quality.label} · ${describePeriodPolicy(quality.policy)}`);
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
      // Origin metadata (plan invariant 8): independently found higher
      // periods may be displayed only after verification and with their
      // origin. evidenceSource never changes acceptance or the quality
      // barrier — it names how the candidate was proposed.
      if (orbit.evidenceSource !== undefined) {
        addFact('Evidence source', formatEvidenceSource(orbit.evidenceSource));
      }
    }
    addFact(
      'Evidence',
      orbit.evidence.length > 0
        ? orbit.evidence.map(formatEvidence).join(', ')
        : 'No conclusive evidence at current quality',
      'inspector__evidence',
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
        text: `c = ${coordinate}`,
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

/**
 * Human labels for the evidenceSource vocabulary (src/domain/period-policy.ts).
 * The 'fallback' label names the systematic orbit scan honestly — it is what
 * ran — without suggesting a degraded or less trustworthy result: acceptance
 * was identical (the common verifier) regardless of origin.
 */
const EVIDENCE_SOURCE_LABELS: Readonly<Record<EvidenceSource, string>> = Object.freeze({
  analytic: 'Analytic closed form',
  checkpoint: 'Checkpoint schedule',
  catalog: 'Catalog seed',
  chart: 'Local chart prediction',
  algebraic: 'Algebraic relation',
  fallback: 'Systematic orbit scan',
});

function formatEvidenceSource(source: EvidenceSource): string {
  return EVIDENCE_SOURCE_LABELS[source];
}
