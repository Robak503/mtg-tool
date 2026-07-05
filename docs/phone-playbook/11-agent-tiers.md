# 11 — AGENT TIERS & INFERENCE ROUTING

> **OMNATH IN POCKET · execution playbook · doc 11 of 17**
> The inference plane: Mac-70B+ / on-device / API tiers, per-agent
> routing, the Weaviate-RAG→generator flow, cost gates, Arbiter.
> User-facing agent behavior: `04-feat-agents.md`. Existing seams:
> `modelProvider.js` (provider abstraction — the extension point),
> `chat-stream` route, `model-calls` log, per-agent thresholds pattern
> (`feedback_anthropic_manual_fallback`).

---

## 1. The tier model

| Tier | What | Reach | Quality | Cost | Exists when |
|---|---|---|---|---|---|
| **T0 — retrieval** | pure-JS rules/oracle/lexical search — no model | on-device, always | exact text, zero prose | $0 | always (M1) |
| **T1 — Mac 70B+** | full-strength agents + Arbiter on the hub | tailnet | the real experience | $0 marginal | hub online (M3) |
| **T2 — on-device small** | 3–4B-class narration over retrieval | on-device | modest, honest | $0 | ⚠ if built (V4/V5) |
| **T3 — Anthropic API** | cloud fallback | any internet | high | $$ metered | user-selected (M3) |

**Routing principle: T0 is not a tier you fall to — it's the floor that
is always on.** Retrieval results render regardless of which generator
(if any) narrates them. A generator failure NEVER takes search down
with it (`01 §2` plane rules).

## 2. Per-agent routing

| Agent | Default | Offline | API tier |
|---|---|---|---|
| Jace | T1 | T2-over-T0 if built, else T0 lookup mode (`04 §1.5`) | ✅ manual |
| Karn | T1 (the hub's flagship workload) | hidden — honest "needs the Mac" (T2 Karn would be a bad Karn; don't ship a dumb architect) | ✅ manual |
| Tibalt | T1 | hidden | ✅ manual |
| Omnath (personal) | T1 + MemoryDoc RAG | hidden (his memory lives hubside) | ✅ manual (RAG degraded — see §4.3) |
| Arbiter | T1 only (Ollama-heritage service on the Mac — D7; **never API**, desktop-parity hardcode) | unavailable → Jace degrade states it plainly | ⛔ |

Per-agent tier override lives in settings (device-local); per-message
tier switch in the chat composer overflow. Every reply carries its tier
badge (`04 §1.2`).

**Giftable builds (D-P11, Colton 2026-07-04):** no hub pairing in v1 —
a gifted phone runs **T0 + T2 (if built) + T3 with the recipient's own
API key** entered in settings. T1/hub UI doesn't render on the giftable
flavor. Revisit at M5.1 if a gifted-hub scenario becomes real.

## 3. Routing mechanics

```
message → resolve agent → resolve tier:
   user forced tier? → use it (respect cost gate for T3)
   else: hubReachable && model role up? → T1
         else: agent has offline mode? → T2 (if built) / T0 (Jace)
               else: offer T3 (manual) or honest unavailable-card
→ assemble context (deck-lock + RAG per §4)
→ call generator (stream) → badge + log (§6)
```

- `hubReachable` = the health probe (`01 §6.3`), including model-role
  status (hub up but model unloaded = not T1-ready; the health payload
  says so — no blind dispatch into a 30s model-load stall without UI:
  show "waking the model…" if the hub reports loading).
- No silent tier fallback mid-conversation: a tier change (auto or
  manual) is visible in the transcript via badges. Auto-fallback
  T1→T2/T0 happens only on *dispatch* failure, marked inline; never
  auto-fallback INTO T3 (money moves only by hand —
  `feedback_anthropic_manual_fallback`).

## 4. RAG flow (the Weaviate → generator pipeline)

### 4.1 The shape (D6, D-P3)

```
query + agent + locked deck
  → retrieval plan (per agent, §4.2)
  → ONLINE: hub retrieval endpoint → Weaviate classes
            (RuleChunk · CardOracle · ComboEntry · MemoryDoc ·
             GameRecord · DeckNote — schema in 02 §7.2)
    OFFLINE: local lexical fallback (rules index · oracle index ·
             replica filters — 02 §7.3)
  → context assembly:
      deck-lock context = ALWAYS direct (small, exact — the locked
        snapshot with full oracle text; prompt-cacheable on T3)
      corpora = retrieval slices ONLY (never bulk-dump 0.5GB of JSON
        at a model)
  → generator (T1/T2/T3) with the agent persona prompt (single source:
      lib/agents.js — 04 §1.1)
  → response + citations
```

### 4.2 Retrieval plans per agent (initial tuning — adjust live at M3)

| Agent | Retrieves |
|---|---|
| Jace | RuleChunk top-k + the named cards' CardOracle + rulings |
| Karn | CardOracle semantic ("cards like/filling role X") + ComboEntry for the deck's pieces + DeckNote history + GameRecord aggregates |
| Tibalt | deck-lock mostly; GameRecord (losses hurt more when cited) |
| Omnath | MemoryDoc top-k + whatever the topic touches |
| Arbiter | its own engine + rules data on the Mac (existing pattern — it is not a RAG consumer in the same sense) |

### 4.3 CREED enforcement in the pipeline (D13 — mechanical, not aspirational)

- Rule numbers + rule text enter the context **only** from retrieval
  over the bundled CR (`RuleChunk.ruleNumber` copied verbatim at index
  time — `02 §7.2`). Card text enters **only** from CardOracle/bundled
  oracle.
- Agent prompts already instruct citation discipline (recon: Jace cites
  Oracle + rulings; Arbiter pinned to a CR baseline). The phone adds
  the **citation audit hook**: responses citing a rule number that was
  NOT in the retrieved context get flagged in the transcript (dev
  build: loudly; user build: subtle "unverified citation" mark).
  Cheap string check, real guardrail — build it at M3, it's also the
  regression detector for prompt drift.
- T2 (small model) is template-constrained hardest: quoted text +
  numbers come from retrieval output only; the model writes connective
  tissue (`04 §1.5`).
- Omnath on T3 with the hub down: memory RAG is unavailable — the UI
  says "memory offline — voice only" rather than letting the persona
  improvise "memories." Same honesty rule, applied to a soul.

## 5. The Mac serving stack (T1)

- **Target:** 70B+ (D2) serving Jace/Karn/Tibalt/Omnath + the Arbiter
  service + the local embedding model (D6).
- **⚠ VERIFY AT BUILD (V12):** the serving stack (Ollama is the
  heritage default; MLX-family serving may be materially better on
  Apple Silicon by fall 2026) + quant choice + context length vs
  memory + tok/s on the actual box. Acceptance floor: streaming feels
  conversational for chat (first token fast, sustained rate readable —
  a single user doesn't need throughput, `project_server_box_decision`).
- Model-load orchestration: keep-alive the chat model; embedding model
  is small enough to coexist; Arbiter's model per its existing config.
  VRAM/unified-memory contention with any future Academy workloads =
  known hazard (H10) — serving wins; batch work yields.
- The hub chat endpoint is agent-agnostic: it takes (persona prompt,
  context, message history) and streams. Personas stay client-defined
  (single source) — the hub is a dumb, fast mouth.

## 6. Cost gates (T3)

- **Manual tier selection is the gate** (owner posture) — T3 is never
  auto-selected. Per-agent thresholds + the monthly dashboard ride the
  existing `model-calls` pattern; the log syncs (`02 §2`), so phone +
  desktop spend share one ledger.
- Phone addition: pre-flight estimate on T3 calls with unusually large
  context (a full deck-lock + long history) — confirm sheet only above
  a per-call threshold (default off till tuned at M3; `04 §3`).
- Zero-API-cost remains a a standing gate for normal operation: a
  month of normal phone use with T3 never touched must cost $0.00
  (acceptance §8.4).

## 7. Latency + streaming

- T1 chat streams over the tailnet (`04 §1.4`, ⚠ V6 webview SSE;
  fallback chunked-poll, wire-compatible).
- Health-probe timeout SHORT (~2s) — the app decides its tier fast;
  a laggy probe must not stall message send.
- Perceived-latency budget (tune at M3): first token on T1 within
  conversational patience on the same wifi; over LTE+tailnet, honest
  spinner with the tier badge already shown.

## 8. Acceptance criteria (live, observable)

1. **Tier matrix drill (M3):** same prompt to Jace on T1 / T2(if
   built) / T3 → three replies, correct badges, correct log entries
   (exactly one API cost line).
2. **Karn flagship gate (M3 exit, spec-mandated):** full deck-build
   consultation on the phone against the Mac — inventory buckets,
   baselines, suggestions with real oracle grounding.
3. **Offline Jace gate (M3 exit, spec-mandated):** airplane mode →
   rules Q → CR-cited answer via T2/T0; citations grep-match
   `cr_current.json`.
4. **Money never moves alone:** a month of dogfood with T3 untouched =
   $0.00 on the dashboard; forcing T3 once = exactly one metered call
   logged.
5. **Citation audit live (M3):** the audit hook flags a deliberately
   planted fake citation in a test prompt run (prove the guardrail
   actually guards).
6. **No-silent-fallback:** kill the hub mid-session → next message
   visibly degrades (badge + notice), never silently switches brains.

---

*Cross-refs: `04-feat-agents.md` (UX) · `02-data-and-sync.md §7`
(Weaviate schema, retrieval endpoint) · `01-architecture.md §6.3`
(health probe) · `13-risk-and-verify.md` V4–V6, V12, H10.*
