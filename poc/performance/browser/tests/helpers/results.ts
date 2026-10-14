import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { format, resolveConfig } from 'prettier';

const browserDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(browserDir, '../../..');
export const resultsDir = path.join(browserDir, 'results');

/**
 * Machine-side facts from tools/benchmark/capture-environment.mjs (plan §9
 * environment manifest), reused here so the browser files carry the same
 * schema; browser-only fields are filled from the live page below.
 */
interface NodeEnvironment {
  readonly schemaVersion: number;
  readonly browser: Record<string, null>;
  readonly cpu: { readonly model: string | null; readonly cores: number };
  readonly memoryTotalBytes: number;
  readonly os: { readonly platform: string; readonly kernel: string };
  readonly revisions: Record<string, string | null>;
  readonly harness: Record<string, unknown>;
  readonly notes: readonly string[];
}

export interface EnvironmentFacts {
  readonly schemaVersion: number;
  readonly capturedAt: string;
  readonly browser: {
    readonly build: string | null;
    readonly engine: string | null;
    readonly headed: boolean;
    readonly powerMode: string | null;
    readonly devicePixelRatio: number;
    readonly viewport: { readonly width: number; readonly height: number };
  };
  readonly cpu: NodeEnvironment['cpu'];
  readonly memoryTotalBytes: number;
  readonly os: NodeEnvironment['os'];
  readonly revisions: NodeEnvironment['revisions'];
  readonly render: { readonly workerCount: number | null; readonly backend: string | null };
  readonly harness: NodeEnvironment['harness'];
  readonly hardwareConcurrency: number | null;
  readonly notes: readonly string[];
}

const captureNodeEnvironment = (): NodeEnvironment => {
  const result = spawnSync(process.execPath, ['tools/benchmark/capture-environment.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.stdout.length === 0) {
    throw new Error(`capture-environment.mjs failed: ${result.stderr || 'no output'}`);
  }
  return JSON.parse(result.stdout) as NodeEnvironment;
};

const capturePageFacts = async (
  page: Page,
): Promise<{
  readonly build: string | null;
  readonly engine: string;
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number | null;
}> => {
  const pageFacts = await page.evaluate(() => ({
    engine: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
  }));
  const browser = page.context().browser();
  return {
    build: browser?.version() ?? null,
    engine: pageFacts.engine,
    devicePixelRatio: pageFacts.devicePixelRatio,
    hardwareConcurrency: pageFacts.hardwareConcurrency,
  };
};

export const captureEnvironment = async (
  page: Page,
  render: { workerCount: number | null; backend: string },
): Promise<EnvironmentFacts> => {
  const nodeEnvironment = captureNodeEnvironment();
  const pageFacts = await capturePageFacts(page);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  return {
    schemaVersion: nodeEnvironment.schemaVersion,
    capturedAt: new Date().toISOString(),
    browser: {
      build: pageFacts.build,
      engine: pageFacts.engine,
      headed: false,
      powerMode: null,
      devicePixelRatio: pageFacts.devicePixelRatio,
      viewport,
    },
    cpu: nodeEnvironment.cpu,
    memoryTotalBytes: nodeEnvironment.memoryTotalBytes,
    os: nodeEnvironment.os,
    revisions: nodeEnvironment.revisions,
    render,
    harness: nodeEnvironment.harness,
    hardwareConcurrency: pageFacts.hardwareConcurrency,
    notes: [
      ...nodeEnvironment.notes,
      'Headless Chromium via Playwright; directional PoC evidence, not Stage A release evidence (plan §9 runs stable branded Chrome/Firefox on the declared target class).',
      'Power mode is not detectable from the page; browser.powerMode stays null.',
    ],
  };
};

export interface ResultsPayload<TSample, TSummary> {
  readonly environment: EnvironmentFacts;
  readonly samples: readonly TSample[];
  readonly summary: TSummary;
  readonly notes?: readonly string[];
}

export interface ResultsFile<TSample, TSummary> {
  readonly schemaVersion: 1;
  readonly measurement: string;
  readonly capturedAt: string;
  readonly environment: EnvironmentFacts;
  readonly samples: readonly TSample[];
  readonly summary: TSummary;
  readonly notes: readonly string[];
}

export const writeResults = async <TSample, TSummary>(
  measurement: string,
  payload: ResultsPayload<TSample, TSummary>,
): Promise<string> => {
  mkdirSync(resultsDir, { recursive: true });
  const file: ResultsFile<TSample, TSummary> = {
    schemaVersion: 1,
    measurement,
    capturedAt: new Date().toISOString(),
    environment: payload.environment,
    samples: payload.samples,
    summary: payload.summary,
    notes: payload.notes ?? [],
  };
  // Committed results files are prettier-checked; emit repo-configured JSON.
  const prettierOptions = (await resolveConfig(path.join(repoRoot, 'package.json'))) ?? {};
  const rendered = await format(JSON.stringify(file), { ...prettierOptions, parser: 'json' });
  const target = path.join(resultsDir, `${measurement}.json`);
  writeFileSync(target, rendered);
  return target;
};
