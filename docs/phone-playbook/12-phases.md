# 12 — PHASES (M0–M5)

> **OMNATH IN POCKET · execution playbook · doc 12 of 17**
> The build sequence. Every task: **outcome · acceptance · deps · box
> flag**. Every phase: a LIVE exit gate (observable on real hardware —
> `15-test-strategy.md`). Boot prompts per phase: `16-launch-prompts.md`.
>
> **Flags:** `[BOX]` = needs the Mac hub · `[NET]` = needs internet, not
> the Mac · `[—]` = fully standalone. Phase-level: M0 and M1's functional
> core are box-independent; M2/M3 gate on the Mac; M4 is mixed; M5 is
> box-independent but assumes M2–M4 shipped.

---

## Ordering rules

1. M0 → M1 strictly ordered (the shell consumes the extracted core).
2. M2 → M3 strictly ordered (tiers route over sync-era hub plumbing).
3. M4 tasks may interleave with M3 where deps allow (life-polish and
   scanner-spec don't need agents).
4. **Do not start M1 UI work with M0's gate red.** The never-skip law:
   a red gate stops the line (`CLAUDE.md §1.4` discipline inherited).
5. The Mac landing mid-phase re-orders nothing: box-gated tasks queue
   until it exists; standalone lanes keep moving.

---

## M0 — FIELD-CORE EXTRACTION  `[—]` (start any time; desktop-verifiable)

**Goal:** the app's brain becomes mountable in a browser context —
without changing desktop behavior one byte.

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M0.1 | Route census refresh | the §5.2 disposition table of `01-architecture.md` re-verified against the CURRENT tree (it will have drifted since 2026-07-04) | census PR'd as a checklist doc; surprises logged | — |
| M0.2 | StorageAdapter interface + NodeFsAdapter | one interface (contract: `01 §4.2`); Node impl wrapping today's `paths.js` + `atomicJson` + `jsonFile` semantics exactly | adapter contract test suite passes on NodeFsAdapter; `paths.js` resolution behavior (writable-over-bundled) covered by tests | M0.1 |
| M0.3 | MemoryAdapter (test impl) | in-memory adapter for tests + the browser-proof harness | same contract suite passes on it | M0.2 |
| M0.4 | Refactor raw-fs call-sites through the adapter | the ~22 routes recon flagged (re-count in M0.1) + the storage modules (`collectionStorage`, `watchlistStorage`, `gameRecordsStore`, `profiles`, `deckPersistence`, `colorTagStore`, `priceAlertStorage`, chat persistence) read/write ONLY via the adapter | full suite green after each batch (mechanical, land in small PRs); zero direct `fs`/`process.cwd` imports left in domain modules (lint rule added to enforce it forever) | M0.2 |
| M0.5 | Extract keep-list logic → `lib/services/` | every SVC/SVC-NET route from the disposition table becomes a plain adapter-injected function; API routes become thin wrappers calling it | desktop routes byte-identical behavior (existing suite + targeted route tests); services importable standalone | M0.4 |
| M0.6 | Browser-context proof harness | vitest (jsdom/browser condition) suite that mounts the services + engine + retrieval on MemoryAdapter with NO Node builtins available | proof suite green: services run Node-free; any Node import fails the build | M0.3, M0.5 |
| M0.7 | Data-bundle builder, tiered | CI script(s) emitting: bootstrap (~25MB), full JSON tier (~0.5GB), art packs — with tier manifest + hashes (extends the existing `tier-manifest.json` pattern + existing sync/build scripts) | artifacts build in CI; manifest hash-verifies; desktop can consume the same artifacts (no fork in the data pipeline) | — (parallel lane) |
| M0.8 | Capability-profile flag scaffold | `field`/`full` profile resolved at build; service registry + nav honor it (D-P9) | desktop `full` build unchanged; a `field`-profile desktop dev-build renders only the six-tab surface (early smoke of the phone IA truth) | M0.5 |

**EXIT GATE (live):** full suite green (7,681+ baseline — no count
regression) · desktop `.exe` built from the branch behaves identically
on a real-use smoke script (decks, chat, vault, pod) · the browser-proof
harness passes with Node builtins fenced off · CI emits the data tiers.
**This gate is deliberately suite-heavy** — M0 is the one phase whose
risk is regression, not novelty (`15 §layers`).

---

## M1 — ANDROID SHELL ON THE PIXEL  `[—]` core · `[NET]` data pull

**Goal:** cold boot on the Pixel 10 → a real, offline-capable field app
(no hub, no agents beyond T0 yet).

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M1.1 | Tauri 2 Android target boots | the Rust shell builds an APK; webview loads a hello-static-export; ⚠ V1 (Tauri-Android current state — read the fall-2026 docs FIRST, budget a spike day) | APK sideloads + boots on the Pixel 10 | M0 gate |
| M1.2 | Next static export of the field UI | `output:"export"` build of the app shell under the `field` profile; dynamic-route params resolved export-compatibly | export builds clean; loads in the webview | M0.8 |
| M1.3 | TauriFsAdapter | the adapter's Android impl (Tauri fs plugin; atomic-write semantics ⚠ V16 — temp+rename or best equivalent) | adapter contract suite passes on-device (run via a debug harness screen); writable/bundled resolution works with the downloaded-tier layout | M1.1 |
| M1.4 | First-run flow + DownloadsManager | bootstrap tier in-APK; full tier pull on wifi from GitHub Releases w/ resume + hash verify; art packs opt-in (`01 §8`, D-P10) | fresh install → usable in 30s → full tier lands + verifies; kill/resume mid-download works | M0.7, M1.3 |
| M1.5 | The six-tab shell + LEYLINE mobile | tabs, top bar, sync chip (in `local` state), theme adaptation (`10 §1–2`) | one-hand audit (`10 §7.1`) passes on the five primary flows | M1.2 |
| M1.6 | Decks tab live | library/view/edit/paste-import per `03` on the replica | `03 §6.1` airplane-mode CRUD drill passes | M1.3, M1.5 |
| M1.7 | Rules tab live | CR search + inspector per `08` | `08 §6.1` citation grep-match drill passes | M1.3, M1.5 |
| M1.8 | Pod tab live | balance + rate per `05` | `05 §6.1` parity drill passes (values match desktop) | M1.3, M1.5 |
| M1.9 | Life tracker v1 | setup + counter suite + session persistence + promotion (`06`; Planechase display may land minimal — full polish M4) | `06 §7.1` real-game drill + `06 §7.2` kill-resume drill | M1.3, M1.5 |
| M1.10 | Vault tab (standalone surfaces) | collection/watchlist/ledger browse+edit per `07 §1.1–1.3`; job surfaces show honest "no hub yet" states | `07 §6.1` con-floor drill + `07 §6.2` booth-add drill (minus the sync half) | M1.3, M1.5 |
| M1.11 | Art serving in the webview | cached art renders via the chosen mechanism (⚠ V13; blob-URL fallback ready) | deck thumbs + inspector art + plane art render from cache offline | M1.3 |
| M1.12 | Update path decision | how the APK updates (in-app fetch vs re-sideload; ⚠ V2) — decided + minimal implementation | an old build discovers + installs a new build (or the documented manual flow works) | M1.1 |

**EXIT GATE (live, spec-mandated):** on the Pixel 10, **airplane mode
ON from cold boot**: deck view AND edit → rules search with real
citations → pod balance → life-track a (real or scripted) game → vault
grail lookup. Kill the app mid-life-game and resume. Zero network
touched. *(The chip reads `local` — no hub exists yet, and that's
honest.)*

---

## M2 — SYNC TO THE MAC HUB  `[BOX]`

**Goal:** the Mac exists; two replicas + one canonical hub reconcile;
the sync UX contract goes live.

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M2.1 | Mac hub base setup (runbook'd) | Tailscale joined; Docker + Weaviate (arm64) up; hub service skeleton + `/health`; bearer token issued (`01 §6`) — every step captured in a reproducible runbook doc | `/health` reachable from phone + desktop over tailnet, nothing listens publicly (port-scan check from off-mesh) | the Mac |
| M2.2 | Canonical store + journal on the hub | entity stores + canonical journal (`02 §4/§7.1`); nightly export/backup job | records land + survive restart; backup artifact produced | M2.1 |
| M2.3 | recordId/rev migration | ids+revs added where missing across entities on BOTH clients (`02 §3`) | migration runs on real desktop data safely (backup first); suite green | M0 |
| M2.4 | Sync client (shared) + desktop mount | the sync cycle (`02 §5.1`) as a shared module; desktop runs it (its first hub awareness) | desktop pushes its store as canonical seed; re-sync is idempotent (run twice → no-ops) | M2.2, M2.3 |
| M2.5 | Phone sync mount + chip goes live | phone runs the same cycle; chip states per `02 §9`; sync sheet | phone pulls the seeded snapshot; edits round-trip; chip states all reachable by inducing them | M2.4 |
| M2.6 | Conflict detection + resolution UX | fork detection hubside (`02 §5.2`); ConflictSheet + deck merge helper (`02 §6.4`) | the fork drill (`03 §6.4`) passes end-to-end | M2.5 |
| M2.7 | Tombstones + compaction | delete-tombstone flow + hub compaction once both cursors pass (`02 §4`, D-P5) | delete-on-phone survives a desktop round-trip (no resurrection); compaction shrinks the journal | M2.5 |
| M2.8 | Weaviate ingestion + reindex | journal-tailing indexer + reference-class ingestion + the `weaviate-reindex` rebuild command (`02 §7.2`) | reindex-from-canonical rebuilds a dropped Weaviate to identical search results | M2.2 |
| M2.9 | Poison-op quarantine + failure honesty | `02 §5.4` behaviors | a hand-crafted poison op parks visibly; the rest of sync flows | M2.5 |

**EXIT GATE (live, spec-mandated):** edit a deck on the phone in
airplane mode → land at home → **silent** auto-sync → the edit is on
the desktop. Reverse direction likewise. Then the deliberate-fork drill
→ exactly one conflict prompt → merge → both edits live everywhere.
Chip told the truth the whole way.

---

## M3 — AGENT TIERS  `[BOX]` (+`[NET]` for T3)

**Goal:** the agents come alive on the phone at full strength.

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M3.1 | Mac serving stack stood up | 70B+ chat model + embed model + Arbiter service on the hub (⚠ V12 stack choice); hub chat endpoint (streaming, persona-agnostic — `11 §5`) + retrieval endpoint (`02 §7.2`) | desktop-side smoke: a chat streams from the hub; retrieval returns ranked slices | M2.1 |
| M3.2 | Webview streaming proof | ⚠ V6 spike: SSE/fetch-streaming from hub + from Anthropic API in the Android webview; chunked-poll fallback implemented if needed | streamed tokens render live on the phone from both sources | M1 |
| M3.3 | Tier router + health integration | routing per `11 §3` incl. model-role status, no-silent-fallback rules | tier matrix drill (`11 §8.1`) | M3.1, M3.2 |
| M3.4 | Agents tab goes full | sessions, deck-lock context assembly (SVC), badges, offline degrade cards (`04`) | cross-device continuity (`04 §6.4`) + degrade honesty (`04 §6.5`) | M3.3, M2 |
| M3.5 | Jace offline mode (T0/T2) | retrieval-first degrade (`04 §1.5`); T2 only if V4/V5 verify lands a runtime worth shipping — T0-only is an acceptable M3 ship | offline-Jace gate (`11 §8.3`) | M1.7 |
| M3.6 | RAG plans + citation audit hook | per-agent retrieval plans (`11 §4.2`) + the citation audit (`11 §4.3`) | planted-fake-citation drill (`11 §8.5`) | M3.1 |
| M3.7 | Cost gate + dashboard sync | T3 manual gate, per-agent thresholds, synced `model-calls` ledger (`11 §6`) | money drill (`11 §8.4`) | M2 |
| M3.8 | Omnath (personal flavor) | MemoryDoc RAG + persona mount, personal build only (`04 §1.6`) | Omnath answers a vault-grounded question on the phone; giftable build has zero trace (early check of the M5 split) | M3.4, M2.8 |

**EXIT GATE (live, spec-mandated):** a **full Karn deck-build session
on the phone against the Mac** (buckets, baselines, real suggestions)
— then airplane mode → **Jace answers a rules question with CR
citations that grep-match the bundle**. Both on the Pixel, same day,
no cherry-picking.

---

## M4 — VAULT ALIVE + TABLE POLISH  `[BOX]` jobs · `[—]` polish

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M4.1 | Hub job runner + the three jobs | grail scan · news digest · price refresh on the Mac (D-P4, `07 §1.4`), outputs as synced records; per-source degrade; satire tagging at ingestion | jobs run on schedule; outputs sync; hub-status line reports them | M2 |
| M4.2 | Notification delivery | ⚠ V9 mechanism chosen + built; in-app badge inbox ships regardless (`07 §1.5`) | grail-match notification (or badge) fires end-to-end from a seeded match | M4.1 |
| M4.3 | Daily brief surface | the brief screen + history (`07 §1.6`) | brief lands + reads well offline later (`07 §6.4`) | M4.1 |
| M4.4 | Life tracker polish | full Planechase display + planar die + table-mode rotation + haptics/wake-lock hardening (`06 §1.3–1.4`, ⚠ V14/V15) | Planechase gate at a real table (`06 §7.3`) + endurance dogfood (`06 §7.5`) | M1.9 |
| M4.5 | Offline hard-mode audit | every screen swept in airplane mode; every network touch gated + honest (`10 §7.3`) | audit checklist clean | M1–M3 |
| M4.6 | Battery + perf pass | wake-lock policy, blur fallback check, tab jank, art-cache memory cap (`10 §1/§7.5`) | perf floor drill passes; a game night doesn't cook the battery | M4.4 |
| M4.7 | Scanner future-spec refresh | `09` re-verified against the now-current landscape (V8 probe: camera access + runtime feasibility spike, NO feature build) | go/no-go + updated `09` doc for the post-M5 build slot | M1 |

**EXIT GATE (live, spec-mandated):** a seeded **grail match fires a
real notification** on the phone · the **daily brief lands** and reads
· **Planechase display works at a real table** through a real game.

---

## M5 — SPLIT, POLISH, PROVE  `[—]` (assumes M2–M4 shipped)

| # | Task | Outcome | Acceptance | Deps |
|---|---|---|---|---|
| M5.1 | Personal/giftable build flavors | the two-axis build matrix (profile × flavor, D12/D-P9): personal = Omnath + owner data hooks + signed-project layer; giftable = clean + "grow your own companion" onboarding | giftable purity sweep (`04 §6.6`): no Omnath strings, no owner data, no vault hooks in the APK | M3.8 |
| M5.2 | Giftable onboarding | first-run companion setup (fresh persona, empty memory) — the gift experience | a fresh install on a second device walks it cleanly (Joe-readiness, even if not yet gifted) | M5.1 |
| M5.3 | Event polish sweep | the accumulated paper cuts from dogfood (`15 §dogfood` feeds this list) | dogfood burn-down: the top-10 field annoyances closed | M4 |
| M5.4 | **Con-day dry run** | the full-day offline field drill (`15 §con-day` script) | **the M5 gate below** | all |
| M5.5 | Sideload/distribution decision | stay-sideload vs Play internal track (deferred C1) — decided with reasons logged | decision + (if Play) track set up | M5.1 |

**EXIT GATE (live, spec-mandated — the graduation exam):** a full
**con-day dry run on the Pixel** with wifi degraded/absent all day:
life-track real games, deck views/edits, rules lookups, grail checks —
all survive offline; battery survives the day; **sync catches up
cleanly on evening reconnect** (zero lost edits, zero false conflicts).
Pass = OMNATH IN POCKET ships.

---

## Dependency sketch

```
M0 ──► M1 ──────────► M3 ──► M4(jobs) ──► M5
        │              ▲        ▲
        │   [MAC LANDS]│        │
        └────► M2 ─────┴────────┘
M4(polish/scanner-spec) hangs off M1 and interleaves with M2/M3 freely
```

---

*Cross-refs: every task's behavior spec lives in docs 01–11 · gates
methodology `15-test-strategy.md` · ⚠ items `13-risk-and-verify.md` ·
boot prompts `16-launch-prompts.md`.*
