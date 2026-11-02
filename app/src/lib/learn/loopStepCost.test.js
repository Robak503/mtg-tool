/**
 * loopStepCost.test.js — the loop-step reads cost one offer and one cast preview per state, not one per action (loopStepLine.js, the
 * memos, 2026-11-02).
 *
 * THE CASE (seed 106558's turn 46 with loopStepLine.withLoopSteps threaded, engine 7705a376): a loop the hold did not catch ran to the
 * 20,001-tick ceiling in 1,317 s on Omnath's box — 59 s with the loop steps off. Profiled on the base (0b1e9bea), 72% of that turn
 * was isHeldLoopStep: per decision of the Kinnan seat the seam's untap read re-offered the whole board (legalActionsForPlayer as it
 * stands and with 20 more of each colour, once per untap source), and every offered cast of a card cast this turn — Green Sun's
 * Zenith at nine X values, in the offer and again in each re-offer — previewed its cast triggers anew (castTriggerRemovesOwn).
 *
 * WHAT IS PINNED (counted, never timed — pass-through spies on the two module exports): one tick's reads — the default AI's pick,
 * then the seam over every offered action, as the persona pilots read it — cost one preview of a card's cast triggers per state and
 * one offer beyond the engine's own (the richer one; the board as it stands is the list the engine already built for that state,
 * legalChoices.offerMadeFor), however many untap sources and X values are offered; the answers are unchanged; and a new state object
 * is read anew (the memos are per state object, never carried to another).
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./legalChoices.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, legalActionsForPlayer: vi.fn(real.legalActionsForPlayer) };
});
vi.mock("./gameEngine.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, castTriggerRemovesOwn: vi.fn(real.castTriggerRemovesOwn) };
});

const { createGameState, createPermanent, _resetIdsForTests } = await import("./gameState.js");
const { legalActionsForPlayer } = await import("./legalChoices.js");
const { castTriggerRemovesOwn } = await import("./gameEngine.js");
const { pickAction } = await import("./opponentAI.js");
const tokenLoopLine = await import("./tokenLoopLine.js");
const { withLoopSteps, isHeldLoopStep } = await import("./loopStepLine.js");

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const KINNAN = {"name":"Kinnan, Bonder Prodigy","type":"Legendary Creature — Human Druid","mana":"{G}{U}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G","U"],"oracle":"Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."};
const GRIM_MONOLITH = {"name":"Grim Monolith","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{4}: Untap this artifact."};
const BASALT_MONOLITH = {"name":"Basalt Monolith","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact."};
const GREEN_SUNS_ZENITH = {"name":"Green Sun's Zenith","type":"Sorcery","mana":"{X}{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle. Shuffle Green Sun's Zenith into its owner's library."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

// A four-seat pod on the user's main phase: Kinnan, `monoliths` tapped Basalt Monoliths (each untap nets +1: four with Kinnan, minus
// three), six Forests, and Green Sun's Zenith in hand, already cast this turn (so each offered cast of it is read as a possible recast).
const perm = (card, id, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: "user", summoningSick: false }), ...extra });
function board(monoliths) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const seat of ["user", "ai1", "ai2", "ai3"]) {
    players[seat] = { ...g.players[seat], battlefield: [], hand: [], life: 40,
      library: Array.from({ length: 20 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${seat}-lib${i}` })) };
  }
  players.user = { ...players.user,
    battlefield: [perm(KINNAN, "kinnan"), ...Array.from({ length: monoliths }, (_, i) => perm(BASALT_MONOLITH, `basalt-${i}`, { tapped: true })),
      ...Array.from({ length: 6 }, (_, i) => perm(FOREST, `forest-${i}`))],
    hand: [{ ...GREEN_SUNS_ZENITH, id: "zenith" }] };
  return { ...g, players, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 8, consecutivePasses: 0,
    stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] },
    log: [{ turn: 8, kind: "cast-spell", playerId: "user", cardName: "Green Sun's Zenith" }] };
}

/** One tick's AI reads: the default AI's pick, then the seam over every offered action. The calls each spy saw, by phase. */
function tickReads(state, offered) {
  const offers = () => legalActionsForPlayer.mock.calls.length;
  const previews = () => castTriggerRemovesOwn.mock.calls.length;
  const o0 = offers(), p0 = previews();
  pickAction(state, "user", offered);
  const o1 = offers(), p1 = previews();
  const seam = withLoopSteps(tokenLoopLine);
  const loop = seam.tokenLoopState(state, "user");
  const held = offered.filter((a) => seam.isTokenLoopAction(loop, a));
  return { pick: { offers: o1 - o0, previews: p1 - p0 }, seam: { offers: offers() - o1, previews: previews() - p1 },
    held: held.map((a) => a.permanentId ?? a.name).sort() };
}

describe("one tick's loop-step reads", () => {
  it("⭐ COST WITNESS: three tapped Basalt Monoliths and the recast Zenith at four X values — one cast preview and one offer beyond the engine's own, whatever the seam reads per action", () => {
    const state = board(3);
    const offered = legalActionsForPlayer(state, "user");
    expect(offered.filter((a) => a.kind === "cast-spell" && a.name === "Green Sun's Zenith").length).toBeGreaterThanOrEqual(4);
    const r = tickReads(state, offered);
    expect(r.pick).toEqual({ offers: 0, previews: 1 });
    expect(r.seam).toEqual({ offers: 1, previews: 0 });
    expect(r.held).toEqual(["basalt-0", "basalt-1", "basalt-2"]); // +1 mana each, and nothing new to spend it on: held
  });

  it("⭐ COST WITNESS: six tapped Monoliths read like three — the re-offer does not scale with the untap sources", () => {
    const state = board(6);
    const r = tickReads(state, legalActionsForPlayer(state, "user"));
    expect(r.seam).toEqual({ offers: 1, previews: 0 });
    expect(r.held).toHaveLength(6);
  });

  it("the reads are per state object: an equal board in a new object, which the engine never offered, is read anew (both offers), with the same answers", () => {
    const state = board(3);
    const offered = legalActionsForPlayer(state, "user");
    const first = tickReads(state, offered);
    const again = tickReads(state, offered);
    expect(again.pick).toEqual({ offers: 0, previews: 0 });
    expect(again.seam).toEqual({ offers: 0, previews: 0 });
    const copy = { ...state };
    const fresh = tickReads(copy, offered);
    expect(fresh.seam.offers).toBe(2);
    expect(fresh.pick.previews).toBe(1);
    expect(fresh.held).toEqual(first.held);
    for (const a of offered) expect(isHeldLoopStep(copy, "user", a)).toBe(isHeldLoopStep(state, "user", a));
  });
});

describe("the cheap side first changes no answer", () => {
  it("an untap the richer offer newly affords is itself a loop step, never a use: Basalt (tapped, three floating) stays held though Grim's {4} untap appears with twenty more", () => {
    const base = board(0);
    const state = { ...base, players: { ...base.players, user: { ...base.players.user, hand: [],
      battlefield: [perm(KINNAN, "kinnan"), perm(BASALT_MONOLITH, "basalt", { tapped: true }), perm(GRIM_MONOLITH, "grim", { tapped: true })],
      manaPool: { ...base.players.user.manaPool, C: 3 } } } };
    const offered = legalActionsForPlayer(state, "user");
    const untap = (pid) => (a) => a.kind === "activate-ability" && a.permanentId === pid;
    expect(offered.some(untap("basalt"))).toBe(true);
    expect(offered.some(untap("grim"))).toBe(false);
    const rich = { ...state, players: { ...state.players, user: { ...state.players.user, manaPool: { ...state.players.user.manaPool, C: 23 } } } };
    expect(legalActionsForPlayer(rich, "user").some(untap("grim"))).toBe(true);
    expect(isHeldLoopStep(state, "user", offered.find(untap("basalt")))).toBe(true);
  });
});
