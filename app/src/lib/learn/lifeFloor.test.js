/**
 * lifeFloor.test.js — "Damage that would reduce your life total to less than 1 reduces it to 1 instead." (Ali from Cairo,
 * Sustaining Spirit, Fortune Thief; Worship's "If you control a creature, …") — the 09-06 plan's stage ③, census row ⑩,
 * 2026-09-30.
 *
 * A replacement on the controller's life total (CR 614.1a), enforced at gameState.loseLife — the single life-loss
 * chokepoint — for DAMAGE losses only (both damage callers pass `combatDamage`; no other loss does). The damage itself is
 * dealt in full (CR 120.3a): lifelink and the dealt-damage ledger see all of it; only the life actually lost is counted as
 * lost (the life-lost ledger, the life-loss watcher Exquisite Blood rides, the speed bump). A drain or a pay-life cost still
 * goes below 1, and a player already at 0 or less gets no help. Both are the cards' printed rulings (bundled Scryfall
 * rulings.json), as is Ali's: a floor that dies in the same damage event as the hit still applies.
 *
 * Documented under-application: a pain land's "deals 1 damage to you" reaches loseLife unmarked, so it is not floored.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, destroyLethalCreatures, loseLife, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";
import { lifeFloorOf } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const FLOOR_LINE = "Damage that would reduce your life total to less than 1 reduces it to 1 instead.";
const ALI = { name: "Ali from Cairo", type: "Creature — Human", mana: "{2}{R}{R}", power: 0, toughness: 1, oracle: FLOOR_LINE };
const SPIRIT = { name: "Sustaining Spirit", type: "Creature — Angel Spirit", mana: "{1}{W}", power: 0, toughness: 3, keywords: ["Cumulative upkeep"],
  oracle: `Cumulative upkeep {1}{W} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\n${FLOOR_LINE}` };
const THIEF = { name: "Fortune Thief", type: "Creature — Human Rogue", mana: "{4}{R}", power: 0, toughness: 1, keywords: ["Morph"],
  oracle: `${FLOOR_LINE}\nMorph {R}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)` };
const WORSHIP = { name: "Worship", type: "Enchantment", mana: "{3}{W}",
  oracle: "If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead." };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", power: 6, toughness: 4, oracle: "" };
const NIGHTHAWK = { name: "Vampire Nighthawk", type: "Creature — Vampire Shaman", mana: "{1}{B}{B}", power: 2, toughness: 3,
  keywords: ["Deathtouch", "Flying", "Lifelink"],
  oracle: "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });

function game({ user = [], ai = [], aiLife = 20, userLife = 20 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: [BOLT], life: userLife, manaPool: { ...s.players.user.manaPool, R: 1 } },
      ai: { ...s.players.ai, battlefield: ai, life: aiLife } } };
}
// Lightning Bolt from the user's hand at the AI player, run for real (legal action → dispatch → resolve).
function boltAi(s) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && (a.targets || []).some((t) => t.id === "ai"));
  expect(act).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}
// Unblocked combat damage from the user's attackers to the AI.
function swing(s, attackerIds) {
  return resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage",
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } });
}

describe("classification", () => {
  it("Ali from Cairo, Sustaining Spirit, Fortune Thief, Worship → native-static", () => {
    for (const card of [ALI, SPIRIT, THIEF, WORSHIP]) expect(classifyCard(card), card.name).toBe("native-static");
  });

  it("the reader: a floor of 1, Worship's creature condition; another floor stays residue", () => {
    expect(lifeFloorOf(ALI)).toEqual({ lifeFloor: 1 });
    expect(lifeFloorOf(WORSHIP)).toEqual({ lifeFloor: 1, ifControlCreature: true });
    expect(lifeFloorOf({ name: "Elderscale Wurm", type: "Creature — Wurm", oracle: "As long as you have 7 or more life, damage that would reduce your life total to less than 7 reduces it to 7 instead." })).toBe(null);
  });
});

describe("RUNTIME — damage stops at 1", () => {
  it("VACUITY CONTROL — Lightning Bolt takes the AI from 3 to 0", () => {
    expect(boltAi(game({ aiLife: 3 })).players.ai.life).toBe(0);
  });

  it("⭐ with Ali from Cairo the same Bolt leaves the AI at 1 — 3 damage dealt, 2 life lost", () => {
    const out = boltAi(game({ ai: [perm(ALI, "ali", "ai")], aiLife: 3 }));
    const ai = out.players.ai;
    expect([ai.life, ai.damageTakenThisTurn, ai.lifeLostThisTurn]).toEqual([1, 3, 2]);
    expect(out.log.some((e) => e.kind === "life-floor" && e.playerId === "ai" && e.damage === 3 && e.lifeLost === 2)).toBe(true);
    console.log(`WITNESS aliBolt life ${ai.life} · damage ${ai.damageTakenThisTurn} · lost ${ai.lifeLostThisTurn}`);
  });

  it("⭐ COMBAT — Craw Wurm unblocked at the AI on 2 life: 1; and Vampire Nighthawk's lifelink still gains the FULL damage", () => {
    expect(swing(game({ user: [perm(WURM, "w", "user")], ai: [perm(ALI, "ali", "ai")], aiLife: 2 }), ["w"]).players.ai.life).toBe(1);
    const out = swing(game({ user: [perm(NIGHTHAWK, "n", "user")], ai: [perm(ALI, "ali", "ai")], aiLife: 1 }), ["n"]);
    expect([out.players.ai.life, out.players.user.life]).toEqual([1, 22]);
    console.log(`WITNESS lifelinkIntoFloor ai ${out.players.ai.life} · user ${out.players.user.life}`);
  });

  it("⭐ SIMULTANEOUS (the Ali ruling): Ali blocks and dies in the same damage step that hits the AI — the floor still holds", () => {
    const s = { ...game({ user: [perm(BEARS, "b", "user"), perm(WURM, "w", "user")], ai: [perm(ALI, "ali", "ai")], aiLife: 2 }),
      phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "b", attackingPlayer: "user", defender: "ai" }, { permanentId: "w", attackingPlayer: "user", defender: "ai" }],
        blockers: [{ blockerId: "ali", blockingPlayer: "ai", attackerId: "b" }] } };
    const out = destroyLethalCreatures(resolveCombatDamage(s)).state;
    expect(out.players.ai.life).toBe(1);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Ali from Cairo");
  });

  it("⭐ at 1 life a Bolt changes nothing: no life lost, and the life-lost ledger stays empty", () => {
    const out = boltAi(game({ ai: [perm(SPIRIT, "sp", "ai")], aiLife: 1 }));
    expect([out.players.ai.life, out.players.ai.lifeLostThisTurn || 0, out.players.ai.damageTakenThisTurn]).toEqual([1, 0, 3]);
  });

  it("⭐ what the floor changes is the life LOST: Exquisite Blood gains the 2 the AI lost, not the 3 it was dealt", () => {
    const BLOOD = { name: "Exquisite Blood", type: "Enchantment", mana: "{4}{B}", oracle: "Whenever an opponent loses life, you gain that much life." };
    let out = boltAi(game({ user: [perm(BLOOD, "eb", "user")], ai: [perm(ALI, "ali", "ai")], aiLife: 3 }));
    for (let i = 0; i < 4 && (out.stack || []).length; i++) out = resolveTopOfStack(out);
    expect([out.players.ai.life, out.players.user.life]).toEqual([1, 22]);
    console.log(`WITNESS exquisiteBloodSeesLoss ai ${out.players.ai.life} · user ${out.players.user.life}`);
  });

  it("⭐ …and so does Start your engines!: no life lost at 1, no speed", () => {
    const withSpeed = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, speed: 1 } } });
    expect(boltAi(withSpeed(game({ ai: [perm(ALI, "ali", "ai")], aiLife: 3 }))).players.user.speed).toBe(2);   // lost 2 → speed
    expect(boltAi(withSpeed(game({ ai: [perm(ALI, "ali", "ai")], aiLife: 1 }))).players.user.speed).toBe(1);   // lost 0 → none
  });

  it("⭐ Worship needs a creature: with Grizzly Bears the AI stays at 1; with Worship alone it goes to 0", () => {
    expect(boltAi(game({ ai: [perm(WORSHIP, "wor", "ai"), perm(BEARS, "b", "ai")], aiLife: 3 })).players.ai.life).toBe(1);
    expect(boltAi(game({ ai: [perm(WORSHIP, "wor", "ai")], aiLife: 3 })).players.ai.life).toBe(0);
  });

  it("⛔ only its CONTROLLER's life: the user's Ali doesn't save the AI", () => {
    expect(boltAi(game({ user: [perm(ALI, "ali", "user")], aiLife: 3 })).players.ai.life).toBe(0);
  });

  it("⛔ a face-down Fortune Thief has no abilities (CR 708.2); face up, it floors", () => {
    const faceDown = { ...perm({ id: "fd-c", name: "", power: 2, toughness: 2, type: "Creature", keywords: [], faceDown: true }, "fd", "ai"),
      faceDown: true, faceUpCard: THIEF };
    expect(boltAi(game({ ai: [faceDown], aiLife: 3 })).players.ai.life).toBe(0);
    expect(boltAi(game({ ai: [perm(THIEF, "th", "ai")], aiLife: 3 })).players.ai.life).toBe(1);
  });

  it("⛔ a loss that isn't damage is not floored — the chokepoint's damage discriminator (the printed rulings)", () => {
    const s = game({ ai: [perm(ALI, "ali", "ai")], aiLife: 2 });
    expect(loseLife(s, { playerId: "ai", amount: 3 }).players.ai.life).toBe(-1);                      // a drain / pay-life
    expect(loseLife(s, { playerId: "ai", amount: 3, combatDamage: false }).players.ai.life).toBe(1);  // damage
  });

  it("⛔ already at 0 or less, the floor doesn't apply — the damage is taken in full (Sustaining Spirit / Fortune Thief rulings)", () => {
    const s = game({ ai: [perm(SPIRIT, "sp", "ai")], aiLife: 0 });
    expect(loseLife(s, { playerId: "ai", amount: 2, combatDamage: false }).players.ai.life).toBe(-2);
  });
});
