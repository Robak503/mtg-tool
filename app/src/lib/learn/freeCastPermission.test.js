/**
 * freeCastPermission.test.js — casting without paying the mana cost by a static permission (shelf decks D35, 2026-09-30:
 * Kellan of the West's One with the Multiverse; Zaffai and the Tempests, Vision, Spectral Synthezoid and Omniscience share
 * the wording).
 *
 *   One with the Multiverse: "Once during each of your turns, you may cast a spell from your hand or the top of your library
 *   without paying its mana cost."   Zaffai: "... an instant or sorcery spell from your hand ..."   Vision: "... a noncreature
 *   or Robot spell from your hand ..."   Omniscience: "You may cast spells from your hand without paying their mana costs."
 *
 * CR 118.9: an alternative cost of nothing; additional costs still apply. The offer rides the shared builder's freeCast mode,
 * which skips timing because it was built for casts made during a resolution — so the offer itself holds every card to the
 * timing a paid cast would need. A once-per-your-turn source offers only on its controller's turn and latches per source
 * (cleared at the untap step); Omniscience has no once and no turn limit.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ONE = { name: "One with the Multiverse", type: "Enchantment", mana: "{6}{U}{U}", keywords: [],
  oracle: "You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library.\nOnce during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost." };
const ZAFFAI = { name: "Zaffai and the Tempests", type: "Legendary Creature — Human Bard Sorcerer", mana: "{5}{U}{R}", power: "5", toughness: "7", keywords: [],
  oracle: "Once during each of your turns, you may cast an instant or sorcery spell from your hand without paying its mana cost." };
const VISION = { name: "Vision, Spectral Synthezoid", type: "Legendary Artifact Creature — Robot Hero", mana: "{6}{U}{U}", power: "2", toughness: "5", keywords: ["Flying"],
  oracle: "Flying\nOnce during each of your turns, you may cast a noncreature or Robot spell from your hand without paying its mana cost." };
const OMNI = { name: "Omniscience", type: "Enchantment", mana: "{7}{U}{U}{U}", keywords: [], oracle: "You may cast spells from your hand without paying their mana costs." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", keywords: [], oracle: "Draw two cards." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const SENTRY = { name: "Monoist Sentry", type: "Artifact Creature — Robot", mana: "{B}", power: "4", toughness: "1", keywords: ["Defender"], oracle: "Defender" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], oracle: "({T}: Add {C}.)" };

/** No lands and an empty pool: the ONLY casts the player can make are the free ones. */
function table({ sources = [], hand = [], library = [], step = "main", active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const phase = step === "main" ? "precombat-main" : "combat";
  return { ...g, turn: 5, activePlayer: active, priorityHolder: "user", consecutivePasses: 0, phase, step, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: sources.map(([id, c]) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false })),
        hand: hand.map(([id, c]) => ({ ...c, id })), library: [...library.map(([id, c]) => ({ ...c, id })), ...[0, 1, 2, 3].map((i) => ({ ...WASTES, id: `w${i}` }))] },
      ai: { ...g.players.ai, battlefield: [createPermanent({ id: "AIB", card: { ...BEARS, id: "c-aib" }, controller: "ai", summoningSick: false })] } } };
}
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");
/** The free offers as { zone: [card ids] } — one entry per card however many target choices it has. */
const freeOffers = (s) => {
  const out = {};
  for (const a of casts(s).filter((x) => x.freeCast)) (out[a.fromZone] ||= new Set()).add(a.cardId);
  return Object.fromEntries(Object.entries(out).map(([z, ids]) => [z, [...ids].sort()]));
};
const castFree = (s, cardId) => {
  const act = casts(s).find((a) => a.freeCast && a.cardId === cardId);
  if (!act) throw new Error(`no free cast offered for ${cardId}`);
  return settle(dispatchAction(s, act));
};

describe("the cards", () => {
  it("all four read native-static; each line is the free-cast marker with its filter", () => {
    const fp = (c) => parseStaticAbilities(c).filter((d) => d.freeCastPermission).map((d) => d.freeCastPermission);
    expect({ tiers: [ONE, ZAFFAI, VISION, OMNI].map(classifyCard), one: fp(ONE), zaffai: fp(ZAFFAI), vision: fp(VISION), omni: fp(OMNI) }).toEqual({
      tiers: ["native-static", "native-static", "native-static", "native-static"],
      one: [{ oncePerYourTurn: true, fromTop: true, filter: "any" }],
      zaffai: [{ oncePerYourTurn: true, fromTop: false, filter: "instantOrSorcery" }],
      vision: [{ oncePerYourTurn: true, fromTop: false, filter: "noncreatureOrRobot" }],
      omni: [{ oncePerYourTurn: false, fromTop: false, filter: "any" }],
    });
  });

  it("fences (synthetic): an unread filter or a different once-window parks the line", () => {
    const fp = (oracle) => parseStaticAbilities({ name: "X", type: "Enchantment", oracle }).filter((d) => d.freeCastPermission);
    expect([
      fp("Once during each of your turns, you may cast a creature spell from your hand without paying its mana cost."),
      fp("Once each turn, you may cast a spell from your hand without paying its mana cost."),
    ]).toEqual([[], []]);
  });
});

describe("One with the Multiverse", () => {
  it("offers a free cast from hand and from the top of the library; one cast spends the turn's once (WITNESS)", () => {
    let s = table({ sources: [["ONE", ONE]], hand: [["div", DIVINATION], ["bears", BEARS]], library: [["bolt", BOLT]] });
    const before = freeOffers(s);
    s = castFree(s, "div");
    const witness = { before, hand: s.players.user.hand.map((c) => c.id).sort(), graveyard: s.players.user.graveyard.map((c) => c.id),
      latched: s.onceTriggersFiredThisTurn?.ONE_freeCastOnce === true, after: freeOffers(s) };
    console.log(`WITNESS oneWithTheMultiverse ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ before: { hand: ["bears", "div"], library: ["bolt"] }, hand: ["bears", "bolt", "w0"], graveyard: ["div"], latched: true, after: {} });
  });

  it("the untap step clears the latch, and the next turn's free cast is offered again", () => {
    const spent = castFree(table({ sources: [["ONE", ONE]], hand: [["div", DIVINATION], ["bears", BEARS]] }), "div");
    const untapped = runStepActions({ ...spent, phase: "beginning", step: "untap", turn: spent.turn + 2 });
    const nextMain = { ...untapped, phase: "precombat-main", step: "main", priorityHolder: "user", stack: [] };
    // Divination drew the two Wastes under it; lands are never cast, so the Bear is the one free offer.
    expect({ latch: untapped.onceTriggersFiredThisTurn?.ONE_freeCastOnce ?? null, offers: freeOffers(nextMain) }).toEqual({ latch: null, offers: { hand: ["bears"] } });
  });

  it("offers nothing on an opponent's turn, even an instant (\"during each of YOUR turns\")", () => {
    expect(freeOffers(table({ sources: [["ONE", ONE]], hand: [["bolt", BOLT]], active: "ai" }))).toEqual({});
  });

  it("keeps normal timing: in combat only the instant is offered free", () => {
    expect(freeOffers(table({ sources: [["ONE", ONE]], hand: [["div", DIVINATION], ["bolt", BOLT], ["bears", BEARS]], step: "declare-attackers" }))).toEqual({ hand: ["bolt"] });
  });
});

describe("the filters", () => {
  it("Zaffai: instants and sorceries from hand only — not a creature, not the top of the library", () => {
    expect(freeOffers(table({ sources: [["Z", ZAFFAI]], hand: [["div", DIVINATION], ["bolt", BOLT], ["bears", BEARS]], library: [["bolt2", BOLT]] }))).toEqual({ hand: ["bolt", "div"] });
  });

  it("Vision: a noncreature spell or a Robot — the Bear is neither", () => {
    expect(freeOffers(table({ sources: [["V", VISION]], hand: [["div", DIVINATION], ["bears", BEARS], ["sentry", SENTRY]] }))).toEqual({ hand: ["div", "sentry"] });
  });

  it("two once-sources give two free casts in a turn, each spending its own latch", () => {
    let s = table({ sources: [["ONE", ONE], ["Z", ZAFFAI]], hand: [["div", DIVINATION], ["bolt", BOLT]] });
    s = castFree(s, "div");
    const second = casts(s).find((a) => a.freeCast && a.cardId === "bolt");
    expect({ firstLatch: Object.keys(s.onceTriggersFiredThisTurn || {}).filter((k) => k.endsWith("_freeCastOnce")), secondFrom: second?.freeCastOnceSourceId }).toEqual({ firstLatch: ["ONE_freeCastOnce"], secondFrom: "Z" });
  });
});

describe("Omniscience", () => {
  it("has no once: two free casts in one turn, and an instant free on an opponent's turn", () => {
    let s = table({ sources: [["O", OMNI]], hand: [["div", DIVINATION], ["bears", BEARS]] });
    s = castFree(s, "div");
    const afterOne = freeOffers(s);
    expect({ afterOne, offTurn: freeOffers(table({ sources: [["O", OMNI]], hand: [["bolt", BOLT]], active: "ai" })) })
      .toEqual({ afterOne: { hand: ["bears"] }, offTurn: { hand: ["bolt"] } });
  });

  it("covers a card before a once-source would spend its latch on it", () => {
    let s = table({ sources: [["ONE", ONE], ["O", OMNI]], hand: [["div", DIVINATION]] });
    const offers = casts(s).filter((a) => a.freeCast && a.cardId === "div");
    s = castFree(s, "div");
    expect({ freeOffersForDiv: offers.length, latchOnOffer: offers[0]?.freeCastOnceSourceId ?? null, latched: Object.keys(s.onceTriggersFiredThisTurn || {}) })
      .toEqual({ freeOffersForDiv: 1, latchOnOffer: null, latched: [] });
  });
});
