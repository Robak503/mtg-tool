/**
 * multiSubtypeListAnthem.test.js — the LIST subject on a tribal anthem ("Skeletons, Vampires, and Zombies
 * you control get +1/+1" — Death-Priest of Myrkul; "Other Orcs and Goblins you control have menace" — Warg
 * Rider; Ultron, Machine Overlord; The Swarmweaver; Master Trinketeer).
 *
 * ⭐ A MISSING PARSE ARM, NOT A MISSING MECHANIC — which is why the runtime assertions below matter more than
 * the classification ones. `selector.subtypes` was ALWAYS an array and matchesSelector ALWAYS ORed it (its own
 * comment there reads "OR semantics, same as a multi-subtype list"). The downstream half was built for lists
 * and had simply never been handed one, because no parse arm produced a multi-entry array. Same axis shape as
 * the four slices before it: a capability present on one arm of a function and absent on its neighbour.
 *
 * ⛔ THE FAILURE THIS FILE IS BUILT TO CATCH IS THE UNDER-GRANT, and it is invisible to the coverage metric.
 * An arm that read only the FIRST word of the list would flip every one of these cards native, pass any
 * classification-only test, and then quietly buff the Skeletons while the Vampires and Zombies stood there at
 * base stats forever. A legal-looking board with a silently wrong one. So EVERY element of a list is asserted
 * through deriveCharacteristics at runtime — never the parse output alone — and the multi-element lists here
 * exist specifically so a first-word-only implementation fails rather than reads green.
 */
import { describe, it, expect } from "vitest";

import { createGameState } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { deriveCharacteristics } from "./layers.js";

// Real oracle text, verified against the bundled Scryfall snapshot.
const DEATH_PRIEST = {
  name: "Death-Priest of Myrkul",
  type: "Creature — Skeleton Cleric",
  mana: "{1}{B}",
  power: 1, toughness: 3,
  oracle: "Skeletons, Vampires, and Zombies you control get +1/+1.",
};
const WARG_RIDER = {
  name: "Warg Rider",
  type: "Creature — Orc Warrior",
  mana: "{3}{B}",
  power: 3, toughness: 3,
  oracle: "Menace\nOther Orcs and Goblins you control have menace.",
};

const body = (name, id, type, controller = "user", p = 2, t = 2) => ({
  id, controller, card: { name, type, oracle: "", power: p, toughness: t },
  tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
  attachments: [], attachedTo: null, timestamp: 0,
});
const lord = (card, id) => ({
  id, controller: "user", card,
  tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
  attachments: [], attachedTo: null, timestamp: 0,
});
const stateWith = (userBf, aiBf = []) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
};
const pt = (st, id) => { const c = deriveCharacteristics(st, id); return `${c.power}/${c.toughness}`; };

describe("multi-subtype LIST anthem — parse", () => {
  it("⭐ the bare-plural list emits ONE selector carrying ALL the subtypes", () => {
    const st = parseStaticAbilities(DEATH_PRIEST).find((a) => a.affects?.selector?.subtypes);
    expect(st.affects.selector.subtypes).toEqual(["Skeleton", "Vampire", "Zombie"]);
    expect(st.affects.selector.controllerScope).toBe("you");
    expect(st.affects.selector.cardTypes).toEqual(["Creature"]);
    // determiner-less → the source is INCLUDED when it shares a type, matching the one-word branch.
    expect(st.affects.selector.excludeSelf).toBeFalsy();
  });

  it('⭐ the "Other …" determiner list carries excludeSelf', () => {
    const st = parseStaticAbilities(WARG_RIDER).find((a) => a.affects?.selector?.subtypes);
    expect(st.affects.selector.subtypes).toEqual(["Orc", "Goblin"]);
    expect(st.affects.selector.excludeSelf).toBe(true);
  });

  it("both cards classify native", () => {
    expect(isNativeTier(classifyCard(DEATH_PRIEST))).toBe(true);
    expect(isNativeTier(classifyCard(WARG_RIDER))).toBe(true);
  });
});

describe("⛔ RUNTIME — every element of the list is genuinely buffed", () => {
  it("⭐ all THREE subtypes get +1/+1, and a fourth creature gets nothing", () => {
    // ⚠️ THE POINT OF THE WHOLE FILE. A first-word-only arm buffs the Skeleton and reads native; only the
    // Vampire and Zombie assertions can tell the two implementations apart.
    const st = stateWith([
      lord(DEATH_PRIEST, "priest"),
      body("Sk", "sk", "Creature — Skeleton"),
      body("Va", "va", "Creature — Vampire"),
      body("Zo", "zo", "Creature — Zombie"),
      body("Be", "be", "Creature — Bear"),
    ]);
    expect(pt(st, "sk")).toBe("3/3");
    expect(pt(st, "va")).toBe("3/3");
    expect(pt(st, "zo")).toBe("3/3");
    expect(pt(st, "be")).toBe("2/2");   // not on the list — untouched
  });

  it("⛔ the LAST element is buffed too (a truncated list would pass every earlier assertion)", () => {
    const st = stateWith([lord(DEATH_PRIEST, "priest"), body("Zo", "zo", "Creature — Zombie")]);
    expect(pt(st, "zo")).toBe("3/3");
  });

  it("⛔ it does NOT reach across the table — an opponent's Zombie is untouched", () => {
    const st = stateWith([lord(DEATH_PRIEST, "priest")], [body("Zo", "zo", "Creature — Zombie", "ai")]);
    expect(pt(st, "zo")).toBe("2/2");
  });

  it("⛔ the source itself IS buffed by its own determiner-less list (it is a Skeleton)", () => {
    // Death-Priest of Myrkul is "Creature — Skeleton Cleric" and the clause has no "Other", so CR 613 has it
    // buffing itself to 2/4. Asserted because excludeSelf riding a list by accident would be a silent
    // under-grant on the source only — the hardest kind to notice on a board.
    const st = stateWith([lord(DEATH_PRIEST, "priest")]);
    expect(pt(st, "priest")).toBe("2/4");
  });

  it('⛔ "Other" DOES exclude the source — Warg Rider grants menace to Orcs but not to itself via the list', () => {
    const st = parseStaticAbilities(WARG_RIDER).find((a) => a.affects?.selector?.subtypes);
    expect(st.affects.selector.excludeSelf).toBe(true);
    expect(st.affects.selector.subtypes).toContain("Orc");
  });
});

describe("⛔ CREED — a list containing anything that is not a creature subtype PARKS entirely", () => {
  const parks = (oracle) => {
    const card = { name: "X", type: "Creature — Human", mana: "{2}", power: 2, toughness: 2, oracle };
    expect(parseStaticAbilities(card).some((a) => a.affects?.selector?.subtypes?.length > 1)).toBe(false);
    expect(isNativeTier(classifyCard(card))).toBe(false);
  };

  it("⛔ a NON-creature subtype in the list kills the whole clause (Cloudspire Captain)", () => {
    // "Mounts and Vehicles you control get +1/+1". Under a Creature-restricted selector the Vehicles half
    // selects nobody (crew is not modeled), so admitting this would buff only the Mounts while claiming the
    // card native — the Aeronaut Admiral false positive, in list form. All-or-nothing: it parks.
    parks("Mounts and Vehicles you control get +1/+1.");
  });

  it("⛔ card-type words in the list park it", () => {
    parks("Artifacts and Enchantments you control get +1/+1.");
    parks("Tokens and Treasures you control get +1/+1.");
  });

  it("⛔ board-state qualifiers park it", () => {
    parks("Attacking and blocking creatures you control get +1/+1.");
  });

  it("⛔ Foods and Clues — two non-creature artifact subtypes — park it", () => {
    parks("Foods and Clues you control get +1/+1.");
  });

  it("⛔⭐ A LAND subtype in the list parks it — Timber Protector, the FP this slice actually shipped", () => {
    // ⚠️ THE MOST IMPORTANT PIN IN THIS FILE, because it is the one I got wrong. The first cut of the list arm
    // flipped Timber Protector ("Other Treefolk and Forests you control have indestructible") native: "forest"
    // passed every guard, because NON_CREATURE_SUBTYPES covered artifact and enchantment subtypes and had no
    // LAND types at all. Under the Creature-restricted selector the Forests half selects nothing, so the card
    // would have claimed native while granting indestructible to the Treefolk only — an under-grant on half
    // its printed text, permanently, with a green suite.
    //
    // ⭐ IT WAS FOUND BY AUDITING A GAINED ROW, NOT BY REASONING. The slice predicted 6 flips and the tier diff
    // reported 8; the two unforecast names are what exposed it. A gain you did not predict is evidence about
    // the build, not a bonus — that is the whole reason every GAINED row gets a name audit.
    parks("Other Treefolk and Forests you control have indestructible.");
    parks("Elves and Islands you control get +1/+1.");
  });
});

describe("the one-word sibling is untouched", () => {
  it("⭐ a single subtype still parses through its own branch, with a one-entry array", () => {
    const card = { name: "X", type: "Creature — Human", mana: "{2}", power: 2, toughness: 2,
      oracle: "Zombies you control get +1/+1." };
    const st = parseStaticAbilities(card).find((a) => a.affects?.selector?.subtypes);
    expect(st.affects.selector.subtypes).toEqual(["Zombie"]);
  });

  it("⛔ and the one-word NON-creature guard still parks Aeronaut Admiral's clause", () => {
    const card = { name: "X", type: "Creature — Human", mana: "{2}", power: 2, toughness: 2,
      oracle: "Vehicles you control have flying." };
    expect(isNativeTier(classifyCard(card))).toBe(false);
  });
});
