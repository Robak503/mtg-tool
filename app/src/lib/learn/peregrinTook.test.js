/**
 * peregrinTook.test.js — SG-10 (2026-09-03): Peregrin Took — "If one or more tokens would be created under your
 * control, those tokens plus an additional Food token are created instead." + "Sacrifice three Foods: Draw a
 * card." (the Squirrel Girl deck). The PASSIVE, kind-unfiltered cousin of Xorn's Treasure additive: ANY token
 * creation event under Took's controller adds one Food — once per EVENT, never for an opponent's tokens, and the
 * extra Food never re-triggers the replacement (CR 614.5).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { applyCreateNamedToken, applyCreateToken } from "./effects/atoms/tokens.js";
import { doublerProfile, tokenExtraKinds } from "./replacementEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TOOK = { id: "c-took", name: "Peregrin Took", type: "Legendary Creature — Halfling Citizen", mana: "{2}{G}", power: 1, toughness: 3, keywords: [], oracle: "If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card." };
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.token).map((p) => p.card.name).sort();

function board(tookController) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 4,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: tookController === "user" ? [createPermanent({ id: "took", card: TOOK, controller: "user", summoningSick: false })] : [] },
      ai: { ...s0.players.ai, battlefield: tookController === "ai" ? [createPermanent({ id: "took", card: TOOK, controller: "ai", summoningSick: false })] : [] },
    },
  };
}

describe("the profile", () => {
  it("reads the passive +1 Food replacement", () => {
    expect(doublerProfile(TOOK).tokenExtra).toEqual({ kind: "food", scope: "you" });
    expect(tokenExtraKinds(board("user"), "user")).toEqual(["food"]);
    expect(tokenExtraKinds(board("user"), "ai")).toEqual([]);
  });

  it("CREED — a Clue variant is not this template", () => {
    expect(doublerProfile({ ...TOOK, oracle: TOOK.oracle.replace("additional Food token", "additional Clue token") })).toBeNull();
  });
});

describe("runtime", () => {
  it("⭐ one Treasure event → the Treasure plus ONE Food; two Squirrels in one event → two Squirrels plus ONE Food", () => {
    const s = board("user");
    const t = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure" }, { controller: "user" });
    expect(tokensOf(t, "user")).toEqual(["Food", "Treasure"]);
    const sq = applyCreateToken(s, { op: "create-token", count: 2, descriptor: { power: 1, toughness: 1, colors: ["green"], types: ["creature"], subtypes: ["squirrel"] } }, { controller: "user" });
    const names = tokensOf(sq, "user");
    expect(names.filter((n) => n === "Food")).toHaveLength(1);
    expect(names.filter((n) => n !== "Food")).toHaveLength(2);
  });

  it("two separate events → two Foods", () => {
    const s = board("user");
    const one = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure" }, { controller: "user" });
    const two = applyCreateNamedToken(one, { op: "create-named-token", token: "treasure" }, { controller: "user" });
    expect(tokensOf(two, "user").filter((n) => n === "Food")).toHaveLength(2);
  });

  it("⛔ the OPPONENT's Took adds nothing to the user's tokens", () => {
    const s = board("ai");
    const t = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure" }, { controller: "user" });
    expect(tokensOf(t, "user")).toEqual(["Treasure"]);
    expect(tokensOf(t, "ai")).toEqual([]);
  });
});

describe("classification", () => {
  it("Peregrin Took is native", () => {
    expect(classifyCard(TOOK)).toMatch(/^native/);
  });
});
