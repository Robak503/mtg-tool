/**
 * graveyardEvents.test.js — the GY-EVENT subsystem + Syr Konrad, the Grim (SHELF S7).
 *
 * "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than
 * the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent."
 *   1. Every graveyard-array write site records {dir, card, gyOwner, zone} on state.pendingGraveyardEvents
 *      (gameState.recordGraveyardEvents documents the site inventory; tokens are filtered — not cards).
 *   2. The GY-TRAFFIC TRIPLE disjunction splits into three sentences: dies/eachOtherCreature +
 *      gyEnter (excludeFromBattlefield) + gyLeave (your graveyard) — disjoint by construction.
 *   3. checkGraveyardEventTriggers drains the queue at the flushTriggers funnel and fires matching
 *      watchers per card.
 * CREED FP = a double ping on one event (dies + gyEnter for the same death), a ping on a NON-creature
 * card, a ping on an opponent's gyLeave, or a ping for a token — all pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, millCards,
  moveCardToZone, applyScrySurveil, applyImpulseDig, recordGraveyardEvents,
} from "./gameState.js";
import { detectTriggers, checkDiesTriggers, checkGraveyardEventTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { finishSpellResolution } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const KONRAD_ORACLE =
  "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent.\n{1}{B}: Each player mills a card.";
const konradCard = (id = "sk-card") => ({
  id, name: "Syr Konrad, the Grim", type: "Legendary Creature — Human Knight",
  power: "5", toughness: "4", mana: "{3}{B}{B}", oracle: KONRAD_ORACLE,
});
const creatureCard = (id) => ({ id, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" });
const landCard = (id) => ({ id, name: id, type: "Basic Land — Swamp", oracle: "" });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withZone(state, pid, zone, items) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], [zone]: items } } };
}
function withKonrad(state, controller = "user") {
  const konrad = createPermanent({ id: "konrad", card: konradCard(), controller });
  return withZone(state, controller, "battlefield", [...state.players[controller].battlefield, konrad]);
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 40) s = resolveTopOfStack(s);
  return s;
}
const lifeOf = (s) => Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, p.life]));

describe("detection + routing + classify", () => {
  it("the triple disjunction splits into dies/eachOtherCreature + gyEnter + gyLeave, all natively routed", () => {
    const ds = detectTriggers(konradCard());
    expect(ds.map((d) => d.event).sort()).toEqual(["dies", "gyEnter", "gyLeave"]);
    expect(ds.find((d) => d.event === "dies")).toMatchObject({ scope: "eachOtherCreature" });
    expect(ds.find((d) => d.event === "gyEnter")).toMatchObject({ gyCardType: "Creature", gyOwnerScope: "any", excludeFromBattlefield: true });
    expect(ds.find((d) => d.event === "gyLeave")).toMatchObject({ gyCardType: "Creature", gyOwnerScope: "you" });
    for (const d of ds) expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("Syr Konrad classifies native (trigger union + the each-player mill activated ability)", () => {
    expect(classifyCard(konradCard())).toBe("native-mixed");
  });

  it("CREED guards: unexpressible variants stay undetected (batch shape, other-origin filters)", () => {
    const near = (oracle) => detectTriggers({ id: "x", name: "X", type: "Creature", oracle }).filter((d) => d.event === "gyEnter" || d.event === "gyLeave");
    // batch "one or more" must NEVER map to a per-card fire
    expect(near("Whenever one or more creature cards leave your graveyard, create a 1/1 black Bat creature token with flying.")).toHaveLength(0);
    // a from-zone filter the vocabulary can't express
    expect(near("Whenever a creature card is put into your graveyard from your library, you gain 1 life.")).toHaveLength(0);
    // an opponent's-graveyard LEAVE watcher
    expect(near("Whenever a creature card leaves an opponent's graveyard, you lose 1 life.")).toHaveLength(0);
  });
});

describe("event recording (the site inventory)", () => {
  it("millCards records an enter event per milled card, zone library", () => {
    let s = baseState();
    s = withZone(s, "ai1", "library", [creatureCard("c1"), landCard("l1"), creatureCard("c2")]);
    const after = millCards(s, { playerId: "ai1", count: 2 });
    expect((after.pendingGraveyardEvents || []).map((e) => ({ dir: e.dir, id: e.card.id, zone: e.zone }))).toEqual([
      { dir: "enter", id: "c1", zone: "library" }, { dir: "enter", id: "l1", zone: "library" },
    ]);
    expect(after.pendingGraveyardEvents.every((e) => e.gyOwner === "ai1")).toBe(true);
  });

  it("moveCardToZone records: hand→GY enter (discard), GY→hand leave, GY→battlefield leave (becomePermanent)", () => {
    let s = baseState();
    s = withZone(s, "user", "hand", [creatureCard("h1")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h1" });
    expect(s.pendingGraveyardEvents).toMatchObject([{ dir: "enter", gyOwner: "user", zone: "hand" }]);
    s = { ...s, pendingGraveyardEvents: [] };
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "hand", cardId: "h1" });
    expect(s.pendingGraveyardEvents).toMatchObject([{ dir: "leave", gyOwner: "user", zone: "hand" }]);
    s = { ...s, pendingGraveyardEvents: [] };
    s = moveCardToZone(s, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h1" });
    s = { ...s, pendingGraveyardEvents: [] };
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "battlefield", cardId: "h1", becomePermanent: true });
    expect(s.pendingGraveyardEvents).toMatchObject([{ dir: "leave", gyOwner: "user", zone: "battlefield" }]);
  });

  it("a death records enter from battlefield; a dying TOKEN records nothing (not a card)", () => {
    let s = baseState();
    const real = { ...createPermanent({ id: "r1", card: creatureCard("r1"), controller: "ai1" }), damageMarked: 99 };
    const token = { ...createPermanent({ id: "t1", card: { ...creatureCard("t1"), token: true }, controller: "ai1" }), damageMarked: 99 };
    s = withZone(s, "ai1", "battlefield", [real, token]);
    const { state: after } = destroyLethalCreatures(s);
    expect((after.pendingGraveyardEvents || []).map((e) => ({ id: e.card.id, zone: e.zone }))).toEqual([{ id: "r1", zone: "battlefield" }]);
    expect(after.players.ai1.graveyard.map((c) => c.id)).toEqual(["r1"]); // the token vanished
  });

  it("surveil and graveyard-disposing impulse digs record enter events; scry/bottom disposals do not", () => {
    let s = baseState();
    s = withZone(s, "user", "library", [creatureCard("c1"), creatureCard("c2"), creatureCard("c3")]);
    const surveiled = applyScrySurveil(s, { playerId: "user", n: 2, keepIdsOrdered: ["c1"], mode: "surveil" });
    expect(surveiled.pendingGraveyardEvents).toMatchObject([{ dir: "enter", zone: "library" }]);
    const scried = applyScrySurveil(s, { playerId: "user", n: 2, keepIdsOrdered: ["c1"], mode: "scry" });
    expect(scried.pendingGraveyardEvents ?? []).toHaveLength(0);
    const dug = applyImpulseDig(s, { playerId: "user", n: 3, chosenId: "c1", restTo: "graveyard" });
    expect((dug.pendingGraveyardEvents || []).map((e) => e.card.id)).toEqual(["c2", "c3"]);
    const dugBottom = applyImpulseDig(s, { playerId: "user", n: 3, chosenId: "c1", restTo: "bottom" });
    expect(dugBottom.pendingGraveyardEvents ?? []).toHaveLength(0);
  });

  it("a resolved spell's graveyard disposition records enter from stack; a token/copy does not", () => {
    const s = baseState();
    const spell = { id: "sp1", name: "Shock", type: "Instant", oracle: "" };
    const after = finishSpellResolution(s, { playerId: "user", card: spell });
    expect(after.pendingGraveyardEvents).toMatchObject([{ dir: "enter", gyOwner: "user", zone: "stack" }]);
    const copy = finishSpellResolution(s, { playerId: "user", card: { ...spell, isCopy: true } });
    expect(copy.pendingGraveyardEvents ?? []).toHaveLength(0);
  });

  it("recordGraveyardEvents filters tokens structurally", () => {
    const s = baseState();
    const after = recordGraveyardEvents(s, [{ dir: "enter", card: { ...creatureCard("t"), token: true }, gyOwner: "user", zone: "battlefield" }]);
    expect(after.pendingGraveyardEvents ?? []).toHaveLength(0);
  });
});

describe("engine (CREED core — one ping per event, right filters, no double-count)", () => {
  it("another creature dying pings each opponent EXACTLY once (dies fires; gyEnter's battlefield exclusion holds)", () => {
    let s = withKonrad(baseState());
    const victim = { ...createPermanent({ id: "v1", card: creatureCard("v1"), controller: "ai1" }), damageMarked: 99 };
    s = withZone(s, "ai1", "battlefield", [victim]);
    const before = lifeOf(s);
    const lethal = destroyLethalCreatures(s);
    let after = checkDiesTriggers(lethal.state, lethal.dead);
    after = resolveAll(after);
    const delta = Object.fromEntries(Object.entries(lifeOf(after)).map(([pid, l]) => [pid, l - before[pid]]));
    expect(delta).toEqual({ user: 0, ai1: -1, ai2: -1, ai3: -1 }); // exactly ONE ping — never dies+gyEnter both
  });

  it("a milled creature card pings; a milled land does not (gyCardType gate)", () => {
    let s = withKonrad(baseState());
    s = withZone(s, "ai1", "library", [creatureCard("c1"), landCard("l1")]);
    const before = lifeOf(s);
    let after = resolveAll(millCards(s, { playerId: "ai1", count: 2 }));
    const delta = Object.fromEntries(Object.entries(lifeOf(after)).map(([pid, l]) => [pid, l - before[pid]]));
    expect(delta).toEqual({ user: 0, ai1: -1, ai2: -1, ai3: -1 }); // one creature card milled → one ping
  });

  it("an opponent's discarded creature card pings (any graveyard, from hand)", () => {
    let s = withKonrad(baseState());
    s = withZone(s, "ai2", "hand", [creatureCard("h1")]);
    const before = lifeOf(s);
    let after = resolveAll(moveCardToZone(s, { playerId: "ai2", fromZone: "hand", toZone: "graveyard", cardId: "h1" }));
    const delta = Object.fromEntries(Object.entries(lifeOf(after)).map(([pid, l]) => [pid, l - before[pid]]));
    expect(delta).toEqual({ user: 0, ai1: -1, ai2: -1, ai3: -1 });
  });

  it("a creature card leaving YOUR graveyard pings; one leaving an OPPONENT's does not", () => {
    let s = withKonrad(baseState());
    s = withZone(s, "user", "graveyard", [creatureCard("g1")]);
    s = withZone(s, "ai1", "graveyard", [creatureCard("g2")]);
    const before = lifeOf(s);
    let after = resolveAll(moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "hand", cardId: "g1" }));
    let delta = Object.fromEntries(Object.entries(lifeOf(after)).map(([pid, l]) => [pid, l - before[pid]]));
    expect(delta).toEqual({ user: 0, ai1: -1, ai2: -1, ai3: -1 }); // your GY → ping
    after = resolveAll(moveCardToZone(after, { playerId: "ai1", fromZone: "graveyard", toZone: "hand", cardId: "g2" }));
    delta = Object.fromEntries(Object.entries(lifeOf(after)).map(([pid, l]) => [pid, l - before[pid]]));
    expect(delta).toEqual({ user: 0, ai1: -1, ai2: -1, ai3: -1 }); // unchanged — an opponent's gyLeave never fires
  });

  it("a NON-creature card entering a graveyard from the stack never pings Konrad", () => {
    let s = withKonrad(baseState());
    const before = lifeOf(s);
    let after = resolveAll(finishSpellResolution(s, { playerId: "ai1", card: { id: "sp", name: "Opt", type: "Instant", oracle: "" } }));
    expect(lifeOf(after)).toEqual(before);
  });

  it("the drain is idempotent and clears the queue", () => {
    let s = withKonrad(baseState());
    s = withZone(s, "ai1", "library", [creatureCard("c1")]);
    let after = millCards(s, { playerId: "ai1", count: 1 });
    after = checkGraveyardEventTriggers(after);
    expect(after.pendingGraveyardEvents).toBeUndefined();
    const again = checkGraveyardEventTriggers(after);
    expect((again.pendingTriggers || []).length).toBe((after.pendingTriggers || []).length);
  });
});
