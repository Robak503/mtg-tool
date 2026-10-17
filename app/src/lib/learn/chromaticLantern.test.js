/**
 * chromaticLantern.test.js — "Lands you control have \"{T}: Add one mana of any color.\"" (Chromatic Lantern, play-weighted
 * #85; Joiner Adept with it), 2026-10-17.
 *
 * The grant line had no static descriptor, so no land ever gained the ability and the card parked body-only. An effect that
 * says an object "has" an ability adds that ability to it (CR 113.10), and an object may have several abilities, each its own
 * (CR 113.2c): a Forest beside the Lantern has its own "{T}: Add {G}" AND the granted "{T}: Add one mana of any color". Both
 * cost the same {T}, and a tapped permanent can't be tapped again (CR 107.5), so the grant is a CHOICE of colour on the
 * land's one tap — never a second tap, never more mana. The static applies to whatever its text indicates at any moment
 * (CR 611.3a): the lands its controller controls, never an opponent's.
 *
 * What the runtime honours, and so what the static is emitted for: the plain one-mana grant, merged into a land's own plain
 * one-mana {T} line as more colours (a painful colour the grant also makes is painless through the grant), or taken whole by
 * a land with no mana ability (a fetchland). A land whose own line is anything else — two mana (Ancient Tomb), a count
 * (Gaea's Cradle), a life cost (Mana Confluence), a board-read colour set (Command Tower) — keeps only its own line: an
 * under-offer, never a merged record that makes the own line's amount in any colour.
 *
 * Real oracle fixtures (bundled Scryfall oracle-index.json, read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaSources, canAfford, planPayment } from "./manaModel.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const LANTERN = { name: "Chromatic Lantern", type: "Artifact", mana: "{3}", mana_cost: "{3}",
  oracle: "Lands you control have \"{T}: Add one mana of any color.\"\n{T}: Add one mana of any color." };
const JOINER = { name: "Joiner Adept", type: "Creature — Elf Druid", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "1",
  oracle: "Lands you control have \"{T}: Add one mana of any color.\"" };
const OVERLAID = { name: "Overlaid Terrain", type: "Enchantment", mana: "{2}{G}{G}",
  oracle: "As this enchantment enters, sacrifice all lands you control.\nLands you control have \"{T}: Add two mana of any one color.\"" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", oracle: "{T}: Add {C}." };
const KARPLUSAN = { name: "Karplusan Forest", type: "Land", mana: "", oracle: "{T}: Add {C}.\n{T}: Add {R} or {G}. This land deals 1 damage to you." };
const WILDS = { name: "Evolving Wilds", type: "Land", mana: "",
  oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." };
const TOMB = { name: "Ancient Tomb", type: "Land", mana: "", oracle: "{T}: Add {C}{C}. This land deals 2 damage to you." };
const CRADLE = { name: "Gaea's Cradle", type: "Legendary Land", mana: "", oracle: "{T}: Add {G} for each creature you control." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: "2", toughness: "2", oracle: "" };
// Spells cast from hand.
const WIZARD = { id: "h-wiz", name: "Fugitive Wizard", type: "Creature — Human Wizard", mana: "{U}", mana_cost: "{U}", cmc: 1, power: "1", toughness: "1", oracle: "" };
const BOLT = { id: "h-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, oracle: "Lightning Bolt deals 3 damage to any target." };

const on = (id, card, { tapped = false, controller = "user" } = {}) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), tapped });
function table(userBattlefield, { aiBattlefield = [], hand = [WIZARD, BOLT], life = 20 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: userBattlefield, hand, life, library: [], graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: aiBattlefield },
    },
  };
}
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });
const actions = (s) => legalActionsForPlayer(s, "user");
const castFrom = (s, cardId) => actions(s).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const taps = (s, id) => actions(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const tapFor = (s, id, color) => taps(s, id).find((a) => a.color === color);
const perm = (s, id, who = "user") => s.players[who].battlefield.find((p) => p.id === id);
const records = (s, id, who = "user") => manaSources(s, who).filter((r) => r.permanentId === id);
const colorsOf = (s, id, who = "user") => records(s, id, who).flatMap((r) => r.colors);

describe("the grant is a static: every land its controller controls has the ability", () => {
  it("Chromatic Lantern and Joiner Adept emit the layer-6 land mana grant (the plain one-mana spec)", () => {
    for (const card of [LANTERN, JOINER]) {
      const grants = parseStaticAbilities(card).filter((e) => e.op?.grant?.kind === "mana");
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({
        layer: 6,
        op: { layerOp: "addAbility", grant: { kind: "mana", spec: { colors: ["W", "U", "B", "R", "G"], amount: 1, asChoice: true } } },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Land"] } },
      });
    }
  });

  it("⛔ a grant the runtime doesn't honour emits nothing: two mana of any one colour (Overlaid Terrain)", () => {
    expect(parseStaticAbilities(OVERLAID).filter((e) => e.op?.grant?.kind === "mana")).toEqual([]);
  });
});

describe("the planner: a land beside the Lantern pays a colour it can't make on its own", () => {
  it("a Forest beside a tapped Lantern casts Fugitive Wizard ({U}) — the Forest taps for blue", () => {
    const s = table([on("lantern", LANTERN, { tapped: true }), on("forest", FOREST)]);
    const cast = castFrom(s, "h-wiz");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ forestTapped: perm(out, "forest").tapped, inHand: out.players.user.hand.some((c) => c.id === "h-wiz") }).toEqual({ forestTapped: true, inHand: false });
  });

  it("a Wastes beside a tapped Lantern casts Lightning Bolt ({R}) — the Wastes taps for red", () => {
    const s = table([on("lantern", LANTERN, { tapped: true }), on("wastes", WASTES)]);
    const cast = castFrom(s, "h-bolt");
    expect(cast).toBeDefined();
    expect(perm(dispatchAction(s, cast), "wastes").tapped).toBe(true);
  });

  it("⛔ control: the same Forest with no Lantern can't cast the Wizard", () => {
    expect(castFrom(table([on("forest", FOREST)]), "h-wiz")).toBeUndefined();
  });

  it("⛔ one tap, not extra mana: the Lantern and one Forest make two mana, never three", () => {
    const s = table([on("lantern", LANTERN), on("forest", FOREST)]);
    const src = manaSources(s, "user");
    expect(canAfford(EMPTY, src, cost({ U: 2 }))).toBe(true);
    expect(canAfford(EMPTY, src, cost({ U: 3 }))).toBe(false);
    expect(canAfford(EMPTY, src, cost({ U: 1, generic: 2 }))).toBe(false);
    expect(planPayment(EMPTY, src, cost({ U: 1, R: 1 })).taps.map((t) => t.permanentId).sort()).toEqual(["forest", "lantern"]);
  });
});

describe("the explicit tap: the land offers its own colour and the granted ones, once", () => {
  it("a Forest beside the Lantern is offered for green and every other colour; tapping it for blue taps it", () => {
    const s = table([on("lantern", LANTERN), on("forest", FOREST)]);
    expect(taps(s, "forest").map((a) => a.color)).toEqual(["G", "W", "U", "B", "R"]);
    const out = dispatchAction(s, tapFor(s, "forest", "U"));
    expect({ U: out.players.user.manaPool.U, tapped: perm(out, "forest").tapped }).toEqual({ U: 1, tapped: true });
    // A granted {T} ability can't be activated by a tapped land (CR 107.5): no second tap, whatever the colour.
    expect(taps(out, "forest")).toEqual([]);
    expect(records(out, "forest")).toEqual([]);
  });

  it("a Wastes beside the Lantern taps for red", () => {
    const s = table([on("lantern", LANTERN), on("wastes", WASTES)]);
    const action = tapFor(s, "wastes", "R");
    expect(action).toBeDefined();
    expect(dispatchAction(s, action).players.user.manaPool.R).toBe(1);
  });

  it("a land with no mana ability of its own (Evolving Wilds) taps for any colour through the grant", () => {
    const s = table([on("lantern", LANTERN, { tapped: true }), on("wilds", WILDS)]);
    expect(taps(s, "wilds").map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    expect(castFrom(s, "h-wiz")).toBeDefined();
  });

  it("Karplusan Forest's red through the granted ability is painless; its own {C} stays free", () => {
    const s = table([on("lantern", LANTERN), on("karplusan", KARPLUSAN)]);
    const red = tapFor(s, "karplusan", "R");
    expect(red).toBeDefined();
    expect(red.painLife).toBeUndefined();
    expect(dispatchAction(s, red).players.user.life).toBe(20);
    expect(dispatchAction(s, tapFor(s, "karplusan", "C")).players.user.life).toBe(20);
  });

  it("⛔ control: Karplusan Forest with no Lantern still deals 1 for red", () => {
    const s = table([on("karplusan", KARPLUSAN)]);
    expect(dispatchAction(s, tapFor(s, "karplusan", "R")).players.user.life).toBe(19);
  });
});

describe("⛔ only its controller's lands, and only one-mana lines", () => {
  it("an opponent's Forest does not gain the ability", () => {
    const s = table([on("lantern", LANTERN)], { aiBattlefield: [on("aiForest", FOREST, { controller: "ai" })] });
    expect(colorsOf(s, "aiForest", "ai")).toEqual(["G"]);
  });

  it("an opponent's Lantern does not give my Forest the ability", () => {
    const s = table([on("forest", FOREST)], { aiBattlefield: [on("aiLantern", LANTERN, { controller: "ai" })] });
    expect(colorsOf(s, "forest")).toEqual(["G"]);
    expect(castFrom(s, "h-wiz")).toBeUndefined();
  });

  it("Ancient Tomb keeps its {C}{C}: one tap never makes two coloured mana", () => {
    const s = table([on("lantern", LANTERN), on("tomb", TOMB)]);
    expect(records(s, "tomb")).toMatchObject([{ colors: ["C"], amount: 2 }]);
  });

  it("Gaea's Cradle keeps its count of green: never that many of any colour", () => {
    const s = table([on("lantern", LANTERN), on("cradle", CRADLE), on("bear", BEARS)]);
    expect(records(s, "cradle")).toMatchObject([{ colors: ["G"], amount: 1 }]);
  });
});
