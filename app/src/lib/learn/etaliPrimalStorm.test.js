/**
 * etaliPrimalStorm.test.js — Etali, Primal Storm (the play-weighted program, P·16, 2026-10-01: EDHREC rank #260; CR 608.2g,
 * 118.9, 400.3).
 *
 *   "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among
 *    those cards without paying their mana costs."
 *
 * effects/atoms/castFromAmong.js exiles the top card of each library and parks `pendingCastFromAmong`; the action layer offers
 * a free cast of each nonland candidate from its owner's exile plus "done", re-offering the rest after each cast. Another
 * player's card is cast from THEIR exile and goes home (CR 400.3): its permanent stays theirs to own, its spell goes to their
 * graveyard.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ETALI = { name: "Etali, Primal Storm", type: "Legendary Creature — Elder Dinosaur", mana: "{4}{R}{R}", cmc: 6, colors: ["R"], power: "6", toughness: "6", keywords: [],
  oracle: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs." };
const EFFECT = "exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs";
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Draw two cards." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const FILLER = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" });

/** A four-seat pod, Etali attacking ai1; each library's top card given (the user's backed by two more to draw). */
function attacking(tops = { user: ELVES, ai1: DIVINATION, ai2: FOREST, ai3: BEARS }) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const etali = createPermanent({ id: "etali", card: { ...ETALI, id: "c-etali" }, controller: "user", summoningSick: false });
  const lib = (pid) => (tops[pid] ? [{ ...tops[pid], id: `top-${pid}` }] : []).concat(pid === "user" ? [FILLER("u-2"), FILLER("u-3")] : []);
  const s = { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", stack: [],
    combat: { attackers: [{ permanentId: "etali", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
    players: Object.fromEntries(Object.entries(g.players).map(([pid, p]) => [pid, { ...p, library: lib(pid), ...(pid === "user" ? { battlefield: [etali] } : {}) }])) };
  let n = flushTriggers(checkAttackTriggers(s));
  for (let i = 0; i < 5 && n.stack?.length && !n.pendingCastFromAmong; i++) n = resolveTopOfStack(n);
  return n;
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");
const castOf = (s, cardId) => {
  const a = casts(s).filter((x) => x.cardId === cardId);
  if (a.length !== 1) throw new Error(`expected one cast of ${cardId}, found ${a.length}`);
  return dispatchAction(s, a[0]);
};
const done = (s) => dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-from-among-done"));
const drain = (s) => { let n = s; for (let i = 0; i < 10 && n.stack?.length; i++) n = resolveTopOfStack(n); return n; };

describe("the card", () => {
  it("one atom that exiles and parks the decision; Etali is native-trigger", () => {
    const p = parseEffectClause(EFFECT, "trigger");
    expect({ conf: p.confidence, atoms: p.atoms, tier: classifyCard(ETALI) })
      .toEqual({ conf: "high", atoms: [{ op: "exile-top-each-cast-any", targetType: null }], tier: "native-trigger" });
  });

  it("⛔ the decision-parking atom must be the program's last (an atom after it would run before the decision)", () => {
    const parked = { op: "exile-top-each-cast-any", targetType: null };
    const draw = parseEffectClause("Draw a card.", "Instant").atoms[0];
    if (!draw) throw new Error("no draw atom parsed");
    expect([programConfidence({ atoms: [parked] }), programConfidence({ atoms: [parked, draw] }), programConfidence({ atoms: [draw, parked] })])
      .toEqual(["high", "low", "high"]);
  });
});

describe("in play", () => {
  it("Etali attacks: each library's top card is exiled; the nonland ones are offered free, the land is not (WITNESS)", () => {
    const s = attacking();
    const offered = casts(s).map((a) => [a.cardId, a.fromPlayerId ?? null, !!a.freeCast]).sort();
    const exiled = Object.fromEntries(["user", "ai1", "ai2", "ai3"].map((p) => [p, s.players[p].exile.map((c) => c.name)]));
    const witness = { exiled, offered, done: legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-from-among-done") };
    console.log(`WITNESS etaliPrimalStorm ${JSON.stringify(witness)}`);
    expect(witness).toEqual({
      exiled: { user: ["Llanowar Elves"], ai1: ["Divination"], ai2: ["Forest"], ai3: ["Grizzly Bears"] },
      offered: [["top-ai1", "ai1", true], ["top-ai3", "ai3", true], ["top-user", null, true]],
      done: true,
    });
  });

  it("cast another player's cards: the Bears enter under your control but stay theirs; Divination draws you two and goes to its owner's graveyard", () => {
    const s = drain(done(castOf(castOf(attacking(), "top-ai3"), "top-ai1")));
    const bears = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect({ bears: bears && { controller: bears.controller, owner: bears.owner }, hand: s.players.user.hand.length, ai1Yard: s.players.ai1.graveyard.map((c) => c.name),
      stillExiled: [s.players.user.exile.map((c) => c.name), s.players.ai2.exile.map((c) => c.name)], open: !!s.pendingCastFromAmong })
      .toEqual({ bears: { controller: "user", owner: "ai3" }, hand: 2, ai1Yard: ["Divination"], stillExiled: [["Llanowar Elves"], ["Forest"]], open: false });
  });

  it("any number: after each cast the rest are offered again; casting the last closes the decision", () => {
    const one = castOf(attacking(), "top-user");
    const two = castOf(one, "top-ai1");
    const three = castOf(two, "top-ai3");
    expect([casts(one).map((a) => a.cardId).sort(), casts(two).map((a) => a.cardId), !!three.pendingCastFromAmong])
      .toEqual([["top-ai1", "top-ai3"], ["top-ai3"], false]);
  });

  it("⛔ after done, another player's leftover card can't be cast from their exile", () => {
    const s = attacking();
    const stale = casts(s).find((a) => a.cardId === "top-ai3");
    expect(() => dispatchAction(done(s), stale)).toThrow(/no permission to cast/);
  });

  it("⛔ the decision is the controller's alone — nobody else acts while it is open, even one handed priority", () => {
    const s = attacking();
    expect(["ai1", "ai2", "ai3"].map((p) => legalActionsForPlayer({ ...s, priorityHolder: p }, p).length)).toEqual([0, 0, 0]);
  });

  it("⛔ the open decision permits its own candidates only — not another card in that player's exile", () => {
    const s = attacking();
    const withOld = { ...s, players: { ...s.players, ai3: { ...s.players.ai3, exile: [...s.players.ai3.exile, { ...BEARS, id: "old-ai3" }] } } };
    const crafted = { ...casts(withOld).find((a) => a.cardId === "top-ai3"), cardId: "old-ai3" };
    expect(() => dispatchAction(withOld, crafted)).toThrow(/no permission to cast/);
  });

  it("only a land exiled: nothing to cast, no decision", () => {
    const s = attacking({ user: FOREST, ai1: FOREST, ai2: null, ai3: null });
    expect({ open: !!s.pendingCastFromAmong, exiled: [s.players.user.exile.map((c) => c.name), s.players.ai1.exile.map((c) => c.name)] })
      .toEqual({ open: false, exiled: [["Forest"], ["Forest"]] });
  });

  it("the AI casts what it likes, then takes done", () => {
    let s = attacking({ user: ELVES, ai1: null, ai2: null, ai3: BEARS });
    const picks = [];
    for (let i = 0; i < 5 && s.pendingCastFromAmong; i++) {
      const pick = pickAction(s, "user", legalActionsForPlayer(s, "user"));
      picks.push(pick.kind === "cast-spell" ? pick.cardId : pick.kind);
      s = dispatchAction(s, pick);
    }
    expect({ picks: picks.slice(0, 2).sort(), open: !!s.pendingCastFromAmong }).toEqual({ picks: ["top-ai3", "top-user"], open: false });
  });
});
