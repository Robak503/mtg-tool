/**
 * crewVehicles.test.js — BLITZ VH-1 (CR 702.121): CREW N. legalChoices.actionsCrewVehicle offers crewing
 * (own turn + priority + main step — the engine's universal activation window) with a deterministic
 * auto-picked tap set (summoning-sick first, power desc — they can't attack anyway; then ready creatures
 * power asc); actionDispatcher.applyCrewVehicle re-verifies live (CREED), taps the set, and adds a layer-4
 * endOfTurn Creature type-add — printed P/T and printed keyword lines then apply through the normal layer /
 * keyword reads. CR 302.6: a Vehicle that ENTERED this turn is stamped summoning-sick at crew time (it
 * can't attack even crewed); an older Vehicle crews into a ready attacker. The coverage side strips the
 * modeled Crew line (the plot/warp/enters-tapped precedent) so a Vehicle whose OTHER text is modeled
 * classifies native. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { permanentIsCreature } from "./layers.js";
import { parseCrewCost } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SLEEK_SCHOONER = { id: "ss", name: "Sleek Schooner", type: "Artifact — Vehicle", power: "4", toughness: "3", mana: "{2}",
  oracle: "Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const THUNDERING_CHARIOT = { id: "tc", name: "Thundering Chariot", type: "Artifact — Vehicle", power: "5", toughness: "4", mana: "{3}{R}",
  oracle: "First strike, trample, haste\nCrew 3" };
const SMUGGLERS_COPTER = { id: "sc", name: "Smuggler's Copter", type: "Artifact — Vehicle", power: "3", toughness: "3", mana: "{2}",
  oracle: "Flying\nWhenever this creature attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1" };

describe("parse + classify", () => {
  it("parseCrewCost reads the printed line; keyword-only Vehicles flip native-body", () => {
    expect(parseCrewCost(SLEEK_SCHOONER)).toBe(1);
    expect(parseCrewCost(THUNDERING_CHARIOT)).toBe(3);
    expect(parseCrewCost({ oracle: "Flying" })).toBe(null);
    expect(classifyCard(SLEEK_SCHOONER)).toBe("native-body");
    expect(classifyCard(THUNDERING_CHARIOT)).toBe("native-body");
  });
  it("CREED — a Vehicle with an unmodeled trigger stays body-only (only the Crew line is stripped)", () => {
    // (Smuggler's Copter sat here for about an hour until OR-1 split "attacks or blocks" — its loot
    // trigger now routes and it's native-trigger. The guard uses a genuinely-unmodeled delayed rider.)
    expect(classifyCard(SMUGGLERS_COPTER)).toBe("native-trigger");
    expect(classifyCard({ id: "ww", name: "Wicker Warcrawler", type: "Artifact — Vehicle", power: "6", toughness: "6", mana: "{5}",
      oracle: "Whenever this Vehicle attacks or blocks, put a -1/-1 counter on it at end of combat.\nCrew 2" })).toBe("body-only"); // the at-end-of-combat delayed rider is unmodeled
  });
});

describe("runtime — the crew loop", () => {
  function board({ vehicleEnteredTurn = 1, turn = 4 } = {}) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const veh = createPermanent({ id: "veh", card: SLEEK_SCHOONER, controller: "user", summoningSick: false });
    veh.enteredOnTurn = vehicleEnteredTurn;
    const sick = createPermanent({ id: "sick", card: { id: "sb", name: "Sick Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: true });
    const ready = createPermanent({ id: "rdy", card: { id: "rb", name: "Ready Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    return { ...s, turn, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [veh, sick, ready] } } };
  }
  const crewOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "crew-vehicle");

  it("offers with a sick-first tap set; dispatch taps, animates until EOT, and the vehicle can attack", () => {
    const s = board();
    const offers = crewOffers(s);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ permanentId: "veh", crew: 1, tapIds: ["sick"], allSick: true });
    let after = dispatchAction(s, offers[0]);
    expect(permanentIsCreature(after, "veh")).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "sick").tapped).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "rdy").tapped).toBe(false);
    expect(after.players.user.battlefield.find((p) => p.id === "veh").summoningSick).toBe(false);
    // A crewed Vehicle is offered as an attacker (layer-aware declare gate).
    after = { ...after, step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect(legalActionsForPlayer(after, "user").some((a) => a.kind === "declare-attacker" && a.permanentId === "veh")).toBe(true);
    // An UNcrewed Vehicle is not a creature and never offered.
    expect(permanentIsCreature(s, "veh")).toBe(false);
  });

  it("CR 302.6 — a Vehicle that entered THIS turn crews summoning-sick and cannot attack", () => {
    const s = board({ vehicleEnteredTurn: 4, turn: 4 });
    let after = dispatchAction(s, crewOffers(s)[0]);
    expect(after.players.user.battlefield.find((p) => p.id === "veh").summoningSick).toBe(true);
    after = { ...after, step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect(legalActionsForPlayer(after, "user").some((a) => a.kind === "declare-attacker" && a.permanentId === "veh")).toBe(false);
  });

  it("insufficient total power → no offer; a stale/tapped tap set is rejected at dispatch (CREED re-verify)", () => {
    let s = board();
    // Only a 2-power creature vs Crew 3 (swap the vehicle for the Chariot): no offer.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      Object.assign(createPermanent({ id: "veh", card: THUNDERING_CHARIOT, controller: "user", summoningSick: false }), { enteredOnTurn: 1 }),
      createPermanent({ id: "sick", card: { id: "sb", name: "Sick Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: true }),
    ] } } };
    expect(crewOffers(s)).toHaveLength(0);
    // A forged action whose tap set is already tapped throws (never a silent under-paid crew).
    const s2 = board();
    const offer = crewOffers(s2)[0];
    const tappedFirst = { ...s2, players: { ...s2.players, user: { ...s2.players.user, battlefield: s2.players.user.battlefield.map((p) => p.id === "sick" ? { ...p, tapped: true } : p) } } };
    expect(() => dispatchAction(tappedFirst, offer)).toThrow(DispatcherError);
  });
});
