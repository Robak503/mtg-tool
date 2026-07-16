/**
 * ECHO (BLITZ EC-1, CR 702.30) — the KEYWORD→TRIGGER synthesis for "Echo {cost}" (Pouncing Jaguar /
 * Winding Wurm / Karmic Guide / Avalanche Riders). The keyword's real triggered ability lives entirely in
 * reminder parens ("At the beginning of your upkeep, if this came under your control since the beginning of
 * your most recent upkeep, sacrifice it unless you pay its echo cost."), so detectTriggers synthesizes a
 * "your upkeep" descriptor whose sentinel effectClause ("echo {cost}") the parser maps to the single `echo`
 * pausing atom. At fire time: the FIRST of the controller's upkeeps stamps echoDone and suspends on the
 * SHARED sac-unless-pay pay-or-sacrifice choice (fixed printed cost — no scaling); every LATER upkeep is a
 * clean no-op (the stamp is exactly CR 702.30c's single payment for a permanent under one controller).
 * CREED: {X}/hybrid echo costs are rejected (SAFE FN — the shared payer treats mana as fixed pips).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "../gameState.js";
import { parseEffectClause, programConfidence } from "./parser.js";
import { runEffectProgram, resolveSacUnlessPayChoice } from "./runProgram.js";
import { detectTriggers } from "../triggers.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const clause = (oracle) => parseEffectClause(oracle, "Creature", { hasX: false });
const soleOp = (prog) => (prog?.atoms?.length === 1 ? prog.atoms[0].op : null);

const POUNCING_JAGUAR = { id: "pj", name: "Pouncing Jaguar", type: "Creature — Cat", power: "2", toughness: "2", mana: "{G}",
  oracle: "Echo {G} (At the beginning of your upkeep, if this came under your control since the beginning of your most recent upkeep, sacrifice it unless you pay its echo cost.)" };

function stateWith({ mana = {}, echoDone = false } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: { id: "c-src", name: "Pouncing Jaguar", type: "Creature — Cat", power: "2", toughness: "2", oracle: "Echo {G}" }, controller: "user" });
  if (echoDone) src.echoDone = true;
  const pool = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...mana };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src], manaPool: pool } } };
}
const runAtom = (state, atom) =>
  runEffectProgram(state, { source: { name: "Pouncing Jaguar" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [], sourceId: "src" } } });

const ECHO_ATOM = clause("echo {G}").atoms[0];

describe("echo — parse shape + synthesis + classify", () => {
  it("the sentinel 'echo {G}' folds into ONE HIGH echo atom; {X}/hybrid are rejected", () => {
    const p = clause("echo {G}");
    expect(programConfidence(p)).toBe("high");
    expect(soleOp(p)).toBe("echo");
    expect(p.atoms[0].cost.mana).toMatchObject({ G: 1 });
    expect(soleOp(clause("echo {X}"))).not.toBe("echo");
    expect(soleOp(clause("echo {2/U}"))).not.toBe("echo");
  });
  it("synthesizes the your-upkeep trigger from the keyword; the body flips native", () => {
    const trigs = detectTriggers(POUNCING_JAGUAR).filter((t) => t.sourceText?.startsWith("Echo"));
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "upkeep", scope: "you", whose: "yours", effectClause: "echo {G}" });
    expect(classifyCard(POUNCING_JAGUAR)).toBe("native-body");
  });
});

describe("echo — the one-time pay-or-sacrifice", () => {
  it("FIRST upkeep: stamps echoDone and suspends on the printed-cost choice; PAY keeps it", () => {
    const paused = runAtom(stateWith({ mana: { G: 2 } }), ECHO_ATOM);
    expect(paused.pendingChoice?.kind).toBe("sac-unless-pay");
    expect(paused.pendingChoice.cost.mana).toMatchObject({ G: 1 });
    expect(findPermanent(paused, "src").permanent.echoDone).toBe(true);
    const kept = resolveSacUnlessPayChoice(paused, true);
    expect(kept.players.user.battlefield.map((p) => p.id)).toEqual(["src"]);
    expect(kept.players.user.manaPool.G).toBe(1); // {G} charged
  });
  it("DECLINE: the source sacrifices itself", () => {
    const paused = runAtom(stateWith({ mana: { G: 1 } }), ECHO_ATOM);
    const sacked = resolveSacUnlessPayChoice(paused, false);
    expect(sacked.players.user.battlefield).toHaveLength(0);
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-src");
  });
  it("LATER upkeeps (echoDone already stamped): a clean no-op — no choice, no sacrifice (CR 702.30c)", () => {
    const after = runAtom(stateWith({ mana: {} , echoDone: true }), ECHO_ATOM);
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["src"]);
  });
  it("SOURCE GONE: a clean no-op", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(runAtom(s, ECHO_ATOM).pendingChoice).toBeFalsy();
  });
});
