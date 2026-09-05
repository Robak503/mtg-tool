/**
 * MINAS TIRITH — SHELF-85 · Otharri O7 (2026-09-05). "{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more
 * creatures this turn." The RAID flag generalised to a COUNT: the condition reads the per-permanent attacked-this-turn memo
 * over the controller's battlefield (a creature that attacked and left is not counted — a lower bound, false-negative safe).
 * The "enters tapped unless you control a legendary creature" static and the mana line were already whole.
 *
 * Mutation-checked: see the run ledger (docs-sk54).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MINAS = { name: "Minas Tirith", type: "Legendary Land", oracle: "Minas Tirith enters tapped unless you control a legendary creature.\n{T}: Add {W}.\n{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more creatures this turn." };
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const bear = (id, attacked) => perm(id, { name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, attacked ? { attackedThisTurn: true } : {});
function state(attackers, others = 0) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [perm("minas", MINAS), ...Array.from({ length: attackers }, (_, i) => bear(`a${i}`, true)), ...Array.from({ length: others }, (_, i) => bear(`o${i}`, false))];
  return {
    ...s, phase: "postcombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, library: [{ id: "L1", name: "L1", type: "Sorcery", cmc: 1 }], manaPool: { ...s.players.user.manaPool, W: 1, C: 1 } } },
  };
}
const draws = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.permanentId === "minas" && /draw/i.test(a.abilityText || a.name || "") || (a.permanentId === "minas" && a.cost && (a.cost.generic || a.cost.W)));
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };

describe("classify + the condition", () => {
  it("the land is whole; the condition reads the attacked memo as a count", () => {
    const cond = "you attacked with two or more creatures this turn";
    const row = { tier: classifyCard({ ...MINAS, keywords: [] }), two: evaluateInterveningIf(state(2), cond, "user", {}), oneWithBystanders: evaluateInterveningIf(state(1, 3), cond, "user", {}), none: evaluateInterveningIf(state(0, 2), cond, "user", {}) };
    console.log("  WITNESS minasCond", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("land");
    expect(row.two).toBe(true);
    expect(row.oneWithBystanders).toBe(false); // bystanders that did not attack never count
    expect(row.none).toBe(false);
  });
});

describe("the activation", () => {
  it("offered after TWO attackers and draws a card; not offered after one attacker even with other creatures around", () => {
    const yes = state(2);
    const acts = draws(yes);
    expect(acts.length).toBeGreaterThan(0);
    const after = settle(dispatchAction(yes, acts[0]));
    const row = { offeredTwo: acts.length, drew: after.players.user.hand.length, offeredOne: draws(state(1, 3)).length };
    console.log("  WITNESS minasDraw", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.drew).toBe(1);
    expect(row.offeredOne).toBe(0);
  });
});
