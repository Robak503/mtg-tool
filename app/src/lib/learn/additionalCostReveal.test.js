/**
 * additionalCostReveal.test.js — AC-REVEAL: "reveal a <Subtype> card from your hand or pay {N}".
 * Silvergill Adept, Wren's Run Vanquisher, Daring Buccaneer, Goldmeadow Stalwart, Squeaking Pie Sneak,
 * Sadistic Skymarcher, Thunderherd Migration, Flamekin Bladewhirl, Surtland Elementalist.
 *
 * ⭐ THE TRIBAL-DISCOUNT CYCLE — 9 carriers, ceiling 9 of 9, all shipped. The reveal moves NOTHING:
 * payability is simply "a matching card is in hand", so the kind is fail-closed by construction (an unknown
 * subtype word matches no hand card ever) and needs no curated allowlist — unlike the tutor-filter
 * vocabulary, where a filter that matches nothing still classifies the card native. Here a dead subtype
 * only kills the reveal OPTION; the pay option still casts the spell at its printed compound.
 *
 * ⭐ ONE SUBTYPE EVALUATOR, AGAIN: the hand check reuses sacTypeMatches' word-bounded subtype path
 * (type "permanent" + subtype) rather than growing a second matcher.
 *
 * ⛔⛔ THE SPELL CANNOT REVEAL ITSELF, AND THIS IS THE WHOLE SLICE'S TRAP: CR 601.2h — the spell is on the
 * stack while its costs are paid, so it is not in hand. Daring Buccaneer IS a Pirate; without the
 * exclusion, every copy would pay its own discount and the {2} would never be charged —
 * cheaper-than-printed, the forbidden direction. The Law-6 rows below make this the named assertion.
 *
 * Mutation-checked (2026-08-07, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · REVEAL_HAND_COST_RE removed -> all nine park (the OR side fails vetting).
 *   · the self-exclusion (`h.id !== card.id`) dropped -> Daring Buccaneer alone in hand OFFERS the reveal
 *     option — pays its own discount, the free-spell direction. The tier cannot see it; only the
 *     lone-Buccaneer row below can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-07).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BUCCANEER = { id: "c-db", name: "Daring Buccaneer", type: "Creature — Human Pirate", mana: "{R}", power: "2", toughness: "2",
  oracle: "As an additional cost to cast this spell, reveal a Pirate card from your hand or pay {2}." };
const SILVERGILL = { id: "c-sg", name: "Silvergill Adept", type: "Creature — Merfolk Wizard", mana: "{1}{U}", power: "2", toughness: "1",
  oracle: "As an additional cost to cast this spell, reveal a Merfolk card from your hand or pay {3}.\nWhen this creature enters, draw a card." };
const OTHER_PIRATE = { id: "c-op", name: "Spare Pirate", type: "Creature — Human Pirate", power: "1", toughness: "1", mana: "{B}", oracle: "" };
const NON_PIRATE = { id: "c-np", name: "Plain Bear", type: "Creature — Bear", power: "2", toughness: "2", mana: "{G}", oracle: "" };

function board(hand, pool) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...b.players, user: { ...b.players.user, hand, battlefield: [],
      manaPool: { ...b.players.user.manaPool, ...pool } } } };
}
const poolTotal = (s) => ["W", "U", "B", "R", "G", "C"].reduce((n, k) => n + (s.players.user.manaPool[k] || 0), 0);
const buccaneerOffers = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-db");

describe("the carriers", () => {
  it("⭐ the cycle flips native", () => {
    for (const c of [BUCCANEER, SILVERGILL]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the self-reveal trap, by name", () => {
  it("⛔⛔ Daring Buccaneer ALONE in hand: it is a Pirate, and it must NOT reveal itself", () => {
    // {R} + the pay option's {2} = 3 mana. Reveal would cast for 1 — if it could pay its own discount.
    const s = board([BUCCANEER], { R: 1, C: 2 });
    const offers = buccaneerOffers(s);
    const row = {
      revealOffered: offers.some((a) => a.revealCardId),
      payOffered: offers.some((a) => a.payManaCost),
    };
    console.log("  WITNESS lonePirate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ revealOffered: false, payOffered: true }); // ⛔ CR 601.2h — it is on the stack, not in hand
  });

  it("⭐⭐ with a SECOND Pirate in hand both options appear — and each charges its own price", () => {
    const s = board([BUCCANEER, OTHER_PIRATE], { R: 1, C: 2 });
    const offers = buccaneerOffers(s);
    const reveal = offers.find((a) => a.revealCardId);
    const pay = offers.find((a) => a.payManaCost);
    expect(reveal, "the reveal option").toBeTruthy();
    expect(pay, "the pay option").toBeTruthy();
    expect(reveal.revealCardId).toBe("c-op"); // the OTHER Pirate, never itself
    // Reveal lane: printed {R} only → pool 3 → 2, and the revealed card STAYS IN HAND.
    const afterReveal = dispatchAction(s, reveal);
    // Pay lane: {R} + {2} → pool 3 → 0.
    const afterPay = dispatchAction(s, pay);
    const row = {
      revealPool: [poolTotal(s), poolTotal(afterReveal)],
      revealKeptInHand: afterReveal.players.user.hand.some((h) => h.id === "c-op"),
      payPool: [poolTotal(s), poolTotal(afterPay)],
    };
    console.log("  WITNESS revealVsPay", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ revealPool: [3, 2], revealKeptInHand: true, payPool: [3, 0] });
  });

  it("⛔ a hand full of NON-Pirates offers only the pay option", () => {
    const s = board([BUCCANEER, NON_PIRATE], { R: 1, C: 2 });
    const offers = buccaneerOffers(s);
    expect(offers.some((a) => a.revealCardId)).toBe(false); // a Bear is not a Pirate — word-bounded subtype match
    expect(offers.some((a) => a.payManaCost)).toBe(true);
  });
});
