#!/usr/bin/env node
/**
 * Emits the environment.json skeleton required for every normative evidence
 * run (performance plan §9). Run in Node to fill machine-side facts; the
 * browser-only fields stay explicit nulls and are filled by the harness during
 * browser runs. No dependencies beyond the Node standard library.
 *
 * Usage: node tools/benchmark/capture-environment.mjs [--out <path>] [--note <text>]
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(import.meta.dirname, '../..');

const args = process.argv.slice(2);
const readOption = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const outPath = readOption('--out');
const notes = args.flatMap((arg, index) => (arg === '--note' ? [args[index + 1] ?? ''] : []));

const sha256File = (relativePath) => {
  try {
    return createHash('sha256')
      .update(readFileSync(path.join(repoRoot, relativePath)))
      .digest('hex');
  } catch {
    return null;
  }
};

const gitRevision = async () => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const buildRevision = await gitRevision();
const generatedNotes = [];
if (buildRevision === null) {
  generatedNotes.push(
    'git revision unavailable (git missing or not a repository); build/algorithm revisions are null.',
  );
}
generatedNotes.push(
  'Captured in Node; browser.* and render.* fields are placeholders to fill during browser runs.',
);
if (notes.length > 0) generatedNotes.push(...notes);

const environment = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  browser: {
    // Brand and full build number, e.g. "Chrome 141.0.7390.54".
    build: null,
    // Rendering engine identifier, e.g. the userAgent or Gecko/WebView revision.
    engine: null,
    headed: null,
    powerMode: null,
    devicePixelRatio: null,
    viewport: null,
  },
  cpu: {
    model: os.cpus()[0]?.model?.trim() ?? null,
    cores: os.cpus().length,
  },
  memoryTotalBytes: os.totalmem(),
  os: {
    platform: `${os.type()} ${os.platform()}`,
    kernel: os.release(),
  },
  revisions: {
    build: buildRevision,
    algorithm: buildRevision,
    catalog: sha256File('catalog/components.v1.json'),
    verifier: sha256File('fixtures/orbits.v1.json'),
  },
  render: {
    workerCount: null,
    backend: null,
  },
  harness: {
    command: ['node', ...process.argv.slice(1)].join(' '),
    version: JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version ?? null,
    node: process.version,
  },
  notes: generatedNotes,
};

const rendered = `${JSON.stringify(environment, null, 2)}\n`;
if (outPath !== undefined) {
  writeFileSync(path.resolve(outPath), rendered);
  process.stdout.write(`${path.resolve(outPath)}\n`);
} else {
  process.stdout.write(rendered);
}
