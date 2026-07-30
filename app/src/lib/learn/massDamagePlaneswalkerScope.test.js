/**
 * massDamagePlaneswalkerScope.test.js — SYMBURN-3 + the NEGATED SUBTYPE parity fix (13 cards).
 *
 * Breath Weapon · Consuming Bonfire · Deathmark Prelate · Dragonback Assault · Electric Seaweed ·
 * Eyeblight's Ending · Fiery Cannonade · Magmaquake · Rend Flesh · Star of Extinction · Storm's Wrath ·
 * Vampires' Vengeance · Walk the Plank.
 *
 * TWO INDEPENDENT PIECES, both finishing work started earlier in the run.
 *
 * ⭐ 1 · "and each PLANESWALKER" is its own recipient set. `eachCreatureAndPlayer` already existed, and the
 * temptation is to treat the walker tail as a variant of it. It is not: the PLAYERS are untouched, and damage
 * to a planeswalker removes that much LOYALTY rather than life (CR 120.3c) — a different effect on a different
 * object. So it gets its own scope, and the loyalty path REUSES the single-target one (damage replacement →
 * prevention shields → loyalty) rather than reimplementing it, because a second loyalty path is how the two
 * would drift.
 *
 * ⭐ 2 · NEGATED SUBTYPE was a PARITY GAP, not a new capability. The mass-DESTROY path has carried
 * `subtypeNegate` since Crux of Fate ("destroy all non-Dragon creatures") and `massCreatureTargets`
 * implements it — but the SHARED restriction grammar, which the damage side reads, only ever emitted the
 * positive subtype. The same printed filter was sayable to one verb and not its neighbour. Fixing it in the
 * shared grammar paid on BOTH sides at once: the mass sweeps (Breath Weapon, Fiery Cannonade, Vampires'
 * Vengeance) AND single-target removal (Eyeblight's Ending, Rend Flesh, Walk the Plank).
 *
 * ⛔ THE THREE HAZARDS, all pinned at RUNTIME and mutation-checked:
 *   A. the walker sweep must NOT touch players;
 *   B. the walker half must NOT be narrowed by a CREATURE restriction (Magmaquake hits every walker even
 *      though its creature half is non-flyers only);
 *   C. a negated subtype must be the exact INVERSE — a Dragon is spared by "each non-Dragon creature".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (line, type = "Sorcery", opts = { hasX: false }) => {
  const parts = splitClauses(line);
  return { parts, atom: (parseEffectClause(parts[0], type, opts)?.atoms || [])[0] || null };
};
const dmg = (s, side, id) => (s.players[side].battlefield.find((p) => p.id === id)?.damageMarked || 0);
const loy = (s, side, id) => (s.players[side].battlefield.find((p) => p.id === id)?.counters?.loyalty ?? null);
const life = (s, side) => s.players[side].life;

describe("⭐ 1 · the PLANESWALKER tail parses into its own scope, and survives the splitter", () => {
  it("the bare form (Star of Extinction, Storm's Wrath)", () => {
    const { parts, atom } = atomOf("Star of Extinction deals 20 damage to each creature and each planeswalker.");
    expect(parts).toHaveLength(1);   // the " and " is INTERNAL to one recipient — the splitter must not cut it
    expect(atom).toEqual({ op: "deal-damage", amount: 20, targetType: "eachCreatureAndPlaneswalker", restrictions: [] });
  });

  it("the FILTERED + X form (Magmaquake)", () => {
    const { parts, atom } = atomOf("Magmaquake deals X damage to each creature without flying and each planeswalker.", "Sorcery", { hasX: true });
    expect(parts).toHaveLength(1);
    expect(atom).toEqual({ op: "deal-damage", amountX: true, targetType: "eachCreatureAndPlaneswalker",
      restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] });
  });

  it("⛔ 'and each OPPONENT' is still REFUSED — no combined scope exists for an opponents-only sweep", () => {
    const { parts } = atomOf("Nameless deals 2 damage to each creature and each opponent.");
    expect(parts.length).toBeGreaterThan(1);   // still split → the unbindable half drags the program low
    expect(isNativeTier(classifyCard({ name: "Fake Opp Sweep", type: "Sorcery", mana: "{2}{R}",
      oracle: "Fake Opp Sweep deals 2 damage to each creature and each opponent." }))).toBe(false);
  });

  it("⛔ the PLAYER scope is untouched (no cross-wiring between the two tails)", () => {
    const { atom } = atomOf("Inferno deals 6 damage to each creature and each player.", "Instant");
    expect(atom.targetType).toBe("eachCreatureAndPlayer");
  });
});

describe("⛔⭐ RUNTIME — creatures AND walkers, never players", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const crea = (id, ctrl, kws = []) => createPermanent({ id, card: { id: `c${id}`, name: id, type: "Creature — Test", power: 2, toughness: 9, keywords: kws }, controller: ctrl });
    const pw = (id, ctrl) => ({ ...createPermanent({ id, card: { id: `c${id}`, name: id, type: "Legendary Planeswalker — Test" }, controller: ctrl }), counters: { loyalty: 5 } });
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [crea("u-fly", "user", ["flying"]), crea("u-ground", "user"), pw("u-pw", "user")] },
      ai: { ...s.players.ai, battlefield: [crea("a-ground", "ai"), pw("a-pw", "ai")] } } };
  }
  const ATOM = { op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlaneswalker" };

  it("⭐ every creature is damaged and every walker loses that much LOYALTY", () => {
    const before = board();
    const after = resolveAtom(before, ATOM, { controller: "user" });
    expect(dmg(after, "user", "u-ground")).toBe(3);
    expect(dmg(after, "ai", "a-ground")).toBe(3);
    expect(loy(after, "user", "u-pw")).toBe(2);   // 5 − 3, loyalty removal (CR 120.3c)
    expect(loy(after, "ai", "a-pw")).toBe(2);
  });

  it("⛔ HAZARD A — NO player loses life", () => {
    // The mutation target. "Each planeswalker" is not "each player"; draining life here would invent damage
    // the card never deals, on every seat at the table.
    const before = board();
    const after = resolveAtom(before, ATOM, { controller: "user" });
    expect(life(after, "user")).toBe(life(before, "user"));
    expect(life(after, "ai")).toBe(life(before, "ai"));
  });

  it("⛔ HAZARD B — a CREATURE restriction narrows the creatures ONLY, never the walkers", () => {
    // Magmaquake: "each creature WITHOUT FLYING and each planeswalker". The flyer is spared; both walkers
    // are hit regardless, because a creature predicate says nothing about a planeswalker.
    const before = board();
    const after = resolveAtom(before, { ...ATOM, restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }, { controller: "user" });
    expect(dmg(after, "user", "u-ground")).toBe(3);
    expect(dmg(after, "user", "u-fly")).toBe(0);     // spared by the filter
    expect(loy(after, "user", "u-pw")).toBe(2);      // hit anyway
    expect(loy(after, "ai", "a-pw")).toBe(2);
  });

  it("⛔⭐ HAZARD B, THE DISCRIMINATING CASE — a restriction NO walker satisfies must still not spare them", () => {
    // ⚠️ THE TEST ABOVE IS NOT ENOUGH, AND A MUTATION PROVED IT. Applying the creature filter to the walker
    // loop left all 16 tests green, because "without flying" is a predicate a planeswalker PASSES — so
    // filtering the walkers by it changed nothing. Only a restriction a walker FAILS can catch that mutation.
    // `hasKeyword flying` (positive) is such a predicate: no planeswalker has flying, so if the walker half
    // were filtered, both walkers would be skipped and their loyalty untouched.
    const before = board();
    const after = resolveAtom(before, { ...ATOM, restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }, { controller: "user" });
    expect(dmg(after, "user", "u-fly")).toBe(3);      // the flyer matches the creature filter
    expect(dmg(after, "user", "u-ground")).toBe(0);   // the ground creature does not
    expect(loy(after, "user", "u-pw")).toBe(2);       // ⛔ the walkers are hit REGARDLESS
    expect(loy(after, "ai", "a-pw")).toBe(2);
  });
});

describe("⛔⭐ 2 · NEGATED SUBTYPE — the exact inverse, on both the mass and single-target sides", () => {
  it("the mass sweeps parse with negate:true", () => {
    for (const [line, sub] of [
      ["Breath Weapon deals 2 damage to each non-Dragon creature.", "dragon"],
      ["Fiery Cannonade deals 2 damage to each non-Pirate creature.", "pirate"],
      ["Vampires' Vengeance deals 2 damage to each non-Vampire creature.", "vampire"],
    ]) {
      expect(atomOf(line, "Instant").atom, line).toEqual({ op: "deal-damage", amount: 2, targetType: "eachCreature",
        restrictions: [{ kind: "subtype", subtype: sub, negate: true }] });
    }
  });

  it("⛔ HAZARD C — RUNTIME: the named subtype is SPARED, everything else is hit", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type) => createPermanent({ id, card: { id: `c${id}`, name: id, type, power: 2, toughness: 9 }, controller: "user" });
    const w = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("drake", "Creature — Dragon"), mk("bear", "Creature — Bear")] } } };
    const after = resolveAtom(w, { op: "deal-damage", amount: 2, targetType: "eachCreature",
      restrictions: [{ kind: "subtype", subtype: "dragon", negate: true }] }, { controller: "user" });
    expect(dmg(after, "user", "drake")).toBe(0);   // ⛔ a Dragon is spared by "each NON-Dragon creature"
    expect(dmg(after, "user", "bear")).toBe(2);
  });

  it("⛔ the POSITIVE subtype is unchanged (the incumbent direction)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type) => createPermanent({ id, card: { id: `c${id}`, name: id, type, power: 2, toughness: 9 }, controller: "user" });
    const w = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("drake", "Creature — Dragon"), mk("bear", "Creature — Bear")] } } };
    const after = resolveAtom(w, { op: "deal-damage", amount: 2, targetType: "eachCreature",
      restrictions: [{ kind: "subtype", subtype: "dragon" }] }, { controller: "user" });
    expect(dmg(after, "user", "drake")).toBe(2);
    expect(dmg(after, "user", "bear")).toBe(0);
  });

  it("⛔ a non-subtype word after 'non-' is NOT taken as a subtype", () => {
    // The curated allowlist is what stops "non-token" / "non-legendary" from becoming a bogus type-line scan
    // that silently matches nothing. Those stay residue → unclean → Arbiter.
    expect(atomOf("Incandescent Aria deals 2 damage to each nontoken creature.", "Instant").atom).toBe(null);
  });
});

describe("⭐ the cards this slice graduated", () => {
  const CARDS = [
    { name: "Star of Extinction", type: "Sorcery", mana: "{3}{R}{R}", oracle: "Destroy target land. Star of Extinction deals 20 damage to each creature and each planeswalker." },
    { name: "Storm's Wrath", type: "Sorcery", mana: "{2}{R}{R}", oracle: "Storm's Wrath deals 4 damage to each creature and each planeswalker." },
    { name: "Magmaquake", type: "Sorcery", mana: "{X}{2}{R}", oracle: "Magmaquake deals X damage to each creature without flying and each planeswalker." },
    { name: "Fiery Cannonade", type: "Instant", mana: "{2}{R}", oracle: "Fiery Cannonade deals 2 damage to each non-Pirate creature." },
    { name: "Walk the Plank", type: "Sorcery", mana: "{1}{B}", oracle: "Destroy target non-Merfolk creature." },
  ];
  for (const card of CARDS) {
    it(`${card.name} is native`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
