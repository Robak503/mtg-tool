/**
 * lairLands.test.js — LANDS-TIER slice 13 (2026-09-03): the Invasion lairs — "When this land enters, sacrifice
 * it unless you return a NON-Lair land you control to its owner's hand." (Darigaaz's Caldera, Treva's Ruins,
 * Dromar's Cavern, Crosis's Catacombs, Rith's Grove — 5 corpus lands). The Karoo arm (LANDS-11) built the
 * return-land cost with a positive subtype; this is the negated form: `notSubtype` rides the cost and the
 * shared pool match refuses a land carrying it — a second Lair cannot pay for the first.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CALDERA = { id: "c-caldera", name: "Darigaaz's Caldera", type: "Land — Lair", oracle: "When this land enters, sacrifice it unless you return a non-Lair land you control to its owner's hand.\n{T}: Add {B}, {R}, or {G}." };
const FOREST = (id) => createPermanent({ id, card: { id: "cb-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
const OTHER_LAIR = (id) => createPermanent({ id, card: { id: "cl-" + id, name: "Treva's Ruins", type: "Land — Lair", oracle: "{T}: Add {G}, {W}, or {U}." }, controller: "user", summoningSick: false });

describe("the matcher — the negated subtype rides the cost", () => {
  it("reads 'a non-Lair land' as notSubtype Lair, untapped not required", () => {
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return a non-Lair land you control to its owner's hand.")?.atom.cost)
      .toEqual({ kind: "return-land", subtype: null, notSubtype: "Lair", untapped: false });
  });
});

function playToPause(bf) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  let s = {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...CALDERA, id: "L" }], battlefield: bf, landsPlayedThisTurn: 0 } },
  };
  s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "L" });
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while ((s.stack || []).length && !s.pendingChoice && guard++ < 4) s = resolveTopOfStack(s);
  return s;
}
const onBf = (s, name) => s.players.user.battlefield.some((p) => p.card?.name === name);
const inGy = (s, name) => s.players.user.graveyard.some((c) => c.name === name);
const inHand = (s, name) => s.players.user.hand.some((c) => c.name === name);

describe("runtime — a non-Lair land pays; another Lair cannot", () => {
  it("⭐ PAY with a Forest on the board: the Forest returns to hand, the Caldera stays", () => {
    const s = playToPause([FOREST("f1")]);
    expect(s.pendingChoice).toMatchObject({ kind: "sac-unless-pay", cost: { kind: "return-land", notSubtype: "Lair" } });
    const paid = resolveSacUnlessPayChoice(s, true);
    expect(inHand(paid, "Forest")).toBe(true);
    expect(onBf(paid, "Darigaaz's Caldera")).toBe(true);
  });

  it("⛔ with ONLY another Lair on the board, 'pay' cannot return it — the Caldera is sacrificed, the other Lair stays", () => {
    const s = playToPause([OTHER_LAIR("lair2")]);
    const out = resolveSacUnlessPayChoice(s, true);
    expect(inGy(out, "Darigaaz's Caldera")).toBe(true);
    expect(onBf(out, "Treva's Ruins")).toBe(true);
    expect(inHand(out, "Treva's Ruins")).toBe(false);
  });

  it("DECLINE: the Caldera is sacrificed, the Forest stays", () => {
    const s = playToPause([FOREST("f1")]);
    const out = resolveSacUnlessPayChoice(s, false);
    expect(inGy(out, "Darigaaz's Caldera")).toBe(true);
    expect(onBf(out, "Forest")).toBe(true);
  });
});

describe("classification", () => {
  it("the lair is `land`; an unreadable negation still parks", () => {
    expect(classifyCard(CALDERA)).toBe("land");
    expect(classifyCard({ ...CALDERA, oracle: CALDERA.oracle.replace("a non-Lair land", "a non-Lair nonbasic land") })).toBe("land-partial");
  });
});
