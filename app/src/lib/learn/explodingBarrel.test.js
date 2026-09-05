/**
 * EXPLODING BARREL — the per-counter activation discount rider. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "{8}, {T}, Sacrifice this artifact: It deals 20 damage to target creature. This ability costs {1} less to activate for
 * each pressure counter on this artifact."
 *
 * The rider is a COST modifier, not an effect: the ability parser peels it into `reduction.perCounterOnSelf` (so the effect
 * parses on its real payload) and legalChoices.reduceActivatedAbilityCost prices the offer off the source's LIVE counter
 * bag — exactly the named kind, generic only, floored at {0} (CR 601.2f). The action carries the priced cost and the
 * dispatcher pays exactly that. Stripping the rider is legal ONLY because the discount is enforced — a stripped rider
 * with no discount would be a silent full price on a card that promised less.
 *
 * Mutation-checked: see the run ledger (docs-sk99).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer, reduceActivatedAbilityCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BARREL = { id: "c-eb", name: "Exploding Barrel", type: "Artifact", mana: "{2}", keywords: [],
  oracle: "{T}: Add one mana of any color. Put a pressure counter on this artifact.\n{8}, {T}, Sacrifice this artifact: It deals 20 damage to target creature. This ability costs {1} less to activate for each pressure counter on this artifact. Activate only as a sorcery." };
const OTHER_RIDER = { ...BARREL, id: "c-or", name: "Odd Barrel",
  oracle: "{8}, {T}, Sacrifice this artifact: It deals 20 damage to target creature. This ability costs {1} less to activate for each artifact you control. Activate only as a sorcery." };

describe("the ability parser", () => {
  it("the sacrifice ability carries the peeled rider as a per-counter reduction and stays modeled; an unmodeled 'costs less' rider keeps parking; the Barrel flips native", () => {
    const abs = parseActivatedAbilities(BARREL);
    const sac = abs.find((a) => a.sacSelf);
    const odd = parseActivatedAbilities(OTHER_RIDER).find((a) => a.sacSelf);
    const row = { count: abs.length, manaPips: sac?.manaPips, reduction: sac?.reduction, modeled: sac?.modeled, sorceryOnly: sac?.sorceryOnly, effect: sac?.effectClause, oddModeled: odd?.modeled ?? null, tier: classifyCard(BARREL), oddTier: classifyCard(OTHER_RIDER) };
    console.log("  WITNESS explodingBarrel", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.count).toBe(2);
    expect(row.sorceryOnly).toBe(true); // the timing rider printed AFTER the discount survives the peel — still enforced
    expect(row.manaPips).toBe("{8}");
    expect(row.reduction).toEqual({ perCounterOnSelf: { kind: "pressure", amount: 1 } });
    expect(row.modeled).toBe(true);
    expect(row.effect).toBe("It deals 20 damage to target creature");
    expect(row.oddModeled).not.toBe(true);
    expect(row.tier).toMatch(/^native/);
    expect(row.oddTier).not.toMatch(/^native/);
  });

  it("the reducer: exactly the named kind, generic only, floored at zero", () => {
    const red = { perCounterOnSelf: { kind: "pressure", amount: 1 } };
    const cost = { generic: 8, pips: {} };
    const row = {
      three: reduceActivatedAbilityCost({ counters: { pressure: 3, charge: 2 } }, cost, red).generic,
      none: reduceActivatedAbilityCost({ counters: { charge: 2 } }, cost, red).generic,
      ten: reduceActivatedAbilityCost({ counters: { pressure: 10 } }, cost, red).generic,
      noRider: reduceActivatedAbilityCost({ counters: { pressure: 3 } }, cost, null).generic,
    };
    console.log("  WITNESS explodingBarrelReducer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ three: 5, none: 8, ten: 0, noRider: 8 });
  });
});

const forest = (i) => createPermanent({ id: `f${i}`, card: { id: `c-f${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
function board(pressure, landCount) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const barrel = { ...createPermanent({ id: "barrel", card: BARREL, controller: "user" }), counters: { pressure, charge: 2 } };
  const victim = createPermanent({ id: "victim", card: { id: "c-v", name: "Big Bear", type: "Creature — Bear", mana: "{3}{G}{G}", power: 5, toughness: 5, keywords: [], oracle: "" }, controller: "ai", summoningSick: false });
  const lands = Array.from({ length: landCount }, (_, i) => forest(i + 1));
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [barrel, ...lands] }, ai: { ...s0.players.ai, battlefield: [victim] } } };
}
const barrelActions = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "barrel" && x.sacSelf);

describe("RUNTIME — the offer prices the live counters; the paid activation kills the target and sacrifices the Barrel", () => {
  it("three pressure counters (and two charge counters that count for nothing) + five Forests: offered at {5}; the activation resolves for 20", () => {
    const s = board(3, 5);
    const acts = barrelActions(s);
    expect(acts).toHaveLength(1);
    const out = resolveTopOfStack(dispatchAction(s, acts[0]));
    const row = {
      generic: acts[0].cost.generic, target: acts[0].targets?.[0]?.id,
      victimGone: !out.players.ai.battlefield.some((p) => p.id === "victim"), victimInGy: out.players.ai.graveyard.some((c) => c.id === "c-v"),
      barrelGone: !out.players.user.battlefield.some((p) => p.id === "barrel"), barrelInGy: out.players.user.graveyard.some((c) => c.id === "c-eb"),
    };
    console.log("  WITNESS explodingBarrelRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ generic: 5, target: "victim", victimGone: true, victimInGy: true, barrelGone: true, barrelInGy: true });
  });

  it("no pressure counters + five Forests: the printed {8} is unaffordable, nothing is offered", () => {
    expect(barrelActions(board(0, 5))).toHaveLength(0);
  });

  it("ten pressure counters and NO lands: the price floors at {0} and the activation is offered", () => {
    const acts = barrelActions(board(10, 0));
    const row = { offered: acts.length, generic: acts[0]?.cost.generic ?? null };
    console.log("  WITNESS explodingBarrelFloor", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: 1, generic: 0 });
  });
});
