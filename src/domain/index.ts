export * from './complex';
export {
  classifyPeriodThreeInto,
  PERIOD_THREE_ALLOWANCE_COEFFICIENT,
  PERIOD_THREE_ANALYTIC_REVISION,
} from './analytic-period-three';
export type { PeriodThreeTarget } from './analytic-period-three';
export {
  classifyPeriodFourInto,
  PERIOD_FOUR_ANALYTIC_REVISION,
  PERIOD_FOUR_EVALUATION_BOUND,
} from './analytic-period-four';
export type { PeriodFourCertificate, PeriodFourTarget } from './analytic-period-four';
export {
  AIRPLANE_BOX,
  inPeriodThreeGate,
  PERIOD_THREE_BOXES,
  PERIOD_THREE_HULL,
  RABBIT_BOX,
} from './period-three-gate';
export type { PeriodThreeBox } from './period-three-gate';
export {
  classifyAnalyticInto,
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
  classifyTriggeredOrbitInto,
  TRIGGERED_SCAN_INTERVAL_FIRST,
  TRIGGERED_SCAN_INTERVAL_MAX,
} from './orbit-triggered';
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
  stabilityExponentOf,
  VERIFIER_VERDICT,
  verifyCycle,
  verifyCycleInto,
} from './verifier';
export type { VerifierVerdict, VerifierVerdictCode, VerifierCycleTarget } from './verifier';
export {
  buildPeriodKey,
  colorForPeriod,
  dimChannel,
  dimColor,
  EMPTY_PERIOD_KEY,
  ISOLATION_DIM_FACTOR,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_LIMIT,
  PERIOD_EMPHASIS_PALETTE,
} from './period-emphasis';
export type { PeriodKey, PeriodKeyEntry } from './period-emphasis';
export {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  colorForUnresolved,
  ESCAPE_BAND_RATE,
  modulateForMultiplierAngle,
  modulateForMultiplierDirection,
  MULTIPLIER_STRIPE_AMPLITUDE,
  MULTIPLIER_STRIPE_FREQUENCY,
  UNRESOLVED_TEXTURE_OFFSET,
  unresolvedTextureColors,
} from './semantic';
export type { Rgba } from './semantic';
export type {
  AttractingCycleOrbitResult,
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
