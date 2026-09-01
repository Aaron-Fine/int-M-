#!/usr/bin/env node
/**
 * CLI wrapper for the pure corpus validator (validate-corpus.ts, imported with
 * an explicit .ts extension so plain Node type stripping applies). Exits 1 and
 * prints one diagnostic per line when the corpus is invalid.
 *
 * Usage: node tools/benchmark/validate-corpus.mjs [path-to-corpus-json]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { validateCorpus } from './validate-corpus.ts';

const defaultCorpusPath = resolve(dirname(fileURLToPath(import.meta.url)), 'corpus.v1.json');
const corpusPath = resolve(process.argv[2] ?? defaultCorpusPath);

let corpus;
try {
  corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
} catch (error) {
  console.error(`Failed to read ${corpusPath}:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

const diagnostics = validateCorpus(corpus);
if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) console.error(`${corpusPath}: ${diagnostic}`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${corpusPath}: valid\n`);
}
