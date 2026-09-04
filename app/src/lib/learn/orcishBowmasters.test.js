/**
 * orcishBowmasters.test.js — SHELF-85 runbook V4 (2026-09-04): Orcish Bowmasters (Nekusar · Believe it!) and the
 * two things it exposed.
 *
 *   "Flash
 *    When this creature enters and whenever an opponent draws a card except the first one they draw in each of
 *    their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1."
 *
 * ① THE DRAW-STEP CARVE-OUT. A new opponentDraw arm carries `exceptFirstDrawStepDraw`; gameEngine's draw step is the
 *    ONLY caller that stamps its draw `drawStepFirst`, and checkCardDrawnTriggers filters the flagged descriptor off
 *    that one draw. Every other draw (a spell, a trigger, a wheel — even during the draw step) fires, as printed.
 *    The flag has to survive descriptor assembly (it was dropped there first — the descriptor is read, not the arm).
 *
 * ② THE COMPOUND SPLIT DROPPED THE RIDER — A LIVE FP. "When A and whenever B, E. Then R." was rewritten to
 *    "When A, E" + "Whenever B, E. Then R.": the first half lost its then/if-led sentences by position. Flaring
 *    Cinder and Giott, King of the Dwarves were credited native while their ETB half discarded a card with the
 *    "If you do, draw a card" payoff gone. The shared effect now carries its trailing Then/If sentences onto both
 *    halves (the at-the-beginning compound too).
 *
 * Leela, Sevateem Warrior rides the same arm (a +1/+1 counter on herself), audited whole-card.
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { applyDrawEffect } from "./spellEffects.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BOWMASTERS = { id: "c-bow", name: "Orcish Bowmasters", type: "Creature — Orc Archer", mana: "{1}{B}", power: 1, toughness: 1, keywords: ["Flash"],
  oracle: "Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1." };
const LEELA = { id: "c-leela", name: "Leela, Sevateem Warrior", type: "Legendary Creature — Human Warrior", mana: "{3}{G}", power: 3, toughness: 3, keywords: [],
  oracle: "Whenever an opponent draws a card except the first one they draw in each of their draw steps, put a +1/+1 counter on Leela.\nDoctor's companion" };
const FLARING_CINDER = { id: "c-fc", name: "Flaring Cinder", type: "Creature — Elemental", mana: "{1}{R}", power: 1, toughness: 1, keywords: [],
  oracle: "When this creature enters and whenever you cast a spell with mana value 4 or greater, you may discard a card. If you do, draw a card." };
const UPKEEP_TWIN = { id: "c-ut", name: "Probe Twin", type: "Creature — Elemental", mana: "{1}{R}", power: 1, toughness: 1, keywords: [],
  oracle: "When this creature enters and at the beginning of your upkeep, you may discard a card. If you do, draw a card." };

const lib = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bow = createPermanent({ id: "BOW", card: BOWMASTERS, controller: "user", summoningSick: false });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, turn: 2,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [bow], library: lib(5, "u") },
      ai: { ...s.players.ai, battlefield: [], library: lib(5, "a") },
    },
  };
}
const pending = (s) => (s.pendingTriggers || []).filter((t) => t.descriptor?.event === "cardDrawn");
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("① detection — both halves, the rider on each, the carve-out flagged", () => {
  it("splits into an ETB half and a flagged opponent-draw half, each carrying 'Then amass Orcs 1'", () => {
    const d = detectTriggers(BOWMASTERS);
    expect(d.map((x) => x.event)).toEqual(["etb", "cardDrawn"]);
    expect(d[0].effectClause).toBe("this creature deals 1 damage to any target. Then amass Orcs 1");
    expect(d[1].effectClause).toBe("this creature deals 1 damage to any target. Then amass Orcs 1");
    expect(d[1].scope).toBe("opponentDraw");
    expect(d[1].exceptFirstDrawStepDraw).toBe(true);
    expect(d[0].exceptFirstDrawStepDraw).toBeUndefined();
  });
  it("Leela rides the same arm", () => {
    const d = detectTriggers(LEELA).find((x) => x.event === "cardDrawn");
    expect(d).toMatchObject({ scope: "opponentDraw", whose: "opponent", exceptFirstDrawStepDraw: true, effectClause: "put a +1/+1 counter on this creature" });
  });
});

describe("① firing — the draw step's stamped first draw is skipped, every other draw fires", () => {
  it("a stamped draw-step draw fires nothing; the same draw unstamped fires once", () => {
    const s = board();
    expect(pending(checkCardDrawnTriggers(s, "ai", 1, { drawStepFirst: true }))).toHaveLength(0);
    expect(pending(checkCardDrawnTriggers(s, "ai", 1))).toHaveLength(1);
  });
  it("a stamped batch of two fires for the second card only", () => {
    expect(pending(checkCardDrawnTriggers(board(), "ai", 2, { drawStepFirst: true }))).toHaveLength(1);
  });
  it("the controller's own draws never fire it (an opponent watcher)", () => {
    expect(pending(checkCardDrawnTriggers(board(), "user", 1))).toHaveLength(0);
  });
  it("the bare 'whenever an opponent draws a card' watcher is untouched by the stamp", () => {
    const tithe = createPermanent({ id: "TAX", card: { id: "c-tax", name: "Tax", type: "Creature — Human", power: 1, toughness: 1, oracle: "Whenever an opponent draws a card, put a +1/+1 counter on this creature." }, controller: "user", summoningSick: false });
    const s = board(); s.players.user.battlefield = [tithe];
    expect(pending(checkCardDrawnTriggers(s, "ai", 1, { drawStepFirst: true }))).toHaveLength(1);
  });
});

describe("① end to end — the engine's draw step is the stamped draw; a spell draw fires and resolves", () => {
  it("walking the opponent's untap → upkeep → draw step draws their card and fires no Bowmasters trigger", () => {
    let s = { ...board(), phase: "beginning", step: "untap" };
    const handBefore = s.players.ai.hand.length;
    s = runStepActions(advanceStep(s));
    expect(s.step).toBe("upkeep");
    s = runStepActions(advanceStep(s));
    expect(s.step).toBe("draw");
    expect(s.players.ai.hand.length).toBe(handBefore + 1);
    expect(pending(s)).toHaveLength(0);
    expect((s.stack || []).filter((e) => e.source?.name === "Orcish Bowmasters")).toHaveLength(0);
  });
  it("a spell-effect draw by the opponent fires it: 1 damage lands and an Orc Army with one counter is amassed", () => {
    let s = board();
    const lifeBefore = s.players.ai.life;
    s = applyDrawEffect(s, { controller: "ai", amount: 1 });
    expect(pending(s)).toHaveLength(1);
    // The live flush call-sites inject the enemy/own-aware chooser; a bare first-legal flush would aim the
    // damage at the only creature on the board — the Bowmasters itself (the test's first draft did exactly that).
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(lifeBefore - 1);
    expect(s.players.user.battlefield.find((p) => p.id === "BOW")).toBeTruthy();
    const army = s.players.user.battlefield.find((p) => /\bArmy\b/.test(String(p.card?.type || "")));
    expect(army).toBeTruthy();
    expect(army.counters?.["+1/+1"] || 0).toBe(1);
  });
});

describe("② the compound split carries the trailing Then/If sentences onto BOTH halves", () => {
  it("Flaring Cinder's ETB half keeps its 'If you do, draw a card' payoff", () => {
    const d = detectTriggers(FLARING_CINDER);
    expect(d).toHaveLength(2);
    for (const x of d) expect(x.effectClause).toBe("you may discard a card. If you do, draw a card");
  });
  it("the at-the-beginning compound too", () => {
    const d = detectTriggers(UPKEEP_TWIN);
    expect(d).toHaveLength(2);
    for (const x of d) expect(x.effectClause).toBe("you may discard a card. If you do, draw a card");
  });
});

describe("classifier — whole cards", () => {
  it("Bowmasters, Leela and Flaring Cinder are native-trigger", () => {
    expect(classifyCard(BOWMASTERS)).toBe("native-trigger");
    expect(classifyCard(LEELA)).toBe("native-trigger");
    expect(classifyCard(FLARING_CINDER)).toBe("native-trigger");
  });
});
