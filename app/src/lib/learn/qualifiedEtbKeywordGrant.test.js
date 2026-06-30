/**
 * QUALIFIED-ETB KEYWORD-GRANT (Dragon Tempest, Waterkin Shaman, Arcades) — a controller-scoped ETB trigger
 * FILTERED by a KEYWORD/QUALITY on the entering creature ("Whenever a creature you control with flying enters,
 * it gains haste until end of turn."). Adds the creatureYouControlKeyword scope to classifyCondition (gated to
 * FILTERABLE_ETB_KEYWORDS — the modeled combat keywords + defender), enforced at runtime by scopeMatches via
 * permanentHasKeyword (LAYER-AWARE: printed + layer-6 grants + counters). The entering-creature pronoun in the
 * effect ("it gains haste") binds via the existing TRIG-PRONOUN-IT path (the scope is in NONSELF_TRIGGERING_
 * SCOPES + ETB_ENTERING_CREATURE_SCOPES). A trigger whose effect routes HIGH + no other residue → native-trigger.
 *
 * CREED: the trigger fires ONLY for a matching-quality creature the source controls — a NON-matching creature's
 * entry does NOT fire it (a forbidden FP otherwise), nor does an OPPONENT's matching creature; and the grant
 * GENUINELY lands on the entering creature at runtime. A scope-INEXPRESSIBLE quality ("with the chosen name",
 * "with power equal to its toughness", "with flavor text") stays UNDETECTED → the Arbiter (a SAFE false-negative).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ─── Detection ───────────────────────────────────────────────────────────────

describe("QUALIFIED-ETB KEYWORD-GRANT — detection", () => {
  const triggers = (oracle) => detectTriggers({ name: "X", type: "Enchantment", oracle });

  it("detects 'a creature you control with flying enters' → creatureYouControlKeyword (flying)", () => {
    const ds = triggers("Whenever a creature you control with flying enters, it gains haste until end of turn.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "etb", scope: "creatureYouControlKeyword", keywordFilter: "flying" });
  });

  it("detects 'a creature you control with defender enters' → creatureYouControlKeyword (defender)", () => {
    const ds = triggers("Whenever a creature you control with defender enters, draw a card.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "etb", scope: "creatureYouControlKeyword", keywordFilter: "defender" });
  });

  it("Dragon Tempest — detects BOTH the flying keyword-filter AND the Dragon subtype-filter trigger", () => {
    const ds = triggers(
      "Whenever a creature you control with flying enters, it gains haste until end of turn.\n" +
      "Whenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control."
    );
    expect(ds).toHaveLength(2);
    expect(ds.map((d) => d.scope).sort()).toEqual(["creatureYouControlKeyword", "subtypeYouControl"]);
  });
});

// ─── CREED — scope-inexpressible / un-gated qualities stay UNDETECTED (Arbiter) ──

describe("QUALIFIED-ETB KEYWORD-GRANT — CREED rejects (UNDETECTED → Arbiter)", () => {
  const triggers = (oracle) => detectTriggers({ name: "X", type: "Enchantment", oracle });

  it("does NOT detect 'with the chosen name' (scope-inexpressible)", () => {
    expect(triggers("Whenever a creature you control with the chosen name enters, draw a card.")).toHaveLength(0);
  });
  it("does NOT detect 'with flavor text' (uncheckable quality)", () => {
    expect(triggers("Whenever a creature you control with flavor text enters, draw a card.")).toHaveLength(0);
  });
  it("does NOT detect 'with power equal to its toughness' (not a keyword)", () => {
    expect(triggers("Whenever a creature you control with power equal to its toughness enters, you may pay {1}. If you do, draw a card.")).toHaveLength(0);
  });
  it("does NOT detect a bare 'a creature with flying enters' (no 'you control' controller gate)", () => {
    // No controller restriction — the scope can't be enforced cleanly; stays UNDETECTED (SAFE FN).
    expect(triggers("Whenever a creature with flying enters, draw a card.")).toHaveLength(0);
  });
  it("does NOT mis-detect an unmodeled non-grantable keyword (shadow)", () => {
    // 'shadow' is not in FILTERABLE_ETB_KEYWORDS → falls through to the 'with …' reject → Arbiter.
    expect(triggers("Whenever a creature you control with shadow enters, draw a card.")).toHaveLength(0);
  });
});

// ─── Classification flips ──────────────────────────────────────────────────────

describe("QUALIFIED-ETB KEYWORD-GRANT — classifyCard", () => {
  it("Dragon Tempest → native-trigger (both qualified-ETB triggers route)", () => {
    expect(classifyCard({
      name: "Dragon Tempest", type: "Enchantment",
      oracle: "Whenever a creature you control with flying enters, it gains haste until end of turn.\n" +
        "Whenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.",
    })).toBe("native-trigger");
  });

  it("Waterkin Shaman → native-trigger (keyword-filter ETB + source self-pump)", () => {
    expect(classifyCard({
      name: "Waterkin Shaman", type: "Creature — Elemental Shaman", mana: "{1}{U}",
      oracle: "Whenever a creature you control with flying enters, this creature gets +1/+1 until end of turn.",
    })).toBe("native-trigger");
  });

  it("a bare keyword-filter ETB draw payoff flips native-trigger", () => {
    expect(classifyCard({
      name: "Test Skywatcher", type: "Enchantment",
      oracle: "Whenever a creature you control with flying enters, draw a card.",
    })).toBe("native-trigger");
  });

  it("CREED: Arcades stays body-only — the defender-ETB trigger routes, but the unmodeled combat-static is residue", () => {
    // The qualified-ETB trigger is now detected + routes, but Arcades carries an unmodeled "assigns combat
    // damage equal to its toughness" static → all-or-nothing keeps the WHOLE card body-only (NOT over-claimed).
    expect(classifyCard({
      name: "Arcades, the Strategist", type: "Legendary Creature — Elder Dragon", mana: "{1}{G}{W}{U}",
      oracle: "Vigilance\nWhenever a creature you control with defender enters, draw a card.\n" +
        "Each creature you control assigns combat damage equal to its toughness rather than its power.",
    })).toBe("body-only");
  });

  it("CREED: an inexpressible-quality payoff stays off the native tiers", () => {
    const tier = classifyCard({
      name: "Test Chosen", type: "Enchantment",
      oracle: "Whenever a creature you control with the chosen name enters, draw a card.",
    });
    expect(tier).not.toMatch(/^native/);
  });
});

// ─── Engine: fires on the matching quality only, and the grant lands ────────────

describe("QUALIFIED-ETB KEYWORD-GRANT — engine", () => {
  function watcherState(watcherOracle, { power, toughness } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = createPermanent({
      id: "src",
      card: { id: "csrc", name: "Watcher", type: power != null ? "Creature — Wizard" : "Enchantment", oracle: watcherOracle, power, toughness },
      controller: "user",
      summoningSick: false,
    });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [watcher] } } };
  }
  const etbCount = (s) => (s.pendingTriggers || []).filter((t) => t.event === "etb").length;
  const enteredId = (s, cardId) => s.players.user.battlefield.find((p) => p.card?.id === cardId)?.id
    || s.players.ai.battlefield.find((p) => p.card?.id === cardId)?.id;

  it("FIRES when a creature WITH FLYING enters under the source's controller", () => {
    const s = watcherState("Whenever a creature you control with flying enters, it gains haste until end of turn.");
    const s2 = enterPermanent(s, { id: "fly", name: "Dragon", type: "Creature — Dragon", oracle: "Flying", power: 4, toughness: 4 }, "user");
    expect(etbCount(s2)).toBe(1);
  });

  it("CREED: does NOT fire when a creature WITHOUT flying enters", () => {
    const s = watcherState("Whenever a creature you control with flying enters, it gains haste until end of turn.");
    const s2 = enterPermanent(s, { id: "bear", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, "user");
    expect(etbCount(s2)).toBe(0);
  });

  it("CREED: does NOT fire for an OPPONENT's flying creature (you-control gate)", () => {
    const s = watcherState("Whenever a creature you control with flying enters, it gains haste until end of turn.");
    const s2 = enterPermanent(s, { id: "ofly", name: "Drake", type: "Creature — Drake", oracle: "Flying", power: 2, toughness: 2 }, "ai");
    expect(etbCount(s2)).toBe(0);
  });

  it("the haste GRANT genuinely lands on the entering flyer (resolves end-to-end)", () => {
    const s = watcherState("Whenever a creature you control with flying enters, it gains haste until end of turn.");
    let s2 = enterPermanent(s, { id: "fly", name: "Dragon", type: "Creature — Dragon", oracle: "Flying", power: 4, toughness: 4 }, "user");
    const id = enteredId(s2, "fly");
    expect(permanentHasKeyword(s2, id, "Haste")).toBe(false); // not yet — trigger still on the pending queue
    s2 = flushTriggers(s2);
    while (s2.stack.length) s2 = resolveTopOfStack(s2);
    expect(permanentHasKeyword(s2, id, "Haste")).toBe(true);  // the grant applied to the ENTERING creature
  });

  it("Waterkin Shaman — a flyer entering pumps the SOURCE (this creature gets +1/+1)", () => {
    const s = watcherState("Whenever a creature you control with flying enters, this creature gets +1/+1 until end of turn.", { power: 1, toughness: 1 });
    let s2 = enterPermanent(s, { id: "bird", name: "Bird", type: "Creature — Bird", oracle: "Flying", power: 1, toughness: 1 }, "user");
    expect(etbCount(s2)).toBe(1);
    s2 = flushTriggers(s2);
    while (s2.stack.length) s2 = resolveTopOfStack(s2);
    expect([permanentPower(s2, "src"), permanentToughness(s2, "src")]).toEqual([2, 2]);
  });

  it("fires for a creature GRANTED flying by a layer-6 effect (permanentHasKeyword is layer-aware) but NOT a vanilla one", () => {
    // Two watchers + two entries prove the gate reads keywords, not just the printed line: a printed flier fires,
    // a vanilla ground creature does not — exercising the same permanentHasKeyword path the runtime uses.
    const s = watcherState("Whenever a creature you control with flying enters, draw a card.");
    const flier = enterPermanent(s, { id: "f", name: "Hawk", type: "Creature — Bird", oracle: "Flying", power: 1, toughness: 1 }, "user");
    const ground = enterPermanent(s, { id: "g", name: "Ox", type: "Creature — Ox", oracle: "", power: 2, toughness: 4 }, "user");
    expect(etbCount(flier)).toBe(1);
    expect(etbCount(ground)).toBe(0);
  });
});
