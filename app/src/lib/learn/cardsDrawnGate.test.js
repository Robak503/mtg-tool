/**
 * cardsDrawnGate.test.js — "As long as you've DRAWN TWO OR MORE CARDS this turn, …" (Trench Stalker,
 * Spinehorn Minotaur, Eyekite, Tome Anima, Gnarled Sage, Foggy Swamp Hunters, Messenger Hawk, Evangel of
 * Synthesis, June the Bounty Hunter). Ten carriers, none native before.
 *
 * ⚠️ THIS SLICE EXISTS BECAUSE A COMMENT WAS WRONG, and that is the part worth remembering. The gate
 * parser carried an explicit note: *"you've drawn N or more cards this turn" has NO ledger → stays unparsed
 * (FN-safe)*. It reads like a settled engineering decision, so nothing revisited it. But
 * `cardsDrawnThisTurn` is a real per-seat counter — incremented at gameState's single draw chokepoint and
 * reset for EVERY seat at untap (deliberately all seats, because instants let a player draw on someone
 * else's turn). The refusal had simply stopped being true, and ten cards sat behind it.
 * **A stale "we can't do this" note is more expensive than no note at all** — it converts a gap into a
 * decision nobody re-examines. When a census turns up a big zero-native cluster, check whether the refusal
 * still holds before believing it.
 *
 * ⭐ Otherwise pure ignition: the gate is the exact sibling of the `spellsCastThisTurnAtLeast` read sitting
 * directly above it in gateMet, on a ledger that already existed, granting keywords already grantable.
 * One arm in the parser, one in gateMet.
 *
 * ⓘ Two of the nine gained rows (June, Tome Anima) reach native by COMPOSING this new gate with the
 * "can't be blocked" combat rider from an earlier slice — the vocabulary additions multiply rather than add.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the gateMet
 * arm forced false -> the keywords never switch on however many cards are drawn; the parser arm removed ->
 * the carriers park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, drawCards, resetTurnCounters } from "./gameState.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TRENCH_STALKER = { id: "c-ts", name: "Trench Stalker", type: "Creature — Fish Warrior", mana: "{4}{B}",
  power: "4", toughness: "5",
  oracle: "As long as you've drawn two or more cards this turn, this creature has deathtouch and lifelink." };
const EYEKITE = { id: "c-ek", name: "Eyekite", type: "Creature — Bird", mana: "{2}{U}", power: "1", toughness: "2",
  oracle: "Flying\nThis creature gets +2/+0 as long as you've drawn two or more cards this turn." };

const deck = (n) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, name: `Card ${i}`, type: "Instant", oracle: "" }));

describe("the gate parses and the carriers flip", () => {
  it("⭐ both keywords carry the drawn-this-turn gate", () => {
    // ⓘ Canonical CASE ("Deathtouch", not "deathtouch") — canonicalKeyword normalises grants, while the
    // pseudo-keywords (cantBlock, mustAttack, goaded) stay camelCase. Asserting the literal the parser
    // actually emits is the point; a case-insensitive compare here would weaken the pin for no benefit.
    expect((parseStaticAbilities(TRENCH_STALKER) || []).map((e) => `${e.op?.keyword}|${e.op?.gate?.kind}|${e.op?.gate?.atLeast}`))
      .toEqual(["Deathtouch|cardsDrawnThisTurnAtLeast|2", "Lifelink|cardsDrawnThisTurnAtLeast|2"]);
    expect(classifyCard(TRENCH_STALKER)).toBe("native-static");
    expect(classifyCard(EYEKITE)).toBe("native-static");
  });
});

describe("⭐ LAW 6 — driven through real draws, and across the turn reset", () => {
  function board(card) {
    const perm = createPermanent({ id: "sub", card, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, turn: 3,
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm], library: deck(10), hand: [], cardsDrawnThisTurn: 0 } } };
  }
  const read = (s) => ({
    drawn: s.players.user.cardsDrawnThisTurn,
    power: permanentPower(s, "sub"),
    deathtouch: permanentHasKeyword(s, "sub", "deathtouch"),
    lifelink: permanentHasKeyword(s, "sub", "lifelink"),
  });

  it("⭐ ONE draw is not enough; the SECOND switches both keywords on", () => {
    let s = board(TRENCH_STALKER);
    const rows = [read(s)];
    s = drawCards(s, { playerId: "user", count: 1 });
    rows.push(read(s));
    s = drawCards(s, { playerId: "user", count: 1 });
    rows.push(read(s));
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { drawn: 0, power: 4, deathtouch: false, lifelink: false },
      // ⛔ THE ROW THAT MAKES THE THRESHOLD REAL. Without it, "two or more" would be indistinguishable from
      // "one or more" — the count would be untested and any atLeast value would pass.
      { drawn: 1, power: 4, deathtouch: false, lifelink: false },
      { drawn: 2, power: 4, deathtouch: true, lifelink: true },
    ]);
  });

  it("⛔ the buff EXPIRES at the turn reset — it is a per-turn ledger, not a latch", () => {
    let s = board(EYEKITE);
    s = drawCards(s, { playerId: "user", count: 2 });
    const during = { drawn: s.players.user.cardsDrawnThisTurn, power: permanentPower(s, "sub") };
    // The same reset the engine runs at untap, which clears EVERY seat (instants let a player draw on
    // someone else's turn, so a per-active-player reset would leave a stale count behind).
    s = resetTurnCounters(s, { playerId: "user" });
    const after = { drawn: s.players.user.cardsDrawnThisTurn, power: permanentPower(s, "sub") };
    console.log("  WITNESS", JSON.stringify({ during, after }));
    expect(during).toEqual({ drawn: 2, power: 3 });   // 1 base + 2
    expect(after).toEqual({ drawn: 0, power: 1 });    // back to printed
  });
});
