/**
 * anotherSubtypeDies.test.js — the play-weighted program: "Whenever another <Subtype> you control dies".
 *
 *   Diregraf Captain (#2326):   "Deathtouch / Other Zombie creatures you control get +1/+1. / Whenever another Zombie you control
 *                               dies, target opponent loses 1 life."
 *   Plague Belcher (#3686), Tegwyll, Duke of Splendor (#3844), Boggart Cursecrafter (#8917) — the same watcher.
 *
 * "a <Subtype> you control dies" (Laid to Rest, Slimefoot) and "another <Subtype> you control enters" (otherSubtypeYouControl) were
 * read; the dies form with "another" fell through. It is the enters scope on the dies event: a creature its controller controlled
 * that carries the subtype (a changeling is every creature type — the permMatchesSubtypeFilter read), never the source itself (the
 * scope's id check — a Zombie watcher's own death doesn't trigger it). The bundled rulings (Plague Belcher, Tegwyll, Boggart
 * Cursecrafter): dying at the same time as another one, it still triggers for that one — the batch look-back (CR 603.10a).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the tier BEFORE this slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const CAPTAIN = {"name":"Diregraf Captain","type":"Creature — Zombie Soldier","mana":"{1}{U}{B}","cmc":3,"power":"2","toughness":"2","keywords":["Deathtouch"],"colors":["B","U"],"oracle":"Deathtouch\nOther Zombie creatures you control get +1/+1.\nWhenever another Zombie you control dies, target opponent loses 1 life."}; // body-only #2326
const BELCHER = {"name":"Plague Belcher","type":"Creature — Zombie Beast","mana":"{2}{B}","cmc":3,"power":"5","toughness":"4","keywords":["Menace"],"colors":["B"],"oracle":"Menace\nWhen this creature enters, put two -1/-1 counters on target creature you control.\nWhenever another Zombie you control dies, each opponent loses 1 life."}; // body-only #3686
const TEGWYLL = {"name":"Tegwyll, Duke of Splendor","type":"Legendary Creature — Faerie Noble","mana":"{1}{U}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying"],"colors":["B","U"],"oracle":"Flying, deathtouch\nOther Faeries you control get +1/+1.\nWhenever another Faerie you control dies, you draw a card and you lose 1 life."}; // body-only #3844
const CURSECRAFTER = {"name":"Boggart Cursecrafter","type":"Creature — Goblin Warlock","mana":"{B}{R}","cmc":2,"power":"2","toughness":"3","keywords":["Deathtouch"],"colors":["B","R"],"oracle":"Deathtouch\nWhenever another Goblin you control dies, this creature deals 1 damage to each opponent."}; // body-only #8917
const CORPSE = {"name":"Walking Corpse","type":"Creature — Zombie","mana":"{1}{B}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SHAPESHIFTER = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

function table({ user = [], ai = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: Array.from({ length: 5 }, (_, i) => ({ ...BEARS, id: `${pid}-lib${i}` })), life: 20 };
  players.user = { ...players.user, battlefield: user };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function settle(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 60 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
function kill(s, ids) {
  s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (ids.includes(x.id) ? { ...x, damageMarked: 99 } : x)) }])) };
  const r = destroyLethalCreatures(s);
  return settle(checkDiesTriggers(r.state, r.dead));
}

describe("DETECTION + CLASSIFICATION", () => {
  it("⭐ \"another <Subtype> you control dies\" → the other-subtype scope on the dies event, routing natively", () => {
    const rows = [CAPTAIN, BELCHER, TEGWYLL, CURSECRAFTER].map((c) => {
      const d = detectTriggers(c).find((x) => x.event === "dies");
      return d && { card: c.name, scope: d.scope, subtypeFilter: d.subtypeFilter, routes: triggerRoutesNatively(d) };
    });
    expect(rows).toEqual([
      { card: CAPTAIN.name, scope: "otherSubtypeYouControl", subtypeFilter: "Zombie", routes: true },
      { card: BELCHER.name, scope: "otherSubtypeYouControl", subtypeFilter: "Zombie", routes: true },
      { card: TEGWYLL.name, scope: "otherSubtypeYouControl", subtypeFilter: "Faerie", routes: true },
      { card: CURSECRAFTER.name, scope: "otherSubtypeYouControl", subtypeFilter: "Goblin", routes: true },
    ]);
  });

  it("⭐ Diregraf Captain, Plague Belcher, Tegwyll and Boggart Cursecrafter classify native", () => {
    for (const c of [CAPTAIN, BELCHER, TEGWYLL, CURSECRAFTER]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — a card-type word is no subtype: \"another creature you control dies\" keeps its own scope", () => {
    const d = detectTriggers({ name: "Probe", type: "Creature — Spirit", oracle: "Whenever another creature you control dies, you gain 1 life." }).find((x) => x.event === "dies");
    expect(d.scope).toBe("otherCreatureYouControl");
  });
});

describe("RUNTIME", () => {
  it("⭐ Diregraf Captain: another Zombie you control dies — the opponent loses 1 life", () => {
    const s = kill(table({ user: [P("cap", CAPTAIN, "user"), P("corpse", CORPSE, "user")] }), ["corpse"]);
    expect(s.players.ai.life).toBe(19);
  });

  it("control — the Captain's own death, a non-Zombie of yours, an opponent's Zombie: no life lost", () => {
    const own = kill(table({ user: [P("cap", CAPTAIN, "user")] }), ["cap"]);
    const bears = kill(table({ user: [P("cap", CAPTAIN, "user"), P("bears", BEARS, "user")] }), ["bears"]);
    const theirs = kill(table({ user: [P("cap", CAPTAIN, "user")], ai: [P("corpse", CORPSE, "ai")] }), ["corpse"]);
    expect({ own: own.players.ai.life, bears: bears.players.ai.life, theirs: theirs.players.ai.life }).toEqual({ own: 20, bears: 20, theirs: 20 });
  });

  it("⭐ a changeling is a Zombie: Changeling Outcast dying triggers the Captain", () => {
    const s = kill(table({ user: [P("cap", CAPTAIN, "user"), P("outcast", SHAPESHIFTER, "user")] }), ["outcast"]);
    expect(s.players.ai.life).toBe(19);
  });

  it("⭐ the ruling: Plague Belcher dying together with another Zombie still triggers for that Zombie — once", () => {
    const s = kill(table({ user: [P("belcher", BELCHER, "user"), P("corpse", CORPSE, "user")] }), ["belcher", "corpse"]);
    expect(s.players.ai.life).toBe(19);
  });

  it("⭐ Tegwyll: another Faerie dies — you draw a card and lose 1 life; Boggart Cursecrafter: another Goblin dies — 1 damage to each opponent", () => {
    const FAERIE = {"name":"Zephyr Sprite","type":"Creature — Faerie","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":["Flying"],"colors":["U"],"oracle":"Flying"}; // native-body
    const GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"}; // native-body
    const t = kill(table({ user: [P("teg", TEGWYLL, "user"), P("fae", FAERIE, "user")] }), ["fae"]);
    const b = kill(table({ user: [P("bog", CURSECRAFTER, "user"), P("gob", GOBLIN, "user")] }), ["gob"]);
    expect({ hand: t.players.user.hand.length, life: t.players.user.life, ai: b.players.ai.life }).toEqual({ hand: 1, life: 19, ai: 19 });
  });
});
