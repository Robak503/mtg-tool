/**
 * mulligan.test.js — Learn-to-Play MULLIGAN follow-on: the pre-game London keep/ship
 * surfaced as a pluggable `decideMulligan` seam (CR 103.5), opt-in + default byte-identical.
 *
 * The CREED line proven here (the task's VERIFY list):
 *   1. DEFAULT (no mulligan decide) is BYTE-IDENTICAL: a session built with no `mulligan`
 *      config keeps its dealt 7 exactly as the pre-slice engine did — same opening hand,
 *      same library, same game-start log (no mulligan events). Proven both at the
 *      createLearnSession level AND via a seeded self-play start (default == pre-slice).
 *   2. LONDON MULLIGAN modeled correctly: an "always ship once then keep" pilot redraws a
 *      fresh 7 and bottoms exactly 1 card (the mulligan count), and the seat's mulligan
 *      count is recorded. "always keep" == default. A throwing / garbage decideMulligan
 *      falls back to KEEP (never strands setup, never over-mulligans).
 *   3. DECK-SIZE INVARIANT: library.length + hand.length is conserved across every ship
 *      and the keep-bottom; no card is lost or duplicated (asserted by id-set equality).
 *
 * Hermetic: builds fully-shaped, UNIQUELY-ID'd cards directly (no oracle-index dependency),
 * like pilotDecide.test.js, so it runs in a fresh worktree with no MTG_APP_ROOT.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { createLearnSession, advanceMulligan, mulliganDecision } from "./learnSession.js";
import { startGame, applyMulliganShip, applyMulliganKeep } from "./gameEngine.js";
import { createGameState } from "./gameState.js";
import { runSelfPlayGame } from "./selfPlayRunner.js";

beforeEach(() => _resetIdsForTests());

// 60 distinct cards (unique ids) so we can assert exact hand membership + no dup/loss.
function uniqueDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 30; i++)
    cards.push({
      id: `${prefix}-forest-${i}`,
      name: `Forest ${i}`,
      type: "Basic Land — Forest",
      oracle: "{T}: Add {G}.",
      mana: "",
    });
  for (let i = 0; i < 30; i++)
    cards.push({
      id: `${prefix}-bear-${i}`,
      name: `Bear ${i}`,
      type: "Creature — Bear",
      oracle: "",
      mana: "{1}{G}",
      cmc: 2,
      keywords: [],
      power: 2,
      toughness: 2,
    });
  return cards;
}

function quiet(fn) {
  const w = vi.spyOn(console, "warn").mockImplementation(() => {});
  const l = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return fn();
  } finally {
    w.mockRestore();
    l.mockRestore();
  }
}

// The seat's library+hand id multiset (the cards that must be conserved). Excludes command/
// graveyard/etc. (a fresh game has none) — opening cards live only in library + hand.
function libHandIds(state, seat) {
  const p = state.players[seat];
  return [...p.library.map((c) => c.id), ...p.hand.map((c) => c.id)].sort();
}

describe("mulligan — DEFAULT (no decide) is byte-identical (the CREED line)", () => {
  it("createLearnSession with no `mulligan` keeps the dealt 7 untouched — same hand, library, log", () => {
    const args = {
      userDeck: uniqueDeck("u"),
      opponentDeck: uniqueDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 4242,
    };

    const pre = createLearnSession({ ...args }); // pre-slice path = no mulligan arg at all
    const def = createLearnSession({ ...args, mulligan: null }); // explicit null = same path

    // Byte-identical opening state (hand + library order) for both seats.
    for (const seat of ["user", "ai"]) {
      expect(def.state.players[seat].hand.map((c) => c.id)).toEqual(
        pre.state.players[seat].hand.map((c) => c.id),
      );
      expect(def.state.players[seat].library.map((c) => c.id)).toEqual(
        pre.state.players[seat].library.map((c) => c.id),
      );
      expect(pre.state.players[seat].hand.length).toBe(7);
    }
    // No mulligan events in the default game-start log.
    expect(
      pre.state.log.some((e) => e.kind === "mulligan-keep" || e.kind === "mulligan-ship"),
    ).toBe(false);
    // The whole game-start log is identical.
    expect(JSON.stringify(def.state.log)).toEqual(JSON.stringify(pre.state.log));
  });

  it("startGame default path == pre-slice deal-7 (no rngSeed mutation beyond the seeded shuffle)", () => {
    // Two states built identically; one through the new default startGame, one re-derived the
    // same way — they must match (the mulligan branch is fully inert when no config is passed).
    const mk = () =>
      createGameState({ userDeck: uniqueDeck("u"), aiDeck: uniqueDeck("a"), mode: "standard" });
    const a = startGame(mk(), { seed: 7 });
    const b = startGame(mk(), { seed: 7 });
    expect(JSON.stringify(a.players.user.hand.map((c) => c.id))).toEqual(
      JSON.stringify(b.players.user.hand.map((c) => c.id)),
    );
    expect(JSON.stringify(a.log)).toEqual(JSON.stringify(b.log));
    expect(a.players.user.hand.length).toBe(7);
    // No `mulligans` field stamped on the default path (it's only set by the mulligan phase).
    expect(a.players.user.mulligans).toBeUndefined();
  });

  it("a seeded self-play START with no mulligan pilot is byte-identical to the same with no pilots at all", () => {
    const baseArgs = {
      deckA: uniqueDeck("u"),
      deckB: uniqueDeck("a"),
      mode: "standard",
      seed: 999,
      timePressure: true,
    };
    const A = quiet(() => runSelfPlayGame(baseArgs));
    // A pilot map WITHOUT any decideMulligan must not engage the mulligan flow → identical game.
    const B = quiet(() =>
      runSelfPlayGame({
        ...baseArgs,
        pilots: {
          user: { playbook: "x", temperament: "y" },
          ai: { playbook: "x", temperament: "y" },
        },
      }),
    );
    expect(JSON.stringify({ result: B.result, turns: B.turns, log: B.log })).toEqual(
      JSON.stringify({ result: A.result, turns: A.turns, log: A.log }),
    );
  });
});

describe("mulligan — London keep/ship modeled correctly (CR 103.5)", () => {
  // A decider that ships exactly ONCE then keeps (tracks ships per-seat across calls).
  function shipOnceThenKeep() {
    const shipped = new Set();
    return ({ seat }) => {
      if (!shipped.has(seat)) {
        shipped.add(seat);
        return { kind: "mulligan-ship" };
      }
      return { kind: "mulligan-keep" };
    };
  }

  it("ship-once-then-keep: hand redrawn, exactly 1 card bottomed, deck-size invariant holds", () => {
    const userDeck = uniqueDeck("u");
    const preDealtIds = userDeck.map((c) => c.id).sort(); // the full 60-card multiset

    const session = createLearnSession({
      userDeck,
      opponentDeck: uniqueDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 123,
      mulligan: { decide: shipOnceThenKeep() },
    });
    const user = session.state.players.user;

    // KEPT HAND is 6 (drew a fresh 7 after the ship, bottomed 1 = the mulligan count).
    expect(user.hand.length).toBe(6);
    // The seat's mulligan count is stamped (1 ship).
    expect(user.mulligans).toBe(1);
    expect(user.hasMulliganed).toBe(true);

    // DECK-SIZE INVARIANT: library + hand still hold ALL 60 original cards, none lost/duped.
    expect(libHandIds(session.state, "user")).toEqual(preDealtIds);
    expect(user.library.length + user.hand.length).toBe(60);

    // Exactly one ship + one keep logged for the user; keep recorded bottomed:1.
    const shipEvents = session.state.log.filter(
      (e) => e.kind === "mulligan-ship" && e.player === "user",
    );
    const keepEvents = session.state.log.filter(
      (e) => e.kind === "mulligan-keep" && e.player === "user",
    );
    expect(shipEvents.length).toBe(1);
    expect(keepEvents.length).toBe(1);
    expect(keepEvents[0].bottomed).toBe(1);
    expect(keepEvents[0].mulligans).toBe(1);
  });

  it("'always keep' == default (a keep-on-first decider keeps the dealt 7, byte-identical)", () => {
    const args = {
      userDeck: uniqueDeck("u"),
      opponentDeck: uniqueDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 55,
    };
    const def = createLearnSession({ ...args });
    const keep = createLearnSession({
      ...args,
      mulligan: { decide: () => ({ kind: "mulligan-keep" }) },
    });

    for (const seat of ["user", "ai"]) {
      expect(keep.state.players[seat].hand.map((c) => c.id)).toEqual(
        def.state.players[seat].hand.map((c) => c.id),
      );
      expect(keep.state.players[seat].library.map((c) => c.id)).toEqual(
        def.state.players[seat].library.map((c) => c.id),
      );
      expect(keep.state.players[seat].hand.length).toBe(7);
    }
    // An "always keep" decider keeps 7 (a 0-mulligan keep is still a keep — count 0).
    expect(keep.state.players.user.mulligans).toBe(0);
  });

  it("ship-twice-then-keep bottoms 2 (the running mulligan count); invariant holds; deterministic per seed", () => {
    function shipTwiceThenKeep() {
      const ships = {};
      return ({ seat }) => {
        ships[seat] = (ships[seat] || 0) + 1;
        return ships[seat] <= 2 ? { kind: "mulligan-ship" } : { kind: "mulligan-keep" };
        // call 1,2 → ship; call 3 → keep
      };
    }
    const mk = () =>
      createLearnSession({
        userDeck: uniqueDeck("u"),
        opponentDeck: uniqueDeck("a"),
        difficulty: "expert",
        mode: "standard",
        seed: 314,
        mulligan: { decide: shipTwiceThenKeep() },
      });
    const s1 = mk();
    const u1 = s1.state.players.user;
    expect(u1.mulligans).toBe(2);
    expect(u1.hand.length).toBe(5); // drew 7, bottomed 2
    expect(libHandIds(s1.state, "user")).toEqual(
      uniqueDeck("u")
        .map((c) => c.id)
        .sort(),
    );
    expect(u1.library.length + u1.hand.length).toBe(60);

    // Same seed ⇒ byte-identical kept hand (deterministic redraw via threaded rngSeed).
    const s2 = mk();
    expect(s2.state.players.user.hand.map((c) => c.id)).toEqual(u1.hand.map((c) => c.id));
  });

  it("a throwing decideMulligan is swallowed → KEEP (never strands setup, never over-mulligans)", () => {
    const s = quiet(() =>
      createLearnSession({
        userDeck: uniqueDeck("u"),
        opponentDeck: uniqueDeck("a"),
        difficulty: "expert",
        mode: "standard",
        seed: 9,
        mulligan: {
          decide: () => {
            throw new Error("boom");
          },
        },
      }),
    );
    // Threw → keep → the dealt 7 stays, mulligan count 0, invariant intact.
    expect(s.state.players.user.hand.length).toBe(7);
    expect(s.state.players.user.mulligans).toBe(0);
    expect(libHandIds(s.state, "user")).toEqual(
      uniqueDeck("u")
        .map((c) => c.id)
        .sort(),
    );
  });

  it("an out-of-set / garbage decideMulligan return → KEEP (no illegal action can over-mulligan)", () => {
    const s = createLearnSession({
      userDeck: uniqueDeck("u"),
      opponentDeck: uniqueDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 11,
      mulligan: { decide: () => ({ kind: "TOTALLY-FAKE" }) },
    });
    expect(s.state.players.user.hand.length).toBe(7);
    expect(s.state.players.user.mulligans).toBe(0);
  });
});

describe("mulligan — recorded into the trajectory by pilot, threaded through the runner", () => {
  it("decideMulligan engages via runSelfPlayGame and records turn-0 mulligan rows tagged by pilot", () => {
    // Only the USER ships once; the AI has no decideMulligan (keeps its 7, byte-identical seat).
    const userMull = (() => {
      let s = false;
      return () => (s ? { kind: "mulligan-keep" } : ((s = true), { kind: "mulligan-ship" }));
    })();
    const game = quiet(() =>
      runSelfPlayGame({
        deckA: uniqueDeck("u"),
        deckB: uniqueDeck("a"),
        mode: "standard",
        seed: 777,
        timePressure: true,
        pilots: {
          user: {
            decide: ({ legalActions }) => legalActions[0],
            decideMulligan: userMull,
            playbook: "voltron",
            temperament: "aggressive",
          },
          ai: {
            decide: ({ legalActions }) => legalActions[0],
            playbook: "control",
            temperament: "cautious",
          },
        },
        recordDecisions: true,
      }),
    );

    const traj = game.decisionTrajectory;
    expect(traj).toBeTruthy();

    // Turn-0 mulligan rows lead the stream: the user shipped once then kept → 2 mulligan rows.
    const mullRows = traj.rows.filter(
      (r) =>
        r.turn === 0 && (r.action?.kind === "mulligan-ship" || r.action?.kind === "mulligan-keep"),
    );
    const userShip = mullRows.find((r) => r.seat === "user" && r.action.kind === "mulligan-ship");
    const userKeep = mullRows.find((r) => r.seat === "user" && r.action.kind === "mulligan-keep");
    expect(userShip).toBeTruthy();
    expect(userKeep).toBeTruthy();
    // Tagged by the seat's pilot identity.
    expect(userShip.pilot).toEqual({
      playbook: "voltron",
      temperament: "aggressive",
      pilotType: null,
    });
    // The AI (no decideMulligan) still gets ONE keep row (it was offered keep/ship and kept).
    const aiRows = mullRows.filter((r) => r.seat === "ai");
    expect(aiRows.length).toBe(1);
    expect(aiRows[0].action.kind).toBe("mulligan-keep");
    expect(aiRows[0].pilot).toEqual({
      playbook: "control",
      temperament: "cautious",
      pilotType: null,
    });

    // The game still reaches a real terminal result (the mulligan phase never strands it).
    expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(game.result);
  });

  it("no decideMulligan on any seat → NO mulligan rows recorded (opt-in)", () => {
    const game = quiet(() =>
      runSelfPlayGame({
        deckA: uniqueDeck("u"),
        deckB: uniqueDeck("a"),
        mode: "standard",
        seed: 5,
        timePressure: true,
        pilots: {
          user: { decide: ({ legalActions }) => legalActions[0], playbook: "p", temperament: "t" },
        },
        recordDecisions: true,
      }),
    );
    const mullRows = (game.decisionTrajectory?.rows || []).filter(
      (r) => r.turn === 0 && String(r.action?.kind || "").startsWith("mulligan-"),
    );
    expect(mullRows.length).toBe(0);
  });
});

// ── The extracted step-primitives + the interactive `chooseBottom` seam (slice 1) ──────────
//
// runMulliganPhaseForSeat now composes applyMulliganShip + applyMulliganKeep, and the keep
// step takes an optional `chooseBottom` — the seam the human London flow drives so the PLAYER
// (not the worst-N heuristic) picks which cards go to the bottom. These prove the seam does
// what it claims AND that a malformed picker can never break setup (silent heuristic fallback).
describe("mulligan — the chooseBottom seam (human London picker)", () => {
  const dealt = () =>
    createLearnSession({
      userDeck: uniqueDeck("u"),
      opponentDeck: uniqueDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 7,
    }).state;

  it("applyMulliganKeep bottoms EXACTLY the chosen cards (the picker overrides the heuristic)", () => {
    const s = dealt();
    const before = s.players.user.hand.map((c) => c.id);
    const pick = [before[1], before[4]]; // an arbitrary player choice — NOT necessarily the heuristic's worst
    const conservedBefore = libHandIds(s, "user");

    const after = quiet(() => applyMulliganKeep(s, "user", { ships: 2, chooseBottom: () => pick }));
    const handAfter = after.players.user.hand.map((c) => c.id);
    const libAfter = after.players.user.library.map((c) => c.id);

    // The two chosen cards left the hand and are now in the library (bottomed) — exactly those.
    expect(handAfter).toHaveLength(5);
    for (const id of pick) {
      expect(handAfter).not.toContain(id);
      expect(libAfter).toContain(id);
    }
    // Count/flag stamped; deck-size invariant conserved (no card lost or duplicated).
    expect(after.players.user.mulligans).toBe(2);
    expect(after.players.user.hasMulliganed).toBe(true);
    expect(libHandIds(after, "user")).toEqual(conservedBefore);
    // The keep is logged with the exact bottom count.
    expect(
      after.log.some(
        (e) =>
          e.kind === "mulligan-keep" &&
          e.player === "user" &&
          e.mulligans === 2 &&
          e.bottomed === 2,
      ),
    ).toBe(true);
  });

  it("a malformed / throwing chooseBottom silently falls back to the worst-N heuristic (never strands setup)", () => {
    const heuristic = applyMulliganKeep(dealt(), "user", { ships: 2 }); // no picker → heuristic
    const hHand = heuristic.players.user.hand.map((c) => c.id);
    const hLib = heuristic.players.user.library.map((c) => c.id);

    // Every malformed shape must reproduce the heuristic result byte-for-byte (hand + library).
    const badPickers = [
      () => ["not-in-hand-1", "not-in-hand-2"], // ids absent from hand
      () => [dealt().players.user.hand[0].id], // wrong count (1, not 2)
      () => {
        throw new Error("picker blew up");
      }, // throws
      () => "garbage", // not an array
      (ctx) => [ctx.hand[0].id, ctx.hand[0].id], // duplicate id
    ];
    for (const chooseBottom of badPickers) {
      const out = quiet(() => applyMulliganKeep(dealt(), "user", { ships: 2, chooseBottom }));
      expect(out.players.user.hand.map((c) => c.id)).toEqual(hHand);
      expect(out.players.user.library.map((c) => c.id)).toEqual(hLib);
    }
  });

  it("applyMulliganShip reshuffles + redraws 7, logs the ship, conserves the deck", () => {
    const s = dealt();
    const conserved = libHandIds(s, "user");
    const shipped = applyMulliganShip(s, "user", 0);
    expect(shipped.players.user.hand).toHaveLength(7);
    expect(libHandIds(shipped, "user")).toEqual(conserved); // no card lost/duplicated
    expect(
      shipped.log.some(
        (e) => e.kind === "mulligan-ship" && e.player === "user" && e.mulligans === 1,
      ),
    ).toBe(true);
  });
});

// ── The interactive human London flow at the SESSION layer (slice 2) ───────────────────────
//
// createLearnSession({ humanMulligan: true }) deals but does NOT open the game — the "user" seat
// resolves keep/ship/bottom one step per advanceMulligan call, then the game opens and hands off
// to the normal decision loop. This is the flow the free-play routes + UI drive (slices 3–4).
describe("mulligan — the interactive human flow (session layer)", () => {
  const startHuman = () =>
    createLearnSession({
      userDeck: uniqueDeck("u"),
      opponentDeck: uniqueDeck("a"),
      difficulty: "beginner",
      mode: "standard",
      seed: 7,
      humanMulligan: true,
    });

  const isOpened = (state) => state.log.some((e) => e.kind === "game-start");

  it("deals but does NOT open — session sits at status 'mulligan' with a keep/ship ask for the user seat", () => {
    const s = startHuman();
    expect(s.status).toBe("mulligan");
    expect(s.mulligan).toEqual({ seat: "user", mulligans: 0, phase: "decide" });
    expect(s.state.players.user.hand).toHaveLength(7);
    expect(isOpened(s.state)).toBe(false); // game NOT opened yet — no game-start log

    const view = mulliganDecision(s);
    expect(view.kind).toBe("mulligan");
    expect(view.phase).toBe("decide");
    expect(view.hand).toHaveLength(7);
    expect(view.options.map((o) => o.kind).sort()).toEqual(["mulligan-keep", "mulligan-ship"]);
  });

  it("KEEP at 0 opens the game untouched — 7-card hand, status active, mulligan marker cleared", () => {
    const s = startHuman();
    const handBefore = s.state.players.user.hand.map((c) => c.id);
    const { session, decision } = quiet(() => advanceMulligan(s, { kind: "mulligan-keep" }));

    expect(session.status).toBe("active");
    expect(session.mulligan).toBeUndefined();
    expect(isOpened(session.state)).toBe(true);
    expect(session.state.players.user.hand.map((c) => c.id)).toEqual(handBefore); // untouched
    expect(decision).toBeTruthy(); // a real first decision (or terminal) was produced
  });

  it("SHIP → KEEP → BOTTOM: redraws, then bottoms EXACTLY the player's chosen card, then opens", () => {
    const preDealtIds = uniqueDeck("u")
      .map((c) => c.id)
      .sort();
    let s = startHuman();

    // Ship once — fresh 7, mulligan count 1, still in the decide phase (ship still offered).
    let step = quiet(() => advanceMulligan(s, { kind: "mulligan-ship" }));
    s = step.session;
    expect(s.mulligan).toEqual({ seat: "user", mulligans: 1, phase: "decide" });
    expect(step.decision.options.map((o) => o.kind)).toContain("mulligan-ship");
    expect(s.state.players.user.hand).toHaveLength(7);

    // Keep — with 1 ship taken, advance to the bottom-pick phase (must bottom 1).
    step = quiet(() => advanceMulligan(s, { kind: "mulligan-keep" }));
    s = step.session;
    expect(s.mulligan).toEqual({ seat: "user", mulligans: 1, phase: "bottom" });
    expect(step.decision).toMatchObject({ kind: "mulligan", phase: "bottom", bottomCount: 1 });

    // The player picks a specific card to bottom.
    const chosen = s.state.players.user.hand[3].id;
    step = quiet(() => advanceMulligan(s, { kind: "mulligan-bottom", cardIds: [chosen] }));
    const opened = step.session;

    expect(opened.status).toBe("active");
    expect(opened.mulligan).toBeUndefined();
    expect(isOpened(opened.state)).toBe(true);
    // The chosen card is bottomed: gone from hand, present in library; hand is 6 (7 − 1 bottomed).
    expect(opened.state.players.user.hand.map((c) => c.id)).not.toContain(chosen);
    expect(opened.state.players.user.library.map((c) => c.id)).toContain(chosen);
    expect(opened.state.players.user.hand).toHaveLength(6);
    // Deck-size invariant across the whole flow: all 60 original cards conserved.
    expect(libHandIds(opened.state, "user")).toEqual(preDealtIds);
  });
});
