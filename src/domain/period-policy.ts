import type { EvidenceFlag } from './types';

/**
 * Period policy vocabulary (plan section 4 "Period policy buckets",
 * workstream D, PR 5). It separates two claims that the legacy single
 * `maxPeriod` knob conflated:
 *
 * - The SYSTEMATIC ceiling (`systematicMaxPeriod`) is the period range a
 *   quality profile deliberately searches within its orbit budget
 *   (`maxIterations`). Quality describes this guaranteed search budget —
 *   nothing more (plan invariant 8: "Quality describes the guaranteed
 *   search budget; independently found higher periods may be displayed
 *   only after verification and with origin metadata").
 * - The OPPORTUNISTIC ceiling (`opportunisticMaxPeriod`) is the highest
 *   period allowed from an independent candidate source, subject to the
 *   same common-verifier acceptance and bounded cost. It is derived
 *   policy, NOT a coverage claim: the UI must never imply exhaustive
 *   classification up to it (plan section 4: "not marketed as guaranteed
 *   coverage").
 *
 * PR 5 ships the vocabulary, the versioned per-profile values, and the
 * display language. It implements no candidate sources: the classification
 * core still runs exactly one systematic lag scan, so no code path reads
 * `opportunisticMaxPeriod` yet. PR 4 (checkpoint candidates) owns the first
 * candidate source and the first consumer; the policy is designed so that
 * raising the opportunistic ceiling cannot alter `maxIterations`, the
 * systematic scan, or any acceptance threshold (pinned by
 * tests/unit/domain/period-policy.test.ts, invariant 8 section).
 *
 * This module is configuration, not acceptance policy: acceptance remains
 * the frozen common verifier (src/domain/verifier.ts, `src-verifier-1.0.0`).
 * A period policy revision bump is required when the derivation below
 * changes or a profile's ceilings change; it is independent of the verifier
 * revision by design (candidate plumbing must never leak into acceptance
 * semantics — workstream D kill condition).
 */

/**
 * How a candidate was PROPOSED (plan section 4 evidenceSource table). Pure
 * origin metadata: it never feeds confidence, acceptance, or the quality
 * barrier — the common verifier decides acceptance identically for every
 * source (plan invariant 2), and this field must never be consulted as if
 * it did not.
 *
 * Current mapping in src/ (documented per plan section 4's table):
 *
 * - 'analytic'  — the closed-form main-cardioid / period-2-bulb fast paths
 *   (evidence flags 'analytic-main-cardioid' / 'analytic-period-2-bulb').
 *   Bucket 1–2 in the plan's operational table ("closed-form tests").
 * - 'fallback'  — the classifyInto lag scan. The scan is today's ONLY
 *   non-analytic proposal mechanism: it is the systematic search itself,
 *   and in the plan's vocabulary it is the fallback path — the full-lag
 *   detector that schedule-based candidates (PR 4 checkpoint) will fall
 *   back to at exhaustion and that runs alone until such sources ship.
 *   Mapping the scan to 'fallback' is the honest choice: it is not a
 *   candidate source, and renaming it would overstate today's plumbing.
 * - 'checkpoint' / 'catalog' / 'chart' / 'algebraic' — reserved for PR 4+
 *   candidate sources (checkpoint schedule; loaded catalog/patch or session
 *   atlas; local chart/DE-style predictor; low-period algebraic relation).
 *   No src/ path emits them yet.
 */
export type EvidenceSource =
  'analytic' | 'checkpoint' | 'catalog' | 'chart' | 'algebraic' | 'fallback';

/** The plan section 4 evidenceSource vocabulary, pinned for tests and docs. */
export const EVIDENCE_SOURCE_VALUES: readonly EvidenceSource[] = Object.freeze([
  'analytic',
  'checkpoint',
  'catalog',
  'chart',
  'algebraic',
  'fallback',
]);

/**
 * Maps the orbit classifier's evidence flags to their proposal origin at the
 * rich result boundary. Total over EvidenceFlag: the two closed-form flags
 * are 'analytic'; everything else that can reach an attracting result is the
 * lag scan, i.e. 'fallback'. (Escape/iteration-limit flags never reach an
 * attracting result; they map to 'fallback' for totality, not because an
 * escape proposes candidates.)
 *
 * Consequence pinned by tests: 'analytic' is reachable ONLY from the
 * closed-form paths. Any future opportunistic hit — a period above the
 * systematic ceiling proposed by a non-analytic source — therefore carries
 * evidenceSource !== 'analytic' by construction, while acceptance (and the
 * quality barrier) stays the verifier's alone.
 */
export const evidenceSourceForFlag = (flag: EvidenceFlag): EvidenceSource =>
  flag === 'analytic-main-cardioid' || flag === 'analytic-period-2-bulb' ? 'analytic' : 'fallback';

/**
 * Versioned period policy for a quality profile. `revision` changes when the
 * derivation or the profile values change; results and caches of the future
 * (workstream O cross-profile carryover) key on it instead of guessing.
 */
export interface PeriodPolicy {
  readonly revision: string;
  /** Periods the profile deliberately searches within `maxIterations`. */
  readonly systematicMaxPeriod: number;
  /**
   * Highest period allowed from an independent candidate source, subject to
   * the same common-verifier acceptance. Not guaranteed coverage; nothing
   * may present it as such.
   */
  readonly opportunisticMaxPeriod: number;
  /** Maximum orbit work, independent of either period ceiling. */
  readonly maxIterations: number;
}

/**
 * Revision of the initial policy values below (plan section 4 table).
 * Distinct from the verifier revision on purpose: this revision governs
 * search-budget vocabulary, verifier revision governs acceptance.
 */
export const PERIOD_POLICY_REVISION = 'period-policy-1.0.0';

/**
 * Opportunistic-ceiling derivation, revision `period-policy-1.0.0`: equal to
 * the systematic ceiling, because src/ has no independent candidate source
 * yet — claiming an opportunistic ceiling above the systematic one before a
 * source exists would market coverage nobody delivers. When PR 4+ ships a
 * candidate source, this derivation becomes source-aware (session-atlas
 * content, experiment limits, loaded catalog/patch support) under a new
 * policy revision.
 */
export const deriveOpportunisticMaxPeriod = (systematicMaxPeriod: number): number =>
  systematicMaxPeriod;

/**
 * Initial per-profile policies (plan section 4 initial values; the
 * systematic ceilings and iteration budgets equal today's profile
 * constants, so policy-aware resolution is behavior-identical to legacy).
 */
export const PERIOD_POLICIES: Readonly<Record<'quick' | 'balanced' | 'detailed', PeriodPolicy>> =
  Object.freeze({
    quick: Object.freeze({
      revision: PERIOD_POLICY_REVISION,
      systematicMaxPeriod: 16,
      opportunisticMaxPeriod: deriveOpportunisticMaxPeriod(16),
      maxIterations: 256,
    }),
    balanced: Object.freeze({
      revision: PERIOD_POLICY_REVISION,
      systematicMaxPeriod: 32,
      opportunisticMaxPeriod: deriveOpportunisticMaxPeriod(32),
      maxIterations: 512,
    }),
    detailed: Object.freeze({
      revision: PERIOD_POLICY_REVISION,
      systematicMaxPeriod: 64,
      opportunisticMaxPeriod: deriveOpportunisticMaxPeriod(64),
      maxIterations: 1024,
    }),
  });

/**
 * Derives the default policy for arbitrary operative budgets: the
 * systematic ceiling and iteration budget are the operative ones, and the
 * opportunistic ceiling follows the documented derivation. This is what
 * OrbitOptions resolution attaches when no explicit policy is supplied, so
 * every resolved classification carries honest policy metadata without any
 * caller change.
 */
export const defaultPeriodPolicyFor = (
  maxIterations: number,
  systematicMaxPeriod: number,
): PeriodPolicy => ({
  revision: PERIOD_POLICY_REVISION,
  systematicMaxPeriod,
  opportunisticMaxPeriod: deriveOpportunisticMaxPeriod(systematicMaxPeriod),
  maxIterations,
});

/**
 * Validates an explicit policy against the operative classification budgets.
 * The policy is a description of the search, so it must agree with the
 * budgets it describes: a mismatch is a configuration error (RangeError),
 * never silently reconciled — that would let a policy claim a budget the
 * classifier does not run (guarantee ambiguity). The opportunistic ceiling
 * must be at least the systematic one: below it would forbid periods the
 * systematic search itself reaches. Raising it is allowed and is exactly
 * the PR 4+ seam; until a candidate source reads it, it changes nothing.
 */
export const resolvePeriodPolicy = (
  policy: PeriodPolicy,
  operative: { readonly maxIterations: number; readonly maxPeriod: number },
): PeriodPolicy => {
  if (
    typeof policy.revision !== 'string' ||
    policy.revision.length === 0 ||
    !Number.isInteger(policy.systematicMaxPeriod) ||
    policy.systematicMaxPeriod < 1 ||
    !Number.isInteger(policy.opportunisticMaxPeriod) ||
    policy.opportunisticMaxPeriod < 1 ||
    !Number.isInteger(policy.maxIterations) ||
    policy.maxIterations < 1
  ) {
    throw new RangeError('period policy fields must be positive integers with a nonempty revision');
  }
  if (policy.opportunisticMaxPeriod < policy.systematicMaxPeriod) {
    throw new RangeError('opportunisticMaxPeriod cannot be below systematicMaxPeriod');
  }
  if (
    policy.systematicMaxPeriod !== operative.maxPeriod ||
    policy.maxIterations !== operative.maxIterations
  ) {
    throw new RangeError('period policy must match the operative maxPeriod and maxIterations');
  }
  return policy;
};
