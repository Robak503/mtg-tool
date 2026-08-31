import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { renderNarration } from "./narrationContract.js";

const command = (name, payload) =>
  invoke(`plugin:omnath-model|${name}`, payload ? { payload } : undefined);

export async function modelStatus() {
  try { return await command("status"); } catch { return { state: "unavailable" }; }
}

export async function prepareDefaultModel(modelId = "base") {
  const current = await modelStatus();
  if (current.state === "ready") return current;
  let lastError;
  for (const candidate of [modelId, ...["base", "enhanced"].filter((id) => id !== modelId)]) {
    try { return await command("load_model", { modelId: candidate }); }
    catch (error) { lastError = error; }
  }
  return { state: "unavailable", error: String(lastError) };
}

export async function narratePlan(plan, onToken) {
  if ((await modelStatus()).state !== "ready") return { text: plan.fallback, usedModel: false, rejection: "unavailable" };
  const requestId = crypto.randomUUID();
  const listener = onToken
    ? await addPluginListener("omnath-model", "token", (event) => {
        if (event.requestId === requestId) onToken(event.token);
      })
    : null;
  try {
    const response = await command("generate", {
      requestId,
      prompt: "Return only these placeholders exactly once each, in a readable order. Add no words: {{RESULT}} {{FOLLOW_UP}}",
    });
    return renderNarration(plan, response.text);
  } catch {
    return { text: plan.fallback, usedModel: false, rejection: "generation-failed" };
  } finally {
    listener?.unregister();
  }
}

export const cancelGeneration = () => command("cancel").catch(() => null);
