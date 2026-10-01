/**
 * GRAVEYARD → EXILE INSTEAD — the play-weighted program, P·27 (Rest in Peace #2288, Leyline of the Void #3454; the system Dauthi
 * Voidwalker #384 needs next).
 *   Rest in Peace:       "If a card or token would be put into a graveyard from anywhere, exile it instead."
 *   Leyline of the Void: "If a card would be put into an opponent's graveyard from anywhere, exile it instead."
 *
 * A replacement (CR 614.1a) every road into a graveyard has to honour, or the engine claims Rest in Peace while cards still slip
 * into graveyards: moveCardToZone (discard, non-creature destruction, the bulk of the moves), every death site through
 * diesExiledInstead (a creature exiled instead never died — CR 700.4, so no dies trigger and no death tally), a planeswalker's
 * death watchers, a resolved spell, a countered spell, mill, surveil. Scope: the card's OWNER's graveyard (CR 400.3), "your" and
 * "an opponent's" relative to the replacement's controller; a token only for "card or token" (CR 111.1).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, createStackObject, _resetIdsForTests, moveCardToZone, millCards, applyScrySurveil, applyImpulseDig, destroyLethalCreatures } from "./gameState.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";
import { counterSpellById } from "./effects/atoms/stack.js";
import { finishSpellResolution } from "./effects/runProgram.js";
import { checkDiesTriggers } from "./triggers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RIP = { name: "Rest in Peace", type: "Enchantment", mana: "{1}{W}", cmc: 2, keywords: [], oracle: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." };
const LEYLINE = { name: "Leyline of the Void", type: "Enchantment", mana: "{2}{B}{B}", cmc: 4, keywords: [], oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead." };
const BLOOD_ARTIST = { name: "Blood Artist", type: "Creature — Vampire", mana: "{1}{B}", cmc: 2, power: "0", toughness: "1", keywords: [], oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." };
const CELEBRANT = { name: "Cruel Celebrant", type: "Creature — Vampire", mana: "{W}{B}", cmc: 2, power: "1", toughness: "2", keywords: [], oracle: "Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, keywords: [], oracle: "{T}: Add {C}{C}." };
const WALKER = { name: "Test Walker", type: "Legendary Planeswalker — Test", mana: "{3}", cmc: 3, loyalty: "3", keywords: [], oracle: "" };
const SHOCK = { name: "Shock", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Shock deals 2 damage to any target." };

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
const hc = (id, card = SHOCK) => ({ id, ...card });
function board({ user = [], ai = [], userHand = [], aiHand = [], userLibrary = [], aiLibrary = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand: userHand, library: userLibrary }, ai: { ...s.players.ai, battlefield: ai, hand: aiHand, library: aiLibrary } } };
}
const names = (cards) => (cards || []).map((c) => c.name).sort();
const zones = (s, pid) => ({ gy: names(s.players[pid].graveyard), exile: names(s.players[pid].exile) });

describe("parse + classify", () => {
  it("the replacement is one marker with its scope; Rest in Peace and Leyline of the Void classify native", () => {
    expect(parseStaticAbilities(RIP).filter((d) => d.graveyardExile)).toEqual([{ graveyardExile: { scope: "any", tokens: true } }]);
    expect(parseStaticAbilities(LEYLINE).filter((d) => d.graveyardExile)).toEqual([{ graveyardExile: { scope: "opponents", tokens: false } }]);
    expect(classifyCard(RIP)).toBe("native-mixed");
    expect(classifyCard(LEYLINE)).toBe("native-static");
  });
});

describe("Rest in Peace — every road into a graveyard", () => {
  it("a destroyed creature is exiled and never died: Blood Artist doesn't trigger", () => {
    const s = applyDestroyEffect(board({ user: [P("rip", "user", RIP), P("artist", "user", BLOOD_ARTIST)], ai: [P("b1", "ai", BEARS)] }), { controller: "user", targets: [{ type: "creature", id: "b1" }] });
    expect({ ai: zones(s, "ai"), triggers: (s.pendingTriggers || []).length }).toEqual({ ai: { gy: [], exile: ["Grizzly Bears"] }, triggers: 0 });
  });

  it("lethal damage, a sacrifice, a destroyed artifact and a discard — all exiled, the graveyards stay empty", () => {
    const s0 = board({ user: [P("rip", "user", RIP), P("b1", "user", BEARS, { damageMarked: 2 }), P("b2", "user", BEARS), P("ring", "user", RING)], userHand: [hc("h1")] });
    const lethal = destroyLethalCreatures(s0);
    let s = checkDiesTriggers(lethal.state, lethal.dead);
    s = sacrificeCreatureEffect(s, "user", "b2");
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    s = moveCardToZone(s, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h1" });
    expect(zones(s, "user")).toEqual({ gy: [], exile: ["Grizzly Bears", "Grizzly Bears", "Shock", "Sol Ring"] });
  });

  it("a resolved spell, a countered spell, mill and surveil — all exiled; a milled card is still recorded as milled (CR 701.17c)", () => {
    const lib = [hc("l1", BEARS), hc("l2", RING), hc("l3"), hc("l4")];
    let s = board({ user: [P("rip", "user", RIP)], userLibrary: lib });
    s = finishSpellResolution(s, { playerId: "user", card: hc("spell") });
    const countered = createStackObject({ id: "stk1", kind: "spell", source: hc("csp"), controller: "ai", targets: [], payload: { resolver: "effect-program", params: { controller: "ai" } } });
    s = counterSpellById({ ...s, stack: [countered] }, "stk1");
    s = millCards(s, { playerId: "user", count: 2 });
    s = applyScrySurveil(s, { playerId: "user", n: 1, keepIdsOrdered: [], mode: "surveil" });
    expect({ user: zones(s, "user"), ai: zones(s, "ai"), milled: Object.keys(s.milledThisTurn || {}).sort() })
      .toEqual({ user: { gy: [], exile: ["Grizzly Bears", "Shock", "Shock", "Sol Ring"] }, ai: { gy: [], exile: ["Shock"] }, milled: ["l1", "l2"] });
  });

  it("a token creature is exiled too (card OR token) — no dies trigger", () => {
    const s = applyDestroyEffect(board({ user: [P("rip", "user", RIP), P("artist", "user", BLOOD_ARTIST)], ai: [P("t1", "ai", { ...BEARS, token: true })] }), { controller: "user", targets: [{ type: "creature", id: "t1" }] });
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("a destroyed planeswalker is exiled and never died: Cruel Celebrant doesn't trigger", () => {
    const s = applyDestroyEffect(board({ user: [P("rip", "user", RIP), P("celebrant", "user", CELEBRANT), P("pw", "user", WALKER, { counters: { loyalty: 3 } })] }), { controller: "ai", targets: [{ type: "planeswalker", id: "pw" }] });
    expect({ user: zones(s, "user"), triggers: (s.pendingTriggers || []).length }).toEqual({ user: { gy: [], exile: ["Test Walker"] }, triggers: 0 });
  });

  it("a spell that shuffles itself away was never going to a graveyard: it shuffles, not exiles", () => {
    const s = finishSpellResolution(board({ user: [P("rip", "user", RIP)] }), { playerId: "user", card: hc("gsz") }, { selfShuffle: true });
    expect({ ...zones(s, "user"), library: s.players.user.library.map((c) => c.id) }).toEqual({ gy: [], exile: [], library: ["gsz"] });
  });
});

describe("the other roads and scopes", () => {
  it("a graveyard-disposing dig's rest is exiled too", () => {
    const s = applyImpulseDig(board({ user: [P("rip", "user", RIP)], userLibrary: [hc("l1", BEARS), hc("l2", RING), hc("l3")] }), { playerId: "user", n: 3, chosenId: "l1", restTo: "graveyard" });
    expect({ ...zones(s, "user"), hand: names(s.players.user.hand) }).toEqual({ gy: [], exile: ["Shock", "Sol Ring"], hand: ["Grizzly Bears"] });
  });

  it("a token planeswalker under Rest in Peace never died either", () => {
    const s = applyDestroyEffect(board({ user: [P("rip", "user", RIP), P("celebrant", "user", CELEBRANT), P("tpw", "user", { ...WALKER, token: true }, { counters: { loyalty: 3 } })] }), { controller: "ai", targets: [{ type: "planeswalker", id: "tpw" }] });
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("\"your graveyard\" (Necrodominance's line, alone on a synthetic enchantment): your cards are exiled, an opponent's are not", () => {
    const yours = { name: "Synthetic Yours", type: "Enchantment", mana: "{2}", cmc: 2, keywords: [], oracle: "If a card or token would be put into your graveyard from anywhere, exile it instead." };
    let s = board({ user: [P("y", "user", yours)], userHand: [hc("h1")], aiHand: [hc("h2")] });
    s = moveCardToZone(s, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h1" });
    s = moveCardToZone(s, { playerId: "ai", fromZone: "hand", toZone: "graveyard", cardId: "h2" });
    expect({ user: zones(s, "user"), ai: zones(s, "ai") }).toEqual({ user: { gy: [], exile: ["Shock"] }, ai: { gy: ["Shock"], exile: [] } });
  });
});

describe("Leyline of the Void — opponents' graveyards only, cards only", () => {
  it("the opponent's creature is exiled; your own dies normally (Blood Artist triggers once)", () => {
    const s0 = board({ user: [P("ley", "user", LEYLINE), P("artist", "user", BLOOD_ARTIST), P("b1", "user", BEARS)], ai: [P("x1", "ai", BEARS)] });
    const s = applyDestroyEffect(s0, { controller: "user", targets: [{ type: "creature", id: "x1" }, { type: "creature", id: "b1" }] });
    expect({ user: zones(s, "user"), ai: zones(s, "ai"), triggers: (s.pendingTriggers || []).length })
      .toEqual({ user: { gy: ["Grizzly Bears"], exile: [] }, ai: { gy: [], exile: ["Grizzly Bears"] }, triggers: 1 });
  });

  it("whose graveyard is the OWNER's (CR 400.3): an artifact you stole goes to its owner's — an opponent's — so Leyline exiles it", () => {
    const s = applyDestroyEffect(board({ user: [P("ley", "user", LEYLINE), P("stolen", "user", RING, { owner: "ai" })] }), { controller: "ai", targets: [{ type: "permanent", id: "stolen" }] });
    expect({ user: zones(s, "user"), ai: zones(s, "ai") }).toEqual({ user: { gy: [], exile: [] }, ai: { gy: [], exile: ["Sol Ring"] } });
  });

  it("an opponent's TOKEN isn't a card: it dies (Blood Artist triggers)", () => {
    const s = applyDestroyEffect(board({ user: [P("ley", "user", LEYLINE), P("artist", "user", BLOOD_ARTIST)], ai: [P("t1", "ai", { ...BEARS, token: true })] }), { controller: "user", targets: [{ type: "creature", id: "t1" }] });
    expect((s.pendingTriggers || []).length).toBe(1);
  });
});
