/**
 * DISCARD A CARD AT RANDOM — the COST. Residue census 2026-09-05 (RG-7): one mechanism across two lanes —
 *   the activated cost   "{R}, Discard a card at random: This creature gets +3/+0 until end of turn." (Frenetic Ogre · Ogre
 *                        Shaman · Pyromania · Stormbind · Amok · Coral Helm …)
 *   the additional cost  "As an additional cost to cast this spell, discard a card at random." (Sonic Burst · Acceptable
 *                        Losses · Sonic Seizure)
 *
 * The chosen-discard cost already existed on both lanes (one action per hand card, the dispatcher pitches the chosen one).
 * A RANDOM discard is not a choice: the offer is ONE action carrying `discardRandom`, and the dispatcher picks the card at
 * payment with the game's seeded rng (deterministicRng off state.rngSeed, then the seed advances — the shuffle discipline, so
 * a replay reproduces the pick). The spell being cast is never its own pitch (CR 601.2h — it is on the stack).
 *
 * Mutation-checked: see the run ledger (docs-rg7).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OGRE = { id: "c-ogre", name: "Frenetic Ogre", type: "Creature — Ogre", mana: "{4}{R}", power: 3, toughness: 3, keywords: [], oracle: "{R}, Discard a card at random: This creature gets +3/+0 until end of turn." };
const SHAMAN = { id: "c-sham", name: "Ogre Shaman", type: "Creature — Ogre Shaman", mana: "{3}{R}{R}", power: 4, toughness: 4, keywords: [], oracle: "{2}, Discard a card at random: This creature deals 2 damage to any target." };
const PYRO = { id: "c-pyro", name: "Pyromania", type: "Enchantment", mana: "{2}{R}", keywords: [], oracle: "{1}{R}, Discard a card at random: This enchantment deals 1 damage to any target.\n{1}{R}, Sacrifice this enchantment: It deals 1 damage to any target." };
const BURST = { id: "c-burst", name: "Sonic Burst", type: "Instant", mana: "{1}{R}", cmc: 2, keywords: [], oracle: "As an additional cost to cast this spell, discard a card at random.\nSonic Burst deals 4 damage to any target." };
const filler = (id) => ({ id, name: `Filler ${id}`, type: "Sorcery", mana: "{3}{G}", keywords: [], oracle: "Draw a card." });
const mountain = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Mountain", type: "Basic Land — Mountain", mana: "", keywords: [], oracle: "" }, controller: "user" });

function board(hand, bf) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5, rngSeed: 7,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, library: [], graveyard: [] } } };
}

describe("the classifier", () => {
  it("the activated carriers and the additional-cost spell read native", () => {
    const row = { ogre: classifyCard(OGRE), shaman: classifyCard(SHAMAN), pyro: classifyCard(PYRO), burst: classifyCard(BURST) };
    console.log("  WITNESS randomDiscardCost", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the activated cost", () => {
  it("a three-card hand yields ONE activation (not three); paying it pitches one card by the seeded rng, advances the seed, and replays identically", () => {
    const s = board([filler("h1"), filler("h2"), filler("h3")], [createPermanent({ id: "ogre", card: OGRE, controller: "user", summoningSick: false }), mountain("m1")]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "ogre");
    const after = dispatchAction(s, acts[0]);
    const again = dispatchAction(s, acts[0]);
    const row = { offered: acts.length, random: !!acts[0]?.discardRandom, chosenId: acts[0]?.discardCardId ?? null, hand: after.players.user.hand.length, gy: after.players.user.graveyard.map((c) => c.id), seedMoved: after.rngSeed !== s.rngSeed, replay: again.players.user.graveyard.map((c) => c.id), stacked: after.stack.length };
    console.log("  WITNESS randomDiscardActivated", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toBe(1);
    expect(row.random).toBe(true);
    expect(row.chosenId).toBeNull();
    expect(row.hand).toBe(2);
    expect(row.gy).toHaveLength(1);
    expect(row.seedMoved).toBe(true);
    expect(row.replay).toEqual(row.gy);
    expect(row.stacked).toBe(1);
  });
  it("an empty hand offers nothing", () => {
    const s = board([], [createPermanent({ id: "ogre", card: OGRE, controller: "user", summoningSick: false }), mountain("m1")]);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "ogre")).toHaveLength(0);
  });
});

describe("RUNTIME — the additional cost", () => {
  it("Sonic Burst casts with ONE random-discard variant per target; paying pitches one of the OTHER cards and the Burst goes to the stack", () => {
    const s = board([BURST, filler("h1"), filler("h2")], [mountain("m1"), mountain("m2")]);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c-burst");
    const after = dispatchAction(s, casts[0]);
    const row = { casts: casts.length, allRandom: casts.every((a) => a.discardRandom === true && !a.discardCardId), hand: after.players.user.hand.map((c) => c.id), gy: after.players.user.graveyard.map((c) => c.id), stacked: after.stack.map((o) => o.card?.id ?? o.cardId ?? o.name) };
    console.log("  WITNESS randomDiscardSpell", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.casts).toBeGreaterThan(0);
    expect(row.allRandom).toBe(true);
    expect(row.hand).toHaveLength(1);
    expect(row.gy).toHaveLength(1);
    expect(row.gy[0]).not.toBe("c-burst");
    expect(after.stack).toHaveLength(1);
  });
});
