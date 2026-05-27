import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:32b";
const DEFAULT_OLLAMA_FAST_MODEL = "qwen2.5:7b";
// Karn and Tibalt use a mid-tier model for better reasoning quality —
// defaults to the same 14b as Arbiter, already loaded so no extra RAM cost.
const DEFAULT_OLLAMA_AGENT_MODEL = "qwen2.5:14b";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_CONTEXT = 32768;
const MODEL_CALL_LOG = path.join(process.cwd(), "data", "model-calls.local.json");
const MODEL_CALL_LOG_LIMIT = 1000;

function cleanProvider(value) {
  return String(value || "").trim().toLowerCase();
}

export function selectedProvider(requestedProvider) {
  return cleanProvider(requestedProvider || process.env.MTG_MODEL_PROVIDER || process.env.MODEL_PROVIDER || "ollama");
}

function maxTokensFrom(value) {
  const maxTokens = Number(value);
  return Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 8000) : 2500;
}

function ollamaContextFrom(value) {
  const context = Number(value || process.env.OLLAMA_NUM_CTX);
  return Number.isFinite(context) && context > 0 ? Math.min(context, 32768) : DEFAULT_OLLAMA_CONTEXT;
}

function anthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key !== "sk-ant-your-key-here" ? key : "";
}

function fallbackAllowed() {
  return process.env.ALLOW_ANTHROPIC_AUTO_FALLBACK === "true";
}

function anthroContent(text) {
  return [{ type: "text", text: text || "" }];
}

function inputCharCount(body = {}) {
  const systemChars = String(body.system || "").length;
  const messageChars = (body.messages || []).reduce((sum, message) => sum + String(message.content || "").length, 0);
  return { systemChars, messageChars, totalChars: systemChars + messageChars };
}

function outputCharCount(data = {}) {
  return String(data.content?.[0]?.text || "").length;
}

async function appendModelCallLog(entry) {
  try {
    await fs.mkdir(path.dirname(MODEL_CALL_LOG), { recursive: true });

    let existing = { version: 1, calls: [] };
    try {
      const raw = await fs.readFile(MODEL_CALL_LOG, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.calls)) existing = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const calls = [...existing.calls, entry].slice(-MODEL_CALL_LOG_LIMIT);
    await fs.writeFile(MODEL_CALL_LOG, JSON.stringify({ version: 1, calls }, null, 2));
  } catch {
    // Logging must never block a model response.
  }
}

async function recordModelCall({ body, provider, model, result }) {
  const chars = inputCharCount(body);
  const data = result.data || {};
  await appendModelCallLog({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    provider,
    model,
    ok: Boolean(result.ok),
    status: result.status,
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    systemChars: chars.systemChars,
    inputChars: chars.messageChars,
    totalInputChars: chars.totalChars,
    outputChars: outputCharCount(data),
    usage: data.usage || null,
    error: result.ok ? null : String(data.error || "unknown error"),
  });
}

function providerError(message, status, provider, extra = {}) {
  return {
    ok: false,
    status,
    data: {
      error: message,
      provider,
      ...extra,
    },
  };
}

export async function callAnthropicMessages(body = {}) {
  const apiKey = anthropicKey();
  if (!apiKey) {
    return providerError(
      "Missing ANTHROPIC_API_KEY. Create .env.local from .env.local.example and restart the dev server.",
      500,
      "anthropic"
    );
  }

  const payload = {
    model: process.env.ANTHROPIC_MODEL || body.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: maxTokensFrom(body.max_tokens),
    system: body.system || "",
    messages: body.messages || [],
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
      const errorResult = providerError(data.error || data.message || "Anthropic request failed.", response.status, "anthropic", {
        raw: data,
      });
      await recordModelCall({ body, provider: "anthropic", model: payload.model, result: errorResult });
      return errorResult;
    }

    const result = {
      ok: true,
      status: response.status,
      provider: "anthropic",
      data: { ...data, provider: "anthropic" },
    };
    await recordModelCall({ body, provider: "anthropic", model: payload.model, result });
    return result;
  } catch {
    const result = providerError("Could not reach Anthropic API.", 502, "anthropic");
    await recordModelCall({ body, provider: "anthropic", model: payload.model, result });
    return result;
  }
}

export async function callOllamaMessages(body = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  const model = body.ollamaModel ||
    (body.fastLocal ? (process.env.OLLAMA_FAST_MODEL || DEFAULT_OLLAMA_FAST_MODEL) : null) ||
    process.env.OLLAMA_MODEL ||
    DEFAULT_OLLAMA_MODEL;
  const system = body.system ? [{ role: "system", content: body.system }] : [];
  const messages = [...system, ...(body.messages || [])].map(message => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: String(message.content || ""),
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: maxTokensFrom(body.max_tokens),
          num_ctx: ollamaContextFrom(body.ollamaContext),
        },
      }),
    });

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorText = String(data.error || data.message || "");
      const isModelMissing = /model.{0,40}not found|pull/i.test(errorText);
      const errorMsg = isModelMissing
        ? `Ollama model "${model}" is not pulled. Run: ollama pull ${model}`
        : (errorText || "Ollama request failed.");
      const errorResult = providerError(errorMsg, response.status, "ollama", {
        fallbackAvailable: Boolean(anthropicKey()),
        modelMissing: isModelMissing,
        raw: data,
      });
      await recordModelCall({ body, provider: "ollama", model, result: errorResult });
      return errorResult;
    }

    const text = data.message?.content || data.response || "";
    const result = {
      ok: true,
      status: response.status,
      provider: "ollama",
      data: {
        id: data.created_at || "ollama-local",
        type: "message",
        role: "assistant",
        model,
        provider: "ollama",
        content: anthroContent(text),
        usage: {
          input_tokens: null,
          output_tokens: data.eval_count ?? null,
        },
        raw: data,
      },
    };
    await recordModelCall({ body, provider: "ollama", model, result });
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error?.name === "AbortError";
    const errorMsg = isTimeout
      ? "Ollama request timed out after 120s. The model may be overloaded or out of VRAM."
      : "Could not reach Ollama at localhost:11434. Is Ollama running? Start with: ollama serve";
    const result = providerError(errorMsg, isTimeout ? 504 : 502, "ollama", {
      fallbackAvailable: Boolean(anthropicKey()),
      timeout: isTimeout,
    });
    await recordModelCall({ body, provider: "ollama", model, result });
    return result;
  }
}

export async function callModelMessages(body = {}) {
  const provider = selectedProvider(body.provider);

  if (provider === "ollama" || provider === "local") {
    return callOllamaMessages(body);
  }

  if (provider === "auto") {
    const local = await callOllamaMessages(body);
    if (local.ok || !fallbackAllowed()) return local;
    return callAnthropicMessages(body);
  }

  return callAnthropicMessages(body);
}

// ═════════════════════════════════════════════════════════════════════════════
// Streaming variants — emit normalized SSE-style events to a single consumer
// (currently /api/chat-stream/route.js). Each event is a plain object:
//
//   { type: "text_delta", text: string }
//   { type: "done", provider, model, modelTier, usage }
//   { type: "error", error, provider, fallbackAvailable?, modelMissing?, timeout? }
//
// The route serialises these as `data: ${JSON}\n\n` and forwards to the client
// reader in useChatAgents.js. Keeping the events generic means the route stays
// free of Ollama vs Anthropic conditional logic.
// ═════════════════════════════════════════════════════════════════════════════

function encodeStreamEvent(event) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function resolveOllamaModel(body) {
  // Karn and Tibalt always use the agent-tier model for reasoning quality,
  // regardless of the user's Fast/Deep selector. Other agents respect the
  // selector.
  const isAgentModel = ["karn", "tibalt"].includes(String(body.agentName || "").toLowerCase());
  const model = body.ollamaModel ||
    (isAgentModel ? (process.env.OLLAMA_AGENT_MODEL || process.env.OLLAMA_ARBITER_MODEL || DEFAULT_OLLAMA_AGENT_MODEL) : null) ||
    (body.fastLocal ? (process.env.OLLAMA_FAST_MODEL || DEFAULT_OLLAMA_FAST_MODEL) : null) ||
    process.env.OLLAMA_MODEL ||
    DEFAULT_OLLAMA_MODEL;
  return { model, isAgentModel };
}

/**
 * Stream Ollama NDJSON responses, translating each token into a normalized
 * event sent through the controller. Resolves when the stream is fully
 * consumed; throws are caught by the caller and surfaced as an error event.
 *
 * @returns {Promise<{ outputChars: number, outputTokens: number|null, errorOccurred: string|null, model: string }>}
 */
export async function streamOllamaMessages(body, controller) {
  const { model, isAgentModel } = resolveOllamaModel(body);
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  const system = body.system ? [{ role: "system", content: body.system }] : [];
  const messages = [...system, ...(body.messages || [])].map(message => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: String(message.content || ""),
  }));

  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), 120_000);

  let outputChars = 0;
  let outputTokens = null;
  let errorOccurred = null;

  let response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          num_predict: maxTokensFrom(body.max_tokens),
          num_ctx: ollamaContextFrom(body.ollamaContext),
        },
      }),
    });
  } catch (fetchError) {
    clearTimeout(timeoutId);
    const isTimeout = fetchError?.name === "AbortError";
    const errMsg = isTimeout
      ? "Ollama request timed out after 120s."
      : `Could not reach Ollama at ${baseUrl}. Start with: ollama serve`;
    controller.enqueue(encodeStreamEvent({
      type: "error",
      error: errMsg,
      provider: "ollama",
      fallbackAvailable: Boolean(anthropicKey()),
      timeout: isTimeout,
    }));
    return { outputChars, outputTokens, errorOccurred: errMsg, model };
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errText = String(errData.error || "Ollama error");
    const isModelMissing = /model.{0,40}not found|pull/i.test(errText);
    const errMsg = isModelMissing
      ? `Ollama model "${model}" not pulled. Run: ollama pull ${model}`
      : errText;
    controller.enqueue(encodeStreamEvent({
      type: "error",
      error: errMsg,
      provider: "ollama",
      fallbackAvailable: Boolean(anthropicKey()),
      modelMissing: isModelMissing,
    }));
    return { outputChars, outputTokens, errorOccurred: errMsg, model };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const token = event.message?.content || event.response || "";
        if (token) {
          outputChars += token.length;
          controller.enqueue(encodeStreamEvent({ type: "text_delta", text: token }));
        }
        if (event.done) {
          outputTokens = event.eval_count ?? null;
          controller.enqueue(encodeStreamEvent({
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

  return { outputChars, outputTokens, errorOccurred, model };
}

/**
 * Stream Anthropic SSE responses, translating each content_block_delta into
 * a normalized event sent through the controller.
 *
 * @returns {Promise<{ outputChars: number, outputTokens: number|null, inputTokens: number|null, errorOccurred: string|null, model: string }>}
 */
export async function streamAnthropicMessages(body, controller) {
  const apiKey = anthropicKey();
  const model = process.env.ANTHROPIC_MODEL || body.model || DEFAULT_ANTHROPIC_MODEL;

  if (!apiKey) {
    const errMsg = "Missing ANTHROPIC_API_KEY. Add it to .env.local.";
    controller.enqueue(encodeStreamEvent({
      type: "error",
      error: errMsg,
      provider: "anthropic",
    }));
    return { outputChars: 0, outputTokens: null, inputTokens: null, errorOccurred: errMsg, model };
  }

  let outputChars = 0;
  let outputTokens = null;
  let inputTokens = null;
  let errorOccurred = null;

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokensFrom(body.max_tokens),
        system: body.system || "",
        messages: body.messages || [],
        stream: true,
      }),
    });
  } catch (fetchError) {
    const errMsg = `Could not reach Anthropic API: ${fetchError.message}`;
    controller.enqueue(encodeStreamEvent({ type: "error", error: errMsg, provider: "anthropic" }));
    return { outputChars, outputTokens, inputTokens, errorOccurred: errMsg, model };
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.error?.message || `Anthropic error ${response.status}`;
    controller.enqueue(encodeStreamEvent({ type: "error", error: errMsg, provider: "anthropic" }));
    return { outputChars, outputTokens, inputTokens, errorOccurred: errMsg, model };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
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
            controller.enqueue(encodeStreamEvent({ type: "text_delta", text: token }));
          }
        } else if (event.type === "message_delta" && event.usage) {
          outputTokens = event.usage.output_tokens ?? null;
          inputTokens = event.usage.input_tokens ?? null;
        } else if (event.type === "message_stop") {
          controller.enqueue(encodeStreamEvent({
            type: "done",
            provider: "anthropic",
            model,
            modelTier: body.modelTier || "anthropic",
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          }));
        } else if (event.type === "error") {
          const errMsg = event.error?.message || "Anthropic stream error";
          controller.enqueue(encodeStreamEvent({
            type: "error",
            error: errMsg,
            provider: "anthropic",
          }));
          errorOccurred = errMsg;
        }
      } catch { /* skip malformed SSE line */ }
    }
  }

  return { outputChars, outputTokens, inputTokens, errorOccurred, model };
}

/**
 * Append an entry to the model call log. Exposed for the streaming route's
 * finally block so it can log after closing the stream without duplicating
 * the input/output character counting helpers.
 */
export async function appendStreamingCallLog(entry) {
  return appendModelCallLog(entry);
}

export { inputCharCount, anthropicKey };
