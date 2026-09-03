/**
 * karooLands.test.js — LANDS-TIER slice 11 (2026-09-03): the self-ETB "sacrifice it unless <cost>" lands —
 * the Visions Karoos ("When this land enters, sacrifice it unless you return an untapped Plains you control
 * to its owner's hand": Karoo · Coral Atoll · Everglades · Dormant Volcano · Jungle Basin) and the
 * "sacrifice it unless you pay {1}" cycle (Archway Commons · Rupture Spire · Transguild Promenade ·
 * Gateway Plaza · Nearby Planet). 10 corpus lands.
 *
 * THE SUBSYSTEM WAS ALREADY BUILT: the `sac-unless-pay` atom pays with mana, a discard, a sacrifice, or a
 * RETURNED LAND (Waterspout Djinn's "an untapped Island"), pausing on a pay-or-sacrifice choice. Two words
 * stood between the lands and it: the pronoun "it" (for a SELF-scope ETB, "it" is the source — CR 608.2c —
 * so triggers.js rewrites "sacrifice it unless …" to "sacrifice this permanent unless …", a noun the matcher
 * already admits), and the four untapped basic types the return-land cost only knew "island" for.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", oracle });
const KAROO = L("Karoo", "This land enters tapped.\nWhen this land enters, sacrifice it unless you return an untapped Plains you control to its owner's hand.\n{T}: Add {C}{W}.");
const DORMANT = L("Dormant Volcano", "This land enters tapped.\nWhen this land enters, sacrifice it unless you return an untapped Mountain you control to its owner's hand.\n{T}: Add {C}{R}.");
const ARCHWAY = L("Archway Commons", "This land enters tapped.\nWhen this land enters, sacrifice it unless you pay {1}.\n{T}: Add one mana of any color.");
const PLAINS = (id, tapped = false) => createPermanent({ id, card: { id: "cb-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user", summoningSick: false, tapped });
const ISLAND = (id) => createPermanent({ id, card: { id: "cb-" + id, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });

describe("the matcher — the four other untapped basic types join 'island'", () => {
  it("reads 'return an untapped Plains' with the subtype and the untapped requirement", () => {
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return an untapped Plains you control to its owner's hand.")?.atom.cost)
      .toEqual({ kind: "return-land", subtype: "Plains", untapped: true });
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return an untapped Mountain you control to its owner's hand.")?.atom.cost)
      .toEqual({ kind: "return-land", subtype: "Mountain", untapped: true });
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return a land you control to its owner's hand.")?.atom.cost)
      .toEqual({ kind: "return-land", subtype: null, untapped: false });
  });

  it("⛔ a non-basic subtype or a rider is refused", () => {
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return an untapped Desert you control to its owner's hand.")).toBeNull();
    expect(matchUpkeepSacUnlessPay("Sacrifice this permanent unless you return an untapped Plains you control to its owner's hand or discard a card.")).toBeNull();
  });
});

/** Play `card` onto a board holding `bf`; resolve the ETB trigger to its pay-or-sacrifice pause. */
function playToPause(card, bf, manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  let s = {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...card, id: "L" }], battlefield: bf, landsPlayedThisTurn: 0, manaPool } },
  };
  s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "L" });
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); // the ETB waits in pendingTriggers until the driver flushes it onto the stack
  let guard = 0;
  while ((s.stack || []).length && !s.pendingChoice && guard++ < 4) s = resolveTopOfStack(s);
  return s;
}
const onBf = (s, name) => s.players.user.battlefield.some((p) => p.card?.name === name);
const inGy = (s, name) => s.players.user.graveyard.some((c) => c.name === name);
const inHand = (s, name) => s.players.user.hand.some((c) => c.name === name);

describe("runtime — the Karoo's own ETB pauses on pay-or-sacrifice, and each answer does what it says", () => {
  it("⭐ PAY: the untapped Plains returns to hand and the Karoo stays (tapped, as printed)", () => {
    const s = playToPause(KAROO, [PLAINS("p1")]);
    expect(s.pendingChoice).toMatchObject({ kind: "sac-unless-pay", controller: "user", cost: { kind: "return-land", subtype: "Plains", untapped: true } });
    const paid = resolveSacUnlessPayChoice(s, true);
    expect(inHand(paid, "Plains")).toBe(true);
    expect(onBf(paid, "Karoo")).toBe(true);
    expect(paid.players.user.battlefield.find((p) => p.card.name === "Karoo").tapped).toBe(true);
  });

  it("DECLINE: the Karoo is sacrificed, the Plains stays", () => {
    const s = playToPause(KAROO, [PLAINS("p1")]);
    const declined = resolveSacUnlessPayChoice(s, false);
    expect(inGy(declined, "Karoo")).toBe(true);
    expect(onBf(declined, "Plains")).toBe(true);
  });

  it("⛔ a TAPPED Plains cannot pay (the untapped requirement is real): 'pay' still ends in a sacrifice", () => {
    const s = playToPause(KAROO, [PLAINS("p1", true)]);
    const out = resolveSacUnlessPayChoice(s, true);
    expect(inGy(out, "Karoo")).toBe(true);
    expect(onBf(out, "Plains")).toBe(true);
  });

  it("⛔ an Island does not pay a Plains cost (Dormant Volcano wants a Mountain, not an Island)", () => {
    const s = playToPause(DORMANT, [ISLAND("i1")]);
    const out = resolveSacUnlessPayChoice(s, true);
    expect(inGy(out, "Dormant Volcano")).toBe(true);
    expect(onBf(out, "Island")).toBe(true);
  });

  it("Archway Commons: pay {1} from the pool keeps it; decline sacrifices it", () => {
    const s = playToPause(ARCHWAY, [], { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 });
    expect(s.pendingChoice).toMatchObject({ kind: "sac-unless-pay", cost: { kind: "mana" } });
    const paid = resolveSacUnlessPayChoice(s, true);
    expect(onBf(paid, "Archway Commons")).toBe(true);
    expect(paid.players.user.manaPool.C).toBe(1);
    const declined = resolveSacUnlessPayChoice(s, false);
    expect(inGy(declined, "Archway Commons")).toBe(true);
  });
});

describe("classification", () => {
  it("the Karoos and the pay-{1} lands are `land`", () => {
    expect(classifyCard(KAROO)).toBe("land");
    expect(classifyCard(DORMANT)).toBe("land");
    expect(classifyCard(ARCHWAY)).toBe("land");
  });

  it("CREED — an unreadable cost keeps the land parked", () => {
    expect(classifyCard({ ...KAROO, oracle: KAROO.oracle.replace("an untapped Plains", "an untapped Desert") })).toBe("land-partial");
  });

  it("⛔ THE SCOPE GATE: a NON-self ETB's 'sacrifice it' is the OTHER permanent, never the source — no rewrite, no credit", () => {
    // "Whenever another creature enters …, sacrifice it unless you pay {1}" — "it" is the entering creature
    // (scope eachOtherCreature). Rewriting it to "this permanent" would sacrifice the SOURCE instead: the
    // wrong object, credited as native. The rewrite is gated on cls.scope === "self"; this pins the gate.
    const PROBE = { id: "c-probe-nonself", name: "Probe Nonself", type: "Creature — Ogre", power: 3, toughness: 3, keywords: [],
      oracle: "Whenever another creature enters the battlefield under your control, sacrifice it unless you pay {1}." };
    expect(detectTriggers(PROBE)[0]?.effectClause).toBe("sacrifice it unless you pay {1}");
    expect(classifyCard(PROBE)).not.toMatch(/^native/);
  });
});
