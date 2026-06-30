/**
 * warpOverloadCoverage.test.js — two alternative-cast levers, both vacuous for the NORMAL cast (THE CREED,
 * the Plot/Spectacle precedent):
 *
 *   WARP (CR 702.176, permanent-only) — "Warp {cost}" casts the card cheaper from hand, exiles it at the next
 *   end step, and lets you recast it later. It changes only how/when the card is cast, never the permanent's
 *   printed abilities; the runtime hard-casts at full cost and the body resolves identically (the "exile at end
 *   step" rider applies ONLY to a warp cast, which the engine never offers). classifyCard strips the Warp LINE
 *   in its permanent preprocessing (parseWarpCost-gated) so the bare body reaches the trigger/static/mixed gates.
 *
 *   OVERLOAD (CR 702.96, spell-only) — "Overload {cost}" casts the spell for the overload cost and changes every
 *   "target" to "each". The PRINTED single-target mode is the text a normal cast resolves; the engine hard-casts
 *   at the normal cost with normal targeting and never offers the overload mode, so the line is vacuous for the
 *   normal cast. It joins the parser's CAST_KEYWORD_LINE family, so the spell path parses the printed body.
 *
 * CREED anti-FP pins below prove the strips can NEVER whitewash an unmodeled body, an alternative-cost spell
 * whose printed effect is unmodeled, or a (line-leading-but-not-a-cost) "warp"/"overload" reference.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { tokenMultiplier } from "./replacementEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type, mana) => ({ name, oracle, type, mana, keywords: [] });
const WARP = (cost) => `\nWarp ${cost} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)`;
const OVERLOAD = (cost) => `\nOverload ${cost} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")`;

// ─── OVERLOAD: the printed single-target spell parses native once the overload line is stripped ───
describe("overload-strip — the printed single-target mode flips native-spell", () => {
  it("removal / damage / bounce overload spells classify native-spell on their printed body", () => {
    expect(classifyCard(C("Damn", "Destroy target creature. A creature destroyed this way can't be regenerated." + OVERLOAD("{2}{W}{W}"), "Sorcery", "{B}{B}"))).toBe("native-spell");
    expect(classifyCard(C("Vandalblast", "Destroy target artifact you don't control." + OVERLOAD("{4}{R}"), "Sorcery", "{R}"))).toBe("native-spell");
    expect(classifyCard(C("Cyclonic Rift", "Return target nonland permanent you don't control to its owner's hand." + OVERLOAD("{6}{U}"), "Instant", "{1}{U}"))).toBe("native-spell");
    expect(classifyCard(C("Electrickery", "Electrickery deals 1 damage to target creature you don't control." + OVERLOAD("{1}{R}"), "Instant", "{R}"))).toBe("native-spell");
    expect(classifyCard(C("Mizzium Mortars", "Mizzium Mortars deals 4 damage to target creature you don't control." + OVERLOAD("{3}{R}{R}{R}"), "Sorcery", "{1}{R}"))).toBe("native-spell");
  });

  it("pump / discard / tap overload spells classify native-spell too", () => {
    expect(classifyCard(C("Stirring Address", "Target creature you control gets +2/+2 until end of turn." + OVERLOAD("{5}{W}"), "Instant", "{1}{W}"))).toBe("native-spell");
    expect(classifyCard(C("Mind Rake", "Target player discards two cards." + OVERLOAD("{1}{B}"), "Sorcery", "{2}{B}"))).toBe("native-spell");
    expect(classifyCard(C("Blustersquall", "Tap target creature you don't control." + OVERLOAD("{3}{U}"), "Instant", "{U}"))).toBe("native-spell");
  });

  it("RUNTIME: Damn casts at its printed {B}{B} cost (single target) and destroys the creature on resolution", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const damn = { id: "card-damn", name: "Damn", type: "Sorcery", mana: "{B}{B}", oracle: "Destroy target creature. A creature destroyed this way can't be regenerated." + OVERLOAD("{2}{W}{W}") };
    const enemy = createPermanent({ id: "perm-enemy", card: { id: "c-en", name: "Their Goblin", type: "Creature — Goblin", power: 2, toughness: 2, oracle: "" }, controller: "ai", summoningSick: false });
    let s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [damn], manaPool: { ...s.players.user.manaPool, B: 2 } }, ai: { ...s.players.ai, battlefield: [enemy] } } };

    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === "Damn");
    expect(acts).toHaveLength(1);                          // ONLY the printed single-target cast — overload mode never offered
    expect(acts[0].targets[0].id).toBe("perm-enemy");
    const afterResolve = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(afterResolve.players.ai.battlefield.find((p) => p.id === "perm-enemy")).toBeUndefined(); // genuinely destroyed
  });
});

// ─── WARP: the permanent body parses native once the warp line is stripped ───
describe("warp-strip — the permanent body flips native once the warp line is stripped", () => {
  it("a vanilla / keyword-only warp body classifies native-body", () => {
    expect(classifyCard(C("Bygone Colossus", WARP("{3}").trim(), "Artifact Creature — Robot Giant", "{9}"))).toBe("native-body");
    expect(classifyCard(C("Red Tiger Mechan", "Haste" + WARP("{1}{R}"), "Artifact Creature — Robot Cat", "{3}{R}"))).toBe("native-body");
  });

  it("a warp body whose only non-keyword text is a routing ETB/landfall/combat trigger classifies native-trigger", () => {
    expect(classifyCard(C("Knight Luminary", "When this creature enters, create a 1/1 white Human Soldier creature token." + WARP("{1}{W}"), "Creature — Human Knight", "{3}{W}"))).toBe("native-trigger");
    expect(classifyCard(C("Germinating Wurm", "When this creature enters, you gain 2 life." + WARP("{1}{G}"), "Creature — Plant Wurm", "{4}{G}"))).toBe("native-trigger");
    expect(classifyCard(C("Eusocial Engineering", "Landfall — Whenever a land you control enters, create a 2/2 colorless Robot artifact creature token." + WARP("{1}{G}"), "Enchantment", "{3}{G}{G}"))).toBe("native-trigger");
  });

  it("a warp body whose only non-keyword text is a runtime-modeled token doubler classifies native-static", () => {
    expect(classifyCard(C("Exalted Sunborn", "Flying, lifelink\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead." + WARP("{1}{W}"), "Creature — Angel Wizard", "{3}{W}{W}"))).toBe("native-static");
  });

  it("RUNTIME: a warp-bearing token doubler on the battlefield doubles minted tokens (tokenMultiplier = 2)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const card = { id: "c-sun", name: "Exalted Sunborn", type: "Creature — Angel Wizard", power: 3, toughness: 4, oracle: "Flying, lifelink\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead." + WARP("{1}{W}") };
    const perm = createPermanent({ id: "perm-sun", card, controller: "user", summoningSick: false });
    const s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [perm] } } };
    expect(tokenMultiplier(s, "user")).toBe(2);
  });
});

// ─── CREED: the strips can NEVER whitewash an unmodeled body (FP-FORBIDDEN) ───
describe("warp/overload CREED — an unmodeled body stays on the Arbiter even after the alt-cast line is stripped", () => {
  it("a WARP body with an unmodeled static stays body-only (the warp strip reveals it, never hides it)", () => {
    // "Players can't gain life." is an unmodeled static — the warp strip exposes it; it must NOT flip native.
    expect(classifyCard(C("Test Warp Static", "Players can't gain life." + WARP("{1}{B}"), "Creature — Horror", "{4}{B}"))).toBe("body-only");
  });

  it("an OVERLOAD spell whose printed single-target effect is unmodeled stays arbiter-spell", () => {
    // "Mill until they reveal a creature" is unmodeled — stripping the overload line can't fabricate it.
    expect(classifyCard(C("Test Overload Bad", "Target player mills until they reveal a creature card." + OVERLOAD("{3}{U}"), "Sorcery", "{1}{U}"))).toBe("arbiter-spell");
  });

  it("a 'warp' TRIGGER is NOT a warp cost line — parseWarpCost gates it, so the unmodeled body stays body-only", () => {
    expect(classifyCard(C("Test Warp Trigger", "When you cast this spell for its warp cost, draw a card." + WARP("{1}{U}"), "Creature — Whale", "{4}{U}"))).toBe("body-only");
  });

  it("an 'overload' word in prose (no leading cost line) is never stripped — the unmodeled body stays non-native", () => {
    expect(classifyCard(C("Test Overload Prose", "Whenever you overload a spell, draw a card.", "Enchantment", "{2}{U}"))).toBe("body-only");
  });
});
