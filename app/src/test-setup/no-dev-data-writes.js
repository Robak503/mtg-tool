/**
 * Tripwire: no test may write into the dev tree's data/ root. (HB-1 guard #2)
 *
 * Registered in vitest.config.js `setupFiles`, so it loads in every worker
 * BEFORE the test file (and before any test calls process.chdir), when
 * process.cwd() is still the real app dir. It fingerprints the dev-tree
 * data/profiles.json (the root pointer to every per-profile store — the file
 * the 2026-07-03 leak corrupted) and re-checks it in a global afterAll: any
 * change means a test escaped its tmp-dir isolation and wrote into the real
 * dev data root.
 *
 * Known leak vectors this catches:
 *   - MTG_APP_ROOT exported by the shell (paths.js gives it precedence over
 *     cwd, defeating chdir-to-tmp isolation) — also blocked at the source by
 *     the vitest.config.js env scrub;
 *   - a test that forgets process.chdir(tmpdir) before touching profile
 *     stores;
 *   - any future paths.js resolution change that re-routes writes.
 */

import { afterAll } from "vitest";
import path from "node:path";
import { statSync } from "node:fs";

// Captured at worker load, before any test can chdir away.
const devDataDir = path.join(process.cwd(), "data");
const devProfilesRegistry = path.join(devDataDir, "profiles.json");

function fingerprint(file) {
  try {
    const st = statSync(file);
    return `mtimeMs=${st.mtimeMs};size=${st.size}`;
  } catch {
    return "missing";
  }
}

const baseline = fingerprint(devProfilesRegistry);

afterAll(() => {
  const now = fingerprint(devProfilesRegistry);
  if (now !== baseline) {
    throw new Error(
      `Test leaked writes into the dev tree data/ root: ${devProfilesRegistry} ` +
        `changed (${baseline} -> ${now}). A test escaped its tmp-dir isolation — ` +
        `check for an inherited MTG_APP_ROOT override or a missing process.chdir(tmpdir). ` +
        `See vitest.config.js env scrub + src/test-setup/no-dev-data-writes.js.`,
    );
  }
});
