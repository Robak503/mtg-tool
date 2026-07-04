// P2 v1 — recordFromSession is pure + total: unknown fields become nulls,
// the log tail is capped, nothing throws on garbage.
import { describe, expect, it } from "vitest";

import { recordFromSession } from "./gameRecordsStore.js";

describe("recordFromSession", () => {
  it("copies a terminal session defensively", () => {
    const r = recordFromSession(
      {
        id: "sess-1",
        status: "user-wins",
        difficulty: "beginner",
        state: { turn: 9 },
        meta: { seatNames: ["Koma", "Ur-Dragon"] },
      },
      ["Turn 9 — lethal on board", "Game over: you win"],
    );
    expect(r.id).toBe("sess-1");
    expect(r.source).toBe("academy");
    expect(r.status).toBe("user-wins");
    expect(r.turns).toBe(9);
    expect(r.meta.seatNames).toEqual(["Koma", "Ur-Dragon"]);
    expect(r.logTail).toHaveLength(2);
    expect(typeof r.endedAt).toBe("string");
  });

  it("totals on a garbage session (all nulls, no throw)", () => {
    const r = recordFromSession(null, null);
    expect(r.status).toBeNull();
    expect(r.turns).toBeNull();
    expect(r.meta).toBeNull();
    expect(r.logTail).toEqual([]);
    expect(r.id).toMatch(/^rec_/);
  });

  it("caps the log tail", () => {
    const r = recordFromSession({ id: "s" }, Array.from({ length: 500 }, (_, i) => `line ${i}`));
    expect(r.logTail).toHaveLength(160);
    expect(r.logTail[159]).toBe("line 499"); // tail-capped: newest lines kept
  });
});
