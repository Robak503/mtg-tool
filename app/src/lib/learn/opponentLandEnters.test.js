/**
 * opponentLandEnters.test.js — the play-weighted program, #702 Archaeomancer's Map, and the family that prints the same event.
 *
 *   "When this artifact enters, search your library for up to two basic Plains cards, reveal them, put them into your hand,
 *    then shuffle.
 *    Whenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your
 *    hand onto the battlefield."
 *
 * "Whenever a land an opponent controls enters" was never detected: the landfall arm read only "a land you control". It is now
 * the landfall event (checkLandfallTriggers — the play-land path and every effect that puts a land onto the battlefield) with the
 * scope `landOpponentControls`: the entering land is controlled by someone other than the watcher's controller (the engine seats no
 * teams, so every other seat is an opponent). "That player" is the land's controller, bound as the triggering permanent's
 * controller (makePendingTrigger) — the sentinel the opponent-creature drains already use. Archaeomancer's Map's intervening "if"
 * is read against that player at the trigger and again as it resolves (CR 603.4; the card's ruling). "A NONBASIC land" (Spectrum
 * Sentinel) narrows the entering land by its supertype (CR 205.4c).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The lands enter through the engine's own play-land action (legalActionsForPlayer + dispatchAction) or through an
 * effect (effects/atoms/zones.enterCardFromZone); passPriority resolves the stack; the "you may" and the land pick are the
 * engine's pending choices. The intervening "if" is checked as the trigger is put on the stack and again on resolution.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { resolveOptionalChoice, resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const MAP = {"name":"Archaeomancer's Map","type":"Artifact","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"When this artifact enters, search your library for up to two basic Plains cards, reveal them, put them into your hand, then shuffle.\nWhenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield."}; // body-only #702
const BONDS = {"name":"Polluted Bonds","type":"Enchantment","mana":"{3}{B}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"Whenever a land an opponent controls enters, that player loses 2 life and you gain 2 life."}; // body-only #3687
const HARVESTER = {"name":"Nightshade Harvester","type":"Creature — Elf Shaman","mana":"{3}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"Whenever a land an opponent controls enters, that player loses 1 life. Put a +1/+1 counter on this creature."}; // body-only #4621
const ANGEL = {"name":"Shattered Angel","type":"Creature — Phyrexian Angel","mana":"{3}{W}{W}","cmc":5,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever a land an opponent controls enters, you may gain 3 life."}; // body-only #6812
const SIRE = {"name":"Sire of Stagnation","type":"Creature — Eldrazi","mana":"{4}{U}{B}","cmc":6,"power":"5","toughness":"7","keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nWhenever a land an opponent controls enters, that player exiles the top two cards of their library and you draw two cards."}; // body-only #2761
const SENTINEL = {"name":"Spectrum Sentinel","type":"Artifact Creature — Soldier","mana":"{1}","cmc":1,"power":"1","toughness":"2","keywords":["Protection"],"colors":[],"oracle":"Protection from multicolored (This creature can't be blocked, targeted, dealt damage, enchanted, or equipped by anything multicolored.)\nWhenever a nonbasic land an opponent controls enters, you gain 1 life."}; // body-only #5821
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const PASSAGE = {"name":"Rogue's Passage","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn."}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const nLands = (n, owner, card = PLAINS, prefix = owner) => Array.from({ length: n }, (_, i) => P(`${prefix}-l${i}`, card, owner));
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));

/** A two-seat game; the AI is active in its precombat main with priority (it plays the land). */
function table({ user = [], ai = [], userHand = [], aiHand = [], userLib = [], aiLib = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20, landsPlayedThisTurn: 0 };
  players.user = { ...players.user, battlefield: user, hand: userHand, library: userLib };
  players.ai = { ...players.ai, battlefield: ai, hand: aiHand, library: aiLib };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0 };
}
/** Resolve the stack and the triggers; the user's "you may" answered by `accept`, a land pick taken automatically. */
function settle(s, { accept = true } = {}) {
  let g = 0;
  while (g++ < 200) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, accept); continue; }
    if (s.pendingChoice?.kind === "tutor-search") { s = resolveTutorChoice(s, accept ? autoPickTutorCandidate(s, s.pendingChoice) : null); continue; }
    if (!(s.stack.length || (s.pendingTriggers || []).length)) break;
    s = passPriority(s);
  }
  return s;
}
/** The AI plays the land card `cardId` from its hand (the offered play-land action). */
function aiPlays(s, cardId) {
  const a = legalActionsForPlayer(s, "ai").find((x) => x.kind === "play-land" && x.cardId === cardId);
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
}
const landCount = (s, pid) => s.players[pid].battlefield.filter((p) => /\bLand\b/.test(String(p.card?.type || ""))).length;
const pendingFrom = (s, name) => (s.pendingTriggers || []).filter((t) => t.source?.name === name);

describe("detection + classification", () => {
  it("the trigger is the landfall event with the opponent-land scope; Map's \"that player\" condition is read; it routes natively", () => {
    const d = detectTriggers(MAP).find((x) => x.event === "landfall");
    expect(d).toMatchObject({ event: "landfall", scope: "landOpponentControls" });
    expect(d.interveningIf).toBe("the triggering permanent's controller controls more lands than you");
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("Archaeomancer's Map, Polluted Bonds, Nightshade Harvester, Shattered Angel, Sire of Stagnation and Spectrum Sentinel classify native", () => {
    for (const c of [MAP, BONDS, HARVESTER, ANGEL, SIRE, SENTINEL]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — \"a land you control\" keeps its own scope; the opponent scope is not read for any other subject", () => {
    const own = detectTriggers({ name: "Probe", type: "Enchantment", oracle: "Whenever a land you control enters, you gain 1 life." }).find((x) => x.event === "landfall");
    expect(own?.scope).toBe("landYouControl");
    const other = detectTriggers({ name: "Probe", type: "Enchantment", oracle: "Whenever a land an opponent controls enters tapped, you gain 1 life." });
    expect(other.filter((x) => x.scope === "landOpponentControls")).toHaveLength(0);
  });
});

describe("RUNTIME — Archaeomancer's Map", () => {
  it("⭐ the AI plays its third land while the user has two: the user may put a land from hand onto the battlefield (untapped)", () => {
    let s = table({ user: [P("map", MAP, "user"), ...nLands(2, "user")], ai: nLands(2, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = aiPlays(s, "ai-swamp");
    expect(pendingFrom(s, "Archaeomancer's Map")).toHaveLength(1);
    s = settle(s);
    expect(landCount(s, "user")).toBe(3);
    const forest = s.players.user.battlefield.find((p) => p.card?.name === "Forest");
    expect(forest?.tapped).toBe(false);
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("declining the \"you may\" puts nothing", () => {
    let s = table({ user: [P("map", MAP, "user"), ...nLands(2, "user")], ai: nLands(2, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(aiPlays(s, "ai-swamp"), { accept: false });
    expect(landCount(s, "user")).toBe(2);
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("the condition as the trigger is put on the stack: equal land counts after the land enters (2 vs 2) → nothing", () => {
    let s = table({ user: [P("map", MAP, "user"), ...nLands(2, "user")], ai: nLands(1, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(aiPlays(s, "ai-swamp"));
    expect(landCount(s, "user")).toBe(2);
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("the condition again as it resolves (CR 603.4): the user has caught up by then → it does nothing", () => {
    let s = table({ user: [P("map", MAP, "user"), ...nLands(2, "user")], ai: nLands(2, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = aiPlays(s, "ai-swamp");
    expect(pendingFrom(s, "Archaeomancer's Map")).toHaveLength(1);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, P("extra", PLAINS, "user")] } } };
    s = settle(s);
    expect(landCount(s, "user")).toBe(3); // the extra Plains only — no land from hand
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("the user's own land never triggers the user's Map", () => {
    let s = { ...table({ user: [P("map", MAP, "user"), ...nLands(1, "user")], ai: nLands(4, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }, { ...PLAINS, id: "u-plains" }] }), activePlayer: "user", priorityHolder: "user" };
    const play = legalActionsForPlayer(s, "user").find((x) => x.kind === "play-land" && x.cardId === "u-plains");
    s = dispatchAction(s, play);
    expect(pendingFrom(s, "Archaeomancer's Map")).toHaveLength(0);
  });

  it("a land an opponent puts onto the battlefield with an effect triggers it too (a land from the AI's library)", () => {
    let s = table({ user: [P("map", MAP, "user"), ...nLands(1, "user")], ai: nLands(1, "ai", SWAMP), userHand: [{ ...FOREST, id: "u-forest" }], aiLib: [{ ...SWAMP, id: "ai-fetched" }] });
    s = enterCardFromZone(s, { playerId: "ai", cardId: "ai-fetched", fromZone: "library", tapped: true }).state;
    expect(pendingFrom(s, "Archaeomancer's Map")).toHaveLength(1);
    s = settle(s);
    expect(landCount(s, "user")).toBe(2);
  });
});

describe("RUNTIME — the twins", () => {
  it("Polluted Bonds: the land's controller loses 2, the Bonds' controller gains 2", () => {
    let s = table({ user: [P("bonds", BONDS, "user")], ai: nLands(1, "ai", SWAMP), aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(aiPlays(s, "ai-swamp"));
    expect([s.players.user.life, s.players.ai.life]).toEqual([22, 18]);
  });

  it("Nightshade Harvester: the land's controller loses 1 and the Harvester gets a +1/+1 counter", () => {
    let s = table({ user: [P("harv", HARVESTER, "user")], ai: [], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(aiPlays(s, "ai-swamp"));
    expect(s.players.ai.life).toBe(19);
    expect(s.players.user.life).toBe(20);
    expect(s.players.user.battlefield.find((p) => p.id === "harv").counters?.["+1/+1"]).toBe(1);
  });

  it("Shattered Angel: the user may gain 3 life", () => {
    let s = table({ user: [P("angel", ANGEL, "user")], ai: [], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(aiPlays(s, "ai-swamp"));
    expect(s.players.user.life).toBe(23);
  });

  it("Sire of Stagnation: the land's controller exiles the top two of their library, the Sire's controller draws two", () => {
    let s = table({ user: [P("sire", SIRE, "user")], ai: [], aiHand: [{ ...SWAMP, id: "ai-swamp" }], userLib: libCards(3, "u"), aiLib: libCards(3, "a") });
    s = settle(aiPlays(s, "ai-swamp"));
    expect(s.players.ai.library.map((c) => c.id)).toEqual(["a-lib2"]);
    expect(s.players.ai.exile.map((c) => c.id).sort()).toEqual(["a-lib0", "a-lib1"]);
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["u-lib0", "u-lib1"]);
  });

  it("Spectrum Sentinel: a nonbasic land triggers it (Rogue's Passage — gain 1), a basic land does not", () => {
    let s = table({ user: [P("sent", SENTINEL, "user")], ai: [], aiHand: [{ ...SWAMP, id: "ai-swamp" }, { ...PASSAGE, id: "ai-passage" }] });
    s = settle(aiPlays(s, "ai-swamp"));
    expect(s.players.user.life).toBe(20);
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, landsPlayedThisTurn: 0 } } };
    s = settle(aiPlays(s, "ai-passage"));
    expect(s.players.user.life).toBe(21);
  });

  it("control — a land the watcher's controller plays drains nobody (Polluted Bonds, the user's own land)", () => {
    let s = { ...table({ user: [P("bonds", BONDS, "user")], ai: [], userHand: [{ ...SWAMP, id: "u-swamp" }] }), activePlayer: "user", priorityHolder: "user" };
    const play = legalActionsForPlayer(s, "user").find((x) => x.kind === "play-land" && x.cardId === "u-swamp");
    s = settle(dispatchAction(s, play));
    expect([s.players.user.life, s.players.ai.life]).toEqual([20, 20]);
  });
});
