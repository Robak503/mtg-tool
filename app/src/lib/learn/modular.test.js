/**
 * modular.test.js — MODULAR (BLITZ MOD-1, CR 702.43a/b — verified vs the bundled cr_current.json:
 * 702.43 "Modular", 702.43a the enters-with-N-+1/+1-counters replacement + the "when it dies, you may
 * put its +1/+1 counters on target artifact creature" trigger, 702.43b "each instance works separately").
 *
 * CR 702.43a is BOTH halves; this slice models BOTH end-to-end:
 *   (1) ENTERS half — resolvers.enterPermanent reads modularKeywordValues (DIGIT-only, the SAME recognizer
 *       detectTriggers uses) and adds N +1/+1 counters AS the creature enters (the reminder-parens sentence
 *       is unreachable by entersWithPlusCounters, which strips parens).
 *   (2) DIES half — detectTriggers synthesizes the self-dies "you may put its +1/+1 counters on target
 *       artifact creature" trigger (the SOULSHIFT reminder-parens precedent). The count is the DYING
 *       creature's last-known +1/+1 total (CR 603.6e LKI, ctx.triggeringPlusCounterCount — so a creature
 *       grown by ADDED counters moves ALL of them); the target is narrowed by cardType:"artifact"; a +1/+1
 *       counter is own-intent, so the flush chooser picks the controller's OWN artifact creature.
 *
 * CREED FPs guarded: the two non-fixed-count variants MUST park — "Modular—Sunburst" (Arcbound Wanderer,
 * variable per-color enters count) and "Poison Modular N" (Arcbound Mamba, a player-OR-artifact-creature +
 * poison payoff) — their differing behavior is never claimed native. Carriers with OTHER unmodeled text
 * (Ravager's sac ability, Overseer's with-modular upkeep) stay body-only. Real oracle fixtures (exact
 * bundled Scryfall text, verified 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, checkDiesTriggers, modularKeywordValues } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed oracles (exact bundled Scryfall text) ────────────────────────
const WORKER = { id: "w", name: "Arcbound Worker", type: "Artifact Creature — Construct", mana: "{2}", power: "0", toughness: "0",
  oracle: "Modular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const BRUISER = { id: "br", name: "Arcbound Bruiser", type: "Artifact Creature — Golem", mana: "{5}", power: "0", toughness: "0",
  oracle: "Modular 3 (This creature enters with three +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const STINGER = { id: "st", name: "Arcbound Stinger", type: "Artifact Creature — Insect", mana: "{2}", power: "0", toughness: "0",
  oracle: "Flying\nModular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const HYBRID = { id: "hy", name: "Arcbound Hybrid", type: "Artifact Creature — Beast", mana: "{4}", power: "0", toughness: "0",
  oracle: "Haste\nModular 2 (This creature enters with two +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const LANCER = { id: "la", name: "Arcbound Lancer", type: "Artifact Creature — Beast", mana: "{7}", power: "0", toughness: "0",
  oracle: "First strike\nModular 4 (This creature enters with four +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const MOUSER = { id: "mo", name: "Arcbound Mouser", type: "Artifact Creature — Cat", mana: "{3}", power: "0", toughness: "0",
  oracle: "Lifelink\nModular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const PROTOTYPE = { id: "pr", name: "Arcbound Prototype", type: "Artifact Creature — Assembly-Worker", mana: "{4}", power: "0", toughness: "0",
  oracle: "Modular 2 (This creature enters with two +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };

// ── PARK fixtures (variants + other-text carriers must NOT flip) ──────────────
const WANDERER = { id: "wa", name: "Arcbound Wanderer", type: "Artifact Creature — Golem", mana: "{6}", power: "0", toughness: "0",
  oracle: "Modular—Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const MAMBA = { id: "ma", name: "Arcbound Mamba", type: "Artifact Creature — Snake", mana: "{3}", power: "0", toughness: "0",
  oracle: "Deathtouch\nPoison Modular 2 (This creature enters the battlefield with two +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target player or artifact creature. If they're put on a player this way, they become poison counters.)" };
const RAVAGER = { id: "rv", name: "Arcbound Ravager", type: "Artifact Creature — Beast", mana: "{2}", power: "0", toughness: "0",
  oracle: "Sacrifice an artifact: Put a +1/+1 counter on this creature.\nModular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };
const OVERSEER = { id: "ov", name: "Arcbound Overseer", type: "Artifact Creature — Golem", mana: "{8}", power: "0", toughness: "0",
  oracle: "At the beginning of your upkeep, put a +1/+1 counter on each creature you control with modular.\nModular 6 (This creature enters with six +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" };

// ── Target-side fixtures ──────────────────────────────────────────────────────
const STEEL_HOST = { id: "sh", name: "Steel Overseer", type: "Artifact Creature — Construct", mana: "{2}", power: "1", toughness: "1", oracle: "" };
const BEAR = { id: "be", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

const state0 = () => ({ ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" });
const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };

// Kill a modular creature whose look-back had `plusCount` +1/+1 counters, then resolve the dies flush.
// `settle` decides the "you may" (default true). Returns the settled state.
function killModularAndSettle({ modularCard, plusCount, userBf, aiBf = [], settle = true }) {
  let s = state0();
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai1: { ...s.players.ai1, battlefield: aiBf } } };
  // the modular creature has already left the battlefield (removed from userBf by the caller); fire its dies trigger
  const dead = [{ controller: "user", id: "dyingModular", name: modularCard.name, card: modularCard, counters: { "+1/+1": plusCount } }];
  s = checkDiesTriggers(s, dead);
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  s = resolveAll(s);
  if (s.pendingChoice && s.pendingChoice.kind === "optional-effect") {
    s = resolveAll(resolveOptionalChoice(s, settle));
  }
  return s;
}
const plus = (state, pid, permId) => (state.players[pid].battlefield.find((p) => p.id === permId)?.counters?.["+1/+1"]) || 0;

describe("MODULAR — recognizer (DIGIT-only; variants and grants never count)", () => {
  it("a bare 'Modular N' keyword segment counts per printed instance", () => {
    expect(modularKeywordValues(WORKER.oracle)).toEqual([1]);
    expect(modularKeywordValues(BRUISER.oracle)).toEqual([3]);
    expect(modularKeywordValues(HYBRID.oracle)).toEqual([2]);
    expect(modularKeywordValues(LANCER.oracle)).toEqual([4]);
    expect(modularKeywordValues(OVERSEER.oracle)).toEqual([6]);
  });
  it("CREED — 'Modular—Sunburst' (variable count) and 'Poison Modular N' (variant payoff) never count", () => {
    expect(modularKeywordValues(WANDERER.oracle)).toEqual([]);   // no space+digit after "modular"
    expect(modularKeywordValues(MAMBA.oracle)).toEqual([]);      // segment leads with "poison"
  });
  it("CREED — a mid-sentence 'with modular' scope is never a bare keyword segment", () => {
    expect(modularKeywordValues("At the beginning of your upkeep, put a +1/+1 counter on each creature you control with modular.")).toEqual([]);
    expect(modularKeywordValues("Modular is a keyword.")).toEqual([]);
  });
});

describe("MODULAR — synthesis + parse + routing", () => {
  it("Modular N synthesizes ONE self-dies descriptor per instance that routes natively", () => {
    const [d] = detectTriggers(WORKER).filter((t) => /modular/i.test(t.sourceText || ""));
    expect(d).toMatchObject({ event: "dies", scope: "self", whose: "any", sourceText: "Modular 1" });
    expect(d.effectClause).toBe("you may put its +1/+1 counters on target artifact creature");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("the synthesized clause parses HIGH to a targeted, LKI-scaled, artifact-restricted, optional add-counter", () => {
    const p = parseEffectClause("you may put its +1/+1 counters on target artifact creature", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "add-counter", counterType: "+1/+1", countContext: "triggeringPlusCounterCount",
      targetType: "creature", restrictions: [{ kind: "cardType", type: "artifact" }], optional: true,
    }]);
  });
});

describe("MODULAR — classify (keyword-only carriers flip; variants + other-text hold)", () => {
  it("pure/simple modular carriers flip native", () => {
    for (const c of [WORKER, BRUISER, STINGER, HYBRID, LANCER, MOUSER, PROTOTYPE]) {
      expect(isNativeTier(classifyCard(c))).toBe(true);
    }
    expect(classifyCard(WORKER)).toBe("native-body");
  });
  it("modular COMPOSES with an already-modeled activated ability — Arcbound Ravager flips native", () => {
    // "Sacrifice an artifact: Put a +1/+1 counter on this creature" is already native-activated; once modular
    // is modeled its whole text is covered, so the card legitimately flips (NOT an FP — every clause plays).
    expect(classifyCard(RAVAGER)).toBe("native-activated");
  });
  it("CREED — variants and unmodeled-text carriers stay off native (all-or-nothing)", () => {
    expect(isNativeTier(classifyCard(WANDERER))).toBe(false);  // Modular—Sunburst (variable enters count)
    expect(isNativeTier(classifyCard(MAMBA))).toBe(false);     // Poison Modular (player-or-artifact + poison)
    expect(isNativeTier(classifyCard(OVERSEER))).toBe(false);  // with-modular upkeep scope unmodeled
  });
});

describe("MODULAR — runtime: the ENTERS half (CR 702.43a)", () => {
  it("a modular creature enters with exactly N +1/+1 counters, sized from turn 1", () => {
    const s = enterPermanent(state0(), BRUISER, "user");
    const perm = s.players.user.battlefield.find((p) => p.card.name === "Arcbound Bruiser");
    expect(perm.counters["+1/+1"]).toBe(3);
    expect(permanentPower(s, perm.id)).toBe(3);   // 0 base + 3
    expect(permanentToughness(s, perm.id)).toBe(3);
  });
  it("Modular 1 enters with one counter; the variable Sunburst adds none (parks)", () => {
    const s1 = enterPermanent(state0(), WORKER, "user");
    expect(s1.players.user.battlefield.find((p) => p.card.name === "Arcbound Worker").counters["+1/+1"]).toBe(1);
    // Modular—Sunburst is not the digit form → the enters replacement adds nothing here (Sunburst count unmodeled).
    const s2 = enterPermanent(state0(), WANDERER, "user");
    expect((s2.players.user.battlefield.find((p) => p.card.name === "Arcbound Wanderer").counters?.["+1/+1"]) || 0).toBe(0);
  });
});

describe("MODULAR — runtime: the DIES half (CR 702.43a — CREED core)", () => {
  it("the dying creature's FULL last-known +1/+1 total moves to a chosen OWN artifact creature", () => {
    // A modular creature that grew to 3 counters (LKI incl. added counters, per Ravager's sac) dies with an
    // own artifact host + a non-artifact creature present. All 3 counters move to the artifact host ONLY.
    const host = createPermanent({ id: "host", card: STEEL_HOST, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "bear", card: BEAR, controller: "user", summoningSick: false });
    const s = killModularAndSettle({ modularCard: WORKER, plusCount: 3, userBf: [host, bear] });
    expect(plus(s, "user", "host")).toBe(3);   // full LKI total, not the printed Modular 1
    expect(plus(s, "user", "bear")).toBe(0);   // a non-artifact creature is never a legal target (cardType:artifact)
  });
  it("you-may DECLINE leaves every counter unmoved", () => {
    const host = createPermanent({ id: "host", card: STEEL_HOST, controller: "user", summoningSick: false });
    const s = killModularAndSettle({ modularCard: BRUISER, plusCount: 3, userBf: [host], settle: false });
    expect(plus(s, "user", "host")).toBe(0);
  });
  it("own-intent: with both sides present the OWN artifact creature is chosen, never the opponent's", () => {
    const ownHost = createPermanent({ id: "host", card: STEEL_HOST, controller: "user", summoningSick: false });
    const enemyHost = createPermanent({ id: "enemyHost", card: { ...STEEL_HOST, id: "eh", name: "Enemy Golem" }, controller: "ai1", summoningSick: false });
    const s = killModularAndSettle({ modularCard: HYBRID, plusCount: 2, userBf: [ownHost], aiBf: [enemyHost] });
    expect(plus(s, "user", "host")).toBe(2);
    expect(plus(s, "ai1", "enemyHost")).toBe(0);
  });
  it("with ONLY an enemy artifact creature the trigger declines (no friendly-fire buff)", () => {
    const enemyHost = createPermanent({ id: "enemyHost", card: { ...STEEL_HOST, id: "eh", name: "Enemy Golem" }, controller: "ai1", summoningSick: false });
    const s = killModularAndSettle({ modularCard: WORKER, plusCount: 1, userBf: [], aiBf: [enemyHost] });
    expect(plus(s, "ai1", "enemyHost")).toBe(0);
  });
});

describe("MODULAR — end-to-end via the SBA death path (enters, grows, dies, moves)", () => {
  it("a Worker on the battlefield killed by lethal damage moves its counter to an own artifact creature", () => {
    let s = enterPermanent(state0(), WORKER, "user");                 // enters with 1 counter
    s = enterPermanent(s, STEEL_HOST, "user");                        // the artifact host
    const worker = s.players.user.battlefield.find((p) => p.card.name === "Arcbound Worker");
    // mark lethal on the worker, run the SBA + dies flush
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === worker.id ? { ...p, damageMarked: 99 } : p)) } } };
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(flushTriggers(checkDiesTriggers(lethal.state, lethal.dead), { chooseTargets: chooseTriggerTargets }));
    if (s.pendingChoice && s.pendingChoice.kind === "optional-effect") s = resolveAll(resolveOptionalChoice(s, true));
    const host = s.players.user.battlefield.find((p) => p.card.name === "Steel Overseer");
    expect(host.counters["+1/+1"]).toBe(1);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Arcbound Worker");
  });
});
