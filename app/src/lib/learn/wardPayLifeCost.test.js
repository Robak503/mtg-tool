/**
 * wardPayLifeCost.test.js — recognize the em-dash "Ward—Pay N life" keyword (CR 702.21).
 *
 * The generic COVERED_KEYWORDS "ward" match only fires on "Ward {cost}" / "Ward N" (a SPACE after "ward"), so
 * the em-dash "Ward—<cost>" forms read body-only. This credits ONLY "Ward—Pay N life", whose soft-counter tax
 * is FULLY enforced today: an opponent targeting the warded permanent gets a pay-or-be-countered pause reading
 * the structured life cost (ward.js parseWardCost → {kind:"life"}; wardTaxForStackObject at the cast + ability
 * chokepoints; runProgram.settleSoftCounterCost → loseLife). So recognizing it is honest, not an over-claim.
 *
 * CREED guard: "Ward—Discard" / "Ward—Sacrifice" are NOT enforced (parseWardCost returns null — the binary
 * soft-counter pause can't hold a "which card/permanent?" victim sub-choice, ward.js) and MUST stay body-only,
 * a safe false-negative. Flip-diff (this slice): GAINED = {Dwarven Forge-Chanter, Owlin Shieldmage, Sire of
 * Seven Deaths}, LOST = 0 (the other ~20 Ward—Pay-life cards keep unmodeled sibling text and stay body-only).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

// Real oracle (Scryfall bundle), reminders included — classifyCard strips them.
const DWARVEN_FORGE_CHANTER = { name: "Dwarven Forge-Chanter", type: "Creature — Dwarf Wizard", mana: "{2}{R}", power: 2, toughness: 2, oracle: "Ward—Pay 2 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 2 life.)\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)" };
const OWLIN_SHIELDMAGE = { name: "Owlin Shieldmage", type: "Creature — Bird Warlock", mana: "{3}{W}", power: 2, toughness: 4, oracle: "Flying\nWard—Pay 3 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 3 life.)" };
const SIRE_OF_SEVEN_DEATHS = { name: "Sire of Seven Deaths", type: "Creature — Eldrazi", mana: "{7}", power: 7, toughness: 7, oracle: "First strike, vigilance\nMenace, trample\nReach, lifelink\nWard—Pay 7 life." };
const WESTGATE_REGENT = { name: "Westgate Regent", type: "Creature — Vampire", mana: "{4}{B}", power: 4, toughness: 4, oracle: "Flying\nWard—Discard a card.\nWhenever this creature deals combat damage to a player, put that many +1/+1 counters on it." };

describe("Ward—Pay N life — classification", () => {
  it("credits a Ward—Pay-life card whose remaining text is all covered keywords", () => {
    expect(classifyCard(DWARVEN_FORGE_CHANTER)).toMatch(/^native/); // + Prowess
    expect(classifyCard(OWLIN_SHIELDMAGE)).toMatch(/^native/);      // + Flying
    expect(classifyCard(SIRE_OF_SEVEN_DEATHS)).toMatch(/^native/);  // + a pile of covered keywords
  });
  it("isKeywordOnly recognizes 'ward—pay N life' but not the unenforced cost forms", () => {
    expect(isKeywordOnly("Flying\nWard—Pay 3 life")).toBe(true);
    expect(isKeywordOnly("Ward—Pay 2 life")).toBe(true);
    expect(isKeywordOnly("Ward {2}")).toBe(true);                  // mana ward unchanged
    expect(isKeywordOnly("Ward—Discard a card")).toBe(false);      // unenforced → not keyword-only
    expect(isKeywordOnly("Ward—Sacrifice a creature")).toBe(false);
  });
  it("CREED: Ward—Discard / Ward—Sacrifice cards stay body-only (unenforced victim-choice cost)", () => {
    expect(classifyCard(WESTGATE_REGENT)).not.toMatch(/^native/);
    // a hypothetical all-keyword body whose only 'extra' is Ward—Sacrifice must NOT be credited
    expect(classifyCard({ name: "T", type: "Creature — X", mana: "{2}", power: 2, toughness: 2, oracle: "Flying\nWard—Sacrifice a creature." })).not.toMatch(/^native/);
  });
});

describe("Ward—Pay N life — enforcement is real (soft-counter tax is cost-aware)", () => {
  it("an opponent targeting the warded creature raises a pay-3-life soft-counter", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const warded = createPermanent({ id: "warded", card: { id: "c-w", name: "Warded One", type: "Creature — Test", power: 2, toughness: 2, oracle: "Ward—Pay 3 life" }, controller: "user", summoningSick: false });
    const murder = { id: "c-m", name: "Test Murder", type: "Instant", mana: "{1}{B}{B}", oracle: "Destroy target creature." };
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [warded] },
        ai: { ...s.players.ai, hand: [murder], manaPool: { ...s.players.ai.manaPool, B: 5, C: 5 }, life: 40 } } };
    const cast = filterActions(legalActionsForPlayer(s, "ai"), "cast-spell").find((a) => a.cardId === "c-m");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    expect(s.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", cost: { kind: "life", life: 3 }, sourceName: "Warded One" });
  });
});
