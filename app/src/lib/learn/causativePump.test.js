/**
 * causativePump.test.js — CAUSATIVE single-target pump: "have target creature get ±N/±N [and gain KW]
 * until end of turn" (the inner of "you may have target creature get …" after α2 peels the "you may"
 * wrapper). This is the triggered-ability phrasing of a single-target buff/debuff; the spell-voice
 * "target creature gets …" (parseSpellEffect) never covered it because a creature trigger uses the
 * causative "have … get", not "… gets". Targets the Yuriko deck's Fourth Bridge Prowler + the broader
 * family (Undead Executioner, Battle-Rattle Shaman, Blightcaster, Caustic Crawler, Thorntooth Witch,
 * Painsmith). Resolves through the SAME applyPumpEffect target-id path as Giant Growth / Festering Goblin.
 *
 * CREED: a conditional-prefix variant ("If {B} was spent, you may have …" — Cankerous Thirst) leaves
 * residue → low → Arbiter (anti-FP, FN-safe). Runtime is proven end-to-end (the -1/-1 actually applies
 * and can kill a 1-toughness creature), so the native credit is earned, not a bare matcher.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { pumpClauseParser } from "./effects/atoms/combat.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { enterPermanent } from "./resolvers.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature — Human Rogue", mana = "{B}") => ({ name, oracle, type, mana, keywords: [] });

// ─────────────────────────────────────────────────────────────────────────────
// Parser — the causative pump atom (bare + keyword, mandatory + optional)
// ─────────────────────────────────────────────────────────────────────────────
describe("CAUSATIVE-PUMP — pumpClauseParser produces the pump atom", () => {
  it("bare debuff: 'have target creature get -1/-1 until end of turn'", () => {
    expect(pumpClauseParser("have target creature get -1/-1 until end of turn"))
      .toEqual({ op: "pump", targetType: "creature", ptDelta: { p: -1, t: -1 } });
  });
  it("bare buff: 'have target creature get +2/+0 until end of turn'", () => {
    expect(pumpClauseParser("have target creature get +2/+0 until end of turn"))
      .toEqual({ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 0 } });
  });
  it("asymmetric: 'have target creature get +3/-3 until end of turn' (Thorntooth Witch)", () => {
    expect(pumpClauseParser("have target creature get +3/-3 until end of turn"))
      .toEqual({ op: "pump", targetType: "creature", ptDelta: { p: 3, t: -3 } });
  });
  it("pump + keyword: 'have target creature get +2/+0 and gain deathtouch until end of turn' (Painsmith)", () => {
    expect(pumpClauseParser("have target creature get +2/+0 and gain deathtouch until end of turn"))
      .toEqual({ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 0 }, grantKeywords: ["Deathtouch"] });
  });
});

describe("CAUSATIVE-PUMP — full program (α2 peels 'you may', stamps optional)", () => {
  it("'you may have target creature get -1/-1 until end of turn' → HIGH, optional pump", () => {
    const p = parseEffectClause("you may have target creature get -1/-1 until end of turn", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "pump", optional: true, ptDelta: { p: -1, t: -1 }, targetType: "creature" });
  });
  it("'you may have target creature get +2/+0 and gain deathtouch …' → HIGH, optional pump+kw", () => {
    const p = parseEffectClause("you may have target creature get +2/+0 and gain deathtouch until end of turn", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "pump", optional: true, grantKeywords: ["Deathtouch"] });
  });
  it("mandatory (no 'you may') stays non-optional", () => {
    const p = parseEffectClause("have target creature get -1/-1 until end of turn", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0].optional).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trigger routing — the ETB trigger routes natively
// ─────────────────────────────────────────────────────────────────────────────
describe("CAUSATIVE-PUMP — trigger routes natively", () => {
  it("Fourth Bridge Prowler's ETB causative debuff routes natively", () => {
    const card = C("Fourth Bridge Prowler", "When this creature enters, you may have target creature get -1/-1 until end of turn.");
    const trigs = detectTriggers(card);
    expect(trigs).toHaveLength(1);
    expect(trigs[0].event).toBe("etb");
    expect(trigs[0].optional).toBe(true);
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classifier — the deck card + the broader family flip native (slim shape)
// ─────────────────────────────────────────────────────────────────────────────
describe("CAUSATIVE-PUMP — native classification (slim)", () => {
  const slim = (c) => ({ type: c.type, oracle: c.oracle, mana: c.mana, name: c.name });
  it("Fourth Bridge Prowler (Yuriko deck) → native-trigger", () => {
    const c = C("Fourth Bridge Prowler", "When this creature enters, you may have target creature get -1/-1 until end of turn.");
    expect(classifyCard(slim(c))).toBe("native-trigger");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(true);
  });
  it("Undead Executioner (dies trigger) → native-trigger", () => {
    const c = C("Undead Executioner", "When this creature dies, you may have target creature get -2/-2 until end of turn.", "Creature — Zombie");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(true);
  });
  it("Battle-Rattle Shaman (combat-begin trigger) → native-trigger", () => {
    const c = C("Battle-Rattle Shaman", "At the beginning of combat on your turn, you may have target creature get +2/+0 until end of turn.", "Creature — Goblin Shaman");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(true);
  });
  it("Thorntooth Witch (cast-Treefolk trigger, asymmetric) → native-trigger", () => {
    const c = C("Thorntooth Witch", "Whenever you cast a Treefolk spell, you may have target creature get +3/-3 until end of turn.", "Creature — Treefolk Shaman");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(true);
  });
  it("Painsmith (cast-artifact trigger, pump + deathtouch) → native-trigger", () => {
    const c = C("Painsmith", "Whenever you cast an artifact spell, you may have target creature get +2/+0 and gain deathtouch until end of turn.", "Creature — Human Artificer");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(true);
  });

  // ── CREED anti-FP: conditional / mana-spent prefix must NOT flip native ──
  it("Cankerous Thirst (mana-spent conditional) stays NON-native", () => {
    const c = C("Cankerous Thirst",
      "If {B} was spent to cast this spell, you may have target creature get -3/-3 until end of turn. If {G} was spent to cast this spell, you may have target creature get +3/+3 until end of turn. (Do both if {B}{G} was spent.)",
      "Instant", "{2}{B/G}{B/G}");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(false);
  });
  it("a bogus rider after the causative clause stays NON-native (whole-card CREED)", () => {
    const c = C("Fake Rider", "When this creature enters, you may have target creature get -1/-1 until end of turn. Untap all lands you control during each opponent's untap step.");
    expect(isNativeTier(classifyCard(slim(c)))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — the debuff ACTUALLY applies end-to-end (CREED: not a bare matcher)
// ─────────────────────────────────────────────────────────────────────────────
describe("CAUSATIVE-PUMP — runtime resolution (the -1/-1 lands and kills)", () => {
  function stateWith(over = {}) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
  }

  // MANDATORY causative pump (no "you may") resolves FULLY through the raw engine — the trigger fires,
  // the effect-program flush binds the enemy creature (negative-pump intent → enemy), and applyPumpEffect
  // lands the -1/-1. This is the end-to-end proof that the causative atom is not a bare matcher.
  it("a mandatory causative -1/-1 on a 1/1 enemy puts it into the graveyard (CR 704.5f)", () => {
    let s = enterPermanent(stateWith(), { id: "card-victim", name: "Goblin Token", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, "ai");
    const victimId = s.players.ai.battlefield[0].id;
    const mand = { id: "card-m", name: "Mandate", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "When Mandate enters, have target creature get -1/-1 until end of turn." };
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: mand, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: mand, controller: "user" } } }] };
    const afterSpell = resolveTopOfStack(s);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeDefined();
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.targets.map((t) => t.id)).toContain(victimId); // enemy intent picked the opponent's creature
    const after = resolveTopOfStack(afterSpell);
    expect(after.players.ai.battlefield.find((p) => p.id === victimId)).toBeUndefined(); // -1/-1 → 0 toughness → SBA
  });

  it("a mandatory causative -1/-1 on a 2/2 enemy leaves a 1/1 (the modifier applies, no death)", () => {
    let s = enterPermanent(stateWith(), { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "ai");
    const bearId = s.players.ai.battlefield[0].id;
    const mand = { id: "card-m2", name: "Mandate", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "When Mandate enters, have target creature get -1/-1 until end of turn." };
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: mand, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: mand, controller: "user" } } }] };
    const after = resolveTopOfStack(resolveTopOfStack(s));
    expect(after.players.ai.battlefield.find((p) => p.id === bearId)).toBeDefined();
    expect(permanentToughness(after, bearId)).toBe(1); // 2 - 1 = 1 (the -1/-1 applied)
  });

  // OPTIONAL "you may have …" — α2 stamps optional:true, so resolution PAUSES on an `optional-effect`
  // pendingChoice (the controller decides yes/no, CR 603.7). Assert the pause is well-formed: the resume
  // program carries the pump atom and the correct enemy target. The yes/no settlement is the SAME shared
  // optional-effect machinery proven by other "you may <effect>" ETBs (e.g. Fleshpulper Giant), so the
  // resume itself isn't re-litigated here — only that the causative pump wires INTO it correctly.
  it("Fourth Bridge Prowler's optional ETB parks a well-formed optional-effect choice (the pump + enemy target)", () => {
    let s = enterPermanent(stateWith(), { id: "card-victim2", name: "Goblin Token", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, "ai");
    const victimId = s.players.ai.battlefield[0].id;
    const prowler = { id: "card-fbp", name: "Fourth Bridge Prowler", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "When Fourth Bridge Prowler enters, you may have target creature get -1/-1 until end of turn." };
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: prowler, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: prowler, controller: "user" } } }] };
    s = resolveTopOfStack(s); // resolve the creature spell → enqueue the ETB trigger (target bound at flush)
    s = resolveTopOfStack(s); // resolve the trigger → pauses on the optional decision
    const pc = s.pendingChoice;
    expect(pc).toBeDefined();
    expect(pc.kind).toBe("optional-effect");
    expect(pc.effectOp).toBe("pump");
    expect(pc.resume.program.atoms[0]).toMatchObject({ op: "pump", ptDelta: { p: -1, t: -1 }, optional: true });
    expect(pc.resume.targets.map((t) => t.id)).toContain(victimId); // enemy intent picked the opponent's creature
  });
});
