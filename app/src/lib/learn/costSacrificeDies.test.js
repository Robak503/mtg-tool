/**
 * costSacrificeDies.test.js — a permanent sacrificed to pay a COST (an activated ability's "Sacrifice a creature:", a self-sacrifice,
 * a spell's additional cost) leaves through the ONE sacrifice sequence the mana-cost sacrifice uses: costSacrifice.sacrificePermanentForCost
 * (2026-10-16).
 *
 * actionDispatcher kept its own copy of the sequence beside manaModel's (sacrificeForManaCost), and the copies had drifted. The cost copy
 * logged no replaced death: Carrion Feeder eating a Memnite under Rest in Peace exiled it with no "exiled instead of dying" event — the
 * mana copy, the destroy effect and the sacrifice effect all log one (gameState.deathEventKind). And the two orders differed for a
 * noncreature: the cost copy drained the leave event before the sacrifice watchers, the mana copy after them, so a Treasure and a Clue
 * sacrificed beside Disciple of the Vault and Korvold stacked their triggers in opposite orders. Both sites now call the one helper:
 * layer-aware types as it left (CR 603.10a), gameState.deathLookback for a creature, the death-specific exile as the destination, the
 * replaced death logged, the leave event drained first (CR 603.3b), dies triggers for a real death only (CR 700.4), and sacrifice
 * triggers for every sacrifice (CR 701.21a).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, oracle-index.json, read in-session 2026-10-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const CARRION_FEEDER = {"name":"Carrion Feeder","type":"Creature — Zombie","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"This creature can't block.\nSacrifice a creature: Put a +1/+1 counter on this creature.","power":"1","toughness":"1"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."};
const KORVOLD = {"name":"Korvold, Fae-Cursed King","type":"Legendary Creature — Dragon Noble","mana":"{2}{B}{R}{G}","cmc":5,"keywords":["Flying"],"colors":["B","G","R"],"oracle":"Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.","power":"4","toughness":"4"};
const DISCIPLE = {"name":"Disciple of the Vault","type":"Creature — Human Cleric","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Whenever an artifact is put into a graveyard from the battlefield, you may have target opponent lose 1 life.","power":"1","toughness":"1"};
const CLUE = {"name":"Clue","type":"Token Artifact — Clue","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{2}, Sacrifice this token: Draw a card.","token":true};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this token: Add one mana of any color.","token":true};
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const DOOMED_TRAVELER = {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying.","power":"1","toughness":"1"};
const BLIGHTSTEEL = {"name":"Blightsteel Colossus","type":"Artifact Creature — Phyrexian Golem","mana":"{12}","cmc":12,"keywords":["Indestructible","Trample","Infect"],"colors":[],"oracle":"Trample, infect, indestructible\nIf Blightsteel Colossus would be put into a graveyard from anywhere, reveal Blightsteel Colossus and shuffle it into its owner's library instead.","power":"11","toughness":"11"};
const LIVING_PLANE = {"name":"Living Plane","type":"World Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"All lands are 1/1 creatures that are still lands."};
const SMOTHERING = {"name":"Smothering Abomination","type":"Creature — Eldrazi","mana":"{2}{B}{B}","cmc":4,"keywords":["Flying","Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nFlying\nAt the beginning of your upkeep, sacrifice a creature.\nWhenever you sacrifice a creature, draw a card.","power":"4","toughness":"3"};
const ASHNODS_ALTAR = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add {C}{C}."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const VILLAGE_RITES = {"name":"Village Rites","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards."};

const LIBRARY_SIZE = 4;
// mine: [id, card, { tapped, sick, ...permanent fields }] — the user's battlefield; the AI seat holds nothing.
function board(mine, hand = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const perms = mine.map(([id, card, o = {}]) => {
    const { tapped = false, sick = false, ...extra } = o;
    return { ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", tapped, summoningSick: sick }), enteredOnTurn: sick ? 3 : 1, ...extra };
  });
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: perms, hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), graveyard: [], exile: [],
        library: Array.from({ length: LIBRARY_SIZE }, (_, i) => ({ id: `L${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" })),
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
// Carrion Feeder's "Sacrifice a creature:" activation, with the victim named — the action the Learn board offers.
const feed = (s, victimId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "feeder" && a.sacCreatureId === victimId);
  expect(act).toBeTruthy();
  return dispatchAction(s, act);
};
const activate = (s, permanentId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === permanentId);
  expect(act).toBeTruthy();
  return dispatchAction(s, act);
};
const castFirst = (s, pick = () => true) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && pick(a));
  expect(act).toBeTruthy();
  return dispatchAction(s, act);
};
const triggers = (s) => (s.stack || []).filter((o) => o.kind === "triggered-ability").map((o) => `${o.controller}:${o.source?.name}`);
const zoneNames = (s, zone) => (s.players.user[zone] || []).map((c) => c.name);
const replacedDeaths = (s) => s.log.filter((e) => e.kind === "creature-exiled-instead" || e.kind === "creature-shuffled-instead").map((e) => [e.kind, e.cardName, e.via]);

describe("a creature sacrificed to an activated ability's cost", () => {
  it("⭐⛔ Carrion Feeder eats Memnite under Rest in Peace: exiled, so no Blood Artist drain and no death — but a sacrifice Korvold sees, and the log says where it went", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["mem", MEMNITE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]]), "mem");
    expect(zoneNames(after, "exile")).toEqual(["Memnite"]);
    expect(zoneNames(after, "graveyard")).toEqual([]);
    expect(triggers(after)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
    expect(replacedDeaths(after)).toEqual([["creature-exiled-instead", "Memnite", "sacrifice"]]);
    // the ability itself still goes on the stack beneath the trigger — the cost was paid
    expect(after.stack[0]).toMatchObject({ kind: "activated-ability", source: { name: "Carrion Feeder" } });
  });

  it("⭐ without Rest in Peace Memnite dies: one Blood Artist trigger, the graveyard, a death counted, no replaced-death log", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["mem", MEMNITE], ["artist", BLOOD_ARTIST]]), "mem");
    expect(zoneNames(after, "graveyard")).toEqual(["Memnite"]);
    expect(triggers(after)).toEqual(["user:Blood Artist"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
    expect(replacedDeaths(after)).toEqual([]);
  });

  it("a sacrificed creature's OWN dies trigger fires (Doomed Traveler), beside the watcher's", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["doomed", DOOMED_TRAVELER], ["artist", BLOOD_ARTIST]]), "doomed");
    expect(zoneNames(after, "graveyard")).toEqual(["Doomed Traveler"]);
    expect(triggers(after).sort()).toEqual(["user:Blood Artist", "user:Doomed Traveler"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
  });

  it("⛔ a shuffle-instead creature (Blightsteel Colossus) is sacrificed but never died: its library, no dies trigger, the log names the shuffle", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["bs", BLIGHTSTEEL], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]), "bs");
    expect(zoneNames(after, "graveyard")).toEqual([]);
    expect(zoneNames(after, "exile")).toEqual([]);
    expect(after.players.user.library).toHaveLength(LIBRARY_SIZE + 1);
    expect(after.players.user.library.some((c) => c.name === "Blightsteel Colossus")).toBe(true);
    expect(triggers(after)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
    expect(replacedDeaths(after)).toEqual([["creature-shuffled-instead", "Blightsteel Colossus", "sacrifice"]]);
  });

  it("⛔ under Rest in Peace too, the Colossus's own replacement applies first: shuffled, never exiled (the log follows the move)", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["bs", BLIGHTSTEEL], ["artist", BLOOD_ARTIST], ["rip", REST_IN_PEACE]]), "bs");
    expect(zoneNames(after, "exile")).toEqual([]);
    expect(after.players.user.library).toHaveLength(LIBRARY_SIZE + 1);
    expect(triggers(after)).toEqual([]);
    expect(replacedDeaths(after)).toEqual([["creature-shuffled-instead", "Blightsteel Colossus", "sacrifice"]]);
  });

  it("⛔ a creature that would be exiled if it died this turn (Lava Coil's stamp) goes to exile, not the graveyard, and fires no dies trigger", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["mem", MEMNITE, { exileIfDiesTurn: 3 }], ["artist", BLOOD_ARTIST]]), "mem");
    expect(zoneNames(after, "exile")).toEqual(["Memnite"]);
    expect(zoneNames(after, "graveyard")).toEqual([]);
    expect(triggers(after)).toEqual([]);
    expect(replacedDeaths(after)).toEqual([["creature-exiled-instead", "Memnite", "sacrifice"]]);
  });

  it("an animated land sacrificed as a creature dies as one and is a creature sacrifice (layer-aware, CR 603.10a)", () => {
    const after = feed(board([["feeder", CARRION_FEEDER], ["swamp", SWAMP], ["plane", LIVING_PLANE], ["artist", BLOOD_ARTIST], ["smother", SMOTHERING]]), "swamp");
    expect(zoneNames(after, "graveyard")).toEqual(["Swamp"]);
    expect(triggers(after).sort()).toEqual(["user:Blood Artist", "user:Smothering Abomination"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
  });
});

describe("a noncreature sacrificed as a cost", () => {
  it("⭐ a Clue: the sacrifice watchers fire, no dies trigger, no death — and the leave event drains first (Disciple below Korvold)", () => {
    const after = activate(board([["clue", CLUE], ["w1", WASTES], ["w2", WASTES], ["artist", BLOOD_ARTIST], ["disciple", DISCIPLE], ["korvold", KORVOLD]]), "clue");
    expect(after.players.user.battlefield.some((p) => p.id === "clue")).toBe(false);
    expect(triggers(after)).toEqual(["user:Disciple of the Vault", "user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
    expect(replacedDeaths(after)).toEqual([]);
  });

  it("Mind Stone's own sacrifice: an artifact put into the graveyard (Disciple), a permanent sacrificed (Korvold)", () => {
    const after = activate(board([["stone", MIND_STONE], ["w1", WASTES], ["disciple", DISCIPLE], ["korvold", KORVOLD], ["artist", BLOOD_ARTIST]]), "stone");
    expect(zoneNames(after, "graveyard")).toEqual(["Mind Stone"]);
    expect(triggers(after)).toEqual(["user:Disciple of the Vault", "user:Korvold, Fae-Cursed King"]);
  });
});

describe("a spell's additional-cost sacrifice is the same sequence", () => {
  it("⭐⛔ Village Rites sacrificing Memnite under Rest in Peace: exiled, no Blood Artist drain, the replaced death logged", () => {
    const after = castFirst(board([["mem", MEMNITE], ["swamp", SWAMP], ["artist", BLOOD_ARTIST], ["rip", REST_IN_PEACE]], [VILLAGE_RITES]), (a) => a.sacCreatureId === "mem");
    expect(zoneNames(after, "exile")).toEqual(["Memnite"]);
    expect(triggers(after)).toEqual([]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
    expect(replacedDeaths(after)).toEqual([["creature-exiled-instead", "Memnite", "sacrifice"]]);
  });

  it("without Rest in Peace the victim dies: Blood Artist triggers above the spell", () => {
    const after = castFirst(board([["mem", MEMNITE], ["swamp", SWAMP], ["artist", BLOOD_ARTIST]], [VILLAGE_RITES]), (a) => a.sacCreatureId === "mem");
    expect(zoneNames(after, "graveyard")).toEqual(["Memnite"]);
    expect(after.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    expect(triggers(after)).toEqual(["user:Blood Artist"]);
  });
});

describe("the mana-cost sacrifice and the cost sacrifice cannot drift: one helper", () => {
  const sameShape = (s) => ({ exile: zoneNames(s, "exile"), graveyard: zoneNames(s, "graveyard"), triggers: triggers(s), died: s.players.user.creaturesDiedThisTurn || 0, replaced: replacedDeaths(s) });

  it("⭐ Memnite under Rest in Peace, fed to Ashnod's Altar for mana or to Carrion Feeder: the same zones, triggers, tally and log", () => {
    const viaMana = castFirst(board([["altar", ASHNODS_ALTAR], ["mem", MEMNITE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]], [MIND_STONE]));
    const viaCost = feed(board([["feeder", CARRION_FEEDER], ["mem", MEMNITE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]]), "mem");
    expect(sameShape(viaMana)).toEqual(sameShape(viaCost));
    expect(sameShape(viaCost).replaced).toEqual([["creature-exiled-instead", "Memnite", "sacrifice"]]);
  });

  it("⭐ a Treasure cracked for mana stacks its watchers in the order a Clue sacrificed for its ability does (the leave event first)", () => {
    const viaMana = castFirst(board([["treasure", TREASURE], ["disciple", DISCIPLE], ["korvold", KORVOLD]], [SOL_RING]));
    const viaCost = activate(board([["clue", CLUE], ["w1", WASTES], ["w2", WASTES], ["disciple", DISCIPLE], ["korvold", KORVOLD]]), "clue");
    expect(triggers(viaMana)).toEqual(["user:Disciple of the Vault", "user:Korvold, Fae-Cursed King"]);
    expect(triggers(viaMana)).toEqual(triggers(viaCost));
  });
});
