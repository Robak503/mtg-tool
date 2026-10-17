/**
 * sacrificeVictimDistinct.test.js — each "Sacrifice a <kind>" mana cost consumes its OWN victim (2026-10-17).
 *
 * A mana ability is activated like any activated ability (CR 605.3, 602.2b): its whole cost is paid (CR 601.2h — partial
 * payments are not allowed, unpayable costs can't be paid; CR 118.3 — no resources, no payment), and only then does it resolve
 * and add its mana (CR 605.3b — it resolves immediately after it is activated). Two sources that each print "Sacrifice a
 * creature" (Phyrexian Altar, Ashnod's Altar, Phyrexian Tower's second line, Lazotep Quarry, Thermopod) or "Sacrifice a Food"
 * (Gilded Goose) can't share one victim: the first activation sacrifices it, and the second has nothing left to pay with.
 *
 * Before this slice the planner gated each source on "some other creature / Food exists" alone, so two Altars and one creature
 * planned two mana, canAfford counted it, and commitManaTap added the second Altar's mana BEFORE finding its victim gone (it
 * logged the cost unpaid and kept the mana). The planner now keeps one claim per sacrifice cost (each source record carries its
 * eligible victims, `sacVictimIds`; a distinct victim per claim, a victim never consumed by a self-sacrificing tap of the same
 * plan, a victim that is another claim's source sacrificed only after that source has paid), the commit assigns the same way on
 * the live board and pays the sacrifice before it adds the mana, and a cost with no victim left makes nothing.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { canAfford, commitManaTap, commitPaymentPlan, manaSources, payGenericMana, planPayment, withoutUnfeedableSacSources } from "./manaModel.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const PHYREXIAN_ALTAR = {"name":"Phyrexian Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add one mana of any color."};
const ASHNODS_ALTAR = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add {C}{C}."};
const GOOSE = {"name":"Gilded Goose","type":"Creature — Bird","mana":"{G}","cmc":1,"power":"0","toughness":"2","keywords":["Flying","Food"],"colors":["G"],"oracle":"Flying\nWhen this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{1}{G}, {T}: Create a Food token.\n{T}, Sacrifice a Food: Add one mana of any color."};
const COOKIE = {"name":"Tough Cookie","type":"Artifact Creature — Food Golem","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Food"],"colors":["G"],"oracle":"When this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature.\n{2}, {T}, Sacrifice this creature: You gain 3 life."};
const TOWER = {"name":"Phyrexian Tower","type":"Legendary Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}."};
const SIGNET = {"name":"Simic Signet","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{1}, {T}: Add {G}{U}."};
const SPAWN = {"name":"Eldrazi Spawn","type":"Token Creature — Eldrazi Spawn","mana":"","cmc":0,"power":"0","toughness":"1","keywords":[],"colors":[],"oracle":"Sacrifice this creature: Add {C}.","token":true};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const FOOD = { name: "Food", type: "Token Artifact — Food", token: true, oracle: "{2}, {T}, Sacrifice this token: You gain 3 life." };

const P = (id, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...over });

function table(user, hand = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const POOL0 = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const affords = (s, cost) => canAfford(POOL0, manaSources(s, "user"), parseManaCost(cost));
const plan = (s, cost) => planPayment(POOL0, manaSources(s, "user"), parseManaCost(cost));
const onField = (s, id) => s.players.user.battlefield.some((p) => p.id === id);
const poolTotal = (s) => Object.values(s.players.user.manaPool || {}).reduce((n, v) => n + (Number(v) || 0), 0);
const sacEvents = (s) => (s.log || []).filter((e) => e.kind === "mana" && /^sacrifice-(creature|food)-cost/.test(String(e.event))).map((e) => `${e.event}:${e.permanentId}${e.victimId ? ">" + e.victimId : ""}`);
/** The total mana a plan's taps make (each tap's amount or bundle, plus its inline bonus). */
const planMana = (p) => p.taps.reduce((n, t) => n + (t.fixed ? Object.values(t.fixed).reduce((a, b) => a + b, 0) : (t.amount ?? 1)) + (t.bonus || []).reduce((a, b) => a + b.amount, 0), 0);

describe("the planner — one victim per sacrifice cost (planPayment, canAfford)", () => {
  it("⭐ two Phyrexian Altars and one creature: one mana, never two", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS)]);
    expect(affords(s, "{1}")).toBe(true);
    expect(affords(s, "{2}")).toBe(false);
    expect(plan(s, "{2}")).toBeNull();
  });

  it("⭐ Phyrexian Altar + Ashnod's Altar and one creature: {3} is out of reach; Ashnod's Altar alone still pays {2}", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("aa", ASHNODS_ALTAR), P("bear", BEARS)]);
    expect(affords(s, "{3}")).toBe(false);
    expect(affords(s, "{2}")).toBe(true);
    const p = plan(s, "{2}");
    expect(p.taps.map((t) => t.permanentId)).toEqual(["aa"]);
    const out = commitPaymentPlan(s, "user", p);
    expect(onField(out, "bear")).toBe(false);
    expect(poolTotal(out)).toBe(0);
    expect(sacEvents(out)).toEqual(["sacrifice-creature-cost:aa>bear"]);
  });

  it("⭐ two Gilded Geese and one Food: one mana, never two", () => {
    const s = table([P("g1", GOOSE), P("g2", GOOSE), P("food", FOOD)]);
    expect(affords(s, "{1}")).toBe(true);
    expect(affords(s, "{2}")).toBe(false);
  });

  it("⭐ two Phyrexian Altars, Gilded Goose and Tough Cookie (the only Food): two victims, two mana — never three", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("goose", GOOSE), P("cookie", COOKIE)]);
    expect(affords(s, "{2}")).toBe(true);
    expect(affords(s, "{3}")).toBe(false);
  });

  it("⭐ Phyrexian Altar and an Eldrazi Spawn (the only creature): the Spawn pays once — for itself or for the Altar", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("spawn", SPAWN)]);
    expect(affords(s, "{1}")).toBe(true);
    expect(affords(s, "{2}")).toBe(false);
  });

  it("⭐ Phyrexian Tower's sacrifice line and Phyrexian Altar share one creature: {B}{B}, not {B}{B}{1}", () => {
    const s = table([P("tower", TOWER), P("pa", PHYREXIAN_ALTAR), P("bear", BEARS)]);
    expect(affords(s, "{B}{B}")).toBe(true);
    expect(affords(s, "{B}{B}{1}")).toBe(false);
  });

  it("⭐ a mana-costed source funded by one Altar: the rest of the cost can't feed the second Altar the same creature", () => {
    // Legal: Phyrexian Altar sacrifices the Bear for {1}, which funds Simic Signet's {G}{U} — two mana in all.
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS), P("sig", SIGNET)]);
    expect(affords(s, "{G}{U}")).toBe(true);
    expect(affords(s, "{G}{U}{1}")).toBe(false);
    const p = plan(s, "{G}{U}");
    const out = commitPaymentPlan(s, "user", p);
    expect(sacEvents(out)).toEqual(["sacrifice-creature-cost:a1>bear"]);
    expect(poolTotal(out)).toBe(0);
  });

  it("every plan the planner returns on these boards makes no more mana than its distinct victims allow", () => {
    const boards = [
      [table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS)]), 1],
      [table([P("pa", PHYREXIAN_ALTAR), P("aa", ASHNODS_ALTAR), P("bear", BEARS)]), 2],
      [table([P("g1", GOOSE), P("g2", GOOSE), P("food", FOOD)]), 1],
    ];
    for (const [s, most] of boards) {
      for (let n = 1; n <= 4; n++) {
        const p = plan(s, `{${n}}`);
        if (p) expect(planMana(p)).toBeLessThanOrEqual(most);
      }
    }
  });
});

describe("the commit — the sacrifice is paid before the mana; no victim, no mana", () => {
  it("⭐ commitManaTap with no victim left makes nothing (CR 601.2h, 605.3b)", () => {
    const s = table([P("altar", ASHNODS_ALTAR)]);
    const out = commitManaTap(s, "user", { permanentId: "altar", color: "C", amount: 2, sacrificesCreature: true, noTap: true });
    expect(poolTotal(out)).toBe(0);
    expect(sacEvents(out)).toEqual(["sacrifice-creature-cost-unpaid:altar"]);
  });

  it("⭐ a planned victim gone before the commit: that Altar makes nothing", () => {
    const s = table([P("altar", ASHNODS_ALTAR), P("bear", BEARS)]);
    const p = plan(s, "{2}");
    expect(p.taps.map((t) => t.permanentId)).toEqual(["altar"]);
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((x) => x.id !== "bear") } } };
    const topped = commitPaymentPlan({ ...gone, players: { ...gone.players, user: { ...gone.players.user, manaPool: { ...POOL0, C: 2 } } } }, "user", p);
    // the floating {C}{C} pays the plan's spend; the Altar itself added nothing
    expect(poolTotal(topped)).toBe(0);
    expect(sacEvents(topped)).toEqual(["sacrifice-creature-cost-unpaid:altar"]);
  });

  it("⭐ an Altar that would eat Gilded Goose waits until the Goose has paid (tap first, then sacrifice)", () => {
    // Board order puts the Altar first, so the plan does too; committed in that order the Altar ate the Goose (the least
    // valuable creature) and the Goose's own tap found no permanent ("Permanent goose not found").
    const s = table([P("pa", PHYREXIAN_ALTAR), P("goose", GOOSE), P("cookie", COOKIE)]);
    const p = plan(s, "{2}");
    expect(p.taps.map((t) => t.permanentId).sort()).toEqual(["goose", "pa"]);
    let out;
    expect(() => { out = commitPaymentPlan(s, "user", p); }).not.toThrow();
    expect(onField(out, "goose")).toBe(false);
    expect(onField(out, "cookie")).toBe(false);
    expect(poolTotal(out)).toBe(0);
    expect(sacEvents(out)).toEqual(["sacrifice-food-cost:goose>cookie", "sacrifice-creature-cost:pa>goose"]);
  });

  it("⭐ payGenericMana (the resolution layer's payment): two Altars and one creature can't pay {2}", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS)]);
    const r = payGenericMana(s, "user", 2);
    expect(r.paid).toBe(false);
    expect(onField(r.state, "bear")).toBe(true);
  });
});

describe("runtime — the auto-tap and the explicit tap", () => {
  it("⭐ two Phyrexian Altars and one creature on the battlefield: Grizzly Bears ({1}{G}) is not offered", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS)], [{ ...BEARS, id: "h-bear" }]);
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
  });

  it("⭐ two Gilded Geese and one Food: Grizzly Bears is not offered", () => {
    const s = table([P("g1", GOOSE), P("g2", GOOSE), P("food", FOOD)], [{ ...BEARS, id: "h-bear" }]);
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
  });

  it("control — two Altars and two creatures cast Grizzly Bears: each Altar eats its own creature", () => {
    let s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("b1", BEARS), P("b2", BEARS)], [{ ...BEARS, id: "h-bear" }]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bear");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    expect(onField(s, "b1")).toBe(false);
    expect(onField(s, "b2")).toBe(false);
    expect(sacEvents(s).sort()).toEqual(["sacrifice-creature-cost:a1>b1", "sacrifice-creature-cost:a2>b2"]);
    expect(poolTotal(s)).toBe(0);
  });

  it("control — the explicit taps: after one Altar eats the only creature, the other Altar is no longer offered", () => {
    let s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("bear", BEARS)]);
    const taps = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "tap-for-mana");
    expect(new Set(taps(s).map((t) => t.permanentId))).toEqual(new Set(["a1", "a2"]));
    s = dispatchAction(s, taps(s).find((t) => t.permanentId === "a1" && t.color === "R"));
    expect(s.players.user.manaPool.R).toBe(1);
    expect(onField(s, "bear")).toBe(false);
    expect(taps(s)).toEqual([]);
  });

  it("control — the explicit taps: Gilded Goose eats the Food, then Phyrexian Altar eats the Goose", () => {
    let s = table([P("goose", GOOSE), P("pa", PHYREXIAN_ALTAR), P("food", FOOD)]);
    const tap = (st, id) => legalActionsForPlayer(st, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === id && a.color === "G");
    s = dispatchAction(s, tap(s, "goose"));
    s = dispatchAction(s, tap(s, "pa"));
    expect(s.players.user.manaPool.G).toBe(2);
    expect(onField(s, "goose")).toBe(false);
    expect(onField(s, "food")).toBe(false);
  });
});

describe("the action's own cost permanents are no Altar's victim (offer and payment read the same sources)", () => {
  const PENTAPUS = {"name":"Purple Pentapus","type":"Creature — Octopus Starfish","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Surveil"],"colors":["B"],"oracle":"When this creature enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{2}{B}, Tap an untapped creature you control: Return this card from your graveyard to the battlefield tapped."};
  const GRYFF = {"name":"Wretched Gryff","type":"Creature — Eldrazi Hippogriff","mana":"{7}","cmc":7,"power":"3","toughness":"4","keywords":["Flying","Emerge"],"colors":[],"oracle":"Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, draw a card.\nFlying"};
  const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
  const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

  it("⭐ Purple Pentapus's \"Tap an untapped creature you control\": the creature it taps can't also feed Phyrexian Altar", () => {
    // Two Swamps and the Altar: the {2}{B} needs the Altar to eat the Bears, and the Bears is the creature the cost taps.
    const s0 = table([P("pa", PHYREXIAN_ALTAR), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)]);
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: [{ ...PENTAPUS, id: "gy-pentapus" }] } } };
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion" && a.cardId === "gy-pentapus");
    expect(offers).toEqual([]);
    // with a second creature to tap, the Altar eats the other one: offered for each creature the Altar doesn't need
    const t0 = table([P("pa", PHYREXIAN_ALTAR), P("bear", BEARS), P("giant", HILL_GIANT), P("s1", SWAMP), P("s2", SWAMP)]);
    const t = { ...t0, players: { ...t0.players, user: { ...t0.players.user, graveyard: [{ ...PENTAPUS, id: "gy-pentapus" }] } } };
    const two = legalActionsForPlayer(t, "user").filter((a) => a.kind === "activate-gy-recursion" && a.cardId === "gy-pentapus");
    expect(two.map((a) => a.tapIds[0]).sort()).toEqual(["bear", "giant"]);
    const after = dispatchAction(t, two.find((a) => a.tapIds[0] === "bear"));
    expect(onField(after, "bear")).toBe(true);
    expect(after.players.user.battlefield.find((x) => x.id === "bear").tapped).toBe(true);
    expect(sacEvents(after)).toEqual(["sacrifice-creature-cost:pa>giant"]);
  });

  it("⭐ withoutUnfeedableSacSources: two Altars and two creatures, one of them the action's: one mana, not two", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("b1", BEARS), P("b2", BEARS)]);
    const narrowed = withoutUnfeedableSacSources(s, "user", manaSources(s, "user"), new Set(["b1"]));
    expect(narrowed.map((x) => x.permanentId).sort()).toEqual(["a1", "a2"]);
    expect(canAfford(POOL0, narrowed, parseManaCost("{1}"))).toBe(true);
    expect(canAfford(POOL0, narrowed, parseManaCost("{2}"))).toBe(false);
  });

  it("⭐ emerge: the creature sacrificed to emerge can't also feed Phyrexian Altar — Wretched Gryff isn't offered off three Islands", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("bear", BEARS), P("i1", ISLAND), P("i2", ISLAND), P("i3", ISLAND)], [{ ...GRYFF, id: "h-gryff" }]);
    const emerge = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-gryff" && a.emerge);
    expect(emerge).toEqual([]);
  });
});

describe("controls — what was right stays right", () => {
  it("one Phyrexian Altar and one creature: {1} is paid, the creature is sacrificed", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("bear", BEARS)]);
    expect(affords(s, "{1}")).toBe(true);
    expect(affords(s, "{2}")).toBe(false);
    const out = commitPaymentPlan(s, "user", plan(s, "{1}"));
    expect(onField(out, "bear")).toBe(false);
    expect(sacEvents(out)).toEqual(["sacrifice-creature-cost:pa>bear"]);
  });

  it("two Altars and three creatures: the two least valuable are sacrificed", () => {
    const s = table([P("a1", PHYREXIAN_ALTAR), P("a2", PHYREXIAN_ALTAR), P("giant", HILL_GIANT), P("bear", BEARS), P("elf", ELVES, { tapped: true })]);
    const p = plan(s, "{2}");
    expect(p.taps.map((t) => t.permanentId).sort()).toEqual(["a1", "a2"]);
    const out = commitPaymentPlan(s, "user", p);
    expect(onField(out, "giant")).toBe(true);
    expect(onField(out, "elf")).toBe(false);
    expect(onField(out, "bear")).toBe(false);
  });

  it("Gilded Goose, Phyrexian Altar and Tough Cookie: two mana (the Goose eats the Cookie, the Altar the Goose)", () => {
    const s = table([P("goose", GOOSE), P("pa", PHYREXIAN_ALTAR), P("cookie", COOKIE)]);
    expect(affords(s, "{2}")).toBe(true);
    const out = commitPaymentPlan(s, "user", plan(s, "{2}"));
    expect(onField(out, "goose")).toBe(false);
    expect(onField(out, "cookie")).toBe(false);
    expect(poolTotal(out)).toBe(0);
  });

  it("the planner still prefers a land: Forest + Phyrexian Altar + a creature pay {G} with the Forest", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("bear", BEARS), P("forest", FOREST)]);
    expect(plan(s, "{G}").taps.map((t) => t.permanentId)).toEqual(["forest"]);
  });

  it("a creature tapped for mana in the same plan may still be the Altar's victim (tap first, then sacrifice)", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("elf", ELVES)]);
    expect(affords(s, "{2}")).toBe(true);
    const out = commitPaymentPlan(s, "user", plan(s, "{2}"));
    expect(onField(out, "elf")).toBe(false);
    expect(poolTotal(out)).toBe(0);
  });
});
