/**
 * artifactLandAdventure.test.js — ADVENTURE (CR 715) with an ARTIFACT permanent half (The Arkenstone, Horn of Valhalla …) and
 * with a LAND permanent half (the Final Fantasy Towns: Jidoor, Midgar …, and Value Town).
 *
 * The Adventure lane took creature and enchantment permanent halves only: adventure.parseAdventureCard returned null for an
 * artifact or a land half, so the combined card never reached the lane. Two wrong things followed:
 *   · an ARTIFACT Adventure was offered as the COMBINED card by the generic cast builder — at the summed cost of both halves
 *     ("{3}{G} // {2}{G}" read as {5}{G}{G}), and at INSTANT speed when the Adventure half is an Instant (Two-Handed Axe) — and
 *     never as either half;
 *   · a LAND Adventure (a Town) was played from hand as the combined card, its Adventure was never offered, and nothing could
 *     play the land from adventure-exile.
 *
 * Nothing in CR 715 is creature-specific. The normal characteristics are whatever the card prints (CR 715.2, 715.4), and the
 * exiled card may be PLAYED (CR 715.3d — "For as long as that card remains exiled, that player may play it"): an artifact is
 * cast (CR 301.1, sorcery speed), a land is played — the special action of CR 116.2a / 305.1, which counts as the turn's land
 * play (CR 305.2a: "including lands played as special actions") and is legal only while a land play remains (CR 305.2b) and
 * only on the player's own turn (CR 305.3). A land is never cast (CR 305.1: "it is never a spell").
 *
 * FLIPS (both halves modeled, every one played end to end below): The Arkenstone // Seek the Heart, Horn of Valhalla //
 * Ysgard's Call, Jidoor, Aristocratic Capital // Overture, Value Town // Take a Trip to….
 * PARKED (one half unmodeled; the permanent half still casts or plays, the Adventure is never offered): Altar of Bhaal, My
 * Precious, Ghost Lantern, Two-Handed Axe (the artifact half), Monster Manual (Zoological Study), Glamdring (both halves);
 * Lindblum, Midgar, Ishgard, Zanarkand (the Adventure half).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, publicCard shape, copied 2026-10-17). Every runtime witness drives the real
 * paths: legalActionsForPlayer → dispatchAction → resolveTopOfStack, the tutor settle, and the step path for the end step.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard, isNativeTier, spellIsNative } from "./coverage.js";
import { faceViews, isAdventureCard, parseAdventureCard, permanentFaceCard } from "./adventure.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { manaSources } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const fx = (id, o) => ({ id, keywords: [], power: null, toughness: null, ...o });
// ── the artifact halves ──
const ARKENSTONE = fx("c-ark", { colors: [], name: "The Arkenstone // Seek the Heart", type: "Legendary Artifact // Sorcery — Adventure", mana: "{5} // {2}{W}", cmc: 5, layout: "adventure",
  oracle: "The Arkenstone - Legendary Artifact {5}\nCreatures you control get +1/+1.\nAt the beginning of your end step, draw a card.\n//\nSeek the Heart - Sorcery — Adventure {2}{W}\nSearch your library for a legendary creature card, reveal it, put it into your hand, then shuffle. (Then exile this card. You may cast the artifact later from exile.)" });
const HORN = fx("c-horn", { colors: ["W"], keywords: ["Equip"], name: "Horn of Valhalla // Ysgard's Call", type: "Artifact — Equipment // Sorcery — Adventure", mana: "{1}{W} // {X}{W}{W}", cmc: 2, layout: "adventure",
  oracle: "Horn of Valhalla - Artifact — Equipment {1}{W}\nEquipped creature gets +1/+1 for each creature you control.\nEquip {3}\n//\nYsgard's Call - Sorcery — Adventure {X}{W}{W}\nCreate X 1/1 white Soldier creature tokens. (Then exile this card. You may cast the artifact later from exile.)" });
const ALTAR = fx("c-altar", { colors: ["B"], name: "Altar of Bhaal // Bone Offering", type: "Artifact // Sorcery — Adventure", mana: "{1}{B} // {2}{B}", cmc: 2, layout: "adventure",
  oracle: "Altar of Bhaal - Artifact {1}{B}\n{2}{B}, {T}, Exile a creature you control: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery.\n//\nBone Offering - Sorcery — Adventure {2}{B}\nCreate a tapped 4/1 black Skeleton creature token with menace. (Then exile this card. You may cast the artifact later from exile.)" });
const GLAMDRING = fx("c-glam", { colors: [], keywords: ["Equip", "Mill"], name: "Glamdring, Foe-hammer // Gleam of Death", type: "Legendary Artifact — Equipment // Sorcery — Adventure", mana: "{2} // {3}{U}", cmc: 2, layout: "adventure",
  oracle: "Glamdring, Foe-hammer - Legendary Artifact — Equipment {2}\nInstant and sorcery spells you cast cost {X} less to cast, where X is equipped creature's power.\nEquip {2}\n//\nGleam of Death - Sorcery — Adventure {3}{U}\nMill six cards, then put all instant and sorcery cards from among them into your hand. (Then exile this card. You may cast the artifact later from exile.)" });
const PRECIOUS = fx("c-prec", { colors: [], keywords: ["Equip"], name: "My Precious // Allure of Power", type: "Legendary Artifact — Equipment // Instant — Adventure", mana: "{3} // {1}{B}", cmc: 3, layout: "adventure",
  oracle: "My Precious - Legendary Artifact — Equipment {3}\nEquipped creature has hexproof and can't be blocked.\nEquip—{2}, Pay 2 life.\n//\nAllure of Power - Instant — Adventure {1}{B}\nAs an additional cost to cast this spell, sacrifice a creature.\nDraw two cards." });
const LANTERN = fx("c-lantern", { colors: ["B"], keywords: ["Equip"], name: "Ghost Lantern // Bind Spirit", type: "Artifact — Equipment // Instant — Adventure", mana: "{B} // {1}{B}", cmc: 1, layout: "adventure",
  oracle: "Ghost Lantern - Artifact — Equipment {B}\nWhenever a creature you control dies, put a +1/+1 counter on equipped creature.\nEquip {1}\n//\nBind Spirit - Instant — Adventure {1}{B}\nReturn target creature card from your graveyard to your hand. (Then exile this card. You may cast the artifact later from exile.)" });
const MANUAL = fx("c-manual", { colors: ["G"], keywords: ["Mill"], name: "Monster Manual // Zoological Study", type: "Artifact — Book // Sorcery — Adventure", mana: "{3}{G} // {2}{G}", cmc: 4, layout: "adventure",
  oracle: "Monster Manual - Artifact — Book {3}{G}\n{1}{G}, {T}: You may put a creature card from your hand onto the battlefield.\n//\nZoological Study - Sorcery — Adventure {2}{G}\nMill five cards, then return a creature card milled this way to your hand. (Then exile this card. You may cast the artifact later from exile.)" });
const AXE = fx("c-axe", { colors: ["R"], keywords: ["Equip", "Double"], name: "Two-Handed Axe // Sweeping Cleave", type: "Artifact — Equipment // Instant — Adventure", mana: "{2}{R} // {1}{R}", cmc: 3, layout: "adventure",
  oracle: "Two-Handed Axe - Artifact — Equipment {2}{R}\nWhenever equipped creature attacks, double its power until end of turn.\nEquip {1}{R}\n//\nSweeping Cleave - Instant — Adventure {1}{R}\nTarget creature you control gains double strike until end of turn. (Then exile this card. You may cast the artifact later from exile.)" });
// ── the land (Town) halves ──
const JIDOOR = fx("c-jidoor", { colors: [], keywords: ["Mill"], name: "Jidoor, Aristocratic Capital // Overture", type: "Land — Town // Sorcery — Adventure", mana: "{4}{U}{U}", cmc: 0, layout: "adventure",
  oracle: "Jidoor, Aristocratic Capital - Land — Town \nThis land enters tapped.\n{T}: Add {U}.\n//\nOverture - Sorcery — Adventure {4}{U}{U}\nTarget opponent mills half their library, rounded down. (Then exile this card. You may play the land later from exile.)" });
const VALUE_TOWN = fx("c-value", { colors: [], name: "Value Town // Take a Trip to...", type: "Land — Town // Sorcery — Adventure", mana: "{4}{U}{R}", cmc: 0, layout: "adventure",
  oracle: "Value Town - Land — Town \nValue Town enters the battlefield tapped.\n{T}: Add {U} or {R}.\n//\nTake a Trip to... - Sorcery — Adventure {4}{U}{R}\nDraw two cards. This spell deals 2 damage to each opponent. (Then exile this card. You may play the land later from exile.)" });
const MIDGAR = fx("c-midgar", { colors: [], name: "Midgar, City of Mako // Reactor Raid", type: "Land — Town // Sorcery — Adventure", mana: "{2}{B}", cmc: 0, layout: "adventure",
  oracle: "Midgar, City of Mako - Land — Town \nThis land enters tapped.\n{T}: Add {B}.\n//\nReactor Raid - Sorcery — Adventure {2}{B}\nYou may sacrifice an artifact or creature. If you do, draw two cards. (Then exile this card. You may play the land later from exile.)" });
const ISHGARD = fx("c-ishgard", { colors: [], name: "Ishgard, the Holy See // Faith & Grief", type: "Land — Town // Sorcery — Adventure", mana: "{3}{W}{W}", cmc: 0, layout: "adventure",
  oracle: "Ishgard, the Holy See - Land — Town \nThis land enters tapped.\n{T}: Add {W}.\n//\nFaith & Grief - Sorcery — Adventure {3}{W}{W}\nReturn up to two target artifact and/or enchantment cards from your graveyard to your hand. (Then exile this card. You may play the land later from exile.)" });
const ZANARKAND = fx("c-zanarkand", { colors: [], name: "Zanarkand, Ancient Metropolis // Lasting Fayth", type: "Land — Town // Sorcery — Adventure", mana: "{4}{G}{G}", cmc: 0, layout: "adventure",
  oracle: "Zanarkand, Ancient Metropolis - Land — Town \nThis land enters tapped.\n{T}: Add {G}.\n//\nLasting Fayth - Sorcery — Adventure {4}{G}{G}\nCreate a 1/1 colorless Hero creature token. Put a +1/+1 counter on it for each land you control. (Then exile this card. You may play the land later from exile.)" });
const LINDBLUM = fx("c-lindblum", { colors: [], name: "Lindblum, Industrial Regency // Mage Siege", type: "Land — Town // Instant — Adventure", mana: "{2}{R}", cmc: 0, layout: "adventure",
  oracle: "Lindblum, Industrial Regency - Land — Town \nThis land enters tapped.\n{T}: Add {R}.\n//\nMage Siege - Instant — Adventure {2}{R}\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"" });
// ── out of the lane, and the controls ──
const TWICE = fx("c-twice", { colors: ["U"], name: "Twice Upon a Time // Unlikely Meeting", type: "Sorcery // Sorcery — Adventure", mana: "{4}{U}{U} // {2}{U}", cmc: 6, layout: "adventure",
  oracle: "Twice Upon a Time - Sorcery {4}{U}{U}\nCast this spell only if you control two or more Doctors.\nTake an extra turn after this one. Exile Twice Upon a Time.\n//\nUnlikely Meeting - Sorcery — Adventure {2}{U}\nSearch your library for a Doctor card, reveal it, put it into your hand, then shuffle." });
const RIDER = fx("c-rider", { colors: ["B"], keywords: ["Lifelink"], power: "2", toughness: "3", name: "Murderous Rider // Swift End", type: "Creature — Zombie Knight // Instant — Adventure", mana: "{1}{B}{B} // {1}{B}{B}", cmc: 3, layout: "adventure",
  oracle: "Murderous Rider - Creature — Zombie Knight {1}{B}{B}\nLifelink\nWhen this creature dies, put it on the bottom of its owner's library.\n//\nSwift End - Instant — Adventure {1}{B}{B}\nDestroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)" });
const LOYALTY = fx("c-loyal", { colors: ["W"], name: "Virtue of Loyalty // Ardenvale Fealty", type: "Enchantment // Instant — Adventure", mana: "{3}{W}{W} // {1}{W}", cmc: 5, layout: "adventure",
  oracle: "Virtue of Loyalty - Enchantment {3}{W}{W}\nAt the beginning of your end step, put a +1/+1 counter on each creature you control. Untap those creatures.\n//\nArdenvale Fealty - Instant — Adventure {1}{W}\nCreate a 2/2 white Knight creature token with vigilance. (Then exile this card. You may cast the enchantment later from exile.)" });
const ISAMARU = (id) => fx(id, { colors: ["W"], power: "2", toughness: "2", name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", cmc: 1, layout: "normal", oracle: "" });
const BEARS = (id) => fx(id, { colors: ["G"], power: "2", toughness: "2", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, layout: "normal", oracle: "" });
const EXPLORATION = fx("c-explore", { colors: ["G"], name: "Exploration", type: "Enchantment", mana: "{G}", cmc: 1, layout: "normal", oracle: "You may play an additional land on each of your turns." });

const land = (sub, color) => (id, controller = "user") =>
  createPermanent({ id, card: { id: `card-${id}`, name: sub, type: `Basic Land — ${sub}`, oracle: `({T}: Add {${color}}.)` }, controller, summoningSick: false });
const plains = land("Plains", "W"), island = land("Island", "U"), mountain = land("Mountain", "R"), forest = land("Forest", "G"), swamp = land("Swamp", "B");
const lands = (make, n, prefix) => Array.from({ length: n }, (_, i) => make(`${prefix}${i + 1}`));
const lib = (n, prefix = "u") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-lib-${i}`, name: "Card", type: "Instant", oracle: "" }));
const FOREST_CARD = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" });
const untapAll = (s) => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([k, p]) => [k, { ...p, battlefield: p.battlefield.map((x) => ({ ...x, tapped: false })) }])) });
const bear = (id, controller = "user") => createPermanent({ id, card: BEARS(`c-${id}`), controller, summoningSick: false });

/** The user's precombat main on `turn`, with `hand`, `battlefield` and `library`; the AI's battlefield / library as given. */
function main({ hand = [], battlefield = [], library = lib(8), aiBattlefield = [], aiLibrary = lib(8, "a"), turn = 3 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...s.players,
      user: { ...s.players.user, hand, battlefield, library },
      ai: { ...s.players.ai, battlefield: aiBattlefield, library: aiLibrary },
    },
  };
}
const offered = (s, who = "user") => legalActionsForPlayer(s, who);
const casts = (s, who = "user") => filterActions(offered(s, who), "cast-spell");
const landPlays = (s, who = "user") => filterActions(offered(s, who), "play-land");
/** Resolve the whole stack, flushing triggers between objects (the game loop's order); stops at a pending choice. */
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** Dispatch an OFFERED action and settle — asserting first that it was offered, so a missing offer fails as an assertion. */
function play(s, action, what) {
  expect(action, `${what} is offered`).toBeTruthy();
  return settle(dispatchAction(s, action));
}
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();
const byName = (s, who, name) => s.players[who].battlefield.find((p) => p.card?.name === name);
const onAdventure = (s, id, who = "user") => s.players[who].exile.find((c) => c.id === id)?._onAdventure ?? null;
const summary = (acts) => acts.map((a) => ({ kind: a.kind, name: a.name, adventure: !!a.adventureCast, from: a.fromZone || "hand" }));
const byNameOrder = (a, b) => a.name.localeCompare(b.name);
/** The colors one permanent can make, read off the planner's own source records. */
const tapColors = (s, permId) => [...new Set(manaSources(s, "user").filter((m) => (m.permanentId ?? m.id) === permId).flatMap((m) => m.colors || []))].sort();

describe("the shape — an ARTIFACT half and a LAND (Town) half are permanent halves now; a sorcery half and an unknown subtype stay out", () => {
  it("⭐ The Arkenstone splits into its Legendary Artifact and its Adventure (the reminder stripped)", () => {
    expect(parseAdventureCard(ARKENSTONE)).toEqual({
      permanent: { name: "The Arkenstone", type: "Legendary Artifact", mana: "{5}", oracle: "Creatures you control get +1/+1.\nAt the beginning of your end step, draw a card." },
      adventure: { name: "Seek the Heart", type: "Sorcery — Adventure", mana: "{2}{W}", oracle: "Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle." },
    });
  });
  it("⭐ Jidoor splits into its Town (no mana cost) and Overture (the \"…play the land later…\" reminder stripped)", () => {
    expect(parseAdventureCard(JIDOOR)).toEqual({
      permanent: { name: "Jidoor, Aristocratic Capital", type: "Land — Town", mana: "", oracle: "This land enters tapped.\n{T}: Add {U}." },
      adventure: { name: "Overture", type: "Sorcery — Adventure", mana: "{4}{U}{U}", oracle: "Target opponent mills half their library, rounded down." },
    });
    expect(permanentFaceCard(JIDOOR)).toMatchObject({ id: "c-jidoor", name: "Jidoor, Aristocratic Capital", type: "Land — Town", mana: "" });
  });
  it("every artifact and land Adventure in the corpus is in the lane (plain, Legendary, Equipment, Book; Town)", () => {
    for (const c of [ARKENSTONE, HORN, ALTAR, GLAMDRING, PRECIOUS, LANTERN, MANUAL, AXE, JIDOOR, VALUE_TOWN, MIDGAR, ISHGARD, ZANARKAND, LINDBLUM]) {
      expect({ name: c.name, lane: isAdventureCard(c) }).toEqual({ name: c.name, lane: true });
    }
  });
  it("⛔ a SORCERY half stays out; an artifact or land subtype no Adventure prints stays out (SYNTHETIC re-types)", () => {
    const retype = (card, from, to) => ({ ...card, id: `${card.id}-x`, type: card.type.replace(from, to), oracle: card.oracle.replace(` - ${from}`, ` - ${to}`) });
    expect({
      twice: parseAdventureCard(TWICE),
      vehicle: parseAdventureCard(retype(HORN, "Artifact — Equipment", "Artifact — Vehicle")),
      forest: parseAdventureCard(retype(JIDOOR, "Land — Town", "Land — Forest")),
    }).toEqual({ twice: null, vehicle: null, forest: null });
    expect({ horn: !!parseAdventureCard(HORN), jidoor: !!parseAdventureCard(JIDOOR) }).toEqual({ horn: true, jidoor: true }); // the untouched cards: the subtype alone decides
  });
});

describe("the metric — both halves modeled flips native-mixed; an unmodeled half parks (an artifact body-only, a Town land-partial)", () => {
  const verdict = (card) => {
    const parsed = parseAdventureCard(card);
    if (!parsed) return { card: classifyCard(card), permanentNative: null, adventureNative: null }; // out of the lane → reads as such
    const { permanent, adventure } = faceViews(parsed);
    return { card: classifyCard(card), permanentNative: isNativeTier(classifyCard(permanent)), adventureNative: spellIsNative(adventure) };
  };
  it("⭐ the four flips — The Arkenstone, Horn of Valhalla, Jidoor, Value Town", () => {
    for (const c of [ARKENSTONE, HORN, JIDOOR, VALUE_TOWN]) {
      expect({ name: c.name, ...verdict(c) }).toEqual({ name: c.name, card: "native-mixed", permanentNative: true, adventureNative: true });
    }
  });
  it("⛔ the parked artifacts, with the half that holds each one", () => {
    expect(verdict(ALTAR)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });
    expect(verdict(GLAMDRING)).toEqual({ card: "body-only", permanentNative: false, adventureNative: false });
    expect(verdict(PRECIOUS)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });
    expect(verdict(LANTERN)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });
    expect(verdict(AXE)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });
    expect(verdict(MANUAL)).toEqual({ card: "body-only", permanentNative: true, adventureNative: false });
  });
  it("⛔ the parked Towns stay land-partial (the land still plays), never body-only", () => {
    for (const c of [MIDGAR, ISHGARD, ZANARKAND, LINDBLUM]) {
      expect({ name: c.name, ...verdict(c) }).toEqual({ name: c.name, card: "land-partial", permanentNative: true, adventureNative: false });
    }
  });
});

describe("RUNTIME — The Arkenstone: Seek the Heart finds only a legendary creature; the artifact casts from exile, pumps the team and draws at the end step", () => {
  function seekThenExile() {
    let s = main({ hand: [ARKENSTONE], battlefield: lands(plains, 5, "p"), library: [BEARS("c-libbear"), ISAMARU("c-isamaru"), ...lib(4)] });
    const own = casts(s).filter((a) => a.cardId === "c-ark");
    s = play(s, own.find((a) => a.adventureCast), "Seek the Heart");
    return { s, own };
  }
  it("⭐ from hand: Seek the Heart (sorcery speed) and The Arkenstone at {5} — never the combined card", () => {
    const { own } = seekThenExile();
    expect(own.map((a) => ({ name: a.name, adventure: !!a.adventureCast, generic: a.cost.generic, W: a.cost.W })).sort(byNameOrder))
      .toEqual([{ name: "Seek the Heart", adventure: true, generic: 2, W: 1 }, { name: "The Arkenstone", adventure: false, generic: 5, W: 0 }]);
    const s = main({ hand: [ARKENSTONE], battlefield: lands(plains, 5, "p") });
    expect(casts({ ...s, activePlayer: "ai", priorityHolder: "user" }).filter((a) => a.cardId === "c-ark")).toEqual([]); // both halves are sorcery-speed
  });
  it("⭐ Seek the Heart's search offers Isamaru, never the Grizzly Bears; Isamaru lands in hand and the card goes on an adventure", () => {
    let { s } = seekThenExile();
    expect({ kind: s.pendingChoice?.kind, candidates: (s.pendingChoice?.candidates || []).map((c) => c.name) }).toEqual({ kind: "tutor-search", candidates: ["Isamaru, Hound of Konda"] });
    s = settle(resolveTutorChoice(s, "c-isamaru"));
    const result = { hand: names(s.players.user.hand), libraryHasIsamaru: s.players.user.library.some((c) => c.id === "c-isamaru"), exiled: onAdventure(s, "c-ark") };
    expect(result).toEqual({ hand: ["Isamaru, Hound of Konda"], libraryHasIsamaru: false, exiled: true });
    console.log(`WITNESS arkenstoneSeek ${JSON.stringify(result)}`);
  });
  it("⭐ cast from exile at {5}, The Arkenstone enters as a Legendary Artifact (the whole card as printedCard); creatures you control get +1/+1 and the end step draws a card", () => {
    let { s } = seekThenExile();
    s = settle(resolveTutorChoice(s, "c-isamaru"));
    s = untapAll(s);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, bear("my-bear")] }, ai: { ...s.players.ai, battlefield: [bear("ai-bear", "ai")] } } };
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => ({ name: a.name, generic: a.cost.generic }))).toEqual([{ name: "The Arkenstone", generic: 5 }]);
    s = play(s, fromExile[0], "The Arkenstone from exile");
    const ark = byName(s, "user", "The Arkenstone");
    expect({ type: ark?.card.type, printed: ark?.printedCard?.name, inExile: s.players.user.exile.some((c) => c.id === "c-ark") })
      .toEqual({ type: "Legendary Artifact", printed: "The Arkenstone // Seek the Heart", inExile: false });
    const hand = s.players.user.hand.length;
    const end = settle(runStepActions(advanceStep({ ...s, phase: "postcombat-main", step: "main", stack: [], pendingTriggers: [] })));
    const result = { myBear: [permanentPower(s, "my-bear"), permanentToughness(s, "my-bear")], aiBear: [permanentPower(s, "ai-bear"), permanentToughness(s, "ai-bear")], step: end.step, drawn: end.players.user.hand.length - hand };
    expect(result).toEqual({ myBear: [3, 3], aiBear: [2, 2], step: "end", drawn: 1 });
    console.log(`WITNESS arkenstoneArtifact ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROL — the same end step without The Arkenstone: no card drawn, the Bears is 2/2", () => {
    const s = main({ battlefield: [...lands(plains, 5, "p"), bear("my-bear")] });
    const end = settle(runStepActions(advanceStep({ ...s, phase: "postcombat-main", step: "main" })));
    expect({ pt: [permanentPower(s, "my-bear"), permanentToughness(s, "my-bear")], step: end.step, drawn: end.players.user.hand.length }).toEqual({ pt: [2, 2], step: "end", drawn: 0 });
  });
});

describe("RUNTIME — Horn of Valhalla: Ysgard's Call makes X Soldiers; the Equipment casts from exile, equips, and counts your creatures", () => {
  function callForTwo() {
    let s = main({ hand: [HORN], battlefield: [...lands(plains, 5, "p"), bear("my-bear")] });
    const own = casts(s).filter((a) => a.cardId === "c-horn");
    s = play(s, own.find((a) => a.adventureCast && a.xValue === 2), "Ysgard's Call for X = 2");
    return { s, own };
  }
  it("⭐ from hand: Ysgard's Call (one offer per affordable X) and Horn of Valhalla at {1}{W}; X = 2 makes two 1/1 white Soldiers and the card goes on an adventure", () => {
    const { s, own } = callForTwo();
    expect([...new Set(own.map((a) => a.name))].sort()).toEqual(["Horn of Valhalla", "Ysgard's Call"]);
    expect(own.filter((a) => !a.adventureCast).map((a) => ({ generic: a.cost.generic, W: a.cost.W, X: !!a.cost.hasX }))).toEqual([{ generic: 1, W: 1, X: false }]);
    const soldiers = s.players.user.battlefield.filter((p) => /Soldier/.test(p.card?.type || ""));
    const result = { soldiers: soldiers.map((p) => [permanentPower(s, p.id), permanentToughness(s, p.id), p.card.colors]), exiled: onAdventure(s, "c-horn") };
    expect(result).toEqual({ soldiers: [[1, 1, ["W"]], [1, 1, ["W"]]], exiled: true });
    console.log(`WITNESS hornCall ${JSON.stringify(result)}`);
  });
  it("⭐ cast from exile at {1}{W}, the Horn enters as an Equipment; Equip {3} on the Bears makes it +3/+3 (three creatures you control)", () => {
    let { s } = callForTwo();
    s = untapAll(s);
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => a.name)).toEqual(["Horn of Valhalla"]);
    s = play(s, fromExile[0], "Horn of Valhalla from exile");
    const horn = byName(s, "user", "Horn of Valhalla");
    expect({ type: horn?.card.type, printed: horn?.printedCard?.name }).toEqual({ type: "Artifact — Equipment", printed: "Horn of Valhalla // Ysgard's Call" });
    s = untapAll(s);
    const equip = filterActions(offered(s), "activate-ability").find((a) => a.isEquipAbility && a.permanentId === horn.id && a.targets?.[0]?.id === "my-bear");
    s = play(s, equip, "Equip {3} onto the Bears");
    const result = { attachedTo: s.players.user.battlefield.find((p) => p.id === horn.id).attachedTo, bear: [permanentPower(s, "my-bear"), permanentToughness(s, "my-bear")] };
    expect(result).toEqual({ attachedTo: "my-bear", bear: [5, 5] });
    console.log(`WITNESS hornEquip ${JSON.stringify(result)}`);
  });
});

describe("RUNTIME — Jidoor: Overture mills half the opponent's library; the Town is PLAYED from adventure-exile as the turn's land", () => {
  function overture({ battlefield = lands(island, 6, "i") } = {}) {
    let s = main({ hand: [JIDOOR, FOREST_CARD("c-forest")], battlefield, aiLibrary: lib(9, "a") });
    const own = offered(s).filter((a) => a.cardId === "c-jidoor");
    s = play(s, own.find((a) => a.adventureCast), "Overture");
    return { s, own };
  }
  it("⭐ from hand: the land drop plays JIDOOR (the Town face, not the combined card) and Overture targets the opponent — nothing else", () => {
    const { own } = overture();
    expect(summary(own).sort(byNameOrder))
      .toEqual([{ kind: "play-land", name: "Jidoor, Aristocratic Capital", adventure: false, from: "hand" }, { kind: "cast-spell", name: "Overture", adventure: true, from: "hand" }]);
    expect(own.find((a) => a.adventureCast).targets.map((t) => t.id)).toEqual(["ai"]);
  });
  it("⭐ Overture: the opponent mills four of nine (half, rounded down) and the card goes on an adventure", () => {
    const { s } = overture();
    const result = { aiLibrary: s.players.ai.library.length, aiGraveyard: s.players.ai.graveyard.length, exiled: onAdventure(s, "c-jidoor") };
    expect(result).toEqual({ aiLibrary: 5, aiGraveyard: 4, exiled: true });
    console.log(`WITNESS jidoorOverture ${JSON.stringify(result)}`);
  });
  it("⭐ from exile the Town is PLAYED (a land drop, CR 715.3d / 305.2a): it enters tapped as Jidoor (the whole card as printedCard, no adventure stamp), the land play is spent, and it taps for {U}", () => {
    let { s } = overture();
    const fromExile = landPlays(s).filter((a) => a.fromZone === "exile");
    expect(summary(fromExile)).toEqual([{ kind: "play-land", name: "Jidoor, Aristocratic Capital", adventure: false, from: "exile" }]);
    expect(casts(s).filter((a) => a.cardId === "c-jidoor")).toEqual([]); // a land is never cast (CR 305.1)
    s = play(s, fromExile[0], "Jidoor from exile");
    const town = byName(s, "user", "Jidoor, Aristocratic Capital");
    const entered = { tapped: town?.tapped, type: town?.card.type, printed: town?.printedCard?.name, stamp: !!(town?.card._onAdventure || town?.printedCard?._onAdventure), inExile: s.players.user.exile.some((c) => c.id === "c-jidoor"), landsPlayed: s.players.user.landsPlayedThisTurn };
    expect(entered).toEqual({ tapped: true, type: "Land — Town", printed: "Jidoor, Aristocratic Capital // Overture", stamp: false, inExile: false, landsPlayed: 1 });
    expect(landPlays(s)).toEqual([]); // the Forest in hand: the turn's land play is gone
    const result = { ...entered, taps: tapColors(untapAll(s), town.id) };
    expect(result.taps).toEqual(["U"]);
    console.log(`WITNESS jidoorPlayedFromExile ${JSON.stringify(result)}`);
  });
  it("⛔ the exile land play respects the land drop and the timing: not after a land was played, not on the opponent's turn, not with a spell on the stack", () => {
    const { s } = overture();
    const spent = { ...s, players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 1 } } };
    const stacked = { ...s, stack: [{ id: "stk-x", kind: "spell", controller: "ai", source: { name: "Opt" }, targets: [], payload: {} }] };
    expect({
      before: landPlays(s).filter((a) => a.fromZone === "exile").length,
      spent: landPlays(spent).filter((a) => a.fromZone === "exile").length,
      theirTurn: landPlays({ ...s, activePlayer: "ai", priorityHolder: "user" }).filter((a) => a.fromZone === "exile").length,
      stack: landPlays(stacked).filter((a) => a.fromZone === "exile").length,
    }).toEqual({ before: 1, spent: 0, theirTurn: 0, stack: 0 });
  });
  it("⭐ with Exploration (two land plays) the Forest from hand AND Jidoor from exile both play", () => {
    let { s } = overture({ battlefield: [...lands(island, 6, "i"), createPermanent({ id: "explore", card: EXPLORATION, controller: "user", summoningSick: false })] });
    s = play(s, landPlays(s).find((a) => a.cardId === "c-forest"), "Forest from hand");
    s = play(s, landPlays(s).find((a) => a.fromZone === "exile"), "Jidoor from exile");
    expect({ played: s.players.user.landsPlayedThisTurn, town: !!byName(s, "user", "Jidoor, Aristocratic Capital"), more: landPlays(s) }).toEqual({ played: 2, town: true, more: [] });
  });
  it("⭐ played from hand the Town enters as its face; leaving the battlefield restores the whole card (the graveyard holds Jidoor // Overture)", () => {
    let s = main({ hand: [JIDOOR], battlefield: [] });
    s = play(s, landPlays(s)[0], "Jidoor from hand");
    const town = byName(s, "user", "Jidoor, Aristocratic Capital");
    expect({ tapped: town?.tapped, printed: town?.printedCard?.name }).toEqual({ tapped: true, printed: "Jidoor, Aristocratic Capital // Overture" });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: town.id });
    expect(s.players.user.graveyard.map((c) => ({ name: c.name, stamp: !!c._onAdventure }))).toEqual([{ name: "Jidoor, Aristocratic Capital // Overture", stamp: false }]);
  });
  it("⭐ played from EXILE then exiled again, the card carries no adventure permission — it is not playable a second time (CR 400.7)", () => {
    let { s } = overture();
    s = play(s, landPlays(s).find((a) => a.fromZone === "exile"), "Jidoor from exile");
    const town = byName(s, "user", "Jidoor, Aristocratic Capital");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: town.id });
    s = { ...s, turn: s.turn + 2, players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 0 } } };
    expect({ exiled: s.players.user.exile.map((c) => ({ name: c.name, stamp: !!c._onAdventure })), plays: landPlays(s).filter((a) => a.fromZone === "exile") })
      .toEqual({ exiled: [{ name: "Jidoor, Aristocratic Capital // Overture", stamp: false }], plays: [] });
  });
  it("VACUITY CONTROL — a Town in exile WITHOUT the adventure permission is not playable", () => {
    const plain = main({ battlefield: lands(island, 6, "i") });
    const s = { ...plain, players: { ...plain.players, user: { ...plain.players.user, exile: [{ ...JIDOOR }] } } };
    expect(landPlays(s)).toEqual([]);
  });
});

describe("RUNTIME — Value Town: Take a Trip to… draws two and deals 2 to each opponent; the Town plays from exile and taps for {U} or {R}", () => {
  it("⭐ the whole card", () => {
    let s = main({ hand: [VALUE_TOWN], battlefield: [...lands(island, 3, "i"), ...lands(mountain, 3, "m")] });
    const own = offered(s).filter((a) => a.cardId === "c-value");
    expect(summary(own).sort(byNameOrder))
      .toEqual([{ kind: "cast-spell", name: "Take a Trip to...", adventure: true, from: "hand" }, { kind: "play-land", name: "Value Town", adventure: false, from: "hand" }]);
    const life = s.players.ai.life;
    s = play(s, own.find((a) => a.adventureCast), "Take a Trip to...");
    const trip = { drawn: s.players.user.hand.length, aiDamage: life - s.players.ai.life, exiled: onAdventure(s, "c-value") };
    expect(trip).toEqual({ drawn: 2, aiDamage: 2, exiled: true });
    s = play(s, landPlays(s).find((a) => a.fromZone === "exile"), "Value Town from exile");
    const town = byName(s, "user", "Value Town");
    const result = { ...trip, tapped: town?.tapped, taps: tapColors(untapAll(s), town?.id) };
    expect(result).toEqual({ drawn: 2, aiDamage: 2, exiled: true, tapped: true, taps: ["R", "U"] });
    console.log(`WITNESS valueTown ${JSON.stringify(result)}`);
  });
});

describe("CREED — a parked half is never offered; the permanent half casts (or plays) as itself, never as the combined card", () => {
  it("⛔ Two-Handed Axe: only the artifact at {2}{R}, sorcery speed — no Sweeping Cleave, no combined card at instant speed", () => {
    const s = main({ hand: [AXE], battlefield: [...lands(mountain, 5, "m"), bear("my-bear")] });
    expect(casts(s).filter((a) => a.cardId === "c-axe").map((a) => ({ name: a.name, generic: a.cost.generic, R: a.cost.R }))).toEqual([{ name: "Two-Handed Axe", generic: 2, R: 1 }]);
    expect(casts({ ...s, activePlayer: "ai", priorityHolder: "user" }).filter((a) => a.cardId === "c-axe")).toEqual([]);
  });
  it("⛔ Monster Manual: only the artifact at {3}{G} (never the summed {5}{G}{G}); it enters as Monster Manual", () => {
    let s = main({ hand: [MANUAL], battlefield: lands(forest, 7, "f") });
    const own = casts(s).filter((a) => a.cardId === "c-manual");
    expect(own.map((a) => ({ name: a.name, generic: a.cost.generic, G: a.cost.G }))).toEqual([{ name: "Monster Manual", generic: 3, G: 1 }]);
    s = play(s, own[0], "Monster Manual from hand");
    const manual = byName(s, "user", "Monster Manual");
    expect({ type: manual?.card.type, printed: manual?.printedCard?.name }).toEqual({ type: "Artifact — Book", printed: "Monster Manual // Zoological Study" });
  });
  it("⛔ Midgar: the land drop plays Midgar (enters tapped); Reactor Raid is never offered", () => {
    let s = main({ hand: [MIDGAR], battlefield: [...lands(swamp, 3, "s"), bear("my-bear")] });
    const own = offered(s).filter((a) => a.cardId === "c-midgar");
    expect(summary(own)).toEqual([{ kind: "play-land", name: "Midgar, City of Mako", adventure: false, from: "hand" }]);
    s = play(s, own[0], "Midgar from hand");
    expect({ tapped: byName(s, "user", "Midgar, City of Mako")?.tapped }).toEqual({ tapped: true });
  });
});

describe("CONTROLS — a creature Adventure and an enchantment Adventure play exactly as before", () => {
  it("Murderous Rider: Swift End destroys the opponent's Bears (you lose 2) and exiles; the Rider casts from exile at {1}{B}{B}", () => {
    let s = main({ hand: [RIDER], battlefield: lands(swamp, 5, "s"), aiBattlefield: [bear("ai-bear", "ai")] });
    const life = s.players.user.life;
    s = play(s, casts(s).find((a) => a.adventureCast && a.targets?.[0]?.id === "ai-bear"), "Swift End at the Bears");
    expect({ aiGraveyard: names(s.players.ai.graveyard), lost: life - s.players.user.life, exiled: onAdventure(s, "c-rider") }).toEqual({ aiGraveyard: ["Grizzly Bears"], lost: 2, exiled: true });
    s = untapAll(s);
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => ({ name: a.name, generic: a.cost.generic, B: a.cost.B }))).toEqual([{ name: "Murderous Rider", generic: 1, B: 2 }]);
    s = play(s, fromExile[0], "Murderous Rider from exile");
    expect(byName(s, "user", "Murderous Rider")).toMatchObject({ card: { type: "Creature — Zombie Knight" }, summoningSick: true });
  });
  it("Virtue of Loyalty: Ardenvale Fealty makes a Knight and exiles; the Virtue casts from exile as an enchantment", () => {
    let s = main({ hand: [LOYALTY], battlefield: lands(plains, 5, "p") });
    s = play(s, casts(s).find((a) => a.adventureCast), "Ardenvale Fealty");
    expect({ knights: s.players.user.battlefield.filter((p) => /Knight/.test(p.card?.type || "")).length, exiled: onAdventure(s, "c-loyal") }).toEqual({ knights: 1, exiled: true });
    s = untapAll(s);
    s = play(s, casts(s).find((a) => a.fromZone === "exile"), "Virtue of Loyalty from exile");
    expect(byName(s, "user", "Virtue of Loyalty")).toMatchObject({ card: { type: "Enchantment" }, summoningSick: false });
  });
});
