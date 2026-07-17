/**
 * Tests for PHASE-TRIGGER-FRAMEWORK (Wave 1).
 *
 * Extends the phase/step trigger spine (triggers.js classifyCondition +
 * checkStepTriggers) to the FOUR missing step-kinds so their triggers fire:
 *   - "At the beginning of combat on your turn"    -> combatBegin / whose "yours"
 *   - "At the beginning of each combat"            -> combatBegin / whose "any"
 *   - "At the beginning of your first main phase"  -> firstMain   / whose "yours"
 *   - "At the beginning of each opponent's upkeep" -> upkeep      / whose "opponents"
 *
 * detectPhaseTrigger (registered globally from triggers.js' bottom) does the
 * detection; runStepActions does the emission. This slice ONLY fixes
 * detection + emission — the EFFECTS of the real cards used here (Greasefang's
 * "return target Vehicle", Unnatural Growth's "double power/toughness", Coalition
 * Relic's charge-counter mana, Viseling's "X damage") parse LOW and the whole
 * cards correctly stay non-native; we assert the TRIGGER fires, never that the
 * card is native (that would be a CREED over-claim).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { detectPhaseTrigger } from "./triggerScheduler.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPlayerState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── helpers (mirror stepAttackTriggers.test.js) ────────────────────────────────
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}
function triggerOnStack(state) {
  return (state.stack || []).find((s) => s.kind === "triggered-ability");
}
function pendingCount(state) {
  return (state.pendingTriggers || []).length;
}

// Real corpus cards (verified against the bundled oracle index). The riders after the
// anchor ("...on your turn, return target Vehicle...") are split off by splitTriggerSentence,
// so the CONDITION reaching the detector is clean — the trigger correctly fires while the
// effect (parsed elsewhere) keeps the whole card non-native.
const GREASEFANG = { id: "c-grease", name: "Greasefang, Okiba Boss", type: "Legendary Creature — Rat Pilot", power: 4, toughness: 3, oracle: "At the beginning of combat on your turn, return target Vehicle card from your graveyard to the battlefield. It gains haste." };
const UNNATURAL_GROWTH = { id: "c-ug", name: "Unnatural Growth", type: "Enchantment", oracle: "At the beginning of each combat, double the power and toughness of each creature you control until end of turn." };
const COALITION_RELIC = { id: "c-relic", name: "Coalition Relic", type: "Artifact", oracle: "At the beginning of your first main phase, remove all charge counters from this artifact. Add one mana of any color for each charge counter removed this way." };
const VISELING = { id: "c-vis", name: "Viseling", type: "Artifact", oracle: "At the beginning of each opponent's upkeep, this creature deals X damage to that player, where X is the number of cards in their hand minus 4." };
const KOMA = { id: "c-koma", name: "Koma, Cosmos Serpent", type: "Legendary Creature — Serpent", power: 6, toughness: 6, oracle: "At the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil." };

// ─── 1. Detection (unit, detectPhaseTrigger) ────────────────────────────────────
// The condition the detector receives is the keyword-stripped form ("the beginning of …").
// detectPhaseTrigger normalizes the leading "the " before its anchored match.
describe("detectPhaseTrigger (unit)", () => {
  it("classifies all four phase-trigger shapes", () => {
    expect(detectPhaseTrigger("the beginning of combat on your turn")).toEqual({ event: "combatBegin", scope: "you", whose: "yours" });
    expect(detectPhaseTrigger("the beginning of each combat")).toEqual({ event: "combatBegin", scope: "you", whose: "any" });
    expect(detectPhaseTrigger("the beginning of your first main phase")).toEqual({ event: "firstMain", scope: "you", whose: "yours" });
    expect(detectPhaseTrigger("the beginning of each opponent's upkeep")).toEqual({ event: "upkeep", scope: "you", whose: "opponents" });
  });

  it("matches with or without the leading 'the ' (lowercased + trimmed)", () => {
    expect(detectPhaseTrigger("beginning of each combat")).toEqual({ event: "combatBegin", scope: "you", whose: "any" });
    expect(detectPhaseTrigger("  The Beginning Of Combat On Your Turn  ")).toEqual({ event: "combatBegin", scope: "you", whose: "yours" });
  });

  it("CREED: residue past the anchor stays UNDETECTED (null)", () => {
    // residue that reaches the detector (NOT a comma-split effect rider)
    expect(detectPhaseTrigger("the beginning of combat on each of your turns")).toBeNull();
    expect(detectPhaseTrigger("the beginning of your next upkeep")).toBeNull();       // delayed trigger — must not be swallowed
    expect(detectPhaseTrigger("the beginning of your second main phase")).toBeNull(); // postcombat-main, unmodeled
    expect(detectPhaseTrigger("the beginning of each end step")).toBeNull();          // owned by the existing spine, not this detector
  });
});

// ─── 2. Detection through detectTriggers (the full pipeline + registration) ──────
describe("detectTriggers wiring (registered detector)", () => {
  it("detects the four real cards' phase triggers (clean condition after rider split)", () => {
    expect(detectTriggers(GREASEFANG)[0]).toMatchObject({ event: "combatBegin", whose: "yours" });
    expect(detectTriggers(UNNATURAL_GROWTH)[0]).toMatchObject({ event: "combatBegin", whose: "any" });
    expect(detectTriggers(COALITION_RELIC)[0]).toMatchObject({ event: "firstMain", whose: "yours" });
    expect(detectTriggers(VISELING)[0]).toMatchObject({ event: "upkeep", whose: "opponents" });
  });

  it("CREED: a residue-bearing condition is not detected as a phase trigger", () => {
    const eachTurns = { id: "c-et", name: "X", type: "Enchantment", oracle: "At the beginning of combat on each of your turns, you gain 1 life." };
    expect(detectTriggers(eachTurns)).toHaveLength(0);
    const nextUpkeep = { id: "c-nu", name: "Y", type: "Enchantment", oracle: "At the beginning of your next upkeep, sacrifice this creature." };
    expect(detectTriggers(nextUpkeep)).toHaveLength(0);
  });
});

// ─── 3. Emission: combat-begin ──────────────────────────────────────────────────
describe("combat-begin emission (whose:yours)", () => {
  it("fires on the active player's combat (controller === activePlayer)", () => {
    const state = placePerms(
      stateWith({ phase: "combat", step: "beginning-of-combat", activePlayer: "user" }),
      [permObj(GREASEFANG, "user", "p-grease", { tapped: true })],
    );
    const out = runStepActions(state);
    expect(triggerOnStack(out)).toBeTruthy();
  });

  it("does NOT fire on a non-active player's combat (whose:yours gate)", () => {
    const state = placePerms(
      stateWith({ phase: "combat", step: "beginning-of-combat", activePlayer: "ai" }),
      [permObj(GREASEFANG, "user", "p-grease", { tapped: true })],
    );
    const out = runStepActions(state);
    expect(triggerOnStack(out)).toBeFalsy();
    expect(pendingCount(out)).toBe(0);
  });
});

describe("combat-begin emission (whose:any — Unnatural Growth)", () => {
  it("'each combat' fires on the controller's own turn", () => {
    const state = placePerms(
      stateWith({ phase: "combat", step: "beginning-of-combat", activePlayer: "user" }),
      [permObj(UNNATURAL_GROWTH, "user", "p-ug")],
    );
    expect(triggerOnStack(runStepActions(state))).toBeTruthy();
  });

  it("'each combat' fires regardless of whose turn it is (a non-controller's combat)", () => {
    const state = placePerms(
      stateWith({ phase: "combat", step: "beginning-of-combat", activePlayer: "ai" }),
      [permObj(UNNATURAL_GROWTH, "user", "p-ug")],
    );
    expect(triggerOnStack(runStepActions(state))).toBeTruthy();
  });
});

// ─── 4. Emission: first-main (must gate to PRECOMBAT main only) ──────────────────
describe("first-main emission (whose:yours)", () => {
  it("fires at the precombat main phase", () => {
    const state = placePerms(
      stateWith({ phase: "precombat-main", step: "main", activePlayer: "user" }),
      [permObj(COALITION_RELIC, "user", "p-relic")],
    );
    expect(triggerOnStack(runStepActions(state))).toBeTruthy();
  });

  it("does NOT fire at the POSTCOMBAT main phase (the double-fire landmine)", () => {
    const state = placePerms(
      stateWith({ phase: "postcombat-main", step: "main", activePlayer: "user" }),
      [permObj(COALITION_RELIC, "user", "p-relic")],
    );
    const out = runStepActions(state);
    expect(triggerOnStack(out)).toBeFalsy();
    expect(pendingCount(out)).toBe(0);
  });

  it("does NOT fire on a non-active player's precombat main (whose:yours gate)", () => {
    const state = placePerms(
      stateWith({ phase: "precombat-main", step: "main", activePlayer: "ai" }),
      [permObj(COALITION_RELIC, "user", "p-relic")],
    );
    expect(triggerOnStack(runStepActions(state))).toBeFalsy();
  });
});

// ─── 5. Emission: each-opponent's-upkeep (THE #1 FP — must NOT fire controller) ──
describe("each-opponent's-upkeep emission (whose:opponents)", () => {
  // A 4-seat Commander pod: Viseling controlled by 'user'.
  function podWithViseling(activePlayer) {
    const seat = () => createPlayerState({ library: [] });
    const players = {
      user: { ...seat(), battlefield: [permObj(VISELING, "user", "p-vis")] },
      ai1: seat(),
      ai2: seat(),
      ai3: seat(),
    };
    return { turn: 5, mode: "commander", turnOrder: ["user", "ai1", "ai2", "ai3"], activePlayer, priorityHolder: activePlayer, consecutivePasses: 0, phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [], players, log: [] };
  }

  it("fires on EACH opponent's upkeep", () => {
    for (const opp of ["ai1", "ai2", "ai3"]) {
      const out = runStepActions(podWithViseling(opp));
      expect(triggerOnStack(out), `should fire on ${opp}'s upkeep`).toBeTruthy();
    }
  });

  it("does NOT fire on its controller's OWN upkeep (assert zero pendingTriggers)", () => {
    const out = runStepActions(podWithViseling("user"));
    // The whole assertion of the slice: the controller's own upkeep yields NO opponent-upkeep trigger.
    expect(triggerOnStack(out)).toBeFalsy();
    expect(pendingCount(out)).toBe(0);
  });
});

// ─── 6. Regression: existing "each upkeep" still fires for all seats (Koma) ──────
describe("regression: Koma 'each upkeep' (whose:any) unaffected", () => {
  function podWithKoma(activePlayer) {
    const seat = () => createPlayerState({ library: [] });
    const players = {
      user: { ...seat(), battlefield: [permObj(KOMA, "user", "p-koma")] },
      ai1: seat(),
      ai2: seat(),
      ai3: seat(),
    };
    return { turn: 5, mode: "commander", turnOrder: ["user", "ai1", "ai2", "ai3"], activePlayer, priorityHolder: activePlayer, consecutivePasses: 0, phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [], players, log: [] };
  }

  it("Koma's 'each upkeep' fires on ALL four seats' upkeeps", () => {
    for (const seat of ["user", "ai1", "ai2", "ai3"]) {
      // checkStepTriggers used directly to count emission (Koma's named-token effect is another slice;
      // it may parse LOW, but the trigger still enters pendingTriggers).
      const out = checkStepTriggers(podWithKoma(seat), "upkeep");
      expect(pendingCount(out), `Koma should fire on ${seat}'s upkeep`).toBe(1);
    }
  });
});

// ─── 7. RESOLUTION-LEVEL correctness — the CREED FP guard ─────────────────────────
// Emitting a phase trigger is only half the story: it must RESOLVE faithfully. A trigger whose effect
// we can't fully model (an intervening-if we don't evaluate at the live resolution path, or a "may …
// if you do" rider) must route to the Arbiter no-op — NEVER fabricate (the legacy naive trigger.effect
// vocabulary that substring-matched a small draw/loseLife/gainLife and applied it UNCONDITIONALLY was
// the FP the adversarial review caught — Boundary Lands Ranger drew a card with no power-4 creature —
// and was DELETED in W4; unmodeled triggers keep the manual payload). These tests RESOLVE the stack and assert the OUTCOME, not just the emission.
describe("resolution: conditional phase triggers must NOT fabricate (CREED)", () => {
  // An intervening-if combat-begin draw whose condition is OUTSIDE the modeled board-query vocabulary (a
  // turn-event — the COMPOUND "if you gained and lost life this turn"), so the trigger must route to the
  // Arbiter no-op rather than the OLD naive fallback that drew a card regardless (the confirmed FP).
  // (Board-query conditions like "if you control a creature with power 4 or greater", the turn-event "if a
  // creature died this turn", AND the bare "if you gained life this turn" are NOW modeled and resolve via the
  // effect program — exercised in interveningIf.test.js / lifeGainedThisTurn.test.js; here we need a
  // still-unmodeled condition to guard the fallback.)
  const COND_DRAW = {
    id: "c-cond",
    name: "Testfall Conditional Draw",
    type: "Enchantment",
    oracle: "At the beginning of combat on your turn, if you gained and lost life this turn, draw a card.",
  };
  // An UNCONDITIONAL, fully-modeled combat-begin draw — proves the fix does NOT over-suppress a
  // legitimately-native phase trigger (it still resolves via the rich effect-program path).
  const PLAIN_DRAW = {
    id: "c-plain",
    name: "Testfall Plain Draw",
    type: "Enchantment",
    oracle: "At the beginning of combat on your turn, draw a card.",
  };

  function combatBeginState(card) {
    let state = placePerms(
      stateWith({ phase: "combat", step: "beginning-of-combat", activePlayer: "user", priorityHolder: "user" }),
      [permObj(card, "user", "p-src")],
    );
    // controller library has a card to draw; hand starts empty so a draw is observable
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "lib-x", name: "Card" }], hand: [] } } };
    return state;
  }

  it("FP GUARD — an intervening-if combat-begin trigger fires but resolves to a NO-OP (no draw)", () => {
    const out = runStepActions(combatBeginState(COND_DRAW));
    const trig = triggerOnStack(out);
    expect(trig, "the trigger still goes on the stack").toBeTruthy();
    // The fix: a clause-bearing naive-payload (intervening-if) trigger routes to the Arbiter no-op.
    expect(trig.payload.resolver).toBe("manual");
    // …and resolving it draws NOTHING (the card stays in the library, hand stays empty).
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.user.hand).toHaveLength(0);
    expect(resolved.players.user.library.map((c) => c.id)).toContain("lib-x");
  });

  it("no over-suppression — an UNCONDITIONAL modeled combat-begin draw DOES resolve (draws)", () => {
    const out = runStepActions(combatBeginState(PLAIN_DRAW));
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("lib-x");
  });
});
