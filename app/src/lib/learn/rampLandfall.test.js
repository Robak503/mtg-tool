/**
 * RAMP/fetch LANDFALL (Dex, real-deck lane) — a land PUT onto the battlefield via ramp/fetch (Cultivate,
 * Rampant Growth, Kodama's Reach → enterCardFromZone) fires LANDFALL (CR 614), not just ETB. Without this,
 * landfall payoffs (Lotus Cobra, Tatyova, Rampaging Baloths) silently missed every ramp-fetched land — a
 * real gap in every green ramp deck (Koma/Omnath/Zaxara). Sibling of the play-land ETB fix.
 *
 * enterCardFromZone fires both checkEnterTriggers (ETB) and checkLandfallTriggers (landfall); landfall
 * self-gates via isLandPerm, so a reanimated/fetched CREATURE never fires it — only a land does.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { enterCardFromZone } from "./effects/effectAtoms.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function stateWith(library, battlefield = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, library, battlefield } },
  };
}
function resolveAll(s) { let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); return s; }
const cobra = () => createPermanent({ id: "cobra", card: { id: "c-cobra", name: "Lotus Cobra", type: "Creature — Snake", power: 2, toughness: 1, oracle: "Landfall — Whenever a land you control enters, you gain 1 life." }, controller: "user", summoningSick: false });

describe("RAMP/fetch lands fire LANDFALL via enterCardFromZone", () => {
  it("a fetched LAND fires landfall (Lotus Cobra) — the gain-life resolves", () => {
    let s = stateWith([{ id: "forest", name: "Forest", type: "Basic Land — Forest", oracle: "" }], [cobra()]);
    const lifeBefore = s.players.user.life;
    const { state, entered } = enterCardFromZone(s, { playerId: "user", cardId: "forest", fromZone: "library" });
    expect(entered).toBe(true);
    s = resolveAll(flushTriggers(state, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore + 1); // ramp-fetched land triggered landfall
  });

  it("a fetched CREATURE does NOT fire landfall (isLandPerm gate)", () => {
    let s = stateWith([{ id: "bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }], [cobra()]);
    const lifeBefore = s.players.user.life;
    const { state } = enterCardFromZone(s, { playerId: "user", cardId: "bear", fromZone: "library" });
    s = resolveAll(flushTriggers(state, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore); // a creature is not a land → no landfall
  });

  it("a fetched land's OWN ETB still fires too (both ETB and landfall)", () => {
    const fountain = { id: "rf", name: "Radiant Fountain", type: "Land", oracle: "When Radiant Fountain enters, you gain 2 life." };
    let s = stateWith([fountain], [cobra()]);
    const lifeBefore = s.players.user.life;
    const { state } = enterCardFromZone(s, { playerId: "user", cardId: "rf", fromZone: "library" });
    s = resolveAll(flushTriggers(state, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(lifeBefore + 3); // +2 own ETB, +1 Lotus Cobra landfall
  });
});
