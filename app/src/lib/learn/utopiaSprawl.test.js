/**
 * CHOSEN-COLOR MANA AURA (CR 614.12b + 605.1b) — Utopia Sprawl: "Enchant Forest / As this Aura enters,
 * choose a color / Whenever enchanted Forest is tapped for mana, its controller adds an additional one mana
 * of the chosen color." A land-enchant mana Aura like Wild Growth, but with TWO extra wrinkles this slice
 * models end-to-end:
 *   1. it enchants the FOREST basic-land subtype (not bare "land") — the runtime offers only the caster's own
 *      Forests as targets and attaches there, so the boost only ever rides a Forest;
 *   2. its boost is "one mana of the CHOSEN color" — the color is fixed at cast time by the as-enters choice
 *      (auto-picked in self-play from the controller's most-needed casting color) and stored DURABLY on the
 *      Aura permanent as `chosenColor`; manaModel.landAuraManaBonus resolves that stamp when the Forest taps.
 *
 * CREED all-or-nothing: only the EXACT shape flips. A "chosen color" boost WITHOUT the as-enters choice line
 * (an unmodeled variant), an "Enchant Forest" Aura carrying an extra static (Shimmerwilds Growth's "Enchanted
 * land is the chosen color"), or a different-subtype/tail Aura all stay non-native (safe false-negatives).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseAuraLandManaBonus, isNativeManaAura, auraChoosesColorOnEnter } from "./staticAbilityParser.js";
import { manaSources, planPayment, landAuraManaBonus } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const UTOPIA_SPRAWL = { id: "c-us", name: "Utopia Sprawl", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." };
// CREED near-misses (each must STAY non-native):
const SHIMMERWILDS_GROWTH = { id: "c-sg", name: "Shimmerwilds Growth", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nAs this Aura enters, choose a color.\nEnchanted land is the chosen color.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of the chosen color." };
const NO_CHOICE_LINE = { id: "c-nc", name: "Fake Sprawl", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant Forest\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." };
const CHOOSE_TWO = { id: "c-c2", name: "Fake Prism", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant Forest\nAs this Aura enters, choose two colors.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." };
const WILD_GROWTH = { id: "c-wg", name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };

const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
const NONFOREST_LAND = { name: "Island", type: "Basic Land — Island", oracle: "" };
const BLUE_SPELL = { name: "Counterspell", type: "Instant", mana: "{U}{U}", oracle: "Counter target spell." };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function boardState({ user = [], hand = [], library = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, library, manaPool: { ...EMPTY_POOL, ...pool } },
    },
  };
}

describe("parseAuraLandManaBonus — chosen-color marker", () => {
  it("the chosen-color tail returns a marker (no fabricated color)", () => {
    expect(parseAuraLandManaBonus(UTOPIA_SPRAWL)).toEqual({ chosenColor: true, amount: 1 });
  });
  it("the fixed/any-color forms are unchanged (no regression)", () => {
    expect(parseAuraLandManaBonus(WILD_GROWTH)).toEqual({ colors: ["G"], amount: 1 });
  });
});

describe("auraChoosesColorOnEnter — the cast-time color choice line", () => {
  it("matches the exact as-enters choice; rejects riders", () => {
    expect(auraChoosesColorOnEnter(UTOPIA_SPRAWL)).toBe(true);
    expect(auraChoosesColorOnEnter(NO_CHOICE_LINE)).toBe(false);
    expect(auraChoosesColorOnEnter(CHOOSE_TWO)).toBe(false); // "choose two colors" — not the modeled single-color choice
  });
});

describe("isNativeManaAura — Utopia Sprawl flips; near-misses stay non-native (CREED)", () => {
  it("Utopia Sprawl (Enchant Forest + choose a color + chosen-color boost) is native", () => {
    expect(isNativeManaAura(UTOPIA_SPRAWL)).toBe(true);
    expect(classifyCard(UTOPIA_SPRAWL)).toBe("native-mana-aura");
  });
  it("a chosen-color boost WITHOUT the as-enters choice line stays non-native (no stamped color)", () => {
    expect(isNativeManaAura(NO_CHOICE_LINE)).toBe(false);
    expect(classifyCard(NO_CHOICE_LINE)).toBe("body-only");
  });
  it("a 'choose two colors' variant stays non-native (unmodeled choice)", () => {
    expect(isNativeManaAura(CHOOSE_TWO)).toBe(false);
    expect(classifyCard(CHOOSE_TWO)).toBe("body-only");
  });
  it("Shimmerwilds Growth stays non-native — its 'Enchanted land is the chosen color' static is residue", () => {
    expect(isNativeManaAura(SHIMMERWILDS_GROWTH)).toBe(false);
    expect(classifyCard(SHIMMERWILDS_GROWTH)).toBe("body-only");
  });
  it("the clean bare-land mana auras are unchanged (Wild Growth still native)", () => {
    expect(isNativeManaAura(WILD_GROWTH)).toBe(true);
  });
});

describe("cast → auto-pick color → attach to a Forest → boosted tap", () => {
  it("only the caster's own FOREST is offered as a target (a non-Forest land is not)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const island = createPermanent({ id: "island", card: NONFOREST_LAND, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest, island], hand: [UTOPIA_SPRAWL], pool: { G: 1 } });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.isAuraSpell && a.cardId === "c-us");
    expect(casts).toHaveLength(1);                       // exactly one legal target
    expect(casts[0].targets[0].id).toBe("forest");       // the Forest, never the Island
  });

  it("resolving attaches to the Forest and stamps the auto-picked chosen color (the deck's needed color)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    // three blue spells in the library → the auto-pick chooses U (the most-needed casting color)
    let s = boardState({ user: [forest], hand: [UTOPIA_SPRAWL], library: [BLUE_SPELL, BLUE_SPELL, BLUE_SPELL], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Utopia Sprawl");
    expect(aura.attachedTo).toBe("forest");
    expect(aura.chosenColor).toBe("U");
    expect(findPermanent(s, "forest").permanent.attachments).toEqual([aura.id]);
    // the boost resolves the marker against the stamped color
    expect(landAuraManaBonus(s, findPermanent(s, "forest").permanent)).toEqual([{ colors: ["U"], amount: 1 }]);
  });

  it("with no colored spells left, the auto-pick falls back to G (the Forest's own color)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest], hand: [UTOPIA_SPRAWL], library: [], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Utopia Sprawl");
    expect(aura.chosenColor).toBe("G");
  });

  it("the boosted Forest tap floats land G + the chosen bonus color, WITHOUT tapping/consuming the Aura", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest], hand: [UTOPIA_SPRAWL], library: [BLUE_SPELL, BLUE_SPELL, BLUE_SPELL], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Utopia Sprawl");
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find((a) => a.permanentId === "forest");
    expect(tap.bonus).toEqual([{ color: "U", amount: 1 }]);
    s = dispatchAction(s, tap);
    expect(s.players.user.manaPool.G).toBe(1);                              // land's own G
    expect(s.players.user.manaPool.U).toBe(1);                              // the chosen-color bonus
    expect(findPermanent(s, "forest").permanent.tapped).toBe(true);        // the LAND taps
    expect(findPermanent(s, aura.id).permanent.tapped).toBe(false);        // the AURA is NOT tapped
    expect(s.players.user.battlefield.some((p) => p.id === aura.id)).toBe(true); // and NOT consumed — fires every time
  });

  it("auto-pay: Forest + Utopia Sprawl (chosen U) pays {G}{U} from ONE Forest tap (no fabricated mana)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest], hand: [UTOPIA_SPRAWL], library: [BLUE_SPELL, BLUE_SPELL, BLUE_SPELL], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 1, U: 1 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);            // only the Forest taps
    expect(plan.spend.G).toBe(1);
    expect(plan.spend.U).toBe(1);                 // the U pip is paid by the chosen-color bonus
    // and it can NOT pay {G}{R} — the bonus is U, not any color (no fabricated color)
    const forest2 = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s2 = boardState({ user: [forest2], hand: [UTOPIA_SPRAWL], library: [BLUE_SPELL, BLUE_SPELL, BLUE_SPELL], pool: { G: 1 } });
    const cast2 = filterActions(legalActionsForPlayer(s2, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s2 = resolveTopOfStack(dispatchAction(s2, cast2));
    expect(planPayment(EMPTY_POOL, manaSources(s2, "user"), { G: 1, R: 1 })).toBeNull();
  });
});

describe("manaSources — the boosted Forest reports ONE source (the aura is never a source)", () => {
  it("the boost rides on the Forest tap; the Aura is not a tappable source", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest], hand: [UTOPIA_SPRAWL], library: [BLUE_SPELL, BLUE_SPELL, BLUE_SPELL], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell && a.cardId === "c-us");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const srcs = manaSources(s, "user");
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toMatchObject({ permanentId: "forest", colors: ["G"], amount: 1, bonus: [{ colors: ["U"], amount: 1 }] });
  });
});
