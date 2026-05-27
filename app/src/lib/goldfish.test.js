/**
 * Tests for Garfield Goldfish v2 — classification, archetype detection,
 * London mulligan progression, runGoldfish smoke.
 *
 * Pure-function tests; no fs, no fetch, no React.
 */

import { describe, expect, it } from "vitest";
import { detectArchetype, runGoldfish, runGoldfishBatch } from "./goldfish.js";

// Helper to build a card-data map keyed by name.
function cardMap(...entries) {
  const out = {};
  for (const entry of entries) {
    out[entry.name] = entry;
  }
  return out;
}

// Minimal deck factory.
function makeDeck(commanderName, cards) {
  return {
    id: "test-deck",
    name: "Test deck",
    cards: [
      { name: commanderName, qty: 1, section: "Commander" },
      ...cards.map(c => ({ name: c.name, qty: c.qty, section: "Mainboard" })),
    ],
  };
}

describe("detectArchetype", () => {
  it("flags a token deck when 12+ token producers are present", () => {
    const tokenProducer = (name) => ({
      name, type: "Creature — Human", oracle: "When this enters the battlefield, create a 1/1 white Soldier creature token.", cmc: 3, mana: "{2}{W}",
    });
    const cards = Array.from({ length: 13 }, (_, i) => ({
      name: `Token Maker ${i}`, qty: 1,
    }));
    const data = cardMap(
      ...cards.map(c => tokenProducer(c.name)),
      { name: "Atraxa, Praetors' Voice", type: "Legendary Creature", oracle: "Flying", cmc: 4 },
    );
    // Pad the rest with lands so the deck has reasonable land count.
    for (let i = 0; i < 37; i++) cards.push({ name: `Plains-${i}`, qty: 1 });
    for (const c of cards) if (c.name.startsWith("Plains")) data[c.name] = { name: c.name, type: "Basic Land — Plains" };

    const deck = makeDeck("Atraxa, Praetors' Voice", cards);
    const result = detectArchetype(deck, data);
    expect(result.archetype).toBe("tokens");
    expect(result.confidence).toBeGreaterThan(50);
  });

  it("flags a control deck when counterspells + draw + wipes dominate", () => {
    const cards = [];
    const data = {};
    // 8 counterspells
    for (let i = 0; i < 8; i++) {
      const name = `Counter ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Instant", oracle: "Counter target spell.", cmc: 2, mana: "{1}{U}" };
    }
    // 6 board wipes
    for (let i = 0; i < 6; i++) {
      const name = `Wipe ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Sorcery", oracle: "Destroy all creatures.", cmc: 5, mana: "{3}{W}{W}" };
    }
    // 10 card draw spells
    for (let i = 0; i < 10; i++) {
      const name = `Draw ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Instant", oracle: "Draw three cards.", cmc: 4, mana: "{3}{U}" };
    }
    // 5 creatures (low count is the signal)
    for (let i = 0; i < 5; i++) {
      const name = `Creature ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Creature — Wizard", oracle: "Flying", cmc: 4, mana: "{3}{U}" };
    }
    // Lands
    for (let i = 0; i < 37; i++) {
      const name = `Island-${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Basic Land — Island", oracle: "{T}: Add {U}." };
    }
    data["Talrand, Sky Summoner"] = { name: "Talrand, Sky Summoner", type: "Legendary Creature — Merfolk Wizard", oracle: "Whenever you cast an instant or sorcery, create a 2/2 blue Drake.", cmc: 4 };

    const deck = makeDeck("Talrand, Sky Summoner", cards);
    const result = detectArchetype(deck, data);
    expect(result.archetype).toBe("control");
  });

  it("flags a voltron deck when equipment count is high and creature count is low", () => {
    const cards = [];
    const data = {};
    // 10 equipment
    for (let i = 0; i < 10; i++) {
      const name = `Sword ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2 and trample. Equip {2}", cmc: 3, mana: "{3}" };
    }
    // Only 6 creatures
    for (let i = 0; i < 6; i++) {
      const name = `Creature ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Creature — Human Soldier", oracle: "Vigilance", cmc: 3, mana: "{2}{W}" };
    }
    // Ramp + protection + lands to fill
    for (let i = 0; i < 8; i++) {
      const name = `Ramp ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Artifact", oracle: "{T}: Add {C}.", cmc: 2, mana: "{2}" };
    }
    for (let i = 0; i < 37; i++) {
      const name = `Plains-${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Basic Land — Plains" };
    }
    data["Sram, Senior Edificer"] = { name: "Sram, Senior Edificer", type: "Legendary Creature", oracle: "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.", cmc: 2 };

    const deck = makeDeck("Sram, Senior Edificer", cards);
    const result = detectArchetype(deck, data);
    expect(result.archetype).toBe("voltron");
  });

  it("falls back to midrange for a balanced deck", () => {
    const cards = [];
    const data = {};
    // ~22 creatures, mixed curve
    for (let i = 0; i < 22; i++) {
      const name = `Creature ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Creature — Human", oracle: "Vigilance", cmc: 3, mana: "{2}{W}" };
    }
    for (let i = 0; i < 5; i++) {
      const name = `Spell ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Instant", oracle: "Destroy target creature.", cmc: 3, mana: "{2}{B}" };
    }
    for (let i = 0; i < 37; i++) {
      const name = `Land-${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Land", oracle: "{T}: Add {C}." };
    }
    data["Atraxa, Praetors' Voice"] = { name: "Atraxa, Praetors' Voice", type: "Legendary Creature", oracle: "Flying, vigilance, deathtouch, lifelink", cmc: 4 };

    const deck = makeDeck("Atraxa, Praetors' Voice", cards);
    const result = detectArchetype(deck, data);
    expect(["midrange", "aggro"]).toContain(result.archetype); // balanced; either is acceptable
  });

  it("returns midrange for an empty deck", () => {
    const result = detectArchetype({ cards: [] }, {});
    expect(result.archetype).toBe("midrange");
    expect(result.confidence).toBe(0);
  });
});

describe("runGoldfish", () => {
  function buildSimpleDeck() {
    const cards = [];
    const data = {};

    // 36 basic lands
    for (let i = 0; i < 36; i++) {
      const name = `Plains-${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Basic Land — Plains", oracle: "{T}: Add {W}." };
    }
    // 8 ramp pieces
    for (let i = 0; i < 8; i++) {
      const name = `Signet ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Artifact", oracle: "{T}: Add two mana of any one color.", cmc: 2, mana: "{2}" };
    }
    // 6 draw spells
    for (let i = 0; i < 6; i++) {
      const name = `Draw ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Sorcery", oracle: "Draw three cards.", cmc: 4, mana: "{3}{U}" };
    }
    // 10 creatures
    for (let i = 0; i < 10; i++) {
      const name = `Creature ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Creature — Human", oracle: "Trample", cmc: 4, mana: "{3}{W}", keywords: ["Trample"] };
    }
    // 39 chaff to fill
    for (let i = 0; i < 39; i++) {
      const name = `Chaff ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Artifact", oracle: "", cmc: 5, mana: "{5}" };
    }
    data["Atraxa, Praetors' Voice"] = {
      name: "Atraxa, Praetors' Voice",
      type: "Legendary Creature — Phyrexian Angel Horror",
      oracle: "Flying, vigilance, deathtouch, lifelink",
      cmc: 4,
      mana: "{G}{W}{U}{B}",
      keywords: ["Flying", "Vigilance", "Deathtouch", "Lifelink"],
    };

    return { deck: makeDeck("Atraxa, Praetors' Voice", cards), data };
  }

  it("produces a valid 6-turn run with archetype tag", () => {
    const { deck, data } = buildSimpleDeck();
    const result = runGoldfish(deck, data);
    expect(result.turns).toHaveLength(6);
    expect(result.archetype).toBeDefined();
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.openingHand.length).toBeGreaterThanOrEqual(5);
    expect(result.openingHand.length).toBeLessThanOrEqual(7);
  });

  it("includes the archetype label in the summary", () => {
    const { deck, data } = buildSimpleDeck();
    const result = runGoldfish(deck, data);
    expect(result.summary).toContain(`archetype ${result.archetype}`);
  });

  it("reports bottomedFromMulligan when mulligans occur", () => {
    const { deck, data } = buildSimpleDeck();
    const result = runGoldfish(deck, data);
    expect(Array.isArray(result.bottomedFromMulligan)).toBe(true);
    if (result.mulligans > 0) {
      expect(result.bottomedFromMulligan.length).toBe(result.mulligans);
    } else {
      expect(result.bottomedFromMulligan.length).toBe(0);
    }
  });

  it("respects opening hand sizing — keep N = 7 - mulligans, min 5", () => {
    const { deck, data } = buildSimpleDeck();
    // Run 20 times to exercise random outcomes.
    for (let i = 0; i < 20; i++) {
      const result = runGoldfish(deck, data);
      const expected = Math.max(5, 7 - result.mulligans);
      expect(result.openingHand.length).toBe(expected);
    }
  });
});

describe("runGoldfishBatch", () => {
  it("returns an aggregated batch result", () => {
    const cards = [];
    const data = {};
    for (let i = 0; i < 36; i++) {
      const name = `Plains-${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Basic Land — Plains" };
    }
    for (let i = 0; i < 63; i++) {
      const name = `Filler ${i}`;
      cards.push({ name, qty: 1 });
      data[name] = { name, type: "Creature — Human", oracle: "Vigilance", cmc: 3, mana: "{2}{W}" };
    }
    data["Generic Commander"] = { name: "Generic Commander", type: "Legendary Creature", oracle: "Flying", cmc: 4 };

    const deck = makeDeck("Generic Commander", cards);
    const batch = runGoldfishBatch(deck, data, 5);
    expect(batch.count).toBe(5);
    expect(batch.runs).toHaveLength(5);
    expect(typeof batch.score).toBe("number");
    expect(batch.archetype).toBeDefined();
    expect(batch.summary).toContain(batch.archetype);
  });
});

describe("DFC handling", () => {
  it("uses the front face for classification", () => {
    const data = {
      "Delver of Secrets // Insectile Aberration": {
        name: "Delver of Secrets // Insectile Aberration",
        type: "Creature — Human Wizard // Creature — Human Insect",
        card_faces: [
          { name: "Delver of Secrets", type_line: "Creature — Human Wizard", oracle_text: "At the beginning of your upkeep, look at the top card of your library.", mana_cost: "{U}" },
          { name: "Insectile Aberration", type_line: "Creature — Human Insect", oracle_text: "Flying" },
        ],
        cmc: 1,
        mana: "{U}",
        keywords: ["Flying"],
      },
    };
    const deck = {
      cards: [
        { name: "Generic Commander", qty: 1, section: "Commander" },
        { name: "Delver of Secrets // Insectile Aberration", qty: 1, section: "Mainboard" },
        ...Array.from({ length: 36 }, (_, i) => ({ name: `Plains-${i}`, qty: 1, section: "Mainboard" })),
      ],
    };
    for (let i = 0; i < 36; i++) data[`Plains-${i}`] = { name: `Plains-${i}`, type: "Basic Land — Plains" };
    data["Generic Commander"] = { name: "Generic Commander", type: "Legendary Creature", oracle: "Flying", cmc: 4 };

    // Should not throw; archetype detection should see Delver as a 1-CMC creature.
    const result = detectArchetype(deck, data);
    expect(result.archetype).toBeDefined();
    expect(result.stats.creatures).toBeGreaterThan(0);
  });
});
