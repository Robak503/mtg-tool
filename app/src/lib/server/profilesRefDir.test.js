/**
 * profilesRefDir.test.js — the PACKAGED-.exe layout that no other test exercises:
 * profiles ACTIVE while MTG_REFERENCE_DIR points at a read-only bundled snapshot.
 *
 * profiles.test.js covers the migration/scoping contract but never sets
 * MTG_REFERENCE_DIR; paths.test.js covers the reference-dir fallback but never
 * runs the profiles migration. The .exe runs BOTH at once (CLAUDE.md §2.3), so
 * this file locks in the interaction: the read-or-write split must hold —
 * per-profile user data writes under data/profiles/<id>/ via profilePath(),
 * while reference data still falls back to the bundle via dataPath() — and it
 * must survive a profile switch. profilePath() has no bundle fallback, so a
 * reference dir can never shadow a per-profile write; these tests pin that.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let appRootDir;
let refDir;
let originalCwd;
let originalAppRoot;
let originalRefDir;

beforeEach(async () => {
  appRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "prof-refdir-app-"));
  refDir = await fs.mkdtemp(path.join(os.tmpdir(), "prof-refdir-ref-"));
  originalCwd = process.cwd();
  originalAppRoot = process.env.MTG_APP_ROOT;
  originalRefDir = process.env.MTG_REFERENCE_DIR;
  delete process.env.MTG_APP_ROOT; // app root = cwd
  process.chdir(appRootDir);
  await fs.mkdir(path.join(appRootDir, "data"), { recursive: true });
  process.env.MTG_REFERENCE_DIR = refDir; // the Tauri shell sets this to resources/data
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalAppRoot === undefined) delete process.env.MTG_APP_ROOT;
  else process.env.MTG_APP_ROOT = originalAppRoot;
  if (originalRefDir === undefined) delete process.env.MTG_REFERENCE_DIR;
  else process.env.MTG_REFERENCE_DIR = originalRefDir;
  await fs.rm(appRootDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(refDir, { recursive: true, force: true }).catch(() => {});
});

const loadProfiles = () => import("./profiles.js?bust=" + Math.random());
const loadPaths = () => import("./paths.js?bust=" + Math.random());

async function seedDecks(decks) {
  await fs.writeFile(
    path.join(appRootDir, "data", "decks.local.json"),
    JSON.stringify({ version: 1, updatedAt: "x", decks }, null, 2),
  );
}
async function readRegistry() {
  return JSON.parse(await fs.readFile(path.join(appRootDir, "data", "profiles.json"), "utf8"));
}

describe("profiles × MTG_REFERENCE_DIR (packaged .exe layout)", () => {
  it("per-profile data writes under data/profiles/<id>/ while reference data falls back to the bundle", async () => {
    // Bundle holds reference data only; the writable app root does not.
    await fs.writeFile(path.join(refDir, "rules-index.json"), "[bundled-rules]");
    await seedDecks([
      { id: "d1", name: "A", memory: { owner: "Colton" } },
      { id: "d2", name: "B", memory: { owner: "Joe" } },
    ]);

    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();
    const { profilePath, dataPath, activeProfileId } = await loadPaths();
    const reg = await readRegistry();
    const colton = reg.profiles.find(p => p.name === "Colton");

    // Reference data is absent from the app root → resolves to the bundle.
    expect(dataPath("rules-index.json")).toBe(path.join(refDir, "rules-index.json"));

    // Per-profile user data resolves to the active profile under the WRITABLE
    // app root — the reference dir must never capture a profilePath() write.
    expect(activeProfileId()).toBe(colton.id);
    expect(profilePath("decks.local.json")).toBe(
      path.join(appRootDir, "data", "profiles", colton.id, "decks.local.json"),
    );
    expect(profilePath("collection.json")).toBe(
      path.join(appRootDir, "data", "profiles", colton.id, "collection.json"),
    );
    // The bundle was never written to by the migration.
    await expect(fs.readFile(path.join(refDir, "profiles.json"))).rejects.toThrow();
  });

  it("the split survives a profile switch (reference stays bundled, per-profile follows the active id)", async () => {
    await fs.writeFile(path.join(refDir, "rules-index.json"), "[bundled-rules]");
    await seedDecks([
      { id: "d1", name: "A", memory: { owner: "Colton" } },
      { id: "d2", name: "B", memory: { owner: "Joe" } },
    ]);

    const { ensureMigrated, setActiveProfile } = await loadProfiles();
    ensureMigrated();
    const { profilePath, dataPath } = await loadPaths();
    const reg = await readRegistry();
    const joe = reg.profiles.find(p => p.name === "Joe");

    setActiveProfile(joe.id);
    expect(profilePath("decks.local.json")).toBe(
      path.join(appRootDir, "data", "profiles", joe.id, "decks.local.json"),
    );
    // The reference fallback is independent of which profile is active.
    expect(dataPath("rules-index.json")).toBe(path.join(refDir, "rules-index.json"));
  });

  it("a per-profile file present in the bundle is NEVER served for profilePath (writable-only)", async () => {
    // Even if the bundle somehow carried a decks.local.json, profilePath must
    // resolve to the writable per-profile location, not the bundle — only
    // dataPath() has a reference-dir fallback, profilePath() does not.
    await fs.writeFile(path.join(refDir, "decks.local.json"), "[bundled-decks]");
    await seedDecks([{ id: "d1", name: "A", memory: { owner: "Colton" } }]);

    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();
    const { profilePath } = await loadPaths();
    const reg = await readRegistry();
    const colton = reg.profiles[0];

    const resolved = profilePath("decks.local.json");
    expect(resolved).toBe(
      path.join(appRootDir, "data", "profiles", colton.id, "decks.local.json"),
    );
    expect(resolved.startsWith(refDir)).toBe(false);
  });
});
