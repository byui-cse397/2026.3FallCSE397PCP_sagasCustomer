import { defineConfig } from 'vitest/config';

// A test file outside this list runs zero times and still reports green.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
