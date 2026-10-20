/**
 * aiPumpCostAttackers.test.js — the default AI's precombat pump reads the swing the pump is cast into (AI decision quality; the
 * engine's rules are unchanged).
 *
 * The rules the choice sits on: CR 601.2g–h (a spell's total cost is paid as it is cast — mana abilities are activated then, so a
 * creature tapped for mana is tapped before combat), CR 508.1a (only an untapped creature can be declared as an attacker), CR
 * 702.19b (trample: lethal damage to the blockers first, the rest to the player) and CR 702.4b (double strike: first-strike and
 * regular combat damage).
 *
 * Before this fix the pump readers (`opponentAI.teamPumpFlipsLethal`, `singlePumpFlipsLethal`) counted as attackers the creatures
 * the pump's own payment taps, and read a blocked attacker as dealing nothing and a double striker as dealing its power once. In an
 * 80-game A/B batch (the AI damage-reading slice, 7f82b51e) the AI cast Tyvar's Stand at X=7 on Thrun, counting Birds of Paradise
 * and Fanatic of Rhonas as attackers though paying X tapped them, so Thrun swung alone and fell 1 short. The fix reads the
 * attackers on the board the cast's own costs leave (the dispatcher's payment plan, `legalChoices.offeredPaymentPlan`) and the
 * damage the racer reads (trample and double strike counted, never above the defender's best block).
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle_cards.json), copied verbatim. The lands are listed first
 * on each battlefield (they were played first), the order the payment plan reads its sources in.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer, offeredPaymentPlan } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction, POLICY_KEYS, __combatDamageForTests } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const TYVAR = {"name":"Tyvar's Stand","type":"Instant","mana":"{X}{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn. (It can't be the target of spells or abilities your opponents control. Damage and effects that say \"destroy\" don't destroy it.)"}; // EDHREC #722
const THRUN = {"name":"Thrun, Breaker of Silence","type":"Legendary Creature — Troll Shaman","mana":"{3}{G}{G}","cmc":5,"power":"5","toughness":"5","keywords":["Trample"],"colors":["G"],"oracle":"This spell can't be countered.\nTrample\nThrun can't be the target of nongreen spells your opponents control or abilities from nongreen sources your opponents control.\nDuring your turn, Thrun has indestructible."}; // EDHREC #9025
const BIRDS = {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","cmc":1,"power":"0","toughness":"1","keywords":["Flying"],"colors":["G"],"oracle":"Flying\n{T}: Add one mana of any color."}; // EDHREC #35
const FANATIC = {"name":"Fanatic of Rhonas","type":"Creature — Snake Druid","mana":"{1}{G}","cmc":2,"power":"1","toughness":"4","keywords":["Ferocious","Eternalize"],"colors":["G"],"oracle":"{T}: Add {G}.\nFerocious — {T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.\nEternalize {2}{G}{G} ({2}{G}{G}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Snake Druid with no mana cost. Eternalize only as a sorcery.)"}; // EDHREC #407
const DRUID = {"name":"Paradise Druid","type":"Creature — Elf Druid","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["G"],"oracle":"This creature has hexproof as long as it's untapped. (It can't be the target of spells or abilities your opponents control.)\n{T}: Add one mana of any color."}; // EDHREC #2089
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // EDHREC #58
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // EDHREC #3304
const OVERRUN = {"name":"Overrun","type":"Sorcery","mana":"{2}{G}{G}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"Creatures you control get +3/+3 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #1704
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"}; // EDHREC #10474
const ACE = {"name":"Fencing Ace","type":"Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Double strike"],"colors":["W"],"oracle":"Double strike (This creature deals both first-strike and regular combat damage.)"}; // EDHREC #14566
const LEAP = {"name":"Leap","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Target creature gains flying until end of turn.\nDraw a card."}; // EDHREC #4232
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const forests = (n) => Array.from({ length: n }, (_, i) => [`f${i}`, FOREST]);

/**
 * The AI's precombat main, stack empty, two seats. `ai` / `user` = [[permId, card, opts]] in battlefield order (untapped, not
 * summoning-sick unless opts say so); `hand` = [[cardId, card]]; the user at `userLife`.
 */
function table({ ai = [], user = [], hand = [], userLife = 40 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => ({ ...createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } }), counters: {} });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    combat: { attackers: [], blockers: [] },
    players: { ...s0.players,
      ai: { ...s0.players.ai, life: 40, landsPlayedThisTurn: 1, battlefield: ai.map(P("ai")), hand: hand.map(([id, c]) => ({ ...c, id })) },
      user: { ...s0.players.user, life: userLife, landsPlayedThisTurn: 1, battlefield: user.map(P("user")), hand: [] } } };
}
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
const castOf = (a, cardId) => (a?.kind === "cast-spell" && a.cardId === cardId ? a : null);
const offers = (s, cardId) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
/** The permanents the dispatcher's payment plan taps for this offer. */
const tapsOf = (s, a) => (offeredPaymentPlan(s, "ai", a)?.taps || []).map((t) => t.permanentId).sort();
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
const perm = (s, id) => s.players.ai.battlefield.find((p) => p.id === id);
/** What the AI's own untapped creatures connect with against the user's best block (the lethal side of the racer's reading). */
const swingNow = (s, ids) => __combatDamageForTests(s, "user", ids.filter((id) => perm(s, id) && !perm(s, id).tapped)).lower;

describe("an X pump paid by the creatures it counts (the Thrun Voltron board from the A/B)", () => {
  // Thrun 5 + Fanatic 1 + Birds 0 = 6 against 10. On paper X=4 makes 10 — but X=3 already taps Birds and X=4 taps Fanatic too.
  const BOARD = () => table({ ai: [...forests(3), ["birds", BIRDS], ["fan", FANATIC], ["thrun", THRUN]], hand: [["ts", TYVAR]], userLife: 10 });

  it("the premise: X=4 is offered and its payment taps Birds of Paradise and Fanatic of Rhonas; X=2 taps Forests only", () => {
    const s = BOARD();
    const onThrun = offers(s, "ts").filter((a) => a.targets[0].id === "thrun");
    expect(onThrun.map((a) => a.xValue).sort()).toEqual([1, 2, 3, 4]);
    expect(tapsOf(s, onThrun.find((a) => a.xValue === 4))).toEqual(["birds", "f0", "f1", "f2", "fan"]);
    expect(tapsOf(s, onThrun.find((a) => a.xValue === 2))).toEqual(["f0", "f1", "f2"]);
  });

  it("⭐ Tyvar's Stand is held: no X leaves enough attackers untapped for 10 (X=4 leaves Thrun alone at 9)", () => {
    const s = BOARD();
    expect(castOf(aiPick(s), "ts")).toBeNull();
  });

  it("policy pumpCost 'v1' recovers the old count — it casts X=4, and once paid no more than Thrun's 9 connects of 10", () => {
    const s = BOARD();
    const a = castOf(aiPick(s, { policy: { pumpCost: "v1" } }), "ts");
    expect(a?.xValue).toBe(4);
    const after = resolveStack(dispatchAction(s, a));
    expect(swingNow(after, ["thrun", "birds", "fan"])).toBeLessThan(10);
  });

  it("⭐ with two more Forests the pump goes on a creature its payment leaves untapped: the swing that follows is lethal", () => {
    const s = table({ ai: [...forests(5), ["birds", BIRDS], ["fan", FANATIC], ["thrun", THRUN]], hand: [["ts", TYVAR]], userLife: 10 });
    const a = castOf(aiPick(s), "ts");
    expect(a).toBeTruthy();
    expect(tapsOf(s, a)).not.toContain(a.targets[0].id);
    const after = resolveStack(dispatchAction(s, a));
    expect(swingNow(after, ["thrun", "birds", "fan"])).toBeGreaterThanOrEqual(10);
  });

  it("control: Thrun and five Forests — X=4 makes 9 of 9, cast on both readings", () => {
    const s = table({ ai: [...forests(5), ["thrun", THRUN]], hand: [["ts", TYVAR]], userLife: 9 });
    const a = castOf(aiPick(s), "ts");
    expect(a?.xValue).toBe(4);
    expect(a?.targets?.[0]?.id).toBe("thrun");
  });
});

describe("the X that keeps the needed attacker untapped", () => {
  it("⭐ Paradise Druid: X=2 (three Forests) keeps the Druid attacking — 9 against 9 — where X=3 taps it to pay", () => {
    const s = table({ ai: [...forests(3), ["thrun", THRUN], ["druid", DRUID]], hand: [["ts", TYVAR]], userLife: 9 });
    const x3 = offers(s, "ts").find((a) => a.xValue === 3 && a.targets[0].id === "druid");
    expect(tapsOf(s, x3)).toContain("druid");
    const a = castOf(aiPick(s), "ts");
    expect(a?.xValue).toBe(2);
    const after = resolveStack(dispatchAction(s, a));
    expect(perm(after, "druid").tapped).toBe(false);
    expect(swingNow(after, ["thrun", "druid"])).toBeGreaterThanOrEqual(9);
  });

  it("⭐ Llanowar Elves: X=3 taps the Elves and X=2 leaves 8 of 9 — held", () => {
    const s = table({ ai: [...forests(3), ["elves", ELVES], ["thrun", THRUN]], hand: [["ts", TYVAR]], userLife: 9 });
    expect(castOf(aiPick(s), "ts")).toBeNull();
  });
});

describe("a fixed pump and a team pump paid by a creature", () => {
  it("⭐ Giant Growth paid by the Llanowar Elves (no land): Thrun 8 once the Elves tap, of 9 — held", () => {
    const s = table({ ai: [["elves", ELVES], ["thrun", THRUN]], hand: [["gg", GIANT_GROWTH]], userLife: 9 });
    expect(offers(s, "gg").length).toBeGreaterThan(0);
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("control: Giant Growth paid by a Forest — Thrun and the Elves make 9 of 9, cast", () => {
    const s = table({ ai: [...forests(1), ["elves", ELVES], ["thrun", THRUN]], hand: [["gg", GIANT_GROWTH]], userLife: 9 });
    const a = castOf(aiPick(s), "gg");
    expect(a).toBeTruthy();
    const after = resolveStack(dispatchAction(s, a));
    expect(swingNow(after, ["thrun", "elves"])).toBeGreaterThanOrEqual(9);
  });

  it("⭐ Overrun paid with the Llanowar Elves' mana: two Bears at 5 each make 10 of 14 — held", () => {
    const s = table({ ai: [...forests(4), ["elves", ELVES], ["b1", BEARS], ["b2", BEARS]], hand: [["or", OVERRUN]], userLife: 14 });
    const a = offers(s, "or")[0];
    expect(tapsOf(s, a)).toContain("elves");
    expect(castOf(aiPick(s), "or")).toBeNull();
  });

  it("control: Overrun paid by five Forests — 5 + 5 + 4 is 14 of 14, cast", () => {
    const s = table({ ai: [...forests(5), ["elves", ELVES], ["b1", BEARS], ["b2", BEARS]], hand: [["or", OVERRUN]], userLife: 14 });
    expect(castOf(aiPick(s), "or")).toBeTruthy();
  });
});

describe("an evasion grant paid by the creature it serves", () => {
  it("⭐ Leap whose only blue mana is the Paradise Druid is not cast on the Druid: paying taps it, and it would not attack", () => {
    const s = table({ ai: [...forests(1), ["druid", DRUID]], user: [["ub", BEARS]], hand: [["leap", LEAP]] });
    const a = offers(s, "leap").find((x) => x.targets[0].id === "druid");
    expect(tapsOf(s, a)).toContain("druid");
    expect(castOf(aiPick(s), "leap")).toBeNull();
  });

  it("control: Leap paid by an Island gives the ready Paradise Druid flying over the Grizzly Bears", () => {
    const s = table({ ai: [["i0", ISLAND], ["druid", DRUID]], user: [["ub", BEARS]], hand: [["leap", LEAP]] });
    expect(castOf(aiPick(s), "leap")?.targets?.[0]?.id).toBe("druid");
  });
});

describe("the pump readers read trample and double strike as the racer does", () => {
  it("⭐ Giant Growth on Colossal Dreadmaw: 9 trampling over the user's Grizzly Bears is 7 of 7 — cast", () => {
    const s = table({ ai: [...forests(2), ["maw", DREADMAW]], user: [["ub", BEARS]], hand: [["gg", GIANT_GROWTH]], userLife: 7 });
    const a = castOf(aiPick(s), "gg");
    expect(a?.targets?.[0]?.id).toBe("maw");
  });

  it("control: the Dreadmaw already tramples 4 over the Bears into 4 — held (the pump would be wasted)", () => {
    const s = table({ ai: [...forests(2), ["maw", DREADMAW]], user: [["ub", BEARS]], hand: [["gg", GIANT_GROWTH]], userLife: 4 });
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("⭐ Giant Growth on Fencing Ace: 4 twice is 8 of 7 — cast", () => {
    const s = table({ ai: [...forests(2), ["ace", ACE]], hand: [["gg", GIANT_GROWTH]], userLife: 7 });
    expect(castOf(aiPick(s), "gg")?.targets?.[0]?.id).toBe("ace");
  });

  it("control: policy combatDamage 'v1' keeps the old reading on the pump too — the Dreadmaw's pump is held", () => {
    const s = table({ ai: [...forests(2), ["maw", DREADMAW]], user: [["ub", BEARS]], hand: [["gg", GIANT_GROWTH]], userLife: 7 });
    expect(castOf(aiPick(s, { policy: { combatDamage: "v1" } }), "gg")).toBeNull();
  });
});

describe("policy", () => {
  it("pumpCost is a policy key (the A/B probe's --legacy=all reaches it)", () => {
    expect(POLICY_KEYS).toContain("pumpCost");
  });
});
