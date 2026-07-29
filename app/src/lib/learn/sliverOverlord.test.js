/**
 * sliverOverlord.test.js — Sliver Overlord (5-color Sliver commander) made fully native.
 *
 * Sliver Overlord — "Legendary Creature — Sliver Mutant", {W}{U}{B}{R}{G}:
 *   {3}: Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.
 *   {3}: Gain control of target Sliver. (This effect lasts indefinitely.)
 *
 * TWO activated abilities, BOTH genuinely resolving at runtime:
 *   1. TUTOR-A-SLIVER — the shipped tutor atom (op:"tutor") with a `sliver` type-filter (TUTOR_FILTER_WORDS
 *      already lists "sliver"): searches the controller's library, pending-choice picks a Sliver card, puts
 *      it to hand, shuffles. Nothing new — proven by the tutor family.
 *   2. GAIN-CONTROL (this slice) — the NEW op:"gain-control" atom (effects/atoms/control.js). An INDEFINITE
 *      (non-reverting) control change: the target Sliver is physically moved into the controller's battlefield
 *      and its `controller` flips, becoming summoning-sick under the new controller (CR 702.10c). The subtype
 *      restriction rides as {kind:"subtype", subtype:"sliver"} so enumerateTargets offers ONLY a Sliver.
 *
 * THE CREED (all-or-nothing): Sliver Overlord classifies native-activated ONLY because BOTH abilities are
 * modeled. The anti-FP pins below prove the boundaries: a non-Sliver is NOT a legal control target; the
 * control change genuinely moves the permanent + summoning-sicks it + preserves its other state; and the
 * near-miss forms (until-end-of-turn / controller-restricted / "another" / a color word) all stay LOW → Arbiter.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { applyGainControl } from "./effects/atoms/control.js";

beforeEach(() => _resetIdsForTests());

const SLIVER_OVERLORD = {
  name: "Sliver Overlord",
  type: "Legendary Creature — Sliver Mutant",
  mana_cost: "{W}{U}{B}{R}{G}",
  oracle:
    "{3}: Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.\n{3}: Gain control of target Sliver. (This effect lasts indefinitely.)",
};

const atomOf = (oracle) => parseEffectClause(oracle).atoms[0];
const cre = (id, type, controller = "user", extra = {}) =>
  createPermanent({ id, card: { id, name: id, type }, controller, ...extra });
const boardWith = (perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = { user: [], ai: [] };
  for (const p of perms) bf[p.controller].push(p);
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf.user }, ai: { ...s.players.ai, battlefield: bf.ai } } };
};
const ids = (ts) => ts.map((t) => t.id).sort();

// ─── Classification: BOTH activated abilities modeled → native-activated ─────────────────────────────
describe("Sliver Overlord — classification", () => {
  it("classifies NATIVE (native-activated: BOTH activated abilities modeled)", () => {
    expect(classifyCard(SLIVER_OVERLORD)).toBe("native-activated");
    expect(isNativeTier(classifyCard(SLIVER_OVERLORD))).toBe(true);
  });

  it("both activated abilities are MODELED with HIGH effect programs", () => {
    const abs = parseActivatedAbilities(SLIVER_OVERLORD);
    expect(abs).toHaveLength(2);
    expect(abs.every((a) => a.modeled)).toBe(true);
    expect(abs.map((a) => programConfidence(a.program))).toEqual(["high", "high"]);
  });

  it("the tutor ability parses to a Sliver-filtered tutor atom (unchanged shipped path)", () => {
    const atom = atomOf("Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.");
    expect(atom.op).toBe("tutor");
    expect(atom.filter).toEqual({ groups: [["sliver"]] });
    expect(atom.destination).toBe("hand");
  });

  it("the gain-control ability parses to a gain-control atom carrying a Sliver subtype restriction", () => {
    const atom = atomOf("Gain control of target Sliver.");
    expect(atom.op).toBe("gain-control");
    expect(atom.targetType).toBe("creature");
    expect(atom.restrictions).toEqual([{ kind: "subtype", subtype: "sliver" }]);
  });
});

// ─── Runtime: the control change genuinely resolves ──────────────────────────────────────────────────
describe("Sliver Overlord — gain-control runtime", () => {
  it("RUNTIME: ONLY a Sliver is a legal target — a non-Sliver is NOT (anti-FP pin)", () => {
    const s = boardWith([
      cre("overlord", "Legendary Creature — Sliver Mutant", "user"),
      cre("aiSliver", "Creature — Sliver Warrior", "ai"),
      cre("aiBear", "Creature — Bear", "ai"),
    ]);
    const atom = atomOf("Gain control of target Sliver.");
    const legal = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions });
    // "target Sliver" has no controller clause → any Sliver (own Mutant or the enemy Sliver) is legal; the Bear is NOT.
    expect(ids(legal)).toEqual(["aiSliver", "overlord"]);
    expect(ids(legal)).not.toContain("aiBear");
  });

  it("RUNTIME: gaining control MOVES the Sliver to the new controller's battlefield and flips its controller", () => {
    const s = boardWith([
      cre("overlord", "Legendary Creature — Sliver Mutant", "user"),
      cre("aiSliver", "Creature — Sliver Warrior", "ai", { summoningSick: false }),
    ]);
    const atom = atomOf("Gain control of target Sliver.");
    const next = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "aiSliver" }] });
    const lk = findPermanent(next, "aiSliver");
    expect(lk.controller).toBe("user");
    // ⚠️ AND THE PERMANENT'S OWN FIELD, which is a DIFFERENT fact. findPermanent reports which battlefield
    // ARRAY the permanent sits in; `.controller` is a field on the permanent, and ~628 sites in this engine
    // read the field. They can silently disagree: breaking the shared mover so the field never flipped left
    // the entire 12,276-test suite green, because nothing anywhere asserted it. Added when that witness
    // exposed the gap (the control-Aura path had the identical hole).
    expect(lk.permanent.controller).toBe("user");
    expect(next.players.user.battlefield.map((p) => p.id).sort()).toEqual(["aiSliver", "overlord"]);
    expect(next.players.ai.battlefield.map((p) => p.id)).toEqual([]);
  });

  it("RUNTIME: the gained creature becomes summoning-sick under the new controller (CR 702.10c), other state preserved", () => {
    const s = boardWith([
      cre("aiSliver", "Creature — Sliver Warrior", "ai", { summoningSick: false, tapped: true }),
    ]);
    // seed a counter so we can assert it survives the move
    s.players.ai.battlefield[0].counters = { "+1/+1": 2 };
    const atom = atomOf("Gain control of target Sliver.");
    const next = applyGainControl(s, atom, { controller: "user", targets: [{ type: "creature", id: "aiSliver" }] });
    const lk = findPermanent(next, "aiSliver");
    expect(lk.permanent.summoningSick).toBe(true);   // sick under the NEW controller
    expect(lk.permanent.tapped).toBe(true);           // tapped state preserved
    expect(lk.permanent.counters).toEqual({ "+1/+1": 2 }); // counters preserved
  });

  it("RUNTIME: gaining control of a Sliver you ALREADY control is a clean no-op", () => {
    const s = boardWith([cre("mySliver", "Creature — Sliver Warrior", "user")]);
    const atom = atomOf("Gain control of target Sliver.");
    const next = applyGainControl(s, atom, { controller: "user", targets: [{ type: "creature", id: "mySliver" }] });
    expect(next.players.user.battlefield.map((p) => p.id)).toEqual(["mySliver"]);
  });

  it("RUNTIME: a target that left the battlefield is a clean no-op (CR 608.2b), never a throw", () => {
    const s = boardWith([cre("aiSliver", "Creature — Sliver Warrior", "ai")]);
    const atom = atomOf("Gain control of target Sliver.");
    const next = applyGainControl(s, atom, { controller: "user", targets: [{ type: "creature", id: "ghost" }] });
    expect(next.players.ai.battlefield.map((p) => p.id)).toEqual(["aiSliver"]); // untouched
    expect(next.players.user.battlefield.map((p) => p.id)).toEqual([]);
  });
});

// ─── CREED anti-FP gates — every non-indefinite / restricted / non-subtype form stays LOW → Arbiter ──
describe("Sliver Overlord — CREED anti-FP gates (gain-control)", () => {
  it('"gain control of target creature" (bare, indefinite) IS modeled', () => {
    const p = parseEffectClause("Gain control of target creature.");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "gain-control", targetType: "creature", restrictions: [] });
  });

  it('"until end of turn" (Threaten — a REVERTING control change) stays LOW (revert not modeled)', () => {
    expect(programConfidence(parseEffectClause("Gain control of target creature until end of turn."))).toBe("low");
  });

  it('a controller-restricted "you control" form stays LOW (restriction not folded)', () => {
    expect(programConfidence(parseEffectClause("Gain control of target Sliver you control."))).toBe("low");
  });

  it('an "another target Sliver" form stays LOW (source-exclusion not modeled)', () => {
    expect(programConfidence(parseEffectClause("Gain control of another target Sliver."))).toBe("low");
  });

  it('a non-subtype word after "target" (a COLOR) is NOT credited as a subtype control-grab', () => {
    const p = parseEffectClause("Gain control of target green creature.");
    expect(programConfidence(p)).toBe("low");
  });

  it("a NON-curated subtype word after 'target' does not fabricate a subtype filter", () => {
    // "assembly-worker" is a real subtype but NOT in TARGET_SUBTYPES → must stay LOW (never a fabricated grab).
    expect(programConfidence(parseEffectClause("Gain control of target assembly-worker."))).toBe("low");
  });
});
