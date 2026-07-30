/**
 * stepWindowActivationRefused.test.js — why "Activate only during your upkeep." is REFUSED, and what would
 * have to change first. A pinned refusal, not a gap.
 *
 * 22 corpus cards carry a step/window activation rider (CR 602.5a), and ~13 of them are otherwise complete:
 * Augur il-Vec · Augur of Skulls · Aven Augur · Black Carriage · Colossus of Sardia · Dwarven Weaponsmith ·
 * Emberwilde Augur · Gate to Phyrexia · Hell's Caretaker · Life Chisel · Llanowar Augur · Svyelunite Priest ·
 * Trade Caravan. Parsing the rider into an enforced `stepGate` and checking it at the offer gate was BUILT and
 * measured on 2026-07-30: flip-diff GAINED 13, LOST 0. **It was reverted anyway, and the reason is the point.**
 *
 * ⛔ THE OFFER LANE IS MAIN-STEP-ONLY, SO THE WINDOWS ARE DISJOINT. `legalChoices.actionsActivateAbility`
 * opens with `if (state.step !== "main") return []`. An ability gated to the upkeep step can therefore NEVER
 * be offered — so crediting the card as native would be a METRIC-ONLY gain: the classifier says the card
 * plays, and the runtime can never activate it. That is the same divergence the classifier⇄runtime parity
 * slices were about, and the same call precombatOnlyActivation.test.js already made when it refused the
 * opponent's-turn form: "the engine's window and the card's are DISJOINT — it could never legally be offered
 * at all, so it stays parked rather than being credited into a window the card forbids."
 *
 * ⭐ HOW IT WAS CAUGHT: A FAILED POSITIVE CONTROL. The runtime test asserted the ability IS offered during the
 * controller's own upkeep, and it returned zero. Without that positive case the parse-side tests would all
 * have passed and the slice would have shipped 13 cards that cannot be played.
 *
 * ✅ AND THE TURN MODEL IS NOT THE BLOCKER — worth recording, because it makes this a scoped build rather than
 * an impossibility. `gameEngine.NO_PRIORITY_STEPS` is exactly `{untap, cleanup}`, so a player genuinely holds
 * priority during their upkeep. The main-step return is an ENUMERATION SHORTCUT, not a rules requirement.
 *
 * ⛔ WHAT MUST LAND FIRST (the reason this is not a one-line widening): several ability shapes in that lane are
 * sorcery-speed BY RULE and carry no flag of their own — they free-ride on the blanket main-step return.
 * EQUIP is the clearest (CR 702.6b): `isEquipAbility` has no timing gate anywhere in the function. Removing or
 * loosening the early return without first giving equip — and every other by-rule sorcery-speed shape in the
 * lane — an explicit gate would make the engine MORE PERMISSIVE THAN THE RULES, which is the forbidden
 * direction. So the order is: explicit timing gates for the free-riders, THEN widen the lane, THEN this rider.
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

const UPKEEP = "{1}: Draw a card. Activate only during your upkeep.";

describe("⛔ the rider is NOT credited — the card parks", () => {
  it("the ability stays unmodeled and the rider stays in the effect clause", () => {
    const [ab] = parseActivatedAbilities({ name: "X", type: "Creature", oracle: UPKEEP });
    expect(ab.modeled).toBe(false);
    expect(ab.effectClause).toContain("Activate only during your upkeep");
  });

  it("the carrier is not native (a SAFE false negative, never a metric-only gain)", () => {
    expect(classifyCard({
      name: "Dwarven Weaponsmith", type: "Creature — Dwarf", mana: "{1}{R}", power: 1, toughness: 2,
      oracle: "{T}, Sacrifice an artifact: Target creature gets +1/+1 until end of turn. Activate only during your upkeep.",
    })).not.toMatch(/^native/);
  });
});

describe("⛔⭐ THE MEASUREMENT THAT FORCED THE REFUSAL — the offer lane cannot reach the upkeep", () => {
  function board(step) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card: { name: "Upkeep Drawer", type: "Creature — Human", mana: "{2}{W}", power: 1, toughness: 3, oracle: UPKEEP }, controller: "user", summoningSick: false })];
    for (let i = 0; i < 4; i++) {
      bf.push(createPermanent({ id: `l${i}`, card: { name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user", summoningSick: false }));
    }
    return {
      ...s, phase: step === "main" ? "precombat-main" : "beginning", step, activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const offers = (step) => legalActionsForPlayer(board(step), "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability").length;

  it("ZERO activated-ability offers during the controller's own upkeep — for ANY ability, gated or not", () => {
    // This is the whole blocker, and it is a property of the lane rather than of this rider: the lane
    // returns [] before it ever looks at an ability. Until that changes, an upkeep-gated ability is
    // unreachable and must not be credited.
    expect(offers("upkeep")).toBe(0);
  });

  it("⭐ the same permanent DOES get offers in the main step — so the harness is sound and the lane works", () => {
    // RULE 1b: prove the positive before trusting the negative. Without the rider the ability is offered
    // normally, which is what makes the zero above a real finding rather than a broken fixture.
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card: { name: "Plain Drawer", type: "Creature — Human", mana: "{2}{W}", power: 1, toughness: 3, oracle: "{1}: Draw a card." }, controller: "user", summoningSick: false })];
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } } };
    expect(legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability").length).toBeGreaterThan(0);
  });
});

describe("⛔ the prerequisite that must land first", () => {
  it("EQUIP has no timing gate of its own — it depends on the lane's main-step return", () => {
    // CR 702.6b makes equip sorcery-speed. Nothing in actionsActivateAbility enforces that for
    // `isEquipAbility`; the blanket main-step return does it implicitly. So loosening that return without
    // first giving equip an explicit gate would let the engine equip during an upkeep — more permissive than
    // the rules. This test documents the dependency; it does not assert the (absent) gate.
    const [ab] = parseActivatedAbilities({ name: "Sword", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nEquip {2}" });
    expect(ab?.isEquipAbility).toBe(true);
    expect(ab?.sorceryOnly ?? false).toBe(false);   // ⚠️ no flag — the free-ride this refusal is waiting on
  });
});
