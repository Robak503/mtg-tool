/**
 * randomDiscard.test.js — BLITZ RD-1: the SEEDED RANDOM PRIMITIVE + the RANDOM-DISCARD class.
 *
 * HOUSE POLICY (owner-blessed 2026-07-16): randomness enters the engine ONLY as a SEEDED, SERIALIZABLE,
 * REPLAY-DETERMINISTIC primitive — same seed ⇒ byte-identical game — because the sim replays recorded games
 * from their seeds and the grind data must stay reproducible. Every game-state consumer of a single random
 * integer draws through ONE function (seedMath.nextRandomInt) so the discipline can't drift.
 *
 * PART 1 — the primitive (nextRandomInt): same seed ⇒ same value; the seed ADVANCES per draw; a game
 * serialized mid-sequence continues the IDENTICAL stream (the replay guarantee); different seeds eventually
 * diverge (distribution sanity); an empty range consumes NO randomness.
 *
 * PART 2 — random discard (CR 701.9b — "Some effects... require a random discard"): "discards N cards at
 * random" rides the existing discard machinery with the CHOICE replaced by a uniform pick over the hand —
 * NO pause for any seat (human or AI). Hidden-info honest: the pick reveals nothing about the rest of the
 * hand; only the discarded card is named (public in the graveyard, CR 701.9a). Determinism pins, the discard
 * pins (hand drops by exactly 1; empty hand no-ops; each-opponent hits every opponent), and FN guards.
 *
 * NOTE ON CR NUMBERING: the Discard keyword action is CR 701.9 (701.9a move hand→graveyard; 701.9b the random
 * variant). Sibling discard code still cites the pre-renumber "701.8" (now "Destroy") — a stale citation; the
 * cite verified against the bundled cr_current.json for THIS slice is 701.9b.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { nextRandomInt, nextSeed } from "./seedMath.js";
import { serializeState, deserializeState } from "./serialization.js";
import { applyDiscard } from "./effects/atoms/hand.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";

// A minimal state with N named cards in `pid`'s hand and a threaded seed. Extra players for each-opponent.
function handState(seed, { user = [], ai = [], ai2 = null } = {}) {
  const mkHand = (arr) => arr.map((n) => ({ id: n, name: n }));
  const players = {
    user: { hand: mkHand(user), library: [], graveyard: [], battlefield: [] },
    ai: { hand: mkHand(ai), library: [], graveyard: [], battlefield: [] },
  };
  const turnOrder = ["user", "ai"];
  if (ai2) { players.ai2 = { hand: mkHand(ai2), library: [], graveyard: [], battlefield: [] }; turnOrder.push("ai2"); }
  return { rngSeed: seed >>> 0, log: [], players, turnOrder };
}
const targetAi = { controller: "user", targets: [{ type: "player", id: "ai" }], cardName: "Probe" };

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PART 1 — THE SEEDED PRIMITIVE (nextRandomInt)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe("RD-1 primitive — nextRandomInt (seeded, serializable, replay-deterministic)", () => {
  it("same seed ⇒ same value; the returned state carries the ADVANCED seed", () => {
    const a = nextRandomInt({ rngSeed: 12345 }, 6);
    const b = nextRandomInt({ rngSeed: 12345 }, 6);
    expect(a.value).toBe(b.value);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(6);
    expect(a.state.rngSeed).toBe(nextSeed(12345)); // advanced by the shared LCG step
    expect(a.state.rngSeed).not.toBe(12345);
  });

  it("a value is uniform in [0, n) for every draw across a long chain", () => {
    let s = { rngSeed: 7 };
    for (let i = 0; i < 500; i++) {
      const r = nextRandomInt(s, 5);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(5);
      s = r.state;
    }
  });

  it("different seeds eventually produce different first draws (distribution sanity)", () => {
    const seen = new Set();
    for (let seed = 0; seed < 60; seed++) seen.add(nextRandomInt({ rngSeed: seed }, 5).value);
    expect(seen.size).toBeGreaterThan(1);          // not a constant
    expect([...seen].every((v) => v >= 0 && v < 5)).toBe(true);
  });

  it("serialize/deserialize mid-sequence continues the IDENTICAL stream (the replay guarantee)", () => {
    // Uninterrupted 6-draw stream from seed 999.
    const uninterrupted = [];
    let s = { rngSeed: 999 };
    for (let i = 0; i < 6; i++) { const r = nextRandomInt(s, 10); uninterrupted.push(r.value); s = r.state; }
    // The SAME stream, but serialized→deserialized after each of the first 3 draws.
    const resumed = [];
    let t = { rngSeed: 999 };
    for (let i = 0; i < 3; i++) { const r = nextRandomInt(t, 10); resumed.push(r.value); t = r.state; }
    t = deserializeState(serializeState(t));       // save + reload mid-sequence
    for (let i = 0; i < 3; i++) { const r = nextRandomInt(t, 10); resumed.push(r.value); t = r.state; }
    expect(resumed).toEqual(uninterrupted);
  });

  it("an empty range (n ≤ 0) consumes NO randomness — the seed is untouched (advances only on a real draw)", () => {
    const s = { rngSeed: 42 };
    expect(nextRandomInt(s, 0)).toEqual({ value: 0, state: { rngSeed: 42 } });
    expect(nextRandomInt(s, -3).state.rngSeed).toBe(42);
  });

  it("a legacy state with no rngSeed self-seeds from 0 deterministically (never Math.random)", () => {
    const a = nextRandomInt({}, 8);
    const b = nextRandomInt({}, 8);
    expect(a.value).toBe(b.value);                  // reproducible, not random
    expect(a.state.rngSeed).toBe(nextSeed(0));      // derived from 0 and stored
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PART 2a — PARSER + COVERAGE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe("RD-1 parser — the who-scoped 'at random' family emits an atRandom discard atom", () => {
  const atomOf = (o) => parseEffectProgram({ type: SORCERY, oracle: o }).atoms;
  it("target player / target opponent / each player / each opponent / controller (fixed N)", () => {
    expect(atomOf("Target player discards two cards at random.")).toEqual([{ op: "discard", amount: 2, who: "target", targetType: "player", atRandom: true }]);
    expect(atomOf("Target opponent discards a card at random.")).toEqual([{ op: "discard", amount: 1, who: "target", targetType: "opponent", atRandom: true }]);
    expect(atomOf("Each player discards a card at random.")).toEqual([{ op: "discard", amount: 1, who: "eachPlayer", targetType: null, atRandom: true }]);
    expect(atomOf("Each opponent discards a card at random.")).toEqual([{ op: "discard", amount: 1, who: "eachOpponent", targetType: null, atRandom: true }]);
    expect(atomOf("Discard a card at random.")).toEqual([{ op: "discard", amount: 1, who: "controller", targetType: null, atRandom: true }]);
  });
  it("the combat 'that player discards a card at random' → who:damagedPlayer (routes ONLY on a combat event)", () => {
    expect(parseEffectClause("that player discards a card at random", "Instant").atoms)
      .toEqual([{ op: "discard", amount: 1, who: "damagedPlayer", targetType: null, atRandom: true }]);
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", effectClause: "that player discards a card at random" })).toBe(true);
    expect(triggerRoutesNatively({ event: "etb", effectClause: "that player discards a card at random" })).toBe(false); // no combat referent → parked
  });
  it("composes with draw (Goblin Lore / Control of the Court = draw N, then discard M at random)", () => {
    expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle: "Draw four cards, then discard three cards at random." }))).toBe("high");
  });

  it("FN GUARDS: X-count, riders, wrong verb, and 'chosen at random' targeting all stay LOW → Arbiter", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle: o }))).toBe("low");
    low("Target player discards X cards at random.");                                   // Mind Twist — variable X unmodeled
    low("Target player discards a card at random. Then that player discards another card at random unless they pay {1}."); // Flay — unless-pay rider
    low("Target player discards two cards at random unless that player has Skullscorch deal 4 damage to them."); // Skullscorch — unless rider
    low("Target opponent discards a card at random, then discards a card.");            // Stupor — extra chooser discard tail
    low("Goblin Sniper deals 1 damage to target opponent chosen at random.");          // a TARGET chosen at random — NOT discard (untouched)
    low("Discard a card at random. If you do, Kindle the Carnage deals damage equal to that card's mana value to each creature."); // Kindle — "if you do" rider
  });
});

describe("RD-1 coverage — the whole-card flips (all-or-nothing; each audited by name in the flip-diff)", () => {
  it("bare / composite spells → native-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Hymn to Tourach", oracle: "Target player discards two cards at random." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Specter's Wail", oracle: "Target player discards a card at random." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Mind Knives", oracle: "Target opponent discards a card at random." })).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "Goblin Lore", oracle: "Draw four cards, then discard three cards at random." })).toBe("native-spell");
  });
  it("triggers → native-trigger (ETB / dies / combat)", () => {
    expect(classifyCard({ type: "Creature — Rat", name: "Sanity Gnawers", power: 1, toughness: 1, oracle: "When this creature enters, target player discards a card at random." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Zombie Cat", name: "Black Cat", power: 1, toughness: 1, oracle: "When this creature dies, target opponent discards a card at random." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Specter", name: "Hypnotic Specter", power: 2, toughness: 2, oracle: "Flying\nWhenever this creature deals damage to an opponent, that player discards a card at random." })).toBe("native-trigger");
  });
  it("activated abilities → native-activated (sac cost / tap cost, the granted sliver form)", () => {
    expect(classifyCard({ type: "Creature — Horror", name: "Urborg Mindsucker", power: 2, toughness: 2, oracle: "{B}, Sacrifice this creature: Target opponent discards a card at random. Activate only as a sorcery." })).toBe("native-activated");
    expect(classifyCard({ type: "Artifact", name: "Ring of Renewal", oracle: "{5}, {T}: Discard a card at random, then draw two cards." })).toBe("native-activated");
    expect(classifyCard({ type: "Creature — Sliver", name: "Mindwhip Sliver", power: 1, toughness: 1, oracle: 'All Slivers have "{2}, Sacrifice this permanent: Target player discards a card at random. Activate only as a sorcery."' })).toBe("native-static");
  });
  it("CREED: an unmodeled rider keeps the WHOLE card off native (safe FN)", () => {
    // Urgoros — the "If the player can't, you draw a card" rider is unmodeled → not native.
    expect(classifyCard({ type: "Creature — Specter", name: "Urgoros, the Empty One", power: 4, toughness: 4, oracle: "Flying\nWhenever Urgoros deals combat damage to a player, that player discards a card at random. If the player can't, you draw a card." })).not.toBe("native-trigger");
    // Mind Twist — the X count is unmodeled → arbiter.
    expect(classifyCard({ type: SORCERY, name: "Mind Twist", oracle: "Target player discards X cards at random." })).toBe("arbiter-spell");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PART 2b — THE RESOLVER (applyDiscard, atRandom)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe("RD-1 resolver — uniform pick, no pause, hidden-info honest", () => {
  const A1 = { op: "discard", amount: 1, who: "target", targetType: "player", atRandom: true };

  it("hand size drops by EXACTLY 1; no pendingChoice for anyone; the seed advanced", () => {
    const out = applyDiscard(handState(12345, { ai: ["A", "B", "C"] }), A1, targetAi);
    expect(out.players.ai.hand).toHaveLength(2);
    expect(out.players.ai.graveyard).toHaveLength(1);
    expect(out.pendingChoice).toBeUndefined();
    expect(out.rngSeed).not.toBe(12345);
  });

  it("same seed ⇒ same card discarded; a different seed can pick a different card (serialize-stable)", () => {
    const g = (seed) => applyDiscard(handState(seed, { ai: ["A", "B", "C", "D", "E"] }), A1, targetAi).players.ai.graveyard[0].id;
    expect(g(12345)).toBe(g(12345));               // determinism
    const spread = new Set(); for (let s = 0; s < 40; s++) spread.add(g(s));
    expect(spread.size).toBeGreaterThan(1);        // different seeds reach different cards
    expect([...spread].every((id) => "ABCDE".includes(id))).toBe(true);
  });

  it("empty hand → a clean no-op (nothing discarded, no seed consumed, no pause)", () => {
    const out = applyDiscard(handState(7, { ai: [] }), A1, targetAi);
    expect(out.players.ai.graveyard).toHaveLength(0);
    expect(out.rngSeed).toBe(7);                    // no draw made → seed untouched
    expect(out.pendingChoice).toBeUndefined();
  });

  it("N random discards remove N DISTINCT cards (without replacement)", () => {
    const A2 = { op: "discard", amount: 2, who: "target", targetType: "player", atRandom: true };
    const out = applyDiscard(handState(999, { ai: ["A", "B", "C"] }), A2, targetAi);
    expect(out.players.ai.graveyard).toHaveLength(2);
    expect(out.players.ai.hand).toHaveLength(1);
    expect(new Set(out.players.ai.graveyard.map((c) => c.id)).size).toBe(2); // distinct
  });

  it("discard N > hand size → discards the whole hand (never fabricates a card)", () => {
    const A3 = { op: "discard", amount: 3, who: "target", targetType: "player", atRandom: true };
    const out = applyDiscard(handState(5, { ai: ["A"] }), A3, targetAi);
    expect(out.players.ai.hand).toHaveLength(0);
    expect(out.players.ai.graveyard.map((c) => c.id)).toEqual(["A"]);
  });

  it("EACH-OPPONENT hits EVERY opponent, never the controller (multiplayer)", () => {
    const EO = { op: "discard", amount: 1, who: "eachOpponent", targetType: null, atRandom: true };
    const ctx = { controller: "user", targets: [], cardName: "Probe" };
    const out = applyDiscard(handState(3, { user: ["U1", "U2"], ai: ["A1", "A2"], ai2: ["B1", "B2"] }), EO, ctx);
    expect(out.players.user.hand).toHaveLength(2);  // the controller is spared
    expect(out.players.ai.hand).toHaveLength(1);     // each opponent lost one
    expect(out.players.ai2.hand).toHaveLength(1);
  });

  it("EACH-PLAYER hits every player INCLUDING the controller", () => {
    const EP = { op: "discard", amount: 1, who: "eachPlayer", targetType: null, atRandom: true };
    const ctx = { controller: "user", targets: [], cardName: "Probe" };
    const out = applyDiscard(handState(3, { user: ["U1", "U2"], ai: ["A1", "A2"] }), EP, ctx);
    expect(out.players.user.hand).toHaveLength(1);
    expect(out.players.ai.hand).toHaveLength(1);
  });

  it("HIDDEN-INFO honest: the log names ONLY the discarded card, never the rest of the hand", () => {
    const out = applyDiscard(handState(12345, { ai: ["A", "B", "C"] }), A1, targetAi);
    const ev = out.log.filter((e) => e.effect === "discard" && e.atRandom);
    expect(ev).toHaveLength(1);
    const discardedId = out.players.ai.graveyard[0].id;
    expect(ev[0].card).toBe(discardedId);            // the discarded card IS named (public in the graveyard)
    // No field on the event enumerates the remaining hand — the pick leaked nothing.
    const kept = out.players.ai.hand.map((c) => c.name);
    for (const e of out.log) expect(JSON.stringify(e)).not.toContain(kept.join(""));
  });

  it("mid-sequence serialize/deserialize continues the SAME random-discard stream", () => {
    const EP = { op: "discard", amount: 1, who: "eachPlayer", targetType: null, atRandom: true };
    const ctx = { controller: "user", targets: [], cardName: "Probe" };
    // Uninterrupted: user then ai each lose one at random.
    const straight = applyDiscard(handState(2024, { user: ["U1", "U2", "U3"], ai: ["A1", "A2", "A3"] }), EP, ctx);
    // Same effect, but the state is round-tripped through serialization BEFORE the pick runs.
    const reloaded = applyDiscard(deserializeState(serializeState(handState(2024, { user: ["U1", "U2", "U3"], ai: ["A1", "A2", "A3"] }))), EP, ctx);
    expect(reloaded.players.user.graveyard.map((c) => c.id)).toEqual(straight.players.user.graveyard.map((c) => c.id));
    expect(reloaded.players.ai.graveyard.map((c) => c.id)).toEqual(straight.players.ai.graveyard.map((c) => c.id));
    expect(reloaded.rngSeed).toBe(straight.rngSeed);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PART 2c — RUNTIME END-TO-END
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe("RD-1 runtime — a targeted random-discard SPELL (Specter's Wail)", () => {
  function castState(seed) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, rngSeed: seed, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [{ id: "sw", name: "Specter's Wail", type: SORCERY, mana: "{B}", oracle: "Target player discards a card at random." }], manaPool: { ...s.players.user.manaPool, B: 4, C: 4 } },
        ai: { ...s.players.ai, hand: [{ id: "x1", name: "One" }, { id: "x2", name: "Two" }, { id: "x3", name: "Three" }] },
      },
    };
  }
  it("resolves with NO pause for either seat and pitches exactly one of the target's cards at random", () => {
    const s = castState(12345);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "sw" && a.targets?.some((t) => t.id === "ai"));
    expect(cast).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.pendingChoice).toBeUndefined();     // no chooser — random discard never pauses
    expect(after.players.ai.hand).toHaveLength(2);    // exactly one gone
    expect(after.players.ai.graveyard).toHaveLength(1);
    // Determinism: the SAME seed re-run pitches the SAME card.
    const s2 = castState(12345);
    const cast2 = filterActions(legalActionsForPlayer(s2, "user"), "cast-spell").find((a) => a.cardId === "sw" && a.targets?.some((t) => t.id === "ai"));
    const after2 = resolveTopOfStack(dispatchAction(s2, cast2));
    expect(after2.players.ai.graveyard[0].id).toBe(after.players.ai.graveyard[0].id);
  });
});

describe("RD-1 runtime — Hypnotic Specter (combat-damage trigger fires random discard)", () => {
  const HYP = "Flying\nWhenever this creature deals damage to an opponent, that player discards a card at random.";
  it("detects a combatDamageToPlayer trigger that routes natively", () => {
    const d = detectTriggers({ name: "Hypnotic Specter", type: "Creature — Specter", oracle: HYP });
    expect(d).toEqual([expect.objectContaining({ event: "combatDamageToPlayer", effectClause: "that player discards a card at random" })]);
    expect(d.every(triggerRoutesNatively)).toBe(true);
  });
  it("connecting in combat pitches one of the damaged player's cards at random, no pause", () => {
    const spec = createPermanent({ id: "hyp", card: { id: "c-hyp", name: "Hypnotic Specter", type: "Creature — Specter", power: 2, toughness: 2, oracle: HYP }, controller: "user", summoningSick: false });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...s0, rngSeed: 555, activePlayer: "user", phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "hyp", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [spec], life: 40 },
        ai: { ...s0.players.ai, life: 40, hand: [{ id: "x1", name: "One" }, { id: "x2", name: "Two" }, { id: "x3", name: "Three" }] },
      },
    };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);              // 2 combat damage connected
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((s.stack || []).length && !s.pendingChoice && g++ < 30) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toBeFalsy();             // random discard — no chooser pause
    expect(s.players.ai.hand).toHaveLength(2);
    expect(s.players.ai.graveyard).toHaveLength(1);
  });
});
