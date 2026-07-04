/**
 * decisionWire.test.js — SD-4 (Lane A3, play-harness overhaul).
 *
 * Every pendingChoice pause spreads the WHOLE state.pendingChoice onto the
 * decision — including `resume` (the suspended effect-program continuation),
 * `effectAtoms`, `queue`, `filter`, `restIds` — and the routes previously
 * shipped it all verbatim (their stripDecisionForWire touched only kind==="ask"
 * and was an identity copy even there). decisionViewForWire is the one wire
 * view: pending kinds are whitelisted to what LearnView actually renders;
 * non-pending kinds pass through in today's exact shape.
 */

import { describe, it, expect } from "vitest";
import { decisionViewForWire } from "./decisionWire.js";
import { PENDING_CHOICE_KINDS } from "./pendingChoice.js";

describe("decisionViewForWire — pending kinds are whitelisted", () => {
  it("a tutor pause loses resume/filter/internals but keeps everything the picker renders", () => {
    const decision = {
      kind: "tutor-search",
      controller: "user",
      candidates: [{ id: "c1", name: "Llanowar Elves" }],
      sourceName: "Worldly Tutor",
      filterLabel: "creature card",
      destination: "top",
      remaining: 1,
      // engine internals that must NOT reach the wire:
      resume: { program: [{ op: "tutor" }], controller: "user", nextAtomIndex: 1 },
      filter: { groups: [["creature"]], mv: null },
      sourceZone: "library",
      sourceZones: null,
      destinations: null,
      entersTapped: false,
    };
    const wire = decisionViewForWire(decision);
    expect(wire).toEqual({
      kind: "tutor-search",
      controller: "user",
      candidates: [{ id: "c1", name: "Llanowar Elves" }],
      sourceName: "Worldly Tutor",
      filterLabel: "creature card",
      destination: "top",
      remaining: 1,
    });
    expect(wire.resume).toBeUndefined();
    expect(wire.filter).toBeUndefined();
  });

  it("a MANDATORY clone pause carries optional:false on the root after `resume` is stripped (WI-2, CR 707.9)", () => {
    const decision = {
      kind: "clone-search",
      controller: "user",
      candidates: [{ id: "p1", name: "Grizzly Bears" }],
      sourceName: "Clone",
      optional: false,
      resume: { card: { id: "cl-1" }, controller: "user", optional: false },
    };
    const wire = decisionViewForWire(decision);
    expect(wire.optional).toBe(false); // LearnView's `decision.optional ??` branch keeps hiding the decline
    expect(wire.resume).toBeUndefined();
    expect(wire.candidates).toHaveLength(1);
  });

  it("optional living only on resume.optional is flattened to the root (the UI's fallback read)", () => {
    const decision = {
      kind: "clone-search",
      controller: "user",
      candidates: [],
      resume: { optional: false },
    };
    const wire = decisionViewForWire(decision);
    expect(wire.optional).toBe(false);
    expect(wire.resume).toBeUndefined();
  });

  it("an optional-mana-payment pause loses effectAtoms but keeps cost + affordable", () => {
    const decision = {
      kind: "optional-mana-payment",
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1 } },
      affordable: true,
      sourceName: "Lifecrafter's Bestiary",
      effectAtoms: [{ op: "draw", amount: 1 }],
      resume: { program: [], nextAtomIndex: 2 },
    };
    const wire = decisionViewForWire(decision);
    expect(wire.cost).toEqual({ kind: "mana", mana: { generic: 1 } });
    expect(wire.affordable).toBe(true);
    expect(wire.effectAtoms).toBeUndefined();
    expect(wire.resume).toBeUndefined();
  });

  it("an edict-mode pause keeps modes/sac/disc but loses the chain queue", () => {
    const decision = {
      kind: "edict-mode",
      controller: "user",
      modes: ["life", "sacrifice", "discard"],
      sac: [{ id: "p1", name: "Treasure" }],
      disc: [{ id: "h1", name: "Forest" }],
      sourceName: "Torment of Hailfire",
      queue: [{ controller: "ai1", modes: ["life"] }],
      resume: { program: [] },
    };
    const wire = decisionViewForWire(decision);
    expect(wire.modes).toEqual(["life", "sacrifice", "discard"]);
    expect(wire.sac).toHaveLength(1);
    expect(wire.disc).toHaveLength(1);
    expect(wire.queue).toBeUndefined();
    expect(wire.resume).toBeUndefined();
  });

  it("UI-read fields `victim` (hand-discard) and `restTo` (impulse-dig) survive the strip", () => {
    const handDiscard = decisionViewForWire({
      kind: "hand-discard", controller: "user", victim: "ai", candidates: [], sourceName: "Duress",
    });
    expect(handDiscard.victim).toBe("ai");
    const dig = decisionViewForWire({
      kind: "impulse-dig", controller: "user", restTo: "graveyard", candidates: [], sourceName: "Strategic Planning",
      resume: { program: [] },
    });
    expect(dig.restTo).toBe("graveyard");
    expect(dig.resume).toBeUndefined();
  });

  it("EVERY pending kind: `resume`/`effectAtoms`/`queue` never survive", () => {
    for (const kind of PENDING_CHOICE_KINDS) {
      const wire = decisionViewForWire({
        kind,
        controller: "user",
        resume: { program: [] },
        effectAtoms: [{ op: "draw" }],
        queue: [{}],
      });
      expect(wire.resume, kind).toBeUndefined();
      expect(wire.effectAtoms, kind).toBeUndefined();
      expect(wire.queue, kind).toBeUndefined();
      expect(wire.kind).toBe(kind);
      expect(wire.controller).toBe("user");
    }
  });
});

describe("decisionViewForWire — non-pending kinds pass through unchanged", () => {
  it("an 'ask' decision is the SAME object (today's exact wire shape)", () => {
    const ask = {
      kind: "ask",
      prompt: "Your move.",
      options: [{ kind: "pass-priority", playerId: "user" }],
      metadata: { reasoning: "beginner-asks-everything", defaultIndex: 0, suggestion: null },
    };
    expect(decisionViewForWire(ask)).toBe(ask);
  });

  it("P3 debrief: a populated `metadata.suggestion` action survives on an `ask` (the field the post-game tally compares picks against)", () => {
    // `suggestion` lives ONLY on `ask` decisions (decisionGate.js sets it at the two
    // ask-build sites); pending sub-choices never carry one. Because `ask` is not a
    // PENDING_CHOICE_KIND it passes through decisionViewForWire whole — so the client
    // debrief reads decision.metadata.suggestion directly, no wire change needed.
    const suggestion = { kind: "cast-spell", cardId: "c1", name: "Llanowar Elves" };
    const ask = {
      kind: "ask",
      prompt: "Your move.",
      options: [suggestion, { kind: "pass-priority", playerId: "user" }],
      metadata: { reasoning: "beginner-asks-everything", difficulty: "beginner", defaultIndex: 0, suggestion },
    };
    const wire = decisionViewForWire(ask);
    expect(wire.metadata.suggestion).toEqual(suggestion);
    expect(wire.metadata.defaultIndex).toBe(0);
  });

  it("'unresolved' (the Arbiter enrichment) and terminal kinds pass through", () => {
    const unresolved = { kind: "unresolved", cardName: "Mystic Confluence", question: "?", oracle: "…", context: "…", stackObjectId: "stk-1" };
    expect(decisionViewForWire(unresolved)).toBe(unresolved);
    const over = { kind: "game-over", reason: "user-wins" };
    expect(decisionViewForWire(over)).toBe(over);
    const err = { kind: "dispatch-error", reason: "nope", code: "INVALID_CHOICE" };
    expect(decisionViewForWire(err)).toBe(err);
  });

  it("null-safe", () => {
    expect(decisionViewForWire(null)).toBeNull();
    expect(decisionViewForWire(undefined)).toBeNull();
  });
});
