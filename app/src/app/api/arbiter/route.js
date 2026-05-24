export const runtime = "nodejs";

import { ARBITER_PROMPT, ARBITER_PROMPT_FAST } from "../../../lib/agents";
import { buildServerCardContext } from "../../../lib/server/cardContext";
import { callModelMessages } from "../../../lib/server/modelProvider";

function detectArbiterStatus(trace) {
  if (!trace) return "unresolved";
  if (/^UNRESOLVED/m.test(trace)) return "unresolved";
  if (/needs.{0,20}clarification/i.test(trace)) return "needs_clarification";
  if (/no.{0,30}(citation|rule number|codex)/i.test(trace) || /citation.{0,30}not found/i.test(trace)) return "citation_failed";
  if (/RESOLUTION/m.test(trace) && /RULE TRACE/m.test(trace)) return "resolved";
  return "unresolved";
}

async function buildServerEngineContext(request, question, existingContext) {
  if (String(existingContext || "").includes("## LOCAL MTG ENGINE / JUDGE CONTEXT")) return "";

  try {
    const response = await fetch(new URL("/api/engine", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question, limit: 5 }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.context || "";
  } catch {
    return "";
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const question = String(body.question || "").trim();
  if (!question) {
    return Response.json({ error: "Request body must include a question." }, { status: 400 });
  }

  const explicitCardContext = String(body.cardContext || "");
  const autoCardContext = explicitCardContext
    ? ""
    : await buildServerCardContext(question, {
        includeRulings: true,
        maxCardNames: 8,
        maxRulingsPerCard: 3,
      });
  const explicitEngineContext = String(body.context || "");
  const autoEngineContext = await buildServerEngineContext(request, question, explicitEngineContext);
  const userContent = `${explicitCardContext}${autoCardContext}${autoEngineContext}${explicitEngineContext}## USER QUESTION\n\n${question}`;
  const payload = {
    model: body.model,
    provider: body.provider,
    max_tokens: body.max_tokens,
    system: body.fast ? ARBITER_PROMPT_FAST : ARBITER_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };

  const result = await callModelMessages(payload);
  if (!result.ok) {
    return Response.json(result.data, { status: result.status });
  }

  const trace = result.data.content?.[0]?.text || "";
  return Response.json({
    provider: result.provider,
    trace,
    status: detectArbiterStatus(trace),
  }, { status: result.status });
}
