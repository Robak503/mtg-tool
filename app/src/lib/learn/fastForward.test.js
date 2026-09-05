/**
 * FAST FORWARD — mass goad + the attacked-opponents cast discount. SHELF-85 · Halfshell, 2026-09-05.
 * "This spell costs {1} less to cast for each opponent you attacked this turn. Goad all creatures your opponents control."
 *
 * Two arms. (1) Goad knew a target and a bound pronoun, never the mass form: one arm on the every-opponent-creature scope
 * (atomTargets enumerates it at resolution); applyGoad's loop and duration are untouched. (2) "opponents you attacked this
 * turn" is a SEAT-level look-back: the declare-attacker chokepoint stamps the seat's distinct defenders, the untap reset
 * clears the memo beside the Raid flag, and countForSpec counts the DISTINCT LIVE OPPONENTS among them (a planeswalker
 * defender id is not a player and never counts). The per-each self-cost metric reuses parseSelfCountSource; the coverage
 * stripper learned the per-each frame, gated on the metric parsing.
 *
 * Mutation-checked: see the run ledger (docs-sk102).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { selfCostReductionMetric } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, resetAttackedThisTurnAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FF = { id: "c-ff", name: "Fast Forward", type: "Sorcery", mana: "{4}{R}", keywords: [],
  oracle: "This spell costs {1} less to cast for each opponent you attacked this turn.\nGoad all creatures your opponents control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)" };
const TAUNT = { id: "c-tr", name: "Taunt from the Rampart", type: "Sorcery", mana: "{4}{R}", keywords: [],
  oracle: "Goad all creatures your opponents control. Until your next turn, those creatures can't block." };
// A PERMANENT whose only text is a per-each self-cost sentence (Ghoultree; the Karador-family metric the cast path has priced
// for a year): the classifier's self-cost stripper had no per-each frame, so the sentence sat as residue and the card parked
// while the runtime discounted it. Pinned native here — this is the coverage-side half of the slice.
const GHOULTREE = { id: "c-gt", name: "Ghoultree", type: "Creature — Zombie Treefolk", mana: "{7}{G}", power: "10", toughness: "10", keywords: [],
  oracle: "This spell costs {1} less to cast for each creature card in your graveyard." };

describe("the parser and the metric", () => {
  it("the mass goad reads to the every-opponent-creature scope; the discount metric is a per-each count of attacked opponents; Fast Forward flips native; Taunt (an extra can't-block sentence) still parks", () => {
    const p = parseEffectClause("Goad all creatures your opponents control.", "Sorcery");
    const row = { conf: programConfidence(p), atom: p.atoms[0], metric: selfCostReductionMetric(FF), tier: classifyCard(FF), taunt: classifyCard(TAUNT), ghoultree: classifyCard(GHOULTREE) };
    console.log("  WITNESS fastForward", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "goad", targetType: "eachOpponentCreature" });
    expect(row.metric).toEqual({ kind: "perEachCount", per: 1, countSpec: { kind: "opponentsAttackedThisTurn" } });
    expect(row.tier).toBe("native-spell");
    expect(row.taunt).not.toMatch(/^native/);
    expect(row.ghoultree).toBe("native-body"); // the per-each frame stripped by the classifier — the runtime already priced it
  });
});

const bear = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
const mountain = (i) => createPermanent({ id: `m${i}`, card: { id: `c-m${i}`, name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "user" });

function board(landCount) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const lands = Array.from({ length: landCount }, (_, i) => mountain(i + 1));
  return { ...s0, turn: 3, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [FF], battlefield: [bear("a1", "user"), bear("a2", "user"), ...lands] },
      ai: { ...s0.players.ai, battlefield: [bear("x1", "ai"), bear("x2", "ai")] } } };
}
/** Declare both bears as attackers through the real dispatcher (the sole chokepoint), then move to the postcombat main. */
function attackThenMain(s) {
  s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "a1", name: "Bear a1" });
  s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "a2", name: "Bear a2" });
  return { ...s, phase: "postcombat-main", step: "main", priorityHolder: "user", consecutivePasses: 0, combat: { attackers: [], blockers: [] } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-ff");

describe("RUNTIME — the discount through the real offer, the memo's lifecycle, and the mass goad", () => {
  it("two attackers into the same opponent: the seat memo holds it ONCE, the cast is offered at {3}{R} with four Mountains; a planeswalker defender stamped beside it adds nothing", () => {
    const s = attackThenMain(board(4));
    const withPw = { ...s, players: { ...s.players, user: { ...s.players.user, attackedPlayersThisTurn: [...s.players.user.attackedPlayersThisTurn, "pw-x"] } } };
    const row = { memo: s.players.user.attackedPlayersThisTurn, offered: casts(s).length, generic: casts(s)[0]?.cost.generic ?? null, withPwOffered: casts(withPw).length, withPwGeneric: casts(withPw)[0]?.cost.generic ?? null };
    console.log("  WITNESS fastForwardDiscount", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ memo: ["ai"], offered: 1, generic: 3, withPwOffered: 1, withPwGeneric: 3 });
  });

  it("no attack this turn: four Mountains cannot cast it (printed {4}{R}); after the untap reset the memo is gone and the price is printed again", () => {
    const quiet = { ...board(4), phase: "precombat-main", step: "main" };
    const reset = { ...resetAttackedThisTurnAllPlayers(attackThenMain(board(5))), phase: "precombat-main", step: "main" };
    const row = { quietOffered: casts(quiet).length, resetMemo: reset.players.user.attackedPlayersThisTurn, resetGeneric: casts(reset)[0]?.cost.generic ?? null };
    console.log("  WITNESS fastForwardMemo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ quietOffered: 0, resetMemo: [], resetGeneric: 4 });
  });

  it("resolving goads EVERY opponent creature (goaded + must attack) and none of the caster's own", () => {
    const s = attackThenMain(board(4));
    const out = resolveTopOfStack(dispatchAction(s, casts(s)[0]));
    const g = (id) => !!permanentHasKeyword(out, id, "goaded") && !!permanentHasKeyword(out, id, "mustAttack");
    const row = { x1: g("x1"), x2: g("x2"), a1: g("a1"), a2: g("a2"), ffInGy: out.players.user.graveyard.some((c) => c.id === "c-ff") };
    console.log("  WITNESS fastForwardGoad", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ x1: true, x2: true, a1: false, a2: false, ffInGy: true });
  });
});
