/**
 * castCostOrder.test.js — the total cost of a spell is assembled in ONE order (CR 601.2f): "the mana cost or alternative cost …,
 * plus all additional costs and cost increases, and minus all cost reductions", the mana component never below {0}.
 *   • An additional cost — kicker, multikicker, a "pay {3}{B}" option, strive, a Spree mode's cost — is part of the total the
 *     reductions see, so a reduction larger than the mana cost's generic part is not lost.
 *   • An {X} the caster chose is part of the cost (CR 107.3a), so a reduction reaches the X, and on the stack the X counts toward the
 *     spell's mana value (CR 202.3e), so a mana-value floor reads it.
 *   • An alternative cost takes the cost increases AND the cost reductions that affect the spell (CR 118.9d), and doesn't change the
 *     spell's mana value (CR 118.9c) — a flashback cost is priced as the alternative cost it is, against the card's own mana value.
 * The bundled rulings witnessed: Herald of War ("If there are additional costs to cast a creature spell, such as a kicker cost,
 * apply those increases before applying cost reductions." / "start with the mana cost or alternative cost (such as a flashback cost)
 * you're paying, add any cost increases, then apply any cost reductions"), Spectacle Mage and It That Heralds the End ("use the
 * chosen value for X"), Elder Deep-Fiend (emerge reduces the total cost by the sacrificed creature's mana value).
 *
 * Real oracle fixtures (bundled Scryfall).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, mana_cost: mana, cmc, keywords: [], colors: [], oracle, ...extra });
const HELM = card("Helm of Awakening", "Artifact", "{2}", 2, "Spells cost {1} less to cast.");
const SPHERE = card("Sphere of Resistance", "Artifact", "{2}", 2, "Spells cost {1} more to cast.");
const THALIA = card("Thalia, Guardian of Thraben", "Legendary Creature — Human Soldier", "{1}{W}", 2, "First strike\nNoncreature spells cost {1} more to cast.", { power: "2", toughness: "1", keywords: ["First strike"], colors: ["W"] });
const FIST = card("Fist of Suns", "Artifact", "{3}", 3, "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.");
const ELECTROMANCER = card("Goblin Electromancer", "Creature — Goblin Wizard", "{U}{R}", 2, "Instant and sorcery spells you cast cost {1} less to cast.", { power: "2", toughness: "2", colors: ["R", "U"] });
const SPECTACLE_MAGE = card("Spectacle Mage", "Creature — Bird Shaman", "{1}{U}{R}", 3, "Flying\nInstant and sorcery spells you cast with mana value 5 or greater cost {1} less to cast.", { power: "2", toughness: "2", keywords: ["Flying"], colors: ["R", "U"] });
const IT_THAT_HERALDS = card("It That Heralds the End", "Creature — Eldrazi Drone", "{1}{C}", 2, "Colorless spells you cast with mana value 7 or greater cost {1} less to cast.\nOther colorless creatures you control get +1/+1.", { power: "2", toughness: "2" });
const KROSAN_DROVER = card("Krosan Drover", "Creature — Elf", "{3}{G}", 4, "Creature spells you cast with mana value 6 or greater cost {2} less to cast.", { power: "2", toughness: "2", colors: ["G"] });

const BURST_LIGHTNING = card("Burst Lightning", "Instant", "{R}", 1, "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.", { keywords: ["Kicker"], colors: ["R"] });
const KAVU_TITAN = card("Kavu Titan", "Creature — Kavu", "{1}{G}", 2, "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample.", { power: "2", toughness: "2", keywords: ["Kicker"], colors: ["G"] });
const GOBLIN_RUINBLASTER = card("Goblin Ruinblaster", "Creature — Goblin Shaman", "{2}{R}", 3, "Kicker {R} (You may pay an additional {R} as you cast this spell.)\nHaste\nWhen this creature enters, if it was kicked, destroy target nonbasic land.", { power: "2", toughness: "1", keywords: ["Haste", "Kicker"], colors: ["R"] });
const BUBBLE_SNARE = card("Bubble Snare", "Enchantment — Aura", "{U}", 1, "Kicker {2}{U} (You may pay an additional {2}{U} as you cast this spell.)\nEnchant creature\nWhen this Aura enters, if it was kicked, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.", { keywords: ["Enchant", "Kicker"], colors: ["U"] });
const CHALICE = card("Everflowing Chalice", "Artifact", "{0}", 0, "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact.", { keywords: ["Multikicker"] });
const SPARK_HARVEST = card("Spark Harvest", "Sorcery", "{B}", 1, "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}.\nDestroy target creature or planeswalker.", { colors: ["B"] });
const LAUNCH_THE_FLEET = card("Launch the Fleet", "Sorcery", "{W}", 1, "Strive — This spell costs {1} more to cast for each target beyond the first.\nUntil end of turn, any number of target creatures each gain \"Whenever this creature attacks, create a 1/1 white Soldier creature token that's tapped and attacking.\"", { keywords: ["Strive"], colors: ["W"] });
const PHANTOM_INTERFERENCE = card("Phantom Interference", "Instant", "{U}", 1, "Spree (Choose one or more additional costs.)\n+ {3} — Create a 2/2 white Spirit creature token with flying.\n+ {1} — Counter target spell unless its controller pays {2}.", { keywords: ["Spree"], colors: ["U"] });
const BLUE_SUNS_ZENITH = card("Blue Sun's Zenith", "Instant", "{X}{U}{U}{U}", 3, "Target player draws X cards. Shuffle Blue Sun's Zenith into its owner's library.", { colors: ["U"] });
const WALKING_BALLISTA = card("Walking Ballista", "Artifact Creature — Construct", "{X}{X}", 0, "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.", { power: "0", toughness: "0" });
const ENDLESS_ONE = card("Endless One", "Creature — Eldrazi", "{X}", 0, "This creature enters with X +1/+1 counters on it.", { power: "0", toughness: "0" });
const PRIMORDIAL_HYDRA = card("Primordial Hydra", "Creature — Hydra", "{X}{G}{G}", 2, "This creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature.\nThis creature has trample as long as it has ten or more +1/+1 counters on it.", { power: "0", toughness: "0", keywords: ["Double"], colors: ["G"] });
const LAVA_AXE = card("Lava Axe", "Sorcery", "{4}{R}", 5, "Lava Axe deals 5 damage to target player or planeswalker.", { colors: ["R"] });
const BRINGER_OF_THE_BLUE_DAWN = card("Bringer of the Blue Dawn", "Creature — Bringer", "{7}{U}{U}", 9, "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost.\nTrample\nAt the beginning of your upkeep, you may draw two cards.", { power: "5", toughness: "5", keywords: ["Trample"], colors: ["U"] });
const ARROW_VOLLEY_TRAP = card("Arrow Volley Trap", "Instant — Trap", "{3}{W}{W}", 5, "If four or more creatures are attacking, you may pay {1}{W} rather than pay this spell's mana cost.\nArrow Volley Trap deals 5 damage divided as you choose among any number of target attacking creatures.", { colors: ["W"] });
const MOAN = card("Moan of the Unhallowed", "Sorcery", "{2}{B}{B}", 4, "Create two 2/2 black Zombie creature tokens.\nFlashback {5}{B}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", { keywords: ["Flashback"], colors: ["B"] });
const ROAR_OF_THE_WURM = card("Roar of the Wurm", "Sorcery", "{6}{G}", 7, "Create a 6/6 green Wurm creature token.\nFlashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", { keywords: ["Flashback"], colors: ["G"] });
const ELDER_DEEP_FIEND = card("Elder Deep-Fiend", "Creature — Eldrazi Octopus", "{8}", 8, "Flash\nEmerge {5}{U}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, tap up to four target permanents.", { power: "5", toughness: "6", keywords: ["Emerge", "Flash"] });
const DIVINATION = card("Divination", "Sorcery", "{2}{U}", 3, "Draw two cards.", { colors: ["U"] });
const GRIZZLY_BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const CRAW_WURM = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", 6, "", { power: "6", toughness: "4", colors: ["G"] });
const HILL_GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3", colors: ["R"] });
const BOON_SATYR = card("Boon Satyr", "Enchantment Creature — Satyr", "{1}{G}{G}", 3, "Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2.", { power: "4", toughness: "2", keywords: ["Bestow", "Flash"], colors: ["G"] });

const perm = (c, id, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function board({ active = "user", hand = [], gy = [], exile = [], command = [], counts = {}, bf = [], aiBf = [], pool = {}, over = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: "user", stack: [], pendingTriggers: [], ...over,
    players: { ...g.players,
      user: { ...g.players.user, hand, graveyard: gy, exile, command, commanderCastCount: counts, battlefield: bf, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, hand: [], battlefield: aiBf, manaPool: { ...EMPTY_POOL } } } };
}
const casts = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === id);
// The cost as printed mana symbols: generic first, then W U B R G C ("{0}" when nothing is owed).
const pips = (cost) => {
  const out = (cost.generic ? `{${cost.generic}}` : "") + ["W", "U", "B", "R", "G", "C"].map((k) => `{${k}}`.repeat(cost[k] || 0)).join("");
  return out || "{0}";
};
const uniq = (xs) => [...new Set(xs)];
const poolLeft = (s) => Object.values(s.players.user.manaPool).reduce((n, v) => n + (Number(v) || 0), 0);

describe("⭐ additional costs are added before the reductions (CR 601.2f; Herald of War's ruling)", () => {
  it("⭐ Burst Lightning kicked under Helm of Awakening costs {3}{R} — offered with four mana, and the dispatcher pays exactly four", () => {
    const s = board({ hand: [{ ...BURST_LIGHTNING, id: "bl" }], bf: [perm(HELM, "h")], pool: { R: 1, C: 3 } });
    const kicked = casts(s, "bl").filter((a) => a.kicked === true);
    const row = { costs: uniq(kicked.map((a) => pips(a.cost))), cmc: kicked[0]?.cmc };
    console.log(`WITNESS kickedUnderHelm ${JSON.stringify(row)}`);
    expect(row).toEqual({ costs: ["{3}{R}"], cmc: 1 });
    const out = dispatchAction(s, kicked.find((a) => a.targets?.[0]?.id === "ai"));
    expect({ onStack: out.stack.some((o) => o.source?.name === "Burst Lightning"), left: poolLeft(out) }).toEqual({ onStack: true, left: 0 });
  });
  it("⭐ a kicker creature: Kavu Titan kicked under two Helms costs {1}{G}{G} ({3}{G}{G} − {2})", () => {
    const s = board({ hand: [{ ...KAVU_TITAN, id: "kt" }], bf: [perm(HELM, "h1"), perm(HELM, "h2")], pool: { G: 2, C: 1 } });
    const row = casts(s, "kt").map((a) => `${a.kicked ? "kicked" : "normal"} ${pips(a.cost)}`);
    expect(row).toEqual(["normal {G}", "kicked {1}{G}{G}"]);
  });
  it("⭐ a kicker Aura: Bubble Snare kicked under Helm costs {1}{U}{U}", () => {
    const s = board({ hand: [{ ...BUBBLE_SNARE, id: "bs" }], bf: [perm(HELM, "h"), perm(GRIZZLY_BEARS, "b")], aiBf: [perm(HILL_GIANT, "g", "ai")], pool: { U: 2, C: 1 } });
    const row = uniq(casts(s, "bs").map((a) => `${a.kicked ? "kicked" : "normal"} ${pips(a.cost)}`));
    expect(row).toEqual(["normal {U}", "kicked {1}{U}{U}"]);
  });
  it("⭐ multikicker: Everflowing Chalice under Helm — kicked once {1}, twice {3}; four mana reaches the second kick", () => {
    const s = board({ hand: [{ ...CHALICE, id: "ec" }], bf: [perm(HELM, "h")], pool: { C: 4 } });
    const row = casts(s, "ec").map((a) => `${a.kickCount} ${pips(a.cost)}`);
    console.log(`WITNESS multikickUnderHelm ${JSON.stringify(row)}`);
    expect(row).toEqual(["0 {0}", "1 {1}", "2 {3}"]);
  });
  it("⭐ an additional mana cost: Spark Harvest's \"pay {3}{B}\" under Helm costs {2}{B}{B}", () => {
    const s = board({ hand: [{ ...SPARK_HARVEST, id: "sh" }], bf: [perm(HELM, "h")], aiBf: [perm(HILL_GIANT, "g", "ai")], pool: { B: 2, C: 2 } });
    const row = uniq(casts(s, "sh").filter((a) => a.payManaCost).map((a) => pips(a.cost)));
    expect(row).toEqual(["{2}{B}{B}"]);
  });
  it("⭐ strive: Launch the Fleet on two creatures under Helm costs {W} ({1}{W} − {1}) — any number of targets, one mana", () => {
    const s = board({ hand: [{ ...LAUNCH_THE_FLEET, id: "lf" }], bf: [perm(HELM, "h"), perm(GRIZZLY_BEARS, "b1"), perm(GRIZZLY_BEARS, "b2")], pool: { W: 1 } });
    const row = uniq(casts(s, "lf").map((a) => `${a.targets.length} ${pips(a.cost)}`)).sort();
    expect(row).toEqual(["0 {W}", "1 {W}", "2 {W}"]);
  });
  it("⭐ Spree: Phantom Interference's + {3} mode under Goblin Electromancer costs {2}{U}", () => {
    const s = board({ hand: [{ ...PHANTOM_INTERFERENCE, id: "pi" }], bf: [perm(ELECTROMANCER, "e")], pool: { U: 1, C: 2 } });
    const row = uniq(casts(s, "pi").map((a) => `${a.spreeCost} ${pips(a.cost)}`));
    expect(row).toEqual(["{3} {2}{U}"]);
  });
});

describe("⭐ the chosen X is part of the cost the reductions see (CR 601.2f, 107.3a)", () => {
  it("⭐ Blue Sun's Zenith under Helm: X=1 {U}{U}{U}, X=2 {1}{U}{U}{U}, X=3 {2}{U}{U}{U} — five mana reaches X=3", () => {
    const s = board({ hand: [{ ...BLUE_SUNS_ZENITH, id: "bsz" }], bf: [perm(HELM, "h")], pool: { U: 3, C: 2 } });
    const row = uniq(casts(s, "bsz").map((a) => `X=${a.xValue} ${pips(a.cost)} mv${a.cmc}`));
    console.log(`WITNESS xUnderHelm ${JSON.stringify(row)}`);
    expect(row).toEqual(["X=1 {U}{U}{U} mv4", "X=2 {1}{U}{U}{U} mv5", "X=3 {2}{U}{U}{U} mv6"]);
  });
  it("the dispatcher pays exactly the reduced X cost: X=3 empties a five-mana pool and puts X=3 on the stack", () => {
    const s = board({ hand: [{ ...BLUE_SUNS_ZENITH, id: "bsz" }], bf: [perm(HELM, "h")], pool: { U: 3, C: 2 } });
    const pick = casts(s, "bsz").find((a) => a.xValue === 3 && a.targets?.[0]?.id === "user");
    expect(pick ? pips(pick.cost) : null).toBe("{2}{U}{U}{U}");
    const out = dispatchAction(s, pick);
    const top = out.stack.find((o) => o.source?.name === "Blue Sun's Zenith");
    expect({ onStack: !!top, left: poolLeft(out) }).toEqual({ onStack: true, left: 0 });
  });
  it("⭐ a creature that enters with X counters: Endless One under Helm — X=1 {0} … X=4 {3} with three mana", () => {
    const s = board({ hand: [{ ...ENDLESS_ONE, id: "eo" }], bf: [perm(HELM, "h")], pool: { C: 3 } });
    expect(casts(s, "eo").map((a) => `X=${a.xValue} ${pips(a.cost)}`)).toEqual(["X=1 {0}", "X=2 {1}", "X=3 {2}", "X=4 {3}"]);
  });
});

describe("⭐ a mana-value floor reads the chosen X (CR 202.3e; Spectacle Mage's and It That Heralds the End's rulings)", () => {
  it("⭐ Blue Sun's Zenith under Spectacle Mage: X=1 (mana value 4) full price; X=2 (5) and up {1} less", () => {
    const s = board({ hand: [{ ...BLUE_SUNS_ZENITH, id: "bsz" }], bf: [perm(SPECTACLE_MAGE, "m")], pool: { U: 3, C: 3 } });
    const row = uniq(casts(s, "bsz").map((a) => `X=${a.xValue} ${pips(a.cost)} mv${a.cmc}`));
    console.log(`WITNESS xFloorSpectacle ${JSON.stringify(row)}`);
    expect(row).toEqual(["X=1 {1}{U}{U}{U} mv4", "X=2 {1}{U}{U}{U} mv5", "X=3 {2}{U}{U}{U} mv6", "X=4 {3}{U}{U}{U} mv7"]);
  });
  it("⭐ Walking Ballista under It That Heralds the End: X=3 (mana value 6) {6}, X=4 (8) {7}; X=5 ({9}) is out of reach of eight", () => {
    const s = board({ hand: [{ ...WALKING_BALLISTA, id: "wb" }], bf: [perm(IT_THAT_HERALDS, "i")], pool: { C: 8 } });
    expect(casts(s, "wb").map((a) => `X=${a.xValue} ${pips(a.cost)}`)).toEqual(["X=1 {2}", "X=2 {4}", "X=3 {6}", "X=4 {7}"]);
  });
  it("⭐ Primordial Hydra under Krosan Drover: X=3 (mana value 5) {3}{G}{G}, X=4 (6) {2}{G}{G}, X=6 (8) {4}{G}{G}", () => {
    const s = board({ hand: [{ ...PRIMORDIAL_HYDRA, id: "ph" }], bf: [perm(KROSAN_DROVER, "d")], pool: { G: 2, C: 4 } });
    expect(casts(s, "ph").map((a) => `X=${a.xValue} ${pips(a.cost)}`)).toEqual(["X=1 {1}{G}{G}", "X=2 {2}{G}{G}", "X=3 {3}{G}{G}", "X=4 {2}{G}{G}", "X=5 {3}{G}{G}", "X=6 {4}{G}{G}"]);
  });
});

describe("⭐ a floor the X crosses can make a larger X cheaper", () => {
  it("⭐ Primordial Hydra under Krosan Drover with four mana: X=1, X=2 and X=4 ({2}{G}{G}) — X=3 ({3}{G}{G}) is out of reach", () => {
    const s = board({ hand: [{ ...PRIMORDIAL_HYDRA, id: "ph" }], bf: [perm(KROSAN_DROVER, "d")], pool: { G: 2, C: 2 } });
    const row = casts(s, "ph").map((a) => `X=${a.xValue} ${pips(a.cost)}`);
    console.log(`WITNESS floorCrossing ${JSON.stringify(row)}`);
    expect(row).toEqual(["X=1 {1}{G}{G}", "X=2 {2}{G}{G}", "X=4 {2}{G}{G}"]);
  });
});

describe("⭐ an alternative cost takes the cost increases AND the reductions (CR 118.9d)", () => {
  it("⭐ Fist of Suns under Sphere of Resistance and Helm of Awakening: Lava Axe's five-pip cost is {W}{U}{B}{R}{G} — payable from five", () => {
    const s = board({ hand: [{ ...LAVA_AXE, id: "la" }], bf: [perm(FIST, "f"), perm(SPHERE, "s"), perm(HELM, "h")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1 } });
    const row = uniq(casts(s, "la").filter((a) => a.altManaCost).map((a) => pips(a.cost)));
    console.log(`WITNESS fistTaxAndReduction ${JSON.stringify(row)}`);
    expect(row).toEqual(["{W}{U}{B}{R}{G}"]);
  });
  it("⭐ the spell's own pips: Bringer of the Blue Dawn under Sphere and Helm is cast for {W}{U}{B}{R}{G}", () => {
    const s = board({ hand: [{ ...BRINGER_OF_THE_BLUE_DAWN, id: "bb" }], bf: [perm(SPHERE, "s"), perm(HELM, "h")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1 } });
    expect(casts(s, "bb").map((a) => `${a.altManaCost} ${pips(a.cost)}`)).toEqual(["own {W}{U}{B}{R}{G}"]);
  });
  it("⭐ a trap's generic alternative: Arrow Volley Trap with four attackers costs {W} under Helm ({1}{W} − {1})", () => {
    const attackers = ["a1", "a2", "a3", "a4"];
    const s = board({ active: "ai", hand: [{ ...ARROW_VOLLEY_TRAP, id: "av" }], bf: [perm(HELM, "h")], aiBf: attackers.map((id) => perm(GRIZZLY_BEARS, id, "ai")), pool: { W: 1 },
      over: { phase: "combat", step: "declare-blockers", combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })) } } });
    expect(uniq(casts(s, "av").map((a) => `${a.altManaCost} ${pips(a.cost)}`))).toEqual(["own {W}"]);
  });
  it("control: Fist of Suns under Sphere alone keeps the tax — {1}{W}{U}{B}{R}{G}, out of reach of five, payable from six", () => {
    const five = board({ hand: [{ ...DIVINATION, id: "dv" }], bf: [perm(FIST, "f"), perm(SPHERE, "s")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1 } });
    const six = board({ hand: [{ ...DIVINATION, id: "dv" }], bf: [perm(FIST, "f"), perm(SPHERE, "s")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1, C: 1 } });
    expect({ five: casts(five, "dv").filter((a) => a.altManaCost).length, six: uniq(casts(six, "dv").filter((a) => a.altManaCost).map((a) => pips(a.cost))) })
      .toEqual({ five: 0, six: ["{1}{W}{U}{B}{R}{G}"] });
  });
});

describe("⭐ an alternative cost doesn't change the mana value a floor reads (CR 118.9c; Herald of War's ruling)", () => {
  it("⭐ Moan of the Unhallowed's flashback under Spectacle Mage stays {5}{B}{B}: its mana value is 4, not the flashback cost's 7", () => {
    const s = board({ gy: [{ ...MOAN, id: "mo" }], bf: [perm(SPECTACLE_MAGE, "m")], pool: { B: 2, C: 5 } });
    const row = casts(s, "mo").map((a) => `${pips(a.cost)} mv${a.cmc}`);
    console.log(`WITNESS flashbackFloorMoan ${JSON.stringify(row)}`);
    expect(row).toEqual(["{5}{B}{B} mv4"]);
  });
  it("⭐ Roar of the Wurm's flashback under Spectacle Mage is {2}{G}: its mana value is 7", () => {
    const s = board({ gy: [{ ...ROAR_OF_THE_WURM, id: "rw" }], bf: [perm(SPECTACLE_MAGE, "m")], pool: { G: 1, C: 2 } });
    expect(casts(s, "rw").map((a) => `${pips(a.cost)} mv${a.cmc}`)).toEqual(["{2}{G} mv7"]);
  });
});

describe("⭐ emerge: the cost increases and every reduction apply to the emerge cost (CR 118.9d, 702.119a; Elder Deep-Fiend's rulings)", () => {
  it("⭐ Elder Deep-Fiend sacrificing Grizzly Bears under Sphere of Resistance costs {4}{U}{U} ({5}{U}{U} + {1} − 2)", () => {
    const s = board({ hand: [{ ...ELDER_DEEP_FIEND, id: "df" }], bf: [perm(SPHERE, "s"), perm(GRIZZLY_BEARS, "b")], pool: { U: 2, C: 4 } });
    const row = uniq(casts(s, "df").filter((a) => a.emerge).map((a) => `${a.sacCreatureId} ${pips(a.cost)} mv${a.cmc}`));
    console.log(`WITNESS emergeUnderSphere ${JSON.stringify(row)}`);
    expect(row).toEqual(["b {4}{U}{U} mv8"]);
  });
  it("⭐ … and under Helm of Awakening {2}{U}{U} ({5}{U}{U} − 2 − 1)", () => {
    const s = board({ hand: [{ ...ELDER_DEEP_FIEND, id: "df" }], bf: [perm(HELM, "h"), perm(GRIZZLY_BEARS, "b")], pool: { U: 2, C: 2 } });
    expect(uniq(casts(s, "df").filter((a) => a.emerge).map((a) => `${a.sacCreatureId} ${pips(a.cost)}`))).toEqual(["b {2}{U}{U}"]);
  });
  it("control: sacrificing Craw Wurm under Sphere pays the coloured part only — {U}{U} (the generic floor is {0})", () => {
    const s = board({ hand: [{ ...ELDER_DEEP_FIEND, id: "df" }], bf: [perm(SPHERE, "s"), perm(CRAW_WURM, "w")], pool: { U: 2 } });
    expect(uniq(casts(s, "df").filter((a) => a.emerge).map((a) => `${a.sacCreatureId} ${pips(a.cost)}`))).toEqual(["w {U}{U}"]);
  });
});

describe("⛔ a cost the engine's free or alternative-cost payment can't charge is not offered with it (CR 601.2b, 118.9a, 118.9d)", () => {
  const discover = (c, extra = {}) => board({ exile: [{ ...c, id: "x" }], ...extra, over: { pendingDiscover: { controller: "user", cardId: "x" } } });
  it("⛔ a discovered Boon Satyr is cast as the creature only — never bestowed, even with its bestow cost in the pool: two alternative costs (Boon Satyr's ruling)", () => {
    const row = casts(discover(BOON_SATYR, { bf: [perm(GRIZZLY_BEARS, "b")], pool: { G: 2, C: 3 } }), "x").map((a) => `${a.freeCast ? "free" : "paid"} ${a.bestow ? "bestow" : "creature"}`);
    console.log(`WITNESS freeBestow ${JSON.stringify(row)}`);
    expect(row).toEqual(["free creature"]);
  });
  it("⛔ a discovered Spark Harvest offers its sacrifice, not its \"pay {3}{B}\", even with {3}{B}{B} in the pool — the free cast pays no mana", () => {
    const row = casts(discover(SPARK_HARVEST, { bf: [perm(GRIZZLY_BEARS, "b")], aiBf: [perm(HILL_GIANT, "g", "ai")], pool: { B: 2, C: 3 } }), "x").map((a) => (a.payManaCost ? `pay ${a.payManaCost}` : `sacrifice ${a.sacCreatureId}`));
    expect(row).toEqual(["sacrifice b"]);
  });
  it("⛔ a discovered Launch the Fleet is offered on one creature or none, never two (the strive {1} can't be paid)", () => {
    const row = uniq(casts(discover(LAUNCH_THE_FLEET, { bf: [perm(GRIZZLY_BEARS, "b1"), perm(GRIZZLY_BEARS, "b2")], pool: { C: 3 } }), "x").map((a) => a.targets.length)).sort();
    expect(row).toEqual([0, 1]);
  });
  it("⛔ Fist of Suns' five pips never replace a cost that carries additional mana: Spark Harvest's \"pay {3}{B}\" keeps its {3}{B}", () => {
    const s = board({ hand: [{ ...SPARK_HARVEST, id: "sh" }], bf: [perm(FIST, "f")], aiBf: [perm(HILL_GIANT, "g", "ai")], pool: { W: 1, U: 1, B: 2, R: 1, G: 1, C: 3 } });
    const row = casts(s, "sh").map((a) => `${a.altManaCost || "printed"} ${pips(a.cost)}`);
    console.log(`WITNESS fistKeepsPayMana ${JSON.stringify(row)}`);
    expect(row).toEqual(["printed {3}{B}{B}"]);
  });
  it("⛔ … nor a strive increase: Launch the Fleet on two creatures is not cast for the five pips alone", () => {
    const s = board({ hand: [{ ...LAUNCH_THE_FLEET, id: "lf" }], bf: [perm(FIST, "f"), perm(GRIZZLY_BEARS, "b1"), perm(GRIZZLY_BEARS, "b2")], pool: { W: 1, U: 1, B: 1, R: 1, G: 1 } });
    const row = uniq(casts(s, "lf").map((a) => `${a.targets.length} ${a.altManaCost || "printed"} ${pips(a.cost)}`)).sort();
    expect(row).toEqual(["0 printed {W}", "0 wubrg {W}{U}{B}{R}{G}", "1 printed {W}", "1 wubrg {W}{U}{B}{R}{G}", "2 printed {1}{W}"]);
  });
});

describe("⛔ a {0} alternative cost takes the increases too — and the engine's no-mana payment can't charge them (CR 118.9d)", () => {
  const FIREBLAST = card("Fireblast", "Instant", "{4}{R}{R}", 6, "You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireblast deals 4 damage to any target.", { colors: ["R"] });
  const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", 0, "({T}: Add {R}.)");
  const discover = (c, extra = {}) => board({ exile: [{ ...c, id: "x" }], ...extra, over: { pendingDiscover: { controller: "user", cardId: "x" } } });
  const freeCasts = (s) => casts(s, "x").filter((a) => a.freeCast).length;
  it("⛔ a discovered Divination under an opponent's Thalia owes {1} — the free cast is not offered (the decline stays)", () => {
    const s = discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")] });
    const row = { free: freeCasts(s), decline: legalActionsForPlayer(s, "user").some((a) => a.kind === "discover-to-hand") };
    console.log(`WITNESS freeCastUnderThalia ${JSON.stringify(row)}`);
    expect(row).toEqual({ free: 0, decline: true });
  });
  it("⛔ under Sphere of Resistance a discovered Grizzly Bears is not cast free either; under Thalia it is (Thalia taxes noncreature spells)", () => {
    expect({ sphere: freeCasts(discover(GRIZZLY_BEARS, { aiBf: [perm(SPHERE, "s", "ai")] })), thalia: freeCasts(discover(GRIZZLY_BEARS, { aiBf: [perm(THALIA, "t", "ai")] })) })
      .toEqual({ sphere: 0, thalia: 1 });
  });
  it("Thalia's {1} cancelled by Helm of Awakening's {1} less: the discovered Divination is cast free", () => {
    expect(freeCasts(discover(DIVINATION, { aiBf: [perm(THALIA, "t", "ai")], bf: [perm(HELM, "h")] }))).toBe(1);
  });
  it("⛔ Fireblast's sacrifice of two Mountains pays no mana: under Thalia it owes {1} and is not offered; under Thalia and Helm it is", () => {
    const mountains = [perm(MOUNTAIN, "m1"), perm(MOUNTAIN, "m2")];
    const alt = (extra) => casts(board({ hand: [{ ...FIREBLAST, id: "fb" }], bf: [...mountains, ...(extra.bf || [])], aiBf: extra.aiBf || [] }), "fb").filter((a) => a.altCost).length > 0;
    const row = { bare: alt({}), thalia: alt({ aiBf: [perm(THALIA, "t", "ai")] }), thaliaAndHelm: alt({ aiBf: [perm(THALIA, "t", "ai")], bf: [perm(HELM, "h")] }) };
    console.log(`WITNESS pitchUnderThalia ${JSON.stringify(row)}`);
    expect(row).toEqual({ bare: true, thalia: false, thaliaAndHelm: true });
  });
});

describe("controls — the costs that were already right", () => {
  it("an unkicked Burst Lightning under Helm stays {R}; kicked with no reducer {4}{R}", () => {
    const helm = board({ hand: [{ ...BURST_LIGHTNING, id: "bl" }], bf: [perm(HELM, "h")], pool: { R: 1 } });
    const bare = board({ hand: [{ ...BURST_LIGHTNING, id: "bl" }], pool: { R: 1, C: 4 } });
    expect({ helm: uniq(casts(helm, "bl").map((a) => `${a.kicked} ${pips(a.cost)}`)), bare: uniq(casts(bare, "bl").map((a) => `${a.kicked} ${pips(a.cost)}`)) })
      .toEqual({ helm: ["false {R}"], bare: ["false {R}", "true {4}{R}"] });
  });
  it("a tax and a reduction on a plain spell: Divination under Thalia and Helm stays {2}{U}", () => {
    const s = board({ hand: [{ ...DIVINATION, id: "dv" }], bf: [perm(THALIA, "t"), perm(HELM, "h")], pool: { U: 1, C: 2 } });
    expect(casts(s, "dv").map((a) => `${pips(a.cost)} mv${a.cmc}`)).toEqual(["{2}{U} mv3"]);
  });
  it("commander tax and a reduction: Craw Wurm cast once before, under Helm, costs {5}{G}{G} ({4}{G}{G} + {2} − {1}), mana value 6", () => {
    const s = board({ command: [{ ...CRAW_WURM, id: "cw", commanderInstanceId: "cw" }], counts: { cw: 1 }, bf: [perm(HELM, "h")], pool: { G: 2, C: 5 } });
    expect(casts(s, "cw").map((a) => `${a.fromZone} ${pips(a.cost)} mv${a.cmc}`)).toEqual(["command {5}{G}{G} mv6"]);
  });
  it("a kicker whose base absorbs the reduction: Goblin Ruinblaster under Helm — {1}{R}, kicked {1}{R}{R}", () => {
    const s = board({ hand: [{ ...GOBLIN_RUINBLASTER, id: "gr" }], bf: [perm(HELM, "h")], pool: { R: 2, C: 1 } });
    expect(casts(s, "gr").map((a) => `${a.kicked} ${pips(a.cost)}`)).toEqual(["false {1}{R}", "true {1}{R}{R}"]);
  });
  it("Blue Sun's Zenith with no reducer: X=n costs {n}{U}{U}{U}", () => {
    const s = board({ hand: [{ ...BLUE_SUNS_ZENITH, id: "bsz" }], pool: { U: 3, C: 2 } });
    expect(uniq(casts(s, "bsz").map((a) => `X=${a.xValue} ${pips(a.cost)}`))).toEqual(["X=1 {1}{U}{U}{U}", "X=2 {2}{U}{U}{U}"]);
  });
});
