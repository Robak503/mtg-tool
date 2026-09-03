/**
 * snapcasterFlashback.test.js — CORPUS ④-G (2026-09-03 night): SNAPCASTER MAGE — "When this creature enters, target
 * instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its
 * mana cost." A `grant-flashback` atom stamps the targeted graveyard card (`flashbackGrant: { cost, turn }`); the
 * graveyard-cast lane honours the stamp only on the turn it was granted, prices the cast at the card's printed
 * mana cost, and the existing flashback cast path exiles the card after it resolves. Real oracle fixture (bundled
 * Scryfall snapshot, read in-session 2026-09-03). The spells are synthetic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SNAP = { id: "c-snap", name: "Snapcaster Mage", type: "Creature — Human Wizard", mana: "{1}{U}", mana_cost: "{1}{U}", cmc: 2, power: 2, toughness: 1, keywords: ["Flash"], oracle: "Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)" };
const GROWTH = { id: "g-growth", name: "Synthetic Growth", type: "Sorcery", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "You gain 2 life." };
const BEAR = { id: "g-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [], graveyard: [GROWTH, BEAR], library: [], battlefield: [createPermanent({ id: "snap", card: SNAP, controller: "user" })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
    },
  };
}
const flashbackCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.flashbackCast);

describe("the parse + the tier", () => {
  it("the two-sentence grant collapses to one own-graveyard targeted atom; Snapcaster is native", () => {
    const p = parseEffectClause("target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "grant-flashback", targetType: "graveyardCard", cardFilter: "instant|sorcery" }]);
    expect(classifyCard(SNAP)).toMatch(/^native/);
  });
});

describe("runtime", () => {
  it("⭐ the ETB targets the sorcery (never the creature); the grant makes it flashback-castable THIS turn at its mana cost; the cast exiles it", () => {
    const s = board();
    expect(flashbackCasts(s).length).toBe(0);
    const snap = s.players.user.battlefield.find((p) => p.id === "snap");
    const flushed = flushTriggers(checkEnterTriggers(s, snap));
    const trig = flushed.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect((trig.targets || []).map((t) => t.id)).toEqual(["g-growth"]);
    const granted = resolveTopOfStack(flushed);
    const gyGrowth = granted.players.user.graveyard.find((c) => c.id === "g-growth");
    expect(gyGrowth.flashbackGrant).toEqual({ cost: "{G}", turn: 5 });
    expect(granted.players.user.graveyard.find((c) => c.id === "g-bear").flashbackGrant).toBeUndefined();
    const offers = flashbackCasts(granted);
    expect(offers.length).toBe(1);
    expect(offers[0].cardId).toBe("g-growth");
    const cast = resolveTopOfStack(dispatchAction(granted, offers[0]));
    expect(cast.players.user.life).toBe(22);
    expect(cast.players.user.exile.some((c) => c.id === "g-growth")).toBe(true);
    expect(cast.players.user.graveyard.some((c) => c.id === "g-growth")).toBe(false);
  });
  it("the SPELL form (the card named Flashback) grants through the cast path too", () => {
    const FLASHBACK = { id: "h-fb", name: "Flashback", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [], oracle: "Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)" };
    const s0 = board();
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [FLASHBACK], battlefield: [], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 1, C: 0 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-fb" && (a.targets || []).some((t) => t.id === "g-growth"));
    expect(act).toBeTruthy();
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-fb" && (a.targets || []).some((t) => t.id === "g-bear"))).toBe(false);
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.graveyard.find((c) => c.id === "g-growth").flashbackGrant).toEqual({ cost: "{G}", turn: 5 });
    expect(flashbackCasts(out).map((a) => a.cardId)).toEqual(["g-growth"]);
    expect(classifyCard(FLASHBACK)).toBe("native-spell");
  });
  it("the grant expires: on a later turn the card is not offered", () => {
    const s = board();
    const snap = s.players.user.battlefield.find((p) => p.id === "snap");
    const granted = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, snap)));
    expect(flashbackCasts({ ...granted, turn: 6 }).length).toBe(0);
  });
});
