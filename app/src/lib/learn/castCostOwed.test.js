/**
 * castCostOwed.test.js — what a cast owes, assembled in the one order of CR 601.2f ("the mana cost or alternative cost …, plus all
 * additional costs and cost increases, and minus all cost reductions", the mana component never below {0}) and paid in full.
 *   • A target tax is a cost increase: Boreal Elemental's / Sphinx of New Prahv's / Syr Elenora's "{2} more" joins the cost before the
 *     reductions, so a reduction larger than the mana cost's generic part is not lost (Boreal Elemental's ruling: "start with the mana
 *     cost or alternative cost you're paying, add any cost increases (such as that of Boreal Elemental), then apply any cost
 *     reductions").
 *   • "Without paying its mana cost" and a printed alternative cost that pays no mana are alternative costs of {0}; the increases and
 *     reductions apply to them (CR 118.9d; Force of Will's and Thalia, Guardian of Thraben's rulings), and the caster pays what they
 *     still owe — mana abilities are activated before the costs are paid, and the costs are paid in any order (CR 601.2g, 601.2h), so
 *     a Mountain Fireblast sacrifices may first tap for the tax. A cast whose owed mana can't be paid is not offered.
 *   • The AI casts a spell for the cheapest of the costs it is offered for the same cast — Dracogenesis' {0} over a Dragon's mana
 *     cost — and spends a once-each-turn grant on the costliest spell it reaches.
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import * as opponentAI from "./opponentAI.js";
import { actionLabel } from "./actionLabel.js";

beforeEach(() => _resetIdsForTests());

const { pickAction } = opponentAI;
// The AI's cost-variant filter (a test hook; absent on a tree without it — every test that reads it then fails on its assertion).
const __preferCheapestCostVariantForTests = (group, all) => (opponentAI.__preferCheapestCostVariantForTests ? opponentAI.__preferCheapestCostVariantForTests(group, all) : group);

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, mana_cost: mana, cmc, keywords: [], colors: [], oracle, ...extra });
const BOREAL = card("Boreal Elemental", "Creature — Elemental", "{4}{U}", 5, "Flying\nSpells your opponents cast that target this creature cost {2} more to cast.", { power: "3", toughness: "4", keywords: ["Flying"], colors: ["U"] });
const SPHINX = card("Sphinx of New Prahv", "Creature — Sphinx", "{W}{W}{U}{U}", 4, "Flying, vigilance\nSpells your opponents cast that target this creature cost {2} more to cast.", { power: "4", toughness: "3", keywords: ["Flying", "Vigilance"], colors: ["U", "W"] });
const ELENORA = card("Syr Elenora, the Discerning", "Legendary Creature — Human Knight", "{3}{U}{U}", 5, "Syr Elenora's power is equal to the number of cards in your hand.\nWhen Syr Elenora enters, draw a card.\nSpells your opponents cast that target Syr Elenora cost {2} more to cast.", { power: "*", toughness: "4", colors: ["U"] });
const ELECTROMANCER = card("Goblin Electromancer", "Creature — Goblin Wizard", "{U}{R}", 2, "Instant and sorcery spells you cast cost {1} less to cast.", { power: "2", toughness: "2", colors: ["R", "U"] });
const BARAL = card("Baral, Chief of Compliance", "Legendary Creature — Human Wizard", "{1}{U}", 2, "Instant and sorcery spells you cast cost {1} less to cast.\nWhenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card.", { power: "1", toughness: "3", colors: ["U"] });
const HELM = card("Helm of Awakening", "Artifact", "{2}", 2, "Spells cost {1} less to cast.");
const SPHERE = card("Sphere of Resistance", "Artifact", "{2}", 2, "Spells cost {1} more to cast.");
const THALIA = card("Thalia, Guardian of Thraben", "Legendary Creature — Human Soldier", "{1}{W}", 2, "First strike\nNoncreature spells cost {1} more to cast.", { power: "2", toughness: "1", keywords: ["First strike"], colors: ["W"] });
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, "Return target creature to its owner's hand.", { colors: ["U"] });
const LIGHTNING_BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const MURDER = card("Murder", "Instant", "{1}{B}{B}", 3, "Destroy target creature.", { colors: ["B"] });
const DIVINATION = card("Divination", "Sorcery", "{2}{U}", 3, "Draw two cards.", { colors: ["U"] });
const GRIZZLY_BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const BONE_SPLINTERS = card("Bone Splinters", "Sorcery", "{B}", 1, "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.", { colors: ["B"] });
const FIREBLAST = card("Fireblast", "Instant", "{4}{R}{R}", 6, "You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireblast deals 4 damage to any target.", { colors: ["R"] });
const GUSH = card("Gush", "Instant", "{4}{U}", 5, "You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards.", { colors: ["U"] });
const RAMOSIAN_RALLY = card("Ramosian Rally", "Instant", "{3}{W}", 4, "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.\nCreatures you control get +1/+1 until end of turn.", { colors: ["W"] });
const LLANOWAR_ELVES = card("Llanowar Elves", "Creature — Elf Druid", "{G}", 1, "{T}: Add {G}.", { power: "1", toughness: "1", colors: ["G"] });
const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", 0, "({T}: Add {R}.)");
const ISLAND = card("Island", "Basic Land — Island", "", 0, "({T}: Add {U}.)");
const PLAINS = card("Plains", "Basic Land — Plains", "", 0, "({T}: Add {W}.)");
const SWAMP = card("Swamp", "Basic Land — Swamp", "", 0, "({T}: Add {B}.)");
// The token text as the engine mints it (the minting cards' quoted ability).
const SPAWN = card("Eldrazi Spawn", "Token Creature — Eldrazi Spawn", "", 0, "Sacrifice this token: Add {C}.", { power: "0", toughness: "1" });
const DRACOGENESIS = card("Dracogenesis", "Enchantment", "{6}{R}{R}", 8, "You may cast Dragon spells without paying their mana costs.", { colors: ["R"] });
const SHIVAN_DRAGON = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", 6, "Flying\n{R}: This creature gets +1/+0 until end of turn.", { power: "5", toughness: "5", keywords: ["Flying"], colors: ["R"] });
const FIST = card("Fist of Suns", "Artifact", "{3}", 3, "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.");
const CRAW_WURM = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", 6, "", { power: "6", toughness: "4", colors: ["G"] });
const DARKSTEEL_MONOLITH = card("Darksteel Monolith", "Artifact", "{8}", 8, "Indestructible\nOnce each turn, you may pay {0} rather than pay the mana cost for a colorless spell you cast from your hand.", { keywords: ["Indestructible"] });
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", 2, "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.");
const WURMCOIL = card("Wurmcoil Engine", "Artifact Creature — Phyrexian Wurm", "{6}", 6, "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink.", { power: "6", toughness: "6", keywords: ["Lifelink", "Deathtouch"] });

const perm = (c, id, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
// The user casts; the AI seat holds the taxing permanents (aiBf). `active` = whose turn it is.
function board({ active = "user", hand = [], exile = [], bf = [], aiBf = [], aiHand = [], pool = {}, aiPool = {}, over = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, stack: [], pendingTriggers: [], ...over,
    players: { ...g.players,
      user: { ...g.players.user, hand, exile, graveyard: [], battlefield: bf, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } } } };
}
const casts = (s, id, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.cardId === id);
const at = (list, targetId) => list.find((a) => (a.targets || []).some((t) => t.id === targetId));
// The cost as printed mana symbols: generic first, then W U B R G C ("{0}" when nothing is owed).
const pips = (cost) => {
  if (!cost) return null;
  const out = (cost.generic ? `{${cost.generic}}` : "") + ["W", "U", "B", "R", "G", "C"].map((k) => `{${k}}`.repeat(cost[k] || 0)).join("");
  return out || "{0}";
};
const poolLeft = (s, seat = "user") => Object.values(s.players[seat].manaPool).reduce((n, v) => n + (Number(v) || 0), 0);
const tapped = (s, ids, seat = "user") => ids.filter((id) => s.players[seat].battlefield.find((p) => p.id === id)?.tapped);
const onStack = (s, name) => s.stack.some((o) => o.source?.name === name);

describe("⭐ a target tax is a cost increase: it joins the cost before the reductions (CR 601.2f; Boreal Elemental's ruling)", () => {
  it("⭐ Unsummon at Boreal Elemental under Goblin Electromancer and Baral costs {U} ({U} + {2} − {2}) — offered from one Island's {U}", () => {
    const s = board({ hand: [{ ...UNSUMMON, id: "un" }], bf: [perm(ELECTROMANCER, "e"), perm(BARAL, "b")], aiBf: [perm(BOREAL, "BOR", "ai"), perm(GRIZZLY_BEARS, "gb", "ai")], pool: { U: 1 } });
    const list = casts(s, "un");
    const row = { boreal: pips(at(list, "BOR")?.cost), bears: pips(at(list, "gb")?.cost) };
    console.log(`WITNESS targetTaxBeforeReductions ${JSON.stringify(row)}`);
    expect(row).toEqual({ boreal: "{U}", bears: "{U}" });
  });
  it("⭐ … and the dispatcher pays exactly that {U}: Unsummon goes on the stack aimed at Boreal Elemental and the pool is empty", () => {
    const s = board({ hand: [{ ...UNSUMMON, id: "un" }], bf: [perm(ELECTROMANCER, "e"), perm(BARAL, "b")], aiBf: [perm(BOREAL, "BOR", "ai")], pool: { U: 1 } });
    const cast = at(casts(s, "un"), "BOR");
    const out = cast ? dispatchAction(s, cast) : null;
    expect({ offered: !!cast, onStack: !!out && onStack(out, "Unsummon"), left: out ? poolLeft(out) : null }).toEqual({ offered: true, onStack: true, left: 0 });
  });
  it("⭐ Lightning Bolt at the Sphinx of New Prahv under one Electromancer costs {1}{R} ({R} + {2} − {1})", () => {
    const s = board({ hand: [{ ...LIGHTNING_BOLT, id: "lb" }], bf: [perm(ELECTROMANCER, "e")], aiBf: [perm(SPHINX, "SPX", "ai")], pool: { R: 1, C: 5 } });
    expect(pips(at(casts(s, "lb"), "SPX")?.cost)).toBe("{1}{R}");
  });
  it("⭐ Murder at Syr Elenora under two Electromancers costs {1}{B}{B} ({1}{B}{B} + {2} − {2})", () => {
    const s = board({ hand: [{ ...MURDER, id: "mu" }], bf: [perm(ELECTROMANCER, "e1"), perm(ELECTROMANCER, "e2")], aiBf: [perm(ELENORA, "ELE", "ai")], pool: { B: 2, C: 5 } });
    expect(pips(at(casts(s, "mu"), "ELE")?.cost)).toBe("{1}{B}{B}");
  });
  it("control: Murder at the Sphinx under one Electromancer — the reduction is not floored — stays {2}{B}{B}", () => {
    const s = board({ hand: [{ ...MURDER, id: "mu" }], bf: [perm(ELECTROMANCER, "e")], aiBf: [perm(SPHINX, "SPX", "ai")], pool: { B: 2, C: 5 } });
    expect(pips(at(casts(s, "mu"), "SPX")?.cost)).toBe("{2}{B}{B}");
  });
  it("control: with no reducer Lightning Bolt at the Sphinx costs {2}{R}; one Island's {U} doesn't fund Unsummon at Boreal Elemental under one Electromancer ({1}{U})", () => {
    const bolt = board({ hand: [{ ...LIGHTNING_BOLT, id: "lb" }], aiBf: [perm(SPHINX, "SPX", "ai")], pool: { R: 1, C: 5 } });
    const un = board({ hand: [{ ...UNSUMMON, id: "un" }], bf: [perm(ELECTROMANCER, "e")], aiBf: [perm(BOREAL, "BOR", "ai")], pool: { U: 1 } });
    expect({ bolt: pips(at(casts(bolt, "lb"), "SPX")?.cost), unsummon: !!at(casts(un, "un"), "BOR") }).toEqual({ bolt: "{2}{R}", unsummon: false });
  });
});

describe("⭐ a free cast and a no-mana alternative cost pay the mana they still owe (CR 118.9d, 601.2f–h)", () => {
  const discover = (c, extra = {}) => board({ exile: [{ ...c, id: "x" }], ...extra, over: { pendingDiscover: { controller: "user", cardId: "x" }, ...(extra.over || {}) } });
  it("⭐ a discovered Divination under the AI's Thalia owes {1}: offered at {1} with one Island's {U}, labelled with the payment", () => {
    const s = discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")], pool: { U: 1 } });
    const free = casts(s, "x").filter((a) => a.freeCast);
    const row = { costs: free.map((a) => pips(a.cost)), label: free[0] ? actionLabel(free[0]) : null };
    console.log(`WITNESS freeCastPaysTax ${JSON.stringify(row)}`);
    expect(row).toEqual({ costs: ["{1}"], label: "Cast Divination (pay {1})" });
  });
  it("⭐ … and the dispatcher pays it: the Island's {U} is spent, Divination is on the stack, the discover window is closed", () => {
    const s = discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")], pool: { U: 1 } });
    const cast = casts(s, "x").find((a) => a.freeCast);
    const out = cast ? dispatchAction(s, cast) : null;
    expect({ onStack: !!out && onStack(out, "Divination"), left: out ? poolLeft(out) : null, window: out ? out.pendingDiscover ?? null : "none" })
      .toEqual({ onStack: true, left: 0, window: null });
  });
  it("control: with no mana the discovered Divination under Thalia is not offered, and the to-hand choice stays", () => {
    const s = discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")] });
    const acts = legalActionsForPlayer(s, "user");
    expect({ free: acts.filter((a) => a.kind === "cast-spell").length, toHand: acts.some((a) => a.kind === "discover-to-hand") }).toEqual({ free: 0, toHand: true });
  });
  it("⭐ a cascaded Grizzly Bears under Sphere of Resistance is offered at {1} with a {G} floating", () => {
    const s = board({ exile: [{ ...GRIZZLY_BEARS, id: "x" }], aiBf: [perm(SPHERE, "s", "ai")], pool: { G: 1 }, over: { pendingCascade: { controller: "user", cardId: "x" } } });
    expect(casts(s, "x").filter((a) => a.freeCast).map((a) => pips(a.cost))).toEqual(["{1}"]);
  });
  it("⭐ a pending free cast (an Expertise window) offers Divination under Thalia at {1} from an Island", () => {
    const s = board({ hand: [{ ...DIVINATION, id: "x" }], bf: [perm(ISLAND, "i")], aiBf: [perm(THALIA, "t", "ai")],
      over: { pendingFreeCast: { controller: "user", candidateIds: ["x"], maxMv: 5, typeFilter: null, sourceName: "Expertise" } } });
    const free = casts(s, "x").filter((a) => a.freeCast);
    const out = free[0] ? dispatchAction(s, free[0]) : null;
    expect({ costs: free.map((a) => pips(a.cost)), islandTapped: out ? tapped(out, ["i"]).length : null }).toEqual({ costs: ["{1}"], islandTapped: 1 });
  });
  it("⭐ the tax AND a target tax on a free cast: a discovered Unsummon at Boreal Elemental under one Electromancer owes {1} ({0} + {2} − {1}); under two it owes {0}", () => {
    const one = discover(UNSUMMON, { bf: [perm(ELECTROMANCER, "e")], aiBf: [perm(BOREAL, "BOR", "ai")], pool: { U: 1 } });
    const two = discover(UNSUMMON, { bf: [perm(ELECTROMANCER, "e1"), perm(ELECTROMANCER, "e2")], aiBf: [perm(BOREAL, "BOR", "ai")] });
    const row = { one: pips(at(casts(one, "x"), "BOR")?.cost), two: pips(at(casts(two, "x"), "BOR")?.cost) };
    console.log(`WITNESS freeCastTargetTax ${JSON.stringify(row)}`);
    expect(row).toEqual({ one: "{1}", two: "{0}" });
  });
  it("⭐ Fireblast under Thalia with only the two Mountains it sacrifices: a Mountain taps for the {1} first (CR 601.2g), then both are sacrificed", () => {
    const s = board({ hand: [{ ...FIREBLAST, id: "fb" }], bf: [perm(MOUNTAIN, "m1"), perm(MOUNTAIN, "m2")], aiBf: [perm(THALIA, "t", "ai")] });
    const alt = at(casts(s, "fb").filter((a) => a.altCost), "ai");
    const out = alt ? dispatchAction(s, alt) : null;
    const row = { cost: pips(alt?.cost), onStack: !!out && onStack(out, "Fireblast"), mountainsLeft: out ? out.players.user.battlefield.length : null };
    console.log(`WITNESS altCostPaysTax ${JSON.stringify(row)}`);
    expect(row).toEqual({ cost: "{1}", onStack: true, mountainsLeft: 0 });
  });
  it("⭐ Gush under Thalia with two Islands: an Island taps for the {1}, then both return to hand", () => {
    const s = board({ hand: [{ ...GUSH, id: "gu" }], bf: [perm(ISLAND, "i1"), perm(ISLAND, "i2")], aiBf: [perm(THALIA, "t", "ai")] });
    const alt = casts(s, "gu").find((a) => a.altCost);
    const out = alt ? dispatchAction(s, alt) : null;
    expect({ cost: pips(alt?.cost), onStack: !!out && onStack(out, "Gush"), islandsInHand: out ? out.players.user.hand.filter((c) => c.name === "Island").length : null })
      .toEqual({ cost: "{1}", onStack: true, islandsInHand: 2 });
  });
  it("⭐ Ramosian Rally under Thalia: the Plains pays the {1} and the Llanowar Elves are tapped for the alternative cost", () => {
    const s = board({ hand: [{ ...RAMOSIAN_RALLY, id: "rr" }], bf: [perm(PLAINS, "p"), perm(LLANOWAR_ELVES, "el")], aiBf: [perm(THALIA, "t", "ai")] });
    const alt = casts(s, "rr").find((a) => a.altCost);
    const out = alt ? dispatchAction(s, alt) : null;
    expect({ cost: pips(alt?.cost), onStack: !!out && onStack(out, "Ramosian Rally"), tapped: out ? tapped(out, ["p", "el"]) : null })
      .toEqual({ cost: "{1}", onStack: true, tapped: ["p", "el"] });
  });
  it("⛔ control: Ramosian Rally under Thalia with the Plains tapped is not offered — the Elves it taps can't also pay the {1}", () => {
    const s = board({ hand: [{ ...RAMOSIAN_RALLY, id: "rr" }], bf: [perm(PLAINS, "p", "user", { tapped: true }), perm(LLANOWAR_ELVES, "el")], aiBf: [perm(THALIA, "t", "ai")] });
    expect(casts(s, "rr").filter((a) => a.altCost).length).toBe(0);
  });
  it("⭐ a discovered Bone Splinters under Thalia sacrificing the Eldrazi Spawn pays the {1} with a Swamp", () => {
    const s = discover(BONE_SPLINTERS, { bf: [perm(SPAWN, "sp"), perm(SWAMP, "sw")], aiBf: [perm(THALIA, "t", "ai"), perm(GRIZZLY_BEARS, "gb", "ai")] });
    const cast = at(casts(s, "x"), "gb");
    const out = cast ? dispatchAction(s, cast) : null;
    expect({ cost: pips(cast?.cost), sac: cast?.sacCreatureId ?? null, swampTapped: out ? tapped(out, ["sw"]).length : null }).toEqual({ cost: "{1}", sac: "sp", swampTapped: 1 });
  });
  it("⛔ control: … with the Spawn as its only mana it is not offered — the creature it sacrifices can't also be cracked for the {1}", () => {
    const s = discover(BONE_SPLINTERS, { bf: [perm(SPAWN, "sp")], aiBf: [perm(THALIA, "t", "ai"), perm(GRIZZLY_BEARS, "gb", "ai")] });
    expect(casts(s, "x").length).toBe(0);
  });
  it("control: Thalia's {1} cancelled by Helm of Awakening — the discovered Divination is free and pays nothing", () => {
    const s = discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")], bf: [perm(HELM, "h")] });
    expect(casts(s, "x").filter((a) => a.freeCast).map((a) => pips(a.cost))).toEqual(["{0}"]);
  });
});

describe("⭐ the AI pays the cheapest cost it is offered for the same cast (CR 118.9 — the caster picks one)", () => {
  // The AI seat casts on its own turn; `aiBf` holds its permanents, `aiHand` its cards.
  const aiPick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
  it("⭐ Dracogenesis: the AI casts Shivan Dragon for {0}, not its {4}{R}{R}, with six mana open", () => {
    const s = board({ active: "ai", aiHand: [{ ...SHIVAN_DRAGON, id: "sd" }], aiBf: [perm(DRACOGENESIS, "dg", "ai")], aiPool: { R: 2, C: 4 } });
    const pick = aiPick(s);
    const row = { card: pick?.name ?? null, cost: pips(pick?.cost), variant: pick?.altManaCost ?? "printed" };
    console.log(`WITNESS aiCheapestVariant ${JSON.stringify(row)}`);
    expect(row).toEqual({ card: "Shivan Dragon", cost: "{0}", variant: "granted" });
  });
  it("⭐ Fist of Suns: the AI casts Craw Wurm for the five pips ({W}{U}{B}{R}{G}), not its six-mana cost", () => {
    const s = board({ active: "ai", aiHand: [{ ...CRAW_WURM, id: "cw" }], aiBf: [perm(FIST, "f", "ai")], aiPool: { W: 1, U: 1, B: 1, R: 1, G: 2, C: 4 } });
    const pick = aiPick(s);
    expect({ card: pick?.name ?? null, cost: pips(pick?.cost) }).toEqual({ card: "Craw Wurm", cost: "{W}{U}{B}{R}{G}" });
  });
  it("control: Fist of Suns beside Grizzly Bears — the printed {1}{G} is cheaper and stays", () => {
    const s = board({ active: "ai", aiHand: [{ ...GRIZZLY_BEARS, id: "gb" }], aiBf: [perm(FIST, "f", "ai")], aiPool: { W: 1, U: 1, B: 1, R: 1, G: 2 } });
    const pick = aiPick(s);
    expect({ card: pick?.name ?? null, cost: pips(pick?.cost) }).toEqual({ card: "Grizzly Bears", cost: "{1}{G}" });
  });
  it("⭐ Darksteel Monolith's once-each-turn {0} goes to Mind Stone when it is the only colourless spell the AI can cast", () => {
    const s = board({ active: "ai", aiHand: [{ ...MIND_STONE, id: "ms" }], aiBf: [perm(DARKSTEEL_MONOLITH, "dm", "ai")], aiPool: { C: 2 } });
    const pick = aiPick(s);
    expect({ card: pick?.name ?? null, cost: pips(pick?.cost) }).toEqual({ card: "Mind Stone", cost: "{0}" });
  });
  it("⭐ … but with Wurmcoil Engine castable too, the {0} is kept for the costlier spell: Mind Stone's cast pays {2}, Wurmcoil Engine's {0}", () => {
    const s = board({ active: "ai", aiHand: [{ ...MIND_STONE, id: "ms" }, { ...WURMCOIL, id: "wc" }], aiBf: [perm(DARKSTEEL_MONOLITH, "dm", "ai")], aiPool: { C: 8 } });
    const all = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell");
    const kept = (id) => __preferCheapestCostVariantForTests(all.filter((a) => a.cardId === id), all).map((a) => pips(a.cost));
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    const row = { mindStone: kept("ms"), wurmcoil: kept("wc"), picked: pick?.name ?? null, pickedCost: pips(pick?.cost) };
    console.log(`WITNESS aiOncePerTurnGrant ${JSON.stringify(row)}`);
    expect(row).toEqual({ mindStone: ["{2}"], wurmcoil: ["{0}"], picked: "Mind Stone", pickedCost: "{2}" });
  });
  it("⭐ a cast aimed elsewhere is a different cast: Fiery Finish under Fist of Suns goes at the opponent's Craw Wurm, not the first creature offered, for the five pips", () => {
    const FIERY_FINISH = card("Fiery Finish", "Sorcery", "{4}{R}{R}", 6, "Fiery Finish deals 7 damage to target creature.", { colors: ["R"] });
    const s = board({ active: "ai", aiHand: [{ ...FIERY_FINISH, id: "ff" }], aiBf: [perm(FIST, "f", "ai")], bf: [perm(GRIZZLY_BEARS, "gb"), perm(CRAW_WURM, "cw")], aiPool: { W: 1, U: 1, B: 1, R: 2, G: 1, C: 4 } });
    const pick = aiPick(s);
    const row = { card: pick?.name ?? null, target: pick?.targets?.[0]?.id ?? null, cost: pips(pick?.cost) };
    console.log(`WITNESS aiVariantKeepsTargets ${JSON.stringify(row)}`);
    expect(row).toEqual({ card: "Fiery Finish", target: "cw", cost: "{W}{U}{B}{R}{G}" });
  });
  it("control: a kicked cast is not a cost variant of the plain one — Kavu Titan's kicked cast is still the AI's pick under Fist of Suns", () => {
    const KAVU_TITAN = card("Kavu Titan", "Creature — Kavu", "{1}{G}", 2, "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample.", { power: "2", toughness: "2", keywords: ["Kicker"], colors: ["G"] });
    const s = board({ active: "ai", aiHand: [{ ...KAVU_TITAN, id: "kt" }], aiBf: [perm(FIST, "f", "ai")], aiPool: { W: 1, U: 1, B: 1, R: 1, G: 2, C: 3 } });
    const pick = aiPick(s);
    expect({ card: pick?.name ?? null, kicked: pick?.kicked ?? null, cost: pips(pick?.cost) }).toEqual({ card: "Kavu Titan", kicked: true, cost: "{3}{G}{G}" });
  });
});
