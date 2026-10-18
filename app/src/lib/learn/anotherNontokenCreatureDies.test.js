/**
 * anotherNontokenCreatureDies.test.js — the play-weighted program: "Whenever another nontoken creature dies" with no controller.
 *
 *   Harvester of Souls (#1910): "Deathtouch / Whenever another nontoken creature dies, you may draw a card."
 *   Ogre Slumlord (#1998):      "Whenever another nontoken creature dies, you may create a 1/1 black Rat creature token. /
 *                                Rats you control have deathtouch."
 *
 * The controlled form ("another nontoken creature YOU CONTROL dies" — Grim Haruspex) has been read for a long time; the bare
 * subject was refused. It is the any-player creature scope that excludes the source (eachOtherCreature) with the nontoken gate
 * (CR 111.1 — the dying permanent's look-back is not a token), the gate scopeMatches runs before every scope. Any player's
 * creature counts. The bundled ruling (Harvester of Souls): "If another nontoken creature dies at the same time as Harvester of
 * Souls, its ability triggers for that creature" — the batch look-back (CR 603.10a).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const HARVESTER = {"name":"Harvester of Souls","type":"Creature — Demon","mana":"{4}{B}{B}","cmc":6,"power":"5","toughness":"5","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever another nontoken creature dies, you may draw a card."}; // body-only #1910
const SLUMLORD = {"name":"Ogre Slumlord","type":"Creature — Ogre Rogue","mana":"{3}{B}{B}","cmc":5,"power":"3","toughness":"3","keywords":[],"colors":["B"],"oracle":"Whenever another nontoken creature dies, you may create a 1/1 black Rat creature token.\nRats you control have deathtouch."}; // body-only #1998
const HUNTER = {"name":"High-Society Hunter","type":"Creature — Vampire Noble","mana":"{3}{B}{B}","cmc":5,"power":"5","toughness":"3","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nWhenever this creature attacks, you may sacrifice another creature. If you do, put a +1/+1 counter on this creature.\nWhenever another nontoken creature dies, draw a card."}; // body-only #4402
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const CORPSE = {"name":"Walking Corpse","type":"Creature — Zombie","mana":"{1}{B}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":""}; // native-body
const SOLDIER_TOKEN = { name: "Soldier", type: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"], oracle: "", token: true };

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));

/** Two seats, the main phase; each player has a library to draw from. */
function table({ user = [], ai = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: libCards(5, pid), life: 20 };
  players.user = { ...players.user, battlefield: user };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
/** Flush and resolve every trigger; each "you may" is answered yes. Returns the settled state and how many choices were asked. */
function settle(s) {
  let asked = 0;
  s = flushTriggers(s);
  for (let g = 0; g < 60; g++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); asked++; continue; }
    if (!s.stack.length) break;
    s = flushTriggers(resolveTopOfStack(s));
  }
  return { s, asked };
}
/** The listed permanents get lethal damage; the state-based check destroys them together and the dies triggers settle. */
function kill(s, ids) {
  s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (ids.includes(x.id) ? { ...x, damageMarked: 99 } : x)) }])) };
  const r = destroyLethalCreatures(s);
  return settle(checkDiesTriggers(r.state, r.dead));
}
const hand = (s, pid = "user") => s.players[pid].hand.length;
const rats = (s, pid = "user") => s.players[pid].battlefield.filter((p) => /\bRat\b/.test(String(p.card?.type || p.card?.type_line || "")));

describe("DETECTION + CLASSIFICATION", () => {
  it("⭐ the bare subject → any player's creature but the source, with the nontoken gate; it routes natively", () => {
    for (const c of [HARVESTER, SLUMLORD]) {
      const d = detectTriggers(c).find((x) => x.event === "dies");
      expect([c.name, d && { scope: d.scope, nontokenFilter: d.nontokenFilter, routes: triggerRoutesNatively(d) }])
        .toEqual([c.name, { scope: "eachOtherCreature", nontokenFilter: true, routes: true }]);
    }
  });

  it("⭐ Harvester of Souls and Ogre Slumlord classify native", () => {
    for (const c of [HARVESTER, SLUMLORD]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — High-Society Hunter stays parked (its attack trigger's sacrifice)", () => {
    expect(isNativeTier(classifyCard(HUNTER))).toBe(false);
  });
});

describe("RUNTIME — Harvester of Souls", () => {
  it("⭐ the opponent's nontoken creature dies: the user may draw — and does", () => {
    const { s, asked } = kill(table({ user: [P("harv", HARVESTER, "user")], ai: [P("bears", BEARS, "ai")] }), ["bears"]);
    expect({ asked, hand: hand(s) }).toEqual({ asked: 1, hand: 1 });
  });

  it("⭐ the user's own other nontoken creature dying triggers it too (no controller in the subject)", () => {
    const { s } = kill(table({ user: [P("harv", HARVESTER, "user"), P("corpse", CORPSE, "user")] }), ["corpse"]);
    expect(hand(s)).toBe(1);
  });

  it("⭐ the ruling: Harvester dying together with another nontoken creature still triggers for that creature (once)", () => {
    const { s } = kill(table({ user: [P("harv", HARVESTER, "user")], ai: [P("bears", BEARS, "ai")] }), ["harv", "bears"]);
    expect(hand(s)).toBe(1);
  });

  it("control — a token dying does not trigger it; nor does Harvester's own death", () => {
    const tok = kill(table({ user: [P("harv", HARVESTER, "user")], ai: [P("tok", SOLDIER_TOKEN, "ai")] }), ["tok"]);
    const own = kill(table({ user: [P("harv", HARVESTER, "user")] }), ["harv"]);
    expect({ token: [tok.asked, hand(tok.s)], own: [own.asked, hand(own.s)] }).toEqual({ token: [0, 0], own: [0, 0] });
  });
});

describe("RUNTIME — Ogre Slumlord", () => {
  it("⭐ an opponent's nontoken creature dies: the user may create a Rat — and does; the Rat has deathtouch", () => {
    const { s, asked } = kill(table({ user: [P("ogre", SLUMLORD, "user")], ai: [P("bears", BEARS, "ai")] }), ["bears"]);
    const made = rats(s);
    expect({ asked, rats: made.length, deathtouch: made.length ? permanentHasKeyword(s, made[0].id, "Deathtouch") : null })
      .toEqual({ asked: 1, rats: 1, deathtouch: true });
  });

  it("control — a Rat token of its controller's dying makes no Rat (a token is not a nontoken creature)", () => {
    const RAT_TOKEN = { name: "Rat", type: "Token Creature — Rat", power: "1", toughness: "1", colors: ["B"], oracle: "", token: true };
    const { s, asked } = kill(table({ user: [P("ogre", SLUMLORD, "user"), P("rat", RAT_TOKEN, "user")] }), ["rat"]);
    expect({ asked, rats: rats(s).length }).toEqual({ asked: 0, rats: 0 });
  });
});
