/**
 * CMD-COMPANION (CR 702.139) — a companion starts OUTSIDE the game (the `companion` player field). The
 * once-per-game "{3}: put this card from outside the game into your hand" action moves it → hand and clears
 * the field; it's then a NORMAL hand card (cast via the ordinary cast path — NOT a commander, no tax).
 * Commander framework PR5 (the last piece).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LURRUS = () => ({ id: "comp1", name: "Lurrus of the Dream-Den", type: "Legendary Creature — Cat Nightmare", mana: "{1}{W}{W}", oracle: "Companion", keywords: [] });

function withCompanion({ mana = { W: 5 } } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [], userCompanion: LURRUS() });
  return {
    ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...base.players, user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana } } },
  };
}
const companionAction = (s) => legalActionsForPlayer(s, "user").find(a => a.kind === "companion-to-hand");

describe("CMD-COMPANION — setup + the {3} action", () => {
  it("seats the companion OUTSIDE the game (the `companion` field), NOT in the command zone or hand", () => {
    const s = createGameState({ userDeck: [], aiDeck: [], userCompanion: LURRUS() });
    expect(s.players.user.companion?.name).toBe("Lurrus of the Dream-Den");
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.command).toEqual([]); // a companion is NOT a commander
  });

  it("offers the {3}-to-hand action at sorcery speed when {3} is affordable", () => {
    const a = companionAction(withCompanion());
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(3);
    expect(a.cardId).toBe("comp1");
  });

  it("is NOT offered without {3} of mana, nor at instant speed (non-main / non-empty-stack)", () => {
    expect(companionAction(withCompanion({ mana: { W: 2 } }))).toBeFalsy();            // only 2 mana
    const combat = { ...withCompanion(), phase: "combat", step: "declare-attackers" };
    expect(companionAction(combat)).toBeFalsy();                                       // sorcery-speed only
  });
});

describe("CMD-COMPANION — bring it to hand (once per game), then cast normally", () => {
  it("pays {3}, moves the companion → hand, clears the field, and never re-offers", () => {
    let s = withCompanion();
    s = dispatchAction(s, companionAction(s));
    expect(s.players.user.hand.some(c => c.id === "comp1")).toBe(true); // now in hand
    expect(s.players.user.companion).toBe(null);                         // cleared (once per game)
    expect(s.players.user.manaPool.W).toBe(2);                           // {3} paid from 5
    expect(companionAction(s)).toBeFalsy();                              // not offered again
  });

  it("keeps the actor's priority and RESETS the pass-in-succession chain (a special action doesn't pass — CR 116.2g)", () => {
    // Regression (4b P1): without this the stale consecutivePasses could end the step early. Mirrors
    // every sibling active-window handler (play-land / cast-spell / activate-ability).
    let s = { ...withCompanion(), consecutivePasses: 2 };
    s = dispatchAction(s, companionAction(s));
    expect(s.consecutivePasses).toBe(0);   // pass-chain reset — won't skip remaining priority windows
    expect(s.priorityHolder).toBe("user"); // the actor retains priority after the special action
  });

  it("once in hand the companion casts via the ORDINARY cast path (fromZone hand — NOT a taxed commander cast)", () => {
    let s = withCompanion({ mana: { W: 6 } });
    s = dispatchAction(s, companionAction(s)); // → hand, {3} paid, W:3 left
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "comp1");
    expect(cast).toBeTruthy();
    expect(cast.fromZone).toBe("hand");        // a normal hand cast, not "command"
    expect(cast.cost.generic).toBe(1);         // {1}{W}{W} — its printed cost, untaxed
  });
});
