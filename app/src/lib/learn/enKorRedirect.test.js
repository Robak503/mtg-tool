/**
 * enKorRedirect.test.js — CORPUS ④-H (2026-09-03 night): the en-Kor cycle — "{0}: The next 1 damage that would be
 * dealt to this creature this turn is dealt to target creature you control instead." (Warrior / Nomads / Lancers /
 * Spirit / Outrider / Shaman en-Kor.) The self-referent prevent-next-N shield gains a `redirectTo`; both damage
 * funnels (the noncombat hit, the combat pool) deal the consumed amount to the redirect creature instead. Choosing
 * the source itself is a no-op. Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WARRIOR = { id: "c-wek", name: "Warrior en-Kor", type: "Creature — Kor Warrior Knight", mana: "{1}{W}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "{0}: The next 1 damage that would be dealt to this creature this turn is dealt to target creature you control instead." };
const BEAR = { id: "c-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const PINGER = { id: "c-png", name: "Synthetic Pinger", type: "Creature — Human Wizard", mana: "{2}{R}", cmc: 3, power: 1, toughness: 1, keywords: [], oracle: "{T}: This creature deals 1 damage to any target." };
const OGRE = { id: "c-ogre", name: "Synthetic Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [], oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "wek", card: WARRIOR, controller: "user", summoningSick: false }), createPermanent({ id: "bear", card: BEAR, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "pinger", card: PINGER, controller: "ai", summoningSick: false }), createPermanent({ id: "ogre", card: OGRE, controller: "ai", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
    },
  };
}
const dmg = (s, seat, id) => s.players[seat].battlefield.find((p) => p.id === id)?.damageMarked || 0;
function shieldOnto(s, targetId) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "wek" && (a.targets || []).some((t) => t.id === targetId));
  expect(act, `the {0} ability is offered at ${targetId}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}
function pingWarrior(s) {
  const st = { ...s, activePlayer: "ai", priorityHolder: "ai" }; // the AI activates on its own turn (the engine offers its abilities there)
  const act = legalActionsForPlayer(st, "ai").find((a) => a.kind === "activate-ability" && a.permanentId === "pinger" && (a.targets || []).some((t) => t.id === "wek"));
  expect(act, "the pinger is offered at the Warrior").toBeTruthy();
  return resolveTopOfStack(dispatchAction(st, act));
}

describe("the parse + the tier", () => {
  it("the clause becomes the self shield with a chosen redirect creature; Warrior en-Kor is native", () => {
    const p = parseEffectClause("The next 1 damage that would be dealt to this creature this turn is dealt to target creature you control instead.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "prevent-next-damage", amount: 1, target: "self", redirect: true, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] });
    expect(classifyCard(WARRIOR)).toMatch(/^native/);
  });
});

describe("runtime", () => {
  it("⭐ noncombat: a shielded Warrior pinged for 1 takes nothing — the Bear takes it", () => {
    const shielded = shieldOnto(board(), "bear");
    expect(shielded.preventionShields.some((sh) => sh.targetId === "wek" && sh.redirectTo === "bear" && sh.amount === 1)).toBe(true);
    const out = pingWarrior(shielded);
    expect(dmg(out, "user", "wek")).toBe(0);
    expect(dmg(out, "user", "bear")).toBe(1);
    // The shield is spent: a second ping lands on the Warrior.
    const untapped = { ...out, players: { ...out.players, ai: { ...out.players.ai, battlefield: out.players.ai.battlefield.map((p) => (p.id === "pinger" ? { ...p, tapped: false } : p)) } } };
    const again = pingWarrior(untapped);
    expect(dmg(again, "user", "wek")).toBe(1);
    expect(dmg(again, "user", "bear")).toBe(1);
  });
  it("⭐ combat: the shielded Warrior blocks the 2/2 — 1 is redirected to the Bear, the other 1 lands on the Warrior", () => {
    const shielded = shieldOnto(board(), "bear");
    const combat = { ...shielded, phase: "combat", step: "combat-damage", activePlayer: "ai", combat: { attackers: [{ permanentId: "ogre", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "wek", blockingPlayer: "user", attackerId: "ogre" }] } };
    const out = resolveCombatDamage(combat);
    expect(dmg(out, "user", "wek")).toBe(1);
    expect(dmg(out, "user", "bear")).toBe(1);
    expect(out.players.user.life).toBe(20);
  });
  it("choosing the Warrior itself makes no shield; without a shield the ping lands on the Warrior", () => {
    const self = shieldOnto(board(), "wek");
    expect((self.preventionShields || []).length).toBe(0);
    const out = pingWarrior(board());
    expect(dmg(out, "user", "wek")).toBe(1);
    expect(dmg(out, "user", "bear")).toBe(0);
  });
});
