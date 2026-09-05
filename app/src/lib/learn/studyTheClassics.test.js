/**
 * STUDY THE CLASSICS — SHELF-85 · Bumble Flower F5 (2026-09-05). "Put a +1/+1 counter on target creature, then double the
 * number of +1/+1 counters on it. You gain life equal to the number of +1/+1 counters on that creature." Three atoms,
 * the last two BOUND to the first's target (CR 608.2): a bound "double the +1/+1 counters" (the per-target double the
 * conditional sentinel already used, now on the previous atom's target) and a bound-target +1/+1 count feeding the
 * gain-life arm ("that creature" is the spell's target, never the source).
 *
 * Mutation-checked: see the run ledger (docs-sk70).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STUDY = { name: "Study the Classics", type: "Sorcery", mana: "{2}{G}", keywords: [], oracle: "Put a +1/+1 counter on target creature, then double the number of +1/+1 counters on it. You gain life equal to the number of +1/+1 counters on that creature." };
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const bear = (id, extra) => perm(id, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, extra);
function state(board) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, hand: [{ ...STUDY, id: "st1" }], battlefield: board, manaPool: { ...b.players.user.manaPool, G: 1, C: 2 }, life: 20 } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const castAt = (s, name) => { const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "st1" && x.targetName === name); expect(a).toBeTruthy(); return drain(dispatchAction(s, a)); };
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;

describe("parse + classify", () => {
  it("three atoms — the targeted counter, the BOUND double, the BOUND-target life count; HIGH; native-spell", () => {
    const p = parseEffectProgram(STUDY);
    const row = { confidence: p.confidence, atoms: p.atoms.map((a) => [a.op, a.targetType ?? null, a.bindPreviousTargets ?? false, a.perTargetDouble ?? null, a.amountCount ?? null]), tier: classifyCard(STUDY) };
    console.log("  WITNESS studyParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([
      ["add-counter", "creature", false, null, null],
      ["add-counter", null, true, "+1/+1", null],
      ["gain-life", null, true, null, { kind: "plusCountersOnTarget", per: 1 }],
    ]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("resolution", () => {
  it("on a bare bear beside an untouched second creature: 1 counter, doubled to 2, gain 2 life; the other creature keeps its 0", () => {
    const s0 = state([bear("b1"), perm("b2", { name: "Hill Giant", type: "Creature — Giant", power: 3, toughness: 3, oracle: "" })]);
    const s1 = castAt(s0, "Grizzly Bears");
    const row = { b1: counters(s1, "b1"), other: counters(s1, "b2"), life: s1.players.user.life, stack: s1.stack.length };
    console.log("  WITNESS studyBare", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ b1: 2, other: 0, life: 22, stack: 0 }); // 0 → 1 → 2, gain 2
  });
  it("cast at the countered bear by id: 2 → 3 → 6 and 6 life", () => {
    const s0 = state([bear("b2", { counters: { "+1/+1": 2 } })]);
    const s1 = castAt(s0, "Grizzly Bears");
    const row = { b2: counters(s1, "b2"), life: s1.players.user.life, stack: s1.stack.length };
    console.log("  WITNESS studyCountered", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ b2: 6, life: 26, stack: 0 });
  });
});
