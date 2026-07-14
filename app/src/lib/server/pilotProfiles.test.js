/**
 * pilotProfiles.test.js — listPilotProfiles surfaces the SELECTABLE Crucible pilot profiles by
 * reading each module's declared metadata STATICALLY (regex, no import/execute), and hides raw
 * persona-core files that declare no label. Fixtures under a tmp pilotsDir (chdir so paths.js
 * resolves there; no MTG_APP_ROOT → appRoot = cwd).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listPilotProfiles, loadRotatingPilotBuilder } from "./pilotLoader.js";

let tmp;
let orig;

beforeEach(async () => {
  orig = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pilots-"));
  await fs.mkdir(path.join(tmp, "pilots"), { recursive: true });
  process.chdir(tmp);
});

afterEach(async () => {
  process.chdir(orig);
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

describe("listPilotProfiles", () => {
  it("surfaces only label-declaring profiles, with label/description/pilotType", async () => {
    const dir = path.join(tmp, "pilots");
    await fs.writeFile(
      path.join(dir, "specialist.mjs"),
      'export const label = "Specialist";\nexport const description = "the expert line";\nexport const pilotType = "specialist";\nexport function buildPilots() { return {}; }\n',
    );
    await fs.writeFile(
      path.join(dir, "generalist.mjs"),
      'export const label = "Generalist";\nexport const pilotType = "generalist";\nexport function buildPilots() { return {}; }\n',
    );
    // Raw persona-core file — declares NO label → must be hidden from the picker.
    await fs.writeFile(path.join(dir, "omnath.mjs"), "export function decide() { return null; }\n");

    const profiles = await listPilotProfiles();
    const byFile = Object.fromEntries(profiles.map((p) => [p.file, p]));
    expect(Object.keys(byFile).sort()).toEqual(["generalist.mjs", "specialist.mjs"]); // omnath hidden
    expect(byFile["specialist.mjs"]).toMatchObject({ label: "Specialist", description: "the expert line", pilotType: "specialist" });
    expect(byFile["generalist.mjs"]).toMatchObject({ label: "Generalist", pilotType: "generalist", description: null });
  });

  it("returns [] when the pilots dir is absent", async () => {
    await fs.rm(path.join(tmp, "pilots"), { recursive: true, force: true });
    expect(await listPilotProfiles()).toEqual([]);
  });
});

describe("loadRotatingPilotBuilder (∞ grind — every persona)", () => {
  it("cycles the shipped personas deterministically by seed", async () => {
    const dir = path.join(tmp, "pilots");
    // Two fixtures (sorted: generalist, specialist), each stamps its pilotType onto every seat.
    await fs.writeFile(path.join(dir, "generalist.mjs"), 'export const label="Generalist";export const pilotType="generalist";export function buildPilots(seats){return Object.fromEntries(seats.map(s=>[s,{pilotType:"generalist",decide:()=>null}]));}\n');
    await fs.writeFile(path.join(dir, "specialist.mjs"), 'export const label="Specialist";export const pilotType="specialist";export function buildPilots(seats){return Object.fromEntries(seats.map(s=>[s,{pilotType:"specialist",decide:()=>null}]));}\n');
    const rot = await loadRotatingPilotBuilder("commander");
    expect(rot).toBeTruthy();
    expect(rot([], 0).user.pilotType).toBe("generalist"); // seed 0 → builders[0]
    expect(rot([], 1).user.pilotType).toBe("specialist"); // seed 1 → builders[1]
    expect(rot([], 2).user.pilotType).toBe("generalist"); // wraps
  });

  it("returns null when no personas are present (⇒ default autopilot)", async () => {
    await fs.rm(path.join(tmp, "pilots"), { recursive: true, force: true });
    await fs.mkdir(path.join(tmp, "pilots"), { recursive: true });
    expect(await loadRotatingPilotBuilder("commander")).toBeNull();
  });
});
