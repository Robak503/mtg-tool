/**
 * lightningStagger.test.js — Lightning, Army of One (EDHREC #2409; the play-weighted program, phase 2):
 *
 *   "First strike, trample, lifelink
 *    Stagger — Whenever Lightning deals combat damage to a player, until your next turn, if a source would deal damage to that
 *    player or a permanent that player controls, it deals double that damage instead."
 *
 * "Stagger" is a flavor word (CR 207.2d — no rules meaning). The trigger's effect is a replacement created by a resolved ability
 * (CR 611.2a — it lasts as long as it says), stored on the state for the damaged player: any source's damage to that player or a
 * permanent they control is doubled, in the affected player's CR 616.1 order with the board's other replacements, until
 * Lightning's controller's next turn begins.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets, runStepActions } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LIGHTNING = { name: "Lightning, Army of One", type: "Legendary Creature — Human Soldier", mana: "{1}{R}{W}", colors: ["R", "W"], power: "3", toughness: "2", keywords: ["Lifelink", "Stagger", "First strike", "Trample", "Double"],
  oracle: "First strike, trample, lifelink\nStagger — Whenever Lightning deals combat damage to a player, until your next turn, if a source would deal damage to that player or a permanent that player controls, it deals double that damage instead." };
const PYROMANCER = { name: "Prodigal Pyromancer", type: "Creature — Human Wizard", mana: "{2}{R}", colors: ["R"], power: "1", toughness: "1", keywords: [],
  oracle: "{T}: This creature deals 1 damage to any target." };
const DINO = { name: "Ancient Brontodon", type: "Creature — Dinosaur", mana: "{6}{G}{G}", colors: ["G"], power: "9", toughness: "9", keywords: [], oracle: "" };
const WALL = { name: "Wall of Stone", type: "Creature — Wall", mana: "{1}{R}{R}", colors: ["R"], power: "0", toughness: "8", keywords: ["Defender"], oracle: "Defender" };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function board({ user = [], ai = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai: { ...g.players.ai, battlefield: ai } } };
}
const findP = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id);
function settle(s) {
  let next = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && (next.stack || []).length; i++) next = flushTriggers(resolveTopOfStack(next), { chooseTargets: chooseTriggerTargets });
  return next;
}
/** Lightning attacks the AI (optionally blocked by `blockerId`); the first-strike combat damage step and its triggers run. */
function attack(s, blockerId = null) {
  const c = { ...s, combat: { attackers: [{ permanentId: "light", attackingPlayer: "user", defender: "ai" }], blockers: blockerId ? [{ blockerId, blockingPlayer: "ai", attackerId: "light" }] : [] } };
  return settle({ ...resolveCombatDamage(c, { firstStrikeStep: true }), combat: null }); // first strike: the first-strike damage step
}
const ping = (s, srcId, n, target) => applyDamageEffect(s, { controller: findP(s, srcId).controller, amount: n, targets: [target], source: findP(s, srcId) });
const lost = (before, after, pid) => before.players[pid].life - after.players[pid].life;

describe("⭐ Lightning, Army of One — Stagger", () => {
  const b = () => board({ user: [perm("light", LIGHTNING, "user"), perm("pp", PYROMANCER, "user"), perm("mydino", DINO, "user")], ai: [perm("ap", PYROMANCER, "ai"), perm("adino", DINO, "ai")] });
  it("⭐ after Lightning's combat damage, the damaged player is dealt double — by your source, and by THEIR OWN source", () => {
    const s = attack(b());
    const row = {
      combatLoss: b().players.ai.life - s.players.ai.life,
      yourPing: lost(s, ping(s, "pp", 1, { type: "player", id: "ai" }), "ai"),
      theirOwnPingOnTheirCreature: findP(ping(s, "ap", 1, { type: "creature", id: "adino" }), "adino").damageMarked,
    };
    console.log(`WITNESS stagger ${JSON.stringify(row)}`);
    expect(row).toEqual({ combatLoss: 3, yourPing: 2, theirOwnPingOnTheirCreature: 2 });
  });
  it("control: the OTHER player — you, and your creatures — is dealt normal damage", () => {
    const s = attack(b());
    expect({ toYou: lost(s, ping(s, "ap", 1, { type: "player", id: "user" }), "user"), toYourCreature: findP(ping(s, "ap", 1, { type: "creature", id: "mydino" }), "mydino").damageMarked })
      .toEqual({ toYou: 1, toYourCreature: 1 });
  });
  it("⭐ it lasts through the opponent's turn and ends as your next turn begins", () => {
    const s = attack(b());
    const theirTurn = runStepActions({ ...s, turn: 4, activePlayer: "ai", phase: "beginning", step: "untap" });
    const yourNext = runStepActions({ ...theirTurn, turn: 5, activePlayer: "user", phase: "beginning", step: "untap" });
    expect({ theirTurn: lost(theirTurn, ping(theirTurn, "pp", 1, { type: "player", id: "ai" }), "ai"), yourNextTurn: lost(yourNext, ping(yourNext, "pp", 1, { type: "player", id: "ai" }), "ai") })
      .toEqual({ theirTurn: 2, yourNextTurn: 1 });
  });
  it("control: blocked by a creature with enough toughness, Lightning deals no combat damage to a player — nothing is stored", () => {
    const s0 = board({ user: [perm("light", LIGHTNING, "user"), perm("pp", PYROMANCER, "user")], ai: [perm("wall", WALL, "ai")] });
    const s = attack(s0, "wall");
    expect(lost(s, ping(s, "pp", 1, { type: "player", id: "ai" }), "ai")).toBe(1);
  });
  it("⭐ the card reads native", () => {
    expect(classifyCard(LIGHTNING)).toBe("native-trigger");
  });
});
