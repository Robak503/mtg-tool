# 06 — FEATURE: LIFE TRACKER

> **OMNATH IN POCKET · execution playbook · doc 06 of 17**
> NET-NEW feature (recon confirmed: no life-tracker code exists today —
> board state lives in the sim). 2–6 players, the trimmed counter suite
> (life · commander damage · poison — D9 as superseded 2026-07-04) +
> full Planechase companion, fully offline (D9). Builds core in M1,
> polishes in M4 (D-P2).

---

## 1. Behavior

### 1.1 Game setup
- Player count 2–6. Per player: name (free text or pick a pod
  **profile**), segment color, optional deck/commander link (own deck or
  profile deck — enables commander-damage labels + record quality).
- Starting life: 40 default (Commander), editable preset (20 for the
  1v1 crowd), per-game override.
- Seating layout auto-suggested from count (§4), adjustable by drag.
- "Rematch" shortcut: re-run last game's setup.

### 1.2 The counter suite (D9 as TRIMMED — Colton 2026-07-04: "no side things")

| Counter | Scope | Behavior |
|---|---|---|
| **Life** | per player | primary tap targets (+1/−1), long-press/slide for fast delta; big numerals |
| **Commander damage** | per player, **per opposing commander** (partners = 2 tracks per opponent) | grid on the player's detail sheet; incrementing commander damage auto-decrements life by the same amount (single-gesture bookkeeping — this is the fiddly bit every paper table gets wrong); hitting **21 from one commander** flags that player eliminated |
| **Poison** | per player | counter; **10 = eliminated** flag |
| **Elimination** | per player | manual toggle + auto-flag from 21-cmdr / poison-10 / life≤0 — always **overridable** (the tracker suggests, the table rules; Arbiter/CR edge cases like lifelink-below-zero replacements are not the tracker's job to enforce) |

> **Trimmed by owner (D9 supersession, 2026-07-04):** energy,
> experience, monarch, and day/night are OUT — "we don't need to track
> side things." Each is a cheap single-counter/single-flag pattern;
> re-adding any is an hours-level task if a real game ever wants it.
> Do not build them speculatively.

**CREED note:** elimination thresholds (21 commander damage, 10 poison,
0 life) are game-rules facts surfaced as UI behavior. Any in-app rules
*text* about them (help sheet, "why is this player flagged?") must be
retrieved from the bundled CR via the rules service — **never hardcode a
guessed CR number in UI copy.** Verify the exact citations from
`cr_current.json` at build.

### 1.3 Planechase companion (D9 — full support: "anything else to play that game style")
- **One-tap screen swap** between the counters view and the full-screen
  plane view (Colton's explicit ask: "a screen swap that's simple to
  the Planechase cards"). Both directions instant; game state never
  pauses.
- **Plane display:** current plane card rendered full-width (art +
  oracle text from bundled Scryfall data — planar cards must survive the
  data-tier builders, ⚠ V14). Tap → full card inspector.
- **Planar deck:** default = shuffle of all bundled planes; optional
  curated subset saved as a "planar deck" record. Walk → next plane;
  history strip of the game's planes.
- **Planar die:** on-screen roll — planeswalk face, chaos face, blanks
  (correct face distribution per the official die). Roll log per turn.
  The tracker **displays and randomizes; it does not enforce** roll
  costs or trigger resolution — it's a companion, not a judge. Any
  displayed rules text for planar mechanics: retrieved from bundled CR
  (CREED, as above).
- Chaos roll → visual pulse on the plane's chaos ability text.

### 1.4 In-game ergonomics (the reason this feature wins tables)
- **Big tap targets**: the whole upper/lower half of a player segment is
  the +/− zone; no hunting for tiny buttons mid-game.
- **Undo**: every change appends to the session log; undo walks it back.
  Accidental-tap forgiveness is non-negotiable.
- **Screen wake-lock ON** during an active session (⚠ V15: Tauri-Android
  wake-lock API; fallback: instruct-user + longest-timeout). True-black
  LEYLINE render = OLED battery mercy.
- **Table mode** (landscape/round): each player's segment rotated to
  face them; the Planechase strip (when active) visible from all seats.
- One-hand solo mode (portrait): Colton tracking just his own board
  corner at a paper table.

### 1.5 Session lifecycle (crash-safety contract)
- **Every mutation persists locally immediately** (device-local live
  session — `02 §2.1`; append-only session log + snapshot). The app
  being killed, the battery dying, the OS reaping the webview — none of
  these may lose more than the in-flight tap.
- Relaunch with an active session → **resume banner** straight back
  into the game.
- **Finish flow:** declare winner (or draw/abandon) → session finalizes
  → **promotes to a Game record** (players, decks, result, eliminations,
  duration, plane history) in the synced store → offers the pod **rate**
  handoff (`05 §1`).

## 2. States

| State | Rendering |
|---|---|
| **Empty** | "New game" setup + rematch shortcut + resume banner if a live session exists |
| **Loading** | None in steady state (local instant); plane art may lazy-load with placeholder frame |
| **Error** | Persistence write failure = visible banner ("storage failing — changes may not survive") — loud, because the crash-safety contract is the feature |
| **Offline** | **Identical. Flagship offline feature.** Plane art falls back to text-only card if the art tier isn't cached |

## 3. Edge cases

- **Partner/background commanders**: two commander-damage tracks per
  opponent; label by commander name when deck-linked, else "Cmdr A/B."
- **Commander changes mid-game** (rare, real): add-a-commander-track
  action on the damage grid.
- **Negative life**: display supported (life can go below zero and
  matter); elimination flag stays overridable.
- **6-player segments on a phone screen**: detail counters collapse
  behind per-player sheets; life stays glanceable for all 6 (§4).
- **Mid-game player drop** (someone leaves): eliminate + optional
  "remove from layout" to reclaim space.
- **Two trackers, one table** (someone else also tracking): no
  multi-device session sync — out of scope, logged as future idea. One
  phone is the table's tracker.
- **Session older than N days unfinished**: resume banner offers
  finalize-as-abandoned so stale sessions don't haunt.

## 4. Layouts (wireframe intent — final in `10-ui-ia.md §life`)

- **2P portrait**: split top/bottom, top segment rotated 180°.
- **3–4P**: quadrant grid, each rotated outward (table mode) or all
  upright (solo-view mode) — toggle.
- **5–6P**: 2×3 grid, compressed counters, sheets for detail.
- Global strip (plane · planar die — Planechase games only) center or
  edge-docked, visible in all layouts; hidden entirely in plain games.

## 5. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Live session | device-local store | ✅ |
| Profiles/decks (linking) | replica | ✅ |
| Plane cards (text) | bundled oracle tier (⚠ V14 they must be included) | ✅ |
| Plane art | art cache tier | ✅ cached / text fallback |
| Game record promotion | replica (syncs at M2+) | ✅ (queues) |

## 6. Box-dependency

**STANDALONE — entirely.** Record sync to desktop is generic M2 plumbing,
not a feature dependency.

## 7. Acceptance criteria (live, observable)

1. **Real-game gate (M1 feed, M4 full):** track a real 4-player
   Commander game start→finish, airplane mode: life swings, commander
   damage from a partner pair (auto-life-decrement verified), poison,
   one player eliminated at 21 cmdr → flag fires; winner declared →
   Game record exists with correct data.
2. **Kill-resume drill:** force-kill the app mid-game → relaunch →
   resume banner → exact state (all counters + log + current plane).
3. **Planechase gate (M4, spec-mandated):** full Planechase game at a
   real table — plane display readable by the pod, walks + chaos rolls
   logged, art renders from cache.
4. **Undo drill:** 5 rapid accidental taps → 5 undos → state matches
   pre-mistake exactly (log-verified).
5. **Battery/table endurance (M4 dogfood):** a 2–3h game night on one
   session — wake-lock held, battery drain measured and acceptable
   (define threshold at dogfood; true-black + no radios should make
   this comfortable), no thermal complaint.
6. **Glance test:** all players read their own life from their seat
   without touching the phone (real-table check).

---

*Cross-refs: `05-feat-pod.md §1` (rate handoff) · `02-data-and-sync.md
§2.1` (live-session locality) · `10-ui-ia.md §life` (layout detail) ·
`13-risk-and-verify.md` V14/V15 · `15-test-strategy.md` (game-night
dogfood).*
