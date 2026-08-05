/**
 * discardTriggerDispatcherWiring.test.js — ⛔⛔ A LIVE BUG: every discard routed through the ACTION
 * DISPATCHER fired no triggers at all.
 *
 * `checkDiscardTriggers` is a PURE function — it returns a new state with the fired triggers appended to
 * `pendingTriggers`. All six dispatcher call sites invoked it as a BARE STATEMENT and threw the result away:
 *
 *     checkDiscardTriggers(working, action.playerId, 1);   // ⛔ result discarded
 *
 * So the additional-cost discard (both the single and the N-card loop), the activated-ability discard cost,
 * CYCLING, and the alt-cost path all moved the card to the graveyard and fired NOTHING. Liliana's Caress,
 * Megrim, Raiders' Wake, Fell Specter and every "whenever an opponent discards" card read native and did
 * nothing on the most common discard routes in the game — and the self-discard family shipped one slice
 * earlier inherited exactly the same deadness.
 *
 * ⭐ EVERY OTHER CALL SITE IN THE CODEBASE ALREADY ASSIGNED THE RESULT (connive, the hand atoms, the
 * iterated edict, both runProgram paths). That consistency is what made the omission invisible: the function
 * was obviously correct, its callers were mostly correct, and the six that weren't looked identical to the
 * ones that were. **A pure function called as a statement is a silent no-op — grep for bare calls.**
 *
 * ⓘ Found while sizing the NEXT slice, not by a failing test. Nothing in the suite covered a
 * dispatcher-driven discard end-to-end, which is why a 6-site omission survived: the trigger machinery has
 * its own tests, the dispatcher has its own tests, and nobody drove the seam between them.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied): the assignment reverted at the cycling site ->
 * the witness shows zero pending triggers after a cycle.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CARESS = { id: "c-lc", name: "Liliana's Caress", type: "Enchantment", mana: "{1}{B}",
  oracle: "Whenever an opponent discards a card, that player loses 2 life." };
const SELF_WATCHER = { id: "c-gs", name: "Grisly Survivor", type: "Creature — Minotaur Warrior", mana: "{2}{B}",
  power: "3", toughness: "3", oracle: "Whenever you cycle or discard a card, this creature gets +2/+0 until end of turn." };
const CYCLER = { id: "c-cy", name: "Cast Out", type: "Enchantment", mana: "{3}{W}",
  oracle: "Flash\nWhen this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.\nCycling {W}" };

describe("⭐⭐ LAW 6 — a dispatcher-driven CYCLE fires the discard watchers", () => {
  /** user holds a cycling card and controls a self-watcher; ai controls an opponent-watcher. */
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g,
      phase: "main1",
      players: { ...g.players,
        user: { ...g.players.user, hand: [{ ...CYCLER, id: "cy1" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
          battlefield: [createPermanent({ id: "mine", card: SELF_WATCHER, controller: "user" })] },
        ai: { ...g.players.ai, battlefield: [createPermanent({ id: "theirs", card: CARESS, controller: "ai" })] } } };
  }

  it("⭐⭐ cycling a card enqueues BOTH watchers — before the fix it enqueued nothing", () => {
    const after = dispatchAction(board(), { kind: "cycle", playerId: "user", cardId: "cy1", cost: { W: 1 } });
    const t = (after.pendingTriggers || []).filter((x) => x.event === "discarded");
    const row = {
      total: t.length,
      self: t.filter((x) => x.descriptor?.scope === "youDiscard").length,
      opponent: t.filter((x) => x.descriptor?.scope === "opponentDiscard").length,
      cardInGraveyard: (after.players.user.graveyard || []).some((c) => c.id === "cy1"),
    };
    console.log("  WITNESS cycleDiscardWiring", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⛔ THE BUG'S SIGNATURE IS `total: 0` WITH `cardInGraveyard: true` — the discard happened, the triggers
    // did not. That combination is what a dropped return value looks like from the outside, and it is why
    // nothing in the suite caught it: the zone change was always correct.
    expect(row).toEqual({ total: 2, self: 1, opponent: 1, cardInGraveyard: true });
  });
});
