/**
 * Region-select chain planner for the B-gate build-vs-build runner
 * (`run-b-gate.mjs`).
 *
 * The pre-PR-2 baseline build has no `?view=` benchmark parameter and no
 * `__miRenderTrace` hook: the only way to reach an arbitrary corpus view
 * through its real UI is the pointer-driven region-select zoom
 * (`zoomViewportToRect` in src/domain/viewport.ts) plus the pan drag
 * (`panViewport`). This module plans a chain of synthetic pointer steps that
 * lands the default startup viewport on a target corpus view, and computes the
 * exact viewport each step should produce according to the application's own
 * viewport math, so the runner can verify what landed.
 *
 * Design constraints (all mirrored from the application sources):
 * - `zoomViewportToRect` clamps the rect to the raster, takes
 *   `factor = max(w/W, h/H)`, and sets `spanY *= factor` (region select only
 *   zooms in); the new center is derived from the rect midpoint.
 * - The UI requires a rect of at least `MIN_REGION_SIZE_PX` (12 CSS px) on
 *   both edges and only applies it after a >3 px drag, so every planned rect
 *   fraction f must satisfy `f >= max(minRectPx/W, minRectPx/H)` and rect
 *   edges must stay inside the raster.
 * - A pan drag moves the center by exact pixel deltas at the current span.
 * - All arithmetic replicates src/domain/viewport.ts (pre-PR-2 and current
 *   copies are identical for these functions; unit-tested against the
 *   application source itself).
 *
 * Chain precision: expectations are exact functions of the rect pixel
 * coordinates the runner sends; pointer-event coordinate quantization in the
 * browser is the only deviation channel and is verified per sample by the
 * runner (achieved viewport read from the app, compared against the chain's
 * final expectation).
 */

export const DEFAULT_START_VIEWPORT = Object.freeze({
  center: Object.freeze({ re: -0.75, im: 0 }),
  spanY: 2.5,
});

/** Mirrors src/domain/viewport.ts (both builds). */
export const MAX_VIEWPORT_SPAN_Y = 4;
export const MIN_VIEWPORT_SPAN_Y = 2.5 / 6_000_000;

/** Mirrors MIN_REGION_SIZE_PX in src/ui/application.ts (both builds). */
export const MIN_REGION_SIZE_PX = 12;

const clampViewport = (viewport) => ({
  center: viewport.center,
  spanY: Math.min(MAX_VIEWPORT_SPAN_Y, Math.max(MIN_VIEWPORT_SPAN_Y, viewport.spanY)),
});

/**
 * Exact replica of zoomViewportToRect from src/domain/viewport.ts (identical
 * in the pre-PR-2 and current trees; verified by the unit tests against the
 * application source itself).
 */
export const zoomViewportToRect = (viewport, size, rect) => {
  for (const [name, value] of Object.entries(rect)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be finite`);
    }
  }
  const left = Math.max(0, Math.min(size.width, Math.min(rect.x1, rect.x2)));
  const right = Math.max(0, Math.min(size.width, Math.max(rect.x1, rect.x2)));
  const top = Math.max(0, Math.min(size.height, Math.min(rect.y1, rect.y2)));
  const bottom = Math.max(0, Math.min(size.height, Math.max(rect.y1, rect.y2)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    throw new RangeError('zoom rectangle must have positive width and height');
  }
  const bounded = clampViewport(viewport);
  const factor = Math.max(width / size.width, height / size.height);
  const spanY = Math.max(MIN_VIEWPORT_SPAN_Y, bounded.spanY * factor);
  if (spanY === bounded.spanY) return bounded;
  const spanX = bounded.spanY * (size.width / size.height);
  return {
    center: {
      re: bounded.center.re + ((left + right) / 2 / size.width - 0.5) * spanX,
      im: bounded.center.im - ((top + bottom) / 2 / size.height - 0.5) * bounded.spanY,
    },
    spanY,
  };
};

/**
 * Exact replica of panViewport from src/domain/viewport.ts. `dx`/`dy` are
 * raster pixels; dragging content right (+dx) moves the center left.
 */
export const panViewport = (viewport, size, deltaXPixels, deltaYPixels) => {
  const bounded = clampViewport(viewport);
  const unitsPerPixel = bounded.spanY / size.height;
  return {
    center: {
      re: bounded.center.re - deltaXPixels * unitsPerPixel,
      im: bounded.center.im + deltaYPixels * unitsPerPixel,
    },
    spanY: bounded.spanY,
  };
};

const clampAbs = (value, limit) => Math.sign(value) * Math.min(Math.abs(value), limit);

/**
 * Plans the pointer chain from `start` (default viewport) to `target`
 * (`{ re, im, spanY }` plain numbers, parsed once from the corpus decimal
 * strings).
 *
 * Returns `{ steps, finalViewport }` where each step is either
 * `{ kind: 'pan', deltaPx: { dx, dy }, viewportAfter }` or
 * `{ kind: 'region', rect: { x1, y1, x2, y2 }, viewportAfter }` with rect
 * coordinates in raster pixels. The runner maps raster pixels to client
 * coordinates through the live canvas-stack rect. Pan steps are only planned
 * when the target center is unreachable by region selection alone (region
 * rects must stay inside the raster), and always precede the zoom steps —
 * region steps re-derive the center exactly, so pan quantization cannot
 * survive them.
 */
/** Verifies a landed viewport against its target (span + center). */
const assertLanded = (landed, target) => {
  const spanError = Math.abs(landed.spanY - target.spanY) / target.spanY;
  const centerError = Math.max(
    Math.abs(landed.center.re - target.re),
    Math.abs(landed.center.im - target.im),
  );
  if (spanError > 1e-9 || centerError > target.spanY * 1e-6) {
    throw new Error(
      `chain failed to land on the target: landed spanY=${landed.spanY} ` +
        `center=${landed.center.re},${landed.center.im} (target ${target.spanY} ` +
        `${target.re},${target.im})`,
    );
  }
  return landed;
};

/** Pan drag length in raster pixels for a desired center at the current span. */
const panPx = (current, desiredCenter, size) => {
  const unitsPerPixel = current.spanY / size.height;
  return {
    dx: (current.center.re - desiredCenter.re) / unitsPerPixel,
    dy: (desiredCenter.im - current.center.im) / unitsPerPixel,
  };
};

/**
 * Phase 2 state machine: given the remaining span fraction and center offsets,
 * decide the next chain action (land / pan / intermediate zoom). Returns
 * `{ action: 'land' | 'pan' | 'zoom', f?, desiredCenter?, error? }`.
 */
const nextAction = (current, target, fMin, minPanPx, size) => {
  const fFinal = target.spanY / current.spanY;
  const spanX = current.spanY * (size.width / size.height);
  const allowRe = (0.5 - fFinal / 2) * spanX;
  const allowIm = (0.5 - fFinal / 2) * current.spanY;
  const reachable =
    Math.abs(target.re - current.center.re) <= allowRe &&
    Math.abs(target.im - current.center.im) <= allowIm;
  if (fFinal >= fMin && fFinal < 1 && reachable) {
    return { action: 'land', f: fFinal };
  }
  const sameSpan = Math.abs(fFinal - 1) < Number.EPSILON;
  if (fFinal >= fMin && (sameSpan || !reachable)) {
    // The span is (nearly) at target or the center is out of reach at every
    // feasible fraction: only a pan drag can close the remaining gap.
    const { dx, dy } = panPx(current, target, size);
    if (Math.abs(dx) < minPanPx && Math.abs(dy) < minPanPx) {
      if (sameSpan) return { action: 'done' };
      throw new Error(
        `planner bug: unreachable center but pan is tiny (${dx.toFixed(1)}, ${dy.toFixed(1)}) px`,
      );
    }
    return { action: 'pan' };
  }
  const f = Math.min(0.5, Math.max(fFinal, fMin * 2));
  if (!(f >= fMin && f < 1)) {
    throw new Error(`chain stalled at spanY=${current.spanY} (target ${target.spanY})`);
  }
  return {
    action: 'zoom',
    f,
    allowRe: (0.5 - f / 2) * spanX,
    allowIm: (0.5 - f / 2) * current.spanY,
  };
};

export const planRegionChain = ({
  target,
  size,
  start = DEFAULT_START_VIEWPORT,
  minRectPx = MIN_REGION_SIZE_PX,
  maxSteps = 64,
}) => {
  for (const name of ['re', 'im', 'spanY']) {
    if (!Number.isFinite(target[name])) throw new RangeError(`target.${name} must be finite`);
  }
  if (target.spanY <= 0) throw new RangeError('target.spanY must be positive');
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    throw new RangeError('raster dimensions must be integers');
  }
  if (minRectPx <= 0) throw new RangeError('minRectPx must be positive');

  const W = size.width;
  const H = size.height;
  const fMin = Math.max(minRectPx / W, minRectPx / H);

  let current = clampViewport({
    center: { re: start.center.re, im: start.center.im },
    spanY: start.spanY,
  });

  if (target.spanY > current.spanY + 1e-15) {
    // Region selection only zooms in (factor = max(w/W, h/H) <= 1); corpus
    // views never exceed the default span, so this is a caller bug.
    throw new RangeError(
      `target spanY ${target.spanY} exceeds the start span ${current.spanY}; region select cannot zoom out`,
    );
  }

  const steps = [];

  // Pan gestures start at the canvas center; a drag endpoint must stay well
  // inside the window (browsers clamp/lose pointer events at window edges),
  // so each drag moves at most maxPanPx per axis.
  const maxPanPx = Math.floor(Math.min(W, H) / 2) - 40;

  const pushPan = (desiredCenter) => {
    const total = panPx(current, desiredCenter, size);
    const chunkCount = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(total.dx), Math.abs(total.dy)) / maxPanPx),
    );
    const dx = total.dx / chunkCount;
    const dy = total.dy / chunkCount;
    for (let index = 0; index < chunkCount; index += 1) {
      const next = panViewport(current, size, dx, dy);
      steps.push({
        kind: 'pan',
        deltaPx: { dx, dy },
        viewportAfter: { center: { ...next.center }, spanY: next.spanY },
      });
      current = next;
    }
  };

  const pushRegion = (desiredCenter, f) => {
    const spanX = current.spanY * (W / H);
    const w = f * W;
    const h = f * H;
    let midX = W * (0.5 + (desiredCenter.re - current.center.re) / spanX);
    let midY = H * (0.5 - (desiredCenter.im - current.center.im) / current.spanY);
    midX = Math.min(W - w / 2, Math.max(w / 2, midX));
    midY = Math.min(H - h / 2, Math.max(h / 2, midY));
    const rect = { x1: midX - w / 2, y1: midY - h / 2, x2: midX + w / 2, y2: midY + h / 2 };
    const next = zoomViewportToRect(current, size, rect);
    steps.push({
      kind: 'region',
      rect,
      viewportAfter: { center: { ...next.center }, spanY: next.spanY },
    });
    current = next;
  };

  // Minimum pan drag in raster pixels: the UI treats a short drag as a click
  // (point inspection), so tiny pans are pointless as well as unsafe.
  const minPanPx = 8;

  // Phase 1: if the target center is farther than the maximum region-select
  // reach at the start span, pan straight onto it. Region steps re-derive the
  // center from the rect afterwards, so pan pointer quantization does not
  // propagate into the landed view.
  const reachRe = (0.5 - fMin / 2) * current.spanY * (W / H);
  const reachIm = (0.5 - fMin / 2) * current.spanY;
  if (
    Math.abs(target.re - current.center.re) > reachRe ||
    Math.abs(target.im - current.center.im) > reachIm
  ) {
    pushPan({ re: target.re, im: target.im });
  }

  // Phase 2: zoom steps toward the target.
  while (steps.length < maxSteps) {
    const decision = nextAction(current, target, fMin, minPanPx, size);
    if (decision.action === 'done') {
      return { steps, finalViewport: { center: { ...current.center }, spanY: current.spanY } };
    }
    if (decision.action === 'pan') {
      pushPan({ re: target.re, im: target.im });
      continue;
    }
    if (decision.action === 'land') {
      pushRegion({ re: target.re, im: target.im }, decision.f);
      return {
        steps,
        finalViewport: assertLanded(
          { center: { ...current.center }, spanY: current.spanY },
          target,
        ),
      };
    }
    pushRegion(
      {
        re: current.center.re + clampAbs(target.re - current.center.re, decision.allowRe),
        im: current.center.im + clampAbs(target.im - current.center.im, decision.allowIm),
      },
      decision.f,
    );
  }
  throw new Error(`region chain exceeded ${maxSteps} steps (target ${JSON.stringify(target)})`);
};
