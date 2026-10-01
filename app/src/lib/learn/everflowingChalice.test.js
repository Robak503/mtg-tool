/**
 * everflowingChalice.test.js — MULTIKICKER, offered (the play-weighted program, P·15, 2026-10-01: Everflowing Chalice, EDHREC
 * rank #251; CR 702.33c/d, 614.1c, 122.6a, 608.2h).
 *
 *   Everflowing Chalice ({0} Artifact): "Multikicker {2} (You may pay an additional {2} any number of times as you cast this
 *   spell.) / This artifact enters with a charge counter on it for each time it was kicked. / {T}: Add {C} for each charge
 *   counter on this artifact."
 *
 * Until this slice the engine never offered a multikicked cast, so every multikicker payoff read zero (multikickerCount.test.js
 * pinned that as the true answer for the casts available). Now legalChoices offers one cast per affordable kick count for a
 * NATIVE multikicker card, and the count rides the cast to the permanent (perm.timesKicked): the enters-with counters read the
 * cast's own count, an ETB's "for each time it was kicked" reads it through the trigger's self context — never the state-wide
 * cast stamp a spell cast in response overwrites.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseMultikickerCost } from "./kicker.js";
import { entersWithCountersPerKick } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CHALICE = { name: "Everflowing Chalice", type: "Artifact", mana: "{0}", cmc: 0, colors: [], keywords: ["Multikicker"],
  oracle: "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact." };
const GNARLID = { name: "Gnarlid Pack", type: "Creature — Beast", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: ["Multikicker"],
  oracle: "Multikicker {1}{G} (You may pay an additional {1}{G} any number of times as you cast this spell.)\nThis creature enters with a +1/+1 counter on it for each time it was kicked." };
const WOLFBRIAR = { name: "Wolfbriar Elemental", type: "Creature — Elemental", mana: "{2}{G}{G}", cmc: 4, colors: ["G"], power: "4", toughness: "4", keywords: ["Multikicker"],
  oracle: "Multikicker {G} (You may pay an additional {G} any number of times as you cast this spell.)\nWhen this creature enters, create a 2/2 green Wolf creature token for each time it was kicked." };
const LIGHTKEEPER = { name: "Lightkeeper of Emeria", type: "Creature — Angel", mana: "{3}{W}", cmc: 4, colors: ["W"], power: "2", toughness: "4", keywords: ["Flying", "Multikicker"],
  oracle: "Multikicker {W} (You may pay an additional {W} any number of times as you cast this spell.)\nFlying\nWhen this creature enters, you gain 2 life for each time it was kicked." };
const ANTHEM = { name: "Marshal's Anthem", type: "Enchantment", mana: "{2}{W}{W}", cmc: 4, colors: ["W"], keywords: ["Multikicker"],
  oracle: "Multikicker {1}{W} (You may pay an additional {1}{W} any number of times as you cast this spell.)\nCreatures you control get +1/+1.\nWhen this enchantment enters, return up to X target creature cards from your graveyard to the battlefield, where X is the number of times this enchantment was kicked." };
const RITUAL = { name: "Dark Ritual", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], keywords: [], oracle: "Add {B}{B}{B}." };

function table(hand, pool) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...g.players, user: { ...g.players.user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, ...pool } } } };
}
const castsOf = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === id);
/** The caster gets {B} to respond with — added after the cast, so the planner can't have spent it on the kicked cost. */
const withB = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, B: 1 } } } });
const castKicked = (s, id, k) => {
  const a = castsOf(s, id).filter((x) => (x.kickCount ?? 0) === k);
  if (a.length !== 1) throw new Error(`expected one cast of ${id} kicked ${k} times, found ${a.length}`);
  return dispatchAction(s, a[0]);
};
/** Resolve the stack and any pending triggers to quiet. */
function settle(s) {
  let n = finalizeStackResolution(s), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = finalizeStackResolution(n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const mine = (s, name) => s.players.user.battlefield.filter((p) => p.card?.name === name);

describe("the card", () => {
  it("Multikicker {2}, a charge counter per kick, and the card is native-mana", () => {
    expect({ pips: parseMultikickerCost(CHALICE), counters: entersWithCountersPerKick(CHALICE), tier: classifyCard(CHALICE) })
      .toEqual({ pips: "{2}", counters: { type: "charge", per: 1 }, tier: "native-mana" });
  });

  it("the counters-per-kick sentence is credited only for an honest counter kind (synthetic: the Chalice without its mana line)", () => {
    // The native-mana tier never reads a static sentence (its residue gate checks triggers and activated abilities), so the
    // strip is witnessed on the body path: the sentence alone is credited for a charge counter, never for a finality counter
    // (no card prints one — a kind the engine doesn't honor).
    const body = (kind) => ({ ...CHALICE, oracle: `Multikicker {2}\nThis artifact enters with a ${kind} counter on it for each time it was kicked.` });
    expect([classifyCard(body("charge")), classifyCard(body("finality")), entersWithCountersPerKick(body("finality"))])
      .toEqual(["native-body", "body-only", { type: "finality", per: 1 }]);
  });
});

describe("the offer (CR 702.33c/d)", () => {
  it("one cast per affordable kick count, the multikicker pips folded in once per kick", () => {
    const offered = castsOf(table([["ch", CHALICE]], { C: 6 }), "ch").map((a) => [a.kickCount, a.cost.generic || 0]);
    expect(offered).toEqual([[0, 0], [1, 2], [2, 4], [3, 6]]);
  });

  it("the offer stops at 20 kicks however much mana there is", () => {
    const counts = castsOf(table([["ch", CHALICE]], { C: 100 }), "ch").map((a) => a.kickCount);
    expect({ n: counts.length, max: Math.max(...counts) }).toEqual({ n: 21, max: 20 });
  });

  it("⛔ a cast without paying its mana cost is offered no kicks — never a free kick (the same limitation as single kicker)", () => {
    const s = { ...table([["ch", CHALICE]], { C: 6 }), pendingFreeCast: { controller: "user", candidateIds: ["ch"], maxMv: 5, typeFilter: null, sourceName: "Rishkar's Expertise" } };
    expect(castsOf(s, "ch").map((a) => [a.kickCount, !!a.freeCast])).toEqual([[0, true]]);
  });

  it("⛔ a multikicker card that isn't native is never offered a kick (Marshal's Anthem — its kicked ETB is unmodeled)", () => {
    const offered = castsOf(table([["ma", ANTHEM]], { W: 4, C: 8 }), "ma");
    expect({ tier: classifyCard(ANTHEM), casts: offered.length, kicks: offered.map((a) => a.kickCount ?? null) })
      .toEqual({ tier: "body-only", casts: 1, kicks: [null] });
  });
});

describe("in play", () => {
  it("Chalice kicked twice enters with two charge counters and taps for {C}{C} (WITNESS)", () => {
    const s = settle(castKicked(table([["ch", CHALICE]], { C: 4 }), "ch", 2));
    const chalice = mine(s, "Everflowing Chalice")[0];
    const tap = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === chalice.id);
    const tapped = tap.length === 1 ? dispatchAction(s, tap[0]) : null;
    const witness = { counters: chalice.counters, timesKicked: chalice.timesKicked, taps: tap.length, pool: tapped?.players.user.manaPool.C ?? null };
    console.log(`WITNESS everflowingChalice ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ counters: { charge: 2 }, timesKicked: 2, taps: 1, pool: 2 });
  });

  it("Chalice cast unkicked enters with no counters", () => {
    const s = settle(castKicked(table([["ch", CHALICE]], {}), "ch", 0));
    expect(mine(s, "Everflowing Chalice").map((p) => p.counters.charge || 0)).toEqual([0]);
  });

  it("Gnarlid Pack kicked twice is a 4/4 — even with a spell cast in response before it resolves", () => {
    const cast = withB(castKicked(table([["gp", GNARLID], ["dr", RITUAL]], { G: 3, C: 3 }), "gp", 2));
    const ritual = legalActionsForPlayer(cast, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dr");
    const s = settle(dispatchAction(cast, ritual));
    const pack = mine(s, "Gnarlid Pack")[0];
    expect({ timesKicked: pack.timesKicked, size: [permanentPower(s, pack.id), permanentToughness(s, pack.id)] }).toEqual({ timesKicked: 2, size: [4, 4] });
  });

  it("Wolfbriar kicked twice makes two Wolves — even destroyed, with a spell cast, in response to its trigger (CR 608.2h)", () => {
    const entered = withB(finalizeStackResolution(resolveTopOfStack(castKicked(table([["wb", WOLFBRIAR], ["dr", RITUAL]], { G: 4, C: 2 }), "wb", 2))));
    const wbId = mine(entered, "Wolfbriar Elemental")[0].id;
    const gone = ATOM_RESOLVERS["destroy"](entered, { op: "destroy", targetType: "creature" }, { controller: "ai", targets: [{ type: "creature", id: wbId }] });
    const ritual = legalActionsForPlayer(gone, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dr");
    const s = settle(dispatchAction(gone, ritual));
    expect({ wolfbriar: mine(s, "Wolfbriar Elemental").length, wolves: s.players.user.battlefield.filter((p) => /\bWolf\b/.test(p.card?.type || "")).length })
      .toEqual({ wolfbriar: 0, wolves: 2 });
  });

  it("Lightkeeper of Emeria kicked three times gains 6 life", () => {
    const s = settle(castKicked(table([["lk", LIGHTKEEPER]], { W: 4, C: 3 }), "lk", 3));
    expect(s.players.user.life).toBe(46);
  });

  it("the AI pays for every kick it can", () => {
    const s = table([["ch", CHALICE]], { C: 5 });
    const pick = pickAction(s, "user", legalActionsForPlayer(s, "user"));
    expect({ kind: pick?.kind, card: pick?.cardId, kicks: pick?.kickCount }).toEqual({ kind: "cast-spell", card: "ch", kicks: 2 });
  });
});
