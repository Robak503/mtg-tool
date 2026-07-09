/**
 * landCreatureCounter.test.js — "put N +1/+1 counters on each LAND creature you control" (Bumi, Eclectic
 * Earthbender's attack trigger, which buffs the lands his earthbend animated into creatures). "land" is a
 * card-TYPE qualifier, not a COUNT_SUBTYPE, so it gets a dedicated `landCreaturesYouControl` scope whose
 * atomTargets gather is LAYER-AWARE (permanentIsCreature ∧ printed-Land) — critically NOT subtypeFilter:"Land"
 * through controllerCreatureTargets, which gates on the PRINTED creature type and would MISS an earthbend-
 * animated Land (printed Land, layer-4 Creature) → pump nothing → FP. Flip: Bumi → native-trigger, LOST=0.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { atomTargets } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

describe("land-creature counter scope (Bumi)", () => {
  it("Bumi, Eclectic Earthbender flips native-trigger", () => {
    expect(classifyCard({ name: "Bumi, Eclectic Earthbender", type: "Legendary Creature — Human Warrior", mana: "{2}{G}", power: 3, toughness: 3, oracle: "When Bumi enters, earthbend 1.\nWhenever Bumi attacks, put two +1/+1 counters on each land creature you control." })).toBe("native-trigger");
  });
  it("landCreaturesYouControl gathers only creatures that are ALSO lands (layer-aware), excluding plain creatures + plain lands", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const dryad = createPermanent({ id: "dryad", card: { id: "cd", name: "Dryad Arbor", type: "Land Creature — Forest Dryad", power: 0, toughness: 1 }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const forest = createPermanent({ id: "forest", card: { id: "cf", name: "Forest", type: "Basic Land — Forest" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [dryad, bear, forest] } } };
    const targets = atomTargets(s, { op: "add-counter", scope: "landCreaturesYouControl" }, { controller: "user", sourceId: "bumi" });
    expect(targets.map((t) => t.id)).toEqual(["dryad"]); // the land-creature only
  });
});
