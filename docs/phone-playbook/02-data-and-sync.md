# 02 — DATA & SYNC

> **OMNATH IN POCKET · execution playbook · doc 02 of 17**
> Every entity, the journal + LWW replication model, the sync protocol,
> the Weaviate schema, offline indexes, and the sync UX contract.
> Topology + planes: `01-architecture.md`. Decisions: D4, D5, D6, D-P3,
> D-P5, D-P6, D-P10 in `14-decision-log.md`.

---

## 1. Data classes

Three classes with different lifecycles. Never mix their handling.

| Class | Examples | Lives | Syncs? | Truth |
|---|---|---|---|---|
| **USER DATA** | decks, chats, collection, watchlist, records | writable replica on each client | ✅ journal + LWW | Mac canonical store |
| **REFERENCE DATA** | Scryfall oracle/printings/rulings, CR JSON, rules index, spellbook, salt, plane cards | read-only bundle per device | ⛔ versioned release artifacts, delta-updated | CI-built snapshot |
| **DERIVED DATA** | Weaviate vectors, lexical indexes, price snapshots, digest output | wherever computed | ⛔ (results of jobs sync as user-data records where needed) | recomputable |

**Rule:** derived data is always losable. If deleting it would lose
information, it was user data all along — reclassify it.

---

## 2. Entity census (user data)

Grounded in the live storage modules (recon 2026-07-04). Record
granularity = the unit LWW applies to. **Re-verify the census at M2
start** — the tree drifts.

| Entity | Today's module | Record granularity | Phone writes? | Conflict likelihood | Notes |
|---|---|---|---|---|---|
| Deck | `lib/deck/deckPersistence.js` + `deckMemory.js` | one deck (list + memory + metadata) | ✅ full CRUD (D8) | **highest** — the reason the conflict UX exists | merge helper offered on divergence (§6.4) |
| Chat session | `chatPersistence.js` | one session (append-heavy) | ✅ new turns | low — sessions are effectively single-device streams | append-merge special case (§6.5) |
| Collection item | `collectionStorage.js` | one card entry (printing, qty, condition, tags) | ✅ add/annotate | low | bulk imports stay desktop-comfortable but aren't restricted |
| Watchlist (grail) entry | `watchlistStorage.js` | one entry | ✅ | low | con-floor add is a primary phone flow |
| Showpiece/ledger entry | collection/records surface (v0.89.0 kiosk) | one entry | ✅ annotate | low | signed-deck provenance — personal build emphasis |
| Game record | `gameRecordsStore.js` | one game | ✅ (life tracker writes these) | ~zero — created once, edited rarely | `06-feat-life-tracker.md §session` |
| Life session (live) | **NEW** | one active session | ✅ constantly | none — device-local until finalized (§2.1) | promotes to Game record on finish |
| Profile (pod player) | `profiles.js` | one profile | ✅ | low | |
| Color tags | `colorTagStore.js` | tag-map chunk | ✅ | low | consider per-card records if chunk conflicts annoy |
| Price alert def | `priceAlertStorage.js` | one alert | ✅ | low | scan runs on Mac (D-P4) |
| Feedback entry | feedback store | one entry (append-only) | ✅ | none | field feedback is gold — syncs home |
| Settings / app config | per-device file | — | ✅ | — | **device-local, NOT synced** (tier prefs, art cache policy, token) |
| Model-call log | `model-calls` log | append-only entries | ✅ (its own calls) | none | feeds the cost dashboard |
| Job outputs (digest, grail matches, price snapshot) | **NEW** (Mac jobs) | one dated result | ⛔ (Mac writes, phone reads) | none | sync down only |
| Memory vault docs (Omnath) | omnath vault | one doc | ✅ (personal build) | low | personal flavor only (D12) |

### 2.1 Live life-session exception

The active life-tracker session writes on every tap. It stays
**device-local** (crash-safe local persistence, `06 §5`) and enters the
synced world only when finalized into a Game record. Rationale: syncing
per-tap counter deltas buys nothing (one table, one device) and would spam
the journal.

---

## 3. Identity, revisions, ordering

- **recordId**: stable ULID-style id per record, assigned at creation,
  never reused. Existing entities keep their current ids/filenames where
  stable; M2 adds ids where missing (migration step, `12-phases.md §M2`).
- **rev**: per-record integer, bumped on every local commit —
  `rev = max(rev_known) + 1` (per-record Lamport counter). Carried with
  the record and in every journal op.
- **ts**: wall-clock ISO stamp — for humans and tiebreaks only. Never
  primary ordering (phones drift; airplane mode + clock changes happen).
- **deviceId**: stable per install (`phone-pixel10`, `desktop-main`,
  `hub`).

**LWW rule (D5):** higher `rev` wins. Equal `rev` from different devices
= a genuine fork → **conflict, prompt the human** (§6.4). (Do NOT silently
tiebreak forks on `ts` — the whole point of the prompt is that equal-rev
forks are exactly the rare case worth human eyes. `ts` orders the two
candidates in the prompt UI, nothing more.)

---

## 4. The change journal

Append-only log per client + the hub's canonical journal.

**Op shape (durable contract — field names final at M2):**

```
{ opId,          // ulid — unique, sortable
  deviceId,
  entity,        // "deck" | "chat" | "collectionItem" | ...
  recordId,
  baseRev,       // rev the edit was made against (fork detection)
  rev,           // resulting rev
  kind,          // "upsert" | "delete" (delete = tombstone, D-P5)
  ts,
  payloadHash }  // integrity; payload = the full record snapshot
```

- **Full-record snapshots, not diffs.** Records here are small (a deck
  JSON is KBs); snapshot ops make apply idempotent and merge trivial.
  (Chat sessions get the append-merge carve-out, §6.5.)
- **Tombstones (D-P5):** `delete` ops leave a tombstone record; the hub
  compacts tombstones + superseded ops once **both** clients' cursors
  have passed them (≤2 clients makes this check trivial).
- **Journal compaction (client-side):** ops already acknowledged by the
  hub can be pruned locally; keep a rolling window for debugging.
- The journal doubles as the **audit/debug trail** — sync bugs are
  diagnosed by diffing journals, so keep ops human-readable JSON-lines.

---

## 5. The sync protocol (hub service, D-P6)

Custom, small, HTTP over the tailnet, bearer-token'd (`01 §6.2`).
Transport shape is a durable contract; exact framing/lib is Opus's call
at M2.

### 5.1 Cycle (client-initiated, both clients run the same logic)

```
1. PROBE     GET /health                     → hub up? versions match?
2. HANDSHAKE GET /sync/cursors?device=D      → hub's cursor for D
                                               + D's cursor for hub
3. PUSH      POST /sync/ops (my ops since hub's cursor for me)
             → hub applies LWW against canonical, detects forks,
               returns { accepted, conflicts[] }
4. PULL      GET /sync/ops?since=(my cursor of hub)
             → canonical ops from the OTHER device (+ hub jobs)
             → apply locally (LWW; local unpushed ops already sent)
5. CHECKPOINT both sides persist new cursors atomically
```

- **Idempotent + resumable:** every step keyed by opId/cursor; a killed
  app mid-cycle re-runs safely (at-least-once apply, effects
  deduplicated by opId).
- **Triggers:** app foreground · record commit while `hubReachable` ·
  periodic tick while foregrounded · chip tap (force). Background sync on
  Android ⚠ V3 — treat as bonus, not architecture: the design must be
  correct with foreground-only sync.
- **Near-real-time when online** = commit-triggered push (step 3 fires
  within ~seconds of an edit). "Real-time" transport (websocket push
  from hub) is an optimization to evaluate at M2, not a requirement —
  with ≤2 clients and one human, pull-on-foreground covers the actual
  usage pattern.

### 5.2 Hub apply semantics

For each pushed op: if `baseRev == canonicalRev` → clean advance (the
~99% path — silent). If `baseRev < canonicalRev` and the canonical chain
already contains a different op at that rev from the *other* device →
**fork** → store both candidates, mark record `conflicted`, include in
the response's `conflicts[]`. The record stays at the pre-fork canonical
version until a resolution op arrives (conservative: nothing clobbers
silently — D4.3).

### 5.3 Seeding + adoption

- **Hub-first (expected path):** M2 stands up the hub → desktop pushes
  its full store as the canonical seed → phone pulls the snapshot
  (`GET /sync/snapshot`, then incremental thereafter).
- **Phone-first (standalone era):** the phone may accumulate months of
  data before the Mac exists. Adoption = phone pushes its full journal
  as the canonical seed. If BOTH have pre-hub data (likely: desktop has
  years, phone has months), adoption runs the normal merge: desktop
  seeds canonical, phone's ops apply with fork-prompts on any overlap
  (in practice near-zero overlap — different record sets until sync
  exists).

### 5.4 Failure honesty

Every sync failure is visible in the sync sheet with a cause line (hub
unreachable · token rejected · version mismatch · apply error + opId).
**No silent retry loops that mask a broken hub.** Repeated apply errors
on one op → quarantine the op (park it, surface it, keep syncing the
rest) — never wedge the whole pipe on one poison record.

---

## 6. Conflict UX (the D4.3 contract)

### 6.1 When a prompt exists

Only on a genuine fork (§5.2). One-side edits — however many, however
old — auto-merge silently. Going offline for a week and editing 40
things = zero prompts, provided the desktop didn't touch the same
records.

### 6.2 Where it appears

Never as an interrupting popup on reconnect. The chip gains a `!` badge;
the sync sheet lists conflicts; opening an affected record surfaces its
conflict banner inline. (`01 §7.4`, `10-ui-ia.md §chip`.)

### 6.3 The prompt

Per conflicted record: **Keep phone** · **Keep desktop** · **Merge**
(where a merge helper exists). Shows both candidates with device, time,
and a domain-aware diff summary (decks: card-level adds/cuts diff — not
raw JSON).

### 6.4 Merge helpers (build only where domain-meaningful)

- **Deck:** three-way card-list merge against the common ancestor
  (both adds kept, both cuts kept, quantity conflicts highlighted
  per-card). Deck metadata (name, notes): field-level pick.
- **Collection item / watchlist / profile:** field-level pick UI.
- Everything else: whole-record pick (keep phone / keep desktop).

Resolution emits a **new op** (rev above both candidates, kind upsert)
— the journal never rewrites history.

### 6.5 Chat append-merge carve-out

Chat sessions are append-only in practice. A fork (turns added to the
same session from both devices — rare) auto-merges by interleaving turns
by `ts` with a session banner noting the merge. No prompt: no
information is lost by interleaving, and prompting over chat logs is
noise. (Editing/deleting past turns, if ever added, re-opens this —
logged guard in `13 §H9`.)

---

## 7. The Mac canonical store + Weaviate (D6, D-P3)

### 7.1 Canonical structured store

Plain JSON records + the canonical journal on the Mac's disk, organized
per entity — the same file-shapes the desktop already speaks (atomicJson
discipline), owned by the hub service. Backed up by normal Mac means
(Time Machine) + a nightly export job. **This store is the system of
record. Weaviate can be dropped and rebuilt from it at any time.**

### 7.2 Weaviate's job

Semantic retrieval + the memory vault. Runs in Docker (arm64) on the
Mac. Embeddings computed locally via Ollama embed model (D6 — no
external embed API; exact model + wiring ⚠ V7).

**Collection schema (durable intent — exact class defs at M2/M3):**

| Class | Sourced from | Key properties | Vectorized text | Serves |
|---|---|---|---|---|
| `RuleChunk` | CR JSON (reference) | ruleNumber, section, text | rule text | semantic rules search; Jace/Arbiter RAG. **CREED: `ruleNumber` copied verbatim from `cr_current.json` at index time — retrieval returns real numbers, generators cite only what retrieval returned** |
| `CardOracle` | oracle index (reference) | oracleId, name, types, oracleText, colors | name + type + oracle text | semantic card search ("cards like X"); Karn RAG |
| `ComboEntry` | spellbook (reference) | comboId, cardNames[], result | pieces + result text | combo retrieval |
| `MemoryDoc` | omnath vault (user, personal build) | docName, docType, updatedAt, body | body | Omnath's RAG memory |
| `GameRecord` | game records (user) | gameId, decks[], result, date, notes | narrative summary | "how do I do against X" retrieval |
| `DeckNote` | deck memory/notes (user) | deckId, noteType, body | body | Karn/Tibalt deck-history RAG |

- **Ingestion:** a hub-side indexer tails the canonical journal →
  upserts changed projections. Reference classes ingest on data-bundle
  version bumps. One command rebuilds everything from canonical
  (`weaviate-reindex`) — this command existing and working is an M2
  acceptance item.
- **Phone never talks to Weaviate directly in v1.** Retrieval calls go
  through the hub's small retrieval endpoint (keeps Weaviate's API ⚠
  volatility contained in one process, keeps the token story simple).

### 7.3 Offline lexical fallback (phone)

A light client-side lexical index (BM25/minisearch class) over cached
JSON, built lazily per data-tier version, persisted via the adapter:
- rules search: the existing 2MB rules index **is already this** —
  `rulesRetrieval.js` ports as-is (SVC).
- card search: name/type/text lexical over the oracle slim index.
- collection/watchlist search: plain field filters over the replica.

Semantic niceties degrade; search never disappears (`01 §7.2`).

---

## 8. Reference-data pipeline (unchanged pattern, new consumer)

- CI builds the tiers (existing scripts: `sync:scryfall-bulk`,
  `build:oracle-index`, `build:rules-index`, `sync:spellbook`,
  `sync:edhrec-salt`) → release artifacts with a tier manifest + hashes.
- Phone: slim bootstrap in-APK (~25MB) → full tier (~0.5GB) on wifi →
  art packs tiered (D-P10). Resume + hash-verify (the
  `tier-manifest.json` pattern exists — extend it).
- Delta updates: manifest-diff → fetch changed files only. Reference
  updates NEVER ride the sync protocol (§1 rule).
- **Plane cards** (Planechase) must be present in the bundled tier —
  verify the slim/oracle builders don't filter them out ⚠ V14
  (`06-feat-life-tracker.md §planechase`).

**Footprint budget (recon numbers, re-measure at M0):**

| Tier | Size | Contents |
|---|---|---|
| Bootstrap (in-APK) | ~25MB | oracle slim index + rules index (2MB) |
| Full JSON (default) | ~0.5GB | full oracle, rulings, printings, spellbook, salt |
| Art: watchlist/collection pack | varies (~100s MB) | crops for owned + watched |
| Art: full | ~5–6GB | optional, wifi, user-triggered |

---

## 9. Sync status chip — state contract

The chip (`10-ui-ia.md §shell`) renders exactly one of:

| State | Condition | Tap action |
|---|---|---|
| `✓ synced` | last cycle clean, 0 pending, hub reachable recently | open sync sheet |
| `⟳ syncing…` | cycle in flight | sheet (live progress) |
| `⚠ offline · N pending` | hub unreachable, N unpushed ops | force probe + sheet |
| `✕ sync error` | last cycle failed (cause retained) | sheet with cause + retry |
| `! N conflicts` | unresolved forks | sheet → conflict list |

Standalone era (no hub configured at all): the chip collapses to a
neutral `local` state — no warning theatre for a hub that intentionally
doesn't exist yet.

---

## 10. Hazard hooks (detail in `13-risk-and-verify.md`)

Clock skew (H4) · journal growth/compaction (H5) · replica corruption →
re-seed from canonical (H6) · Weaviate schema migration (H7) · poison-op
quarantine (§5.4) · hub-disk backup discipline (H8) · chat-edit
carve-out guard (H9).

---

*Cross-refs: `01-architecture.md` (planes, adapter, profiles) ·
`03-feat-decks.md` (deck merge) · `06-feat-life-tracker.md` (session
promotion) · `07-feat-vault.md` (job outputs) · `11-agent-tiers.md`
(retrieval endpoint) · `12-phases.md §M2` (build order) ·
`13-risk-and-verify.md` (V/H registers).*
