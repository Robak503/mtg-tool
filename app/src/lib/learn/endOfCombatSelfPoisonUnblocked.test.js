/**
 * endOfCombatSelfPoisonUnblocked.test.js — ④-AX (2026-09-04 night): two small combat families on machinery built or
 * extended tonight.
 *   1. "When this creature attacks or blocks, sacrifice it / return it to its owner's hand at end of combat" — the OR-1
 *      split hands each half (attacks/self, blocks/self) a `self-at-end-of-combat` atom whose resolver enqueues a
 *      turn-stamped entry on state.endOfCombatEffects (the basilisk-touch queue); combatResolution drains it at the
 *      end-of-combat boundary. Mardu Blazebringer / Runaway Carriage / Fog Elemental (sacrifice); Windscouter / Phantom
 *      Whelp (bounce).
 *   2. "Whenever this creature attacks and isn't blocked, defending player gets a poison counter" — the ④-AU
 *      attacksUnblocked event + the poison atom's new who:"defendingPlayer" (ctx.defenderId). Crypt Cobra / Swamp
 *      Mosquito / Suq'Ata Assassin.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BLAZE = { id: "c-mb", name: "Mardu Blazebringer", type: "Creature — Ogre Warrior", mana: "{2}{R}", cmc: 3, power: 4, toughness: 4, keywords: [], oracle: "When this creature attacks or blocks, sacrifice it at end of combat." };
const CARRIAGE = { id: "c-rc", name: "Runaway Carriage", type: "Artifact Creature — Construct", mana: "{5}", cmc: 5, power: 4, toughness: 4, keywords: ["Trample"], oracle: "Trample\nWhen this creature attacks or blocks, sacrifice it at end of combat." };
const FOG = { id: "c-fe", name: "Fog Elemental", type: "Creature — Elemental", mana: "{2}{U}", cmc: 3, power: 4, toughness: 4, keywords: ["Flying"], oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhen this creature attacks or blocks, sacrifice it at end of combat." };
const WINDSCOUTER = { id: "c-ws", name: "Windscouter", type: "Creature — Faerie Scout", mana: "{2}{U}", cmc: 3, power: 3, toughness: 3, keywords: ["Flying"], oracle: "Flying\nWhen this creature attacks or blocks, return it to its owner's hand at end of combat. (Return it only if it's on the battlefield.)" };
const WHELP = { id: "c-pw", name: "Phantom Whelp", type: "Creature — Illusion Hound", mana: "{1}{U}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "When this creature attacks or blocks, return it to its owner's hand at end of combat. (Return it only if it's on the battlefield.)" };
const COBRA = { id: "c-cc", name: "Crypt Cobra", type: "Creature — Snake", mana: "{3}{B}", cmc: 4, power: 3, toughness: 3, keywords: [], oracle: "Whenever this creature attacks and isn't blocked, defending player gets a poison counter. (A player with ten or more poison counters loses the game.)" };
const MOSQUITO = { id: "c-sm", name: "Swamp Mosquito", type: "Creature — Insect", mana: "{1}{B}", cmc: 2, power: 0, toughness: 1, keywords: ["Flying"], oracle: "Flying\nWhenever this creature attacks and isn't blocked, defending player gets a poison counter. (A player with ten or more poison counters loses the game.)" };

const perm = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `card-${id}`, keywords: [], oracle: "", ...card }, controller }), summoningSick: false });
const bear = (id, controller, power = 2, toughness = 2) => perm(id, { name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power, toughness }, controller);
/** A declare-blockers board on the user's turn: `attackers` attack the AI; `blocks` = [blockerId, attackerId]. */
function declareBlockers({ userBoard, aiBoard, attackers, blocks = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "combat", step: "declare-blockers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    combat: { attackers: attackers.map((id) => ({ permanentId: id, defender: "ai" })), blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, attackerId })) },
    players: { ...s0.players, user: { ...s0.players.user, hand: [], battlefield: userBoard }, ai: { ...s0.players.ai, hand: [], battlefield: aiBoard } } };
}
/** A triggered ability on the stack carrying `program` for `sourceId` (the shape buildTriggerStack emits). */
function stackTrigger(state, sourceId, clause) {
  const program = parseEffectClause(clause, "Instant", { sourceScoped: true });
  expect(program.confidence).toBe("high");
  const lk = findPermanent(state, sourceId);
  return { ...state, stack: [...state.stack, { id: `stk-${sourceId}`, kind: "triggered-ability", source: { permanentId: sourceId, cardId: lk.permanent.card.id, name: lk.permanent.card.name }, controller: lk.controller, targets: [], cost: null,
    payload: { resolver: "effect-program", params: { program, controller: lk.controller, context: { sourcePermanentId: sourceId }, sourceId, targets: [] } } }] };
}

describe("the parse and the classifier", () => {
  it("⭐ 'sacrifice it / return it to its owner's hand at end of combat' → the self end-of-combat atom; the crossed forms never parse", () => {
    expect(parseEffectClause("sacrifice it at end of combat", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "self-at-end-of-combat", action: "sacrifice", target: "self", targetType: null }]);
    expect(parseEffectClause("return it to its owner's hand at end of combat", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "self-at-end-of-combat", action: "bounce", target: "self", targetType: null }]);
    expect(parseEffectClause("return it at end of combat", "Instant", { sourceScoped: true }).confidence).toBe("low");
    expect(parseEffectClause("sacrifice it to its owner's hand at end of combat", "Instant", { sourceScoped: true }).confidence).toBe("low");
  });
  it("'defending player gets a poison counter' → add-poison who:defendingPlayer", () => {
    expect(parseEffectClause("defending player gets a poison counter", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "add-poison", amount: 1, who: "defendingPlayer", targetType: null }]);
  });
  it("the OR-1 split hands both halves the same effect", () => {
    const d = detectTriggers(BLAZE);
    expect(d.map((x) => x.event).sort()).toEqual(["attacks", "blocks"]);
    expect(d.every((x) => x.scope === "self" && x.effectClause === "sacrifice it at end of combat")).toBe(true);
    expect(detectTriggers(COBRA).map((x) => [x.event, x.scope])).toEqual([["attacksUnblocked", "self"]]);
  });
  it("the tiers", () => {
    for (const c of [BLAZE, CARRIAGE, FOG, WINDSCOUTER, WHELP, COBRA, MOSQUITO]) expect(classifyCard(c), c.name).toBe("native-trigger");
  });
});

describe("runtime — the end-of-combat queue", () => {
  it("⭐ SACRIFICE: the Blazebringer deals its combat damage, then is sacrificed at the end-of-combat boundary", () => {
    let s = declareBlockers({ userBoard: [perm("blaze", BLAZE, "user")], aiBoard: [], attackers: ["blaze"] });
    s = resolveTopOfStack(stackTrigger(s, "blaze", "sacrifice it at end of combat"));
    expect(s.endOfCombatEffects).toHaveLength(1);
    expect(s.endOfCombatEffects[0]).toMatchObject({ op: "sacrifice", permanentId: "blaze", turn: 6 });
    expect(findPermanent(s, "blaze")).toBeTruthy(); // nothing happens at resolution
    const lifeBefore = s.players.ai.life;
    const after = resolveCombatDamage(s);
    expect(lifeBefore - after.players.ai.life).toBe(4); // it hit first
    expect(findPermanent(after, "blaze")).toBeNull();
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Mardu Blazebringer");
    expect(after.endOfCombatEffects).toEqual([]);
  });
  it("⭐ BOUNCE: Windscouter returns to its owner's hand after dealing damage", () => {
    let s = declareBlockers({ userBoard: [perm("scout", WINDSCOUTER, "user")], aiBoard: [], attackers: ["scout"] });
    s = resolveTopOfStack(stackTrigger(s, "scout", "return it to its owner's hand at end of combat"));
    const after = resolveCombatDamage(s);
    expect(findPermanent(after, "scout")).toBeNull();
    expect(after.players.user.hand.map((c) => c.name)).toContain("Windscouter");
    expect(after.players.user.graveyard.map((c) => c.name)).not.toContain("Windscouter");
  });
  it("a creature that died to combat damage is a clean skip; a stale entry from an earlier turn never fires", () => {
    // dead before the boundary: a 2/2 Whelp blocked by a 4/4
    let s = declareBlockers({ userBoard: [perm("whelp", WHELP, "user")], aiBoard: [bear("wall", "ai", 4, 4)], attackers: ["whelp"], blocks: [["wall", "whelp"]] });
    s = resolveTopOfStack(stackTrigger(s, "whelp", "return it to its owner's hand at end of combat"));
    const after = resolveCombatDamage(s);
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Phantom Whelp");
    expect(after.players.user.hand).toHaveLength(0);
    // stale: an entry stamped for turn 5 on turn 6
    let t = declareBlockers({ userBoard: [perm("blaze", BLAZE, "user")], aiBoard: [], attackers: ["blaze"] });
    t = { ...t, endOfCombatEffects: [{ op: "sacrifice", permanentId: "blaze", turn: 5, sourceCardName: null }] };
    const kept = resolveCombatDamage(t);
    expect(findPermanent(kept, "blaze")).toBeTruthy();
    expect(kept.endOfCombatEffects).toEqual([]);
  });
});

describe("runtime — unblocked poison", () => {
  it("⭐ Crypt Cobra unblocked: the DEFENDING player gets one poison counter; blocked: none", () => {
    let s = nextStep(declareBlockers({ userBoard: [perm("cobra", COBRA, "user")], aiBoard: [bear("idle", "ai")], attackers: ["cobra"] }));
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.players.ai.poison || 0).toBe(1);
    expect(s.players.user.poison || 0).toBe(0);
    const blocked = nextStep(declareBlockers({ userBoard: [perm("cobra", COBRA, "user")], aiBoard: [bear("blk", "ai")], attackers: ["cobra"], blocks: [["blk", "cobra"]] }));
    expect(blocked.stack).toHaveLength(0);
    expect(blocked.players.ai.poison || 0).toBe(0);
  });
});
