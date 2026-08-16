/**
 * simicAscendancy.test.js — COUNTERS-PUT "put that many <named> counters on this <permanent>" self-counter
 * accumulator (SHELF-TAIL SH11 — Simic Ascendancy; CR 122.6). The named-counter twin of Shalai's SH1 damage
 * payoff (shalaiCountersDamage.test.js): the SAME countersPut trigger + ctx.countersPutCount threading, the
 * SAME sentinel discipline — only the payoff differs (place N GROWTH counters on the source enchantment
 * instead of dealing N damage).
 *
 * Simic's other two clauses were ALREADY native before this slice: the "{1}{G}{U}: put a +1/+1 counter on
 * target creature you control" activated (native-activated) and the upkeep "if this enchantment has twenty
 * or more growth counters on it, you win the game" (native-trigger — the alt-win lane + the named-counter
 * intervening-if both route). Clause 2, the growth accumulator, was the only gap; building it flips the whole
 * card to native-mixed. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): (1) the countersPut rewrite branch → the sentinel never forms → classify dies;
 * (2) the parser arm → the atom pin dies; (3) the countContext branch in applyAddNamedCounterSelf → the
 * RUNTIME pin (growth gained == counters placed) dies to the fixed-form default — the hollow-gate check.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCounterTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SIMIC_ORACLE = "{1}{G}{U}: Put a +1/+1 counter on target creature you control.\nWhenever one or more +1/+1 counters are put on a creature you control, put that many growth counters on this enchantment.\nAt the beginning of your upkeep, if this enchantment has twenty or more growth counters on it, you win the game.";
const simicCard = { id: "c-simic", name: "Simic Ascendancy", type: "Enchantment", mana: "{1}{G}{U}", oracle: SIMIC_ORACLE };

function board(watchers, events = [], extra = []) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, pendingCounterEvents: events,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: watchers }, ai1: { ...s0.players.ai1, battlefield: extra } } };
}

describe("SH11 — parse + rewrite + classify", () => {
  it("MUST STAY HIGH: the sentinel → add-named-counter-self reading countContext; the fixed form is unchanged", () => {
    const p = parseEffectClause("put that many counters-put growth counters on this enchantment", "Enchantment", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-named-counter-self", counterType: "growth", countContext: "countersPutCount" });
    // regression: the fixed-amount form is byte-identical (no countContext)
    expect(parseEffectClause("put five growth counters on this enchantment", "Enchantment", { sourceScoped: true }).atoms[0])
      .toMatchObject({ op: "add-named-counter-self", counterType: "growth", amount: 5 });
  });
  it("detectTriggers rewrites Simic's countersPut payoff to the sentinel; classify is native-mixed", () => {
    const d = detectTriggers(simicCard).find((x) => x.event === "countersPut");
    expect(d.effectClause).toMatch(/counters-put growth counters/);
    expect(classifyCard({ name: simicCard.name, type: simicCard.type, oracle: SIMIC_ORACLE })).toBe("native-mixed");
  });
  it("REFERENT GATE — a bare (non-sentinel) spell 'put that many growth counters …' stays LOW (no fabricated off-event counter)", () => {
    expect(programConfidence(parseEffectClause("put that many growth counters on this enchantment", "Enchantment", {}))).toBe("low");
  });
  it("CREED gate — a countersPut payoff with a trailing rider is NOT rewritten (anchor fails → parks)", () => {
    const ridered = "Whenever one or more +1/+1 counters are put on a creature you control, put that many growth counters on this enchantment and you draw a card.";
    expect(classifyCard({ name: "Ridered", type: "Enchantment", oracle: ridered })).not.toBe("native-mixed");
  });
});

describe("SH11 — threading + the RUNTIME hollow-gate check", () => {
  it("checkCounterTriggers threads countersPutCount = the counters placed in the event", () => {
    const bear = { id: "b", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    const w = { id: "w", controller: "user", card: simicCard };
    const fired = (checkCounterTriggers(board([w, bear], [{ id: "b", type: "+1/+1", amount: 3 }])).pendingTriggers || []);
    expect(fired.length).toBe(1);
    expect(fired[0].context.countersPutCount).toBe(3);
  });
  it("THE HOLLOW-GATE CHECK — the growth counters gained EQUAL the counters placed (mutation-check line)", () => {
    const simic = createPermanent({ id: "w", card: simicCard, controller: "user" });
    const s = board([simic], []);
    const atom = { op: "add-named-counter-self", counterType: "growth", countContext: "countersPutCount" };
    const after = resolveAtom(s, atom, { controller: "user", sourceId: "w", countersPutCount: 4 });
    expect(after.players.user.battlefield.find((p) => p.id === "w").counters.growth).toBe(4);
    // a 0-count event places nothing (CR — never a fabricated minimum)
    const after0 = resolveAtom(s, atom, { controller: "user", sourceId: "w", countersPutCount: 0 });
    const g0 = after0.players.user.battlefield.find((p) => p.id === "w").counters.growth || 0;
    expect(g0).toBe(0);
  });
});
