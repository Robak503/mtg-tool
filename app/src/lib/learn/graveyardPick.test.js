/**
 * graveyardPick.test.js — CORPUS ④-P (2026-09-03 night): "TARGET PLAYER EXILES A CARD FROM THEIR GRAVEYARD" — Relic of
 * Progenitus / Scrabbling Claws / Merrow Bonegnawer. The chooser is the TARGET player, not the controller: the atom
 * resolves through the milled-pick pause aimed at that player with toZone "exile" (the same picker, driver and panel
 * the milled-pick uses, re-labelled), candidates ordered least-valuable-first so the AI's deterministic first pick is
 * the sensible give-up. 0 cards → a no-op; 1 → forced. Graveyard Shovel's life rider stays parked.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveMilledPickChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RELIC = { id: "c-relic", name: "Relic of Progenitus", type: "Artifact", mana: "{1}", cmc: 1, keywords: [],
  oracle: "{T}: Target player exiles a card from their graveyard.\n{1}, Exile this artifact: Exile all graveyards. Draw a card." };
const CLAWS = { id: "c-claws", name: "Scrabbling Claws", type: "Artifact", mana: "{1}", cmc: 1, keywords: [],
  oracle: "{T}: Target player exiles a card from their graveyard.\n{1}, Sacrifice this artifact: Exile target card from a graveyard. Draw a card." };
const BONEGNAWER = { id: "c-bone", name: "Merrow Bonegnawer", type: "Creature — Merfolk Rogue", mana: "{B}", cmc: 1, power: 1, toughness: 1, keywords: [],
  oracle: "{T}: Target player exiles a card from their graveyard.\nWhenever you cast a black spell, you may untap this creature." };
const SHOVEL = { id: "c-shovel", name: "Graveyard Shovel", type: "Artifact", mana: "{2}", cmc: 2, keywords: [],
  oracle: "{2}, {T}: Target player exiles a card from their graveyard. If it's a creature card, you gain 2 life." };
const gyCard = (id, name, type, cmc) => ({ id, name, type, cmc, keywords: [], oracle: "" });

function board({ aiGraveyard = [], userGraveyard = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, graveyard: userGraveyard, exile: [], battlefield: [createPermanent({ id: "relic", card: RELIC, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, graveyard: aiGraveyard, exile: [], battlefield: [] } } };
}
const tapActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "relic" && /exiles a card from their graveyard/i.test(a.abilityText || ""));

describe("the parse + the tiers", () => {
  it("⭐ the arm parses on the target player with a chosen player target; the rider form falls through", () => {
    expect(parseEffectClause("target player exiles a card from their graveyard", "Artifact").atoms).toEqual([{ op: "exile-graveyard-pick", who: "target", targetType: "player" }]);
    expect(parseEffectClause("target player exiles a card from their graveyard. if it's a creature card, you gain 2 life", "Artifact").confidence).not.toBe("high");
    expect(atomTargetIntent({ op: "exile-graveyard-pick", who: "target", targetType: "player" })).toBe("enemy");
  });
  it("⭐ Relic of Progenitus, Scrabbling Claws and Merrow Bonegnawer are native; Graveyard Shovel stays parked", () => {
    expect(classifyCard(RELIC)).toBe("native-activated");
    expect(classifyCard(CLAWS)).toBe("native-activated");
    expect(classifyCard(BONEGNAWER)).toMatch(/^native/);
    expect(classifyCard(SHOVEL)).not.toMatch(/^native/);
  });
});

describe("runtime — the TARGET player picks", () => {
  it("⭐ aimed at the AI with three graveyard cards: the pause belongs to the AI, aimed at exile, least-valuable first; settling exiles the pick", () => {
    const s = board({ aiGraveyard: [gyCard("g1", "Big Wurm", "Creature — Wurm", 6), gyCard("g2", "Forest", "Basic Land — Forest", 0), gyCard("g3", "Shock", "Instant", 1)] });
    const act = tapActs(s).find((a) => a.targets?.[0]?.id === "ai");
    expect(act).toBeTruthy();
    const paused = resolveTopOfStack(dispatchAction(s, act));
    expect(paused.pendingChoice).toMatchObject({ kind: "milled-pick", controller: "ai", toZone: "exile" });
    expect(paused.pendingChoice.candidates.map((c) => c.name)).toEqual(["Forest", "Shock", "Big Wurm"]);
    const out = resolveMilledPickChoice(paused, paused.pendingChoice.candidates[0].id);
    expect(out.pendingChoice).toBeUndefined();
    expect(out.players.ai.exile.map((c) => c.name)).toEqual(["Forest"]);
    expect(out.players.ai.graveyard.map((c) => c.name).sort()).toEqual(["Big Wurm", "Shock"]);
    expect(out.players.ai.hand.length).toBe(0);
  });
  it("aimed at ourselves with ONE graveyard card: forced — exiled with no pause", () => {
    const s = board({ userGraveyard: [gyCard("u1", "Lone Card", "Sorcery", 2)] });
    const act = tapActs(s).find((a) => a.targets?.[0]?.id === "user");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.pendingChoice).toBeUndefined();
    expect(out.players.user.exile.map((c) => c.name)).toEqual(["Lone Card"]);
  });
  it("aimed at an EMPTY graveyard: a logged no-op, nothing moves", () => {
    const s = board();
    const act = tapActs(s).find((a) => a.targets?.[0]?.id === "ai");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.pendingChoice).toBeUndefined();
    expect(out.players.ai.exile.length).toBe(0);
  });
});
