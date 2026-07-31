/**
 * reconfigureKeyword.test.js — RECONFIGURE (CR 702.151): an Equipment that is ALSO a creature.
 * 20 corpus carriers, ZERO of them native before this slice. 8 flip; Lizard Blades is on two below-bar
 * shelf decks (Captain America Shoot your Shot · Wolverine, claws out!).
 *
 * ⭐ THE ATTACH HALF IS JUST EQUIP. parseActivatedAbilities returns the line as `isEquipAbility`, so it rides
 * the existing attach resolver, legality path and target enumeration — no new runtime lane.
 *
 * ⛔⛔ THE HALF THAT MAKES IT SAFE TO CREDIT IS THE TYPE CHANGE. CR 702.151b: while attached, the Equipment
 * is NOT a creature — the card's own reminder text says so ("While attached, this isn't a creature."). Credit
 * the equip half alone and an attached Lizard Blades would still be a creature: free to attack and block
 * WHILE ALSO granting its host double strike. Strictly better than printed, the forbidden direction.
 * layers.js emits a layer-4 removeCardType while attachedTo is set — the SAME shape bestow already used, so
 * this needed no new layer machinery, only the recognition that bestow had already solved it.
 * The `permanentIsCreature` assertions below are the ones that tell a correct build from an over-claim;
 * classification cannot see the difference.
 *
 * ⚠️ UNATTACH IS NOT OFFERED. Reconfigure can also pay to unattach; the engine only offers attach, so a
 * player cannot take that line. An UNDER-offer — a safe false negative, stated rather than hidden.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentIsCreature, permanentPower, permanentHasKeyword } from "./layers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLADES = { name: "Lizard Blades", type: "Artifact Creature — Equipment Lizard", mana: "{1}{R}", power: "1", toughness: "1",
  oracle: "Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" };
const BATTERY = { name: "Rabbit Battery", type: "Artifact Creature — Equipment Rabbit", mana: "{R}", power: "1", toughness: "1",
  oracle: "Haste\nEquipped creature gets +1/+1 and has haste.\nReconfigure {R} ({R}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" };

const permObj = (card, id, over = {}) =>
  ({ id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function board(card, { attached = false } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const host = permObj({ name: "Host", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "host",
    attached ? { attachments: ["eq"] } : {});
  const eq = permObj(card, "eq", attached ? { attachedTo: "host" } : {});
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [host, eq] } } };
}

describe("the keyword parses as the equip lane", () => {
  it("Reconfigure {N} is an equip ability (reminder text and all)", () => {
    const abs = parseActivatedAbilities(BLADES);
    expect(abs).toHaveLength(1);
    expect(abs[0]).toMatchObject({ isEquipAbility: true, modeled: true, isReconfigure: true });
  });

  it("⛔ an unmodeled variant is NOT swept in", () => {
    // A non-mana reconfigure cost is outside the modeled shape and must leave the card parked.
    expect(classifyCard({ ...BLADES, name: "Odd", oracle: BLADES.oracle.replace("Reconfigure {2}", "Reconfigure—Sacrifice a creature") })).not.toMatch(/^native/);
  });
});

describe("⛔⛔ CR 702.151b — ATTACHED, IT IS NOT A CREATURE (the half that makes crediting safe)", () => {
  it("UNattached it IS a creature", () => {
    expect(permanentIsCreature(board(BLADES), "eq")).toBe(true);
  });

  it("ATTACHED it is NOT a creature — it cannot attack or block while equipping", () => {
    expect(permanentIsCreature(board(BLADES, { attached: true }), "eq")).toBe(false);
  });

  it("the same holds for a second carrier (this is the keyword, not one card)", () => {
    expect(permanentIsCreature(board(BATTERY), "eq")).toBe(true);
    expect(permanentIsCreature(board(BATTERY, { attached: true }), "eq")).toBe(false);
  });

  it("⛔ a plain Equipment that was ALREADY a creature by other means is untouched", () => {
    // The strip is gated on the reconfigure keyword, so an ordinary Equipment cannot lose a type it never had
    // and an animated artifact is not silently de-animated.
    const plain = { name: "Bonesplitter", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
    expect(permanentIsCreature(board(plain, { attached: true }), "eq")).toBe(false);
    expect(permanentIsCreature(board(plain), "eq")).toBe(false);
  });
});

describe("⭐ the equipped-creature bonus still reaches the host while attached", () => {
  it("Rabbit Battery gives its host +1/+1 and haste", () => {
    const s = board(BATTERY, { attached: true });
    expect(permanentPower(s, "host")).toBe(3);
    expect(permanentHasKeyword(s, "host", "Haste")).toBe(true);
  });

  it("Lizard Blades gives its host double strike", () => {
    expect(permanentHasKeyword(board(BLADES, { attached: true }), "host", "Double strike")).toBe(true);
  });

  it("⛔ and NOT while unattached", () => {
    expect(permanentHasKeyword(board(BLADES), "host", "Double strike")).toBe(false);
  });
});

describe("recognition", () => {
  it("the carriers flip", () => {
    expect(classifyCard(BLADES)).toBe("native-equipment");
    expect(classifyCard(BATTERY)).toBe("native-equipment");
  });

  it("⛔ a reconfigure card with unmodeled extra text still parks (whole-card law)", () => {
    expect(classifyCard({ ...BLADES, name: "Ridered", oracle: `${BLADES.oracle}\nFlurgle the wumpus.` })).not.toMatch(/^native/);
  });
});
