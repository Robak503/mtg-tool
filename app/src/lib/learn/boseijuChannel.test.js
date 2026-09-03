/**
 * boseijuChannel.test.js — SG-16 (2026-09-03): Boseiju, Who Endures — "Channel — {1}{G}, Discard this card:
 * Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their
 * library for a land card with a basic land type, put it onto the battlefield, then shuffle. This ability
 * costs {1} less to activate for each legendary creature you control." (the Squirrel Girl deck). Three
 * pieces on existing lanes: the destroy lead gains the artifact/enchantment/nonbasic-land union (opponent
 * scoped), the rider-removal span accepts "That player" beside "Its controller", and the ramp rider learns
 * the "land card with a basic land type" filter (any land carrying a basic land type — a typed nonbasic
 * qualifies, a typeless nonbasic does not). The legendary-count cost reduction was already modeled (LANDS-5).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BOSEIJU = { id: "h-bos", name: "Boseiju, Who Endures", type: "Legendary Land", mana: "", keywords: [], oracle: "{T}: Add {G}.\nChannel — {1}{G}, Discard this card: Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle. This ability costs {1} less to activate for each legendary creature you control." };
const EFFECT = "Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle.";
const LEGEND = { id: "c-leg", name: "Toski, Bearer of Secrets", type: "Legendary Creature — Squirrel", mana: "{3}{G}", power: 1, toughness: 1, oracle: "" };
const POOL = { id: "c-pool", name: "Breeding Pool", type: "Land — Forest Island", mana: "", oracle: "({T}: Add {G} or {U}.)" };
const ROCK = { id: "c-rock", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const FOREST = { id: "lib-forest", name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "" };
const TOMB = { id: "lib-tomb", name: "Overgrown Tomb", type: "Land — Swamp Forest", mana: "", oracle: "" };
const TOWER = { id: "lib-tower", name: "Command Tower", type: "Land", mana: "", oracle: "" };
const BEAR = { id: "lib-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

function board({ legend = true } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [BOSEIJU], graveyard: [], battlefield: legend ? [createPermanent({ id: "leg", card: LEGEND, controller: "user", summoningSick: false })] : [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } },
      ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "pool", card: POOL, controller: "ai", summoningSick: false }), createPermanent({ id: "rock", card: ROCK, controller: "ai", summoningSick: false }), createPermanent({ id: "bf", card: { ...FOREST, id: "c-bf" }, controller: "ai", summoningSick: false })], library: [BEAR, FOREST, TOMB, TOWER], graveyard: [] },
    },
  };
}
const channelOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "discard-ability" && a.cardId === "h-bos");

describe("the parse", () => {
  it("collapses the destroy + the opponent's typed-basic search into one rider-bearing destroy", () => {
    const p = parseEffectClause(EFFECT, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "destroy", targetType: "artifactEnchantmentOrNonbasicLand", restrictions: [{ kind: "controller", who: "opponent" }], controllerRider: { kind: "rampBasic", entersTapped: false, typedBasic: true } });
  });

  it("CREED — a rider without the basic-type qualifier is NOT the typed rider", () => {
    const p = parseEffectClause(EFFECT.replace("a land card with a basic land type", "a land card"), "Instant");
    expect(p.atoms.some((a) => a.controllerRider?.typedBasic)).toBe(false);
  });
});

describe("runtime", () => {
  it("⭐ with a legendary creature the channel costs {G}: destroy the opponent's Breeding Pool; they may fetch a land WITH a basic type (a typed nonbasic counts, a typeless one does not)", () => {
    const s = board();
    const offers = channelOffers(s);
    expect(offers.length).toBeGreaterThan(0);
    const onPool = offers.find((a) => (a.targets || []).some((t) => t.id === "pool"));
    expect(onPool).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, onPool));
    expect(out.players.ai.battlefield.some((p) => p.id === "pool")).toBe(false);
    expect(out.players.ai.graveyard.some((c) => c.id === "c-pool")).toBe(true);
    expect(out.players.user.graveyard.some((c) => c.id === "h-bos")).toBe(true);
    expect(out.pendingChoice?.kind).toBe("tutor-search");
    expect(out.pendingChoice.controller).toBe("ai");
    const ids = (out.pendingChoice.candidates || []).map((c) => c.id).sort();
    expect(ids).toEqual(["lib-forest", "lib-tomb"]);
    const fetched = resolveTutorChoice(out, "lib-tomb");
    expect(fetched.players.ai.battlefield.some((p) => p.card?.id === "lib-tomb")).toBe(true);
    expect(fetched.players.ai.library.some((c) => c.id === "lib-tomb")).toBe(false);
  });

  it("the artifact is a legal target too; the opponent's BASIC Forest and the user's own permanents never are", () => {
    const s = board();
    const offers = channelOffers(s);
    expect(offers.some((a) => (a.targets || []).some((t) => t.id === "rock"))).toBe(true);
    expect(offers.some((a) => (a.targets || []).some((t) => t.id === "bf"))).toBe(false);
    expect(offers.some((a) => (a.targets || []).some((t) => t.id === "leg"))).toBe(false);
  });

  it("⛔ without a legendary creature the full {1}{G} is due — one {G} in the pool is not enough", () => {
    expect(channelOffers(board({ legend: false }))).toHaveLength(0);
  });
});

describe("classification", () => {
  it("Boseiju is a fully covered land; the untyped-search variant parks", () => {
    expect(classifyCard(BOSEIJU)).toBe("land");
    expect(classifyCard({ ...BOSEIJU, oracle: BOSEIJU.oracle.replace("a land card with a basic land type", "a land card") })).not.toBe("land");
  });
});
