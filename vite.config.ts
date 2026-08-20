import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

const resolveCommitSha = (): string => {
  const fromEnv =
    process.env['CF_PAGES_COMMIT_SHA'] ?? process.env['GITHUB_SHA'] ?? process.env['COMMIT_SHA'];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  define: {
    __MI_COMMIT_SHA__: JSON.stringify(resolveCommitSha()),
  },
  build: {
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
});
