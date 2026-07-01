/**
 * REGEN (CR 701.15) — "{cost}: Regenerate this creature" / "Regenerate target creature" sets up a
 * regeneration shield that REPLACES the next destruction this turn: the creature survives, tapped, with its
 * marked damage removed (CR 701.15a), instead of dying. Modeled end-to-end: the effect atom sets the shield;
 * the lethal-damage SBA + the explicit-destroy effect consume it; it expires at cleanup. CREED: a shield does
 * NOT save from 0-toughness (CR 704.5f) — only from destruction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDestroyEffect, parseSpellEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { runStepActions } from "./gameEngine.js";
import { clearCombat } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, clearCombatDamage, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const onBoard = (perm, controller = "user") => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [perm] } } };
};
const bear = (over = {}) => ({ ...createPermanent({ id: "p1", card: { name: "Regen Troll", type: "Creature — Troll", power: 2, toughness: 3 }, controller: "user" }), ...over });
const inGrave = (s, name) => s.players.user.graveyard.some((c) => c.name === name);

describe("REGEN — parser (bare anchored forms only)", () => {
  it("recognizes self + target regenerate", () => {
    expect(parseEffectClause("regenerate this creature").atoms).toEqual([{ op: "regenerate", target: "self" }]);
    expect(parseEffectClause("regenerate this permanent").atoms).toEqual([{ op: "regenerate", target: "self" }]);
    expect(parseEffectClause("regenerate target creature").atoms).toEqual([{ op: "regenerate", targetType: "creature" }]);
  });
  it("SUBTYPE-REGEN — 'regenerate target <curated subtype>' → a subtype-restricted creature target", () => {
    // Crypt/Poultice Sliver's group-granted body, and printed Black Poplar Shaman (Treefolk), Krosan Warchief
    // (Beast), Boneknitter (Zombie). The subtype rides as a target restriction so enumeration offers only the
    // subtyped creatures.
    expect(parseEffectClause("regenerate target sliver").atoms).toEqual([{ op: "regenerate", targetType: "creature", restrictions: [{ kind: "subtype", subtype: "sliver" }] }]);
    expect(parseEffectClause("regenerate target treefolk").atoms).toEqual([{ op: "regenerate", targetType: "creature", restrictions: [{ kind: "subtype", subtype: "treefolk" }] }]);
    expect(parseEffectClause("regenerate target beast").atoms).toEqual([{ op: "regenerate", targetType: "creature", restrictions: [{ kind: "subtype", subtype: "beast" }] }]);
  });
  it("does NOT recognize filtered / off-type regenerate (→ Arbiter, CREED-safe)", () => {
    expect(parseEffectClause("regenerate target creature you control").atoms).toEqual([]);
    expect(parseEffectClause("regenerate target artifact").atoms).toEqual([]);
    expect(parseEffectClause("regenerate all creatures you control").atoms).toEqual([]);
    // a COLOR-qualified target ("green creature") and an un-curated noun are NOT a subtype → stay Arbiter.
    expect(parseEffectClause("regenerate target green creature").atoms).toEqual([]);
    expect(parseEffectClause("regenerate target permanent").atoms).toEqual([]);
  });
});

describe("REGEN — coverage flips", () => {
  it("an activated '{cost}: Regenerate this creature' + a keyword classifies native", () => {
    expect(classifyCard({ type: "Creature — Troll", name: "Troll Ascetic", mana: "{1}{G}{G}", oracle: "Hexproof\n{1}{G}: Regenerate this creature." })).toBe("native-activated");
  });
  it("'Regenerate target creature' instant classifies native-spell", () => {
    expect(classifyCard({ type: "Instant", name: "Death Ward", mana: "{W}", oracle: "Regenerate target creature." })).toBe("native-spell");
  });
  it("an UNMODELED cost (discard) regen stays body-only (the cost gates it, not the regen)", () => {
    expect(classifyCard({ type: "Creature — Construct", name: "Patchwork Gnomes", mana: "{3}", oracle: "Discard a card: Regenerate this creature." })).toBe("body-only");
  });
});

describe("REGEN — engine: the shield replaces destruction", () => {
  it("a creature with lethal marked damage + a shield SURVIVES (tapped, damage cleared, shield spent)", () => {
    const s = onBoard(bear({ damageMarked: 3, regenShields: 1 }));
    const { state: after } = destroyLethalCreatures(s);
    expect(inGrave(after, "Regen Troll")).toBe(false);          // survived
    const p = findPermanent(after, "p1").permanent;
    expect(p.regenShields).toBe(0);                              // shield consumed
    expect(p.damageMarked).toBe(0);                              // damage removed (CR 701.15a)
    expect(p.tapped).toBe(true);                                 // tapped (CR 701.15a)
  });
  it("the SAME lethal damage with NO shield kills it", () => {
    const { state: after } = destroyLethalCreatures(onBoard(bear({ damageMarked: 3 })));
    expect(inGrave(after, "Regen Troll")).toBe(true);
  });
  it("a shield does NOT save from 0 toughness (CR 704.5f — not a destruction)", () => {
    const zero = { ...createPermanent({ id: "p1", card: { name: "Regen Troll", type: "Creature — Troll", power: 0, toughness: 0 }, controller: "user" }), regenShields: 1 };
    const { state: after } = destroyLethalCreatures(onBoard(zero));
    expect(inGrave(after, "Regen Troll")).toBe(true);           // dies anyway; shield still intact (unused)
    expect(findPermanent(after, "p1")).toBeFalsy();
  });
  it("an explicit Destroy effect is also replaced by the shield", () => {
    const s = onBoard(bear({ regenShields: 1 }));
    const after = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "p1" }] });
    expect(inGrave(after, "Regen Troll")).toBe(false);
    expect(findPermanent(after, "p1").permanent.regenShields).toBe(0);
  });
  it("unused shields expire at cleanup (CR 701.15 — 'this turn')", () => {
    const after = clearCombatDamage(onBoard(bear({ regenShields: 2 })));
    expect(findPermanent(after, "p1").permanent.regenShields).toBe(0);
  });
});

// MTG-001 — a destroy effect carrying "[They|It|That creature|Those creatures] can't be regenerated"
// (Wrath of God, Terminate, Rend Flesh) PREVENTS the regeneration replacement (CR 701.15): the shield
// does NOT save the creature. The parser strips the rider from the parse text but the parseEffectClause
// wrapper re-stamps `cannotRegenerate` on the destroy atom, which applyDestroyEffect then honors. The
// rider does NOT bypass indestructible (CR 702.12b — a separate replacement that still applies).
describe("REGEN — MTG-001: 'can't be regenerated' overrides the shield (but not indestructible)", () => {
  describe("parser stamps cannotRegenerate on the destroy atom", () => {
    it("single-target removal (Terminate / Rend Flesh)", () => {
      // single-target destroy routes through parseSpellEffect, which gates on an Instant/Sorcery type
      expect(parseEffectClause("Destroy target creature. It can't be regenerated.", "Instant").atoms)
        .toEqual([{ op: "destroy", targetType: "creature", cannotRegenerate: true }]);
    });
    it("mass removal (Wrath of God / Damnation)", () => {
      expect(parseEffectClause("Destroy all creatures. They can't be regenerated.", "Sorcery").atoms)
        .toEqual([{ op: "destroy", targetType: "eachCreature", cannotRegenerate: true }]);
    });
    it("a PLAIN destroy carries NO flag (so a shield still saves it)", () => {
      expect(parseEffectClause("Destroy target creature.", "Instant").atoms).toEqual([{ op: "destroy", targetType: "creature" }]);
      expect(parseEffectClause("Destroy all creatures.", "Sorcery").atoms).toEqual([{ op: "destroy", targetType: "eachCreature" }]);
    });
    it("the legacy parseSpellEffect path also carries (only when present) the rider", () => {
      expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target creature. It can't be regenerated." }))
        .toEqual({ kind: "destroy", targetType: "creature", cannotRegenerate: true });
      expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target creature." }))
        .toEqual({ kind: "destroy", targetType: "creature" });
    });
  });

  describe("engine: cannotRegenerate ignores the shield; indestructible is unaffected", () => {
    it("a shielded creature DIES to a cannot-regenerate destroy (the shield does NOT save it)", () => {
      const s = onBoard(bear({ regenShields: 1 }));
      const after = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "p1" }], cannotRegenerate: true });
      expect(inGrave(after, "Regen Troll")).toBe(true);
    });
    it("CONTROL: the SAME shielded creature SURVIVES a plain destroy (the shield still works)", () => {
      const s = onBoard(bear({ regenShields: 1 }));
      const after = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "p1" }] });
      expect(inGrave(after, "Regen Troll")).toBe(false);
      expect(findPermanent(after, "p1").permanent.regenShields).toBe(0);
    });
    it("a cannot-regenerate destroy does NOT bypass INDESTRUCTIBLE (CR 702.12b — a separate replacement)", () => {
      const steel = createPermanent({ id: "p1", card: { name: "Steel Troll", type: "Creature — Troll", power: 2, toughness: 3, oracle: "Indestructible" }, controller: "user" });
      const after = applyDestroyEffect(onBoard(steel), { controller: "ai", targets: [{ type: "creature", id: "p1" }], cannotRegenerate: true });
      expect(inGrave(after, "Steel Troll")).toBe(false);
      expect(findPermanent(after, "p1")).toBeTruthy();
    });
  });
});

describe("REGEN — CR 701.15a: a regenerated creature is REMOVED FROM COMBAT (no second-step damage)", () => {
  // A 5/3 trampler with a pre-combat regen shield attacks; a 3/3 first-strike blocker deals lethal in the
  // first-strike step, so the attacker regenerates THEN — and must deal nothing in the regular step.
  const fsCombat = () => {
    const att = { ...createPermanent({ id: "att", card: { name: "Regen Tusker", type: "Creature — Beast", power: 5, toughness: 3, keywords: ["Trample"] }, controller: "user" }), regenShields: 1 };
    const blk = createPermanent({ id: "blk", card: { name: "FS Knight", type: "Creature — Knight", power: 3, toughness: 3, keywords: ["First strike"] }, controller: "ai" });
    return {
      turn: 3, log: [],
      players: {
        user: { life: 40, battlefield: [att], graveyard: [], commanderDamageFrom: {} },
        ai: { life: 40, battlefield: [blk], graveyard: [], commanderDamageFrom: {} },
      },
      combat: {
        attackers: [{ permanentId: "att", attackingPlayer: "user", defender: "ai" }],
        blockers: [{ blockerId: "blk", blockingPlayer: "ai", attackerId: "att" }],
      },
    };
  };

  it("regenerates in the first-strike step, then deals 0 in the regular step (blocker lives, no trample)", () => {
    const afterFS = resolveCombatDamage(fsCombat(), { firstStrikeStep: true });
    const att = findPermanent(afterFS, "att").permanent;
    expect(att.regenShields).toBe(0);          // shield consumed regenerating
    expect(att.tapped).toBe(true);             // CR 701.15a — tapped
    expect(att.removedFromCombat).toBe(true);  // CR 701.15a — removed from combat
    expect(afterFS.players.ai.battlefield.map(p => p.card.name)).toEqual(["FS Knight"]); // blocker unhurt so far

    const afterReg = resolveCombatDamage(afterFS, { firstStrikeStep: false });
    expect(afterReg.players.ai.battlefield.map(p => p.card.name)).toEqual(["FS Knight"]); // SURVIVES (the bug killed it)
    expect(afterReg.players.ai.life).toBe(40); // no second-step trample (the bug dealt 2)
    expect(findPermanent(afterReg, "att").permanent.tapped).toBe(true); // still the regenerated creature
  });

  it("clearCombat wipes the removed-from-combat flag so the creature fights normally next combat", () => {
    const afterFS = resolveCombatDamage(fsCombat(), { firstStrikeStep: true });
    expect(findPermanent(afterFS, "att").permanent.removedFromCombat).toBe(true);
    expect(findPermanent(clearCombat(afterFS), "att").permanent.removedFromCombat).toBe(false);
  });

  it("PRODUCTION path: the engine's end-of-combat reset clears the flag, so the NEXT combat deals damage again", () => {
    // The engine resets combat via runStepActions (clearCombat is test-only) — before the fix the flag
    // survived every end-of-combat and the creature attacked/tapped but dealt 0 for the rest of the game.
    const afterFS = resolveCombatDamage(fsCombat(), { firstStrikeStep: true });
    expect(findPermanent(afterFS, "att").permanent.removedFromCombat).toBe(true);

    const atEoc = runStepActions({ ...afterFS, phase: "combat", step: "end-of-combat", activePlayer: "user" });
    expect(findPermanent(atEoc, "att").permanent.removedFromCombat).toBe(false);
    expect(atEoc.combat.attackers).toEqual([]);

    // NEXT combat: the regenerated creature attacks unblocked — it must deal its 5 damage again.
    const nextCombat = {
      ...atEoc,
      players: { ...atEoc.players, user: { ...atEoc.players.user, battlefield: atEoc.players.user.battlefield.map(p => ({ ...p, tapped: false })) } },
      combat: { attackers: [{ permanentId: "att", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    };
    const afterNext = resolveCombatDamage(nextCombat, { firstStrikeStep: false });
    expect(afterNext.players.ai.life).toBe(35); // 40 - 5 (the bug left this at 40 forever)
  });

  it("beginning-of-combat defensively drops a stale removed-from-combat flag too", () => {
    const afterFS = resolveCombatDamage(fsCombat(), { firstStrikeStep: true });
    const atBoc = runStepActions({ ...afterFS, phase: "combat", step: "beginning-of-combat", activePlayer: "user" });
    expect(findPermanent(atBoc, "att").permanent.removedFromCombat).toBe(false);
  });
});
