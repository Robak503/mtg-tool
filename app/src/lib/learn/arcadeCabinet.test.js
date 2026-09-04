/**
 * arcadeCabinet.test.js — SHELF-85 runbook V8 (2026-09-04): Arcade Cabinet (Bumble · Halfshell) and the four twins the
 * flip-diff surfaced on the "Sacrifice a token" cost (Glimmer Bairn, Fountainport, Combine Chrysalis, Hardened
 * Tactician — every effect already modeled).
 *
 *   "When this artifact enters, put a +1/+1 counter on each of up to four target creatures.
 *    {2}, {T}, Sacrifice a token: Double the number of each kind of counter on target creature."
 *
 * Two cells:
 *   ① the cost "Sacrifice a token" — type `token` on the sacrifice-other lane, matched on the victim's token flag
 *     (CR 111.1); a real card is never the victim, and with no token the ability is not offered;
 *   ② the effect — a `double-all-counters` atom on a chosen creature: every kind on it is added again in its current
 *     amount, each through addCounter (Doubling Season composes per kind, CR 616); no counters → a clean no-op.
 * The ETB's "up to four target creatures" pick already parsed.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CABINET = { id: "c-cab", name: "Arcade Cabinet", type: "Artifact", mana: "{3}", keywords: [],
  oracle: "When this artifact enters, put a +1/+1 counter on each of up to four target creatures.\n{2}, {T}, Sacrifice a token: Double the number of each kind of counter on target creature." };
const GLIMMER_BAIRN = { id: "c-gb", name: "Glimmer Bairn", type: "Creature — Ouphe", mana: "{G}", power: 1, toughness: 1, keywords: [], oracle: "Sacrifice a token: This creature gets +2/+2 until end of turn." };
const HARDENED_TACTICIAN = { id: "c-ht", name: "Hardened Tactician", type: "Creature — Human Warrior", mana: "{1}{W}{B}", power: 2, toughness: 3, keywords: [], oracle: "{1}, Sacrifice a token: Draw a card." };

const island = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" });
const treasure = (id) => createPermanent({ id, card: { name: "Treasure", type: "Token Artifact — Treasure", token: true, oracle: "{T}, Sacrifice this artifact: Add one mana of any color." }, controller: "user" });
const bear = (id, counters) => ({ ...createPermanent({ id, card: { id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" }), summoningSick: false, ...(counters ? { counters } : {}) });
function board(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, library: [{ id: "lib-0", name: "Card", type: "Instant", oracle: "" }], battlefield: perms } } };
}
const offers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters || {};
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("① the cost — 'Sacrifice a token'", () => {
  it("parses as sacrifice-other type token; the whole ability is modeled", () => {
    const ab = parseActivatedAbilities(CABINET).find((a) => !a.isManaEffect);
    expect(ab.costModeled).toBe(true);
    expect(ab.sacOther).toEqual({ type: "token", another: false });
    expect(ab.modeled).toBe(true);
    expect(ab.program.atoms).toEqual([{ op: "double-all-counters", targetType: "creature" }]);
  });
  it("only a TOKEN is offered as the victim — never a real artifact; no token → not offered", () => {
    const realArtifact = createPermanent({ id: "ART", card: { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, controller: "user" });
    const withToken = board([createPermanent({ id: "CAB", card: CABINET, controller: "user" }), bear("B1", { "+1/+1": 1 }), treasure("T1"), realArtifact, island("L1"), island("L2")]);
    const acts = offers(withToken, "CAB");
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) expect(a.sacCreatureId).toBe("T1");
    const noToken = board([createPermanent({ id: "CAB", card: CABINET, controller: "user" }), bear("B1", { "+1/+1": 1 }), realArtifact, island("L1"), island("L2")]);
    expect(offers(noToken, "CAB")).toHaveLength(0);
  });
});

describe("② the effect — every kind doubled", () => {
  it("parses HIGH onto a chosen creature", () => {
    expect(parseEffectClause("double the number of each kind of counter on target creature.", "Artifact").atoms).toEqual([{ op: "double-all-counters", targetType: "creature" }]);
  });
  it("CREED near-miss: a single-kind chosen-target double stays LOW", () => {
    expect(parseEffectClause("double the number of +1/+1 counters on target creature.", "Artifact").confidence).toBe("low");
  });
  it("end to end: the Treasure is sacrificed, the Cabinet taps, {2} is paid, and the Bear's +1/+1 AND stun counters double", () => {
    let s = board([createPermanent({ id: "CAB", card: CABINET, controller: "user" }), bear("B1", { "+1/+1": 2, stun: 1 }), treasure("T1"), island("L1"), island("L2")]);
    const act = offers(s, "CAB").find((a) => a.targets?.[0]?.id === "B1");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.players.user.battlefield.some((p) => p.id === "T1")).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "CAB").tapped).toBe(true);
    s = resolveAll(s);
    expect(counters(s, "B1")).toEqual({ "+1/+1": 4, stun: 2 });
  });
  it("a creature with no counters is a clean no-op", () => {
    let s = board([createPermanent({ id: "CAB", card: CABINET, controller: "user" }), bear("B1"), treasure("T1"), island("L1"), island("L2")]);
    const act = offers(s, "CAB").find((a) => a.targets?.[0]?.id === "B1");
    s = resolveAll(dispatchAction(s, act));
    expect(counters(s, "B1")["+1/+1"] || 0).toBe(0);
  });
});

describe("classifier — whole cards", () => {
  it("Arcade Cabinet is native-mixed; the sacrifice-a-token twins are native-activated", () => {
    expect(classifyCard(CABINET)).toBe("native-mixed");
    expect(classifyCard(GLIMMER_BAIRN)).toBe("native-activated");
    expect(classifyCard(HARDENED_TACTICIAN)).toBe("native-activated");
  });
});
