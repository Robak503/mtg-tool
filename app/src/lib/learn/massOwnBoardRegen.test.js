/**
 * massOwnBoardRegen.test.js — "Regenerate each creature you control" (Golgari Charm, EDHREC #1603).
 *
 * applyRegenerate already routed through atomTargets and shielded whatever came back, so the effect half
 * was free. The real decision was HOW to scope it, and the wrong answer was the tempting one:
 *
 *   { op: "regenerate", targetType: "eachCreature", restrictions: [{ kind: "controller", who: "you" }] }
 *
 * massCreatureTargets takes CHARACTERISTIC filters (subtype / power / mana value) and has no controller
 * predicate, so that restriction would be SILENTLY DROPPED and the shields would land on the opponents'
 * creatures too — a WRONG effect, not a missing one, and one that no classification test would catch.
 * Hence its own mass targetType (`eachCreatureYouControl`, the mirror of the shipped eachOpponentCreature),
 * which makes the mis-scope unrepresentable rather than merely untested. The opponent-board assertion below
 * is the one that matters.
 *
 * Registered in NON_WIPE_MASS_SCOPES, not MASS_WIPE_SCOPES: it BUFFS the caster's own board, so the AI must
 * not hold it the way it holds a board wipe.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyRegenerate } from "./effects/atoms/combat.js";
import { NON_CHOSEN_TARGET_TYPES, MASS_WIPE_SCOPES } from "./targetTypes.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const bear = (id, controller) => ({
  id, controller,
  card: { id: `c-${id}`, name: `Bear-${id}`, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
});

function board() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("u1", "user"), bear("u2", "user")] },
      ai1: { ...s0.players.ai1, battlefield: [bear("a1", "ai1")] },
    },
  };
}

const shields = (s, pid, id) => (s.players[pid].battlefield.find((p) => p.id === id) || {}).regenShields || 0;
const run = (s) => applyRegenerate(s, { op: "regenerate", targetType: "eachCreatureYouControl" }, { controller: "user" });

describe("parse + registration", () => {
  it("uses its own mass targetType, NOT eachCreature plus a controller restriction", () => {
    const p = parseEffectClause("regenerate each creature you control");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "regenerate", targetType: "eachCreatureYouControl" }]);
  });

  it("REGRESSION PIN — single-target regenerate is untouched", () => {
    expect(parseEffectClause("regenerate target creature").atoms)
      .toEqual([{ op: "regenerate", targetType: "creature" }]);
  });

  it("is a NON-CHOSEN scope (so the trigger flush routes it without a target pick)", () => {
    expect(NON_CHOSEN_TARGET_TYPES.has("eachCreatureYouControl")).toBe(true);
  });

  it("is NOT a wipe scope — it buffs the caster's own board, the AI must not hold it as a wipe", () => {
    expect(MASS_WIPE_SCOPES.has("eachCreatureYouControl")).toBe(false);
  });
});

describe("RUNTIME — the shields land on the caster's board only", () => {
  it("every creature the caster controls gets a shield", () => {
    const s = run(board());
    expect(shields(s, "user", "u1")).toBe(1);
    expect(shields(s, "user", "u2")).toBe(1);
  });

  it("THE LOAD-BEARING ONE — an OPPONENT's creature gets NOTHING", () => {
    // This is the assertion the tempting mis-scope (eachCreature + a dropped controller restriction) fails.
    // It is a wrong effect rather than a missing one, so no classification test would ever catch it.
    expect(shields(run(board()), "ai1", "a1")).toBe(0);
  });

  it("an empty own board is a clean no-op and still leaves opponents alone", () => {
    const base = board();
    const s = run({ ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [] } } });
    expect(shields(s, "ai1", "a1")).toBe(0);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Golgari Charm's shape flips", () => {
    expect(classifyCard({
      name: "Golgari Charm", type: "Instant", mana: "{B}{G}", keywords: [],
      oracle: "Choose one —\n• All creatures get -1/-1 until end of turn.\n• Destroy target enchantment.\n• Regenerate each creature you control.",
    })).toMatch(/^native/);
  });
});
