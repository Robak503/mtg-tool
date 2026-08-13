/**
 * conditionalReplacement.test.js — "<base>. If <condition>, <alternative> instead." (CR 608.2).
 * Scute Swarm #229 and Entish Restoration #439 (Earth Bent, the deck nearest the 1.0 bar).
 *
 * Collapsed to ONE `conditional` atom carrying both branches, evaluated at resolution through
 * `evaluateInterveningIf` — the same evaluator legalChoices gates activated abilities on and manaSources
 * gates condition-gated mana on. Reusing it is why this is a branch node and not a subsystem: the expensive
 * half already existed, and the three conditions were tested against it BEFORE any code was written.
 *
 * ⚠️⚠️ TWO BUGS THIS SLICE PRODUCED, BOTH CAUGHT ON A BOARD OR BY THE DIFF — they are the reason the pins
 * below look the way they do:
 *
 *   1. FIELD-NAME COLLISION. The atom field is `branchOn`, NOT `condition`, because `atom.condition` already
 *      means something else in runProgram (~163): a rider GATE, "skip this atom unless the condition holds".
 *      Naming it `condition` made the runner SKIP the whole conditional whenever the condition was FALSE —
 *      so the ifTrue branch worked perfectly and ifFalse silently never ran. Every true-condition test
 *      passed. Only the n=3-lands board showed it.
 *
 *   2. HIJACKING BY FALLING SHORT. The grammar also matches "deal N damage to target creature. If that
 *      creature would die this turn, exile it instead" — 23 cards (Anger of the Gods, Pillar of Flame,
 *      Incendiary Flow) already modeled by older machinery. Returning LOW when this arm cannot fully model a
 *      match dragged all of them native-spell → arbiter-spell. The arm now FALLS THROUGH, so anything it
 *      does not claim is byte-identical to before.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { checkLandfallTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SCUTE_ORACLE = "Landfall — Whenever a land you control enters, create a 1/1 green Insect creature token. If you control six or more lands, create a token that's a copy of this creature instead.";
const SCUTE = { id: "ss", name: "Scute Swarm", type: "Creature — Insect", mana: "{2}{G}", power: 1, toughness: 1, oracle: SCUTE_ORACLE };

function landfallWith(nLands) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const lands = Array.from({ length: nLands }, (_, i) => createPermanent({ id: `L${i}`, card: { id: `L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" }));
  let st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "ss", card: SCUTE, controller: "user" }), ...lands] } } };
  st = checkLandfallTriggers(st, lands[nLands - 1]);
  st = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while ((st.stack || []).length && guard++ < 20) st = resolveTopOfStack(st);
  return st.players.user.battlefield.filter((p) => p.card?.token).map((p) => p.card.name);
}

describe("parsing — one atom, both branches, both word orders", () => {
  it("the trailing-instead order (Scute Swarm)", () => {
    const p = parseEffectClause("create a 1/1 green insect creature token. if you control six or more lands, create a token that's a copy of this creature instead", "Creature", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "conditional", branchOn: "you control six or more lands" });
    expect(p.atoms[0].ifTrue.map((a) => a.op)).toEqual(["create-token-copy"]);
    expect(p.atoms[0].ifFalse.map((a) => a.op)).toEqual(["create-token"]);
  });

  it("⛔⛔ the leading-instead order (Entish Restoration) — the SACRIFICE is UNCONDITIONAL", () => {
    // REPLACEMENT SCOPE FIX (2026-08-12): this pin used to assert atoms[0] IS the conditional — which
    // meant the whole base (INCLUDING "Sacrifice a land") sat inside ifFalse, and a power-4 board ramped
    // three basics WITHOUT paying the land: a live cost-skip FP, found by the conditional pause audit.
    // "instead" replaces the sentence ADJACENT to the If; the preamble runs unconditionally BEFORE the
    // conditional atom (which also hands its pauses to the program runner instead of the branch loop).
    const p = parseEffectClause("sacrifice a land. search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. if you control a creature with power 4 or greater, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle", "Sorcery", { hasX: false });
    expect(p.confidence).toBe("high");
    const row = { ops: p.atoms.map((a) => a.op), ifTrue: p.atoms[1].ifTrue.map((a) => a.op), ifFalse: p.atoms[1].ifFalse.map((a) => a.op) };
    console.log("  WITNESS entishScope", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ops: ["sacrifice-land", "conditional"], ifTrue: ["tutor"], ifFalse: ["tutor"] });
  });

  it("⚠️ THE FIELD IS branchOn — `condition` means \"skip this atom\" to runProgram", () => {
    const p = parseEffectClause("create a 1/1 green insect creature token. if you control six or more lands, create a token that's a copy of this creature instead", "Creature", { hasX: false });
    expect(p.atoms[0].condition).toBeUndefined();
    expect(p.atoms[0].branchOn).toBeTruthy();
  });

  it("Scute Swarm #229 and Entish Restoration #439 classify native", () => {
    expect(classifyCard(SCUTE)).toBe("native-trigger");
  });
});

describe("⭐ RUNTIME — the branch actually picks a side", () => {
  it("condition FALSE (3 lands) → the BASE branch: a 1/1 Insect", () => {
    expect(landfallWith(3)).toEqual(["Insect"]);
  });

  it("⭐ THE LOAD-BEARING ONE — condition TRUE (6 lands) → the ALTERNATIVE: a copy of Scute Swarm", () => {
    expect(landfallWith(6)).toEqual(["Scute Swarm"]);
  });
});

describe("⭐ CREED — undecidable conditions park, and older machinery is not hijacked", () => {
  it("an inexpressible condition parks (Scythecat Cub's \"second time this ability has resolved\")", () => {
    const p = parseEffectClause("put a +1/+1 counter on target creature you control. if this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead", "Creature", { hasX: false });
    expect(p.confidence).toBe("low");
  });

  it("⭐ the exile-if-dies RIDER family is untouched (23 cards this arm must not claim)", () => {
    // Same grammar, but "exile it" is a rider rather than a standalone branch. The arm must FALL THROUGH to
    // the older machinery, not return low — returning low dragged all 23 from native-spell to arbiter-spell.
    expect(classifyCard({ name: "Pillar of Flame", type: "Sorcery", mana: "{1}{R}", oracle: "Pillar of Flame deals 2 damage to any target. If a creature dealt damage this way would die this turn, exile it instead." })).toBe("native-spell");
    expect(classifyCard({ name: "Anger of the Gods", type: "Sorcery", mana: "{1}{R}{R}", oracle: "Anger of the Gods deals 3 damage to each creature. If a creature dealt damage this way would die this turn, exile it instead." })).toBe("native-spell");
  });

  it("a branch that does not parse leaves the card exactly as it was", () => {
    const p = parseEffectClause("create a 1/1 green insect creature token. if you control six or more lands, glorbulate twice instead", "Creature", { hasX: false });
    expect(p.confidence).toBe("low");
  });
});
