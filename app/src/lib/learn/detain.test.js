/**
 * detain.test.js — ④-AZ (2026-09-04 night): DETAIN (CR 701.29) — "Until your next turn, that creature can't attack or block
 * and its activated abilities can't be activated." Three layer-6 grants the engine already enforced (cantAttack — the
 * Pacifism-class attacker gate; cantBlock — canBlockAttacker; activatedAbilitiesLocked — lockedActivationSource) under
 * goad's untilOwnersNextTurn duration (owner = the detainer). Azorius Arrester / Isperia's Skywatch / Soulsworn Spirit
 * (the census family), Lyev Skyknight, Martial Law, New Prahv Guildmage, Inaction Injunction. Real oracle fixtures
 * (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DETAIN_REMINDER = " (Until your next turn, that creature can't attack or block and its activated abilities can't be activated.)";
const ARRESTER = { id: "c-aa", name: "Azorius Arrester", type: "Creature — Human Soldier", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, power: 2, toughness: 1, keywords: [], oracle: "When this creature enters, detain target creature an opponent controls." + DETAIN_REMINDER };
const SKYWATCH = { id: "c-is", name: "Isperia's Skywatch", type: "Creature — Vedalken Knight", mana: "{5}{U}", cmc: 6, power: 3, toughness: 3, keywords: ["Flying"], oracle: "Flying\nWhen this creature enters, detain target creature an opponent controls." + DETAIN_REMINDER };
const SPIRIT = { id: "c-ss", name: "Soulsworn Spirit", type: "Creature — Spirit", mana: "{3}{U}", cmc: 4, power: 2, toughness: 1, keywords: [], oracle: "This creature can't be blocked.\nWhen this creature enters, detain target creature an opponent controls." + DETAIN_REMINDER };
const SKYKNIGHT = { id: "c-ls", name: "Lyev Skyknight", type: "Creature — Human Knight", mana: "{1}{W}{U}", cmc: 3, power: 3, toughness: 1, keywords: ["Flying"], oracle: "Flying\nWhen this creature enters, detain target nonland permanent an opponent controls. (Until your next turn, that permanent can't attack or block and its activated abilities can't be activated.)" };
const MARTIAL_LAW = { id: "c-ml", name: "Martial Law", type: "Enchantment", mana: "{2}{W}{W}", cmc: 4, keywords: [], oracle: "At the beginning of your upkeep, detain target creature an opponent controls." + DETAIN_REMINDER };
const GUILDMAGE = { id: "c-np", name: "New Prahv Guildmage", type: "Creature — Human Wizard", mana: "{W}{U}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "{W}{U}: Target creature gains flying until end of turn.\n{3}{W}{U}: Detain target nonland permanent an opponent controls. (Until your next turn, that permanent can't attack or block and its activated abilities can't be activated.)" };
const INJUNCTION = { id: "c-ii", name: "Inaction Injunction", type: "Sorcery", mana: "{1}{U}", cmc: 2, keywords: [], oracle: "Detain target creature an opponent controls." + DETAIN_REMINDER + "\nDraw a card." };

describe("the parse and the classifier", () => {
  it("⭐ 'detain target creature / nonland permanent an opponent controls' → the detain atom; the mass form stays LOW", () => {
    expect(parseEffectClause("detain target creature an opponent controls", "Instant", { sourceScoped: true }).atoms)
      .toEqual([{ op: "detain", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    expect(parseEffectClause("detain target nonland permanent an opponent controls", "Instant", { sourceScoped: true }).atoms[0])
      .toMatchObject({ op: "detain", targetType: "nonlandPermanent" });
    expect(parseEffectClause("detain each creature your opponents control", "Instant", { sourceScoped: true }).confidence).toBe("low");
  });
  it("the tiers", () => {
    for (const c of [ARRESTER, SKYWATCH, SPIRIT, SKYKNIGHT, MARTIAL_LAW]) expect(classifyCard(c), c.name).toBe("native-trigger");
    expect(classifyCard(GUILDMAGE)).toBe("native-activated");
    expect(classifyCard(INJUNCTION)).toBe("native-spell");
  });
});

describe("runtime", () => {
  const PUMP_BEAR = { id: "card-bear", name: "Pump Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "{1}: This creature gets +1/+1 until end of turn." };
  /** The user casts Azorius Arrester into a board where the AI's only creature is a Pump Bear; the ETB detains it. */
  function detained() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [ARRESTER], battlefield: [], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } },
        ai: { ...s0.players.ai, hand: [], battlefield: [{ ...createPermanent({ id: "bear", card: PUMP_BEAR, controller: "ai" }), summoningSick: false }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-aa");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    if (!s.stack.length) s = flushTriggers(s);
    expect(s.stack).toHaveLength(1);
    return resolveTopOfStack(s);
  }
  it("⭐ the detained bear carries all three locks; it cannot be declared as an attacker, cannot block, and its pump is not offered", () => {
    const s = detained();
    for (const kw of ["cantAttack", "cantBlock", "activatedAbilitiesLocked"]) expect(permanentHasKeyword(s, "bear", kw), kw).toBe(true);
    // the AI's turn: no attack with the bear
    const aiTurn = { ...s, turn: 7, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers" };
    expect(legalActionsForPlayer(aiTurn, "ai").some((a) => a.kind === "declare-attacker" && a.permanentId === "bear")).toBe(false);
    // the AI's main phase: the pump is locked
    const aiMain = { ...s, turn: 7, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main" };
    expect(legalActionsForPlayer(aiMain, "ai").some((a) => a.kind === "activate-ability" && a.permanentId === "bear")).toBe(false);
    // the user attacks: the bear may not block
    const arrester = s.players.user.battlefield.find((p) => p.card?.name === "Azorius Arrester");
    const userCombat = { ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: arrester.id, defender: "ai" }], blockers: [] } };
    expect(canBlockAttacker(userCombat, "bear", arrester.id, "ai")).toBe(false);
  });
  it("⭐ 'until your next turn': the locks survive the casting turn's cleanup and the bear's controller's turn, and lift at the cleanup of the detainer's next turn", () => {
    const s = detained();
    const has = (st) => permanentHasKeyword(st, "bear", "cantAttack");
    expect(has(expireContinuousEffects({ ...s, activePlayer: "user" }, { atCleanupOfTurn: 6 }))).toBe(true);
    expect(has(expireContinuousEffects({ ...s, activePlayer: "ai" }, { atCleanupOfTurn: 7 }))).toBe(true);
    expect(has(expireContinuousEffects({ ...s, activePlayer: "user" }, { atCleanupOfTurn: 8 }))).toBe(false);
  });
  it("an undetained bear is untouched (the locks are per-target, not board-wide)", () => {
    const s = detained();
    expect(findPermanent(s, "bear")).toBeTruthy();
    const other = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, { ...createPermanent({ id: "free", card: { ...PUMP_BEAR, id: "card-free", name: "Free Bear" }, controller: "ai" }), summoningSick: false }] } } };
    expect(permanentHasKeyword(other, "free", "cantAttack")).toBe(false);
  });
});
