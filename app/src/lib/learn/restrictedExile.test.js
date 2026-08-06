/**
 * restrictedExile.test.js — BLITZ SE-1: "Exile target <restricted> creature" where the restriction is one the
 * DESTROY twin already models. exile shared only the bare + power forms (the PX-1 slice); this slice delegates
 * the SAME creature-target restriction grammar the destroy path folds (parseCreatureTargetRestrictions —
 * re-anchored to accept an "exile target …" clause) so exile inherits combat state (attacking / blocking /
 * either), tapped / untapped, toughness, color/type negation, with|without flying, and curated subtypes with
 * ZERO drift from destroy. The restriction rides as the SAME { restrictions } array creatureSatisfiesRestrictions
 * enforces at ENUMERATION (targeting.atomTargetSpec threads it for every creature-target op; the exile resolver
 * just moves the enumerated-legal target). Corpus-probed 2026-07-17: Not on My Watch / Expel / Excoriate /
 * Pillar of Light / Second Thoughts / Devouring Light / Treva's Charm / Order // Chaos / Suspension Field flip;
 * LOST=0. Real oracle fixtures (bundled Scryfall, verified via cardIndex.lookupCard 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NOT_ON_MY_WATCH = { id: "c-nomw", name: "Not on My Watch", type: "Instant", mana: "{2}{W}", oracle: "Exile target attacking creature." };
const EXPEL = { id: "c-expel", name: "Expel", type: "Instant", mana: "{2}{U}", oracle: "Exile target tapped creature." };
const PILLAR_OF_LIGHT = { id: "c-pol", name: "Pillar of Light", type: "Instant", mana: "{3}{W}", oracle: "Exile target creature with toughness 4 or greater." };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}
const bear = (id, name) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });

describe("SE-1 parser — the destroy twin's restriction grammar now folds into exile", () => {
  it("attacking / tapped / toughness ride as the SAME restriction shapes the destroy path emits", () => {
    expect(parseEffectProgram(NOT_ON_MY_WATCH).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "combat", value: "attacking" }] },
    ]);
    expect(parseEffectProgram(EXPEL).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "tapped", value: true }] },
    ]);
    expect(parseEffectProgram(PILLAR_OF_LIGHT).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "toughness", op: ">=", value: 4 }] },
    ]);
    // "attacking or blocking" → combat:"either" (Devouring Light's convoke-free body).
    expect(parseEffectProgram({ type: "Instant", oracle: "Exile target attacking or blocking creature." }).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "combat", value: "either" }] },
    ]);
    // color / type negation + without-flying prove the shared grammar carries the whole modeled set.
    expect(parseEffectProgram({ type: "Instant", oracle: "Exile target nonblack creature." }).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "colorNeg", color: "B" }] },
    ]);
    expect(parseEffectProgram({ type: "Instant", oracle: "Exile target creature without flying." }).atoms).toEqual([
      { op: "exile", targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] },
    ]);
  });

  it("FN guards: an unmodeled qualifier / union / graveyard clause / trailing rider stays LOW (whole-clause anchor)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Instant", oracle }))).toBe("low");
    low("Exile target creature or Spacecraft.");                           // union residue — clean=false
    // ⚠️ GRADUATED 2026-08-06 (GX-2) — the graveyard clause is modeled now (gyExileFiltered.test.js). The
    // point this row made for SE-1 still stands and is kept with a still-unmodeled zone clause:
    low("Exile target creature card from your library.");                  // a LIBRARY clause — not modeled
    low("Exile target creature you control, then return it to the battlefield.");  // flicker — the return clause is unmodeled
    low("Exile target creature with the greatest power among creatures.");  // superlative — unmodeled
  });
});

describe("SE-1 classify — every corpus flip is a whole-card native; the destroy twin is a regression pin", () => {
  it("single-clause exiles flip native-spell", () => {
    expect(classifyCard(NOT_ON_MY_WATCH)).toBe("native-spell");
    expect(classifyCard(EXPEL)).toBe("native-spell");
    expect(classifyCard(PILLAR_OF_LIGHT)).toBe("native-spell");
    expect(classifyCard({ id: "c-exc", name: "Excoriate", type: "Sorcery", mana: "{4}{W}", oracle: "Exile target tapped creature." })).toBe("native-spell");
  });
  it("compound + convoke + modal wrappers flip (each mode/clause was already modeled; the exile mode was the sole blocker)", () => {
    expect(classifyCard({ id: "c-st", name: "Second Thoughts", type: "Instant", mana: "{3}{U}",
      oracle: "Exile target attacking creature.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ id: "c-dl", name: "Devouring Light", type: "Instant", mana: "{2}{W}",
      oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nExile target attacking or blocking creature." })).toBe("native-spell");
    expect(classifyCard({ id: "c-tc", name: "Treva's Charm", type: "Instant", mana: "{2}{W}{U}",
      oracle: "Choose one —\n• Destroy target enchantment.\n• Exile target attacking creature.\n• Draw a card, then discard a card." })).toBe("native-spell");
  });
  it("detain frame folds the toughness restriction (Suspension Field's ETB exile-until-leaves)", () => {
    expect(classifyCard({ id: "c-sf", name: "Suspension Field", type: "Enchantment", mana: "{1}{W}",
      oracle: "When this enchantment enters, you may exile target creature with toughness 3 or greater until this enchantment leaves the battlefield. (That creature returns under its owner's control.)" })).toBe("native-trigger");
  });
  it("regression: the DESTROY twin (which already folded these restrictions) is untouched", () => {
    expect(classifyCard({ name: "Smite", type: "Instant", mana: "{1}{W}", oracle: "Destroy target blocked creature." })).not.toBe("native-spell"); // "blocked" ≠ blocking — unmodeled, stays Arbiter
    expect(classifyCard({ name: "Reprisal", type: "Instant", mana: "{1}{W}", oracle: "Destroy target creature with power 4 or greater. It can't be regenerated." })).toBe("native-spell");
  });
});

describe("SE-1 enumeration — the combat restriction is enforced at cast-time (CR 508 / 601.2c)", () => {
  it("only the ATTACKING creature is offered to 'exile target attacking creature'", () => {
    let s = mainState({ phase: "combat", step: "declare-blockers" });
    const attacker = bear("p-atk", "Attacking Bear");
    const bystander = bear("p-by", "Bystander Bear");
    s = withPlayerBits(s, "ai", { battlefield: [attacker, bystander] });
    s = { ...s, combat: { attackers: [{ permanentId: "p-atk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const atom = parseEffectProgram(NOT_ON_MY_WATCH).atoms[0];
    expect(enumerateTargets(s, "user", atom).map((t) => t.id)).toEqual(["p-atk"]);
  });
  it("only the TAPPED creature is offered to 'exile target tapped creature'", () => {
    let s = mainState();
    const tapped = { ...bear("p-tap", "Tapped Bear"), tapped: true };
    const untapped = bear("p-untap", "Untapped Bear");
    s = withPlayerBits(s, "ai", { battlefield: [tapped, untapped] });
    const atom = parseEffectProgram(EXPEL).atoms[0];
    expect(enumerateTargets(s, "user", atom).map((t) => t.id)).toEqual(["p-tap"]);
  });
});

describe("SE-1 runtime — the restricted exile removes the creature to EXILE (not the graveyard)", () => {
  it("Not on My Watch exiles the attacking bear", () => {
    let s = mainState({ phase: "combat", step: "declare-blockers" });
    s = withPlayerBits(s, "user", { hand: [NOT_ON_MY_WATCH], manaPool: { ...s.players.user.manaPool, C: 2, W: 1 } });
    const attacker = bear("p-atk", "Attacking Bear");
    s = withPlayerBits(s, "ai", { battlefield: [attacker] });
    s = { ...s, combat: { attackers: [{ permanentId: "p-atk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-nomw" && a.targets?.[0]?.id === "p-atk");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.battlefield.some((p) => p.id === "p-atk")).toBe(false);
    expect(s.players.ai.exile.some((c) => c.name === "Attacking Bear")).toBe(true);
    expect(s.players.ai.graveyard.some((c) => c.name === "Attacking Bear")).toBe(false);
  });
});
