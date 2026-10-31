/**
 * shuffleInsteadFromLibrary.test.js — "If <this> would be put into a graveyard from anywhere, reveal <this> and shuffle it into its
 * owner's library instead" (CR 614.1a) on every move into a graveyard that does not start on the battlefield or in a hand.
 * Blightsteel Colossus · Progenitus · Nexus of Fate (bundled Scryfall texts below).
 *
 * Two bugs, one replacement:
 *   ⛔ A DUPLICATED CARD. moveCardToZone applied the replacement by recursing into a move to the library — from the LIBRARY that is
 *      a same-zone move, and its two writes to the one "library" key kept the card twice (Entomb's fetch, manifest dread's other
 *      card, a revealed top card routed to the graveyard). The library was left as [Forest, Blightsteel, Blightsteel].
 *   ⛔ THE REPLACEMENT SKIPPED. The direct graveyard writes — mill, surveil, a dig's rest, a resolving or countered spell — never
 *      asked it, so a milled Blightsteel Colossus sat in the graveyard (reanimation food) and a resolved Nexus of Fate went there
 *      too (its bundled ruling: the ability applies "including while it's resolving").
 * The card never reaches a graveyard: it is in its owner's library, which is shuffled (CR 701.24a); a card already in that library
 * stays (CR 400.3, 701.24c); a surveil's kept cards stay on top (CR 701.24g). Exactly one copy, always.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetIdsForTests, applyImpulseDig, applyRadiation, applyScrySurveil, createGameState, createPermanent, millCards, moveCardToZone,
} from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { autoPickTutorCandidate, finishSpellResolution, resolveTutorChoice } from "./effects/runProgram.js";
import { counterSpellById } from "./effects/atoms/stack.js";
import { flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// Bundled Scryfall oracle text (scryfall-bulk/oracle-index.json) — never from memory.
const BLIGHTSTEEL = { name: "Blightsteel Colossus", type: "Artifact Creature — Phyrexian Golem", mana: "{12}", cmc: 12, power: "11", toughness: "11", oracle: "Trample, infect, indestructible\nIf Blightsteel Colossus would be put into a graveyard from anywhere, reveal Blightsteel Colossus and shuffle it into its owner's library instead." };
const PROGENITUS = { name: "Progenitus", type: "Legendary Creature — Hydra Avatar", mana: "{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}", cmc: 10, power: "10", toughness: "10", oracle: "Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead." };
const NEXUS = { name: "Nexus of Fate", type: "Instant", mana: "{5}{U}{U}", cmc: 7, oracle: "Take an extra turn after this one.\nIf Nexus of Fate would be put into a graveyard from anywhere, reveal Nexus of Fate and shuffle it into its owner's library instead." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, oracle: "({T}: Add {G}.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", oracle: "" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, oracle: "Lightning Bolt deals 3 damage to any target." };
const GLOWING_ONE = { name: "Glowing One", type: "Creature — Zombie Mutant", mana: "{2}{G}", cmc: 3, power: "2", toughness: "2", oracle: "Deathtouch\nWhenever this creature deals combat damage to a player, they get four rad counters.\nWhenever a player mills a nonland card, you gain 1 life." };
const REST_IN_PEACE = { name: "Rest in Peace", type: "Enchantment", mana: "{1}{W}", cmc: 2, oracle: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." };
// Clauses of real cards: Altar of the Brood, Hauntwoods Shrieker, Neurok Familiar, Entomb.
const ALTAR_OF_THE_BROOD = "each opponent mills a card";
const MANIFEST_DREAD = "manifest dread";
const NEUROK_FAMILIAR = "reveal the top card of your library. if it's an artifact card, put it into your hand. otherwise, put it into your graveyard";
const ENTOMB = "search your library for a card, put that card into your graveyard, then shuffle";

const CARRIERS = [["Blightsteel Colossus", BLIGHTSTEEL], ["Progenitus", PROGENITUS], ["Nexus of Fate", NEXUS]];
const card = (base, id) => ({ ...base, id });
const atomOf = (clause) => parseEffectClause(clause, "Instant", { hasX: false }).atoms[0];

function board(library, extra = {}, pid = "user") {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, turn: 3, players: { ...s.players, [pid]: { ...s.players[pid], library, graveyard: [], hand: [], exile: [], ...extra } } };
}
const ids = (s, zone, pid = "user") => (s.players[pid][zone] || []).map((c) => c.id);
const copies = (s, id, pid = "user") => ["library", "graveyard", "hand", "exile"].reduce((n, z) => n + ids(s, z, pid).filter((x) => x === id).length, 0)
  + (s.players[pid].battlefield || []).filter((p) => p.card?.id === id).length;
const shuffleEvents = (s) => (s.log || []).filter((e) => e.kind === "shuffle-instead-of-graveyard").map((e) => e.cardName);

describe("⭐ mill — a milled carrier is shuffled into its owner's library instead", () => {
  for (const [name, base] of CARRIERS) {
    it(`${name}: the library keeps its count, the graveyard never sees it, exactly one copy, and the library is shuffled`, () => {
      const s0 = board([card(base, "x"), card(FOREST, "f1"), card(FOREST, "f2")]);
      const s = millCards(s0, { playerId: "user", count: 1 });
      expect({ lib: ids(s, "library").length, hasX: ids(s, "library").includes("x"), gy: ids(s, "graveyard"), copies: copies(s, "x"), events: shuffleEvents(s), shuffled: s.rngSeed !== s0.rngSeed })
        .toEqual({ lib: 3, hasX: true, gy: [], copies: 1, events: [name], shuffled: true });
    });
  }

  it("a mill of two: the ordinary card reaches the graveyard, the carrier goes back into the library", () => {
    const s = millCards(board([card(FOREST, "f1"), card(BLIGHTSTEEL, "bs"), card(FOREST, "f2")]), { playerId: "user", count: 2 });
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library").sort(), copies: copies(s, "bs") }).toEqual({ gy: ["f1"], lib: ["bs", "f2"], copies: 1 });
  });

  it("⭐ Altar of the Brood's mill (the mill atom): the opponent's Blightsteel stays in their library; no milled card is recorded for it (CR 701.17c)", () => {
    const s0 = board([card(BLIGHTSTEEL, "bs"), card(FOREST, "f1")], {}, "ai1");
    const s = resolveAtom(s0, atomOf(ALTAR_OF_THE_BROOD), { controller: "user", targets: [] });
    expect({ gy: ids(s, "graveyard", "ai1"), lib: ids(s, "library", "ai1").sort(), copies: copies(s, "bs", "ai1"), lastMilled: s._lastMilledIds ?? [], ledger: Object.keys(s.milledThisTurn || {}) })
      .toEqual({ gy: [], lib: ["bs", "f1"], copies: 1, lastMilled: [], ledger: [] });
  });

  it("the carrier's own replacement is asked before Rest in Peace's exile, as at moveCardToZone (CR 616.1)", () => {
    const rip = createPermanent({ id: "rip", card: card(REST_IN_PEACE, "c-rip"), controller: "user" });
    const s = millCards(board([card(BLIGHTSTEEL, "bs"), card(FOREST, "f1")], { battlefield: [rip] }), { playerId: "user", count: 2 });
    expect({ exile: ids(s, "exile"), lib: ids(s, "library"), gy: ids(s, "graveyard") }).toEqual({ exile: ["f1"], lib: ["bs"], gy: [] });
  });

  it("CONTROL — an ordinary card still mills into the graveyard", () => {
    const s = millCards(board([card(BEARS, "b1"), card(FOREST, "f1")]), { playerId: "user", count: 1 });
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library"), ledger: Object.keys(s.milledThisTurn || {}) }).toEqual({ gy: ["b1"], lib: ["f1"], ledger: ["b1"] });
  });

  it("radiation's mill (CR 728.1): Blightsteel goes back into the library and is not a nonland card \"milled this way\" (CR 701.17c)", () => {
    // Two rad counters: Bears and Blightsteel are milled; only the Bears reach the graveyard — 1 life, 1 counter.
    const s0 = board([card(BLIGHTSTEEL, "bs"), card(BEARS, "b1"), card(FOREST, "f1")], { radCounters: 2, life: 40 });
    const s = applyRadiation(s0, { playerId: "user" });
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library").slice().sort(), copies: copies(s, "bs"), life: s.players.user.life, rad: s.players.user.radCounters })
      .toEqual({ gy: ["b1"], lib: ["bs", "f1"], copies: 1, life: 39, rad: 1 });
  });

  it("radiation at the precombat main phase: Glowing One's milled trigger fires for the Bears only, not for the Blightsteel shuffled back", () => {
    // Radiation: 1 nonland card milled (the Bears) → −1 life, −1 rad counter; Glowing One: +1 life for that one card.
    const glowing = createPermanent({ id: "p-glow", card: card(GLOWING_ONE, "c-glow"), controller: "user" });
    const s0 = { ...board([card(BLIGHTSTEEL, "bs"), card(BEARS, "b1"), card(FOREST, "f1")], { radCounters: 2, life: 40, battlefield: [glowing] }),
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
    let s = flushTriggers(runStepActions(s0));
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library").slice().sort(), life: s.players.user.life, rad: s.players.user.radCounters })
      .toEqual({ gy: ["b1"], lib: ["bs", "f1"], life: 40, rad: 1 });
  });
});

describe("⭐ surveil and a dig's rest — the binned carrier goes back into the library", () => {
  it("surveil: the kept card stays on top, Blightsteel is shuffled in beneath it (CR 701.24g), the graveyard stays empty", () => {
    const s0 = board([card(BLIGHTSTEEL, "bs"), card(FOREST, "f1"), card(FOREST, "f2"), card(FOREST, "f3")]);
    const s = applyScrySurveil(s0, { playerId: "user", n: 2, keepIdsOrdered: ["f1"], mode: "surveil" });
    expect({ top: ids(s, "library")[0], lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), copies: copies(s, "bs"), events: shuffleEvents(s) })
      .toEqual({ top: "f1", lib: ["bs", "f1", "f2", "f3"], gy: [], copies: 1, events: ["Blightsteel Colossus"] });
  });

  it("CONTROL — a surveil still bins an ordinary card", () => {
    const s = applyScrySurveil(board([card(BEARS, "b1"), card(FOREST, "f1")]), { playerId: "user", n: 1, keepIdsOrdered: [], mode: "surveil" });
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library") }).toEqual({ gy: ["b1"], lib: ["f1"] });
  });

  it("a dig whose rest goes to the graveyard: Progenitus is shuffled back, the pick reaches the hand", () => {
    const s0 = board([card(FOREST, "f1"), card(PROGENITUS, "pg"), card(FOREST, "f2")]);
    const s = applyImpulseDig(s0, { playerId: "user", n: 2, chosenId: "f1", restTo: "graveyard" });
    expect({ hand: ids(s, "hand"), gy: ids(s, "graveyard"), lib: ids(s, "library").sort(), copies: copies(s, "pg") }).toEqual({ hand: ["f1"], gy: [], lib: ["f2", "pg"], copies: 1 });
  });
});

describe("⛔ the duplicated card — every single-card library → graveyard move", () => {
  it("moveCardToZone library → graveyard: one copy, still in the library, which is shuffled", () => {
    const s = moveCardToZone(board([card(FOREST, "f1"), card(BLIGHTSTEEL, "bs")]), { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "bs" });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), copies: copies(s, "bs"), events: shuffleEvents(s) })
      .toEqual({ lib: ["bs", "f1"], gy: [], copies: 1, events: ["Blightsteel Colossus"] });
  });

  it("manifest dread (Hauntwoods Shrieker): the Bears are manifested, the other card — Blightsteel — stays in the library once", () => {
    const s0 = board([card(BEARS, "b1"), card(BLIGHTSTEEL, "bs"), card(FOREST, "f1")]);
    const s = resolveAtom(s0, atomOf(MANIFEST_DREAD), { controller: "user", targets: [] });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), bf: s.players.user.battlefield.length, copies: copies(s, "bs") })
      .toEqual({ lib: ["bs", "f1"], gy: [], bf: 1, copies: 1 });
  });

  it("Entomb fetching Blightsteel Colossus: it cannot reach the graveyard and is never doubled", () => {
    const paused = resolveAtom(board([card(FOREST, "f1"), card(BLIGHTSTEEL, "bs"), card(FOREST, "f2")]), atomOf(ENTOMB), { controller: "user", cardName: "Entomb", targets: [] });
    const s = resolveTutorChoice(paused, autoPickTutorCandidate(paused, paused.pendingChoice));
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), copies: copies(s, "bs") }).toEqual({ lib: ["bs", "f1", "f2"], gy: [], copies: 1 });
  });

  it("Neurok Familiar revealing Nexus of Fate (not an artifact → the graveyard route): it stays in the library once", () => {
    const s = resolveAtom(board([card(NEXUS, "nx"), card(FOREST, "f1")]), atomOf(NEUROK_FAMILIAR), { controller: "user", targets: [] });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), hand: ids(s, "hand"), copies: copies(s, "nx") }).toEqual({ lib: ["f1", "nx"], gy: [], hand: [], copies: 1 });
  });

  it("CONTROL — the same reveal of an ordinary card still puts it into the graveyard", () => {
    const s = resolveAtom(board([card(BEARS, "b1"), card(FOREST, "f1")]), atomOf(NEUROK_FAMILIAR), { controller: "user", targets: [] });
    expect({ lib: ids(s, "library"), gy: ids(s, "graveyard") }).toEqual({ lib: ["f1"], gy: ["b1"] });
  });

  it("⭐ THE ROOT CAUSE — a same-zone move (a library card put on the bottom of that library) keeps one copy", () => {
    const s = moveCardToZone(board([card(FOREST, "f1"), card(BEARS, "b1")]), { playerId: "user", fromZone: "library", toZone: "library", cardId: "f1" });
    expect(ids(s, "library")).toEqual(["b1", "f1"]);
  });

  it("⭐ a same-zone graveyard move keeps one copy and records no graveyard event (the card never left)", () => {
    const s0 = board([], { graveyard: [card(BEARS, "b1"), card(FOREST, "f1")] });
    const s = moveCardToZone(s0, { playerId: "user", fromZone: "graveyard", toZone: "graveyard", cardId: "b1" });
    expect({ gy: ids(s, "graveyard"), events: (s.pendingGraveyardEvents || []).length }).toEqual({ gy: ["f1", "b1"], events: 0 });
  });

  it("⭐ a same-zone battlefield move keeps one permanent", () => {
    const bears = createPermanent({ id: "p1", card: card(BEARS, "b1"), controller: "user" });
    const s = moveCardToZone(board([], { battlefield: [bears] }), { playerId: "user", fromZone: "battlefield", toZone: "battlefield", cardId: "p1" });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("⭐ a spell leaving the stack — Nexus of Fate", () => {
  it("resolving: it goes into its owner's library, not the graveyard (the bundled ruling: 'including while it's resolving')", () => {
    const s = finishSpellResolution(board([card(FOREST, "f1")]), { playerId: "user", card: card(NEXUS, "nx") });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), copies: copies(s, "nx"), events: shuffleEvents(s) })
      .toEqual({ lib: ["f1", "nx"], gy: [], copies: 1, events: ["Nexus of Fate"] });
  });

  it("countered: the same", () => {
    const obj = { id: "so-1", kind: "spell", controller: "user", source: card(NEXUS, "nx"), payload: { params: {} } };
    const s = counterSpellById({ ...board([card(FOREST, "f1")]), stack: [obj] }, "so-1");
    expect({ stack: s.stack.length, lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), copies: copies(s, "nx") }).toEqual({ stack: 0, lib: ["f1", "nx"], gy: [], copies: 1 });
  });

  it("CONTROL — an ordinary instant resolves into the graveyard, and a countered one too", () => {
    const resolved = finishSpellResolution(board([]), { playerId: "user", card: card(BOLT, "lb") });
    const obj = { id: "so-1", kind: "spell", controller: "user", source: card(BOLT, "lb2"), payload: { params: {} } };
    const countered = counterSpellById({ ...board([]), stack: [obj] }, "so-1");
    expect({ resolved: ids(resolved, "graveyard"), countered: ids(countered, "graveyard") }).toEqual({ resolved: ["lb"], countered: ["lb2"] });
  });
});

describe("CONTROL — the battlefield and hand paths, which already applied it", () => {
  it("Blightsteel Colossus put into a graveyard from the battlefield is still shuffled into the library", () => {
    const perm = createPermanent({ id: "p-bs", card: card(BLIGHTSTEEL, "bs"), controller: "user" });
    const s = moveCardToZone(board([card(FOREST, "f1")], { battlefield: [perm] }), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "p-bs" });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), bf: s.players.user.battlefield.length, copies: copies(s, "bs") }).toEqual({ lib: ["bs", "f1"], gy: [], bf: 0, copies: 1 });
  });

  it("a creature dying goes to the graveyard", () => {
    const perm = createPermanent({ id: "p-b", card: card(BEARS, "b1"), controller: "user" });
    const s = moveCardToZone(board([card(FOREST, "f1")], { battlefield: [perm] }), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "p-b" });
    expect({ gy: ids(s, "graveyard"), lib: ids(s, "library") }).toEqual({ gy: ["b1"], lib: ["f1"] });
  });

  it("a discarded Progenitus is shuffled into the library", () => {
    const s = moveCardToZone(board([card(FOREST, "f1")], { hand: [card(PROGENITUS, "pg")] }), { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "pg" });
    expect({ lib: ids(s, "library").slice().sort(), gy: ids(s, "graveyard"), hand: ids(s, "hand") }).toEqual({ lib: ["f1", "pg"], gy: [], hand: [] });
  });
});
