/**
 * squirrelGirl.test.js — SG-1 (2026-09-03): THE UNBEATABLE SQUIRREL GIRL, the commander of Colton's mono-green
 * deck (overnight stage ③ — "getting as far on Squirrel Girl as possible, making her native; the commander
 * first"). Two abilities, both parked on VOCABULARY, not machinery:
 *
 *   "Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green
 *    Squirrel creature token."  — the flavor label ends in "?", which no allowlist carried; the "enters or
 *    attacks" split and the token creation already ran.
 *   "I LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of
 *    Squirrels you control."  — the activated label's "!" fell outside the strip's character class, and
 *    "squirrel" was not in the count-subtype vocabulary; the X-tokens-by-count atom already ran.
 *
 * The trigger-side rule is GENERIC: a label ending in "?" or "!" is flavor by construction (no CR keyword,
 * ability word, or rules-bearing dash prefix ends that way) — 11 corpus cards print one.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { detectTriggers } from "./triggers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SQUIRREL_GIRL = {
  id: "c-sg", name: "The Unbeatable Squirrel Girl", type: "Legendary Creature — Squirrel Human Hero", mana: "{1}{G}{G}{G}", mana_cost: "{1}{G}{G}{G}", power: 4, toughness: 4, keywords: [],
  oracle: "Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control.",
};

describe("the labels — flavor with terminal punctuation is stripped, rules-bearing prefixes are not", () => {
  it("the trigger is detected as a self enters-or-attacks token maker", () => {
    const ts = detectTriggers(SQUIRREL_GIRL);
    expect(ts.length).toBeGreaterThanOrEqual(1);
    expect(ts.every((t) => /create a 1\/1 green squirrel creature token/i.test(t.effectClause))).toBe(true);
    expect(ts.some((t) => t.event === "etb")).toBe(true);
  });

  it("the activated ability parses with a modeled cost and a HIGH program", () => {
    const abs = parseActivatedAbilities(SQUIRREL_GIRL);
    const x = abs.find((a) => /squirrel/i.test(a.effectClause || ""));
    expect(x).toBeTruthy();
    expect(x.costModeled).toBe(true);
    expect(x.program?.confidence).toBe("high");
  });

  it("⛔ a rules-bearing dash prefix is still NOT stripped (a Saga chapter marker before a trigger)", () => {
    const SAGA = { name: "Probe Saga", type: "Enchantment — Saga", oracle: "I — When this Saga enters, draw a card." };
    // "I —" ends in a roman numeral, not "?"/"!" — the generic rule leaves it alone, so the chapter stays a chapter.
    expect(detectTriggers(SAGA).some((t) => t.effectClause === "draw a card" && t.event === "etb")).toBe(false);
  });
});

function board() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = [
    createPermanent({ id: "sg", card: SQUIRREL_GIRL, controller: "user", summoningSick: false }),
    createPermanent({ id: "sq1", card: { id: "t1", name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", token: true }, controller: "user", summoningSick: false }),
    createPermanent({ id: "sq2", card: { id: "t2", name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", token: true }, controller: "user", summoningSick: false }),
  ];
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 6, C: 2 } } },
  };
}
const squirrels = (s) => s.players.user.battlefield.filter((p) => /\bSquirrel\b/.test(p.card?.type || "")).length;

describe("runtime — the X ability counts every Squirrel you control, herself included", () => {
  it("⭐ with Squirrel Girl + two Squirrel tokens, X = 3: three more Squirrels arrive", () => {
    const s = board();
    expect(squirrels(s)).toBe(3);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sg");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(squirrels(out)).toBe(6);
  });
});

describe("runtime — the enters-or-attacks trigger", () => {
  it("entering the battlefield makes a Squirrel", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...SQUIRREL_GIRL, id: "H" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 6, C: 2 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "H");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast)); // the creature resolves and enters
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while ((s.stack || []).length && guard++ < 4) s = resolveTopOfStack(s);
    expect(squirrels(s)).toBe(2); // Squirrel Girl herself + the token
  });
});

describe("classification", () => {
  it("⭐ THE COMMANDER IS NATIVE", () => {
    expect(classifyCard(SQUIRREL_GIRL)).toMatch(/^native/);
  });

  it("CREED — the same card with an unreadable count still parks", () => {
    expect(classifyCard({ ...SQUIRREL_GIRL, oracle: SQUIRREL_GIRL.oracle.replace("the number of Squirrels you control", "the number of Squirrels that attacked this turn") })).not.toMatch(/^native/);
  });
});
