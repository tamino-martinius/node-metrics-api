import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    // npm's downloads-range API rate-limits scoped-package lookups fairly aggressively;
    // maintainers with many scoped packages need backoff headroom beyond a typical 30s budget.
    testTimeout: 300_000,
    passWithNoTests: true,
  },
});
