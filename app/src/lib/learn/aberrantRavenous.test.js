/**
 * aberrantRavenous.test.js — KW-RAVENOUS (Edge of Eternities / Warhammer 40k) + the "Heavy Power Hammer"
 * ability-word label + the DAMAGED-PLAYER destroy scope, proven on Aberrant:
 *
 *   Ravenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)
 *   Trample
 *   Heavy Power Hammer — Whenever this creature deals combat damage to a player, destroy target artifact or
 *   enchantment that player controls.
 *
 * THREE modeled pieces, each end-to-end (engine-first — a bare matcher earns nothing):
 *   1. RAVENOUS enters-with-X — the reminder-text enters-with-X +1/+1 counters feed the resolver's opts.xValue
 *      → the creature enters as a real X/X (staticAbilityParser.entersWithXCounters now sees the reminder form).
 *   2. RAVENOUS conditional draw — a synthesized self-ETB draw trigger GATED on X≥5 (interveningIf against
 *      ctx.xValue). X=5 draws a card; X=3 (or any X<5) does NOT.
 *   3. HEAVY POWER HAMMER combat-damage destroy — the ability-word label is stripped, the trigger is detected,
 *      and it destroys an artifact/enchantment the JUST-DAMAGED player controls (ctx.damagedPlayerId), never a
 *      non-damaged opponent's (the multiplayer isolation) — the exact mirror of Kogla's defendingPlayer scope.
 *
 * CREED near-misses: a SPELL carrying the "that player controls" destroy stays arbiter-spell (a spell never
 * supplies ctx.damagedPlayerId → the clause would silently drop); the destroy trigger routes native ONLY on
 * combatDamageToPlayer (an attacks/spell event leaves the referent unset → SAFE FN); a card merely NAMED
 * "Ravenous …" without the keyword+reminder is untouched.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { entersWithXCounters } from "./staticAbilityParser.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { enterPermanent } from "./resolvers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ABERRANT_ORACLE =
  "Ravenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)\n" +
  "Trample\n" +
  "Heavy Power Hammer — Whenever this creature deals combat damage to a player, destroy target artifact or enchantment that player controls.";

const aberrantCard = (over = {}) => ({
  id: "ab-card", name: "Aberrant", type: "Creature — Tyranid Mutant", mana: "{X}{1}{G}",
  power: 0, toughness: 0, oracle: ABERRANT_ORACLE, keywords: ["Ravenous", "Trample", "Heavy Power Hammer"], ...over,
});

function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; }

// ─────────────────────────────────────────────────────────────────────────────
// Detection + classification
// ─────────────────────────────────────────────────────────────────────────────
describe("Aberrant — detection + classification", () => {
  it("classifies native-trigger (Ravenous + Trample + the combat-damage destroy, no residue)", () => {
    const tier = classifyCard(aberrantCard());
    expect(tier).toBe("native-trigger");
    expect(isNativeTier(tier)).toBe(true);
  });

  it("entersWithXCounters recognizes the Ravenous REMINDER form", () => {
    expect(entersWithXCounters(aberrantCard())).toBe(true);
  });

  it("detects BOTH triggers, each routing natively", () => {
    const trigs = detectTriggers(aberrantCard());
    // the synthesized Ravenous ETB draw + the Heavy Power Hammer combat-damage destroy
    const etb = trigs.find((t) => t.event === "etb" && t.sourceText === "Ravenous");
    const cdmg = trigs.find((t) => t.event === "combatDamageToPlayer");
    expect(etb).toBeTruthy();
    expect(etb.interveningIf).toBe("x is 5 or more");
    expect(cdmg).toBeTruthy();
    expect(trigs.every(triggerRoutesNatively)).toBe(true);
  });

  it("the Heavy Power Hammer ability-word label is stripped (else the trigger is undetected)", () => {
    // Without the label strip the combat-damage trigger would be invisible (0 detected) → body-only.
    const cdmg = detectTriggers(aberrantCard()).filter((t) => t.event === "combatDamageToPlayer");
    expect(cdmg).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The DAMAGED-PLAYER destroy atom + target scoping
// ─────────────────────────────────────────────────────────────────────────────
describe("DAMAGED-PLAYER destroy — parse + enumeration", () => {
  it("parses 'that player controls' to a damagedPlayer controller restriction + who pin", () => {
    const p = parseEffectClause("destroy target artifact or enchantment that player controls");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{
      op: "destroy", targetType: "artifactOrEnchantment",
      restrictions: [{ kind: "controller", who: "damagedPlayer" }], who: "damagedPlayer",
    }]);
  });

  it("enumerates ONLY the damaged player's permanents (multiplayer isolation)", () => {
    const art1 = { id: "art1", card: { name: "Signet1", type: "Artifact", oracle: "" }, controller: "ai1" };
    const ench2 = { id: "ench2", card: { name: "Aura2", type: "Enchantment", oracle: "" }, controller: "ai2" };
    const state = { players: {
      user: { battlefield: [], graveyard: [] },
      ai1: { battlefield: [art1], graveyard: [] },
      ai2: { battlefield: [ench2], graveyard: [] },
    } };
    const spec = { kind: "destroy", targetType: "artifactOrEnchantment", restrictions: [{ kind: "controller", who: "damagedPlayer" }] };
    // ai1 is the damaged player → only its permanent is legal (ai2's is excluded).
    expect(enumerateTargets(state, "user", spec, [], { damagedPlayerId: "ai1" }).map((t) => t.name)).toEqual(["Signet1"]);
    // No damagedPlayerId (a spell / non-combat path) → empty pool → the ability drops no-target (SAFE, CREED).
    expect(enumerateTargets(state, "user", spec, [], {})).toEqual([]);
  });

  it("CREED: the destroy trigger routes native ONLY on combatDamageToPlayer", () => {
    const clause = "destroy target artifact or enchantment that player controls";
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", effectClause: clause })).toBe(true);
    // An attacks event leaves ctx.damagedPlayerId unset → the referent is unsatisfied → SAFE FN.
    expect(triggerRoutesNatively({ event: "attacks", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "etb", effectClause: clause })).toBe(false);
  });

  it("CREED: a SPELL carrying the damagedPlayer destroy stays arbiter-spell (never a silent drop)", () => {
    const spell = { name: "Fake Sorcery", type: "Sorcery", mana: "{2}{G}", oracle: "Destroy target artifact or enchantment that player controls." };
    expect(classifyCard(spell)).toBe("arbiter-spell");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Engine-first: Ravenous enters-with-X + the conditional draw actually resolve
// ─────────────────────────────────────────────────────────────────────────────
describe("Ravenous — engine-first ETB (enters-with-X counters + the X≥5 draw)", () => {
  function baseState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, library: [{ id: "lib1", name: "L1", type: "Instant", oracle: "" }, { id: "lib2", name: "L2", type: "Instant", oracle: "" }], hand: [] },
    } };
  }

  it("X=5: enters with 5 +1/+1 counters AND draws a card", () => {
    let s = baseState();
    s = enterPermanent(s, aberrantCard(), "user", { xValue: 5 });
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Aberrant");
    expect(perm.counters["+1/+1"]).toBe(5);       // enters as a real 5/5
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand).toHaveLength(1);   // X≥5 → drew a card
  });

  it("X=3: enters with 3 +1/+1 counters and does NOT draw (X<5)", () => {
    let s = baseState();
    s = enterPermanent(s, aberrantCard(), "user", { xValue: 3 });
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Aberrant");
    expect(perm.counters["+1/+1"]).toBe(3);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand).toHaveLength(0);   // X<5 → no draw (the intervening-if dropped it)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Engine-first: the Heavy Power Hammer combat-damage destroy
// ─────────────────────────────────────────────────────────────────────────────
describe("Heavy Power Hammer — engine-first combat-damage destroy", () => {
  it("destroys an artifact the just-damaged player controls after connecting", () => {
    const aberrant = createPermanent({ id: "ab", card: { id: "c-ab", name: "Aberrant", type: "Creature — Tyranid Mutant", power: 5, toughness: 5, oracle: ABERRANT_ORACLE, keywords: ["Ravenous", "Trample", "Heavy Power Hammer"] }, controller: "user", summoningSick: false });
    const signet = createPermanent({ id: "art", card: { id: "c-art", name: "Signet", type: "Artifact", oracle: "" }, controller: "ai", summoningSick: false });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "ab", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s0.players,
        user: { ...s0.players.user, battlefield: [aberrant], life: 40 },
        ai: { ...s0.players.ai, battlefield: [signet], life: 40 } } };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(35);            // 5 combat damage landed on the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Signet")).toBe(false); // destroyed
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Signet");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREED: a card merely NAMED "Ravenous …" without the keyword is untouched
// ─────────────────────────────────────────────────────────────────────────────
describe("CREED — the Ravenous NAME is never mistaken for the keyword", () => {
  it("'Ravenous Chupacabra'-style ETB removal is not force-flipped by the keyword matcher", () => {
    // A card whose text merely contains the word "Ravenous" (a name) but no Ravenous reminder → no synthesized
    // enters-with-X, no synthesized draw trigger.
    const named = { name: "Ravenous Chupacabra", type: "Creature — Beast", mana: "{2}{B}{B}",
      oracle: "When Ravenous Chupacabra enters, destroy target creature an opponent controls." };
    expect(entersWithXCounters(named)).toBe(false);
    expect(detectTriggers(named).some((t) => t.sourceText === "Ravenous")).toBe(false);
  });
});
