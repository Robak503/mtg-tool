/**
 * fixedManaBundle.test.js — THE MIXED FIXED BUNDLE: "Add {G}{W}" produces one of EACH, simultaneously.
 *
 * ⚠️ THIS FIXED A LIVE FALSE POSITIVE ON 51 CORPUS CARDS — every karoo bounce land, every Signet, the Eggs,
 * the filter-ish duals. The planner's primary component picked ONE color and credited `amount` of it, so a
 * Selesnya Signet was wrong in BOTH directions, measured on the real card before any code changed:
 *
 *     {G}{W}  → REFUSED   (the only thing the card actually does — a false negative)
 *     {G}{G}  → PAID      (which the card cannot do — the FORBIDDEN false-positive direction)
 *
 * The bundle is therefore a distinct product shape (`fixed`, a per-color tally), not a bigger `amount`, and
 * it is threaded parser → manaSources → planPayment → commitManaTap. The commit half matters as much as the
 * plan half: "affordable per planPayment" == "actually paid" is the invariant this seam exists to hold, so a
 * plan that spends {G}{W} must commit {G}{W} into the pool, never two of one color.
 *
 * VIVID (Bloom Tender, Faeburrow Elder) is the same shape with a BOARD-DERIVED color set — "for each color
 * among permanents you control, add one mana of that color". It cannot ride the existing amountSpec path,
 * which yields N mana freely spendable across its colors: on a W/G board that pays {G}{G}, reintroducing the
 * exact false positive above.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { manaProduction, manaSources, planPayment, payManaCost } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// REAL printings. The engine's rule is "never write card behavior from memory" — these are the bundled
// Scryfall oracle lines verbatim.
const SIGNET = { id: "sig", name: "Selesnya Signet", type: "Artifact", mana: "{2}", oracle: "{1}, {T}: Add {G}{W}." };
const KAROO = { id: "kar", name: "Simic Growth Chamber", type: "Land", oracle: "Simic Growth Chamber enters tapped.\nWhen Simic Growth Chamber enters, return a land you control to its owner's hand.\n{T}: Add {G}{U}." };
const SOL_RING = { id: "sol", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const BLOOM = { id: "bt", name: "Bloom Tender", type: "Creature — Elf Druid", power: 1, toughness: 1, mana: "{1}{G}", colors: ["G"], oracle: "Vivid — {T}: For each color among permanents you control, add one mana of that color." };

const srcOf = (card) => {
  const p = manaProduction(card);
  return [{ permanentId: card.id, colors: p.fixed ? Object.keys(p.fixed) : p.colors, amount: p.amount, ...(p.fixed ? { fixed: p.fixed } : {}) }];
};
const pays = (card, cost) => planPayment({}, srcOf(card), cost) !== null;

describe("the printed bundle — 'Add {G}{W}' is one of each, not two of a choice", () => {
  it("the product carries a per-color tally", () => {
    expect(manaProduction(SIGNET)).toMatchObject({ colors: ["G", "W"], amount: 2, fixed: { G: 1, W: 1 } });
  });

  it("⭐ pays its OWN bundle — the false negative is gone", () => {
    expect(pays(SIGNET, { G: 1, W: 1 })).toBe(true);
  });

  it("⭐ CREED — does NOT pay {G}{G} or {W}{W} (the forbidden false positive, live on 51 cards before this)", () => {
    expect(pays(SIGNET, { G: 2 })).toBe(false);
    expect(pays(SIGNET, { W: 2 })).toBe(false);
  });

  it("still pays a single colored pip of either half, and a generic cost of the full amount", () => {
    expect(pays(SIGNET, { G: 1 })).toBe(true);
    expect(pays(SIGNET, { W: 1 })).toBe(true);
    expect(pays(SIGNET, { generic: 2 })).toBe(true);   // regressed once: the generic drain read only the primary color
    expect(pays(SIGNET, { generic: 1, G: 1 })).toBe(true);
    expect(pays(SIGNET, { generic: 3 })).toBe(false);  // it makes exactly two mana
  });

  it("⭐ SINGLE-COLOR sources are untouched — Sol Ring still makes {C}{C}", () => {
    expect(manaProduction(SOL_RING)).toMatchObject({ colors: ["C"], amount: 2 });
    expect(manaProduction(SOL_RING).fixed).toBeUndefined();
    expect(pays(SOL_RING, { generic: 2 })).toBe(true);
  });

  it("a CHOICE clause ('Add {W} or {U}') is still a choice, not a bundle", () => {
    const orCard = { name: "x", type: "Land", oracle: "{T}: Add {W} or {U}." };
    expect(manaProduction(orCard)).toMatchObject({ colors: ["W", "U"], amount: 1 });
    expect(manaProduction(orCard).fixed).toBeUndefined();
  });
});

describe("⭐ RUNTIME — the plan and the commit must agree", () => {
  function boardWith(cards) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = cards.map((c) => ({ ...createPermanent({ id: c.id, card: c, controller: "user" }), summoningSick: false }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }

  it("tapping a karoo puts ONE OF EACH into the pool — not two of one color", () => {
    const after = payManaCost(boardWith([KAROO]), "user", { generic: 1 });
    expect(after.paid).toBe(true);
    // Two mana produced, one spent on the generic; the surviving float proves both colors were real.
    const pool = after.state.players.user.manaPool;
    expect(pool.G + pool.U).toBe(1);
  });

  it("⭐ the commit adds the bundle's colors — a {G}{U} cost is payable AND leaves an empty pool", () => {
    const after = payManaCost(boardWith([KAROO]), "user", { G: 1, U: 1 });
    expect(after.paid).toBe(true);
    const pool = after.state.players.user.manaPool;
    expect(pool.G).toBe(0);
    expect(pool.U).toBe(0);
  });

  it("⭐ CREED — a {G}{G} cost is NOT payable off a single karoo", () => {
    expect(payManaCost(boardWith([KAROO]), "user", { G: 2 }).paid).toBe(false);
  });
});

describe("VIVID — the same bundle, read off the live board (Bloom Tender / Faeburrow Elder)", () => {
  const perm = (id, name, type, colors) => createPermanent({ id, card: { id, name, type, colors, oracle: "" }, controller: "user" });
  function bloomBoard(extra) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      { ...createPermanent({ id: "bt", card: BLOOM, controller: "user" }), summoningSick: false }, ...extra,
    ] } } };
  }
  const bloomSource = (extra) => manaSources(bloomBoard(extra), "user").find((s) => s.permanentId === "bt");

  it("both cards classify native-mana", () => {
    expect(classifyCard(BLOOM)).toBe("native-mana");
    expect(classifyCard({ name: "Faeburrow Elder", type: "Creature — Treefolk Druid", mana: "{1}{G}{W}", oracle: "Vigilance\nThis creature gets +1/+1 for each color among permanents you control.\n{T}: For each color among permanents you control, add one mana of that color." })).toBe("native-mana");
  });

  it("alone, it makes exactly its own color", () => {
    expect(bloomSource([])).toMatchObject({ amount: 1, fixed: { G: 1 } });
  });

  it("⭐ the bundle GROWS with the board's distinct colors", () => {
    expect(bloomSource([perm("a", "Angel", "Creature — Angel", ["W"])])).toMatchObject({ amount: 2, fixed: { G: 1, W: 1 } });
    expect(bloomSource([perm("a", "Angel", "Creature — Angel", ["W"]), perm("b", "Drake", "Creature — Drake", ["U"])]))
      .toMatchObject({ amount: 3, fixed: { G: 1, W: 1, U: 1 } });
  });

  it("a COLORLESS permanent contributes no color (it is a color count, not a permanent count)", () => {
    expect(bloomSource([perm("w", "Wastes", "Basic Land — Wastes", [])])).toMatchObject({ amount: 1, fixed: { G: 1 } });
    // A second green permanent is the same DISTINCT color — still one green mana.
    expect(bloomSource([perm("f", "Forest2", "Creature — Elf", ["G"])])).toMatchObject({ amount: 1, fixed: { G: 1 } });
  });

  it("⭐ CREED — with W and G on board it pays {G}{W} but NOT {G}{G}", () => {
    const sources = manaSources(bloomBoard([perm("a", "Angel", "Creature — Angel", ["W"])]), "user");
    expect(planPayment({}, sources, { G: 1, W: 1 })).not.toBeNull();
    expect(planPayment({}, sources, { G: 2 })).toBeNull();
  });
});
