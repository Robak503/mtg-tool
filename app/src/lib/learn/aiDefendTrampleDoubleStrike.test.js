/**
 * aiDefendTrampleDoubleStrike.test.js — the default AI, DEFENDING, reads trample and double strike when it decides whether it is
 * dead this combat: the chump stage of its block plan and its fog timing (AI decision quality; the engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 702.19b (an attacking creature with trample assigns lethal damage to its blockers first, and
 * the excess to the player it attacks), CR 702.19d (blocked, with no blocker left, all of it), CR 702.2c (1 is lethal damage
 * from a deathtouch source), CR 702.4b / 510.4 (a double striker deals first-strike and regular combat damage), CR 702.12b (an
 * indestructible creature isn't destroyed by lethal damage), CR 509.1h / 510.1c (a blocked creature without trample deals no
 * damage to the player), CR 615 (Fog prevents the combat damage).
 *
 * Before this fix `opponentAI.unblockedIncomingFace` (the fog timing) and the chump stage of `pickBlockers` added each unblocked
 * attacker's power once and counted a blocked attacker as stopped: a chump-blocked Colossal Dreadmaw "dealt nothing", a chump on
 * it "saved 6", and a Wrecking Ogre (double strike) "dealt 3" — so the AI chumped the trampler and died to the rest, let the
 * double striker through at a life it kills, and held its Fog while a blocked trampler trampled over for the kill.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { pickAction, pickBlockPlan, POLICY_KEYS, __incomingFaceDamageForTests, __combatDamageForTests } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #10474
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // EDHREC #29123
const MYSTIC = {"name":"Elvish Mystic","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // EDHREC #102
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const OGRE = {"name":"Wrecking Ogre","type":"Creature — Ogre Warrior","mana":"{4}{R}","cmc":5,"power":"3","toughness":"3","keywords":["Bloodrush","Double strike"],"colors":["R"],"oracle":"Double strike\nBloodrush — {3}{R}{R}, Discard this card: Target attacking creature gets +3/+3 and gains double strike until end of turn."}; // EDHREC #22809
const FOG = {"name":"Fog","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Prevent all combat damage that would be dealt this turn."}; // EDHREC #655
const COLOSSUS = {"name":"Darksteel Colossus","type":"Artifact Creature — Golem","mana":"{11}","cmc":11,"power":"11","toughness":"11","keywords":["Indestructible","Trample"],"colors":[],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead."}; // EDHREC #2383
const THORN = {"name":"Thorn Elemental","type":"Creature — Elemental","mana":"{5}{G}{G}","cmc":7,"power":"7","toughness":"7","keywords":[],"colors":["G"],"oracle":"You may have this creature assign its combat damage as though it weren't blocked."}; // EDHREC #18883
const HALBERDIER = {"name":"Halberdier","type":"Creature — Human Barbarian","mana":"{3}{R}","cmc":4,"power":"3","toughness":"1","keywords":["First strike"],"colors":["R"],"oracle":"First strike"}; // EDHREC #30343
const RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // EDHREC #5683
const VINDICATOR = {"name":"Swiftblade Vindicator","type":"Creature — Human Soldier","mana":"{R}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Vigilance","Trample","Double strike"],"colors":["R","W"],"oracle":"Double strike (This creature deals both first-strike and regular combat damage.)\nVigilance (Attacking doesn't cause this creature to tap.)\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #7319
const MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // EDHREC #6697
const GLISSA = {"name":"Glissa Sunslayer","type":"Legendary Creature — Phyrexian Zombie Elf","mana":"{1}{B}{G}","cmc":3,"power":"3","toughness":"3","keywords":["First strike","Deathtouch"],"colors":["B","G"],"oracle":"First strike, deathtouch\nWhenever Glissa Sunslayer deals combat damage to a player, choose one —\n• You draw a card and lose 1 life.\n• Destroy target enchantment.\n• Remove up to three counters from target permanent."}; // EDHREC #1375
const MASTODON = {"name":"Siege Mastodon","type":"Creature — Elephant","mana":"{4}{W}","cmc":5,"power":"3","toughness":"5","keywords":[],"colors":["W"],"oracle":""}; // EDHREC #29682
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

/**
 * The user's declare blockers step, attacking the AI with `attackers` (user permanents, all at its face); `aiBoard` the AI's
 * permanents, `blocks` [blockerId, attackerId] already declared, the AI at `aiLife` holding `hand` with `mana` floating.
 */
function defending({ aiLife, attackers, aiBoard = [], blocks = [], hand = [], mana = {} }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    user: { ...s0.players.user, battlefield: attackers, hand: [], library: [], graveyard: [], life: 40 },
    ai: { ...s0.players.ai, battlefield: aiBoard, hand, library: [], graveyard: [], life: aiLife, manaPool: { ...s0.players.ai.manaPool, ...mana } },
  };
  return {
    ...s0, players, turn: 5, activePlayer: "user", priorityHolder: "ai", consecutivePasses: 0, phase: "combat", step: "declare-blockers",
    combat: {
      attackers: attackers.filter((p) => p.card.power != null).map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })),
      blockers: blocks.map(([b, a]) => ({ blockerId: b, blockingPlayer: "ai", attackerId: a })),
    },
  };
}

/** The AI's block plan for the offered blocks: [blockerId, attackerId] pairs. */
const blockPlan = (s, opts = {}) => pickBlockPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-blocker"), opts)
  .map((a) => [a.permanentId, a.attackerId]);
/** The blocks as the engine's driver declares them (one pickAction per tick), then both combat damage steps: { blocks, aiLife }. */
function blockAndTakeDamage(s) {
  for (let tick = 0; tick < 20; tick++) {
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    if (pick?.kind !== "declare-blocker") break;
    s = dispatchAction(s, pick);
  }
  const blocks = s.combat.blockers.map((b) => [b.blockerId, b.attackerId]);
  s = resolveCombatDamage({ ...s, step: "combat-damage" }, { firstStrikeStep: true });
  s = resolveCombatDamage(s, { firstStrikeStep: false });
  return { blocks, aiLife: s.players.ai.life };
}

describe("the chump stage reads trample", () => {
  // The AI at 8 against Colossal Dreadmaw (6/6 trample) and a Hill Giant (3/3) with one Elvish Mystic: 9 incoming.
  const twoAttackers = (aiLife) => defending({ aiLife, attackers: [P("dreadmaw", DREADMAW, "user"), P("giant", GIANT, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });

  it("⭐ the Mystic chumps the Hill Giant, not Dreadmaw — on Dreadmaw it keeps off only 1 (5 tramples over beside the Giant's 3 = 8, lethal at 8); on the Giant it keeps off 3", () => {
    expect(blockPlan(twoAttackers(8))).toEqual([["mystic", "giant"]]);
  });

  it("⭐ through the engine: the AI declares that block and survives the combat at 2 (base: it chumped Dreadmaw and died at 0)", () => {
    expect(blockAndTakeDamage(twoAttackers(8))).toEqual({ blocks: [["mystic", "giant"]], aiLife: 2 });
  });

  it("⭐ three attackers (Dreadmaw, the Giant and Grizzly Bears: 11 at 10): the Mystic chumps the Giant — it keeps off 3 there, 2 on the Bears, 1 on Dreadmaw", () => {
    // A chump on the Giant or the Bears ends the lethal pressure alone; the one that keeps off the most is taken.
    const s = defending({ aiLife: 10, attackers: [P("dreadmaw", DREADMAW, "user"), P("giant", GIANT, "user"), P("bears", BEARS, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockPlan(s)).toEqual([["mystic", "giant"]]);
  });

  it("⭐ a chump that alone ends the lethal pressure comes first: two Dreadmaws at 9 against an Elvish Mystic and a Siege Mastodon — the Mastodon keeps 5 off one, enough; the Mystic stays home (base: the Mystic chumped one, keeping 1 off, and the AI died)", () => {
    const s = defending({ aiLife: 9, attackers: [P("d1", DREADMAW, "user"), P("d2", DREADMAW, "user")], aiBoard: [P("mystic", MYSTIC, "ai"), P("mastodon", MASTODON, "ai")] });
    expect(blockAndTakeDamage(s)).toEqual({ blocks: [["mastodon", "d1"]], aiLife: 2 });
  });

  it("control — a chump that saves the game is still made: Dreadmaw alone at 6, the Mystic keeps 1 off (5 < 6)", () => {
    const s = defending({ aiLife: 6, attackers: [P("dreadmaw", DREADMAW, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockAndTakeDamage(s)).toEqual({ blocks: [["mystic", "dreadmaw"]], aiLife: 1 });
  });

  it("control — a chump on a plain attacker under lethal pressure is still made: a Hill Giant at 3 and the Mystic", () => {
    const s = defending({ aiLife: 3, attackers: [P("giant", GIANT, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockPlan(s)).toEqual([["mystic", "giant"]]);
  });

  it("control — no lethal pressure, no chump: Dreadmaw and the Giant at 10 (9 incoming)", () => {
    expect(blockPlan(twoAttackers(10))).toEqual([]);
  });
});

describe("the chump stage reads double strike", () => {
  it("⭐ a Wrecking Ogre (3/3 double strike) deals 6: at 5 the Mystic chumps it, and the AI survives at 5", () => {
    const s = defending({ aiLife: 5, attackers: [P("ogre", OGRE, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockAndTakeDamage(s)).toEqual({ blocks: [["mystic", "ogre"]], aiLife: 5 });
  });

  it("control — at 7 the Ogre's 6 isn't lethal: no chump", () => {
    const s = defending({ aiLife: 7, attackers: [P("ogre", OGRE, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockPlan(s)).toEqual([]);
  });

  it("⭐ the double striker is the one worth chumping: the Ogre (6) and a Hill Giant (3) at 7 — the Mystic on the Ogre leaves 3; on the Giant it would leave 6", () => {
    const s = defending({ aiLife: 7, attackers: [P("giant", GIANT, "user"), P("ogre", OGRE, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockAndTakeDamage(s)).toEqual({ blocks: [["mystic", "ogre"]], aiLife: 4 });
  });
});

describe("the fog timing reads trample and double strike", () => {
  const fogHand = [{ ...FOG, id: "fog1" }];
  const cast = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });

  it("⭐ an unblocked Wrecking Ogre at 5: Fog is cast (6 incoming)", () => {
    const s = defending({ aiLife: 5, attackers: [P("ogre", OGRE, "user")], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)).toMatchObject({ kind: "cast-spell", cardId: "fog1" });
  });

  it("⭐ Colossal Dreadmaw blocked by Grizzly Bears at 4: Fog is cast — 4 tramples over", () => {
    const s = defending({ aiLife: 4, attackers: [P("dreadmaw", DREADMAW, "user")], aiBoard: [P("bears", BEARS, "ai")], blocks: [["bears", "dreadmaw"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)).toMatchObject({ kind: "cast-spell", cardId: "fog1" });
  });

  it("⭐ an indestructible trampler survives a first-strike deathtouch blocker (CR 702.12b): Darksteel Colossus blocked by Glissa Sunslayer at 8 — Fog is cast, 8 tramples over", () => {
    const s = defending({ aiLife: 8, attackers: [P("colossus", COLOSSUS, "user")], aiBoard: [P("glissa", GLISSA, "ai")], blocks: [["glissa", "colossus"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)).toMatchObject({ kind: "cast-spell", cardId: "fog1" });
  });

  it("⭐ the damage already marked on a blocker counts (combatResolution's lethal need): Dreadmaw blocked by a Craw Wurm (6/4) with 3 damage marked at 5 — Fog is cast, 5 tramples over", () => {
    const s = defending({ aiLife: 5, attackers: [P("dreadmaw", DREADMAW, "user")], aiBoard: [P("wurm", WURM, "ai", { damageMarked: 3 })], blocks: [["wurm", "dreadmaw"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)).toMatchObject({ kind: "cast-spell", cardId: "fog1" });
  });

  it("control — the same Wurm unhurt at 5: Fog is held (it keeps 4 off, 2 trample over)", () => {
    const s = defending({ aiLife: 5, attackers: [P("dreadmaw", DREADMAW, "user")], aiBoard: [P("wurm", WURM, "ai")], blocks: [["wurm", "dreadmaw"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)?.kind).toBe("pass-priority");
  });

  it("control — the same blocked Dreadmaw at 5: Fog is held", () => {
    const s = defending({ aiLife: 5, attackers: [P("dreadmaw", DREADMAW, "user")], aiBoard: [P("bears", BEARS, "ai")], blocks: [["bears", "dreadmaw"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)?.kind).toBe("pass-priority");
  });

  it("control — a blocked Hill Giant (no trample) at 1: Fog is held — nothing reaches the AI", () => {
    const s = defending({ aiLife: 1, attackers: [P("giant", GIANT, "user")], aiBoard: [P("bears", BEARS, "ai")], blocks: [["bears", "giant"]], hand: fogHand, mana: { G: 1 } });
    expect(cast(s)?.kind).toBe("pass-priority");
  });
});

describe("the defender's reading, pinned against the engine's own combat damage", () => {
  const ATTACKERS = { dreadmaw: DREADMAW, giant: GIANT, ogre: OGRE, colossus: COLOSSUS, thorn: THORN, vindicator: VINDICATOR, rats: RATS, halberdier: HALBERDIER, wurm: WURM };
  const BLOCKERS = { mystic: MYSTIC, bears: BEARS, halberdier: HALBERDIER, rats: RATS, myr: MYR, giant: GIANT, wurm: WURM, glissa: GLISSA };
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  it("⭐ the shared trample reading (the racer's lethal and crack-back sides): Darksteel Colossus into a lone Glissa Sunslayer connects for 8, as the engine deals — indestructible, it survives her first-strike deathtouch damage (CR 702.12b)", () => {
    const s = defending({ aiLife: 40, attackers: [P("colossus", COLOSSUS, "user")], aiBoard: [P("glissa", GLISSA, "ai")], blocks: [["glissa", "colossus"]] });
    let t = resolveCombatDamage({ ...s, step: "combat-damage" }, { firstStrikeStep: true });
    t = resolveCombatDamage(t, { firstStrikeStep: false });
    expect([__combatDamageForTests(s, "ai", ["colossus"]), 40 - t.players.ai.life]).toEqual([{ lower: 8, over: 8 }, 8]);
  });

  it("⭐ on 300 random declared blocks (1–3 attackers, 0–3 blockers, each blocking one attacker or none, any order) the reading never understates the damage the engine deals, and is exact whenever no attacker has two blockers", () => {
    const next = rng(20261020);
    const pick = (xs) => xs[Math.floor(next() * xs.length)];
    const below = [];
    let single = 0;
    let exact = 0;
    for (let n = 0; n < 300; n++) {
      _resetIdsForTests();
      const attackers = Array.from({ length: 1 + Math.floor(next() * 3) }, (_, i) => P(`a${i}`, ATTACKERS[pick(Object.keys(ATTACKERS))], "user"));
      const aiBoard = Array.from({ length: Math.floor(next() * 4) }, (_, j) => P(`b${j}`, BLOCKERS[pick(Object.keys(BLOCKERS))], "ai"));
      const blocks = aiBoard.map((b) => [b.id, Math.floor(next() * (attackers.length + 1)) - 1]).filter(([, a]) => a >= 0).map(([b, a]) => [b, `a${a}`]);
      const s = defending({ aiLife: 40, attackers, aiBoard, blocks });
      const read = __incomingFaceDamageForTests(s, "ai");
      let t = resolveCombatDamage({ ...s, step: "combat-damage" }, { firstStrikeStep: true });
      t = resolveCombatDamage(t, { firstStrikeStep: false });
      const dealt = 40 - t.players.ai.life;
      const label = `${attackers.map((p) => p.card.name)} | ${blocks.map(([b, a]) => `${aiBoard.find((p) => p.id === b).card.name}→${a}`)}`;
      if (read < dealt) below.push(`${label}: read ${read} < engine ${dealt}`);
      const counts = blocks.reduce((m, [, a]) => m.set(a, (m.get(a) || 0) + 1), new Map());
      if ([...counts.values()].every((c) => c <= 1)) {
        single++;
        if (read === dealt) exact++;
      }
    }
    expect({ below, allSingleExact: exact === single, singles: single > 150 }).toEqual({ below: [], allSingleExact: true, singles: true });
  });

  it("⭐ without trample or double strike the reading is the old one (policy defendDamage v1): 200 random declared blocks", () => {
    const next = rng(20261023);
    const pick = (xs) => xs[Math.floor(next() * xs.length)];
    const plain = { giant: GIANT, rats: RATS, halberdier: HALBERDIER, wurm: WURM, bears: BEARS };
    const differ = [];
    for (let n = 0; n < 200; n++) {
      _resetIdsForTests();
      const attackers = Array.from({ length: 1 + Math.floor(next() * 3) }, (_, i) => P(`a${i}`, plain[pick(Object.keys(plain))], "user"));
      const aiBoard = Array.from({ length: Math.floor(next() * 4) }, (_, j) => P(`b${j}`, BLOCKERS[pick(Object.keys(BLOCKERS))], "ai"));
      const blocks = aiBoard.map((b) => [b.id, Math.floor(next() * (attackers.length + 1)) - 1]).filter(([, a]) => a >= 0).map(([b, a]) => [b, `a${a}`]);
      const s = defending({ aiLife: 40, attackers, aiBoard, blocks });
      if (__incomingFaceDamageForTests(s, "ai") !== __incomingFaceDamageForTests(s, "ai", { defendDamage: "v1" })) differ.push(attackers.map((p) => p.card.name).join(","));
    }
    expect(differ).toEqual([]);
  });
});

describe("the policy seam", () => {
  it("⭐ `defendDamage` is a POLICY_KEYS subsystem", () => {
    expect(POLICY_KEYS).toContain("defendDamage");
  });

  it("control — policy defendDamage v1 keeps the old chump: the Mystic on Dreadmaw (the biggest attacker)", () => {
    const s = defending({ aiLife: 8, attackers: [P("dreadmaw", DREADMAW, "user"), P("giant", GIANT, "user")], aiBoard: [P("mystic", MYSTIC, "ai")] });
    expect(blockPlan(s, { policy: { defendDamage: "v1" } })).toEqual([["mystic", "dreadmaw"]]);
  });
});
