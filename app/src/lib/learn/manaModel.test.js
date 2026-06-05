/**
 * Tests for manaModel.js — mana production, available sources, and payment
 * planning. This is the module that makes the learn engine castable; before
 * it, manaPool was never filled and nothing was ever castable.
 */

import { describe, expect, it } from "vitest";
import { manaProduction, manaSources, canAfford, planPayment } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";

function lib(card) {
  return { id: card.id || `c-${card.name}`, ...card };
}

function bf(perms) {
  return { players: { user: { battlefield: perms } } };
}

function permanent(card, { id, tapped = false, summoningSick = false } = {}) {
  return { id: id || `perm-${card.name}`, card: lib(card), tapped, summoningSick };
}

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

// ─── manaProduction ──────────────────────────────────────────────────────────

describe("manaProduction", () => {
  it("reads basic lands by name", () => {
    expect(manaProduction({ name: "Forest", type: "Basic Land — Forest" })).toEqual({ colors: ["G"], amount: 1 });
    expect(manaProduction({ name: "Island", type: "Basic Land — Island" })).toEqual({ colors: ["U"], amount: 1 });
    expect(manaProduction({ name: "Wastes", type: "Basic Land" })).toEqual({ colors: ["C"], amount: 1 });
  });

  it("strips the Snow-Covered prefix", () => {
    expect(manaProduction({ name: "Snow-Covered Mountain", type: "Basic Snow Land — Mountain" }))
      .toEqual({ colors: ["R"], amount: 1 });
  });

  it("knows iconic rocks that produce more than one mana", () => {
    expect(manaProduction({ name: "Sol Ring", type: "Artifact" })).toEqual({ colors: ["C"], amount: 2 });
    expect(manaProduction({ name: "Mana Crypt", type: "Artifact" })).toEqual({ colors: ["C"], amount: 2 });
  });

  it("parses a single-color Add clause from oracle text", () => {
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }))
      .toEqual({ colors: ["G"], amount: 1 });
  });

  it("treats 'or' in an Add clause as a color choice (amount 1)", () => {
    expect(manaProduction({ name: "Azorius Guildgate", type: "Land — Gate", oracle: "{T}: Add {W} or {U}." }))
      .toEqual({ colors: ["W", "U"], amount: 1 });
  });

  it("treats concatenated same-color symbols as amount = count", () => {
    expect(manaProduction({ name: "Worn Powerstone", type: "Artifact", oracle: "{T}: Add {C}{C}." }))
      .toEqual({ colors: ["C"], amount: 2 });
  });

  it("reads 'any color' as all five colors", () => {
    expect(manaProduction({ name: "Command Tower", type: "Land", oracle: "{T}: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });

  it("returns null for a non-mana permanent", () => {
    expect(manaProduction({ name: "Grizzly Bears", type: "Creature — Bear", oracle: "" })).toBeNull();
    expect(manaProduction({ name: "Oblivion Ring", type: "Enchantment", oracle: "Add a +1/+1 counter? no." })).toBeNull();
  });

  it("falls back to colorless for an unparseable land", () => {
    expect(manaProduction({ name: "Mysterious Nonbasic", type: "Land", oracle: "" }))
      .toEqual({ colors: ["C"], amount: 1 });
  });
});

// ─── manaSources ─────────────────────────────────────────────────────────────

describe("manaSources", () => {
  it("lists untapped mana permanents, excluding tapped ones", () => {
    const state = bf([
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f1" }),
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f2", tapped: true }),
    ]);
    const sources = manaSources(state, "user");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ permanentId: "f1", colors: ["G"], amount: 1 });
  });

  it("excludes a summoning-sick mana dork but not a rock", () => {
    const state = bf([
      permanent({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }, { id: "elf", summoningSick: true }),
      permanent({ name: "Mind Stone", type: "Artifact" }, { id: "rock", summoningSick: true }),
    ]);
    const sources = manaSources(state, "user");
    expect(sources.map(s => s.permanentId)).toEqual(["rock"]);
  });

  it("includes a hasty mana dork even while summoning sick", () => {
    const state = bf([
      permanent(
        { name: "Hasty Druid", type: "Creature — Druid", oracle: "Haste\n{T}: Add {G}.", keywords: ["Haste"] },
        { id: "hd", summoningSick: true },
      ),
    ]);
    expect(manaSources(state, "user").map(s => s.permanentId)).toEqual(["hd"]);
  });
});

// ─── planPayment / canAfford ─────────────────────────────────────────────────

const G = (s) => parseManaCost(s);

describe("planPayment / canAfford", () => {
  it("pays from a pre-filled pool with zero taps (pool-first)", () => {
    const plan = planPayment({ ...EMPTY_POOL, G: 1 }, [], G("{G}"));
    expect(plan).toEqual({ taps: [] });
    expect(canAfford({ ...EMPTY_POOL, G: 1 }, [], G("{G}"))).toBe(true);
  });

  it("taps a land to pay a colored pip when the pool is empty", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    const plan = planPayment(EMPTY_POOL, sources, G("{G}"));
    expect(plan.taps).toEqual([{ permanentId: "f1", color: "G", amount: 1 }]);
  });

  it("returns null when no source can make the required color", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    expect(planPayment(EMPTY_POOL, sources, G("{U}"))).toBeNull();
    expect(canAfford(EMPTY_POOL, sources, G("{U}"))).toBe(false);
  });

  it("covers generic with any sources", () => {
    const sources = [
      { permanentId: "f1", colors: ["G"], amount: 1 },
      { permanentId: "f2", colors: ["G"], amount: 1 },
    ];
    expect(canAfford(EMPTY_POOL, sources, G("{2}"))).toBe(true);
    expect(canAfford(EMPTY_POOL, [sources[0]], G("{2}"))).toBe(false);
  });

  it("uses a single Sol Ring (amount 2) to pay 2 generic", () => {
    const sources = [{ permanentId: "sol", colors: ["C"], amount: 2 }];
    const plan = planPayment(EMPTY_POOL, sources, G("{2}"));
    expect(plan.taps).toEqual([{ permanentId: "sol", color: "C", amount: 2 }]);
  });

  it("most-constrained-first: reserves a dual for the color only it can make", () => {
    // Need {W}{U}. Plains makes only W; the dual makes W or U. A naive greedy
    // could spend the dual on W and strand U. Most-constrained-first pays W
    // from Plains and U from the dual.
    const sources = [
      { permanentId: "dual", colors: ["W", "U"], amount: 1 },
      { permanentId: "plains", colors: ["W"], amount: 1 },
    ];
    const plan = planPayment(EMPTY_POOL, sources, G("{W}{U}"));
    expect(plan).not.toBeNull();
    const byColor = Object.fromEntries(plan.taps.map(t => [t.color, t.permanentId]));
    expect(byColor.W).toBe("plains");
    expect(byColor.U).toBe("dual");
  });

  it("returns null when a colored requirement outnumbers its sources", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    expect(planPayment(EMPTY_POOL, sources, G("{G}{G}"))).toBeNull();
  });

  it("spends the pool before tapping for generic", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    // Pool has 2 generic-worth; cost is {1}. Should not need to tap.
    const plan = planPayment({ ...EMPTY_POOL, C: 2 }, sources, G("{1}"));
    expect(plan.taps).toEqual([]);
  });
});
