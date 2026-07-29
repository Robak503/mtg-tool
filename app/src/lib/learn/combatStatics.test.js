/**
 * combatStatics.test.js — BLITZ CS-1: COMBAT BLOCK/ATTACK statics (census vein #12).
 *
 * Five families, each with LOCKSTEP recognition + enforcement (the EV-3 shared-parser discipline —
 * combatEvasion.js owns ONE core pattern per family, consumed by the runtime reader AND the
 * isEnforcedEvasionClause classifier mirror, so credit == enforcement by construction):
 *
 *   1. MULTI-BLOCK (CR 509.1a, modified by the printed static; CR 510.1d division):
 *      "can block an additional creature each combat" (max 2 — Selesnya Sagittars class) /
 *      "can block any number of creatures" (∞ — Palace Guard class). Offered at legalChoices'
 *      declare-blockers enumeration; damage DIVIDED at combatResolution (never full power to each).
 *   2. MUST-BE-BLOCKED (CR 509.1c — a block requirement): "must be blocked if able" (Riveteers
 *      Decoy class), seeded at opponentAI.pickBlockers — the LU-1 lure seam, the MUST-ATTACK house
 *      bar (AI seats comply; the human seat is never hard-gated).
 *      + the LURE "with flying" filter (Talruum Piper) narrowing the lure-forced set.
 *   3. CANT-ATTACK-UNLESS-YOU (CR 508.1c — an attack restriction): "can't attack unless you control
 *      <vetted predicate>" (Desperate Castaways / War Falcon / Steelclad Serpent / Warden of the
 *      Chained), a hard attacker filter in actionsDeclareAttacker.
 *   4. CANT-ATTACK-UNLESS-DEFENDER (CR 508.1c — the SM-1 islandhome seam generalized): per-defender
 *      predicates (blue permanent / creature with flying / enchantment-or-enchanted / poisoned /
 *      monarch — Whimwader / Lurking Green Dragon / Godhunter Octopus / Chained Throatseeker /
 *      Crown-Hunter Hireling).
 *   5. MUST-ATTACK-UNLESS (CR 508.1d — a conditional attack requirement): "attacks each combat if
 *      able unless you control <predicate>" (Reckless Cohort / Marauding Maulhorn) — forced only
 *      while the predicate fails (fixes the pre-CS-1 unconditional over-enforcement).
 *
 * Real oracle fixtures (bundled Scryfall wording, 2026-07-17). Every parked variant pinned here as a
 * safe FN: activated "{cost}: … this turn" grants, team statics (Brave the Sands — [SAP] lane),
 * conditional riders, "can't attack OR BLOCK unless …" combined forms, action-cost unlesses.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAttackPlan, pickBlockPlan } from "./opponentAI.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { maxBlocksOf, mustBeBlockedIfAble, lureFilterOf, attackControllerRequirementOf, attackDefenderRequirementOf, mustAttackUnlessOf } from "./combatEvasion.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, oracle, over = {}) => ({ id: `c-${name}`, name, type: "Creature — Beast", power: "2", toughness: "2", oracle, ...over });
const perm = (id, c, controller, over = {}) =>
  createPermanent({ id, card: c, controller, summoningSick: false, ...over });

// ─── recognition — the classifier mirror credits EXACTLY what the runtime enforces ───

describe("CS-1 recognition — real oracle, whole-card law", () => {
  it("MULTI-BLOCK carriers flip; readers agree", () => {
    const sagittars = card("Selesnya Sagittars", "Reach\nThis creature can block an additional creature each combat.", { power: "0", toughness: "5" });
    expect(classifyCard(sagittars)).toBe("native-body");
    expect(maxBlocksOf(sagittars)).toBe(2);
    const guard = card("Palace Guard", "This creature can block any number of creatures.", { power: "1", toughness: "4" });
    expect(classifyCard(guard)).toBe("native-body");
    expect(maxBlocksOf(guard)).toBe(Infinity);
  });
  it("MUST-BE-BLOCKED + filtered-LURE carriers flip; readers agree", () => {
    const decoy = card("Gaea's Protector", "This creature must be blocked if able.");
    expect(classifyCard(decoy)).toBe("native-body");
    expect(mustBeBlockedIfAble(decoy)).toBe(true);
    const piper = card("Talruum Piper", "All creatures with flying able to block this creature do so.");
    expect(classifyCard(piper)).toBe("native-body");
    expect(lureFilterOf(piper)).toEqual({ filter: "Flying" });
  });
  it("CANT-ATTACK-UNLESS-YOU carriers flip; the shared predicate grammar parses each", () => {
    const castaways = card("Desperate Castaways", "This creature can't attack unless you control an artifact.");
    expect(classifyCard(castaways)).toBe("native-body");
    expect(attackControllerRequirementOf(castaways)).toEqual({ kind: "artifact", other: false });
    const falcon = card("War Falcon", "Flying\nThis creature can't attack unless you control a Knight or a Soldier.");
    expect(classifyCard(falcon)).toBe("native-body");
    expect(attackControllerRequirementOf(falcon)).toEqual({ kind: "subtypeAny", subtypes: ["Knight", "Soldier"], other: false });
    const warden = card("Warden of the Chained", "Trample\nThis creature can't attack unless you control another creature with power 4 or greater.");
    expect(classifyCard(warden)).toBe("native-body");
    expect(attackControllerRequirementOf(warden)).toEqual({ kind: "powerGE", n: 4, other: true });
  });
  it("CANT-ATTACK-UNLESS-DEFENDER carriers flip; SM-1's land face is unchanged", () => {
    const whim = card("Whimwader", "This creature can't attack unless defending player controls a blue permanent.");
    expect(classifyCard(whim)).toBe("native-body");
    expect(attackDefenderRequirementOf(whim)).toEqual({ kind: "colorPermanent", color: "U" });
    const seeker = card("Chained Throatseeker", "Infect\nThis creature can't attack unless defending player is poisoned.");
    expect(classifyCard(seeker)).toBe("native-body");
    expect(attackDefenderRequirementOf(seeker)).toEqual({ kind: "poisoned" });
    // SM-1 compat: the land-only face still reads islandhome exactly.
    expect(attackDefenderRequirementOf(card("Sea Serpent", "This creature can't attack unless defending player controls an Island."))).toEqual({ kind: "land", subtype: "island" });
  });
  it("MUST-ATTACK-UNLESS carriers flip; the unless-predicate parses", () => {
    const cohort = card("Reckless Cohort", "This creature attacks each combat if able unless you control another Ally.");
    expect(classifyCard(cohort)).toBe("native-body");
    expect(mustAttackUnlessOf(cohort)).toEqual({ kind: "subtypeAny", subtypes: ["Ally"], other: true });
    const maulhorn = card("Marauding Maulhorn", "This creature attacks each combat if able unless you control a creature named Advocate of the Beast.");
    expect(classifyCard(maulhorn)).toBe("native-body");
    expect(mustAttackUnlessOf(maulhorn)).toEqual({ kind: "namedCreature", name: "advocate of the beast", other: false });
  });
  it("FN guards — every parked variant stays body-only and reader-silent", () => {
    // activated this-turn grant, not the printed static
    expect(isKeywordOnly("{2}: This creature can block an additional creature this turn.", "Luminous Guardian")).toBe(false);
    // conditional rider (monarch gate)
    expect(isKeywordOnly("This creature can block an additional creature each combat as long as you're the monarch.", "Entourage of Trest")).toBe(false);
    // team static — the [SAP] lane, not this slice
    expect(isKeywordOnly("Each creature you control can block an additional creature each combat.", "High Ground")).toBe(false);
    // activated must-be-blocked
    expect(isKeywordOnly("{2}{G}: This creature must be blocked this turn if able.", "Loathsome Catoblepas")).toBe(false);
    // filtered must-be-blocked (Equipment grant scope)
    expect(isKeywordOnly("Equipped creature gets +3/+1 and must be blocked by an Eldrazi if able.", "Slayer's Cleaver")).toBe(false);
    // "can't attack or block unless" — gates blocking too, NOT this shape
    expect(isKeywordOnly("This creature can't attack or block unless you control another Giant.", "Blind-Spot Giant")).toBe(false);
    expect(attackControllerRequirementOf(card("Blind-Spot Giant", "This creature can't attack or block unless you control another Giant."))).toBe(null);
    // action-cost / non-board unlesses fail the vetted predicate grammar
    expect(attackControllerRequirementOf(card("Exalted Dragon", "This creature can't attack unless you sacrifice a land."))).toBe(null);
    expect(attackControllerRequirementOf(card("Goblin Cohort", "This creature can't attack unless you've cast a creature spell this turn."))).toBe(null);
    // unvetted defender predicate
    expect(attackDefenderRequirementOf(card("Weird", "This creature can't attack unless defending player controls a legendary creature."))).toBe(null);
    // the also-attacks trigger form is NOT the unless requirement
    expect(mustAttackUnlessOf(card("Ekundu Cyclops", "If a creature you control attacks, this creature also attacks if able."))).toBe(null);
  });
});

// ─── MULTI-BLOCK — legalChoices offer + CR 510.1d division ───

// A declare-blockers board: `attackers` (user's) vs `blockers` (ai's), with declared blocks.
function blockBoard({ attackers, blockers, declared = [] }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g,
    activePlayer: "user", priorityHolder: "ai", phase: "combat", step: "declare-blockers",
    combat: {
      attackers: attackers.map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })),
      blockers: declared.map(([blockerId, attackerId]) => ({ blockerId, attackerId, blockingPlayer: "ai" })),
    },
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: attackers },
      ai: { ...g.players.ai, battlefield: blockers },
    },
  };
}
const offeredBlocks = (s, attackerIds) =>
  legalActionsForPlayer(s, "ai", { declaredAttackers: attackerIds })
    .filter((a) => a.kind === "declare-blocker")
    .map((a) => `${a.permanentId}::${a.attackerId}`);

describe("MULTI-BLOCK — the declare-blockers offer (CR 509.1a)", () => {
  const A1 = perm("a1", card("Bear One", ""), "user");
  const A2 = perm("a2", card("Bear Two", ""), "user");

  it("a Sagittars-class blocker already blocking one attacker is re-offered against the OTHER only", () => {
    const sag = perm("sag", card("Selesnya Sagittars", "Reach\nThis creature can block an additional creature each combat.", { power: "0", toughness: "5" }), "ai");
    const s = blockBoard({ attackers: [A1, A2], blockers: [sag], declared: [["sag", "a1"]] });
    const offers = offeredBlocks(s, ["a1", "a2"]);
    expect(offers).toContain("sag::a2");      // the additional block
    expect(offers).not.toContain("sag::a1");  // never the SAME attacker twice
  });
  it("at its cap (2 blocks declared) it is not offered a third", () => {
    const sag = perm("sag", card("Selesnya Sagittars", "Reach\nThis creature can block an additional creature each combat.", { power: "0", toughness: "5" }), "ai");
    const a3 = perm("a3", card("Bear Three", ""), "user");
    const s = blockBoard({ attackers: [A1, A2, a3], blockers: [sag], declared: [["sag", "a1"], ["sag", "a2"]] });
    expect(offeredBlocks(s, ["a1", "a2", "a3"])).toHaveLength(0);
  });
  it("a NORMAL blocker already blocking is offered nothing (the CR 509.1a default, byte-identical)", () => {
    const bear = perm("blk", card("Grizzly", ""), "ai");
    const s = blockBoard({ attackers: [A1, A2], blockers: [bear], declared: [["blk", "a1"]] });
    expect(offeredBlocks(s, ["a1", "a2"])).toHaveLength(0);
  });
  it("a Palace-Guard-class blocker keeps getting offers past two", () => {
    const guard = perm("pg", card("Palace Guard", "This creature can block any number of creatures.", { power: "1", toughness: "4" }), "ai");
    const a3 = perm("a3", card("Bear Three", ""), "user");
    const s = blockBoard({ attackers: [A1, A2, a3], blockers: [guard], declared: [["pg", "a1"], ["pg", "a2"]] });
    expect(offeredBlocks(s, ["a1", "a2", "a3"])).toEqual(["pg::a3"]);
  });
});

describe("MULTI-BLOCK — CR 510.1d damage division at resolution", () => {
  it("a 3-power blocker on two 2-toughness attackers divides 2/1 — never 3 to each", () => {
    const a1 = perm("a1", card("Bear One", "", { power: "2", toughness: "2" }), "user");
    const a2 = perm("a2", card("Bear Two", "", { power: "2", toughness: "2" }), "user");
    const blk = perm("pg", card("Palace Guard", "This creature can block any number of creatures.", { power: "3", toughness: "9" }), "ai");
    const s = blockBoard({ attackers: [a1, a2], blockers: [blk], declared: [["pg", "a1"], ["pg", "a2"]] });
    const after = resolveCombatDamage(s, { firstStrikeStep: false });
    // Declaration order: a1 gets lethal 2 (dies); a2 gets the remaining 1 (survives, marked 1).
    expect(after.players.user.battlefield.find((p) => p.id === "a1")).toBeUndefined();
    const a2After = after.players.user.battlefield.find((p) => p.id === "a2");
    expect(a2After).toBeDefined();
    expect(a2After.damageMarked || 0).toBe(1);
    // Both attackers dealt to the blocker (2 + 2 = 4 marked; toughness 9 → survives).
    const pgAfter = after.players.ai.battlefield.find((p) => p.id === "pg");
    expect(pgAfter).toBeDefined();
    expect(pgAfter.damageMarked || 0).toBe(4);
    // The defending player took NO combat damage (both attackers blocked).
    expect(after.players.ai.life).toBe(s.players.ai.life);
  });
  it("remainder lands on the LAST blocked attacker once every earlier one has lethal", () => {
    const a1 = perm("a1", card("Small", "", { power: "1", toughness: "1" }), "user");
    const a2 = perm("a2", card("Big", "", { power: "1", toughness: "6" }), "user");
    const blk = perm("pg", card("Palace Guard", "This creature can block any number of creatures.", { power: "5", toughness: "9" }), "ai");
    const s = blockBoard({ attackers: [a1, a2], blockers: [blk], declared: [["pg", "a1"], ["pg", "a2"]] });
    const after = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(after.players.user.battlefield.find((p) => p.id === "a1")).toBeUndefined(); // lethal 1
    const a2After = after.players.user.battlefield.find((p) => p.id === "a2");
    expect(a2After.damageMarked || 0).toBe(4); // 5 − 1 = the whole remainder
  });
  it("single-block stays byte-identical (full power to the lone attacker)", () => {
    const a1 = perm("a1", card("Bear One", "", { power: "2", toughness: "4" }), "user");
    const blk = perm("blk", card("Grizzly", "", { power: "3", toughness: "3" }), "ai");
    const s = blockBoard({ attackers: [a1], blockers: [blk], declared: [["blk", "a1"]] });
    const after = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(after.players.user.battlefield.find((p) => p.id === "a1").damageMarked).toBe(3);
  });
});

// ─── MUST-BE-BLOCKED — the AI block-plan seeding (CR 509.1c) ───

const blk = (blockerId, attackerId) => ({ kind: "declare-blocker", permanentId: blockerId, attackerId, name: blockerId });

describe("MUST-BE-BLOCKED — pickBlockPlan seeds a minimum legal block (CR 509.1c)", () => {
  const DECOY = "This creature must be blocked if able.";
  it("forces exactly ONE (smallest) blocker when the value plan declines — not every able one (the lure distinction)", () => {
    // A 0/9 must-be-blocked wall: no kill, no trade — the value heuristic declines both blockers, so
    // the requirement seeds exactly the smallest one.
    const s = blockBoard({
      attackers: [perm("decoy", card("Riveteers Decoy", DECOY, { power: "0", toughness: "9" }), "user")],
      blockers: [perm("b1", card("B1", "", { power: "1", toughness: "1" }), "ai"), perm("b2", card("B2", "", { power: "3", toughness: "3" }), "ai")],
    });
    const plan = pickBlockPlan(s, "ai", [blk("b1", "decoy"), blk("b2", "decoy")]);
    expect(plan.filter((a) => a.attackerId === "decoy")).toHaveLength(1);
    expect(plan[0].permanentId).toBe("b1"); // deterministic: power asc then id
  });
  it("a VALUE block already satisfies the requirement — no extra forced blocker", () => {
    // b2 (3/3) kills the 0/3 decoy and survives → the value stage blocks it; the seeding no-ops.
    const s = blockBoard({
      attackers: [perm("decoy", card("Riveteers Decoy", DECOY, { power: "0", toughness: "3" }), "user")],
      blockers: [perm("b1", card("B1", "", { power: "1", toughness: "1" }), "ai"), perm("b2", card("B2", "", { power: "3", toughness: "3" }), "ai")],
    });
    const plan = pickBlockPlan(s, "ai", [blk("b1", "decoy"), blk("b2", "decoy")]);
    expect(plan.map((a) => `${a.permanentId}::${a.attackerId}`)).toEqual(["b2::decoy"]);
  });
  it("an unprofitable block is still forced (the requirement overrides the value heuristic)", () => {
    // A 5/5 must-be-blocked attacker vs a lone 1/1: pure chump, the value heuristic would decline.
    const s = blockBoard({
      attackers: [perm("decoy", card("Goblin Fire Fiend", "Haste\n" + DECOY, { power: "5", toughness: "5" }), "user")],
      blockers: [perm("b1", card("B1", "", { power: "1", toughness: "1" }), "ai")],
    });
    const plan = pickBlockPlan(s, "ai", [blk("b1", "decoy")]);
    expect(plan.map((a) => `${a.permanentId}::${a.attackerId}`)).toEqual(["b1::decoy"]);
  });
  it("no offered candidates (unable) → nothing forced; already blocked in an earlier tick → not re-forced", () => {
    const decoy = perm("decoy", card("Riveteers Decoy", DECOY, { power: "0", toughness: "3" }), "user");
    // Unable: no offered actions against it at all.
    const s1 = blockBoard({ attackers: [decoy], blockers: [perm("b1", card("B1", ""), "ai")] });
    expect(pickBlockPlan(s1, "ai", [])).toHaveLength(0);
    // Already blocked (state.combat.blockers from an earlier declaration tick): the requirement is met.
    const s2 = blockBoard({
      attackers: [decoy],
      blockers: [perm("b1", card("B1", ""), "ai"), perm("b2", card("B2", ""), "ai")],
      declared: [["b1", "decoy"]],
    });
    const plan = pickBlockPlan(s2, "ai", [blk("b2", "decoy")]);
    expect(plan.filter((a) => a.attackerId === "decoy")).toHaveLength(0);
  });
});

describe("LURE with-flying filter — Talruum Piper narrows the forced set (CR 509.1c)", () => {
  it("only FLYING blockers are forced; grounded ones stay free for the value plan", () => {
    const s = blockBoard({
      attackers: [perm("piper", card("Talruum Piper", "All creatures with flying able to block this creature do so.", { power: "3", toughness: "2" }), "user")],
      blockers: [
        perm("flyer", card("Flyer", "Flying", { power: "1", toughness: "1" }), "ai"),
        perm("ground", card("Ground", "", { power: "1", toughness: "1" }), "ai"),
      ],
    });
    const plan = pickBlockPlan(s, "ai", [blk("flyer", "piper"), blk("ground", "piper")]);
    expect(plan.filter((a) => a.attackerId === "piper").map((a) => a.permanentId)).toEqual(["flyer"]);
  });
});

// ─── CANT-ATTACK-UNLESS — attack declaration gates (CR 508.1c) ───

// A declare-attackers board for the ai seat vs the user seat.
function attackBoard({ aiBf, userBf = [], stateOver = {} }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g,
    activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers",
    players: {
      ...g.players,
      ai: { ...g.players.ai, battlefield: aiBf },
      user: { ...g.players.user, battlefield: userBf },
    },
    ...stateOver,
  };
}
const offeredAttacks = (s) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);

describe("CANT-ATTACK-UNLESS-YOU — the attacker filter (CR 508.1c)", () => {
  const CASTAWAYS = card("Desperate Castaways", "This creature can't attack unless you control an artifact.");
  it("not offered without the artifact; offered the moment one is controlled", () => {
    const alone = attackBoard({ aiBf: [perm("dc", CASTAWAYS, "ai")] });
    expect(offeredAttacks(alone)).not.toContain("dc");
    const withArt = attackBoard({ aiBf: [perm("dc", CASTAWAYS, "ai"), perm("art", { id: "c-art", name: "Sol Ring", type: "Artifact", oracle: "" }, "ai")] });
    expect(offeredAttacks(withArt)).toContain("dc");
  });
  it("'another artifact' excludes the carrier itself (Steelclad Serpent never self-satisfies)", () => {
    const SERPENT = card("Steelclad Serpent", "This creature can't attack unless you control another artifact.", { type: "Artifact Creature — Serpent", power: "4", toughness: "5" });
    const alone = attackBoard({ aiBf: [perm("ss", SERPENT, "ai")] });
    expect(offeredAttacks(alone)).not.toContain("ss");
    const withOther = attackBoard({ aiBf: [perm("ss", SERPENT, "ai"), perm("art", { id: "c-art", name: "Sol Ring", type: "Artifact", oracle: "" }, "ai")] });
    expect(offeredAttacks(withOther)).toContain("ss");
  });
  it("subtype and power predicates read the live board (War Falcon / Warden of the Chained)", () => {
    const FALCON = card("War Falcon", "Flying\nThis creature can't attack unless you control a Knight or a Soldier.", { type: "Creature — Bird", power: "2", toughness: "1" });
    const noKnight = attackBoard({ aiBf: [perm("wf", FALCON, "ai")] });
    expect(offeredAttacks(noKnight)).not.toContain("wf");
    const withKnight = attackBoard({ aiBf: [perm("wf", FALCON, "ai"), perm("kn", card("Squire", "", { type: "Creature — Human Knight" }), "ai")] });
    expect(offeredAttacks(withKnight)).toContain("wf");

    const WARDEN = card("Warden of the Chained", "Trample\nThis creature can't attack unless you control another creature with power 4 or greater.", { power: "5", toughness: "5" });
    const noBig = attackBoard({ aiBf: [perm("wd", WARDEN, "ai"), perm("sm", card("Small", "", { power: "3", toughness: "3" }), "ai")] });
    expect(offeredAttacks(noBig)).not.toContain("wd"); // its OWN 5 power never self-satisfies "another"
    const withBig = attackBoard({ aiBf: [perm("wd", WARDEN, "ai"), perm("big", card("Big", "", { power: "4", toughness: "4" }), "ai")] });
    expect(offeredAttacks(withBig)).toContain("wd");
  });
  it("FN guard: an UNVETTED unless (Blind-Spot Giant's attack-or-block form) is NOT gated — status quo", () => {
    const s = attackBoard({ aiBf: [perm("bg", card("Blind-Spot Giant", "This creature can't attack or block unless you control another Giant.", { power: "4", toughness: "3" }), "ai")] });
    expect(offeredAttacks(s)).toContain("bg"); // unenforced (body-only card — Arbiter's case), never half-gated
  });
});

describe("CANT-ATTACK-UNLESS-DEFENDER — per-defender predicates (CR 508.1c)", () => {
  it("Whimwader pairs only with a defender controlling a blue permanent", () => {
    const WHIM = card("Whimwader", "This creature can't attack unless defending player controls a blue permanent.", { power: "4", toughness: "4" });
    const dry = attackBoard({ aiBf: [perm("ww", WHIM, "ai")], userBf: [perm("rock", { id: "c-r", name: "Rock", type: "Artifact", oracle: "", colors: [] }, "user")] });
    expect(offeredAttacks(dry)).not.toContain("ww");
    const wet = attackBoard({ aiBf: [perm("ww", WHIM, "ai")], userBf: [perm("mm", card("Merfolk", "", { colors: ["U"] }), "user")] });
    expect(offeredAttacks(wet)).toContain("ww");
  });
  it("Chained Throatseeker needs the defender poisoned; Crown-Hunter Hireling needs the monarch", () => {
    const SEEKER = card("Chained Throatseeker", "Infect\nThis creature can't attack unless defending player is poisoned.", { power: "5", toughness: "5" });
    const clean = attackBoard({ aiBf: [perm("ct", SEEKER, "ai")] });
    expect(offeredAttacks(clean)).not.toContain("ct");
    const poisoned = attackBoard({ aiBf: [perm("ct", SEEKER, "ai")] });
    poisoned.players.user.poison = 1;
    expect(offeredAttacks(poisoned)).toContain("ct");

    const HIRELING = card("Crown-Hunter Hireling", "This creature can't attack unless defending player is the monarch.", { power: "4", toughness: "4" });
    const noCrown = attackBoard({ aiBf: [perm("ch", HIRELING, "ai")] });
    expect(offeredAttacks(noCrown)).not.toContain("ch");
    const crowned = attackBoard({ aiBf: [perm("ch", HIRELING, "ai")], stateOver: { monarchId: "user" } });
    expect(offeredAttacks(crowned)).toContain("ch");
  });
});

// ─── MUST-ATTACK-UNLESS — the conditional requirement (CR 508.1d) ───

describe("MUST-ATTACK-UNLESS — forced only while the predicate fails (CR 508.1d)", () => {
  // The mustAttack.test.js harness: an unprofitable 1/1 vs a 3/3 untapped blocker — the racer holds it
  // back unless the requirement is live.
  function board(extraAiPerm = null) {
    const atk = perm("atk", card("Reckless Cohort", "This creature attacks each combat if able unless you control another Ally.", { type: "Creature — Human Warrior Ally", power: "1", toughness: "1" }), "ai");
    const ogre = perm("blk", card("Ogre", "", { power: "3", toughness: "3" }), "user");
    const aiBf = extraAiPerm ? [atk, extraAiPerm] : [atk];
    return attackBoard({ aiBf, userBf: [ogre] });
  }
  const planFor = (s) => pickAttackPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker"));

  it("no other Ally → the requirement is LIVE → force-declared even though unprofitable", () => {
    expect(planFor(board()).some((a) => a.permanentId === "atk")).toBe(true);
  });
  it("another Ally on the board → the requirement is OFF → the racer holds it back", () => {
    const ally = perm("ally", card("Kazandu Blademaster", "", { type: "Creature — Human Soldier Ally", power: "1", toughness: "1" }), "ai");
    expect(planFor(board(ally)).some((a) => a.permanentId === "atk")).toBe(false);
  });
  it("a NON-Ally teammate does not satisfy the unless (still forced)", () => {
    const bear = perm("bear", card("Grizzly", "", { power: "2", toughness: "2" }), "ai");
    expect(planFor(board(bear)).some((a) => a.permanentId === "atk")).toBe(true);
  });
});
