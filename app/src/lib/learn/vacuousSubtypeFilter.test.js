/**
 * vacuousSubtypeFilter.test.js — THE VACUOUS-FILTER CLASS, pinned.
 *
 * A trigger descriptor can carry `subtypeFilter: "Goblin"`, and the runtime gate (subtypeFilterMatches)
 * enforces it as a substring of the triggering permanent's TYPE LINE. When the minted string is not a real
 * printed subtype the gate can never be satisfied, and the failure mode is the worst one this project has:
 *
 *     the card classifies NATIVE  ·  the trigger never fires  ·  no tier and no per-card diff can see it
 *
 * Nothing MOVES — the card was already native and stays native — so only a board or a vocabulary check finds
 * it. `app/scripts/probe-vacuous-subtype-filters.mjs` is that vocabulary check (it derives the real subtype
 * set from printed type lines); these are the unit pins for the three defects it found, and they are written
 * as RUNTIME assertions rather than tier assertions, per the standing rule that a tier is not evidence about
 * a board.
 *
 * The three, all verified firing ZERO before the fix:
 *   • "commander"  — a DESIGNATION (CR 903.3), not a type-line word. Norn's Choirmaster #3286 (etb+attacks)
 *                    and Keleth #6637 (attacks). Now routed to `commanderYouControl`, the scope that already
 *                    enforced this correctly for combat damage (Kediss).
 *   • "outlaw"     — a CR 203.4c UMBRELLA over five subtypes. Rakish Crew. Now expands to the list.
 *   • "Allie"      — the naive `-s` strip applied to the irregular plural "Allies". Invasion Tactics #13305.
 *                    Now singularized through the closed CR_CREATURE_TYPES vocabulary.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkEnterTriggers, checkAttackTriggers, checkDiesTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CHOIRMASTER = {
  id: "norn", name: "Norn's Choirmaster", type: "Creature — Phyrexian Cleric", power: 2, toughness: 3,
  oracle: "Flying, first strike\nWhenever a commander you control enters or attacks, proliferate.",
};
// gameState stamps card.isCommander at seat setup; fixtures mirror that stamp.
const cmdrCard = (over = {}) => ({ id: "cmdr", name: "Test Commander", type: "Legendary Creature — Elf Warrior", power: 3, toughness: 3, oracle: "", isCommander: true, ...over });

function boardWith(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}

describe("COMMANDER is a designation, not a subtype (CR 903.3)", () => {
  it("the ETB descriptor takes commanderYouControl — NOT a subtypeFilter of \"Commander\"", () => {
    const d = detectTriggers(CHOIRMASTER).find((t) => t.event === "etb");
    expect(d).toMatchObject({ event: "etb", scope: "commanderYouControl" });
    expect(d.subtypeFilter).toBeUndefined();
  });

  it("the ATTACKS descriptor likewise", () => {
    const d = detectTriggers(CHOIRMASTER).find((t) => t.event === "attacks");
    expect(d).toMatchObject({ event: "attacks", scope: "commanderYouControl" });
    expect(d.subtypeFilter).toBeUndefined();
  });

  it("⭐ RUNTIME — a commander ENTERING actually fires it (it fired 0 while classifying native)", () => {
    const watcher = createPermanent({ id: "norn", card: CHOIRMASTER, controller: "user" });
    const cmdr = { ...createPermanent({ id: "cmdrp", card: cmdrCard(), controller: "user" }), summoningSick: false };
    const after = checkEnterTriggers(boardWith([watcher, cmdr]), cmdr);
    expect((after.pendingTriggers || []).length).toBe(1);
  });

  it("⭐ RUNTIME — a commander ATTACKING actually fires it", () => {
    const watcher = createPermanent({ id: "norn", card: CHOIRMASTER, controller: "user" });
    const cmdr = { ...createPermanent({ id: "cmdrp", card: cmdrCard(), controller: "user" }), summoningSick: false };
    const board = {
      ...boardWith([watcher, cmdr]), phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "cmdrp", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    };
    expect((checkAttackTriggers(board).pendingTriggers || []).length).toBe(1);
  });

  it("⭐ Keleth's \"put a +1/+1 counter on IT\" still binds to the attacker — the pronoun scope came along", () => {
    // The tier diff caught this: routing commander-scoped triggers off the (vacuous) subtype path dropped
    // Keleth to body-only, because NONSELF_TRIGGERING_SCOPES gates the "it" → triggering-creature rewrite.
    // Fixing only the scope would have swapped a silent no-op for a silent park.
    const keleth = {
      id: "kel", name: "Keleth, Sunmane Familiar", type: "Legendary Creature — Cat Dragon", power: 0, toughness: 0,
      oracle: "Whenever a commander you control attacks, put a +1/+1 counter on it.\nPartner (You can have two commanders if both have partner.)",
    };
    const d = detectTriggers(keleth).find((t) => t.event === "attacks");
    expect(d.scope).toBe("commanderYouControl");
    expect(d.effectClause).toMatch(/the triggering creature/);
  });

  it("⭐ CREED — a NON-commander creature entering does NOT fire it (the scope is real, not a rubber stamp)", () => {
    const watcher = createPermanent({ id: "norn", card: CHOIRMASTER, controller: "user" });
    const plain = { ...createPermanent({ id: "bear", card: cmdrCard({ id: "b", name: "Bear", isCommander: false }), controller: "user" }), summoningSick: false };
    const after = checkEnterTriggers(boardWith([watcher, plain]), plain);
    expect((after.pendingTriggers || []).length).toBe(0);
  });

  it("⭐ CREED — an OPPONENT'S commander entering does NOT fire it (\"you control\" is enforced)", () => {
    const watcher = createPermanent({ id: "norn", card: CHOIRMASTER, controller: "user" });
    const theirs = { ...createPermanent({ id: "oc", card: cmdrCard(), controller: "ai" }), summoningSick: false };
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const board = {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [watcher] },
        ai: { ...s.players.ai, battlefield: [theirs] },
      },
    };
    expect((checkEnterTriggers(board, theirs).pendingTriggers || []).length).toBe(0);
  });
});

describe("OUTLAW is an umbrella term (CR 203.4c), not a type-line word", () => {
  const RAKISH = {
    id: "rc", name: "Rakish Crew", type: "Enchantment",
    oracle: "Whenever an outlaw you control dies, each opponent loses 1 life and you gain 1 life.",
  };

  it("expands to the five constituent subtypes rather than minting the literal \"Outlaw\"", () => {
    const d = detectTriggers(RAKISH).find((t) => t.event === "dies");
    expect(d.subtypeFilter).toEqual(["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"]);
  });

  it("⭐ RUNTIME — a Rogue dying fires it", () => {
    const watcher = createPermanent({ id: "rc", card: RAKISH, controller: "user" });
    const rogue = createPermanent({ id: "r1", card: { id: "r", name: "Sneak", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "" }, controller: "user" });
    const after = checkDiesTriggers(boardWith([watcher]), [{ ...rogue, controller: "user" }]);
    expect((after.pendingTriggers || []).length).toBe(1);
  });

  it("⭐ CREED — a creature of NO outlaw subtype dying does not fire it", () => {
    const watcher = createPermanent({ id: "rc", card: RAKISH, controller: "user" });
    const bear = createPermanent({ id: "b1", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const after = checkDiesTriggers(boardWith([watcher]), [{ ...bear, controller: "user" }]);
    expect((after.pendingTriggers || []).length).toBe(0);
  });
});

describe("IRREGULAR PLURALS resolve through the closed vocabulary, never a naive -s strip", () => {
  const batch = (subject) => detectTriggers({
    id: "x", name: "X", type: "Enchantment",
    oracle: `Whenever one or more ${subject} you control deal combat damage to a player, draw a card.`,
  }).find((t) => t.event === "combatDamageBatch");

  it("\"Allies\" → Ally (it minted the unmatchable \"Allie\" — Invasion Tactics #13305)", () => {
    expect(batch("Allies").subtypeFilter).toBe("Ally");
  });

  it("\"Elves\" → Elf", () => {
    expect(batch("Elves").subtypeFilter).toBe("Elf");
  });

  it("\"Wolves\" → Wolf", () => {
    expect(batch("Wolves").subtypeFilter).toBe("Wolf");
  });

  it("the REGULAR case is untouched — \"Goblins\" → Goblin", () => {
    expect(batch("Goblins").subtypeFilter).toBe("Goblin");
  });

  it("an already-singular invariant type survives — \"Merfolk\" → Merfolk", () => {
    expect(batch("Merfolk").subtypeFilter).toBe("Merfolk");
  });
});
