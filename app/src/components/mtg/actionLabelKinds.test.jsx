/**
 * actionLabelKinds.test.jsx — every action the Academy can offer reads as words (found 2026-10-16 by the cast-variant and
 * seat-label sessions). actionLabel had wording for six kinds; an activated ability, a crew, a cycle or a loyalty ability
 * fell to the de-kebabed kind ("activate ability", "crew vehicle"), and the no-board decision prompt labelled its buttons
 * `opt.name || opt.kind`, so a pass read "pass-priority", a crew "crew-vehicle", and a cast lost its target.
 *
 * The engine-backed cases label the options legalActionsForPlayer really emits for real oracle text (bundled Scryfall), so
 * every word in a label comes from the action's own data. The guard holds every kind the dispatcher handles to a written
 * label, so a new kind can't ship reading as its engine name.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { actionLabel } from "./LearnBoard.jsx";
import * as LV from "./LearnView.jsx";
import * as dispatcher from "../../lib/learn/actionDispatcher.js";
import { legalActionsForPlayer } from "../../lib/learn/legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../lib/learn/gameState.js";

beforeEach(() => _resetIdsForTests());

// ── Real-corpus fixtures (publicCard shape; text from the bundled Scryfall oracle data) ──
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const PYROMANCER = { name: "Prodigal Pyromancer", type: "Creature — Human Wizard", mana: "{2}{R}", cmc: 3, keywords: [], oracle: "{T}: This creature deals 1 damage to any target.", power: "1", toughness: "1" };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", cmc: 1, keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const COPTER = { name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, keywords: ["Flying", "Crew"], oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", power: "3", toughness: "3" };
const HIEROGLYPHIC = { name: "Hieroglyphic Illumination", type: "Instant", mana: "{3}{U}", cmc: 4, keywords: ["Cycling"], oracle: "Draw two cards.\nCycling {U} ({U}, Discard this card: Draw a card.)" };
const STREET_WRAITH = { name: "Street Wraith", type: "Creature — Wraith", mana: "{3}{B}{B}", cmc: 5, keywords: ["Landwalk", "Swampwalk", "Cycling"], oracle: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)", power: "3", toughness: "4" };
const LILIANA = { name: "Liliana of the Veil", type: "Legendary Planeswalker — Liliana", mana: "{1}{B}{B}", cmc: 3, keywords: [], oracle: "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", loyalty: "3" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, keywords: [], oracle: "", power: "2", toughness: "2" };
const HILL_GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, keywords: [], oracle: "", power: "3", toughness: "3" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {U}.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {B}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {R}.)" };

const perm = (id, c, controller, counters = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), counters });

// The user at their precombat main: a mana rock, a pinger, an Equipment, a Vehicle, a planeswalker, two cycling cards in
// hand, five lands; the opponent has a Hill Giant.
function board() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const user = {
    ...g.players.user, life: 40,
    hand: [{ ...HIEROGLYPHIC, id: "hand-hi" }, { ...STREET_WRAITH, id: "hand-sw" }],
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

const rawKind = (o) => o.kind.replace(/-/g, " ");

describe("actionLabel — activated abilities, crew, cycling and loyalty read from the action's own data", () => {
  const actions = () => legalActionsForPlayer(board(), "user");
  const find = (pred) => {
    const hit = actions().find(pred);
    expect(hit, "the engine offers this action on the board").toBeTruthy();
    return hit;
  };

  it("an activated ability names the card, the ability's text, its target and its cost", () => {
    expect({
      stone: actionLabel(find((a) => a.kind === "activate-ability" && a.name === "Mind Stone")),
      pingOpponent: actionLabel(find((a) => a.kind === "activate-ability" && a.name === "Prodigal Pyromancer" && a.targets?.[0]?.id === "ai")),
      pingGiant: actionLabel(find((a) => a.kind === "activate-ability" && a.name === "Prodigal Pyromancer" && a.targets?.[0]?.id === "giant")),
      equip: actionLabel(find((a) => a.kind === "activate-ability" && a.name === "Bonesplitter" && a.targets?.[0]?.id === "bears")),
    }).toEqual({
      stone: "Activate Mind Stone: Draw a card ({1}, {T}, sacrifice it)",
      pingOpponent: "Activate Prodigal Pyromancer: This creature deals 1 damage to any target → Opponent ({T})",
      pingGiant: "Activate Prodigal Pyromancer: This creature deals 1 damage to any target → Hill Giant ({T})",
      // The equip text carries its own cost, so it isn't repeated.
      equip: "Activate Bonesplitter: Equip {1} → Grizzly Bears",
    });
  });

  it("a crew names the Vehicle, its crew number and how many creatures it taps", () => {
    expect(actionLabel(find((a) => a.kind === "crew-vehicle"))).toBe("Crew Smuggler's Copter (crew 1, tap 1 creature)");
  });

  it("a cycle names the card and its cost, mana or life", () => {
    expect({
      mana: actionLabel(find((a) => a.kind === "cycle" && a.name === "Hieroglyphic Illumination")),
      life: actionLabel(find((a) => a.kind === "cycle" && a.name === "Street Wraith")),
    }).toEqual({
      mana: "Cycle Hieroglyphic Illumination ({U})",
      life: "Cycle Street Wraith (pay 2 life)",
    });
  });

  it("a loyalty ability names the planeswalker, its loyalty cost, its text and its target", () => {
    expect({
      plus: actionLabel(find((a) => a.kind === "activate-loyalty" && a.costDelta === 1)),
      minusOpponent: actionLabel(find((a) => a.kind === "activate-loyalty" && a.costDelta === -2 && a.targets?.[0]?.id === "ai")),
      minusSelf: actionLabel(find((a) => a.kind === "activate-loyalty" && a.costDelta === -2 && a.targets?.[0]?.id === "user")),
    }).toEqual({
      plus: "Activate Liliana of the Veil +1: Each player discards a card",
      minusOpponent: "Activate Liliana of the Veil -2: Target player sacrifices a creature → Opponent",
      minusSelf: "Activate Liliana of the Veil -2: Target player sacrifices a creature → You",
    });
  });

  it("no action the engine offers on this board reads as its engine kind", () => {
    const raw = actions().filter((a) => actionLabel(a) === rawKind(a) || actionLabel(a) === "—").map((a) => a.kind);
    expect(raw).toEqual([]);
  });

  it("the rest of an activation's cost reads from the action's fields: counted taps, graveyard exiles, life, energy, counters", () => {
    // A made-up source: only the action's cost fields are under test here.
    const base = { kind: "activate-ability", permanentId: "p1", name: "Sample Relic", targets: [], abilityText: "Draw a card." };
    expect({
      tapTwo: actionLabel({ ...base, tapCountIds: ["a", "b"] }),
      exileOne: actionLabel({ ...base, exileGyIds: ["g1"], exileGyCount: { count: 1, cardType: "any" } }),
      lifeEnergyCounter: actionLabel({ ...base, payLife: 2, payEnergy: 3, removeCounter: { type: "oil", count: 1 } }),
      xPaid: actionLabel({ ...base, cost: { ...NO_COST, generic: 3, R: 1, hasX: true, xCount: 1 }, xValue: 2, abilityText: "X=2: Draw a card." }),
    }).toEqual({
      tapTwo: "Activate Sample Relic: Draw a card (tap 2 untapped creatures)",
      exileOne: "Activate Sample Relic: Draw a card (exile 1 card from your graveyard)",
      lifeEnergyCounter: "Activate Sample Relic: Draw a card (pay 2 life, pay {E}{E}{E}, remove an oil counter)",
      // The chosen X is already folded into the generic part, so no {X} pip is shown.
      xPaid: "Activate Sample Relic: X=2: Draw a card ({3}{R})",
    });
  });

  it("an attack with a single defender reads without a gap where the defender would go", () => {
    expect(actionLabel({ kind: "declare-attacker", name: "Grizzly Bears", permanentId: "bears" })).toBe("Attack with Grizzly Bears");
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
  "cast-spell": { kind: "cast-spell", cardId: "c1", name: "Lightning Bolt", targets: [{ id: "giant", name: "Hill Giant", type: "creature", controller: "ai" }] },
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

describe("every kind the dispatcher handles has a written label", () => {
  it("the dispatcher publishes the kinds it handles", () => {
    expect(Array.isArray(dispatcher.ACTION_KINDS)).toBe(true);
    expect(dispatcher.ACTION_KINDS.length).toBeGreaterThan(0);
  });

  it("each handled kind has a sample here, and its label is words, never the engine kind", () => {
    const kinds = dispatcher.ACTION_KINDS || [];
    expect(kinds.filter((k) => !SAMPLES[k])).toEqual([]);
    const raw = kinds.filter((k) => SAMPLES[k] && (actionLabel(SAMPLES[k]) === rawKind(SAMPLES[k]) || actionLabel(SAMPLES[k]) === "—"));
    expect(raw).toEqual([]);
  });

  it("the remaining kinds read as their own data says", () => {
    const label = (k, over = {}) => actionLabel({ ...SAMPLES[k], ...over });
    expect({
      suspend: label("suspend"),
      doubling: label("double-mana-pool"),
      gyRecursion: label("activate-gy-recursion"),
      gyRecursionTap: label("activate-gy-recursion", { tapName: "Grizzly Bears" }),
      gyExile: label("activate-gy-exile"),
      handPut: label("activate-hand-self-put"),
      discard: label("discard-ability"),
      discardAimed: label("discard-ability", { targets: [{ id: "giant", name: "Hill Giant", type: "creature", controller: "ai" }] }),
      plot: label("plot"),
      plotTop: label("plot", { fromZone: "library" }),
      faceUp: label("turn-face-up"),
      companion: label("companion-to-hand"),
      discover: label("discover-to-hand"),
      discoverStays: label("discover-to-hand", { leaveExiled: true }),
      freeCast: label("free-cast-decline"),
      cascade: label("cascade-decline"),
      fromAmong: label("cast-from-among-done"),
    }).toEqual({
      suspend: "Suspend Lotus Bloom ({0}, 3 time counters)",
      doubling: "Activate Doubling Cube: {3}, {T}: Double the amount of each type of unspent mana you have",
      gyRecursion: "Activate Reassembling Skeleton from your graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped",
      gyRecursionTap: "Activate Reassembling Skeleton from your graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped (tap Grizzly Bears)",
      gyExile: "Activate Seasoned Pyromancer from your graveyard: {3}{R}{R}, Exile this card from your graveyard: Create two 1/1 red Elemental creature tokens",
      handPut: "Activate Talon Gates of Madara from your hand: {4}: Put this card from your hand onto the battlefield",
      discard: "Activate Trumpeting Carnosaur from your hand ({2}{R}, discard it)",
      discardAimed: "Activate Trumpeting Carnosaur from your hand → Hill Giant ({2}{R}, discard it)",
      plot: "Plot Slickshot Show-Off ({1}{R})",
      plotTop: "Plot Slickshot Show-Off from the top of your library ({1}{R})",
      faceUp: "Turn Grizzly Bears face up ({1}{G})",
      companion: "Put companion Lurrus of the Dream-Den into your hand ({3})",
      discover: "Put Grizzly Bears into your hand",
      discoverStays: "Leave Grizzly Bears in exile",
      freeCast: "Decline the free cast",
      cascade: "Decline the cascade cast",
      fromAmong: "Done casting from among the exiled cards",
    });
  });
});

describe("the no-board decision prompt labels its buttons with actionLabel", () => {
  const render = (options) => renderToStaticMarkup(createElement(LV.DecisionPrompt, {
    decision: { kind: "ask", prompt: "Your precombat main phase.", options, metadata: { defaultIndex: 0 } },
    onChoose: () => {},
  }));

  it("is exported for the render check", () => {
    expect(typeof LV.DecisionPrompt).toBe("function");
  });

  it("a pass, a crew, a targeted cast and both attack shapes read as words, never as the engine kind", () => {
    const markup = typeof LV.DecisionPrompt === "function"
      ? render([SAMPLES["pass-priority"], SAMPLES["crew-vehicle"], SAMPLES["cast-spell"],
        { kind: "declare-attacker", permanentId: "p1", name: "Grizzly Bears" }, SAMPLES["declare-attacker"]])
      : "";
    const text = markup.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'");
    expect({
      pass: text.includes("|Pass|"),
      crew: text.includes("Crew Smuggler's Copter (crew 1, tap 1 creature)"),
      cast: text.includes("Cast Lightning Bolt → Hill Giant"),
      attack: text.includes("Attack with Grizzly Bears"),
      attackSeat: text.includes("Attack Opponent 1 with Grizzly Bears"),
      noRawKind: !/pass-priority|crew-vehicle|declare-attacker|cast-spell/.test(text),
    }).toEqual({ pass: true, crew: true, cast: true, attack: true, attackSeat: true, noRawKind: true });
  });
});

describe("the hand-reveal panel names the opponent's seat, not the engine id", () => {
  it("'Opponent 1's hand is revealed', never 'ai1's'", () => {
    const markup = renderToStaticMarkup(createElement(LV.HandDiscardPanel, {
      decision: { kind: "hand-discard", candidates: [{ id: "x-1", name: "Island" }], victim: "ai1", sourceName: "Thoughtseize" },
      onChoose: () => {},
    })).replace(/&#x27;/g, "'");
    expect(markup).toContain("Opponent 1's hand is revealed");
    expect(markup).not.toContain("ai1's");
  });
});
