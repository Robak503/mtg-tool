/**
 * mazeOfIth.test.js — SHELF-85 runbook V13 (2026-09-04): Maze of Ith (Atraxa ×2) and the twins the flip-diff surfaced
 * on the same sentence (Foxfire, Ith, High Arcanist).
 *
 *   "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature
 *    this turn."
 *
 * The untap-by-combat-role atom and the ④-AE combat window existed; the ④-AU dealer stamp (noCombatDamageTurn) existed.
 * New: the prevent sentence folds onto the untap sentence (as "Untap it." folds onto a pump) and the splitter keeps the
 * folded clause whole; ONE untap atom carries `preventCombatDamageTurn`; the resolver stamps BOTH halves on the target
 * for this turn — the dealer gate and the new receiver gate `takesNoCombatDamageTurn`, which combat resolution honours
 * at both receiver sites exactly like protection (assignment still absorbs the lethal share). The AI's combat-role
 * picker treats the prevent-untap as ENEMY-facing: it Mazes an attacker attacking it, never its own.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MAZE = { id: "c-maze", name: "Maze of Ith", type: "Land", keywords: [], oracle: "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn." };
const FOXFIRE = { id: "c-fox", name: "Foxfire", type: "Instant", mana: "{2}{G}", keywords: [], oracle: "Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.\nDraw a card at the beginning of the next turn's upkeep." };
const ITH = { id: "c-ith", name: "Ith, High Arcanist", type: "Legendary Creature — Human Wizard", mana: "{5}{W}{U}", power: 3, toughness: 5, keywords: ["Vigilance"], oracle: "Vigilance\n{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.\nSuspend 4—{W}{U}" };
const SENTENCE = "Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.";

// Toughness 5 on every body so the control pins measure MARKED damage rather than a death (a 2/3 blocker taking 3 dies).
const bear = (id, controller, power = 3, extra = {}) => ({ ...createPermanent({ id, card: { id: `card-${id}`, name: "Bear " + id, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power, toughness: 5, keywords: [], oracle: "" }, controller }), summoningSick: false, ...extra });

/** `attacker` (controlled by `atk`) attacks `def`; `def` holds priority in declare-blockers with `defPerms` (+ optional blockers). */
function combatBoard({ atk, def, attacker, defPerms, blockers = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "declare-blockers", step: "declare-blockers", activePlayer: atk, priorityHolder: def, consecutivePasses: 0,
    combat: { attackers: [{ permanentId: attacker.id, attackingPlayer: atk, defender: def }], blockers: blockers.map((b) => ({ blockerId: b.id, attackerId: attacker.id })) },
    players: { ...s0.players, [atk]: { ...s0.players[atk], battlefield: [attacker] }, [def]: { ...s0.players[def], battlefield: [...defPerms, ...blockers] } } };
}
const perm = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const mazeOffers = (s, pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "activate-ability" && a.permanentId === "MAZE");

describe("parse — one atom carrying both halves", () => {
  it("the splitter folds the prevent sentence onto the untap and keeps the clause whole", () => {
    expect(splitClauses(SENTENCE)).toEqual(["Untap target attacking creature and prevent all combat damage that would be dealt to and dealt by that creature this turn"]);
  });
  it("parses HIGH: untap by combat role with preventCombatDamageTurn", () => {
    expect(parseEffectClause(SENTENCE, "Land").atoms).toEqual([{ op: "untap", targetType: "creature", preventCombatDamageTurn: true, restrictions: [{ kind: "combat", value: "attacking" }] }]);
    const ab = parseActivatedAbilities(MAZE)[0];
    expect(ab.modeled).toBe(true);
    expect(ab.needsTarget).toBe(true);
  });
  it("CREED near-miss: the prevent sentence alone never parses", () => {
    expect(parseEffectClause("Prevent all combat damage that would be dealt to and dealt by target creature this turn.", "Land").confidence).toBe("low");
  });
});

describe("runtime — the user Mazes the AI's attacker", () => {
  it("offered in the combat window targeting the attacker; resolution untaps it and stamps both halves for this turn", () => {
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true };
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [createPermanent({ id: "MAZE", card: MAZE, controller: "user" })] });
    const acts = mazeOffers(s, "user");
    expect(acts).toHaveLength(1);
    expect(acts[0].targets[0].id).toBe("ATK");
    s = resolveAll(dispatchAction(s, acts[0]));
    const atk = perm(s, "ai", "ATK");
    expect(atk.tapped).toBe(false);
    expect(atk.noCombatDamageTurn).toBe(6);
    expect(atk.takesNoCombatDamageTurn).toBe(6);
    expect(perm(s, "user", "MAZE").tapped).toBe(true);
  });
  it("dealer half: the Mazed unblocked attacker deals no combat damage to the user", () => {
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true };
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [createPermanent({ id: "MAZE", card: MAZE, controller: "user" })] });
    s = resolveAll(dispatchAction(s, mazeOffers(s, "user")[0]));
    const life = s.players.user.life;
    s = resolveCombatDamage(s);
    expect(s.players.user.life).toBe(life);
  });
  it("receiver half: a blocked Mazed attacker takes no damage from its blocker (and deals none to it)", () => {
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true };
    const blocker = bear("BLK", "user", 2);
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [createPermanent({ id: "MAZE", card: MAZE, controller: "user" })], blockers: [blocker] });
    s = resolveAll(dispatchAction(s, mazeOffers(s, "user").find((a) => a.targets[0].id === "ATK")));
    s = resolveCombatDamage(s);
    expect(perm(s, "ai", "ATK").damageMarked || 0).toBe(0);
    expect(perm(s, "user", "BLK").damageMarked || 0).toBe(0);
  });
  it("control: without the Maze the same block deals damage both ways", () => {
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true };
    const blocker = bear("BLK", "user", 2);
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [], blockers: [blocker] });
    s = resolveCombatDamage(s);
    expect(perm(s, "ai", "ATK").damageMarked).toBe(2);
    expect(perm(s, "user", "BLK").damageMarked).toBe(3);
  });
  it("the receiver stamp is per CREATURE, not per attacker: a stamped BLOCKER takes 0 while still dealing its damage", () => {
    // Maze itself only ever stamps an attacker; the stamp's meaning ("takes no combat damage this turn") must hold for
    // whichever combat role the creature is in, so the blocker-side gate is pinned directly.
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true };
    const blocker = { ...bear("BLK", "user", 2), takesNoCombatDamageTurn: 6 };
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [], blockers: [blocker] });
    s = resolveCombatDamage(s);
    expect(perm(s, "user", "BLK").damageMarked || 0).toBe(0);
    expect(perm(s, "ai", "ATK").damageMarked).toBe(2);
  });
  it("the stamps are per turn: next turn the creature deals and takes damage again", () => {
    const attacker = { ...bear("ATK", "ai", 3), tapped: true, attackedThisTurn: true, noCombatDamageTurn: 5, takesNoCombatDamageTurn: 5 };
    const blocker = bear("BLK", "user", 2);
    let s = combatBoard({ atk: "ai", def: "user", attacker, defPerms: [], blockers: [blocker] });
    s = resolveCombatDamage(s);
    expect(perm(s, "ai", "ATK").damageMarked).toBe(2);
    expect(perm(s, "user", "BLK").damageMarked).toBe(3);
  });
});

describe("the AI aims it at the attacker attacking it", () => {
  it("the user attacks with a 4/4 and a 2/4; the AI Mazes the 4/4", () => {
    const big = { ...bear("BIG", "user", 4), tapped: true, attackedThisTurn: true };
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 6, phase: "declare-blockers", step: "declare-blockers", activePlayer: "user", priorityHolder: "ai", consecutivePasses: 0,
      combat: { attackers: [{ permanentId: "BIG", attackingPlayer: "user", defender: "ai" }, { permanentId: "SMALL", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [big, { ...bear("SMALL", "user", 2), tapped: true, attackedThisTurn: true }] }, ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "MAZE", card: MAZE, controller: "ai" })] } } };
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a).toMatchObject({ kind: "activate-ability", permanentId: "MAZE" });
    expect(a.targets[0].id).toBe("BIG");
  });
});

describe("classifier — whole cards", () => {
  it("Maze of Ith is a land; Foxfire native-spell; Ith native-activated", () => {
    expect(classifyCard(MAZE)).toBe("land");
    expect(classifyCard(FOXFIRE)).toBe("native-spell");
    expect(classifyCard(ITH)).toBe("native-activated");
  });
});
