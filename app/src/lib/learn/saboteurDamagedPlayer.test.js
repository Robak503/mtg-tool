/**
 * saboteurDamagedPlayer.test.js — BLITZ SB-1: SABOTEUR damaged-player payoffs (CR 510.2 / 608.2c).
 *
 * "Whenever this creature deals combat damage to a player, <payoff scoped to THAT player>" — the payoff's
 * object back-references the just-damaged player (CR 608.2c), threaded as ctx.damagedPlayerId by
 * triggers.checkCombatDamageTriggers (the SAME referent the discard/mill/rad CDMG payoffs read). TWO new
 * payoff shapes, each the exact mirror of removal.js's damagedPlayer destroy scope (Aberrant precedent):
 *
 *   • DAMAGED-PLAYER BOUNCE — "[you may ]return target creature that player controls to its owner's hand"
 *     (Mistblade Shinobi; Sigil of Sleep's aura form; Arm with Aether's granted body). zones.js's bounce
 *     `cb` matcher gains the "that player controls" controller restriction (who:"damagedPlayer" — the
 *     enumerator pools ONLY ctx.damagedPlayerId's creatures) + the atom-level who pin (the combat-referent
 *     gate keeps it native ONLY off combatDamageToPlayer).
 *   • DAMAGED-PLAYER GY-EXILE — "exile [target card|up to two target cards] from that player's graveyard"
 *     (Zombie Cannibal / Skullsnatcher). A new damagedPlayerGraveyard scope on the exile-from-graveyard
 *     atom: spellEffects.addGraveyardCards pools ONLY the damaged player's graveyard (absent referent →
 *     EMPTY pool, never a wrong graveyard); enemy-side intent (the pool holds only an opponent's cards —
 *     CR 506.2a, a defending player is always an opponent); the up-to-two form rides the maxTargets subset
 *     machinery (largest subset first at flush; minTargets:0 — CR 601.2c "up to" permits zero).
 *
 * Also: the AURA non-combat wording "Whenever enchanted creature deals damage to a player" (Sigil of Sleep)
 * now detects via the same in-simulator equivalence the self form uses (all creature damage to a player is
 * combat damage here), through the existing equippedCreature attached-linkage scope.
 *
 * GAINED (flip-diff, LOST=0): Skullsnatcher, Mistblade Shinobi, Zombie Cannibal (ninjutsu cost lines are
 * keyword-only residue per KW-NINJUTSU), Arm with Aether (the TG-1 until-EOT grant vehicle — its quoted
 * body is now a modeled group-triggered grant). Sigil of Sleep stays body-only (the Aura classifier does
 * not credit an aura's OWN trigger line — a documented SAFE FN) but its trigger now fires natively at
 * runtime. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { enumerateTargets } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NINJUTSU = (cost) => `Ninjutsu ${cost} (${cost}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)`;
const SKULLSNATCHER_ORACLE = `${NINJUTSU("{B}")}\nWhenever this creature deals combat damage to a player, exile up to two target cards from that player's graveyard.`;
const MISTBLADE_ORACLE = `${NINJUTSU("{U}")}\nWhenever this creature deals combat damage to a player, you may return target creature that player controls to its owner's hand.`;
const CANNIBAL_ORACLE = "Whenever this creature deals combat damage to a player, you may exile target card from that player's graveyard.";
const SIGIL_ORACLE = "Enchant creature\nWhenever enchanted creature deals damage to a player, return target creature that player controls to its owner's hand.";
const ARM_ORACLE = "Until end of turn, creatures you control gain \"Whenever this creature deals damage to an opponent, you may return target creature that player controls to its owner's hand.\"";

const cr = (name, oracle, type = "Creature — Human Ninja") => ({ name, type, mana: "{1}{B}", power: 1, toughness: 1, oracle });
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 30) st = resolveTopOfStack(st); return st; };

// A combat-damage-step 2P state: `user` attacking `ai` with the given battlefield + ai graveyard.
function combatState({ user = [], ai = [], aiGraveyard = [], attackers = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, activePlayer: "user", phase: "combat", step: "combat-damage",
    combat: { attackers, blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, life: 40 },
      ai: { ...s0.players.ai, battlefield: ai, graveyard: aiGraveyard, life: 40 },
    },
  };
}
const perm = (id, name, oracle, { controller = "user", power = 2, toughness = 2, type = "Creature — Human Ninja" } = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, power, toughness, oracle }, controller, summoningSick: false });
const gyCard = (id, name) => ({ id, name, type: "Instant", oracle: "" });

// ─────────────────────────────────────────────────────────────────────────────
// Parser — the two payoff shapes
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-1 parser — damaged-player bounce + gy-exile atoms", () => {
  it("'you may return target creature that player controls to its owner's hand' → optional damagedPlayer bounce", () => {
    const p = parseEffectClause("you may return target creature that player controls to its owner's hand", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "bounce", targetType: "creature",
      restrictions: [{ kind: "controller", who: "damagedPlayer" }], who: "damagedPlayer", optional: true,
    }]);
  });

  it("'exile up to two target cards from that player's graveyard' → damagedPlayerGraveyard subset exile", () => {
    const p = parseEffectClause("exile up to two target cards from that player's graveyard", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "exile-from-graveyard", targetType: "graveyardCard", damagedPlayerGraveyard: true,
      cardFilter: "any", maxTargets: 2, minTargets: 0, who: "damagedPlayer",
    }]);
  });

  it("'you may exile target card from that player's graveyard' (Zombie Cannibal) → optional single exile", () => {
    const p = parseEffectClause("you may exile target card from that player's graveyard", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "exile-from-graveyard", targetType: "graveyardCard", damagedPlayerGraveyard: true,
      cardFilter: "any", who: "damagedPlayer", optional: true,
    }]);
  });

  it("intent: both shapes are enemy-side (the pool holds only the damaged opponent's objects)", () => {
    const bounce = parseEffectClause("return target creature that player controls to its owner's hand", "Instant").atoms[0];
    const gyx = parseEffectClause("exile target card from that player's graveyard", "Instant").atoms[0];
    expect(atomTargetIntent(bounce)).toBe("enemy");
    expect(atomTargetIntent(gyx)).toBe("enemy");
  });

  it("FN guards: a count/filter/zone variant of the gy-exile stays LOW (exact anchors)", () => {
    for (const clause of [
      "exile up to three target cards from that player's graveyard",       // un-evidenced count
      "exile target creature card from that player's graveyard",           // type filter
      "exile up to two target cards from that player's library",           // wrong zone
      "exile all cards from that player's graveyard",                      // non-targeted mass form
    ]) {
      expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
    }
    // (An "… and you gain 2 life" tail is NOT a near-miss: the top-level " and " splitter composes it to
    // TWO fully-modeled atoms — exile + gain-life — which is faithful, so it is correctly HIGH.)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classification — the GAINED set by name + the CREED guards
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-1 classification — the saboteur flips (ninjutsu cost lines are keyword-only residue)", () => {
  it("Skullsnatcher / Mistblade Shinobi / Zombie Cannibal → native-trigger", () => {
    expect(classifyCard(cr("Skullsnatcher", SKULLSNATCHER_ORACLE, "Creature — Rat Ninja"))).toBe("native-trigger");
    expect(classifyCard(cr("Mistblade Shinobi", MISTBLADE_ORACLE))).toBe("native-trigger");
    expect(classifyCard(cr("Zombie Cannibal", CANNIBAL_ORACLE, "Creature — Zombie"))).toBe("native-trigger");
  });

  it("Arm with Aether → native-spell (the TG-1 grant vehicle now validates the quoted saboteur body)", () => {
    expect(classifyCard({ name: "Arm with Aether", type: "Sorcery", mana: "{2}{U}", oracle: ARM_ORACLE })).toBe("native-spell");
  });

  it("Sigil of Sleep: the aura trigger now DETECTS + ROUTES, but the card stays body-only (documented SAFE FN)", () => {
    const sigil = { name: "Sigil of Sleep", type: "Enchantment — Aura", mana: "{U}", oracle: SIGIL_ORACLE };
    const d = detectTriggers(sigil);
    expect(d).toEqual([expect.objectContaining({ event: "combatDamageToPlayer", scope: "equippedCreature" })]);
    expect(d.every(triggerRoutesNatively)).toBe(true);
    expect(isNativeTier(classifyCard(sigil))).toBe(false); // the Aura classifier doesn't credit an aura's own trigger line
  });

  it("CREED: Moon-Circuit Hacker stays body-only (the 'unless this creature entered this turn' rider is unmodeled)", () => {
    const moon = cr("Moon-Circuit Hacker", `${NINJUTSU("{U}")}\nWhenever this creature deals combat damage to a player, you may draw a card. If you do, discard a card unless this creature entered this turn.`, "Enchantment Creature — Human Ninja");
    expect(classifyCard(moon)).toBe("body-only");
  });

  it("CREED: a SPELL carrying either damagedPlayer payoff stays arbiter-spell (no event referent at cast)", () => {
    expect(classifyCard({ name: "Fake Bounce", type: "Sorcery", mana: "{1}{U}", oracle: "Return target creature that player controls to its owner's hand." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Fake Grave Theft", type: "Sorcery", mana: "{B}", oracle: "Exile up to two target cards from that player's graveyard." })).toBe("arbiter-spell");
  });

  it("CREED: both payoffs route native ONLY on combatDamageToPlayer (referent gate)", () => {
    for (const clause of [
      "you may return target creature that player controls to its owner's hand",
      "exile up to two target cards from that player's graveyard",
    ]) {
      expect(triggerRoutesNatively({ event: "combatDamageToPlayer", effectClause: clause })).toBe(true);
      expect(triggerRoutesNatively({ event: "attacks", effectClause: clause })).toBe(false);
      expect(triggerRoutesNatively({ event: "etb", effectClause: clause })).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Enumeration — multiplayer isolation (the pool is EXACTLY the damaged player's)
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-1 enumeration — damagedPlayer scoping", () => {
  const threePlayer = () => ({ players: {
    user: { battlefield: [], graveyard: [gyCard("ug1", "User Bolt")] },
    ai1: { battlefield: [{ id: "b1", card: { name: "Bear One", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai1" }], graveyard: [gyCard("g1a", "AI1 Bolt"), gyCard("g1b", "AI1 Growth")] },
    ai2: { battlefield: [{ id: "b2", card: { name: "Bear Two", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai2" }], graveyard: [gyCard("g2a", "AI2 Bolt")] },
  } });

  it("bounce: only the damaged player's creatures are legal; no referent → empty pool", () => {
    const spec = { kind: "damage", targetType: "creature", restrictions: [{ kind: "controller", who: "damagedPlayer" }] };
    expect(enumerateTargets(threePlayer(), "user", spec, [], { damagedPlayerId: "ai1" }).map((t) => t.name)).toEqual(["Bear One"]);
    expect(enumerateTargets(threePlayer(), "user", spec, [], {})).toEqual([]);
  });

  it("gy-exile: only the damaged player's graveyard is pooled; no referent → empty pool", () => {
    const spec = { kind: "return-gy", targetType: "graveyardCard", cardFilter: "any", damagedPlayerGraveyard: true };
    expect(enumerateTargets(threePlayer(), "user", spec, [], { damagedPlayerId: "ai1" }).map((t) => t.name).sort()).toEqual(["AI1 Bolt", "AI1 Growth"]);
    expect(enumerateTargets(threePlayer(), "user", spec, [], { damagedPlayerId: "ai2" }).map((t) => t.name)).toEqual(["AI2 Bolt"]);
    expect(enumerateTargets(threePlayer(), "user", spec, [], {})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — end-to-end through the REAL combat-damage chokepoint
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-1 runtime — Mistblade Shinobi (optional damaged-player bounce)", () => {
  const setup = () => {
    const mist = perm("mist", "Mistblade Shinobi", MISTBLADE_ORACLE);
    const bear = perm("bear", "Grizzly Bears", "", { controller: "ai", type: "Creature — Bear" });
    let s = combatState({ user: [mist], ai: [bear], attackers: [{ permanentId: "mist", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38); // 2 combat damage connected
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    return resolveAll(s);
  };

  it("take: the 'you may' pauses, then bounces the DAMAGED player's creature to its owner's hand", () => {
    let s = setup();
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true); // not yet
    s = resolveOptionalChoice(s, true);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false);
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Grizzly Bears");
  });

  it("decline: nothing moves", () => {
    let s = setup();
    s = resolveOptionalChoice(s, false);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
    expect(s.players.ai.hand.map((c) => c.name)).not.toContain("Grizzly Bears");
  });

  it("no legal target (damaged player controls no creature) → trigger removed, no crash, nothing fabricated", () => {
    const mist = perm("mist", "Mistblade Shinobi", MISTBLADE_ORACLE);
    let s = combatState({ user: [mist], ai: [], attackers: [{ permanentId: "mist", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice).toBeFalsy();
    expect((s.log || []).some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
  });

  it("another creature's combat damage does NOT fire Mistblade's trigger", () => {
    const mist = perm("mist", "Mistblade Shinobi", MISTBLADE_ORACLE);
    const other = perm("oth", "Plain Attacker", "", { type: "Creature — Human Soldier" });
    let s = combatState({ user: [mist, other], ai: [], attackers: [{ permanentId: "oth", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    // `other` has no triggers and Mistblade's is self-scoped → nothing pends.
    expect((s.pendingTriggers || []).length).toBe(0);
  });
});

describe("SB-1 runtime — Skullsnatcher (up-to-two damaged-player graveyard exile)", () => {
  it("connects → exiles TWO cards from the damaged player's graveyard (largest subset first)", () => {
    const skull = perm("skull", "Skullsnatcher", SKULLSNATCHER_ORACLE, { type: "Creature — Rat Ninja" });
    let s = combatState({
      user: [skull], ai: [],
      aiGraveyard: [gyCard("g1", "Bolt"), gyCard("g2", "Growth"), gyCard("g3", "Counterspell")],
      attackers: [{ permanentId: "skull", attackingPlayer: "user", defender: "ai" }],
    });
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice).toBeFalsy(); // mandatory trigger — no optional pause
    expect(s.players.ai.graveyard).toHaveLength(1);   // 3 - 2 exiled
    expect(s.players.ai.exile).toHaveLength(2);
  });

  it("only ONE card in the graveyard → exiles exactly that one ('up to two' never fabricates)", () => {
    const skull = perm("skull", "Skullsnatcher", SKULLSNATCHER_ORACLE, { type: "Creature — Rat Ninja" });
    let s = combatState({
      user: [skull], ai: [], aiGraveyard: [gyCard("g1", "Bolt")],
      attackers: [{ permanentId: "skull", attackingPlayer: "user", defender: "ai" }],
    });
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.graveyard).toHaveLength(0);
    expect(s.players.ai.exile.map((c) => c.name)).toEqual(["Bolt"]);
  });

  it("the CONTROLLER's own graveyard is never touched (the pool is the damaged player's only)", () => {
    const skull = perm("skull", "Skullsnatcher", SKULLSNATCHER_ORACLE, { type: "Creature — Rat Ninja" });
    let s = combatState({
      user: [skull], ai: [], aiGraveyard: [gyCard("g1", "Bolt")],
      attackers: [{ permanentId: "skull", attackingPlayer: "user", defender: "ai" }],
    });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [gyCard("ug1", "My Treasure"), gyCard("ug2", "My Gem")] } } };
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.graveyard).toHaveLength(2); // untouched
    expect(s.players.ai.exile.map((c) => c.name)).toEqual(["Bolt"]);
  });
});

describe("SB-1 runtime — Zombie Cannibal (optional single gy exile)", () => {
  it("take: exiles the flush-chosen card from the damaged player's graveyard", () => {
    const zc = perm("zc", "Zombie Cannibal", CANNIBAL_ORACLE, { type: "Creature — Zombie", power: 1, toughness: 1 });
    let s = combatState({
      user: [zc], ai: [], aiGraveyard: [gyCard("g1", "Bolt")],
      attackers: [{ permanentId: "zc", attackingPlayer: "user", defender: "ai" }],
    });
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.players.ai.graveyard).toHaveLength(0);
    expect(s.players.ai.exile.map((c) => c.name)).toEqual(["Bolt"]);
  });
});

describe("SB-1 runtime — the granted/aura forms fire through the SAME chokepoint", () => {
  it("Sigil of Sleep: the enchanted host connects → the AURA's trigger bounces the damaged player's creature", () => {
    const host = perm("host", "Runeclaw Bear", "", { type: "Creature — Bear" });
    const sigil = createPermanent({
      id: "sigil",
      card: { id: "c-sigil", name: "Sigil of Sleep", type: "Enchantment — Aura", oracle: SIGIL_ORACLE },
      controller: "user", summoningSick: false,
    });
    sigil.attachedTo = "host";
    const bear = perm("bear", "Grizzly Bears", "", { controller: "ai", type: "Creature — Bear" });
    let s = combatState({ user: [host, sigil], ai: [bear], attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // mandatory (no "you may" on Sigil) → the bounce already resolved
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false);
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Grizzly Bears");
  });

  it("Arm with Aether: the until-EOT granted body fires on the granted creature's combat damage", () => {
    // Resolve the grant atom (the TG-1 vehicle) onto the controller's creatures, then connect.
    const atk = perm("atk", "Runeclaw Bear", "", { type: "Creature — Bear" });
    const bear = perm("bear", "Grizzly Bears", "", { controller: "ai", type: "Creature — Bear" });
    let s = combatState({ user: [atk], ai: [bear], attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }] });
    const grant = parseEffectClause(ARM_ORACLE.replace(/\.$/, ""), "Sorcery").atoms[0];
    expect(grant).toMatchObject({ op: "grant-until-eot", scope: "youControl", grantKind: "triggered" });
    s = resolveAtom(s, grant, { controller: "user", targets: [] });
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).length).toBe(1); // the granted saboteur trigger
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice?.kind).toBe("optional-effect"); // the granted body's "you may"
    s = resolveOptionalChoice(s, true);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false);
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Grizzly Bears");
  });
});
