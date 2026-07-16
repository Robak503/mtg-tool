/**
 * cantBlock.test.js — CANT-BLOCK: "target creature can't block this turn".
 *
 * A new `cant-block` atom: a layer-6 endOfTurn grant of the "cantBlock" keyword on the target creature,
 * enforced by combatEvasion.canBlockAttacker (permanentHasKeyword, layer-aware) so it wears off at cleanup
 * (CR 514.2) exactly like a combat-trick keyword grant. ENEMY-side intent — you disable an opponent's
 * blocker to push damage, so the trigger-flush chooser picks an opponent's creature.
 *
 * Coverage: 17 Goblin-Shortcutter-style permanents (ETB / attack triggers) flip body-only → native-trigger.
 * Activated-ability cant-block, optional "pay" riders, restricted/mass targets, and auras with extra text
 * stay on the Arbiter.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence, atomTargetIntent, programTriggerTargetsResolvable, parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature — Goblin") => ({ name, oracle, type, keywords: [], mana: "" });

// ─── 1. Parser + intent ─────────────────────────────────────────────────────────
describe("cant-block — parser + intent", () => {
  it("'target creature can't block this turn' → cant-block atom HIGH", () => {
    const p = parseEffectClause("target creature can't block this turn", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "cant-block", targetType: "creature" }]);
  });
  it("intent is ENEMY (disable an opponent's blocker) → resolvable on the trigger path", () => {
    expect(atomTargetIntent({ op: "cant-block", targetType: "creature" })).toBe("enemy");
    expect(programTriggerTargetsResolvable(parseEffectProgram({ type: "Instant", oracle: "Target creature can't block this turn." }))).toBe(true);
  });
  it("the 'an opponent controls' restriction now parses (distinct atom); mass / 'this combat' variants still drop", () => {
    // "an opponent controls" is modeled as cant-block + the opponent controller restriction (same enemy intent).
    expect(parseEffectClause("target creature an opponent controls can't block this turn", "Instant").atoms[0])
      .toMatchObject({ op: "cant-block", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] });
    // …but a MASS ("creatures without flying") or a "this combat" duration variant still fails the exact anchor → LOW.
    expect(programConfidence(parseEffectClause("creatures without flying can't block this turn", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("target creature can't block this combat", "Instant"))).toBe("low");
  });
});

// ─── 2. Resolver + combat enforcement ─────────────────────────────────────────────
describe("cant-block — resolver grants the restriction, canBlockAttacker enforces it", () => {
  function combatState() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const attacker = createPermanent({ id: "atk", card: { id: "atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const blocker = createPermanent({ id: "blk", card: { id: "blk", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "ai" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [attacker] }, ai: { ...s.players.ai, battlefield: [blocker] } } };
  }
  it("a creature CAN block before, CANNOT after cant-block is applied to it", () => {
    const s = combatState();
    expect(canBlockAttacker(s, "blk", "atk", "user")).toBe(true);
    const after = resolveAtom(s, { op: "cant-block", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [{ type: "creature", id: "blk" }] });
    expect(canBlockAttacker(after, "blk", "atk", "user")).toBe(false);
  });
  it("only the TARGETED creature is restricted (another blocker is unaffected)", () => {
    let s = combatState();
    const blocker2 = createPermanent({ id: "blk2", card: { id: "blk2", name: "Golem", type: "Creature — Golem", power: 3, toughness: 3 }, controller: "ai" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, blocker2] } } };
    const after = resolveAtom(s, { op: "cant-block", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [{ type: "creature", id: "blk" }] });
    expect(canBlockAttacker(after, "blk", "atk", "user")).toBe(false);  // targeted
    expect(canBlockAttacker(after, "blk2", "atk", "user")).toBe(true);   // untargeted
  });
  it("no chosen target → clean no-op (no throw)", () => {
    const s = combatState();
    const after = resolveAtom(s, { op: "cant-block", targetType: "creature" }, { controller: "user", sourceId: "atk", targets: [] });
    expect(canBlockAttacker(after, "blk", "atk", "user")).toBe(true);
  });
});

// ─── 3. Coverage flips ────────────────────────────────────────────────────────────
describe("cant-block — coverage: the Goblin-Shortcutter family flips native-trigger", () => {
  it("ETB cant-block → native-trigger", () => {
    expect(classifyCard(C("Goblin Shortcutter", "When this creature enters, target creature can't block this turn."))).toBe("native-trigger");
    expect(classifyCard(C("Crossway Vampire", "When this creature enters, target creature can't block this turn.", "Creature — Vampire"))).toBe("native-trigger");
  });
  it("attack-trigger cant-block → native-trigger", () => {
    expect(classifyCard(C("Mardu Roughrider", "Whenever this creature attacks, target creature can't block this turn.", "Creature — Orc Warrior"))).toBe("native-trigger");
    expect(classifyCard(C("Fervent Cathar", "Haste\nWhenever this creature attacks, target creature can't block this turn.", "Creature — Human"))).toBe("native-trigger");
  });
  it("cant-block + a covered keyword → native-trigger", () => {
    expect(classifyCard(C("Voldaren Duelist", "Haste\nWhen this creature enters, target creature can't block this turn.", "Creature — Vampire Soldier"))).toBe("native-trigger");
  });
});

// ─── 4. CREED guards ──────────────────────────────────────────────────────────────
describe("cant-block — CREED: non-qualifying forms stay non-native", () => {
  it("the ACTIVATED cant-block flips (DC-1 graduation — the discard cost was the real gate all along)", () => {
    // (Bola Warrior sat here titled "activated path unmodeled", but the cant-block atom + the activation
    // machinery always modeled it — only its "Discard a card" COST was unpayable. γ1h pays it now.)
    expect(classifyCard(C("Bola Warrior", "{R}, {T}, Discard a card: Target creature can't block this turn.", "Creature — Human Warrior"))).toBe("native-activated");
  });
  it("an optional 'pay then' rider stays body-only", () => {
    expect(classifyCard(C("Frenzied Goblin", "Whenever this creature attacks, you may pay {R}. If you do, target creature can't block this turn."))).not.toMatch(/^native/);
  });
  it("a mass 'creatures without flying can't block' stays body-only", () => {
    expect(classifyCard(C("Seismic Elemental", "When this creature enters, creatures without flying can't block this turn.", "Creature — Elemental"))).not.toMatch(/^native/);
  });
});
