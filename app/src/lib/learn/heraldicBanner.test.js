/**
 * heraldicBanner.test.js — the play-weighted program, #856 Heraldic Banner.
 *
 *   "As this artifact enters, choose a color.
 *    Creatures you control of the chosen color get +1/+0.
 *    {T}: Add one mana of the chosen color."
 *
 * The chooser and the mana line were modeled (the enter site stamps `chosenColor` on any permanent whose text prints the
 * choice; the mana model's chosen-colour leg reads it — Coldsteel Heart). The anthem was not: "creatures [you control] of the
 * chosen color get …" now parses to a layer-7c anthem whose selector carries `chosenColorOfSource` (layers.matchesSelector
 * reads the SOURCE permanent's stored colour against the candidate's colours as they are now — layer 5, CR 105.2, 613.1e).
 * No colour stamped → the anthem touches nobody. A chosen-colour line on a card that prints no colour choice is not read
 * (nothing would ever stamp a colour for it).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const BANNER = {"name":"Heraldic Banner","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+0.\n{T}: Add one mana of the chosen color."}; // body-only #856
const GAUNTLET = {"name":"Gauntlet of Power","type":"Artifact","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"As this artifact enters, choose a color.\nCreatures of the chosen color get +1/+1.\nWhenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color."}; // body-only #2592
const PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""}; // native-body
const RECKONER = {"name":"Boros Reckoner","type":"Creature — Minotaur Wizard","mana":"{R/W}{R/W}{R/W}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R","W"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to any target.\n{R/W}: This creature gains first strike until end of turn."}; // body-only
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const banner = (chosenColor, id = "banner", controller = "user") => P(id, BANNER, controller, chosenColor ? { chosenColor } : {});

function table({ user = [], ai = [], hand = [], library = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [] };
  players.user = { ...players.user, battlefield: user, hand, library };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const pt = (s, id) => [permanentPower(s, id), permanentToughness(s, id)];

describe("parse + classification", () => {
  it("the anthem parses to a +1/+0 layer-7c pump on the controller's creatures of the source's chosen colour", () => {
    const pump = parseStaticAbilities(BANNER).find((e) => e.layer === 7);
    expect(pump).toMatchObject({ sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 0 },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], chosenColorOfSource: true } } });
  });

  it("Heraldic Banner classifies native", () => {
    expect(isNativeTier(classifyCard(BANNER))).toBe(true);
  });

  it("CREED — without the colour chooser the chosen-colour anthem is not read", () => {
    const noChooser = { ...BANNER, oracle: "Creatures you control of the chosen color get +1/+0." };
    expect(parseStaticAbilities(noChooser).filter((e) => e.layer === 7)).toHaveLength(0);
    expect(isNativeTier(classifyCard(noChooser))).toBe(false);
  });

  it("Gauntlet of Power — its mana trigger was modeled 2026-10-17 (manaTriggerAugments.test.js), so it is native now; without its chooser it is not", () => {
    expect(isNativeTier(classifyCard(GAUNTLET))).toBe(true);
    const noChooser = { ...GAUNTLET, oracle: GAUNTLET.oracle.replace("As this artifact enters, choose a color.\n", "") };
    expect(isNativeTier(classifyCard(noChooser))).toBe(false);
  });
});

describe("RUNTIME — the anthem reads the Banner's chosen colour", () => {
  it("⭐ Banner on red: the user's red creatures get +1/+0 (a red-white one too); green, colourless and the opponent's red do not", () => {
    const s = table({
      user: [banner("R"), P("piker", PIKER, "user"), P("bear", BEARS, "user"), P("memnite", MEMNITE, "user"), P("reck", RECKONER, "user")],
      ai: [P("giant", GIANT, "ai")],
    });
    expect(pt(s, "piker")).toEqual([3, 1]);
    expect(pt(s, "reck")).toEqual([4, 3]);
    expect(pt(s, "bear")).toEqual([2, 2]);
    expect(pt(s, "memnite")).toEqual([1, 1]);
    expect(pt(s, "giant")).toEqual([3, 3]);
  });

  it("control — a Banner with no colour stamped pumps nobody", () => {
    const s = table({ user: [banner(null), P("piker", PIKER, "user")] });
    expect(pt(s, "piker")).toEqual([2, 1]);
  });

  it("entering, it chooses the colour its controller's cards need most (red here) and pumps the red creature at once", () => {
    let s = table({ user: [P("piker", PIKER, "user")], hand: [{ ...GIANT, id: "h-giant" }], library: [{ ...GIANT, id: "l-giant" }] });
    s = enterPermanent(s, { ...BANNER, id: "c-banner" }, "user");
    const b = s.players.user.battlefield.find((p) => p.card?.name === "Heraldic Banner");
    expect(b.chosenColor).toBe("R");
    expect(pt(s, "piker")).toEqual([3, 1]);
  });

  it("its mana: the explicit tap offers exactly the chosen colour", () => {
    const s = table({ user: [banner("R"), P("m0", MOUNTAIN, "user")] });
    const taps = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "banner");
    expect(taps.length).toBeGreaterThan(0);
    const colors = new Set(taps.flatMap((a) => (a.color ? [a.color] : a.colors || [])));
    expect([...colors]).toEqual(["R"]);
    const after = dispatchAction(s, taps[0]);
    expect(after.players.user.manaPool.R).toBe(1);
  });
});
