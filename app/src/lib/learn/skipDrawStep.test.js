/**
 * SKIP YOUR DRAW STEP — "Skip your draw step." (Wild Wasteland · Taigam, Sidisi's Hand · Null Profusion · Recycle).
 * Residue census 2026-09-05 (RG-4): a 4-sole-blocker family (10 co-blockers), one sentence.
 *
 * CR 614.10 — a static that skips the controller's own draw step. Read at the turn engine's draw-step case off the ACTIVE
 * player's battlefield (controller scope: an opponent's carrier never skips yours): the step is logged as skipped, no card is
 * drawn, no draw-step draw watcher fires. One reader in effects/textNormalize.js (a leaf), a marker in parseStaticAbilities
 * for the classifier.
 *
 * Mutation-checked: see the run ledger (docs-rg4).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { nextStep } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WASTELAND = { id: "c-ww", name: "Wild Wasteland", type: "Enchantment", mana: "{2}{R}", keywords: [],
  oracle: "Skip your draw step.\nAt the beginning of your upkeep, exile the top two cards of your library. You may play those cards this turn." };
const TAIGAM = { id: "c-tg", name: "Taigam, Sidisi's Hand", type: "Legendary Creature — Human Wizard", mana: "{3}{U}{B}", power: 3, toughness: 4, keywords: [],
  oracle: "Skip your draw step.\nAt the beginning of your upkeep, look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.\n{B}, {T}, Exile X cards from your graveyard: Target creature gets -X/-X until end of turn." };
// Real bundled texts (2026-09-05). Recycle prints "Whenever you PLAY a card" — a co-blocker of its own, so it stays parked.
const RECYCLE = { id: "c-rc", name: "Recycle", type: "Enchantment", mana: "{4}{G}{G}", keywords: [],
  oracle: "Skip your draw step.\nWhenever you play a card, draw a card.\nYour maximum hand size is two." };
const BARGAIN = { id: "c-yb", name: "Yawgmoth's Bargain", type: "Enchantment", mana: "{4}{B}{B}", keywords: [],
  oracle: "Skip your draw step.\nPay 1 life: Draw a card." };
const APPEASEMENT = { id: "c-da", name: "Dragon Appeasement", type: "Enchantment", mana: "{3}{B}{R}{G}", keywords: [],
  oracle: "Skip your draw step.\nWhenever you sacrifice a creature, you may draw a card." };

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-l${i}`, name: "Card", type: "Instant", mana: "{U}", oracle: "" }));
function atUpkeep(userCards, aiCards = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (owner) => (c, i) => createPermanent({ id: `${owner}${i}`, card: c, controller: owner });
  return { ...s0, phase: "beginning", step: "upkeep", activePlayer: "user", priorityHolder: null, turn: 5,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: userCards.map(mk("user")), library: lib("user", 8), hand: [] },
      ai: { ...s0.players.ai, battlefield: aiCards.map(mk("ai")), library: lib("ai", 8), hand: [] } } };
}

describe("the classifier", () => {
  it("Wild Wasteland, Yawgmoth's Bargain and Dragon Appeasement read native (their other lines were already modeled); Taigam and Recycle carry their own co-blockers and stay parked", () => {
    const row = { wasteland: classifyCard(WASTELAND), bargain: classifyCard(BARGAIN), appeasement: classifyCard(APPEASEMENT), taigam: classifyCard(TAIGAM), recycle: classifyCard(RECYCLE) };
    console.log("  WITNESS skipDrawStep", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of ["wasteland", "bargain", "appeasement"]) expect(row[k], k).toMatch(/^native/);
    expect(row.taigam).toBe("body-only");  // the look-three pick / the exile-X activation
    expect(row.recycle).toBe("body-only"); // "whenever you PLAY a card" — its own blocker
  });
});

describe("RUNTIME — the turn engine's draw step", () => {
  it("with Wild Wasteland out the user's draw step is skipped (no card, the step logged skipped); without it a card is drawn; an OPPONENT's Wasteland does not skip yours", () => {
    const skipped = nextStep(atUpkeep([WASTELAND]));
    const normal = nextStep(atUpkeep([]));
    const theirs = nextStep(atUpkeep([], [WASTELAND]));
    const lastStep = (s) => [...(s.log || s.events || [])].reverse().find((e) => e.kind === "step" && e.step === "draw");
    const row = { step: `${skipped.phase}/${skipped.step}`, skippedHand: skipped.players.user.hand.length, skippedLog: lastStep(skipped)?.skipped ?? null, normalHand: normal.players.user.hand.length, theirsHand: theirs.players.user.hand.length };
    console.log("  WITNESS skipDrawStepRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "beginning/draw", skippedHand: 0, skippedLog: "static", normalHand: 1, theirsHand: 1 });
  });
});
