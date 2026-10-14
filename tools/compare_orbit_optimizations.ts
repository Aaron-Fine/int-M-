import { OrbitClassifier, createOrbitSample, createViewportTransform } from '../src/domain';

const cases = [
  { id: 'full-set', center: { re: -0.75, im: 0 }, spanY: 2.5 },
  { id: 'rabbit', center: { re: -0.12, im: 0.74 }, spanY: 0.35 },
  { id: 'seahorse', center: { re: -0.7435, im: 0.1314 }, spanY: 0.002 },
  { id: 'real-boundary', center: { re: -1.75, im: 0 }, spanY: 0.03 },
];
const reports = [];
for (const viewport of cases) {
  for (const maxIterations of [48, 128, 512]) {
    const scan = new OrbitClassifier({
      maxIterations,
      maxPeriod: 32,
      classifierMode: 'legacy-scan',
    });
    const checkpoint = new OrbitClassifier({
      maxIterations,
      maxPeriod: 32,
      classifierMode: 'checkpoint',
    });
    const scanSample = createOrbitSample();
    const checkpointSample = createOrbitSample();
    const transform = createViewportTransform(viewport, { width: 160, height: 120 });
    let statusDifferences = 0;
    let periodDifferences = 0;
    let maxMagnitudeDifference = 0;
    let maxDirectionDifference = 0;
    let firstDifference:
      | {
          point: { re: number; im: number };
          scanStatus: number;
          checkpointStatus: number;
          scanPeriod: number;
          checkpointPeriod: number;
        }
      | undefined;
    for (let y = 0; y < 120; y += 1) {
      for (let x = 0; x < 160; x += 1) {
        const point = transform.pixelToComplex(x, y);
        scan.classifyInto(point.re, point.im, scanSample);
        checkpoint.classifyInto(point.re, point.im, checkpointSample);
        if (
          firstDifference === undefined &&
          (scanSample.status !== checkpointSample.status ||
            scanSample.period !== checkpointSample.period)
        ) {
          firstDifference = {
            point,
            scanStatus: scanSample.status,
            checkpointStatus: checkpointSample.status,
            scanPeriod: scanSample.period,
            checkpointPeriod: checkpointSample.period,
          };
        }
        if (scanSample.status !== checkpointSample.status) statusDifferences += 1;
        if (scanSample.period !== checkpointSample.period) periodDifferences += 1;
        if (scanSample.status === 2 && checkpointSample.status === 2) {
          maxMagnitudeDifference = Math.max(
            maxMagnitudeDifference,
            Math.abs(scanSample.multiplierMagnitude - checkpointSample.multiplierMagnitude),
          );
          if (
            scanSample.multiplierMagnitude > 1e-6 &&
            checkpointSample.multiplierMagnitude > 1e-6
          ) {
            maxDirectionDifference = Math.max(
              maxDirectionDifference,
              Math.abs(scanSample.multiplierAngle - checkpointSample.multiplierAngle),
            );
          }
        }
      }
    }
    reports.push({
      id: viewport.id,
      maxIterations,
      samples: 19200,
      statusDifferences,
      periodDifferences,
      maxMagnitudeDifference,
      maxDirectionDifference,
      firstDifference,
    });
  }
}
process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
