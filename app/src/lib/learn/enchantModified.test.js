/**
 * enchantModified.test.js — the "Enchant MODIFIED creature" aura host restriction (SHELF-TAIL SH20 — Thrun's
 * Lion Umbra; CR 701.48 + 303.4a). Lion Umbra's bonus (+3/+3, vigilance, reach) and its totem/umbra armor were
 * ALREADY modeled; the sole blocker was the enchant line's "modified" qualifier having no host predicate. Pure
 * WIRING: creatureEnchantRestrictions maps "modified creature" → a {kind:"modified"} restriction, and
 * creatureSatisfiesRestrictions enforces it via layers.isModifiedPermanent — the SAME layer-aware predicate
 * Kodama's "modified creatures you control" anthem reads (a permanent is modified iff it has a counter, an
 * Equipment, or an Aura its controller controls). Flip +1/0/0 (Thrun-specific).
 *
 * Mutation-checked (via Edit): (1) drop the "modified creature" enchant case → Lion Umbra body-only (classify
 * dies); (2) neuter the "modified" branch in creatureSatisfiesRestrictions → a BARE creature wrongly passes the
 * host restriction (the enforcement pin dies).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { isModifiedPermanent } from "./layers.js";
import { createGameState, createPermanent, addCounter, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LION_UMBRA = { name: "Lion Umbra", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant modified creature (Equipment, Auras its controller controls, and counters are modifications.)\nEnchanted creature gets +3/+3 and has vigilance and reach.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)" };

describe("SH20 — classify", () => {
  it("Lion Umbra classifies native-aura (the bonus + totem armor were already modeled; the 'modified' host line now parses)", () => {
    expect(classifyCard(LION_UMBRA)).toBe("native-aura");
  });
});

describe("SH20 — the 'modified' host restriction is ENFORCED (CREED core)", () => {
  function withBoard(perms) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
  }
  it("a creature with a +1/+1 counter IS modified and satisfies the restriction; a bare creature is NOT", () => {
    const modified = createPermanent({ id: "m", card: { name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const bare = createPermanent({ id: "b", card: { name: "Bear2", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    let s = withBoard([modified, bare]);
    s = addCounter(s, { permanentId: "m", type: "+1/+1", amount: 1 });
    const mPerm = s.players.user.battlefield.find((p) => p.id === "m");
    const bPerm = s.players.user.battlefield.find((p) => p.id === "b");
    expect(isModifiedPermanent(s, mPerm)).toBe(true);
    expect(isModifiedPermanent(s, bPerm)).toBe(false);
    const R = [{ kind: "modified", value: true }];
    expect(creatureSatisfiesRestrictions(s, mPerm, "user", "user", R)).toBe(true);   // legal host
    expect(creatureSatisfiesRestrictions(s, bPerm, "user", "user", R)).toBe(false);  // NOT a legal host — the whole point
  });
});
