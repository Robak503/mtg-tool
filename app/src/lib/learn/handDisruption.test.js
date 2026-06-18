/**
 * handDisruption.test.js — δ-1 targeted hand disruption (Duress / Thoughtseize / Inquisition /
 * Coercion / Despise / Divest / Harsh Scrutiny). The discard-from-revealed-hand effect spans three
 * sentences ("…reveals their hand. You choose a <filter> card from it. That player discards that
 * card."), collapsed to one `discard-chosen` atom whose target is a `handCard` — a card in an
 * OPPONENT'S hand, enumerated + chosen at cast time like the `graveyardCard` recursion target. Rider
 * sentences (Thoughtseize "You lose 2 life", Harsh Scrutiny "Scry 1") compose via the multi-atom gate.
 *
 * Discipline pins: the exact-template ALLOWLIST (an exile/optional/no-reveal/unmodeled-filter variant
 * stays low → Arbiter), front-face filtering (CR 712.4a), opponents'-hands-only enumeration, the live
 * cast-path resolution (the discard moves the chosen card to its owner's graveyard), the 608.2b
 * stale-target no-op, the trigger→Arbiter gate, and the AI "strip their best card" heuristic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const DURESS = { id: "dur", name: "Duress", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." };
const THOUGHTSEIZE = { id: "ts", name: "Thoughtseize", type: SORCERY, mana: "{B}", oracle: "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life." };
const INQUISITION = { id: "inq", name: "Inquisition of Kozilek", type: SORCERY, mana: "{B}", oracle: "Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card." };
const COERCION = { id: "coe", name: "Coercion", type: SORCERY, mana: "{2}{B}", oracle: "Target opponent reveals their hand. You choose a card from it. That player discards that card." };
const DESPISE = { id: "des", name: "Despise", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a creature or planeswalker card from it. That player discards that card." };
const HARSH = { id: "hs", name: "Harsh Scrutiny", type: SORCERY, mana: "{B}", oracle: "Target opponent reveals their hand. You choose a creature card from it. That player discards that card. Scry 1." };

const sorc = (id, name, cmc = 1) => ({ id, name, type: "Sorcery", mana: "{1}", cmc, oracle: "Draw a card." });
const crea = (id, name, cmc = 2) => ({ id, name, type: "Creature — Bear", mana: "{2}", cmc, power: 2, toughness: 2, oracle: "" });
const land = (id, name) => ({ id, name, type: "Land", cmc: 0, oracle: "" });
const pw = (id, name) => ({ id, name, type: "Legendary Planeswalker — Test", cmc: 4, oracle: "" });
const arti = (id, name) => ({ id, name, type: "Artifact", cmc: 2, oracle: "" });

const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

function state({ userHand = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, C: 6, B: 2 } },
      ai: { ...s.players.ai, hand: aiHand },
    },
  };
}

describe("parser — the Duress family is HIGH with the right handFilter; unmodeled variants → Arbiter", () => {
  it("the core templates parse to a single discard-chosen handCard atom with the right filter", () => {
    expect(parseEffectProgram(DURESS).atoms).toEqual([{ op: "discard-chosen", targetType: "handCard", handFilter: { exclude: ["Creature", "Land"] } }]);
    expect(parseEffectProgram(COERCION).atoms).toEqual([{ op: "discard-chosen", targetType: "handCard", handFilter: {} }]);
    expect(parseEffectProgram(DESPISE).atoms).toEqual([{ op: "discard-chosen", targetType: "handCard", handFilter: { include: ["Creature", "Planeswalker"] } }]);
    expect(parseEffectProgram(INQUISITION).atoms).toEqual([{ op: "discard-chosen", targetType: "handCard", handFilter: { exclude: ["Land"], maxCmc: 3 } }]);
  });
  it("riders compose via the multi-atom gate (Thoughtseize +lose-life, Harsh Scrutiny +scry)", () => {
    const ts = parseEffectProgram(THOUGHTSEIZE);
    expect(programConfidence(ts)).toBe("high");
    expect(ts.atoms.map((a) => a.op)).toEqual(["discard-chosen", "lose-life"]);
    const hs = parseEffectProgram(HARSH);
    expect(programConfidence(hs)).toBe("high");
    expect(hs.atoms.map((a) => a.op)).toEqual(["discard-chosen", "scry"]);
  });
  it("a variant outside the exact template / filter allowlist stays low → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    // exile instead of discard + a graveyard option (Agonizing Remorse)
    low("Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life.");
    // optional "you may choose" + an else-branch (Reckoner Shakedown)
    low("Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card.");
    // no reveal/choose — the player discards their OWN choice (Mind Rot, a different mechanic)
    low("Target player discards two cards.");
    // an unmodeled card filter
    low("Target opponent reveals their hand. You choose a nonblack card from it. That player discards that card.");
    // an unmodeled rider after a modeled template (the discard would fire while the rider drops — forbidden)
    low("Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. Create a 2/2 zombie.");
  });
});

describe("coverage — the family is native-spell; unmodeled variants are arbiter-spell", () => {
  it("Duress / Thoughtseize / Inquisition / Despise / Harsh Scrutiny classify native-spell", () => {
    for (const c of [DURESS, THOUGHTSEIZE, INQUISITION, COERCION, DESPISE, HARSH]) expect(classifyCard(c)).toBe("native-spell");
  });
  it("the exile / optional / no-reveal variants are arbiter-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Agonizing Remorse", oracle: "Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life." })).toBe("arbiter-spell");
    expect(classifyCard({ type: SORCERY, name: "Mind Rot", oracle: "Target player discards two cards." })).toBe("arbiter-spell");
  });
});

describe("enumeration — OPPONENTS' hands only, front-face filtered (CR 712.4a)", () => {
  it("Duress offers only the opponent's noncreature, nonland cards — never the caster's own hand", () => {
    const s = state({
      userHand: [DURESS, sorc("u-sorc", "Mine")],                                   // the caster's own cards must never be offered
      aiHand: [sorc("a-sorc", "Divination"), crea("a-bear", "Bear"), land("a-land", "Swamp"), arti("a-rock", "Rock")],
    });
    const t = enumerateTargets(s, "user", parseEffectProgram(DURESS).atoms[0]);
    expect(t.map((x) => x.id).sort()).toEqual(["a-rock", "a-sorc"]);                 // sorcery + artifact; creature + land excluded
    expect(t.every((x) => x.controller === "ai")).toBe(true);                        // opponents only
    expect(t.some((x) => x.id === "u-sorc")).toBe(false);                            // never the caster's own hand
  });
  it("Inquisition's mana-value clause filters to mv ≤ 3", () => {
    const s = state({ userHand: [INQUISITION], aiHand: [sorc("a-cheap", "Cheap", 2), sorc("a-big", "Big", 6), land("a-land", "Swamp")] });
    const t = enumerateTargets(s, "user", parseEffectProgram(INQUISITION).atoms[0]);
    expect(t.map((x) => x.id)).toEqual(["a-cheap"]);                                 // mv 6 + land excluded
  });
  it("Despise's include filter offers only creature / planeswalker cards", () => {
    const s = state({ userHand: [DESPISE], aiHand: [crea("a-bear", "Bear"), pw("a-pw", "Walker"), sorc("a-sorc", "Sorc")] });
    const t = enumerateTargets(s, "user", parseEffectProgram(DESPISE).atoms[0]);
    expect(t.map((x) => x.id).sort()).toEqual(["a-bear", "a-pw"]);                   // the sorcery is excluded
  });
  it("CR 712.4a — a card's FRONT face decides the filter (an Instant // Land MDFC is noncreature, nonland)", () => {
    const mdfc = { id: "a-mdfc", name: "Malakir Rebirth", type: "Instant // Land", cmc: 2, oracle: "" };
    const s = state({ userHand: [DURESS], aiHand: [mdfc] });
    const t = enumerateTargets(s, "user", parseEffectProgram(DURESS).atoms[0]);
    expect(t.map((x) => x.id)).toEqual(["a-mdfc"]);                                  // front is Instant → a valid Duress target
  });
});

describe("resolution — the chosen card moves from the owner's hand to their graveyard", () => {
  it("Duress: one cast action per strippable card; resolving discards the chosen one", () => {
    const s = state({ userHand: [DURESS], aiHand: [sorc("a-sorc", "Divination"), crea("a-bear", "Bear"), land("a-land", "Swamp")] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "dur");
    expect(casts.map((a) => a.targets?.[0]?.id)).toEqual(["a-sorc"]);                // only the noncreature, nonland card
    expect(casts[0].needsTargets).toBe(true);
    const after = resolveAll(dispatchAction(s, casts[0]));
    expect(after.players.ai.hand.map((c) => c.id).sort()).toEqual(["a-bear", "a-land"]);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a-sorc"]);
  });
  it("Thoughtseize multi-atom: the discard AND the 2-life payment both resolve", () => {
    const s = state({ userHand: [THOUGHTSEIZE], aiHand: [sorc("a-sorc", "Divination"), land("a-land", "Swamp")] });
    const before = s.players.user.life;
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "ts" && a.targets?.[0]?.id === "a-sorc");
    const after = resolveAll(dispatchAction(s, cast));
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a-sorc"]);
    expect(after.players.user.life).toBe(before - 2);
  });
  it("no matching card in any opponent's hand → the spell is uncastable (safe false-negative, never a no-op cast)", () => {
    const s = state({ userHand: [DURESS], aiHand: [crea("a-bear", "Bear"), land("a-land", "Swamp")] }); // no noncreature, nonland card
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "dur");
    expect(casts).toHaveLength(0);
  });
  it("CR 608.2b — a chosen card that already left the hand is a clean no-op (no throw)", () => {
    const s = state({ userHand: [DURESS], aiHand: [] });
    const stale = { ...s, stack: [{ id: "stk", kind: "spell", source: DURESS, controller: "user",
      payload: { resolver: "effect-program", params: { program: parseEffectProgram(DURESS), controller: "user", targets: [{ type: "handCard", id: "gone", controller: "ai", name: "Ghost" }] } } }] };
    expect(() => resolveAll(stale)).not.toThrow();
  });
});

describe("trigger gate — a discard-chosen TRIGGER routes to the Arbiter (no enemy-aware flush chooser yet)", () => {
  it("a permanent whose attack trigger strips a hand is NOT native (the cast path is the modeled scope)", () => {
    const trig = { type: "Creature — Rogue", name: "Thief", oracle: "Whenever this creature attacks, target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." };
    expect(classifyCard(trig)).not.toBe("native-trigger");
  });
});

describe("AI — casts hand disruption, stripping the opponent's highest-value card", () => {
  it("the AI picks the highest-mana-value strippable card and never targets its own hand", () => {
    const s0 = state({ userHand: [crea("u-bear", "Bear"), sorc("u-cheap", "Cheap", 1), sorc("u-bomb", "Bomb", 6)], aiHand: [] });
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai",
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [DURESS], manaPool: { ...s0.players.ai.manaPool, C: 6, B: 2 } } } };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).toBe("cast-spell");
    expect(picked?.cardId).toBe("dur");
    expect(picked?.targets?.[0]?.id).toBe("u-bomb");                                 // highest cmc; the creature is excluded
    expect(picked?.targets?.[0]?.controller).toBe("user");                          // never its own hand
  });
});
