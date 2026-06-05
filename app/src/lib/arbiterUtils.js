/**
 * arbiterUtils.js
 *
 * Helpers for calling the Arbiter rules-engine backend and processing its output.
 * No React state. Safe to call from hooks, server routes, or test files.
 *
 * Extracted from useChatAgents.js (PR0).
 */

import { normalizeSearchText } from "./deck/deckContextBuilder";

// ─── Routing predicate ────────────────────────────────────────────────────────

/**
 * Returns true when a Jace prompt is rules-sensitive enough to warrant
 * a silent Arbiter trace before generating the user-facing reply.
 */
export function shouldUseArbiterTrace(targetAgent, prompt) {
  if (targetAgent !== "jace") return false;
  const text = normalizeSearchText(prompt);
  return /\b(arbiter|rule|rules|ruling|judge|trigger|triggers|stack|priority|state based|sba|replacement|prevention|layer|timestamp|dies|died|death|exile|graveyard|copy|token|combat damage|commander damage|commander tax|deathtouch|trample|lifelink|first strike|double strike|resolve|resolves|cast|activate|etb|leave the battlefield|enter the battlefield|can i|can they|what happens|who has priority|does this|does it)\b/.test(text);
}

// ─── Arbiter fetch ────────────────────────────────────────────────────────────

/**
 * POST to /api/arbiter and return { trace, status, retrievalMetadata }.
 * Never throws — returns an empty trace on any network/parse error.
 */
export async function fetchArbiterTrace({ question, cardContext, context, fast, provider }) {
  try {
    const isLocal = provider === "ollama" || provider === "local";
    const response = await fetch("/api/arbiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        cardContext,
        context,
        fast,
        provider,
        fastLocal: isLocal,
        max_tokens: fast || isLocal ? 900 : undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { trace: "", status: "unresolved", retrievalMetadata: null };
    return {
      trace: data.trace || "",
      status: data.status || "unresolved",
      retrievalMetadata: data.retrievalMetadata || null,
    };
  } catch {
    return { trace: "", status: "unresolved", retrievalMetadata: null };
  }
}

// ─── Metadata summarizer ──────────────────────────────────────────────────────

/**
 * Normalise raw Arbiter retrievalMetadata into a stable shape for factReceipt.
 * Returns null if metadata is falsy.
 */
export function summarizeArbiterMetadata(metadata) {
  if (!metadata) return null;
  return {
    ruleNumbers: (metadata.rulesRetrieved || [])
      .map(rule => String(rule.ruleNumber || "").trim())
      .filter(Boolean),
    cards: (metadata.cardsRetrieved || [])
      .map(card => String(card || "").trim())
      .filter(Boolean),
    rulesGuruPrecedents: (metadata.rulesGuruPrecedents || [])
      .map(precedent => ({
        id: precedent.id,
        title: precedent.title,
        requiredCitations: precedent.requiredCitations || [],
      })),
    hallucinations: metadata.hallucinations || [],
    confidence: metadata.confidence || null,
  };
}
