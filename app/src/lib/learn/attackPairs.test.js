/**
 * attackPairs.test.js — the play-weighted program, #610 Mangara, the Diplomat + #626 Trouble in Pairs.
 *
 *   Mangara: "Lifelink / Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you
 *             and/or planeswalkers you control, draw a card. / Whenever an opponent casts their second spell each turn, draw a
 *             card."
 *   Trouble in Pairs: "If an opponent would begin an extra turn, that player skips that turn instead. / Whenever an opponent
 *             attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn,
 *             you draw a card."
 *
 * What was built:
 *   · the opponent-attacks event (triggers.checkAttackTriggers' opponent-attacks pass): every player the attacking player is an
 *     opponent of watches ONE declaration, once (CR 603.2c). Each attacking creature attacks exactly one player, planeswalker or
 *     battle (CR 508.1b). Mangara's ability triggers on the declaration (CR 508.3c) and its intervening-if counts "those
 *     creatures" at you and your planeswalkers at flush and on resolution (CR 603.4) from the declaration the pass threads into
 *     the context; Trouble in Pairs counts only creatures declared attacking you as a player (CR 508.3e — a planeswalker attack
 *     is not an attack on its controller; the bundled rulings print no exception). A creature put onto the battlefield attacking
 *     was never declared and counts for neither (CR 508.4).
 *   · Trouble in Pairs' three-event trigger splits into its three disjoint halves (the Syr Konrad triple pattern); the draw and
 *     cast halves are the existing per-player-per-turn watchers (Faerie Mastermind's drawSecond, the opponent castNth).
 *   · the extra-turn skip (CR 614.10, 500.7): gameEngine.advanceStep — the one place an extra turn begins — pops an extra turn
 *     whose taker has an opponent controlling the card, untaken, and its "that turn" delayed records go with it (CR 614.10a;
 *     Final Fortune's ruling: no loss).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01; the trailing comment is the tier at
 * generation). Every runtime case runs through the engine's own entry points: legalActionsForPlayer + dispatchAction declare
 * attackers and cast spells, passPriority walks the table (the declare-blockers entry fires the attack triggers, a full lap of
 * passes resolves the top of the stack, an empty-stack lap advances the step), nextStep leaves the priority-less cleanup.
 * Cases marked SYNTHETIC build a state no natively modeled card reaches in that window today (each guards a false positive the
 * rules forbid); each one is labelled where it stands.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { interveningIfParseable, spellConditionParseable, activationConditionParseable } from "./interveningIf.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, nextStep } from "./gameEngine.js";
import { moveControl } from "./controlMove.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const MANGARA = {"name":"Mangara, the Diplomat","type":"Legendary Creature — Human Cleric","mana":"{3}{W}","cmc":4,"power":"2","toughness":"4","keywords":["Lifelink"],"colors":["W"],"oracle":"Lifelink\nWhenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.\nWhenever an opponent casts their second spell each turn, draw a card."}; // native-trigger
const TROUBLE = {"name":"Trouble in Pairs","type":"Enchantment","mana":"{2}{W}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If an opponent would begin an extra turn, that player skips that turn instead.\nWhenever an opponent attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn, you draw a card."}; // native-mixed
const EVERETT = {"name":"Everett K. Ross, Hapless Attaché","type":"Legendary Creature — Human Advisor","mana":"{2}{W}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":["W"],"oracle":"Commander creatures you control get +1/+1 and have lifelink.\nWhenever an opponent attacks you with two or more creatures, draw a card."}; // native-mixed
const TOMIK = {"name":"Tomik, Wielder of Law","type":"Legendary Creature — Human Advisor","mana":"{1}{W}{B}","cmc":3,"power":"2","toughness":"4","keywords":["Flying","Affinity","Vigilance"],"colors":["B","W"],"oracle":"Affinity for planeswalkers (This spell costs {1} less to cast for each planeswalker you control.)\nFlying, vigilance\nWhenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, that opponent loses 3 life and you draw a card."}; // body-only
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const DRUDGE = {"name":"Drudge Skeletons","type":"Creature — Skeleton","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":["Heal","Regenerate"],"colors":["B"],"oracle":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)"}; // native-activated
const EFA = {"name":"Endless Foot Assault","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":["Squad"],"colors":["W"],"oracle":"Squad {1}{W} (As an additional cost to cast this spell, you may pay {1}{W} any number of times. When this enchantment enters, create that many tokens that are copies of it.)\nWhenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player."}; // native-trigger
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"}; // native-body
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""}; // native-body
const MISTS = {"name":"Reach Through Mists","type":"Instant — Arcane","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Draw a card."}; // native-spell
const TIME_WALK = {"name":"Time Walk","type":"Sorcery","mana":"{1}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Take an extra turn after this one."}; // native-spell
const FINAL_FORTUNE = {"name":"Final Fortune","type":"Instant","mana":"{R}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Take an extra turn after this one. At the beginning of that turn's end step, you lose the game."}; // native-spell
const RAY = {"name":"Ray of Erasure","type":"Instant","mana":"{U}","cmc":1,"keywords":["Mill"],"colors":["U"],"oracle":"Target player mills a card.\nDraw a card at the beginning of the next turn's upkeep."}; // native-spell
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const DISENCHANT = {"name":"Disenchant","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Destroy target artifact or enchantment."}; // native-spell
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const RELENTLESS = {"name":"Relentless Assault","type":"Sorcery","mana":"{2}{R}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase."}; // native-spell
const NEXUS = {"name":"Nexus of Fate","type":"Instant","mana":"{5}{U}{U}","cmc":7,"keywords":[],"colors":["U"],"oracle":"Take an extra turn after this one.\nIf Nexus of Fate would be put into a graveyard from anywhere, reveal Nexus of Fate and shuffle it into its owner's library instead."}; // native-spell

const MANGARA_IF = "two or more of those creatures are attacking you and/or planeswalkers you control";

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const H = (id, card) => ({ id, ...card });
const lands = (pid, card, n) => Array.from({ length: n }, (_, i) => P(`${pid}-${card.name}-${i}`, card, pid));
const library = (pid) => Array.from({ length: 8 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/**
 * A four-seat pod (user → ai1 → ai2 → ai3), every library stocked. `boards` / `hands` add permanents / cards per seat; the
 * table opens at `phase`/`step` of `active` with priority on the active player.
 */
function table({ active = "ai1", phase = "combat", step = "declare-attackers", boards = {}, hands = {}, turn = 5 } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: hands[pid] || [], library: library(pid) };
  }
  return { ...s0, players, turn, phase, step, activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}

const handSize = (s, pid = "user") => s.players[pid].hand.length;
const triggersOnStack = (s) => s.stack.filter((o) => o.kind === "triggered-ability").map((o) => o.source?.name ?? null);
const act = (s, pid, pred) => {
  const a = legalActionsForPlayer(s, pid).find(pred);
  if (!a) throw new Error(`no matching action for ${pid}`);
  return dispatchAction(s, a);
};
const castBy = (s, pid, cardId, targetId = null) =>
  act(s, pid, (a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));

/** Pass priority until the stack is empty (each full lap resolves the top object). */
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}

/** Pass priority to `pid` without anyone acting (the laps move the holder seat by seat). */
function priorityTo(s, pid) {
  let g = 0;
  while (s.priorityHolder !== pid && g++ < 8) s = passPriority(s);
  return s;
}

/**
 * Declare each [attackerId, defenderId, planeswalkerId?] for the active player through the offered actions, then pass priority
 * to the declare-blockers step entry, where the engine fires the attack triggers and puts them on the stack. Returns that
 * state (triggers still on the stack) and the names of what went on the stack.
 */
function declare(s, picks) {
  const attacker = s.activePlayer;
  for (const [id, def, pw = null] of picks) {
    s = act(s, attacker, (a) => a.kind === "declare-attacker" && a.permanentId === id && (a.defenderId ?? def) === def && (a.defenderPlaneswalkerId ?? null) === pw);
  }
  let g = 0;
  while (s.step === "declare-attackers" && g++ < 20) s = passPriority(s);
  return { s, fired: triggersOnStack(s) };
}

/** Walk the turn structure (passPriority, or nextStep where no one holds priority) until `pred` holds. */
function until(s, pred, cap = 400) {
  let g = 0;
  while (!pred(s) && g++ < cap) s = s.priorityHolder ? passPriority(s) : nextStep(s);
  if (!pred(s)) throw new Error(`until: condition not reached (turn ${s.turn}, ${s.activePlayer} ${s.phase}/${s.step})`);
  return s;
}

describe("parse + classify — every line of both cards", () => {
  it("⭐ Mangara: Lifelink + the opponent-attacks trigger with its intervening-if + the opponent's second spell; both route natively → native-trigger", () => {
    const d = detectTriggers(MANGARA);
    const row = { triggers: d.map((t) => ({ event: t.event, whose: t.whose, nth: t.nth, minAttackingYou: t.minAttackingYou, interveningIf: t.interveningIf, effect: t.effectClause })),
      routes: d.map(triggerRoutesNatively), tier: classifyCard(MANGARA) };
    console.log("  WITNESS mangaraParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      triggers: [
        { event: "opponentAttacks", whose: "any", nth: undefined, minAttackingYou: undefined, interveningIf: MANGARA_IF, effect: "draw a card" },
        { event: "castNth", whose: "opponent", nth: 2, minAttackingYou: undefined, interveningIf: null, effect: "draw a card" },
      ],
      routes: [true, true], tier: "native-trigger",
    });
  });

  it("⭐ Trouble in Pairs: the replacement line is a modeled static; the three-event trigger splits into its three halves, each routing natively → native-mixed", () => {
    const d = detectTriggers(TROUBLE);
    const row = { statics: parseStaticAbilities(TROUBLE), triggers: d.map((t) => ({ event: t.event, whose: t.whose, nth: t.nth, minAttackingYou: t.minAttackingYou, effect: t.effectClause })),
      routes: d.map(triggerRoutesNatively), tier: classifyCard(TROUBLE) };
    console.log("  WITNESS troubleParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      statics: [{ skipOpponentExtraTurns: true }],
      triggers: [
        { event: "opponentAttacks", whose: "any", nth: undefined, minAttackingYou: 2, effect: "you draw a card" },
        { event: "drawSecond", whose: "opponent", nth: undefined, minAttackingYou: undefined, effect: "you draw a card" },
        { event: "castNth", whose: "opponent", nth: 2, minAttackingYou: undefined, effect: "you draw a card" },
      ],
      routes: [true, true, true], tier: "native-mixed",
    });
  });

  it("the intervening-if is readable only where a declaration exists: a trigger context reads it; a spell or an activated ability has no \"those creatures\"", () => {
    expect({ trigger: interveningIfParseable(MANGARA_IF), spell: spellConditionParseable(MANGARA_IF), activation: activationConditionParseable(MANGARA_IF) })
      .toEqual({ trigger: true, spell: false, activation: false });
  });

  it("the neighbours on the same arms: Everett K. Ross (Trouble in Pairs' attack half + the existing commander anthem) classifies native-mixed; Tomik (Mangara's trigger with an unmodeled \"that opponent loses 3 life\" payoff) stays body-only", () => {
    const tomik = detectTriggers(TOMIK);
    expect({ everett: classifyCard(EVERETT), everettTrig: detectTriggers(EVERETT).map((t) => [t.event, t.minAttackingYou, t.effectClause]),
      tomik: classifyCard(TOMIK), tomikTrig: tomik.map((t) => [t.event, t.interveningIf, triggerRoutesNatively(t)]) })
      .toEqual({ everett: "native-mixed", everettTrig: [["opponentAttacks", 2, "draw a card"]],
        tomik: "body-only", tomikTrig: [["opponentAttacks", MANGARA_IF, false]] });
  });
});

describe("RUNTIME — the attack trigger: four seats, ai1 attacks, you hold Mangara and Trouble in Pairs", () => {
  const defenders = (extra = {}) => ({
    user: [P("mangara", MANGARA, "user"), P("tip", TROUBLE, "user"), ...(extra.user || [])],
    ai1: [P("b1", BEARS, "ai1"), P("b2", BEARS, "ai1"), P("b3", BEARS, "ai1"), ...(extra.ai1 || [])],
    ai2: extra.ai2 || [],
    ai3: extra.ai3 || [],
  });

  it("⭐ split between you and ai2: neither triggers (one creature at you), nothing is drawn", () => {
    const s0 = table({ boards: defenders() });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "ai2"]]);
    const end = resolveStack(s);
    expect({ fired, drawn: handSize(end) - handSize(s0) }).toEqual({ fired: [], drawn: 0 });
  });

  it("⭐ two at you: each card triggers ONCE for the declaration and you draw one card from each", () => {
    const s0 = table({ boards: defenders() });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    const end = resolveStack(s);
    console.log("  WITNESS twoAtYou", JSON.stringify({ fired, drawn: handSize(end) - handSize(s0) })); // vitest 4 needs --disable-console-intercept
    expect({ fired: [...fired].sort(), drawn: handSize(end) - handSize(s0) }).toEqual({ fired: ["Mangara, the Diplomat", "Trouble in Pairs"], drawn: 2 });
  });

  it("three at you is still ONE trigger each (Mangara's ruling: \"just one card, no matter how many … beyond the second\")", () => {
    const s0 = table({ boards: defenders() });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user"], ["b3", "user"]]);
    expect({ fired: [...fired].sort(), drawn: handSize(resolveStack(s)) - handSize(s0) }).toEqual({ fired: ["Mangara, the Diplomat", "Trouble in Pairs"], drawn: 2 });
  });

  it("⭐ one at you and one at your planeswalker: Mangara triggers (its ruling); Trouble in Pairs does not — a planeswalker attack is not an attack on you (CR 508.3e)", () => {
    const s0 = table({ boards: defenders({ user: [P("jace", JACE, "user", { counters: { loyalty: 3 } })] }) });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user", "jace"]]);
    expect({ fired, drawn: handSize(resolveStack(s)) - handSize(s0) }).toEqual({ fired: ["Mangara, the Diplomat"], drawn: 1 });
  });

  it("one at you and one at ANOTHER player's planeswalker: Mangara does not trigger — that is not a planeswalker you control", () => {
    const s0 = table({ boards: defenders({ ai2: [P("jace2", JACE, "ai2", { counters: { loyalty: 3 } })] }) });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "ai2", "jace2"]]);
    expect({ fired, drawn: handSize(resolveStack(s)) - handSize(s0) }).toEqual({ fired: [], drawn: 0 });
  });

  it("your OWN attack never triggers either card: no pending trigger at all, not one dropped at flush (\"an opponent attacks\")", () => {
    const s0 = table({ active: "user", boards: { user: [P("mangara", MANGARA, "user"), P("tip", TROUBLE, "user"), P("ub1", BEARS, "user"), P("ub2", BEARS, "user")] } });
    const { s, fired } = declare(s0, [["ub1", "ai1"], ["ub2", "ai1"]]);
    const skips = s.log.filter((e) => /condition-not-met/.test(String(e.kind || e.effect || ""))).length;
    expect({ fired, skips }).toEqual({ fired: [], skips: 0 });
  });

  it("another opponent's watchers see the same declaration: ai2's Trouble in Pairs triggers when ai1 sends two at ai2, yours does not", () => {
    const s0 = table({ boards: defenders({ ai2: [P("tip2", TROUBLE, "ai2")] }) });
    const { s, fired } = declare(s0, [["b1", "ai2"], ["b2", "ai2"]]);
    const end = resolveStack(s);
    expect({ fired, ai2Drew: handSize(end, "ai2") - handSize(s0, "ai2"), userDrew: handSize(end) - handSize(s0) }).toEqual({ fired: ["Trouble in Pairs"], ai2Drew: 1, userDrew: 0 });
  });

  it("⭐ CR 508.4 — a creature put onto the battlefield attacking never attacked: ai1's Endless Foot Assault sends a Ninja at you beside ONE declared Bears → two creatures attack you, neither card triggers", () => {
    const s0 = table({ boards: defenders({ ai1: [P("efa", EFA, "ai1")] }) });
    const { s, fired } = declare(s0, [["b1", "user"]]);
    const end = resolveStack(s);
    const atYou = (end.combat?.attackers || []).filter((a) => a.defender === "user").length;
    console.log("  WITNESS enteredAttacking", JSON.stringify({ fired, atYou, drawn: handSize(end) - handSize(s0) })); // vitest 4 needs --disable-console-intercept
    expect({ fired, atYou, drawn: handSize(end) - handSize(s0) }).toEqual({ fired: ["Endless Foot Assault"], atYou: 2, drawn: 0 });
  });

  it("…and two declared at you beside the Ninja is still one trigger each, one card each", () => {
    const s0 = table({ boards: defenders({ ai1: [P("efa", EFA, "ai1")] }) });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    expect({ fired: [...fired].sort(), drawn: handSize(resolveStack(s)) - handSize(s0) })
      .toEqual({ fired: ["Endless Foot Assault", "Mangara, the Diplomat", "Trouble in Pairs"], drawn: 2 });
  });

  it("Trouble in Pairs' ruling: a second declaration in an extra combat triggers it again — ai1 swings twice (Relentless Assault), you draw twice", () => {
    let s = table({ boards: { user: [P("tip", TROUBLE, "user")], ai1: [P("b1", BEARS, "ai1"), P("b2", BEARS, "ai1"), ...lands("ai1", MOUNTAIN, 4)] }, hands: { ai1: [H("ra", RELENTLESS)] } });
    const u0 = handSize(s);
    const first = declare(s, [["b1", "user"], ["b2", "user"]]);
    s = until(resolveStack(first.s), (x) => x.phase === "postcombat-main" && x.step === "main");
    s = resolveStack(castBy(s, "ai1", "ra"));
    s = until(s, (x) => x.step === "declare-attackers");
    const second = declare(s, [["b1", "user"], ["b2", "user"]]);
    s = resolveStack(second.s);
    expect({ first: first.fired, second: second.fired, combats: s.combatsThisTurn?.count, drawn: handSize(s) - u0 })
      .toEqual({ first: ["Trouble in Pairs"], second: ["Trouble in Pairs"], combats: 2, drawn: 2 });
  });
});

describe("RUNTIME — Mangara's intervening-if is checked again on resolution (CR 603.4; Mangara's ruling)", () => {
  // Mangara alone on your side, so every card drawn is hers.
  const board = (extra = {}) => ({
    user: [P("mangara", MANGARA, "user"), ...lands("user", MOUNTAIN, 1), ...(extra.user || [])],
    ai1: [P("b1", BEARS, "ai1"), P("b2", BEARS, "ai1"), ...lands("ai1", MOUNTAIN, 1), ...(extra.ai1 || [])],
  });

  it("⭐ an attacker that LEAVES the battlefield still counts — last known information: you Bolt one of the two in response and still draw", () => {
    const s0 = table({ boards: board(), hands: { user: [H("bolt", BOLT)] } });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    let r = castBy(priorityTo(s, "user"), "user", "bolt", "b1");
    r = resolveStack(r);
    const row = { fired, bearDied: r.players.ai1.graveyard.some((c) => c.name === BEARS.name), drawn: handSize(r) - (handSize(s0) - 1) };
    console.log("  WITNESS lkiLeft", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fired: ["Mangara, the Diplomat"], bearDied: true, drawn: 1 });
  });

  it("⭐ the attacked planeswalker LEAVES: ai1 Bolts your Jace in response — the creature that attacked it attacks nothing now (CR 506.4c), one remains, no card", () => {
    const s0 = table({ boards: board({ user: [P("jace", JACE, "user", { counters: { loyalty: 3 } })] }), hands: { ai1: [H("bolt", BOLT)] } });
    const { s, fired } = declare(s0, [["b1", "user"], ["b2", "user", "jace"]]);
    let r = castBy(s, "ai1", "bolt", "jace");
    r = resolveStack(r);
    const row = { fired, jaceGone: !r.players.user.battlefield.some((p) => p.id === "jace"), drawn: handSize(r) - handSize(s0) };
    expect(row).toEqual({ fired: ["Mangara, the Diplomat"], jaceGone: true, drawn: 0 });
  });

  it("⭐ an attacker REMOVED FROM COMBAT without leaving uses its current information: ai1 shields its Drudge Skeletons in its main phase ({B}: Regenerate), it attacks, and regenerates from your Bolt (CR 701.19a) — no card", () => {
    const s0 = table({ phase: "precombat-main", step: "main", boards: board({ ai1: [P("drudge", DRUDGE, "ai1"), ...lands("ai1", SWAMP, 1)] }), hands: { user: [H("bolt", BOLT)] } });
    let r = resolveStack(act(s0, "ai1", (a) => a.kind === "activate-ability" && a.permanentId === "drudge"));
    const shielded = r.players.ai1.battlefield.find((p) => p.id === "drudge").regenShields;
    r = until(r, (x) => x.step === "declare-attackers");
    const { s, fired } = declare(r, [["drudge", "user"], ["b1", "user"]]);
    r = castBy(priorityTo(s, "user"), "user", "bolt", "drudge");
    r = resolveStack(r);
    const drudge = r.players.ai1.battlefield.find((p) => p.id === "drudge");
    const row = { fired, shielded, drudgeOnBattlefield: !!drudge, removedFromCombat: !!drudge?.removedFromCombat, drawn: handSize(r) - (handSize(s0) - 1) };
    console.log("  WITNESS regenerated", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fired: ["Mangara, the Diplomat"], shielded: 1, drudgeOnBattlefield: true, removedFromCombat: true, drawn: 0 });
  });

  it("control: with no response the same two-at-you declaration draws one card", () => {
    const s0 = table({ boards: board() });
    const { s } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    expect(handSize(resolveStack(s)) - handSize(s0)).toBe(1);
  });

  it("SYNTHETIC (CR 506.4 — an effect removes an attacker from combat while the trigger waits; the Gustcloak escape drops its combat record the same way, but only after blocks): the record is gone, the creature stays — no card", () => {
    const s0 = table({ boards: board() });
    const { s } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    const removed = { ...s, combat: { ...s.combat, attackers: s.combat.attackers.filter((a) => a.permanentId !== "b2") } };
    expect({ stillThere: !!removed.players.ai1.battlefield.find((p) => p.id === "b2"), drawn: handSize(resolveStack(removed)) - handSize(s0) })
      .toEqual({ stillThere: true, drawn: 0 });
  });

  it("SYNTHETIC (CR 506.4 — a creature whose controller changes is removed from combat; no native instant-speed control change exists to do it in this window): ai2 takes b2 — no card", () => {
    const s0 = table({ boards: board() });
    const { s } = declare(s0, [["b1", "user"], ["b2", "user"]]);
    const stolen = moveControl(s, "b2", "ai2");
    expect({ controller: stolen.players.ai2.battlefield.some((p) => p.id === "b2"), drawn: handSize(resolveStack(stolen)) - handSize(s0) })
      .toEqual({ controller: true, drawn: 0 });
  });
});

describe("RUNTIME — an opponent's SECOND draw and SECOND spell each turn (per player, per turn)", () => {
  it("⭐ second spell: ai1 casts Ornithopter, Memnite, Ornithopter — only the second draws you a card from each of Trouble in Pairs and Mangara", () => {
    let s = table({ phase: "precombat-main", step: "main", boards: { user: [P("mangara", MANGARA, "user"), P("tip", TROUBLE, "user")] },
      hands: { ai1: [H("o1", ORNITHOPTER), H("m1", MEMNITE), H("o2", ORNITHOPTER)] } });
    const drawnPer = [];
    for (const id of ["o1", "m1", "o2"]) {
      const before = handSize(s);
      s = castBy(s, "ai1", id);
      const triggers = triggersOnStack(s).sort();
      s = resolveStack(s);
      drawnPer.push({ id, triggers, drawn: handSize(s) - before });
    }
    console.log("  WITNESS secondSpell", JSON.stringify(drawnPer)); // vitest 4 needs --disable-console-intercept
    expect(drawnPer).toEqual([
      { id: "o1", triggers: [], drawn: 0 },
      { id: "m1", triggers: ["Mangara, the Diplomat", "Trouble in Pairs"], drawn: 2 },
      { id: "o2", triggers: [], drawn: 0 },
    ]);
  });

  it("⭐ second draw: ai1's draw-step draw (first), Reach Through Mists (second — Trouble in Pairs draws you one), Jace Beleren's −1 on itself (third — nothing)", () => {
    let s = table({ phase: "beginning", step: "upkeep", boards: { user: [P("tip", TROUBLE, "user")], ai1: [...lands("ai1", ISLAND, 1), P("jace", JACE, "ai1", { counters: { loyalty: 3 } })] },
      hands: { ai1: [H("mists", MISTS)] } });
    const u0 = handSize(s);
    s = until(s, (x) => x.phase === "precombat-main" && x.step === "main");
    const afterFirst = { aiDrawn: s.players.ai1.cardsDrawnThisTurn, userDrew: handSize(s) - u0 };
    s = resolveStack(castBy(s, "ai1", "mists"));
    const afterSecond = { aiDrawn: s.players.ai1.cardsDrawnThisTurn, userDrew: handSize(s) - u0 };
    s = resolveStack(act(s, "ai1", (a) => a.kind === "activate-loyalty" && a.permanentId === "jace" && a.costDelta === -1 && (a.targets || []).some((t) => t.id === "ai1")));
    const afterThird = { aiDrawn: s.players.ai1.cardsDrawnThisTurn, userDrew: handSize(s) - u0 };
    console.log("  WITNESS secondDraw", JSON.stringify({ afterFirst, afterSecond, afterThird })); // vitest 4 needs --disable-console-intercept
    expect({ afterFirst, afterSecond, afterThird }).toEqual({
      afterFirst: { aiDrawn: 1, userDrew: 0 }, afterSecond: { aiDrawn: 2, userDrew: 1 }, afterThird: { aiDrawn: 3, userDrew: 1 },
    });
  });

  it("the ruling: Trouble in Pairs need not have seen the first — it arrives after ai1's first draw and first spell (placed directly as setup), and ai1's second of each still draws you a card apiece", () => {
    let s = table({ phase: "beginning", step: "upkeep", boards: { ai1: lands("ai1", ISLAND, 2) }, hands: { ai1: [H("o1", ORNITHOPTER), H("mists", MISTS)] } });
    s = until(s, (x) => x.phase === "precombat-main" && x.step === "main");
    s = resolveStack(castBy(s, "ai1", "o1"));
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [P("tip", TROUBLE, "user")] } } };
    const u0 = handSize(s);
    s = castBy(s, "ai1", "mists"); // ai1's second spell…
    const castTriggers = triggersOnStack(s);
    s = resolveStack(s); // …and, on resolution, its second draw
    expect({ counts: [s.players.ai1.spellsCastThisTurn, s.players.ai1.cardsDrawnThisTurn], castTriggers, userDrew: handSize(s) - u0 })
      .toEqual({ counts: [2, 2], castTriggers: ["Trouble in Pairs"], userDrew: 2 });
  });

  it("your OWN second spell and second draw draw you nothing — every half watches an OPPONENT", () => {
    let s = table({ active: "user", phase: "precombat-main", step: "main", boards: { user: [P("mangara", MANGARA, "user"), P("tip", TROUBLE, "user"), ...lands("user", ISLAND, 2)] },
      hands: { user: [H("o1", ORNITHOPTER), H("mists1", MISTS), H("mists2", MISTS)] } });
    const triggers = [];
    for (const id of ["o1", "mists1", "mists2"]) {
      s = castBy(s, "user", id);
      triggers.push(...triggersOnStack(s));
      s = resolveStack(s);
    }
    expect({ spells: s.players.user.spellsCastThisTurn, draws: s.players.user.cardsDrawnThisTurn, triggers, hand: handSize(s) })
      .toEqual({ spells: 3, draws: 2, triggers: [], hand: 2 });
  });
});

describe("RUNTIME — \"If an opponent would begin an extra turn, that player skips that turn instead\" (CR 614.10, 500.7)", () => {
  const mainOf = (active, boards, hands) => table({ active, phase: "precombat-main", step: "main", boards, hands });
  const skipsLogged = (s) => s.log.filter((e) => e.kind === "extra-turn-skipped").map((e) => e.player);
  const nextTurn = (s) => until(s, (x) => x.turn === s.turn + 1);

  it("⭐ ai1 casts Time Walk under your Trouble in Pairs: its extra turn is skipped — turn 6 is ai2's, once", () => {
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user")], ai1: lands("ai1", ISLAND, 2) }, { ai1: [H("tw", TIME_WALK)] });
    s = resolveStack(castBy(s, "ai1", "tw"));
    const queued = s.extraTurns;
    s = nextTurn(s);
    const row = { queued, turn: s.turn, active: s.activePlayer, extraTurnOf: s.extraTurnOf ?? null, left: s.extraTurns, skipped: skipsLogged(s) };
    console.log("  WITNESS skipped", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ queued: [{ player: "ai1" }], turn: 6, active: "ai2", extraTurnOf: null, left: [], skipped: ["ai1"] });
  });

  it("control: with no Trouble in Pairs out, ai1 takes the extra turn", () => {
    let s = mainOf("ai1", { ai1: lands("ai1", ISLAND, 2) }, { ai1: [H("tw", TIME_WALK)] });
    s = nextTurn(resolveStack(castBy(s, "ai1", "tw")));
    expect({ turn: s.turn, active: s.activePlayer, extraTurnOf: s.extraTurnOf, skipped: skipsLogged(s) }).toEqual({ turn: 6, active: "ai1", extraTurnOf: "ai1", skipped: [] });
  });

  it("⭐ YOUR extra turn is untouched by your own Trouble in Pairs", () => {
    let s = mainOf("user", { user: [P("tip", TROUBLE, "user"), ...lands("user", ISLAND, 2)] }, { user: [H("tw", TIME_WALK)] });
    s = nextTurn(resolveStack(castBy(s, "user", "tw")));
    expect({ turn: s.turn, active: s.activePlayer, extraTurnOf: s.extraTurnOf, skipped: skipsLogged(s) }).toEqual({ turn: 6, active: "user", extraTurnOf: "user", skipped: [] });
  });

  it("…but an OPPONENT's Trouble in Pairs skips it: ai2 holds one, your Time Walk turn is skipped and ai1 is next", () => {
    let s = mainOf("user", { user: lands("user", ISLAND, 2), ai2: [P("tip2", TROUBLE, "ai2")] }, { user: [H("tw", TIME_WALK)] });
    s = nextTurn(resolveStack(castBy(s, "user", "tw")));
    expect({ turn: s.turn, active: s.activePlayer, skipped: skipsLogged(s) }).toEqual({ turn: 6, active: "ai1", skipped: ["user"] });
  });

  it("the ruling: the skip applies only as the turn would BEGIN — ai1 Disenchants your Trouble in Pairs after its Time Walk resolved, and takes the extra turn", () => {
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user")], ai1: [...lands("ai1", ISLAND, 2), ...lands("ai1", PLAINS, 2)] }, { ai1: [H("tw", TIME_WALK), H("dis", DISENCHANT)] });
    s = resolveStack(castBy(s, "ai1", "tw"));
    s = resolveStack(castBy(s, "ai1", "dis", "tip"));
    s = nextTurn(s);
    expect({ tipGone: !s.players.user.battlefield.some((p) => p.id === "tip"), turn: s.turn, active: s.activePlayer, skipped: skipsLogged(s) })
      .toEqual({ tipGone: true, turn: 6, active: "ai1", skipped: [] });
  });

  it("two extra turns queued by ai1 are both skipped, back to back — the normal rotation follows", () => {
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user")], ai1: lands("ai1", ISLAND, 4) }, { ai1: [H("tw1", TIME_WALK), H("tw2", TIME_WALK)] });
    s = resolveStack(castBy(s, "ai1", "tw1"));
    s = resolveStack(castBy(s, "ai1", "tw2"));
    s = nextTurn(s);
    expect({ turn: s.turn, active: s.activePlayer, left: s.extraTurns, skipped: skipsLogged(s) }).toEqual({ turn: 6, active: "ai2", left: [], skipped: ["ai1", "ai1"] });
  });

  it("⭐ Final Fortune (its ruling: \"If you end up skipping the extra turn that is gained, you do not lose the game\") — skipped with its delayed loss; later, with Trouble in Pairs gone, ai1's next extra turn passes its end step and ai1 is still in the game", () => {
    // Time Walk first, then Final Fortune — Final Fortune's extra turn sits ABOVE Time Walk's on the stack (CR 500.7).
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user")], ai1: [...lands("ai1", ISLAND, 4), ...lands("ai1", MOUNTAIN, 2), ...lands("ai1", PLAINS, 2)] },
      { ai1: [H("tw1", TIME_WALK), H("ff", FINAL_FORTUNE), H("dis", DISENCHANT), H("tw2", TIME_WALK)] });
    s = resolveStack(castBy(s, "ai1", "tw1"));
    s = resolveStack(castBy(s, "ai1", "ff"));
    const scheduled = s.delayedTriggers.map((r) => [r.fireScope, r.extraTurnIndex]);
    s = nextTurn(s);
    const afterSkip = { turn: s.turn, active: s.activePlayer, skipped: skipsLogged(s), records: s.delayedTriggers.length };
    // ai1's next turn (turn 9): its lands untap; Disenchant takes Trouble in Pairs, then Time Walk.
    s = until(s, (x) => x.activePlayer === "ai1" && x.phase === "precombat-main" && x.step === "main");
    s = resolveStack(castBy(s, "ai1", "dis", "tip"));
    s = resolveStack(castBy(s, "ai1", "tw2"));
    s = until(s, (x) => x.turn === 10 && x.step === "cleanup");
    const row = { scheduled, afterSkip, extraTurnTaken: { turn: s.turn, extraTurnOf: s.extraTurnOf }, ai1Lost: !!s.players.ai1?.lostGame };
    console.log("  WITNESS finalFortune", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ scheduled: [["thatTurn", 1]], afterSkip: { turn: 6, active: "ai2", skipped: ["ai1", "ai1"], records: 0 }, extraTurnTaken: { turn: 10, extraTurnOf: "ai1" }, ai1Lost: false });
  });

  it("a skip then a TAKEN extra turn: your Nexus of Fate (cast in ai1's main phase) sits below ai1's Final Fortune — ai1's is skipped with its delayed loss, then you take yours", () => {
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user"), ...lands("user", ISLAND, 7)], ai1: lands("ai1", MOUNTAIN, 2) }, { user: [H("nexus", NEXUS)], ai1: [H("ff", FINAL_FORTUNE)] });
    s = resolveStack(castBy(priorityTo(s, "user"), "user", "nexus"));
    s = resolveStack(castBy(priorityTo(s, "ai1"), "ai1", "ff"));
    const queued = { stack: s.extraTurns.map((e) => e.player), records: s.delayedTriggers.map((r) => [r.controller, r.extraTurnIndex]) };
    s = nextTurn(s);
    expect({ queued, turn: s.turn, active: s.activePlayer, extraTurnOf: s.extraTurnOf, left: s.extraTurns, skipped: skipsLogged(s), records: s.delayedTriggers.length })
      .toEqual({ queued: { stack: ["user", "ai1"], records: [["ai1", 1]] }, turn: 6, active: "user", extraTurnOf: "user", left: [], skipped: ["ai1"], records: 0 });
  });

  it("control: Final Fortune with NO Trouble in Pairs — ai1 takes the turn and loses at its end step", () => {
    let s = mainOf("ai1", { ai1: lands("ai1", MOUNTAIN, 2) }, { ai1: [H("ff", FINAL_FORTUNE)] });
    s = resolveStack(castBy(s, "ai1", "ff"));
    s = until(s, (x) => (x.turn === 6 && x.step === "cleanup") || !!x.players.ai1?.lostGame);
    expect({ turn: s.turn, active: s.activePlayer, ai1Lost: !!s.players.ai1?.lostGame }).toEqual({ turn: 6, active: "ai1", ai1Lost: true });
  });

  it("CR 614.10a — a delayed ability scheduled for \"the next\" occurrence waits for the first turn that isn't skipped: ai1's Ray of Erasure draw arrives at ai2's upkeep", () => {
    let s = mainOf("ai1", { user: [P("tip", TROUBLE, "user")], ai1: lands("ai1", ISLAND, 3) }, { ai1: [H("tw", TIME_WALK), H("ray", RAY)] });
    s = resolveStack(castBy(s, "ai1", "tw"));
    s = resolveStack(castBy(s, "ai1", "ray", "user"));
    const hand0 = handSize(s, "ai1");
    s = until(s, (x) => x.turn === 6 && x.step === "draw");
    expect({ active: s.activePlayer, skipped: skipsLogged(s), ai1Drew: handSize(s, "ai1") - hand0, records: s.delayedTriggers.length })
      .toEqual({ active: "ai2", skipped: ["ai1"], ai1Drew: 1, records: 0 });
  });
});

describe("Everett K. Ross, Hapless Attaché — the neighbour that flips on the same attack arm", () => {
  it("two at you draws one card; split between you and ai2, or one at you and one at your planeswalker, draws none; the commander anthem (+1/+1, lifelink) reaches only your commander creature", () => {
    const board = () => ({ user: [P("ever", EVERETT, "user"), P("cmd", BEARS, "user", { card: { id: "c-cmd", ...BEARS, isCommander: true } }), P("plain", BEARS, "user"),
      P("jace", JACE, "user", { counters: { loyalty: 3 } })], ai1: [P("b1", BEARS, "ai1"), P("b2", BEARS, "ai1")] });
    const s0 = table({ boards: board() });
    const two = declare(s0, [["b1", "user"], ["b2", "user"]]);
    const split = declare(table({ boards: board() }), [["b1", "user"], ["b2", "ai2"]]);
    const walker = declare(table({ boards: board() }), [["b1", "user"], ["b2", "user", "jace"]]);
    const cmd = s0.players.user.battlefield.find((p) => p.id === "cmd");
    const plain = s0.players.user.battlefield.find((p) => p.id === "plain");
    expect({
      two: { fired: two.fired, drawn: handSize(resolveStack(two.s)) - handSize(s0) },
      split: { fired: split.fired }, walker: { fired: walker.fired },
      anthem: { cmd: [creaturePower(cmd, s0), permanentHasKeyword(s0, "cmd", "Lifelink")], plain: [creaturePower(plain, s0), permanentHasKeyword(s0, "plain", "Lifelink")] },
    }).toEqual({ two: { fired: ["Everett K. Ross, Hapless Attaché"], drawn: 1 }, split: { fired: [] }, walker: { fired: [] }, anthem: { cmd: [3, true], plain: [2, false] } });
  });
});
