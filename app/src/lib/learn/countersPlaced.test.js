/**
 * countersPlaced.test.js — COUNTERS-PLACED trigger bind (CR 122.1 / 122.6 — placing one or more +1/+1
 * counters on a creature is a SINGLE event).
 *
 * detectTriggers' classifyCondition had no "countersPlaced" case, so a "Whenever you put one or more +1/+1
 * counters on a creature [you control]" condition was UNDETECTED and the whole card routed to the Arbiter.
 * This slice supplies the missing BIND:
 *   - the `countersPlaced` event in classifyCondition (two scopes: "creatureYouControl" / "creature"),
 *   - checkCounterPlacedTriggers (fired off the +1/+1 placement chokepoint — applyAddCounter in
 *     effects/atoms/counters.js — controller-scoped, ONCE per placement event, count = the placed amount),
 *   - the detectTriggers "that many"/"that much" → countContext:"countersPlaced" sentinel rewrite,
 *   - the parser sentinels + draw/gain-life joining ONCE_PER_TURN_HONORED (so the "Do this only once each
 *     turn." rider parses HIGH instead of forcing the program low).
 *
 * CREED (the load-bearing invariants this guards):
 *   - The trigger fires ONLY for the PLACER's own placements (controller-scoped) — an OPPONENT placing
 *     counters never fires your ability.
 *   - It fires ONCE per placement event (CR 122.6), NOT once per counter; "that many"/"that much" = the
 *     NUMBER placed in that event.
 *   - scope "creatureYouControl" counts only counters on creatures the PLACER controls; scope "creature"
 *     counts any creature's.
 *   - A RESTRICTED subject ("another creature", "another colorless creature", "this creature", "other
 *     Heroes") is NOT detected → Arbiter (a SAFE false-negative). A recognized event whose PAYOFF can't
 *     parse HIGH (Casey Jones "deals that much damage to target opponent", Stocking the Pantry "put a
 *     supply counter on this enchantment") routes the WHOLE card to the Arbiter, never a partial.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCounterPlacedTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyAddCounter } from "./effects/atoms/counters.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const resolveAll = (s) => { let g = 0; while (s.stack.length && g++ < 80) s = resolveTopOfStack(s); return s; };
// Auto-take every queued "you may" optional (the controller plays to its benefit — draw/gain).
const settleOptionals = (s) => { let g = 0; while (s.pendingChoice && s.pendingChoice.kind === "optional-effect" && g++ < 20) { s = resolveOptionalChoice(s, true); s = resolveAll(s); } return s; };

const TERRA = "Whenever you put one or more +1/+1 counters on a creature you control, you may draw that many cards. Do this only once each turn.";
const EKG = "Whenever you put one or more +1/+1 counters on a creature, you may gain that much life. Do this only once each turn.";

// ─── Detection ────────────────────────────────────────────────────────────────────
describe("detectTriggers — the countersPlaced event (both corpus scopes)", () => {
  const C = (oracle) => ({ name: "X", type: "Creature — Beast", oracle });
  it("'on a creature you control' → countersPlaced, scope:creatureYouControl", () => {
    const d = detectTriggers(C(TERRA)).find((x) => x.event === "countersPlaced");
    expect(d).toMatchObject({ event: "countersPlaced", scope: "creatureYouControl" });
  });
  it("'on a creature' (any) → countersPlaced, scope:creature", () => {
    const d = detectTriggers(C(EKG)).find((x) => x.event === "countersPlaced");
    expect(d).toMatchObject({ event: "countersPlaced", scope: "creature" });
  });
  it("the effectClause is rewritten to the countContext:countersPlaced sentinel (not combatDamageAmount)", () => {
    const d = detectTriggers(C(TERRA)).find((x) => x.event === "countersPlaced");
    expect(d.effectClause).toMatch(/draw that many counters-placed cards/i);
    const prog = parseEffectClause(d.effectClause, "Enchantment");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "draw", countContext: "countersPlaced", optional: true, oncePerTurn: true });
  });
  it("the gain-life variant rewrites + parses HIGH with countContext:countersPlaced", () => {
    const d = detectTriggers(C(EKG)).find((x) => x.event === "countersPlaced");
    const prog = parseEffectClause(d.effectClause, "Creature");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "gain-life", countContext: "countersPlaced", optional: true, oncePerTurn: true });
  });
  // CREED — restricted subjects must NOT be detected (the engine can't faithfully scope them → Arbiter).
  it("'on ANOTHER creature' (source-exclusion, Knight of Wundagore) is NOT detected", () => {
    expect(detectTriggers(C("Whenever you put a +1/+1 counter on another creature, put a +1/+1 counter on this creature.")).some((x) => x.event === "countersPlaced")).toBe(false);
  });
  it("'on another COLORLESS creature' (Omarthis) is NOT detected", () => {
    expect(detectTriggers(C("Whenever you put one or more +1/+1 counters on another colorless creature, you may put a +1/+1 counter on Omarthis.")).some((x) => x.event === "countersPlaced")).toBe(false);
  });
  it("'on THIS creature' (Exemplar of Light — that's the self IT-COUNTER path, not this event) is NOT detected", () => {
    expect(detectTriggers(C("Whenever you put one or more +1/+1 counters on this creature, draw a card.")).some((x) => x.event === "countersPlaced")).toBe(false);
  });
  it("'on one or more other Heroes you control' (Invisible Woman — subtype filter) is NOT detected", () => {
    expect(detectTriggers(C("Whenever you put one or more +1/+1 counters on one or more other Heroes you control, you may create a 0/4 colorless Wall creature token with defender.")).some((x) => x.event === "countersPlaced")).toBe(false);
  });
});

// ─── checkCounterPlacedTriggers (unit) — controller-scope, once-per-event, scope counts ──
describe("checkCounterPlacedTriggers — scope counts, controller filter, once-per-event cardinality", () => {
  function board(oracle, controller = "user", placeOn = "user") {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "watcher", card: { name: "W", type: "Enchantment", oracle }, controller });
    return { ...s, players: { ...s.players, [placeOn]: { ...s.players[placeOn], battlefield: [perm] } } };
  }
  const cpOf = (s) => (s.pendingTriggers || []).filter((t) => t.event === "countersPlaced");

  it("fires EXACTLY ONCE per placement event (CR 122.6 — not once per counter), count = placed amount", () => {
    const s = board(TERRA);
    const out = checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 5, placedOnAny: 5 });
    expect(cpOf(out)).toHaveLength(1);
    expect(cpOf(out)[0].context.countersPlaced).toBe(5);
  });
  it("scope creatureYouControl reads placedOnYours (not placedOnAny)", () => {
    const s = board(TERRA);
    // 2 placed on the placer's creatures, 3 more on others' → the "you control" trigger sees 2.
    const out = checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 2, placedOnAny: 5 });
    expect(cpOf(out)).toHaveLength(1);
    expect(cpOf(out)[0].context.countersPlaced).toBe(2);
  });
  it("scope creatureYouControl does NOT fire when the placement hit only OTHERS' creatures (placedOnYours 0)", () => {
    const s = board(TERRA);
    expect(cpOf(checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 0, placedOnAny: 3 }))).toHaveLength(0);
  });
  it("scope creature (any) reads placedOnAny", () => {
    const s = board(EKG);
    const out = checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 0, placedOnAny: 4 });
    expect(cpOf(out)).toHaveLength(1);
    expect(cpOf(out)[0].context.countersPlaced).toBe(4);
  });
  it("controller-scoped: ONLY the PLACER's watchers are scanned (an opponent placing never fires yours)", () => {
    const s = board(TERRA); // watcher controlled by user
    // ai1 places counters → the user's Terrasymbiosis is not scanned.
    expect(cpOf(checkCounterPlacedTriggers(s, { placingPlayerId: "ai1", placedOnYours: 3, placedOnAny: 3 }))).toHaveLength(0);
    // user places → fires.
    expect(cpOf(checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 3, placedOnAny: 3 }))).toHaveLength(1);
  });
  it("is a clean no-op when no +1/+1 landed on a creature (placedOnAny 0) or the placer is missing", () => {
    const s = board(TERRA);
    expect(checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 0, placedOnAny: 0 })).toBe(s);
    expect(checkCounterPlacedTriggers(s, { placingPlayerId: "ghost", placedOnYours: 1, placedOnAny: 1 })).toBe(s);
    expect(checkCounterPlacedTriggers(s, {})).toBe(s);
  });
});

// ─── Runtime — the +1/+1 placement chokepoint (applyAddCounter) ─────────────────────
describe("runtime — applyAddCounter fires the countersPlaced trigger, which resolves the payoff", () => {
  function withWatcher(oracle, { creatures = [], life = 40, lib = [] } = {}) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const watcher = createPermanent({ id: "watcher", card: { name: "W", type: "Enchantment", oracle }, controller: "user" });
    const perms = { user: [watcher], ai1: [] };
    for (const c of creatures) perms[c.controller] = [...(perms[c.controller] || []), createPermanent({ id: c.id, card: { name: c.id, type: "Creature — Bear", power: 2, toughness: 2 }, controller: c.controller })];
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, life, library: lib, hand: [], battlefield: perms.user },
        ai1: { ...s.players.ai1, battlefield: perms.ai1 || [] },
      },
    };
  }
  const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, name: "C" + i, type: "Instant" }));

  it("Terrasymbiosis draws THAT MANY (N counters on your creature → draw N) and flips native", () => {
    expect(classifyCard({ name: "Terrasymbiosis", type: "Enchantment", oracle: TERRA })).toBe("native-trigger");
    let s = withWatcher(TERRA, { creatures: [{ id: "bear", controller: "user" }], lib: lib(10) });
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 3 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(3);                                   // drew exactly 3
    expect(s.players.user.battlefield.find((p) => p.id === "bear").counters).toEqual({ "+1/+1": 3 });
  });

  it("Earth Kingdom General gains THAT MUCH and flips native — fires even on an OPPONENT's creature ('on a creature')", () => {
    expect(classifyCard({ name: "Earth Kingdom General", type: "Creature — Human Soldier Ally", oracle: EKG })).toBe("native-trigger");
    let s = withWatcher(EKG, { creatures: [{ id: "aibear", controller: "ai1" }], life: 40 });
    // user places 2 +1/+1 counters on the OPPONENT's creature → "on a creature" (any) fires, gain 2.
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 2 }, { controller: "user", targets: [{ type: "creature", id: "aibear", controller: "ai1" }] });
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.life).toBe(42);
  });

  it("the trigger fires ONCE per multi-counter event (not once per counter)", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "bear", controller: "user" }], lib: lib(10) });
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 4 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "countersPlaced")).toHaveLength(1); // one trigger, not four
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(4);
  });

  it("ONCE-PER-TURN — a SECOND placement the same turn does NOT draw again (CR frequency latch)", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "bear", controller: "user" }], lib: lib(20) });
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 2 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(2);
    // second placement same turn — the trigger still goes on the stack, but the draw is gated off.
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 5 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(2); // STILL 2 — once each turn
    expect(s.onceTriggersFiredThisTurn?.watcher_draw).toBe(true);
  });

  it("controller-scoped: an OPPONENT placing +1/+1 counters does NOT fire the user's Terrasymbiosis", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "aibear", controller: "ai1" }], lib: lib(10) });
    // ai1 places counters on its own creature.
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 3 }, { controller: "ai1", targets: [{ type: "creature", id: "aibear", controller: "ai1" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "countersPlaced")).toHaveLength(0);
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(0); // user drew nothing
  });

  it("scope creatureYouControl does NOT fire when the user places counters on an OPPONENT's creature", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "aibear", controller: "ai1" }], lib: lib(10) });
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 2 }, { controller: "user", targets: [{ type: "creature", id: "aibear", controller: "ai1" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "countersPlaced")).toHaveLength(0);
  });

  it("a -1/-1 counter placement NEVER feeds the +1/+1 watcher", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "bear", controller: "user" }], lib: lib(10) });
    s = applyAddCounter(s, { counterType: "-1/-1", amount: 1 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "countersPlaced")).toHaveLength(0);
  });

  it("declining the optional 'you may draw' does NOT consume the once-per-turn latch (can still draw later)", () => {
    let s = withWatcher(TERRA, { creatures: [{ id: "bear", controller: "user" }], lib: lib(10) });
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 2 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    s = resolveAll(flushTriggers(s));
    // decline the first "may"
    let g = 0; while (s.pendingChoice && s.pendingChoice.kind === "optional-effect" && g++ < 5) { s = resolveOptionalChoice(s, false); s = resolveAll(s); }
    expect(s.players.user.hand).toHaveLength(0);                 // declined → no draw
    expect(s.onceTriggersFiredThisTurn?.watcher_draw).toBeUndefined(); // gate NOT set (the atom never ran)
    // a later placement the same turn can now draw (the gate was never consumed).
    s = applyAddCounter(s, { counterType: "+1/+1", amount: 3 }, { controller: "user", targets: [{ type: "creature", id: "bear", controller: "user" }] });
    s = settleOptionals(resolveAll(flushTriggers(s)));
    expect(s.players.user.hand).toHaveLength(3);
  });
});

// ─── CREED — a recognized event whose payoff is unmodeled routes the WHOLE card to the Arbiter ──
describe("CREED — recognized event, unmodeled payoff → body-only (no partial)", () => {
  it("Casey Jones ('deals that much damage to target opponent') stays body-only", () => {
    expect(classifyCard({ name: "Casey Jones, Back Alley Brute", type: "Legendary Creature — Human Berserker", oracle: "Menace\nWhenever Casey Jones attacks, put a +1/+1 counter on target attacking creature.\nWhenever you put one or more +1/+1 counters on a creature you control, Casey Jones deals that much damage to target opponent." })).toBe("body-only");
  });
  it("Stocking the Pantry flips native-mixed (SHELF S7: the named self-counter noun covers 'this enchantment'; the γ1c remove-counter draw was already modeled)", () => {
    expect(classifyCard({ name: "Stocking the Pantry", type: "Enchantment", oracle: "Whenever you put one or more +1/+1 counters on a creature you control, put a supply counter on this enchantment.\n{2}, Remove a supply counter from this enchantment: Draw a card." })).toBe("native-mixed");
  });
  it("Ant-Man (singular 'a +1/+1 counter' + token payoff) stays body-only — not in scope", () => {
    expect(classifyCard({ name: "Ant-Man, Colony Commander", type: "Legendary Creature — Human Rogue Hero", oracle: "Whenever Ant-Man attacks, you may pay {1}. When you do, put a +1/+1 counter on target creature.\nWhenever you put a +1/+1 counter on a creature, create a 1/1 green Insect creature token. This ability triggers only once each turn." })).toBe("body-only");
  });
});
