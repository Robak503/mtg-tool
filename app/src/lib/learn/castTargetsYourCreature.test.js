/**
 * SEASON OF GROWTH (EDHREC #2218) — "Whenever a creature you control enters, scry 1. / Whenever you cast a spell that targets a
 * creature you control, draw a card."
 *
 * Heroic's cast event (heroic is an ability word, CR 207.2c — the cast spell's chosen targets, threaded from the cast into checkCastTriggers) read for any
 * creature its watcher's controller controls instead of the watcher itself: the spell is cast by that player (CR 601.2i — the cast
 * triggers), and at least one of its targets is a creature that player controls as it is cast — the creature it is now (CR 613.1d). One
 * cast is one event: a spell aimed at two such creatures draws one card. An Aura spell targets the creature it will enchant (CR 303.4a).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const SEASON_OF_GROWTH = {"name":"Season of Growth","type":"Enchantment","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"keywords":["Scry"],"colors":["G"],"oracle":"Whenever a creature you control enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nWhenever you cast a spell that targets a creature you control, draw a card."};
const MS_MARVEL = {"name":"Ms. Marvel, Kamala Khan","type":"Legendary Creature — Mutant Inhuman Hero","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Reach","Vigilance","Embiggen Fist"],"colors":["U"],"oracle":"Reach, vigilance\nYou have no maximum hand size.\nEmbiggen Fist — Whenever you cast a spell that targets a creature you control, draw a card. Until end of turn, Ms. Marvel gains \"Ms. Marvel's base power is equal to the number of cards in your hand.\""};
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."};
const TANDEM_TACTICS = {"name":"Tandem Tactics","type":"Instant","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Up to two target creatures each get +1/+2 until end of turn. You gain 2 life."};
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `L-${pid}-${i}` }));
/** `caster`'s precombat main; the user holds Season of Growth; each seat has its Bears; the caster's hand holds `spell`. */
function pod(caster, spell, { userExtra = [] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s0.players[pid], battlefield, hand: [], library: lib(pid), ...extra });
  const pool = { W: 1, U: 0, B: 0, R: 0, G: 1, C: 1 };
  const players = { ...s0.players,
    user: seat("user", [P("season", SEASON_OF_GROWTH, "user"), P("ub1", GRIZZLY_BEARS, "user"), P("ub2", GRIZZLY_BEARS, "user"), ...userExtra]),
    ai1: seat("ai1", [P("ab1", GRIZZLY_BEARS, "ai1")]), ai2: seat("ai2", []), ai3: seat("ai3", []) };
  players[caster] = { ...players[caster], hand: [{ ...spell, id: "h-spell" }], manaPool: pool };
  return { ...s0, turn: 4, activePlayer: caster, priorityHolder: caster, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0, players };
}
/** `caster` casts the spell at exactly `targetIds`; every trigger and the spell resolve. Returns the cards the user drew (its library shrinking). */
function castAt(caster, spell, targetIds, opts) {
  const s0 = pod(caster, spell, opts);
  const want = [...targetIds].sort().join(",");
  const a = legalActionsForPlayer(s0, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-spell" && (x.targets || []).map((t) => t.id).sort().join(",") === want);
  expect(a, `${spell.name} at ${want}`).toBeTruthy();
  let s = flushTriggers(dispatchAction(s0, a));
  for (let i = 0; i < 8 && s.stack.length; i++) s = flushTriggers(resolveTopOfStack(s));
  return s0.players.user.library.length - s.players.user.library.length;
}

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(SEASON_OF_GROWTH)).toBe("native-trigger");
  });
  it("⭐ the watcher: the caster's own spell, a creature its controller controls among the targets", () => {
    expect(detectTriggers(SEASON_OF_GROWTH).map((t) => ({ event: t.event, whose: t.whose, filter: t.spellFilter ?? null, effect: t.effectClause })))
      .toEqual([{ event: "etb", whose: "any", filter: null, effect: "scry 1" }, { event: "cast", whose: "you", filter: { kind: "targetsCreatureYouControl" }, effect: "draw a card" }]);
  });
  it("CONTROL — Ms. Marvel stays parked: her payoff's quoted base-power grant is not read", () => {
    expect(classifyCard(MS_MARVEL)).toBe("body-only");
  });
});

describe("the game", () => {
  it("⭐ Giant Growth on its controller's Bears draws a card; on an opponent's Bears, nothing", () => {
    expect({ own: castAt("user", GIANT_GROWTH, ["ub1"]), opponents: castAt("user", GIANT_GROWTH, ["ab1"]) }).toEqual({ own: 1, opponents: 0 });
  });
  it("⭐ one cast, one card: Tandem Tactics at both of its Bears draws one; at one of them and an opponent's, one", () => {
    expect({ both: castAt("user", TANDEM_TACTICS, ["ub1", "ub2"]), mixed: castAt("user", TANDEM_TACTICS, ["ub1", "ab1"]) }).toEqual({ both: 1, mixed: 1 });
  });
  it("⭐ an Aura spell targets the creature it will enchant: Rancor on its Bears draws a card", () => {
    expect(castAt("user", RANCOR, ["ub1"])).toBe(1);
  });
  it("⭐ 'you cast': an opponent's Giant Growth on its controller's Bears draws nothing", () => {
    expect(castAt("ai1", GIANT_GROWTH, ["ub1"])).toBe(0);
  });
});
