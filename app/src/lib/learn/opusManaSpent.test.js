/**
 * opusManaSpent.test.js — ④-Z (2026-09-03 night): the OPUS cycle — "Whenever you cast an instant or sorcery spell, <X>.
 * If five or more mana was spent to cast that spell, <Y> instead." (Thunderdrum Soloist — Veyran Cantrips; Tackle
 * Artist; Spectacular Skywhale; Elemental Mascot's additive form). The dispatcher now records the AMOUNT of mana its
 * payment plan spent beside the existing boolean, the cast-trigger context carries it, two intervening-if readers
 * compare it, and the effect parser splits the pair into a base stamped "fewer than N" and an upgrade stamped "N or
 * more" — exactly one half resolves (the kicked-magnitude discipline, as runtime conditions). Real oracle fixtures
 * (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SOLOIST = { id: "c-ts", name: "Thunderdrum Soloist", type: "Creature — Dwarf Bard", mana: "{2}{R}", cmc: 3, power: 2, toughness: 3, keywords: ["Reach"],
  oracle: "Reach\nOpus — Whenever you cast an instant or sorcery spell, this creature deals 1 damage to each opponent. If five or more mana was spent to cast that spell, this creature deals 3 damage to each opponent instead." };
const TACKLE = { id: "c-ta", name: "Tackle Artist", type: "Creature — Rhino Warrior", mana: "{3}{G}", cmc: 4, power: 4, toughness: 4, keywords: ["Trample"],
  oracle: "Trample\nOpus — Whenever you cast an instant or sorcery spell, put a +1/+1 counter on this creature. If five or more mana was spent to cast that spell, put two +1/+1 counters on this creature instead." };
const SKYWHALE = { id: "c-sw", name: "Spectacular Skywhale", type: "Creature — Whale", mana: "{4}{U}", cmc: 5, power: 4, toughness: 4, keywords: ["Flying"],
  oracle: "Flying\nOpus — Whenever you cast an instant or sorcery spell, this creature gets +3/+0 until end of turn. If five or more mana was spent to cast that spell, put three +1/+1 counters on this creature instead." };
const CHEAP = { id: "h-cheap", name: "Shock", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Shock deals 2 damage to any target." };
const BIG = { id: "h-big", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, keywords: [], oracle: "Lava Axe deals 5 damage to target player or planeswalker." };

function board(hand, pool) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: [createPermanent({ id: "ts", card: SOLOIST, controller: "user", summoningSick: false }), createPermanent({ id: "ta", card: TACKLE, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, life: 20, battlefield: [] } } };
}
// cast the named spell aimed at the AI, flush the Opus triggers, resolve them (they sit above the spell), return the state
function castAndResolveOpus(s, cardId) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets?.[0]?.id === "ai" || !a.needsTargets));
  expect(act).toBeTruthy();
  let cur = flushTriggers(dispatchAction(s, act));
  const kinds = cur.stack.map((o) => o.kind);
  expect(kinds.filter((k) => k === "triggered-ability").length).toBe(2);
  while (cur.stack.length && cur.stack[cur.stack.length - 1].kind === "triggered-ability") cur = resolveTopOfStack(cur);
  return cur;
}

describe("the parse + the conditions + the tiers", () => {
  it("⭐ the pair splits into a base stamped 'fewer than five' and an upgrade stamped 'five or more'", () => {
    // (the damage form reaches the parser only through the trigger path's self-rewrite — its runtime pin is below;
    // the counter form parses standalone and pins the pair's shape)
    const p = parseEffectClause("put a +1/+1 counter on this creature. If five or more mana was spent to cast that spell, put two +1/+1 counters on this creature instead", "Creature", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => [a.amount, a.condition])).toEqual([[1, "fewer than five mana was spent to cast that spell"], [2, "five or more mana was spent to cast that spell"]]);
    const add = parseEffectClause("put a +1/+1 counter on this creature. If five or more mana was spent to cast that spell, put two +1/+1 counters on this creature", "Creature", { sourceScoped: true });
    expect(add.atoms.map((a) => a.condition ?? null)).toEqual([null, "five or more mana was spent to cast that spell"]);
  });
  it("⭐ the readers answer off the cast context's amount, and refuse to guess without it", () => {
    const st = createGameState({ userDeck: [], aiDeck: [] });
    expect(evaluateInterveningIf(st, "five or more mana was spent to cast that spell", "user", { manaSpentAmount: 5 })).toBe(true);
    expect(evaluateInterveningIf(st, "five or more mana was spent to cast that spell", "user", { manaSpentAmount: 4 })).toBe(false);
    expect(evaluateInterveningIf(st, "fewer than five mana was spent to cast that spell", "user", { manaSpentAmount: 4 })).toBe(true);
    expect(evaluateInterveningIf(st, "fewer than five mana was spent to cast that spell", "user", { manaSpentAmount: 5 })).toBe(false);
    expect(evaluateInterveningIf(st, "five or more mana was spent to cast that spell", "user", {})).toBeNull();
  });
  it("⭐ Thunderdrum Soloist, Tackle Artist and Spectacular Skywhale are native; the two riders the flip-diff surfaced were audited whole-card", () => {
    for (const c of [SOLOIST, TACKLE, SKYWHALE]) expect(classifyCard(c)).toMatch(/^native/);
    // Deluge Virtuoso: a pump pair (+1/+1 → +2/+2 instead) beside a modeled stun-counter ETB
    expect(classifyCard({ id: "c-dv", name: "Deluge Virtuoso", type: "Creature — Merfolk Bard", mana: "{2}{U}", cmc: 3, power: 2, toughness: 2, keywords: [],
      oracle: "When this creature enters, tap target creature an opponent controls and put a stun counter on it.\nOpus — Whenever you cast an instant or sorcery spell, this creature gets +1/+1 until end of turn. If five or more mana was spent to cast that spell, this creature gets +2/+2 until end of turn instead." })).toMatch(/^native/);
    // Colorstorm Stallion: the ADDITIVE form — the pump always, the token copy only on a five-mana spell
    const stallion = parseEffectClause("this creature gets +1/+1 until end of turn. If five or more mana was spent to cast that spell, create a token that's a copy of this creature", "Creature", { sourceScoped: true });
    expect(stallion.atoms.map((a) => [a.op, a.condition ?? null])).toEqual([["pump", null], ["create-token-copy", "five or more mana was spent to cast that spell"]]);
  });
});

describe("runtime — one half resolves, never both", () => {
  it("⭐ a one-mana Shock: the Soloist deals 1 (not 3) and the Artist gets ONE counter", () => {
    const out = castAndResolveOpus(board([CHEAP], { R: 1 }), "h-cheap");
    expect(out.players.ai.life).toBe(19);
    expect(findPermanent(out, "ta").permanent.counters["+1/+1"]).toBe(1);
  });
  it("⭐ a five-mana Lava Axe: the Soloist deals 3 (not 1, not 4) and the Artist gets TWO counters", () => {
    const out = castAndResolveOpus(board([BIG], { R: 1, C: 4 }), "h-big");
    expect(out.players.ai.life).toBe(17);
    expect(findPermanent(out, "ta").permanent.counters["+1/+1"]).toBe(2);
  });
});
