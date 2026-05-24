export const runtime = "nodejs";

import { ARBITER_PROMPT, ARBITER_PROMPT_FAST } from "../../../lib/agents";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === "sk-ant-your-key-here") {
    return Response.json(
      { error: "Missing ANTHROPIC_API_KEY. Create .env.local from .env.local.example and restart the dev server." },
      { status: 500 }
    );
  }

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

  const userContent = `${body.cardContext || ""}${body.context || ""}## USER QUESTION\n\n${question}`;
  const maxTokens = Number(body.max_tokens);
  const payload = {
    model: process.env.ANTHROPIC_MODEL || body.model || DEFAULT_MODEL,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 8000) : 2500,
    system: body.fast ? ARBITER_PROMPT_FAST : ARBITER_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { error: data.error || data.message || "Arbiter request failed." },
        { status: response.status }
      );
    }

    return Response.json({ trace: data.content?.[0]?.text || "" }, { status: response.status });
  } catch {
    return Response.json({ error: "Could not reach Anthropic API for Arbiter." }, { status: 502 });
  }
}
