/**
 * engineBuild.test.js — the engine build stamp (release-readiness R2, 2026-09-29).
 * Every local grind / self-play record claimed "0.150.0" because the stamp was app/package.json's version,
 * which the repo never bumps. These pin the new stamp: a git-describe build id with a semver prefix.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeEngineBuild, engineBuild, formatEngineBuild } from "./engineBuild.js";

describe("formatEngineBuild — git describe → stamp", () => {
  it("exactly on a clean release tag, the stamp IS the release version (what that tag's exe carries)", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "v0.160.0-0-g5c3486d0" })).toBe("0.160.0");
  });

  it("commits past the tag carry the distance and the commit", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "v0.160.0-342-g916dfa71" })).toBe("0.160.0+342.g916dfa71");
  });

  it("uncommitted changes are marked dirty — even exactly on the tag (that is not the released engine)", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "v0.160.0-342-g916dfa71-dirty" })).toBe("0.160.0+342.g916dfa71.dirty");
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "v0.160.0-0-g5c3486d0-dirty" })).toBe("0.160.0+0.g5c3486d0.dirty");
  });

  it("a prerelease tag keeps its full name as the base", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "v1.2.3-rc1-5-gabcdef12" })).toBe("1.2.3-rc1+5.gabcdef12");
  });

  it("no release tag reachable (a shallow clone): the package version plus the commit", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "916dfa71" })).toBe("0.150.0+g916dfa71");
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "916dfa71-dirty" })).toBe("0.150.0+g916dfa71.dirty");
  });

  it("git not consulted (the packaged exe): the package version, which release.yml stamped with the tag", () => {
    expect(formatEngineBuild({ pkgVersion: "0.161.0", describe: null })).toBe("0.161.0");
  });

  it("output these flags cannot produce is refused (null), never guessed", () => {
    expect(formatEngineBuild({ pkgVersion: "0.150.0", describe: "fatal: not a git repository" })).toBeNull();
  });
});

describe("computeEngineBuild — the injectable core", () => {
  const neverGit = () => {
    throw new Error("git must not be consulted here");
  };

  it("packaged: git is never run; the stamp is the package version", () => {
    expect(computeEngineBuild({ readPkgVersion: () => "0.161.0", runGitDescribe: neverGit, packaged: true })).toBe("0.161.0");
  });

  it("git failing is LOUD and visible in the stamp — never a bare version that looks like a release", () => {
    const warnings = [];
    const stamp = computeEngineBuild({
      readPkgVersion: () => "0.150.0",
      runGitDescribe: () => {
        throw new Error("spawn git ENOENT");
      },
      packaged: false,
      warn: (m) => warnings.push(m),
    });
    expect(stamp).toBe("0.150.0+nogit");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/git describe failed/);
  });

  it("unrecognised describe output is loud too", () => {
    const warnings = [];
    const stamp = computeEngineBuild({ readPkgVersion: () => "0.150.0", runGitDescribe: () => "weird", packaged: false, warn: (m) => warnings.push(m) });
    expect(stamp).toBe("0.150.0+describe-unparsed");
    expect(warnings).toHaveLength(1);
  });

  it("a package.json that cannot be read throws (no silent 'unknown')", () => {
    expect(() =>
      computeEngineBuild({
        readPkgVersion: () => {
          throw new Error("ENOENT package.json");
        },
        runGitDescribe: neverGit,
        packaged: true,
      }),
    ).toThrow(/ENOENT/);
  });
});

describe("consumer contract — the semver prefix survives the parser Omnath's gates use", () => {
  // omnath-tools/pilots/export-training.mjs + ingest-grind-store.mjs, verbatim:
  const semver = (s) => String(s || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  it.each([
    ["0.160.0", [0, 160, 0]],
    ["0.160.0+342.g916dfa71", [0, 160, 0]],
    ["0.160.0+342.g916dfa71.dirty", [0, 160, 0]],
    ["0.150.0+g916dfa71", [0, 150, 0]],
    ["0.150.0+nogit", [0, 150, 0]],
  ])("%s parses as %j", (stamp, want) => {
    expect(semver(stamp).slice(0, 3)).toEqual(want);
  });
});

describe("engineBuild — in this repo", () => {
  it("equals what git describe says about THIS checkout, even when the process cwd is elsewhere", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgVersion = JSON.parse(readFileSync(path.join(here, "..", "..", "..", "package.json"), "utf8")).version;
    const describe = execFileSync("git", ["describe", "--tags", "--long", "--always", "--dirty", "--abbrev=8", "--match", "v*.*.*"], {
      cwd: here,
      encoding: "utf8",
    }).trim();
    // A harness outside the repo (Omnath's pilots run from the vault) imports this module with another cwd:
    // the stamp must still describe the tree the engine was loaded from. First call computes it — do it
    // from a directory that is not a git checkout.
    const prev = process.cwd();
    let stamp;
    try {
      process.chdir(os.tmpdir());
      stamp = engineBuild();
    } finally {
      process.chdir(prev);
    }
    expect(stamp).toBe(formatEngineBuild({ pkgVersion, describe }));
    expect(stamp).toMatch(/^\d+\.\d+\.\d+/);
    expect(engineBuild()).toBe(stamp); // computed once per process
  });
});
