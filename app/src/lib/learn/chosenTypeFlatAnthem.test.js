/**
 * chosenTypeFlatAnthem.test.js — the CHOSEN-TYPE FLAT ANTHEM (CR 614.12), the FIXED-magnitude sibling of the
 * counter-scaled chosenTypeAnthem (Banner/Door). An ETB "choose a creature type" sets perm.chosenType, and a
 * static anthem reading that type buffs/grants ONLY the chosen-type creatures:
 *
 *   • Rally the Ranks   — "Creatures you control of the chosen type get +1/+1." (you-control scope)
 *   • Obelisk of Urd    — "Creatures you control of the chosen type get +2/+2." (Convoke is a cast-keyword body)
 *   • Shared Triumph    — "Creatures of the chosen type get +1/+1." (determiner-less → ALL players)
 *   • Steely Resolve    — "Creatures of the chosen type have shroud." (a grantable keyword, layer-6)
 *   • Cover of Darkness — "Creatures of the chosen type have fear." (fear IS enforced in combatEvasion)
 *
 * Mechanism (REUSED): the parseCreatureSelector chosen-type branch emits a layer-7c ptModify and/or layer-6
 * addKeyword carrying selector.chosenTypeOfSource:true; layers.matchesSelector pairs the candidate against the
 * SOURCE permanent's stored chosenType (subtype OR changeling, CR 702.73a). controllerScope is "you" only when
 * the clause says "you control"; the determiner-less form is symmetric ("each" → all players).
 *
 * CREED — the FP here is OVER-BUFF (a non-chosen-type / opponent creature pumped) or a FALSE FLIP off a rider.
 * The buff must touch ONLY the chosen type (a changeling counts; a non-chosen creature and — for the "you
 * control" form — an opponent's creature do NOT). A rider keeps the WHOLE card on the Arbiter (no partial flip):
 * Morophon (a WUBRG cost-reduction rider AND an "Other …" exclude-self anthem the flat branch doesn't model),
 * Icon of Ancestry (an activated ability), Radiant Destiny (a city's-blessing rider on the same clause) stay
 * body-only. Vanquisher's Banner is claimed by the CAST-DRAW classifier (BLITZ TC-1) — native-mixed there,
 * still rejected by THIS branch. An unset chosenType → a SAFE no-op (CLAUDE.md §1.2).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { serializeState, deserializeState } from "./serialization.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RALLY = { name: "Rally the Ranks", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1." };
const SHARED = { name: "Shared Triumph", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures of the chosen type get +1/+1." };
const OBELISK = { name: "Obelisk of Urd", type: "Artifact", oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nAs this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +2/+2." };
const STEELY = { name: "Steely Resolve", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures of the chosen type have shroud. (They can't be the targets of spells or abilities.)" };
const COVER = { name: "Cover of Darkness", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures of the chosen type have fear. (They can't be blocked except by artifact creatures and/or black creatures.)" };
const INSTRUMENTS = { name: "Instruments of War", type: "Artifact", oracle: "Flash\nAs this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1." };

function baseState(over = {}) {
  const s = createGameState({
    userDeck: Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, type: "Instant", oracle: "" })),
    aiDeck: [{ name: "A1", type: "Instant", oracle: "" }],
  });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function creaturePerm(id, typeLine, pt = [1, 1], controller = "user", oracle = "") {
  return createPermanent({ id, card: { name: id, type: typeLine, power: pt[0], toughness: pt[1], oracle }, controller });
}
// A board with a chosen-type anthem source (chosenType pre-set) + extra permanents. Isolates the anthem
// behavior from the ETB auto-pick (which is exercised in its own block below).
function withSource(card, chosenType, extra = [], over = {}) {
  const s = baseState(over);
  const src = { ...createPermanent({ id: "src", card, controller: "user" }), chosenType };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src, ...extra] }, ai: { ...s.players.ai, life: 20 } } };
}

describe("CHOSEN-TYPE FLAT ANTHEM — classification", () => {
  it("Rally the Ranks → native-static (chooser + flat you-control anthem, nothing else)", () => {
    expect(classifyCard(RALLY)).toBe("native-static");
  });
  it("Shared Triumph → native-static (chooser + flat all-players anthem)", () => {
    expect(classifyCard(SHARED)).toBe("native-static");
  });
  it("Obelisk of Urd → native-static (Convoke is a cast-keyword body, not residue)", () => {
    expect(classifyCard(OBELISK)).toBe("native-static");
  });
  it("Steely Resolve → native-static (grantable keyword anthem: shroud)", () => {
    expect(classifyCard(STEELY)).toBe("native-static");
  });
  it("Cover of Darkness → native-static (grantable keyword anthem: fear)", () => {
    expect(classifyCard(COVER)).toBe("native-static");
  });
  it("Instruments of War → native-static (Flash is a keyword body)", () => {
    expect(classifyCard(INSTRUMENTS)).toBe("native-static");
  });

  it("Morophon no longer parks — the COLORED-PIP cost reducer owns its flip, not this branch", () => {
    // Same shape as the Vanquisher's Banner pin below: this FLAT branch still cannot model Morophon (an
    // "Other …" anthem plus a cost-reduction rider), and that is what it is asked to keep proving. The
    // card reaches native-static through the pip reducer instead (coloredPipCostReduction.test.js), which
    // is why the tier moved while this branch's own verdict did not.
    const moro = { name: "Morophon, the Boundless", type: "Legendary Creature — Shapeshifter", oracle: "Changeling (This card is every creature type.)\nAs Morophon enters, choose a creature type.\nSpells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast. This effect reduces only the amount of colored mana you pay.\nOther creatures you control of the chosen type get +1/+1." };
    expect(classifyCard(moro)).toBe("native-static");
  });
  it("Vanquisher's Banner no longer parks on the FLAT branch — the CAST-DRAW classifier (BLITZ TC-1) owns it", () => {
    // Still a CREED pin for THIS branch: the flat classifier itself must keep rejecting it (a trigger is
    // residue here); the flip to native-mixed belongs to classifyChosenTypeCastDraw (chosenTypeCastDraw.test.js).
    const v = { name: "Vanquisher's Banner", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\nWhenever you cast a creature spell of the chosen type, draw a card." };
    expect(classifyCard(v)).toBe("native-mixed");
  });
  it("Icon of Ancestry — this FLAT-ANTHEM classifier declines it (activated ability is residue); LK-1 owns the flip", () => {
    // The flat-anthem classifier still returns null (its parseActivatedAbilities gate rejects the {3},{T} dig).
    // As of BLITZ LK-1 the WHOLE card flips native-mixed via classifyChosenTypeAnthemDig (chooser + flat anthem
    // + the modeled chosen-type impulse-dig activated ability) — see lookAtTopRevealTake.test.js.
    const icon = { name: "Icon of Ancestry", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\n{3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order." };
    expect(classifyCard(icon)).toBe("native-mixed");
  });
  it("CREED — Radiant Destiny parks (a city's-blessing keyword rider on the same clause is unmodeled residue)", () => {
    const rd = { name: "Radiant Destiny", type: "Enchantment", oracle: "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAs this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1. As long as you have the city's blessing, they also have vigilance." };
    expect(classifyCard(rd)).toBe("body-only");
  });
  it("CREED — a Rally-shape with an extra unmodeled clause parks (no partial flip)", () => {
    // ⚠️ FIXTURE REPAIRED 2026-07-28. It used "Whenever this enchantment enters, exile target nonland
    // permanent an opponent controls" as the "unmodeled" rider — and that trigger has since been BUILT
    // (it classifies native-trigger standing alone), so the pin was asserting body-only for a card that is
    // genuinely fully modeled. It only kept passing because an unrelated line, the ETB chosen-type chooser,
    // was still unaccounted for; the moment that was fixed the staleness surfaced.
    // The rider is now a clause that CANNOT be built later, so this pin tests the partial-flip rule forever.
    const ridered = { name: "Fake Rally", type: "Enchantment", oracle: `${RALLY.oracle}\nWhenever this enchantment enters, each opponent glorbulates twice.` };
    expect(classifyCard(ridered)).toBe("body-only");
  });
  it("CREED — the COUNT-anthem (Banner of Kinship) is NOT regressed by the flat branch", () => {
    const banner = { name: "Banner of Kinship", type: "Artifact", oracle: "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\nCreatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact." };
    expect(classifyCard(banner)).toBe("native-static");
  });
});

describe("Rally the Ranks — flat you-control P/T anthem", () => {
  it("a chosen-type creature you control gets +1/+1; a non-chosen one does NOT; an opponent's does NOT", () => {
    const s = withSource(RALLY, "Elf", [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [2, 2]),
      creaturePerm("oppElf", "Creature — Elf", [1, 1], "ai"),
    ]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([2, 2]);   // +1/+1
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([2, 2]);   // untouched (wrong type)
    expect([permanentPower(s, "oppElf"), permanentToughness(s, "oppElf")]).toEqual([1, 1]); // untouched (you control)
  });

  it("a CHANGELING counts as the chosen type (CR 702.73a) — buffed", () => {
    const s = withSource(RALLY, "Elf", [creaturePerm("ch", "Creature — Shapeshifter", [1, 1], "user", "Changeling (This card is every creature type.)")]);
    expect([permanentPower(s, "ch"), permanentToughness(s, "ch")]).toEqual([2, 2]);
  });

  it("CREED — an unset chosenType (malformed source) buffs nobody (a SAFE no-op)", () => {
    const s = withSource(RALLY, undefined, [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([1, 1]);
  });

  it("full ETB flow: enter Rally into a 2-Elf board → auto-picks Elf → each Elf becomes 2/2", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      creaturePerm("e1", "Creature — Elf", [1, 1]),
      creaturePerm("e2", "Creature — Elf Warrior", [1, 1]),
    ] } } };
    s = enterPermanent(s, RALLY, "user");
    const src = s.players.user.battlefield.find((p) => p.card.name === "Rally the Ranks");
    expect(src.chosenType).toBe("Elf");
    expect([permanentPower(s, "e1"), permanentToughness(s, "e1")]).toEqual([2, 2]);
    expect([permanentPower(s, "e2"), permanentToughness(s, "e2")]).toEqual([2, 2]);
  });

  it("chosenType SERIALIZES (a save/load round-trip keeps the anthem)", () => {
    const s = withSource(RALLY, "Elf", [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    const restored = deserializeState(serializeState(s));
    expect([permanentPower(restored, "elf"), permanentToughness(restored, "elf")]).toEqual([2, 2]);
  });
});

describe("Obelisk of Urd — +2/+2 magnitude", () => {
  it("buffs the chosen type by +2/+2", () => {
    const s = withSource(OBELISK, "Goblin", [
      creaturePerm("gob", "Creature — Goblin", [1, 1]),
      creaturePerm("elf", "Creature — Elf", [1, 1]),
    ]);
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([3, 3]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([1, 1]); // wrong type
  });
});

describe("Shared Triumph — determiner-less anthem buffs ALL players' chosen-type creatures", () => {
  it("buffs BOTH the controller's and an opponent's chosen-type creature (+1/+1)", () => {
    const s = withSource(SHARED, "Elf", [
      creaturePerm("mine", "Creature — Elf", [1, 1], "user"),
      creaturePerm("opp", "Creature — Elf", [1, 1], "ai"),
      creaturePerm("gob", "Creature — Goblin", [2, 2], "user"),
    ]);
    expect([permanentPower(s, "mine"), permanentToughness(s, "mine")]).toEqual([2, 2]);
    expect([permanentPower(s, "opp"), permanentToughness(s, "opp")]).toEqual([2, 2]); // all-players reach
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([2, 2]); // wrong type untouched
  });
});

describe("Steely Resolve / Cover of Darkness — flat keyword grants read layer-aware", () => {
  it("Steely Resolve grants shroud to the chosen type only", () => {
    const s = withSource(STEELY, "Elf", [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [1, 1]),
    ]);
    expect(permanentHasKeyword(s, "elf", "shroud")).toBe(true);
    expect(permanentHasKeyword(s, "gob", "shroud")).toBe(false);
  });

  it("Cover of Darkness grants fear to the chosen type only (enforced in combatEvasion)", () => {
    const s = withSource(COVER, "Elf", [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [1, 1]),
    ]);
    expect(permanentHasKeyword(s, "elf", "Fear")).toBe(true);
    expect(permanentHasKeyword(s, "gob", "Fear")).toBe(false);
  });

  it("CREED — a keyword grant with an unset chosenType touches nobody (a SAFE no-op)", () => {
    const s = withSource(STEELY, undefined, [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    expect(permanentHasKeyword(s, "elf", "shroud")).toBe(false);
  });
});
