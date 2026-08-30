/**
 * capAmericaLiberator.test.js — the EQUIPMENT-ATTACHED-TO-SOURCE count (SHELF CAP2 —
 * Captain America, Liberator).
 *
 * "Whenever Captain America attacks, for each Equipment attached to him, create a 1/1 white Soldier
 * creature token." Seams:
 *   1. the trigger rewrite inverts the LEADING "for each Equipment attached to him, create <tok>" to
 *      the trailing mtf form + normalizes the gendered referent → "…for each equipment attached to
 *      this creature" (scope-SELF gated, whole-clause anchored — NOT a general for-each inversion).
 *   2. parseCountSource maps the phrase → { kind: "equipmentAttachedToSource" }.
 *   3. countForSpec counts Equipment whose attachedTo === ctx.sourceId, live at resolution (CR 608.2h).
 * CREED FP = counting Auras, counting Equipment attached to OTHER permanents, or a fabricated count
 * when the source is gone.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const LIBERATOR = {
  name: "Captain America, Liberator", type: "Legendary Creature — Human Soldier Hero", mana: "{3}{W}{W}",
  power: 3, toughness: 4,
  oracle: "When Captain America enters, you may search your library for an Equipment card with mana value 3 or less, put it onto the battlefield, then shuffle.\nWhenever Captain America attacks, for each Equipment attached to him, create a 1/1 white Soldier creature token.",
};

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(userPerms, over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", ...over };
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userPerms } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}
const soldierTokens = (s) => (s.players.user.battlefield || []).filter((p) => p.card?.token && /Soldier/.test(String(p.card.type || "")));

describe("detection + classify", () => {
  it("the attack half rewrites to the trailing mtf form with the source referent; the card flips native", () => {
    const ds = detectTriggers(LIBERATOR);
    const atk = ds.find((d) => d.event === "attacks");
    expect(atk).toMatchObject({ event: "attacks", scope: "self" });
    expect(atk.effectClause).toBe("create a 1/1 white Soldier creature token for each equipment attached to this creature");
    expect(triggerRoutesNatively(atk)).toBe(true);
    expect(classifyCard(LIBERATOR)).toBe("native-trigger");
  });

  it("CREED — the inversion is NOT general: an iterative 'for each creature you control, tap it' stays unrewritten", () => {
    const card = { name: "Synth Tapper", type: "Creature — Human", power: 1, toughness: 1, oracle: "Whenever this creature attacks, for each creature you control, tap it." };
    const ds = detectTriggers(card).filter((d) => d.event === "attacks");
    if (ds.length) expect(triggerRoutesNatively(ds[0])).toBe(false);
    expect(classifyCard(card)).toBe("body-only");
  });
});

describe("runtime — the token count is the live attached-Equipment count", () => {
  const swordCard = { name: "Short Sword", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nEquip {1}" };
  const auraCard = { name: "Holy Strength", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+2." };

  function attackState(extraPerms) {
    const cap = permObj(LIBERATOR, "user", "cap", { attachments: extraPerms.filter((p) => p.attachedTo === "cap").map((p) => p.id) });
    const s = stateWith([cap, ...extraPerms]);
    return { ...s, combat: { attackers: [{ permanentId: "cap", attackingPlayer: "user", defender: "ai" }] } };
  }

  it("two attached Equipment → exactly two Soldier tokens", () => {
    const s1 = permObj(swordCard, "user", "sw1", { attachedTo: "cap" });
    const s2 = permObj({ ...swordCard, name: "Long Sword" }, "user", "sw2", { attachedTo: "cap" });
    const after = resolveAll(checkAttackTriggers(attackState([s1, s2])));
    expect(soldierTokens(after)).toHaveLength(2);
  });

  it("zero attached Equipment → zero tokens (a clean no-op, never a fabricated count)", () => {
    const after = resolveAll(checkAttackTriggers(attackState([])));
    expect(soldierTokens(after)).toHaveLength(0);
  });

  it("FP guard — an attached AURA does not count; Equipment on a DIFFERENT creature does not count", () => {
    const aura = permObj(auraCard, "user", "aura", { attachedTo: "cap" });
    const other = permObj({ name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "bear");
    const sw = permObj(swordCard, "user", "sw1", { attachedTo: "bear" });
    const after = resolveAll(checkAttackTriggers(attackState([aura, other, sw])));
    expect(soldierTokens(after)).toHaveLength(0);
  });
});
