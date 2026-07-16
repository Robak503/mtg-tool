/**
 * recruiterTutor.test.js — FIXED-MV-CAPPED battlefield fetch (BLITZ TUT-1: the Rebel/Mercenary
 * recruiter chains + Zur / Soul of Mirrodin / Captain America). "Search your library for a <filter>
 * card with mana value N or less, put it onto the battlefield [tapped], then shuffle" parses to the
 * existing tutor atom with destination "battlefield" and a REAL {max:N} MV gate — the printed cap is
 * the anti-cheat guarantee (bfx's X-cap argument with N fixed), enforced upstream by
 * cardMatchesTutorFilter so the candidate pool is already capped. "<subtype> permanent" resolves as
 * the subtype group PLUS the permanentOnly front-face gate. CREED FPs guarded here: an unmodeled
 * filter word (nonland / nonlegendary / a color) stays LOW; the MV gate excludes over-cost cards
 * from the pool; the subtype gate excludes off-tribe cards; Lin Sivvi's {X} activation stays parked.
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyTutor } from "./effects/atoms/library.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SERGEANT = { id: "sgt", name: "Ramosian Sergeant", type: "Creature — Human Rebel", mana: "{W}",
  power: "1", toughness: "1",
  oracle: "{3}, {T}: Search your library for a Rebel permanent card with mana value 2 or less, put it onto the battlefield, then shuffle." };
const BRUTE = { id: "brt", name: "Cateran Brute", type: "Creature — Horror Mercenary", mana: "{2}{B}",
  power: "2", toughness: "1",
  oracle: "{2}, {T}: Search your library for a Mercenary permanent card with mana value 2 or less, put it onto the battlefield, then shuffle." };
const ZUR = { id: "zur", name: "Zur the Enchanter", type: "Legendary Creature — Human Wizard", mana: "{1}{W}{U}{B}",
  power: "1", toughness: "4",
  oracle: "Flying\nWhenever Zur attacks, you may search your library for an enchantment card with mana value 3 or less, put it onto the battlefield, then shuffle." };
const SOUL_OF_MIRRODIN = { id: "som", name: "Soul of Mirrodin", type: "Artifact Creature — Spirit", mana: "{6}",
  power: "5", toughness: "5",
  oracle: "Trample\n{5}: Search your library for an artifact card with mana value 5 or less, put it onto the battlefield tapped, then shuffle.\n{5}, Exile Soul of Mirrodin from your graveyard: Search your library for an artifact card with mana value 5 or less, put it onto the battlefield tapped, then shuffle." };
const LIN_SIVVI = { id: "lin", name: "Lin Sivvi, Defiant Hero", type: "Legendary Creature — Human Rebel", mana: "{1}{W}{W}",
  power: "1", toughness: "3",
  oracle: "{X}, {T}: Search your library for a Rebel permanent card with mana value X or less, put it onto the battlefield, then shuffle.\n{3}: Put target Rebel card from your graveyard on the bottom of your library." };
const GUARDIAN_SUNMARE = { id: "gsm", name: "Guardian Sunmare", type: "Creature — Horse", mana: "{3}{W}{W}",
  power: "4", toughness: "4",
  oracle: "Whenever this creature attacks while saddled, search your library for a nonland permanent card with mana value 3 or less, put it onto the battlefield, then shuffle.\nSaddle 2" };

describe("parse — the bfn fixed-MV battlefield fetch", () => {
  it("Ramosian Sergeant's effect → tutor atom: rebel group + permanentOnly + {max:2} + battlefield", () => {
    const p = parseEffectClause("Search your library for a Rebel permanent card with mana value 2 or less, put it onto the battlefield, then shuffle.", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({
      op: "tutor",
      destination: "battlefield",
      entersTapped: false,
      filter: { groups: [["rebel"]], permanentOnly: true, mv: { max: 2 } },
    });
  });
  it("Soul of Mirrodin's effect → artifact group (no permanentOnly), {max:5}, entersTapped", () => {
    const p = parseEffectClause("Search your library for an artifact card with mana value 5 or less, put it onto the battlefield tapped, then shuffle.", "Artifact Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "tutor", destination: "battlefield", entersTapped: true,
      filter: { groups: [["artifact"]], mv: { max: 5 } },
    });
    expect(p.atoms[0].filter.permanentOnly).toBeUndefined();
  });
  it("CREED — unmodeled filter words stay LOW (nonland, nonlegendary+color, or-greater comparator)", () => {
    expect(programConfidence(parseEffectClause("Search your library for a nonland permanent card with mana value 3 or less, put it onto the battlefield, then shuffle.", "Creature"))).not.toBe("high");
    expect(programConfidence(parseEffectClause("Search your library for a nonlegendary green creature card with mana value 3 or less, put it onto the battlefield, then shuffle.", "Creature"))).not.toBe("high");
    expect(programConfidence(parseEffectClause("Search your library for a creature card with mana value 3 or greater, put it onto the battlefield, then shuffle.", "Sorcery"))).not.toBe("high");
  });
});

describe("classify — the recruiter carriers flip; the parked shapes hold", () => {
  it("Ramosian Sergeant + Cateran Brute → native-activated", () => {
    expect(classifyCard(SERGEANT)).toBe("native-activated");
    expect(classifyCard(BRUTE)).toBe("native-activated");
  });
  it("Zur the Enchanter → native-trigger (flying + the attack-trigger fetch)", () => {
    expect(classifyCard(ZUR)).toBe("native-trigger");
  });
  it("CREED — Lin Sivvi ({X} activation + graveyard-bottom ability) stays body-only", () => {
    expect(classifyCard(LIN_SIVVI)).toBe("body-only");
  });
  it("CREED — Soul of Mirrodin (second ability activates FROM THE GRAVEYARD — unmodeled cost zone) stays body-only", () => {
    expect(classifyCard(SOUL_OF_MIRRODIN)).toBe("body-only");
  });
  it("CREED — Guardian Sunmare (nonland filter + saddle) stays body-only", () => {
    expect(classifyCard(GUARDIAN_SUNMARE)).toBe("body-only");
  });
});

describe("runtime — the fetch enters the battlefield through the capped, typed pool", () => {
  const rebel1 = { id: "r1", name: "Rebel Grunt", type: "Creature — Human Rebel", mana: "{W}", cmc: 1, oracle: "" };
  const rebel4 = { id: "r4", name: "Rebel Captain-General", type: "Creature — Human Rebel", mana: "{3}{W}", cmc: 4, oracle: "" };
  const offTribe = { id: "ot", name: "Cheap Bear", type: "Creature — Bear", mana: "{1}", cmc: 1, oracle: "" };

  function stateWithUserLibrary(cards) {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    return { ...b, players: { ...b.players, user: { ...b.players.user, library: cards, battlefield: [] } } };
  }

  it("candidate pool = Rebels with MV<=2 ONLY; the pick enters the battlefield and the library shuffles", () => {
    const p = parseEffectClause("Search your library for a Rebel permanent card with mana value 2 or less, put it onto the battlefield, then shuffle.", "Creature");
    const st = applyTutor(stateWithUserLibrary([rebel1, rebel4, offTribe]), p.atoms[0], { controller: "user", cardName: "Ramosian Sergeant" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield", mayFailToFind: true });
    expect(st.pendingChoice.candidates.map((c) => c.id)).toEqual(["r1"]); // MV gate drops r4, type gate drops the bear
    const after = resolveTutorChoice(st, "r1");
    expect(after.players.user.battlefield.some((perm) => perm.card.id === "r1")).toBe(true);
    expect(after.players.user.library.some((c) => c.id === "r1")).toBe(false);
  });

  it("an empty pool is a clean fail-to-find (never a fabricated fetch)", () => {
    const p = parseEffectClause("Search your library for a Mercenary permanent card with mana value 2 or less, put it onto the battlefield, then shuffle.", "Creature");
    const st = applyTutor(stateWithUserLibrary([rebel4, offTribe]), p.atoms[0], { controller: "user", cardName: "Cateran Brute" });
    // No matching candidate: applyTutor still pauses (mayFailToFind) OR no-ops with a shuffle — either
    // way NOTHING enters the battlefield.
    const resolved = st.pendingChoice ? resolveTutorChoice(st, null) : st;
    expect((resolved.players.user.battlefield || []).length).toBe(0);
  });
});
