/**
 * frenziedBaloth.test.js — SG-11 (2026-09-03): Frenzied Baloth — "Combat damage can't be prevented." (the
 * Squirrel Girl deck; its other three lines were already native). A board-wide static (CR 615.12): while it is
 * out, a resolved Fog does nothing to combat damage, a creature's printed prevent-all wall is inert, and a
 * prevent-style damage replacement is skipped for combat deals. Noncombat prevention is untouched.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { combatDamageUnpreventable, applyDamageReplacements } from "./damageReplacements.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BALOTH = { id: "c-baloth", name: "Frenzied Baloth", type: "Creature — Beast", mana: "{2}{G}{G}", power: 4, toughness: 4, keywords: ["trample", "haste"], oracle: "This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented." };
const bear = (id, power = 3) => createPermanent({ id, card: { id: "c-" + id, name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });

function board({ baloth, fog }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const turn = 6;
  return {
    ...s0, turn, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user",
    preventCombatDamageTurn: fog ? turn : null,
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("atk"), ...(baloth ? [createPermanent({ id: "baloth", card: BALOTH, controller: "user", summoningSick: false })] : [])] },
      ai: { ...s0.players.ai, life: 40, battlefield: [] },
    },
  };
}

describe("the reader", () => {
  it("sees the sentence on any battlefield; a rider does not count", () => {
    expect(combatDamageUnpreventable(board({ baloth: true }))).toBe(true);
    expect(combatDamageUnpreventable(board({ baloth: false }))).toBe(false);
    const s = board({ baloth: false });
    s.players.ai.battlefield = [createPermanent({ id: "x", card: { ...BALOTH, oracle: "Combat damage can't be prevented if it's your turn." }, controller: "ai" })];
    expect(combatDamageUnpreventable(s)).toBe(false);
  });
});

describe("runtime — the fog latch", () => {
  it("⭐ with Baloth out, a resolved Fog does nothing: the 3-power attacker connects", () => {
    const out = resolveCombatDamage(board({ baloth: true, fog: true }));
    expect(out.players.ai.life).toBe(37);
  });

  it("without Baloth the same Fog prevents everything", () => {
    const out = resolveCombatDamage(board({ baloth: false, fog: true }));
    expect(out.players.ai.life).toBe(40);
  });
});

describe("runtime — prevent-style replacements", () => {
  it("⭐ Temple Altisaur's 'prevent all but 1' is skipped for a COMBAT deal while Baloth is out — and still caps a noncombat deal", () => {
    const s = board({ baloth: true });
    const altisaur = { id: "c-alt", name: "Temple Altisaur", type: "Creature — Dinosaur", mana: "{4}{W}", power: 3, toughness: 7, oracle: "If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage." };
    const dino = { id: "c-dino", name: "Dino", type: "Creature — Dinosaur", mana: "{2}{G}", power: 3, toughness: 3, oracle: "" };
    s.players.ai.battlefield = [createPermanent({ id: "alt", card: altisaur, controller: "ai" }), createPermanent({ id: "dino", card: dino, controller: "ai" })];
    const ev = { sourceId: "atk", sourceController: "user", amount: 3, targetKind: "creature", targetId: "dino" };
    expect(applyDamageReplacements(s, { ...ev, isCombat: false }).amount).toBe(1);
    expect(applyDamageReplacements(s, { ...ev, isCombat: true }).amount).toBe(3);
    // Without Baloth the cap bites in combat too.
    const plain = board({ baloth: false });
    plain.players.ai.battlefield = s.players.ai.battlefield;
    expect(applyDamageReplacements(plain, { ...ev, isCombat: true }).amount).toBe(1);
  });
});

describe("classification", () => {
  it("Frenzied Baloth is native; a rider on the sentence parks", () => {
    expect(classifyCard(BALOTH)).toMatch(/^native/);
    expect(classifyCard({ ...BALOTH, oracle: BALOTH.oracle.replace("Combat damage can't be prevented.", "Combat damage can't be prevented if it's your turn.") })).not.toMatch(/^native/);
  });
});
