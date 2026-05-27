export const runtime = "nodejs";

import {
  anthropicKey,
  appendStreamingCallLog,
  inputCharCount,
  selectedProvider,
  streamAnthropicMessages,
  streamOllamaMessages,
} from "../../../lib/server/modelProvider";

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

  const provider = selectedProvider(body.provider);
  const isOllama = provider === "ollama" || provider === "local";
  const callStart = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let result = {
        outputChars: 0,
        outputTokens: null,
        inputTokens: null,
        errorOccurred: null,
        model: null,
      };

      try {
        result = isOllama
          ? await streamOllamaMessages(body, controller)
          : await streamAnthropicMessages(body, controller);
      } catch (error) {
        const errMsg = String(error?.message || "Stream error");
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({
            type: "error",
            error: errMsg,
            provider: isOllama ? "ollama" : "anthropic",
            fallbackAvailable: isOllama ? Boolean(anthropicKey()) : false,
          })}\n\n`)
        );
        result.errorOccurred = errMsg;
      } finally {
        controller.close();
        const chars = inputCharCount(body);
        // Best-effort log entry. Never block the response.
        await appendStreamingCallLog({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: new Date().toISOString(),
          provider: isOllama ? "ollama" : "anthropic",
          model: result.model,
          ok: !result.errorOccurred,
          status: result.errorOccurred ? 500 : 200,
          messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
          systemChars: chars.systemChars,
          inputChars: chars.messageChars,
          totalInputChars: chars.totalChars,
          outputChars: result.outputChars,
          usage: result.outputTokens !== null || result.inputTokens !== null
            ? { input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null }
            : null,
          error: result.errorOccurred,
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
