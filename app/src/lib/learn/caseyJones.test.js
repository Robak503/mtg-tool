/**
 * CASEY JONES, BACK ALLEY BRUTE — the ACTIVE counters-placed damage payoff. SHELF-85 · Halfshell Q3, 2026-09-05.
 * "Whenever you put one or more +1/+1 counters on a creature you control, Casey Jones deals that much damage to target
 * opponent."
 *
 * The active counters-placed event ("whenever YOU PUT …", magnitude = ctx.countersPlaced) knew two payoffs — draw that
 * many, gain that much — while the damage payoff lived only on the PASSIVE event (Shalai and Hallar, ctx.countersPutCount).
 * The two events stay distinct; the active event now rewrites the same printed payoff to its OWN unprintable sentinel
 * ("counters-placed damage") and the deal-damage parser maps that sentinel to the placed count — a twin arm, never a
 * shared one, so neither event can read the other's field and deal 0.
 *
 * Mutation-checked: see the run ledger (docs-sk88).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCounterPlacedTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CASEY = { id: "c-cj", name: "Casey Jones, Back Alley Brute", type: "Legendary Creature — Human Berserker", mana: "{3}{R}", power: 4, toughness: 3, keywords: ["Menace"],
  oracle: "Menace\nWhenever Casey Jones attacks, put a +1/+1 counter on target attacking creature.\nWhenever you put one or more +1/+1 counters on a creature you control, Casey Jones deals that much damage to target opponent." };

const permObj = (card, controller, id) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
function board() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [permObj(CASEY, "user", "cj")] } } };
}

describe("detection, the rewrite and the classifier", () => {
  it("the active event rewrites the payoff to the counters-placed damage sentinel; the atom carries the placed count; Casey flips native", () => {
    const d = detectTriggers(CASEY).find((x) => x.event === "countersPlaced");
    const program = parseEffectClause(d.effectClause, "Instant");
    const row = { scope: d.scope, clause: d.effectClause, atom: program?.atoms?.[0], tier: classifyCard(CASEY) };
    console.log("  WITNESS caseyJones", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.scope).toBe("creatureYouControl");
    expect(row.clause).toBe("this creature deals that much counters-placed damage to target opponent");
    expect(row.atom).toMatchObject({ op: "deal-damage", countContext: "countersPlaced", targetType: "player" });
    expect(row.tier).toMatch(/^native/);
  });

  it("the PASSIVE form is unchanged — its own sentinel and its own count field", () => {
    const shalai = { ...CASEY, name: "Shalai Test", oracle: "Whenever one or more +1/+1 counters are put on a creature you control, this creature deals that much damage to target opponent." };
    const d = detectTriggers(shalai).find((x) => x.event === "countersPut");
    expect(d?.effectClause).toBe("this creature deals that much counters-put damage to target opponent");
    expect(parseEffectClause(d.effectClause, "Instant")?.atoms?.[0]).toMatchObject({ op: "deal-damage", countContext: "countersPutCount" });
  });
});

describe("RUNTIME — the fire site threads the placed count and the damage reads it", () => {
  it("two counters placed on your creature deal 2 to the targeted opponent; one deals 1; counters on an opponent's creature fire nothing", () => {
    const s = board();
    const two = checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 2, placedOnAny: 2 });
    const pending = (two.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(pending).toHaveLength(1);
    const ctx = pending[0].triggeringContext || pending[0].context || {};
    expect(ctx.countersPlaced).toBe(2);
    const program = parseEffectClause(pending[0].descriptor.effectClause, "Instant");
    const resolve = (n) => {
      const out = runEffectProgram(s, { source: { name: CASEY.name }, payload: { params: { program, controller: "user", sourceId: "cj", context: { countersPlaced: n }, targets: [{ type: "player", id: "ai", atomIndex: 0 }] } } });
      return (out?.state ?? out).players.ai.life;
    };
    const startLife = s.players.ai.life;
    const row = { two: startLife - resolve(2), one: startLife - resolve(1) };
    console.log("  WITNESS caseyRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ two: 2, one: 1 });
    const none = checkCounterPlacedTriggers(s, { placingPlayerId: "user", placedOnYours: 0, placedOnAny: 2 });
    expect((none.pendingTriggers || []).filter((t) => t.controller === "user")).toHaveLength(0);
  });
});
