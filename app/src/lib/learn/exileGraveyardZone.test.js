/**
 * exileGraveyardZone.test.js — WHOLE-GRAVEYARD EXILE (CR 701.10a): the graveyard-hate staple.
 *
 * The engine modeled exiling a single CARD from a graveyard (exile-from-graveyard) but had no way to exile an
 * entire graveyard ZONE — so every card in the family parsed low and routed to the Arbiter: 0 native, 62 parked.
 * Farewell (EDHREC #163) was blocked by exactly this one mode; its other three ("exile all artifacts /
 * creatures / enchantments") already parsed once the mass-exile verb reached the typed noun list.
 *
 * "Exile target player's graveyard" TARGETS THE PLAYER (CR 115.4 — the player is the target; the cards in the
 * graveyard are not targeted, which is why a hexproof-from-nothing card in the yard is still exiled). That is
 * why the atom carries targetType player/opponent rather than graveyardCard.
 *
 * NOT CLAIMED, on purpose: the filtered wordings ("exile all CREATURE CARDS from all graveyards") stay low →
 * Arbiter. Exiling the whole zone for those would exile cards the card never touches — an over-apply, which is
 * the forbidden direction, not a safe miss (CREED). The last test pins that.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyExileGraveyard } from "./effects/atoms/zones.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const gyCard = (id, name) => ({ id, name, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 });

/** A board where user and ai1 each have two cards in the yard and ai2 has one. */
function boardWithYards() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, graveyard: [gyCard("u1", "UserA"), gyCard("u2", "UserB")] },
      ai1: { ...s0.players.ai1, graveyard: [gyCard("a1", "Ai1A"), gyCard("a2", "Ai1B")] },
      ai2: { ...s0.players.ai2, graveyard: [gyCard("b1", "Ai2A")] },
    },
  };
}

const yard = (s, pid) => (s.players[pid].graveyard || []).map((c) => c.name).sort();
const exiled = (s, pid) => (s.players[pid].exile || []).map((c) => c.name).sort();

describe("parse — the four printed wordings", () => {
  it("'exile target player's graveyard' targets the PLAYER (Bojuka Bog / Rakdos Charm)", () => {
    const p = parseEffectClause("exile target player's graveyard");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "exile-graveyard", who: "targetPlayer", targetType: "player" }]);
  });

  it("'exile all graveyards' is a non-targeted sweep (Farewell / Scavenger Grounds)", () => {
    expect(parseEffectClause("exile all graveyards").atoms)
      .toEqual([{ op: "exile-graveyard", who: "eachPlayer", targetType: null }]);
  });

  it("'exile each opponent's graveyard' spares the controller (Soul-Guide Lantern)", () => {
    expect(parseEffectClause("exile each opponent's graveyard").atoms)
      .toEqual([{ op: "exile-graveyard", who: "eachOpponent", targetType: null }]);
  });

  it("CREED — a FILTERED variant is not claimed (exiling the whole zone would over-apply)", () => {
    const p = parseEffectClause("exile all creature cards from all graveyards");
    expect(p?.atoms?.[0]?.op).not.toBe("exile-graveyard");
  });
});

describe("RUNTIME — the cards actually move graveyard -> exile", () => {
  it("targetPlayer empties ONLY the targeted player's yard", () => {
    const s = applyExileGraveyard(boardWithYards(), { op: "exile-graveyard", who: "targetPlayer" },
      { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(yard(s, "ai1")).toEqual([]);
    expect(exiled(s, "ai1")).toEqual(["Ai1A", "Ai1B"]);
    // THE LOAD-BEARING HALF — every other yard is untouched. A sweep here would be a materially
    // different card (Bojuka Bog would blow up its own controller's graveyard).
    expect(yard(s, "user")).toEqual(["UserA", "UserB"]);
    expect(yard(s, "ai2")).toEqual(["Ai2A"]);
  });

  it("eachPlayer empties EVERY yard including the controller's (Farewell is symmetric)", () => {
    const s = applyExileGraveyard(boardWithYards(), { op: "exile-graveyard", who: "eachPlayer" }, { controller: "user", targets: [] });
    for (const pid of ["user", "ai1", "ai2"]) expect(yard(s, pid)).toEqual([]);
    expect(exiled(s, "user")).toEqual(["UserA", "UserB"]);
  });

  it("eachOpponent spares the CONTROLLER's own graveyard", () => {
    const s = applyExileGraveyard(boardWithYards(), { op: "exile-graveyard", who: "eachOpponent" }, { controller: "user", targets: [] });
    expect(yard(s, "user")).toEqual(["UserA", "UserB"]);   // kept — the asymmetry IS the card
    expect(yard(s, "ai1")).toEqual([]);
    expect(yard(s, "ai2")).toEqual([]);
  });

  it("an EMPTY graveyard is a legal no-op, not a failure (CR 608.2)", () => {
    const base = boardWithYards();
    const empty = { ...base, players: { ...base.players, ai1: { ...base.players.ai1, graveyard: [] } } };
    const s = applyExileGraveyard(empty, { op: "exile-graveyard", who: "targetPlayer" },
      { controller: "user", targets: [{ type: "player", id: "ai1" }] });
    expect(yard(s, "ai1")).toEqual([]);
    expect(yard(s, "user")).toEqual(["UserA", "UserB"]);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Farewell's shape flips (all four modes now parse)", () => {
    expect(classifyCard({
      name: "Farewell", type: "Sorcery", mana: "{4}{W}{W}", keywords: [],
      oracle: "Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.",
    })).toMatch(/^native/);
  });
});
