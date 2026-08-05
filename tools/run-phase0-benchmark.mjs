import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, firefox } from 'playwright';

const execFileAsync = promisify(execFile);

const baseUrl = process.env.PHASE0_BASE_URL ?? 'http://127.0.0.1:5173/';
const executablePath =
  process.env.PHASE0_BROWSER_EXECUTABLE ?? process.env.PHASE0_CHROMIUM_EXECUTABLE;
const outputPath = process.env.PHASE0_OUTPUT ?? 'phase0-benchmark.json';
const browserName = process.env.PHASE0_BROWSER ?? 'chromium';

if (!executablePath) throw new Error('Set PHASE0_BROWSER_EXECUTABLE to the browser binary.');

if (browserName !== 'chromium' && browserName !== 'firefox') {
  throw new Error('PHASE0_BROWSER must be chromium or firefox.');
}
const browserType = browserName === 'firefox' ? firefox : chromium;
const browser = await browserType.launch({
  executablePath,
  headless: process.env.PHASE0_HEADLESS === '1',
});

try {
  const { stdout: fixtureJson } = await execFileAsync('python3', [
    'tools/generate_perturbation_fixture.py',
  ]);
  const perturbationFixture = JSON.parse(fixtureJson);
  const context = await browser.newContext(browserName === 'firefox' ? { viewport: null } : {});
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(500);
  const result = await page.evaluate(async (fixture) => {
    const module = await import('/tools/phase0-browser-benchmark.ts');
    return module.runPhase0Benchmarks(fixture);
  }, perturbationFixture);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  await writeFile(outputPath, json, 'utf8');
  process.stdout.write(json);
} finally {
  await browser.close();
}
