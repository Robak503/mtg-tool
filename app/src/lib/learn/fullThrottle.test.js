/**
 * fullThrottle.test.js — POD-SIM THREE · Killer Turts KT-7b (2026-09-05): Full Throttle.
 *
 * "After this main phase, there are two additional combat phases. At the beginning of each combat this turn, untap all
 * creatures that attacked this turn." Two seams:
 *  · the after-main extra combat gains a COUNT (two entries queued, CR 500.8);
 *  · the delayed-trigger scheduler gains a REPEATING record: fire step "beginning-of-combat", yours only, kept for every
 *    matching step of the turn it was created in and lapsing silently when the turn moves on. An EXTRA combat re-enters
 *    beginning-of-combat through enterCombatPostProcess, bypassing advanceStep's drain — so the re-entry drains too.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, nextStep, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THROTTLE = { id: "ft", name: "Full Throttle", type: "Sorcery", mana: "{4}{R}{R}", keywords: [],
  oracle: "After this main phase, there are two additional combat phases.\nAt the beginning of each combat this turn, untap all creatures that attacked this turn." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };

function mainState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: [THROTTLE], battlefield: [createPermanent({ id: "B", card: BEAR, controller: "user", summoningSick: false })], manaPool: { ...s.players.user.manaPool, R: 6 } } },
  };
}
const settle = (s) => { let g = 0; while (s.stack.length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s); return s; };
const bear = (s) => s.players.user.battlefield.find((p) => p.id === "B");
const tapAsAttacker = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "B" ? { ...p, tapped: true, attackedThisTurn: true } : p)) } } });

describe("parser + classifier", () => {
  it("two after-main combats + a repeating beginning-of-combat record; native-spell", () => {
    const p = parseEffectProgram(THROTTLE);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "extra-combat", insertAfter: "main", count: 2, followedByMain: false, targetType: null },
      { op: "schedule-delayed", fireStep: "beginning-of-combat", fireScope: "yours", delayedClause: "untap all creatures that attacked this turn", targetType: null, repeatThisTurn: true },
    ]);
    expect(classifyCard(THROTTLE)).toBe("native-spell");
  });
});

describe("runtime — three combats this turn, the bear untapped at the start of each; nothing next turn", () => {
  it("queues two combats and a repeating record; walks the turn", () => {
    let s = mainState();
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((c) => c.cardId === "ft");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.extraPhases).toEqual([{ kind: "combat", after: "main", withMain: false }, { kind: "combat", after: "main", withMain: false }]);
    expect(s.delayedTriggers).toHaveLength(1);
    expect(s.delayedTriggers[0]).toMatchObject({ fireStep: "beginning-of-combat", fireScope: "yours", repeatThisTurn: true, createdTurn: 4 });
    // walk the turn: at every beginning-of-combat the record fires and untaps the bear that "attacked"; tap it again as it attacks
    s = tapAsAttacker(s); // it attacked in some earlier combat this turn
    const untapsAtCombatStart = [];
    let mainPhases = 0;
    let guard = 0;
    while (s.turn === 4 && guard++ < 80) {
      const before = `${s.phase}/${s.step}`;
      s = nextStep(s);
      s = settle(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      if (s.step === "beginning-of-combat") {
        untapsAtCombatStart.push(!bear(s).tapped);
        s = tapAsAttacker(s); // it attacks in this combat
      }
      if (s.step === "main" && before !== `${s.phase}/${s.step}`) mainPhases++;
    }
    expect(untapsAtCombatStart).toEqual([true, true, true]); // the two extra combats, then the owed normal one — untapped at the start of each
    // Full Throttle grants NO extra main phases: the two extra combats chain straight into each other and the normal combat;
    // only the one postcombat main follows (an extra main would be an unprinted sorcery window — the forbidden direction)
    expect(mainPhases).toBe(1);
    expect(s.turn).toBe(5);
    // next turn: the record has lapsed — a tapped attacker stays tapped at the start of combat
    expect(s.delayedTriggers.filter((r) => r.repeatThisTurn)).toHaveLength(0);
  });
});
