/**
 * Judge self-test candidates. Deliberately NOT in the registry; enabled only
 * by `npm run tournament -- ... --include-demo`.
 *
 * - baseline-clone: identical code to baseline (control; must PASS and its
 *   speedup CI must contain 1.0).
 * - demo-wrong-period: reports period + 1 for one attracting pixel (must FAIL).
 * - demo-semantic-ok: 'semantic-revision' candidate that converts the first
 *   unresolved pixel into an acceptance WITH a certificate and nudges one
 *   attracting multiplier inside its declared tolerance (must PASS and list
 *   the conversion). Its numbers are fabricated and exist only to exercise
 *   the judge.
 * - demo-semantic-no-certificate: same conversion without a certificate
 *   (must FAIL).
 */
import { productionCandidate } from './support';
import type { Candidate, CaseRenderSpec, RenderedFrame, SemanticFields } from './types';

const firstIndex = (status: Uint8Array, code: number): number => status.indexOf(code);

const withMutation = (
  inner: Candidate,
  extra: Pick<Candidate, 'id' | 'description'> & Partial<Candidate>,
  mutate: (fields: SemanticFields, spec: CaseRenderSpec) => void,
): Candidate => ({
  ...inner,
  ...extra,
  render: async (spec: CaseRenderSpec): Promise<RenderedFrame> => {
    const frame = await inner.render(spec);
    return {
      size: frame.size,
      colorize: (view) => frame.colorize(view),
      readFields: (): SemanticFields => {
        const fields = frame.readFields();
        mutate(fields, spec);
        return fields;
      },
    };
  },
});

const wrongPeriod = (): Candidate =>
  withMutation(
    productionCandidate({ id: 'inner', description: 'inner' }),
    { id: 'demo-wrong-period', description: 'DEMO (must fail): period + 1 for one pixel.' },
    (fields) => {
      const index = firstIndex(fields.status, 2);
      if (index >= 0) fields.period[index] = (fields.period[index] ?? 0) + 1;
    },
  );

const semantic = (withCertificate: boolean): Candidate => {
  const certificates = new Map<number, unknown>();
  const inner = productionCandidate({ id: 'inner', description: 'inner' });
  return {
    ...withMutation(
      inner,
      {
        id: withCertificate ? 'demo-semantic-ok' : 'demo-semantic-no-certificate',
        description: withCertificate
          ? 'DEMO (must pass): semantic-revision, one certified conversion.'
          : 'DEMO (must fail): semantic-revision conversion without a certificate.',
        parityPolicy: 'semantic-revision',
        tolerance: { multiplierMagnitude: { absolute: 1e-6 }, note: 'demo only' },
      },
      (fields) => {
        certificates.clear();
        const attracting = firstIndex(fields.status, 2);
        if (attracting >= 0) {
          fields.multiplierMagnitude[attracting] =
            (fields.multiplierMagnitude[attracting] ?? 0) + 5e-7;
        }
        const unresolved = firstIndex(fields.status, 0);
        if (unresolved >= 0) {
          fields.status[unresolved] = 2;
          fields.period[unresolved] = 1;
          fields.multiplierMagnitude[unresolved] = 0.5;
          fields.multiplierAngle[unresolved] = 0.25;
          certificates.set(unresolved, { kind: 'demo', note: 'fabricated self-test certificate' });
        }
      },
    ),
    ...(withCertificate ? { certificates: () => certificates } : {}),
  };
};

export const createDemoCandidates = (): readonly Candidate[] => [
  productionCandidate({
    id: 'baseline-clone',
    description: 'Control: identical to baseline (CI must contain 1.0).',
  }),
  wrongPeriod(),
  semantic(true),
  semantic(false),
];
