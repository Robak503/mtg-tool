/**
 * genericTapWholeBoard.test.js — the generic tap's plain-colorless promotion counts a permanent's other mana lines wherever
 * they sit on the board, not only the records one planner pass may tap (manaModel holdsBack / planPayment, 2026-10-17).
 *
 * 3d121554 made the auto-tap pay generic with a plain colorless permanent first (Sol Ring, Wastes): one whose every
 * record is colorless with no rider. The map was built from the records handed to that planPaymentCore call, and three
 * passes hand it a subset: planPaymentOnce's direct pass (and activateCostedInOrder's funding and rest calls) see only
 * the records with no activation cost; planPayment's pass A holds out the one-shot records; planPaymentRemovalAware's
 * pass A holds out the counter records. So Nykthos, Shrine to Nyx ("{T}: Add {C}." beside its "{2}, {T}:" devotion line)
 * looked like Wastes, and its tap went to one {C} first for generic — measured by the Omnath self-play lane on its deck.
 * Three Tree City, the filter lands and the "{1}, {T}: Add one mana of any color" lands (their second lines made since
 * f71b7e86), Crystal Vein's sacrifice line and Mage-Ring Network's storage line did the same. Such a permanent now keeps
 * its board place for generic, as Mogg Hollows always did — planPayment's second plan, taken when it also pays; the first
 * plan (each call's own judgment, as before) still decides affordability. A spend-restricted line counts only when the
 * payment may spend it (Eldrazi Temple, as 3d121554 judged it); when it may not, the second plan holds the permanent back behind
 * every unrestricted source (2026-10-21 — restrictedLineHold.test.js). An order change only: any mana pays generic (CR 107.4b).
 *
 * Real oracle fixtures: bundled Scryfall via cardIndex.publicCard (2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { canAfford, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const land = (name, type, oracle) => ({ name, type, mana: "", cmc: 0, colors: [], keywords: [], oracle });
const NYKTHOS = land("Nykthos, Shrine to Nyx", "Legendary Land", "{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)");
const THREE_TREE = land("Three Tree City", "Legendary Land", "As Three Tree City enters, choose a creature type.\n{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of the chosen type.");
const CRYSTAL_VEIN = land("Crystal Vein", "Land", "{T}: Add {C}.\n{T}, Sacrifice this land: Add {C}{C}.");
const MAGE_RING = land("Mage-Ring Network", "Land", "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {C} for each storage counter removed this way.");
const ELDRAZI_TEMPLE = land("Eldrazi Temple", "Land", "{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless Eldrazi spells or activate abilities of colorless Eldrazi.");
const WASTES = land("Wastes", "Basic Land", "{T}: Add {C}.");
const FOREST = land("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const MOUNTAIN = land("Mountain", "Basic Land — Mountain", "({T}: Add {R}.)");
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const SIMIC_SIGNET = { name: "Simic Signet", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [], oracle: "{1}, {T}: Add {G}{U}." };
const LEATHERBACK = { name: "Leatherback Baloth", type: "Creature — Beast", mana: "{G}{G}{G}", cmc: 3, colors: ["G"], keywords: [], power: "4", toughness: "5", oracle: "" };
const ELVISH_WARRIOR = { name: "Elvish Warrior", type: "Creature — Elf Warrior", mana: "{G}{G}", cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "3", oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "2", oracle: "" };
const RUMBLING = { name: "Rumbling Baloth", type: "Creature — Beast", mana: "{2}{G}{G}", cmc: 4, colors: ["G"], keywords: [], power: "4", toughness: "4", oracle: "" };
const COILING_ORACLE = { name: "Coiling Oracle", type: "Creature — Snake Elf Druid", mana: "{G}{U}", cmc: 2, colors: ["G", "U"], keywords: [], power: "1", toughness: "1",
  oracle: "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand." };
const SWAMP = land("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)");
const CATARACTS = { ...land("Cascading Cataracts", "Land", "Indestructible\n{T}: Add {C}.\n{5}, {T}: Add five mana in any combination of colors."), keywords: ["Indestructible"] };
const SELESNYA_SIGNET = { name: "Selesnya Signet", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [], oracle: "{1}, {T}: Add {G}{W}." };
const GRAVEN_CAIRNS = land("Graven Cairns", "Land", "{T}: Add {C}.\n{B/R}, {T}: Add {B}{B}, {B}{R}, or {R}{R}.");
const UNKNOWN_SHORES = land("Unknown Shores", "Land", "{T}: Add {C}.\n{1}, {T}: Add one mana of any color.");
const HYMN = { name: "Hymn to Tourach", type: "Sorcery", mana: "{B}{B}", cmc: 2, colors: ["B"], keywords: [], oracle: "Target player discards two cards at random." };
const LLANOWAR = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, colors: ["G"], keywords: [], power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const STRIKE = { name: "Lightning Strike", type: "Instant", mana: "{1}{R}", cmc: 2, colors: ["R"], keywords: [], oracle: "Lightning Strike deals 3 damage to any target." };

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function table({ user = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: [{ ...FOREST, id: "lib" }], manaPool: { ...NO_MANA, ...mana } } } };
}
const P = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
const forests = (n) => Array.from({ length: n }, (_, i) => P(`f${i + 1}`, FOREST));
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no such action offered"); return dispatchAction(s, a); }
/** Resolve the stack — and fail loudly on a resolver crash (the engine logs one as a stack-resolve-error instead of throwing). */
const settle = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
const pool = (s) => ({ ...s.players.user.manaPool });
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const onBattlefield = (s) => s.players.user.battlefield.map((p) => p.id).sort();
const cast = (cardId) => (a) => a.kind === "cast-spell" && a.cardId === cardId;
const castAtAi = (cardId) => (a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === "ai";
const offered = (s, cardId) => legalActionsForPlayer(s, "user").some(cast(cardId));
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
const planTaps = (s, c) => planPayment(s.players.user.manaPool, manaSources(s, "user"), cost(c))?.taps.map((t) => t.permanentId).sort() ?? null;

describe("a {C} line beside a costed mana line — the permanent is not plain colorless (planPaymentOnce's direct pass)", () => {
  it("Forest x4, Nykthos, Leatherback Baloth: Grizzly Bears' {1}{G} taps two Forests and Nykthos stays up; Rumbling Baloth then comes off Nykthos' devotion (four green)", () => {
    const s0 = table({ user: [...forests(4), P("nyx", NYKTHOS), P("leather", LEATHERBACK)], hand: [["bears", BEARS], ["rumbling", RUMBLING]] });
    const bears = act(s0, cast("bears"));
    const afterBears = settle(bears);
    const rumblingOffered = offered(afterBears, "rumbling");
    const rumbling = rumblingOffered ? settle(act(afterBears, cast("rumbling"))) : null;
    expect({ tapped: tapped(bears), pool: pool(bears), rumblingOffered, rumblingTapped: rumbling && tapped(rumbling), rumblingOnBattlefield: !!rumbling?.players.user.battlefield.some((p) => p.card?.name === "Rumbling Baloth") })
      .toEqual({ tapped: ["f1", "f2"], pool: NO_MANA, rumblingOffered: true, rumblingTapped: ["f1", "f2", "f3", "f4", "nyx"], rumblingOnBattlefield: true });
  });

  it("Forest, Nykthos, Sol Ring, Leatherback Baloth: the Ring pays Grizzly Bears' {1} (its spare {C} floats) — Nykthos no longer counts as the exact cover", () => {
    const s0 = table({ user: [P("f1", FOREST), P("nyx", NYKTHOS), P("ring", SOL_RING), P("leather", LEATHERBACK)], hand: [["bears", BEARS]] });
    const bears = act(s0, cast("bears"));
    expect({ tapped: tapped(bears), pool: pool(bears) }).toEqual({ tapped: ["f1", "ring"], pool: { ...NO_MANA, C: 1 } });
  });

  it("Forest x4, Three Tree City (Elf), Elvish Warrior x4: Grizzly Bears' {1}{G} taps two Forests; Three Tree City then makes four green for Rumbling Baloth", () => {
    const elves = Array.from({ length: 4 }, (_, i) => P(`e${i + 1}`, ELVISH_WARRIOR));
    const s0 = table({ user: [...forests(4), P("ttc", THREE_TREE, { chosenType: "Elf" }), ...elves], hand: [["bears", BEARS], ["rumbling", RUMBLING]] });
    const bears = act(s0, cast("bears"));
    const afterBears = settle(bears);
    expect({ tapped: tapped(bears), pool: pool(bears), rumblingOffered: offered(afterBears, "rumbling") }).toEqual({ tapped: ["f1", "f2"], pool: NO_MANA, rumblingOffered: true });
  });
});

describe("the land lines f71b7e86 made — a filter land and a \"{1}, {T}: Add one mana of any color\" land beside basics", () => {
  it("Mountain x3, Graven Cairns: Lightning Strike's {1}{R} taps two Mountains; the Cairns then filters the third Mountain's {R} into {B}{B} for Hymn to Tourach", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("m3", MOUNTAIN), P("cairns", GRAVEN_CAIRNS)], hand: [["strike", STRIKE], ["hymn", HYMN]] });
    const strike = act(s0, castAtAi("strike"));
    expect({ tapped: tapped(strike), pool: pool(strike), hymnOffered: offered(settle(strike), "hymn") }).toEqual({ tapped: ["m1", "m2"], pool: NO_MANA, hymnOffered: true });
  });

  it("Mountain x3, Unknown Shores: Lightning Strike's {1}{R} taps two Mountains; the Shores then turns the third Mountain's mana into {G} for Llanowar Elves", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("m3", MOUNTAIN), P("shores", UNKNOWN_SHORES)], hand: [["strike", STRIKE], ["elves", LLANOWAR]] });
    const strike = act(s0, castAtAi("strike"));
    expect({ tapped: tapped(strike), pool: pool(strike), elvesOffered: offered(settle(strike), "elves") }).toEqual({ tapped: ["m1", "m2"], pool: NO_MANA, elvesOffered: true });
  });
});

describe("inside the costed pass — activateCostedInOrder's funding and rest calls judge by the whole board too", () => {
  it("Forest, Nykthos, Simic Signet, Leatherback Baloth: Coiling Oracle's {G}{U} funds the Signet's {1} with the Forest — Nykthos stays up", () => {
    const s0 = table({ user: [P("f1", FOREST), P("nyx", NYKTHOS), P("signet", SIMIC_SIGNET), P("leather", LEATHERBACK)], hand: [["oracle", COILING_ORACLE]] });
    const paid = act(s0, cast("oracle"));
    expect({ tapped: tapped(paid), pool: pool(paid) }).toEqual({ tapped: ["f1", "signet"], pool: NO_MANA });
  });

  it("a floating {C} funds Simic Signet; the rest of {1}{G}{U} takes its {1} from a Forest, not Nykthos", () => {
    const s = table({ user: [P("signet", SIMIC_SIGNET), P("f1", FOREST), P("f2", FOREST), P("nyx", NYKTHOS), P("leather", LEATHERBACK)], mana: { C: 1 } });
    expect(planTaps(s, { generic: 1, G: 1, U: 1 })).toEqual(["f1", "signet"]);
  });
});

describe("a line a pass holds out still counts — one-shot and counter lines", () => {
  it("Forest, Forest, Crystal Vein: Grizzly Bears taps both Forests — the Vein keeps its tap (and its sacrifice line) for later", () => {
    const s0 = table({ user: [...forests(2), P("vein", CRYSTAL_VEIN)], hand: [["bears", BEARS]] });
    const bears = act(s0, cast("bears"));
    expect({ tapped: tapped(bears), battlefield: onBattlefield(bears) }).toEqual({ tapped: ["f1", "f2"], battlefield: ["f1", "f2", "vein"] });
  });

  it("Forest, Forest, Mage-Ring Network with two storage counters: Grizzly Bears taps both Forests — the Network keeps its tap and its counters", () => {
    const s0 = table({ user: [...forests(2), P("net", MAGE_RING, { counters: { storage: 2 } })], hand: [["bears", BEARS]] });
    const bears = act(s0, cast("bears"));
    expect({ tapped: tapped(bears), storage: bears.players.user.battlefield.find((p) => p.id === "net").counters?.storage ?? 0 }).toEqual({ tapped: ["f1", "f2"], storage: 2 });
  });

});

describe("affordability never moves — planPayment's first plan (each call's own judgment) decides it", () => {
  const affords = (s, c) => ({ plan: planTaps(s, c), canAfford: canAfford(s.players.user.manaPool, manaSources(s, "user"), cost(c)) });

  it("Swamp, Mage-Ring Network (one storage counter), Simic Signet pay {U}{B}{G}: the Network's {C} funds the Signet, the Swamp pays {B} — judged by the board alone, the funding took the Swamp and stranded the {B}", () => {
    const s = table({ user: [P("swamp", SWAMP), P("net", MAGE_RING, { counters: { storage: 1 } }), P("signet", SIMIC_SIGNET)] });
    expect(affords(s, { U: 1, B: 1, G: 1 })).toEqual({ plan: ["net", "signet", "swamp"], canAfford: true });
  });

  it("Selesnya Signet, Swamp, Cascading Cataracts can't pay {2}{C} — the board-judged plan (the Swamp funds the Signet, Cataracts pays {C}) would; a false negative kept, not a new offer", () => {
    const s = table({ user: [P("signet", SELESNYA_SIGNET), P("swamp", SWAMP), P("cataracts", CATARACTS)] });
    expect(affords(s, { generic: 2, C: 1 })).toEqual({ plan: null, canAfford: false });
  });
});

describe("controls — a permanent whose every record is plain colorless still goes first", () => {
  it("Forest, Forest, Wastes: Grizzly Bears' {1} taps the Wastes", () => {
    const s0 = table({ user: [...forests(2), P("w", WASTES)], hand: [["bears", BEARS]] });
    expect(tapped(act(s0, cast("bears")))).toEqual(["f1", "w"]);
  });

  it("Mountain, Mountain, Sol Ring: Lightning Strike's {1} taps the Ring and its spare {C} floats", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("ring", SOL_RING)], hand: [["strike", STRIKE]] });
    const paid = act(s0, castAtAi("strike"));
    expect({ tapped: tapped(paid), pool: pool(paid) }).toEqual({ tapped: ["m1", "ring"], pool: { ...NO_MANA, C: 1 } });
  });

  it("scope: a spend-restricted line the payment may not spend holds its permanent back (the restricted-line hold, 2026-10-21; restrictedLineHold.test.js) — Grizzly Bears (not an Eldrazi) taps both Forests and keeps Eldrazi Temple", () => {
    const s0 = table({ user: [...forests(2), P("temple", ELDRAZI_TEMPLE)], hand: [["bears", BEARS]] });
    expect(tapped(act(s0, cast("bears")))).toEqual(["f1", "f2"]);
  });

  it("scope: judged by the records on the board — at devotion 0 Nykthos offers only its {C} (no devotion record), so it is taken first like Wastes", () => {
    const s0 = table({ user: [...forests(2), P("nyx", NYKTHOS)], hand: [["bears", BEARS]] });
    expect({ records: manaSources(s0, "user").filter((r) => r.permanentId === "nyx").length, tapped: tapped(act(s0, cast("bears"))) }).toEqual({ records: 1, tapped: ["f1", "nyx"] });
  });
});
