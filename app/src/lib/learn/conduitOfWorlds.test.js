/**
 * conduitOfWorlds.test.js — CONDUIT OF WORLDS (the play-weighted program, EDHREC #563):
 *
 *   "You may play lands from your graveyard.
 *    {T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If
 *    you do, you can't cast additional spells this turn. Activate only as a sorcery."
 *
 * The first line already read (Crucible of Worlds' permission). The ability is one instruction (effects/atoms/freeCast.js — the
 * `graveyard-resolution-cast` atom): as it resolves, the target still in its controller's graveyard and that player having cast no
 * spell this turn (Conduit itself and a countered spell count — its bundled ruling; the per-turn cast ledger), the card is cast NOW
 * or not at all (the ruling — "You can't wait and cast that card later in the turn"): the free-cast window offers it as a PAID cast
 * from the graveyard at its own costs, timing set aside (CR 608.2g), with a decline; the cast stamps the turn's all-spells lock
 * ("you can't cast additional spells this turn"); playing a land is no cast and stays open (its ruling on the first ability).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { actionLabel } from "./actionLabel.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CONDUIT = {"name":"Conduit of Worlds","type":"Artifact","mana":"{2}{G}{G}","oracle":"You may play lands from your graveyard.\n{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #563
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","oracle":"Shock deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2215
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","oracle":"Destroy target creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #861
const DRANNITH = {"name":"Drannith Magistrate","type":"Creature — Human Wizard","mana":"{1}{W}","oracle":"Your opponents can't cast spells from anywhere other than their hands.","layout":"normal","cmc":2,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #746
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const gyCard = (id, card) => ({ ...card, id });
const lib = (seat) => Array.from({ length: 5 }, (_, i) => ({ ...PLAINS, id: `L-${seat}-${i}` }));
/** `seat`'s precombat main: Conduit (unless `conduit: false`) and `mountains` Mountains untapped; `hand`, `graveyard`; `spellsCast` this turn. */
function table({ seat = "user", conduit = true, mountains = 5, forests = 0, hand = [], graveyard = [], oppBf = [], oppGy = [], spellsCast = 0, landsPlayed = 1, phase = "precombat-main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [...(conduit ? [on(seat, "conduit", CONDUIT)] : []), ...Array.from({ length: mountains }, (_, i) => on(seat, `m${i}`, MOUNTAIN)), ...Array.from({ length: forests }, (_, i) => on(seat, `f${i}`, FOREST))];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, hand, graveyard, library: lib(seat), landsPlayedThisTurn: landsPlayed, spellsCastThisTurn: spellsCast },
    [opp]: { ...g.players[opp], battlefield: oppBf, hand: [], graveyard: oppGy, library: lib(opp) } };
  return { ...g, turn: 5, phase, step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && !n.pendingFreeCast && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
const conduitActs = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "conduit");
const targetsOf = (s, seat = "user") => conduitActs(s, seat).flatMap((a) => (a.targets || []).map((t) => t.id)).sort();
/** Activate Conduit at `cardId` and resolve the ability (the window opens, or not). */
function activate(s, cardId, seat = "user") {
  const a = conduitActs(s, seat).find((x) => (x.targets || []).some((t) => t.id === cardId));
  expect(a, `no Conduit activation at ${cardId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
const windowCasts = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell");
const decline = (s, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "free-cast-decline");
const named = (s, seat, name) => s.players[seat].battlefield.find((p) => p.card?.name === name);
const names = (cards) => (cards || []).map((c) => c.name).sort();
/** Cast `cardId` from `seat`'s hand at `targetId`, paid from mana floated for its pips. */
function castFromHand(s, seat, cardId, targetId) {
  const card = s.players[seat].hand.find((c) => c.id === cardId);
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const p of (String(card.mana).match(/\{([^}]+)\}/g) || []).map((x) => x.slice(1, -1))) { if (/^\d+$/.test(p)) pool.C += Number(p); else pool[p] += 1; }
  s = { ...s, players: { ...s.players, [seat]: { ...s.players[seat], manaPool: pool } } };
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && (x.targets || []).some((t) => t.id === targetId));
  expect(a, `no cast of ${cardId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}

describe("the card", () => {
  it("⭐ native: the graveyard land permission and the one-instruction ability, sorcery-timed, tapping", () => {
    const act = parseActivatedAbilities(CONDUIT).find((a) => /Choose target/.test(a.raw));
    expect({ tier: classifyCard(CONDUIT), modeled: act?.modeled, sorceryOnly: act?.sorceryOnly, tap: act?.tapSelf, atoms: act?.program?.atoms }).toEqual({
      tier: "native-mixed", modeled: true, sorceryOnly: true, tap: true,
      atoms: [{ op: "graveyard-resolution-cast", targetType: "graveyardCard", cardFilter: { typeFilter: "permanent", nonland: true }, ifNoSpellCastThisTurn: true, lockAfterCast: true }],
    });
  });
  it("⭐ you may play lands from your graveyard (the land drop still unused)", () => {
    const s = table({ landsPlayed: 0, graveyard: [gyCard("g-forest", FOREST)] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "play-land" && a.cardId === "g-forest" && a.fromZone === "graveyard")).toBe(true);
  });
});

describe("the ability", () => {
  it("⭐ targets: each nonland permanent card in its controller's graveyard — not a land, not an instant, not an opponent's card", () => {
    const s = table({ graveyard: [gyCard("g-giant", GIANT), gyCard("g-stone", MIND_STONE), gyCard("g-forest", FOREST), gyCard("g-murder", MURDER)], oppGy: [gyCard("o-giant", GIANT)] });
    expect(targetsOf(s)).toEqual(["g-giant", "g-stone"]);
  });
  it("⛔ only as a sorcery: not on the opponent's turn, not in combat", () => {
    const base = table({ graveyard: [gyCard("g-giant", GIANT)] });
    expect({ opp: conduitActs({ ...base, activePlayer: "ai" }).length, combat: conduitActs({ ...base, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } }).length, main: conduitActs(base).length })
      .toEqual({ opp: 0, combat: 0, main: 1 });
  });
  it("⭐ no spell cast this turn: the Giant is offered as a PAID cast from the graveyard as it resolves, with a decline", () => {
    const s = activate(table({ graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    const casts = windowCasts(s);
    expect({ window: s.pendingFreeCast, casts: casts.map((a) => ({ card: a.cardId, from: a.fromZone, free: !!a.freeCast, resolutionCast: a.resolutionCast })), decline: decline(s), label: actionLabel(decline(s)) })
      .toEqual({ window: { controller: "user", candidateIds: ["g-giant"], fromZone: "graveyard", paid: true, lockAfterCast: true, sourceName: "Conduit of Worlds" },
        casts: [{ card: "g-giant", from: "graveyard", free: false, resolutionCast: true }], decline: { kind: "free-cast-decline", playerId: "user", paid: true }, label: "Don't cast it" });
  });
  it("⭐ cast: {3}{R} is paid, the Giant enters, and no other spell can be cast this turn — a land can still be played", () => {
    const s0 = activate(table({ mountains: 5, landsPlayed: 0, hand: [{ ...SHOCK, id: "h-shock" }, { ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    const s = settle(dispatchAction(s0, windowCasts(s0)[0]));
    const after = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    const acts = legalActionsForPlayer(after, "user");
    expect({ giant: !!named(s, "user", "Hill Giant"), tapped: s.players.user.battlefield.filter((p) => p.card?.name === "Mountain" && p.tapped).length, window: s.pendingFreeCast,
      shock: acts.some((a) => a.kind === "cast-spell"), land: acts.some((a) => a.kind === "play-land" && a.cardId === "h-forest") })
      .toEqual({ giant: true, tapped: 4, window: undefined, shock: false, land: true });
  });
  it("⭐ the lock lasts the turn only: next turn the Shock is castable again", () => {
    const s0 = activate(table({ hand: [{ ...SHOCK, id: "h-shock" }], graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    const s = settle(dispatchAction(s0, windowCasts(s0)[0]));
    const next = { ...s, turn: s.turn + 1, players: { ...s.players, user: { ...s.players.user, spellsCastThisTurn: 0, manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    expect(legalActionsForPlayer(next, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-shock")).toBe(true);
  });
  it("⭐ declined: nothing is cast, no lock (the Shock stays castable), and the Giant is not castable later this turn", () => {
    const s0 = activate(table({ hand: [{ ...SHOCK, id: "h-shock" }], graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    const s = dispatchAction(s0, decline(s0));
    const withR = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    const acts = legalActionsForPlayer(withR, "user");
    expect({ window: s.pendingFreeCast, gy: names(s.players.user.graveyard), shock: acts.some((a) => a.kind === "cast-spell" && a.cardId === "h-shock"), giantLater: acts.some((a) => a.kind === "cast-spell" && a.cardId === "g-giant") })
      .toEqual({ window: undefined, gy: ["Hill Giant"], shock: true, giantLater: false });
  });
  it("⛔ a spell already cast this turn (a Shock): the ability resolves with no window", () => {
    const s0 = castFromHand(table({ hand: [{ ...SHOCK, id: "h-shock" }], graveyard: [gyCard("g-giant", GIANT)] }), "user", "h-shock", "ai");
    const s = activate(s0, "g-giant");
    expect({ cast: s0.players.user.spellsCastThisTurn, window: s.pendingFreeCast, giantInGy: names(s.players.user.graveyard).includes("Hill Giant") }).toEqual({ cast: 1, window: undefined, giantInGy: true });
  });
  it("⛔ Conduit itself cast this turn counts (its ruling): cast from hand, then activated — no window", () => {
    const s0 = table({ conduit: false, mountains: 6, forests: 2, hand: [{ ...CONDUIT, id: "h-conduit" }], graveyard: [gyCard("g-giant", GIANT)] });
    const castC = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-conduit");
    let s = settle(dispatchAction(s0, castC));
    const conduit = named(s, "user", "Conduit of Worlds");
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === conduit?.id && (a.targets || []).some((t) => t.id === "g-giant"));
    expect(act, "Conduit's activation").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ cast: s.players.user.spellsCastThisTurn, window: s.pendingFreeCast }).toEqual({ cast: 1, window: undefined });
  });
  it("⛔ the target left the graveyard before it resolves: nothing", () => {
    const s0 = table({ graveyard: [gyCard("g-giant", GIANT)] });
    const act = conduitActs(s0).find((x) => x.targets?.[0]?.id === "g-giant");
    expect(act, "Conduit's activation").toBeTruthy();
    const activated = dispatchAction(s0, act);
    const gone = { ...activated, players: { ...activated.players, user: { ...activated.players.user, graveyard: [] } } };
    expect(settle(gone).pendingFreeCast).toBeUndefined();
  });
  it("⛔ not enough mana for the card at resolution: only the decline", () => {
    const s = activate(table({ mountains: 3, graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    expect(legalActionsForPlayer(s, "user").map((a) => a.kind)).toEqual(["free-cast-decline"]);
  });
  it("⛔ an opponent's Drannith Magistrate (cast only from hand): only the decline", () => {
    const s = activate(table({ graveyard: [gyCard("g-giant", GIANT)], oppBf: [on("ai", "dm", DRANNITH)] }), "g-giant");
    expect(legalActionsForPlayer(s, "user").map((a) => a.kind)).toEqual(["free-cast-decline"]);
  });
  it("⛔ while the window is open no one else acts", () => {
    const s = activate(table({ graveyard: [gyCard("g-giant", GIANT)] }), "g-giant");
    expect(legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai")).toEqual([]);
  });
});

describe("the default AI", () => {
  it("⭐ with nothing it would cast from hand, it activates Conduit at its best affordable card and casts it from the window", () => {
    const s0 = table({ seat: "ai", graveyard: [gyCard("g-giant", GIANT), gyCard("g-stone", MIND_STONE), gyCard("g-forest", FOREST)] });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: pick?.kind, permanentId: pick?.permanentId, target: pick?.targets?.[0]?.id }).toEqual({ kind: "activate-ability", permanentId: "conduit", target: "g-giant" });
    const s1 = settle(dispatchAction(s0, pick));
    const pick2 = pickAction(s1, "ai", legalActionsForPlayer(s1, "ai"));
    expect({ kind: pick2?.kind, cardId: pick2?.cardId }).toEqual({ kind: "cast-spell", cardId: "g-giant" });
    const s2 = settle(dispatchAction(s1, pick2));
    expect({ giant: !!named(s2, "ai", "Hill Giant"), locked: s2.castLocksThisTurn?.ai?.all }).toEqual({ giant: true, locked: true });
  });
  it("⛔ having cast a spell this turn, the AI does not activate it (it would do nothing)", () => {
    const s0 = table({ seat: "ai", spellsCast: 1, graveyard: [gyCard("g-giant", GIANT)] });
    expect(pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"))?.permanentId).not.toBe("conduit");
  });
});
