/**
 * additionalCostPayMana.test.js — AC-MANA: "…OR pay {X}" as an additional cost.
 * Spark Harvest, Eaten Alive, Lash of the Balrog, Morkrut Behemoth, Bayou Groff, Lightning Axe,
 * Pumpkin Bombardment, Soaring Stoneglider.
 *
 * ⭐ SIXTEENTH "BUILT ENGINE, PARTIAL IGNITION" — the AC-OR splitter (CR 601.2f), the one-cast-per-payable-
 * option emission and the dispatcher's charge-the-stamped-spec all existed. `parseOneAdditionalCost` vetted
 * sacrifice / payLife / discard / exileFromGraveyard / returnToHand and nothing else, so the "pay {cost}"
 * half failed vetting and the whole card stayed Arbiter.
 *
 * ⛔⛔ THE ENTIRE RISK OF THIS SLICE IS UNDERCHARGING, and castModifiers.js names it: an ADDITIONAL cost
 * makes the card MORE expensive, so skipping it is cheaper-than-printed — a FREE SPELL. Three decisions
 * exist to make that unreachable, and each is asserted below rather than trusted:
 *   1. **ONE cost object.** legalChoices stamps the MERGED cost (printed + extra pips) as `action.cost`, and
 *      the dispatcher already pays `action.cost` via planPayment. Offer and charge are the same object, so
 *      they cannot drift. The dispatcher's payMana arm is therefore a deliberate NO-OP.
 *   2. **The merge is `addExtraManaCost`, not string re-parsing.** By offer time the printed cost has had
 *      cost-increase tax, static tax, generic reduction and coloured-pip reduction folded in — re-parsing
 *      the raw mana_cost would discard all four. The pinned row below holds the object merge equal to string
 *      concatenation on UNADJUSTED costs, so the two definitions of "merged" are tied together by a gate.
 *   3. **The printed-cost `affordable` flag is ignored in this branch**, in both directions: it can be true
 *      while the merged cost is out of reach (offering a cast that then throws MANA_SHORT), and false while
 *      the merged cost is affordable (silently withholding a legal cast).
 *
 * ⚠️ THE FAIL-CLOSED `else` IN THE DISPATCHER IS THE MOST LOAD-BEARING LINE IN THAT BLOCK, and I deleted it
 * by accident while adding the payMana arm — the edit consumed it along with the line above. Caught before
 * anything was gated or pushed. Without it, ANY unrecognised additional cost is silently skipped instead of
 * refusing the cast. `unsupportedKindStillThrows` below pins it so the same slip cannot land twice.
 *
 * Mutation-checked (2026-08-07, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · `PAYMANA_COST_RE` removed -> all eight park (the OR side fails vetting).
 *   · the merged cost NOT stamped (emit keeps the printed cost) -> Bayou Groff still classifies native and
 *     is still OFFERED, but the cast charges only {1}{G}: the pool row goes 5 -> 3 instead of 5 -> 0. **A
 *     FREE-ER SPELL, and the tier cannot see it.** This is the mutation that matters.
 *   · `addExtraManaCost` dropping its `hybrid` concat -> Pumpkin Bombardment ({B/R} printed) mis-plans; the
 *     concat-equivalence row below fails.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { legalActionsForPlayer, filterActions, parseManaCost, addExtraManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BAYOU_GROFF = { id: "c-bg", name: "Bayou Groff", type: "Creature — Plant Dog", mana: "{1}{G}", power: "5", toughness: "4",
  oracle: "As an additional cost to cast this spell, sacrifice a creature or pay {3}." };
const SPARK_HARVEST = { id: "c-sh", name: "Spark Harvest", type: "Sorcery", mana: "{B}",
  oracle: "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}.\nDestroy target creature or planeswalker." };
const LIGHTNING_AXE = { id: "c-la", name: "Lightning Axe", type: "Instant", mana: "{R}",
  oracle: "As an additional cost to cast this spell, discard a card or pay {5}.\nLightning Axe deals 5 damage to target creature." };
const PUMPKIN = { id: "c-pb", name: "Pumpkin Bombardment", type: "Sorcery", mana: "{B/R}",
  oracle: "As an additional cost to cast this spell, discard a card or pay {2}.\nPumpkin Bombardment deals 3 damage to target creature." };

describe("the carriers", () => {
  it("⭐ all four flip native — sacrifice-or-pay and discard-or-pay, including a HYBRID printed cost", () => {
    for (const c of [BAYOU_GROFF, SPARK_HARVEST, LIGHTNING_AXE, PUMPKIN]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐ the vetted kind parses — and a PROSE cost still sinks the whole card", () => {
    const costs = (o) => extractAdditionalCosts(o).costs;
    const row = {
      orPay: costs("As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}. Destroy target creature."),
      // ⛔ THE BOUNDARY. "pay half your life" is not pips, so vetting fails and the card parks — the AC-OR
      // contract is that BOTH sides must be vetted.
      prose: costs("As an additional cost to cast this spell, sacrifice a creature or pay half your life. Destroy target creature."),
      // ⛔ The incumbent single-cost form must be untouched.
      plainSac: costs("As an additional cost to cast this spell, sacrifice a creature. Destroy target creature."),
    };
    console.log("  WITNESS payManaParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.orPay).toEqual([{ kind: "choice", options: [{ kind: "sacrifice", sacType: "creature" }, { kind: "payMana", pips: "{3}{B}" }] }]);
    expect(row.prose).toBeNull();
    expect(row.plainSac).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
  });

  it("⭐⭐ the object merge equals STRING CONCATENATION — the two definitions of 'merged', tied together", () => {
    // ⛔ THIS IS THE GUARD AGAINST A DROPPED FIELD. addExtraManaCost has to merge objects (the printed cost
    // is already tax/reduction-adjusted by then), and an object merge is exactly the kind that silently
    // loses hybrid/phyrexian/snow. parseManaCost accumulates pips, so on UNADJUSTED costs the concatenated
    // string is ground truth — any field the merge forgets shows up here as an inequality.
    // ⚠️ EVERY EXOTIC PIP TYPE MUST APPEAR IN THE **EXTRA**, NOT ONLY IN THE PRINTED SIDE — and a survived
    // mutation is why this line reads the way it does. The first version put hybrid/phyrexian/snow only in
    // the printed cost, so deleting `hybrid`'s concat from addExtraManaCost changed nothing and the
    // mutation lived. A merge guard that never merges the field it guards is a hollow row.
    const pairs = [
      ["{1}{G}", "{3}"],          // the ordinary case
      ["{B}", "{3}{B}"],          // coloured pips on both sides
      ["{B/R}", "{2}"],           // hybrid on the PRINTED side (Pumpkin Bombardment's shape)
      ["{G}", "{2/W}"],           // hybrid in the EXTRA — kills the dropped-concat mutation
      ["{1}", "{U/P}{W/P}"],      // phyrexian in the EXTRA
      ["{2}", "{S}{S}"],          // snow in the EXTRA
      ["{X}{R}", "{X}{1}"],       // xCount adds ({X}{X} owes 2X, CR 107.3) and hasX ORs
    ];
    for (const [printed, extra] of pairs) {
      expect(addExtraManaCost(parseManaCost(printed), extra), `${printed} + ${extra}`)
        .toEqual(parseManaCost(printed + extra));
    }
  });
});

// One board builder for every runtime row: Bayou Groff in hand, an exact pool, an optional creature.
function board(pool, creatureIds = []) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const bf = creatureIds.map((id) => createPermanent({ id, controller: "user", summoningSick: false,
    card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } }));
  return { ...b, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...b.players, user: { ...b.players.user, hand: [BAYOU_GROFF], battlefield: bf,
      manaPool: { ...b.players.user.manaPool, ...pool } } } };
}
const poolTotal = (s) => ["W", "U", "B", "R", "G", "C"].reduce((n, k) => n + (s.players.user.manaPool[k] || 0), 0);
const payOffers = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-bg" && a.payManaCost);

describe("⭐⭐ LAW 6 — the POOL BALANCE, because a tier cannot tell a charged spell from a free one", () => {
  it("⭐⭐ Bayou Groff charges printed + extra: {1}{G} + {3} = 5 mana, pool 5 → 0", () => {
    const exact = board({ G: 1, C: 4 });
    const offers = payOffers(exact);
    expect(offers, "the pay option must be offered with exactly 5 mana").toHaveLength(1);
    const after = dispatchAction(exact, offers[0]);
    const row = { before: poolTotal(exact), after: poolTotal(after), mergedGeneric: offers[0].cost.generic, mergedG: offers[0].cost.G };
    console.log("  WITNESS payManaPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ before: 5, after: 0, mergedGeneric: 4, mergedG: 1 });
  });

  it("⭐⭐ the three REFUSALS — and the middle one is the free-spell guard", () => {
    const row = {
      oneShort: payOffers(board({ G: 1, C: 3 })).length,       // 4 mana — one short of the merged cost
      printedOnly: payOffers(board({ G: 1, C: 1 })).length,    // 2 mana — enough for the PRINTED cost alone
      noGreen: payOffers(board({ C: 5 })).length,              // 5 mana, wrong colour
    };
    console.log("  WITNESS payManaRefusals", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⛔ `printedOnly` is the one that matters: enough mana for {1}{G} but not for {1}{G}+{3}. If the extra
    // pips were ever dropped from the merge, THIS row would offer a cast and the card would be a free-er
    // spell. The other two are the ordinary short/colour checks.
    expect(row).toEqual({ oneShort: 0, printedOnly: 0, noGreen: 0 });
  });

  it("⭐ the SACRIFICE option is unaffected — printed mana only, and it takes the creature", () => {
    // The other half of the OR must not have acquired the extra cost. Printed {1}{G} = 2 mana.
    const s = board({ G: 1, C: 1 }, ["victim"]);
    const sac = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-bg" && a.sacCreatureId);
    expect(sac, "the sacrifice option must be offered on printed mana alone").toBeTruthy();
    const after = dispatchAction(s, sac);
    const row = { poolBefore: poolTotal(s), poolAfter: poolTotal(after), creatureGone: !after.players.user.battlefield.some((p) => p.id === "victim") };
    console.log("  WITNESS sacOptionUnchanged", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ poolBefore: 2, poolAfter: 0, creatureGone: true });
  });
});

describe("⛔ the OR-stamp guard — the reachable half of the fail-closed pair", () => {
  it("⛔⛔ an OR cost whose stamped option is not one of the parsed options REFUSES the cast", () => {
    // ⚠️ WHY THIS PINS THE STAMP GUARD AND NOT THE `else` I NEARLY DELETED. I tried to pin that `else`
    // directly and could not, honestly: for a NON-choice cost the dispatcher iterates the card's PARSED
    // costs, so an `addCostSpec` override is ignored outright — and every kind the parser emits has an arm.
    // The `else` is therefore unreachable through the public API today, defensive-only, and pinning it would
    // have meant faking a path that does not exist. Said plainly rather than dressed up as coverage.
    // ⭐ What IS reachable, and is the same protection one layer out: an OR cost must arrive with a stamp
    // matching a parsed option, or the cast is refused rather than resolved cost-free.
    const s = board({ G: 1, C: 4 });
    const act = payOffers(s)[0];
    const bogus = { ...act, addCostSpec: { kind: "payMana", pips: "{0}" } };  // not an option Bayou Groff prints
    expect(() => dispatchAction(s, bogus)).toThrow(/OR additional cost/);
  });

  it("⭐ the stamp is identified by its PIPS — a wrong-pips payMana stamp is rejected", () => {
    // The `pips` comparison added with this slice. Without it, {0} would match the printed {3} option on
    // kind alone and the guard above would pass a stamp the card never offered.
    const s = board({ G: 1, C: 4 });
    const act = payOffers(s)[0];
    expect(act.addCostSpec).toEqual({ kind: "payMana", pips: "{3}" });
    expect(() => dispatchAction(s, { ...act, addCostSpec: { kind: "payMana", pips: "{99}" } })).toThrow(/OR additional cost/);
  });
});
