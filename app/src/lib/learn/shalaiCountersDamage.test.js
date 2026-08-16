/**
 * shalaiCountersDamage.test.js — COUNTERS-PUT "deals that much damage" (SHELF-TAIL SH1 — Shalai and
 * Hallar; CR 122.6 + 609). "Whenever one or more +1/+1 counters are put on a creature you control, Shalai
 * and Hallar deals THAT MUCH damage to target opponent." "that much" = the counters placed in the event.
 *
 * The passive countersPut event threaded NO magnitude; this slice adds it, mirroring the counters-placed /
 * lifegain-drain sentinel discipline: (1) checkCounterTriggers threads ctx.countersPutCount = ev.amount;
 * (2) detectTriggers rewrites the countersPut damage payoff → the unprintable sentinel "deals that much
 * counters-put damage to target opponent" (the sentinel IS the referent gate — only a countersPut-context
 * clause reaches the parser arm, so no other event reads an absent ctx and silently deals 0); (3) the arm
 * maps the sentinel → {op:"deal-damage", countContext:"countersPutCount", targetType:"player"} — the exact
 * fixed-form atom with the amount swapped for the context. resolveScaledAmount already reads countContext,
 * so the applier was untouched. Flip +1/0/0 (the commander).
 *
 * Mutation-checked (via Edit): the countersPut rewrite branch → the sentinel never forms → classify dies;
 * the parser arm → the atom pin dies; the ev.amount threading → the RUNTIME pin (damage = counters placed)
 * dies to 0 (the hollow-gate check — a native flip that deals nothing).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCounterTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHALAI_ORACLE = "Flying, vigilance\nWhenever one or more +1/+1 counters are put on a creature you control, Shalai and Hallar deals that much damage to target opponent.";
const shalaiCard = { id: "c-shalai", name: "Shalai and Hallar", type: "Legendary Creature — Angel Elf", power: 3, toughness: 4, mana: "{2}{R}{G}{W}", oracle: SHALAI_ORACLE };

function board(watchers, events, extra = []) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, pendingCounterEvents: events,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: watchers }, ai1: { ...s0.players.ai1, battlefield: extra } } };
}

describe("SH1 — parse + rewrite + classify", () => {
  it("MUST STAY HIGH: the sentinel → deal-damage reading countContext; the fixed form is unchanged", () => {
    const p = parseEffectClause("this creature deals that much counters-put damage to target opponent", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", countContext: "countersPutCount", targetType: "player" });
    // regression: the fixed-amount form is byte-identical
    expect(parseEffectClause("this creature deals 3 damage to target opponent", "Instant", { sourceScoped: true }).atoms[0])
      .toMatchObject({ op: "deal-damage", amount: 3, targetType: "player" });
  });
  it("detectTriggers rewrites Shalai's countersPut payoff to the sentinel; classify is native-trigger", () => {
    const d = detectTriggers(shalaiCard).find((x) => x.event === "countersPut");
    expect(d.effectClause).toMatch(/counters-put damage/);
    expect(classifyCard({ name: shalaiCard.name, type: shalaiCard.type, power: 3, toughness: 4, oracle: SHALAI_ORACLE })).toBe("native-trigger");
  });
  it("CREED gate — a countersPut payoff with a trailing rider is NOT rewritten (anchor fails → parks)", () => {
    const ridered = "Whenever one or more +1/+1 counters are put on a creature you control, this creature deals that much damage to target opponent and you draw a card.";
    expect(classifyCard({ name: "Ridered", type: "Creature — Elf", power: 1, toughness: 1, oracle: ridered })).not.toBe("native-trigger");
  });
});

describe("SH1 — threading + the RUNTIME hollow-gate check", () => {
  it("checkCounterTriggers threads countersPutCount = the counters placed in the event", () => {
    const bear = { id: "b", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    const w = { id: "w", controller: "user", card: shalaiCard };
    const fired = (checkCounterTriggers(board([w, bear], [{ id: "b", type: "+1/+1", amount: 3 }])).pendingTriggers || []);
    expect(fired.length).toBe(1);
    expect(fired[0].context.countersPutCount).toBe(3); // the magnitude reaches the trigger context
  });
  it("THE HOLLOW-GATE CHECK — the damage dealt EQUALS the counters placed (mutation-check line)", () => {
    const s = board([{ id: "w", controller: "user", card: shalaiCard }], []);
    const before = s.players.ai1.life;
    const atom = { op: "deal-damage", countContext: "countersPutCount", targetType: "player" };
    const after = resolveAtom(s, atom, { controller: "user", sourceId: "w", countersPutCount: 4, targets: [{ type: "player", id: "ai1" }] });
    expect(before - after.players.ai1.life).toBe(4);
    // and a 0-count event deals 0 (CR 609 — never a fabricated minimum)
    const after0 = resolveAtom(s, atom, { controller: "user", sourceId: "w", countersPutCount: 0, targets: [{ type: "player", id: "ai1" }] });
    expect(after0.players.ai1.life).toBe(before);
  });
});
