/**
 * openTheOmenpaths.test.js — POD-SIM THREE · Killer Turts KT-4b (2026-09-05): Open the Omenpaths.
 *
 * "Choose one — • Add two mana of any one color and two mana of any other color. Spend this mana only to cast creature or
 * enchantment spells. • Creatures you control get +1/+0 until end of turn." Mode 2 already parsed. Mode 1 is a restricted
 * add whose colours are a CHOICE: two of one colour and two of ANOTHER. House policy (deterministic, documented — the
 * riot discipline): the first colour is the any-colour policy's pick (the commander's colour identity in WUBRG order),
 * the second is the next DISTINCT identity colour, falling back to the next WUBRG colour that is not the first. The mana
 * lands as ONE tagged restrictedMana entry {c1: 2, c2: 2} the planner honours; a suboptimal colour pair is a play-quality
 * loss only, never more mana than printed (CREED).
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

const OMENPATHS = { id: "omp", name: "Open the Omenpaths", type: "Instant", mana: "{2}{R}", oracle: "Choose one —\n• Add two mana of any one color and two mana of any other color. Spend this mana only to cast creature or enchantment spells.\n• Creatures you control get +1/+0 until end of turn." };
const ZERO = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function mainState({ userHand = [], userPool = {}, commander = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool }, command: commander ? [commander] : s.players.user.command } },
  };
}
const castsOf = (state, cardId) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter((c) => c.cardId === cardId);

describe("parser + classifier", () => {
  it("mode 1 is a two-colour restricted add with the creature-or-enchantment restriction; mode 2 the team pump; native-spell", () => {
    const p = parseEffectProgram(OMENPATHS);
    expect(p.confidence).toBe("high");
    expect(p.modal.modes[0].atoms).toEqual([{ op: "add-restricted-mana", twoColorsTwoEach: true, restriction: { castTypes: ["creature", "enchantment"] }, targetType: null }]);
    expect(p.modal.modes[1].atoms).toEqual([{ op: "pump", scope: "youControl", ptDelta: { p: 1, t: 0 } }]);
    expect(classifyCard({ ...OMENPATHS, keywords: [] })).toBe("native-spell");
  });
});

describe("runtime — mode 1 under a red-green commander", () => {
  it("mints ONE entry of {R}{R}{G}{G} (identity order), restricted; it pays a creature, never an instant", () => {
    const commander = { id: "c-cmd", name: "Raph and Mikey", type: "Legendary Creature — Turtle", colorIdentity: ["R", "G"], oracle: "", mana: "{1}{R}{G}" };
    let s = mainState({ userHand: [OMENPATHS], userPool: { R: 3 }, commander });
    const mode1 = castsOf(s, "omp").find((a) => a.chosenMode === 0);
    expect(mode1).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, mode1));
    const entries = s.players.user.restrictedMana;
    expect(entries).toHaveLength(1);
    expect(entries[0].pool).toEqual({ W: 0, U: 0, B: 0, R: 2, G: 2, C: 0 });
    expect(entries[0].restriction).toEqual({ castTypes: ["creature", "enchantment"] });
    expect(s.players.user.manaPool.R).toBe(0); // the cost paid; nothing unrestricted added
    expect(planPayment(ZERO, [], { generic: 2, W: 0, U: 0, B: 0, R: 1, G: 1, C: 0 }, { castCard: { type: "Creature — Beast" }, restrictedEntries: entries })).not.toBeNull();
    expect(planPayment(ZERO, [], { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, { castCard: { type: "Instant" }, restrictedEntries: entries })).toBeNull();
  });

  it("a mono-red commander: the second colour is the next WUBRG colour that is not red (W) — two distinct colours always", () => {
    const commander = { id: "c-cmd", name: "Mono Red", type: "Legendary Creature — Goblin", colorIdentity: ["R"], oracle: "", mana: "{R}" };
    let s = mainState({ userHand: [OMENPATHS], userPool: { R: 3 }, commander });
    s = resolveTopOfStack(dispatchAction(s, castsOf(s, "omp")[0]));
    const pool = s.players.user.restrictedMana[0].pool;
    expect(pool.R).toBe(2);
    expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(4);
    expect(Object.entries(pool).filter(([, n]) => n > 0).map(([c]) => c)).toEqual(["W", "R"]);
  });
});
