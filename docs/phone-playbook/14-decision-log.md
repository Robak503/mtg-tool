# 14 — DECISION LOG

> **OMNATH IN POCKET · execution playbook · doc 14 of 17**
> Authored by Fable 5, 2026-07-04, from Colton's authoritative spec
> (`memory/orders/phone-app-fable-brief.md` Part 2). Executed later by Opus/Cindy.

---

## How to use this document

Every decision here is **closed**. The purpose of this file is to stop
re-litigation: when future-Opus (or a review agent, or Colton on a forgetful
day) asks "wait, why aren't we using CRDTs?" — the answer is here, with the
reasoning that closed it.

**Authority tiers:**

| Tier | Who locked it | Who can re-open it |
|---|---|---|
| **SPEC** | Colton, 2026-07-04 (the brief) | Colton only, explicitly |
| **PLAYBOOK** | Fable 5, expanding the spec | Colton, or Opus with a written reason logged here |
| **DEFERRED** | Explicitly not decided | Anyone — route to `QUESTIONS-FOR-COLTON.md` |

**Append-only.** Never edit a decision's history — add a dated supersession
entry below it. Several decisions here already carry supersession trails
(Karn, deck editing, offline posture); that trail is the proof this process
works.

---

## Part A — SPEC-tier decisions (Colton, 2026-07-04)

### D1. Platform = Tauri 2 Android · static-export UI · client-side services · NO Node sidecar

**Decision:** The phone build is Tauri 2 targeting Android. The Next.js UI
ships as a static export (`output: "export"`). All former `/api/*` route
logic that the phone needs becomes a client-side service layer running in
the webview. There is no bundled Node.js on the phone.

**Why:**
- Recon (2026-07-04) proved the engine, rules retrieval, and card index are
  **100% isomorphic pure JS** — zero Node-only deps beyond `fs`, which is
  exactly the seam the StorageAdapter abstracts. The port is plumbing, not a
  rewrite.
- A Node sidecar on Android is unsupported/fragile territory; the desktop's
  spawn-a-server architecture exists because of desktop constraints that
  don't apply in a webview that can run the whole core.
- Tauri 2 is already the desktop shell — one Rust codebase, one team-brain.
- First carrier is Colton's **Pixel 10, sideloaded** — no Play Store
  gatekeeping in v1.

**Consequences:** the StorageAdapter seam (D13) becomes the keystone; M0 is
mechanical extraction work that is desktop-verifiable and box-independent.

---

### D2. The Mac Studio is the always-on canonical hub · wait for the M5 refresh · 70B+ model target

**Decision:** A Mac Studio (decision detail in
`memory/project_server_box_decision.md`) is the always-on home box. Purchase
waits for the **M5 refresh (~fall 2026)**; then compare M5 Ultra/Max against
a discounted M3 Ultra. It holds the one source-of-truth data, runs Weaviate
in Docker, and serves a **70B+ model** for full-strength agents.

**Why:**
- Apple Silicon unified memory is the only quiet, low-idle-watt,
  shelf-appliance way to hold a 70B-class model (70B-Q4 ≈ 40GB weights +
  context overhead → 96GB+ Ultra-class minimum; Colton's "maybe larger"
  musing points at 128GB+ tiers).
- Inference for a single user is bandwidth-bound, not throughput-bound —
  Ultra-class bandwidth beats a discrete-GPU box that caps at 32GB.
- Always-on native, silent, ~watts idle — it can host background jobs and
  sync 24/7 without being a gaming-PC roommate (the RTX 5080 desktop has
  VRAM contention: `memory/reference_local_model_vram_contention.md`).

**Consequences:** every box-gated task in `12-phases.md` carries a `[BOX]`
flag; M0 proceeds now, M2+ waits for hardware. The 70B+ ambition reinforces
the 96GB+ floor when the purchase comparison happens.

---

### D3. ≤2 clients · Tailscale-only · closed, single-user, private system

**Decision:** Exactly two clients ever (phone + desktop `.exe`), rarely
concurrent. All reach to the Mac hub is over **Tailscale** (private mesh,
owner's devices only). No public endpoint, no multi-tenant anything, no
account system.

**Why:**
- It's Colton's personal tool. Nothing sensitive transits it, there is no
  realistic theft surface, and the bandwidth is his alone (owner's explicit
  posture, 2026-07-04).
- Tailscale gives encrypted device-to-device reach with zero port-forwarding,
  zero public attack surface, and works from any network the phone roams to.
- Single-user closed system kills entire problem classes: authnz UX,
  rate-limiting, abuse, GDPR-shaped ceremony. Don't build what the threat
  model doesn't need.

**Consequences:** hub API can be simple bearer-token-inside-the-mesh
(defense-in-depth, `01-architecture.md §security`); sync protocol designs
for 2 replicas + 1 hub, never N.

---

### D4. OFFLINE-FIRST — the full app works at zero signal, deck editing included

**Decision:** The phone holds a **complete local writable replica** and is
fully standalone. Everything functions offline: deck view AND edit, life
tracker, rules/oracle, pod balancer, Vault browse (cached), any agent whose
model is on-device. Mac-hosted agents degrade or hide when unreachable. The
Mac is the **canonical merge hub** the phone reconciles against on reconnect
— not a runtime dependency.

**Sync UX (resolved from Colton's "auto vs popup" question — layered hybrid):**
1. **Silent auto-sync when there is no conflict** (~99% case).
2. **Persistent, non-blocking sync-status chip** — always visible
   (`✓ synced` / `⟳ syncing…` / `⚠ offline · N pending`); tap to force-sync.
   Ambient signal, never a nagging popup.
3. **Conflict prompt ONLY on genuine divergence** (same record edited on both
   clients while apart) → keep phone / keep desktop / merge.

**Supersession trail:**
- *2026-07-04 (early):* online-first + offline field-cache (phone as thin
  client to the hub, offline = read-mostly field kit).
- *2026-07-04 (final, Colton):* **OFFLINE-FIRST supersedes.** The phone is
  the daily driver and the con-floor tool; a MagicCon hall with zero bars is
  the design case, not the edge case. Deck editing offline included.

**Why:**
- The desert-island mandate is the project's prime directive; the phone
  inherits it fully.
- Con-floor reality: the exact moments the tool matters most (vendor booth,
  pod table) are the worst-connectivity moments.
- ≤2 clients + single active writer makes full-replica reconciliation cheap
  (see D5) — there was no complexity tax to pay for going offline-first.

**Consequences:** every feature doc (03–09) must specify its offline state
explicitly; `12-phases.md` M1 exit gate runs in airplane mode; the con-day
dry run (`15-test-strategy.md`) is the ultimate acceptance test.

---

### D5. Replication = last-writer-wins per record + a change journal · NO CRDTs

**Decision:** Sync is per-record last-writer-wins with an append-only change
journal on each client; the Mac merges. No CRDT layer.

**Why:**
- ≤2 clients, single active writer almost always. Genuine concurrent edits
  of the same record are rare-by-construction; when they happen, a human
  conflict prompt (D4.3) is *better* than silent algorithmic merging —
  Colton should decide which deck edit wins, not a lattice.
- CRDTs buy convergence guarantees this topology doesn't need, at the cost
  of schema contortion (per-field tombstone metadata everywhere) and library
  risk on a fall-2026 Android webview.
- The journal gives everything auditable: what changed, when, from which
  device — which is also the debugging story for sync bugs.

**Escape hatch (logged, not planned):** if the client count ever grows past
2 or conflicts stop being rare, CRDT (or a per-field merge policy) is the
bulletproof upgrade. The journal format in `02-data-and-sync.md` is designed
so that upgrade wouldn't require a data migration, only a merge-policy swap.

---

### D6. Data plane = Weaviate, self-hosted in Docker on the Mac

**Decision:** Weaviate (open-source, self-hosted, arm64 Docker on the Mac)
is the semantic data/memory plane: memory vault (docs + embeddings),
semantic card/combo/rules search, game records. Embeddings computed locally
via Ollama — no external embedding API. Phone offline uses a light local
index over cached JSON instead.

**Why:**
- localhost = sub-ms retrieval vs cloud round-trips (owner: "faster response
  times").
- $0 forever; open-source; no per-query metering on a tool that will make
  thousands of RAG calls.
- Data never leaves the box — the local-first mandate applied to the memory
  plane.
- arm64 images run clean on Apple Silicon.
- Colton works for a vector-DB company — the *evaluation* of a trusted cloud
  vector DB happened (see phone-port-plan trail) and self-hosted won on the
  mandate: his hardware, his data, zero external dependency.

**Playbook clarification (PLAYBOOK-tier, see D-P3):** Weaviate is the
**semantic index**, not the store-of-record for structured user data. Decks,
chats, vault entries live as canonical JSON + journal on the Mac's disk;
Weaviate holds derived vectors + searchable projections. Rationale in D-P3.

---

### D7. All four agents on the phone · full Karn is BACK · Omnath rides the personal build only

**Decision:** Jace, Karn, Tibalt on every build; **Omnath only on Colton's
personal build** (the vault as data source + a voice). Heavy agents run
against the Mac 70B+ when online and degrade/hide offline. Arbiter remains
the hidden rules engine (Ollama heritage — lives on the Mac).

**Supersession trail:**
- *2026-07-04 (early):* Karn CUT from phone v1 — "deck-building isn't
  on-the-go," and no hardware could serve him.
- *2026-07-04 (final, Colton):* **Karn is BACK.** The Mac hub changes the
  calculus: full 70B-class Karn reachable from the couch or the con hotel is
  exactly the deck-building surface Colton wants, and the phone is his
  primary surface (daily driver, not just field tool).

**Why:** agent quality was the reason to cut; the hub removed the reason.

**Consequences:** `11-agent-tiers.md` owns per-agent routing; Karn's UI must
handle the offline-degrade state gracefully (he's the most box-dependent
agent).

---

### D8. Full deck editability on the phone, near-real-time sync

**Decision:** Real add/cut/swap editing, categories, quantities — the full
deck CRUD surface — on the phone, syncing to the hub near-real-time when
online, queuing offline.

**Supersession trail:**
- *2026-07-04 (early lean):* view + "changes to make at home" notes only
  (sync pain avoidance).
- *2026-07-04 (final, Colton):* **full editing.** The phone is the daily
  driver; a view-only deck surface on the primary device is a constant
  paper cut. D4 (offline-first) + D5 (LWW + journal) dissolve the sync-pain
  argument.

---

### D9. Life tracker is IN — full Commander counter suite + Planechase

**Decision:** A 2–6 player life tracker with the full Commander counter
suite: life; **per-opponent commander damage with the 21-rule**; poison;
energy; experience; monarch; day/night; **planar die + Planechase
plane-card display**. Rotatable/round table seating, big tap targets,
fully offline. (Resolves the old "M4 nice-to-have or out of scope?" open
call: IN, and it lands early — it's in the M1 exit gate.)

**Why:**
- The app is a *table* tool; the single most-used app at a real pod is the
  life tracker. Owning it keeps the phone in-app all game — which is also
  what makes the deck-lock/agent/game-record loop natural later.
- Planechase display makes the tool the table's shared companion, not just
  Colton's counter.
- Pure client-side feature — zero box dependency, zero external data beyond
  bundled Scryfall (plane cards) — a perfect airplane-mode showcase.

**Consequences:** `06-feat-life-tracker.md` is a net-new feature spec (the
desktop app has no life tracker today — board state lives in the sim);
plane-card data availability in the bundled Scryfall snapshot is a
verify-at-build item (`13-risk-and-verify.md §V14`).

---

### D10. Vault ships FULLY functioning — including background jobs, notifications, and the news digest

**Decision:** Collection browse/search, grail watchlist, showpiece/signed
ledger — full CRUD — plus **background daily jobs** (grail-match scan; daily
Magic-news digest from WotC / MTGGoldfish / EDHREC / edhtop16 / Commander's
Herald **[SATIRE — entertainment, never cited as news]**), and **push
notifications** on a grail match or the daily brief. Personal build layers
signed-deck-project customization (signed-Omnath progress, artist-signing
watch). Offline = cached read + queued annotate.

**Why:**
- The Vault is the con-floor killer feature (grail check at a vendor booth)
  AND the couch daily-driver hook (morning brief). Both surfaces are phone
  surfaces.
- The desktop kiosk Vault shipped in v0.89.0 — the phone *consumes* that
  shipped surface; this is an adaptation, not a rebuild.
- The `omnath-tools` patterns (`meta-weather.cjs`, `daily-codex.cjs`, the
  grail tracker) already prove the digest/scan logic — port the patterns,
  don't reinvent.

**Consequences:** jobs need an always-on home → they run on the **Mac**
(PLAYBOOK D-P4); notification delivery inside a closed Tailscale system (no
public push service) is a verify-at-build item with an in-app-badge
fallback.

---

### D11. Card scanner — design the full spec now, build later

**Decision:** Phone camera → identify the physical card → act on it
(add-to-deck / price + grail check / Vault entry). Full future-feature spec
written now (`09-feat-card-scanner.md`); implementation deferred to a late
phase. On-device recognition feasibility/runtime is **⚠ VERIFY AT BUILD**.

**Why:**
- It's the most hardware/library-volatile feature in the set — locking
  implementation choices in mid-2026 for a fall-2026+ build would be
  fabricating the future. Datasets + Scryfall imagery exist; the UX
  patterns (Delver Lens, ManaBox, TCGplayer scan) are stable enough to
  spec against.
- Designing now means the data hooks (scan → oracle id → action) are already
  in the service layer's shape, so the scanner bolts on instead of boring in.

---

### D12. Personal vs giftable split

**Decision:** Two build flavors from one codebase. **Personal** (Colton):
Omnath agent, Colton's data/vault, signed-deck-project customization.
**Giftable:** the general app — Jace/Karn/Tibalt, full Vault/features, a
fresh "grow your own companion" onboarding — **no Omnath, no owner data**.

**Why:**
- Omnath's memory IS Colton's private data; shipping it anywhere is
  unthinkable, but the app itself is giftable (Joe is the obvious first
  recipient — his 7 decks are already in the training set).
- Clean split forces the architecture to separate THE COMPANION (persona
  shell, ships with the app) from THE MEMORY (private data + hub) — which
  is exactly the seam the north-star Omnath-appliance roadmap needs anyway.

**Consequences:** a build-time flavor flag, not runtime config (no secret
Omnath toggle in a gifted APK); `12-phases.md` M5 owns the split.

---

### D13. The CREED applies everywhere (restated as a decision so it's citable)

**Decision:** No fabricated rule numbers — every CR citation traces to the
bundled `cr_current.json`. No card text from model memory — card text comes
from bundled Scryfall data. This binds every feature that touches rules or
cards, on every tier (Mac 70B, on-device small model, API).

**Why:** false authority is worse than no answer in a rules tool. This has
been the project's spine since the desktop build; the phone inherits it
without dilution — *especially* on the small on-device tier, where the
model is dumbest and the temptation to let it freestyle is highest.

**Consequences:** the offline agent path is retrieval-first by construction
(`11-agent-tiers.md §offline`): the small model narrates retrieved text; it
never answers rules questions from its own weights.

---

## Part B — PLAYBOOK-tier decisions (Fable 5, expanding the spec)

These were made while writing this playbook because the spec implied but did
not state them. Opus may re-open any with a written, dated reason appended
here — but read the WHY first.

### D-P1. The six bottom tabs are: Decks · Agents · Pod · Vault · Rules · Life

**Why:** the spec's M1 phase names exactly these six. Six is the ceiling for
a bottom bar (one-hand reach, no "More" spillover). The sync chip and
settings live in the top app bar, not tabs. Detail: `10-ui-ia.md`.

### D-P2. Life tracker builds in M1, polishes in M4

**Why:** the spec's M1 exit gate ("cold boot → deck view + rules + pod +
life tracker, airplane mode ON") requires a working tracker at M1. M4's
"life-tracker polish" then means ergonomics/Planechase-art/seating polish,
not first build. Core counters M1; full suite completeness verified at the
M4 gate.

### D-P3. Weaviate is the semantic index; canonical structured data is JSON + journal on the Mac's disk

**Why:** the spec says the Mac "holds the one source-of-truth data, runs
Weaviate" and later "(Weaviate + the structured store)" — two components.
Making Weaviate the store-of-record for decks/chats would couple every sync
operation to a vector DB's API stability (⚠ volatile, fall 2026) and make
the journal/LWW model awkward. JSON files + journal is what the desktop
already speaks, diffable, backup-able, and CREED-auditable. Weaviate indexes
*projections* of it (and owns the embedding side: memory vault, semantic
search). If Weaviate dies, no user data is lost — reindex from canonical.
Detail: `02-data-and-sync.md §planes`.

### D-P4. Background jobs (grail scan, news digest) run on the Mac hub; the phone displays results

**Why:** the Mac is always-on; Android background execution is
battery-hostile and API-volatile (⚠). Jobs write results into the synced
store + fire a notification; the phone renders them. Fallback when the Mac
is down: the phone shows the last-synced brief with its date — stale but
honest. An opportunistic phone-side fetch is a M4 option, not a commitment.
Detail: `07-feat-vault.md §jobs`.

### D-P5. Deletes are tombstones during the sync window

**Why:** LWW without tombstones resurrects deleted records (the classic
bug: delete on phone, old copy on desktop "wins" back). Tombstones carry the
delete through reconciliation; compaction reaps them after both clients
checkpoint past the op. Detail: `02-data-and-sync.md §deletes`.

### D-P6. The hub sync service is a small custom service, not an off-the-shelf sync framework

**Why:** the protocol is tiny (2 replicas, 1 hub, LWW + journal, JSON
records) and the failure modes must be fully understood by the person
debugging them at 1am (Opus/Cindy). Off-the-shelf multi-client sync
frameworks (⚠ volatile landscape) solve N-client problems this system
doesn't have and impose schemas it doesn't want. The service is a few
hundred lines against the StorageAdapter. Detail: `02-data-and-sync.md
§protocol`.

### D-P7. Judge quiz is OUT of v1 (deferred)

**Why:** Colton's explicit call, 2026-07-04 (bubble answer while
commissioning this playbook). Matches the Academy cut and the spec's
silence. Pure-JS quiz over the bundled RulesGuru corpus remains a cheap
post-M5 add; nothing in the architecture forecloses it. **Revisit after M5.**

### D-P8. Sim Center / Academy / self-play stay desktop-only

**Why:** carried over from the field-profile trim (phone-port-plan) and
untouched by the new spec's feature list. The phone consumes game *records*
(via sync) but never runs the simulator. Cut routes never render behind the
capability-profile gate (`01-architecture.md §profiles`).

### D-P9. Capability profiles are a build/runtime gate named `field` (phone) and `full` (desktop)

**Why:** cut features (sim, install-ollama, sync-data desktop machinery,
support-bundle) must never render on the phone — not hidden, *absent*. One
profile flag, checked at the service-registry and navigation level, keeps
the two surfaces from drifting into if-else soup. Detail:
`01-architecture.md §profiles`.

### D-P10. The phone bundles the FULL JSON data tier by default (~0.5GB), art tiered

**Why:** Colton's 2026-07-04 call from the trim table ("128GB device, no
slim ceiling") — a slim bootstrap (~25MB) exists only to bridge the first
30 seconds; the full tier auto-pulls on wifi. Art: watchlist/collection
pack first, full (~5–6GB) optional. Detail: `02-data-and-sync.md
§footprint`.

---

## Part C — DEFERRED (explicitly not decided; do not silently decide)

| # | Item | Parked where | Trigger to decide |
|---|---|---|---|
| C1 | Play Store internal track vs stay-sideload | `12-phases.md` M5 | If a giftable build actually ships to someone |
| C2 | Desktop sidecar-kill (converge desktop onto the client-side core) | Old plan's M5; out of playbook scope | After the phone core is proven in the field |
| C3 | Exact Mac Studio config (M5 Ultra/Max vs discounted M3 Ultra; 96 vs 128+ GB) | `project_server_box_decision.md` | The M5 refresh landing (~fall 2026) |
| C4 | On-device small-model choice + runtime | `13-risk-and-verify.md §V4–V5` | M3 start |
| C5 | Scanner implementation approach | `09-feat-card-scanner.md` | Its build phase opens |
| C6 | CRDT / per-field merge upgrade | D5 escape hatch | Conflicts stop being rare, or clients > 2 |
| C7 | Judge quiz revisit | D-P7 | Post-M5 |

---

*Cross-refs: `00-INDEX.md` (read order) · `13-risk-and-verify.md` (the ⚠
register these decisions point into) · `QUESTIONS-FOR-COLTON.md` (live
side-file for new questions).*
