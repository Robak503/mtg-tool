/**
 * REBOUND (CR 702.88) — a trailing `Rebound` keyword line changes an instant/sorcery's resolution
 * DISPOSITION: "If you cast this spell from your hand, EXILE it as it resolves" (702.88a), replacing the
 * default CR 608.2n graveyard put, and grants a delayed OPTIONAL upkeep recast (702.88a).
 *
 * Modeled FAITHFULLY (stripReboundLine + program.selfExile), NOT as a text-strip:
 *   (1) EXILE-ON-RESOLUTION — the body is peeled off, and the HIGH program is stamped `selfExile`, so
 *       runEffectProgram's GY-1 exiles the spell (reuses Finale of Revelation's proven selfExile disposition).
 *       Letting the card hit the graveyard would be a forbidden FP (it changes every graveyard read).
 *   (2) DECLINE-THE-RECAST — the delayed upkeep recast is OPTIONAL (702.88a "you MAY cast"); the engine never
 *       offers it, which is the CR-legal line where the controller DECLINES (702.88a sends it nowhere else — the card stays in exile
 *       for the rest of the game). Declining FABRICATES NOTHING; the only wrong-play risk (exile vs GY) is exact.
 *
 * YOUR CARD: Quantum Misalignment — {4}{U} Sorcery: "Create a token that's a copy of target creature you
 * control, except it isn't legendary. Rebound (…)". The token-copy body already parses HIGH (create-token-copy,
 * copySource:"target"); rebound was the only blocker.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { parseEffectProgram, programConfidence } from "./parser.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

const REBOUND_REMINDER =
  "Rebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)";

const QUANTUM = {
  name: "Quantum Misalignment",
  type: "Sorcery",
  mana: "{4}{U}",
  oracle:
    "Create a token that's a copy of target creature you control, except it isn't legendary.\n" +
    REBOUND_REMINDER,
};

function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
// The spell card object (payload.spellToGraveyard) so GY-1 can dispose it (to GY, or — with selfExile — to exile).
const CARD = { id: "quantum-card", name: "Quantum Misalignment", type: "Sorcery" };
function stackObj(program, { controller = "user", targets = [] } = {}) {
  return {
    id: "stk-1",
    kind: "spell",
    source: { name: "Quantum Misalignment", oracle: QUANTUM.oracle },
    controller,
    targets,
    cost: null,
    payload: {
      resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
      params: { program, controller, targets, spellToGraveyard: { playerId: controller, card: CARD } },
    },
  };
}

describe("Quantum Misalignment — parse + classify (the flip)", () => {
  it("classifies native-spell and stamps selfExile on the token-copy body", () => {
    expect(classifyCard(QUANTUM)).toBe("native-spell");
    const p = parseEffectProgram(QUANTUM);
    expect(programConfidence(p)).toBe("high");
    expect(p.selfExile).toBe(true);
    // The body is the already-modeled target-copy atom; rebound added ONLY the exile disposition, no extra atom.
    expect(p.atoms.map((a) => a.op)).toEqual(["create-token-copy"]);
    expect(p.atoms[0]).toMatchObject({ copySource: "target", targetType: "creature" });
  });
});

describe("Quantum Misalignment — runtime (the real state divergence: exile, not graveyard)", () => {
  it("makes a token copy of the controller's creature AND exiles the spell (never to the graveyard)", () => {
    // A creature the controller owns, to be the copy target.
    const original = {
      id: "orig-1",
      card: { name: "Grizzly Bears", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
      controller: "user",
      tapped: false,
      summoningSick: false,
      counters: {},
      damageMarked: 0,
      attachments: [],
      attachedTo: null,
    };
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, battlefield: [original], graveyard: [], exile: [], hand: [] },
      },
    };
    const program = parseEffectProgram(QUANTUM);
    const target = { kind: "permanent", id: "orig-1", controller: "user" };
    const out = runEffectProgram(state, stackObj(program, { targets: [target] }));

    // A token copy was minted (battlefield now has the original + one token copy).
    const bf = out.players.user.battlefield;
    expect(bf.length).toBe(2);
    const token = bf.find((p) => p.id !== "orig-1");
    expect(token).toBeTruthy();
    expect(token.token || token.card?.token).toBeTruthy();

    // THE CREED-LOAD-BEARING ASSERTION: the spell went to EXILE, NOT the graveyard.
    expect(out.players.user.graveyard.map((c) => c.id)).toEqual([]); // spell NOT in graveyard
    expect((out.players.user.exile || []).map((c) => c.id)).toEqual(["quantum-card"]); // spell exiled itself
    expect(out.pendingArbiter).toBeUndefined();
  });
});

describe("rebound strip — variants + boundary handling", () => {
  it("handles a BARE `Rebound` (no reminder parenthetical) — e.g. Unnatural Summons' tail form", () => {
    const bare = {
      name: "Bare Rebound Bolt",
      type: "Instant",
      oracle: "Bare Rebound Bolt deals 2 damage to any target.\nRebound",
    };
    const p = parseEffectProgram(bare);
    expect(programConfidence(p)).toBe("high");
    expect(p.selfExile).toBe(true);
    expect(p.atoms.map((a) => a.op)).toEqual(["deal-damage"]);
  });

  it("preserves the body's terminating period and does not eat a real clause", () => {
    // The strip must remove ONLY the rebound tail; the preceding "deals 2 damage." sentence stays intact.
    const p = parseEffectProgram({
      name: "Period Guard Bolt",
      type: "Instant",
      oracle: "Period Guard Bolt deals 2 damage to any target.\n" + REBOUND_REMINDER,
    });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["deal-damage"]);
  });
});

describe("rebound — CREED near-misses (never a partial / over-fire)", () => {
  it("an UNMODELED rebound body stays LOW → Arbiter, and carries NO selfExile", () => {
    // FIXTURE SWAPPED — this used to use Ephemerate's FLICKER body as its example of "unmodeled". The blink
    // slice models that body now (CR 400.7), so the example stopped exercising anything and the test would
    // have passed vacuously in the other direction. The ASSERTION's intent is untouched and still the point:
    // stripping rebound MUST NOT fabricate a native flip for a body the engine cannot model. Swapped to a
    // counted edict, which is genuinely unmodeled (it sits on parser.test.js's MUST_DROP_TO_LOW gate).
    const unmodeledBody = {
      name: "Reboundless Edict",
      type: "Instant",
      oracle: "Each player sacrifices two creatures of their choice.\n" + REBOUND_REMINDER,
    };
    expect(classifyCard(unmodeledBody)).toBe("arbiter-spell");
    const p = parseEffectProgram(unmodeledBody);
    expect(programConfidence(p)).toBe("low");
    expect(p.selfExile).toBeUndefined();
  });

  it("EPHEMERATE now flips — its flicker body is modeled, so rebound stripping EARNS the native tier", () => {
    // The positive counterpart to the swap above: the same card that used to prove "unmodeled bodies park"
    // now proves the opposite half of the rule — a MODELED body plus rebound is a legitimate flip, not a
    // fabricated one. Keeping both halves in this file is what stops the swap from quietly weakening it.
    const ephemerate = {
      name: "Ephemerate",
      type: "Instant",
      oracle:
        "Exile target creature you control, then return it to the battlefield under its owner's control.\n" +
        REBOUND_REMINDER,
    };
    expect(classifyCard(ephemerate)).toMatch(/^native/);
    expect(parseEffectProgram(ephemerate).selfExile).toBe(true);
  });

  it("a NON-rebound token-copy spell keeps the default graveyard disposition (no over-fire)", () => {
    // The SAME body WITHOUT rebound must NOT be stamped selfExile — the strip only fires on a real rebound line.
    const noRebound = {
      name: "Plain Duplication",
      type: "Sorcery",
      oracle: "Create a token that's a copy of target creature you control, except it isn't legendary.",
    };
    const p = parseEffectProgram(noRebound);
    expect(programConfidence(p)).toBe("high");
    expect(p.selfExile).toBeUndefined(); // no rebound → default GY-1 graveyard disposition

    // Runtime proof: the plain (non-rebound) spell resolves to the GRAVEYARD, not exile.
    const original = {
      id: "orig-2",
      card: { name: "Grizzly Bears", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
      controller: "user",
      tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null,
    };
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, battlefield: [original], graveyard: [], exile: [], hand: [] },
      },
    };
    const plainCard = { id: "plain-card", name: "Plain Duplication", type: "Sorcery" };
    const stack = {
      id: "stk-2", kind: "spell", source: { name: "Plain Duplication", oracle: noRebound.oracle },
      controller: "user", targets: [{ kind: "permanent", id: "orig-2", controller: "user" }], cost: null,
      payload: {
        resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
        params: { program: p, controller: "user", targets: [{ kind: "permanent", id: "orig-2", controller: "user" }], spellToGraveyard: { playerId: "user", card: plainCard } },
      },
    };
    const out = runEffectProgram(state, stack);
    expect(out.players.user.graveyard.map((c) => c.id)).toEqual(["plain-card"]); // default → graveyard
    expect((out.players.user.exile || []).map((c) => c.id)).toEqual([]); // NOT exiled
  });
});
