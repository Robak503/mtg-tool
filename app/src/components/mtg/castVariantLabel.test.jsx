/**
 * castVariantLabel.test.jsx — a kicked or teamwork cast names itself in the action label (shelf D16): without it the plain and the
 * paid variant of one card read identically in the action bar and the post-game debrief, and a teamwork cast taps creatures the
 * player never saw named.
 */
import { describe, expect, it } from "vitest";
import { actionLabel } from "./LearnBoard.jsx";

describe("actionLabel — cast variants", () => {
  it("the teamwork and kicked casts say so; the plain cast reads as before", () => {
    const base = { kind: "cast-spell", name: "HULK SMASH!", targetName: "Sol Ring, Grizzly Bears, Hill Giant" };
    expect({
      plain: actionLabel({ ...base, kicked: false }),
      teamwork: actionLabel({ ...base, kicked: true, kickedName: "teamwork: tap Grizzly Bears, Hill Giant" }),
      kicked: actionLabel({ kind: "cast-spell", name: "Burst Lightning", targetName: "Hill Giant", kicked: true, kickedName: "kicked" }),
    }).toEqual({
      plain: "Cast HULK SMASH! → Sol Ring, Grizzly Bears, Hill Giant",
      teamwork: "Cast HULK SMASH! → Sol Ring, Grizzly Bears, Hill Giant (teamwork: tap Grizzly Bears, Hill Giant)",
      kicked: "Cast Burst Lightning → Hill Giant (kicked)",
    });
  });
});
