/**
 * overpoweringAttack.test.js — POD-SIM THREE · Killer Turts KT-7a (2026-09-05): Overpowering Attack.
 *
 * "Untap all creatures you control that attacked this turn. If it's your main phase, there is an additional combat phase
 * after this phase, followed by an additional main phase." (Freerunning is an alternative cost the runtime credits
 * hard-cast only — the foretell/blitz precedent; a known under-offer.)
 *  · the creature untap gains an attacked-this-turn filter on the per-permanent flag stamped at declare-attacker;
 *  · the after-main extra combat gains a RESOLUTION-TIME gate: outside your main phase nothing is queued — never an
 *    extra combat the card does not grant.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OPA = { id: "opa", name: "Overpowering Attack", type: "Sorcery", mana: "{3}{R}{R}", keywords: ["Freerunning"],
  oracle: "Freerunning {2}{R} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nUntap all creatures you control that attacked this turn. If it's your main phase, there is an additional combat phase after this phase, followed by an additional main phase." };
const BEAR = (id) => ({ id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 });

function state({ phase = "postcombat-main", step = "main", activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const attacker = { ...createPermanent({ id: "A", card: BEAR("A"), controller: "user", tapped: true }), attackedThisTurn: true };
  const homebody = createPermanent({ id: "H", card: BEAR("H"), controller: "user", tapped: true });
  return {
    ...s, phase, step, activePlayer, priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: [OPA], battlefield: [attacker, homebody], manaPool: { ...s.players.user.manaPool, R: 5 } } },
  };
}
const casts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((c) => c.cardId === "opa");
const tapped = (s, id) => s.players.user.battlefield.find((p) => p.id === id).tapped;

describe("parser + classifier", () => {
  it("the attacked-this-turn untap and the gated after-main extra combat; native-spell", () => {
    const p = parseEffectProgram(OPA);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "untap-lands", all: true, scope: "creature", attackedThisTurnOnly: true, targetType: null },
      { op: "extra-combat", insertAfter: "main", onlyIfYourMainPhase: true, followedByMain: true, targetType: null },
    ]);
    expect(classifyCard(OPA)).toBe("native-spell");
  });
});

describe("runtime", () => {
  it("in your postcombat main: only the creature that attacked untaps; an after-main extra combat is queued", () => {
    let s = state();
    const hard = casts(s);
    expect(hard.length).toBeGreaterThan(0);
    s = resolveTopOfStack(dispatchAction(s, hard[0]));
    expect(tapped(s, "A")).toBe(false);
    expect(tapped(s, "H")).toBe(true);
    expect(s.extraPhases).toEqual([{ kind: "combat", after: "main" }]);
  });

  it("resolved outside your main phase (the gate at resolution): the untap still happens, NO extra combat is queued", () => {
    const s = state({ phase: "combat", step: "end-of-combat" });
    const prog = parseEffectProgram(OPA);
    let t = resolveAtom(s, prog.atoms[0], { controller: "user", targets: [] });
    t = resolveAtom(t, prog.atoms[1], { controller: "user", targets: [] });
    expect(tapped(t, "A")).toBe(false);
    expect(t.extraPhases || []).toEqual([]);
    // an opponent's main phase is not YOUR main phase either
    const o = state({ phase: "precombat-main", activePlayer: "ai" });
    expect((resolveAtom(o, prog.atoms[1], { controller: "user", targets: [] }).extraPhases || [])).toEqual([]);
  });
});
