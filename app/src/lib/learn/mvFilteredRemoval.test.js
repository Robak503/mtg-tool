/**
 * MV-FILTERED removal (EXILE/DESTROY-AS-REMOVAL slice) — "(Exile|Destroy) target <type> with mana value N or
 * (greater|less)". The MV-gated single-target removal staples: Despark ("permanent … 4 or greater"), Eliminate
 * ("creature or planeswalker … 3 or less"), Epic Downfall / Kin-Tree Severance, Death in the Family, Fragmentize /
 * Natural State. The mana value rides as a `manaValue` target restriction (CR 202.3) — the SAME restriction kind the
 * tap-target-creature path already enforces (creatureSatisfiesRestrictions), now honored for permanent + planeswalker
 * targets by enumerateTargets too.
 *
 * CREED invariants under test:
 *  - The MV filter is GENUINELY enforced at enumeration — only a permanent whose mana value satisfies the comparison
 *    is offered (an out-of-band-MV target is NEVER a legal target — a forbidden FP if it were).
 *  - The exile/destroy resolver GENUINELY removes the chosen target (it leaves the battlefield).
 *  - Anti-FP: a controller-restricted MV form (none in corpus) and an unmodeled MV-X / converge form stay LOW.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
// A card with a mana value (cmc) — the manaValue restriction reads perm.card.cmc.
const permMv = (id, name, type, controller, cmc) => createPermanent({ id, card: { id, name, type, cmc }, controller });
// A board spanning the MV spectrum + every permanent kind the MV filter scopes:
//   cheap creature (cmc 2), expensive creature (cmc 5), a cmc-3 artifact, a cmc-4 enchantment, a cmc-6 planeswalker.
const mvBoard = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const pw = createPermanent({ id: "apw", card: { id: "apw", name: "FoeWalker", type: "Planeswalker — Test", cmc: 6 }, controller: "ai" });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [permMv("ucheap", "MyBear", "Creature — Bear", "user", 2)] },
      ai: {
        ...s.players.ai,
        battlefield: [
          permMv("abig", "FoeDragon", "Creature — Dragon", "ai", 5),
          permMv("aart", "FoeRock", "Artifact", "ai", 3),
          permMv("aench", "FoeAura", "Enchantment", "ai", 4),
          { ...pw, counters: { loyalty: 4 } },
        ],
      },
    },
  };
};

describe("parser — MV-filtered exile/destroy", () => {
  it("parses each printed form to a manaValue restriction (>= for greater/more, <= for less)", () => {
    expect(parseEffectProgram(I("Exile target permanent with mana value 4 or greater.")).atoms)
      .toEqual([{ op: "exile", targetType: "permanent", restrictions: [{ kind: "manaValue", op: ">=", value: 4 }] }]);
    expect(parseEffectProgram(I("Exile target creature with mana value 3 or less.")).atoms)
      .toEqual([{ op: "exile", targetType: "creature", restrictions: [{ kind: "manaValue", op: "<=", value: 3 }] }]);
    expect(parseEffectProgram(I("Destroy target creature or planeswalker with mana value 3 or less.")).atoms)
      .toEqual([{ op: "destroy", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "manaValue", op: "<=", value: 3 }] }]);
    expect(parseEffectProgram(I("Destroy target artifact or enchantment with mana value 4 or less.")).atoms)
      .toEqual([{ op: "destroy", targetType: "artifactOrEnchantment", restrictions: [{ kind: "manaValue", op: "<=", value: 4 }] }]);
    // "or more" is accepted as a synonym for "or greater".
    expect(parseEffectProgram(I("Exile target permanent with mana value 3 or more.")).atoms)
      .toEqual([{ op: "exile", targetType: "permanent", restrictions: [{ kind: "manaValue", op: ">=", value: 3 }] }]);
    // every form parses HIGH (op is KNOWN) → spellIsNative
    for (const o of ["Exile target permanent with mana value 4 or greater.", "Destroy target creature or planeswalker with mana value 3 or less."]) {
      expect(programConfidence(parseEffectProgram(I(o)))).toBe("high");
    }
  });
  it("anti-FP — an unmodeled MV-X / converge / controller-conjoined form stays LOW (whole-card CREED, never a partial)", () => {
    // Prismatic Ending — "if its mana value is less than or equal to the number of colors of mana spent" (converge X)
    expect(programConfidence(parseEffectProgram(I("Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell.")))).toBe("low");
    // March of Otherworldly Light — "with mana value X or less" (X is a cast-time variable, not a printed number)
    expect(programConfidence(parseEffectProgram(I("Exile target artifact, creature, or enchantment with mana value X or less.")))).toBe("low");
    // Excise the Imperfect — exile + an UNMODELED "incubates X" rider drags the whole card low
    expect(programConfidence(parseEffectProgram(I("Exile target nonland permanent. Its controller incubates X, where X is its mana value.")))).toBe("low");
  });
});

describe("enumeration (CREED edges) — the MV filter offers ONLY legal-MV targets across every scoped type", () => {
  it("'permanent with mana value 4 or greater' offers exactly the cmc>=4 permanents (Despark)", () => {
    const s = mvBoard();
    const ge4 = enumerateTargets(s, "user", { kind: "exile", targetType: "permanent", restrictions: [{ kind: "manaValue", op: ">=", value: 4 }] }).map((t) => t.id).sort();
    // abig (5), aench (4), apw (6) qualify; aart (3) + ucheap (2) do NOT.
    expect(ge4).toEqual(["abig", "aench", "apw"]);
    expect(ge4).not.toContain("aart");   // cmc 3 < 4 — CREED: never offered
    expect(ge4).not.toContain("ucheap"); // cmc 2 < 4
  });
  it("'permanent with mana value 3 or less' offers exactly the cmc<=3 permanents", () => {
    const s = mvBoard();
    const le3 = enumerateTargets(s, "user", { kind: "exile", targetType: "permanent", restrictions: [{ kind: "manaValue", op: "<=", value: 3 }] }).map((t) => t.id).sort();
    // aart (3) + ucheap (2) qualify; abig (5), aench (4), apw (6) do NOT.
    expect(le3).toEqual(["aart", "ucheap"]);
    expect(le3).not.toContain("abig");
    expect(le3).not.toContain("apw");
  });
  it("'creature or planeswalker with mana value 3 or less' (Eliminate) honors MV on BOTH the creature and planeswalker side", () => {
    const s = mvBoard();
    // ucheap (creature, 2) qualifies; abig (creature, 5) + apw (planeswalker, 6) are filtered out by MV.
    const le3 = enumerateTargets(s, "user", { kind: "destroy", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "manaValue", op: "<=", value: 3 }] }).map((t) => t.id).sort();
    expect(le3).toEqual(["ucheap"]);
    expect(le3).not.toContain("apw");  // a cmc-6 planeswalker is NOT a legal "mana value 3 or less" target — CREED
    expect(le3).not.toContain("abig"); // a cmc-5 creature likewise
    // a HIGH-MV planeswalker IS offered when the bound goes the other way (>= 4 catches the cmc-6 walker)
    const ge4 = enumerateTargets(s, "user", { kind: "destroy", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "manaValue", op: ">=", value: 4 }] }).map((t) => t.id).sort();
    expect(ge4).toEqual(["abig", "apw"]);
  });
  it("'artifact or enchantment with mana value 4 or less' (Fragmentize) scopes by type AND mana value", () => {
    const s = mvBoard();
    // aart (artifact, 3) + aench (enchantment, 4) qualify; the creatures/planeswalker are off-type.
    const r = enumerateTargets(s, "user", { kind: "destroy", targetType: "artifactOrEnchantment", restrictions: [{ kind: "manaValue", op: "<=", value: 4 }] }).map((t) => t.id).sort();
    expect(r).toEqual(["aart", "aench"]);
  });
});

describe("runtime — exile GENUINELY removes the MV-filtered target (it leaves play)", () => {
  it("exile moves the chosen permanent to exile (not the graveyard) — Despark on the cmc-6 walker", () => {
    const s = ATOM_RESOLVERS.exile(mvBoard(), { op: "exile", targetType: "permanent", restrictions: [{ kind: "manaValue", op: ">=", value: 4 }] }, { controller: "user", targets: [{ type: "planeswalker", id: "apw" }] });
    expect(s.players.ai.battlefield.some((p) => p.id === "apw")).toBe(false); // GENUINELY removed
    expect((s.players.ai.exile || []).map((c) => c.id)).toContain("apw");     // to exile, not graveyard
  });
  it("destroy sends an MV-filtered creature to its owner's graveyard (dies path) — Eliminate on the cheap bear", () => {
    const s = ATOM_RESOLVERS.destroy(mvBoard(), { op: "destroy", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "manaValue", op: "<=", value: 3 }] }, { controller: "user", targets: [{ type: "creature", id: "ucheap" }] });
    expect(s.players.user.battlefield.some((p) => p.id === "ucheap")).toBe(false);
    expect(s.players.user.graveyard.map((c) => c.id)).toContain("ucheap");
  });
});

describe("classification — the MV-filtered removal staples flip native-spell; unmodeled MV forms PARK", () => {
  const S = (name, oracle, type, mana) => ({ name, type, mana, oracle });
  it("the 7 clean single-sentence MV-filtered removal cards flip native-spell", () => {
    expect(classifyCard(S("Despark", "Exile target permanent with mana value 4 or greater.", "Instant", "{W}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Eliminate", "Destroy target creature or planeswalker with mana value 3 or less.", "Instant", "{1}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Epic Downfall", "Exile target creature with mana value 3 or greater.", "Sorcery", "{1}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Kin-Tree Severance", "Exile target permanent with mana value 3 or greater.", "Instant", "{2}{W}"))).toBe("native-spell");
    expect(classifyCard(S("Death in the Family", "Exile target creature with mana value 3 or less.", "Instant", "{1}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Fragmentize", "Destroy target artifact or enchantment with mana value 4 or less.", "Sorcery", "{W}"))).toBe("native-spell");
    expect(classifyCard(S("Natural State", "Destroy target artifact or enchantment with mana value 3 or less.", "Instant", "{G}"))).toBe("native-spell");
  });
  it("regression — the already-native exile/destroy staples stay native-spell (additive change, 0 lost)", () => {
    expect(classifyCard(S("Swords to Plowshares", "Exile target creature. Its controller gains life equal to its power.", "Instant", "{W}"))).toBe("native-spell");
    expect(classifyCard(S("Vindicate", "Destroy target permanent.", "Sorcery", "{1}{W}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Anguished Unmaking", "Exile target nonland permanent. You lose 3 life.", "Instant", "{1}{W}{B}"))).toBe("native-spell");
  });
  it("anti-FP — the unmodeled-rider / MV-X / converge cards stay on the Arbiter (whole-card CREED)", () => {
    // GRADUATED (play-weighted P·19, 2026-10-01): Reality Shift's manifest rider is modeled now (the controller-rider manifest +
    // the turn-face-up special action — realityShift.test.js), so it is asserted positively; the two below hold the refusal.
    expect(classifyCard(S("Reality Shift", "Exile target creature. Its controller manifests the top card of their library.", "Instant", "{1}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Prismatic Ending", "Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell.", "Sorcery", "{W}"))).toBe("arbiter-spell");
    expect(classifyCard(S("March of Otherworldly Light", "Exile target artifact, creature, or enchantment with mana value X or less.", "Instant", "{X}{W}"))).toBe("arbiter-spell");
  });
});
