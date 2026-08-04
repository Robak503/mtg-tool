/**
 * AURA-LAND-MANA-BOOST (Wave 4) — an Aura attached to a LAND adds extra mana WHEN THE LAND TAPS for
 * mana (Wild Growth / Overgrowth / Fertile Ground). This is a TRIGGERED MANA ABILITY (CR 605.1b): it
 * resolves INLINE alongside the land's own mana, never on the stack — so the runtime hooks the
 * mana-production path (manaModel.landAuraManaBonus), NOT triggers.js. The boost appears in BOTH
 * read-sites (auto-pay planPayment + the explicit tap-for-mana action) through one shared helper so
 * they can't drift, and the Aura is NEVER tapped/consumed (the LAND taps; the Aura fires every time).
 *
 * CREED all-or-nothing: only a clean land-mana Aura flips native. An Aura carrying residue —
 * a sac ability (Wolfwillow Haven), an extra land-static (Trace of Abundance), or an unmodeled boost
 * grammar (Market Festival "in any combination") — STAYS body-only (a safe false-negative). A
 * MODELED aura-own ETB rider is admitted since LA-2 (Verdant Haven — landAuraEtbRider.test.js). (Utopia Sprawl's Forest-subtype + as-enters chosen-color boost is now a
 * MODELED slice — see utopiaSprawl.test.js.) Bear Umbra is a CREATURE-enchant Aura (not a land-mana
 * aura) so it is NOT native-mana-aura — parseAuraLandManaBonus/isNativeManaAura correctly reject it here.
 * Its OWN nativeness (buff + granted untap-all-lands trigger + totem armor) is now MODELED via the creature-
 * aura path (native-aura) — see effects/bearUmbra.test.js; here it just isn't the land-mana tier.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseAuraLandManaBonus, isNativeManaAura, isNativeAura } from "./staticAbilityParser.js";
import { manaSources, planPayment, landAuraManaBonus } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const WILD_GROWTH = { id: "c-wg", name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };
const OVERGROWTH = { id: "c-og", name: "Overgrowth", type: "Enchantment — Aura", mana: "{2}{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}{G}." };
const FERTILE_GROUND = { id: "c-fg", name: "Fertile Ground", type: "Enchantment — Aura", mana: "{1}{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };
// Utopia Sprawl — its chosen-color boost is MODELED (see utopiaSprawl.test.js); kept here to pin the
// parser marker + the fact that a chosen-color boost is NOT the fixed/any-color grammar.
const UTOPIA_SPRAWL = { id: "c-us", name: "Utopia Sprawl", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." };
// Non-native (residue / unmodeled grammar / deferred):
const WOLFWILLOW = { id: "c-wh", name: "Wolfwillow Haven", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.\n{4}{G}, Sacrifice this Aura: Create a 2/2 green Wolf creature token. Activate only during your turn." };
const VERDANT_HAVEN = { id: "c-vh", name: "Verdant Haven", type: "Enchantment — Aura", mana: "{1}{G}", oracle: "Enchant land\nWhen this Aura enters, you gain 2 life.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };
const TRACE = { id: "c-ta", name: "Trace of Abundance", type: "Enchantment — Aura", mana: "{1}{G}", oracle: "Enchant land\nEnchanted land has shroud.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };
const MARKET_FESTIVAL = { id: "c-mf", name: "Market Festival", type: "Enchantment — Aura", mana: "{2}{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional two mana in any combination of colors." };
const BEAR_UMBRA = { id: "c-bu", name: "Bear Umbra", type: "Enchantment — Aura", mana: "{3}{G}", oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has \"Whenever this creature attacks, untap all lands you control.\"\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)" };

const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function boardState({ user = [], hand = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...EMPTY_POOL, ...pool } },
    },
  };
}

describe("parseAuraLandManaBonus — the boost grammar", () => {
  it("fixed single-color, fixed multi-pip same color, and any-color", () => {
    expect(parseAuraLandManaBonus(WILD_GROWTH)).toEqual({ colors: ["G"], amount: 1 });
    expect(parseAuraLandManaBonus(OVERGROWTH)).toEqual({ colors: ["G"], amount: 2 });
    expect(parseAuraLandManaBonus(FERTILE_GROUND)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });
  it("rejects every unmodeled boost form (no fabricated amount/color)", () => {
    expect(parseAuraLandManaBonus(MARKET_FESTIVAL)).toBeNull();   // "two mana in any combination"
    // CHOSEN-COLOR (Utopia Sprawl) is now MODELED — the boost parses to a chosen-color marker (resolved
    // against the Aura's stamped `chosenColor` at the tap site); see utopiaSprawl.test.js for the full slice.
    expect(parseAuraLandManaBonus(UTOPIA_SPRAWL)).toEqual({ chosenColor: true, amount: 1 });
    // a "for each" variable boost is not this slice
    expect(parseAuraLandManaBonus({ type: "Enchantment — Aura", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G} for each creature you control." })).toBeNull();
    // a fixed MULTI-color run ("{G}{U}") isn't the single-chosen-color model
    expect(parseAuraLandManaBonus({ type: "Enchantment — Aura", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}{U}." })).toBeNull();
    // not a land-mana Aura at all
    expect(parseAuraLandManaBonus(BEAR_UMBRA)).toBeNull();
    expect(parseAuraLandManaBonus({ type: "Enchantment", oracle: "Whenever enchanted land is tapped for mana, its controller adds an additional {G}." })).toBeNull(); // not an Aura type
  });
});

describe("isNativeManaAura — all-or-nothing native gate", () => {
  it("the three clean land-mana auras are native", () => {
    expect(isNativeManaAura(WILD_GROWTH)).toBe(true);
    expect(isNativeManaAura(OVERGROWTH)).toBe(true);
    expect(isNativeManaAura(FERTILE_GROUND)).toBe(true);
  });
  it("residue / unmodeled-grammar / deferred auras are NOT native (safe FN)", () => {
    expect(isNativeManaAura(WOLFWILLOW)).toBe(false);     // sac activated ability residue
    // ⭐ PIN INVERTED (LA-2, 2026-08-03): the ETB rider is validator-admitted now — Verdant Haven's
    // "you gain 2 life" fires at the shared enterPermanent chokepoint (landAuraEtbRider.test.js LA-2
    // carries the runtime battery). An UNROUTABLE ETB rider still parks (pinned there).
    expect(isNativeManaAura(VERDANT_HAVEN)).toBe(true);
    expect(isNativeManaAura(TRACE)).toBe(false);          // extra land-static ("has shroud") residue
    expect(isNativeManaAura(MARKET_FESTIVAL)).toBe(false); // unmodeled boost grammar
    expect(isNativeManaAura(BEAR_UMBRA)).toBe(false);     // enchants a creature (Sub-slice B, deferred)
  });
  it("does NOT regress the creature-aura gate", () => {
    // A clean creature aura is still native-creature, never mistaken for a mana aura.
    const STRENGTH = { type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +2/+1." };
    expect(isNativeAura(STRENGTH)).toBe(true);
    expect(isNativeManaAura(STRENGTH)).toBe(false);
    expect(isNativeAura(WILD_GROWTH)).toBe(false); // a land aura is not the creature path
  });
});

describe("coverage — native-mana-aura tier", () => {
  it("clean land-mana auras classify native-mana-aura; residue/deferred stay body-only", () => {
    expect(classifyCard(WILD_GROWTH)).toBe("native-mana-aura");
    expect(classifyCard(OVERGROWTH)).toBe("native-mana-aura");
    expect(classifyCard(FERTILE_GROUND)).toBe("native-mana-aura");
    expect(classifyCard(WOLFWILLOW)).toBe("body-only");
    // ⭐ PIN INVERTED (LA-2, 2026-08-03) — see the isNativeManaAura note above.
    expect(classifyCard(VERDANT_HAVEN)).toBe("native-mana-aura");
    expect(classifyCard(TRACE)).toBe("body-only");
    expect(classifyCard(MARKET_FESTIVAL)).toBe("body-only");
    // Bear Umbra is NOT a land-mana aura (it enchants a creature); its own creature-aura nativeness
    // (buff + granted untap-all-lands trigger + totem armor) is modeled → native-aura, not this tier.
    expect(classifyCard(BEAR_UMBRA)).toBe("native-aura");
  });
});

describe("landAuraManaBonus — reads the attached aura(s) off the land", () => {
  it("sums each attached boost-aura; ignores a non-boost aura; no-op for a bare land", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const wg = createPermanent({ id: "wg", card: WILD_GROWTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, wg] });
    expect(landAuraManaBonus(s, findPermanent(s, "forest").permanent)).toEqual([]); // not attached yet
    s = attachPermanent(s, { equipId: "wg", targetId: "forest" });
    expect(landAuraManaBonus(s, findPermanent(s, "forest").permanent)).toEqual([{ colors: ["G"], amount: 1 }]);
    // a second boost aura stacks
    const og = createPermanent({ id: "og", card: OVERGROWTH, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, og] } } };
    s = attachPermanent(s, { equipId: "og", targetId: "forest" });
    expect(landAuraManaBonus(s, findPermanent(s, "forest").permanent)).toEqual([{ colors: ["G"], amount: 1 }, { colors: ["G"], amount: 2 }]);
  });
});

describe("manaSources — the land reports its boosted yield", () => {
  it("the boost rides on the LAND source (not a separate tappable source); the Aura is never a source", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const wg = createPermanent({ id: "wg", card: WILD_GROWTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, wg] });
    s = attachPermanent(s, { equipId: "wg", targetId: "forest" });
    const srcs = manaSources(s, "user");
    // exactly ONE source — the land. The aura is not a mana source on its own.
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toMatchObject({ permanentId: "forest", colors: ["G"], amount: 1, bonus: [{ colors: ["G"], amount: 1 }] });
  });
});

describe("planPayment / auto-pay — the boost is spendable inline", () => {
  it("Forest + Wild Growth pays a {G}{G} cost from ONE land tap (1 base + 1 bonus)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const wg = createPermanent({ id: "wg", card: WILD_GROWTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, wg] });
    s = attachPermanent(s, { equipId: "wg", targetId: "forest" });
    const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);                 // only the land taps
    expect(plan.taps[0]).toMatchObject({ permanentId: "forest", color: "G", amount: 1, bonus: [{ color: "G", amount: 1 }] });
    expect(plan.spend.G).toBe(2);
  });
  it("Forest + Fertile Ground pays {G}{U} — the any-color bonus is chosen to cover the U pip", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const fg = createPermanent({ id: "fg", card: FERTILE_GROUND, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, fg] });
    s = attachPermanent(s, { equipId: "fg", targetId: "forest" });
    const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 1, U: 1 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);
    expect(plan.spend.G).toBe(1);
    expect(plan.spend.U).toBe(1);  // the bonus was chosen as U to cover the off-color pip
  });
  it("without the aura, the same land can NOT pay {G}{G} (no fabricated mana)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest] });
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 })).toBeNull();
  });
});

describe("cast → resolve → attach to a land, then tap yields land + bonus mana", () => {
  it("Wild Growth offers a cast targeting an own land; resolving attaches it; the aura is NOT a source on its own", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest], hand: [WILD_GROWTH], pool: { G: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    expect(cast).toMatchObject({ cardId: "c-wg", targets: [{ id: "forest" }], needsTargets: true });
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Wild Growth");
    expect(aura.attachedTo).toBe("forest");
    expect(findPermanent(s, "forest").permanent.attachments).toEqual([aura.id]);
  });
  it("the explicit tap-for-mana action carries the bonus; applying it floats land + bonus mana WITHOUT tapping the aura", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const wg = createPermanent({ id: "wg", card: WILD_GROWTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, wg] });
    s = attachPermanent(s, { equipId: "wg", targetId: "forest" });
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find(a => a.permanentId === "forest");
    expect(tap).toBeTruthy();
    expect(tap.bonus).toEqual([{ color: "G", amount: 1 }]);
    s = dispatchAction(s, tap);
    expect(s.players.user.manaPool.G).toBe(2);                              // 1 land + 1 bonus
    expect(findPermanent(s, "forest").permanent.tapped).toBe(true);        // the LAND taps
    expect(findPermanent(s, "wg").permanent.tapped).toBe(false);           // the AURA is NOT tapped
    expect(s.players.user.battlefield.some(p => p.id === "wg")).toBe(true); // and NOT consumed — fires every time
  });
  it("Fertile Ground's explicit tap floats land G + a chosen bonus color", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const fg = createPermanent({ id: "fg", card: FERTILE_GROUND, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, fg] });
    s = attachPermanent(s, { equipId: "fg", targetId: "forest" });
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find(a => a.permanentId === "forest");
    expect(tap.bonus).toHaveLength(1);
    expect(tap.bonus[0].amount).toBe(1);
    s = dispatchAction(s, tap);
    const pool = s.players.user.manaPool;
    const total = Object.values(pool).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);                       // 1 land G + 1 bonus (some color)
    expect(pool.G).toBeGreaterThanOrEqual(1);    // the land's own G is always present
  });
});
