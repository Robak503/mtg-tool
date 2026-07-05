/**
 * batchKeywordCombatDamage.test.js — the WITH-KEYWORD batch combat-damage trigger (Quartzwood Crasher)
 * + the multi-subtype batch list fix (Prosperous Thief's "Ninja or Rogue creatures").
 *
 * "Whenever one or more creatures you control with trample deal combat damage to a player, create an
 * X/X green Dinosaur Beast creature token with trample, where X is the amount of damage those creatures
 * dealt to that player." Three seams, coherently:
 *   - triggers.js detects the with-keyword batch shape (carved out before the "with …" condition reject,
 *     gated to the permanentHasKeyword-checkable keyword set) and stamps perDefender;
 *   - checkBatchCombatDamageTriggers fires a perDefender descriptor once per (controller, defender) pair
 *     with ctx {damagedPlayerId, combatDamageAmount} summed over MATCHING dealers only (layer-aware);
 *   - the effect parser models the "X/X …, where X is the amount of damage …" payload as a create-token
 *     atom with ptContext:"combatDamageAmount" (the resolver mints at ctx-amount/ctx-amount).
 *
 * CREED boundaries pinned: an inadmissible "with <quality>" batch stays undetected; the bare/filtered
 * batch semantics are untouched (Grim Hireling fires once per controller, never doubled); a non-matching
 * dealer's damage is EXCLUDED from the token's X; Kodama ("modified creatures") stays body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkBatchCombatDamageTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const QUARTZWOOD_ORACLE = "Trample\nWhenever one or more creatures you control with trample deal combat damage to a player, create an X/X green Dinosaur Beast creature token with trample, where X is the amount of damage those creatures dealt to that player.";
const QUARTZWOOD = { name: "Quartzwood Crasher", type: "Creature — Dinosaur Beast", power: 6, toughness: 6, oracle: QUARTZWOOD_ORACLE };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
const creature = (name, id, controller, oracle = "", over = {}) =>
  permObj({ name, type: "Creature — Beast", power: 4, toughness: 4, oracle }, controller, id, over);

function stateWith(userPerms, over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userPerms } } };
}
const userBoard = (s) => s.players.user.battlefield;
const mintedTokens = (s) => userBoard(s).filter((p) => p.card?.token);

describe("WITH-KEYWORD BATCH — detection (coverage)", () => {
  it("Quartzwood's exact oracle → the perDefender with-keyword batch descriptor, routing natively", () => {
    const d = detectTriggers(QUARTZWOOD.card || QUARTZWOOD);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "combatDamageBatch", batchKeyword: "trample", perDefender: true });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(QUARTZWOOD)).toBe("native-trigger");
  });

  it("CREED: an inadmissible 'with <quality>' batch stays undetected (body-only)", () => {
    const card = { name: "Synth", type: "Creature — Beast", oracle: "Whenever one or more creatures you control with a +1/+1 counter on them deal combat damage to a player, draw a card." };
    expect(detectTriggers(card)).toHaveLength(0);
    expect(classifyCard(card)).toBe("body-only");
  });

  it("multi-subtype batch list with a trailing 'creatures' (Prosperous Thief's shape) parses to a subtype filter", () => {
    const card = { name: "Synth", type: "Creature — Human", oracle: "Whenever one or more Ninja or Rogue creatures you control deal combat damage to a player, create a Treasure token." };
    const d = detectTriggers(card);
    expect(d).toHaveLength(1);
    expect(d[0].event).toBe("combatDamageBatch");
    expect(d[0].subtypeFilter).toEqual(expect.arrayContaining(["Ninja", "Rogue"]));
    expect(d[0].perDefender).toBeFalsy(); // list batches keep the shipped once-per-controller semantics
  });

  it("CREED: a color/state QUALIFIER list never mints a vacuous subtype filter (skeptic-flagged latent FP)", () => {
    // parseSubtypeList validates by blacklist, so a stripped "red or green" / "attacking or blocking"
    // would become a subtype filter that can never match a type line — a runtime-vacuous native. The
    // qualifier denylist keeps these subjects unstripped → the shape test rejects them → undetected.
    const mk = (subject) => ({ name: "Synth", type: "Creature — Beast", oracle: `Whenever one or more ${subject} you control deal combat damage to a player, draw a card.` });
    expect(detectTriggers(mk("red or green creatures"))).toHaveLength(0);
    expect(detectTriggers(mk("attacking or blocking creatures"))).toHaveLength(0);
  });

  it("CREED: Kodama's 'modified creatures' subject stays unmodeled (body-only)", () => {
    const card = { name: "Kodama of the West Tree", type: "Legendary Creature — Spirit", oracle: "Reach\nModified creatures you control have trample. (Equipment, Auras you control, and counters are modifications.)\nWhenever a modified creature you control deals combat damage to a player, search your library for a basic land card, put it onto the battlefield tapped, then shuffle." };
    expect(classifyCard(card)).toBe("body-only");
  });
});

describe("WITH-KEYWORD BATCH — payload parser", () => {
  it("the X/X-from-combat-damage token clause → create-token with ptContext (high confidence, via the routing entry)", () => {
    // parseEffectClause is the entry BOTH consumers use (triggerRoutesNatively at classification and the
    // flush stage at resolution), so this pin mirrors the real paths.
    const p = parseEffectClause("create an X/X green Dinosaur Beast creature token with trample, where X is the amount of damage those creatures dealt to that player", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-token", ptContext: "combatDamageAmount" });
  });

  it("CREED: a board-metric 'where X is' P/T still drops (no mis-bound X)", () => {
    const p = parseEffectClause("create an X/X black Horror creature token, where X is the number of creature cards in your graveyard", "Instant", { hasX: false });
    expect(programConfidence(p)).not.toBe("high");
  });
});

describe("WITH-KEYWORD BATCH — runtime (checkBatchCombatDamageTriggers)", () => {
  it("matching dealers' damage sums into ONE token; a non-trample dealer's damage is EXCLUDED", () => {
    const watcher = permObj(QUARTZWOOD, "user", "qw");
    const t1 = creature("Tramply One", "t1", "user", "Trample");
    const t2 = creature("Tramply Two", "t2", "user", "Trample");
    const plain = creature("Plain", "p1", "user", "");
    let s = stateWith([watcher, t1, t2, plain]);
    const events = [
      { kind: "combat-damage-player", attackerId: "t1", attackingPlayer: "user", defender: "ai", amount: 4 },
      { kind: "combat-damage-player", attackerId: "t2", attackingPlayer: "user", defender: "ai", amount: 3 },
      { kind: "combat-damage-player", attackerId: "p1", attackingPlayer: "user", defender: "ai", amount: 2 },
    ];
    s = checkBatchCombatDamageTriggers(s, events);
    expect((s.pendingTriggers || []).length).toBe(1); // once per (controller, defender), not per dealer
    const resolved = resolveTopOfStack(flushTriggers(s));
    const toks = mintedTokens(resolved);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.power).toBe(7);      // 4 + 3 — the plain dealer's 2 excluded
    expect(toks[0].card.toughness).toBe(7);
    expect(/trample/i.test(toks[0].card.keywords?.join(" ") || toks[0].card.oracle || "")).toBe(true);
  });

  it("fires once per DAMAGED PLAYER with that pair's total (two defenders → two sized tokens)", () => {
    const watcher = permObj(QUARTZWOOD, "user", "qw");
    const t1 = creature("Tramply One", "t1", "user", "Trample");
    const t2 = creature("Tramply Two", "t2", "user", "Trample");
    let s = stateWith([watcher, t1, t2]);
    const events = [
      { kind: "combat-damage-player", attackerId: "t1", attackingPlayer: "user", defender: "ai", amount: 5 },
      { kind: "combat-damage-player", attackerId: "t2", attackingPlayer: "user", defender: "ai2", amount: 2 },
    ];
    s = checkBatchCombatDamageTriggers(s, events);
    expect((s.pendingTriggers || []).length).toBe(2); // one per damaged player
    let resolved = resolveTopOfStack(flushTriggers(s));
    resolved = resolveTopOfStack(resolved);
    const sizes = mintedTokens(resolved).map((t) => t.card.power).sort();
    expect(sizes).toEqual([2, 5]); // per-pair totals, never pooled
  });

  it("layer-aware: an equipment-granted trample dealer counts toward the filter and the total", () => {
    const watcher = permObj(QUARTZWOOD, "user", "qw");
    const plain = creature("Plain", "p1", "user", "", { attachments: ["eq"] });
    const equip = permObj({ name: "Grafted Wargear", type: "Artifact — Equipment", oracle: "Equipped creature gets +3/+2 and has trample.\nEquip {2}" }, "user", "eq", { attachedTo: "p1" });
    let s = stateWith([watcher, plain, equip]);
    s = checkBatchCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "p1", attackingPlayer: "user", defender: "ai", amount: 6 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(s));
    expect(mintedTokens(resolved)[0].card.power).toBe(6);
  });

  it("no matching dealer → no fire (the non-trample-only connect)", () => {
    const watcher = permObj(QUARTZWOOD, "user", "qw");
    const plain = creature("Plain", "p1", "user", "");
    let s = stateWith([watcher, plain]);
    s = checkBatchCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "p1", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("REGRESSION: the bare batch (Grim Hireling shape) still fires exactly once per controller", () => {
    const hireling = permObj({ name: "Grim Hireling", type: "Creature — Tiefling Rogue", oracle: "Whenever one or more creatures you control deal combat damage to a player, create a Treasure token." }, "user", "gh");
    const a = creature("A", "a1", "user", "");
    const b = creature("B", "b1", "user", "");
    let s = stateWith([hireling, a, b]);
    const events = [
      { kind: "combat-damage-player", attackerId: "a1", attackingPlayer: "user", defender: "ai", amount: 2 },
      { kind: "combat-damage-player", attackerId: "b1", attackingPlayer: "user", defender: "ai", amount: 3 },
    ];
    s = checkBatchCombatDamageTriggers(s, events);
    expect((s.pendingTriggers || []).length).toBe(1); // never doubled by the per-defender pass
  });
});
