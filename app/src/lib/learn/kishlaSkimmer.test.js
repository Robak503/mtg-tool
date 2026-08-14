/**
 * kishlaSkimmer.test.js — THE DURING-YOUR-TURN GY-LEAVE WATCHER (2026-08-14). Kishla Skimmer:
 * "Whenever a card leaves your graveyard during your turn, draw a card. This ability triggers only
 * once each turn."
 *
 * ⭐ THREE SMALL PIECES on existing plumbing: the unfiltered gyLeave arm with the duringYourTurn flag
 * (TF-1 — only the during-form is emitted; the bare form stays Arbiter), the threading-allowlist entry
 * (the unlisted-=-dropped trap), and the fire-loop turn gate in checkGraveyardEventTriggers (the
 * Wavebreak turn-gate's mirror — active player must BE the watcher's controller). The once-per-turn
 * latch rides the standard trailing-sentence stamp untouched.
 *
 * ⛔ THE ARM LIVES ABOVE THE BLANKET QUALIFIER REJECT — the "during" token reject ate the condition
 * before the arm's first placement ever saw it (the Military Intelligence lesson, relearned live:
 * detectTriggers returned [] while the arm looked perfectly correct).
 *
 * Whole-card audit: Flying + this one trigger.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the arm disabled -> Kishla parks (the blanket reject reclaims it).
 *   · the allowlist entry dropped -> the descriptor decays -> the opponent-turn silence dies.
 *   · the fire gate removed -> same silence dies at the fire site.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkGraveyardEventTriggers, detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KISHLA = { id: "c-ks", name: "Kishla Skimmer", type: "Creature — Bird", mana: "{G}{U}", power: "2", toughness: "2",
  oracle: "Flying\nWhenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn." };

function board({ activePlayer = "user", gyOwner = "user" } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const skimmer = createPermanent({ id: "KS", controller: "user", summoningSick: false, card: { id: "card-KS", ...KISHLA } });
  return {
    ...g, activePlayer,
    players: { ...g.players, user: { ...g.players.user, battlefield: [skimmer] } },
    pendingGraveyardEvents: [{ dir: "leave", card: { id: "gone", name: "Mulldrifter", type: "Creature — Elemental" }, gyOwner, zone: "exile" }],
  };
}
const firedFor = (s) => (checkGraveyardEventTriggers(s).pendingTriggers || []).filter((t) => t.source?.permanentId === "KS");

describe("the carrier and the descriptor", () => {
  it("⭐ Kishla flips native-trigger; the descriptor carries the turn rider AND the once latch", () => {
    expect(classifyCard(KISHLA)).toBe("native-trigger");
    const d = detectTriggers(KISHLA)[0];
    const desc = d?.descriptor || d;
    expect(desc).toMatchObject({ event: "gyLeave", duringYourTurn: true, oncePerTurnTrigger: true, gyOwnerScope: "you" });
    expect(desc.gyCardType).toBeFalsy(); // unfiltered — ANY card type leaving counts
  });
});

describe("⭐⭐ LAW 6 — fires on YOUR turn, silent on theirs, silent on their graveyard", () => {
  it("⭐⭐ a card leaves YOUR graveyard on YOUR turn: the draw trigger fires", () => {
    const fired = firedFor(board({}));
    console.log("  WITNESS kishlaFires", JSON.stringify({ fired: fired.length, fx: fired[0]?.descriptor?.effectClause })); // vitest 4 needs --disable-console-intercept
    expect(fired.length).toBe(1);
    expect(fired[0]?.descriptor?.effectClause).toMatch(/draw a card/i);
  });

  it("⛔⛔ the SAME leave on an OPPONENT's turn: SILENT (the printed turn rider)", () => {
    const fired = firedFor(board({ activePlayer: "ai1" }));
    console.log("  WITNESS kishlaOppTurnSilent", JSON.stringify({ fired: fired.length })); // vitest 4 needs --disable-console-intercept
    expect(fired.length).toBe(0);
  });

  it("⛔ an OPPONENT's graveyard leave on your turn: SILENT (gyOwnerScope 'you')", () => {
    const fired = firedFor(board({ gyOwner: "ai1" }));
    expect(fired.length).toBe(0);
  });
});
