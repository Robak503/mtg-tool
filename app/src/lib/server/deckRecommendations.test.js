import { describe, expect, it } from "vitest";

import { recommendForDeck } from "./deckRecommendations";

function baseRanker(overrides = {}) {
  return {
    ready: true,
    commanderNames: ["Atraxa, Praetors' Voice"],
    commanderColors: ["W", "U", "B", "G"],
    inventory: { ramp: 4, draw: 3, removal: 2, wipes: 0, protection: 6, lands: 36 },
    spellbook: {
      oneCardAway: [
        { cards: ["Thassa's Oracle", "Demonic Consultation"], missingCard: "Demonic Consultation", produces: ["Win the game"] },
      ],
    },
    efficiencyMetrics: { lowImpactCards: [{ name: "Weak Filler", impact: 1.2 }] },
    salt: { topCards: [{ name: "Rhystic Study", salt: 3.1 }, { name: "Mild Card", salt: 1.0 }] },
    landAssessment: { issues: [] },
    ...overrides,
  };
}

// Stub search: returns a fixed staple list per query; ignores the limit detail.
const search = (query) => {
  if (query.includes("mana")) return ["Sol Ring", "Arcane Signet", "Cultivate"];
  if (query.includes("draw")) return ["Rhystic Study", "Sylvan Library"]; // Rhystic Study is "owned" below
  if (query.includes("destroy target")) return ["Swords to Plowshares", "Beast Within"];
  return [];
};

describe("recommendForDeck", () => {
  it("returns ready:false for a non-ready ranker", () => {
    expect(recommendForDeck({ ranker: { ready: false }, search }).ready).toBe(false);
  });

  it("suggests adds only for roles below target", () => {
    const recs = recommendForDeck({ ranker: baseRanker(), deckNames: [], search });
    const roles = recs.adds.map(a => a.role);
    // protection (6 >= 4) is covered; ramp/draw/removal/wipes are under target.
    expect(roles.some(r => /Protection/.test(r))).toBe(false);
    expect(roles.some(r => /Ramp/.test(r))).toBe(true);
    const ramp = recs.adds.find(a => /Ramp/.test(a.role));
    expect(ramp.suggestions).toContain("Sol Ring");
  });

  it("excludes cards already in the deck from suggestions", () => {
    const recs = recommendForDeck({ ranker: baseRanker(), deckNames: ["Rhystic Study"], search });
    const draw = recs.adds.find(a => /Card draw/.test(a.role));
    expect(draw.suggestions).not.toContain("Rhystic Study");
    expect(draw.suggestions).toContain("Sylvan Library");
  });

  it("surfaces one-card-away combo completions", () => {
    const recs = recommendForDeck({ ranker: baseRanker(), deckNames: [], search });
    expect(recs.completions).toHaveLength(1);
    expect(recs.completions[0].missingCard).toBe("Demonic Consultation");
    expect(recs.completions[0].pieces).toEqual(["Thassa's Oracle"]);
  });

  it("lists cut candidates from low-impact cards and high-salt (>=2) cards only", () => {
    const recs = recommendForDeck({ ranker: baseRanker(), deckNames: ["Rhystic Study", "Mild Card", "Weak Filler"], search });
    const names = recs.cuts.map(c => c.name);
    expect(names).toContain("Weak Filler");
    expect(names).toContain("Rhystic Study");
    expect(names).not.toContain("Mild Card"); // salt 1.0 < 2 threshold
  });

  it("notes a low land count", () => {
    const recs = recommendForDeck({ ranker: baseRanker({ inventory: { lands: 32 } }), deckNames: [], search });
    expect(recs.notes.some(n => /lands/i.test(n))).toBe(true);
  });
});
