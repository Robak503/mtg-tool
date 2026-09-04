/**
 * nekusarSRows.test.js — SHELF-85 runbook Phase 2 · N4 + N5 + N8 (2026-09-04): Nekusar's small rows.
 *
 *   N4 Sheoldred, the Apocalypse — "Whenever an opponent draws a card, they lose 2 life." The card-drawn trigger's
 *      "that player" already rewrote to the drawing-player sentinel; the PRONOUN form ("they lose N life") is the same
 *      referent — rewritten only when it leads the clause, with the verb re-agreed.
 *   N5 Forced Fruition — "Whenever an opponent casts a spell, that player draws seven cards." The cast trigger already
 *      rewrote "that player" to "the casting player"; the draw atom gains that arm (who:"castingPlayer", off
 *      ctx.castingPlayerId — the same sentinel discipline as the upkeep / triggering-controller arms).
 *   N8 Bedevil — "Destroy target artifact, creature, or planeswalker." A destroy arm on the three-type union; the
 *      predicate (artifactCreatureOrPlaneswalker) already existed for Planar Disruption's enchant line.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { enumerateTargets, applyDrawEffect } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHEOLDRED = { id: "c-sheol", name: "Sheoldred, the Apocalypse", type: "Legendary Creature — Phyrexian Praetor", mana: "{2}{B}{B}", cmc: 4, power: 4, toughness: 5, keywords: ["Deathtouch"],
  oracle: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life." };
const FRUITION = { id: "c-ff", name: "Forced Fruition", type: "Enchantment", mana: "{4}{U}{U}", cmc: 6, keywords: [],
  oracle: "Whenever an opponent casts a spell, that player draws seven cards." };
const BEDEVIL = { id: "c-bd", name: "Bedevil", type: "Instant", mana: "{B}{B}{R}", cmc: 3, keywords: [], oracle: "Destroy target artifact, creature, or planeswalker." };

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-lib-${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }));
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("N4 — Sheoldred, the Apocalypse", () => {
  it("both draw triggers parse: your draw gains 2, an opponent's draw costs THEM 2 (the pronoun referent)", () => {
    const d = detectTriggers(SHEOLDRED);
    expect(d.map((x) => [x.event, x.effectClause])).toEqual([["cardDrawn", "you gain 2 life"], ["cardDrawn", "the drawing player loses 2 life"]]);
    expect(parseEffectClause(d[1].effectClause, "Creature").atoms).toEqual([{ op: "lose-life", amount: 2, who: "drawingPlayer", targetType: null }]);
  });
  it("seen-to-fail: a 'they' that does not lead the clause is left alone (and parks)", () => {
    const odd = { ...SHEOLDRED, oracle: "Whenever an opponent draws a card, you gain 1 life and they lose 2 life." };
    const d = detectTriggers(odd).find((x) => /they/.test(x.effectClause));
    expect(d).toBeTruthy();
    expect(programConfidence(parseEffectClause(d.effectClause, "Creature"))).toBe("low");
  });
  it("runtime: the AI draws → the AI loses 2; the user draws → the user gains 2", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, turn: 4, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, life: 40, battlefield: [createPermanent({ id: "SHEOL", card: SHEOLDRED, controller: "user" })], library: lib("user", 3), hand: [] }, ai: { ...s.players.ai, life: 40, library: lib("ai", 3), hand: [] } } };
    s = applyDrawEffect(s, { controller: "ai", amount: 1 }); // the single draw chokepoint fires the card-drawn triggers itself
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.players.ai.life).toBe(38);
    expect(s.players.user.life).toBe(40);
    s = applyDrawEffect(s, { controller: "user", amount: 1 });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.players.user.life).toBe(42);
    expect(s.players.ai.life).toBe(38);
  });
});

describe("N5 — Forced Fruition", () => {
  it("the cast trigger's draw parses for the casting player", () => {
    const d = detectTriggers(FRUITION);
    expect(d.map((x) => [x.event, x.effectClause])).toEqual([["cast", "the casting player draws seven cards"]]);
    expect(parseEffectClause(d[0].effectClause, "Enchantment").atoms).toEqual([{ op: "draw", amount: 7, who: "castingPlayer", targetType: null }]);
  });
  it("runtime: the AI casts a spell and draws seven; the user draws nothing", () => {
    const bear = { id: "ai-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" };
    const forest = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, turn: 4, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "FF", card: FRUITION, controller: "user" })], library: lib("user", 8), hand: [] }, ai: { ...s.players.ai, battlefield: [forest("F1"), forest("F2")], hand: [bear], library: lib("ai", 9) } } };
    const cast = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "ai-bear");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    s = resolveAll(s);
    expect(s.players.ai.hand).toHaveLength(7);
    expect(s.players.ai.library).toHaveLength(2);
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
  });
});

describe("N8 — Bedevil", () => {
  it("parses to a destroy on the three-type union", () => {
    const r = parseEffectClause(BEDEVIL.oracle, "Instant");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "destroy", targetType: "artifactCreatureOrPlaneswalker", restrictions: [] }]);
  });
  it("the pool is exactly artifacts, creatures and planeswalkers — never an enchantment or a land", () => {
    const mk = (id, type) => createPermanent({ id, card: { id: "card-" + id, name: id, type, type_line: type, oracle: "" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [mk("Ring", "Artifact"), mk("Bear", "Creature — Bear"), mk("Jace", "Legendary Planeswalker — Jace"), mk("Rhystic", "Enchantment"), mk("Island", "Basic Land — Island")] } } };
    const ids = enumerateTargets(s, "user", { targetType: "artifactCreatureOrPlaneswalker", restrictions: [] }, ["B", "R"]).map((t) => t.id).sort();
    expect(ids).toEqual(["Bear", "Jace", "Ring"]);
  });
});

describe("classifier", () => {
  it("Sheoldred and Forced Fruition are native-trigger; Bedevil a native spell", () => {
    expect(classifyCard(SHEOLDRED)).toBe("native-trigger");
    expect(classifyCard(FRUITION)).toBe("native-trigger");
    expect(classifyCard(BEDEVIL)).toBe("native-spell");
  });
});
