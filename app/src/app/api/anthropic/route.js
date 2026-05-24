export const runtime = "nodejs";

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

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "Request body must include a messages array." }, { status: 400 });
  }

  const maxTokens = Number(body.max_tokens);
  const payload = {
    model: process.env.ANTHROPIC_MODEL || body.model || "claude-sonnet-4-20250514",
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 8000) : 2500,
    system: body.system || "",
    messages: body.messages
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { error: data.error || data.message || "Anthropic request failed." },
        { status: response.status }
      );
    }

    return Response.json(data, { status: response.status });
  } catch {
    return Response.json({ error: "Could not reach Anthropic API." }, { status: 502 });
  }
}
