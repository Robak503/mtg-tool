/**
 * RAPHAEL, FIENDISH SAVIOR — "a creature card was put into your graveyard from anywhere this turn". SHELF-85 · Halfshell Q3, 2026-09-05.
 * "At the beginning of each end step, if a creature card was put into your graveyard from anywhere this turn, create a 1/1
 * red Devil creature token with 'When this token dies, it deals 1 damage to any target.'"
 *
 * The payoff already parsed; the end-step trigger parked on its intervening-if. It is a LOOK-BACK, not a graveyard read
 * (the card may have left the graveyard again), so gameState.moveCardToZone stamps a per-PLAYER turn mark on the
 * graveyard's owner at the one graveyard chokepoint — every path (dies, discard, mill) records it — for CARDS only (a token
 * is not a card, CR 111.1) whose type line carries Creature, and only when the card actually reached the graveyard (a
 * shuffle-instead replacement leaves no record). The reader compares the stamp to the live turn.
 *
 * Mutation-checked: see the run ledger (docs-sk100).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkStepTriggers, checkDiesTriggers } from "./triggers.js";
import { interveningIfParseable, evaluateInterveningIf } from "./interveningIf.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COND = "a creature card was put into your graveyard from anywhere this turn";
const RAPHAEL = { id: "c-rf", name: "Raphael, Fiendish Savior", type: "Legendary Creature — Devil Noble", mana: "{2}{B}{R}", power: "4", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nOther Demons, Devils, Imps, and Tieflings you control get +1/+1 and have lifelink.\nAt the beginning of each end step, if a creature card was put into your graveyard from anywhere this turn, create a 1/1 red Devil creature token with \"When this token dies, it deals 1 damage to any target.\"" };
const BEAR_CARD = { id: "c-bear", name: "Library Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const BOLT_CARD = { id: "c-bolt", name: "Library Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "" };

describe("parse + classify", () => {
  it("the end-step trigger carries the condition, the condition is readable, and Raphael flips native", () => {
    const t = detectTriggers(RAPHAEL).find((x) => x.event === "endStep");
    const row = { interveningIf: t?.interveningIf, parseable: interveningIfParseable(COND), tier: classifyCard(RAPHAEL) };
    console.log("  WITNESS raphael", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.interveningIf).toBe(COND);
    expect(row.parseable).toBe(true);
    expect(row.tier).toMatch(/^native/);
  });
});

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });
function base(extraBf = [], library = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const raphael = createPermanent({ id: "raph", card: RAPHAEL, controller: "user", summoningSick: false });
  return { ...s0, turn: 4, phase: "ending", step: "end", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [raphael, ...extraBf], library } } };
}
const devils = (s) => s.players.user.battlefield.filter((p) => /Devil/.test(String(p.card?.type || "")) && p.card?.token).length;
function endStep(s) {
  s = checkStepTriggers(s, "endStep");
  const pending = (s.pendingTriggers || []).filter((t) => t.descriptor?.event === "endStep").length;
  return { pending, out: resolveAll(flush(s)) };
}

describe("RUNTIME — the stamp at the graveyard chokepoint and the end-step read", () => {
  it("a creature card MILLED this turn stamps the owner; the end step then makes the Devil", () => {
    let s = base([], [BEAR_CARD]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "c-bear" });
    const { pending, out } = endStep(s);
    const row = { stamp: s.players.user.creatureCardToGraveyardTurn, cond: evaluateInterveningIf(s, COND, "user", {}), pending, devils: devils(out) };
    console.log("  WITNESS raphaelMill", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stamp: 4, cond: true, pending: 1, devils: 1 });
  });

  it("a creature card that DIED this turn (a real card, through the lethal pipeline) stamps too — and the record survives the card leaving the graveyard again", () => {
    const victim = { ...createPermanent({ id: "v", card: { ...BEAR_CARD, id: "c-v" }, controller: "user", summoningSick: false }), damageMarked: 9 };
    let s = base([victim]);
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId: "c-v" }); // the card leaves the graveyard again
    const { pending, out } = endStep(s);
    const row = { stamp: s.players.user.creatureCardToGraveyardTurn, gyEmpty: s.players.user.graveyard.length === 0, pending, devils: devils(out) };
    console.log("  WITNESS raphaelDied", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stamp: 4, gyEmpty: true, pending: 1, devils: 1 });
  });

  it("nothing stamps → the trigger never fires: an untouched board; a TOKEN creature dying (not a card, CR 111.1); an INSTANT milled; a stamp from an EARLIER turn", () => {
    const plain = endStep(base());
    const tokenPerm = { ...createPermanent({ id: "tok", card: { id: "c-tok", name: "Bear Token", type: "Creature — Bear", power: 1, toughness: 1, keywords: [], oracle: "", token: true }, controller: "user", summoningSick: false }), damageMarked: 9 };
    let st = base([tokenPerm]);
    const lethal = destroyLethalCreatures(st);
    st = checkDiesTriggers(lethal.state, lethal.dead);
    const token = endStep(st);
    let sb = base([], [BOLT_CARD]);
    sb = moveCardToZone(sb, { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "c-bolt" });
    const bolt = endStep(sb);
    let so = base([], [BEAR_CARD]);
    so = moveCardToZone(so, { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "c-bear" });
    so = { ...so, turn: so.turn + 1 }; // the stamp is from last turn
    const old = endStep(so);
    // The end-step trigger is QUEUED regardless (CR 603.4 — the intervening-if is checked when it would go on the stack
    // and again on resolution); the flush withholds it, so the outcome to pin is the Devil count, not the queue.
    const row = { plain: devils(plain.out), tokenStamp: st.players.user.creatureCardToGraveyardTurn ?? null, token: devils(token.out),
      boltStamp: sb.players.user.creatureCardToGraveyardTurn ?? null, bolt: devils(bolt.out), old: devils(old.out), stackLeft: old.out.stack.length };
    console.log("  WITNESS raphaelRefusals", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ plain: 0, tokenStamp: null, token: 0, boltStamp: null, bolt: 0, old: 0, stackLeft: 0 });
  });
});
