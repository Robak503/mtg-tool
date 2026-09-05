/**
 * cityOfTraitors.test.js — POD-SIM THREE · Killer Turts KT-5 (2026-09-05): City of Traitors.
 *
 * "When you play another land, sacrifice this land." — a landfall-family watcher with two gates the landfall family lacked:
 *  · PLAYED only (CR 305.1 — "play a land" is the special action; a land an EFFECT puts onto the battlefield is not played).
 *    The play-land dispatcher threads `played: true` into checkLandfallTriggers; the effect path (enterCardFromZone) does
 *    not, so a `playedOnly` descriptor fails CLOSED there — never a sacrifice on a fetched or ramped land.
 *  · ANOTHER — the watcher never fires on its own entry (landfallExcludeSelf).
 * Both fields are LISTED in the descriptor assembly (the silent-drop trap).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { detectTriggers, checkLandfallTriggers } from "./triggers.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CITY = { id: "c-city", name: "City of Traitors", type: "Land", mana: "", keywords: [], oracle: "When you play another land, sacrifice this land.\n{T}: Add {C}{C}." };
const MOUNTAIN = (id) => ({ id, name: "Mountain", type: "Basic Land — Mountain", mana: "", oracle: "({T}: Add {R}.)" });

function mainState({ userHand = [], userBf = [], userLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, battlefield: userBf, library: userLib, landsPlayedThisTurn: 0 } },
  };
}
const settle = (s) => { let g = 0; while (s.stack.length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s); return s; };
const playLand = (s, cardId) => {
  const act = filterActions(legalActionsForPlayer(s, "user"), "play-land").find((a) => a.cardId === cardId);
  if (!act) throw new Error(`no play-land offered for ${cardId}`);
  return settle(flushTriggers(dispatchAction(s, act), { chooseTargets: chooseTriggerTargets }));
};
const onField = (s, name) => s.players.user.battlefield.some((p) => p.card?.name === name);
const inGy = (s, name) => s.players.user.graveyard.some((c) => c.name === name);

describe("classifier + descriptor", () => {
  it("City reads as a PLAYED-only, another-only landfall watcher; the card classifies land (fully covered)", () => {
    const [d] = detectTriggers(CITY);
    expect(d).toMatchObject({ event: "landfall", scope: "landYouControl", playedOnly: true, landfallExcludeSelf: true, effectClause: "sacrifice this land" });
    expect(classifyCard(CITY)).toBe("land");
  });
});

describe("runtime", () => {
  it("playing a Mountain with City on the battlefield sacrifices City; the Mountain stays", () => {
    let s = mainState({ userHand: [MOUNTAIN("m1")], userBf: [createPermanent({ id: "CT", card: CITY, controller: "user" })] });
    s = playLand(s, "m1");
    expect(onField(s, "Mountain")).toBe(true);
    expect(onField(s, "City of Traitors")).toBe(false);
    expect(inGy(s, "City of Traitors")).toBe(true);
  });

  it("a land an EFFECT puts onto the battlefield is not played: City stays (fails closed without the played marker)", () => {
    let s = mainState({ userBf: [createPermanent({ id: "CT", card: CITY, controller: "user" })], userLib: [MOUNTAIN("m2")] });
    const r = enterCardFromZone(s, { playerId: "user", cardId: "m2", fromZone: "library" });
    expect(r.entered).toBe(true);
    s = settle(flushTriggers(r.state, { chooseTargets: chooseTriggerTargets }));
    expect(onField(s, "Mountain")).toBe(true);
    expect(onField(s, "City of Traitors")).toBe(true);
    // the direct check without the marker fires nothing either
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Mountain");
    expect(checkLandfallTriggers(s, perm).stack).toHaveLength(0);
  });

  it("playing City itself never fires it (another land only)", () => {
    let s = mainState({ userHand: [CITY] });
    s = playLand(s, "c-city");
    expect(onField(s, "City of Traitors")).toBe(true);
    expect(inGy(s, "City of Traitors")).toBe(false);
  });
});
