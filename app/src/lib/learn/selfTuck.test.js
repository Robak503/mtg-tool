/**
 * selfTuck.test.js — "Put this <self-noun> on top of its owner's library."
 * Sensei's Divining Top (#226) · Thalakos Mistfolk · Fencer Clique · Wayward Soul · Soaring Hope.
 *
 * ⭐ A MISSING CELL IN A TWO-BY-TWO GRID WHOSE OTHER THREE WERE BUILT. `tuck` already had a chosen-TARGET
 * form ("Put target permanent on top of its owner's library"), and `bounce` already had a SELF form
 * ("Return this artifact to its owner's hand"). The one combination nobody had written was tuck × self — so
 * six cards sat parked on the empty cell, one of them a format staple.
 *
 * ⛔ NO RESOLVER CHANGE, AND THAT WAS CHECKED RATHER THAN HOPED. applyZoneMove already accepts the
 * `{type:"permanent"}` entry selfTargets hands back for a non-creature source — the same path the regenerate
 * slice verified — so the parser arm is the whole build. The runtime test below still proves it end to end:
 * the permanent leaves the battlefield AND lands on top of the library, which a tier assertion cannot see.
 *
 * ⛔ TOP ONLY. Every corpus carrier prints "on top of"; a bottom-of-library self form is not a printed shape,
 * so it is not invented.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TOP = { name: "Sensei's Divining Top", type: "Artifact", mana: "{1}",
  oracle: "{1}: Look at the top three cards of your library, then put them back in any order.\n{T}: Draw a card, then put this artifact on top of its owner's library." };
const LINE = "Put this artifact on top of its owner's library.";

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const top = createPermanent({ id: "top", card: { id: "c-t", name: "Sensei's Divining Top", type: "Artifact", oracle: "" }, controller: "user" });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [top], library: [{ id: "L1", name: "Forest", type: "Basic Land — Forest" }] } } };
}
const atomOf = (line = LINE, type = "Artifact") => parseEffectClause(line, type).atoms[0];

describe("the parser gains the self referent the sibling bounce already had", () => {
  it("emits a self-scoped tuck to the top", () => {
    expect(parseEffectClause(LINE, "Artifact").atoms).toEqual([{ op: "tuck", target: "self", where: "top" }]);
  });

  it("the noun is templating — creature / enchantment / land say it the same way", () => {
    for (const [noun, type] of [["creature", "Creature — Bear"], ["enchantment", "Enchantment"], ["land", "Land"]]) {
      expect(parseEffectClause(`Put this ${noun} on top of its owner's library.`, type).atoms)
        .toEqual([{ op: "tuck", target: "self", where: "top" }]);
    }
  });

  it("the sibling self-BOUNCE is untouched", () => {
    expect(parseEffectClause("Return this artifact to its owner's hand.", "Artifact").atoms).toEqual([{ op: "bounce", target: "self" }]);
  });

  it("⛔ a BOTTOM-of-library self form is not a printed shape and is not invented", () => {
    expect(parseEffectClause("Put this artifact on the bottom of its owner's library.", "Artifact").atoms).toEqual([]);
  });

  it("⛔ an unrelated noun does not match the anchor", () => {
    expect(parseEffectClause("Put this widget on top of its owner's library.", "Artifact").atoms).toEqual([]);
  });
});

describe("⭐ RUNTIME — the permanent really leaves the battlefield and lands on TOP", () => {
  it("off the battlefield, first card of the library", () => {
    const before = board();
    expect(findPermanent(before, "top")).toBeTruthy();
    const after = ATOM_RESOLVERS.tuck(before, atomOf(), { controller: "user", targets: [], sourceId: "top", cardName: "Sensei's Divining Top" });
    expect(findPermanent(after, "top")).toBeFalsy();                              // it left
    expect(after.players.user.library[0].name).toBe("Sensei's Divining Top");     // ⭐ TOP, not bottom
    expect(after.players.user.library).toHaveLength(2);
  });

  it("⛔ CREED — with no source permanent (a spell context) nothing is moved and nothing is fabricated", () => {
    const before = board();
    const after = ATOM_RESOLVERS.tuck(before, atomOf(), { controller: "user", targets: [], cardName: "Probe" });
    expect(findPermanent(after, "top")).toBeTruthy();
    expect(after.players.user.library).toHaveLength(1);
  });
});

describe("coverage", () => {
  it("Sensei's Divining Top flips native-activated", () => {
    expect(classifyCard(TOP)).toBe("native-activated");
  });

  it("⛔ an unmodeled companion line still parks the card", () => {
    expect(classifyCard({ ...TOP, name: "Fake Top",
      oracle: `${TOP.oracle}\nWhenever a player consults an oracle, interpret its riddle however you like.` }))
      .not.toMatch(/^native/);
  });
});
