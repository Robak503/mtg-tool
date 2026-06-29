import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * NOTE: Vitest resolves `vitest.config.js` before `vitest.config.mjs`, so this
 * file is the single source of truth — the old `.mjs` was silently shadowed and
 * has been removed. Keep all overrides here.
 *
 * Timeout override: Vitest's default per-test timeout is 5000ms, but several
 * tests do real work — loading and indexing the Comprehensive Rules, parsing
 * bulk Scryfall data — and the suite runs test files in parallel forks. On a
 * busy CI runner, CPU contention can push one of those heavy tests past 5s and
 * it times out *spuriously* (observed: `rules-retrieval/route.test.js` finishing
 * at ~6.3s under full-suite load while passing in well under a second in
 * isolation). That presented as a flaky red CI on changes unrelated to the
 * failing test. A generous 20s ceiling removes that flake class while staying
 * far below anything a genuinely hung test would need. The real hang guard is
 * unchanged: `scripts/test-with-timeout.cjs` wraps the whole run in a 5-minute
 * wall-clock kill, so a deadlocked worker is still caught and torn down.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "src/**/*.test.jsx", "scripts/**/*.test.js", "scripts/**/*.test.cjs"],
    // Each test file runs in isolation so module-level singletons (cardIndex,
    // rulingsIndex) cannot bleed between files.
    isolate: true,
    // See the block comment above — prevents spurious timeouts on heavy tests
    // under parallel CI load.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
