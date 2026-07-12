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
import { listPilotProfiles } from "./pilotLoader.js";

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
