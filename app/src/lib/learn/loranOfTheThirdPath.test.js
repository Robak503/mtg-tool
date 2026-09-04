/**
 * loranOfTheThirdPath.test.js — SHELF-85 runbook Phase 2 · B8 (2026-09-04): Loran of the Third Path (Brago).
 *
 *   "Vigilance
 *    When Loran enters, destroy up to one target artifact or enchantment.
 *    {T}: You and target opponent each draw a card."
 *
 * The draw atom knew controller / each player / target player / the upkeep player / the triggering permanent's
 * controller; the TWO-SEAT form is new: who:"controllerAndTarget" draws for the controller, then for the targeted
 * seat (CR 608.2c — the written order), targetType "opponent" (never the controller). The clause splitter's top-level
 * " and " was severing the two SUBJECTS ("You" / "target opponent each draw …"), so a keep-whole guard joins the
 * blink guard. Secret Rendezvous (the sentence is the card) and Sky Crier ({3}{W}: the same draw) graduate with it.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LORAN = { id: "c-loran", name: "Loran of the Third Path", type: "Legendary Creature — Human Artificer", mana: "{2}{W}", cmc: 3, power: 2, toughness: 1, keywords: ["Vigilance"],
  oracle: "Vigilance\nWhen Loran enters, destroy up to one target artifact or enchantment.\n{T}: You and target opponent each draw a card." };
const RENDEZVOUS = { id: "c-sr", name: "Secret Rendezvous", type: "Sorcery", mana: "{1}{W}{W}", cmc: 3, keywords: [], oracle: "You and target opponent each draw three cards." };
const CRIER = { id: "c-sc", name: "Sky Crier", type: "Creature — Bird Citizen", mana: "{1}{W}", cmc: 2, power: 1, toughness: 1, keywords: ["Flying", "Lifelink"], oracle: "Flying, lifelink\n{3}{W}: You and target opponent each draw a card." };

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-lib-${i}`, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }));
function board(ctrl) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const other = ctrl === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: ctrl, priorityHolder: ctrl, consecutivePasses: 0, turn: 4,
    players: { ...s.players,
      [ctrl]: { ...s.players[ctrl], battlefield: [createPermanent({ id: "LORAN", card: LORAN, controller: ctrl, summoningSick: false })], library: lib(ctrl, 3), hand: [] },
      [other]: { ...s.players[other], battlefield: [], library: lib(other, 3), hand: [] } } };
}
const offers = (s, ctrl) => legalActionsForPlayer(s, ctrl).filter((a) => a.kind === "activate-ability" && a.permanentId === "LORAN");

describe("parse", () => {
  it("'you and target opponent each draw N' is one two-seat draw aimed at an opponent", () => {
    const r = parseEffectClause("You and target opponent each draw a card.", "Creature");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "draw", amount: 1, who: "controllerAndTarget", targetType: "opponent" }]);
    expect(parseEffectClause("You and target opponent each draw three cards.", "Sorcery").atoms[0].amount).toBe(3);
    expect(splitClauses("You and target opponent each draw a card.")).toHaveLength(1);
  });
  it("Loran's ETB is the up-to-one artifact-or-enchantment removal (already modeled)", () => {
    const d = detectTriggers(LORAN);
    expect(d.map((x) => x.event)).toEqual(["etb"]);
    expect(programConfidence(parseEffectClause(d[0].effectClause, "Creature"))).toBe("high");
  });
  it("seen-to-fail: 'you and each opponent each draw' and a rider stay low", () => {
    expect(parseEffectClause("You and each opponent each draw a card.", "Sorcery").atoms).toEqual([]);
    expect(parseEffectClause("You and target opponent each draw a card and lose 1 life.", "Sorcery").atoms).toEqual([]);
  });
});

describe("runtime — both seats draw", () => {
  it("user taps Loran: only the opponent is offered as the target; both draw one; Loran is tapped", () => {
    let s = board("user");
    const acts = offers(s, "user");
    expect(acts).toHaveLength(1);
    expect(acts[0].targets.map((t) => t.id)).toEqual(["ai"]);
    s = dispatchAction(s, acts[0]);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.ai.hand).toHaveLength(1);
    expect(s.players.user.library).toHaveLength(2);
    expect(s.players.ai.library).toHaveLength(2);
    expect(s.players.user.battlefield.find((p) => p.id === "LORAN").tapped).toBe(true);
  });
  it("AI taps Loran: the user is the target and both draw", () => {
    let s = board("ai");
    const acts = offers(s, "ai");
    expect(acts).toHaveLength(1);
    expect(acts[0].targets.map((t) => t.id)).toEqual(["user"]);
    s = dispatchAction(s, acts[0]);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.ai.hand).toHaveLength(1);
    expect(s.players.user.hand).toHaveLength(1);
  });
});

describe("classifier", () => {
  it("Loran is native-mixed; Secret Rendezvous a native spell; Sky Crier native-activated", () => {
    expect(classifyCard(LORAN)).toBe("native-mixed");
    expect(classifyCard(RENDEZVOUS)).toBe("native-spell");
    expect(classifyCard(CRIER)).toBe("native-activated");
  });
});
