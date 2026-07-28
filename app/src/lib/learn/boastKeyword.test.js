/**
 * boastKeyword.test.js — BOAST (CR 702.135).
 *
 * "Boast — {4}{R}: Create a 5/5 red Dragon. (Activate only if this creature attacked this turn and only
 * once each turn.)"
 *
 * Boast is an ABILITY WORD (CR 207.2c) — the word itself has no rules meaning, and the entire rule lives
 * in that reminder text. So the slice is: strip the label so the cost parses, then enforce BOTH halves of
 * the reminder.
 *
 * THE ASSERTION THAT MATTERS IS THE PER-PERMANENT ONE. A seat-level `attackedThisTurn` already existed for
 * Raid, and reading it here would have been the easy build — but it offers boast whenever ANY of your
 * creatures attacked, which is a materially different and much stronger card. The engine now stamps the
 * flag on the PERMANENT at the same declare-attacker chokepoint, and clears it beside the seat flag at
 * untap so the two can never drift apart. The "a different creature attacked" case below is what proves
 * the distinction is real rather than decorative.
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, runStepActions } from "./gameEngine.js";

const REMINDER = "(Activate only if this creature attacked this turn and only once each turn.)";
const BOASTER = {
  name: "Usher of the Fallen", type: "Creature — Human Soldier", mana: "{R}", power: 2, toughness: 2, keywords: [],
  oracle: `Boast — {1}{R}: Create a 1/1 white Human Soldier creature token. ${REMINDER}`,
};
const PLAIN = { name: "Bystander", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

describe("the ability word is stripped and both halves of the reminder are carried", () => {
  it("the cost parses once the label is gone, and the ability is modeled", () => {
    const a = parseActivatedAbilities(BOASTER)[0];
    expect(a.costStr).toBe("{1}{R}");     // "Boast — " removed
    expect(a.modeled).toBe(true);
    expect(a.boast).toBe(true);
  });

  it("boast implies once-each-turn — folded into the existing limit, not a second mechanism", () => {
    expect(parseActivatedAbilities(BOASTER)[0].activationLimit).toBe(1);
  });

  it("an ordinary ability is untouched", () => {
    const a = parseActivatedAbilities({ name: "X", type: "Creature", oracle: "{1}: Draw a card." })[0];
    expect(a.boast).toBe(false);
    expect(a.activationLimit).toBeNull();
  });
});

describe("RUNTIME — the offer gate reads the PERMANENT, not the seat", () => {
  /** Board with the boaster + a plain creature. `attackWith` declares that permanent as an attacker. */
  function board({ attackWith = null } = {}) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const boaster = createPermanent({ id: "bo", card: BOASTER, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "ot", card: PLAIN, controller: "user", summoningSick: false });
    const bf = [boaster, other];
    for (let i = 0; i < 5; i++) {
      bf.push(createPermanent({ id: `l${i}`, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false }));
    }
    let st = {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
    if (attackWith) {
      const atk = legalActionsForPlayer(st, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === attackWith);
      st = dispatchAction(st, atk);
    }
    // walk to the postcombat main, where an activated ability is offerable
    let g = 0;
    while (g++ < 20 && !(st.phase === "postcombat-main" && st.step === "main")) st = runStepActions(advanceStep(st));
    return { ...st, priorityHolder: "user" };
  }
  const boastOffered = (st) =>
    legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "bo" && a.kind === "activate-ability").length;

  it("NOT offered when it has not attacked", () => {
    expect(boastOffered(board())).toBe(0);
  });

  it("offered after IT attacked", () => {
    expect(boastOffered(board({ attackWith: "bo" }))).toBeGreaterThan(0);
  });

  it("THE LOAD-BEARING ONE — NOT offered when a DIFFERENT creature attacked", () => {
    // The seat-level Raid flag is TRUE here: the player did attack. Reading that flag instead of the
    // permanent's would wrongly offer boast, which is a materially stronger card than the one printed.
    const st = board({ attackWith: "ot" });
    expect(st.players.user.attackedThisTurn).toBe(true);   // the seat flag really is set…
    expect(boastOffered(st)).toBe(0);                       // …and boast is still correctly withheld
  });

  it("the per-permanent flag clears at the controller's next untap", () => {
    let st = board({ attackWith: "bo" });
    expect(st.players.user.battlefield.find((p) => p.id === "bo").attackedThisTurn).toBe(true);
    let g = 0;
    while (g++ < 200) { st = runStepActions(advanceStep(st)); if (st.activePlayer === "user" && st.step === "upkeep") break; }
    expect(st.players.user.battlefield.find((p) => p.id === "bo").attackedThisTurn).toBe(false);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(BOASTER)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...BOASTER, oracle: `${BOASTER.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
