/**
 * POST /api/learn/start
 *
 * Body (Standard 1v1):
 *   {
 *     userDeck:      Card[],
 *     opponentDeck:  Card[],
 *     userCommanders?: Card[],
 *     opponentCommanders?: Card[],
 *     difficulty: "beginner" | "intermediate" | "expert",
 *     activePlayer?: "user" | "ai",
 *     mode?: "standard"
 *   }
 * Body (Commander 4P FFA):
 *   {
 *     userDeck:      Card[],
 *     opponentDecks: [Card[], Card[], Card[]],          // exactly 3 (the pod)
 *     userCommanders?: Card[],
 *     opponentCommanders?: [Card[], Card[], Card[]],     // per-opponent
 *     difficulty: "beginner" | "intermediate" | "expert",
 *     mode: "commander"
 *   }
 *
 * Response:
 *   { sessionId, decision, status }
 *
 * Where `decision` is the result of advanceUntilDecision — usually
 * an "ask" with prompt + options, or "game-over" if the deck setup
 * was already terminal.
 *
 * Errors:
 *   400 — missing/invalid body
 *   500 — engine threw (shouldn't happen with valid input)
 */

export const runtime = "nodejs";

import { createLearnSession, advanceUntilDecision } from "../../../../lib/learn/learnSession.js";
import { putSession } from "../../../../lib/server/learnSessionStore.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const mode = body?.mode === "commander" ? "commander" : "standard";

  if (!Array.isArray(body?.userDeck) || body.userDeck.length === 0) {
    return Response.json({ error: "userDeck is required and must be a non-empty array." }, { status: 400 });
  }
  if (mode === "commander") {
    if (!Array.isArray(body?.opponentDecks) || body.opponentDecks.length !== 3) {
      return Response.json({ error: "commander mode requires opponentDecks: an array of exactly 3 opponent decks (the pod)." }, { status: 400 });
    }
  } else if (!Array.isArray(body?.opponentDeck) || body.opponentDeck.length === 0) {
    return Response.json({ error: "opponentDeck is required and must be a non-empty array." }, { status: 400 });
  }

  let session;
  try {
    session = createLearnSession({
      userDeck: body.userDeck,
      opponentDeck: body.opponentDeck,
      opponentDecks: body.opponentDecks || null,
      userCommanders: body.userCommanders || [],
      opponentCommanders: body.opponentCommanders || [],
      difficulty: body.difficulty || "beginner",
      activePlayer: body.activePlayer || "user",
      mode,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not start learn session." }, { status: 400 });
  }

  let advanced;
  try {
    advanced = advanceUntilDecision(session);
  } catch (error) {
    return Response.json({ error: error.message || "Engine error advancing to first decision." }, { status: 500 });
  }

  putSession(advanced.session);

  return Response.json({
    sessionId: advanced.session.id,
    decision: stripDecisionForWire(advanced.decision),
    status: advanced.session.status,
    mode: advanced.session.mode,
    turn: advanced.session.state.turn,
    activePlayer: advanced.session.state.activePlayer,
    step: advanced.session.state.step,
  });
}

/**
 * Strip non-serialisable properties from a decision before sending it
 * over the wire. payload.onResolve functions on stack objects don't
 * round-trip — they live only in server memory.
 */
function stripDecisionForWire(decision) {
  if (!decision) return null;
  if (decision.kind !== "ask") return decision;
  return {
    ...decision,
    options: (decision.options || []).map(opt => {
      const { ...safe } = opt;
      return safe;
    }),
    // metadata.suggestion has the same shape as an option; keep it
    // but strip any function fields.
    metadata: decision.metadata ? {
      ...decision.metadata,
      suggestion: decision.metadata.suggestion ? { ...decision.metadata.suggestion } : null,
    } : undefined,
  };
}
