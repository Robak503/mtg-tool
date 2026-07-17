/**
 * etbSupportSweep.test.js — BLITZ ETB-1: two ETB payoff buckets whose atoms already exist, flipped by
 * reaching them.
 *
 *  (A) SUPPORT N (CR 701.41 / 701.41a) — the keyword action "Support N (Put a +1/+1 counter on each of up to N
 *      OTHER target creatures.)". Modeled as the existing multi-target +1/+1 add-counter atom (maxTargets:N,
 *      minTargets:0) PLUS excludeSource:true (the source can't be one of the N targets, per 701.41a's "other").
 *      The excludeSource honoring is added to enumerateTargets' any-creature pool. Flips: Expedition Raptor /
 *      Aerie Auxiliary / Saddleback Lagac / Relief Captain (ETB creatures → native-trigger), Captured by Lagacs
 *      (Aura ETB → native-aura), Joraga Auxiliary (activated → native-activated), Lead by Example / Shoulder to
 *      Shoulder (spells → native-spell). On a NON-creature source (Aura/spell) excludeSource is a vacuous no-op
 *      (the source isn't a creature → never a legal creature target), so it's correct for every source shape.
 *
 *  (B) SOURCE-EXCLUDING BOARD SWEEP — "<source> deals N damage to each OTHER creature" (Chaos Maw / Crater
 *      Hellion / Raging Swordtooth). Reuses the deal-damage primitive with a new eachOtherCreature mass
 *      targetType (registered in NON_CHOSEN_TARGET_TYPES → non-chosen, routes on confidence); the resolver
 *      hits every creature EXCEPT the source (ctx.sourceId, CR 113.7).
 *
 * Pins: recognition on the REAL oracle → the intended native tier; parser HIGH + the deliberately-parked
 * near-misses LOW; runtime through checkEnterTriggers (enterPermanent → flush → resolve) — the payoff lands on
 * the right permanents and NEVER on the source; enumerateTargets' excludeSource drops the source; whole-card FN
 * guards (a support card with an unmodeled second ability stays body-only).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
const atom0 = (t) => parseEffectClause(t, "Instant")?.atoms?.[0];

function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
const perm = (id, ctrl, over = {}) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: 2, toughness: 2, ...over }, controller: ctrl });
// Cast a creature spell so its ETB trigger flushes onto the stack; return the post-enter state (trigger on stack).
function castCreature(card, user = [], ai = []) {
  let s = stateWith(user, ai);
  s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: card, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card, controller: "user" } } }] };
  return resolveTopOfStack(s);
}
const counterOf = (s, id) => { for (const p of Object.keys(s.players)) { const f = s.players[p].battlefield.find((x) => x.id === id); if (f) return f.counters?.["+1/+1"] || 0; } return null; };

// ===================================================================================================
describe("SUPPORT N — recognition (real oracle)", () => {
  it("bare 'support N' parses to the multi-target +1/+1 add-counter atom with excludeSource", () => {
    expect(atom0("support 2")).toMatchObject({ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature", maxTargets: 2, minTargets: 0, excludeSource: true });
    expect(atom0("support 6")).toMatchObject({ op: "add-counter", maxTargets: 6, excludeSource: true }); // Gladehart-scale N
    expect(conf("support 3")).toBe("high");
  });

  it("the ETB support creatures classify native-trigger", () => {
    expect(classifyCard({ name: "Expedition Raptor", type: "Creature — Bird", oracle: "Flying\nWhen this creature enters, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Saddleback Lagac", type: "Creature — Lizard", oracle: "When this creature enters, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Relief Captain", type: "Creature — Kor Knight Ally", oracle: "When this creature enters, support 3. (Put a +1/+1 counter on each of up to three other target creatures.)" })).toBe("native-trigger");
  });

  it("support on a NON-creature source is also modeled (Aura ETB → native-aura, spell → native-spell)", () => {
    // On an Aura/spell the source is not a creature, so excludeSource is a vacuous no-op — correct.
    expect(classifyCard({ name: "Captured by Lagacs", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block.\nWhen this Aura enters, support 2. (Put a +1/+1 counter on each of up to two target creatures.)" })).toBe("native-aura");
    expect(classifyCard({ name: "Lead by Example", type: "Instant", oracle: "Support 2. (Put a +1/+1 counter on each of up to two target creatures.)" })).toBe("native-spell");
    expect(classifyCard({ name: "Shoulder to Shoulder", type: "Sorcery", oracle: "Support 2. (Put a +1/+1 counter on each of up to two target creatures.)\nDraw a card." })).toBe("native-spell");
  });

  it("FN guard: a non-bare / variable / typo'd support stays LOW → Arbiter", () => {
    expect(conf("support x")).toBe("low");            // variable N — not a printed keyword value
    expect(conf("supporting 2")).toBe("low");          // not the keyword
    expect(conf("support the team")).toBe("low");      // non-numeric argument
  });

  it("WHOLE-CARD FN (CREED): a support creature with an unmodeled second ability stays body-only", () => {
    // support 6 (modeled) + a control-exchange activated ability the engine does NOT model → the whole card
    // correctly parks. (Gladehart Cavalry — the prior support + "with a +1/+1 counter on it dies, gain life"
    // example — now flips native via BLITZ CNT-1's counter-predicate scope, so a still-unmodeled rider is used.)
    expect(classifyCard({ name: "Support Warden", type: "Creature — Elf Knight", oracle: "When this creature enters, support 6. (Put a +1/+1 counter on each of up to six other target creatures.)\n{3}, {T}: Exchange control of target creature you control and target creature an opponent controls." })).toBe("body-only");
  });
});

describe("SUPPORT N — enumeration excludes the source (CR 701.41a)", () => {
  it("enumerateTargets drops ctx.sourceId from the any-creature support pool", () => {
    const s = stateWith([perm("src", "user"), perm("u1", "user"), perm("u2", "user")], [perm("a1", "ai")]);
    const spec = { kind: "add-counter", targetType: "creature", excludeSource: true, restrictions: [] };
    const ids = enumerateTargets(s, "user", spec, [], { sourceId: "src" }).map((t) => t.id).sort();
    expect(ids).toEqual(["a1", "u1", "u2"]); // every creature EXCEPT the source; opponents still legal targets
    // Without excludeSource the source IS offered (byte-identical to the pre-slice behavior).
    const idsNoEx = enumerateTargets(s, "user", { kind: "add-counter", targetType: "creature", restrictions: [] }, [], { sourceId: "src" }).map((t) => t.id).sort();
    expect(idsNoEx).toEqual(["a1", "src", "u1", "u2"]);
  });
});

describe("SUPPORT N — runtime through checkEnterTriggers", () => {
  it("ETB support puts a +1/+1 counter on up to N OTHER creatures (own-side chosen), never on the source", () => {
    const src = { id: "card-raptor", name: "Expedition Raptor", type: "Creature — Bird", power: 2, toughness: 2, oracle: "Flying\nWhen this creature enters, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" };
    const afterSpell = castCreature(src, [perm("u1", "user"), perm("u2", "user")], [perm("a1", "ai")]);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    // A +1/+1 counter is own-intent → the flush chooser targets the two OWN creatures, not the opponent's.
    expect(trig.payload.params.targets.map((t) => t.id).sort()).toEqual(["u1", "u2"]);
    const after = resolveTopOfStack(afterSpell);
    expect(counterOf(after, "u1")).toBe(1);
    expect(counterOf(after, "u2")).toBe(1);
    expect(counterOf(after, "a1")).toBe(0); // opponent not chosen
    const source = after.players.user.battlefield.find((p) => p.card?.name === "Expedition Raptor");
    expect(source.counters?.["+1/+1"] || 0).toBe(0); // the source itself is never a support target
  });

  it("support caps at the available OTHER creatures (fewer than N present → no fabricated targets)", () => {
    const src = { id: "card-cap", name: "Capper", type: "Creature — Bird", power: 2, toughness: 2, oracle: "When this creature enters, support 3." };
    const afterSpell = castCreature(src, [perm("only1", "user")], []); // only ONE other creature; support 3
    const after = resolveTopOfStack(afterSpell);
    expect(counterOf(after, "only1")).toBe(1);
    const source = after.players.user.battlefield.find((p) => p.card?.name === "Capper");
    expect(source.counters?.["+1/+1"] || 0).toBe(0);
  });
});

// ===================================================================================================
describe("SOURCE-EXCLUDING BOARD SWEEP — recognition (real oracle)", () => {
  it("'<source> deals N damage to each other creature' parses to deal-damage / eachOtherCreature", () => {
    expect(atom0("it deals 3 damage to each other creature")).toEqual({ op: "deal-damage", amount: 3, targetType: "eachOtherCreature" });
    expect(atom0("this creature deals 4 damage to each other creature")).toMatchObject({ op: "deal-damage", amount: 4, targetType: "eachOtherCreature" });
  });

  it("the ETB board-sweep creatures classify native-trigger", () => {
    expect(classifyCard({ name: "Chaos Maw", type: "Creature — Hellion", oracle: "When this creature enters, it deals 3 damage to each other creature." })).toBe("native-trigger");
    expect(classifyCard({ name: "Raging Swordtooth", type: "Creature — Dinosaur", oracle: "Trample\nWhen this creature enters, it deals 1 damage to each other creature." })).toBe("native-trigger");
    expect(classifyCard({ name: "Crater Hellion", type: "Creature — Hellion Beast", oracle: "Echo {4}{R}{R} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nWhen this creature enters, it deals 4 damage to each other creature." })).toBe("native-trigger");
  });

  it("FN guard: a FILTERED / extended each-other-creature sweep stays LOW (deliberately parked)", () => {
    expect(conf("it deals 1 damage to each other creature with flying")).toBe("low");       // Harbinger of the Hunt (filtered)
    expect(conf("it deals 2 damage to each other creature you control")).toBe("low");         // Cinder Giant (own-only)
    expect(conf("it deals 3 damage to each other creature and each opponent")).toBe("low");   // Archangel Avacyn (extra scope)
    expect(conf("it deals 1 damage to each other creature and each player")).toBe("low");      // Conductor of Cacophony
  });
});

describe("SOURCE-EXCLUDING BOARD SWEEP — runtime through checkEnterTriggers", () => {
  it("the ETB deals N to EVERY other creature (both sides) and NEVER to the source", () => {
    const src = { id: "card-maw", name: "Chaos Maw", type: "Creature — Hellion", power: 5, toughness: 5, oracle: "When this creature enters, it deals 3 damage to each other creature." };
    // u1 2/2 (dies), u2 5/5 (survives with 3 marked), opponent 2/2 (dies) — the source 5/5 is untouched.
    const afterSpell = castCreature(src, [perm("u1", "user", { power: 2, toughness: 2 }), perm("u2", "user", { power: 5, toughness: 5, name: "Big" })], [perm("a1", "ai", { power: 2, toughness: 2 })]);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.targets).toEqual([]); // non-targeted mass sweep
    const after = resolveTopOfStack(afterSpell);
    // u1 and the opponent's 2/2 are dead (lethal 3 damage); the 5/5 survives with 3 marked.
    expect(after.players.user.battlefield.find((p) => p.id === "u1")).toBeUndefined();
    expect(after.players.ai.battlefield.find((p) => p.id === "a1")).toBeUndefined();
    const big = after.players.user.battlefield.find((p) => p.id === "u2");
    expect(big.damageMarked).toBe(3);
    // The SOURCE (Chaos Maw) is alive and undamaged — "each OTHER creature" excludes it.
    const source = after.players.user.battlefield.find((p) => p.card?.name === "Chaos Maw");
    expect(source).toBeDefined();
    expect(source.damageMarked || 0).toBe(0);
  });
});
