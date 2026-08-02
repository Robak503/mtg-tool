/**
 * discardCostHandAbility.test.js — "<mana>, Discard this card: <effect>", an activated ability played from
 * HAND. Ultimo, Civilization's End · Visionary's Dance · Elemental Masterpiece.
 *
 * This is CYCLING GENERALIZED. Cycling is the special case where the effect is hard-coded "draw a card";
 * everything else about the shape is identical, so the offer site mirrors actionsCycleFromHand and the
 * dispatcher mirrors applyCycle — pay the mana, move the card hand → graveyard as the rest of the cost, fire
 * discard triggers, push an effect-program stack object, retain priority (CR 117.3c).
 *
 * ⛔ TWO GATES, AND THEY ARE THE SAME TWO IN THREE PLACES. The ability is offered, dispatched and CREDITED
 * only when its effect program is HIGH and needs NO CHOSEN TARGET:
 *   · low-confidence → offering it would spend the mana and bin the card for an effect that does nothing,
 *     which is strictly worse for the player than not offering it at all;
 *   · needs a target → target selection at ACTIVATION time is the casting path's machinery and is not wired
 *     into this lane, so Steel Wrecking Ball ("destroy target artifact") and Trumpeting Carnosaur are
 *     REFUSED rather than resolved with no target. A false negative, and the correct answer for now.
 * The metric reads the same predicate, so it cannot credit a card the engine will not offer.
 *
 * ⛔ THE COST IS PAID BEFORE THE ABILITY RESOLVES (CR 601.2h/602.2b) — the card is in the graveyard while its
 * own ability is on the stack. Asserted below, because a resolver that discarded afterwards would let the
 * card be seen in hand by anything the ability triggers.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseDiscardCostAbility } from "./effects/abilities.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const ULTIMO = { id: "cu", name: "Ultimo, Civilization's End", type: "Creature — Phyrexian Praetor", mana: "{6}{B}{B}", power: 6, toughness: 6,
  oracle: "Flying\n{2}{B}, Discard this card: Each opponent sacrifices a creature of their choice." };
const MASTERPIECE = { id: "cm", name: "Elemental Masterpiece", type: "Sorcery", mana: "{5}{U}{R}",
  oracle: "Create two 4/4 blue and red Elemental creature tokens.\n{U/R}{U/R}, Discard this card: Create a Treasure token." };
const WRECKING_BALL = { id: "cw", name: "Steel Wrecking Ball", type: "Creature — Construct", mana: "{6}{R}", power: 5, toughness: 5,
  oracle: "Trample\n{1}{R}, Discard this card: Destroy target artifact." };

/** `card` in hand with plenty of mana; try to activate its discard ability. */
function activate(card) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  let s = {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: {
      ...s0.players,
      user: {
        ...s0.players.user, hand: [{ ...card, id: "SUBJ" }],
        library: Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, name: "Forest", type: "Basic Land — Forest" })),
        manaPool: { W: 5, U: 5, B: 5, R: 5, G: 5, C: 5 }, life: 40,
      },
    },
  };
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "discard-ability" && a.cardId === "SUBJ");
  if (!act) return { offered: false };
  s = dispatchAction(s, act);
  // ⭐ The cost is paid up front: the card must ALREADY be in the graveyard while its ability is on the stack.
  const inGraveyardWhileOnStack = s.players.user.graveyard.some((c) => c.id === "SUBJ") && (s.stack || []).length > 0;
  let guard = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 12) {
    if (s.pendingChoice) {
      if (s.pendingChoice.kind === "impulse-dig") s = resolveImpulseDigChoice(s, (s.pendingChoice.candidates || [])[0]?.id);
      else break;
      continue;
    }
    s = resolveTopOfStack(s);
  }
  return {
    offered: true, inGraveyardWhileOnStack,
    inGraveyard: s.players.user.graveyard.some((c) => c.id === "SUBJ"),
    hand: s.players.user.hand.length,
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ the ability really activates from hand", () => {
  it("Ultimo: paid, discarded, and the ability resolves", () => {
    expect(activate(ULTIMO)).toMatchObject({ offered: true, inGraveyard: true, hand: 0, errors: 0 });
  });

  it("Elemental Masterpiece activates from hand even though it is a Sorcery", () => {
    expect(activate(MASTERPIECE)).toMatchObject({ offered: true, inGraveyard: true, errors: 0 });
  });

  it("⭐ the card is in the GRAVEYARD while its own ability is on the stack (CR 601.2h — cost first)", () => {
    expect(activate(ULTIMO).inGraveyardWhileOnStack).toBe(true);
  });
});

describe("⛔ the gates — refuse rather than resolve wrongly", () => {
  it("a TARGETED ability is not offered (target selection is not wired into this lane)", () => {
    expect(activate(WRECKING_BALL).offered).toBe(false);
  });

  it("⛔ …and it is not credited either — metric and runtime read the same predicate", () => {
    expect(classifyCard(WRECKING_BALL)).not.toMatch(/^native/);
  });

  it("an ability whose effect does not parse is not offered", () => {
    const junk = { ...ULTIMO, oracle: "Flying\n{2}{B}, Discard this card: Each opponent glorbulates at dawn." };
    expect(activate(junk).offered).toBe(false);
  });
});

describe("the parser is exact", () => {
  it("reads the cost and the effect text", () => {
    expect(parseDiscardCostAbility(ULTIMO)).toEqual({ cost: "{2}{B}", effectText: "Each opponent sacrifices a creature of their choice." });
  });

  it("⛔ refuses a card carrying an unmodeled discard/cycle TRIGGER — the same gate cycling uses", () => {
    // Activating would silently drop that trigger, so the whole card is refused (CREED, FN-safe).
    expect(parseDiscardCostAbility({ oracle: "When you discard this card, draw a card.\n{2}{B}, Discard this card: Create a Treasure token." })).toBeNull();
  });

  it("⛔ does NOT match a permanent's ability that merely mentions discarding", () => {
    expect(parseDiscardCostAbility({ oracle: "{T}: Discard a card. Draw a card." })).toBeNull();
  });
});

describe("classification — the three real carriers flip", () => {
  for (const c of [ULTIMO, MASTERPIECE]) {
    it(`${c.name}`, () => expect(classifyCard(c)).toMatch(/^native/));
  }

  it("Visionary's Dance (Sorcery: cast effect + hand ability)", () => {
    expect(classifyCard({ name: "Visionary's Dance", type: "Sorcery", mana: "{5}{U}{R}",
      oracle: "Create two 3/3 blue and red Elemental creature tokens with flying.\n{2}, Discard this card: Look at the top two cards of your library. Put one of them into your hand and the other into your graveyard." })).toMatch(/^native/);
  });

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ ...ULTIMO, name: "Fake", oracle: `${ULTIMO.oracle}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
