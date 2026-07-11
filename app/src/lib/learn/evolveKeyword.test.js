/**
 * evolveKeyword.test.js — KW-EVOLVE (CR 702.100) + Watchful Radstag's evolves rider (SHELF S7).
 *
 * Evolve synthesis (the undying pattern): detectTriggers emits a creature-you-control ETB descriptor off
 * the printed keyword; the comparative intervening-if ("that creature has greater power or toughness than
 * this creature") reads LAYER-AWARE P/T of the entering creature vs the source at flush AND resolution
 * (CR 702.100d); the evolve-counter-self atom places the +1/+1 through the standard doubling/watcher path
 * and fires "this creature evolves" watchers (CR 702.100f — Radstag creates a copy token).
 * CREED FP = a counter off a smaller/equal entry, an evolve off an OPPONENT's creature, an evolve off the
 * source's own entry, or a copy token without a real evolve — all pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, evolveKeywordCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const RADSTAG_ORACLE =
  "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever this creature evolves, create a token that's a copy of it.";
const radstagCard = (id = "wr-card") => ({
  id, name: "Watchful Radstag", type: "Creature — Elk Mutant", power: "2", toughness: "2", mana: "{2}{G}", oracle: RADSTAG_ORACLE,
});
const SNAPJAW = { name: "Adaptive Snapjaw", type: "Creature — Lizard Beast", power: "6", toughness: "2", mana: "{3}{G}{U}", oracle: "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)" };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withRadstag(state, controller = "user") {
  const r = createPermanent({ id: "radstag", card: radstagCard(), controller });
  return { ...state, players: { ...state.players, [controller]: { ...state.players[controller], battlefield: [...state.players[controller].battlefield, r] } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 40) { s = resolveTopOfStack(s); s = flushTriggers(s, {}); }
  return s;
}
const enter = (s, controller, name, p, t) =>
  enterPermanent(s, { id: `card-${name}`, name, type: "Creature — Bear", power: String(p), toughness: String(t), oracle: "" }, controller);

describe("detection + synthesis + classify", () => {
  it("the printed keyword synthesizes the ETB descriptor; Radstag's evolves rider detects; both route natively", () => {
    const ds = detectTriggers(radstagCard());
    const evolve = ds.find((d) => d.sourceText === "Evolve");
    expect(evolve).toMatchObject({ event: "etb", scope: "creatureYouControl", interveningIf: "that creature has greater power or toughness than this creature" });
    const evolves = ds.find((d) => d.event === "evolves");
    expect(evolves).toMatchObject({ scope: "self" });
    for (const d of ds) expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(radstagCard())).toBe("native-trigger");
    expect(classifyCard(SNAPJAW)).toBe("native-body"); // bare evolve + nothing else
    expect(interveningIfParseable("that creature has greater power or toughness than this creature")).toBe(true);
  });

  it("CREED guards: a GRANT never self-synthesizes; the structural matcher wants a bare keyword segment", () => {
    expect(evolveKeywordCount("Target creature gains evolve until end of turn.")).toBe(0);
    expect(evolveKeywordCount("Each creature you control with evolve gets +1/+1.")).toBe(0);
    expect(evolveKeywordCount(RADSTAG_ORACLE)).toBe(1);
    expect(evolveKeywordCount("Flying, evolve")).toBe(1);
  });
});

describe("the comparative intervening-if (layer-aware, live)", () => {
  const cond = "that creature has greater power or toughness than this creature";
  function board(enteringPT, sourcePT) {
    let s = baseState();
    const src = createPermanent({ id: "src", card: { name: "S", type: "Creature", power: String(sourcePT[0]), toughness: String(sourcePT[1]), oracle: "" }, controller: "user" });
    const ent = createPermanent({ id: "ent", card: { name: "E", type: "Creature", power: String(enteringPT[0]), toughness: String(enteringPT[1]), oracle: "" }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src, ent] } } };
  }
  const ctx = { triggeringPermanentId: "ent", sourcePermanentId: "src" };
  it("greater power OR greater toughness → true; equal/smaller → false; missing referent → null", () => {
    expect(evaluateInterveningIf(board([3, 1], [2, 2]), cond, "user", ctx)).toBe(true);  // power greater
    expect(evaluateInterveningIf(board([1, 3], [2, 2]), cond, "user", ctx)).toBe(true);  // toughness greater
    expect(evaluateInterveningIf(board([2, 2], [2, 2]), cond, "user", ctx)).toBe(false); // equal — no evolve
    expect(evaluateInterveningIf(board([1, 1], [2, 2]), cond, "user", ctx)).toBe(false);
    expect(evaluateInterveningIf(board([3, 3], [2, 2]), cond, "user", { ...ctx, triggeringPermanentId: "gone" })).toBe(null);
    expect(evaluateInterveningIf(board([3, 3], [2, 2]), cond, "user", null)).toBe(null);
  });
});

describe("engine (CREED core — evolve fires exactly when printed)", () => {
  it("a bigger creature entering under YOUR control: +1/+1 lands AND the evolves rider mints a copy token", () => {
    let s = withRadstag(baseState());
    s = resolveAll(enter(s, "user", "Big", 4, 4));
    const radstag = s.players.user.battlefield.find((p) => p.id === "radstag");
    expect(radstag.counters?.["+1/+1"] || 0).toBe(1);
    const copies = s.players.user.battlefield.filter((p) => p.id !== "radstag" && p.card?.name === "Watchful Radstag");
    expect(copies).toHaveLength(1); // the evolves watcher fired once
    expect(copies[0].card?.token).toBe(true);
  });

  it("a smaller/equal creature entering: no counter, no token (the comparative gate holds)", () => {
    let s = withRadstag(baseState());
    s = resolveAll(enter(s, "user", "Small", 1, 1));
    s = resolveAll(enter(s, "user", "Equal", 2, 2));
    const radstag = s.players.user.battlefield.find((p) => p.id === "radstag");
    expect(radstag.counters?.["+1/+1"] || 0).toBe(0);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Watchful Radstag")).toHaveLength(1);
  });

  it("an OPPONENT's big creature entering never evolves it (creatureYouControl scope)", () => {
    let s = withRadstag(baseState());
    s = resolveAll(enter(s, "ai1", "EnemyBig", 6, 6));
    expect(s.players.user.battlefield.find((p) => p.id === "radstag").counters?.["+1/+1"] || 0).toBe(0);
  });

  it("its own entry never evolves it (self-compare is never greater)", () => {
    let s = baseState();
    s = resolveAll(enterPermanent(s, radstagCard("wr-2"), "user"));
    const r = s.players.user.battlefield.find((p) => p.card?.name === "Watchful Radstag");
    expect(r.counters?.["+1/+1"] || 0).toBe(0);
    expect(s.players.user.battlefield).toHaveLength(1);
  });

  it("after evolving once to 3/3, a 3/3 entering no longer evolves it (live layer-aware re-read)", () => {
    let s = withRadstag(baseState());
    s = resolveAll(enter(s, "user", "Big", 4, 4)); // evolves → 3/3 with one counter
    s = resolveAll(enter(s, "user", "Peer", 3, 3)); // 3/3 vs 3/3 — not greater
    const radstag = s.players.user.battlefield.find((p) => p.id === "radstag");
    expect(radstag.counters?.["+1/+1"] || 0).toBe(1);
  });
});
