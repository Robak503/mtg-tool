/**
 * grindLoop.test.js — the continuous grind loop's STATE-MACHINE GUARDS (the cheap, deterministic part). The full
 * run-until-cancel loop (plays real games + appends to disk) is verified end-to-end by a manual probe (see the
 * grind-button handoff), not here — a unit test never spins the real engine loop. These lock the guards that keep
 * the button honest: a fresh idle status, cancel-on-idle is a no-op, and start REFUSES too-few decks (never a
 * degenerate pod) without ever firing the loop.
 */
import { describe, it, expect } from "vitest";
import { grindStatus, requestGrindCancel, startGrind } from "./grindLoop.js";

describe("grindLoop — guards + idle state machine", () => {
  it("fresh status is idle (not running, zero games)", () => {
    const s = grindStatus();
    expect(s.running).toBe(false);
    expect(s.gamesPlayed).toBe(0);
    expect(s.capReached).toBe(false);
  });

  it("cancel on an idle loop is a no-op (nothing to stop)", () => {
    const s = requestGrindCancel();
    expect(s.running).toBe(false);
    expect(s.cancelRequested).toBe(false); // only set while a grind is actually running
  });

  it("start REFUSES commander with < 4 decks (never starts a degenerate pod / the loop)", async () => {
    const r = await startGrind({ decks: [{ cards: [1] }, { cards: [1] }], mode: "commander" });
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/at least 4/);
    expect(grindStatus().running).toBe(false); // the loop was never fired
  });

  it("start REFUSES standard with < 2 decks", async () => {
    const r = await startGrind({ decks: [{ cards: [1] }], mode: "standard" });
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/at least 2/);
    expect(grindStatus().running).toBe(false);
  });

  it("start REFUSES a non-array / empty decks input", async () => {
    expect((await startGrind({ decks: null, mode: "commander" })).started).toBe(false);
    expect((await startGrind({ decks: [], mode: "standard" })).started).toBe(false);
  });
});
