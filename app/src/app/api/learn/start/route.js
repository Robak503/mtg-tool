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
import { decisionViewForWire } from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { putSession } from "../../../../lib/server/learnSessionStore.js";
import { autosaveSession } from "../../../../lib/server/learnSaveStore.js";
import { enrichDeck, enrichDecks } from "../../../../lib/server/learnDeckEnrich.js";

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

  // Enrich every deck card from the LOCAL oracle index before the engine sees it.
  // The client (LearnView.deckToCardArray) can only send `{ id, name }` — the deck
  // store has no type/mana/oracle — so without this the engine plays with BLANK
  // cards (no mana cost, no type, no effect). Local-first: index via paths.js, no
  // network. Unknown names stay blank (honest noop/Arbiter, never fabricated).
  let session;
  // CMD-COMPANION: a companion is a SINGLE card — enrich it via the array path + take the one entry.
  const enrichOne = (c) => (c ? enrichDeck([c])[0] || null : null);
  try {
    session = createLearnSession({
      userDeck: enrichDeck(body.userDeck),
      opponentDeck: enrichDeck(body.opponentDeck),
      opponentDecks: body.opponentDecks ? enrichDecks(body.opponentDecks) : null,
      userCommanders: enrichDeck(body.userCommanders || []),
      opponentCommanders: mode === "commander"
        ? enrichDecks(body.opponentCommanders || [])
        : enrichDeck(body.opponentCommanders || []),
      userCompanion: enrichOne(body.userCompanion),
      opponentCompanions: mode === "commander"
        ? (body.opponentCompanions || []).map(enrichOne)
        : enrichOne(body.opponentCompanions),
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

  // Capture deck identity at the route boundary (the pure engine never sees it)
  // so saved games + the resume list can show "Sliver Hivelord, turn 4". Purely
  // additive — the engine ignores session.meta.
  const meta = {
    userDeckId: typeof body.userDeckId === "string" ? body.userDeckId : null,
    userDeckName: typeof body.userDeckName === "string" ? body.userDeckName : null,
    opponentNames: Array.isArray(body.opponentDeckNames)
      ? body.opponentDeckNames.filter(n => typeof n === "string")
      : [],
  };
  session = { ...advanced.session, meta };

  putSession(session);
  // Autosave so the game survives a server restart. Awaited but error-swallowed:
  // a failed save must never break a playable game, but awaiting keeps the save
  // deterministic (it's a small atomic write on a user-paced turn).
  try { await autosaveSession(session); } catch { /* never block play on a save */ }

  return Response.json({
    sessionId: session.id,
    decision: decisionViewForWire(enrichUnresolvedDecision(advanced.decision, session.state)),
    status: session.status,
    mode: session.mode,
    difficulty: session.difficulty,
    turn: session.state.turn,
    activePlayer: session.state.activePlayer,
    step: session.state.step,
    table: tableSnapshot(session.state),
    board: boardSnapshot(session.state),
  });
}
