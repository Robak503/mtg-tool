/**
 * ingeniousProdigy.test.js — "you may remove a counter from it. If you do, <payoff>" (shelf decks D19, 2026-09-30: Believe it!).
 * Ingenious Prodigy: "At the beginning of your upkeep, if this creature has one or more +1/+1 counters on it, you may remove a
 * +1/+1 counter from it. If you do, draw a card."
 *
 *   • the intervening-if (CR 603.4) reads the SOURCE's live count of a P/T counter — "+1/+1" / "-1/-1" are the map keys;
 *   • the removal is a new cost kind on the optional-payment lane: the same pause, the same "the payoff runs only if paid"
 *     settle, the AI's pay-if-able default, and a panel label that names the counter. All the counters come off the source,
 *     or none do and nothing is paid off — the settle and the auto-pick read one predicate.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { autoPickOptionalManaPayment, resolveOptionalManaPaymentChoice, runEffectProgram } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PRODIGY = { name: "Ingenious Prodigy", type: "Creature — Human Wizard", mana: "{X}{U}", power: "0", toughness: "1", keywords: ["Skulk"],
  oracle: "Skulk (This creature can't be blocked by creatures with greater power.)\nThis creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, if this creature has one or more +1/+1 counters on it, you may remove a +1/+1 counter from it. If you do, draw a card." };
const NAZAR = { name: "Nazar, the Velvet Fang", type: "Legendary Creature — Vampire Warlock", mana: "{3}{B}", power: "3", toughness: "3", keywords: ["Menace"],
  oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever you gain life, put a feeding counter on Nazar.\nWhenever Nazar attacks, you may remove three feeding counters from it. If you do, you draw three cards and you lose 3 life." };
const MAGMASAUR_LINE = "you may remove a +1/+1 counter from this creature. If you don't, sacrifice this creature and it deals damage equal to the number of +1/+1 counters on it to each creature without flying and each player";
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };

function board(counters, { id = "prodigy", card = PRODIGY } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const src = { ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false }), counters };
  const library = [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [src], library, hand: [] } } };
}
function fireUpkeep(state) {
  let s = checkStepTriggers(state, "upkeep");
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (s.stack?.length && !s.pendingChoice && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}
const counters = (s, id = "prodigy") => findPermanent(s, id)?.permanent.counters || {};
/** Nazar's own payment atom (its real text through the trigger parser), run against Nazar as the source. */
function nazarPause(feeding) {
  const clause = detectTriggers(NAZAR).find((d) => /remove three feeding/.test(d.effectClause)).effectClause;
  const program = parseEffectClause(clause, "Instant", { sourceScoped: true });
  const s = board({ feeding }, { id: "nazar", card: NAZAR });
  return runEffectProgram(s, { source: { name: NAZAR.name }, payload: { params: { program, controller: "user", targets: [], sourceId: "nazar", context: {} } } });
}

describe("the card", () => {
  it("parses to the upkeep trigger with the counter condition and a remove-a-counter payment, and reads native", () => {
    const d = detectTriggers(PRODIGY).find((t) => t.event === "upkeep");
    const p = parseEffectClause(d.effectClause, "Instant", { sourceScoped: true });
    expect({ condition: d.interveningIf, conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(PRODIGY) }).toEqual({
      condition: "this creature has one or more +1/+1 counters on it",
      conf: "high",
      atoms: [{ op: "optional-mana-payment", cost: { kind: "remove-counter", counterType: "+1/+1", count: 1 }, effectAtoms: [{ op: "draw", amount: 1, targetType: null }], targetType: null }],
      tier: "native-trigger",
    });
  });
  it("stays out where the shape isn't this one: a time counter (its own subsystem), \"If you don't\", another creature's counters", () => {
    const conf = (t) => programConfidence(parseEffectClause(t, "Instant", { sourceScoped: true }));
    expect({
      time: conf("you may remove a time counter from it. If you do, draw a card"),
      magmasaur: conf(MAGMASAUR_LINE),
      dyadrine: conf("you may remove a +1/+1 counter from each of two creatures you control. If you do, draw a card and create a 2/2 colorless Robot artifact creature token"),
    }).toEqual({ time: "low", magmasaur: "low", dyadrine: "low" });
  });
});

describe("⭐ in play", () => {
  it("⭐ pays: a +1/+1 counter comes off and a card is drawn", () => {
    const s = fireUpkeep(board({ "+1/+1": 2 }));
    const paused = { kind: s.pendingChoice?.kind, cost: s.pendingChoice?.cost };
    const after = resolveOptionalManaPaymentChoice(s, true);
    const row = { paused, counters: counters(after)["+1/+1"], hand: after.players.user.hand.length };
    console.log(`WITNESS prodigyPays ${JSON.stringify(row)}`);
    expect(row).toEqual({ paused: { kind: "optional-mana-payment", cost: { kind: "remove-counter", counterType: "+1/+1", count: 1 } }, counters: 1, hand: 1 });
  });
  it("declines: the counter stays and nothing is drawn", () => {
    const after = resolveOptionalManaPaymentChoice(fireUpkeep(board({ "+1/+1": 2 })), false);
    expect({ counters: counters(after)["+1/+1"], hand: after.players.user.hand.length }).toEqual({ counters: 2, hand: 0 });
  });
  it("with no +1/+1 counter the trigger doesn't fire at all (the intervening if, CR 603.4) — a -1/-1 counter isn't one", () => {
    const none = fireUpkeep(board({}));
    const minus = fireUpkeep(board({ "-1/-1": 1 }));
    expect({ none: [none.pendingChoice?.kind ?? null, none.players.user.hand.length], minus: [minus.pendingChoice?.kind ?? null, minus.players.user.hand.length] })
      .toEqual({ none: [null, 0], minus: [null, 0] });
  });
  it("the reader takes both P/T spellings off the source", () => {
    const read = (cs, cond) => evaluateInterveningIf(board(cs), cond, "user", { sourcePermanentId: "prodigy" });
    expect({
      plus: read({ "+1/+1": 1 }, "this creature has one or more +1/+1 counters on it"),
      minus: read({ "-1/-1": 2 }, "this creature has two or more -1/-1 counters on it"),
      minusShort: read({ "-1/-1": 1 }, "this creature has two or more -1/-1 counters on it"),
    }).toEqual({ plus: true, minus: true, minusShort: false });
  });
  it("⭐ all or nothing, and the AI's pick agrees with the settle: Nazar with two feeding counters can't remove three", () => {
    const short = nazarPause(2);
    const shortPick = autoPickOptionalManaPayment(short, short.pendingChoice);
    const shortAfter = resolveOptionalManaPaymentChoice(short, true);
    const full = nazarPause(3);
    const fullPick = autoPickOptionalManaPayment(full, full.pendingChoice);
    const fullAfter = resolveOptionalManaPaymentChoice(full, true);
    const row = {
      short: { pick: shortPick, feeding: counters(shortAfter, "nazar").feeding, hand: shortAfter.players.user.hand.length, life: shortAfter.players.user.life },
      full: { pick: fullPick, feeding: counters(fullAfter, "nazar").feeding ?? 0, hand: fullAfter.players.user.hand.length, life: fullAfter.players.user.life },
    };
    console.log(`WITNESS nazarAllOrNothing ${JSON.stringify(row)}`);
    expect(row).toEqual({ short: { pick: false, feeding: 2, hand: 0, life: 40 }, full: { pick: true, feeding: 0, hand: 3, life: 37 } });
  });
  it("a source gone by the settle pays nothing — the counters left with it", () => {
    const s = fireUpkeep(board({ "+1/+1": 2 }));
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    const after = resolveOptionalManaPaymentChoice(gone, true);
    expect({ pick: autoPickOptionalManaPayment(gone, gone.pendingChoice), hand: after.players.user.hand.length }).toEqual({ pick: false, hand: 0 });
  });
});
