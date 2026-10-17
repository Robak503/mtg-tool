/**
 * OZOLITH, THE SHATTERED SPIRE — the play-weighted program (EDHREC #640).
 *   "If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are
 *    put on it instead.
 *    {1}{G}, {T}: Put a +1/+1 counter on target artifact or creature you control. Activate only as a sorcery.
 *    Cycling {2}"
 *
 * The replacement (Winding Constrictor's recipient union, CR 614.1) and cycling (CR 702.29a) were modeled; the card parked on the
 * activated ability. The ability now reads: the counter atom over the own-side artifact-or-creature pool (Teleportation Circle's
 * enumeration — an opponent's permanent is never a legal target, CR 115.1), offered only at sorcery timing (CR 602.5d, 307.1: own
 * main phase, empty stack), the counter put through gameState.addCounter so every replacement applies (CR 122.6, 616.1).
 *
 * What the lane exposed, fixed with it:
 *   · A counter replacement acts only on the permanents its sentence names. The creature-only ones (Hardened Scales, Branching
 *     Evolution, Primal Vigor, The Earth Crystal …) added counters to ANY permanent their controller controlled, so Ozolith's
 *     counter on a Sol Ring would have taken Hardened Scales' extra one. The recipient list is read off the sentence now
 *     (creature · artifact or creature · creature or Vehicle · creature or planeswalker · creature, Spacecraft, or Planet;
 *     "permanent" stays universal) and checked against the permanent's types as they are now.
 *   · A permanent ENTERING with counters is a counter put on it (CR 122.6), judged as it would exist on the battlefield (CR 614.12).
 *     The entry sites passed no recipient, so a typed replacement (Winding Constrictor, and Ozolith's own first line) skipped every
 *     creature entering with counters. The entering object's types now ride along (layers.enteringTypeWords).
 *   · A "+1/+1 counters on a creature you control" watcher (Stocking the Pantry, Terrasymbiosis) counted the counter on a
 *     noncreature artifact as a creature's: the artifact-or-creature pool tags every pick "creature". It reads the permanent now.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier at generation).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { applyXCastTokenTriggers } from "./xCastToken.js";
import { _resetIdsForTests, addCounter, createGameState, createPermanent, findPermanent, planeswalkerEntryLoyalty } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const OZOLITH = {"name":"Ozolith, the Shattered Spire","type":"Legendary Artifact","mana":"{1}{G}","cmc":2,"keywords":["Cycling"],"colors":["G"],"oracle":"If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead.\n{1}{G}, {T}: Put a +1/+1 counter on target artifact or creature you control. Activate only as a sorcery.\nCycling {2} ({2}, Discard this card: Draw a card.)"}; // body-only before this slice
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SCALES = {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."}; // native-static
const PANTRY = {"name":"Stocking the Pantry","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Whenever you put one or more +1/+1 counters on a creature you control, put a supply counter on this enchantment.\n{2}, Remove a supply counter from this enchantment: Draw a card."}; // native-mixed
const SPIKE_COLONY = {"name":"Spike Colony","type":"Creature — Spike","mana":"{4}{G}","cmc":5,"power":"0","toughness":"0","keywords":[],"colors":["G"],"oracle":"This creature enters with four +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature."}; // native-activated
const ARCBOUND_WORKER = {"name":"Arcbound Worker","type":"Artifact Creature — Construct","mana":"{1}","cmc":1,"power":"0","toughness":"0","keywords":["Modular"],"colors":[],"oracle":"Modular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)"}; // native-body
const CONSTRICTOR = {"name":"Winding Constrictor","type":"Creature — Snake","mana":"{B}{G}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["B","G"],"oracle":"If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.\nIf you would get one or more counters, you get that many plus one of each of those kinds of counters instead."}; // native-static
const LOADING_ZONE = {"name":"Loading Zone","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":["Warp"],"colors":["G"],"oracle":"If one or more counters would be put on a creature, Spacecraft, or Planet you control, twice that many of each of those kinds of counters are put on it instead.\nWarp {G} (You may cast this card from your hand for its warp cost. Exile this enchantment at the beginning of the next end step, then you may cast it from exile on a later turn.)"}; // native-static
const LAEZEL = {"name":"Lae'zel, Vlaakith's Champion","type":"Legendary Creature — Gith Warrior","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":["Choose a background"],"colors":["W"],"oracle":"If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters on that permanent or player instead.\nChoose a Background (You can have a Background as a second commander.)"}; // native-static
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const COPTER = {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","cmc":2,"power":"3","toughness":"3","keywords":["Flying","Crew"],"colors":[],"oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // native-trigger
const CARADORA = {"name":"Caradora, Heart of Alacria","type":"Legendary Creature — Human Knight","mana":"{2}{G}{W}","cmc":4,"power":"4","toughness":"2","keywords":[],"colors":["G","W"],"oracle":"When Caradora enters, you may search your library for a Mount or Vehicle card, reveal it, put it into your hand, then shuffle.\nIf one or more +1/+1 counters would be put on a creature or Vehicle you control, that many plus one +1/+1 counters are put on it instead."}; // body-only (its search line)
const ZAXARA = {"name":"Zaxara, the Exemplary","type":"Legendary Creature — Nightmare Hydra","mana":"{1}{B}{G}{U}","cmc":4,"power":"2","toughness":"3","keywords":["Deathtouch"],"colors":["B","G","U"],"oracle":"Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it."}; // native-mixed

const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const ozBoard = () => [P("oz", OZOLITH), P("f1", FOREST), P("f2", FOREST)];

/** The user's precombat main phase, empty stack, priority with the user (each field overridable). */
function mainPhase(user, ai = [], { hand = [], pool = {}, active = "user", phase = "precombat-main", step = "main", stack = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, turn: 5, activePlayer: active, priorityHolder: "user", phase, step, stack, pendingTriggers: [], consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai },
    },
  };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
}
const ozActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "oz");
const ozTargets = (s) => ozActions(s).map((a) => a.targets?.[0]?.id).sort();
const activateOn = (s, targetId) => {
  const act = ozActions(s).find((a) => a.targets?.[0]?.id === targetId);
  if (!act) throw new Error(`no Ozolith activation offered on ${targetId}`);
  return settle(dispatchAction(s, act));
};
const plus = (s, id) => findPermanent(s, id)?.permanent.counters?.["+1/+1"] || 0;
const counterOf = (s, id, kind) => findPermanent(s, id)?.permanent.counters?.[kind] || 0;

describe("the card — every line", () => {
  it("⭐ the activated ability parses to the +1/+1 counter atom over the own-side artifact-or-creature pool, sorcery-timed; the card classifies native", () => {
    const [ab] = parseActivatedAbilities(OZOLITH);
    const row = { modeled: ab.modeled, sorceryOnly: ab.sorceryOnly, tapSelf: ab.tapSelf, manaPips: ab.manaPips, needsTarget: ab.needsTarget,
      atoms: ab.program?.atoms, tier: classifyCard(OZOLITH) };
    console.log("  WITNESS ozolithParse", JSON.stringify(row));
    expect(row).toEqual({ modeled: true, sorceryOnly: true, tapSelf: true, manaPips: "{1}{G}", needsTarget: true,
      atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "artifactOrCreatureYouControl" }], tier: "native-mixed" });
  });

  it("CREED near-misses stay parked: an oil counter on the same target (The Monumental Facade's line) and the -1/-1 wording do not read", () => {
    const facade = { name: "The Monumental Facade", type: "Land", oracle: "This land enters with two oil counters on it.\n{T}: Add {C}.\n{T}, Remove an oil counter from this land: Put an oil counter on target artifact or creature you control. Activate only as a sorcery." };
    expect(parseActivatedAbilities(facade).find((a) => /oil counter on target/.test(a.raw))?.modeled).toBe(false);
    const minus = { name: "Test Minus", type: "Artifact", oracle: "{T}: Put a -1/-1 counter on target artifact or creature you control." }; // synthetic guard
    expect(parseActivatedAbilities(minus)[0].modeled).toBe(false);
  });
});

describe("the activation — target pool, timing, the counter path", () => {
  it("⭐ offered on the user's creature, the user's artifacts (Ozolith itself included), never on the opponent's creature or artifact; never on a land", () => {
    const s = mainPhase([...ozBoard(), P("bears", BEARS), P("sol", SOL_RING)], [P("obears", BEARS, "ai"), P("osol", SOL_RING, "ai")]);
    expect(ozTargets(s)).toEqual(["bears", "oz", "sol"]);
  });

  it("⭐ on a creature you control: the Forests pay {1}{G}, Ozolith taps, and the counter takes Ozolith's own replacement (1 + 1 = 2)", () => {
    const s1 = activateOn(mainPhase([...ozBoard(), P("bears", BEARS)]), "bears");
    const row = { bears: plus(s1, "bears"), ozTapped: findPermanent(s1, "oz").permanent.tapped, forests: ["f1", "f2"].map((id) => findPermanent(s1, id).permanent.tapped),
      again: ozActions(s1).length };
    console.log("  WITNESS ozolithCreature", JSON.stringify(row));
    expect(row).toEqual({ bears: 2, ozTapped: true, forests: [true, true], again: 0 });
  });

  it("⭐ on an artifact you control: Sol Ring and Ozolith itself each get 2", () => {
    expect(plus(activateOn(mainPhase([...ozBoard(), P("sol", SOL_RING)]), "sol"), "sol")).toBe(2);
    expect(plus(activateOn(mainPhase(ozBoard()), "oz"), "oz")).toBe(2);
  });

  it("⭐ refused at instant speed (CR 602.5d): a spell on the stack, the opponent's turn, the combat phase; no mana, no offer", () => {
    const board = () => [...ozBoard(), P("bears", BEARS)];
    const onStack = [{ id: "stk-x", kind: "spell", controller: "ai", source: { name: "Opt" }, card: { id: "opt", name: "Opt", type: "Instant" }, payload: { resolver: "SPELL_NOOP", params: {} } }];
    const row = {
      sorcery: ozTargets(mainPhase(board())).length,
      stack: ozTargets(mainPhase(board(), [], { stack: onStack })).length,
      oppTurn: ozTargets(mainPhase(board(), [], { active: "ai" })).length,
      combat: ozTargets(mainPhase(board(), [], { phase: "combat", step: "beginning-of-combat" })).length,
      noMana: ozTargets(mainPhase([P("oz", OZOLITH), P("f1", FOREST), P("bears", BEARS)])).length,
    };
    expect(row).toEqual({ sorcery: 2, stack: 0, oppTurn: 0, combat: 0, noMana: 0 });
  });

  it("a target that changed control before resolution is illegal (CR 608.2b): the counter is not put", () => {
    const s0 = mainPhase([...ozBoard(), P("bears", BEARS)]);
    const act = ozActions(s0).find((a) => a.targets?.[0]?.id === "bears");
    expect(act?.targets?.[0]?.id).toBe("bears");
    let s1 = dispatchAction(s0, act);
    const bears = findPermanent(s1, "bears").permanent;
    s1 = { ...s1, players: { ...s1.players,
      user: { ...s1.players.user, battlefield: s1.players.user.battlefield.filter((p) => p.id !== "bears") },
      ai: { ...s1.players.ai, battlefield: [...s1.players.ai.battlefield, { ...bears, controller: "ai" }] } } };
    expect(plus(settle(s1), "bears")).toBe(0);
  });
});

describe("the other replacements on the same counter (CR 616.1)", () => {
  it("⭐ Hardened Scales adds to a creature (1 + 1 + 1 = 3) and NOT to a noncreature artifact (Sol Ring: 2)", () => {
    const board = () => [...ozBoard(), P("scales", SCALES), P("bears", BEARS), P("sol", SOL_RING)];
    const row = { bears: plus(activateOn(mainPhase(board()), "bears"), "bears"), sol: plus(activateOn(mainPhase(board()), "sol"), "sol") };
    console.log("  WITNESS ozolithScales", JSON.stringify(row));
    expect(row).toEqual({ bears: 3, sol: 2 });
  });

  it("⭐ Stocking the Pantry: the counter on a creature you control feeds it a supply counter; the counter on Sol Ring does not", () => {
    const board = () => [...ozBoard(), P("pantry", PANTRY), P("bears", BEARS), P("sol", SOL_RING)];
    const row = { bears: counterOf(activateOn(mainPhase(board()), "bears"), "pantry", "supply"), sol: counterOf(activateOn(mainPhase(board()), "sol"), "pantry", "supply") };
    console.log("  WITNESS ozolithPantry", JSON.stringify(row));
    expect(row).toEqual({ bears: 1, sol: 0 });
  });
});

describe("Ozolith's first line on a permanent ENTERING with counters (CR 122.6, 614.12)", () => {
  const castFromHand = (s, cardId) => {
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
    if (!act) throw new Error(`no cast offered for ${cardId}`);
    return settle(dispatchAction(s, act));
  };
  const entered = (s, name) => s.players.user.battlefield.find((p) => p.card?.name === name);
  const spikeHand = () => ({ hand: [{ id: "h-spike", ...SPIKE_COLONY }], pool: { G: 5 } });

  it("⭐ Spike Colony enters with 4 + 1 = 5; Arcbound Worker (an artifact creature, modular) with 1 + 1 = 2", () => {
    const spike = castFromHand(mainPhase([P("oz", OZOLITH)], [], spikeHand()), "h-spike");
    const worker = castFromHand(mainPhase([P("oz", OZOLITH)], [], { hand: [{ id: "h-worker", ...ARCBOUND_WORKER }], pool: { C: 1 } }), "h-worker");
    const row = { spike: entered(spike, "Spike Colony")?.counters?.["+1/+1"], worker: entered(worker, "Arcbound Worker")?.counters?.["+1/+1"] };
    console.log("  WITNESS ozolithEntering", JSON.stringify(row));
    expect(row).toEqual({ spike: 5, worker: 2 });
  });

  it("Hardened Scales still adds to a creature entering with counters (Spike Colony: 5); Winding Constrictor now does too (5)", () => {
    const withScales = castFromHand(mainPhase([P("scales", SCALES)], [], spikeHand()), "h-spike");
    const withConstrictor = castFromHand(mainPhase([P("snake", CONSTRICTOR)], [], spikeHand()), "h-spike");
    const plain = castFromHand(mainPhase([], [], spikeHand()), "h-spike");
    expect({ scales: entered(withScales, "Spike Colony")?.counters?.["+1/+1"], constrictor: entered(withConstrictor, "Spike Colony")?.counters?.["+1/+1"],
      plain: entered(plain, "Spike Colony")?.counters?.["+1/+1"] }).toEqual({ scales: 5, constrictor: 5, plain: 4 });
  });

  it("Zaxara's X-cast Hydra token (X = 2) gets 3 with Ozolith out; amass Zombies 1 makes a 2-counter Army", () => {
    const zax = applyXCastTokenTriggers(mainPhase([P("oz", OZOLITH), P("zax", ZAXARA)]), { spellCard: { name: "Hydroid Krasis", mana: "{X}{G}{U}" }, casterId: "user", xValue: 2 });
    const army = resolveAtom(mainPhase([P("oz", OZOLITH)]), { op: "amass", subtype: "Zombie", amount: 1, targetType: null }, { controller: "user" });
    const row = { hydra: zax.players.user.battlefield.find((p) => /Hydra/.test(p.card?.name || ""))?.counters?.["+1/+1"],
      army: army.players.user.battlefield.find((p) => /Army/.test(p.card?.name || ""))?.counters?.["+1/+1"] };
    expect(row).toEqual({ hydra: 3, army: 2 });
  });
});

describe("the recipient list of the other counter replacements", () => {
  it("Loading Zone (\"a creature, Spacecraft, or Planet you control\") doubles a creature's counters, not a Sol Ring's or an uncrewed Vehicle's", () => {
    let s = mainPhase([P("zone", LOADING_ZONE), P("bears", BEARS), P("sol", SOL_RING), P("copter", COPTER)]);
    s = addCounter(s, { permanentId: "bears", type: "+1/+1", amount: 1 });
    s = addCounter(s, { permanentId: "sol", type: "charge", amount: 1 });
    s = addCounter(s, { permanentId: "copter", type: "+1/+1", amount: 1 });
    expect({ bears: plus(s, "bears"), sol: counterOf(s, "sol", "charge"), copter: plus(s, "copter") }).toEqual({ bears: 2, sol: 1, copter: 1 });
  });

  it("Caradora (\"a creature or Vehicle you control\") reads the Vehicle SUBTYPE: an uncrewed Vehicle gets the extra counter, a Sol Ring does not", () => {
    let s = mainPhase([P("cara", CARADORA), P("copter", COPTER), P("sol", SOL_RING)]);
    s = addCounter(s, { permanentId: "copter", type: "+1/+1", amount: 1 });
    s = addCounter(s, { permanentId: "sol", type: "+1/+1", amount: 1 });
    expect({ copter: plus(s, "copter"), sol: plus(s, "sol") }).toEqual({ copter: 2, sol: 1 });
  });

  it("Lae'zel (\"a creature or planeswalker you control\"): a planeswalker entering gets one more loyalty (3 + 1); a Sol Ring's charge counter does not", () => {
    const s = mainPhase([P("laezel", LAEZEL), P("sol", SOL_RING)]);
    const charged = addCounter(s, { permanentId: "sol", type: "charge", amount: 1 });
    expect({ jace: planeswalkerEntryLoyalty(s, "user", JACE), jaceAlone: planeswalkerEntryLoyalty(mainPhase([]), "user", JACE), sol: counterOf(charged, "sol", "charge") })
      .toEqual({ jace: 4, jaceAlone: 3, sol: 1 });
  });
});
