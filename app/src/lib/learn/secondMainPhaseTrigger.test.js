/**
 * secondMainPhaseTrigger.test.js — "At the beginning of your SECOND main phase" (CR 505.1b), the missing
 * sibling of the shipped `firstMain` arm, plus the parenthesised ability-word label that hid behind it.
 *
 * Michelangelo, the Heart (Halfshell heroes — Joe's worst deck) needed BOTH:
 *   1. the timing itself — "second main phase" / "postcombat main phase" detected nothing at all, while
 *      "first main phase" / "precombat main phase" had mapped to `firstMain` since its own slice;
 *   2. the label — "Raid (the Fridge) —". `Raid —` stripped fine; the FLAVOUR NAME in parentheses did not.
 *
 * ⚠️ THE DOUBLE-FIRE LANDMINE IS THE REASON THE PHASE GATE EXISTS, and the firstMain comment already names
 * it: both main phases share step `"main"`, so a step-only gate fires at BOTH. The full-turn walk below is
 * the only thing that can prove it doesn't — a unit call to checkStepTriggers cannot.
 *
 * ⭐ AND THE BISECTION IS THE LESSON: the ledger predicted the ability-word label was the blocker. Testing
 * it in isolation showed EVERY variant failing, including the plainest "At the beginning of your second main
 * phase, draw a card." — so the label was masked by a missing timing, and fixing the label alone would have
 * moved nothing. Bisect to the simplest failing form before believing a diagnosis.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const watcher = (oracle) => ({ id: "w", name: "Zed", type: "Creature — Bear", mana: "{2}{G}", power: 3, toughness: 3, oracle });
const DRAW_AT_SECOND = "At the beginning of your second main phase, draw a card.";

describe("detection — both templatings map to secondMain", () => {
  it("\"your second main phase\"", () => {
    expect(detectTriggers(watcher(DRAW_AT_SECOND))[0]).toMatchObject({ event: "secondMain", scope: "you", whose: "yours" });
  });

  it("\"your postcombat main phase\" is the same phase (CR 505.1b)", () => {
    expect(detectTriggers(watcher("At the beginning of your postcombat main phase, draw a card."))[0])
      .toMatchObject({ event: "secondMain" });
  });

  it("the FIRST-main arm is untouched", () => {
    expect(detectTriggers(watcher("At the beginning of your first main phase, draw a card."))[0])
      .toMatchObject({ event: "firstMain" });
  });

  it("⭐ a firstMain watcher does NOT answer the secondMain event", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "w", card: watcher("At the beginning of your first main phase, draw a card."), controller: "user" })] } } };
    expect((checkStepTriggers(st, "secondMain").pendingTriggers || []).length).toBe(0);
  });
});

describe("⭐ RUNTIME — a full turn walk: fires ONCE, at the postcombat main", () => {
  function walkTurn(oracle) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    let st = {
      ...s, activePlayer: "user", phase: "beginning", step: "untap",
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: [createPermanent({ id: "w", card: watcher(oracle), controller: "user" })],
          hand: [], library: Array.from({ length: 20 }, (_, i) => ({ id: `L${i}`, name: `C${i}`, type: "Instant", oracle: "" })),
        },
      },
    };
    const seen = [];
    for (let i = 0; i < 30; i++) {
      st = runStepActions(advanceStep(st));                 // the step-trigger block lives in runStepActions
      st = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
      let guard = 0;
      while ((st.stack || []).length && guard++ < 20) st = resolveTopOfStack(st);
      seen.push({ phase: st.phase, step: st.step, hand: st.players.user.hand.length });
      if (st.phase === "ending" && st.step === "cleanup") break;
    }
    return seen;
  }

  it("⭐ THE LOAD-BEARING ONE — hand grows at postcombat-main and NOT at precombat-main", () => {
    const seen = walkTurn(DRAW_AT_SECOND);
    const pre = seen.find((x) => x.phase === "precombat-main");
    const post = seen.find((x) => x.phase === "postcombat-main");
    expect(pre).toBeTruthy();
    expect(post).toBeTruthy();
    // ⚠️ ABSOLUTE, not relative. `post.hand === pre.hand + 1` reads right and is WEAK: under the double-fire
    // mutation (a step-only gate) it still passes, because pre becomes 2 and post 3. Measured — M28 failed
    // only the "exactly once" sibling until this was pinned to exact counts.
    expect(pre.hand).toBe(1);   // the turn-based draw ONLY — precombat main must add nothing
    expect(post.hand).toBe(2);  // + the second-main trigger
  });

  it("it fires exactly once across the whole turn", () => {
    const seen = walkTurn(DRAW_AT_SECOND);
    expect(seen[seen.length - 1].hand).toBe(2); // 1 turn-based draw + 1 from the trigger
  });
});

describe("the parenthesised ability-word label (CR 207.2c)", () => {
  const MIKEY = "Raid (the Fridge) — At the beginning of your second main phase, if you attacked this turn, put a +1/+1 counter on target creature and create a Food token.";

  it("⭐ \"Raid (the Fridge) —\" strips like a bare \"Raid —\"", () => {
    const d = detectTriggers(watcher(MIKEY));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "secondMain", interveningIf: "you attacked this turn" });
  });

  it("Michelangelo, the Heart classifies native", () => {
    expect(classifyCard({
      name: "Michelangelo, the Heart", type: "Legendary Creature — Mutant Ninja Turtle", mana: "{2}{R}{G}", power: 4, toughness: 4,
      oracle: `Trample\n${MIKEY}\nPartner—Character select`,
    })).toMatch(/^native/);
  });

  it("⭐ CREED — the strip still only consumes LABEL-then-dash, never rules text", () => {
    // No trigger keyword after the dash → the label must not be eaten and the line must not become a trigger.
    expect(detectTriggers(watcher("Raid (the Fridge) — creatures you control get +1/+1."))).toHaveLength(0);
  });

  it("a bare ability word with no parenthetical is unchanged", () => {
    expect(detectTriggers(watcher("Raid — At the beginning of your second main phase, draw a card."))[0])
      .toMatchObject({ event: "secondMain" });
  });
});
