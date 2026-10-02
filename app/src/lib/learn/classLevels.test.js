/**
 * CLASS CARDS (CR 716) — the class level bar, the level designation, and every Class line read only at its level.
 *
 *   716.2a  "[Cost]: Level N — [Abilities]" = "[Cost]: This Class's level becomes N. Activate only if this Class is level
 *           N-1 and only as a sorcery" + "As long as this Class is level N or greater, it has [abilities]."
 *   716.2b  A level is a designation; it is not copiable.        716.2d  No level = level 1.
 *   716.3   The top section works at all times.                    716.4   Leveler cards are a different mechanic.
 *   603.2e  "becomes" triggers fire on the event only.             603.10  Trigger conditions are checked right after the event.
 *   602.5d  "Activate only as a sorcery".                          400.7   A permanent that changes zones is a new object.
 *
 * The play-weighted targets: Caretaker's Talent (#632) and Wizard Class (#634) flip; Innkeeper's Talent (#688) stays parked
 * (its level-2 ward grant has no static, and its level-3 counter doubling is scoped by WHO puts the counters — on permanents
 * and players — which the counter-placement sites do not carry). The corpus sweep adds Ranger Class and Stormchaser's
 * Talent; the token-copy sentence Caretaker's Talent needed ("create a token that's a copy of target token you control")
 * also completes Esika's Chariot and Three Blind Mice, witnessed here on their own boards.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-01); per-test instance ids only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, modeledClassCard } from "./coverage.js";
import { parseActivatedAbilities, classLevelUpAbilities } from "./effects/abilities.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseClassFrame, classLevelView, classLevelOf, classLiveCard, hasClassLevelBar, classCardModeled, registerClassCardValidator } from "./classLevels.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { cleanupDiscardExcess, nextStep, passPriority, resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { serializeState, deserializeState } from "./serialization.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone, addCounter, gainLife } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const CARETAKERS_TALENT = {"name":"Caretaker's Talent","type":"Enchantment — Class","mana":"{2}{W}","cmc":3,"keywords":[],"layout":"class","colors":["W"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhenever one or more tokens you control enter, draw a card. This ability triggers only once each turn.\n{W}: Level 2\nWhen this Class becomes level 2, create a token that's a copy of target token you control.\n{3}{W}: Level 3\nCreature tokens you control get +2/+2."}; // native-mixed
const WIZARD_CLASS = {"name":"Wizard Class","type":"Enchantment — Class","mana":"{U}","cmc":1,"keywords":[],"layout":"class","colors":["U"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nYou have no maximum hand size.\n{2}{U}: Level 2\nWhen this Class becomes level 2, draw two cards.\n{4}{U}: Level 3\nWhenever you draw a card, put a +1/+1 counter on target creature you control."}; // native-mixed
const INNKEEPERS_TALENT = {"name":"Innkeeper's Talent","type":"Enchantment — Class","mana":"{1}{G}","cmc":2,"keywords":[],"layout":"class","colors":["G"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nAt the beginning of combat on your turn, put a +1/+1 counter on target creature you control.\n{G}: Level 2\nPermanents you control with counters on them have ward {1}.\n{3}{G}: Level 3\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead."}; // body-only
const RANGER_CLASS = {"name":"Ranger Class","type":"Enchantment — Class","mana":"{1}{G}","cmc":2,"keywords":[],"layout":"class","colors":["G"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a 2/2 green Wolf creature token.\n{1}{G}: Level 2\nWhenever you attack, put a +1/+1 counter on target attacking creature.\n{3}{G}: Level 3\nYou may look at the top card of your library any time.\nYou may cast creature spells from the top of your library."}; // native-mixed
const STORMCHASERS_TALENT = {"name":"Stormchaser's Talent","type":"Enchantment — Class","mana":"{U}","cmc":1,"keywords":[],"layout":"class","colors":["U"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a 1/1 blue and red Otter creature token with prowess.\n{3}{U}: Level 2\nWhen this Class becomes level 2, return target instant or sorcery card from your graveyard to your hand.\n{5}{U}: Level 3\nWhenever you cast an instant or sorcery spell, create a 1/1 blue and red Otter creature token with prowess."}; // native-mixed
const COOL_BUT_RUDE = {"name":"Cool but Rude","type":"Enchantment — Class","mana":"{1}{R}","cmc":2,"keywords":[],"layout":"class","colors":["R"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhenever you attack, you may discard a card. If you do, draw a card.\n{1}{R}: Level 2\nWhenever you discard a card, this Class deals 2 damage to each opponent.\n{1}{R}: Level 3\nWhen this Class becomes level 3, search your library for a card, put it into your hand, shuffle, then discard a card at random."}; // body-only
const CLERIC_CLASS = {"name":"Cleric Class","type":"Enchantment — Class","mana":"{W}","cmc":1,"keywords":[],"layout":"class","colors":["W"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nIf you would gain life, you gain that much life plus 1 instead.\n{3}{W}: Level 2\nWhenever you gain life, put a +1/+1 counter on target creature you control.\n{4}{W}: Level 3\nWhen this Class becomes level 3, return target creature card from your graveyard to the battlefield. You gain life equal to that creature's toughness."}; // body-only
const LEADERS_TALENT = {"name":"Leader's Talent","type":"Enchantment — Class","mana":"{1}{W}","cmc":2,"keywords":[],"layout":"class","colors":["W"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhenever you attack, put a +1/+1 counter on target attacking creature.\n{2}{W}: Level 2\nWhenever a creature you control leaves the battlefield, if it had a counter on it, you gain 2 life.\n{3}{W}: Level 3\nWhenever you cast a spell, put a +1/+1 counter on each creature you control."}; // body-only
const SORCERER_CLASS = {"name":"Sorcerer Class","type":"Enchantment — Class","mana":"{U}{R}","cmc":2,"keywords":[],"layout":"class","colors":["R","U"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, draw two cards, then discard two cards.\n{U}{R}: Level 2\nCreatures you control have \"{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level.\"\n{3}{U}{R}: Level 3\nWhenever you cast an instant or sorcery spell, that spell deals damage to each opponent equal to the number of instant and sorcery spells you've cast this turn."}; // body-only
const DRUID_CLASS = {"name":"Druid Class","type":"Enchantment — Class","mana":"{1}{G}","cmc":2,"keywords":["Landfall"],"layout":"class","colors":["G"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nLandfall — Whenever a land you control enters, you gain 1 life.\n{2}{G}: Level 2\nYou may play an additional land on each of your turns.\n{4}{G}: Level 3\nWhen this Class becomes level 3, target land you control becomes a creature with haste and \"This creature's power and toughness are each equal to the number of lands you control.\" It's still a land."}; // body-only
const GOURMANDS_TALENT = {"name":"Gourmand's Talent","type":"Enchantment — Class","mana":"{G}","cmc":1,"keywords":[],"layout":"class","colors":["G"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nDuring your turn, artifacts you control are Foods in addition to their other types and have \"{2}, {T}, Sacrifice this artifact: You gain 3 life.\"\n{2}{G}: Level 2\nWhenever you gain life for the first time each turn, create a 3/3 green Raccoon creature token.\n{3}{G}: Level 3\nWhenever you gain life for the first time each turn, put a +1/+1 counter on each creature you control."}; // body-only
const HUNTERS_TALENT = {"name":"Hunter's Talent","type":"Enchantment — Class","mana":"{1}{G}","cmc":2,"keywords":[],"layout":"class","colors":["G"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, target creature you control deals damage equal to its power to target creature you don't control.\n{1}{G}: Level 2\nWhenever you attack, target attacking creature gets +1/+0 and gains trample until end of turn.\n{3}{G}: Level 3\nAt the beginning of your end step, if you control a creature with power 4 or greater, draw a card."}; // body-only
const ESIKAS_CHARIOT = {"name":"Esika's Chariot","type":"Legendary Artifact — Vehicle","mana":"{3}{G}","cmc":4,"power":"4","toughness":"4","keywords":["Crew"],"colors":["G"],"oracle":"When Esika's Chariot enters, create two 2/2 green Cat creature tokens.\nWhenever Esika's Chariot attacks, create a token that's a copy of target token you control.\nCrew 4"}; // native-trigger
const THREE_BLIND_MICE = {"name":"Three Blind Mice","type":"Enchantment — Saga","mana":"{2}{W}","cmc":3,"keywords":[],"layout":"saga","colors":["W"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Create a 1/1 white Mouse creature token.\nII, III — Create a token that's a copy of target token you control.\nIV — Creatures you control get +1/+1 and gain vigilance until end of turn."}; // native-trigger
const SPECIMEN_COLLECTOR = {"name":"Specimen Collector","type":"Creature — Vedalken Wizard","mana":"{4}{U}","cmc":5,"power":"2","toughness":"1","keywords":[],"colors":["U"],"oracle":"When this creature enters, create a 1/1 green Squirrel creature token and a 0/3 blue Crab creature token.\nWhen this creature dies, create a token that's a copy of target token you control."}; // body-only
const HAZEL = {"name":"Hazel of the Rootbloom","type":"Legendary Creature — Squirrel Druid","mana":"{2}{B}{G}","cmc":4,"power":"3","toughness":"5","keywords":[],"colors":["B","G"],"oracle":"{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.\nAt the beginning of your end step, create a token that's a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it."}; // body-only
const DUTIFUL_REPLICATOR = {"name":"Dutiful Replicator","type":"Artifact Creature — Assembly-Worker","mana":"{3}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"oracle":"When this creature enters, you may pay {1}. When you do, create a token that's a copy of target token you control not named Dutiful Replicator."}; // body-only
const ROOTCAST_APPRENTICESHIP = {"name":"Rootcast Apprenticeship","type":"Sorcery","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"Choose three. You may choose the same mode more than once.\n• Put two +1/+1 counters on target creature.\n• Create a token that's a copy of target token you control.\n• Target player creates a 1/1 green Squirrel creature token.\n• Target opponent sacrifices a nontoken artifact of their choice."}; // arbiter-spell
const DISPLACER_KITTEN = {"name":"Displacer Kitten","type":"Creature — Cat Beast","mana":"{3}{U}","cmc":4,"power":"2","toughness":"2","keywords":["Avoidance"],"colors":["U"],"oracle":"Avoidance — Whenever you cast a noncreature spell, exile up to one target nonland permanent you control, then return that card to the battlefield under its owner's control."}; // native-trigger
const BOOMERANG = {"name":"Boomerang","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Return target permanent to its owner's hand."}; // native-spell
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."}; // native-spell
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell
const RAISE_THE_ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 white Soldier creature tokens."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const STUDENT_OF_WARFARE = {"name":"Student of Warfare","type":"Creature — Human Knight","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["First strike","Level Up","Double strike"],"layout":"leveler","colors":["W"],"oracle":"Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-6\n3/3\nFirst strike\nLEVEL 7+\n4/4\nDouble strike"}; // native-mixed
const PETER_PARKERS_CAMERA = {"name":"Peter Parker's Camera","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"This artifact enters with three film counters on it.\n{2}, {T}, Remove a film counter from this artifact: Copy target activated or triggered ability you control. You may choose new targets for the copy."}; // native-activated
const JAYEMDAE_TOME = {"name":"Jayemdae Tome","type":"Artifact — Book","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"{4}, {T}: Draw a card."}; // native-activated
const QUASIDUPLICATE = {"name":"Quasiduplicate","type":"Sorcery","mana":"{1}{U}{U}","cmc":3,"keywords":["Jump","Jump-start"],"colors":["U"],"oracle":"Create a token that's a copy of target creature you control.\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)"}; // native-spell
const MASK_TOKEN = {"name":"Mask","type":"Token Enchantment — Aura","mana":"","cmc":0,"keywords":["Umbra armor","Enchant"],"layout":"token","colors":["W"],"oracle":"Enchant permanent\nTotem armor (If enchanted permanent would be destroyed, instead remove all damage from it and destroy this Aura.)"}; // body-only
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const onBf = (card, id, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lands = (card, n, prefix) => Array.from({ length: n }, (_, i) => onBf(card, `${prefix}${i}`));
const library = (prefix, n, base = ISLAND) => Array.from({ length: n }, (_, i) => ({ ...base, id: `${prefix}${i}` }));

/** The user's precombat main phase, holding priority, an empty stack. */
function mainPhase({ hand = [], battlefield = [], graveyard = [], userLibrary = library("u-lib-", 10), aiBattlefield = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand, graveyard, exile: [], library: userLibrary, battlefield },
      ai: { ...s0.players.ai, hand: [], graveyard: [], exile: [], library: library("a-lib-", 12), battlefield: aiBattlefield },
    },
  };
}
const permNamed = (s, name, controller = "user") => s.players[controller].battlefield.find((p) => p.card.name === name);
const levelUpOffers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId
  && (a.program?.atoms || []).some((x) => x.op === "class-level-become"));
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const untapAll = (s) => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => ({ ...x, tapped: false })) }])) });
/** Pass priority around the table until the stack is empty (each lap resolves the top object). A resolver that threw is
 *  caught and logged by resolveTopOfStack, so every drain also asserts no resolution errored. */
function drainStack(s) {
  let next = s;
  for (let guard = 0; next.stack.length && guard < 40; guard++) next = next.pendingChoice ? next : passPriority(next);
  expect((next.log || []).filter((e) => e.kind === "stack-resolve-error")).toEqual([]);
  return next;
}
/** Cast a card from the user's hand and let it (and everything it triggers) resolve. */
function castAndResolve(s, cardId) {
  const a = castOf(s, cardId);
  expect(a, `cast ${cardId}`).toBeDefined();
  return drainStack(dispatchAction(s, a));
}
/** Gain the next class level through the real offer: exactly one bar is ever live. */
function gainLevel(s, permId) {
  const offers = levelUpOffers(s, permId);
  expect(offers).toHaveLength(1);
  return drainStack(dispatchAction(s, offers[0]));
}
/** Step the turn forward (draining the stack between steps) until `step` is entered. */
function advanceTo(s, step, phase = null) {
  let next = drainStack(s);
  for (let guard = 0; guard < 80; guard++) {
    next = nextStep({ ...next, priorityHolder: null, consecutivePasses: 0 });
    if (next.step === step && (!phase || next.phase === phase)) return next;
    next = drainStack(next);
  }
  throw new Error(`never reached the ${step} step`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("classification — the targets, the corpus sweep, and the parked family", () => {
  it("⭐ the flips: Caretaker's Talent and Wizard Class (targets), Ranger Class and Stormchaser's Talent (sweep)", () => {
    const row = Object.fromEntries([CARETAKERS_TALENT, WIZARD_CLASS, RANGER_CLASS, STORMCHASERS_TALENT].map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual({ "Caretaker's Talent": "native-mixed", "Wizard Class": "native-mixed", "Ranger Class": "native-mixed", "Stormchaser's Talent": "native-mixed" });
  });

  it("the parked Classes stay body-only — each for a clause the engine does not honour at its level", () => {
    const row = Object.fromEntries([INNKEEPERS_TALENT, COOL_BUT_RUDE, CLERIC_CLASS, LEADERS_TALENT, SORCERER_CLASS, DRUID_CLASS,
      GOURMANDS_TALENT, HUNTERS_TALENT].map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual({
      "Innkeeper's Talent": "body-only", // L2 ward grant to permanents with counters (no static); L3 doubling scoped by who PUTS the counters
      "Cool but Rude": "body-only",      // L3 "search … then discard a card at random" does not parse
      "Cleric Class": "body-only",       // top: a life-gain replacement the doubler reader never applies off a Class
      "Leader's Talent": "body-only",    // L2 "if it had a counter on it" leave trigger does not route
      "Sorcerer Class": "body-only",     // L2 a spend-restricted granted mana ability; L3 "that spell deals damage" does not route
      "Druid Class": "body-only",        // L3 a becomes-level land animation with a quoted P/T ability (its L2 land drop is read off the raw card too)
      "Gourmand's Talent": "body-only",  // top only: the "During your turn … are Foods … and have" grant — both level sections are modeled
      "Hunter's Talent": "body-only",    // top only: the two-target "deals damage equal to its power" ETB — both level sections are modeled
    });
  });

  it("the token-copy sentence completes two non-Class cards (Esika's Chariot, Three Blind Mice); its riders still park the rest", () => {
    expect(classifyCard(ESIKAS_CHARIOT)).toBe("native-trigger");
    expect(classifyCard(THREE_BLIND_MICE)).toBe("native-trigger");
    // Hazel ("If that token is a Squirrel, instead create two"), Dutiful Replicator ("not named …", a reflexive payment),
    // Specimen Collector and the choose-three sorcery keep their tiers.
    expect([HAZEL, DUTIFUL_REPLICATOR, SPECIMEN_COLLECTOR].map(classifyCard)).toEqual(["body-only", "body-only", "body-only"]);
    expect(classifyCard(ROOTCAST_APPRENTICESHIP)).toBe("arbiter-spell");
  });

  it("a leveler is not a Class and a Class is not a leveler (CR 716.4)", () => {
    expect(classifyCard(STUDENT_OF_WARFARE)).toBe("native-mixed");
    expect(parseClassFrame(STUDENT_OF_WARFARE)).toBeNull();
    expect(classLevelUpAbilities(STUDENT_OF_WARFARE)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the class frame and the level view (classLevels.js)", () => {
  it("Wizard Class parses into its top section and two bars, in order", () => {
    expect(parseClassFrame(WIZARD_CLASS)).toEqual({
      top: ["You have no maximum hand size."],
      bars: [
        { level: 2, costPips: "{2}{U}", lines: ["When this Class becomes level 2, draw two cards."] },
        { level: 3, costPips: "{4}{U}", lines: ["Whenever you draw a card, put a +1/+1 counter on target creature you control."] },
      ],
    });
  });

  it("the view at level N carries the top section plus every section up to N, and no bar line", () => {
    expect(classLevelView(WIZARD_CLASS, 1).oracle).toBe("You have no maximum hand size.");
    expect(classLevelView(WIZARD_CLASS, 2).oracle).toBe("You have no maximum hand size.\nWhen this Class becomes level 2, draw two cards.");
    expect(classLevelView(WIZARD_CLASS, 3).oracle).toBe("You have no maximum hand size.\nWhen this Class becomes level 2, draw two cards.\nWhenever you draw a card, put a +1/+1 counter on target creature you control.");
    expect(classLevelView(WIZARD_CLASS, 3)).toBe(classLevelView(WIZARD_CLASS, 3)); // memoized: parse caches stay warm
    expect(classLevelView(GRIZZLY_BEARS, 3)).toBe(GRIZZLY_BEARS);                   // a non-Class card is its own view
  });

  it("CR 716.2d — a permanent with no level is level 1; the level lives on the PERMANENT, never the card", () => {
    expect(classLevelOf({})).toBe(1);
    expect(classLevelOf({ classLevel: 3 })).toBe(3);
    const raw = createPermanent({ id: "w", card: WIZARD_CLASS, controller: "user" });
    expect(raw.classLevel).toBeUndefined();
    expect(classLiveCard({ ...raw, classLevel: 2 }).oracle).toBe(classLevelView(WIZARD_CLASS, 2).oracle);
  });

  it("a PARKED Class's live card is its raw card — its readers keep the top-only default (Innkeeper's Talent)", () => {
    const perm = { ...createPermanent({ id: "i", card: INNKEEPERS_TALENT, controller: "user" }), classLevel: 3 };
    expect(modeledClassCard(INNKEEPERS_TALENT)).toBe(false);
    expect(classLiveCard(perm)).toBe(INNKEEPERS_TALENT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the parse — the level bar's activated ability, the becomes-level trigger, and the top-only default", () => {
  it("each bar parses as CR 716.2a's ability: its mana cost, sorcery timing, and the level it sets", () => {
    const ups = classLevelUpAbilities(WIZARD_CLASS);
    expect(ups.map((a) => ({ manaPips: a.manaPips, sorceryOnly: a.sorceryOnly, classLevelUp: a.classLevelUp, modeled: a.modeled, atoms: a.program.atoms }))).toEqual([
      { manaPips: "{2}{U}", sorceryOnly: true, classLevelUp: 2, modeled: true, atoms: [{ op: "class-level-become", level: 2, targetType: null }] },
      { manaPips: "{4}{U}", sorceryOnly: true, classLevelUp: 3, modeled: true, atoms: [{ op: "class-level-become", level: 3, targetType: null }] },
    ]);
    expect(programConfidence(parseEffectClause("This Class's level becomes 2.", "Instant"))).toBe("high");
  });

  it("a modeled Class's activated abilities are its two level bars; a parked Class emits none (the leveler park)", () => {
    expect(parseActivatedAbilities(WIZARD_CLASS).map((a) => a.classLevelUp)).toEqual([2, 3]);
    expect(parseActivatedAbilities(INNKEEPERS_TALENT)).toEqual([]);
    expect(parseActivatedAbilities(LEADERS_TALENT)).toEqual([]);
  });

  it("'When this Class becomes level N' is its own self trigger, on a Class only", () => {
    const view = classLevelView(WIZARD_CLASS, 2);
    const t = detectTriggers(view).find((d) => d.event === "classLevelBecomes");
    expect({ scope: t.scope, classLevel: t.classLevel, effectClause: t.effectClause }).toEqual({ scope: "self", classLevel: 2, effectClause: "draw two cards" });
    expect(triggerRoutesNatively(t)).toBe(true);
    // SYNTHETIC (no printed non-Class card carries the sentence): the same line on a plain enchantment detects nothing,
    // because only a Class's level-up resolution can ever fire it.
    expect(detectTriggers({ name: "Synthetic", type: "Enchantment", oracle: "When this Class becomes level 2, draw two cards." })).toEqual([]);
  });

  it("⭐ the raw card reads its TOP section only — the level-2/3 triggers no longer fire from level 1", () => {
    // Leader's Talent at HEAD detected all three of its triggers off the raw card; Wizard Class its level-3 draw trigger.
    expect(detectTriggers(LEADERS_TALENT).map((d) => d.event)).toEqual(["youAttack"]);
    expect(detectTriggers(WIZARD_CLASS)).toEqual([]);
    expect(detectTriggers(CARETAKERS_TALENT).map((d) => d.event)).toEqual(["permanentEnters"]);
    // The statics stay as HEAD had them for a raw Class (none) — a raw Class card still never parses a level section's buff.
    expect(parseStaticAbilities(CARETAKERS_TALENT)).toEqual([]);
    // The level view is where the anthem lives, and only from level 3.
    expect(parseStaticAbilities(classLevelView(CARETAKERS_TALENT, 2))).toEqual([]);
    expect(parseStaticAbilities(classLevelView(CARETAKERS_TALENT, 3))).toEqual([{ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], token: true } }, duration: { kind: "permanent" } }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME Wizard Class — cast, level 2 at sorcery speed, the becomes-level draw, the level-3 trigger", () => {
  const wizardBoard = (extra = {}) => mainPhase({
    hand: [{ ...WIZARD_CLASS, id: "c-wiz" }, { ...DIVINATION, id: "c-div" }],
    battlefield: [...lands(ISLAND, 14, "isl"), onBf(GRIZZLY_BEARS, "bears")],
    ...extra,
  });

  it("cast: it enters at level 1 with only the top section working, and only the Level 2 bar is offered (never 1 → 3)", () => {
    const s = castAndResolve(wizardBoard(), "c-wiz");
    const wiz = permNamed(s, "Wizard Class");
    expect(classLevelOf(wiz)).toBe(1);
    expect(levelUpOffers(s, wiz.id).map((a) => a.program.atoms[0].level)).toEqual([2]);
    // Fourteen Islands pay for the Level 3 bar too; it is still not offered at level 1.
    expect(legalActionsForPlayer(s, "user").some((a) => a.program?.atoms?.[0]?.op === "class-level-become" && a.program.atoms[0].level === 3)).toBe(false);
  });

  it("CR 602.5d — the level-up is offered only as a sorcery: never with a non-empty stack, an opponent's turn, or combat", () => {
    const s = castAndResolve(wizardBoard(), "c-wiz");
    const id = permNamed(s, "Wizard Class").id;
    expect(levelUpOffers(s, id)).toHaveLength(1);
    expect(levelUpOffers({ ...s, stack: [{ id: "x", kind: "spell", controller: "ai", resolver: "SPELL_NOOP", params: {} }] }, id)).toHaveLength(0);
    expect(levelUpOffers({ ...s, activePlayer: "ai" }, id)).toHaveLength(0);
    expect(levelUpOffers({ ...s, phase: "combat", step: "declare-attackers" }, id)).toHaveLength(0);
  });

  it("the level-up uses the stack; the level becomes 2 on resolution and the becomes-level-2 trigger draws two, once", () => {
    let s = castAndResolve(wizardBoard(), "c-wiz");
    const id = permNamed(s, "Wizard Class").id;
    s = dispatchAction(s, levelUpOffers(s, id)[0]);
    expect(s.stack).toHaveLength(1);                         // CR 602.2 — on the stack, not yet resolved
    expect(classLevelOf(permNamed(s, "Wizard Class"))).toBe(1);
    expect(levelUpOffers(s, id)).toHaveLength(0);            // the stack is not empty: no second activation
    const handBefore = s.players.user.hand.length;
    s = resolveTopOfStack(s);
    expect(permNamed(s, "Wizard Class").classLevel).toBe(2);
    expect(s.stack.map((o) => o.kind)).toEqual(["triggered-ability"]); // the becomes-level-2 trigger, above nothing
    s = drainStack(s);
    expect(s.players.user.hand.length).toBe(handBefore + 2);
    // Level 3: the becomes-level-2 trigger does not fire again (CR 603.2e) — the hand is unchanged by the level-up itself.
    s = untapAll(s);
    const before3 = s.players.user.hand.length;
    s = gainLevel(s, id);
    expect(permNamed(s, "Wizard Class").classLevel).toBe(3);
    expect(s.players.user.hand.length).toBe(before3);
    expect(levelUpOffers(untapAll(s), id)).toHaveLength(0); // no bar beyond the last
  });

  it("the level-3 draw trigger is OFF at level 2 and ON at level 3 (one +1/+1 counter per card drawn)", () => {
    let s = castAndResolve(wizardBoard(), "c-wiz");
    const id = permNamed(s, "Wizard Class").id;
    s = untapAll(gainLevel(s, id));
    const atTwo = castAndResolve(s, "c-div");
    expect(permNamed(atTwo, "Grizzly Bears").counters).toEqual({});
    s = untapAll(gainLevel(s, id));
    const atThree = castAndResolve(s, "c-div");
    expect(permNamed(atThree, "Grizzly Bears").counters).toEqual({ "+1/+1": 2 });
  });

  it("the top section: no maximum hand size at every level (CR 716.3)", () => {
    const wiz = onBf(WIZARD_CLASS, "wiz");
    const s = mainPhase({ hand: library("h-", 11), battlefield: [wiz] });
    expect(cleanupDiscardExcess(s, "user")).toBe(0);
    expect(cleanupDiscardExcess(mainPhase({ hand: library("h-", 11) }), "user")).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME Caretaker's Talent — the token draw, the becomes-level copy, the level-3 anthem", () => {
  const caretakerBoard = () => mainPhase({
    hand: [{ ...CARETAKERS_TALENT, id: "c-care" }, { ...RAISE_THE_ALARM, id: "c-alarm" }],
    battlefield: [...lands(PLAINS, 12, "pl"), onBf(GRIZZLY_BEARS, "bears")],
  });

  it("the top trigger: two tokens entering at once draw ONE card, and only once each turn", () => {
    let s = castAndResolve(caretakerBoard(), "c-care");
    const hand0 = s.players.user.hand.length;
    s = castAndResolve(s, "c-alarm");
    expect(s.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(2);
    expect(s.players.user.hand.length).toBe(hand0 - 1 + 1); // Raise the Alarm left the hand; ONE draw came back for two tokens
    // Once each turn: two more tokens this turn draw nothing.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [...s.players.user.hand, { ...RAISE_THE_ALARM, id: "c-alarm2" }] } } };
    const hand1 = s.players.user.hand.length;
    s = castAndResolve(untapAll(s), "c-alarm2");
    expect(s.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(4);
    expect(s.players.user.hand.length).toBe(hand1 - 1);
  });

  it("level 2: the becomes-level trigger copies a token YOU control; level 3: creature tokens get +2/+2, and only then", () => {
    let s = castAndResolve(caretakerBoard(), "c-care");
    s = castAndResolve(untapAll(s), "c-alarm");
    const id = permNamed(s, "Caretaker's Talent").id;
    const tokens = (st) => st.players.user.battlefield.filter((p) => p.card.token);
    expect(tokens(s)).toHaveLength(2);
    // An opponent's token is never the copy's target (the pool is your own tokens only).
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [{ ...onBf({ ...GRIZZLY_BEARS, name: "Opposing Token", token: true }, "ai-tok", "ai") }] } } };
    s = untapAll(gainLevel(untapAll(s), id));
    expect(permNamed(s, "Caretaker's Talent").classLevel).toBe(2);
    expect(tokens(s)).toHaveLength(3);
    expect(s.players.ai.battlefield).toHaveLength(1);
    const soldier = tokens(s)[0];
    expect([permanentPower(s, soldier.id), permanentToughness(s, soldier.id)]).toEqual([1, 1]); // the anthem is OFF at level 2
    s = gainLevel(s, id);
    expect(permNamed(s, "Caretaker's Talent").classLevel).toBe(3);
    expect(tokens(s).map((t) => [permanentPower(s, t.id), permanentToughness(s, t.id)])).toEqual([[3, 3], [3, 3], [3, 3]]);
    expect(permanentPower(s, "bears")).toBe(2);              // a nontoken creature is not a creature token
    expect(permanentPower(s, "ai-tok")).toBe(2);             // an opponent's token is not yours
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME Ranger Class — the Wolf, the level-2 attack counter, the level-3 cast-from-top permission", () => {
  it("the attack trigger is OFF at level 1 and ON at level 2", () => {
    const board = (lvl) => {
      const ranger = { ...onBf(RANGER_CLASS, "ranger"), ...(lvl > 1 ? { classLevel: lvl } : {}) };
      return mainPhase({ battlefield: [ranger, onBf(GRIZZLY_BEARS, "bears")] });
    };
    const attackWithBears = (s0) => {
      let s = advanceTo(s0, "declare-attackers");
      const atk = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "bears");
      s = dispatchAction(s, atk);
      s = advanceTo(s, "declare-blockers");
      return drainStack(s);
    };
    expect(permNamed(attackWithBears(board(1)), "Grizzly Bears").counters).toEqual({});
    expect(permNamed(attackWithBears(board(2)), "Grizzly Bears").counters).toEqual({ "+1/+1": 1 });
  });

  it("cast it: the Wolf arrives; level 2 then level 3 through the bars; creature spells from the top only at level 3", () => {
    let s = mainPhase({ hand: [{ ...RANGER_CLASS, id: "c-ranger" }], battlefield: lands(FOREST, 12, "f"),
      userLibrary: [{ ...GRIZZLY_BEARS, id: "top-bears" }, ...library("u-lib-", 6)] });
    s = castAndResolve(s, "c-ranger");
    expect(permNamed(s, "Wolf Token") || s.players.user.battlefield.find((p) => p.card.token)).toBeDefined();
    const id = permNamed(s, "Ranger Class").id;
    const castsTop = (st) => legalActionsForPlayer(st, "user").some((a) => a.kind === "cast-spell" && a.cardId === "top-bears");
    expect(castsTop(untapAll(s))).toBe(false);
    s = untapAll(gainLevel(untapAll(s), id));
    expect(castsTop(s)).toBe(false);                       // level 2 — the permission is printed under the level-3 bar
    s = untapAll(gainLevel(s, id));
    expect(permNamed(s, "Ranger Class").classLevel).toBe(3);
    expect(castsTop(s)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME Stormchaser's Talent — the Otter, the becomes-level regrowth, the level-3 cast trigger", () => {
  it("level 2 returns an instant from your graveyard; the cast trigger makes an Otter only at level 3", () => {
    let s = mainPhase({ hand: [{ ...STORMCHASERS_TALENT, id: "c-storm" }], battlefield: lands(ISLAND, 14, "i"),
      graveyard: [{ ...OPT, id: "gy-opt" }] });
    s = castAndResolve(s, "c-storm");
    const otters = (st) => st.players.user.battlefield.filter((p) => p.card.token).length;
    expect(otters(s)).toBe(1);
    const id = permNamed(s, "Stormchaser's Talent").id;
    s = untapAll(gainLevel(untapAll(s), id));
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["gy-opt"]);
    expect(s.players.user.graveyard).toHaveLength(0);
    // Level 2: casting Opt makes no Otter (the cast trigger is printed under the level-3 bar).
    const opted = (st) => { const a = castOf(st, "gy-opt"); return drainStack(dispatchAction(st, a)); };
    const atTwo = opted(s);
    expect(otters(atTwo)).toBe(1);
    s = untapAll(gainLevel(s, id));
    const atThree = opted(s);
    expect(otters(atThree)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 400.7 / 716.2b — a Class that leaves and returns, or a copy of one, is a new object at level 1", () => {
  it("bounced (Boomerang) and recast, Wizard Class is level 1 again — its level-3 trigger off, the Level 2 bar live again", () => {
    let s = mainPhase({ hand: [{ ...WIZARD_CLASS, id: "c-wiz" }, { ...BOOMERANG, id: "c-boom" }, { ...DIVINATION, id: "c-div" }],
      battlefield: [...lands(ISLAND, 20, "isl"), onBf(GRIZZLY_BEARS, "bears")] });
    s = castAndResolve(s, "c-wiz");
    const first = permNamed(s, "Wizard Class").id;
    s = untapAll(gainLevel(s, first));
    s = untapAll(gainLevel(s, first));
    expect(permNamed(s, "Wizard Class").classLevel).toBe(3);
    const boom = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-boom" && a.targets?.[0]?.id === first);
    s = untapAll(drainStack(dispatchAction(s, boom)));
    expect(permNamed(s, "Wizard Class")).toBeUndefined();
    s = untapAll(castAndResolve(s, "c-wiz"));
    const again = permNamed(s, "Wizard Class");
    expect(again.id).not.toBe(first);
    expect(classLevelOf(again)).toBe(1);
    expect(levelUpOffers(s, again.id).map((a) => a.program.atoms[0].level)).toEqual([2]);
    expect(permNamed(castAndResolve(s, "c-div"), "Grizzly Bears").counters).toEqual({});
  });

  it("blinked (Displacer Kitten's Avoidance trigger), Stormchaser's Talent returns at level 1 — its level-3 trigger off again", () => {
    let s = mainPhase({ hand: [{ ...STORMCHASERS_TALENT, id: "c-storm" }, { ...DIVINATION, id: "c-div" }, { ...DIVINATION, id: "c-div2" }],
      battlefield: [...lands(ISLAND, 24, "isl")], graveyard: [{ ...OPT, id: "gy-opt" }] });
    s = castAndResolve(s, "c-storm");
    const first = permNamed(s, "Stormchaser's Talent").id;
    s = untapAll(gainLevel(s, first));
    s = untapAll(gainLevel(s, first));
    expect(permNamed(s, "Stormchaser's Talent").classLevel).toBe(3);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, onBf(DISPLACER_KITTEN, "kitten")] } } };
    const otters = (st) => st.players.user.battlefield.filter((p) => p.card.token).length;
    const before = otters(s);
    // Divination: the level-3 cast trigger makes an Otter, and Avoidance blinks the Class (the flicker pick takes the
    // permanent with an enters ability — the Class's own Otter-making top section).
    s = untapAll(castAndResolve(s, "c-div"));
    const back = permNamed(s, "Stormchaser's Talent");
    expect(back.id).not.toBe(first);
    expect(classLevelOf(back)).toBe(1);
    expect(otters(s)).toBe(before + 2);                    // the level-3 cast Otter + the re-entered Class's ETB Otter
    // Level 1 again: the next instant-or-sorcery cast makes no Otter (the blink still re-enters it, making the ETB one).
    const s2 = castAndResolve({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "kitten") } } }, "c-div2");
    expect(otters(s2)).toBe(otters(s));
  });

  it("the level-up of a Class that left before it resolved does nothing — the returned card is a new object", () => {
    let s = mainPhase({ hand: [{ ...WIZARD_CLASS, id: "c-wiz" }], battlefield: lands(ISLAND, 10, "isl") });
    s = castAndResolve(s, "c-wiz");
    const id = permNamed(s, "Wizard Class").id;
    s = dispatchAction(s, levelUpOffers(s, id)[0]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: id }); // a response bounced it
    const handSize = s.players.user.hand.length;
    s = drainStack(s);
    expect(s.players.user.hand.length).toBe(handSize);  // no becomes-level-2 draw
    s = untapAll(castAndResolve(untapAll(s), "c-wiz"));
    expect(classLevelOf(permNamed(s, "Wizard Class"))).toBe(1);
  });

  it("a token copy of a level-3 Class starts at level 1 (the level is not a copiable value)", () => {
    // The copy lane reads the permanent's printed card (snapshotCopiedCard); the level stays on the original.
    const original = { ...onBf(CARETAKERS_TALENT, "care"), classLevel: 3 };
    let s = mainPhase({ battlefield: [original, ...lands(PLAINS, 4, "pl")] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield,
      { ...createPermanent({ id: "care-copy", card: { ...original.card, id: "tok-care", token: true }, controller: "user", summoningSick: false }) }] } } };
    const copy = s.players.user.battlefield.find((p) => p.id === "care-copy");
    expect(classLevelOf(copy)).toBe(1);
    expect(levelUpOffers(s, "care-copy").map((a) => a.program.atoms[0].level)).toEqual([2]);
    expect(levelUpOffers(s, "care")).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the live false positives this closes — a parked Class's level sections no longer act at level 1", () => {
  it("Leader's Talent (parked): a spell cast puts no counters (its level-3 trigger); its top attack trigger still works", () => {
    let s = mainPhase({ hand: [{ ...OPT, id: "c-opt" }], battlefield: [onBf(LEADERS_TALENT, "leader"), onBf(GRIZZLY_BEARS, "bears"), ...lands(ISLAND, 2, "i")] });
    s = dispatchAction(s, castOf(s, "c-opt"));
    expect(s.pendingTriggers || []).toHaveLength(0);
    expect(s.stack).toHaveLength(1);
    expect(levelUpOffers(mainPhase({ battlefield: [onBf(LEADERS_TALENT, "leader"), ...lands(PLAINS, 6, "p")] }), "leader")).toHaveLength(0);
  });

  it("Cleric Class (parked): gaining life puts no counter (its level-2 trigger)", () => {
    let s = mainPhase({ battlefield: [onBf(CLERIC_CLASS, "cleric"), onBf(GRIZZLY_BEARS, "bears")] });
    s = gainLife(s, { playerId: "user", amount: 3 });
    expect(s.pendingTriggers || []).toHaveLength(0);
  });

  it("Innkeeper's Talent (parked): no level-up, no doubling, no ward — only its top combat trigger", () => {
    let s = mainPhase({ battlefield: [{ ...onBf(INNKEEPERS_TALENT, "inn"), classLevel: 3 }, onBf(GRIZZLY_BEARS, "bears"), ...lands(FOREST, 6, "f")] });
    expect(levelUpOffers(s, "inn")).toHaveLength(0);
    s = addCounter(s, { permanentId: "bears", type: "+1/+1", amount: 1 });
    expect(permNamed(s, "Grizzly Bears").counters).toEqual({ "+1/+1": 1 }); // never doubled, whatever level is stamped on it
    expect(permanentHasKeyword(s, "bears", "Ward")).toBe(false);
    s = drainStack(advanceTo(s, "beginning-of-combat"));
    expect(permNamed(s, "Grizzly Bears").counters).toEqual({ "+1/+1": 2 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SYNTHETIC WITNESSES — each card below is Wizard Class's real text with ONE real line moved, swapped or replaced
// (every replacement line is printed on the named real card). No printed Class has these shapes; each pins a guard
// whose only job is to keep a shape the runtime cannot honour off the native tier (a false positive), so no real card
// can exercise it.
const wizardLines = WIZARD_CLASS.oracle.split("\n"); // [reminder, top, bar2, L2 line, bar3, L3 line]
const synth = (lines, extra = {}) => ({ ...WIZARD_CLASS, ...extra, oracle: lines.join("\n") });

describe("SYNTHETIC — the guards that keep a Class shape the runtime can't honour off the native tier", () => {
  it("a card that is not a Class carries no frame: no level-up, its text below the bar never read", () => {
    const notClass = synth(wizardLines, { type: "Enchantment" });
    expect(parseClassFrame(notClass)).toBeNull();
    expect(classifyCard(notClass)).toBe("body-only");
    expect(parseActivatedAbilities(notClass)).toEqual([]);
  });

  it("bars out of order are not a frame; the text from the first bar down stays unread at every level", () => {
    const swapped = synth([wizardLines[0], wizardLines[1], wizardLines[4], wizardLines[5], wizardLines[2], wizardLines[3]]);
    expect(parseClassFrame(swapped)).toBeNull();
    expect(classifyCard(swapped)).toBe("body-only");
    expect(classLevelView(swapped, 3).oracle).toBe(`${wizardLines[0]}\n${wizardLines[1]}`);
    expect(detectTriggers(swapped)).toEqual([]);
  });

  it("a bar with no ability under it (a truncated text box) is not a frame", () => {
    expect(parseClassFrame(synth(wizardLines.slice(0, 5)))).toBeNull();
    expect(classifyCard(synth(wizardLines.slice(0, 5)))).toBe("body-only");
  });

  it("a level section's static that only a raw-card reader applies parks the card (Druid Class's extra land drop)", () => {
    const druidL2 = DRUID_CLASS.oracle.split("\n")[3];
    expect(druidL2).toBe("You may play an additional land on each of your turns.");
    expect(classifyCard(synth([...wizardLines.slice(0, 3), druidL2, ...wizardLines.slice(4)]))).toBe("body-only");
  });

  it("an activated ability of the Class's own parks the card — the activated lane reads only the bars", () => {
    // Jayemdae Tome's line in the top section (where any other descriptor-less line would be read at every level), and
    // under the level-3 bar.
    expect(classifyCard(synth([wizardLines[0], JAYEMDAE_TOME.oracle, ...wizardLines.slice(2)]))).toBe("body-only");
    expect(classifyCard(synth([...wizardLines.slice(0, 5), JAYEMDAE_TOME.oracle]))).toBe("body-only");
  });

  it("a line with no descriptor (read off the printed card at every level) is admitted only in the top section", () => {
    const moved = synth([wizardLines[0], wizardLines[2], wizardLines[1], wizardLines[3], wizardLines[4], wizardLines[5]]);
    expect(parseClassFrame(moved).bars[0].lines).toEqual(["You have no maximum hand size.", "When this Class becomes level 2, draw two cards."]);
    expect(classifyCard(moved)).toBe("body-only");
  });

  it("a bar the activated lane cannot offer ({X}) parks the card — it could never gain the level", () => {
    const xBar = synth([wizardLines[0], wizardLines[1], wizardLines[2].replace("{2}{U}", "{X}"), ...wizardLines.slice(3)]);
    expect(classLevelUpAbilities(xBar)[0].modeled).toBe(false);
    expect(classifyCard(xBar)).toBe("body-only");
    expect(levelUpOffers(mainPhase({ battlefield: [onBf(xBar, "x"), ...lands(ISLAND, 8, "i")] }), "x")).toHaveLength(0);
  });

  it("the token-copy target pool: an Aura token (Mask) or a Saga token is never the target; a creature-copy stays ambiguous", () => {
    // Caretaker's Talent levelling to 2 with only a Mask token, then only a token Saga: no legal target, no copy.
    for (const only of [{ ...MASK_TOKEN, token: true }, { ...THREE_BLIND_MICE, token: true }]) {
      let s = mainPhase({ battlefield: [onBf(CARETAKERS_TALENT, "care"), onBf(only, "tok"), ...lands(PLAINS, 3, "p")] });
      s = gainLevel(s, "care");
      expect(permNamed(s, "Caretaker's Talent").classLevel).toBe(2);
      expect(s.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(1);
    }
    // The intent is own ONLY for a token copy of yours: Quasiduplicate's creature copy keeps the ambiguous intent (its
    // spell is targeted at cast), and a token copy without the you-control restriction would be ambiguous too.
    const quasi = parseEffectClause(QUASIDUPLICATE.oracle.split("\n")[0], "Sorcery");
    expect(atomTargetIntent(quasi.atoms[0])).toBe("ambiguous");
    expect(atomTargetIntent({ op: "create-token-copy", targetType: "permanent", restrictions: [{ kind: "token" }] })).toBe("ambiguous");
  });
});

describe("input contract of the leaf (classLevels.js)", () => {
  it("non-objects are not Classes; a permanent with no card reads no card; the view carries one text field", () => {
    expect(hasClassLevelBar(undefined)).toBe(false);
    expect(hasClassLevelBar("{2}{U}: Level 2")).toBe(false);
    expect(classLiveCard({})).toBeUndefined();
    expect(classLevelView({ ...WIZARD_CLASS, oracle_text: WIZARD_CLASS.oracle }, 1).oracle_text).toBeUndefined();
  });

  it("with no whole-card gate registered (a module order without coverage.js) every Class reads as parked", () => {
    const perm = { card: WIZARD_CLASS, classLevel: 3 };
    try {
      registerClassCardValidator(null);
      expect(classCardModeled(WIZARD_CLASS)).toBe(false);
      expect(classLiveCard(perm)).toBe(WIZARD_CLASS);
    } finally {
      registerClassCardValidator(modeledClassCard);
    }
    expect(classLiveCard(perm)).toBe(classLevelView(WIZARD_CLASS, 3));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 603.2e — a COPY of the level-up resolving after the level is reached changes nothing (Peter Parker's Camera)", () => {
  it("the copy resolves first (level 2, the trigger draws two); the original then finds level 2 and fires nothing", () => {
    const camera = { ...onBf(PETER_PARKERS_CAMERA, "cam"), counters: { film: 3 } };
    let s = mainPhase({ battlefield: [onBf(WIZARD_CLASS, "wiz"), camera, ...lands(ISLAND, 10, "i")] });
    const hand0 = s.players.user.hand.length;
    s = dispatchAction(s, levelUpOffers(s, "wiz")[0]);
    const levelUpId = s.stack[0].id;
    const copyIt = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cam" && a.targets?.[0]?.id === levelUpId);
    expect(copyIt).toBeDefined();
    s = resolveTopOfStack(dispatchAction(s, copyIt));       // the Camera's ability → a copy of the level-up on the stack
    expect(s.stack).toHaveLength(2);
    s = drainStack(s);
    expect(permNamed(s, "Wizard Class").classLevel).toBe(2);
    expect(s.players.user.hand.length).toBe(hand0 + 2);   // one becomes-level-2 trigger, not two
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the AI seat and persistence", () => {
  it("the default policy gains a class level with leftover mana; policy ability:'v1' never activates", () => {
    const s = mainPhase({ battlefield: [onBf(WIZARD_CLASS, "wiz"), ...lands(ISLAND, 3, "i")] });
    const actions = legalActionsForPlayer(s, "user");
    const pick = pickAction(s, "user", actions);
    expect(pick?.kind).toBe("activate-ability");
    expect(pick.program.atoms).toEqual([{ op: "class-level-become", level: 2, targetType: null }]);
    expect(pickAction(s, "user", actions, { policy: { ability: "v1" } })?.kind).not.toBe("activate-ability");
  });

  it("the level round-trips a save/load, and the reloaded Class reads its level-3 view", () => {
    const s = mainPhase({ battlefield: [{ ...onBf(CARETAKERS_TALENT, "care"), classLevel: 3 }] });
    const back = deserializeState(serializeState(s));
    const care = back.players.user.battlefield.find((p) => p.id === "care");
    expect(care.classLevel).toBe(3);
    expect(parseStaticAbilities(classLiveCard(care))).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the token-copy sentence's other carriers — Esika's Chariot and Three Blind Mice, end to end", () => {
  it("Esika's Chariot: two Cats on entry; crewed and attacking, it copies a token YOU control", () => {
    let s = mainPhase({ hand: [{ ...ESIKAS_CHARIOT, id: "c-chariot" }], battlefield: lands(FOREST, 4, "f") });
    s = castAndResolve(s, "c-chariot");
    const cats = (st) => st.players.user.battlefield.filter((p) => p.card.token);
    expect(cats(s)).toHaveLength(2);
    expect(cats(s).every((p) => /\bCat\b/.test(p.card.type) && permanentPower(s, p.id) === 2)).toBe(true);
    // Two turns on (the user's next main): nothing is summoning sick, and the Cats crew the Chariot (2 + 2 for crew 4).
    s = { ...s, turn: s.turn + 2, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, summoningSick: false })) },
      ai: { ...s.players.ai, battlefield: [onBf({ ...GRIZZLY_BEARS, name: "Opposing Token", token: true }, "ai-tok", "ai")] } } };
    const crew = legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle");
    expect(crew).toBeDefined();
    s = drainStack(dispatchAction(s, crew));
    s = advanceTo(s, "declare-attackers");
    const chariotId = permNamed(s, "Esika's Chariot").id;
    const atk = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === chariotId);
    expect(atk).toBeDefined();
    s = dispatchAction(s, atk);
    s = drainStack(advanceTo(s, "declare-blockers"));
    expect(cats(s)).toHaveLength(3);
    expect(s.players.ai.battlefield).toHaveLength(1);
  });

  it("Three Blind Mice: I makes a Mouse, II and III copy a token you control, IV pumps — then the Saga is sacrificed", () => {
    let s = mainPhase({ hand: [{ ...THREE_BLIND_MICE, id: "c-mice" }], battlefield: lands(PLAINS, 3, "p") });
    s = castAndResolve(s, "c-mice");
    const mice = (st) => st.players.user.battlefield.filter((p) => p.card.token);
    expect(mice(s)).toHaveLength(1);
    s = drainStack(advanceTo(s, "draw", "beginning"));
    while (s.activePlayer !== "user") s = drainStack(advanceTo(s, "draw", "beginning"));
    expect(mice(s)).toHaveLength(2);
    do { s = drainStack(advanceTo(s, "draw", "beginning")); } while (s.activePlayer !== "user");
    expect(mice(s)).toHaveLength(3);
    do { s = drainStack(advanceTo(s, "draw", "beginning")); } while (s.activePlayer !== "user");
    expect(mice(s).map((m) => [permanentPower(s, m.id), permanentHasKeyword(s, m.id, "Vigilance")])).toEqual([[2, true], [2, true], [2, true]]);
    expect(permNamed(s, "Three Blind Mice")).toBeUndefined();
  });
});
