/**
 * diesBatchDelegation.test.js — the `diesBatch` arm rebuilt on DELEGATION (CR 603.1).
 *
 * The original arm hand-rolled its subject regex and admitted exactly three bare controller scopes, silently
 * dropping every other subject the SINGULAR `dies` arm already knew how to enforce. It now singularizes the
 * plural subject, hands the clause back to classifyCondition, and rewrites only the EVENT — so nontoken,
 * subtype, and the opponent-controlled scope all arrive with their filters intact, and any subject the
 * singular arm REFUSES is refused here for free.
 *
 * ⚠️ THE DIFFERENCE FROM THE BATCHED-ENTRY ARM, and it matters: that one simulates batching on a per-entry
 * event and therefore REQUIRES the printed once-per-turn rider. This one needs no rider, because `diesBatch`
 * is its own event with its own check function that fires ONCE per call however many members match — deaths
 * genuinely arrive as an array (the SBA batches them). The singular `dies` path is untouched by construction:
 * a diesBatch descriptor has no route into the per-object fire loop at all.
 *
 * The n=3-vs-singular contrast below is the whole safety argument, so both halves are asserted.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const watcherCard = (oracle) => ({ id: "w", name: "Watcher", type: "Enchantment", oracle });
const creature = (id, type, controller, token = false) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle: "", ...(token ? { token: true } : {}) }, controller }), controller });

function boardWith(oracle) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const w = createPermanent({ id: "w", card: watcherCard(oracle), controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [w] } } };
}

const scopeOf = (subject, verb = "die") =>
  detectTriggers(watcherCard(`Whenever one or more ${subject} ${verb}, draw a card.`))[0];

describe("detection — subjects the hand-rolled regex dropped now route", () => {
  it("nontoken (The Skullspore Nexus #1591) keeps its filter", () => {
    expect(scopeOf("nontoken creatures you control")).toMatchObject({
      event: "diesBatch", scope: "creatureYouControl", nontokenFilter: true,
    });
  });

  it("\"your opponents control\" routes — it was the only member of that family with NO route (Spiteful Banditry #2356)", () => {
    expect(scopeOf("creatures your opponents control")).toMatchObject({ event: "diesBatch", scope: "creatureOpponentControls" });
  });

  it("it shares a scope with the singular templating \"an opponent controls\" — the same set of creatures", () => {
    expect(scopeOf("creatures your opponents control").scope).toBe(scopeOf("creatures an opponent controls").scope);
  });

  it("a SUBTYPE subject comes along too", () => {
    expect(scopeOf("Goblins you control")).toMatchObject({ event: "diesBatch", scope: "subtypeYouControl", subtypeFilter: "Goblin" });
  });

  it("the shapes the arm already had are unchanged", () => {
    expect(scopeOf("creatures you control")).toMatchObject({ event: "diesBatch", scope: "creatureYouControl" });
    expect(scopeOf("other creatures you control")).toMatchObject({ event: "diesBatch", scope: "otherCreatureYouControl" });
  });
});

describe("⭐ RUNTIME — batched, and the filters are real", () => {
  const NONTOKEN = "Whenever one or more nontoken creatures you control die, draw a card.";
  const OPPONENTS = "Whenever one or more creatures your opponents control die, draw a card.";

  it("⭐ n=3 nontoken deaths fire the batch trigger exactly ONCE", () => {
    const dead = ["a", "b", "c"].map((id) => creature(id, "Creature — Bear", "user"));
    const after = checkDiesTriggers(boardWith(NONTOKEN), dead);
    expect((after.pendingTriggers || []).length).toBe(1);
  });

  it("⭐ THE CONTRAST — the SINGULAR wording fires three times on the same batch", () => {
    const dead = ["a", "b", "c"].map((id) => creature(id, "Creature — Bear", "user"));
    const singular = boardWith("Whenever a nontoken creature you control dies, draw a card.");
    expect((checkDiesTriggers(singular, dead).pendingTriggers || []).length).toBe(3);
  });

  it("⭐ CREED — a batch of TOKENS only does not fire the nontoken watcher", () => {
    const dead = ["t1", "t2"].map((id) => creature(id, "Creature — Bear", "user", true));
    expect((checkDiesTriggers(boardWith(NONTOKEN), dead).pendingTriggers || []).length).toBe(0);
  });

  it("a MIXED batch fires once — one nontoken member is enough (CR 603.1)", () => {
    const dead = [creature("t1", "Creature — Bear", "user", true), creature("real", "Creature — Bear", "user")];
    expect((checkDiesTriggers(boardWith(NONTOKEN), dead).pendingTriggers || []).length).toBe(1);
  });

  it("⭐ CREED — the opponent-scoped watcher does NOT fire on your OWN creatures dying", () => {
    const dead = [creature("mine", "Creature — Bear", "user")];
    expect((checkDiesTriggers(boardWith(OPPONENTS), dead).pendingTriggers || []).length).toBe(0);
  });

  it("the opponent-scoped watcher fires once on a batch of THEIR creatures", () => {
    const dead = ["x", "y"].map((id) => creature(id, "Creature — Bear", "ai"));
    expect((checkDiesTriggers(boardWith(OPPONENTS), dead).pendingTriggers || []).length).toBe(1);
  });
});

describe("it inherits the singular arm's refusals", () => {
  it("an unresolvable head noun is refused rather than guessed", () => {
    expect(detectTriggers(watcherCard("Whenever one or more glorbs you control die, draw a card."))).toHaveLength(0);
  });

  it("a subject LIST is refused", () => {
    expect(detectTriggers(watcherCard("Whenever one or more Humans and/or Warriors you control die, draw a card."))).toHaveLength(0);
  });
});
