/**
 * halfX.test.js — HALF-X subsystem (CR 107.3 — "half X, rounded down/up").
 *
 * An effect amount = floor/ceil(N/2). The shared `halveAmount(value, mode)` helper (effects/atoms/shared.js)
 * is a HALVING post-transform applied to an already-resolved magnitude, wired into BOTH amount resolvers
 * (`effectiveAmount` for the amountX/printed leaf, `resolveScaledAmount` for the countContext/amountCount
 * branches) via an `atom.halve` ("floor"|"ceil") field. So half-of-anything — half the cast {X}, half a board
 * count, half a context magnitude — uses ONE rounding rule with no per-atom drift.
 *
 * BUILT (whole-card CREED-clean, this slice): Contaminated Drink ({X}{U}{B} Instant — "Draw X cards, then
 * you get half X rad counters, rounded up"). The draw half is the existing amountX draw; the new piece is the
 * HALF-X rad atom (rad now resolves its amount via resolveScaledAmount, gaining amountX + halve). The cast {X}
 * threads to the effect program (ctx.xValue), so the rad count is ceil(X/2) at resolution — verified both even
 * and odd. This flips it arbiter-spell → native-spell.
 *
 * BUILT later (the SELF-CAST trigger subsystem — see zaxaraHydras.test.js): Hydroid Krasis. Its "When you cast
 * THIS spell, you gain half X life and draw half X cards. Round down each time." is the SPELL's own cast trigger;
 * the self-cast event (checkCastTriggers' self-cast block) now fires it, threading the cast's X so the half-X
 * gain/draw resolves. It is therefore NO LONGER a parked anti-FP pin here.
 *
 * PARKED — every OTHER "half X" corpus card stays non-native on an independent, NON-half-X blocker (so the
 * half-X build can never fabricate a native flip on its own; the parked anti-FP pins below prove it):
 *   • Wan Shi Tong, Librarian — its ETB half-X draw would resolve, BUT its 2nd trigger ("Whenever an opponent
 *     searches their library, …") is UNDETECTED, so allTriggerSentencesModeled fails (detected≠shaped). Also,
 *     an ETB trigger doesn't thread the cast's {X} (checkEnterTriggers carries no xValue) — a second gap.
 *   • The Goose Mother — its attack trigger ("you may sacrifice a Food. If you do, draw a card") NOW routes
 *     natively (REFLEXIVE-SAC-BY-SUBTYPE), BUT the "create half X Food tokens" ETB is an unmodeled half-X
 *     create-token clause (a separate subsystem) → the card stays body-only on THAT blocker.
 *   • Banshee — its damage is on an ACTIVATED ability with an {X} cost; activated {X} costs are unmodeled
 *     (parseActivatedAbilities drops any non-mana pip), so the whole ability is unparsed. (Not half-X.)
 *   • Eternal Flame — "half X … where X is the number of Mountains you control" is a COUNT-based X plus a
 *     dual-target ("target opponent or planeswalker" + "to you") two-pronged damage; both are out of scope.
 *   • Brass Infiniscope — a DELAYED cast-watcher ("When you next cast a spell with {X} this turn, …").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { radClauseParser } from "./effects/atoms/counters.js";
import { halveAmount } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (verified vs the bundled local index), verbatim.
const CONTAMINATED_DRINK = {
  name: "Contaminated Drink", type: "Instant", mana: "{X}{U}{B}",
  oracle: "Draw X cards, then you get half X rad counters, rounded up.",
};

// ── halveAmount — the CR 107.3 rounding primitive ──────────────────────────────────
describe("HALF-X — halveAmount(value, mode) rounds per CR 107.3", () => {
  it("floor (rounded down): odd halves down, even halves exactly", () => {
    expect(halveAmount(5, "floor")).toBe(2); // 2.5 → 2
    expect(halveAmount(4, "floor")).toBe(2);
    expect(halveAmount(1, "floor")).toBe(0); // 0.5 → 0
    expect(halveAmount(0, "floor")).toBe(0);
  });
  it("ceil (rounded up): odd halves up, even halves exactly", () => {
    expect(halveAmount(5, "ceil")).toBe(3); // 2.5 → 3
    expect(halveAmount(4, "ceil")).toBe(2);
    expect(halveAmount(1, "ceil")).toBe(1); // 0.5 → 1
    expect(halveAmount(0, "ceil")).toBe(0);
  });
  it("no mode / unknown mode is a pass-through (never halves) — so every non-half-X caller is unchanged", () => {
    expect(halveAmount(5)).toBe(5);
    expect(halveAmount(5, undefined)).toBe(5);
    expect(halveAmount(5, "nope")).toBe(5);
  });
  it("never fabricates: a null/negative/NaN input floors at 0, never NaN", () => {
    expect(halveAmount(null, "ceil")).toBe(0);
    expect(halveAmount(undefined, "floor")).toBe(0);
    expect(halveAmount(-4, "ceil")).toBe(0);
  });
});

// ── the HALF-X rad parser ──────────────────────────────────────────────────────────
describe("HALF-X — radClauseParser recognizes the half-X rad form with rounding", () => {
  it("\"you get half X rad counters, rounded up\" → amountX + halve:ceil", () => {
    expect(radClauseParser("you get half X rad counters, rounded up")).toEqual({
      op: "rad", amountX: true, halve: "ceil", who: "controller", targetType: null,
    });
  });
  it("\"you get half X rad counters, rounded down\" → amountX + halve:floor", () => {
    expect(radClauseParser("you get half X rad counters, rounded down")).toEqual({
      op: "rad", amountX: true, halve: "floor", who: "controller", targetType: null,
    });
  });
  it("CREED: a half-X rad with NO stated rounding stays unmatched (ambiguous → Arbiter)", () => {
    expect(radClauseParser("you get half X rad counters")).toBeNull();
  });
  it("CREED: the fixed-N rad form is untouched (no halve field)", () => {
    expect(radClauseParser("you get two rad counters")).toEqual({
      op: "rad", amount: 2, who: "controller", targetType: null,
    });
  });
});

// ── Contaminated Drink — the BUILT card ────────────────────────────────────────────
describe("HALF-X — Contaminated Drink classifies + parses native", () => {
  it("classifies native-spell (draw X + half-X rad both modeled)", () => {
    expect(classifyCard(CONTAMINATED_DRINK)).toBe("native-spell");
  });
  it("parses HIGH to a 2-atom program: draw(amountX) then rad(amountX, halve:ceil)", () => {
    const prog = parseEffectProgram(CONTAMINATED_DRINK);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([
      { op: "draw", targetType: null, amountX: true },
      { op: "rad", amountX: true, halve: "ceil", who: "controller", targetType: null },
    ]);
  });
});

// ── Contaminated Drink — RUNTIME (cast → resolve, both even/odd X) ──────────────────
describe("HALF-X — Contaminated Drink resolves at runtime: draw X + ceil(X/2) rad", () => {
  const castForX = (X) => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const spell = { ...CONTAMINATED_DRINK, id: "cd" };
    const library = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, name: "Island", type: "Land", oracle: "" }));
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [spell], library, manaPool: { ...s.players.user.manaPool, U: 1, B: 1, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "cd" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s);
    return s;
  };

  it("X=5 (odd): draws 5, gains ceil(5/2)=3 rad counters", () => {
    const s = castForX(5);
    expect(s.players.user.hand.length).toBe(5);
    expect(s.players.user.radCounters).toBe(3);
  });
  it("X=4 (even): draws 4, gains ceil(4/2)=2 rad counters", () => {
    const s = castForX(4);
    expect(s.players.user.hand.length).toBe(4);
    expect(s.players.user.radCounters).toBe(2);
  });
  it("X=1 (odd, the floor): draws 1, gains ceil(1/2)=1 rad counter (never rounds to 0)", () => {
    const s = castForX(1);
    expect(s.players.user.hand.length).toBe(1);
    expect(s.players.user.radCounters).toBe(1);
  });
  it("X=2 (even): draws 2, gains ceil(2/2)=1 rad counter", () => {
    const s = castForX(2);
    expect(s.players.user.hand.length).toBe(2);
    expect(s.players.user.radCounters).toBe(1);
  });
});

// ── CREED anti-FP pins — every PARKED half-X card stays non-native on its own blocker ──
describe("HALF-X — PARKED: the other 'half X' cards stay non-native (the build can't fabricate a flip)", () => {
  const parked = {
    "Wan Shi Tong, Librarian (opponent-search trigger undetected)": {
      name: "Wan Shi Tong, Librarian", type: "Legendary Creature — Bird Spirit", mana: "{X}{U}{U}", power: 0, toughness: 0,
      oracle: "Flash\nFlying, vigilance\nWhen Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down.\nWhenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card.",
    },
    "The Goose Mother (half-X-Food ETB unmodeled; attack sac-Food trigger now native via REFLEXIVE-SAC-BY-SUBTYPE)": {
      name: "The Goose Mother", type: "Legendary Creature — Bird Hydra", mana: "{X}{G}{U}", power: 2, toughness: 2,
      oracle: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card.",
    },
    "Banshee (activated {X} cost unmodeled)": {
      name: "Banshee", type: "Creature — Spirit", mana: "{2}{B}{B}", power: 0, toughness: 1,
      oracle: "{X}, {T}: This creature deals half X damage, rounded down, to any target, and half X damage, rounded up, to you.",
    },
    "Eternal Flame (count-based X + dual-target damage)": {
      name: "Eternal Flame", type: "Sorcery", mana: "{2}{R}{R}",
      oracle: "Eternal Flame deals X damage to target opponent or planeswalker and half X damage, rounded up, to you, where X is the number of Mountains you control.",
    },
    "Brass Infiniscope (delayed cast-watcher)": {
      name: "Brass Infiniscope", type: "Artifact", mana: "{4}",
      oracle: "{T}: Add {C}{C}. When you next cast a spell with {X} in its mana cost this turn, you draw a card and gain half X life, rounded down.",
    },
  };
  for (const [label, card] of Object.entries(parked)) {
    it(`${label} stays non-native`, () => {
      expect(classifyCard(card)).not.toMatch(/^native/);
    });
  }
});
