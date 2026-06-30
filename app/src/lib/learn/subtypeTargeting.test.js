/**
 * SUBTYPE-RESTRICTED TARGETING — abilities/spells whose target is restricted to a creature SUBTYPE
 * ("target Dinosaur gains haste", "Destroy target Human creature").
 *
 * THE CREED (FP-CRITICAL): the subtype filter MUST genuinely restrict legal targets at runtime — a
 * "target Dinosaur" ability can ONLY pick a Dinosaur, never an arbitrary creature. A dropped/un-enforced
 * filter = a forbidden target-anything FP. So every BUILT card is asserted three ways:
 *   1. the clause parses to a HIGH program / the card classifies native (credited only when enforced),
 *   2. at runtime ONLY a creature of the named subtype is a legal target, and the effect resolves on it,
 *   3. a NON-subtype creature is NOT targetable (the anti-FP pin), and an un-modeled-rider card stays LOW.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { applyPumpEffect } from "./effects/atoms/combat.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (oracle) => parseEffectClause(oracle, "Instant").atoms[0];
const cre = (id, type, controller = "user") =>
  createPermanent({ id, card: { id, name: id, type }, controller });
const boardWith = (perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = { user: [], ai: [] };
  for (const p of perms) bf[p.controller].push(p);
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf.user }, ai: { ...s.players.ai, battlefield: bf.ai } } };
};
const ids = (ts) => ts.map((t) => t.id).sort();

// ─── Otepec Huntmaster — "{T}: Target Dinosaur gains haste until end of turn." (bare subtype target) ───
describe("SUBTYPE-TARGET — Otepec Huntmaster (target Dinosaur gains haste)", () => {
  const OTEPEC = {
    name: "Otepec Huntmaster", type: "Creature — Human Shaman", mana_cost: "{1}{R}",
    oracle: "Dinosaur spells you cast cost {1} less to cast.\n{T}: Target Dinosaur gains haste until end of turn.",
  };

  it("the activated ability is MODELED (its effect parses HIGH)", () => {
    const abs = parseActivatedAbilities(OTEPEC);
    expect(abs).toHaveLength(1);
    expect(abs[0].modeled).toBe(true);
    expect(programConfidence(abs[0].program)).toBe("high");
  });

  it("classifies NATIVE (cost-reduction static + the modeled subtype-target activated ability)", () => {
    const tier = classifyCard(OTEPEC);
    expect(isNativeTier(tier)).toBe(true);
  });

  it("the pump atom carries a subtype restriction targeting a creature", () => {
    const atom = atomOf("Target Dinosaur gains haste until end of turn.");
    expect(atom.op).toBe("pump");
    expect(atom.targetType).toBe("creature");
    expect(atom.grantKeywords).toEqual(["Haste"]);
    expect(atom.restrictions).toEqual([{ kind: "subtype", subtype: "dinosaur" }]);
  });

  it("RUNTIME: ONLY a Dinosaur is a legal target — a non-Dinosaur creature is NOT (anti-FP pin)", () => {
    const s = boardWith([
      cre("uDino", "Creature — Dinosaur"),
      cre("uBear", "Creature — Bear"),
      cre("aDino2", "Creature — Dinosaur", "ai"),
    ]);
    const atom = atomOf("Target Dinosaur gains haste until end of turn.");
    const legal = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions });
    // Both Dinosaurs (any controller — "target Dinosaur" has no controller clause) are legal; the Bear is NOT.
    expect(ids(legal)).toEqual(["aDino2", "uDino"]);
    expect(ids(legal)).not.toContain("uBear");
  });

  it("RUNTIME: the haste grant resolves on the chosen Dinosaur", () => {
    const s = boardWith([cre("uDino", "Creature — Dinosaur")]);
    const atom = atomOf("Target Dinosaur gains haste until end of turn.");
    const next = applyPumpEffect(s, atom, { controller: "user", targets: [{ type: "creature", id: "uDino", controller: "user" }] });
    expect(permanentHasKeyword(next, "uDino", "Haste")).toBe(true);
  });
});

// ─── Human Frailty — "Destroy target Human creature." (subtype-restricted spell removal) ───
describe("SUBTYPE-TARGET — Human Frailty (destroy target Human creature)", () => {
  const FRAILTY = { name: "Human Frailty", type: "Instant", mana_cost: "{B}", oracle: "Destroy target Human creature." };

  it("classifies NATIVE (native-spell — the subtype destroy is now enforced)", () => {
    expect(classifyCard(FRAILTY)).toBe("native-spell");
  });

  it("the destroy atom carries a subtype restriction", () => {
    const atom = atomOf("Destroy target Human creature.");
    expect(atom.op).toBe("destroy");
    expect(atom.targetType).toBe("creature");
    expect(atom.restrictions).toEqual([{ kind: "subtype", subtype: "human" }]);
  });

  it("RUNTIME: ONLY a Human creature is a legal target — a non-Human is NOT (anti-FP pin)", () => {
    const s = boardWith([
      cre("uHuman", "Creature — Human Soldier"),
      cre("uGoblin", "Creature — Goblin"),
      cre("aHuman2", "Creature — Human Wizard", "ai"),
    ]);
    const atom = atomOf("Destroy target Human creature.");
    const legal = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions });
    expect(ids(legal)).toEqual(["aHuman2", "uHuman"]);
    expect(ids(legal)).not.toContain("uGoblin");
  });
});

// ─── CREED anti-FP gates ───────────────────────────────────────────────────────────────────────────
describe("SUBTYPE-TARGET — CREED anti-FP gates", () => {
  it('"another target <Subtype> creature gets …" stays LOW (source-exclusion not modeled → PARK)', () => {
    // Anaba Ancestor / Balthor — "another" (CR 113.7) needs the source excluded from legal targets, which the
    // targeting seam can't enforce yet. Modeling it would let the source illegally target itself (an FP). LOW.
    const p = parseEffectClause("another target minotaur creature gets +1/+1 until end of turn", "Instant");
    expect(programConfidence(p)).toBe("low");
  });

  it('a subtype-target pump "you control" stays LOW (controller-restricted form not in this slice)', () => {
    // "target Beast creature you control" (Advocate of the Beast) — the controller clause is a separate
    // restriction the subtype matcher deliberately does NOT fold in; it routes to the Arbiter (FN-safe).
    const p = parseEffectClause("put a +1/+1 counter on target beast creature you control", "Instant");
    expect(programConfidence(p)).toBe("low");
  });

  it("a NON-curated word after 'target' is NOT treated as a subtype (no fabricated filter)", () => {
    // "target green creature" is a COLOR, not a subtype — must NOT parse as a subtype-target pump.
    const p = parseEffectClause("target green creature gains haste until end of turn", "Instant");
    expect(programConfidence(p)).toBe("low");
  });

  it("Orcish Captain stays NON-native (coin-flip rider is unmodeled)", () => {
    const ORC = {
      name: "Orcish Captain", type: "Creature — Orc Warrior", mana_cost: "{R}",
      oracle: "{1}: Flip a coin. If you win the flip, target Orc creature gets +2/+0 until end of turn. If you lose the flip, it gets -0/-2 until end of turn.",
    };
    expect(isNativeTier(classifyCard(ORC))).toBe(false);
  });

  it('a bare "destroy target green creature" (color, not subtype) is NOT credited as a subtype destroy', () => {
    const atom = atomOf("Destroy target green creature.");
    // Either it doesn't parse, or it parses without a fabricated subtype restriction. Never a subtype filter.
    expect(atom == null || !(atom.restrictions || []).some((r) => r.kind === "subtype")).toBe(true);
  });
});
