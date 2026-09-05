/**
 * LEMBAS — SHELF-85 · Bumble Flower F6 (2026-09-05). "When this artifact enters, scry 1, then draw a card. / {2}, {T},
 * Sacrifice this artifact: You gain 3 life. / When this artifact is put into a graveyard from the battlefield, its owner
 * shuffles it into their library." The first two lines were native; the third parked on its WORDING alone: the self-PiG
 * leave event and the shuffle-self-into-library op already routed for "shuffle it into its owner's library" (Fblthp), and
 * the resolver already finds a source that has left for the graveyard. The owner-voiced printing joins the arm.
 *
 * Mutation-checked: see the run ledger (docs-sk73).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LEMBAS = { name: "Lembas", type: "Artifact — Food", mana: "{2}", keywords: [], oracle: "When this artifact enters, scry 1, then draw a card.\n{2}, {T}, Sacrifice this artifact: You gain 3 life.\nWhen this artifact is put into a graveyard from the battlefield, its owner shuffles it into their library." };
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const lem = createPermanent({ id: "lem", card: { id: "c-lem", ...LEMBAS }, controller: "user", summoningSick: false });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...b.players, user: { ...b.players.user, battlefield: [lem], library: [{ id: "L1", name: "Plains", type: "Basic Land — Plains", oracle: "" }], manaPool: { ...b.players.user.manaPool, C: 2 }, life: 20 } } };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };

describe("detect + classify", () => {
  it("the third line detects as the self leave-to-graveyard event with the shuffle-self effect and ROUTES; Lembas classifies native-mixed", () => {
    const d = detectTriggers(LEMBAS).map((x) => [x.event, x.scope, x.effectClause, triggerRoutesNatively(x)]);
    const row = { d, tier: classifyCard(LEMBAS) };
    console.log("  WITNESS lembasDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toContainEqual(["ltb", "self", "its owner shuffles it into their library", true]);
    expect(row.tier).toBe("native-mixed");
  });
});

describe("the sacrifice at runtime", () => {
  it("cracking Lembas for life fires the leave trigger and, after the life resolves, Lembas is shuffled from the graveyard into its owner's library", () => {
    const s0 = state();
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "lem");
    expect(act).toBeTruthy();
    const s1 = settle(dispatchAction(s0, act));
    const row = { life: s1.players.user.life, gy: s1.players.user.graveyard.map((c) => c.name), libraryHasLembas: s1.players.user.library.some((c) => c.name === "Lembas"), librarySize: s1.players.user.library.length, stack: s1.stack.length };
    console.log("  WITNESS lembasCrack", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.life).toBe(23);
    expect(row.gy).toEqual([]);
    expect(row.libraryHasLembas).toBe(true);
    expect(row.librarySize).toBe(2);
    expect(row.stack).toBe(0);
  });
});
