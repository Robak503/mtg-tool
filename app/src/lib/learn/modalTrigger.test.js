/**
 * MODAL TRIGGER FLUSH (CR 700.2) — the seam that lets a "choose one/two/one or more/… —" TRIGGERED ability
 * resolve through the flush stage instead of bouncing to the Arbiter. The whole stack ships together (the
 * CREED invariant): detectTriggers re-extracts the FULL bulleted block as the effectClause (not just mode 0);
 * gameEngine.buildTriggerStack, when the program is HIGH modal + every mode target-resolvable, picks a sensible
 * mode at flush (AI = the enemy/own chooser over expandCastChoices' mode×target candidates) and rides the chosen
 * mode onto the EFFECT_PROGRAM payload as `chosenMode`; runProgram.programAtoms resolves ONLY that mode. Coverage
 * (triggerRouting.triggerRoutesNatively) MIRRORS the gate so the metric can't drift.
 *
 * This file pins:
 *   1. detectTriggers — the full modal block is the effectClause (every mode, not just the first);
 *   2. buildTriggerStack — a HIGH all-modes-modeled modal routes via EFFECT_PROGRAM carrying chosenMode;
 *   3. the CREED core — the chosen mode resolves and the UNchosen mode does NOT (choose-one = exactly one);
 *   4. targeted modes — the enemy/own chooser places each mode's target on the correct side (no friendly fire);
 *   5. CREED all-or-nothing — a modal with ONE unmodeled mode does NOT route natively (whole card → Arbiter);
 *   6. choose-two — both chosen modes resolve, the third does not;
 *   7. coverage — an all-modes-modeled modal trigger is native; an unmodeled-mode modal stays body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle = "", extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withLibrary(state, cards, playerId = "user") {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library: cards } } };
}
/** A pending modal trigger controlled by "user" (the shape flushTriggers consumes). effectClause = the FULL block. */
function modalTrigger(clause, over = {}) {
  return {
    event: "etb",
    source: { name: "Source", permanentId: "perm-src" },
    controller: "user",
    descriptor: { event: "etb", scope: "self", whose: "any", effectClause: clause, interveningIf: null },
    context: {},
    targets: [],
    payload: { resolver: "trigger.effect", params: { effect: null, controller: "user", targets: [], context: {} } },
    ...over,
  };
}
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });

// ─── 1. detectTriggers captures the FULL modal block ──────────────────────────
describe("detectTriggers — modal block re-extraction (CR 700.2)", () => {
  it("the effectClause carries EVERY mode (lead + all bullets), not just the first", () => {
    const card = creature("Multi", "When this creature enters, choose one —\n• Draw a card.\n• You gain 3 life.\n• Each opponent loses 2 life.");
    const dets = detectTriggers(card);
    expect(dets).toHaveLength(1);
    expect(dets[0].effectClause).toContain("Draw a card");
    expect(dets[0].effectClause).toContain("You gain 3 life");
    expect(dets[0].effectClause).toContain("Each opponent loses 2 life");
  });

  it("a NON-modal trigger is unchanged (no over-capture)", () => {
    const dets = detectTriggers(creature("Plain", "When this creature enters, draw a card."));
    expect(dets[0].effectClause).toBe("draw a card");
  });
});

// ─── 2 + 3. buildTriggerStack routes modal via EFFECT_PROGRAM; only the chosen mode resolves ──
describe("flush — a modal trigger routes via EFFECT_PROGRAM with a chosen mode", () => {
  const CLAUSE = "choose one —\n• Draw a card.\n• You gain 3 life.";

  it("routes natively, carrying chosenMode = the first legal mode (draw)", () => {
    let s = withLibrary(stateWith(), [{ id: "lib-z", name: "Z" }]);
    s = { ...s, pendingTriggers: [modalTrigger(CLAUSE)] };
    const trig = flush(s).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.chosenMode).toBe(0);
    expect(trig.payload.params.program.structure).toBe("modal");
  });

  it("CREED — the chosen mode resolves and the UNchosen mode does NOT (exactly one)", () => {
    const lifeBefore = stateWith().players.user.life;
    let s = withLibrary(stateWith(), [{ id: "lib-z", name: "Z" }]);
    s = { ...s, pendingTriggers: [modalTrigger(CLAUSE)] };
    const after = resolveTopOfStack(flush(s));
    expect(after.players.user.hand.some((c) => c.id === "lib-z")).toBe(true); // mode 0 (draw) happened
    expect(after.players.user.life).toBe(lifeBefore); // mode 1 (gain 3 life) did NOT
  });

  it("an injected chooser can pick the OTHER mode (gain life), and only THAT mode resolves", () => {
    const lifeBefore = stateWith().players.user.life;
    let s = withLibrary(stateWith(), [{ id: "lib-z", name: "Z" }]);
    s = { ...s, pendingTriggers: [modalTrigger(CLAUSE)] };
    // chooser returns the candidate whose chosenMode is 1 (gain 3 life).
    const chooseTargets = (candidates) => candidates.find((c) => c.chosenMode === 1);
    const after = resolveTopOfStack(flushTriggers(s, { chooseTargets }));
    expect(after.players.user.life).toBe(lifeBefore + 3); // mode 1 happened
    expect(after.players.user.hand.some((c) => c.id === "lib-z")).toBe(false); // mode 0 did NOT
  });
});

// ─── 4. targeted modes — the enemy/own chooser sides each mode correctly ───────
describe("flush — targeted modal modes pick the correct side (no friendly fire)", () => {
  it("a 'destroy target artifact or enchantment' mode targets an OPPONENT's permanent", () => {
    // mode 0 = destroy (enemy intent); mode 1 = gain life (non-targeted). The chooser must pick a mode whose
    // targets are correct-side: destroy → an opponent's artifact. A friendly artifact must NOT be destroyed.
    let s = stateWith();
    const oppArt = createPermanent({ id: "opp-art", card: { id: "c-art", name: "Bauble", type: "Artifact" }, controller: "ai" });
    const myArt = createPermanent({ id: "my-art", card: { id: "c-art2", name: "MyRelic", type: "Artifact" }, controller: "user" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [oppArt] }, user: { ...s.players.user, battlefield: [myArt] } } };
    s = { ...s, pendingTriggers: [modalTrigger("choose one —\n• Destroy target artifact or enchantment.\n• You gain 4 life.")] };
    const after = resolveTopOfStack(flush(s));
    expect(after.players.ai.battlefield.some((p) => p.id === "opp-art")).toBe(false); // opponent's artifact destroyed
    expect(after.players.user.battlefield.some((p) => p.id === "my-art")).toBe(true); // OWN artifact untouched
  });

  it("with no opponent target AND a non-targeted mode, the chooser falls to the safe non-targeted mode", () => {
    // No opponent artifact exists → the destroy mode is uncastable, but the gain-life mode is always available.
    const lifeBefore = stateWith().players.user.life;
    const s = { ...stateWith(), pendingTriggers: [modalTrigger("choose one —\n• Destroy target artifact or enchantment.\n• You gain 4 life.")] };
    const after = resolveTopOfStack(flush(s));
    expect(after.players.user.life).toBe(lifeBefore + 4); // safe non-targeted mode resolved
  });
});

// ─── 5. CREED all-or-nothing — one unmodeled mode → not native ─────────────────
describe("CREED — a modal with an UNMODELED mode does NOT route natively", () => {
  const PARTIAL = "choose one —\n• Draw a card.\n• Each player reveals their hand, then you choose a noncreature card from it.";

  it("buildTriggerStack does NOT use EFFECT_PROGRAM for a partially-modeled modal", () => {
    const s = { ...withLibrary(stateWith(), [{ id: "lib-z", name: "Z" }]), pendingTriggers: [modalTrigger(PARTIAL)] };
    const trig = flush(s).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).not.toBe("effect-program");
  });

  it("triggerRoutesNatively is false for the partially-modeled modal, true for the fully-modeled one", () => {
    const partialDet = detectTriggers(creature("P", "When this creature enters, " + PARTIAL))[0];
    const fullDet = detectTriggers(creature("F", "When this creature enters, choose one —\n• Draw a card.\n• You gain 3 life."))[0];
    expect(triggerRoutesNatively(partialDet)).toBe(false);
    expect(triggerRoutesNatively(fullDet)).toBe(true);
  });
});

// ─── 6. choose-two — both chosen modes resolve, the third does not ─────────────
describe("flush — choose-two modal (both chosen modes resolve)", () => {
  it("resolves the two chosen modes and not the third", () => {
    const lifeBefore = stateWith().players.user.life;
    const oppBefore = stateWith().players.ai.life;
    let s = withLibrary(stateWith(), [{ id: "lib-z", name: "Z" }]);
    // modes: 0 draw, 1 gain 3 life, 2 each opponent loses 2 life. Pick {1,2} (gain + drain) explicitly.
    s = { ...s, pendingTriggers: [modalTrigger("choose two —\n• Draw a card.\n• You gain 3 life.\n• Each opponent loses 2 life.")] };
    const chooseTargets = (candidates) => candidates.find((c) => Array.isArray(c.chosenMode) && c.chosenMode.join("-") === "1-2");
    const after = resolveTopOfStack(flushTriggers(s, { chooseTargets }));
    expect(after.players.user.life).toBe(lifeBefore + 3); // mode 1
    expect(after.players.ai.life).toBe(oppBefore - 2);     // mode 2
    expect(after.players.user.hand.some((c) => c.id === "lib-z")).toBe(false); // mode 0 NOT chosen
  });
});

// ─── 7. coverage mirrors the runtime ──────────────────────────────────────────
describe("coverage — modal triggers mirror the flush gate", () => {
  const C = (type, oracle, name = "X") => ({ name, type, oracle, mana: "" });
  it("an all-modes-modeled modal trigger creature is native-trigger", () => {
    expect(classifyCard(C("Creature — Bear", "When this creature enters, choose one —\n• Put a +1/+1 counter on this creature.\n• You gain 4 life."))).toBe("native-trigger");
  });
  it("a modal trigger with one unmodeled mode stays body-only (CREED)", () => {
    expect(classifyCard(C("Creature — Bear", "When this creature enters, choose one —\n• Draw a card.\n• Each player reveals their hand, then you choose a noncreature card from it."))).toBe("body-only");
  });
});
