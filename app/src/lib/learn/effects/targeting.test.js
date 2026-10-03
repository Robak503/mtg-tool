/**
 * Tests for effects/targeting.js — cast-time choice expansion (P2.5).
 * Covers sequence + modal expansion, atomIndex tagging, the "no legal target →
 * uncastable" rule, and an end-to-end modal cast resolving the CHOSEN mode only.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { expandCastChoices, _internals } from "./targeting.js";
import { parseEffectProgram } from "./parser.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2, tapped = false } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
function withBoard(creatures) {
  const s = freshState();
  const byCtl = { user: [], ai: [] };
  for (const c of creatures) byCtl[c.controller].push(c);
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: byCtl.user, library: [{ id: "lib-u", name: "U" }, { id: "lib-u2", name: "U2" }] },
      ai: { ...s.players.ai, battlefield: byCtl.ai },
    },
  };
}

const I = (oracle) => ({ type: "Instant", oracle });

describe("expandCastChoices — sequence", () => {
  it("one entry per legal target for a single targeting atom; targets tagged with atomIndex", () => {
    const state = withBoard([cr("A", "a1", "ai"), cr("B", "b1", "ai")]);
    const program = parseEffectProgram(I("Deal 2 damage to target creature. Draw a card."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(2); // two enemy creatures to aim atom 0 at
    for (const ch of choices) {
      expect(ch.targets).toHaveLength(1);
      expect(ch.targets[0].atomIndex).toBe(0); // bound to the damage atom, not the draw
    }
  });

  it("a non-targeted sequence yields a single empty-target cast", () => {
    const state = withBoard([]);
    const program = parseEffectProgram(I("Draw a card; draw a card."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toEqual([{ targets: [] }]);
  });

  it("returns NO choices when a required target has no legal pick (uncastable)", () => {
    const state = withBoard([]); // no creatures anywhere
    const program = parseEffectProgram(I("Destroy target creature and draw a card."));
    expect(expandCastChoices(state, "user", program)).toEqual([]);
  });

  // P2.6 adversarial-review pin: a tapped-RESTRICTED removal that flipped HIGH only
  // because of a gain-life rider (Eriette's Lullaby) must NOT offer untapped creatures
  // as legal targets — the restriction has to survive the multi-atom expansion path.
  it("a tapped-restricted removal in a multi-atom program only offers tapped creatures", () => {
    const state = withBoard([cr("Tapped", "t1", "ai", { tapped: true }), cr("Untapped", "u1", "ai")]);
    const program = parseEffectProgram(I("Destroy target tapped creature. You gain 2 life."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(1);                  // only the tapped creature is legal
    expect(choices[0].targets.map(t => t.id)).toEqual(["t1"]);
    expect(choices[0].targets[0].atomIndex).toBe(0);  // bound to the destroy atom, not gain-life
  });
});

describe("expandCastChoices — counter target spell (P3.1, spell targets on the stack)", () => {
  // A stack object of kind "spell" (the counter's potential target).
  const spell = (id, name, type = "Instant", oracle = "") => ({
    id, kind: "spell", source: { id: `c-${id}`, name, type, oracle }, controller: "ai", targets: [], cost: null, payload: {},
  });
  const ability = (id) => ({ id, kind: "triggered-ability", source: { name: "Trig" }, controller: "ai", targets: [], cost: null, payload: {} });

  it("offers one cast per spell on the stack ('any' filter), tagged to the counter atom", () => {
    const state = freshState({ stack: [spell("s1", "Shock"), spell("s2", "Divination", "Sorcery")] });
    const program = parseEffectProgram(I("Counter target spell."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(2);
    expect(choices.map(c => c.targets[0].id).sort()).toEqual(["s1", "s2"]);
    expect(choices[0].targets[0]).toMatchObject({ type: "spell", atomIndex: 0 });
  });

  it("the noncreature filter (Negate) omits creature spells", () => {
    const state = freshState({ stack: [spell("inst", "Shock"), spell("crt", "Bear", "Creature — Bear")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target noncreature spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["inst"]);
  });

  it("the creature filter (Essence Scatter) only offers creature spells", () => {
    const state = freshState({ stack: [spell("inst", "Shock"), spell("crt", "Bear", "Creature — Bear")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target creature spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["crt"]);
  });

  it("never targets a non-spell stack object (a triggered/activated ability)", () => {
    const state = freshState({ stack: [ability("trig"), spell("s1", "Shock")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["s1"]);
  });

  it("excludes an on-card uncounterable spell (CR 701.6a)", () => {
    const state = freshState({ stack: [spell("safe", "Abrupt Decay", "Instant", "This spell can't be countered.")] });
    expect(expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")))).toEqual([]);
  });

  it("is uncastable (no choices) when the stack holds no legal spell target", () => {
    const state = freshState({ stack: [] });
    expect(expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")))).toEqual([]);
  });

  it("CAN target the caster's OWN spell on the stack (you may counter your own spell)", () => {
    const own = { id: "mine", kind: "spell", source: { id: "c-mine", name: "My Spell", type: "Sorcery", oracle: "" }, controller: "user", targets: [], cost: null, payload: {} };
    const state = freshState({ stack: [own] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["mine"]); // own spell is a legal target — correct MTG
  });
});

describe("expandCastChoices — modal", () => {
  it("surfaces one cast per (mode × legal target)", () => {
    const state = withBoard([cr("A", "a1", "ai"), cr("B", "b1", "ai")]);
    // mode 0 destroys a creature (2 targets), mode 1 draws (no target) → 2 + 1 = 3 casts
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(3);
    const mode0 = choices.filter(c => c.chosenMode === 0);
    const mode1 = choices.filter(c => c.chosenMode === 1);
    expect(mode0).toHaveLength(2);
    expect(mode1).toHaveLength(1);
    expect(mode1[0].targets).toEqual([]);
  });

  it("a mode whose only target is missing is simply omitted (other modes still castable)", () => {
    const state = withBoard([]); // no creatures → destroy mode uncastable
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(1);
    expect(choices[0].chosenMode).toBe(1); // only the draw mode survives
  });
});

describe("modal cast resolves the CHOSEN mode only (end-to-end)", () => {
  function castObj(program, { chosenMode, targets = [] }) {
    return { id: "stk-m", kind: "spell", source: { name: "Charm", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets, chosenMode } } };
  }

  it("choosing the destroy mode kills the creature and does NOT draw", () => {
    const state = withBoard([cr("Ogre", "ogre", "ai")]);
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const before = state.players.user.hand.length;
    const out = runEffectProgram(state, castObj(program, { chosenMode: 0, targets: [{ atomIndex: 0, type: "creature", id: "ogre" }] }));
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]);
    expect(out.players.user.hand.length).toBe(before); // draw mode NOT run
  });

  it("choosing the draw mode draws and does NOT touch the creature", () => {
    const state = withBoard([cr("Ogre", "ogre", "ai")]);
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const before = state.players.user.hand.length;
    const out = runEffectProgram(state, castObj(program, { chosenMode: 1, targets: [] }));
    expect(out.players.ai.battlefield.map(p => p.id)).toEqual(["ogre"]); // still alive
    expect(out.players.user.hand.length).toBe(before + 2);
  });
});

// CNT-2 — OPTIONAL single target ("Put a +1/+1 counter on up to one target creature"): the atom is
// flagged optional:true, so expandAtoms offers each legal creature PLUS a decline (no-target) cast and
// the spell stays castable on an empty board (CR 115.1b). Real targets come before the decline.
describe("expandCastChoices — optional single target (up to one, CNT-2)", () => {
  it("offers one cast per legal creature PLUS a trailing decline (empty-targets) cast", () => {
    const state = withBoard([cr("A", "a1", "user"), cr("B", "b1", "ai")]);
    const program = parseEffectProgram(I("Put a +1/+1 counter on up to one target creature."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(3);                                  // 2 creatures + 1 decline
    const tids = choices.map(c => c.targets.map(t => t.id).join(","));
    expect(tids).toEqual(expect.arrayContaining(["a1", "b1", ""]));   // both creatures + the no-target cast
    expect(choices[choices.length - 1].targets).toEqual([]);          // decline is LAST (target preferred)
    for (const ch of choices) for (const t of ch.targets) expect(t.atomIndex).toBe(0);
  });

  it("is STILL castable with an empty board — only the decline cast (CR 115.1b)", () => {
    const state = withBoard([]);
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Put a +1/+1 counter on up to one target creature.")));
    expect(choices).toEqual([{ targets: [] }]);
  });
});

describe("optional counter resolves to a counter or a clean no-op (end-to-end, CNT-2)", () => {
  function castObj(program, targets = []) {
    return { id: "stk-c", kind: "spell", source: { name: "Counter Spell", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets } } };
  }
  const PROGRAM = () => parseEffectProgram(I("Put a +1/+1 counter on up to one target creature."));

  it("targeting a creature adds the +1/+1 counter", () => {
    const state = withBoard([cr("Ogre", "ogre", "user")]);
    const out = runEffectProgram(state, castObj(PROGRAM(), [{ atomIndex: 0, type: "creature", id: "ogre" }]));
    expect(out.players.user.battlefield.find(p => p.id === "ogre").counters["+1/+1"]).toBe(1);
  });

  it("declining (no target) is a clean no-op — no counter, no crash", () => {
    const state = withBoard([cr("Ogre", "ogre", "user")]);
    const out = runEffectProgram(state, castObj(PROGRAM(), []));
    expect(out.players.user.battlefield.find(p => p.id === "ogre").counters["+1/+1"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------
// BOUNDED kCombinations / targetSubsets (D1 OOM fix) — the enumerator now stops at `limit` rows instead of
// materializing all C(n,k) index-arrays (C(32,10) ≈ 64.5M arrays ≈ 7-8GB in ONE legalActionsForPlayer call).
// These pin (a) the bounded prefix is BYTE-IDENTICAL to the unbounded enumeration (no behavior change) and
// (b) an OOM-shaped exact-k targetSubsets call returns capped output fast.
// ---------------------------------------------------------------------------------------------------------
describe("bounded kCombinations — first-N prefix identical to the unbounded enumeration", () => {
  const { kCombinations, targetSubsets, MAX_CAST_EXPANSIONS } = _internals;

  // Independent lexicographic reference (standard successor function) — no shared code with the DFS.
  function refCombos(n, k, count) {
    if (k <= 0 || k > n) return [];
    const out = [];
    const c = Array.from({ length: k }, (_, i) => i);
    while (out.length < count) {
      out.push(c.slice());
      let i = k - 1;
      while (i >= 0 && c[i] === n - k + i) i--;
      if (i < 0) break; // exhausted
      c[i]++;
      for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1;
    }
    return out;
  }

  it("bounded output === unbounded.slice(0, limit) for representative (n,k) × limits", () => {
    for (const [n, k] of [[6, 3], [8, 4], [10, 2], [5, 5], [7, 1]]) {
      const full = kCombinations(n, k); // unbounded (limit = Infinity default)
      expect(full).toEqual(refCombos(n, k, Infinity)); // the unbounded order itself is lex-ascending
      for (const limit of [1, 3, MAX_CAST_EXPANSIONS, full.length, full.length + 5]) {
        expect(kCombinations(n, k, limit)).toEqual(full.slice(0, limit));
      }
    }
  });

  it("every (n, k) up to n = 9 matches the independent reference — the pruned search drops nothing and keeps the order", () => {
    for (let n = 0; n <= 9; n++) {
      for (let k = 0; k <= n + 1; k++) {
        expect(kCombinations(n, k), `${n} choose ${k}`).toEqual(refCombos(n, k, Infinity));
        expect(kCombinations(n, k, 5), `${n} choose ${k}, limit 5`).toEqual(refCombos(n, k, 5));
      }
    }
  });

  it("a pick with fewer than `limit` combinations in total does not walk the dead-end prefixes (30 choose 29)", () => {
    // 30 choose 29 has 30 rows — under the cap, so the cap never ends the search. Unpruned, the DFS visits every
    // prefix of a 30-element set (2^30 ≈ 1.07 billion calls, ~10 s); with the bound it is a few hundred steps. This is the
    // shape that stalled a cdh game for over 100 s in ONE legalActions call (an X-target spell, X one short of the pool).
    const started = performance.now();
    const rows = kCombinations(30, 29, MAX_CAST_EXPANSIONS);
    const elapsedMs = performance.now() - started;
    expect(rows).toHaveLength(30);
    expect(rows[0]).toEqual(Array.from({ length: 29 }, (_, i) => i));       // leaves out 29
    expect(rows[29]).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));  // leaves out 0
    expect(elapsedMs).toBeLessThan(500);
  });

  it("limit ≤ 0 and degenerate (k>n, k≤0) yield [] — same as before", () => {
    expect(kCombinations(6, 3, 0)).toEqual([]);
    expect(kCombinations(6, 3, -1)).toEqual([]);
    expect(kCombinations(3, 5)).toEqual([]);
    expect(kCombinations(3, 0)).toEqual([]);
  });

  it("targetSubsets exact-k (min==max, the X-count caller) matches the full enumeration when under the cap", () => {
    const tagged = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, atomIndex: 0 }));
    const subs = targetSubsets(tagged, 3, 3); // C(5,3) = 10 < 64 — nothing capped
    expect(subs).toEqual(kCombinations(5, 3).map((c) => c.map((ix) => tagged[ix])));
  });

  it("threads REMAINING capacity across a k-boundary (minK < maxK): rows past the cap never materialize", () => {
    // n=60, minK=1, maxK=2: k=1 contributes 60 rows, then k=2 gets remaining capacity 4 → exactly the
    // first 4 pairs of the ascending enumeration, and the cap closes the list at 64.
    const tagged = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, atomIndex: 0 }));
    const subs = targetSubsets(tagged, 1, 2);
    expect(subs).toHaveLength(MAX_CAST_EXPANSIONS);
    expect(subs.slice(60).map((s) => s.map((t) => t.id))).toEqual([
      ["t0", "t1"], ["t0", "t2"], ["t0", "t3"], ["t0", "t4"],
    ]);
  });

  it("OOM guard: an (n=32, k=10)-shaped exact-k call returns the capped 64-row prefix in milliseconds", () => {
    // Pre-fix this materialized all C(32,10) = 64,512,240 index-arrays (~7-8GB) before the cap could bite.
    const tagged = Array.from({ length: 32 }, (_, i) => ({ id: `t${i}`, atomIndex: 0 }));
    const t0 = Date.now();
    const subs = targetSubsets(tagged, 10, 10); // the Rograkh-mirror shape (targetCountX, min==max)
    const elapsed = Date.now() - t0;
    expect(subs).toHaveLength(MAX_CAST_EXPANSIONS); // exactly the cap — row count == cap, nothing more
    // Byte-identical to the first 64 of the full ascending enumeration (via the independent reference).
    expect(subs.map((s) => s.map((t) => t.id))).toEqual(
      refCombos(32, 10, MAX_CAST_EXPANSIONS).map((c) => c.map((ix) => `t${ix}`))
    );
    expect(elapsed).toBeLessThan(2000); // was ~300s/OOM-class; generous CI margin, still 100x under
  });
});
