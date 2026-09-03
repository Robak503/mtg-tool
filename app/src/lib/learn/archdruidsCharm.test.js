/**
 * archdruidsCharm.test.js — X-PROGRAM ⑤ (2026-09-03): ARCHDRUID'S CHARM, all three modes native.
 *   • "Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a
 *     land card. Otherwise, put it into your hand. Then shuffle." — the proven tutor atom with a PER-CARD destination
 *     rider (`landToBattlefieldTapped`): the settler reads the chosen card's type line.
 *   • "Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you
 *     don't control." — the proven one-way bite with `fighterCounterFirst`: the counter lands before the power is read
 *     (printed order — CR 608.2c), so the bite deals power+1.
 *   • "Exile target artifact or enchantment." — already native.
 * Both new spans are whole-string collapses (the clause splitter would shatter them).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03). The creatures are SYNTHETIC.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CHARM = { id: "h-ac", name: "Archdruid's Charm", type: "Instant", mana: "{G}{G}{G}", mana_cost: "{G}{G}{G}", cmc: 3, keywords: [], oracle: "Choose one —\n• Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle.\n• Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.\n• Exile target artifact or enchantment." };
const MINE = { id: "c-mine", name: "Synthetic Grizzly", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const FOE = { id: "c-foe", name: "Synthetic Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: 3, toughness: 3, keywords: [], oracle: "" };
const LIB_LAND = { id: "l-forest", name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const LIB_CREATURE = { id: "l-elf", name: "Synthetic Elf", type: "Creature — Elf", mana: "{G}", power: 1, toughness: 1, oracle: "" };
const LIB_OTHER = { id: "l-inst", name: "Synthetic Instant", type: "Instant", mana: "{U}", oracle: "" };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [CHARM], graveyard: [], library: [LIB_OTHER, LIB_LAND, LIB_CREATURE], battlefield: [createPermanent({ id: "mine", card: MINE, controller: "user", summoningSick: false })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 3, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "foe", card: FOE, controller: "ai", summoningSick: false })] },
    },
  };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-ac");
const hasRole = (a, role, id) => (a.targets || []).some((t) => t.role === role && t.id === id);

describe("the parses + the tier", () => {
  it("the tutor mode collapses to the tutor atom with the per-card destination rider", () => {
    const p = parseEffectClause("Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "tutor", filter: { groups: [["creature"], ["land"]] }, filterLabel: "creature or land card", destination: "hand", landToBattlefieldTapped: true, targetType: null }]);
  });
  it("the bite mode collapses to the one-way bite with the counter-first rider", () => {
    const p = parseEffectClause("Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "damage-target-power", role: "target", secondaryRole: "fighter", fighterCounterFirst: { counterType: "+1/+1", amount: 1 } });
  });
  it("the whole card is native", () => {
    expect(classifyCard(CHARM)).toBe("native-spell");
  });
});

describe("runtime — through the dispatcher", () => {
  it("⭐ the bite: the counter lands first, the 2/2 deals 3 and the 3/3 dies", () => {
    const s = board();
    const act = casts(s).find((a) => hasRole(a, "fighter", "mine") && hasRole(a, "target", "foe"));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    const mine = out.players.user.battlefield.find((p) => p.id === "mine");
    expect(mine.counters?.["+1/+1"]).toBe(1);
    expect(out.players.ai.battlefield.find((p) => p.id === "foe")).toBeUndefined();
    expect(out.players.ai.graveyard.some((c) => c.id === "c-foe")).toBe(true);
  });

  it("⭐ the tutor: a land pick enters the battlefield TAPPED; a creature pick goes to the hand; an instant is never offered", () => {
    const s = board();
    const act = casts(s).find((a) => JSON.stringify(a.program || {}).includes('"tutor"'));
    expect(act).toBeTruthy();
    const paused = resolveTopOfStack(dispatchAction(s, act));
    expect(paused.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", landToBattlefieldTapped: true, destination: "hand" });
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["l-elf", "l-forest"]);
    // Land → battlefield, tapped.
    const landOut = resolveTutorChoice(paused, "l-forest");
    const forest = landOut.players.user.battlefield.find((p) => p.card?.id === "l-forest");
    expect(forest).toBeTruthy();
    expect(forest.tapped).toBe(true);
    expect(landOut.players.user.hand.some((c) => c.id === "l-forest")).toBe(false);
    // Creature → hand, untouched battlefield.
    const creatureOut = resolveTutorChoice(paused, "l-elf");
    expect(creatureOut.players.user.hand.some((c) => c.id === "l-elf")).toBe(true);
    expect(creatureOut.players.user.battlefield.some((p) => p.card?.id === "l-elf")).toBe(false);
  });

  it("the exile mode (already native) exiles the opponent's artifact; without one, no cast aims at a creature with it", () => {
    const s = board();
    // No artifact/enchantment anywhere: no cast action carries an artifact-or-enchantment target.
    expect(casts(s).some((a) => (a.targets || []).some((t) => t.type === "artifact" || t.type === "enchantment"))).toBe(false);
    const ROCK = { id: "c-rock", name: "Synthetic Rock", type: "Artifact", mana: "{1}", keywords: [], oracle: "" };
    const withRock = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, createPermanent({ id: "rock", card: ROCK, controller: "ai" })] } } };
    const act = casts(withRock).find((a) => (a.targets || []).some((t) => t.id === "rock"));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(withRock, act));
    expect(out.players.ai.battlefield.some((p) => p.id === "rock")).toBe(false);
    expect(out.players.ai.exile.some((c) => c.id === "c-rock")).toBe(true);
  });
});
