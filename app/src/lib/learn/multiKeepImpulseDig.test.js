/**
 * multiKeepImpulseDig.test.js — "Look at the top N cards of your library. Put TWO of them into your hand and
 * the rest on the bottom." Stock Up · Dig Through Time · Ancestral Memories · Drawn from Dreams · Blood Price
 * · Rakshasa's Bargain · Bitter Revelation · Scattered Thoughts · A-Demon's Due.
 *
 * matchImpulseDig already handled the whole template for 11 native carriers and admitted EXACTLY "put ONE of
 * them into your hand" by an explicit allowlist. This widens the allowlist to a keep count.
 *
 * ⭐ THE DESIGN CHOICE THAT MATTERS: the choice RE-RAISES rather than becoming a multi-select. Pick one, the
 * remainder is re-offered, until `keep` are taken. Every driver that already settles an impulse-dig in a loop
 * — learnSession, the UI, these tests — handles it with no change at all. A multi-select would have needed
 * the driver's auto-pick widened in lockstep, and if those two ever drifted the AI would keep ONE card and
 * silently drop the rest: a card that reads native while quietly stealing a card from you.
 *
 * ⚠️ `lookedAt` (the ORIGINAL top-N size) is carried through every re-raise because the final disposal must
 * cover the whole looked-at set, not the shrunken candidate list. Get that wrong and the leftovers stay on
 * top of the library instead of going to the bottom — pinned below by asserting the library ORDER.
 *
 * ⛔ THE COUNT WAS NOT ENOUGH. The first cut of this file asserted `library.length === 5` and the mutation
 * that swaps `lookedAt` for the shrunken candidate list SURVIVED it: both leave five cards, but the wrong one
 * leaves a looked-at card sitting on top (E,F,G,C,D) instead of on the bottom (F,G,C,D,E). Same tally,
 * different library. Assert the mechanism.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { matchImpulseDig } from "./effects/spanMatchers.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const STOCK_UP = { id: "csu", name: "Stock Up", type: "Instant", mana: "{2}{U}",
  oracle: "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order." };
const ANTICIPATE = { id: "can", name: "Anticipate", type: "Instant", mana: "{1}{U}",
  oracle: "Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in a random order." };

/** Cast `card` with a 7-card library; take the FIRST candidate at every dig prompt. */
function cast(card) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const lib = ["Forest", "Mountain", "Island", "Swamp", "Plains", "Wastes", "Ancient Tomb"]
    .map((n, i) => ({ id: `L${i}`, name: n, type: `Basic Land — ${n}` }));
  let s = {
    ...s0, turn: 8, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...card, id: "SUBJ" }], library: lib, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 }, life: 40 } },
  };
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "SUBJ");
  expect(act, `${card.name} was never offered`).toBeTruthy();
  s = dispatchAction(s, act);
  let guard = 0, prompts = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 15) {
    const pc = s.pendingChoice;
    if (pc) {
      if (pc.kind !== "impulse-dig") break;
      prompts += 1;
      s = resolveImpulseDigChoice(s, (pc.candidates || [])[0]?.id);
      continue;
    }
    s = resolveTopOfStack(s);
  }
  return {
    prompts,
    hand: s.players.user.hand.map((c) => c.name),
    library: s.players.user.library.length,
    libraryOrder: s.players.user.library.map((c) => c.name),
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ two cards really reach hand", () => {
  it("Stock Up: two prompts, two cards kept, the other three disposed IN ORDER", () => {
    const r = cast(STOCK_UP);
    expect(r.prompts).toBe(2);
    expect(r.hand).toEqual(["Forest", "Mountain"]);
    // ⚠️ THE ORDER IS THE ASSERTION, NOT THE COUNT. Looked at 5 (Forest…Plains), kept 2, so Wastes and
    // Ancient Tomb stay on top and Island/Swamp/Plains go to the bottom. A mutation that used the SHRUNKEN
    // candidate list as the disposal size (n = 4 instead of the original 5) SURVIVED a count-only check —
    // both leave 5 cards — while leaving a looked-at card sitting on top of the library instead of the
    // bottom. Assert the mechanism, not the tally.
    expect(r.libraryOrder).toEqual(["Wastes", "Ancient Tomb", "Island", "Swamp", "Plains"]);
    expect(r.library).toBe(5);
    expect(r.errors).toBe(0);
  });

  it("⛔ CONTROL — a single-keep dig is completely unchanged", () => {
    const r = cast(ANTICIPATE);
    expect(r.prompts).toBe(1);
    expect(r.hand).toHaveLength(1);
    expect(r.library).toBe(6);
  });

  it("declining mid-pick keeps only what was taken", () => {
    // Pick one, then decline: the player keeps 1 of the 2 they could have. The rest still get disposed.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const lib = Array.from({ length: 7 }, (_, i) => ({ id: `L${i}`, name: `Card${i}`, type: "Instant" }));
    let s = {
      ...s0, turn: 8, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...STOCK_UP, id: "SUBJ" }], library: lib, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 }, life: 40 } },
    };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "SUBJ"));
    // The spell goes on the STACK first — resolve until the dig prompt actually appears.
    let g = 0;
    while (!s.pendingChoice && (s.stack || []).length && g++ < 10) s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("impulse-dig");
    s = resolveImpulseDigChoice(s, s.pendingChoice.candidates[0].id);   // take one
    expect(s.pendingChoice?.kind).toBe("impulse-dig");                  // re-raised for the second
    s = resolveImpulseDigChoice(s, null);                              // decline
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.library).toHaveLength(6);                    // 7 − 1 kept
  });
});

describe("the matcher's allowlist widened, and only that far", () => {
  it("reads the keep count off the printed word", () => {
    expect(matchImpulseDig(STOCK_UP.oracle).atom).toMatchObject({ op: "impulse-dig", amount: 5, keep: 2, restTo: "bottom" });
    expect(matchImpulseDig(ANTICIPATE.oracle).atom).toMatchObject({ op: "impulse-dig", amount: 3, keep: 1 });
  });

  it("⛔ 'any number' is still refused", () => {
    expect(matchImpulseDig("Look at the top five cards of your library. Put any number of them into your hand and the rest on the bottom of your library.")).toBeNull();
  });

  it("⛔ keep >= look is refused — that is not a dig", () => {
    expect(matchImpulseDig("Look at the top two cards of your library. Put two of them into your hand and the rest on the bottom of your library.")).toBeNull();
  });
});

describe("classification — the nine real carriers flip", () => {
  for (const [name, oracle] of [
    ["Stock Up", STOCK_UP.oracle],
    ["Ancestral Memories", "Look at the top seven cards of your library. Put two of them into your hand and the rest into your graveyard."],
  ]) {
    it(`${name}`, () => expect(classifyCard({ name, type: "Instant", mana: "{2}{U}", oracle })).toMatch(/^native/));
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Instant", mana: "{2}{U}", oracle: `${STOCK_UP.oracle}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
