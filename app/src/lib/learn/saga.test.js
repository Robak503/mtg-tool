/**
 * saga.test.js — SAGAS (CR 714, SHELF S7 — Vault 12: The Necropolis).
 *
 * The whole-card contract: a Saga is native ONLY when its chapter list parses all-or-nothing AND every
 * chapter's effect routes natively (the shared triggerRoutesNatively gate — metric mirrors runtime).
 * Runtime: entry stamps sagaFinal + the first lore counter and fires chapter I (CR 714.3a, doubler-aware
 * — a Doubling Season entry fires I AND II); the controller's draw step adds lore and fires exactly the
 * CROSSED chapters (CR 714.3b — transitions only, never a re-fire); a Saga at its final chapter with no
 * chapter ability pending is SACRIFICED at the resolution finalizer (CR 714.4), firing leave + sacrifice
 * watchers like any other non-creature sacrifice.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseSagaChapters } from "./saga.js";
import { enterPermanent } from "./resolvers.js";
import { runStepActions, finalizeStackResolution } from "./gameEngine.js";
import { checkSagaChapterTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// The REAL bundled oracle text (data/scryfall-bulk — never from memory, CLAUDE.md §1.2): chapter II
// exercises the WIP's radAmongPlayers count source, chapter III the Zombie-or-Mutant subtype-UNION
// mass counter — the two atoms this subsystem shipped alongside the chapter machinery.
const VAULT12 = {
  name: "Vault 12: The Necropolis",
  type: "Enchantment — Saga",
  oracle:
    "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\n" +
    "I — Each player gets three rad counters.\n" +
    "II — Create X 2/2 black Zombie Mutant creature tokens, where X is the total number of rad counters among players.\n" +
    "III — Put two +1/+1 counters on each creature you control that's a Zombie or Mutant.",
};

function st({ userBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf } },
  };
}
const sagaOnBf = (state) => state.players.user.battlefield.find((p) => p.sagaFinal);
const pendingChapters = (state) => (state.pendingTriggers || []).filter((t) => t.event === "sagaChapter").map((t) => t.descriptor?.chapter);

describe("SAGA — classifier (all-or-nothing chapters, shared routing gate)", () => {
  it("Vault 12 flips native-trigger (all three chapters parse + route)", () => {
    expect(classifyCard(VAULT12)).toBe("native-trigger");
  });

  it("a residue line, a chapter gap, or an unroutable chapter stays body-only (CREED)", () => {
    // GRADUATED 2026-08-14: a pure COMBAT-KEYWORD line ("\nFlying") is no longer residue — the FF Summon
    // creature Sagas print one and the body machinery credits it (summonBahamut.test.js). The residue pin
    // keeps its teeth on a line the skip must NEVER swallow: an unmodeled ability line.
    expect(classifyCard({ ...VAULT12, name: "Residue Saga", oracle: VAULT12.oracle + "\nProtection from everything" })).toBe("body-only");
    const gap = "I — Each player gets two rad counters.\nIII — Each player gets two rad counters.";
    expect(classifyCard({ ...VAULT12, name: "Gap Saga", oracle: gap })).toBe("body-only");
    expect(parseSagaChapters({ ...VAULT12, oracle: gap })).toBeNull();
    const unroutable = "I — Each player gets two rad counters.\nII — Untap all permanents you control phased out this way.";
    expect(classifyCard({ ...VAULT12, name: "Weird Saga", oracle: unroutable })).toBe("body-only");
  });
});

describe("SAGA — runtime (CR 714.3/714.4)", () => {
  it("entry stamps sagaFinal, adds lore 1, fires chapter I (CR 714.3a)", () => {
    const after = enterPermanent(st(), { ...VAULT12 }, "user");
    const saga = sagaOnBf(after);
    expect(saga.sagaFinal).toBe(3);
    expect(saga.counters.lore).toBe(1);
    expect(pendingChapters(after)).toEqual([1]);
  });

  it("a Doubling Season entry adds TWO lore and fires chapters I AND II (the crossed range)", () => {
    const season = {
      id: "ds1",
      card: { name: "Doubling Season", type: "Enchantment", oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." },
      controller: "user", tapped: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null,
    };
    const after = enterPermanent(st({ userBf: [season] }), { ...VAULT12 }, "user");
    const saga = sagaOnBf(after);
    expect(saga.counters.lore).toBe(2);
    expect(pendingChapters(after).sort()).toEqual([1, 2]);
  });

  it("the controller's draw step adds lore and fires exactly the crossed chapter (CR 714.3b)", () => {
    let state = enterPermanent(st(), { ...VAULT12 }, "user");
    state = { ...state, pendingTriggers: [] }; // chapter I resolved (cleared for the test)
    state = { ...state, activePlayer: "user", phase: "beginning", step: "draw" };
    const stackBefore = (state.stack || []).length;
    const after = runStepActions(state);
    const saga = sagaOnBf(after);
    expect(saga.counters.lore).toBe(2);
    // runStepActions ends with the CR 603.3a flush, so the crossed chapter is ON THE STACK by
    // the time it returns (pendingTriggers drained) — one new stack object, chapter II's ability.
    expect((after.stack || []).length).toBe(stackBefore + 1);
    expect(pendingChapters(after)).toEqual([]);
  });

  it("chapters never re-fire (transitions only)", () => {
    const state = enterPermanent(st(), { ...VAULT12 }, "user");
    const saga = sagaOnBf(state);
    const cleared = { ...state, pendingTriggers: [] };
    expect(pendingChapters(checkSagaChapterTriggers(cleared, saga.id, 1, 1))).toEqual([]); // no crossing
    expect(pendingChapters(checkSagaChapterTriggers(cleared, saga.id, 1, 2))).toEqual([2]); // exactly the crossed one
  });

  it("a finished Saga (lore ≥ final, no chapter pending) is SACRIFICED at the finalizer — leave + sacrifice watchers fire (CR 714.4)", () => {
    const watcher = {
      id: "w1",
      card: { name: "Sac Watcher", type: "Creature — Human", power: 1, toughness: 1, oracle: "Whenever you sacrifice a permanent, draw a card." },
      controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null,
    };
    let state = enterPermanent(st({ userBf: [watcher] }), { ...VAULT12 }, "user");
    const saga = sagaOnBf(state);
    // Advance the lore to the final chapter with its trigger already resolved (cleared).
    state = {
      ...state,
      pendingTriggers: [],
      players: {
        ...state.players,
        user: {
          ...state.players.user,
          battlefield: state.players.user.battlefield.map((p) => (p.id === saga.id ? { ...p, counters: { ...p.counters, lore: 3 } } : p)),
          library: [{ id: "lib1", name: "Top", type: "Sorcery", oracle: "" }],
        },
      },
    };
    const after = finalizeStackResolution(state);
    expect(sagaOnBf(after)).toBeUndefined(); // gone from the battlefield
    expect(after.players.user.graveyard.some((c) => c.name === VAULT12.name)).toBe(true);
    expect(after.log.some((e) => e.kind === "saga-sacrificed")).toBe(true);

    // NOT swept while its final chapter is still pending (CR 714.4's "no chapter ability pending").
    const stillPending = {
      ...state,
      pendingTriggers: [{ event: "sagaChapter", chapter: 3, source: { permanentId: saga.id } }],
    };
    const deferred = finalizeStackResolution(stillPending);
    expect(sagaOnBf(deferred)).toBeDefined(); // still on the battlefield
  });
});
