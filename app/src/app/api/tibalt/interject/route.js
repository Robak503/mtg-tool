/**
 * /api/tibalt/interject — Tibalt's gremlin mode (NEXT-QUEUE A1; Omnath's design, COMMS [O2]).
 *
 *   GET    → { enabled }                       — the per-profile toggle, for Settings + the client gate
 *   PUT    { enabled }                          — flip the toggle
 *   POST   { event, surface, deckId, deckName, cards, isFirstDeck, isFirstImport,
 *            findingAlreadyOnScreen }           — a completed action happened; may Tibalt jab?
 *          → { bubble: { id, jab, findingKey } | null, reason }
 *   PATCH  { fireId, reaction }                 — what the user did with a bubble (replied|dismissed|ignored)
 *
 * The DECISION lives in lib/tibaltGremlin.js (pure policy — event allowlist, hard blocks, caps,
 * per-finding suppression); this route is its I/O caller. The FINDING comes from the deterministic
 * power ranker's keyed land assessment — real data, never the model's own opinion. The model only
 * phrases the jab, and an empty completion is a valid "no bubble" (TIBALT_INTERJECTION's contract),
 * unlike the roast route where empty is an error.
 */

export const runtime = "nodejs";

import { TIBALT_INTERJECTION } from "../../../../lib/agents.js";
import { shouldInterject, recordFire, recordReaction } from "../../../../lib/tibaltGremlin.js";
import { readGremlin, writeGremlin } from "../../../../lib/server/gremlinStore.js";
import { rankDeckPower } from "../../../../lib/server/powerRanker.js";
import { ensureMigrated } from "../../../../lib/server/profiles.js";
import { callModelMessages } from "../../../../lib/server/modelProvider.js";

export async function GET() {
  ensureMigrated();
  const record = await readGremlin();
  return Response.json({ enabled: record.enabled });
}

export async function PUT(request) {
  ensureMigrated();
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const record = await readGremlin();
  const next = await writeGremlin({ ...record, enabled: body?.enabled === true });
  return Response.json({ enabled: next.enabled });
}

export async function POST(request) {
  ensureMigrated();
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const cards = Array.isArray(body?.cards) ? body.cards : null;
  if (!cards || !body?.event?.kind) {
    return Response.json({ error: "Request needs { event: { kind }, cards }." }, { status: 400 });
  }

  const record = await readGremlin();
  // Cheap gate before any ranking work: the policy's own first check, surfaced early.
  if (!record.enabled) return Response.json({ bubble: null, reason: "disabled" });

  // THE BAR — findings come from the deterministic ranker, never from the model.
  let findings;
  try {
    findings = rankDeckPower({ cards }).landAssessment?.findings || [];
  } catch {
    // An unrankable deck (empty, malformed) has no finding — and no finding means no joke.
    findings = [];
  }

  // The policy is per finding (suppression is keyed on it): take the first finding the policy
  // allows. If none passes, report the last refusal so tuning can see WHY he stayed quiet.
  const base = {
    event: { kind: String(body.event.kind) },
    surface: typeof body.surface === "string" ? body.surface : null,
    profile: { gremlinEnabled: record.enabled },
    deckId: typeof body.deckId === "string" ? body.deckId : null,
    isFirstDeck: body.isFirstDeck === true,
    isFirstImport: body.isFirstImport === true,
    findingAlreadyOnScreen: body.findingAlreadyOnScreen === true,
    state: record.state,
  };
  let finding = null;
  let reason = "no-finding";
  for (const f of findings) {
    const verdict = shouldInterject({ ...base, finding: f });
    if (verdict.allow) { finding = f; break; }
    reason = verdict.reason;
  }
  if (!finding) return Response.json({ bubble: null, reason });

  const deckName = typeof body.deckName === "string" && body.deckName ? body.deckName : "this deck";
  const result = await callModelMessages({
    system: TIBALT_INTERJECTION,
    messages: [{
      role: "user",
      content: `DECK: ${deckName}\nTHE FINDING (key: ${finding.key}): ${finding.text}\n\nWrite the one interjection bubble now — or return an empty string if the jab wouldn't be both funny and correct.`,
    }],
    agentName: "tibalt",
    provider: "ollama",
    max_tokens: 160,
  });

  if (!result.ok) {
    // Provider failures carry their message at result.data.error (modelProvider's providerError
    // shape) — result.error does not exist there, and reading it masks the real cause.
    return Response.json({ bubble: null, reason: `provider: ${result.data?.error || "unreachable"}` });
  }

  const jab = String(result.data?.content?.[0]?.text || "").trim();
  // The register makes the empty string a VALID answer: no bubble, and — since no bubble ever
  // existed — no fire recorded and no suppression burned.
  if (!jab) return Response.json({ bubble: null, reason: "model-declined" });

  const fireId = `fire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nextState = recordFire(record.state, { deckId: base.deckId, finding });
  const logEntry = {
    id: fireId, at: new Date().toISOString(), trigger: base.event.kind,
    deckId: base.deckId, deckName, findingKey: finding.key, jab, reaction: "pending",
  };
  await writeGremlin({ ...record, state: nextState, log: [...record.log, logEntry] });

  return Response.json({ bubble: { id: fireId, jab, findingKey: finding.key } });
}

export async function PATCH(request) {
  ensureMigrated();
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const reaction = ["replied", "dismissed", "ignored"].includes(body?.reaction) ? body.reaction : null;
  if (!reaction || typeof body?.fireId !== "string") {
    return Response.json({ error: "Request needs { fireId, reaction: replied|dismissed|ignored }." }, { status: 400 });
  }
  const record = await readGremlin();
  const log = record.log.map((e) => (e.id === body.fireId ? { ...e, reaction } : e));
  await writeGremlin({ ...record, state: recordReaction(record.state, reaction), log });
  return Response.json({ ok: true });
}
