export const runtime = "nodejs";

import { ARBITER_PROMPT, ARBITER_PROMPT_FAST } from "../../../lib/agents";
import { buildServerCardContext } from "../../../lib/server/cardContext";
import { callModelMessages } from "../../../lib/server/modelProvider";

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
  const userContent = `${explicitCardContext}${autoCardContext}${body.context || ""}## USER QUESTION\n\n${question}`;
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

  return Response.json({
    provider: result.provider,
    trace: result.data.content?.[0]?.text || "",
  }, { status: result.status });
}
