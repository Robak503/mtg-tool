/**
 * SELF-DIES-RETURN-AS-ENCHANTMENT (the "Enduring"/Glimmer cycle — Enduring Curiosity, Tenacity, Vitality,
 * Innocence, Courage). Every card in this Duskmourn cycle carries the SAME dies template:
 *
 *   "When <this creature> dies, if it was a creature, return it to the battlefield under its owner's control.
 *    It's an enchantment. (It's not a creature.)"
 *
 * TWO seams close the flip for Enduring Curiosity (whose OTHER clause — a combat-damage draw — already routed):
 *   1. the "it was a creature" intervening-if (CR 603.4 + 603.6e last-known-info), evaluated at flush AND
 *      resolution against ctx.triggeringWasCreature (stamped from the death look-back's type line); and
 *   2. the "self-return-bf-enchantment" atom — the dying object (its card now in a graveyard) is put BACK onto
 *      the battlefield under its OWNER's control AS A NON-CREATURE ENCHANTMENT: its type line loses "Creature"
 *      and its power/toughness are cleared, so every downstream reader treats it as a non-creature (CREED —
 *      the WHOLE "It's an enchantment. (It's not a creature.)" state change is modeled, never a parse-only flip).
 *
 * Pins, in order: detection + rewrite (the marker) · intervening-if parseable/evaluate (WAS-A-CREATURE) ·
 * parser routing (marker → the atom, HIGH non-targeted) · classify (Enduring Curiosity → native-trigger) ·
 * the engine (CREED core: the dead Cat returns as a NON-creature Enchantment under its owner's control) ·
 * CR 111.7 token guard · CR 608.2b no-op-when-gone · CREED false-negative guards (a bare "return it to the
 * battlefield" WITHOUT the "It's an enchantment" rider stays LOW; a NON-creature look-back drops the trigger).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures,
} from "./gameState.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { applySelfReturnBattlefieldEnchantment } from "./effects/atoms/selfReturn.js";

beforeEach(() => _resetIdsForTests());

const CURIOSITY_ORACLE =
  "Flash\nWhenever a creature you control deals combat damage to a player, draw a card.\nWhen Enduring Curiosity dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)";
const curiosityCard = (id = "ec-card") => ({
  id, name: "Enduring Curiosity", type: "Enchantment Creature — Cat Glimmer",
  power: "4", toughness: "3", keywords: ["Flash"], oracle: CURIOSITY_ORACLE,
});

const MARKER = "[self-return-bf:enchantment] return it to the battlefield under its owner's control as an enchantment";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function markLethal(state, pid, permId) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid],
    battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

describe("detection + rewrite", () => {
  it("the dies trigger is detected (self scope, 'it was a creature' intervening-if) and its effect is rewritten to the enchantment-return marker", () => {
    const [d] = detectTriggers(curiosityCard()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self", interveningIf: "it was a creature" });
    expect(d.effectClause).toBe(MARKER);
  });

  it("both of Enduring Curiosity's triggers route natively (the combat-damage draw AND the dies-return)", () => {
    const dets = detectTriggers(curiosityCard());
    expect(dets.map((d) => d.event).sort()).toEqual(["combatDamageToPlayer", "dies"]);
    expect(dets.every(triggerRoutesNatively)).toBe(true);
  });
});

describe("intervening-if (WAS-A-CREATURE, CR 603.4 + 603.6e)", () => {
  it("'it was a creature' is a parseable condition", () => {
    expect(interveningIfParseable("it was a creature")).toBe(true);
  });

  it("evaluates true when the dying object was a creature, false when it wasn't, null with no context flag", () => {
    const s = baseState();
    expect(evaluateInterveningIf(s, "it was a creature", "user", { triggeringWasCreature: true })).toBe(true);
    expect(evaluateInterveningIf(s, "it was a creature", "user", { triggeringWasCreature: false })).toBe(false);
    expect(evaluateInterveningIf(s, "it was a creature", "user", {})).toBeNull(); // FN-safe: never fail-open
  });
});

describe("parser routing", () => {
  it("the marker parses HIGH, non-targeted → the self-return-bf-enchantment atom", () => {
    const p = parseEffectClause(MARKER, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(false);
    expect(p.atoms).toEqual([{ op: "self-return-bf-enchantment" }]);
  });
});

describe("classify", () => {
  it("Enduring Curiosity flips to a native-trigger tier", () => {
    expect(classifyCard(curiosityCard())).toBe("native-trigger");
  });
});

describe("engine (CREED core)", () => {
  it("the dead Cat returns to the battlefield as a NON-creature Enchantment under its owner's control", () => {
    let s = baseState();
    const ec = createPermanent({ id: "ec", card: curiosityCard(), controller: "user", summoningSick: false });
    s = withBattlefield(s, "user", [ec]);
    s = markLethal(s, "user", "ec");

    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    // one dies-return trigger enqueued; the card is in the graveyard pre-resolution
    expect((s.pendingTriggers || []).filter((t) => t.event === "dies")).toHaveLength(1);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Enduring Curiosity");

    s = resolveAll(s);
    // it left the graveyard and re-entered the battlefield
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Enduring Curiosity");
    const bf = s.players.user.battlefield.filter((p) => p.card?.name === "Enduring Curiosity");
    expect(bf).toHaveLength(1);
    const returned = bf[0];
    // CREED core: no longer a creature — type line stripped, no power/toughness, still an Enchantment
    expect(returned.card.type).toBe("Enchantment — Cat Glimmer");
    expect(/Creature/.test(returned.card.type)).toBe(false);
    expect(returned.card.power).toBeNull();
    expect(returned.card.toughness).toBeNull();
    expect(returned.controller).toBe("user"); // under its OWNER's control
  });
});

describe("atom fail-safes", () => {
  it("CR 111.7 — a TOKEN never returns (it ceases to exist)", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ id: "tok", name: "Cat", token: true, type: "Enchantment Creature — Cat Glimmer" }] } } };
    const after = applySelfReturnBattlefieldEnchantment(s, { op: "self-return-bf-enchantment" },
      { triggeringController: "user", triggeringCardId: "tok", triggeringCardIsToken: true });
    expect(after.players.user.battlefield).toEqual([]);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Cat"]); // dropped, never re-entered
  });

  it("CR 608.2b — the card already left the graveyard → a logged no-op (no fabricated permanent)", () => {
    const s = baseState();
    const after = applySelfReturnBattlefieldEnchantment(s, { op: "self-return-bf-enchantment" },
      { triggeringController: "user", triggeringCardId: "gone" });
    expect(after.players.user.battlefield).toEqual([]);
  });
});

describe("CREED false-negative guards (a partial / mis-shaped variant stays non-native)", () => {
  it("a bare 'return it to the battlefield under its owner's control' WITHOUT the 'It's an enchantment' rider is NOT rewritten → stays LOW", () => {
    // A hypothetical Phoenix-to-battlefield (no type change) must not collapse to the enchantment-return atom.
    const bareCard = {
      id: "bare", name: "Bare Reanimator", type: "Creature — Phoenix", power: "4", toughness: "4",
      oracle: "When Bare Reanimator dies, if it was a creature, return it to the battlefield under its owner's control.",
    };
    const [d] = detectTriggers(bareCard).filter((t) => t.event === "dies");
    // effect is NOT the enchantment marker (the 'It's an enchantment' rider is absent) → not rewritten
    expect(d.effectClause).not.toBe(MARKER);
    expect(triggerRoutesNatively(d)).toBe(false); // the bare return-to-battlefield is unmodeled → Arbiter
  });

  it("a NON-creature look-back drops the dies-return trigger (CR 603.4 — 'it was a creature' is false)", () => {
    // If the object had already lost its creature type before dying, the intervening-if is false → no return.
    const s = baseState();
    expect(evaluateInterveningIf(s, "it was a creature", "user", { triggeringWasCreature: false })).toBe(false);
  });
});
