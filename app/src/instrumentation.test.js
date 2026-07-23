/**
 * Tests for the server-startup hook (instrumentation.register).
 *
 * Covers the B3 boot pre-warm: after the eager profiles migration, the card + rulings indexes are
 * warmed NON-BLOCKING (via setImmediate) so it never delays boot, only runs in the nodejs runtime,
 * and a failing warm falls back to the lazy path instead of throwing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  getCardIndex: vi.fn(),
  getRulingsIndex: vi.fn(),
}));

vi.mock("./lib/server/profiles.js", () => ({ ensureMigrated: h.ensureMigrated }));
vi.mock("./lib/server/cardIndex.js", () => ({
  getCardIndex: h.getCardIndex,
  getRulingsIndex: h.getRulingsIndex,
}));

import { register } from "./instrumentation.js";

// Let the scheduled setImmediate warm + its dynamic import + the getter calls all settle.
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

describe("instrumentation.register — boot pre-warm (B3)", () => {
  let prevRuntime;
  beforeEach(() => {
    prevRuntime = process.env.NEXT_RUNTIME;
    h.ensureMigrated.mockReset();
    h.getCardIndex.mockReset();
    h.getRulingsIndex.mockReset();
  });
  afterEach(() => {
    if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = prevRuntime;
    vi.restoreAllMocks();
  });

  it("migrates eagerly and pre-warms the card + rulings indexes in the nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    // Migration is awaited (done by the time register resolves); the warm is scheduled, not yet run.
    expect(h.ensureMigrated).toHaveBeenCalledTimes(1);
    await flush();
    expect(h.getCardIndex).toHaveBeenCalledTimes(1);
    expect(h.getRulingsIndex).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside the nodejs runtime (e.g. edge)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    await flush();
    expect(h.ensureMigrated).not.toHaveBeenCalled();
    expect(h.getCardIndex).not.toHaveBeenCalled();
    expect(h.getRulingsIndex).not.toHaveBeenCalled();
  });

  it("a failing pre-warm never rejects register and falls back to the lazy path", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.getCardIndex.mockImplementation(() => {
      throw new Error("index read boom");
    });
    // register itself must resolve cleanly — the warm is best-effort.
    await expect(register()).resolves.toBeUndefined();
    await flush();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("boot pre-warm failed"),
      expect.stringContaining("index read boom"),
    );
  });
});
