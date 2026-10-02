/**
 * ATTACK-TRIGGER TIMING and REMOVAL FROM COMBAT — a fix slice (two combat-legality bugs), every case driven through the
 * engine's own entry points (legalActionsForPlayer → dispatchAction → passPriority / resolveTopOfStack / nextStep).
 *
 * 1. Attack triggers resolve in the declare attackers step, before any blocker is declared.
 *    CR 508.1 — "First, the active player declares attackers. This turn-based action doesn't use the stack."
 *    CR 508.1m — "Any abilities that trigger on attackers being declared trigger."
 *    CR 508.2 — "Second, the active player gets priority."  CR 117.5 — triggered abilities go on the stack first.
 *    CR 509.1 — "First, the defending player declares blockers. This turn-based action doesn't use the stack."
 *    The engine used to fire checkAttackTriggers and the two synchronous attack hooks (The Ur-Dragon, annihilator —
 *    CR 702.86a) at the ENTRY of the declare-blockers step, so the defending player could declare a block while the
 *    triggers were still on the stack: a block by a creature a pending "target creature can't block this turn" forbids
 *    (an illegal block), and a block decision made before an attack trigger's attacking tokens existed. Now the
 *    declaration closes at the first action of the declare attackers step that is not an attacker declaration (the
 *    active player's pass, a spell, an ability), the triggers fire and go on the stack there, and the step HOLDS with
 *    priority until the stack is empty and every player passes (CR 500.2). No attacker is declared after it (CR 508.1).
 *    CR 508.8 — the declare blockers and combat damage steps are skipped only when no creature was declared as an
 *    attacker (or put onto the battlefield attacking): a declared attacker removed from combat leaves them in place.
 *
 * 2. A permanent removed from combat stops being an attacking or blocking creature (CR 506.4 — it leaves the
 *    battlefield, its controller changes, it phases out, it regenerates (CR 701.19a), …). An attacker removed from
 *    combat loses its record in state.combat.attackers, so no block is offered against it and it deals no combat
 *    damage. A removed BLOCKER keeps its block records: the creature it blocked remains blocked (CR 509.1h) and assigns
 *    no combat damage with no creature blocking it (CR 510.1c); the removed blocker deals and is dealt none, and is no
 *    longer a "blocking creature" for any effect.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-02; the trailing comment is
 * the tier at generation). Per-test instance ids only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseAnnihilator } from "./annihilator.js";
import { parseUrDragonAttackTrigger } from "./urDragonAttack.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, nextStep } from "./gameEngine.js";
import { resolveSacrificeChoice } from "./effects/runProgram.js";
import { advanceUntilDecision, applyChoice } from "./learnSession.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const MARDU_ROUGHRIDER = {"name":"Mardu Roughrider","type":"Creature — Orc Warrior","mana":"{2}{R}{W}{B}","cmc":5,"power":"5","toughness":"4","keywords":[],"colors":["B","R","W"],"oracle":"Whenever this creature attacks, target creature can't block this turn."}; // native-trigger
const LEONIN_WARLEADER = {"name":"Leonin Warleader","type":"Creature — Cat Soldier","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","keywords":[],"colors":["W"],"oracle":"Whenever this creature attacks, create two 1/1 white Cat creature tokens with lifelink that are tapped and attacking."}; // native-trigger
const ULAMOGS_CRUSHER = {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","cmc":8,"power":"8","toughness":"8","keywords":["Annihilator"],"colors":[],"oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able."}; // native-trigger
const THE_UR_DRAGON = {"name":"The Ur-Dragon","type":"Legendary Creature — Dragon Avatar","mana":"{4}{W}{U}{B}{R}{G}","cmc":9,"power":"10","toughness":"10","keywords":["Flying","Eminence"],"colors":["B","G","R","U","W"],"oracle":"Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield."}; // native-mixed
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const RESTLESS_DEAD = {"name":"Restless Dead","type":"Creature — Skeleton","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":["Regenerate"],"colors":["B"],"oracle":"{B}: Regenerate this creature."}; // native-activated
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const TURN_AGAINST = {"name":"Turn Against","type":"Instant","mana":"{4}{R}","cmc":5,"keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nGain control of target creature until end of turn. Untap that creature. It gains haste until end of turn."}; // native-spell
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const DIVINE_VERDICT = {"name":"Divine Verdict","type":"Instant","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Destroy target attacking or blocking creature."}; // native-spell
const RALLY = {"name":"Rally","type":"Instant","mana":"{W}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Blocking creatures get +1/+1 until end of turn."}; // native-spell
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i}`, card, controller));
const inHand = (id, card) => ({ id, ...card });

/**
 * A two-seat game on the user's turn (the user is the active player and holds priority), by default at the beginning of
 * combat step with an empty combat record. `library` gives each seat that many Forests in the library.
 */
function table({ user = [], ai = [], userHand = [], aiHand = [], library = 0, phase = "combat", step = "beginning-of-combat" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (p) => Array.from({ length: library }, (_, i) => ({ id: `${p}-lib-${i}`, ...FOREST }));
  return {
    ...s0, turn: 5, phase, step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: userHand, library: lib("u") },
      ai: { ...s0.players.ai, battlefield: ai, hand: aiHand, library: lib("a") },
    },
  };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
/** Dispatch the first OFFERED action of `kind` for `pid` that satisfies `pred`; throws when none is offered. */
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
const cast = (s, pid, name, targetId = null) =>
  act(s, pid, "cast-spell", (a) => a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
const attackWith = (s, ...ids) => ids.reduce((cur, id) => act(cur, "user", "declare-attacker", (a) => a.permanentId === id), s);
/** Pass until `step` is entered (the stack resolves on the way); throws if it never comes. */
function passTo(s, step) {
  let cur = s;
  for (let g = 0; g < 60; g++) {
    if (cur.step === step) return cur;
    cur = pass(cur);
  }
  throw new Error(`never reached ${step}`);
}
/** Pass until the stack is empty, staying in the current step (every resolution hands priority back to the active player). */
function resolveStack(s) {
  let cur = s;
  for (let g = 0; g < 40 && cur.stack.length; g++) cur = pass(cur);
  return cur;
}
const stackRow = (s) => s.stack.map((o) => `${o.kind}:${o.source?.name ?? o.source}`);
const attackerIds = (s) => (s.combat?.attackers || []).map((a) => a.permanentId);
/** The FIRST state in which the defending player is offered any declare-blocker action — its step, its stack, the blocks. */
function firstBlockOffer(s) {
  let cur = s;
  for (let g = 0; g < 60; g++) {
    const blocks = offered(cur, "ai", "declare-blocker");
    if (blocks.length) return { step: cur.step, stack: stackRow(cur), blocks: blocks.map((a) => `${a.permanentId}>${a.attackerId}`).sort() };
    if (cur.phase !== "combat") return null;
    cur = pass(cur);
  }
  throw new Error("no block offer and no combat end");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the cards — each classifies native and parses to the shape the timing cases rely on", () => {
  it("⭐ the attack-trigger carriers and the instants the removal cases cast", () => {
    const row = Object.fromEntries([MARDU_ROUGHRIDER, LEONIN_WARLEADER, ULAMOGS_CRUSHER, THE_UR_DRAGON, GRIZZLY_BEARS, RESTLESS_DEAD,
      MURDER, TURN_AGAINST, GIANT_GROWTH, DIVINE_VERDICT, RALLY].map((c) => [c.name, classifyCard(c)]));
    console.log("  WITNESS attackTimingTiers", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      "Mardu Roughrider": "native-trigger", "Leonin Warleader": "native-trigger", "Ulamog's Crusher": "native-trigger",
      "The Ur-Dragon": "native-mixed", "Grizzly Bears": "native-body", "Restless Dead": "native-activated",
      "Murder": "native-spell", "Turn Against": "native-spell", "Giant Growth": "native-spell", "Divine Verdict": "native-spell",
      "Rally": "native-spell",
    });
  });

  it("the attack triggers: a self 'attacks' trigger each for Roughrider and Warleader (routes native), the annihilator and Ur-Dragon hooks' parses", () => {
    const trig = (c) => detectTriggers(c).map((t) => {
      const p = parseEffectClause(t.effectClause, "Instant");
      return { event: t.event, scope: t.scope, routes: triggerRoutesNatively(t), conf: programConfidence(p), ops: p.atoms.map((a) => a.op) };
    });
    expect({ roughrider: trig(MARDU_ROUGHRIDER), warleader: trig(LEONIN_WARLEADER), annihilator: parseAnnihilator(ULAMOGS_CRUSHER), urDragon: parseUrDragonAttackTrigger(THE_UR_DRAGON) })
      .toEqual({
        roughrider: [{ event: "attacks", scope: "self", routes: true, conf: "high", ops: ["cant-block"] }],
        warleader: [{ event: "attacks", scope: "self", routes: true, conf: "high", ops: ["create-token"] }],
        annihilator: { n: 2 },
        urDragon: { subtype: "dragon" },
      });
    expect(parseEffectClause(detectTriggers(LEONIN_WARLEADER)[0].effectClause, "Instant").atoms[0]).toMatchObject({ count: 2, tapped: true, entersAttacking: true });
  });

  it("the instants: Turn Against is a gain-control; Divine Verdict's target carries the attacking-or-blocking restriction; Rally pumps the blocking creatures; Restless Dead regenerates", () => {
    const ops = (c) => parseEffectProgram(c).atoms.map((a) => a.op);
    expect({
      turnAgainst: ops(TURN_AGAINST), murder: ops(MURDER), giantGrowth: ops(GIANT_GROWTH),
      verdict: parseEffectProgram(DIVINE_VERDICT).atoms[0].restrictions, rally: parseEffectProgram(RALLY).atoms[0].scope,
      regen: parseActivatedAbilities(RESTLESS_DEAD).map((a) => ({ modeled: a.modeled, ops: a.program.atoms.map((x) => x.op) })),
    }).toEqual({
      turnAgainst: ["gain-control", "untap", "pump"], murder: ["destroy"], giantGrowth: ["pump"],
      verdict: [{ kind: "combat", value: "either" }], rally: "blockingCreatures",
      regen: [{ modeled: true, ops: ["regenerate"] }],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("BUG 1 — attack triggers fire when the declaration closes, in the declare attackers step, and resolve before blocks (CR 508.1m, 508.2, 509.1)", () => {
  const roughriderTable = (extra = {}) => table({ user: [P("rr", MARDU_ROUGHRIDER, "user")], ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai")], ...extra });

  it("⭐ the active player's pass closes the declaration: Roughrider's trigger goes on the stack and the declare attackers step HOLDS with the active player's priority", () => {
    const declared = attackWith(passTo(roughriderTable(), "declare-attackers"), "rr");
    const closed = pass(declared);
    const row = { step: closed.step, holder: closed.priorityHolder, passes: closed.consecutivePasses, stack: stackRow(closed),
      target: closed.stack[0]?.targets?.map((t) => t.id), declaredCount: closed.combat.declaredAttackerCount };
    console.log("  WITNESS attackTimingClose", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "declare-attackers", holder: "user", passes: 0, stack: ["triggered-ability:Mardu Roughrider"], target: ["gb1"], declaredCount: 1 });
    // The defending player has no declare-blocker action while the trigger is on the stack: the step is still declare attackers.
    expect(offered(pass(closed), "ai", "declare-blocker")).toEqual([]);
  });

  it("⭐ the illegal block is gone: the defender's FIRST block offer comes in declare blockers with an empty stack, and the creature the trigger targeted is not offered", () => {
    const declared = attackWith(passTo(roughriderTable(), "declare-attackers"), "rr");
    const row = firstBlockOffer(declared);
    console.log("  WITNESS attackTimingFirstBlockOffer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "declare-blockers", stack: [], blocks: ["gb2>rr"] });
  });

  it("the trigger RESOLVES in the declare attackers step; the step ends only after a full lap of passes on an empty stack (CR 500.2), and fires nothing again in declare blockers", () => {
    const closed = pass(attackWith(passTo(roughriderTable(), "declare-attackers"), "rr"));
    const resolved = resolveStack(closed);
    expect({ step: resolved.step, stack: resolved.stack.length, holder: resolved.priorityHolder }).toEqual({ step: "declare-attackers", stack: 0, holder: "user" });
    const userPassed = pass(resolved);
    expect({ step: userPassed.step, holder: userPassed.priorityHolder }).toEqual({ step: "declare-attackers", holder: "ai" });
    const blockers = pass(userPassed);
    expect({ step: blockers.step, stack: blockers.stack.length, holder: blockers.priorityHolder }).toEqual({ step: "declare-blockers", stack: 0, holder: "user" });
    const resolutions = blockers.log.filter((e) => e.kind === "spell-effect" && e.effect === "cant-block");
    expect(resolutions.length).toBe(1);
  });

  it("CR 508.1 — no attacker is declared after the declaration closes: Grizzly Bears is not offered once the trigger is stacked, nor after it resolves", () => {
    const s = passTo(roughriderTable({ user: [P("rr", MARDU_ROUGHRIDER, "user"), P("gbu", GRIZZLY_BEARS, "user")] }), "declare-attackers");
    expect(offered(s, "user", "declare-attacker").map((a) => a.permanentId)).toEqual(["rr", "gbu"]);
    const closed = pass(attackWith(s, "rr"));
    expect(offered(closed, "user", "declare-attacker")).toEqual([]);
    expect(offered(resolveStack(closed), "user", "declare-attacker")).toEqual([]);
  });

  it("CR 508.1 — with no attack trigger the pass stands (priority passes to the defender), and the declaration is still closed", () => {
    const s = attackWith(passTo(table({ user: [P("gbu1", GRIZZLY_BEARS, "user"), P("gbu2", GRIZZLY_BEARS, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "gbu1");
    const passed = pass(s);
    expect({ step: passed.step, holder: passed.priorityHolder, passes: passed.consecutivePasses, stack: passed.stack.length, declared: passed.combat.declaredAttackerCount })
      .toEqual({ step: "declare-attackers", holder: "ai", passes: 1, stack: 0, declared: 1 });
    expect(offered(passed, "user", "declare-attacker")).toEqual([]);
    expect(pass(passed).step).toBe("declare-blockers");
  });

  it("CR 508.8 — no attacker declared: the pass stands and the declare blockers and combat damage steps are skipped", () => {
    const s = passTo(table({ user: [P("gbu", GRIZZLY_BEARS, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers");
    const passed = pass(s);
    expect({ holder: passed.priorityHolder, declared: passed.combat.declaredAttackerCount }).toEqual({ holder: "ai", declared: 0 });
    expect(pass(passed).step).toBe("end-of-combat");
  });

  it("⭐ Leonin Warleader — the attacking Cat tokens exist before blocks: the defender's first block offer already names both", () => {
    const declared = attackWith(passTo(table({ user: [P("lw", LEONIN_WARLEADER, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "lw");
    const closed = pass(declared);
    expect({ step: closed.step, stack: stackRow(closed) }).toEqual({ step: "declare-attackers", stack: ["triggered-ability:Leonin Warleader"] });
    const resolved = resolveStack(closed);
    const cats = resolved.players.user.battlefield.filter((p) => p.card?.token).map((p) => p.id);
    expect({ step: resolved.step, cats: cats.length, attacking: attackerIds(resolved), tapped: cats.map((id) => findPermanent(resolved, id).permanent.tapped) })
      .toEqual({ step: "declare-attackers", cats: 2, attacking: ["lw", ...cats], tapped: [true, true] });
    const row = firstBlockOffer(declared);
    console.log("  WITNESS attackTimingWarleader", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "declare-blockers", stack: [], blocks: [`gb>${cats[0]}`, `gb>${cats[1]}`, "gb>lw"].sort() });
  });

  it("⭐ annihilator (CR 702.86a) — Ulamog's Crusher's sacrifice happens in the declare attackers step; the step holds for the active player", () => {
    const declared = attackWith(passTo(table({ user: [P("uc", ULAMOGS_CRUSHER, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "uc");
    const closed = pass(declared);
    const row = { step: closed.step, holder: closed.priorityHolder, passes: closed.consecutivePasses, aiBattlefield: closed.players.ai.battlefield.map((p) => p.id),
      aiGraveyard: closed.players.ai.graveyard.map((c) => c.name) };
    console.log("  WITNESS attackTimingAnnihilator", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "declare-attackers", holder: "user", passes: 0, aiBattlefield: [], aiGraveyard: ["Grizzly Bears"] });
    expect(firstBlockOffer(closed)).toBe(null); // nothing left to block with, and combat ends
  });

  it("annihilator with a real choice: the defender's sacrifice choice is raised in the declare attackers step, and settling it leaves the active player holding priority there", () => {
    const declared = attackWith(passTo(table({ user: [P("uc", ULAMOGS_CRUSHER, "user")], ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("sw", SWAMP, "ai")] }), "declare-attackers"), "uc");
    const closed = pass(declared);
    expect({ step: closed.step, choice: closed.pendingChoice?.kind, chooser: closed.pendingChoice?.controller }).toEqual({ step: "declare-attackers", choice: "sacrifice-choice", chooser: "ai" });
    let s = closed;
    for (let g = 0; g < 4 && s.pendingChoice; g++) s = resolveSacrificeChoice(s, s.pendingChoice.candidates[0].id);
    s = finalizeStackResolution(s);
    expect({ step: s.step, holder: s.priorityHolder, left: s.players.ai.battlefield.length }).toEqual({ step: "declare-attackers", holder: "user", left: 1 });
  });

  it("The Ur-Dragon — the draw and the put-onto-the-battlefield happen in the declare attackers step, before blocks", () => {
    const declared = attackWith(passTo(table({ user: [P("ud", THE_UR_DRAGON, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")], library: 3 }), "declare-attackers"), "ud");
    const closed = pass(declared);
    expect({ step: closed.step, holder: closed.priorityHolder, library: closed.players.user.library.length, cheated: closed.players.user.battlefield.map((p) => p.card.name) })
      .toEqual({ step: "declare-attackers", holder: "user", library: 2, cheated: ["The Ur-Dragon", "Forest"] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("BUG 1 — every path that ends the declaration closes it once (dispatchAction, passPriority, nextStep, the session driver)", () => {
  it("⭐ a SPELL during the open declaration closes it first: Roughrider's trigger goes on the stack, then Giant Growth on top of it (CR 508.2, 117.3c)", () => {
    const s = attackWith(passTo(table({ user: [P("rr", MARDU_ROUGHRIDER, "user"), P("f", FOREST, "user")], userHand: [inHand("h-gg", GIANT_GROWTH)], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "rr");
    const grown = cast(s, "user", "Giant Growth", "rr");
    expect({ step: grown.step, stack: stackRow(grown), holder: grown.priorityHolder, declared: grown.combat.declaredAttackerCount })
      .toEqual({ step: "declare-attackers", stack: ["triggered-ability:Mardu Roughrider", "spell:Giant Growth"], holder: "user", declared: 1 });
  });

  it("a spell whose close RESOLVES an attack hook first is not cast on the moved board: the sacrifice happens, the active player decides again, and the second cast goes through", () => {
    const s = attackWith(passTo(table({ user: [P("uc", ULAMOGS_CRUSHER, "user"), P("f", FOREST, "user")], userHand: [inHand("h-gg", GIANT_GROWTH)], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "uc");
    const first = cast(s, "user", "Giant Growth", "uc");
    expect({ step: first.step, holder: first.priorityHolder, stack: first.stack.length, hand: first.players.user.hand.map((c) => c.id), forestTapped: findPermanent(first, "f").permanent.tapped, ai: first.players.ai.battlefield.length })
      .toEqual({ step: "declare-attackers", holder: "user", stack: 0, hand: ["h-gg"], forestTapped: false, ai: 0 });
    const second = cast(first, "user", "Giant Growth", "uc");
    expect(stackRow(second)).toEqual(["spell:Giant Growth"]);
  });

  it("nextStep (the session's no-priority advance) closes an open declaration and holds when something triggered", () => {
    const s = attackWith(passTo(table({ user: [P("rr", MARDU_ROUGHRIDER, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "rr");
    const advanced = nextStep({ ...s, priorityHolder: null, consecutivePasses: 0 });
    expect({ step: advanced.step, holder: advanced.priorityHolder, stack: stackRow(advanced) }).toEqual({ step: "declare-attackers", holder: "user", stack: ["triggered-ability:Mardu Roughrider"] });
  });

  it("nextStep with nothing triggered closes the declaration and enters declare blockers", () => {
    const s = attackWith(passTo(table({ user: [P("gbu", GRIZZLY_BEARS, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "declare-attackers"), "gbu");
    const advanced = nextStep({ ...s, priorityHolder: null, consecutivePasses: 0 });
    expect({ step: advanced.step, declared: advanced.combat.declaredAttackerCount, stack: advanced.stack.length }).toEqual({ step: "declare-blockers", declared: 1, stack: 0 });
  });

  it("⭐ END TO END through the session driver: the AI attacks with Mardu Roughrider; the human defender's block decision comes after the trigger resolved, without the targeted creature, and the trigger resolved once", () => {
    const s0 = {
      ...table({ ai: [P("rr", MARDU_ROUGHRIDER, "ai")], user: [P("gb", GRIZZLY_BEARS, "user"), P("gb2", GRIZZLY_BEARS, "user")] }),
      activePlayer: "ai", priorityHolder: "ai",
    };
    const { decision, session } = advanceUntilDecision({ status: "active", state: s0, difficulty: "beginner", decisionLog: [] });
    const blocks = (decision.options || []).filter((a) => a.kind === "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`);
    const cantBlock = session.state.log.filter((e) => e.kind === "spell-effect" && e.effect === "cant-block");
    const firstBlockersStep = session.state.log.findIndex((e) => e.kind === "step" && e.step === "declare-blockers");
    const row = { kind: decision.kind, step: session.state.step, stack: session.state.stack.length, blocks, cantBlock: cantBlock.length,
      resolvedBeforeBlockers: cantBlock.every((e) => session.state.log.indexOf(e) < firstBlockersStep) };
    console.log("  WITNESS attackTimingSession", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ kind: "ask", step: "declare-blockers", stack: 0, blocks: ["gb2>rr"], cantBlock: 1, resolvedBeforeBlockers: true });
  });

  it("END TO END through the session driver, the human attacking: the human's declaration and pass go through applyChoice; the trigger resolves once, before the declare blockers step, and the targeted creature never blocks", () => {
    const s0 = { ...table({ user: [P("rr", MARDU_ROUGHRIDER, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai")] }), step: "declare-attackers" };
    let { session, decision } = advanceUntilDecision({ status: "active", state: s0, difficulty: "beginner", decisionLog: [] });
    expect(decision.kind).toBe("ask");
    ({ session } = applyChoice(session, decision.options.find((a) => a.kind === "declare-attacker" && a.permanentId === "rr")));
    const log = session.state.log.filter((e) => e.turn === 5);
    const cantBlock = log.filter((e) => e.kind === "spell-effect" && e.effect === "cant-block");
    const blockersStep = log.findIndex((e) => e.kind === "step" && e.step === "declare-blockers");
    const blocks = log.filter((e) => e.kind === "block-declared").map((e) => e.blockerId);
    const row = { cantBlock: cantBlock.map((e) => e.targets), beforeBlockers: blockersStep > -1 && cantBlock.every((e) => log.indexOf(e) < blockersStep),
      targetedBlocked: blocks.includes(cantBlock[0]?.targets?.[0]) };
    expect(row).toEqual({ cantBlock: [["gb"]], beforeBlockers: true, targetedBlocked: false });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("BUG 2 — a permanent removed from combat is no longer in it (CR 506.4)", () => {
  /** The user attacks with Grizzly Bears (and `more`); the AI holds Murder / Turn Against mana and the instants. */
  const murderTable = (more = []) => table({
    user: [P("gbu", GRIZZLY_BEARS, "user"), ...more],
    ai: [P("gba", GRIZZLY_BEARS, "ai"), ...lands("sw", SWAMP, 3, "ai"), ...lands("mt", MOUNTAIN, 5, "ai")],
    aiHand: [inHand("h-murder", MURDER), inHand("h-turn", TURN_AGAINST)],
  });

  it("⭐ an attacker destroyed after attackers are declared leaves combat: no block is offered against it, and CR 508.8 still runs the declare blockers and combat damage steps", () => {
    const passed = pass(attackWith(passTo(murderTable(), "declare-attackers"), "gbu"));
    const murdered = resolveStack(cast(passed, "ai", "Murder", "gbu"));
    expect({ step: murdered.step, attackers: attackerIds(murdered), graveyard: murdered.players.user.graveyard.map((c) => c.name) })
      .toEqual({ step: "declare-attackers", attackers: [], graveyard: ["Grizzly Bears"] });
    const blockersStep = passTo(murdered, "declare-blockers");
    expect(offered(blockersStep, "ai", "declare-blocker")).toEqual([]);
    const steps = [];
    let cur = blockersStep;
    for (let g = 0; g < 20 && cur.phase === "combat"; g++) { if (steps.at(-1) !== cur.step) steps.push(cur.step); cur = pass(cur); }
    expect(steps).toEqual(["declare-blockers", "first-strike-damage", "combat-damage", "end-of-combat"]);
  });

  it("outside combat — a game's first main phase, before any combat record exists — a creature leaving the battlefield touches no combat state", () => {
    const { combat: _none, ...s0 } = table({ phase: "precombat-main", step: "main",
      user: [P("gbu", GRIZZLY_BEARS, "user"), ...lands("sw", SWAMP, 3, "user")], userHand: [inHand("h-murder", MURDER)], ai: [P("gba", GRIZZLY_BEARS, "ai")] });
    const s = resolveStack(cast(s0, "user", "Murder", "gba"));
    expect({ combat: s.combat, graveyard: s.players.ai.graveyard.map((c) => c.name) }).toEqual({ combat: undefined, graveyard: ["Grizzly Bears"] });
  });

  it("⭐ an attacker whose controller changes leaves combat (Turn Against): no block against it, its new controller blocks with it, and it deals no damage to anyone", () => {
    const passed = pass(attackWith(passTo(murderTable([P("gbu2", GRIZZLY_BEARS, "user")]), "declare-attackers"), "gbu", "gbu2"));
    const stolen = resolveStack(cast(passed, "ai", "Turn Against", "gbu"));
    const thief = findPermanent(stolen, "gbu");
    expect({ controller: thief.controller, tapped: thief.permanent.tapped, attackers: attackerIds(stolen) }).toEqual({ controller: "ai", tapped: false, attackers: ["gbu2"] });
    const blockersStep = passTo(stolen, "declare-blockers");
    const blocks = offered(blockersStep, "ai", "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`).sort();
    console.log("  WITNESS stolenAttackerBlocks", JSON.stringify(blocks)); // vitest 4 needs --disable-console-intercept
    expect(blocks).toEqual(["gba>gbu2", "gbu>gbu2"]);
    const blocked = act(blockersStep, "ai", "declare-blocker", (a) => a.permanentId === "gbu" && a.attackerId === "gbu2");
    const end = passTo(blocked, "end-of-combat");
    const lost = (pid) => blocked.players[pid].life - end.players[pid].life;
    expect({ ai: lost("ai"), user: lost("user"), dead: [...end.players.user.graveyard, ...end.players.ai.graveyard].filter((c) => c.name === "Grizzly Bears").length })
      .toEqual({ ai: 0, user: 0, dead: 2 }); // the two Bears trade; nobody takes combat damage
  });

  it("⭐ an attacker that REGENERATES leaves combat (CR 701.19a): Restless Dead's shield saves it from Murder, it is tapped, and no block is offered against it", () => {
    const main = table({
      phase: "precombat-main", step: "main",
      user: [P("rd", RESTLESS_DEAD, "user"), P("sw-u", SWAMP, "user")],
      ai: [P("gba", GRIZZLY_BEARS, "ai"), ...lands("sw", SWAMP, 3, "ai")], aiHand: [inHand("h-murder", MURDER)],
    });
    const shielded = resolveStack(act(main, "user", "activate-ability", (a) => a.permanentId === "rd"));
    expect(findPermanent(shielded, "rd").permanent.regenShields).toBe(1);
    const passed = pass(attackWith(passTo(shielded, "declare-attackers"), "rd"));
    const saved = resolveStack(cast(passed, "ai", "Murder", "rd"));
    const rd = findPermanent(saved, "rd")?.permanent;
    expect({ alive: !!rd, tapped: rd?.tapped, removed: rd?.removedFromCombat, attackers: attackerIds(saved) }).toEqual({ alive: true, tapped: true, removed: true, attackers: [] });
    expect(offered(passTo(saved, "declare-blockers"), "ai", "declare-blocker")).toEqual([]);
  });

  /** Blocks declared (the AI double-blocks the user's Grizzly Bears), then the user steals one blocker in the first-strike damage step. */
  function stolenBlocker({ second = true, userHand = [], aiHand = [], aiLands = [], userLands = [] } = {}) {
    const s0 = table({
      user: [P("gbu", GRIZZLY_BEARS, "user"), ...lands("mt", MOUNTAIN, 5, "user"), ...userLands],
      ai: [P("gba1", GRIZZLY_BEARS, "ai"), ...(second ? [P("gba2", GRIZZLY_BEARS, "ai")] : []), ...aiLands],
      userHand: [inHand("h-turn", TURN_AGAINST), ...userHand], aiHand,
    });
    let s = passTo(attackWith(passTo(s0, "declare-attackers"), "gbu"), "declare-blockers");
    s = pass(s); // the active player passes; the defender declares
    s = act(s, "ai", "declare-blocker", (a) => a.permanentId === "gba1");
    if (second) s = act(s, "ai", "declare-blocker", (a) => a.permanentId === "gba2");
    s = passTo(s, "first-strike-damage");
    expect(s.combat.blockers.map((b) => `${b.blockerId}>${b.attackerId}`)).toEqual(second ? ["gba1>gbu", "gba2>gbu"] : ["gba1>gbu"]);
    return resolveStack(cast(s, "user", "Turn Against", "gba1"));
  }

  it("⭐ a BLOCKER whose controller changes leaves combat but the attacker stays BLOCKED (CR 509.1h, 510.1c): no damage to the defending player, none between the two", () => {
    const s = stolenBlocker({ second: false });
    const gba1 = findPermanent(s, "gba1");
    expect({ controller: gba1.controller, removed: gba1.permanent.removedFromCombat, blockRecords: s.combat.blockers.length }).toEqual({ controller: "user", removed: true, blockRecords: 1 });
    const end = passTo(s, "end-of-combat");
    const row = { aiLifeLost: s.players.ai.life - end.players.ai.life, gbu: findPermanent(end, "gbu")?.permanent.damageMarked ?? "dead",
      gba1: findPermanent(end, "gba1")?.permanent.damageMarked ?? "dead" };
    console.log("  WITNESS stolenBlockerDamage", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ aiLifeLost: 0, gbu: 0, gba1: 0 });
  });

  it("the stolen blocker is no longer a BLOCKING creature: Rally pumps the blocker still in combat and not the one removed from it", () => {
    let s = stolenBlocker({ aiLands: lands("pl", PLAINS, 2, "ai"), aiHand: [inHand("h-rally", RALLY)] });
    s = pass(s); // the user passes; the AI casts Rally
    s = resolveStack(cast(s, "ai", "Rally"));
    const power = (id) => creaturePower(findPermanent(s, id).permanent, s);
    expect({ gba1: power("gba1"), gba2: power("gba2") }).toEqual({ gba1: 2, gba2: 3 });
  });

  it("the stolen blocker is no longer a legal 'attacking or blocking creature' target: Divine Verdict offers the attacker and the remaining blocker only", () => {
    const s = stolenBlocker({ userLands: lands("pl", PLAINS, 4, "user"), userHand: [inHand("h-verdict", DIVINE_VERDICT)] });
    const targets = offered(s, "user", "cast-spell").filter((a) => a.name === "Divine Verdict").map((a) => a.targets[0].id).sort();
    expect(targets).toEqual(["gba2", "gbu"]);
  });
});
