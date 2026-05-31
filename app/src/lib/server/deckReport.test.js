/**
 * Tests for deckReport.js (F1) — the pure report composer + Markdown renderer.
 * No synced data needed: fixtures stand in for the rankDeckPower / legality /
 * cost / recommendation inputs the route resolves.
 */

import { describe, expect, it } from "vitest";

import {
  assessDeckLegality,
  buildDeckReport,
  renderDeckReportMarkdown,
} from "./deckReport.js";

const RANKER = {
  ready: true,
  powerLevel: 7,
  bracket: 3,
  bracketLabel: "Upgraded",
  bracketReason: "Compact combo + moderate tutors.",
  confidence: "medium",
  axes: { speed: 2, consistency: 2, interaction: 1, resilience: 2, manaQuality: 2 },
  attributeRatings: { speed: 6, consistency: 7, interaction: 5, resilience: 6, mana: 7 },
  friction: { score: 4, label: "medium" },
  inventory: {
    lands: 36, ramp: 10, draw: 9, removal: 8, wipes: 2, counters: 3, protection: 2,
    tutors: 4, recursion: 2, fastMana: 2, creatures: 25, averageManaValue: 3.1,
    colorSources: { W: 0, U: 12, B: 14, R: 9, G: 0 },
  },
  archetype: { primary: "midrange-value" },
  salt: { ready: true, sum: 12.3, count: 5, average: 2.46, topCards: [{ name: "Cyclonic Rift", salt: 3.2 }, { name: "Rhystic Study", salt: 2.9 }] },
  spellbook: {
    completeCombos: [{ cards: ["Thassa's Oracle", "Demonic Consultation"], produces: ["Win the game"] }],
    oneCardAway: [{ cards: ["Isochron Scepter", "Dramatic Reversal"], missingCard: "Dramatic Reversal", produces: ["Infinite mana"] }],
    gameChangers: ["Cyclonic Rift", "Demonic Tutor"],
    massLandDenial: [],
    extraTurns: ["Time Warp"],
  },
  commanderNames: ["Kess, Dissident Mage"],
  commanderColors: ["U", "B", "R"],
  totalCards: 100,
  drivers: ["compact combo"],
  constraints: ["light interaction"],
};

describe("assessDeckLegality", () => {
  it("passes a clean deck", () => {
    const r = assessDeckLegality(
      [{ name: "Sol Ring", commanderLegal: "legal", colorIdentity: [] }],
      ["U", "B", "R"],
    );
    expect(r.legal).toBe(true);
    expect(r.banned).toEqual([]);
    expect(r.colorViolations).toEqual([]);
  });

  it("flags banned, not-legal, and off-color-identity cards", () => {
    const r = assessDeckLegality(
      [
        { name: "Sol Ring", commanderLegal: "legal", colorIdentity: [] },
        { name: "Balance", commanderLegal: "banned", colorIdentity: ["W"] },
        { name: "Shahrazad", commanderLegal: "not_legal", colorIdentity: ["W"] },
        { name: "Llanowar Elves", commanderLegal: "legal", colorIdentity: ["G"] },
      ],
      ["U", "B", "R"],
    );
    expect(r.legal).toBe(false);
    expect(r.banned).toContain("Balance");
    expect(r.notLegal).toContain("Shahrazad");
    const offNames = r.colorViolations.map(v => v.name);
    expect(offNames).toContain("Llanowar Elves");
    expect(r.colorViolations.find(v => v.name === "Llanowar Elves").colors).toEqual(["G"]);
  });
});

describe("buildDeckReport", () => {
  it("returns not-ready when the ranker is not ready", () => {
    const r = buildDeckReport({ ranker: { ready: false } });
    expect(r.ready).toBe(false);
    expect(typeof r.reason).toBe("string");
  });

  it("assembles every section from the parts", () => {
    const legality = assessDeckLegality(
      [{ name: "Balance", commanderLegal: "banned", colorIdentity: ["W"] }],
      ["U", "B", "R"],
    );
    const cost = { ownedPct: 87, ownedCards: 87, totalCards: 100, costToFinish: 24.5, complete: false, missing: [{ name: "Mana Crypt", need: 1, unitPrice: 60 }] };
    const recs = { ready: true, cuts: [{ name: "Weak Card", reason: "low impact" }], adds: [{ role: "removal", have: 6, target: 10, suggestions: ["Swords to Plowshares"] }], completions: [{ missingCard: "Dramatic Reversal", pieces: ["Isochron Scepter"], produces: ["Infinite mana"] }] };

    const report = buildDeckReport({ deckName: "Kess Storm", ranker: RANKER, legality, cost, recs });
    expect(report.ready).toBe(true);
    expect(report.deck).toMatchObject({ name: "Kess Storm", commander: "Kess, Dissident Mage", colorIdentity: ["U", "B", "R"], archetype: "midrange-value" });
    expect(report.power).toMatchObject({ level: 7, bracket: 3, bracketLabel: "Upgraded", confidence: "medium" });
    expect(report.gameChangers).toContain("Cyclonic Rift");
    expect(report.composition.lands).toBe(36);
    expect(report.legality.legal).toBe(false);
    expect(report.combos.complete).toHaveLength(1);
    expect(report.combos.oneCardAway).toHaveLength(1);
    expect(report.salt.ready).toBe(true);
    expect(report.salt.top).toHaveLength(2);
    expect(report.collection.costToFinish).toBe(24.5);
    expect(report.recommendations.cuts).toHaveLength(1);
  });

  it("omits collection + recommendations cleanly when absent", () => {
    const report = buildDeckReport({ deckName: "X", ranker: RANKER, legality: null, cost: null, recs: null });
    expect(report.collection).toBeNull();
    expect(report.recommendations).toBeNull();
    expect(report.legality).toBeNull();
  });
});

describe("renderDeckReportMarkdown", () => {
  it("renders the full report with section headers and values", () => {
    const legality = assessDeckLegality(
      [{ name: "Balance", commanderLegal: "banned", colorIdentity: ["W"] }],
      ["U", "B", "R"],
    );
    const cost = { ownedPct: 87, ownedCards: 87, totalCards: 100, costToFinish: 24.5, complete: false, missing: [{ name: "Mana Crypt", need: 1, unitPrice: 60 }] };
    const report = buildDeckReport({ deckName: "Kess Storm", ranker: RANKER, legality, cost, recs: null });
    const md = renderDeckReportMarkdown(report);

    expect(md).toContain("# Deck Report: Kess Storm");
    expect(md).toContain("Kess, Dissident Mage");
    expect(md).toContain("## Power & bracket");
    expect(md).toMatch(/Bracket:\*\* 3/);
    expect(md).toContain("## Legality");
    expect(md).toContain("Balance");
    expect(md).toContain("## Combos");
    expect(md).toContain("Thassa's Oracle + Demonic Consultation");
    expect(md).toContain("Dramatic Reversal");
    expect(md).toContain("## From your collection");
    expect(md).toContain("$24.5");
    expect(md).toContain("Cyclonic Rift");
  });

  it("handles a not-ready report without throwing", () => {
    const md = renderDeckReportMarkdown({ ready: false, reason: "no data" });
    expect(md).toContain("# Deck Report");
    expect(md).toContain("no data");
  });

  it("renders a clean-legality deck as legal", () => {
    const legality = assessDeckLegality([{ name: "Sol Ring", commanderLegal: "legal", colorIdentity: [] }], ["U", "B", "R"]);
    const md = renderDeckReportMarkdown(buildDeckReport({ deckName: "Clean", ranker: RANKER, legality, cost: null, recs: null }));
    expect(md).toContain("✅ Legal");
  });
});
