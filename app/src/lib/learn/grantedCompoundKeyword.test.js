/**
 * grantedCompoundKeyword.test.js — the KEYWORD-combined granted-trigger line (Power Fist).
 *
 * "Equipped creature has trample and \"Whenever this creature deals combat damage to a player, put that
 * many +1/+1 counters on it.\"" is one line carrying BOTH a static keyword grant and a granted triggered
 * ability. Three seams handle it coherently:
 *   - triggers.GRANTED_ABILITY_LINE reaches past the keyword segment to the quoted trigger, so
 *     grantedTriggersForHost fires it on the host's event;
 *   - staticAbilityParser.parseAttachedClause strips the (validator-approved) quoted-trigger tail and
 *     models the keyword half as a normal layer-6 grant, so the runtime actually applies trample;
 *   - coverage.isNativeTriggerGrantAuraOrEquipment accepts the compound grant line but requires the
 *     static half to parse (parseAttachedBonus non-empty), so a card never claims native while the
 *     runtime silently drops its buff.
 *
 * CREED boundaries pinned here: an ungrantable keyword half (banding), an ACTIVATED quote, a trailing
 * rider after the quote, and the "player or planeswalker" object (The Reaver Cleaver) all stay body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkCombatDamageTriggers, checkDiesTriggers, parseGrantedTriggeredAbilities } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseEquipmentBonus } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const POWER_FIST_ORACLE = 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, put that many +1/+1 counters on it."\nEquip {2}';
const equipment = (name, oracle) => ({ name, type: "Artifact — Equipment", oracle, mana: "{2}" });

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function hostWithEquip(oracle, over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
  const host = permObj({ name: "Host", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "host", { attachments: ["grant"] });
  const grant = permObj({ name: "Power Fist", type: "Artifact — Equipment", oracle }, "user", "grant", { attachedTo: "host" });
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [host, grant] } } };
}

describe("COMPOUND KEYWORD GRANT — recognition (coverage)", () => {
  it("Power Fist's exact oracle → native-trigger, with the keyword half modeled as a bonus", () => {
    const card = equipment("Power Fist", POWER_FIST_ORACLE);
    expect(classifyCard(card)).toBe("native-trigger");
    // the static half must be a real layer op (runtime applies trample) — never a silent drop
    const bonus = parseEquipmentBonus(card);
    expect(bonus).toHaveLength(1);
    expect(bonus[0].op).toMatchObject({ layerOp: "addKeyword", keyword: "Trample" });
  });

  it("CREED: an UNGRANTABLE keyword half (banding) keeps the card body-only", () => {
    const card = equipment("Synth", 'Equipped creature has banding and "Whenever this creature deals combat damage to a player, put that many +1/+1 counters on it."\nEquip {2}');
    expect(classifyCard(card)).toBe("body-only");
    expect(parseEquipmentBonus(card)).toHaveLength(0);
  });

  it("CREED: an ACTIVATED quote is not a granted trigger — body-only", () => {
    expect(classifyCard(equipment("Synth", 'Equipped creature has trample and "{T}: Add {G}."\nEquip {2}'))).toBe("body-only");
  });

  it("CREED: a trailing rider after the quote leaves residue — body-only", () => {
    expect(classifyCard(equipment("Synth", 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, put that many +1/+1 counters on it." and gets +1/+1\nEquip {2}'))).toBe("body-only");
  });

  it('GRADUATED (CAP5, 2026-08-30): The Reaver Cleaver\'s "player or planeswalker" object is MODELED now', () => {
    // The union rides combatDamageToPlayer + alsoPlaneswalker (capReaverCleaver.test.js owns the fire
    // witnesses for both halves). The card classifies through the TRIGGER lane; asserted AS native so
    // this pin can never silently re-park it.
    const card = equipment("The Reaver Cleaver", 'Equipped creature gets +1/+1 and has trample and "Whenever this creature deals combat damage to a player or planeswalker, create that many Treasure tokens."\nEquip {3}');
    expect(classifyCard(card)).toBe("native-trigger");
  });
});

describe("COMPOUND KEYWORD GRANT — parseGrantedTriggeredAbilities", () => {
  it("extracts the quoted trigger from behind the keyword segment", () => {
    const d = parseGrantedTriggeredAbilities(equipment("Power Fist", POWER_FIST_ORACLE));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "combatDamageToPlayer", granted: true });
  });
});

describe("COMPOUND KEYWORD GRANT — runtime", () => {
  it("the host gets trample through the layer engine", () => {
    const s = hostWithEquip(POWER_FIST_ORACLE);
    expect(permanentHasKeyword(s, "host", "Trample")).toBe(true);
  });

  it("host deals combat damage → the granted trigger fires and puts THAT MANY +1/+1 counters on the host", () => {
    let s = hostWithEquip(POWER_FIST_ORACLE, { phase: "combat", step: "combat-damage" });
    const playerEvents = [{ kind: "combat-damage-player", attackerId: "host", attackingPlayer: "user", defender: "ai", amount: 3 }];
    s = checkCombatDamageTriggers(s, playerEvents);
    expect((s.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(s));
    const host = resolved.players.user.battlefield.find((p) => p.id === "host");
    expect(host.counters["+1/+1"]).toBe(3); // amount-bound: 3 damage → 3 counters
  });

  it("Eternal Thirst (reminder-text line): the granted WATCHER trigger fires when an opponent's creature dies", () => {
    // The grant line ends in reminder text — the extraction must strip it or the runtime silently drops
    // the trigger while the classifier credits the card (the FP this slice's audit caught).
    const ETERNAL_THIRST = 'Enchant creature\nEnchanted creature has lifelink and "Whenever a creature an opponent controls dies, put a +1/+1 counter on this creature." (Damage dealt by a creature with lifelink also causes its controller to gain that much life.)';
    let s = hostWithEquip(ETERNAL_THIRST);
    expect(permanentHasKeyword(s, "host", "Lifelink")).toBe(true);
    // the death look-back snapshot (destroyLethalCreatures' return shape) — the victim is already gone
    s = checkDiesTriggers(s, [{ id: "victim", controller: "ai", name: "Victim", card: { name: "Victim", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" } }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(s));
    const host = resolved.players.user.battlefield.find((p) => p.id === "host");
    expect(host.counters["+1/+1"]).toBe(1);
  });
});
