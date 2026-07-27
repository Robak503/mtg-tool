/**
 * selfTargetNonCreature.test.js — a NON-CREATURE permanent's self-reference (census slice 22).
 *
 * selfTargets resolves the "this <permanent>" referent for a self-targeted atom. It returned [] unless the
 * source was a CREATURE, so an Aura / artifact / enchantment referring to itself parsed to a HIGH atom and
 * then did NOTHING at resolution.
 *
 * Measured on Mark of Fury before the fix: the end-step trigger was detected, went on the stack, resolved —
 * and the Aura stayed attached to its host. The metric said the card was modeled; the engine silently no-op'd.
 * That is precisely the failure the comment above selfTargets already warns about for animated lands ("the
 * metric said HIGH while the runtime no-opped — the exact FP class the CREED forbids"); this is the same
 * catch one type wider.
 *
 * The creature path is untouched — it still returns type "creature", so no existing self effect moves. A
 * non-creature source now returns type "permanent", which applyZoneMove and the other permanent-scoped atoms
 * already accept.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

function endStepBoard(permCards) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = permCards.map((c) => createPermanent({ id: c.id, card: c, controller: "user", summoningSick: false }));
  return { ...s, phase: "end", step: "end", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
function settle(s) {
  let out = runStepActions(s);
  let guard = 0;
  while (out.stack.length && guard++ < 8) out = resolveTopOfStack(out);
  return out;
}

const BEAR = { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
const MARK = { id: "mf", name: "Mark of Fury", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\nEnchanted creature has haste.\nAt the beginning of the end step, return this Aura to its owner's hand." };

describe("an AURA can return ITSELF to hand", () => {
  it("the trigger actually moves the Aura, and it detaches from its host", () => {
    let s = endStepBoard([BEAR, MARK]);
    s = attachPermanent(s, { equipId: "mf", targetId: "bear" });
    expect(s.players.user.battlefield.find((p) => p.id === "mf").attachedTo).toBe("bear");

    s = settle(s);
    expect(s.players.user.battlefield.some((p) => p.id === "mf")).toBe(false);   // left the battlefield
    expect(s.players.user.hand.map((c) => c.name)).toContain("Mark of Fury");     // …to its owner's hand
    expect(s.players.user.battlefield.find((p) => p.id === "bear").attachments || []).toEqual([]); // host is clean
  });
});

describe("the creature path is unchanged", () => {
  it("a CREATURE still bounces itself (this is what already worked)", () => {
    const bouncer = { id: "bx", name: "Bouncer", type: "Creature — Elemental", mana: "{R}", power: 2, toughness: 2,
      oracle: "At the beginning of the end step, return this creature to its owner's hand." };
    const s = settle(endStepBoard([bouncer]));
    expect(s.players.user.battlefield.some((p) => p.id === "bx")).toBe(false);
    expect(s.players.user.hand.map((c) => c.name)).toContain("Bouncer");
  });

  it("an ARTIFACT can now do it too (the same referent, a third card type)", () => {
    const relic = { id: "ar", name: "Fleeting Relic", type: "Artifact", mana: "{2}",
      oracle: "At the beginning of the end step, return this artifact to its owner's hand." };
    const s = settle(endStepBoard([relic]));
    expect(s.players.user.battlefield.some((p) => p.id === "ar")).toBe(false);
    expect(s.players.user.hand.map((c) => c.name)).toContain("Fleeting Relic");
  });

  it("a permanent with NO self-referential trigger is left alone", () => {
    const plain = { id: "pl", name: "Plain Rock", type: "Artifact", mana: "{2}", oracle: "" };
    const s = settle(endStepBoard([plain]));
    expect(s.players.user.battlefield.some((p) => p.id === "pl")).toBe(true);
    expect(s.players.user.hand).toHaveLength(0);
  });
});
