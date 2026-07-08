/**
 * stunSubsystem.test.js — the STUN mechanic (CR 122.1c).
 *
 * "Tap target creature [an opponent controls] and put a stun counter on it" (Gilded Scuttler, Grappling Kraken,
 * Rowdy Snowballers, …) / "tap up to N target creature and put a stun counter on it" (Splash Lasher). The stun
 * rider FOLDS onto the tap atom (splitClauses keeps the " and " compound whole; tapClauseParser adds
 * stunCounter:1), and untapAll ENFORCES the tap-lock: a tapped permanent with a stun counter skips its next
 * untap and REMOVES one stun counter instead (a self-clearing lock, one turn per counter). Flip-diff GAINED=11,
 * LOST=0 — this is the enforcement the codebase deliberately withheld until now ("a stun counter would look
 * native but do nothing").
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { createGameState, createPermanent, untapAll, untapPermanent, tapPermanent, addCounter, findPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const C = (name, oracle, type = "Creature — Human", mana = "{1}{U}") => ({ name, oracle, type, keywords: [], mana });

describe("STUN — parser", () => {
  it('"tap target creature an opponent controls and put a stun counter on it" → tap atom + stunCounter, opponent-restricted', () => {
    expect(parseEffectClause("tap target creature an opponent controls and put a stun counter on it").atoms[0])
      .toMatchObject({ op: "tap", targetType: "creature", stunCounter: 1, restrictions: [{ kind: "controller", who: "opponent" }] });
  });
  it('"tap up to one target creature and put a stun counter on it" → optional single target + stunCounter', () => {
    expect(parseEffectClause("tap up to one target creature and put a stun counter on it").atoms[0])
      .toMatchObject({ op: "tap", targetType: "creature", optionalTarget: true, stunCounter: 1 });
  });
  it("CREED guard: a bare tap (no stun rider) carries NO stunCounter", () => {
    expect(parseEffectClause("tap target creature an opponent controls").atoms[0].stunCounter).toBeUndefined();
  });
});

describe("STUN — untap-step enforcement (CR 122.1c)", () => {
  it("a tapped creature with a stun counter skips its next untap (removing one counter), then untaps normally", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const foe = createPermanent({ id: "foe", card: { id: "c-f", name: "Foe", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai", summoningSick: false });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [foe] } } };
    s = applyTapEffect(s, { op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], stunCounter: 1 }, { controller: "user", targets: [{ type: "creature", id: "foe" }] }, true);
    expect(findPermanent(s, "foe").permanent.tapped).toBe(true);
    expect(findPermanent(s, "foe").permanent.counters.stun).toBe(1);
    s = untapAll(s, { playerId: "ai" });                              // controller's untap #1
    expect(findPermanent(s, "foe").permanent.tapped).toBe(true);      // STILL tapped — the lock held
    expect(findPermanent(s, "foe").permanent.counters.stun).toBe(0);  // one stun counter removed
    s = untapAll(s, { playerId: "ai" });                              // untap #2
    expect(findPermanent(s, "foe").permanent.tapped).toBe(false);     // untaps normally now
  });

  it("the lock is enforced for EVERY untap event — untapPermanent (an 'untap target creature' effect) can't bypass it (CR 122.1c)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const foe = createPermanent({ id: "foe", card: { id: "c-f", name: "Foe", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai", summoningSick: false });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [foe] } } };
    s = tapPermanent(s, "foe");
    s = addCounter(s, { permanentId: "foe", type: "stun", amount: 1 });
    s = untapPermanent(s, "foe");                                      // an explicit untap effect
    expect(findPermanent(s, "foe").permanent.tapped).toBe(true);       // STILL tapped — the replacement fired
    expect(findPermanent(s, "foe").permanent.counters.stun).toBe(0);   // one stun counter removed instead
  });

  it("untapPermanent on a NON-stunned tapped creature untaps normally (regression)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const p = createPermanent({ id: "p", card: { id: "c-p", name: "P", type: "Creature — Bear", power: 1, toughness: 1 }, controller: "ai", summoningSick: false });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [p] } } };
    s = tapPermanent(s, "p");
    expect(findPermanent(untapPermanent(s, "p"), "p").permanent.tapped).toBe(false);
  });
});

describe("STUN — classify", () => {
  it("Gilded Scuttler / Rowdy Snowballers classify native", () => {
    expect(classifyCard(C("Rowdy Snowballers", "When this creature enters, tap target creature an opponent controls and put a stun counter on it.", "Creature — Yeti", "{4}{R}"))).toBe("native-trigger");
    expect(classifyCard(C("Gilded Scuttler", "This creature can't be blocked.\nWhen this creature enters, tap target creature an opponent controls and put a stun counter on it.", "Creature — Insect", "{3}{U}"))).toBe("native-trigger");
  });
});
