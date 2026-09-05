/**
 * TITHE — SHELF-85 · Otharri O8 (2026-09-05). "Search your library for a Plains card. If target opponent controls more
 * lands than you, you may search your library for an additional Plains card. Reveal those cards, put them into your
 * hand, then shuffle." The splitter folds the three sentences into one clause; the tutor arm emits ONE atom — a hand
 * fetch of the printed filter with a TARGETED-OPPONENT compare rider — and applyTutor reads the chosen opponent's land
 * tally against the controller's at resolution (CR 608.2), adding the extra pick when strictly greater. The "you may"
 * is the chain's own find-optionality (a filtered search may fail to find, CR 701.19b): the second pick can be declined.
 *
 * Mutation-checked: see the run ledger (docs-sk59).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TITHE = { name: "Tithe", type: "Instant", mana: "{W}", keywords: [], oracle: "Search your library for a Plains card. If target opponent controls more lands than you, you may search your library for an additional Plains card. Reveal those cards, put them into your hand, then shuffle." };
const land = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller });
function setup(userLands, aiLands) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players,
      user: { ...b.players.user, hand: [{ ...TITHE, id: "t1" }], library: [{ id: "P1", name: "Plains", type: "Basic Land — Plains", oracle: "" }, { id: "I1", name: "Island", type: "Basic Land — Island", oracle: "" }, { id: "P2", name: "Plains", type: "Basic Land — Plains", oracle: "" }], battlefield: Array.from({ length: userLands }, (_, i) => land(`ul${i}`, "user")), manaPool: { ...b.players.user.manaPool, W: 1 } },
      ai: { ...b.players.ai, battlefield: Array.from({ length: aiLands }, (_, i) => land(`al${i}`, "ai")) } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && !s.pendingChoice && g++ < 30) s = resolveTopOfStack(s); return s; }
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "t1");
const handNames = (s) => s.players.user.hand.map((c) => c.name).sort();
const pc = (s) => (s.pendingChoice ? { kind: s.pendingChoice.kind, remaining: s.pendingChoice.remaining, mayFail: s.pendingChoice.mayFailToFind, cands: (s.pendingChoice.candidates || []).map((c) => c.name).sort() } : null);

describe("classify + parse", () => {
  it("ONE tutor atom: a Plains hand fetch, targeted at an opponent, with the lands-compare rider; enemy-side intent; native-spell", () => {
    const prog = parseEffectProgram(TITHE);
    const a = prog.atoms[0];
    const row = { confidence: prog.confidence, n: prog.atoms.length, atom: [a.op, a.targetType, a.destination, a.remaining, a.extraIfTargetControlsMore, a.filter], intent: atomTargetIntent(a), tier: classifyCard(TITHE) };
    console.log("  WITNESS titheParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.n).toBe(1);
    expect(row.atom).toEqual(["tutor", "opponent", "hand", 1, { metric: "lands", count: 1 }, { groups: [["plains"]] }]);
    expect(row.intent).toBe("enemy");
    expect(row.tier).toBe("native-spell");
  });
});

describe("resolution — the targeted compare decides the second pick", () => {
  it("opponent AHEAD on lands (2 vs 1): the cast is offered ONLY at the opponent; the search suspends with remaining 2; both Plains reach the hand through the chain", () => {
    let s = setup(1, 2);
    const cs = casts(s);
    const row = { offeredAt: cs.map((a) => (a.targets || []).map((t) => `${t.type}:${t.id}`).join("+")) };
    s = drain(dispatchAction(s, cs[0]));
    row.first = pc(s);
    s = resolveTutorChoice(s, "P1");
    row.second = pc(s);
    s = drain(resolveTutorChoice(s, "P2"));
    row.hand = handNames(s); row.libraryLeft = s.players.user.library.length; row.pendingAfter = pc(s);
    console.log("  WITNESS titheAhead", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offeredAt).toEqual(["player:ai"]);
    expect(row.first).toEqual({ kind: "tutor-search", remaining: 2, mayFail: true, cands: ["Plains", "Plains"] });
    expect(row.second).toEqual({ kind: "tutor-search", remaining: 1, mayFail: true, cands: ["Plains"] });
    expect(row.hand).toEqual(["Plains", "Plains"]);
    expect(row.libraryLeft).toBe(1);
    expect(row.pendingAfter).toBe(null);
  });

  it("opponent AHEAD but the searcher DECLINES the second pick (the printed 'you may'): one Plains, the chain ends", () => {
    let s = setup(1, 2);
    s = drain(dispatchAction(s, casts(s)[0]));
    s = resolveTutorChoice(s, "P1");
    s = drain(resolveTutorChoice(s, null));
    const row = { hand: handNames(s), pending: pc(s), libraryLeft: s.players.user.library.length };
    console.log("  WITNESS titheDecline", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hand).toEqual(["Plains"]);
    expect(row.pending).toBe(null);
    expect(row.libraryLeft).toBe(2);
  });

  it("opponent EQUAL on lands (2 vs 2) — strictly-greater is the printed test: a single pick, no chain", () => {
    let s = setup(2, 2);
    s = drain(dispatchAction(s, casts(s)[0]));
    const first = pc(s);
    s = drain(resolveTutorChoice(s, "P1"));
    const row = { first, hand: handNames(s), pending: pc(s) };
    console.log("  WITNESS titheEqual", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.first).toEqual({ kind: "tutor-search", remaining: 1, mayFail: true, cands: ["Plains", "Plains"] });
    expect(row.hand).toEqual(["Plains"]);
    expect(row.pending).toBe(null);
  });
});
