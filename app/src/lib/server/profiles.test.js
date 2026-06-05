/**
 * profiles.test.js — local profiles registry + migration + path scoping.
 *
 * Uses process.chdir(tmpdir) so paths.js resolves data/ to a throwaway location
 * per test (no MTG_APP_ROOT needed). Matches the collectionStorage.test pattern.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
const originalCwd = process.cwd();

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "profiles-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
});

// Fresh module per test (paths.js is stateless — reads cwd lazily — so the
// shared instance it imports is fine across busts).
function loadProfiles() {
  return import("./profiles.js?bust=" + Math.random());
}
function loadPaths() {
  return import("./paths.js?bust=" + Math.random());
}

async function seedDecks(decks) {
  await fs.writeFile(
    path.join(workDir, "data", "decks.local.json"),
    JSON.stringify({ version: 1, updatedAt: "x", decks }, null, 2),
  );
}
async function readJson(rel) {
  return JSON.parse(await fs.readFile(path.join(workDir, "data", rel), "utf8"));
}
const exists = (rel) => fs.access(path.join(workDir, "data", rel)).then(() => true, () => false);

describe("ensureMigrated — splits decks by owner", () => {
  it("creates Colton + Joe profiles and routes decks by memory.owner", async () => {
    await seedDecks([
      { id: "d1", name: "Sliver", memory: { owner: "Colton" } },
      { id: "d2", name: "Omnath", memory: { owner: "Colton" } },
      { id: "d3", name: "Kinnan", memory: { owner: "Joe" } },
    ]);
    await fs.writeFile(path.join(workDir, "data", "collection.json"), JSON.stringify({ version: 1, cards: [{ name: "X" }] }));

    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();

    const reg = await readJson("profiles.json");
    expect(reg.profiles).toHaveLength(2);
    const names = reg.profiles.map(p => p.name).sort();
    expect(names).toEqual(["Colton", "Joe"]);

    const colton = reg.profiles.find(p => p.name === "Colton");
    const joe = reg.profiles.find(p => p.name === "Joe");
    expect(reg.activeProfileId).toBe(colton.id); // primary

    const coltonDecks = await readJson(path.join("profiles", colton.id, "decks.local.json"));
    const joeDecks = await readJson(path.join("profiles", joe.id, "decks.local.json"));
    expect(coltonDecks.decks.map(d => d.id).sort()).toEqual(["d1", "d2"]);
    expect(joeDecks.decks.map(d => d.id)).toEqual(["d3"]);
  });

  it("moves ownerless data (collection) into the primary profile, leaving Joe empty", async () => {
    await seedDecks([
      { id: "d1", name: "Sliver", memory: { owner: "Colton" } },
      { id: "d3", name: "Kinnan", memory: { owner: "Joe" } },
    ]);
    await fs.writeFile(path.join(workDir, "data", "collection.json"), JSON.stringify({ version: 1, cards: [] }));

    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();
    const reg = await readJson("profiles.json");
    const colton = reg.profiles.find(p => p.name === "Colton");
    const joe = reg.profiles.find(p => p.name === "Joe");

    expect(await exists(path.join("profiles", colton.id, "collection.json"))).toBe(true);
    expect(await exists(path.join("profiles", joe.id, "collection.json"))).toBe(false);
    // Legacy flat files are gone (decks split + collection moved).
    expect(await exists("collection.json")).toBe(false);
    expect(await exists("decks.local.json")).toBe(false);
    // A pre-migration backup was written.
    expect(await exists(".pre-profiles-backup")).toBe(true);
  });

  it("is idempotent — re-running does not duplicate or re-migrate", async () => {
    await seedDecks([{ id: "d1", name: "A", memory: { owner: "Colton" } }]);
    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();
    const before = await readJson("profiles.json");
    ensureMigrated();
    const after = await readJson("profiles.json");
    expect(after.profiles).toHaveLength(before.profiles.length);
    expect(after.activeProfileId).toBe(before.activeProfileId);
  });

  it("creates a single default profile when there are no decks", async () => {
    const { listProfiles } = await loadProfiles();
    const { profiles, activeProfileId } = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("Player 1");
    expect(activeProfileId).toBe(profiles[0].id);
  });
});

describe("path scoping", () => {
  it("profilePath falls back to legacy data/ before any registry exists", async () => {
    const { profilePath, activeProfileId } = await loadPaths();
    expect(activeProfileId()).toBeNull();
    expect(profilePath("decks.local.json")).toBe(path.join(workDir, "data", "decks.local.json"));
  });

  it("profilePath resolves under the active profile after migration, and follows a switch", async () => {
    await seedDecks([
      { id: "d1", name: "A", memory: { owner: "Colton" } },
      { id: "d3", name: "B", memory: { owner: "Joe" } },
    ]);
    const { ensureMigrated, setActiveProfile } = await loadProfiles();
    ensureMigrated();
    const { profilePath, activeProfileId } = await loadPaths();
    const reg = await readJson("profiles.json");
    const colton = reg.profiles.find(p => p.name === "Colton");
    const joe = reg.profiles.find(p => p.name === "Joe");

    expect(activeProfileId()).toBe(colton.id);
    expect(profilePath("decks.local.json")).toBe(path.join(workDir, "data", "profiles", colton.id, "decks.local.json"));

    setActiveProfile(joe.id);
    expect(activeProfileId()).toBe(joe.id);
    expect(profilePath("decks.local.json")).toBe(path.join(workDir, "data", "profiles", joe.id, "decks.local.json"));
  });
});

describe("profile id validation (path-traversal defense)", () => {
  it("isValidProfileId accepts server-generated ids and rejects traversal/garbage", async () => {
    const { isValidProfileId } = await loadPaths();
    expect(isValidProfileId("prof_123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isValidProfileId("../../etc/passwd")).toBe(false);
    expect(isValidProfileId("prof_../../evil")).toBe(false);
    expect(isValidProfileId("prof_short")).toBe(false);
    expect(isValidProfileId("")).toBe(false);
    expect(isValidProfileId(null)).toBe(false);
  });

  it("rejects a malformed active id even when it is a registry member (no path escape)", async () => {
    await seedDecks([{ id: "d1", name: "A", memory: { owner: "Colton" } }]);
    const { ensureMigrated } = await loadProfiles();
    ensureMigrated();

    // Simulate a hand-corrupted data/profiles.json whose active pointer (and a
    // member entry) carry a traversal payload. The shape guard must refuse it
    // rather than path.join it — the pre-guard code would have escaped.
    const reg = await readJson("profiles.json");
    const evil = "..\\..\\..\\Windows\\System32";
    reg.profiles.unshift({ id: evil, name: "evil", createdAt: "x" });
    reg.activeProfileId = evil;
    await fs.writeFile(path.join(workDir, "data", "profiles.json"), JSON.stringify(reg));

    const { activeProfileId, profilePath } = await loadPaths();
    expect(activeProfileId()).toBeNull();
    const resolved = profilePath("decks.local.json");
    expect(resolved).toBe(path.join(workDir, "data", "decks.local.json"));
    expect(resolved).not.toContain("System32");
  });
});

describe("registry CRUD", () => {
  it("creates an empty profile and switches to it", async () => {
    const { listProfiles, createProfile, setActiveProfile } = await loadProfiles();
    listProfiles(); // triggers default migration
    const bob = createProfile("Bob");
    expect(bob.name).toBe("Bob");
    const after = listProfiles();
    expect(after.profiles.some(p => p.id === bob.id)).toBe(true);
    setActiveProfile(bob.id);
    expect(listProfiles().activeProfileId).toBe(bob.id);
  });

  it("renames without moving the folder (id is stable)", async () => {
    const { listProfiles, renameProfile } = await loadProfiles();
    const { activeProfileId } = listProfiles();
    const renamed = renameProfile(activeProfileId, "Newname");
    expect(renamed.name).toBe("Newname");
    expect(renamed.id).toBe(activeProfileId);
    expect(await exists(path.join("profiles", activeProfileId))).toBe(true);
  });

  it("blocks deleting the last profile, and removes the folder otherwise", async () => {
    const { listProfiles, createProfile, deleteProfile } = await loadProfiles();
    const { activeProfileId } = listProfiles();
    expect(() => deleteProfile(activeProfileId)).toThrow(/last profile/i);

    const bob = createProfile("Bob");
    deleteProfile(bob.id);
    expect(await exists(path.join("profiles", bob.id))).toBe(false);
  });
});
