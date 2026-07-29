/**
 * sorcerySpeedActivation.test.js — "Activate only as a sorcery" (CR 602.5i), the EMPTY-STACK half.
 *
 * THE OVER-DELIVERY THIS CLOSES. The rider was stripped from the effect clause as an "already enforced"
 * timing restriction, and the code comment saying so was PARTLY true: the generic offer gate does hold the
 * controller's own turn and the main step, so the ability was already withheld on an opponent's turn — and
 * in combat too, though for an unrelated reason the CONTROL block below names. But CR 602.5i also requires
 * an EMPTY STACK, and nothing enforced that
 * — so the engine offered a sorcery-speed ability IN RESPONSE to a spell, which the card forbids. An
 * ignored restriction is the FORBIDDEN direction: the engine plays a card as stronger than printed.
 *
 * ⚠️ THE FLAG EXISTED AND WAS NEVER SET FOR THE GENERAL CASE. `legalChoices` already read
 * `ab.sorceryOnly && !canCastSorcerySpeed(...)` — but `sorceryOnly` was only ever stamped by Level Up and
 * one graveyard-exile rider. 125 native cards print the phrase. A gate whose flag nobody sets is the same
 * shape as the whitelist drift this run hit four times: every layer looks right in isolation.
 *
 * ⛔ AND IT ONLY EVER NARROWS. Enforcing a restriction can remove offered actions, never add them, so the
 * direction of this change is safe by construction — which is exactly why the CONTROL below (a plain
 * ability must still be offered with a busy stack) is the assertion that earns it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SORC = "{2}: Draw a card. Activate only as a sorcery.";
const PLAIN = "{2}: Draw a card.";

function table(oracle, over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const card = { id: "c1", name: "Tester", type: "Artifact", mana: "{2}", oracle };
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: [createPermanent({ id: "p1", card, controller: "user", summoningSick: false })],
        library: [{ id: "L", name: "X", type: "Land" }],
        manaPool: { ...s.players.user.manaPool, C: 5 },
      },
    },
    ...over,
  };
}
const activations = (oracle, over) => legalActionsForPlayer(table(oracle, over), "user").filter((a) => a.kind === "activate-ability").length;
const BUSY = { stack: [{ id: "s1", kind: "spell", controller: "ai" }] };

describe("the flag — parsed off the printed rider, not inferred", () => {
  it("⭐ the ability carries sorceryOnly, and its effect clause is clean", () => {
    const [ab] = parseActivatedAbilities({ name: "Tester", type: "Artifact", oracle: SORC });
    expect(ab.sorceryOnly).toBe(true);
    expect(ab.effectClause).toBe("Draw a card");   // the rider is stripped, so the payload still parses
  });

  it("CONTROL — an ability without the rider does not get the flag", () => {
    expect(parseActivatedAbilities({ name: "Tester", type: "Artifact", oracle: PLAIN })[0].sorceryOnly).toBeFalsy();
  });
});

describe("⭐ THE OFFER GATE — all four windows", () => {
  it("⭐ offered in the controller's own main with an EMPTY stack", () => {
    expect(activations(SORC)).toBe(1);
  });

  it("⛔ NOT offered with a spell on the stack — the half that was missing", () => {
    expect(activations(SORC, BUSY)).toBe(0);
  });

  it("⛔ NOT offered on an opponent's turn (this half already held)", () => {
    expect(activations(SORC, { activePlayer: "ai", phase: "combat", step: "declare-attackers" })).toBe(0);
  });

  it("⛔ NOT offered in the controller's own combat — though the CONTROL below shows why that one is weak", () => {
    expect(activations(SORC, { phase: "combat", step: "declare-attackers" })).toBe(0);
  });
});

describe("⛔ CONTROL — the change NARROWS only the cards that print the rider", () => {
  it("a plain activated ability is still offered with a busy stack", () => {
    // The load-bearing control. Enforcing sorcery speed for everything would silently delete a whole class
    // of legal instant-speed activations, and every assertion above would still pass.
    expect(activations(PLAIN, BUSY)).toBe(1);
  });

  it("⚠️ but NOT in combat — and that is a SEPARATE, pre-existing approximation", () => {
    // Measured, and it corrects the reason the "own combat" case above passes: the generic lane offers
    // activated abilities ONLY at the main step, for every ability, sorcery-restricted or not. So that case
    // was never evidence of sorcery-speed enforcement — the empty-stack case is the only one that is.
    //
    // The engine therefore UNDER-offers instant-speed activations generally (no activating a pump in
    // combat). That is a false negative, the safe direction, and out of scope here — recorded so the next
    // reader does not mistake this file's green for "activation timing is fully modelled".
    expect(activations(PLAIN, { phase: "combat", step: "declare-attackers" })).toBe(0);
  });
});
