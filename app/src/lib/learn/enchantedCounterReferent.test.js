/**
 * enchantedCounterReferent.test.js — two Aura/self pronoun gaps, each one word wide.
 *
 * 1. THE ENCHANTED REFERENT ON A COUNTER (+4 cards). "put a +1/+1 counter on ENCHANTED CREATURE" —
 *    Forced Adaptation, Sadistic Glee, Ephara's Enlightenment, Predatory Hunger. The referent already
 *    existed for tap / untap / pump / regenerate; only add-counter lacked it, so the whole card parked.
 *
 * 2. THE SELF DOUBLING PRONOUN. "DOUBLE the number of +1/+1 counters on IT" — the parser already models the
 *    identical clause written "…on THIS CREATURE" (measured HIGH), so only the pronoun was missing. Same
 *    one-word gap the SELF_PUMP_IT / SELF_COUNTER_IT rewrites were built to close, and it joins them.
 *
 * ⚠️ NEITHER COMPLETES LEVEL UP, which is what sent me here. Its granted body is
 * "…double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card." — the
 * COMPOUND does not match the whole-clause anchor, and a SELF power-threshold condition is separately
 * unmodelled. Level Up stays body-only, deliberately: a partial fire would be the false positive. The
 * honest re-size is in the ledger (it is a FOUR-piece card, not three).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const clause = (c) => parseEffectClause(c, "Instant", { hasX: false });
// The effect clause a SELF-scope trigger hands the parser, after detectTriggers' pronoun rewrites.
const triggerClause = (oracle) => detectTriggers({ name: "X", type: "Creature — Bear", power: 2, toughness: 2, oracle })[0]?.effectClause;

describe("the ENCHANTED referent on add-counter", () => {
  it("parses to the fixed enchanted referent, not a chosen target", () => {
    expect(clause("put a +1/+1 counter on enchanted creature").atoms[0])
      .toMatchObject({ op: "add-counter", counterType: "+1/+1", amount: 1, target: "enchanted" });
  });

  it("the four Auras that were parked on it now classify native", () => {
    // Real bundled oracle text, verbatim.
    expect(classifyCard({ name: "Forced Adaptation", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant creature\nAt the beginning of your upkeep, put a +1/+1 counter on enchanted creature." })).toBe("native-trigger");
    expect(classifyCard({ name: "Sadistic Glee", type: "Enchantment — Aura", mana: "{B}", oracle: "Enchant creature\nWhenever a creature dies, put a +1/+1 counter on enchanted creature." })).toBe("native-trigger");
  });

  it("the CHOSEN-target form is untouched", () => {
    expect(clause("put a +1/+1 counter on target creature").atoms[0]).toMatchObject({ op: "add-counter", targetType: "creature" });
    expect(clause("put a +1/+1 counter on target creature").atoms[0].target).toBeUndefined();
  });
});

describe("⭐ RUNTIME — the counter lands on the HOST, and never anywhere else", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const host = { ...createPermanent({ id: "b", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" }), attachments: ["a"] };
    const aura = { ...createPermanent({ id: "a", card: { id: "a", name: "Forced Adaptation", type: "Enchantment — Aura", oracle: "" }, controller: "user" }), attachedTo: "b" };
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [host, aura] } } };
  }
  const atom = () => clause("put a +1/+1 counter on enchanted creature").atoms[0];
  const countersOn = (st, id) => st.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;

  it("⭐ the host gets the counter", () => {
    const after = resolveAtom(board(), atom(), { controller: "user", targets: [], cardName: "Forced Adaptation", sourceId: "a" });
    expect(countersOn(after, "b")).toBe(1);
  });

  it("⭐ CREED — a DETACHED aura fabricates nothing", () => {
    // sourceId that resolves to no attachment → enchantedTargets returns [] → clean no-op.
    const after = resolveAtom(board(), atom(), { controller: "user", targets: [], cardName: "Forced Adaptation", sourceId: "not-on-the-battlefield" });
    expect(countersOn(after, "b")).toBe(0);
  });
});

describe("the SELF doubling pronoun", () => {
  it("⭐ 'on IT' is rewritten to the self referent the parser already models", () => {
    expect(triggerClause("Whenever this creature attacks, double the number of +1/+1 counters on it."))
      .toBe("double the number of +1/+1 counters on this creature");
    const p = clause("double the number of +1/+1 counters on this creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", target: "self", countFor: { kind: "countersOnSource" } });
  });

  it("⛔ CREED — a NON-self trigger is NOT rewritten ('it' is the other creature there)", () => {
    // Doubling the SOURCE's counters off another creature's attack would be a confidently wrong target.
    const c = triggerClause("Whenever another creature you control attacks, double the number of +1/+1 counters on it.");
    expect(c).not.toBe("double the number of +1/+1 counters on this creature");
  });

  it("⛔ CREED — Level Up's COMPOUND body stays unrewritten → the card parks", () => {
    const c = triggerClause("Whenever this creature attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card.");
    expect(clause(c).confidence).toBe("low");
    expect(classifyCard({ name: "Level Up", type: "Enchantment — Aura", mana: "{1}{G}", oracle: 'Enchant creature\nWhen this Aura enters, put a +1/+1 counter on enchanted creature.\nEnchanted creature has "Whenever this creature attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card."' })).toBe("body-only");
  });
});
