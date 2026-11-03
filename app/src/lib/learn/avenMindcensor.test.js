/**
 * avenMindcensor.test.js — AVEN MINDCENSOR (the play-weighted program, EDHREC #1244):
 *
 *   "Flash
 *    Flying
 *    If an opponent would search a library, that player searches the top four cards of that library instead."
 *
 * The last line was the one unread: a replacement on every library search an opponent of its controller makes (CR 614.1a, 701.23a) —
 * staticAbilityParser's `searchTopFour` layer-6 op (inert: the reader is layers.librarySearchLimit, consulted by every search site —
 * effects/atoms/library.applyTutor and the tempting offer's three searches). The cards the search may find are the top four of the
 * library as the search begins, the SAME four for every card the one search finds (its ruling: "Finding one card won't cause the fifth
 * card to become included in the search" — the pending choice's `searchTopIds`); a card below them can't be found "even if [it's]
 * identifiable"; the entire library is shuffled afterwards; searching the top four still counts as searching the library. Its own
 * controller's searches are untouched, and a Mindcensor that lost its abilities limits nothing (the ability view, CR 613.1f).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, advanceRngSeed, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTemptingOfferChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MINDCENSOR = {"name":"Aven Mindcensor","type":"Creature — Bird Wizard","mana":"{2}{W}","oracle":"Flash\nFlying\nIf an opponent would search a library, that player searches the top four cards of that library instead.","layout":"normal","cmc":3,"power":"2","toughness":"1","loyalty":null,"keywords":["Flying","Flash"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1244
const DEMONIC = {"name":"Demonic Tutor","type":"Sorcery","mana":"{1}{B}","oracle":"Search your library for a card, put that card into your hand, then shuffle.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #63
const WILDS = {"name":"Evolving Wilds","type":"Land","mana":"","oracle":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #19
const VEGETATION = {"name":"Explosive Vegetation","type":"Sorcery","mana":"{3}{G}","oracle":"Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1241
const VERGE = {"name":"Krosan Verge","type":"Land","mana":"","oracle":"This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #997
const FIELD = {"name":"Field of Ruin","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #905
const FROG = {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8993
const TEMPT = {"name":"Tempt with Discovery","type":"Sorcery","mana":"{3}{G}","oracle":"Tempting offer — Search your library for a land card and put it onto the battlefield. Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Tempting offer"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #876
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","oracle":"{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (prefix, ...cards) => cards.map((c, i) => ({ ...c, id: `${prefix}${i + 1}` }));
/** The user's library: Bears, Sol Ring, Bears, Bears on top (no land in the top four), then a Forest, a Plains and two Forests. */
const userLibrary = () => lib("u", BEARS, SOL_RING, BEARS, BEARS, FOREST, PLAINS, FOREST, FOREST);
/** The same cards with a Forest and a Plains among the top four. */
const landyLibrary = () => lib("u", BEARS, FOREST, PLAINS, BEARS, FOREST, PLAINS, SOL_RING, BEARS);
function table({ seat = "user", boards = {}, hands = {}, libraries = {}, pools = {}, pod = false } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [], library: libraries[pid] || lib(`${pid}-`, WASTES, WASTES, WASTES, WASTES, WASTES, WASTES), manaPool: { ...EMPTY, ...(pools[pid] || {}) } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players, rngSeed: 4242 };
}
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const castOf = (s, seat, cardId, pred = () => true) => offered(legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a)), `casting ${cardId}`);
const activateOf = (s, seat, permId) => offered(legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === permId && a.sacSelf), `the search of ${permId}`);
const candidates = (s) => (s.pendingChoice?.candidates || []).map((c) => c.id).sort();
const censor = (seat = "ai") => on(seat, `${seat}-censor`, MINDCENSOR);

describe("the card", () => {
  it("⭐ native: flash, flying, and the search replacement", () => {
    expect(isNativeTier(classifyCard(MINDCENSOR))).toBe(true);
  });
});

describe("the person searches under the AI's Mindcensor", () => {
  it("⭐ Demonic Tutor: the candidates are the top four cards only — never the Forest below them; the pick goes to hand and the whole library is shuffled", () => {
    const s0 = table({ boards: { ai: [censor()] }, hands: { user: [{ ...DEMONIC, id: "h-tutor" }] }, libraries: { user: userLibrary() }, pools: { user: { B: 1, C: 1 } } });
    const s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "user", "h-tutor")));
    expect({ kind: s.pendingChoice?.kind, seat: s.pendingChoice?.controller, cands: candidates(s) }).toEqual({ kind: "tutor-search", seat: "user", cands: ["u1", "u2", "u3", "u4"] });
    const done = resolveTutorChoice(s, "u2");
    expect({ hand: done.players.user.hand.map((c) => c.id), lib: done.players.user.library.length, shuffled: done.rngSeed !== 4242 }).toEqual({ hand: ["u2"], lib: 7, shuffled: true });
  });
  it("⭐ control: with no Mindcensor the same Demonic Tutor sees all eight cards", () => {
    const s0 = table({ hands: { user: [{ ...DEMONIC, id: "h-tutor" }] }, libraries: { user: userLibrary() }, pools: { user: { B: 1, C: 1 } } });
    const s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "user", "h-tutor")));
    expect(candidates(s)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  });
  it("⭐ the controller's own search is untouched: the user's Mindcensor, the user's Demonic Tutor sees all eight", () => {
    const s0 = table({ boards: { user: [censor("user")] }, hands: { user: [{ ...DEMONIC, id: "h-tutor" }] }, libraries: { user: userLibrary() }, pools: { user: { B: 1, C: 1 } } });
    const s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "user", "h-tutor")));
    expect(candidates(s)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  });
  it("⭐ Evolving Wilds with no basic land in the top four: nothing is found (CR 701.23b), the Wilds is sacrificed, the library shuffled", () => {
    const s0 = table({ boards: { user: [on("user", "wilds", WILDS)], ai: [censor()] }, libraries: { user: userLibrary() } });
    const s = resolveTopOfStack(dispatchAction(s0, activateOf(s0, "user", "wilds")));
    expect({ cands: candidates(s), may: s.pendingChoice?.mayFailToFind, wilds: s.players.user.graveyard.map((c) => c.name) }).toEqual({ cands: [], may: true, wilds: ["Evolving Wilds"] });
    const done = resolveTutorChoice(s, null);
    expect({ bf: done.players.user.battlefield.map((p) => p.card.name), lib: done.players.user.library.length, shuffled: done.rngSeed !== 4242 }).toEqual({ bf: [], lib: 8, shuffled: true });
  });
  it("⭐ one search, the same four (its ruling): Explosive Vegetation's two picks are both from the top four — after the Forest, the Plains, and never the fifth card", () => {
    const s0 = table({ boards: { ai: [censor()] }, hands: { user: [{ ...VEGETATION, id: "h-veg" }] }, libraries: { user: landyLibrary() }, pools: { user: { G: 1, C: 3 } } });
    let s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "user", "h-veg")));
    expect(candidates(s)).toEqual(["u2", "u3"]);
    s = resolveTutorChoice(s, "u2");
    expect(candidates(s)).toEqual(["u3"]);
    s = resolveTutorChoice(s, "u3");
    expect({ bf: s.players.user.battlefield.map((p) => `${p.card.name}${p.tapped ? " (tapped)" : ""}`).sort(), pending: s.pendingChoice ?? null }).toEqual({ bf: ["Forest (tapped)", "Plains (tapped)"], pending: null });
  });
  it("⭐ Krosan Verge's two qualities read the same four: the Forest pick, then the Plains pick — never the Plains below the top four", () => {
    const library = lib("u", BEARS, FOREST, BEARS, BEARS, PLAINS, FOREST, PLAINS, SOL_RING);
    const s0 = table({ boards: { user: [on("user", "verge", VERGE)], ai: [censor()] }, libraries: { user: library }, pools: { user: { C: 2 } } });
    let s = resolveTopOfStack(dispatchAction(s0, activateOf(s0, "user", "verge")));
    expect({ label: s.pendingChoice?.filterLabel, cands: candidates(s) }).toEqual({ label: "forest card", cands: ["u2"] });
    s = resolveTutorChoice(s, "u2");
    expect({ label: s.pendingChoice?.filterLabel, cands: candidates(s) }).toEqual({ label: "plains card", cands: [] });
  });
  it("⭐ the ability view (CR 613.1f): the AI's Mindcensor under Turn to Frog limits nothing", () => {
    const s0 = table({ boards: { ai: [censor()] }, hands: { user: [{ ...DEMONIC, id: "h-tutor" }] }, libraries: { user: userLibrary() }, pools: { user: { B: 1, C: 1 } } });
    const frogged = resolveAtom(s0, parseEffectClause(FROG.oracle, "Instant").atoms[0], { controller: "user", targets: [{ type: "creature", id: "ai-censor" }] });
    const s = resolveTopOfStack(dispatchAction(frogged, castOf(frogged, "user", "h-tutor")));
    expect(candidates(s)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  });
});

describe("each player's search, the tempting offer, the AI's search", () => {
  it("⭐ Field of Ruin under the AI's Mindcensor: the user searches the top four, the AI (its controller) its whole library", () => {
    const aiLib = lib("a", BEARS, BEARS, BEARS, BEARS, FOREST, BEARS);
    const s0 = table({ boards: { user: [on("user", "field", FIELD)], ai: [censor(), on("ai", "verge", VERGE)] }, libraries: { user: userLibrary(), ai: aiLib }, pools: { user: { C: 2 } } });
    const act = offered(legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "field" && a.targets?.[0]?.id === "verge"), "Field of Ruin at the Verge");
    let s = resolveTopOfStack(dispatchAction(s0, act));
    const first = { seat: s.pendingChoice?.controller, cands: candidates(s) };
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    const second = { seat: s.pendingChoice?.controller, cands: candidates(s) };
    const bySeat = Object.fromEntries([first, second].map((x) => [x.seat, x.cands]));
    expect(bySeat).toEqual({ user: [], ai: ["a5"] });
  });
  // TEMPT WITH DISCOVERY under the user's Mindcensor (pw27's review, F1 and F4). The offerer's library is shuffled once, after its last search
  // ("Then each player who searched a library this way shuffles" is written last, CR 608.2c), so each bonus search reads the library as the
  // earlier searches left it — each its own search with its own top four (its ruling: the effect "happens again").
  const temptLib = () => lib("a", BEARS, FOREST, BEARS, BEARS, FOREST, PLAINS, BEARS, BEARS, BEARS, BEARS, FOREST, BEARS); // a1 … a12
  const order = (s, seat) => s.players[seat].library.map((c) => c.id);
  it("⭐ Tempt with Discovery from the AI under the user's Mindcensor: the first search sees a1–a4 (a2), the library isn't shuffled before the bonus search, the user (its controller) searches all of theirs, and the bonus search sees a1, a3, a4, a5 — exactly a5", () => {
    const s0 = table({ seat: "ai", boards: { user: [censor("user")] }, hands: { ai: [{ ...TEMPT, id: "h-tempt" }] }, libraries: { user: userLibrary(), ai: temptLib() }, pools: { ai: { G: 1, C: 3 } } });
    let s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "ai", "h-tempt")));
    expect({ seat: s.pendingChoice?.controller, cands: candidates(s), top: s.pendingChoice?.searchTopIds }).toEqual({ seat: "ai", cands: ["a2"], top: ["a1", "a2", "a3", "a4"] });
    s = resolveTutorChoice(s, "a2");
    expect({ kind: s.pendingChoice?.kind, seat: s.pendingChoice?.controller, seed: s.rngSeed, order: order(s, "ai") })
      .toEqual({ kind: "tempting-offer", seat: "user", seed: 4242, order: ["a1", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"] });
    s = resolveTemptingOfferChoice(s, true);
    expect({ seat: s.pendingChoice?.controller, cands: candidates(s) }).toEqual({ seat: "user", cands: ["u5", "u6", "u7", "u8"] });
    s = resolveTutorChoice(s, "u6");
    expect({ seat: s.pendingChoice?.controller, cands: candidates(s), top: s.pendingChoice?.searchTopIds, order: order(s, "ai").slice(0, 5) })
      .toEqual({ seat: "ai", cands: ["a5"], top: ["a1", "a3", "a4", "a5"], order: ["a1", "a3", "a4", "a5", "a6"] });
    s = resolveTutorChoice(s, "a5");
    const ai = order(s, "ai");
    expect({ pending: s.pendingChoice ?? null, lands: s.players.ai.battlefield.map((p) => p.card.id).sort(), left: [...ai].sort().join(), shuffled: ai.join() !== ["a1", "a3", "a4", "a6", "a7", "a8", "a9", "a10", "a11", "a12"].join() })
      .toEqual({ pending: null, lands: ["a2", "a5"], left: ["a1", "a10", "a11", "a12", "a3", "a4", "a6", "a7", "a8", "a9"].join(), shuffled: true });
  });
  it("⭐ Tempt with Discovery, nobody accepts: the offerer's library is shuffled exactly once, after the offer ends (one step of the shuffle seed)", () => {
    const s0 = table({ seat: "ai", boards: { user: [censor("user")] }, hands: { ai: [{ ...TEMPT, id: "h-tempt" }] }, libraries: { user: userLibrary(), ai: temptLib() }, pools: { ai: { G: 1, C: 3 } } });
    let s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "ai", "h-tempt")));
    s = resolveTutorChoice(s, "a2");
    expect({ seed: s.rngSeed, order: order(s, "ai").slice(0, 4) }).toEqual({ seed: 4242, order: ["a1", "a3", "a4", "a5"] });
    s = resolveTemptingOfferChoice(s, false);
    const ai = order(s, "ai");
    expect({ pending: s.pendingChoice ?? null, seed: s.rngSeed, cards: [...ai].sort().join(), shuffled: ai.join() !== ["a1", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"].join() })
      .toEqual({ pending: null, seed: advanceRngSeed(4242), cards: ["a1", "a10", "a11", "a12", "a3", "a4", "a5", "a6", "a7", "a8", "a9"].join(), shuffled: true });
  });
  it("⭐ two opponents accept (a pod): each bonus search is its own, with its own top four — a5 from a1, a3, a4, a5, then a6 from a1, a3, a4, a6", () => {
    const lib6 = lib("a", BEARS, FOREST, BEARS, BEARS, FOREST, FOREST, BEARS, BEARS, BEARS, BEARS);
    const s0 = table({ pod: true, seat: "ai1", boards: { user: [censor("user")] }, hands: { ai1: [{ ...TEMPT, id: "h-tempt" }] }, libraries: { user: userLibrary(), ai1: lib6 }, pools: { ai1: { G: 1, C: 3 } } });
    let s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "ai1", "h-tempt")));
    expect(candidates(s)).toEqual(["a2"]);
    s = resolveTutorChoice(s, "a2");
    const accepters = new Set(["user", "ai2"]);
    for (let i = 0; i < 6 && s.pendingChoice && !(s.pendingChoice.kind === "tutor-search" && s.pendingChoice.controller === "ai1"); i++) {
      if (s.pendingChoice.kind === "tempting-offer") s = resolveTemptingOfferChoice(s, accepters.has(s.pendingChoice.controller));
      else s = resolveTutorChoice(s, s.pendingChoice.candidates[0]?.id ?? null);
    }
    expect({ seat: s.pendingChoice?.controller, remaining: s.pendingChoice?.remaining, cands: candidates(s), top: s.pendingChoice?.searchTopIds })
      .toEqual({ seat: "ai1", remaining: 2, cands: ["a5"], top: ["a1", "a3", "a4", "a5"] });
    s = resolveTutorChoice(s, "a5");
    expect({ seat: s.pendingChoice?.controller, cands: candidates(s), top: s.pendingChoice?.searchTopIds }).toEqual({ seat: "ai1", cands: ["a6"], top: ["a1", "a3", "a4", "a6"] });
    s = resolveTutorChoice(s, "a6");
    expect({ pending: s.pendingChoice ?? null, lands: s.players.ai1.battlefield.map((p) => p.card.id).sort() }).toEqual({ pending: null, lands: ["a2", "a5", "a6"] });
  });
  it("⭐ the default AI as the searcher under the user's Mindcensor: its Demonic Tutor's pick is one of its top four", () => {
    const aiLib = lib("a", BEARS, SOL_RING, BEARS, BEARS, FOREST, PLAINS, { ...MINDCENSOR }, FOREST);
    const s0 = table({ seat: "ai", boards: { user: [censor("user")] }, hands: { ai: [{ ...DEMONIC, id: "h-tutor" }] }, libraries: { ai: aiLib }, pools: { ai: { B: 1, C: 1 } } });
    const s = resolveTopOfStack(dispatchAction(s0, castOf(s0, "ai", "h-tutor")));
    expect(candidates(s)).toEqual(["a1", "a2", "a3", "a4"]);
    const pickId = autoPickTutorCandidate(s, s.pendingChoice);
    expect(["a1", "a2", "a3", "a4"]).toContain(pickId);
  });
});
