/**
 * bonecrusherStomp.test.js — why the engine does not offer Stomp (Bonecrusher Giant's Adventure half), pinned on a real board.
 *
 * Found 2026-10-16: a seeded Academy position with Bonecrusher Giant in hand, untapped mana including {1}{R} and a legal
 * target offered the Giant but never Stomp. That is THE CREED working, not a missing offer: the Adventure half is offered
 * only when the whole card is native (legalChoices.actionsCastAdventureFromHand → classifyCard, CR 715.3), and BOTH halves
 * of this card carry text the engine does not resolve:
 *   - Stomp: "Damage can't be prevented this turn." The engine keeps prevention shields (gameState.preventionShieldsFor) and
 *     models only "Combat damage can't be prevented" as a static (damageReplacements.combatDamageUnpreventable). Resolving
 *     Stomp as a bare "2 damage to any target" would let a shield prevent damage the card says can't be — the forbidden
 *     direction. Its damage sentence on its own IS native, so the prevention sentence is exactly what parks the half.
 *   - Bonecrusher Giant: "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's
 *     controller." — the creature face is body-only.
 * The creature still casts as its permanent face (the Adventure-card permanent lane is not tier-gated), so the player keeps
 * the 4/3. Oracle text below is the bundled Scryfall text (publicCard shape).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard, spellIsNative } from "./coverage.js";
import { faceViews, parseAdventureCard } from "./adventure.js";

beforeEach(() => _resetIdsForTests());

const BONECRUSHER = {
  name: "Bonecrusher Giant // Stomp", type: "Creature — Giant // Instant — Adventure", mana: "{2}{R} // {1}{R}", cmc: 3,
  power: "4", toughness: "3", keywords: [], layout: "adventure", colors: ["R"],
  oracle: "Bonecrusher Giant - Creature — Giant {2}{R}\nWhenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.\n//\nStomp - Instant — Adventure {1}{R}\nDamage can't be prevented this turn. Stomp deals 2 damage to any target.",
};
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {R}.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, keywords: [], oracle: "", power: "2", toughness: "2" };

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });

// The user at their precombat main: Bonecrusher Giant in hand, three untapped Mountains, an opposing Grizzly Bears to aim at.
function board() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...g.players,
      user: { ...g.players.user, hand: [{ ...BONECRUSHER, id: "bone" }], battlefield: [perm("m1", MOUNTAIN, "user"), perm("m2", MOUNTAIN, "user"), perm("m3", MOUNTAIN, "user")], library: [{ ...BEARS, id: "lib-1" }] },
      ai: { ...g.players.ai, battlefield: [perm("bears", BEARS, "ai")] },
    },
  };
}

describe("Bonecrusher Giant — Stomp is withheld on purpose (THE CREED), the Giant still casts", () => {
  it("on a board that can pay {1}{R} with a legal target, the engine offers the Giant and never Stomp", () => {
    const plays = legalActionsForPlayer(board(), "user").filter((a) => a.cardId === "bone");
    expect(plays.filter((a) => a.adventureCast)).toEqual([]);
    expect(plays.map((a) => `${a.kind}:${a.name}`)).toEqual(["cast-spell:Bonecrusher Giant"]);
  });

  it("the whole card is body-only, because both halves carry unmodeled text", () => {
    const { permanent, adventure } = faceViews(parseAdventureCard(BONECRUSHER));
    expect({
      card: classifyCard(BONECRUSHER),
      creatureFace: classifyCard(permanent),
      stompNative: spellIsNative(adventure),
    }).toEqual({ card: "body-only", creatureFace: "body-only", stompNative: false });
  });

  it("Stomp's damage sentence alone is native — the prevention sentence is what parks the half", () => {
    const { adventure } = faceViews(parseAdventureCard(BONECRUSHER));
    expect(adventure.oracle).toBe("Damage can't be prevented this turn. Stomp deals 2 damage to any target.");
    const damageOnly = { ...adventure, oracle: adventure.oracle.replace("Damage can't be prevented this turn. ", "") };
    expect(damageOnly.oracle).toBe("Stomp deals 2 damage to any target.");
    expect(spellIsNative(damageOnly)).toBe(true);
  });
});
