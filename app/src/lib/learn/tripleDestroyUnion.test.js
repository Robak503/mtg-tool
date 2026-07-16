/**
 * tripleDestroyUnion.test.js — BLITZ BW-1: the TRIPLE union with a flying-bound creature alternative,
 * "(Destroy|Exile) target artifact, enchantment, or creature with flying." (destroy: Broken Wings /
 * Return to the Earth / Airship Crash; exile: Shoot Down — both verbs corpus-evidenced, probed 2026-07-16).
 * The "with flying" restriction binds ONLY the creature alternative, so the dedicated
 * artifactOrEnchantmentOrFlyingCreature targetType carries the union into enumeration, where the creature
 * arm is gated LAYER-AWARE via permanentHasKeyword (printed ∪ keyword counter ∪ layer-6 grants) — a ground
 * creature is NEVER offered (CR 601.2c + CREED FP-forbidden). Targets tag { type: "permanent" } (the proven
 * creatureOrArtifact convention). Listed in PERMANENT_TARGET_TYPES so the trigger-flush gate keeps treating
 * it as chosen-permanent removal. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence, programContainsChosenPermanentRemoval } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BROKEN_WINGS = { id: "c-bw", name: "Broken Wings", type: "Instant", mana: "{2}{G}", oracle: "Destroy target artifact, enchantment, or creature with flying." };
const RETURN_TO_THE_EARTH = { id: "c-rte", name: "Return to the Earth", type: "Instant", mana: "{3}{G}", oracle: "Destroy target artifact, enchantment, or creature with flying." };
const AIRSHIP_CRASH = { id: "c-ac", name: "Airship Crash", type: "Instant", mana: "{2}{G}", oracle: "Destroy target artifact, enchantment, or creature with flying.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const SHOOT_DOWN = { id: "c-sd", name: "Shoot Down", type: "Sorcery", mana: "{3}{G}", oracle: "Exile target artifact, enchantment, or creature with flying." };

const DESTROY_ATOM = { op: "destroy", targetType: "artifactOrEnchantmentOrFlyingCreature", restrictions: [] };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}
const flyer = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bird", power: 1, toughness: 1, oracle: "Flying" }, controller: "ai" });
const ground = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
const artifact = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Artifact", oracle: "" }, controller: "ai" });
const enchantment = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Enchantment", oracle: "" }, controller: "ai" });

describe("BW-1 parser — both verbs parse the triple union; near-misses stay LOW", () => {
  it("destroy + exile parse to the dedicated targetType", () => {
    expect(parseEffectProgram(BROKEN_WINGS).atoms).toEqual([DESTROY_ATOM]);
    expect(parseEffectProgram(SHOOT_DOWN).atoms).toEqual([{ op: "exile", targetType: "artifactOrEnchantmentOrFlyingCreature", restrictions: [] }]);
  });
  it("FN guards: a different tail / the 4-way battle union / a reversed ordering / a controller scope stays LOW", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Instant", oracle }))).toBe("low");
    low("Exile target artifact, enchantment, or creature with power 4 or greater.");            // Exorcise — a different tail
    low("Destroy target artifact, battle, enchantment, or creature with flying.");              // Atraxa's Fall — 4-way with battle
    low("Destroy target enchantment, artifact, or creature with flying.");                      // unevidenced ordering
    low("Destroy target artifact, enchantment, or creature with flying an opponent controls."); // unevidenced scope rider
  });
  it("classify: the destroy carriers + the exile twin flip native-spell; the proliferate rider stays parked", () => {
    expect(classifyCard(BROKEN_WINGS)).toBe("native-spell");
    expect(classifyCard(RETURN_TO_THE_EARTH)).toBe("native-spell");
    expect(classifyCard(AIRSHIP_CRASH)).toBe("native-spell");   // Cycling {2} is a modeled hand-ability line
    expect(classifyCard(SHOOT_DOWN)).toBe("native-spell");
    expect(classifyCard({ name: "Carnivorous Canopy", type: "Sorcery", mana: "{2}{G}", // real oracle — conditional proliferate rider
      oracle: "Destroy target artifact, enchantment, or creature with flying. If that permanent's mana value was 3 or less, proliferate." })).toBe("arbiter-spell");
  });
  it("stays gated as chosen-permanent removal (the trigger-flush gate)", () => {
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(BROKEN_WINGS))).toBe(true);
  });
});

describe("BW-1 enumeration — artifacts + enchantments + ONLY flying creatures (layer-aware)", () => {
  it("offers artifact/enchantment/flyer; a ground creature is NEVER offered", () => {
    let s = mainState();
    s = withPlayerBits(s, "ai", { battlefield: [flyer("p-fly", "Bird"), ground("p-bear", "Bear"), artifact("p-art", "Mox"), enchantment("p-enc", "Seal")] });
    const ids = enumerateTargets(s, "user", DESTROY_ATOM).map((t) => t.id).sort();
    expect(ids).toEqual(["p-art", "p-enc", "p-fly"]);
  });
  it("a GRANTED flyer (keyword counter — CR 613 layer 6-adjacent) IS a legal creature target", () => {
    let s = mainState();
    const granted = { ...ground("p-gr", "Grounded-then-granted"), counters: { flying: 1 } };
    s = withPlayerBits(s, "ai", { battlefield: [granted, ground("p-bear", "Bear")] });
    const ids = enumerateTargets(s, "user", DESTROY_ATOM).map((t) => t.id);
    expect(ids).toEqual(["p-gr"]); // the granted flyer only — the plain Bear never
  });
  it("a DFC's combined type line is never trusted (safe omission, mirrors addPermanents)", () => {
    let s = mainState();
    const dfc = createPermanent({ id: "p-dfc", card: { id: "c-dfc", name: "DFC", type: "Artifact // Creature — Construct", oracle: "" }, controller: "ai" });
    s = withPlayerBits(s, "ai", { battlefield: [dfc, artifact("p-art", "Mox")] });
    expect(enumerateTargets(s, "user", DESTROY_ATOM).map((t) => t.id)).toEqual(["p-art"]);
  });
});

describe("BW-1 runtime — destroy and exile resolve against each union member", () => {
  function castAt(s, cardId, targetId) {
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === cardId && a.targets?.[0]?.id === targetId);
    expect(act).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, act));
  }

  it("Broken Wings destroys a FLYING creature (it dies to the graveyard); the ground creature was never a cast option", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [BROKEN_WINGS], manaPool: { ...s.players.user.manaPool, C: 2, G: 1 } });
    s = withPlayerBits(s, "ai", { battlefield: [flyer("p-fly", "Bird"), ground("p-bear", "Bear")] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-bw");
    expect(casts.map((a) => a.targets?.[0]?.id)).toEqual(["p-fly"]); // the flyer is the ONLY offered target
    s = castAt(s, "c-bw", "p-fly");
    expect(s.players.ai.battlefield.some((p) => p.id === "p-fly")).toBe(false);
    expect(s.players.ai.graveyard.some((c) => c.name === "Bird")).toBe(true);   // destroyed → its owner's graveyard
    expect(s.players.ai.battlefield.some((p) => p.id === "p-bear")).toBe(true); // the ground creature untouched
  });

  it("Broken Wings destroys an ARTIFACT (no flying needed on the non-creature arms)", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [BROKEN_WINGS], manaPool: { ...s.players.user.manaPool, C: 2, G: 1 } });
    s = withPlayerBits(s, "ai", { battlefield: [artifact("p-art", "Mox")] });
    s = castAt(s, "c-bw", "p-art");
    expect(s.players.ai.battlefield.some((p) => p.id === "p-art")).toBe(false);
    expect(s.players.ai.graveyard.some((c) => c.name === "Mox")).toBe(true);
  });

  it("Shoot Down EXILES an enchantment (the exile twin shares the union)", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [SHOOT_DOWN], manaPool: { ...s.players.user.manaPool, C: 3, G: 1 } });
    s = withPlayerBits(s, "ai", { battlefield: [enchantment("p-enc", "Seal")] });
    s = castAt(s, "c-sd", "p-enc");
    expect(s.players.ai.battlefield.some((p) => p.id === "p-enc")).toBe(false);
    expect(s.players.ai.exile.some((c) => c.name === "Seal")).toBe(true);       // exiled, not graveyard
    expect(s.players.ai.graveyard.some((c) => c.name === "Seal")).toBe(false);
  });
});
