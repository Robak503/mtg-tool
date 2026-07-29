/**
 * taleOfKataraAndToph.test.js — "Creatures you control have "Whenever this creature becomes tapped FOR THE
 * FIRST TIME DURING EACH OF YOUR TURNS, put a +1/+1 counter on it.""
 *
 * The only corpus card with this wording, and it takes Earth Bent — the deck closest to the 1.0 per-deck
 * bar — across 90%.
 *
 * ⚠️ TWO SEPARATE FALSE POSITIVES HAD TO BE CLOSED, and the classifier saw NEITHER. The card read
 * `native-static` after the detection arm alone, while at runtime it did nothing at all:
 *
 *   1. `checkTapTriggers` read the PRINTED card (`lk.permanent.card`) and never consulted group-granted
 *      abilities. The recipient creatures' own text says nothing about tapping, so the granted trigger could
 *      never fire — a runtime-vacuous native. Fixed by routing through `triggersForEvent`, which already
 *      collects grants AND applies the gates that path skipped entirely.
 *   2. The descriptor build recomputed `oncePerTurnTrigger` from the printed sentence "This ability triggers
 *      only once each turn." and OVERWROTE the flag this arm sets from the EVENT wording. Detection looked
 *      right and the latch was gone, so it would have fired on every tap instead of the first — an over-fire.
 *
 * Both are the same lesson in different costumes: a descriptor field is a claim until something reads it on
 * a board. Hence every gate below is asserted at runtime, not on the parse.
 *
 * WHY THE LATCH KEYING NEEDED NO CHANGE: it is keyed per SOURCE PERMANENT + event, and a group grant makes
 * each recipient creature its own source — so it is one counter per creature per turn, not one board-wide.
 */
import { beforeEach, describe, expect, it } from "vitest";

import "./coverage.js"; // registers the group-grant body validators (they are injected to avoid a load cycle)
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkTapTriggers } from "./triggers.js";
import { flushTriggers } from "./gameEngine.js";
import { grantedTriggeredQuotedFor } from "./layers.js";
import { tapPermanent, untapPermanent, createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TALE = {
  id: "tale", name: "Tale of Katara and Toph", type: "Enchantment", mana: "{2}{G}",
  oracle: 'Creatures you control have "Whenever this creature becomes tapped for the first time during each of your turns, put a +1/+1 counter on it."',
};
const BEAR = { id: "b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const INNER = "Whenever this creature becomes tapped for the first time during each of your turns, put a +1/+1 counter on it.";

describe("detection", () => {
  it("Tale of Katara and Toph classifies native", () => {
    expect(classifyCard(TALE)).toBe("native-static");
  });

  it("⭐ BOTH halves of the qualifier survive onto the descriptor", () => {
    const [t] = detectTriggers({ name: "X", type: "Creature", mana: "{2}{G}", oracle: INNER });
    // `whose:"yours"` is the your-turns gate; oncePerTurnTrigger is the first-time latch. The second was
    // silently overwritten to false by the descriptor build until that was fixed — assert it HERE, at the
    // built descriptor, not at the arm's return value, because that is where it was lost.
    expect(t).toMatchObject({ event: "becomesTapped", scope: "self", whose: "yours", oncePerTurnTrigger: true });
  });

  it("the BARE becomes-tapped form is untouched — no stray gate, no stray latch", () => {
    const [t] = detectTriggers({ name: "X", type: "Creature", mana: "{2}{G}", oracle: "Whenever this creature becomes tapped, put a +1/+1 counter on it." });
    expect(t).toMatchObject({ event: "becomesTapped", whose: "any" });
    expect(t.oncePerTurnTrigger).toBe(false);
  });
});

describe("⭐ RUNTIME — the granted trigger actually fires, and both gates hold", () => {
  function board({ withTale = true, activePlayer = "user" } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = [createPermanent({ id: "b", card: BEAR, controller: "user" })];
    if (withTale) bf.push(createPermanent({ id: "tale", card: TALE, controller: "user" }));
    return { ...s, activePlayer, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const firedOnTap = (st) => (checkTapTriggers(tapPermanent(st, "b")).pendingTriggers || []).length;

  it("the grant reaches the creature at all (the plumbing under everything below)", () => {
    expect(grantedTriggeredQuotedFor(board(), "b")).toEqual([INNER]);
  });

  it("⭐ tapping a granted creature on MY turn fires it", () => {
    expect(firedOnTap(board())).toBe(1);
  });

  it("⭐ CREED — the SAME tap on an OPPONENT's turn does NOT fire (the your-turns gate)", () => {
    expect(firedOnTap(board({ activePlayer: "ai" }))).toBe(0);
  });

  it("CONTROL — with no granter on the battlefield nothing fires", () => {
    // Without this the two assertions above would pass on a checker that fired unconditionally.
    expect(firedOnTap(board({ withTale: false }))).toBe(0);
  });

  it("⭐ CREED — the SECOND tap in the same turn does NOT fire again (the first-time latch)", () => {
    let s = board();
    const cycle = (st) => untapPermanent(flushTriggers(checkTapTriggers(tapPermanent(st, "b"))), "b");
    s = cycle(s);
    const afterFirst = (s.stack || []).length;
    expect(afterFirst).toBe(1);
    s = cycle(s);
    expect((s.stack || []).length).toBe(afterFirst); // unchanged — the re-fire was dropped
  });
});
