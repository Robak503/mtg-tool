/**
 * homewardPath.test.js — SG-12 (2026-09-03): Homeward Path — "{T}: Each player gains control of all creatures
 * they own." (the Squirrel Girl deck). A MASS control reset: every creature on any battlefield whose owner is
 * not its controller goes home (the shared control move — an in-place splice, no leave/enter, no dies), and
 * a threaten's end-of-turn stash is cleared so nothing later drags it back to the thief.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { regainOwnedCreaturesClauseParser } from "./effects/atoms/control.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PATH = { id: "c-path", name: "Homeward Path", type: "Land", mana: "", keywords: [], oracle: "{T}: Add {C}.\n{T}: Each player gains control of all creatures they own." };
const bear = (id, name) => ({ id: "c-" + id, name, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });

describe("the parse", () => {
  it("reads the mass control reset", () => {
    expect(regainOwnedCreaturesClauseParser("each player gains control of all creatures they own")).toEqual({ op: "regain-owned-creatures", targetType: null });
    expect(regainOwnedCreaturesClauseParser("each player gains control of all permanents they own")).toBeNull();
  });
});

describe("runtime", () => {
  it("⭐ the stolen creature on the AI's side goes home to the user; the user's stolen one goes home to the AI; natives stay", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const stolenFromUser = { ...createPermanent({ id: "mine", card: bear("mine", "Mine"), controller: "ai", summoningSick: false }), owner: "user", controlOriginal: "user", controlUntilEndOfTurn: true };
    const stolenFromAi = { ...createPermanent({ id: "theirs", card: bear("theirs", "Theirs"), controller: "user", summoningSick: false }), owner: "ai" };
    const s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [createPermanent({ id: "path", card: PATH, controller: "user", summoningSick: false }), stolenFromAi, createPermanent({ id: "native", card: bear("native", "Native"), controller: "user", summoningSick: false })] },
        ai: { ...s0.players.ai, battlefield: [stolenFromUser] },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "path");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    const ids = (pid) => out.players[pid].battlefield.map((p) => p.id).sort();
    expect(ids("user")).toEqual(["mine", "native", "path"]);
    expect(ids("ai")).toEqual(["theirs"]);
    const home = out.players.user.battlefield.find((p) => p.id === "mine");
    expect(home.controller).toBe("user");
    expect(home.controlUntilEndOfTurn).toBeFalsy();
  });
});

describe("classification", () => {
  it("Homeward Path is a fully covered land", () => {
    expect(classifyCard(PATH)).toBe("land");
  });
});
