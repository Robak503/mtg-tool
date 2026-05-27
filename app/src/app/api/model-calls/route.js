export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../lib/server/paths";

const MODEL_CALL_LOG = dataPath("model-calls.local.json");

function summarize(calls) {
  const providers = {
    anthropic: { total: 0, ok: 0, failed: 0 },
    ollama: { total: 0, ok: 0, failed: 0 },
  };

  for (const call of calls) {
    const provider = call.provider === "ollama" ? "ollama" : call.provider === "anthropic" ? "anthropic" : null;
    if (!provider) continue;
    providers[provider].total += 1;
    if (call.ok) providers[provider].ok += 1;
    else providers[provider].failed += 1;
  }

  const last = calls[calls.length - 1] || null;
  return {
    total: calls.length,
    providers,
    last: last ? {
      timestamp: last.timestamp,
      provider: last.provider,
      model: last.model,
      modelTier: last.modelTier || null,
      fastLocal: Boolean(last.fastLocal),
      ok: last.ok,
      status: last.status,
      error: last.error,
    } : null,
  };
}

export async function GET() {
  try {
    const raw = await fs.readFile(MODEL_CALL_LOG, "utf8");
    const parsed = JSON.parse(raw);
    const calls = Array.isArray(parsed.calls) ? parsed.calls : [];
    return Response.json(summarize(calls));
  } catch (error) {
    if (error.code === "ENOENT") {
      return Response.json(summarize([]));
    }
    return Response.json({ error: "Could not read local model-call log." }, { status: 500 });
  }
}
