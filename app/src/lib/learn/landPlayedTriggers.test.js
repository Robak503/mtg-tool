/**
 * landPlayedTriggers.test.js — the play-weighted program, #901 Burgeoning and the family that prints the same event.
 *
 *   Burgeoning: "Whenever an opponent plays a land, you may put a land card from your hand onto the battlefield."
 *   Horn of Greed (#2127): "Whenever a player plays a land, that player draws a card."
 *
 * "plays a land" is the special action (CR 305.1, CR 116.2a), not a land entering: the bundled rulings say "Playing a land will
 * trigger it, but putting a land onto the battlefield as part of an effect will not." The engine already carried that gate for City
 * of Traitors ("When you play another land" — `playedOnly`, threaded by the play-land dispatcher only). The opponent's and any
 * player's forms now read through the same gate: the landfall event with the scope `landOpponentControls` (an opponent played it)
 * or `landAnyPlayer` (any player did), `playedOnly`. "That player" is the player who played the land — the land's controller, the
 * triggering permanent's controller (the sentinel the opponent-land watchers already use).
 *
 * And the multipliers and the silencer that key on a permanent ENTERING do not reach these triggers (Ancient Greenwarden's ruling:
 * "An ability that triggers whenever you play a land won't trigger an additional time."). Before this slice City of Traitors'
 * sacrifice trigger was doubled by Ancient Greenwarden or Yarok and silenced by an opponent's Elesh Norn, Mother of Machines.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this slice).
 * The lands are played through the engine's own play-land action (legalActionsForPlayer + dispatchAction) or put onto the
 * battlefield by an effect (effects/atoms/zones.enterCardFromZone); passPriority resolves the stack; the "you may" and the land pick
 * are the engine's pending choices.
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
const BURGEONING = {"name":"Burgeoning","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Whenever an opponent plays a land, you may put a land card from your hand onto the battlefield."}; // body-only #901
const HORN = {"name":"Horn of Greed","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Whenever a player plays a land, that player draws a card."}; // body-only #2127
const WURM = {"name":"Dirtcowl Wurm","type":"Creature — Wurm","mana":"{4}{G}","cmc":5,"power":"3","toughness":"4","keywords":[],"colors":["G"],"oracle":"Whenever an opponent plays a land, put a +1/+1 counter on this creature."}; // body-only #16080
const PANGOSAUR = {"name":"Pangosaur","type":"Creature — Dinosaur","mana":"{2}{G}{G}","cmc":4,"power":"6","toughness":"6","keywords":[],"colors":["G"],"oracle":"Whenever a player plays a land, return this creature to its owner's hand."}; // body-only #23177
const CITY = {"name":"City of Traitors","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"When you play another land, sacrifice this land.\n{T}: Add {C}{C}."}; // land #1164
const GREENWARDEN = {"name":"Ancient Greenwarden","type":"Creature — Elemental","mana":"{4}{G}{G}","cmc":6,"power":"5","toughness":"7","keywords":["Reach"],"colors":["G"],"oracle":"Reach (This creature can block creatures with flying.)\nYou may play lands from your graveyard.\nIf a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."}; // native-static #695
const YAROK = {"name":"Yarok, the Desecrated","type":"Legendary Creature — Elemental Horror","mana":"{2}{B}{G}{U}","cmc":5,"power":"3","toughness":"5","keywords":["Lifelink","Deathtouch"],"colors":["B","G","U"],"oracle":"Deathtouch, lifelink\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."}; // native-static #2450
const NORN = {"name":"Elesh Norn, Mother of Machines","type":"Legendary Creature — Phyrexian Praetor","mana":"{4}{W}","cmc":5,"power":"4","toughness":"7","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nPermanents entering don't cause abilities of permanents your opponents control to trigger."}; // native-static #1038
const BONDS = {"name":"Polluted Bonds","type":"Enchantment","mana":"{3}{B}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"Whenever a land an opponent controls enters, that player loses 2 life and you gain 2 life."}; // native-trigger
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));

/** A two-seat game; `active` is in its precombat main with priority (it plays the land). */
function table({ user = [], ai = [], userHand = [], aiHand = [], userLib = [], aiLib = [], active = "ai" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20, landsPlayedThisTurn: 0 };
  players.user = { ...players.user, battlefield: user, hand: userHand, library: userLib };
  players.ai = { ...players.ai, battlefield: ai, hand: aiHand, library: aiLib };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}
/** Resolve the stack and the triggers; a "you may" answered by `accept`, a land pick taken automatically. */
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
/** `pid` plays the land card `cardId` from its hand (the offered play-land action). */
function plays(s, pid, cardId) {
  const a = legalActionsForPlayer(s, pid).find((x) => x.kind === "play-land" && x.cardId === cardId);
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
}
const landCount = (s, pid) => s.players[pid].battlefield.filter((p) => /\bLand\b/.test(String(p.card?.type || ""))).length;
const pendingFrom = (s, name) => (s.pendingTriggers || []).filter((t) => t.source?.name === name);

describe("detection + classification", () => {
  it("\"an opponent plays a land\" → the landfall event, the opponent-land scope, PLAYED only; it routes natively", () => {
    for (const card of [BURGEONING, WURM]) {
      const d = detectTriggers(card).find((x) => x.event === "landfall");
      expect([card.name, d && { scope: d.scope, playedOnly: d.playedOnly }]).toEqual([card.name, { scope: "landOpponentControls", playedOnly: true }]);
      expect(triggerRoutesNatively(d)).toBe(true);
    }
  });

  it("\"a player plays a land\" → the any-player land scope, PLAYED only; Horn of Greed's \"that player\" is the land's controller", () => {
    const horn = detectTriggers(HORN).find((x) => x.event === "landfall");
    expect(horn).toMatchObject({ scope: "landAnyPlayer", playedOnly: true, effectClause: "the triggering permanent's controller draws a card" });
    expect(triggerRoutesNatively(horn)).toBe(true);
    const pango = detectTriggers(PANGOSAUR).find((x) => x.event === "landfall");
    expect(pango).toMatchObject({ scope: "landAnyPlayer", playedOnly: true });
    expect(triggerRoutesNatively(pango)).toBe(true);
  });

  it("⭐ Burgeoning, Horn of Greed, Dirtcowl Wurm and Pangosaur classify native", () => {
    for (const c of [BURGEONING, HORN, WURM, PANGOSAUR]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — a land TYPE (\"a player plays a Desert\"), a nonbasic qualifier or a land played from exile are not read", () => {
    for (const oracle of [
      "Whenever a player plays a Desert, that player draws a card and you gain 3 life.",
      "Whenever an opponent plays a nonbasic land, you gain 1 life.",
      "Whenever a player plays a land from exile, that player draws a card.",
    ]) {
      const d = detectTriggers({ name: "Probe", type: "Enchantment", oracle });
      expect([oracle, d.filter((x) => x.event === "landfall").length]).toEqual([oracle, 0]);
    }
  });
});

describe("RUNTIME — Burgeoning", () => {
  it("⭐ the AI plays a land: the user may put a land card from hand onto the battlefield (untapped)", () => {
    let s = table({ user: [P("burg", BURGEONING, "user")], userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = plays(s, "ai", "ai-swamp");
    expect(pendingFrom(s, "Burgeoning")).toHaveLength(1);
    s = settle(s);
    expect(landCount(s, "user")).toBe(1);
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Forest")?.tapped).toBe(false);
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("declining the \"you may\" puts nothing", () => {
    let s = table({ user: [P("burg", BURGEONING, "user")], userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(plays(s, "ai", "ai-swamp"), { accept: false });
    expect(landCount(s, "user")).toBe(0);
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("control — the user's own land play never triggers the user's Burgeoning", () => {
    let s = table({ user: [P("burg", BURGEONING, "user")], userHand: [{ ...FOREST, id: "u-forest" }, { ...FOREST, id: "u-forest2" }], active: "user" });
    s = plays(s, "user", "u-forest");
    expect(pendingFrom(s, "Burgeoning")).toHaveLength(0);
  });

  it("the ruling: a land an opponent puts onto the battlefield with an effect is not PLAYED — Burgeoning does not trigger", () => {
    let s = table({ user: [P("burg", BURGEONING, "user")], userHand: [{ ...FOREST, id: "u-forest" }], aiLib: [{ ...SWAMP, id: "ai-fetched" }] });
    s = enterCardFromZone(s, { playerId: "ai", cardId: "ai-fetched", fromZone: "library" }).state;
    expect(pendingFrom(s, "Burgeoning")).toHaveLength(0);
    s = settle(s);
    expect(landCount(s, "user")).toBe(0);
  });

  it("control — the same effect-put land still triggers an ENTERS watcher (Polluted Bonds): the gate is the play, not the land", () => {
    let s = table({ user: [P("bonds", BONDS, "user")], aiLib: [{ ...SWAMP, id: "ai-fetched" }] });
    s = settle(enterCardFromZone(s, { playerId: "ai", cardId: "ai-fetched", fromZone: "library" }).state);
    expect([s.players.user.life, s.players.ai.life]).toEqual([22, 18]);
  });
});

describe("RUNTIME — the twins", () => {
  it("⭐ Horn of Greed: the player who plays the land draws — the AI's land, the AI draws; the user's land, the user draws", () => {
    let s = table({ user: [P("horn", HORN, "user")], aiHand: [{ ...SWAMP, id: "ai-swamp" }], userLib: libCards(3, "u"), aiLib: libCards(3, "a") });
    s = settle(plays(s, "ai", "ai-swamp"));
    expect([s.players.ai.hand.map((c) => c.id), s.players.user.hand.map((c) => c.id)]).toEqual([["a-lib0"], []]);
    let t = table({ user: [P("horn", HORN, "user")], userHand: [{ ...FOREST, id: "u-forest" }], userLib: libCards(3, "u"), aiLib: libCards(3, "a"), active: "user" });
    t = settle(plays(t, "user", "u-forest"));
    expect([t.players.user.hand.map((c) => c.id), t.players.ai.hand.map((c) => c.id)]).toEqual([["u-lib0"], []]);
  });

  it("Dirtcowl Wurm: an opponent's land play puts a +1/+1 counter on it; its controller's own land play does not", () => {
    let s = table({ user: [P("wurm", WURM, "user")], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(plays(s, "ai", "ai-swamp"));
    expect(s.players.user.battlefield.find((p) => p.id === "wurm").counters?.["+1/+1"]).toBe(1);
    let t = table({ user: [P("wurm", WURM, "user")], userHand: [{ ...FOREST, id: "u-forest" }], active: "user" });
    t = settle(plays(t, "user", "u-forest"));
    expect(t.players.user.battlefield.find((p) => p.id === "wurm").counters?.["+1/+1"] ?? 0).toBe(0);
  });

  it("Pangosaur: any player's land play returns it to its owner's hand (the AI's, then its controller's own)", () => {
    let s = table({ user: [P("pango", PANGOSAUR, "user")], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(plays(s, "ai", "ai-swamp"));
    expect([s.players.user.battlefield.some((p) => p.id === "pango"), s.players.user.hand.map((c) => c.name)]).toEqual([false, ["Pangosaur"]]);
    let t = table({ user: [P("pango", PANGOSAUR, "user")], userHand: [{ ...FOREST, id: "u-forest" }], active: "user" });
    t = settle(plays(t, "user", "u-forest"));
    expect(t.players.user.hand.map((c) => c.name)).toEqual(["Pangosaur"]);
  });
});

describe("RUNTIME — the entering multipliers and the silencer do not reach a played-land trigger (the Greenwarden ruling)", () => {
  it("⭐ Horn of Greed beside Yarok: the AI's land play draws ONE card, not two", () => {
    let s = table({ user: [P("horn", HORN, "user"), P("yarok", YAROK, "user")], aiHand: [{ ...SWAMP, id: "ai-swamp" }], aiLib: libCards(3, "a") });
    s = plays(s, "ai", "ai-swamp");
    expect(pendingFrom(s, "Horn of Greed")).toHaveLength(1);
    s = settle(s);
    expect(s.players.ai.hand).toHaveLength(1);
  });

  it("⭐ FIX — City of Traitors beside Ancient Greenwarden: playing another land triggers it ONCE (it was doubled)", () => {
    let s = table({ user: [P("city", CITY, "user"), P("gw", GREENWARDEN, "user")], userHand: [{ ...FOREST, id: "u-forest" }], active: "user" });
    s = plays(s, "user", "u-forest");
    expect(pendingFrom(s, "City of Traitors")).toHaveLength(1);
  });

  it("⭐ FIX — an opponent's Elesh Norn, Mother of Machines does not stop a played-land trigger: City of Traitors still sacrifices", () => {
    let s = table({ user: [P("city", CITY, "user")], ai: [P("norn", NORN, "ai")], userHand: [{ ...FOREST, id: "u-forest" }], active: "user" });
    s = plays(s, "user", "u-forest");
    expect(pendingFrom(s, "City of Traitors")).toHaveLength(1);
    s = settle(s);
    expect(s.players.user.battlefield.some((p) => p.id === "city")).toBe(false);
  });

  it("⭐ the same Elesh Norn: Burgeoning still triggers on the Norn controller's land play", () => {
    let s = table({ user: [P("burg", BURGEONING, "user")], ai: [P("norn", NORN, "ai")], userHand: [{ ...FOREST, id: "u-forest" }], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = settle(plays(s, "ai", "ai-swamp"));
    expect(landCount(s, "user")).toBe(1);
  });

  it("control — an ENTERS watcher keeps both: Polluted Bonds is doubled by Yarok and silenced by an opponent's Elesh Norn", () => {
    let s = table({ user: [P("bonds", BONDS, "user"), P("yarok", YAROK, "user")], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    s = plays(s, "ai", "ai-swamp");
    expect(pendingFrom(s, "Polluted Bonds")).toHaveLength(2);
    let t = table({ user: [P("bonds", BONDS, "user")], ai: [P("norn", NORN, "ai")], aiHand: [{ ...SWAMP, id: "ai-swamp" }] });
    t = plays(t, "ai", "ai-swamp");
    expect(pendingFrom(t, "Polluted Bonds")).toHaveLength(0);
  });
});
