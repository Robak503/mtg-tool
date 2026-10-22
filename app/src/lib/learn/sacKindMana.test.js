/**
 * SACRIFICE AN ARTIFACT / A <CREATURE TYPE> FOR MANA — the Altars' and Gilded Goose's twin with another victim kind.
 *
 *   Krark-Clan Ironworks (EDHREC #1324) — "Sacrifice an artifact: Add {C}{C}."
 *   Skirk Prospector (EDHREC #1350) — "Sacrifice a Goblin: Add {R}."
 *   Kykar, Wind's Fury ("Sacrifice a Spirit: Add {R}."), Krark-Clan Stoker ("{T}, Sacrifice an artifact: Add {R}{R}."), Utopia Mycon
 *   ("Sacrifice a Saproling: Add one mana of any color.").
 *
 * A mana ability (CR 605.1a) whose whole cost is paid before it resolves and adds its mana (CR 605.3b, 601.2h): the sacrifice needs a
 * permanent of that kind to sacrifice (CR 118.3 — no victim, no activation), and the victim is one of that kind NOW (an artifact by its
 * card types, a Goblin by its creature types — a Changeling is every creature type, CR 702.73a). The sacrifice goes through the cost
 * sacrifice, so dies watchers fire (CR 700.4). Unlike the twins, the source may pay with itself when it is of the kind — Skirk Prospector's
 * bundled ruling: "You can sacrifice any Goblin you control to activate Skirk Prospector’s activated ability, including Skirk Prospector
 * itself." — as the last choice, every other permanent of the kind first.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KCI = {"name":"Krark-Clan Ironworks","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Sacrifice an artifact: Add {C}{C}."};
const SKIRK = {"name":"Skirk Prospector","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"Sacrifice a Goblin: Add {R}."};
const KYKAR = {"name":"Kykar, Wind's Fury","type":"Legendary Creature — Bird Wizard","mana":"{1}{U}{R}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"colors":["R","U","W"],"oracle":"Flying\nWhenever you cast a noncreature spell, create a 1/1 white Spirit creature token with flying.\nSacrifice a Spirit: Add {R}."};
const STOKER = {"name":"Krark-Clan Stoker","type":"Creature — Goblin Shaman","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"{T}, Sacrifice an artifact: Add {R}{R}."};
const UTOPIA_MYCON = {"name":"Utopia Mycon","type":"Creature — Fungus","mana":"{G}","cmc":1,"power":"0","toughness":"2","keywords":[],"colors":["G"],"oracle":"At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.\nSacrifice a Saproling: Add one mana of any color."};
const SLOBAD = {"name":"Slobad, Iron Goblin","type":"Legendary Artifact Creature — Goblin","mana":"{1}{R}","cmc":2,"power":"1","toughness":"2","keywords":[],"colors":["R"],"oracle":"{T}, Sacrifice an artifact: Add an amount of {R} equal to the sacrificed artifact's mana value. Spend this mana only to cast artifact spells or activate abilities of artifacts."};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const RAGING_GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"};
const CHANGELING_OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const P = (id, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false });
function board(battlefield, { hand = [], pool = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield, graveyard: [], hand: hand.map((c, i) => ({ ...c, id: `h${i}` })),
      library: Array.from({ length: 5 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `L${i}` })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
}
const sourceOf = (s, id) => manaSources(s, "user").find((x) => x.permanentId === id);
const names = (zone) => zone.map((c) => c.name).sort();

describe("the reader", () => {
  it("⭐ the cards play their whole text", () => {
    expect({ kci: classifyCard(KCI), skirk: classifyCard(SKIRK), kykar: classifyCard(KYKAR), stoker: classifyCard(STOKER), mycon: classifyCard(UTOPIA_MYCON) })
      .toEqual({ kci: "native-mana", skirk: "native-mana", kykar: "native-mana", stoker: "native-mana", mycon: "native-mana" });
  });
  it("⭐ the production carries the victim kind", () => {
    expect({ kci: manaProduction(KCI), skirk: manaProduction(SKIRK) }).toEqual({
      kci: { colors: ["C"], amount: 2, requiresTap: false, sacrificesKind: "artifact" },
      skirk: { colors: ["R"], amount: 1, requiresTap: false, sacrificesKind: "goblin" },
    });
  });
  it("CONTROL — an amount read off the sacrificed artifact (Slobad) and another victim noun stay refused", () => {
    expect({
      slobad: manaProduction(SLOBAD) || null, slobadTier: classifyCard(SLOBAD),
      land: manaProduction({ name: "Probe", type: "Artifact", oracle: "Sacrifice a land: Add {C}{C}." }) || null,
      twoKinds: manaProduction({ name: "Probe", type: "Artifact", oracle: "Sacrifice an artifact: Add {C}{C}.\nSacrifice a Goblin: Add {R}." }) || null,
    }).toEqual({ slobad: null, slobadTier: "body-only", land: null, twoKinds: null });
  });
});

describe("the offer gate — a permanent of the kind must be there, the source itself last", () => {
  it("⭐ Krark-Clan Ironworks: beside an artifact that one first, then itself; alone, itself; a creature that is no artifact never feeds it", () => {
    expect({
      alone: sourceOf(board([P("kci", KCI)]), "kci"),
      bearsOnly: sourceOf(board([P("kci", KCI), P("bear", GRIZZLY_BEARS)]), "kci"),
      withMemnite: sourceOf(board([P("kci", KCI), P("memnite", MEMNITE), P("bear", GRIZZLY_BEARS)]), "kci"),
    }).toMatchObject({
      alone: { amount: 2, sacrificesKind: "artifact", sacVictimIds: ["kci"] },
      bearsOnly: { sacVictimIds: ["kci"] },
      withMemnite: { amount: 2, sacrificesKind: "artifact", sacVictimIds: ["memnite", "kci"] },
    });
  });
  it("⭐ Skirk Prospector feeds on Goblins — a Changeling is one, the Prospector itself last; a Bear never; Kykar is no Spirit, so never its own victim", () => {
    const s = board([P("skirk", SKIRK), P("rg", RAGING_GOBLIN), P("outcast", CHANGELING_OUTCAST), P("bear", GRIZZLY_BEARS)]);
    expect(sourceOf(s, "skirk")).toMatchObject({ colors: ["R"], amount: 1, sacrificesKind: "goblin", sacVictimIds: ["rg", "outcast", "skirk"] });
    expect(sourceOf(board([P("skirk", SKIRK), P("bear", GRIZZLY_BEARS)]), "skirk")).toMatchObject({ sacVictimIds: ["skirk"] });
    expect(sourceOf(board([P("kykar", KYKAR), P("bear", GRIZZLY_BEARS)]), "kykar") || null).toBe(null);
  });
});

describe("the payment", () => {
  it("⭐ Divination paid with Krark-Clan Ironworks and an Island's worth of {U}: the least valuable artifact is sacrificed for {C}{C}", () => {
    const s0 = board([P("kci", KCI), P("memnite", MEMNITE), P("stone", MIND_STONE)], { hand: [DIVINATION], pool: { U: 1 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Divination is affordable through the Ironworks").toBeTruthy();
    const s = dispatchAction(s0, cast);
    expect({
      onStack: s.stack.map((o) => o.card?.name || o.source?.name), graveyard: names(s.players.user.graveyard),
      battlefield: s.players.user.battlefield.map((p) => p.id).sort(),
    }).toEqual({ onStack: ["Divination"], graveyard: ["Memnite"], battlefield: ["kci", "stone"] });
  });

  it("⭐ Lightning Bolt paid with Skirk Prospector: the Raging Goblin is sacrificed for {R}; the Bears stays", () => {
    const s0 = board([P("skirk", SKIRK), P("rg", RAGING_GOBLIN), P("bear", GRIZZLY_BEARS)], { hand: [LIGHTNING_BOLT] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Lightning Bolt is affordable through the Prospector").toBeTruthy();
    const s = dispatchAction(s0, cast);
    expect({ graveyard: names(s.players.user.graveyard), battlefield: s.players.user.battlefield.map((p) => p.id).sort() })
      .toEqual({ graveyard: ["Raging Goblin"], battlefield: ["bear", "skirk"] });
  });

  it("⭐ Krark-Clan Stoker taps and sacrifices an artifact for {R}{R}", () => {
    const s0 = board([P("stoker", STOKER), P("memnite", MEMNITE)], { hand: [LIGHTNING_BOLT] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Lightning Bolt is affordable through the Stoker").toBeTruthy();
    const s = dispatchAction(s0, cast);
    const stoker = s.players.user.battlefield.find((p) => p.id === "stoker");
    expect({ graveyard: names(s.players.user.graveyard), stokerTapped: !!stoker?.tapped, floating: s.players.user.manaPool.R })
      .toEqual({ graveyard: ["Memnite"], stokerTapped: true, floating: 1 });
  });

  it("⭐ Utopia Mycon's whole text: three spore counters make a Saproling, and the Saproling feeds its mana ability — any colour", () => {
    // its upkeep trigger first: the third spore counter.
    let s = runStepActions({ ...board([{ ...P("mycon", UTOPIA_MYCON), counters: { spore: 2 } }]), phase: "beginning", step: "upkeep" });
    while (s.stack.length) s = resolveTopOfStack(s);
    s = { ...s, phase: "precombat-main", step: "main", priorityHolder: "user", consecutivePasses: 0 };
    const make = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "mycon");
    expect(make, "the remove-three-counters ability is offered").toBeTruthy();
    s = dispatchAction(s, make);
    while (s.stack.length) s = resolveTopOfStack(s);
    const saproling = s.players.user.battlefield.find((p) => p.card?.name === "Saproling");
    expect({ spore: s.players.user.battlefield.find((p) => p.id === "mycon").counters.spore || 0, saproling: !!saproling }).toEqual({ spore: 0, saproling: true });
    expect(sourceOf(s, "mycon")).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrificesKind: "saproling", sacVictimIds: [saproling.id] });
  });

  it("⭐ Kykar's whole text: a noncreature spell makes a Spirit, and the Spirit feeds {R}", () => {
    let s = board([P("kykar", KYKAR)], { hand: [DIVINATION], pool: { U: 1, C: 2 } });
    expect(sourceOf(s, "kykar") || null, "no Spirit yet: no source").toBe(null);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    s = dispatchAction(s, cast);
    while (s.stack.length) s = resolveTopOfStack(s);
    const spirit = s.players.user.battlefield.find((p) => p.card?.name === "Spirit");
    expect(spirit, "the cast trigger's Spirit").toBeTruthy();
    expect(sourceOf(s, "kykar")).toMatchObject({ colors: ["R"], amount: 1, sacrificesKind: "spirit", sacVictimIds: [spirit.id] });
  });

  it("⭐ the explicit mana ability: beside another Goblin that Goblin goes; alone, Skirk Prospector pays with itself (its ruling)", () => {
    const withGoblin = board([P("skirk", SKIRK), P("rg", RAGING_GOBLIN)]);
    const tap = legalActionsForPlayer(withGoblin, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "skirk");
    expect(tap, "offered beside a Goblin").toBeTruthy();
    const s = dispatchAction(withGoblin, tap);
    const alone = board([P("skirk", SKIRK)]);
    const tapAlone = legalActionsForPlayer(alone, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "skirk");
    expect(tapAlone, "offered alone").toBeTruthy();
    const s2 = dispatchAction(alone, tapAlone);
    expect({ pool: s.players.user.manaPool.R, graveyard: names(s.players.user.graveyard), aloneGraveyard: names(s2.players.user.graveyard), alonePool: s2.players.user.manaPool.R })
      .toEqual({ pool: 1, graveyard: ["Raging Goblin"], aloneGraveyard: ["Skirk Prospector"], alonePool: 1 });
  });

  it("⭐ Krark-Clan Ironworks with no other artifact pays for Divination by sacrificing itself", () => {
    const s0 = board([P("kci", KCI)], { hand: [DIVINATION], pool: { U: 1 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Divination is affordable through the Ironworks alone").toBeTruthy();
    const s = dispatchAction(s0, cast);
    expect({ onStack: s.stack.map((o) => o.card?.name || o.source?.name), graveyard: names(s.players.user.graveyard) }).toEqual({ onStack: ["Divination"], graveyard: ["Krark-Clan Ironworks"] });
  });
});
