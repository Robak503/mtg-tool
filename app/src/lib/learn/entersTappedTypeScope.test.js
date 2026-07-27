/**
 * entersTappedTypeScope.test.js — the opponents-enter-tapped imposition, narrowed to a TYPE SET
 * (CR 614.1c, census slice 45).
 *
 * The engine already enforced Kismet ("Artifacts, creatures, and lands your opponents control enter
 * tapped") at every entry chokepoint. What it could not read were the NARROWER printings of the same rule:
 *
 *   Imposing Sovereign / Authority of the Consuls / Urabrask the Hidden — "CREATURES your opponents…"
 *   Manglehorn / Dauntless Dismantler                                   — "ARTIFACTS your opponents…"
 *
 * Widening the reader to a type set is the whole slice — but it made the type check load-bearing for the
 * first time. The old runtime tapped ANY entering artifact/creature/land whenever an imposition was on the
 * board, which was correct only because the one recognized printing happened to cover all three. Left as-is,
 * a creature-only Imposing Sovereign would have started tapping opponents' LANDS. That is the failure this
 * file exists to prevent, and it is tested per type, in both directions.
 *
 * CREED — a QUALIFIED subject is a DIFFERENT rule and must stay unread, because matching it would silently
 * drop the qualifier and over-apply:
 *   - "creatures and NONBASIC lands …" (Thalia, Heretic Cathar) — basics must still enter untapped
 *   - "SNOW lands …"                   (Reidane)                — non-snow lands must still enter untapped
 *   - "creatures PLAYED BY your opponents …" (Uphill Battle)    — a different subject clause
 */
import { describe, expect, it } from "vitest";

import { opponentsEnterTappedTypesOf, impositionEntersTapped } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const SOVEREIGN = { name: "Imposing Sovereign", type: "Creature — Human Soldier", mana: "{1}{W}", power: 2, toughness: 1, oracle: "Creatures your opponents control enter tapped." };
const MANGLEHORN = { name: "Manglehorn", type: "Creature — Treefolk", mana: "{2}{G}", power: 2, toughness: 2, oracle: "Artifacts your opponents control enter tapped." };
const KISMET = { name: "Kismet", type: "Enchantment", mana: "{3}{W}", oracle: "Artifacts, creatures, and lands your opponents control enter tapped." };

const CREATURE = { id: "c1", name: "Grizzly Bears", type: "Creature — Bear" };
const LAND = { id: "l1", name: "Forest", type: "Basic Land — Forest" };
const ARTIFACT = { id: "a1", name: "Rock", type: "Artifact" };

/** `source` sits on the OPPONENT's battlefield; we ask whether OUR entering card is tapped by it. */
function taps(source, entering) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: "src", card: source, controller: "ai1", summoningSick: false });
  const st = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [perm] } } };
  return impositionEntersTapped(st, entering, "user");
}

describe("the type set is read off the printed line", () => {
  it("Kismet covers all three", () => {
    expect([...opponentsEnterTappedTypesOf(KISMET)].sort()).toEqual(["Artifact", "Creature", "Land"]);
  });

  it("Imposing Sovereign covers creatures only", () => {
    expect([...opponentsEnterTappedTypesOf(SOVEREIGN)]).toEqual(["Creature"]);
  });

  it("Manglehorn covers artifacts only", () => {
    expect([...opponentsEnterTappedTypesOf(MANGLEHORN)]).toEqual(["Artifact"]);
  });

  it("a card with no imposition reads null", () => {
    expect(opponentsEnterTappedTypesOf({ oracle: "Flying" })).toBeNull();
  });
});

describe("ENFORCEMENT — the imposition applies to its OWN types and no others", () => {
  it("Kismet taps all three", () => {
    expect(taps(KISMET, CREATURE)).toBe(true);
    expect(taps(KISMET, LAND)).toBe(true);
    expect(taps(KISMET, ARTIFACT)).toBe(true);
  });

  it("THE POINT — Imposing Sovereign taps a creature but NOT a land or an artifact", () => {
    // Before this slice the runtime ignored the type list entirely, so widening the reader without
    // narrowing the check would have had a creature-only card tapping opponents' lands.
    expect(taps(SOVEREIGN, CREATURE)).toBe(true);
    expect(taps(SOVEREIGN, LAND)).toBe(false);
    expect(taps(SOVEREIGN, ARTIFACT)).toBe(false);
  });

  it("and Manglehorn taps an artifact but NOT a creature", () => {
    expect(taps(MANGLEHORN, ARTIFACT)).toBe(true);
    expect(taps(MANGLEHORN, CREATURE)).toBe(false);
  });

  it("an ARTIFACT CREATURE is caught by either imposition — the type line carries both", () => {
    const artCreature = { id: "ac", name: "Ornithopter", type: "Artifact Creature — Thopter" };
    expect(taps(SOVEREIGN, artCreature)).toBe(true);
    expect(taps(MANGLEHORN, artCreature)).toBe(true);
  });

  it("it never taxes the CONTROLLER's own permanents — 'your opponents' is directional", () => {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "src", card: SOVEREIGN, controller: "ai1", summoningSick: false });
    const st = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [perm] } } };
    expect(impositionEntersTapped(st, CREATURE, "ai1")).toBe(false);
  });
});

describe("CREED — a qualified subject is a different rule and stays unread", () => {
  it("'creatures and NONBASIC lands' (Thalia, Heretic Cathar)", () => {
    const thalia = { ...SOVEREIGN, name: "Thalia, Heretic Cathar", oracle: "Creatures and nonbasic lands your opponents control enter tapped." };
    expect(opponentsEnterTappedTypesOf(thalia)).toBeNull();
    expect(classifyCard(thalia)).not.toMatch(/^native/);
    expect(taps(thalia, LAND)).toBe(false);   // and it imposes NOTHING rather than half the rule
  });

  it("'SNOW lands' (Reidane)", () => {
    const reidane = { ...SOVEREIGN, name: "Reidane", oracle: "Snow lands your opponents control enter tapped." };
    expect(opponentsEnterTappedTypesOf(reidane)).toBeNull();
    expect(taps(reidane, LAND)).toBe(false);
  });

  it("'creatures PLAYED BY your opponents' (Uphill Battle) — a different subject clause", () => {
    const uphill = { ...SOVEREIGN, name: "Uphill Battle", oracle: "Creatures played by your opponents enter tapped." };
    expect(opponentsEnterTappedTypesOf(uphill)).toBeNull();
  });
});

describe("classification", () => {
  it("the narrower carriers now flip", () => {
    expect(classifyCard(SOVEREIGN)).toMatch(/^native/);
    expect(classifyCard(MANGLEHORN)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...SOVEREIGN, oracle: `${SOVEREIGN.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
