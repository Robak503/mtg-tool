/**
 * kotoriPilotProdigy.test.js — SHELF-85 runbook Phase 2 · S17 (2026-09-04): Kotori, Pilot Prodigy (Shorikai).
 *
 *   "Vehicles you control have crew 2.
 *    At the beginning of combat on your turn, target artifact creature you control gains lifelink and vigilance until end of turn."
 *
 * The static is a layer-6 ABILITY grant (CR 702.122 — a second crew ability with number 2), read at both crew sites through
 * layers.crewCostWithOverrides as min(printed, granted). The trigger's grant arm shipped with Plaza of Heroes. Kotori was the
 * card the Aeronaut Admiral exclusion ("Vehicles you control have flying" — a CREATURE-restricted keyword grant that
 * reaches no uncrewed Vehicle) had parked by kinship; crew is an ability of the artifact itself, so the exclusion does not
 * apply and the descriptor's selector is Artifact + Vehicle, your control.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { crewCostWithOverrides, permanentIsCreature } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KOTORI = { id: "c-kotori", name: "Kotori, Pilot Prodigy", type: "Legendary Creature — Moonfolk Pilot", keywords: [], power: 2, toughness: 3,
  oracle: "Vehicles you control have crew 2.\nAt the beginning of combat on your turn, target artifact creature you control gains lifelink and vigilance until end of turn." };
const COPTER = { id: "c-copter", name: "Smuggler's Copter", type: "Artifact — Vehicle", keywords: ["Flying"], power: 3, toughness: 3, oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1" };
const TANK = { id: "c-tank", name: "Peacewalker Colossus", type: "Artifact — Vehicle", keywords: [], power: 6, toughness: 6, oracle: "Crew 4" };
const BEAR = { id: "c-bear", name: "Bear", type: "Creature — Bear", keywords: [], power: 2, toughness: 2, oracle: "" };

const board = (withKotori, vehicle = TANK, bearCtrl = "user") => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [createPermanent({ id: "V", card: vehicle, controller: "user" }), createPermanent({ id: "B", card: BEAR, controller: bearCtrl })];
  if (withKotori) bf.push(createPermanent({ id: "K", card: KOTORI, controller: "user" }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
};
const crews = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "crew-vehicle" && a.permanentId === "V");

describe("parse", () => {
  it("the static is a layer-6 crew-number grant over the controller's Vehicles (Artifact + Vehicle, not creature-gated)", () => {
    const d = parseStaticAbilities(KOTORI);
    expect(d).toEqual([{ layer: 6, op: { layerOp: "crewOverride", crew: 2 }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Artifact"], subtypes: ["Vehicle"] } }, duration: { kind: "permanent" } }]);
  });
});

describe("runtime — the crew number", () => {
  it("a Crew 4 Vehicle crews for 2 with Kotori out, and for its printed 4 without her", () => {
    expect(crewCostWithOverrides(board(true), "V", 4)).toBe(2);
    expect(crewCostWithOverrides(board(false), "V", 4)).toBe(4);
    expect(crewCostWithOverrides(board(true), "V", null)).toBe(null); // no printed crew → no grant conjures one
  });
  it("the grant never RAISES a cheaper printed crew (Crew 1 stays 1)", () => {
    expect(crewCostWithOverrides(board(true, COPTER), "V", 1)).toBe(1);
  });
  it("a 2-power Bear is offered as crew only with Kotori, and dispatch animates the Vehicle", () => {
    expect(crews(board(false))).toEqual([]);
    const s = board(true);
    const acts = crews(s);
    expect(acts).toHaveLength(1);
    expect(acts[0].crew).toBe(2);
    expect(acts[0].tapIds).toEqual(["B"]);
    const after = dispatchAction(s, acts[0]);
    expect(permanentIsCreature(after, "V")).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "B").tapped).toBe(true);
  });
  it("dispatch re-reads the grant: the same tap set is refused when Kotori is not there", () => {
    const s = board(false);
    expect(() => dispatchAction(s, { kind: "crew-vehicle", playerId: "user", permanentId: "V", tapIds: ["B"] })).toThrow(/Crew total power 2 < 4/);
  });
});

describe("classifier", () => {
  it("Kotori is native-mixed; the Aeronaut Admiral keyword grant rides the same Vehicle selector (shelf D32)", () => {
    expect(classifyCard(KOTORI)).toBe("native-mixed");
    expect(classifyCard({ id: "c-aa", name: "Aeronaut Admiral", type: "Creature — Human Pilot", keywords: ["Flying"], power: 3, toughness: 1, oracle: "Flying\nVehicles you control have flying." })).toBe("native-static");
  });
});
