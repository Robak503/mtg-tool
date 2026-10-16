/**
 * enchantmentAdventure.test.js — ADVENTURE (CR 715) with an ENCHANTMENT permanent half: the Wilds of Eldraine Virtues and
 * An Unexpected Party.
 *
 * The Adventure lane modeled only a CREATURE permanent half: adventure.parseAdventureCard returned null for an enchantment
 * half, so classifyAdventure never ran for these cards and the combined "Enchantment // Sorcery — Adventure" type line fell
 * to the plain instant/sorcery classifier (arbiter-spell). Nothing in CR 715 is creature-specific — the normal
 * characteristics are whatever the card prints (CR 715.2, 715.4) and the exiled card may be cast as them (CR 715.3d) — and
 * an enchantment is cast at sorcery speed (CR 303.1) and enters through the same PERMANENT_ETB face lane a creature half
 * rides (the face as the permanent, the whole card as its printedCard). The summoning-sickness stamp is keyed on the
 * entering TYPE (resolvers.enterPermanent), so an enchantment half enters unstamped (CR 302.6 names creatures only).
 *
 * FLIPS (both halves modeled): Virtue of Persistence (the any-graveyard upkeep reanimate, intent "any" since stage ③ · 39 —
 * anyGraveyardReanimate.test.js — + Locthwain Scorn's -3/-3 and life), Virtue of Loyalty (the end-step counters + untap +
 * Ardenvale Fealty's Knight), Virtue of Knowledge (the entering-permanent trigger doubler + Vantress Visions' copy of an
 * ability you control), and An Unexpected Party (the chosen-type anthem + At the Door's X Dwarves).
 * PARKED (one half unmodeled — body-only: the enchantment casts, the Adventure is never offered): Virtue of Strength (the
 * basic-land mana tripling), Virtue of Courage (the noncombat-damage impulse trigger), Promise of Aclazotz (the end-step
 * sacrifice-populate AND Foul Rebirth's "if you do" token), Porcine Portent (conjure, digital-only).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, publicCard shape, copied 2026-10-16). Every runtime witness drives the
 * real paths: legalActionsForPlayer → dispatchAction → resolveTopOfStack, and the step path (advanceStep → runStepActions →
 * flushTriggers) for the upkeep and end-step triggers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard, isNativeTier, spellIsNative } from "./coverage.js";
import { faceViews, isAdventureCard, parseAdventureCard, permanentFaceCard } from "./adventure.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const fx = (id, o) => ({ id, keywords: [], power: null, toughness: null, ...o });
const PERSISTENCE = fx("c-persist", { colors: ["B"], name: "Virtue of Persistence // Locthwain Scorn", type: "Enchantment // Sorcery — Adventure", mana: "{5}{B}{B} // {1}{B}", cmc: 7, layout: "adventure",
  oracle: "Virtue of Persistence - Enchantment {5}{B}{B}\nAt the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control.\n//\nLocthwain Scorn - Sorcery — Adventure {1}{B}\nTarget creature gets -3/-3 until end of turn. You gain 2 life." });
const LOYALTY = fx("c-loyal", { colors: ["W"], name: "Virtue of Loyalty // Ardenvale Fealty", type: "Enchantment // Instant — Adventure", mana: "{3}{W}{W} // {1}{W}", cmc: 5, layout: "adventure",
  oracle: "Virtue of Loyalty - Enchantment {3}{W}{W}\nAt the beginning of your end step, put a +1/+1 counter on each creature you control. Untap those creatures.\n//\nArdenvale Fealty - Instant — Adventure {1}{W}\nCreate a 2/2 white Knight creature token with vigilance. (Then exile this card. You may cast the enchantment later from exile.)" });
const KNOWLEDGE = fx("c-know", { colors: ["U"], name: "Virtue of Knowledge // Vantress Visions", type: "Enchantment // Instant — Adventure", mana: "{4}{U} // {1}{U}", cmc: 5, layout: "adventure",
  oracle: "Virtue of Knowledge - Enchantment {4}{U}\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\n//\nVantress Visions - Instant — Adventure {1}{U}\nCopy target activated or triggered ability you control. You may choose new targets for the copy." });
const PARTY = fx("c-party", { colors: ["W"], name: "An Unexpected Party // At the Door", type: "Enchantment // Sorcery — Adventure", mana: "{2}{W}{W} // {X}{2}{W}", cmc: 4, layout: "adventure",
  oracle: "An Unexpected Party - Enchantment {2}{W}{W}\nAs this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +2/+2.\n//\nAt the Door - Sorcery — Adventure {X}{2}{W}\nCreate X 2/2 red Dwarf creature tokens. (Then exile this card. You may cast the enchantment later from exile.)" });
const STRENGTH = fx("c-strength", { colors: ["G"], name: "Virtue of Strength // Garenbrig Growth", type: "Enchantment // Sorcery — Adventure", mana: "{5}{G}{G} // {G}", cmc: 7, layout: "adventure",
  oracle: "Virtue of Strength - Enchantment {5}{G}{G}\nIf you tap a basic land for mana, it produces three times as much of that mana instead.\n//\nGarenbrig Growth - Sorcery — Adventure {G}\nReturn target creature or land card from your graveyard to your hand. (Then exile this card. You may cast the enchantment later from exile.)" });
const COURAGE = fx("c-courage", { colors: ["R"], name: "Virtue of Courage // Embereth Blaze", type: "Enchantment // Instant — Adventure", mana: "{3}{R}{R} // {1}{R}", cmc: 5, layout: "adventure",
  oracle: "Virtue of Courage - Enchantment {3}{R}{R}\nWhenever a source you control deals noncombat damage to an opponent, you may exile that many cards from the top of your library. You may play those cards this turn.\n//\nEmbereth Blaze - Instant — Adventure {1}{R}\nEmbereth Blaze deals 2 damage to any target. (Then exile this card. You may cast the enchantment later from exile.)" });
const ACLAZOTZ = fx("c-aclazotz", { colors: ["B"], keywords: ["Populate"], name: "Promise of Aclazotz // Foul Rebirth", type: "Enchantment // Sorcery — Adventure", mana: "{1}{B} // {2}{B}", cmc: 2, layout: "adventure",
  oracle: "Promise of Aclazotz - Enchantment {1}{B}\nAt the beginning of your end step, you may sacrifice a non-Demon creature. If you do, populate. (Create a token that's a copy of a creature token you control.)\n//\nFoul Rebirth - Sorcery — Adventure {2}{B}\nSacrifice a non-Demon creature. If you do, create a 4/3 white and black Vampire Demon creature token with flying." });
const PORCINE = fx("c-porcine", { colors: ["W"], keywords: ["Conjure"], name: "Porcine Portent // Lend a Ham", type: "Enchantment // Instant — Adventure", mana: "{3}{W} // {2}{B}", cmc: 4, layout: "adventure",
  oracle: "Porcine Portent - Enchantment {3}{W}\nWhen Porcine Portent enters, conjure a card of your choice from the Three Pigs spellbook onto the battlefield.\nBoars you control get +1/+1.\n//\nLend a Ham - Instant — Adventure {2}{B}\nExile target creature. You gain 1 life for each Boar you control." });
// Guards — normal halves this lane does NOT take (artifact, land, sorcery), and the creature branch it keeps.
const LANTERN = fx("c-lantern", { colors: ["B"], keywords: ["Equip"], name: "Ghost Lantern // Bind Spirit", type: "Artifact — Equipment // Instant — Adventure", mana: "{B} // {1}{B}", cmc: 1, layout: "adventure",
  oracle: "Ghost Lantern - Artifact — Equipment {B}\nWhenever a creature you control dies, put a +1/+1 counter on equipped creature.\nEquip {1}\n//\nBind Spirit - Instant — Adventure {1}{B}\nReturn target creature card from your graveyard to your hand. (Then exile this card. You may cast the artifact later from exile.)" });
const LINDBLUM = fx("c-lindblum", { colors: [], name: "Lindblum, Industrial Regency // Mage Siege", type: "Land — Town // Instant — Adventure", mana: "{2}{R}", cmc: 0, layout: "adventure",
  oracle: "Lindblum, Industrial Regency - Land — Town \nThis land enters tapped.\n{T}: Add {R}.\n//\nMage Siege - Instant — Adventure {2}{R}\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\"" });
const TWICE = fx("c-twice", { colors: ["U"], name: "Twice Upon a Time // Unlikely Meeting", type: "Sorcery // Sorcery — Adventure", mana: "{4}{U}{U} // {2}{U}", cmc: 6, layout: "adventure",
  oracle: "Twice Upon a Time - Sorcery {4}{U}{U}\nCast this spell only if you control two or more Doctors.\nTake an extra turn after this one. Exile Twice Upon a Time.\n//\nUnlikely Meeting - Sorcery — Adventure {2}{U}\nSearch your library for a Doctor card, reveal it, put it into your hand, then shuffle." });
const OMNICLOWN = fx("c-omniclown", { colors: ["R"], keywords: ["Affinity", "Trample"], name: "Omniclown Colossus // Pie-roclasm", type: "Artifact Creature — Clown Robot // Sorcery — Adventure", mana: "{8}{R}{R} // {3}{R}{R}", cmc: 10, layout: "adventure", power: "7", toughness: "7",
  oracle: "Omniclown Colossus - Artifact Creature — Clown Robot {8}{R}{R}\nAffinity for Clowns (This spell costs {1} less to cast for each Clown you control.)\nTrample\n//\nPie-roclasm - Sorcery — Adventure {3}{R}{R}\nThis creature deals π damage to each non-Clown creature. (How to calculate π isn't important. It's a smidgen more than 3.)" });
// The creature-half contrast for the summoning-sickness stamp (the full publicCard record — its 1/1 rides the top level).
const FOULMIRE = fx("c-foul", { colors: ["B"], keywords: ["Deathtouch"], power: "1", toughness: "1", name: "Foulmire Knight // Profane Insight", type: "Creature — Zombie Knight // Instant — Adventure", mana: "{B} // {2}{B}", cmc: 1, layout: "adventure",
  oracle: "Foulmire Knight - Creature — Zombie Knight {B}\nDeathtouch\n//\nProfane Insight - Instant — Adventure {2}{B}\nYou draw a card and you lose 1 life. (Then exile this card. You may cast the creature later from exile.)" });
// Supporting cards.
const ARENA = fx("c-arena", { colors: ["B"], name: "Phyrexian Arena", type: "Enchantment", mana: "{1}{B}{B}", cmc: 3, layout: "normal", oracle: "At the beginning of your upkeep, you draw a card and lose 1 life." });
const VISIONARY = fx("c-vis", { colors: ["G"], name: "Elvish Visionary", type: "Creature — Elf Shaman", mana: "{1}{G}", cmc: 2, layout: "normal", power: "1", toughness: "1", oracle: "When this creature enters, draw a card." });
const BEARS = (id) => fx(id, { colors: ["G"], name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, layout: "normal", power: "2", toughness: "2", oracle: "" });

const land = (sub, color) => (id, controller = "user") =>
  createPermanent({ id, card: { id: `card-${id}`, name: sub, type: `Basic Land — ${sub}`, oracle: `({T}: Add {${color}}.)` }, controller, summoningSick: false });
const swamp = land("Swamp", "B"), plains = land("Plains", "W"), island = land("Island", "U"), forest = land("Forest", "G"), mountain = land("Mountain", "R");
const lands = (make, n, prefix) => Array.from({ length: n }, (_, i) => make(`${prefix}${i + 1}`));
const lib = (n, prefix = "u") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-lib-${i}`, name: "Card", type: "Instant", oracle: "" }));
const untapAll = (s) => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([k, p]) => [k, { ...p, battlefield: p.battlefield.map((x) => ({ ...x, tapped: false })) }])) });

/** The user's precombat main on `turn`, with `hand` and `battlefield`; the AI's battlefield / graveyard as given. */
function main({ hand = [], battlefield = [], aiBattlefield = [], aiGraveyard = [], turn = 3 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...s.players,
      user: { ...s.players.user, hand, battlefield, library: lib(8) },
      ai: { ...s.players.ai, battlefield: aiBattlefield, graveyard: aiGraveyard, library: lib(8, "a") },
    },
  };
}
const casts = (s, who = "user") => filterActions(legalActionsForPlayer(s, who), "cast-spell");
/** Resolve the whole stack, flushing triggers between objects (the game loop's order). */
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** Dispatch an OFFERED action and settle — asserting first that it was offered, so a missing offer fails as an assertion. */
function play(s, action, what) {
  expect(action, `${what} is offered`).toBeTruthy();
  return settle(dispatchAction(s, action));
}
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();
const byName = (s, who, name) => s.players[who].battlefield.find((p) => p.card?.name === name);

describe("the shape — an ENCHANTMENT half is a permanent half; artifact, land and sorcery halves stay out", () => {
  it("⭐ Virtue of Persistence splits into its enchantment and its Adventure (the reminder-free Locthwain Scorn kept whole)", () => {
    const p = parseAdventureCard(PERSISTENCE);
    expect(p?.permanent).toEqual({ name: "Virtue of Persistence", type: "Enchantment", mana: "{5}{B}{B}",
      oracle: "At the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control." });
    expect(p?.adventure).toEqual({ name: "Locthwain Scorn", type: "Sorcery — Adventure", mana: "{1}{B}", oracle: "Target creature gets -3/-3 until end of turn. You gain 2 life." });
    expect(permanentFaceCard(PERSISTENCE)).toMatchObject({ id: "c-persist", name: "Virtue of Persistence", type: "Enchantment", mana: "{5}{B}{B}" });
  });
  it("the enchantment-worded reminder (\"…cast the enchantment later…\") comes off the Adventure like the creature one", () => {
    expect(parseAdventureCard(LOYALTY)?.adventure?.oracle).toBe("Create a 2/2 white Knight creature token with vigilance.");
  });
  it("every enchantment Adventure in the corpus is in the lane", () => {
    for (const c of [PERSISTENCE, LOYALTY, KNOWLEDGE, PARTY, STRENGTH, COURAGE, ACLAZOTZ, PORCINE]) expect(isAdventureCard(c)).toBe(true);
  });
  it("⛔ an ARTIFACT half, a LAND half and a SORCERY half stay out (a safe false-negative); the creature branch is unchanged (an Artifact Creature still in)", () => {
    expect({ lantern: parseAdventureCard(LANTERN), lindblum: parseAdventureCard(LINDBLUM), twice: parseAdventureCard(TWICE) })
      .toEqual({ lantern: null, lindblum: null, twice: null });
    expect(parseAdventureCard(OMNICLOWN)?.permanent?.type).toBe("Artifact Creature — Clown Robot");
  });
  it("⛔ an enchantment WITH A SUBTYPE stays out — no Adventure prints one (SYNTHETIC: Persistence's text re-typed as an Aura)", () => {
    const aura = { ...PERSISTENCE, id: "c-aura", type: "Enchantment — Aura // Sorcery — Adventure",
      oracle: PERSISTENCE.oracle.replace("Virtue of Persistence - Enchantment {5}{B}{B}", "Virtue of Persistence - Enchantment — Aura {5}{B}{B}") };
    expect(parseAdventureCard(aura)).toBeNull();
    expect(parseAdventureCard(PERSISTENCE)).not.toBeNull(); // the untouched card, same text — the subtype alone decides
  });
});

describe("the metric — both halves modeled flips native-mixed; an unmodeled half parks body-only, never arbiter-spell", () => {
  const verdict = (card) => {
    const parsed = parseAdventureCard(card);
    if (!parsed) return { card: classifyCard(card), permanentNative: null, adventureNative: null }; // out of the lane → reads as such
    const { permanent, adventure } = faceViews(parsed);
    return { card: classifyCard(card), permanentNative: isNativeTier(classifyCard(permanent)), adventureNative: spellIsNative(adventure) };
  };
  it("⭐ the four flips — Persistence, Loyalty, Knowledge, An Unexpected Party", () => {
    for (const c of [PERSISTENCE, LOYALTY, KNOWLEDGE, PARTY]) {
      expect({ name: c.name, ...verdict(c) }).toEqual({ name: c.name, card: "native-mixed", permanentNative: true, adventureNative: true });
    }
  });
  it("⛔ parked, with the half that holds each one", () => {
    expect(verdict(STRENGTH)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });  // basic-land mana tripling
    expect(verdict(COURAGE)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });   // noncombat-damage impulse trigger
    expect(verdict(ACLAZOTZ)).toEqual({ card: "body-only", permanentNative: false, adventureNative: false }); // both halves
    expect(verdict(PORCINE)).toEqual({ card: "body-only", permanentNative: false, adventureNative: true });   // conjure (digital-only)
  });
});

describe("RUNTIME — Virtue of Persistence: Locthwain Scorn kills the Bears, the Virtue comes back from exile and steals them", () => {
  function scornThenExile() {
    let s = main({ hand: [PERSISTENCE], battlefield: lands(swamp, 7, "s"), aiBattlefield: [createPermanent({ id: "ai-bear", card: BEARS("c-aibear"), controller: "ai", summoningSick: false })] });
    const offered = casts(s).filter((a) => a.cardId === "c-persist");
    const scorn = offered.find((a) => a.adventureCast && a.targets?.[0]?.id === "ai-bear");
    const life = s.players.user.life;
    s = play(s, scorn, "Locthwain Scorn at the AI's Bears");
    return { s, offered, life };
  }
  it("⭐ from hand: the Adventure (sorcery speed) and the enchantment, never the combined card; Scorn resolves and exiles the card on an adventure", () => {
    const { s, offered, life } = scornThenExile();
    expect([...new Set(offered.map((a) => a.name))].sort()).toEqual(["Locthwain Scorn", "Virtue of Persistence"]);
    expect(offered.every((a) => a.faceCard && !String(a.name).includes("//"))).toBe(true);
    const result = { aiGraveyard: names(s.players.ai.graveyard), life: s.players.user.life - life, exiled: s.players.user.exile.find((c) => c.id === "c-persist")?._onAdventure ?? null };
    expect(result).toEqual({ aiGraveyard: ["Grizzly Bears"], life: 2, exiled: true });
    console.log(`WITNESS persistenceScorn ${JSON.stringify(result)}`);
  });
  it("⭐ the enchantment casts from exile at {5}{B}{B}, enters as an ENCHANTMENT (no summoning-sickness stamp, the whole card as printedCard), and its upkeep trigger reanimates the opponent's Bears under your control", () => {
    let { s } = scornThenExile();
    s = untapAll(s);
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => ({ name: a.name, generic: a.cost.generic, B: a.cost.B, free: !!a.freeCast }))).toEqual([{ name: "Virtue of Persistence", generic: 5, B: 2, free: false }]);
    s = play(s, fromExile[0], "Virtue of Persistence from exile");
    const virtue = byName(s, "user", "Virtue of Persistence");
    expect({ type: virtue.card.type, sick: virtue.summoningSick, printed: virtue.printedCard?.name, inExile: s.players.user.exile.some((c) => c.id === "c-persist") })
      .toEqual({ type: "Enchantment", sick: false, printed: "Virtue of Persistence // Locthwain Scorn", inExile: false });
    // The user's next turn: untap → upkeep, the way the game loop goes.
    s = { ...s, turn: s.turn + 2, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [] };
    s = settle(runStepActions(advanceStep(s)));
    const bears = byName(s, "user", "Grizzly Bears");
    const result = { step: s.step, userBattlefield: names(s.players.user.battlefield.filter((p) => !/Land/.test(p.card.type))), aiGraveyard: names(s.players.ai.graveyard), owner: bears?.owner ?? null };
    expect(result).toEqual({ step: "upkeep", userBattlefield: ["Grizzly Bears", "Virtue of Persistence"], aiGraveyard: [], owner: "ai" });
    console.log(`WITNESS persistenceUpkeep ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROLS — the card still in exile (not cast) reanimates nothing at the upkeep; a card in exile WITHOUT the adventure permission is not castable", () => {
    let { s } = scornThenExile();
    s = { ...untapAll(s), turn: s.turn + 2, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [] };
    const up = settle(runStepActions(advanceStep(s)));
    expect({ bf: names(up.players.user.battlefield.filter((p) => !/Land/.test(p.card.type))), aiGraveyard: names(up.players.ai.graveyard) }).toEqual({ bf: [], aiGraveyard: ["Grizzly Bears"] });
    const plain = main({ battlefield: lands(swamp, 7, "s") });
    const noPermission = { ...plain, players: { ...plain.players, user: { ...plain.players.user, exile: [{ ...PERSISTENCE }] } } };
    expect(casts(noPermission).filter((a) => a.fromZone === "exile")).toEqual([]);
  });
  it("⭐ from HAND the enchantment casts at sorcery speed only and enters as the enchantment; at instant speed neither half is offered (both are sorcery-speed)", () => {
    let s = main({ hand: [PERSISTENCE], battlefield: lands(swamp, 7, "s") });
    const own = casts(s).filter((a) => a.cardId === "c-persist" && !a.adventureCast);
    expect(own.map((a) => a.name)).toEqual(["Virtue of Persistence"]);
    expect(casts({ ...s, activePlayer: "ai", priorityHolder: "user" }).filter((a) => a.cardId === "c-persist")).toEqual([]);
    s = play(s, own[0], "Virtue of Persistence from hand");
    expect({ type: byName(s, "user", "Virtue of Persistence")?.card.type, hand: s.players.user.hand.length }).toEqual({ type: "Enchantment", hand: 0 });
  });
  it("⭐ the whole card leaves the battlefield (printedCard): destroyed, the graveyard holds Virtue of Persistence // Locthwain Scorn", () => {
    let s = main({ hand: [PERSISTENCE], battlefield: lands(swamp, 7, "s") });
    s = play(s, casts(s).find((a) => a.cardId === "c-persist" && !a.adventureCast), "Virtue of Persistence from hand");
    const virtue = byName(s, "user", "Virtue of Persistence");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: virtue.id });
    expect(s.players.user.graveyard.map((c) => ({ name: c.name, type: c.type }))).toEqual([{ name: "Virtue of Persistence // Locthwain Scorn", type: "Enchantment // Sorcery — Adventure" }]);
  });
  it("the stamp is the entering TYPE's, not the lane's: a creature half from the same lane enters summoning-sick", () => {
    let s = main({ hand: [FOULMIRE], battlefield: lands(swamp, 1, "s") });
    s = play(s, casts(s).find((a) => a.name === "Foulmire Knight"), "Foulmire Knight from hand");
    expect(byName(s, "user", "Foulmire Knight").summoningSick).toBe(true);
  });
});

describe("RUNTIME — Virtue of Loyalty: Ardenvale Fealty at instant speed, then the end-step counters and untap", () => {
  function fealtyOnTheirTurn() {
    const base = main({ hand: [LOYALTY], battlefield: lands(plains, 5, "p") });
    let s = { ...base, activePlayer: "ai", priorityHolder: "user" }; // the opponent's main phase, the user holding priority
    const offered = casts(s).filter((a) => a.cardId === "c-loyal");
    s = play(s, offered[0], "Ardenvale Fealty at instant speed");
    return { s, offered };
  }
  it("⭐ on the opponent's turn only the Instant Adventure is offered; it makes a 2/2 white vigilant Knight and exiles the card", () => {
    const { s, offered } = fealtyOnTheirTurn();
    expect(offered.map((a) => ({ name: a.name, adventure: !!a.adventureCast }))).toEqual([{ name: "Ardenvale Fealty", adventure: true }]);
    const knight = s.players.user.battlefield.find((p) => /Knight/.test(p.card?.type || ""));
    const result = { knight: knight ? [permanentPower(s, knight.id), permanentToughness(s, knight.id), knight.card.keywords, knight.card.colors] : null, exiled: s.players.user.exile.find((c) => c.id === "c-loyal")?._onAdventure ?? null };
    expect(result).toEqual({ knight: [2, 2, ["Vigilance"], ["W"]], exiled: true });
    console.log(`WITNESS loyaltyFealty ${JSON.stringify(result)}`);
  });
  function endStep(s0) {
    const s = { ...s0, phase: "postcombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [] };
    return settle(runStepActions(advanceStep(s)));
  }
  it("⭐ cast from exile on your own turn, the Virtue puts a +1/+1 counter on each creature you control at your end step and untaps them — the opponent's creature is untouched", () => {
    let { s } = fealtyOnTheirTurn();
    s = { ...untapAll(s), activePlayer: "user", priorityHolder: "user", turn: s.turn + 1 };
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [createPermanent({ id: "ai-bear", card: BEARS("c-aibear"), controller: "ai", summoningSick: false })] } } };
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => a.name)).toEqual(["Virtue of Loyalty"]);
    s = play(s, fromExile[0], "Virtue of Loyalty from exile");
    expect(byName(s, "user", "Virtue of Loyalty")).toMatchObject({ card: { type: "Enchantment" }, summoningSick: false });
    const tap = (st, id) => ({ ...st, players: Object.fromEntries(Object.entries(st.players).map(([k, p]) => [k, { ...p, battlefield: p.battlefield.map((x) => (x.id === id ? { ...x, tapped: true } : x)) }])) });
    const knightId = s.players.user.battlefield.find((p) => /Knight/.test(p.card?.type || "")).id;
    s = tap(tap(s, knightId), "ai-bear");
    const out = endStep(s);
    const knight = out.players.user.battlefield.find((p) => p.id === knightId);
    const bear = out.players.ai.battlefield.find((p) => p.id === "ai-bear");
    const result = { step: out.step, knight: { counters: knight.counters?.["+1/+1"] ?? 0, tapped: knight.tapped, pt: [permanentPower(out, knight.id), permanentToughness(out, knight.id)] }, aiBear: { counters: bear.counters?.["+1/+1"] ?? 0, tapped: bear.tapped } };
    expect(result).toEqual({ step: "end", knight: { counters: 1, tapped: false, pt: [3, 3] }, aiBear: { counters: 0, tapped: true } });
    console.log(`WITNESS loyaltyEndStep ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROL — the same end step without the Virtue on the battlefield: the Knight keeps no counter and stays tapped", () => {
    let { s } = fealtyOnTheirTurn();
    const knightId = s.players.user.battlefield.find((p) => /Knight/.test(p.card?.type || "")).id;
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((x) => (x.id === knightId ? { ...x, tapped: true } : x)) } } };
    const out = endStep(s);
    const knight = out.players.user.battlefield.find((p) => p.id === knightId);
    expect({ counters: knight.counters?.["+1/+1"] ?? 0, tapped: knight.tapped }).toEqual({ counters: 0, tapped: true });
  });
});

describe("RUNTIME — Virtue of Knowledge: Vantress Visions copies your trigger; the Virtue doubles entering triggers", () => {
  // The user's upkeep with Phyrexian Arena's trigger on the stack and Knowledge (plus 6 Islands) in hand.
  function arenaUpkeep() {
    const base = main({ hand: [KNOWLEDGE], battlefield: [createPermanent({ id: "arena", card: ARENA, controller: "user", summoningSick: false }), ...lands(island, 6, "i")] });
    const s = { ...base, phase: "beginning", step: "untap" };
    return flushTriggers(runStepActions(advanceStep(s)), { chooseTargets: chooseTriggerTargets });
  }
  it("⭐ in your upkeep, Vantress Visions targets Phyrexian Arena's trigger: two cards and two life, and the card goes on an adventure", () => {
    let s = arenaUpkeep();
    expect(s.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const visions = casts(s).filter((a) => a.cardId === "c-know");
    expect(visions.map((a) => ({ name: a.name, target: a.targets?.[0]?.id }))).toEqual([{ name: "Vantress Visions", target: s.stack[0].id }]);
    const life = s.players.user.life;
    s = play(s, visions[0], "Vantress Visions at the Arena trigger");
    const result = { hand: s.players.user.hand.length, lifeLost: life - s.players.user.life, exiled: s.players.user.exile.find((c) => c.id === "c-know")?._onAdventure ?? null };
    expect(result).toEqual({ hand: 2, lifeLost: 2, exiled: true });
    console.log(`WITNESS knowledgeVisions ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROL — the same upkeep without Vantress Visions: one card, one life", () => {
    const up = arenaUpkeep();
    const s = settle(up);
    expect({ hand: s.players.user.hand.length, lifeLost: up.players.user.life - s.players.user.life }).toEqual({ hand: 2, lifeLost: 1 }); // Knowledge kept + the one draw
  });
  function visionaryEnters(withVirtue) {
    let s = main({ hand: [KNOWLEDGE, VISIONARY], battlefield: [...lands(island, 5, "i"), ...lands(forest, 2, "f")] });
    if (withVirtue) {
      s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: s.players.user.hand.filter((c) => c.id !== "c-know"), exile: [{ ...KNOWLEDGE, _onAdventure: true }] } } };
      s = play(s, casts(s).find((a) => a.fromZone === "exile"), "Virtue of Knowledge from exile");
      expect(byName(s, "user", "Virtue of Knowledge")).toMatchObject({ card: { type: "Enchantment" }, summoningSick: false });
    }
    const before = s.players.user.hand.length;
    s = play(s, casts(s).find((a) => a.name === "Elvish Visionary"), "Elvish Visionary from hand");
    return { drawn: s.players.user.hand.length - (before - 1), visionary: !!byName(s, "user", "Elvish Visionary") };
  }
  it("⭐ cast from adventure-exile, the Virtue makes Elvish Visionary's enters trigger fire twice — two cards", () => {
    const result = visionaryEnters(true);
    expect(result).toEqual({ drawn: 2, visionary: true });
    console.log(`WITNESS knowledgeDoubles ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROL — without the Virtue the same Visionary draws one", () => {
    expect(visionaryEnters(false)).toEqual({ drawn: 1, visionary: true });
  });
});

describe("RUNTIME — An Unexpected Party: At the Door's X Dwarves, then the chosen-type anthem", () => {
  it("⭐ X = 2 makes two 2/2 red Dwarves; cast from exile the Party chooses Dwarf (the board's most common type) and they're 4/4 — the Bears is not", () => {
    let s = main({ hand: [PARTY], battlefield: [...lands(plains, 5, "p"), createPermanent({ id: "my-bear", card: BEARS("c-mybear"), controller: "user", summoningSick: false })] });
    const door = casts(s).filter((a) => a.cardId === "c-party" && a.adventureCast);
    s = play(s, door.find((a) => a.xValue === 2), "At the Door for X = 2");
    const dwarves = () => s.players.user.battlefield.filter((p) => /Dwarf/.test(p.card?.type || ""));
    expect({ count: dwarves().length, pt: dwarves().map((p) => [permanentPower(s, p.id), permanentToughness(s, p.id)]), colors: dwarves().map((p) => p.card.colors), exiled: s.players.user.exile.find((c) => c.id === "c-party")?._onAdventure ?? null })
      .toEqual({ count: 2, pt: [[2, 2], [2, 2]], colors: [["R"], ["R"]], exiled: true });
    s = untapAll(s);
    const fromExile = casts(s).filter((a) => a.fromZone === "exile");
    expect(fromExile.map((a) => a.name)).toEqual(["An Unexpected Party"]);
    s = play(s, fromExile[0], "An Unexpected Party from exile");
    const party = byName(s, "user", "An Unexpected Party");
    const bear = s.players.user.battlefield.find((p) => p.id === "my-bear");
    const result = { chosenType: party.chosenType, sick: party.summoningSick, dwarves: dwarves().map((p) => [permanentPower(s, p.id), permanentToughness(s, p.id)]), bear: [permanentPower(s, bear.id), permanentToughness(s, bear.id)] };
    expect(result).toEqual({ chosenType: "Dwarf", sick: false, dwarves: [[4, 4], [4, 4]], bear: [2, 2] });
    console.log(`WITNESS partyAnthem ${JSON.stringify(result)}`);
  });
});

describe("CREED — a parked Virtue: the enchantment still casts (the trunk posture), the Adventure is never offered", () => {
  it("⛔ Virtue of Courage with Embereth Blaze affordable and a target in play: only the enchantment is offered", () => {
    const s = main({ hand: [COURAGE], battlefield: lands(mountain, 5, "m"), aiBattlefield: [createPermanent({ id: "ai-bear", card: BEARS("c-aibear"), controller: "ai", summoningSick: false })] });
    const offered = casts(s).filter((a) => a.cardId === "c-courage");
    expect(offered.map((a) => ({ name: a.name, adventure: !!a.adventureCast }))).toEqual([{ name: "Virtue of Courage", adventure: false }]);
    expect(casts({ ...s, activePlayer: "ai", priorityHolder: "user" }).filter((a) => a.cardId === "c-courage")).toEqual([]); // not even the Instant half at instant speed
  });
  it("⛔ Virtue of Strength with Garenbrig Growth affordable and a creature card in the graveyard: only the enchantment is offered", () => {
    const s0 = main({ hand: [STRENGTH], battlefield: lands(forest, 7, "f") });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: [BEARS("c-gybear")] } } };
    expect(casts(s).filter((a) => a.cardId === "c-strength").map((a) => a.name)).toEqual(["Virtue of Strength"]);
  });
});
