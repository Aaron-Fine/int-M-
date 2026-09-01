import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __MI_COMMIT_SHA__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/worker/**/*.test.ts',
      'poc/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**'],
    passWithNoTests: true,
    restoreMocks: true,
  },
});
