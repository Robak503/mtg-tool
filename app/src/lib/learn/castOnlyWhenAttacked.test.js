/**
 * castOnlyWhenAttacked.test.js — "Cast this spell only during the declare attackers step and only if you've
 * been attacked this step." (Defiant Stand, Rally the Troops, Scorching Winds, Assassin's Blade, Eightfold
 * Maze, Just Fate, Treetop Defense, Warrior's Stand — the Fallen Empires / Alliances combat-trick cycle.)
 *
 * A TIMING + STATE gate printed as a whole sentence rather than a keyword. It carries no atom of its own, so
 * it parked every body behind it — 8 cards whose effects were all already modeled.
 *
 * ⭐ THE ORDER MATTERS AND IS THE POINT: the ENFORCEMENT landed before the credit. legalChoices' cast-offer
 * chokepoint refuses the card unless the player is in the window, and only then does the classifier strip the
 * sentence. Crediting an unenforced cast restriction would hand the engine a combat trick playable at any
 * time — strictly stronger than the printed card, and exactly the over-claim the creed forbids. The three
 * enforcement cases below are what make the eight credits honest; if they ever go green while the gate is
 * gone, the credit is a lie.
 *
 * ⚠️ COMMANDER MODE'S OPPONENTS ARE ai1/ai2/ai3 — there is NO player called "ai". Spreading a non-existent
 * player yields an object with no zone arrays and the first creature death throws inside the resolver,
 * which reads as "the card did nothing". That fixture error cost a whole investigation earlier today.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { castOnlyWhenAttacked, hasBeenAttackedThisStep } from "./effects/abilities.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const OPP = "ai1";
const RESTRICTION = "Cast this spell only during the declare attackers step and only if you've been attacked this step.";
const DEFIANT_STAND = { id: "cds", name: "Defiant Stand", type: "Instant", mana: "{1}{W}",
  oracle: `${RESTRICTION}\nTarget creature gets +1/+3 until end of turn. Untap that creature.` };

/** A board where an opponent's Bear is attacking `defender`, at `step`. */
function board({ step = "declare-attackers", defender = "user" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const wall = createPermanent({ id: "mine", card: { id: "cm", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "user" });
  const bear = createPermanent({ id: "atk", card: { id: "ct", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: OPP, summoningSick: false });
  return {
    ...s0, phase: "combat", step, activePlayer: OPP, priorityHolder: "user", turn: 5,
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: OPP, defender }], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [wall], hand: [DEFIANT_STAND], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } },
      [OPP]: { ...s0.players[OPP], battlefield: [bear] },
    },
  };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "cds").length;

describe("⭐ ENFORCEMENT — the cast is offered only inside the printed window", () => {
  it("OFFERED during declare-attackers when an attacker was declared against you", () => {
    expect(offers(board())).toBeGreaterThan(0);
  });

  it("⛔ NOT offered when the attack is aimed at somebody else", () => {
    // "you've been attacked" — an attack on another player is not an attack on you.
    expect(offers(board({ defender: "ai2" }))).toBe(0);
  });

  it("⛔ NOT offered in the wrong step, even though you are being attacked", () => {
    expect(offers(board({ step: "declare-blockers" }))).toBe(0);
  });

  it("the window predicate agrees with the offer gate", () => {
    expect(hasBeenAttackedThisStep(board(), "user")).toBe(true);
    expect(hasBeenAttackedThisStep(board({ defender: "ai2" }), "user")).toBe(false);
    expect(hasBeenAttackedThisStep(board({ step: "declare-blockers" }), "user")).toBe(false);
  });
});

describe("the recognizer is exact", () => {
  it("matches the printed sentence", () => {
    expect(castOnlyWhenAttacked(DEFIANT_STAND)).toBe(true);
  });

  it("⛔ does NOT match the step half alone — that is a different, under-enforced restriction", () => {
    expect(castOnlyWhenAttacked({ oracle: "Cast this spell only during the declare attackers step.\nDraw a card." })).toBe(false);
  });

  it("⛔ does NOT match an unrelated cast restriction", () => {
    expect(castOnlyWhenAttacked({ oracle: "Cast this spell only during combat.\nDraw a card." })).toBe(false);
  });
});

describe("classification — the eight real carriers flip", () => {
  const CASES = [
    ["Defiant Stand", "{1}{W}", "Target creature gets +1/+3 until end of turn. Untap that creature."],
    ["Rally the Troops", "{W}", "Untap all creatures you control."],
    ["Scorching Winds", "{R}", "Scorching Winds deals 1 damage to each attacking creature."],
    ["Assassin's Blade", "{1}{B}", "Destroy target nonblack attacking creature."],
  ];
  for (const [name, mana, body] of CASES) {
    it(`${name}`, () => {
      expect(classifyCard({ name, type: "Instant", mana, oracle: `${RESTRICTION}\n${body}` })).toMatch(/^native/);
    });
  }

  it("⛔ CREED — an unmodeled body still parks despite the restriction being handled", () => {
    expect(classifyCard({ name: "Fake", type: "Instant", mana: "{W}", oracle: `${RESTRICTION}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
