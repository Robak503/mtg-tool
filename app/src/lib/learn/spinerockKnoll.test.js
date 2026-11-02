/**
 * spinerockKnoll.test.js — SPINEROCK KNOLL (the play-weighted program, EDHREC #781):
 *
 *   "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the
 *    bottom in a random order.)
 *    This land enters tapped.
 *    {T}: Add {R}.
 *    {R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn."
 *
 * Hideaway, the enters-tapped line, the mana and the linked play already read (mosswortBridge.test.js); the condition had no reader.
 * It reads the damage-only per-seat ledger (`damageTakenThisTurn`, CR 120.3 — a drain or a paid life is no damage) for ONE opponent's
 * turn total against 7 (the bundled ruling: "It doesn't matter how the opponent was dealt damage or by whom, as long as the total
 * damage is 7 or more"), and counts an opponent who left the game this turn (the ruling: "a player who was your opponent at the time
 * they left the game"). The condition is checked at the offer and again as the ability resolves (CR 608.2c).
 *
 * Damage is dealt through the real paths: combat damage (combatResolution.resolveCombatDamage) and burn spells cast and resolved;
 * the drain through a real Soul Feast. Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KNOLL = {"name":"Spinerock Knoll","type":"Land","mana":"","oracle":"Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {R}.\n{R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Hideaway"],"colors":[],"colorIdentity":["R"]}; // EDHREC #781
const LAVA_AXE = {"name":"Lava Axe","type":"Sorcery","mana":"{4}{R}","oracle":"Lava Axe deals 5 damage to target player or planeswalker.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #18472
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","oracle":"Shock deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2215
const SOUL_FEAST = {"name":"Soul Feast","type":"Sorcery","mana":"{3}{B}{B}","oracle":"Target player loses 4 life and you gain 4 life.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #29525
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `seat`'s precombat main, a Knoll on the battlefield with a Wurm hidden under it, `mountains` untapped Mountains, `extra` permanents. */
function table({ seat = "user", pod = false, mountains = 2, extra = [], hand = [], hidden = WURM } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const bf = [on(seat, "knoll", KNOLL, { hideawayCardId: "x-hidden" }), ...Array.from({ length: mountains }, (_, i) => on(seat, `m${i}`, MOUNTAIN)), ...extra];
  const players = { ...g.players, [seat]: { ...g.players[seat], battlefield: bf, hand, exile: [{ ...hidden, id: "x-hidden", _hideawayOf: "knoll" }], landsPlayedThisTurn: 0 } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return n;
}
const knollPlay = (s, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "knoll" && !/Add \{R\}/.test(a.abilityText || ""));
/** Real combat damage: `attackers` Grizzly Bears (on `seat`'s side already) hit `defender`, unblocked. */
function combatHit(s, seat, defender, ids) {
  const combat = { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: seat, defender })), blockers: [] };
  const hit = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat });
  return { ...hit, phase: "postcombat-main", step: "main", combat: null, priorityHolder: seat };
}
const bearsFor = (seat, n) => Array.from({ length: n }, (_, i) => on(seat, `b${i}`, BEARS));
/** Cast a burn spell from `seat`'s hand at `targetId` and resolve it (the real cast lane and resolver), paid from mana floated for it (so
 *  the planner never taps the Knoll or the Mountain its play needs). */
function burn(s, seat, cardId, targetId) {
  const card = s.players[seat].hand.find((c) => c.id === cardId);
  const pips = (String(card.mana).match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const p of pips) { if (/^\d+$/.test(p)) pool.C += Number(p); else pool[p] += 1; }
  s = { ...s, players: { ...s.players, [seat]: { ...s.players[seat], manaPool: pool } } };
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && (x.targets || []).some((t) => t.id === targetId));
  expect(a, `no cast of ${cardId} at ${targetId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** Activate the Knoll's play, resolve it, cast the hidden Wurm from the parked decision and resolve that. */
function playHidden(s, seat = "user") {
  const act = knollPlay(s, seat);
  expect(act, "the Knoll's play is not offered").toBeTruthy();
  const s1 = settle(dispatchAction(s, act));
  const free = legalActionsForPlayer(s1, seat).find((a) => a.kind === "cast-spell" && a.cardId === "x-hidden");
  expect(free, "no free cast of the hidden card").toBeTruthy();
  let s2 = dispatchAction(s1, free);
  while (s2.stack.length && !s2.pendingChoice) s2 = resolveTopOfStack(s2);
  return { parked: s1.pendingDiscover, after: finalizeStackResolution(s2), free };
}
const wurms = (s, seat = "user") => s.players[seat].battlefield.filter((p) => p.card?.name === "Craw Wurm").length;

describe("the card", () => {
  it("⭐ a covered land: the linked play carries the damage condition", () => {
    const play = parseActivatedAbilities(KNOLL).find((a) => a.manaPips === "{R}");
    expect({ tier: classifyCard(KNOLL), atoms: play?.program?.atoms, modeled: play?.modeled }).toEqual({
      tier: "land", modeled: true,
      atoms: [{ op: "hideaway-play", targetType: null, condition: "an opponent was dealt 7 or more damage this turn" }],
    });
  });
});

describe("combat damage", () => {
  it("⭐ four Bears deal 8 to the opponent: the play is offered, the hidden Wurm is cast for nothing and enters", () => {
    const s = combatHit(table({ extra: bearsFor("user", 4) }), "user", "ai", ["b0", "b1", "b2", "b3"]);
    const { parked, after, free } = playHidden(s);
    expect({ dealt: s.players.ai.damageTakenThisTurn, life: s.players.ai.life, parked, fromZone: free.fromZone, wurms: wurms(after), exile: after.players.user.exile.length,
      knollTapped: after.players.user.battlefield.find((p) => p.id === "knoll")?.tapped, mountainsTapped: after.players.user.battlefield.filter((p) => p.card?.name === "Mountain" && p.tapped).length })
      .toEqual({ dealt: 8, life: 32, parked: { controller: "user", cardId: "x-hidden", mv: null, declineTo: "exile" }, fromZone: "exile", wurms: 1, exile: 0, knollTapped: true, mountainsTapped: 1 });
  });
  it("⭐ exactly 7 is enough (\"7 or more\"): two Bears and a Lava Axe", () => {
    const s0 = table({ mountains: 6, extra: bearsFor("user", 1), hand: [{ ...LAVA_AXE, id: "h-axe" }] });
    const s = burn(combatHit(s0, "user", "ai", ["b0"]), "user", "h-axe", "ai");
    expect({ dealt: s.players.ai.damageTakenThisTurn, offered: !!knollPlay(s) }).toEqual({ dealt: 7, offered: true });
  });
  it("⛔ three Bears deal 6: not offered", () => {
    const s = combatHit(table({ extra: bearsFor("user", 3) }), "user", "ai", ["b0", "b1", "b2"]);
    expect({ dealt: s.players.ai.damageTakenThisTurn, offered: knollPlay(s) }).toEqual({ dealt: 6, offered: undefined });
  });
});

describe("burn and drains", () => {
  it("⭐ Lava Axe (5) then Shock (2) at the opponent: offered after the Shock, not before", () => {
    const s0 = table({ mountains: 8, hand: [{ ...LAVA_AXE, id: "h-axe" }, { ...SHOCK, id: "h-shock" }] });
    const s1 = burn(s0, "user", "h-axe", "ai");
    const s2 = burn(s1, "user", "h-shock", "ai");
    expect({ afterAxe: !!knollPlay(s1), afterShock: !!knollPlay(s2), dealt: s2.players.ai.damageTakenThisTurn }).toEqual({ afterAxe: false, afterShock: true, dealt: 7 });
    const { after } = playHidden(s2);
    expect(wurms(after)).toBe(1);
  });
  it("⛔ a drain is no damage: two Soul Feasts take 8 life from the opponent, and the play is not offered", () => {
    const swamps = Array.from({ length: 10 }, (_, i) => on("user", `s${i}`, SWAMP));
    const s0 = table({ mountains: 1, extra: swamps, hand: [{ ...SOUL_FEAST, id: "h-f1" }, { ...SOUL_FEAST, id: "h-f2" }] });
    const s = burn(burn(s0, "user", "h-f1", "ai"), "user", "h-f2", "ai");
    expect({ life: s.players.ai.life, lost: s.players.ai.lifeLostThisTurn, dealt: s.players.ai.damageTakenThisTurn || 0, offered: knollPlay(s) }).toEqual({ life: 32, lost: 8, dealt: 0, offered: undefined });
  });
  it("⛔ damage to its own controller is not an opponent's: 8 combat damage to the Knoll's controller", () => {
    const g = table({ extra: [] });
    const s = combatHit({ ...g, players: { ...g.players, ai: { ...g.players.ai, battlefield: bearsFor("ai", 4) } } }, "ai", "user", ["b0", "b1", "b2", "b3"]);
    expect({ dealt: s.players.user.damageTakenThisTurn, offered: knollPlay({ ...s, priorityHolder: "user", activePlayer: "user" }) }).toEqual({ dealt: 8, offered: undefined });
  });
});

describe("a pod", () => {
  it("⛔ 4 to one opponent and 3 to another is no opponent dealt 7", () => {
    let s = table({ pod: true, extra: bearsFor("user", 4) });
    s = combatHit(s, "user", "ai1", ["b0", "b1"]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    s = combatHit(s, "user", "ai2", ["b2"]);
    expect({ ai1: s.players.ai1.damageTakenThisTurn, ai2: s.players.ai2.damageTakenThisTurn, offered: knollPlay(s) }).toEqual({ ai1: 4, ai2: 2, offered: undefined });
  });
  it("⭐ 8 to one opponent of three: offered", () => {
    const s = combatHit(table({ pod: true, extra: bearsFor("user", 4) }), "user", "ai2", ["b0", "b1", "b2", "b3"]);
    expect(wurms(playHidden(s).after)).toBe(1);
  });
  it("⭐ an opponent dealt 8 who then left the game still counts this turn (its ruling) — and not on the next turn", () => {
    const hit = combatHit(table({ pod: true, extra: bearsFor("user", 4) }), "user", "ai2", ["b0", "b1", "b2", "b3"]);
    const gone = removePlayerFromGame(hit, "ai2");
    const nextTurn = { ...gone, turn: gone.turn + 1 };
    expect({ seated: Object.keys(gone.players), offered: !!knollPlay(gone), nextTurn: knollPlay(nextTurn) }).toEqual({ seated: ["user", "ai1", "ai3"], offered: true, nextTurn: undefined });
    expect(wurms(playHidden(gone).after)).toBe(1);
  });
  it("⛔ a departed opponent dealt 6 does not count", () => {
    const hit = combatHit(table({ pod: true, extra: bearsFor("user", 3) }), "user", "ai2", ["b0", "b1", "b2"]);
    expect(knollPlay(removePlayerFromGame(hit, "ai2"))).toBeUndefined();
  });
});

describe("as it resolves (CR 608.2c) and the default AI", () => {
  it("⭐ the condition read at resolution: an opponent's ledger rewound under the activation leaves nothing parked", () => {
    const s = combatHit(table({ extra: bearsFor("user", 4) }), "user", "ai", ["b0", "b1", "b2", "b3"]);
    expect(knollPlay(s), "the Knoll's play").toBeTruthy();
    const activated = dispatchAction(s, knollPlay(s));
    const rewound = { ...activated, players: { ...activated.players, ai: { ...activated.players.ai, damageTakenThisTurn: 6 } } };
    expect(settle(rewound).pendingDiscover).toBeUndefined();
  });
  it("⭐ the default AI holding the Knoll after its creatures dealt 8: it takes the play and casts the hidden Wurm", () => {
    const g = table({ seat: "ai", extra: bearsFor("ai", 4) });
    const s = combatHit(g, "ai", "user", ["b0", "b1", "b2", "b3"]);
    const pick1 = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: pick1?.kind, permanentId: pick1?.permanentId }).toEqual({ kind: "activate-ability", permanentId: "knoll" });
    const s1 = settle(dispatchAction(s, pick1));
    const pick2 = pickAction(s1, "ai", legalActionsForPlayer(s1, "ai"));
    expect({ kind: pick2?.kind, cardId: pick2?.cardId }).toEqual({ kind: "cast-spell", cardId: "x-hidden" });
    let s2 = dispatchAction(s1, pick2);
    while (s2.stack.length && !s2.pendingChoice) s2 = resolveTopOfStack(s2);
    expect(wurms(finalizeStackResolution(s2), "ai")).toBe(1);
  });
  it("⛔ the default AI after only 6: the play is not among its actions", () => {
    const s = combatHit(table({ seat: "ai", extra: bearsFor("ai", 3) }), "ai", "user", ["b0", "b1", "b2"]);
    expect(knollPlay(s, "ai")).toBeUndefined();
  });
});

// THE DEFAULT AI'S HIDEAWAY PLAY (every hideaway land — the blind review's F3): the activation is offered whenever a nonland card is
// hidden and the condition holds, but what it buys is the free cast the AI decides at the parked window. The AI activates only when its
// own pick there would cast the hidden card — a Counterspell with nothing to counter, a Fog outside combat or a Wrath of God over its
// own board would be left in exile, the {G} and the land's tap spent for nothing, every turn — and not under a cast lock that leaves
// the window nothing to cast.
const BRIDGE = {"name":"Mosswort Bridge","type":"Land","mana":"","oracle":"Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {G}.\n{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Hideaway"],"colors":[],"colorIdentity":["G"]}; // EDHREC #195
const FOG = {"name":"Fog","type":"Instant","mana":"{G}","oracle":"Prevent all combat damage that would be dealt this turn.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #655
const WRATH = {"name":"Wrath of God","type":"Sorcery","mana":"{2}{W}{W}","oracle":"Destroy all creatures. They can't be regenerated.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #677
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
/** The AI's precombat main: Mosswort Bridge with `hidden` under it, two Craw Wurms (total power 12), three Forests; nothing in hand. */
function bridgeTable(hidden, extraState = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [on("ai", "bridge", BRIDGE, { hideawayCardId: "x-hidden" }), on("ai", "w0", WURM), on("ai", "w1", WURM), ...Array.from({ length: 3 }, (_, i) => on("ai", `f${i}`, FOREST))];
  const players = { ...g.players, ai: { ...g.players.ai, battlefield: bf, hand: [], exile: [{ ...hidden, id: "x-hidden", _hideawayOf: "bridge" }], landsPlayedThisTurn: 1 } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, players, stack: [], pendingTriggers: [], ...extraState };
}
const bridgePlay = (s) => legalActionsForPlayer(s, "ai").find((a) => a.kind === "activate-ability" && a.permanentId === "bridge" && !/Add \{G\}/.test(a.abilityText || ""));

describe("the default AI's hideaway play — only for a card it would cast", () => {
  for (const [label, hidden] of [["Counterspell (nothing to counter)", COUNTERSPELL], ["Fog (no combat)", FOG], ["Wrath of God (over its own Wurms)", WRATH]]) {
    it(`⛔ ${label} hidden: offered, but the AI does not activate the Bridge`, () => {
      const s = bridgeTable(hidden);
      const offered = bridgePlay(s);
      const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
      expect({ offered: !!offered, activates: pick?.kind === "activate-ability" && pick?.permanentId === "bridge" }).toEqual({ offered: true, activates: false });
    });
  }
  it("⭐ a Craw Wurm hidden: the AI activates the Bridge and casts the Wurm for nothing", () => {
    const s = bridgeTable(WURM);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: pick?.kind, permanentId: pick?.permanentId }).toEqual({ kind: "activate-ability", permanentId: "bridge" });
    const parked = settle(dispatchAction(s, pick));
    const cast = pickAction(parked, "ai", legalActionsForPlayer(parked, "ai"));
    expect({ window: parked.pendingDiscover?.cardId, cast: cast?.kind, cardId: cast?.cardId }).toEqual({ window: "x-hidden", cast: "cast-spell", cardId: "x-hidden" });
    const after = finalizeStackResolution(settle(dispatchAction(parked, cast)));
    expect(after.players.ai.battlefield.filter((p) => p.card?.name === "Craw Wurm").length).toBe(3);
  });
  it("⛔ a Craw Wurm hidden under an all-spells cast lock (Silence, Conduit of Worlds): the window could cast nothing, and the AI does not activate", () => {
    const s = bridgeTable(WURM, { castLocksThisTurn: { ai: { turn: 5, all: true } } });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ offered: !!bridgePlay(s), activates: pick?.kind === "activate-ability" && pick?.permanentId === "bridge" }).toEqual({ offered: true, activates: false });
  });
});
