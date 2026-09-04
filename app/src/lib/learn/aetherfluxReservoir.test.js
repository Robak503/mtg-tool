/**
 * aetherfluxReservoir.test.js — ④-BC (2026-09-04 night): Aetherflux Reservoir "Whenever you cast a spell, you gain 1 life
 * for each spell you've cast this turn." The cast watcher and the for-each lifegain arm already existed; the count source
 * "spell you've cast this turn" is new — parseCountSource emits kind:"spellsCastThisTurn" and countForSpec reads the
 * CONTROLLER's per-turn cast tally (player.spellsCastThisTurn, incremented at the cast chokepoint, so the triggering spell
 * is already counted when its trigger resolves — CR 608.2h). One line away on Light-Paws Voltron. Real oracle fixture
 * (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RESERVOIR = { id: "c-ar", name: "Aetherflux Reservoir", type: "Artifact", mana: "{4}", cmc: 4, keywords: [],
  oracle: "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.\nPay 50 life: This artifact deals 50 damage to any target." };
const SHOCK = { id: "h-sp", name: "Plain Spark", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Plain Spark deals 2 damage to any target." };

describe("the parse and the classifier", () => {
  it("⭐ 'you gain 1 life for each spell you've cast this turn' → gain-life scaled by the controller's cast tally", () => {
    expect(parseEffectClause("you gain 1 life for each spell you've cast this turn", "Instant", { sourceScoped: true }).atoms)
      .toEqual([{ op: "gain-life", amountCount: { kind: "spellsCastThisTurn", per: 1 }, targetType: null }]);
    expect(classifyCard(RESERVOIR)).toBe("native-mixed");
  });
});

describe("runtime", () => {
  function cast({ userCasts, aiCasts }) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [SHOCK], battlefield: [createPermanent({ id: "res", card: RESERVOIR, controller: "user" })], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, spellsCastThisTurn: userCasts },
        ai: { ...s0.players.ai, hand: [], battlefield: [], spellsCastThisTurn: aiCasts } } };
    const before = s.players.user.life;
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-sp" && (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    if (!s.stack.some((o) => o.kind === "triggered-ability")) s = flushTriggers(s);
    expect(s.stack.at(-1).kind).toBe("triggered-ability"); // the cast trigger sits above the spell
    s = resolveTopOfStack(s);
    return { gained: s.players.user.life - before, state: s };
  }
  it("⭐ the third spell of the turn gains 3 (the triggering spell counts); the first gains 1", () => {
    expect(cast({ userCasts: 2, aiCasts: 0 }).gained).toBe(3);
    expect(cast({ userCasts: 0, aiCasts: 0 }).gained).toBe(1);
  });
  it("CREED — the count is the CONTROLLER's tally, never the table's", () => {
    expect(cast({ userCasts: 2, aiCasts: 5 }).gained).toBe(3);
  });
});
