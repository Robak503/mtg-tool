/**
 * DONATELLO, THE BRAINS — the Took extra-token replacement's Mutagen printing. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "If one or more tokens would be created under your control, those tokens plus a Mutagen token are created instead."
 *
 * Peregrin Took's profile already models this replacement at the mint chokepoint (one extra named token per creation
 * event, never re-entering the replacement — CR 614.5). The reader and its strip predicate anchored on the Food
 * printing's article ("an additional Food"); Donatello prints "a Mutagen", a registered named token. Both anchors admit
 * the two printed articles and the two modelled kinds, nothing else.
 *
 * Mutation-checked: see the run ledger (docs-sk91).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { doublerProfile } from "./replacementEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DONATELLO = { id: "c-don", name: "Donatello, the Brains", type: "Legendary Creature — Mutant Ninja Turtle", mana: "{2}{U}", power: 2, toughness: 3, keywords: [],
  oracle: "If one or more tokens would be created under your control, those tokens plus a Mutagen token are created instead.\nPartner—Character select (You can have two commanders if both have this ability.)" };
const TOOK = { id: "c-took", name: "Peregrin Took", type: "Legendary Creature — Halfling Scout", mana: "{2}{W}", power: 1, toughness: 3, keywords: [],
  oracle: "If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead." };

function board(userPerms, aiPerms = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: userPerms }, ai: { ...s.players.ai, battlefield: aiPerms } } };
}
function makeTreasure(s, controller) {
  const program = parseEffectClause("Create a Treasure token.", "Instant");
  const out = runEffectProgram(s, { source: { name: "Test" }, payload: { params: { program, controller, sourceId: "src", context: {}, targets: [] } } });
  const next = out?.state ?? out;
  return next.players[controller].battlefield.filter((p) => p.card?.token).map((p) => p.card.name).sort();
}

describe("the reader and the classifier", () => {
  it("Donatello's Mutagen printing and Took's Food printing read to the same profile; an unregistered kind is refused; Donatello flips native", () => {
    const row = { don: doublerProfile(DONATELLO)?.tokenExtra, took: doublerProfile(TOOK)?.tokenExtra,
      widget: doublerProfile({ ...DONATELLO, oracle: "If one or more tokens would be created under your control, those tokens plus a Widget token are created instead." })?.tokenExtra ?? null,
      tier: classifyCard(DONATELLO) };
    console.log("  WITNESS donatello", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.don).toEqual({ kind: "mutagen", scope: "you" });
    expect(row.took).toEqual({ kind: "food", scope: "you" });
    expect(row.widget).toBeNull();
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — the mint chokepoint brings the Mutagen along", () => {
  it("a Treasure made under Donatello arrives with a Mutagen; two Donatellos make two; an opponent's token gets none", () => {
    const one = makeTreasure(board([createPermanent({ id: "don", card: DONATELLO, controller: "user" })]), "user");
    const two = makeTreasure(board([createPermanent({ id: "don", card: DONATELLO, controller: "user" }), createPermanent({ id: "don2", card: { ...DONATELLO, id: "c-don2" }, controller: "user" })]), "user");
    const theirs = makeTreasure(board([createPermanent({ id: "don", card: DONATELLO, controller: "user" })]), "ai");
    const row = { one, two, theirs };
    console.log("  WITNESS donatelloRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(one).toEqual(["Mutagen", "Treasure"]);
    expect(two).toEqual(["Mutagen", "Mutagen", "Treasure"]);
    expect(theirs).toEqual(["Treasure"]);
  });
});
