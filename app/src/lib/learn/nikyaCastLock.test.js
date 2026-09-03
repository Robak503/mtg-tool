/**
 * nikyaCastLock.test.js — CORPUS ④-E (2026-09-03 night): NIKYA OF THE OLD WAYS — "You can't cast noncreature spells."
 * (also Nullhide Ferox's second line). A static marker read at the cast offer's timing gate: while the caster
 * controls a locker, no non-creature card is offered (an artifact creature still is); opponents are untouched.
 * Nikya's doubler line was already the mana model's global-tap augment. Real oracle fixture (bundled Scryfall
 * snapshot, read in-session 2026-09-03). Spells are synthetic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities, castNoncreatureLockFor } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NIKYA = { id: "c-nik", name: "Nikya of the Old Ways", type: "Legendary Creature — Centaur Druid", mana: "{3}{R}{G}", cmc: 5, power: 5, toughness: 5, keywords: [], oracle: "You can't cast noncreature spells.\nWhenever you tap a land for mana, add one mana of any type that land produced." };
const BEAR = { id: "h-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const GOLEM = { id: "h-golem", name: "Synthetic Golem", type: "Artifact Creature — Golem", mana: "{2}", mana_cost: "{2}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const GROWTH = { id: "h-growth", name: "Synthetic Growth", type: "Sorcery", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "You gain 2 life." };
const ROCK = { id: "h-rock", name: "Synthetic Rock", type: "Artifact", mana: "{1}", mana_cost: "{1}", cmc: 1, keywords: [], oracle: "" };

function board({ nikya = true, seat = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const hand = [BEAR, GOLEM, GROWTH, ROCK];
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 3, C: 3 };
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: seat === "user" ? hand : [], graveyard: [], library: [], battlefield: nikya ? [createPermanent({ id: "nik", card: NIKYA, controller: "user" })] : [], manaPool: pool },
      ai: { ...s0.players.ai, life: 20, hand: seat === "ai" ? hand.map((c) => ({ ...c, id: c.id + "-ai" })) : [], graveyard: [], library: [], battlefield: [], manaPool: { ...pool } },
    },
  };
}
const offered = (s, seat) => new Set(legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell").map((a) => a.cardId));

describe("the marker + the tier", () => {
  it("the static marks the lock; the reader is controller-scoped; Nikya is native", () => {
    expect(parseStaticAbilities(NIKYA).some((d) => d.castNoncreatureLock)).toBe(true);
    expect(castNoncreatureLockFor(board(), "user")).toBe(true);
    expect(castNoncreatureLockFor(board(), "ai")).toBe(false);
    expect(castNoncreatureLockFor(board({ nikya: false }), "user")).toBe(false);
    expect(classifyCard(NIKYA)).toMatch(/^native/);
  });
});

describe("runtime — the cast offer", () => {
  it("⭐ with Nikya out, only creature spells are offered (the artifact creature included); without her, everything is", () => {
    const withNikya = offered(board(), "user");
    expect(withNikya.has("h-bear")).toBe(true);
    expect(withNikya.has("h-golem")).toBe(true);
    expect(withNikya.has("h-growth")).toBe(false);
    expect(withNikya.has("h-rock")).toBe(false);
    const free = offered(board({ nikya: false }), "user");
    expect(free.has("h-growth")).toBe(true);
    expect(free.has("h-rock")).toBe(true);
  });
  it("the opponent is untouched by the user's Nikya", () => {
    const s = board({ seat: "ai" });
    const ai = offered(s, "ai");
    expect(ai.has("h-growth-ai")).toBe(true);
    expect(ai.has("h-rock-ai")).toBe(true);
  });
});
