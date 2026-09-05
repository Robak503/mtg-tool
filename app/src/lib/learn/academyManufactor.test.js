/**
 * ACADEMY MANUFACTOR — SHELF-85 · Bumble Flower F4 (2026-09-05). "If you would create a Clue, Food, or Treasure token,
 * instead create one of each." A token-creation REPLACEMENT (CR 614.1) on the doubler profile, applied at the single
 * mint chokepoint (the Peregrin Took "extra Food" convention): each Clue / Food / Treasure in the batch spawns the two
 * missing kinds, raw, in the same creation event; passes apply in turn (two Manufactors: one Food → three of each,
 * the printed ruling); a token doubler multiplies the spawned tokens (greedy-max, CR 616.1e). A Soldier token is untouched.
 *
 * Mutation-checked: see the run ledger (docs-sk63).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { applyCreateToken, applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { parseEffectProgram } from "./effects/parser.js";
import { doublerProfile, tokenOneOfEachPasses, stripModeledDoublerClauses } from "./replacementEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MANUFACTOR = { name: "Academy Manufactor", type: "Artifact Creature — Assembly-Worker", mana: "{3}", keywords: [], power: 1, toughness: 1, oracle: "If you would create a Clue, Food, or Treasure token, instead create one of each." };
const PROCESSION = { name: "Anointed Procession", type: "Enchantment", mana: "{3}{W}", keywords: [], oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." };
const perm = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function state(board) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const mine = board.filter((p) => p.controller === "user"), theirs = board.filter((p) => p.controller === "ai"); // each seat's permanents on ITS battlefield
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, battlefield: mine }, ai: { ...b.players.ai, battlefield: theirs } } };
}
const namedAtom = (oracle) => parseEffectProgram({ name: "x", type: "Instant", mana: "{1}", keywords: [], oracle }).atoms[0];
const tally = (s, pid = "user") => { const t = {}; for (const p of s.players[pid].battlefield) if (p.card?.token) t[p.card.name] = (t[p.card.name] || 0) + 1; return t; };

describe("profile + classify", () => {
  it("the sentence parses to a tokenOneOfEach profile, is stripped as a modelled doubler clause, counts one pass per Manufactor you control, and the card classifies native", () => {
    const row = { profile: doublerProfile(MANUFACTOR)?.tokenOneOfEach ?? null, stripped: stripModeledDoublerClauses(MANUFACTOR.oracle, MANUFACTOR).trim(), passes: tokenOneOfEachPasses(state([perm("m1", MANUFACTOR), perm("m2", MANUFACTOR), perm("m3", MANUFACTOR, "ai")]), "user"), tier: classifyCard(MANUFACTOR) };
    console.log("  WITNESS manufactorProfile", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.profile).toEqual({ kinds: ["clue", "food", "treasure"], scope: "you" });
    expect(row.stripped).toBe("");
    expect(row.passes).toBe(2); // the opponent's Manufactor never applies to YOUR tokens
    expect(row.tier).toMatch(/^native-/);
  });
});

describe("the replacement at the mint chokepoint", () => {
  it("one Manufactor: a Food → one Food, one Clue, one Treasure; a Soldier token is untouched; the opponent's Manufactor does nothing to your tokens", () => {
    const one = applyCreateNamedToken(state([perm("m1", MANUFACTOR)]), namedAtom("Create a Food token."), { controller: "user" });
    const soldier = applyCreateToken(state([perm("m1", MANUFACTOR)]), { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier" }, { controller: "user" });
    const theirs = applyCreateNamedToken(state([perm("m3", MANUFACTOR, "ai")]), namedAtom("Create a Treasure token."), { controller: "user" });
    const row = { one: tally(one), soldier: tally(soldier), theirs: tally(theirs) };
    console.log("  WITNESS manufactorOne", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.one).toEqual({ Food: 1, Clue: 1, Treasure: 1 });
    expect(Object.values(row.soldier).reduce((a, b) => a + b, 0)).toBe(1);
    expect(row.theirs).toEqual({ Treasure: 1 });
  });

  it("two Manufactors: one Food → three of each (the printed ruling); with a token doubler beside one Manufactor, one Food → two Foods, two Clues, two Treasures", () => {
    const two = applyCreateNamedToken(state([perm("m1", MANUFACTOR), perm("m2", MANUFACTOR)]), namedAtom("Create a Food token."), { controller: "user" });
    const doubled = applyCreateNamedToken(state([perm("m1", MANUFACTOR), perm("ap", PROCESSION)]), namedAtom("Create a Food token."), { controller: "user" });
    const row = { two: tally(two), doubled: tally(doubled) };
    console.log("  WITNESS manufactorTwo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.two).toEqual({ Food: 3, Clue: 3, Treasure: 3 });
    expect(row.doubled).toEqual({ Food: 2, Clue: 2, Treasure: 2 });
  });
});
