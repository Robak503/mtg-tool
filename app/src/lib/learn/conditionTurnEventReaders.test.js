/**
 * conditionTurnEventReaders.test.js — the per-turn ledger, crossed with the count-threshold shape (10 cards).
 *
 * Curious Obsession · Franklin Richards, Ascendant · H.E.R.B.I.E., Lovable Robot · Human Torch ·
 * Mercadian Atlas · Nightpack Ambusher · See Red · Seeker of Insight · Starlit Soothsayer · Tapestry of the Ages.
 *
 * ⭐ NOTHING NEW IS TRACKED BY THIS SLICE, and that is the finding. The two incumbent readers each NAMED their
 * own missing arm — "a FILTERED ('a noncreature spell') variant fails the anchor" and "a 'with a creature'
 * qualifier, or a negated form fails the anchor" — both capability language. In every case the LEDGER FIELD
 * ALREADY EXISTED (`noncreatureSpellsCastThisTurn`, `attackedThisTurn`, `landsPlayedThisTurn`,
 * `spellsCastThisTurn`, `lifeGainedThisTurn`, `lifeLostThisTurn`) and simply had no reader. The counter was
 * being maintained every turn and never asked a question.
 *
 * ⛔ AND ONE PRINTED PHRASE IS REFUSED ON PURPOSE — the honest half of the same census. "You haven't cast a
 * spell FROM YOUR HAND this turn" (3 corpus cards) is NOT read, because `spellsCastThisTurn` counts casts from
 * any zone. Reading it would answer FALSE for a player who has only cast from the graveyard — suppressing an
 * ability whose printed condition is TRUE. Pinned below so nobody "fixes" it by pointing it at the wrong field.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, interveningIfParseable, activationConditionParseable } from "./interveningIf.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

/** A board with the given per-turn ledger fields set on the USER seat. */
function seat(fields) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, ...fields } } };
}
const ev = (fields, cond) => evaluateInterveningIf(seat(fields), cond, "user", {});

describe("⛔⭐ NONCREATURE spell count — reads its OWN counter, never the total", () => {
  it("true after a noncreature spell, FALSE when only creature spells were cast", () => {
    expect(ev({ spellsCastThisTurn: 1, noncreatureSpellsCastThisTurn: 1 }, "you've cast a noncreature spell this turn")).toBe(true);
    // ⭐ THE discriminating case. A seat that cast two CREATURE spells has spellsCastThisTurn = 2 and
    // noncreatureSpellsCastThisTurn = 0. Reading the total here would fire Seeker of Insight off a creature.
    expect(ev({ spellsCastThisTurn: 2, noncreatureSpellsCastThisTurn: 0 }, "you've cast a noncreature spell this turn")).toBe(false);
    expect(ev({}, "you've cast a noncreature spell this turn")).toBe(false);
  });
  it("the threshold form counts", () => {
    expect(ev({ noncreatureSpellsCastThisTurn: 2 }, "you've cast two or more noncreature spells this turn")).toBe(true);
    expect(ev({ noncreatureSpellsCastThisTurn: 1 }, "you've cast two or more noncreature spells this turn")).toBe(false);
  });
});

describe("⛔⭐ ATTACKED — the qualifier and the NEGATION", () => {
  it("'with a creature' is the same event (CR 508.1a — only creatures attack)", () => {
    expect(ev({ attackedThisTurn: true }, "you attacked with a creature this turn")).toBe(true);
    expect(ev({}, "you attacked with a creature this turn")).toBe(false);
  });
  it("the negated forms are the exact inverse of the same flag", () => {
    expect(ev({}, "you didn't attack with a creature this turn")).toBe(true);          // unstamped seat = hasn't attacked
    expect(ev({ attackedThisTurn: true }, "you didn't attack with a creature this turn")).toBe(false);
    expect(ev({ attackedThisTurn: true }, "you didn't attack this turn")).toBe(false);
    expect(ev({}, "you haven't attacked this turn")).toBe(true);
  });
});

describe("⛔⭐ the ZERO case of counters that already existed", () => {
  it("'you didn't play a land this turn'", () => {
    expect(ev({}, "you didn't play a land this turn")).toBe(true);
    expect(ev({ landsPlayedThisTurn: 1 }, "you didn't play a land this turn")).toBe(false);
  });
  it("'you didn't cast a spell this turn'", () => {
    expect(ev({}, "you didn't cast a spell this turn")).toBe(true);
    expect(ev({ spellsCastThisTurn: 1 }, "you didn't cast a spell this turn")).toBe(false);
  });
});

describe("⛔⭐ 'you gained or lost life this turn' — EITHER half, never both", () => {
  it("either counter satisfies it; neither does not", () => {
    expect(ev({ lifeGainedThisTurn: 3 }, "you gained or lost life this turn")).toBe(true);
    expect(ev({ lifeLostThisTurn: 2 }, "you gained or lost life this turn")).toBe(true);
    expect(ev({ lifeGainedThisTurn: 3, lifeLostThisTurn: 2 }, "you gained or lost life this turn")).toBe(true);
    // ⭐ The mutation target: requiring BOTH would make a pure lifegain turn read false.
    expect(ev({}, "you gained or lost life this turn")).toBe(false);
  });
});

describe("⛔⭐ THE DELIBERATE REFUSAL — a ZONE-qualified cast is not readable from a zone-blind counter", () => {
  it("'you haven't cast a spell from your hand this turn' stays on the Arbiter", () => {
    // spellsCastThisTurn counts casts from ANY zone. Pointing this phrase at it would answer FALSE for a
    // player who has cast only from the graveyard (flashback / escape / adventure), suppressing an ability
    // whose printed condition is TRUE. Three corpus cards carry it; they park until casts are tracked by
    // source zone. Do not "fix" this by reusing the zone-blind counter.
    expect(activationConditionParseable("you haven't cast a spell from your hand this turn")).toBe(false);
    expect(interveningIfParseable("you haven't cast a spell from your hand this turn")).toBe(false);
  });
  it("⛔ and the other census phrases needing NEW tracking still park", () => {
    // ✅ "you descended this turn" GRADUATED off this list (2026-07-30) — CR 700.11, built on a
    // descendedThisTurn tally stamped at the graveyard-entry chokepoint. Re-pointed rather than deleted,
    // per the pin discipline: a BOUNDARY-MARKER pin records "not tracked yet", so when the tracking lands
    // the pin becomes the assertion that it did. Deleting it would erase the boundary instead of moving it.
    // ✅ "you created a token this turn" GRADUATED too (2026-10-01, play-weighted P·11 — Idol of Oblivion): a
    // createdTokenThisTurn flag stamped at the token mint chokepoint, real tokens only. Re-pointed below.
    for (const c of ["you put a counter on a creature this turn", "you've discarded a card this turn"]) {
      expect(activationConditionParseable(c), c).toBe(false);
    }
    expect(activationConditionParseable("you descended this turn")).toBe(true);
    expect(activationConditionParseable("you created a token this turn")).toBe(true);
  });
});

describe("⛔ THE INCUMBENTS ARE UNCHANGED", () => {
  it("the unqualified spell-count and attacked readers behave exactly as before", () => {
    expect(ev({ spellsCastThisTurn: 2 }, "you've cast two or more spells this turn")).toBe(true);
    expect(ev({ spellsCastThisTurn: 1 }, "you've cast two or more spells this turn")).toBe(false);
    expect(ev({ spellsCastThisTurn: 1 }, "you've cast a spell this turn")).toBe(true);
    expect(ev({ attackedThisTurn: true }, "you attacked this turn")).toBe(true);
    expect(ev({}, "you attacked this turn")).toBe(false);
  });
});
