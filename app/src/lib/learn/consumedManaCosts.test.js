/**
 * consumedManaCosts.test.js — a mana ability's cost that CONSUMES a shared resource is paid once per activation (2026-10-17).
 *
 * The sacrifice-a-creature / sacrifice-a-Food costs got one victim each (sacrificeVictimDistinct.test.js). The same shape held two
 * more resources a payment can run out of:
 *   · A GRAVEYARD CARD — Molt Tender and Rubble Rouser ("{T}, Exile a card from your graveyard: Add …", the only two bundled
 *     carriers): each source was gated on a non-empty graveyard alone, so two of them beside one card planned two mana, and
 *     commitManaTap added the mana before looking for the card (it logged `exile-gy-cost-unpaid` and kept the mana). A spell cast
 *     from the graveyard is on the stack while its costs are paid (CR 601.2a), so it is no card to exile; neither is a card the
 *     action's own cost exiles, nor (a self-defeating payment) the card whose graveyard ability is being activated.
 *   · LIFE — 31 bundled "Pay N life" mana lines, each gated on its own payment: two Treasonous Ogres at 4 life paid 6 (CR 119.4
 *     — a player may pay life only up to their life total; CR 118.3). The engine's policy keeps at least 1 life per payment.
 * And two offers the payment then refused: an activated ability whose own creature was the Altar's only victim (Anaba Shaman —
 * MANA_SHORT), and Purple Pentapus's "Tap an untapped creature you control" with that creature planned as a mana source
 * (Cryptolith Rite — COST_UNPAYABLE).
 *
 * A mana ability's costs are paid before it resolves and adds its mana (CR 605.3, 602.2b, 601.2h; CR 605.3b), so a cost that
 * can't be paid makes nothing. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { canAfford, commitManaTap, commitPaymentPlan, manaSources, payGenericMana, planPayment } from "./manaModel.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, grantTeferiShield } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const MOLT = {"name":"Molt Tender","type":"Creature — Insect Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Mill"],"colors":["G"],"oracle":"{T}: Mill a card. (Put the top card of your library into your graveyard.)\n{T}, Exile a card from your graveyard: Add one mana of any color."};
const ROUSER = {"name":"Rubble Rouser","type":"Creature — Dwarf Sorcerer","mana":"{2}{R}","cmc":3,"power":"1","toughness":"4","keywords":[],"colors":["R"],"oracle":"When this creature enters, you may discard a card. If you do, draw a card.\n{T}, Exile a card from your graveyard: Add {R}. When you do, this creature deals 1 damage to each opponent."};
const OGRE = {"name":"Treasonous Ogre","type":"Creature — Ogre Shaman","mana":"{3}{R}","cmc":4,"power":"2","toughness":"3","keywords":["Dethrone"],"colors":["R"],"oracle":"Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nPay 3 life: Add {R}."};
const BOSEIJU = {"name":"Boseiju, Who Shelters All","type":"Legendary Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"Boseiju enters tapped.\n{T}, Pay 2 life: Add {C}. If that mana is spent on an instant or sorcery spell, that spell can't be countered."};
const CONFLUENCE = {"name":"Mana Confluence","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Pay 1 life: Add one mana of any color."};
const PHYREXIAN_ALTAR = {"name":"Phyrexian Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add one mana of any color."};
const ANABA = {"name":"Anaba Shaman","type":"Creature — Minotaur Shaman","mana":"{3}{R}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"{R}, {T}: This creature deals 1 damage to any target."};
const RITE = {"name":"Cryptolith Rite","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Creatures you control have \"{T}: Add one mana of any color.\""};
const PENTAPUS = {"name":"Purple Pentapus","type":"Creature — Octopus Starfish","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Surveil"],"colors":["B"],"oracle":"When this creature enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{2}{B}, Tap an untapped creature you control: Return this card from your graveyard to the battlefield tapped."};
const THINK_TWICE = {"name":"Think Twice","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":["Flashback"],"colors":["U"],"oracle":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const P = (id, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...over });
const gyCard = (id, card = BOLT) => ({ ...card, id });

function table(user, { graveyard = [], hand = [], life = 20, library = [{ id: "L1", name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, graveyard, hand, life, library };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const POOL0 = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const affords = (s, cost) => canAfford(POOL0, manaSources(s, "user"), parseManaCost(cost));
const plan = (s, cost) => planPayment(POOL0, manaSources(s, "user"), parseManaCost(cost));
const poolTotal = (s) => Object.values(s.players.user.manaPool || {}).reduce((n, v) => n + (Number(v) || 0), 0);
const gyIds = (s) => s.players.user.graveyard.map((c) => c.id);
const exileNames = (s) => (s.players.user.exile || []).map((c) => c.name);
const manaEvents = (s) => (s.log || []).filter((e) => e.kind === "mana").map((e) => e.event);

describe("a graveyard card per exile cost (Molt Tender, Rubble Rouser)", () => {
  it("⭐ two Molt Tenders and one graveyard card: one mana, never two", () => {
    const s = table([P("m1", MOLT), P("m2", MOLT)], { graveyard: [gyCard("g1")] });
    expect(affords(s, "{1}")).toBe(true);
    expect(affords(s, "{2}")).toBe(false);
    expect(plan(s, "{2}")).toBeNull();
  });

  it("⭐ Molt Tender and Rubble Rouser share one graveyard card: {R}, not {R}{1}", () => {
    const s = table([P("m1", MOLT), P("r1", ROUSER)], { graveyard: [gyCard("g1")] });
    expect(affords(s, "{R}")).toBe(true);
    expect(affords(s, "{R}{1}")).toBe(false);
  });

  it("⭐ commitManaTap with an empty graveyard makes nothing (CR 601.2h, 605.3b)", () => {
    const s = table([P("m1", MOLT)]);
    const out = commitManaTap(s, "user", { permanentId: "m1", color: "G", amount: 1, exilesGyCard: true });
    expect(poolTotal(out)).toBe(0);
    expect(out.players.user.battlefield.find((p) => p.id === "m1").tapped).toBe(false);
    expect(manaEvents(out)).toEqual(["exile-gy-cost-unpaid"]);
  });

  it("⭐ a planned graveyard card gone before the commit: that Molt Tender makes nothing", () => {
    const s = table([P("m1", MOLT)], { graveyard: [gyCard("g1")] });
    const p = plan(s, "{1}");
    expect(p.taps.map((t) => t.permanentId)).toEqual(["m1"]);
    const emptied = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [], manaPool: { ...POOL0, G: 1 } } } };
    const out = commitPaymentPlan(emptied, "user", p);
    expect(poolTotal(out)).toBe(0); // the floating {G} paid the plan's spend; the Tender added nothing
    expect(manaEvents(out)).toEqual(["exile-gy-cost-unpaid"]);
  });

  it("⭐ the auto-tap: two Molt Tenders and one graveyard card don't cast Grizzly Bears", () => {
    const s = table([P("m1", MOLT), P("m2", MOLT)], { graveyard: [gyCard("g1")], hand: [{ ...BEARS, id: "h-bear" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
  });

  it("⭐ payGenericMana: two Molt Tenders and one graveyard card can't pay {2}", () => {
    const s = table([P("m1", MOLT), P("m2", MOLT)], { graveyard: [gyCard("g1")] });
    const r = payGenericMana(s, "user", 2);
    expect(r.paid).toBe(false);
    expect(gyIds(r.state)).toEqual(["g1"]);
  });

  it("⭐ a spell cast from the graveyard is on the stack, no card to exile (CR 601.2a): Think Twice alone isn't flashed back off Molt Tender", () => {
    const s = table([P("m1", MOLT), P("i1", ISLAND), P("i2", ISLAND)], { graveyard: [gyCard("gy-think", THINK_TWICE)] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "gy-think")).toBe(false);
  });

  it("⭐ with a second graveyard card, the flashback is paid by exiling THAT card; Think Twice resolves and is exiled once", () => {
    let s = table([P("m1", MOLT), P("i1", ISLAND), P("i2", ISLAND)], { graveyard: [gyCard("gy-think", THINK_TWICE), gyCard("g2")] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "gy-think");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    expect(exileNames(s)).toEqual(["Lightning Bolt"]);
    expect(s.stack.map((o) => o.source?.name || o.card?.name)).toContain("Think Twice");
  });

  it("⭐ Purple Pentapus is not exiled to pay for its own return: alone in the graveyard, Molt Tender can't fund it", () => {
    const s = table([P("m1", MOLT), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)], { graveyard: [gyCard("gy-pent", PENTAPUS)] });
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion")).toEqual([]);
  });

  it("control — two Molt Tenders and two graveyard cards pay {2}, exiling both, oldest first", () => {
    const s = table([P("m1", MOLT), P("m2", MOLT)], { graveyard: [gyCard("g1"), gyCard("g2")] });
    expect(affords(s, "{2}")).toBe(true);
    const out = commitPaymentPlan(s, "user", plan(s, "{2}"));
    expect(gyIds(out)).toEqual([]);
    expect(poolTotal(out)).toBe(0);
  });

  it("control — the explicit tap: Molt Tender exiles the oldest graveyard card for one mana", () => {
    let s = table([P("m1", MOLT)], { graveyard: [gyCard("g1"), gyCard("g2")] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.kind === "tap-for-mana" && a.permanentId === "m1" && a.color === "B");
    expect(tap).toBeTruthy();
    s = dispatchAction(s, tap);
    expect(gyIds(s)).toEqual(["g2"]);
    expect(s.players.user.manaPool.B).toBe(1);
  });
});

describe("life is spent once (CR 119.4): the payment's life costs together", () => {
  it("⭐ two Treasonous Ogres at 4 life: one {R} (3 life), never two (6)", () => {
    const s = table([P("o1", OGRE), P("o2", OGRE)], { life: 4 });
    expect(affords(s, "{R}")).toBe(true);
    expect(affords(s, "{R}{R}")).toBe(false);
  });

  it("⭐ Boseiju and Mana Confluence at 3 life: {C}, not {C}{1} (the payment keeps a life point, as each source alone does)", () => {
    const s = table([P("bo", BOSEIJU), P("mc", CONFLUENCE)], { life: 3 });
    expect(affords(s, "{C}")).toBe(true);
    expect(affords(s, "{C}{1}")).toBe(false);
  });

  it("⭐ commitManaTap with too little life to pay makes nothing (CR 119.4)", () => {
    const s = table([P("o1", OGRE)], { life: 2 });
    const out = commitManaTap(s, "user", { permanentId: "o1", color: "R", amount: 1, payLifeCost: 3, noTap: true });
    expect(poolTotal(out)).toBe(0);
    expect(out.players.user.life).toBe(2);
    expect(manaEvents(out)).toEqual(["pay-life-cost-unpaid"]);
  });

  it("⭐ Boseiju and two Mana Confluences at 3 life pay {2} with the Confluences (1 life left), not Boseiju + a Confluence (0)", () => {
    const s = table([P("bo", BOSEIJU), P("c1", CONFLUENCE), P("c2", CONFLUENCE)], { life: 3 });
    const p = plan(s, "{2}");
    expect(p).toBeTruthy();
    expect(p.taps.map((t) => t.permanentId).sort()).toEqual(["c1", "c2"]);
    expect(commitPaymentPlan(s, "user", p).players.user.life).toBe(1);
  });

  it("⭐ a life total that can't change pays no life (CR 119.8 — Teferi's Protection): Mana Confluence makes nothing", () => {
    const s = grantTeferiShield(table([P("mc", CONFLUENCE)]), "user");
    expect(affords(s, "{1}")).toBe(false);
    const out = commitManaTap(s, "user", { permanentId: "mc", color: "G", amount: 1, payLifeCost: 1 });
    expect(poolTotal(out)).toBe(0);
    expect(manaEvents(out)).toEqual(["pay-life-cost-unpaid"]);
  });

  it("control — two Mana Confluences at 3 life pay {2} and leave 1 life", () => {
    const s = table([P("c1", CONFLUENCE), P("c2", CONFLUENCE)], { life: 3 });
    expect(affords(s, "{2}")).toBe(true);
    const out = commitPaymentPlan(s, "user", plan(s, "{2}"));
    expect(out.players.user.life).toBe(1);
    expect(poolTotal(out)).toBe(0);
  });
});

describe("offers the payment would refuse", () => {
  it("⭐ Anaba Shaman with Phyrexian Altar as its only mana and itself the only creature: not offered", () => {
    const s = table([P("pa", PHYREXIAN_ALTAR), P("anaba", ANABA)]);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "anaba")).toEqual([]);
  });

  it("control — with another creature, Anaba Shaman is offered and the Altar eats the other one", () => {
    let s = table([P("pa", PHYREXIAN_ALTAR), P("anaba", ANABA), P("bear", BEARS)]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "anaba");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.players.user.battlefield.some((p) => p.id === "bear")).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "anaba").tapped).toBe(true);
  });

  it("⭐ Purple Pentapus + Cryptolith Rite: the creature the cost taps can't also tap for mana — one creature, no offer", () => {
    const s = table([P("rite", RITE), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)], { graveyard: [gyCard("gy-pent", PENTAPUS)] });
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion")).toEqual([]);
  });

  it("⭐ Purple Pentapus + Cryptolith Rite with two creatures: tapping one for the cost, the other pays the mana", () => {
    let s = table([P("rite", RITE), P("bear", BEARS), P("giant", HILL_GIANT), P("s1", SWAMP), P("s2", SWAMP)], { graveyard: [gyCard("gy-pent", PENTAPUS)] });
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion");
    expect(offers.map((a) => a.tapIds[0]).sort()).toEqual(["bear", "giant"]);
    const offered = s;
    expect(() => { s = dispatchAction(offered, offers.find((a) => a.tapIds[0] === "bear")); }).not.toThrow();
    expect(s.players.user.battlefield.find((p) => p.id === "bear").tapped).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "giant").tapped).toBe(true);
    expect(s.stack).toHaveLength(1);
  });
});
