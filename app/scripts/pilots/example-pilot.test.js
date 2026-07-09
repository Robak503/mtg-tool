/**
 * example-pilot.test.js — locks the reference pilot module's CONTRACT so the template (and thus the
 * documented `--pilot=<path>` shape Omnath's personas must satisfy) can't silently drift. The actual
 * injection + per-row {playbook,temperament} tagging + determinism-preservation is proven end-to-end
 * by running `self-play.mjs --pilot=… --export-trajectories=…` (see the pilot-seam handoff); this unit
 * test guards the two accepted export shapes and the tag values.
 */
import { describe, it, expect } from "vitest";
import { buildPilots, decide, playbook, temperament } from "./example-pilot.mjs";

describe("example-pilot — reference pilot module contract", () => {
  it("shape (A): buildPilots(seats) returns a tagged pilot per seat (standard = 2 seats)", () => {
    const pilots = buildPilots(["user", "ai"], { mode: "standard" });
    expect(Object.keys(pilots).sort()).toEqual(["ai", "user"]);
    for (const seat of ["user", "ai"]) {
      expect(pilots[seat]).toMatchObject({ playbook: "reference", temperament: "balanced" });
      expect(typeof pilots[seat].decide).toBe("function");
    }
  });
  it("shape (A): buildPilots covers all four commander seats", () => {
    const pilots = buildPilots(["user", "ai1", "ai2", "ai3"], { mode: "commander" });
    expect(Object.keys(pilots).sort()).toEqual(["ai1", "ai2", "ai3", "user"]);
    expect(pilots.ai3).toMatchObject({ playbook: "reference", temperament: "balanced" });
    expect(typeof pilots.ai3.decide).toBe("function");
  });
  it("shape (B): also exposes the bare single-pilot exports (decide + playbook + temperament)", () => {
    expect(typeof decide).toBe("function");
    expect(playbook).toBe("reference");
    expect(temperament).toBe("balanced");
  });
  it("decide defers to the default (returns undefined) when there is no legal action to pick", () => {
    // A persona with no opinion returns undefined → the runner falls back to the default autopilot pick
    // (never an illegal move). With an empty legalActions set the wrapped pickAction yields null, so decide
    // returns undefined — and it must NOT throw.
    expect(decide({ state: { players: { user: {} } }, legalActions: [], seat: "user" })).toBeUndefined();
  });
});
