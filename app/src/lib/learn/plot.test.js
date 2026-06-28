/**
 * plot.test.js — PLOT (CR 702.171). "Plot {cost}" is a SPECIAL ACTION: any time you could cast a sorcery
 * you may pay the plot cost and exile the card face-up from your hand ("plotted"). On a LATER turn you may
 * cast it from exile WITHOUT paying its mana cost (CR 702.171b), as a sorcery, once per card (it leaves
 * exile when cast).
 *
 * Infra reuse: plot step 1 is modeled like cycling (a from-hand action that pays a mana cost + moves the
 * card) but it uses NO stack (a special action, CR 116.2g) and moves hand → exile with a turn stamp. Plot
 * step 2 reuses the EXACT cast-from-exile free-cast machinery DISCOVER uses (castActionsFromZone with
 * fromZone "exile" + freeCast=true → applyCastSpell), so a plotted creature enters via PERMANENT_ETB and a
 * plotted spell resolves through the effect-program interpreter, identical to a hand-cast.
 *
 * THE CREED: a card is offered plot ONLY when its NON-plot text is fully native (classifyCard, which strips
 * the plot line, returns a native tier). A card whose body carries unmodeled text (intervening-if ETB, a
 * "when you plot" trigger, an unmodeled spell effect, plot-GRANTING text) is NEVER offered plot — it would
 * silently drop that text. A plotted card cannot be cast the turn it was plotted, cannot be cast for its
 * mana cost, and cannot be double-cast.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parsePlotCost } from "./effects/abilities.js";

beforeEach(() => _resetIdsForTests());

const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
const plains = (id) => createPermanent({ id, card: { name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user", summoningSick: false });

// A user at their precombat main with `hand`, `lands` untapped, a one-card library, on `turn`.
function plotState({ hand, lands, turn = 3 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: lands, library: [{ id: "lib1", name: "Bear", type: "Creature — Bear" }] } },
  };
}
const untapAll = (s, who = "user") => ({ ...s, players: { ...s.players, [who]: { ...s.players[who], battlefield: s.players[who].battlefield.map(p => ({ ...p, tapped: false })) } } });

// Sheriff of Safe Passage — metric +1/+1 counters (modeled) + Plot {1}{W}. Pure plot-blocker.
const SHERIFF = {
  id: "sh1", name: "Sheriff of Safe Passage", type: "Creature — Human Knight", mana: "{2}{W}",
  oracle: "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control.\nPlot {1}{W} (You may pay {1}{W} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
};
// Spinewoods Paladin — Trample + a modeled ETB (gain 3 life) + Plot {3}{G}.
const SPINEWOODS = {
  id: "sp1", name: "Spinewoods Paladin", type: "Creature — Human Knight", mana: "{4}{G}",
  oracle: "Trample\nWhen this creature enters, you gain 3 life.\nPlot {3}{G} (You may pay {3}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
};

describe("PLOT — the metric (classifyCard strips the plot line; a clean body flips native)", () => {
  it("Sheriff (metric counters + Plot) flips to native-body — plot is its only blocker", () => {
    expect(classifyCard(SHERIFF)).toBe("native-body");
  });
  it("Spinewoods (Trample + modeled ETB + Plot) flips to native-trigger", () => {
    expect(classifyCard(SPINEWOODS)).toBe("native-trigger");
  });
  it("a plot card whose OTHER text is unmodeled (intervening-if ETB) stays body-only — whole-card CREED", () => {
    expect(classifyCard({ type: "Creature — Human Druid", name: "Beastbond Outcaster", mana: "{2}{G}",
      oracle: "When this creature enters, if you control a creature with power 4 or greater, draw a card.\nPlot {1}{G} (You may pay {1}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" })).toBe("body-only");
  });
  it("parsePlotCost returns the plot mana cost for a real plot line", () => {
    expect(parsePlotCost(SHERIFF)).toBe("{1}{W}");
  });
  it("parsePlotCost returns null for a card that GRANTS plot (Fblthp — 'has plot' / 'plot from the top')", () => {
    expect(parsePlotCost({ name: "Fblthp, Lost on the Range", type: "Legendary Creature — Homunculus", mana: "{1}{U}{U}",
      oracle: "Ward {2}\nYou may look at the top card of your library any time.\nThe top card of your library has plot. The plot cost is equal to its mana cost.\nYou may plot nonland cards from the top of your library." })).toBeNull();
  });
  it("parsePlotCost returns null for a 'when you plot' trigger card (unmodeled trigger → whole-card gate)", () => {
    expect(parsePlotCost({ name: "x", oracle: "Whenever you plot a card, draw a card.\nPlot {G}" })).toBeNull();
  });
});

describe("PLOT step 1 — the special action (exile from hand for the plot cost)", () => {
  it("offers a plot action for a plotPlayable hand card whose plot cost is affordable", () => {
    const plots = filterActions(legalActionsForPlayer(plotState({ hand: [SHERIFF], lands: [plains("p1"), plains("p2")] }), "user"), "plot");
    expect(plots).toHaveLength(1);
    expect(plots[0]).toMatchObject({ kind: "plot", cardId: "sh1", name: "Sheriff of Safe Passage" });
  });

  it("plotting pays the plot cost, exiles the card face-up, uses NO stack, and stamps the plot turn", () => {
    let state = plotState({ hand: [SHERIFF], lands: [plains("p1"), plains("p2")], turn: 3 });
    const plot = filterActions(legalActionsForPlayer(state, "user"), "plot")[0];
    state = dispatchAction(state, plot);

    expect(state.players.user.hand.some(c => c.id === "sh1")).toBe(false);     // out of hand
    const exiled = state.players.user.exile.find(c => c.id === "sh1");
    expect(exiled).toBeTruthy();                                                // into exile
    expect(exiled._plotted).toBe(true);
    expect(exiled._plottedTurn).toBe(3);                                        // stamped the turn it was plotted
    expect(state.players.user.battlefield.every(p => p.tapped)).toBe(true);     // paid {1}{W}
    expect(state.stack).toHaveLength(0);                                        // special action — NOT on the stack
  });

  it("is NOT offered when the plot cost is unaffordable", () => {
    // Spinewoods plot is {3}{G}=4; only two Forests.
    const broke = plotState({ hand: [SPINEWOODS], lands: [forest("f1"), forest("f2")] });
    expect(filterActions(legalActionsForPlayer(broke, "user"), "plot")).toHaveLength(0);
  });

  it("is NOT offered at instant speed (opponent's turn) — plot is sorcery-speed (CR 702.171a)", () => {
    let state = plotState({ hand: [SHERIFF], lands: [plains("p1"), plains("p2")] });
    state = { ...state, activePlayer: "ai", priorityHolder: "user" }; // user has priority but it's the AI's turn
    expect(filterActions(legalActionsForPlayer(state, "user"), "plot")).toHaveLength(0);
  });

  it("is NOT offered for a card whose non-plot text is unmodeled (intervening-if ETB) — whole-card CREED", () => {
    const beast = { id: "b1", name: "Beastbond Outcaster", type: "Creature — Human Druid", mana: "{2}{G}",
      oracle: "When this creature enters, if you control a creature with power 4 or greater, draw a card.\nPlot {1}{G} (You may pay {1}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };
    expect(filterActions(legalActionsForPlayer(plotState({ hand: [beast], lands: [forest("f1"), forest("f2"), forest("f3")] }), "user"), "plot")).toHaveLength(0);
  });

  it("is NOT offered for a card carrying a 'when you plot' trigger (unmodeled → no dropped trigger)", () => {
    const trig = { id: "t1", name: "PlotTrig", type: "Creature — Human", mana: "{1}{G}",
      oracle: "Whenever you plot a card, draw a card.\nPlot {G} (You may pay {G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };
    expect(filterActions(legalActionsForPlayer(plotState({ hand: [trig], lands: [forest("f1"), forest("f2")] }), "user"), "plot")).toHaveLength(0);
  });
});

describe("PLOT step 2 — casting a plotted card free from exile (CR 702.171b)", () => {
  // Plot Sheriff on turn 3, return to a clean board, advance to turn 5.
  function plottedThenLaterTurn() {
    let state = plotState({ hand: [SHERIFF], lands: [plains("p1"), plains("p2")], turn: 3 });
    state = dispatchAction(state, filterActions(legalActionsForPlayer(state, "user"), "plot")[0]);
    return untapAll({ ...state, turn: 5 });
  }

  it("does NOT offer a free cast on the SAME turn the card was plotted (CR 702.171b)", () => {
    let state = plotState({ hand: [SHERIFF], lands: [plains("p1"), plains("p2")], turn: 3 });
    state = dispatchAction(state, filterActions(legalActionsForPlayer(state, "user"), "plot")[0]);
    const fromExile = filterActions(legalActionsForPlayer(untapAll(state), "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(fromExile).toHaveLength(0); // still turn 3 — the plotted turn
  });

  it("offers a FREE cast from exile on a later turn (freeCast, zero mana cost)", () => {
    const state = plottedThenLaterTurn();
    const fromExile = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(fromExile).toHaveLength(1);
    expect(fromExile[0].freeCast).toBe(true);
    expect(fromExile[0].cost).toMatchObject({ generic: 0 }); // CR 702.171b — without paying its mana cost
  });

  it("the free cast pays NO mana, leaves exile onto the stack, and resolves onto the battlefield with its counters", () => {
    let state = plottedThenLaterTurn();
    const cast = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    state = dispatchAction(state, cast);

    expect(state.players.user.exile.some(c => c.id === "sh1")).toBe(false); // left exile
    expect(state.stack).toHaveLength(1);                                    // on the stack as a spell
    expect(state.players.user.battlefield.every(p => !p.tapped)).toBe(true); // no mana paid (lands untapped)

    state = resolveTopOfStack(state);
    const perm = state.players.user.battlefield.find(p => p.card?.name === "Sheriff of Safe Passage");
    expect(perm).toBeTruthy();
    expect(perm.counters?.["+1/+1"]).toBe(1); // metric ETB counters resolved (no other creatures → 1)
  });

  it("a plotted creature's modeled ETB fires when cast free (Spinewoods gains 3 life)", () => {
    let state = plotState({ hand: [SPINEWOODS], lands: [forest("f1"), forest("f2"), forest("f3"), forest("f4")], turn: 3 });
    state = dispatchAction(state, filterActions(legalActionsForPlayer(state, "user"), "plot")[0]);
    state = untapAll({ ...state, turn: 5 });
    const lifeBefore = state.players.user.life;

    const cast = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    state = dispatchAction(state, cast);
    while (state.stack.length) state = resolveTopOfStack(state); // resolve the spell + its ETB trigger

    expect(state.players.user.battlefield.some(p => p.card?.name === "Spinewoods Paladin")).toBe(true);
    expect(state.players.user.life - lifeBefore).toBe(3);
  });

  it("CANNOT be double-cast — once cast it has left exile, so no second free cast is offered", () => {
    let state = plottedThenLaterTurn();
    const cast = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    state = dispatchAction(state, cast); // first (free) cast — now on the stack, gone from exile
    const second = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(second).toHaveLength(0);
  });
});
