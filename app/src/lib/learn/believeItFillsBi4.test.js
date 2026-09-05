/**
 * BELIEVE IT! FILLS — POD-SIM THREE · BI-4 (2026-09-05): Flare of Malice + Contagion.
 *
 * Flare of Malice — "Each opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and
 * planeswalkers they control." The edict over a creature-or-planeswalker pool, narrowed per sacrificer to their top mana
 * value (ties stay a choice); the sacrifice-a-nontoken-black-creature alt cost composes.
 * Contagion — "Distribute two -2/-1 counters among one or two target creatures." Any P/T counter, any creatures; counter
 * deltas are PER AXIS now so the counters shrink real creatures; the fallback prefers the opponents' creatures for a
 * harmful counter; the pay-1-life-and-exile-a-black-card pitch composes.
 *
 * Mutation-checked: see the run ledger (docs-sk51).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveDistributeChoice, autoPickDistributeCounters, resolveSacrificeChoice } from "./effects/runProgram.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FLARE = { id: "flare", name: "Flare of Malice", type: "Instant", mana: "{2}{B}{B}", cmc: 4, colors: ["B"], oracle: "You may sacrifice a nontoken black creature rather than pay this spell's mana cost.\nEach opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control." };
const CONTAGION = { id: "cont", name: "Contagion", type: "Instant", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], oracle: "You may pay 1 life and exile a black card from your hand rather than pay this spell's mana cost.\nDistribute two -2/-1 counters among one or two target creatures." };
const BLACK = { id: "blk", name: "Dark Ritual", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], oracle: "Add {B}{B}{B}." };
const perm = (id, controller, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const creature = (id, controller, name, mana, power, toughness, extra = {}) => perm(id, controller, { name, type: "Creature — Beast", mana, power, toughness, oracle: "", ...extra });
function state({ hand = [], userBf = [], aiBf = [], userPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}
const castsOf = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const names = (s, pid) => s.players[pid].battlefield.map((p) => p.card.name).sort();

describe("parse + classify", () => {
  it("Flare is a greatest-MV each-opponent edict over creatures and planeswalkers; Contagion distributes -2/-1 among any creatures; both native-spell", () => {
    const row = { flare: parseEffectProgram(FLARE)?.atoms, contagion: parseEffectProgram(CONTAGION)?.atoms, tiers: [classifyCard({ ...FLARE, keywords: [] }), classifyCard({ ...CONTAGION, keywords: [] })] };
    console.log("  WITNESS bi4Parse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.flare).toEqual([{ op: "sacrifice", who: "eachOpponent", what: "creatureOrPlaneswalker", greatestMv: true }]);
    expect(row.contagion).toEqual([{ op: "distribute-counters", counterType: "-2/-1", amount: 2, maxTargets: 2, group: "creatures" }]);
    expect(row.tiers).toEqual(["native-spell", "native-spell"]);
  });
});

describe("Flare of Malice", () => {
  it("their Ogre (4) and Jace (4) tie above the Bear (2) and a token (0): the sacrifice pause offers exactly those two; picking the Ogre leaves Jace and the Bear", () => {
    const s = state({ hand: [FLARE], userPool: { B: 4 }, aiBf: [
      creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4),
      creature("bear", "ai", "Bear", "{1}{G}", 2, 2),
      perm("jace", "ai", { name: "Jace", type: "Legendary Planeswalker — Jace", mana: "{2}{U}{U}", oracle: "" }),
      creature("tok", "ai", "Soldier", "", 1, 1, { token: true }),
    ] });
    const paused = settle(dispatchAction(s, castsOf(s, "flare")[0]));
    expect(paused.pendingChoice?.kind).toBe("sacrifice-choice");
    const offered = paused.pendingChoice.candidates.map((c) => c.id).sort();
    const after = settle(resolveSacrificeChoice(paused, "ogre"));
    const row = { offered, left: names(after, "ai") };
    console.log("  WITNESS flareTie", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["jace", "ogre"]);
    expect(row.left).toEqual(["Bear", "Jace", "Soldier"]);
  });

  it("a lone greatest is FORCED (no pause): the Ogre goes, the Bear stays; the alt cost is offered with no mana and a black nontoken creature", () => {
    const s = state({ hand: [FLARE], userPool: { B: 4 }, aiBf: [creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4), creature("bear", "ai", "Bear", "{1}{G}", 2, 2)] });
    const after = settle(dispatchAction(s, castsOf(s, "flare")[0]));
    expect(after.pendingChoice).toBeFalsy();
    expect(names(after, "ai")).toEqual(["Bear"]);
    const noMana = state({ hand: [FLARE], userBf: [creature("mine", "user", "Vampire", "{1}{B}", 2, 2, { colors: ["B"] })], aiBf: [creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4)] });
    expect(castsOf(noMana, "flare").length).toBeGreaterThan(0);
  });
});

describe("Contagion", () => {
  it("two -2/-1 counters on their 4/4 make it a 0/2 (per-axis deltas); one on each of two creatures shrinks both; the fallback prefers THEIR creatures for a harmful counter; the pitch is offered with no mana", () => {
    const mk = () => state({ hand: [CONTAGION, BLACK], userPool: { B: 5 }, userBf: [creature("mybear", "user", "My Bear", "{3}{G}{G}", 5, 5)], aiBf: [creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4), creature("bear", "ai", "Bear", "{1}{G}", 2, 2)] }); // MY creature is the BIGGEST — a side-blind fallback would pick it
    const s = mk();
    const paused = settle(dispatchAction(s, castsOf(s, "cont")[0]));
    expect(paused.pendingChoice).toMatchObject({ kind: "distribute-counters", counterType: "-2/-1", amount: 2 });
    const fallback = autoPickDistributeCounters(paused, paused.pendingChoice);
    const both = settle(resolveDistributeChoice(paused, [{ id: "ogre", type: "creature", amount: 2 }]));
    const s2 = mk();
    const paused2 = settle(dispatchAction(s2, castsOf(s2, "cont")[0]));
    const split = settle(resolveDistributeChoice(paused2, [{ id: "ogre", type: "creature", amount: 1 }, { id: "bear", type: "creature", amount: 1 }]));
    const row = {
      candidates: paused.pendingChoice.candidates.map((c) => c.id).sort(),
      fallbackIds: fallback.map((d) => d.id),
      ogreBoth: [permanentPower(both, "ogre"), permanentToughness(both, "ogre")],
      ogreSplit: [permanentPower(split, "ogre"), permanentToughness(split, "ogre")],
      bearSplit: split.players.ai.battlefield.some((p) => p.id === "bear") ? [permanentPower(split, "bear"), permanentToughness(split, "bear")] : "dead",
      pitchWithNoMana: castsOf(state({ hand: [CONTAGION, BLACK], aiBf: [creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4)] }), "cont").length,
    };
    console.log("  WITNESS contagion", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.candidates).toEqual(["bear", "mybear", "ogre"]);
    expect(row.fallbackIds.every((id) => id !== "mybear")).toBe(true);
    expect(row.ogreBoth).toEqual([0, 2]);
    expect(row.ogreSplit).toEqual([2, 3]);
    expect(row.bearSplit).toEqual([0, 1]);
    expect(row.pitchWithNoMana).toBeGreaterThan(0);
  });

  it("the LAYERED path is per-axis too: under their own anthem (+1/+1) an Ogre with two -2/-1 counters is 1/3", () => {
    const anthem = perm("anthem", "ai", { name: "Glorious Anthem", type: "Enchantment", oracle: "Creatures you control get +1/+1." });
    const s = state({ hand: [CONTAGION], userPool: { B: 5 }, aiBf: [anthem, creature("ogre", "ai", "Ogre", "{3}{R}", 4, 4)] });
    const paused = settle(dispatchAction(s, castsOf(s, "cont")[0]));
    const after = settle(resolveDistributeChoice(paused, [{ id: "ogre", type: "creature", amount: 2 }]));
    const row = { ogre: [permanentPower(after, "ogre"), permanentToughness(after, "ogre")] };
    console.log("  WITNESS contagionLayered", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ogre).toEqual([1, 3]);
  });
});
