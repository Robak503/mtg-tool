import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * The only thing we override is the per-test timeout. Vitest's default is
 * 5000ms, but several tests do real work — loading and indexing the
 * Comprehensive Rules, parsing bulk Scryfall data — and the suite runs test
 * files in parallel forks. On a busy CI runner, CPU contention can push one of
 * those heavy tests past 5s and it times out *spuriously* (observed:
 * `engine/route.test.js` finishing at ~6.3s under full-suite load while passing
 * in well under a second in isolation). That presented as a flaky red CI on
 * changes that had nothing to do with the failing test.
 *
 * A generous 20s ceiling removes that flake class while still being far below
 * anything a genuinely hung test would need. The real hang guard is unchanged:
 * `scripts/test-with-timeout.cjs` wraps the whole run in a 5-minute wall-clock
 * kill, so a deadlocked worker is still caught and torn down.
 */
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
