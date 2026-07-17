/**
 * cantBeBlocked.test.js — CANT-BE-BLOCKED: "target creature can't be blocked this turn" (the mirror of
 * CANT-BLOCK).
 *
 * A new `cant-be-blocked` atom: a layer-6 endOfTurn grant of the "unblockable" keyword on the target,
 * enforced by the EXISTING combatEvasion.canBlockAttacker (it already refuses every block of a creature with
 * a granted "unblockable" — the Herald of Secret Streams precedent), layer-aware so it wears off at cleanup
 * (CR 514.2). OWN-side intent — you make YOUR attacker unblockable to push damage, so the trigger-flush
 * chooser picks the controller's own creature.
 *
 * Coverage: combat-trick spells (Infiltrate, Artful Dodge, Trailblazer) + mana/tap/sac activated abilities
 * (Coralhelm Guide, Wormhole Serpent, Cephalid Pathmage) + ETB/attack/constellation triggers flip native.
 * A qualified "…except by <X>" or a conditional ("if it's attacking") stays on the Arbiter. (A leading Devoid
 * keyword line no longer parks the spell — BLITZ DV-1 strips that resolution-invariant CDA line, so Slip
 * Through Space's "can't be blocked + draw" body flips native; see devoidPolicy.test.js.)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence, atomTargetIntent, programTriggerTargetsResolvable, parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature — Human Wizard") => ({ name, oracle, type, keywords: [], mana: "{1}{U}" });

// ─── 1. Parser + intent ─────────────────────────────────────────────────────────
describe("cant-be-blocked — parser + intent", () => {
  it("'target creature can't be blocked this turn' → cant-be-blocked atom HIGH", () => {
    const p = parseEffectClause("target creature can't be blocked this turn", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "cant-be-blocked", targetType: "creature" }]);
  });
  it("the 'you control' form carries the controller restriction", () => {
    expect(parseEffectClause("target creature you control can't be blocked this turn", "Instant").atoms)
      .toEqual([{ op: "cant-be-blocked", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }]);
  });
  it("intent is OWN (make your attacker unblockable) → resolvable on the trigger path", () => {
    expect(atomTargetIntent({ op: "cant-be-blocked", targetType: "creature" })).toBe("own");
    expect(programTriggerTargetsResolvable(parseEffectProgram({ type: "Instant", oracle: "Target creature can't be blocked this turn." }))).toBe(true);
  });
  it("CREED: a qualified / conditional variant does NOT match the bare atom", () => {
    expect(programConfidence(parseEffectClause("target creature can't be blocked this turn except by walls", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("target creature can't be blocked this combat", "Instant"))).toBe("low");
  });
});

// ─── 2. Resolver + combat enforcement ─────────────────────────────────────────────
describe("cant-be-blocked — resolver grants unblockable, canBlockAttacker enforces it", () => {
  function combatState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const attacker = createPermanent({ id: "atk", card: { id: "atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const blocker = createPermanent({ id: "blk", card: { id: "blk", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "ai" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [attacker] }, ai: { ...s.players.ai, battlefield: [blocker] } } };
  }
  it("a creature CAN be blocked before, CANNOT after cant-be-blocked is applied to it", () => {
    const s = combatState();
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);
    const after = resolveAtom(s, { op: "cant-be-blocked", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [{ type: "creature", id: "atk" }] });
    expect(canBlockAttacker(after, "blk", "atk", "ai")).toBe(false); // no blocker can block the now-unblockable attacker
  });
  it("only the TARGETED attacker becomes unblockable (another attacker is unaffected)", () => {
    let s = combatState();
    const atk2 = createPermanent({ id: "atk2", card: { id: "atk2", name: "Ox", type: "Creature — Ox", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, atk2] } } };
    const after = resolveAtom(s, { op: "cant-be-blocked", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [{ type: "creature", id: "atk" }] });
    expect(canBlockAttacker(after, "blk", "atk", "ai")).toBe(false);  // targeted → unblockable
    expect(canBlockAttacker(after, "blk", "atk2", "ai")).toBe(true);  // untargeted → still blockable
  });
  it("no chosen target → clean no-op (no throw)", () => {
    const s = combatState();
    const after = resolveAtom(s, { op: "cant-be-blocked", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [] });
    expect(canBlockAttacker(after, "blk", "atk", "ai")).toBe(true);
  });
});

// ─── 3. Coverage flips ────────────────────────────────────────────────────────────
describe("cant-be-blocked — coverage: spells, activated abilities, triggers flip native", () => {
  it("a combat-trick spell → native-spell (incl. a +draw rider)", () => {
    expect(classifyCard({ name: "Infiltrate", oracle: "Target creature can't be blocked this turn.", type: "Instant", mana: "{1}{U}" })).toBe("native-spell");
    expect(classifyCard({ name: "Enter the Enigma", oracle: "Target creature can't be blocked this turn.\nDraw a card.", type: "Sorcery", mana: "{2}{U}" })).toBe("native-spell");
  });
  it("a mana / tap / sac activated ability → native-activated", () => {
    expect(classifyCard(C("Coralhelm Guide", "{4}{U}: Target creature can't be blocked this turn.", "Creature — Merfolk Scout"))).toBe("native-activated");
    expect(classifyCard(C("Suspicious Bookcase", "Defender\n{3}, {T}: Target creature can't be blocked this turn.", "Artifact Creature — Wall"))).toBe("native-activated");
  });
  it("ETB / attack / constellation triggers → native-trigger", () => {
    expect(classifyCard(C("Neurok Invisimancer", "This creature can't be blocked.\nWhen this creature enters, target creature can't be blocked this turn."))).toMatch(/^native/);
    expect(classifyCard(C("Whitewater Naiads", "Constellation — Whenever this creature or another enchantment you control enters, target creature can't be blocked this turn.", "Enchantment Creature — Nymph"))).toBe("native-trigger");
  });
});

// ─── 4. CREED guards ──────────────────────────────────────────────────────────────
describe("cant-be-blocked — CREED: non-qualifying forms stay non-native", () => {
  it("an 'except by <X>' qualified form stays non-native", () => {
    expect(classifyCard({ name: "Fast", oracle: "Target creature gains haste until end of turn. It can't be blocked this turn except by Vehicles or by creatures with haste.", type: "Instant", mana: "{1}{R}" })).not.toMatch(/^native/);
  });
  it("a conditional 'if it's attacking, it can't be blocked' stays non-native (Sewers of Estark)", () => {
    expect(classifyCard({ name: "Sewers of Estark", oracle: "Choose target creature. If it's attacking, it can't be blocked this turn. If it's blocking, prevent all combat damage that would be dealt this combat by it and each creature it's blocking.", type: "Instant", mana: "{2}{B}" })).not.toMatch(/^native/);
  });
});
