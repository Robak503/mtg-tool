/**
 * grantedZeroAltCost.test.js — a board-granted alternative cost of {0} (CR 118.9): Rooftop Storm (EDHREC #2274), Dracogenesis (#2254),
 * Darksteel Monolith (#2380), As Foretold (#1884).
 *
 * The hand-cast enumeration offers it beside the mana cost, assembled like any alternative cost (CR 601.2f, 118.9d): the static taxes
 * apply (under Sphere of Resistance the {0} is {1}), an {X} spell is not offered it (X would be 0, CR 107.3b), a cast whose cost carries
 * additional mana is not twinned. The spell filter reads the face being cast; Darksteel Monolith's and As Foretold's "Once each turn"
 * latch the granting permanent for the turn; As Foretold reads its own time counters, which its upkeep trigger adds.
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, resolveTopOfStack, runStepActions, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, mana_cost: mana, cmc, keywords: [], colors: [], oracle, ...extra });
const ROOFTOP_STORM = card("Rooftop Storm", "Enchantment", "{5}{U}", 6, "You may pay {0} rather than pay the mana cost for Zombie creature spells you cast.", { colors: ["U"] });
const DRACOGENESIS = card("Dracogenesis", "Enchantment", "{6}{R}{R}", 8, "You may cast Dragon spells without paying their mana costs.", { colors: ["R"] });
const DARKSTEEL_MONOLITH = card("Darksteel Monolith", "Artifact", "{8}", 8, "Indestructible\nOnce each turn, you may pay {0} rather than pay the mana cost for a colorless spell you cast from your hand.", { keywords: ["Indestructible"] });
const AS_FORETOLD = card("As Foretold", "Enchantment", "{2}{U}", 3, "At the beginning of your upkeep, put a time counter on this enchantment.\nOnce each turn, you may pay {0} rather than pay the mana cost for a spell you cast with mana value X or less, where X is the number of time counters on this enchantment.", { colors: ["U"] });
const SPHERE = card("Sphere of Resistance", "Artifact", "{2}", 2, "Spells cost {1} more to cast.");
const FIST = card("Fist of Suns", "Artifact", "{3}", 3, "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.");
const GRAY_MERCHANT = card("Gray Merchant of Asphodel", "Creature — Zombie", "{3}{B}{B}", 5, "When this creature enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)", { power: "2", toughness: "4", colors: ["B"] });
const CHANGELING_OUTCAST = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", 1, "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.", { power: "1", toughness: "1", keywords: ["Changeling"], colors: ["B"] });
const SHIVAN_DRAGON = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", 6, "Flying\n{R}: This creature gets +1/+0 until end of turn.", { power: "5", toughness: "5", keywords: ["Flying"], colors: ["R"] });
const WURMCOIL = card("Wurmcoil Engine", "Artifact Creature — Phyrexian Wurm", "{6}", 6, "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink.", { power: "6", toughness: "6", keywords: ["Lifelink", "Deathtouch"] });
const KOZILEKS_RETURN = card("Kozilek's Return", "Instant", "{2}{R}", 3, "Devoid (This card has no color.)\nKozilek's Return deals 2 damage to each creature.\nWhenever you cast an Eldrazi creature spell with mana value 7 or greater, you may exile this card from your graveyard. If you do, this card deals 5 damage to each creature.", { keywords: ["Devoid"] });
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", 2, "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.");
const ENDLESS_ONE = card("Endless One", "Creature — Eldrazi", "{X}", 0, "This creature enters with X +1/+1 counters on it.", { power: "0", toughness: "0" });
const LAVA_AXE = card("Lava Axe", "Sorcery", "{4}{R}", 5, "Lava Axe deals 5 damage to target player or planeswalker.", { colors: ["R"] });

const perm = (c, id, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function board({ hand = [], bf = [], pool = {}, over = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], ...over,
    players: { ...g.players, user: { ...g.players.user, hand: hand.map((c, i) => ({ ...c, id: c.id || `h${i}` })), battlefield: bf, manaPool: { ...EMPTY_POOL, ...pool } } } };
}
const casts = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === id);
const pips = (cost) => ((cost.generic ? `{${cost.generic}}` : "") + ["W", "U", "B", "R", "G", "C"].map((k) => `{${k}}`.repeat(cost[k] || 0)).join("")) || "{0}";
const offer = (s, id) => [...new Set(casts(s, id).map((a) => `${a.altManaCost || "printed"} ${pips(a.cost)}`))];

describe("the four lines", () => {
  it("⭐ each line parses to a {0} grant and each card reads native", () => {
    const row = Object.fromEntries([ROOFTOP_STORM, DRACOGENESIS, DARKSTEEL_MONOLITH, AS_FORETOLD].map((c) => [c.name, { statics: parseStaticAbilities(c).filter((d) => d.grantedZeroAltCost).map((d) => d.grantedZeroAltCost), native: isNativeTier(classifyCard(c)) }]));
    console.log(`WITNESS zeroGrantLines ${JSON.stringify(row)}`);
    expect(row).toEqual({
      "Rooftop Storm": { statics: [{ subtype: "Zombie", cardType: "Creature" }], native: true },
      Dracogenesis: { statics: [{ subtype: "Dragon" }], native: true },
      "Darksteel Monolith": { statics: [{ colorless: true, oncePerTurn: true }], native: true },
      "As Foretold": { statics: [{ maxManaValueCounter: "time", oncePerTurn: true }], native: true },
    });
  });
  it("control: the exile-zone sibling (Charred Foyer's \"a spell you cast from exile\") stays unread", () => {
    expect(parseStaticAbilities(card("Charred Foyer", "Enchantment — Room", "{3}{R}", 4, "Once each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile.")).some((d) => d.grantedZeroAltCost)).toBe(false);
  });
});

describe("⭐ Rooftop Storm — Zombie creature spells", () => {
  it("⭐ Gray Merchant of Asphodel is cast for {0} with no mana — and the dispatcher puts it on the stack paying nothing", () => {
    const s = board({ hand: [{ ...GRAY_MERCHANT, id: "gm" }], bf: [perm(ROOFTOP_STORM, "r")] });
    expect(offer(s, "gm")).toEqual(["granted {0}"]);
    const out = dispatchAction(s, casts(s, "gm")[0]);
    expect(out.stack.map((o) => o.source?.name)).toEqual(["Gray Merchant of Asphodel"]);
  });
  it("a changeling creature is a Zombie creature spell; a Dragon is not", () => {
    const s = board({ hand: [{ ...CHANGELING_OUTCAST, id: "co" }, { ...SHIVAN_DRAGON, id: "sd" }], bf: [perm(ROOFTOP_STORM, "r")] });
    expect({ changeling: offer(s, "co"), dragon: offer(s, "sd") }).toEqual({ changeling: ["granted {0}"], dragon: [] });
  });
  it("⭐ the tax applies to the alternative cost (CR 118.9d): under Sphere of Resistance it is {1} — not offered with no mana", () => {
    const one = board({ hand: [{ ...GRAY_MERCHANT, id: "gm" }], bf: [perm(ROOFTOP_STORM, "r"), perm(SPHERE, "s")], pool: { C: 1 } });
    const none = board({ hand: [{ ...GRAY_MERCHANT, id: "gm" }], bf: [perm(ROOFTOP_STORM, "r"), perm(SPHERE, "s")] });
    expect({ one: offer(one, "gm"), none: offer(none, "gm") }).toEqual({ one: ["granted {1}"], none: [] });
  });
  it("beside Fist of Suns both alternatives are offered — the caster picks one (CR 118.9a)", () => {
    const s = board({ hand: [{ ...GRAY_MERCHANT, id: "gm" }], bf: [perm(ROOFTOP_STORM, "r"), perm(FIST, "f")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1 } });
    expect(offer(s, "gm")).toEqual(["wubrg {W}{U}{B}{R}{G}", "granted {0}"]); // (the printed {3}{B}{B} is out of reach of one {B})
  });
});

describe("⭐ Dracogenesis — Dragon spells", () => {
  it("⭐ Shivan Dragon is cast for {0}; Gray Merchant is not", () => {
    const s = board({ hand: [{ ...SHIVAN_DRAGON, id: "sd" }, { ...GRAY_MERCHANT, id: "gm" }], bf: [perm(DRACOGENESIS, "d")] });
    expect({ dragon: offer(s, "sd"), zombie: offer(s, "gm") }).toEqual({ dragon: ["granted {0}"], zombie: [] });
  });
});

describe("⭐ Darksteel Monolith — a colorless spell from the hand, once each turn", () => {
  it("⭐ Wurmcoil Engine and devoid Kozilek's Return for {0}; red Shivan Dragon not; an {X} spell not (CR 107.3b)", () => {
    const s = board({ hand: [{ ...WURMCOIL, id: "wc" }, { ...KOZILEKS_RETURN, id: "kr" }, { ...SHIVAN_DRAGON, id: "sd" }, { ...ENDLESS_ONE, id: "eo" }], bf: [perm(DARKSTEEL_MONOLITH, "m")], pool: { C: 1 } });
    const row = { wurmcoil: offer(s, "wc"), kozilek: offer(s, "kr"), dragon: offer(s, "sd"), endless: casts(s, "eo").map((a) => `${a.altManaCost || "printed"} X=${a.xValue}`) };
    console.log(`WITNESS monolith ${JSON.stringify(row)}`);
    expect(row).toEqual({ wurmcoil: ["granted {0}"], kozilek: ["granted {0}"], dragon: [], endless: ["printed X=1"] });
  });
  it("⭐ once each turn: after Wurmcoil Engine is cast for {0}, Mind Stone pays its {2}", () => {
    const s = board({ hand: [{ ...WURMCOIL, id: "wc" }, { ...MIND_STONE, id: "ms" }], bf: [perm(DARKSTEEL_MONOLITH, "m")], pool: { C: 2 } });
    expect(offer(s, "ms")).toEqual(["printed {2}", "granted {0}"]);
    const after = dispatchAction(s, casts(s, "wc").find((a) => a.altManaCost === "granted"));
    const next = resolveTopOfStack(after);
    expect({ wurmcoil: next.players.user.battlefield.some((p) => p.card?.name === "Wurmcoil Engine"), mindStone: offer(next, "ms") }).toEqual({ wurmcoil: true, mindStone: ["printed {2}"] });
  });
  it("two Monoliths grant two casts a turn — the second is offered once the first is spent", () => {
    const s = board({ hand: [{ ...WURMCOIL, id: "wc" }, { ...MIND_STONE, id: "ms" }], bf: [perm(DARKSTEEL_MONOLITH, "m1"), perm(DARKSTEEL_MONOLITH, "m2")] });
    const first = casts(s, "wc").find((a) => a.altManaCost === "granted");
    expect(first?.altCostOnceSourceId ?? null).toBe("m1");
    const next = resolveTopOfStack(dispatchAction(s, first));
    expect(casts(next, "ms").map((a) => `${a.altManaCost} ${pips(a.cost)} ${a.altCostOnceSourceId}`)).toEqual(["granted {0} m2"]);
  });
});

describe("⭐ As Foretold — a spell with mana value up to its time counters, once each turn", () => {
  it("⭐ with two time counters: Mind Stone (2) for {0}, Lava Axe (5) not; with none, only a mana-value-0 spell", () => {
    const two = board({ hand: [{ ...MIND_STONE, id: "ms" }, { ...LAVA_AXE, id: "la" }], bf: [perm(AS_FORETOLD, "a", { counters: { time: 2 } })] });
    const none = board({ hand: [{ ...MIND_STONE, id: "ms" }], bf: [perm(AS_FORETOLD, "a")] });
    expect({ mindStone: offer(two, "ms"), lavaAxe: offer(two, "la"), noCounters: offer(none, "ms") }).toEqual({ mindStone: ["granted {0}"], lavaAxe: [], noCounters: [] });
  });
  it("its upkeep trigger adds the time counter the grant reads: one counter becomes two, and Mind Stone is then free", () => {
    const s0 = board({ hand: [{ ...MIND_STONE, id: "ms" }], bf: [perm(AS_FORETOLD, "a", { counters: { time: 1 } })], over: { phase: "beginning", step: "untap" } });
    let s = runStepActions(advanceStep(s0));
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 4 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
    const counters = s.players.user.battlefield.find((p) => p.id === "a")?.counters?.time;
    const main = { ...s, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [] };
    expect({ step: s.step, counters, mindStone: offer(main, "ms") }).toEqual({ step: "upkeep", counters: 2, mindStone: ["granted {0}"] });
  });
});
