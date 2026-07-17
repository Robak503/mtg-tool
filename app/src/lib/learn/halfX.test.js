/**
 * halfX.test.js — HALF-X subsystem (CR 107.3 — "half X, rounded down/up").
 *
 * An effect amount = floor/ceil(N/2). The shared `halveAmount(value, mode)` helper (effects/atoms/shared.js)
 * is a HALVING post-transform applied to an already-resolved magnitude, wired into BOTH amount resolvers
 * (`effectiveAmount` for the amountX/printed leaf, `resolveScaledAmount` for the countContext/amountCount
 * branches) via an `atom.halve` ("floor"|"ceil") field. So half-of-anything — half the cast {X}, half a board
 * count, half a context magnitude — uses ONE rounding rule with no per-atom drift.
 *
 * BUILT (HALF-X-CREATE-TOKENS, this slice): The Goose Mother ({X}{G}{U} Legendary Creature — Bird Hydra,
 * Zaxara). Its ETB "create half X Food tokens, rounded up" is a half-X create-NAMED-token clause — the count is
 * the chosen {X} HALVED (ceil) via the shared halveAmount, on the existing create-named-token (Food) atom. TWO
 * seams ship together: (a) the parser/resolver gain a countX+halve path on create-named-token; (b) the ETB
 * trigger now THREADS the entering permanent's paid {X} into its OWN trigger context (resolvers stamps
 * perm.xValue; checkEnterTriggers injects it for the SELF-ETB only), which buildTriggerStack already reads into
 * ctx.xValue. With its attack reflexive-sac half already native (REFLEXIVE-SAC-BY-SUBTYPE), the WHOLE card flips
 * to native-trigger and resolves end-to-end (X=6 → 6 +1/+1 counters + 3 Food; the attack still sacs a Food to
 * draw). This is the FIRST ETB trigger to read the cast's {X} — closing the second gap noted below.
 *
 * BUILT (whole-card CREED-clean, prior slice): Contaminated Drink ({X}{U}{B} Instant — "Draw X cards, then
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
 * *   • Banshee — its damage is on an ACTIVATED ability with an {X} cost; activated {X} costs are unmodeled
 *     (parseActivatedAbilities drops any non-mana pip), so the whole ability is unparsed. (Not half-X.)
 *   • Eternal Flame — "half X … where X is the number of Mountains you control" is a COUNT-based X plus a
 *     dual-target ("target opponent or planeswalker" + "to you") two-pronged damage; both are out of scope.
 *   • Brass Infiniscope — a DELAYED cast-watcher ("When you next cast a spell with {X} this turn, …").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { radClauseParser } from "./effects/atoms/counters.js";
import { createNamedTokenClauseParser } from "./effects/atoms/tokens.js";
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

// ════════════════════════════════════════════════════════════════════════════════════
// HALF-X-CREATE-TOKENS — The Goose Mother (the flagship: half-X create-named-token ETB +
// ETB-trigger {X} threading). Whole-card native; both halves resolve end-to-end.
// ════════════════════════════════════════════════════════════════════════════════════
const GOOSE_MOTHER = {
  name: "The Goose Mother", type: "Legendary Creature — Bird Hydra", mana: "{X}{G}{U}", power: 2, toughness: 2,
  oracle: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card.",
};

describe("HALF-X-CREATE-TOKENS — createNamedTokenClauseParser recognizes the half-X-token form", () => {
  it("\"create half X Food tokens, rounded up\" → create-named-token(food) countX + halve:ceil", () => {
    expect(createNamedTokenClauseParser("create half x food tokens, rounded up")).toEqual({
      op: "create-named-token", token: "food", countX: true, halve: "ceil", targetType: null,
    });
  });
  it("\"create half X Treasure tokens, rounded down\" → countX + halve:floor (cross-token-type)", () => {
    expect(createNamedTokenClauseParser("create half x treasure tokens, rounded down")).toEqual({
      op: "create-named-token", token: "treasure", countX: true, halve: "floor", targetType: null,
    });
  });
  it("CREED: a half-X-token clause with NO stated rounding stays unmatched (ambiguous → Arbiter)", () => {
    expect(createNamedTokenClauseParser("create half x food tokens")).toBeNull();
  });
  it("CREED: an UNMODELED token type (Powerstone) stays unmatched even with rounding", () => {
    expect(createNamedTokenClauseParser("create half x powerstone tokens, rounded up")).toBeNull();
  });
  it("the fixed-N named-token form is untouched (no countX/halve)", () => {
    expect(createNamedTokenClauseParser("create two food tokens")).toEqual({
      op: "create-named-token", token: "food", count: 2, targetType: null,
    });
  });
});

describe("HALF-X-CREATE-TOKENS — The Goose Mother classifies + the ETB clause parses native", () => {
  it("classifies native-trigger (both halves modeled: half-X-Food ETB + attack reflexive-sac)", () => {
    expect(classifyCard(GOOSE_MOTHER)).toBe("native-trigger");
  });
  it("the ETB trigger's effect clause parses HIGH to a single half-X create-named-token atom", () => {
    const etb = detectTriggers(GOOSE_MOTHER).find((t) => t.event === "etb");
    expect(etb).toBeTruthy();
    const p = parseEffectClause(etb.effectClause, GOOSE_MOTHER.type);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "create-named-token", token: "food", countX: true, halve: "ceil", targetType: null },
    ]);
  });
});

describe("HALF-X-CREATE-TOKENS — The Goose Mother resolves at runtime (cast {X} → ceil(X/2) Food + X counters)", () => {
  const castForX = (X) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const spell = { ...GOOSE_MOTHER, id: "goose" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [spell], manaPool: { ...s.players.user.manaPool, G: 1, U: 1, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "goose" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s); // The Goose Mother enters (the ETB trigger lands in pendingTriggers)
    let guard = 0;
    while (((s.stack || []).length || (s.pendingTriggers || []).length) && guard++ < 30) {
      if ((s.pendingTriggers || []).length) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    return s;
  };
  const foods = (s) => (s.players.user.battlefield || []).filter((p) => p.card?.name === "Food");
  const goose = (s) => (s.players.user.battlefield || []).find((p) => p.card?.name === "The Goose Mother");

  it("X=6 (even): 6 +1/+1 counters on the Goose AND ceil(6/2)=3 Food tokens", () => {
    const s = castForX(6);
    expect(goose(s).counters?.["+1/+1"]).toBe(6);
    expect(foods(s).length).toBe(3);
  });
  it("X=5 (odd): 5 counters AND ceil(5/2)=3 Food (rounds UP)", () => {
    const s = castForX(5);
    expect(goose(s).counters?.["+1/+1"]).toBe(5);
    expect(foods(s).length).toBe(3);
  });
  it("X=1 (odd, the floor): 1 counter AND ceil(1/2)=1 Food (never rounds to 0)", () => {
    const s = castForX(1);
    expect(goose(s).counters?.["+1/+1"]).toBe(1);
    expect(foods(s).length).toBe(1);
  });
  it("the Food tokens are REAL Food artifacts (the attack half can sacrifice one)", () => {
    const s = castForX(4);
    const f = foods(s);
    expect(f.length).toBe(2);
    expect(f[0].card.type).toMatch(/Food/);
    expect(f[0].card.oracle).toContain("Sacrifice this artifact"); // real Food ability, not a fake body
  });
});

// ── CREED — the ETB {X} threading is SCOPED to the entering object's OWN trigger ─────────────
describe("HALF-X-CREATE-TOKENS — CREED: a bystander 'whenever a creature enters' watcher does NOT read the entrant's X", () => {
  // A separate watcher whose ETB effect is itself half-X (contrived) must resolve at ITS OWN xValue (0 here,
  // it was not cast for X), NOT the entering Goose's paid X. Proves the threading injects xValue ONLY for the
  // self-ETB (watcher.id === enteredPerm.id), never leaking the entrant's X into other watchers' effects.
  it("a bystanding half-X-Food-on-creature-enter watcher mints ZERO Food off the Goose's X=6 entry", () => {
    _resetIdsForTests();
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = createPermanent({
      id: "watch",
      card: { id: "cw", name: "Bystander", type: "Enchantment", oracle: "Whenever a creature you control enters, create half X Food tokens, rounded up." },
      controller: "user",
    });
    const gooseCard = { id: "cg", ...GOOSE_MOTHER };
    // The Goose enters carrying a paid X=6 (perm.xValue set by enterPermanent in real play; stamped here directly).
    const goosePerm = { ...createPermanent({ id: "g6", card: gooseCard, controller: "user" }), xValue: 6 };
    let s = {
      ...s0, activePlayer: "user",
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [watcher, goosePerm] } },
    };
    s = checkEnterTriggers(s, goosePerm);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while (((s.stack || []).length || (s.pendingTriggers || []).length) && guard++ < 30) {
      if ((s.pendingTriggers || []).length) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    const foods = (s.players.user.battlefield || []).filter((p) => p.card?.name === "Food");
    // The Goose's OWN ETB makes ceil(6/2)=3 Food (reads its threaded X). The Bystander reads ITS own xValue
    // (undefined → 0) → 0 Food. Total = 3, proving the bystander did NOT inherit the entrant's X=6 (would be 6).
    expect(foods.length).toBe(3);
  });
});

// ── CREED anti-FP pins — every PARKED half-X card stays non-native on its own blocker ──
describe("HALF-X — PARKED: the other 'half X' cards stay non-native (the build can't fabricate a flip)", () => {
  const parked = {
    "Wan Shi Tong, Librarian (opponent-search trigger undetected)": {
      name: "Wan Shi Tong, Librarian", type: "Legendary Creature — Bird Spirit", mana: "{X}{U}{U}", power: 0, toughness: 0,
      oracle: "Flash\nFlying, vigilance\nWhen Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down.\nWhenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card.",
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
