/**
 * geosurge.test.js — POD-SIM THREE · Killer Turts KT-4a (2026-09-05): Geosurge.
 *
 * "Add {R}{R}{R}{R}{R}{R}{R}. Spend this mana only to cast artifact or creature spells." — the pip-pool twin of the
 * any-combination restricted add (Klauth / Sarkhan): the splitter folds the spend rider onto the pip lead, the atom carries
 * an EXPLICIT pool (a spell has no source permanent to colour from) and the parsed restriction, and the resolver mints the
 * same tagged player.restrictedMana entry the payment planner honours. Unrestricted mana here would be the laundering FP
 * the QUARTET lane forbids: the pin shows the entry pays a CREATURE spell and never an INSTANT.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { planPayment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GEOSURGE = { id: "geo", name: "Geosurge", type: "Sorcery", mana: "{R}{R}{R}{R}", oracle: "Add {R}{R}{R}{R}{R}{R}{R}. Spend this mana only to cast artifact or creature spells." };
const BEAST = { id: "bst", name: "Big Beast", type: "Creature — Beast", mana: "{5}{R}", oracle: "", power: 6, toughness: 6 };
const BOLT = { id: "blt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };

function mainState({ userHand = [], userPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool } } },
  };
}
const castOf = (state, cardId) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find((c) => c.cardId === cardId);
const ZERO = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

describe("parser + classifier", () => {
  it("Geosurge is ONE restricted add with an explicit {R}×7 pool and the artifact-or-creature restriction; native-spell", () => {
    const p = parseEffectProgram(GEOSURGE);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-restricted-mana", pool: { W: 0, U: 0, B: 0, R: 7, G: 0, C: 0 }, restriction: { castTypes: ["artifact", "creature"] }, targetType: null }]);
    expect(classifyCard({ ...GEOSURGE, keywords: [] })).toBe("native-spell");
    // CREED: a rider the restriction reader does not vet leaves the whole clause unparsed (never unrestricted mana)
    expect(parseEffectProgram({ ...GEOSURGE, oracle: "Add {R}{R}{R}. Spend this mana only to cast Dragon spells that share a name with a card in your graveyard." }).confidence).not.toBe("high");
  });
});

describe("runtime", () => {
  it("resolving mints a tagged 7-red entry, not pool mana; the entry pays a CREATURE spell and never an INSTANT", () => {
    let s = mainState({ userHand: [GEOSURGE, BEAST, BOLT], userPool: { R: 4 } });
    s = resolveTopOfStack(dispatchAction(s, castOf(s, "geo")));
    expect(s.players.user.manaPool.R).toBe(0);                          // the 4 paid; nothing UNRESTRICTED added
    const entries = s.players.user.restrictedMana;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pool: { R: 7 }, restriction: { castTypes: ["artifact", "creature"] } });
    expect(planPayment(ZERO, [], { generic: 5, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, { castCard: { type: "Creature — Beast" }, restrictedEntries: entries })).not.toBeNull();
    expect(planPayment(ZERO, [], { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, { castCard: { type: "Instant" }, restrictedEntries: entries })).toBeNull();
    // through the real offer: the Beast is castable off the entry; the Bolt is not
    expect(castOf(s, "bst")).toBeTruthy();
    expect(castOf(s, "blt")).toBeUndefined();
  });
});
