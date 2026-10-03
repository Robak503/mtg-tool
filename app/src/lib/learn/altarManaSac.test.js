/**
 * altarManaSac.test.js — SG-3 (2026-09-03): the SACRIFICE-A-CREATURE mana cost — Ashnod's Altar ("Sacrifice a
 * creature: Add {C}{C}") and Phyrexian Altar ("Sacrifice a creature: Add one mana of any color"), both in
 * Colton's Squirrel Girl deck. Until now a non-self sacrifice was refused as PHANTOM mana (the sim would
 * have "paid" it for free every turn). It is paid for real now, exactly as the exile-from-graveyard cost
 * is: the production carries `sacrificesCreature`, manaSources offers the source only while ANOTHER
 * creature is there to feed it, and commitManaTap sacrifices the least-valuable one through the dies
 * chokepoint — dies triggers fire, the source itself is never the victim.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, planPayment, commitPaymentPlan, costReservedPermanentIds, withoutUnfeedableSacSources, castPaymentSources } from "./manaModel.js";
import { parseManaCost, legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ASHNOD = { id: "c-ashnod", name: "Ashnod's Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add {C}{C}." };
const PHYREXIAN = { id: "c-phyrexian", name: "Phyrexian Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add one mana of any color." };
const creature = (id, name, mana, extra = {}) => createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Bear", mana, mana_cost: mana, power: 2, toughness: 2, oracle: "", ...extra }, controller: "user", summoningSick: false });

describe("the production flag — exactly 'Sacrifice a creature'", () => {
  it("reads both Altars with sacrificesCreature; a self-sac, a typed sac and a rider are not carved out", () => {
    expect(manaProduction(ASHNOD)).toMatchObject({ colors: ["C"], amount: 2, sacrificesCreature: true });
    expect(manaProduction(PHYREXIAN)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrificesCreature: true });
    expect(manaProduction({ name: "Probe Artifact Sac", type: "Artifact", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBeFalsy();
    expect(manaProduction({ name: "Probe Saproling Sac", type: "Artifact", oracle: "Sacrifice a Saproling: Add {C}{C}." })).toBeFalsy();
  });

  it("⛔ a card with a FREE tap beside a sacrifice line keeps the free tap and is NOT stamped (Phyrexian Tower)", () => {
    // The production is the free "{T}: Add {C}"; stamping sacrificesCreature on it would feed a creature to
    // every {C}. The sac line stays an honest under-offer.
    const tower = manaProduction({ name: "Phyrexian Tower", type: "Legendary Land", oracle: "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}." });
    expect(tower).toMatchObject({ colors: ["C"], amount: 1 });
    expect(tower.sacrificesCreature).toBeFalsy();
  });
});

function board(altar, creatures) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "altar", card: altar, controller: "user", summoningSick: false }), ...creatures], graveyard: [], hand: [], library: [{ id: "L0", name: "Forest", type: "Basic Land — Forest" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const altarSource = (s) => manaSources(s, "user").find((x) => x.permanentId === "altar");

describe("the offer gate — another creature must be there to feed it", () => {
  it("⛔ Ashnod's Altar alone is no source; with a creature it offers {C}{C} tagged sacrificesCreature", () => {
    expect(altarSource(board(ASHNOD, []))).toBeUndefined();
    const src = altarSource(board(ASHNOD, [creature("bear", "Grizzly Bears", "{1}{G}")]));
    expect(src).toMatchObject({ amount: 2, sacrificesCreature: true });
  });
});

describe("the payment — the least-valuable OTHER creature dies through the chokepoint", () => {
  it("⭐ paying {C}{C} off Ashnod's Altar sacrifices the cheapest creature, never the Altar; dies triggers fire", () => {
    const s = board(ASHNOD, [
      creature("big", "Big Bear", "{4}{G}"),
      creature("small", "Small Bear", "{G}", { oracle: "When this creature dies, draw a card." }),
    ]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "altar");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{C}{C}"));
    expect(plan).toBeTruthy();
    const out = commitPaymentPlan(s, "user", plan);
    const names = (id) => out.players.user.battlefield.some((p) => p.id === id);
    expect(names("altar")).toBe(true);
    expect(names("big")).toBe(true);
    expect(names("small")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.name === "Small Bear")).toBe(true);
    // the sacrificed creature's own dies trigger reached the pending-trigger queue / stack
    expect(((out.pendingTriggers || []).length + (out.stack || []).length) > 0).toBe(true);
    expect(out.log.some((e) => e.event === "sacrifice-creature-cost" && e.victimName === "Small Bear")).toBe(true);
  });

  it("Phyrexian Altar pays a colored pip the same way", () => {
    const s = board(PHYREXIAN, [creature("bear", "Grizzly Bears", "{1}{G}")]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "altar");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{G}"));
    expect(plan).toBeTruthy();
    const out = commitPaymentPlan(s, "user", plan);
    expect(out.players.user.battlefield.some((p) => p.id === "bear")).toBe(false);
    expect(out.players.user.battlefield.some((p) => p.id === "altar")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// THE ALTAR AND THE REST OF THE PAYMENT (2026-10-03). The Altar picks its victim as it commits. Committed in plan
// order it could sacrifice a creature a later tap of the same plan still named (creatures tap for mana beside
// Cryptolith Rite / Enduring Vitality) — "Permanent … not found" — or the very creature the action sacrifices as
// its own cost — "Sacrifice victim … not on battlefield". Seven of Omnath's Squirrel Girl seeds ended that way.
// Real fixtures (bundled Scryfall data).
// ---------------------------------------------------------------------------------------------------------
const CRYPTOLITH_RITE = {"name":"Cryptolith Rite","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Creatures you control have \"{T}: Add one mana of any color.\""};
const NATURAL_ORDER = {"name":"Natural Order","type":"Sorcery","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle."};
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","cmc":4,"keywords":["I LOVE Squirrels!"],"colors":["G"],"oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control.","power":"4","toughness":"4"};
const SQUIRREL_TOKEN = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };

describe("the Altar and the rest of the payment", () => {
  const rite = () => createPermanent({ id: "rite", card: { ...CRYPTOLITH_RITE, id: "c-rite" }, controller: "user", summoningSick: false });
  const withRite = (creatures) => {
    const s = board(PHYREXIAN, creatures);
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, rite()] } } };
  };
  const onBattlefield = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

  it("⭐ a plan that taps creatures for mana AND feeds the Altar commits: the taps first, the sacrifice last", () => {
    // {3} from two creatures (Cryptolith Rite) and the Altar. The Altar sits FIRST in the plan here; committed first, it
    // would sacrifice the cheaper creature and the plan's next tap would not find it.
    const s = withRite([creature("cheap", "Cheap Bear", "{G}"), creature("dear", "Dear Bear", "{4}{G}")]);
    const all = manaSources(s, "user");
    const sources = [all.find((x) => x.permanentId === "altar"), ...all.filter((x) => x.permanentId !== "altar")];
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{3}"));
    expect(plan.taps.map((t) => t.permanentId).sort()).toEqual(["altar", "cheap", "dear"]);
    expect(plan.taps[0].permanentId).toBe("altar");
    const out = commitPaymentPlan(s, "user", plan);
    expect(onBattlefield(out, "cheap")).toBeUndefined();           // fed to the Altar — after it was tapped for mana
    expect(onBattlefield(out, "dear").tapped).toBe(true);
    expect(Object.values(out.players.user.manaPool).reduce((a, b) => a + b, 0)).toBe(0); // 3 made, 3 spent
    expect(out.log.filter((e) => e.event === "sacrifice-creature-cost").map((e) => e.victimName)).toEqual(["Cheap Bear"]);
  });

  it("a plan with no Altar keeps its tap order", () => {
    const s = withRite([creature("a", "Bear A", "{G}"), creature("b", "Bear B", "{G}")]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId !== "altar").reverse();
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{2}"));
    const order = [];
    const out = plan.taps.reduce((st, t) => { order.push(t.permanentId); return st; }, commitPaymentPlan(s, "user", plan));
    expect(order).toEqual(plan.taps.map((t) => t.permanentId));
    expect(out.log.filter((e) => e.kind === "mana" && /sacrifice/.test(String(e.event)))).toEqual([]);
  });

  it("the Altar never takes a permanent the action's own costs still need", () => {
    const s = board(PHYREXIAN, [creature("cheap", "Cheap Bear", "{G}"), creature("dear", "Dear Bear", "{4}{G}")]);
    const sources = manaSources(s, "user").filter((x) => x.permanentId === "altar");
    const plan = planPayment(s.players.user.manaPool, sources, parseManaCost("{G}"));
    const free = commitPaymentPlan(s, "user", plan);
    expect(onBattlefield(free, "cheap")).toBeUndefined();          // the least valuable, as before
    const reserved = commitPaymentPlan(s, "user", plan, { reserved: new Set(["cheap"]) });
    expect(onBattlefield(reserved, "cheap")).toBeTruthy();
    expect(onBattlefield(reserved, "dear")).toBeUndefined();
  });

  it("costReservedPermanentIds: the cost permanents an action names, and its source only when the source pays with itself", () => {
    const ids = (action) => [...costReservedPermanentIds(action)].sort();
    expect(ids({ sacCreatureId: "a", sacCountIds: ["b", "c"], sacXIds: ["d"], sacLandIds: ["e"], sacId: "f", tapCreatureId: "g", tapCountIds: ["h"],
      tapIds: ["i"], teamworkTapIds: ["j"], returnLandId: "k", returnLandIds: ["l"], returnPermId: "m", unattachEquipmentId: "n" }))
      .toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"]);
    expect(ids({ permanentId: "src" })).toEqual([]);
    expect(ids({ permanentId: "src", tapSelf: true })).toEqual(["src"]);
    expect(ids({ permanentId: "src", sacSelf: true })).toEqual(["src"]);
    expect(ids({ permanentId: "src", exileSelf: true })).toEqual(["src"]);
    expect(ids({ sacCreatureId: null, sacCountIds: null })).toEqual([]);
    expect(ids(null)).toEqual([]);
  });

  it("withoutUnfeedableSacSources: the Altar is no source when every other creature is claimed by the action", () => {
    const one = board(PHYREXIAN, [creature("only", "Only Bear", "{G}")]);
    const two = board(PHYREXIAN, [creature("only", "Only Bear", "{G}"), creature("spare", "Spare Bear", "{G}")]);
    const altarIn = (s, reserved) => withoutUnfeedableSacSources(s, "user", manaSources(s, "user"), reserved).some((x) => x.permanentId === "altar");
    expect(altarIn(one, new Set(["only"]))).toBe(false);
    expect(altarIn(two, new Set(["only"]))).toBe(true);
    expect(altarIn(one, new Set())).toBe(true);
    expect(altarIn(one, null)).toBe(true);
    expect(altarIn(one, new Set(["altar"]))).toBe(true);           // the Altar itself is never its own victim, reserved or not
    const noAltar = manaSources({ ...one, players: { ...one.players, user: { ...one.players.user, battlefield: one.players.user.battlefield.filter((p) => p.id !== "altar") } } }, "user");
    expect(withoutUnfeedableSacSources(one, "user", noAltar, new Set(["only"]))).toBe(noAltar);
  });

  it("⭐ Natural Order with only its own victim on the battlefield: the Altar cannot help pay for it", () => {
    // Four Forests pay for it; with three, the fourth mana would have to be the Altar eating the green creature the spell
    // itself sacrifices.
    const forest = (i) => createPermanent({ id: `forest${i}`, card: { id: `c-forest${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)", mana: "" }, controller: "user", summoningSick: false });
    const elf = () => createPermanent({ id: "elf", card: { id: "c-elf", name: "Green Bear", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", power: 2, toughness: 2, oracle: "", colors: ["G"] }, controller: "user", summoningSick: true });
    const state = (forests) => {
      const s = board(PHYREXIAN, [elf()]);
      return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...Array.from({ length: forests }, (_, i) => forest(i))],
        hand: [{ ...NATURAL_ORDER, id: "order" }], library: [{ id: "L0", name: "Green Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "", colors: ["G"] }] } } };
    };
    const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "order");
    expect(casts(state(3))).toHaveLength(0);
    // the payment side reads the same sources: the Altar is not one of them for this cast
    const paySources = (s) => castPaymentSources(s, { playerId: "user", sacCreatureId: "elf" }).map((x) => x.permanentId);
    expect(paySources(state(3))).not.toContain("altar");
    expect(manaSources(state(3), "user").map((x) => x.permanentId)).toContain("altar");
    const four = casts(state(4));
    expect(four.length).toBeGreaterThan(0);
    expect(four[0].sacCreatureId).toBe("elf");
    const after = dispatchAction(state(4), four[0]);
    expect(after.stack).toHaveLength(1);
    expect(after.players.user.graveyard.some((c) => c.name === "Green Bear")).toBe(true);
  });

  it("⭐ Squirrel Girl's ability paid with Squirrels that tap for mana and the Altar: the game goes on", () => {
    const sg = createPermanent({ id: "sg", card: { ...SQUIRREL_GIRL, id: "c-sg" }, controller: "user", summoningSick: true });
    const squirrel = (i) => createPermanent({ id: `sq${i}`, card: { ...SQUIRREL_TOKEN, id: `tok-sq${i}` }, controller: "user", summoningSick: false });
    const s = withRite([sg, squirrel(0), squirrel(1), squirrel(2)]);
    // Squirrel Girl is summoning sick (she cannot tap for mana): three Squirrels + the Altar are exactly {1}{G}{G}{G}.
    const activate = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sg");
    expect(activate).toBeTruthy();
    const after = dispatchAction(s, activate);
    expect(after.stack).toHaveLength(1);
    const left = after.players.user.battlefield.filter((p) => p.card.name === "Squirrel");
    expect(left).toHaveLength(2);                                   // one Squirrel fed the Altar
    expect(left.every((p) => p.tapped)).toBe(true);
    expect(onBattlefield(after, "sg")).toBeTruthy();
  });
});

describe("classification", () => {
  it("both Altars are native-mana; the artifact-sac and typed-sac probes stay body-only", () => {
    expect(classifyCard(ASHNOD)).toBe("native-mana");
    expect(classifyCard(PHYREXIAN)).toBe("native-mana");
    expect(classifyCard({ name: "Probe Artifact Sac", type: "Artifact", mana: "{3}", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBe("body-only");
  });
});
