/**
 * chosenType.test.js — the CHOOSE-A-CREATURE-TYPE state primitive + Kindred Discovery.
 *
 * Kindred Discovery ("As this enchantment enters, choose a creature type. Whenever a creature you control of
 * the chosen type enters or attacks, draw a card.") needs a reusable DYNAMIC-subtype primitive:
 *   1. ETB AUTO-PICK — resolvers.enterPermanent deterministically chooses the controller's most-common
 *      creature subtype (battlefield → library → "Human" fallback) and stores it DURABLY as perm.chosenType
 *      (a plain string, so it survives the trivial-JSON serialize round-trip and is never re-picked).
 *   2. The chosenTypeEntersOrAttacks trigger reads the SOURCE's stored chosenType — fires on BOTH the enters
 *      AND the attacks events, ONLY for a creature of the chosen type the source's controller controls. A
 *      Changeling (CR 702.73a — every creature type) counts; a non-chosen-type creature does NOT.
 *
 * CREED: the card only flips native if the WHOLE thing works (type stored AND the enters/attacks-of-chosen-
 * type draw actually fires for the right creatures and NOT the wrong ones). A near-miss (Bloodline Pretender's
 * "another creature … enters" — enters-only, no attacks) stays body-only (Arbiter) — a SAFE false-negative.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { serializeState, deserializeState } from "./serialization.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KINDRED_ORACLE =
  "As this enchantment enters, choose a creature type.\n" +
  "Whenever a creature you control of the chosen type enters or attacks, draw a card.";
const KINDRED = { id: "card-kd", name: "Kindred Discovery", type: "Enchantment", oracle: KINDRED_ORACLE };

function baseState(over = {}) {
  const s = createGameState({
    userDeck: [{ name: "T1", type: "Instant", oracle: "" }, { name: "T2", type: "Instant", oracle: "" }],
    aiDeck: [{ name: "A1", type: "Instant", oracle: "" }],
  });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function creaturePerm(id, name, typeLine, controller = "user") {
  return createPermanent({ id, card: { name, type: typeLine, power: 2, toughness: 2, oracle: "" }, controller });
}
// A Kindred Discovery permanent already on `controller`'s battlefield with chosenType pre-set (the ETB
// auto-pick is exercised separately — this isolates the trigger-firing behavior from the pick heuristic).
function withKindred(chosenType, extra = [], over = {}) {
  let s = baseState(over);
  const kd = { ...createPermanent({ id: "kd", card: KINDRED, controller: "user" }), chosenType };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [kd, ...extra] }, ai: { ...s.players.ai, life: 20 } } };
}
// Resolve every pending trigger and report (#triggers enqueued, hand delta for `who`).
function fireAndDraw(state, who) {
  const before = state.players[who].hand.length;
  let s = flushTriggers(state);
  const enqueued = (state.pendingTriggers || []).length;
  while (s.stack && s.stack.length) s = resolveTopOfStack(s);
  return { enqueued, delta: s.players[who].hand.length - before, state: s };
}

describe("Kindred Discovery — classification", () => {
  it("classifies native-trigger (the whole card is modeled)", () => {
    expect(classifyCard(KINDRED)).toBe("native-trigger");
  });

  it("FN boundary — an enters-ONLY 'another … of the chosen type' chooser stays body-only (Bloodline Pretender shape)", () => {
    // No "attacks" half, and "another …" — NOT the exact Kindred shape → undetected → Arbiter (SAFE).
    const bloodline = {
      name: "Bloodline Pretender",
      type: "Creature — Shapeshifter",
      oracle: "Changeling (This card is every creature type.)\nAs this creature enters, choose a creature type.\nWhenever another creature you control of the chosen type enters, put a +1/+1 counter on this creature.",
    };
    expect(classifyCard(bloodline)).toBe("body-only");
  });

  it("FN boundary — an UNMODELED anthem chooser ('All creatures of the chosen type get -1/-1') stays body-only (Engineered Plague)", () => {
    // The flat chosen-type anthem branch (chosenTypeFlatAnthem) deliberately models only the determiner-LESS
    // "Creatures [you control] of the chosen type …" form; an "All …" determiner debuff is NOT modeled, so the
    // chooser without a modeled trigger stays body-only — this trigger primitive never claims it. (The flat
    // POSITIVE-anthem flips — Shared Triumph / Rally the Ranks — are asserted in chosenTypeFlatAnthem.test.js.)
    const plague = {
      name: "Engineered Plague",
      type: "Enchantment",
      oracle: "As this enchantment enters, choose a creature type.\nAll creatures of the chosen type get -1/-1.",
    };
    expect(classifyCard(plague)).toBe("body-only");
  });
});

describe("Kindred Discovery — ETB auto-pick + persistence", () => {
  it("auto-picks the controller's MOST-COMMON battlefield creature subtype and stores it on the permanent", () => {
    // 2 Elves + 1 Goblin → Elf wins.
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      creaturePerm("e1", "Elf A", "Creature — Elf"),
      creaturePerm("e2", "Elf B", "Creature — Elf Warrior"),
      creaturePerm("g1", "Gob", "Creature — Goblin"),
    ] } } };
    s = enterPermanent(s, KINDRED, "user");
    const kd = s.players.user.battlefield.find((p) => p.card.name === "Kindred Discovery");
    expect(kd.chosenType).toBe("Elf");
  });

  it("falls back to the LIBRARY's most-common creature subtype when the battlefield has no creatures", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [], library: [
      { name: "Lib Merfolk 1", type: "Creature — Merfolk", oracle: "" },
      { name: "Lib Merfolk 2", type: "Creature — Merfolk Wizard", oracle: "" },
      { name: "Lib Bear", type: "Creature — Bear", oracle: "" },
      { name: "Lib Land", type: "Land", oracle: "" },
    ] } } };
    s = enterPermanent(s, KINDRED, "user");
    const kd = s.players.user.battlefield.find((p) => p.card.name === "Kindred Discovery");
    expect(kd.chosenType).toBe("Merfolk");
  });

  it("falls back to a safe non-null type ('Human') when the controller has no creatures anywhere", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [], library: [{ name: "Lib Land", type: "Land", oracle: "" }] } } };
    s = enterPermanent(s, KINDRED, "user");
    const kd = s.players.user.battlefield.find((p) => p.card.name === "Kindred Discovery");
    expect(kd.chosenType).toBe("Human");
  });

  it("chosenType SERIALIZES (survives a save/load round-trip) and PERSISTS (a later entry never re-picks it)", () => {
    let s = withKindred("Elf");
    // Round-trip the whole state.
    const restored = deserializeState(serializeState(s));
    const kd = restored.players.user.battlefield.find((p) => p.card.name === "Kindred Discovery");
    expect(kd.chosenType).toBe("Elf");
    // A new creature entering does NOT change the stored type.
    let s2 = enterPermanent(restored, { id: "c-new", name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, "user");
    const kd2 = s2.players.user.battlefield.find((p) => p.card.name === "Kindred Discovery");
    expect(kd2.chosenType).toBe("Elf");
  });
});

describe("Kindred Discovery — the enters-or-attacks-of-chosen-type draw fires correctly", () => {
  it("a chosen-type creature ENTERING → the controller draws", () => {
    let s = withKindred("Elf");
    s = enterPermanent(s, { id: "c-e", name: "Elf C", type: "Creature — Elf", power: 1, toughness: 1, oracle: "" }, "user");
    const r = fireAndDraw(s, "user");
    expect(r.enqueued).toBe(1);
    expect(r.delta).toBe(1);
  });

  it("the SAME creature ATTACKING → the controller draws again", () => {
    let s = withKindred("Elf", [creaturePerm("atk", "Elf Atk", "Creature — Elf Warrior")], { phase: "combat", step: "combat-declare-attackers" });
    s = { ...s, combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }] } };
    s = checkAttackTriggers(s);
    const r = fireAndDraw(s, "user");
    expect(r.enqueued).toBe(1);
    expect(r.delta).toBe(1);
  });

  it("CREED — a NON-chosen-type creature entering → NO trigger, NO draw", () => {
    let s = withKindred("Elf");
    s = enterPermanent(s, { id: "c-g", name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, "user");
    const r = fireAndDraw(s, "user");
    expect(r.enqueued).toBe(0);
    expect(r.delta).toBe(0);
  });

  it("CREED — a NON-chosen-type creature attacking → NO trigger", () => {
    let s = withKindred("Elf", [creaturePerm("gob", "Goblin Atk", "Creature — Goblin")], { phase: "combat", step: "combat-declare-attackers" });
    s = { ...s, combat: { attackers: [{ permanentId: "gob", attackingPlayer: "user", defender: "ai" }] } };
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("a CHANGELING counts as the chosen type (CR 702.73a) — entering → draw", () => {
    let s = withKindred("Elf");
    s = enterPermanent(s, { id: "c-ch", name: "Mistform Ultimus-ish", type: "Creature — Shapeshifter", power: 1, toughness: 1, oracle: "Changeling (This card is every creature type.)" }, "user");
    const r = fireAndDraw(s, "user");
    expect(r.enqueued).toBe(1);
    expect(r.delta).toBe(1);
  });

  it("CREED — an OPPONENT's chosen-type creature entering does NOT fire the controller's Kindred", () => {
    let s = withKindred("Elf");
    s = enterPermanent(s, { id: "c-oe", name: "Opp Elf", type: "Creature — Elf", power: 1, toughness: 1, oracle: "" }, "ai");
    // The user's Kindred watcher must not have fired for the opponent's Elf.
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("CREED — if chosenType is unset (malformed source) the trigger never fires (SAFE no-op)", () => {
    // A Kindred permanent with no chosenType (e.g. a hand-rolled snapshot) — permHasChosenType is false.
    let s = baseState();
    const kdNoType = createPermanent({ id: "kd2", card: KINDRED, controller: "user" }); // no chosenType
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [kdNoType] } } };
    s = enterPermanent(s, { id: "c-e", name: "Elf C", type: "Creature — Elf", power: 1, toughness: 1, oracle: "" }, "user");
    expect((s.pendingTriggers || []).length).toBe(0);
  });
});
