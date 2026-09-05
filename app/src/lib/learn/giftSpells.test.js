/**
 * GIFT ON SPELLS — the un-promised base mode. SHELF-85 · Atraxa (Long River's Pull / Peerless Recycling / Wear Down), 2026-09-05.
 *
 * Gift (CR 702.174) is an OPTIONAL ADDITIONAL COST — the kicker / offspring / squad family's exact reasoning: the engine
 * never pays optional additional costs, so the printed UN-promised text is the complete, real mode the spell resolves
 * in. The "Gift a <X>" keyword line joins the cost-only keyword strip; the "If the gift was promised, …" sentence — a
 * branch that can never be reached — is stripped at the spell-program site, sentence-bounded so a following instruction
 * survives. Permanent carriers' promised triggers are untouched and still park.
 *
 * Mutation-checked: see the run ledger (docs-sk85).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { stripGiftPromise } from "./effects/castModifiers.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GIFT_CARD = "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)";
const PULL = { id: "c-lrp", name: "Long River's Pull", type: "Instant", mana: "{U}{U}", keywords: [], oracle: `${GIFT_CARD}\nCounter target creature spell. If the gift was promised, instead counter target spell.` };
const RECYCLING = { id: "c-pr", name: "Peerless Recycling", type: "Instant", mana: "{1}{G}", keywords: [], oracle: `${GIFT_CARD}\nReturn target permanent card from your graveyard to your hand. If the gift was promised, instead return two target permanent cards from your graveyard to your hand.` };
const WEAR_DOWN = { id: "c-wd", name: "Wear Down", type: "Sorcery", mana: "{1}{G}", keywords: [], oracle: `${GIFT_CARD}\nDestroy target artifact or enchantment. If the gift was promised, instead destroy two target artifacts and/or enchantments.` };
const FISH_CREATURE = { id: "c-fc", name: "Gifted Angler", type: "Creature — Merfolk", mana: "{1}{U}", power: 2, toughness: 2, keywords: [],
  oracle: "Gift a tapped Fish (You may promise an opponent a gift as you cast this spell. If you do, they create a tapped 1/1 blue Fish creature token before its other effects.)\nWhen this creature enters, if the gift was promised, draw a card." };

describe("the strip and the classifier", () => {
  it("the three Atraxa spells parse to their base programs and classify native-spell; a permanent carrier stays parked", () => {
    // The real callers (legalChoices / coverage) strip the cost-only keyword line first — the same strip is applied here.
    const ops = (c) => parseEffectProgram({ ...c, oracle: stripCostOnlyKeywordLines(c.oracle) })?.atoms?.map((a) => [a.op, a.targetType, a.maxTargets ?? a.count ?? null]);
    const row = { pull: ops(PULL), recycling: ops(RECYCLING), wearDown: ops(WEAR_DOWN),
      tiers: [classifyCard(PULL), classifyCard(RECYCLING), classifyCard(WEAR_DOWN)], fish: classifyCard(FISH_CREATURE) };
    console.log("  WITNESS giftSpells", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tiers).toEqual(["native-spell", "native-spell", "native-spell"]);
    expect(row.pull).toHaveLength(1);
    expect(row.pull[0][0]).toMatch(/counter/);
    expect(row.recycling).toHaveLength(1);
    expect(row.wearDown).toHaveLength(1);
    expect(row.wearDown[0][0]).toBe("destroy");
    expect(row.fish).not.toMatch(/^native/);
  });

  it("sentence-bounded: the instruction AFTER a promised rider survives; text without gift is byte-identical", () => {
    expect(stripGiftPromise("Draw a card. If the gift was promised, instead draw two cards. You gain 2 life.")).toBe("Draw a card. You gain 2 life.");
    expect(stripGiftPromise("Destroy target creature.")).toBe("Destroy target creature.");
  });
});

describe("RUNTIME — Wear Down casts and resolves in its un-promised mode", () => {
  it("one target per artifact or enchantment on the board, and the base destroy resolves", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const rock = createPermanent({ id: "rock", card: { id: "c-rock", name: "Stone Rock", type: "Artifact", mana: "{1}", oracle: "" }, controller: "ai" });
    const glory = createPermanent({ id: "glory", card: { id: "c-glory", name: "Plain Glory", type: "Enchantment", mana: "{W}", oracle: "" }, controller: "ai" });
    const forest = (i) => createPermanent({ id: `f${i}`, card: { id: `c-f${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [WEAR_DOWN], battlefield: [forest(1), forest(2)] }, ai: { ...s0.players.ai, battlefield: [rock, glory] } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c-wd");
    expect(casts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["glory", "rock"]);
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.targets?.[0]?.id === "rock")));
    expect(resolved.players.ai.battlefield.map((p) => p.id)).toEqual(["glory"]);
    expect(resolved.players.ai.graveyard.map((c) => c.id)).toEqual(["c-rock"]);
  });
});
