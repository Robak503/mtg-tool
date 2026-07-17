/**
 * globalCreatureAnthem.test.js — BLITZ GA-1: GLOBAL "each creature" anthems / debuffs. The SF-1 slice parked
 * the GLOBAL sibling of every filtered anthem: it hardcoded "you control" in each no-determiner branch, so a
 * FILTERED clause with NO "you control" — "Black creatures get +1/+1" (Bad Moon), "White creatures get -1/-1"
 * (Dread of Night), "Nonblack creatures get -1/-1" (Ascendant Evincar), "Minotaur creatures get +1/+0" (Anaba
 * Spirit Crafter), "Cleric creatures have vigilance" (Akroma's Devoted) — dropped to body-only. GA-1 adds the
 * GLOBAL branches (controllerScope "each" — matchesSelector's default, EVERY player's matching creatures),
 * reusing the SF-1 selector gates (color / notColors / legendary / colorless / multicolored / tap-state /
 * subtype) unchanged; they are scope-agnostic, so the same gate is exact at "each" scope. The scope is read
 * STRICTLY from the presence/absence of "you control": a you-control anthem NEVER becomes global, and a global
 * one NEVER becomes you-control (the discipline pin below). The negative debuff rides the SAME layer-7c ptModify
 * (signed deltas) the you-control / opponent anthems use. Real oracle fixtures (bundled Scryfall, verified
 * 2026-07-17 via cardIndex.lookupCard).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ── Real-oracle source fixtures (exact bundled Scryfall text) ────────────────────────────────────────────
const BAD_MOON = { id: "bm", name: "Bad Moon", type: "Enchantment", mana: "{1}{B}", colors: ["B"],
  oracle: "Black creatures get +1/+1." };
const CRUSADE = { id: "cru", name: "Crusade", type: "Enchantment", mana: "{W}{W}", colors: ["W"],
  oracle: "White creatures get +1/+1." };
const DREAD_OF_NIGHT = { id: "don", name: "Dread of Night", type: "Enchantment", mana: "{B}", colors: ["B"],
  oracle: "White creatures get -1/-1." };
const ANABA = { id: "asc", name: "Anaba Spirit Crafter", type: "Creature — Minotaur Shaman", mana: "{2}{R}{R}",
  colors: ["R"], power: "1", toughness: "3", oracle: "Minotaur creatures get +1/+0." };
const EVINCAR = { id: "ae", name: "Ascendant Evincar", type: "Legendary Creature — Phyrexian Vampire Noble",
  mana: "{4}{B}{B}", colors: ["B"], power: "3", toughness: "3",
  oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nOther black creatures get +1/+1.\nNonblack creatures get -1/-1." };
const AKROMA_DEVOTED = { id: "ad", name: "Akroma's Devoted", type: "Creature — Human Cleric", mana: "{3}{W}",
  colors: ["W"], power: "2", toughness: "4", oracle: "Cleric creatures have vigilance." };
const AYSEN_HIGHWAY = { id: "ah", name: "Aysen Highway", type: "Enchantment", mana: "{3}{W}{W}{W}", colors: ["W"],
  oracle: "White creatures have plainswalk. (They can't be blocked as long as defending player controls a Plains.)" };
// Contrast fixture: the you-control twin of Crusade (same color filter, opposite scope).
const WHITE_YOUCONTROL = { id: "wyc", name: "T Anthem", type: "Enchantment", mana: "{1}{W}", colors: ["W"],
  oracle: "White creatures you control get +1/+1." };

// ── Bare creature fixtures ──────────────────────────────────────────────────────────────────────────────
const WHITE_C = (id) => ({ id, name: "White Bear", type: "Creature — Bear", mana: "{2}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" });
const BLACK_C = (id) => ({ id, name: "Black Bear", type: "Creature — Bear", mana: "{2}{B}", colors: ["B"], power: "2", toughness: "2", oracle: "" });
const MINO_C  = (id) => ({ id, name: "Test Minotaur", type: "Creature — Minotaur", mana: "{2}{R}", colors: ["R"], power: "2", toughness: "2", oracle: "" });
const CLERIC_C = (id) => ({ id, name: "Test Cleric", type: "Creature — Human Cleric", mana: "{1}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" });
const PLAIN_C = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", oracle: "" });

const mk = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card, controller, summoningSick: false }), ...over });
// A cross-seat board: source + some creatures under user, some under ai1 (the opponent seat).
function crossSeat(userPerms, ai1Perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userPerms }, ai1: { ...s.players.ai1, battlefield: ai1Perms } } };
}

// ── Recognition (classify) on real oracle ────────────────────────────────────────────────────────────────
describe("GA-1 — recognition on real oracle", () => {
  it("global color anthems / debuffs flip native", () => {
    expect(classifyCard(BAD_MOON)).toBe("native-static");        // Black creatures +1/+1
    expect(classifyCard(CRUSADE)).toBe("native-static");         // White creatures +1/+1
    expect(classifyCard(DREAD_OF_NIGHT)).toBe("native-static");  // White creatures -1/-1
  });
  it("global subtype anthem / keyword-grant flip native", () => {
    expect(classifyCard(ANABA)).toBe("native-static");           // Minotaur creatures +1/+0
    expect(classifyCard(AKROMA_DEVOTED)).toBe("native-static");  // Cleric creatures have vigilance
    expect(classifyCard(AYSEN_HIGHWAY)).toBe("native-static");   // White creatures have plainswalk (basic landwalk)
  });
  it("the two-sided global color-quality Praetor flips (Ascendant Evincar)", () => {
    expect(classifyCard(EVINCAR)).toBe("native-static");         // other black +1/+1 AND nonblack -1/-1
  });
});

// ── Emitted scope — the discipline: "each" iff no "you control", "you" iff "you control" ─────────────────
describe("GA-1 — the scope is read STRICTLY from 'you control'", () => {
  it("Crusade (no 'you control') emits controllerScope 'each'", () => {
    const pt = parseStaticAbilities(CRUSADE).find(s => s.op?.layerOp === "ptModify");
    expect(pt.affects.selector).toMatchObject({ controllerScope: "each", cardTypes: ["Creature"], colors: ["W"] });
  });
  it("the you-control twin emits controllerScope 'you' — same filter, opposite scope", () => {
    const pt = parseStaticAbilities(WHITE_YOUCONTROL).find(s => s.op?.layerOp === "ptModify");
    expect(pt.affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], colors: ["W"] });
  });
  it("Ascendant Evincar emits BOTH global specs — other-black +1/+1 and nonblack -1/-1", () => {
    const specs = parseStaticAbilities(EVINCAR).filter(s => s.op?.layerOp === "ptModify");
    const black = specs.find(s => s.op.power === 1);
    const nonblack = specs.find(s => s.op.power === -1);
    expect(black.affects.selector).toMatchObject({ controllerScope: "each", colors: ["B"], excludeSelf: true });
    expect(nonblack.affects.selector).toMatchObject({ controllerScope: "each", notColors: ["B"] });
    expect(nonblack.affects.selector.excludeSelf).toBeFalsy(); // no determiner → includes-self reach (but Evincar is black → notColors skips it anyway)
  });
});

// ── Runtime — a GLOBAL anthem hits EVERY player's matching creatures ─────────────────────────────────────
describe("GA-1 — global scope reaches BOTH players (the whole point)", () => {
  it("Bad Moon pumps black creatures on BOTH seats; a white creature is untouched", () => {
    const s = crossSeat(
      [mk("bm", BAD_MOON, "user"), mk("u_black", BLACK_C("u_black"), "user"), mk("u_white", WHITE_C("u_white"), "user")],
      [mk("a_black", BLACK_C("a_black"), "ai1")],
    );
    expect(permanentPower(s, "u_black")).toBe(3);   // own black → +1/+1
    expect(permanentPower(s, "a_black")).toBe(3);   // OPPONENT's black → +1/+1 too (global)
    expect(permanentToughness(s, "a_black")).toBe(3);
    expect(permanentPower(s, "u_white")).toBe(2);   // white → untouched
  });
  it("Dread of Night's -1/-1 hits white creatures on BOTH seats (lethal-toughness pin)", () => {
    const s = crossSeat(
      [mk("don", DREAD_OF_NIGHT, "user"), mk("u_white", WHITE_C("u_white"), "user")],
      [mk("a_white", { ...WHITE_C("a_white"), toughness: "1" }, "ai1"), mk("a_black", BLACK_C("a_black"), "ai1")],
    );
    expect(permanentPower(s, "u_white")).toBe(1);      // own white → -1/-1
    expect(permanentToughness(s, "a_white")).toBe(0);  // opponent's white X/1 → 0 toughness (dead to the SBA)
    expect(permanentPower(s, "a_black")).toBe(2);      // black → untouched
  });
  it("Ascendant Evincar: nonblack -1/-1 hits BOTH players' nonblack; Evincar (black) skips its own debuff", () => {
    const s = crossSeat(
      [mk("ae", EVINCAR, "user"), mk("u_black", BLACK_C("u_black"), "user"), mk("u_white", WHITE_C("u_white"), "user")],
      [mk("a_white", WHITE_C("a_white"), "ai1"), mk("a_black", BLACK_C("a_black"), "ai1")],
    );
    // nonblack debuff — both seats
    expect(permanentPower(s, "u_white")).toBe(1);   // own white → -1/-1
    expect(permanentPower(s, "a_white")).toBe(1);   // opponent's white → -1/-1 (the whole point)
    // other-black pump — both seats
    expect(permanentPower(s, "u_black")).toBe(3);   // own black → +1/+1
    expect(permanentPower(s, "a_black")).toBe(3);   // opponent's black → +1/+1
    // the source itself: black, so the nonblack debuff SKIPS it; "other" black pump EXCLUDES it
    expect(permanentPower(s, "ae")).toBe(3);
    expect(permanentToughness(s, "ae")).toBe(3);
  });
  it("Anaba Spirit Crafter: Minotaur +1/+0 hits both seats' Minotaurs INCLUDING itself (no 'other')", () => {
    const s = crossSeat(
      [mk("asc", ANABA, "user"), mk("u_mino", MINO_C("u_mino"), "user"), mk("u_bear", PLAIN_C("u_bear"), "user")],
      [mk("a_mino", MINO_C("a_mino"), "ai1")],
    );
    expect(permanentPower(s, "u_mino")).toBe(3);   // own Minotaur → +1/+0
    expect(permanentPower(s, "a_mino")).toBe(3);   // opponent's Minotaur → +1/+0
    expect(permanentPower(s, "asc")).toBe(2);      // source IS a Minotaur, no "other" → pumps itself (1+1)
    expect(permanentPower(s, "u_bear")).toBe(2);   // non-Minotaur → untouched
  });
});

// ── Runtime — a GLOBAL keyword grant reaches every player's matching creatures ───────────────────────────
describe("GA-1 — global keyword grant (Akroma's Devoted — Cleric creatures have vigilance)", () => {
  it("grants vigilance to Clerics on BOTH seats incl. the source; a non-Cleric never gets it", () => {
    const s = crossSeat(
      [mk("ad", AKROMA_DEVOTED, "user"), mk("u_bear", PLAIN_C("u_bear"), "user")],
      [mk("a_cleric", CLERIC_C("a_cleric"), "ai1")],
    );
    expect(permanentHasKeyword(s, "ad", "vigilance")).toBe(true);        // source is a Cleric, no "other" → itself
    expect(permanentHasKeyword(s, "a_cleric", "vigilance")).toBe(true);  // opponent's Cleric → granted (global)
    expect(permanentHasKeyword(s, "u_bear", "vigilance")).toBe(false);   // non-Cleric → never
  });
});

// ── The discipline pin: SAME filter, scope decided ONLY by "you control" ─────────────────────────────────
describe("GA-1 — a you-control anthem stays you-control; the global twin does not", () => {
  it("global Crusade hits BOTH seats, the you-control twin hits ONLY its controller", () => {
    const global = crossSeat(
      [mk("cru", CRUSADE, "user"), mk("u_white", WHITE_C("u_white"), "user")],
      [mk("a_white", WHITE_C("a_white"), "ai1")],
    );
    expect(permanentPower(global, "u_white")).toBe(3);  // own white → +1/+1
    expect(permanentPower(global, "a_white")).toBe(3);  // opponent's white → +1/+1 (global)

    const scoped = crossSeat(
      [mk("wyc", WHITE_YOUCONTROL, "user"), mk("u_white", WHITE_C("u_white"), "user")],
      [mk("a_white", WHITE_C("a_white"), "ai1")],
    );
    expect(permanentPower(scoped, "u_white")).toBe(3);  // own white → +1/+1
    expect(permanentPower(scoped, "a_white")).toBe(2);  // opponent's white → UNTOUCHED (you-control, not global)
  });
});

// ── FN guards — an unmodelable / mis-scoped clause PARKS (never a false positive) ────────────────────────
describe("GA-1 — FN guards", () => {
  it("a conditional global anthem is now GATED (CA-1) — never an unconditional fabrication", () => {
    // GA-1 parked this shape; CA-1 models it as a LIVE Plains-count gate (gateOn:"source" — the anthem
    // controller's board), so it flips native. The FP guard this test carried survives tightened: every
    // emitted descriptor must be gated (no unconditional ptModify while the gate is closed).
    const gated = { id: "g", name: "T", type: "Enchantment", mana: "{1}{W}",
      oracle: "White creatures get +1/+1 as long as you control a Plains." };
    expect(classifyCard(gated)).toBe("native-static");
    const specs = parseStaticAbilities(gated).filter(s => s.affects?.mode === "dynamic");
    expect(specs).toHaveLength(1);
    expect(specs[0].op).toMatchObject({ layerOp: "ptModifyGated", gate: { countSpec: { kind: "permanentsYouControl", subtype: "Plains" }, atLeast: 1, gateOn: "source" } });
    // A condition with NO exact evaluator still parks the whole clause (CREED fail-closed).
    const unevaluable = { id: "g2", name: "T", type: "Enchantment", mana: "{1}{W}",
      oracle: "White creatures get +1/+1 as long as you have the city's blessing." };
    expect(classifyCard(unevaluable)).toBe("body-only");
    expect(parseStaticAbilities(unevaluable).filter(s => s.affects?.mode === "dynamic")).toHaveLength(0);
  });
  it("a FILTERED opponents debuff is NOT captured as a global anthem (parks, safe FN)", () => {
    // Only the BARE "creatures your opponents control get -N/-M" is the OD-1 branch; a filtered one has no
    // modeled scope, so the GA-1 verb-anchor (verb must follow "creatures") fails → no anthem emitted.
    const filteredOpp = { id: "fo", name: "T", type: "Enchantment", mana: "{2}{B}",
      oracle: "Nonblack creatures your opponents control get -1/-1." };
    expect(parseStaticAbilities(filteredOpp).filter(s => s.op?.layerOp === "ptModify")).toHaveLength(0);
  });
  it("a foil-quality qualifier ('Premium') never fabricates a subtype grant (Super Secret Tech parks)", () => {
    const superSecret = { id: "sst", name: "Super Secret Tech", type: "Artifact", mana: "{1}",
      oracle: "Premium spells cost {1} less to cast.\nPremium creatures get +1/+1." };
    expect(classifyCard(superSecret)).toBe("body-only");
    // no ptModify targeting a bogus "premium" subtype (which a changeling would spuriously match)
    const specs = parseStaticAbilities(superSecret).filter(s => s.op?.layerOp === "ptModify" && s.affects?.selector?.subtypes);
    expect(specs).toHaveLength(0);
  });
});
