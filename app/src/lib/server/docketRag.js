/**
 * docketRag.js — OPTIONAL RAG enrichment over the box's Weaviate (roadmap wave 4).
 *
 * Built to Omnath's delivered seam sketch (COMMS 2026-07-27 ~22:35). Colton's order was "wire all the
 * agents into my docket rag so they have faster and better speech and knowledge of magic"; this is the app
 * half. The box half — chunkers, classes, ingest — is his and already built.
 *
 * ── THE SPINE, and it is the whole design ────────────────────────────────────────────────────────────
 * The RAG is a strictly-additive ENRICHER on a local retrieval path that always runs. It is NEVER a hop in
 * the critical path. The .exe already ships a complete local answer (bundled CR JSON, rules-index.json,
 * rulesRetrieval.js, the oracle index, rulings, the offline combo snapshot), so the box is not a fallback
 * we degrade *to* — local is the floor that is always executing, and the box is a bonus that merges in
 * when it happens to answer in time. Nothing waits on it, nothing errors without it, and a user who has no
 * box gets exactly the app that exists today.
 *
 * ── WHY IT IS NEVER ALLOWED TO BECOME A DEPENDENCY ───────────────────────────────────────────────────
 * Evidence, not caution. Two silent box outages in six days, both with the service reporting healthy:
 * 07-19, a BSOD left the machine at the login screen and every scheduled task was LogonType=Interactive,
 * so nothing ran; 07-24, `Get-Service Tailscale` said Running and `tailscaled.exe` was alive while the
 * tailnet was flat dead because the IPN tray app wasn't up.
 *
 * SERVICE STATE IS NOT EVIDENCE. That is why the health check below is a real query round-trip rather than
 * a ping or a process check, and why the breaker exists at all.
 *
 * ── THE HARD RULE ────────────────────────────────────────────────────────────────────────────────────
 * The ARBITER gets NOTHING. It is a deterministic instrument: injecting retrieved prose would make the
 * same board state answer differently on two runs. It looks like the most natural fit for retrieval, and
 * it is the one agent that must never have it.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { dataPath } from "./paths.js";

/**
 * Corpus slices per agent (Omnath's table). `weaviate-lib.cjs` takes a className per call, so slicing is a
 * parameter rather than new infrastructure.
 *
 * ARBITER IS ABSENT ON PURPOSE — see the hard rule above. An agent with no entry gets no remote query at
 * all, which is also why Teferi (his corpus is the local game record) and Digby (he routes, he does not
 * answer) are absent rather than mapped to an empty list: absence and emptiness behave identically here,
 * and absence states the intent.
 */
export const AGENT_CORPORA = {
  jace: ["RulesChunk", "RulesQAChunk", "EngineChunk"],
  karn: ["CardChunk", "ComboChunk"],
  vihaan: ["CardChunk"],                  // printings/text only — PRICES NEVER COME FROM RAG
  omnath: ["RulesChunk", "CardChunk", "MemoryChunk"],
};

/** MemoryChunk is Colton's personal vault — the sensitive tier. Never queried without an explicit opt-in. */
const PERSONAL_CORPORA = new Set(["MemoryChunk"]);

const HEALTH_TTL_MS = 60_000;
const BREAKER_TRIP_AFTER = 3;
const BREAKER_OPEN_MS = 15 * 60_000;
const HEALTH_TIMEOUT_MS = 400;

// Module-level breaker state. Deliberately not exported except through the test reset below: the whole
// point is that a dead box costs one timeout an HOUR, not one per message.
const breaker = { failures: 0, openedAt: 0 };
let healthCache = { at: 0, ok: false };

/** Test seam — reset the breaker + health cache between cases. */
export function _resetDocketStateForTests() {
  breaker.failures = 0;
  breaker.openedAt = 0;
  healthCache = { at: 0, ok: false };
}

/**
 * Read the docket config. ABSENT MEANS THE FEATURE IS OFF — that is the default for everyone, including
 * Colton until he writes one, and it is why shipping this module changes no behaviour.
 *
 * Never hardcode a 100.x tailnet address: the .exe ships to other people and their box does not exist.
 */
export async function readDocketConfig() {
  try {
    const p = dataPath("docket.json");
    if (!existsSync(p)) return null;
    const cfg = JSON.parse(await readFile(p, "utf8"));
    if (!cfg || cfg.enabled === false || !cfg.url) return null;
    return {
      url: String(cfg.url).replace(/\/+$/, ""),
      apiKey: cfg.apiKey || "",
      budgetMs: Number.isFinite(cfg.budgetMs) ? cfg.budgetMs : 800,
      personalCorpora: cfg.personalCorpora === true,
    };
  } catch {
    return null;          // a malformed config is OFF, never a throw — see the contract
  }
}

/**
 * Race a promise against a hard wall-clock deadline.
 *
 * AbortController alone is NOT enough, and the acceptance test proved it: a fetch implementation that
 * ignores its `signal` never settles, and the agent path hangs forever — exactly the "the enricher became
 * a dependency" failure this whole design exists to prevent. The abort is still issued (it frees the real
 * socket); this race is what guarantees the CALLER is released regardless of whether anyone honours it.
 *
 * Trusting the transport to respect a cancellation is the same class of mistake as trusting
 * `Get-Service` to tell you the tailnet is up.
 */
function withDeadline(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function breakerOpen(now) {
  return breaker.openedAt > 0 && now - breaker.openedAt < BREAKER_OPEN_MS;
}

function noteFailure(now) {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_TRIP_AFTER) breaker.openedAt = now;
}

function noteSuccess() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

/**
 * A REAL round-trip, not a ping and not a service check — the 07-24 incident is the reason. Cached 60s so
 * a healthy box is not probed on every message.
 */
async function boxReady(cfg, now, fetchImpl) {
  if (now - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS);
  let ok;
  try {
    const res = await withDeadline(
      fetchImpl(`${cfg.url}/v1/.well-known/ready`, { signal: ctl.signal }),
      HEALTH_TIMEOUT_MS,
      () => null,                       // deadline hit -> treat as not-ready
    );
    ok = !!res?.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  healthCache = { at: now, ok };
  return ok;
}

/**
 * docketRecall — optional RAG enrichment.
 *
 * CONTRACT: never throws, never blocks past budgetMs, ALWAYS returns. `local` is produced by the caller's
 * existing bundled retrieval and is always populated; `remote` is merged only if the box answers in time.
 *
 * `degraded: true` is not an error. It means the caller got local hits only, and it is reported honestly
 * rather than swallowed — the same register as the rest of this project.
 *
 * @returns {Promise<{hits: Array, degraded: boolean, reason: string|null}>}
 */
export async function docketRecall({
  agent,
  query,
  local = [],
  k = 6,
  profile = null,
  isOwner = false,
  config = undefined,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const localHits = (local || []).map((h) => ({ ...h, origin: "local" }));
  const out = (degraded, reason, remote = []) => ({
    hits: [...localHits, ...remote].slice(0, Math.max(k, localHits.length)),
    degraded,
    reason,
  });

  // THE ARBITER, and any agent with no slice, never reaches the network at all.
  const corpora = AGENT_CORPORA[agent];
  if (!corpora || corpora.length === 0) return out(false, null);

  const cfg = config !== undefined ? config : await readDocketConfig();
  if (!cfg) return out(false, "off");                       // absent config = feature off, not a failure

  if (breakerOpen(now)) return out(true, "unreachable");    // dead box costs one timeout an hour

  // SENSITIVE TIER, enforced at the call site rather than stated as policy: MemoryChunk is Colton's
  // personal vault. It requires BOTH the explicit flag AND the owner profile. If either is missing the
  // class is simply not queried — the rest of the slice still is.
  const allowed = corpora.filter((c) => !PERSONAL_CORPORA.has(c) || (cfg.personalCorpora && isOwner));
  if (allowed.length === 0) return out(false, null);

  if (!(await boxReady(cfg, now, fetchImpl))) {
    noteFailure(now);
    return out(true, "unreachable");
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.budgetMs);
  try {
    const TIMED_OUT = Symbol("timeout");
    const res = await withDeadline(
      fetchImpl(`${cfg.url}/v1/graphql`, {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, classes: allowed, k, profile }),
      }),
      cfg.budgetMs,
      () => TIMED_OUT,
    );
    if (res === TIMED_OUT) {
      noteFailure(now);
      return out(true, "timeout");
    }
    if (!res?.ok) {
      noteFailure(now);
      return out(true, `error:http-${res?.status ?? "?"}`);
    }
    const body = await res.json();
    noteSuccess();
    const remote = (body?.hits || []).map((h) => ({ ...h, origin: "box" }));
    return out(false, null, remote);
  } catch (err) {
    noteFailure(now);
    // An abort IS the budget working as designed — a slow box degrades exactly like a dead one, and the
    // user feels it as slightly thinner context rather than as latency.
    const reason = err?.name === "AbortError" ? "timeout" : `error:${String(err?.message || err).slice(0, 60)}`;
    return out(true, reason);
  } finally {
    clearTimeout(timer);
  }
}
