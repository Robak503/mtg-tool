/**
 * TURTLE LAIR — "{T}: Add one mana of any color. Spend this mana only to cast a Ninja or Turtle spell." QUARTET Phase 4 step 3
 * (restricted-spend mana — the printed forms per carrier class), 2026-09-06. SHELF-85's Halfshell row sized it SUBSYSTEM-L; the
 * subsystem's core has been live since 08-15 — only the VOCABULARY refused the subtype words.
 *
 * parseSpendRestriction admits any CR creature type (the closed vocabulary) beside its curated word list; the planner's
 * spendRestrictionAllows already matches type-line words, so the parse and the payment agree by construction.
 *
 * Mutation-checked: see the run ledger (docs-q4a).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaSources, canAfford, spendRestrictionAllows } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LAIR = { id: "c-lair", name: "Turtle Lair", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Ninja or Turtle spell.\n{3}, {T}: Target Ninja or Turtle can't be blocked this turn." };
const HIVE = { id: "c-hive", name: "Sliver Hive", type: "Land", mana: "", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Sliver spell.\n{5}, {T}: Create a 1/1 colorless Sliver creature token. Activate only if you control a Sliver." };
const NINJA = { id: "c-ninja", name: "Ninja of the Deep Hours", type: "Creature — Human Ninja", mana: "{U}", power: 1, toughness: 1, keywords: [], oracle: "" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{U}", power: 2, toughness: 2, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "lair", card: LAIR, controller: "user" })], hand: [NINJA, BEAR], library: [] } } };
}

describe("the classifier", () => {
  it("Turtle Lair reads land (every line modeled); Sliver Hive's mana line parses too", () => {
    const row = { lair: classifyCard(LAIR), hive: classifyCard(HIVE) };
    console.log("  WITNESS turtleLair", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.lair).toBe("land");
  });
});

describe("RUNTIME — the restricted record pays a Ninja and refuses a Bear", () => {
  it("the Lair's any-colour record carries the Ninja/Turtle restriction; it pays {U} for a Ninja and never for a Bear", () => {
    const s = board();
    const records = manaSources(s, "user").filter((m) => m.permanentId === "lair");
    const restricted = records.find((m) => m.restriction);
    const pool = s.players.user.manaPool;
    const row = { records: records.length, castTypes: restricted?.restriction?.castTypes ?? null,
      ninjaAllowed: spendRestrictionAllows(restricted?.restriction, NINJA), bearAllowed: spendRestrictionAllows(restricted?.restriction, BEAR),
      ninjaPays: canAfford(pool, [restricted], parseManaCost("{U}"), { castCard: NINJA }), bearPays: canAfford(pool, [restricted], parseManaCost("{U}"), { castCard: BEAR }) };
    console.log("  WITNESS turtleLairRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.records).toBe(2);
    expect(row.castTypes).toEqual(["ninja", "turtle"]);
    expect(row.ninjaAllowed).toBe(true);
    expect(row.bearAllowed).toBe(false);
    expect(row.ninjaPays).toBe(true);
    expect(row.bearPays).toBe(false);
  });
});
