/**
 * additionalCostLowProgram.test.js — A COST IS NOT AN EFFECT.
 *
 * THE SOFT-LOCK THIS CLOSES. legalChoices used to read the parser's additional costs only for HIGH-confidence
 * programs:
 *     const addCost = isHigh ? (program.additionalCosts || [])[0] : null;
 * while actionDispatcher's additional-cost loop is UNCONDITIONAL — as it must be, since skipping a printed
 * cost is the cardinal false positive. So a spell whose EFFECT the parser cannot model but whose COST it can
 * was emitted as a plain cast with NO victim frozen, and the dispatcher then correctly refused to cast it
 * cost-free and threw ADDCOST_UNPAID. Not a rare interaction: **every one of the 34 corpus instants and
 * sorceries in that class was a guaranteed wedge the moment a player tried to cast it** — Eldritch Evolution,
 * Neoform, Tinker, Final Strike, Tormented Thoughts, Rite of Consumption, Scapegoat, Gaea's Balance …
 *
 * ⚠️ FOUND BY THE PLAYABILITY SWEEP, NOT BY A TEST — and the full suite stayed green through the fix, which
 * is what a hollow gate looks like from the inside. 12,234 tests and none of them cast an Arbiter-bound spell
 * that had a cost to pay. This file is that missing assertion.
 *
 * ⛔ WHY ENUMERATE RATHER THAN SUPPRESS. The other way to kill the wedge is to stop offering the cast at all.
 * That trades a soft-lock for a DEAD CARD sitting in hand — the exact failure the dead-card hunt exists to
 * find, and worse than the coverage gap it hides behind. The cost is paid exactly as printed; the unmodeled
 * effect still routes to the Arbiter, which is where a LOW program was always going.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Eldritch Evolution — verbatim oracle. Its EFFECT is unmodeled (a search for "mana value X or less, where X
// is 2 plus the sacrificed creature's mana value"), its COST is a plain sacrifice. That split is the point.
const ELDRITCH = {
  id: "card-ee", name: "Eldritch Evolution", type: "Sorcery", mana: "{1}{G}{G}",
  oracle: "As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a creature card with mana value X or less, where X is 2 plus the sacrificed creature's mana value. Put that card onto the battlefield, then shuffle. Exile Eldritch Evolution.",
};
const bear = (id, name) => createPermanent({
  id, controller: "user", summoningSick: false,
  card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", cmc: 2 },
});

function table() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: [bear("v1", "Grizzly Bears")], hand: [ELDRITCH], manaPool: { ...s.players.user.manaPool, G: 2, C: 1 } } },
  };
}
const casts = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "cast-spell" && a.name === "Eldritch Evolution");

describe("the premise — this really is a LOW program carrying a real cost", () => {
  it("⭐ the effect does NOT parse, and the additional cost DOES", () => {
    // If a future slice models the search, this card leaves the class and the test below stops covering it.
    // Asserting the premise means that shows up here as a failure to re-point, not as silent coverage loss.
    const p = parseEffectProgram(ELDRITCH);
    expect(p.confidence).not.toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
  });
});

describe("⭐ THE FIX — the cast is offered WITH a victim frozen, even though the effect is unmodeled", () => {
  it("⭐ a cast action exists and carries sacCreatureId", () => {
    const acts = casts(table());
    expect(acts.length).toBeGreaterThan(0);
    expect(acts[0].sacCreatureId).toBe("v1");
  });

  it("⛔ THE WEDGE ITSELF — dispatching it does not throw ADDCOST_UNPAID", () => {
    // The whole bug in one line. Before the fix this threw "Spell requires an additional sacrifice cost but
    // no victim was chosen" and the game could not continue.
    expect(() => dispatchAction(table(), casts(table())[0])).not.toThrow();
  });

  it("⭐ and the cost is actually PAID — the victim leaves the battlefield", () => {
    // Not offering-and-throwing, and not offering-and-skipping. A cast that resolved while silently keeping
    // the creature would be the cardinal false positive this whole path exists to prevent.
    const out = dispatchAction(table(), casts(table())[0]);
    const st = out?.state || out;
    expect(st.players.user.battlefield.find((p) => p.id === "v1")).toBeUndefined();
  });

  it("⛔ with NO legal victim the spell is not castable at all", () => {
    // The gate that must survive the change: an unpayable cost still means uncastable, never a free cast.
    const s = table();
    const noVictims = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(casts(noVictims)).toHaveLength(0);
  });
});

describe("CONTROL — the HIGH path is untouched", () => {
  const BONE_SPLINTERS = {
    id: "card-bs", name: "Bone Splinters", type: "Sorcery", mana: "{B}",
    oracle: "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.",
  };
  it("a modeled spell with the same cost shape still enumerates its victim", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = {
      ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [bear("v1", "Grizzly Bears")], hand: [BONE_SPLINTERS], manaPool: { ...s.players.user.manaPool, B: 1 } },
        ai: { ...s.players.ai, battlefield: [createPermanent({ id: "foe", controller: "ai", summoningSick: false, card: { id: "c-foe", name: "Enemy", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } })] },
      },
    };
    const acts = legalActionsForPlayer(st, "user").filter((a) => a.kind === "cast-spell" && a.name === "Bone Splinters");
    expect(acts.length).toBeGreaterThan(0);
    expect(acts[0].sacCreatureId).toBe("v1");
  });
});
