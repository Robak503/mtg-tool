/**
 * WAN SHI TONG, LIBRARIAN — POD-SIM THREE · KN-5b (2026-09-05).
 *
 * "When Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down."
 * "Whenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card."
 *
 * Three seams: the cast lane enumerates X for an ETB that READS X (not only an enters-with-X body); "put X counters" and
 * "draw half X, rounded down" read the context's X through the shared scaled-amount reader; and a LIBRARY-SEARCH event
 * emitted by the two tutor sites only (the no-pause path and the tutor-pause settle) — never by the shuffle chokepoint.
 *
 * Mutation-checked: see the run ledger (docs-sk48).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const WST_TEXT = "When Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down.\nWhenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card.";
const WST = { id: "wst", name: "Wan Shi Tong, Librarian", type: "Legendary Creature — Bird Spirit", mana: "{X}{U}{U}", cmc: 2, colors: ["U"], power: 1, toughness: 1, oracle: WST_TEXT };
const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`, type: "Sorcery", cmc: 1 }));
const basic = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", cmc: 0, oracle: "" });
function state({ userHand = [], userBf = [], userPool = {}, userLib = [], aiLib = [], stack = [], active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: "user", consecutivePasses: 0, stack,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, battlefield: userBf, library: userLib, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, library: aiLib },
    },
  };
}
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const wstOnField = (s) => s.players.user.battlefield.find((p) => p.card?.name === "Wan Shi Tong, Librarian");
const tutorSpell = (controller, filterText = "a basic land card") => ({
  id: `tut-${controller}`, kind: "spell", controller, targets: [], cost: null, source: { id: `card-tut-${controller}`, name: "Tutor", type: "Sorcery", cmc: 2, colors: ["G"], oracle: "" },
  payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectProgram({ type: "Sorcery", oracle: `Search your library for ${filterText}, reveal it, put it into your hand, then shuffle.` }), controller, targets: [] } },
});

describe("parse + classify", () => {
  it("the ETB reads X twice (counters, then half-X draw rounded down); the search trigger is a bare opponent form; native-trigger", () => {
    const etb = parseEffectClause("Put X +1/+1 counters on this creature. Then draw half X cards, rounded down.", "Instant", { hasX: true });
    const row = { confidence: etb?.confidence, atoms: etb?.atoms, tier: classifyCard({ ...WST, keywords: [] }) };
    console.log("  WITNESS wstParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amountX: true, target: "self" }, { op: "draw", amountX: true, halve: "floor", targetType: null }]);
    expect(row.tier).toBe("native-trigger");
  });
});

describe("the X ETB — cast for X, counters and a half-X draw", () => {
  it("with two blue and five colourless the cast offers X = 0..5; X = 3 enters as a 4/4 (three counters) and draws ONE (floor 3/2); X = 4 draws two", () => {
    const s = state({ userHand: [WST], userPool: { U: 2, C: 5 }, userLib: lib("c", 6) });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "wst");
    const xs = casts.map((a) => a.xValue).sort((a, b) => a - b);
    const run = (x) => settle(dispatchAction(s, casts.find((a) => a.xValue === x)));
    const three = run(3);
    const w3 = wstOnField(three);
    const four = run(4);
    const row = { xs, counters3: w3?.counters?.["+1/+1"] || 0, handAfter3: three.players.user.hand.length, libAfter3: three.players.user.library.length, counters4: wstOnField(four)?.counters?.["+1/+1"] || 0, handAfter4: four.players.user.hand.length };
    console.log("  WITNESS wstX", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.xs).toEqual([1, 2, 3, 4, 5]); // X = 0 is never offered (the engine's X lane starts at one — a pointless cast, not an FP)
    expect(row.counters3).toBe(3);
    expect(row.handAfter3).toBe(1);
    expect(row.libAfter3).toBe(5);
    expect(row.counters4).toBe(4);
    expect(row.handAfter4).toBe(2);
  });
});

describe("the search trigger — an OPPONENT's search only, from both tutor sites", () => {
  const wstPerm = () => createPermanent({ id: "wst-p", card: { id: "c-wst", ...WST }, controller: "user", summoningSick: false });

  it("the opponent's tutor (a pause, then the settle) fires it: +1 counter and I draw a card; the searcher's own board is untouched", () => {
    const s = state({ userBf: [wstPerm()], userLib: lib("c", 3), aiLib: [basic("f1"), basic("f2")], stack: [tutorSpell("ai")], active: "ai" });
    const paused = settle(s);
    expect(paused.pendingChoice?.kind).toBe("tutor-search");
    const after = settle(resolveTutorChoice(paused, "f1"));
    const row = { counters: wstOnField(after)?.counters?.["+1/+1"] || 0, myHand: after.players.user.hand.length, aiHand: after.players.ai.hand.map((c) => c.name), pause: after.pendingChoice?.kind || null };
    console.log("  WITNESS wstSearch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.counters).toBe(1);
    expect(row.myHand).toBe(1);
    expect(row.aiHand).toEqual(["Forest"]);
    expect(row.pause).toBe(null);
  });

  it("a FRUITLESS opponent search (nothing to find — the pause is declined) is still a search — it fires", () => {
    const s = state({ userBf: [wstPerm()], userLib: lib("c", 3), aiLib: lib("z", 2), stack: [tutorSpell("ai")], active: "ai" });
    const paused = settle(s);
    expect(paused.pendingChoice?.kind).toBe("tutor-search");
    expect(paused.pendingChoice.candidates).toHaveLength(0);
    const after = settle(resolveTutorChoice(paused, null));
    expect(after.players.ai.hand).toHaveLength(0);
    expect(wstOnField(after)?.counters?.["+1/+1"] || 0).toBe(1);
    expect(after.players.user.hand.length).toBe(1);
  });

  it("MY OWN search never fires it (an opponent's search only)", () => {
    const s = state({ userBf: [wstPerm()], userLib: [basic("f9"), ...lib("c", 2)], stack: [tutorSpell("user")] });
    const paused = settle(s);
    expect(paused.pendingChoice?.kind).toBe("tutor-search");
    const after = settle(resolveTutorChoice(paused, "f9"));
    expect(wstOnField(after)?.counters?.["+1/+1"] || 0).toBe(0);
    expect(after.players.user.hand.map((c) => c.name)).toEqual(["Forest"]);
  });
});
