/**
 * EXPRESSIVE ITERATION (EDHREC #878) — "Look at the top three cards of your library. Put one of them into your hand, put one of them
 * on the bottom of your library, and exile one of them. You may play the exiled card this turn."
 *
 * One impulse-dig over the looked-at set: the first pick goes to the hand, a second pick among the other two is exiled with the
 * this-turn play permission (CR 601.3 — the impulse stamp, ended at cleanup, CR 514.2), the last goes to the bottom. Its rulings:
 * "If you choose to play the exiled card this turn, you must still pay all costs and follow all timing restrictions … If it's a land,
 * you can't play it unless you have a land play available." / "If you don't play the exiled card, it remains exiled." / "If there are
 * fewer than three cards in your library, follow the instructions in the order given … if there are two cards in your library, you'll
 * put one of them into your hand and one of them on the bottom of your library. You won't have the option to exile either of them."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { advanceUntilDecision } from "./learnSession.js";
import { decisionViewForWire } from "./decisionWire.js";

beforeEach(() => _resetIdsForTests());

const ITERATION = {"name":"Expressive Iteration","type":"Sorcery","mana":"{U}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R","U"],"oracle":"Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn."};
const FACT_OR_FICTION = {"name":"Fact or Fiction","type":"Instant","mana":"{3}{U}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard."};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const DRAGON = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R"],"oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

/** The top of the library, in order: Mountain, Lightning Bolt, Shivan Dragon, then a Grizzly Bears. */
const LIB4 = [{ ...MOUNTAIN, id: "m" }, { ...BOLT, id: "b" }, { ...DRAGON, id: "d" }, { ...BEARS, id: "g" }];
function cast(seat = "user", library = LIB4, pool = { W: 0, U: 1, B: 0, R: 2, G: 0, C: 0 }) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const other = seat === "user" ? "ai" : "user";
  s = { ...s, turn: 6, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [],
    players: { ...s.players,
      [seat]: { ...s.players[seat], hand: [{ ...ITERATION, id: "ei" }], library, manaPool: pool, landsPlayedThisTurn: 0 },
      [other]: { ...s.players[other], hand: [], library: [{ ...BEARS, id: "o1" }, { ...BEARS, id: "o2" }] } } };
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === "ei");
  expect(a, "Expressive Iteration cast offered").toBeTruthy();
  s = flushTriggers(dispatchAction(s, a));
  return resolveTopOfStack(s);
}
const zone = (s, seat, z) => (s.players[seat][z] || []).map((c) => c.name);
const exiledOffers = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.fromZone === "exile").map((a) => ({ kind: a.kind, name: a.name }));

describe("the reader", () => {
  it("⭐ Expressive Iteration plays its whole text", () => {
    expect(classifyCard(ITERATION)).toBe("native-spell");
  });
  it("CONTROL — Fact or Fiction (another player separates the piles) stays parked", () => {
    expect(classifyCard(FACT_OR_FICTION)).not.toBe("native-spell");
  });
});

describe("the game — the human seat", () => {
  it("⭐ the first pick (any of the three) goes to your hand; then you exile one of the other two, and the last goes to the bottom", () => {
    let s = cast();
    expect({ kind: s.pendingChoice?.kind, then: s.pendingChoice?.thenExilePlay, cands: s.pendingChoice?.candidates.map((c) => c.id) }).toEqual({ kind: "impulse-dig", then: true, cands: ["m", "b", "d"] });
    s = resolveImpulseDigChoice(s, "d"); // Shivan Dragon to hand
    expect({ kind: s.pendingChoice?.kind, to: s.pendingChoice?.chosenTo, cands: s.pendingChoice?.candidates.map((c) => c.id) }).toEqual({ kind: "impulse-dig", to: "impulseExile", cands: ["m", "b"] });
    expect(zone(s, "user", "hand")).toEqual(["Shivan Dragon"]);
    s = resolveImpulseDigChoice(s, "m"); // the Mountain exiled
    expect({ pending: s.pendingChoice ?? null, hand: zone(s, "user", "hand"), exile: zone(s, "user", "exile"), library: zone(s, "user", "library"), graveyard: zone(s, "user", "graveyard") })
      .toEqual({ pending: null, hand: ["Shivan Dragon"], exile: ["Mountain"], library: ["Grizzly Bears", "Lightning Bolt"], graveyard: ["Expressive Iteration"] });
  });
  it("⭐ the exiled card may be played this turn: a land as the land play", () => {
    let s = resolveImpulseDigChoice(resolveImpulseDigChoice(cast(), "d"), "m");
    s = { ...s, priorityHolder: "user", stack: [] };
    expect(exiledOffers(s)).toEqual([{ kind: "play-land", name: "Mountain" }]);
    const played = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.fromZone === "exile"));
    expect(played.players.user.battlefield.map((p) => p.card.name)).toEqual(["Mountain"]);
  });
  it("⭐ …and a spell at its full cost (the permission waives no cost)", () => {
    let s = resolveImpulseDigChoice(resolveImpulseDigChoice(cast(), "m"), "b"); // the Bolt exiled
    s = { ...s, priorityHolder: "user", stack: [], players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    expect(exiledOffers(s)).toEqual([]); // nothing to pay {R} with
    const paid = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    expect([...new Set(exiledOffers(paid).map((o) => o.name))]).toEqual(["Lightning Bolt"]);
    expect(legalActionsForPlayer(paid, "user").filter((a) => a.fromZone === "exile").every((a) => !a.freeCast)).toBe(true);
  });
  it("⭐ an answer that names no card still follows the instructions (each is mandatory): the first card each time", () => {
    const s = resolveImpulseDigChoice(resolveImpulseDigChoice(cast(), null), null);
    expect({ hand: zone(s, "user", "hand"), exile: zone(s, "user", "exile"), bottom: zone(s, "user", "library").slice(-1) }).toEqual({ hand: ["Mountain"], exile: ["Lightning Bolt"], bottom: ["Shivan Dragon"] });
  });
  it("⭐ two cards in the library: one to your hand, one to the bottom — no exile (the ruling)", () => {
    let s = cast("user", [{ ...BOLT, id: "b" }, { ...DRAGON, id: "d" }]);
    expect(s.pendingChoice?.candidates.map((c) => c.id)).toEqual(["b", "d"]);
    s = resolveImpulseDigChoice(s, "b");
    expect({ pending: s.pendingChoice ?? null, hand: zone(s, "user", "hand"), exile: zone(s, "user", "exile"), library: zone(s, "user", "library") }).toEqual({ pending: null, hand: ["Lightning Bolt"], exile: [], library: ["Shivan Dragon"] });
  });
  it("⭐ one card: it goes to your hand", () => {
    const s = resolveImpulseDigChoice(cast("user", [{ ...DRAGON, id: "d" }]), "d");
    expect({ hand: zone(s, "user", "hand"), library: zone(s, "user", "library"), graveyard: zone(s, "user", "graveyard") }).toEqual({ hand: ["Shivan Dragon"], library: [], graveyard: ["Expressive Iteration"] });
  });
  it("⭐ the permission ends with the turn; the card stays exiled", () => {
    const s = resolveImpulseDigChoice(resolveImpulseDigChoice(cast(), "d"), "b");
    const later = { ...s, turn: s.turn + 1, priorityHolder: "user", stack: [], players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 } } } };
    expect({ exile: zone(later, "user", "exile"), offers: exiledOffers(later) }).toEqual({ exile: ["Lightning Bolt"], offers: [] });
  });
  it("⭐ both picks reach a person's panel with their destination on the wire", () => {
    const session = { status: "active", state: cast(), difficulty: "beginner", decisionLog: [] };
    const first = advanceUntilDecision(session);
    const w1 = decisionViewForWire(first.decision);
    expect({ kind: w1?.kind, then: w1?.thenExilePlay, to: w1?.chosenTo, n: (w1?.candidates || []).length }).toEqual({ kind: "impulse-dig", then: true, to: "hand", n: 3 });
    const second = advanceUntilDecision({ ...first.session, state: resolveImpulseDigChoice(first.session.state, "d") });
    const w2 = decisionViewForWire(second.decision);
    expect({ kind: w2?.kind, then: w2?.thenExilePlay ?? false, to: w2?.chosenTo, cands: (w2?.candidates || []).map((c) => c.id) }).toEqual({ kind: "impulse-dig", then: false, to: "impulseExile", cands: ["m", "b"] });
  });
});

describe("the game — the default AI", () => {
  it("⭐ the AI keeps the most mana value in hand and exiles the land it can still play — then plays it", () => {
    const paused = cast("ai");
    const { session } = advanceUntilDecision({ status: "active", state: paused, difficulty: "beginner", decisionLog: [] });
    const s = session.state;
    const exiledLog = (s.log || []).filter((e) => e.effect === "impulse-exile" && e.controller === "ai").map((e) => e.exiled);
    expect(exiledLog).toEqual(["Mountain"]);
    expect(zone(s, "ai", "hand")).toContain("Shivan Dragon");
    expect(s.players.ai.battlefield.map((p) => p.card.name)).toContain("Mountain"); // played from exile as its land
    expect(zone(s, "ai", "exile")).toEqual([]);
  });
  it("with its land play spent, the AI exiles the cheaper spell", () => {
    let s = cast("ai");
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, landsPlayedThisTurn: 1 } } };
    const { session } = advanceUntilDecision({ status: "active", state: s, difficulty: "beginner", decisionLog: [] });
    const exiledLog = (session.state.log || []).filter((e) => e.effect === "impulse-exile" && e.controller === "ai").map((e) => e.exiled);
    expect(exiledLog).toEqual(["Lightning Bolt"]);
  });
});

describe("found on the way — a dig that keeps two keeps its continuation (Flow State)", () => {
  // The multi-keep re-raise dropped `resume`: after the second pick nothing resumed, so Flow State never reached its owner's graveyard
  // (CR 608.2n) — it left the game. The three-way look's re-raise and this one now carry it.
  const FLOW = {"name":"Flow State","type":"Sorcery","mana":"{1}{U}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. If there is an instant card and a sorcery card in your graveyard, instead put two of them into your hand and the rest on the bottom of your library in any order."};
  const SORCERY = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
  function castFlow(graveyard) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [{ ...FLOW, id: "flow" }], graveyard, library: LIB4.map((c) => ({ ...c })), manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } } };
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "flow");
    expect(a, "Flow State cast offered").toBeTruthy();
    return resolveTopOfStack(flushTriggers(dispatchAction(s, a)));
  }
  it("⭐ an instant and a sorcery in your graveyard: two picks to your hand, the third to the bottom, Flow State to your graveyard", () => {
    let s = castFlow([{ ...BOLT, id: "gy-bolt" }, { ...SORCERY, id: "gy-div" }]);
    expect(s.pendingChoice?.keep).toBe(2);
    s = resolveImpulseDigChoice(s, "d");
    s = resolveImpulseDigChoice(s, "b");
    expect({ pending: s.pendingChoice ?? null, hand: zone(s, "user", "hand").sort(), graveyard: zone(s, "user", "graveyard").sort(), bottom: zone(s, "user", "library").slice(-1) })
      .toEqual({ pending: null, hand: ["Lightning Bolt", "Shivan Dragon"], graveyard: ["Divination", "Flow State", "Lightning Bolt"], bottom: ["Mountain"] });
  });
  it("CONTROL — keep one (no sorcery in the graveyard): one pick to your hand, Flow State to your graveyard (both trees)", () => {
    let s = castFlow([{ ...BOLT, id: "gy-bolt" }]);
    s = resolveImpulseDigChoice(s, "d");
    expect({ hand: zone(s, "user", "hand"), graveyard: zone(s, "user", "graveyard").sort() }).toEqual({ hand: ["Shivan Dragon"], graveyard: ["Flow State", "Lightning Bolt"] });
  });
});

describe("the save round trip (v11) — paused at the exile pick", () => {
  it("⭐ the exile pick survives save → JSON → migrate, and its card is still playable this turn", async () => {
    const { migrate, isResumable, CURRENT_SCHEMA_VERSION } = await import("../server/learnSaveSchema.js");
    const s = resolveImpulseDigChoice(cast(), "d"); // stage two: the exile pick
    const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "g", serializable: true, session: { id: "g", status: "active", state: s, difficulty: "beginner", decisionLog: [] } };
    const back = migrate(JSON.parse(JSON.stringify(doc)));
    expect({ resumable: isResumable(back), to: back.session.state.pendingChoice?.chosenTo, resume: !!back.session.state.pendingChoice?.resume }).toEqual({ resumable: true, to: "impulseExile", resume: true });
    const t = { ...resolveImpulseDigChoice(back.session.state, "m"), priorityHolder: "user", stack: [] };
    expect({ graveyard: zone(t, "user", "graveyard"), offers: exiledOffers(t) }).toEqual({ graveyard: ["Expressive Iteration"], offers: [{ kind: "play-land", name: "Mountain" }] });
  });
});
