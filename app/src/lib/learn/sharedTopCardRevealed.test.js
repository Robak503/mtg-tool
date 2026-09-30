/**
 * sharedTopCardRevealed.test.js — "Players play with the top card of their libraries revealed." (the 09-06 plan's stage ③ · 52,
 * 2026-09-30 — Wizened Snitches, Field of Dreams).
 *
 * The symmetric form of "Play with the top card of your library revealed", which is already credited inert: revealing a card is
 * INFORMATION, it changes no game state, and this sim is perfect-information (see staticAbilityParser's PLAY-FROM-TOP note).
 * The same { inertInfo } marker, whole-clause anchored; the invariance test below is the "changes nothing" half.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIELD_OF_DREAMS = { name: "Field of Dreams", type: "World Enchantment", mana: "{U}", cmc: 1, colors: ["U"], keywords: [],
  oracle: "Players play with the top card of their libraries revealed." };
const WIZENED_SNITCHES = { name: "Wizened Snitches", type: "Creature — Faerie Rogue", mana: "{3}{U}", cmc: 4, colors: ["U"], power: "1", toughness: "3", keywords: ["Flying"],
  oracle: "Flying\nPlayers play with the top card of their libraries revealed." };
const SHOCK = { id: "sh", name: "Shock", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, colors: ["R"], keywords: [], oracle: "Shock deals 2 damage to any target." };

describe("the clause", () => {
  it("⭐ the symmetric reveal is the inert information marker, and both carriers read native", () => {
    expect(parseStaticAbilities(FIELD_OF_DREAMS)).toEqual([{ inertInfo: true }]);
    expect([FIELD_OF_DREAMS, WIZENED_SNITCHES].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
  });
  it("whole-clause anchored — a conditional reveal is not this", () => {
    expect(parseStaticAbilities({ name: "Probe", type: "Enchantment", mana: "{W}", oracle: "Players play with the top card of their libraries revealed as long as you control a Wizard." })).toEqual([]);
  });
});

describe("⭐ it changes nothing the engine plays", () => {
  it("the same offer with and without Field of Dreams on the battlefield", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const base = { ...g, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [] };
    const withHand = (bf) => ({ ...base, players: { ...base.players, user: { ...base.players.user, hand: [SHOCK], battlefield: bf, manaPool: { ...base.players.user.manaPool, R: 1 } } } });
    const field = createPermanent({ id: "fod", card: { ...FIELD_OF_DREAMS, id: "c-fod" }, controller: "user", summoningSick: false });
    const shape = (s) => legalActionsForPlayer(s, "user").map((a) => `${a.kind}:${a.cardId ?? ""}:${(a.targets || []).map((t) => t.id).join("|")}`).sort();
    const row = { without: shape(withHand([])), with: shape(withHand([field])) };
    console.log(`WITNESS sharedTopCardRevealed ${JSON.stringify({ actions: row.with.length })}`);
    expect(row.with).toEqual(row.without);
  });
});
