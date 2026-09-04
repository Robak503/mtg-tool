/**
 * gingerbruteToughCookie.test.js — SHELF-85 runbook V14 (2026-09-04): Gingerbrute and Tough Cookie (Bumble ×2 each) and
 * the twins the flip-diff surfaced (Resilient Roadrunner, Alloy Animist — the same two lines).
 *
 *   Gingerbrute:  "{1}: This creature can't be blocked this turn except by creatures with haste."
 *   Tough Cookie: "{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature."
 *
 * Gingerbrute — the EXCEPT-BY twin of the self "can't be blocked this turn" effect: a layer-6
 * `cantBeBlockedExceptBy:<Keyword>` grant until end of turn, read at block time by grantedAttackerExceptions into the
 * same `keyword` arm the printed static uses (the blocker must carry the keyword — CR 509.1b).
 * Tough Cookie — the animate lane on a CHOSEN noncreature artifact of the controller's (the enumerator's layer-aware
 * noncreatureArtifact predicate + the controller restriction); the same resolver as the man-lands: layer-4 Creature,
 * layer-7b base P/T, until end of turn.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { permanentHasKeyword, permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GINGERBRUTE = { id: "c-gb", name: "Gingerbrute", type: "Artifact Creature — Food Golem", mana: "{1}", power: 1, toughness: 1, keywords: ["Haste"],
  oracle: "Haste\n{1}: This creature can't be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this creature: You gain 3 life." };
const TOUGH_COOKIE = { id: "c-tc", name: "Tough Cookie", type: "Artifact Creature — Food Golem", mana: "{1}{G}", power: 1, toughness: 1, keywords: [],
  oracle: "When this creature enters, create a Food token.\n{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature.\n{2}, {T}, Sacrifice this creature: You gain 3 life." };
const ROADRUNNER = { id: "c-rr", name: "Resilient Roadrunner", type: "Creature — Bird", mana: "{1}{R}", power: 2, toughness: 1, keywords: ["Haste"], oracle: "Haste, protection from Coyotes\n{3}: This creature can't be blocked this turn except by creatures with haste." };
const ANIMIST = { id: "c-aa", name: "Alloy Animist", type: "Creature — Human Druid", mana: "{G}", power: 1, toughness: 1, keywords: [], oracle: "{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature." };

const forest = (id, ctrl = "user") => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl });
const creature = (id, ctrl, keywords = []) => ({ ...createPermanent({ id, card: { id: "c-" + id, name: "Body " + id, type: "Creature — Bear", power: 2, toughness: 2, keywords }, controller: ctrl }), summoningSick: false });
const food = (id, ctrl = "user") => createPermanent({ id, card: { id: "c-" + id, name: "Food", type: "Token Artifact — Food", token: true, oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life." }, controller: ctrl });
function main(userPerms, aiPerms = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: userPerms }, ai: { ...s.players.ai, battlefield: aiPerms } } };
}
const offers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("Gingerbrute — can't be blocked except by creatures with haste", () => {
  it("parses as the self cant-be-blocked atom with exceptByKeyword Haste; a bare form has none", () => {
    expect(parseEffectClause("This creature can't be blocked this turn except by creatures with haste.", "Creature").atoms).toEqual([{ op: "cant-be-blocked", target: "self", targetType: null, exceptByKeyword: "Haste" }]);
    expect(parseEffectClause("This creature can't be blocked this turn.", "Creature").atoms).toEqual([{ op: "cant-be-blocked", target: "self", targetType: null }]);
    expect(parseEffectClause("This creature can't be blocked this turn except by Wumpuses.", "Creature").confidence).toBe("low");
  });
  it("after the activation only a HASTE creature may block it this turn; a vanilla one may not", () => {
    let s = main([{ ...createPermanent({ id: "GB", card: GINGERBRUTE, controller: "user" }), summoningSick: false }, forest("F1")], [creature("VAN", "ai"), creature("HASTY", "ai", ["Haste"])]);
    // Control: before the activation both may block.
    const attacking = (st) => ({ ...st, combat: { attackers: [{ permanentId: "GB", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(canBlockAttacker(attacking(s), "VAN", "GB", "ai")).toBe(true);
    const act = offers(s, "GB").find((a) => (a.cmc || 0) === 1 || /can't be blocked/i.test(a.effectClause || a.name || ""));
    expect(act).toBeTruthy();
    s = resolveAll(dispatchAction(s, act));
    expect(permanentHasKeyword(s, "GB", "cantBeBlockedExceptBy:Haste")).toBe(true);
    expect(permanentHasKeyword(s, "GB", "unblockable")).toBe(false);
    const c = attacking(s);
    expect(canBlockAttacker(c, "VAN", "GB", "ai")).toBe(false);
    expect(canBlockAttacker(c, "HASTY", "GB", "ai")).toBe(true);
  });
});

describe("Tough Cookie — animate a chosen noncreature artifact you control", () => {
  it("parses onto the noncreatureArtifact target with the controller restriction, 4/4, until end of turn", () => {
    expect(parseEffectClause("Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature.", "Creature").atoms)
      .toEqual([{ op: "animate", targetType: "noncreatureArtifact", restrictions: [{ kind: "controller", who: "you" }], power: 4, toughness: 4, subtypes: [], cardTypes: ["Artifact"], grantKeywords: [], duration: "endOfTurn" }]);
    expect(parseEffectClause("Target noncreature artifact you control becomes a 4/4 artifact creature.", "Creature").confidence).toBe("low"); // a permanent animate is not modeled
  });
  it("offers only the controller's own NONcreature artifacts — never the Cookie itself, never the opponent's Food", () => {
    const s = main([{ ...createPermanent({ id: "TC", card: TOUGH_COOKIE, controller: "user" }), summoningSick: false }, food("FOOD"), forest("F1"), forest("F2"), forest("F3")], [food("AIFOOD", "ai")]);
    const acts = offers(s, "TC").filter((a) => a.targets?.length);
    expect(acts.map((a) => a.targets[0].id)).toEqual(["FOOD"]);
  });
  it("the Food becomes a 4/4 artifact creature this turn", () => {
    let s = main([{ ...createPermanent({ id: "TC", card: TOUGH_COOKIE, controller: "user" }), summoningSick: false }, food("FOOD"), forest("F1"), forest("F2"), forest("F3")]);
    expect(permanentIsCreature(s, "FOOD")).toBe(false);
    const act = offers(s, "TC").find((a) => a.targets?.[0]?.id === "FOOD");
    s = resolveAll(dispatchAction(s, act));
    expect(permanentIsCreature(s, "FOOD")).toBe(true);
    const foodPerm = s.players.user.battlefield.find((p) => p.id === "FOOD");
    expect(creaturePower(foodPerm, s)).toBe(4);
  });
});

describe("classifier — whole cards", () => {
  it("Gingerbrute and Resilient Roadrunner native-activated; Tough Cookie native-mixed; Alloy Animist native-activated", () => {
    expect(classifyCard(GINGERBRUTE)).toBe("native-activated");
    expect(classifyCard(ROADRUNNER)).toBe("native-activated");
    expect(classifyCard(TOUGH_COOKIE)).toBe("native-mixed");
    expect(classifyCard(ANIMIST)).toBe("native-activated");
  });
});
