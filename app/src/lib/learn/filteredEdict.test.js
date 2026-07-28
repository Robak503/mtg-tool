/**
 * filteredEdict.test.js — the TOKEN-SPLIT and PLANESWALKER edict pools (CR 701.16):
 * Accursed Marauder #464 · Sheoldred's Edict #1154 · Angrath's Rampage · Gaius van Baelsar.
 *
 *   "Each player sacrifices a NONTOKEN creature of their choice."
 *   "Each opponent sacrifices a CREATURE TOKEN of their choice."
 *   "Target player sacrifices a PLANESWALKER of their choice."
 *
 * Found by probe-near-miss-clauses.mjs, one word from "each player sacrifices a creature of their
 * choice" (Slum Reaper). The edict machinery was already pool-parameterized — advanceSacrificeChain
 * takes a `what` and sacrificePoolMatch interprets it, with land / artifact / enchantment / union pools
 * already in place. Only these three cells were missing.
 *
 * ⚠️ THE TOKEN SENSE IS THE WHOLE CARD, in both directions. The nontoken filter is what makes
 * Sheoldred's Edict good — it reaches past a wall of Zombie tokens to the real threat. Read backwards
 * it does the exact opposite of what it says, and a wrong-victim sacrifice is a forbidden false
 * positive, not a missing effect. So the two pools are separate switch cases rather than one flag, and
 * both senses are pinned below against the SAME board.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { advanceSacrificeChain } from "./effects/atoms/removal.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atom = (clause) => parseEffectClause(clause).atoms[0];

const CARDS = {
  bear: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  zombie: { id: "c-zomb", name: "Zombie", type: "Creature — Zombie", power: 2, toughness: 2, oracle: "", token: true },
  walker: { id: "c-jace", name: "Jace Beleren", type: "Legendary Planeswalker — Jace", oracle: "" },
  rock: { id: "c-rock", name: "Sol Ring", type: "Artifact", oracle: "" },
};

/** The AI holds one nontoken creature, one creature TOKEN, a planeswalker and an artifact. */
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      ai: {
        ...s.players.ai,
        battlefield: Object.entries(CARDS).map(([id, card]) =>
          createPermanent({ id, card, controller: "ai", summoningSick: false })),
      },
    },
  };
}
/** Run a one-sacrificer chain and report which of the AI's permanents is gone. */
function sacrificed(what) {
  const before = board();
  const after = advanceSacrificeChain(before, { queue: [{ playerId: "ai", what }] });
  const left = new Set((after.players.ai.battlefield || []).map((p) => p.id));
  return Object.keys(CARDS).filter((id) => !left.has(id));
}

describe("the parser — three new pools, the bare form untouched", () => {
  it("nontoken / token / planeswalker each map to their own pool", () => {
    expect(atom("each player sacrifices a nontoken creature of their choice"))
      .toEqual({ op: "sacrifice", who: "eachPlayer", what: "nontokenCreature" });
    expect(atom("each opponent sacrifices a creature token of their choice"))
      .toEqual({ op: "sacrifice", who: "eachOpponent", what: "creatureToken" });
    expect(atom("target player sacrifices a planeswalker of their choice"))
      .toEqual({ op: "sacrifice", targetType: "player", what: "planeswalker" });
  });

  it("REGRESSION PIN — the bare creature edicts are byte-identical", () => {
    expect(atom("each player sacrifices a creature of their choice"))
      .toEqual({ op: "sacrifice", who: "eachPlayer", what: "creature" });
    expect(atom("target opponent sacrifices a creature"))
      .toEqual({ op: "sacrifice", targetType: "opponent", what: "creature" });
  });

  it("'creature token' is never shaved to 'creature' by the alternation", () => {
    // The nouns are ordered longest-first precisely so this doesn't rely on regex backtracking.
    expect(atom("each player sacrifices a creature token of their choice").what).toBe("creatureToken");
  });

  it("CREED — an unmodeled filter still parks (a wrong-victim sac is a forbidden FP)", () => {
    expect(parseEffectClause("each player sacrifices a creature with flying of their choice").atoms?.[0]?.op)
      .not.toBe("sacrifice");
  });
});

describe("RUNTIME — the pool decides the victim, and the sense is the card", () => {
  it("THE LOAD-BEARING PAIR — nontoken takes the Bear, token takes the Zombie, from the SAME board", () => {
    // Backwards, Sheoldred's Edict eats your opponent's spare token instead of their threat: the exact
    // opposite of what it says, and invisible in the coverage tier.
    expect(sacrificed("nontokenCreature")).toEqual(["bear"]);
    expect(sacrificed("creatureToken")).toEqual(["zombie"]);
  });

  it("the planeswalker pool takes the walker, never a creature", () => {
    expect(sacrificed("planeswalker")).toEqual(["walker"]);
  });

  it("an EMPTY pool is a clean no-op — you can't sacrifice what you don't have (CR 701.21a)", () => {
    const s = board();
    const noTokens = {
      ...s,
      players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.filter((p) => p.id !== "zombie") } },
    };
    const after = advanceSacrificeChain(noTokens, { queue: [{ playerId: "ai", what: "creatureToken" }] });
    expect(after.players.ai.battlefield).toHaveLength(3);
    expect(after.pendingSacrificeChoice).toBeFalsy();
  });

  it("a SOLE legal pick is forced without a pause; two would pause for a choice", () => {
    // One nontoken creature on this board → forced. (The pause path is the shared chain's, pinned elsewhere.)
    const after = advanceSacrificeChain(board(), { queue: [{ playerId: "ai", what: "nontokenCreature" }] });
    expect(after.pendingSacrificeChoice).toBeFalsy();
  });
});

describe("classification — the staples this unblocks", () => {
  it("Accursed Marauder #464 flips", () => {
    expect(classifyCard({ name: "Accursed Marauder", type: "Creature — Zombie Horror", mana: "{1}{B}", power: 2, toughness: 2, keywords: [],
      oracle: "When this creature enters, each player sacrifices a nontoken creature of their choice." })).toMatch(/^native/);
  });

  it("Sheoldred's Edict #1154 flips — ALL THREE modes had to land (CR 700.2, all-or-nothing)", () => {
    expect(classifyCard({ name: "Sheoldred's Edict", type: "Instant", mana: "{1}{B}", keywords: [],
      oracle: "Choose one —\n• Each opponent sacrifices a nontoken creature of their choice.\n• Each opponent sacrifices a creature token of their choice.\n• Each opponent sacrifices a planeswalker of their choice." })).toMatch(/^native/);
  });
});
