/**
 * SWORD-CDMG-PAYLOAD — the next clean "Sword of X and Y" payload after Fire and Ice (already native via the
 * deal-damage + draw atoms). Two small payload-atom additions, both reusing modeled primitives:
 *
 *   1. "you create <token>" — a leading "you " is a redundant subject (CR 111.1: the token's controller is
 *      always the effect's controller), stripped in createTokenClauseParser so the conjoined Sword payload
 *      ("you create a 2/2 green Wolf creature token and …") binds the existing create-token atom.
 *   2. "that player mills N" / "they mill N" — the just-damaged player (who:"damagedPlayer", reading
 *      ctx.damagedPlayerId), mirroring the rad CDMG-PLAYER-PAYOFF subject vocabulary. applyMill gained the
 *      damagedPlayer branch (absent referent → mills nobody, a clean no-op).
 *
 * Together these flip Sword of Body and Mind ("+2/+2 + protection from green and from blue" static, combat-
 * damage payload "you create a 2/2 green Wolf creature token and that player mills ten cards") to
 * native-equipment — the static (P/T + protection) was already modeled; only the payload was the gap.
 *
 * COMBAT-DAMAGE REFERENT GATE (CREED) — who:"damagedPlayer" reads ctx.damagedPlayerId, supplied ONLY by a
 * combatDamageToPlayer event. A CAST trigger that happens to print "that player mills" (Memory Erosion,
 * "Whenever an opponent casts a spell, that player mills two cards") would parse HIGH but its referent is
 * UNSET → the clause would silently drop. combatDamageReferentSatisfied (triggerRouting.js) gates BOTH the
 * metric and the runtime so such a trigger stays on the Arbiter (a SAFE false-negative), never a dropped
 * clause. countContext:"combatDamageAmount" stays valid on dealtDamage too (Illusory Ambusher non-regression).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, attachPermanent, _resetIdsForTests } from "./gameState.js";
import { checkCombatDamageTriggers, checkCastTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentProtectionColors } from "./layers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EQ = (name, oracle, type = "Artifact — Equipment") => ({ name, type, oracle });
const BODY_AND_MIND =
  "Equipped creature gets +2/+2 and has protection from green and from blue.\n" +
  "Whenever equipped creature deals combat damage to a player, you create a 2/2 green Wolf creature token and that player mills ten cards.\n" +
  "Equip {2}";

// ─── atom parsing ────────────────────────────────────────────────────────────
describe("SWORD-CDMG-PAYLOAD — payload atoms parse HIGH", () => {
  it("'you create a <token>' strips the redundant subject (same atom as 'create a <token>')", () => {
    const a = parseEffectClause("you create a 2/2 green Wolf creature token", "Instant").atoms;
    expect(a).toEqual([{ op: "create-token", count: 1, power: 2, toughness: 2, descriptor: "green wolf", targetType: null }]);
  });
  it("'that player mills N' / 'they mill N' → mill who:'damagedPlayer'", () => {
    expect(parseEffectClause("that player mills ten cards", "Instant").atoms).toEqual([{ op: "mill", amount: 10, who: "damagedPlayer", targetType: null }]);
    expect(parseEffectClause("they mill 3 cards", "Instant").atoms).toEqual([{ op: "mill", amount: 3, who: "damagedPlayer", targetType: null }]);
  });
  it("the full Body-and-Mind payload is a HIGH 2-atom sequence", () => {
    const p = parseEffectClause("you create a 2/2 green Wolf creature token and that player mills ten cards", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "create-token", count: 1, power: 2, toughness: 2, descriptor: "green wolf", targetType: null },
      { op: "mill", amount: 10, who: "damagedPlayer", targetType: null },
    ]);
  });
});

// ─── classification ──────────────────────────────────────────────────────────
describe("SWORD-CDMG-PAYLOAD — coverage flips", () => {
  it("Sword of Body and Mind → native-equipment", () => {
    expect(classifyCard(EQ("Sword of Body and Mind", BODY_AND_MIND))).toBe("native-equipment");
  });
  it("Sword of Fire and Ice stays native-equipment (already modeled; not regressed)", () => {
    expect(classifyCard(EQ("Sword of Fire and Ice", "Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}"))).toBe("native-equipment");
  });
  it("audited collateral true-positives flip to native-trigger", () => {
    // Shriekgeist — a SELF combat-damage "that player mills two cards".
    expect(classifyCard({ name: "Shriekgeist", type: "Creature — Spirit", oracle: "Flying\nWhenever this creature deals combat damage to a player, that player mills two cards." })).toBe("native-trigger");
    // Reef Pirates — "deals damage to an opponent" routes via the combatDamageToPlayer event (sim treats
    // creature→player damage as combat damage), so "that player" = the damaged opponent.
    expect(classifyCard({ name: "Reef Pirates", type: "Creature — Zombie Pirate", oracle: "Whenever this creature deals damage to an opponent, that player mills a card." })).toBe("native-trigger");
  });
});

// ─── CREED: combat-damage referent gate ──────────────────────────────────────
describe("SWORD-CDMG-PAYLOAD — CREED combat-damage referent gate", () => {
  it("combatDamageReferentSatisfied: damagedPlayer valid ONLY on combatDamageToPlayer", () => {
    const millProg = parseEffectClause("that player mills two cards", "Instant");
    expect(combatDamageReferentSatisfied(millProg, "combatDamageToPlayer")).toBe(true);
    expect(combatDamageReferentSatisfied(millProg, "cast")).toBe(false);
    expect(combatDamageReferentSatisfied(millProg, "dealtDamage")).toBe(false);
  });
  it("combatDamageReferentSatisfied: combatDamageAmount valid on combatDamageToPlayer AND dealtDamage", () => {
    const drawProg = parseEffectClause("draw that many cards", "Instant");
    expect(combatDamageReferentSatisfied(drawProg, "combatDamageToPlayer")).toBe(true);
    expect(combatDamageReferentSatisfied(drawProg, "dealtDamage")).toBe(true); // Illusory Ambusher
    expect(combatDamageReferentSatisfied(drawProg, "cast")).toBe(false);
  });
  it("a program with NO combat-damage referent is unaffected (gate is a no-op)", () => {
    const draw1 = parseEffectClause("draw a card", "Instant");
    expect(combatDamageReferentSatisfied(draw1, "cast")).toBe(true);
  });
  it("CREED: Memory Erosion (CAST 'that player mills') stays body-only — referent unsupplied", () => {
    expect(classifyCard({ name: "Memory Erosion", type: "Enchantment", oracle: "Whenever an opponent casts a spell, that player mills two cards." })).toBe("body-only");
  });
  it("Illusory Ambusher (dealtDamage 'draw that many') stays native-trigger — NOT regressed", () => {
    expect(classifyCard({ name: "Illusory Ambusher", type: "Creature — Cat Illusion", oracle: "Flash\nWhenever this creature is dealt damage, draw that many cards." })).toBe("native-trigger");
  });
});

// ─── end-to-end runtime (the CREED acceptance gate) ──────────────────────────
describe("SWORD-CDMG-PAYLOAD — Sword of Body and Mind end-to-end", () => {
  function equippedBoard(aiLibSize) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 3, toughness: 3 }, controller: "user", summoningSick: false });
    const sword = createPermanent({ id: "sword", card: EQ("Sword of Body and Mind", BODY_AND_MIND), controller: "user" });
    const aiLib = Array.from({ length: aiLibSize }, (_, i) => ({ id: "ailib" + i, name: "Card" + i, type: "Creature — Bear" }));
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [hero, sword] }, ai: { ...s.players.ai, battlefield: [], library: aiLib, graveyard: [] } } };
    return attachPermanent(s, { equipId: "sword", targetId: "hero" });
  }

  it("static: +2/+2 and protection from green and blue apply ONLY while equipped", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 3, toughness: 3 }, controller: "user", summoningSick: false });
    const sword = createPermanent({ id: "sword", card: EQ("Sword of Body and Mind", BODY_AND_MIND), controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [hero, sword] } } };
    expect([permanentPower(s, "hero"), permanentToughness(s, "hero")]).toEqual([3, 3]);
    expect([...permanentProtectionColors(s, "hero")]).toEqual([]);
    s = attachPermanent(s, { equipId: "sword", targetId: "hero" });
    expect([permanentPower(s, "hero"), permanentToughness(s, "hero")]).toEqual([5, 5]);
    expect(new Set(permanentProtectionColors(s, "hero"))).toEqual(new Set(["G", "U"]));
  });

  it("payload: combat damage creates a Wolf for the controller AND mills the damaged player ten", () => {
    let s = equippedBoard(15);
    const playerEvents = [{ kind: "combat-damage-player", attackerId: "hero", attackingPlayer: "user", defender: "ai", amount: 5 }];
    s = checkCombatDamageTriggers(s, playerEvents);
    expect((s.pendingTriggers || []).length).toBeGreaterThan(0);
    s = resolveTopOfStack(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // a 2/2 Wolf token for the controller
    const wolves = s.players.user.battlefield.filter((p) => /wolf/i.test(String(p.card?.descriptor || p.card?.name || "")));
    expect(wolves.length).toBe(1);
    // the DAMAGED player (ai) milled 10 (its own library → its own graveyard); the controller's untouched
    expect(s.players.ai.library.length).toBe(5);
    expect(s.players.ai.graveyard.length).toBe(10);
    expect((s.players.user.library || []).length).toBe(0); // controller did NOT mill
  });

  it("payload no-op safety: a short library mills only what's there (no crash)", () => {
    let s = equippedBoard(3);
    const playerEvents = [{ kind: "combat-damage-player", attackerId: "hero", attackingPlayer: "user", defender: "ai", amount: 5 }];
    s = checkCombatDamageTriggers(s, playerEvents);
    s = resolveTopOfStack(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.library.length).toBe(0);
    expect(s.players.ai.graveyard.length).toBe(3);
  });
});

// ─── CREED runtime: Memory Erosion's cast trigger must NOT mill ──────────────
describe("SWORD-CDMG-PAYLOAD — Memory Erosion CAST trigger does NOT fabricate a mill", () => {
  it("an opponent casting a spell routes to the Arbiter no-op (the opponent does NOT mill)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const erosion = createPermanent({ id: "ero", card: { name: "Memory Erosion", type: "Enchantment", oracle: "Whenever an opponent casts a spell, that player mills two cards." }, controller: "user" });
    const aiLib = Array.from({ length: 10 }, (_, i) => ({ id: "l" + i, name: "C" + i, type: "Creature — Bear" }));
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [erosion] }, ai: { ...s.players.ai, battlefield: [], library: aiLib, graveyard: [] } } };
    s = checkCastTriggers(s, { spellCard: { name: "Lightning Bolt", type: "Instant" }, casterId: "ai", targets: [] });
    s = resolveTopOfStack(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // CREED: the clause is NOT silently dropped-as-zero by a native mill of the WRONG/absent referent —
    // it routes to the Arbiter no-op, so the library is untouched (a SAFE false-negative, never a fabrication).
    expect(s.players.ai.library.length).toBe(10);
    expect(s.players.ai.graveyard.length).toBe(0);
  });
});
