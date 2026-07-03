/**
 * doubleMajor.test.js — COPY-A-CREATURE-SPELL (Double Major, CR 707.10 / 707.12).
 *
 * "Copy target creature spell you control, except it isn't legendary if the spell is legendary. (A copy of a
 * creature spell becomes a token.)"
 *
 * THE COPY PATH (all here):
 *   1. classifyCard → native-spell: the body parses to a single HIGH `copy-creature-spell` atom (targetType:
 *      "spell", spellFilter:"creature", spellController:"you", copyNotCounter, stripLegendary).
 *   2. Cast Double Major in the response window (a creature spell of YOURS on the stack + priority): the cast
 *      path offers exactly that own creature spell as the legal target (spellController:"you" + spellFilter:
 *      "creature") — an OPPONENT's creature spell / a noncreature spell is NOT offered.
 *   3. Double Major resolves (applyCopyCreatureSpell) → a NEW stack object on top: a token snapshot of the
 *      chosen spell's copiable card, carrying the SAME PERMANENT_ETB payload, so when it resolves it ENTERS as
 *      a token creature copy (CR 707.10a — a copy of a permanent spell becomes a token). token:true is stamped
 *      so it never goes to a zone as a card.
 *   4. Resolving the copy → a real token creature permanent on the battlefield (a playable body); resolving the
 *      original → the real creature. Two copies of one card coexist; with `stripLegendary` a legend copy loses
 *      the Legendary supertype (CR 707.12), so the legend rule doesn't kill one.
 *
 * CREED anti-FP pins: an OPPONENT's creature spell is never a legal target ("you control"); a NONCREATURE spell
 * of yours is never a legal target ("creature spell"); a target that left the stack fizzles (CR 608.2b), never a
 * fabricated body. Real oracle text (verified vs the bundled index), verbatim.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

// ── real oracle text (verbatim, bundled-index verified) ─────────────────────────────
const DOUBLE_MAJOR = {
  id: "dm", name: "Double Major", type: "Instant", mana: "{G}{U}",
  oracle: "Copy target creature spell you control, except it isn't legendary if the spell is legendary. (A copy of a creature spell becomes a token.)",
};

// Copiable card values of a creature spell sitting on the stack.
const BEAR = { id: "card-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, mana: "{1}{G}", oracle: "" };
const LEGEND = { id: "card-legend", name: "Kird Ape", type: "Legendary Creature — Ape", power: 1, toughness: 1, mana: "{R}", oracle: "" };
const BOLT = { id: "card-bolt", name: "Lightning Bolt", type: "Instant", oracle: "Lightning Bolt deals 3 damage to any target.", mana: "{R}" };

// A CREATURE spell on the stack: resolves via PERMANENT_ETB (a permanent enters), like a real creature cast.
function creatureSpellOnStack(id, card, controller) {
  return {
    id, kind: "spell", controller, targets: [], cost: null,
    source: card,
    payload: { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card, controller } },
  };
}
// A NONCREATURE spell on the stack (an instant), for the negative-target pins.
function instantSpellOnStack(id, card, controller) {
  return {
    id, kind: "spell", controller, targets: [], cost: null,
    source: card,
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  };
}

// A response-window state: `responder` holds priority while `stack` sits unresolved.
function responseState({ responder = "user", stack = [], userHand = [], userPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main",
    activePlayer: "user", priorityHolder: responder, consecutivePasses: 0,
    stack,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool } },
    },
  };
}

describe("classification", () => {
  it("Double Major → native-spell (a single HIGH copy-creature-spell atom)", () => {
    expect(classifyCard(DOUBLE_MAJOR)).toBe("native-spell");
    const prog = parseEffectProgram(DOUBLE_MAJOR);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0]).toMatchObject({
      op: "copy-creature-spell", targetType: "spell", spellFilter: "creature",
      spellController: "you", copyNotCounter: true, stripLegendary: true,
    });
  });

  it("a Double Major WITHOUT the legendary rider still flips (stripLegendary omitted)", () => {
    const noRider = { ...DOUBLE_MAJOR, oracle: "Copy target creature spell you control." };
    expect(classifyCard(noRider)).toBe("native-spell");
    const prog = parseEffectProgram(noRider);
    expect(prog.atoms[0].op).toBe("copy-creature-spell");
    expect(prog.atoms[0].stripLegendary).toBeUndefined();
  });
});

describe("legal targeting (cast path)", () => {
  it("offers your own creature spell as the legal target", () => {
    const s = responseState({
      userHand: [DOUBLE_MAJOR], userPool: { G: 1, U: 1 },
      stack: [creatureSpellOnStack("s1", BEAR, "user")],
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dm");
    expect(cast).toBeTruthy();
    expect(cast.targets[0]).toMatchObject({ type: "spell", id: "s1" });
  });

  it("CREED: an OPPONENT's creature spell is NOT a legal target (you control only)", () => {
    const s = responseState({
      userHand: [DOUBLE_MAJOR], userPool: { G: 1, U: 1 },
      stack: [creatureSpellOnStack("opp", BEAR, "ai")],
    });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "dm");
    // No legal creature spell YOU control → Double Major is not castable (no target).
    expect(casts).toHaveLength(0);
  });

  it("CREED: a NONCREATURE spell of yours is NOT a legal target (creature spell only)", () => {
    const s = responseState({
      userHand: [DOUBLE_MAJOR], userPool: { G: 1, U: 1 },
      stack: [instantSpellOnStack("bolt", BOLT, "user")],
    });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "dm");
    expect(casts).toHaveLength(0);
  });
});

describe("resolution — the copy is a real playable token creature", () => {
  it("copying your Grizzly Bears → a token 2/2 Bear enters + the original 2/2 Bear enters (two bodies)", () => {
    let s = responseState({
      userHand: [DOUBLE_MAJOR], userPool: { G: 1, U: 1 },
      stack: [creatureSpellOnStack("s1", BEAR, "user")],
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dm");
    s = dispatchAction(s, cast); // Double Major goes on the stack above the Bear spell
    // Resolve everything (Double Major → mints the copy; copy → token creature; Bear spell → real creature).
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 50) s = resolveTopOfStack(s);

    const bears = s.players.user.battlefield.filter((p) => /Bear/.test(String(p.card?.type || "")));
    expect(bears).toHaveLength(2);
    const tokens = bears.filter((p) => p.card?.token);
    const reals = bears.filter((p) => !p.card?.token);
    expect(tokens).toHaveLength(1); // the copy IS a token (CR 707.10a)
    expect(reals).toHaveLength(1);  // the original creature is a real card
    // Both are genuine 2/2 Bears — the copy PLAYS as the copied creature (name/type/P-T copied).
    expect(tokens[0].card.name).toBe("Grizzly Bears");
    expect(tokens[0].card.power).toBe(2);
    expect(tokens[0].card.toughness).toBe(2);
  });

  it("CR 707.12 — the token copy of a LEGENDARY creature is NOT legendary (except-rider), so both coexist", () => {
    let s = responseState({
      userHand: [DOUBLE_MAJOR], userPool: { G: 1, U: 1 },
      stack: [creatureSpellOnStack("s1", LEGEND, "user")],
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dm");
    s = dispatchAction(s, cast);
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 50) s = resolveTopOfStack(s);

    const apes = s.players.user.battlefield.filter((p) => /Ape/.test(String(p.card?.type || "")));
    expect(apes).toHaveLength(2); // the legend rule did NOT kill either (the copy isn't legendary)
    const tokenApe = apes.find((p) => p.card?.token);
    expect(tokenApe).toBeTruthy();
    expect(/Legendary/i.test(String(tokenApe.card.type))).toBe(false); // CR 707.12
  });

  it("CREED: the target left the stack (already resolved) → the copy fizzles, no fabricated body", () => {
    // Double Major on the stack targeting a spell id that no longer exists.
    const dmObj = {
      id: "dmstk", kind: "spell", controller: "user", targets: [{ type: "spell", id: "gone" }], cost: null,
      source: DOUBLE_MAJOR,
      payload: {
        resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
        params: { program: parseEffectProgram(DOUBLE_MAJOR), controller: "user", targets: [{ type: "spell", id: "gone" }] },
      },
    };
    let s = responseState({ stack: [dmObj] });
    s = resolveTopOfStack(s);
    // No token entered; a fizzle was logged.
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens).toHaveLength(0);
    expect(s.log.some((e) => e.effect === "copy-creature-spell-fizzle")).toBe(true);
  });
});
