/**
 * conditionMetricReaders.test.js — the metric/scope readers of the condition grammar (22 cards).
 *
 * Battle of Wits · Butterbur, Bree Innkeeper · Dust Stalker · Emperor Crocodile · Feudkiller's Verdict ·
 * Glorious Enforcer · Gutwrencher Oni · Imaginary Pet · Ivory Crane Netsuke · Kezzerdrix · Lone Revenant ·
 * Near-Death Experience · Painwracker Oni · Raving Oni-Slave · Scalding Tongs · Scourge of Numai ·
 * Scroll of Origins · Survival Cache · Synod Centurion · Takenuma Bleeder · Thopter Assembly · Thumbscrews.
 *
 * ⭐ EVERY ONE OF THESE IS A ZERO-CASE THAT NEVER GOT ITS THRESHOLD, or a scope that never got its inverse:
 *   • `you have no cards in hand` was modeled; the hand COUNT had nothing — while `controllerMetric` has read
 *     `player.hand.length` since the opponent hand-compare shipped.
 *   • `you have N or less life` was modeled; `exactly N` was not (it is not a one-sided threshold).
 *   • `you control no <filter>` was modeled; `no OTHER <filter>` was not.
 *   • `an opponent has more life than you` was modeled; the inverse direction was not.
 *   • the library count had no reader at all.
 *
 * ⛔ THE THREE PLACES THIS COULD GO WRONG, each pinned and mutation-checked below:
 *   A. the source-excluding count must actually exclude the source, and must FAIL CLOSED without a referent;
 *   B. `your opponents control no X` is UNIVERSAL over opponents, not existential;
 *   C. `you have more life than an opponent` is NOT the negation of `an opponent has more life than you` —
 *      on a tie BOTH are false, so implementing either as `!other` answers wrongly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, activationConditionParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CREA = { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
const mk = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl });

/** state with per-seat {battlefield, hand, library, life}. */
function world({ user = {}, ai = {}, ai2 = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  // `pid` is the REAL player id — createPermanent validates it against VALID_PLAYER_IDS, so the id prefix and
  // the controller cannot be the same short string.
  const seat = (base, o, pid) => ({
    ...base,
    battlefield: (o.bf || []).map((card, i) => mk(`${pid}-${i}`, pid, card)),
    hand: Array.from({ length: o.hand ?? 0 }, () => ({ name: "x" })),
    library: Array.from({ length: o.lib ?? 0 }, () => ({ name: "L" })),
    life: o.life ?? 40,
  });
  const players = { ...s.players, user: seat(s.players.user, user, "user"), ai: seat(s.players.ai, ai, "ai") };
  if (ai2) players.ai2 = seat(s.players.ai, ai2, "ai2");
  return { ...s, players };
}
const ev = (w, cond, ctx = {}) => evaluateInterveningIf(w, cond, "user", ctx);

describe("⭐ HAND COUNT — all three directions, with the zero case untouched", () => {
  it("the bare/at-least form means ≥N (a hand of five satisfies 'a card in hand')", () => {
    expect(ev(world({ user: { hand: 5 } }), "you have a card in hand")).toBe(true);
    expect(ev(world({ user: { hand: 0 } }), "you have a card in hand")).toBe(false);
    expect(ev(world({ user: { hand: 7 } }), "you have seven or more cards in hand")).toBe(true);
    expect(ev(world({ user: { hand: 6 } }), "you have seven or more cards in hand")).toBe(false);
  });
  it("'or fewer' flips the direction", () => {
    expect(ev(world({ user: { hand: 3 } }), "you have three or fewer cards in hand")).toBe(true);
    expect(ev(world({ user: { hand: 4 } }), "you have three or fewer cards in hand")).toBe(false);
  });
  it("⛔ the incumbent ZERO case is unchanged", () => {
    expect(ev(world({ user: { hand: 0 } }), "you have no cards in hand")).toBe(true);
    expect(ev(world({ user: { hand: 1 } }), "you have no cards in hand")).toBe(false);
  });
});

describe("⭐ LIFE — the exact form, and the LIBRARY count", () => {
  it("'exactly N' is neither threshold direction", () => {
    expect(ev(world({ user: { life: 1 } }), "you have exactly 1 life")).toBe(true);
    expect(ev(world({ user: { life: 2 } }), "you have exactly 1 life")).toBe(false);
    expect(ev(world({ user: { life: 0 } }), "you have exactly 1 life")).toBe(false);
  });
  it("Battle of Wits reads the library length", () => {
    expect(ev(world({ user: { lib: 200 } }), "you have 200 or more cards in your library")).toBe(true);
    expect(ev(world({ user: { lib: 199 } }), "you have 200 or more cards in your library")).toBe(false);
  });
});

describe("⛔⭐ GUARD A — the source-excluding count excludes the source, and FAILS CLOSED without one", () => {
  it("the source itself does not count towards 'no other creatures'", () => {
    // ⭐ THE discriminating board: the source IS a creature and is the ONLY creature. Without the exclusion the
    // count is 1 and the condition reads FALSE — suppressing an ability whose printed condition is TRUE.
    const w = world({ user: { bf: [CREA] } });
    const srcId = w.players.user.battlefield[0].id;
    expect(ev(w, "you control no other creatures", { sourcePermanentId: srcId })).toBe(true);
  });
  it("a second creature does count", () => {
    const w = world({ user: { bf: [CREA, CREA] } });
    const srcId = w.players.user.battlefield[0].id;
    expect(ev(w, "you control no other creatures", { sourcePermanentId: srcId })).toBe(false);
  });
  it("the 'other than this <noun>' phrasing is the same reading", () => {
    const w = world({ user: { bf: [{ name: "T", type: "Artifact Creature — Thopter", power: 1, toughness: 1 }] } });
    const srcId = w.players.user.battlefield[0].id;
    expect(ev(w, "you control no thopters other than this creature", { sourcePermanentId: srcId })).toBe(true);
  });
  it("⛔ NO referent → null (Arbiter), never an answer from the unexcluded count", () => {
    expect(ev(world({ user: { bf: [CREA] } }), "you control no other creatures", {})).toBe(null);
  });
  it("colorless is the ABSENCE of colour, not a sixth colour", () => {
    const w = world({ user: { bf: [CREA, { ...CREA, colors: [] }] } });
    const srcId = w.players.user.battlefield[0].id;
    // The non-source creature is colourless, so a colourless-scoped 'no other' is FALSE.
    expect(ev(w, "you control no other colorless creatures", { sourcePermanentId: srcId })).toBe(false);
    const w2 = world({ user: { bf: [CREA, { ...CREA, colors: ["G"] }] } });
    expect(ev(w2, "you control no other colorless creatures", { sourcePermanentId: w2.players.user.battlefield[0].id })).toBe(true);
  });
});

describe("⛔⭐ GUARD B — 'your opponents control no X' is UNIVERSAL, not existential", () => {
  it("true only when EVERY opponent is empty of the filter", () => {
    expect(ev(world({ user: {}, ai: { bf: [] }, ai2: { bf: [] } }), "your opponents control no creatures")).toBe(true);
    // ⭐ THE mutation target: one empty opponent and one with a creature. `.some()` would say TRUE here.
    expect(ev(world({ user: {}, ai: { bf: [] }, ai2: { bf: [CREA] } }), "your opponents control no creatures")).toBe(false);
    expect(ev(world({ user: { bf: [CREA] }, ai: { bf: [] } }), "your opponents control no creatures")).toBe(true); // MY creature is irrelevant
  });
});

describe("⛔⭐ GUARD C — the life compare is NOT the negation of its sibling (the TIE case)", () => {
  it("strictly more, per direction", () => {
    expect(ev(world({ user: { life: 40 }, ai: { life: 20 } }), "you have more life than an opponent")).toBe(true);
    expect(ev(world({ user: { life: 20 }, ai: { life: 40 } }), "you have more life than an opponent")).toBe(false);
  });
  it("⭐ ON A TIE BOTH PHRASES ARE FALSE — this is why neither may be implemented as !other", () => {
    const tied = world({ user: { life: 30 }, ai: { life: 30 } });
    expect(ev(tied, "you have more life than an opponent")).toBe(false);
    expect(ev(tied, "an opponent has more life than you")).toBe(false);
  });
  it("existential across seats — one opponent below you is enough", () => {
    expect(ev(world({ user: { life: 30 }, ai: { life: 40 }, ai2: { life: 10 } }), "you have more life than an opponent")).toBe(true);
  });
});

describe("⛔ 'you don't control a <filter>' is the synonym of 'you control no <filter>'", () => {
  it("both phrasings agree", () => {
    const empty = world({ user: { bf: [] } });
    const has = world({ user: { bf: [{ name: "F", type: "Artifact — Food" }] } });
    expect(ev(empty, "you don't control a food")).toBe(true);
    expect(ev(has, "you don't control a food")).toBe(false);
    expect(ev(has, "you control no foods")).toBe(false);
  });
});

describe("⛔ STILL REFUSED — needs tracking that does not exist", () => {
  it("mana-spent conditions park (no per-cast mana provenance is recorded)", () => {
    // 7 corpus cards ({R}/{U}/{G}/{B} was spent to cast it; mana from a Treasure was spent). Answering these
    // would require knowing WHICH mana paid for a spell, which nothing in the engine records. They park.
    for (const c of ["{r} was spent to cast it", "mana from a treasure was spent to cast it"]) {
      expect(activationConditionParseable(c), c).toBe(false);
    }
  });
});
