/**
 * ===== REFLEXIVE TRIGGER (CR 603.7) ===== the GENERAL "<primary>. When you do, <reflexive>." seam.
 *
 * A reflexive triggered ability is set up by the resolution of a prior effect and triggers off the event
 * that resolution causes ("when you do" = "when the immediately-preceding instruction's action happens",
 * CR 603.7). The self-play engine models it by folding the reflexive as the SEQUENTIAL TAIL of the primary's
 * effect program — behavior-identical to a separate stack object HERE because the fold is gated (parser
 * matchReflexiveTrigger / triggers detectTriggers) to the safe sub-case: the primary is MANDATORY (so the
 * reflexive ALWAYS fires) and the reflexive is self-contained, so no intervening-priority window can change
 * the outcome and the action always occurred.
 *
 * This file covers the GENERAL widening (BOTH halves independently HIGH):
 *   - Faebloom Trick (Instant)  — "Create two 1/1 blue Faerie tokens with flying. When you do, tap target
 *     creature an opponent controls."  → native-spell.
 *   - Dream Eater (Creature ETB) — "When this enters, surveil 4. When you do, you may return target nonland
 *     permanent an opponent controls to its owner's hand."  → native-trigger.
 *
 * CREED (CLAUDE.md §1.2) — the fold must NEVER fire a reflexive after an action that didn't happen:
 *   - an OPTIONAL primary ("you may create a Treasure token. When you do, …" — Generous Plunderer) is NOT
 *     folded → the card stays body-only / Arbiter (a declined "may" must not fire the payoff).
 *   - a reflexive that leads with an unbound primary-object referent ("it fights …" — Back for More) is NOT
 *     folded (the sequential interpreter can't bind "it" here) → Arbiter.
 *   - the optional reflexive's DECLINE path does nothing (the bounce is skipped).
 *
 * (The roll-d20 reflexive — Ancient Bronze Dragon — is folded UPSTREAM and tested in effects/atoms/diceRoll.test.js.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveScryChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FAEBLOOM = "Create two 1/1 blue Faerie creature tokens with flying. When you do, tap target creature an opponent controls.";
const DREAM = "Flash\nFlying\nWhen this creature enters, surveil 4. When you do, you may return target nonland permanent an opponent controls to its owner's hand.";

// ────────────────────────────────────────────────────────────────────────────
// classification — the general reflexive flips; the CREED-parked cases stay non-native
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE — classification (general 'When you do' fold)", () => {
  it("Faebloom Trick → native-spell (create 2 Faeries → reflexive tap an opponent's creature)", () => {
    expect(classifyCard({ name: "Faebloom Trick", type: "Instant", oracle: FAEBLOOM })).toBe("native-spell");
  });
  it("Dream Eater → native-trigger (surveil 4 → reflexive optional bounce an opponent's permanent)", () => {
    expect(classifyCard({ name: "Dream Eater", type: "Creature — Nightmare Sphinx", oracle: DREAM })).toBe("native-trigger");
  });
  it("Generous Plunderer → native-trigger (OPTIONAL-primary reflexive now MODELED via reflexiveGate + attacks-damage-by-artifact-count)", () => {
    // NOW MODELED (OPTIONAL-PRIMARY REFLEXIVE slice): the "you may create a Treasure token. When you do, target
    // opponent creates a tapped Treasure token." upkeep folds to [optional-create, reflexiveGate opponent-token]
    // — the reflexive fires at resolution ONLY when the optional was TAKEN (a declined "may" makes NO opponent
    // Treasure; enforced by the runtime reflexiveGate skip, NOT by parking). The attacks trigger "deals damage to
    // defending player equal to the number of artifacts they control" is a defendingPlayer-scoped count-scaled
    // combat damage. Both triggers route natively → native-trigger.
    expect(classifyCard({
      name: "Generous Plunderer", type: "Creature — Human Rogue",
      oracle: "Menace\nAt the beginning of your upkeep, you may create a Treasure token. When you do, target opponent creates a tapped Treasure token.\nWhenever this creature attacks, it deals damage to defending player equal to the number of artifacts they control.",
    })).toBe("native-trigger");
  });
  it("Back for More → NOT native (reflexive 'it fights …' leads with an unbound referent — CREED-safe FN)", () => {
    expect(classifyCard({
      name: "Back for More", type: "Instant",
      oracle: "Return target creature card from your graveyard to the battlefield. When you do, it fights up to one target creature you don't control.",
    })).not.toMatch(/^native/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parser — the primary + reflexive fold into ONE high-confidence atom sequence
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE — parser (the fold)", () => {
  it("Faebloom: oracle → [create-token x2, tap(opponent)], HIGH", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: FAEBLOOM });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-token", count: 2, power: 1, toughness: 1, keywords: ["Flying"] });
    expect(p.atoms[1]).toMatchObject({ op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] });
  });

  it("Dream Eater: the ETB trigger folds to [surveil 4, bounce(optional, opponent)], HIGH", () => {
    const t = detectTriggers({ name: "Dream Eater", type: "Creature — Nightmare Sphinx", oracle: DREAM });
    expect(t).toHaveLength(1); // the reflexive is folded INTO the ETB trigger, not a dropped 2nd trigger
    const p = parseEffectClause(t[0].effectClause, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "surveil", amount: 4 });
    expect(p.atoms[1]).toMatchObject({ op: "bounce", targetType: "nonlandPermanent", optional: true, restrictions: [{ kind: "controller", who: "opponent" }] });
  });

  it("OPTIONAL-PRIMARY REFLEXIVE: 'you may X. When you do, Y' folds to [optional X, reflexiveGate Y] (HIGH)", () => {
    // NOW MODELED (reflexiveGate): the optional-primary reflexive is no longer parked — it folds to an optional
    // primary followed by a GATED payoff that fires at resolution ONLY when the 'may' was taken. The runtime
    // (resolveOptionalChoice) skips reflexiveGate atoms on a DECLINE, so the CREED safety (a declined 'may' must
    // not fire the payoff) is preserved by the gate, not by parking. See the runtime END-TO-END test below.
    const p = parseEffectProgram({ type: "Instant", oracle: "You may create a Treasure token. When you do, draw a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "create-named-token", token: "treasure", count: 1, targetType: null, optional: true },
      { op: "draw", amount: 1, targetType: null, reflexiveGate: true },
    ]);
  });

  it("CREED: a reflexive leading with an unbound referent ('it …') does NOT fold", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Create a 1/1 white Soldier creature token. When you do, it gains haste until end of turn." });
    expect(programConfidence(p)).toBe("low");
  });

  it("MANDATORY reflexive with a target-opponent-creates payoff folds HIGH (opponent-beneficiary token now modeled)", () => {
    // Previously parked ("target opponent creates …" was unmodeled). Now the opponent-beneficiary token IS
    // modeled (whoCreates:"target"), so a MANDATORY primary + this reflexive folds via matchReflexiveTrigger.
    const p = parseEffectProgram({ type: "Instant", oracle: "Create a Treasure token. When you do, target opponent creates a tapped Treasure token." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "create-named-token", token: "treasure", count: 1, targetType: null },
      { op: "create-named-token", token: "treasure", count: 1, targetType: "opponent", whoCreates: "target", tapped: true },
    ]);
  });

  it("CREED: an OPTIONAL-primary reflexive whose reflexive half is UNMODELED stays LOW (parser re-gate)", () => {
    // "you may mill an opponent. When you do, <unmodeled>" — the reflexive half must model or the whole thing
    // stays LOW → Arbiter (never a partial). Use an unmodeled reflexive payoff to prove the gate re-checks.
    const p = parseEffectProgram({ type: "Instant", oracle: "You may create a Treasure token. When you do, each player dances the tango." });
    expect(programConfidence(p)).toBe("low");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runtime — the reflexive fires after the (mandatory) primary action resolves
// ────────────────────────────────────────────────────────────────────────────
describe("REFLEXIVE — runtime (Faebloom spell)", () => {
  function faebloomState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const oppCreature = createPermanent({ id: "opp1", card: { id: "c1", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai" });
    return {
      ...s, activePlayer: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [], life: 40 }, ai: { ...s.players.ai, battlefield: [oppCreature], life: 40 } },
    };
  }

  it("creates two 1/1 flying Faeries AND taps the targeted opponent creature", () => {
    let s = faebloomState();
    const program = parseEffectProgram({ type: "Instant", oracle: FAEBLOOM });
    const obj = { source: { name: "Faebloom Trick" }, payload: { params: { program, controller: "user", targets: [{ type: "creature", id: "opp1", atomIndex: 1, controller: "ai" }] } } };
    s = runEffectProgram(s, obj);
    const faeries = s.players.user.battlefield.filter((p) => p.card.token);
    expect(faeries).toHaveLength(2);
    expect(faeries[0].card).toMatchObject({ power: 1, toughness: 1, keywords: ["Flying"] });
    expect(s.players.ai.battlefield.find((p) => p.id === "opp1").tapped).toBe(true); // the reflexive tap fired
  });
});

describe("REFLEXIVE — runtime END-TO-END (Dream Eater ETB through the real flush)", () => {
  function dreamState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const dream = createPermanent({ id: "dream", card: { id: "cdream", name: "Dream Eater", type: "Creature — Nightmare Sphinx", oracle: DREAM }, controller: "user" });
    const oppPerm = createPermanent({ id: "opp1", card: { id: "c1", name: "Signet", type: "Artifact" }, controller: "ai" });
    const library = Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, name: `Card${i}`, type: "Sorcery", oracle: "" }));
    return {
      ...s, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [dream], library, hand: [], life: 40 }, ai: { ...s.players.ai, battlefield: [oppPerm], hand: [], life: 40 } },
    };
  }
  // Drive the resolution loop: surveil pause (keep all) → optional bounce pause (take or decline).
  function drive(s, { takeBounce }) {
    let g = 0;
    while (((s.stack || []).length || s.pendingChoice) && g++ < 40) {
      if (s.pendingChoice?.kind === "scry-surveil") { s = resolveScryChoice(s, s.pendingChoice.cards.map((c) => c.id)); continue; }
      if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, takeBounce); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    return s;
  }

  it("surveils, then (taking the 'may') bounces the targeted opponent permanent to its owner's hand", () => {
    let s = dreamState();
    s = checkEnterTriggers(s, s.players.user.battlefield[0]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    // The trigger needs a target — the enemy/own chooser picked the OPPONENT's permanent (correct side).
    expect(s.stack[0].targets).toEqual([expect.objectContaining({ id: "opp1", atomIndex: 1 })]);
    s = drive(s, { takeBounce: true });
    expect(s.players.ai.battlefield.find((p) => p.id === "opp1")).toBeUndefined(); // bounced
    expect(s.players.ai.hand.find((c) => c.id === "c1")).toBeTruthy();             // → owner's hand
  });

  it("CREED: DECLINING the optional bounce does nothing (the opponent's permanent stays)", () => {
    let s = dreamState();
    s = checkEnterTriggers(s, s.players.user.battlefield[0]);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = drive(s, { takeBounce: false });
    expect(s.players.ai.battlefield.find((p) => p.id === "opp1")).toBeTruthy(); // NOT bounced (declined)
    expect(s.players.ai.hand.find((c) => c.id === "c1")).toBeFalsy();
  });
});
