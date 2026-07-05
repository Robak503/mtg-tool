# 07 — FEATURE: VAULT

> **OMNATH IN POCKET · execution playbook · doc 07 of 17**
> Collection + grails + ledger, fully functioning on the phone (D10),
> plus the Mac-side background jobs (grail scan, news digest) and
> notifications (D-P4). The desktop kiosk Vault (v0.89.0: VaultHome,
> Binder, Gallery, SetBrowser, Stats, Finance, ValueChart + 18
> collection subroutes, watchlist, price-alerts) is the shipped surface
> this feature ADAPTS — not a rebuild.

---

## 1. Behavior

### 1.1 Collection (browse/search/edit)
- Search + filter the collection (name, set, artist, color, tags, owned
  printings) over the replica — full offline.
- Card detail: printing info, art, owned qty/condition, price
  (last-synced snapshot + its date — price is always a dated fact, never
  presented as live), color tags, which decks use it
  (`collection/deck-overlap` logic as SVC).
- Add/edit entries on phone (booth acquisitions — a primary field flow):
  qty, printing, condition, tags. CSV import stays desktop-comfortable
  but the service ports (paste-level import works).
- Views: the kiosk panes adapt to phone as sub-screens — Binder
  (grid/gallery), Sets, Stats, Finance (read) — one-hand IA in
  `10-ui-ia.md §vault`.

### 1.2 Grail watchlist
- Full CRUD on phone: card + preferred printing/finish + max price +
  notes (signability notes per the collector discipline).
- Grail detail shows match history (from the Mac scan job) + price
  history snapshot.
- **Con-floor flow (the reason this exists):** vendor booth → search
  watchlist → see target printing + max price + last match info in
  two taps, offline.

### 1.3 Showpiece / signed ledger
- The provenance ledger (signed pieces, artist, event, date, notes) —
  read + annotate + add on phone.
- Personal build: signed-deck-project layer — progress toward the
  signed Omnath deck, artist-signing watch surfaces
  (`project_grail_hunt_tracker`, `project_omnath_forest_signature_project`
  — load these memory files when building the personal layer).

### 1.4 Background jobs — run on the MAC (D-P4)
| Job | Cadence | Logic source | Output (synced record) |
|---|---|---|---|
| **Grail-match scan** | daily | port `omnath-tools` grail-tracker patterns + price sources already in `lib/server/` (scryfallPriceFetch, cardKingdomPrices) | match records (card, source, price, URL, matchedAt) |
| **News digest** | daily | port `daily-codex.cjs` + `meta-weather.cjs` patterns; sources: WotC · MTGGoldfish · EDHREC · edhtop16 · Commander's Herald **[SATIRE — entertainment only, never cited as news; tag it in the UI]** | one dated brief document |
| **Price refresh** | daily/weekly | existing `collection/refresh-prices` machinery relocated hubside | price snapshot + alert hits |

- Jobs write outputs into the canonical store → sync down → phone
  renders. Job health visible in a small "hub status" line in Vault
  (last run per job + ok/fail).
- **No Mac (standalone era):** Vault shows last-synced outputs with
  their dates — stale but honest; no spinners, no fake freshness
  (`01 §7.2`). Opportunistic phone-side fetch = M4 option, not
  commitment (⚠ V3 Android background limits).

### 1.5 Notifications (D10)
- **Grail match** → push notification ("Grail match: <card> @ <price>,
  <source>"). **Daily brief** → quiet notification.
- Delivery inside a closed Tailscale system (no public push service,
  no FCM dependency by default) is **⚠ VERIFY AT BUILD (V9)** — candidate
  mechanisms at build time: Tauri notification plugin + foreground sync
  pickup, a self-hosted push relay (ntfy-class) over the tailnet, or
  FCM as an explicit *opt-in* compromise if nothing else is livable.
  **Fallback (always ships):** in-app badge + "new since last visit"
  inbox in Vault — notifications are an upgrade, never the only path.
- Notification taps deep-link to the match / the brief.

### 1.6 Daily brief reading surface
- One screen: today's digest (news sections + meta weather + the
  left-field on-this-day bit — keep it, Colton likes it:
  `feedback_codex_leftfield_facts`). Satire content visibly tagged.
  History browsable by date. Cached = readable offline.

## 2. States

| State | Rendering |
|---|---|
| **Empty** | Collection empty: import CTA (desktop suggestion + paste import). Watchlist empty: "add your first grail." Ledger empty: personal-build seed vs blank |
| **Loading** | Replica reads are instant; art lazy-loads with frame placeholders; heavy stats (deck-overlap, big aggregations) compute with inline shimmer |
| **Error** | Job failures surface in hub-status line (per job, with age); price snapshot older than N days gets an age badge; write failures = visible toast + retained UI state |
| **Offline** | Browse/search/annotate/add: full. Prices/matches/brief: last-synced + date badges. Art: cached tiers, text fallback. Job status: "last seen <time>" |

## 3. Edge cases

- **Price data is a snapshot**: every price shows its as-of date on the
  phone (space-permitting: relative — "3d"). Never imply live pricing
  offline.
- **Booth add of a printing not in the bundled printing index**: same
  unresolved-card pattern as decks (`03 §3`) — store by name + set hint,
  resolve on next data update. Never block an acquisition entry.
- **Watchlist match against a stale snapshot**: match records carry
  their scan date; a match seen at a booth 4 days later might be gone —
  the UI copy says "matched <date>", not "available."
- **Duplicate collection entries** (same printing added twice at a
  booth in haste): merge affordance in detail view.
- **Digest source down/moved** (news sites churn): job degrades
  per-source (partial brief with a "source unavailable" line), never
  all-or-nothing. Source list is config, not code.
- **Satire guard**: Commander's Herald content is entertainment—tagged
  at ingestion AND at render; it must never appear under a news-styled
  header without the tag (this is a standing content-integrity rule,
  same spirit as CREED).
- **Personal-vs-giftable**: signed-deck-project surfaces + Omnath hooks
  are personal-flavor only (D12); giftable Vault is the general
  collection/grail/ledger feature set.

## 4. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Collection/watchlist/ledger records | replica | ✅ |
| Printing/art data | bundled tiers + art cache | ✅ cached |
| Prices | synced snapshot (Mac job) | ✅ stale-honest |
| Grail matches / brief | synced job outputs | ✅ stale-honest |
| Job execution | Mac hub | ⛔ BOX |
| Push delivery | ⚠ V9 mechanism | ⛔ (in-app badge fallback ✅) |

## 5. Box-dependency

**STANDALONE:** browse, search, add/edit, annotate, cached prices/brief,
in-app badges. **BOX:** job execution (scan/digest/prices), push
notifications, fresh anything. The Vault is fully *usable* without the
Mac and fully *alive* with it.

## 6. Acceptance criteria (live, observable)

1. **Con-floor drill (M1 feed / M5 gate):** airplane mode → search
   watchlist → grail card + max price + printing readable in ≤2 taps
   from cold open.
2. **Booth add:** airplane mode → add an acquired card to collection
   (qty, printing, condition) + mark the grail acquired → survives
   relaunch → syncs to desktop on reconnect.
3. **Grail match fires (M4 exit gate, spec-mandated):** seed a
   watchlist entry the scan will match → Mac job runs → phone gets the
   notification (or badge-fallback if V9 landed there) → tap →
   match detail.
4. **Daily brief lands (M4 exit gate, spec-mandated):** morning brief
   notification/badge → brief renders with sources + tagged satire →
   readable again offline later.
5. **Stale honesty:** Mac off for 3 days → every price/match/brief
   surface shows honest date badges; zero spinners; hub-status says
   last-seen.
6. **Personal layer (M5):** personal build shows signed-project
   progress; giftable build shows none of it (build inspection + UI
   sweep).

---

*Cross-refs: `02-data-and-sync.md §2` (job outputs as records) ·
`01-architecture.md §7.3` (art serving) · `10-ui-ia.md §vault` ·
`12-phases.md §M4` · `13-risk-and-verify.md` V3/V9.*
