/**
 * symburnEachPlayer.test.js — SYMBURN-2: "deals N damage to each player" (Flame Rift, Slagstorm's second
 * mode, Spear Spewer).
 *
 * SYMBURN-1 built the COMBINED form ("each creature and each player") and left this out of its own scope,
 * pinned in symburn.test.js as "each-player-only isn't modeled".
 *
 * ⭐ THAT PIN'S WORDING IS WHY THIS ONE GRADUATES AND THE BATTLEFIELD-FETCH GUARD DID NOT. "isn't modeled"
 * is CAPABILITY language — we cannot. The fetch guard said "cheat" and "landmine" across nine pins in seven
 * files: JUDGEMENT language — we will not. Only the first kind graduates on a runtime proof, and the proof
 * here is that `eachCreatureAndPlayer` ALREADY damages every player INCLUDING the caster. "each player"
 * alone is a strict subset of behaviour the engine has been performing all along — the same seat loop,
 * minus the creatures.
 *
 * ⛔ THE CASTABILITY ASSERTION BELOW IS THE ONE THAT MATTERS, and targetTypes.js says why in its own header:
 * when SYMBURN-1 added its type to only 2 of the 5 places that needed it, the cards CLASSIFIED native and
 * were SILENTLY UNCASTABLE — the cast flow treated the mass effect as targeted, found no legal target, and
 * dropped the action. A tier assertion alone would have shown green through exactly that bug.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programNeedsChosenTarget } from "./effects/parser.js";
import { NON_CHOSEN_TARGET_TYPES } from "./targetTypes.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FLAME_RIFT = { id: "fr", name: "Flame Rift", type: "Sorcery", mana: "{1}{R}", oracle: "Flame Rift deals 4 damage to each player." };

describe("parsing", () => {
  it("⭐ the players-only form is its own mass target type", () => {
    expect(parseEffectProgram(FLAME_RIFT).atoms).toEqual([{ op: "deal-damage", amount: 4, targetType: "eachPlayer" }]);
  });

  it("⛔ it is registered as NON-CHOSEN — the drift that made SYMBURN-1's cards uncastable", () => {
    expect(NON_CHOSEN_TARGET_TYPES.has("eachPlayer")).toBe(true);
    expect(programNeedsChosenTarget(parseEffectProgram(FLAME_RIFT))).toBe(false);
  });

  it("CONTROL — the COMBINED form is untouched", () => {
    expect(parseEffectProgram({ type: "Sorcery", oracle: "Inferno deals 6 damage to each creature and each player." }).atoms)
      .toEqual([{ op: "deal-damage", amount: 6, targetType: "eachCreatureAndPlayer" }]);
  });

  it("⛔ a QUALIFIED variant still parks (CREED — bare form only)", () => {
    expect(classifyCard({ type: "Sorcery", name: "Q", oracle: "Q deals 2 damage to each player who controls a Mountain." }))
      .toBe("arbiter-spell");
  });
});

describe("⭐ RUNTIME — it is CASTABLE, and it hits every seat including the caster", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [FLAME_RIFT], manaPool: { ...s.players.user.manaPool, C: 20, R: 20 } } },
    };
  }

  it("⛔ THE LOAD-BEARING ONE — the spell is actually offered as a legal action", () => {
    // targetTypes.js's header records the exact failure this guards: a mass type missing from the
    // non-chosen set makes the cast flow look for a target it will never find and drop the action, while
    // the tier still reads native.
    const cast = legalActionsForPlayer(board(), "user").find((a) => a.kind === "cast-spell" && a.cardId === "fr");
    expect(cast, "Flame Rift is castable").toBeTruthy();
  });

  it("⭐ resolving it damages BOTH players — the caster is not spared", () => {
    let s = board();
    const start = { user: s.players.user.life, ai: s.players.ai.life };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "fr"));
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 20) s = resolveTopOfStack(s);
    expect(s.players.ai.life).toBe(start.ai - 4);
    expect(s.players.user.life).toBe(start.user - 4); // ⭐ self-damage is the POINT of Flame Rift
  });

  it("⛔ and it damages NO creatures — that is what separates it from the combined form", () => {
    // Without this, "eachPlayer" could quietly resolve as "eachCreatureAndPlayer" and every assertion
    // above would still pass.
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bear = { id: "b1", card: { id: "b1", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai", tapped: false, damage: 0, counters: {} };
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, hand: [FLAME_RIFT], manaPool: { ...s0.players.user.manaPool, C: 20, R: 20 } },
        ai: { ...s0.players.ai, battlefield: [bear] },
      },
    };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "fr"));
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 20) s = resolveTopOfStack(s);
    const survivor = s.players.ai.battlefield.find((p) => p.id === "b1");
    expect(survivor, "the Bear is untouched").toBeTruthy();
    expect(survivor.damage || 0).toBe(0);
  });
});

describe("tier", () => {
  it("⭐ Flame Rift and Slagstorm flip", () => {
    expect(classifyCard(FLAME_RIFT)).toBe("native-spell");
    expect(classifyCard({ name: "Slagstorm", type: "Sorcery", mana: "{2}{R}",
      oracle: "Choose one —\n• Slagstorm deals 3 damage to each creature.\n• Slagstorm deals 3 damage to each player." }))
      .toBe("native-spell");
  });
});
