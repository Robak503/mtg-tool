> ⚠️ **HISTORICAL (bannered 2026-07-04).** 2026-06-15-era backlog/strategy. Forward queue: docs/orchestration/UPGRADE-BACKLOG.md; live strategy lives memory-side (vision/roadmap files).

# MTG Tool — Master Product Plan

> **The single consolidated backlog + strategy doc for MTG Tool.** This file
> merges three prior planning documents into one source of truth so a future
> chat (or coding agent) can act without re-reading the originals:
>
> 1. **CEO / founder product review** (`MTG-TOOL-ceo-review-2026-05-30.md`) — the four-track strategic prioritization.
> 2. **Master LLM implementation plan** (`master-llm-implementation-plan.md`) — the full code/security/release/feature workstream taxonomy (A–M).
> 3. **Product feature web research** (`product-feature-web-research.md`) — market evidence from public MTG-tool feature requests.
>
> Plus the **Vault / MTG-finance backlog** (the 22-item menu) that was queued for a dedicated Vault work session.
>
> All three source docs are archived under `docs/archive/planning-sources-2026-05-31/`.
> For "where we are right now + copy-paste next-chat prompts," `docs/HANDOFF.md`
> remains the tactical companion; this doc is the strategic backlog it points into.

**Created:** 2026-05-31 · **Reflects shipped state through:** v0.16.0 · **Owner:** Colton (Robak503)

---

## How to use this doc

- **§2** tells you what is actually shipped (so you don't rebuild it).
- **§3** is the strategic lens — *why* the priority order is what it is.
- **§4** is the complete whole-app backlog, by workstream, every item tagged **status + priority + source**.
- **§5** is the **Vault menu** — the active focus, with a recommended first batch to pick from.
- **§6** is the recommended execution order across everything.
- **§7–§10** capture decisions, out-of-scope, the testing backlog, and the working agreement.

**Working rules for any agent picking this up** (full detail in `CLAUDE.md`):
one focused PR per task group; branch off `master` (direct push is blocked);
local-first mandate (no new external runtime deps — prices/data come from the
bundled/synced local indexes); never fabricate card data or rule numbers; add
tests for new logic; run `npm --prefix app test` + `lint` + `check` before
handoff; route tests tolerate 200-or-503 and use a 30000ms timeout when they
load big indexes.

### Status legend

| Tag | Meaning |
|---|---|
| ✅ | Shipped |
| 🟡 | Partial — a precursor or piece shipped; the named gap remains |
| ⬜ | Not started |

Priority: **P0** (do next / blocks release-quality) · **P1** (high value, soon) · **P2** (after core) · **P3** (defer).
Source tags: **CEO** (founder review) · **PLAN** (master LLM plan workstream ID) · **RSCH** (web research) · **VAULT** (Vault menu item #).

---

## 1. North Star & positioning

**MTG Tool is a local-first Windows desktop workbench for Commander players who
want to understand, tune, track, and practice their decks without sending
everything to the cloud.** Its moat is the combination no web tool has: private
local data + AI reasoning over your decks, collection, games, and rules, all in
one window, offline-capable.

The product connects, in one loop:
**what I own → what I'm building → what I'm missing → how it plays → how strong
it is → what my pod will think → what I should change → how to practice it.**

Do **not** position it as: a tournament-judge replacement, a full rules engine, a
universal social collection platform, a mobile-first app, or a finished
learn-to-play simulator.

**Suggested stability labels** (surface in UI + docs — PLAN B6):
- **Stable:** chat, deck import, deck sessions, The Vault, MTG Finance, updates/data sync, feedback capture.
- **Beta:** goldfish scoring, deck power ranking, deck cost-to-finish.
- **Preview:** The Academy (learn-to-play), 4-player Commander sim, Expert mode.

---

## 2. Current state — shipped through v0.10.0

This supersedes the stale "latest = v0.5.0" framing in `HANDOFF.md` and the
partial snapshot in `CLAUDE.md` §9. Confirmed against `CHANGELOG.md`.

**Platform & foundation (shipped earlier):** Tauri 2 `.exe` shell → bundled Node 22
→ Next.js 15 (JavaScript). Local Ollama default + Anthropic fallback tier. Five
agents (Jace / Karn / Tibalt front-facing, Arbiter hidden Ollama-only engine,
Garfield simulator). Multi-session chat with per-session locked deck snapshots;
archive/rename/export/clear; Arbiter trace + source display; message feedback +
floating feedback inbox. Bundled knowledge layer (CR JSON + rules markdown).
Signed auto-update via CI tag flow. First-launch import wizard + Ollama
install/model-pull wizard. In-app data sync (Scryfall / Spellbook / EDHREC).
System tray, single-instance, autostart toggle, orphan-server job-object fix.

**Recent feature releases:**
- **v0.3.0** — Source-available license + contributor docs; **Midnight Codex** theme + commander-art chat blend; `/api/art-crop?name=` proxy (chat backdrop / portrait / `[[card]]` plates routed local-first).
- **v0.4.0** — **The Vault**: per-printing add (set/collector/finish/treatment from the full `default_cards` index), quantity steppers, delete-at-zero, color tags with ownership behaviors (Have/Getting/Considering/Swap).
- **v0.5.0** — Deck import from a **Moxfield / Archidekt URL** (server-side fetch → resolve against local index → preview → save).
- **v0.6.0** — Learn-to-Play **combat resolves** (damage, lethal → graveyard, unblocked → defender; multi-defender groundwork).
- **v0.7.0** — Learn-to-Play **4-player Commander** mode + table strip; attack-target labels.
- **v0.8.0** — Vault **cost-to-finish Decks panel** + shopping list (Add pre-filled to the printing you bought); **The Academy** as its own section; **Ask Jace mid-game**; **Card Kingdom price fallback** (never-nil values); **↻ Prices** refresh.
- **v0.9.0** — **Combos tab** (in-deck + one-card-away, local Spellbook); **color-identity guardrail** in Legal tab; **buildable-only** Decks filter; **deck snapshots** (+/− since); **Pod Balance** (WotC bracket 1–5, power, CRISPI, Game Changers, table verdict); **local recommendations** (role gaps / near-combos / cut candidates); restored `edhrec_rank` in the slim index; **deck gate** (Karn/Tibalt require a deck — the CEO review's "Step 0").
- **v0.10.0** — **MTG Finance tab** in the Vault: collection value + 30/90/365-day change + movers; "finance plays" (biggest movers across tracked universe); "worth getting" (EDHREC staples + near-combo pieces, one-click to Grails); **Grails** watchlist (search-to-track + per-grail price chart). Daily snapshot universe = owned + grails + top ~200 staples. *Movers fill in over ~1–2 weeks of use — no free historical-price backfill exists, and the UI says so.*

**Net effect on the backlog:** the CEO review's **Step 0 (deck gate)** is done;
**Combo Lens (PLAN F3)**, **Pod power comparison (PLAN J2)**, and the
**in-app cost-to-finish shopping list** are shipped or largely shipped; **deck
snapshots** are a partial precursor to **deck versioning (PLAN E1/E2)**. Those are
marked 🟡/✅ below so they're not rebuilt.

---

## 3. Strategic frame — the four tracks

A CEO asks two questions: **does a new user reach "wow" fast, and is there a loop
that pulls them back?** The gap today is not capability — it is **integration,
activation, and finish.** The four tracks, in leverage order:

- **Track A — Activation / first-run magic** (highest leverage). The whole value
  chain gates on Ollama + a multi-GB model pull before the user sees anything
  good. Make the first five minutes magical with zero setup.
- **Track B — Trust + agents feeling alive** (cheap, defends the moat — do early).
  "Never fabricate" is the pitch; make it visible, and make local-model latency
  read as *thinking*, not *frozen*.
- **Track C — Core-loop wiring** (the real product unlock; larger). The Vault
  knows what you own, Karn builds, the Academy practices, Tibalt roasts — wire
  them so the **collection is the spine** the whole app hangs on.
- **Track D — Craft polish + hardening** (the unglamorous finish). The documented
  tail — with the **webview CSP pulled forward to P0** because it's security, not
  cosmetics.

**Decisions captured in the review:** pursue **all four tracks**; **no pre-loaded
sample deck** (it would make users ask questions against the wrong context — a
trust failure); app-dependent items (CSP, art proxy, deck-gate pop-out) are
**verified live** with the running app.

---

## 4. The consolidated whole-app backlog

Organized by the master-plan workstream taxonomy (so the archived long-form
specs stay findable by ID), with CEO / research / Vault items folded in and
status updated to reflect what's shipped. **The Vault's own 22-item menu lives in
§5** — items here that overlap are cross-referenced.

### A — Safety & correctness (P0)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| A1 | Feedback-bundle path traversal fix | ✅ v0.11.0 (#63) | Imported timestamps build filenames; generate server-side, basename-only, assert inside `FEEDBACK_DIR`. **PLAN A1** |
| A2 | Preserve chat/session metadata across reload | ✅ v0.11.0 (#65) | Persist `deckDeclined`, message `id`, `isError`/`fallbackAvailable`/`originalPrompt`, `factReceipt`, `arbiterStatus/Sources/Trace` on a strict allowlist. Makes the deck gate + retry/trust survive restart. **PLAN A2** |
| A3 | Strict model-provider allowlist | ✅ v0.11.0 (#63) | `normalizeProvider()`; a typo must not route to Anthropic / spend credits. Arbiter stays Ollama-only. **PLAN A3** |
| A4 | Full streaming idle timeouts | ✅ v0.11.0 (#67) | Timeout must cover the body stream, reset per chunk, abort upstream, clear `sending`. **PLAN A4** |
| A5 | Invalidate server caches after data sync | ✅ v0.11.0 (#66) | Reset (or mtime-gate) `cardIndex`/`printingIndex`/rules/spellbook/salt singletons so in-app sync is visible without restart. **PLAN A5** |
| A6 | Webview CSP | ✅ [Unreleased] (#129) | Measured CSP via Next.js `headers()` on the server the webview loads from (single policy, browser-verifiable). `default-src 'self'`, inline script/style allowed (Next + inline keyframes), external script/connect/object/frame locked down; art proxy + IPC permitted. Verified live: renders + art loads + zero violations. **PLAN A6 = CEO D1** |

### B — Trust & agents feeling alive (P1, cheap)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| B1 | Streaming "Jace is reasoning…" state | ✅ [Unreleased] (#131) | "{agent} is reasoning…" shows in the pre-first-token window (`sending && !streamingMsg.content`). **CEO C1** |
| B2 | Grounding / trust badge + promote "View Arbiter Trace" | ✅ [Unreleased] (#131) | `TrustBadge` on Jace rules answers — green "✓ Rules-grounded · N CR citations" (arbiterStatus resolved) / amber "⚠ Unverified"; trace stays below. **CEO C2** |
| B3 | Graceful model-too-big fallback (14B→7B w/ one-line notice) | ✅ [Unreleased] (#133) | Memory error → retry on fast 7B + a `fallbackNotice`; raw VRAM string scrubbed. **CEO C3** |
| B4 | Ruling-card UI for Arbiter answers | ⬜ P1 | Short answer / why / rules / cards / confidence / unresolved + "run formal check." Overlaps B2. **PLAN H1** |
| B5 | Rules / data freshness warnings | ✅ [Unreleased] (#132) | knowledge-status reports card-data (>30d) + CR (>120d) staleness; header chips for all data sources are now click-to-open Data & Updates. **PLAN H2** |

### C — Activation / first-run (P0–P1)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| C1 | Guided empty state + always-visible deck-context chip | ✅ v0.17.0 (#123) | "🔒 Locked to X" banner + a new "○ No deck locked" chip (one-click bind / pointer to load). The deck context is always visible. **CEO A1** |
| C2 | "Ask now via API while your local model downloads" fast path | ✅ v0.17.0 (#123) | Ollama setup banner: while installing/pulling, "Chat now via API" + a one-line nudge. **CEO A2** |
| C3 | Model-pull progress + ETA in the install wizard | ⬜ P1 · verify live | SSE already streams; surface percent/bytes. **CEO A3 / PLAN B2** |
| C4 | Unified first-run onboarding wizard | ✅ [Unreleased] (#128) | `OnboardingWizard` — one guided first-launch flow: path (local vs API) → AI setup (Ollama install/pull or use API now) → get decks in (restore / import / skip). Writes the marker once; replaces the scattered banners. **PLAN B2** |

### D — Public-release readiness (P0–P1)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| D1 | Central Settings screen | ✅ v0.16.0 (#116) | `SettingsModal` — one place for Models / Display / Privacy / Data & Updates / About; launches the Updates panel rather than duplicating it. **PLAN B1** |
| D2 | Privacy / Legal / About page | ✅ v0.16.0 (#116) | Settings → Privacy ("what leaves your machine" + export/delete) + About & Legal (source-available license, Unofficial Fan Content disclaimer, version). **PLAN B3** |
| D3 | Feature stability labels in UI | ✅ v0.17.0 (#124) | `StabilityBadge` — Preview on The Academy, Beta on Pod Balance + goldfish; Stable unlabeled. **PLAN B6** |
| D4 | Public download / landing docs | ⬜ P1 | What it is, requirements, SmartScreen note, privacy, screenshots, limitations. **PLAN B5** |
| D5 | Support bundle ("copy/export") | ✅ v0.12.0 (#83/#90) | Version/OS/data-freshness/model+Ollama status/last error; no secrets, no deck/chat unless opted in. **PLAN B7** |
| D6 | Installer trust story (Authenticode / Store) | ⬜ decision | Paid cert or MS Store or documented SmartScreen note. Owner chooses. **PLAN B4** (deferred per CLAUDE.md) |

### E — Core-loop wiring (the product unlock)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| E1 | Karn *applies* a cut/add (real deck mutation) | ✅ v0.15.0 (#106/#108) | Action buttons on suggestions mutate the deck (+ snapshot first). The biggest loop item. **CEO B2 = PLAN C3** |
| E2 | "Play this deck in the Academy" one-click | ⬜ P1 | From deck/Vault view. **CEO B1** |
| E3 | Cost-to-finish surfaced where you build | ✅ v0.15.0 (#110) | Decks panel exists (v0.8); surface "own 87/99, finish $24" in the deck view too. **CEO B3** |

### F — Deck report & actionable analysis (P0–P1)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| F1 | Unified Deck Report + Markdown export | ✅ v0.12.0 (#74/#84) | Pieces exist (Pod Balance, recommendations, combos, legality, power); compose them into one `GET/POST /api/deck-report` + a button + Markdown export. **PLAN C1 / RSCH P0#1** |
| F2 | Rule 0 card | ✅ v0.12.0 (#75) | Table-ready intro: bracket, power, win speed, tutors, combos, fast mana, stax/salt, "what this deck does." Export/copy. **PLAN C2 / RSCH #10** |
| F3 | Actionable Karn suggestions (structured) | ⬜ P1 | add-to-wishlist / mark-cut / maybeboard / replace / save-upgrade-plan / version-before-apply. Overlaps E1. **PLAN C3** |

### G — Collection-aware deckbuilding (P0)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| G1 | "Build From Vault" mode | ✅ v0.16.0 (#114/#115) + [Unreleased] (#127) | Collection-aware Karn (deck-overlap) + Vault **Build** tab + per-candidate **ownership tags** on Karn's add chips (owned / "in N decks" / wishlist / missing) via `cardOwnershipStatuses` + `/api/collection/ownership`. **PLAN D1 / RSCH P0#2 / VAULT #20** |
| G2 | Shopping-list export | ✅ v0.12.0 (#77) | In-app list exists (v0.8); export to CSV / text / Moxfield / Archidekt; toggles for no-basics, cheapest printing, include set+price. **PLAN D2 / RSCH P0#5 / VAULT #17** |
| G3 | Collection export | ✅ v0.12.0 (#76/#85) | MTG Tool JSON / CSV / Deckbox / Moxfield-Archidekt-compatible / selected-cards. Escape hatch + backup. **PLAN D4 / RSCH P0#7 / VAULT #17** |
| G4 | Collection update / merge import | ✅ [Unreleased] (#126) | CSV import now has update modes — merge / add-only / replace / reconcile (mark-absent) — with a dry-run change preview (new / qty-changed / removed) before commit. **PLAN D5 / RSCH P0#6** |
| G5 | Physical location tracking (binders/boxes) | ⬜ P1 | Location type + name + page + slot; deck completion says "pull from Binder A / in Deck B / missing." **PLAN D3 / RSCH P1#6 / VAULT #13** |
| G6 | Scanner-CSV compatibility | ⬜ P1 | Import ManaBox / Delver Lens / Dragon Shield / TCGplayer CSV (auto-detect) → review → merge. No camera. **PLAN D6 / RSCH #8** |

### H — Deck editing, versioning, organization (P0–P1)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| H1 | Deck version history | ✅ [Unreleased] (#120) | Snapshots → **Version History**: every saved version captures the full deck (lossless), so any version is restorable (not just Karn-undo); optional label on save + rename. `createSnapshotEntry`/`relabelSnapshot` in `deckApply.js`. **PLAN E1 / RSCH P0#3** |
| H2 | Deck diff | ✅ 🟡 [Unreleased] (#121) | **Compare** panel: qty-aware diff of any version vs another or the current deck (`diffDeckCards`). Remaining: compare-vs-imported-URL (folded into H4). **PLAN E2** |
| H3 | Role view + auto-categorization | ⬜ P1 | ramp/draw/removal/wipes/protection/tutors/combo/win-con/synergy/flex; Karn classifies, user overrides, counts feed the Deck Report. **PLAN E3 / RSCH #3** |
| H4 | Refresh deck from source URL | ⬜ P1 | Re-pull Moxfield/Archidekt, diff, version-before-apply. **PLAN E4** |

### I — Search, recommendations, combo (P1–P2)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| I1 | Visual search builder | ⬜ P1 | Filter rows (color/type/MV/text/price/owned/location/role/legality/GC/salt/combo/set) + natural-language ("cheap red wipes I own") + show generated query. **PLAN F1 / RSCH #9** |
| I2 | Saved filters / smart searches | ⬜ P1 | Presets reused in Vault + builder ("owned staples not in decks"). **PLAN F2 / RSCH #8 / VAULT #16** |
| I3 | Combo Lens | ✅ 🟡 | In-deck + one-card-away shipped (v0.9 Combos tab). Remaining: result-type / bracket+salt impact, and combo actions (add-piece-to-wishlist / remove-to-lower-bracket). **PLAN F3 / RSCH #11** |
| I4 | "New cards for my decks" after sync | ⬜ P2 | Match new-set cards to saved commanders → likely upgrades + price + owned → wishlist / ask Karn. **PLAN F4 / RSCH #19** |

### J — Game tracking, goldfish, Academy (P1–P2)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| J1 | Game Night Tracker | ⬜ P1 | Real games: players (+guests), decks, winner, placement, turns, win-con, notes, bracket snapshot → win rates / matchup matrix / too-strong-or-weak signal, feeding the agents. **PLAN G1 / RSCH #12** |
| J2 | Card performance insights | ⬜ P1 | drawn-not-cast / stuck / on-curve / mulligan-liability / contributed-to-win → Karn cuts on evidence. **PLAN G2 / RSCH #15** |
| J3 | Goldfish dashboard | ⬜ P1 | Trend chart, avg score, mulligan/on-curve rate, threat-by-T5, before/after version compare. **PLAN G3 / RSCH #15** |
| J4 | Academy preview polish | 🟡 P1 | Academy section shipped (v0.8); remaining: Preview label + limitations, **session persistence** (`data/learn-sessions/`), post-game analysis, recommended-choice highlight, keyboard/a11y. = Phase-6 PRs 11–13. **PLAN G4 / CEO D3+D4** |
| J5 | Academy sandbox mode | ⬜ P2 | Manual hand/mulligan/lands/spells/counters/tokens/life + "ask Jace" + "let Garfield continue." **PLAN G5 / RSCH #14** |

### K — Import / export / backup (P0–P1)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| K1 | Export all user data | ✅ v0.12.0 (#78/#90) | `npm run backup` exists; add in-app export of decks/chats/collection/feedback/games/learn/settings (no secrets). **PLAN I1** |
| K2 | Restore from backup | ✅ v0.12.0 (#81) | Pick → preview → restore selected types → backup-before-restore. **PLAN I2** |
| K3 | Backup before destructive ops | 🟡 P1 | Backup-before-restore shipped (#81); merge-replace / sync / bulk-delete / URL-refresh-apply still uncovered. **PLAN I3** |

### L — House rules, brackets, pod fit (P2)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| L1 | House-rules profiles | ⬜ P2 | Named pod/LGS profiles: banlist, proxy rules, budget cap, bracket target, no-fast-mana/GC/MLD/extra-turns → Deck Report evaluates against them. **PLAN J1 / RSCH #16** |
| L2 | Pod power comparison | ✅ | Shipped as **Pod Balance** (v0.9). Remaining only: make it profile-aware (depends L1). **PLAN J2 / RSCH #10** |

### M — Collector metadata & trade (P2–P3)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| M1 | Collector metadata fields | 🟡 P2 | Condition stored; add proxy/signed/altered/misprint/serialized/language/custom-art/purchase price+date+source/for-trade. **PLAN K1 / RSCH #17 / VAULT #18** |
| M2 | Local trade sheet | ⬜ P3 | Mark for-trade, build proposal (my/their cards + value diff), export text/CSV. **PLAN K2 / RSCH #18 / VAULT #15** |
| M3 | Lend / borrow tracker | ⬜ P3 | Mark cards lent to pod friends + due-back. **VAULT #14** |

### N — Code quality & refactors (P1–P2, after safety)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| N1 | Decompose oversized files | ⬜ P2 | `MTGAssistant.jsx`, `FeedbackPanel.jsx`, `useChatSessions.js`, `agents.js`, `powerRanker.js`, `lib.rs` (no behavior change). **PLAN L1 / CEO D5** |
| N2 | Dead-code cleanup | 🟡 P2 | `cardContext.js` removed (#82); broader unused-export sweep still open. **PLAN L2** |
| N3 | Lint-warning cleanup | ✅ v0.12.0 (#86/#89) | All 63 warnings cleared + `eslint . --max-warnings 0` gate. **PLAN L3** |
| N4 | Local-first art completion | 🟡 P1 · verify live | Chat surfaces proxied (v0.3); route the last surfaces (hover tooltip, right-search preview, CollectionAddModal) through `/api/art-crop`. **PLAN L4 / CEO D2** |
| N5 | Art-proxy hardening | ⬜ P1 | Timeout + response-size cap + content-type validation + safe fallback. **PLAN L5** |
| N6 | Atomic-write temp names (UUID suffix) | ✅ (#80) | Avoid predictable `.tmp` collisions. **PLAN L6** |

### O — Docs, versioning, CI (P1–P2)

| ID | Item | Status | Notes / source |
|---|---|---|---|
| O1 | Align version sources | ✅ (#79, drift-guard test) | One source of truth for `package.json` / `tauri.conf.json` / changelog / user-agents. **PLAN M1** |
| O2 | Archive / refresh stale docs | ✅ (#87 HANDOFF, #64 consolidation) | HANDOFF current; minor ROADMAP/TODOS reconcile may linger. **PLAN M2** |
| O3 | Resolve local-data `.gitignore` strategy | ✅ (#88) | Tracked-seed vs ignored-user-data made explicit. **PLAN M3** |
| O4 | CI improvements | 🟡 P2 | lint-gate (#89) + test-gate + rust-gate shipped; format-check / deadcode-gate / browser-smoke still open. **PLAN M4** |

---

## 5. The Vault — active focus (the pickable menu)

The dedicated next work area. The Vault already does a lot (don't rebuild):

> **Collection:** per-printing add (set/collector/finish/treatment), quantity
> steppers, delete-at-zero, color tags (Have/Getting/Considering/Swap), CSV
> import, search/filter (owned/wishlist/all + finish), card detail drawer,
> cross-deck conflicts, cost-to-finish Decks panel + buildable-only filter,
> Tibalt "roast my collection."
> **Pricing:** TCGPlayer (via Scryfall) → printings-index → Card Kingdom fallback
> (never-nil), live "↻ Prices," daily price history (`collection-prices.jsonl`)
> with 30/90/365-day deltas.
> **Finance tab (v0.10.0):** collection value + movers; "finance plays"
> risers/fallers; "worth getting" (EDHREC staples + near-combo pieces);
> **Grails** watchlist (search-to-track + per-grail chart). Snapshot universe =
> owned + grails + top ~200 staples.
> **Known reality:** movers come from the app's own daily snapshots (no free
> historical-price API), so they fill in over ~1–2 weeks; the UI says so.

**Key files** — UI: `app/src/components/mtg/{CollectionView,VaultFinanceView,CollectionGrid,CardDetail,Filters,AddModal,ImportModal,DecksModal,RoastModal,ColorTagManager}.jsx`.
Server: `app/src/lib/server/{collectionStorage,collectionContext,collectionPrices,priceResolution,printingIndex,financeUniverse,watchlistStorage,cardKingdomPrices,scryfallPriceFetch}.js`.
Routes: `app/src/app/api/{collection[/id/prices/stats/refresh-prices/deck-costs/conflicts],finance,watchlist,printings/[search|by-name]}`.
Build scripts: `app/scripts/{build-collection-printings-index,build-oracle-index,sync-cardkingdom-prices}.cjs`.

### Pricing / finance depth

| # | Item | Status | One-liner |
|---|---|---|---|
| 1 | Price alerts | ✅ v0.13.0 | Shipped — target price + direction per card (set in the card drawer), crossing flagged on the daily snapshot, surfaced in Finance with a "🔔 N hit" badge. Engine/API #93, UI #94. |
| 2 | Per-card price sparkline | ✅ v0.13.0 | Shipped — mini SVG price-trend line in the card detail drawer for any card with ≥2 days of `collection-prices.jsonl` history (#92). |
| 3 | Collection value chart over time | ✅ v0.14.0 (#97) | Shipped — "Value over time" line in the Stats tab valuing current holdings at each daily snapshot's prices, beside the 30/90/365 deltas (#97). |
| 4 | Seed starter price history at release | ✅ | Shipped — write-path groundwork (#69) + a build-time staples seed generator wired into the release (#72). Populates day-1 Finance from the next release onward. |
| 5 | Cost-basis / P&L | ⬜ | Record what you paid; per-card + portfolio gain/loss (depends M1 purchase fields). |
| 6 | Buylist + "worth selling now" | ⬜ | Card Kingdom buylist vs retail; surface just-spiked cards to sell. |
| 7 | Rarity + set-EV signals | ⬜ | Add rarity to the index (#22); set "expected value," reserved-list flag + RL holdings value, mythic movers. |
| 8 | Deal radar / buy-the-dip | ✅ v0.15.0 (#109) | Owned/grail cards near a recent low, in the Finance tab. |
| 9 | Multi-currency + price-source comparison | ⬜ | USD/EUR/tix; TCGPlayer vs CK vs Cardmarket side-by-side; "cheapest place to buy." |
| 23 | Set browser + price-list view | ✅ v0.14.0 (#104) — TCGPlayer deep-links still pending #22 | **Now absorbs #11** (owner's reframe — see #11). Browse every set → drill into a set → see **every card** as a value/price list with **owned cards flagged** (and owned count + completion % for real expansions). Per-card tabs for **Normal / Foil / special treatments** (surge, galaxy, manafoil, etc.) each showing that printing's price. Each card links out to its **specific TCGPlayer page**. All local from the printings-index (set / collector / finishes / treatments / prices already there). **Build note:** enumerating a whole set needs a `set → cards` grouping; add it to `build-collection-printings-index.cjs` (a `bySet` map + set metadata). Deep-links need `tcgplayer_id` / `purchase_uris.tcgplayer` added there too (**pairs with #22**, `rarity` already added in #96); external link is navigation-only, so local-first holds. Relates to **#9** (price sources). |

### Collection management

| # | Item | Status | One-liner / cross-ref |
|---|---|---|---|
| 10 | Collection stats dashboard | ✅ v0.14.0 (#96) | Shipped — new Stats tab: type / color-identity / rarity / mana-curve breakdowns + top sets + most-valuable + value-over-time (#96, #97). Set-completion % deferred to #11. |
| 11 | Set completion tracker | 🔀 → #23 | **Reframed by owner (2026-05-31):** completionism isn't the goal — "having the complete sets was so I could go look through them and see what has value / what cards are in the set, more than a realistic completion number." So this folds into **#23 (Set Browser)**: browse a set as a value list with owned cards flagged; completion % is a *secondary* stat scoped to real expansions only (skip Secret Lair / Commander / promo sets). |
| 12 | Bulk edit | ✅ v0.14.0 (#100) | Select mode → multi-assign tag / delete. (Per-stack finish/quantity bulk still open.) |
| 13 | Binders / storage locations | ⬜ | = **G5** (physical location tracking). |
| 14 | Lend / borrow tracker | ⬜ | = **M3**. |
| 15 | Trade tool | ⬜ | = **M2** (wishlist↔tradelist matching within the pod). |
| 16 | Saved searches / smart filters | ⬜ | = **I2**. |
| 17 | Export | ✅ v0.12.0 | = **G2 + G3** shipped (#76/#77/#85). Remaining: vendor mass-entry cart handoff from the shopping list. |
| 18 | Condition / language | 🟡 | = **M1** (condition stored; expose language + per-condition pricing). |

### Agent / cross-feature

| # | Item | Status | One-liner / cross-ref |
|---|---|---|---|
| 19 | Deeper Vault-aware agents | ⬜ | "build the best deck I own," "what to buy/sell next," acquisition planner (optimal buy order by price/impact). Extends **E1/G1**. |
| 20 | "What can I build now" | ✅ v0.16.0 (#114/#115) | Vault **Build** tab → `GET /api/collection/buildable` ranks the legendary commanders you own by owned in-color pool; click → a fresh Karn build chat. = **G1** generation half. |

### Infra / quality

| # | Item | Status | One-liner |
|---|---|---|---|
| 21 | Background daily snapshot | ✅ v0.11.0 | Shipped — the daily snapshot now fires on app launch (`DailySnapshotTrigger` at the app root), not just on Vault open, so history accrues regardless of view. |
| 22 | Richer printings index | 🟡 | Started — `rarity` (#96), plus `setType` + `reserved` (#114) now kept per printing in `build-collection-printings-index.cjs`; populate after the next index rebuild. Remaining finance fields (set EV, full RL-value rollups, etc.) still open. Enabler for #7. |

### Recommended Vault batches

The Finance tab shipped in v0.10.0 with one structural weakness baked in: **it's
empty on a fresh install and fills in slowly.** The highest-leverage first work
is to fix exactly that, then add visible delight on data we already have. This
matches Colton's stated lean (#2, #21, #4, #1) and sequences it:

- **Batch V1 — "Finance foundation" (fix the day-1 emptiness).**
  **#21** background daily snapshot on launch + **#4** seed starter staples
  history at release. Together these make movers/finance-plays populated on
  install and accrue reliably. Small surface (a Tauri launch hook + a route +
  a build-time data bake), rides existing snapshot code, biggest payoff. Fold in
  **#22** (richer index w/ rarity) here since it's a one-file build-script change
  that unblocks #7 later.
- **Batch V2 — "Finance delight" (visible wins on existing data).**
  **#2** per-card sparkline (detail drawer + Finance rows) + **#1** price alerts
  on grails/owned. Both ride `collection-prices.jsonl` + the Grails watchlist
  that already shipped; high perceived value, low risk.
- **Batch V3 — "Collection management depth."** **#10** stats dashboard +
  **#12** bulk edit + **#11** set completion — the most-requested management
  features that don't need new data sources.
- **Later (cross-feature, larger):** #3 value chart, #5/#6 P&L + buylist,
  #8 deal radar, #9 multi-currency; and the items that are really whole-app
  workstreams (#13→G5, #15→M2, #17→G2/G3, #19/#20→E1/G1).

---

## 6. Recommended execution order

Two parallel intents are in play — **release-quality hardening** (the master
plan's instinct: safety → public-readiness → core features) and **the active
Vault feature track** (Colton's current focus). They don't conflict; the Vault
batches are small and ride shipped data, while the safety items are independent.

**Strategic spine (CEO):** `Track A (activation) → Track B (trust) → Track C
(core-loop wiring) → Track D (finish/harden)`, with **CSP (A6/D1) pulled to P0**
as a security item.

**Concrete near-term sequence:**

1. **Safety P0 batch** — A1 (path traversal), A3 (provider allowlist), A4 (stream
   timeouts), A2 (metadata persistence), A5 (cache invalidation). These are cheap,
   headless, and protect cost + correctness. (PLAN PR 1–4.)
2. **Vault V1 + V2** — the finance-foundation and finance-delight batches (§5).
   Independent of #1, rides shipped data, keeps the active track moving.
3. **CSP (A6) + art completion (N4) + art hardening (N5)** — the verification-gated
   security/local-first tail, done live against the running app.
4. **Activation + trust** — C1/C2 (empty-state chip, ask-via-API), C4 (unified
   onboarding); B1/B2/B3 (reasoning state, trust badge, model fallback).
5. **Core-loop unlock** — F1 (Deck Report) → E1 (Karn applies changes) →
   G1/G2 (Build-From-Vault + shopping-list export) → H1/H2 (deck versioning on
   top of snapshots). This is the dream-state "collection is the spine" wiring.
6. **Public-release skeleton** — D1 (Settings), D2 (Privacy/About), D3 (labels),
   K1–K3 (export/restore/backup), D4/D5 (landing docs + support bundle).
7. **Then the differentiators** — role view (H3), search builder + saved filters
   (I1/I2), combo-lens depth (I3), Game Night Tracker (J1), goldfish dashboard
   (J2/J3), Academy polish (J4 = Phase-6 PRs 11–13).
8. **Refactors + CI last** — N1–N3, N6, O1–O4 (after the safety work they touch).

**Phase 6 (Academy) note:** it remains a self-contained feature track (J4). Next
is **PR 11 — the 4P LearnView UI**; spec in `docs/phase6-learn-to-play.md` §11.
Two modes only (Standard 1v1 / Commander 4P) — never an abstract N-player engine.

---

## 7. Decisions captured

| Decision | Outcome | Source |
|---|---|---|
| Which strategic tracks | **All four** (A/B/C/D) | CEO review |
| Pre-loaded sample deck | **Cut** — would confuse users into wrong-context questions | CEO review |
| App-dependent items (CSP, art, deck-gate) | **Verify-as-we-go** against the running app | CEO review |
| Deck gate (Step 0) | **Shipped** (v0.9.0) — Karn/Tibalt require a deck; Jace exempt | CHANGELOG |
| Local-first mandate | No new external runtime deps; prices/data from local indexes | CLAUDE.md |
| Scanner support | **Import CSV first**, not native camera | research |
| Sharing | **Export-first** (Markdown/decklist), not hosted/social | research |
| Movers data source | App's own daily snapshots (no free historical API); UI is honest about fill-in | v0.10.0 |

---

## 8. Out of scope / deferred

- **Abstract N-player engine** — the Academy forks only at 2 vs 4 players. Don't generalize. (CEO)
- **Native camera scanner** — CSV import is the far better first step. (research P3 #16)
- **Social profiles / hosted deck sharing** — conflicts with local-first; prefer export. (research P3 #17)
- **Full life tracker** — dedicated mobile apps do this well; start with game logging + optional desktop table mode. (research P3 #18)
- **Trade network** (social) — a local trade sheet (M2) is enough. (research P3 #19)
- **Multi-device sync** — complicates the local-first promise; revisit only after export/backup is excellent. (research P3 #20)
- **Authenticode / Microsoft Store** — paid, optional; owner decides when public (D6). (CLAUDE.md)
- **Server/cloud vector DB** (Weaviate/Qdrant/Supabase) — only if local outgrows the hardware. (PLAN)
- **File associations (.dec/.txt)** — already declined; the import loop is URL/paste. (CLAUDE.md)

---

## 9. Testing backlog

Add tests alongside the features that introduce them: feedback-bundle traversal
(A1); provider allowlist (A3); stream timeout (A4); chat-metadata persistence
(A2); sync cache invalidation (A5); deck-gate reload + confirm-modal flows (A2);
Deck Report generation (F1); shopping-list export (G2); collection export (G3);
collection merge import (G4); deck version diff (H1/H2); role auto-categorization
(H3); search builder (I1); combo-lens actions (I3); Game Night Tracker (J1);
Academy resume / post-game (J4); Settings model/privacy behavior (D1); onboarding
(C4); support-bundle redaction (D5); and for the Vault: snapshot-on-launch (#21),
seed-history build step (#4), sparkline data shaping (#2), price-alert crossing
(#1). Route tests tolerate 200-or-503 (CI runs data-less) and use a 30000ms
timeout when they load big indexes.

---

## 10. Working agreement (verification, PR, release)

**Verify before handoff** (from `app/`):
```powershell
npm test            # full vitest suite must pass (~775+ cases)
npm run lint        # 0 errors
npm run check       # next build clean
npm run deadcode    # when touching module structure
npm audit --omit=dev
```
Build only when the task needs it: `npm run tauri:build` (unsigned) /
`npm run tauri:build:release` (signed). Rust changes also gate on
`cargo fmt --check` + `cargo clippy --release -D warnings` in `app/src-tauri/`.

**Ship:** branch off `master` (direct push blocked) → `gh pr create` → wait for
green CI → squash-merge. For a release: stamp `CHANGELOG` `[Unreleased] → [vX.Y.Z]`
in its own tiny PR, then `git tag vX.Y.Z -a -m "…" && git push origin vX.Y.Z`
(CI builds + signs + publishes, ~18 min). Minor bump for features.

**Always:** use `paths.js` helpers (never raw `process.cwd()`/`__dirname` in app
code); surface errors (no silent `try/catch`); never fabricate rule numbers or
card text; Arbiter stays Ollama-only; update `CHANGELOG` + docs for user-facing
change.

---

## Appendix A — research links

For validating product decisions (from the web-research pass):

- Archidekt feature voting — https://archidekt.com/features/
- Moxfield undo/history request — https://moxfield.nolt.io/1479
- Moxfield feature wiki mirror — https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features
- ManaBox — https://manabox.app/ · collection guide https://manabox.app/guides/collection/getting-started/ · decks-in-collection https://manabox.app/guides/decks/collection-decks/ · scanner https://manabox.app/guides/scanner/getting-started/
- Dragon Shield MTG Scanner — https://apps.apple.com/us/app/mtg-scanner-dragon-shield/id1460657155 · Card Manager update https://about.dragonshield.com/gaming-inspiration/new-features-now-available-on-card-manager/
- Delver Lens — https://www.delverlab.com/
- Eldwyn — https://eldwyn.app/ · Dragon Counter — https://dragoncounter.com/ · Lifetap — https://getlifetap.com/ · Gauntlet — https://gauntletapp.com/
- Playgroup.gg Live — https://playgroup.gg/playgroup-live · FAQ https://playgroup.gg/faqs
- EDHREC — usage https://edhrec.com/guides/how-to-use-edhrec · Archidekt guide https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site · digital deckbuilding https://edhrec.com/articles/digital-deckbuilding-the-how-to-guide-to-building-a-commander-deck-using-edhrec-archidekt-and-commander-spellbook · Scryfall syntax https://edhrec.com/guides/guide-to-scryfall-syntax
- Commander Spellbook — https://commanderspellbook.com/ · syntax https://commanderspellbook.com/syntax-guide/
- WotC Commander Brackets Beta — https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta · update https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025/
- Rate My Decks — https://www.ratemydecks.com/ · MTG Master — https://mtgmaster.app/features · TableCommander — https://tablecommander.com/docs/decks · BinderBrew — https://binderbrew.com/moxfield-deck-builder · BuildMyDeck — https://buildmydeck.app/ · Bulk Commander — https://www.bulkcommander.com/

---

*Consolidated 2026-05-31 from the CEO review, the master LLM implementation plan,
and the product feature web research (all archived under
`docs/archive/planning-sources-2026-05-31/`), plus the Vault backlog menu.
This is the strategic source of truth; `docs/HANDOFF.md` is its tactical companion.*
