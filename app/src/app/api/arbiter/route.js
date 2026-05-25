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

function normalizeBodyCardNames(value) {
  if (Array.isArray(value)) return value.map(String).map(name => name.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map(name => name.trim()).filter(Boolean);
  }
  return [];
}

function retrievalMetadata({ rules, cards, hallucinations, confidence }) {
  return {
    rulesRetrieved: rules.map(rule => ({ ruleNumber: rule.ruleNumber, text: rule.text })),
    cardsRetrieved: cards.map(card => card.name),
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

  const payload = {
    model: body.model,
    ollamaModel: body.ollamaModel || process.env.OLLAMA_ARBITER_MODEL || DEFAULT_ARBITER_MODEL,
    provider: body.provider,
    fastLocal: false,
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };

  const result = await callModelMessages(payload);
  if (!result.ok) {
    return Response.json(result.data, { status: result.status });
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
      hallucinations: citationCheck.hallucinations,
      confidence: retrieval.confidence,
    }),
  }, { status: result.status });
}
