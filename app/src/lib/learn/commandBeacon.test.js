/**
 * commandBeacon.test.js — ④-X (2026-09-03 night): COMMAND BEACON — "{T}, Sacrifice this land: Put your commander into your
 * hand from the command zone." (Earth Bent; a Commander staple). The land's mana line was modeled; the activation parked
 * on the payoff. The command zone already existed as a zone (Hellkite Courser's visit atom); this atom moves the first
 * commander there into the hand, where it is cast at printed cost like any card in hand (the commander tax keys on
 * casts FROM the command zone). Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BEACON = { id: "c-beacon", name: "Command Beacon", type: "Land", mana: "", cmc: 0, keywords: [], oracle: "{T}: Add {C}.\n{T}, Sacrifice this land: Put your commander into your hand from the command zone." };
const CMDR = { id: "c-cmdr", name: "Yarok, the Desecrated", type: "Legendary Creature — Elemental Horror", mana: "{2}{B}{G}{U}", mana_cost: "{2}{B}{G}{U}", cmc: 5, power: 3, toughness: 5, keywords: ["Deathtouch", "Lifelink"], isCommander: true, oracle: "Deathtouch, lifelink" };

function board({ command = [CMDR] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [], graveyard: [], command, battlefield: [createPermanent({ id: "beacon", card: BEACON, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
}
const sacAct = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "beacon" && a.sacSelf);

describe("the parse + the tier", () => {
  it("⭐ the clause parses to the command-zone-to-hand atom; Command Beacon sits on the land tier", () => {
    expect(parseEffectClause("put your commander into your hand from the command zone", "Land").atoms).toEqual([{ op: "cz-commander-to-hand" }]);
    expect(classifyCard(BEACON)).toBe("land");
    // the rider the flip-diff surfaced: Road of Return's second mode is this clause (its entwine was already the
    // declined-cost base mode) — native-spell, audited whole-card
    expect(classifyCard({ id: "c-ror", name: "Road of Return", type: "Sorcery", mana: "{G}{G}", cmc: 2, keywords: [],
      oracle: "Choose one —\n• Return target permanent card from your graveyard to your hand.\n• Put your commander into your hand from the command zone.\nEntwine {2} (Choose both if you pay the entwine cost.)" })).toBe("native-spell");
  });
});

describe("runtime", () => {
  it("⭐ {T}, sacrifice: the commander leaves the command zone for the hand; the Beacon is in the graveyard", () => {
    const s = board();
    const act = sacAct(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.hand.map((c) => c.name)).toEqual(["Yarok, the Desecrated"]);
    expect(out.players.user.command).toEqual([]);
    expect(findPermanent(out, "beacon")).toBeFalsy();
    expect(out.players.user.graveyard.some((c) => c.name === "Command Beacon")).toBe(true);
  });
  it("with an EMPTY command zone the cost is still paid and the effect moves nothing (CR 602.2)", () => {
    const s = board({ command: [] });
    const act = sacAct(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.hand).toEqual([]);
    expect(findPermanent(out, "beacon")).toBeFalsy();
  });
});
