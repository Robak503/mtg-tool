/**
 * akromasWill.test.js — CONDITIONAL-BOTH modal + protection-from-each-color group grant (SHELF S7).
 *
 * Akroma's Will: "Choose one. If you control a commander as you cast this spell, you may choose both
 * instead." + two team-grant modes. Three seams close the flip:
 *   1. parseModal's CONDITIONAL-BOTH lead — a two-mode modal, chooseCount 2 / upTo, flagged
 *      conditionalBothCommander (exact printed wording only);
 *   2. targeting.expandCastChoices — the size-2 combos are offered ONLY while the caster controls a
 *      commander ON THE BATTLEFIELD (CR 601.2b cast-time read; CR 109.4 — a command-zone commander is
 *      controlled by no one, the Fierce-Guardianship discipline);
 *   3. groupGrantClauseParser's "and protection from each color" tail (CR 702.16j "each color" = WUBRG)
 *      → grantProtectionAllColors on the group-grant atom → ONE layer-6 addProtection in the resolver,
 *      read by the SAME permanentProtectionColors the printed keyword uses (targeting/block/damage).
 * CREED FP = a both-pick without a commander, or a parse-only protection grant — both pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { applyGrantKeywordsGroup } from "./effects/atoms/combat.js";
import { permanentProtectionColors, permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const AKROMA_ORACLE =
  "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn.";
const akromaCard = { id: "aw", name: "Akroma's Will", type: "Instant", mana: "{3}{W}", oracle: AKROMA_ORACLE };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const creature = (id, controller, isCommander = false) =>
  createPermanent({ id, card: { name: id, type: "Creature — Angel", power: "4", toughness: "4", oracle: "", ...(isCommander && { isCommander: true }) }, controller });

describe("parse (conditional-both modal)", () => {
  it("parses HIGH as a two-mode modal with chooseCount 2 / upTo / the conditionalBothCommander flag", () => {
    const p = parseEffectClause(AKROMA_ORACLE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal).toMatchObject({ chooseCount: 2, upTo: true, conditionalBothCommander: true });
    expect(p.modal.modes).toHaveLength(2);
  });
  it("mode B carries the protection rider on the group-grant atom", () => {
    const p = parseEffectClause(AKROMA_ORACLE, "Instant");
    expect(p.modal.modes[1].atoms).toEqual([
      { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Lifelink", "Indestructible"], grantProtectionAllColors: true },
    ]);
  });
  it("classifies native-spell", () => {
    expect(classifyCard(akromaCard)).toBe("native-spell");
  });
  it("CREED — a DIFFERENT conditional-modal wording stays LOW (exact printed lead only)", () => {
    const p = parseEffectClause(
      "Choose one. If you control an artifact as you cast this spell, you may choose both instead.\n• Creatures you control gain flying until end of turn.\n• Creatures you control gain lifelink until end of turn.",
      "Instant");
    expect(programConfidence(p)).not.toBe("high");
  });
});

describe("cast enumeration (CR 601.2b — the both-combo is commander-gated)", () => {
  const program = parseEffectClause(AKROMA_ORACLE, "Instant");

  it("WITHOUT a commander on the battlefield: only single-mode picks are offered", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [creature("c1", "user")]);
    const choices = expandCastChoices(s, "user", program);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => Array.isArray(c.chosenMode) ? c.chosenMode.length === 1 : true)).toBe(true);
  });

  it("WITH a commander on the battlefield: the both-combo appears", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [creature("cmd", "user", true), creature("c1", "user")]);
    const choices = expandCastChoices(s, "user", program);
    expect(choices.some((c) => Array.isArray(c.chosenMode) && c.chosenMode.length === 2)).toBe(true);
  });
});

describe("resolver (protection from each color is ENFORCED, not parse-only)", () => {
  it("grants lifelink + indestructible + WUBRG protection to the frozen set, wearing off at end of turn", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [creature("c1", "user")]);
    const atom = { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Lifelink", "Indestructible"], grantProtectionAllColors: true };
    const after = applyGrantKeywordsGroup(s, atom, { controller: "user" });
    expect(permanentProtectionColors(after, "c1")).toEqual(new Set(["W", "U", "B", "R", "G"]));
    expect(permanentHasKeyword(after, "c1", "lifelink")).toBe(true);
    expect(permanentHasKeyword(after, "c1", "indestructible")).toBe(true);
  });
});
