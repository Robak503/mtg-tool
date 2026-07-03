/**
 * Rampaging Yao Guai — {X}{G}{G}{G} Creature. "Vigilance, trample. This creature enters with X +1/+1
 * counters on it. When this creature enters, destroy any number of target artifacts and/or enchantments
 * with total mana value X or less."
 *
 * The enters-with-X counters + vigilance/trample were already modeled; the BLOCK was the ETB trigger's
 * effect: a MULTI-COUNT ("any number of target") destroy of artifacts/enchantments whose CHOSEN SUBSET
 * must have TOTAL mana value ≤ the paid {X} (CR 601.2c — a restriction on the target SET, bound to the
 * creature's cast X threaded through the ETB self-trigger's context.xValue).
 *
 * Slice:
 *   - parser (removal.destroyExileClauseParser): the exact "any number … and/or … total mana value X or
 *     less" clause → { op:"destroy", targetType:"artifactOrEnchantment", minTargets:0, maxTargets, totalMvXConstraint }
 *   - targeting (expandAtoms): a totalMvXConstraint atom only offers subsets whose MV-SUM ≤ ctx.xValue
 *   - classify: the card flips body-only → native-trigger (the ETB trigger routes natively)
 *
 * CREED: the collective X-budget is enforced AT ENUMERATION — a subset over the budget is NEVER offered
 * (so the destroy resolver can never over-destroy past X, the forbidden partial-model). The destroy atom's
 * enemy-side intent (chooseTriggerTargets) aims it at an OPPONENT's permanents, never a friendly one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const YAO_CLAUSE = "destroy any number of target artifacts and/or enchantments with total mana value X or less";

const YAO = {
  name: "Rampaging Yao Guai",
  type: "Creature — Bear Mutant",
  mana: "{X}{G}{G}{G}",
  oracle:
    "Vigilance, trample\n" +
    "This creature enters with X +1/+1 counters on it.\n" +
    "When this creature enters, destroy any number of target artifacts and/or enchantments with total mana value X or less.",
};

// A battlefield with the controller's creature (the Yao source) + a set of opponent artifacts/enchantments,
// each carrying a `cmc` so the collective-MV filter can sum them. Returns { state } ready for expansion.
const withEnemyPermanents = (specs) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perms = specs.map((o) =>
    createPermanent({
      id: o.id,
      card: { id: `c-${o.id}`, name: o.id, type: o.type, oracle: "", cmc: o.cmc },
      controller: "ai",
      summoningSick: false,
    }),
  );
  return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: perms, hand: [] } } };
};

// The subsets offered by expansion, each as a sorted comma id-list (empty = the "destroy nothing" cast).
const comboSets = (combos) => combos.map((c) => (c.targets || []).map((t) => t.id).sort().join(",")).sort();

describe("Rampaging Yao Guai — parse shape", () => {
  it("the ETB clause parses HIGH → a multi-count destroy with the collective-X-MV marker", () => {
    const p = parseEffectClause(YAO_CLAUSE);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({
      op: "destroy",
      targetType: "artifactOrEnchantment",
      minTargets: 0,
      totalMvXConstraint: true,
    });
    expect(p.atoms[0].maxTargets).toBeGreaterThan(1); // unbounded "any number"
  });

  it("CREED near-miss — the SAME clause WITHOUT the 'total mana value X or less' tail stays LOW (Consign to Dust's base form is out of scope)", () => {
    const p = parseEffectClause("destroy any number of target artifacts and/or enchantments");
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });
});

describe("Rampaging Yao Guai — classification flip", () => {
  it("flips body-only → native-trigger (the ETB destroy routes natively)", () => {
    expect(classifyCard(YAO)).toBe("native-trigger");
  });

  it("the ETB trigger routes natively (HIGH + enemy-resolvable target)", () => {
    const trigs = detectTriggers(YAO);
    expect(trigs).toHaveLength(1);
    expect(trigs[0].event).toBe("etb");
    expect(trigs[0].effectClause).toBe(YAO_CLAUSE);
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
  });
});

describe("Rampaging Yao Guai — collective-X-MV subset enumeration (the CREED core)", () => {
  // The trigger flush parses the ISOLATED effect clause as an Instant (gameEngine.buildTriggerStack), so mirror
  // that here — NOT parseEffectProgram over the whole "When … enters, …" sentence (which the spell-body parser
  // rejects). hasX:false matches the ETB path (effectHasX is stamped only on selfCast triggers); the X budget
  // reaches the atom via ctx.xValue, not the parse.
  const prog = parseEffectClause(YAO_CLAUSE, "Instant", { hasX: false });

  it("with X=3, offers ONLY subsets whose total mana value is ≤ 3 (a1=1, a2=2, a3=3)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "a2", type: "Enchantment", cmc: 2 },
      { id: "a3", type: "Artifact", cmc: 3 },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], { xValue: 3 });
    // Legal subsets (MV-sum ≤ 3): {} , {a1}=1, {a2}=2, {a3}=3, {a1,a2}=3.  ILLEGAL: {a1,a3}=4, {a2,a3}=5, {a1,a2,a3}=6.
    expect(comboSets(combos)).toEqual(["", "a1", "a1,a2", "a2", "a3"]);
  });

  it("with X=0 (no X paid), the ONLY legal cast is the empty subset — destroy nothing (never a fabricated over-destroy)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "a2", type: "Enchantment", cmc: 2 },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], { xValue: 0 });
    expect(comboSets(combos)).toEqual([""]);
  });

  it("CREED — a subset EXCEEDING the X budget is NEVER offered (X=2 with two MV-2 permanents: no pair)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 2 },
      { id: "a2", type: "Enchantment", cmc: 2 },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], { xValue: 2 });
    // Each alone (MV 2) is legal; the PAIR (MV 4) exceeds X=2 → must be absent.
    expect(comboSets(combos)).toEqual(["", "a1", "a2"]);
    expect(combos.some((c) => (c.targets || []).length === 2)).toBe(false);
  });

  it("a high X admits the whole board (X=10, three low-MV permanents → the full 3-subset is offered)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "a2", type: "Enchantment", cmc: 2 },
      { id: "a3", type: "Artifact", cmc: 3 },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], { xValue: 10 });
    expect(comboSets(combos)).toContain("a1,a2,a3"); // total MV 6 ≤ 10 → the full sweep is legal
  });

  it("a NON-artifact/enchantment (a creature) is never an eligible target, even under budget", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "c1", type: "Creature — Golem", cmc: 1 },
    ]);
    const combos = expandCastChoices(s, "user", prog, [], { xValue: 5 });
    expect(combos.some((c) => (c.targets || []).some((t) => t.id === "c1"))).toBe(false);
    expect(comboSets(combos)).toEqual(["", "a1"]);
  });
});

describe("Rampaging Yao Guai — resolution (destroy the chosen legal subset)", () => {
  // The trigger flush parses the ISOLATED effect clause as an Instant (gameEngine.buildTriggerStack), so mirror
  // that here — NOT parseEffectProgram over the whole "When … enters, …" sentence (which the spell-body parser
  // rejects). hasX:false matches the ETB path (effectHasX is stamped only on selfCast triggers); the X budget
  // reaches the atom via ctx.xValue, not the parse.
  const prog = parseEffectClause(YAO_CLAUSE, "Instant", { hasX: false });

  it("resolving a chosen 2-permanent subset destroys BOTH (they leave the battlefield)", () => {
    const s = withEnemyPermanents([
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "a2", type: "Enchantment", cmc: 2 },
      { id: "a3", type: "Artifact", cmc: 3 },
    ]);
    const targets = [
      { type: "permanent", id: "a1", controller: "ai", atomIndex: 0 },
      { type: "permanent", id: "a2", controller: "ai", atomIndex: 0 },
    ];
    const out = runEffectProgram(s, { source: { name: "Rampaging Yao Guai" }, payload: { params: { program: prog, controller: "user", targets } } });
    expect(findPermanent(out, "a1")).toBeNull(); // destroyed
    expect(findPermanent(out, "a2")).toBeNull(); // destroyed
    expect(findPermanent(out, "a3")).not.toBeNull(); // untouched (not chosen)
    expect(out.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["c-a1", "c-a2"]);
  });

  it("resolving the empty subset destroys nothing (a legal 'destroy nothing' cast)", () => {
    const s = withEnemyPermanents([{ id: "a1", type: "Artifact", cmc: 1 }]);
    const out = runEffectProgram(s, { source: { name: "Rampaging Yao Guai" }, payload: { params: { program: prog, controller: "user", targets: [] } } });
    expect(findPermanent(out, "a1")).not.toBeNull();
    expect(out.players.ai.graveyard).toHaveLength(0);
  });
});

describe("Rampaging Yao Guai — end-to-end ETB trigger flush (the runtime path)", () => {
  const flushX = (x, specs) => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const yao = createPermanent({ id: "yao", card: { id: "c-yao", name: YAO.name, type: YAO.type, oracle: YAO.oracle }, controller: "user", summoningSick: true });
    const enemy = specs.map((o) => createPermanent({ id: o.id, card: { id: `c-${o.id}`, name: o.id, type: o.type, oracle: "", cmc: o.cmc }, controller: "ai", summoningSick: false }));
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [yao], hand: [] }, ai: { ...s0.players.ai, battlefield: enemy, hand: [] } } };
    // Build the ETB self-trigger the way checkEnterTriggers does — the paid {X} threaded into context.xValue.
    const d = detectTriggers(yao.card).find((t) => t.event === "etb");
    s = { ...s, pendingTriggers: [{ event: "etb", source: { permanentId: "yao", name: YAO.name }, controller: "user", descriptor: d, context: { xValue: x, triggeringPermanentId: "yao" }, targets: [], optional: false, payload: { resolver: "manual" } }] };
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while (s.stack.length && g++ < 40) s = resolveTopOfStack(s);
    return s;
  };

  it("X=3 → the auto-chooser destroys the MAXIMAL enemy sweep within budget (MV1 + MV2 = 3), sparing the over-budget MV5", () => {
    const out = flushX(3, [
      { id: "a1", type: "Artifact", cmc: 1 },
      { id: "a2", type: "Enchantment", cmc: 2 },
      { id: "a5", type: "Artifact", cmc: 5 },
    ]);
    expect(findPermanent(out, "a1")).toBeNull(); // destroyed (in budget)
    expect(findPermanent(out, "a2")).toBeNull(); // destroyed (in budget)
    expect(findPermanent(out, "a5")).not.toBeNull(); // CREED: MV5 alone exceeds X=3 → never destroyed
    expect(out.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["c-a1", "c-a2"]);
  });

  it("CREED — the destroy only ever hits an OPPONENT's permanents, never the controller's own artifact", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const yao = createPermanent({ id: "yao", card: { id: "c-yao", name: YAO.name, type: YAO.type, oracle: YAO.oracle }, controller: "user", summoningSick: true });
    const ownArt = createPermanent({ id: "own", card: { id: "c-own", name: "own", type: "Artifact", oracle: "", cmc: 1 }, controller: "user", summoningSick: false });
    const enemyArt = createPermanent({ id: "enemy", card: { id: "c-enemy", name: "enemy", type: "Artifact", oracle: "", cmc: 1 }, controller: "ai", summoningSick: false });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [yao, ownArt], hand: [] }, ai: { ...s0.players.ai, battlefield: [enemyArt], hand: [] } } };
    const d = detectTriggers(yao.card).find((t) => t.event === "etb");
    s = { ...s, pendingTriggers: [{ event: "etb", source: { permanentId: "yao", name: YAO.name }, controller: "user", descriptor: d, context: { xValue: 5, triggeringPermanentId: "yao" }, targets: [], optional: false, payload: { resolver: "manual" } }] };
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while (s.stack.length && g++ < 40) s = resolveTopOfStack(s);
    expect(findPermanent(s, "own")).not.toBeNull();  // the controller's OWN artifact is never destroyed (enemy-side intent)
    expect(findPermanent(s, "enemy")).toBeNull();    // the opponent's artifact is destroyed
  });

  it("X=0 → the trigger goes on the stack but destroys nothing (empty is the only legal subset)", () => {
    const out = flushX(0, [{ id: "a1", type: "Artifact", cmc: 1 }]);
    expect(findPermanent(out, "a1")).not.toBeNull();
    expect(out.players.ai.graveyard).toHaveLength(0);
  });
});
