import { defineConfig } from 'vitest/config';

// Tests live next to what they test, as in apps/landing. The bundle test runs
// Wrangler, which takes a few seconds.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
});
