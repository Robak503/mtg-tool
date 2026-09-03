/**
 * bubbleSnare.test.js — CORPUS ④-J (2026-09-03 night): KICKER ON THE AURA CAST LANE — Bubble Snare: "Kicker {2}{U} /
 * Enchant creature / When this Aura enters, if it was kicked, tap enchanted creature. / Enchanted creature doesn't
 * untap during its controller's untap step." The Aura's body was already native without its Kicker line (the
 * kicked-conditional ETB reads the "it was kicked" intervening-if, and the doesn't-untap static is modeled); the
 * kicker LINE parked it. Now: the aura residue walk admits a clean Kicker line (unpaid = the printed base mode, the
 * creature-side policy), the native-aura lane emits a KICKED cast per host when the kicker is affordable, the
 * dispatcher threads `kicked` through AURA_ETB, and enterPermanent stamps wasKicked so the ETB actually taps.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03). The {X}-kicker Aura is SYNTHETIC
 * (no such card is printed) — a negative pin on the refusal only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SNARE = { id: "h-snare", name: "Bubble Snare", type: "Enchantment — Aura", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [],
  oracle: "Kicker {2}{U} (You may pay an additional {2}{U} as you cast this spell.)\nEnchant creature\nWhen this Aura enters, if it was kicked, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };
const GIGANTIFORM = { id: "h-gig", name: "Gigantiform", type: "Enchantment — Aura", mana: "{3}{G}{G}", mana_cost: "{3}{G}{G}", cmc: 5, keywords: [],
  oracle: "Kicker {4}\nEnchant creature\nEnchanted creature has base power and toughness 8/8 and has trample.\nWhen this Aura enters, if it was kicked, you may search your library for a card named Gigantiform, put it onto the battlefield, then shuffle." };
const X_KICKER_AURA = { id: "h-x", name: "Synthetic X Snare", type: "Enchantment — Aura", mana: "{U}", mana_cost: "{U}", cmc: 1, keywords: [],
  oracle: "Kicker {X}\nEnchant creature\nWhen this Aura enters, if it was kicked, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };

function board(pool) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [SNARE], graveyard: [], library: [], battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [createPermanent({ id: "bear", card: BEAR, controller: "ai", summoningSick: false })] },
    },
  };
}
const snareCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-snare");

describe("the tiers", () => {
  it("⭐ Bubble Snare is native-aura; Gigantiform (base P/T + tutor-by-name) and a synthetic {X}-kicker Aura stay off the tier", () => {
    expect(classifyCard(SNARE)).toBe("native-aura");
    expect(classifyCard(GIGANTIFORM)).not.toMatch(/^native/);
    expect(classifyCard(X_KICKER_AURA)).not.toMatch(/^native/);
  });
});

describe("the offer", () => {
  it("with only {U} the lane offers the plain cast on the Bear and no kicked cast", () => {
    const acts = snareCasts(board({ U: 1 }));
    expect(acts.length).toBe(1);
    expect(acts[0]).toMatchObject({ isAuraSpell: true, needsTargets: true });
    expect(acts[0].targets[0].id).toBe("bear");
    expect(acts[0].kicked).not.toBe(true);
  });
  it("⭐ with {2}{U}{U} the lane ALSO offers the kicked cast — kicker pips folded in, mana value 4 (CR 202.3b)", () => {
    const acts = snareCasts(board({ U: 2, C: 2 }));
    expect(acts.length).toBe(2);
    const kicked = acts.find((a) => a.kicked === true);
    expect(kicked).toBeTruthy();
    expect(kicked.targets[0].id).toBe("bear");
    expect(kicked.cmc).toBe(4);
    expect(kicked.cost.generic).toBe(2);
    expect(kicked.cost.U).toBe(2);
  });
});

describe("runtime", () => {
  it("⭐ the KICKED cast enters attached with wasKicked, the ETB fires and the Bear is tapped", () => {
    const s = board({ U: 2, C: 2 });
    const act = snareCasts(s).find((a) => a.kicked === true);
    const cast = dispatchAction(s, act);
    expect(cast.players.user.manaPool.U).toBe(0);
    expect(cast.players.user.manaPool.C).toBe(0);
    const entered = flushTriggers(resolveTopOfStack(cast));
    const snare = entered.players.user.battlefield.find((p) => p.card?.name === "Bubble Snare");
    expect(snare).toBeTruthy();
    expect(snare.attachedTo).toBe("bear");
    expect(snare.wasKicked).toBe(true);
    expect(entered.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const out = resolveTopOfStack(entered);
    expect(out.players.ai.battlefield.find((p) => p.id === "bear").tapped).toBe(true);
  });
  it("the PLAIN cast enters attached without the flag; the intervening-if drops the ETB and the Bear stays untapped", () => {
    const s = board({ U: 1 });
    const act = snareCasts(s)[0];
    const entered = flushTriggers(resolveTopOfStack(dispatchAction(s, act)));
    const snare = entered.players.user.battlefield.find((p) => p.card?.name === "Bubble Snare");
    expect(snare.attachedTo).toBe("bear");
    expect(snare.wasKicked).toBeUndefined();
    expect(entered.stack.length).toBe(0);
    expect(entered.players.ai.battlefield.find((p) => p.id === "bear").tapped).toBe(false);
  });
});
