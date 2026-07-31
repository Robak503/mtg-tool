/**
 * massBlockLock.test.js — BLITZ FT-1 (the Falter class): "Creatures [without flying] can't block this
 * turn." A new no-target `mass-block-lock` atom storing ONE layer-6 endOfTurn `addKeyword cantBlock`
 * over a DYNAMIC selector (every creature, any controller; `withoutKeyword:"flying"` on the filtered
 * form). CR 611.2c: the clause modifies no characteristics — it modifies the RULES — so it "can affect
 * objects that weren't affected when that continuous effect began": a creature entering later this turn
 * is locked too, and one granted flying mid-turn escapes the filtered lock (matchesSelector's
 * withoutKeyword gate re-reads the layer-aware permanentHasKeyword per block-legality query — the
 * CR 509.1b restriction check). Enforced by the existing canBlockAttacker cantBlock read; wears off at
 * cleanup (CR 514.2). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword, addContinuousEffect, expireContinuousEffects } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ─── 1. Parser + intent ─────────────────────────────────────────────────────────
describe("mass-block-lock — parser + intent", () => {
  it("the filtered form → mass-block-lock atom (withoutKeyword: flying), HIGH", () => {
    const p = parseEffectClause("Creatures without flying can't block this turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "mass-block-lock", withoutKeyword: "flying" }]);
  });
  it("the bare form → mass-block-lock atom (no filter), HIGH", () => {
    const p = parseEffectClause("Creatures can't block this turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "mass-block-lock" }]);
  });
  it("no targetType → non-targeting (null intent — never needs a chosen target)", () => {
    expect(atomTargetIntent({ op: "mass-block-lock", withoutKeyword: "flying" })).toBe(null);
    expect(atomTargetIntent({ op: "mass-block-lock" })).toBe(null);
  });
});

// ─── 2. Coverage flips — the real carriers ───────────────────────────────────────
describe("mass-block-lock — coverage: the Falter class flips native-spell", () => {
  const S = (name, oracle, type) => ({ name, oracle, type, keywords: [], mana: "" });
  it("whole-text carriers → native-spell", () => {
    expect(classifyCard(S("Falter", "Creatures without flying can't block this turn.", "Instant"))).toBe("native-spell");
    expect(classifyCard(S("Magmatic Chasm", "Creatures without flying can't block this turn.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(S("Seismic Stomp", "Creatures without flying can't block this turn.", "Sorcery"))).toBe("native-spell");
  });
});

// ─── 3. CREED / FN guards — unevidenced variants and conditional carriers stay parked ─
describe("mass-block-lock — CREED: only the two evidenced whole clauses parse", () => {
  const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
  it("power-filtered variants do NOT parse (unevidenced as standalone; Temur Charm's is a modal mode)", () => {
    low("Creatures with power 4 or greater can't block this turn.");
    low("Creatures with power 3 or less can't block this turn.");
  });
  it("controller- / color- / type-filtered variants do NOT parse (parked with evidence)", () => {
    low("Creatures your opponents control can't block this turn."); // Cosmotronic Wave — needs resolution-controller plumbing in dynamic affects
    low("Monocolored creatures can't block this turn.");             // Awe for the Guilds — no monocolored selector vocabulary
    low("Green creatures and white creatures can't block this turn."); // Flash of Defiance — selector.colors reads PRINTED colors; a restriction must not half-enforce
    low("Nonartifact creatures can't block this turn.");             // Ruthless Invasion — no negated-cardType vocabulary
    low("Cowards can't block this turn.");                           // Pyrophobia — subtype-scoped form unadmitted
  });
  it("duration / direction variants do NOT parse", () => {
    low("Creatures can't block this combat.");
    low("Creatures can't attack this turn.");
  });
  it("⭐ the ability-word carrier now parses — and its condition RIDES the gated atom (2026-07-30)", () => {
    // ⚠️ HALF-INVERTED. The old reason was mechanical, not semantic: "the conditional prefix survives and
    // the ^ anchor rejects it" — because the "Ferocious — " label kept the sentence from being seen at all.
    // The label is now stripped on the spell path (CR 207.2c), so the CD-1 "if <cond>, <effect>" peel reads
    // it and attaches the condition to the mass-block-lock atom. Verified before crediting:
    //   atoms = [deal-damage(no cond), mass-block-lock(cond: "you control a creature with power 4 or greater")]
    // An unconditional lock would have been the FP this test was built to prevent; the condition is there.
    const C = (name, oracle, type) => ({ name, oracle, type, keywords: [], mana: "" });
    expect(classifyCard(C("Barrage of Boulders", "Barrage of Boulders deals 1 damage to each creature you don't control.\nFerocious — If you control a creature with power 4 or greater, creatures can't block this turn.", "Sorcery"))).toMatch(/^native/);
    // ⛔ AND THE OTHER HALF STILL PARKS, so the FP hazard remains pinned: Demoralize's threshold condition
    // ("seven or more cards in your graveyard") is not a query the resolver can read, so it stays LOW.
    expect(classifyCard(C("Demoralize", "All creatures gain menace until end of turn. (They can't be blocked except by two or more creatures.)\nThreshold — If there are seven or more cards in your graveyard, creatures can't block this turn.", "Instant"))).not.toMatch(/^native/);
  });
});

// ─── 4. Runtime — the filtered lock at the block-legality gates ───────────────────
describe("mass-block-lock — runtime: ground creatures locked, flyers exempt, dynamic set", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const attacker = createPermanent({ id: "atk", card: { id: "atk", name: "Raider", type: "Creature — Human", power: 2, toughness: 2 }, controller: "user" });
    const ground = createPermanent({ id: "gnd", card: { id: "gnd", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4 }, controller: "ai" });
    const flyer = createPermanent({ id: "fly", card: { id: "fly", name: "Drake", type: "Creature — Drake", power: 2, toughness: 2, oracle: "Flying" }, controller: "ai" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [attacker] }, ai: { ...s.players.ai, battlefield: [ground, flyer] } } };
  }
  const FILTERED = { op: "mass-block-lock", withoutKeyword: "flying" };

  it("filtered form: the ground creature can't block, the flyer still can — and the lock is SYMMETRIC (the caster's side too)", () => {
    let s = board();
    const own = createPermanent({ id: "own", card: { id: "own", name: "Ox", type: "Creature — Ox", power: 2, toughness: 4 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, own] } } };
    expect(canBlockAttacker(s, "gnd", "atk", "ai")).toBe(true);
    const after = resolveAtom(s, FILTERED, { controller: "user", cardName: "Falter" });
    expect(canBlockAttacker(after, "gnd", "atk", "ai")).toBe(false); // ground → locked
    expect(canBlockAttacker(after, "fly", "atk", "ai")).toBe(true);  // flyer → exempt
    expect(permanentHasKeyword(after, "own", "cantBlock")).toBe(true); // "Creatures" = every controller, incl. the caster's
    expect(permanentHasKeyword(after, "atk", "cantBlock")).toBe(true); // the attacker itself is a ground creature too
  });

  it("bare form: EVERY creature is locked, flyers included", () => {
    const after = resolveAtom(board(), { op: "mass-block-lock" }, { controller: "user", cardName: "Chaos" });
    expect(canBlockAttacker(after, "gnd", "atk", "ai")).toBe(false);
    expect(canBlockAttacker(after, "fly", "atk", "ai")).toBe(false);
  });

  it("CR 611.2c dynamic set: a ground creature entering AFTER resolution is locked too", () => {
    let after = resolveAtom(board(), FILTERED, { controller: "user", cardName: "Falter" });
    const late = createPermanent({ id: "late", card: { id: "late", name: "Elk", type: "Creature — Elk", power: 1, toughness: 1 }, controller: "ai" });
    after = { ...after, players: { ...after.players, ai: { ...after.players.ai, battlefield: [...after.players.ai.battlefield, late] } } };
    expect(permanentHasKeyword(after, "late", "cantBlock")).toBe(true);
    expect(canBlockAttacker(after, "late", "atk", "ai")).toBe(false);
  });

  it("layer-aware escape: a creature GRANTED flying after resolution CAN block (withoutKeyword reads live)", () => {
    let after = resolveAtom(board(), FILTERED, { controller: "user", cardName: "Falter" });
    expect(canBlockAttacker(after, "gnd", "atk", "ai")).toBe(false);
    after = addContinuousEffect(after, {
      layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" },
      affects: { mode: "fixed", permanentIds: ["gnd"] },
      duration: { kind: "endOfTurn", turn: after.turn }, source: { kind: "resolution", cardName: "Jump" },
    }).state;
    expect(permanentHasKeyword(after, "gnd", "cantBlock")).toBe(false); // now HAS flying → out of the without-flying set
    expect(canBlockAttacker(after, "gnd", "atk", "ai")).toBe(true);
  });

  it("expiry (CR 514.2): the lock is gone after cleanup", () => {
    const after = resolveAtom(board(), FILTERED, { controller: "user", cardName: "Falter" });
    expect(canBlockAttacker(after, "gnd", "atk", "ai")).toBe(false);
    const cleaned = expireContinuousEffects(after, { atCleanupOfTurn: after.turn });
    expect(canBlockAttacker(cleaned, "gnd", "atk", "ai")).toBe(true);
    expect(permanentHasKeyword(cleaned, "gnd", "cantBlock")).toBe(false);
  });
});

// ─── 5. Runtime — the declare-blockers OFFER path (legalChoices) ───────────────────
describe("mass-block-lock — a locked creature is never OFFERED as a blocker", () => {
  it("after resolution the defender is offered only the flyer", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const raider = createPermanent({ id: "r1", card: { id: "r1", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const ground = createPermanent({ id: "gnd", card: { id: "gnd", name: "Ox", type: "Creature — Ox", power: "2", toughness: "4", oracle: "" }, controller: "user", summoningSick: false });
    const flyer = createPermanent({ id: "fly", card: { id: "fly", name: "Drake", type: "Creature — Drake", power: "2", toughness: "2", oracle: "Flying" }, controller: "user", summoningSick: false });
    s = { ...s, turn: 4, phase: "combat", step: "declare-blockers", activePlayer: "ai1", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "r1", attackingPlayer: "ai1", defender: "user" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [ground, flyer] }, ai1: { ...s.players.ai1, battlefield: [raider] } } };
    const offered = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId);
    expect(new Set(offered(s))).toEqual(new Set(["gnd", "fly"])); // both offerable pre-lock
    const after = resolveAtom(s, { op: "mass-block-lock", withoutKeyword: "flying" }, { controller: "ai1", cardName: "Falter" });
    expect(new Set(offered(after))).toEqual(new Set(["fly"]));    // ground creature no longer offered
  });
});
