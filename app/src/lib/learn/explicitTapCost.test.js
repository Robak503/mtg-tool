/**
 * explicitTapCost.test.js — the explicit "tap for mana" action (legalChoices.actionsTapForMana → actionDispatcher →
 * manaModel.commitManaTap) honours every printed cost and condition the auto-pay planner honours (2026-10-16).
 *
 * The bug: the action a person takes on the Learn board read the card's production alone and ignored the cost flags
 * manaModel.manaSources resolves for the planner — Ashnod's Altar made {C}{C} with no creature sacrificed, Mox Opal tapped
 * without metalcraft, Birchlore Rangers tapped alone, Mana Confluence and Adarkar Wastes made coloured mana without the
 * life. A mana ability is activated like any ability (CR 602.2b), so its whole cost is paid and partial payments are not
 * allowed (CR 601.2h); an "Activate only if" ability can't be activated while its condition is false (CR 602.5). So a free
 * or partial version is never offered.
 *
 * Now the explicit tap offers the planner's own source records (manaSources) and commits the planner's own tap record,
 * re-derived from the board at dispatch rather than read off the action.
 *
 * Real oracle fixtures (bundled Scryfall oracle-index.json, read in-session 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const ASHNOD = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add {C}{C}." };
const MOX_OPAL = { name: "Mox Opal", type: "Legendary Artifact", mana: "{0}", oracle: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts." };
const RANGERS = { name: "Birchlore Rangers", type: "Creature — Elf Druid Ranger", mana: "{G}", power: "1", toughness: "1",
  oracle: "Tap two untapped Elves you control: Add one mana of any color.\nMorph {G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" };
const CONFLUENCE = { name: "Mana Confluence", type: "Land", mana: "", oracle: "{T}, Pay 1 life: Add one mana of any color." };
const ADARKAR = { name: "Adarkar Wastes", type: "Land", mana: "", oracle: "{T}: Add {C}.\n{T}: Add {W} or {U}. This land deals 1 damage to you." };
const CANOPY = { name: "Horizon Canopy", type: "Land", mana: "", oracle: "{T}, Pay 1 life: Add {G} or {W}.\n{1}, {T}, Sacrifice this land: Draw a card." };
const DRUM = { name: "Springleaf Drum", type: "Artifact", mana: "{1}", oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." };
const MOLT = { name: "Molt Tender", type: "Creature — Insect Druid", mana: "{G}", power: "1", toughness: "1",
  oracle: "{T}: Mill a card. (Put the top card of your library into your graveyard.)\n{T}, Exile a card from your graveyard: Add one mana of any color." };
const ENDRIDER = { name: "Endrider Catalyzer", type: "Creature — Human Warrior", mana: "{1}{R}", power: "3", toughness: "1",
  oracle: "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nMax speed — {T}: Add {R}{R}." };
const SPIRIT_GUIDE = { name: "Elvish Spirit Guide", type: "Creature — Elf Spirit", mana: "{2}{G}", power: "2", toughness: "2", oracle: "Exile this card from your hand: Add {G}." };
const PLAZA = { name: "Plaza of Heroes", type: "Land", mana: "",
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell.\n{T}: Add one mana of any color among legendary permanents you control.\n{3}, {T}, Exile this land: Target legendary creature gains hexproof and indestructible until end of turn." };
const INCUBATION = { name: "Incubation Druid", type: "Creature — Elf Druid", mana: "{1}{G}", power: "0", toughness: "2",
  oracle: "{T}: Add one mana of any type that a land you control could produce. If this creature has a +1/+1 counter on it, add three mana of that type instead.\n{3}{G}{G}: Adapt 3. (If this creature has no +1/+1 counters on it, put three +1/+1 counters on it.)" };
const WORKSHOP = { name: "Mishra's Workshop", type: "Land", mana: "", oracle: "{T}: Add {C}{C}{C}. Spend this mana only to cast artifact spells." };
const PATH = { name: "Path of Ancestry", type: "Land", mana: "",
  oracle: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const RELIC = { name: "Darksteel Relic", type: "Artifact", mana: "{0}", oracle: "Indestructible (Effects that say \"destroy\" don't destroy this artifact.)" };
const MYSTIC = { name: "Elvish Mystic", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: "2", toughness: "2", oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const REFLECTION = { name: "Mana Reflection", type: "Enchantment", mana: "{4}{G}{G}", oracle: "If you tap a permanent for mana, it produces twice as much of that mana instead." };
const GAEAS_CRADLE = { name: "Gaea's Cradle", type: "Legendary Land", mana: "", oracle: "{T}: Add {G} for each creature you control." };
const STARTING_TOWN = { name: "Starting Town", type: "Land — Town", mana: "",
  oracle: "This land enters tapped unless it's your first, second, or third turn of the game.\n{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color." };

const on = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
function table(battlefield, { life = 20, graveyard = [], hand = [], speed } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, graveyard, hand, life, library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, ...(speed != null ? { speed } : {}) } },
  };
}
const taps = (s, id = "src") => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const colorsOffered = (s, id = "src") => taps(s, id).map((a) => a.color);
const tapFor = (s, color, id = "src") => taps(s, id).find((a) => a.color === color);
const pool = (s) => s.players.user.manaPool;
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

describe("the explicit tap offers a source only when its printed cost and condition can be met", () => {
  it("Ashnod's Altar: no creature to sacrifice → not offered; with one → offered for {C}{C}", () => {
    expect(taps(table([on("src", ASHNOD)]))).toEqual([]);
    expect(taps(table([on("src", ASHNOD), on("bear", BEARS)]))).toMatchObject([{ color: "C", amount: 2, sacrificesCreature: true }]);
  });

  it("Mox Opal: metalcraft unmet → not offered (CR 602.5); three artifacts → offered", () => {
    expect(taps(table([on("src", MOX_OPAL)]))).toEqual([]);
    expect(taps(table([on("src", MOX_OPAL), on("r1", RELIC)]))).toEqual([]);
    expect(colorsOffered(table([on("src", MOX_OPAL), on("r1", RELIC), on("r2", RELIC)]))).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("Birchlore Rangers: alone it can't tap two Elves → not offered; beside another Elf → offered", () => {
    expect(taps(table([on("src", RANGERS)]))).toEqual([]);
    expect(colorsOffered(table([on("src", RANGERS), on("myst", MYSTIC)]))).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("Mana Confluence: at 1 life the life payment isn't taken → not offered; at 20 → offered carrying the cost", () => {
    expect(taps(table([on("src", CONFLUENCE)], { life: 1 }))).toEqual([]);
    expect(tapFor(table([on("src", CONFLUENCE)]), "B")).toMatchObject({ payLifeCost: 1 });
  });

  it("Springleaf Drum: no creature to tap → not offered; with one → offered", () => {
    expect(taps(table([on("src", DRUM)]))).toEqual([]);
    expect(tapFor(table([on("src", DRUM), on("bear", BEARS)]), "G")).toMatchObject({ extraTaps: ["bear"] });
  });

  it("Molt Tender: an empty graveyard can't pay the exile → not offered", () => {
    expect(taps(table([on("src", MOLT)]))).toEqual([]);
  });

  it("Endrider Catalyzer: a Max speed ability below speed 4 → not offered; at speed 4 → {R}{R}", () => {
    expect(taps(table([on("src", ENDRIDER)], { speed: 0 }))).toEqual([]);
    expect(taps(table([on("src", ENDRIDER)], { speed: 4 }))).toMatchObject([{ color: "R", amount: 2 }]);
  });

  it("Elvish Spirit Guide on the battlefield has no mana ability to activate there → not offered", () => {
    expect(taps(table([on("src", SPIRIT_GUIDE)]))).toEqual([]);
  });

  it("Plaza of Heroes: no colour among legendary permanents → no coloured tap; with Isamaru → white only", () => {
    expect(colorsOffered(table([on("src", PLAZA)])).filter((c) => c !== "C")).toEqual([]);
    expect(colorsOffered(table([on("src", PLAZA), on("dog", ISAMARU)])).filter((c) => c !== "C")).toEqual(["W"]);
  });

  it("Incubation Druid: no land → no type to make → not offered; beside a Forest → green only", () => {
    expect(taps(table([on("src", INCUBATION)]))).toEqual([]);
    expect(colorsOffered(table([on("src", INCUBATION), on("f", FOREST)]))).toEqual(["G"]);
  });

  it("Mishra's Workshop: spend-restricted mana can't float into the open pool (CR 106.6) → not offered by hand", () => {
    expect(taps(table([on("src", WORKSHOP)]))).toEqual([]);
  });

  it("Path of Ancestry: a 'when that mana is spent' rider can't ride floating mana → not offered by hand", () => {
    expect(taps(table([on("src", PATH)]))).toEqual([]);
  });
});

describe("and pays that cost when taken", () => {
  it("Ashnod's Altar sacrifices a creature for its {C}{C}", () => {
    const s = table([on("src", ASHNOD), on("bear", BEARS)]);
    const out = dispatchAction(s, tapFor(s, "C"));
    expect({ C: pool(out).C, bear: !!perm(out, "bear"), inGraveyard: out.players.user.graveyard.some((c) => c.name === "Grizzly Bears"), altar: !!perm(out, "src") })
      .toEqual({ C: 2, bear: false, inGraveyard: true, altar: true });
  });

  it("Birchlore Rangers taps two untapped Elves", () => {
    const s = table([on("src", RANGERS), on("myst", MYSTIC)]);
    const out = dispatchAction(s, tapFor(s, "G"));
    expect({ G: pool(out).G, rangers: perm(out, "src").tapped, mystic: perm(out, "myst").tapped }).toEqual({ G: 1, rangers: true, mystic: true });
  });

  it("Mana Confluence pays 1 life", () => {
    const s = table([on("src", CONFLUENCE)]);
    const out = dispatchAction(s, tapFor(s, "B"));
    expect({ B: pool(out).B, life: out.players.user.life }).toEqual({ B: 1, life: 19 });
  });

  it("Adarkar Wastes deals 1 for {W} or {U}; its {C} stays free", () => {
    const s = table([on("src", ADARKAR)]);
    expect([dispatchAction(s, tapFor(s, "W")).players.user.life, dispatchAction(s, tapFor(s, "U")).players.user.life, dispatchAction(s, tapFor(s, "C")).players.user.life])
      .toEqual([19, 19, 20]);
  });

  it("Horizon Canopy pays 1 life", () => {
    const s = table([on("src", CANOPY)]);
    expect(dispatchAction(s, tapFor(s, "W")).players.user.life).toBe(19);
  });

  it("Springleaf Drum taps the creature beside itself", () => {
    const s = table([on("src", DRUM), on("bear", BEARS)]);
    const out = dispatchAction(s, tapFor(s, "U"));
    expect({ U: pool(out).U, drum: perm(out, "src").tapped, bear: perm(out, "bear").tapped }).toEqual({ U: 1, drum: true, bear: true });
  });

  it("Molt Tender exiles a card from its controller's graveyard", () => {
    const s = table([on("src", MOLT)], { graveyard: [{ id: "g1", name: "Forest", type: "Basic Land — Forest" }] });
    const out = dispatchAction(s, tapFor(s, "R"));
    expect({ R: pool(out).R, graveyard: out.players.user.graveyard.length, exiled: out.players.user.exile.some((c) => c.id === "g1") }).toEqual({ R: 1, graveyard: 0, exiled: true });
  });
});

describe("the dispatcher pays from the source, never from the action", () => {
  it("a hand-built Mana Confluence tap that names no cost still pays the life", () => {
    const s = table([on("src", CONFLUENCE)]);
    const out = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "src", color: "G", amount: 1 });
    expect({ G: pool(out).G, life: out.players.user.life }).toEqual({ G: 1, life: 19 });
  });

  it("a hand-built Mox Opal tap without metalcraft is refused", () => {
    const s = table([on("src", MOX_OPAL)]);
    expect(() => dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "src", color: "U", amount: 1 })).toThrow(/can't be tapped/);
  });

  it("a hand-built Ashnod's Altar tap with no creature to sacrifice is refused", () => {
    const s = table([on("src", ASHNOD)]);
    expect(() => dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "src", color: "C", amount: 2 })).toThrow(/can't be tapped/);
  });
});

describe("one tap record — the explicit tap commits exactly what the planner commits", () => {
  // The planner's tap for one pip of `color` paid by `id` alone, against the action offered for that colour.
  const plannerTap = (s, id, color) => planPayment(pool(s), manaSources(s, "user").filter((r) => r.permanentId === id), { [color]: 1 }).taps[0];
  const committed = (action) => { const { kind: _k, playerId: _p, name: _n, sacrifices, activationCost: _a, ...rest } = action; return sacrifices ? { ...rest, sacrifices } : rest; };
  it.each([
    ["Mana Confluence", [on("src", CONFLUENCE)], "B"],
    ["Adarkar Wastes", [on("src", ADARKAR)], "W"],
    ["Birchlore Rangers", [on("src", RANGERS), on("myst", MYSTIC)], "G"],
    ["Ashnod's Altar", [on("src", ASHNOD), on("bear", BEARS)], "C"],
    ["Springleaf Drum", [on("src", DRUM), on("bear", BEARS)], "R"],
    ["a Forest under Mana Reflection", [on("src", FOREST), on("refl", REFLECTION)], "G"],
  ])("%s", (_name, battlefield, color) => {
    const s = table(battlefield);
    expect(committed(tapFor(s, color))).toEqual(plannerTap(s, "src", color));
  });
});

describe("guards on the shared read (pinned for the mutation check)", () => {
  it("a Spirit Guide in HAND is a planner source, never a tap-for-mana option", () => {
    const s = table([], { hand: [{ id: "esg", ...SPIRIT_GUIDE }] });
    expect(manaSources(s, "user").some((r) => r.permanentId === "esg")).toBe(true);
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "tap-for-mana")).toBe(false);
  });

  it("Starting Town: its free {C} is offered by hand; its pay-life any-colour EXTRA line stays planner-only", () => {
    const s = table([on("src", STARTING_TOWN)]);
    expect(manaSources(s, "user").filter((r) => r.permanentId === "src").map((r) => r.colors.length)).toEqual([1, 5]);
    expect(taps(s)).toMatchObject([{ color: "C", amount: 1 }]);
    expect(taps(s)).toHaveLength(1);
  });

  it("Gaea's Cradle with no creature makes nothing → no 0-mana tap is offered", () => {
    expect(taps(table([on("src", GAEAS_CRADLE)]))).toEqual([]);
    expect(taps(table([on("src", GAEAS_CRADLE), on("bear", BEARS)]))).toMatchObject([{ color: "G", amount: 1 }]);
  });
});
