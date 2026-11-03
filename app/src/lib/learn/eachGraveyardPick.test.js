/**
 * BREACH THE MULTIVERSE (EDHREC #874) — "Each player mills ten cards. For each player, choose a creature or planeswalker card in that
 * player's graveyard. Put those cards onto the battlefield under your control. Then each creature you control becomes a Phyrexian in
 * addition to its other types."
 *
 * The mill, then one card per player whose graveyard holds a creature or planeswalker card (chosen, not targeted — CR 608.2c; a lone
 * candidate is no choice), every chosen card entering as one event under the caster's control (CR 603.6a), owners kept (CR 110.2);
 * then the creature type on each creature the caster controls (CR 611.2c — the creatures as it resolves), only while each is a
 * creature. Its rulings: "The creatures you control will be Phyrexians until they leave the battlefield. Any of them that stops being a
 * creature will also stop being a Phyrexian until it becomes a creature again, if applicable." / "The cards you choose can be ones that
 * were just milled or ones that were already in the graveyard."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveMilledPickChoice } from "./effects/runProgram.js";
import { permanentTypes, addContinuousEffect, expireContinuousEffects } from "./layers.js";
import { advanceUntilDecision } from "./learnSession.js";
import { decisionViewForWire } from "./decisionWire.js";

beforeEach(() => _resetIdsForTests());

const BREACH = {"name":"Breach the Multiverse","type":"Sorcery","mana":"{5}{B}{B}","cmc":7,"power":null,"toughness":null,"keywords":["Mill"],"colors":["B"],"oracle":"Each player mills ten cards. For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the battlefield under your control. Then each creature you control becomes a Phyrexian in addition to its other types."};
const RISE = {"name":"Rise of the Dark Realms","type":"Sorcery","mana":"{7}{B}{B}","cmc":9,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Put all creature cards from all graveyards onto the battlefield under your control."};
const DRAGON = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R"],"oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn."};
const GARRUK = {"name":"Garruk Wildspeaker","type":"Legendary Planeswalker — Garruk","mana":"{2}{G}{G}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"+1: Untap two target lands.\n−1: Create a 3/3 green Beast creature token.\n−4: Creatures you control get +3/+3 and gain trample until end of turn.","loyalty":"3"};
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};

const lands = (tag, n) => Array.from({ length: n }, (_, i) => ({ ...FOREST, id: `${tag}-f${i}` }));
/** `userTop` / `aiTop` are the top of each library (milled first), filled to twelve with Forests. */
function table({ seat = "user", userTop = [], aiTop = [], userBattlefield = [], humans = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (tag, top) => [...top, ...lands(tag, 12 - top.length)];
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 6, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: userBattlefield, hand: seat === "user" ? [{ ...BREACH, id: "breach" }] : [], library: lib("u", userTop), graveyard: [], manaPool: { W: 0, U: 0, B: 7, R: 0, G: 0, C: 0 } },
      ai: { ...g.players.ai, battlefield: [], hand: seat === "ai" ? [{ ...BREACH, id: "breach" }] : [], library: lib("a", aiTop), graveyard: [], manaPool: { W: 0, U: 0, B: 7, R: 0, G: 0, C: 0 } } } };
}
function cast(s, seat = "user") {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === "breach");
  expect(a, "Breach cast offered").toBeTruthy();
  return resolveTopOfStack(flushTriggers(dispatchAction(s, a)));
}
const bf = (s, pid) => (s.players[pid].battlefield || []).map((p) => p.card.name).sort();
const phyrexian = (s, id) => permanentTypes(s, id).subtypes.includes("Phyrexian");

describe("the reader", () => {
  it("⭐ Breach the Multiverse plays its whole text", () => {
    expect(classifyCard(BREACH)).toBe("native-spell");
  });
  it("CONTROL — Rise of the Dark Realms is native on both trees", () => {
    expect(classifyCard(RISE)).toBe("native-spell");
  });
});

describe("the game — the person chooses", () => {
  it("⭐ each player mills ten; a pick per graveyard with two or more candidates; the picks enter together under your control", () => {
    let s = cast(table({ userTop: [{ ...ELVES, id: "u-elves" }, { ...BEARS, id: "u-bears" }], aiTop: [{ ...DRAGON, id: "a-dragon" }, { ...GARRUK, id: "a-garruk" }, { ...BEARS, id: "a-bears" }] }));
    expect({ user: s.players.user.library.length, ai: s.players.ai.library.length }).toEqual({ user: 2, ai: 2 });
    expect({ kind: s.pendingChoice?.kind, to: s.pendingChoice?.toZone, cands: s.pendingChoice?.candidates.map((c) => c.id) }).toEqual({ kind: "milled-pick", to: "battlefieldYours", cands: ["u-bears", "u-elves"] });
    s = resolveMilledPickChoice(s, "u-elves");
    expect(bf(s, "user")).toEqual([]); // nothing has entered yet — every choice comes first
    expect({ owner: s.pendingChoice?.owner, cands: s.pendingChoice?.candidates.map((c) => c.id) }).toEqual({ owner: "ai", cands: ["a-dragon", "a-garruk", "a-bears"] });
    s = flushTriggers(resolveMilledPickChoice(s, "a-garruk"));
    expect({ pending: s.pendingChoice ?? null, user: bf(s, "user"), ai: bf(s, "ai") }).toEqual({ pending: null, user: ["Garruk Wildspeaker", "Llanowar Elves"], ai: [] });
    const garruk = s.players.user.battlefield.find((p) => p.card.name === "Garruk Wildspeaker");
    expect({ controller: garruk.controller, owner: garruk.owner ?? garruk.card.owner, loyalty: garruk.counters?.loyalty }).toEqual({ controller: "user", owner: "ai", loyalty: 3 });
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Breach the Multiverse");
  });
  it("⭐ then each creature you control is a Phyrexian — the newcomers and the ones already there; the planeswalker is not", () => {
    const old = createPermanent({ id: "oldBear", card: { ...BEARS, id: "c-old" }, controller: "user", summoningSick: false });
    const ring = createPermanent({ id: "ring", card: { ...SOL_RING, id: "c-ring" }, controller: "user", summoningSick: false });
    let s = cast(table({ userBattlefield: [old, ring], userTop: [{ ...ELVES, id: "u-elves" }], aiTop: [{ ...GARRUK, id: "a-garruk" }] }));
    expect(s.pendingChoice ?? null).toBeNull(); // one candidate in each graveyard: no choice to make
    const ids = Object.fromEntries(s.players.user.battlefield.map((p) => [p.card.name, p.id]));
    expect({ elves: phyrexian(s, ids["Llanowar Elves"]), old: phyrexian(s, "oldBear"), garruk: phyrexian(s, ids["Garruk Wildspeaker"]), ring: phyrexian(s, "ring") })
      .toEqual({ elves: true, old: true, garruk: false, ring: false });
    expect(permanentTypes(s, "oldBear").subtypes).toEqual(expect.arrayContaining(["Bear", "Phyrexian"]));
  });
  it("⭐ a creature only for the turn is a Phyrexian only while it is one (the ruling)", () => {
    const land = createPermanent({ id: "manland", card: { ...FOREST, id: "c-manland" }, controller: "user", summoningSick: false });
    let s = table({ userBattlefield: [land], userTop: [], aiTop: [] });
    // A 3/3 Elemental creature until end of turn (the animate atom's two effects — layer 4 and layer 7b), so it survives as one.
    const animated = { affects: { mode: "fixed", permanentIds: ["manland"] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, cardName: "test animation" } };
    s = addContinuousEffect(s, { layer: 4, op: { types: ["Creature"], subtypes: ["Elemental"] }, ...animated }).state;
    s = addContinuousEffect(s, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 3, toughness: 3 }, ...animated }).state;
    s = cast(s);
    expect(phyrexian(s, "manland")).toBe(true);
    const later = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect({ creature: permanentTypes(later, "manland").types.includes("Creature"), phyrexian: phyrexian(later, "manland") }).toEqual({ creature: false, phyrexian: false });
  });
  it("⭐ the pick reaches a person's panel (its destination on the wire); a graveyard with no creature or planeswalker gives nothing", () => {
    const s = table({ humans: ["user"], userTop: [{ ...ELVES, id: "u-elves" }, { ...BEARS, id: "u-bears" }], aiTop: [] });
    const first = advanceUntilDecision({ status: "active", state: s, difficulty: "beginner", decisionLog: [] });
    const castIt = first.decision.options.find((a) => a.kind === "cast-spell" && a.cardId === "breach");
    expect(castIt).toBeTruthy();
    const wire = decisionViewForWire(advanceUntilDecision({ ...first.session, state: cast(first.session.state) }).decision);
    expect({ kind: wire?.kind, to: wire?.toZone, cands: (wire?.candidates || []).map((c) => c.id) }).toEqual({ kind: "milled-pick", to: "battlefieldYours", cands: ["u-bears", "u-elves"] });
  });
});

describe("the game — the default AI chooses", () => {
  it("⭐ the AI takes the most mana value from each graveyard: Shivan Dragon from yours, its own Grizzly Bears", () => {
    const s0 = table({ seat: "ai", userTop: [{ ...DRAGON, id: "u-dragon" }, { ...ELVES, id: "u-elves" }], aiTop: [{ ...BEARS, id: "a-bears" }, { ...ELVES, id: "a-elves" }] });
    const paused = cast(s0, "ai");
    const { session } = advanceUntilDecision({ status: "active", state: paused, difficulty: "beginner", decisionLog: [] });
    const st = session.state;
    expect(st.players.ai.battlefield.map((p) => p.card.name)).toEqual(expect.arrayContaining(["Shivan Dragon", "Grizzly Bears"]));
    expect(st.players.ai.battlefield.filter((p) => p.card.name === "Llanowar Elves")).toHaveLength(0);
    const dragon = st.players.ai.battlefield.find((p) => p.card.name === "Shivan Dragon");
    expect({ controller: dragon.controller, phyrexian: phyrexian(st, dragon.id) }).toEqual({ controller: "ai", phyrexian: true });
  });
});

describe("the save round trip (v11) — a game paused mid-pick", () => {
  it("⭐ paused at the second graveyard's pick, the game survives save → JSON → migrate and finishes exactly as unsaved", async () => {
    const { migrate, isResumable, isSerializable, CURRENT_SCHEMA_VERSION } = await import("../server/learnSaveSchema.js");
    let s = cast(table({ userTop: [{ ...ELVES, id: "u-elves" }, { ...BEARS, id: "u-bears" }], aiTop: [{ ...DRAGON, id: "a-dragon" }, { ...GARRUK, id: "a-garruk" }] }));
    s = resolveMilledPickChoice(s, "u-elves"); // paused on the AI's graveyard, the first pick collected
    const session = { id: "g", status: "active", state: s, difficulty: "beginner", decisionLog: [] };
    expect(isSerializable(session).ok).toBe(true);
    const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "g", serializable: true, session };
    const back = migrate(JSON.parse(JSON.stringify(doc)));
    expect({ resumable: isResumable(back), pending: back.session.state.pendingChoice?.toZone, collected: (back.session.state.pendingChoice?.collected || []).map((p) => p.id) })
      .toEqual({ resumable: true, pending: "battlefieldYours", collected: ["u-elves"] });
    const done = (st) => { const t = flushTriggers(resolveMilledPickChoice(st, "a-dragon")); return { bf: bf(t, "user"), gy: t.players.user.graveyard.map((c) => c.name).sort(), phyrexian: t.players.user.battlefield.filter((p) => phyrexian(t, p.id)).map((p) => p.card.name).sort() }; };
    expect(done(back.session.state)).toEqual(done(s));
    expect(done(back.session.state).bf).toEqual(["Llanowar Elves", "Shivan Dragon"]);
  });
});
