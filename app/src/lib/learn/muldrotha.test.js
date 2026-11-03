/**
 * muldrotha.test.js — MULDROTHA, THE GRAVETIDE (the play-weighted program, EDHREC #1100):
 *
 *   "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card
 *    has multiple permanent types, choose one as you play it.)"
 *
 * The static is a coverage marker (staticAbilityParser — `muldrothaGraveyardPermission`) that legalChoices.actionsMuldrothaFromGraveyard
 * enforces: on each of its controller's turns, per source, one land play and one cast of each permanent type — artifact, battle,
 * creature, enchantment, planeswalker (CR 110.4) — from the graveyard; the dispatcher latches each permission it spends
 * (`${sourceId}_muldrotha_${type}`, cleared at the untap step). Its rulings, each witnessed: an artifact creature may be cast as the
 * artifact or as the creature (one offer per type, the choice is the offer taken); the costs are paid (full casts through the shared
 * builder); normal timing applies (a creature without flash only with the stack empty; no land play without a land drop left); the
 * type is the one the spell has as it is cast (a bestowed Boon Satyr is an Aura enchantment spell, CR 702.103b; cast normally it is an
 * enchantment creature); a new Muldrotha this turn grants its own permissions (a Cloudshift makes one — CR 400.7). An instant is never offered; the lane is closed on an
 * opponent's turn. The default AI casts from its graveyard under it as it casts from its hand (opponentAI.pickCastAction).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const MULDROTHA = {"name":"Muldrotha, the Gravetide","type":"Legendary Creature — Elemental Avatar","mana":"{3}{B}{G}{U}","oracle":"During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent types, choose one as you play it.)","layout":"normal","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":[],"colors":["B","G","U"],"colorIdentity":["B","G","U"]}; // EDHREC #1100
const SOLEMN = {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #39
const EXPLORATION = {"name":"Exploration","type":"Enchantment","mana":"{G}","oracle":"You may play an additional land on each of your turns.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #305
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const BOON_SATYR = {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2.","layout":"normal","cmc":3,"power":"4","toughness":"2","loyalty":null,"keywords":["Bestow","Flash"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #16813
const BONECRUSHER = {"name":"Bonecrusher Giant // Stomp","type":"Creature — Giant // Instant — Adventure","mana":"{2}{R} // {1}{R}","oracle":"Bonecrusher Giant - Creature — Giant {2}{R}\nWhenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.\n//\nStomp - Instant — Adventure {1}{R}\nDamage can't be prevented this turn. Stomp deals 2 damage to any target.","layout":"adventure","cmc":3,"power":"4","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #5929
const VIPER = {"name":"Ambush Viper","type":"Creature — Snake","mana":"{1}{G}","oracle":"Flash\nDeathtouch","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Flash","Deathtouch"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #4832
const AJANI = {"name":"Ajani Goldmane","type":"Legendary Planeswalker — Ajani","mana":"{2}{W}{W}","oracle":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":"4","keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #10384
const MAMMOTH = {"name":"Kazandu Mammoth // Kazandu Valley","type":"Creature — Elephant // Land","mana":"{1}{G}{G}","oracle":"Kazandu Mammoth - Creature — Elephant {1}{G}{G}\nLandfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.\n//\nKazandu Valley - Land \nThis land enters tapped.\n{T}: Add {G}.","layout":"modal_dfc","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Landfall"],"colors":[],"colorIdentity":["G"]}; // EDHREC #9162
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const CRUCIBLE = {"name":"Crucible of Worlds","type":"Artifact","mana":"{3}","oracle":"You may play lands from your graveyard.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #601
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #217
const CLOUDSHIFT = {"name":"Cloudshift","type":"Instant","mana":"{W}","oracle":"Exile target creature you control, then return that card to the battlefield under your control.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #774
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const gyOf = (cards) => cards.map((c, i) => ({ ...c, id: `gy${i}-${c.name.split(" ")[0]}` }));
const RICH = { W: 2, U: 2, B: 0, R: 2, G: 6, C: 6 };
/** `seat`'s precombat main, Muldrotha (and `extra`) on its battlefield, `graveyard` in its graveyard, `pool` floating. */
function table({ seat = "user", active = seat, graveyard = [], extra = [], pool = RICH, hand = [], landsPlayed = 0 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: pid === seat ? [on(seat, "muld", MULDROTHA), ...extra] : [], graveyard: pid === seat ? graveyard : [], hand: pid === seat ? hand : [],
      library: [{ ...FOREST, id: `lib-${pid}` }], manaPool: pid === seat ? { ...pool } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, landsPlayedThisTurn: pid === seat ? landsPlayed : 0 };
  }
  return { ...g, turn: 3, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
/** The offer `a`, asserted present first — on a board where it is missing the test fails on that assertion, never on a dispatch of nothing. */
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const offers = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.muldrothaSlot);
const offerNames = (s, seat = "user") => offers(s, seat).map((a) => `${a.kind === "play-land" ? "play" : "cast"} ${a.name} as ${a.muldrothaSlot.type}${a.bestow ? " (bestow)" : ""}`).sort();
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}

describe("the card", () => {
  it("⭐ native: the permission is the graveyard lane's marker", () => {
    expect(classifyCard(MULDROTHA)).toBe("native-static");
    expect(parseStaticAbilities(MULDROTHA)).toEqual([{ muldrothaGraveyardPermission: true }]);
  });
  it("control: \"you may cast permanent spells from your graveyard\" (no per-type limit) is not Muldrotha's sentence", () => {
    expect(parseStaticAbilities({ ...MULDROTHA, oracle: "During each of your turns, you may cast permanent spells from your graveyard." })).toEqual([]);
  });
});

describe("the offer", () => {
  const all = () => gyOf([FOREST, SOLEMN, EXPLORATION, SOL_RING, BONECRUSHER, AJANI, MAMMOTH, OPT]);
  it("⭐ a land play and one cast per permanent type: an artifact creature twice (artifact, creature), the adventurer's Giant (never Stomp), the modal DFC's creature and its land, a planeswalker — never the instant", () => {
    expect(offerNames(table({ graveyard: all() }))).toEqual([
      "cast Ajani Goldmane as Planeswalker", "cast Bonecrusher Giant as Creature", "cast Exploration as Enchantment", "cast Kazandu Mammoth as Creature",
      "cast Sol Ring as Artifact", "cast Solemn Simulacrum as Artifact", "cast Solemn Simulacrum as Creature",
      "play Forest as Land", "play Kazandu Valley as Land",
    ]);
  });
  it("⭐ a cast spends that type's permission only: Solemn as the artifact closes Sol Ring, leaves the creatures open, and Solemn is on the battlefield with its cost paid", () => {
    const s0 = table({ graveyard: all() });
    const cast = offers(s0).find((a) => a.name === "Solemn Simulacrum" && a.muldrothaSlot.type === "Artifact");
    const s = settle(dispatchAction(s0, offered(cast, "Solemn as the artifact")));
    expect({ bf: s.players.user.battlefield.map((p) => p.card.name).sort(), gyHasSolemn: s.players.user.graveyard.some((c) => c.name === "Solemn Simulacrum"), colorless: s.players.user.manaPool.C })
      .toEqual({ bf: ["Muldrotha, the Gravetide", "Solemn Simulacrum"], gyHasSolemn: false, colorless: 2 });
    const left = offerNames(s);
    expect(left).not.toContain("cast Sol Ring as Artifact");
    expect(left).toContain("cast Bonecrusher Giant as Creature");
    expect(left).toContain("play Forest as Land");
  });
  it("⭐ the land play is the turn's land drop: one land from the graveyard, then none — and none at all once a land was played from hand", () => {
    const s0 = table({ graveyard: gyOf([FOREST, FOREST]) });
    const s = dispatchAction(s0, offered(offers(s0).find((a) => a.kind === "play-land"), "the graveyard land"));
    expect({ bf: s.players.user.battlefield.map((p) => p.card.name).sort(), more: offers(s).length }).toEqual({ bf: ["Forest", "Muldrotha, the Gravetide"], more: 0 });
    expect(offers(table({ graveyard: gyOf([FOREST]), landsPlayed: 1 }))).toEqual([]);
  });
  it("⭐ with Exploration's second land drop, Muldrotha still grants ONE land play from the graveyard", () => {
    const s0 = table({ graveyard: gyOf([FOREST, FOREST]), extra: [on("user", "explo", EXPLORATION)] });
    const s = dispatchAction(s0, offered(offers(s0).find((a) => a.kind === "play-land"), "the graveyard land"));
    expect({ landsPlayed: s.players.user.landsPlayedThisTurn, more: offers(s).filter((a) => a.kind === "play-land").length }).toEqual({ landsPlayed: 1, more: 0 });
  });
  it("⭐ the type as cast: Boon Satyr bestowed is the enchantment (an Aura spell), cast normally it is the enchantment or the creature", () => {
    const names = offerNames(table({ graveyard: gyOf([BOON_SATYR]) }));
    expect(names).toEqual(["cast Boon Satyr as Creature", "cast Boon Satyr as Enchantment", "cast Boon Satyr as Enchantment (bestow)"]);
  });
  it("⭐ normal timing: with a spell on the stack only the flash creature is offered", () => {
    const s0 = table({ graveyard: gyOf([BEARS, VIPER]) });
    const busy = { ...s0, stack: [{ id: "stk-x", kind: "spell", controller: "ai", source: { ...OPT, id: "x" }, targets: [], payload: {} }] };
    expect(offerNames(busy)).toEqual(["cast Ambush Viper as Creature"]);
  });
  it("control: only during its controller's turns", () => {
    expect(offers(table({ graveyard: gyOf([VIPER, FOREST]), active: "ai" }))).toEqual([]);
  });
  it("⭐ a new Muldrotha grants its own permissions (its ruling): Cloudshift returns it as a new object (CR 400.7), and the creature is open again", () => {
    const s0 = table({ graveyard: gyOf([BEARS, VIPER]), hand: [{ ...CLOUDSHIFT, id: "h-shift" }] });
    const first = offers(s0).find((a) => a.name === "Grizzly Bears" && a.muldrothaSlot.type === "Creature");
    const s1 = settle(dispatchAction(s0, offered(first, "Grizzly Bears under Muldrotha")));
    expect(offers(s1)).toEqual([]); // the one creature permission is spent
    const shift = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-shift" && a.targets?.[0]?.id === "muld");
    const s2 = settle(dispatchAction(s1, offered(shift, "Cloudshift on Muldrotha")));
    const muld = s2.players.user.battlefield.find((p) => p.card?.name === "Muldrotha, the Gravetide");
    expect({ newObject: !!muld && muld.id !== "muld", offers: offers(s2).map((a) => `${a.name}:${a.muldrothaSlot.type}:${a.muldrothaSlot.sourceId === muld?.id}`) })
      .toEqual({ newObject: true, offers: ["Ambush Viper:Creature:true"] });
  });
  it("Crucible of Worlds already plays the graveyard's lands: no second, latching offer of the same land", () => {
    const s = table({ graveyard: gyOf([FOREST]), extra: [on("user", "cru", CRUCIBLE)] });
    expect(offers(s)).toEqual([]);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.fromZone === "graveyard")).toHaveLength(1);
  });
});

describe("the default AI", () => {
  it("⭐ casts from its graveyard under Muldrotha as it casts from its hand, and plays the graveyard's land", () => {
    let s = table({ seat: "ai", graveyard: gyOf([FOREST, BEARS, SOL_RING]), pool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 2 } });
    const took = [];
    for (let k = 0; k < 6; k++) {
      const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
      if (!pick || pick.kind === "pass-priority") break;
      if (pick.muldrothaSlot) took.push(`${pick.name}:${pick.muldrothaSlot.type}`);
      s = settle(dispatchAction(s, pick));
    }
    expect(took.sort()).toEqual(["Forest:Land", "Grizzly Bears:Creature", "Sol Ring:Artifact"]);
    expect(s.players.ai.battlefield.map((p) => p.card.name).sort()).toEqual(["Forest", "Grizzly Bears", "Muldrotha, the Gravetide", "Sol Ring"]);
  });
  it("⭐ an artifact creature takes the permission fewer graveyard cards need: Solemn as the creature when Sol Ring waits for the artifact", () => {
    const s = table({ seat: "ai", graveyard: gyOf([SOLEMN, SOL_RING]) });
    expect(offers(s, "ai").filter((a) => a.name === "Solemn Simulacrum").map((a) => a.muldrothaSlot.type)).toEqual(["Creature", "Artifact"]);
  });
});
