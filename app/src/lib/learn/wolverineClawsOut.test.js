/**
 * wolverineClawsOut.test.js — shelf decks D15 (2026-09-30): Wolverine, Claws Out, and the attack trigger it exposed.
 *
 *   • "You may have Wolverine assign his combat damage as though he weren't blocked." — Thorn Elemental's line (CR 508.1h,
 *     BLITZ TE-1) with the legend's gendered self-pronouns; the reader and the classifier now take his/her · he/she.
 *   • "Whenever a Mutant you control attacks, double its power until end of turn." — the non-self watcher's "its" is the
 *     TRIGGERING creature (CR 608.2c); triggers.js names it, and the doubling pump (CR 701.10) takes it as target:"thatCreature".
 *   • ⚠️ FP CLOSED: "Whenever this creature attacks a battle, …" read as a plain self-attack and fired on EVERY attack — Thrashing
 *     Frontliner's +1/+1 on each swing at a player. The engine has no battle to attack, so the clause now parks.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { mayAssignAsUnblocked } from "./combatEvasion.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WOLVERINE = { name: "Wolverine, Claws Out", type: "Legendary Creature — Mutant Berserker Hero", mana: "{3}{G}", power: "2", toughness: "5", keywords: ["Double"],
  oracle: "You may have Wolverine assign his combat damage as though he weren't blocked.\nWhenever a Mutant you control attacks, double its power until end of turn." };
const FRONTLINER = { name: "Thrashing Frontliner", type: "Creature — Phyrexian Lizard", mana: "{1}{R}", power: "2", toughness: "2", keywords: ["Trample"],
  oracle: "Trample\nWhenever this creature attacks a battle, it gets +1/+1 until end of turn." };
const MUTANT = { name: "Mutant Ally", type: "Creature — Mutant", power: "3", toughness: "3", oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const WALL = { name: "Big Wall", type: "Creature — Wall", power: "0", toughness: "9", oracle: "" };

const permObj = (card, controller, id) => ({ id, card: { ...card, id: `c-${id}` }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
function board(userPerms, aiPerms = []) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers" };
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userPerms }, ai: { ...base.players.ai, battlefield: aiPerms } } };
}
const attacking = (id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" });
const resolveAll = (s) => { let n = flushTriggers(s), g = 0; while ((n.stack || []).length && g++ < 20) n = resolveTopOfStack(n); return n; };

describe("the card", () => {
  it("reads native: the Thorn line with his/he, and the Mutant watcher naming the triggering creature", () => {
    const d = detectTriggers(WOLVERINE);
    expect({ tier: classifyCard(WOLVERINE), thorn: mayAssignAsUnblocked(WOLVERINE), trigger: d.map((t) => ({ event: t.event, scope: t.scope, subtype: t.subtypeFilter, effect: t.effectClause })) })
      .toEqual({ tier: "native-trigger", thorn: true, trigger: [{ event: "attacks", scope: "subtypeYouControl", subtype: "Mutant", effect: "double the triggering creature's power until end of turn" }] });
  });
});

describe("⭐ in play", () => {
  it("⭐ each attacking Mutant doubles its OWN power — Wolverine 2 → 4, the Mutant ally 3 → 6 — and the Bear stays 2", () => {
    const s = { ...board([permObj(WOLVERINE, "user", "wolv"), permObj(MUTANT, "user", "mut"), permObj(BEAR, "user", "bear")]),
      combat: { attackers: [attacking("wolv"), attacking("mut"), attacking("bear")] } };
    const fired = checkAttackTriggers(s);
    const out = resolveAll(fired);
    const row = { triggers: (fired.pendingTriggers || []).length, wolverine: [permanentPower(out, "wolv"), permanentToughness(out, "wolv")], mutant: permanentPower(out, "mut"), bear: permanentPower(out, "bear") };
    console.log(`WITNESS wolverineDoubles ${JSON.stringify(row)}`);
    expect(row).toEqual({ triggers: 2, wolverine: [4, 5], mutant: 6, bear: 2 });
  });
  it("⭐ blocked, Wolverine still assigns all of it to the player — 4 after the doubling, nothing to the Wall", () => {
    const s0 = { ...board([permObj(WOLVERINE, "user", "wolv")], [permObj(WALL, "ai", "wall")]), combat: { attackers: [attacking("wolv")] } };
    const doubled = resolveAll(checkAttackTriggers(s0));
    const life = doubled.players.ai.life;
    const out = resolveCombatDamage({ ...doubled, combat: { attackers: [attacking("wolv")], blockers: [{ blockerId: "wall", blockingPlayer: "ai", attackerId: "wolv" }] } });
    expect({ toPlayer: life - out.players.ai.life, toWall: out.players.ai.battlefield.find((p) => p.id === "wall")?.damageMarked || 0 }).toEqual({ toPlayer: 4, toWall: 0 });
  });
});

describe("⚠️ the 'attacks a battle' over-fire, closed", () => {
  it("Thrashing Frontliner no longer pumps when it attacks a player — the battle clause parks, the card reads body-only", () => {
    const s = { ...board([permObj(FRONTLINER, "user", "fl")]), combat: { attackers: [attacking("fl")] } };
    const out = resolveAll(checkAttackTriggers(s));
    const row = { tier: classifyCard(FRONTLINER), triggers: detectTriggers(FRONTLINER).length, power: permanentPower(out, "fl"), toughness: permanentToughness(out, "fl") };
    console.log(`WITNESS frontlinerNoOverfire ${JSON.stringify(row)}`);
    expect(row).toEqual({ tier: "body-only", triggers: 0, power: 2, toughness: 2 });
  });
  it("only the battle tail parks: a plain self-attack pump still reads and fires", () => {
    const plain = { ...FRONTLINER, name: "Plain Swinger", oracle: "Trample\nWhenever this creature attacks, it gets +1/+1 until end of turn." };
    const s = { ...board([permObj(plain, "user", "ps")]), combat: { attackers: [attacking("ps")] } };
    const out = resolveAll(checkAttackTriggers(s));
    expect({ tier: classifyCard(plain), power: permanentPower(out, "ps") }).toEqual({ tier: "native-trigger", power: 3 });
  });
});
