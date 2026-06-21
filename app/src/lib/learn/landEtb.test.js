/**
 * LAND ETB on the play-land path (Dex, real-deck lane) — a PLAYED land fires its "enters" triggers
 * (CR 603.6a), not just landfall. applyPlayLand previously fired only checkLandfallTriggers, so a land's
 * OWN ETB (Bojuka Bog "exile a graveyard", a Temple's "scry 1", Radiant Fountain "gain 2 life") silently
 * never fired when played (the cast path's enterPermanent fires ETB, but lands are PLAYED, not cast).
 *
 * The fix is additive + type-gated: a plain land matches only land-relevant ETB scopes (its own self
 * trigger, a typed-permanent watcher for a typed land), never a creature-ETB watcher; landfall is a
 * distinct event so it doesn't double-fire. An unmodeled land ETB still routes to the Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function stateWithHand(handCard, battlefield = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, hand: [handCard], battlefield, landsPlayedThisTurn: 0 } },
  };
}
const playLand = (s, cardId) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId });
function resolveAll(s) { let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); return s; }

describe("LAND ETB fires on the play-land path", () => {
  it("a land's OWN ETB ('When ~ enters, you gain 2 life') fires + resolves when PLAYED", () => {
    const fountain = { id: "rf", name: "Radiant Fountain", type: "Land", oracle: "When Radiant Fountain enters, you gain 2 life." };
    let s = stateWithHand(fountain);
    const lifeBefore = s.players.user.life;
    s = playLand(s, "rf");
    expect(s.pendingTriggers?.length).toBeGreaterThanOrEqual(1); // the ETB was enqueued (was 0 before the fix)
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore + 2); // the gain-life ETB resolved
  });

  it("a CREATURE-ETB watcher does NOT fire when a land is played (type-gated, no wrong-fire)", () => {
    const soulWarden = createPermanent({ id: "sw", card: { id: "c-sw", name: "Soul Warden", type: "Creature — Human", power: 1, toughness: 1, oracle: "Whenever a creature you control enters, you gain 1 life." }, controller: "user", summoningSick: false });
    const plainLand = { id: "ld", name: "Wastes", type: "Land", oracle: "" };
    let s = stateWithHand(plainLand, [soulWarden]);
    const lifeBefore = s.players.user.life;
    s = playLand(s, "ld");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore); // a land is not a creature → Soul Warden silent
  });

  it("a vanilla land enqueues no ETB trigger (no spurious fire)", () => {
    let s = stateWithHand({ id: "f", name: "Forest", type: "Basic Land — Forest", oracle: "" });
    s = playLand(s, "f");
    expect(s.pendingTriggers || []).toHaveLength(0);
  });

  it("landfall still fires (and does not double-fire) when a land with no self-ETB is played", () => {
    const cobra = createPermanent({ id: "cobra", card: { id: "c-cobra", name: "Lotus Cobra", type: "Creature — Snake", power: 2, toughness: 1, oracle: "Landfall — Whenever a land you control enters, you gain 1 life." }, controller: "user", summoningSick: false });
    const plainLand = { id: "ld", name: "Forest", type: "Basic Land — Forest", oracle: "" };
    let s = stateWithHand(plainLand, [cobra]);
    const lifeBefore = s.players.user.life;
    s = playLand(s, "ld");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore + 1); // landfall fired exactly once (not 0, not 2)
  });
});
