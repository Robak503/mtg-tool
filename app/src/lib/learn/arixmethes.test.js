/**
 * arixmethes.test.js — ARIXMETHES, SLUMBERING ISLE (a Legendary Creature — Kraken that enters tapped with
 * five slumber counters, is a LAND and NOT a creature while it has a slumber counter, has a "whenever you cast
 * a spell, you may remove a slumber counter" cast trigger, and taps for {G}{U}).
 *
 * The card exercises four modeled seams, each pinned here:
 *   1. ENTERS-WITH-NAMED-COUNTERS (entersWithNamedCounters + the ETB resolver) — enters with 5 slumber counters.
 *   2. COUNTER-GATED TYPE-CHANGE (parseStaticAbilities → gated layer-4 addCardType Land + removeCardType
 *      Creature; layers.gateMet re-reads the slumber pile live) — a land/not-a-creature until counters hit 0.
 *   3. REMOVE-NAMED-COUNTER-SELF atom + the trailing-self-name rewrite (triggerRoutesNatively) — the cast
 *      trigger removes a slumber counter.
 *   4. The mana ability {T}: Add {G}{U} (manaProduction) — pre-existing, credited by hasManaAbility.
 *
 * Plus the classify flip (body-only → a native tier) and a CREED near-miss (an unmodeled type-change gate
 * counter keeps the card non-native — no fabricated flip).
 */
import { describe, it, expect } from "vitest";
import { createPermanent, createGameState, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities, entersWithNamedCounters } from "./staticAbilityParser.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { deriveCharacteristics, permanentIsCreature, permanentTypes } from "./layers.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { removeNamedCounterSelfClauseParser } from "./effects/atoms/counters.js";

const ORACLE =
  "Arixmethes enters tapped with five slumber counters on it.\n" +
  "As long as Arixmethes has a slumber counter on it, it's a land. (It's not a creature.)\n" +
  "Whenever you cast a spell, you may remove a slumber counter from Arixmethes.\n" +
  "{T}: Add {G}{U}.";
const CARD = { name: "Arixmethes, Slumbering Isle", type: "Legendary Creature — Kraken", oracle: ORACLE };

// Put Arixmethes on the battlefield with a given slumber count so the layer engine can read it.
function boardWith(slumber) {
  _resetIdsForTests();
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = createPermanent({
    card: { id: "arix", name: CARD.name, power: 6, toughness: 6, type_line: CARD.type, oracle: ORACLE },
    controller: "user",
  });
  const withCounters = { ...perm, counters: { ...perm.counters, slumber } };
  return {
    state: { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [withCounters] } } },
    id: withCounters.id,
  };
}

describe("ARIXMETHES — enters-with-named-counters (slumber)", () => {
  it("entersWithNamedCounters reads the five slumber counters", () => {
    expect(entersWithNamedCounters(CARD)).toEqual({ type: "slumber", n: 5 });
  });
  it("does NOT match +1/+1, fade/time, loyalty, or a conditional/variable count", () => {
    expect(entersWithNamedCounters({ oracle: "enters with two +1/+1 counters on it" })).toBeNull();
    expect(entersWithNamedCounters({ oracle: "Vanishing 3" })).toBeNull(); // no "enters with N time" text
    expect(entersWithNamedCounters({ oracle: "enters with three time counters on it" })).toBeNull(); // reserved kind
    expect(entersWithNamedCounters({ oracle: "enters with a charge counter on it for each artifact you control" })).toBeNull();
  });
  it("the PERMANENT_ETB resolver places five slumber counters as it enters", async () => {
    _resetIdsForTests();
    const { RESOLVERS, RESOLVER_KEYS } = await import("./resolvers.js");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const obj = {
      id: "stk", kind: "spell", controller: "user", source: { name: CARD.name },
      payload: { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card: { id: "arix", name: CARD.name, power: 6, toughness: 6, type_line: CARD.type, oracle: ORACLE }, controller: "user" } },
    };
    s = RESOLVERS[RESOLVER_KEYS.PERMANENT_ETB](s, obj);
    const perm = s.players.user.battlefield.find((p) => p.card.name === CARD.name);
    expect(perm.counters.slumber).toBe(5);
    expect(perm.tapped).toBe(true); // "enters tapped …"
  });
});

describe("ARIXMETHES — counter-gated type change (layer 4)", () => {
  it("emits gated layer-4 addCardType Land + removeCardType Creature", () => {
    const statics = parseStaticAbilities(CARD).filter((e) => e.layer === 4);
    const land = statics.find((e) => e.op.layerOp === "addCardType");
    const noCreature = statics.find((e) => e.op.layerOp === "removeCardType");
    expect(land?.op.types).toEqual(["Land"]);
    expect(noCreature?.op.removeType).toBe("Creature");
    // Both gated on the SAME slumber-presence gate.
    for (const e of [land, noCreature]) {
      expect(e.op.gate.countSpec).toEqual({ kind: "countersOnSelf", counterType: "slumber" });
      expect(e.op.gate.atLeast).toBe(1);
    }
  });
  it("WITH slumber counters: it's a land and NOT a creature", () => {
    const { state, id } = boardWith(5);
    const { types } = permanentTypes(state, id);
    expect(types).toContain("Land");
    expect(types).not.toContain("Creature");
    expect(permanentIsCreature(state, id)).toBe(false);
  });
  it("with ONE slumber counter left: still a land, still not a creature (presence gate ≥ 1)", () => {
    const { state, id } = boardWith(1);
    expect(permanentIsCreature(state, id)).toBe(false);
    expect(permanentTypes(state, id).types).toContain("Land");
  });
  it("at ZERO slumber counters: the gate closes — it's a creature again, not a land", () => {
    const { state, id } = boardWith(0);
    const { types } = permanentTypes(state, id);
    expect(permanentIsCreature(state, id)).toBe(true);
    expect(types).toContain("Creature");
    expect(types).not.toContain("Land");
  });
});

describe("ARIXMETHES — remove-named-counter-self (cast trigger)", () => {
  it("removeNamedCounterSelfClauseParser parses the normalized self forms", () => {
    expect(removeNamedCounterSelfClauseParser("you may remove a slumber counter from this creature"))
      .toEqual({ op: "remove-named-counter-self", counterType: "slumber", amount: 1 });
    expect(removeNamedCounterSelfClauseParser("remove a slumber counter from it"))
      .toEqual({ op: "remove-named-counter-self", counterType: "slumber", amount: 1 });
    // a ±1/+1 form is NOT this atom (owned by the creature-self +1/+1 path)
    expect(removeNamedCounterSelfClauseParser("remove a +1/+1 counter from this creature")).toBeNull();
  });
  it("the effect clause parses HIGH to the remove-named-counter-self atom", () => {
    const r = parseEffectClause("you may remove a slumber counter from this creature");
    expect(r.confidence).toBe("high");
    expect(r.atoms.map((a) => a.op)).toContain("remove-named-counter-self");
  });
  it("the cast trigger (with the trailing self-name) routes natively", () => {
    const t = detectTriggers(CARD);
    const cast = t.find((x) => x.event === "cast");
    expect(cast).toBeTruthy();
    expect(cast.optional).toBe(true);
    expect(cast.effectClause).toBe("you may remove a slumber counter from this creature");
    expect(triggerRoutesNatively(cast)).toBe(true);
  });
  it("the atom removes exactly one slumber counter (and no-ops at zero — CR 122.3)", async () => {
    const { applyRemoveNamedCounterSelf } = await import("./effects/atoms/counters.js");
    const { state, id } = boardWith(5);
    const after = applyRemoveNamedCounterSelf(state, { op: "remove-named-counter-self", counterType: "slumber", amount: 1 }, { sourceId: id });
    expect(after.players.user.battlefield.find((p) => p.id === id).counters.slumber).toBe(4);
    // at zero → a clean no-op (never a negative pile)
    const { state: s0, id: id0 } = boardWith(0);
    const noop = applyRemoveNamedCounterSelf(s0, { op: "remove-named-counter-self", counterType: "slumber", amount: 1 }, { sourceId: id0 });
    expect(noop.players.user.battlefield.find((p) => p.id === id0).counters.slumber || 0).toBe(0);
  });
});

describe("ARIXMETHES — classification flip + CREED near-miss", () => {
  it("classifies to a NATIVE tier (was body-only)", () => {
    const tier = classifyCard(CARD);
    expect(isNativeTier(tier)).toBe(true);
  });
  it("end-to-end: enters as a land, a cast trigger removes the last counter, and it becomes a creature", async () => {
    _resetIdsForTests();
    const { RESOLVERS, RESOLVER_KEYS } = await import("./resolvers.js");
    const { applyRemoveNamedCounterSelf } = await import("./effects/atoms/counters.js");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const obj = {
      id: "stk", kind: "spell", controller: "user", source: { name: CARD.name },
      payload: { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card: { id: "arix", name: CARD.name, power: 6, toughness: 6, type_line: CARD.type, oracle: ORACLE }, controller: "user" } },
    };
    s = RESOLVERS[RESOLVER_KEYS.PERMANENT_ETB](s, obj);
    const id = s.players.user.battlefield.find((p) => p.card.name === CARD.name).id;
    expect(permanentIsCreature(s, id)).toBe(false); // enters as a land
    // Remove all five slumber counters (five cast triggers over the game).
    for (let i = 0; i < 5; i++) {
      s = applyRemoveNamedCounterSelf(s, { op: "remove-named-counter-self", counterType: "slumber", amount: 1 }, { sourceId: id });
    }
    expect(s.players.user.battlefield.find((p) => p.id === id).counters.slumber || 0).toBe(0);
    expect(permanentIsCreature(s, id)).toBe(true); // now a 6/6 creature
    expect(deriveCharacteristics(s, id).power).toBe(6);
  });
  it("CREED: a card whose type-change gate references an UNMODELED counter shape is not flipped by the type-change (safe FN)", () => {
    // "as long as it has a +1/+1 counter on it, it's a land" — the presence-gate parser rejects the ±1/+1
    // (P/T) form, so NO gated type-change is emitted (the +1/+1 gate belongs to the P/T family, not a
    // named-presence type swap). No fabricated land/not-creature grant.
    const weird = { name: "Fake", type: "Creature — Test", oracle: "As long as Fake has a +1/+1 counter on it, it's a land." };
    const l4 = parseStaticAbilities(weird).filter((e) => e.layer === 4);
    expect(l4).toEqual([]);
  });
  it("CREED: a non-creature 'it's a land' clause does not spuriously remove Creature", () => {
    // A hypothetical ARTIFACT with the same gated land grant: emits addCardType Land but NOT removeCardType
    // Creature (the paired removal only fires for a printed Creature — no fabricated type strip).
    const artifact = { name: "FakeArt", type: "Artifact", oracle: "As long as FakeArt has a spore counter on it, it's a land." };
    const l4 = parseStaticAbilities(artifact).filter((e) => e.layer === 4);
    expect(l4.some((e) => e.op.layerOp === "addCardType")).toBe(true);
    expect(l4.some((e) => e.op.layerOp === "removeCardType")).toBe(false);
  });
});
