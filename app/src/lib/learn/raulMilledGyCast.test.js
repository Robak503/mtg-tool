/**
 * raulMilledGyCast.test.js — the MILLED-THIS-TURN graveyard cast permission (Raul, Trouble Shooter —
 * SHELF S6, CR 601.3e). "Once during each of your turns, you may cast a spell from among cards in your
 * graveyard that were milled this turn." Enforcement: actionsCastMilledFromGraveyard offers full-cost
 * casts (fromZone 'graveyard') gated on (a) YOUR turn, (b) the millCards ledger stamping the CURRENT turn,
 * (c) the per-source once-latch (set by the dispatcher on the cast, cleared at untap). CREED FP = offering
 * a card milled LAST turn / never milled, a land, an off-turn cast, or a second cast in one turn.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, millCards } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const RAUL_ORACLE =
  "Once during each of your turns, you may cast a spell from among cards in your graveyard that were milled this turn.\n{T}: Each player mills a card. (They each put the top card of their library into their graveyard.)";
const raulCard = (id = "rt-card") => ({
  id, name: "Raul, Trouble Shooter", type: "Legendary Creature — Zombie Mutant Rogue",
  power: "1", toughness: "4", mana: "{1}{U}{B}", oracle: RAUL_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 4, ...over };
}
const SPELL = (id) => ({ id, name: `Spell ${id}`, type: "Instant", mana: "{U}", cmc: 1, oracle: "Draw a card." });
const LAND = (id) => ({ id, name: `Land ${id}`, type: "Basic Land — Island", oracle: "" });

function withRaulBoard(extraState = {}) {
  let s = baseState(extraState);
  const raul = createPermanent({ id: "raul", card: raulCard(), controller: "user", summoningSick: false });
  const island = createPermanent({ id: "isl", card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" });
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [raul, island], library: [SPELL("m1"), LAND("m2"), SPELL("keep")] } } };
  return millCards(s, { playerId: "user", count: 2 }); // mills m1 (spell) + m2 (land) on turn 4
}
const gyCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "graveyard");

describe("classify", () => {
  it("Raul → native-mixed (the permission marker + the each-player mill activated)", () => {
    expect(classifyCard(raulCard())).toBe("native-mixed");
  });
});

describe("enforcement (CREED core)", () => {
  it("offers ONLY the nonland milled THIS turn from the graveyard, stamped with the source", () => {
    const s = withRaulBoard();
    const casts = gyCasts(s);
    expect(casts.length).toBeGreaterThan(0);
    expect(new Set(casts.map((a) => a.cardId))).toEqual(new Set(["m1"])); // the spell; never the land
    expect(casts[0].milledGyCastSourceId).toBe("raul");
  });

  it("NOT offered off-turn, on a stale-turn mill, or after the once-latch", () => {
    // off-turn
    expect(gyCasts({ ...withRaulBoard(), activePlayer: "ai1" })).toHaveLength(0);
    // stale turn (milled on 4, now turn 5)
    expect(gyCasts({ ...withRaulBoard(), turn: 5 })).toHaveLength(0);
    // latched
    const latched = withRaulBoard();
    expect(gyCasts({ ...latched, onceTriggersFiredThisTurn: { raul_milledGyCast: true } })).toHaveLength(0);
  });
});
