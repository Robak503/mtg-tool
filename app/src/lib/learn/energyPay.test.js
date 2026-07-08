/**
 * energyPay.test.js — ENERGY subsystem, Slice B (the "Pay {E}" activated-ability cost).
 *
 * CR 122.1e: "Pay {E}…" is a NO-CHOICE numeric resource cost, parsed in abilities.js (payEnergy = pip count),
 * gated in legalChoices (player.energy >= payEnergy), and paid in actionDispatcher (spendEnergy). Mirrors the
 * existing payLife cost exactly across the three seams. A "{T}, Pay {E}{E}: <modeled effect>" ability whose
 * gain + effect are both modeled now flips native (Consulate Turret, Longtusk Cub, Dynavolt Tower, …).
 *
 * Flip-diff GAINED = 11, LOST = 0. Non-energy abilities are byte-identical (payEnergy defaults to 0 → the gate
 * and payment are skipped), so the self-play trajectory is unchanged.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function board(energy) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const p = createPermanent({ id: "src", card: { id: "c-s", name: "Cub", type: "Creature — Beast", power: 2, toughness: 2, oracle: "{T}, Pay {E}{E}: Put a +1/+1 counter on this creature." }, controller: "user", summoningSick: false });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user: { ...s0.players.user, battlefield: [p], energy } } };
}
const activations = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.permanentId === "src");

describe('ENERGY "Pay {E}" cost — enforced end-to-end', () => {
  it("the ability is NOT offered when energy < cost, and IS offered at >= cost (CR 122.1e affordability)", () => {
    expect(activations(board(0)).length).toBe(0);
    expect(activations(board(1)).length).toBe(0); // cost is {E}{E} = 2
    const at2 = activations(board(2));
    expect(at2.length).toBeGreaterThan(0);
    expect(at2[0].payEnergy).toBe(2);
  });
  it("activating SPENDS the energy (3 → 1 after paying {E}{E})", () => {
    const act = activations(board(3))[0];
    const next = dispatchAction(board(3), act);
    expect(next.players.user.energy).toBe(1);
  });
  it("a Pay-{E} ability with a modeled effect + modeled gain flips native", () => {
    expect(classifyCard({ name: "Consulate Turret", type: "Artifact", oracle: "{T}: You get {E} (an energy counter).\n{T}, Pay {E}{E}{E}: This artifact deals 2 damage to target player or planeswalker." })).toBe("native-activated");
  });
  it("CREED: an energy-gated MANA ability is NOT modeled as a free source (Servant stays non-native)", () => {
    // The mana model excludes energy-gated mana (Slice A); the ability is offered/payable but not credited as a
    // mana SOURCE, so a dork whose ONLY mana is "{T}, Pay {E}: Add …" stays a safe false-negative (Arbiter).
    expect(classifyCard({ name: "Servant of the Conduit", type: "Creature — Elf Druid", oracle: "When this creature enters, you get {E}{E} (two energy counters).\n{T}, Pay {E}: Add one mana of any color." })).not.toMatch(/^native/);
  });
});
