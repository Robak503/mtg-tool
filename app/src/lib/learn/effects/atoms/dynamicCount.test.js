/**
 * dynamicCount.test.js — the DYNAMIC-COUNT keystone (branch dynamic-count).
 *
 * Wires the SHARED count source (countForSpec) into the token / counter / damage / life atoms so a count
 * that's a BOARD TALLY or a SOURCE-STAT resolves AT RESOLUTION (CR 608.2h), recomputed when the effect
 * resolves — not baked at parse. Two new families:
 *
 *   SOURCE-STAT (the "equal to its / that creature's power/toughness" count kind) — read off a single
 *   CREATURE referent's LAYER-AWARE power/toughness via countForSpec:
 *     triggeringPower / triggeringToughness → ctx.triggeringPermanentId (the ENTERING creature on an ETB
 *       trigger): Terror of the Peaks "deals damage equal to that creature's power"; Verdant Sun's Avatar
 *       "gain life equal to that creature's toughness". The detector rewrites the non-self "that creature's
 *       <stat>" → the sentinel the parser maps here, gated to the ETB entering-creature scopes (CREED — a
 *       SPELL fling's "that creature's power" / a non-etb referent never reaches it).
 *     sourcePower / sourceToughness → ctx.sourceId (the ability's own permanent).
 *
 *   BOARD-COUNT counters — applyAddCounter now reads `countFor` (the same parseCountSource→countForSpec the
 *   token/draw/life/damage atoms use): "put X +1/+1 counters on target creature, where X is the number of
 *   lands you control" (Will of the Sultai); "…on each creature you control … the number of Elves you
 *   control" (Voja); "…the number of Shrines you control" (Southern Air Temple).
 *
 * CREED exercised throughout: the count is read at RESOLUTION (proven by mutating ctx / the board between
 * parse and resolve), a 0 count is a clean no-op (NO fabricated tokens/counters/damage/life — never forced
 * to 1), an ABSENT referent / a non-creature → 0, an UNMODELED count source → LOW → Arbiter, and a SPELL's
 * anaphoric "that creature's power" is NEVER rewritten (it isn't an ETB trigger) so it stays LOW.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { detectTriggers } from "../../triggers.js";
import { classifyCard } from "../../coverage.js";
import { countForSpec } from "./shared.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { checkEnterTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const atom0 = (card) => parseEffectProgram(card)?.atoms[0];
const conf = (card) => { const p = parseEffectProgram(card); return p ? programConfidence(p) : "low"; };

// A creature permanent with explicit P/T and subtype (default Beast).
function creature(id, { power = 1, toughness = 1, subtype = "Beast", controller = "user" } = {}) {
  return createPermanent({ id, card: { id: `c-${id}`, name: id, type: `Creature — ${subtype}`, power, toughness }, controller, summoningSick: false });
}
function landPerm(id, sub, controller = "user") {
  return createPermanent({ id, card: { id: `c-${id}`, name: sub, type: `Basic Land — ${sub}` }, controller });
}
function stateWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: over.lib ?? 20 }, (_, i) => ({ id: `L${i}`, name: `L${i}`, type: "Land" }));
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "main1", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library, life: 40, hand: [] },
      ai: { ...s.players.ai, battlefield: over.ai || [], life: 40 },
    },
  };
}
function flushResolve(s) {
  let n = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((n.stack || []).length && g++ < 50) n = resolveTopOfStack(n);
  return n;
}
const counterOf = (s, id, type = "+1/+1") => (s.players.user.battlefield.find((p) => p.id === id)?.counters?.[type]);

// ────────────────────────────────────────────────────────────────────────────
// SOURCE-STAT — countForSpec resolution (the shared count kind feeding all four families)
// ────────────────────────────────────────────────────────────────────────────
describe("SOURCE-STAT — countForSpec reads a referent's layer-aware stat at resolution", () => {
  it("triggeringPower / triggeringToughness read ctx.triggeringPermanentId (a 5/2 → 5 / 2)", () => {
    const s = stateWith({ user: [creature("trig", { power: 5, toughness: 2 })] });
    const ctx = { controller: "user", triggeringPermanentId: "trig", targets: [] };
    expect(countForSpec(s, ctx, { kind: "triggeringPower" })).toBe(5);
    expect(countForSpec(s, ctx, { kind: "triggeringToughness" })).toBe(2);
  });

  it("sourcePower / sourceToughness read ctx.sourceId (a 4/7 → 4 / 7)", () => {
    const s = stateWith({ user: [creature("src", { power: 4, toughness: 7 })] });
    const ctx = { controller: "user", sourceId: "src", targets: [] };
    expect(countForSpec(s, ctx, { kind: "sourcePower" })).toBe(4);
    expect(countForSpec(s, ctx, { kind: "sourceToughness" })).toBe(7);
  });

  it("layer-aware: a printed 2/2 with three +1/+1 counters reads 5 (counters counted)", () => {
    const perm = creature("trig", { power: 2, toughness: 2 });
    perm.counters = { "+1/+1": 3 };
    const s = stateWith({ user: [perm] });
    expect(countForSpec(s, { controller: "user", triggeringPermanentId: "trig" }, { kind: "triggeringPower" })).toBe(5);
  });

  it("ABSENT referent (a spell / left the battlefield) → 0; a NON-creature referent → 0 (CREED, never fabricated)", () => {
    const noncreature = createPermanent({ id: "art", card: { id: "c-art", name: "Rock", type: "Artifact" }, controller: "user" });
    const s = stateWith({ user: [noncreature] });
    expect(countForSpec(s, { controller: "user" }, { kind: "triggeringPower" })).toBe(0); // no triggeringPermanentId
    expect(countForSpec(s, { controller: "user", triggeringPermanentId: "gone" }, { kind: "triggeringPower" })).toBe(0); // stale id
    expect(countForSpec(s, { controller: "user", sourceId: "art" }, { kind: "sourcePower" })).toBe(0); // not a creature
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DAMAGE = that creature's power (Terror of the Peaks)
// ────────────────────────────────────────────────────────────────────────────
describe("DAMAGE = the triggering creature's power (Terror of the Peaks)", () => {
  const SENTINEL = "This creature deals damage equal to the triggering creature's power to any target.";

  it("parses the sentinel → deal-damage / amountCount triggeringPower, HIGH", () => {
    const p = parseEffectProgram(I(SENTINEL));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", targetType: "any", amountCount: { kind: "triggeringPower", per: 1 } });
  });

  it("detector rewrites the ETB trigger's 'that creature's power' → the sentinel; the whole clause is HIGH", () => {
    const card = { name: "Terror of the Peaks", type: "Creature — Dragon", oracle: "Flying\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target." };
    const trig = detectTriggers(card)[0];
    expect(trig.event).toBe("etb");
    expect(trig.effectClause).toBe("this creature deals damage equal to the triggering creature's power to any target");
    expect(programConfidence(parseEffectProgram(I(trig.effectClause)))).toBe("high");
  });

  it("RUNTIME: an entering 5/2 → deals 5 (ai 40→35); a 0-power entering → 0 damage (clean no-op)", () => {
    const atom = atom0(I(SENTINEL));
    let s = stateWith({ user: [creature("terror", { power: 6, toughness: 6 }), creature("ent", { power: 5, toughness: 2 })] });
    s = resolveAtom(s, atom, { controller: "user", sourceId: "terror", triggeringPermanentId: "ent", targets: [{ type: "player", id: "ai" }] });
    expect(s.players.ai.life).toBe(35);
    // 0-power entering → no damage (CR 120.8)
    let s0 = stateWith({ user: [creature("terror", { power: 6, toughness: 6 }), creature("ent0", { power: 0, toughness: 1 })] });
    s0 = resolveAtom(s0, atom, { controller: "user", sourceId: "terror", triggeringPermanentId: "ent0", targets: [{ type: "player", id: "ai" }] });
    expect(s0.players.ai.life).toBe(40);
  });

  it("RUNTIME is DYNAMIC: same atom, a bigger entering creature scales the damage", () => {
    const atom = atom0(I(SENTINEL));
    let s = stateWith({ user: [creature("terror", { power: 6, toughness: 6 }), creature("ent", { power: 8, toughness: 1 })] });
    s = resolveAtom(s, atom, { controller: "user", sourceId: "terror", triggeringPermanentId: "ent", targets: [{ type: "player", id: "ai" }] });
    expect(s.players.ai.life).toBe(32); // 40 - 8
  });

  it("END-TO-END via the real ETB flush: Terror deals the entering creature's power to an enemy", () => {
    const terror = createPermanent({ id: "terror", card: { id: "c-terror", name: "Terror of the Peaks", type: "Creature — Dragon", power: 6, toughness: 6, oracle: "Flying\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target." }, controller: "user", summoningSick: false });
    const ent = createPermanent({ id: "ent", card: { id: "c-ent", name: "Big Beast", type: "Creature — Beast", power: 5, toughness: 2 }, controller: "user", summoningSick: false });
    let s = stateWith({ user: [terror, ent] });
    s = checkEnterTriggers(s, ent);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushResolve(s);
    expect(s.players.ai.life).toBe(35); // the default chooser hits the enemy for 5
  });
});

// ────────────────────────────────────────────────────────────────────────────
// LIFE = that creature's toughness/power (Verdant Sun's Avatar, Archon of Redemption family)
// ────────────────────────────────────────────────────────────────────────────
describe("LIFE = the triggering creature's toughness/power (Verdant Sun's Avatar)", () => {
  it("parses 'gain life equal to the triggering creature's toughness' → gain-life / triggeringToughness, HIGH, no chosen target", () => {
    const p = parseEffectProgram(I("You gain life equal to the triggering creature's toughness."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "gain-life", amountCount: { kind: "triggeringToughness", per: 1 }, targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("parses the '…power' variant → triggeringPower (Archon of Redemption family)", () => {
    expect(atom0(I("You gain life equal to the triggering creature's power.")))
      .toMatchObject({ op: "gain-life", amountCount: { kind: "triggeringPower", per: 1 } });
  });

  it("Verdant Sun's Avatar classifies native-trigger (clean ETB life trigger)", () => {
    expect(classifyCard({ name: "Verdant Sun's Avatar", type: "Creature — Dinosaur Avatar", oracle: "Whenever this creature or another creature you control enters, you gain life equal to that creature's toughness." })).toBe("native-trigger");
  });

  it("RUNTIME: an entering 2/7 → gain 7 (40→47); a 0-toughness referent → 0 (no fabricated life)", () => {
    const atom = atom0(I("You gain life equal to the triggering creature's toughness."));
    let s = stateWith({ user: [creature("self", { power: 1, toughness: 1 }), creature("ent", { power: 2, toughness: 7 })] });
    s = resolveAtom(s, atom, { controller: "user", sourceId: "self", triggeringPermanentId: "ent" });
    expect(s.players.user.life).toBe(47);
    let s0 = stateWith({ user: [creature("self", { power: 1, toughness: 1 })] });
    s0 = resolveAtom(s0, atom, { controller: "user", sourceId: "self" }); // no triggeringPermanentId
    expect(s0.players.user.life).toBe(40);
  });

  it("END-TO-END via the real ETB flush: Verdant gains the entering creature's toughness", () => {
    const avatar = createPermanent({ id: "avatar", card: { id: "c-avatar", name: "Verdant Sun's Avatar", type: "Creature — Dinosaur Avatar", power: 5, toughness: 5, oracle: "Whenever this creature or another creature you control enters, you gain life equal to that creature's toughness." }, controller: "user", summoningSick: false });
    const big = createPermanent({ id: "big", card: { id: "c-big", name: "Tough Beast", type: "Creature — Beast", power: 2, toughness: 7 }, controller: "user", summoningSick: false });
    let s = stateWith({ user: [avatar, big] });
    s = checkEnterTriggers(s, big);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushResolve(s);
    expect(s.players.user.life).toBe(47);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// COUNTERS = board count (Will of the Sultai, Voja, Southern Air Temple)
// ────────────────────────────────────────────────────────────────────────────
describe("COUNTERS = a board count via countFor (the shared count source)", () => {
  it("'put X +1/+1 counters on target creature, where X is the number of lands you control' → add-counter / countFor, HIGH", () => {
    const p = parseEffectProgram(I("Put X +1/+1 counters on target creature, where X is the number of lands you control."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", counterType: "+1/+1", countFor: { kind: "permanentsYouControl", cardType: "land" }, targetType: "creature" });
  });

  it("'…on target creature you control … equal to the number of lands you control' (word order B, own-side)", () => {
    expect(atom0(I("Put a number of +1/+1 counters on target creature you control equal to the number of lands you control.")))
      .toMatchObject({ op: "add-counter", countFor: { kind: "permanentsYouControl", cardType: "land" }, targetType: "creatureYouControl" });
  });

  it("'…on each creature you control … the number of Elves you control' (Voja) → scope youControl + countFor Elf", () => {
    expect(atom0(I("Put X +1/+1 counters on each creature you control, where X is the number of Elves you control.")))
      .toMatchObject({ op: "add-counter", countFor: { kind: "permanentsYouControl", subtype: "Elf" }, scope: "youControl" });
  });

  it("Voja, Jaws of the Conclave + Southern Air Temple classify native-trigger", () => {
    expect(classifyCard({ name: "Voja, Jaws of the Conclave", type: "Legendary Creature — Wolf", oracle: "Vigilance, trample, ward {3}\nWhenever Voja attacks, put X +1/+1 counters on each creature you control, where X is the number of Elves you control. Draw a card for each Wolf you control." })).toBe("native-trigger");
    expect(classifyCard({ name: "Southern Air Temple", type: "Legendary Enchantment — Shrine", oracle: "When Southern Air Temple enters, put X +1/+1 counters on each creature you control, where X is the number of Shrines you control.\nWhenever another Shrine you control enters, put a +1/+1 counter on each creature you control." })).toBe("native-trigger");
  });

  it("RUNTIME (target): 3 lands → 3 counters on the chosen creature, read AT RESOLUTION", () => {
    const atom = atom0(I("Put X +1/+1 counters on target creature, where X is the number of lands you control."));
    let s = stateWith({ user: [creature("tgt"), landPerm("L1", "Forest"), landPerm("L2", "Island"), landPerm("L3", "Plains")] });
    s = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt", controller: "user" }] });
    expect(counterOf(s, "tgt")).toBe(3);
  });

  it("RUNTIME is DYNAMIC: a land added between parse and resolve raises the count", () => {
    const atom = atom0(I("Put X +1/+1 counters on target creature, where X is the number of lands you control."));
    let s = stateWith({ user: [creature("tgt"), landPerm("L1", "Forest")] });
    // mutate AFTER parse, BEFORE resolve: add a 2nd land
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, landPerm("L2", "Island")] } } };
    s = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt", controller: "user" }] });
    expect(counterOf(s, "tgt")).toBe(2);
  });

  it("RUNTIME (each you control): count = Elves, recipients = EVERY creature you control (count ≠ recipients)", () => {
    const atom = atom0(I("Put X +1/+1 counters on each creature you control, where X is the number of Elves you control."));
    let s = stateWith({ user: [creature("e1", { subtype: "Elf" }), creature("e2", { subtype: "Elf" }), creature("w", { subtype: "Wolf" })] });
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(counterOf(s, "e1")).toBe(2);
    expect(counterOf(s, "e2")).toBe(2);
    expect(counterOf(s, "w")).toBe(2); // the Wolf is "a creature you control" → gets 2 too
  });

  it("0-count → NO counters added (clean no-op, never forced to 1)", () => {
    const atom = atom0(I("Put X +1/+1 counters on target creature, where X is the number of lands you control."));
    let s = stateWith({ user: [creature("tgt")] }); // no lands
    s = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt", controller: "user" }] });
    expect(counterOf(s, "tgt")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CREED guards — unmodeled source → Arbiter; spell anaphor never rewritten; regression guard
// ────────────────────────────────────────────────────────────────────────────
describe("DYNAMIC-COUNT — CREED guards", () => {
  it("an UNMODELED counter count source (Bobbleheads / votes) stays LOW → Arbiter (never a guessed count)", () => {
    expect(conf(I("Put X +1/+1 counters on target creature, where X is the number of Bobbleheads you control."))).toBe("low");
    expect(conf(I("Put X +1/+1 counters on each creature you control equal to the number of security votes."))).toBe("low");
  });

  it("a SPELL's anaphoric 'that creature's power' is NOT an ETB trigger → never rewritten → stays LOW (Grab the Reins fling)", () => {
    // Grab the Reins' fling mode sacrifices a creature and "it deals damage equal to that creature's power to
    // any target" — "that creature" is the SACRIFICED creature, NOT a triggering permanent. There's no ETB
    // trigger, so the detector never rewrites it, and the bare spell clause stays LOW (a SAFE false-negative).
    expect(conf(I("As an additional cost, sacrifice a creature. It deals damage equal to that creature's power to any target."))).toBe("low");
    // The raw (un-rewritten) 'that creature's power' damage clause is itself NOT modeled (only the sentinel is).
    expect(conf(I("This creature deals damage equal to that creature's power to any target."))).toBe("low");
  });

  it("REGRESSION GUARD: Pantlaza's 'discover X, where X is that creature's toughness' still classifies native-trigger", () => {
    // The detector's stat-payoff rewrite is verb-anchored (deals damage = / gain life =), so it must NOT touch
    // Pantlaza's discover-X "that creature's toughness" (handled by its own library.js exact-match parser).
    expect(classifyCard({ name: "Pantlaza, Sun-Favored", type: "Legendary Creature — Dinosaur", oracle: "Whenever Pantlaza or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn." })).toBe("native-trigger");
  });

  it("the fixed-N add-counter path is unchanged (no countFor leakage) — 'put two +1/+1 counters on target creature'", () => {
    const p = parseEffectProgram(I("Put two +1/+1 counters on target creature."));
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", counterType: "+1/+1", amount: 2, targetType: "creature" });
    expect(p.atoms[0].countFor).toBeUndefined();
  });
});
