/**
 * Planeswalker teaching layer (PW-4): the narrator pre-empts the common loyalty misconceptions
 * (sorcery-speed + once-per-turn, summoning-sick walkers CAN activate, can't pay below 0, combat
 * damage removes loyalty / no redirect, walkers enter with starting loyalty).
 */
import { describe, expect, it } from "vitest";
import { narrateAction } from "./narrator.js";

describe("narrateAction — loyalty abilities (beginner)", () => {
  const base = { kind: "activate-loyalty", name: "Chandra", costDelta: 1, abilityText: "+1: ..." };

  it("teaches once-per-turn + sorcery speed + summoning-sickness exemption", () => {
    const t = narrateAction(base, {}, { difficulty: "beginner" });
    expect(t).toMatch(/only ONE loyalty ability/i);
    expect(t).toMatch(/606\.3/);
    expect(t).toMatch(/main phase/i);
    expect(t).toMatch(/ignore summoning sickness/i);
    expect(t).toMatch(/\+1/);
  });

  it("teaches the can't-pay-below-0 rule on a −N ability", () => {
    const t = narrateAction({ ...base, costDelta: -3 }, {}, { difficulty: "beginner" });
    expect(t).toMatch(/below 0/i);
    expect(t).toMatch(/118\.3/);
    expect(t).toMatch(/removing 3 loyalty/i);
  });

  it("flags an Arbiter-routed (unmodeled) ability and notes the cost is still paid", () => {
    const t = narrateAction({ ...base, costDelta: -6, routeToArbiter: true }, {}, { difficulty: "beginner" });
    expect(t).toMatch(/Arbiter/);
    expect(t).toMatch(/cost is still paid/i);
  });

  it("is terse at intermediate (no teaching paragraph)", () => {
    const t = narrateAction(base, {}, { difficulty: "intermediate" });
    expect(t).not.toMatch(/once|606\.3|summoning/i);
    expect(t).toMatch(/Chandra/);
  });
});

describe("narrateAction — attacking a planeswalker (beginner)", () => {
  it("teaches direct attacks + combat-damage-as-loyalty (no redirect)", () => {
    const t = narrateAction(
      { kind: "declare-attacker", name: "Striker", defenderPlaneswalkerId: "pw", targetName: "Teferi" },
      {}, { difficulty: "beginner" },
    );
    expect(t).toMatch(/120\.3c/);
    expect(t).toMatch(/loyalty counter/i);
    expect(t).toMatch(/redirect/i);
    expect(t).toMatch(/Teferi/);
  });

  it("a normal attack (no walker) keeps the plain teaching", () => {
    const t = narrateAction({ kind: "declare-attacker", name: "Striker" }, {}, { difficulty: "beginner" });
    expect(t).not.toMatch(/loyalty|redirect/i);
    expect(t).toMatch(/tapped/i);
  });
});

describe("narrateAction — casting a planeswalker (beginner)", () => {
  it("notes it enters with loyalty + can activate this turn", () => {
    const card = { name: "Chandra", type: "Legendary Planeswalker — Chandra", oracle: "+1: ..." };
    const t = narrateAction({ kind: "cast-spell", name: "Chandra", cost: { generic: 4 } }, {}, { difficulty: "beginner", card });
    expect(t).toMatch(/starting loyalty/i);
    expect(t).toMatch(/this turn/i);
  });

  it("does NOT add the loyalty note for a creature-front DFC (casts as its creature side)", () => {
    const card = { name: "Jace", type: "Creature — Wizard // Legendary Planeswalker — Jace", card_faces: [{ type_line: "Creature — Wizard" }, { type_line: "Legendary Planeswalker — Jace" }], oracle: "" };
    const t = narrateAction({ kind: "cast-spell", name: "Jace", cost: { generic: 2 } }, {}, { difficulty: "beginner", card });
    expect(t).not.toMatch(/starting loyalty/i);
  });
});
