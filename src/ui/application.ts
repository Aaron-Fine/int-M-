import type { Complex, EvidenceFlag, EvidenceSource } from '../domain';
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
import coreUrl from '../../catalog/core.v1.bin?url';
import coreManifest from '../../catalog/core.v1.json';
import {
  CATALOG,
  COMPONENT_CATALOG,
  catalogNames,
  type CatalogComponent,
} from '../catalog/components';
import { mergeCatalog } from '../catalog/core';
import { catalogGroups, zoomSpanFor } from '../catalog/navigation';
import { createCatalogIndex } from '../catalog/viewport-index';
import { loadCatalogCore } from './catalog-core-client';
import { createCatalogPanel } from './catalog-panel';
import { angledAddressChain } from './angled-address';
import { referencesLine } from './references';
import { button, element, replaceChildren } from './dom';
import { setIcon } from './icons';
import { planMarkers } from './marker-density';
import { createSemanticLegend } from './semantic-legend';
import {
  addressBarSearch,
  isEncodableShareState,
  issuesNotice,
  resolveStartupState,
  shareLink,
} from './share-link';
import { encodeShareState } from './share-state';
import type { ShareSelection, ShareState } from './share-state';
import {
  DEFAULT_VIEWPORT,
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
  frameDelivery,
  viewKeyHash,
  type RenderTrace,
} from './worker-timing-marks';

interface ApplicationState {
  viewport: Viewport;
  semanticView: SemanticView;
  /** Period isolated from the legend (MI-UX-018): a palette input, never in the cache key. */
  isolatedPeriod?: number | undefined;
  catalogVisible: boolean;
  requestId: number;
  activeRequestId: number;
  /** Viewport the active render request was made for. */
  activeRequestViewport?: Viewport | undefined;
  /** Viewport of the frame on screen: the overlay is planned from it, not from the target. */
  presentedViewport?: Viewport | undefined;
  activeInspectionRequestId: number;
  frameStage: 'none' | 'coarse' | 'stable';
  dragging: boolean;
  interactionMode: InteractionMode;
  qualityProfile: QualityProfileId;
  selectedPoint?: Complex;
  selectedCatalogId?: string;
  /** A link's generated entry (period 5 to 12) awaiting the catalog core (ADR 0014). */
  pendingCatalogId?: string;
  requestStartedAtMs: number;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

type InteractionMode = 'pan' | 'region';
const RENDER_DELAY_MS = 65;
/** Quiet time after a settled view before the address bar records it (ADR 0009). */
const URL_WRITE_DELAY_MS = 500;
const LABEL_MAGNIFICATION_THRESHOLD = 2;
const MIN_REGION_SIZE_PX = 12;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Marker outlines in a 24-unit box: a triangle for period 3, a diamond for period 4. */
const MARKER_POLYGONS: Readonly<Record<number, string>> = Object.freeze({
  3: '12,4 20.5,19 3.5,19',
  4: '12,2.5 21.5,12 12,21.5 2.5,12',
});
const ZOOM_LIMIT_MESSAGE =
  'Reached the current reliable zoom limit for this renderer and numerical budget.';

declare global {
  interface Window {
    __MI_PHASE1_TEST__?: {
      failRenderer(): void;
    };
    /**
     * Opt-in (?perf=1) render-trace diagnostic boundary, performance plan §8.
     * Absent unless requested; exposes the bounded ring's snapshot, the most
     * recently completed trace and the live viewport for the evidence
     * harnesses.
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
  // The starting view (ADR 0009): a v1 share link, else the benchmark
  // harness's opt-in parameters (plan §8/§9), else the defaults. `perf=1`
  // enables the render-trace hook in every case.
  const startup = resolveStartupState(window.location.search);
  let perfHook: NonNullable<Window['__miRenderTrace']> | undefined;
  const renderTraces = createRenderTraceRing({
    ...(startup.perfEnabled
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
    viewport: { ...startup.viewport },
    semanticView: startup.semanticView,
    catalogVisible: true,
    requestId: 0,
    activeRequestId: 0,
    activeInspectionRequestId: 0,
    frameStage: 'none',
    dragging: false,
    interactionMode: 'pan',
    qualityProfile: startup.qualityProfile,
    requestStartedAtMs: 0,
  };
  if (startup.perfEnabled) {
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
  semanticSelect.value = state.semanticView;
  const semanticDescription = element('p', {
    className: 'control-description',
    text: semanticViewDescription(state.semanticView),
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
    title: 'Show or hide the catalog markers on the image',
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
  const copyLinkButton = button('', {
    className: 'icon-button',
    title: 'Copy a link to this view',
  });
  setIcon(copyLinkButton, 'link', 'Copy link');
  copyLinkButton.setAttribute('aria-label', 'Copy link to this view');
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
  // Always in the document so that filling it is announced; empty, it takes
  // no space (styles.css `.link-notice:empty`).
  const linkNotice = element('div', {
    className: 'link-notice',
    attributes: {
      role: 'status',
      'aria-label': 'Link notice',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });

  const guidance = createGuidance();
  const inspector = createInspector();
  const legend = createSemanticLegend();
  legend.update(state.semanticView);
  const catalogPanel = createCatalogPanel({
    groups: catalogGroups(COMPONENT_CATALOG),
    onActivate: (component) => {
      activateCatalogEntry(component);
    },
    onShowView: () => {
      canvasShell.scrollIntoView({ block: 'start' });
    },
  });
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
  controlActions.append(pointerToolGroup, catalogToggle, zoomGroup, resetButton, copyLinkButton);
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
  sidePanel.append(inspector.element, legend.element, catalogPanel.element);

  const workspace = element('main', { className: 'workspace' });
  const primary = element('div', { className: 'primary' });
  primary.append(linkNotice, controls, canvasShell);
  workspace.append(primary, sidePanel);

  replaceChildren(host, [header, workspace, guidance.element]);
  updateCoordinateReadout();

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
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

  function showLinkNotice(message: string): void {
    const dismiss = button('Dismiss', { className: 'link-notice__dismiss' });
    dismiss.setAttribute('aria-label', 'Dismiss link notice');
    dismiss.addEventListener('click', () => {
      linkNotice.replaceChildren();
      renderCanvas.focus();
    });
    linkNotice.replaceChildren(
      element('p', { className: 'link-notice__text', text: message }),
      dismiss,
    );
  }

  function currentSelection(): ShareSelection | undefined {
    const catalogId = state.selectedCatalogId ?? state.pendingCatalogId;
    if (catalogId !== undefined) return { kind: 'catalog', id: catalogId };
    return state.selectedPoint === undefined
      ? undefined
      : { kind: 'point', point: state.selectedPoint };
  }

  function currentShareState(): ShareState {
    return {
      viewport: state.viewport,
      semanticView: state.semanticView,
      qualityProfile: state.qualityProfile,
      selection: currentSelection(),
    };
  }

  function replaceAddressBar(): void {
    const shareState = currentShareState();
    // Panning is unbounded: a non-finite view cannot be encoded, so the
    // address keeps its last settled value rather than throwing.
    if (!isEncodableShareState(shareState)) return;
    const search = addressBarSearch(window.location.search, shareState);
    if (search === window.location.search) return;
    history.replaceState(
      history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }

  // The query the page opened with: a refused or adjusted link stays in the
  // address bar until the view differs from it.
  const openedQuery = encodeShareState(startup);

  /**
   * Records the view in the address bar once it has settled (ADR 0009):
   * `replaceState`, so Back still leaves the explorer, and never mid-drag or
   * while a newer render is pending, whose stable frame reschedules this.
   */
  function scheduleUrlWrite(): void {
    if (urlTimer !== undefined) clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      urlTimer = undefined;
      if (pointerSession !== undefined || renderTimer !== undefined) return;
      if (state.frameStage !== 'stable') return;
      // A link that was refused or adjusted stays in the address bar, beside
      // its notice, until the view differs from the one the page opened with.
      if (
        startup.notice !== undefined &&
        isEncodableShareState(currentShareState()) &&
        encodeShareState(currentShareState()) === openedQuery
      ) {
        return;
      }
      replaceAddressBar();
    }, URL_WRITE_DELAY_MS);
  }

  /**
   * Copies the v1 link for the current view. The shared link never carries
   * `perf` or foreign parameters. Without clipboard access (an insecure
   * origin, a denied permission) the address bar is brought up to date
   * instead, so the link is still one step away.
   */
  async function copyShareLink(): Promise<void> {
    const shareState = currentShareState();
    // A non-finite view cannot be encoded: say so instead of throwing.
    if (!isEncodableShareState(shareState)) {
      showFeedback('Could not create a link for this view.');
      return;
    }
    const link = shareLink(window.location.origin, window.location.pathname, shareState);
    try {
      await navigator.clipboard.writeText(link);
      showFeedback('Link to this view copied.');
    } catch {
      replaceAddressBar();
      showFeedback(
        'Could not copy automatically. The address bar now shows the link to this view.',
      );
    }
  }

  /** Applies the link's notice and selection; needs the worker client. */
  function restoreFromLink(): void {
    const notice = startup.notice;
    if (notice !== undefined) {
      // Filled after mount: screen readers announce changes to a live
      // region, not the content it starts with.
      noticeTimer = setTimeout(() => {
        showLinkNotice(notice);
      }, 0);
    }
    const selection = startup.selection;
    if (selection?.kind === 'point') {
      inspectPoint(selection.point);
    } else if (selection?.kind === 'catalog') {
      const component = lookupCatalog(selection.id);
      // Only a well-formed period 5 to 12 id decodes without an entry (share-state.ts).
      if (component) inspectPoint(component.center, component);
      else state.pendingCatalogId = selection.id;
    }
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
        remPx() <= 22,
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
      renderTraces.requestCancellation(state.activeRequestId, performance.now());
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
    state.activeRequestViewport = state.viewport;
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
      ...(state.semanticView === 'period' && state.isolatedPeriod !== undefined
        ? { isolatedPeriod: state.isolatedPeriod }
        : {}),
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

  /** Writes the render status only when it changes, so a recolor is not re-announced. */
  function showRenderStatus(text: string): void {
    if (statusText.textContent !== text) statusText.textContent = text;
  }

  function presentFrame(frame: FrameMessage): void {
    if (frame.requestId !== state.activeRequestId) return;
    state.presentedViewport = state.activeRequestViewport;

    const pixels = new ImageData(frame.rgba, frame.width, frame.height);
    renderCanvas.width = frame.width;
    renderCanvas.height = frame.height;
    canvasContext.imageSmoothingEnabled = false;
    canvasContext.putImageData(pixels, 0, 0);
    state.frameStage = frame.stage;
    canvasShell.toggleAttribute('data-isolated-period', frame.isolatedPeriod !== undefined);
    if (frame.isolatedPeriod !== undefined) {
      canvasShell.dataset['isolatedPeriod'] = String(frame.isolatedPeriod);
    }
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
      renderTraces.recordFrame(
        frame,
        frameDelivery(frame, performance.now() - state.requestStartedAtMs),
      );
    });

    if (frame.stage === 'coarse') {
      showRenderStatus(`Refining view · ${Math.round(frame.progress * 100)}%`);
    } else {
      requestCatalogCore();
      status.className = 'status status--ready';
      showRenderStatus('Stable frame');
      presentationCanvas.width = frame.width;
      presentationCanvas.height = frame.height;
      presentationContext.drawImage(renderCanvas, 0, 0);
      scheduleUrlWrite();
    }
    // Last, because the legend can synchronously start an isolation recolor
    // (a new request), which must not find this frame's dataset written over
    // its own. The period key ranks this frame (coarse and stable can
    // differ); show the mapping of the raster on screen, never a stale one.
    if (state.semanticView === 'period') legend.update('period', frame.periodKey, frame.stage);
  }

  function zoom(direction: 'in' | 'out', anchor: CanvasPoint = { x: 0.5, y: 0.5 }): void {
    const factor = direction === 'in' ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const requestedScale = state.viewport.spanY * factor;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, requestedScale));
    if (nextScale === state.viewport.spanY) {
      showFeedback(
        direction === 'in' ? ZOOM_LIMIT_MESSAGE : 'Already showing the complete Mandelbrot set.',
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
    // A pan or area selection still in progress would otherwise resume from its saved view.
    cancelPointerSession(false);
    state.viewport = {
      center: { ...DEFAULT_VIEWPORT.center },
      spanY: DEFAULT_VIEWPORT.spanY,
    };
    delete state.selectedPoint;
    delete state.selectedCatalogId;
    delete state.pendingCatalogId;
    // A reply for the point just cleared must not re-select it (ids start at 1).
    state.activeInspectionRequestId = 0;
    inspector.clear();
    selectedPointStatus.textContent = 'No point selected.';
    clearPresentationPreview();
    updateCatalogOverlay();
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
    delete state.pendingCatalogId;
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
    updateCatalogOverlay();
    updateSelectedPointMarker();
    scheduleUrlWrite();
  }

  /** Zooms to a catalog entry and selects it: the catalog panel's action (MI-UX-020). */
  function activateCatalogEntry(component: CatalogComponent): void {
    cancelPointerSession(false);
    clearPresentationPreview();
    state.viewport = { center: { ...component.center }, spanY: zoomSpanFor(component) };
    updateCoordinateReadout();
    inspectPoint(component.center, component);
    showFeedback(`Zoomed to ${component.label}.`);
    catalogPanel.confirm(component);
    scheduleRender(true);
  }

  /** One live button per shown catalog component, keyed by catalog id. */
  const catalogMarkers = new Map<string, HTMLButtonElement>();
  /**
   * The density policy queries the index on every frame (ADR 0012). It holds
   * the curated entries until the core arrives, then all 4,016 (ADR 0014).
   */
  let catalogIndex = createCatalogIndex(COMPONENT_CATALOG);
  let catalogByName = catalogNames(COMPONENT_CATALOG);
  let catalogCoreRequested = false;

  /** The loaded entry with this id or alias. */
  function lookupCatalog(idOrAlias: string | undefined): CatalogComponent | undefined {
    return idOrAlias === undefined ? undefined : catalogByName.get(idOrAlias);
  }

  /** The merged index, names and new panel groups; throws on an inconsistent core. */
  function buildCatalogCore(components: readonly CatalogComponent[]) {
    const merged = mergeCatalog(COMPONENT_CATALOG, components);
    return {
      index: createCatalogIndex(merged),
      names: catalogNames(merged),
      groups: catalogGroups(merged).filter((group) => group.period > CATALOG.maxPeriod),
    };
  }

  /**
   * Hands the core over once the worker has verified it: the index, the
   * panel's periods 5 to 12, and a link's pending selection (ADR 0014).
   */
  function adoptCatalogCore(components: readonly CatalogComponent[]): void {
    // Build everything first: a throw here leaves the state untouched and is a failed load.
    let built: ReturnType<typeof buildCatalogCore>;
    try {
      built = buildCatalogCore(components);
    } catch (error) {
      onCatalogCoreFailure(error);
      return;
    }
    const { index, names, groups } = built;
    catalogIndex = index;
    catalogByName = names;
    catalogPanel.addGroups(groups);
    catalogPanel.setCoreState('ready');
    const pending = state.pendingCatalogId;
    delete state.pendingCatalogId;
    const component = lookupCatalog(pending);
    if (component) inspectPoint(component.center, component);
    else if (pending !== undefined) showLinkNotice(issuesNotice(['selection']));
    updateCatalogOverlay();
  }

  function onCatalogCoreFailure(reason: unknown): void {
    console.error('catalog core:', reason);
    catalogPanel.setCoreState('failed');
    if (state.pendingCatalogId === undefined) return;
    delete state.pendingCatalogId;
    showLinkNotice(
      'This link names a catalog component from periods 5 to 12, which could not be loaded, so nothing is selected.',
    );
  }

  /** Loads periods 5 to 12 off the main thread, after the first stable frame (MI-PERF-003). */
  function requestCatalogCore(): void {
    if (catalogCoreRequested) return;
    catalogCoreRequested = true;
    loadCatalogCore({ url: coreUrl, manifest: coreManifest })
      .then(adoptCatalogCore, onCatalogCoreFailure)
      // A throw after the hand-over has committed is a bug, not a failed load.
      .catch((error: unknown) => {
        console.error('catalog core hand-over:', error);
      });
  }

  /** "Airplane, period 3"; a generated label already starts with its period. */
  function markerName(component: CatalogComponent): string {
    return component.label.startsWith(`Period ${component.period},`)
      ? component.label
      : `${component.label}, period ${component.period}`;
  }

  /**
   * Outline glyph for a marker, one shape per low period (circle, square, triangle, diamond;
   * circles beyond period 4), drawn twice: a dark halo under a white outline (styles.css).
   */
  function markerGlyph(period: number): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'catalog-marker__dot');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const role of ['halo', 'shape'] as const) {
      const shape = markerShape(period);
      shape.setAttribute('class', `catalog-marker__${role}`);
      svg.append(shape);
    }
    return svg;
  }

  function setSvgAttributes(target: SVGElement, attributes: Record<string, string>): void {
    for (const [name, value] of Object.entries(attributes)) target.setAttribute(name, value);
  }

  function markerShape(period: number): SVGElement {
    if (period === 2) {
      const square = document.createElementNS(SVG_NS, 'rect');
      setSvgAttributes(square, { x: '5', y: '5', width: '14', height: '14', rx: '2' });
      return square;
    }
    const polygon = MARKER_POLYGONS[period];
    if (polygon !== undefined) {
      const shape = document.createElementNS(SVG_NS, 'polygon');
      shape.setAttribute('points', polygon);
      return shape;
    }
    const circle = document.createElementNS(SVG_NS, 'circle');
    setSvgAttributes(circle, { cx: '12', cy: '12', r: '7.5' });
    return circle;
  }

  function createCatalogMarker(component: CatalogComponent): HTMLButtonElement {
    const marker = button('', {
      className: `catalog-marker catalog-marker--period-${component.period}`,
      title: markerName(component),
    });
    marker.dataset['catalogId'] = component.id;
    marker.setAttribute('aria-label', `Inspect ${markerName(component)}`);
    marker.append(
      markerGlyph(component.period),
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
    return marker;
  }

  /** CSS pixels per rem: marker and label sizes are set in rem (styles.css). */
  function remPx(): number {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  /**
   * Shows the markers the density policy chooses (src/ui/marker-density.ts):
   * at most 40, lowest periods first, in catalog order. Moves the existing
   * buttons instead of rebuilding them on every frame. A rebuilt button drops
   * keyboard focus and vanishes under a pointer or a test between two reads.
   * Stale buttons are removed first so the survivors keep their order and
   * never move (moving a focused node blurs it).
   */
  function updateCatalogOverlay(): void {
    // The panel's mark must follow the selection even while the markers are hidden.
    catalogPanel.setSelected(state.selectedCatalogId);
    if (!state.catalogVisible) {
      catalogMarkers.clear();
      catalogOverlay.replaceChildren();
      return;
    }
    const rect = canvasStack.getBoundingClientRect();
    // The 1 px floor only matters before layout, while the canvas is 0x0.
    const plan = planMarkers({
      index: catalogIndex,
      // The frame on screen, so markers stay registered to the image until a new one arrives.
      viewport: state.presentedViewport ?? state.viewport,
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      remPx: remPx(),
      selectedId: state.selectedCatalogId,
    });
    const visible: HTMLButtonElement[] = [];
    for (const planned of plan.markers) {
      const { component } = planned;
      let marker = catalogMarkers.get(component.id);
      if (marker === undefined) {
        marker = createCatalogMarker(component);
        catalogMarkers.set(component.id, marker);
      }
      marker.classList.toggle('catalog-marker--left-facing', planned.leftFacing);
      marker.classList.toggle('catalog-marker--compact', planned.compact);
      marker.classList.toggle('catalog-marker--label-hidden', !planned.labelVisible);
      marker.style.left = `${planned.x * 100}%`;
      marker.style.top = `${planned.y * 100}%`;
      visible.push(marker);
    }
    for (const [id, marker] of catalogMarkers) {
      if (!visible.includes(marker)) catalogMarkers.delete(id);
    }
    for (const child of [...catalogOverlay.children]) {
      if (!visible.includes(child as HTMLButtonElement)) child.remove();
    }
    let cursor = catalogOverlay.firstElementChild;
    for (const marker of visible) {
      if (marker === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        catalogOverlay.insertBefore(marker, cursor);
      }
    }
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

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (pointerSession !== undefined) {
      // An active pan or selection keeps Escape for itself.
      event.preventDefault();
      cancelPointerSession(true);
      return;
    }
    // Otherwise Escape anywhere restores a pressed legend isolation.
    if (!event.defaultPrevented) legend.restore();
  };
  document.addEventListener('keydown', onDocumentKeydown);

  // Legend isolation recolors the frame on screen, silently: the status line
  // is a live region, and the legend's aria-pressed state is the
  // announcement. The legend resets isolation on a view change before the
  // new view is requested.
  legend.onIsolate((period) => {
    state.isolatedPeriod = period;
    if (state.semanticView !== 'period') return;
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    requestRender();
  });

  semanticSelect.addEventListener('change', () => {
    state.semanticView = semanticSelect.value as SemanticView;
    semanticDescription.textContent = semanticViewDescription(state.semanticView);
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
      inspectPoint(state.selectedPoint, lookupCatalog(state.selectedCatalogId));
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
  copyLinkButton.addEventListener('click', () => {
    void copyShareLink();
  });
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
              ? ZOOM_LIMIT_MESSAGE
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

  /** One arrow-key pan of a tenth of the view; the image moves by (sx, sy) steps. */
  function panByKey(sx: number, sy: number): void {
    applyPresentationPreview(`translate3d(${sx * 10}%, ${sy * 10}%, 0)`);
    performance.mark('mi:interaction-feedback');
    const size = dimensions();
    state.viewport = panViewport(
      state.viewport,
      size,
      sx * size.width * 0.1,
      sy * size.height * 0.1,
    );
    scheduleRender();
  }

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
        panByKey(1, 0);
        break;
      case 'ArrowRight':
        panByKey(-1, 0);
        break;
      case 'ArrowUp':
        panByKey(0, 1);
        break;
      case 'ArrowDown':
        panByKey(0, -1);
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
          lookupCatalog(state.selectedCatalogId),
          currentQualityProfile(),
          formattedSelectedPoint(message.result.point),
        );
        selectedPointStatus.textContent = `Selected point c = ${formattedSelectedPoint(
          message.result.point,
        )}. Outcome: ${message.result.orbit.status.replace('-', ' ')}.`;
        break;
      case 'cancel-ack':
        performance.mark('mi:cancellation-acknowledged', {
          detail: { requestId: message.requestId },
        });
        renderTraces.recordCancellationAck(message.requestId, performance.now());
        break;
      case 'cancelled':
        performance.mark('mi:cancellation-quiesced', {
          detail: { requestId: message.requestId },
        });
        renderTraces.recordCancellationQuiesced(message.requestId, performance.now());
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
        requestCatalogCore();
      },
    },
  );
  retryRendererButton.addEventListener('click', () => {
    status.className = 'status status--working';
    statusText.textContent = 'Retrying renderer…';
    retryRendererButton.hidden = true;
    workerClient.retry();
  });
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    window.__MI_PHASE1_TEST__ = {
      failRenderer: () => workerClient.simulateUnexpectedFailure(),
    };
  }

  const resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(canvasStack);
  scheduleRender(true);
  restoreFromLink();

  return () => {
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    if (urlTimer !== undefined) clearTimeout(urlTimer);
    if (noticeTimer !== undefined) clearTimeout(noticeTimer);
    resizeObserver.disconnect();
    longTaskObserver?.disconnect();
    document.removeEventListener('keydown', onDocumentKeydown);
    workerClient.dispose();
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') delete window.__MI_PHASE1_TEST__;
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
  const hide = (): void => {
    performance.mark('mi:guidance-interaction');
    root.classList.remove('guidance--visible');
  };
  dismiss.addEventListener('click', hide);
  const close = button('', {
    className: 'icon-button icon-button--quiet guidance__close',
    title: 'Dismiss guide',
  });
  setIcon(close, 'close');
  close.setAttribute('aria-label', 'Dismiss guide');
  close.addEventListener('click', hide);
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

  const annotation = (component: CatalogComponent | undefined): HTMLElement | undefined =>
    component?.annotation === undefined
      ? undefined
      : element('p', { className: 'inspector__annotation', text: component.annotation });

  const head = (coordinate: string, component: CatalogComponent | undefined) => [
    component
      ? element('h3', {
          className: 'inspector__selection',
          text: component.label,
        })
      : undefined,
    annotation(component),
    referencesLine(component?.references),
    element('p', {
      className: 'inspector__coordinate',
      text: `c = ${coordinate}`,
    }),
  ];

  const loading = (coordinate: string, component?: CatalogComponent): void => {
    replaceChildren(body, [
      ...head(coordinate, component),
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
    const addFact = (term: string, value: string | Node, valueClassName?: string): void => {
      const description = element('dd', valueClassName ? { className: valueClassName } : {});
      description.append(value);
      facts.append(element('dt', { text: term }), description);
    };
    addFact('Parameter c', coordinate);
    if (component) {
      addFact('Catalog period', String(component.period));
      addFact('Internal address', component.internalAddress.join(' → '));
      if (component.angledInternalAddress) {
        addFact('Angled internal address', angledAddressChain(component.angledInternalAddress));
      }
      if (component.characteristicRays) {
        addFact(
          'Parameter ray pair',
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
        addFact('Evidence source', formatEvidenceSource(orbit.evidenceSource, orbit.evidence));
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
      ...head(coordinate, component),
      badge,
      facts,
      orbit.status === 'attracting-cycle'
        ? componentLens(orbit.period, orbit.multiplierMagnitude, orbit.multiplierAngle)
        : undefined,
    ]);
  };

  clear();
  return { element: root, loading, show, clear };
}

const LENS_TICKS: readonly (readonly [number, number])[] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
];

/**
 * The component lens (UI review, Proposal B): every hyperbolic component is
 * a copy of the unit disk through its multiplier λ. Draws that disk with the
 * |λ| rings and internal rays of the multiplier view's contours, the p/q
 * points where child components attach, and the inspected point's λ. Built
 * from the inspection's |λ| and arg λ only; no orbit work on this thread.
 */
function componentLens(period: number, magnitude: number, angle: number): HTMLElement {
  const svgElement = (name: string, attributes: Record<string, string>): SVGElement => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const radius = 64;
  const svg = svgElement('svg', {
    class: 'lens__disk',
    viewBox: '-100 -100 200 200',
    role: 'img',
    'aria-label': `Multiplier disk of this period-${period} component: λ at |λ| ${magnitude.toFixed(3)}, ${((angle * 180) / Math.PI).toFixed(1)}°`,
  });
  svg.append(svgElement('circle', { class: 'lens__fill', r: String(radius) }));
  for (const ring of [0.25, 0.5, 0.75]) {
    svg.append(svgElement('circle', { class: 'lens__ring', r: String(radius * ring) }));
  }
  svg.append(svgElement('circle', { class: 'lens__edge', r: String(radius) }));
  const point = (r: number, theta: number): [number, number] => [
    r * Math.cos(theta),
    -r * Math.sin(theta),
  ];
  for (const [p, q] of LENS_TICKS) {
    const theta = (2 * Math.PI * p) / q;
    const [x, y] = point(radius, theta);
    svg.append(
      svgElement('circle', { class: 'lens__tick', cx: x.toFixed(2), cy: y.toFixed(2), r: '2.5' }),
    );
    if (q <= 4) {
      const [lx, ly] = point(radius + 16, theta);
      const label = svgElement('text', {
        class: 'lens__label',
        x: lx.toFixed(2),
        y: ly.toFixed(2),
      });
      label.textContent = `${p}/${q}`;
      svg.append(label);
    }
  }
  const [rootX, rootY] = point(radius + 18, 0);
  const root = svgElement('text', {
    class: 'lens__label',
    x: rootX.toFixed(2),
    y: rootY.toFixed(2),
  });
  root.textContent = 'root';
  svg.append(root);
  const [edgeX, edgeY] = point(radius, angle);
  svg.append(
    svgElement('line', {
      class: 'lens__ray',
      x1: '0',
      y1: '0',
      x2: edgeX.toFixed(2),
      y2: edgeY.toFixed(2),
    }),
  );
  const [lambdaX, lambdaY] = point(radius * Math.min(1, magnitude), angle);
  svg.append(
    svgElement('circle', {
      class: 'lens__lambda',
      cx: lambdaX.toFixed(2),
      cy: lambdaY.toFixed(2),
      r: '5',
    }),
  );

  const figure = element('figure', { className: 'lens' });
  figure.append(
    element('h3', { className: 'eyebrow', text: 'Component lens' }),
    svg,
    element('figcaption', {
      className: 'lens__caption',
      text: 'This component as the disk of its multiplier λ: the dot is this point; rings are |λ| = ¼, ½, ¾; p/q marks where child components attach. The multiplier view draws the same rings and rays.',
    }),
  );
  return figure;
}

function semanticViewDescription(view: SemanticView): string {
  return SEMANTIC_VIEWS.find((candidate) => candidate.id === view)?.description ?? '';
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
 * ran — without suggesting a degraded or less trustworthy result: orbit-path
 * acceptances go through the common verifier and the analytic paths (the
 * closed forms of periods 1-3 and the certified period-4 solve) accept by its
 * attraction margin; neither is a weaker claim.
 */
const EVIDENCE_SOURCE_LABELS: Readonly<Record<EvidenceSource, string>> = Object.freeze({
  analytic: 'Analytic closed form', // periods 1-3; period 4 is labelled in formatEvidenceSource
  checkpoint: 'Checkpoint schedule',
  catalog: 'Catalog seed',
  chart: 'Local chart prediction',
  algebraic: 'Algebraic relation',
  fallback: 'Systematic orbit scan',
});

/** The period-4 solve is certified, not a closed form (ADR 0013 Decision 5). */
function formatEvidenceSource(source: EvidenceSource, evidence: readonly EvidenceFlag[]): string {
  if (source === 'analytic' && evidence.includes('analytic-period-4-component')) {
    return 'Certified analytic solve';
  }
  return EVIDENCE_SOURCE_LABELS[source];
}
