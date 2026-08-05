/**
 * wardDiscard.test.js — "Ward—Discard a card." (CR 702.21a): Mighty Servant of Leuk-o, Graveyard
 * Trespasser, Tragedy Feaster, Maha Its Feathers Night and 8 more.
 *
 * ⚠️ MEASURED +0 COVERAGE AND SHIPPED ANYWAY — the reasoning matters more than the number here, so it is
 * written down rather than buried. Ward is enforced at the TARGETING chokepoint
 * (`wardTaxForStackObject` reads the permanent's card directly), which is INDEPENDENT of a card's coverage
 * tier. So before this, every one of these creatures sat on the battlefield with its ward SILENTLY IGNORED:
 * an opponent targeted it for free. The carriers still park on unrelated lines — hence +0 — but the RULES
 * GAP is real and is now closed. A flip-diff measures classification, not correctness.
 *
 * ⭐ WHY IT WAS PAYABLE AFTER ALL. `ward.js` refused this for a stated reason: a mana or life ward is one
 * yes/no, while a discard needs a SECOND decision (which card). The unlock is that, unlike mana, a discard
 * with a non-empty hand ALWAYS SUCCEEDS — so the SPELL'S FATE is settled at the "pay?" answer and the card
 * pick is a follow-up that cannot change it. The settlement marks the spell saved, then hands off to
 * `advanceDiscardChain`, which already discards inline when the hand is small enough to leave no real
 * decision and pauses for a pick otherwise. No new choice machinery was invented.
 *
 * ⛔ AN EMPTY HAND IS "CAN'T PAY" → the spell is COUNTERED, not waved through. That is the single most
 * dangerous way to get this wrong, and it is driven below.
 * ⛔ TOKENS ARE EXCLUDED from the affordability count to match `advanceDiscardChain`, which filters them
 * from the discardable hand — counting them would promise a payment the chain then couldn't make.
 * ⛔ WHEN THE CHAIN PAUSES, THE SOFT-COUNTER'S `resume` IS CARRIED ONTO THE DISCARD CHOICE so the suspended
 * caster program fires exactly once, after the discard settles — not twice, and not never.
 *
 * ⓘ SACRIFICE ward stays refused. Choosing which permanent to sacrifice has no equivalent "always succeeds"
 * shortcut — the choice can matter enormously — and there is no sacrifice chain with this shape yet.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * parser arm removed -> the ward vanishes and the spell resolves for free; the empty-hand affordability
 * check removed -> a player with no cards "pays" and keeps the spell.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseWardCost, wardTaxForStackObject } from "./ward.js";
import { setPendingSoftCounterChoice } from "./pendingChoice.js";
import { resolveSoftCounterChoice, resolveDiscardChoice, autoPickSoftCounterPay } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const TRESPASSER = { id: "c-gt", name: "Graveyard Trespasser", type: "Creature — Human Werewolf",
  mana: "{2}{B}", power: "3", toughness: "3",
  oracle: "Ward—Discard a card.\nWhenever this creature enters or attacks, exile up to one target card from a graveyard." };

describe("the cost parses, and the refusals hold", () => {
  it("⭐ discard forms read; sacrifice and collect-evidence still refuse", () => {
    const w = (o) => parseWardCost({ id: "p", name: "P", type: "Creature — Horror", oracle: o });
    expect(w("Ward—Discard a card.")).toEqual({ kind: "discard", n: 1 });
    expect(w("Ward—Discard two cards.")).toEqual({ kind: "discard", n: 2 });
    expect(w("Ward—Sacrifice a creature.")).toBeNull();
    expect(w("Ward—Collect evidence 4.")).toBeNull();
    // The already-modelled forms are untouched.
    expect(w("Ward—Pay 3 life.")).toEqual({ kind: "life", life: 3 });
  });
});

describe("⭐ LAW 6 — the ward is raised and paid on a real stack", () => {
  function board({ handSize }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const warded = createPermanent({ id: "warded", card: TRESPASSER, controller: "ai1", summoningSick: false });
    const hand = Array.from({ length: handSize }, (_, i) => ({ id: `h${i}`, name: `Card ${i}`, type: "Instant", oracle: "" }));
    return { ...g, turn: 5,
      stack: [{ id: "sp1", kind: "spell", controller: "user", card: { id: "s", name: "Shock", type: "Instant" },
        targets: [{ type: "creature", id: "warded" }] }],
      players: { ...g.players, user: { ...g.players.user, hand }, ai1: { ...g.players.ai1, battlefield: [warded] } } };
  }
  const raise = (s) => {
    const tax = wardTaxForStackObject(s, s.stack[0]);
    return { tax, state: tax ? setPendingSoftCounterChoice(s, { controller: "user", amount: 0, cost: tax.cost, spellId: "sp1", spellName: "Shock" }) : s };
  };

  it("⭐ the ward FIRES on an opponent's spell — it was silently ignored before", () => {
    const { tax } = raise(board({ handSize: 3 }));
    expect(tax?.cost).toEqual({ kind: "discard", n: 1 });
  });

  it("⭐ PAY with cards in hand → spell SURVIVES, and a real discard pick is raised", () => {
    const { state } = raise(board({ handSize: 3 }));
    let s = resolveSoftCounterChoice(state, true);
    const row = { pausedFor: s.pendingChoice?.kind || null, stackAfterPay: s.stack.length, handBeforePick: s.players.user.hand.length };
    // The chain pauses for the pick (hand 3 > 1 owed), so the card leaves only once it is chosen.
    s = resolveDiscardChoice(s, "h1");
    const after = { hand: s.players.user.hand.map((c) => c.id), graveyard: s.players.user.graveyard.map((c) => c.id), stack: s.stack.length };
    console.log("  WITNESS", JSON.stringify({ row, after })); // printed so a broken harness can't read as a clean negative
    expect(row).toEqual({ pausedFor: "discard", stackAfterPay: 1, handBeforePick: 3 });
    // ⭐ The spell is STILL ON THE STACK (saved), and exactly the chosen card was discarded.
    expect(after).toEqual({ hand: ["h0", "h2"], graveyard: ["h1"], stack: 1 });
  });

  it("⛔⛔ EMPTY HAND = CAN'T PAY → the spell is COUNTERED, not waved through", () => {
    const { state } = raise(board({ handSize: 0 }));
    // The AI/auto path must agree it is unaffordable, or it would "pay" nothing and keep the spell.
    expect(autoPickSoftCounterPay(state, state.pendingChoice)).toBe(false);
    const s = resolveSoftCounterChoice(state, true);   // even ANSWERING "pay" cannot save it
    console.log("  WITNESS", JSON.stringify({ stack: s.stack.length, pending: s.pendingChoice?.kind || null }));
    expect(s.stack.length).toBe(0);
    expect(s.pendingChoice).toBeFalsy();
  });

  it("⛔ DECLINE → countered, and NO HAND CARD is discarded", () => {
    const { state } = raise(board({ handSize: 3 }));
    const s = resolveSoftCounterChoice(state, false);
    expect(s.stack.length).toBe(0);
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["h0", "h1", "h2"]);   // hand untouched
    // ⓘ The graveyard is NOT empty here and that is correct: the COUNTERED SPELL goes there (CR 701.6a).
    // Asserting emptiness would have been asserting a bug. The claim that matters is that NO CARD FROM HAND
    // followed it — a decline must cost nothing. (The spell's own graveyard entry is incidental to this
    // pin and its exact shape depends on the synthetic stack object, so it is deliberately not asserted.)
    expect(s.players.user.graveyard.some((c) => String(c?.id || "").startsWith("h"))).toBe(false);
  });

  it("⛔ a hand of exactly the owed size is FORCED — no pointless pause", () => {
    // advanceDiscardChain discards inline when there is no real decision left.
    const { state } = raise(board({ handSize: 1 }));
    const s = resolveSoftCounterChoice(state, true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["h0"]);
    expect(s.stack.length).toBe(1);   // still saved
  });
});
