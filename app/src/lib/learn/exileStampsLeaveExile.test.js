/**
 * exileStampsLeaveExile.test.js — a card that leaves exile is a new object (CR 400.7): every permission or marker it carried
 * only for that stay in exile stays behind.
 *
 * THE BUG. The engine records exile-only state as stamps on the card: plot (`_plotted`, `_plottedTurn` — CR 702.170d),
 * suspend's time counters and readiness (`_suspendCounters`, `_suspendReady` — CR 702.62a), the hideaway link (`_hideawayOf`
 * — CR 702.75a), the impulse family, a void counter, the face-down exile and the adventure permission (CR 715.3d). Only some
 * exits stripped them: the cast from exile dropped the impulse, void-counter and adventure stamps; the zone chokepoint
 * (moveCardToZone) dropped the void counter and the face-down marker; a put onto the battlefield (zones.enterCardFromZone)
 * dropped nothing. So a plotted creature cast from exile carried `_plotted` onto the battlefield, and when Swords to
 * Plowshares exiled it later it was castable for free again; a suspended Lotus Bloom did the same with `_suspendReady`.
 *
 * THE FIX. One reader, gameState.withoutExileStamps, strips every exile-only stamp at every exit from exile: the cast, the
 * zone chokepoint, and the put onto the battlefield.
 *
 * Real oracle fixtures, generated from the bundled Scryfall data; the trailing comment on each is its tier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { applySuspendUpkeep } from "./fading.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ──────────────────────────────────────────────────────────────
const DJINN = {"name":"Djinn of Fool's Fall","type":"Creature — Djinn","mana":"{4}{U}","cmc":5,"power":"4","toughness":"3","keywords":["Flying","Plot"],"colors":["U"],"oracle":"Flying\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)"}; // native-body
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature. Its controller gains life equal to its power."}; // native-spell
const LOTUS_BLOOM = {"name":"Lotus Bloom","type":"Artifact","mana":"","cmc":0,"keywords":["Suspend"],"colors":[],"oracle":"Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color."}; // native-mana
const ANGUISHED_UNMAKING = {"name":"Anguished Unmaking","type":"Instant","mana":"{1}{W}{B}","cmc":3,"keywords":[],"colors":["B","W"],"oracle":"Exile target nonland permanent. You lose 3 life."}; // native-spell
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const STAMPS = ["_impulse", "_impulseTurn", "_impulseExtended", "_impulseOwner", "_impulseFor", "_impulseFree", "_voidCounter", "_faceDownExile", "_onAdventure", "_plotted", "_plottedTurn", "_suspendCounters", "_suspendReady", "_hideawayOf"];
const stampsOn = (card) => STAMPS.filter((k) => card && k in card);

/** The user's precombat main phase on `turn`, both seats with plenty of mana. */
function board({ hand = [], exile = [], battlefield = [], turn = 4 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, hand, exile, battlefield, manaPool: { ...s.players.user.manaPool, ...POOL }, library: [{ id: "lib-0", ...ISLAND }] } } };
}
const take = (s, pred, label) => {
  const a = legalActionsForPlayer(s, "user").find(pred);
  if (!a) throw new Error(`no legal action: ${label}`);
  return dispatchAction(s, a);
};
const refill = (s) => ({ ...s, priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, ...POOL } } } });
const castsFromExile = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId && a.fromZone === "exile");

describe("⭐ plot (CR 702.170d) — the plotted creature's stamp never survives the cast", () => {
  it("plotted, cast free on a later turn, then exiled by Swords to Plowshares: it is NOT castable from exile again", () => {
    let s = take(board({ hand: [{ id: "djinn", ...DJINN }, { id: "stp", ...SWORDS }] }), (a) => a.kind === "plot" && a.cardId === "djinn", "plot the Djinn");
    expect(s.players.user.exile.find((c) => c.id === "djinn")?._plotted).toBe(true);
    s = refill({ ...s, turn: 5 });                                                     // a later turn (CR 702.170d)
    s = resolveTopOfStack(take(s, (a) => a.kind === "cast-spell" && a.cardId === "djinn" && a.fromZone === "exile", "cast the plotted Djinn"));
    const djinn = s.players.user.battlefield.find((p) => p.card?.name === "Djinn of Fool's Fall");
    expect(djinn).toBeTruthy();
    expect(stampsOn(djinn.card)).toEqual([]);                                          // nothing from its stay in exile came along
    s = resolveTopOfStack(take(refill(s), (a) => a.kind === "cast-spell" && a.cardId === "stp" && (a.targets || []).some((t) => t.id === djinn.id), "Swords the Djinn"));
    expect(s.players.user.exile.some((c) => c.id === "djinn")).toBe(true);             // exiled again
    expect(castsFromExile(refill(s), "djinn")).toEqual([]);                            // never castable for free again
  });
});

describe("⭐ suspend (CR 702.62a) — the readiness stamp never survives the cast", () => {
  it("suspended, three upkeeps, cast free, then exiled by Anguished Unmaking: it is NOT castable from exile again", () => {
    let s = take(board({ hand: [{ id: "bloom", ...LOTUS_BLOOM }, { id: "au", ...ANGUISHED_UNMAKING }] }), (a) => a.kind === "suspend" && a.cardId === "bloom", "suspend Lotus Bloom");
    for (let i = 0; i < 3; i++) s = applySuspendUpkeep(s);
    expect(s.players.user.exile.find((c) => c.id === "bloom")?._suspendReady).toBe(true);
    s = resolveTopOfStack(take(refill(s), (a) => a.kind === "cast-spell" && a.cardId === "bloom" && a.fromZone === "exile", "cast the suspended Lotus Bloom"));
    const bloom = s.players.user.battlefield.find((p) => p.card?.name === "Lotus Bloom");
    expect(bloom).toBeTruthy();
    expect(stampsOn(bloom.card)).toEqual([]);
    s = resolveTopOfStack(take(refill(s), (a) => a.kind === "cast-spell" && a.cardId === "au" && (a.targets || []).some((t) => t.id === bloom.id), "Anguished Unmaking the Bloom"));
    expect(s.players.user.exile.some((c) => c.id === "bloom")).toBe(true);
    expect(castsFromExile(refill(s), "bloom")).toEqual([]);
  });
});

describe("the two other exits strip every stamp (state-level: the stamps are engine state placed directly; the card is real)", () => {
  const stamped = { id: "djinn", ...DJINN, _impulse: true, _impulseTurn: 4, _impulseExtended: true, _impulseOwner: "user", _impulseFor: "user", _impulseFree: true, _voidCounter: true, _faceDownExile: true, _onAdventure: true, _plotted: true, _plottedTurn: 3, _suspendCounters: 0, _suspendReady: true, _hideawayOf: "perm-x" };
  it("the zone chokepoint: exile → hand", () => {
    const s = moveCardToZone(board({ exile: [stamped] }), { playerId: "user", fromZone: "exile", toZone: "hand", cardId: "djinn" });
    expect(stampsOn(s.players.user.hand.find((c) => c.id === "djinn"))).toEqual([]);
  });
  it("a put onto the battlefield from exile (zones.enterCardFromZone)", () => {
    const { state, entered } = enterCardFromZone(board({ exile: [stamped] }), { playerId: "user", cardId: "djinn", fromZone: "exile" });
    expect(entered).not.toBe(false);
    const perm = state.players.user.battlefield.find((p) => p.card?.id === "djinn");
    expect(perm).toBeTruthy();
    expect(stampsOn(perm.card)).toEqual([]);
  });
  it("a card that stays in exile keeps its stamps (only an exit strips them)", () => {
    const s = board({ exile: [stamped], battlefield: [createPermanent({ id: "isl", card: { id: "c-isl", ...ISLAND }, controller: "user", summoningSick: false })] });
    expect(stampsOn(s.players.user.exile[0])).toEqual(STAMPS);
  });
});
