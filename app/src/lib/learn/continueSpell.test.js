/**
 * CONTINUE? — SHELF-85 · Bumble Flower F6 (2026-09-05). "Choose up to four target creature cards in your graveyard that were
 * put there from the battlefield this turn. Return them to the battlefield." Three seams: a per-card FROM-BATTLEFIELD-
 * THIS-TURN stamp written by the zone mover (the milledThisTurn twin — compared to the live turn, never reset), an
 * enumerator gate on it, and a splitter fold + zones arm for the "choose … return …" pair (23 printings of the qualifier;
 * the pair shape on Brought Back / Othelm / Niambi / Grim Return / Salvager of Ruin). Multi-count → the subset machinery.
 *
 * Mutation-checked: see the run ledger (docs-sk72).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CONTINUE = { name: "Continue?", type: "Instant", mana: "{1}{W}", keywords: [], oracle: "Choose up to four target creature cards in your graveyard that were put there from the battlefield this turn. Return them to the battlefield." };
const perm = (id, name) => createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 3,
    players: { ...b.players, user: { ...b.players.user, hand: [{ ...CONTINUE, id: "ct1" }], battlefield: [perm("d1", "Died Today"), perm("d2", "Died Today Too")], graveyard: [{ id: "old", name: "Died Long Ago", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, { id: "spell", name: "Old Bolt", type: "Instant" }], manaPool: { ...b.players.user.manaPool, W: 1, C: 1 } } } };
  s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "d1" }); // died THIS turn
  s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "d2" }); // died THIS turn
  return s;
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }

describe("parse + classify", () => {
  it("the folded pair parses to ONE reanimate atom with the this-turn gate and up-to-four targets; native-spell", () => {
    const p = parseEffectProgram(CONTINUE);
    const row = { confidence: p.confidence, atoms: p.atoms, tier: classifyCard(CONTINUE) };
    console.log("  WITNESS continueParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", fromBattlefieldThisTurnOnly: true, maxTargets: 4, minTargets: 0 }]);
    expect(row.tier).toBe("native-spell");
  });
  it("the sibling shapes: the singular 'choose target … return it to the battlefield tapped' (Othelm) and the to-hand form (Salvager of Ruin)", () => {
    const a = parseEffectProgram({ name: "Probe", type: "Instant", mana: "{1}", keywords: [], oracle: "Choose target creature card in your graveyard that was put there from the battlefield this turn. Return it to the battlefield tapped." }).atoms;
    const b = parseEffectProgram({ name: "Probe", type: "Instant", mana: "{1}", keywords: [], oracle: "Choose target permanent card in your graveyard that was put there from the battlefield this turn. Return it to your hand." }).atoms;
    console.log("  WITNESS continueSiblings", JSON.stringify({ a, b })); // vitest 4 needs --disable-console-intercept
    expect(a).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", fromBattlefieldThisTurnOnly: true, entersTapped: true }]);
    expect(b).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "permanent", fromBattlefieldThisTurnOnly: true }]);
  });
});

describe("the stamp and the gate", () => {
  it("the zone mover stamps a battlefield→graveyard card with the turn; the cast offers ONLY the two that died this turn (never the old creature or the instant); the largest offer returns both", () => {
    const s0 = state();
    const stamps = { d1: s0.fromBattlefieldThisTurn?.["c-d1"], d2: s0.fromBattlefieldThisTurn?.["c-d2"], old: s0.fromBattlefieldThisTurn?.["old"] ?? null }; // keyed by the CARD id — what the graveyard entry carries
    const casts = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ct1");
    const offeredSets = casts.map((a) => (a.targets || []).map((t) => t.id).sort().join("+")).sort();
    const best = casts.reduce((m, a) => ((a.targets || []).length > (m?.targets || []).length ? a : m), null);
    const s1 = drain(dispatchAction(s0, best));
    const row = { stamps, offeredSets, back: s1.players.user.battlefield.map((p) => p.card?.name).sort(), gy: s1.players.user.graveyard.map((c) => c.name).sort() };
    console.log("  WITNESS continueResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.stamps).toEqual({ d1: 3, d2: 3, old: null });
    expect(row.offeredSets).toEqual(["", "c-d1", "c-d1+c-d2", "c-d2"]); // the two that died this turn, every subset; never the old creature or the instant
    expect(row.back).toEqual(["Died Today", "Died Today Too"]);
    expect(row.gy).toEqual(["Continue?", "Died Long Ago", "Old Bolt"]);
  });
  it("a new turn: the stamp no longer matches, so nothing is offered but the empty set", () => {
    const s0 = { ...state(), turn: 4 };
    const casts = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ct1");
    const row = { offeredSets: casts.map((a) => (a.targets || []).map((t) => t.id).join("+")).sort() };
    console.log("  WITNESS continueNextTurn", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offeredSets).toEqual([""]);
  });
});
