/**
 * shorikaiSRows.test.js — SHELF-85 runbook Phase 2 · S3 + S4 + S10 (2026-09-04): Shorikai's small rows.
 *
 *   S3 Thunderhawk Gunship — "Whenever this Vehicle attacks, attacking creatures you control gain flying until end of
 *      turn." The group-grant lane gains the OWN-side attacker batch (scope attackingCreaturesYouControl: the live
 *      attacker set filtered to the controller's creatures).
 *   S4 Parhelion II — "Whenever Parhelion II attacks, create two 4/4 white Angel creature tokens with flying and
 *      vigilance that are attacking." The fixed-count token arm gains the trailing "that are [tapped and] attacking"
 *      rider (peeled before the main match so the keyword list is untouched); applyCreateToken registers the minted
 *      tokens as attackers against the trigger's defender (the Otharri / mobilize convention).
 *   S10 Surgehacker Mech — "When this Vehicle enters, it deals damage equal to twice the number of Vehicles you control
 *      to target creature or planeswalker an opponent controls." The count-damage lane gains a multiplier (per 2), the
 *      Vehicle subtype count, and the opponent-scoped creature-or-planeswalker target.
 *   Twins audited whole-card: Leonin Warleader (S4's tapped form), Jet, Freedom Fighter (S10's plain creature count;
 *   its dies trigger was already modeled).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GUNSHIP = { id: "c-thg", name: "Thunderhawk Gunship", type: "Artifact — Vehicle", mana: "{6}", cmc: 6, power: 6, toughness: 4, keywords: ["Flying", "Crew 2"],
  oracle: "Flying\nWhen this Vehicle enters, create two 2/2 white Astartes Warrior creature tokens with vigilance.\nWhenever this Vehicle attacks, attacking creatures you control gain flying until end of turn.\nCrew 2" };
const PARHELION = { id: "c-p2", name: "Parhelion II", type: "Legendary Artifact — Vehicle", mana: "{6}{W}{W}", cmc: 8, power: 5, toughness: 5, keywords: ["Flying", "First strike", "Vigilance", "Crew 4"],
  oracle: "Flying, first strike, vigilance\nWhenever Parhelion II attacks, create two 4/4 white Angel creature tokens with flying and vigilance that are attacking.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const MECH = { id: "c-sm", name: "Surgehacker Mech", type: "Artifact — Vehicle", mana: "{4}", cmc: 4, power: 5, toughness: 5, keywords: ["Menace", "Crew 4"],
  oracle: "Menace\nWhen this Vehicle enters, it deals damage equal to twice the number of Vehicles you control to target creature or planeswalker an opponent controls.\nCrew 4" };
const WARLEADER = { id: "c-lw", name: "Leonin Warleader", type: "Creature — Cat Soldier", mana: "{2}{W}{W}", cmc: 4, power: 4, toughness: 4, keywords: [], oracle: "Whenever this creature attacks, create two 1/1 white Cat creature tokens with lifelink that are tapped and attacking." };
const JET = { id: "c-jet", name: "Jet, Freedom Fighter", type: "Legendary Creature — Human Rebel Ally", mana: "{2}{R/W}{R/W}{R/W}", cmc: 5, power: 3, toughness: 3, keywords: [],
  oracle: "When Jet enters, he deals damage equal to the number of creatures you control to target creature an opponent controls.\nWhen Jet dies, put a +1/+1 counter on each of up to two target creatures." };

const creature = (id, name, ctrl, extra = {}) => createPermanent({ id, card: { id: "card-" + id, name, type: "Creature — Soldier", power: 2, toughness: 2, oracle: "", ...extra }, controller: ctrl });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("S3: the own-side attacker batch grant", () => {
    const d = detectTriggers(GUNSHIP).find((x) => x.event === "attacks");
    expect(parseEffectClause(d.effectClause, "Artifact").atoms).toEqual([{ op: "grant-keywords-group", scope: "attackingCreaturesYouControl", grantKeywords: ["Flying"] }]);
  });
  it("S4: the attacking rider on the fixed-count token, untapped and tapped forms", () => {
    const d = detectTriggers(PARHELION).find((x) => x.event === "attacks");
    expect(parseEffectClause(d.effectClause, "Artifact").atoms).toEqual([{ op: "create-token", count: 2, power: 4, toughness: 4, descriptor: "white angel", entersAttacking: true, targetType: null, keywords: ["Flying", "Vigilance"] }]);
    expect(parseEffectClause("Create two 1/1 white Cat creature tokens with lifelink that are tapped and attacking.", "Creature").atoms[0]).toMatchObject({ tapped: true, entersAttacking: true, keywords: ["Lifelink"] });
  });
  it("S10: twice the Vehicle count, aimed at an opponent's creature or planeswalker", () => {
    const d = detectTriggers(MECH).find((x) => x.event === "etb");
    const r = parseEffectClause(d.effectClause, "Artifact");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "deal-damage", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "controller", who: "opponent" }], amountCount: { kind: "permanentsYouControl", subtype: "Vehicle", per: 2 } }]);
  });
  it("seen-to-fail: 'thrice' and an unscoped opponent count park", () => {
    expect(parseEffectClause("It deals damage equal to thrice the number of Vehicles you control to target creature an opponent controls.", "Artifact").atoms).toEqual([]);
    expect(parseEffectClause("It deals damage equal to the number of Vehicles your opponents control to target creature an opponent controls.", "Artifact").atoms).toEqual([]);
  });
});

describe("runtime", () => {
  function attackBoard(vehicleCard, vehicleId) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const vehicle = { ...createPermanent({ id: vehicleId, card: vehicleCard, controller: "user", summoningSick: false }) };
    return { ...s, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [vehicle, creature("KNIGHT", "Knight", "user"), creature("HOME", "Homebody", "user")] },
        ai: { ...s.players.ai, battlefield: [creature("WALL", "Wall", "ai")] } },
      combat: { attackers: [{ permanentId: vehicleId, attackingPlayer: "user", defender: "ai" }, { permanentId: "KNIGHT", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
  }
  it("S3: on the attack, the attacking Knight gains flying; the home Homebody and the AI's Wall do not", () => {
    let s = attackBoard(GUNSHIP, "THG");
    s = checkAttackTriggers(s); // reads state.combat.attackers
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(permanentHasKeyword(s, "KNIGHT", "Flying")).toBe(true);
    expect(permanentHasKeyword(s, "HOME", "Flying")).toBe(false);
    expect(permanentHasKeyword(s, "WALL", "Flying")).toBe(false);
  });
  it("S4: on the attack, two 4/4 Angels enter UNTAPPED and are registered as attackers against the defender", () => {
    let s = attackBoard(PARHELION, "P2");
    s = checkAttackTriggers(s);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    const angels = s.players.user.battlefield.filter((p) => /angel/i.test(p.card?.name || ""));
    expect(angels).toHaveLength(2);
    expect(angels.every((p) => !p.tapped)).toBe(true);
    const attackerIds = s.combat.attackers.map((a) => a.permanentId);
    expect(angels.every((p) => attackerIds.includes(p.id))).toBe(true);
    expect(s.combat.attackers.filter((a) => angels.some((p) => p.id === a.permanentId)).every((a) => a.defender === "ai")).toBe(true);
  });
  it("S10: with two Vehicles on board the ETB deals 4 to the opponent's creature; the caster's creatures are never offered", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [createPermanent({ id: "OTHER", card: { id: "card-other", name: "Other Mech", type: "Artifact — Vehicle", power: 3, toughness: 3, oracle: "Crew 1" }, controller: "user" }), creature("MINE", "Mine", "user")] },
        ai: { ...s.players.ai, battlefield: [creature("BIG", "Big", "ai", { power: 5, toughness: 5 })] } } };
    s = enterPermanent(s, MECH, "user"); // the Mech itself counts → two Vehicles → 4 damage
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    const trig = s.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.targets.map((t) => t.id)).toEqual(["BIG"]);
    s = resolveAll(s);
    expect(s.players.ai.battlefield.find((p) => p.id === "BIG").damageMarked).toBe(4);
  });
});

describe("classifier", () => {
  it("the three rows and the two twins are native-trigger", () => {
    expect(classifyCard(GUNSHIP)).toBe("native-trigger");
    expect(classifyCard(PARHELION)).toBe("native-trigger");
    expect(classifyCard(MECH)).toBe("native-trigger");
    expect(classifyCard(WARLEADER)).toBe("native-trigger");
    expect(classifyCard(JET)).toBe("native-trigger");
  });
});
