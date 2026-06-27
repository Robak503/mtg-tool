/**
 * eachPlayerDraw.test.js — EACH-PLAYER slice 1: the draw ACTOR extends beyond the controller.
 *
 * The engine modeled a controller-only draw ("Draw N cards"). This adds two actors:
 *   - "Each player draws N cards" (Vision Skeins) — EVERY player draws, non-targeted (a trigger can
 *     auto-resolve it).
 *   - "Target player draws N cards" (Opportunity / Ancestral Recall / Inspiration) — the CHOSEN player
 *     draws; a player target, so the cast path enumerates a target and the AI HOLDS it (it can't yet
 *     score whether to gift cards), exactly like the other unscored program spells.
 *
 * Pins: the parser shapes + who/targetType, coverage = native-spell, all-players enumeration for the
 * target form, the resolution (each player / the chosen player draws N from their OWN library), the
 * AI-hold on the targeted gift, the each-player trigger routing natively vs. the targeted one → Arbiter,
 * and the anchored allowlist (riders / variable counts stay low → Arbiter).
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
const VISION_SKEINS = { id: "vs", name: "Vision Skeins", type: SORCERY, mana: "{1}{U}", cmc: 2, oracle: "Each player draws two cards." };
const OPPORTUNITY = { id: "opp", name: "Opportunity", type: "Instant", mana: "{5}{U}{U}", cmc: 7, oracle: "Target player draws four cards." };
const ANCESTRAL = { id: "anc", name: "Ancestral Recall", type: "Instant", mana: "{U}", cmc: 1, oracle: "Target player draws three cards." };

// A throwaway library card with a unique id so we can track which player drew which cards.
const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-l${i}`, name: `${prefix}Card${i}`, type: SORCERY, mana: "{1}", cmc: 1, oracle: "Draw a card." }));

function state({ userHand = [], userLib = lib("u", 10), aiLib = lib("a", 10), extraSeats = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...s.players,
    user: { ...s.players.user, hand: userHand, library: userLib, manaPool: { ...s.players.user.manaPool, C: 12, U: 5 } },
    ai: { ...s.players.ai, library: aiLib },
  };
  if (extraSeats) for (const [id, l] of Object.entries(extraSeats)) players[id] = { ...s.players.ai, library: l };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}

function castAndResolve(s, cardId, targetId = null) {
  const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === cardId);
  const cast = targetId ? casts.find((a) => a.targets?.[0]?.id === targetId) : casts[0];
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser — each/target player draw is HIGH; the controller form is unchanged", () => {
  it("parses to one who-aware draw atom", () => {
    expect(parseEffectProgram(VISION_SKEINS).atoms).toEqual([{ op: "draw", amount: 2, who: "eachPlayer", targetType: null }]);
    expect(parseEffectProgram(OPPORTUNITY).atoms).toEqual([{ op: "draw", amount: 4, who: "target", targetType: "player" }]);
    expect(parseEffectProgram(ANCESTRAL).atoms).toEqual([{ op: "draw", amount: 3, who: "target", targetType: "player" }]);
  });
  it("riders / variable counts stay low → Arbiter (anchored allowlist)", () => {
    const low = (o) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle: o }))).toBe("low");
    low("Target player draws three cards, loses 3 life, and gets three poison counters."); // Caress — poison + comma-chain (the bare "draws N and loses M life" is now native: DRAW-LOSE-SUBJECT)
    low("Target player draws X cards.");                    // Stroke of Genius
    low("Each player draws X cards.");                      // Prosperity
    low("Each player draws a card for each creature card in their graveyard."); // Nature's Resurgence
  });
});

describe("coverage — the family classifies native-spell", () => {
  it("Vision Skeins / Opportunity / Ancestral Recall / Inspiration are native-spell", () => {
    for (const c of [VISION_SKEINS, OPPORTUNITY, ANCESTRAL, { type: "Instant", name: "Inspiration", oracle: "Target player draws two cards." }]) {
      expect(classifyCard(c)).toBe("native-spell");
    }
  });
});

describe("enumeration — a target-player draw offers EVERY player (caster may draw itself); each-player draw is non-targeted", () => {
  it("target draw enumerates all players; each-player draw enumerates nothing", () => {
    const s = state({ userHand: [OPPORTUNITY], extraSeats: { ai2: lib("b", 10) } });
    const tgts = enumerateTargets(s, "user", parseEffectProgram(OPPORTUNITY).atoms[0]).map((t) => t.id).sort();
    expect(tgts).toEqual(["ai", "ai2", "user"]); // includes the caster — Ancestral/Opportunity may target anyone
    expect(enumerateTargets(s, "user", parseEffectProgram(VISION_SKEINS).atoms[0])).toEqual([]);
  });
});

describe("resolution — the right player(s) draw N from their own library", () => {
  it("Each player draws two: every player's hand grows by 2, from their OWN library", () => {
    const s = state({ userHand: [VISION_SKEINS], extraSeats: { ai2: lib("b", 10) } });
    const before = { user: 1, ai: 0, ai2: 0 }; // user holds Vision Skeins
    const after = castAndResolve(s, "vs");
    expect(after.players.user.hand.length).toBe(before.user - 1 + 2); // -1 cast, +2 drawn
    expect(after.players.ai.hand.length).toBe(before.ai + 2);
    expect(after.players.ai2.hand.length).toBe(before.ai2 + 2);
    // each drew from its OWN library (top-of-library ids)
    expect(after.players.ai.hand.map((c) => c.id)).toEqual(["a-l0", "a-l1"]);
    expect(after.players.ai2.hand.map((c) => c.id)).toEqual(["b-l0", "b-l1"]);
    expect(after.players.user.library.length).toBe(8);
  });
  it("Target player draws three: ONLY the chosen opponent draws", () => {
    const s = state({ userHand: [ANCESTRAL] });
    const after = castAndResolve(s, "anc", "ai");
    expect(after.players.ai.hand.map((c) => c.id)).toEqual(["a-l0", "a-l1", "a-l2"]);
    expect(after.players.user.hand.length).toBe(0); // user cast Ancestral, drew nothing
    expect(after.players.user.library.length).toBe(10); // untouched
  });
  it("Target player draws — the caster can target ITSELF (the common play)", () => {
    const s = state({ userHand: [ANCESTRAL] });
    const after = castAndResolve(s, "anc", "user");
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["u-l0", "u-l1", "u-l2"]);
    expect(after.players.ai.hand.length).toBe(0);
  });
  it("drawing from a short library is bounded (no throw, draws what's left)", () => {
    const s = state({ userHand: [OPPORTUNITY], aiLib: lib("a", 2) });
    const after = castAndResolve(s, "opp", "ai");
    expect(after.players.ai.hand.map((c) => c.id)).toEqual(["a-l0", "a-l1"]); // only 2 available of 4
  });
});

describe("trigger gate — each-player draw and target-player draw both route natively", () => {
  it("an ETB 'each player draws a card' and an attack 'target player draws' both native-trigger", () => {
    // symmetric: each player draws — non-targeted, always native
    const symmetric = { type: "Creature — Wizard", name: "Mind Sharer", oracle: "When this creature enters, each player draws a card." };
    // targeted: 'target player draws' — own-side (controller targets themselves), now routes natively (ETB-TARGETED)
    const targeted = { type: "Creature — Rogue", name: "Gifter", oracle: "Whenever this creature attacks, target player draws a card." };
    expect(classifyCard(symmetric)).toBe("native-trigger");
    expect(classifyCard(targeted)).toBe("native-trigger");
  });
  it("a COMPOUND 'attacks or blocks' trigger is NOT native — the dropped 'or blocks' half would mis-fire", () => {
    // Howling Golem: modeling the each-player-draw effect would otherwise expose the compound-combat
    // trigger drop (detected as "attacks" only, firing on attack but not block). The guard routes it
    // to the Arbiter instead. A single-event "Whenever this creature attacks, each player draws" stays
    // native (the effect is non-targeted and the event is faithfully modeled).
    const howlingGolem = { type: "Artifact Creature — Golem", name: "Howling Golem", oracle: "Whenever this creature attacks or blocks, each player draws a card." };
    const attacksOnly = { type: "Creature — Golem", name: "Attack Golem", oracle: "Whenever this creature attacks, each player draws a card." };
    expect(classifyCard(howlingGolem)).not.toBe("native-trigger");
    expect(classifyCard(attacksOnly)).toBe("native-trigger");
  });
  it("an 'attacks ALONE' trigger is NOT native — the dropped sole-attacker restriction (CR 508.4a) would over-fire", () => {
    // Black Panther / Agent 13: "Whenever a creature you control attacks alone, …" fires ONLY when exactly
    // one creature attacks. The engine has no sole-attacker gate, so the non-anchored "a creature you control"
    // match would drop "alone" and fire on every attacker. The guard routes these to body-only (safe FN).
    const blackPanther = { type: "Legendary Creature — Human Warrior Hero", name: "Black Panther, Claws of Bast", oracle: "Lifelink\nWhenever a creature you control attacks alone, put a +1/+1 counter on it." };
    const agent13 = { type: "Legendary Creature — Human", name: "Agent 13, Sharon Carter", oracle: "Whenever a creature you control attacks alone, investigate." };
    const bareAttacks = { type: "Enchantment", name: "Gleam-like", oracle: "Whenever a creature you control attacks, put a +1/+1 counter on it." };
    expect(classifyCard(blackPanther)).not.toBe("native-trigger"); // body-only — restriction can't be modeled
    expect(classifyCard(agent13)).not.toBe("native-trigger");
    expect(classifyCard(bareAttacks)).toBe("native-trigger");      // a bare "attacks" (no qualifier) stays native
  });
});

describe("AI — HOLDS a target-player draw (never gifts cards), can play symmetric each-player draw", () => {
  it("the AI does not cast Opportunity (no draw-target scoring → holds)", () => {
    const s0 = state({});
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai",
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [OPPORTUNITY], manaPool: { ...s0.players.ai.manaPool, C: 12, U: 5 } } } };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell" && picked?.cardId === "opp").toBe(false); // held, not cast at an opponent
  });
});
