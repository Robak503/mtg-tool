/**
 * tapForMana.test.js — CORPUS ④-D (2026-09-03 night): the "tapped for mana" trigger event (CR 605.3 / 603.2).
 * Fired by checkTapForManaTriggers at the ONE mana-tap commit (manaModel.commitManaTap, after the source taps).
 *   • Zhur-Taa Druid — "Whenever you tap this creature for mana, it deals 1 damage to each opponent." (scope self)
 *   • Vorinclex, Voice of Hunger — "Whenever an opponent taps a land for mana, that land doesn't untap during its
 *     controller's next untap step." (whose:"opponent", tappedFilter land; "that land" → the triggering permanent →
 *     the lockOnly tap atom the blocked-attacker lock already uses). Its own "add one mana of any type that land
 *     produced" line was already the mana model's global-tap augment.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03). Spells are synthetic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { checkTapForManaTriggers, detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DRUID = { id: "c-ztd", name: "Zhur-Taa Druid", type: "Creature — Human Druid", mana: "{R}{G}", cmc: 2, power: 1, toughness: 1, keywords: [], oracle: "{T}: Add {G}.\nWhenever you tap this creature for mana, it deals 1 damage to each opponent." };
const VORINCLEX = { id: "c-vor", name: "Vorinclex, Voice of Hunger", type: "Legendary Creature — Phyrexian Praetor", mana: "{6}{G}{G}", cmc: 8, power: 7, toughness: 6, keywords: ["Trample"], oracle: "Trample\nWhenever you tap a land for mana, add one mana of any type that land produced.\nWhenever an opponent taps a land for mana, that land doesn't untap during its controller's next untap step." };
const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" });
const GREEN_SPELL = { id: "h-gs", name: "Synthetic Growth", type: "Sorcery", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "You gain 2 life." };

function board({ seat = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: seat === "user" ? [GREEN_SPELL] : [], graveyard: [], library: [], battlefield: [createPermanent({ id: "druid", card: DRUID, controller: "user", summoningSick: false }), createPermanent({ id: "vor", card: VORINCLEX, controller: "user", summoningSick: false })], manaPool: pool },
      ai: { ...s0.players.ai, life: 20, hand: seat === "ai" ? [{ ...GREEN_SPELL, id: "h-gs-ai" }] : [], graveyard: [], library: [], battlefield: [createPermanent({ id: "ai-forest", card: FOREST("c-aif"), controller: "ai" })], manaPool: { ...pool } },
    },
  };
}
const castGreen = (s, seat, cardId) => legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("the detectors + the tiers", () => {
  it("self, you-a-land and opponent-a-land shapes; both cards are native", () => {
    expect(detectTriggers(DRUID).find((d) => d.event === "tapForMana")).toMatchObject({ scope: "self", whose: "you" });
    const v = detectTriggers(VORINCLEX).filter((d) => d.event === "tapForMana");
    expect(v.length).toBe(1);
    expect(v[0]).toMatchObject({ scope: "you", whose: "opponent", tappedFilter: "land", effectClause: "the triggering permanent doesn't untap during its controller's next untap step" });
    expect(classifyCard(DRUID)).toMatch(/^native/);
    expect(classifyCard(VORINCLEX)).toMatch(/^native/);
  });
});

describe("runtime — through a real payment", () => {
  it("⭐ Zhur-Taa Druid: paying a {G} spell by tapping him fires the trigger above the spell; the opponent takes 1", () => {
    const s = board();
    const act = castGreen(s, "user", "h-gs");
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.players.user.battlefield.find((p) => p.id === "druid").tapped).toBe(true);
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const afterTrigger = resolveTopOfStack(cast);
    expect(afterTrigger.players.ai.life).toBe(19);
    expect(afterTrigger.players.user.life).toBe(20);
    const done = resolveTopOfStack(afterTrigger);
    expect(done.players.user.life).toBe(22);
  });

  it("⭐ Vorinclex: the OPPONENT taps a Forest for mana → that Forest skips its next untap; the one after untaps it", () => {
    const s = board({ seat: "ai" });
    const act = castGreen(s, "ai", "h-gs-ai");
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    let st = resolveTopOfStack(resolveTopOfStack(cast));
    expect(st.players.ai.battlefield.find((p) => p.id === "ai-forest").tapped).toBe(true);
    st = runStepActions({ ...st, activePlayer: "ai", phase: "beginning", step: "untap", turn: 6 });
    expect(st.players.ai.battlefield.find((p) => p.id === "ai-forest").tapped).toBe(true); // locked once
    st = runStepActions({ ...st, activePlayer: "ai", phase: "beginning", step: "untap", turn: 8 });
    expect(st.players.ai.battlefield.find((p) => p.id === "ai-forest").tapped).toBe(false);
  });

  it("the checker's gates: the druid's own tap fires only for its controller's tap; Vorinclex ignores his controller's own lands and a tapped creature", () => {
    const s = board();
    const druid = s.players.user.battlefield.find((p) => p.id === "druid");
    expect((checkTapForManaTriggers(s, { permanentId: "druid", tapperId: "user" }).pendingTriggers || []).length).toBe(1);
    expect((checkTapForManaTriggers(s, { permanentId: "druid", tapperId: "ai" }).pendingTriggers || []).length).toBe(0);
    // Vorinclex: an opponent's LAND fires him; his controller's land does not; an opponent's creature does not.
    expect((checkTapForManaTriggers(s, { permanentId: "ai-forest", tapperId: "ai" }).pendingTriggers || []).length).toBe(1);
    const withUserForest = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, createPermanent({ id: "u-forest", card: FOREST("c-uf"), controller: "user" })] } } };
    expect((checkTapForManaTriggers(withUserForest, { permanentId: "u-forest", tapperId: "user" }).pendingTriggers || []).length).toBe(0);
    const aiCreatureBoard = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, createPermanent({ id: "ai-druid", card: { ...DRUID, id: "c-ztd2", oracle: "{T}: Add {G}." }, controller: "ai" })] } } };
    expect((checkTapForManaTriggers(aiCreatureBoard, { permanentId: "ai-druid", tapperId: "ai" }).pendingTriggers || []).length).toBe(0);
    expect(druid).toBeTruthy();
  });
});
