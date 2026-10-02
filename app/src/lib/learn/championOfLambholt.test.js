/**
 * championOfLambholt.test.js — Champion of Lambholt (the play-weighted program, EDHREC #576).
 *   "Creatures with power less than this creature's power can't block creatures you control.
 *    Whenever another creature you control enters, put a +1/+1 counter on this creature."
 *
 * The second line was already modeled (an otherCreatureYouControl enters trigger whose effect parses to a self
 * add-counter atom); the first was the residue that parked the card. It is a BLOCK RESTRICTION (CR 509.1b) carried by a
 * static on a battlefield permanent: every creature the Champion's controller controls (the Champion included) can't be
 * blocked by a creature whose power is less than the Champion's — both powers read live (CR 613; CR 611.3a — the effect
 * isn't locked in). It is the team sibling of the self gate selfPowerBlockGate.test.js pins (Wandering Wolf), enforced in
 * combatEvasion.canBlockAttacker, the one chokepoint behind the declare-blockers offer (legalChoices) and the AI's
 * attack model (opponentAI.eligibleBlockersFor); the AI block chooser only ranks what that offer contains.
 *
 * CREED: the forbidden direction is an ILLEGAL BLOCK offered. Every witness below goes through the real entry points —
 * legalActionsForPlayer for the defending seat, real casts through dispatchAction, the real enters trigger, the real
 * Shifting Woodland activation for the layer-1 copy — and the boundary (EQUAL power blocks) is pinned beside each bar.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { canBlockAttacker, isEnforcedEvasionClause, selfPowerBlockGateOf, teamPowerBlockGateOf } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyBecomeCopy } from "./effects/atoms/becomeCopy.js";
import { deriveCharacteristics } from "./layers.js";
import { pickAction, pickAttackPlan } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (bundled Scryfall data via cardIndex.publicCard — generated, never typed) ─────────────────────
const CHAMPION = {"name":"Champion of Lambholt","type":"Creature — Human Warrior","mana":"{1}{G}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"Creatures with power less than this creature's power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature."}; // native-trigger
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WALKER = {"name":"Phyrexian Walker","type":"Artifact Creature — Phyrexian Construct","mana":"{0}","cmc":0,"power":"0","toughness":"3","keywords":[],"colors":[],"oracle":""}; // native-body
const CADET = {"name":"Eager Cadet","type":"Creature — Human Soldier","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BALOTH = {"name":"Rumbling Baloth","type":"Creature — Beast","mana":"{2}{G}{G}","cmc":4,"power":"4","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WOODLAND = {"name":"Shifting Woodland","type":"Land","mana":"","cmc":0,"keywords":["Delirium"],"colors":[],"oracle":"This land enters tapped unless you control a Forest.\n{T}: Add {G}.\nDelirium — {2}{G}{G}: This land becomes a copy of target permanent card in your graveyard until end of turn. Activate only if there are four or more card types among cards in your graveyard."}; // land
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Shock deals 2 damage to any target."}; // native-spell
const PONDER = {"name":"Ponder","type":"Sorcery","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card."}; // native-spell
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const DISFIGURE = {"name":"Disfigure","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Target creature gets -2/-2 until end of turn."}; // native-spell
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const WANDERING_WOLF = {"name":"Wandering Wolf","type":"Creature — Wolf","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["G"],"oracle":"Creatures with power less than this creature's power can't block it."}; // native-body
// Corpus siblings that must stay parked (same generator).
const BOWER_PASSAGE = {"name":"Bower Passage","type":"Enchantment","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Creatures with flying can't block creatures you control."}; // body-only
const KRAKEN = {"name":"Kraken of the Straits","type":"Creature — Kraken","mana":"{5}{U}{U}","cmc":7,"power":"6","toughness":"6","keywords":[],"colors":["U"],"oracle":"Creatures with power less than the number of Islands you control can't block this creature."}; // body-only

// ─── harness ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const plus = (n) => ({ counters: { "+1/+1": n } });
/** A two-player table (user vs ai) at the user's declare-blockers step, `attackers` (ids) attacking the ai. */
function duel(user, ai, attackers, extra = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers", stack: [], pendingTriggers: [], consecutivePasses: 0,
    combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] },
    players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai: { ...g.players.ai, battlefield: ai } },
    ...extra,
  };
}
/** The same table moved to the user's main phase with a hand and a mana pool (for real casts). */
function mainPhase(user, ai, { hand = [], pool = {}, graveyard = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: user, hand, graveyard, manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai },
    },
  };
}
/** Move a main-phase state to declare-blockers with `attackers` attacking the ai (the board carries over untouched). */
const toBlocks = (s, attackers) => ({ ...s, phase: "combat", step: "declare-blockers", priorityHolder: "user",
  combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } });
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
}
const castOn = (s, cardId, targetId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (!targetId || a.targets?.[0]?.id === targetId));
/** Every declare-blocker the defending seat is OFFERED, as "blocker>attacker". */
const offered = (s, seat = "ai") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`).sort();
/** Which of the defender's creatures are offered ANY block. */
const blockersOffered = (s, seat = "ai") => [...new Set(offered(s, seat).map((k) => k.split(">")[0]))].sort();
const powerOf = (s, id) => deriveCharacteristics(s, id).power;

// The defending lineup used throughout: one creature at each power 0..4.
const LINEUP = () => [P("walker", WALKER, "ai"), P("cadet", CADET, "ai"), P("obears", BEARS, "ai"), P("giant", HILL_GIANT, "ai"), P("baloth", BALOTH, "ai")];

describe("the card — the real oracle, both lines", () => {
  it("classifies native-trigger (the static line is enforced, the enters trigger routes natively)", () => {
    expect(classifyCard(CHAMPION)).toBe("native-trigger");
  });

  it("line 1 is read by the TEAM gate, never by the self gate, and its clause is credited", () => {
    expect(teamPowerBlockGateOf(CHAMPION)).toBe(true);
    expect(selfPowerBlockGateOf(CHAMPION)).toBeNull();
    expect(isEnforcedEvasionClause("creatures with power less than this creature's power can't block creatures you control")).toBe(true);
  });

  it("line 2 detects as an otherCreatureYouControl enters trigger whose effect is one +1/+1 counter on the Champion", () => {
    const trigs = detectTriggers(CHAMPION);
    expect(trigs.map((t) => [t.event, t.scope, t.effectClause])).toEqual([["etb", "otherCreatureYouControl", "put a +1/+1 counter on this creature"]]);
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
    const prog = parseEffectClause(trigs[0].effectClause);
    expect([prog.confidence, prog.atoms]).toEqual(["high", [{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" }]]);
  });

  it("the real corpus siblings stay parked: Bower Passage (a flying filter) and Kraken of the Straits (a different quantity)", () => {
    expect([classifyCard(BOWER_PASSAGE), classifyCard(KRAKEN)]).toEqual(["body-only", "body-only"]);
    expect([teamPowerBlockGateOf(BOWER_PASSAGE), teamPowerBlockGateOf(KRAKEN)]).toEqual([false, false]);
  });

  // Synthetic near-misses (no real card prints these): each would be a DIFFERENT restriction, so neither the reader nor
  // the classifier may take them — the anchors are what refuse them.
  it("CREED (synthetic) — '≤', 'greater', a conditional lead-in and a trailing rider are not this static", () => {
    const variants = [
      "Creatures with power less than or equal to this creature's power can't block creatures you control.",
      "Creatures with power greater than this creature's power can't block creatures you control.",
      "As long as it's your turn, creatures with power less than this creature's power can't block creatures you control.",
      "Creatures with power less than this creature's power can't block creatures you control this turn.",
    ].map((oracle) => ({ ...CHAMPION, oracle }));
    expect(variants.map((c) => teamPowerBlockGateOf(c))).toEqual([false, false, false, false]);
    expect(variants.map((c) => /^native/.test(classifyCard(c)))).toEqual([false, false, false, false]);
    expect(isEnforcedEvasionClause("creatures with power less than this creature's power can't block creatures you control this turn")).toBe(false);
    expect(isEnforcedEvasionClause("each creatures with power less than this creature's power can't block creatures you control")).toBe(false);
  });

  it("CREED (synthetic) — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...CHAMPION, oracle: `${CHAMPION.oracle}\nEach opponent glorbulates.` })).toBe("body-only");
  });
});

describe("ENFORCEMENT — the declare-blockers offer (legalActionsForPlayer for the defending seat)", () => {
  it("⭐ a 3-power Champion: power 0–2 creatures are offered NO block on any creature its controller controls; power 3 (EQUAL) and 4 are", () => {
    const s = duel([P("champ", CHAMPION, "user", plus(2)), P("bears", BEARS)], LINEUP(), ["champ", "bears"]);
    const row = { bar: powerOf(s, "champ"), offered: offered(s) };
    console.log("  WITNESS championBlocks", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ bar: 3, offered: ["baloth>bears", "baloth>champ", "giant>bears", "giant>champ"] });
  });

  it("the Champion's +1/+1 counters raise the bar one power at a time; equal power always blocks", () => {
    const at = (n) => blockersOffered(duel([P("champ", CHAMPION, "user", plus(n)), P("bears", BEARS)], LINEUP(), ["bears"]));
    expect({ 0: at(0), 1: at(1), 2: at(2), 3: at(3), 4: at(4) }).toEqual({
      0: ["baloth", "cadet", "giant", "obears"],
      1: ["baloth", "giant", "obears"],
      2: ["baloth", "giant"],
      3: ["baloth"],
      4: [],
    });
  });

  it("the BLOCKER's power is read live too: two +1/+1 counters lift an Eager Cadet (1 → 3) over a 3-power bar", () => {
    const champ = P("champ", CHAMPION, "user", plus(2));
    const plain = duel([champ, P("bears", BEARS)], [P("cadet", CADET, "ai")], ["bears"]);
    const grown = duel([champ, P("bears", BEARS)], [P("cadet", CADET, "ai", plus(2))], ["bears"]);
    expect({ plain: offered(plain), grown: offered(grown) }).toEqual({ plain: [], grown: ["cadet>bears"] });
  });

  it("⭐ the enters trigger feeds the bar: casting Grizzly Bears puts a counter on the Champion, and the Eager Cadet loses its block", () => {
    const s0 = mainPhase([P("champ", CHAMPION), P("old", BEARS)], [P("cadet", CADET, "ai")], { hand: [{ ...BEARS, id: "h-bears" }], pool: { G: 2 } });
    const before = toBlocks(s0, ["old"]);
    const s1 = settle(dispatchAction(s0, castOn(s0, "h-bears")));
    const after = toBlocks(s1, ["old"]);
    const row = {
      counters: s1.players.user.battlefield.find((p) => p.id === "champ").counters?.["+1/+1"] ?? 0,
      bar: [powerOf(before, "champ"), powerOf(after, "champ")],
      cadetBlocks: [offered(before), offered(after)],
    };
    console.log("  WITNESS championTrigger", JSON.stringify(row));
    expect(row).toEqual({ counters: 1, bar: [1, 2], cadetBlocks: [["cadet>old"], []] });
  });

  it("the trigger's scope: the Champion's OWN entry and an OPPONENT's creature entering put no counter on it", () => {
    // "another creature you control" — the Champion cast onto a board that already holds the user's Bears.
    const s0 = mainPhase([P("old", BEARS)], [], { hand: [{ ...CHAMPION, id: "h-champ" }], pool: { G: 3 } });
    const s1 = settle(dispatchAction(s0, castOn(s0, "h-champ")));
    const champ = s1.players.user.battlefield.find((p) => p.card?.name === "Champion of Lambholt");
    // The ai casts Grizzly Bears on its own turn while the user's Champion watches.
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const t0 = {
      ...g, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, battlefield: [P("champ", CHAMPION)] }, ai: { ...g.players.ai, hand: [{ ...BEARS, id: "h-aibears" }], manaPool: { ...g.players.ai.manaPool, G: 2 } } },
    };
    const aiCast = legalActionsForPlayer(t0, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h-aibears");
    const t1 = settle(dispatchAction(t0, aiCast));
    expect({
      ownEntry: [!!champ, champ?.counters?.["+1/+1"] ?? 0],
      opponentsCreature: [t1.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears"), t1.players.user.battlefield.find((p) => p.id === "champ").counters?.["+1/+1"] ?? 0],
    }).toEqual({ ownEntry: [true, 0], opponentsCreature: [true, 0] });
  });

  it("the restriction follows the live board: Disfigure on a 3/3 Champion drops the bar to 1, and Murder lifts it entirely", () => {
    const user = [P("champ", CHAMPION, "user", plus(2)), P("bears", BEARS)];
    const s0 = mainPhase(user, LINEUP(), { hand: [{ ...DISFIGURE, id: "h-dis" }, { ...MURDER, id: "h-murder" }], pool: { B: 3, C: 1 } });
    const shrunk = settle(dispatchAction(s0, castOn(s0, "h-dis", "champ")));
    const gone = settle(dispatchAction(s0, castOn(s0, "h-murder", "champ")));
    const row = {
      full: blockersOffered(toBlocks(s0, ["bears"])),
      shrunk: [powerOf(shrunk, "champ"), blockersOffered(toBlocks(shrunk, ["bears"]))],
      gone: [gone.players.user.graveyard.some((c) => c.name === "Champion of Lambholt"), blockersOffered(toBlocks(gone, ["bears"]))],
    };
    console.log("  WITNESS championLive", JSON.stringify(row));
    expect(row).toEqual({
      full: ["baloth", "giant"],
      shrunk: [1, ["baloth", "cadet", "giant", "obears"]],
      gone: [true, ["baloth", "cadet", "giant", "obears", "walker"]],
    });
  });

  it("a pump on the blocker (Giant Growth, cast by the defending seat) clears the bar — the offer reads the blocker after it resolves", () => {
    const s0 = duel([P("champ", CHAMPION, "user", plus(2)), P("bears", BEARS)], [P("obears", BEARS, "ai")], ["bears"]);
    const withSpell = { ...s0, priorityHolder: "ai", players: { ...s0.players, ai: { ...s0.players.ai, hand: [{ ...GIANT_GROWTH, id: "h-gg" }], manaPool: { ...s0.players.ai.manaPool, G: 1 } } } };
    const cast = legalActionsForPlayer(withSpell, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h-gg" && a.targets?.[0]?.id === "obears");
    const pumped = { ...settle(dispatchAction(withSpell, cast)), priorityHolder: "user" };
    expect({ before: offered(s0), pumped: [powerOf(pumped, "obears"), offered(pumped)] }).toEqual({ before: [], pumped: [5, ["obears>bears"]] });
  });

  it("the bar is the CHAMPION's power, not the attacker's: a 1-power Champion lets a 1-power Cadet block a 2-power attacker", () => {
    // Read against the attacker it would be 1 < 2 — refused. The printed bar is the source's own power, so it's legal.
    const s = duel([P("champ", CHAMPION), P("bears", BEARS)], [P("cadet", CADET, "ai")], ["bears"]);
    expect(offered(s)).toEqual(["cadet>bears"]);
  });

  it("canBlockAttacker agrees with the offer pairwise (the chokepoint itself)", () => {
    const s = duel([P("champ", CHAMPION, "user", plus(1)), P("bears", BEARS)], LINEUP(), ["bears"]);
    expect(["walker", "cadet", "obears", "giant"].map((b) => canBlockAttacker(s, b, "bears", "ai"))).toEqual([false, false, true, true]);
  });
});

describe("SCOPE — creatures the Champion's controller controls, against every opponent", () => {
  function pod({ active = "user", user = [], ai1 = [], ai2 = [], attacks = [] }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return {
      ...g, turn: 7, activePlayer: active, priorityHolder: active, phase: "combat", step: "declare-blockers", stack: [], pendingTriggers: [], consecutivePasses: 0,
      combat: { attackers: attacks.map(([id, defender]) => ({ permanentId: id, attackingPlayer: active, defender })), blockers: [] },
      players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai1: { ...g.players.ai1, battlefield: ai1 }, ai2: { ...g.players.ai2, battlefield: ai2 } },
    };
  }

  it("⭐ multiplayer: attacks split across two opponents are both protected, each defender blocking only its own attacker", () => {
    const s = pod({
      user: [P("champ", CHAMPION, "user", plus(2)), P("b1", BEARS), P("b2", BEARS)],
      ai1: [P("a1bears", BEARS, "ai1"), P("a1giant", HILL_GIANT, "ai1")],
      ai2: [P("a2cadet", CADET, "ai2"), P("a2baloth", BALOTH, "ai2")],
      attacks: [["b1", "ai1"], ["b2", "ai2"]],
    });
    expect({ ai1: offered(s, "ai1"), ai2: offered(s, "ai2") }).toEqual({ ai1: ["a1giant>b1"], ai2: ["a2baloth>b2"] });
  });

  it("another player's attack is NOT protected: ai1 attacks ai2 while the user controls a 3-power Champion — ai2's Cadet blocks", () => {
    const s = pod({
      active: "ai1",
      user: [P("champ", CHAMPION, "user", plus(2))],
      ai1: [P("raider", BEARS, "ai1")],
      ai2: [P("a2cadet", CADET, "ai2")],
      attacks: [["raider", "ai2"]],
    });
    expect(offered(s, "ai2")).toEqual(["a2cadet>raider"]);
  });

  it("the DEFENDER's own Champion restricts nothing on defense: the ai's 3-power Champion never stops its own Cadet blocking", () => {
    const s = duel([P("bears", BEARS)], [P("aichamp", CHAMPION, "ai", plus(2)), P("cadet", CADET, "ai")], ["bears"]);
    expect(offered(s)).toEqual(["aichamp>bears", "cadet>bears"]);
  });
});

describe("COMPOSITION — each restriction applies independently (CR 509.1b)", () => {
  it("two Champions: the higher power sets the bar, and losing it drops the bar to the other", () => {
    const user = [P("small", CHAMPION), P("big", CHAMPION, "user", plus(2)), P("bears", BEARS)];
    const both = duel(user, LINEUP(), ["bears"]);
    const smallOnly = duel(user.filter((p) => p.id !== "big"), LINEUP(), ["bears"]);
    expect({ both: blockersOffered(both), smallOnly: blockersOffered(smallOnly) }).toEqual({
      both: ["baloth", "giant"],
      smallOnly: ["baloth", "cadet", "giant", "obears"],
    });
  });

  it("with Wandering Wolf's self gate: a 1-power Cadet clears the 1-power Champion but not the 2-power Wolf — it may block only the Bears", () => {
    const s = duel([P("champ", CHAMPION), P("wolf", WANDERING_WOLF), P("bears", BEARS)], [P("cadet", CADET, "ai")], ["wolf", "bears"]);
    expect(offered(s)).toEqual(["cadet>bears"]);
  });
});

describe("LAYER 1 — the source is read as the permanent it IS (CR 707.2, 613.1a)", () => {
  // Delirium: four card types in the graveyard (creature, instant, sorcery, land).
  const graveyard = () => [{ ...CHAMPION, id: "g-champ" }, { ...SHOCK, id: "g-shock" }, { ...PONDER, id: "g-ponder" }, { ...MOUNTAIN, id: "g-mtn" }];

  it("⭐ Shifting Woodland that became a copy of Champion of Lambholt carries the static: the Walker (power 0) loses its block", () => {
    const s0 = mainPhase([P("wood", WOODLAND), P("bears", BEARS)], [P("walker", WALKER, "ai"), P("cadet", CADET, "ai")], { graveyard: graveyard(), pool: { G: 2, C: 2 } });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "wood" && a.targets?.[0]?.id === "g-champ");
    const s1 = settle(dispatchAction(s0, act));
    const row = {
      copied: deriveCharacteristics(s1, "wood").copiableValues?.name ?? null,
      before: offered(toBlocks(s0, ["bears"])),
      after: offered(toBlocks(s1, ["bears"])),
    };
    console.log("  WITNESS championCopy", JSON.stringify(row));
    expect(row).toEqual({ copied: "Champion of Lambholt", before: ["cadet>bears", "walker>bears"], after: ["cadet>bears"] });
  });

  it("a Champion that became a copy of Grizzly Bears no longer carries it (the become-copy resolver)", () => {
    const s = duel([P("champ", CHAMPION, "user", plus(2)), P("bears", BEARS)], [P("walker", WALKER, "ai")], ["bears"]);
    const asBears = applyBecomeCopy(s, { op: "become-copy", targetType: "creature", riders: [] }, { controller: "user", sourceId: "champ", targets: [{ type: "creature", id: "bears" }] });
    expect({ before: offered(s), copied: deriveCharacteristics(asBears, "champ").copiableValues?.name, after: offered(asBears) })
      .toEqual({ before: [], copied: "Grizzly Bears", after: ["walker>bears"] });
  });
});

describe("the AI seats", () => {
  it("⭐ the block chooser never declares the illegal block — facing lethal it blocks with the Hill Giant, the Bears were never on offer", () => {
    const s = duel([P("champ", CHAMPION, "user", plus(2)), P("bears", BEARS)], [P("obears", BEARS, "ai"), P("giant", HILL_GIANT, "ai")], ["bears"]);
    const lethal = { ...s, players: { ...s.players, ai: { ...s.players.ai, life: 2 } } };
    const pick = pickAction(lethal, "ai", legalActionsForPlayer(lethal, "ai"));
    expect({ offered: offered(lethal), pick: pick && `${pick.kind}:${pick.permanentId}>${pick.attackerId}` })
      .toEqual({ offered: ["giant>bears"], pick: "declare-blocker:giant>bears" });
  });

  it("the attack model sees the restriction: with a 3-power Champion the AI swings its 1/1 past a lone 2/2; with a 1-power Champion it holds it back", () => {
    const board = (n) => {
      const g = createGameState({ userDeck: [], aiDeck: [] });
      return {
        ...g, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers", stack: [], pendingTriggers: [], consecutivePasses: 0,
        combat: { attackers: [], blockers: [] },
        players: { ...g.players, user: { ...g.players.user, battlefield: [P("ubears", BEARS, "user")] }, ai: { ...g.players.ai, battlefield: [P("champ", CHAMPION, "ai", plus(n)), P("cadet", CADET, "ai")] } },
      };
    };
    const swings = (s) => pickAttackPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker")).map((a) => a.permanentId).sort();
    expect({ bar3: swings(board(2)), bar1: swings(board(0)) }).toEqual({ bar3: ["cadet", "champ"], bar1: [] });
  });
});
