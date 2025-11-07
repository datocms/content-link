import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setupEnv.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      exclude: ['dist/**', 'tests/helpers/**', 'examples/**', '**/*.d.ts', 'vitest.config.ts']
    }
  }
});
