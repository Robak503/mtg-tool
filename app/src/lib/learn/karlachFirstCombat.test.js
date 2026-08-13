/**
 * karlachFirstCombat.test.js — KARLACH, FURY OF AVERNUS (+5 with her kin: Headlong Rush, Akki
 * Coalflinger, Chieftain en-Dal, Fangren Pathcutter print the attacking-batch grant standalone).
 * "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures.
 * They gain first strike until end of turn. After this phase, there is an additional combat phase."
 *
 * ⭐ THE PIECES (Increment 3b): the youAttack event + the untap-attacking scope + the extra-combat atom
 * ALREADY WORKED. Built here: the FIRST-COMBAT intervening-if (reads the turn-stamped combat tally
 * enterCombatPostProcess maintains), the THEY-fold ("They gain …" after the exact untap sentence →
 * the attacking-batch subject), the attackingCreatures grant scope (the LIVE attacker set, any
 * controller), and the residue strip for the two follow-up sentences.
 *
 * ⛔⛔ THE ENTER-COMBAT FIX RIDES THIS SLICE: the two extra-phase jumps in advanceStep used to RETURN
 * EARLY and skip the beginning-of-combat entry chain — an EXTRA combat never fired its combatBegin
 * triggers (Halana's own trigger was silent in exactly the combats Karlach creates) and never bumped
 * the tally. enterCombatPostProcess is now the ONE entry chain for all three sites, which is also what
 * makes Karlach's gate close in her own extra combat (count 2 ≠ 1 — the non-recursion guarantee).
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the first-combat interveningIf arm removed -> Karlach parks (the condition is undecidable).
 *   · the they-fold removed -> Karlach parks (the rider sentence never reaches the attacking arm).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { advanceStep } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KARLACH = { id: "c-ka", name: "Karlach, Fury of Avernus", type: "Legendary Creature — Tiefling Barbarian", mana: "{2}{R}{R}", power: "5", toughness: "4",
  oracle: "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures. They gain first strike until end of turn. After this phase, there is an additional combat phase.\nChoose a Background (You can have a Background as a second commander.)" };

describe("the carriers", () => {
  it("⭐ Karlach and her printed-subject kin flip native", () => {
    expect(classifyCard(KARLACH)).toMatch(/^native/);
    expect(classifyCard({ id: "c-hr", name: "Headlong Rush", type: "Instant", mana: "{2}{R}",
      oracle: "Attacking creatures gain first strike until end of turn." })).toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the first-combat gate reads the REAL tally, and extra combats count", () => {
  it("⭐⭐ tally 1 → the gate is OPEN; tally 2 → SHUT (her own extra combat can't re-trigger); absent → shut, no crash", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const at = (count) => ({ ...s, turn: 3, combatsThisTurn: count == null ? undefined : { turn: 3, count } });
    const row = {
      first: evaluateInterveningIf(at(1), "it's the first combat phase of the turn", "user", {}),
      second: evaluateInterveningIf(at(2), "it's the first combat phase of the turn", "user", {}),
      absent: evaluateInterveningIf(at(null), "it's the first combat phase of the turn", "user", {}),
      staleTurn: evaluateInterveningIf({ ...s, turn: 4, combatsThisTurn: { turn: 3, count: 1 } }, "it's the first combat phase of the turn", "user", {}),
    };
    console.log("  WITNESS firstCombatGate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ first: true, second: false, absent: false, staleTurn: false });
  });

  it("⛔⛔ THE ENTER-COMBAT FIX: an extra-phase jump bumps the tally AND runs the entry chain", () => {
    // Before the fix the jumps returned early: no combatBegin triggers, no tally — an extra combat was
    // invisible to everything that watches combats begin.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const eoc = { ...s0, activePlayer: "user", phase: "combat", step: "end-of-combat", priorityHolder: null, consecutivePasses: 0,
      turn: 3, combatsThisTurn: { turn: 3, count: 1 }, extraPhases: [{ kind: "combat" }] };
    const after = advanceStep(eoc);
    const row = { step: after.step, tally: after.combatsThisTurn };
    console.log("  WITNESS extraCombatCounts", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "beginning-of-combat", tally: { turn: 3, count: 2 } });
  });

  it("⭐ the attacking-batch grant lands on the LIVE attacker set — the home creature gets nothing", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id) => createPermanent({ id, controller: "user", summoningSick: false,
      card: { id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    const s = { ...s0, combat: { attackers: [{ permanentId: "ATK", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [mk("ATK"), mk("HOME")] } } };
    const after = ATOM_RESOLVERS["grant-keywords-group"](s, { op: "grant-keywords-group", scope: "attackingCreatures", grantKeywords: ["first strike"] }, { controller: "user", targets: [] });
    const granted = (after.continuousEffects || []).find((e) => e.op?.layerOp === "addKeyword" || e.op?.grantKeywords || e.op?.keyword);
    const log = (after.eventLog || after.log || []).at?.(-1);
    console.log("  WITNESS attackingBatchGrant", JSON.stringify({ effectStored: !!granted, lastLog: log?.effect || log?.kind || null, targets: log?.targets || null })); // vitest 4 needs --disable-console-intercept
    const logRow = [...(after.eventLog || []), ...(after.log || [])].filter((e) => e.effect === "grant-keywords-group").at(-1);
    expect(logRow?.targets).toEqual(["ATK"]); // the batch is exactly the live attacker — never HOME
  });
});
