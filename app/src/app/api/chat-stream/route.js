export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

// Mirrors constants from modelProvider.js — kept local to avoid side effects from imports
const DEFAULT_OLLAMA_MODEL = "qwen2.5:32b";
const DEFAULT_OLLAMA_FAST_MODEL = "qwen2.5:7b";
// Karn and Tibalt use a mid-tier model for better reasoning quality.
// Defaults to the same model as Arbiter (14b) — already loaded, no extra RAM cost.
const DEFAULT_OLLAMA_AGENT_MODEL = "qwen2.5:14b";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_CONTEXT = 32768;
const MODEL_CALL_LOG = path.join(process.cwd(), "data", "model-calls.local.json");

function resolveProvider(requested) {
  return String(requested || process.env.MTG_MODEL_PROVIDER || process.env.MODEL_PROVIDER || "ollama")
    .trim().toLowerCase();
}

function maxTokens(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8000) : 2500;
}

function ollamaCtx(value) {
  const n = Number(value || process.env.OLLAMA_NUM_CTX);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32768) : DEFAULT_OLLAMA_CONTEXT;
}

function inputCharCount(body = {}) {
  const systemChars = String(body.system || "").length;
  const messageChars = (body.messages || []).reduce((sum, message) => sum + String(message.content || "").length, 0);
  return { systemChars, messageChars, totalChars: systemChars + messageChars };
}

function anthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  return k && k !== "sk-ant-your-key-here" ? k : "";
}

async function logCall(entry) {
  try {
    await fs.mkdir(path.dirname(MODEL_CALL_LOG), { recursive: true });
    let data = { version: 1, calls: [] };
    try {
      const raw = await fs.readFile(MODEL_CALL_LOG, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.calls)) data = parsed;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    data.calls = [...data.calls, entry].slice(-1000);
    await fs.writeFile(MODEL_CALL_LOG, JSON.stringify(data, null, 2));
  } catch { /* logging must never block */ }
}

// SSE helper: encode one event line
function encodeEvent(obj) {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "Request body must include a messages array." }, { status: 400 });
  }

  const provider = resolveProvider(body.provider);
  const isOllama = provider === "ollama" || provider === "local";
  const callStart = Date.now();
  let resolvedModel = null;

  const stream = new ReadableStream({
    async start(controller) {
      let outputChars = 0;
      let outputTokens = null;
      let errorOccurred = null;

      try {
        if (isOllama) {
          // ── Ollama NDJSON streaming ────────────────────────────────────────
          // Karn and Tibalt always use the mid-tier model for reasoning quality,
          // regardless of the user's tier selector. Jace and other agents respect Fast/Deep.
          const isAgentModel = isOllama && ["karn", "tibalt"].includes(String(body.agentName || "").toLowerCase());
          const model = body.ollamaModel ||
            (isAgentModel ? (process.env.OLLAMA_AGENT_MODEL || process.env.OLLAMA_ARBITER_MODEL || DEFAULT_OLLAMA_AGENT_MODEL) : null) ||
            (body.fastLocal ? (process.env.OLLAMA_FAST_MODEL || DEFAULT_OLLAMA_FAST_MODEL) : null) ||
            process.env.OLLAMA_MODEL ||
            DEFAULT_OLLAMA_MODEL;
          resolvedModel = model;
          const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
          const system = body.system ? [{ role: "system", content: body.system }] : [];
          const messages = [...system, ...(body.messages || [])].map(m => ({
            role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
            content: String(m.content || ""),
          }));

          const controller120 = new AbortController();
          const tid = setTimeout(() => controller120.abort(), 120_000);

          let ollamaResp;
          try {
            ollamaResp = await fetch(`${baseUrl}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller120.signal,
              body: JSON.stringify({
                model,
                messages,
                stream: true,
                options: {
                  num_predict: maxTokens(body.max_tokens),
                  num_ctx: ollamaCtx(body.ollamaContext),
                },
              }),
            });
          } catch (fetchError) {
            clearTimeout(tid);
            const isTimeout = fetchError?.name === "AbortError";
            const errMsg = isTimeout
              ? "Ollama request timed out after 120s."
              : `Could not reach Ollama at ${baseUrl}. Start with: ollama serve`;
            controller.enqueue(encodeEvent({
              type: "error",
              error: errMsg,
              provider: "ollama",
              fallbackAvailable: Boolean(anthropicKey()),
              timeout: isTimeout,
            }));
            errorOccurred = errMsg;
            controller.close();
            return;
          }
          clearTimeout(tid);

          if (!ollamaResp.ok) {
            const errData = await ollamaResp.json().catch(() => ({}));
            const errText = String(errData.error || "Ollama error");
            const isModelMissing = /model.{0,40}not found|pull/i.test(errText);
            const errMsg = isModelMissing
              ? `Ollama model "${model}" not pulled. Run: ollama pull ${model}`
              : errText;
            controller.enqueue(encodeEvent({
              type: "error",
              error: errMsg,
              provider: "ollama",
              fallbackAvailable: Boolean(anthropicKey()),
              modelMissing: isModelMissing,
            }));
            errorOccurred = errMsg;
            controller.close();
            return;
          }

          // Read NDJSON lines from Ollama
          const reader = ollamaResp.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop();
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                const token = event.message?.content || event.response || "";
                if (token) {
                  outputChars += token.length;
                  controller.enqueue(encodeEvent({ type: "text_delta", text: token }));
                }
                if (event.done) {
                  outputTokens = event.eval_count ?? null;
                  controller.enqueue(encodeEvent({
                    type: "done",
                    provider: "ollama",
                    model,
                    modelTier: isAgentModel ? "mid" : (body.modelTier || (body.fastLocal ? "fast" : "deep")),
                    usage: { output_tokens: outputTokens },
                  }));
                }
              } catch { /* skip malformed NDJSON line */ }
            }
          }
        } else {
          // ── Anthropic SSE streaming ────────────────────────────────────────
          const apiKey = anthropicKey();
          if (!apiKey) {
            controller.enqueue(encodeEvent({
              type: "error",
              error: "Missing ANTHROPIC_API_KEY. Add it to .env.local.",
              provider: "anthropic",
            }));
            controller.close();
            return;
          }

          const model = process.env.ANTHROPIC_MODEL || body.model || DEFAULT_ANTHROPIC_MODEL;
          resolvedModel = model;
          const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens(body.max_tokens),
              system: body.system || "",
              messages: body.messages || [],
              stream: true,
            }),
          }).catch(e => { throw new Error(`Could not reach Anthropic API: ${e.message}`); });

          if (!anthropicResp.ok) {
            const errData = await anthropicResp.json().catch(() => ({}));
            const errMsg = errData.error?.message || `Anthropic error ${anthropicResp.status}`;
            controller.enqueue(encodeEvent({ type: "error", error: errMsg, provider: "anthropic" }));
            errorOccurred = errMsg;
            controller.close();
            return;
          }

          const reader = anthropicResp.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let inputTokens = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop();

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const event = JSON.parse(payload);
                if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                  const token = event.delta.text || "";
                  if (token) {
                    outputChars += token.length;
                    controller.enqueue(encodeEvent({ type: "text_delta", text: token }));
                  }
                } else if (event.type === "message_delta" && event.usage) {
                  outputTokens = event.usage.output_tokens ?? null;
                  inputTokens = event.usage.input_tokens ?? null;
                } else if (event.type === "message_stop") {
                  controller.enqueue(encodeEvent({
                    type: "done",
                    provider: "anthropic",
                    model,
                    modelTier: body.modelTier || "anthropic",
                    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                  }));
                } else if (event.type === "error") {
                  controller.enqueue(encodeEvent({
                    type: "error",
                    error: event.error?.message || "Anthropic stream error",
                    provider: "anthropic",
                  }));
                  errorOccurred = event.error?.message;
                }
              } catch { /* skip malformed SSE line */ }
            }
          }
        }
      } catch (error) {
        const errMsg = String(error?.message || "Stream error");
        controller.enqueue(encodeEvent({
          type: "error",
          error: errMsg,
          provider: isOllama ? "ollama" : "anthropic",
          fallbackAvailable: isOllama ? Boolean(anthropicKey()) : false,
        }));
        errorOccurred = errMsg;
      } finally {
        controller.close();
        const chars = inputCharCount(body);
        // Log the call (best-effort, after stream is closed)
        await logCall({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: new Date().toISOString(),
          provider: isOllama ? "ollama" : "anthropic",
          model: isOllama
            ? (resolvedModel || process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL)
            : (resolvedModel || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL),
          ok: !errorOccurred,
          status: errorOccurred ? 500 : 200,
          messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
          systemChars: chars.systemChars,
          inputChars: chars.messageChars,
          totalInputChars: chars.totalChars,
          outputChars,
          error: errorOccurred,
          streaming: true,
          fastLocal: Boolean(body.fastLocal),
          modelTier: body.modelTier || null,
          durationMs: Date.now() - callStart,
        }).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
