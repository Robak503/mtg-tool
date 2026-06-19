/**
 * KW-UNTARGET — hexproof / shroud target-legality enforcement (engine-first).
 *
 * `enumerateTargets` is the single chokepoint for ALL targeting (cast spells, activated abilities,
 * and the trigger-flush chooser all funnel through it via expandCastChoices), so one targetability
 * check there is complete coverage. THE CREED: a hexproof/shroud body is only honestly native because
 * the engine now refuses the illegal target. Ward is deliberately NOT an exclusion (it's a tax) —
 * a ward creature must stay a legal target, else we'd mis-resolve it (false positive).
 */
import { describe, it, expect } from "vitest";

import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

const atomOf = (text) => parseEffectProgram({ type: "Instant", oracle: text }).atoms[0];

function cr(name, id, controller, oracle = "", { type = "Creature — Bear", loyalty } = {}) {
  const perm = { id, card: { name, type, power: 2, toughness: 2, oracle }, controller, tapped: false, counters: {}, attachments: [], attachedTo: null, summoningSick: false };
  if (loyalty != null) perm.counters.loyalty = loyalty;
  return perm;
}
function st(userBf, aiBf = []) {
  return {
    players: { user: { battlefield: userBf, graveyard: [], life: 40 }, ai: { battlefield: aiBf, graveyard: [], life: 40 } },
    stack: [], combat: { attackers: [], blockers: [] },
  };
}
const ids = (ts) => ts.map((t) => t.id).sort();
const DESTROY_CREATURE = atomOf("Destroy target creature.");

describe("KW-UNTARGET — hexproof / shroud target-legality", () => {
  it("hexproof: not offered to an OPPONENT's removal, but IS to its own controller", () => {
    const s = st([cr("Stalker", "hp", "user", "Hexproof"), cr("Bear", "bear", "user")], [cr("Ogre", "ogre", "ai")]);
    expect(ids(enumerateTargets(s, "ai", DESTROY_CREATURE))).toEqual(["bear", "ogre"]);          // ai = opponent → hexproof excluded
    expect(ids(enumerateTargets(s, "user", DESTROY_CREATURE))).toEqual(["bear", "hp", "ogre"]);  // controller may target own hexproof
  });

  it("shroud: not offered to ANYONE — not even its controller", () => {
    const s = st([cr("Ledgewalker", "sh", "user", "Shroud"), cr("Bear", "bear", "user")]);
    expect(ids(enumerateTargets(s, "ai", DESTROY_CREATURE))).toEqual(["bear"]);
    expect(ids(enumerateTargets(s, "user", DESTROY_CREATURE))).toEqual(["bear"]); // controller can't either
  });

  it("ward is NOT an exclusion — a ward creature stays a legal target (its tax is deferred, not untargetability)", () => {
    const s = st([cr("Warded", "wd", "user", "Ward {2}"), cr("Bear", "bear", "user")]);
    expect(ids(enumerateTargets(s, "ai", DESTROY_CREATURE))).toEqual(["bear", "wd"]);
  });

  it("granted/printed-only is layer-aware: printed hexproof on the card is read via permanentHasKeyword", () => {
    // (printed path; the layer-aware read is the same permanentHasKeyword the rest of the engine uses)
    const s = st([cr("Aided", "a", "user", "Hexproof")], [cr("Killer", "k", "ai")]);
    expect(ids(enumerateTargets(s, "ai", DESTROY_CREATURE))).toEqual(["k"]); // a excluded for the ai caster
  });

  it("same chokepoint guards the planeswalker and permanent target paths", () => {
    const s = st([cr("Hexwalker", "pw", "user", "Hexproof", { type: "Planeswalker — Test", loyalty: 4 })]);
    expect(ids(enumerateTargets(s, "ai", atomOf("Destroy target planeswalker.")))).toEqual([]);       // opponent blocked
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target planeswalker.")))).toEqual(["pw"]); // own ok
    const s2 = st([cr("Shrouded Relic", "art", "user", "Shroud", { type: "Artifact" })]);
    expect(ids(enumerateTargets(s2, "ai", atomOf("Destroy target artifact.")))).toEqual([]);
    expect(ids(enumerateTargets(s2, "user", atomOf("Destroy target artifact.")))).toEqual([]);       // shroud: even controller
  });

  it("classification: hexproof/shroud bodies are native (now honest); ward stays native (interim-FP)", () => {
    // Pure keyword bodies — landwalk/unblockable combos depend on EVADE (a separate, unmerged branch).
    expect(classifyCard({ type: "Creature — Rogue", name: "Hexy", oracle: "Hexproof" })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Elf Druid", name: "Reachy", oracle: "Hexproof, reach" })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Spirit", name: "Shroudy", oracle: "Shroud" })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Elf Knight", name: "Warded", oracle: "Ward {2}" })).toBe("native-body");
  });
});
