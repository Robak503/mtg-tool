/**
 * α1 — the enemy/own-aware trigger-target chooser.
 *
 * Replaces the trigger-flush first-legal default on the LIVE path so a targeted triggered ability
 * picks a target on the side the card intends: removal / damage / counter / tap / -X-X → an
 * OPPONENT's permanent / spell / the opponent; a buff / +1/+1 / untap / graveyard-return → the
 * controller's OWN. Ambiguous atoms (bounce) are gated to the Arbiter by buildTriggerStack, not
 * picked here. The headline correctness win: an UNRESTRICTED harmful trigger ("destroy target
 * creature" with no "an opponent controls" clause) no longer first-legal-targets a friendly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { atomTargetIntent, programTriggerTargetsResolvable, parseEffectProgram } from "./effects/parser.js";
import { chooseTriggerTargets, NO_SAFE_TARGET, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const base = (over = {}) => ({ ...createGameState({ userDeck: [], aiDeck: [] }), ...over });
const info = (state, over = {}) => ({ state, trigger: { controller: "user" }, ...over });

describe("α1 — atomTargetIntent", () => {
  it("harmful atoms → enemy", () => {
    expect(atomTargetIntent({ op: "deal-damage", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "destroy", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "exile", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "counter", targetType: "spell" })).toBe("enemy");
    expect(atomTargetIntent({ op: "tap", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "pump", targetType: "creature", ptDelta: { p: -2, t: -2 } })).toBe("enemy");
    expect(atomTargetIntent({ op: "add-counter", targetType: "creature", counterType: "-1/-1" })).toBe("enemy");
  });
  it("buffs / utility → own", () => {
    expect(atomTargetIntent({ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 2 } })).toBe("own");
    expect(atomTargetIntent({ op: "add-counter", targetType: "creature", counterType: "+1/+1" })).toBe("own");
    expect(atomTargetIntent({ op: "untap", targetType: "creature" })).toBe("own");
    expect(atomTargetIntent({ op: "return-from-graveyard", targetType: "graveyardCard" })).toBe("own");
  });
  it("bounce/tuck/discard/draw/regen: enemy or own depending on op; unknown → ambiguous", () => {
    // ETB-BOUNCE — bare creature/artifact/land/permanent target is always enemy-side (Man-o'-War etc.)
    expect(atomTargetIntent({ op: "bounce", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "bounce", targetType: "artifact" })).toBe("enemy");
    expect(atomTargetIntent({ op: "bounce", targetType: "land" })).toBe("enemy");
    // bounce with "YouControl" filter stays own-side (self-protective bounce)
    expect(atomTargetIntent({ op: "bounce", targetType: "creatureYouControl" })).toBe("own");
    // ETB-TUCK — "put target creature on top of its owner's library" is enemy
    expect(atomTargetIntent({ op: "tuck", targetType: "creature" })).toBe("enemy");
    // discard — harmful, enemy-side (Rottenheart Ghoul, Kemuri-Onna)
    expect(atomTargetIntent({ op: "discard", who: "target", targetType: "player" })).toBe("enemy");
    expect(atomTargetIntent({ op: "discard", who: "target", targetType: "opponent" })).toBe("enemy");
    // draw — beneficial, own-side (Saltwater Stalwart)
    expect(atomTargetIntent({ op: "draw", who: "target", targetType: "player" })).toBe("own");
    // non-targeted draw (no targetType) → null
    expect(atomTargetIntent({ op: "draw", amount: 1, targetType: null })).toBe(null);
    // regenerate — protective, own-side (Horizon Seed)
    expect(atomTargetIntent({ op: "regenerate", targetType: "creature" })).toBe("own");
    // truly unknown op still returns ambiguous
    expect(atomTargetIntent({ op: "mystery", targetType: "creature" })).toBe("ambiguous");
    // non-chosen-target atoms → null
    expect(atomTargetIntent({ op: "deal-damage", targetType: "eachOpponent" })).toBe(null);
    expect(atomTargetIntent({ op: "pump", target: "self", ptDelta: { p: 1, t: 0 } })).toBe(null);
  });
});

describe("α1 — programTriggerTargetsResolvable (the flush allowlist)", () => {
  it("true for enemy/own/non-targeted; false when any atom is ambiguous", () => {
    expect(programTriggerTargetsResolvable(parseEffectProgram(I("Destroy target creature.")))).toBe(true);
    expect(programTriggerTargetsResolvable(parseEffectProgram(I("Counter target spell.")))).toBe(true);
    expect(programTriggerTargetsResolvable(parseEffectProgram(I("Draw a card.")))).toBe(true);
    // bounce is now "enemy" for bare creature targets → resolvable on the trigger path
    expect(programTriggerTargetsResolvable(parseEffectProgram(I("Return target creature to its owner's hand.")))).toBe(true);
    // a genuinely two-sided atom (fight-pair needs BOTH an own fighter AND an enemy target) stays
    // ambiguous — one intent value can't express two opposite sides (edicts.test.js now covers the
    // player-edict = enemy case, which the enemy-aware flush chooser resolves safely).
    expect(programTriggerTargetsResolvable({ confidence: "high", structure: "sequence", atoms: [{ op: "fight-pair", targetType: "creature" }] })).toBe(false);
    expect(programTriggerTargetsResolvable(null)).toBe(false);
  });
});

describe("α1 — chooseTriggerTargets picks the correct side", () => {
  it("an enemy-intent atom picks an OPPONENT's permanent, never the controller's own", () => {
    const program = { atoms: [{ op: "destroy", targetType: "creature", restrictions: [] }] };
    const candidates = [
      { targets: [{ type: "creature", id: "mine", controller: "user", atomIndex: 0 }] },
      { targets: [{ type: "creature", id: "foe", controller: "ai", atomIndex: 0 }] },
    ];
    expect(chooseTriggerTargets(candidates, info(base(), { program })).targets.map((t) => t.id)).toEqual(["foe"]);
  });
  it("a counter atom resolves the spell's side from state.stack and picks the ENEMY spell", () => {
    const state = base({ stack: [{ id: "own-stk", kind: "spell", controller: "user" }, { id: "foe-stk", kind: "spell", controller: "ai" }] });
    const program = { atoms: [{ op: "counter", targetType: "spell", spellFilter: "any" }] };
    const candidates = [
      { targets: [{ type: "spell", id: "own-stk", atomIndex: 0 }] },
      { targets: [{ type: "spell", id: "foe-stk", atomIndex: 0 }] },
    ];
    expect(chooseTriggerTargets(candidates, info(state, { program })).targets.map((t) => t.id)).toEqual(["foe-stk"]);
  });
  it("a damage atom can target the enemy PLAYER", () => {
    const program = { atoms: [{ op: "deal-damage", targetType: "any", amount: 2 }] };
    const candidates = [
      { targets: [{ type: "player", id: "user", atomIndex: 0 }] },
      { targets: [{ type: "player", id: "ai", atomIndex: 0 }] },
    ];
    expect(chooseTriggerTargets(candidates, info(base(), { program })).targets.map((t) => t.id)).toEqual(["ai"]);
  });
  it("an own-intent atom (+1/+1 counter) picks the CONTROLLER's own creature", () => {
    const program = { atoms: [{ op: "add-counter", targetType: "creature", counterType: "+1/+1", amount: 1 }] };
    const candidates = [
      { targets: [{ type: "creature", id: "foe", controller: "ai", atomIndex: 0 }] },
      { targets: [{ type: "creature", id: "mine", controller: "user", atomIndex: 0 }] },
    ];
    expect(chooseTriggerTargets(candidates, info(base(), { program })).targets.map((t) => t.id)).toEqual(["mine"]);
  });
  it("returns NO_SAFE_TARGET when no correct-side target is legal (never first-legal a friendly)", () => {
    const program = { atoms: [{ op: "destroy", targetType: "creature", restrictions: [] }] };
    const onlyOwn = [{ targets: [{ type: "creature", id: "mine", controller: "user", atomIndex: 0 }] }];
    expect(chooseTriggerTargets(onlyOwn, info(base(), { program }))).toBe(NO_SAFE_TARGET);
  });
});

describe("α1 — end-to-end: an unrestricted removal trigger hits an ENEMY, never the controller's own", () => {
  it("'destroy target creature' ETB destroys the opponent's creature, leaving the controller's own", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const C = (id, name, controller) => createPermanent({ id, card: { id, name, type: "Creature — Bear", power: 2, toughness: 2 }, controller });
    s = { ...s, players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [C("mine", "MyBear", "user")] },
      ai: { ...s.players.ai, battlefield: [C("foe", "FoeBear", "ai")] },
    } };
    s = { ...s, pendingTriggers: [{
      event: "etb", source: { name: "Killer", permanentId: "src" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "destroy target creature", interveningIf: null },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    expect(out.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false); // enemy creature destroyed
    expect(out.players.user.battlefield.some((p) => p.id === "mine")).toBe(true); // controller's own survives
  });

  // VERIFY-ETB-DESTROY (Hans cycle-1): a RESTRICTED ETB-destroy (Ravenous Chupacabra,
  // "...an opponent controls") destroys the opponent's creature, never the controller's own.
  it("a restricted 'destroy target creature an opponent controls' ETB hits the opponent, never own", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const C = (id, name, controller) => createPermanent({ id, card: { id, name, type: "Creature — Bear", power: 2, toughness: 2 }, controller });
    s = { ...s, players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [C("mine", "MyBear", "user")] },
      ai: { ...s.players.ai, battlefield: [C("foe", "FoeBear", "ai")] },
    } };
    s = { ...s, pendingTriggers: [{
      event: "etb", source: { name: "Ravenous Chupacabra", permanentId: "src" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "destroy target creature an opponent controls", interveningIf: null },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    expect(out.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false);   // opponent's creature destroyed
    expect(out.players.user.battlefield.some((p) => p.id === "mine")).toBe(true); // controller's own untouched
  });

  // VERIFY-ETB-DESTROY: no legal target (only the controller's own creature on board) → the trigger
  // fizzles cleanly (CR 603.3c removal / NO_SAFE_TARGET no-op), never crashes, never destroys own.
  it("a restricted ETB-destroy with no opponent creature fizzles cleanly (no crash, own survives)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const C = (id, name, controller) => createPermanent({ id, card: { id, name, type: "Creature — Bear", power: 2, toughness: 2 }, controller });
    s = { ...s, players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [C("mine", "MyBear", "user")] },
      ai: { ...s.players.ai, battlefield: [] }, // no opponent creature
    } };
    s = { ...s, pendingTriggers: [{
      event: "etb", source: { name: "Ravenous Chupacabra", permanentId: "src" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "destroy target creature an opponent controls", interveningIf: null },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    expect(out.players.user.battlefield.some((p) => p.id === "mine")).toBe(true); // own creature never targeted
  });
});
