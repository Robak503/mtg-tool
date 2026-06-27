/**
 * TRIG-PRONOUN-IT — the NON-SELF triggering-permanent pronoun ("it"/"that creature") in a trigger
 * effect (CR 608.2c — a pronoun in later text refers to the object the ability triggered on, NOT the
 * source). detectTriggers rewrites the non-self pronoun → the canonical sentinel "the triggering
 * creature" (gated to the non-self triggering scopes); parser.js models that sentinel as
 * target:"thatCreature" → ctx.triggeringPermanentId (the WAVE-3b COUNTERS-ON-EVENT convention, extended
 * to pump / sacrifice / bounce). The sentinel appears in ZERO printed oracle text, so a SPELL's anaphoric
 * "it" (Big Play / Puncture Bolt / Miraculous Recovery) is NEVER rewritten and stays LOW → Arbiter.
 *
 * This file pins: the detectTriggers rewrite (non-self only, self untouched), the parser sentinel atoms,
 * the spell-anaphor FP-guard, the native-trigger flips, and end-to-end resolution onto the TRIGGERING
 * creature (not the source). The counter form is served by WAVE-3b's counterClausesParser (not here).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { detectTriggers, triggersForEvent } from "./triggers.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const clauseOf = (card) => detectTriggers(card)[0]?.effectClause;
const atomOf = (c) => (parseEffectClause(c, "Instant") || {}).atoms?.[0];
const hi = (c) => expect(programConfidence(parseEffectClause(c, "Instant"))).toBe("high");
const lo = (c) => expect(programConfidence(parseEffectClause(c, "Instant"))).not.toBe("high");

// ── 1. detectTriggers sentinel rewrite (NON-self only) ──
describe("TRIG-PRONOUN-IT — detectTriggers rewrites the non-self pronoun → sentinel", () => {
  it("'a creature you control attacks, it gets +N/+N' → 'the triggering creature …'", () => {
    expect(clauseOf({ name: "Fervent Charge", type: "Enchantment", oracle: "Whenever a creature you control attacks, it gets +2/+2 until end of turn." }))
      .toBe("the triggering creature gets +2/+2 until end of turn");
  });
  it("pump+grant on an enters trigger rewrites too (In the Web of War)", () => {
    expect(clauseOf({ name: "In the Web of War", type: "Enchantment", oracle: "Whenever a creature you control enters, it gets +2/+0 and gains haste until end of turn." }))
      .toBe("the triggering creature gets +2/+0 and gains haste until end of turn");
  });
  it("'sacrifice it' / 'return it' rewrite to the sentinel (non-self)", () => {
    expect(clauseOf({ name: "Sac Aura", type: "Enchantment", oracle: "Whenever a creature you control attacks, sacrifice it." }))
      .toBe("sacrifice the triggering creature");
    expect(clauseOf({ name: "Bounce Aura", type: "Enchantment", oracle: "Whenever a creature you control attacks, return it to its owner's hand." }))
      .toBe("return the triggering creature to its owner's hand");
  });
  it("CREED: a SELF-scope 'it gets' is NOT rewritten to the sentinel — it stays 'this creature'", () => {
    expect(clauseOf({ name: "Brazen Wolves", type: "Creature — Beast", power: 2, toughness: 2, oracle: "Whenever Brazen Wolves attacks, it gets +2/+0 until end of turn." }))
      .toBe("this creature gets +2/+0 until end of turn");
  });
});

// ── 2. parser models the sentinel as target:"thatCreature" (non-targeted) ──
describe("TRIG-PRONOUN-IT — parser sentinel atoms (target:thatCreature, non-targeted)", () => {
  it("pump → target:thatCreature, no targetType, programNeedsChosenTarget false", () => {
    hi("the triggering creature gets +2/+1 until end of turn");
    const a = atomOf("the triggering creature gets +2/+1 until end of turn");
    expect(a).toMatchObject({ op: "pump", target: "thatCreature", ptDelta: { p: 2, t: 1 } });
    expect(a?.targetType).toBeUndefined();
    expect(programNeedsChosenTarget(parseEffectClause("the triggering creature gets +2/+1 until end of turn", "Instant"))).toBe(false);
  });
  it("pump+grant and grant-only", () => {
    expect(atomOf("the triggering creature gets +1/+1 and gains trample until end of turn")).toMatchObject({ op: "pump", target: "thatCreature", ptDelta: { p: 1, t: 1 }, grantKeywords: ["Trample"] });
    expect(atomOf("the triggering creature gains flying until end of turn")).toMatchObject({ op: "pump", target: "thatCreature", grantKeywords: ["Flying"] });
  });
  it("sacrifice + bounce → target:thatCreature", () => {
    expect(atomOf("sacrifice the triggering creature")).toMatchObject({ op: "sacrifice", target: "thatCreature" });
    expect(atomOf("return the triggering creature to its owner's hand")).toMatchObject({ op: "bounce", target: "thatCreature" });
  });
  it("CREED FP-GUARD: un-grantable kw drops the clause; a raw spell anaphor never matches the sentinel", () => {
    lo("the triggering creature gains shadow until end of turn"); // shadow un-grantable (hexproof now IS — PUMP-STATIC-GRANT) → LOW
    lo("it gets +2/+2 until end of turn");                          // raw spell "it" — no sentinel → LOW
    lo("sacrifice it");                                             // raw "it" — only the sentinel is modeled
    lo("return it to its owner's hand");                           // raw "it" — only the sentinel is modeled
  });
});

// ── 3. classifyCard: native flips + spell-anaphor FP-guard ──
describe("TRIG-PRONOUN-IT — classifyCard", () => {
  it("clean non-self pronoun triggers flip native-trigger", () => {
    expect(classifyCard({ name: "Fervent Charge", type: "Enchantment", oracle: "Whenever a creature you control attacks, it gets +2/+2 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "In the Web of War", type: "Enchantment", oracle: "Whenever a creature you control enters, it gets +2/+0 and gains haste until end of turn." })).toBe("native-trigger");
  });
  it("CREED FP-GUARD: a SPELL's anaphoric 'it'/'that creature' stays NON-native (arbiter-spell)", () => {
    for (const c of [
      { name: "Big Play", type: "Instant", oracle: "Target creature gets +2/+2 and gains reach until end of turn. Put a +1/+1 counter on it." },
      { name: "Puncture Bolt", type: "Instant", oracle: "Puncture Bolt deals 1 damage to target creature. Put a -1/-1 counter on that creature." },
      { name: "Miraculous Recovery", type: "Instant", oracle: "Return target creature card from your graveyard to the battlefield. Put a +1/+1 counter on it." },
    ]) {
      const tier = classifyCard(c);
      expect(tier).not.toMatch(/^native/);
      expect(tier).toBe("arbiter-spell");
    }
  });
});

// ── 4. end-to-end: the effect lands on the TRIGGERING creature, not the source ──
describe("TRIG-PRONOUN-IT — resolves onto the triggering permanent (not the source)", () => {
  function board(sourceCard, attacker) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [sourceCard, attacker] } },
    };
  }
  it("'a creature you control attacks, it gets +2/+2' pumps the ATTACKER (the triggering creature)", () => {
    const src = createPermanent({ id: "fc", card: { name: "Fervent Charge", type: "Enchantment", oracle: "Whenever a creature you control attacks, it gets +2/+2 until end of turn." }, controller: "user" });
    const atk = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    let s = board(src, atk);
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: src, triggeringPermanent: atk });
    expect(fired).toHaveLength(1);
    s = flushTriggers({ ...s, pendingTriggers: fired });
    expect(s.stack.length).toBeGreaterThanOrEqual(1);
    s = resolveTopOfStack(s);
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([4, 4]); // the attacker was pumped
  });
  it("'sacrifice it' sacrifices the TRIGGERING creature (not the enchantment source)", () => {
    const src = createPermanent({ id: "src", card: { name: "Doom Aura", type: "Enchantment", oracle: "Whenever a creature you control attacks, sacrifice it." }, controller: "user" });
    const atk = createPermanent({ id: "goat", card: { name: "Goat", type: "Creature — Goat", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    let s = board(src, atk);
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: src, triggeringPermanent: atk });
    s = flushTriggers({ ...s, pendingTriggers: fired });
    s = resolveTopOfStack(s);
    expect(findPermanent(s, "goat")).toBeFalsy();                              // the triggering creature was sacrificed
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Goat");
    expect(findPermanent(s, "src")).toBeTruthy();                              // the source enchantment is untouched
  });
});
