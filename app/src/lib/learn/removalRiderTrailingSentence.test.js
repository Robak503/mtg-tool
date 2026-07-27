/**
 * removalRiderTrailingSentence.test.js — RIDER-REMOVAL must tolerate a trailing sentence (census slice 15).
 *
 * matchRemovalControllerRider folds "Destroy target X. Its controller <rider>." into ONE removal atom
 * carrying a controllerRider. It was anchored to the END of the whole oracle, so a perfectly ordinary third
 * sentence — "Draw a card." on Cleansing Wildfire / Geomancer's Gambit / Price of Freedom — killed the match
 * and sent the card to the Arbiter, even though BOTH halves were individually modeled.
 *
 * The fix hands the trailing text back as `rest`, which parser.collapsed() already knew how to parse into
 * further atoms — and which already fails the whole program cleanly if any of it doesn't parse. No new
 * machinery; the matcher just stopped insisting it was the last thing on the card.
 *
 * FOUND BY THE CENSUS reporting "draw a card" as a SOLE blocker on 8 cards with zero co-blockers. Draw is
 * plainly modeled, so a cluster shaped like that is a bug signature rather than a coverage gap.
 */
import { describe, expect, it } from "vitest";

import { matchRemovalControllerRider } from "./effects/spanMatchers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

const LEAD = "Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.";

describe("the matcher returns the trailing sentence as rest", () => {
  it("no trailing sentence → rest is empty (unchanged behavior)", () => {
    const r = matchRemovalControllerRider(LEAD);
    expect(r.atom).toMatchObject({ op: "destroy", controllerRider: { kind: "rampBasic" } });
    expect(r.rest).toBe("");
  });

  it("a trailing sentence is handed back instead of blocking the match", () => {
    const r = matchRemovalControllerRider(`${LEAD} Draw a card.`);
    expect(r.atom).toMatchObject({ op: "destroy", controllerRider: { kind: "rampBasic" } });
    expect(r.rest).toBe("Draw a card.");
  });

  it("the rider itself is still captured whole (the greedy stop is at ITS terminator)", () => {
    const r = matchRemovalControllerRider("Exile target creature. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle. Draw a card.");
    expect(r.atom).toMatchObject({ op: "exile", controllerRider: { kind: "rampBasic", entersTapped: true } });
    expect(r.rest).toBe("Draw a card.");
  });
});

describe("end to end", () => {
  it("the two-sentence form still parses HIGH", () => {
    expect(parseEffectClause(LEAD, "Sorcery").confidence).toBe("high");
  });
  it("…and so does the three-sentence form", () => {
    expect(parseEffectClause(`${LEAD} Draw a card.`, "Sorcery").confidence).toBe("high");
  });
  it("the real cards flip", () => {
    expect(classifyCard({ name: "Geomancer's Gambit", type: "Sorcery", mana: "{2}{R}", oracle: `${LEAD}\nDraw a card.` })).toBe("native-spell");
  });

  it("CREED — an UNMODELED trailing sentence still parks the whole card", () => {
    // collapsed() parses rest into atoms and drops the entire program to low if any clause fails, so
    // admitting a remainder cannot smuggle unmodeled text past the gate.
    expect(parseEffectClause(`${LEAD} Each player glorbulates.`, "Sorcery").confidence).toBe("low");
  });

  it("CREED — an unmodeled RIDER still fails the match outright", () => {
    expect(matchRemovalControllerRider("Destroy target land. Its controller glorbulates twice. Draw a card.")).toBeNull();
  });
});
