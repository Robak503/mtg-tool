/**
 * fetchLandCrack.test.js — the AI cracks its fetch lands (2026-10-17).
 *
 * The bug: the default AI never activated a sacrifice-self fetch land. `pickSafeAbilityActivation` skips every ability whose
 * cost sacrifices its source, so Evolving Wilds, Terramorphic Expanse, Fabled Passage, Prismatic Vista and the Zendikar /
 * Onslaught fetches sat on the battlefield as lands that make nothing — in 24 of the 30 profile decks. And when a search to
 * the battlefield did resolve, the auto-pick took the highest mana value, then the alphabetically first name, so a fetch for
 * a basic took a Forest whatever the hand needed.
 *
 * The policy, as an AI choice among offered actions (the engine's offer and resolution are unchanged):
 *   · a FETCH LAND is a land whose ability is "{T}, [Pay N life,] Sacrifice this land: Search your library for a … land card,
 *     put it onto the battlefield [tapped], then shuffle." — no mana in the cost, no other cost, one land to the battlefield.
 *     Every other sacrifice-self ability stays skipped (Sakura-Tribe Elder, Mind Stone, Terminal Moraine's {2} fetch).
 *   · it is cracked in the AI's own main phase, with the stack empty, BEFORE casting (an untapped fetched land pays for this
 *     turn's spells) — when the library still holds a land it can find, and a life cost leaves the AI at 10 or more (the life
 *     prudence floor its other life payments use);
 *   · a fetch land that also taps for mana (the Landscapes' "{T}: Add {C}.") is cracked only after the casts, while it is still
 *     untapped, and only when it can find a colour the hand or command zone needs and no battlefield source makes;
 *   · the search takes the land that makes the colour the AI needs most: the unmet pips of the hand and command zone first,
 *     then all their pips, then the old order (highest mana value, then name). Only a fetch land's own search read it here;
 *     since 2026-10-17 every search for a land card does (fetchLandDrop.test.js).
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const land = (name, type, oracle) => ({ name, type, mana: "", cmc: 0, colors: [], keywords: [], oracle });
const EVOLVING_WILDS = land("Evolving Wilds", "Land", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.");
const FABLED_PASSAGE = land("Fabled Passage", "Land", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.");
const VERDANT_CATACOMBS = land("Verdant Catacombs", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Swamp or Forest card, put it onto the battlefield, then shuffle.");
const POLLUTED_DELTA = land("Polluted Delta", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.");
const PRISMATIC_VISTA = land("Prismatic Vista", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield, then shuffle.");
const BOUNTIFUL_LANDSCAPE = { ...land("Bountiful Landscape", "Land", "{T}: Add {C}.\n{T}, Sacrifice this land: Search your library for a basic Forest, Island, or Mountain card, put it onto the battlefield tapped, then shuffle.\nCycling {G}{U}{R} ({G}{U}{R}, Discard this card: Draw a card.)"), keywords: ["Cycling"] };
const TERMINAL_MORAINE = land("Terminal Moraine", "Land", "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.");
const OVERGROWN_TOMB = land("Overgrown Tomb", "Land — Swamp Forest", "({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.");
const FOREST = land("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const SWAMP = land("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)");
const ISLAND = land("Island", "Basic Land — Island", "({T}: Add {U}.)");
const MOUNTAIN = land("Mountain", "Basic Land — Mountain", "({T}: Add {R}.)");
const PLAINS = land("Plains", "Basic Land — Plains", "({T}: Add {W}.)");
const SAKURA_TRIBE_ELDER = { name: "Sakura-Tribe Elder", type: "Creature — Snake Shaman", mana: "{1}{G}", cmc: 2, power: "1", toughness: "1", colors: ["G"], keywords: [],
  oracle: "Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const RAMPANT_GROWTH = { name: "Rampant Growth", type: "Sorcery", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [],
  oracle: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." };
const TYPHOID_RATS = { name: "Typhoid Rats", type: "Creature — Rat", mana: "{B}", cmc: 1, power: "1", toughness: "1", colors: ["B"], keywords: ["Deathtouch"],
  oracle: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)" };
const VAMPIRE_NIGHTHAWK = { name: "Vampire Nighthawk", type: "Creature — Vampire Shaman", mana: "{1}{B}{B}", cmc: 3, power: "2", toughness: "3", colors: ["B"], keywords: ["Deathtouch", "Flying", "Lifelink"],
  oracle: "Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)" };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", colors: ["G"], keywords: [], oracle: "" };
const LLANOWAR_ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, power: "1", toughness: "1", colors: ["G"], keywords: [], oracle: "{T}: Add {G}." };
const SERRA_ANGEL = { name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", cmc: 5, power: "4", toughness: "4", colors: ["W"], keywords: ["Flying", "Vigilance"],
  oracle: "Flying\nVigilance (Attacking doesn't cause this creature to tap.)" };
const OPT = { name: "Opt", type: "Instant", mana: "{U}", cmc: 1, colors: ["U"], keywords: ["Scry"],
  oracle: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." };

/** The AI's main phase: `bf` = [[permId, card]] untapped and not summoning-sick, `hand` / `library` = [[cardId, card]]. */
function table({ bf = [], hand = [], library = [], life = 40, stack = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = ([id, c]) => createPermanent({ id, controller: "ai", summoningSick: false, card: { ...c, id: `c-${id}` } });
  const cards = (list) => list.map(([id, c]) => ({ ...c, id }));
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack,
    players: { ...s0.players, ai: { ...s0.players.ai, life, landsPlayedThisTurn: 1, battlefield: bf.map(P), hand: cards(hand), library: cards(library) } } };
}
const isActivation = (a, permId) => !!a && a.kind === "activate-ability" && a.permanentId === permId;
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
/** Crack `permId` (the offered activation), resolve it, and return the state paused on the search plus the AI's pick. */
function crackAndPick(s, permId) {
  const act = legalActionsForPlayer(s, "ai").find((a) => isActivation(a, permId));
  expect(act).toBeTruthy();
  const n = resolveTopOfStack(dispatchAction(s, act));
  expect(n.pendingChoice?.kind).toBe("tutor-search");
  return { n, pick: autoPickTutorCandidate(n, n.pendingChoice) };
}

describe("the AI cracks a fetch land", () => {
  it("⭐ Evolving Wilds — cracked in its own main phase when the library holds a basic", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS], ["m1", MOUNTAIN]], hand: [["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", FOREST], ["l2", ISLAND], ["l3", SWAMP]] });
    expect(isActivation(aiPick(s), "wilds")).toBe(true);
  });

  it("⭐ Fabled Passage — the same shape (its untap rider is not modelled; the land arrives tapped)", () => {
    const s = table({ bf: [["fp", FABLED_PASSAGE]], hand: [["h1", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(isActivation(aiPick(s), "fp")).toBe(true);
  });

  it("⭐ Verdant Catacombs — cracked at 40 life, the 1 life paid and the Swamp entering untapped", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS]], hand: [["h1", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(isActivation(aiPick(s), "vc")).toBe(true);
    const { n, pick } = crackAndPick(s, "vc");
    expect(n.players.ai.life).toBe(39);
    expect(pick).toBe("l2");
    const after = resolveTutorChoice(n, pick);
    const swamp = after.players.ai.battlefield.find((p) => p.card.name === "Swamp");
    expect(swamp && swamp.tapped).toBe(false);
    expect(after.players.ai.graveyard.map((c) => c.name)).toContain("Verdant Catacombs");
  });

  it("⭐ a Zendikar fetch is cracked at exactly the floor: life 11 pays 1 and stays at 10", () => {
    const s = table({ bf: [["pd", POLLUTED_DELTA]], hand: [["h1", OPT]], library: [["l1", ISLAND]], life: 11 });
    expect(isActivation(aiPick(s), "pd")).toBe(true);
  });

  it("⭐ an untapped-delivery fetch is cracked BEFORE a castable spell (the fetched land pays for this turn)", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS], ["s1", SWAMP]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP], ["l2", FOREST]] });
    expect(legalActionsForPlayer(s, "ai").some((a) => a.kind === "cast-spell" && a.cardId === "h1")).toBe(true);
    expect(isActivation(aiPick(s), "vc")).toBe(true);
  });

  it("⭐ a tapped-delivery fetch is cracked before a castable spell too (it makes no mana of its own)", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS], ["s1", SWAMP]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP]] });
    expect(isActivation(aiPick(s), "wilds")).toBe(true);
  });

  it("⭐ a fetch land that taps for mana (Bountiful Landscape) is cracked after the casts when it finds a needed colour", () => {
    // Forest + the Landscape's {C}: Opt's {U} is unmet and unpayable, so nothing is cast; the Landscape finds an Island.
    const s = table({ bf: [["bl", BOUNTIFUL_LANDSCAPE], ["f1", FOREST]], hand: [["h1", OPT]], library: [["l1", ISLAND], ["l2", MOUNTAIN]] });
    expect(isActivation(aiPick(s), "bl")).toBe(true);
    const { pick } = crackAndPick(s, "bl");
    expect(pick).toBe("l1");
  });

  it("⭐ the policy seam: `fetch` is a POLICY_KEYS subsystem", () => {
    expect(POLICY_KEYS).toContain("fetch");
  });
});

describe("controls — the AI holds", () => {
  it("control — a Zendikar fetch at the floor: life 10 would pay to 9", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP]], life: 10 });
    expect(legalActionsForPlayer(s, "ai").some((a) => isActivation(a, "vc"))).toBe(true);
    expect(isActivation(aiPick(s), "vc")).toBe(false);
  });

  it("control — a Zendikar fetch at 1 life", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS]], hand: [], library: [["l1", SWAMP]], life: 1 });
    expect(isActivation(aiPick(s), "vc")).toBe(false);
  });

  it("control — the library holds no land the fetch can find (Islands and a creature for a Swamp-or-Forest fetch)", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS]], hand: [["h1", TYPHOID_RATS]], library: [["l1", ISLAND], ["l2", GRIZZLY_BEARS], ["l3", MOUNTAIN]] });
    expect(legalActionsForPlayer(s, "ai").some((a) => isActivation(a, "vc"))).toBe(true);
    expect(isActivation(aiPick(s), "vc")).toBe(false);
  });

  it("control — Evolving Wilds with no basic land left in the library", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS]], hand: [], library: [["l1", GRIZZLY_BEARS], ["l2", OVERGROWN_TOMB]] });
    expect(isActivation(aiPick(s), "wilds")).toBe(false);
  });

  it("control — with something on the stack the AI does not crack (its own main phase, an empty stack)", () => {
    const s0 = table({ bf: [["wilds", EVOLVING_WILDS], ["s1", SWAMP]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP]] });
    const cast = legalActionsForPlayer(s0, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h1");
    const s = dispatchAction(s0, cast);
    expect(s.stack.length).toBe(1);
    expect(legalActionsForPlayer(s, "ai").some((a) => isActivation(a, "wilds"))).toBe(true);
    expect(isActivation(aiPick(s), "wilds")).toBe(false);
  });

  it("control — the mana-making Landscape is not cracked ahead of a castable spell", () => {
    const s = table({ bf: [["bl", BOUNTIFUL_LANDSCAPE], ["f1", FOREST]], hand: [["h1", GRIZZLY_BEARS]], library: [["l1", ISLAND]] });
    const a = aiPick(s);
    expect(a?.kind).toBe("cast-spell");
    expect(a.cardId).toBe("h1");
  });

  it("control — the mana-making Landscape is not cracked when it would find no colour the hand lacks", () => {
    const s = table({ bf: [["bl", BOUNTIFUL_LANDSCAPE], ["f1", FOREST]], hand: [["h1", { ...GRIZZLY_BEARS, mana: "{2}{G}{G}", cmc: 4 }]], library: [["l1", FOREST], ["l2", MOUNTAIN]] });
    expect(isActivation(aiPick(s), "bl")).toBe(false);
  });

  it("control — every other sacrifice-self ability stays skipped: Sakura-Tribe Elder, Mind Stone, Terminal Moraine's {2} fetch", () => {
    const s = table({ bf: [["ste", SAKURA_TRIBE_ELDER], ["ms", MIND_STONE], ["tm", TERMINAL_MORAINE], ["f1", FOREST], ["f2", FOREST], ["f3", FOREST]],
      hand: [], library: [["l1", SWAMP], ["l2", FOREST], ["l3", GRIZZLY_BEARS]] });
    const offered = legalActionsForPlayer(s, "ai");
    for (const id of ["ste", "ms", "tm"]) expect(offered.some((a) => isActivation(a, id) && a.sacSelf)).toBe(true);
    const a = aiPick(s);
    expect(["ste", "ms", "tm"].some((id) => isActivation(a, id) && a.sacSelf)).toBe(false);
  });

  it("control — Terminal Moraine's {2} fetch stays skipped even when it could find the colour the hand lacks", () => {
    // Three Forests and the Moraine; Typhoid Rats' {B} is unmet and uncastable, the library holds a Swamp — the Landscape rule
    // would crack a free "{T}, Sacrifice" fetch here, but this one costs mana, so it is no fetch land.
    const s = table({ bf: [["tm", TERMINAL_MORAINE], ["f1", FOREST], ["f2", FOREST], ["f3", FOREST]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP], ["l2", FOREST]] });
    expect(legalActionsForPlayer(s, "ai").some((a) => isActivation(a, "tm") && a.sacSelf)).toBe(true);
    const a = aiPick(s);
    expect(isActivation(a, "tm") && a.sacSelf).toBe(false);
  });

  it("control — policy { fetch: \"v1\" } recovers the legacy hold", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS]], hand: [["h1", TYPHOID_RATS]], library: [["l1", SWAMP]] });
    expect(isActivation(aiPick(s, { policy: { fetch: "v1" } }), "wilds")).toBe(false);
  });
});

describe("the fetch's search takes the colour the AI needs", () => {
  it("⭐ Evolving Wilds beside a Mountain with Vampire Nighthawk in hand takes the Swamp, not the alphabetically first Forest", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS], ["m1", MOUNTAIN]], hand: [["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", FOREST], ["l2", ISLAND], ["l3", SWAMP]] });
    expect(crackAndPick(s, "wilds").pick).toBe("l3");
  });

  it("⭐ Verdant Catacombs with black and green both unmet takes Overgrown Tomb (both colours) over either basic", () => {
    const s = table({ bf: [["vc", VERDANT_CATACOMBS]], hand: [["h1", TYPHOID_RATS], ["h2", GRIZZLY_BEARS]], library: [["l1", FOREST], ["l2", SWAMP], ["l3", OVERGROWN_TOMB]] });
    expect(crackAndPick(s, "vc").pick).toBe("l3");
  });

  it("⭐ Prismatic Vista takes the colour with the most unmet pips: Plains for Serra Angel's {W}{W} over Island for Opt's {U}", () => {
    const s = table({ bf: [["pv", PRISMATIC_VISTA]], hand: [["h1", SERRA_ANGEL], ["h2", OPT]], library: [["l1", ISLAND], ["l2", PLAINS]] });
    expect(crackAndPick(s, "pv").pick).toBe("l2");
  });

  it("⭐ an unmet colour outranks a colour already made that the hand asks for more (Swamp for Typhoid Rats over a third green source)", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS], ["f1", FOREST]], hand: [["h1", GRIZZLY_BEARS], ["h2", LLANOWAR_ELVES], ["h3", TYPHOID_RATS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(crackAndPick(s, "wilds").pick).toBe("l2");
  });

  it("⭐ with every colour already made, it takes the colour the hand asks for most (two black pips over one green)", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS], ["f1", FOREST], ["s1", SWAMP]], hand: [["h1", VAMPIRE_NIGHTHAWK], ["h2", GRIZZLY_BEARS]], library: [["l1", FOREST], ["l2", SWAMP]] });
    expect(crackAndPick(s, "wilds").pick).toBe("l2");
  });

  it("control — with an empty hand nothing is asked for, and the old order stands (highest mana value, then name)", () => {
    const s = table({ bf: [["wilds", EVOLVING_WILDS]], hand: [], library: [["l1", SWAMP], ["l2", FOREST], ["l3", ISLAND]] });
    expect(crackAndPick(s, "wilds").pick).toBe("l2");
  });

  // 2026-10-17 (fetchLandDrop.test.js): every search for a land card now reads the colour, not only a fetch land's — this was
  // the control pinning Rampant Growth's old order (the Forest).
  it("⭐ a search that is not a fetch land's reads the colour too: Rampant Growth takes the Swamp the hand asks for", () => {
    const s = table({ bf: [["f1", FOREST], ["f2", FOREST]], hand: [["rg", RAMPANT_GROWTH], ["h1", VAMPIRE_NIGHTHAWK]], library: [["l1", SWAMP], ["l2", FOREST]] });
    const cast = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "rg");
    const n = resolveTopOfStack(dispatchAction(s, cast));
    expect(n.pendingChoice?.kind).toBe("tutor-search");
    expect(autoPickTutorCandidate(n, n.pendingChoice)).toBe("l1");
  });
});
