/**
 * HB-1 guard pin: vitest.config.js stamps every data-root env override to ""
 * in every worker, and paths.js treats empty/whitespace as unset — so
 * appRoot() falls back to process.cwd(), restoring the chdir-to-tmp isolation
 * idiom even when the invoking shell exported MTG_APP_ROOT (the realism-gate /
 * measure-coverage workflows do exactly that, which is how test fixtures
 * leaked into the real dev-tree data/profiles on 2026-07-03).
 *
 * Tests that legitimately need an env root (refDirSyncRefresh.test.js,
 * profilesRefDir.test.js, paths.test.js) set process.env themselves in
 * beforeEach — the scrub only neutralizes *inherited* shell state.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";

const SCRUBBED = ["MTG_APP_ROOT", "MTG_JUDGE_DIR", "MTG_ENGINE_DIR", "MTG_REFERENCE_DIR"];

describe("vitest env scrub (HB-1 guard)", () => {
  it("stamps every data-root env override to the empty string in workers", () => {
    for (const key of SCRUBBED) {
      expect(process.env[key], `${key} must be scrubbed by vitest.config.js test.env`).toBe("");
    }
  });

  it("paths.js treats the scrubbed value as unset: appRoot() === cwd", async () => {
    const { appRoot, mtgJudgeDir, mtgEngineDir } = await import("./paths.js?bust=" + Math.random());
    expect(appRoot()).toBe(process.cwd());
    // Judge/engine dirs fall back to the dev-tree relative paths, not env roots.
    expect(mtgJudgeDir()).toBe(path.join(process.cwd(), "..", "knowledge", "mtg-judge"));
    expect(mtgEngineDir()).toBe(path.join(process.cwd(), "..", "knowledge", "mtg-engine"));
  });
});
