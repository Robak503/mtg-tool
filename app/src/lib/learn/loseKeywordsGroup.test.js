/**
 * loseKeywordsGroup.test.js — "(Creatures|Permanents) your opponents control lose <keywords> until end of
 * turn" (CR 611.2). Shadowspear (#325, on the shelf) · Bonds of Mortality.
 *
 * ⭐ THE EXACT MIRROR OF grant-keywords-group, AND IT REUSES THAT RUNTIME WHOLESALE. `removeKeyword` has
 * always been a layer-6 op the keyword readers honour (layers.keywordSet does `set.delete(kw)` for it, and
 * the "loses menace" note there records that removal wins last). Nothing new is enforced — the only thing
 * missing was a parser that could ever emit it over an opponent-scoped group. The clause parser also reuses
 * the GRANT side's own keyword allowlist, so the two sides cannot drift: a keyword the grant side refuses to
 * hand out is one this side refuses to take away.
 *
 * ⭐⚠️ THE SPLITTER ATE IT FIRST, FOR THE SECOND TIME THIS RUN. The clause parser returned the correct atom
 * when called directly and `parseEffectClause` returned NOTHING — because splitClauses shattered
 * "…lose hexproof and indestructible until end of turn" on its internal " and ". Tamiyo's Safekeeping failed
 * identically, for the identical reason: a keep-whole rule anchored to one subject while its sibling subject
 * fell through. **When a new parser's clause contains an internal " and ", check the splitter FIRST** — it
 * runs upstream of everything, and the direct-vs-driver comparison is the one-minute way to see it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Permanents your opponents control lose hexproof and indestructible until end of turn.";
const SHADOWSPEAR = { name: "Shadowspear", type: "Legendary Artifact — Equipment", mana: "{1}",
  oracle: "Equipped creature gets +1/+1 and has trample and lifelink.\n{1}: Permanents your opponents control lose hexproof and indestructible until end of turn.\nEquip {2}" };
const BONDS = { name: "Bonds of Mortality", type: "Enchantment", mana: "{1}{G}",
  oracle: "When Bonds of Mortality enters, draw a card.\n{G}: Creatures your opponents control lose hexproof and indestructible until end of turn." };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const foe = createPermanent({ id: "foe", card: { id: "c-f", name: "Foe", type: "Creature — Beast", power: "4", toughness: "4", oracle: "Hexproof\nIndestructible" }, controller: "ai" });
  const foeArt = createPermanent({ id: "foeArt", card: { id: "c-fa", name: "Foe Relic", type: "Artifact", oracle: "Indestructible" }, controller: "ai" });
  const mine = createPermanent({ id: "mine", card: { id: "c-m", name: "Mine", type: "Creature — Bear", power: "2", toughness: "2", oracle: "Hexproof\nIndestructible" }, controller: "user" });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [mine] }, ai: { ...s0.players.ai, battlefield: [foe, foeArt] } } };
}
const atomOf = (line = LINE) => parseEffectClause(line, "Artifact").atoms[0];
const fire = (s, atom) => ATOM_RESOLVERS["lose-keywords-group"](s, atom, { controller: "user", targets: [], cardName: "Shadowspear" });

describe("⭐ the SPLITTER had to keep the sentence whole (the second instance of this trap)", () => {
  it("the keyword list is not a clause boundary", () => {
    expect(splitClauses(LINE)).toEqual([LINE.replace(/\.$/, "")]);
  });

  it("and the clause now survives the driver", () => {
    expect(parseEffectClause(LINE, "Artifact").atoms).toEqual([
      { op: "lose-keywords-group", subject: "permanent", loseKeywords: ["Hexproof", "Indestructible"] },
    ]);
  });

  it("the creature-scoped subject parses too (Bonds of Mortality)", () => {
    expect(parseEffectClause("Creatures your opponents control lose hexproof and indestructible until end of turn.", "Enchantment").atoms[0])
      .toMatchObject({ op: "lose-keywords-group", subject: "creature" });
  });

  it("⛔ an un-allowlisted word parks the clause (the grant side's allowlist is shared, so they can't drift)", () => {
    expect(parseEffectClause("Permanents your opponents control lose widgetry until end of turn.", "Artifact").atoms).toEqual([]);
  });
});

describe("⭐ RUNTIME — the keywords really come off the opponents' board, and only theirs", () => {
  it("the opponent's creature loses BOTH keywords", () => {
    const before = board();
    expect(permanentHasKeyword(before, "foe", "hexproof")).toBe(true);
    expect(permanentHasKeyword(before, "foe", "indestructible")).toBe(true);
    const after = fire(before, atomOf());
    expect(permanentHasKeyword(after, "foe", "hexproof")).toBe(false);
    expect(permanentHasKeyword(after, "foe", "indestructible")).toBe(false);
  });

  it("⛔ CREED — MY OWN creature keeps both ('your opponents control', never your own board)", () => {
    const after = fire(board(), atomOf());
    expect(permanentHasKeyword(after, "mine", "hexproof")).toBe(true);
    expect(permanentHasKeyword(after, "mine", "indestructible")).toBe(true);
  });

  it("the PERMANENT subject reaches a non-creature; the CREATURE subject does not", () => {
    const permScoped = fire(board(), atomOf());
    expect(permanentHasKeyword(permScoped, "foeArt", "indestructible")).toBe(false);
    const creatureScoped = fire(board(), atomOf("Creatures your opponents control lose hexproof and indestructible until end of turn."));
    expect(permanentHasKeyword(creatureScoped, "foeArt", "indestructible")).toBe(true);  // an artifact is not a creature
    expect(permanentHasKeyword(creatureScoped, "foe", "indestructible")).toBe(false);
  });
});

describe("coverage", () => {
  it("Shadowspear and Bonds of Mortality flip", () => {
    expect(classifyCard(SHADOWSPEAR)).toBe("native-equipment");
    expect(classifyCard(BONDS)).toBe("native-mixed");
  });

  it("⛔ Shay Cormac stays parked — its four-keyword line includes 'protection', which the allowlist refuses", () => {
    expect(classifyCard({ name: "Shay Cormac", type: "Legendary Creature — Human Assassin", power: "3", toughness: "3", mana: "{2}{B}",
      oracle: "{1}: Permanents your opponents control lose hexproof, indestructible, protection, shroud, and ward until end of turn." }))
      .not.toMatch(/^native/);
  });
});
