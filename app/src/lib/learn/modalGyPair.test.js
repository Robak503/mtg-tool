/**
 * modalGyPair.test.js — BLITZ MG-1: the modal shared-type graveyard pair
 * (Return from Extinction / Raise the Draugr / Unbury — the only 3 corpus carriers, probed 2026-07-16):
 *   "Choose one —
 *    • Return target creature card from your graveyard to your hand.
 *    • Return two target creature cards that share a creature type from your graveyard to your hand."
 * Mode 2 is a MANDATORY pair (minTargets:2/maxTargets:2 — only size-2 subsets, CR 601.2c) constrained by
 * the sharesCreatureType SUBSET gate (targeting.expandAtoms, the singleGraveyard pattern): a pair is legal
 * only if the two cards share a real CR 205.3m creature type (changeling = every type, CR 702.73a; the
 * after-dash allowlist keeps a non-creature subtype like "Food"/"Equipment" from certifying a share; the
 * " // " front-face split keeps DFC junk words out — CR 712.4a). An off-type pair is NEVER offered; with no
 * legal pair the mode simply isn't offered while mode 1 stays castable (expandCastChoices gates per mode).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MODAL_ORACLE = "Choose one —\n• Return target creature card from your graveyard to your hand.\n• Return two target creature cards that share a creature type from your graveyard to your hand.";
const RETURN_FROM_EXTINCTION = { id: "c-rfe", name: "Return from Extinction", type: "Sorcery", mana: "{1}{B}", oracle: MODAL_ORACLE };
const RAISE_THE_DRAUGR = { id: "c-rtd", name: "Raise the Draugr", type: "Instant", mana: "{1}{B}", oracle: MODAL_ORACLE };
const UNBURY = { id: "c-unb", name: "Unbury", type: "Instant", mana: "{1}{B}", oracle: MODAL_ORACLE };

const gyCard = (id, name, type) => ({ id, name, type, power: 2, toughness: 2, oracle: "" });

function boardState({ userGy = [], aiGy = [], hand = [], pool = { C: 6, B: 1 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, graveyard: aiGy },
    },
  };
}

// All mode-1 (the pair mode) casts of the full modal program, as arrays of target ids.
function pairModeCasts(s, program) {
  return (expandCastChoices(s, "user", program) || [])
    .filter((ch) => ch.chosenMode === 1)
    .map((ch) => ch.targets.map((t) => t.id).sort());
}

describe("MG-1 parser — the pair clause is HIGH with the subset flags; near-misses stay LOW", () => {
  it("parses the mandatory shared-type pair atom", () => {
    const p = parseEffectClause("Return two target creature cards that share a creature type from your graveyard to your hand.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", maxTargets: 2, minTargets: 2, sharesCreatureType: true }]);
  });
  it("the 3 real carriers flip native-spell (whole modal HIGH — both modes modeled)", () => {
    expect(classifyCard(RETURN_FROM_EXTINCTION)).toBe("native-spell");
    expect(classifyCard(RAISE_THE_DRAUGR)).toBe("native-spell");
    expect(classifyCard(UNBURY)).toBe("native-spell");
  });
  it("FN guards: a variant count / shared property / destination / missing constraint stays LOW (Arbiter)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Sorcery", oracle }))).toBe("low");
    low("Return two target creature cards that share a card type from your graveyard to your hand.");      // CARD type, not creature type
    low("Return three target creature cards that share a creature type from your graveyard to your hand."); // a different count
    low("Return two target creature cards that share a creature type from your graveyard to the battlefield."); // another destination
    low("Return two target creature cards from your graveyard to your hand.");                              // unconstrained pair (not "up to" either)
  });
});

describe("MG-1 enumeration — only real shared-creature-type pairs are offered (CR 601.2c)", () => {
  const program = parseEffectProgram(RETURN_FROM_EXTINCTION);

  it("two Zombies pair up; a Zombie+Bear pair is NEVER offered; every pair has exactly 2 targets", () => {
    const s = boardState({ userGy: [
      gyCard("z1", "Walking Corpse", "Creature — Zombie"),
      gyCard("z2", "Gravecrawler-ish", "Creature — Zombie"),
      gyCard("b1", "Grizzly Bears", "Creature — Bear"),
    ] });
    const pairs = pairModeCasts(s, program);
    expect(pairs).toContainEqual(["z1", "z2"]);                       // the sharing pair IS offered
    expect(pairs.some((p) => p.includes("b1"))).toBe(false);          // the off-type Bear never pairs
    expect(pairs.every((p) => p.length === 2)).toBe(true);            // mandatory 2 — no 0/1-card subsets
  });

  it("a CHANGELING pairs with anything (CR 702.73a — every creature type)", () => {
    const s = boardState({ userGy: [
      { id: "ch", name: "Changeling Outcast-ish", type: "Creature — Shapeshifter", power: 1, toughness: 1, oracle: "Changeling (This card is every creature type.)" },
      gyCard("b1", "Grizzly Bears", "Creature — Bear"),
    ] });
    expect(pairModeCasts(s, program)).toContainEqual(["b1", "ch"]);
  });

  it("CREED: a NON-creature shared subtype ('Food' — CR 205.3g artifact type) can NOT certify a pair", () => {
    // Gingerbrute-shaped fixtures (corpus-probed type lines): the only shared after-dash word is "Food",
    // an ARTIFACT type — not a creature type — so the pair is illegal and must never be offered.
    const s = boardState({ userGy: [
      gyCard("g1", "Gingerbrute", "Artifact Creature — Food Golem"),
      gyCard("g2", "Char-Dog", "Artifact Creature — Dog Food"),
    ], hand: [RETURN_FROM_EXTINCTION] });
    expect(pairModeCasts(s, program)).toEqual([]);                    // no legal pair → mode 2 not offered
    // …but each is individually a legal MODE-1 target: the sibling mode stays castable (per-mode gate).
    const singles = (expandCastChoices(s, "user", program) || []).filter((ch) => ch.chosenMode === 0);
    expect(singles.map((ch) => ch.targets[0].id).sort()).toEqual(["g1", "g2"]);
  });

  it("DFC junk words never certify a share (CR 712.4a front face only)", () => {
    // Combined type lines share the words "Creature" and "Wolf" on their BACK faces — the front faces
    // (Human vs Elf) share nothing, so the pair is illegal. A naive un-split intersection would offer it.
    const s = boardState({ userGy: [
      gyCard("d1", "Villager", "Creature — Human // Creature — Wolf"),
      gyCard("d2", "Wildkin", "Creature — Elf // Creature — Wolf"),
    ] });
    expect(pairModeCasts(s, program)).toEqual([]);
  });

  it("'Time Lord' — the one two-word creature type (CR 205.3m) — is shared correctly", () => {
    const s = boardState({ userGy: [
      gyCard("t1", "The Doctor-ish", "Legendary Creature — Time Lord Doctor"),
      gyCard("t2", "The Master-ish", "Legendary Creature — Time Lord"),
    ] });
    expect(pairModeCasts(s, program)).toContainEqual(["t1", "t2"]);
  });

  it("a single creature in the graveyard: mode 2 is not offered, mode 1 still is; opponent's graveyard never counts", () => {
    const s = boardState({
      userGy: [gyCard("z1", "Walking Corpse", "Creature — Zombie")],
      aiGy: [gyCard("az1", "Enemy Zombie", "Creature — Zombie"), gyCard("az2", "Enemy Zombie Two", "Creature — Zombie")],
    });
    const choices = expandCastChoices(s, "user", program) || [];
    expect(choices.filter((ch) => ch.chosenMode === 1)).toEqual([]);  // no own-graveyard pair exists
    const singles = choices.filter((ch) => ch.chosenMode === 0);
    expect(singles.map((ch) => ch.targets[0].id)).toEqual(["z1"]);    // mode 1 castable, own graveyard only
  });
});

describe("MG-1 runtime — the cast path resolves both modes faithfully", () => {
  it("mode 2: both chosen Zombies land in hand; the Bear and the spell stay in the graveyard (CR 608.2n)", () => {
    let s = boardState({
      userGy: [gyCard("z1", "Walking Corpse", "Creature — Zombie"), gyCard("z2", "Gravecrawler-ish", "Creature — Zombie"), gyCard("b1", "Grizzly Bears", "Creature — Bear")],
      hand: [RETURN_FROM_EXTINCTION],
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-rfe" && a.chosenMode === 1);
    expect(cast).toBeTruthy();
    expect(cast.targets.map((t) => t.id).sort()).toEqual(["z1", "z2"]); // the only legal pair
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["z1", "z2"]); // BOTH returned to hand
    expect(s.players.user.graveyard.map((c) => c.id).sort()).toEqual(["b1", "c-rfe"]); // Bear stays + the resolved sorcery
  });

  it("mode 1: the single-return mode still resolves (one card to hand)", () => {
    let s = boardState({
      userGy: [gyCard("z1", "Walking Corpse", "Creature — Zombie")],
      hand: [RETURN_FROM_EXTINCTION],
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-rfe" && a.chosenMode === 0);
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.players.user.hand.some((c) => c.id === "z1")).toBe(true);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["c-rfe"]);
  });
});
