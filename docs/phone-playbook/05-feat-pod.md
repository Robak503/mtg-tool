# 05 — FEATURE: POD BALANCER

> **OMNATH IN POCKET · execution playbook · doc 05 of 17**
> The table-side power-balance tool — pure JS, fully offline, the
> easiest big win of the port. Existing seams: `/api/pod-balance`
> (+`/rate`), `PodBalanceView.jsx`, `lib/server/powerRanker.js`,
> `lib/server/edhrecSalt.js`, profiles store.

---

## 1. Behavior

- Select 1–4 decks for the pod: from own library, from pod-player
  **profiles** (each profile carries its decks — existing model), or
  paste a list ad-hoc.
- Output per deck (existing engine, ported as SVC): bracket (1–5, RC
  Bracket model), power level, CRISPI axes, game-changers list, salt
  read (edhrecSalt over bundled salt data).
- Pod verdict: balance assessment across the selected decks (existing
  route logic — supports legacy decks-shipped mode + W2
  profile-loaded mode; port both).
- **Rate** flow (`pod-balance/rate`): post-game quick rating feeding
  records — pairs naturally with the life tracker's end-of-game flow
  (`06 §1.6`): finish game → rate the pod → both land in records.
- At-the-table ergonomics: results readable across a table — big
  bracket numerals, color-coded verdict (`10-ui-ia.md §pod`).

## 2. States

| State | Rendering |
|---|---|
| **Empty** | Picker with own decks + profiles; hint to add profiles for regular pod-mates |
| **Loading** | Rank computation is local + fast; brief inline shimmer acceptable on first run while salt/oracle indexes lazy-load |
| **Error** | Unresolvable pasted list → per-line staged review (same as deck import). Engine error → visible message, never a blank verdict |
| **Offline** | **Identical to online.** Zero degradation — this feature is the airplane-mode showcase |

## 3. Edge cases

- Deck with unresolved cards (`03 §3`): rank computes over resolved
  cards; verdict flags "N cards unresolved — power may read low."
  Honest, not silent.
- 1-deck mode (self-check at a booth: "what bracket is this?") — works,
  desktop parity.
- Duplicate deck across two profiles: allowed; verdict labels by
  profile name.
- Profiles edited on desktop while phone offline: normal replica sync;
  conflicts near-zero (low churn), standard prompt if forked.

## 4. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| powerRanker + CRISPI | bundled oracle + engine data (SVC) | ✅ |
| Salt read | bundled `edhrec-salt` data | ✅ |
| Decks/profiles | replica | ✅ |
| Game-changers list | bundled data (verify which file at M0) | ✅ |

## 5. Box-dependency

**STANDALONE — entirely.** No Mac, no net, in any path. (Sync of
profiles/records is the generic M2 layer, not a feature dependency.)

## 6. Acceptance criteria (live, observable)

1. **Airplane-mode pod balance** (M1 exit-gate feed): airplane mode ON →
   pick 3 profile decks + 1 own deck → brackets, power levels, CRISPI,
   salt, verdict all render. Values spot-match the desktop app for the
   same decks (same engine, same data → same numbers; a mismatch means
   the port broke something — investigate, don't shrug).
2. **Booth self-check:** paste a raw list → bracket verdict without
   touching the deck library (no forced save).
3. **Table glance test:** verdict screen readable at arm's-length-plus
   across a table by a non-user (real human check at a real table —
   dogfood item, `15 §dogfood`).
4. **Rate round-trip:** after a tracked game, rate the pod → record
   visible in Records on desktop after sync.

---

*Cross-refs: `06-feat-life-tracker.md §1.6` (end-of-game handoff) ·
`10-ui-ia.md §pod` · `12-phases.md §M0/M1`.*
