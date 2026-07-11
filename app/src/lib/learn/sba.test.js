/**
 * sba.test.js — the comprehensive SBA fixpoint (CR 704.3, CR-remediation B2).
 *
 * Pins the four new behaviors this batch adds:
 *   1. CR 704.5j — the LEGEND RULE (previously entirely unimplemented): same-name legendaries under
 *      one controller collapse to the newest; different controllers keep both (each player's rule is
 *      their own); the death IS a death (dies triggers fire; indestructible does not save).
 *   2. CR 704.3  — the FIXPOINT: a chain-reaction SBA (an anthem source dying drops a dependent
 *      creature to 0 toughness) settles in ONE call, not on some later unrelated mutation.
 *   3. CR 704.5m/n — attachment legality: an Equipment on a non-creature unattaches; an Aura whose
 *      host is gone (or no longer a creature) goes to its owner's graveyard.
 *   4. CR 704.5r — +1/+1 / -1/-1 counter annihilation (previously unimplemented).
 * Plus the perf contract: a quiescent board returns the IDENTICAL state object.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { checkAllStateBasedActions } from "./sba.js";
import { createGameState, applyLegendRule, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function perm(name, id, controller, { type = "Creature — Bear", power = 2, toughness = 2, oracle = "", timestamp = 0, counters = {}, damageMarked = 0, attachedTo = null, attachments = [], bestowed = false } = {}) {
  return {
    id,
    card: { name, type, power, toughness, oracle },
    controller,
    tapped: false,
    summoningSick: false,
    counters,
    damageMarked,
    attachments,
    attachedTo,
    timestamp,
    ...(bestowed ? { bestowed: true } : {}),
  };
}

function st({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}

describe("CR 704.5j — the legend rule", () => {
  it("same-name legendaries under ONE controller collapse to the newest; the older dies", () => {
    const a = perm("Krenko, Mob Boss", "k1", "user", { type: "Legendary Creature — Goblin", timestamp: 5 });
    const b = perm("Krenko, Mob Boss", "k2", "user", { type: "Legendary Creature — Goblin", timestamp: 9 });
    const after = checkAllStateBasedActions(st({ userBf: [a, b] }));
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["k2"]);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Krenko, Mob Boss"]);
  });

  it("same name under DIFFERENT controllers — both live (the rule is per-player)", () => {
    const a = perm("Krenko, Mob Boss", "k1", "user", { type: "Legendary Creature — Goblin" });
    const b = perm("Krenko, Mob Boss", "k2", "ai", { type: "Legendary Creature — Goblin" });
    const after = checkAllStateBasedActions(st({ userBf: [a], aiBf: [b] }));
    expect(after.players.user.battlefield).toHaveLength(1);
    expect(after.players.ai.battlefield).toHaveLength(1);
  });

  it("non-legendary same-name duplicates are untouched", () => {
    const a = perm("Bear", "b1", "user");
    const b = perm("Bear", "b2", "user");
    const after = checkAllStateBasedActions(st({ userBf: [a, b] }));
    expect(after.players.user.battlefield).toHaveLength(2);
  });

  it("a legend-rule death IS a death — dies triggers fire (indestructible does NOT save it)", () => {
    const watcher = perm("Drain Watcher", "w1", "user", {
      oracle: "Whenever a creature you control dies, each opponent loses 1 life.",
    });
    const a = perm("Zetalpa", "z1", "user", { type: "Legendary Creature — Dinosaur", oracle: "Indestructible", timestamp: 1 });
    const b = perm("Zetalpa", "z2", "user", { type: "Legendary Creature — Dinosaur", oracle: "Indestructible", timestamp: 2 });
    const after = checkAllStateBasedActions(st({ userBf: [watcher, a, b] }));
    // "put into a graveyard", not "destroyed" — indestructible is no protection (CR 704.5j).
    expect(after.players.user.battlefield.map((p) => p.id).sort()).toEqual(["w1", "z2"]);
    // The watcher's dies trigger was enqueued for the flush.
    expect((after.pendingTriggers || []).length).toBeGreaterThanOrEqual(1);
  });

  it("a legendary NON-creature duplicate goes to the graveyard too (no dies entry, a clean move)", () => {
    const a = perm("Sol Talisman", "s1", "user", { type: "Legendary Artifact", power: undefined, toughness: undefined, timestamp: 1 });
    const b = perm("Sol Talisman", "s2", "user", { type: "Legendary Artifact", power: undefined, toughness: undefined, timestamp: 2 });
    const r = applyLegendRule(st({ userBf: [a, b] }));
    expect(r.dead).toHaveLength(0); // not a creature death
    expect(r.state.players.user.battlefield.map((p) => p.id)).toEqual(["s2"]);
    expect(r.state.players.user.graveyard.map((c) => c.name)).toEqual(["Sol Talisman"]);
  });
});

describe("CR 704.3 — the fixpoint (chain-reaction SBAs settle in one call)", () => {
  it("an anthem source dying drops its dependent to 0 toughness — BOTH die in one sweep", () => {
    // Anthem: +1/+1 to the controller's creatures; carries lethal damage.
    const anthem = perm("Propped Banner", "an1", "user", {
      type: "Creature — Construct",
      power: 1,
      toughness: 1,
      oracle: "Creatures you control get +1/+1.",
      damageMarked: 2,
    });
    // Dependent: printed 1/1 with a -1/-1 counter → alive ONLY through the anthem (1/1 net with it, 0/0 without).
    const dependent = perm("Frail Bear", "fb1", "user", { counters: { "-1/-1": 1 }, power: 1, toughness: 1 });
    const after = checkAllStateBasedActions(st({ userBf: [anthem, dependent] }));
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Frail Bear", "Propped Banner"]);
  });

  it("a quiescent board returns the IDENTICAL state object (the perf/reference contract)", () => {
    const s = st({ userBf: [perm("Bear", "b1", "user")] });
    expect(checkAllStateBasedActions(s)).toBe(s);
  });
});

describe("CR 704.5m/n — attachment legality", () => {
  it("an Equipment attached to a NON-creature becomes unattached (stays on the battlefield)", () => {
    const land = perm("Mutavault", "mv1", "user", { type: "Land", power: undefined, toughness: undefined, attachments: ["eq1"] });
    const equip = perm("Bonesplitter", "eq1", "user", { type: "Artifact — Equipment", power: undefined, toughness: undefined, attachedTo: "mv1" });
    const after = checkAllStateBasedActions(st({ userBf: [land, equip] }));
    const eqAfter = after.players.user.battlefield.find((p) => p.id === "eq1");
    const landAfter = after.players.user.battlefield.find((p) => p.id === "mv1");
    expect(eqAfter.attachedTo).toBeNull();
    expect(landAfter.attachments).toEqual([]);
  });

  it("an Aura whose host is GONE goes to its owner's graveyard", () => {
    const aura = perm("Pacifism", "au1", "user", { type: "Enchantment — Aura", power: undefined, toughness: undefined, attachedTo: "ghost", oracle: "Enchant creature\nEnchanted creature can't attack or block." });
    const after = checkAllStateBasedActions(st({ userBf: [aura] }));
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Pacifism"]);
  });

  it("an 'Enchant creature' Aura on a NON-creature falls off; a BESTOWED one is exempt", () => {
    const land = perm("Wastes", "l1", "user", { type: "Basic Land", power: undefined, toughness: undefined, attachments: ["au1"] });
    const aura = perm("Pacifism", "au1", "user", { type: "Enchantment — Aura", power: undefined, toughness: undefined, attachedTo: "l1", oracle: "Enchant creature\nEnchanted creature can't attack or block." });
    const after = checkAllStateBasedActions(st({ userBf: [land, aura] }));
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Pacifism"]);

    const bestowed = perm("Boon Satyr", "bs1", "user", { type: "Enchantment Creature — Nymph", attachedTo: "ghost", bestowed: true });
    const after2 = checkAllStateBasedActions(st({ userBf: [bestowed] }));
    expect(after2.players.user.battlefield).toHaveLength(1); // untouched — the bestow exit transform owns it
  });

  it("an 'Enchant land' Aura on a LAND is LEGAL (Squirrel Nest — the granted-activated lane); an unknown Enchant requirement is never type-killed", () => {
    const land = perm("Forest", "l1", "user", { type: "Basic Land — Forest", power: undefined, toughness: undefined, attachments: ["au1", "au2"] });
    const nest = perm("Squirrel Nest", "au1", "user", { type: "Enchantment — Aura", power: undefined, toughness: undefined, attachedTo: "l1", oracle: 'Enchant land\nEnchanted land has "{T}: Create a 1/1 green Squirrel creature token."' });
    const sprawl = perm("Utopia Sprawl", "au2", "user", { type: "Enchantment — Aura", power: undefined, toughness: undefined, attachedTo: "l1", oracle: "Enchant Forest\nAs this enchantment enters, choose a color." });
    const after = checkAllStateBasedActions(st({ userBf: [land, nest, sprawl] }));
    expect(after.players.user.battlefield).toHaveLength(3); // all stay — land host legal for both
  });
});

describe("CR 704.5r — counter annihilation", () => {
  it("+1/+1 and -1/-1 counters annihilate pairwise", () => {
    const bear = perm("Scarred Bear", "sb1", "user", { counters: { "+1/+1": 3, "-1/-1": 2 }, power: 2, toughness: 2 });
    const after = checkAllStateBasedActions(st({ userBf: [bear] }));
    const b = after.players.user.battlefield.find((p) => p.id === "sb1");
    expect(b.counters["+1/+1"] || 0).toBe(1);
    expect(b.counters["-1/-1"] || 0).toBe(0);
  });
});
