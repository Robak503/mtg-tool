/**
 * TRIG-DRAW2-OPP (CR 121) — Faerie Mastermind: "Whenever an opponent draws their second card each turn, you
 * draw a card." Extends the drawSecond hook (checkCardDrawnTriggers, cardsDrawnThisTurn counter) to the
 * OPPONENT-scoped form: whose:"opponent" scans EVERY player's watchers and fires ONE draw for the watcher's
 * controller when the DRAWING player is an opponent of that controller (mirrors checkMilledTriggers' opponent
 * gate). The whole card is now native-mixed — Flash + Flying (keywords), the opponent-drawSecond trigger, and
 * the "{3}{U}: Each player draws a card." activated ability are all modeled.
 *
 * CREED near-misses proven below: the trigger fires on the OPPONENT's 2nd draw ONLY (not the 1st/3rd, not the
 * OWN 2nd draw), the payoff draws for the FAERIE's controller (not the drawer), and an own-scoped Faerie does
 * NOT fire off the owner's own draws.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { applyDrawEffect } from "./spellEffects.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, resetCardsDrawnAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FAERIE_ORACLE = "Flash\nFlying\nWhenever an opponent draws their second card each turn, you draw a card.\n{3}{U}: Each player draws a card.";
const faerie = () => ({ id: "card-faerie", name: "Faerie Mastermind", type: "Creature — Faerie Rogue", mana: "{1}{U}", power: "2", toughness: "1", oracle: FAERIE_ORACLE });

function board({ user = [], ai = [], userLib = [], aiLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, library: userLib },
      ai: { ...s.players.ai, battlefield: ai, library: aiLib },
    },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: "Card", type: "Instant", oracle: "" }));
const userHand = (s) => s.players.user.hand.length;

describe("TRIG-DRAW2-OPP — detection (classifyCondition)", () => {
  it("detects 'an opponent draws their second card each turn' as a whose:opponent drawSecond event", () => {
    const t = detectTriggers(faerie());
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("drawSecond");
    expect(t[0].whose).toBe("opponent");
    expect(t[0].effectClause).toBe("you draw a card");
  });

  it("the WHOLE card flips to a native tier (keywords + opponent-drawSecond trigger + activated ability)", () => {
    expect(classifyCard(faerie())).toBe("native-mixed");
  });

  it("CREED (condition anchor): a different ordinal / 'a card' variant is UNDETECTED (→ Arbiter, no partial)", () => {
    const first = { id: "f", name: "F", type: "Creature", oracle: "Whenever an opponent draws their first card each turn, you draw a card." };
    expect(detectTriggers(first).some(t => t.event === "drawSecond")).toBe(false);
    const anyCard = { id: "a", name: "A", type: "Creature", oracle: "Whenever an opponent draws a card, you draw a card." };
    expect(detectTriggers(anyCard).some(t => t.event === "drawSecond")).toBe(false);
  });

  it("CREED (effect gate): the drawSecond IS detected but an UNMODELED effect keeps the card body-only (no partial flip)", () => {
    // "that player loses the game" is outside the effect vocabulary → routes LOW → the WHOLE card parks on the
    // Arbiter. The condition matched (drawSecond detected), but the card must NOT flip native — CREED: model the
    // whole card or leave it parked; never fire the trigger with a dropped/mis-applied effect.
    const badEffect = { name: "B", type: "Creature — Faerie", mana: "{1}{U}", power: "1", toughness: "1",
      oracle: "Flying\nWhenever an opponent draws their second card each turn, that player loses the game." };
    expect(detectTriggers(badEffect).some(t => t.event === "drawSecond")).toBe(true); // condition matched
    expect(classifyCard(badEffect)).toBe("body-only");                                // but the card stays parked
  });

  it("the OWN 'you draw your second card' form stays whose:any (unchanged by this slice)", () => {
    const own = { id: "o", name: "O", type: "Creature", oracle: "Whenever you draw your second card each turn, you draw a card." };
    const t = detectTriggers(own);
    expect(t[0].event).toBe("drawSecond");
    expect(t[0].whose).toBe("any");
  });
});

describe("TRIG-DRAW2-OPP — checkCardDrawnTriggers opponent gate", () => {
  it("FIRES for the Faerie's controller when an OPPONENT crosses their 2nd draw", () => {
    let s = board({ user: [createPermanent({ id: "fm", card: faerie(), controller: "user", summoningSick: false })] });
    // ai draws twice → 2nd draw crosses → Faerie (user's) fires once
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, cardsDrawnThisTurn: 2 } } };
    const out = checkCardDrawnTriggers(s, "ai", 2);
    expect(out.pendingTriggers || []).toHaveLength(1);
    expect(out.pendingTriggers[0].controller).toBe("user"); // "you" = the Faerie's owner, NOT the drawer
    expect(out.pendingTriggers[0].event).toBe("drawSecond");
  });

  it("does NOT fire on the OPPONENT's 1st or 3rd draw (drawSecond crosses ONLY the 2nd)", () => {
    let s = board({ user: [createPermanent({ id: "fm", card: faerie(), controller: "user", summoningSick: false })] });
    // 1st draw
    let after = { ...s, players: { ...s.players, ai: { ...s.players.ai, cardsDrawnThisTurn: 1 } } };
    expect(checkCardDrawnTriggers(after, "ai", 1).pendingTriggers || []).toHaveLength(0);
    // 3rd draw (already at 2 before)
    after = { ...s, players: { ...s.players, ai: { ...s.players.ai, cardsDrawnThisTurn: 3 } } };
    expect(checkCardDrawnTriggers(after, "ai", 1).pendingTriggers || []).toHaveLength(0);
  });

  it("CREED: does NOT fire off the CONTROLLER's OWN 2nd draw (whose:opponent — the drawer must be an opponent)", () => {
    let s = board({ user: [createPermanent({ id: "fm", card: faerie(), controller: "user", summoningSick: false })] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, cardsDrawnThisTurn: 2 } } };
    // user (the Faerie's OWN controller) draws their 2nd card — the opponent-scoped trigger must stay silent
    expect(checkCardDrawnTriggers(s, "user", 2).pendingTriggers || []).toHaveLength(0);
  });
});

describe("TRIG-DRAW2-OPP — end-to-end runtime (the resolver actually PLAYS the card)", () => {
  it("opponent draws 2 → Faerie's owner draws exactly 1 card", () => {
    let s = board({
      user: [createPermanent({ id: "fm", card: faerie(), controller: "user", summoningSick: false })],
      userLib: lib(4), aiLib: lib(4),
    });
    expect(userHand(s)).toBe(0);
    s = applyDrawEffect(s, { controller: "ai", amount: 2 }); // opponent draws their 2nd card
    s = resolveAll(flushTriggers(s));
    expect(s.players.ai.hand).toHaveLength(2); // the opponent drew 2
    expect(userHand(s)).toBe(1);               // the Faerie's owner drew exactly 1 (the payoff)
  });

  it("resets each turn — fires AGAIN on the opponent's 2nd draw next turn", () => {
    let s = board({
      user: [createPermanent({ id: "fm", card: faerie(), controller: "user", summoningSick: false })],
      userLib: lib(6), aiLib: lib(6),
    });
    s = resolveAll(flushTriggers(applyDrawEffect(s, { controller: "ai", amount: 2 })));
    expect(userHand(s)).toBe(1);
    s = resetCardsDrawnAllPlayers(s);   // new turn (untap reset)
    s = resolveAll(flushTriggers(applyDrawEffect(s, { controller: "ai", amount: 1 }))); // 1st draw → no fire
    expect(userHand(s)).toBe(1);
    s = resolveAll(flushTriggers(applyDrawEffect(s, { controller: "ai", amount: 1 }))); // 2nd draw → fires
    expect(userHand(s)).toBe(2);
  });
});
