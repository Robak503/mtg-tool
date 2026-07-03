/**
 * BENEVOLENT-HYDRA (enters-with-X + self-excluding counter-replacement + {T}/remove-counter activated ability).
 *
 * Benevolent Hydra ({X}{G}{G}) is three modeled clauses composed:
 *   1. "This creature enters with X +1/+1 counters on it."           → entersWithXCounters (SHIPPED)
 *   2. "If one or more +1/+1 counters would be put on ANOTHER creature you control, that many plus one +1/+1
 *      counters are put on it instead."                              → the additive (+1) counter-replacement,
 *      NOW carrying a SELF-EXCLUSION (CR 109.5 "another") so the +1 never lands on the Hydra ITSELF.
 *   3. "{T}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on ANOTHER target creature you
 *      control."                                                     → a {T}+remove-counter activated ability
 *      whose effect is the add-counter-on-own-target atom with excludeSource (the source is never a target).
 *
 * The two "another" restrictions are the CREED blockers this slice models faithfully:
 *   • the replacement (clause 2) must NOT boost counters placed on its own source — applyCounterDoubling now
 *     skips a self-excluding profile when the recipient permanent IS the source (recipientPermId threaded from
 *     addCounter). Over-applying it to the Hydra's own counters would be a FORBIDDEN mis-applied clause.
 *   • the activated ability (clause 3) must NOT offer the source as a target — enumerateTargets' creatureYouControl
 *     branch drops ctx.sourceId when the spec carries excludeSource.
 *
 * Real oracle verified against the bundled index (2026-07-03).
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { expandCastChoices } from "./effects/targeting.js";
import { doublerProfile, isModeledDoublerSentence, applyCounterDoubling } from "./replacementEffects.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, addCounter } from "./gameState.js";

const ORACLE =
  "This creature enters with X +1/+1 counters on it.\n" +
  "If one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead.\n" +
  "{T}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on another target creature you control.";
const HYDRA = { name: "Benevolent Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}", power: 1, toughness: 1, oracle: ORACLE };

describe("Benevolent Hydra — the flip", () => {
  it("classifies native-mixed (enters-with-X + counter-replacement + remove-counter activated, all modeled)", () => {
    expect(classifyCard(HYDRA)).toBe("native-mixed");
  });
});

describe("Benevolent Hydra — clause 3 (activated ability: 'another target creature you control')", () => {
  it("the effect parses HIGH to an own-target add-counter carrying excludeSource", () => {
    const p = parseEffectClause("Put a +1/+1 counter on another target creature you control", "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl", excludeSource: true }]);
  });
  it("the whole activated ability is fully modeled (cost {T}+remove-counter + HIGH effect)", () => {
    const ab = parseActivatedAbilities(HYDRA)[0];
    expect(ab.modeled).toBe(true);
    expect(ab.tapSelf).toBe(true);
    expect(ab.removeCounter).toEqual({ type: "+1/+1" });
  });
  it("target enumeration offers ANOTHER own creature but NEVER the source or an opponent's creature", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = createPermanent({ id: "hydra", card: { ...HYDRA, id: "hydra" }, controller: "user" });
    hydra.counters = { "+1/+1": 4 };
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const enemy = createPermanent({ id: "enemy", card: { id: "enemy", name: "Enemy", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [hydra, bear] }, ai: { ...s.players.ai, battlefield: [enemy] } } };
    const ab = parseActivatedAbilities(hydra.card)[0];
    const choices = expandCastChoices(s, "user", ab.program, [], { sourceId: "hydra" });
    const ids = new Set(choices.flatMap((c) => c.targets.map((t) => t.id)));
    expect(ids.has("bear")).toBe(true);    // another own creature — legal
    expect(ids.has("hydra")).toBe(false);  // the source itself — excluded (CR 109.5 "another")
    expect(ids.has("enemy")).toBe(false);  // an opponent's creature — never "you control"
  });
});

describe("Benevolent Hydra — clause 2 (self-excluding counter-replacement)", () => {
  it("the profile captures the additive +1 AND the self-exclusion", () => {
    expect(doublerProfile({ name: "Benevolent Hydra", type: "Creature — Hydra", oracle: ORACLE }).counter)
      .toEqual({ op: "additive", factor: 1, kind: "+1/+1", scope: "you", excludeSource: true });
  });
  it("counters on ANOTHER creature you control get +1; counters on the Hydra ITSELF do NOT (CR 109.5)", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = createPermanent({ id: "hydra", card: { ...HYDRA, id: "hydra" }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [hydra, bear] } } };
    // Bear (another creature you control) — base 2 → 3.
    expect(addCounter(s, { permanentId: "bear", type: "+1/+1", amount: 2 }).players.user.battlefield.find((p) => p.id === "bear").counters["+1/+1"]).toBe(3);
    // The Hydra ITSELF — base 2 → 2 (the replacement excludes its own source; over-applying would be a FP).
    expect(addCounter(s, { permanentId: "hydra", type: "+1/+1", amount: 2 }).players.user.battlefield.find((p) => p.id === "hydra").counters["+1/+1"]).toBe(2);
  });
  it("an OPPONENT's creature is never boosted (you-scope)", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = createPermanent({ id: "hydra", card: { ...HYDRA, id: "hydra" }, controller: "user" });
    const enemy = createPermanent({ id: "enemy", card: { id: "enemy", name: "Enemy", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [hydra] }, ai: { ...s.players.ai, battlefield: [enemy] } } };
    expect(addCounter(s, { permanentId: "enemy", type: "+1/+1", amount: 2 }).players.ai.battlefield.find((p) => p.id === "enemy").counters["+1/+1"]).toBe(2);
  });
  it("the replacement sentence is a modeled doubler sentence (stripped in the coverage whole-card check)", () => {
    expect(isModeledDoublerSentence("if one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead")).toBe(true);
  });
});

describe("Benevolent Hydra — CREED near-misses (must NOT flip / must NOT mis-apply)", () => {
  it("a NON-self-excluding 'a creature you control' additive still applies to its own source (Hardened Scales unchanged)", () => {
    // Hardened Scales says "a creature you control" (no 'another'), so its +1 DOES apply to itself too. The
    // self-exclusion must be scoped to the 'another'/'other' wording only — never leak onto the plain form.
    const p = doublerProfile({ name: "Hardened Scales", type: "Enchantment", oracle: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." });
    expect(p.counter.excludeSource).toBeUndefined();
    const s = { players: { p1: { battlefield: [{ id: "hs", controller: "p1", card: { name: "Hardened Scales", type: "Enchantment", oracle: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." }, counters: {} }] } } };
    // With no recipientPermId AND with the recipient BEING the source, a non-self-excluding profile still fires (base 2 → 3).
    expect(applyCounterDoubling(s, "p1", "+1/+1", 2, "hs")).toBe(3);
  });
  it("the plain 'target creature you control' add-counter (no 'another') carries NO excludeSource", () => {
    const p = parseEffectClause("Put a +1/+1 counter on target creature you control", "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].excludeSource).toBeUndefined();
  });
  it("an 'another target creature' WITHOUT 'you control' (opponent-legal) is NOT this modeled own-target form → LOW", () => {
    // The engine only models the OWN-side 'another target creature you control'. A bare 'another target
    // creature' (any controller) would need opponent-side enumeration + a distinctness guard the atom doesn't
    // carry, so it stays LOW → Arbiter (a SAFE false-negative, never a wrong partial).
    const p = parseEffectClause("Put a +1/+1 counter on another target creature", "Instant", {});
    expect(programConfidence(p)).not.toBe("high");
  });
});
