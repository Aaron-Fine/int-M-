import path from 'node:path';
import { defineConfig } from 'vite';

const browserDir = import.meta.dirname;
const repoRoot = path.resolve(browserDir, '../../..');

// Production-mode build of the microbench page plus the src/ modules it
// exercises (worker pool driver, classifier, row bands). Output goes straight
// into the shared dist/ outDir (gitignored) under poc-bench/ so it is served
// by the same vite preview instance as the production app bundle.
export default defineConfig({
  root: path.join(browserDir, 'fixtures'),
  base: '/poc-bench/',
  build: {
    outDir: path.join(repoRoot, 'dist', 'poc-bench'),
    emptyOutDir: true,
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
});
