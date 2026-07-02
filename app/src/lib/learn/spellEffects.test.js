/**
 * PR 11.2 — spell-effect parsing, targeting, AI selection, and resolution.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import {
  parseSpellEffect,
  effectNeedsTarget,
  enumerateTargets,
  chooseAITarget,
  applyDamageEffect,
  applyDestroyEffect,
  applyDrawEffect,
  parseCreatureTargetRestrictions,
} from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2 } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function st({ userBf = [], aiBf = [], userLife = 40, aiLife = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: userLife },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

describe("parseSpellEffect", () => {
  it("parses burn to any target", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Lightning Bolt deals 3 damage to any target." }))
      .toEqual({ kind: "damage", amount: 3, targetType: "any" });
  });
  it("parses damage to target creature / player / each opponent", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Deals 2 damage to target creature." })).toMatchObject({ kind: "damage", targetType: "creature" });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Deals 4 damage to target player." })).toMatchObject({ kind: "damage", targetType: "player" });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Deals 1 damage to each opponent." })).toMatchObject({ kind: "damage", targetType: "eachOpponent" });
  });
  it("parses destroy target creature", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target nonblack creature." })).toEqual({ kind: "destroy", targetType: "creature" });
  });
  it("parses draw N cards", () => {
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Draw two cards." })).toEqual({ kind: "draw", amount: 2, targetType: null });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Draw a card." })).toEqual({ kind: "draw", amount: 1, targetType: null });
  });
  it("parses pump (+X/+X until end of turn), positive and negative", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Target creature gets +3/+3 until end of turn." }))
      .toEqual({ kind: "pump", targetType: "creature", ptDelta: { p: 3, t: 3 }, duration: "endOfTurn" });
    expect(parseSpellEffect({ type: "Instant", oracle: "Target creature gets -1/-1 until end of turn." }))
      .toEqual({ kind: "pump", targetType: "creature", ptDelta: { p: -1, t: -1 }, duration: "endOfTurn" });
  });
  it("returns null for permanents and unrecognized spells", () => {
    expect(parseSpellEffect({ type: "Creature — Bear", oracle: "" })).toBeNull();
    expect(parseSpellEffect({ type: "Instant", oracle: "Counter target spell." })).toBeNull();
    expect(parseSpellEffect({ type: "Sorcery", oracle: "" })).toBeNull();
  });
  it("effectNeedsTarget is true only for single-target effects", () => {
    expect(effectNeedsTarget({ kind: "damage", targetType: "any" })).toBe(true);
    expect(effectNeedsTarget({ kind: "draw", targetType: null })).toBe(false);
    expect(effectNeedsTarget({ kind: "damage", targetType: "eachOpponent" })).toBe(false);
    // P3.1: the "spell" target type (counter) must gate as needing a target — the new
    // enumerateTargets "spell" branch (and the whole counter cast path) hinges on this.
    expect(effectNeedsTarget({ kind: "counter", targetType: "spell" })).toBe(true);
  });
});

describe("enumerateTargets", () => {
  it("lists creatures, players, or both per target type", () => {
    const state = st({ userBf: [cr("A", "a", "user")], aiBf: [cr("B", "b", "ai")] });
    expect(enumerateTargets(state, "user", { targetType: "creature" }).map(t => t.id).sort()).toEqual(["a", "b"]);
    expect(enumerateTargets(state, "user", { targetType: "player" }).map(t => t.id).sort()).toEqual(["ai", "user"]);
    expect(enumerateTargets(state, "user", { targetType: "any" }).length).toBe(4);
    expect(enumerateTargets(state, "user", { targetType: null })).toEqual([]);
  });
});

describe("parseCreatureTargetRestrictions (P2.4)", () => {
  const card = (oracle) => ({ type: "Instant", oracle });
  it("parses controller / tapped / power restrictions, all clean", () => {
    expect(parseCreatureTargetRestrictions(card("Destroy target creature an opponent controls."))).toMatchObject({ clean: true, restrictions: [{ kind: "controller", who: "opponent" }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target creature you control."))).toMatchObject({ clean: true, restrictions: [{ kind: "controller", who: "you" }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target tapped creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "tapped", value: true }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target untapped creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "tapped", value: false }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target creature with power 2 or less."))).toMatchObject({ clean: true, restrictions: [{ kind: "power", op: "<=", value: 2 }] });
    expect(parseCreatureTargetRestrictions(card("Deals 4 damage to target creature with power 4 or greater."))).toMatchObject({ clean: true, restrictions: [{ kind: "power", op: ">=", value: 4 }] });
  });
  it("is clean with NO restrictions for a plain creature target", () => {
    expect(parseCreatureTargetRestrictions(card("Destroy target creature."))).toMatchObject({ clean: true, restrictions: [] });
  });
  it("β-1: models color negation / type negation / combat state (clean + the right restriction)", () => {
    expect(parseCreatureTargetRestrictions(card("Destroy target nonblack creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "colorNeg", color: "B" }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target nonartifact creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "typeNeg", type: "artifact" }] });
    expect(parseCreatureTargetRestrictions(card("Destroy target attacking creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "combat", value: "attacking" }] });
    expect(parseCreatureTargetRestrictions(card("Deals 4 damage to target attacking or blocking creature."))).toMatchObject({ clean: true, restrictions: [{ kind: "combat", value: "either" }] });
  });
  it("is UNCLEAN when an unmodeled qualifier is present (→ Arbiter)", () => {
    expect(parseCreatureTargetRestrictions(card("Destroy target creature you control with first strike.")).clean).toBe(false); // only "with flying" is modeled (β anti-flyer)
    expect(parseCreatureTargetRestrictions(card("Destroy target artifact creature.")).clean).toBe(false);      // positive type, not negation
    expect(parseCreatureTargetRestrictions(card("Destroy target legendary creature.")).clean).toBe(false);     // supertype, unmodeled
    expect(parseCreatureTargetRestrictions(card("Destroy target white or blue creature.")).clean).toBe(false); // color UNION, not a single non-color
  });
  it("is a no-op (clean, no restrictions) for non-creature / non-target effects", () => {
    expect(parseCreatureTargetRestrictions(card("Draw two cards."))).toMatchObject({ clean: true, restrictions: [] });
    expect(parseCreatureTargetRestrictions(card("Deals 3 damage to any target."))).toMatchObject({ clean: true, restrictions: [] });
  });
});

describe("enumerateTargets honors restrictions (P2.4)", () => {
  const tap = (p) => ({ ...p, tapped: true });
  it("controller=opponent excludes the caster's own creatures", () => {
    const state = st({ userBf: [cr("Mine", "mine", "user")], aiBf: [cr("Theirs", "theirs", "ai")] });
    const ids = enumerateTargets(state, "user", { kind: "destroy", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }).map(t => t.id);
    expect(ids).toEqual(["theirs"]);
  });
  it("controller=you keeps only the caster's own creatures", () => {
    const state = st({ userBf: [cr("Mine", "mine", "user")], aiBf: [cr("Theirs", "theirs", "ai")] });
    const ids = enumerateTargets(state, "user", { kind: "destroy", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }).map(t => t.id);
    expect(ids).toEqual(["mine"]);
  });
  it("tapped filters to tapped creatures", () => {
    const state = st({ aiBf: [tap(cr("Tap", "tap", "ai")), cr("Untap", "untap", "ai")] });
    const ids = enumerateTargets(state, "user", { kind: "destroy", targetType: "creature", restrictions: [{ kind: "tapped", value: true }] }).map(t => t.id);
    expect(ids).toEqual(["tap"]);
  });
  it("power<=N filters by derived power", () => {
    const state = st({ aiBf: [cr("Small", "small", "ai", { power: 1 }), cr("Big", "big", "ai", { power: 5 })] });
    const ids = enumerateTargets(state, "user", { kind: "damage", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 2 }] }).map(t => t.id);
    expect(ids).toEqual(["small"]);
  });
  it("no restrictions → every creature (back-compat)", () => {
    const state = st({ userBf: [cr("A", "a", "user")], aiBf: [cr("B", "b", "ai")] });
    expect(enumerateTargets(state, "user", { kind: "destroy", targetType: "creature" }).map(t => t.id).sort()).toEqual(["a", "b"]);
  });
});

describe("chooseAITarget", () => {
  it("destroy picks the biggest enemy creature, never its own", () => {
    const state = st({ userBf: [cr("Big", "big", "user", { power: 4, toughness: 4 }), cr("Small", "sm", "user", { power: 1, toughness: 1 })], aiBf: [cr("Mine", "mine", "ai", { power: 9, toughness: 9 })] });
    const targets = enumerateTargets(state, "ai", { targetType: "creature" });
    const pick = chooseAITarget(state, "ai", { kind: "destroy", targetType: "creature" }, targets);
    expect(pick.id).toBe("big"); // biggest ENEMY creature (not the 9/9 it owns)
  });
  it("destroy returns null when only friendly creatures exist", () => {
    const state = st({ aiBf: [cr("Mine", "mine", "ai")] });
    const targets = enumerateTargets(state, "ai", { targetType: "creature" });
    expect(chooseAITarget(state, "ai", { kind: "destroy", targetType: "creature" }, targets)).toBeNull();
  });
  it("returns null for pump — the AI does not cast combat tricks yet (intentional deferral, P2.3)", () => {
    const state = st({ userBf: [cr("Theirs", "t", "user")], aiBf: [cr("Mine", "mine", "ai")] });
    const targets = enumerateTargets(state, "ai", { targetType: "creature" });
    expect(chooseAITarget(state, "ai", { kind: "pump", targetType: "creature", ptDelta: { p: 3, t: 3 } }, targets)).toBeNull();
  });
  it("burn prefers a killable enemy creature, else the lowest-life enemy player", () => {
    const state = st({ userBf: [cr("Killable", "k", "user", { power: 2, toughness: 2 })], userLife: 5 });
    const targets = enumerateTargets(state, "ai", { targetType: "any" });
    const pick = chooseAITarget(state, "ai", { kind: "damage", amount: 3, targetType: "any" }, targets);
    expect(pick.id).toBe("k"); // can kill the 2-toughness creature

    const state2 = st({ userBf: [cr("Tank", "t", "user", { power: 1, toughness: 9 })], userLife: 4 });
    const targets2 = enumerateTargets(state2, "ai", { targetType: "any" });
    const pick2 = chooseAITarget(state2, "ai", { kind: "damage", amount: 3, targetType: "any" }, targets2);
    expect(pick2).toMatchObject({ type: "player", id: "user" }); // can't kill the 9-tough tank → burn the player
  });
});

// W5: the resolveSpellEffect dispatcher was deleted with the dead SPELL_EFFECT lane — these pins
// exercise the shared PRIMITIVES directly (the single resolution truth the EffectProgram atoms call).
describe("shared effect primitives (applyDamageEffect / applyDestroyEffect / applyDrawEffect)", () => {
  it("damage to a creature kills it via the lethal SBA", () => {
    const state = st({ aiBf: [cr("Victim", "v", "ai", { power: 3, toughness: 3 })] });
    const after = applyDamageEffect(state, { controller: "user", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "v" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Victim"]);
  });
  it("damage to a player loses life", () => {
    const state = st({ aiLife: 40 });
    const after = applyDamageEffect(state, { controller: "user", amount: 3, targetType: "player", targets: [{ type: "player", id: "ai" }] });
    expect(after.players.ai.life).toBe(37);
  });
  it("each-opponent damage hits every opponent", () => {
    const state = st({ aiLife: 40 });
    const after = applyDamageEffect(state, { controller: "user", amount: 2, targetType: "eachOpponent", targets: [] });
    expect(after.players.ai.life).toBe(38);
  });
  it("destroy moves the target creature to its graveyard", () => {
    const state = st({ aiBf: [cr("Doomed", "d", "ai", { power: 5, toughness: 5 })] });
    const after = applyDestroyEffect(state, { controller: "user", targets: [{ type: "creature", id: "d" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Doomed"]);
    expect(after.players.ai.battlefield).toHaveLength(0);
  });
  it("draw adds cards to the controller's hand", () => {
    let state = st();
    // Give the user a library to draw from.
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }] } } };
    const after = applyDrawEffect(state, { controller: "user", amount: 2 });
    expect(after.players.user.hand.map(c => c.name)).toEqual(["L1", "L2"]);
  });
});
