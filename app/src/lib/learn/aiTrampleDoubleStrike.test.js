/**
 * aiTrampleDoubleStrike.test.js — the default AI's combat damage reads count trample and double strike, and its planeswalker
 * attacks value a block as the racer does, as a trade (AI decision quality; the engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 702.19b (an attacking creature with trample assigns lethal damage to its blockers first, and
 * the excess to the player or planeswalker it attacks), CR 702.19d (blocked, with no blocker left when damage is assigned, it
 * assigns all its damage there), CR 702.2c (any nonzero damage from a deathtouch source is lethal damage for that purpose), CR
 * 702.4b / 510.4 (a double striker deals first-strike and regular combat damage; a creature that strikes first and kills its
 * attacker deals its damage before the attacker can), CR 509.1a (each blocker blocks one attacker), CR 702.2b (deathtouch) and
 * CR 306.8 (damage to a planeswalker removes that much loyalty).
 *
 * Before this fix `opponentAI.unavoidableDamage` — the one damage reader behind the racer's lethal call, the group judgment, the
 * crack-back guard and the planeswalker policy's reach — counted a blocked attacker as dealing nothing and a double striker as
 * dealing its power once: a Colossal Dreadmaw that tramples over a Hill Giant for the kill, or a Skyspear Cavalry hitting twice,
 * was not lethal to it, and an opponent's trampler chump-blocked by the AI's last creature was not a threat. And the planeswalker
 * policy refused any attacker a smaller deathtouch creature could trade with, as if the trade were a free kill.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim; the token objects add the
 * engine's `token: true` flag (a token is no card, CR 111.1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { pickAction, pickAttackPlan, POLICY_KEYS, __combatDamageForTests } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #10474
const COMPANION = {"name":"Garruk's Companion","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"power":"3","toughness":"2","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #23864
const KNUCKLES = {"name":"Knuckles the Echidna","type":"Legendary Creature — Echidna Warrior","mana":"{2}{R}{R}","cmc":4,"power":"2","toughness":"4","keywords":["Treasure Hunter","Treasure","Haste","Trample","Double strike"],"colors":["R"],"oracle":"Double strike, trample, haste\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nTreasure Hunter — At the beginning of your upkeep, if you control thirty or more artifacts, you win the game."}; // EDHREC #1843
const CAVALRY = {"name":"Skyspear Cavalry","type":"Creature — Human Soldier","mana":"{3}{W}{W}","cmc":5,"power":"2","toughness":"2","keywords":["Flying","Double strike"],"colors":["W"],"oracle":"Flying\nDouble strike (This creature deals both first-strike and regular combat damage.)"}; // EDHREC #26836
const COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // EDHREC #253
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387
const HALBERDIER = {"name":"Halberdier","type":"Creature — Human Barbarian","mana":"{3}{R}","cmc":4,"power":"3","toughness":"1","keywords":["First strike"],"colors":["R"],"oracle":"First strike"}; // EDHREC #30343
const RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // EDHREC #5683
const ZOMBIE = {"name":"Zombie","type":"Token Creature — Zombie","power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"","token":true};
const VINDICATOR = {"name":"Swiftblade Vindicator","type":"Creature — Human Soldier","mana":"{R}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Vigilance","Trample","Double strike"],"colors":["R","W"],"oracle":"Double strike (This creature deals both first-strike and regular combat damage.)\nVigilance (Attacking doesn't cause this creature to tap.)\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #7319
const ACE = {"name":"Fencing Ace","type":"Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Double strike"],"colors":["W"],"oracle":"Double strike (This creature deals both first-strike and regular combat damage.)"}; // EDHREC #14566
const MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // EDHREC #6697
const BRUTE = {"name":"Boggart Brute","type":"Creature — Goblin Warrior","mana":"{2}{R}","cmc":3,"power":"3","toughness":"2","keywords":["Menace"],"colors":["R"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)"}; // EDHREC #18929
const PREDATOR = {"name":"Ripscale Predator","type":"Creature — Dinosaur","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"5","keywords":["Menace"],"colors":["R"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)"}; // EDHREC #22399
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // EDHREC #3557

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const many = (n, prefix, card, controller, over = {}) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller, over));
const walker = (id, card, controller, loyalty) => P(id, card, controller, { counters: { loyalty } });

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
const where = (a) => (a.defenderPlaneswalkerId ? `${a.defenderId}:${a.defenderPlaneswalkerId}` : a.defenderId ?? "face");
/** The AI planner's choice for every attacking creature: { permanentId: target }. */
const planOf = (s, seat = "ai", opts = {}) => Object.fromEntries(pickAttackPlan(s, seat, attacks(s, seat), opts).map((a) => [a.permanentId, where(a)]));
/** The ids the AI planner sends, sorted. */
const planned = (s, seat = "ai", opts = {}) => Object.keys(planOf(s, seat, opts)).sort();
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
const declared = (s, seat = "ai") => Object.fromEntries((s.combat?.attackers || []).filter((a) => a.attackingPlayer === seat)
  .map((a) => [a.permanentId, where({ defenderId: a.defender, defenderPlaneswalkerId: a.defenderPlaneswalkerId })]));

describe("the racer's lethal call counts trample and double strike", () => {
  // Grizzly Bears into the Hill Giant die for nothing, so the racer holds them unless the whole swing is lethal.
  const dreadmawBoard = (life) => game({ life: { user: life }, boards: { ai: [P("dreadmaw", DREADMAW, "ai"), P("bears", BEARS, "ai")], user: [P("giant", GIANT, "user")] } });

  it("⭐ Colossal Dreadmaw and Grizzly Bears into a lone Hill Giant at 5: both attack — the Giant blocking Dreadmaw lets 3 trample over beside the Bears' 2, blocking the Bears lets 6 through", () => {
    expect(planned(dreadmawBoard(5))).toEqual(["bears", "dreadmaw"]);
  });

  it("⭐ the same board through the engine's one-attacker-a-tick declaration: both are declared", () => {
    expect(Object.keys(declared(declareAll(dreadmawBoard(5)))).sort()).toEqual(["bears", "dreadmaw"]);
  });

  it("control — at 6 the defender survives at 1 (blocking Dreadmaw): only Dreadmaw attacks", () => {
    expect(planned(dreadmawBoard(6))).toEqual(["dreadmaw"]);
  });

  it("⭐ Skyspear Cavalry (flying, double strike) and Grizzly Bears into a lone Hill Giant at 4: both attack — the Cavalry alone deals 4", () => {
    const s = game({ life: { user: 4 }, boards: { ai: [P("cavalry", CAVALRY, "ai"), P("bears", BEARS, "ai")], user: [P("giant", GIANT, "user")] } });
    expect(planned(s)).toEqual(["bears", "cavalry"]);
  });

  it("control — the Cavalry board at 5: only the Cavalry attacks", () => {
    const s = game({ life: { user: 5 }, boards: { ai: [P("cavalry", CAVALRY, "ai"), P("bears", BEARS, "ai")], user: [P("giant", GIANT, "user")] } });
    expect(planned(s)).toEqual(["cavalry"]);
  });

  it("⭐ deathtouch makes 1 damage lethal for trample (CR 702.2c): Dreadmaw wearing Basilisk Collar and Grizzly Bears into a lone Craw Wurm at 5 both attack — 5 tramples over the Wurm", () => {
    const s = game({ life: { user: 5 }, boards: { ai: [P("dreadmaw", DREADMAW, "ai"), P("collar", COLLAR, "ai", { attachedTo: "dreadmaw" }), P("bears", BEARS, "ai")], user: [P("wurm", WURM, "user")] } });
    expect(planned(s)).toEqual(["bears", "dreadmaw"]);
  });

  it("control — without the Collar the Wurm soaks 4 of Dreadmaw's 6 (2 + the Bears' 2 = 4 at 5): only Dreadmaw attacks", () => {
    const s = game({ life: { user: 5 }, boards: { ai: [P("dreadmaw", DREADMAW, "ai"), P("bears", BEARS, "ai")], user: [P("wurm", WURM, "user")] } });
    expect(planned(s)).toEqual(["dreadmaw"]);
  });

  // Halberdier strikes first and eats a Hill Giant before it deals damage; against Knuckles both strike in the first step.
  const knucklesBoard = (life) => game({ life: { user: life }, boards: { ai: [P("knuckles", KNUCKLES, "ai"), P("giant", GIANT, "ai")], user: [P("halberdier", HALBERDIER, "user")] } });

  it("⭐ double strike AND trample: Knuckles the Echidna and a Hill Giant into a lone Halberdier at 4 both attack — Knuckles tramples 1 over it in the first-strike step and 2 more in the regular step, beside the Giant's 3", () => {
    expect(planned(knucklesBoard(4))).toEqual(["giant", "knuckles"]);
  });

  it("control — the Knuckles board at 5: only Knuckles attacks", () => {
    expect(planned(knucklesBoard(5))).toEqual(["knuckles"]);
  });

  it("control — a first striker that kills a trampler first stops all of it (CR 510.4): Garruk's Companion and Grizzly Bears into a lone Halberdier at 3 stay home", () => {
    const s = game({ life: { user: 3 }, boards: { ai: [P("companion", COMPANION, "ai"), P("bears", BEARS, "ai")], user: [P("halberdier", HALBERDIER, "user")] } });
    expect(planned(s)).toEqual([]);
  });
});

describe("the crack-back guard counts an opponent's trampler and double striker", () => {
  // Two Zombie tokens into a lone Typhoid Rats go as a group (aiRacerDeathtouchTrade.test.js); the AI keeps a summoning-sick
  // Grizzly Bears home. The guard: never send the group when the opponent's next attack would then be lethal.
  const crackBack = (aiLife, threat) => game({ life: { ai: aiLife }, boards: {
    ai: [...many(2, "z", ZOMBIE, "ai"), P("home", BEARS, "ai", { summoningSick: true })],
    user: [P("rats", RATS, "user"), P("threat", threat, "user", { tapped: true })],
  } });

  it("⭐ a tapped Colossal Dreadmaw untaps next turn: with the AI at 5 the Zombies stay home — the Bears chumping Dreadmaw still lets 4 trample over, beside the Rats' 1", () => {
    expect(planned(crackBack(5, DREADMAW))).toEqual([]);
  });

  it("control — the same board with the AI at 6: the Zombies attack", () => {
    expect(planned(crackBack(6, DREADMAW))).toEqual(["z1", "z2"]);
  });

  it("⭐ a tapped Skyspear Cavalry (flying, double strike) untaps next turn: with the AI at 4 the Zombies stay home — it deals 4 over the Bears", () => {
    expect(planned(crackBack(4, CAVALRY))).toEqual([]);
  });

  it("control — the Cavalry board with the AI at 5: the Zombies attack", () => {
    expect(planned(crackBack(5, CAVALRY))).toEqual(["z1", "z2"]);
  });

  it("control — a crack-back lethal without trample still holds the team home: the AI at 1 against the Rats", () => {
    expect(planned(crackBack(1, DREADMAW))).toEqual([]);
  });

  it("control — the guard reads a block the AI can make: with a summoning-sick Craw Wurm home beside the Bears (the AI at 4) the Zombies attack — the Wurm blocks Dreadmaw (2 trample over), the Bears the Rats", () => {
    const s = game({ life: { ai: 4 }, boards: {
      ai: [...many(2, "z", ZOMBIE, "ai"), P("home", BEARS, "ai", { summoningSick: true }), P("wall", WURM, "ai", { summoningSick: true })],
      user: [P("rats", RATS, "user"), P("threat", DREADMAW, "user", { tapped: true })],
    } });
    expect(planned(s)).toEqual(["z1", "z2"]);
  });
});

describe("the planeswalker policy: trample and double strike reach a walker; a block is valued as a trade", () => {
  it("⭐ Colossal Dreadmaw at a 3-loyalty Jace Beleren behind Grizzly Bears: it goes at Jace — chump-blocked, 4 tramples over onto Jace (CR 702.19b)", () => {
    const s = game({ boards: { ai: [P("dreadmaw", DREADMAW, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 3)] } });
    expect(planOf(s)).toEqual({ dreadmaw: "user:jace" });
  });

  it("⭐ Skyspear Cavalry at a 4-loyalty Jace that nothing can block it from: it goes at Jace — it deals 2 twice", () => {
    const s = game({ boards: { ai: [P("cavalry", CAVALRY, "ai")], user: [P("bears", BEARS, "user"), walker("jace", JACE, "user", 4)] } });
    expect(planOf(s)).toEqual({ cavalry: "user:jace" });
  });

  it("⭐ two Zombie tokens at a 2-loyalty Jace beside a Typhoid Rats: both go at Jace — the Rats can trade with one, the other kills Jace (a trade the Rats would lose by, not a free kill)", () => {
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s)).toEqual({ z1: "user:jace", z2: "user:jace" });
  });

  it("⭐ the same board through the engine: both Zombies are declared at Jace", () => {
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user"), walker("jace", JACE, "user", 2)] } });
    expect(declared(declareAll(s))).toEqual({ z1: "user:jace", z2: "user:jace" });
  });

  it("⭐ one blocker blocks one attacker: two Grizzly Bears at a 2-loyalty Jace behind a lone Hill Giant both go at Jace — the Giant eats one, the other kills Jace (a Bear is worth less than Jace)", () => {
    const s = game({ boards: { ai: many(2, "b", BEARS, "ai"), user: [P("giant", GIANT, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s)).toEqual({ b1: "user:jace", b2: "user:jace" });
  });

  it("control — the trade is charged: two Craw Wurms at a 2-loyalty Jace beside a Typhoid Rats stay home (a Wurm traded for the Rats costs more than Jace is worth)", () => {
    const s = game({ boards: { ai: many(2, "w", WURM, "ai"), user: [P("rats", RATS, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s)).toEqual({});
  });

  it("control — a lone Grizzly Bears behind a Hill Giant can't reach a 2-loyalty Jace: it stays home", () => {
    const s = game({ boards: { ai: [P("bears", BEARS, "ai")], user: [P("giant", GIANT, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s)).toEqual({});
  });
});

describe("the damage reading, pinned against the engine's own combat damage", () => {
  // Each attacker kind: its card, and the Basilisk Collar it wears for "collared" (deathtouch and trample, CR 702.2c).
  const ATTACKERS = { dreadmaw: [DREADMAW], companion: [COMPANION], knuckles: [KNUCKLES], vindicator: [VINDICATOR], ace: [ACE], cavalry: [CAVALRY], bears: [BEARS], giant: [GIANT], halberdier: [HALBERDIER], collared: [DREADMAW, COLLAR], rats: [RATS] };
  const BLOCKERS = { bears: BEARS, giant: GIANT, wurm: WURM, halberdier: HALBERDIER, rats: RATS, myr: MYR, zombie: ZOMBIE };
  // Skyspear Cavalry is the one flyer and no blocker here has flying or reach (CR 702.9b): it is the one attack they can't block.
  const canBlock = (kind) => kind !== "cavalry";

  /** The AI's attackers a0, a1, … (kinds) against the user's untapped blockers b0, b1, …; the user at 40. */
  function board(kinds, blockerKinds) {
    const ai = [];
    kinds.forEach((kind, i) => {
      const [card, collar] = ATTACKERS[kind];
      ai.push(P(`a${i}`, card, "ai"));
      if (collar) ai.push(P(`collar${i}`, collar, "ai", { attachedTo: `a${i}` }));
    });
    return game({ boards: { ai, user: blockerKinds.map((kind, j) => P(`b${j}`, BLOCKERS[kind], "user")) } });
  }
  /** The damage the user takes when `blocks` ([blockerId, attackerId], in declaration order) stand: both combat damage steps, run by the engine. */
  function engineDamage(s, ids, blocks) {
    let t = { ...s, step: "combat-damage", combat: { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })), blockers: blocks.map(([b, a]) => ({ blockerId: b, blockingPlayer: "user", attackerId: a })) } };
    t = resolveCombatDamage(t, { firstStrikeStep: true });
    t = resolveCombatDamage(t, { firstStrikeStep: false });
    return 40 - t.players.user.life;
  }
  const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
  /** The defender's best: the least damage over every legal block — each blocker blocks one attacker or none — in every declaration order. */
  function defendersBest(s, kinds, blockerCount) {
    const ids = kinds.map((_, i) => `a${i}`);
    const choice = new Array(blockerCount).fill(-1);
    const seen = new Set();
    let best = Infinity;
    const walk = (j) => {
      if (j === blockerCount) {
        const blocks = choice.map((a, b) => [`b${b}`, a]).filter(([, a]) => a >= 0).map(([b, a]) => [b, `a${a}`]);
        for (const order of permutations(blocks)) {
          const key = ids.map((id) => order.filter(([, a]) => a === id).map(([b]) => b).join(",")).join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          best = Math.min(best, engineDamage(s, ids, order));
        }
        return;
      }
      for (let a = -1; a < kinds.length; a++) {
        if (a >= 0 && !canBlock(kinds[a])) continue;
        choice[j] = a;
        walk(j + 1);
      }
    };
    walk(0);
    return best;
  }
  // A small deterministic generator (mulberry32) so the boards are the same on every run.
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const randomBoards = (seed, count, kinds) => {
    const next = rng(seed);
    const pick = (xs) => xs[Math.floor(next() * xs.length)];
    return Array.from({ length: count }, () => ({
      kinds: Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(kinds)),
      blockerKinds: Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(Object.keys(BLOCKERS))),
    }));
  };

  it("⭐ one attacker against one blocker the reading is exact on both sides — every attacker kind against every blocker kind (77 duels)", () => {
    const wrong = [];
    for (const kind of Object.keys(ATTACKERS)) {
      for (const blocker of Object.keys(BLOCKERS)) {
        _resetIdsForTests();
        const s = board([kind], [blocker]);
        const want = defendersBest(s, [kind], 1);
        const got = __combatDamageForTests(s, "user", ["a0"]);
        if (got.lower !== want || got.over !== want) wrong.push(`${kind} vs ${blocker}: lower ${got.lower}, over ${got.over}, engine ${want}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("⭐ on 60 random boards (1–3 attackers, 1–3 blockers) the lethal side never exceeds the defender's best block — gang blocks and every declaration order included", () => {
    const above = [];
    let exact = 0;
    for (const { kinds, blockerKinds } of randomBoards(20261020, 60, Object.keys(ATTACKERS))) {
      _resetIdsForTests();
      const s = board(kinds, blockerKinds);
      const want = defendersBest(s, kinds, blockerKinds.length);
      const { lower } = __combatDamageForTests(s, "user", kinds.map((_, i) => `a${i}`));
      if (lower > want) above.push(`${kinds} into ${blockerKinds}: ${lower} > ${want}`);
      if (lower === want) exact++;
    }
    expect({ above, mostlyExact: exact >= 54 }).toEqual({ above: [], mostlyExact: true });
  });

  it("⭐ a first-strike gang kill: two Halberdiers blocking Knuckles the Echidna kill it in the first-strike step, so nothing more tramples over — the lethal side reads 0, as the engine deals (one Halberdier alone lets 3 through)", () => {
    const two = board(["knuckles"], ["halberdier", "halberdier"]);
    const one = board(["knuckles"], ["halberdier"]);
    expect([__combatDamageForTests(two, "user", ["a0"]).lower, defendersBest(two, ["knuckles"], 2), __combatDamageForTests(one, "user", ["a0"]).lower, defendersBest(one, ["knuckles"], 1)])
      .toEqual([0, 0, 3, 3]);
  });

  it("⭐ on 60 random boards where every blocker can block every attacker, the crack-back side never falls below the defender's best block", () => {
    const below = [];
    for (const { kinds, blockerKinds } of randomBoards(20261021, 60, Object.keys(ATTACKERS).filter(canBlock))) {
      _resetIdsForTests();
      const s = board(kinds, blockerKinds);
      const want = defendersBest(s, kinds, blockerKinds.length);
      const { over } = __combatDamageForTests(s, "user", kinds.map((_, i) => `a${i}`));
      if (over < want) below.push(`${kinds} into ${blockerKinds}: ${over} < ${want}`);
    }
    expect(below).toEqual([]);
  });

  it("⭐ without trample or double strike both sides read exactly as before (policy combatDamage v1) — 200 random boards, menace included", () => {
    const next = rng(20261022);
    const pick = (xs) => xs[Math.floor(next() * xs.length)];
    const plain = [BEARS, GIANT, HALBERDIER, RATS, BRUTE, PREDATOR, WURM];
    const differ = [];
    for (let n = 0; n < 200; n++) {
      _resetIdsForTests();
      const ai = Array.from({ length: 1 + Math.floor(next() * 5) }, (_, i) => P(`a${i}`, pick(plain), "ai"));
      const user = Array.from({ length: Math.floor(next() * 5) }, (_, j) => P(`b${j}`, pick(Object.values(BLOCKERS)), "user"));
      const s = game({ boards: { ai, user } });
      const ids = ai.map((p) => p.id);
      const now = __combatDamageForTests(s, "user", ids);
      const old = __combatDamageForTests(s, "user", ids, { combatDamage: "v1" });
      if (now.lower !== old.lower || now.over !== old.lower) differ.push(`${ai.map((p) => p.card.name)} into ${user.map((p) => p.card.name)}`);
    }
    expect(differ).toEqual([]);
  });
});

describe("the policy seam", () => {
  it("⭐ `combatDamage` and `walkerTrade` are POLICY_KEYS subsystems", () => {
    expect(POLICY_KEYS).toEqual(expect.arrayContaining(["combatDamage", "walkerTrade"]));
  });

  it("control — policy combatDamage v1 reads the old damage: Dreadmaw and the Bears into the Hill Giant at 5 send Dreadmaw only", () => {
    const s = game({ life: { user: 5 }, boards: { ai: [P("dreadmaw", DREADMAW, "ai"), P("bears", BEARS, "ai")], user: [P("giant", GIANT, "user")] } });
    expect(planned(s, "ai", { policy: { combatDamage: "v1" } })).toEqual(["dreadmaw"]);
  });

  it("control — policy walkerTrade v1 keeps the old gate: the two Zombies beside the Typhoid Rats go face, not at Jace", () => {
    const s = game({ boards: { ai: many(2, "z", ZOMBIE, "ai"), user: [P("rats", RATS, "user"), walker("jace", JACE, "user", 2)] } });
    expect(planOf(s, "ai", { policy: { walkerTrade: "v1" } })).toEqual({ z1: "user", z2: "user" });
  });
});
