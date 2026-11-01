/**
 * costChoiceSurfaces.test.js — every legal play is still in legalActions (2026-11-01, the castexplode review).
 *
 * The engine enumerates an alternative cost payable more than one way as ONE cast per target, its payments on `altCostChoices`
 * (costChoices.js) — the AI ranks that short list. Everything outside the engine sees every legal play, exactly as before: the
 * play-API's legalActions / isLegalAction, a pilot's decide, the Academy's options and applyChoice, the trajectory row (legal.n,
 * rank, forced) and the decision log. So PLAY-API-CONTRACT.md §1.3 ("action ∈ legalActions") and the trajectory-row semantics are
 * unchanged, and the self-play rows another seat's tools read mean what they meant.
 *
 * The review's findings this pins: F5 (legalActions no longer listed every play; a pilot's variant pick was recorded as rank 0),
 * F6 (a partial choice that names no payment was given the house pitch instead of being refused as ambiguous), F7 (two equality
 * functions in isLegalAction), F9 (every logged alternative-cost cast repeated the whole choice list).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { legalActions, isLegalAction } from "./gameApi.js";
import { stableActionKey } from "./actionKey.js";
import { expandAllCostChoices } from "./costChoices.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import * as learn from "./learnSession.js";

vi.setConfig({ testTimeout: 90_000 });
beforeEach(() => {
  _resetIdsForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const FORCE_OF_WILL = { id: "fow", name: "Force of Will", type: "Instant", mana: "{3}{U}{U}", colors: ["U"], cmc: 5,
  oracle: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell." };
const blue = (id, name, cmc) => ({ id, name, type: "Instant", mana: "", colors: ["U"], cmc, oracle: "Draw a card." });
const PITCHES = [blue("b3", "Three Drop", 3), blue("b1z", "Cheap Z", 1), blue("b2", "Two Drop", 2), blue("b1a", "Cheap A", 1), blue("b4", "Four Drop", 4)];
function spellOnStack(id, name, controller) {
  return { id, kind: "spell", controller, targets: [], cost: { generic: 4, U: 1 },
    source: { id: `card-${id}`, name, type: "Sorcery", oracle: "" }, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} } };
}
const forests = (p) => Array.from({ length: 30 }, (_, i) => ({ id: `${p}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" }));

/** `who` responds (holds priority) to `n` spells of the other seat's on the stack, Force of Will and the five blue cards in hand. */
function responseState(who = "user", n = 6) {
  const s = createGameState({ userDeck: forests("u"), aiDeck: forests("a") });
  const other = who === "user" ? "ai" : "user";
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: other, priorityHolder: who, consecutivePasses: 0,
    stack: Array.from({ length: n }, (_, i) => spellOnStack(`s${i}`, `Threat ${i}`, other)),
    players: { ...s.players, [who]: { ...s.players[who], hand: [FORCE_OF_WILL, ...PITCHES], life: 20 } },
  };
}
const fowCasts = (actions) => actions.filter((a) => a.kind === "cast-spell" && a.cardId === "fow");
const roundTrip = (x) => JSON.parse(JSON.stringify(x));

describe("WITNESS (F5) — the play-API's legalActions lists every legal play", () => {
  it("Force of Will at 6 spells with 5 blue cards: 30 casts, one per target AND pitch card, none carrying a choice list", () => {
    const fow = fowCasts(legalActions(responseState(), "user"));
    expect(fow.length).toBe(30);
    expect(fow.every((a) => a.altCostChoices === undefined)).toBe(true);
    expect(new Set(fow.map((a) => `${a.targets[0].id}|${a.altCost.exilePitchId}`)).size).toBe(30);
  });

  it("…in the order the engine always listed them: per target, the pitch cards in hand order", () => {
    const fow = fowCasts(legalActions(responseState(), "user"));
    expect(fow.slice(0, 5).map((a) => a.altCost.exilePitchId)).toEqual(["b3", "b1z", "b2", "b1a", "b4"]);
    expect(fow.slice(0, 5).every((a) => a.targets[0].id === "s0")).toBe(true);
  });
});

describe("WITNESS (F5) — a pilot's decide sees every legal play, and the row records its pick truthfully", () => {
  it("decide gets all 30 Force of Will casts; its non-house pick is dispatched and recorded at its own rank, with no choice list", () => {
    const session = learn.createLearnSession({ userDeck: forests("u"), opponentDeck: forests("a"), difficulty: "expert", mode: "standard", seed: "surfaces" });
    const start = { ...session, state: responseState("user") };
    let seen = null;
    let picked = null;
    const rows = [];
    const decide = ({ legalActions: offered, seat }) => {
      if (seen || seat !== "user") return undefined;
      seen = offered;
      picked = offered.find((a) => a.cardId === "fow" && a.targets[0].id === "s3" && a.altCost?.exilePitchId === "b4");
      return picked;
    };
    const out = learn.advanceUntilDecision(start, { decide, recordDecision: (r) => rows.push(r), turnTickBudget: 400 });
    expect(fowCasts(seen).length).toBe(30);
    expect(picked).toBeTruthy();
    const row = rows[0];
    expect(row.action.altCost.exilePitchId).toBe("b4");
    expect(row.action.altCostChoices).toBeUndefined();
    expect(row.rank).toBe(seen.indexOf(picked));
    expect(row.rank).toBeGreaterThan(0);
    expect(row.legal.n).toBe(seen.length);
    expect(row.legal.kinds["cast-spell"]).toBe(seen.filter((a) => a.kind === "cast-spell").length);
    expect(out.session.decisionLog.find((e) => e.action?.cardId === "fow")?.action.altCost.exilePitchId).toBe("b4");
  });

  it("with no pilot, the row counts every legal play and ranks the AI's own pick among them", () => {
    const session = learn.createLearnSession({ userDeck: forests("u"), opponentDeck: forests("a"), difficulty: "expert", mode: "standard", seed: "surfaces" });
    const state = responseState("ai");
    const rows = [];
    learn.advanceUntilDecision({ ...session, state }, { recordDecision: (r) => rows.push(r), turnTickBudget: 400 });
    const every = expandAllCostChoices(legalActionsForPlayer(state, "ai"));
    const row = rows[0];
    expect(row.seat).toBe("ai");
    expect(row.action.cardId).toBe("fow");
    expect(row.action.altCostChoices).toBeUndefined();
    expect(row.legal.n).toBe(every.length);
    expect(row.rank).toBe(every.findIndex((a) => stableActionKey(a) === stableActionKey(row.action)));
    expect(row.forced).toBe(false);
  });
});

describe("WITNESS (F9) — a logged alternative-cost cast is the cast as paid, not the whole choice list", () => {
  it("the AI's Force of Will in the decision log names its pitch card and carries no altCostChoices", () => {
    const session = learn.createLearnSession({ userDeck: forests("u"), opponentDeck: forests("a"), difficulty: "expert", mode: "standard", seed: "surfaces" });
    const out = learn.advanceUntilDecision({ ...session, state: responseState("ai") }, { turnTickBudget: 400 });
    const entry = out.session.decisionLog.find((e) => e.action?.cardId === "fow");
    expect(entry.action.altCost.exilePitchId).toBe("b1a"); // the cheapest blue card, as always
    expect(entry.action.altCostChoices).toBeUndefined();
  });
});

describe("WITNESS (F5) — the Academy's ask lists every legal play", () => {
  it("a person responding with Force of Will at 6 spells and 5 blue cards is offered all 30 casts, none carrying a choice list", () => {
    const session = learn.createLearnSession({ userDeck: forests("u"), opponentDeck: forests("a"), difficulty: "beginner", mode: "standard", seed: "surfaces" });
    const { decision } = learn.advanceUntilDecision({ ...session, state: responseState("user") });
    expect(decision.kind).toBe("ask");
    const fow = fowCasts(decision.options);
    expect(fow.length).toBe(30);
    expect(fow.every((a) => a.altCostChoices === undefined)).toBe(true);
  });
});

describe("WITNESS (F6) — the Academy refuses a partial choice that names no payment, as ambiguous", () => {
  const userAsk = () => {
    const session = learn.createLearnSession({ userDeck: forests("u"), opponentDeck: forests("a"), difficulty: "beginner", mode: "standard", seed: "surfaces" });
    return { ...session, state: responseState("user") };
  };
  it("{ kind, cardId, playerId, targets } with five pitch cards possible: INVALID_CHOICE, nothing exiled", () => {
    const s = userAsk();
    const r = learn.applyChoice(s, { kind: "cast-spell", cardId: "fow", playerId: "user", targets: [{ id: "s0" }] });
    expect(r.decision.kind).toBe("dispatch-error");
    expect(r.decision.code).toBe("INVALID_CHOICE");
    expect(r.session.state.players.user.exile).toEqual([]);
  });

  it("CONTROL: the full cast a person picks (a pitch card and a target) is played, exiling THAT card", () => {
    const s = userAsk();
    const pick = fowCasts(expandAllCostChoices(legalActionsForPlayer(s.state, "user"))).find((a) => a.targets[0].id === "s2" && a.altCost?.exilePitchId === "b2");
    const r = learn.applyChoice(s, pick);
    expect(r.decision.code).not.toBe("INVALID_CHOICE");
    expect(r.session.state.players.user.exile.map((c) => c.id)).toEqual(["b2"]);
  });
});

describe("WITNESS (F7) — one equality function in isLegalAction", () => {
  it("a JSON round trip gets ONE answer for every Force of Will cast — those legalActions returns and every payment variant alike", () => {
    // Before: a cast as legalActions returned it went through gameApi's stableStringify (undefined keys kept — a round trip
    // fails), a cast paid with another pitch through actionKey's stableActionKey (undefined keys dropped — a round trip passes).
    const state = responseState();
    const listed = fowCasts(legalActions(state, "user"));
    const variants = fowCasts(expandAllCostChoices(legalActionsForPlayer(state, "user")));
    const answers = new Set([...listed, ...variants].map((a) => isLegalAction(state, roundTrip(a))));
    expect(answers.size).toBe(1);
    for (const a of [...listed, ...variants]) expect(isLegalAction(state, a)).toBe(true);
  });
});
