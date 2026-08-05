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
  it("a bare 'return it to the battlefield under its owner's control' WITHOUT the 'It's an enchantment' rider never takes the ENCHANTMENT marker (identity preserved)", () => {
    // GRADUATED (BLITZ TG-1): this pin originally asserted the bare form stays LOW — the dies-return-to-
    // battlefield had no model, so the FN-boundary was "unmodeled → Arbiter". TG-1's [dies-return-bf]
    // sentinel now models exactly this shape (the Feign Death frame — return as-is, NO type change), so the
    // bare form legitimately routes. The boundary this guard still owns: the bare return must NEVER collapse
    // to the ENCHANTMENT marker (which strips the creature type — a fabricated identity change, the original
    // FP this test was built against). grantUntilEot.test.js owns the dies-return-bf runtime pins.
    const bareCard = {
      id: "bare", name: "Bare Reanimator", type: "Creature — Phoenix", power: "4", toughness: "4",
      oracle: "When Bare Reanimator dies, if it was a creature, return it to the battlefield under its owner's control.",
    };
    const [d] = detectTriggers(bareCard).filter((t) => t.event === "dies");
    // effect is NOT the enchantment marker (the 'It's an enchantment' rider is absent) → no type strip
    expect(d.effectClause).not.toBe(MARKER);
    expect(d.effectClause).toBe("[dies-return-bf] return it to the battlefield under its owner's control");
    expect(triggerRoutesNatively(d)).toBe(true); // TG-1 — the as-is return is now modeled (dies-return-bf)
  });

  it("a NON-creature look-back drops the dies-return trigger (CR 603.4 — 'it was a creature' is false)", () => {
    // If the object had already lost its creature type before dying, the intervening-if is false → no return.
    const s = baseState();
    expect(evaluateInterveningIf(s, "it was a creature", "user", { triggeringWasCreature: false })).toBe(false);
  });
});

/**
 * ⛔ THE TYPE DIRECTIVE WAS RESIDUE, AND IT LOOKED LIKE A KEYWORD DEPENDENCY (2026-08-04).
 *
 * "It's an enchantment." trails the dies sentence, and the trigger-sentence strip stops at the first period
 * after "…owner's control." — so the directive survived as apparent residue and failed isKeywordOnly.
 *
 * It is NOT residue. triggers.js rewrites the whole effect to the `[self-return-bf:enchantment]` marker
 * precisely BECAUSE the type change is part of the modeled effect, and says so at the rewrite site: "the
 * 'It's an enchantment' semantics are captured by the marker tag itself (the resolver strips the creature
 * type)". The classifier was double-counting text the atom already owns.
 *
 * ⭐ WHY IT HID FOR SO LONG — the directive only decided the outcome when it was the card's ONLY leftover
 * text, so the bug presented as "this dies-trigger needs a keyword line to be credited", which is absurd on
 * its face and is what made it findable. The corpus split is on a BYTE-IDENTICAL dies sentence:
 *   NATIVE  Enduring Vitality / Curiosity / Innocence — each led by Vigilance / Flash / Lifelink
 *   PARKED  Enduring Tenacity / Courage              — no keyword line
 * `detectTriggers` and `triggerRoutesNatively` BOTH already returned native=true on the parked pair: a
 * classifier-vs-router divergence, not a missing mechanic.
 *
 * ⛔ NOT THE SAME CAUSE, deliberately left parked (gate 20 — three causes, not one):
 *   · Enduring Friendship — its CAST trigger routes false, a genuinely different blocker;
 *   · Old-Growth Troll / Harold and Bob — return as an AURA ("It's an Aura enchantment with enchant …"),
 *     a different shape the marker does not cover.
 *
 * Mutation-checked (2026-08-04, grep-verified applied AND verified on the case under test — classifyCard was
 * called on the bare dies-line fixture under the mutant and returned body-only before the suite was read):
 * the strip removed -> both flip pins red.
 */
describe("the trailing type directive is part of the modeled effect, not residue", () => {
  const mk = (oracle, name = "Test Glimmer") => ({ id: "tg", name,
    type: "Enchantment Creature — Snake Glimmer", power: 2, toughness: 2, mana: "{2}{B}",
    oracle: oracle.replace(/~/g, name) });
  const DIES = "When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment.";

  it("⭐ the dies line ALONE is now credited — no keyword line required", () => {
    expect(classifyCard(mk(DIES))).toBe("native-trigger");
  });

  it("the real carriers flip", () => {
    expect(classifyCard(mk("Whenever you gain life, target opponent loses that much life.\n" + DIES, "Enduring Tenacity"))).toBe("native-trigger");
    expect(classifyCard(mk("Whenever another creature you control enters, it gets +2/+0 and gains haste until end of turn.\n" + DIES, "Enduring Courage"))).toBe("native-trigger");
  });

  it("the cards that ALREADY worked are unchanged — they were only ever rescued by their keyword line", () => {
    expect(classifyCard(mk("Vigilance\n" + DIES, "Enduring Vitality"))).toBe("native-trigger");
    expect(classifyCard(mk("Flash\n" + DIES, "Enduring Curiosity"))).toBe("native-trigger");
  });

  it("⛔ an UNMODELED sibling line still parks the card (the strip adds no permission)", () => {
    expect(classifyCard(mk("Interpret the omens however you like.\n" + DIES))).toBe("body-only");
  });

  it("⛔ the AURA-returning variant is a different shape and stays parked", () => {
    expect(classifyCard(mk("When ~ dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant creature.", "Troll"))).toBe("body-only");
  });
});
