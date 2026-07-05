# 01 — ARCHITECTURE

> **OMNATH IN POCKET · execution playbook · doc 01 of 17**
> The system shape: three planes, the StorageAdapter seam, the Mac-hub
> topology, closed-system security, and the OFFLINE-FIRST model.
> Decisions referenced as D# trace to `14-decision-log.md`.

---

## 1. The one-paragraph shape

The phone runs the **entire field core client-side**: a Tauri 2 Android
shell hosting a static-exported Next.js UI, with all former `/api/*` logic
the phone needs relocated into a plain-JS service layer that executes in
the webview (D1). Storage goes through a **StorageAdapter** interface —
Node-fs on desktop, Tauri-fs on Android, in-memory in tests. The phone
holds a **complete writable replica** of all user data and works fully at
zero signal (D4). A **Mac Studio** (D2) is the always-on canonical hub:
canonical JSON store + change journal, Weaviate-in-Docker for semantic
search/memory, and a 70B+ model serving full-strength agents. Clients
reach it **only over Tailscale** (D3). Sync is silent LWW reconciliation
with a status chip and a conflict prompt only on genuine divergence (D4,
D5). No public surface exists anywhere.

---

## 2. The three planes

Keep these planes separate in your head and in the code. Conflating them
(especially data vs inference) was the historical failure mode this
architecture explicitly closes.

```
┌─────────────────────────────────────────────────────────────────────┐
│ APP PLANE — what runs on each device                                │
│   Phone: Tauri 2 Android shell → webview → static Next UI          │
│          → client-side services (lib/services/) → StorageAdapter    │
│   Desktop (.exe, unchanged short-term): Tauri shell → Node sidecar │
│          → Next server → same service functions mounted as routes   │
├─────────────────────────────────────────────────────────────────────┤
│ DATA PLANE — where truth lives                                      │
│   Each client: full local writable replica (user data) +            │
│                bundled reference data (Scryfall/CR/spellbook/salt)   │
│   Mac hub:   CANONICAL store = JSON records + change journal        │
│              Weaviate (Docker) = semantic index + memory vault      │
│              (index is DERIVED — losable, reindexable; D-P3)        │
├─────────────────────────────────────────────────────────────────────┤
│ INFERENCE PLANE — what generates text                               │
│   Tier 1: Mac 70B+ (Jace/Karn/Tibalt/Omnath full-strength + Arbiter)│
│   Tier 2: on-device small model (offline narration) ⚠ VERIFY       │
│   Tier 3: Anthropic API (manual, per-agent cost gate)               │
│   Tier 0 (always): pure-JS retrieval — rules/oracle search needs    │
│           NO model at all and is never gated on one                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Plane rules:**
- The data plane never depends on the inference plane. Weaviate down or
  model unloaded → decks, life tracker, rules search all still work.
- The inference plane consumes the data plane through RAG
  (`11-agent-tiers.md`) — it never becomes a store.
- The app plane treats both as *reachable services with offline
  fallbacks*, never as assumptions.

---

## 3. Topology

```
                         TAILSCALE PRIVATE MESH (only Colton's devices)
        ┌────────────────────────────────────────────────────────────┐
        │                                                            │
  ┌─────┴──────┐         ┌──────────────────────────────┐      ┌─────┴─────┐
  │ PIXEL 10   │         │ MAC STUDIO (always-on hub)   │      │ DESKTOP   │
  │ Tauri 2    │  sync   │                              │ sync │ .exe      │
  │ Android    │◄───────►│  hub service (custom, small) │◄────►│ (Node     │
  │            │  HTTPS/ │   ├─ canonical JSON + journal│      │  sidecar, │
  │ webview:   │  tailnet│   ├─ merge/reconcile (LWW)   │      │  today's  │
  │  UI + full │         │   └─ replica snapshot seed   │      │  arch)    │
  │  JS core   │  agent  │                              │      │           │
  │            │  calls  │  Weaviate (Docker, arm64)    │      │           │
  │ local      │◄───────►│   └─ vectors + memory vault  │      │           │
  │ replica    │         │                              │      │           │
  │ (writable) │         │  Model server (70B+)         │      │           │
  │            │         │   ├─ Jace/Karn/Tibalt/Omnath │      │           │
  │ bundled    │         │   └─ Arbiter (silent engine) │      │           │
  │ ref data   │         │                              │      │           │
  └────────────┘         │  Background jobs (D-P4)      │      └───────────┘
        │                │   ├─ grail-match daily scan  │
        │ OFFLINE:       │   └─ news digest build       │
        │ everything     └──────────────┬───────────────┘
        │ above the fold                │ outbound-only fetches
        │ still works                   ▼ (Scryfall/EDHREC/news)
        │                        public internet
        ▼                        (NEVER inbound)
   zero signal
```

**Reading the diagram:**
- Three machines, one mesh, zero public listeners. The only traffic that
  touches the public internet is the Mac's *outbound* data-sync jobs
  (Scryfall bulk, price refresh, news digest sources) and each device's
  GitHub Releases update check — both patterns the desktop already has.
- The desktop keeps its current architecture (Node sidecar) untouched
  short-term; it gains a sync client speaking the same protocol as the
  phone (`02-data-and-sync.md`). Desktop convergence onto the client-side
  core is deferred (D14 Part C, C2).
- The phone talks to the Mac for exactly three things: **sync**, **agent
  inference**, **Weaviate-backed retrieval**. All three degrade gracefully
  to offline behavior.

---

## 4. The StorageAdapter seam (the keystone)

### 4.1 What it is

One interface for all app-data reads/writes. Everything above it is
isomorphic JS; everything below it is per-platform.

```
                    ┌────────────────────────────┐
                    │  services / engine / UI    │   (isomorphic, shared)
                    └─────────────┬──────────────┘
                                  │  StorageAdapter interface
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
     NodeFsAdapter         TauriFsAdapter         MemoryAdapter
     (desktop today —      (Android; later         (tests; also the
      wraps paths.js        desktop too)            browser-context
      semantics)                                    proof harness)
```

### 4.2 Interface shape (conceptual contract — final signature at M0)

The adapter must cover what `lib/server/` actually does today (recon,
2026-07-04): `paths.js` path resolution, `atomicJson.js` atomic writes,
`jsonFile.js` read/write, plus directory listing and existence checks used
by the storage modules (`collectionStorage`, `watchlistStorage`,
`gameRecordsStore`, `profiles`, `deckPersistence`, `colorTagStore`,
`priceAlertStorage`, chat persistence).

Contract essentials (semantics, not signatures):

| Capability | Semantic requirement |
|---|---|
| `readJson(rel)` / `readText(rel)` | **Writable-over-bundled resolution**: look in the writable user dir first; fall back to the bundled reference dir if present there (today's `dataPath()` behavior — preserve it exactly) |
| `writeJson(rel, data)` | **Atomic** (temp + rename today; Tauri equivalent ⚠ V16). Writes always target the writable dir |
| `list(relDir)` | Merged view is NOT required — match today's semantics per call-site (verify at M0; most listers only read the writable dir) |
| `exists(rel)`, `remove(rel)` | Plain; `remove` only ever touches the writable dir |
| `readBinary(rel)` / streaming read | For art/image serving in the webview (see §7.3) |
| Namespacing | The adapter is constructed with the root context (appRoot / judgeDir / engineDir / referenceDir) — call-sites never build absolute paths |

**Hard rule carried from the desktop (Forbidden Pattern #7):** no raw
`process.cwd()` / `__dirname` path math anywhere above the adapter. On
Android there IS no cwd worth trusting.

### 4.3 What lives behind it vs above it

- **Behind:** platform fs, path resolution, atomicity, the
  writable-vs-bundled decision.
- **Above:** ALL domain logic — deck persistence, collection storage,
  card index loading, rules index loading, journal writes. These modules
  keep their names and shapes; they swap direct `fs`/`paths.js` calls for
  the injected adapter. Recon: ~22 routes currently call fs directly —
  that's the M0 grunt list (`12-phases.md §M0`).

### 4.4 Reference data via the adapter

`cardIndex.js`, `rulesRetrieval.js`, `printingIndex.js`, spellbook/salt
loaders all read big JSON through the adapter with **lazy load + cache**
semantics (they already lazy-cache in-process today). On Android the
bundled tier lands in app storage on first-run download (§8), so
"bundled" resolves to the downloaded reference dir. Same resolution
order, different physical roots.

---

## 5. The client-side service layer

### 5.1 One implementation, two mounts

Every keep-list route's logic moves to `lib/services/<domain>.js` (plain
functions, adapter-injected, zero Node imports). Desktop API routes become
thin wrappers calling the same functions — proving the extraction on the
existing 530-file vitest suite before Android exists (M0 exit gate).

```
            lib/services/decks.js  ← ONE implementation
              ▲                ▲
   desktop:   │                │   phone:
   /api/decks route.js         │   UI calls the function directly
   (thin wrapper, unchanged    │   (no HTTP, no serialization,
    external behavior)         │    same in-process objects)
```

### 5.2 Route census → service disposition

Grounded in the live route list (recon 2026-07-04). **This table is a
living checklist — re-verify the census at M0 start; the tree will have
drifted.** Disposition classes:

- **SVC** — extract to `lib/services/`, runs client-side on phone
- **SVC-NET** — extract, but the function performs external network fetch → online-only on phone, graceful offline error
- **HUB** — becomes a Mac-hub call from the phone (inference or heavy/external work)
- **CUT** — not in the field profile; never renders on phone (D-P8, D-P9)

| Route (today) | Class | Notes |
|---|---|---|
| `cards`, `printings/*`, `art-crop`, `card-image` | SVC | oracle/printing lookups + art serving (§7.3 for images) |
| `rules-retrieval` | SVC | BM25 over the 2MB rules index — pure JS, the CREED backbone |
| `pod-balance`, `pod-balance/rate` | SVC | powerRanker + edhrecSalt over bundled data |
| `power-rank` | SVC | dependency of pod-balance |
| `decks`, `deck-report` | SVC | full CRUD + analytics (lib/deck/*) |
| `decks/import-url` | SVC-NET | Moxfield/Archidekt fetch — online-only; paste import is the offline path |
| `chats` | SVC | chat history persistence (chatPersistence.js) |
| `profiles`, `profiles/*` | SVC | pod player profiles |
| `collection` + browse subroutes (`stats`, `ownership`, `sets`, `artists`, `[id]`, `export`, `import`, `deck-overlap`, `deck-costs`, `buildable`, `combos`, `conflicts`, `shopping-list`) | SVC | Vault reads/writes over the replica; heavy ones lazy-load |
| `collection/refresh-prices`, `price-history`, `prices` | HUB (jobs) + SVC (read) | price *refresh* = Mac job (external net); price *read* = local cached snapshot |
| `price-alerts` | HUB (jobs) + SVC (read) | alert scan runs on Mac; phone reads/edits alert defs |
| `watchlist` | SVC | the grail list — full CRUD on phone |
| `finance` | SVC (read) | cached finance universe; refresh = Mac job |
| `records`, `games`, `games-summary` | SVC | game records/ledger; phone also WRITES (life-tracker sessions) |
| `color-tags` | SVC | small store |
| `combos` | SVC | spellbook lookups over bundled data |
| `chat-stream` | HUB / API | inference: Mac model or Anthropic API; on-device tier ⚠ (`11-agent-tiers.md`) |
| `arbiter` | HUB | Arbiter lives on the Mac (D7); offline → retrieval-only fallback |
| `tibalt/roast-collection` | HUB | LLM work |
| `recommend` | HUB | Karn-grade suggestion work → Mac |
| `model-calls` | SVC (read) + HUB (write) | cost dashboard reads synced log |
| `ollama-health` | replaced | becomes hub-health check (§6.3) |
| `feedback/*` | SVC | keep — field feedback is valuable; syncs home |
| `first-launch` | rebuilt | phone gets its own first-run flow (§8) |
| `sync-data`, `install-ollama`, `support-bundle` | CUT | desktop-OS machinery |
| `learn/*`, `puzzles`, `self-play`, `mulligan-lab`, `judge-quiz`, `knowledge-status` | CUT | Sim/Academy = desktop-only (D-P8); judge-quiz deferred (D-P7) |
| `export-all`, `import-all` | CUT v1 | desktop backup surface; replica sync covers the phone |

### 5.3 Capability profiles (D-P9)

One flag — `field` (phone) vs `full` (desktop) — resolved at build time
into the service registry and the navigation tree. CUT features are
**absent** on `field` builds (not hidden): their services aren't bundled,
their nav entries don't exist, their components tree-shake out. The
personal/giftable flavor flag (D12) is a second, independent axis
(`omnath: true|false`) applied the same way at M5.

---

## 6. Networking inside the closed system

### 6.1 Tailscale posture (D3)

- All hub reach is tailnet-internal. The hub binds to the tailnet
  interface (or localhost + tailscale serve) — **never** 0.0.0.0 on a
  public interface.
- Phone roams (LTE, con wifi, hotel wifi) — Tailscale makes topology
  irrelevant; the app only ever dials the hub's stable tailnet name.
- ⚠ VERIFY AT BUILD (V11): Tailscale-on-Android battery behavior +
  always-on VPN slot interaction (Android allows one VPN). Fallback: sync
  is opportunistic anyway — worst case the app syncs when the user opens
  it and Tailscale is up.

### 6.2 Defense-in-depth (cheap, do it anyway)

Single-user closed system ≠ zero hygiene. The threat model is "a device
joins the tailnet that shouldn't have" and "a bug binds a port publicly."

- Hub API requires a static bearer token (generated at hub setup, stored
  in each client's local config). One `if` per request; kills the
  drive-by class entirely.
- Hub service logs every request source; the journal records device IDs.
- TLS inside the tailnet: prefer `tailscale serve`-style certs if trivial
  at build time; otherwise tailnet encryption (WireGuard) already covers
  transport. ⚠ V11 note — decide at M2, don't pre-commit.
- The Android webview app must ship with cleartext-traffic scoped to the
  tailnet hub name only (or TLS) — never a blanket cleartext allowance.
  ⚠ VERIFY exact Android network-security-config mechanics at M1.

### 6.3 Reachability model

One tiny hub-health endpoint (`/health` → version + roles up: sync,
weaviate, model). The phone probes it:
- on app foreground,
- before any agent call routed to the Mac,
- on the sync scheduler's tick.

Result feeds a single `hubReachable` state that drives: the sync chip,
agent tier routing (`11-agent-tiers.md §routing`), and Vault job
freshness banners. **No feature blocks on the probe** — offline paths are
the default; reachability only *upgrades* behavior.

---

## 7. OFFLINE-FIRST mechanics (app-plane view)

Data-plane detail (journal, reconcile, conflicts) lives in
`02-data-and-sync.md`. This section is what the *app* does.

### 7.1 The replica is the working store

Every read and every write in the UI hits the **local replica** through
the services — always, even when online. Sync is a background process
that reconciles the replica with the hub; no UI path ever does a
read-through/write-through to the Mac. This is the single most important
invariant: **the app cannot tell whether it's offline by looking at its
data layer.** Only the sync chip and tier router know.

### 7.2 What degrades when offline (and ONLY these)

| Capability | Offline behavior |
|---|---|
| Mac-tier agents (full Jace/Karn/Tibalt/Omnath, Arbiter) | Hidden or degraded to on-device/retrieval tier with an explicit badge (`11-agent-tiers.md`) |
| Weaviate semantic search | Falls back to local lexical index (BM25/minisearch class) over cached JSON |
| URL deck import | Disabled with "paste list instead" affordance |
| Price refresh / grail scan / news digest | Show last-synced snapshot + its date; never spin |
| Sync | Chip shows `⚠ offline · N pending`; journal queues |

Everything else — deck CRUD, life tracker, pod balance, rules/oracle,
Vault browse/annotate, chat *history* — is fully functional offline by
construction.

### 7.3 Serving bundled/cached art in the webview

Today `art-crop`/`card-image` are HTTP routes streaming files. In the
static-export phone app there is no HTTP server. Options (decide at M1):
asset-protocol URLs from the Tauri fs scope, `convertFileSrc`-style
URIs, or blob URLs from adapter `readBinary`. ⚠ VERIFY AT BUILD (V13) —
webview file-URI policies shift. Fallback: blob URLs always work, at a
memory cost; cap the in-memory image cache.

### 7.4 Sync UX in the shell (D4)

- The **sync chip** is a persistent element of the app header
  (`10-ui-ia.md §shell`): `✓ synced` / `⟳ syncing…` / `⚠ offline · N
  pending` / `!` conflict badge. Tap = force sync now + open a small sync
  detail sheet (last sync time, pending count, per-entity breakdown,
  conflict list if any).
- Conflict prompts are **modal only at the moment of user attention** —
  they appear when the user opens the sync sheet or touches the affected
  record, never as an interrupting popup on reconnect.

---

## 8. First-run + data delivery (phone)

1. **APK sideload** to the Pixel 10 (no store, v1 — D1). ⚠ V10: signing +
   `adb install` vs share-link flow, decide at M1.
2. **Cold boot** ships with a slim bootstrap in the APK (~25MB: oracle
   slim index + rules index) so the app is useful in the first 30
   seconds.
3. **Full JSON tier (~0.5GB — D-P10)** auto-pulls on wifi from GitHub
   Releases (same CI artifacts the desktop consumes), with resume +
   integrity check (manifest + hash — the tier-manifest pattern already
   exists in `app/data/scryfall-bulk/`).
4. **Art packs** tiered: watchlist/collection pack first; full (~5–6GB)
   optional, wifi-only, user-triggered.
5. **Replica seed**: if a Mac hub exists and is reachable → pull the
   canonical replica snapshot (M2+). If not → start with an empty replica
   (standalone mode is fully supported; the hub can be adopted later and
   the phone's data becomes the initial canonical import).
6. **Updates**: app updates via sideload/in-app APK fetch ⚠ V2 (the
   desktop updater plugin ≠ Android); data updates via the existing
   release-manifest delta pattern.

---

## 9. What explicitly does NOT change

- **Desktop `.exe` architecture** — Node sidecar, port 3000, tray,
  updater: untouched through M4. It gains only (a) the service-layer
  refactor under its routes (byte-identical behavior, M0 gate) and (b) a
  sync client (M2).
- **CI release pipeline** — same tag-driven flow; M1 adds an Android
  artifact lane beside the Windows one.
- **The CREED and paths discipline** — all Forbidden Patterns from
  `CLAUDE.md §8` bind on the phone exactly as on desktop.

---

## 10. Box-dependency map (architecture level)

| Piece | Standalone (no Mac) | With Mac |
|---|---|---|
| Phone app core (all six tabs, offline behaviors) | ✅ full | ✅ |
| Sync/replication | ⛔ queues forever (chip shows pending honestly) | ✅ |
| Full-strength agents + Arbiter | ⛔ (on-device tier only, if built ⚠) | ✅ |
| Semantic (vector) search | ⛔ lexical fallback only | ✅ |
| Background jobs + notifications | ⛔ stale-snapshot display | ✅ |
| API-tier agents | ✅ (needs internet, not the Mac) | ✅ |

M0 and the functional core of M1 are box-independent; M2+ gates on the
Mac (`12-phases.md`).

---

*Cross-refs: `02-data-and-sync.md` (data plane detail) ·
`11-agent-tiers.md` (inference plane detail) · `10-ui-ia.md` (shell/chip
UI) · `12-phases.md` (build order) · `13-risk-and-verify.md` (all ⚠ V#
items).*
