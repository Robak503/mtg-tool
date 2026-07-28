/**
 * counterStackAbility.test.js — STIFLE-CLASS (CR 701.5a): "Counter target activated or triggered ability."
 *
 * 0 native / 21 parked before this slice. The counter family is spell-shaped from end to end — it looks up
 * `o.kind === "spell"`, re-checks a spellFilter against a CARD, and routes the countered object to a
 * graveyard — so it could never reach an ABILITY waiting on the stack. An ability has no card and simply
 * ceases to exist when countered, which is why this is its own op rather than a counter variant.
 *
 * MANA ABILITIES ARE UNREACHABLE BY CONSTRUCTION, and that is the RULE, not a gap: a mana ability never uses
 * the stack (CR 605.3a), so it is never a stack object and can never be enumerated as a target. Stifle's
 * printed reminder text says exactly this. No gate is needed and none was added — a gate would imply the
 * possibility exists.
 *
 * NOT CLAIMED: Tale's End ("counter target activated ability, triggered ability, OR LEGENDARY SPELL") spans
 * two target classes in one atom and stays low → Arbiter. Pinned below so a later "just add spells to the
 * union" edit has to confront it deliberately.
 *
 * Flips Stifle #4619, Bind #15211, Trickbind, and Sublime Epiphany #1709 (the top-2500 carrier).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { stackResolvers } from "./effects/atoms/stack.js";
import { _resetIdsForTests, createGameState, createStackObject } from "./gameState.js";

function stacked() {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const src = (name) => ({ id: `c-${name}`, name, type: "Creature — Bear", oracle: "" });
  return {
    ...s0,
    stack: [
      createStackObject({ id: "trg", kind: "triggered-ability", source: src("Trigger Source"), controller: "ai1" }),
      createStackObject({ id: "act", kind: "activated-ability", source: src("Activated Source"), controller: "ai1" }),
      createStackObject({ id: "spl", kind: "spell", source: { id: "c-bolt", name: "Bolt", type: "Instant", oracle: "" }, controller: "ai1" }),
    ],
  };
}

const ids = (s) => (s.stack || []).map((o) => o.id).sort();
const counter = (s, targetId, abilityKinds) =>
  stackResolvers["counter-ability"](s, { op: "counter-ability", abilityKinds }, { controller: "user", targets: [{ type: "stackAbility", id: targetId }] });

describe("parse", () => {
  it("the union form carries BOTH ability kinds (Stifle / Sublime Epiphany)", () => {
    const p = parseEffectClause("counter target activated or triggered ability");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "counter-ability", targetType: "stackAbility", abilityKinds: ["activated-ability", "triggered-ability"] }]);
  });

  it("the single-kind forms narrow correctly (Bind)", () => {
    expect(parseEffectClause("counter target activated ability").atoms[0].abilityKinds).toEqual(["activated-ability"]);
    expect(parseEffectClause("counter target triggered ability").atoms[0].abilityKinds).toEqual(["triggered-ability"]);
  });

  it("REGRESSION PIN — the spell counter is untouched", () => {
    expect(parseEffectClause("counter target spell").atoms)
      .toEqual([{ op: "counter", spellFilter: "any", targetType: "spell" }]);
  });
});

describe("enumeration — abilities on the stack, never spells", () => {
  it("offers both abilities and NOT the spell", () => {
    const got = enumerateTargets(stacked(), "user", { targetType: "stackAbility" }, [], {}).map((t) => t.id).sort();
    expect(got).toEqual(["act", "trg"]);
  });

  it("the kind filter narrows the offer", () => {
    const got = enumerateTargets(stacked(), "user", { targetType: "stackAbility", abilityKinds: ["triggered-ability"] }, [], {}).map((t) => t.id);
    expect(got).toEqual(["trg"]);
  });

  it("a SPELL counter still sees only the spell (no cross-contamination)", () => {
    const got = enumerateTargets(stacked(), "user", { targetType: "spell", spellFilter: "any" }, [], {}).map((t) => t.id);
    expect(got).toEqual(["spl"]);
  });
});

describe("RUNTIME — the ability leaves the stack and nothing else moves", () => {
  it("counters the triggered ability, leaving the activated ability and the spell", () => {
    expect(ids(counter(stacked(), "trg"))).toEqual(["act", "spl"]);
  });

  it("THE LOAD-BEARING ONE — a countered ability produces NO graveyard card (it is not an object)", () => {
    const s = counter(stacked(), "trg");
    for (const pid of Object.keys(s.players)) {
      expect((s.players[pid].graveyard || []).some((c) => c.id === "trg")).toBe(false);
    }
  });

  it("the kind filter is re-checked at resolution — a wrong-kind target fizzles, removing nothing", () => {
    // CR 608.2b: the ability may have resolved or been countered in response. A fizzle must not remove some
    // unrelated stack object.
    expect(ids(counter(stacked(), "act", ["triggered-ability"]))).toEqual(["act", "spl", "trg"]);
  });

  it("a target already gone from the stack is a clean fizzle", () => {
    expect(ids(counter(stacked(), "ghost"))).toEqual(["act", "spl", "trg"]);
  });
});

describe("classification", () => {
  const spell = (name, oracle, mana = "{U}") => ({ name, type: "Instant", mana, keywords: [], oracle });

  it("Stifle flips", () => {
    expect(classifyCard(spell("Stifle", "Counter target activated or triggered ability."))).toMatch(/^native/);
  });

  it("CREED — Tale's End's three-way union spanning SPELLS is not claimed", () => {
    expect(classifyCard(spell("Tale's End", "Counter target activated ability, triggered ability, or legendary spell.")))
      .not.toMatch(/^native/);
  });
});
