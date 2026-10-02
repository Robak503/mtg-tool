/**
 * firebendingKeyword.test.js — the firebending keyword and its held mana (census slice 41).
 *
 * "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)"
 *
 * Two things had to be true for this to be worth crediting, and they are tested separately:
 *
 *   1. THE TRIGGER — synthesized from the printed keyword, like renown / mobilize / backup, because the whole
 *      ability lives inside reminder parens where the boundary-anchored trigger regex cannot reach it.
 *   2. THE DURATION — "lasts until end of combat" is a printed EXCEPTION to CR 500.4 (mana empties as each
 *      step and phase ends). Modeling this as a plain "add {R}" would have handed the player mana that
 *      evaporates at the end of the declare-attackers step, a step earlier than the card promises. Crediting
 *      the card while shipping that divergence is exactly the over-claim this grind keeps having to undo, so
 *      the hold is the reason the keyword is credited at all — not a refinement bolted on afterwards.
 *
 * The hold is a per-color CAP on what survives emptying, NOT a tagged sub-pool. That choice keeps every
 * existing payment path spending this mana unchanged (one currency, not two); the bounded imprecision it
 * costs is stated at gameEngine.emptyManaPools. What it can never do is preserve MORE than was promised,
 * which is the direction that would actually be dangerous — mana appearing from nowhere.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers, firebendingKeywordValue } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, nextStep, runStepActions, resolveTopOfStack, emptyManaPools } from "./gameEngine.js";

const REM = (n) => `Firebending ${n} (Whenever this creature attacks, add ${"{R}".repeat(n)}. This mana lasts until end of combat.)`;
const SAGE = { name: "Fire Sages", type: "Creature — Human Cleric", mana: "{1}{R}", power: 2, toughness: 2, keywords: [], oracle: REM(1) };

describe("the keyword value is read from the printed line", () => {
  it("parses a numeric N", () => {
    expect(firebendingKeywordValue(REM(1))).toBe(1);
    expect(firebendingKeywordValue(REM(2))).toBe(2);
  });

  it("CREED — the X form returns 0, so it can never synthesize a WRONG fixed amount of mana", () => {
    // The corpus prints "Firebending X, where X is this creature's power" (and X = experience counters, X =
    // creatures you control). The add-mana atom has no dynamic-amount shape, and guessing a number would add
    // the wrong quantity every single time. It must stay on the Arbiter.
    expect(firebendingKeywordValue("Firebending X, where X is this creature's power. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)")).toBe(0);
  });

  it("synthesizes the self-scoped attacks descriptor", () => {
    const t = detectTriggers(SAGE);
    expect(t[0]).toMatchObject({ event: "attacks", scope: "self", sourceText: "Firebending 1" });
    expect(t[0].effectClause).toBe("add {R}. this mana lasts until end of combat");
  });
});

describe("the printed sentence parses to a HELD add-mana atom", () => {
  it("carries holdUntilEndOfCombat", () => {
    const r = parseEffectClause("add {R}. this mana lasts until end of combat", "Creature");
    expect(r.confidence).toBe("high");
    expect(r.atoms[0]).toMatchObject({ op: "add-mana", holdUntilEndOfCombat: true });
    expect(r.atoms[0].mana.R).toBe(1);
  });

  it("a PLAIN ritual add is untouched — no hold, exactly as before this slice", () => {
    const r = parseEffectClause("add {B}{B}{B}", "Instant");
    expect(r.confidence).toBe("high");
    expect(r.atoms[0].op).toBe("add-mana");
    expect(r.atoms[0].holdUntilEndOfCombat).toBeUndefined();
  });
});

describe("classification", () => {
  it("the carrier flips native", () => {
    expect(classifyCard(SAGE)).toMatch(/^native/);
    expect(classifyCard({ ...SAGE, oracle: `${REM(1)}\n{1}{R}{R}: Put a +1/+1 counter on this creature.` })).toMatch(/^native/);
  });

  it("CREED — the X form stays parked", () => {
    expect(classifyCard({ ...SAGE, oracle: "Firebending X, where X is this creature's power. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)" })).not.toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...SAGE, oracle: `${REM(1)}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the mana is really added, really survives combat, and really expires", () => {
  function attackingBoard(n = 1) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const p = createPermanent({ id: "f", card: { ...SAGE, oracle: REM(n) }, controller: "user", summoningSick: false });
    let st = { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [p] } } };
    const atk = legalActionsForPlayer(st, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "f");
    st = dispatchAction(st, atk);
    // Attack triggers fire when the attacker declaration closes, not on the declare action itself. RE-POINTED (the attack-trigger
    // timing fix, CR 508.1m / 508.2): the engine's step advance closes the declaration and stacks the trigger INSIDE the declare
    // attackers step (it used to fire at the declare-blockers step entry), so the red is added there and the hold carries it
    // across that step's end.
    st = nextStep(st);
    let g = 0; while (st.stack.length && g++ < 10) st = resolveTopOfStack(st);
    return st;
  }

  it("attacking adds the mana", () => {
    const s = attackingBoard(1);
    expect(s.players.user.manaPool.R).toBe(1);
    expect(s.players.user.manaHold.R).toBe(1);
  });

  it("N=2 adds two", () => {
    expect(attackingBoard(2).players.user.manaPool.R).toBe(2);
  });

  it("THE POINT — it survives a step boundary that would empty ordinary mana", () => {
    const s = attackingBoard(1);
    // Same state, same emptying chokepoint, the only difference being which mana was promised to last.
    expect(emptyManaPools(s).players.user.manaPool.R).toBe(1);

    const ordinary = { ...s, players: { ...s.players, user: { ...s.players.user, manaHold: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    expect(emptyManaPools(ordinary).players.user.manaPool.R).toBe(0);
  });

  it("the hold NEVER preserves more than was promised — a floated Mountain's red still empties", () => {
    // Firebending 1 made one red; the player then taps for two more. Only the promised one survives.
    const s = attackingBoard(1);
    const floated = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 3 } } } };
    expect(emptyManaPools(floated).players.user.manaPool.R).toBe(1);
  });

  it("and it EXPIRES at end of combat — the half that makes this honest rather than a mana leak", () => {
    let s = attackingBoard(1);
    expect(s.players.user.manaPool.R).toBe(1);

    let guard = 0;
    while (guard++ < 30 && s.phase === "combat") {
      s = runStepActions(advanceStep(s));
      let h = 0; while (s.stack.length && h++ < 10) s = resolveTopOfStack(s);
    }
    expect(s.phase).not.toBe("combat");
    expect(s.players.user.manaHold.R).toBe(0);   // the hold is gone
    expect(s.players.user.manaPool.R).toBe(0);   // and so is the mana it was holding
  });

  it("it does not leak into the NEXT turn either", () => {
    let s = attackingBoard(1);
    const startTurn = s.turn;
    let guard = 0;
    while (guard++ < 60 && s.turn === startTurn) {
      s = runStepActions(advanceStep(s));
      let h = 0; while (s.stack.length && h++ < 10) s = resolveTopOfStack(s);
    }
    expect(s.turn).not.toBe(startTurn);
    expect(s.players.user.manaPool.R).toBe(0);
    expect(s.players.user.manaHold.R).toBe(0);
  });
});
