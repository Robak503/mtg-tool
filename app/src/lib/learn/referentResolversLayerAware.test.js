/**
 * referentResolversLayerAware.test.js — every referent resolver must read LIVE creature-ness (slice 23).
 *
 * shared.js has three referent resolvers that answer "which permanent does this pronoun mean":
 * selfTargets ("this creature"), triggeringTargets ("it" / "that creature") and enchantedTargets
 * ("enchanted creature"). selfTargets was already patched to consult the LAYER-AWARE permanentIsCreature
 * after a printed-card-only check silently dropped self effects on an animated land — its comment names
 * that as "the metric said HIGH while the runtime no-opped — the exact FP class the CREED forbids".
 *
 * The other two still used the PRINTED card alone. Verified before the fix: with an animated land as the
 * triggering permanent, triggeringTargets returned [] while selfTargets on the very same permanent returned
 * it. Any effect using those pronouns simply did nothing on a permanent that is a creature only by layers.
 *
 * A permanent that is a creature BY LAYERS — an animated land, a crewed Vehicle — is a creature right now
 * (CR 613), and all three resolvers now agree on that.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { addContinuousEffect, permanentIsCreature } from "./layers.js";
import { selfTargets, triggeringTargets, enchantedTargets } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

function board() {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const land = createPermanent({ id: "L1", card: { name: "Tar Pit", type: "Land", oracle: "" }, controller: "user", summoningSick: false });
  const aura = createPermanent({ id: "AU", card: { name: "Freed", type: "Enchantment — Aura", oracle: "Enchant creature\n{U}: Untap enchanted creature." }, controller: "user" });
  const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land, aura] } } };
  return attachPermanent(st, { equipId: "AU", targetId: "L1" });
}

function animate(state, permId) {
  let r = addContinuousEffect(state, { layer: 4, op: { types: ["Creature"] },
    affects: { mode: "fixed", permanentIds: [permId] }, duration: { kind: "permanent" },
    source: { kind: "resolution", permanentId: null, cardName: "Animate" } });
  r = addContinuousEffect(r.state, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 3, toughness: 3 },
    affects: { mode: "fixed", permanentIds: [permId] }, duration: { kind: "permanent" },
    source: { kind: "resolution", permanentId: null, cardName: "Animate" } });
  return r.state;
}

describe("a NON-creature permanent is correctly refused by all three", () => {
  const s = () => board();
  it("the two CREATURE pronouns refuse it; the self referent resolves it as a permanent", () => {
    const st = s();
    expect(permanentIsCreature(st, "L1")).toBe(false);
    // "that creature" / "enchanted creature" NAME a creature, so a non-creature host is correctly no referent.
    expect(triggeringTargets(st, { triggeringPermanentId: "L1" })).toEqual([]);
    expect(enchantedTargets(st, { sourceId: "AU" })).toEqual([]);
    // "this <permanent>" does NOT name a creature — slice 22 made the self referent resolve for any
    // permanent, which is what let an Aura return ITSELF to hand. Typed "permanent", never "creature".
    expect(selfTargets(st, { sourceId: "L1" })).toEqual([{ type: "permanent", id: "L1", controller: "user" }]);
  });
});

describe("once ANIMATED, all three agree it is a creature (CR 613)", () => {
  it("selfTargets resolves it (this was already true — the reference behaviour)", () => {
    const st = animate(board(), "L1");
    expect(selfTargets(st, { sourceId: "L1" })).toEqual([{ type: "creature", id: "L1", controller: "user" }]);
  });

  it("triggeringTargets resolves it (returned [] before this slice)", () => {
    const st = animate(board(), "L1");
    expect(triggeringTargets(st, { triggeringPermanentId: "L1" })).toEqual([{ type: "creature", id: "L1", controller: "user" }]);
  });

  it("enchantedTargets resolves an animated HOST (returned [] before this slice)", () => {
    const st = animate(board(), "L1");
    expect(enchantedTargets(st, { sourceId: "AU" })).toEqual([{ type: "creature", id: "L1", controller: "user" }]);
  });
});

describe("the guards that must NOT loosen", () => {
  it("a detached Aura still resolves nothing", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const aura = createPermanent({ id: "AU", card: { name: "Freed", type: "Enchantment — Aura" }, controller: "user" });
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [aura] } } };
    expect(enchantedTargets(st, { sourceId: "AU" })).toEqual([]);
  });

  it("no triggering permanent in context → nothing (a spell has none)", () => {
    expect(triggeringTargets(board(), {})).toEqual([]);
  });

  it("an id that has left the battlefield → nothing, for every resolver", () => {
    expect(triggeringTargets(board(), { triggeringPermanentId: "gone" })).toEqual([]);
    expect(selfTargets(board(), { sourceId: "gone" })).toEqual([]);   // findPermanent misses → no referent
  });
});

describe("the counters-path MIRROR must agree too (slice 24)", () => {
  /**
   * counters.triggeringCreatureTargets and shared.triggeringTargets are documented mirrors of each other —
   * the same "that creature" pronoun, one for counter placement and one for pump/bounce. They had DRIFTED:
   * only the shared one was made layer-aware. An animated land that dealt combat damage would get its
   * pump but never its counter. Driven through the public atom rather than the private function.
   */
  it("a counter lands on an ANIMATED land that triggered the ability", async () => {
    const { applyAddCounter } = await import("./effects/atoms/counters.js");
    const st = animate(board(), "L1");
    const out = applyAddCounter(st, { op: "add-counter", target: "thatCreature", counterType: "+1/+1", amount: 1 },
      { controller: "user", triggeringPermanentId: "L1" });
    expect(out.players.user.battlefield.find((p) => p.id === "L1").counters?.["+1/+1"]).toBe(1);
  });

  it("…and NOT on the same land before it is animated (the guard still holds)", async () => {
    const { applyAddCounter } = await import("./effects/atoms/counters.js");
    const out = applyAddCounter(board(), { op: "add-counter", target: "thatCreature", counterType: "+1/+1", amount: 1 },
      { controller: "user", triggeringPermanentId: "L1" });
    expect(out.players.user.battlefield.find((p) => p.id === "L1").counters?.["+1/+1"]).toBeFalsy();
  });
});

describe("the remaining single-permanent creature gates (slice 25)", () => {
  /**
   * Three more sites resolved a permanent by id and then gated on its PRINTED card: the shield counter, the
   * explore +1/+1, and the source-power fan-out. Each was a silent no-op on a permanent that is a creature
   * only by layers, in the same way the referent resolvers were. Swept together because they are one class.
   */
  it("a shield counter lands on an ANIMATED land", async () => {
    const { applyShieldCounter } = await import("./effects/atoms/counters.js");
    const st = animate(board(), "L1");
    const out = applyShieldCounter(st, { op: "shield-counter" }, { controller: "user", targets: [{ type: "creature", id: "L1" }] });
    expect(out.players.user.battlefield.find((p) => p.id === "L1").counters?.shield).toBe(1);
  });

  it("…and NOT before it is animated (the guard holds)", async () => {
    const { applyShieldCounter } = await import("./effects/atoms/counters.js");
    const out = applyShieldCounter(board(), { op: "shield-counter" }, { controller: "user", targets: [{ type: "creature", id: "L1" }] });
    expect(out.players.user.battlefield.find((p) => p.id === "L1").counters?.shield).toBeFalsy();
  });
});
