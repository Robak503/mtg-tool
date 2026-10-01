/**
 * CABAL RITUAL — the play-weighted program, P·33 (EDHREC #453).
 *   "Add {B}{B}{B}.
 *    Threshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard."
 *
 * The instead-upgrade family (templateMatchers.matchInsteadAmountUpgrade) gains an ADD-MANA form and the Threshold word: two
 * add-mana atoms gated on the same condition, the base one negated, so exactly one adds (CR 608.2 — read as the spell resolves).
 * The count is YOUR graveyard's, every card; the Ritual itself is on the stack as it resolves, so it never counts toward its own
 * threshold.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); each cast run for real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CABAL = { name: "Cabal Ritual", type: "Instant", mana: "{1}{B}", cmc: 2, keywords: ["Threshold"], oracle: "Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };

const gy = (n, who) => Array.from({ length: n }, (_, i) => ({ ...FOREST, id: `${who}-g${i}` }));
function board({ mine = 0, theirs = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, hand: [{ ...CABAL, id: "ritual" }], graveyard: gy(mine, "u"), manaPool: { ...s.players.user.manaPool, B: 1, C: 1 } },
      ai: { ...s.players.ai, graveyard: gy(theirs, "a") } } };
}
const ritual = (s0) => {
  const s = resolveTopOfStack(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "ritual")));
  return { black: s.players.user.manaPool.B, graveyard: s.players.user.graveyard.length };
};

describe("parse + classify", () => {
  it("Cabal Ritual classifies native-spell", () => {
    expect(classifyCard(CABAL)).toBe("native-spell");
  });
  it("seen-to-fail: the ability word must name ITS condition — Threshold over a land count parks (synthetic)", () => {
    const off = { ...CABAL, name: "Cabal Ritual (synthetic)", oracle: "Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if you control seven or more lands." };
    expect(classifyCard(off)).not.toBe("native-spell");
  });
});

describe("Add {B}{B}{B} — or {B}{B}{B}{B}{B} with threshold", () => {
  it("⭐ six cards in your graveyard: three black (the Ritual is on the stack, not in the graveyard, as it resolves); seven: five", () => {
    const row = { six: ritual(board({ mine: 6 })), seven: ritual(board({ mine: 7 })) };
    console.log("  WITNESS cabalRitual", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ six: { black: 3, graveyard: 7 }, seven: { black: 5, graveyard: 8 } });
  });

  it("only YOUR graveyard counts: an opponent's nine cards don't give you threshold", () => {
    expect(ritual(board({ mine: 0, theirs: 9 })).black).toBe(3);
  });
});

describe("the Threshold word, one family over — Thermal Blast (the burn upgrade)", () => {
  const BLAST = { name: "Thermal Blast", type: "Instant", mana: "{4}{R}", cmc: 5, keywords: ["Threshold"], oracle: "Thermal Blast deals 3 damage to target creature.\nThreshold — Thermal Blast deals 5 damage instead if there are seven or more cards in your graveyard." };
  const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], oracle: "" };
  const blast = (mine) => {
    const b = board({ mine });
    const s0 = { ...b, players: { ...b.players,
      user: { ...b.players.user, hand: [{ ...BLAST, id: "blast" }], manaPool: { ...b.players.user.manaPool, R: 1, C: 4 } },
      ai: { ...b.players.ai, battlefield: [createPermanent({ id: "wurm", card: { id: "c-wurm", ...WURM }, controller: "ai", summoningSick: false })] } } };
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "blast" && a.targets?.[0]?.id === "wurm");
    return resolveTopOfStack(dispatchAction(s0, act)).players.ai.battlefield.some((p) => p.id === "wurm");
  };
  it("six cards: 3 damage, the 4-toughness Craw Wurm lives; seven: 5 damage, it dies", () => {
    expect(classifyCard(BLAST)).toBe("native-spell");
    expect({ six: blast(6), seven: blast(7) }).toEqual({ six: true, seven: false });
  });
});
