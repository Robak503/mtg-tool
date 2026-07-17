/**
 * anthemSubjectFilter.test.js — BLITZ SF-1: ANTHEM SUBJECT-FILTER selectors. The ST-2 slice parked a bucket of
 * anthem statics whose SUBJECT is a supertype / color-quality / tap-state the selector couldn't express:
 * "Legendary creatures you control get +X/+Y" (CR 205.4), "Colorless / Multicolored / Nonblack creatures you
 * control …" (CR 105/202), "Untapped / Tapped creatures you control …". SF-1 adds the exact selector fields to
 * layers.matchesSelector and the recognizer branches to parseCreatureSelector — the anthem P/T lane and the
 * keyword-grant lane are UNCHANGED (both already consume the shared selector), so extending the selector reaches
 * both. Every gate is EXACT (a wrongly-matched creature getting the anthem is a forbidden FP):
 *   • legendary / notLegendary — effectiveTypeIdentity's supertype set (layer-aware, recursion-free).
 *   • colorless / multicolored / notColors — LAYER-AWARE permanentColors (printed ∪ layer-5 setColor/addColor),
 *     guarded against the derive re-entry exactly like the Tetsuko P/T predicate.
 *   • untapped / tapped — the LIVE candidate.tapped flag; a tap is an immutable state update and the char memo
 *     is per-state, so the anthem P/T re-derives on the post-tap state (the mission's live-ness gate, pinned).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-17 via cardIndex.lookupCard).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, updatePermanentSafe, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ── Real-oracle carrier fixtures ────────────────────────────────────────────────────────────────────────
const RISING_OF_THE_DAY = { id: "rotd", name: "Rising of the Day", type: "Enchantment", mana: "{2}{R}",
  oracle: "Creatures you control have haste.\nLegendary creatures you control get +1/+0." };
const DAY_OF_DESTINY = { id: "dod", name: "Day of Destiny", type: "Enchantment", mana: "{1}{W}",
  oracle: "Legendary creatures you control get +2/+2." };
const ARVAD = { id: "arv", name: "Arvad the Cursed", type: "Legendary Creature — Vampire Knight", mana: "{4}{W}{B}",
  power: "2", toughness: "4", oracle: "Deathtouch, lifelink\nOther legendary creatures you control get +2/+2." };
const TIDE_DRIFTER = { id: "tdr", name: "Tide Drifter", type: "Creature — Eldrazi Drone", mana: "{4}",
  power: "0", toughness: "4", oracle: "Devoid (This card has no color.)\nOther colorless creatures you control get +0/+1." };
const GLASS = { id: "glass", name: "Glass of the Guildpact", type: "Artifact", mana: "{4}",
  oracle: "Multicolored creatures you control get +1/+1." };
const MAZE_GLIDER = { id: "mgl", name: "Maze Glider", type: "Creature — Elemental", mana: "{5}",
  power: "3", toughness: "3", oracle: "Flying\nMulticolored creatures you control have flying." };
const BUILDERS_BLESSING = { id: "bbl", name: "Builder's Blessing", type: "Enchantment", mana: "{2}{W}",
  oracle: "Untapped creatures you control get +0/+2." };
const ADEPT_WATERSHAPER = { id: "aws", name: "Adept Watershaper", type: "Creature — Merfolk Wizard", mana: "{3}{U}",
  power: "2", toughness: "3", oracle: "Other tapped creatures you control have indestructible." };
const ANGEL_OF_JUBILATION = { id: "aoj", name: "Angel of Jubilation", type: "Creature — Angel", mana: "{2}{W}{W}",
  power: "3", toughness: "3",
  oracle: "Flying\nOther nonblack creatures you control get +1/+1.\nPlayers can't pay life or sacrifice creatures to cast spells or activate abilities." };
const ARCADES_SABBOTH = { id: "arc", name: "Arcades Sabboth", type: "Legendary Creature — Elder Dragon", mana: "{2}{G}{W}{U}",
  power: "7", toughness: "7",
  oracle: "Flying\nAt the beginning of your upkeep, sacrifice Arcades Sabboth unless you pay {G}{W}{U}.\nEach untapped creature you control gets +0/+2 as long as it's not attacking." };

// ── Bare creature fixtures ──────────────────────────────────────────────────────────────────────────────
const LEGEND = { id: "lc", name: "Sram, Senior Edificer", type: "Legendary Creature — Dwarf Advisor", power: "2", toughness: "2", oracle: "" };
const PLAIN = { id: "pc", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const WHITE = { id: "wc", name: "White Bear", type: "Creature — Bear", mana: "{2}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" };
const BLACK = { id: "kc", name: "Black Bear", type: "Creature — Bear", mana: "{2}{B}", colors: ["B"], power: "2", toughness: "2", oracle: "" };
const COLORLESS = { id: "cc", name: "Eldrazi Spawn", type: "Creature — Eldrazi", mana: "{3}", colors: [], power: "2", toughness: "2", oracle: "" };
const GOLD = { id: "gc", name: "Gold Bear", type: "Creature — Bear", mana: "{W}{B}", colors: ["W", "B"], power: "2", toughness: "2", oracle: "" };

function boardOf(...perms) {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const perm = (card, over = {}) => ({ ...createPermanent({ id: card.id, card, controller: "user", summoningSick: false }), ...over });

// ── Recognition (classify) — the CLEAN single-purpose carriers flip native-static ────────────────────────
describe("SF-1 — recognition on real oracle", () => {
  it("legendary anthems flip native", () => {
    expect(classifyCard(RISING_OF_THE_DAY)).toBe("native-static"); // haste-to-all + legendary +1/+0
    expect(classifyCard(DAY_OF_DESTINY)).toBe("native-static");
    expect(classifyCard(ARVAD)).toBe("native-static"); // printed deathtouch/lifelink + legendary anthem
  });
  it("color-quality anthems flip native", () => {
    expect(classifyCard(TIDE_DRIFTER)).toBe("native-static");    // devoid + colorless anthem
    expect(classifyCard(GLASS)).toBe("native-static");           // multicolored P/T
    expect(classifyCard(MAZE_GLIDER)).toBe("native-static");     // multicolored keyword grant
  });
  it("tap-state anthems flip native", () => {
    expect(classifyCard(BUILDERS_BLESSING)).toBe("native-static"); // untapped P/T
    expect(classifyCard(ADEPT_WATERSHAPER)).toBe("native-static"); // tapped keyword grant
  });
  it("the parked-carrier selectors parse EXACTLY even when the whole card stays body-only", () => {
    // Angel of Jubilation is body-only (the "can't pay life/sac" clause is unmodeled), but its color filter
    // must parse to notColors:["B"] + excludeSelf so the anthem lane reaches exactly the nonblack creatures.
    const aoj = parseStaticAbilities(ANGEL_OF_JUBILATION).find(s => s.op?.layerOp === "ptModify");
    expect(aoj.affects.selector).toMatchObject({ notColors: ["B"], excludeSelf: true, cardTypes: ["Creature"] });
    expect(classifyCard(ANGEL_OF_JUBILATION)).toBe("body-only");
  });
});

// ── Runtime — the anthem buffs ONLY the filtered creatures ──────────────────────────────────────────────
describe("SF-1 — legendary supertype gate (CR 205.4)", () => {
  it("+2/+2 reaches a legendary creature and NOT a nonlegendary one", () => {
    const s = boardOf(perm(DAY_OF_DESTINY), perm(LEGEND), perm(PLAIN));
    expect(permanentPower(s, "lc")).toBe(4);      // legendary → +2/+2
    expect(permanentToughness(s, "lc")).toBe(4);
    expect(permanentPower(s, "pc")).toBe(2);      // nonlegendary → untouched
    expect(permanentToughness(s, "pc")).toBe(2);
  });
  it("notLegendary is the exact negation (Flowering of the White Tree line)", () => {
    const FLOWER_NONLEG = { id: "fnl", name: "T", type: "Enchantment", mana: "{2}{W}",
      oracle: "Nonlegendary creatures you control get +1/+1." };
    const s = boardOf(perm(FLOWER_NONLEG), perm(LEGEND), perm(PLAIN));
    expect(permanentPower(s, "pc")).toBe(3);      // nonlegendary → +1/+1
    expect(permanentPower(s, "lc")).toBe(2);      // legendary → untouched
  });
});

describe("SF-1 — colorless / multicolored gates (layer-aware permanentColors)", () => {
  it("colorless +0/+1 reaches a colorless creature, not a colored one; the OTHER source is excluded", () => {
    const s = boardOf(perm(TIDE_DRIFTER), perm(COLORLESS), perm(WHITE));
    expect(permanentToughness(s, "cc")).toBe(3);  // colorless → +0/+1
    expect(permanentToughness(s, "wc")).toBe(2);  // white → untouched
    expect(permanentToughness(s, "tdr")).toBe(4); // devoid source, but "Other" → excludeSelf, not buffed
  });
  it("multicolored +1/+1 reaches only a two-color creature", () => {
    const s = boardOf(perm(GLASS), perm(GOLD), perm(WHITE), perm(COLORLESS));
    expect(permanentPower(s, "gc")).toBe(3);      // WB → multicolored → +1/+1
    expect(permanentPower(s, "wc")).toBe(2);      // mono → untouched
    expect(permanentPower(s, "cc")).toBe(2);      // colorless → untouched
  });
  it("LAYER-AWARE: a color-changed creature moves in/out of the gate (permanentColors, not printed)", () => {
    // Nonblack anthem + a WHITE creature made BLACK by a layer-5 addColor: it must DROP the buff (proves the
    // read is layer-aware permanentColors, not colorsOf(card) which would still see printed white → FP).
    const NONBLACK = { id: "nba", name: "T", type: "Enchantment", mana: "{2}{W}",
      oracle: "Nonblack creatures you control get +1/+1." };
    const base = boardOf(perm(NONBLACK), perm(WHITE), perm(BLACK));
    expect(permanentPower(base, "wc")).toBe(3);   // white is nonblack → +1/+1
    expect(permanentPower(base, "kc")).toBe(2);   // black → untouched
    const madeBlack = { ...base, continuousEffects: [
      { id: "mk", layer: 5, op: { layerOp: "addColor", colors: ["B"] }, affects: { mode: "fixed", permanentIds: ["wc"] } },
    ] };
    expect(permanentPower(madeBlack, "wc")).toBe(2); // now black → drops out of the nonblack anthem
  });
});

describe("SF-1 — untapped / tapped gates (LIVE state read — mission live-ness pin)", () => {
  it("untapped +0/+2 RE-DERIVES live across a tap and an untap", () => {
    const s = boardOf(perm(BUILDERS_BLESSING), perm(PLAIN, { tapped: false }));
    expect(permanentToughness(s, "pc")).toBe(4);              // untapped → 2 + 2
    const tapped = updatePermanentSafe(s, "pc", p => ({ ...p, tapped: true }));
    expect(permanentToughness(tapped, "pc")).toBe(2);        // tapped → buff gone on the NEW state
    const untapped = updatePermanentSafe(tapped, "pc", p => ({ ...p, tapped: false }));
    expect(permanentToughness(untapped, "pc")).toBe(4);      // untapped again → buff back
  });
  it("tapped keyword grant is exact and live (Adept Watershaper — Other tapped → indestructible)", () => {
    const s = boardOf(perm(ADEPT_WATERSHAPER), perm(PLAIN, { tapped: true }), perm(LEGEND, { tapped: false }));
    expect(permanentHasKeyword(s, "pc", "indestructible")).toBe(true);   // tapped → granted
    expect(permanentHasKeyword(s, "lc", "indestructible")).toBe(false);  // untapped → not granted
    const untapped = updatePermanentSafe(s, "pc", p => ({ ...p, tapped: false }));
    expect(permanentHasKeyword(untapped, "pc", "indestructible")).toBe(false); // untapped now → loses it live
  });
});

// ── SF-1 park, CA-1 pickup — the not-attacking conditional is now a LIVE per-candidate gate ─────────────
describe("SF-1 park → CA-1 pickup: the not-attacking conditional is exactly gated", () => {
  it("Arcades Sabboth's anthem now parses with the notAttacking gate (card tier rides its other clauses)", () => {
    // SF-1 parked this clause ("untapped != untapped AND not attacking" — a vigilant attacker would be a
    // forbidden FP under a bare untapped anthem). CA-1 models the conditional exactly: the untapped selector
    // PLUS a per-candidate {kind:"notAttacking"} gate layers.gateMet re-evaluates every derive (the vigilant-
    // attacker case is pinned in conditionGatedAnthem.test.js). The CARD still classifies body-only — its
    // "sacrifice … unless you pay {G}{W}{U}" upkeep clause is unmodeled — but the anthem descriptor is exact.
    const specs = parseStaticAbilities(ARCADES_SABBOTH).filter(s => s.affects?.mode === "dynamic");
    expect(specs).toHaveLength(1);
    expect(specs[0].op).toMatchObject({ layerOp: "ptModifyGated", power: 0, toughness: 2, gate: { kind: "notAttacking" } });
    expect(specs[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], untapped: true });
    expect(classifyCard(ARCADES_SABBOTH)).toBe("body-only");
  });
});
