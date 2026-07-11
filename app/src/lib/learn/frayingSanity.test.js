/**
 * frayingSanity.test.js — the PLAYER-AURA lane + Fraying Sanity (SHELF S7, CR 303.4).
 *
 * "Enchant player / At the beginning of each end step, enchanted player mills X cards, where X is the
 * number of cards put into their graveyard from anywhere this turn."
 *   1. isPlayerAuraCard (staticAbilityParser) — an Aura whose Enchant subject is exactly "player".
 *   2. classifyCard: player-aura gate — the Enchant line stripped, EVERY remaining sentence a natively-
 *      routed trigger → native-aura; any residue → body-only. legalChoices gates the player-target cast
 *      enumeration on the SAME tier, so offer and claim can't drift.
 *   3. AURA_ETB's player branch enters the permanent with enchantedPlayerId stamped (re-checked at
 *      resolution — an eliminated target fizzles the Aura to its owner's graveyard, CR 608.3b).
 *   4. players[pid].gyEnteredThisTurn — stamped at the recordGraveyardEvents chokepoint (cards only,
 *      tokens filtered), reset all-seats at untap; the enchanted-gy-mill atom reads it live and mills
 *      through millOnePlayer (milled triggers + Bruvac + the milledThisTurn ledger all apply).
 *   (The elimination sweep — the aura to its owner's GY when the enchanted player leaves — is exercised
 *   by full FFA games; its failure mode is FN-safe by construction: the resolver's players[pid] guard
 *   no-ops a dangling referent, never a mis-aimed mill.)
 * CREED FP = a mill for the wrong player, a count fed by another player's graveyard, a token counting
 * as a card, or a body-only curse being offered the player-cast — all pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, millCards, moveCardToZone,
  destroyLethalCreatures, resetCreatureDeathsAllPlayers,
} from "./gameState.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { isPlayerAuraCard } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const FS_ORACLE =
  "Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.";
const fsCard = (id = "fs") => ({ id, name: "Fraying Sanity", type: "Enchantment — Aura Curse", mana: "{2}{U}", oracle: FS_ORACLE });
// A player-aura with UNMODELED residue (Curse of Hospitality's trample-grant rider) — must stay parked.
const UNMODELED_CURSE = { id: "ch", name: "Curse of Hospitality", type: "Enchantment — Aura Curse", mana: "{2}{R}", oracle: "Enchant player\nCreatures attacking enchanted player have trample.\nWhenever a creature deals combat damage to enchanted player, that creature's controller may exile up to one target card from a graveyard." };
const creatureCard = (id) => ({ id, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withZone(state, pid, zone, items) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], [zone]: items } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) { s = resolveTopOfStack(s); s = flushTriggers(s, {}); }
  return s;
}

describe("detection + classify + the cast gate", () => {
  it("Fraying Sanity is a player-aura whose trigger routes natively → native-aura", () => {
    expect(isPlayerAuraCard(fsCard())).toBe(true);
    const [d] = detectTriggers(fsCard());
    expect(d).toMatchObject({ event: "endStep" });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(fsCard())).toBe("native-aura");
  });

  it("CREED: a player-aura with unmodeled residue stays body-only and is NEVER offered the player-cast", () => {
    expect(isPlayerAuraCard(UNMODELED_CURSE)).toBe(true);
    expect(classifyCard(UNMODELED_CURSE)).toBe("body-only");
    let s = baseState();
    s = withZone(s, "user", "hand", [UNMODELED_CURSE]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 1, C: 5 } } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ch" && a.enchantsPlayer);
    expect(casts).toHaveLength(0); // body-only → the Arbiter lane, never a player-target offer
  });
});

describe("the gyEnteredThisTurn tally (the recordGraveyardEvents chokepoint)", () => {
  it("mills, discards, and real deaths count for the RIGHT player; tokens never count; untap resets", () => {
    let s = baseState();
    s = withZone(s, "ai1", "library", [creatureCard("m1"), creatureCard("m2")]);
    s = millCards(s, { playerId: "ai1", count: 2 });
    expect(s.players.ai1.gyEnteredThisTurn).toBe(2);
    expect(s.players.ai2.gyEnteredThisTurn ?? 0).toBe(0);
    s = withZone(s, "ai2", "hand", [creatureCard("h1")]);
    s = moveCardToZone(s, { playerId: "ai2", fromZone: "hand", toZone: "graveyard", cardId: "h1" });
    expect(s.players.ai2.gyEnteredThisTurn).toBe(1);
    const real = { ...createPermanent({ id: "r1", card: creatureCard("r1"), controller: "ai3" }), damageMarked: 99 };
    const token = { ...createPermanent({ id: "t1", card: { ...creatureCard("t1"), token: true }, controller: "ai3" }), damageMarked: 99 };
    s = withZone(s, "ai3", "battlefield", [real, token]);
    s = destroyLethalCreatures(s).state;
    expect(s.players.ai3.gyEnteredThisTurn).toBe(1); // the real card counted, the token never did
    s = resetCreatureDeathsAllPlayers(s);
    for (const pid of Object.keys(s.players)) expect(s.players[pid].gyEnteredThisTurn).toBe(0);
  });
});

describe("the cast lane + the end-step mill (CREED core)", () => {
  function castOnAi1() {
    let s = baseState();
    s = withZone(s, "user", "hand", [fsCard()]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, U: 1, C: 5 } } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "fs" && a.enchantsPlayer);
    expect(casts.map((a) => a.targets[0].id).sort()).toEqual(["ai1", "ai2", "ai3", "user"]); // one per living player
    s = dispatchAction(s, casts.find((a) => a.targets[0].id === "ai1"));
    s = resolveTopOfStack(s);
    const aura = s.players.user.battlefield.find((p) => p.card?.id === "fs");
    expect(aura).toBeDefined();
    expect(aura.enchantedPlayerId).toBe("ai1");
    return s;
  }

  it("casts once per living player; resolves onto the chosen player's id", () => {
    castOnAi1();
  });

  it("the end-step trigger mills the ENCHANTED player by THEIR gy count — and the mill re-feeds the tally", () => {
    let s = castOnAi1();
    s = withZone(s, "ai1", "library", Array.from({ length: 10 }, (_, i) => creatureCard(`L${i}`)));
    s = withZone(s, "ai2", "library", [creatureCard("x1"), creatureCard("x2")]);
    s = millCards(s, { playerId: "ai1", count: 3 }); // 3 cards into ai1's GY this turn
    s = millCards(s, { playerId: "ai2", count: 2 }); // another player's GY — must NOT count for ai1
    const libBefore = s.players.ai1.library.length;
    let after = resolveAll(checkStepTriggers(s, "endStep"));
    expect(after.players.ai1.library.length).toBe(libBefore - 3); // X = ai1's own count, never ai2's
    expect(after.players.ai1.gyEnteredThisTurn).toBe(6); // the mill re-fed the tally (3 + 3)
    expect(after.players.ai2.library.length).toBe(0); // untouched beyond its own earlier mill
  });

  it("with zero graveyard traffic this turn the trigger resolves a clean 0-mill", () => {
    let s = castOnAi1();
    s = withZone(s, "ai1", "library", [creatureCard("L0")]);
    const after = resolveAll(checkStepTriggers(s, "endStep"));
    expect(after.players.ai1.library.length).toBe(1); // X=0 → nothing milled
  });
});
