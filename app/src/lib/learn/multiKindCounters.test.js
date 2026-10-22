/**
 * COUNTERS OF SEVERAL KINDS ON ONE TARGET (play-weighted 2026-10-21):
 *   · Gift of the Viper (EDHREC #1691) — "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it.";
 *   · Qarsi Revenant (#2356) — "Renew — {2}{B}, Exile this card from your graveyard: Put a flying counter, a deathtouch counter, and a
 *     lifelink counter on target creature. Activate only as a sorcery.";
 *   · Champion of Dusan (renew: "a +1/+1 counter and a trample counter"), Unexpected Fangs ("a +1/+1 counter and a lifelink counter").
 * One instruction, one recipient: every counter lands on the chosen creature in the same event (CR 122.1); each keyword counter grants
 * its keyword (CR 122.1b). One event, so a "whenever you put one or more +1/+1 counters" watcher sees it once. Only the kinds the engine
 * places and honours are read (the +1/+1 counter and the keyword counters the grant reads); anything else parks the card.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GIFT_OF_THE_VIPER = {"name":"Gift of the Viper","type":"Instant","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it."}; // arbiter-spell on c2d7f0b0
const QARSI_REVENANT = {"name":"Qarsi Revenant","type":"Creature — Vampire","mana":"{1}{B}{B}","cmc":3,"power":"3","toughness":"3","keywords":["Deathtouch","Flying","Lifelink","Renew"],"colors":["B"],"oracle":"Flying, deathtouch, lifelink\nRenew — {2}{B}, Exile this card from your graveyard: Put a flying counter, a deathtouch counter, and a lifelink counter on target creature. Activate only as a sorcery."}; // body-only on c2d7f0b0
const CHAMPION_OF_DUSAN = {"name":"Champion of Dusan","type":"Creature — Human Warrior","mana":"{2}{G}","cmc":3,"power":"4","toughness":"2","keywords":["Renew","Trample"],"colors":["G"],"oracle":"Trample\nRenew — {1}{G}, Exile this card from your graveyard: Put a +1/+1 counter and a trample counter on target creature. Activate only as a sorcery."}; // body-only on c2d7f0b0
const UNEXPECTED_FANGS = {"name":"Unexpected Fangs","type":"Instant","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Put a +1/+1 counter and a lifelink counter on target creature."}; // arbiter-spell on c2d7f0b0
const STOCKING_THE_PANTRY = {"name":"Stocking the Pantry","type":"Enchantment","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Whenever you put one or more +1/+1 counters on a creature you control, put a supply counter on this enchantment.\n{2}, Remove a supply counter from this enchantment: Draw a card."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const land = (name, sub, c) => ({ name, type: `Basic Land — ${sub}`, mana: "", cmc: 0, keywords: [], colors: [], oracle: `({T}: Add {${c}}.)` });
const FOREST = land("Forest", "Forest", "G"), SWAMP = land("Swamp", "Swamp", "B");

const cardOf = (card, id) => ({ ...card, id });
const perm = (id, card, controller = "user", extra = {}) => createPermanent({ id, card: cardOf(card, `c-${id}`), controller, summoningSick: false, ...extra });
const lands = (prefix, card, n) => Array.from({ length: n }, (_, i) => perm(`${prefix}${i + 1}`, card));
function board({ bf = [], hand = [], graveyard = [], aiBf = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, graveyard, exile: [], library: [] }, ai: { ...s0.players.ai, battlefield: aiBf, library: [] } } };
}
function settle(s0) {
  let s = s0;
  for (let g = 0; g < 20 && (s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice; g++) s = s.stack.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return s;
}
const aimedAt = (id) => (a) => (a.targets || []).some((t) => t.id === id);
const counters = (s, id) => ({ ...(findPermanent(s, id)?.permanent?.counters || {}) });
const kw = (s, id, words) => words.map((w) => permanentHasKeyword(s, id, w));

describe("the reader", () => {
  it("⭐ the four cards play their whole text", () => {
    expect([GIFT_OF_THE_VIPER, QARSI_REVENANT, CHAMPION_OF_DUSAN, UNEXPECTED_FANGS].map((c) => classifyCard(c)))
      .toEqual(["native-spell", "native-activated", "native-activated", "native-spell"]);
  });
  it("⭐ the atom: one add-counter, the first kind and the others, then the untap on the same target", () => {
    expect(parseEffectProgram(GIFT_OF_THE_VIPER).atoms).toEqual([
      { op: "add-counter", counterType: "+1/+1", amount: 1, alsoCounterTypes: ["reach", "deathtouch"], targetType: "creature" },
      { op: "untap", bindPreviousTargets: true },
    ]);
  });
  it("control: an unenforced kind, a kind twice, a -1/-1 counter, or a +1/+1 counter after the first stays unread", () => {
    expect([
      "Put a +1/+1 counter and an exalted counter on target creature.",
      "Put a flying counter and a flying counter on target creature.",
      "Put a -1/-1 counter and a deathtouch counter on target creature.",
      "Put a flying counter and a +1/+1 counter on target creature.",
      "Put two +1/+1 counters and a reach counter on target creature.",
    ].map((t) => parseEffectProgram({ name: "x", type: "Instant", mana: "{1}", oracle: t }).confidence)).toEqual(["low", "low", "low", "low", "low"]);
  });
});

describe("Gift of the Viper, Unexpected Fangs", () => {
  it("⭐ on a tapped Bear: a +1/+1, a reach and a deathtouch counter — a 3/3 with reach and deathtouch — and it untaps", () => {
    const s0 = board({ bf: [...lands("f", FOREST, 1), perm("bear", BEARS, "user", { tapped: true }), perm("aib", BEARS, "ai")], hand: [cardOf(GIFT_OF_THE_VIPER, "c-gv")] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-gv" && aimedAt("bear")(a));
    expect(cast, "Gift of the Viper aimed at the Bear is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, cast));
    const b = findPermanent(s, "bear").permanent;
    expect({ counters: counters(s, "bear"), pt: [creaturePower(b, s), creatureToughness(b, s)], kws: kw(s, "bear", ["Reach", "Deathtouch"]), tapped: b.tapped, other: counters(s, "aib") })
      .toEqual({ counters: { "+1/+1": 1, reach: 1, deathtouch: 1 }, pt: [3, 3], kws: [true, true], tapped: false, other: {} });
  });
  it("⭐ one event: Stocking the Pantry takes ONE supply counter for it", () => {
    const s0 = board({ bf: [...lands("f", FOREST, 1), perm("bear", BEARS), perm("pantry", STOCKING_THE_PANTRY)], hand: [cardOf(GIFT_OF_THE_VIPER, "c-gv")] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-gv" && aimedAt("bear")(a));
    expect(cast, "Gift of the Viper aimed at the Bear is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, cast));
    expect(counters(s, "pantry")).toEqual({ supply: 1 });
  });
  it("Unexpected Fangs: a +1/+1 and a lifelink counter", () => {
    const s0 = board({ bf: [...lands("s", SWAMP, 2), perm("bear", BEARS)], hand: [cardOf(UNEXPECTED_FANGS, "c-uf")] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-uf" && aimedAt("bear")(a));
    expect(cast, "Unexpected Fangs aimed at the Bear is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, cast));
    expect({ counters: counters(s, "bear"), lifelink: kw(s, "bear", ["Lifelink"]) }).toEqual({ counters: { "+1/+1": 1, lifelink: 1 }, lifelink: [true] });
  });
});

describe("Qarsi Revenant, Champion of Dusan — renew from the graveyard", () => {
  const renew = (s, cardId) => filterActions(legalActionsForPlayer(s, "user"), "activate-gy-exile").filter((a) => a.cardId === cardId);
  it("⭐ Qarsi Revenant's renew: exiled from the graveyard, a flying, a deathtouch and a lifelink counter on the Bear", () => {
    const s0 = board({ bf: [...lands("s", SWAMP, 3), perm("bear", BEARS)], graveyard: [cardOf(QARSI_REVENANT, "c-qr")] });
    const act = renew(s0, "c-qr").find(aimedAt("bear"));
    expect(act, "renew aimed at the Bear is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ counters: counters(s, "bear"), kws: kw(s, "bear", ["Flying", "Deathtouch", "Lifelink"]), exiled: s.players.user.exile.map((c) => c.id), graveyard: s.players.user.graveyard.length })
      .toEqual({ counters: { flying: 1, deathtouch: 1, lifelink: 1 }, kws: [true, true, true], exiled: ["c-qr"], graveyard: 0 });
  });
  it("renew is a sorcery-speed ability: not offered on the opponent's turn", () => {
    const s0 = board({ bf: [...lands("s", SWAMP, 3), perm("bear", BEARS)], graveyard: [cardOf(QARSI_REVENANT, "c-qr")] });
    expect(renew({ ...s0, activePlayer: "ai" }, "c-qr")).toEqual([]);
  });
  it("Champion of Dusan's renew: a +1/+1 and a trample counter", () => {
    const s0 = board({ bf: [...lands("f", FOREST, 2), perm("bear", BEARS)], graveyard: [cardOf(CHAMPION_OF_DUSAN, "c-cd")] });
    const act = renew(s0, "c-cd").find(aimedAt("bear"));
    expect(act, "renew aimed at the Bear is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ counters: counters(s, "bear"), trample: kw(s, "bear", ["Trample"]) }).toEqual({ counters: { "+1/+1": 1, trample: 1 }, trample: [true] });
  });
});
