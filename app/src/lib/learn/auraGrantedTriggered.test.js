/**
 * auraGrantedTriggered.test.js — SUBSYSTEM 1 phase 1c: GRANTED-TRIGGERED ability runtime.
 *
 * An Aura/Equipment that grants the enchanted/equipped CREATURE a triggered ability ("Enchanted creature
 * has \"Whenever this creature deals combat damage to a player, you may draw a card.\"" — Sixth Sense;
 * "\"At the beginning of your upkeep, create a 1/1 white Human creature token.\"" — Commander's Authority)
 * is now (a) classified native-trigger and (b) actually FIRED: triggers.triggersForEvent merges the host's
 * granted triggered descriptors with its printed ones, so a granted trigger fires on the HOST's event and
 * its effect resolves with the source bound to the host.
 *
 * The granted trigger text is parsed through the SAME detectTriggers path as a printed trigger, so the
 * runtime + coverage can't drift. CREED: all-or-nothing recognition (a rider or an unmodeled granted
 * effect keeps the card Arbiter), and the injection is additive (the printed-trigger path is untouched —
 * the flip-diff showed 0 OUT / 0 collateral).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkStepTriggers, checkCombatDamageTriggers, parseGrantedTriggeredAbilities } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const aura = (name, oracle) => ({ name, type: "Enchantment — Aura", oracle });
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
// A host creature with an attached granting permanent, linked both ways.
function hostWith(grantOracle, grantType = "Enchantment — Aura", over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
  const host = permObj({ name: "Host", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "host", { attachments: ["grant"] });
  const grant = permObj({ name: "Grant", type: grantType, oracle: grantOracle }, "user", "grant", { attachedTo: "host" });
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [host, grant] } } };
}

describe("GRANTED-TRIGGERED (1c) — recognition", () => {
  it("a clean granted modeled trigger → native-trigger", () => {
    expect(classifyCard(aura("Sixth Sense", 'Enchant creature\nEnchanted creature has "Whenever this creature deals combat damage to a player, you may draw a card."'))).toBe("native-trigger");
    expect(classifyCard(aura("Commander's Authority", 'Enchant creature\nEnchanted creature has "At the beginning of your upkeep, create a 1/1 white Human creature token."'))).toBe("native-trigger");
  });
  it("FN boundary — an UNMODELED granted effect or a rider keeps the card Arbiter", () => {
    // unmodeled effect (tap/untap target permanent) → Arbiter
    expect(classifyCard(aura("Ghostly Touch", 'Enchant creature\nEnchanted creature has "Whenever this creature attacks, you may tap or untap target permanent."'))).toBe("body-only");
    // ⭐ GRADUATED 2026-07-30 — this is the Nurturing Presence shape (a MODELED aura-own ETB beside a modeled
    // granted trigger) and AU-GRANT+STATIC credits it now. Runtime-proven before the lane was widened: the
    // Aura's own ETB still fires with a grant line present (the token is created either way), measured rather
    // than inferred from the static-bonus case that shipped first.
    expect(classifyCard(aura("Ridered", 'Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature has "Whenever this creature deals combat damage to a player, you may draw a card."'))).toBe("native-trigger");
    // ⛔ the rider direction this line was guarding, re-aimed: an UNMODELED aura-own rider still parks it.
    expect(classifyCard(aura("Ridered2", 'Enchant creature\nWhenever a player consults an oracle, interpret its riddle however you like.\nEnchanted creature has "Whenever this creature deals combat damage to a player, you may draw a card."'))).toBe("body-only");
  });
});

describe("GRANTED-TRIGGERED (1c) — parseGrantedTriggeredAbilities", () => {
  it("parses the quoted trigger via detectTriggers (event/scope/effect)", () => {
    const d = parseGrantedTriggeredAbilities(aura("Sixth Sense", 'Enchant creature\nEnchanted creature has "Whenever this creature deals combat damage to a player, you may draw a card."'));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "combatDamageToPlayer", granted: true });
  });
  it("ignores a granted ACTIVATED / MANA ability (only triggered)", () => {
    expect(parseGrantedTriggeredAbilities(aura("Hermetic Study", 'Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."'))).toHaveLength(0);
  });
});

describe("GRANTED-TRIGGERED (1c) — runtime: the granted trigger fires on the host event", () => {
  it("Commander's Authority: the host's upkeep fires the granted token trigger (and resolves)", () => {
    let s = hostWith('Enchant creature\nEnchanted creature has "At the beginning of your upkeep, create a 1/1 white Human creature token."', "Enchantment — Aura", { phase: "beginning", step: "upkeep" });
    const n0 = s.players.user.battlefield.length;
    const out = checkStepTriggers(s, "upkeep");
    expect((out.pendingTriggers || []).length).toBe(1);                 // the granted trigger fired
    const resolved = resolveTopOfStack(flushTriggers(out));
    expect(resolved.players.user.battlefield.length).toBe(n0 + 1);      // a 1/1 token was created
  });

  it("Commander's Authority does NOT fire on an OPPONENT's upkeep (whose: yours)", () => {
    const s = hostWith('Enchant creature\nEnchanted creature has "At the beginning of your upkeep, create a 1/1 white Human creature token."', "Enchantment — Aura", { phase: "beginning", step: "upkeep", activePlayer: "ai" });
    expect((checkStepTriggers(s, "upkeep").pendingTriggers || [])).toHaveLength(0);
  });

  it("Sixth Sense: the host dealing combat damage to a player fires the granted draw trigger onto the stack", () => {
    let s = hostWith('Enchant creature\nEnchanted creature has "Whenever this creature deals combat damage to a player, you may draw a card."', "Enchantment — Aura", { phase: "combat", step: "combat-damage" });
    const playerEvents = [{ kind: "combat-damage-player", attackerId: "host", attackingPlayer: "user", defender: "ai", amount: 2 }];
    s = checkCombatDamageTriggers(s, playerEvents);
    expect((s.pendingTriggers || []).length).toBe(1);                   // the granted trigger fired on the host's combat damage
    // it flushes onto the stack as the controller's optional draw, sourced to the HOST (granted source binding)
    const flushed = flushTriggers(s);
    const trig = (flushed.stack || []).find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.payload.params.program.atoms[0].op).toBe("draw");       // the granted effect program
    expect(trig.source.permanentId).toBe("host");                       // "this creature" / source binds to the host
  });
});
