/**
 * FREE-CAST (CR 601.2b) — "you may cast a spell with mana value N or less from your hand without
 * paying its mana cost" (Rishkar's Expertise + the Expertise cycle).
 *
 * ARCHITECTURE mirrors DISCOVER: the free-cast atom parks eligible hand cards in state.pendingFreeCast;
 * the controller's cast-free/decline decision is resolved at the ACTION layer (legalChoices → dispatch),
 * reusing the freeCast cast-spell path so targeting / the stack / cast triggers / AI all behave exactly
 * like a normal cast — only the mana payment is skipped (CR 601.2b).
 *
 * Covers:
 *   - the atom parks eligible hand cards (MV cap + instant/sorcery type filter); whiff = clean no-op
 *   - the clause parser → a HIGH program → native-spell classification (Rishkar's Expertise et al.)
 *   - GENUINE RESOLUTION (the cardinal CREED test): a free-cast actually casts the picked card with
 *     ZERO mana spent, and it resolves onto the battlefield / through the interpreter
 *   - decline (the "may") clears the decision and casts nothing
 *   - the AI never stalls on a pending free-cast
 *   - ANTI-FP: an unmodeled free-cast variant ("any number of spells" / variable cap) stays LOW
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { freeCastClauseParser, freeCastEligible } from "./effects/atoms/freeCast.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

const spell = (id, name, mv) => ({ id, name, type: "Instant", oracle: "", mana: `{${mv}}` });
const creatureCard = (id, name, mv) => ({ id, name, type: "Creature — Beast", oracle: "", mana: `{${mv}}` });
const land = (id, name = "Forest") => ({ id, name, type: "Basic Land — Forest", oracle: "", mana: "" });

// Resolve the free-cast atom directly (controller = user) with the given MV cap + optional type filter.
const freeCastAtom = (st, atom) =>
  resolveAtom(st, { op: "free-cast", targetType: null, ...atom }, { controller: "user", targets: [], cardName: "Expertise" });

function stateWithHand(hand) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand } } };
}

// A state mid-free-cast: eligible cards sit in hand + pendingFreeCast is set (as the atom would leave it).
function midFreeCast(hand, { maxMv = 5, typeFilter = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, manaPool: { ...s.players.user.manaPool } } },
    pendingFreeCast: { controller: "user", candidateIds: hand.map((c) => c.id), maxMv, typeFilter, sourceName: "Rishkar's Expertise" },
  };
}

describe("free-cast clause parser (CR 601.2b)", () => {
  it("parses the fixed-MV-cap form → a free-cast atom with maxMv", () => {
    expect(freeCastClauseParser("You may cast a spell with mana value 5 or less from your hand without paying its mana cost"))
      .toEqual({ op: "free-cast", maxMv: 5, typeFilter: null, targetType: null });
  });

  it("parses the instant-or-sorcery + MV-cap form → typeFilter instantSorcery", () => {
    expect(freeCastClauseParser("You may cast an instant or sorcery spell with mana value 2 or less from your hand without paying its mana cost"))
      .toEqual({ op: "free-cast", maxMv: 2, typeFilter: "instantSorcery", targetType: null });
  });

  it("parses the instant-or-sorcery, no-cap form", () => {
    expect(freeCastClauseParser("You may cast an instant or sorcery spell from your hand without paying its mana cost"))
      .toEqual({ op: "free-cast", maxMv: null, typeFilter: "instantSorcery", targetType: null });
  });

  it("REJECTS unmodeled variants (anti-FP): variable cap, plural multi-cast, relational cap", () => {
    expect(freeCastClauseParser("You may cast a spell with mana value X or less from your hand without paying its mana cost")).toBeNull();
    expect(freeCastClauseParser("You may cast any number of spells from your hand without paying their mana costs")).toBeNull();
    expect(freeCastClauseParser("You may cast a spell with equal or lesser mana value from your hand without paying its mana cost")).toBeNull();
    expect(freeCastClauseParser("You may cast spells from your hand without paying their mana costs")).toBeNull(); // Omniscience
  });
});

describe("free-cast eligibility", () => {
  it("excludes lands, excludes over-cap, honors the instant/sorcery filter", () => {
    expect(freeCastEligible(spell("a", "Bolt", 1), { maxMv: 5, typeFilter: null })).toBe(true);
    expect(freeCastEligible(land("l"), { maxMv: 5, typeFilter: null })).toBe(false);               // land never castable
    expect(freeCastEligible(creatureCard("c", "Giant", 7), { maxMv: 5, typeFilter: null })).toBe(false); // over the MV cap
    expect(freeCastEligible(creatureCard("c", "Bear", 2), { maxMv: 5, typeFilter: "instantSorcery" })).toBe(false); // not I/S
    expect(freeCastEligible(spell("a", "Bolt", 1), { maxMv: 5, typeFilter: "instantSorcery" })).toBe(true);
  });
});

describe("free-cast atom — parks eligible hand cards", () => {
  it("parks exactly the eligible cards (MV<=cap, non-land) in pendingFreeCast", () => {
    const st = freeCastAtom(stateWithHand([spell("a", "Bolt", 1), creatureCard("b", "Giant", 7), land("l"), creatureCard("c", "Bear", 3)]), { maxMv: 5 });
    expect(st.pendingFreeCast).toMatchObject({ controller: "user", maxMv: 5 });
    expect(st.pendingFreeCast.candidateIds.sort()).toEqual(["a", "c"]); // Bolt(1) + Bear(3); Giant(7) + land excluded
  });

  it("a whiff (no eligible card) sets NO decision and casts nothing (the 'may' isn't taken)", () => {
    const st = freeCastAtom(stateWithHand([creatureCard("b", "Giant", 7), land("l")]), { maxMv: 5 });
    expect(st.pendingFreeCast).toBeFalsy(); // no eligible card → clean no-op, never a fabricated cast
  });

  it("honors the instant/sorcery type filter when parking", () => {
    const st = freeCastAtom(stateWithHand([spell("a", "Bolt", 1), creatureCard("c", "Bear", 1)]), { maxMv: 5, typeFilter: "instantSorcery" });
    expect(st.pendingFreeCast.candidateIds).toEqual(["a"]); // only the instant
  });
});

describe("free-cast classification — Rishkar's Expertise et al. flip native-spell", () => {
  it("Rishkar's Expertise (draw + free-cast) → a HIGH program → native-spell", () => {
    const card = {
      name: "Rishkar's Expertise", type: "Sorcery", mana: "{4}{G}{G}",
      oracle: "Draw cards equal to the greatest power among creatures you control.\nYou may cast a spell with mana value 5 or less from your hand without paying its mana cost.",
    };
    const program = parseEffectProgram(card);
    expect(programConfidence(program)).toBe("high");
    expect(classifyCard(card)).toBe("native-spell");
  });

  it("Kari Zev's Expertise (gain-control + free-cast) — the lead clause gates it (control-theft unmodeled), free-cast clause itself parses", () => {
    // The free-cast clause is modeled; whether the WHOLE card flips depends on its lead effect.
    // Yahenni's Expertise's lead (-3/-3 to all) is modeled, so prove that one flips:
    const yahenni = {
      name: "Yahenni's Expertise", type: "Sorcery", mana: "{2}{B}{B}",
      oracle: "All creatures get -3/-3 until end of turn.\nYou may cast a spell with mana value 3 or less from your hand without paying its mana cost.",
    };
    expect(classifyCard(yahenni)).toBe("native-spell");
  });

  it("the free-cast atom MUST be the program's LAST atom (an atom after it forces LOW)", () => {
    // Reverse the printed order: free-cast then draw. The guard in programConfidence forces LOW (the
    // action-layer decision must resolve after the program finishes — no atom may run after it).
    const reversed = parseEffectClause(
      "You may cast a spell with mana value 5 or less from your hand without paying its mana cost.\nDraw a card.",
      "Sorcery",
    );
    expect(programConfidence(reversed)).toBe("low");
  });

  it("ANTI-FP: an unmodeled free-cast spell (Omniscience-style 'cast spells … without paying') stays NOT native", () => {
    const omniscienceLike = {
      name: "Test Omniscience", type: "Sorcery", mana: "{4}{U}{U}",
      oracle: "You may cast spells from your hand without paying their mana costs.",
    };
    // The plural multi-cast clause is NOT modeled → the program is LOW → arbiter-spell (never native).
    expect(classifyCard(omniscienceLike)).toBe("arbiter-spell");
  });
});

describe("free-cast action layer — the cast-or-decline decision (CR 601.2b)", () => {
  it("while a free-cast is pending, ONLY free-cast / decline actions are offered, nothing else; no one else acts", () => {
    const st = midFreeCast([spell("a", "Bolt", 1), creatureCard("c", "Bear", 3)]);
    const acts = legalActionsForPlayer(st, "user");
    expect(acts.every((a) => a.kind === "cast-spell" || a.kind === "free-cast-decline")).toBe(true);
    expect(filterActions(acts, "cast-spell").every((a) => a.freeCast && a.fromZone === "hand")).toBe(true); // free, from hand
    expect(acts.some((a) => a.kind === "free-cast-decline")).toBe(true);
    expect(filterActions(acts, "cast-spell")).toHaveLength(2); // one per eligible candidate
    expect(legalActionsForPlayer(st, "ai")).toEqual([]); // mid-resolution: no one else acts
  });

  it("GENUINE RESOLUTION — casting a candidate FREE spends ZERO mana, the card leaves hand → stack → resolves", () => {
    let st = midFreeCast([creatureCard("f1", "Free Beast", 3)]);
    const poolBefore = { ...st.players.user.manaPool };
    const cast = filterActions(legalActionsForPlayer(st, "user"), "cast-spell")[0];
    expect(cast.freeCast).toBe(true);
    st = dispatchAction(st, cast);
    expect(st.pendingFreeCast).toBeFalsy();                               // decision resolved + flag cleared
    expect(st.players.user.manaPool).toEqual(poolBefore);                 // ZERO mana spent (CR 601.2b)
    expect(st.players.user.hand).toHaveLength(0);                         // the card left hand
    expect(st.stack.some((o) => o.source?.name === "Free Beast")).toBe(true); // it's on the stack
    st = resolveTopOfStack(st);                                           // the free-cast creature resolves
    expect(st.players.user.battlefield.some((p) => p.card.name === "Free Beast")).toBe(true);
  });

  it("declining clears the decision and casts nothing (the 'may' — CR 601.2b)", () => {
    let st = midFreeCast([spell("a", "Bolt", 1)]);
    const decline = legalActionsForPlayer(st, "user").find((a) => a.kind === "free-cast-decline");
    st = dispatchAction(st, decline);
    expect(st.pendingFreeCast).toBeFalsy();
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Bolt"]); // still in hand, not cast
    expect(st.stack).toHaveLength(0);
  });

  it("a candidate that left the hand mid-pause is NOT offered (no phantom cast)", () => {
    // pendingFreeCast lists two ids but only one card is actually in hand now (the other was discarded).
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [spell("a", "Bolt", 1)] } },
      pendingFreeCast: { controller: "user", candidateIds: ["a", "gone"], maxMv: 5, typeFilter: null, sourceName: "Expertise" },
    };
    const casts = filterActions(legalActionsForPlayer(st, "user"), "cast-spell");
    expect(casts).toHaveLength(1);          // only the in-hand "a" is offered
    expect(casts[0].cardId).toBe("a");
  });

  it("the AI resolves a pending free-cast without stalling (never returns null)", () => {
    const st = midFreeCast([creatureCard("f1", "AI Beast", 2)]);
    const acts = legalActionsForPlayer(st, "user"); // pf.controller is "user" in this fixture
    const action = pickAction(st, "user", acts);
    expect(action).toBeTruthy(); // an action is always available (cast-free or decline) — the AI never wedges
  });

  it("the AI DECLINES (not null) when every free-cast candidate is a HELD type — no livelock", () => {
    // A symmetric wipe IS enumerable in the window but pickCastAction HOLDS it (programContainsMassRemoval).
    // Before the fix pickAction fell through to `find pass-priority` → undefined (this window has no pass),
    // the driver force-passed WITHOUT clearing pendingFreeCast, and the game wedged in this window forever.
    const wipe = { id: "w1", name: "Day of Judgment", type: "Sorcery", oracle: "Destroy all creatures.", mana: "{2}{W}{W}" };
    const st = midFreeCast([wipe]);
    const acts = legalActionsForPlayer(st, "user");
    expect(filterActions(acts, "cast-spell").length).toBeGreaterThan(0); // the wipe IS offered…
    const action = pickAction(st, "user", acts);
    expect(action?.kind).toBe("free-cast-decline"); // …but the AI takes the decline, never null
    const after = dispatchAction(st, action);
    expect(after.pendingFreeCast).toBeFalsy(); // flag cleared — the game proceeds
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["w1"]); // declined, not cast
  });

  it("DRIVER: an AI-seat pending free-cast with only held candidates resolves via decline — the game does not wedge", () => {
    const forest = (i) => ({ id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
    const deck = (p) => Array.from({ length: 30 }, (_, i) => forest(`${p}-${i}`));
    let session = createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner" });
    const wipe = { id: "w9", name: "Day of Judgment", type: "Sorcery", oracle: "Destroy all creatures.", mana: "{2}{W}{W}" };
    session = {
      ...session,
      state: {
        ...session.state,
        activePlayer: "ai", phase: "precombat-main", step: "main", priorityHolder: "ai", consecutivePasses: 0,
        players: { ...session.state.players, ai: { ...session.state.players.ai, hand: [...session.state.players.ai.hand, wipe] } },
        pendingFreeCast: { controller: "ai", candidateIds: ["w9"], maxMv: 5, typeFilter: null, sourceName: "Expertise" },
      },
    };
    const { session: after, decision } = advanceUntilDecision(session);
    expect(after.state.pendingFreeCast).toBeFalsy();                              // the window resolved
    expect(decision.kind).not.toBe("engine-stuck");
    expect(after.status).toBe("active");                                          // not a drained / wedged game
    expect(after.state.players.ai.hand.some((c) => c.id === "w9")).toBe(true);    // declined, not cast
  });
});
