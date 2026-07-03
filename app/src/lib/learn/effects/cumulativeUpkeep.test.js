/**
 * CUMULATIVE UPKEEP (CR 702.24) — the KEYWORD→TRIGGER synthesis for "Cumulative upkeep {cost}" (Mystic
 * Remora, Glacial Chasm, Drifting Djinn). The keyword's real triggered ability lives entirely in reminder
 * parens ("At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless
 * you pay its upkeep cost for each age counter on it."), so detectTriggers synthesizes a "your upkeep"
 * descriptor whose sentinel effectClause ("cumulative upkeep {cost}") the parser maps to the single
 * `cumulative-upkeep` atom. At fire time the atom: (1) adds ONE age counter (doubler-aware), (2) reads the
 * new age-counter total, (3) SCALES the printed per-counter cost by that total, (4) suspends on the SHARED
 * sac-unless-pay pay-or-sacrifice choice (INVERTED polarity: pay → keep; decline/can't-afford → sacrifice).
 *
 * CREED: the ESCALATION is the whole point — turn 2 owes {2}, turn 3 owes {3}. A fixed-{1} model would be a
 * false positive (silently under-charging later turns). Hybrid / {X} per-counter costs are rejected (SAFE FN).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "../gameState.js";
import { parseEffectClause, programConfidence } from "./parser.js";
import { runEffectProgram, resolveSacUnlessPayChoice, autoPickSacUnlessPay } from "./runProgram.js";
import { detectTriggers } from "../triggers.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const clause = (oracle) => parseEffectClause(oracle, "Enchantment", { hasX: false });
const soleOp = (prog) => (prog?.atoms?.length === 1 ? prog.atoms[0].op : null);

function stateWith({ mana = {}, age = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({
    id: "src",
    card: { id: "c-src", name: "Mystic Remora", type: "Enchantment", oracle: "Cumulative upkeep {1}" },
    controller: "user",
  });
  if (age > 0) src.counters = { ...src.counters, age };
  const pool = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...mana };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src], manaPool: pool } } };
}
const runAtom = (state, atom) =>
  runEffectProgram(state, { source: { name: "Mystic Remora" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [], sourceId: "src" } } });

const CUK_ATOM = clause("cumulative upkeep {1}").atoms[0];

describe("cumulative-upkeep — parse shape", () => {
  it("folds the synthesized sentinel 'cumulative upkeep {1}' into ONE HIGH cumulative-upkeep atom", () => {
    const p = clause("cumulative upkeep {1}");
    expect(programConfidence(p)).toBe("high");
    expect(soleOp(p)).toBe("cumulative-upkeep");
    expect(p.atoms[0].cost).toEqual({ kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
  });

  it("accepts a colored per-counter cost ({1}{U})", () => {
    const p = clause("cumulative upkeep {1}{U}");
    expect(soleOp(p)).toBe("cumulative-upkeep");
    expect(p.atoms[0].cost.mana).toMatchObject({ generic: 1, U: 1 });
  });

  const drops = [
    ["an {X} per-counter cost is unmodeled", "cumulative upkeep {X}"],
    ["a hybrid per-counter cost can't be faithfully scaled", "cumulative upkeep {2/U}"],
    ["a trailing rider leaves residue", "cumulative upkeep {1}, then draw a card"],
  ];
  for (const [why, oracle] of drops) {
    it(`does NOT emit cumulative-upkeep: ${why}`, () => {
      expect(soleOp(clause(oracle))).not.toBe("cumulative-upkeep");
    });
  }
});

describe("cumulative-upkeep — keyword→trigger synthesis (detectTriggers)", () => {
  it("synthesizes a your-upkeep trigger from the printed keyword (real ability lives in reminder parens)", () => {
    const card = {
      type: "Enchantment",
      oracle: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)",
    };
    const trigs = detectTriggers(card).filter((t) => t.sourceText?.startsWith("Cumulative upkeep"));
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "upkeep", scope: "you", whose: "yours", effectClause: "cumulative upkeep {1}" });
  });
});

describe("cumulative-upkeep — runtime escalation + inverted polarity", () => {
  it("FIRST upkeep (0 age → 1): adds an age counter, suspends on a {1} pay-or-sac choice", () => {
    const paused = runAtom(stateWith({ mana: { U: 5 } }), CUK_ATOM);
    expect(findPermanent(paused, "src").permanent.counters.age).toBe(1);
    expect(paused.pendingChoice?.kind).toBe("sac-unless-pay");
    expect(paused.pendingChoice?.sourceId).toBe("src");
    expect(paused.pendingChoice.cost.mana.generic).toBe(1); // {1} × 1 age counter
  });

  it("THIRD upkeep (2 age → 3): the cost SCALES to {3} — the escalation the CREED forbids dropping", () => {
    const paused = runAtom(stateWith({ mana: { U: 5 }, age: 2 }), CUK_ATOM);
    expect(findPermanent(paused, "src").permanent.counters.age).toBe(3); // 2 existing + 1 placed this upkeep
    expect(paused.pendingChoice.cost.mana.generic).toBe(3); // {1} × 3 age counters — NOT a flat {1}
  });

  it("colored per-counter cost scales BOTH pips ({1}{U} at 2 age → {2}{U}{U})", () => {
    const atom = clause("cumulative upkeep {1}{U}").atoms[0];
    const paused = runAtom(stateWith({ mana: { U: 9 }, age: 1 }), atom);
    expect(findPermanent(paused, "src").permanent.counters.age).toBe(2);
    expect(paused.pendingChoice.cost.mana).toMatchObject({ generic: 2, U: 2 });
  });

  it("PAY + afford: the permanent SURVIVES and the escalated cost is charged", () => {
    const paused = runAtom(stateWith({ mana: { U: 3 }, age: 2 }), CUK_ATOM); // owes {3}
    const kept = resolveSacUnlessPayChoice(paused, true);
    expect(kept.pendingChoice).toBeFalsy();
    expect(kept.players.user.battlefield.map((p) => p.id)).toEqual(["src"]); // survives
    expect(kept.players.user.manaPool.U).toBe(0); // 3 mana spent
  });

  it("DECLINE: the source sacrifices ITSELF (battlefield → graveyard)", () => {
    const paused = runAtom(stateWith({ mana: { U: 3 } }), CUK_ATOM);
    const sacked = resolveSacUnlessPayChoice(paused, false);
    expect(sacked.players.user.battlefield).toHaveLength(0);
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-src");
  });

  it("CAN'T afford + forced 'pay': payManaCost fabricates nothing → the source is sacrificed", () => {
    const paused = runAtom(stateWith({ mana: { U: 1 }, age: 4 }), CUK_ATOM); // owes {5}, has 1
    expect(paused.pendingChoice.cost.mana.generic).toBe(5);
    const sacked = resolveSacUnlessPayChoice(paused, true);
    expect(sacked.players.user.battlefield).toHaveLength(0); // unpayable → sacrificed
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-src");
  });

  it("SOURCE GONE (already left the battlefield): a clean no-op — no counter, no pending choice", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const paused = runAtom(s, CUK_ATOM); // no "src" on any battlefield
    expect(paused.pendingChoice).toBeFalsy();
  });

  it("autoPick pays iff the escalated cost is affordable", () => {
    const owes3 = runAtom(stateWith({ mana: { U: 3 }, age: 2 }), CUK_ATOM).pendingChoice;
    expect(autoPickSacUnlessPay(stateWith({ mana: { U: 3 } }), owes3)).toBe(true);
    expect(autoPickSacUnlessPay(stateWith({ mana: { U: 2 } }), owes3)).toBe(false);
  });
});

describe("cumulative-upkeep — classify (Mystic Remora flips native)", () => {
  it("Mystic Remora (cumulative upkeep + taxed-draw) flips to native-trigger", () => {
    const remora = {
      type: "Enchantment",
      mana: "{U}",
      name: "Mystic Remora",
      oracle:
        "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.",
    };
    expect(classifyCard(remora)).toBe("native-trigger");
  });

  it("CREED near-miss: a cumulative-upkeep card with an {X} cost stays body-only (Arbiter)", () => {
    const xCost = {
      type: "Enchantment",
      mana: "{U}",
      name: "Fake Remora",
      oracle:
        "Cumulative upkeep {X} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.",
    };
    expect(classifyCard(xCost)).toBe("body-only");
  });
});
