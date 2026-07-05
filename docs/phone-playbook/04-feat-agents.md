# 04 — FEATURE: AGENTS

> **OMNATH IN POCKET · execution playbook · doc 04 of 17**
> The four agents on the phone (D7): Jace · Karn · Tibalt · Omnath
> (personal build only), plus Arbiter as the silent engine. Tier routing
> detail lives in `11-agent-tiers.md`; this doc is the user-facing
> feature. Existing seams: `lib/agents.js` (JACE/KARN/TIBALT/ARBITER
> prompts + AGENTS object), `ChatPanel.jsx`, `chatPersistence.js`,
> `chat-stream` route (SSE via ReadableStream), `modelProvider.js`.

---

## 1. Behavior

### 1.1 The roster

| Agent | Role (unchanged from desktop) | Default tier | Offline |
|---|---|---|---|
| **Jace** | rules expert, plain-English, cites CR + rulings, escalates to Arbiter | Mac 70B+ | degrades to retrieval-first mode (§1.5) |
| **Karn** | deck architect — inventory buckets, baselines, build/cut modes | Mac 70B+ (the agent the hub exists for) | hidden with honest banner (§2) |
| **Tibalt** | roaster | Mac 70B+ | hidden |
| **Omnath** | the companion — vault-as-memory + a voice (PERSONAL BUILD ONLY, D12) | Mac 70B+ + Weaviate RAG | hidden |
| **Arbiter** | silent procedural rules engine — never in the selector | Mac (Ollama heritage — D7) | unavailable; Jace falls back to retrieval-only |

Agent personas, prompts, greetings, colors come from `lib/agents.js` —
**port, don't fork.** One prompt source for desktop + phone; a
`platform: field` context line may be appended, but persona text stays
single-sourced.

### 1.2 Chat surface
- Sessions list grouped by agent (existing session-manager semantics):
  agent, locked deck name, started, last activity; archive action.
- New chat = pick agent (+ optionally lock a deck at start — or start
  from a deck screen, which pre-locks it, `03 §1.5`).
- Streaming responses with a visible **tier badge** on every reply
  (`Mac · 70B` / `on-device` / `API · Claude` — `11 §5`), so quality is
  always attributable.
- Chat history syncs (append-merge — `02 §6.5`); a chat started on the
  couch continues on desktop and vice versa.

### 1.3 Deck-locked context
Reuses `deckContextBuilder.js` output: full list + per-card oracle text
(bundled data — CREED) + deck memory + recent game records. Lock is
immutable per session (desktop parity).

### 1.4 Streaming mechanics
Desktop uses POST → ReadableStream SSE-format chunks. On the phone the
generator is remote (Mac hub or Anthropic API):
- Phone → hub: hub exposes a streaming chat endpoint; webview consumes
  fetch-streaming/SSE. **⚠ VERIFY AT BUILD (V6):** Android-webview
  streaming-fetch/SSE behavior. Fallback: chunked polling
  (request-id + incremental GET) — decided at M3, wire-compatible with
  either.
- Phone → Anthropic (API tier): direct streaming from the phone —
  standard mobile TLS, works anywhere with internet, no Mac needed.

### 1.5 Jace's offline degrade (the CREED showcase)
Offline, Jace's selector entry becomes **"Jace (offline — rules lookup)"**:
- Input runs rules retrieval (SVC, pure JS) → returns matched CR
  sections + card oracle/rulings, formatted, cited.
- If an on-device small model ships (⚠ V4/V5), it may *narrate around*
  retrieved text — template-constrained: quoted rule text + citation
  numbers come only from retrieval output; the model adds connective
  explanation only.
- If no on-device model: pure retrieval display (still genuinely
  useful — this is the guaranteed floor, and it ships in M1 via the
  Rules tab machinery, `08-feat-rules.md`).

### 1.6 Omnath (personal build only — D12)
- Present only when the build flavor is `personal`. Not a hidden
  toggle — the giftable build doesn't contain the persona or any data
  hooks.
- Memory = the vault via Weaviate `MemoryDoc` RAG (`02 §7.2`,
  `11 §4`). Voice/persona per `memory/persona_omnath.md` (load at
  build time of the prompt, not paraphrased from memory).
- Giftable builds instead ship the "grow your own companion"
  onboarding — a fresh companion persona with empty memory (M5 scope,
  `12 §M5`).

### 1.7 Arbiter handling
- Jace escalates complex multi-step rules questions to Arbiter exactly
  as on desktop — except the call goes to the hub's Arbiter endpoint.
- Offline: no Arbiter. Jace's degrade path (§1.5) states plainly "full
  engine offline — here's the retrieved rule text."
- Arbiter output format (fixed JSON trace) is unchanged; it renders in
  the same collapsed-trace UI style as desktop.

## 2. States

| State | Rendering |
|---|---|
| **Empty** | No sessions: agent cards (from AGENTS object: icon, title, greeting) + "start a chat." Karn's card suggests starting from a deck |
| **Loading** | Streaming tokens render incrementally; pre-first-token shows agent-colored typing shimmer + tier badge already visible |
| **Error** | Generation failure → inline error bubble WITH cause (hub unreachable mid-stream / API refusal / timeout) + retry; partial text is kept and marked truncated. Never a silent empty bubble |
| **Offline** | Mac-tier agents: hidden from "new chat" (or shown disabled with "needs the Mac — offline") — existing sessions readable always (history is replica data). Jace swaps to offline-lookup mode. API-tier agents available if internet exists without the tailnet (rare but real: public wifi blocking VPNs) |

## 3. Edge cases

- **Mid-stream disconnect** (walked out of wifi): keep partial reply,
  mark truncated, offer retry-on-reconnect. Do not auto-retry LLM calls
  (cost + duplicate-answer noise).
- **Tier switch mid-session**: allowed (per-message routing); every
  bubble's tier badge preserves attribution history.
- **Deck edited after lock**: session keeps its snapshot; a small
  "deck has changed since lock" notice with "start fresh chat" action
  (desktop parity — locks never silently refresh).
- **Cost gate (API tier)**: per-agent thresholds + monthly dashboard
  (existing `model-calls` pattern, synced). Manual tier selection is
  the gate (`feedback_anthropic_manual_fallback`); the phone adds a
  per-call confirm ONLY when a single call is projected to exceed the
  per-call threshold (`11 §6`).
- **Two clients chatting in the same session simultaneously**: not
  prevented; append-merge interleaves (`02 §6.5`). Weird but lossless.
  Non-goal to support well.
- **Unresolved cards in locked deck** (`03 §3`): context marks them
  `[unresolved card — no oracle text]`; agents instructed (prompt-level)
  to say so rather than improvise text. CREED.

## 4. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Personas/prompts | `lib/agents.js` (build-time) | ✅ |
| Chat history | replica | ✅ |
| Deck-lock context | replica + bundled oracle | ✅ |
| Generation (full agents) | Mac 70B+ / API | ⛔ |
| Rules retrieval (Jace degrade) | bundled rules index | ✅ |
| Omnath memory RAG | hub retrieval endpoint → Weaviate | ⛔ |
| Cost log | replica (synced `model-calls`) | ✅ read |

## 5. Box-dependency

**BOX:** every full-strength generation, Arbiter, Omnath RAG, Weaviate
semantic retrieval. **STANDALONE:** chat history read, session
management, Jace offline-lookup floor, deck-lock assembly. **NET-ONLY
(not box):** Anthropic API tier.

## 6. Acceptance criteria (live, observable)

1. **Full Karn over the hub:** on the phone (couch, wifi→tailnet), lock
   a real deck, run a Karn build/cut consultation → inventory buckets +
   baseline counts + concrete suggestions stream in; tier badge reads
   Mac. (M3 exit gate, spec-mandated)
2. **Jace offline citations:** airplane mode → ask Jace a layered rules
   question → response shows retrieved CR text with rule numbers that
   grep-match `cr_current.json`. (M3 exit gate, spec-mandated; floor
   version passes via retrieval-only display)
3. **Tier badge honesty:** force each tier (Mac / on-device-if-built /
   API) on the same prompt → three replies, three correct badges, cost
   log shows exactly one API entry.
4. **Cross-device continuity:** start a chat on desktop → open on phone
   → full history present; reply from phone → desktop shows it after
   sync.
5. **Degrade honesty:** kill the hub mid-stream → partial reply kept +
   truncation marker + error cause names the hub; app remains fully
   usable.
6. **Giftable purity (M5):** giftable APK contains no Omnath persona
   strings, no vault hooks (verified by build inspection + UI sweep).

---

*Cross-refs: `11-agent-tiers.md` (routing, RAG, cost gates — the other
half of this feature) · `03-feat-decks.md §1.5` (deck-lock) ·
`08-feat-rules.md` (retrieval floor) · `02-data-and-sync.md §6.5` (chat
merge) · `13-risk-and-verify.md` V4–V6.*
