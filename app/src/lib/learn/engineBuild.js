/**
 * engineBuild.js — the ENGINE BUILD stamp every grind / self-play / replay / saved record carries
 * (2026-09-29, release-readiness R2).
 *
 * Before: each writer read app/package.json's "version" — but the repo never bumps it (release.yml stamps
 * the tag's version on the CI runner only), so every local record since mid-August claimed "0.150.0"
 * whatever engine produced it. Consumers compare the stamp for EQUALITY (scripts/replay-canary.mjs replays
 * only same-stamp games; Omnath's pilots/ab-compare.mjs warns only when two runs' stamps differ) or GROUP by
 * it (gameLogStore's per-version cut) — a stuck stamp made all of them meaningless.
 *
 * Now a checkout stamps `git describe` against the last release tag, as semver with build metadata:
 *   exactly on a clean release tag  → "0.160.0"                        (what the shipped exe of that tag carries)
 *   342 commits past it             → "0.160.0+342.g916dfa71"
 *   uncommitted tracked changes     → "0.160.0+342.g916dfa71.dirty"
 *   no release tag reachable        → "<package.json version>+g916dfa71"   (e.g. a shallow CI clone)
 *   git unavailable                 → "<package.json version>+nogit"       (visible, never a fake release stamp)
 * The packaged exe (no git; MTG_REFERENCE_DIR set by the Tauri shell) stamps package.json, which release.yml
 * rewrote to the tag's version at build time. The leading MAJOR.MINOR.PATCH is always preserved, so semver
 * gates that parse the first three numeric parts (Omnath's export-training / ingest-grind-store) keep working.
 *
 * Computed ONCE per process: a long-running dev server that hot-reloads engine code keeps its start-time
 * stamp until restart (scripts and the grind pool are fresh processes, so they are always exact).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESCRIBE_ARGS = ["describe", "--tags", "--long", "--always", "--dirty", "--abbrev=8", "--match", "v*.*.*"];

/**
 * Pure: the package version + `git describe` output (DESCRIBE_ARGS, or null when git is not consulted) →
 * the stamp. Returns null for output these flags cannot produce, so the caller can say so loudly.
 */
export function formatEngineBuild({ pkgVersion, describe }) {
  const pkg = pkgVersion || "0.0.0";
  if (describe === null || describe === undefined) return pkg;
  const tagged = /^v(.+)-(\d+)-g([0-9a-f]{7,})(-dirty)?$/.exec(describe);
  if (tagged) {
    const [, base, ahead, sha, dirty] = tagged;
    if (ahead === "0" && !dirty) return base;
    return `${base}+${ahead}.g${sha}${dirty ? ".dirty" : ""}`;
  }
  const bare = /^([0-9a-f]{7,})(-dirty)?$/.exec(describe);
  if (bare) return `${pkg}+g${bare[1]}${bare[2] ? ".dirty" : ""}`;
  return null;
}

/** Injectable core — tests pass stubs; engineBuild() passes the real readers. */
export function computeEngineBuild({ readPkgVersion, runGitDescribe, packaged, warn = console.warn }) {
  const pkgVersion = readPkgVersion();
  if (packaged) return formatEngineBuild({ pkgVersion, describe: null });
  let describe;
  try {
    describe = runGitDescribe();
  } catch (e) {
    warn(`[engineBuild] git describe failed (${String(e?.message || e).split("\n")[0]}) — records will carry "+nogit", not a build id`);
    return `${pkgVersion || "0.0.0"}+nogit`;
  }
  const stamp = formatEngineBuild({ pkgVersion, describe });
  if (stamp === null) {
    warn(`[engineBuild] unrecognised git describe output ${JSON.stringify(describe)} — records will carry "+describe-unparsed"`);
    return `${pkgVersion || "0.0.0"}+describe-unparsed`;
  }
  return stamp;
}

let cached = null;

/** The engine build stamp for this process (computed once). */
export function engineBuild() {
  if (cached === null) {
    cached = computeEngineBuild({
      readPkgVersion: () => JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version,
      // Run from THIS file's directory, so the stamp describes the tree the engine code was loaded from —
      // even when a harness outside the repo (Omnath's pilots) imports this module with another cwd.
      runGitDescribe: () =>
        execFileSync("git", DESCRIBE_ARGS, {
          cwd: path.dirname(fileURLToPath(import.meta.url)),
          encoding: "utf8",
          timeout: 10_000,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        }).trim(),
      packaged: Boolean(process.env.MTG_REFERENCE_DIR) && !process.env.VITEST,
    });
  }
  return cached;
}
