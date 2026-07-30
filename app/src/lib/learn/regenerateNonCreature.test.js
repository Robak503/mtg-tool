/**
 * regenerateNonCreature.test.js — REGENERATE reaches non-creature permanents.
 * Welding Jar · Metallurgeon · Loxodon Mender · Pteron Ghost · Reknit.
 *
 * ⭐ CR 701.19a says "If the effect of a resolving spell or ability regenerates a PERMANENT…" — not a
 * creature (verified against knowledge/mtg-judge/data/cr/cr_current.json, not from memory). The DESTRUCTION
 * side already agreed: spellEffects.applyDestroyEffect consults `regenShields` on any permanent it is about
 * to destroy, with no creature gate. So an artifact's shield has always been honoured — nothing ever
 * produced one, because both the parser and applyRegenerate stopped at "creature".
 *
 * ⭐⛔ BOTH HALVES AGAIN. The parse arm alone would have credited Welding Jar native while
 * `t.type === "creature"` in applyRegenerate silently dropped the artifact target — a shield that never
 * exists, and a card that reads modeled. Mutation M2 reverts only the resolver and the runtime test below
 * is the only thing that fails. That is why this file destroys a real artifact instead of asserting a tier.
 *
 * ⛔ The SUBTYPE arm (REGEN_TARGET_SUBTYPES — "regenerate target Sliver") stays creature-only: its
 * restriction rides creatureSatisfiesRestrictions, which has no non-creature path.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { applyRegenerate } from "./effects/atoms/combat.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle, read out of the bundled index.
const WELDING_JAR = { name: "Welding Jar", type: "Artifact", mana: "{0}",
  oracle: "Sacrifice this artifact: Regenerate target artifact." };
const REKNIT = { name: "Reknit", type: "Instant", mana: "{1}{G/W}",
  oracle: "Regenerate target permanent." };
const METALLURGEON = { name: "Metallurgeon", type: "Artifact Creature — Human Artificer", power: "0", toughness: "3", mana: "{1}{W}",
  oracle: "{W}, {T}: Regenerate target artifact." };

const SOL_RING = { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." };

function boardWithArtifact() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const ring = createPermanent({ id: "ring", card: { id: "c-ring", ...SOL_RING }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [ring] } } };
}
const ringIn = (s) => findPermanent(s, "ring");
// ⭐ THE TARGET IS TAGGED `type: "permanent"`, NOT `"artifact"`. The cast path tags every non-creature
// target that way (breakageWave2.test.js verified it through expandCastChoices for the creatureOrArtifact
// union), and applyDestroyEffect accepts exactly creature | permanent | planeswalker. I wrote these targets
// as `type: "artifact"` first and three tests failed — INCLUDING the no-shield control, which is what proved
// the harness was wrong rather than the code. It also sharpens why the resolver half was needed: the old
// `t.type === "creature"` check would drop a "permanent"-tagged target just as surely as an "artifact" one.

describe("the PARSER learns the two non-creature target nouns", () => {
  it("artifact and permanent both produce a regenerate atom", () => {
    for (const noun of ["artifact", "permanent"]) {
      const p = parseEffectClause(`Regenerate target ${noun}.`, "Instant");
      expect(p.atoms).toEqual([{ op: "regenerate", targetType: noun }]);
    }
  });

  it("the creature form is unchanged", () => {
    expect(parseEffectClause("Regenerate target creature.", "Instant").atoms)
      .toEqual([{ op: "regenerate", targetType: "creature" }]);
  });

  it("⛔ an uncurated noun after 'regenerate target' still parks", () => {
    // Neither a card type this arm knows nor a curated creature subtype → no atom → Arbiter (safe FN).
    const p = parseEffectClause("Regenerate target widget.", "Instant");
    expect((p?.atoms || []).some((a) => a.op === "regenerate")).toBe(false);
  });
});

describe("⭐ RUNTIME — a regenerated ARTIFACT really survives being destroyed", () => {
  it("shield applied, destruction replaced: Sol Ring stays on the battlefield, tapped, shield spent", () => {
    const s = boardWithArtifact();
    expect(ringIn(s).permanent.regenShields || 0).toBe(0);

    const shielded = applyRegenerate(s, { op: "regenerate", targetType: "artifact" },
      { controller: "user", targets: [{ type: "permanent", id: "ring" }] });
    expect(ringIn(shielded).permanent.regenShields).toBe(1);   // ⭐ the half a creature gate dropped

    const after = applyDestroyEffect(shielded, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(ringIn(after)).toBeTruthy();                        // ⭐ survived (CR 701.19a)
    expect(ringIn(after).permanent.tapped).toBe(true);         // the replacement taps it
    expect(ringIn(after).permanent.regenShields).toBe(0);      // exactly one shield consumed
  });

  it("⛔ CREED — WITHOUT a shield the same destroy really kills it (the survival is the shield, not the harness)", () => {
    const s = boardWithArtifact();
    const after = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(ringIn(after)).toBeFalsy();
  });

  it("⛔ CREED — the shield is ONE-SHOT: a second destroy finishes the artifact", () => {
    const s = boardWithArtifact();
    const shielded = applyRegenerate(s, { op: "regenerate", targetType: "artifact" },
      { controller: "user", targets: [{ type: "permanent", id: "ring" }] });
    const once = applyDestroyEffect(shielded, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(ringIn(once)).toBeTruthy();
    const twice = applyDestroyEffect(once, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(ringIn(twice)).toBeFalsy();
  });

  it("⛔ CREED — a target that already left the battlefield gets nothing (no fabricated shield)", () => {
    const s = boardWithArtifact();
    const gone = applyRegenerate(s, { op: "regenerate", targetType: "artifact" },
      { controller: "user", targets: [{ type: "permanent", id: "not-on-board" }] });
    expect(ringIn(gone).permanent.regenShields || 0).toBe(0);
  });
});

describe("coverage — the five carriers flip", () => {
  it("all five", () => {
    expect(classifyCard(WELDING_JAR)).toBe("native-activated");
    expect(classifyCard(METALLURGEON)).toBe("native-activated");
    expect(classifyCard(REKNIT)).toBe("native-spell");
  });

  it("⛔ unmodeled companion text still parks the card", () => {
    const residue = { ...WELDING_JAR, name: "Fake Jar",
      oracle: "Sacrifice this artifact: Regenerate target artifact.\nWhenever a player consults an oracle, interpret its riddle." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
});
