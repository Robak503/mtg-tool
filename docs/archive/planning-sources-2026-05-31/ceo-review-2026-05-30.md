# MTG Tool — CEO / Founder Review

**Date:** 2026-05-30
**Reviewer lens:** Founder/CEO product priorities
**Scope:** What polish and improvements the app still needs to go from "feature-rich" to "lovable."
**Status of this doc:** Written outside the repo during a stand-down (a concurrent session held the working tree). Move into `docs/` if you want it tracked.

---

## The honest take

MTG Tool has a **breadth problem disguised as progress.** Five agents, a real collection manager, deck import, a learn engine that resolves combat, a signed auto-updating `.exe`. That is genuinely impressive surface area for a solo vibe-coded project. But surface area is not the same as a product. The risk at this stage is not "missing features." It is that the pieces do not yet snap into one loop a user can't put down, and a fresh install is not magical in the first five minutes.

A CEO does not ask "what else can we build." A CEO asks two things: **does a new user get to "wow" fast, and is there a loop that pulls them back.** Everything below is filtered through those two questions.

The gap is not capability. It is **integration, activation, and finish.**

---

## Dream-state delta

```
  TODAY                          12-MONTH IDEAL
  ---------------------------    ----------------------------------
  A toolbox: 5 agents +          A loop: my collection IS the spine.
  Vault + Academy, each          Build from what I own -> practice it
  good, mostly used solo.        -> get it roasted -> see what $30
                                 finishes it. Each feature feeds the next.

  First run depends on Ollama    First run is magical with zero setup:
  + multi-GB model pulls +       instant answer path even before the
  data sync before value.        local model is ready, clear empty state.

  Karn suggests; I hand-edit.    Agents act on the deck, not just talk.

  Built for desert-island me.    Lovable for desert-island me: finished,
                                 not just functional.
```

---

## The four tracks (prioritized by CEO leverage)

### Track A — Activation / first-run magic (highest leverage by far)

The entire value chain gates on Ollama being installed and a 14B+ model being pulled (multiple GB) before the user sees anything good. Inversion test: *what makes this fail?* A new user, or future-you on the Mac mini, double-clicks, hits a model-download or memory wall, and bounces.

- **A1 — Guided empty state + always-visible deck-context chip.** A deckless window should say "load a deck, import one, or ask Jace a general rules question," and there should always be a visible `No deck locked` / `Locked to: X` indicator so a user never wonders which deck they are talking to. *Headless-safe.*
- **A2 — "Ask now via API while your local model downloads" fast path** on the Ollama-not-ready banner. *Mostly headless.*
- **A3 — Model-pull progress + ETA** in the install wizard (the SSE route already streams; surface percent/bytes). *Verification-gated (needs a real pull to watch).*

**Explicit decision: no pre-loaded sample deck.** A sample deck would make a new user think they are working *their* deck and ask Jace questions against the wrong context. That is a trust failure. The guided empty state + context chip gets the "never confusing" benefit without that downside.

Effort: human ~2-3 days / CC ~1-2 hrs.

### Track C — Trust + agents feeling alive (cheap, defends the moat; do it early)

"Never fabricate" is the moat. Make it visible, and make local-model latency read as thinking rather than frozen.

- **C1 — Streaming "Jace is reasoning..." state** so 14B first-token lag does not look like a hang. *Headless-ish.*
- **C2 — Grounding/trust badge on rules answers + promote View Arbiter Trace.** *Headless-safe.*
- **C3 — Graceful model-too-big fallback.** When the pinned 14B will not fit free VRAM, fall back to the 7B with a one-line notice ("not enough VRAM for the 14B right now, using the 7B"), and never show the raw Ollama memory string. Surfaced live when Diablo 4 ate VRAM during dogfooding. Not urgent on a 16GB 5080, but real polish, and it is the worst possible first impression for anyone else. *Headless-safe.*

Effort: human ~2 days / CC ~30 min.

### Track B — Core loop wiring (turns the toolbox into a product)

The Vault knows what you own. Karn builds. The Academy practices. Tibalt roasts. Right now these are mostly separate rooms. Wire them so the collection is the spine the whole app hangs on.

- **B1 — One-click "Play this deck in the Academy"** from the deck/Vault view. *Headless-safe.*
- **B2 — Karn *applies* a cut/add** to the deck (action buttons on his suggestions trigger a real deck mutation) instead of you copy-pasting. *Headless-safe, biggest item.*
- **B3 — Cost-to-finish surfaced where you build,** not only in the Decks panel ("own 87/99, finish $24"). *Headless-safe.*

Effort: human ~3-5 days / CC ~30-60 min per wire.

### Track D — Craft polish + hardening (the unglamorous finish)

The documented tail. None are glamorous; together they are the difference between "functional" and "finished and safe."

- **D1 — Webview CSP. P1, security, pulled forward.** A desktop shell loading a local server with no content-security-policy is exactly what a security pass exists to catch. *Verification-gated (a bad policy blanks the app, so confirm live).*
- **D2 — Local-first art proxy** for the last surfaces still hitting the Scryfall CDN (violates the local-first prime directive today). *Verification-gated (visual).*
- **D3 — Learn-session persistence** (`data/learn-sessions/`); sessions currently die on restart. *Headless-safe.*
- **D4 — Academy keyboard shortcuts + a11y + mobile/responsive.** *Needs a visual check.*
- **D5 — Decompose the two oversized files:** `MTGAssistant.jsx` (~1209 lines) and `FeedbackButton.jsx` (~1247 lines). *Headless-safe.*

Effort: mixed, mostly small with CC.

---

## Recommended execution order

```
  Step 0  ->  Track A  ->  Track C  ->  Track B  ->  Track D
  (deck gate) (activation) (trust)     (loop)       (finish/harden)
```

Webview CSP (D1) is pulled out of Track D to **P1**, run right after the deck gate, because it is a security item, not cosmetic polish.

Rationale: Activation is the funnel everything else depends on (highest ROI). Trust is cheap and defends the core pitch, so it goes early. The core-loop wiring is the real product unlock but it is larger, so it follows. Hardening finishes the job, with the one security item promoted.

---

## Decisions captured this review

| Decision | Outcome |
|---|---|
| Which tracks to pursue | **All four** (Colton: "I like all of them") |
| Pre-loaded sample deck (Track A) | **Cut** — would confuse new users into wrong-context questions |
| App-dependent verification (CSP, art, deck-gate pop-out) | **Verify-as-we-go** — Colton keeps the app running and live-checks each item |

---

## Step 0 status — Deck gate (in flight)

A deck gate was found already built in the working tree and committed during this review:

- **What:** Karn (deck builder) and Tibalt (roaster) now require a deck before they answer (pick a saved deck, import one, or opt out with "Chat without a deck"). Jace stays exempt as the general rules expert. This stops the wrong-context failure where Karn confabulates a deck analysis from generic search context with no deck loaded.
- **Where:** branch `feat/deck-gate-required-agents`, commit `1ed4f4b`, **PR #56**.
- **Verification:** 818/818 vitest green, 0 lint errors. **Live pop-out smoke test still pending.**
- **Important:** it is **not testable from the installed v0.8.0 `.exe`** (the gate does not exist in that build). To verify, run `npm run dev` on that branch and walk the pop-out, then merge. A no-gate Karn answer in v0.8.0 does not disprove the gate.

---

## What already exists (reuse, don't rebuild)

- Model tier routing + provider switch (`modelProvider.js`) already supports 7B/14B/32B and an API tier; the graceful-fallback work (C3) builds on it, no new infra.
- The install wizard already streams over SSE (`/api/install-ollama`); A3 just surfaces the progress it already emits.
- The Vault already computes cost-to-finish in the Decks panel; B3 surfaces it elsewhere, it does not recompute.
- `/api/art-crop?name=` already exists as the local-first proxy; D2 routes the remaining surfaces through it.

---

## NOT in scope (deferred, with reason)

- **Abstract N-player engine** — the Academy intentionally forks only at 2 vs 4 players. Do not generalize.
- **Authenticode signing / Microsoft Store** — paid, optional, deferred until needed.
- **Server/cloud option (Weaviate/Qdrant/Supabase)** — only if local outgrows the hardware; contradicts the local-first mandate today.
- **File associations (.dec/.txt)** — already declined; the import loop is URL/paste.
