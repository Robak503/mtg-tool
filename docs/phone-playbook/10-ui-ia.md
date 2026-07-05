# 10 — UI / IA

> **OMNATH IN POCKET · execution playbook · doc 10 of 17**
> The field IA: six bottom tabs, per-screen layout INTENT (wireframe
> level — Opus + the live LEYLINE system own pixels), one-hand and
> at-the-table ergonomics, offline indicators, component inventory.
> Theme source of truth: `app/src/app/globals.css` (LEYLINE tokens —
> re-read at build; don't trust hexes quoted anywhere else, including
> here).

---

## 1. Design posture

- **LEYLINE, dark-only.** True-black surfaces + phosphor-green accent
  (ley-green family), gold/red/blue status colors, Space Grotesk /
  Inter / JetBrains Mono type stack — the shipped v0.87.0 system.
  Dark-only on phone: OLED battery (true black = pixels off), brand
  coherence, and one theme to maintain. (Re-openable if daylight
  legibility dogfood fails — log it if so.)
- **Field density, not kiosk density.** The desktop is a kiosk; the
  phone is a glanceable tool held in one hand at a table. Fewer
  simultaneous panes, bigger type, bigger targets.
- **Glass sparingly.** The desktop's glass-blur panels are expensive in
  a mobile webview — ⚠ verify blur perf on the Pixel at M1; the
  fallback is flat translucent surfaces (same tokens, no backdrop
  blur). Never let the theme cost frames during a life-tracker tap.
- **Touch targets ≥ 48dp** everywhere; primary in-game targets much
  bigger (`06 §1.4`).

## 2. The shell

```
┌─────────────────────────────────────┐
│ ◈ context title          [sync ✓]  │  ← top app bar: screen context,
│                                     │     sync chip (always), overflow →
│                                     │     settings/hub status
│                                     │
│           SCREEN CONTENT            │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  Decks  Agents  Pod  Vault  Rules  Life │  ← bottom tabs (D-P1), fixed
└─────────────────────────────────────┘
```

- **Sync chip** (contract in `02 §9`): persistent in the top bar on
  every screen. Tap → sync sheet (status, pending, conflicts, force).
  Standalone era: neutral `local` chip.
- **Offline indicators — the system:** the chip is the *global* signal;
  *feature-level* honesty is inline (disabled URL-import button with
  hint, date badges on prices/briefs, tier badges on agent replies,
  "needs the Mac" cards). No blanket "you are offline" banner burning
  screen height all day — offline is a normal mode, not an alarm
  (`01 §7`).
- **Tab state persists** per tab (each tab keeps its own nav stack;
  switching tabs never loses a half-edited deck or a running game).
- Life tab shows a subtle live-dot when a session is active.

## 3. Per-tab IA + layout intent

### 3.1 Decks
```
Decks (library)               Deck view                    Edit overlay
┌──────────────┐   ┌──────────────────────┐   search-add field (kbd-safe,
│ [search]     │   │ commander art banner │   bottom-sheet above keyboard)
│ ▤ deck card  │ → │ counts bar (targets) │ → result rows: name·cost·[+]
│ ▤ deck card  │   │ ▾ category           │   qty stepper · category pick
│   (cmdr art, │   │   card row  qty  ◦   │
│    colors,   │   │   card row  qty  ◦   │   row swipe-L = cut
│    count,    │   │ ▾ category…          │   row tap = inspector
│    sync ◦)   │   │ [notes pane]         │   row long-press = qty/move
│ (+) new/import│  │ (Ask Karn / Tibalt)  │
└──────────────┘   └──────────────────────┘
```
- Import flow: paste-first (offline-capable), URL second (`03 §1.4`).
- Agent handoff buttons live on the deck view (locks this deck —
  `03 §1.5`).

### 3.2 Agents
```
Agents home                        Chat
┌───────────────────┐   ┌────────────────────────┐
│ sessions list     │   │ locked-deck ribbon      │
│  (agent·deck·when)│ → │ bubbles + tier badges   │
│ ──────────────    │   │ [truncation/error inline]│
│ agent cards       │   │ composer (mic later)     │
│  Jace ◆ Karn ◆    │   └────────────────────────┘
│  Tibalt ◆ Omnath* │   *personal build only
│  (offline: Jace→  │   offline: Mac-tier cards
│   lookup mode)    │   disabled w/ honest label
└───────────────────┘
```
- Agent identity styling from the AGENTS object (color/icon/greeting) —
  single source (`04 §1.1`).

### 3.3 Pod
- Setup screen: slots (1–4) fed by own decks / profiles / paste; big
  "balance" action.
- Verdict screen: per-deck bracket numerals LARGE (across-the-table
  readable — `05 §6.3`), CRISPI axes compact, expandable detail.
  Post-game "rate" entry (`05 §1`).

### 3.4 Vault
```
Vault home = search-first + tiles     Grail watchlist (con mode)
┌────────────────────┐   ┌──────────────────────┐
│ [search collection]│   │ big rows: card·印·max$│
│ ◫ Binder  ◫ Grails │ → │ match badge + date    │
│ ◫ Ledger  ◫ Brief  │   │ (2 taps from cold —   │
│ ◫ Sets    ◫ Stats  │   │  the booth contract)  │
│ hub-status line    │   └──────────────────────┘
└────────────────────┘
```
- The kiosk panes (Binder/Gallery/Sets/Stats/Finance) become tiles →
  sub-screens; adapt, don't cram (`07 §1.1`).
- Brief screen: dated digest, satire-tagged sections (`07 §1.6`).

### 3.5 Rules
- Search-first screen; starter chips; results = rule cards (number +
  text + context expander); card-lookup toggle; CR-version footer
  (`08 §2/§3`). Inspector shared app-wide.

### 3.6 Life
- Layout intent in `06 §4` (2P split / 3–4P quadrants / 5–6P grid;
  table-mode rotation; global strip for monarch·day/night·plane·die).
- This tab owns: wake-lock, biggest targets in the app, undo
  prominence, plane art display.

## 4. One-hand + at-the-table ergonomics (rules, not suggestions)

1. **Thumb zone rule:** primary per-screen actions live in the bottom
   40% of the screen (FABs, composers, steppers). Top bar = status +
   rare actions only.
2. **Destructive actions** (delete deck, abandon game) sit OUTSIDE the
   thumb path — behind overflow or swipe+confirm, never adjacent to
   frequent taps.
3. **Reachability:** nothing essential in the top corners on tall
   screens; sheets slide from the bottom.
4. **Table mode** (life tracker): the phone lies flat — every player
   reads their own numbers (rotated segments), global state visible
   from all seats, no gesture that requires knowing "up."
5. **Glance hierarchy:** across a table, the answer (bracket numeral,
   life total, plane name) must be the biggest thing on the screen.
6. **Keyboard-safety:** search/composer inputs anchor above the
   keyboard (bottom-sheet pattern); no field hidden behind it.
7. **Fat-finger forgiveness:** undo everywhere state changes fast
   (life log, scan tray, deck edit session stack).

## 5. Component inventory

**Adapt from desktop (recon-grounded):**
| Desktop piece | Phone role |
|---|---|
| `MobileTabBar.jsx` (exists!) | seed for the bottom tab bar — audit + extend |
| `ChatPanel.jsx` | chat screen core (streaming, bubbles) |
| `CardInspector.jsx` | the shared inspector (oracle/rulings/printings) |
| `PodBalanceView.jsx` | pod setup/verdict, re-laid-out |
| Vault panes (`VaultBinder/Gallery/SetBrowser/Stats/Finance/ValueChart`) | tile sub-screens |
| `ImportDeckView.jsx`, `DeckView.jsx`, `DeckMenu.jsx` | decks tab cores |
| `RecordsView.jsx` / `MatchupLedger.jsx` | records surfaces (under Pod/Vault) |
| `ProfileMenu/ProfileManageModal` | pod profiles |
| `SettingsModal`, `UpdatesModal` | settings/downloads sheets |
| `AppHeader.jsx` | top-bar seed |

**Net-new:**
`SyncChip` + `SyncSheet` + `ConflictSheet` (+ per-domain merge views,
`02 §6`) · the **Life suite** (SessionSetup, PlayerSegment, CounterSheet,
GlobalStrip, PlaneDisplay, PlanarDie, SessionLog) · `TierBadge` ·
`HubStatusLine` · `DownloadsManager` (data tiers/art packs, `01 §8`) ·
`ScannerView` suite (future, `09`).

**Explicitly absent on `field` profile (D-P8/D-P9):** SimCenter,
SelfPlayPanel, Learn*, MulliganLab, JudgeTrialsView, OnboardingWizard
(desktop wizard — phone has its own first-run), install/sync desktop
machinery.

## 6. Motion + feedback

- LEYLINE motion tokens (fast ~100ms / snap ~160ms) carry over; nothing
  slower than 200ms on interaction feedback.
- Haptics on life-tracker taps + scan confirm (light impact) — ⚠ verify
  Tauri-Android haptics API at M1; skip silently if unavailable.
- Streaming text renders token-wise (perceived speed is the feature —
  `04 §1.4`).

## 7. Acceptance criteria (live, observable)

1. **One-hand audit (M1):** every primary flow (add card to deck, life
   tap, grail lookup, rules search, start chat) completable
   right-thumb-only on the Pixel 10, walking.
2. **Glance audit (M4 dogfood):** bracket verdict, life totals, plane
   name readable at arm's-length-plus by another person at a real
   table.
3. **Offline-indicator audit (M1/M5):** airplane-mode sweep of every
   screen — every degraded affordance shows its honest inline state;
   zero dead buttons that just don't work.
4. **Theme parity:** side-by-side with desktop — same blacks, same
   green, same type family; a stranger identifies them as the same
   product.
5. **Perf floor:** tab switches + life taps feel instant (no visible
   jank) on the Pixel 10 with the full data tier installed; blur
   fallback engaged if glass costs frames (⚠ §1).

---

*Cross-refs: per-feature behavior in 03–09 · sync chip contract
`02 §9` · ergonomic drills in `15-test-strategy.md §dogfood`.*
