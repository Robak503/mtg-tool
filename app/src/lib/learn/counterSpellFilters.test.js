/**
 * CROSS-COUNTER — the cross-deck plain hard-counter lever (v0.81.0). Extends the P3.1 hard-counter atom
 * with the missing spell-FILTERS that left otherwise-CLEAN, rider-free counters parked on the Arbiter:
 *   CNT-TYPE  — single-type / 2-type-union: Dispel/Flash Counter (instant), Envelop/Extinguish (sorcery),
 *               Artifact Blast (artifact), Annul (artifact or enchantment), Nullify (creature or Aura)
 *   CNT-MV-CMP— "mana value N or greater" (Disdainful Stroke) / "or less" (Minor Misstep, Thoughtbind)
 *   CNT-COLOR — (non)color / colorless / multicolored: Gainsay (blue), Frazzle (nonblue),
 *               Ceremonious Rejection (colorless), Neutralizing Blast (multicolored)
 *
 * The hard-counter runtime is already complete (counterWiring.test.js): the user casts a counterspell in a
 * response window and the targeted stack spell goes to its controller's graveyard, unresolved. This slice only
 * widens WHICH spells each counter may target — applied at BOTH the enumeration side (spellMatchesCounterFilter,
 * "what's a legal target to offer?") and the resolution side (counterFilterMatches, "does the counter still
 * apply?"), kept in lockstep. So this file pins:
 *   1. the parser — each clean shape parses HIGH to a counter atom carrying the right filter / mv / color field;
 *   2. native coverage — each card is native-spell (slim object), the riddered cousins stay arbiter-spell (CREED);
 *   3. the live cast path end-to-end — a legal target IS offered + countered to the graveyard;
 *   4. CREED anti-FP — a WRONG-type / WRONG-color / WRONG-MV spell is NOT a legal target (never offered, and a
 *      defensive resolution re-check fizzles rather than countering it).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt) => parseEffectClause(txt, "Instant")?.atoms;
const isHigh = (txt) => programConfidence(parseEffectClause(txt, "Instant")) === "high";

// ─── 1. parser ────────────────────────────────────────────────────────────────
describe("CROSS-COUNTER parser — new spell-filters parse HIGH to a counter atom", () => {
  it("CNT-TYPE — single-type / 2-type-union filters", () => {
    expect(atomsOf("Counter target instant spell.")).toEqual([{ op: "counter", spellFilter: "instant", targetType: "spell" }]);
    expect(atomsOf("Counter target sorcery spell.")).toEqual([{ op: "counter", spellFilter: "sorcery", targetType: "spell" }]);
    expect(atomsOf("Counter target artifact spell.")).toEqual([{ op: "counter", spellFilter: "artifact", targetType: "spell" }]);
    expect(atomsOf("Counter target artifact or enchantment spell.")).toEqual([{ op: "counter", spellFilter: "artifactOrEnchantment", targetType: "spell" }]);
    expect(atomsOf("Counter target creature or Aura spell.")).toEqual([{ op: "counter", spellFilter: "creatureOrAura", targetType: "spell" }]);
    for (const t of ["Counter target instant spell.", "Counter target artifact or enchantment spell.", "Counter target creature or Aura spell."]) expect(isHigh(t)).toBe(true);
  });

  it("CNT-MV-CMP — 'mana value N or greater' / 'or less' → minMv / maxMv", () => {
    expect(atomsOf("Counter target spell with mana value 4 or greater.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", minMv: 4 }]);
    expect(atomsOf("Counter target spell with mana value 1 or less.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", maxMv: 1 }]);
    // The exact-MV form (Spell Snare) is unchanged — exactMv, NOT minMv/maxMv.
    expect(atomsOf("Counter target spell with mana value 2.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", exactMv: 2 }]);
    expect(isHigh("Counter target spell with mana value 4 or greater.")).toBe(true);
  });

  it("CNT-COLOR — (non)color / colorless / multicolored → colorFilter", () => {
    expect(atomsOf("Counter target blue spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { color: "U", negate: false } }]);
    expect(atomsOf("Counter target nonblue spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { color: "U", negate: true } }]);
    expect(atomsOf("Counter target colorless spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { colorless: true } }]);
    expect(atomsOf("Counter target multicolored spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { multicolored: true } }]);
    expect(atomsOf("Counter target red spell.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { color: "R", negate: false } }]);
  });

  it("CREED — riddered / alt-cost / modal counters stay LOW → Arbiter (never a confidently-wrong partial)", () => {
    // (The "instant or sorcery" union is MODELED now — SHELF Phase 2, the Muddle/Quash class; see
    // transmuteStrip.test.js. A 3-type union holds the unmodeled-union guard:)
    expect(isHigh("Counter target artifact, instant, or sorcery spell.")).toBe(false);      // an unmodeled 3-type union
    expect(isHigh("Counter target instant spell unless its controller pays {1}.")).toBe(false); // soft rider on a type filter (Disrupt-shape)
    expect(isHigh("Counter target spell with mana value 4 or greater unless its controller pays {1}.")).toBe(false); // soft rider on the MV-cmp filter
    // NOTE: "Its controller draws a card" IS now a modeled counter-rider (Dream Fracture, COUNTER-RIDER slice);
    // keep the CREED probe on a still-unmodeled controller rider (discard) so the guard stays meaningful.
    expect(isHigh("Counter target blue spell. Its controller reveals their hand.")).toBe(false); // controller rider unmodeled here // RE-POINTED 2026-07-30: the DISCARD rider is modeled now (player-referent slice), so the stand-in moved again — `investigates` is unmodeled even for an explicit "Target player investigates." The pin is the UNMODELED-RIDER refusal, not this rider. // RE-POINTED 2026-07-30 (final): `investigates` is modeled now, so the stand-in moved to `reveals their hand` — 126 corpus carriers but ZERO attributable, so nothing will ever flip by building it. A stand-in with no attribution is permanent.
    expect(isHigh("Counter target instant or sorcery spell that targets you.")).toBe(false); // Psychic Rebuttal extra restriction
  });
});

// ─── 2. native coverage (slim object) ───────────────────────────────────────────
describe("CROSS-COUNTER native coverage — the clean cards flip native-spell, riddered cousins stay parked", () => {
  const I = (oracle) => classifyCard({ type: "Instant", oracle, mana: "{U}" });
  it("each clean single-clause hard counter is native-spell", () => {
    expect(I("Counter target instant spell.")).toBe("native-spell");                         // Dispel / Flash Counter
    expect(I("Counter target sorcery spell.")).toBe("native-spell");                          // Envelop / Extinguish
    expect(I("Counter target artifact spell.")).toBe("native-spell");                         // Artifact Blast
    expect(I("Counter target artifact or enchantment spell.")).toBe("native-spell");          // Annul
    expect(I("Counter target creature or Aura spell.")).toBe("native-spell");                 // Nullify
    expect(I("Counter target spell with mana value 4 or greater.")).toBe("native-spell");     // Disdainful Stroke
    expect(I("Counter target spell with mana value 1 or less.")).toBe("native-spell");        // Minor Misstep
    expect(I("Counter target blue spell.")).toBe("native-spell");                             // Gainsay
    expect(I("Counter target nonblue spell.")).toBe("native-spell");                          // Frazzle
    expect(I("Counter target colorless spell.")).toBe("native-spell");                        // Ceremonious Rejection
    expect(I("Counter target multicolored spell.")).toBe("native-spell");                     // Neutralizing Blast
  });
  it("CREED — counters with an UNMODELED rider/filter in these families stay arbiter-spell", () => {
    expect(I("Counter target instant or sorcery spell.")).toBe("native-spell");               // Quash-class union — MODELED now (SHELF Phase 2)
    expect(I("Counter target instant spell. Its controller reveals their hand.")).toBe("arbiter-spell"); // RE-POINTED 2026-07-29: the lose-life rider became MODELED, so this stand-in moved to a still-unmodeled one (discard). The principle pinned is the UNMODELED-RIDER refusal, never this particular rider. // RE-POINTED 2026-07-30: the DISCARD rider is modeled now (player-referent slice), so the stand-in moved again — `investigates` is unmodeled even for an explicit "Target player investigates." The pin is the UNMODELED-RIDER refusal, not this rider. // RE-POINTED 2026-07-30 (final): `investigates` is modeled now, so the stand-in moved to `reveals their hand` — 126 corpus carriers but ZERO attributable, so nothing will ever flip by building it. A stand-in with no attribution is permanent.
    expect(I("Counter target blue spell. Its controller reveals their hand.")).toBe("arbiter-spell"); // controller-rider unmodeled (draw IS modeled — Dream Fracture) // RE-POINTED 2026-07-30: the DISCARD rider is modeled now (player-referent slice), so the stand-in moved again — `investigates` is unmodeled even for an explicit "Target player investigates." The pin is the UNMODELED-RIDER refusal, not this rider. // RE-POINTED 2026-07-30 (final): `investigates` is modeled now, so the stand-in moved to `reveals their hand` — 126 corpus carriers but ZERO attributable, so nothing will ever flip by building it. A stand-in with no attribution is permanent.
    // NOTE: "Counter target spell with mana value 4 or greater. Draw a card." is correctly native-spell — BOTH
    // the counter and the draw are fully modeled (the multi-clause parser composes them). That is not an FP; it's
    // an honestly-playable card, so it is intentionally NOT asserted parked here.
  });
});

// ─── runtime helpers (mirror counterWiring.test.js) ─────────────────────────────
// A spell on the stack with a full `source` card (type / cmc / colors drive the filter).
function spellOnStack(id, { name, type, cmc = 0, colors = [], controller = "ai" }) {
  return {
    id, kind: "spell", controller, targets: [], cost: null,
    source: { id: `card-${id}`, name, type, cmc, colors, oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  };
}
// Precombat-main with `responder` holding priority while `stack` sits unresolved.
function responseState({ responder = "user", stack = [], userHand = [], userPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: responder, consecutivePasses: 0, stack,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool } } },
  };
}
const offers = (state, cardId) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find((c) => c.cardId === cardId);

// ─── 3 + 4. live cast path end-to-end + CREED anti-FP ───────────────────────────
describe("CROSS-COUNTER runtime — legal target offered + countered; illegal target not offered (CREED)", () => {
  const DISPEL = { id: "dsp", name: "Dispel", type: "Instant", oracle: "Counter target instant spell.", mana: "{U}" };
  const ANNUL = { id: "anl", name: "Annul", type: "Instant", oracle: "Counter target artifact or enchantment spell.", mana: "{U}" };
  const DISDAINFUL = { id: "dst", name: "Disdainful Stroke", type: "Instant", oracle: "Counter target spell with mana value 4 or greater.", mana: "{1}{U}" };
  const GAINSAY = { id: "gns", name: "Gainsay", type: "Instant", oracle: "Counter target blue spell.", mana: "{U}{U}" };
  const CEREMONIOUS = { id: "crj", name: "Ceremonious Rejection", type: "Instant", oracle: "Counter target colorless spell.", mana: "{U}" };

  it("CNT-TYPE Dispel: counters an instant spell → graveyard; NOT offered against a sorcery (wrong type)", () => {
    const bolt = spellOnStack("b1", { name: "Lightning Bolt", type: "Instant", cmc: 1, colors: ["R"] });
    const state = responseState({ userHand: [DISPEL], userPool: { U: 1 }, stack: [bolt] });
    const off = offers(state, "dsp");
    expect(off).toBeTruthy();
    expect(off.targets[0]).toMatchObject({ type: "spell", id: "b1" });
    const resolved = resolveTopOfStack(dispatchAction(state, off));
    expect(resolved.stack).toHaveLength(0);
    expect(resolved.players.ai.graveyard.map((c) => c.name)).toEqual(["Lightning Bolt"]);
    expect(resolved.log.some((l) => l.effect === "counter")).toBe(true);
    // CREED: a SORCERY on the stack is no legal target for Dispel → not offered.
    const sorc = responseState({ userHand: [DISPEL], userPool: { U: 1 }, stack: [spellOnStack("s1", { name: "Divination", type: "Sorcery", cmc: 3, colors: ["U"] })] });
    expect(offers(sorc, "dsp")).toBeFalsy();
  });

  it("CNT-TYPE Annul: counters an artifact OR enchantment spell; NOT a creature/instant (CREED)", () => {
    for (const tgt of [{ name: "Sol Ring", type: "Artifact" }, { name: "Rhystic Study", type: "Enchantment" }]) {
      const st = responseState({ userHand: [ANNUL], userPool: { U: 1 }, stack: [spellOnStack("t", { ...tgt, cmc: 1, colors: [] })] });
      const off = offers(st, "anl");
      expect(off, `Annul should target a ${tgt.type} spell`).toBeTruthy();
      const resolved = resolveTopOfStack(dispatchAction(st, off));
      expect(resolved.players.ai.graveyard.map((c) => c.name)).toEqual([tgt.name]);
    }
    // CREED: a creature spell + an instant spell are NOT legal Annul targets.
    for (const tgt of [{ name: "Grizzly Bears", type: "Creature — Bear" }, { name: "Lightning Bolt", type: "Instant" }]) {
      const st = responseState({ userHand: [ANNUL], userPool: { U: 1 }, stack: [spellOnStack("t", { ...tgt, cmc: 2, colors: ["G"] })] });
      expect(offers(st, "anl"), `Annul must NOT target a ${tgt.type} spell`).toBeFalsy();
    }
  });

  it("CNT-MV-CMP Disdainful Stroke: counters MV≥4; NOT a MV-3 spell (boundary, CREED)", () => {
    const big = responseState({ userHand: [DISDAINFUL], userPool: { U: 1, C: 1 }, stack: [spellOnStack("h", { name: "Hydroid Krasis", type: "Creature — Jellyfish Hydra Beast", cmc: 4, colors: ["G", "U"] })] });
    const off = offers(big, "dst");
    expect(off).toBeTruthy();
    expect(resolveTopOfStack(dispatchAction(big, off)).players.ai.graveyard.map((c) => c.name)).toEqual(["Hydroid Krasis"]);
    // CREED: MV 3 is below the "4 or greater" floor → not a legal target.
    const small = responseState({ userHand: [DISDAINFUL], userPool: { U: 1, C: 1 }, stack: [spellOnStack("c", { name: "Counterspell", type: "Instant", cmc: 3, colors: ["U"] })] });
    expect(offers(small, "dst")).toBeFalsy();
  });

  it("CNT-COLOR Gainsay: counters a BLUE spell; NOT a red spell (CREED)", () => {
    const blue = responseState({ userHand: [GAINSAY], userPool: { U: 2 }, stack: [spellOnStack("u", { name: "Brainstorm", type: "Instant", cmc: 1, colors: ["U"] })] });
    const off = offers(blue, "gns");
    expect(off).toBeTruthy();
    expect(resolveTopOfStack(dispatchAction(blue, off)).players.ai.graveyard.map((c) => c.name)).toEqual(["Brainstorm"]);
    const red = responseState({ userHand: [GAINSAY], userPool: { U: 2 }, stack: [spellOnStack("r", { name: "Lightning Bolt", type: "Instant", cmc: 1, colors: ["R"] })] });
    expect(offers(red, "gns")).toBeFalsy();
  });

  it("CNT-COLOR Ceremonious Rejection: counters a COLORLESS spell; NOT a colored spell (CREED)", () => {
    const cl = responseState({ userHand: [CEREMONIOUS], userPool: { U: 1 }, stack: [spellOnStack("a", { name: "Sol Ring", type: "Artifact", cmc: 1, colors: [] })] });
    const off = offers(cl, "crj");
    expect(off).toBeTruthy();
    expect(resolveTopOfStack(dispatchAction(cl, off)).players.ai.graveyard.map((c) => c.name)).toEqual(["Sol Ring"]);
    // A blue spell is colored → not a legal Ceremonious Rejection target.
    const colored = responseState({ userHand: [CEREMONIOUS], userPool: { U: 1 }, stack: [spellOnStack("u", { name: "Counterspell", type: "Instant", cmc: 2, colors: ["U"] })] });
    expect(offers(colored, "crj")).toBeFalsy();
  });

  it("CNT-COLOR fail-closed: a target whose `colors` field is missing is NOT offered to a color counter (CREED)", () => {
    // No `colors` array on the source → unresolvable → fail-closed (never offer a wrong-color counter).
    const noColors = { id: "x", kind: "spell", controller: "ai", targets: [], cost: null,
      source: { id: "card-x", name: "Mystery Spell", type: "Instant", cmc: 2, oracle: "" }, // colors OMITTED
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} } };
    const st = responseState({ userHand: [GAINSAY], userPool: { U: 2 }, stack: [noColors] });
    expect(offers(st, "gns")).toBeFalsy();
  });
});
