/**
 * POST /api/learn/ask — real-time tutor Q&A during a Learn-to-Play game.
 *
 *   { sessionId, question } -> { answer, provider }
 *
 * Loads the live GameState for the session, renders it into a compact board
 * context, and asks the local model (Jace's voice) to answer the player's
 * question grounded in the actual board + the current step. Local-first: this
 * is Ollama-only (no Anthropic fallback) — a tutor question shouldn't spend
 * API credits; if Ollama is down it returns a clear 503.
 */

export const runtime = "nodejs";

import { getSession } from "../../../../lib/server/learnSessionStore.js";
import { buildBoardContext } from "../../../../lib/learn/boardContext.js";
import { callModelMessages } from "../../../../lib/server/modelProvider.js";

const SYSTEM_BASE =
  "You are Jace, a calm, precise Magic: The Gathering rules tutor helping a player " +
  "during a Learn-to-Play game. Answer the player's question about the CURRENT board " +
  "state, the current step, or the relevant rules. Be concise (2-4 sentences) and " +
  "plain-spoken. Cite rules inline like (rule 509.1) only when you're sure. Use ONLY " +
  "the board state below — do not invent cards that aren't shown. Wrap card names in " +
  "[[double brackets]].";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const { sessionId } = body || {};
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!sessionId) return Response.json({ error: "sessionId required." }, { status: 400 });
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });

  const session = getSession(sessionId);
  if (!session) {
    return Response.json(
      { error: "Game session not found — it may have ended or the server restarted." },
      { status: 404 },
    );
  }

  const context = buildBoardContext(session.state);

  let result;
  try {
    result = await callModelMessages({
      provider: "ollama", // tutor Q&A stays local — never spend API credits
      agentName: "jace",
      fastLocal: true,
      max_tokens: 500,
      system: `${SYSTEM_BASE}\n\n${context}`,
      messages: [{ role: "user", content: question }],
    });
  } catch (error) {
    return Response.json({ error: error.message || "Tutor model error." }, { status: 502 });
  }

  if (!result.ok) {
    return Response.json(
      { error: "Jace is offline — make sure Ollama is running, then ask again." },
      { status: 503 },
    );
  }

  const answer = result.data?.content?.[0]?.text?.trim() || "(no answer)";
  return Response.json({ answer, provider: result.provider });
}
