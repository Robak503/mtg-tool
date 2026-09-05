/**
 * NOT OF THIS WORLD — POD-SIM THREE · KT-9b (2026-09-05).
 *
 * "Counter target spell or ability that targets a permanent you control.
 *  This spell costs {7} less to cast if it targets a spell or ability that targets a creature you control with power 7 or greater."
 *
 * Two seams: (1) the SPELL-OR-ABILITY counter union with the targets-what predicate (an ability's recorded targets read
 * like a spell's); (2) a TARGET-CONDITIONAL cost reduction stamped on the program and settled per chosen target in the
 * cast lane — {7} against a spell aimed at a 2/2, {0} against one aimed at a 7-power creature. MV stays 7 (CR 202.3).
 *
 * Mutation-checked: see the run ledger (docs-sk42).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const NOTW = {
  id: "notw", name: "Not of This World", type: "Kindred Instant — Eldrazi", mana: "{7}", cmc: 7, colors: [],
  oracle: "Counter target spell or ability that targets a permanent you control.\nThis spell costs {7} less to cast if it targets a spell or ability that targets a creature you control with power 7 or greater.",
};

function cr(name, id, controller, power = 2) {
  return { id, card: { name, type: "Creature — Bear", power, toughness: power, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function spellOnStack(id, name, targets) {
  return {
    id, kind: "spell", controller: "ai", targets, cost: null,
    source: { id: `card-${id}`, name, type: "Instant", cmc: 1, colors: ["R"], oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectProgram({ type: "Instant", oracle: "Destroy target creature." }), controller: "ai", targets } },
  };
}
function abilityOnStack(id, targets) {
  return { id, kind: "triggered-ability", controller: "ai", source: { name: "Some Permanent" }, payload: { resolver: "manual" }, targets };
}
function responseState({ stack = [], userPool = {}, userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, stack,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [NOTW], battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}
const casts = (state) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter((c) => c.cardId === "notw");
const targetsOf = (acts) => acts.flatMap((a) => (a.targets || []).map((t) => t.id));
const T = (type, id) => ({ atomIndex: 0, type, id });

describe("parse + classify", () => {
  it("the counter union carries the targets-what filter; the reduction is STAMPED on the program; native-spell", () => {
    const p = parseEffectProgram(NOTW);
    const row = { confidence: p.confidence, atoms: p.atoms, tcr: p.targetConditionalReduction, tier: classifyCard({ ...NOTW, keywords: [] }) };
    console.log("  WITNESS notwParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toHaveLength(1);
    expect(row.atoms[0]).toMatchObject({ op: "counter-spell-or-ability", targetType: "spellOrStackAbility", targetsFilter: { permanent: { youControl: true } } });
    expect(row.tcr).toEqual({ amount: 7, targetsCreatureYouControlPowerAtLeast: 7 });
    expect(row.tier).toBe("native-spell");
  });
});

describe("cast lane — the target-conditional cost", () => {
  it("costs {7} against a spell aimed at my 2/2 (offered with 7 in pool, NOT with 0) — MV stays 7", () => {
    const bf = [cr("User Bear", "ub1", "user", 2)];
    const stack = [spellOnStack("kill", "Doom Blade", [T("creature", "ub1")])];
    const paid = casts(responseState({ stack, userBf: bf, userPool: { R: 7 } }));
    const row = { targets: targetsOf(paid), generic: paid[0]?.cost?.generic, cmc: paid[0]?.cmc, broke: casts(responseState({ stack, userBf: bf })).length };
    console.log("  WITNESS notwSeven", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.targets).toEqual(["kill"]);
    expect(row.generic).toBe(7);
    expect(row.cmc).toBe(7);
    expect(row.broke).toBe(0);
  });

  it("costs {0} against a spell aimed at my 7-power creature — offered with an EMPTY pool; layer-aware (a 5/5 with two +1/+1 counters qualifies)", () => {
    const big = [cr("User Titan", "ub7", "user", 7)];
    const stack = [spellOnStack("kill", "Doom Blade", [T("creature", "ub7")])];
    const free = casts(responseState({ stack, userBf: big }));
    const pumped = cr("User Five", "ub5", "user", 5);
    pumped.counters = { "+1/+1": 2 };
    const viaCounters = casts(responseState({ stack: [spellOnStack("kill2", "Doom Blade", [T("creature", "ub5")])], userBf: [pumped] }));
    const row = { targets: targetsOf(free), generic: free[0]?.cost?.generic, cmc: free[0]?.cmc, viaCounters: viaCounters.length };
    console.log("  WITNESS notwFree", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.targets).toEqual(["kill"]);
    expect(row.generic).toBe(0);
    expect(row.cmc).toBe(7);
    expect(row.viaCounters).toBe(1);
  });

  it("a 6-power creature does NOT earn the reduction (the boundary, seen-to-fail side)", () => {
    const stack = [spellOnStack("kill", "Doom Blade", [T("creature", "ub6")])];
    expect(casts(responseState({ stack, userBf: [cr("User Six", "ub6", "user", 6)] }))).toHaveLength(0);
  });
});

describe("resolution — the union", () => {
  it("counters a SPELL that targets my permanent (to its owner's graveyard) and never sees one aimed at the opponent's own creature", () => {
    const s = responseState({
      stack: [spellOnStack("mine", "Doom Blade", [T("creature", "ub1")]), spellOnStack("theirs", "Doom Blade", [T("creature", "ab1")])],
      userBf: [cr("User Bear", "ub1", "user")], aiBf: [cr("AI Bear", "ab1", "ai")], userPool: { R: 7 },
    });
    const acts = casts(s);
    expect(targetsOf(acts)).toEqual(["mine"]);
    const r = resolveTopOfStack(dispatchAction(s, acts[0]));
    const row = { stackLeft: r.stack.map((o) => o.id), aiGy: r.players.ai.graveyard.map((c) => c.name), bear: r.players.user.battlefield.some((p) => p.id === "ub1") };
    console.log("  WITNESS notwSpell", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.stackLeft).toEqual(["theirs"]);
    expect(row.aiGy).toEqual(["Doom Blade"]);
    expect(row.bear).toBe(true);
  });

  it("counters an ABILITY that targets my permanent (removed from the stack); one aimed at the opponent's own permanent is never offered", () => {
    const s = responseState({
      stack: [abilityOnStack("ab-mine", [T("creature", "ub1")]), abilityOnStack("ab-theirs", [T("creature", "ab1")])],
      userBf: [cr("User Bear", "ub1", "user")], aiBf: [cr("AI Bear", "ab1", "ai")], userPool: { R: 7 },
    });
    const acts = casts(s);
    expect(targetsOf(acts)).toEqual(["ab-mine"]);
    const r = resolveTopOfStack(dispatchAction(s, acts[0]));
    const row = { stackLeft: r.stack.map((o) => o.id), bear: r.players.user.battlefield.some((p) => p.id === "ub1") };
    console.log("  WITNESS notwAbility", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.stackLeft).toEqual(["ab-theirs"]);
    expect(row.bear).toBe(true);
  });

  it("an ability aimed at ME (a player, not a permanent) is not a legal target", () => {
    const s = responseState({ stack: [abilityOnStack("ab-face", [{ atomIndex: 0, type: "player", id: "user" }])], userBf: [cr("User Bear", "ub1", "user")], userPool: { R: 7 } });
    expect(casts(s)).toHaveLength(0);
  });
});
