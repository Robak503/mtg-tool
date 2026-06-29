/**
 * ===== CDMG-DISCARD ===== "That player discards N cards" on a combat-damage trigger — the just-combat-damaged
 * player (the damagedPlayer referent the combat-damage trigger carries in ctx.damagedPlayerId, set by
 * triggers.checkCombatDamageTriggers). Mirrors the rad/mill damagedPlayer subjects (cdmgPayoff.test.js — the rad
 * payoffs; Sword of Body and Mind's mill). Cards: Chilling Apparition, Blazing Specter, Abyssal Specter, Dimir
 * Cutpurse, Odylic Wraith, Order of Yawgmoth, Wei Night Raiders, Larceny, Specter's Shroud.
 *
 * CREED pins:
 *   - the parser admits ONLY "that player discards N cards" (a/one/N), NON-targeted (who:"damagedPlayer",
 *     targetType:null → routes natively on the combat-damage flush). A rider ("…and you untap all lands you
 *     control" — Sword of Feast and Famine) keeps its tail → low → Arbiter (never a dropped clause).
 *   - "that player discards THAT card" (the reveal-then-discard discard-chosen family — Gix's Caress) wants
 *     "that card" not "a/N cards" and NEVER matches this anchor.
 *   - the resolver discards the DAMAGED player's card, not the controller's; an absent referent (a spell, a
 *     non-combat trigger) is a clean no-op (never a fabrication / wrong recipient).
 *   - SPELL GUARD: a spell carrying this atom (Frightful Delusion's counter back-reference, Ozai's Cruelty's
 *     damage-target back-reference) is NOT native — a spell never supplies ctx.damagedPlayerId, so the discard
 *     would silently drop. spellIsNative rejects it → the whole spell stays arbiter-spell (a SAFE false-negative).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { resolveDiscardChoice, autoPickDiscardCandidate } from "../runProgram.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { checkCombatDamageTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";
import { classifyCard } from "../../coverage.js";

beforeEach(() => _resetIdsForTests());

const hc = (id, name, cmc = 2) => ({ id, name, type: "Sorcery", mana: `{${cmc}}`, cmc, oracle: "" });

function stateWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], hand: over.userHand || [], life: 40 },
      ai: { ...s.players.ai, battlefield: over.ai || [], hand: over.aiHand || [], life: 40 },
    },
  };
}
const handSize = (s, pid) => s.players[pid].hand.length;

describe("CDMG-DISCARD — parser", () => {
  it("'that player discards a card' → discard / damagedPlayer / amount 1, NON-targeted", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "discard", amount: 1, who: "damagedPlayer", targetType: null });
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("'that player discards two cards' (Ozai's Cruelty payoff form) → amount 2", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards two cards." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "discard", amount: 2, who: "damagedPlayer", targetType: null });
  });

  it("Dimir Cutpurse's 'that player discards a card and you draw a card' → HIGH two-atom (discard damagedPlayer + you draw)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards a card and you draw a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "discard", amount: 1, who: "damagedPlayer" });
    expect(p.atoms[1]).toMatchObject({ op: "draw", amount: 1 });
  });

  it("CREED — a rider keeps its tail → LOW (Sword of Feast and Famine 'and you untap all lands you control')", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards a card and you untap all lands you control." });
    expect(programConfidence(p)).toBe("low");
  });

  it("CREED — 'that player discards THAT card' (discard-chosen family) does NOT match this anchor", () => {
    // "that card" is the reveal-then-discard referent (Gix's Caress) — never a damagedPlayer discard.
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards that card." });
    const dmg = (p?.atoms || []).find((a) => a.op === "discard" && a.who === "damagedPlayer");
    expect(dmg).toBeUndefined();
  });
});

describe("CDMG-DISCARD — resolver (who:damagedPlayer)", () => {
  const atom = () => parseEffectProgram({ type: "Instant", oracle: "That player discards a card." }).atoms[0];

  it("makes the DAMAGED player discard (their hand shrinks), not the controller", () => {
    let s = stateWith({ userHand: [hc("u1", "Mine")], aiHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    // ai hand (2) > remaining (1) → a real choice pauses for the discarder (ai).
    s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(s.pendingChoice?.kind).toBe("discard");
    s = resolveDiscardChoice(s, autoPickDiscardCandidate(s, s.pendingChoice));
    expect(handSize(s, "ai")).toBe(1);     // the damaged player pitched one
    expect(handSize(s, "user")).toBe(1);   // the controller's hand is untouched
  });

  it("a one-card hand is the forced whole-hand discard (no pause)", () => {
    let s = stateWith({ aiHand: [hc("a1", "Only", 3)] });
    s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(s.pendingChoice?.kind).not.toBe("discard"); // hand (1) <= remaining (1) → forced, no choice
    expect(handSize(s, "ai")).toBe(0);
  });

  it("absent damagedPlayerId (a spell / non-combat trigger) → clean no-op, no crash, no fabrication", () => {
    let s = stateWith({ userHand: [hc("u1", "Mine")], aiHand: [hc("a1", "Keep")] });
    expect(() => { s = resolveAtom(s, atom(), { controller: "user", targets: [] }); }).not.toThrow();
    expect(handSize(s, "ai")).toBe(1);   // nobody discarded
    expect(handSize(s, "user")).toBe(1);
    expect(s.pendingChoice?.kind).not.toBe("discard");
  });

  it("an empty-hand damaged player → clean no-op", () => {
    let s = stateWith({ aiHand: [] });
    s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(handSize(s, "ai")).toBe(0);
    expect(s.pendingChoice?.kind).not.toBe("discard");
  });
});

describe("CDMG-DISCARD — coverage classification", () => {
  it("Blazing Specter (combat-damage → discard) classifies native-trigger", () => {
    expect(classifyCard({ name: "Blazing Specter", type: "Creature — Specter",
      oracle: "Flying, haste\nWhenever this creature deals combat damage to a player, that player discards a card." })).toBe("native-trigger");
  });

  it("Abyssal Specter ('deals damage to a player' → discard) classifies native-trigger", () => {
    expect(classifyCard({ name: "Abyssal Specter", type: "Creature — Specter",
      oracle: "Flying\nWhenever this creature deals damage to a player, that player discards a card." })).toBe("native-trigger");
  });

  it("Larceny (creatureYouControl combat damage → discard) classifies native-trigger", () => {
    expect(classifyCard({ name: "Larceny", type: "Enchantment",
      oracle: "Whenever a creature you control deals combat damage to a player, that player discards a card." })).toBe("native-trigger");
  });

  it("CREED SPELL GUARD — Frightful Delusion (counter back-reference) stays arbiter-spell, NOT native", () => {
    expect(classifyCard({ name: "Frightful Delusion", type: "Instant", mana: "{1}{B}",
      oracle: "Counter target spell unless its controller pays {1}. That player discards a card." })).toBe("arbiter-spell");
  });

  it("CREED SPELL GUARD — Ozai's Cruelty (damage-target back-reference) stays arbiter-spell, NOT native", () => {
    expect(classifyCard({ name: "Ozai's Cruelty", type: "Sorcery — Lesson", mana: "{2}{B}",
      oracle: "Ozai's Cruelty deals 2 damage to target player. That player discards two cards." })).toBe("arbiter-spell");
  });
});

describe("CDMG-DISCARD — END-TO-END via the real combat-damage trigger flush", () => {
  it("Blazing Specter dealing combat damage makes the damaged player discard", () => {
    const spec = createPermanent({
      id: "spec",
      card: { id: "c-spec", name: "Blazing Specter", type: "Creature — Specter", power: 2, toughness: 2,
        oracle: "Flying, haste\nWhenever this creature deals combat damage to a player, that player discards a card." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [spec], aiHand: [hc("a1", "Keep", 6), hc("a2", "Pitch", 1)] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "spec", attackingPlayer: "user", defender: "ai", amount: 2 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    // The discard chain pauses for the AI discarder; auto-settle it (the AI pitches its cheapest).
    while (s.pendingChoice?.kind === "discard") s = resolveDiscardChoice(s, autoPickDiscardCandidate(s, s.pendingChoice));
    while ((s.stack || []).length && g++ < 60) s = resolveTopOfStack(s);
    expect(handSize(s, "ai")).toBe(1);   // the damaged player discarded exactly one
    expect(handSize(s, "user")).toBe(0); // the controller's hand untouched
  });
});

/**
 * ===== CDMG-DISCARD-SCALED ===== "That player discards THAT MANY cards" — the count IS the combat-damage
 * amount (ctx.combatDamageAmount), mirroring the rad "that many rad counters" damagedPlayer sibling EXACTLY
 * (counters.js countContext path). Cards: Dreamstealer (Eternalized token), Needle Specter. applyDiscard now
 * resolves the count via resolveScaledAmount (the shared countContext helper) instead of effectiveAmount.
 *
 * CREED pins:
 *   - the parser admits ONLY "that player|they discards that many cards" → who:"damagedPlayer", countContext:
 *     "combatDamageAmount", NON-targeted (targetType:null → routes natively on the combat-damage flush).
 *   - the count is the ACTUAL combat damage; an absent combatDamageAmount (a spell / non-combat trigger) → 0 →
 *     a clean no-op (the amount<=0 guard), never a fabricated discard.
 *   - combatDamageReferentSatisfied admits countContext:"combatDamageAmount" ONLY on combatDamageToPlayer/
 *     dealtDamage, so a non-combat "they discard that many cards" can never route here and mis-scope.
 */
describe("CDMG-DISCARD-SCALED — parser", () => {
  it("'that player discards that many cards' → discard / damagedPlayer / countContext combatDamageAmount, NON-targeted", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "That player discards that many cards." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "discard", who: "damagedPlayer", countContext: "combatDamageAmount", targetType: null });
    expect(p.atoms[0].amount).toBeUndefined();   // dynamic, not a printed N
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
  it("'they discard that many cards' (the bare-pronoun form) parses identically", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "They discard that many cards." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "discard", who: "damagedPlayer", countContext: "combatDamageAmount" });
  });
});

describe("CDMG-DISCARD-SCALED — resolver (count = combatDamageAmount)", () => {
  const atom = () => parseEffectProgram({ type: "Instant", oracle: "That player discards that many cards." }).atoms[0];

  it("discards combatDamageAmount cards from the DAMAGED player (3 damage → up to 3 pitched)", () => {
    let s = stateWith({ userHand: [hc("u1", "Mine")], aiHand: [hc("a1", "A", 1), hc("a2", "B", 2), hc("a3", "C", 3), hc("a4", "D", 4)] });
    // 4-card hand, 3 damage → a real choice (4 > 3); auto-settle the chain of single picks.
    s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai", combatDamageAmount: 3 });
    let g = 0; while (s.pendingChoice?.kind === "discard" && g++ < 10) s = resolveDiscardChoice(s, autoPickDiscardCandidate(s, s.pendingChoice));
    expect(handSize(s, "ai")).toBe(1);     // 4 − 3 = 1 left
    expect(handSize(s, "user")).toBe(1);   // controller untouched
  });

  it("absent combatDamageAmount (a spell / non-combat trigger) → 0 → clean no-op, no fabrication", () => {
    let s = stateWith({ aiHand: [hc("a1", "Keep"), hc("a2", "Keep2")] });
    expect(() => { s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai" }); }).not.toThrow();
    expect(handSize(s, "ai")).toBe(2);     // combatDamageAmount unset → 0 → nobody discarded
    expect(s.pendingChoice?.kind).not.toBe("discard");
  });

  it("0 combat damage → clean no-op (the amount<=0 guard)", () => {
    let s = stateWith({ aiHand: [hc("a1", "Keep")] });
    s = resolveAtom(s, atom(), { controller: "user", targets: [], damagedPlayerId: "ai", combatDamageAmount: 0 });
    expect(handSize(s, "ai")).toBe(1);
  });
});

describe("CDMG-DISCARD-SCALED — coverage classification", () => {
  it("Needle Specter (wither + combat-damage → discard that many) classifies native-trigger", () => {
    expect(classifyCard({ name: "Needle Specter", type: "Creature — Specter", mana: "{2}{B}{B}",
      oracle: "Flying\nWither (This deals damage to creatures in the form of -1/-1 counters.)\nWhenever this creature deals combat damage to a player, that player discards that many cards." })).toBe("native-trigger");
  });
  it("Dreamstealer's Eternalized-token oracle (menace + scaled discard, no Eternalize) classifies native-trigger", () => {
    expect(classifyCard({ name: "Dreamstealer", type: "Creature — Human Wizard", mana: "{1}{B}",
      oracle: "Menace\nWhenever Dreamstealer deals combat damage to a player, that player discards that many cards." })).toBe("native-trigger");
  });
  it("CREED — the PRINTED Dreamstealer (with Eternalize) stays body-only (Eternalize unmodeled, residue gate holds)", () => {
    expect(classifyCard({ name: "Dreamstealer", type: "Creature — Human Wizard", mana: "{1}{B}",
      oracle: "Menace\nWhenever this creature deals combat damage to a player, that player discards that many cards.\nEternalize {4}{B}{B} ({4}{B}{B}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Human Wizard with no mana cost. Eternalize only as a sorcery.)" })).toBe("body-only");
  });
});

describe("CDMG-DISCARD-SCALED — END-TO-END via the real combat-damage trigger flush", () => {
  it("Needle Specter dealing 2 combat damage makes the damaged player discard 2", () => {
    const spec = createPermanent({
      id: "needle",
      card: { id: "c-needle", name: "Needle Specter", type: "Creature — Specter", power: 2, toughness: 2,
        oracle: "Flying\nWhenever this creature deals combat damage to a player, that player discards that many cards." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [spec], aiHand: [hc("a1", "A", 6), hc("a2", "B", 1), hc("a3", "C", 3)] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "needle", attackingPlayer: "user", defender: "ai", amount: 2 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    while (s.pendingChoice?.kind === "discard" && g++ < 30) s = resolveDiscardChoice(s, autoPickDiscardCandidate(s, s.pendingChoice));
    while ((s.stack || []).length && g++ < 60) s = resolveTopOfStack(s);
    expect(handSize(s, "ai")).toBe(1);   // 3 − 2 = 1 (discarded exactly the combat-damage amount)
    expect(handSize(s, "user")).toBe(0); // controller untouched
  });
});
