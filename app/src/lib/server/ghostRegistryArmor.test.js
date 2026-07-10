/**
 * ghostRegistryArmor.test.js — GHOST-REGISTRY defense-in-depth (2026-07-10 incident).
 *
 * The incident: leaked-env test runs polluted the REAL %APPDATA% registry ("Bob"/"Newname" tmps),
 * and a registry read race could relabel every profile via the rebuild path. The armor:
 *   1. paths.detectAppRoot REFUSES a vitest run pointed at the real install data root.
 *   2. a PRESENT-but-corrupt registry is QUARANTINED (renamed .corrupt-<ts>) before any rebuild —
 *      evidence survives; the rebuild never silently overwrites it.
 *   3. readRegistry retries transient read failures instead of treating them as "missing"
 *      (covered structurally — ENOENT still returns null for the migration path).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appRoot } from "./paths.js";
import { ensureMigrated, readRegistry } from "./profiles.js";

let tmpDir;
let originalCwd;
let originalAppRoot;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-armor-"));
  originalCwd = process.cwd();
  originalAppRoot = process.env.MTG_APP_ROOT;
  delete process.env.MTG_APP_ROOT;
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalAppRoot === undefined) delete process.env.MTG_APP_ROOT;
  else process.env.MTG_APP_ROOT = originalAppRoot;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("armor 1 — test isolation", () => {
  it("a vitest run pointed at the REAL install data root throws (leaked env), a tmp sandbox passes", () => {
    process.env.MTG_APP_ROOT = "C:\\Users\\anyone\\AppData\\Roaming\\com.colton.mtg-tool";
    expect(() => appRoot()).toThrow(/REAL app data root/);
    process.env.MTG_APP_ROOT = tmpDir; // a sandbox is fine
    expect(appRoot()).toBe(tmpDir);
  });
});

describe("armor 2 — corrupt-registry quarantine", () => {
  it("a present-but-corrupt registry is renamed aside (.corrupt-*) and rebuilt from profile dirs", () => {
    const dataDir = path.join(tmpDir, "data");
    const profDir = path.join(dataDir, "profiles", "prof_11111111-2222-4333-8444-555555555555");
    fs.mkdirSync(profDir, { recursive: true });
    fs.writeFileSync(path.join(profDir, "decks.local.json"), JSON.stringify({ version: 1, decks: [{ name: "D", memory: { owner: "Colton" } }] }));
    fs.writeFileSync(path.join(dataDir, "profiles.json"), "{ this is not json");
    ensureMigrated();
    // The corrupt original survives as evidence…
    const quarantined = fs.readdirSync(dataDir).filter((n) => /^profiles\.json\.corrupt-\d+$/.test(n));
    expect(quarantined).toHaveLength(1);
    // …and the rebuilt registry recovered the profile (id from the dir, name from deck owners).
    const reg = readRegistry();
    expect(reg.profiles).toHaveLength(1);
    expect(reg.profiles[0].id).toBe("prof_11111111-2222-4333-8444-555555555555");
    expect(reg.profiles[0].name).toBe("Colton");
  });

  it("ENOENT (no registry at all) still routes to the normal migration (no quarantine artifacts)", () => {
    ensureMigrated();
    const reg = readRegistry();
    expect(reg.profiles.length).toBeGreaterThan(0); // fresh "Player 1" migration
    const artifacts = fs.readdirSync(path.join(tmpDir, "data")).filter((n) => n.includes(".corrupt-"));
    expect(artifacts).toHaveLength(0);
  });
});
