/**
 * GLOBAL TAP-FOR-MANA AUGMENT (CR 605.1b) — a PERMANENT with the controller-scoped triggered mana
 * ability "Whenever you tap a <land|creature> for mana, add [an additional] <fixed single-color pips>"
 * (Groundchuck & Dirtbag "tap a land … add {G}"; the mana clause of Leyline of Abundance / Badgermole
 * Cub "tap a creature … add an additional {G}"). Mechanically identical to the land-enchant Aura boost
 * (AURA-LAND-MANA-BOOST): it resolves INLINE when a matching source taps for mana (CR 605.1b), never on
 * the stack — so the runtime hooks the mana-production path (manaModel.globalTapManaAugment) and the boost
 * rides on the tapped source in BOTH read-sites (auto-pay planPayment + the explicit tap-for-mana action)
 * through one shared helper so they can't drift. The augment permanent is NEVER tapped/consumed and fires
 * on every qualifying tap.
 *
 * CREED all-or-nothing: only a card whose WHOLE non-keyword body is this fixed-color boost flips native
 * (Groundchuck — Trample + the land boost). A subtype-gated subject ("a Forest"/"a Swamp" — Nissa,
 * Nirkana Revenant) or a non-keyword rider (Leyline's opening-hand clause + activated ability,
 * Badgermole's earthbend ETB) keeps the card non-native (a safe false-negative) — the boost is never a
 * fabricated/partial credit.
 *
 * GRADUATED 2026-07-28: the doubler form ("one mana of any type that land produced" — Mirari's Wake) was
 * pinned here as out of scope, and the pins below now assert the OPPOSITE. It was never a safety boundary,
 * only a not-built-yet one: MF-1 (all-players × land × sameAsProduced) and MD-1 (controller × nonland ×
 * sameAsProduced) each built one axis of it and the last corner of the grid went unclosed. See
 * manaDoublerYouScoped.test.js.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseGlobalTapManaAugment, stripGlobalTapManaAugment } from "./staticAbilityParser.js";
import { manaSources, planPayment, globalTapManaAugment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const GROUNDCHUCK = { id: "c-gc", name: "Groundchuck & Dirtbag", type: "Legendary Creature — Ox Mole Mutant", mana: "{4}{G}{G}", oracle: "Trample\nWhenever you tap a land for mana, add {G}." };
// creature-subject augment (its OTHER clauses keep the whole card body-only, but the boost clause parses + fires)
const LEYLINE = { id: "c-ly", name: "Leyline of Abundance", type: "Enchantment", mana: "{2}{G}{G}", oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nWhenever you tap a creature for mana, add an additional {G}.\n{6}{G}{G}: Put a +1/+1 counter on each creature you control." };
const BADGERMOLE = { id: "c-bm", name: "Badgermole Cub", type: "Creature — Badger Mole", mana: "{1}{G}", oracle: "When this creature enters, earthbend 1. (Target land you control becomes a 0/0 creature with haste that's still a land. Put a +1/+1 counter on it. When it dies or is exiled, return it to the battlefield tapped.)\nWhenever you tap a creature for mana, add an additional {G}." };
// Non-native (subtype-gated / doubler / opponent-clause — parser returns null):
const NISSA = { id: "c-ni", name: "Nissa, Who Shakes the World", type: "Legendary Planeswalker — Nissa", mana: "{3}{G}{G}", oracle: "Whenever you tap a Forest for mana, add an additional {G}.\n+1: Put three +1/+1 counters on up to one target noncreature land you control. Untap it. It becomes a 0/0 Elemental creature with vigilance and haste that's still a land.\n−8: You get an emblem with \"Lands you control have indestructible.\" Search your library for any number of Forest cards, put them onto the battlefield tapped, then shuffle." };
const NIRKANA = { id: "c-nr", name: "Nirkana Revenant", type: "Creature — Vampire Shade", mana: "{4}{B}{B}", oracle: "Whenever you tap a Swamp for mana, add an additional {B}.\n{B}: This creature gets +1/+1 until end of turn." };
// A hypothetical multi-color fixed boost — NOT this slice's single-color model (must reject, no fabricated choice):
const MULTI = { id: "c-mx", name: "Multi Augment", type: "Enchantment", mana: "{2}{G}", oracle: "Whenever you tap a land for mana, add {G}{U}." };

const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "" };
// A clean mana-dork creature (Llanowar-style) for the creature-subject runtime test.
const DORK = { id: "c-dk", name: "Mana Dork", type: "Creature — Elf Druid", mana: "{G}", oracle: "{T}: Add {G}." };
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

describe("parseGlobalTapManaAugment — the boost grammar", () => {
  it("parses the land-subject and creature-subject fixed-color forms ('add' and 'add an additional')", () => {
    expect(parseGlobalTapManaAugment(GROUNDCHUCK)).toEqual({ subject: "land", colors: ["G"], amount: 1 });
    expect(parseGlobalTapManaAugment(LEYLINE)).toEqual({ subject: "creature", colors: ["G"], amount: 1 });
    expect(parseGlobalTapManaAugment(BADGERMOLE)).toEqual({ subject: "creature", colors: ["G"], amount: 1 });
  });
  it("rejects the still-unmodeled boost SHAPE — no fabricated boost", () => {
    // (Mirari's Wake's doubler form and the subtype-gated subjects both used to sit here; both are
    // MODELED now — see manaDoublerYouScoped.test.js and subtypeTapAugment.test.js. The multi-color
    // fixed run is the one genuinely unmodeled shape left.)
    expect(parseGlobalTapManaAugment(MULTI)).toBeNull();         // "{G}{U}" — multi-color (a choice this slice doesn't model)
  });
  it("GRADUATED — the subtype-gated subjects parse now, and keep their SUBTYPE (not a generic land)", () => {
    // These were pinned null on a stale premise: the note said the tap site couldn't check the tapped
    // land's subtype, and it always could. The claim worth keeping is that the subject survives as the
    // SUBTYPE — flattening it to "land" would make Crypt Ghast pay off on any land, a forbidden FP.
    expect(parseGlobalTapManaAugment(NISSA)).toEqual({ subject: "forest", colors: ["G"], amount: 1 });
    expect(parseGlobalTapManaAugment(NIRKANA)).toEqual({ subject: "swamp", colors: ["B"], amount: 1 });
  });
  it("an Aura is never this card (its boost is parseAuraLandManaBonus, kept disjoint)", () => {
    const wildGrowth = { id: "c-wg", name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };
    expect(parseGlobalTapManaAugment(wildGrowth)).toBeNull();
  });
  it("stripGlobalTapManaAugment removes only the boost line (leaving the keyword body / riders intact)", () => {
    expect(stripGlobalTapManaAugment(GROUNDCHUCK).trim()).toBe("Trample");
    // Leyline keeps its non-boost riders (so the caller's keyword-only check fails → body-only)
    const leftover = stripGlobalTapManaAugment(LEYLINE);
    expect(leftover).toContain("opening hand");
    expect(leftover).toContain("Put a +1/+1 counter");
    expect(leftover).not.toContain("tap a creature for mana");
  });
});

describe("classifyCard — only the whole-card-clean augment flips native (CREED anti-FP pins)", () => {
  it("Groundchuck & Dirtbag (Trample + land boost) is native-trigger", () => {
    expect(classifyCard(GROUNDCHUCK)).toBe("native-trigger");
  });
  it("an augment whose boost SHAPE isn't modeled stays NON-native (parser returns null)", () => {
    // Fails at the PARSER — the augment tier never engages, so it stays body-only regardless of remainder.
    // (Nirkana Revenant left this list when the subtype subjects landed; it flips now, pinned in
    // subtypeTapAugment.test.js alongside its {B} pump.)
    expect(classifyCard(MULTI)).toBe("body-only");          // multi-color boost not modeled
  });
  it("the augment tier COMPOSES with a genuinely-native remainder (Leyline / Badgermole graduated)", () => {
    // The augment-stripped remainder became native since the original body-only pin (Leyline's activated
    // pump + opening-hand pre-strip; Badgermole's earthbend ETB), so the compose flips them native-mixed.
    expect(classifyCard(LEYLINE)).toBe("native-mixed");
    expect(classifyCard(BADGERMOLE)).toBe("native-mixed");
  });
});

describe("globalTapManaAugment — controller-scoped, subject-matched bonus off the tapped source", () => {
  it("a land-subject augment fires when a LAND taps, not a creature; no-op without the augment", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const dork = createPermanent({ id: "dork", card: DORK, controller: "user", summoningSick: false });
    const gc = createPermanent({ id: "gc", card: GROUNDCHUCK, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, dork] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "forest").permanent)).toEqual([]); // no augmenter yet
    s = boardState({ user: [forest, dork, gc] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "forest").permanent)).toEqual([{ colors: ["G"], amount: 1 }]); // land matches
    expect(globalTapManaAugment(s, "user", findPermanent(s, "dork").permanent)).toEqual([]); // a creature dork does NOT match a land augment
  });
  it("a creature-subject augment fires when a CREATURE taps, not a land", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const dork = createPermanent({ id: "dork", card: DORK, controller: "user", summoningSick: false });
    const ly = createPermanent({ id: "ly", card: LEYLINE, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest, dork, ly] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "dork").permanent)).toEqual([{ colors: ["G"], amount: 1 }]); // creature matches
    expect(globalTapManaAugment(s, "user", findPermanent(s, "forest").permanent)).toEqual([]); // a land does NOT match a creature augment
  });
  it("is controller-scoped — an OPPONENT's augment never boosts your tap", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const oppGc = createPermanent({ id: "ogc", card: GROUNDCHUCK, controller: "ai", summoningSick: false });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [forest], manaPool: { ...EMPTY_POOL } },
        ai: { ...s0.players.ai, battlefield: [oppGc] },
      },
    };
    expect(globalTapManaAugment(s, "user", findPermanent(s, "forest").permanent)).toEqual([]); // the opponent's augmenter does not count
  });
  it("two augmenters stack (each adds its boost on the same tap)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const gc1 = createPermanent({ id: "gc1", card: GROUNDCHUCK, controller: "user", summoningSick: false });
    const gc2 = createPermanent({ id: "gc2", card: { ...GROUNDCHUCK, id: "c-gc2" }, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest, gc1, gc2] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "forest").permanent)).toEqual([{ colors: ["G"], amount: 1 }, { colors: ["G"], amount: 1 }]);
  });
});

describe("manaSources / planPayment — the boost is spendable inline (RUNTIME)", () => {
  it("the boost rides on the LAND source (Groundchuck is not itself a mana source)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const gc = createPermanent({ id: "gc", card: GROUNDCHUCK, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest, gc] });
    const srcs = manaSources(s, "user");
    expect(srcs).toHaveLength(1); // only the land — Groundchuck has no mana ability of its own
    expect(srcs[0]).toMatchObject({ permanentId: "forest", colors: ["G"], amount: 1, bonus: [{ colors: ["G"], amount: 1 }] });
  });
  it("Forest + Groundchuck pays a {G}{G} cost from ONE land tap (1 base + 1 bonus)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const gc = createPermanent({ id: "gc", card: GROUNDCHUCK, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest, gc] });
    const plan = planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);                 // only the land taps
    expect(plan.taps[0]).toMatchObject({ permanentId: "forest", color: "G", amount: 1, bonus: [{ color: "G", amount: 1 }] });
    expect(plan.spend.G).toBe(2);
  });
  it("without Groundchuck the same single Forest can NOT pay {G}{G} (no fabricated mana)", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const s = boardState({ user: [forest] });
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 })).toBeNull();
  });
});

describe("the explicit tap-for-mana action carries the boost (RUNTIME, two-sites invariant)", () => {
  it("tapping the Forest floats land + augment mana WITHOUT tapping or consuming Groundchuck", () => {
    const forest = createPermanent({ id: "forest", card: FOREST, controller: "user", summoningSick: false });
    const gc = createPermanent({ id: "gc", card: GROUNDCHUCK, controller: "user", summoningSick: false });
    let s = boardState({ user: [forest, gc] });
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find(a => a.permanentId === "forest");
    expect(tap).toBeTruthy();
    expect(tap.bonus).toEqual([{ color: "G", amount: 1 }]);
    s = dispatchAction(s, tap);
    expect(s.players.user.manaPool.G).toBe(2);                              // 1 land + 1 augment bonus
    expect(findPermanent(s, "forest").permanent.tapped).toBe(true);        // the LAND taps
    expect(findPermanent(s, "gc").permanent.tapped).toBe(false);           // Groundchuck is NOT tapped
    expect(s.players.user.battlefield.some(p => p.id === "gc")).toBe(true); // and NOT consumed — fires every time
  });
});
