/**
 * playLandFromGraveyard.test.js — "You may play lands from your graveyard." (CR 118.6, census slice 44.)
 *
 * Crucible of Worlds / Ramunap Excavator / Ancient Greenwarden — 9 corpus carriers of the bare form.
 *
 * Modeled as the graveyard sibling of the existing play-from-top permission (Future Sight), and for the same
 * stated reason: the static is emitted as a coverage + enforcement MARKER whose runtime really offers the
 * play. A permission credited without a runtime is the "claimed native but does nothing" false positive this
 * parser was explicitly built to avoid.
 *
 * THE GATES ARE THE DANGEROUS PART, so most of this file is about them. The permission changes the ZONE and
 * nothing else. It does not grant an extra land drop and it does not grant instant-speed land plays. A
 * version that offered graveyard lands without re-applying those two gates would quietly hand the player a
 * second (and third) land every turn — a far worse bug than leaving the card on the Arbiter.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, playLandFromGraveyardPermission } from "./staticAbilityParser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

const CRUCIBLE = { name: "Crucible of Worlds", type: "Artifact", mana: "{3}", oracle: "You may play lands from your graveyard." };
const GY_LAND = { id: "gyland", name: "Wasteland", type: "Land" };

function board({ withCrucible = true, landsPlayed = 0, step = "main", phase = "precombat-main" } = {}) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = withCrucible ? [createPermanent({ id: "cru", card: CRUCIBLE, controller: "user", summoningSick: false })] : [];
  return {
    ...s,
    phase, step, activePlayer: "user", priorityHolder: "user", turn: 4,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: bf, hand: [], graveyard: [GY_LAND, { id: "gyspell", name: "Shock", type: "Instant" }], landsPlayedThisTurn: landsPlayed },
    },
  };
}

const gyLandPlays = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "play-land" && a.fromZone === "graveyard");

describe("the permission is read off the battlefield", () => {
  it("emits the marker", () => {
    expect(parseStaticAbilities(CRUCIBLE).some((d) => d.playLandFromGraveyard)).toBe(true);
  });

  it("and is live only while the source is on the battlefield", () => {
    expect(playLandFromGraveyardPermission(board({ withCrucible: true }), "user")).toBe(true);
    expect(playLandFromGraveyardPermission(board({ withCrucible: false }), "user")).toBe(false);
  });
});

describe("ENFORCEMENT — the land is really offered and really played", () => {
  it("without the permission, a graveyard land is NOT offered", () => {
    expect(gyLandPlays(board({ withCrucible: false }))).toHaveLength(0);
  });

  it("with it, exactly the LAND is offered — not the instant sharing the graveyard", () => {
    const plays = gyLandPlays(board());
    expect(plays).toHaveLength(1);
    expect(plays[0].cardId).toBe("gyland");
  });

  it("playing it moves the card graveyard → battlefield", () => {
    const st = board();
    const next = dispatchAction(st, gyLandPlays(st)[0]);
    expect(next.players.user.battlefield.some((p) => p.card?.name === "Wasteland")).toBe(true);
    expect(next.players.user.graveyard.some((c) => c.id === "gyland")).toBe(false);
  });
});

describe("THE GATES — the permission changes the zone and nothing else", () => {
  it("it CONSUMES the land drop, so a second land is not offered afterwards", () => {
    const st = board();
    const next = dispatchAction(st, gyLandPlays(st)[0]);
    expect(next.players.user.landsPlayedThisTurn).toBe(1);
    expect(gyLandPlays(next)).toHaveLength(0);
  });

  it("with the land drop already spent, nothing is offered — Crucible grants no EXTRA drop", () => {
    expect(gyLandPlays(board({ landsPlayed: 1 }))).toHaveLength(0);
  });

  it("and it does not grant instant-speed land plays", () => {
    expect(gyLandPlays(board({ phase: "combat", step: "declare-blockers" }))).toHaveLength(0);
  });
});

describe("CREED — richer printed variants stay on the Arbiter", () => {
  it("'play lands AND CAST SPELLS from your graveyard' is not credited — the spell half is a real permission", () => {
    const agenda = { ...CRUCIBLE, name: "Yawgmoth's Agenda", oracle: "You may play lands and cast spells from your graveyard." };
    expect(parseStaticAbilities(agenda).some((d) => d.playLandFromGraveyard)).toBe(false);
    expect(classifyCard(agenda)).not.toMatch(/^native/);
  });

  it("a RESTRICTION on other players is not read as a permission (Tomik)", () => {
    const tomik = { ...CRUCIBLE, name: "Tomik", oracle: "Your opponents can't play land cards from graveyards." };
    expect(parseStaticAbilities(tomik).some((d) => d.playLandFromGraveyard)).toBe(false);
  });

  it("a filtered spell variant is not credited", () => {
    const zask = { ...CRUCIBLE, name: "Zask", oracle: "You may play lands and cast Insect spells from your graveyard." };
    expect(parseStaticAbilities(zask).some((d) => d.playLandFromGraveyard)).toBe(false);
  });
});

describe("classification", () => {
  it("Crucible of Worlds flips", () => {
    expect(classifyCard(CRUCIBLE)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...CRUCIBLE, oracle: `${CRUCIBLE.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
