/**
 * fieldOfRuin.test.js — FIELD OF RUIN (the play-weighted program, EDHREC #905):
 *
 *   "{T}: Add {C}.
 *    {2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. Each player searches their library for a basic
 *    land card, puts it onto the battlefield, then shuffles."
 *
 * The destroy already read; "each player searches" had no reader. One search per player still in the game, in APNAP order (CR 101.4),
 * each through the one-player battlefield search (library.applyTutor's `eachPlayer` — library.startEachPlayerSearch): the searcher is
 * the choice's controller, so a person picks from their own library and the driver picks for anyone else, and as each search settles
 * the next one starts (runProgram.resolveTutorChoice). A search for a card with a stated quality may find nothing (CR 701.23b). The
 * bundled ruling: an illegal target by resolution — no one searches (the ability doesn't resolve, CR 608.2b); a legal target that isn't
 * destroyed (indestructible) — everyone still searches. Played through the real activation, stack and choice settles. Card text: the
 * bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIELD = {"name":"Field of Ruin","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #905
const POOL = {"name":"Breeding Pool","type":"Land — Forest Island","mana":"","oracle":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G","U"]}; // EDHREC #59
const CITADEL = {"name":"Darksteel Citadel","type":"Artifact Land","mana":"","oracle":"Indestructible\n{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #284
const TOWER = {"name":"Command Tower","type":"Land","mana":"","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #2
const BOOMERANG = {"name":"Boomerang","type":"Instant","mana":"{U}{U}","oracle":"Return target permanent to its owner's hand.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #9692
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]};

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const libOf = (pid, cards) => cards.map((c, i) => ({ ...c, id: `${pid}-lib${i}` }));
/** `seat`'s main phase: Field of Ruin and two Wastes-like mana on the pool, the opponents' lands as given, each library holding a basic. */
function table({ pod = false, seat = "user", oppLands = [], ownExtra = [], libs = {} } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const bf = pid === seat ? [on(pid, "field", FIELD), ...ownExtra] : oppLands.filter((p) => p.controller === pid);
    players[pid] = { ...players[pid], battlefield: bf, hand: [], library: libOf(pid, libs[pid] || [ISLAND, SWAMP, FOREST]) };
  }
  players[seat] = { ...players[seat], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const fieldActions = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "field" && (a.targets || []).length);
/** Field of Ruin's activation at `targetId` (asserted offered, so a board without it fails on an assertion). */
function fieldAt(s, targetId, seat = "user") {
  const a = fieldActions(s, seat).find((x) => x.targets[0].id === targetId);
  expect(a, `Field of Ruin at ${targetId} is not offered`).toBeTruthy();
  return a;
}
const basicsOn = (s, pid) => (s.players[pid].battlefield || []).filter((p) => /\bBasic\b/.test(p.card?.type || "")).map((p) => p.card.name).sort();
/** `who`'s search, asserted pending first (so a chain that stopped fails on the assertion), settled with the house pick. */
function autoSearch(s, who) {
  expect({ kind: s.pendingChoice?.kind, searcher: s.pendingChoice?.controller }, `no search pending for ${who}`).toEqual({ kind: "tutor-search", searcher: who });
  return resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
}

describe("the card", () => {
  it("⭐ a covered land: the destroy, then every player's search", () => {
    const ab = parseActivatedAbilities(FIELD).find((a) => a.manaPips === "{2}");
    expect({ tier: classifyCard(FIELD), modeled: ab?.modeled, atoms: ab?.program?.atoms }).toEqual({
      tier: "land", modeled: true,
      atoms: [
        { op: "destroy", targetType: "nonbasicLand", restrictions: [{ kind: "controller", who: "opponent" }] },
        { op: "tutor", eachPlayer: true, filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: false, targetType: null },
      ],
    });
  });
});

describe("the targets", () => {
  it("only a nonbasic land an opponent controls: the opponent's Breeding Pool and Command Tower, never their Forest, never your own Breeding Pool", () => {
    const s = table({ oppLands: [on("ai", "opool", POOL), on("ai", "otower", TOWER), on("ai", "oforest", FOREST)], ownExtra: [on("user", "mypool", POOL)] });
    expect(fieldActions(s).map((a) => a.targets[0].id).sort()).toEqual(["opool", "otower"]);
  });
});

describe("the resolution", () => {
  it("⭐ the Pool is destroyed; you search first (a person's own picker — your library only), then the opponent (its pick read by the default AI's land order); both shuffle", () => {
    const s0 = table({ oppLands: [on("ai", "opool", POOL)], libs: { ai: [ISLAND, SWAMP, FOREST] } });
    const act = fieldAt(s0, "opool");
    let s = resolveTopOfStack(dispatchAction(s0, act));
    expect({ pool: s.players.ai.battlefield.some((p) => p.id === "opool"), field: s.players.user.battlefield.some((p) => p.id === "field"),
      choice: s.pendingChoice?.kind, searcher: s.pendingChoice?.controller, candidates: (s.pendingChoice?.candidates || []).map((c) => c.id).sort() })
      .toEqual({ pool: false, field: false, choice: "tutor-search", searcher: "user", candidates: ["user-lib0", "user-lib1", "user-lib2"] });
    s = resolveTutorChoice(s, "user-lib1"); // you take a Swamp
    expect({ searcher: s.pendingChoice?.controller, candidates: (s.pendingChoice?.candidates || []).map((c) => c.id).sort() }).toEqual({ searcher: "ai", candidates: ["ai-lib0", "ai-lib1", "ai-lib2"] });
    const aiPick = autoPickTutorCandidate(s, s.pendingChoice);
    s = resolveTutorChoice(s, aiPick);
    expect({ user: basicsOn(s, "user"), ai: basicsOn(s, "ai"), userLib: s.players.user.library.length, aiLib: s.players.ai.library.length, pending: s.pendingChoice ?? null,
      untapped: [...s.players.user.battlefield, ...s.players.ai.battlefield].filter((p) => /\bBasic\b/.test(p.card?.type || "")).every((p) => !p.tapped) })
      .toEqual({ user: ["Swamp"], ai: ["Forest"], userLib: 2, aiLib: 2, pending: null, untapped: true }); // no colour need: the land order's name order
    expect(aiPick).toBe("ai-lib2");
  });
  it("⭐ a four-player pod: every player searches, in turn order from the active player — four basics enter, one each", () => {
    const s0 = table({ pod: true, oppLands: [on("ai2", "opool", POOL)] });
    let s = resolveTopOfStack(dispatchAction(s0, fieldAt(s0, "opool")));
    const order = [];
    for (let g = 0; s.pendingChoice?.kind === "tutor-search" && g < 8; g++) {
      order.push(s.pendingChoice.controller);
      s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    }
    expect({ order, basics: Object.fromEntries(["user", "ai1", "ai2", "ai3"].map((pid) => [pid, basicsOn(s, pid).length])) })
      .toEqual({ order: ["user", "ai1", "ai2", "ai3"], basics: { user: 1, ai1: 1, ai2: 1, ai3: 1 } });
  });
  it("a player with no basic land in their library finds nothing (CR 701.23b) and the next player still searches", () => {
    const s0 = table({ oppLands: [on("ai", "opool", POOL)], libs: { user: [TOWER, TOWER] } });
    let s = resolveTopOfStack(dispatchAction(s0, fieldAt(s0, "opool")));
    expect({ searcher: s.pendingChoice?.controller, candidates: s.pendingChoice?.candidates?.length }).toEqual({ searcher: "user", candidates: 0 });
    s = resolveTutorChoice(s, null);
    expect(s.pendingChoice?.controller).toBe("ai");
    s = autoSearch(s, "ai");
    expect({ user: basicsOn(s, "user").length, ai: basicsOn(s, "ai").length }).toEqual({ user: 0, ai: 1 });
  });
  it("⭐ the ruling: the target indestructible (Darksteel Citadel) — it stays, and each player still searches", () => {
    const s0 = table({ oppLands: [on("ai", "cit", CITADEL)] });
    let s = resolveTopOfStack(dispatchAction(s0, fieldAt(s0, "cit")));
    expect({ citadel: s.players.ai.battlefield.some((p) => p.id === "cit"), searcher: s.pendingChoice?.controller }).toEqual({ citadel: true, searcher: "user" });
    s = autoSearch(s, "user");
    s = autoSearch(s, "ai");
    expect({ user: basicsOn(s, "user").length, ai: basicsOn(s, "ai").length }).toEqual({ user: 1, ai: 1 });
  });
  it("⭐ the ruling: the target gone by resolution (its controller Boomerangs it in response) — the ability doesn't resolve, nobody searches", () => {
    const s0 = table({ oppLands: [on("ai", "opool", POOL)] });
    let s = dispatchAction(s0, fieldAt(s0, "opool"));
    s = { ...s, priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...BOOMERANG, id: "h-boom" }], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } } };
    const boom = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h-boom" && (a.targets || []).some((t) => t.id === "opool"));
    expect(boom, "Boomerang at the Pool is not offered").toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, boom)); // Boomerang resolves: the Pool goes to its owner's hand
    expect(s.players.ai.hand.some((c) => c.name === "Breeding Pool")).toBe(true);
    s = resolveTopOfStack(s); // Field of Ruin's ability: its one target is gone
    expect({ pending: s.pendingChoice ?? null, user: basicsOn(s, "user").length, ai: basicsOn(s, "ai").length, fizzled: (s.log || []).some((e) => e.kind === "spell-fizzle") })
      .toEqual({ pending: null, user: 0, ai: 0, fizzled: true });
  });
});

describe("the default AI", () => {
  it("⭐ an AI's own search takes the basic of the colour its hand needs (fetchLand's land order): blue pips in hand, no blue source → the Island", () => {
    const s0 = table({ seat: "ai", oppLands: [on("user", "upool", POOL)], libs: { ai: [SWAMP, ISLAND, FOREST] } });
    const withHand = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, hand: [{ name: "Counterspell", type: "Instant", mana: "{U}{U}", cmc: 2, oracle: "Counter target spell.", id: "h-cs", colors: ["U"] }] } } };
    let s = resolveTopOfStack(dispatchAction(withHand, fieldAt(withHand, "upool", "ai")));
    expect(s.pendingChoice?.controller).toBe("ai");
    const pick = autoPickTutorCandidate(s, s.pendingChoice);
    s = resolveTutorChoice(s, pick);
    expect(basicsOn(s, "ai")).toEqual(["Island"]);
  });
});
