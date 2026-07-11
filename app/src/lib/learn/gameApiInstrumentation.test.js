/**
 * gameApiInstrumentation.test.js — SD-1 / SD-2 / PS-2 / PS-3 / ENG-FLAG-1 pins
 * ============================================================================
 *
 * The instrumentation-threading contract (PLAY_API_VERSION 1.1.0, additive MINOR):
 *
 *  1. SD-1/PS-2/ENG-FLAG-1 — act(session, decision, answer, opts) threads the
 *     instrumentation bag ({ decide, recordDecision, timePressure, onTurnStart })
 *     through every settler's internal re-advance, so a caller-driven
 *     createGame → nextDecision → act drive loop stays instrumented PAST the
 *     first act() (before the fix: every engine-auto segment initiated by act()
 *     ran default policy, unrecorded, clockless).
 *  2. SD-2 — the turn-boundary stamp lives in session STATE (state.observedTurn)
 *     on instrumented advances, so a re-entrant advance never re-fires the
 *     time-pressure drain / onTurnStart observer for a turn already stamped.
 *  3. PS-3 — createGame HONORS the contract-documented `pilots` option (router +
 *     mulligan config), and throws loudly on a malformed map instead of silently
 *     dropping it (the play-data mislabel case).
 *
 * Decks are inline (plain vitest has no oracle index on disk) — the same
 * Forest/Grizzly Bears fixture omnathSeam.test.js uses.
 */

import { describe, it, expect } from "vitest";
import { createGame, nextDecision, act } from "./gameApi.js";
import { advanceUntilDecision } from "./learnSession.js";

function deck(prefix) {
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
  for (let i = 0; i < 16; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" });
  return out;
}

function newGame(extra = {}) {
  return createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard", ...extra });
}

/** Prefer a pass-style option so the drive loop always makes phase/turn progress. */
function pickAnswer(decision) {
  const opts = decision.options || [];
  return opts.find((o) => o?.kind === "pass-priority") ?? opts[opts.length - 1] ?? opts[0];
}

describe("SD-1/PS-2/ENG-FLAG-1 — act() threads the instrumentation opts through every re-advance", () => {
  it("records trajectory rows for engine-auto segments AFTER the first act() (before: zero)", () => {
    const rows = [];
    const recordDecision = (row) => rows.push(row);
    let { session, decision } = nextDecision(newGame(), { recordDecision });
    expect(decision.kind).toBe("ask");
    const rowsBeforeFirstAct = rows.length;

    let acted = 0;
    while (decision.kind === "ask" && acted < 60) {
      ({ session, decision } = act(session, decision, pickAnswer(decision), { recordDecision }));
      acted += 1;
    }
    expect(acted).toBeGreaterThan(0);
    // THE SD-1 PIN: rows accumulated during act()-initiated advances. Pre-fix, every
    // internal advanceUntilDecision re-entry was bare, so rows.length stayed exactly
    // rowsBeforeFirstAct no matter how many acts ran.
    expect(rows.length).toBeGreaterThan(rowsBeforeFirstAct);
    // Rows have the recorded-decision shape (turn + seat + action descriptor).
    const row = rows[rows.length - 1];
    expect(typeof row.turn).toBe("number");
    expect(typeof row.seat).toBe("string");
    expect(row.action && typeof row.action.kind).toBe("string");
  });

  it("a seat-routed decide fires on AI-seat windows between acts", () => {
    const seatsSeen = new Set();
    const decide = ({ seat }) => {
      seatsSeen.add(seat);
      return undefined; // defer to the default pick — routing is what's under test
    };
    let { session, decision } = nextDecision(newGame(), {});
    expect(decision.kind).toBe("ask");
    expect(seatsSeen.size).toBe(0); // the initial (opt-less) advance consulted nobody

    let acted = 0;
    while (decision.kind === "ask" && acted < 60 && !seatsSeen.has("ai")) {
      ({ session, decision } = act(session, decision, pickAnswer(decision), { decide }));
      acted += 1;
    }
    // THE PIN: the AI seat's auto-decided windows between the caller's decisions were
    // routed through the caller's decide. Pre-fix, act() dropped decide entirely.
    expect(seatsSeen.has("ai")).toBe(true);
  });

  it("timePressure threads through an act() drive loop (time-pressure log events past the soft cap)", () => {
    // softCapTurn 1 ⇒ the clock drains from turn 2 on. Drive purely via act() after the
    // first advance; pre-fix the clock was inert on every act()-initiated segment.
    const timePressure = { softCapTurn: 1, lifeLossStep: 1 };
    let { session, decision } = nextDecision(newGame(), { timePressure });
    let acted = 0;
    const tpEvents = () => (session.state?.log || []).filter((e) => e?.kind === "time-pressure");
    while (decision.kind === "ask" && acted < 400 && tpEvents().length === 0) {
      ({ session, decision } = act(session, decision, pickAnswer(decision), { timePressure }));
      acted += 1;
    }
    expect(tpEvents().length).toBeGreaterThan(0);

    // SD-2 RIDER — single-fire per turn: with the stamp lifted into state, the many
    // act()-re-entries within one turn apply the drain ONCE per turn, never twice.
    // (Pre-SD-2, threading timePressure through act() would double-drain — the
    // corrupted-W/L-labels bug this pair of fixes is order-coupled around.)
    const turnsDrained = tpEvents().map((e) => e.turn);
    expect(new Set(turnsDrained).size).toBe(turnsDrained.length);
  });
});

describe("SD-2 — the turn boundary fires once per turn across re-entrant advances", () => {
  it("onTurnStart does not re-fire for a turn already stamped (re-entrant advance)", () => {
    const fired = [];
    const onTurnStart = (state, turn) => fired.push(turn);
    const session = newGame();

    const first = advanceUntilDecision(session, { onTurnStart });
    expect(first.decision.kind).toBe("ask");
    const firesForTurn1 = fired.filter((t) => t === first.session.state.turn).length;
    expect(firesForTurn1).toBe(1);
    // Instrumented advance stamped the boundary into STATE (the SD-2 lift).
    expect(first.session.state.observedTurn).toBe(first.session.state.turn);

    // Re-enter WITHOUT acting (same turn): pre-fix the per-call local re-fired the
    // boundary (duplicate onTurnStart row + double time-pressure drain); now the
    // state stamp suppresses it.
    const again = advanceUntilDecision(first.session, { onTurnStart });
    expect(again.decision.kind).toBe("ask");
    expect(fired.filter((t) => t === first.session.state.turn).length).toBe(1);
  });

  it("an uninstrumented advance writes NO state stamp (default path untouched)", () => {
    const { session } = nextDecision(newGame());
    expect("observedTurn" in session.state).toBe(false);
  });
});

describe("PS-3 — createGame honors the contract-documented pilots option", () => {
  it("pilots[seat].decide drives that seat with no per-call opts (contract §1.1 verbatim)", () => {
    let aiDecides = 0;
    let featuresSeen = 0;
    const pilots = {
      ai: {
        decide: ({ legalActions, features }) => {
          aiDecides += 1;
          // ENGINE-COMPUTED FEATURES (Omnath's eval-net seam, 2026-07-10): every decide call carries
          // the featurizeState snapshot — the SAME object the recorder row would carry, so a persona
          // consuming it can never drift from the training substrate.
          if (features && typeof features === "object") featuresSeen += 1;
          return legalActions?.[0];
        },
        playbook: "test-playbook",
        temperament: "test-temperament",
      },
    };
    const session = createGame({
      userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", pilots,
    });
    expect(typeof session.playOpts?.decide).toBe("function");
    const { decision } = nextDecision(session); // NO opts — the playOpts router must ride along
    expect(decision.kind).toBe("game-over");
    // THE PIN: pre-fix, createLearnSession's destructure silently discarded `pilots`
    // and every seat ran the default AI (aiDecides stayed 0) — the silent mislabel.
    expect(aiDecides).toBeGreaterThan(0);
    expect(featuresSeen).toBe(aiDecides); // features arrive on EVERY decide call
  });

  it("pilots[seat].decideMulligan runs at game start (mulligan config auto-built)", () => {
    let mullCalls = 0;
    const pilots = {
      ai: {
        decideMulligan: ({ seat }) => {
          mullCalls += 1;
          expect(seat).toBe("ai");
          return { kind: "mulligan-keep" };
        },
      },
    };
    createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", pilots });
    expect(mullCalls).toBeGreaterThan(0);
  });

  it("an explicit per-call decide overrides the session pilots router (merge semantics)", () => {
    let pilotCalls = 0;
    let explicitCalls = 0;
    const session = createGame({
      userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard",
      pilots: { ai: { decide: () => { pilotCalls += 1; return undefined; } } },
    });
    const explicit = () => { explicitCalls += 1; return undefined; };
    const { decision } = nextDecision(session, { decide: explicit });
    expect(decision.kind).toBe("game-over");
    expect(explicitCalls).toBeGreaterThan(0);
    expect(pilotCalls).toBe(0); // explicit opts win per-field — lab.mjs-style drivers unaffected
  });

  it("malformed pilots THROW loudly instead of silently running default AI", () => {
    const base = { userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard" };
    expect(() => createGame({ ...base, pilots: "not-a-map" })).toThrow(/pilots/);
    expect(() => createGame({ ...base, pilots: [{ decide: () => {} }] })).toThrow(/pilots/);
    expect(() => createGame({ ...base, pilots: { ai: "nope" } })).toThrow(/pilots\["ai"\]/);
    expect(() => createGame({ ...base, pilots: { ai: { decide: 42 } } })).toThrow(/decide must be a function/);
    expect(() => createGame({ ...base, pilots: { ai: { decideMulligan: "x" } } })).toThrow(/decideMulligan must be a function/);
  });

  it("no pilots ⇒ no playOpts key (the HTTP/default path is byte-identical)", () => {
    const session = newGame();
    expect("playOpts" in session).toBe(false);
  });
});
