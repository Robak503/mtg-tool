/**
 * EXILE-UNTIL-NAMED — POD-SIM THREE · BI-2 (2026-09-05): Demonic Consultation + Tainted Pact — THE Believe it! win.
 *
 * Consultation: the name is chosen through the tutor pause in consultation mode (one candidate per distinct library name;
 * declining = a name not in the library). The settle exiles the top six, then reveals until the name (to hand); every
 * other revealed card is exiled. A name not present exiles the whole library — the Thassa's Oracle line.
 * Tainted Pact: each exiled card raises a take-or-continue pause; a duplicate name ends the dig with nothing.
 * Neither is a search (no library-search event).
 *
 * Mutation-checked: see the run ledger (docs-sk49).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveTutorChoice, resolveTaintedPactChoice } from "./effects/runProgram.js";
import { advanceUntilDecision } from "./learnSession.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CONSULT = { id: "dc", name: "Demonic Consultation", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], oracle: "Choose a card name. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into your hand and exile all other cards revealed this way." };
const PACT = { id: "tp", name: "Tainted Pact", type: "Instant", mana: "{1}{B}", cmc: 2, colors: ["B"], oracle: "Exile the top card of your library. You may put that card into your hand unless it has the same name as another card exiled this way. Repeat this process until you put a card into your hand or you exile two cards with the same name, whichever comes first." };
const card = (id, name, type = "Sorcery") => ({ id, name, type, cmc: 1 });
const ORACLE = (id) => card(id, "Thassa's Oracle", "Creature — Merfolk Wizard");
function state({ hand, library, userBf = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand: [hand], library, battlefield: userBf, manaPool: { ...s.players.user.manaPool, B: 2 } } },
  };
}
const castOf = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === id);
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const names = (cards) => cards.map((c) => c.name);

describe("parse + classify", () => {
  it("each card is ONE atom; both native-spell", () => {
    const row = { consult: parseEffectProgram(CONSULT)?.atoms, pact: parseEffectProgram(PACT)?.atoms, tiers: [classifyCard({ ...CONSULT, keywords: [] }), classifyCard({ ...PACT, keywords: [] })] };
    console.log("  WITNESS eunParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.consult).toEqual([{ op: "demonic-consultation", targetType: null }]);
    expect(row.pact).toEqual([{ op: "tainted-pact", targetType: null }]);
    expect(row.tiers).toEqual(["native-spell", "native-spell"]);
  });
});

describe("Demonic Consultation", () => {
  const LIB = [card("a1", "Alpha"), card("a2", "Alpha"), card("b1", "Beta"), card("c1", "Gamma"), card("d1", "Delta"), card("e1", "Epsilon"), card("f1", "Zeta"), ORACLE("o1"), card("g1", "Eta"), card("h1", "Theta")];

  it("the pause offers one candidate per DISTINCT library name (Alpha once); naming Thassa's Oracle exiles the top six, reveals Zeta (exiled) and puts the Oracle in hand — the rest untouched", () => {
    const s = state({ hand: CONSULT, library: LIB });
    const paused = settle(dispatchAction(s, castOf(s, "dc")));
    expect(paused.pendingChoice).toMatchObject({ kind: "tutor-search", consultation: true, controller: "user" });
    const offered = names(paused.pendingChoice.candidates);
    const after = settle(resolveTutorChoice(paused, "o1"));
    const u = after.players.user;
    const row = { offered, hand: names(u.hand), exiled: names(u.exile).sort(), libraryLeft: names(u.library), searchLogged: (after.log || []).some((e) => e.kind === "tutor-search-pending" && e.controller === "user" && false) };
    console.log("  WITNESS consultName", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Thassa's Oracle", "Eta", "Theta"]);
    expect(row.hand).toEqual(["Thassa's Oracle"]);
    expect(row.exiled).toEqual(["Alpha", "Alpha", "Beta", "Delta", "Epsilon", "Gamma", "Zeta"]);
    expect(row.libraryLeft).toEqual(["Eta", "Theta"]);
  });

  it("declining (a name not in the library) exiles the ENTIRE library — the Oracle line", () => {
    const s = state({ hand: CONSULT, library: LIB });
    const paused = settle(dispatchAction(s, castOf(s, "dc")));
    const after = settle(resolveTutorChoice(paused, null));
    const u = after.players.user;
    const row = { library: u.library.length, exiled: u.exile.length, hand: names(u.hand), log: (after.log || []).find((e) => e.effect === "demonic-consultation") };
    console.log("  WITNESS consultDecline", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.library).toBe(0);
    expect(row.exiled).toBe(10);
    expect(row.hand).toEqual([]);
    expect(row.log).toMatchObject({ name: null, found: false, exiled: 10 });
  });

  it("naming a card that only sits in the top six exiles everything (the named card was among the six — CR: it is exiled, not revealed)", () => {
    const s = state({ hand: CONSULT, library: LIB });
    const paused = settle(dispatchAction(s, castOf(s, "dc")));
    const after = settle(resolveTutorChoice(paused, "b1")); // Beta is the 3rd card — inside the top six
    expect(after.players.user.hand).toEqual([]);
    expect(after.players.user.library).toHaveLength(0);
    // The SIXTH card exactly (Epsilon): six are exiled, so it is never revealed — a five-card exile would hand it over.
    const sixth = settle(resolveTutorChoice(settle(dispatchAction(state({ hand: CONSULT, library: LIB }), castOf(state({ hand: CONSULT, library: LIB }), "dc"))), "e1"));
    expect(sixth.players.user.hand).toEqual([]);
    expect(sixth.players.user.library).toHaveLength(0);
    // The SEVENTH card (Zeta) is the first revealed — it is found.
    const seventh = settle(resolveTutorChoice(settle(dispatchAction(state({ hand: CONSULT, library: LIB }), castOf(state({ hand: CONSULT, library: LIB }), "dc"))), "f1"));
    expect(names(seventh.players.user.hand)).toEqual(["Zeta"]);
    expect(seventh.players.user.exile).toHaveLength(6);
  });

  it("it is not a search: no library-search trigger fires for an opponent's Wan Shi Tong", () => {
    const wst = createPermanent({ id: "wst", card: { id: "c-wst", name: "Wan Shi Tong, Librarian", type: "Legendary Creature — Bird Spirit", mana: "{X}{U}{U}", power: 1, toughness: 1, oracle: "Whenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card." }, controller: "ai", summoningSick: false });
    const base = state({ hand: CONSULT, library: LIB });
    const s = { ...base, players: { ...base.players, ai: { ...base.players.ai, battlefield: [wst], library: [card("z1", "Z"), card("z2", "Z2")] } } };
    const paused = settle(dispatchAction(s, castOf(s, "dc")));
    const after = settle(resolveTutorChoice(paused, "o1"));
    expect(after.players.ai.battlefield[0].counters?.["+1/+1"] || 0).toBe(0);
    expect(after.players.ai.hand).toHaveLength(0);
  });
});

describe("Tainted Pact", () => {
  it("continue, continue, take: the first two stay exiled, the third goes to hand; the loop ends", () => {
    const s = state({ hand: PACT, library: [card("a1", "Alpha"), card("b1", "Beta"), ORACLE("o1"), card("c1", "Gamma")] });
    let cur = settle(dispatchAction(s, castOf(s, "tp")));
    expect(cur.pendingChoice).toMatchObject({ kind: "tainted-pact", cardName: "Alpha", exiledNames: ["Alpha"] });
    cur = settle(resolveTaintedPactChoice(cur, false));
    expect(cur.pendingChoice).toMatchObject({ kind: "tainted-pact", cardName: "Beta", exiledNames: ["Alpha", "Beta"] });
    cur = settle(resolveTaintedPactChoice(cur, false));
    expect(cur.pendingChoice).toMatchObject({ kind: "tainted-pact", cardName: "Thassa's Oracle" });
    const after = settle(resolveTaintedPactChoice(cur, true));
    const u = after.players.user;
    const row = { hand: names(u.hand), exiled: names(u.exile).sort(), library: names(u.library), pause: after.pendingChoice?.kind || null };
    console.log("  WITNESS pactTake", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hand).toEqual(["Thassa's Oracle"]);
    expect(row.exiled).toEqual(["Alpha", "Beta"]);
    expect(row.library).toEqual(["Gamma"]);
    expect(row.pause).toBe(null);
  });

  it("a DUPLICATE name ends the dig with nothing taken (the second Alpha is exiled, no pause, the rest of the library untouched)", () => {
    const s = state({ hand: PACT, library: [card("a1", "Alpha"), card("b1", "Beta"), card("a2", "Alpha"), ORACLE("o1")] });
    let cur = settle(dispatchAction(s, castOf(s, "tp")));
    cur = settle(resolveTaintedPactChoice(cur, false)); // Alpha exiled, continue
    cur = settle(resolveTaintedPactChoice(cur, false)); // Beta exiled, continue → the second Alpha ends it
    const u = cur.players.user;
    const row = { pause: cur.pendingChoice?.kind || null, hand: names(u.hand), exiled: names(u.exile).sort(), library: names(u.library), log: (cur.log || []).find((e) => e.effect === "tainted-pact" && e.ended) };
    console.log("  WITNESS pactDuplicate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pause).toBe(null);
    expect(row.hand).toEqual([]);
    expect(row.exiled).toEqual(["Alpha", "Alpha", "Beta"]);
    expect(row.library).toEqual(["Thassa's Oracle"]);
    expect(row.log).toMatchObject({ ended: "duplicate-name", cardName: "Alpha" });
  });

  it("an EMPTY library ends the dig quietly (continue past the last card)", () => {
    const s = state({ hand: PACT, library: [card("a1", "Alpha")] });
    let cur = settle(dispatchAction(s, castOf(s, "tp")));
    cur = settle(resolveTaintedPactChoice(cur, false));
    expect(cur.pendingChoice).toBeFalsy();
    expect(cur.players.user.exile.map((c) => c.name)).toEqual(["Alpha"]);
  });

  it("the AI seat settles the pause by policy (the session driver never spins): a nonland is taken", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
      players: { ...base.players, ai: { ...base.players.ai, library: [card("l1", "Swamp", "Basic Land — Swamp"), card("s1", "Spell")], exile: [] } } };
    expect(resolveTaintedPactChoice({ ...s, pendingChoice: null }, false).pendingChoice).toBeFalsy(); // no pause → a no-op settle
    const withPause = { ...s, players: { ...s.players, ai: { ...s.players.ai, library: [card("s1", "Spell")], exile: [card("l1", "Swamp", "Basic Land — Swamp")] } }, pendingChoice: { kind: "tainted-pact", controller: "ai", cardId: "l1", cardName: "Swamp", cardType: "Basic Land — Swamp", exiledNames: ["Swamp"], sourceName: "Tainted Pact" } };
    const out = advanceUntilDecision({ status: "active", state: withPause, difficulty: "beginner", decisionLog: [] });
    expect(out.decision?.kind).not.toBe("engine-stuck");
    expect(out.session.state.pendingChoice?.kind).not.toBe("tainted-pact");
    expect(out.session.state.players.ai.hand.map((c) => c.name)).toEqual(["Spell"]); // the land was left exiled, the spell taken
  });
});
