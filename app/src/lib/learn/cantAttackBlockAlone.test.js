/**
 * cantAttackBlockAlone.test.js — BLITZ CB-1: the ATTACK-ONLY / BLOCK-ONLY halves of the can't-alone
 * combat restriction (CR 508.1h / 509.1a).
 *
 * SM-2 already modeled the combined "can't attack or block alone" (Mogg Flunkies): the creature is offered
 * as an attacker/blocker only once ANOTHER attacker/blocker is declared this combat. This slice routes the
 * two SINGLE-SIDED printed forms — "This creature can't attack alone." (Raging Kronch / Bonded Construct /
 * Trusty Companion) and "This creature can't block alone." (Craven Hulk) — through the SAME sequential-
 * declaration gates, but each wired to ONE side only: cantAttackAlone gates the attack declaration (blocking
 * stays free), cantBlockAlone gates the block declaration (attacking stays free). Recognition + enforcement
 * ship together — a body whose only non-keyword text is one of these statics is now honestly native.
 *
 * Real oracle fixtures (bundled Scryfall).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { cantAttackAlone, cantBlockAlone, cantAttackOrBlockAlone, isEnforcedEvasionClause } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RAGING_KRONCH = { id: "rk", name: "Raging Kronch", type: "Creature — Beast", power: "3", toughness: "1", mana: "{2}{R}",
  oracle: "This creature can't attack alone." };
const BONDED_CONSTRUCT = { id: "bc", name: "Bonded Construct", type: "Artifact Creature — Construct", power: "2", toughness: "1", mana: "{1}",
  oracle: "This creature can't attack alone." };
const TRUSTY_COMPANION = { id: "tc", name: "Trusty Companion", type: "Creature — Hyena", power: "2", toughness: "2", mana: "{1}{W}",
  oracle: "Vigilance\nThis creature can't attack alone." };
const CRAVEN_HULK = { id: "ch", name: "Craven Hulk", type: "Creature — Giant Coward", power: "5", toughness: "4", mana: "{4}{R}",
  oracle: "This creature can't block alone." };
const MOGG_FLUNKIES = { id: "mf", name: "Mogg Flunkies", type: "Creature — Goblin", power: "3", toughness: "3", mana: "{1}{R}",
  oracle: "This creature can't attack or block alone." };
// FN guard: a CONDITIONAL can't-attack-alone (the "unless" rider) is NOT this shape — stays Arbiter.
const PIPSQUEAK = { id: "pq", name: "Pipsqueak, Rebel Strongarm", type: "Legendary Creature — Human Rebel Ally", power: "2", toughness: "2", mana: "{1}{R}",
  oracle: "Pipsqueak can't attack alone unless he has a +1/+1 counter on him." };

describe("CB-1 readers + classify", () => {
  it("cantAttackAlone matches the attack-only bare form AND the combined form, not the block-only form", () => {
    expect(cantAttackAlone(RAGING_KRONCH)).toBe(true);
    expect(cantAttackAlone(MOGG_FLUNKIES)).toBe(true);      // combined form still forbids a lone attack
    expect(cantAttackAlone(CRAVEN_HULK)).toBe(false);       // block-only: may attack alone
    expect(cantAttackAlone({ oracle: "This token can't attack alone." })).toBe(true);
  });
  it("cantBlockAlone matches the block-only bare form AND the combined form, not the attack-only form", () => {
    expect(cantBlockAlone(CRAVEN_HULK)).toBe(true);
    expect(cantBlockAlone(MOGG_FLUNKIES)).toBe(true);       // combined form still forbids a lone block
    expect(cantBlockAlone(RAGING_KRONCH)).toBe(false);      // attack-only: may block alone
  });
  it("the CONDITIONAL 'unless' variant matches neither reader (FN-safe)", () => {
    expect(cantAttackAlone(PIPSQUEAK)).toBe(false);
    expect(cantBlockAlone(PIPSQUEAK)).toBe(false);
  });
  it("isEnforcedEvasionClause admits all three single-clause forms (pre-lowercased, name-normalized)", () => {
    expect(isEnforcedEvasionClause("this creature can't attack alone")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't block alone")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't attack or block alone")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't attack unless it's your birthday")).toBe(false);
  });
  it("the combined-form reader (cantAttackOrBlockAlone) is unchanged for the SM-2 cards", () => {
    expect(cantAttackOrBlockAlone(MOGG_FLUNKIES)).toBe(true);
    expect(cantAttackOrBlockAlone(RAGING_KRONCH)).toBe(false); // bare attack-only isn't the combined form
  });
  it("the pure single-sided bodies flip native", () => {
    expect(classifyCard(RAGING_KRONCH)).toBe("native-body");
    expect(classifyCard(BONDED_CONSTRUCT)).toBe("native-body");
    expect(classifyCard(TRUSTY_COMPANION)).toBe("native-body"); // Vigilance + the static, both modeled
    expect(classifyCard(CRAVEN_HULK)).toBe("native-body");
  });
  it("FN guard: the conditional variant stays body-only", () => {
    expect(classifyCard(PIPSQUEAK)).toBe("body-only");
  });
});

describe("CB-1 runtime — the SINGLE-SIDED declaration gates", () => {
  // Board: `subject` (the can't-alone creature) + a plain buddy, both controlled by the acting seat.
  function board(step, subjectCard, seat) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const subject = createPermanent({ id: "subj", card: subjectCard, controller: seat, summoningSick: false });
    const buddy = createPermanent({ id: "bud", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: seat, summoningSick: false });
    return { ...s, turn: 4, phase: "combat", step,
      combat: { attackers: [], blockers: [] },
      players: { ...s.players, [seat]: { ...s.players[seat], battlefield: [subject, buddy] } } };
  }

  it("CANT-ATTACK-ALONE: not offered as a sole attacker; offered once a teammate attacks", () => {
    let s = board("declare-attackers", RAGING_KRONCH, "user");
    s = { ...s, activePlayer: "user", priorityHolder: "user" };
    const atk = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(atk(s)).not.toContain("subj");                 // suppressed while nothing is declared
    expect(atk(s)).toContain("bud");                       // the buddy leads freely
    const after = { ...s, combat: { attackers: [{ permanentId: "bud", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(atk(after)).toContain("subj");                  // teammate declared → Kronch may join
  });

  it("CANT-ATTACK-ALONE creature may still BLOCK alone (block gate not gated)", () => {
    let s = board("declare-blockers", RAGING_KRONCH, "user");
    const atkr = createPermanent({ id: "en", card: { id: "rc", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, activePlayer: "ai1", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "en", attackingPlayer: "ai1", defender: "user" }], blockers: [] },
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [atkr] } } };
    const blk = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId);
    expect(blk).toContain("subj");                          // a lone block by an attack-only creature is legal
  });

  it("CANT-BLOCK-ALONE: not offered as a sole blocker; offered once another blocker is declared", () => {
    let s = board("declare-blockers", CRAVEN_HULK, "user");
    const r1 = createPermanent({ id: "r1", card: { id: "rc", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const r2 = createPermanent({ id: "r2", card: { id: "rc2", name: "Raider Two", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, activePlayer: "ai1", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "r1", attackingPlayer: "ai1", defender: "user" }, { permanentId: "r2", attackingPlayer: "ai1", defender: "user" }], blockers: [] },
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [r1, r2] } } };
    const blk = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId);
    expect(blk(s)).toContain("bud");                        // the buddy may block freely
    expect(blk(s)).not.toContain("subj");                  // Craven Hulk suppressed while no blocker is declared
    const after = { ...s, combat: { ...s.combat, blockers: [{ blockerId: "bud", blockingPlayer: "user", attackerId: "r1" }] } };
    expect(blk(after)).toContain("subj");                  // another blocker declared → Hulk may block
  });

  it("CANT-BLOCK-ALONE creature may still ATTACK alone (attack gate not gated)", () => {
    let s = board("declare-attackers", CRAVEN_HULK, "user");
    s = { ...s, activePlayer: "user", priorityHolder: "user" };
    const atk = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(atk).toContain("subj");                          // a lone attack by a block-only creature is legal
  });

  it("regression: the combined form (Mogg Flunkies) is still gated on BOTH sides", () => {
    // attack side
    let sa = board("declare-attackers", MOGG_FLUNKIES, "user");
    sa = { ...sa, activePlayer: "user", priorityHolder: "user" };
    const atk = legalActionsForPlayer(sa, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(atk).not.toContain("subj");
    // block side
    let sb = board("declare-blockers", MOGG_FLUNKIES, "user");
    const en = createPermanent({ id: "en", card: { id: "rc", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    sb = { ...sb, activePlayer: "ai1", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "en", attackingPlayer: "ai1", defender: "user" }], blockers: [] },
      players: { ...sb.players, ai1: { ...sb.players.ai1, battlefield: [en] } } };
    const blk = legalActionsForPlayer(sb, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId);
    expect(blk).not.toContain("subj"); // a lone block is suppressed (only one enemy attacker → buddy could block but Flunkies can't lead)
  });
});
