/**
 * otherSubtypeTeamPump.test.js — "other <Subtype>s you control get ±P/±T [and gain KW] until end of turn".
 *
 * THE PUREST FORM OF THE AXIS THIS RUN HAS FOUND: both halves already existed and only their COMBINATION
 * was missing.
 *   "other creatures you control get …"                              → HIGH   (excludeSource)
 *   "<Subtype>s you control OTHER THAN THIS CREATURE get …"          → HIGH   (subtypeFilter + excludeSource)
 *   "other <Subtype>s you control get …"                             → was LOW
 * The third is the word order the corpus ACTUALLY PRINTS — all four carriers use it, and nothing in the
 * corpus prints the trailing form with a subtype. The engine modelled the spelling no card uses and parked
 * on the one every card uses. CR 113.7 draws no distinction between them; both set the same flag.
 *
 * ⚠️ AND IT TOOK TWO SITES, WHICH IS WHY THE FIRST FIX LOOKED COMPLETE AND WASN'T. The clause parser was
 * only half of it: splitClauses keeps a list of team-pump shapes whose internal " and gain …" must NOT be
 * treated as a clause boundary, and that list named "other creatures" and "<Subtype>s" but not "other
 * <Subtype>s". So Heron's Grace Champion's sentence was TORN at the " and ", severing the grant from its
 * pump, while the same clause parsed perfectly when handed to the parser directly. Fifth whitelist of this
 * run. When a form spans a splitter and a parser, teaching one of them is teaching neither.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (c) => parseEffectClause(c, "Creature")?.atoms?.[0] || null;

describe("parsing — the printed word order, and the ones that already worked", () => {
  it("⭐ 'other <Subtype>s you control' carries BOTH the subtype filter and the exclusion", () => {
    expect(atomOf("other Humans you control get +1/+1 until end of turn"))
      .toMatchObject({ op: "pump", subtypeFilter: "Human", excludeSource: true });
  });

  it("⭐ and it survives the splitter with an ' and gain KW' rider attached", () => {
    // The half that was missing after the parser arm was fixed. A split here severs the grant.
    expect(atomOf("other Humans you control get +1/+1 and gain lifelink until end of turn"))
      .toMatchObject({ op: "pump", subtypeFilter: "Human", excludeSource: true, grantKeywords: ["Lifelink"] });
  });

  it("CONTROL — the two spellings that already worked are unchanged", () => {
    expect(atomOf("Humans you control other than this creature get +1/+1 until end of turn"))
      .toMatchObject({ subtypeFilter: "Human", excludeSource: true });
    expect(atomOf("other creatures you control get +2/+2 and gain trample until end of turn"))
      .toMatchObject({ excludeSource: true, grantKeywords: ["Trample"] });
  });

  it("CONTROL — WITHOUT 'other' there is no exclusion (the source pumps itself)", () => {
    expect(atomOf("Humans you control get +1/+1 until end of turn").excludeSource).toBeFalsy();
  });

  it("⛔ a NON-CURATED subtype still parks — the allowlist is the CREED gate", () => {
    // "Otters" is not in COUNT_SUBTYPE. A generic [a-z]+ subtype would let any word become a type-line
    // filter, which is the target-anything failure this allowlist exists to prevent.
    expect(atomOf("other Otters you control get +1/+1 until end of turn")).toBeNull();
  });
});

describe("⭐ RUNTIME — the source is excluded, non-matching creatures are untouched", () => {
  const mk = (id, type) => createPermanent({ id, controller: "user", card: { id, name: id, type, power: 2, toughness: 2, oracle: "" } });
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [mk("src", "Creature — Human Warrior"), mk("ally", "Creature — Human Soldier"), mk("bear", "Creature — Bear")] },
        ai: { ...s.players.ai, battlefield: [mk("foe", "Creature — Human Knight")] },
      },
    };
  }
  const run = () => resolveAtom(board(), atomOf("other Humans you control get +1/+1 until end of turn"),
    { controller: "user", cardName: "Hamlet Captain", sourceId: "src", targets: [] });
  // Layer-aware, exactly how the board reports P/T — not a scan of the raw effect list, whose shape a
  // resolver change could alter while the pump still worked (or vice versa).
  const pt = (st, id) => [permanentPower(st, id), permanentToughness(st, id)];

  it("⭐ the OTHER Human is pumped to 3/3", () => {
    expect(pt(run(), "ally")).toEqual([3, 3]);
  });

  it("⛔ the SOURCE stays 2/2 — 'other' is enforced, not decorative", () => {
    expect(pt(run(), "src")).toEqual([2, 2]);
  });

  it("⛔ the non-Human creature stays 2/2 — the subtype filter is enforced", () => {
    expect(pt(run(), "bear")).toEqual([2, 2]);
  });

  it("⛔ and the OPPONENT's Human stays 2/2 — 'you control' is enforced", () => {
    expect(pt(run(), "foe")).toEqual([2, 2]);
  });

  it("CONTROL — the board really is 2/2 before resolution", () => {
    // ⚠️ EARNED: the first draft of this block asserted against a raw effect-list scan, and all THREE ⛔
    // cases passed on an empty result — the pump was doing nothing and only this control caught it.
    for (const id of ["src", "ally", "bear", "foe"]) expect(pt(board(), id)).toEqual([2, 2]);
  });
});

describe("tier — all four corpus carriers, which is every card that prints this", () => {
  it("⭐ the three plain ones flip", () => {
    expect(classifyCard({ name: "Hamlet Captain", type: "Creature — Human Warrior", mana: "{1}{G}", power: "2", toughness: "2",
      oracle: "Whenever this creature attacks or blocks, other Humans you control get +1/+1 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "Belle of the Brawl", type: "Creature — Human Knight", mana: "{2}{B}", power: "3", toughness: "2",
      oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever this creature attacks, other Knights you control get +1/+0 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "Perimeter Sergeant", type: "Creature — Human Soldier", mana: "{2}{W}", power: "2", toughness: "3",
      oracle: "Whenever this creature attacks, other Humans you control get +1/+0 until end of turn." })).toBe("native-trigger");
  });

  it("⭐ and the one with the keyword rider — the card that needed the SPLITTER half", () => {
    expect(classifyCard({ name: "Heron's Grace Champion", type: "Creature — Human Knight", mana: "{2}{G}{W}", power: "3", toughness: "3",
      oracle: "Flash\nWhen this creature enters, other Humans you control get +1/+1 and gain lifelink until end of turn." })).toBe("native-trigger");
  });
});
