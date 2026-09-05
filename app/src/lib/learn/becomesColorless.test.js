/**
 * BECOMES COLORLESS — "{2}: This creature becomes colorless until end of turn." (Raging Spirit · Ancient Kavu · Blazing Blade
 * Askari). Residue census 2026-09-05 (RG-6): a 3-sole-blocker family, one sentence.
 *
 * CR 105.2c — colourless is the EMPTY colour set, so the existing become-color atom (a layer-5 setColor write, end of turn)
 * expresses it with colors:[]; only the self and targeted "colorless" spellings had no arm.
 *
 * Mutation-checked: see the run ledger (docs-rg6).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentColors } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPIRIT = { id: "c-rs", name: "Raging Spirit", type: "Creature — Spirit", mana: "{3}{R}", power: 3, toughness: 3, keywords: [], oracle: "{2}: This creature becomes colorless until end of turn." };
const KAVU = { id: "c-ak", name: "Ancient Kavu", type: "Creature — Kavu", mana: "{3}{R}", power: 3, toughness: 3, keywords: [], oracle: "{2}: This creature becomes colorless until end of turn." };
const mountain = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Mountain", type: "Basic Land — Mountain", mana: "", keywords: [], oracle: "" }, controller: "user" });

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "kavu", card: KAVU, controller: "user", summoningSick: false }), mountain("m1"), mountain("m2")], hand: [], library: [] } } };
}

describe("the classifier", () => {
  it("both carriers read native", () => {
    const row = { spirit: classifyCard(SPIRIT), kavu: classifyCard(KAVU) };
    console.log("  WITNESS becomesColorless", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the activation", () => {
  it("a red Kavu activates for {2} and reads colourless until end of turn", () => {
    const s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "kavu");
    expect(act, "the activation is offered").toBeTruthy();
    let after = dispatchAction(s, act);
    let guard = 0;
    while ((after.stack || []).length && guard++ < 5) after = resolveTopOfStack(after);
    const row = { before: permanentColors(s, "kavu"), after: permanentColors(after, "kavu") };
    console.log("  WITNESS becomesColorlessRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ before: ["R"], after: [] });
  });
});
