/**
 * adapt.test.js — the ADAPT keyword action (CR 701.46a).
 *
 * > CR 701.46a: "'Adapt N' means 'If this permanent has no +1/+1 counters on it, put N +1/+1 counters on it.'"
 *
 * Verified against knowledge/mtg-judge/data/cr/cr_current.json.
 *
 * ⭐ WHY IT NEEDS ITS OWN OP, exactly like monstrosity. `{2}{G}: Put two +1/+1 counters on this creature.`
 * ALREADY classified native-activated — the activated shell and the self-counter effect both existed. What was
 * missing was the CONDITION (even spelled out, "if this creature has no +1/+1 counters on it, …" was
 * body-only). Reusing the unconditional counter effect would let an already-adapted creature stack N more
 * counters on every activation — doing something the printed card forbids, the direction THE CREED rules out.
 *
 * ⛔ AND ADAPT IS NOT A LATCH — the one real difference from its sibling. Monstrosity sets a `monstrous` flag
 * that never clears, so it can never fire twice. Adapt re-reads the LIVE +1/+1 count, so a creature whose
 * counters were removed can legally adapt again. The paired assertion at the bottom pins that contrast: a
 * flag-based implementation would pass every other test in this file.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { applyAdapt, applyMonstrosity } from "./effects/atoms/counters.js";

beforeEach(() => _resetIdsForTests());
const cnt = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;

const boardWith = (counters) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const p = createPermanent({ id: "a", card: { id: "ca", name: "Ooze", type: "Creature — Ooze", power: 2, toughness: 2 }, controller: "user" });
  const perm = counters === undefined ? p : { ...p, counters };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
};

describe("adapt — classification", () => {
  const C = { name: "Probe", type: "Creature — Ooze", mana: "{2}{G}", power: 2, toughness: 2 };
  it("the printed form with its reminder flips native", () => {
    expect(classifyCard({ ...C, oracle: "{2}{G}: Adapt 2. (If this creature has no +1/+1 counters on it, put two +1/+1 counters on it.)" })).toMatch(/^native/);
  });
  it("bare Adapt N, and a three-pip cost, both parse", () => {
    expect(classifyCard({ ...C, oracle: "{1}{U}: Adapt 1." })).toMatch(/^native/);
    expect(classifyCard({ ...C, oracle: "{4}{G}{U}: Adapt 4." })).toMatch(/^native/);
  });
  it("⛔ monstrosity is untouched (regression pin — the two arms sit side by side)", () => {
    expect(classifyCard({ ...C, oracle: "{3}{G}: Monstrosity 3." })).toMatch(/^native/);
  });
});

describe("adapt — resolution (CR 701.46a)", () => {
  it("with NO +1/+1 counters, it puts N on the source", () => {
    const s = applyAdapt(boardWith(undefined), { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(s, "a")).toBe(2);
  });

  it("⛔⭐ with a +1/+1 counter already on it, it does NOTHING — never stacks", () => {
    // THE test. Drop the gate and adapt becomes a plain self add-counter: every activation piles on N more
    // counters, which is precisely what the printed condition forbids.
    const s = applyAdapt(boardWith({ "+1/+1": 1 }), { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(s, "a")).toBe(1);
  });

  it("⛔ three counters already on it — still nothing", () => {
    const s = applyAdapt(boardWith({ "+1/+1": 3 }), { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(s, "a")).toBe(3);
  });

  it("a +1/+1 key present but ZERO still adapts (the count is read, not the key)", () => {
    // A creature that once had counters keeps the key at 0. Reading key-presence would wrongly refuse forever.
    const s = applyAdapt(boardWith({ "+1/+1": 0 }), { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(s, "a")).toBe(2);
  });

  it("⛔ the gate is +1/+1 SPECIFICALLY — a shield counter does not block adapting", () => {
    // CR 701.46a names +1/+1 counters. Gating on "has any counter" would refuse a creature the rules allow
    // to adapt (the safe direction, but still wrong, and it silently breaks shield/flying-counter boards).
    const s = applyAdapt(boardWith({ shield: 1 }), { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(s, "a")).toBe(2);
  });

  it("a vanished source is a clean no-op, never a throw", () => {
    const s = applyAdapt(boardWith(undefined), { op: "adapt", amount: 2, target: "self" }, { sourceId: "gone", controller: "user" });
    expect(cnt(s, "a")).toBe(0);
  });
});

describe("⛔⭐ adapt is NOT a latch — the contrast with monstrosity", () => {
  it("monstrosity latches on a FLAG; adapt re-reads the live count, so a cleared creature adapts again", () => {
    // Monstrosity: fires once, then the flag refuses forever even at zero counters.
    let m = boardWith(undefined);
    m = applyMonstrosity(m, { op: "monstrosity", amount: 4 }, { sourceId: "a" });
    expect(cnt(m, "a")).toBe(4);
    expect(findPermanent(m, "a").permanent.monstrous).toBe(true);
    // Simulate the counters being removed (a -1/-1 wipe, Biomancer's Familiar, …) while the flag persists.
    m = { ...m, players: { ...m.players, user: { ...m.players.user, battlefield: m.players.user.battlefield.map((p) => ({ ...p, counters: {} })) } } };
    m = applyMonstrosity(m, { op: "monstrosity", amount: 4 }, { sourceId: "a" });
    expect(cnt(m, "a")).toBe(0); // still refused — the flag latched

    // Adapt: the same cleared board adapts again, because the condition is the live count.
    let a = boardWith({ "+1/+1": 2 });
    a = applyAdapt(a, { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(a, "a")).toBe(2); // refused while counters are on it
    a = { ...a, players: { ...a.players, user: { ...a.players.user, battlefield: a.players.user.battlefield.map((p) => ({ ...p, counters: {} })) } } };
    a = applyAdapt(a, { op: "adapt", amount: 2, target: "self" }, { sourceId: "a", controller: "user" });
    expect(cnt(a, "a")).toBe(2); // adapts again — no latch
  });
});
