/**
 * precombatOnlyActivation.test.js — "Activate only during your turn, before attackers are declared."
 *
 * 26 corpus carriers of that exact rider, plus 2 of the bare "only before attackers are declared" form.
 *
 * WHY THIS ONE COULD NOT BE STRIPPED, which is the whole slice. Two sibling riders ARE legitimately
 * stripped as implied by the offer gate — "only as a sorcery" and "only during your turn" — because the
 * engine's window (the controller's own MAIN step) sits inside the printed one. This rider is different:
 * the gate's `step === "main"` covers BOTH main phases, and the POSTCOMBAT main is *after* attackers are
 * declared. Stripping it would let the engine activate the ability in a window the card forbids — a false
 * positive, not a safe simplification.
 *
 * So it is FLAGGED and the window is NARROWED to the precombat main. Narrowing can only ever under-offer,
 * which is the safe direction. The load-bearing test is the postcombat one: if the ability is ever offered
 * there, the credit becomes a lie.
 *
 * DELIBERATELY REFUSED: "Activate only during an OPPONENT'S turn, before attackers are declared."
 * (Nettling Imp). The engine's window and the card's are DISJOINT — it could never legally be offered at
 * all, so it stays parked rather than being credited into a window the card forbids.
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

const RIDER = "Activate only during your turn, before attackers are declared.";
const CARD = {
  name: "Shu Farmer", type: "Creature — Human Soldier", mana: "{2}{W}", power: 1, toughness: 3, keywords: [],
  oracle: `{T}: Target creature gets +0/+2 until end of turn. ${RIDER}`,
};

const ability = (oracle) => parseActivatedAbilities({ name: "X", type: "Creature", oracle })[0];

describe("the rider is FLAGGED, not stripped", () => {
  it("sets preCombatOnly on both printed forms", () => {
    expect(ability(`{1}: Draw a card. ${RIDER}`).preCombatOnly).toBe(true);
    expect(ability("{1}: Draw a card. Activate only before attackers are declared.").preCombatOnly).toBe(true);
  });

  it("an ordinary ability is unflagged", () => {
    expect(ability("{1}: Draw a card.").preCombatOnly).toBe(false);
  });

  it("CREED — the OPPONENT'S-turn form is refused", () => {
    // Disjoint windows: the engine never offers on an opponent's turn, so crediting this would place the
    // ability in a window the card forbids rather than merely under-offering it.
    expect(ability("{1}: Draw a card. Activate only during an opponent's turn, before attackers are declared.").preCombatOnly).toBe(false);
  });

  it("the rider is removed from the effect clause so the payload parses on its own merits", () => {
    expect(ability(`{1}: Draw a card. ${RIDER}`).effectClause).toBe("Draw a card");
  });
});

describe("RUNTIME — the window is genuinely narrowed", () => {
  function board(phase) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const p = createPermanent({ id: "sf", card: CARD, controller: "user", summoningSick: false });
    const bf = [p];
    for (let i = 0; i < 4; i++) {
      bf.push(createPermanent({ id: `l${i}`, card: { name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user", summoningSick: false }));
    }
    return {
      ...s, phase, step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const offered = (phase) =>
    legalActionsForPlayer(board(phase), "user").filter((a) => a.permanentId === "sf" && a.kind === "activate-ability").length;

  it("offered in the PRECOMBAT main", () => {
    expect(offered("precombat-main")).toBeGreaterThan(0);
  });

  it("THE LOAD-BEARING ONE — NOT offered in the postcombat main, which is after attackers", () => {
    // Delete the narrowing in legalChoices and this fails. If it ever passes wrongly, the engine is
    // activating an ability in a window the printed card forbids.
    expect(offered("postcombat-main")).toBe(0);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(CARD)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...CARD, oracle: `${CARD.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
