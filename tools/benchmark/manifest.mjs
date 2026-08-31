#!/usr/bin/env node
/**
 * SHA-256 manifest emitter for an evidence directory (performance plan §10).
 * Walks the directory, hashes every file, and writes manifest.sha256 with one
 * `sha256sum`-compatible line per file: "<hex>  <relative-path>", LF-separated,
 * relative paths in ascending code-unit order with '/' separators. The
 * manifest file itself is excluded. --check re-verifies and exits non-zero on
 * any hash mismatch, missing file, or extra file.
 *
 * Usage: node tools/benchmark/manifest.mjs [--check] <directory>
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MANIFEST_NAME = 'manifest.sha256';

const args = process.argv.slice(2);
const check = args.includes('--check');
const directory = path.resolve(args.find((arg) => arg !== '--check') ?? '');
if (args.length === 0) {
  process.stderr.write('usage: node tools/benchmark/manifest.mjs [--check] <directory>\n');
  process.exit(2);
}

/** Relative POSIX-style paths of every file below the directory, sorted. */
const collectFiles = (dir, prefix = '') => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.join(dir, entry.name), relative));
    } else if (entry.isFile() && relative !== MANIFEST_NAME) {
      files.push(relative);
    }
  }
  return files.sort();
};

const digestOf = (file) =>
  createHash('sha256').update(readFileSync(path.join(directory, file))).digest('hex');

const relativeFiles = collectFiles(directory);

if (check) {
  let expected;
  try {
    expected = readFileSync(path.join(directory, MANIFEST_NAME), 'utf8');
  } catch {
    process.stderr.write(`${MANIFEST_NAME} not found in ${directory}\n`);
    process.exit(1);
  }
  const actual = new Map(relativeFiles.map((file) => [file, digestOf(file)]));
  const problems = [];
  const seen = new Set();
  for (const line of expected.split('\n')) {
    if (line.trim() === '') continue;
    const separator = line.indexOf('  ');
    if (separator === -1) {
      problems.push(`malformed line: ${line}`);
      continue;
    }
    const hash = line.slice(0, separator);
    const file = line.slice(separator + 2);
    seen.add(file);
    const actualHash = actual.get(file);
    if (actualHash === undefined) {
      problems.push(`missing file: ${file}`);
    } else if (actualHash !== hash) {
      problems.push(`hash mismatch: ${file}`);
    }
  }
  for (const file of actual.keys()) {
    if (!seen.has(file)) problems.push(`extra file: ${file}`);
  }
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`${directory}: ${actual.size} files verified\n`);
  process.exit(0);
}

const manifest = relativeFiles.map((file) => `${digestOf(file)}  ${file}`).join('\n');
const rendered = relativeFiles.length === 0 ? '' : `${manifest}\n`;
writeFileSync(path.join(directory, MANIFEST_NAME), rendered);
process.stdout.write(rendered);
