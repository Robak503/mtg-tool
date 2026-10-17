/**
 * vigorGroupPreventPutCounters.test.js — the GROUP prevent-and-put wall (Halfshell heroes shelf, 2026-10-17).
 *
 *   Vigor: "Trample / If damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter
 *   on that creature for each 1 damage prevented this way. / When Vigor is put into a graveyard from anywhere, shuffle it
 *   into its owner's library."
 *
 * THE SEAM: the prevent-and-put family (CAP9 — Panther Habit's attached wall, Ironscale Hydra's self wall) is enforced at
 * the two damage funnels: combatResolution's consultCombat (prevent, then the counters paid after the step through
 * addCounter) and spellEffects.dealDamageToCreature (inline). Vigor is the third scope — every OTHER creature its
 * controller controls, all damage, "that many" counters (CR 615.1a: "prevent" makes it a prevention effect). Read off
 * the battlefield on every hit (combatEvasion.groupPreventPutCounters), so it starts and stops with Vigor itself; Vigor
 * never shields itself ("another"), an opponent's creature, or anything while "Combat damage can't be prevented" holds.
 * Two Vigors prevent the damage once — once it is prevented nothing is left for the second (CR 616.1), so the counters
 * are paid once.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, generated in-session 2026-10-17 — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import * as evasion from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VIGOR = {"name":"Vigor","type":"Creature — Elemental Incarnation","mana":"{3}{G}{G}{G}","cmc":6,"keywords":["Trample"],"colors":["G"],"power":"6","toughness":"6","oracle":"Trample\nIf damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter on that creature for each 1 damage prevented this way.\nWhen Vigor is put into a graveyard from anywhere, shuffle it into its owner's library."};
const STORMWILD_CAPRIDOR = {"name":"Stormwild Capridor","type":"Creature — Bird Goat","mana":"{2}{W}","cmc":3,"keywords":["Flying"],"colors":["W"],"power":"1","toughness":"3","oracle":"Flying\nIf noncombat damage would be dealt to this creature, prevent that damage. Put a +1/+1 counter on this creature for each 1 damage prevented this way."};
const FRENZIED_BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"keywords":["Haste","Trample"],"colors":["G"],"power":"3","toughness":"2","oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"power":"2","toughness":"2","oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"power":"3","toughness":"3","oracle":""};

const counters = (perm) => (perm?.counters?.["+1/+1"]) || 0;
const find = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });

/** user: Vigor(s) + Grizzly Bears; ai1: a Hill Giant (and anything in `aiExtra`). */
function board({ vigors = 1, userExtra = [], aiExtra = [], vigorOwner = "user" } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const vig = Array.from({ length: vigors }, (_, i) => perm(`vigor${i}`, VIGOR, vigorOwner));
  const user = [perm("bears", GRIZZLY_BEARS, "user"), ...(vigorOwner === "user" ? vig : []), ...userExtra];
  const ai1 = [perm("giant", HILL_GIANT, "ai1"), ...(vigorOwner === "ai1" ? vig : []), ...aiExtra];
  return { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai1: { ...s.players.ai1, battlefield: ai1 } } };
}
const bolt = (s, targetId, amount = 3) => applyDamageEffect(s, { controller: "ai1", amount, targetType: "creature", targets: [{ type: "creature", id: targetId }], source: null });
const giantBlockedBy = (s, blockerId) => ({
  ...s,
  combat: { attackers: [{ permanentId: "giant", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId, attackerId: "giant" }] },
});

describe("the reader — one exact sentence, disjoint from the attached and self walls", () => {
  it("Vigor reads as the group wall; the self/attached readers don't claim it, and it doesn't claim theirs", () => {
    expect(evasion.groupPreventPutCountersOf?.(VIGOR)).toBe("another-you-control");
    expect(evasion.selfPreventPutCounters(VIGOR)).toBe(null);
    expect(evasion.attachedPreventPutCountersOf(VIGOR)).toBe(null);
    expect(evasion.groupPreventPutCountersOf?.(STORMWILD_CAPRIDOR) ?? null).toBe(null);
  });
});

describe("noncombat — the damage funnel (applyDamageEffect → dealDamageToCreature)", () => {
  it("⭐ a 3-damage hit on the Bears: no damage marked, three +1/+1 counters", () => {
    const out = bolt(board(), "bears");
    expect(find(out, "user", "bears")).toBeTruthy();
    expect(find(out, "user", "bears").damageMarked || 0).toBe(0);
    expect(counters(find(out, "user", "bears"))).toBe(3);
  });

  it("⛔ \"another\": Vigor itself takes the hit", () => {
    const out = bolt(board(), "vigor0");
    expect(find(out, "user", "vigor0").damageMarked).toBe(3);
    expect(counters(find(out, "user", "vigor0"))).toBe(0);
  });

  it("⛔ \"you control\": an opponent's creature is not shielded by my Vigor, and my Bears not by an opponent's", () => {
    const hitGiant = bolt(board(), "giant", 2);
    expect(find(hitGiant, "ai1", "giant").damageMarked).toBe(2);
    expect(counters(find(hitGiant, "ai1", "giant"))).toBe(0);
    const theirVigor = bolt(board({ vigorOwner: "ai1" }), "bears", 1);
    expect(find(theirVigor, "user", "bears").damageMarked).toBe(1);
    expect(counters(find(theirVigor, "user", "bears"))).toBe(0);
  });

  it("control: without Vigor the Bears die to the hit", () => {
    const out = bolt(board({ vigors: 0 }), "bears");
    expect(find(out, "user", "bears")).toBeUndefined();
  });

  it("two Vigors: the damage is prevented once and pays three counters, not six", () => {
    const out = bolt(board({ vigors: 2 }), "bears");
    expect(counters(find(out, "user", "bears"))).toBe(3);
  });
});

describe("combat — the combat-damage funnel", () => {
  // The blocker is a 3/3 so the Giant's whole 3 is assigned to it: the engine caps a lone blocker's assignment at its
  // lethal need (the banked CR 510.1a finding in preventDamagePutCounters.test.js), which a 2/2 would hit.
  it("⭐ my Hill Giant blocks theirs: no damage marked, three counters after the step; theirs still takes 3", () => {
    const out = resolveCombatDamage(giantBlockedBy(board({ userExtra: [perm("myGiant", HILL_GIANT, "user")] }), "myGiant"));
    const mine = find(out, "user", "myGiant");
    expect(mine).toBeTruthy();
    expect(mine.damageMarked || 0).toBe(0);
    expect(counters(mine)).toBe(3);
    expect(find(out, "ai1", "giant")).toBeUndefined(); // 3 damage to a 3/3 — it died
  });

  it("⭐ the Bears block: they live through the Giant (prevented) and grow", () => {
    const out = resolveCombatDamage(giantBlockedBy(board(), "bears"));
    const bears = find(out, "user", "bears");
    expect(bears).toBeTruthy();
    expect(bears.damageMarked || 0).toBe(0);
    expect(counters(bears)).toBeGreaterThan(0);
  });

  it("⛔ Vigor blocking takes the Giant's damage itself", () => {
    const out = resolveCombatDamage(giantBlockedBy(board(), "vigor0"));
    expect(find(out, "user", "vigor0").damageMarked).toBe(3);
    expect(counters(find(out, "user", "vigor0"))).toBe(0);
  });

  it("⛔ \"Combat damage can't be prevented\" (Frenzied Baloth on the board): the Bears take it and die, no counters", () => {
    const out = resolveCombatDamage(giantBlockedBy(board({ aiExtra: [perm("baloth", FRENZIED_BALOTH, "ai1")] }), "bears"));
    expect(find(out, "user", "bears")).toBeUndefined();
  });
});

describe("the rest of the card", () => {
  it("Vigor put into the graveyard shuffles itself into its owner's library", () => {
    const s0 = board();
    const moved = moveCardToZone(s0, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "vigor0" });
    let s = flushTriggers(moved, { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 4 && s.stack.length; i++) s = resolveTopOfStack(s);
    expect(s.players.user.graveyard.some((c) => c.name === "Vigor")).toBe(false);
    expect(s.players.user.library.some((c) => c.name === "Vigor")).toBe(true);
  });

  it("classification: Vigor is native; a ridered variant of the wall stays body-only", () => {
    expect(classifyCard(VIGOR)).toBe("native-mixed");
    const ridered = { ...VIGOR, oracle: VIGOR.oracle.replace("for each 1 damage prevented this way.", "for each 1 damage prevented this way. You lose 1 life.") };
    expect(classifyCard(ridered)).toBe("body-only");
  });

  it("⛔ the wall intact but another line unmodeled: body-only (all or nothing)", () => {
    const otherLine = { ...VIGOR, oracle: VIGOR.oracle.replace("shuffle it into its owner's library.", "each player reveals their hand.") };
    expect(evasion.groupPreventPutCountersOf?.(otherLine)).toBe("another-you-control");
    expect(classifyCard(otherLine)).toBe("body-only");
  });

  it("⛔ a rider after the two sentences is another wall: not read, so not enforced either", () => {
    const ridered = { ...VIGOR, oracle: VIGOR.oracle.replace("for each 1 damage prevented this way.", "for each 1 damage prevented this way. You lose 1 life.") };
    expect(evasion.groupPreventPutCountersOf ? evasion.groupPreventPutCountersOf(ridered) : "no reader on this engine").toBe(null);
    const s0 = board({ vigors: 0, userExtra: [perm("riderVigor", ridered, "user")] });
    expect(find(bolt(s0, "bears"), "user", "bears")).toBeUndefined();
  });
});
