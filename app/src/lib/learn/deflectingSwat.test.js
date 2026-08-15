/**
 * deflectingSwat.test.js — ⭐ RETARGET (CR 115.7): "you may choose new targets for target spell or ability."
 *
 * Deflecting Swat (Dragons residue slice, 2026-08-15). The whole card IS the retarget: line 1 is the
 * free-if-commander alt cost (already modeled — the Fierce Guardianship shape; the OFFER graduation
 * lives in altCostOffer.test.js), line 2 is the body this file witnesses:
 *
 *   - parse: the retarget atom (op "retarget", targetType "spellOrStackAbility", optional — CR 115.7d).
 *   - enumeration: the STACK-WIDE union — spells AND activated/triggered abilities are legal targets,
 *     and an UNCOUNTERABLE spell is still offered (retargeting is not countering; notCounter rides the
 *     spec so the CR 701.6a exclusions never narrow the pool).
 *   - resolution: the targeted spell's own targets are re-picked off the LIVE board via
 *     expandCastChoices from the TARGETED SPELL'S controller's perspective; the deterministic house
 *     policy deflects away from the retargeter's stuff, and every no-better-option path DECLINES
 *     (keeps the printed targets — always legal for a "may", CR 115.7d), never fabricates.
 *
 * Mutation-checked (2026-08-15): the write-back in applyRetarget disabled (`if (false && ...)` around the
 * stack splice) → the end-to-end witness dies (the destroy still resolves on the user's bear); the
 * `originals.some(isMine)` decline arm disabled → the not-aimed-at-me control dies (it retargets a spell
 * that never touched the retargeter). Both restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const SWAT_ORACLE = "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.";

function cr(name, id, controller) {
  return { id, card: { name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function withBoard(creatures) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const byCtl = { user: [], ai: [] };
  for (const c of creatures) byCtl[c.controller].push(c);
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: byCtl.user },
      ai: { ...s.players.ai, battlefield: byCtl.ai },
    },
  };
}

/** A spell on the stack carrying a REAL effect-program payload (the shape the cast path builds). */
function stackSpell(id, name, oracle, controller, targets, extraSource = {}) {
  const program = parseEffectProgram(I(oracle));
  return {
    id, kind: "spell", controller, targets,
    source: { name, type: "Instant", oracle, ...extraSource },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets } },
  };
}

/** Resolve Swat's program as `controller`, aimed at stack object `targetId`, answering the may with `doIt`. */
function resolveSwat(state, controller, targetId, doIt = true) {
  const program = parseEffectProgram(I(SWAT_ORACLE));
  const paused = runEffectProgram(state, {
    id: "swat-stk", kind: "spell", controller, source: { name: "Deflecting Swat" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets: [{ atomIndex: 0, type: "spell", id: targetId }] } },
  });
  // The printed "may" pauses as an optional-effect choice (α2); answering it runs the retarget atom.
  expect(paused.pendingChoice).toMatchObject({ kind: "optional-effect", controller, effectOp: "retarget" });
  return resolveOptionalChoice(paused, doIt);
}

describe("RETARGET — parse + cast-time enumeration (the stack union)", () => {
  it("⭐ Deflecting Swat parses HIGH: one retarget atom + the free-if-commander altCost", () => {
    const p = parseEffectProgram(I(SWAT_ORACLE));
    const row = { confidence: programConfidence(p), atoms: p.atoms, altCost: p.altCost };
    console.log("  WITNESS swatParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "retarget", targetType: "spellOrStackAbility", optional: true }]);
    expect(row.altCost).toEqual({ kind: "free", condition: "controlCommander" });
  });

  it("enumerates BOTH stack spells and stack abilities — and an UNCOUNTERABLE spell stays offered (not a counter)", () => {
    const base = withBoard([cr("AI Bear", "ab1", "ai")]);
    const s = {
      ...base,
      stack: [
        stackSpell("s-spell", "Shock", "Shock deals 2 damage to any target.", "ai", [{ atomIndex: 0, type: "creature", id: "ab1" }]),
        stackSpell("s-unc", "Supreme Verdict", "This spell can't be countered.\nDestroy all creatures.", "ai", [], { oracle_text: "This spell can't be countered.\nDestroy all creatures." }),
        { id: "s-abil", kind: "triggered-ability", controller: "ai", source: { name: "Some Permanent" }, payload: { resolver: "manual" }, targets: [] },
      ],
    };
    const combos = expandCastChoices(s, "user", parseEffectProgram(I(SWAT_ORACLE)));
    const offered = combos.flatMap((c) => c.targets.map((t) => t.id)).sort();
    console.log("  WITNESS swatUnion", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    // The full stack union: the plain spell, the can't-be-countered spell (CR 701.6a never narrows a
    // retarget), AND the triggered ability. A counter atom on the same board would drop "s-unc".
    expect(offered).toEqual(["s-abil", "s-spell", "s-unc"]);
    const counterCombos = expandCastChoices(s, "user", parseEffectProgram(I("Counter target spell.")));
    expect(counterCombos.flatMap((c) => c.targets.map((t) => t.id))).toEqual(["s-spell"]); // the seen-to-fail control: a real counter IS narrowed
  });

  it("no stack object → Swat has no legal target (not castable), the empty-stack floor", () => {
    const s = withBoard([cr("User Bear", "ub1", "user")]);
    expect(expandCastChoices(s, "user", parseEffectProgram(I(SWAT_ORACLE)))).toEqual([]);
  });
});

describe("⭐⭐ RETARGET — resolution: deflect off my creature, decline when there's nothing better (CR 115.7d)", () => {
  it("⭐⭐ end-to-end: an enemy removal spell aimed at MY bear is re-aimed at ITS controller's bear, which then dies", () => {
    const base = withBoard([cr("User Bear", "ub1", "user"), cr("AI Bear", "ab1", "ai")]);
    const destroy = stackSpell("s-kill", "Doom Blade", "Destroy target creature.", "ai", [{ atomIndex: 0, type: "creature", id: "ub1", controller: "user" }]);
    const s = { ...base, stack: [destroy] };
    const afterSwat = resolveSwat(s, "user", "s-kill", true);
    const rewritten = afterSwat.stack.find((o) => o.id === "s-kill");
    const row = {
      newTargets: rewritten.payload.params.targets.map((t) => t.id),
      topLevelSynced: rewritten.targets.map((t) => t.id),
      logged: (afterSwat.log || []).some((e) => e.effect === "retarget"),
    };
    console.log("  WITNESS swatDeflect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.newTargets).toEqual(["ab1"]);      // re-aimed at the AI's own bear
    expect(row.topLevelSynced).toEqual(["ab1"]);  // obj.targets kept in sync with params.targets
    expect(row.logged).toBe(true);
    // …and the rewritten spell RESOLVES on the new target: the AI's bear dies, mine lives.
    const resolved = runEffectProgram(afterSwat, rewritten);
    expect(resolved.players.user.battlefield.some((p) => p.id === "ub1")).toBe(true);
    expect(resolved.players.ai.battlefield.some((p) => p.id === "ab1")).toBe(false);
  });

  it("CR 115.7d — no alternative legal target (my bear is the only creature) → DECLINE, printed targets kept", () => {
    const base = withBoard([cr("User Bear", "ub1", "user")]);
    const destroy = stackSpell("s-kill", "Doom Blade", "Destroy target creature.", "ai", [{ atomIndex: 0, type: "creature", id: "ub1", controller: "user" }]);
    const s = { ...base, stack: [destroy] };
    const after = resolveSwat(s, "user", "s-kill", true);
    expect(after.stack.find((o) => o.id === "s-kill").payload.params.targets.map((t) => t.id)).toEqual(["ub1"]);
    expect((after.log || []).some((e) => e.effect === "retarget-decline" && e.reason === "no-safe-combo")).toBe(true);
  });

  it("not aimed at the retargeter → DECLINE (nothing to deflect), targets untouched", () => {
    const base = withBoard([cr("User Bear", "ub1", "user"), cr("AI Bear", "ab1", "ai")]);
    const destroy = stackSpell("s-kill", "Doom Blade", "Destroy target creature.", "ai", [{ atomIndex: 0, type: "creature", id: "ab1", controller: "ai" }]);
    const s = { ...base, stack: [destroy] };
    const after = resolveSwat(s, "user", "s-kill", true);
    expect(after.stack.find((o) => o.id === "s-kill").payload.params.targets.map((t) => t.id)).toEqual(["ab1"]);
    expect((after.log || []).some((e) => e.effect === "retarget-decline" && e.reason === "not-aimed-at-me")).toBe(true);
  });

  it("a manual/Arbiter payload (no effect-program) → DECLINE with its own reason — never a guess", () => {
    const base = withBoard([cr("User Bear", "ub1", "user"), cr("AI Bear", "ab1", "ai")]);
    const s = { ...base, stack: [{ id: "s-man", kind: "spell", controller: "ai", source: { name: "Weird Spell" }, payload: { resolver: "manual" }, targets: [{ type: "creature", id: "ub1", controller: "user" }] }] };
    const after = resolveSwat(s, "user", "s-man", true);
    expect(after.stack.find((o) => o.id === "s-man").targets.map((t) => t.id)).toEqual(["ub1"]);
    expect((after.log || []).some((e) => e.effect === "retarget-decline" && e.reason === "no-program")).toBe(true);
  });

  it("the target already left the stack → SWAT ITSELF fizzles wholesale (CR 608.2b), before the optional ever pauses", () => {
    // The runner's own all-targets-illegal check owns this case: Swat's only target is gone, so the whole
    // spell fizzles and the may is never offered. (applyRetarget's retarget-fizzle arm stays as defense in
    // depth for a target vanishing MID-program — unreachable from this single-atom card.)
    const s = withBoard([cr("User Bear", "ub1", "user")]);
    const program = parseEffectProgram(I(SWAT_ORACLE));
    const after = runEffectProgram({ ...s, stack: [] }, {
      id: "swat-stk", kind: "spell", controller: "user", source: { name: "Deflecting Swat" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [{ atomIndex: 0, type: "spell", id: "s-gone" }] } },
    });
    expect(after.pendingChoice).toBeUndefined();
    expect((after.log || []).some((e) => e.kind === "spell-fizzle")).toBe(true);
  });

  it("the printed may DECLINED at the choice → the spell is untouched (the α2 optional is real)", () => {
    const base = withBoard([cr("User Bear", "ub1", "user"), cr("AI Bear", "ab1", "ai")]);
    const destroy = stackSpell("s-kill", "Doom Blade", "Destroy target creature.", "ai", [{ atomIndex: 0, type: "creature", id: "ub1", controller: "user" }]);
    const s = { ...base, stack: [destroy] };
    const after = resolveSwat(s, "user", "s-kill", false);
    expect(after.stack.find((o) => o.id === "s-kill").payload.params.targets.map((t) => t.id)).toEqual(["ub1"]);
  });
});
