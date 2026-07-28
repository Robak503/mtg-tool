/**
 * batchedEtbFilter.test.js — "Whenever ONE OR MORE creatures you control WITH POWER/MANA VALUE N OR LESS
 * enter" (Welcoming Vampire #428, Tocasia's Welcome #866, Enduring Innocence #785).
 *
 * ⭐ THE POINT OF THIS SLICE IS WHAT IT DOESN'T BUILD. An earlier attempt built a full entry queue drained at
 * the flushTriggers funnel — the diesBatch shape — and it was reverted: it cost an allocation on every
 * permanent entry and flipped ZERO cards.
 *
 * These carriers all print "This ability triggers only once each turn", and that rider IS ENFORCED at the
 * flush chokepoint (keyed per source+event, cleared at untap). So:
 *
 *     batch-once,   then rider-capped  ->  once per turn
 *     per-creature, then rider-capped  ->  once per turn      <- observably IDENTICAL
 *
 * The printed rider does the capping either way, so the batched phrasing maps onto the EXISTING singular
 * `etb` event and no batching machinery is needed at all.
 *
 * ⚠️ VALID ONLY WITH THE RIDER — which is why the safety-gate test below is the load-bearing one. A
 * rider-less batched ETB mapped this way fires once per entering TOKEN ("create three 1/1s" would draw
 * three). `requiresOncePerTurn` carries that demand to the descriptor builder, which DROPS the descriptor
 * when the rider is absent, so the unsafe case cannot be emitted at all.
 *
 * The filter itself is carved out ahead of the blanket "with …" reject on the same grounds as the existing
 * keyword-batch and cast-with-mana-value exemptions: printed power and mana value are precisely checkable.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const RIDER = " This ability triggers only once each turn.";
const vampire = (oracle) => ({ name: "Watcher", type: "Creature — Vampire", mana: "{2}{W}", power: 2, toughness: 2, keywords: [], oracle });
const POWER_FILTER = `Whenever one or more other creatures you control with power 2 or less enter, draw a card.${RIDER}`;
const MV_FILTER = `Whenever one or more creatures you control with mana value 3 or less enter, draw a card.${RIDER}`;

/** The watcher on the battlefield; `enter` is the permanent that just entered. */
function entering(oracle, cardOver) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const watcher = { id: "w", controller: "user", card: vampire(oracle) };
  const perm = { id: "e", controller: "user", card: { id: "ce", name: "Entrant", type: "Creature — Bear", oracle: "", power: 1, toughness: 1, cmc: 2, ...cardOver } };
  const state = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [watcher, perm] } } };
  return (checkEnterTriggers(state, perm).pendingTriggers || []).length;
}

describe("detection — the filter is carved out ahead of the blanket 'with' reject", () => {
  it("power filter detects, on the SINGULAR etb event, carrying the rider", () => {
    const d = detectTriggers(vampire(POWER_FILTER));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "etb", scope: "otherCreatureYouControl", etbMaxPower: 2, oncePerTurnTrigger: true });
  });

  it("mana-value filter detects the same way", () => {
    expect(detectTriggers(vampire(MV_FILTER))[0]).toMatchObject({ event: "etb", scope: "creatureYouControl", etbMaxMv: 3 });
  });

  it("THE SAFETY GATE — WITHOUT the rider the descriptor is DROPPED entirely", () => {
    // The equivalence only holds because the printed rider caps the fire count. A rider-less card mapped to
    // the singular event would fire once per entering token, so it must not be emitted at all.
    expect(detectTriggers(vampire("Whenever one or more other creatures you control with power 2 or less enter, draw a card."))).toHaveLength(0);
  });

  it("REGRESSION PIN — an ordinary 'with …' condition is still rejected (the guard is intact)", () => {
    expect(detectTriggers(vampire("Whenever a creature you control with a +1/+1 counter on it enters, draw a card."))).toHaveLength(0);
  });
});

describe("RUNTIME — the characteristic filter actually gates the fire", () => {
  it("a power-1 creature entering FIRES the 'power 2 or less' watcher", () => {
    expect(entering(POWER_FILTER, { power: 1 })).toBe(1);
  });

  it("THE LOAD-BEARING ONE — a power-5 creature entering fires NOTHING", () => {
    // Without the scopeMatches gate this fires for ANY entering creature: a confident wrong fire on every
    // big creature, and invisible in the tier because the card classifies native either way.
    expect(entering(POWER_FILTER, { power: 5 })).toBe(0);
  });

  it("the mana-value filter gates the same way", () => {
    expect(entering(MV_FILTER, { cmc: 2 })).toBe(1);
    expect(entering(MV_FILTER, { cmc: 7 })).toBe(0);
  });

  it("the boundary is INCLUSIVE ('N or less')", () => {
    expect(entering(POWER_FILTER, { power: 2 })).toBe(1);
    expect(entering(MV_FILTER, { cmc: 3 })).toBe(1);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Welcoming Vampire #428's shape flips", () => {
    expect(classifyCard({ name: "Welcoming Vampire", type: "Creature — Vampire", mana: "{2}{W}", power: 2, toughness: 2, keywords: ["Flying"], oracle: `Flying\n${POWER_FILTER}` })).toMatch(/^native/);
  });

  it("Tocasia's Welcome #866's shape flips", () => {
    expect(classifyCard({ name: "Tocasia's Welcome", type: "Enchantment", mana: "{1}{W}", keywords: [], oracle: MV_FILTER })).toMatch(/^native/);
  });
});
