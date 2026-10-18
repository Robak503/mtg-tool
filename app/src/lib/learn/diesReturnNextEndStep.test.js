/**
 * diesReturnNextEndStep.test.js — the play-weighted program (2026-10-18): a dies trigger whose effect returns the dead card to its
 * owner's hand "at the beginning of the next end step" — a delayed triggered ability the trigger creates as it resolves (CR 603.7a),
 * naming the object the ability triggered on (CR 608.2c), now in its owner's graveyard (CR 400.7).
 *   The Locust God (EDHREC #1730) — "When The Locust God dies, return it to its owner's hand at the beginning of the next end step."
 *   Liesa, Forgotten Archangel (#2107) — "Whenever another nontoken creature you control dies, return that card to its owner's hand at
 *     the beginning of the next end step."
 * The Locust God's bundled rulings: "The "next end step" refers to the next end step that occurs, not the end step of the next turn.
 * If this creature dies before a turn's end step (for example, during combat), it will be returned to its owner's hand at the
 * beginning of that turn's end step." / "If this creature dies but leaves your graveyard before the next end step, it will remain in
 * its new zone." Card text is the bundled oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── bundled oracle fixtures ─────────────────────────────────────────────────────────────────────────────────────────
const LOCUST_GOD = {"name":"The Locust God","type":"Legendary Creature — God","mana":"{4}{U}{R}","cmc":6,"power":"4","toughness":"4","keywords":["Flying"],"colors":["R","U"],"oracle":"Flying\nWhenever you draw a card, create a 1/1 blue and red Insect creature token with flying and haste.\n{2}{U}{R}: Draw a card, then discard a card.\nWhen The Locust God dies, return it to its owner's hand at the beginning of the next end step."};
const LIESA = {"name":"Liesa, Forgotten Archangel","type":"Legendary Creature — Angel","mana":"{2}{W}{W}{B}","cmc":5,"power":"4","toughness":"5","keywords":["Flying","Lifelink"],"colors":["B","W"],"oracle":"Flying, lifelink\nWhenever another nontoken creature you control dies, return that card to its owner's hand at the beginning of the next end step.\nIf a creature an opponent controls would die, exile it instead."};
const SCARAB_GOD = {"name":"The Scarab God","type":"Legendary Creature — God","mana":"{3}{U}{B}","cmc":5,"power":"5","toughness":"5","keywords":["Scry"],"colors":["B","U"],"oracle":"At the beginning of your upkeep, each opponent loses X life and you scry X, where X is the number of Zombies you control.\n{2}{U}{B}: Exile target creature card from a graveyard. Create a token that's a copy of it, except it's a 4/4 black Zombie.\nWhen The Scarab God dies, return it to its owner's hand at the beginning of the next end step."};
const TIANA = {"name":"Tiana, Ship's Caretaker","type":"Legendary Creature — Angel Artificer","mana":"{3}{R}{W}","cmc":5,"power":"3","toughness":"3","keywords":["Flying","First strike"],"colors":["R","W"],"oracle":"Flying, first strike\nWhenever an Aura or Equipment you control is put into a graveyard from the battlefield, you may return that card to its owner's hand at the beginning of the next end step."};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."};
const RAISE_THE_ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 white Soldier creature tokens."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};

// ─── harness ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ ...card, id });
const LIB = (n, who) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${who}-lib${i}` }));
function board({ user = [], ai = [], hand = [], pool = {}, phase = "precombat-main", step = "main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase, step, stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, hand, library: LIB(10, "u"), manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai, library: LIB(10, "a") } } };
}
function settle(s) {
  let n = s;
  for (let i = 0; i < 40 && (n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice; i++) {
    n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const nextStep = (s) => settle(runStepActions(advanceStep(s)));
/** Step forward until (turn, step or phase) — as the driver steps: enter, run the step's actions, resolve what triggered. */
function stepTo(s, turn, at) {
  let n = s;
  const there = (x) => x.turn === turn && (x.step === at || x.phase === at);
  for (let i = 0; i < 60 && !there(n); i++) n = nextStep(n);
  expect({ turn: n.turn, at: there(n) ? at : `${n.phase}/${n.step}` }).toEqual({ turn, at });
  return n;
}
const cast = (s, cardId, target) => {
  const offer = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (target === undefined || a.targets?.[0]?.id === target));
  expect(offer).toBeTruthy();
  return settle(dispatchAction(s, offer));
};
const where = (s, cardId) => {
  for (const [pid, p] of Object.entries(s.players)) {
    for (const zone of ["hand", "graveyard", "exile", "library"]) if ((p[zone] || []).some((c) => c.id === cardId)) return `${pid}:${zone}`;
    if (p.battlefield.some((x) => x.card?.id === cardId)) return `${pid}:battlefield`;
  }
  return "nowhere";
};
const scheduled = (s) => (s.delayedTriggers || []).filter((r) => !r.watchDies).map((r) => ({ fireStep: r.fireStep, fireScope: r.fireScope, effectClause: r.effectClause }));

// ─── the reader ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the reader", () => {
  it("⭐ the dies triggers carry the sentinel, which parses to one scheduling atom; both cards read native (and The Scarab God's dies trigger routes)", () => {
    const dies = (c) => detectTriggers(c).filter((d) => d.event === "dies");
    const sentinel = parseEffectClause("[died-card-to-hand at the next end step]", "Instant");
    expect({
      locust: dies(LOCUST_GOD).map((d) => ({ scope: d.scope, effectClause: d.effectClause, routes: triggerRoutesNatively(d) })),
      liesa: dies(LIESA).map((d) => ({ scope: d.scope, nontoken: !!d.nontokenFilter, effectClause: d.effectClause, routes: triggerRoutesNatively(d) })),
      sentinel: { conf: programConfidence(sentinel), atoms: sentinel.atoms },
      tiers: { locust: classifyCard(LOCUST_GOD), liesa: classifyCard(LIESA) },
      scarabDies: detectTriggers(SCARAB_GOD).filter((d) => d.event === "dies").map((d) => triggerRoutesNatively(d)),
    }).toEqual({
      locust: [{ scope: "self", effectClause: "[died-card-to-hand at the next end step]", routes: true }],
      liesa: [{ scope: "otherCreatureYouControl", nontoken: true, effectClause: "[died-card-to-hand at the next end step]", routes: true }],
      sentinel: { conf: "high", atoms: [{ op: "schedule-died-card-to-hand", fireStep: "end", fireScope: "any", targetType: null }] },
      tiers: { locust: "native-mixed", liesa: "native-mixed" },
      scarabDies: [true],
    });
  });

  it("CONTROL — near misses stay unread: \"you may return\" on a leaves-the-battlefield watcher (Tiana), another destination, another timing, the printed sentence as a spell; The Scarab God stays parked on its other two lines", () => {
    const syn = (oracle) => classifyCard({ name: "Test Ghoul", type: "Creature — Zombie", mana: "{2}{B}", power: "2", toughness: "2", keywords: [], colors: ["B"], oracle });
    expect({
      tiana: classifyCard(TIANA),
      battlefield: syn("When this creature dies, return it to the battlefield under its owner's control at the beginning of the next end step."),
      yourNext: syn("When this creature dies, return it to its owner's hand at the beginning of your next upkeep."),
      asSpell: programConfidence(parseEffectClause("Return it to its owner's hand at the beginning of the next end step.", "Instant")),
      scarab: classifyCard(SCARAB_GOD),
    }).toEqual({ tiana: "body-only", battlefield: "body-only", yourNext: "body-only", asSpell: "low", scarab: "body-only" });
  });
});

// ─── in play ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ in play — The Locust God", () => {
  it("⭐ dies in the first main phase: stays in the graveyard through combat, comes back to its owner's hand at the beginning of that turn's end step", () => {
    const s0 = board({ user: [P("locust", LOCUST_GOD)], hand: [H("murder", MURDER)], pool: { B: 2, C: 1 } });
    const s1 = cast(s0, "murder", "locust");
    const s2 = stepTo(s1, 6, "postcombat-main");
    const s3 = stepTo(s2, 6, "end");
    expect({ afterMurder: where(s1, "c-locust"), queued: scheduled(s1), atSecondMain: where(s2, "c-locust"), atEndStep: where(s3, "c-locust"), queuedAfter: scheduled(s3) }).toEqual({
      afterMurder: "user:graveyard", queued: [{ fireStep: "end", fireScope: "any", effectClause: "[died-card-to-hand c-locust]" }],
      atSecondMain: "user:graveyard", atEndStep: "user:hand", queuedAfter: [],
    });
  });

  it("⭐ dies during an end step: it waits for the next end step to begin — the opponent's, next turn (its ruling)", () => {
    const s0 = board({ user: [P("locust", LOCUST_GOD)], hand: [H("murder", MURDER)], pool: { B: 2, C: 1 }, phase: "ending", step: "end" });
    const s1 = cast(s0, "murder", "locust");
    const s2 = stepTo(s1, 7, "postcombat-main");
    const s3 = stepTo(s2, 7, "end");
    expect({ afterMurder: where(s1, "c-locust"), nextTurnMain: where(s2, "c-locust"), nextEndStep: where(s3, "c-locust") })
      .toEqual({ afterMurder: "user:graveyard", nextTurnMain: "user:graveyard", nextEndStep: "user:hand" });
  });

  it("⭐ leaves the graveyard before the end step: it stays in its new zone (its ruling)", () => {
    const s1 = cast(board({ user: [P("locust", LOCUST_GOD)], hand: [H("murder", MURDER)], pool: { B: 2, C: 1 } }), "murder", "locust");
    const exiled = moveCardToZone(s1, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId: "c-locust" });
    const s2 = stepTo(exiled, 6, "end");
    expect({ queuedAtDeath: scheduled(s1).map((r) => r.effectClause), before: where(exiled, "c-locust"), atEndStep: where(s2, "c-locust"), queuedAfter: scheduled(s2) })
      .toEqual({ queuedAtDeath: ["[died-card-to-hand c-locust]"], before: "user:exile", atEndStep: "user:exile", queuedAfter: [] });
  });
});

describe("⭐ in play — Liesa, Forgotten Archangel", () => {
  it("⭐ another nontoken creature of hers dies: back to its owner's hand at the end step; a creature token that dies never comes back; Liesa herself is not \"another\"", () => {
    const s0 = board({ user: [P("liesa", LIESA), P("bears", GRIZZLY_BEARS)], hand: [H("alarm", RAISE_THE_ALARM), H("murder1", MURDER), H("murder2", MURDER)], pool: { W: 2, B: 4, C: 2 } });
    const s1 = cast(s0, "alarm");
    const soldier = s1.players.user.battlefield.find((p) => p.card?.token);
    expect(soldier?.card?.name).toBe("Soldier");
    const s2 = cast(cast(s1, "murder1", "bears"), "murder2", soldier.id);
    const s3 = stepTo(s2, 6, "end");
    expect({ queued: scheduled(s2).map((r) => r.effectClause), bearsAtEnd: where(s3, "c-bears"), soldierGone: !s3.players.user.battlefield.some((p) => p.id === soldier.id) })
      .toEqual({ queued: ["[died-card-to-hand c-bears]"], bearsAtEnd: "user:hand", soldierGone: true });
  });

  it("an opponent's creature is exiled instead of dying — no return; Liesa dying schedules nothing", () => {
    const s0 = board({ user: [P("liesa", LIESA)], ai: [P("giant", HILL_GIANT, "ai")], hand: [H("murder1", MURDER), H("murder2", MURDER)], pool: { B: 4, C: 2 } });
    const s1 = cast(s0, "murder1", "giant");
    const s2 = cast(s1, "murder2", "liesa");
    const s3 = stepTo(s2, 6, "end");
    expect({ giant: where(s1, "c-giant"), queued: scheduled(s2), liesaAtEnd: where(s3, "c-liesa") }).toEqual({ giant: "ai:exile", queued: [], liesaAtEnd: "user:graveyard" });
  });
});
