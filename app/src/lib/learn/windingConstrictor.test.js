/**
 * windingConstrictor.test.js — Winding Constrictor (SHELF S7): two additive replacements.
 *
 *   1. "If one or more counters would be put on an ARTIFACT OR CREATURE you control, that many plus one …"
 *      — the existing additive counter profile gains a RECIPIENT-TYPE gate (recipientTypes): before this,
 *      the profile applied to EVERY permanent you control — a live over-apply on lands/planeswalkers.
 *   2. "If you would get one or more counters, you get that many plus one of each of those kinds …" — the
 *      NEW player-counter additive (energy/experience/poison/rad), applied at the four gameState adder
 *      chokepoints, owner-scoped only.
 * CREED FP = a bonus on the wrong recipient type, on an opponent's get, or on a zero-base "event".
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, addCounter, addRadCounters, addEnergy, addPoison } from "./gameState.js";
import { doublerProfile, applyCounterDoubling, playerCounterAdditive } from "./replacementEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const CONSTRICTOR_ORACLE =
  "If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.\nIf you would get one or more counters, you get that many plus one of each of those kinds of counters instead.";
const constrictorCard = (id = "wc-card") => ({
  id, name: "Winding Constrictor", type: "Creature — Snake", power: "2", toughness: "3", mana: "{B}{G}", oracle: CONSTRICTOR_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const perm = (id, controller, type) =>
  createPermanent({ id, card: { name: id, type, power: "2", toughness: "2", oracle: "" }, controller });

describe("profile + classify", () => {
  it("both clauses parse: a typed additive counter profile + the player-counter additive", () => {
    const p = doublerProfile(constrictorCard());
    expect(p.counter).toMatchObject({ op: "additive", factor: 1, kind: "any", scope: "you", recipientTypes: ["Artifact", "Creature"] });
    expect(p.playerCounterAdd).toEqual({ additive: 1 });
  });
  it("Winding Constrictor → native-static", () => {
    expect(classifyCard(constrictorCard())).toBe("native-static");
  });
});

describe("clause 1 — the RECIPIENT-TYPE gate (CREED core)", () => {
  function board() {
    let s = baseState();
    s = withBattlefield(s, "user", [
      createPermanent({ id: "wc", card: constrictorCard(), controller: "user" }),
      perm("cr", "user", "Creature — Bear"),
      perm("ar", "user", "Artifact — Equipment"),
      perm("ld", "user", "Land — Forest"),
    ]);
    s = withBattlefield(s, "ai1", [perm("oc", "ai1", "Creature — Bear")]);
    return s;
  }
  it("+1 on a creature and on an artifact you control; NOT on a land; NOT on an opponent's creature", () => {
    const s = board();
    expect(applyCounterDoubling(s, "user", "+1/+1", 1, "cr")).toBe(2);
    expect(applyCounterDoubling(s, "user", "charge", 2, "ar")).toBe(3);
    expect(applyCounterDoubling(s, "user", "charge", 1, "ld")).toBe(1); // a LAND is not in the union
    expect(applyCounterDoubling(s, "ai1", "+1/+1", 1, "oc")).toBe(1);   // an opponent's get is untouched
  });
  it("an UNKNOWN recipient (no perm id) never gets the typed bonus (FN-safe)", () => {
    expect(applyCounterDoubling(board(), "user", "+1/+1", 1, null)).toBe(1);
  });
  it("runtime: addCounter on the creature lands base+1", () => {
    const s = addCounter(board(), { permanentId: "cr", type: "+1/+1", amount: 1 });
    expect(s.players.user.battlefield.find((p) => p.id === "cr").counters["+1/+1"]).toBe(2);
  });
});

describe("clause 2 — the player-counter additive (CREED core)", () => {
  function board() {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "wc", card: constrictorCard(), controller: "user" })]);
    return s;
  }
  it("the OWNER's rad/energy/poison gets are +1 each; an opponent's get is untouched; a 0 get stays 0", () => {
    const s = board();
    expect(playerCounterAdditive(s, "user")).toBe(1);
    expect(playerCounterAdditive(s, "ai1")).toBe(0);
    expect(addRadCounters(s, { playerId: "user", amount: 2 }).players.user.radCounters).toBe(3);
    expect(addEnergy(s, { playerId: "user", amount: 1 }).players.user.energy).toBe(2);
    expect(addPoison(s, { playerId: "ai1", amount: 1 }).players.ai1.poison).toBe(1); // not the owner
    expect(addRadCounters(s, { playerId: "user", amount: 0 }).players.user.radCounters || 0).toBe(0); // no event → no bonus (CR 614)
  });
});
