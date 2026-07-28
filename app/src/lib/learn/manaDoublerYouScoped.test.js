/**
 * manaDoublerYouScoped.test.js — THE MISSING CROSS: controller-scoped × LAND × same-type.
 *
 *   "Whenever you tap a land for mana, add one mana of any type that land produced."
 *   Mirari's Wake #680 · Zendikar Resurgent #2260 · Vorinclex, Voice of Hunger #1783
 *
 * ⭐ NOTHING NEW WAS BUILT HERE, and that is the finding worth keeping. The augment model has three
 * independent axes and every one of them was already implemented:
 *
 *              │ all players        │ controller ("you tap")
 *   ───────────┼────────────────────┼──────────────────────────
 *   land       │ MF-1 Mana Flare ✓  │  ← the empty cell
 *   nonland    │ —                  │  MD-1 Kinnan ✓
 *
 * globalTapManaAugment already gated the controller axis, already tested the land subject, and already
 * credited sameAsProduced. Only the PARSER lacked the corner. The old source comment even named Mirari's
 * Wake as out of scope — true when it was written, stale the moment MF-1 and MD-1 landed, and nobody came
 * back to close the grid. A one-diff probe finds these: a HIGH sibling one qualifier away from a LOW
 * phrase is a missing cross, not a missing mechanic.
 *
 * The scope-boundary pin in globalTapManaAugment.test.js that asserted Mirari's Wake stays null was
 * GRADUATED (not deleted) — it was a not-built-yet boundary, never a safety one.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { parseGlobalTapManaAugment } from "./staticAbilityParser.js";
import { manaSources, planPayment, globalTapManaAugment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Verified oracle text (bundled Scryfall).
const DOUBLER_LINE = "Whenever you tap a land for mana, add one mana of any type that land produced.";
const MIRARIS_WAKE = { id: "c-mw", name: "Mirari's Wake", type: "Enchantment", mana: "{3}{G}{W}",
  oracle: `Creatures you control get +1/+1.\n${DOUBLER_LINE}` };
const ZENDIKAR_RESURGENT = { id: "c-zr", name: "Zendikar Resurgent", type: "Enchantment", mana: "{5}{G}{G}",
  oracle: `${DOUBLER_LINE} (The types of mana are white, blue, black, red, green, and colorless.)\nWhenever you cast a creature spell, draw a card.` };
const VORINCLEX = { id: "c-vx", name: "Vorinclex, Voice of Hunger", type: "Creature — Phyrexian Praetor", mana: "{6}{G}{G}", power: 7, toughness: 6,
  oracle: `Trample\n${DOUBLER_LINE}\nWhenever an opponent taps a land for mana, that land doesn't untap during its controller's next untap step.` };

const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
const DUAL_WU = { id: "c-wu", name: "Test Dual", type: "Land", oracle: "{T}: Add {W} or {U}." };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function board({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...EMPTY_POOL } },
      ai: { ...s.players.ai, battlefield: aiBf, manaPool: { ...EMPTY_POOL } },
    },
  };
}
const land = (id, card, controller) => createPermanent({ id, card, controller, summoningSick: false });

describe("the parser — the corner that was missing", () => {
  it("all three carriers read as { subject:'land', sameAsProduced:true, amount:1 } with NO allPlayers", () => {
    for (const c of [MIRARIS_WAKE, ZENDIKAR_RESURGENT, VORINCLEX]) {
      expect(parseGlobalTapManaAugment(c)).toEqual({ subject: "land", sameAsProduced: true, amount: 1 });
    }
  });

  it("the absence of allPlayers is the WHOLE difference from Mana Flare — pinned explicitly", () => {
    // If this ever gained allPlayers, every opponent would start doubling off the user's Mirari's Wake.
    expect(parseGlobalTapManaAugment(MIRARIS_WAKE).allPlayers).toBeUndefined();
    expect(parseGlobalTapManaAugment({ oracle: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced." }))
      .toMatchObject({ allPlayers: true });
  });

  it("CREED — a rider on the line leaves residue and rejects", () => {
    expect(parseGlobalTapManaAugment({ oracle: "Whenever you tap a land for mana, add one mana of any type that land produced, then draw a card." })).toBeNull();
  });
});

describe("classification — what flips and what honestly doesn't", () => {
  it("Mirari's Wake flips (anthem + doubler, both modeled)", () => {
    expect(classifyCard(MIRARIS_WAKE)).toMatch(/^native/);
  });

  it("Zendikar Resurgent flips (doubler + cast-a-creature draw)", () => {
    expect(classifyCard(ZENDIKAR_RESURGENT)).toMatch(/^native/);
  });

  it("Vorinclex stays PARKED — its opponent-land-doesn't-untap line is unmodeled residue", () => {
    // The whole-card law working as intended: the doubler half is understood, the second half isn't, and
    // half a Praetor is not a Praetor.
    expect(classifyCard(VORINCLEX)).toBe("body-only");
  });
});

describe("RUNTIME — the controller gate and the same-type binding", () => {
  it("the controller's own land tap carries the bonus", () => {
    const s = board({ userBf: [land("f", FOREST, "user"), createPermanent({ id: "mw", card: MIRARIS_WAKE, controller: "user" })] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "f").permanent)).toEqual([{ sameAsProduced: true, amount: 1 }]);
  });

  it("THE LOAD-BEARING ONE — an OPPONENT's land tap gets NOTHING from the user's Mirari's Wake", () => {
    // This is precisely where Mana Flare and Mirari's Wake diverge. Symmetric here would hand every
    // opponent a free doubler off the user's own enchantment — a confident wrong that no test of the
    // controller's own taps would ever catch.
    const s = board({ userBf: [createPermanent({ id: "mw", card: MIRARIS_WAKE, controller: "user" })], aiBf: [land("af", FOREST, "ai")] });
    expect(globalTapManaAugment(s, "ai", findPermanent(s, "af").permanent)).toEqual([]);
  });

  it("a CREATURE tap never rides the lands-only augment", () => {
    const dork = createPermanent({ id: "dork", card: { id: "c-dk", name: "Mana Dork", type: "Creature — Elf Druid", mana: "{G}", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    const s = board({ userBf: [dork, createPermanent({ id: "mw", card: MIRARIS_WAKE, controller: "user" })] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "dork").permanent)).toEqual([]);
  });

  it("one Forest tap pays {G}{G} — the doubling is real, not just parsed", () => {
    const s = board({ userBf: [land("f", FOREST, "user"), createPermanent({ id: "mw", card: MIRARIS_WAKE, controller: "user" })] });
    const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);
  });

  it("SAME-TYPE (CR 106.1b) — one dual tap makes WW or UU, never W+U", () => {
    const s = board({ userBf: [land("dual", DUAL_WU, "user"), createPermanent({ id: "mw", card: MIRARIS_WAKE, controller: "user" })] });
    for (const cost of [{ W: 2 }, { U: 2 }]) {
      const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), cost);
      expect(plan).not.toBeNull();
      expect(plan.taps[0]).toMatchObject({ permanentId: "dual", color: Object.keys(cost)[0] });
    }
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { W: 1, U: 1 })).toBeNull(); // the off-type FP
  });
});
