/**
 * counterRemovalNoTapMana.test.js — "Remove a <K> counter from this <artifact|creature|enchantment>: Add …" with NO {T} (Pentad Prism,
 * Gemstone Array — census rank 58 of the 09-06 plan's stage ③, 2026-09-30 — and the rest of the vein: Crystalline Crawler,
 * Morselhoarder, Workhorse, Druids' Repository).
 *
 * The mana model refused every remove-a-counter mana cost ("not a free, tapless, repeatable source" — reading it minted
 * phantom mana), and coverage stripped the line with a note to relax it "when a counter-cost mana subsystem lands". It lands
 * here for the no-{T} form: each activation pays ONE counter for ONE mana (its colour chosen per activation), so the permanent
 * is as many one-mana sources as it has counters. manaSources expands it (`repeatable`, `noTap`), the planner lets those
 * records coexist (a permanent's OTHER lines share one {T} and still exclude each other), and the commit removes exactly one
 * counter per record and never taps. Usable tapped and summoning-sick (no {T}, CR 302.6); never doubled by Mana Reflection
 * (not tapped for mana). Coverage relaxes its strip in lockstep: a line survives only when manaProduction models it this way.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { manaSources, planPayment, canAfford, commitPaymentPlan } from "./manaModel.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PRISM = { name: "Pentad Prism", type: "Artifact", mana: "{2}", keywords: ["Sunburst"],
  oracle: "Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\nRemove a charge counter from this artifact: Add one mana of any color." };
const ARRAY = { name: "Gemstone Array", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "{2}: Put a charge counter on this artifact.\nRemove a charge counter from this artifact: Add one mana of any color." };
const CRAWLER = { name: "Crystalline Crawler", type: "Artifact Creature — Construct", mana: "{4}", power: "1", toughness: "1", keywords: ["Converge"],
  oracle: "Converge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nRemove a +1/+1 counter from this creature: Add one mana of any color.\n{T}: Put a +1/+1 counter on this creature." };
const MORSEL = { name: "Morselhoarder", type: "Creature — Elemental", mana: "{4}{R/G}{R/G}", power: "6", toughness: "4", keywords: [],
  oracle: "This creature enters with two -1/-1 counters on it.\nRemove a -1/-1 counter from this creature: Add one mana of any color." };
const WORKHORSE = { name: "Workhorse", type: "Artifact Creature — Horse", mana: "{6}", power: "0", toughness: "0", keywords: [],
  oracle: "This creature enters with four +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: Add {C}." };
const REPOSITORY = { name: "Druids' Repository", type: "Enchantment", mana: "{1}{G}{G}", keywords: [],
  oracle: "Whenever a creature you control attacks, put a charge counter on this enchantment.\nRemove a charge counter from this enchantment: Add one mana of any color." };
const MANA_BLOOM = { name: "Mana Bloom", type: "Enchantment", mana: "{X}{G}", keywords: [],
  oracle: "This enchantment enters with X charge counters on it.\nRemove a charge counter from this enchantment: Add one mana of any color. Activate only once each turn.\nAt the beginning of your upkeep, if this enchantment has no charge counters on it, return it to its owner's hand." };
const MANA_CACHE = { name: "Mana Cache", type: "Enchantment", mana: "{1}{R}{R}", keywords: [],
  oracle: "At the beginning of each player's end step, put a charge counter on this enchantment for each untapped land that player controls.\nRemove a charge counter from this enchantment: Add {C}. Any player may activate this ability but only during their turn before the end step." };
const TRILOBITE = { name: "Cryptic Trilobite", type: "Creature — Trilobite", mana: "{X}{X}", power: "0", toughness: "0", keywords: [],
  oracle: "This creature enters with X +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: Add {C}{C}. Spend this mana only to activate abilities.\n{1}, {T}: Put a +1/+1 counter on this creature." };
const REFLECTION = { name: "Mana Reflection", type: "Enchantment", mana: "{4}{G}{G}", keywords: [], oracle: "If you tap a permanent for mana, it produces twice as much of that mana instead." };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", keywords: [], oracle: "({T}: Add {W}.)" };
const BEARS = { id: "h-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (id, card, { counters = {}, tapped = false, sick = false } = {}) =>
  ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: sick }), counters, tapped });
function board(user, { hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...EMPTY } } } };
}
const onBoard = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

describe("the tiers — the six carriers credit, the riders still park", () => {
  it("⭐ Pentad Prism, Gemstone Array, Crystalline Crawler, Morselhoarder, Workhorse, Druids' Repository → native-mana", () => {
    expect([PRISM, ARRAY, CRAWLER, MORSEL, WORKHORSE, REPOSITORY].map(classifyCard)).toEqual(Array(6).fill("native-mana"));
  });
  it("⛔ VACUITY CONTROLS — a rider on the line fails the anchor: Mana Bloom, Mana Cache, Cryptic Trilobite stay off native", () => {
    for (const card of [MANA_BLOOM, MANA_CACHE, TRILOBITE]) expect(classifyCard(card)).not.toMatch(/^native-/);
  });
});

describe("the sources — one record per counter, tapped and summoning-sick alike", () => {
  it("⭐ Pentad Prism with two charge counters is two one-mana, any-colour, no-tap records; with none it is nothing", () => {
    const recs = manaSources(board([perm("prism", PRISM, { counters: { charge: 2 } })]), "user");
    expect(recs).toEqual(Array(2).fill({ permanentId: "prism", colors: ["W", "U", "B", "R", "G"], amount: 1, removesCounters: { type: "charge", count: 1 }, repeatable: true, noTap: true }));
    expect(manaSources(board([perm("prism", PRISM, { counters: {} })]), "user")).toEqual([]);
  });
  it("a TAPPED Crystalline Crawler and a summoning-sick Workhorse still offer their counters (no {T} in the cost)", () => {
    expect(manaSources(board([perm("crawler", CRAWLER, { counters: { "+1/+1": 3 }, tapped: true })]), "user")).toHaveLength(3);
    expect(manaSources(board([perm("horse", WORKHORSE, { counters: { "+1/+1": 4 }, sick: true })]), "user").map((r) => r.colors)).toEqual(Array(4).fill(["C"]));
  });
  it("⭐ every carrier: two counters of its own kind → two records of its own colours (WITNESS carrierRecords)", () => {
    const table = [[PRISM, "charge"], [ARRAY, "charge"], [CRAWLER, "+1/+1"], [MORSEL, "-1/-1"], [WORKHORSE, "+1/+1"], [REPOSITORY, "charge"]];
    const got = Object.fromEntries(table.map(([card, kind]) => {
      const recs = manaSources(board([perm("x", card, { counters: { [kind]: 2 } })]), "user");
      return [card.name, recs.map((r) => `${r.colors.join("")}:${r.removesCounters.type}`)];
    }));
    expect(got).toEqual({
      "Pentad Prism": ["WUBRG:charge", "WUBRG:charge"], "Gemstone Array": ["WUBRG:charge", "WUBRG:charge"],
      "Crystalline Crawler": ["WUBRG:+1/+1", "WUBRG:+1/+1"], "Morselhoarder": ["WUBRG:-1/-1", "WUBRG:-1/-1"],
      "Workhorse": ["C:+1/+1", "C:+1/+1"], "Druids' Repository": ["WUBRG:charge", "WUBRG:charge"],
    });
    console.log(`WITNESS carrierRecords ${JSON.stringify(got)}`);
  });
  it("Morselhoarder pays with a -1/-1 counter — and GROWS for it", () => {
    const s = board([perm("mh", MORSEL, { counters: { "-1/-1": 2 } })]);
    const after = commitPaymentPlan(s, "user", planPayment(EMPTY, manaSources(s, "user"), parseManaCost("{R}")));
    expect({ counters: onBoard(after, "mh").counters["-1/-1"], power: permanentPower(after, "mh") }).toEqual({ counters: 1, power: 5 });
  });
  it("Mana Reflection doesn't double it — the mana isn't tapped for", () => {
    const recs = manaSources(board([perm("prism", PRISM, { counters: { charge: 1 } }), perm("refl", REFLECTION)]), "user");
    expect(recs.map((r) => r.amount)).toEqual([1]);
  });
});

describe("the payment — several activations of one permanent, the counters paid, nothing tapped", () => {
  it("⭐ {W}{U} from one Pentad Prism: two activations, two colours, both counters gone, the Prism untapped", () => {
    const one = board([perm("prism", PRISM, { counters: { charge: 1 } })]);
    const two = board([perm("prism", PRISM, { counters: { charge: 2 } })]);
    expect(canAfford(EMPTY, manaSources(one, "user"), parseManaCost("{W}{U}"))).toBe(false);   // vacuity control: one counter
    const plan = planPayment(EMPTY, manaSources(two, "user"), parseManaCost("{W}{U}"));
    const after = commitPaymentPlan(two, "user", plan);
    const result = { taps: plan.taps.map((t) => t.color).sort(), charge: onBoard(after, "prism").counters.charge ?? 0, tapped: !!onBoard(after, "prism").tapped,
      pool: after.players.user.manaPool };
    expect(result).toEqual({ taps: ["U", "W"], charge: 0, tapped: false, pool: EMPTY });
    console.log(`WITNESS prismPaysTwo ${JSON.stringify(result)}`);
  });
  it("the planner spends a free source first — a Plains pays {W} and the Prism keeps its counter", () => {
    const s = board([perm("plains", PLAINS), perm("prism", PRISM, { counters: { charge: 1 } })]);
    const after = commitPaymentPlan(s, "user", planPayment(EMPTY, manaSources(s, "user"), parseManaCost("{W}")));
    expect({ plains: !!onBoard(after, "plains").tapped, charge: onBoard(after, "prism").counters.charge }).toEqual({ plains: true, charge: 1 });
  });
  it("Workhorse pays {C} with a +1/+1 counter — and is smaller for it (a real cost)", () => {
    const s = board([perm("horse", WORKHORSE, { counters: { "+1/+1": 4 } })]);
    const after = commitPaymentPlan(s, "user", planPayment(EMPTY, manaSources(s, "user"), parseManaCost("{1}")));
    expect({ counters: onBoard(after, "horse").counters["+1/+1"], power: permanentPower(after, "horse") }).toEqual({ counters: 3, power: 3 });
  });
});

describe("the offers", () => {
  it("⭐ the real cast: Grizzly Bears is offered from Pentad Prism alone, and casting it spends both counters", () => {
    const s = board([perm("prism", PRISM, { counters: { charge: 2 } })], { hand: [BEARS] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bears");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    const result = { onStack: (after.stack || []).map((o) => o.source?.name ?? o.source), charge: onBoard(after, "prism").counters.charge ?? 0, tapped: !!onBoard(after, "prism").tapped };
    expect(result).toEqual({ onStack: ["Grizzly Bears"], charge: 0, tapped: false });
    console.log(`WITNESS prismCast ${JSON.stringify(result)}`);
  });
  it("⛔ no direct tap-for-mana action — it would add the mana without paying the counter", () => {
    const s = board([perm("prism", PRISM, { counters: { charge: 2 } })]);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "prism")).toEqual([]);
  });
});
