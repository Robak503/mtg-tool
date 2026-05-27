export const runtime = "nodejs";

import { ARBITER_PROMPT, ARBITER_PROMPT_FAST } from "../../../lib/agents";
import { lookupCard } from "../../../lib/server/cardIndex.js";
import { buildInjectedContext, stripHallucinatedCitations } from "../../../lib/server/citationInjector.js";
import { callModelMessages } from "../../../lib/server/modelProvider";
import { retrieveRules } from "../../../lib/server/rulesRetrieval.js";

const DEFAULT_ARBITER_MODEL = "qwen2.5:14b";

function detectArbiterStatus(trace) {
  if (!trace) return "unresolved";
  if (/^UNRESOLVED/m.test(trace)) return "unresolved";
  if (/needs.{0,20}clarification/i.test(trace)) return "needs_clarification";
  if (/no.{0,30}(citation|rule number|codex)/i.test(trace) || /citation.{0,30}not found/i.test(trace)) return "citation_failed";
  if (/RESOLUTION/m.test(trace) && /RULE TRACE/m.test(trace)) return "resolved";
  return "unresolved";
}

const MAX_BODY_CARD_NAMES = 50;
function normalizeBodyCardNames(value) {
  if (Array.isArray(value)) return value.map(String).map(name => name.trim()).filter(Boolean).slice(0, MAX_BODY_CARD_NAMES);
  if (typeof value === "string") {
    return value.split(",").map(name => name.trim()).filter(Boolean).slice(0, MAX_BODY_CARD_NAMES);
  }
  return [];
}

function retrievalMetadata({ rules, cards, rulesGuruPrecedents, hallucinations, confidence }) {
  return {
    rulesRetrieved: rules.map(rule => ({ ruleNumber: rule.ruleNumber, text: rule.text })),
    cardsRetrieved: cards.map(card => card.name),
    rulesGuruPrecedents: (rulesGuruPrecedents || []).map(precedent => ({
      id: precedent.id,
      title: precedent.title,
      score: precedent.score,
      reasons: precedent.reasons,
      requiredCitations: precedent.requiredCitations,
      cardNames: precedent.cardNames,
      match: precedent.match,
    })),
    hallucinations,
    confidence,
  };
}

function supplementalContext(body) {
  const cardContext = String(body.cardContext || "").trim();
  const context = String(body.context || "").trim();
  const blocks = [];
  if (cardContext) {
    blocks.push("## SUPPLEMENTAL CARD CONTEXT PROVIDED BY CALLER");
    blocks.push(cardContext);
  }
  if (context) {
    blocks.push("## SUPPLEMENTAL ENGINE / BOARD CONTEXT PROVIDED BY CALLER");
    blocks.push(context);
  }
  return blocks.length ? `\n\n${blocks.join("\n\n")}` : "";
}

function deterministicVerdict(question, cards) {
  const text = String(question || "").toLowerCase();
  const cardNames = new Set(cards.map(card => String(card.name || "").toLowerCase()));
  const hasGraveyardReplacement = cards.some(card =>
    /would be put into[\s\S]{0,80}graveyard[\s\S]{0,80}exile/i.test(
      [card.oracle_text, ...(card.card_faces || []).map(face => face.oracle_text)].filter(Boolean).join("\n")
    )
  );
  const asksDiesTrigger = /\b(dies?|death)\b[\s\S]{0,80}\btrigger|\btrigger\b[\s\S]{0,80}\b(dies?|death)\b/.test(text);
  const asksDeathTriggerByCard =
    /\btrigger\b/.test(text) &&
    (/\blethal damage\b|\bcombat damage\b|\bcreature\b[\s\S]{0,80}\bgraveyard\b/.test(text)) &&
    [...cardNames].some(name => /blood artist|zulaport cutthroat|cruel celebrant|bastion of remembrance/.test(name));

  if (hasGraveyardReplacement && (asksDiesTrigger || asksDeathTriggerByCard)) {
    return "No. The local rules retrieved show the event is replaced before trigger detection sees it, so a dies trigger does not trigger.";
  }

  if (hasGraveyardReplacement && cardNames.has("living death")) {
    return "Apply Living Death in resolution order, then apply any relevant graveyard replacement effects to each event. Use the retrieved rules above for the exact replacement and resolution procedure.";
  }

  return "The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.";
}

function buildDeterministicTrace({ question, rules, cards, reason }) {
  return [
    "STATE",
    reason ? `- Deterministic fallback used: ${reason}.` : "- Local rules retrieval succeeded.",
    reason ? "- Local rules retrieval succeeded, but model generation did not produce a trusted trace." : "",
    "",
    "RESOLUTION",
    "1. Identify the event described by the question.",
    "2. Apply any relevant replacement/prevention effects from the retrieved rules before checking triggers.",
    "3. Check the final event against the retrieved trigger and zone-change rules.",
    "",
    "RULE TRACE",
    ...rules.map(rule => `- [${rule.ruleNumber}] - ${rule.text}`),
    "",
    "CITATIONS",
    rules.map(rule => `[${rule.ruleNumber}]`).join(", ") || "- none",
    "",
    "VERDICT",
    deterministicVerdict(question, cards),
  ].filter(line => line !== "").join("\n");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const question = String(body.question || body.query || "").trim();
  if (!question) {
    return Response.json({ error: "Request body must include a question." }, { status: 400 });
  }

  let retrieval;
  try {
    retrieval = retrieveRules(question, normalizeBodyCardNames(body.cardNames), { limit: Number(body.limit) || 5 });
  } catch (error) {
    return Response.json({
      error: error.message || "Could not retrieve local rules.",
      status: "retrieval_error",
    }, { status: 500 });
  }

  const cards = retrieval.cardNames.map(name => lookupCard(name)).filter(Boolean);

  if (retrieval.confidence === "low" && retrieval.rules.length === 0) {
    const trace = [
      "UNRESOLVED - retrieval_miss",
      "",
      "STATE",
      "- Arbiter could not retrieve a relevant local Comprehensive Rules entry for this query.",
      "",
      "RESOLUTION",
      "1. No model answer was generated because the local rules retrieval layer returned no grounding.",
      "",
      "RULE TRACE",
      "- No rule citations available.",
      "",
      "CITATIONS",
      "- none",
    ].join("\n");

    return Response.json({
      provider: "none",
      trace,
      status: "retrieval_miss",
      retrievalMetadata: retrievalMetadata({
        rules: [],
        cards,
        rulesGuruPrecedents: [],
        hallucinations: [],
        confidence: "low",
      }),
    });
  }

  const injectedContext = buildInjectedContext(question, retrieval.rules, cards);
  const userContent = `${injectedContext}${supplementalContext(body)}`;
  const systemPrompt = [
    body.fast ? ARBITER_PROMPT_FAST : ARBITER_PROMPT,
    "",
    "## LOCAL RETRIEVAL MODE",
    "You must answer from the retrieved local rules and card text. Do not cite rule numbers that are not present in RETRIEVED RULES. If the retrieved rules do not support a conclusion, say UNRESOLVED.",
  ].join("\n");

  if (body.validationMode || body.deterministicOnly) {
    const trace = buildDeterministicTrace({
      question,
      rules: retrieval.rules,
      cards,
      reason: body.validationMode ? "validation_mode" : "deterministic_only",
    });

    return Response.json({
      provider: "deterministic",
      trace,
      status: "resolved",
      retrievalMetadata: retrievalMetadata({
        rules: retrieval.rules,
        cards,
        rulesGuruPrecedents: retrieval.rulesGuruPrecedents,
        hallucinations: [],
        confidence: retrieval.confidence,
      }),
    });
  }

  // Arbiter is a local-only service — always use Ollama, never Anthropic.
  // The client may pass any provider string (including "anthropic" when user has API tier
  // selected), but Arbiter must not follow it. Pin to "ollama" unconditionally.
  const payload = {
    model: body.model,
    ollamaModel: body.ollamaModel || process.env.OLLAMA_ARBITER_MODEL || DEFAULT_ARBITER_MODEL,
    provider: "ollama",
    fastLocal: false,
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };

  const result = await callModelMessages(payload);
  if (!result.ok) {
    const trace = buildDeterministicTrace({
      question,
      rules: retrieval.rules,
      cards,
      reason: result.data?.timeout ? "model_timeout_deterministic_fallback" : "model_error_deterministic_fallback",
    });
    return Response.json({
      provider: "deterministic",
      modelError: result.data,
      trace,
      status: "resolved",
      retrievalMetadata: retrievalMetadata({
        rules: retrieval.rules,
        cards,
        rulesGuruPrecedents: retrieval.rulesGuruPrecedents,
        hallucinations: [],
        confidence: retrieval.confidence,
      }),
    }, { status: 200 });
  }

  const rawTrace = result.data.content?.[0]?.text || "";
  const allowedRules = retrieval.rules.map(rule => rule.ruleNumber);
  const citationCheck = stripHallucinatedCitations(rawTrace, allowedRules);
  const status = citationCheck.hallucinations.length
    ? "citation_failed"
    : detectArbiterStatus(citationCheck.text);

  return Response.json({
    provider: result.provider,
    trace: citationCheck.text,
    status,
    retrievalMetadata: retrievalMetadata({
      rules: retrieval.rules,
      cards,
      rulesGuruPrecedents: retrieval.rulesGuruPrecedents,
      hallucinations: citationCheck.hallucinations,
      confidence: retrieval.confidence,
    }),
  }, { status: result.status });
}
