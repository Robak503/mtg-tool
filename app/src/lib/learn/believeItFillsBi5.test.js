/**
 * BELIEVE IT! FILLS — POD-SIM THREE · BI-5 (2026-09-05): Moon-Circuit Hacker + Satoru, the Infiltrator.
 *
 * Hacker — "…you may draw a card. If you do, discard a card unless this creature entered this turn." The unless-rider on the
 * optional draw-then-discard: a fresh ninja keeps its card (the pause carries the draw alone).
 * Satoru — "Whenever Satoru and/or one or more other nontoken creatures you control enter, if none of them were cast or no
 * mana was spent to cast them, draw a card." A self-or-other batched enter watcher deduped ONCE PER BATCH against the
 * unflushed pending triggers (no once-per-turn approximation — Satoru prints no rider); the predicate reads the entering
 * permanent's arrival stamps: not cast (ninjutsu / a put) or cast for no mana (`castForNoMana`, threaded from the
 * dispatcher's payment plan). The trigger splitter learned the plural "enter" as an event verb on the way.
 *
 * Mutation-checked: see the run ledger (docs-sk52).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const HACKER = { id: "hack", name: "Moon-Circuit Hacker", type: "Enchantment Creature — Human Ninja", mana: "{1}{U}", cmc: 2, colors: ["U"], power: 2, toughness: 1, oracle: "Ninjutsu {U}\nWhenever this creature deals combat damage to a player, you may draw a card. If you do, discard a card unless this creature entered this turn." };
const SATORU = { id: "sat", name: "Satoru, the Infiltrator", type: "Legendary Creature — Human Ninja Rogue", mana: "{U}{B}", cmc: 2, colors: ["U", "B"], power: 2, toughness: 2, oracle: "Menace\nWhenever Satoru and/or one or more other nontoken creatures you control enter, if none of them were cast or no mana was spent to cast them, draw a card." };
const HACKER_EFFECT = "You may draw a card. If you do, discard a card unless this creature entered this turn.";
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `L${i + 1}`, name: `L${i + 1}`, type: "Sorcery", cmc: 1 }));
const card = (id, name, extra = {}) => ({ id, name, type: "Creature — Ninja", mana: "{1}{U}", cmc: 2, colors: ["U"], power: 2, toughness: 2, oracle: "", ...extra });
const perm = (id, controller, c, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...c }, controller, summoningSick: false }), ...extra });
function state({ hand = [], userBf = [], userPool = {}, userLib = lib(8), turn = 4 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: userBf, library: userLib, manaPool: { ...s.players.user.manaPool, ...userPool } } },
  };
}
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const satoruPending = (s) => (s.pendingTriggers || []).filter((t) => t.descriptor?.oncePerBatch).length;

describe("parse + classify", () => {
  it("the Hacker's effect carries the unless-rider; Satoru's trigger is a self-or-other once-per-batch enter watcher with the arrival predicate; both native-trigger", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: HACKER_EFFECT });
    const d = detectTriggers(SATORU);
    const row = { hacker: p?.atoms?.map((a) => ({ op: a.op, unless: a.unlessSourceEnteredThisTurn })), satoru: d.map((x) => [x.event, x.scope, x.oncePerBatch, x.nontokenFilter, x.interveningIf]), tiers: [classifyCard({ ...HACKER, keywords: [] }), classifyCard({ ...SATORU, keywords: [] })] };
    console.log("  WITNESS bi5Parse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hacker).toEqual([{ op: "optional-draw-discard", unless: true }]);
    expect(row.satoru).toEqual([["etb", "selfOrOtherCreatureYouControl", true, true, "none of them were cast or no mana was spent to cast them"]]);
    expect(row.tiers).toEqual(["native-trigger", "native-trigger"]);
  });
});

describe("Moon-Circuit Hacker — the unless-rider", () => {
  it("a Hacker that entered THIS turn raises the draw alone; one that entered earlier raises draw-then-discard", () => {
    const program = parseEffectProgram({ type: "Instant", oracle: HACKER_EFFECT });
    const run = (enteredOnTurn) => {
      const s = state({ userBf: [perm("hk", "user", HACKER, { enteredOnTurn })], turn: 4 });
      return runEffectProgram(s, { id: "trg", kind: "triggered-ability", controller: "user", source: { name: "Moon-Circuit Hacker" }, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [], sourceId: "hk", cardName: "Moon-Circuit Hacker" } } });
    };
    const fresh = run(4); const old = run(2);
    const row = { freshOps: fresh.pendingChoice?.effectAtoms?.map((a) => a.op), oldOps: old.pendingChoice?.effectAtoms?.map((a) => a.op), kind: fresh.pendingChoice?.kind };
    console.log("  WITNESS hackerUnless", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.kind).toBe("optional-draw-discard");
    expect(row.freshOps).toEqual(["draw"]);
    expect(row.oldOps).toEqual(["draw", "discard"]);
  });
});

describe("Satoru — the arrival predicate, the self half, the nontoken filter, once per batch", () => {
  const satoru = () => perm("sat-p", "user", SATORU);

  it("a creature PUT onto the battlefield from hand (not cast — the ninjutsu shape) fires it: I draw a card; a creature CAST with mana does not", () => {
    const s = state({ hand: [card("n1", "Ninja One"), card("c1", "Cast One")], userBf: [satoru()], userPool: { U: 1, C: 1 } });
    const put = settle(enterCardFromZone(s, { playerId: "user", cardId: "n1", fromZone: "hand" }).state);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c1");
    const casted = settle(dispatchAction(s, cast));
    const row = { putHand: put.players.user.hand.length, putLib: put.players.user.library.length, castHand: casted.players.user.hand.length, castLib: casted.players.user.library.length, castStamp: !!casted.players.user.battlefield.find((p) => p.card?.name === "Cast One")?.wasCast };
    console.log("  WITNESS satoruPutVsCast", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.putHand).toBe(2);   // one card put, one drawn → 2 − 1 + 1
    expect(row.putLib).toBe(7);
    expect(row.castHand).toBe(1);  // one cast, nothing drawn
    expect(row.castLib).toBe(8);
    expect(row.castStamp).toBe(true);
  });

  it("a creature CAST FOR NO MANA (the discover free-cast lane, the engine's real free cast) is stamped castForNoMana and fires it", () => {
    const FREE = card("f1", "Free One");
    const s0 = state({ userBf: [satoru()] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, exile: [FREE] } }, pendingDiscover: { controller: "user", cardId: "f1", mv: 2 } };
    const free = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "f1" && a.freeCast);
    expect(free).toBeTruthy();
    const after = settle(dispatchAction(s, free));
    const entered = after.players.user.battlefield.find((p) => p.card?.name === "Free One");
    const row = { wasCast: !!entered?.wasCast, castForNoMana: !!entered?.castForNoMana, hand: after.players.user.hand.length, lib: after.players.user.library.length };
    console.log("  WITNESS satoruFreeCast", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.wasCast).toBe(true);
    expect(row.castForNoMana).toBe(true);
    expect(row.hand).toBe(1);
    expect(row.lib).toBe(7);
  });

  it("Satoru's OWN entry (put, not cast) fires it; a TOKEN entering never does", () => {
    const s = state({ hand: [{ ...SATORU }], userBf: [] });
    const self = settle(enterCardFromZone(s, { playerId: "user", cardId: "sat", fromZone: "hand" }).state);
    const withSat = state({ userBf: [satoru()] });
    const tok = checkEnterTriggers({ ...withSat, players: { ...withSat.players, user: { ...withSat.players.user, battlefield: [...withSat.players.user.battlefield, perm("tok", "user", { name: "Soldier", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true })] } } }, perm("tok", "user", { name: "Soldier", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true }));
    const row = { selfDrew: self.players.user.library.length === 7 && self.players.user.hand.length === 1, tokenPending: satoruPending(tok) };
    console.log("  WITNESS satoruSelfToken", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.selfDrew).toBe(true);
    expect(row.tokenPending).toBe(0);
  });

  it("ONCE PER BATCH: two nontoken creatures entering before a flush leave ONE pending Satoru trigger (one draw); a third after the flush is a new batch", () => {
    const base = state({ userBf: [satoru()] });
    const a = perm("a", "user", card("a", "A")); const b = perm("b", "user", card("b", "B")); const c3 = perm("c3", "user", card("c3", "C"));
    const withAB = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [...base.players.user.battlefield, a, b] } } };
    const twice = checkEnterTriggers(checkEnterTriggers(withAB, a), b);
    const flushed = settle(twice);
    const withC = { ...flushed, players: { ...flushed.players, user: { ...flushed.players.user, battlefield: [...flushed.players.user.battlefield, c3] } } };
    const third = settle(checkEnterTriggers(withC, c3));
    const row = { pendingAfterTwo: satoruPending(twice), drawnAfterTwo: 8 - flushed.players.user.library.length, drawnAfterThird: 8 - third.players.user.library.length };
    console.log("  WITNESS satoruBatch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pendingAfterTwo).toBe(1);
    expect(row.drawnAfterTwo).toBe(1);
    expect(row.drawnAfterThird).toBe(2);
  });

  it("the predicate reads the arrival stamps: unstamped (a put) → true; cast with mana → false; cast for no mana → true; no entering permanent → null (fail closed)", () => {
    const cond = "none of them were cast or no mana was spent to cast them";
    const mk = (extra) => state({ userBf: [satoru(), perm("x", "user", card("x", "X"), extra)] });
    const row = {
      put: evaluateInterveningIf(mk({}), cond, "user", { triggeringPermanentId: "x" }),
      castMana: evaluateInterveningIf(mk({ wasCast: true }), cond, "user", { triggeringPermanentId: "x" }),
      castFree: evaluateInterveningIf(mk({ wasCast: true, castForNoMana: true }), cond, "user", { triggeringPermanentId: "x" }),
      none: evaluateInterveningIf(mk({}), cond, "user", {}),
    };
    console.log("  WITNESS satoruPredicate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ put: true, castMana: false, castFree: true, none: null });
  });
});
