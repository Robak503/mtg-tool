/**
 * diesDamageByPower.test.js — CORPUS ④-B (2026-09-03 night): "When this creature dies, it deals damage equal to its
 * power to each opponent / any target" (Heartfire Hero, Flaming Tyrannosaurus / Balduvian Berserker, Cacophony Scamp —
 * the census's two dies-damage shapes). The self-dies rewrite maps "its power" to the dying-creature sentinel and the
 * damage parser binds it to countContext:"dyingPower" — the CR 603.6e look-back number checkDiesTriggers stamps —
 * never a live read of a creature that has left. Real oracle fixtures (bundled Scryfall snapshot, 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HERO = { id: "c-hero", name: "Heartfire Hero", type: "Creature — Mouse Soldier", mana: "{R}", cmc: 1, power: 1, toughness: 1, keywords: [], oracle: "Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, put a +1/+1 counter on it.\nWhen this creature dies, it deals damage equal to its power to each opponent." };
const REX = { id: "c-rex", name: "Flaming Tyrannosaurus", type: "Creature — Dinosaur", mana: "{5}{R}{R}", cmc: 7, power: 6, toughness: 6, keywords: ["Menace"], oracle: "Menace\nParadox — Whenever you cast a spell from anywhere other than your hand, this creature deals 3 damage to any target. Then put a +1/+1 counter on this creature.\nWhen this creature dies, it deals damage equal to its power to each opponent." };
const ANY = { id: "c-any", name: "Synthetic Martyr", type: "Creature — Kor Berserker", mana: "{2}{R}", cmc: 3, power: 3, toughness: 2, keywords: [], oracle: "When this creature dies, it deals damage equal to its power to any target." };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "bear", card: { id: "c-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "ai" })] },
    },
  };
}

describe("the parse + the tiers", () => {
  it("the self-dies rewrite yields the dying-creature sentinel; the damage parser binds it to the look-back key", () => {
    const d = detectTriggers(HERO).find((x) => x.event === "dies");
    expect(d.effectClause).toBe("it deals damage equal to the dying creature's power to each opponent");
    const p = parseEffectClause(d.effectClause, "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", countContext: "dyingPower", targetType: "eachOpponent" }]);
    const a = parseEffectClause("it deals damage equal to the dying creature's power to any target", "Creature");
    expect(a.atoms).toEqual([{ op: "deal-damage", countContext: "dyingPower", targetType: "any" }]);
    // A NON-self / non-dies carrier of the same words is never rewritten (the referent would be ambiguous).
    expect(parseEffectClause("it deals damage equal to its power to each opponent", "Creature").confidence).toBe("low");
    // An ETB carrying the same words must NOT get the dying sentinel (the creature is on the battlefield then —
    // a look-back read would be the wrong object): the rewrite is pinned to the dies event.
    const ETB = { id: "c-etb", name: "Synthetic Arrival", type: "Creature — Ogre", mana: "{3}{R}", power: 4, toughness: 4, keywords: [], oracle: "When this creature enters, it deals damage equal to its power to each opponent." };
    const e = detectTriggers(ETB).find((x) => x.event === "etb");
    expect(e).toBeTruthy();
    expect(String(e.effectClause)).not.toContain("dying creature");
  });
  it("Heartfire Hero and Flaming Tyrannosaurus are native; the any-target shape too", () => {
    expect(classifyCard(HERO)).toMatch(/^native/);
    expect(classifyCard(REX)).toMatch(/^native/);
    expect(classifyCard(ANY)).toMatch(/^native/);
  });
});

describe("runtime — the look-back power, never a live read", () => {
  it("⭐ a 4-power Hero (pumped, then dead) deals 4 to the opponent; with no captured power it deals nothing", () => {
    const s = board();
    const dead = { controller: "user", id: "hero", name: "Heartfire Hero", card: HERO, counters: { "+1/+1": 3 }, power: 4, basePower: 1 };
    const out = resolveTopOfStack(flushTriggers(checkDiesTriggers(s, [dead])));
    expect(out.players.ai.life).toBe(16);
    expect(out.players.user.life).toBe(20);
    const noPower = { controller: "user", id: "hero2", name: "Heartfire Hero", card: HERO, counters: {} };
    const fired = checkDiesTriggers(s, [noPower]);
    const out2 = fired.pendingTriggers?.length ? resolveTopOfStack(flushTriggers(fired)) : fired;
    expect(out2.players.ai.life).toBe(20);
  });
  it("⭐ the any-target shape aims the look-back power at a chosen target (the flush picks one)", () => {
    const s = board();
    const dead = { controller: "user", id: "martyr", name: "Synthetic Martyr", card: ANY, counters: {}, power: 3, basePower: 3 };
    const flushed = flushTriggers(checkDiesTriggers(s, [dead]));
    const trig = flushed.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect((trig.targets || []).length).toBe(1);
    const out = resolveTopOfStack(flushed);
    const bear = out.players.ai.battlefield.find((p) => p.id === "bear");
    const dealtToPlayer = 20 - out.players.ai.life;
    const bearDied = !bear;
    expect(dealtToPlayer === 3 || bearDied).toBe(true);
  });
});
