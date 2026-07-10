/**
 * ramThrough.test.js — DAMAGE-POWER-TRAMPLE-EXCESS (SHELF slice W2, Ram Through).
 *
 * "Target creature you control deals damage equal to its power to target creature you don't
 * control. If the creature you control has trample, excess damage is dealt to that creature's
 * controller instead." → ONE damage-target-power atom with trampleExcess. The resolver assigns
 * lethal (remaining toughness, or 1 with deathtouch — CR 702.19b) to the dealee and routes the
 * excess to the dealee's controller ONLY when the dealer actually has trample at resolution.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.";

function setup(dealerCard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const dealer = createPermanent({ card: dealerCard, controller: "user" });
  const dealee = createPermanent({ card: { name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 2 }, controller: "ai" });
  const s = {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [dealer] },
      ai: { ...s0.players.ai, battlefield: [dealee] },
    },
  };
  return { s, dealer, dealee };
}

const ATOM = {
  op: "damage-target-power", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
  secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
  trampleExcess: true,
};
const run = (s, dealer, dealee) => resolveAtom(s, ATOM, {
  controller: "user",
  targets: [
    { id: dealee.id, type: "creature", controller: "ai", role: "target" },
    { id: dealer.id, type: "creature", controller: "user", role: "fighter" },
  ],
});

describe("Ram Through — parse", () => {
  it("collapses to one damage-target-power atom with trampleExcess, HIGH", () => {
    const prog = parseEffectProgram({ name: "Ram Through", type: "Instant", oracle: ORACLE });
    expect(prog.confidence).toBe("high");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0].op).toBe("damage-target-power");
    expect(prog.atoms[0].trampleExcess).toBe(true);
  });
});

describe("Ram Through — resolver", () => {
  it("trampling 5-power dealer vs 1/2: dealee dies, 3 excess hits its controller", () => {
    const { s, dealer, dealee } = setup({ name: "Rhino", type: "Creature — Rhino", power: 5, toughness: 4, oracle: "Trample" });
    const lifeBefore = s.players.ai.life;
    const next = run(s, dealer, dealee);
    expect(findPermanent(next, dealee.id)).toBeNull();               // died to the lethal share
    expect(next.players.ai.life).toBe(lifeBefore - 3);               // 5 - 2 remaining toughness
  });

  it("NON-trampling dealer: all 5 to the creature, no player damage", () => {
    const { s, dealer, dealee } = setup({ name: "Ox", type: "Creature — Ox", power: 5, toughness: 4 });
    const lifeBefore = s.players.ai.life;
    const next = run(s, dealer, dealee);
    expect(findPermanent(next, dealee.id)).toBeNull();
    expect(next.players.ai.life).toBe(lifeBefore);                   // the rider did not apply
  });

  it("deathtouch + trample: 1 is lethal (CR 702.19b), 4 excess to the controller", () => {
    const { s, dealer, dealee } = setup({ name: "Basilisk", type: "Creature — Basilisk", power: 5, toughness: 4, oracle: "Deathtouch, trample" });
    const lifeBefore = s.players.ai.life;
    const next = run(s, dealer, dealee);
    expect(findPermanent(next, dealee.id)).toBeNull();               // deathtouch made 1 lethal
    expect(next.players.ai.life).toBe(lifeBefore - 4);
  });
});

// ── METALCRAFT-DAMAGE (Galvanic Blast, SHELF S7 — same collapse-matcher family) ──
describe("Galvanic Blast — metalcraft amount upgrade", () => {
  const GB = { name: "Galvanic Blast", type: "Instant", oracle: "Galvanic Blast deals 2 damage to any target.\nMetalcraft — Galvanic Blast deals 4 damage instead if you control three or more artifacts." };

  it("collapses to one deal-damage atom with amountUpgrade, HIGH", () => {
    const p = parseEffectProgram(GB);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 2, targetType: "any", amountUpgrade: { kind: "artifactsYouControl", atLeast: 3, amount: 4 } }]);
  });

  it("resolver: 2 damage under 3 artifacts, 4 damage at 3+ (read at resolution)", () => {
    const mk = (nArts) => {
      const s0 = createGameState({ userDeck: [], aiDeck: [] });
      const bf = Array.from({ length: nArts }, (_, i) => createPermanent({ id: "a" + i, card: { name: "Rock" + i, type: "Artifact", oracle: "" }, controller: "user" }));
      const dummy = createPermanent({ id: "tgt", card: { name: "Ox", type: "Creature — Ox", power: 4, toughness: 5 }, controller: "ai" });
      return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: bf }, ai: { ...s0.players.ai, battlefield: [dummy] } } };
    };
    const atom = { op: "deal-damage", amount: 2, targetType: "any", amountUpgrade: { kind: "artifactsYouControl", atLeast: 3, amount: 4 } };
    const hit = (s) => resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt" }] });
    expect(findPermanent(hit(mk(2)), "tgt").permanent.damageMarked).toBe(2); // metalcraft OFF
    expect(findPermanent(hit(mk(3)), "tgt").permanent.damageMarked).toBe(4); // metalcraft ON
  });
});
