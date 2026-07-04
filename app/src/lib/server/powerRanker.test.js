/**
 * powerRanker — coverage for the deterministic deck-power evaluator.
 *
 * powerRanker.js is the largest module in the codebase (~1165 lines) and had
 * zero tests. It is the local, no-API deck scorer that Karn and Tibalt rely on,
 * and `formatPowerRankingForPrompt` is the exact text fed to those agents — so a
 * silent crash or shape drift here corrupts every deck analysis.
 *
 * These tests are deterministic and hermetic: the three data modules
 * (cardIndex, edhrecSalt, spellbook) are mocked with their documented
 * not-ready shapes, which is precisely the FIRST-LAUNCH state (before any data
 * sync). So this both gives the module a safety net and proves it degrades
 * gracefully when no bundled data is present, instead of throwing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupCardMock, oracleTextMock, findCombosMock, estimateBracketMock } = vi.hoisted(() => ({
  lookupCardMock: vi.fn(() => null),
  oracleTextMock: vi.fn(() => ""),
  findCombosMock: vi.fn(),
  estimateBracketMock: vi.fn(),
}));

vi.mock("./cardIndex.js", () => ({
  lookupCard: lookupCardMock,
  oracleText: oracleTextMock,
  normalizeName: (n) => String(n || "").toLowerCase().trim(),
}));

// First-launch / no-sync shapes (verbatim from edhrecSalt.js + spellbook.js).
vi.mock("./edhrecSalt.js", () => ({
  evaluateDeckSalt: () => ({ ready: false, count: 0, sum: 0, average: 0, topCards: [] }),
  lookupSalt: () => null,
}));
vi.mock("./spellbook.js", () => ({
  findCombos: findCombosMock,
  estimateBracket: estimateBracketMock,
}));

import { rankDeckPower, formatPowerRankingForPrompt } from "./powerRanker.js";

beforeEach(() => {
  lookupCardMock.mockReset().mockReturnValue(null);
  oracleTextMock.mockReset().mockReturnValue("");
  // Defaults = the first-launch / no-sync shapes the static mocks used before.
  findCombosMock.mockReset().mockReturnValue({ included: [], almostIncluded: [], ready: false });
  estimateBracketMock.mockReset().mockReturnValue({
    bracketTag: "unknown",
    bracketLabel: "Unknown",
    gameChangers: [],
    massLandDenial: [],
    extraTurns: [],
    combosFound: 0,
    ready: false,
  });
});

/**
 * Registers a name -> card fixture map on the cardIndex mocks.
 * oracle_text rides on the fixture; oracleText() returns it like the real
 * helper resolves a card's text.
 */
function useFixtures(cardsByName) {
  lookupCardMock.mockImplementation((name) => cardsByName[name] || null);
  oracleTextMock.mockImplementation((card) => card?.oracle_text || "");
}

describe("rankDeckPower — first-launch degradation (no bundled data)", () => {
  const names = Array.from({ length: 99 }, (_, i) => `Card ${i + 1}`);

  it("returns a well-formed result instead of throwing when nothing resolves", () => {
    const result = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });

    expect(result.ready).toBe(true);
    expect(result.powerLevel).toBeGreaterThanOrEqual(1);
    expect(result.powerLevel).toBeLessThanOrEqual(10);
    expect(result.bracket).toBeGreaterThanOrEqual(1);
    expect(result.bracket).toBeLessThanOrEqual(5);
    expect(typeof result.confidence).toBe("string");
    expect(typeof result.formatted).toBe("string");
    expect(result.formatted.length).toBeGreaterThan(0);
  });

  it("reports every unresolved card name (the import-quality signal)", () => {
    const result = rankDeckPower({ cardNames: names });
    // unresolvedCards is capped for display but the count tracks all of them.
    expect(result.unresolvedCards.length).toBeGreaterThan(0);
    expect(result.unresolvedCards).toContain("Card 1");
  });

  it("is deterministic — identical input yields identical scoring", () => {
    const a = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });
    const b = rankDeckPower({ cardNames: names, commanderNames: ["Some Commander"] });
    expect(b.powerLevel).toBe(a.powerLevel);
    expect(b.bracket).toBe(a.bracket);
    expect(b.formatted).toBe(a.formatted);
  });
});

describe("rankDeckPower — classification + sectioning", () => {
  it("counts lands by type line (qty-weighted)", () => {
    lookupCardMock.mockImplementation((name) =>
      name === "Island" ? { name: "Island", type_line: "Basic Land — Island", cmc: 0 } : null,
    );
    const result = rankDeckPower({ entries: [{ qty: 35, name: "Island", section: "Mainboard" }] });
    expect(result.inventory.lands).toBe(35);
    expect(result.totalCards).toBe(35);
  });

  it("excludes sideboard / maybeboard sections from the count", () => {
    const result = rankDeckPower({
      entries: [
        { qty: 10, name: "Main Card", section: "Mainboard" },
        { qty: 5, name: "SB Card", section: "Sideboard" },
        { qty: 3, name: "Maybe Card", section: "Maybeboard" },
      ],
    });
    expect(result.totalCards).toBe(10);
  });
});

describe("formatPowerRankingForPrompt", () => {
  it("renders the key headers for a ready result", () => {
    const result = rankDeckPower({ cardNames: ["A", "B", "C"] });
    const text = formatPowerRankingForPrompt(result);
    expect(text).toContain("LOCAL POWER RANKING");
    expect(text).toContain("Power Level:");
    expect(text).toContain("Commander Bracket:");
    expect(text).toContain("deterministic - no API cost");
  });

  it("returns an empty string for a non-ready / missing result", () => {
    expect(formatPowerRankingForPrompt({ ready: false })).toBe("");
    expect(formatPowerRankingForPrompt(undefined)).toBe("");
    expect(formatPowerRankingForPrompt(null)).toBe("");
  });
});

describe("X-cost floor — X counts as at least 1 for cost evaluation", () => {
  it("floors X at 1 in averageManaValue (an X spell is never cast for 0)", () => {
    useFixtures({
      Fireball: {
        name: "Fireball",
        type_line: "Sorcery",
        cmc: 1,
        mana_cost: "{X}{R}",
        oracle_text: "Fireball deals X damage divided evenly, rounded down, among any number of targets.",
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Fireball" }] });
    // Raw Scryfall cmc is 1 ({X} counts 0); the ranker's curve must see 2.
    expect(result.inventory.averageManaValue).toBe(2);
  });

  it("excludes X-cost draw spells from the cheap-cantrip gate", () => {
    useFixtures({
      "Mind Spring": {
        name: "Mind Spring",
        type_line: "Sorcery",
        cmc: 2,
        mana_cost: "{X}{U}{U}",
        oracle_text: "Draw X cards.",
      },
      Ponder: {
        name: "Ponder",
        type_line: "Sorcery",
        cmc: 1,
        mana_cost: "{U}",
        oracle_text: "Look at the top three cards of your library, then put them back in any order. You may shuffle your library. Draw a card.",
      },
    });
    const result = rankDeckPower({
      entries: [
        { qty: 1, name: "Mind Spring" },
        { qty: 1, name: "Ponder" },
      ],
    });
    // Mind Spring floors to 3 mana ({X}{U}{U}) — only Ponder is a cheap cantrip.
    expect(result.inventory.cheapCantrips).toBe(1);
  });

  it("uses the X-floored cost for ramp weight tiers", () => {
    useFixtures({
      "Astral Cornucopia": {
        name: "Astral Cornucopia",
        type_line: "Artifact",
        cmc: 0,
        mana_cost: "{X}{X}{X}",
        oracle_text: "Astral Cornucopia enters the battlefield with X charge counters on it. {T}: Choose a color. Add one mana of that color for each charge counter on it.",
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Astral Cornucopia" }] });
    // Floored cost 3 ({X}{X}{X}) lands in the 3-mana ramp tier (0.45 -> 0.5
    // after the inventory's round1), not the <=1 tier that raw cmc 0 would
    // have claimed (0.85 -> 0.9).
    expect(result.inventory.rampWeight).toBe(0.5);
  });

  it("still assumes X=5 for name-listed staples like Exsanguinate, while the curve floors it at X=1", () => {
    useFixtures({
      Exsanguinate: {
        name: "Exsanguinate",
        type_line: "Sorcery",
        cmc: 1,
        mana_cost: "{X}{B}",
        oracle_text: "Each opponent loses X life. You gain life equal to the life lost this way.",
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Exsanguinate" }] });
    // Impact model: 1 + assumedX 5 = 6 ("what you'd typically pay").
    expect(result.efficiencyMetrics.topImpactCards[0].effectiveManaValue).toBe(6);
    // Cost model: 1 + X floor 1 = 2 ("minimum real cost").
    expect(result.inventory.averageManaValue).toBe(2);
  });

  it("no longer bumps a random 'each opponent' X card to assumedX 5", () => {
    useFixtures({
      "Vermin Tithe": {
        name: "Vermin Tithe",
        type_line: "Sorcery",
        cmc: 1,
        mana_cost: "{X}{B}",
        oracle_text: "Each opponent sacrifices a creature.",
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Vermin Tithe" }] });
    // Default assumedX 3 -> 1 + 3 = 4. The old text-pattern match on
    // "each opponent" priced this at 1 + 5 = 6.
    expect(result.efficiencyMetrics.topImpactCards[0].effectiveManaValue).toBe(4);
  });

  it("does not count a back-face {X} on MDFCs (front face only)", () => {
    useFixtures({
      "Bolt Strike // Surge Chasm": {
        name: "Bolt Strike // Surge Chasm",
        type_line: "Instant // Sorcery",
        layout: "modal_dfc",
        cmc: 2,
        card_faces: [
          { mana_cost: "{1}{R}", type_line: "Instant", oracle_text: "Bolt Strike deals 3 damage to any target." },
          { mana_cost: "{X}{R}", type_line: "Sorcery", oracle_text: "Surge Chasm deals X damage to each creature." },
        ],
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Bolt Strike // Surge Chasm" }] });
    // Front face has no {X}: neither the curve nor the impact model may
    // inflate the cost. (The old manaCostText() joined every face's cost.)
    expect(result.inventory.averageManaValue).toBe(2);
    expect(result.efficiencyMetrics.topImpactCards[0].effectiveManaValue).toBe(2);
  });

  it("still counts a front-face {X} on MDFCs", () => {
    useFixtures({
      "Wild Bloom // Bloom Glade": {
        name: "Wild Bloom // Bloom Glade",
        type_line: "Sorcery // Land",
        layout: "modal_dfc",
        cmc: 1,
        card_faces: [
          { mana_cost: "{X}{G}", type_line: "Sorcery", oracle_text: "Create X 1/1 green Insect creature tokens." },
          { mana_cost: "", type_line: "Land", oracle_text: "Bloom Glade enters the battlefield tapped. {T}: Add {G}." },
        ],
      },
    });
    const result = rankDeckPower({ entries: [{ qty: 1, name: "Wild Bloom // Bloom Glade" }] });
    expect(result.inventory.averageManaValue).toBe(2);
  });
});

describe("combo cost gating uses X-floored mana values", () => {
  it("prices {X}{X} combo pieces at X=1 each, moving a Ballista line past the early gate", () => {
    useFixtures({
      "Walking Ballista": {
        name: "Walking Ballista",
        type_line: "Artifact Creature — Construct",
        cmc: 0,
        mana_cost: "{X}{X}",
        oracle_text: "Walking Ballista enters the battlefield with X +1/+1 counters on it. {4}: Put a +1/+1 counter on Walking Ballista. Remove a +1/+1 counter from Walking Ballista: It deals 1 damage to any target.",
      },
      "Mikaeus, the Unhallowed": {
        name: "Mikaeus, the Unhallowed",
        type_line: "Legendary Creature — Zombie Cleric",
        cmc: 6,
        mana_cost: "{3}{B}{B}{B}",
        oracle_text: "Intimidate. Other non-Human creatures you control get +1/+1 and have undying.",
      },
    });
    findCombosMock.mockReturnValue({
      included: [{ cards: ["Walking Ballista", "Mikaeus, the Unhallowed"], cardCount: 2, produces: ["Infinite damage"] }],
      almostIncluded: [],
      ready: true,
    });
    const result = rankDeckPower({
      entries: [
        { qty: 1, name: "Walking Ballista" },
        { qty: 1, name: "Mikaeus, the Unhallowed" },
      ],
    });
    // Ballista is {X}{X} cmc 0 -> floors to 2; 2 + 6 = 8. Raw cmc summed to 6,
    // which wrongly cleared the totalManaValue <= 7 early-combo gate.
    expect(result.spellbook.completeCombos[0].totalManaValue).toBe(8);
    expect(result.spellbook.completeCombos[0].early).toBe(false);
    expect(result.spellbook.earlyGameCombos).toBe(0);
  });
});

describe("interaction axis tiers", () => {
  const murder = {
    name: "Murder",
    type_line: "Instant",
    cmc: 3,
    mana_cost: "{1}{B}{B}",
    oracle_text: "Destroy target creature.",
  };
  const forceOfWill = {
    name: "Force of Will",
    type_line: "Instant",
    cmc: 5,
    mana_cost: "{3}{U}{U}",
    oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.",
  };

  it("awards the top tier (3) at 14+ total interaction", () => {
    useFixtures({ Murder: murder });
    const result = rankDeckPower({ entries: [{ qty: 14, name: "Murder" }] });
    // Was a `? 2 : ... ? 2` typo: 14+ scored the same as 9+.
    expect(result.axes.interaction).toBe(3);
  });

  it("awards tier 2 at 9-13 total interaction", () => {
    useFixtures({ Murder: murder });
    const result = rankDeckPower({ entries: [{ qty: 9, name: "Murder" }] });
    expect(result.axes.interaction).toBe(2);
  });

  it("one free-interaction piece cannot undercut a deck that also clears the 14+ tier", () => {
    useFixtures({ Murder: murder, "Force of Will": forceOfWill });
    const result = rankDeckPower({
      entries: [
        { qty: 13, name: "Murder" },
        { qty: 1, name: "Force of Will" },
      ],
    });
    // 13 removal + 1 counter = 14 total; freeInteraction 1 alone is tier 2.
    // Math.max keeps this at 3 instead of letting the free tier short-circuit.
    expect(result.axes.interaction).toBe(3);
  });
});

describe("parseDeckText section headers", () => {
  it("recognizes colon-suffixed headers like 'Commander:'", () => {
    const result = rankDeckPower({
      deckText: "Commander:\n1 Some Legend\n\nDeck:\n35 Forest\n",
    });
    // The old header regex could never match "Commander:" even though the
    // code stripped a trailing colon right after — the commander was silently
    // treated as a mainboard card.
    expect(result.commanderNames).toEqual(["Some Legend"]);
    expect(result.totalCards).toBe(36);
  });
});
