/**
 * evasionExceptBy.test.js — BLITZ EV-2: "This creature can't be blocked EXCEPT by <filter>" (CR 509.1b —
 * an evasion ability that restricts what can block; the INVERSE of the EVASION-QUALIFIER "…blocked by…" shape).
 *
 * The two clean-reuse filter families flip native:
 *   • flying keyword — "except by creatures with flying" (blocker MUST have flying; reach alone does NOT
 *     satisfy it, CR 702.9b) and "except by creatures with flying or reach" (the fixed idiom that maps to the
 *     exact flying-block predicate).
 *   • color — "except by <color> creatures" (blocker MUST be that color).
 * Enforced in combatEvasion.canBlockAttacker (parseAttackerExceptions), reusing the SAME permanentHasKeyword /
 * permColorSet gates the rest of the file uses — layer-aware, so a granted flying/reach or a removed color
 * flips a blocker's legality live.
 *
 * CREED — false-pos FORBIDDEN: a wrongly-(un)blockable creature is a combat-math FP, so the block-legality
 * outcome is pinned in BOTH directions. BLITZ EV-3 later flipped the compound "and/or" filter (Amrou
 * Seekers), the subtype allowlist (Deathcult Rogue), and the set-level "N or more creatures" family (Guile's
 * clause — enforced at the menace seams via attackerMinBlockers) to ENFORCED + credited — see
 * evasionMinBlockers.test.js for those pins. An unmodeled sibling clause (Manta Ray's islandhome-sac frame)
 * still parks the whole card (safe FN). Real oracle fixtures (bundled Scryfall, verified 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { canBlockAttacker, isEnforcedEvasionClause } from "./combatEvasion.js";
import { addContinuousEffect } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle fixtures (bundled Scryfall) ───────────────────────────────────────────────────────
const TREETOP_RANGERS = { id: "tr", name: "Treetop Rangers", type: "Creature — Elf Ranger", mana: "{2}{G}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by creatures with flying." };
const TREETOP_SCOUT = { id: "ts", name: "Treetop Scout", type: "Creature — Elf Scout", mana: "{G}",
  power: "1", toughness: "1", oracle: "This creature can't be blocked except by creatures with flying." };
const SILHANA = { id: "sl", name: "Silhana Ledgewalker", type: "Creature — Elf Rogue", mana: "{1}{G}",
  power: "1", toughness: "1", oracle: "Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nThis creature can't be blocked except by creatures with flying." };
const ORCHARD_SPIRIT = { id: "os", name: "Orchard Spirit", type: "Creature — Spirit", mana: "{2}{G}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by creatures with flying or reach." };
const SPIRE_TRACER = { id: "sp", name: "Spire Tracer", type: "Creature — Elf Scout", mana: "{G}",
  power: "1", toughness: "1", oracle: "This creature can't be blocked except by creatures with flying or reach." };
const SIGNAL_PEST = { id: "si", name: "Signal Pest", type: "Artifact Creature — Pest", mana: "{1}",
  power: "0", toughness: "1", oracle: "Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nThis creature can't be blocked except by creatures with flying or reach." };
const DREAD_WARLOCK = { id: "dw", name: "Dread Warlock", type: "Creature — Human Wizard Warlock", mana: "{1}{B}{B}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by black creatures." };
const PROWLING = { id: "pn", name: "Prowling Nightstalker", type: "Creature — Nightstalker", mana: "{3}{B}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by black creatures." };

// FN-guard fixtures (must STAY body-only — no faithful single-filter expression).
const AMROU_SEEKERS = { id: "am", name: "Amrou Seekers", type: "Creature — Kithkin Rebel", mana: "{2}{W}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by artifact creatures and/or white creatures." };
const ELVEN_RIDERS = { id: "er", name: "Elven Riders", type: "Creature — Elf", mana: "{3}{G}{G}",
  power: "3", toughness: "3", oracle: "This creature can't be blocked except by Walls and/or creatures with flying." };
const DEATHCULT_ROGUE = { id: "dc", name: "Deathcult Rogue", type: "Creature — Human Rogue", mana: "{1}{U/B}{U/B}",
  power: "2", toughness: "2", oracle: "This creature can't be blocked except by Rogues." };
const MANTA_RAY = { id: "mr", name: "Manta Ray", type: "Creature — Fish", mana: "{1}{U}{U}", power: "3", toughness: "3",
  oracle: "This creature can't attack unless defending player controls an Island.\nThis creature can't be blocked except by blue creatures.\nWhen you control no Islands, sacrifice this creature." };

describe("recognition + classification", () => {
  it("flying / flying-or-reach carriers flip native", () => {
    expect(classifyCard(TREETOP_RANGERS)).toBe("native-body");   // vanilla + flying-except
    expect(classifyCard(TREETOP_SCOUT)).toBe("native-body");
    expect(classifyCard(SILHANA)).toBe("native-body");           // hexproof keyword + flying-except
    expect(classifyCard(ORCHARD_SPIRIT)).toBe("native-body");    // flying-or-reach idiom
    expect(classifyCard(SPIRE_TRACER)).toBe("native-body");
    expect(classifyCard(SIGNAL_PEST)).toBe("native-body");       // battle cry keyword + flying-or-reach-except
  });
  it("color carriers flip native", () => {
    expect(classifyCard(DREAD_WARLOCK)).toBe("native-body");
    expect(classifyCard(PROWLING)).toBe("native-body");
  });
  it("isEnforcedEvasionClause credits exactly the modeled shapes", () => {
    expect(isEnforcedEvasionClause("this creature can't be blocked except by creatures with flying")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by creatures with flying or reach")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by black creatures")).toBe(true);
    expect(isEnforcedEvasionClause("it can't be blocked except by white creatures")).toBe(true);
    // BLITZ EV-3 flipped the compound / subtype-allowlist / artifact / set-level-≥N shapes to CREDITED
    // (each now enforced — see evasionMinBlockers.test.js for the full lockstep pins).
    expect(isEnforcedEvasionClause("this creature can't be blocked except by artifact creatures and/or white creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by rogues")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by three or more creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by artifact creatures")).toBe(true);
    // STILL not credited — no vetted gate exists for these filters.
    expect(isEnforcedEvasionClause("this creature can't be blocked except by legendary creatures")).toBe(false);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by creatures with defender")).toBe(false);
  });
});

describe("CREED — 'except by' whole-card law (EV-3 flipped the vetted filters; unmodeled residue still parks)", () => {
  it("compound and/or + subtype carriers now flip native (BLITZ EV-3); multi-clause residue still parks", () => {
    expect(classifyCard(AMROU_SEEKERS)).toBe("native-body");   // "artifact and/or white creatures" — OR of vetted gates
    expect(classifyCard(ELVEN_RIDERS)).toBe("native-body");    // "Walls and/or creatures with flying"
    expect(classifyCard(DEATHCULT_ROGUE)).toBe("native-body"); // subtype "Rogues" (layer-aware permIsSubtype gate)
    expect(classifyCard(MANTA_RAY)).toBe("body-only");         // islandhome + unmodeled sac trigger — still parked
  });
});

// ── Runtime block-legality (the combat-math pins) ─────────────────────────────────────────────────
function board(attackerCard, blockerCard) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const atk = createPermanent({ id: "atk", card: attackerCard, controller: "user" });
  const blk = createPermanent({ id: "blk", card: blockerCard, controller: "ai" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [atk] }, ai: { ...s.players.ai, battlefield: [blk] } } };
}
const blocker = (over) => ({ id: "b", name: "Blocker", type: "Creature — Beast", power: "2", toughness: "2", oracle: "", ...over });
const canBlock = (attackerCard, blockerCard) => canBlockAttacker(board(attackerCard, blockerCard), "blk", "atk", "ai");

describe("runtime — 'except by creatures with flying' (flying required; reach alone insufficient)", () => {
  it("a flyer blocks; a reach-only creature and a ground creature CANNOT", () => {
    expect(canBlock(TREETOP_RANGERS, blocker({ oracle: "Flying" }))).toBe(true);
    expect(canBlock(TREETOP_RANGERS, blocker({ oracle: "Reach" }))).toBe(false); // reach ≠ flying for this filter
    expect(canBlock(TREETOP_RANGERS, blocker({ oracle: "" }))).toBe(false);
  });
});

describe("runtime — 'except by creatures with flying or reach'", () => {
  it("flyer and reach both block; ground creature CANNOT", () => {
    expect(canBlock(ORCHARD_SPIRIT, blocker({ oracle: "Flying" }))).toBe(true);
    expect(canBlock(ORCHARD_SPIRIT, blocker({ oracle: "Reach" }))).toBe(true);
    expect(canBlock(ORCHARD_SPIRIT, blocker({ oracle: "" }))).toBe(false);
  });
});

describe("runtime — 'except by <color> creatures'", () => {
  it("a black blocker blocks; a white and a colorless one CANNOT", () => {
    expect(canBlock(DREAD_WARLOCK, blocker({ colors: ["B"] }))).toBe(true);
    expect(canBlock(DREAD_WARLOCK, blocker({ colors: ["W"] }))).toBe(false);
    expect(canBlock(DREAD_WARLOCK, blocker({ colors: [] }))).toBe(false);
  });
});

describe("runtime — layer-aware: a granted keyword flips legality live", () => {
  it("a ground creature GRANTED flying can then block a flying-except attacker", () => {
    let s = board(TREETOP_RANGERS, blocker({ oracle: "" }));
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);
    s = addContinuousEffect(s, {
      layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" },
      affects: { mode: "fixed", permanentIds: ["blk"] },
      duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", cardName: "Jump" },
    }).state;
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);
  });
});

describe("runtime — EV-3 flipped the compound/subtype filters to ENFORCED; ≥N stays pairwise-permissive", () => {
  it("a compound / subtype filter now locks out a non-matching ground creature (BLITZ EV-3)", () => {
    expect(canBlock(AMROU_SEEKERS, blocker({ oracle: "" }))).toBe(false);   // neither artifact nor white → illegal
    expect(canBlock(DEATHCULT_ROGUE, blocker({ oracle: "" }))).toBe(false); // not a Rogue → illegal
  });
  // A SET rule — enforced at the declaration gate + resolution normalize via attackerMinBlockers
  // (see evasionMinBlockers.test.js), never as a pairwise blocker gate.
  it("the set-level ≥N stays PERMISSIVE at the pairwise gate", () => {
    const guile = { id: "gu", name: "Guile", type: "Creature — Elemental", power: "6", toughness: "6",
      oracle: "This creature can't be blocked except by three or more creatures." };
    expect(canBlock(guile, blocker({ oracle: "" }))).toBe(true);
  });
});
