/**
 * ripplesOfUndeath.test.js — ⭐ the MILLED-REFERENT pick + the LIFE-RIDER compound cost (Ripples of
 * Undeath, Teval shelf, 2026-08-15): "At the beginning of your first main phase, mill three cards.
 * Then you may pay {1} and 3 life. If you do, put a card from among those cards into your hand."
 *
 * Three pieces, one slice:
 *   · the _lastMilledIds STAMP (millOnePlayer — the freshest mill is the referent; the pick
 *     re-intersects the LIVE graveyard at its own resolution, CR 608.2b);
 *   · the PICK atom + the milled-pick pause kind (2+ candidates pause; 1 moves directly; the AI/stale
 *     fallback takes the first candidate — deterministic);
 *   · the LIFE RIDER on the optional-mana-payment cost ("{1} and 3 life" — the whole compound pays or
 *     NOTHING is charged, CR 601.2h; the life gate is CR 119.4). The splitter keeps the compound-cost
 *     sentence whole + folds its "If you do," on; the SAME whole-oracle matcher is reached per-clause
 *     (the impulse/self-hit re-entry pattern), so every CREED gate applies unchanged.
 *
 * Mutation-checked (2026-08-15): the settler's life charge dropped (mana-only pay) → the pays-in-full
 * witness dies; the _lastMilledIds stamp dropped → the pick offers nothing and the same witness dies.
 * Both restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalManaPaymentChoice, resolveMilledPickChoice } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RIPPLES = { name: "Ripples of Undeath", type: "Enchantment", mana: "{1}{B}",
  oracle: "At the beginning of your first main phase, mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into your hand." };
const EFFECT = "mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into your hand";

describe("parse + classify", () => {
  it("⭐ the three-sentence effect parses HIGH mid-program (mill + the compound-cost payment wrapping the pick); Ripples is NATIVE", () => {
    const p = parseEffectClause(EFFECT, "Instant");
    const row = { conf: programConfidence(p), ops: p.atoms.map((a) => a.op), cost: p.atoms[1]?.cost, tier: classifyCard(RIPPLES) };
    console.log("  WITNESS ripples", JSON.stringify({ conf: row.conf, ops: row.ops, life: row.cost?.life, tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.ops).toEqual(["mill", "optional-mana-payment"]);
    expect(row.cost).toMatchObject({ kind: "mana", life: 3 });
    expect(p.atoms[1].effectAtoms).toEqual([{ op: "pick-milled-to-hand", targetType: null }]);
    expect(row.tier).toBe("native-trigger");
  });

  it("seen-to-fail: a non-pip compound ('pay {1} and sacrifice a creature') still splits → low", () => {
    expect(programConfidence(parseEffectClause("You may pay {1} and sacrifice a creature. If you do, draw a card.", "Instant"))).toBe("low");
  });
});

describe("⭐⭐ the runtime loop — mill, pay IN FULL, pick from exactly the milled set", () => {
  function run(life = 20, pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 }) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user,
      life, manaPool: pool,
      library: [
        { id: "L1", name: "Top Bear", type: "Creature — Bear", oracle: "" },
        { id: "L2", name: "Mid Swamp", type: "Basic Land — Swamp", oracle: "" },
        { id: "L3", name: "Low Rat", type: "Creature — Rat", oracle: "" },
        { id: "L4", name: "Stays", type: "Creature — Bear", oracle: "" },
      ],
      graveyard: [{ id: "OLD", name: "Old Card", type: "Sorcery", oracle: "" }] } } };
    return runEffectProgram(s, {
      id: "stk-r", kind: "triggered-ability", controller: "user", source: { name: "Ripples of Undeath" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectClause(EFFECT, "Instant"), controller: "user", targets: [] } },
    });
  }

  it("⭐⭐ pay → {1} + 3 LIFE both charged; the pick pauses over EXACTLY the three milled (never the old GY card); the chosen card lands in hand", () => {
    const paused = run();
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment" });
    const afterPay = resolveOptionalManaPaymentChoice(paused, true);
    expect(afterPay.players.user.life).toBe(17); // the 3-life half REALLY charged
    expect(afterPay.pendingChoice).toMatchObject({ kind: "milled-pick" });
    const offered = afterPay.pendingChoice.candidates.map((c) => c.id).sort();
    console.log("  WITNESS ripplesPick", JSON.stringify({ life: afterPay.players.user.life, offered })); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["L1", "L2", "L3"]); // the milled three — the pre-existing OLD card never offered
    const done = resolveMilledPickChoice(afterPay, "L2");
    expect(done.players.user.hand.some((c) => c.id === "L2")).toBe(true);
    expect(done.players.user.graveyard.some((c) => c.id === "L2")).toBe(false);
  });

  it("DECLINE → no life lost, no pick, all three stay milled", () => {
    const paused = run();
    const out = resolveOptionalManaPaymentChoice(paused, false);
    expect(out.players.user.life).toBe(20);
    expect(out.pendingChoice).toBeUndefined();
    expect(out.players.user.graveyard.filter((c) => ["L1", "L2", "L3"].includes(c.id))).toHaveLength(3);
  });

  it("CR 119.4 — 2 life left cannot pay 3: taking charges NOTHING (no mana, no life, no pick)", () => {
    const paused = run(2);
    const out = resolveOptionalManaPaymentChoice(paused, true);
    expect(out.players.user.life).toBe(2);
    expect(out.pendingChoice).toBeUndefined(); // the payoff never ran — the whole compound or nothing
  });
});
