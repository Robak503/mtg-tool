/**
 * EXTRA-LAND-DROPS (CR 305.2 / 505.5b) — a static "You may play [an additional|N additional] land[s] on
 * each of your turns" RAISES the controller's per-turn land-play allowance (Exploration → +1; Azusa → +2).
 *
 * Build: parseStaticAbilities emits a { extraLandDrops: N } MARKER (no layer effect); legalChoices.
 * landDropAllowance sums extraLandDropsOf across the player's battlefield + command zone (allowance =
 * 1 + Σ). Both gates — the action gate (actionsPlayLand) and the dispatcher gate (applyPlayLand) — read the
 * SAME helper (the CREED two-sites invariant). Classifies native-static.
 *
 * CREED all-or-nothing: only a clean SELF-ONLY extra-land static flips on its OWN (Exploration/Azusa →
 * native-static). The SYMMETRIC form ("each player may play an additional land …" — Rites of Flourishing,
 * Ghirapur Orrery), "any number of lands" (Fastbond), the one-shot sorcery ("up to three additional lands this
 * turn" — Summer Bloom), and any card carrying a second UNmodeled clause (Oracle of Mul Daya's top-of-library,
 * Dryad's type static, Wayward's ascend) stay body-only — a fabricated extra land play / mis-count is a
 * forbidden false positive. Aesi (extra-land static + a MODELED landfall optional-draw) now composes to
 * native-mixed via the LANDFALL-composite fix — see landfall.test.js.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseStaticAbilities, extraLandDropsOf } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, landDropAllowance } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, resetTurnCounters } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const EXPLORATION = { id: "c-exp", name: "Exploration", type: "Enchantment", mana: "{G}", oracle: "You may play an additional land on each of your turns." };
const AZUSA = { id: "c-azu", name: "Azusa, Lost but Seeking", type: "Legendary Creature — Human Monk", power: 1, toughness: 2, mana: "{2}{G}", oracle: "You may play two additional lands on each of your turns." };
// Non-native (residue / symmetric / one-shot / unmodeled grammar):
const AESI = { id: "c-aesi", name: "Aesi, Tyrant of Gyre Strait", type: "Legendary Creature — Serpent", power: 5, toughness: 5, mana: "{4}{G}{U}", oracle: "You may play an additional land on each of your turns.\nLandfall — Whenever a land you control enters, you may draw a card." };
const ORACLE_MUL_DAYA = { id: "c-omd", name: "Oracle of Mul Daya", type: "Creature — Elf Shaman", power: 2, toughness: 2, mana: "{3}{G}", oracle: "You may play an additional land on each of your turns.\nPlay with the top card of your library revealed.\nYou may play lands from the top of your library." };
const DRYAD = { id: "c-dryad", name: "Dryad of the Ilysian Grove", type: "Enchantment Creature — Nymph Dryad", power: 2, toughness: 4, mana: "{2}{G}", oracle: "You may play an additional land on each of your turns.\nLands you control are every basic land type in addition to their other types." };
const WAYWARD = { id: "c-way", name: "Wayward Swordtooth", type: "Creature — Dinosaur", power: 5, toughness: 5, mana: "{2}{G}", oracle: "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nYou may play an additional land on each of your turns.\nThis creature can't attack or block unless you have the city's blessing." };
const RITES = { id: "c-rites", name: "Rites of Flourishing", type: "Enchantment", mana: "{2}{G}", oracle: "At the beginning of each player's draw step, that player draws an additional card.\nEach player may play an additional land on each of their turns." };
const GHIRAPUR = { id: "c-gho", name: "Ghirapur Orrery", type: "Artifact", mana: "{4}", oracle: "Each player may play an additional land on each of their turns.\nAt the beginning of each player's upkeep, if that player has no cards in hand, that player draws three cards." };
const FASTBOND = { id: "c-fb", name: "Fastbond", type: "Enchantment", mana: "{G}", oracle: "You may play any number of lands on each of your turns.\nWhenever you play a land, if it wasn't the first land you played this turn, this enchantment deals 1 damage to you." };
const SUMMER_BLOOM = { id: "c-sb", name: "Summer Bloom", type: "Sorcery", mana: "{1}{G}", oracle: "You may play up to three additional lands this turn." };

const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function boardState({ user = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...EMPTY_POOL } } },
  };
}

// ─── Parser: clean shapes emit { extraLandDrops }, every other form drops ────────
describe("EXTRA-LAND-DROPS — parser", () => {
  it("Exploration → +1, Azusa → +2", () => {
    expect(parseStaticAbilities(EXPLORATION)).toEqual([{ extraLandDrops: 1 }]);
    expect(parseStaticAbilities(AZUSA)).toEqual([{ extraLandDrops: 2 }]);
    expect(extraLandDropsOf(EXPLORATION)).toBe(1);
    expect(extraLandDropsOf(AZUSA)).toBe(2);
  });
  it("rejects symmetric / one-shot / 'any number' forms (no extra-land marker)", () => {
    // SYMMETRIC ("each player … each of their turns") — grants opponents too; unmodeled scope → safe FN.
    expect(parseStaticAbilities(RITES).some((d) => d.extraLandDrops)).toBe(false);
    expect(parseStaticAbilities(GHIRAPUR).some((d) => d.extraLandDrops)).toBe(false);
    // "any number of lands" (Fastbond) — not a fixed +N.
    expect(parseStaticAbilities(FASTBOND).some((d) => d.extraLandDrops)).toBe(false);
    // one-shot sorcery "this turn" (Summer Bloom) — not a permanent static.
    expect(parseStaticAbilities(SUMMER_BLOOM).some((d) => d.extraLandDrops)).toBe(false);
    expect(extraLandDropsOf(FASTBOND)).toBe(0);
  });
});

// ─── Coverage: clean → native-static; riders → body-only ─────────────────────────
describe("EXTRA-LAND-DROPS — classifyCard", () => {
  it("Exploration + Azusa classify native-static", () => {
    expect(classifyCard(EXPLORATION)).toBe("native-static");
    expect(classifyCard(AZUSA)).toBe("native-static");
  });
  it("Aesi (extra-land static + a MODELED landfall optional-draw) is native-mixed — both clauses model", () => {
    // The landfall payoff ("you may draw a card") routes natively (α2 optional → draw), so the composite
    // classifier (permanentFullyCovered) now combines the extra-land static + the landfall trigger. This was
    // body-only ONLY because permanentFullyCovered didn't strip the "Landfall —" ability-word label before its
    // trigger-sentence strip (the LANDFALL-composite fix); the static was always modeled. See landfall.test.js.
    expect(classifyCard(AESI)).toBe("native-mixed");
  });
  it("rider / symmetric / one-shot cards stay non-native (CREED all-or-nothing)", () => {
    expect(classifyCard(ORACLE_MUL_DAYA)).toBe("body-only"); // top-of-library riders
    expect(classifyCard(DRYAD)).toBe("body-only");           // type-changing static rider
    expect(classifyCard(WAYWARD)).toBe("body-only");         // ascend + can't-attack rider
    // SYMMETRIC ("each player …") + their own riders → never native.
    expect(classifyCard(RITES)).toBe("body-only");
    expect(classifyCard(GHIRAPUR)).toBe("body-only");
    expect(classifyCard(FASTBOND)).toBe("body-only");
    expect(classifyCard(SUMMER_BLOOM)).toBe("arbiter-spell"); // a sorcery, not a permanent
  });
});

// ─── Runtime: the allowance + the gate ───────────────────────────────────────────
describe("EXTRA-LAND-DROPS — runtime allowance", () => {
  it("base allowance is 1 with no static", () => {
    const s = boardState({ hand: [FOREST("h1"), FOREST("h2")] });
    expect(landDropAllowance(s, "user")).toBe(1);
  });

  it("Azusa out → allowance 3; the player may play 3 lands in one turn, then it resets next turn", () => {
    const azusa = createPermanent({ id: "perm-azu", card: AZUSA, controller: "user", summoningSick: false });
    let s = boardState({ user: [azusa], hand: [FOREST("h1"), FOREST("h2"), FOREST("h3"), FOREST("h4")] });
    expect(landDropAllowance(s, "user")).toBe(3); // 1 + 2

    // Play land #1
    let plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBe(4); // all four forest in hand are offered
    s = dispatchAction(s, plays.find((a) => a.cardId === "h1"));
    expect(s.players.user.landsPlayedThisTurn).toBe(1);

    // Play land #2
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBeGreaterThan(0); // still allowed (1 < 3)
    s = dispatchAction(s, plays.find((a) => a.cardId === "h2"));
    expect(s.players.user.landsPlayedThisTurn).toBe(2);

    // Play land #3 (the third land — only legal because Azusa grants +2)
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBeGreaterThan(0); // 2 < 3 → still allowed
    s = dispatchAction(s, plays.find((a) => a.cardId === "h3"));
    expect(s.players.user.landsPlayedThisTurn).toBe(3);

    // Land #4 is NOT allowed — the allowance (3) is spent.
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBe(0);
    // The dispatcher also rejects a 4th play (the gate, not just the action list).
    expect(() => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h4", name: "Forest" }))
      .toThrow(/Already played a land this turn/);

    // Next turn: resetTurnCounters zeroes landsPlayedThisTurn → the allowance is fresh (3 again).
    s = resetTurnCounters(s, { playerId: "user" });
    expect(s.players.user.landsPlayedThisTurn).toBe(0);
    expect(landDropAllowance(s, "user")).toBe(3);
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBe(1); // only h4 left in hand, and it's playable again
  });

  it("Exploration out → allowance 2 (1 + 1); a second land is legal, a third is not", () => {
    const exp = createPermanent({ id: "perm-exp", card: EXPLORATION, controller: "user", summoningSick: false });
    let s = boardState({ user: [exp], hand: [FOREST("h1"), FOREST("h2"), FOREST("h3")] });
    expect(landDropAllowance(s, "user")).toBe(2);
    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h1", name: "Forest" });
    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h2", name: "Forest" });
    expect(s.players.user.landsPlayedThisTurn).toBe(2);
    expect(() => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h3", name: "Forest" }))
      .toThrow(/Already played a land this turn/);
  });

  it("two statics stack (Exploration + Azusa → allowance 4)", () => {
    const exp = createPermanent({ id: "perm-exp", card: EXPLORATION, controller: "user", summoningSick: false });
    const azusa = createPermanent({ id: "perm-azu", card: AZUSA, controller: "user", summoningSick: false });
    const s = boardState({ user: [exp, azusa] });
    expect(landDropAllowance(s, "user")).toBe(4); // 1 + 1 + 2
  });
});
