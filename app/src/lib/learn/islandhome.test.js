/**
 * islandhome.test.js — the SEA-MONSTER attack restriction (BLITZ SM-1, CR 508.1a): "This creature
 * can't attack unless defending player controls an Island." Enforced PER-DEFENDER at attack
 * declaration: actionsDeclareAttacker filters each restricted creature's target list through
 * attackDefenderRequirementOf + defenderMeetsAttackRequirement (the LIVE pair legalChoices actually
 * calls — corrected 2026-07-29; this file previously exercised an older superseded pair that the
 * engine never invoked, so the helper assertions were green without testing the shipped path), on
 * BOTH the lone-target fast path
 * (no action at all when the lone defender fails) and the multi-target pod path (only the
 * Island-holding seats are offered). The metric credits the clause via isEnforcedEvasionClause,
 * so a keyword-only body carrying it is honestly native.
 *
 * CREED FPs guarded: the restricted creature must NEVER be offered an attack on a defender without
 * the named land; the TWO-line old frame ("When you control no Islands, sacrifice …") stays
 * body-only (its second sentence is an unmodeled state trigger).
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { attackDefenderRequirementOf, defenderMeetsAttackRequirement } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ARMORED_GALLEON = { id: "ag", name: "Armored Galleon", type: "Creature — Human Pirate", mana: "{3}{U}",
  power: "5", toughness: "4", oracle: "This creature can't attack unless defending player controls an Island." };
const SEA_SERPENT = { id: "ss", name: "Sea Serpent", type: "Creature — Serpent", mana: "{5}{U}",
  power: "5", toughness: "5", oracle: "This creature can't attack unless defending player controls an Island.\nWhen you control no Islands, sacrifice this creature." };
const RONOM_STYLE = { id: "rs", name: "Ronom Serpent", type: "Snow Creature — Serpent", mana: "{5}{U}",
  power: "5", toughness: "6", oracle: "This creature can't attack unless defending player controls a snow land.\nWhen you control no snow lands, sacrifice this creature." };

describe("the detector + the metric", () => {
  it("reads the requirement off the printed static (island / snow land); null when unrestricted", () => {
    expect(attackDefenderRequirementOf(ARMORED_GALLEON)).toEqual({ kind: "land", subtype: "island" });
    expect(attackDefenderRequirementOf(RONOM_STYLE)).toEqual({ kind: "land", subtype: "snow land" });
    expect(attackDefenderRequirementOf({ oracle: "Flying" })).toBe(null);
  });
  it("Armored Galleon (single-line) flips native; Sea Serpent's two-line sac frame ALSO flips now (2026-07-25)", () => {
    expect(classifyCard(ARMORED_GALLEON)).toBe("native-body");
    // NOTE: the "two-line sac frame" this pin named as Sea Serpent's blocker is "When you control no
    // Islands, sacrifice this creature" — a CR 603.8 STATE TRIGGER, now built (stateTrigger.test.js):
    // detected off the shared interveningIf condition reader and fired from the SBA fixpoint with an
    // arm/disarm latch. Islandhome itself is unchanged; only its companion line became modeled.
    expect(classifyCard(SEA_SERPENT)).toMatch(/^native/);
  });
});

describe("attack declaration — the per-defender gate", () => {
  const island = (id, controller) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller, summoningSick: false });
  const bear = (id, controller) => createPermanent({ id, card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller, summoningSick: false });

  function combatState({ ai1HasIsland, ai2HasIsland = false } = {}) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const galleon = createPermanent({ id: "gperm", card: ARMORED_GALLEON, controller: "user", summoningSick: false });
    const plainBear = bear("bperm", "user");
    s = {
      ...s,
      phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [galleon, plainBear] },
        ai1: { ...s.players.ai1, battlefield: ai1HasIsland ? [island("i1", "ai1")] : [] },
        ai2: { ...s.players.ai2, battlefield: ai2HasIsland ? [island("i2", "ai2")] : [] },
      },
    };
    return s;
  }

  it("pod path: the galleon is offered ONLY against Island-holding defenders; the bear sees every seat", () => {
    const s = combatState({ ai1HasIsland: true, ai2HasIsland: false });
    const attacks = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
    const galleonTargets = attacks.filter((a) => a.permanentId === "gperm").map((a) => a.defenderId).sort();
    const bearTargets = attacks.filter((a) => a.permanentId === "bperm").map((a) => a.defenderId).sort();
    expect(galleonTargets).toEqual(["ai1"]);                      // only the Island seat
    expect(bearTargets).toEqual(["ai1", "ai2", "ai3"]);           // unrestricted — every opponent
  });

  it("no qualifying defender anywhere → the galleon gets NO attack action at all", () => {
    const s = combatState({ ai1HasIsland: false, ai2HasIsland: false });
    const attacks = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
    expect(attacks.some((a) => a.permanentId === "gperm")).toBe(false);
    expect(attacks.some((a) => a.permanentId === "bperm")).toBe(true);
  });

  it("the board read: 'snow land' matches the adjacent type-line words", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const snowLand = createPermanent({ id: "sl", card: { name: "Snow-Covered Island", type: "Basic Snow Land — Island", oracle: "({T}: Add {U}.)" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [snowLand] } } };
    expect(defenderMeetsAttackRequirement(s, "ai1", { kind: "land", subtype: "snow land" })).toBe(true);
    expect(defenderMeetsAttackRequirement(s, "ai2", { kind: "land", subtype: "snow land" })).toBe(false);
    expect(defenderMeetsAttackRequirement(s, "ai1", { kind: "land", subtype: "swamp" })).toBe(false);
  });
});
