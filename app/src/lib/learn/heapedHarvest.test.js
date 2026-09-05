/**
 * HEAPED HARVEST — SHELF-85 · Bumble Flower F6 (2026-09-05). "When this artifact enters and when you sacrifice it, you may
 * search your library for a basic land card, put it onto the battlefield tapped, then shuffle." The compound head
 * already split into two triggers; the second, "you sacrifice it", had no condition arm (the self-sacrifice form was
 * gated to auras/enchantments). Widened: every self-noun and the bare "it" (in a trigger condition it can only be the
 * source, CR 201.4). The sacrifice checker fires youSacrificeThis from the sacrificed card regardless of type — a
 * cost sacrifice (the Food's own "{2}, {T}, Sacrifice this artifact" line) included.
 *
 * Mutation-checked: see the run ledger (docs-sk64).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";

beforeEach(() => _resetIdsForTests());

const HEAPED = { name: "Heaped Harvest", type: "Artifact — Food", mana: "{2}{G}", keywords: [], oracle: "When this artifact enters and when you sacrifice it, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n{2}, {T}, Sacrifice this artifact: You gain 3 life." };
const CAKE = { name: "Carrot Cake", type: "Artifact — Food", mana: "{1}{W}", keywords: [], oracle: "When this artifact enters and when you sacrifice it, create a 1/1 white Rabbit creature token and scry 1.\n{2}, {T}, Sacrifice this artifact: You gain 3 life." }; // the printed text (bundled oracle), reminder stripped
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const hh = createPermanent({ id: "hh", card: { id: "c-hh", ...HEAPED }, controller: "user", summoningSick: false });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, battlefield: [hh], library: [{ id: "F1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, { id: "S1", name: "Spell", type: "Sorcery", cmc: 1 }], manaPool: { ...b.players.user.manaPool, C: 2 }, life: 20 } } };
}
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };

describe("detect + classify", () => {
  it("both heads detect (etb + youSacrificeThis) for Heaped Harvest and Carrot Cake; both classify native", () => {
    const row = { heaped: detectTriggers(HEAPED).map((d) => [d.event, d.scope]), cake: detectTriggers(CAKE).map((d) => [d.event, d.scope]), heapedTier: classifyCard(HEAPED), cakeTier: classifyCard(CAKE) };
    console.log("  WITNESS heapedDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.heaped).toEqual([["etb", "self"], ["youSacrificeThis", "self"]]);
    expect(row.cake).toEqual([["etb", "self"], ["youSacrificeThis", "self"]]);
    expect(row.heapedTier).toMatch(/^native-/);
    expect(row.cakeTier).toMatch(/^native-/);
  });

  it("the self-sac cost guard: a STANDALONE 'When you sacrifice this artifact' head beside the Food's own sac cost no longer refuses the cost (the one trigger the cost path fires); an UNRELATED embedded head still does", () => {
    const standalone = { name: "Test Food", type: "Artifact — Food", mana: "{1}", keywords: [], oracle: "When you sacrifice this artifact, draw a card.\n{2}, {T}, Sacrifice this artifact: You gain 3 life." };
    const unrelated = { name: "Test Food", type: "Artifact — Food", mana: "{1}", keywords: [], oracle: "When this artifact enters and when an opponent draws a card, draw a card.\n{2}, {T}, Sacrifice this artifact: You gain 3 life." };
    const row = { standalone: parseActivatedAbilities(standalone).map((a) => a.modeled), unrelated: parseActivatedAbilities(unrelated).map((a) => a.modeled) };
    console.log("  WITNESS sacGuard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.standalone).toEqual([true]);
    expect(row.unrelated).toEqual([false]);
  });
});

describe("the sacrifice half at runtime", () => {
  it("paying the Food's own cost-sacrifice fires the self-sacrifice trigger ABOVE the ability: it pauses on the printed 'you may', a yes suspends the search on the basic land, the pick lands the Forest tapped, then the life resolves", () => {
    const s0 = state();
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "hh");
    expect(act).toBeTruthy();
    const s1 = settle(dispatchAction(s0, act)); // the dispatcher flushes the fired trigger onto the stack at once
    const row = { hhGone: !s1.players.user.battlefield.some((p) => p.id === "hh"), pause1: s1.pendingChoice?.kind ?? null, lifeAtPause: s1.players.user.life };
    const s2 = settle(resolveOptionalChoice(s1, true));
    row.pause2 = s2.pendingChoice ? { kind: s2.pendingChoice.kind, cands: (s2.pendingChoice.candidates || []).map((c) => c.name) } : null;
    const s3 = settle(resolveTutorChoice(s2, "F1"));
    const forest = s3.players.user.battlefield.find((p) => p.card?.name === "Forest");
    row.forest = forest ? { tapped: !!forest.tapped } : null;
    row.life = s3.players.user.life;
    row.stack = s3.stack.length;
    console.log("  WITNESS heapedSac", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hhGone).toBe(true);
    expect(row.pause1).toBe("optional-effect");
    expect(row.lifeAtPause).toBe(20); // the trigger sits ABOVE the ability (CR 603.3) — the life has not resolved yet
    expect(row.pause2).toEqual({ kind: "tutor-search", cands: ["Forest"] });
    expect(row.forest).toEqual({ tapped: true });
    expect(row.life).toBe(23);
    expect(row.stack).toBe(0);
  });
});
