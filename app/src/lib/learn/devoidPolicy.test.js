/**
 * devoidPolicy.test.js — BLITZ DV-1: the DEVOID policy, correctness-first (CR 702.114).
 *
 * Devoid is a CHARACTERISTIC-DEFINING ability (layer 1): the card is colorless in EVERY zone. Two facets:
 *
 *  (1) CREDIT — a standalone "Devoid (This card has no color.)" keyword line carries NO parseable atom and
 *      has ZERO effect on a spell's resolution. Before DV-1 it dragged an otherwise-HIGH instant/sorcery body
 *      to LOW (a residue clause), exactly like an un-stripped Storm line. parseEffectProgram now strips the
 *      whole devoid line (stripDevoidLine), so the body parses on its own — flipping 8 census spells to
 *      native-spell. The runtime cast path + the classifier both parse through parseEffectProgram, so they
 *      agree on the devoid-free body (no metric-vs-runtime drift — the CREED).
 *
 *  (2) CORRECTNESS — every color chokepoint (colorsOf / colorsOfSpell / permanentColors + the cast-time
 *      sourceColors) reads the card's colors:[] first. Real devoid cards carry Scryfall's baked colors:[], so
 *      the runtime was ALREADY colorless-correct; colorsOf's devoid guard hardens the fallback (a fixture that
 *      lacks a colors array) so a devoid {2}{B} spell is never mis-derived as black. Consequence: a devoid
 *      {2}{B} spell can target a creature with protection from black (it is colorless, CR 702.16b).
 *
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { colorsOf } from "./layers.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { createPermanent } from "./gameState.js";

describe("DV-1 — devoid CREDIT (the keyword line no longer parks an otherwise-HIGH spell)", () => {
  it("flips the census devoid spells whose body is fully modeled → native-spell", () => {
    const spell = (name, type, mana, oracle) =>
      classifyCard({ id: name, name, type, mana, colors: [], oracle });
    // single-target removal / power-filtered exile
    expect(spell("Complete Disregard", "Instant", "{2}{B}",
      "Devoid (This card has no color.)\nExile target creature with power 3 or less.")).toBe("native-spell");
    expect(spell("Oblivion Strike", "Sorcery", "{3}{B}",
      "Devoid (This card has no color.)\nExile target creature.")).toBe("native-spell");
    // counter + exile-instead rider
    expect(spell("Void Shatter", "Instant", "{1}{U}{U}",
      "Devoid (This card has no color.)\nCounter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.")).toBe("native-spell");
    expect(spell("Spell Shrivel", "Instant", "{2}{U}",
      "Devoid (This card has no color.)\nCounter target spell unless its controller pays {4}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.")).toBe("native-spell");
    // multi-clause bodies (unblockable + draw; token-making counter/tap)
    expect(spell("Slip Through Space", "Sorcery", "{U}",
      "Devoid (This card has no color.)\nTarget creature can't be blocked this turn.\nDraw a card.")).toBe("native-spell");
    expect(spell("Abstruse Interference", "Instant", "{2}{U}",
      "Devoid (This card has no color.)\nCounter target spell unless its controller pays {1}. You create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\" ({C} represents colorless mana.)")).toBe("native-spell");
    expect(spell("Adverse Conditions", "Instant", "{3}{U}",
      "Devoid (This card has no color.)\nTap up to two target creatures. Those creatures don't untap during their controller's next untap step. Create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\"")).toBe("native-spell");
    expect(spell("Unfathomable Truths", "Instant", "{4}{U}",
      "Devoid (This card has no color.)\nDraw three cards and create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"")).toBe("native-spell");
  });

  it("a damage devoid spell already parsed HIGH (global matcher) and stays native-spell", () => {
    // Reality Hemorrhage was never blocked by the devoid line (the deal-damage matcher is global); the strip
    // is byte-identical for it — a regression guard that stripDevoidLine changed nothing for the already-native set.
    expect(classifyCard({ id: "rh", name: "Reality Hemorrhage", type: "Instant", mana: "{1}{R}", colors: [],
      oracle: "Devoid (This card has no color.)\nReality Hemorrhage deals 2 damage to any target." })).toBe("native-spell");
  });

  it("FN guards: a devoid spell whose BODY is unmodeled stays on the Arbiter (whole-card law)", () => {
    // Consuming Sinkhole — a devoid MODAL spell (one mode is a land-creature exile); the modal body is not
    // native, so stripping the devoid line must NOT fabricate a native credit. The strip is CREED-safe: a LOW
    // body stays LOW → arbiter-spell.
    expect(classifyCard({ id: "cs", name: "Consuming Sinkhole", type: "Instant", mana: "{3}{R}", colors: [],
      oracle: "Devoid (This card has no color.)\nChoose one —\n• Exile target land creature.\n• Consuming Sinkhole deals 4 damage to target player or planeswalker." })).toBe("arbiter-spell");
    // A devoid CREATURE whose non-keyword text is unmodeled (power-defining static + Ingest) stays body-only —
    // the devoid keyword is credited (COVERED_KEYWORDS) but the whole-card gate keeps the residue parked.
    expect(classifyCard({ id: "va", name: "Vile Aggregate", type: "Creature — Eldrazi Drone", power: "0", toughness: "4", mana: "{2}{R}", colors: [],
      oracle: "Devoid (This card has no color.)\nVile Aggregate's power is equal to the number of colorless creatures you control.\nTrample\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)" })).toBe("body-only");
  });
});

describe("DV-1 — devoid CORRECTNESS (colorless in every zone; the color chokepoint honors it)", () => {
  it("colorsOf is colorless for a devoid card — both the baked colors:[] path and the fallback guard", () => {
    // Real card: Scryfall bakes colors:[] (the array path).
    expect(colorsOf({ name: "Complete Disregard", mana: "{2}{B}", colors: [], keywords: ["Devoid"] })).toEqual([]);
    // Fallback path (a fixture lacking a colors array): the devoid guard forces colorless instead of deriving
    // ["B"] from the {2}{B} cost — via the Scryfall keyword...
    expect(colorsOf({ name: "Complete Disregard", mana: "{2}{B}", keywords: ["Devoid"] })).toEqual([]);
    // ...and via a whole-line oracle match (no keywords array).
    expect(colorsOf({ name: "Oblivion Strike", mana: "{3}{B}", oracle: "Devoid (This card has no color.)\nExile target creature." })).toEqual([]);
  });

  it("the devoid guard is ANCHORED — a non-devoid card that merely references 'devoid' keeps its pip colors", () => {
    // "gains devoid" mid-line is a GRANT reference, not the keyword: this card is genuinely red, so its
    // fallback colors must derive from the {2}{R} cost (the anchor never over-matches).
    expect(colorsOf({ name: "Ref", mana: "{2}{R}", oracle: "Target creature gains devoid until end of turn." })).toEqual(["R"]);
  });

  it("runtime end-to-end: a devoid {2}{B} spell can target a creature with protection from black", () => {
    const protPerm = createPermanent({ card: { id: "pal", name: "Paladin", power: 2, toughness: 2, type_line: "Creature", oracle: "Protection from black" }, controller: "ai" });
    const state = { players: { user: { battlefield: [] }, ai: { battlefield: [protPerm] } } };
    const devoidBlackSpell = { name: "Complete Disregard", type: "Instant", mana: "{2}{B}", keywords: ["Devoid"],
      oracle: "Devoid (This card has no color.)\nExile target creature with power 3 or less." };
    // The cast path derives sourceColors from colorsOf(card) — colorless for a devoid spell — so protection
    // from black (a color-quality restriction, CR 702.16b) does NOT apply: the creature IS targetable.
    expect(colorsOf(devoidBlackSpell)).toEqual([]);
    expect(canBeTargetedBy(state, protPerm, "ai", "user", colorsOf(devoidBlackSpell))).toBe(true);
    // Control: a GENUINELY black {2}{B} spell (not devoid) is stopped by protection from black.
    const blackSpell = { name: "Doom Blade", type: "Instant", mana: "{2}{B}", oracle: "Destroy target nonblack creature." };
    expect(colorsOf(blackSpell)).toEqual(["B"]);
    expect(canBeTargetedBy(state, protPerm, "ai", "user", colorsOf(blackSpell))).toBe(false);
  });
});
