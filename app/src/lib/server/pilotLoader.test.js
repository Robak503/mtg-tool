/**
 * pilotLoader.test.js — the loadPilotBuilder wrapper contract (Omnath's epoch-4 defect report, 2026-07-10).
 *
 * The grind header (grindPod.buildGrindHeader) reads `pilotV` off the BUILDER FUNCTION the loop holds —
 * loadPilotBuilder's wrapper, not the persona's raw buildPilots. A persona stamps `buildPilots.pilotV = N`;
 * the wrapper must copy it through or every pool header records pilotV:null and the era loses pilot
 * attribution. Also pins the 3rd-arg options-bag passthrough (the recall-arm plumb, b69d4bd8) so the
 * two wrapper contracts can't regress independently.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPilotBuilder } from "./pilotLoader.js";

let tmpDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-loader-test-"));
  fs.mkdirSync(path.join(tmpDir, "pilots"), { recursive: true });
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadPilotBuilder wrapper passthroughs", () => {
  it("copies buildPilots.pilotV onto the wrapper (the header's read site) and threads seed + opts", async () => {
    fs.writeFileSync(path.join(tmpDir, "pilots", "pv-probe.mjs"), [
      "export function buildPilots(seats, opts) {",
      "  buildPilots.lastOpts = opts;",
      "  return Object.fromEntries(seats.map((s) => [s, { decide: () => null }]));",
      "}",
      "buildPilots.pilotV = 3;",
    ].join("\n"));
    const builder = await loadPilotBuilder("pv-probe.mjs", "commander");
    expect(builder.pilotV).toBe(3); // the epoch-4 defect: this was undefined → headers stamped pilotV:null
    const mod = await import(new URL(`file://${path.join(tmpDir, "pilots", "pv-probe.mjs").replace(/\\/g, "/")}`));
    builder(["deckA"], 42, { flags: ["recall-on"] });
    expect(mod.buildPilots.lastOpts).toMatchObject({ seed: 42, flags: ["recall-on"], decks: ["deckA"] });
  });

  it("leaves pilotV undefined for a persona that doesn't stamp one (headers stay null — never a fabricated era)", async () => {
    fs.writeFileSync(path.join(tmpDir, "pilots", "bare.mjs"),
      "export function buildPilots(seats) { return Object.fromEntries(seats.map((s) => [s, { decide: () => null }])); }");
    const builder = await loadPilotBuilder("bare.mjs", "commander");
    expect(builder.pilotV).toBeUndefined();
  });
});
