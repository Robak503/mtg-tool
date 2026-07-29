/**
 * painland.test.js — the painland cycle taps for its COLOURS, and pays the life to do it.
 *
 * "{T}: Add {C}.\n{T}: Add {U} or {R}. This land deals 1 damage to you." — Shivan Reef, Adarkar Wastes,
 * Karplusan Forest, Battlefield Forge, Llanowar Wastes, Caves of Koilos, Yavimaya Coast, Brushland,
 * Underground River, Sulfurous Springs. 10 corpus cards, all premium fixing.
 *
 * parseAddClause reads the FIRST Add clause and stops, so every one of these modelled as COLORLESS ONLY —
 * a functional Wastes. ⭐ And no coverage number could show it: lands are credited native by BEING lands, so
 * the metric is blind to their runtime. That is the THIRD time this run a bug hid behind a card class
 * credited by TYPE rather than by parse (the karoo/signet bundle and the per-ability refusal were the others).
 *
 * ⛔ THE LIFE COST IS WHY THIS IS NOT A ONE-LINE COLOUR UNION. Admitting {U}/{R} while ignoring "deals 1
 * damage to you" would be a PAINLESS painland — strictly better than printed, the forbidden direction. The
 * colours are admitted only together with the cost, and the cost is charged only when the tap actually picks
 * a painful colour: the {C} half stays free, exactly as printed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { manaProduction, manaSources, planPayment, payManaCost } from "./manaModel.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text, verbatim.
const SHIVAN = { id: "r", name: "Shivan Reef", type: "Land", oracle: "{T}: Add {C}.\n{T}: Add {U} or {R}. This land deals 1 damage to you." };
const BRUSHLAND = { id: "r", name: "Brushland", type: "Land", oracle: "{T}: Add {C}.\n{T}: Add {G} or {W}. This land deals 1 damage to you." };
// NOT a painland: same two-ability shape, a different rider. Must keep its old colourless read.
const MOGG = { id: "r", name: "Mogg Hollows", type: "Land", oracle: "{T}: Add {C}.\n{T}: Add {R} or {G}. This land doesn't untap during your next untap step." };

function board(card) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "r", card, controller: "user" })] } } };
}

describe("parsing", () => {
  it("⭐ the colours are read, with the life cost attached", () => {
    expect(manaProduction(SHIVAN)).toMatchObject({ colors: ["C", "U", "R"], amount: 1, painColors: ["U", "R"], painAmount: 1 });
    expect(manaProduction(BRUSHLAND)).toMatchObject({ colors: ["C", "G", "W"], painColors: ["G", "W"] });
    // ⭐ The SLOW half of the cycle carries a leading "This land enters tapped." line. The original anchor
    // started at "{T}: Add {C}" and silently missed FIVE of the fifteen — Skyshroud Forest, Scabland,
    // Pine Barrens, Salt Flats, Caldera Lake.
    expect(manaProduction({ name: "Skyshroud Forest", type: "Land", oracle: "This land enters tapped.\n{T}: Add {C}.\n{T}: Add {G} or {U}. This land deals 1 damage to you." }))
      .toMatchObject({ colors: ["C", "G", "U"], painColors: ["G", "U"] });
  });

  it("⛔ a DIFFERENT rider is not swept in — Mogg Hollows keeps its colourless read", () => {
    // Its "doesn't untap" rider is unmodeled here, so admitting {R}/{G} would drop a real drawback.
    // Scoped separately in the ledger; a safe FN until then.
    const p = manaProduction(MOGG);
    expect(p).toMatchObject({ colors: ["C"], amount: 1 });
    expect(p.painColors).toBeUndefined();
  });
});

describe("the SINGLE-ABILITY form — an FP that was already live", () => {
  // One coloured ability that costs life: "{T}: Add {B}. This land deals 1 damage to you." These were NOT
  // colourless — their first Add clause IS coloured, so they parsed fine and the damage rider was simply
  // DROPPED. A PAINLESS painland is strictly better than printed: unlike the two-line cycle above (an
  // under-delivery), this one was already live in the FORBIDDEN direction.
  it("⭐ the Odyssey threshold cycle now carries its life cost", () => {
    expect(manaProduction({ name: "Cabal Pit", type: "Land", oracle: "{T}: Add {B}. This land deals 1 damage to you.\nThreshold — {B}, {T}, Sacrifice this land: Target creature gets -2/-2 until end of turn. Activate only if seven or more cards are in your graveyard." }))
      .toMatchObject({ colors: ["B"], amount: 1, painColors: ["B"], painAmount: 1 });
    expect(manaProduction({ name: "Barbarian Ring", type: "Land", oracle: "{T}: Add {R}. This land deals 1 damage to you.\nThreshold — {R}, {T}, Sacrifice this land: It deals 2 damage to any target. Activate only if seven or more cards are in your graveyard." }))
      .toMatchObject({ colors: ["R"], painColors: ["R"] });
  });

  it("⛔ CREED — CONDITIONAL damage is EXCLUDED (Tomb of Urami: \"if you don't control an Ogre\")", () => {
    // Nothing here models that condition, so charging it always would over-charge. Left exactly as it was —
    // a known, recorded gap rather than a new wrong answer.
    const p = manaProduction({ name: "Tomb of Urami", type: "Legendary Land", oracle: "{T}: Add {B}. Tomb of Urami deals 1 damage to you if you don't control an Ogre." });
    expect(p).toMatchObject({ colors: ["B"], amount: 1 });
    expect(p.painColors).toBeUndefined();
  });

  it("a plain coloured land is untouched", () => {
    const p = manaProduction({ name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" });
    expect(p).toMatchObject({ colors: ["G"], amount: 1 });
    expect(p.painColors).toBeUndefined();
  });
});

describe("⭐ RUNTIME — the colours work and the life is actually paid", () => {
  it("a coloured pip is now payable AT ALL (it was not — the land was a Wastes)", () => {
    expect(planPayment({}, manaSources(board(SHIVAN), "user"), { U: 1 })).not.toBeNull();
    expect(planPayment({}, manaSources(board(SHIVAN), "user"), { R: 1 })).not.toBeNull();
  });

  it("⛔ CREED — an OFF-colour pip is still refused", () => {
    expect(planPayment({}, manaSources(board(SHIVAN), "user"), { G: 1 })).toBeNull();
  });

  it("⭐ tapping for a COLOUR costs 1 life", () => {
    const before = board(SHIVAN).players.user.life;
    const after = payManaCost(board(SHIVAN), "user", { U: 1 });
    expect(after.paid).toBe(true);
    expect(after.state.players.user.life).toBe(before - 1);
  });

  it("⭐ tapping for the FREE {C} half costs NOTHING — the halves are distinct", () => {
    // Without this the fix would over-charge, which is just a different infidelity.
    const before = board(SHIVAN).players.user.life;
    const after = payManaCost(board(SHIVAN), "user", { generic: 1 });
    expect(after.paid).toBe(true);
    expect(after.state.players.user.life).toBe(before);
  });

  it("CONTROL — a painless dual charges no life for the same coloured pip", () => {
    const TUNDRA = { id: "r", name: "Tundra", type: "Land — Plains Island", oracle: "({T}: Add {W} or {U}.)" };
    const before = board(TUNDRA).players.user.life;
    const after = payManaCost(board(TUNDRA), "user", { U: 1 });
    expect(after.paid).toBe(true);
    expect(after.state.players.user.life).toBe(before);
  });
});
