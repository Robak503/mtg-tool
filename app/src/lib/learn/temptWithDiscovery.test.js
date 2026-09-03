/**
 * temptWithDiscovery.test.js — X-PROGRAM ⑤b (2026-09-03): TEMPT WITH DISCOVERY — the "tempting offer" ability word.
 * "Search your library for a land card and put it onto the battlefield. Each opponent may search their library for a
 * land card and put it onto the battlefield. For each opponent who searches a library this way, search your library
 * for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles."
 * One atom whose settlers chain the pauses: the offerer's search → each opponent's tempting-offer choice (accept →
 * that opponent's own search) → the offerer's bonus searches (one per accepting opponent) → resume. The asked
 * opponent's answer is a pause whose CONTROLLER is the opponent — a human decides at the panel, the autopilot by
 * autoPickTemptingOffer (accept iff a land is there to find and it controls no more lands than the offerer).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03). Lands/creatures are basics/synthetic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice, resolveTemptingOfferChoice, advanceTemptingOffer } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { autoPickTemptingOffer } from "./choicePolicy.js";
import { createLearnSession, advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TEMPT = { id: "h-twd", name: "Tempt with Discovery", type: "Sorcery", mana: "{3}{G}", mana_cost: "{3}{G}", cmc: 4, keywords: [], oracle: "Tempting offer — Search your library for a land card and put it onto the battlefield. Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles." };
const forest = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" });
const bear = (id) => ({ id, name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" });

function board({ aiLandsInLibrary = 2, aiLandsOnBoard = 1, userLandsOnBoard = 1 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = (seat, n) => Array.from({ length: n }, (_, i) => createPermanent({ id: `${seat}-land-${i}`, card: forest(`${seat}-lc-${i}`), controller: seat }));
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [TEMPT], graveyard: [], library: [bear("u-b1"), forest("u-f1"), forest("u-f2"), forest("u-f3")], battlefield: bf("user", userLandsOnBoard), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [bear("a-b1"), ...Array.from({ length: aiLandsInLibrary }, (_, i) => forest(`a-f${i + 1}`))], battlefield: bf("ai", aiLandsOnBoard) },
    },
  };
}
const landsOf = (s, seat) => s.players[seat].battlefield.filter((p) => /Land/.test(p.card.type)).length;
/** Cast Tempt and resolve it to its first pause (the offerer's own land search). */
function castTempt(s) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-twd");
  expect(act).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}

describe("the parse + the tier", () => {
  it("collapses to the one atom (label stripped); the card is native", () => {
    const p = parseEffectClause(TEMPT.oracle, "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "tempting-offer-land", targetType: null }]);
    expect(classifyCard(TEMPT)).toBe("native-spell");
  });
  it("the autopilot's answer: accept iff a land is there to find and it controls no more lands than the offerer", () => {
    const pc = { kind: "tempting-offer", controller: "ai", offerer: "user" };
    expect(autoPickTemptingOffer(board({ aiLandsOnBoard: 1, userLandsOnBoard: 1 }), pc)).toBe(true);
    expect(autoPickTemptingOffer(board({ aiLandsOnBoard: 3, userLandsOnBoard: 1 }), pc)).toBe(false);
    expect(autoPickTemptingOffer(board({ aiLandsInLibrary: 0 }), pc)).toBe(false);
  });
});

describe("runtime — the settler chain", () => {
  it("⭐ accept: offerer land → opponent's answer → opponent's land → offerer's bonus land → the spell finishes (user +2, ai +1)", () => {
    const s = board();
    const p1 = castTempt(s);
    expect(p1.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", destination: "battlefield", temptingOffer: { stage: "offerer-first", offerer: "user", opponents: ["ai"], accepted: 0 } });
    expect(p1.pendingChoice.candidates.map((c) => c.id)).toEqual(["u-f1", "u-f2", "u-f3"]);
    const p2 = resolveTutorChoice(p1, "u-f1");
    expect(landsOf(p2, "user")).toBe(2);
    expect(p2.pendingChoice).toMatchObject({ kind: "tempting-offer", controller: "ai", offerer: "user", accepted: 0, opponents: [], hasLand: true });
    const p3 = resolveTemptingOfferChoice(p2, true);
    expect(p3.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai", destination: "battlefield", temptingOffer: { stage: "opponent-search", accepted: 1 } });
    const p4 = resolveTutorChoice(p3, "a-f1");
    expect(landsOf(p4, "ai")).toBe(2);
    expect(p4.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", remaining: 1, temptingOffer: { stage: "bonus", accepted: 1 } });
    const done = resolveTutorChoice(p4, "u-f2");
    expect(landsOf(done, "user")).toBe(3);
    expect(done.pendingChoice ?? null).toBeNull();
    expect(done.stack).toEqual([]);
    expect(done.players.user.graveyard.some((c) => c.id === "h-twd")).toBe(true);
    // Every searcher shuffled: the bear is no longer guaranteed on top is not testable; the libraries lost exactly the found lands.
    expect(done.players.user.library.length).toBe(2);
    expect(done.players.ai.library.length).toBe(2);
  });

  it("⭐ decline: the offerer gets no bonus; the spell finishes after the first land (user +1, ai +0)", () => {
    const p2 = resolveTutorChoice(castTempt(board()), "u-f1");
    const done = resolveTemptingOfferChoice(p2, false);
    expect(landsOf(done, "user")).toBe(2);
    expect(landsOf(done, "ai")).toBe(1);
    expect(done.pendingChoice ?? null).toBeNull();
    expect(done.players.user.graveyard.some((c) => c.id === "h-twd")).toBe(true);
  });

  it("two acceptors (a pod's arithmetic, driven directly): the offerer's bonus is TWO chained searches, the offer state riding the chain", () => {
    // A two-seat game never reaches accepted > 1; the state machine is exercised directly at the point a pod would
    // reach it — the last opponent has answered and two of them searched.
    const s = board();
    const p = advanceTemptingOffer(s, { temptingOffer: { stage: "opponent-search", offerer: "user", opponents: [], accepted: 2 }, resume: null, sourceName: "Tempt with Discovery" });
    expect(p.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", remaining: 2, temptingOffer: { stage: "bonus", accepted: 2 } });
    const q = resolveTutorChoice(p, "u-f1");
    expect(landsOf(q, "user")).toBe(2);
    expect(q.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", remaining: 1, temptingOffer: { stage: "bonus", accepted: 2 } });
    expect(q.pendingChoice.candidates.map((c) => c.id)).toEqual(["u-f2", "u-f3"]);
    const r = resolveTutorChoice(q, "u-f2");
    expect(landsOf(r, "user")).toBe(3);
    expect(r.pendingChoice ?? null).toBeNull();
  });

  it("accept with no land to find still counts as searching: the offerer's bonus fires", () => {
    const p2 = resolveTutorChoice(castTempt(board({ aiLandsInLibrary: 0 })), "u-f1");
    expect(p2.pendingChoice).toMatchObject({ kind: "tempting-offer", hasLand: false });
    const p3 = resolveTemptingOfferChoice(p2, true);
    expect(p3.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai", candidates: [] });
    const p4 = resolveTutorChoice(p3, null); // found nothing
    expect(p4.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", temptingOffer: { stage: "bonus", accepted: 1 } });
    const done = resolveTutorChoice(p4, "u-f2");
    expect(landsOf(done, "user")).toBe(3);
    expect(done.pendingChoice ?? null).toBeNull();
  });
});

describe("the learn-session driver", () => {
  const deck = (prefix) => [...Array.from({ length: 20 }, (_, i) => forest(`${prefix}-df-${i}`)), ...Array.from({ length: 10 }, (_, i) => bear(`${prefix}-db-${i}`))];
  function sessionWith(state) {
    const fresh = createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner" });
    return { ...fresh, state: { ...state, turn: fresh.state.turn } };
  }
  it("⭐ the AI as the asked opponent auto-answers (accepts, behind on lands) and the user's bonus pick surfaces as a tutor decision", () => {
    const p2 = resolveTutorChoice(castTempt(board({ aiLandsOnBoard: 1, userLandsOnBoard: 1 })), "u-f1");
    expect(p2.pendingChoice.kind).toBe("tempting-offer");
    const { session, decision } = advanceUntilDecision(sessionWith(p2));
    expect(decision.kind).toBe("tutor-search");
    expect(session.state.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", temptingOffer: { stage: "bonus", accepted: 1 } });
    expect(landsOf(session.state, "ai")).toBe(2); // the AI searched and found
  });
  it("⭐ the user as the asked opponent gets the tempting-offer decision; accepting leads to their own land pick", () => {
    // Mirror the board: the AI is the offerer, the user is asked.
    const s = board();
    const flipped = { ...s, players: { user: { ...s.players.ai, hand: [] }, ai: { ...s.players.user, hand: [] } } };
    const asked = { ...flipped, pendingChoice: { kind: "tempting-offer", controller: "user", offerer: "ai", accepted: 0, opponents: [], hasLand: true, sourceName: "Tempt with Discovery" } };
    const { decision } = advanceUntilDecision(sessionWith(asked));
    expect(decision).toMatchObject({ kind: "tempting-offer", controller: "user", offerer: "ai", hasLand: true });
    const { session: after, decision: next } = applyPendingChoice(sessionWith(asked), { kind: "tempting-offer", accept: true });
    expect(next.kind).toBe("tutor-search");
    expect(after.state.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", temptingOffer: { stage: "opponent-search", accepted: 1 } });
  });
});
