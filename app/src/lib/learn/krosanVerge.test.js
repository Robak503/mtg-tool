/**
 * krosanVerge.test.js — KROSAN VERGE (the play-weighted program, EDHREC #997):
 *
 *   "This land enters tapped.
 *    {T}: Add {C}.
 *    {2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then
 *    shuffle."
 *
 * The search names two cards, each with its own quality: one search (effects/atoms/library.tutorClauseParser's two-filter arm — the
 * atom's `pickFilters`), whose picks are raised one after the other, each from the library as it is then with ITS filter — the first
 * a Forest card, the second a Plains card (a Forest Plains dual is either, once). A search for a card with a stated quality may find
 * nothing (CR 701.23b): declining the Forest, or having none, still leaves the Plains to find. Both enter tapped (one event), then
 * the library is shuffled once. The default AI never activates it (a fetch with a mana cost — fetchLand.js's crack line is the
 * zero-mana fetch only; found, not fixed); made to, its search takes its own picks per filter.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VERGE = {"name":"Krosan Verge","type":"Land","mana":"","oracle":"This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #997
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const SNOW_FOREST = {"name":"Snow-Covered Forest","type":"Basic Snow Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const SAVANNAH = {"name":"Savannah","type":"Land — Forest Plains","mana":"","oracle":"({T}: Add {G} or {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G","W"]}; // EDHREC #457
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `seat`'s precombat main: an untapped Krosan Verge, {2} floating, `library` (cards with ids). */
function table({ seat = "user", library = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: pid === seat ? [on(seat, "verge", VERGE)] : [], graveyard: [], hand: [],
      library: pid === seat ? library : [], manaPool: pid === seat ? { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const lib = (...cards) => cards.map(([id, c]) => ({ ...c, id }));
const crackOffer = (s, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "verge" && a.sacSelf);
function crack(s, seat = "user") {
  const a = crackOffer(s, seat);
  expect(a, "the Verge's search is not offered").toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}
const pick = (s) => ({ seat: s.pendingChoice?.controller, label: s.pendingChoice?.filterLabel, candidates: (s.pendingChoice?.candidates || []).map((c) => c.id) });
const bf = (s, seat = "user") => s.players[seat].battlefield.map((p) => ({ name: p.card.name, tapped: !!p.tapped }));

describe("the card", () => {
  it("⭐ native: every line plays", () => {
    expect(classifyCard(VERGE)).toBe("land");
  });
});

describe("the person's search", () => {
  it("⭐ the Forest first, from the Forest cards only; then the Plains, from the Plains cards only; both tapped; one shuffle, at the end", () => {
    const library = lib(["f1", FOREST], ["p1", PLAINS], ["m1", MOUNTAIN], ["sf", SNOW_FOREST], ["p2", PLAINS], ["m2", MOUNTAIN], ["m3", MOUNTAIN], ["m4", MOUNTAIN], ["m5", MOUNTAIN], ["m6", MOUNTAIN]);
    const s0 = { ...table({ library }), rngSeed: 12345 };
    const order = (st) => st.players.user.library.map((c) => c.id);
    let s = crack(s0);
    expect({ verge: s.players.user.graveyard.map((c) => c.name), mana: s.players.user.manaPool.C, first: pick(s) })
      .toEqual({ verge: ["Krosan Verge"], mana: 0, first: { seat: "user", label: "forest card", candidates: ["f1", "sf"] } });
    const atActivation = { seed: s.rngSeed, order: order(s) };
    s = resolveTutorChoice(s, "sf");
    expect(pick(s)).toEqual({ seat: "user", label: "plains card", candidates: ["p1", "p2"] });
    const afterForest = { seed: s.rngSeed, order: order(s) };
    s = resolveTutorChoice(s, "p2");
    const left = library.map((c) => c.id).filter((id) => id !== "sf" && id !== "p2");
    // the library is untouched through the activation and the Forest pick (no shuffle yet), and shuffled once, as the last pick settles
    expect({ atActivation, afterForest, seedMovedAtEnd: s.rngSeed !== 12345, orderAtEnd: order(s).join() === left.join() ? "unshuffled" : "shuffled", sameCards: [...order(s)].sort() })
      .toEqual({ atActivation: { seed: 12345, order: library.map((c) => c.id) }, afterForest: { seed: 12345, order: library.map((c) => c.id).filter((id) => id !== "sf") },
        seedMovedAtEnd: true, orderAtEnd: "shuffled", sameCards: [...left].sort() });
    expect({ pc: s.pendingChoice ?? null, bf: bf(s), searches: s.log.filter((e) => e.effect === "tutor").length })
      .toEqual({ pc: null, bf: [{ name: "Snow-Covered Forest", tapped: true }, { name: "Plains", tapped: true }], searches: 1 });
  });
  it("⭐ a Forest Plains dual is either card, once: Savannah as the Forest, then only a basic Plains can be the Plains", () => {
    let s = crack(table({ library: lib(["sv", SAVANNAH], ["p1", PLAINS]) }));
    expect(pick(s).candidates).toEqual(["sv"]);
    s = resolveTutorChoice(s, "sv");
    expect(pick(s).candidates).toEqual(["p1"]);
    s = resolveTutorChoice(s, "p1");
    expect(bf(s).map((x) => x.name)).toEqual(["Savannah", "Plains"]);
  });
  it("⭐ CR 701.23b — no Forest card in the library: the Forest pick finds nothing, the Plains is still found", () => {
    let s = crack(table({ library: lib(["m1", MOUNTAIN], ["p1", PLAINS]) }));
    expect(pick(s)).toEqual({ seat: "user", label: "forest card", candidates: [] });
    s = resolveTutorChoice(s, null);
    expect(pick(s)).toEqual({ seat: "user", label: "plains card", candidates: ["p1"] });
    s = resolveTutorChoice(s, "p1");
    expect({ pc: s.pendingChoice ?? null, bf: bf(s) }).toEqual({ pc: null, bf: [{ name: "Plains", tapped: true }] });
  });
  it("⭐ declining the Forest still leaves the Plains to find", () => {
    let s = crack(table({ library: lib(["f1", FOREST], ["p1", PLAINS]) }));
    s = resolveTutorChoice(s, null);
    expect(pick(s).candidates).toEqual(["p1"]);
    s = resolveTutorChoice(s, "p1");
    expect({ bf: bf(s).map((x) => x.name), lib: s.players.user.library.map((c) => c.id) }).toEqual({ bf: ["Plains"], lib: ["f1"] });
  });
  it("the cost: {2}, the tap and the sacrifice — no activation with only {1}", () => {
    const s0 = table({ library: lib(["f1", FOREST]) });
    const short = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { ...s0.players.user.manaPool, C: 1 } } } };
    expect({ withTwo: !!crackOffer(s0), withOne: !!crackOffer(short) }).toEqual({ withTwo: true, withOne: false });
  });
});

describe("the default AI", () => {
  it("never activates it (a fetch with a mana cost — found, not fixed)", () => {
    const s = table({ seat: "ai", library: lib(["f1", FOREST], ["p1", PLAINS]) });
    expect({ offered: !!crackOffer(s, "ai"), picked: pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.permanentId ?? null }).toEqual({ offered: true, picked: null });
  });
  it("⭐ made to activate it, its search takes a Forest card, then a Plains card", () => {
    let s = crack(table({ seat: "ai", library: lib(["f1", FOREST], ["p1", PLAINS], ["m1", MOUNTAIN]) }), "ai");
    const first = pick(s);
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    const second = pick(s);
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    expect({ first: first.candidates, second: second.candidates, bf: bf(s, "ai") })
      .toEqual({ first: ["f1"], second: ["p1"], bf: [{ name: "Forest", tapped: true }, { name: "Plains", tapped: true }] });
  });
});
