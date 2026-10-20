/**
 * aiRacerDeathtouchTrade.test.js — the default AI's racer values each block its attackers could meet as a trade: the
 * attacker it loses less the blocker the defender loses; the defender's best assignment of its blockers (a matching — each
 * blocks one attacker) decides what the group can lose (AI decision quality; the engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 509.1a (each untapped creature blocks ONE attacker, unless an effect says it can block
 * more), CR 702.2b (deathtouch: any damage it deals to a creature is lethal), CR 510.1 / 510.2 (combat damage is dealt
 * simultaneously, so a blocker that kills an attacker can die to it in the same step), CR 702.111b (menace) and CR
 * 508.1h (an attack tax is a cost to attack).
 *
 * Before this fix the racer's group judgment counted a block by a deathtouch creature as a free kill whenever the attacker
 * was bigger (its power plus toughness above the blocker's), even though the blocker dies too: a lone Typhoid Rats kept
 * two Zombie tokens home, and in a self-play game Old Gnawbone, Avenger of Zendikar and Apex Devastator stayed home
 * against a single untapped Atraxa, Praetors' Voice that dies blocking any of them. Each block is now an edge worth the
 * attacker it kills minus the blocker it costs (evaluateBoard's scale: a permanentValue point is 4 life), and the loss is
 * the defender's best matching of blockers to attackers — one blocker takes only one attacker, and a trade the defender
 * would lose by is not counted. The face damage is judged as before (every blocker blocks the biggest attackers it can,
 * weighted up below 20 life), both worst cases at once.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim; the token objects add
 * the engine's `token: true` flag (a token is no card, CR 111.1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction, pickAttackPlan, POLICY_KEYS, __tradeLossPrefixesForTests } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const ZOMBIE = {"name":"Zombie","type":"Token Creature — Zombie","power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"","token":true};
const BEAST = {"name":"Beast","type":"Token Creature — Beast","power":"3","toughness":"3","keywords":[],"colors":["G"],"oracle":"","token":true};
const RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // EDHREC #5683
const STRIX = {"name":"Baleful Strix","type":"Artifact Creature — Bird","mana":"{U}{B}","cmc":2,"power":"1","toughness":"1","keywords":["Deathtouch","Flying"],"colors":["B","U"],"oracle":"Flying, deathtouch\nWhen this creature enters, draw a card."}; // EDHREC #362
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"}; // EDHREC #1752
const ATRAXA = {"name":"Atraxa, Praetors' Voice","type":"Legendary Creature — Phyrexian Angel Horror","mana":"{G}{W}{U}{B}","cmc":4,"power":"4","toughness":"4","keywords":["Deathtouch","Flying","Lifelink","Vigilance","Proliferate"],"colors":["B","G","U","W"],"oracle":"Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)","isCommander":true}; // EDHREC #2425
const GNAWBONE = {"name":"Old Gnawbone","type":"Legendary Creature — Dragon","mana":"{5}{G}{G}","cmc":7,"power":"7","toughness":"7","keywords":["Flying","Treasure"],"colors":["G"],"oracle":"Flying\nWhenever a creature you control deals combat damage to a player, create that many Treasure tokens."}; // EDHREC #927
const AVENGER = {"name":"Avenger of Zendikar","type":"Creature — Elemental","mana":"{5}{G}{G}","cmc":7,"power":"5","toughness":"5","keywords":["Landfall"],"colors":["G"],"oracle":"When this creature enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control."}; // EDHREC #295
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const many = (n, prefix, card, controller, over = {}) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller, over));

/** `seat`'s declare attackers step in a two-player game; `boards` maps seat → permanents, `life` seat → life (default 40). */
function game({ seat = "ai", boards = {}, life = {} }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life: life[pid] ?? 40 };
  }
  return { ...s0, players, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
}

const attacks = (s, seat = "ai") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker");
/** The ids the AI planner sends, sorted. */
const planned = (s, seat = "ai", opts = {}) => pickAttackPlan(s, seat, attacks(s, seat), opts).map((a) => a.permanentId).sort();
/** The declaration as the engine's driver takes it: one pickAction per tick, each dispatched, until the AI stops declaring. */
function declareAll(s, seat = "ai") {
  for (let tick = 0; tick < 30; tick++) {
    const offered = legalActionsForPlayer(s, seat);
    if (!offered.some((a) => a.kind === "declare-attacker")) break;
    const pick = pickAction(s, seat, offered);
    if (pick?.kind !== "declare-attacker") break;
    s = dispatchAction(s, pick);
  }
  return s;
}
const declaredIds = (s, seat = "ai") => (s.combat?.attackers || []).filter((a) => a.attackingPlayer === seat).map((a) => a.permanentId).sort();
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).sort();

describe("a deathtouch blocker that kills a bigger attacker dies too: the block is a trade, valued", () => {
  it("⭐ two Zombie tokens into a lone Typhoid Rats: both attack (the Rats would trade with a token worth less than itself)", () => {
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user")] } });
    expect(planned(s)).toEqual(ids("z", 2));
  });

  it("⭐ the same board through the engine's one-attacker-a-tick declaration: both Zombies are declared", () => {
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user")] } });
    expect(declaredIds(declareAll(s))).toEqual(ids("z", 2));
  });

  it("⭐ two Grizzly Bears into a lone Baleful Strix (deathtouch, worth more than a Bear): both attack", () => {
    const s = game({ boards: { ai: many(2, "b", BEARS, "ai"), user: [P("strix", STRIX, "user")] } });
    expect(planned(s)).toEqual(ids("b", 2));
  });

  it("⭐ Old Gnawbone and four Grizzly Bears into a lone Atraxa (its controller's commander) at 9: Gnawbone attacks with the Bears — Atraxa trades with it and 8 connects, or eats a Bear and 13 connects", () => {
    const s = game({ life: { user: 9 }, boards: { ai: [P("gnawbone", GNAWBONE, "ai"), ...many(4, "b", BEARS, "ai")], user: [P("atraxa", ATRAXA, "user")] } });
    expect(planned(s)).toEqual([...ids("b", 4), "gnawbone"].sort());
  });

  it("⭐ the Gnawbone board through the engine: all five are declared", () => {
    const s = game({ life: { user: 9 }, boards: { ai: [P("gnawbone", GNAWBONE, "ai"), ...many(4, "b", BEARS, "ai")], user: [P("atraxa", ATRAXA, "user")] } });
    expect(declaredIds(declareAll(s))).toEqual([...ids("b", 4), "gnawbone"].sort());
  });

  it("⭐ Avenger of Zendikar beside three 3/3 Beast tokens into a lone Atraxa at 12: the Avenger attacks with the Beasts (Atraxa dies blocking it)", () => {
    const s = game({ life: { user: 12 }, boards: { ai: [P("avenger", AVENGER, "ai"), ...many(3, "beast", BEAST, "ai")], user: [P("atraxa", ATRAXA, "user")] } });
    expect(planned(s)).toEqual(["avenger", ...ids("beast", 3)].sort());
  });
});

describe("controls — the racer still holds what it held for a reason", () => {
  it("control — the crack-back would be lethal: the two Zombies stay home against the Rats when their controller is at 4 and two tapped Craw Wurms untap next turn", () => {
    const s = game({ life: { ai: 4 }, boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user"), ...many(2, "wurm", WURM, "user", { tapped: true })] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — a small deathtouch blocker eating a bigger body: two Craw Wurms stay home against the lone Typhoid Rats at 40 (a Wurm for the Rats is worth more than 6 damage)", () => {
    const s = game({ boards: { ai: many(2, "wurm", WURM, "ai"), user: [P("rats", RATS, "user")] } });
    expect(planned(s)).toEqual([]);
  });

  it("control — every attacker would die for nothing: two Grizzly Bears stay home against two Vampire Nighthawks (each eats a Bear and survives)", () => {
    const s = game({ boards: { ai: many(2, "b", BEARS, "ai"), user: many(2, "hawk", NIGHTHAWK, "user") } });
    expect(planned(s)).toEqual([]);
  });

  it("control — the Gnawbone board with Atraxa's controller at 40: all five stay home (the damage is not worth trading Gnawbone for Atraxa)", () => {
    const s = game({ boards: { ai: [P("gnawbone", GNAWBONE, "ai"), ...many(4, "b", BEARS, "ai")], user: [P("atraxa", ATRAXA, "user")] } });
    expect(planned(s)).toEqual([]);
  });
});

describe("the defender's best assignment is a maximum-weight matching (each slot blocks one attacker)", () => {
  // A deathtouch blocker without first strike always kills the attacker it blocks (CR 702.2b) and dies when the attacker's
  // power reaches its toughness, so each edge is 4 × (the attacker's value − the blocker's value if it dies), floored at 0.
  const edge = (r, b) => Math.max(0, 4 * (r.value - (r.power >= b.toughness ? b.value : 0)));
  /** The most the slots can take from rows[0..upTo], every assignment tried (each slot one row, each row one slot). */
  function exhaustive(rows, slots, upTo) {
    let best = 0;
    const taken = new Set();
    const walk = (j, total) => {
      if (j === slots.length) { best = Math.max(best, total); return; }
      walk(j + 1, total);
      for (let i = 0; i <= upTo; i++) {
        const b = rows[i].eligible.find((x) => x.id === slots[j]);
        if (!b || taken.has(i)) continue;
        taken.add(i);
        walk(j + 1, total + edge(rows[i], b));
        taken.delete(i);
      }
    };
    walk(0, 0);
    return best;
  }
  // A small deterministic generator (mulberry32) so the 300 boards are the same on every run.
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  it("⭐ on 300 random boards (1–4 deathtouch blockers, 1–6 attackers, random legality) every prefix equals the exhaustive best", () => {
    const next = rng(20261018);
    const pick = (n) => Math.floor(next() * n);
    let mismatches = 0;
    let nonTrivial = 0;
    for (let board = 0; board < 300; board++) {
      const blockers = Array.from({ length: 1 + pick(4) }, (_, k) => ({ id: `blk${k}`, power: 1 + pick(4), toughness: 1 + pick(6), firstStrike: false, deathtouch: true, value: 1 + pick(10) }));
      const rows = Array.from({ length: 1 + pick(6) }, (_, k) => {
        const eligible = blockers.filter(() => next() < 0.7);
        return { id: `att${k}`, power: 1 + pick(7), toughness: 1 + pick(7), firstStrike: false, deathtouch: false, minBlockers: 1, eligibleCount: eligible.length, eligible, value: 1 + pick(12) };
      });
      const slots = blockers.map((b) => b.id);
      const got = __tradeLossPrefixesForTests(rows, slots);
      rows.forEach((_, i) => {
        const want = exhaustive(rows, slots, i);
        if (Math.abs(got[i] - want) > 1e-9) mismatches++;
        if (want > 0) nonTrivial++;
      });
    }
    expect({ mismatches, enoughNonTrivialPrefixes: nonTrivial > 500 }).toEqual({ mismatches: 0, enoughNonTrivialPrefixes: true });
  });

  it("⭐ one deathtouch blocker takes one attacker: two equal attackers it can kill lose one attacker's worth, not two", () => {
    const dt = { id: "dt", power: 1, toughness: 2, firstStrike: false, deathtouch: true, value: 1 };
    const row = (id) => ({ id, power: 1, toughness: 3, firstStrike: false, deathtouch: false, minBlockers: 1, eligibleCount: 1, eligible: [dt], value: 5 });
    expect(__tradeLossPrefixesForTests([row("a"), row("b")], ["dt"])).toEqual([20, 20]);
  });

  it("⭐ a menace attacker needs two slots: with one blocker it can't be blocked, with two each slot counts half of its best single-blocker trade", () => {
    const blk = (id) => ({ id, power: 3, toughness: 3, firstStrike: false, deathtouch: false, value: 2 });
    const menace = { id: "m", power: 2, toughness: 2, firstStrike: false, deathtouch: false, minBlockers: 2, eligibleCount: 1, eligible: [blk("x")], value: 3 };
    expect(__tradeLossPrefixesForTests([menace], ["x"])).toEqual([0]);
    expect(__tradeLossPrefixesForTests([{ ...menace, eligibleCount: 2, eligible: [blk("x"), blk("y")] }], ["x", "y"])).toEqual([12]);
  });
});

describe("above the matching cap (64 rows) the gain is never overstated", () => {
  // s1 and s3 survive the 1-power attackers and kill them (deathtouch); s2 dies to any of them, so its block is a trade.
  const s1 = { id: "s1", power: 1, toughness: 5, firstStrike: false, deathtouch: true, value: 1 };
  const s2 = { id: "s2", power: 1, toughness: 1, firstStrike: false, deathtouch: true, value: 0.25 };
  const s3 = { id: "s3", power: 1, toughness: 5, firstStrike: false, deathtouch: true, value: 1 };
  const row = (id, value, eligible) => ({ id, power: 1, toughness: 1, firstStrike: false, deathtouch: false, minBlockers: 1, eligibleCount: eligible.length, eligible, value });
  // A: s1 takes 10, s2 trades for 9; B: only s1, 9. The best for A and B is 18 (A on s2, B on s1); a greedy pass takes A on s1 for 10.
  const rows = (pads) => [row("A", 2.5, [s1, s2]), row("B", 2.25, [s1]), ...Array.from({ length: pads }, (_, k) => row(`pad${k}`, 0.25, [s3]))];

  it("⭐ at the cap the matching is exact: the attackers that go anyway lose 18, the whole group 19", () => {
    const best = __tradeLossPrefixesForTests(rows(62), ["s1", "s2", "s3"], 2);
    expect([best[1], best[63]]).toEqual([18, 19]);
  });

  it("⭐ above it, the base is bounded from below (a greedy matching, 10 ≤ 18) and every longer prefix from above (20 ≥ 19)", () => {
    const best = __tradeLossPrefixesForTests(rows(64), ["s1", "s2", "s3"], 2);
    expect([best[1], best[65]]).toEqual([10, 20]);
  });
});

describe("the policy seam", () => {
  it("⭐ `racerTrade` is a POLICY_KEYS subsystem, and `racerTrade: \"v1\"` restores the free-kill valuation (both Zombies stay home)", () => {
    expect(POLICY_KEYS).toContain("racerTrade");
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user")] } });
    expect(planned(s, "ai", { policy: { racerTrade: "v1" } })).toEqual([]);
  });
});
