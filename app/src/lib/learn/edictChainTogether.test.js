/**
 * edictChainTogether.test.js — the permanents one sacrifice instruction's CHOICES settle on leave as ONE event (2026-10-17).
 *
 * removal.advanceSacrificeChain — the one-permanent sacrifice chain every each-player / each-opponent edict, annihilator and a
 * chosen "Sacrifice two lands" rides — sacrificed each pick AS IT WAS MADE. CR 101.4's own example is the opposite: "A card reads
 * 'Each player sacrifices a creature.' First, the active player chooses a creature they control. Then each of the nonactive
 * players, in turn order, chooses a creature they control. Then all creatures chosen this way are sacrificed simultaneously."
 * One event, so CR 603.2c: a "one or more" watcher triggers once and a per-creature watcher once per creature, each victim's
 * look-back read before any of them left (CR 603.10a). Before the fix Innocent Blood fired Great Fierce Bee ("Whenever one or more
 * other creatures die") once per player, and annihilator 2 fired Vengeful Townsfolk twice.
 *
 * The fix generalizes the N-count edict's choose-then-batch to every pool the chain serves: picks are locked in (the forced ones
 * too), the active player chooses first (CR 101.4 — the chain used to ask the spell's controller first), and the chosen permanents
 * go together through sacrificeCreaturesTogether when the instruction's choices are done. Annihilator's separate triggers (CR
 * 702.86b) are separate groups on the one queue, so each trigger is its own event. Found on the way: Planar Engineering with a real
 * choice sacrificed ONE land (its pause queued only the sacrifices after the pick, and the settle dropped one more).
 *
 * The three readers of a sacrifice log entry read the batch's per-victim record (shared.sacrificesByIn): "if you do"
 * (runProgram.realSacrificeIn — the program controller's own victim only), "that creature's power" (sacrificedThisWayPower) and
 * "shares a card type with it" (Braids, Arisen Nightmare's edict). No printed card puts one of those payoffs after a sacrifice that
 * can batch, so their pins pair a real Innocent Blood resolution with the payoff atom.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, oracle-index.json, read in-session 2026-10-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { passPriority, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceUntilDecision, applySacrificeChoice } from "./learnSession.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice, runEffectProgram } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { matchBraidsPunisher } from "./effects/atoms/iteratedEdict.js";
import { parseEffectProgram } from "./effects/parser.js";
import { applyAnnihilatorTriggers } from "./annihilator.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const INNOCENT_BLOOD = {"name":"Innocent Blood","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Each player sacrifices a creature of their choice."};
const DIABOLIC_EDICT = {"name":"Diabolic Edict","type":"Instant","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target player sacrifices a creature of their choice."};
const FLARE_OF_MALICE = {"name":"Flare of Malice","type":"Instant","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"You may sacrifice a nontoken black creature rather than pay this spell's mana cost.\nEach opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control."};
const DICTATE_OF_EREBOS = {"name":"Dictate of Erebos","type":"Enchantment","mana":"{3}{B}{B}","cmc":5,"keywords":["Flash"],"colors":["B"],"oracle":"Flash\nWhenever a creature you control dies, each opponent sacrifices a creature of their choice."};
const SILVERCLAD_FEROCIDONS = {"name":"Silverclad Ferocidons","type":"Creature — Dinosaur","mana":"{5}{R}{R}","cmc":7,"keywords":["Enrage"],"colors":["R"],"oracle":"Enrage — Whenever this creature is dealt damage, each opponent sacrifices a permanent of their choice.","power":"8","toughness":"5"};
const ULAMOGS_CRUSHER = {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","cmc":8,"keywords":["Annihilator"],"colors":[],"oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able.","power":"8","toughness":"8"};
const PLANAR_ENGINEERING = {"name":"Planar Engineering","type":"Sorcery","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"Sacrifice two lands. Search your library for four basic land cards, put them onto the battlefield tapped, then shuffle."};
const BRAIDS = {"name":"Braids, Arisen Nightmare","type":"Legendary Creature — Nightmare","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card.","power":"3","toughness":"3"};
const GREAT_FIERCE_BEE = {"name":"Great Fierce Bee","type":"Creature — Insect","mana":"{2}{B}","cmc":3,"keywords":["Scry","Flying"],"colors":["B"],"oracle":"Flying\nWhenever one or more other creatures die, scry 1. (Look at the top card of your library. You may put that card on the bottom.)","power":"2","toughness":"2"};
const SPECTACLE_OF_DESTRUCTION = {"name":"Spectacle of Destruction","type":"Enchantment","mana":"{1}{B}","cmc":2,"keywords":["Seek"],"colors":["B"],"oracle":"Whenever one or more creatures die, put a wreck counter on this enchantment.\nAt the beginning of your upkeep, if this enchantment has one or more wreck counters on it, remove a wreck counter from it and seek a nonland card."};
const VENGEFUL_TOWNSFOLK = {"name":"Vengeful Townsfolk","type":"Creature — Human Citizen","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Whenever one or more other creatures you control die, put a +1/+1 counter on this creature.","power":"3","toughness":"3"};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const LIVING_PLANE = {"name":"Living Plane","type":"World Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"All lands are 1/1 creatures that are still lands."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

// [id, card] → a permanent `controller` controls, on the battlefield since turn 1.
const place = (controller) => ([id, card]) =>
  ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), enteredOnTurn: 1 });
const library = (seat) => Array.from({ length: 10 }, (_, i) => ({ id: `${seat}-L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }));
const POOL = { W: 0, U: 0, B: 4, R: 1, G: 1, C: 4 };
/** Seats on turn 6, first main phase; `boards` maps each seat to its battlefield, `hands` to its hand. */
function table(base, boards, { hands = {}, active = "user" } = {}) {
  const players = { ...base.players };
  for (const seat of Object.keys(players)) {
    players[seat] = { ...players[seat], battlefield: (boards[seat] || []).map(place(seat)), hand: (hands[seat] || []).map((c, i) => ({ ...c, id: `${seat}-h${i}` })),
      graveyard: [], exile: [], library: library(seat), manaPool: { ...players[seat].manaPool, ...POOL } };
  }
  return { ...base, turn: 6, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const duel = (boards, opts) => table(createGameState({ userDeck: [], aiDeck: [] }), boards, opts);
const pod = (boards, opts) => table(createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), boards, opts);

const triggers = (s) => [...(s.stack || []).filter((o) => o.kind === "triggered-ability"), ...(s.pendingTriggers || [])].map((t) => `${t.controller}:${t.source?.name}`);
const countOf = (list, entry) => list.filter((x) => x === entry).length;
const together = (s) => (s.log || []).filter((e) => e.effect === "sacrifice-together").map((e) => e.sacrificed);
const singles = (s) => (s.log || []).filter((e) => e.effect === "sacrifice" && e.sacrificed != null).map((e) => e.sacrificed);
const bf = (s, seat) => s.players[seat].battlefield.map((p) => p.id);
const gy = (s, seat) => s.players[seat].graveyard.map((c) => c.id);
const crashOf = (s) => (s.log || []).find((e) => e.kind === "stack-resolve-error");

function cast(s, seat, pick) {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && !x.altCost && pick(x));
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
}
/** Settle every sacrifice pick the way the driver does for an AI (its least valuable). */
function autoSettle(s) {
  let n = s;
  for (let g = 0; n.pendingChoice?.kind === "sacrifice-choice" && g < 40; g++) n = resolveSacrificeChoice(n, autoPickSacrificeCandidate(n, n.pendingChoice));
  return n;
}
/** Resolve the stack to empty, settling sacrifice picks automatically. */
function drain(s) {
  let n = s;
  for (let g = 0; (n.stack?.length || n.pendingChoice) && g < 40; g++) {
    if (n.pendingChoice?.kind === "sacrifice-choice") n = autoSettle(n);
    else if (n.pendingChoice) break;
    else n = resolveTopOfStack(n);
  }
  expect(crashOf(n)).toBeUndefined();
  return n;
}
const innocentAtom = () => parseEffectProgram({ type: "Sorcery", oracle: INNOCENT_BLOOD.oracle }).atoms[0];

describe("① an each-player edict — CR 101.4's own example: choose in APNAP order, then sacrifice together", () => {
  it("⭐ Innocent Blood in a pod: every player's creature leaves in ONE event — Great Fierce Bee once, Blood Artist once per creature", () => {
    const s0 = pod({ user: [["bee", GREAT_FIERCE_BEE], ["artist", BLOOD_ARTIST], ["ub", GRIZZLY_BEARS]], ai1: [["a1", GRIZZLY_BEARS]], ai2: [["a2", MEMNITE]] }, { hands: { user: [INNOCENT_BLOOD] } });
    const paused = resolveTopOfStack(cast(s0, "user", (a) => a.cardId === "user-h0"));
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    expect([bf(paused, "ai1"), bf(paused, "ai2")]).toEqual([["a1"], ["a2"]]); // nobody has sacrificed while a choice remains
    const end = resolveSacrificeChoice(paused, "ub");
    expect(end.pendingChoice).toBeFalsy();
    const t = triggers(end);
    expect(countOf(t, "user:Great Fierce Bee")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(3);
    expect(together(end)).toEqual([["ub", "a1", "a2"]]);
    expect(singles(end)).toEqual([]);
    expect([gy(end, "user"), gy(end, "ai1"), gy(end, "ai2")]).toEqual([["c-ub", "user-h0"], ["c-a1"], ["c-a2"]]); // the spell finishes after the batch
  });

  it("⭐ the ACTIVE player chooses first, then turn order — whoever controls the spell — and nothing leaves until the last choice", () => {
    const pair = (seat) => [[`${seat}-b`, GRIZZLY_BEARS], [`${seat}-m`, MEMNITE]];
    let s = resolveAtom(pod({ user: pair("user"), ai1: pair("ai1"), ai2: pair("ai2"), ai3: pair("ai3") }, { active: "ai2" }), innocentAtom(), { controller: "user", targets: [], cardName: "Innocent Blood", sourceId: null });
    const asked = [];
    while (s.pendingChoice?.kind === "sacrifice-choice") {
      asked.push(s.pendingChoice.controller);
      expect(["user", "ai1", "ai2", "ai3"].map((seat) => bf(s, seat).length)).toEqual([2, 2, 2, 2]);
      s = resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, s.pendingChoice));
    }
    expect(asked).toEqual(["ai2", "ai3", "user", "ai1"]);
    expect(together(s)).toEqual([["ai2-m", "ai3-m", "user-m", "ai1-m"]]);
    expect(s.log.filter((e) => e.kind === "sacrifice-chosen").map((e) => e.chosen)).toEqual(["ai2-m", "ai3-m", "user-m", "ai1-m"]); // CR 101.4b
  });

  it("⭐ a person is still asked for their victim: the AI's pick is locked in but not carried out, then the batch and the spell's own finish follow the answer", () => {
    const s0 = duel({ user: [["u1", GRIZZLY_BEARS], ["u2", MEMNITE]], ai: [["a1", GRIZZLY_BEARS], ["a2", MEMNITE]] }, { hands: { ai: [INNOCENT_BLOOD] }, active: "ai" });
    const paused = resolveTopOfStack(cast(s0, "ai", (a) => a.cardId === "ai-h0"));
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai" }); // the active player chooses first
    const sess = { id: "s", status: "active", difficulty: "beginner", state: paused, decisionLog: [] };
    const { session, decision } = advanceUntilDecision(sess);
    expect(decision.kind).toBe("sacrifice-choice");
    expect(decision.controller).toBe("user");
    expect(decision.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2"]);
    expect(bf(session.state, "ai")).toEqual(["a1", "a2"]); // the AI chose its Memnite — still on the battlefield
    expect(session.state.pendingChoice.chosen).toEqual([{ playerId: "ai", permId: "a2", group: undefined }]);
    const after = applySacrificeChoice(session, { cardId: "u1" }).session.state;
    expect(together(after)).toEqual([["a2", "u1"]]);
    expect(singles(after)).toEqual([]);
    expect(gy(after, "user")).toContain("c-u1");
    expect(gy(after, "ai")).toEqual(expect.arrayContaining(["c-a2", "ai-h0"])); // the resumed program finished the spell after the batch
  });
});

describe("② annihilator N — the defender's N permanents leave as one event per trigger (CR 702.86a/b)", () => {
  const atDeclareAttackers = (boards, attackers) => ({ ...duel(boards), phase: "combat", step: "declare-attackers", combat: { attackers, blockers: [] } });
  const attack = (permanentId, attackingPlayer = "user", defender = "ai") => ({ permanentId, attackingPlayer, defender });

  it("⭐ Ulamog's Crusher: the defender's two permanents go together — Vengeful Townsfolk ONCE, Blood Artist twice", () => {
    let s = atDeclareAttackers({ user: [["crusher", ULAMOGS_CRUSHER]], ai: [["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST], ["m1", MEMNITE], ["m2", MEMNITE]] }, [attack("crusher")]);
    s = passPriority(s); // the pass closes the declaration: the annihilator hook
    expect(s.pendingChoice?.kind).toBe("sacrifice-choice");
    s = autoSettle(s);
    expect(bf(s, "ai")).toEqual(["towns", "artist"]);
    const t = triggers(s);
    expect(countOf(t, "ai:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "ai:Blood Artist")).toBe(2);
    expect(together(s)).toEqual([["m1", "m2"]]);
  });

  it("⭐ two Ulamog's Crushers are two triggers: each trigger's two permanents together, the triggers apart — Townsfolk twice, not four times", () => {
    let s = atDeclareAttackers({ user: [["c1", ULAMOGS_CRUSHER], ["c2", ULAMOGS_CRUSHER]], ai: [["towns", VENGEFUL_TOWNSFOLK], ["m1", MEMNITE], ["m2", MEMNITE], ["m3", MEMNITE], ["m4", MEMNITE]] }, [attack("c1"), attack("c2")]);
    s = autoSettle(passPriority(s));
    expect(bf(s, "ai")).toEqual(["towns"]);
    expect(countOf(triggers(s), "ai:Vengeful Townsfolk")).toBe(2);
    expect(together(s)).toEqual([["m1", "m2"], ["m3", "m4"]]);
  });

  it("⭐ a human defender is asked for each permanent, and nothing leaves until both are chosen", () => {
    let s = { ...duel({ ai: [["crusher", ULAMOGS_CRUSHER]], user: [["u1", GRIZZLY_BEARS], ["u2", MEMNITE], ["u3", FOREST]] }, { active: "ai" }), phase: "combat", step: "declare-attackers",
      combat: { attackers: [attack("crusher", "ai", "user")], blockers: [] } };
    s = applyAnnihilatorTriggers(s);
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["u1", "u2", "u3"]);
    s = resolveSacrificeChoice(s, "u1");
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["u2", "u3"]); // the first pick is out of the pool …
    expect(bf(s, "user")).toEqual(["u1", "u2", "u3"]);                        // … but still on the battlefield
    s = resolveSacrificeChoice(s, "u3");
    expect(s.pendingChoice).toBeFalsy();
    expect(bf(s, "user")).toEqual(["u2"]);
    expect(together(s)).toEqual([["u1", "u3"]]);
  });

  it("control: a defender with one permanent loses it alone — the single sacrifice, no batch", () => {
    const s = autoSettle(passPriority(atDeclareAttackers({ user: [["crusher", ULAMOGS_CRUSHER]], ai: [["m1", MEMNITE]] }, [attack("crusher")])));
    expect(singles(s)).toEqual(["m1"]);
    expect(together(s)).toEqual([]);
  });
});

describe("③ each-opponent edicts — the opponents' victims leave together", () => {
  it("⭐ Flare of Malice: each opponent's greatest-mana-value creature, chosen first and sacrificed together — Bee once; a tie is still a choice", () => {
    const s0 = pod({ user: [["bee", GREAT_FIERCE_BEE]], ai1: [["a1b", GRIZZLY_BEARS], ["a1m", MEMNITE]], ai2: [["a2a", BLOOD_ARTIST], ["a2t", VENGEFUL_TOWNSFOLK]], ai3: [["a3x", GRIZZLY_BEARS], ["a3y", GRIZZLY_BEARS]] },
      { hands: { user: [FLARE_OF_MALICE] } });
    const paused = resolveTopOfStack(cast(s0, "user", (a) => a.cardId === "user-h0"));
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai3" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["a3x", "a3y"]);
    expect([bf(paused, "ai1"), bf(paused, "ai2")]).toEqual([["a1b", "a1m"], ["a2a", "a2t"]]); // the forced picks wait for ai3
    const end = autoSettle(paused);
    expect(together(end)).toEqual([["a1b", "a2t", "a3x"]]);
    const t = triggers(end);
    expect(countOf(t, "user:Great Fierce Bee")).toBe(1);
    expect(countOf(t, "ai2:Blood Artist")).toBe(3);
  });

  it("⭐ Dictate of Erebos: the opponents' creatures go as one event — Spectacle of Destruction gets one counter for the Bears, one for the edict", () => {
    const s0 = pod({ user: [["dictate", DICTATE_OF_EREBOS], ["ub", GRIZZLY_BEARS]], ai1: [["spectacle", SPECTACLE_OF_DESTRUCTION], ["m1", MEMNITE]], ai2: [["m2", MEMNITE]], ai3: [["m3", MEMNITE]] },
      { hands: { user: [LIGHTNING_BOLT] } });
    const end = drain(cast(s0, "user", (a) => a.cardId === "user-h0" && a.targets?.[0]?.id === "ub"));
    expect(["ai1", "ai2", "ai3"].map((seat) => bf(end, seat))).toEqual([["spectacle"], [], []]);
    expect(together(end)).toEqual([["m1", "m2", "m3"]]);
    expect(end.players.ai1.battlefield[0].counters?.wreck).toBe(2);
  });

  it("⭐ Silverclad Ferocidons (a permanent of their choice): a creature and a land from three opponents, one event — Bee once", () => {
    const s0 = pod({ user: [["fero", SILVERCLAD_FEROCIDONS], ["bee", GREAT_FIERCE_BEE]], ai1: [["m1", MEMNITE]], ai2: [["m2", MEMNITE]], ai3: [["f3", FOREST]] }, { hands: { user: [LIGHTNING_BOLT] } });
    let s = cast(s0, "user", (a) => a.cardId === "user-h0" && a.targets?.[0]?.id === "fero");
    s = resolveTopOfStack(s); // the Bolt: enrage triggers
    expect(countOf(triggers(s), "user:Silverclad Ferocidons")).toBe(1);
    while (s.stack.some((o) => o.source?.name === "Silverclad Ferocidons")) s = resolveTopOfStack(s);
    expect(together(s)).toEqual([["m1", "m2", "f3"]]);
    expect(countOf(triggers(s), "user:Great Fierce Bee")).toBe(1);
  });
});

describe("④ Planar Engineering — a chosen \"Sacrifice two lands\"", () => {
  it("⭐ with five lands BOTH chosen lands go (it used to take one), together — under Living Plane, Townsfolk once and Blood Artist twice — then the search", () => {
    const forests = ["f1", "f2", "f3", "f4", "f5"].map((id) => [id, FOREST]);
    const s0 = duel({ user: [["plane", LIVING_PLANE], ["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST], ...forests] }, { hands: { user: [PLANAR_ENGINEERING] } });
    let s = resolveTopOfStack(cast(s0, "user", (a) => a.cardId === "user-h0"));
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    s = resolveSacrificeChoice(s, "f1");
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" }); // the second land is asked for
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["f2", "f3", "f4", "f5"]);
    expect(bf(s, "user")).toContain("f1");
    s = resolveSacrificeChoice(s, "f2");
    expect(gy(s, "user")).toEqual(["c-f1", "c-f2"]);
    expect(together(s)).toEqual([["f1", "f2"]]);
    const t = triggers(s);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
    expect(s.pendingChoice?.kind).toBe("tutor-search"); // the program resumed into the search
  });
});

describe("⑤ the readers of a sacrifice log entry read the batch — the controller's own victim", () => {
  const blood = (user, ai) => drain(cast(duel({ user, ai }, { hands: { user: [INNOCENT_BLOOD] } }), "user", (a) => a.cardId === "user-h0"));

  it("⭐ \"that creature's power\" (sacrificedThisWayPower) is the power of the creature YOU sacrificed in the batch, never the newest victim", () => {
    const after = blood([["ub", GRIZZLY_BEARS]], [["at", VENGEFUL_TOWNSFOLK]]);
    expect(together(after)).toEqual([["ub", "at"]]);
    expect(countForSpec(after, { controller: "user" }, { kind: "sacrificedThisWayPower" })).toBe(2);
    expect(countForSpec(after, { controller: "ai" }, { kind: "sacrificedThisWayPower" })).toBe(3);
  });

  it("pin: Braids's \"shares a card type with it\" reads the card types of the permanent you sacrificed in the batch", () => {
    const after = blood([["um", MEMNITE]], [["ab", GRIZZLY_BEARS]]);
    const edict = matchBraidsPunisher(BRAIDS.oracle.replace(/^At the beginning of your end step, /, "")).atoms[1]; // the trigger's effect
    const out = resolveAtom(after, edict, { controller: "user", targets: [], cardName: BRAIDS.name, sourceId: null });
    expect(out.log.filter((e) => e.effect === "edict-shares-type").map((e) => e.types)).toEqual([["Artifact", "Creature"]]);
  });

  it("⭐ \"if you do\" after a batch is YOUR sacrifice: you gain the life when your creature went, not when only an opponent's did", () => {
    const gain = { ...parseEffectProgram({ type: "Sorcery", oracle: "You gain 2 life." }).atoms[0], ifSacrificed: true };
    const run = (user, ai) => {
      const s = duel({ user, ai });
      const program = { atoms: [innocentAtom(), gain], confidence: "high" };
      const stk = { id: "stk-ib", kind: "spell", source: { name: INNOCENT_BLOOD.name, oracle: INNOCENT_BLOOD.oracle }, controller: "user", targets: [], cost: null,
        payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [] } } };
      return { before: s.players.user.life, after: autoSettle(runEffectProgram(s, stk)) };
    };
    const mine = run([["ub", GRIZZLY_BEARS]], [["ab", GRIZZLY_BEARS]]);
    expect(together(mine.after)).toEqual([["ub", "ab"]]);
    expect(mine.after.players.user.life).toBe(mine.before + 2);
    const theirsOnly = run([], [["ab", GRIZZLY_BEARS]]);
    expect(singles(theirsOnly.after)).toEqual(["ab"]);
    expect(theirsOnly.after.players.user.life).toBe(theirsOnly.before); // only the opponent sacrificed — "you" didn't
  });
});

describe("⑥ controls — one victim is the single sacrifice, unchanged", () => {
  it("Diabolic Edict: the target's one victim is a single sacrifice — Bee once", () => {
    const s0 = duel({ user: [["bee", GREAT_FIERCE_BEE]], ai: [["ab", GRIZZLY_BEARS], ["am", MEMNITE]] }, { hands: { user: [DIABOLIC_EDICT] } });
    const end = drain(cast(s0, "user", (a) => a.cardId === "user-h0" && a.targets?.[0]?.id === "ai"));
    expect(singles(end)).toEqual(["am"]);
    expect(together(end)).toEqual([]);
    expect(countOf(triggers(end), "user:Great Fierce Bee")).toBe(1);
  });

  it("Innocent Blood with one creature on the table: the single sacrifice — Spectacle of Destruction once", () => {
    const s0 = duel({ user: [["spectacle", SPECTACLE_OF_DESTRUCTION]], ai: [["ab", GRIZZLY_BEARS]] }, { hands: { user: [INNOCENT_BLOOD] } });
    const end = resolveTopOfStack(cast(s0, "user", (a) => a.cardId === "user-h0"));
    expect(singles(end)).toEqual(["ab"]);
    expect(together(end)).toEqual([]);
    expect(countOf(triggers(end), "user:Spectacle of Destruction")).toBe(1);
  });
});
