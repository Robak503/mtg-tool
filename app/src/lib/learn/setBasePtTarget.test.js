/**
 * setBasePtTarget.test.js — BLITZ SU-1: "Target creature has base power and toughness N/N until end
 * of turn." (Diminish 1/1, Square Up 4/4 — the literal-N/N single-target twins of Biomass Mutation's
 * team form.)
 *
 * The clause parses to a `set-base-pt-target` atom (HIGH, one chosen creature target) resolved by
 * applySetBasePtTarget: a layer-7b base-P/T SET (CR 613.3b/613.4a) fixed to the chosen creature,
 * endOfTurn (worn off at cleanup, CR 514.2). Layer order pinned per CR 613.3/613.4c: counters and
 * anthems apply ON TOP of the new base in 7c (a Diminished 1/1 with a +1/+1 counter is a 2/2), and
 * the lethal SBA runs at resolution — already-marked damage can turn lethal against the new base
 * (a 5/5 carrying 3 damage dies the moment it becomes 1/1, CR 704.5g).
 *
 * CREED negatives: the ability-losing cousins (Turn to Frog / Ovinize class — "…and loses all
 * abilities") and scope variants ("target creature you control …") must NOT half-apply as a bare
 * P/T set — they fail the exact anchor and stay on the Arbiter.
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { setBasePtTargetClauseParser } from "./effects/atoms/combat.js";
import { permanentPower, permanentToughness, expireContinuousEffects } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DIMINISH = { id: "dim", name: "Diminish", type: "Instant", mana: "{U}",
  oracle: "Target creature has base power and toughness 1/1 until end of turn." };
const SQUARE_UP = { id: "squ", name: "Square Up", type: "Instant", mana: "{1}{G/U}",
  oracle: "Target creature has base power and toughness 4/4 until end of turn." };

describe("parse + classify", () => {
  it("the literal-N/N single-target clause parses HIGH to the set-base-pt-target atom", () => {
    expect(setBasePtTargetClauseParser("target creature has base power and toughness 1/1 until end of turn"))
      .toEqual({ op: "set-base-pt-target", targetType: "creature", power: 1, toughness: 1 });
    const p = parseEffectClause(DIMINISH.oracle, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "set-base-pt-target", targetType: "creature", power: 1, toughness: 1 }]);
  });
  it("Diminish and Square Up flip native-spell", () => {
    expect(classifyCard(DIMINISH)).toBe("native-spell");
    expect(classifyCard(SQUARE_UP)).toBe("native-spell");
  });
  it("ride-alongs whose OTHER parts were already modeled flip too (audited GAINED)", () => {
    // Zhalfirin Shapecraft — the asymmetric 4/3 set + a draw atom (both modeled).
    expect(classifyCard({ id: "zs", name: "Zhalfirin Shapecraft", type: "Instant", mana: "{1}{U}",
      oracle: "Target creature has base power and toughness 4/3 until end of turn.\nDraw a card." })).toBe("native-spell");
    // Quandrix Charm — modal: soft-counter + enchantment removal were long-modeled; the 5/5 set
    // completes mode 3, and the modal gate is all-or-nothing (every mode must parse HIGH).
    expect(classifyCard({ id: "qc", name: "Quandrix Charm", type: "Instant", mana: "{G}{U}",
      oracle: "Choose one —\n• Counter target spell unless its controller pays {2}.\n• Destroy target enchantment.\n• Target creature has base power and toughness 5/5 until end of turn." })).toBe("native-spell");
  });
  it("CREED — ability-losing and scope variants stay low (never a half-applied bare set)", () => {
    for (const v of [
      "Target creature has base power and toughness 1/1 until end of turn and loses all abilities.",
      "Until end of turn, target creature has base power and toughness 0/1 and loses all abilities.",
      "Target creature you control has base power and toughness 4/4 until end of turn.",
    ]) {
      expect(programConfidence(parseEffectClause(v, "Instant")), v).not.toBe("high");
    }
  });
});

describe("runtime — the 7b set on the chosen creature", () => {
  const ATOM = { op: "set-base-pt-target", targetType: "creature", power: 1, toughness: 1 };
  const beast = (over = {}) => Object.assign(
    createPermanent({ id: "big", card: { id: "bc", name: "Big Beast", type: "Creature — Beast", power: "5", toughness: "5", oracle: "" }, controller: "ai", summoningSick: false }),
    over);
  const board = (aiBf) => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return { ...base, turn: 3, players: { ...base.players, ai: { ...base.players.ai, battlefield: aiBf } } };
  };
  const cast = (s) => resolveAtom(s, ATOM, { controller: "user", cardName: "Diminish", targets: [{ type: "creature", id: "big" }] });

  it("a 5/5 becomes 1/1; the set wears off at cleanup (CR 514.2)", () => {
    const s = cast(board([beast()]));
    expect(`${permanentPower(s, "big")}/${permanentToughness(s, "big")}`).toBe("1/1");
    const cleaned = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect(`${permanentPower(cleaned, "big")}/${permanentToughness(cleaned, "big")}`).toBe("5/5");
  });

  it("CR 613.3 — a +1/+1 counter applies ON TOP of the new base (Diminished 1/1 + counter = 2/2)", () => {
    const s = cast(board([beast({ counters: { "+1/+1": 1 } })]));
    expect(`${permanentPower(s, "big")}/${permanentToughness(s, "big")}`).toBe("2/2");
  });

  it("CR 704.5g — already-marked damage turns lethal against the new base at resolution", () => {
    // 3 damage on a 5/5 was survivable; the moment the base becomes 1/1 the SBA kills it.
    const s = cast(board([beast({ damageMarked: 3 })]));
    expect(s.players.ai.battlefield).toHaveLength(0);
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Big Beast"]);
    // …and 0 marked damage on the SAME set survives (damage < the new toughness).
    const alive = cast(board([beast()]));
    expect(alive.players.ai.battlefield).toHaveLength(1);
  });

  it("CR 608.2b — a departed target fizzles (no throw, no effect)", () => {
    const s0 = board([]);
    const s = resolveAtom(s0, ATOM, { controller: "user", cardName: "Diminish", targets: [{ type: "creature", id: "big" }] });
    expect(s.players.ai.battlefield).toHaveLength(0);
    expect((s.continuousEffects || []).filter((e) => e.sublayer === "7b")).toHaveLength(0);
  });
});
