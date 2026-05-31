/**
 * Version-source alignment guard (O1 / PLAN M1).
 *
 * package.json and src-tauri/tauri.conf.json must declare the same version, so
 * the committed source is an honest single source of truth. (The release CI
 * also rewrites tauri.conf from the git tag for the actual signed build; this
 * just stops the two committed baselines from drifting apart in a PR.)
 *
 * vitest runs from the app/ package, so cwd-relative paths resolve here.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

describe("version alignment", () => {
  it("package.json and tauri.conf.json declare the same version", () => {
    const pkg = readJson("package.json");
    const tauri = readJson("src-tauri/tauri.conf.json");
    expect(pkg.version).toBe(tauri.version);
  });

  it("the version is valid x.y.z semver", () => {
    expect(readJson("package.json").version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
