/**
 * untapThenPump.test.js — UNTAP-THEN-PUMP (overnight grind, corpus lever).
 *
 * "Untap target creature. It gets +X/+Y [and gains reach] until end of turn." (Ornamental Courage / Inspirit /
 * Gerrard's Command / Spidery Grasp / Aim High / Steady Aim). The anaphoric "It" (= the untap's target) would
 * shatter under the clause splitter into [untap, <unbound pump>], so matchUntapThenPump collapses it UP FRONT
 * into ONE pump atom carrying untap:true — the SAME atom the shipped reverse-order form ("…until end of turn.
 * Untap it." — Vines of the Recluse) produces, whose pump+untap resolution is e2e-proven in pumpUntap.test.js.
 * Untap-then-pump on a single creature is order-independent (no interaction), so the two orderings are equivalent.
 *
 * Flip-diff GAINED = {Ornamental Courage, Inspirit, Gerrard's Command, Spidery Grasp, Aim High, Steady Aim},
 * LOST = 0.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());
const I = (name, oracle, mana = "{1}{G}") => ({ name, oracle, type: "Instant", keywords: [], mana });

describe("untap-then-pump — parser (anaphoric 'It' collapses to one pump atom with untap:true)", () => {
  it("bare '+X/+Y' → pump {untap:true}", () => {
    expect(parseEffectProgram(I("Ornamental Courage", "Untap target creature. It gets +1/+3 until end of turn.")).atoms)
      .toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 1, t: 3 }, untap: true }]);
  });
  it("the reach variant carries grantKeywords: ['Reach'] + untap:true", () => {
    expect(parseEffectProgram(I("Spidery Grasp", "Untap target creature. It gets +2/+4 and gains reach until end of turn.")).atoms)
      .toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 4 }, grantKeywords: ["Reach"], untap: true }]);
  });
  it("the whole family flips native-spell", () => {
    expect(classifyCard(I("Ornamental Courage", "Untap target creature. It gets +1/+3 until end of turn."))).toBe("native-spell");
    expect(classifyCard(I("Inspirit", "Untap target creature. It gets +2/+4 until end of turn."))).toBe("native-spell");
    expect(classifyCard(I("Gerrard's Command", "Untap target creature. It gets +3/+3 until end of turn.", "{1}{W}"))).toBe("native-spell");
    expect(classifyCard(I("Aim High", "Untap target creature. It gets +2/+2 and gains reach until end of turn.", "{1}{G}"))).toBe("native-spell");
  });
  it("CREED guards — an unmodeled granted keyword and a symmetric/second-target rider stay non-native", () => {
    // "gains flying" isn't in this matcher's grant set (only reach) → the exact anchor rejects it → LOW.
    expect(programConfidence(parseEffectProgram(I("Fake", "Untap target creature. It gets +2/+4 and gains flying until end of turn.")))).toBe("low");
    // GRADUATED 2026-07-30 — a draw rider past the anchor is now HIGH. This matcher only ever handled the
    // exact two-clause collapse, so anything longer was refused. Referent binding (CR 608.2) parses the
    // same text COMPOSITIONALLY instead: [untap target creature] → [bound pump] → [draw]. The card is
    // fully modelled, which is the outcome the refusal was standing in for. Re-pointed, not deleted.
    expect(programConfidence(parseEffectProgram(I("Fake2", "Untap target creature. It gets +2/+4 until end of turn. Draw a card.")))).toBe("high");
    // Still LOW, and the live negative for this pin: a referent with NO antecedent to bind to.
    expect(programConfidence(parseEffectProgram(I("Fake3", "Draw a card. It gets +2/+4 until end of turn.")))).toBe("low");
  });
});

describe("untap-then-pump — resolver e2e (the pumped creature is also untapped)", () => {
  const bear = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
  it("a TAPPED 2/2 targeted by Inspirit → +2/+4 AND untapped", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user,
        battlefield: [createPermanent({ id: "bear", card: bear, controller: "user", summoningSick: false, tapped: true })],
        hand: [{ id: "trick", name: "Inspirit", type: "Instant", mana: "{1}{G}", oracle: "Untap target creature. It gets +2/+4 until end of turn." }],
        manaPool: { ...s0.players.user.manaPool, G: 1, C: 1 } } },
    };
    expect(s.players.user.battlefield.find((p) => p.id === "bear").tapped).toBe(true);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "trick" && a.targets?.[0]?.id === "bear");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    while ((s.stack || []).length) s = resolveTopOfStack(s);
    const bp = s.players.user.battlefield.find((p) => p.id === "bear");
    expect(bp.tapped).toBe(false);                       // untapped
    expect(permanentPower(s, bp.id)).toBe(4);            // 2 + 2
    expect(permanentToughness(s, bp.id)).toBe(6);        // 2 + 4
  });
});
