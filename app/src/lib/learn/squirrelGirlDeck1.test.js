/**
 * squirrelGirlDeck1.test.js — SG-2 (2026-09-03): the three cheapest single-blockers in Colton's Squirrel Girl
 * deck (overnight stage ③), each one word or one scope in front of machinery that already ran:
 *
 *   • Woodland Bellower — "search your library for a NONLEGENDARY green creature card with mana value 3 or
 *     less, put it onto the battlefield": a supertype-exclusion gate on the tutor filter (`excludeLegendary`),
 *     peeled before the color, enforced in the shared matcher (never a group word — no type line says it).
 *   • Altar of the Brood — "Whenever ANOTHER permanent you control enters, each opponent mills a card": the
 *     permanent-wide enters scope existed for "a permanent you control"; "another" now carries etbExcludeSelf,
 *     and the permanentYouControl scope honours it, so the Altar never mills on its own arrival.
 *   • Skullclamp — "Whenever equipped creature dies, draw two cards": the equippedCreature dies scope existed
 *     (enchanted-creature dies; the SELF-LTB return-it family); a registered detector now takes every OTHER
 *     effect, gated off the return-it clause so the two lanes never overlap.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, attachPermanent, destroyLethalCreatures } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BELLOWER = { id: "c-bellower", name: "Woodland Bellower", type: "Creature — Beast", mana: "{4}{G}{G}", power: 6, toughness: 5, keywords: [],
  oracle: "When this creature enters, you may search your library for a nonlegendary green creature card with mana value 3 or less, put it onto the battlefield, then shuffle." };
const ALTAR = { id: "c-altar", name: "Altar of the Brood", type: "Artifact", mana: "{1}", keywords: [],
  oracle: "Whenever another permanent you control enters, each opponent mills a card." };
const SKULLCLAMP = { id: "c-clamp", name: "Skullclamp", type: "Artifact — Equipment", mana: "{1}", keywords: [],
  oracle: "Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}" };

const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && !s.pendingChoice && g++ < 6) s = resolveTopOfStack(s); return s; };

describe("Woodland Bellower — the nonlegendary gate", () => {
  it("parses 'nonlegendary green creature' as a creature group + green + the exclusion", () => {
    expect(parseTutorFilter("nonlegendary green creature")).toEqual({ groups: [["creature"]], colors: ["green"], excludeLegendary: true });
  });

  it("the matcher refuses a LEGENDARY green creature and a non-green one; admits a plain green creature", () => {
    const f = parseTutorFilter("nonlegendary green creature");
    expect(cardMatchesTutorFilter({ name: "Grizzly Bears", type: "Creature — Bear", colors: ["G"] }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Toski", type: "Legendary Creature — Squirrel", colors: ["G"] }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Isamaru", type: "Creature — Dog", colors: ["W"] }, f)).toBe(false);
  });

  it("classifies native; a filter word the vocabulary lacks still parks", () => {
    expect(classifyCard(BELLOWER)).toMatch(/^native/);
    expect(classifyCard({ ...BELLOWER, oracle: BELLOWER.oracle.replace("nonlegendary green creature", "nonlegendary green Beast") })).not.toMatch(/^native/);
  });
});

describe("Altar of the Brood — 'another permanent you control enters'", () => {
  it("detects a permanent-wide enters trigger that excludes the source", () => {
    const t = detectTriggers(ALTAR)[0];
    expect(t).toMatchObject({ event: "permanentEnters", scope: "permanentYouControl", etbExcludeSelf: true });
  });

  function board() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const lib = (id) => Array.from({ length: 3 }, (_, i) => ({ id: `${id}${i}`, name: "Forest", type: "Basic Land — Forest" }));
    return {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "altar", card: ALTAR, controller: "user", summoningSick: false })], hand: [] },
        ai1: { ...s0.players.ai1, library: lib("a"), graveyard: [] }, ai2: { ...s0.players.ai2, library: lib("b"), graveyard: [] }, ai3: { ...s0.players.ai3, library: lib("c"), graveyard: [] },
      },
    };
  }
  const gy = (s, p) => s.players[p].graveyard.length;

  it("⭐ another permanent entering mills each opponent one card", () => {
    let s = board();
    s = enterPermanent(s, { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect([gy(s, "ai1"), gy(s, "ai2"), gy(s, "ai3")]).toEqual([1, 1, 1]);
  });

  it("⛔ the Altar's OWN entry mills nobody", () => {
    const s0 = board();
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [] } } };
    s = enterPermanent(s, ALTAR, "user");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect([gy(s, "ai1"), gy(s, "ai2"), gy(s, "ai3")]).toEqual([0, 0, 0]);
  });

  it("classifies native", () => {
    expect(classifyCard(ALTAR)).toMatch(/^native/);
  });
});

describe("Skullclamp — equipped creature dies, any effect but the return-it family", () => {
  it("detects the dies trigger on the equippedCreature scope", () => {
    const t = detectTriggers(SKULLCLAMP).find((x) => x.event === "dies");
    expect(t).toMatchObject({ event: "dies", scope: "equippedCreature" });
  });

  it("⭐ clamp a 1/1: the +1/-1 kills it, the dies trigger draws two", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bird = createPermanent({ id: "bird", card: { id: "c-bird", name: "Bird", type: "Creature — Bird", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    const clamp = createPermanent({ id: "clamp", card: SKULLCLAMP, controller: "user", summoningSick: false });
    let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [bird, clamp], hand: [], library: Array.from({ length: 5 }, (_, i) => ({ id: `L${i}`, name: "Forest", type: "Basic Land — Forest" })) } } };
    s = attachPermanent(s, { equipId: "clamp", targetId: "bird" });
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.some((d) => d.id === "bird")).toBe(true);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.length).toBe(2);
  });

  it("⛔ the SELF-LTB return-it family is untouched (Sword of the Realms still parses as a self-return, not a generic dies)", () => {
    const SWORD = { name: "Sword of the Realms", type: "Legendary Artifact — Equipment", oracle: "Equipped creature gets +2/+0 and has vigilance.\nWhenever equipped creature dies, return it to its owner's hand.\nEquip {1}" };
    const t = detectTriggers(SWORD).find((x) => /return it/i.test(x.sourceText || ""));
    expect(t).toBeTruthy();
    expect(t.scope === "equippedCreature" && t.effectClause === "return it to its owner's hand").toBe(false);
  });

  it("classifies native", () => {
    expect(classifyCard(SKULLCLAMP)).toMatch(/^native/);
  });
});
