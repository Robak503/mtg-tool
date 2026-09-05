/**
 * HOT SOUP — SHELF-85 · Bumble Flower F6 (2026-09-05). "Equipped creature can't be blocked. / Whenever equipped creature is
 * dealt damage, destroy it. / Equip {3}". The unblockable grant and the Equip were already modelled; the trigger had no
 * condition arm for the EQUIPPED scope on the dealt-damage event, and "destroy it" had no rewrite to the triggering-creature
 * destroy sentinel on that scope. The dealt-damage checker already offers the attached Equipment as a watcher with the
 * damaged creature as the triggering permanent; scopeMatches' equippedCreature rule reads the attachment (CR 301.5).
 *
 * Mutation-checked: see the run ledger (docs-sk68).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, checkDealtDamageTriggers } from "./triggers.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SOUP = { name: "Hot Soup", type: "Artifact — Equipment", mana: "{1}", keywords: [], oracle: "Equipped creature can't be blocked.\nWhenever equipped creature is dealt damage, destroy it.\nEquip {3}" };
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const bear = (id, extra) => perm(id, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, extra);
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const soup = perm("soup", SOUP, { attachedTo: "b1" });
  const b1 = bear("b1", { attachments: ["soup"], toughness: 5 });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", players: { ...b.players, user: { ...b.players.user, battlefield: [soup, b1, bear("b2")] } } };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const bf = (s) => s.players.user.battlefield.map((p) => p.id).sort();

describe("detect + classify", () => {
  it("the trigger detects as dealtDamage on the EQUIPPED scope with the destroy-the-triggering-creature effect; the card classifies native", () => {
    const d = detectTriggers(SOUP).map((x) => [x.event, x.scope, x.effectClause]);
    const row = { d, tier: classifyCard(SOUP) };
    console.log("  WITNESS soupDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toEqual([["dealtDamage", "equippedCreature", "destroy the triggering creature"]]);
    expect(row.tier).toMatch(/^native-/);
  });
  it("the rewrite is EXACT-clause gated: a trailing rider ('destroy it. You gain 2 life.') keeps its text and the card stays parked — never a silently dropped rider", () => {
    const RIDER = { ...SOUP, name: "Hotter Soup", oracle: "Whenever equipped creature is dealt damage, destroy it. You gain 2 life.\nEquip {3}" };
    const d = detectTriggers(RIDER).map((x) => [x.event, x.scope, x.effectClause]);
    const row = { d, tier: classifyCard(RIDER) };
    console.log("  WITNESS soupRider", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d.length).toBe(1);
    expect(row.d[0][2]).toMatch(/you gain 2 life/i);       // the rider survived the rewrite stage
    expect(row.d[0][2]).not.toBe("destroy the triggering creature");
    expect(row.tier).not.toMatch(/^native-/);              // and the card parks (CREED — no partial)
  });
});

describe("the trigger at runtime", () => {
  it("damage to the EQUIPPED bear fires Hot Soup and the bear is destroyed (the Equipment stays); damage to the other bear fires nothing", () => {
    const s0 = state();
    const equipped = settle(checkDealtDamageTriggers(s0, [{ creatureId: "b1", amount: 1 }]));
    const other = settle(checkDealtDamageTriggers(s0, [{ creatureId: "b2", amount: 1 }]));
    const row = { equipped: bf(equipped), other: bf(other), equippedGy: equipped.players.user.graveyard.map((c) => c.name) };
    console.log("  WITNESS soupResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.equipped).toEqual(["b2", "soup"]);
    expect(row.equippedGy).toEqual(["Grizzly Bears"]);
    expect(row.other).toEqual(["b1", "b2", "soup"]);
  });
});
