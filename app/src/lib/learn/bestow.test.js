/**
 * BESTOW (CR 702.103) — a Theros Enchantment Creature with a "Bestow {cost}" alternative cast cost.
 *
 * Cast for its bestow cost, it's an AURA spell with "enchant creature" granting the enchanted creature
 * "+X/+X" (and/or a keyword); cast normally it's a creature. While attached it is an Aura, NOT a creature
 * (CR 702.103e), and when it stops being attached it becomes a creature again (it stays on the battlefield,
 * unlike a normal Aura's falls-off-to-graveyard SBA, CR 702.103e). This suite covers both modes end-to-end:
 * the dual cast offer, the attach + layer bonus (reusing the printed-Aura parseAuraBonus machinery), the
 * layer-4 Creature-type removal while attached, the becomes-a-creature-when-unattached transition, and the
 * all-or-nothing native gate (a rider on either mode → body-only → Arbiter, never a partial — THE CREED).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword, permanentIsCreature } from "./layers.js";
import { parseBestowCost, isEnchantmentCreature } from "./staticAbilityParser.js";
import { classifyCard, isNativeBestow } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Pure +X/+X bestow bodies — one per color (the cleanest shape: a vanilla creature + a P/T-only aura bonus).
const ROLLICKER = { id: "c-roll", name: "Nyxborn Rollicker", type: "Enchantment Creature — Satyr", mana: "{R}", power: 1, toughness: 1,
  oracle: "Bestow {1}{R} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +1/+1." };
const SHIELDMATE = { id: "c-shield", name: "Nyxborn Shieldmate", type: "Enchantment Creature — Human Soldier", mana: "{W}", power: 1, toughness: 2,
  oracle: "Bestow {2}{W} (reminder)\nEnchanted creature gets +1/+2." };
const EIDOLON = { id: "c-eid", name: "Nyxborn Eidolon", type: "Enchantment Creature — Spirit", mana: "{1}{B}", power: 2, toughness: 1,
  oracle: "Bestow {4}{B} (reminder)\nEnchanted creature gets +2/+1." };
const WOLF = { id: "c-wolf", name: "Nyxborn Wolf", type: "Enchantment Creature — Wolf", mana: "{2}{G}", power: 3, toughness: 1,
  oracle: "Bestow {4}{G} (reminder)\nEnchanted creature gets +3/+1." };
const TRITON = { id: "c-tri", name: "Nyxborn Triton", type: "Enchantment Creature — Merfolk", mana: "{2}{U}", power: 2, toughness: 3,
  oracle: "Bestow {4}{U} (reminder)\nEnchanted creature gets +2/+3." };
// Keyword-grant bestow: a self keyword (== the granted keyword) + a P/T + keyword aura bonus.
const HOPEFUL = { id: "c-hope", name: "Hopeful Eidolon", type: "Enchantment Creature — Spirit", mana: "{W}", power: 1, toughness: 1,
  oracle: "Bestow {3}{W} (reminder)\nLifelink (reminder)\nEnchanted creature gets +1/+1 and has lifelink." };
const LEAFCROWN = { id: "c-leaf", name: "Leafcrown Dryad", type: "Enchantment Creature — Nymph Dryad", mana: "{1}{G}", power: 2, toughness: 2,
  oracle: "Bestow {3}{G} (reminder)\nReach (reminder)\nEnchanted creature gets +2/+2 and has reach." };
const BOON = { id: "c-boon", name: "Boon Satyr", type: "Enchantment Creature — Satyr", mana: "{1}{G}{G}", power: 4, toughness: 2,
  oracle: "Flash\nBestow {3}{G}{G} (reminder)\nEnchanted creature gets +4/+2." };

const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardState({ user = [], ai = [], hand = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

describe("parser — parseBestowCost / isEnchantmentCreature", () => {
  it("extracts the Bestow {cost} string (reminder text ignored)", () => {
    expect(parseBestowCost(ROLLICKER)).toBe("{1}{R}");
    expect(parseBestowCost(EIDOLON)).toBe("{4}{B}");
    expect(parseBestowCost(BOON)).toBe("{3}{G}{G}");
  });
  it("returns null when there is no bestow line", () => {
    expect(parseBestowCost({ type: "Enchantment Creature — Spirit", oracle: "Vigilance" })).toBeNull();
    expect(parseBestowCost(bearCard)).toBeNull();
    // A card merely mentioning "bestow" outside the keyword-cost shape never false-matches.
    expect(parseBestowCost({ type: "Creature", oracle: "Whenever this creature attacks, bestow a blessing." })).toBeNull();
  });
  it("isEnchantmentCreature requires BOTH types", () => {
    expect(isEnchantmentCreature(ROLLICKER)).toBe(true);
    expect(isEnchantmentCreature(bearCard)).toBe(false);
    expect(isEnchantmentCreature({ type: "Enchantment — Aura" })).toBe(false);
  });
});

describe("isNativeBestow / coverage — all-or-nothing native gate", () => {
  it("a clean bestow card (pure +X/+X, one per color) is native-aura", () => {
    for (const c of [ROLLICKER, SHIELDMATE, EIDOLON, WOLF, TRITON]) {
      expect(isNativeBestow(c)).toBe(true);
      expect(classifyCard(c)).toBe("native-aura");
    }
  });
  it("a keyword-grant bestow (self keyword + grantable keyword bonus) is native-aura", () => {
    // Hopeful Eidolon: self Lifelink + grants lifelink; Leafcrown Dryad: self Reach + grants reach; Boon
    // Satyr: self Flash (a covered casting-timing keyword) + a pure +4/+2 bonus — all whole-card-clean.
    for (const c of [HOPEFUL, LEAFCROWN, BOON]) {
      expect(isNativeBestow(c)).toBe(true);
      expect(classifyCard(c)).toBe("native-aura");
    }
  });
  it("a bestow card with an unmodeled mode stays body-only (→ Arbiter, never a partial flip)", () => {
    // dynamic X bonus (counts graveyards) — unmodeled aura bonus.
    expect(classifyCard({ name: "Nighthowler", type: "Enchantment Creature — Horror", mana: "{1}{B}{B}", power: 0, toughness: 0,
      oracle: "Bestow {2}{B}{B} (reminder)\nThis creature and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards." })).toBe("body-only");
    // grants mentor — mentor isn't a covered aura-grant keyword.
    expect(classifyCard({ name: "Nyxborn Unicorn", type: "Enchantment Creature — Unicorn", mana: "{1}{W}", power: 2, toughness: 2,
      oracle: "Bestow {3}{W} (reminder)\nMentor (reminder)\nEnchanted creature gets +2/+2 and has mentor." })).toBe("body-only");
    // ✅ GRADUATED 2026-07-30 — Herald of Torment used to sit here as "trigger residue". A creature-body
    // TRIGGER is no longer residue when it ROUTES NATIVELY: the aura mode is untouched by it and the
    // creature mode is exactly what triggerRoutesNatively validates, so the two modes compose
    // (bestowWithTrigger.test.js). A BOUNDARY MARKER re-pointed, not deleted — the surrounding cases below
    // still guard that an unmodeled aura bonus or a non-routing trigger parks the whole card.
    expect(classifyCard({ name: "Herald of Torment", type: "Enchantment Creature — Demon", mana: "{1}{B}{B}", power: 3, toughness: 3,
      oracle: "Flying\nBestow {3}{B}{B} (reminder)\nAt the beginning of your upkeep, you lose 1 life.\nEnchanted creature gets +3/+3 and has flying." })).toBe("native-aura");
    // an unmodeled aura bonus (loses-all-abilities / set base P/T).
    expect(classifyCard({ name: "Trickster's Elk", type: "Enchantment Creature — Elk", mana: "{2}{G}", power: 3, toughness: 3,
      oracle: "Bestow {1}{G} (reminder)\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3." })).toBe("body-only");
  });
  it("a non-bestow Enchantment Creature is UNAFFECTED (still classifies on its own body)", () => {
    expect(isNativeBestow({ type: "Enchantment Creature — Spirit", oracle: "Vigilance" })).toBe(false);
    expect(classifyCard({ name: "Plain", type: "Enchantment Creature — Spirit", mana: "{2}{W}", power: 2, toughness: 2, oracle: "Vigilance" })).toBe("native-body");
  });
});

describe("cast offer — BOTH modes surfaced (creature + bestow-aura)", () => {
  it("offers a creature cast (no target) AND a bestow-aura cast per creature (at the bestow cost)", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    const s = boardState({ user: [bear], hand: [ROLLICKER], pool: { R: 5 } });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "c-roll");
    const creatureCast = casts.find(a => !a.isAuraSpell);
    const bestowCast = casts.find(a => a.bestow);
    expect(creatureCast).toMatchObject({ needsTargets: false });
    expect(creatureCast.cost).toMatchObject({ generic: 0, R: 1 }); // printed {R}
    expect(bestowCast).toMatchObject({ isAuraSpell: true, needsTargets: true, bestow: true, targets: [{ id: "bear" }] });
    expect(bestowCast.cost).toMatchObject({ generic: 1, R: 1 }); // bestow {1}{R}
  });
  it("the bestow cast can target an OPPONENT's creature (enchant creature has no controller restriction)", () => {
    const enemy = createPermanent({ id: "enemy", card: bearCard, controller: "ai", summoningSick: false });
    const s = boardState({ ai: [enemy], hand: [ROLLICKER], pool: { R: 5 } });
    const bestowCasts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.bestow);
    expect(bestowCasts.map(c => c.targets[0].id)).toContain("enemy");
  });
  it("with no creature on any battlefield, only the creature-mode cast is offered (bestow needs a target)", () => {
    const s = boardState({ hand: [ROLLICKER], pool: { R: 5 } });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "c-roll");
    expect(casts).toHaveLength(1);
    expect(casts[0].isAuraSpell).toBeFalsy();
  });
});

describe("aura mode — enters attached, applies the bonus, is NOT a creature (CR 702.103e)", () => {
  it("resolving a bestow cast enters it attached + grants +1/+1, flagged bestowed, and not a creature", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [ROLLICKER], pool: { R: 5 } });
    expect(permanentPower(s, "bear")).toBe(2);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.bestow);
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Nyxborn Rollicker");
    expect(aura.attachedTo).toBe("bear");
    expect(aura.bestowed).toBe(true);
    expect(findPermanent(s, "bear").permanent.attachments).toContain(aura.id);
    expect(permanentPower(s, "bear")).toBe(3);
    expect(permanentToughness(s, "bear")).toBe(3);
    // CR 702.103e: while attached it is an Aura, NOT a creature.
    expect(permanentIsCreature(s, aura.id)).toBe(false);
  });
  it("a keyword-grant bestow (Hopeful Eidolon) grants +1/+1 AND lifelink to the host", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [HOPEFUL], pool: { W: 5 } });
    expect(permanentHasKeyword(s, "bear", "Lifelink")).toBe(false);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.bestow);
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentPower(s, "bear")).toBe(3);
    expect(permanentHasKeyword(s, "bear", "Lifelink")).toBe(true);
  });
  it("an attached bestow permanent CANNOT be declared as an attacker (it's not a creature)", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [ROLLICKER], pool: { R: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.bestow);
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Nyxborn Rollicker");
    s = { ...s, phase: "combat", step: "declare-attackers" };
    const attackers = filterActions(legalActionsForPlayer(s, "user"), "declare-attacker");
    expect(attackers.some(a => a.permanentId === "bear")).toBe(true);     // the real creature can attack
    expect(attackers.some(a => a.permanentId === aura.id)).toBe(false);   // the attached bestow can't
  });
});

describe("creature mode — casts as a plain creature when not bestowed", () => {
  it("the creature-mode cast enters an unattached creature (no bonus, IS a creature)", () => {
    let s = boardState({ hand: [ROLLICKER], pool: { R: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-roll" && !a.isAuraSpell);
    s = resolveTopOfStack(dispatchAction(s, cast));
    const body = s.players.user.battlefield.find(p => p.card?.name === "Nyxborn Rollicker");
    expect(body.attachedTo == null).toBe(true);
    expect(body.bestowed).toBeUndefined();
    expect(permanentIsCreature(s, body.id)).toBe(true);
    expect(permanentPower(s, body.id)).toBe(1);
    expect(permanentToughness(s, body.id)).toBe(1);
  });
});

describe("becomes a creature when unattached (CR 702.103e) — the falls-off SBA exemption", () => {
  it("when the host dies, the bestow permanent STAYS, becomes a creature, and the bonus vanishes", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [ROLLICKER], pool: { R: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.bestow);
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Nyxborn Rollicker");
    // Host leaves.
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    const still = s.players.user.battlefield.find(p => p.id === aura.id);
    expect(still).toBeTruthy();                                   // stayed on the battlefield (NOT graveyard)
    expect(still.attachedTo == null).toBe(true);                 // now unattached
    expect(s.players.user.graveyard.some(c => c.name === "Nyxborn Rollicker")).toBe(false);
    expect(permanentIsCreature(s, aura.id)).toBe(true);          // a creature again
    expect(permanentPower(s, aura.id)).toBe(1);                  // its own 1/1 (the +1/+1 it granted is gone)
    expect(permanentToughness(s, aura.id)).toBe(1);
  });
  it("a normal Aura still falls off to the graveyard (the bestow exemption doesn't leak)", () => {
    const STRENGTH = { id: "c-str", name: "Unholy Strength", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature gets +2/+1." };
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [STRENGTH], pool: { C: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    s = resolveTopOfStack(dispatchAction(s, cast));
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    expect(s.players.user.battlefield.some(p => p.card?.name === "Unholy Strength")).toBe(false);
    expect(s.players.user.graveyard.some(c => c.name === "Unholy Strength")).toBe(true);
  });
});

describe("cast legality — target gone by resolution → fizzle (no do-nothing permanent)", () => {
  it("if the creature target is gone at resolution, the bestow spell fizzles and never enters", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [ROLLICKER], pool: { R: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.bestow);
    s = dispatchAction(s, cast);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some(p => p.card?.name === "Nyxborn Rollicker")).toBe(false);
    expect((s.log || []).some(e => e.kind === "spell-fizzle")).toBe(true);
  });
});
