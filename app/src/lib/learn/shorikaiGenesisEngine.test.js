/**
 * shorikaiGenesisEngine.test.js — SHELF-85 runbook Phase 2 · S8 (2026-09-04): Shorikai, Genesis Engine (the commander).
 *
 *   "{1}, {T}: Draw two cards, then discard a card. Create a 1/1 colorless Pilot creature token with 'This token crews
 *    Vehicles as though its power were 2 greater.'
 *    Crew 8"
 *
 * The draw-discard half already parsed (the activated lane parses under an instant type); the Pilot token's QUOTED
 * STATIC parked the whole ability. A third quoted-ability gate (parseTokenStaticAbility) canonicalizes "crews Vehicles
 * as though its power were N greater" onto the minted token's oracle, and a leaf reader (abilities.crewPowerBonus) adds
 * the boost at BOTH crew sites — the offer (legalChoices) and the dispatch — so a 1/1 Pilot crews a Crew 3 Vehicle alone
 * (CR 702.122c). Prodigy's Prototype mints the same Pilot but still parks on its "one or more Vehicles attack" batch.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseTokenStaticAbility } from "./effects/parseHelpers.js";
import { crewPowerBonus } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveDiscardChoice } from "./effects/runProgram.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHORIKAI = { id: "c-sge", name: "Shorikai, Genesis Engine", type: "Legendary Artifact — Vehicle", mana: "{2}{W}{U}", cmc: 4, power: 8, toughness: 8, keywords: ["Crew 8"],
  oracle: "{1}, {T}: Draw two cards, then discard a card. Create a 1/1 colorless Pilot creature token with \"This token crews Vehicles as though its power were 2 greater.\"\nCrew 8 (Tap any number of creatures you control with total power 8 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const COPTER = { id: "card-copter", name: "Skysovereign Sled", type: "Artifact — Vehicle", mana: "{3}", cmc: 3, power: 4, toughness: 4, keywords: ["Crew 3"], oracle: "Crew 3" };
const plains = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user" });
const card = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", cmc: 1, oracle: "Draw a card." });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "SGE", card: SHORIKAI, controller: "user" }), createPermanent({ id: "SLED", card: COPTER, controller: "user" }), plains("P1")], hand: [card("h1")], library: [card("l1"), card("l2"), card("l3")], graveyard: [] } } };
}

describe("parse", () => {
  it("the ability: draw two, discard one, then the Pilot with its canonical crew-boost oracle", () => {
    const r = parseEffectClause("Draw two cards, then discard a card. Create a 1/1 colorless Pilot creature token with \"This token crews Vehicles as though its power were 2 greater.\"", "Instant");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([
      { op: "draw", amount: 2, targetType: null },
      { op: "discard", amount: 1, who: "controller", targetType: null },
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless pilot", targetType: null, tokenOracle: "This creature crews Vehicles as though its power were 2 greater." },
    ]);
  });
  it("the static gate takes only the crew-boost line; the reader prices it", () => {
    expect(parseTokenStaticAbility("\"This token crews Vehicles as though its power were 2 greater.\"")).toBe("This creature crews Vehicles as though its power were 2 greater.");
    expect(parseTokenStaticAbility("\"This token can't block.\"")).toBeNull();
    expect(crewPowerBonus({ oracle: "This creature crews Vehicles as though its power were 2 greater." })).toBe(2);
    expect(crewPowerBonus({ oracle: "Flying" })).toBe(0);
  });
});

describe("runtime — the loot, the Pilot, and the boosted crew", () => {
  it("activates for {1},{T}: draws two, pauses on the discard, mints the Pilot; the Pilot alone crews the Crew 3 Sled", () => {
    let s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "SGE");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.players.user.battlefield.find((p) => p.id === "SGE").tapped).toBe(true);
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(3); // drew two
    expect(s.pendingChoice?.kind).toMatch(/discard/);
    s = resolveDiscardChoice(s, "h1"); // one card id per settle (remaining 1)
    s = resolveAll(s);
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["l1", "l2"]);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["h1"]);
    const pilot = s.players.user.battlefield.find((p) => /pilot/i.test(p.card?.name || ""));
    expect(pilot).toBeTruthy();
    expect(pilot.card.oracle).toBe("This creature crews Vehicles as though its power were 2 greater.");
    // The 1/1 Pilot reads as 3 for crewing: the Crew 3 Sled is offered with the Pilot alone, and the dispatch agrees.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === pilot.id ? { ...p, summoningSick: false } : p)) } } };
    const crew = legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "SLED");
    expect(crew).toBeTruthy();
    expect(crew.tapIds).toEqual([pilot.id]);
    s = dispatchAction(s, crew);
    expect(permanentIsCreature(s, "SLED")).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === pilot.id).tapped).toBe(true);
  });
});

describe("classifier", () => {
  it("Shorikai, Genesis Engine is native-activated", () => {
    expect(classifyCard(SHORIKAI)).toBe("native-activated");
  });
});
