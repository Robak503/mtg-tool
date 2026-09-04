/**
 * xMagnitudeActivation.test.js — ④-AO (2026-09-04 night): X-SCALED-MAGNITUDE activated abilities — "{X}, {T}: You gain X
 * life" (Oracle of Nectars), "{X}{G}{G}: deals X damage to each creature with flying" (Silklash Spider), "{X}{R}, {T},
 * Sacrifice: deals X damage to any target" (Cinder Elemental), "{X}{R}{G}, {T}: target creature gets +X/+0 and gains
 * trample" (Kessig Wolf Run). The activated {X} lane admitted only TARGETS-PER-X programs (γ1f); an amountX magnitude
 * parsed xSpell but had no runtime path, so the gate refused it. The lane now expands X from 1 to the affordable ceiling
 * for a magnitude program too (the same loop, the same xValue on the action → params.xValue → ctx.xValue — the sacX
 * precedent), and the classifier gate admits xSpell beside targetCountX so the metric and the runtime cannot drift.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NECTARS = { id: "c-on", name: "Oracle of Nectars", type: "Creature — Elf Cleric", mana: "{2}{G/W}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "{X}, {T}: You gain X life." };
const SILKLASH = { id: "c-ss", name: "Silklash Spider", type: "Creature — Spider", mana: "{3}{G}{G}", cmc: 5, power: 2, toughness: 7, keywords: ["Reach"],
  oracle: "Reach\n{X}{G}{G}: This creature deals X damage to each creature with flying." };
const CINDER = { id: "c-ce", name: "Cinder Elemental", type: "Creature — Elemental", mana: "{3}{R}", cmc: 4, power: 2, toughness: 2, keywords: [],
  oracle: "{X}{R}, {T}, Sacrifice this creature: It deals X damage to any target." };
const KESSIG = { id: "c-kw", name: "Kessig Wolf Run", type: "Land", mana: "", cmc: 0, keywords: [],
  oracle: "{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn." };

const critter = (id, name, controller, keywords = []) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bird", mana: "{1}{W}", cmc: 2, power: 2, toughness: 4, keywords, oracle: keywords.join(", ") }, controller, summoningSick: false });

function mainPhase(userPerms, pool, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: userPerms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const activations = (s, sourceId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId);

const REVELATION = { id: "h-sr", name: "Sphinx's Revelation", type: "Instant", mana: "{X}{W}{U}{U}", mana_cost: "{X}{W}{U}{U}", cmc: 3, keywords: [],
  oracle: "You gain X life and draw X cards." };
const DEATH_GRASP = { id: "h-dg", name: "Death Grasp", type: "Sorcery", mana: "{X}{W}{B}", mana_cost: "{X}{W}{B}", cmc: 2, keywords: [],
  oracle: "Death Grasp deals X damage to any target. You gain X life." };

describe("the tiers", () => {
  it("⭐ the four magnitude carriers classify native", () => {
    expect(classifyCard(NECTARS)).toBe("native-activated");
    expect(classifyCard(SILKLASH)).toBe("native-activated");
    expect(classifyCard(CINDER)).toBe("native-activated");
    expect(classifyCard(KESSIG)).toBe("land");
  });
  it("⭐ 'you gain X life' also unparks the X SPELLS that sat on that one clause", () => {
    expect(classifyCard(REVELATION)).toBe("native-spell");
    expect(classifyCard(DEATH_GRASP)).toBe("native-spell");
  });
});

describe("runtime — the spell path reads the same X for the life", () => {
  it("⭐ Sphinx's Revelation cast for X = 2 draws 2 and gains 2", () => {
    const s0 = mainPhase([], { W: 1, U: 2, C: 2 });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [REVELATION], library: [1, 2, 3, 4].map((i) => ({ id: `lib${i}`, name: `Lib${i}`, type: "Instant", cmc: 1, keywords: [], oracle: "" })) } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-sr");
    expect(casts.map((a) => a.xValue).sort()).toEqual([1, 2]);
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.xValue === 2)));
    expect(resolved.players.user.life).toBe(s.players.user.life + 2);
    expect(resolved.players.user.hand.map((c) => c.id)).toEqual(["lib1", "lib2"]);
  });
});

describe("runtime — X is chosen from 1 to the affordable ceiling, and the effect scales with it", () => {
  it("⭐ Oracle of Nectars with three mana: X = 1, 2, 3 offered; X = 2 resolves to +2 life", () => {
    const s = mainPhase([createPermanent({ id: "on", card: NECTARS, controller: "user", summoningSick: false })], { C: 3 });
    const acts = activations(s, "on");
    expect(acts.map((a) => a.xValue).sort()).toEqual([1, 2, 3]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.xValue === 2)));
    expect(resolved.players.user.life).toBe(s.players.user.life + 2);
  });

  it("⭐ Silklash Spider: X = 2 deals 2 to each flyer and nothing to the walker", () => {
    const s = mainPhase([createPermanent({ id: "ss", card: SILKLASH, controller: "user", summoningSick: false }), critter("my-bird", "My Bird", "user", ["Flying"])],
      { G: 2, C: 3 }, [critter("their-bird", "Their Bird", "ai", ["Flying"]), critter("walker", "Walker", "ai")]);
    const acts = activations(s, "ss");
    expect(Math.max(...acts.map((a) => a.xValue))).toBe(3);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.xValue === 2)));
    expect(resolved.players.ai.battlefield.find((p) => p.id === "their-bird").damageMarked).toBe(2);
    expect(resolved.players.user.battlefield.find((p) => p.id === "my-bird").damageMarked).toBe(2);
    expect(resolved.players.ai.battlefield.find((p) => p.id === "walker").damageMarked).toBe(0);
  });

  it("⭐ Cinder Elemental: the sacrifice cost is paid and X damage lands on the chosen target; with no mana beyond {R} nothing is offered", () => {
    const s = mainPhase([createPermanent({ id: "ce", card: CINDER, controller: "user", summoningSick: false })], { R: 1, C: 2 }, [critter("victim", "Victim", "ai")]);
    const acts = activations(s, "ce").filter((a) => a.targets?.[0]?.id === "victim");
    expect(acts.map((a) => a.xValue).sort()).toEqual([1, 2]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.xValue === 2)));
    expect(resolved.players.ai.battlefield.find((p) => p.id === "victim").damageMarked).toBe(2);
    expect(resolved.players.user.battlefield.find((p) => p.id === "ce")).toBeUndefined();
    expect(activations(mainPhase([createPermanent({ id: "ce", card: CINDER, controller: "user", summoningSick: false })], { R: 1 }, [critter("victim", "Victim", "ai")]), "ce")).toEqual([]);
  });

  it("⭐ Kessig Wolf Run (a land): X = 3 gives the target +3/+0 and trample", () => {
    const s = mainPhase([createPermanent({ id: "kw", card: KESSIG, controller: "user", summoningSick: false }), critter("bear", "Bear", "user")], { R: 1, G: 1, C: 3 });
    const acts = activations(s, "kw").filter((a) => a.targets?.[0]?.id === "bear");
    expect(acts.map((a) => a.xValue).sort()).toEqual([1, 2, 3]);
    const resolved = resolveTopOfStack(dispatchAction(s, acts.find((a) => a.xValue === 3)));
    expect(permanentPower(resolved, "bear")).toBe(5);
  });
});
