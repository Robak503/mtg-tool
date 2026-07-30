/**
 * opponentSweepScope.test.js — SYMBURN-4: "deals N damage to each opponent and each creature[ and
 * planeswalker] they control." (4 cards.)
 *
 * Goblin Chainwhirler · End the Festivities · Tectonic Hazard · Wildfire Cerberus.
 *
 * ⭐ THE DEFINING PROPERTY IS ONE-SIDEDNESS, and it is the whole reason these cards are good. The caster's
 * seat and the caster's board are NEVER touched. A symmetric implementation would not be a slightly-wrong
 * Chainwhirler; it would be Pyroclasm plus a Shock to yourself — a different card. The runtime enforces it
 * structurally by iterating `opponentsOf(controller)` rather than every seat, so there is no filter to get
 * wrong: the caster is never in the loop at all.
 *
 * ⭐ TWO SCOPES, NOT A FLAG, for the same reason eachCreatureAndPlaneswalker is split from
 * eachCreatureAndPlayer: damage to a planeswalker is LOYALTY removal (CR 120.3c), a different effect on a
 * different object. Chainwhirler and End the Festivities say "and planeswalker"; Tectonic Hazard and Wildfire
 * Cerberus do not, and must leave walkers alone.
 *
 * ⛔ "they control" IS INSIDE THE ANCHOR. It is what scopes the creatures to the opponents' boards; a form
 * without it would be the symmetric card. And this shape carries TWO internal " and "s, so the splitter needed
 * its own keep-whole guard — without it the sentence broke into a first half that parses HIGH on its own
 * ("…to each opponent" is a modeled scope) beside an unbindable "each creature they control", which is the
 * dropped-effect shape.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (line, type = "Sorcery") => {
  const parts = splitClauses(line);
  return { parts, atom: (parseEffectClause(parts[0], type, { hasX: false })?.atoms || [])[0] || null };
};
const dmg = (s, side, id) => (s.players[side].battlefield.find((p) => p.id === id)?.damageMarked || 0);
const loy = (s, side, id) => (s.players[side].battlefield.find((p) => p.id === id)?.counters?.loyalty ?? null);
const life = (s, side) => s.players[side].life;

describe("⭐ the two printed shapes parse into their two scopes, whole", () => {
  it("without 'and planeswalker' (Tectonic Hazard, Wildfire Cerberus)", () => {
    const { parts, atom } = atomOf("Tectonic Hazard deals 1 damage to each opponent and each creature they control.");
    expect(parts).toHaveLength(1);   // TWO internal " and "s, both inside the one recipient
    expect(atom).toEqual({ op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreatures" });
  });

  it("with 'and planeswalker' (Goblin Chainwhirler, End the Festivities)", () => {
    const { parts, atom } = atomOf("It deals 1 damage to each opponent and each creature and planeswalker they control.", "Creature");
    expect(parts).toHaveLength(1);
    expect(atom).toEqual({ op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreaturesPW" });
  });

  it("⛔ WITHOUT 'they control' it is refused — that phrase is what makes the sweep one-sided", () => {
    // "each opponent and each creature" (no scoping tail) would be an opponents' seats + EVERY creature,
    // including the caster's. Crediting it as this scope would spare creatures the card hits, and hit the
    // caster's creatures which... it also hits. Either way it is a different card, so it parks.
    const { atom } = atomOf("Nameless deals 1 damage to each opponent and each creature.");
    expect(atom?.targetType).not.toBe("eachOpponentAndTheirCreatures");
    expect(atom?.targetType).not.toBe("eachOpponentAndTheirCreaturesPW");
  });

  it("⛔ the subject-prefix guard still splits a LEADING effect joined by ' and '", () => {
    const { parts } = atomOf("You gain 5 life and Nameless deals 1 damage to each opponent and each creature they control.");
    expect(parts.length).toBeGreaterThan(1);   // the life gain must NOT be swallowed
  });
});

describe("⛔⭐ RUNTIME — one-sided, and the walker variant is the only one that touches walkers", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const crea = (id, ctrl) => createPermanent({ id, card: { id: `c${id}`, name: id, type: "Creature — Test", power: 2, toughness: 9 }, controller: ctrl });
    const pw = (id, ctrl) => ({ ...createPermanent({ id, card: { id: `c${id}`, name: id, type: "Legendary Planeswalker — Test" }, controller: ctrl }), counters: { loyalty: 5 } });
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [crea("u-crea", "user"), pw("u-pw", "user")] },
      ai1: { ...s.players.ai1, battlefield: [crea("a1-crea", "ai1"), pw("a1-pw", "ai1")] },
      ai2: { ...s.players.ai2, battlefield: [crea("a2-crea", "ai2")] } } };
  }

  it("⭐ every OPPONENT loses life and every creature THEY control is damaged", () => {
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreatures" }, { controller: "user" });
    expect(life(after, "ai1")).toBe(life(before, "ai1") - 1);
    expect(life(after, "ai2")).toBe(life(before, "ai2") - 1);
    expect(dmg(after, "ai1", "a1-crea")).toBe(1);
    expect(dmg(after, "ai2", "a2-crea")).toBe(1);
  });

  it("⛔ THE LOAD-BEARING ONE — the CASTER's seat and board are untouched", () => {
    // The mutation target. Iterating every seat instead of opponentsOf() turns Chainwhirler into a symmetric
    // wipe that also shocks its own controller — a different card, credited under this one's name.
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreatures" }, { controller: "user" });
    expect(life(after, "user")).toBe(life(before, "user"));
    expect(dmg(after, "user", "u-crea")).toBe(0);
    expect(loy(after, "user", "u-pw")).toBe(5);
  });

  it("⛔ the NON-walker scope leaves opponents' PLANESWALKERS alone", () => {
    // Tectonic Hazard does not say "and planeswalker", so a1-pw keeps all 5 loyalty.
    const after = resolveAtom(board(), { op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreatures" }, { controller: "user" });
    expect(loy(after, "ai1", "a1-pw")).toBe(5);
  });

  it("⭐ the WALKER scope removes loyalty from opponents' walkers — and still spares the caster's", () => {
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 1, targetType: "eachOpponentAndTheirCreaturesPW" }, { controller: "user" });
    expect(loy(after, "ai1", "a1-pw")).toBe(4);
    expect(dmg(after, "ai1", "a1-crea")).toBe(1);
    expect(loy(after, "user", "u-pw")).toBe(5);      // one-sidedness holds in the PW variant too
    expect(life(after, "user")).toBe(life(before, "user"));
  });
});

describe("⭐ the four carriers classify native", () => {
  const CARDS = [
    { name: "Tectonic Hazard", type: "Sorcery", mana: "{R}", oracle: "Tectonic Hazard deals 1 damage to each opponent and each creature they control." },
    { name: "End the Festivities", type: "Sorcery", mana: "{R}", oracle: "End the Festivities deals 1 damage to each opponent and each creature and planeswalker they control." },
    { name: "Goblin Chainwhirler", type: "Creature — Goblin Warrior", mana: "{R}{R}{R}", power: 3, toughness: 3, keywords: ["First strike"],
      oracle: "First strike\nWhen this creature enters, it deals 1 damage to each opponent and each creature and planeswalker they control." },
  ];
  for (const card of CARDS) {
    it(`${card.name}`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
