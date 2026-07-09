/**
 * playFromTopOfLibrary.test.js — the PLAY-FROM-TOP-OF-LIBRARY subsystem (Future Sight; CR 118.6 / 601.3e).
 * A static { playFromTop } marker (staticAbilityParser) that is genuinely ENFORCED, not a no-op: while a player
 * controls such a permanent, legalChoices.actionsPlayFromTopOfLibrary offers the TOP library card as a real
 * action — a nonland cast at full cost through the shared cast builder (fromZone "library"), or a land via the
 * play-land path — and the dispatcher splices it from the library. "Play with the top card … revealed" is an
 * inert no-op in the perfect-information sim. Flip: Future Sight / Magus of the Future / Goblin Spy → native.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const FUTURE_SIGHT = { id: "cfs", name: "Future Sight", type: "Enchantment", mana: "{2}{U}{U}", oracle: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." };
function setup(topCard, withPermission) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = withPermission ? [createPermanent({ id: "fs", card: FUTURE_SIGHT, controller: "user" })] : [];
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, library: [topCard, { id: "l2", name: "F", type: "Creature — X", mana: "{9}" }], manaPool: { ...s.players.user.manaPool, G: 5, C: 5 } } } };
}
const BEAR = { id: "topbear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, mana: "{1}{G}" };
const FOREST = { id: "topforest", name: "Forest", type: "Basic Land — Forest" };

describe("play-from-top-of-library — classification", () => {
  it("Future Sight and friends flip native (the permission + inert 'revealed' line are modeled)", () => {
    expect(classifyCard({ name: "Future Sight", type: "Enchantment", mana: "{2}{U}{U}", oracle: FUTURE_SIGHT.oracle })).toMatch(/^native/);
    expect(classifyCard({ name: "Goblin Spy", type: "Creature — Goblin", mana: "{2}{R}", power: 1, toughness: 1, oracle: "Play with the top card of your library revealed." })).toMatch(/^native/);
  });
});

describe("play-from-top-of-library — enforcement (not a no-op)", () => {
  it("the top NONLAND is castable (fromZone library) only while the permission is in play", () => {
    const withP = filterActions(legalActionsForPlayer(setup(BEAR, true), "user"), "cast-spell").filter((a) => a.cardId === "topbear");
    const without = filterActions(legalActionsForPlayer(setup(BEAR, false), "user"), "cast-spell").filter((a) => a.cardId === "topbear");
    expect(withP.length).toBe(1);
    expect(withP[0].fromZone).toBe("library");
    expect(without.length).toBe(0);
  });
  it("the top LAND is playable from the library", () => {
    const acts = legalActionsForPlayer(setup(FOREST, true), "user").filter((a) => a.kind === "play-land" && a.cardId === "topforest");
    expect(acts.length).toBe(1);
    expect(acts[0].fromZone).toBe("library");
  });
  it("casting the top card splices it out of the library", () => {
    let s = setup(BEAR, true);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "topbear");
    s = dispatchAction(s, cast);
    expect(s.players.user.library.map((c) => c.id)).not.toContain("topbear");
  });
});
