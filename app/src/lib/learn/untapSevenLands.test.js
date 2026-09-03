/**
 * untapSevenLands.test.js — CORPUS ④-U (2026-09-03 night): "When this creature enters, untap up to seven lands." —
 * Palinchron and Great Whale. The untap-up-to-N-lands atom (Finale of Revelation, Peregrine Drake) knew one..five and
 * both cards say seven — the Savage Firecat vocabulary gap again. six..ten join the alternation off the shared number
 * map; the applier is the same deterministic greedy untap of the controller's own tapped lands.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PALINCHRON = { id: "h-pal", name: "Palinchron", type: "Creature — Illusion", mana: "{5}{U}{U}", mana_cost: "{5}{U}{U}", cmc: 7, power: 4, toughness: 5, keywords: ["Flying"],
  oracle: "Flying\nWhen this creature enters, untap up to seven lands.\n{2}{U}{U}: Return this creature to its owner's hand." };
const GREAT_WHALE = { id: "h-gw", name: "Great Whale", type: "Creature — Whale", mana: "{5}{U}{U}", mana_cost: "{5}{U}{U}", cmc: 7, power: 5, toughness: 5, keywords: [],
  oracle: "When this creature enters, untap up to seven lands." };
const island = (id, tapped) => ({ ...createPermanent({ id, card: { id: "c-" + id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user", summoningSick: false }), tapped });

describe("the parse + the tiers", () => {
  it("⭐ 'untap up to seven lands' parses to the untap-lands atom with N=7; one..five unchanged", () => {
    expect(parseEffectClause("untap up to seven lands", "Creature").atoms).toEqual([{ op: "untap-lands", uptoN: 7, targetType: null }]);
    expect(parseEffectClause("untap up to five lands", "Creature").atoms).toEqual([{ op: "untap-lands", uptoN: 5, targetType: null }]);
  });
  it("⭐ Palinchron and Great Whale are native", () => {
    expect(classifyCard(PALINCHRON)).toMatch(/^native/);
    expect(classifyCard(GREAT_WHALE)).toMatch(/^native/);
  });
});

describe("runtime — cast with seven tapped Islands, the ETB untaps all seven", () => {
  it("⭐ Great Whale from hand: seven tapped Islands are untapped by the trigger; an eighth stays tapped", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const lands = Array.from({ length: 8 }, (_, i) => island(`l${i + 1}`, true));
    const s = { ...s0, turn: 8, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [GREAT_WHALE], battlefield: lands, manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 5 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-gw");
    expect(act).toBeTruthy();
    const entered = flushTriggers(resolveTopOfStack(dispatchAction(s, act)));
    expect(entered.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const out = resolveTopOfStack(entered);
    const untapped = out.players.user.battlefield.filter((p) => p.card?.name === "Island" && !p.tapped).length;
    expect(untapped).toBe(7);
  });
});
