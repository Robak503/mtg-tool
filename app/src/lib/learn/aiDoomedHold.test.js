/**
 * aiDoomedHold.test.js — the default AI's crack-back guard holds a group home only when holding it can save the seat (AI decision
 * quality; the engine's rules are unchanged).
 *
 * The guard (opponentAI.outnumberingAttackers): the racer never sends a group whose absence makes the opponents' next attack
 * lethal. But when one opponent's next attack is lethal however the seat blocks with every creature it has untapped — the group
 * included — holding the group saves nothing: it only gives up the damage the group would deal. The rules the reading sits on:
 * CR 509.1a (each creature blocks one attacker), CR 702.19b (a trampler assigns lethal damage to each of its blockers first), CR
 * 702.2c (1 is lethal damage from a deathtouch source), CR 702.4b (double strike), CR 702.111b (menace), Thorn Elemental (its text
 * sets CR 510.1c aside: it may assign its damage as though it weren't blocked), CR 702.15b (lifelink gains the damage dealt), CR 508.1h (an attack
 * tax: Ghostly Prison), CR 514.2 and 502.3 (the board the next attack finds).
 *
 * Before this fix the guard held a group even when the seat died whatever it held (A/B game 10 at 7f82b51e: the Squirrel Girl
 * seat at 15 kept its Squirrels home against eight tramplers with 48 power, and died next turn).
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim; the token objects add the
 * engine's `token: true` flag (a token is no card, CR 111.1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { pickAction, pickAttackPlan, POLICY_KEYS, __crackBackFloorForTests } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #10474
const RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // EDHREC #5683
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const ZOMBIE = {"name":"Zombie","type":"Token Creature — Zombie","power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"","token":true};
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"}; // EDHREC #1752
const PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #161
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #29123
const OGRE = {"name":"Wrecking Ogre","type":"Creature — Ogre Warrior","mana":"{4}{R}","cmc":5,"power":"3","toughness":"3","keywords":["Bloodrush","Double strike"],"colors":["R"],"oracle":"Double strike\nBloodrush — {3}{R}{R}, Discard this card: Target attacking creature gets +3/+3 and gains double strike until end of turn."}; // EDHREC #22809
const COLOSSUS = {"name":"Darksteel Colossus","type":"Artifact Creature — Golem","mana":"{11}","cmc":11,"power":"11","toughness":"11","keywords":["Indestructible","Trample"],"colors":[],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead."}; // EDHREC #2383
const THORN = {"name":"Thorn Elemental","type":"Creature — Elemental","mana":"{5}{G}{G}","cmc":7,"power":"7","toughness":"7","keywords":[],"colors":["G"],"oracle":"You may have this creature assign its combat damage as though it weren't blocked."}; // EDHREC #18883
const VINDICATOR = {"name":"Swiftblade Vindicator","type":"Creature — Human Soldier","mana":"{R}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Vigilance","Trample","Double strike"],"colors":["R","W"],"oracle":"Double strike (This creature deals both first-strike and regular combat damage.)\nVigilance (Attacking doesn't cause this creature to tap.)\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #7319
const HALBERDIER = {"name":"Halberdier","type":"Creature — Human Barbarian","mana":"{3}{R}","cmc":4,"power":"3","toughness":"1","keywords":["First strike"],"colors":["R"],"oracle":"First strike"}; // EDHREC #30343
const BRUTE = {"name":"Boggart Brute","type":"Creature — Goblin Warrior","mana":"{2}{R}","cmc":3,"power":"3","toughness":"2","keywords":["Menace"],"colors":["R"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)"}; // EDHREC #18929
const CAVALRY = {"name":"Skyspear Cavalry","type":"Creature — Human Soldier","mana":"{3}{W}{W}","cmc":5,"power":"2","toughness":"2","keywords":["Flying","Double strike"],"colors":["W"],"oracle":"Flying\nDouble strike (This creature deals both first-strike and regular combat damage.)"}; // EDHREC #26836
const KNUCKLES = {"name":"Knuckles the Echidna","type":"Legendary Creature — Echidna Warrior","mana":"{2}{R}{R}","cmc":4,"power":"2","toughness":"4","keywords":["Treasure Hunter","Treasure","Haste","Trample","Double strike"],"colors":["R"],"oracle":"Double strike, trample, haste\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nTreasure Hunter — At the beginning of your upkeep, if you control thirty or more artifacts, you win the game."}; // EDHREC #1843
const MYSTIC = {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // EDHREC #102
const MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // EDHREC #6697
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387
const GLISSA = {"name":"Glissa Sunslayer","type":"Legendary Creature — Phyrexian Zombie Elf","mana":"{1}{B}{G}","cmc":3,"power":"3","toughness":"3","keywords":["First strike","Deathtouch"],"colors":["B","G"],"oracle":"First strike, deathtouch\nWhenever Glissa Sunslayer deals combat damage to a player, choose one —\n• You draw a card and lose 1 life.\n• Destroy target enchantment.\n• Remove up to three counters from target permanent."}; // EDHREC #1375

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

/** The AI's declare attackers step in a two-player game; `boards` maps seat → permanents, `life` seat → life (default 40). */
function game({ boards = {}, life = {} }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life: life[pid] ?? 40 };
  }
  return { ...s0, players, turn: 5, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
}
const attacks = (s) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker");
const planned = (s, opts = {}) => pickAttackPlan(s, "ai", attacks(s), opts).map((a) => a.permanentId).sort();
function declareAll(s) {
  for (let tick = 0; tick < 30; tick++) {
    const offered = legalActionsForPlayer(s, "ai");
    if (!offered.some((a) => a.kind === "declare-attacker")) break;
    const pick = pickAction(s, "ai", offered);
    if (pick?.kind !== "declare-attacker") break;
    s = dispatchAction(s, pick);
  }
  return (s.combat?.attackers || []).filter((a) => a.attackingPlayer === "ai").map((a) => a.permanentId).sort();
}

// Two Zombie tokens into a lone Typhoid Rats go as a group (aiRacerDeathtouchTrade.test.js); a summoning-sick blocker stays
// home. The user's two Colossal Dreadmaws are tapped: they untap for its next attack. That attack — the Rats and both
// Dreadmaws, 13 — meets the AI's three 2/2s: each keeps off at most 2 (a Dreadmaw's lethal damage to it, or the Rats' 1), so
// at least 7 reaches the AI however it blocks (two on one Dreadmaw, one on the other: exactly 7).
const doomBoard = (aiLife, home = BEARS, extra = []) => game({ life: { ai: aiLife }, boards: {
  ai: [P("z1", ZOMBIE, "ai"), P("z2", ZOMBIE, "ai"), P("home", home, "ai", { summoningSick: true }), ...extra],
  user: [P("rats", RATS, "user"), P("d1", DREADMAW, "user", { tapped: true }), P("d2", DREADMAW, "user", { tapped: true })],
} });

describe("the crack-back guard holds a group only when holding it can save the seat", () => {
  it("⭐ the AI at 7 is dead to the crack-back whatever it holds (at least 7 tramples through three 2/2s): the Zombies attack", () => {
    expect(planned(doomBoard(7))).toEqual(["z1", "z2"]);
  });

  it("⭐ the same board through the engine's one-attacker-a-tick declaration: both Zombies are declared", () => {
    expect(declareAll(doomBoard(7))).toEqual(["z1", "z2"]);
  });

  it("⭐ the reading: the user's floor is 7 and the seat is doomed at 7", () => {
    expect(__crackBackFloorForTests(doomBoard(7), "ai")).toEqual({ doomed: true, floors: { user: 7 } });
  });

  it("control — at 8 holding saves it (all three home, it survives at 1): the Zombies stay home", () => {
    expect(planned(doomBoard(8))).toEqual([]);
  });

  // The Nighthawk board: blocking a Dreadmaw the Nighthawk keeps 3 off and gains 2, so the floor 6 is below 5 + 2.
  const lifelinkBoard = () => doomBoard(5, NIGHTHAWK);
  const prisonBoard = () => doomBoard(7, BEARS, [P("prison", PRISON, "ai")]);
  const stunnedBoard = () => {
    const s = doomBoard(7);
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "d2" ? { ...p, counters: { ...(p.counters || {}), stun: 1 } } : p)) } } };
  };

  it("control — lifelink is counted: with a summoning-sick Vampire Nighthawk home instead of the Bears, the AI at 5 holds (blocking, the Nighthawk gains 2)", () => {
    expect(planned(lifelinkBoard())).toEqual([]);
  });

  it("control — no judgment under an attack tax (CR 508.1h): with Ghostly Prison on the AI's battlefield the AI at 7 holds", () => {
    expect(planned(prisonBoard())).toEqual([]);
  });

  it("control — a creature still tapped after its controller's untap step can't attack: with a stun counter on one Dreadmaw the AI at 7 holds", () => {
    expect(planned(stunnedBoard())).toEqual([]);
  });

  it("⭐ the readings behind those controls: the Nighthawk board's floor is 6 (not doomed at 5 + 2), the Prison board is no judgment, the stunned Dreadmaw stays home (floor 1)", () => {
    expect([__crackBackFloorForTests(lifelinkBoard(), "ai"), __crackBackFloorForTests(prisonBoard(), "ai").doomed, __crackBackFloorForTests(stunnedBoard(), "ai")])
      .toEqual([{ doomed: false, floors: { user: 6 } }, false, { doomed: false, floors: { user: 1 } }]);
  });
});

describe("the floor never exceeds the damage of the defender's best block — pinned against the engine's own combat damage", () => {
  const ATTACKERS = { dreadmaw: DREADMAW, giant: GIANT, ogre: OGRE, colossus: COLOSSUS, thorn: THORN, vindicator: VINDICATOR, rats: RATS, halberdier: HALBERDIER, brute: BRUTE, cavalry: CAVALRY, knuckles: KNUCKLES, nighthawk: NIGHTHAWK };
  const BLOCKERS = { mystic: MYSTIC, bears: BEARS, halberdier: HALBERDIER, rats: RATS, myr: MYR, giant: GIANT, wurm: WURM, glissa: GLISSA, nighthawk: NIGHTHAWK, zombie: ZOMBIE };
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
  /** The user's creatures attacking the AI: the least life the AI ends below its start over every legal block in every order (CR 509.1a, 702.111b). */
  function defendersBest(s, attackerIds, blockerIds) {
    const choice = new Array(blockerIds.length).fill(-1);
    let best = Infinity;
    const walk = (j) => {
      if (j === blockerIds.length) {
        const blocks = choice.map((a, b) => [blockerIds[b], a]).filter(([, a]) => a >= 0).map(([b, a]) => [b, attackerIds[a]]);
        for (const id of attackerIds) {
          const n = blocks.filter(([, a]) => a === id).length;
          if (n === 1 && s.players.user.battlefield.find((p) => p.id === id).card.name === "Boggart Brute") return; // menace: one blocker is no legal block
        }
        for (const order of permutations(blocks)) {
          const lifeAfter = () => {
            let t = { ...s, activePlayer: "user", step: "combat-damage", combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: order.map(([b, a]) => ({ blockerId: b, blockingPlayer: "ai", attackerId: a })) } };
            t = resolveCombatDamage(t, { firstStrikeStep: true });
            t = resolveCombatDamage(t, { firstStrikeStep: false });
            return t.players.ai.life;
          };
          best = Math.min(best, 40 - lifeAfter());
        }
        return;
      }
      for (let a = -1; a < attackerIds.length; a++) {
        if (a >= 0 && !canBlockAttacker(s, blockerIds[j], attackerIds[a], "ai")) continue;
        choice[j] = a;
        walk(j + 1);
      }
    };
    walk(0);
    return best;
  }

  it("⭐ 150 random boards (1–3 attackers, 1–3 blockers; menace, flying, first strike, deathtouch, lifelink, double strike, trample, indestructible, Thorn Elemental): the floor is never above the engine's best block for the defender (net of the lifelink it gains), and exact on most", () => {
    const next = rng(20261024);
    const pick = (xs) => xs[Math.floor(next() * xs.length)];
    const above = [];
    let exact = 0;
    // One of each legendary card a side (two would be a legend-rule board — CR 704.5j — which the floor's projection of the
    // next turn settles and this enumeration would not).
    const side = (count, pool, prefix, controller) => {
      const out = [];
      while (out.length < count) {
        const card = pool[pick(Object.keys(pool))];
        if (/Legendary/.test(card.type) && out.some((p) => p.card.name === card.name)) continue;
        out.push(P(`${prefix}${out.length}`, card, controller));
      }
      return out;
    };
    for (let n = 0; n < 150; n++) {
      _resetIdsForTests();
      const user = side(1 + Math.floor(next() * 3), ATTACKERS, "a", "user");
      const ai = side(1 + Math.floor(next() * 3), BLOCKERS, "b", "ai");
      const s = game({ boards: { ai, user } });
      const { floors } = __crackBackFloorForTests(s, "ai");
      const best = defendersBest(s, user.map((p) => p.id), ai.map((p) => p.id));
      const gain = ai.filter((p) => p.card.name === "Vampire Nighthawk").length * 2;
      if (floors.user - gain > best) above.push(`${user.map((p) => p.card.name)} into ${ai.map((p) => p.card.name)}: floor ${floors.user} (lifelink ≤ ${gain}) > ${best}`);
      if (floors.user === best) exact++;
    }
    expect({ above, mostlyExact: exact >= 90 }).toEqual({ above: [], mostlyExact: true });
  });
});

describe("the policy seam", () => {
  it("⭐ `doomedHold` is a POLICY_KEYS subsystem", () => {
    expect(POLICY_KEYS).toContain("doomedHold");
  });

  it("control — policy doomedHold v1 keeps the hold: the doomed board at 7 sends nothing", () => {
    expect(planned(doomBoard(7), { policy: { doomedHold: "v1" } })).toEqual([]);
  });
});
