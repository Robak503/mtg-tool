/**
 * carpetOfFlowers.test.js — POD-SIM THREE · Killer Turts KT-10a (2026-09-05): Carpet of Flowers.
 *
 * "At the beginning of each of your main phases, if you haven't added mana with this ability this turn, you may add X mana
 * of any one color, where X is the number of Islands target opponent controls." Four seams:
 *  · a BOTH-mains event (anyMain) the engine fires at every main phase of your turn;
 *  · a per-ability, per-turn LATCH: the add-mana resolver stamps the trigger's ability key when it adds; the intervening-if
 *    reads the stamp (fails closed without a key); cleared at untap;
 *  · an X-of-one-colour add whose X is a count over the TARGET opponent's lands of a basic type, read at resolution;
 *  · an opponent-targeted trigger effect, admitted as enemy-side by the target-intent gate.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { flushTriggers, nextStep, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CARPET = { id: "c-carpet", name: "Carpet of Flowers", type: "Enchantment", mana: "{G}", keywords: [],
  oracle: "At the beginning of each of your main phases, if you haven't added mana with this ability this turn, you may add X mana of any one color, where X is the number of Islands target opponent controls." };
const ISLAND = (id) => ({ id, name: "Island", type: "Basic Land — Island", mana: "", oracle: "({T}: Add {U}.)" });
const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" });

function mainState({ phase = "precombat-main", turn = 4 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase, step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "CF", card: CARPET, controller: "user" })], command: [{ id: "c-cmd", name: "Commander", colorIdentity: ["R", "G"] }] },
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "I1", card: ISLAND("i1"), controller: "ai" }), createPermanent({ id: "I2", card: ISLAND("i2"), controller: "ai" }), createPermanent({ id: "I3", card: ISLAND("i3"), controller: "ai" }), createPermanent({ id: "F1", card: FOREST("f1"), controller: "ai" })] } },
  };
}
// the "you may" makes the trigger optional: the resolver pauses on an optional-effect choice — the controller ACCEPTS it
const settle = (s) => {
  let g = 0;
  while ((s.stack.length || s.pendingChoice) && g++ < 20) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
};
const fireMain = (s) => settle(flushTriggers(checkStepTriggers(s, "anyMain"), { chooseTargets: chooseTriggerTargets }));
const poolTotal = (s) => Object.values(s.players.user.manaPool || {}).reduce((a, b) => a + (b || 0), 0);

describe("classifier + descriptor", () => {
  it("Carpet classifies native-trigger: a both-mains event with the latch as its intervening-if and an opponent-targeted X add", () => {
    expect(classifyCard(CARPET)).toBe("native-trigger");
    const [d] = detectTriggers(CARPET);
    expect(d).toMatchObject({ event: "anyMain", optional: true, interveningIf: "you haven't added mana with this ability this turn" });
    // the latch fails CLOSED without an ability key
    const base = mainState();
    const LATCH = "you haven't added mana with this ability this turn";
    expect(evaluateInterveningIf(base, LATCH, "user", {})).toBe(false);
    expect(evaluateInterveningIf(base, LATCH, "user", { abilityKey: "k" })).toBe(true);
    expect(evaluateInterveningIf({ ...base, manaAddedByAbilityThisTurn: { k: { turn: 4 } } }, LATCH, "user", { abilityKey: "k" })).toBe(false);
    expect(evaluateInterveningIf({ ...base, turn: 5, manaAddedByAbilityThisTurn: { k: { turn: 4 } } }, LATCH, "user", { abilityKey: "k" })).toBe(true);
  });
});

describe("runtime", () => {
  it("precombat main: three of ONE colour (the opponent's three Islands, the Forest not counted); the postcombat main the same turn adds nothing (the latch); next turn adds again", () => {
    let s = fireMain(mainState());
    expect(poolTotal(s)).toBe(3);
    const colours = Object.entries(s.players.user.manaPool).filter(([, n]) => n > 0).map(([c]) => c);
    expect(colours).toHaveLength(1);
    expect(s.manaAddedByAbilityThisTurn && Object.keys(s.manaAddedByAbilityThisTurn)).toHaveLength(1);
    // the second main phase this turn: the latch holds
    const second = fireMain({ ...s, phase: "postcombat-main" });
    expect(poolTotal(second)).toBe(3);
    // next turn (the untap step clears the latch): it adds again
    const nextTurn = fireMain({ ...second, turn: 5, manaAddedByAbilityThisTurn: {}, players: { ...second.players, user: { ...second.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } });
    expect(poolTotal(nextTurn)).toBe(3);
  });

  it("through the ENGINE: stepping from the draw step into the precombat main fires the both-mains event (the hook, not a direct check)", () => {
    let s = { ...mainState(), phase: "beginning", step: "draw", priorityHolder: null };
    s = nextStep(s);
    expect(`${s.phase}/${s.step}`).toBe("precombat-main/main");
    s = settle(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(poolTotal(s)).toBe(3);
  });

  it("an opponent with no Islands: the trigger resolves to nothing and the latch does not stamp (nothing was added)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [createPermanent({ id: "F1", card: FOREST("f1"), controller: "ai" })] } } };
    s = fireMain(s);
    expect(poolTotal(s)).toBe(0);
    expect(Object.keys(s.manaAddedByAbilityThisTurn || {})).toHaveLength(0);
  });
});
