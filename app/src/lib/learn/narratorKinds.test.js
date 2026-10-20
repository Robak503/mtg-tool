/**
 * narratorKinds.test.js — every action the dispatcher handles narrates from its own data (left by the 10-17 action-label
 * slice). narrateAction had no case for crew-vehicle ("Take action"), suspend, discard-ability, the graveyard and hand
 * abilities and double-mana-pool ("Take action: <name>"); its cost writer turned a zero cost into "0" ("Cycle [[Street
 * Wraith]] for 0" — the card's cycling cost is "Pay 2 life"), an activation's text ended in two full stops and named neither
 * its target nor its cost, a cascade decline read "[[the card]]", and a discover whose decline leaves the card exiled still
 * said "into your hand".
 *
 * The engine-backed cases narrate the options legalActionsForPlayer really emits for real oracle text (bundled Scryfall), so
 * every word comes from the action, the card, or the label helpers. The guard holds every dispatcher kind to a narration
 * that is not the generic fallback.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { narrateAction } from "./narrator.js";
import * as dispatcher from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── Real-corpus fixtures (publicCard shape; text from the bundled Scryfall oracle data) ──
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const PYROMANCER = { name: "Prodigal Pyromancer", type: "Creature — Human Wizard", mana: "{2}{R}", cmc: 3, keywords: [], oracle: "{T}: This creature deals 1 damage to any target.", power: "1", toughness: "1" };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", cmc: 1, keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const COPTER = { name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, keywords: ["Flying", "Crew"], oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", power: "3", toughness: "3" };
const HIEROGLYPHIC = { name: "Hieroglyphic Illumination", type: "Instant", mana: "{3}{U}", cmc: 4, keywords: ["Cycling"], oracle: "Draw two cards.\nCycling {U} ({U}, Discard this card: Draw a card.)" };
const STREET_WRAITH = { name: "Street Wraith", type: "Creature — Wraith", mana: "{3}{B}{B}", cmc: 5, keywords: ["Landwalk", "Swampwalk", "Cycling"], oracle: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)", power: "3", toughness: "4" };
const LILIANA = { name: "Liliana of the Veil", type: "Legendary Planeswalker — Liliana", mana: "{1}{B}{B}", cmc: 3, keywords: [], oracle: "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", loyalty: "3" };
const MEMNITE = { name: "Memnite", type: "Artifact Creature — Construct", mana: "{0}", cmc: 0, keywords: [], oracle: "", power: "1", toughness: "1" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, keywords: [], oracle: "", power: "2", toughness: "2" };
const HILL_GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, keywords: [], oracle: "", power: "3", toughness: "3" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {U}.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {B}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {R}.)" };

const perm = (id, c, controller, counters = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), counters });

// The user at their precombat main: a mana rock, a pinger, an Equipment, a Vehicle, a planeswalker, two cycling cards and a
// {0} creature in hand, five lands; the opponent has a Hill Giant.
function board() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const user = {
    ...g.players.user, life: 40,
    hand: [{ ...HIEROGLYPHIC, id: "hand-hi" }, { ...STREET_WRAITH, id: "hand-sw" }, { ...MEMNITE, id: "hand-mem" }],
    battlefield: [
      perm("i1", ISLAND, "user"), perm("i2", ISLAND, "user"), perm("s1", SWAMP, "user"), perm("s2", SWAMP, "user"), perm("m1", MOUNTAIN, "user"),
      perm("stone", MIND_STONE, "user"), perm("pyro", PYROMANCER, "user"), perm("split", BONESPLITTER, "user"),
      perm("copter", COPTER, "user"), perm("bears", BEARS, "user"), perm("lili", LILIANA, "user", { loyalty: 3 }),
    ],
    library: [{ ...BEARS, id: "lib-1" }],
  };
  const ai = { ...g.players.ai, battlefield: [perm("giant", HILL_GIANT, "ai")] };
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user, ai } };
}

// A placeholder that is not a card's name, a cost written as a bare number, two full stops, the generic fallback.
const BAD = /\[\[(?:the |a |an |its |your )|for 0\b|\.\.|^Take action/;

describe("narrateAction — activated abilities, crew, cycling and loyalty narrate from the action's own data", () => {
  const state = board();
  const actions = () => legalActionsForPlayer(state, "user");
  const find = (pred) => {
    const hit = actions().find(pred);
    expect(hit, "the engine offers this action on the board").toBeTruthy();
    return hit;
  };
  const say = (a, difficulty = "intermediate") => narrateAction(a, state, { difficulty });

  it("an activated ability names its cost, its target and its text — one full stop", () => {
    expect({
      stone: say(find((a) => a.kind === "activate-ability" && a.name === "Mind Stone")),
      pingOpponent: say(find((a) => a.kind === "activate-ability" && a.name === "Prodigal Pyromancer" && a.targets?.[0]?.id === "ai")),
      pingGiant: say(find((a) => a.kind === "activate-ability" && a.name === "Prodigal Pyromancer" && a.targets?.[0]?.id === "giant")),
      equip: say(find((a) => a.kind === "activate-ability" && a.name === "Bonesplitter" && a.targets?.[0]?.id === "bears")),
    }).toEqual({
      stone: "Activate [[Mind Stone]] ({1}, {T}, sacrifice it): Draw a card.",
      pingOpponent: "Activate [[Prodigal Pyromancer]] ({T}) targeting Opponent: This creature deals 1 damage to any target.",
      pingGiant: "Activate [[Prodigal Pyromancer]] ({T}) targeting [[Hill Giant]]: This creature deals 1 damage to any target.",
      // The equip text carries its own cost, so it isn't repeated.
      equip: "Activate [[Bonesplitter]] targeting [[Grizzly Bears]]: Equip {1}.",
    });
  });

  it("the beginner activation keeps its teaching line after the one full stop", () => {
    const text = say(find((a) => a.kind === "activate-ability" && a.name === "Mind Stone"), "beginner");
    expect(text.startsWith("Activate [[Mind Stone]] ({1}, {T}, sacrifice it): Draw a card. The ability goes on the stack")).toBe(true);
    expect(text).not.toContain("..");
  });

  it("a crew names the Vehicle, its crew number and the creature the engine taps for it", () => {
    const crew = find((a) => a.kind === "crew-vehicle");
    expect(crew.tapIds).toEqual(["pyro"]);
    expect({ beginner: say(crew, "beginner"), intermediate: say(crew) }).toEqual({
      beginner: "Crew [[Smuggler's Copter]] (crew 1, tap [[Prodigal Pyromancer]]).",
      intermediate: "Crew [[Smuggler's Copter]] (crew 1, tap [[Prodigal Pyromancer]]).",
    });
  });

  it("a cycle names its cost — mana, or Street Wraith's 2 life — never '0'", () => {
    const wraith = find((a) => a.kind === "cycle" && a.name === "Street Wraith");
    expect({
      mana: say(find((a) => a.kind === "cycle" && a.name === "Hieroglyphic Illumination")),
      life: say(wraith),
      lifeBeginner: say(wraith, "beginner").split(":")[0],
    }).toEqual({
      mana: "Cycle [[Hieroglyphic Illumination]] for {U}.",
      life: "Cycle [[Street Wraith]] for 2 life.",
      lifeBeginner: "Cycle [[Street Wraith]] for 2 life",
    });
  });

  it("a loyalty ability aimed at a player names that player, so the two −2 lines differ", () => {
    expect({
      minusOpponent: say(find((a) => a.kind === "activate-loyalty" && a.costDelta === -2 && a.targets?.[0]?.id === "ai")),
      minusSelf: say(find((a) => a.kind === "activate-loyalty" && a.costDelta === -2 && a.targets?.[0]?.id === "user")),
    }).toEqual({
      minusOpponent: "Activate [[Liliana of the Veil]]'s -2 ability targeting Opponent.",
      minusSelf: "Activate [[Liliana of the Veil]]'s -2 ability targeting you.",
    });
  });

  it("two permanents of one name on different sides are told apart by their controller", () => {
    const s = board();
    const twin = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, perm("aipyro", PYROMANCER, "ai")] } } };
    const ping = (id) => legalActionsForPlayer(twin, "user").find((a) => a.kind === "activate-ability" && a.name === "Prodigal Pyromancer" && a.targets?.[0]?.id === id);
    expect({
      own: narrateAction(ping("pyro"), twin, { difficulty: "intermediate" }),
      theirs: narrateAction(ping("aipyro"), twin, { difficulty: "intermediate" }),
      unique: narrateAction(ping("giant"), twin, { difficulty: "intermediate" }),
    }).toEqual({
      own: "Activate [[Prodigal Pyromancer]] ({T}) targeting your [[Prodigal Pyromancer]]: This creature deals 1 damage to any target.",
      theirs: "Activate [[Prodigal Pyromancer]] ({T}) targeting Opponent's [[Prodigal Pyromancer]]: This creature deals 1 damage to any target.",
      unique: "Activate [[Prodigal Pyromancer]] ({T}) targeting [[Hill Giant]]: This creature deals 1 damage to any target.",
    });
  });

  it("a {0} spell is cast for {0}", () => {
    expect(say(find((a) => a.kind === "cast-spell" && a.name === "Memnite"))).toBe("Cast [[Memnite]] for {0}.");
  });

  it("no action the engine offers on this board narrates as a placeholder, a bare-number cost or the generic fallback", () => {
    const bad = [];
    for (const a of actions()) {
      for (const difficulty of ["beginner", "intermediate"]) {
        const text = narrateAction(a, state, { difficulty });
        if (BAD.test(text)) bad.push(`${a.kind} ${difficulty}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// One action of every kind the dispatcher handles, in the shape legalChoices builds it. Each named card's cost and ability text
// are its bundled Scryfall text (Doubling Cube, Reassembling Skeleton, Seasoned Pyromancer, Talon Gates of Madara, Trumpeting
// Carnosaur, Slickshot Show-Off, Lotus Bloom, Lurrus of the Dream-Den).
const NO_COST = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hasX: false, xCount: 0, hybrid: [], phyrexian: [], anyColor: 0, snow: 0 };
const cost = (over) => ({ ...NO_COST, ...over });
const SAMPLES = {
  "pass-priority": { kind: "pass-priority" },
  "suspend": { kind: "suspend", cardId: "c1", name: "Lotus Bloom", cost: cost({}), cmc: 0, suspendCounters: 3 },
  "play-land": { kind: "play-land", cardId: "c1", name: "Forest" },
  "cast-spell": { kind: "cast-spell", cardId: "c1", name: "Lightning Bolt", cost: cost({ R: 1 }), targets: [{ id: "giant", name: "Hill Giant", type: "creature", controller: "ai" }] },
  "tap-for-mana": { kind: "tap-for-mana", permanentId: "p1", name: "Forest", color: "G" },
  "double-mana-pool": { kind: "double-mana-pool", permanentId: "p1", name: "Doubling Cube", cost: cost({ generic: 3 }), tapSelf: true, abilityText: "{3}, {T}: Double the amount of each type of unspent mana you have." },
  "activate-ability": { kind: "activate-ability", permanentId: "p1", name: "Mind Stone", cost: cost({ generic: 1 }), tapSelf: true, sacSelf: true, targets: [], abilityText: "Draw a card." },
  "activate-gy-recursion": { kind: "activate-gy-recursion", cardId: "c1", name: "Reassembling Skeleton", cost: cost({ generic: 1, B: 1 }), abilityText: "{1}{B}: Return this card from your graveyard to the battlefield tapped." },
  "activate-gy-exile": { kind: "activate-gy-exile", cardId: "c1", name: "Seasoned Pyromancer", cost: cost({ generic: 3, R: 2 }), targets: [], abilityText: "{3}{R}{R}, Exile this card from your graveyard: Create two 1/1 red Elemental creature tokens." },
  "activate-hand-self-put": { kind: "activate-hand-self-put", cardId: "c1", name: "Talon Gates of Madara", cost: cost({ generic: 4 }), abilityText: "{4}: Put this card from your hand onto the battlefield." },
  "crew-vehicle": { kind: "crew-vehicle", permanentId: "p1", vehicleName: "Smuggler's Copter", crew: 1, tapIds: ["p2"], allSick: false },
  "cycle": { kind: "cycle", cardId: "c1", name: "Hieroglyphic Illumination", cost: cost({ U: 1 }), cmc: 1 },
  "discard-ability": { kind: "discard-ability", cardId: "c1", name: "Trumpeting Carnosaur", cost: cost({ generic: 2, R: 1 }), cmc: 3 },
  "plot": { kind: "plot", cardId: "c1", name: "Slickshot Show-Off", cost: cost({ generic: 1, R: 1 }), cmc: 2 },
  "turn-face-up": { kind: "turn-face-up", permanentId: "p1", name: "Grizzly Bears", cost: cost({ generic: 1, G: 1 }), cmc: 2 },
  "activate-loyalty": { kind: "activate-loyalty", permanentId: "p1", name: "Liliana of the Veil", costDelta: 1, targets: [], abilityText: "+1: Each player discards a card." },
  "declare-attacker": { kind: "declare-attacker", permanentId: "p1", name: "Grizzly Bears", defenderId: "ai1" },
  "declare-blocker": { kind: "declare-blocker", permanentId: "p1", name: "Grizzly Bears", attackerName: "Hill Giant" },
  "companion-to-hand": { kind: "companion-to-hand", cardId: "c1", name: "Lurrus of the Dream-Den", cost: cost({ generic: 3 }), cmc: 3 },
  "discover-to-hand": { kind: "discover-to-hand", cardId: "c1", name: "Grizzly Bears" },
  "free-cast-decline": { kind: "free-cast-decline" },
  "cascade-decline": { kind: "cascade-decline", cardId: "c1" },
  "cast-from-among-done": { kind: "cast-from-among-done" },
};

describe("every kind the dispatcher handles narrates as words, never the generic fallback", () => {
  const empty = () => createGameState({ userDeck: [], aiDeck: [] });

  it("each handled kind has a sample here, and at both difficulties its narration is not 'Take action'", () => {
    const kinds = dispatcher.ACTION_KINDS || [];
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.filter((k) => !SAMPLES[k])).toEqual([]);
    const generic = [];
    for (const k of kinds.filter((x) => SAMPLES[x])) {
      for (const difficulty of ["beginner", "intermediate"]) {
        const text = narrateAction(SAMPLES[k], empty(), { difficulty });
        if (BAD.test(text) || !text) generic.push(`${k} ${difficulty}: ${text}`);
      }
    }
    expect(generic).toEqual([]);
  });

  it("the kinds that read 'Take action' before narrate as their own data says", () => {
    const say = (k, over = {}, state = empty()) => narrateAction({ ...SAMPLES[k], ...over }, state, { difficulty: "intermediate" });
    expect({
      crewNoBoard: say("crew-vehicle"),
      suspend: say("suspend"),
      doubling: say("double-mana-pool"),
      gyRecursion: say("activate-gy-recursion"),
      gyRecursionTap: say("activate-gy-recursion", { tapName: "Grizzly Bears" }),
      gyExile: say("activate-gy-exile"),
      handPut: say("activate-hand-self-put"),
      discard: say("discard-ability"),
      discardAimed: say("discard-ability", { targets: [{ id: "giant", name: "Hill Giant", type: "creature", controller: "ai" }] }),
    }).toEqual({
      // No board to name the crew from: the count, as the button reads it.
      crewNoBoard: "Crew [[Smuggler's Copter]] (crew 1, tap 1 creature).",
      suspend: "Suspend [[Lotus Bloom]] for {0} with 3 time counters.",
      doubling: "Activate [[Doubling Cube]]: {3}, {T}: Double the amount of each type of unspent mana you have.",
      gyRecursion: "Activate [[Reassembling Skeleton]] from your graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped.",
      gyRecursionTap: "Activate [[Reassembling Skeleton]] from your graveyard (tap [[Grizzly Bears]]): {1}{B}: Return this card from your graveyard to the battlefield tapped.",
      gyExile: "Activate [[Seasoned Pyromancer]] from your graveyard: {3}{R}{R}, Exile this card from your graveyard: Create two 1/1 red Elemental creature tokens.",
      handPut: "Activate [[Talon Gates of Madara]] from your hand: {4}: Put this card from your hand onto the battlefield.",
      discard: "Activate [[Trumpeting Carnosaur]] from your hand ({2}{R}, discard it).",
      discardAimed: "Activate [[Trumpeting Carnosaur]] from your hand ({2}{R}, discard it) targeting [[Hill Giant]].",
    });
  });

  it("costs, decline and leave-exiled read from the action: no '0', no '[[the card]]', no 'into your hand' for a card that stays exiled", () => {
    const say = (action, state = empty(), difficulty = "intermediate") => narrateAction(action, state, { difficulty });
    const withExiled = (() => {
      const g = empty();
      return { ...g, players: { ...g.players, user: { ...g.players.user, exile: [{ ...BEARS, id: "c1" }] } } };
    })();
    expect({
      plotTop: say({ ...SAMPLES.plot, fromZone: "library" }),
      plotTopBeginner: say({ ...SAMPLES.plot, fromZone: "library" }, empty(), "beginner").split(". ")[0],
      leaveExiled: say({ ...SAMPLES["discover-to-hand"], leaveExiled: true }),
      leaveExiledBeginner: say({ ...SAMPLES["discover-to-hand"], leaveExiled: true }, empty(), "beginner"),
      cascadeUnnamed: say(SAMPLES["cascade-decline"]),
      cascadeFromExile: say(SAMPLES["cascade-decline"], withExiled),
      // A free cast carries what its {0} still owes (legalChoices, CR 118.9d): nothing here, {1} under a tax.
      freeCast: say({ kind: "cast-spell", cardId: "c1", name: "Grizzly Bears", cost: { generic: 0 }, freeCast: true, targets: [] }),
      freeCastTaxed: say({ kind: "cast-spell", cardId: "c1", name: "Grizzly Bears", cost: cost({ generic: 1 }), freeCast: true, targets: [] }),
      pitch: say({ kind: "cast-spell", cardId: "c1", name: "Force of Will", cost: { generic: 0 }, altCost: { kind: "pitch", payLife: 1, exilePitchId: "h2" },
        altName: "pay 1 life, exile Brainstorm from hand", targets: [{ id: "s1", name: "Lightning Bolt", type: "spell" }] }),
      kicked: say({ ...SAMPLES["cast-spell"], cost: cost({ R: 2 }), kicked: true, kickedName: "kicked" }),
    }).toEqual({
      plotTop: "Plot [[Slickshot Show-Off]] from the top of your library for {1}{R}.",
      plotTopBeginner: "Plot [[Slickshot Show-Off]] from the top of your library for {1}{R}: exile it from the top of your library now",
      leaveExiled: "Leave [[Grizzly Bears]] in exile.",
      leaveExiledBeginner: "Leave [[Grizzly Bears]] in exile.",
      cascadeUnnamed: "Decline the cascade cast.",
      cascadeFromExile: "Decline to cast [[Grizzly Bears]].",
      freeCast: "Cast [[Grizzly Bears]] without paying its mana cost.",
      freeCastTaxed: "Cast [[Grizzly Bears]] without paying its mana cost (pay {1}).",
      // The alternative cost names the payment; the {0} the engine stores as the mana cost is not "for 0".
      pitch: "Cast [[Force of Will]] targeting [[Lightning Bolt]] (pay 1 life, exile Brainstorm from hand).",
      kicked: "Cast [[Lightning Bolt]] for {R}{R} targeting [[Hill Giant]] (kicked).",
    });
  });
});
