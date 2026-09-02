import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';

const browserDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(browserDir, '../../..');
const port = 4178;

const appConfigFile = path.join(repoRoot, 'vite.config.ts');
const microbenchConfigFile = path.join(browserDir, 'vite.microbench.config.ts');
const pocBenchDistDir = path.join(repoRoot, 'dist', 'poc-bench');

const log = (message) => {
  process.stderr.write(`[poc-browser] ${message}\n`);
};

const timed = async (label, fn) => {
  const started = performance.now();
  await fn();
  log(`${label} in ${Math.round(performance.now() - started)}ms`);
};

// The app build empties dist/ first; the microbench build then adds poc-bench/.
await timed('production bundle (vite build -> dist/)', () =>
  build({ root: repoRoot, configFile: appConfigFile, logLevel: 'warn' }),
);
await timed('microbench bundle (vite build -> dist/poc-bench)', () =>
  build({ configFile: microbenchConfigFile, logLevel: 'warn' }),
);
log(`microbench assets at ${pocBenchDistDir}`);

const server = await preview({
  root: repoRoot,
  configFile: appConfigFile,
  preview: { host: '127.0.0.1', port, strictPort: true },
});
log(`vite preview serving ${path.join(repoRoot, 'dist')} at http://127.0.0.1:${port}`);

const shutdown = () => {
  server.httpServer.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => undefined, 60_000);
