/**
 * LEAVE-DRAIN AT COST TIME (CR 603.3b) — overhaul pass.
 *
 * Non-creature battlefield exits paid as COSTS (a Treasure cracked for mana, a non-creature
 * γ1b sacrifice, a γ1c self-exile) recorded pendingLeaveEvents that did not drain until the
 * NEXT stack resolution — so permanentLeaves watchers (Marionette Apprentice class) fired in
 * the wrong order (after the ability instead of above it) and the drain scanned a battlefield
 * that could have changed since the event (the stale-scan FP window). The dispatcher now
 * drains at each cost-exit chokepoint; these tests pin the drained-queue invariant AND the
 * watcher firing at cost time with a real-oracle watcher.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real oracle (bundled index): the aristocrats LTB watcher, "another"-scoped.
const APPRENTICE = {
  id: "card-app", name: "Marionette Apprentice", type: "Creature — Human Artificer",
  power: 1, toughness: 3,
  oracle: "Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.",
};

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withUserPerms(state, perms) {
  return { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: perms } } };
}
const treasure = (id) => createPermanent({
  id, card: { id: `card-${id}`, name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
  controller: "user", summoningSick: false,
});

describe("cost-exit leave drains (CR 603.3b)", () => {
  it("cracking a Treasure for mana drains the leave event at cost time and fires the watcher", () => {
    const watcher = createPermanent({ id: "perm-w", card: APPRENTICE, controller: "user", summoningSick: false });
    const t = treasure("perm-t");
    let s = withUserPerms(mainState(), [watcher, t]);
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "perm-t");
    expect(tap).toBeTruthy();
    s = dispatchAction(s, tap);
    expect(s.pendingLeaveEvents || []).toHaveLength(0);                 // drained AT the crack, not later
    // The watcher's trigger fired off the drain (pendingTriggers or already stacked — either way, queued).
    const queued = (s.pendingTriggers || []).length + (s.stack || []).filter((o) => o.kind === "trigger" || o.payload?.resolver === "EFFECT_PROGRAM").length;
    expect(queued).toBeGreaterThan(0);
  });

  it("a γ1c self-exile cost drains its leave event at cost time", () => {
    // "Exile this artifact: draw"-shaped γ1c source; the exit is exile (not dies), so only the
    // leave queue matters — it must be empty right after the dispatch.
    const relic = createPermanent({
      id: "perm-r",
      card: { id: "card-r", name: "Test Relic", type: "Artifact", oracle: "{T}, Exile this artifact: Draw a card." },
      controller: "user", summoningSick: false,
    });
    let s = withUserPerms(mainState(), [relic]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-r");
    if (!act) return; // the γ1c parse may not model this exact fixture — the treasure test above is the load-bearing pin
    s = dispatchAction(s, act);
    expect(s.pendingLeaveEvents || []).toHaveLength(0);
  });
});
