/**
 * counterScaledMana.test.js — MANA scaled by the source's OWN +1/+1 counters: "{T}: Add {G} for each
 * +1/+1 counter on this creature." (Gyre Sage). The counter twin of the existing self-power metric.
 *
 * ⭐ A SHELF CARD, and that is why a one-card slice earned the time. The corpus grind has been paying out
 * in composition bugs while Colton's decks did not move at all; a line-deletion sweep of every unmodeled
 * shelf card found ZERO two-flip composition failures and 139 single missing mechanics, so shelf progress
 * is per-card work by construction. This is one of those cards, and it rides machinery that already
 * exists — Shape A of the Add-clause parser plus the shared amountSpec resolver — so it is assembly.
 *
 * ⛔ THE SELF-REFERENCE GATE IS THE SAFETY ARGUMENT, copied deliberately from the self-power metric it
 * sits beside. Every other "counter on <X>" in real oracle text is a referent to a DIFFERENT object
 * ("that creature", "target creature"); reading the SOURCE's counters for a value that belongs elsewhere
 * would fabricate an amount. Only "this creature" / "it" / the card's own full or pre-comma short name
 * are accepted; anything else returns null and the card parks.
 *
 * ⛔ LAW 6 — mana production is an ENUMERATOR path, so a tier flip proves nothing here. Driven on a board
 * at three counter counts: 0 counters produces NOTHING (never a fabricated 1), 1 produces 1, 3 produces 3,
 * and the amount is read LIVE from the counter map so evolve/adapt/proliferate growth counts — which is
 * the entire plan on this card.
 *
 * Mutation-checked (2026-08-04, each verified applied): the self-reference gate loosened to accept any
 * subject -> the "that creature" referent pin goes red; the resolver's counter read replaced with 0 ->
 * the runtime scaling pins go red while the classification pin stays green (exactly the law-6 blind spot
 * this file exists to cover).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GYRE_SAGE = { id: "c-gs", name: "Gyre Sage", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2",
  oracle: "Evolve\n{T}: Add {G} for each +1/+1 counter on this creature." };

function board(counters) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: "gs", card: GYRE_SAGE, controller: "user", summoningSick: false });
  if (counters) perm.counters = { "+1/+1": counters };
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}

describe("recognition", () => {
  it("Gyre Sage classifies native-mana with a live counter metric", () => {
    expect(classifyCard(GYRE_SAGE)).toBe("native-mana");
    expect(manaProduction(GYRE_SAGE)).toMatchObject({
      colors: ["G"], amount: 0, requiresTap: true, amountSpec: { kind: "selfCounters", counter: "+1/+1" },
    });
  });

  it("⛔ a referent to ANOTHER object is refused — never read the source's counters for it", () => {
    // "that creature" belongs to a different permanent; crediting it would fabricate an amount.
    expect(manaProduction({ ...GYRE_SAGE, id: "c-x1", name: "Probe Sage",
      oracle: "{T}: Add {G} for each +1/+1 counter on that creature." })).toBeNull();
    expect(manaProduction({ ...GYRE_SAGE, id: "c-x2", name: "Probe Sage",
      oracle: "{T}: Add {G} for each +1/+1 counter on target creature." })).toBeNull();
  });

  it("the card's own NAME and short name are accepted (the printed self-reference spellings)", () => {
    expect(manaProduction({ ...GYRE_SAGE, id: "c-n1",
      oracle: "{T}: Add {G} for each +1/+1 counter on Gyre Sage." })).toMatchObject({ amountSpec: { kind: "selfCounters" } });
    expect(manaProduction({ id: "c-n2", name: "Helga, Skittish Seer", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2",
      oracle: "{T}: Add {G} for each +1/+1 counter on Helga." })).toMatchObject({ amountSpec: { kind: "selfCounters" } });
  });
});

describe("⭐ RUNTIME (law 6) — an enumerator path, so the tier flip proves nothing on its own", () => {
  it("the source's reported amount tracks the LIVE counter count", () => {
    expect(manaSources(board(0), "user").find((s) => s.permanentId === "gs")?.amount).toBe(0);
    expect(manaSources(board(1), "user").find((s) => s.permanentId === "gs")?.amount).toBe(1);
    expect(manaSources(board(3), "user").find((s) => s.permanentId === "gs")?.amount).toBe(3);
  });

  it("tapping it actually floats that much green", () => {
    for (const n of [1, 3, 5]) {
      let s = board(n);
      const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find((a) => a.permanentId === "gs");
      expect(tap, `counters=${n}`).toBeTruthy();
      s = dispatchAction(s, tap);
      expect(s.players.user.manaPool.G, `counters=${n}`).toBe(n);
    }
  });

  it("⛔ with ZERO counters it produces NOTHING — never a fabricated 1", () => {
    let s = board(0);
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find((a) => a.permanentId === "gs");
    if (tap) s = dispatchAction(s, tap);
    expect(s.players.user.manaPool.G).toBe(0);
  });
});
