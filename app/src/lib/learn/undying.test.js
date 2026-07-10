/**
 * undying.test.js — KW-UNDYING (CR 702.92a) + the HANCOCK counter-keyed dynamic anthem (SHELF S7).
 *
 * UNDYING: "Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield
 * under its owner's control with a +1/+1 counter on it.)" — a keyword whose whole triggered ability lives in
 * reminder parens, synthesized in detectTriggers (the bushido/afflict precedent) and fired through the
 * Enduring-cycle dies-return pipeline:
 *   - undyingKeywordCount is STRUCTURAL (a whole comma-segment of a line must be exactly "undying"), so a
 *     GRANT ("target creature gains undying" — Undying Evil; "…has undying" — Mikaeus) and an old-wording
 *     self-NAME ("When Undying Beast dies, …") NEVER self-synthesize (CREED — no false synthesis).
 *   - the intervening-if "it had no +1/+1 counters on it" (CR 603.4) reads the death look-back's counters
 *     snapshot (CR 603.6e LKI — ctx.triggeringHadNoPlusCounters). THE LOOP TERMINATES: the returned body
 *     carries a +1/+1 counter, so its next death reads false → no second return.
 *   - the undying-return atom re-enters the card from the graveyard under its owner + adds the counter
 *     through gameState.addCounter (→ applyCounterDoubling, CR 614). Token guard (CR 111.7) + gone-from-
 *     graveyard no-op (CR 608.2b) mirror applySelfReturn.
 *
 * HANCOCK: "Each other creature you control that's a Zombie or Mutant gets +X/+X, where X is the number of
 * counters on Hancock." — a layer-7c ptModifyDynamicCount anthem whose magnitude is the TOTAL counters on
 * the SOURCE (any kind — countersOnSource with counterType null), over a subtype-UNION selector with
 * excludeSelf. CREED FP here = wrong count / wrong group, so exact magnitudes + group membership are pinned.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures,
} from "./gameState.js";
import { detectTriggers, checkDiesTriggers, undyingKeywordCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { applyUndyingReturn } from "./effects/atoms/selfReturn.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const UNDYING_REMINDER =
  "Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)";
const butcherGhoul = (id = "bg-card") => ({
  id, name: "Butcher Ghoul", type: "Creature — Zombie", power: "1", toughness: "1", mana: "{1}{B}",
  oracle: UNDYING_REMINDER,
});
const HANCOCK_ORACLE =
  "Each other creature you control that's a Zombie or Mutant gets +X/+X, where X is the number of counters on Hancock.\n" + UNDYING_REMINDER;
const hancockCard = (id = "hk-card") => ({
  id, name: "Hancock, Ghoulish Mayor", type: "Legendary Creature — Zombie Mutant Advisor",
  power: "2", toughness: "1", mana: "{2}{B}", oracle: HANCOCK_ORACLE,
});

const MARKER = "[undying] return it to the battlefield under its owner's control with a +1/+1 counter on it";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function markLethal(state, pid, permId) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid],
    battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

describe("undyingKeywordCount — structural keyword detection (CREED: no false synthesis)", () => {
  it("counts the printed keyword: bare line, keyword list, reminder-carrying line", () => {
    expect(undyingKeywordCount(UNDYING_REMINDER)).toBe(1);
    expect(undyingKeywordCount("Haste\nUndying")).toBe(1);
    expect(undyingKeywordCount("Vigilance, trample, undying")).toBe(1);
  });
  it("a GRANT never counts (Undying Evil / Mikaeus — the undying belongs to the recipients)", () => {
    expect(undyingKeywordCount("Target creature gains undying until end of turn.")).toBe(0);
    expect(undyingKeywordCount("Each other non-Human creature you control has undying.")).toBe(0);
  });
  it("an old-wording self-NAME containing 'Undying' never counts ('When Undying Beast dies, …')", () => {
    expect(undyingKeywordCount("When Undying Beast dies, put Undying Beast on top of its owner's library.")).toBe(0);
  });
});

describe("detection + routing", () => {
  it("the printed keyword synthesizes a self-dies descriptor with the marker + the LKI intervening-if, and it routes natively", () => {
    const [d] = detectTriggers(butcherGhoul()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self", interveningIf: "it had no +1/+1 counters on it" });
    expect(d.effectClause).toBe(MARKER);
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("a GRANT card synthesizes NO dies trigger (Mikaeus-style static)", () => {
    const mik = { id: "mik", name: "Granting Lord", type: "Creature — Zombie Cleric", power: "5", toughness: "5",
      oracle: "Each other non-Human creature you control has undying." };
    expect(detectTriggers(mik).filter((t) => t.event === "dies")).toHaveLength(0);
  });
});

describe("intervening-if (HAD-NO-+1/+1-COUNTERS, CR 603.4 + 603.6e)", () => {
  it("'it had no +1/+1 counters on it' is a parseable condition", () => {
    expect(interveningIfParseable("it had no +1/+1 counters on it")).toBe(true);
  });
  it("evaluates true when the LKI showed no counters, false when it had one, null with no snapshot (FN-safe, never fail-open)", () => {
    const s = baseState();
    expect(evaluateInterveningIf(s, "it had no +1/+1 counters on it", "user", { triggeringHadNoPlusCounters: true })).toBe(true);
    expect(evaluateInterveningIf(s, "it had no +1/+1 counters on it", "user", { triggeringHadNoPlusCounters: false })).toBe(false);
    expect(evaluateInterveningIf(s, "it had no +1/+1 counters on it", "user", {})).toBeNull();
  });
});

describe("parser routing", () => {
  it("the marker parses HIGH, non-targeted → the undying-return atom", () => {
    const p = parseEffectClause(MARKER, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(programNeedsChosenTarget(p)).toBe(false);
    expect(p.atoms).toEqual([{ op: "undying-return" }]);
  });
});

describe("classify", () => {
  it("a pure-undying creature reads keyword-only → native (Butcher Ghoul)", () => {
    expect(isKeywordOnly(UNDYING_REMINDER)).toBe(true);
    expect(classifyCard(butcherGhoul()).startsWith("native")).toBe(true);
  });
  it("Hancock, Ghoulish Mayor → native-static (anthem + undying both modeled)", () => {
    expect(classifyCard(hancockCard())).toBe("native-static");
  });
});

describe("engine (CREED core) — the undying loop", () => {
  it("dies with NO counters → returns to the battlefield under its owner with a +1/+1 counter; dies AGAIN → stays dead", () => {
    let s = baseState();
    const bg = createPermanent({ id: "bg", card: butcherGhoul(), controller: "user", summoningSick: false });
    s = withBattlefield(s, "user", [bg]);
    s = markLethal(s, "user", "bg");

    // FIRST death — no +1/+1 counters on the look-back → the return fires.
    let lethal = destroyLethalCreatures(s);
    expect(lethal.dead[0].counters).toEqual({}); // the counters LKI snapshot rides the look-back
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dies")).toHaveLength(1);
    s = resolveAll(s);
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Butcher Ghoul");
    const bf = s.players.user.battlefield.filter((p) => p.card?.name === "Butcher Ghoul");
    expect(bf).toHaveLength(1);
    expect(bf[0].counters?.["+1/+1"]).toBe(1); // returned WITH the counter (CR 702.92a)
    expect(bf[0].controller).toBe("user"); // under its OWNER's control

    // SECOND death — the LKI now shows a +1/+1 counter → the intervening-if is false → no return (loop ends).
    s = markLethal(s, "user", bf[0].id);
    lethal = destroyLethalCreatures(s);
    expect(lethal.dead[0].counters).toEqual({ "+1/+1": 1 });
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Butcher Ghoul")).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Butcher Ghoul");
  });
});

describe("atom fail-safes", () => {
  it("CR 111.7 — a TOKEN never returns (it ceases to exist)", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ id: "tok", name: "Zombie", token: true, type: "Creature — Zombie" }] } } };
    const after = applyUndyingReturn(s, { op: "undying-return" },
      { triggeringController: "user", triggeringCardId: "tok", triggeringCardIsToken: true });
    expect(after.players.user.battlefield).toEqual([]);
  });
  it("CR 608.2b — the card already left the graveyard → a logged no-op (no fabricated permanent)", () => {
    const s = baseState();
    const after = applyUndyingReturn(s, { op: "undying-return" },
      { triggeringController: "user", triggeringCardId: "gone" });
    expect(after.players.user.battlefield).toEqual([]);
  });
});

describe("HANCOCK counter-keyed dynamic anthem (layer 7c, countersOnSource counterType:null)", () => {
  it("parses to the ptModifyDynamicCount descriptor (subtype union, excludeSelf, total-counters magnitude)", () => {
    const [d] = parseStaticAbilities(hancockCard());
    expect(d).toMatchObject({
      layer: 7, sublayer: "7c",
      op: { layerOp: "ptModifyDynamicCount", countSpec: { kind: "countersOnSource", counterType: null }, perPower: 1, perToughness: 1 },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: ["zombie", "mutant"], excludeSelf: true } },
    });
  });

  it("buffs each OTHER Zombie/Mutant you control by the TOTAL counters on Hancock (any kind), live", () => {
    let s = baseState();
    const hancock = { ...createPermanent({ id: "hk", card: hancockCard(), controller: "user" }), counters: { "+1/+1": 2, "rad": 1 } };
    const zombie = createPermanent({ id: "z1", card: { name: "Gravecrawler", type: "Creature — Zombie", power: "2", toughness: "1", oracle: "" }, controller: "user" });
    const mutant = createPermanent({ id: "m1", card: { name: "Pond Scum", type: "Creature — Mutant", power: "1", toughness: "1", oracle: "" }, controller: "user" });
    const human = createPermanent({ id: "h1", card: { name: "Villager", type: "Creature — Human", power: "1", toughness: "1", oracle: "" }, controller: "user" });
    s = withBattlefield(s, "user", [hancock, zombie, mutant, human]);
    const oppZombie = createPermanent({ id: "oz", card: { name: "Opp Zombie", type: "Creature — Zombie", power: "2", toughness: "2", oracle: "" }, controller: "ai1" });
    s = withBattlefield(s, "ai1", [oppZombie]);

    // X = 3 (2 +1/+1 counters + 1 rad counter — "the number of counters", ALL kinds).
    expect(permanentPower(s, "z1")).toBe(5);      // 2 + 3
    expect(permanentToughness(s, "z1")).toBe(4);  // 1 + 3
    expect(permanentPower(s, "m1")).toBe(4);      // 1 + 3 (union: Mutant matches too)
    expect(permanentPower(s, "h1")).toBe(1);      // a Human is neither → untouched
    expect(permanentPower(s, "oz")).toBe(2);      // an opponent's Zombie → untouched ("you control")
    // "each OTHER creature" — Hancock (a Zombie Mutant himself) never buffs himself; his +1/+1 counters
    // still apply as counters (layer 7d): printed 2/1 + two +1/+1 counters = 4/3, NOT boosted by the anthem.
    expect(permanentPower(s, "hk")).toBe(4);
    expect(permanentToughness(s, "hk")).toBe(3);
  });

  it("zero counters on Hancock → X = 0 → no buff (live read, not a snapshot)", () => {
    let s = baseState();
    const hancock = createPermanent({ id: "hk", card: hancockCard(), controller: "user" });
    const zombie = createPermanent({ id: "z1", card: { name: "Gravecrawler", type: "Creature — Zombie", power: "2", toughness: "1", oracle: "" }, controller: "user" });
    s = withBattlefield(s, "user", [hancock, zombie]);
    expect(permanentPower(s, "z1")).toBe(2);
    expect(permanentToughness(s, "z1")).toBe(1);
  });

  it("the NAMED-counter countersOnSource form is untouched (regression: only the named kind counts there)", () => {
    // The chosen-type artifact anthem ("+1/+1 for each fellowship counter") keeps its exact-kind read.
    const banner = {
      id: "bk", name: "Banner of Kinship", type: "Artifact",
      oracle: "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact.",
    };
    const [d] = parseStaticAbilities(banner).filter((x) => x.op?.layerOp === "ptModifyDynamicCount");
    expect(d.op.countSpec).toEqual({ kind: "countersOnSource", counterType: "fellowship" });
  });
});
