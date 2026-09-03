export * from './complex';
export {
  classifyInto,
  classifyOrbit,
  createOrbitSample,
  DEFAULT_ORBIT_OPTIONS,
  materializeOrbitResult,
  ORBIT_EVIDENCE_CODE,
  OrbitClassifier,
  resolveOrbitOptions,
  OrbitScratch,
} from './orbit';
export type { OrbitSample, OrbitStatusCode } from './orbit';
export {
  CHECKPOINT_CANDIDATE_BUDGET,
  CHECKPOINT_REVISION,
  classifyCheckpointInto,
  createCheckpointMetrics,
  createDifferentialStats,
  recordDifferentialInto,
  resetCheckpointMetrics,
  resetDifferentialStats,
} from './checkpoint';
export type { CheckpointMetrics, DifferentialStats } from './checkpoint';
export {
  classifyIntoInstrumented,
  createLegacyScanCounters,
  resetLegacyScanCounters,
} from './orbit-instrumented';
export type { LegacyScanCounters } from './orbit-instrumented';
export { PERIOD_BUCKET_COUNT, PERIOD_BUCKET_LABELS, periodBucketIndex } from './period-buckets';
export {
  defaultPeriodPolicyFor,
  deriveOpportunisticMaxPeriod,
  evidenceSourceForFlag,
  EVIDENCE_SOURCE_VALUES,
  PERIOD_POLICIES,
  PERIOD_POLICY_REVISION,
  resolvePeriodPolicy,
} from './period-policy';
export type { EvidenceSource, PeriodPolicy } from './period-policy';
export {
  TAU_CLOSURE_SCALED,
  VERIFIER_REVISION,
  VERIFIER_THRESHOLDS,
  VERIFIER_VERDICT,
  verifyCycle,
  verifyCycleInto,
} from './verifier';
export type { VerifierVerdict, VerifierVerdictCode, VerifierCycleTarget } from './verifier';
export {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  colorForUnresolved,
  modulateForMultiplierAngle,
} from './semantic';
export type { Rgba } from './semantic';
export type {
  AttractingCycleOrbitResult,
  ClassifierMode,
  Complex,
  EscapedOrbitResult,
  EvidenceFlag,
  MutableComplex,
  OrbitOptions,
  OrbitResult,
  OrbitStatus,
  RasterSize,
  RenderQuality,
  SemanticView,
  UnresolvedOrbitResult,
  Viewport,
} from './types';
export { CLASSIFIER_MODES } from './types';
export {
  clampViewport,
  complexToPixel,
  createViewportTransform,
  DEFAULT_VIEWPORT,
  MAX_MAGNIFICATION,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
  panViewport,
  pixelToComplex,
  validateRasterSize,
  zoomViewportAt,
  zoomViewportToRect,
} from './viewport';
export type { PixelRect, ViewportTransform } from './viewport';
