/**
 * INTI, SENESCHAL OF THE SUN — the second line · SHELF-85 · Otharri O10 (2026-09-05). "Whenever you discard one or more
 * cards, exile the top card of your library. You may play that card until your next end step." Two seams: the BATCHED
 * discard event (one firing per discard event however many cards, CR 603.2d — a once-per-batch descriptor, deduped
 * within a call and against the unflushed pending batch), and the NEXT-END-STEP play window (CR 500.2 / 118.10): on
 * the controller's own turn before the end step it is THIS turn's end step (the plain this-turn stamp), on any other
 * turn or during their own end step it is their NEXT turn's (the extended owner-turn stamp) — decided at resolution.
 * Inti's first line (the reflexive discard → counter + trample) was already native.
 *
 * Mutation-checked: see the run ledger (docs-sk61).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, checkDiscardTriggers } from "./triggers.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { matchImpulseExilePlay } from "./effects/templateMatchers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const INTI = { name: "Inti, Seneschal of the Sun", type: "Legendary Creature — Human Knight", mana: "{1}{R}", keywords: [], oracle: "Whenever you attack, you may discard a card. When you do, put a +1/+1 counter on target attacking creature. It gains trample until end of turn.\nWhenever you discard one or more cards, exile the top card of your library. You may play that card until your next end step." };
const LINE2 = { ...INTI, oracle: "Whenever you discard one or more cards, exile the top card of your library. You may play that card until your next end step." };
const inti = () => createPermanent({ id: "inti", card: { id: "c-inti", ...INTI, power: 2, toughness: 2 }, controller: "user", summoningSick: false });
function state({ activePlayer = "user", step = "main" } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer, priorityHolder: activePlayer, phase: step === "end" ? "ending" : "precombat-main", step,
    players: { ...b.players, user: { ...b.players.user, battlefield: [inti()], library: [{ id: "T1", name: "Top Card", type: "Sorcery", cmc: 1 }, { id: "T2", name: "Second", type: "Sorcery", cmc: 1 }] } } };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const intiPending = (s) => (s.pendingTriggers || []).filter((t) => (t.sourcePermanentId ?? t.context?.sourcePermanentId) === "inti").length;
const exiled = (s) => (s.players.user.exile || []).map((c) => ({ name: c.name, imp: !!c._impulse, turn: c._impulseTurn, ext: !!c._impulseExtended, owner: c._impulseOwner ?? null }));

describe("classify + parse", () => {
  it("the batched discard arm carries oncePerBatch; the matcher reads the next-end-step window; Inti classifies native-trigger", () => {
    const d = detectTriggers(LINE2).map((x) => [x.event, x.scope, x.oncePerBatch ?? false]);
    const m = matchImpulseExilePlay("Exile the top card of your library. You may play that card until your next end step.");
    const row = { d, m: m?.atom ?? null, tier: classifyCard(INTI) };
    console.log("  WITNESS intiParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toEqual([["discarded", "youDiscard", true]]);
    expect(row.m).toEqual({ op: "impulse-exile", targetType: null, extendedWindow: "nextEndStep" });
    expect(row.tier).toBe("native-trigger");
  });

  it("HASTE MAGIC (a SPELL printing of the window): the sentence splitter's two-sentence fold must admit \"until your next end step\", or the impulse pair parts and the spell parks — native-spell", () => {
    // A trigger's effect text reaches the impulse template whole; a spell's goes through the sentence splitter first. The
    // fold widening survived its mutant on Inti alone — this pin is what makes it load-bearing (Haste Magic flipped with it).
    const HASTE = { name: "Haste Magic", type: "Instant", mana: "{1}{R}", keywords: [], oracle: "Target creature gets +3/+1 and gains haste until end of turn. Exile the top card of your library. You may play it until your next end step." };
    const tier = classifyCard(HASTE);
    console.log("  WITNESS hasteMagic", JSON.stringify({ tier })); // vitest 4 needs --disable-console-intercept
    expect(tier).toBe("native-spell");
  });
});

describe("one firing per discard event", () => {
  it("a two-card discard fires Inti ONCE; a second single-card call while the first firing is still pending adds nothing", () => {
    const s0 = state();
    const twoAtOnce = checkDiscardTriggers(s0, "user", 2);
    const cardByCard = checkDiscardTriggers(checkDiscardTriggers(s0, "user", 1), "user", 1);
    const row = { twoAtOnce: intiPending(twoAtOnce), cardByCard: intiPending(cardByCard) };
    console.log("  WITNESS intiBatch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ twoAtOnce: 1, cardByCard: 1 });
  });
});

describe("the next-end-step window, decided at resolution", () => {
  it("on the controller's OWN turn (main phase): the top card is exiled with the plain this-turn stamp (this turn's end step is the next one)", () => {
    const s = settle(checkDiscardTriggers(state({ activePlayer: "user", step: "main" }), "user", 1));
    const row = { exiled: exiled(s), libraryLeft: s.players.user.library.length };
    console.log("  WITNESS intiOwnTurn", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.exiled).toEqual([{ name: "Top Card", imp: true, turn: s.turn, ext: false, owner: null }]);
    expect(row.libraryLeft).toBe(1);
  });
  it("on an OPPONENT's turn: the extended owner-turn stamp (the controller's next end step is on their next turn)", () => {
    const s = settle(checkDiscardTriggers(state({ activePlayer: "ai", step: "main" }), "user", 1));
    const row = { exiled: exiled(s) };
    console.log("  WITNESS intiOppTurn", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.exiled).toEqual([{ name: "Top Card", imp: true, turn: s.turn, ext: true, owner: "user" }]);
  });
  it("during the controller's OWN end step: also the extended stamp (this end step is not 'next')", () => {
    const s = settle(checkDiscardTriggers(state({ activePlayer: "user", step: "end" }), "user", 1));
    const row = { exiled: exiled(s) };
    console.log("  WITNESS intiOwnEndStep", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.exiled).toEqual([{ name: "Top Card", imp: true, turn: s.turn, ext: true, owner: "user" }]);
  });
});
