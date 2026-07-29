/**
 * batchedEntryDelegation.test.js — BATCHED ENTRY (CR 603.1) mapped onto the SINGULAR entry events.
 *
 * "Whenever one or more artifacts you control enter, draw a card. This ability triggers only once each turn."
 * (Elvish Archivist, Ingenious Smith, Merry). The engine dispatches entries ONE AT A TIME, so a naive batch
 * watcher would fire once per entering permanent — three tokens would draw three cards. The whole slice rests
 * on one observation:
 *
 *     batch-once,   then rider-capped  ->  once per turn
 *     per-entry,    then rider-capped  ->  once per turn      ← observably IDENTICAL
 *
 * The PRINTED rider does the capping either way, so no entry queue and no per-entry cost is needed. The
 * n=3 test below is the load-bearing evidence for that claim — without it this is an over-fire.
 *
 * ⚠️ AND IT IS VALID ONLY WITH THE RIDER. A rider-less batched form mapped this way DOES over-fire, so the
 * detection arm refuses it outright (pinned below).
 *
 * ⭐ THE ARM DELEGATES rather than parsing subjects itself: the plural subject is singularized and the
 * resulting clause is handed back to classifyCondition. So the batch form inherits the singular form's
 * REFUSALS as well as its capabilities, and can never be more permissive than the singular arm it is built
 * on. The "inherits a refusal" cases below pin that containment.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkPermanentEntersTriggers } from "./triggers.js";
import { flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ARCHIVIST = {
  id: "arc", name: "Elvish Archivist", type: "Creature — Elf Advisor", power: 2, toughness: 2,
  oracle: "Whenever one or more artifacts you control enter, draw a card. This ability triggers only once each turn.",
};
const artifactCard = (id) => ({ id, name: `Relic ${id}`, type: "Artifact", oracle: "" });

function boardWithWatcher() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const w = createPermanent({ id: "arc", card: ARCHIVIST, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [w] } } };
}

describe("detection — the batched subject reaches the singular entry event", () => {
  it("routes to permanentEnters/artifactYouControl (the singular arm's own descriptor)", () => {
    const d = detectTriggers(ARCHIVIST);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "permanentEnters", scope: "artifactYouControl" });
  });

  it("Elvish Archivist classifies native", () => {
    expect(classifyCard(ARCHIVIST)).toMatch(/^native/);
  });

  it("a SUBTYPE subject delegates too — \"other Elves\" → the Elf scope, not a naive \"Elve\"", () => {
    const d = detectTriggers({
      id: "w", name: "Elvish Warmaster", type: "Creature — Elf Warrior",
      oracle: "Whenever one or more other Elves you control enter, create a 1/1 green Elf Warrior creature token. This ability triggers only once each turn.",
    });
    expect(d[0]).toMatchObject({ event: "etb", scope: "otherSubtypeYouControl", subtypeFilter: "Elf" });
  });
});

describe("⭐ RUNTIME — the rider is what makes the mapping honest", () => {
  function enterAll(state, perms) {
    // Each entry is dispatched separately, exactly as the engine does it.
    let s = state;
    for (const p of perms) {
      s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, p] } } };
      s = checkPermanentEntersTriggers(s, p);
    }
    return s;
  }

  it("n=1 — one artifact entering draws once", () => {
    const a = createPermanent({ id: "r1", card: artifactCard("r1"), controller: "user" });
    let s = enterAll(boardWithWatcher(), [a]);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect((s.stack || []).length).toBe(1);
  });

  it("⭐ n=3 — THREE artifacts entering still resolve exactly ONE trigger (the whole safety claim)", () => {
    const arts = ["r1", "r2", "r3"].map((id) => createPermanent({ id, card: artifactCard(id), controller: "user" }));
    let s = enterAll(boardWithWatcher(), arts);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect((s.stack || []).length).toBe(1);
    expect((s.log || []).some((e) => e.kind === "trigger-once-per-turn-latched")).toBe(true);
  });

  it("⭐ CREED — an artifact an OPPONENT controls entering does not fire it", () => {
    const s0 = boardWithWatcher();
    const theirs = createPermanent({ id: "r9", card: artifactCard("r9"), controller: "ai" });
    const s1 = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [theirs] } } };
    const after = checkPermanentEntersTriggers(s1, theirs);
    expect((after.pendingTriggers || []).length).toBe(0);
  });

  it("⭐ CREED — a non-artifact entering does not fire it", () => {
    const s0 = boardWithWatcher();
    const bear = createPermanent({ id: "b1", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, bear] } } };
    const after = checkPermanentEntersTriggers(s1, bear);
    expect((after.pendingTriggers || []).length).toBe(0);
  });
});

describe("⛔ THE RIDER IS MANDATORY — without it the mapping over-fires, so it is refused", () => {
  const riderless = (subject) => detectTriggers({
    id: "x", name: "X", type: "Enchantment",
    oracle: `Whenever one or more ${subject} enter, draw a card.`,
  });

  it("\"artifacts you control\" with NO rider → undetected (Arbiter), never a per-entry trigger", () => {
    expect(riderless("artifacts you control")).toHaveLength(0);
  });

  it("\"other Elves you control\" with NO rider → undetected", () => {
    expect(riderless("other Elves you control")).toHaveLength(0);
  });
});

describe("it INHERITS the singular arm's refusals — the containment argument", () => {
  const batched = (subject) => detectTriggers({
    id: "x", name: "X", type: "Enchantment",
    oracle: `Whenever one or more ${subject} enter, draw a card. This ability triggers only once each turn.`,
  });

  it("a SUBJECT LIST is refused — the singular matchers take one noun (Expedition Supplier)", () => {
    // ⚠️ The early-out in singularizeBatchSubject is NOT what this pins: mutating that line away leaves this
    // green, because the delegated clause is refused downstream regardless. Measured, not assumed. The
    // OUTCOME is what matters and is worth pinning; the mechanism is the delegation itself.
    expect(batched("Humans and/or Warriors you control")).toHaveLength(0);
  });

  it("an unresolvable head noun is refused rather than guessed", () => {
    expect(batched("glorbs you control")).toHaveLength(0);
  });

  it("a subject the SINGULAR arm cannot enforce is refused here too (Losheel's \"artifact creatures\")", () => {
    // "an artifact creature you control enters" is not modeled singular; the batch form must not invent it.
    expect(batched("artifact creatures you control")).toHaveLength(0);
  });
});
