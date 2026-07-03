/**
 * superState.test.js — SUPER STATE, a 3-part Aura subsystem played END-TO-END natively.
 *
 * Super State (Legendary Enchantment — Aura):
 *   "Enchant creature you control
 *    Enchanted creature has base power and toughness 9/9 and has flying, first strike, trample, and haste.
 *    Whenever enchanted creature deals combat damage to an opponent, it deals that much damage to each other opponent."
 *
 * Three blockers, all modeled here:
 *   A. ENCHANT SUBJECT "creature you control" — auraEnchantRestrictions returns the controller:"you" restriction,
 *      so the aura's legal targets (and its nativeness) are the caster's OWN creatures only (CR 303.4a).
 *   B. COMPOUND SET-BASE-P/T + KEYWORDS — "has base power and toughness 9/9 and has <kw>…" now composes in
 *      parseAttachedClause (a 7b base-set op + layer-6 addKeyword ops), instead of the base-set dropping the tail.
 *   C. AURA-OWN COMBAT-DAMAGE TRIGGER — "Whenever enchanted creature deals combat damage to an opponent, it deals
 *      that much damage to each other opponent." The Aura is a live trigger SOURCE while attached; the combat-
 *      damage flush fires it (equippedCreature attached-linkage scope) and the cdmg-to-each-other-opponent atom
 *      deals ctx.combatDamageAmount to each opponent EXCEPT the one just hit (CR 113.7 "other").
 *
 * Engine-first: the aura must attach, the layer engine must set 9/9 + grant the keywords, AND the trigger must
 * fire + deal the relayed damage to each OTHER opponent — or the card is an FP.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { isNativeAura, parseAuraBonus, auraEnchantRestrictions } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const SUPER_STATE_ORACLE =
  "Enchant creature you control\n" +
  "Enchanted creature has base power and toughness 9/9 and has flying, first strike, trample, and haste.\n" +
  "Whenever enchanted creature deals combat damage to an opponent, it deals that much damage to each other opponent.";
const superStateCard = { name: "Super State", type: "Legendary Enchantment — Aura", mana: "{7}", oracle: SUPER_STATE_ORACLE };

const auraPerm = (id, hostId, controller = "user") =>
  ({ ...createPermanent({ id, card: superStateCard, controller }), attachedTo: hostId });
const host = (id, controller, p = 2, t = 2, attachments = []) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: p, toughness: t, oracle: "" }, controller, summoningSick: false }), attachments });

describe("Super State — detection + classification (all three blockers)", () => {
  it("the aura-own combat-damage trigger is detected (equippedCreature attached-linkage scope)", () => {
    const d = detectTriggers(superStateCard).filter((t) => t.event === "combatDamageToPlayer");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "equippedCreature" });
    expect(d[0].effectClause).toBe("it deals that much damage to each other opponent");
  });

  it("the compound set-base-P/T + keyword bonus parses (7b set + 4 layer-6 keyword grants)", () => {
    const bonus = parseAuraBonus(superStateCard);
    expect(bonus.filter((b) => b.sublayer === "7b")).toEqual([
      { layer: 7, sublayer: "7b", op: { power: 9, toughness: 9 }, duration: { kind: "permanent" } },
    ]);
    const kws = bonus.filter((b) => b.op?.layerOp === "addKeyword").map((b) => b.op.keyword);
    expect(kws).toEqual(["Flying", "First strike", "Trample", "Haste"]);
  });

  it('enchant "creature you control" → controller:"you" restriction', () => {
    expect(auraEnchantRestrictions(superStateCard)).toEqual([{ kind: "controller", who: "you" }]);
  });

  it("Super State classifies native-aura (all three blockers modeled, no residue)", () => {
    expect(isNativeAura(superStateCard)).toBe(true);
    expect(classifyCard(superStateCard)).toBe("native-aura");
  });
});

describe("Super State — layer engine: the aura sets base 9/9 + grants the four keywords", () => {
  function attached() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const h = host("host", "user", 2, 2, ["ss"]);
    const a = auraPerm("ss", "host", "user");
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [h, a] } } };
  }
  it("the enchanted 2/2 becomes a 9/9 with flying, first strike, trample, haste", () => {
    const s = attached();
    const h = s.players.user.battlefield.find((p) => p.id === "host");
    expect(creaturePower(h, s)).toBe(9);
    expect(creatureToughness(h, s)).toBe(9);
    for (const kw of ["flying", "first strike", "trample", "haste"]) {
      expect(permanentHasKeyword(s, "host", kw)).toBe(true);
    }
  });
});

describe("Super State — engine-first: the trigger fires + relays the combat damage to each OTHER opponent", () => {
  function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; }
  // 4-player Commander pod: user + ai1/ai2/ai3. The host attacks ai1; Super State should deal that much
  // damage to ai2 and ai3 (the OTHER opponents), NOT ai1 (already hit) and NOT user (the controller).
  function pod() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const h = host("host", "user", 9, 9, ["ss"]); // already 9/9 (the layer set proven above)
    const a = auraPerm("ss", "host", "user");
    return {
      ...s, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [h, a] },
        ai1: { ...s.players.ai1, life: 40 },
        ai2: { ...s.players.ai2, life: 40 },
        ai3: { ...s.players.ai3, life: 40 },
      },
    };
  }

  it("an unblocked 9/9 hits ai1 for 9, then the aura deals 9 to ai2 and ai3 (NOT ai1, NOT user)", () => {
    let s = pod();
    s = resolveCombatDamage(s, { firstStrikeStep: true });     // the host has first strike (granted by the aura)
    expect(s.players.ai1.life).toBe(31);                       // 9 combat damage landed on the attacked opponent
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai2.life).toBe(31);                       // 9 relayed to the other opponents
    expect(s.players.ai3.life).toBe(31);
    expect(s.players.ai1.life).toBe(31);                       // ai1 was NOT double-hit (it's the "other" exclusion)
    expect(s.players.user.life).toBe(40);                      // the controller is never a target
  });

  it("CREED 1v1: with no OTHER opponent, the relay is a clean no-op (never a self-hit or double-hit)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });   // Standard: user vs ai (one opponent)
    const h = host("host", "user", 9, 9, ["ss"]);
    const a = auraPerm("ss", "host", "user");
    let st = {
      ...s, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [h, a], life: 40 }, ai: { ...s.players.ai, life: 40 } },
    };
    st = resolveCombatDamage(st, { firstStrikeStep: true });   // the host has first strike (granted by the aura)
    expect(st.players.ai.life).toBe(31);                       // 9 combat damage
    st = resolveAll(flushTriggers(st, { chooseTargets: chooseTriggerTargets }));
    expect(st.players.ai.life).toBe(31);                       // NO extra damage — ai is the only opponent (the hit one)
    expect(st.players.user.life).toBe(40);                     // controller untouched
  });
});

describe("Super State — CREED near-misses stay body-only", () => {
  const t = (o) => ({ name: "X", type: "Enchantment — Aura", oracle: o });
  it("an unmodeled aura-own trigger (different effect) → body-only", () => {
    expect(classifyCard(t("Enchant creature you control\nEnchanted creature has base power and toughness 9/9 and has flying.\nWhenever enchanted creature deals combat damage to an opponent, you may draw a card."))).toBe("body-only");
  });
  it('a qualified object "a player or planeswalker" → body-only', () => {
    expect(classifyCard(t("Enchant creature you control\nEnchanted creature has flying.\nWhenever enchanted creature deals combat damage to a player or planeswalker, it deals that much damage to each other opponent."))).toBe("body-only");
  });
  it('enchant "creature an opponent controls" → body-only (subject not modeled)', () => {
    expect(classifyCard(t("Enchant creature an opponent controls\nEnchanted creature has base power and toughness 0/1."))).toBe("body-only");
  });
  it("a dynamic base-P/T set still drops the whole bonus → body-only", () => {
    expect(classifyCard(t("Enchant creature\nEnchanted creature has base power and toughness 0/0, where X is your life total."))).toBe("body-only");
  });
});
