/**
 * liberatorBattlethopter.test.js — LIBERATOR, URZA'S BATTLETHOPTER (the play-weighted program, EDHREC #1251):
 *
 *   "Flash
 *    Flying
 *    You may cast colorless spells and artifact spells as though they had flash.
 *    Whenever you cast a spell, if the amount of mana spent to cast that spell is greater than Liberator's power, put a +1/+1 counter
 *    on Liberator."
 *
 * The last line was the one unread: an intervening "if" (CR 603.4) comparing the amount of mana spent to cast the triggering spell —
 * the dispatcher's payment plan, threaded on the cast trigger's context as `manaSpentAmount` (the Opus cycle's reader) — with the
 * source's own power, layer-aware, checked when the spell is cast and again as the ability resolves. The bundled rulings: the ability
 * "cares only about the amount of mana that was actually spent to cast the spell, regardless of its mana cost" (a cost reduction
 * lowers it, {X} raises it); the flash permission applies only to casting spells.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const LIBERATOR = {"name":"Liberator, Urza's Battlethopter","type":"Legendary Artifact Creature — Thopter","mana":"{3}","oracle":"Flash\nFlying\nYou may cast colorless spells and artifact spells as though they had flash.\nWhenever you cast a spell, if the amount of mana spent to cast that spell is greater than Liberator's power, put a +1/+1 counter on Liberator.","layout":"normal","cmc":3,"power":"1","toughness":"2","loyalty":null,"keywords":["Flying","Flash"],"colors":[],"colorIdentity":[]}; // EDHREC #1251
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","oracle":"Target creature gets +3/+3 until end of turn.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #3304
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const ELECTROMANCER = {"name":"Goblin Electromancer","type":"Creature — Goblin Wizard","mana":"{U}{R}","oracle":"Instant and sorcery spells you cast cost {1} less to cast.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["R","U"],"colorIdentity":["R","U"]}; // EDHREC #665
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BLAZE = {"name":"Blaze","type":"Sorcery","mana":"{X}{R}","oracle":"Blaze deals X damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #13166
const GEOSURGE = {"name":"Geosurge","type":"Sorcery","mana":"{R}{R}{R}{R}","oracle":"Add {R}{R}{R}{R}{R}{R}{R}. Spend this mana only to cast artifact or creature spells.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #6235
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const inHand = (card, id) => ({ ...card, id });
/** Two seats; `seat` active in its precombat main; the user's Liberator on the battlefield unless `boards` says otherwise. */
function table({ seat = "user", boards = {}, hands = {}, pools = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [],
      library: [{ ...ISLAND, id: `lib1-${pid}` }, { ...ISLAND, id: `lib2-${pid}` }], manaPool: { ...EMPTY, ...(pools[pid] || {}) } };
  }
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const castOf = (s, seat, cardId, pred = () => true) => offered(legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a)), `casting ${cardId}`);
const counters = (s, id = "lib") => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] ?? 0;
/** Resolve the stack to the bottom (the cast spell included), flushing triggers on the way. */
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return s;
}

describe("the card", () => {
  it("⭐ native: every line plays — the cast watcher's intervening if reads the mana spent against Liberator's power", () => {
    expect(isNativeTier(classifyCard(LIBERATOR))).toBe(true);
    const d = detectTriggers(LIBERATOR).find((x) => x.event === "cast");
    expect({ whose: d.whose, routes: triggerRoutesNatively(d) }).toEqual({ whose: "you", routes: true });
  });
});

describe("the game", () => {
  it("⭐ power 1: Grizzly Bears (two mana spent) puts a +1/+1 counter on Liberator; Sol Ring (one mana) does not", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(BEARS, "h-bears"), inHand(SOL_RING, "h-ring")] }, pools: { user: { G: 1, C: 2 } } });
    const ring = settle(dispatchAction(s0, castOf(s0, "user", "h-ring")));
    expect({ counters: counters(ring), ring: ring.players.user.battlefield.some((p) => p.card?.name === "Sol Ring") }).toEqual({ counters: 0, ring: true });
    const bears = settle(dispatchAction(ring, castOf(ring, "user", "h-bears")));
    expect({ counters: counters(bears), power: 1 + counters(bears) }).toEqual({ counters: 1, power: 2 });
  });
  it("⭐ greater, not equal: at power 2 a second two-mana spell (Mind Stone) adds nothing; Hill Giant (four) adds one", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR, { counters: { "+1/+1": 1 } })] }, hands: { user: [inHand(MIND_STONE, "h-stone"), inHand(HILL_GIANT, "h-giant")] }, pools: { user: { C: 2, R: 1 } } });
    const stone = settle(dispatchAction(s0, castOf(s0, "user", "h-stone")));
    expect(counters(stone)).toBe(1);
    const fed = { ...stone, players: { ...stone.players, user: { ...stone.players.user, manaPool: { ...EMPTY, R: 1, C: 3 } } } };
    const giant = settle(dispatchAction(fed, castOf(fed, "user", "h-giant")));
    expect(counters(giant)).toBe(2);
  });
  it("⭐ {X} counts: at power 2, Blaze with X = 2 at the AI (three mana spent) adds a counter; X = 1 (two mana) adds none", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR, { counters: { "+1/+1": 1 } })] }, hands: { user: [inHand(BLAZE, "h-blaze")] }, pools: { user: { R: 1, C: 2 } } });
    const x2 = settle(dispatchAction(s0, castOf(s0, "user", "h-blaze", (a) => a.xValue === 2 && a.targets?.[0]?.id === "ai")));
    expect({ counters: counters(x2), aiLife: x2.players.ai.life }).toEqual({ counters: 2, aiLife: s0.players.ai.life - 2 });
    const x1 = settle(dispatchAction(s0, castOf(s0, "user", "h-blaze", (a) => a.xValue === 1 && a.targets?.[0]?.id === "ai")));
    expect({ counters: counters(x1), aiLife: x1.players.ai.life }).toEqual({ counters: 1, aiLife: s0.players.ai.life - 1 });
  });
  it("⭐ the mana actually spent, not the mana value (its ruling) — a cost reduction lowers it: under Goblin Electromancer's Blaze with X = 1 costs {1}{R} − {1} = {R} — one mana, no counter at power 1 (two would have been)", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR), on("user", "gob", ELECTROMANCER)] }, hands: { user: [inHand(BLAZE, "h-blaze")] }, pools: { user: { R: 1 } } });
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-blaze", (a) => a.xValue === 1 && a.targets?.[0]?.id === "ai")));
    expect({ counters: counters(s), aiLife: s.players.ai.life, pool: s.players.user.manaPool.R }).toEqual({ counters: 0, aiLife: s0.players.ai.life - 1, pool: 0 });
  });
  it("⭐ Ornithopter (no mana spent) adds nothing, and the trigger never goes on the stack (CR 603.4 — checked as it triggers)", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR, { counters: { "+1/+1": 0 } })] }, hands: { user: [inHand(ORNITHOPTER, "h-thopter")] } });
    const cast = flushTriggers(dispatchAction(s0, castOf(s0, "user", "h-thopter")), { chooseTargets: chooseTriggerTargets });
    expect((cast.stack || []).filter((o) => o.kind === "triggered-ability").length).toBe(0);
    expect(counters(settle(cast))).toBe(0);
  });
  it("⭐ checked again as it resolves (CR 603.4): Bears cast at power 1 triggers, Giant Growth on Liberator in response makes it 4 — the ability does nothing", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(BEARS, "h-bears"), inHand(GIANT_GROWTH, "h-growth")] }, pools: { user: { G: 3 } } });
    const cast = flushTriggers(dispatchAction(s0, castOf(s0, "user", "h-bears")), { chooseTargets: chooseTriggerTargets });
    expect((cast.stack || []).filter((o) => o.kind === "triggered-ability").length).toBe(1);
    // Giant Growth on Liberator in response (two G left floating; the Growth itself spends one, not more than power 1 — no trigger)
    const growth = flushTriggers(dispatchAction(cast, castOf(cast, "user", "h-growth", (a) => a.targets?.[0]?.id === "lib")), { chooseTargets: chooseTriggerTargets });
    expect((growth.stack || []).filter((o) => o.kind === "triggered-ability").length).toBe(1);
    const s = settle(growth);
    expect({ counters: counters(s), bears: s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears") }).toEqual({ counters: 0, bears: true });
  });
  it("⭐ \"you cast\": the AI's Hill Giant doesn't grow the user's Liberator; the AI's own Liberator grows from its own cast", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "lib", LIBERATOR)], ai: [on("ai", "lib-ai", LIBERATOR)] }, hands: { ai: [inHand(HILL_GIANT, "h-giant")] }, pools: { ai: { R: 1, C: 3 } } });
    const s = settle(dispatchAction(s0, castOf(s0, "ai", "h-giant")));
    expect({ user: counters(s, "lib"), ai: counters(s, "lib-ai") }).toEqual({ user: 0, ai: 1 });
  });
  it("⭐ restricted mana is mana spent (pw27's review, F3): Geosurge's four from the pool grow Liberator; its seven restricted {R} then pay Hill Giant — four spent, a second counter", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(GEOSURGE, "h-geo"), inHand(HILL_GIANT, "h-giant")] }, pools: { user: { R: 4 } } });
    const geo = settle(dispatchAction(s0, castOf(s0, "user", "h-geo")));
    expect({ counters: counters(geo), restricted: (geo.players.user.restrictedMana || []).map((e) => e.pool.R), pool: geo.players.user.manaPool.R }).toEqual({ counters: 1, restricted: [7], pool: 0 });
    const giant = settle(dispatchAction(geo, castOf(geo, "user", "h-giant")));
    expect({ counters: counters(giant), restricted: (giant.players.user.restrictedMana || []).map((e) => e.pool.R), giant: giant.players.user.battlefield.some((p) => p.card?.name === "Hill Giant") })
      .toEqual({ counters: 2, restricted: [3], giant: true });
  });
  it("⭐ the review's probe: at power 1, Grizzly Bears paid with {G} from the pool and {C} from a restricted entry — two mana spent, one counter", () => {
    const s0 = table({ boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(GEOSURGE, "h-geo")] }, pools: { user: { R: 4 } } });
    const restriction = settle(dispatchAction(s0, castOf(s0, "user", "h-geo"))).players.user.restrictedMana[0].restriction; // Geosurge's: artifact or creature spells
    const t = table({ boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(BEARS, "h-bears")] }, pools: { user: { G: 1 } } });
    const s1 = { ...t, players: { ...t.players, user: { ...t.players.user, restrictedMana: [{ pool: { ...EMPTY, C: 1 }, restriction }] } } };
    const s = settle(dispatchAction(s1, castOf(s1, "user", "h-bears")));
    expect({ counters: counters(s), entries: (s.players.user.restrictedMana || []).length, pool: s.players.user.manaPool.G, bears: s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears") })
      .toEqual({ counters: 1, entries: 0, pool: 0, bears: true });
  });
  it("control: the flash permission (played before this slice) lets Sol Ring be cast in the AI's turn — one mana at power 1, no counter", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "lib", LIBERATOR)] }, hands: { user: [inHand(SOL_RING, "h-ring")] }, pools: { user: { C: 1 } } });
    const offTurn = { ...s0, priorityHolder: "user" };
    const s = settle(dispatchAction(offTurn, castOf(offTurn, "user", "h-ring")));
    expect({ ring: s.players.user.battlefield.some((p) => p.card?.name === "Sol Ring"), counters: counters(s) }).toEqual({ ring: true, counters: 0 });
  });
});
