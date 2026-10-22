/**
 * THE TARGET-CREATURE COUNT-SCALED PUMP — "target creature [you control] gets ±X/±X until end of turn, where X is <count>", with an
 * optional keyword grant in the printed "gains <keywords> and gets" order, and the duration printed leading or trailing.
 *
 *   Summon: Titan (EDHREC #1982), chapter III — "Until end of turn, another target creature you control gains trample and gets +X/+X,
 *   where X is the number of lands you control." Strength of Cedars, Feeding Frenzy, Timberwatch Elf, Stalactite Stalker, Ashroot
 *   Animist, Treeguard Duo, Hardy Outlander's granted attack trigger and kin.
 *
 * X is read once, as the pump is applied (CR 608.2h — "If an effect requires information from the game …, the answer is determined
 * only once, when the effect is applied"); a source that has left is read as it last existed (the same rule — Stalactite Stalker,
 * sacrificed to pay its own cost). The engine read the plain creature subjects nowhere: only a subtype target ("target Sliver") and
 * the self and team forms had the "where X is" count.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, nextStep, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const SUMMON_TITAN = {"name":"Summon: Titan","type":"Enchantment Creature — Saga Giant","mana":"{3}{G}{G}","cmc":5,"power":"7","toughness":"7","keywords":["Reach","Trample","Mill"],"colors":["G"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill five cards.\nII — Return all land cards from your graveyard to the battlefield tapped.\nIII — Until end of turn, another target creature you control gains trample and gets +X/+X, where X is the number of lands you control.\nReach, trample"};
const STRENGTH_OF_CEDARS = {"name":"Strength of Cedars","type":"Instant — Arcane","mana":"{4}{G}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Target creature gets +X/+X until end of turn, where X is the number of lands you control."};
const FEEDING_FRENZY = {"name":"Feeding Frenzy","type":"Instant","mana":"{2}{B}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Target creature gets -X/-X until end of turn, where X is the number of Zombies on the battlefield."};
const TIMBERWATCH_ELF = {"name":"Timberwatch Elf","type":"Creature — Elf","mana":"{2}{G}","cmc":3,"power":"1","toughness":"2","keywords":[],"colors":["G"],"oracle":"{T}: Target creature gets +X/+X until end of turn, where X is the number of Elves on the battlefield."};
const STALACTITE_STALKER = {"name":"Stalactite Stalker","type":"Creature — Goblin Rogue","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Menace"],"colors":["B"],"oracle":"Menace\nAt the beginning of your end step, if you descended this turn, put a +1/+1 counter on this creature. (You descended if a permanent card was put into your graveyard from anywhere.)\n{2}{B}, Sacrifice this creature: Target creature gets -X/-X until end of turn, where X is this creature's power."};
const ASHROOT_ANIMIST = {"name":"Ashroot Animist","type":"Creature — Lizard Druid","mana":"{2}{R}{G}","cmc":4,"power":"4","toughness":"4","keywords":["Trample"],"colors":["G","R"],"oracle":"Trample\nWhenever this creature attacks, another target creature you control gains trample and gets +X/+X until end of turn, where X is this creature's power."};
const TREEGUARD_DUO = {"name":"Treeguard Duo","type":"Creature — Frog Rabbit","mana":"{3}{G}","cmc":4,"power":"3","toughness":"4","keywords":[],"colors":["G"],"oracle":"When this creature enters, until end of turn, target creature you control gains vigilance and gets +X/+X, where X is the number of creatures you control."};
const HARDY_OUTLANDER = {"name":"Hardy Outlander","type":"Legendary Enchantment — Background","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Commander creatures you own have \"Whenever this creature attacks a player, if no opponent has more life than that player, another target creature you control gets +X/+X until end of turn, where X is this creature's power.\""};
const WAR_DANCE = {"name":"War Dance","type":"Enchantment","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"At the beginning of your upkeep, you may put a verse counter on this enchantment.\nSacrifice this enchantment: Target creature gets +X/+X until end of turn, where X is the number of verse counters on this enchantment."};
const BLOODTHIRSTY_OGRE = {"name":"Bloodthirsty Ogre","type":"Creature — Ogre Warrior Shaman","mana":"{2}{B}","cmc":3,"power":"3","toughness":"1","keywords":[],"colors":["B"],"oracle":"{T}: Put a devotion counter on this creature.\n{T}: Target creature gets -X/-X until end of turn, where X is the number of devotion counters on this creature. Activate only if you control a Demon."};
const TEZZERET_THE_SCHEMER = {"name":"Tezzeret the Schemer","type":"Legendary Planeswalker — Tezzeret","mana":"{2}{U}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B","U"],"oracle":"+1: Create a colorless artifact token named Etherium Cell with \"{T}, Sacrifice this token: Add one mana of any color.\"\n−2: Target creature gets +X/-X until end of turn, where X is the number of artifacts you control.\n−7: You get an emblem with \"At the beginning of combat on your turn, target artifact you control becomes an artifact creature with base power and toughness 5/5.\""};
const FISTS_OF_FLAME = {"name":"Fists of Flame","type":"Instant","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Draw a card. Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn. (A creature with trample can deal excess combat damage to the player or planeswalker it's attacking.)"};
const RUSH_OF_BLOOD = {"name":"Rush of Blood","type":"Instant","mana":"{2}{R}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Target creature gets +X/+0 until end of turn, where X is its power."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const CHANGELING_OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const GRAVEDIGGER = {"name":"Gravedigger","type":"Creature — Zombie","mana":"{3}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"When this creature enters, you may return target creature card from your graveyard to your hand."};

const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const lands = (n, controller, prefix = "f") => Array.from({ length: n }, (_, i) => P(`${prefix}${i}`, FOREST, controller));
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], hand = [], pool = {}, life = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s0.players[pid], battlefield, library: Array.from({ length: 10 }, (_, i) => ({ ...FOREST, id: `lib-${pid}-${i}` })), life: life[pid] ?? 40, ...extra });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: seat("user", user, { hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }),
      ai1: seat("ai1", ai1), ai2: seat("ai2", ai2), ai3: seat("ai3", ai3) } };
}
const pt = (s, id) => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;

describe("the reader", () => {
  it("⭐ the cards play their whole text", () => {
    expect({
      titan: classifyCard(SUMMON_TITAN), cedars: classifyCard(STRENGTH_OF_CEDARS), frenzy: classifyCard(FEEDING_FRENZY),
      timberwatch: classifyCard(TIMBERWATCH_ELF), stalker: classifyCard(STALACTITE_STALKER), ashroot: classifyCard(ASHROOT_ANIMIST),
      treeguard: classifyCard(TREEGUARD_DUO), outlander: classifyCard(HARDY_OUTLANDER), fists: classifyCard(FISTS_OF_FLAME),
    }).toEqual({
      titan: "native-trigger", cedars: "native-spell", frenzy: "native-spell", timberwatch: "native-activated", stalker: "native-mixed",
      ashroot: "native-trigger", treeguard: "native-trigger", outlander: "native-static", fists: "native-spell",
    });
  });
  it("⭐ the atoms: the subject, the count, the sign of the X pip and the granted keyword", () => {
    const clause = (t) => parseEffectClause(t, "Creature")?.atoms;
    expect({
      titan: clause("Until end of turn, another target creature you control gains trample and gets +X/+X, where X is the number of lands you control"),
      frenzy: parseEffectProgram(FEEDING_FRENZY)?.atoms,
      hareRaising: clause("Target creature you control gains vigilance and gets +X/+X until end of turn, where X is the number of creatures you control."),
    }).toEqual({
      titan: [{ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDeltaCount: { kind: "permanentsYouControl", cardType: "land" }, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Trample"] }],
      frenzy: [{ op: "pump", targetType: "creature", ptDeltaCount: { kind: "subtypeOnBattlefield", subtype: "Zombie", per: -1 }, ptDelta: { p: 0, t: 0 } }],
      hareRaising: [{ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], ptDeltaCount: { kind: "permanentsYouControl", cardType: "creature" }, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Vigilance"] }],
    });
  });
  it("CONTROL — a count of the source's own counters stays parked (its last known counters are not kept), as do +X/-X and a target-relative X", () => {
    expect({
      warDance: classifyCard(WAR_DANCE), ogre: classifyCard(BLOODTHIRSTY_OGRE), rush: classifyCard(RUSH_OF_BLOOD),
      plusMinus: parseEffectClause("Target creature gets +X/-X until end of turn, where X is the number of artifacts you control.", "Instant")?.atoms || [],
      bothDurations: parseEffectClause("Until end of turn, target creature gets +X/+X until end of turn, where X is the number of lands you control.", "Instant")?.atoms || [],
      noDuration: parseEffectClause("Target creature gets +X/+X, where X is the number of lands you control.", "Instant")?.atoms || [],
    }).toEqual({ warDance: "body-only", ogre: "body-only", rush: "arbiter-spell", plusMinus: [], bothDurations: [], noDuration: [] });
    expect(classifyCard(TEZZERET_THE_SCHEMER)).not.toBe("native-planeswalker");
  });
});

describe("spells and abilities", () => {
  it("⭐ Strength of Cedars: +X/+X where X is the lands its caster controls as it resolves", () => {
    const s0 = pod({ user: [P("bear", GRIZZLY_BEARS, "user"), ...lands(6, "user")], ai1: lands(9, "ai1", "o"), hand: [STRENGTH_OF_CEDARS], pool: { G: 1, C: 4 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && a.targets?.[0]?.id === "bear");
    expect(cast, "Strength of Cedars at the Bears").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, cast));
    expect(pt(s, "bear")).toBe("8/8");
  });

  it("⭐ Fists of Flame — the 'for each' form, leading duration: it draws first, then the target gains trample and +1/+0 per card its caster drew this turn, that one included", () => {
    const s0 = { ...pod({ user: [P("bear", GRIZZLY_BEARS, "user")], hand: [FISTS_OF_FLAME], pool: { R: 1, C: 1 } }) };
    const drewTwo = { ...s0, players: { ...s0.players, user: { ...s0.players.user, cardsDrawnThisTurn: 2 } } };
    const cast = (s) => {
      const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h0" && x.targets?.[0]?.id === "bear");
      expect(a, "Fists of Flame at the Bears").toBeTruthy();
      return resolveTopOfStack(dispatchAction(s, a));
    };
    const a = cast(s0), b = cast(drewTwo);
    expect({ fresh: pt(a, "bear"), afterTwoDraws: pt(b, "bear"), trample: !!permanentHasKeyword(b, "bear", "trample"), drew: a.players.user.hand.length })
      .toEqual({ fresh: "3/2", afterTwoDraws: "5/2", trample: true, drew: 1 });
  });

  it("⭐ Feeding Frenzy: -X/-X where X counts every Zombie on the battlefield, every seat's, a changeling among them; the Wurm dies", () => {
    const s0 = pod({ user: [P("gd", GRAVEDIGGER, "user")], ai1: [P("wurm", CRAW_WURM, "ai1"), P("gd1", GRAVEDIGGER, "ai1")], ai2: [P("outcast", CHANGELING_OUTCAST, "ai2"), P("gd2", GRAVEDIGGER, "ai2")], hand: [FEEDING_FRENZY], pool: { B: 1, C: 2 } });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && a.targets?.[0]?.id === "wurm");
    expect(cast, "Feeding Frenzy at the Wurm").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, cast));
    expect({ wurmAlive: s.players.ai1.battlefield.some((p) => p.id === "wurm"), wurmInGraveyard: s.players.ai1.graveyard.some((c) => c.name === "Craw Wurm") }).toEqual({ wurmAlive: false, wurmInGraveyard: true });
  });

  it("⭐ Timberwatch Elf: every Elf on the battlefield, a changeling included; the count is read as the ability resolves", () => {
    const s0 = pod({ user: [P("tw", TIMBERWATCH_ELF, "user"), P("bear", GRIZZLY_BEARS, "user")], ai1: [P("le", LLANOWAR_ELVES, "ai1"), P("outcast", CHANGELING_OUTCAST, "ai1")] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "tw" && a.targets?.[0]?.id === "bear");
    expect(act, "the {T} ability at the Bears").toBeTruthy();
    const onStack = dispatchAction(s0, act);
    // a third Elf arrives before it resolves: X is counted then (CR 608.2h).
    const grown = { ...onStack, players: { ...onStack.players, ai2: { ...onStack.players.ai2, battlefield: [P("le2", LLANOWAR_ELVES, "ai2")] } } };
    expect(pt(resolveTopOfStack(grown), "bear")).toBe("6/6");
  });

  it("⭐ Stalactite Stalker, sacrificed to pay its own cost: X is its power as it last existed — its +1/+1 counters counted", () => {
    const s0 = pod({ user: [P("stalker", STALACTITE_STALKER, "user", { counters: { "+1/+1": 2 } })], ai1: [P("wurm", CRAW_WURM, "ai1")], pool: { B: 1, C: 2 } });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "stalker" && a.targets?.[0]?.id === "wurm");
    expect(act, "the sacrifice ability at the Wurm").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, act));
    expect({ stalkerGone: !s.players.user.battlefield.some((p) => p.id === "stalker"), wurm: pt(s, "wurm") }).toEqual({ stalkerGone: true, wurm: "3/1" });
  });
});

describe("triggers", () => {
  it("⭐ Summon: Titan, chapter III: another creature its controller controls gains trample and +X/+X for the lands they control — never the Saga itself", () => {
    const titan = P("titan", SUMMON_TITAN, "user", { counters: { lore: 2 }, sagaFinal: 3 });
    let s = { ...pod({ user: [titan, P("bear", GRIZZLY_BEARS, "user"), ...lands(5, "user")] }), phase: "beginning", step: "draw" };
    s = runStepActions(s);
    expect(s.stack.length).toBe(1);
    expect(s.stack[0].targets.map((t) => t.id)).toEqual(["bear"]);
    s = resolveTopOfStack(s);
    // the Saga is sacrificed once its last chapter has resolved (CR 714.4)
    expect({ bear: pt(s, "bear"), trample: !!permanentHasKeyword(s, "bear", "trample"), titanSacrificed: s.players.user.graveyard.some((c) => c.name === "Summon: Titan") })
      .toEqual({ bear: "7/7", trample: true, titanSacrificed: true });
  });

  it("⭐ Treeguard Duo's enters trigger, the leading 'until end of turn' form: vigilance and +X/+X for the creatures its controller controls", () => {
    const s0 = pod({ user: [P("bear", GRIZZLY_BEARS, "user"), P("bear2", GRIZZLY_BEARS, "user")] });
    let s = enterPermanent(s0, { ...TREEGUARD_DUO, id: "c-duo" }, "user");
    s = flushTriggers(s, { chooseTargets: (cands) => cands.findIndex((c) => c.targets?.[0]?.id === "bear") });
    s = resolveTopOfStack(s);
    expect({ bear: pt(s, "bear"), vigilance: !!permanentHasKeyword(s, "bear", "vigilance") }).toEqual({ bear: "5/5", vigilance: true });
  });

  it("⭐ Ashroot Animist attacks: another creature its controller controls gains trample and +X/+X, X its power", () => {
    let s = { ...pod({ user: [P("ashroot", ASHROOT_ANIMIST, "user", { counters: { "+1/+1": 1 } }), P("bear", GRIZZLY_BEARS, "user")] }), phase: "combat", step: "declare-attackers" };
    const declare = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "ashroot" && a.defenderId === "ai1");
    s = nextStep(dispatchAction(s, declare));
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ bear: pt(s, "bear"), trample: !!permanentHasKeyword(s, "bear", "trample"), ashroot: pt(s, "ashroot") }).toEqual({ bear: "7/7", trample: true, ashroot: "5/5" });
  });

  it("⭐ Hardy Outlander: the commander attacks the opponent with the most life — another creature gets +X/+X for the commander's power; at a player with less life, nothing", () => {
    const commander = P("cmdr", { name: "Kestia, the Cultivator", type: "Legendary Creature — Nymph", mana: "{1}{G}{W}{U}", power: "4", toughness: "4", oracle: "", isCommander: true }, "user");
    const board = () => ({ ...pod({ user: [P("ho", HARDY_OUTLANDER, "user"), commander, P("bear", GRIZZLY_BEARS, "user")], life: { ai1: 40, ai2: 30, ai3: 30 } }), phase: "combat", step: "declare-attackers" });
    const attackAt = (defender) => {
      let s = board();
      const declare = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "cmdr" && a.defenderId === defender);
      s = nextStep(dispatchAction(s, declare));
      while (s.stack.length) s = resolveTopOfStack(s);
      return pt(s, "bear");
    };
    expect({ atTheMostLife: attackAt("ai1"), atLess: attackAt("ai2") }).toEqual({ atTheMostLife: "6/6", atLess: "2/2" });
  });
});
