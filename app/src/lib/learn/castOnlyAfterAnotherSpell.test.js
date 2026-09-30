/**
 * castOnlyAfterAnotherSpell.test.js — "Cast this spell only if you've cast another spell this turn." (Illusory Angel, Skyshroud
 * Condor, Hewed Stone Retainers — the 09-06 plan's stage ③, census row ⑫, 2026-09-30).
 *
 * A cast restriction (CR 601.3 — a player can begin to cast a spell only if no rule or effect prohibits it), enforced at
 * legalChoices' single cast-offer chokepoint off the per-turn spellsCastThisTurn count, the same place and shape as the
 * Fallen Empires "only during the declare attackers step" restriction. That enforcement is what lets the classifier strip
 * the printed line: an UNENFORCED restriction would hand the engine a strictly cheaper-to-deploy card.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { castOnlyAfterAnotherSpell } from "./effects/abilities.js";

beforeEach(() => _resetIdsForTests());

const ONLY_IF = "Cast this spell only if you've cast another spell this turn.";
const ANGEL = { id: "angel", name: "Illusory Angel", type: "Creature — Angel Illusion", mana: "{2}{U}", power: 4, toughness: 4, keywords: ["Flying"],
  oracle: `${ONLY_IF}\nFlying` };
const CONDOR = { id: "condor", name: "Skyshroud Condor", type: "Creature — Bird", mana: "{1}{U}", power: 2, toughness: 2, keywords: ["Flying"],
  oracle: `${ONLY_IF}\nFlying` };
const RETAINERS = { id: "ret", name: "Hewed Stone Retainers", type: "Artifact Creature — Golem", mana: "{3}", power: 4, toughness: 4, oracle: ONLY_IF };
const OPT = { id: "opt", name: "Opt", type: "Instant", mana: "{U}", keywords: ["Scry"],
  oracle: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." };

function game(hand, pool, spellsCastThisTurn = 0) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, spellsCastThisTurn, library: [{ id: "l1", name: "Island", type: "Basic Land — Island", oracle: "" }, { id: "l2", name: "Island", type: "Basic Land — Island", oracle: "" }],
      manaPool: { ...s.players.user.manaPool, ...pool } } } };
}
const offered = (s, cardId) => legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("classification", () => {
  it("Illusory Angel, Skyshroud Condor, Hewed Stone Retainers → native-body", () => {
    for (const card of [ANGEL, CONDOR, RETAINERS]) expect(classifyCard(card), card.name).toBe("native-body");
  });

  it("the detector reads the exact sentence; another restriction does not", () => {
    expect(castOnlyAfterAnotherSpell(ANGEL)).toBe(true);
    expect(castOnlyAfterAnotherSpell({ oracle: "Cast this spell only if you've cast two or more spells this turn." })).toBe(false);
    expect(classifyCard({ ...CONDOR, name: "Synthetic Condor", oracle: "Cast this spell only if you've cast two or more spells this turn.\nFlying" })).toBe("body-only");
  });
});

describe("RUNTIME — the cast gate", () => {
  it("VACUITY CONTROL — the same Angel WITHOUT the sentence is offered on a quiet turn with the same mana", () => {
    const plain = { ...ANGEL, id: "plain", oracle: "Flying" };
    expect(offered(game([plain], { U: 3, C: 3 }), "plain")).toBe(true);
  });

  it("⭐ nothing cast yet this turn: Illusory Angel, Skyshroud Condor and Hewed Stone Retainers are not offered", () => {
    const s = game([ANGEL, CONDOR, RETAINERS], { U: 3, C: 3 });
    expect([offered(s, "angel"), offered(s, "condor"), offered(s, "ret")]).toEqual([false, false, false]);
  });

  it("⭐ run for real: cast Opt, and the Angel is offered — then it resolves onto the battlefield", () => {
    let s = game([OPT, ANGEL], { U: 4 });
    const before = offered(s, "angel");
    expect(before).toBe(false);
    const opt = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "opt");
    s = resolveTopOfStack(dispatchAction(s, opt));
    expect(s.players.user.spellsCastThisTurn).toBe(1);
    const after = offered(s, "angel");
    expect(after).toBe(true);
    const angel = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "angel");
    s = resolveTopOfStack(dispatchAction(s, angel));
    const landed = s.players.user.battlefield.some((p) => p.card?.name === "Illusory Angel");
    expect(landed).toBe(true);
    console.log(`WITNESS angelAfterOpt offeredBefore=${before} · offeredAfter=${after} · onBattlefield=${landed}`);
  });

  it("⭐ the count is the turn's: a spell cast earlier this turn (spellsCastThisTurn 1) opens the gate for all three", () => {
    const s = game([ANGEL, CONDOR, RETAINERS], { U: 3, C: 3 }, 1);
    expect([offered(s, "angel"), offered(s, "condor"), offered(s, "ret")]).toEqual([true, true, true]);
  });
});
