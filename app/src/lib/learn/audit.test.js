/**
 * audit.test.js — QUARTET PHASE 3 slice 1 (2026-08-15): the invariant auditor.
 * Plan: docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md Phase 3. Staging per the default-off law:
 * the dispatch hook is MTG_AUDIT=1-gated; always-on-in-tests waits for the backfill.
 *
 * ⭐ THE HOLLOW-GATE LAW APPLIED TO THE AUDITOR ITSELF: an audit that never fires is worse than none —
 * every invariant below is proven by a HAND-CORRUPTED state producing its NAMED violation (the
 * seen-to-fail half), beside the healthy state auditing clean (the no-false-positive half).
 *
 * Mutation-checked (2026-08-15): the one-zone note() dedup dropped → the duplicate-card witness dies.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { auditState } from "./audit.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const healthy = () => {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const host = createPermanent({ id: "H", controller: "user", summoningSick: false,
    card: { id: "c-H", name: "Host", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
  const aura = createPermanent({ id: "A", controller: "user", summoningSick: false,
    card: { id: "c-A", name: "Aura", type: "Enchantment — Aura", oracle: "" } });
  aura.attachedTo = "H";
  host.attachments = ["A"];
  return { ...g, players: { ...g.players, user: { ...g.players.user,
    battlefield: [host, aura],
    hand: [{ id: "c-hand", name: "In Hand", type: "Instant", oracle: "" }],
    library: [{ id: "c-lib", name: "In Library", type: "Sorcery", oracle: "" }] } } };
};
const mutate = (s, fn) => { const c = structuredClone(s); fn(c); return c; };

describe("⭐⭐ LAW 6 — every invariant fires on its corruption, and the healthy state audits clean", () => {
  it("⭐ the healthy state has ZERO violations (no false positives)", () => {
    expect(auditState(healthy())).toEqual([]);
  });

  it("⛔ ONE-ZONE: the same card id in hand AND library is named", () => {
    const s = mutate(healthy(), (c) => { c.players.user.library.push({ id: "c-hand", name: "Dup", type: "Instant", oracle: "" }); });
    const v = auditState(s);
    const row = { fired: v.length, sample: v[0] };
    console.log("  WITNESS auditDupCard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(v.some((x) => x.includes("c-hand") && x.includes("two zones"))).toBe(true);
  });

  it("⛔ ATTACHMENT SYMMETRY: a host that lists a ghost, an aura pointing at nothing, a one-way link", () => {
    expect(auditState(mutate(healthy(), (c) => { c.players.user.battlefield[0].attachments.push("GHOST"); }))
      .some((x) => x.includes("GHOST") && x.includes("does not exist"))).toBe(true);
    expect(auditState(mutate(healthy(), (c) => { c.players.user.battlefield[1].attachedTo = "NOWHERE"; }))
      .some((x) => x.includes("NOWHERE"))).toBe(true);
    expect(auditState(mutate(healthy(), (c) => { c.players.user.battlefield[0].attachments = []; }))
      .some((x) => x.includes("does not list it"))).toBe(true);
  });

  it("⛔ COUNTERS: a negative counter is named", () => {
    expect(auditState(mutate(healthy(), (c) => { c.players.user.battlefield[0].counters = { "+1/+1": -2 }; }))
      .some((x) => x.includes('"+1/+1" = -2'))).toBe(true);
  });

  it("⛔ LIFE + POOLS: NaN life and a negative pool are named", () => {
    expect(auditState(mutate(healthy(), (c) => { c.players.user.life = NaN; }))
      .some((x) => x.includes("user.life"))).toBe(true);
    expect(auditState(mutate(healthy(), (c) => { c.players.user.manaPool.R = -1; }))
      .some((x) => x.includes("manaPool.R = -1"))).toBe(true);
  });

  it("⛔ SHAPES: a cardless permanent, a controllerless stack object, a bad delayed record", () => {
    expect(auditState(mutate(healthy(), (c) => { c.players.user.battlefield[0].card = null; }))
      .some((x) => x.includes("has no card"))).toBe(true);
    expect(auditState(mutate(healthy(), (c) => { c.stack = [{ id: "s1" }]; }))
      .some((x) => x.includes("no controller"))).toBe(true);
    expect(auditState(mutate(healthy(), (c) => { c.delayedTriggers = [{ id: "d1", fireStep: "someday", effectClause: "draw a card" }]; }))
      .some((x) => x.includes('bad fireStep "someday"'))).toBe(true);
  });
});
