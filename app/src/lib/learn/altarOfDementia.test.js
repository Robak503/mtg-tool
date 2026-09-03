/**
 * altarOfDementia.test.js — SG-7 (2026-09-03): Altar of Dementia — "Sacrifice a creature: Target player mills
 * cards equal to the sacrificed creature's power." (the Squirrel Girl deck). The sacrifice-a-creature COST
 * already expanded per victim; the SACRIFICED REFERENT already existed for spells ("draw / gain life / damage
 * equal to the sacrificed creature's power" read `sacrificedForCost`, stamped before the additional-cost
 * sacrifice). Two things were missing: the dispatcher's ACTIVATED sac branch never stamped the channel, and
 * the mill parser had no sacrificed-referent form (and its applier no `amountCount`).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { millClauseParser } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ALTAR = { id: "c-altar", name: "Altar of Dementia", type: "Artifact", mana: "{2}", keywords: [], oracle: "Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power." };
const bear = (id, power) => createPermanent({ id, card: { id: "c-" + id, name: `Bear ${power}`, type: "Creature — Bear", mana: "{1}{G}", power, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });

describe("the parse", () => {
  it("reads the target-player mill with the sacrificed-power magnitude", () => {
    expect(millClauseParser("Target player mills cards equal to the sacrificed creature's power")).toEqual({ op: "mill", who: "target", targetType: "player", amountCount: { kind: "sacrificedPower", per: 1 } });
  });
});

describe("runtime — the victim's power sizes the mill", () => {
  it("⭐ sacrificing the 4-power bear mills the targeted opponent four; the 1-power bear mills one", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const lib = Array.from({ length: 10 }, (_, i) => ({ id: `aL${i}`, name: "Forest", type: "Basic Land — Forest" }));
    const s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "altar", card: ALTAR, controller: "user", summoningSick: false }), bear("b4", 4), bear("b1", 1)], hand: [], graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
        ai: { ...s0.players.ai, library: lib, graveyard: [] },
      },
    };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "altar" && a.targets?.[0]?.id === "ai");
    const feed4 = acts.find((a) => a.sacCreatureId === "b4");
    const feed1 = acts.find((a) => a.sacCreatureId === "b1");
    expect(feed4 && feed1).toBeTruthy();
    const out4 = resolveTopOfStack(dispatchAction(s, feed4));
    expect(out4.players.ai.graveyard.length).toBe(4);
    expect(out4.players.user.battlefield.some((p) => p.id === "b4")).toBe(false);
    const out1 = resolveTopOfStack(dispatchAction(s, feed1));
    expect(out1.players.ai.graveyard.length).toBe(1);
  });
});

describe("classification", () => {
  it("Altar of Dementia is native", () => {
    expect(classifyCard(ALTAR)).toMatch(/^native/);
  });

  it("CREED — a magnitude the channel does not carry still parks", () => {
    expect(classifyCard({ ...ALTAR, oracle: ALTAR.oracle.replace("the sacrificed creature's power", "the number of Squirrels that attacked this turn") })).not.toMatch(/^native/);
  });
});
