/**
 * manaPrintedCosts.test.js — a mana ability pays the cost it PRINTS: no more, no less (2026-10-17).
 *
 *   A · COUNTER COSTS. "{T}, Remove a <charge|mining|depletion> counter from this land: Add …" (Gemstone Mine, the depletion
 *       lands, the Vivid lands, Tendo Ice Bridge, Mirrodin's Core) and Wall of Roots' "Put a -0/-1 counter on this creature:
 *       Add {G}." The mana-text slice (manaModel.manaLineRefused) refused these lines because no record paid the counter: the
 *       land made mana forever and was never sacrificed, the Wall never shrank. Now the record pays it — the counter is removed
 *       or put on as the cost (CR 602.2b, 601.2h), a land with no counter of that kind left can't activate the line (CR
 *       118.3), and "If there are no <kind> counters on this land, sacrifice it" is the ability's own instruction, followed
 *       as it resolves (CR 605.3b, 608.2c) — not a trigger (CR 603.1) and not a state-based action.
 *   B · NO {T}, NO TAP. A mana ability without {T} in its cost doesn't tap its source (CR 107.5), and the source isn't
 *       "tapped for mana" (CR 106.12): Ashnod's Altar, Phyrexian Altar, Birchlore Rangers and Kozilek's Translator used to end
 *       up tapped after one use. Such an ability is usable while its source is tapped or summoning sick (CR 302.6).
 *   C · ONCE EACH TURN. "Activate only once each turn" (Kozilek's Translator, Wall of Roots) was enforced only by that
 *       accidental tap; the per-turn ledger the activated abilities already use (state.activatedOncePerTurn) now counts mana
 *       activations too (CR 602.5b) — and the other printed limits on a no-{T} mana line with it.
 *   D · KINNAN. "Whenever you tap a nonland permanent for mana, add one mana …" adds nothing to a mana ability with no {T}:
 *       an Ashnod's Altar activation or an Eldrazi Spawn sacrifice is not tapping it for mana (CR 106.12, 106.12a).
 *
 * Every card text is the bundled oracle index's (read in-session 2026-10-17); the spells cast are real cards.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, creatureToughness } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { manaProduction, manaSources, extraManaLineProducts, canAfford } from "./manaModel.js";
import { checkAllStateBasedActions } from "./sba.js";

beforeEach(() => _resetIdsForTests());

// ── The cards under test (bundled oracle index) ──
const GEMSTONE_MINE = { name: "Gemstone Mine", type: "Land", mana: "",
  oracle: "This land enters with three mining counters on it.\n{T}, Remove a mining counter from this land: Add one mana of any color. If there are no mining counters on this land, sacrifice it." };
const DEPLETION = [
  ["Hickory Woodlot", "G"], ["Peat Bog", "B"], ["Remote Farm", "W"], ["Sandstone Needle", "R"], ["Saprazzan Skerry", "U"],
].map(([name, c]) => ({ name, type: "Land", mana: "", color: c,
  oracle: `This land enters tapped with two depletion counters on it.\n{T}, Remove a depletion counter from this land: Add {${c}}{${c}}. If there are no depletion counters on this land, sacrifice it.` }));
const HICKORY = DEPLETION[0];
const VIVID = [["Vivid Crag", "R"], ["Vivid Creek", "U"], ["Vivid Grove", "G"], ["Vivid Marsh", "B"], ["Vivid Meadow", "W"]]
  .map(([name, c]) => ({ name, type: "Land", mana: "", color: c,
    oracle: `This land enters tapped with two charge counters on it.\n{T}: Add {${c}}.\n{T}, Remove a charge counter from this land: Add one mana of any color.` }));
const VIVID_CRAG = VIVID[0];
const TENDO = { name: "Tendo Ice Bridge", type: "Land", mana: "",
  oracle: "This land enters with a charge counter on it.\n{T}: Add {C}.\n{T}, Remove a charge counter from this land: Add one mana of any color." };
const MIRRODINS_CORE = { name: "Mirrodin's Core", type: "Land", mana: "",
  oracle: "{T}: Add {C}.\n{T}: Put a charge counter on this land.\n{T}, Remove a charge counter from this land: Add one mana of any color." };
const WALL_OF_ROOTS = { name: "Wall of Roots", type: "Creature — Plant Wall", mana: "{1}{G}", power: "0", toughness: "5",
  oracle: "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn." };
const ASHNOD = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add {C}{C}." };
const PHYREXIAN_ALTAR = { name: "Phyrexian Altar", type: "Artifact", mana: "{3}", oracle: "Sacrifice a creature: Add one mana of any color." };
const RANGERS = { name: "Birchlore Rangers", type: "Creature — Elf Druid Ranger", mana: "{G}", power: "1", toughness: "1",
  oracle: "Tap two untapped Elves you control: Add one mana of any color.\nMorph {G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" };
const TRANSLATOR = { name: "Kozilek's Translator", type: "Creature — Eldrazi Drone", mana: "{4}{B}", power: "3", toughness: "5",
  oracle: "Devoid (This card has no color.)\nPay 1 life: Add {C}. Activate only once each turn. ({C} represents colorless mana.)" };
const KINNAN = { name: "Kinnan, Bonder Prodigy", type: "Legendary Creature — Human Druid", mana: "{G}{U}", power: "2", toughness: "2",
  oracle: "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order." };
const SPAWN = { name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", mana: "", power: "0", toughness: "1", token: true, oracle: "Sacrifice this creature: Add {C}." };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", mana: "", token: true, oracle: "{T}, Sacrifice this token: Add one mana of any color." };
const SHIRE_SCARECROW = { name: "Shire Scarecrow", type: "Artifact Creature — Scarecrow", mana: "{2}", power: "0", toughness: "3",
  oracle: "Defender\n{1}: Add one mana of any color. Activate only once each turn." };
const MANAFORGE_CINDER = { name: "Manaforge Cinder", type: "Creature — Elemental Shaman", mana: "{B/R}", power: "1", toughness: "1",
  oracle: "{1}: Add {B} or {R}. Activate no more than three times each turn." };
const INITIATES = { name: "Initiates of the Ebon Hand", type: "Creature — Cleric", mana: "{B}", power: "1", toughness: "1",
  oracle: "{1}: Add {B}. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step." };
const VIVI = { name: "Vivi Ornitier", type: "Legendary Creature — Wizard", mana: "{1}{U}{R}", power: "0", toughness: "3",
  oracle: "{0}: Add X mana in any combination of {U} and/or {R}, where X is Vivi Ornitier's power. Activate only during your turn and only once each turn.\nWhenever you cast a noncreature spell, put a +1/+1 counter on Vivi Ornitier and it deals 1 damage to each opponent." };
// ── Controls ──
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const ZHUR_TAA = { name: "Zhur-Taa Druid", type: "Creature — Human Druid", mana: "{R}{G}", power: "1", toughness: "1",
  oracle: "{T}: Add {G}.\nWhenever you tap this creature for mana, it deals 1 damage to each opponent." };
const WARRIOR = { name: "Elvish Warrior", type: "Creature — Elf Warrior", mana: "{G}{G}", mana_cost: "{G}{G}", power: "2", toughness: "3", oracle: "" };
// ── Spells cast from hand ──
const ELVES_CARD = { id: "h-elves", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", mana_cost: "{G}", cmc: 1, power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const BOLT = { id: "h-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, oracle: "Lightning Bolt deals 3 damage to any target." };
const BEARS = { id: "h-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: "2", toughness: "2", oracle: "" };
const SOL_RING_CARD = { id: "h-sol", ...SOL_RING, mana_cost: "{1}", cmc: 1 };
const MIND_STONE_CARD = { id: "h-mind", name: "Mind Stone", type: "Artifact", mana: "{2}", mana_cost: "{2}", cmc: 2, oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const RELIC_CARD = { id: "h-relic", name: "Coalition Relic", type: "Artifact", mana: "{3}", mana_cost: "{3}", cmc: 3,
  oracle: "{T}: Add one mana of any color.\n{T}: Put a charge counter on this artifact.\nAt the beginning of your first main phase, remove all charge counters from this artifact. Add one mana of any color for each charge counter removed this way." };
const HAND = [ELVES_CARD, BOLT, BEARS, SOL_RING_CARD, MIND_STONE_CARD, RELIC_CARD];

const on = (id, card, { counters = {}, tapped = false, sick = false, controller = "user" } = {}) => {
  const p = createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: sick });
  return { ...p, tapped, counters: { ...(p.counters || {}), ...counters } };
};
function table(battlefield, { hand = HAND, life = 20, pool = {}, turn = 3, activePlayer = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer, priorityHolder: activePlayer, consecutivePasses: 0, turn,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, hand, life, library: [], graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } },
  };
}
const actions = (s) => legalActionsForPlayer(s, "user");
const castFrom = (s, cardId) => actions(s).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const taps = (s, id = "src") => actions(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id);
const tapFor = (s, color, id = "src") => taps(s, id).find((a) => a.color === color);
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const inGraveyard = (s, name) => s.players.user.graveyard.some((c) => c.name === name);
const pool = (s) => s.players.user.manaPool;
const records = (s, id = "src") => manaSources(s, "user").filter((r) => r.permanentId === id);
const nextTurn = (s, activePlayer = "user") => ({ ...s, turn: s.turn + 1, activePlayer, priorityHolder: activePlayer });

// ═══════════════════════════════════════════ A · COUNTER COSTS ═══════════════════════════════════════════
describe("A · a counter in the cost is paid — removed, or put on", () => {
  it("the parse: each land line carries its counter (and the depletion/mining sacrifice); Wall of Roots carries its -0/-1", () => {
    expect(manaProduction(GEMSTONE_MINE)).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: true,
      removesCounters: { type: "mining", mode: "one" }, sacrificeIfNoCounters: true });
    for (const land of DEPLETION) {
      expect(manaProduction(land)).toMatchObject({ colors: [land.color], amount: 2, requiresTap: true,
        removesCounters: { type: "depletion", mode: "one" }, sacrificeIfNoCounters: true });
    }
    for (const land of VIVID) {
      // The plain line is the land's own; the charge line rides as its own record, never merged into it.
      expect(manaProduction(land)).toEqual({ colors: [land.color], amount: 1, requiresTap: true });
      const extras = extraManaLineProducts(land, manaProduction(land));
      expect(extras).toMatchObject([{ colors: ["W", "U", "B", "R", "G"], amount: 1, removesCounters: { type: "charge", mode: "one" } }]);
      expect(extras[0].sacrificeIfNoCounters).toBeUndefined();
    }
    expect(manaProduction(WALL_OF_ROOTS)).toMatchObject({ colors: ["G"], amount: 1, requiresTap: false, putsCounter: { type: "-0/-1" } });
  });

  it("Gemstone Mine (three mining counters) pays for a spell by the planner: tapped, one counter fewer, still there", () => {
    const s = table([on("src", GEMSTONE_MINE, { counters: { mining: 3 } })]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ tapped: perm(out, "src")?.tapped, mining: perm(out, "src")?.counters?.mining }).toEqual({ tapped: true, mining: 2 });
  });

  it("Gemstone Mine's last counter: the spell is paid and the land is sacrificed as the ability resolves", () => {
    const s = table([on("src", GEMSTONE_MINE, { counters: { mining: 1 } })]);
    const cast = castFrom(s, "h-bolt");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ onBattlefield: !!perm(out, "src"), inGraveyard: inGraveyard(out, "Gemstone Mine") }).toEqual({ onBattlefield: false, inGraveyard: true });
  });

  it("Gemstone Mine by hand: offered for every colour; taking one removes a counter; the last one sacrifices it", () => {
    const s = table([on("src", GEMSTONE_MINE, { counters: { mining: 3 } })]);
    expect(taps(s).map((a) => a.color)).toEqual(["W", "U", "B", "R", "G"]);
    const out = dispatchAction(s, tapFor(s, "U"));
    expect({ U: pool(out).U, mining: perm(out, "src").counters.mining, tapped: perm(out, "src").tapped }).toEqual({ U: 1, mining: 2, tapped: true });
    const last = table([on("src", GEMSTONE_MINE, { counters: { mining: 1 } })]);
    const out2 = dispatchAction(last, tapFor(last, "B"));
    expect({ B: pool(out2).B, onBattlefield: !!perm(out2, "src"), inGraveyard: inGraveyard(out2, "Gemstone Mine") }).toEqual({ B: 1, onBattlefield: false, inGraveyard: true });
  });

  it("control — a Gemstone Mine with no mining counter makes nothing and nothing sacrifices it", () => {
    const s = table([on("src", GEMSTONE_MINE)]);
    expect(records(s)).toEqual([]);
    expect(taps(s)).toEqual([]);
    expect(castFrom(s, "h-elves")).toBeUndefined();
  });

  it("Hickory Woodlot (two depletion counters): {G}{G} for Grizzly Bears, then {G}{G} again and it is sacrificed", () => {
    const s = table([on("src", HICKORY, { counters: { depletion: 2 } })]);
    const cast = castFrom(s, "h-bears");
    expect(cast).toBeDefined();
    const once = dispatchAction(s, cast);
    expect({ tapped: perm(once, "src")?.tapped, depletion: perm(once, "src")?.counters?.depletion }).toEqual({ tapped: true, depletion: 1 });
    const again = table([on("src", HICKORY, { counters: { depletion: 1 } })]);
    const tap = tapFor(again, "G");
    expect(tap).toBeDefined();
    const out = dispatchAction(again, tap);
    expect({ G: pool(out).G, onBattlefield: !!perm(out, "src"), inGraveyard: inGraveyard(out, "Hickory Woodlot") }).toEqual({ G: 2, onBattlefield: false, inGraveyard: true });
  });

  it("Vivid Crag: an off-colour pip is paid from the charge line, removing a counter; the land stays", () => {
    const s = table([on("src", VIVID_CRAG, { counters: { charge: 2 } })]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ tapped: perm(out, "src")?.tapped, charge: perm(out, "src")?.counters?.charge }).toEqual({ tapped: true, charge: 1 });
  });

  it("control — Vivid Crag pays {R} and generic from its plain line, its counters kept; with none left it makes {R} only", () => {
    const s = table([on("src", VIVID_CRAG, { counters: { charge: 2 } })]);
    expect(perm(dispatchAction(s, castFrom(s, "h-bolt")), "src").counters.charge).toBe(2);
    expect(perm(dispatchAction(s, castFrom(s, "h-sol")), "src").counters.charge).toBe(2);
    const dry = table([on("src", VIVID_CRAG)]);
    expect(castFrom(dry, "h-elves")).toBeUndefined();
    expect(castFrom(dry, "h-bolt")).toBeDefined();
    // By hand {R} is the plain line (counters kept); since 2026-10-17 (the land lines) each other colour is the charge line, offered
    // for the colours no earlier record makes, removing a counter (the extra line was planner-only).
    expect(taps(s).map((a) => a.color)).toEqual(["R", "W", "U", "B", "G"]);
    expect(perm(dispatchAction(s, tapFor(s, "R")), "src").counters.charge).toBe(2);
    expect(perm(dispatchAction(s, tapFor(s, "U")), "src").counters.charge).toBe(1);
  });

  it("Tendo Ice Bridge spends its one charge counter on a coloured pip and stays; Mirrodin's Core needs a counter first", () => {
    const s = table([on("src", TENDO, { counters: { charge: 1 } })]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ onBattlefield: !!perm(out, "src"), charge: perm(out, "src")?.counters?.charge ?? 0 }).toEqual({ onBattlefield: true, charge: 0 });
    expect(castFrom(table([on("src", MIRRODINS_CORE)]), "h-elves")).toBeUndefined();
    expect(castFrom(table([on("src", MIRRODINS_CORE, { counters: { charge: 1 } })]), "h-elves")).toBeDefined();
  });

  it("Wall of Roots, summoning sick, pays for Llanowar Elves: a -0/-1 counter goes on it, it doesn't tap, it is a 0/4", () => {
    const s = table([on("src", WALL_OF_ROOTS, { sick: true })]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    const wall = perm(out, "src");
    expect({ tapped: wall?.tapped, counter: wall?.counters?.["-0/-1"], toughness: wall && creatureToughness(wall, out) }).toEqual({ tapped: false, counter: 1, toughness: 4 });
  });

  it("Wall of Roots by hand, even while tapped: {G} for a -0/-1 counter", () => {
    const s = table([on("src", WALL_OF_ROOTS, { tapped: true })]);
    expect(taps(s).map((a) => a.color)).toEqual(["G"]);
    let out = null;
    expect(() => { out = dispatchAction(s, tapFor(s, "G")); }).not.toThrow();
    expect({ G: pool(out).G, counter: perm(out, "src").counters["-0/-1"], tapped: perm(out, "src").tapped }).toEqual({ G: 1, counter: 1, tapped: true });
  });

  it("Wall of Roots' fifth counter leaves it a 0/0, and it dies to the state-based check", () => {
    const s = table([on("src", WALL_OF_ROOTS, { counters: { "-0/-1": 4 } })]);
    const tap = tapFor(s, "G");
    expect(tap).toBeDefined();
    const out = checkAllStateBasedActions(dispatchAction(s, tap));
    expect({ onBattlefield: !!perm(out, "src"), inGraveyard: inGraveyard(out, "Wall of Roots") }).toEqual({ onBattlefield: false, inGraveyard: true });
  });
});

describe("A · the two counter costs are admitted only in their whole printed line", () => {
  it("Throne of Makindi's charge line (two of one colour, kicked spells only) is not one of them: its own read makes nothing", () => {
    const throne = { name: "Throne of Makindi", type: "Land", mana: "",
      oracle: "{T}: Add {C}.\n{1}, {T}: Put a charge counter on this land.\n{T}, Remove a charge counter from this land: Add two mana of any one color. Spend this mana only to cast kicked spells." };
    expect(manaProduction({ ...throne, oracle: throne.oracle.split("\n")[2] })).toBeNull();
    expect(manaProduction(throne)).toEqual({ colors: ["C"], amount: 1, requiresTap: true });
    expect(extraManaLineProducts(throne, manaProduction(throne))).toEqual([]);
  });

  it("a rider beside either counter cost refuses the line (hypothetical variants of the real lines)", () => {
    expect(manaProduction({ name: "Probe Land", type: "Land", mana: "", oracle: "{T}, Remove a mining counter from this land: Add one mana of any color. You gain 1 life." })).toBeNull();
    expect(manaProduction({ name: "Probe Wall", type: "Creature — Plant Wall", mana: "{1}{G}", power: "0", toughness: "5", oracle: "Defender\nPut a -0/-1 counter on this creature: Add {G}. You gain 1 life." })).toBeNull();
  });

  it("the planner keeps the counters when another source can pay: Wall of Roots beside a Forest stays clean", () => {
    const s = table([on("src", WALL_OF_ROOTS), on("f", FOREST)]);
    const out = dispatchAction(s, castFrom(s, "h-elves"));
    expect({ wall: perm(out, "src").counters?.["-0/-1"] ?? 0, forest: perm(out, "f").tapped }).toEqual({ wall: 0, forest: true });
  });

  it("Gemstone Mine sacrificed with its last counter is a sacrifice: Korvold, Fae-Cursed King sees it (CR 701.21a)", () => {
    const korvold = { name: "Korvold, Fae-Cursed King", type: "Legendary Creature — Dragon Noble", mana: "{2}{B}{R}{G}", power: "4", toughness: "4",
      oracle: "Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card." };
    const s = table([on("src", GEMSTONE_MINE, { counters: { mining: 1 } }), on("korvold", korvold)]);
    const tap = tapFor(s, "R");
    expect(tap).toBeDefined();
    const out = dispatchAction(s, tap);
    expect((out.pendingTriggers || []).map((t) => t.source?.card?.name || t.source?.name)).toEqual(["Korvold, Fae-Cursed King"]);
  });
});

// ═══════════════════════════════════════════ B · NO {T}, NO TAP ═══════════════════════════════════════════
describe("B · a mana ability without {T} doesn't tap its source (CR 107.5, 106.12)", () => {
  it("Ashnod's Altar pays Grizzly Bears' {1} by the planner and stays untapped; the creature is sacrificed", () => {
    const s = table([on("src", ASHNOD), on("f", FOREST), on("warrior", WARRIOR)]);
    const cast = castFrom(s, "h-bears");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ altarTapped: perm(out, "src").tapped, warrior: !!perm(out, "warrior"), forestTapped: perm(out, "f").tapped }).toEqual({ altarTapped: false, warrior: false, forestTapped: true });
  });

  it("Ashnod's Altar and Phyrexian Altar by hand: untapped after use, and offered again while a creature is left", () => {
    const s = table([on("src", ASHNOD), on("w1", WARRIOR), on("w2", WARRIOR)]);
    const out = dispatchAction(s, tapFor(s, "C"));
    expect({ C: pool(out).C, tapped: perm(out, "src").tapped }).toEqual({ C: 2, tapped: false });
    expect(taps(out).map((a) => a.color)).toEqual(["C"]);
    const p = table([on("src", PHYREXIAN_ALTAR), on("w1", WARRIOR)]);
    const pout = dispatchAction(p, tapFor(p, "B"));
    expect({ B: pool(pout).B, tapped: perm(pout, "src").tapped }).toEqual({ B: 1, tapped: false });
  });

  it("Birchlore Rangers taps the two Elves it pays with — not itself as well", () => {
    const s = table([on("src", RANGERS), on("w1", WARRIOR), on("w2", WARRIOR)]);
    const cast = castFrom(s, "h-elves");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ rangers: perm(out, "src").tapped, w1: perm(out, "w1").tapped, w2: perm(out, "w2").tapped }).toEqual({ rangers: false, w1: true, w2: true });
    const hand = dispatchAction(s, tapFor(s, "G"));
    expect({ G: pool(hand).G, rangers: perm(hand, "src").tapped, w1: perm(hand, "w1").tapped, w2: perm(hand, "w2").tapped }).toEqual({ G: 1, rangers: false, w1: true, w2: true });
  });

  it("Kozilek's Translator pays 1 life and doesn't tap, by the planner and by hand", () => {
    const s = table([on("src", TRANSLATOR)]);
    const cast = castFrom(s, "h-sol");
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ tapped: perm(out, "src").tapped, life: out.players.user.life }).toEqual({ tapped: false, life: 19 });
    const hand = dispatchAction(s, tapFor(s, "C"));
    expect({ C: pool(hand).C, tapped: perm(hand, "src").tapped, life: hand.players.user.life }).toEqual({ C: 1, tapped: false, life: 19 });
  });

  it("Treasonous Ogre pays its 3 life only when nothing else can: a Mountain beside it pays Lightning Bolt; alone, it pays", () => {
    const OGRE = { name: "Treasonous Ogre", type: "Creature — Ogre Shaman", mana: "{3}{R}", power: "2", toughness: "3",
      oracle: "Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nPay 3 life: Add {R}." };
    const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", oracle: "({T}: Add {R}.)" };
    const both = table([on("src", OGRE), on("m", MOUNTAIN)]);
    const out = dispatchAction(both, castFrom(both, "h-bolt"));
    expect({ life: out.players.user.life, mountain: perm(out, "m").tapped, ogre: perm(out, "src").tapped }).toEqual({ life: 20, mountain: true, ogre: false });
    const alone = table([on("src", OGRE)]);
    const cast = castFrom(alone, "h-bolt");
    expect(cast).toBeDefined();
    expect(dispatchAction(alone, cast).players.user.life).toBe(17);
  });

  it("a tapped Ashnod's Altar or Kozilek's Translator is still a mana source (no {T} to pay)", () => {
    expect(records(table([on("src", ASHNOD, { tapped: true }), on("w1", WARRIOR)]))).toMatchObject([{ colors: ["C"], amount: 2 }]);
    expect(records(table([on("src", TRANSLATOR, { tapped: true })]))).toMatchObject([{ colors: ["C"], amount: 1 }]);
  });

  it("a granted ability decides it too: a tapped Sliver is no source through Gemhide's {T} grant, still one through Basal's sacrifice", () => {
    const GEMHIDE = { name: "Gemhide Sliver", type: "Creature — Sliver", mana: "{1}{G}", power: "1", toughness: "1", oracle: "All Slivers have \"{T}: Add one mana of any color.\"" };
    const BASAL = { name: "Basal Sliver", type: "Creature — Sliver", mana: "{2}{B}", power: "2", toughness: "2", oracle: "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"" };
    const METALLIC = { name: "Metallic Sliver", type: "Artifact Creature — Sliver", mana: "{1}", power: "1", toughness: "1", oracle: "" };
    expect(records(table([on("src", METALLIC, { tapped: true }), on("gem", GEMHIDE, { tapped: true })]))).toEqual([]);
    expect(records(table([on("src", METALLIC), on("gem", GEMHIDE, { tapped: true })]))).toMatchObject([{ colors: ["W", "U", "B", "R", "G"], amount: 1 }]);
    expect(records(table([on("src", METALLIC, { tapped: true }), on("basal", BASAL)]))).toMatchObject([{ colors: ["B"], amount: 2, sacrifices: true }]);
  });

  it("controls — Sol Ring and a Forest still tap; a {T} source still fires its tapped-for-mana watcher", () => {
    const s = table([on("src", SOL_RING), on("f", FOREST)]);
    const out = dispatchAction(s, castFrom(s, "h-bears"));
    expect({ sol: perm(out, "src").tapped, forest: perm(out, "f").tapped }).toEqual({ sol: true, forest: true });
    expect(records(table([on("src", SOL_RING, { tapped: true })]))).toEqual([]);
    const z = table([on("src", ZHUR_TAA)]);
    const zout = dispatchAction(z, tapFor(z, "G"));
    expect(perm(zout, "src").tapped).toBe(true);
    expect((zout.pendingTriggers || []).length).toBe(1);
  });
});

// ═══════════════════════════════════════════ C · PER-TURN LIMITS ═══════════════════════════════════════════
describe("C · \"Activate only once each turn\" and the other printed limits hold per turn (CR 602.5b)", () => {
  it("Kozilek's Translator: once this turn, by hand and by the planner; again next turn, an opponent's turn included", () => {
    const s = table([on("src", TRANSLATOR)]);
    const used = dispatchAction(s, tapFor(s, "C"));
    expect(taps(used)).toEqual([]);
    expect(records(used)).toEqual([]);
    expect(castFrom(used, "h-mind")).toBeUndefined(); // one {C} floating, the Translator spent: {2} is out of reach
    expect(records(nextTurn(used, "ai"))).toMatchObject([{ colors: ["C"], amount: 1 }]);
    expect(taps(nextTurn(used))).toHaveLength(1);
    const byPlanner = dispatchAction(s, castFrom(s, "h-sol"));
    expect(records(byPlanner)).toEqual([]);
    expect(records(nextTurn(byPlanner))).toHaveLength(1);
  });

  it("Wall of Roots: once each turn", () => {
    const s = table([on("src", WALL_OF_ROOTS)]);
    const tap = tapFor(s, "G");
    expect(tap).toBeDefined();
    const used = dispatchAction(s, tap);
    expect(taps(used)).toEqual([]);
    expect(records(used)).toEqual([]);
    expect(records(nextTurn(used, "ai"))).toHaveLength(1);
  });

  it("Shire Scarecrow once; Manaforge Cinder three times; Initiates of the Ebon Hand three times (a fourth would sacrifice it)", () => {
    const run = (card) => {
      let s = table([on("src", card)], { pool: { C: 9 } });
      let n = 0;
      for (let tap = taps(s)[0]; tap && n < 6; tap = taps(s)[0]) { s = dispatchAction(s, tap); n += 1; }
      return { n, tapped: perm(s, "src").tapped, nextTurn: taps(nextTurn(s)).length > 0 };
    };
    expect(run(SHIRE_SCARECROW)).toEqual({ n: 1, tapped: false, nextTurn: true });
    expect(run(MANAFORGE_CINDER)).toEqual({ n: 3, tapped: false, nextTurn: true });
    expect(run(INITIATES)).toEqual({ n: 3, tapped: false, nextTurn: true });
  });

  it("Vivi Ornitier makes X = her power, of {U} and/or {R}, once on her controller's turn and never on an opponent's", () => {
    // Power 0: X is 0 — the record makes nothing (a 0-mana source is never offered by hand nor spent by the planner).
    expect(records(table([on("src", VIVI)])).map((r) => r.amount)).toEqual([0]);
    expect(taps(table([on("src", VIVI)]))).toEqual([]);
    expect(castFrom(table([on("src", VIVI)]), "h-bolt")).toBeUndefined();
    const s = table([on("src", VIVI, { counters: { "+1/+1": 2 } })]);
    expect(records(s)).toMatchObject([{ colors: ["U", "R"], amount: 2 }]);
    expect(records(nextTurn(s, "ai"))).toEqual([]);
    expect(canAfford(pool(s), manaSources(s, "user"), { R: 2 })).toBe(true); // X of one colour per activation — an under-read of "any combination"
    expect(canAfford(pool(s), manaSources(s, "user"), { R: 3 })).toBe(false);
    const tap = tapFor(s, "U");
    expect(tap).toBeDefined();
    const used = dispatchAction(s, tap);
    expect({ U: pool(used).U, tapped: perm(used, "src").tapped }).toEqual({ U: 2, tapped: false });
    expect(records(used)).toEqual([]);
  });
});

// ═══════════════════════════════════════════ D · KINNAN ═══════════════════════════════════════════
describe("D · Kinnan adds mana only when a nonland permanent is TAPPED for mana (CR 106.12, 106.12a)", () => {
  it("an Ashnod's Altar activation gets no Kinnan mana — by the planner and by hand", () => {
    const s = table([on("src", ASHNOD), on("kinnan", KINNAN), on("w1", WARRIOR)]);
    expect(records(s)[0]?.bonus).toBeUndefined();
    expect(canAfford(pool(s), manaSources(s, "user").filter((r) => r.permanentId === "src"), { generic: 3 })).toBe(false);
    expect(castFrom(table([on("src", ASHNOD), on("kinnan", KINNAN, { tapped: true }), on("w1", WARRIOR)]), "h-relic")).toBeUndefined();
    const out = dispatchAction(s, tapFor(s, "C"));
    expect(pool(out).C).toBe(2);
  });

  it("an Eldrazi Spawn sacrificed for mana gets no Kinnan mana", () => {
    const s = table([on("src", SPAWN, { sick: true }), on("kinnan", KINNAN, { tapped: true })]);
    const out = dispatchAction(s, tapFor(s, "C"));
    expect(pool(out).C).toBe(1);
    expect(castFrom(s, "h-mind")).toBeUndefined();
  });

  it("controls — a tapped Sol Ring, Llanowar Elves and a Treasure still get Kinnan's extra mana; a Forest still doesn't", () => {
    const sol = table([on("src", SOL_RING), on("kinnan", KINNAN)]);
    expect(pool(dispatchAction(sol, tapFor(sol, "C"))).C).toBe(3);
    const elves = table([on("src", ELVES), on("kinnan", KINNAN)]);
    expect(pool(dispatchAction(elves, tapFor(elves, "G"))).G).toBe(2);
    const treasure = table([on("src", TREASURE), on("kinnan", KINNAN)]);
    expect(pool(dispatchAction(treasure, tapFor(treasure, "R"))).R).toBe(2);
    const forest = table([on("src", FOREST), on("kinnan", KINNAN)]);
    expect(pool(dispatchAction(forest, tapFor(forest, "G"))).G).toBe(1);
  });
});
