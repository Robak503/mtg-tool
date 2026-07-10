/**
 * ===== CDMG-PLAYER-PAYOFF ===== combat-damage-to-a-player payoffs whose ACTOR/COUNT is the trigger referent
 * the combat-damage trigger carries in ctx ({damagedPlayerId, combatDamageAmount}, set by
 * triggers.checkCombatDamageTriggers, flushed into baseParams.context by gameEngine.buildTriggerStack — the
 * SAME path Wave-1's treasure "create that many tokens" used).
 *
 * Cards modeled:
 *   - "draw that many cards" — count = the combat-damage amount (Starwinder "you may draw that many cards",
 *     Glint-Eye Nephilim / Fear of Failed Tests bare); optional set by the "you may" wrapper.
 *   - "they get N rad counters" / "that player gets N rad counters" — a FIXED-N rad grant to the just-damaged
 *     player (Glowing One "they get four rad counters"). who:"damagedPlayer" reads ctx.damagedPlayerId.
 *   - "they get that many rad counters" — the count IS the combat-damage amount (Infesting Radroach).
 *
 * CREED: countContext floors at 0 (never forced to 1); an absent damagedPlayerId / combatDamageAmount is a
 * clean no-op, never a fabricated count or a wrong recipient. A trailing rider ("…, then discard a card" /
 * "…if they don't have any rad counters" / "…or planeswalker") fails the $ anchor → low → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { resolveOptionalChoice } from "../runProgram.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { checkCombatDamageTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

// Bare 2P state; `lib` seeds the user's library so a draw has cards to take (drawCards is library-bounded).
function stateWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library: over.lib || [], life: 40 },
      ai: { ...s.players.ai, battlefield: over.ai || [], life: 40 },
    },
  };
}

// N filler library cards (any object — drawCards just moves them to hand).
const libN = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: `Filler ${i}`, type: "Instant" }));
const handSize = (s, pid = "user") => s.players[pid].hand.length;
const radOf = (s, pid) => s.players[pid].radCounters || 0;

describe("CDMG-PLAYER-PAYOFF — parser", () => {
  it("'draw that many cards' → draw / combatDamageAmount, not optional, no chosen target", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Draw that many cards." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "draw", countContext: "combatDamageAmount", optional: false, targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("'you may draw that many cards' (Starwinder) → optional:true", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "You may draw that many cards." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "draw", countContext: "combatDamageAmount", optional: true });
  });

  it("'they get four rad counters' (Glowing One) → rad / damagedPlayer / amount 4, no chosen target", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "They get four rad counters." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "rad", who: "damagedPlayer", amount: 4, targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("'that player gets two rad counters' → rad / damagedPlayer / amount 2", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player gets two rad counters." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "rad", who: "damagedPlayer", amount: 2 });
  });

  it("'they get that many rad counters' (Infesting Radroach) → rad / damagedPlayer / combatDamageAmount", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "They get that many rad counters." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "rad", who: "damagedPlayer", countContext: "combatDamageAmount", targetType: null });
  });

  // April's "draw that many cards, then discard a card" is the LOOT sequence the ", then" splitter handles —
  // it composes to TWO fully-modeled atoms (draw combatDamageAmount, then discard 1), so it's correctly HIGH
  // (no clause dropped). This proves the countContext draw composes with the existing discard atom verbatim.
  it("'draw that many cards, then discard a card' (April) → HIGH two-atom loot (draw + discard), no dropped clause", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Draw that many cards, then discard a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "draw", countContext: "combatDamageAmount" });
    expect(p.atoms[1]).toMatchObject({ op: "discard", amount: 1 });
  });

  it("Vexing Radgull's rad-or-proliferate branch is MODELED (SHELF S7 — one atom, HIGH)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player gets two rad counters if they don't have any rad counters. Otherwise, proliferate." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "rad", who: "damagedPlayer", amount: 2, ifNoRadElseProliferate: true, targetType: null }]);
  });
});

describe("CDMG-PLAYER-PAYOFF — draw resolver (countContext)", () => {
  const atom = () => parseEffectProgram({ type: "Instant", oracle: "Draw that many cards." }).atoms[0];

  it("draws combatDamageAmount cards (dynamic — proven by mutating the ctx)", () => {
    let s = stateWith({ lib: libN(10) });
    s = resolveAtom(s, atom(), { controller: "user", targets: [], combatDamageAmount: 4 });
    expect(handSize(s)).toBe(4);
    // Re-resolve with a DIFFERENT amount on a fresh state to prove the count is read at resolution, not baked.
    let s2 = stateWith({ lib: libN(10) });
    s2 = resolveAtom(s2, atom(), { controller: "user", targets: [], combatDamageAmount: 7 });
    expect(handSize(s2)).toBe(7);
  });

  it("0 combat damage → draws 0 (no forced 1); absent context → 0", () => {
    let s = stateWith({ lib: libN(5) });
    s = resolveAtom(s, atom(), { controller: "user", targets: [], combatDamageAmount: 0 });
    expect(handSize(s)).toBe(0);
    let s2 = stateWith({ lib: libN(5) });
    s2 = resolveAtom(s2, atom(), { controller: "user", targets: [] }); // no combatDamageAmount key at all
    expect(handSize(s2)).toBe(0);
  });
});

describe("CDMG-PLAYER-PAYOFF — rad resolver (who:damagedPlayer)", () => {
  it("'they get two rad counters' rads the DAMAGED player, not the controller", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "They get two rad counters." }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(radOf(s, "ai")).toBe(2);
    expect(radOf(s, "user")).toBe(0);
  });

  it("'they get that many rad counters' = combatDamageAmount on the damaged player", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "They get that many rad counters." }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [], damagedPlayerId: "ai", combatDamageAmount: 3 });
    expect(radOf(s, "ai")).toBe(3);
    expect(radOf(s, "user")).toBe(0);
  });

  it("0 combat damage → 0 rad (no forced 1)", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "They get that many rad counters." }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [], damagedPlayerId: "ai", combatDamageAmount: 0 });
    expect(radOf(s, "ai")).toBe(0);
  });

  it("absent damagedPlayerId (a spell / non-combat trigger) → clean no-op, no crash, no fabrication", () => {
    const fixed = parseEffectProgram({ type: "Instant", oracle: "They get four rad counters." }).atoms[0];
    let s = stateWith();
    expect(() => { s = resolveAtom(s, fixed, { controller: "user", targets: [] }); }).not.toThrow();
    expect(radOf(s, "ai")).toBe(0);
    expect(radOf(s, "user")).toBe(0);
    const dyn = parseEffectProgram({ type: "Instant", oracle: "They get that many rad counters." }).atoms[0];
    let s2 = stateWith();
    expect(() => { s2 = resolveAtom(s2, dyn, { controller: "user", targets: [], combatDamageAmount: 5 }); }).not.toThrow();
    expect(radOf(s2, "ai")).toBe(0);
    expect(radOf(s2, "user")).toBe(0);
  });
});

describe("CDMG-PLAYER-PAYOFF — END-TO-END via the real combat-damage trigger flush", () => {
  it("Glowing One dealing combat damage rads the damaged player four", () => {
    // "Whenever this creature deals combat damage to a player, they get four rad counters."
    const glow = createPermanent({
      id: "glow",
      card: { id: "c-glow", name: "Glowing One", type: "Creature — Mutant", power: 3, toughness: 3,
        oracle: "Deathtouch\nWhenever this creature deals combat damage to a player, they get four rad counters." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [glow] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "glow", attackingPlayer: "user", defender: "ai", amount: 3 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    expect(radOf(s, "ai")).toBe(4);
    expect(radOf(s, "user")).toBe(0);
  });

  it("Infesting Radroach 'they get that many' rads the damaged player = the combat damage dealt", () => {
    const roach = createPermanent({
      id: "roach",
      card: { id: "c-roach", name: "Infesting Radroach", type: "Creature — Insect Mutant", power: 5, toughness: 1,
        oracle: "Flying\nWhenever this creature deals combat damage to a player, they get that many rad counters." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [roach] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "roach", attackingPlayer: "user", defender: "ai", amount: 5 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    expect(radOf(s, "ai")).toBe(5);
    expect(radOf(s, "user")).toBe(0);
  });

  it("Starwinder 'you may draw that many cards' — the optional pauses, then taking it draws the damage amount", () => {
    const star = createPermanent({
      id: "star",
      card: { id: "c-star", name: "Starwinder", type: "Creature — Beast", power: 4, toughness: 4,
        oracle: "Whenever a creature you control deals combat damage to a player, you may draw that many cards." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [star], lib: libN(10) });
    const handBefore = handSize(s);
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "star", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    // α2 — the "you may" draw SUSPENDS for a take/decline choice (it has NOT drawn yet).
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    expect(handSize(s)).toBe(handBefore);
    // Taking it draws combatDamageAmount (4) — the context rode along in the resume payload.
    s = resolveOptionalChoice(s, true);
    expect(handSize(s)).toBe(handBefore + 4);
  });

  it("Starwinder declining the optional draws nothing", () => {
    const star = createPermanent({
      id: "star2",
      card: { id: "c-star2", name: "Starwinder", type: "Creature — Beast", power: 4, toughness: 4,
        oracle: "Whenever a creature you control deals combat damage to a player, you may draw that many cards." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [star], lib: libN(10) });
    const handBefore = handSize(s);
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "star2", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    s = resolveOptionalChoice(s, false);
    expect(handSize(s)).toBe(handBefore);
  });
});
