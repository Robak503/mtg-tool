/**
 * cantAttackOrBlockTarget.test.js — the play-weighted program (2026-10-18): "Target creature can't attack or block this turn."
 * — Endbringer (EDHREC #2401) "{C}, {T}: Target creature can't attack or block this turn." and the twins (Thundersong
 * Trumpeter, Alchemist's Vial). The "can't block this turn" atom with its other half: two layer-6 end-of-turn grants on the
 * target, `cantBlock` (combatEvasion.canBlockAttacker) and `cantAttack` (the attack-declaration gate — the Pacifism class
 * reads the same pseudo-keyword), worn off at cleanup like every until-end-of-turn grant (CR 514.2).
 *
 * Bundled rulings witnessed (rulings.json): Endbringer (2016-01-22) "Activating the second activated ability after a creature
 * has legally been declared as an attacker or blocker won't change or undo that attack or block."; Alchemist's Vial
 * (2015-06-22) "… targeting a creature that's already attacking or blocking won't cause that creature to stop attacking or
 * blocking."
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-18).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ENDBRINGER = { id: "c-end", name: "Endbringer", type: "Creature — Eldrazi", mana: "{5}{C}", power: 5, toughness: 5, keywords: [],
  oracle: "Untap this creature during each other player's untap step.\n{T}: This creature deals 1 damage to any target.\n{C}, {T}: Target creature can't attack or block this turn.\n{C}{C}, {T}: Draw a card." };
const TRUMPETER = { id: "c-trump", name: "Thundersong Trumpeter", type: "Creature — Human Soldier", mana: "{R}{W}", power: 2, toughness: 1, keywords: [],
  oracle: "{T}: Target creature can't attack or block this turn." };
const VIAL = { id: "c-vial", name: "Alchemist's Vial", type: "Artifact", mana: "{2}", keywords: [],
  oracle: "When this artifact enters, draw a card.\n{1}, {T}, Sacrifice this artifact: Target creature can't attack or block this turn." };
// CREED control — a group restriction sized by {X} stays unread on both trees.
const BUREAUCRATS = { id: "c-db", name: "Droning Bureaucrats", type: "Creature — Human Advisor", mana: "{3}{W}", power: 1, toughness: 4, keywords: [],
  oracle: "{X}, {T}: Each creature with mana value X can't attack or block this turn." };
const BEAR = (id) => ({ id: "c-" + id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" });
const WASTES = (id) => ({ id: "c-" + id, name: "Wastes", type: "Basic Land", keywords: [], oracle: "{T}: Add {C}." });

const put = (card, id, controller = "user", over = {}) => ({ ...createPermanent({ id, card, controller }), summoningSick: false, ...over });
const lib = (n, tag = "u") => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));
const resolveAll = (s) => { let g = 0; while (s.stack.length && g++ < 20) s = resolveTopOfStack(s); return s; };

function at(active, phase, step, priority, userPerms, aiPerms, combat = undefined) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase, step, activePlayer: active, priorityHolder: priority, consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: userPerms }, ai: { ...s.players.ai, library: lib(6, "a"), battlefield: aiPerms } },
    ...(combat ? { combat } : {}) };
}
const activate = (s, pid, permId, targetId) => {
  const act = legalActionsForPlayer(s, pid).find((a) => a.kind === "activate-ability" && a.permanentId === permId && a.targets?.[0]?.id === targetId && /attack or block/i.test(String(a.abilityText || a.program?.raw || "")));
  expect(act).toBeTruthy();
  return resolveAll(dispatchAction(s, act));
};

describe("classifier and parser", () => {
  it("Endbringer, Thundersong Trumpeter and Alchemist's Vial are native", () => {
    expect(classifyCard(ENDBRINGER)).toBe("native-activated");
    expect(classifyCard(TRUMPETER)).toBe("native-activated");
    expect(classifyCard(VIAL)).toMatch(/^native-/);
  });
  it("the clause reads as the can't-block grant with its can't-attack half", () => {
    const p = parseEffectClause("Target creature can't attack or block this turn.");
    expect(p?.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "cant-block", targetType: "creature", cantAttack: true });
  });
  it("CREED control: Droning Bureaucrats' {X} group restriction stays unread", () => {
    expect(classifyCard(BUREAUCRATS)).toBe("body-only");
  });
});

describe("runtime — the target can neither attack nor block this turn", () => {
  // The engine offers a non-combat-role activation in its controller's own main phase (legalChoices.actionsActivateAbility's
  // windows), so the can't-attack half is witnessed on a creature of the activator's own, and the ruling below on a resolution.
  it("Trumpeter on its controller's own creature in the main phase: that creature is never offered as an attacker this turn", () => {
    let s = at("user", "precombat-main", "main", "user", [put(TRUMPETER, "TR"), put(BEAR("UB"), "UB"), put(BEAR("UC"), "UC")], [put(BEAR("AB"), "AB", "ai")]);
    s = activate(s, "user", "TR", "UB");
    expect(permanentHasKeyword(s, "UB", "cantAttack")).toBe(true);
    expect(permanentHasKeyword(s, "UB", "cantBlock")).toBe(true);
    const declare = { ...s, phase: "combat", step: "declare-attackers", priorityHolder: "user" };
    const attackers = legalActionsForPlayer(declare, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(attackers).toContain("UC");
    expect(attackers).not.toContain("UB");
  });
  it("in its controller's main phase, Endbringer's target can't block the attack that follows", () => {
    let s = at("user", "precombat-main", "main", "user", [put(ENDBRINGER, "EB"), put(WASTES("W1"), "W1"), put(BEAR("UB"), "UB")], [put(BEAR("AB"), "AB", "ai")]);
    s = activate(s, "user", "EB", "AB");
    const combat = { ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "UB", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(canBlockAttacker(combat, "AB", "UB", "ai")).toBe(false);
    expect(permanentHasKeyword(s, "AB", "cantAttack")).toBe(true);
  });
  it("an attacker already declared keeps attacking (the Endbringer and Alchemist's Vial rulings)", () => {
    const program = parseEffectClause("Target creature can't attack or block this turn.");
    let s = at("ai", "combat", "declare-blockers", "user", [put(VIAL, "AV")], [put(BEAR("AB"), "AB", "ai", { tapped: true })],
      { attackers: [{ permanentId: "AB", attackingPlayer: "ai", defender: "user" }], blockers: [] });
    const target = { type: "creature", id: "AB", controller: "ai", owner: "ai", name: "Grizzly Bears", atomIndex: 0 };
    s = { ...s, stack: [{ id: "stk-vial", kind: "activated-ability", source: VIAL, controller: "user", targets: [target],
      payload: { resolver: "effect-program", params: { program, controller: "user", targets: [target], cardId: VIAL.id, sourceId: "AV" } } }] };
    s = resolveAll(s);
    expect(permanentHasKeyword(s, "AB", "cantAttack")).toBe(true);
    expect(permanentHasKeyword(s, "AB", "cantBlock")).toBe(true);
    expect(s.combat.attackers.map((a) => a.permanentId)).toEqual(["AB"]);
  });
  it("both halves end at cleanup (CR 514.2)", () => {
    let s = at("user", "precombat-main", "main", "user", [put(TRUMPETER, "TR")], [put(BEAR("AB"), "AB", "ai")]);
    s = activate(s, "user", "TR", "AB");
    expect(permanentHasKeyword(s, "AB", "cantAttack")).toBe(true);
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect(permanentHasKeyword(s, "AB", "cantAttack")).toBe(false);
    expect(permanentHasKeyword(s, "AB", "cantBlock")).toBe(false);
  });
});
