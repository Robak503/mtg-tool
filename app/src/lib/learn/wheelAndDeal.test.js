/**
 * WHEEL AND DEAL — any number of target opponents each discard their hands, then draw seven. SHELF-85 · Phase 3 (Nekusar), 2026-09-05.
 * "Any number of target opponents each discard their hands, then draw seven cards. / Draw a card."
 *
 * Two atoms bound to ONE chosen set: the whole-hand discard on any number of target opponents (the subset path a creature
 * "any number of" takes, on player targets), then a draw of seven for the SAME players through the bound-referent
 * mechanism (bindPreviousTargets — the draw's targets are the discard's). The intent is enemy (the targets are opponents).
 *
 * Mutation-checked: see the run ledger (docs-sk115).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WAD = { id: "c-wad", name: "Wheel and Deal", type: "Instant", mana: "{3}{U}", keywords: [],
  oracle: "Any number of target opponents each discard their hands, then draw seven cards.\nDraw a card." };

describe("the parser", () => {
  it("the whole card reads to discard-hand (any number of target opponents) + a bound draw of seven + the controller's draw; native-spell", () => {
    const p = parseEffectProgram(WAD);
    const row = { conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(WAD) };
    console.log("  WITNESS wheelAndDeal", JSON.stringify({ conf: row.conf, ops: row.atoms.map((a) => a.op), tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atoms[0]).toEqual({ op: "discard", who: "target", targetType: "opponent", all: true, minTargets: 0, maxTargets: 99, anyNumber: true });
    expect(row.atoms[1]).toEqual({ op: "draw", who: "target", amount: 7, bindPreviousTargets: true });
    expect(row.atoms[2]).toMatchObject({ op: "draw", amount: 1 });
    expect(row.tier).toBe("native-spell");
  });
});

const card = (id) => ({ id, name: `Card ${id}`, type: "Instant", mana: "{U}", keywords: [], oracle: "" });
const lib = (pid, n) => Array.from({ length: n }, (_, i) => card(`${pid}-l${i}`));
const hand = (pid, n) => Array.from({ length: n }, (_, i) => card(`${pid}-h${i}`));

function table() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const islands = Array.from({ length: 4 }, (_, i) => createPermanent({ id: `i${i}`, card: { id: `c-i${i}`, name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user" }));
  return { ...s0, turnOrder: ["user", "ai", "ai2"], phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      user: { ...s0.players.user, hand: [WAD, ...hand("user", 2)], library: lib("user", 3), battlefield: islands },
      ai: { ...s0.players.ai, hand: hand("ai", 2), library: lib("ai", 9) },
      ai2: { ...s0.players.ai, hand: hand("ai2", 3), library: lib("ai2", 9) },
    } };
}
const counts = (s) => ({ user: s.players.user.hand.length, ai: s.players.ai.hand.length, ai2: s.players.ai2.hand.length, aiGy: s.players.ai.graveyard.length, ai2Gy: s.players.ai2.graveyard.length });

describe("RUNTIME — the real cast on a three-seat table", () => {
  it("the cast offers every subset of OPPONENTS (never the caster); both opponents chosen → each discards their hand and draws seven, the caster draws one", () => {
    const s = table();
    const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-wad");
    const sets = casts.map((x) => (x.targets || []).map((t) => t.id).sort().join("+")).sort();
    const both = casts.find((x) => (x.targets || []).length === 2);
    const out = resolveTopOfStack(dispatchAction(s, both));
    const row = { sets, after: counts(out) };
    console.log("  WITNESS wheelAndDealBoth", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.sets).toEqual(["", "ai", "ai+ai2", "ai2"]);
    expect(row.after).toEqual({ user: 3, ai: 7, ai2: 7, aiGy: 2, ai2Gy: 3 });
  });

  it("one opponent chosen → only that one wheels; the other keeps its hand", () => {
    const s = table();
    const one = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-wad" && (x.targets || []).length === 1 && x.targets[0].id === "ai2");
    const out = resolveTopOfStack(dispatchAction(s, one));
    const row = counts(out);
    console.log("  WITNESS wheelAndDealOne", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ user: 3, ai: 2, ai2: 7, aiGy: 0, ai2Gy: 3 });
  });
});
