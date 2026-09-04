/**
 * recruiterOfTheGuard.test.js — SHELF-85 runbook Phase 2 · B5 (2026-09-04): Recruiter of the Guard (Brago).
 *
 *   "When this creature enters, you may search your library for a creature card with toughness 2 or less, reveal it,
 *    put it into your hand, then shuffle."
 *
 * The tutor-to-hand arm read only a mana-value cap ("with mana value N [or less]"). The same "N [or less]" reader now
 * fills a `toughness` / `power` cap on the filter, and the shared matcher (the candidate pool AND the auto-pick's
 * re-check) enforces it on the card's PRINTED stat (CR 208.1); a "*" or absent stat is unpriced and never a candidate.
 * Imperial Recruiter ("power 2 or less") is the identical shape and graduates with it — its whole text is that sentence.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { detectTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveTutorChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RECRUITER = { id: "c-rg", name: "Recruiter of the Guard", type: "Creature — Human Soldier", mana: "{2}{W}", cmc: 3, power: 1, toughness: 1, keywords: [],
  oracle: "When this creature enters, you may search your library for a creature card with toughness 2 or less, reveal it, put it into your hand, then shuffle." };
const IMPERIAL = { id: "c-ir", name: "Imperial Recruiter", type: "Creature — Human Advisor", mana: "{2}{R}", cmc: 3, power: 1, toughness: 1, keywords: [],
  oracle: "When this creature enters, you may search your library for a creature card with power 2 or less, reveal it, put it into your hand, then shuffle." };

const SMALL = { id: "lib-small", name: "Mother of Runes", type: "Creature — Human Cleric", mana: "{W}", cmc: 1, power: 1, toughness: 1, oracle: "{T}: Target creature you control gains protection from the color of your choice until end of turn." };
const WIDE = { id: "lib-wide", name: "Wall of Omens", type: "Creature — Wall", mana: "{1}{W}", cmc: 2, power: 0, toughness: 4, oracle: "Defender\nWhen this creature enters, draw a card." };
const BIG = { id: "lib-big", name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", cmc: 5, power: 4, toughness: 4, oracle: "Flying, vigilance" };
const STAR = { id: "lib-star", name: "Nightmare", type: "Creature — Nightmare Horse", mana: "{5}{B}", cmc: 6, power: "*", toughness: "*", oracle: "Flying\nThis creature's power and toughness are each equal to the number of Swamps you control." };
const SPELL = { id: "lib-spell", name: "Swords to Plowshares", type: "Instant", mana: "{W}", cmc: 1, oracle: "Exile target creature. Its controller gains life equal to its power." };
const TWO = { id: "lib-two", name: "Thalia, Guardian of Thraben", type: "Legendary Creature — Human Soldier", mana: "{1}{W}", cmc: 2, power: 2, toughness: 1, oracle: "First strike\nNoncreature spells cost {1} more to cast." };

function board(ctrl = "user") {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: ctrl, priorityHolder: ctrl, consecutivePasses: 0, turn: 3,
    players: { ...s.players, [ctrl]: { ...s.players[ctrl], library: [BIG, SMALL, WIDE, STAR, SPELL, TWO], hand: [], graveyard: [] } } };
}

describe("parse", () => {
  it("the toughness cap rides the tutor filter beside the type group; power is the identical shape", () => {
    const r = parseEffectClause("You may search your library for a creature card with toughness 2 or less, reveal it, put it into your hand, then shuffle.", "Creature");
    expect(r.atoms).toEqual([{ op: "tutor", filter: { groups: [["creature"]], toughness: { max: 2 } }, filterLabel: "creature card with toughness 2 or less", destination: "hand", targetType: null, optional: true }]);
    const p = parseEffectClause("Search your library for a creature card with power 2 or less, reveal it, put it into your hand, then shuffle.", "Creature");
    expect(p.atoms[0].filter).toEqual({ groups: [["creature"]], power: { max: 2 } });
    expect(detectTriggers(RECRUITER).map((d) => d.event)).toEqual(["etb"]);
  });
  it("seen-to-fail: a stat cap with no type word has no printed stat to read; an unmodeled comparator parks", () => {
    expect(parseEffectClause("Search your library for a card with toughness 2 or less, reveal it, put it into your hand, then shuffle.", "Creature").atoms).toEqual([]);
    expect(parseEffectClause("Search your library for a creature card with toughness 2 or greater, reveal it, put it into your hand, then shuffle.", "Creature").atoms).toEqual([]);
  });
  it("the matcher reads the PRINTED stat: a '*' toughness is never a candidate; a non-creature has none", () => {
    const f = { groups: [["creature"]], toughness: { max: 2 } };
    expect(cardMatchesTutorFilter(SMALL, f)).toBe(true);
    expect(cardMatchesTutorFilter(TWO, f)).toBe(true);
    expect(cardMatchesTutorFilter(WIDE, f)).toBe(false);
    expect(cardMatchesTutorFilter(STAR, f)).toBe(false);
    expect(cardMatchesTutorFilter(SPELL, f)).toBe(false);
    expect(cardMatchesTutorFilter(WIDE, { groups: [["creature"]], power: { max: 2 } })).toBe(true); // power 0 passes a power cap
  });
});

describe("runtime — the ETB search offers only toughness ≤ 2 creatures", () => {
  it("user: the optional search pauses with the capped candidate pool; the pick lands in hand", () => {
    let s = board("user");
    s = enterPermanent(s, RECRUITER, "user");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    // "you may" — the optional-effect pause first (the human seat's real yes/no), then the search itself.
    expect(s.pendingChoice).toMatchObject({ kind: "optional-effect", controller: "user" });
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id ?? c).sort()).toEqual(["lib-small", "lib-two"]);
    s = resolveTutorChoice(s, "lib-two");
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["lib-two"]);
    expect(s.players.user.library).toHaveLength(5);
  });
  it("AI: the same capped pool from the AI seat", () => {
    let s = board("ai");
    s = enterPermanent(s, RECRUITER, "ai");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toMatchObject({ kind: "optional-effect", controller: "ai" });
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai" });
    expect(s.pendingChoice.candidates.map((c) => c.id ?? c).sort()).toEqual(["lib-small", "lib-two"]);
  });
});

describe("classifier", () => {
  it("both Recruiters are native-trigger", () => {
    expect(classifyCard(RECRUITER)).toBe("native-trigger");
    expect(classifyCard(IMPERIAL)).toBe("native-trigger");
  });
});
