/**
 * referentRegistrationTrap.test.js — the referent drift trap, driven on a board: a referent targetType left out of
 * NON_CHOSEN_TARGET_TYPES.
 *
 * The mock below takes "attackedDefender" out of the registry for this file only — the state stage ③ · 25 (Hellrider,
 * 2026-09-30) was in before its registration, the third time a new referent targetType arrived without one. Then, the
 * unregistered referent read as a chosen target with no enumerator pool: the classifier credited Hellrider native-trigger
 * (a deal-damage target is enemy-side, which reads as resolvable) while the flush found no candidates, logged
 * trigger-removed-no-target and dealt nothing. Under the closed vocabulary (targetTypes.js) both sides ask the same
 * programConfidence, which reads the unregistered slot LOW: the classifier refuses the card and the flush puts the
 * Arbiter's manual payload on the stack. Falkenrath Perforator, whose referent (defendingPlayer) is still registered, is the
 * control on the same board: it classifies native, routes as an effect program and deals its damage — the mock took out one
 * registration and nothing else.
 *
 * Real oracle fixtures (bundled Scryfall, copied 2026-10-16).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./targetTypes.js", async (importOriginal) => {
  const real = await importOriginal();
  const NON_WIPE_MASS_SCOPES = new Set([...real.NON_WIPE_MASS_SCOPES].filter((tt) => tt !== "attackedDefender"));
  const NON_CHOSEN_TARGET_TYPES = new Set([...real.MASS_WIPE_SCOPES, ...NON_WIPE_MASS_SCOPES]);
  const isNonChosenTargetType = (tt) => !!tt && NON_CHOSEN_TARGET_TYPES.has(tt);
  return {
    ...real,
    NON_WIPE_MASS_SCOPES,
    NON_CHOSEN_TARGET_TYPES,
    isNonChosenTargetType,
    isKnownTargetType: (tt) => isNonChosenTargetType(tt) || (!!tt && real.CHOSEN_TARGET_TYPES.has(tt)),
  };
});

import { NON_CHOSEN_TARGET_TYPES } from "./targetTypes.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HELLRIDER = { id: "c-hr", name: "Hellrider", type: "Creature — Devil", mana: "{2}{R}{R}", power: "3", toughness: "3", keywords: ["Haste"],
  oracle: "Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking." };
const PERFORATOR = { id: "c-fp", name: "Falkenrath Perforator", type: "Creature — Vampire", mana: "{1}{R}", power: "2", toughness: "1", keywords: [],
  oracle: "Whenever this creature attacks, it deals 1 damage to defending player." };

// Hellrider and Falkenrath Perforator attack the AI: two Hellrider triggers (one per attacking creature) and Perforator's own.
function swing() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mine = (card, id) => createPermanent({ id, card, controller: "user", summoningSick: false });
  return {
    ...s, turn: 4, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    combat: { attackers: ["hr", "fp"].map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: [mine(HELLRIDER, "hr"), mine(PERFORATOR, "fp")] } },
  };
}

describe("a referent left out of NON_CHOSEN_TARGET_TYPES — the classifier and the flush agree", () => {
  it("VACUITY CONTROL — the mock took attackedDefender out and left defendingPlayer in", () => {
    expect([NON_CHOSEN_TARGET_TYPES.has("attackedDefender"), NON_CHOSEN_TARGET_TYPES.has("defendingPlayer")]).toEqual([false, true]);
  });

  it("the classifier refuses Hellrider and still credits Falkenrath Perforator", () => {
    expect([classifyCard(HELLRIDER), classifyCard(PERFORATOR)].map((t) => /^native-/.test(t))).toEqual([false, true]);
  });

  it("⭐ per trigger, the flush routes an effect program exactly when the classifier routes it natively — never a no-target removal", () => {
    const pending = checkAttackTriggers(swing());
    const flushed = flushTriggers(pending);
    const bySource = {};
    for (const t of pending.pendingTriggers) (bySource[t.source.name] ||= { classifier: [], flush: [] }).classifier.push(triggerRoutesNatively(t.descriptor));
    for (const o of flushed.stack.filter((x) => x.kind === "triggered-ability")) bySource[o.source.name].flush.push(o.payload.resolver);
    expect(bySource).toEqual({
      Hellrider: { classifier: [false, false], flush: ["manual", "manual"] },
      "Falkenrath Perforator": { classifier: [true], flush: ["effect-program"] },
    });
    expect(flushed.log.filter((e) => e.kind === "trigger-removed-no-target")).toEqual([]);
  });

  it("resolving: Perforator deals its 1 to the AI, Hellrider's triggers resolve as the Arbiter's no-op", () => {
    const s0 = swing();
    let s = flushTriggers(checkAttackTriggers(s0));
    for (let guard = 0; s.stack.length && guard < 8; guard++) s = resolveTopOfStack(s);
    expect(s0.players.ai.life - s.players.ai.life).toBe(1);
    expect(s.log.filter((e) => e.kind === "stack-resolve" && e.manual).map((e) => e.source)).toEqual(["Hellrider", "Hellrider"]);
  });
});
