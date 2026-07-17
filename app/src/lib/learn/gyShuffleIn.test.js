/**
 * gyShuffleIn.test.js — BLITZ GS-1: GY-SHUFFLE-IN (CR 701.24), two anchored forms on one resolver:
 *   PLAYER form — "Target player shuffles up to <N> target cards from their graveyard into their library."
 *     (N=4 Dwell on the Past / Stream of Consciousness; N=3 Memory's Journey; N=2 Krosan Reclamation).
 *     TWO DEPENDENT target dimensions: one chosen player + an up-to-N subset drawn FROM THAT PLAYER'S
 *     graveyard. The dependency is enforced BY CONSTRUCTION in targeting.expandAtoms (gyFromTargetPlayer):
 *     each candidate player is paired ONLY with subsets of their own graveyard — a cross-player pairing is
 *     never enumerated (CR 601.2c).
 *   SELF form — "Shuffle up to <N> target cards from your graveyard into your library." (N=5 Wand of
 *     Vertebrae's activated; N=1 Put Away's optional rider) — the controller, no player target.
 * Resolution (CR 701.24c/d): chosen cards still in the graveyard move to that player's library, then the
 * library is SHUFFLED — even when zero cards moved ("up to" zero, or every chosen card left — CR 608.2b
 * per-target skip, the incumbent discipline). Deterministic rngSeed shuffle (serialize-stable).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DWELL_ON_THE_PAST = { id: "c-dp", name: "Dwell on the Past", type: "Sorcery", mana: "{G}", oracle: "Target player shuffles up to four target cards from their graveyard into their library." };
const STREAM_OF_CONSCIOUSNESS = { id: "c-sc", name: "Stream of Consciousness", type: "Instant — Arcane", mana: "{1}{U}", oracle: "Target player shuffles up to four target cards from their graveyard into their library." };
const WAND_OF_VERTEBRAE = { id: "c-wv", name: "Wand of Vertebrae", type: "Artifact", mana: "{1}", oracle: "{T}: Mill a card.\n{2}, {T}, Exile this artifact: Shuffle up to five target cards from your graveyard into your library." };
const PUT_AWAY = { id: "c-pa", name: "Put Away", type: "Instant", mana: "{2}{U}{U}", oracle: "Counter target spell. You may shuffle up to one target card from your graveyard into your library." };

const PLAYER_ATOM = { op: "gy-shuffle-into-library", targetType: "player", gyFromTargetPlayer: true, maxTargets: 4, minTargets: 0 };
const gyCard = (id, name) => ({ id, name, type: "Creature — Bear", oracle: "" });

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}

describe("GS-1 parser — both forms parse with the count vocabulary; near-misses stay LOW", () => {
  it("the PLAYER form (four / two) and the SELF form (five) parse to the shared op", () => {
    expect(parseEffectProgram(DWELL_ON_THE_PAST).atoms).toEqual([PLAYER_ATOM]);
    expect(parseEffectClause("Target player shuffles up to two target cards from their graveyard into their library.", "Instant").atoms)
      .toEqual([{ ...PLAYER_ATOM, maxTargets: 2 }]);
    expect(parseEffectClause("Shuffle up to five target cards from your graveyard into your library.", "Artifact").atoms)
      .toEqual([{ op: "gy-shuffle-into-library", targetType: "graveyardCard", cardFilter: "any", maxTargets: 5, minTargets: 0 }]);
  });
  it("FN guards: a mandatory count / out-of-vocabulary count / filtered cards / cross-zone scope stays LOW", () => {
    const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Sorcery"))).toBe("low");
    low("Target player shuffles four target cards from their graveyard into their library.");          // no "up to" (mandatory)
    low("Target player shuffles up to six target cards from their graveyard into their library.");     // out of the evidenced vocabulary
    low("Target player shuffles up to four target creature cards from their graveyard into their library."); // filtered (unevidenced)
    low("Shuffle up to four target cards from a graveyard into your library.");                         // cross-zone scope
  });
  it("classify: the spell carriers flip native-spell; Wand of Vertebrae flips native-activated; Put Away composes", () => {
    expect(classifyCard(DWELL_ON_THE_PAST)).toBe("native-spell");
    expect(classifyCard(STREAM_OF_CONSCIOUSNESS)).toBe("native-spell");
    expect(classifyCard(WAND_OF_VERTEBRAE)).toBe("native-activated");
    expect(classifyCard(PUT_AWAY)).toBe("native-spell"); // counter + the optional self-shuffle rider
  });
});

describe("GS-1 enumeration — the card subset is DEPENDENT on the chosen player (never a cross-player pair)", () => {
  it("every cast option's cards belong to the chosen player; both players offered; subsets sized 0..N", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { graveyard: [gyCard("u1", "U One"), gyCard("u2", "U Two")] });
    s = withPlayerBits(s, "ai", { graveyard: [gyCard("a1", "A One")] });
    const program = parseEffectProgram(DWELL_ON_THE_PAST);
    const choices = expandCastChoices(s, "user", program) || [];
    expect(choices.length).toBeGreaterThan(0);
    const playersSeen = new Set();
    for (const ch of choices) {
      const player = ch.targets.find((t) => t.type === "player");
      const cards = ch.targets.filter((t) => t.type === "graveyardCard");
      expect(player).toBeTruthy();
      playersSeen.add(player.id);
      expect(cards.length).toBeLessThanOrEqual(4);
      for (const c of cards) expect(c.controller).toBe(player.id);   // the dependency — never a cross-player card
    }
    expect(playersSeen.has("user")).toBe(true);                       // "target player" includes the caster
    expect(playersSeen.has("ai")).toBe(true);
    // the maximal own pick (both user cards) and the maximal ai pick (its one card) are both offered
    expect(choices.some((ch) => ch.targets.some((t) => t.type === "player" && t.id === "user") && ch.targets.filter((t) => t.type === "graveyardCard").length === 2)).toBe(true);
    expect(choices.some((ch) => ch.targets.some((t) => t.type === "player" && t.id === "ai") && ch.targets.filter((t) => t.type === "graveyardCard").length === 1)).toBe(true);
  });
});

describe("GS-1 runtime — cards shuffle into the SUBJECT player's library; the shuffle always happens", () => {
  function setup() {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [DWELL_ON_THE_PAST], manaPool: { ...s.players.user.manaPool, G: 1 } });
    s = withPlayerBits(s, "ai", { graveyard: [gyCard("a1", "A One"), gyCard("a2", "A Two")], library: [gyCard("a-lib", "A Lib")] });
    return s;
  }

  it("targeting the OPPONENT with both their cards: cards leave their graveyard, join their SHUFFLED library", () => {
    let s = setup();
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-dp"
        && a.targets?.some((t) => t.type === "player" && t.id === "ai")
        && a.targets?.filter((t) => t.type === "graveyardCard").length === 2);
    expect(act).toBeTruthy();
    const before = s.rngSeed;
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.graveyard).toHaveLength(0);                                        // both left the graveyard
    expect(new Set(s.players.ai.library.map((c) => c.name))).toEqual(new Set(["A Lib", "A One", "A Two"])); // membership: old + shuffled-in
    expect(s.players.user.library).toHaveLength(0);                                        // never the caster's library
    expect(s.rngSeed).not.toBe(before);                                                    // the shuffle happened (rngSeed advanced)
  });

  it("choosing ZERO cards is a legal cast — the library is STILL shuffled (CR 701.24d)", () => {
    let s = setup();
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-dp"
        && a.targets?.some((t) => t.type === "player" && t.id === "ai")
        && a.targets?.filter((t) => t.type === "graveyardCard").length === 0);
    expect(act).toBeTruthy();
    const before = s.rngSeed;
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["a1", "a2"]);          // nothing moved
    expect(s.players.ai.library.map((c) => c.name)).toEqual(["A Lib"]);                    // membership unchanged
    expect(s.rngSeed).not.toBe(before);                                                    // …but the shuffle still happened
  });

  it("a chosen card that left the graveyard is skipped (CR 608.2b); the rest still shuffle in", () => {
    let s = mainState();
    s = withPlayerBits(s, "ai", { graveyard: [gyCard("a2", "A Two")], library: [] });
    const after = ATOM_RESOLVERS["gy-shuffle-into-library"](s, PLAYER_ATOM, {
      controller: "user",
      targets: [
        { type: "player", id: "ai" },
        { type: "graveyardCard", id: "gone", controller: "ai" },   // already left — skipped
        { type: "graveyardCard", id: "a2", controller: "ai" },
      ],
    });
    expect(after.players.ai.graveyard).toHaveLength(0);
    expect(after.players.ai.library.map((c) => c.id)).toEqual(["a2"]);
  });
});
