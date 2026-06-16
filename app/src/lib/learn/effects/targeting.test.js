/**
 * Tests for effects/targeting.js — cast-time choice expansion (P2.5).
 * Covers sequence + modal expansion, atomIndex tagging, the "no legal target →
 * uncastable" rule, and an end-to-end modal cast resolving the CHOSEN mode only.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { expandCastChoices } from "./targeting.js";
import { parseEffectProgram } from "./parser.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2, tapped = false } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
function withBoard(creatures) {
  const s = freshState();
  const byCtl = { user: [], ai: [] };
  for (const c of creatures) byCtl[c.controller].push(c);
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: byCtl.user, library: [{ id: "lib-u", name: "U" }, { id: "lib-u2", name: "U2" }] },
      ai: { ...s.players.ai, battlefield: byCtl.ai },
    },
  };
}

const I = (oracle) => ({ type: "Instant", oracle });

describe("expandCastChoices — sequence", () => {
  it("one entry per legal target for a single targeting atom; targets tagged with atomIndex", () => {
    const state = withBoard([cr("A", "a1", "ai"), cr("B", "b1", "ai")]);
    const program = parseEffectProgram(I("Deal 2 damage to target creature. Draw a card."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(2); // two enemy creatures to aim atom 0 at
    for (const ch of choices) {
      expect(ch.targets).toHaveLength(1);
      expect(ch.targets[0].atomIndex).toBe(0); // bound to the damage atom, not the draw
    }
  });

  it("a non-targeted sequence yields a single empty-target cast", () => {
    const state = withBoard([]);
    const program = parseEffectProgram(I("Draw a card; draw a card."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toEqual([{ targets: [] }]);
  });

  it("returns NO choices when a required target has no legal pick (uncastable)", () => {
    const state = withBoard([]); // no creatures anywhere
    const program = parseEffectProgram(I("Destroy target creature and draw a card."));
    expect(expandCastChoices(state, "user", program)).toEqual([]);
  });

  // P2.6 adversarial-review pin: a tapped-RESTRICTED removal that flipped HIGH only
  // because of a gain-life rider (Eriette's Lullaby) must NOT offer untapped creatures
  // as legal targets — the restriction has to survive the multi-atom expansion path.
  it("a tapped-restricted removal in a multi-atom program only offers tapped creatures", () => {
    const state = withBoard([cr("Tapped", "t1", "ai", { tapped: true }), cr("Untapped", "u1", "ai")]);
    const program = parseEffectProgram(I("Destroy target tapped creature. You gain 2 life."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(1);                  // only the tapped creature is legal
    expect(choices[0].targets.map(t => t.id)).toEqual(["t1"]);
    expect(choices[0].targets[0].atomIndex).toBe(0);  // bound to the destroy atom, not gain-life
  });
});

describe("expandCastChoices — counter target spell (P3.1, spell targets on the stack)", () => {
  // A stack object of kind "spell" (the counter's potential target).
  const spell = (id, name, type = "Instant", oracle = "") => ({
    id, kind: "spell", source: { id: `c-${id}`, name, type, oracle }, controller: "ai", targets: [], cost: null, payload: {},
  });
  const ability = (id) => ({ id, kind: "triggered-ability", source: { name: "Trig" }, controller: "ai", targets: [], cost: null, payload: {} });

  it("offers one cast per spell on the stack ('any' filter), tagged to the counter atom", () => {
    const state = freshState({ stack: [spell("s1", "Shock"), spell("s2", "Divination", "Sorcery")] });
    const program = parseEffectProgram(I("Counter target spell."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(2);
    expect(choices.map(c => c.targets[0].id).sort()).toEqual(["s1", "s2"]);
    expect(choices[0].targets[0]).toMatchObject({ type: "spell", atomIndex: 0 });
  });

  it("the noncreature filter (Negate) omits creature spells", () => {
    const state = freshState({ stack: [spell("inst", "Shock"), spell("crt", "Bear", "Creature — Bear")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target noncreature spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["inst"]);
  });

  it("the creature filter (Essence Scatter) only offers creature spells", () => {
    const state = freshState({ stack: [spell("inst", "Shock"), spell("crt", "Bear", "Creature — Bear")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target creature spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["crt"]);
  });

  it("never targets a non-spell stack object (a triggered/activated ability)", () => {
    const state = freshState({ stack: [ability("trig"), spell("s1", "Shock")] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["s1"]);
  });

  it("excludes an on-card uncounterable spell (CR 701.5e)", () => {
    const state = freshState({ stack: [spell("safe", "Abrupt Decay", "Instant", "This spell can't be countered.")] });
    expect(expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")))).toEqual([]);
  });

  it("is uncastable (no choices) when the stack holds no legal spell target", () => {
    const state = freshState({ stack: [] });
    expect(expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")))).toEqual([]);
  });

  it("CAN target the caster's OWN spell on the stack (you may counter your own spell)", () => {
    const own = { id: "mine", kind: "spell", source: { id: "c-mine", name: "My Spell", type: "Sorcery", oracle: "" }, controller: "user", targets: [], cost: null, payload: {} };
    const state = freshState({ stack: [own] });
    const choices = expandCastChoices(state, "user", parseEffectProgram(I("Counter target spell.")));
    expect(choices.map(c => c.targets[0].id)).toEqual(["mine"]); // own spell is a legal target — correct MTG
  });
});

describe("expandCastChoices — modal", () => {
  it("surfaces one cast per (mode × legal target)", () => {
    const state = withBoard([cr("A", "a1", "ai"), cr("B", "b1", "ai")]);
    // mode 0 destroys a creature (2 targets), mode 1 draws (no target) → 2 + 1 = 3 casts
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(3);
    const mode0 = choices.filter(c => c.chosenMode === 0);
    const mode1 = choices.filter(c => c.chosenMode === 1);
    expect(mode0).toHaveLength(2);
    expect(mode1).toHaveLength(1);
    expect(mode1[0].targets).toEqual([]);
  });

  it("a mode whose only target is missing is simply omitted (other modes still castable)", () => {
    const state = withBoard([]); // no creatures → destroy mode uncastable
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const choices = expandCastChoices(state, "user", program);
    expect(choices).toHaveLength(1);
    expect(choices[0].chosenMode).toBe(1); // only the draw mode survives
  });
});

describe("modal cast resolves the CHOSEN mode only (end-to-end)", () => {
  function castObj(program, { chosenMode, targets = [] }) {
    return { id: "stk-m", kind: "spell", source: { name: "Charm", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets, chosenMode } } };
  }

  it("choosing the destroy mode kills the creature and does NOT draw", () => {
    const state = withBoard([cr("Ogre", "ogre", "ai")]);
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const before = state.players.user.hand.length;
    const out = runEffectProgram(state, castObj(program, { chosenMode: 0, targets: [{ atomIndex: 0, type: "creature", id: "ogre" }] }));
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]);
    expect(out.players.user.hand.length).toBe(before); // draw mode NOT run
  });

  it("choosing the draw mode draws and does NOT touch the creature", () => {
    const state = withBoard([cr("Ogre", "ogre", "ai")]);
    const program = parseEffectProgram(I("Choose one —\n• Destroy target creature.\n• Draw two cards."));
    const before = state.players.user.hand.length;
    const out = runEffectProgram(state, castObj(program, { chosenMode: 1, targets: [] }));
    expect(out.players.ai.battlefield.map(p => p.id)).toEqual(["ogre"]); // still alive
    expect(out.players.user.hand.length).toBe(before + 2);
  });
});
