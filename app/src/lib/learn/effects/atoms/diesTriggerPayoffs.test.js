/**
 * ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== (Wave 3b — branch wave3b-dies)
 *
 * DYNAMIC, power-scaled "when this creature dies" payoffs whose COUNT is the dying creature's last-known
 * power (CR 603.6e — captured AT the SBA/destroy/sacrifice look-back, BEFORE the permanent leaves the
 * battlefield, so the layer-aware power incl. counters/anthems travels with the `dead` entry as
 * ctx.dyingPower). The three in-deck consumers:
 *   - Goldvein Hydra (Zaxara): "create a number of tapped Treasure tokens equal to its power".
 *   - Lifeblood Hydra (Zaxara): "you gain life and draw cards equal to its power" (a SHARED-magnitude
 *     gain+draw — both halves read the same power).
 *   - Feral Ghoul (The Wise Mothman): "each opponent gets a number of rad counters equal to its power".
 *
 * CREED guards exercised: the count is the LAYER-AWARE on-board power (counters/anthems), not the printed
 * value; it is captured BEFORE the death look-back (so it's the real pre-death power, not a post-graveyard
 * printed-only read); the dies-trigger fires ONCE; the payoff is non-targeted (routes natively on the flush);
 * an absent ctx.dyingPower (a spell / non-dies context) is a clean 0 no-op, never a fabricated count; and the
 * power capture works on EVERY death path (combat SBA, destroy spell, sacrifice).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "../../gameState.js";
import { sacrificeCreatureEffect } from "./removal.js";
import { applyDestroyEffect } from "../../spellEffects.js"; // W5: the primitive (resolveSpellEffect deleted)
import { resolveCombatDamage } from "../../combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

// A 4-seat commander pod (user + ai1/ai2/ai3) so "each opponent" has three recipients; user gets a library
// so Lifeblood's draw has cards to take (drawCards is library-bounded).
function podState(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  let s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "main1", step: "main" };
  s = {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library: over.lib || [], life: 40 },
    },
  };
  return s;
}
const libN = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: `Filler ${i}`, type: "Instant" }));
const treasuresOf = (s, pid = "user") => s.players[pid].battlefield.filter((p) => /Treasure/.test(String(p.card?.type || "")));
const radOf = (s, pid) => s.players[pid].radCounters || 0;

// A power-N creature with the given dies-payoff oracle, made N via printed-2 + (N-2) +1/+1 counters so the
// tests prove the LAYER-AWARE capture (effective power, not the printed 2).
function payoffPerm(id, name, oracle, power) {
  const perm = createPermanent({
    id,
    card: { id: `c-${id}`, name, type: "Creature — Hydra", power: 2, toughness: 2, oracle },
    controller: "user",
    summoningSick: false,
  });
  perm.counters = { "+1/+1": Math.max(0, power - 2) };
  return perm;
}

const GOLDVEIN = "Vigilance, trample, haste\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a number of tapped Treasure tokens equal to its power.";
const LIFEBLOOD = "Trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, you gain life and draw cards equal to its power.";
// Feral Ghoul's first trigger ("another creature you control dies") is a separate watcher; the SELF dies
// payoff is the power-scaled rad one tested here.
const FERAL = "Menace\nWhenever another creature you control dies, put a +1/+1 counter on this creature.\nWhen this creature dies, each opponent gets a number of rad counters equal to its power.";

// Drive a dead creature's dies-trigger to full resolution via the real flush + stack (the production path).
function flushResolve(s) {
  let next = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((next.stack || []).length && g++ < 50) next = resolveTopOfStack(next);
  return next;
}

describe("DIES-TRIGGER-RESOURCE-PAYOFFS — parser", () => {
  it("Goldvein 'create a number of tapped Treasure tokens equal to its power' → create-named-token / dyingPower / tapped, no chosen target", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Create a number of tapped Treasure tokens equal to its power." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "create-named-token", token: "treasure", countContext: "dyingPower", tapped: true, targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("Lifeblood 'you gain life and draw cards equal to its power' → two atoms (gain-life + draw), both dyingPower, no chosen target", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "You gain life and draw cards equal to its power." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "gain-life", countContext: "dyingPower" });
    expect(p.atoms[1]).toMatchObject({ op: "draw", countContext: "dyingPower" });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("Feral Ghoul 'each opponent gets a number of rad counters equal to its power' → rad / eachOpponent / dyingPower, no chosen target", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Each opponent gets a number of rad counters equal to its power." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "rad", who: "eachOpponent", countContext: "dyingPower", targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("FP GUARD: a BARE 'draw cards equal to its power' (Prime Speaker Zegana ETB / Gregor combat-damage) stays LOW — 'its power' there is the LIVE source, never the dyingPower binding", () => {
    // These cards print the same sub-phrase but in a NON-dies context where "its" = the live source's power,
    // not a dying creature. Binding ctx.dyingPower there would resolve to 0 (a forbidden FP). The disambiguator
    // is the FULL dies clause (corpus-unique to Lifeblood); the bare sub-clause is intentionally NOT modeled,
    // so an ETB/combat-damage draw-by-own-power correctly routes to the Arbiter (a SAFE false-negative).
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Draw cards equal to its power." }))).toBe("low");
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "You gain life equal to its power." }))).toBe("low");
  });

  it("an UNMODELED magnitude / scope / conditional fails the anchor → LOW → Arbiter (never a half-resolved partial)", () => {
    // The "equal to its power" forms are anchored to the EXACT modeled shape; a different metric, a wrong
    // recipient scope, or a trailing conditional all leave the clause unmatched → LOW (never a wrong native).
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Create a number of tapped Treasure tokens equal to its toughness." }))).toBe("low"); // toughness not modeled
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Each player gets a number of rad counters equal to its power." }))).toBe("low"); // "each player" ≠ the modeled "each opponent"
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "Each opponent gets a number of rad counters equal to its power if it had a +1/+1 counter on it." }))).toBe("low"); // conditional rider
  });
});

describe("DIES-TRIGGER-RESOURCE-PAYOFFS — resolver reads ctx.dyingPower at resolution", () => {
  it("create-named-token / dyingPower mints that many tapped Treasures (dynamic — proven by mutating ctx)", () => {
    const atom = () => parseEffectProgram({ type: "Instant", oracle: "Create a number of tapped Treasure tokens equal to its power." }).atoms[0];
    let s = resolveAtom(podState(), atom(), { controller: "user", targets: [], dyingPower: 5 });
    expect(treasuresOf(s)).toHaveLength(5);
    expect(treasuresOf(s).every((t) => t.tapped)).toBe(true);
    // Fresh state, different power — proves the count is read at resolution, not baked at parse.
    let s2 = resolveAtom(podState(), atom(), { controller: "user", targets: [], dyingPower: 2 });
    expect(treasuresOf(s2)).toHaveLength(2);
  });

  it("0 power → 0 Treasures (no forced 1); ABSENT dyingPower (a spell / non-dies ctx) → 0, no crash", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "Create a number of tapped Treasure tokens equal to its power." }).atoms[0];
    let s = resolveAtom(podState(), atom, { controller: "user", targets: [], dyingPower: 0 });
    expect(treasuresOf(s)).toHaveLength(0);
    let s2;
    expect(() => { s2 = resolveAtom(podState(), atom, { controller: "user", targets: [] }); }).not.toThrow(); // no dyingPower key
    expect(treasuresOf(s2)).toHaveLength(0);
  });

  it("gain-life / dyingPower gains that much life; draw / dyingPower draws that many (the Lifeblood pair)", () => {
    const prog = parseEffectProgram({ type: "Instant", oracle: "You gain life and draw cards equal to its power." });
    let s = podState({ lib: libN(10) });
    for (const a of prog.atoms) s = resolveAtom(s, a, { controller: "user", targets: [], dyingPower: 4 });
    expect(s.players.user.life).toBe(44);
    expect(s.players.user.hand).toHaveLength(4);
  });

  it("rad / eachOpponent / dyingPower rads every OPPONENT that much, NEVER the controller", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "Each opponent gets a number of rad counters equal to its power." }).atoms[0];
    let s = resolveAtom(podState(), atom, { controller: "user", targets: [], dyingPower: 3 });
    expect(radOf(s, "ai1")).toBe(3);
    expect(radOf(s, "ai2")).toBe(3);
    expect(radOf(s, "ai3")).toBe(3);
    expect(radOf(s, "user")).toBe(0); // self-exclusion — you never rad yourself
  });
});

describe("DIES-TRIGGER-RESOURCE-PAYOFFS — destroyLethalCreatures captures power BEFORE the look-back (CR 603.6e)", () => {
  it("a -X/-X / lethal-damage SBA tags the dead entry with the LAYER-AWARE power, not the printed value", () => {
    // Printed 2/2 + 3 counters = a 5/5; mark 5 lethal damage so the SBA destroys it.
    const gold = payoffPerm("gold", "Goldvein Hydra", GOLDVEIN, 5);
    gold.damageMarked = 5;
    const s = { ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) };
    s.players.user = { ...s.players.user, battlefield: [gold] };
    const { dead } = destroyLethalCreatures(s);
    expect(dead).toHaveLength(1);
    expect(dead[0].power).toBe(5); // effective on-board power, NOT printed 2
  });
});

describe("DIES-TRIGGER-RESOURCE-PAYOFFS — END-TO-END via the real dies-trigger flush", () => {
  it("Goldvein destroyed → mints (effective power) tapped Treasures; the dies trigger fires ONCE", () => {
    const gold = payoffPerm("gold", "Goldvein Hydra", GOLDVEIN, 5); // a 5/5
    let s = podState({ user: [gold] });
    s = applyDestroyEffect(s, { controller: "ai1", targets: [{ type: "creature", id: "gold" }] });
    expect(s.players.user.battlefield.some((p) => p.id === "gold")).toBe(false); // it died
    expect((s.pendingTriggers || []).length).toBe(1); // fires exactly once
    s = flushResolve(s);
    expect(treasuresOf(s)).toHaveLength(5);
    expect(treasuresOf(s).every((t) => t.tapped)).toBe(true);
  });

  it("Lifeblood SACRIFICED → controller gains (power) life AND draws (power) cards (power captured on the sac path)", () => {
    const lb = payoffPerm("lb", "Lifeblood Hydra", LIFEBLOOD, 6); // a 6/6
    let s = podState({ user: [lb], lib: libN(10) });
    s = sacrificeCreatureEffect(s, "user", "lb");
    expect(s.players.user.battlefield.some((p) => p.id === "lb")).toBe(false);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushResolve(s);
    expect(s.players.user.life).toBe(46); // 40 + 6
    expect(s.players.user.hand).toHaveLength(6);
  });

  it("Feral Ghoul dying in COMBAT rads each opponent = its effective power; the controller is never radded", () => {
    // A 2/2 attacker with 3 counters = a 5/5. Feral Ghoul has MENACE, so it needs TWO blockers to be
    // legally blocked (a lone blocker would leave it unblocked, CR 509.1c); two 3/3 Walls deal 6 → lethal.
    const ghoul = payoffPerm("ghoul", "Feral Ghoul", FERAL, 5);
    const wall = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Wall", type: "Creature — Wall", power: 3, toughness: 3, oracle: "" }, controller: "ai1", summoningSick: false });
    let s = podState({ user: [ghoul] });
    s.players.ai1 = { ...s.players.ai1, battlefield: [wall("blk1"), wall("blk2")] };
    s = {
      ...s,
      phase: "combat", step: "combat-damage",
      combat: {
        attackers: [{ permanentId: "ghoul", attackingPlayer: "user", defender: "ai1" }],
        blockers: [
          { blockerId: "blk1", blockingPlayer: "ai1", attackerId: "ghoul" },
          { blockerId: "blk2", blockingPlayer: "ai1", attackerId: "ghoul" },
        ],
      },
    };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(s.players.user.battlefield.some((p) => p.id === "ghoul")).toBe(false); // ghoul died to 5 damage
    // exactly one SELF dies-trigger (the "another creature you control dies" watcher does NOT fire on its own death)
    const radTrigs = (s.pendingTriggers || []).filter((t) => t.descriptor?.effectClause?.includes("rad counters"));
    expect(radTrigs).toHaveLength(1);
    s = flushResolve(s);
    expect(radOf(s, "ai1")).toBe(5);
    expect(radOf(s, "ai2")).toBe(5);
    expect(radOf(s, "ai3")).toBe(5);
    expect(radOf(s, "user")).toBe(0);
  });

  it("a printed-power Goldvein (no counters) mints its PRINTED power in Treasures (the simple base case)", () => {
    const gold = createPermanent({ id: "g2", card: { id: "c-g2", name: "Goldvein Hydra", type: "Creature — Hydra", power: 3, toughness: 3, oracle: GOLDVEIN }, controller: "user", summoningSick: false });
    let s = podState({ user: [gold] });
    s = applyDestroyEffect(s, { controller: "ai1", targets: [{ type: "creature", id: "g2" }] });
    s = flushResolve(s);
    expect(treasuresOf(s)).toHaveLength(3);
  });
});
