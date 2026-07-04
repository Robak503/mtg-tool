# 🌅 WAKE REPORT — 2026-07-04 (VAULT overhaul wave-V core + wave Q — v0.89.0)

> **v0.89.0 (Colton fired orders/vault-overhaul.md + UPGRADE-BACKLOG wave Q, Fable 5 finale
> session):** the Vault got the kiosk IA — **VaultHome** front door with four LIVE door-panes
> (The Stacks / The Ledger / The Atlas / The Forge) + the Pulse strip; the 5-tab strip and
> mode state are DEAD (CollectionView takes a `surface` prop; per-surface toolbars; Finance+
> Stats merged into the scrolling Ledger; all four Vault*Views on LEYLINE glass) · **V2**
> Ledger value area-chart (ranges + crosshair) · **V4** Atlas completion bars + % +
> cost-to-complete · **V9** `GET /api/collection/combos` + The Forge combo shelf (owned
> combos + one-card-away, priced) · **wave Q**: Q1 useEscapeClose across 10 overlays ·
> Q2 powerRank on DeckView/DeckMenu + `serializeDeckMemory` "Machine Power Rating" line
> (agents see it; +3 pins) · Q5 session filter · Q6 pod salt (saltSum/saltTop additive).
> **Suite 7,684 + lint 0 (bare exit codes) · FENCE PROVEN: tier fp byte-identical 0-diff +
> trajectory hash == a2a03ba8 ×2 (games=3 rows=8281, AppData root).** Preview-walked:
> landing → all four doors → back; Escape closes Add-card live.

## ⚠️ PARKED (this pass)
1. **Vault tail (all spec'd in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) wave V):** V5
   printings-index schema pass (artist/reserved/flavor — GATES V6 autofill + V7) · **V6
   Trophy Case (impact 5 — the collector headline; give it its own focused session)** ·
   V7 Gallery/artists · V8 binder mode · V10 cost basis · V11 universal shopping list ·
   V12 finish analytics.
2. **Wave Q tail:** Q3 post-import "deck ready" moment · Q4 alias sweep + the
   MTGAssistant:732 hand-hex fix · Q7 seatSummary tables in Sim Center · Q8 per-message
   chat actions · Q9 pod⇄sim round trip · Q1-stretch (Escape walks up the IA, Ctrl+1/2/3).
3. **Carried from earlier passes:** tray-click eyeball on first launch · mobile IA pass
   (Colton: ever under 660px?) · cross-profile rating persistence (Colton call, by-design
   today) · dev-tree art-crop 404s (cosmetic, installed exe has the cache) · legacy alias
   block in globals.css (Q4 covers it).

## 🔁 How the next session resumes
Method index + post-Fable model policy: [MASTER-GUIDE.md](MASTER-GUIDE.md). Forward queue:
[UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) — next best: **V6 Trophy Case** (after V5) or wave
Q tail or P1/P2 records. The grind resumes per memory/orders/clyde-grind-relaunch.md when no
feature wave holds the lock. UI law: ui-overhaul-log.md §0. Engine anchors: suite 7,684 ·
tier fp 0-diff vs main · trajectory a2a03ba8 (rows 8281).

---

# (previous report below — v0.88.0 wave 2)

# 🌅 WAKE REPORT — 2026-07-04 (LEYLINE wave 2 — v0.88.0: kiosk IA + Proving Grounds + power-rank fixes)

> **v0.88.0 (Colton-ordered wave 2, same session as v0.87.0):** the kiosk LANDING screen
> (3 registry-driven area doors + bottom AreaBar; `docs/HOW-TO-ADD-AN-AREA.md` = the no-AI
> extension guide) · **The Agents** (3 pixel-art squares → chat; Decks ▾ header menu; desktop
> nav sidebar retired) · **The Proving Grounds** umbrella (Academy · Sim Center · **Pod Balance
> as a surface**: all-profile decks, compare ≤4, Rate + auto-rate-on-import →
> `memory.powerRank`) · **power-rank X fix** (X floors at 1 in curve/ramp/cantrip/combo paths;
> + assumedX name-only, MDFC front-face X, interaction-axis 14+→3, `Commander:` headers) ·
> originGuard dynamic loopback same-origin. Battery **7,681** + lint 0; fence: hash
> `a2a03ba8` + tier 0-diff AGAIN. Parked from wave 2: mobile IA pass (sidebar survives
> mobile-only) · cross-profile rating persistence (session-only for other profiles) ·
> powerRank not yet in agent prompt serialization · speed-axis `||` ordering (debatable,
> documented in ui-overhaul-log W3).

# (wave 1 report below) — 2026-07-03 (LEYLINE UI/UX OVERHAUL pass — v0.87.0)

> **v0.87.0 = the LEYLINE UI overhaul** (the third Fable 5 pass, one-owner lock, UI-ONLY —
> the engine is fence-proven untouched). The whole app moved from Aether cyan to **LEYLINE**:
> green energy through dark glass — true-black surfaces, phosphor-green glow-as-hierarchy,
> glass panels, ONE button system. Suite **7,661** green · lint clean · engine anchors hold
> (tier fp 0-diff, trajectory hash == `a2a03ba8…` ×2). THE two docs to read:
> [ui-overhaul-log.md](ui-overhaul-log.md) (wave-by-wave + numbers) + the before/after gallery
> in [ui-overhaul/](ui-overhaul/) (INVENTORY.md + baseline/ + after/).

## What shipped (v0.87.0)
- **The LEYLINE design system:** `--ley-*` tokens in `globals.css` (surface ramp, green ramp,
  glass recipe, glow discipline, motion scale) + THE BUTTON SYSTEM (`.btn` ×
  primary/secondary/ghost/danger × sm/default/lg + icon/loading/disabled/focus states). Hidden
  `/styleguide` route = the living reference. Display font: Space Grotesk (Playfair retired).
- **Kiosk shell:** nav shows where you are (green actives — previously nothing highlighted),
  bigger targets, tracked-caps mono labels, versioned window title ("MTG Tool v0.87.0"),
  phosphor loading screen.
- **Every surface converted** (6 file-disjoint lanes, worktree-per-builder, each battery-gated):
  chat + sessions + Garfield · Academy board + all 14 decision side-sheets · Sim Center · the
  Vault (5 modes + 8 modals) · deck views/import/lock modals · updates/settings/onboarding/
  profiles/feedback. ~214 button sites → `.btn`; 219 off-token colors → 0 (identity/data uses
  excepted); empty states all lead somewhere.
- **Agent identity sharpened:** system chrome always green; agent colors only on identity
  elements. **Jace = arcane blue #6ab8ff now** (cyan was Aether's accent, not his identity).
- **Acceptance:** real .exe built (0.87.0) — title/single-instance/Job-Object teardown proven
  at the process level; packaged UI walked against the exe's own server with real AppData.

## ⚠️ PARKED (carry forward)
1. All v0.86.0 parked items unchanged (see the previous WAKE-REPORT section in git history /
   play-harness log §parked: decision.seat MINOR · AI free-spell holds · paid-alt for 6
   non-interaction carriers · offered-X-subset quality · SD-8 façade split · HB-9/HB-11 ·
   ENG-FLAG-2 · detectArchetype memo · land-tier metric call · fail-closed Spellbook guard ·
   U-F4 color-tag stopgap · prof_65a43f93 re-registration · grind resumes per
   memory/orders/clyde-grind-relaunch.md).
2. From this pass (UI):
   - **Tray-icon interactive walk**: tray/close code untouched (only a `set_title` in setup)
     and the shell launches/quits clean, but the literal tray-click walk wasn't exercised
     (computer-use denied this session) — 30-second eyeball on first launch.
   - **Escape-to-close on modals**: kiosk-worthy, small behavior addition — deliberately out
     of this restyle-only pass.
   - **Card-art 404s in dev tree**: `/api/art-crop` misses for uncached cards in dev (pre-
     existing; installed exe has the cache). Cosmetic in dev only.
   - **Dev-tree walk residue**: a test deck "Omnath Baseline" + one saved Academy game live in
     the dev tree's Player 1 profile (created during baseline screenshots) — harmless; delete
     from the sidebar if it annoys.
   - Legacy Aether token ALIASES still map old names → LEYLINE values in globals.css
     (components reference both vocabularies); a rename-sweep to pure `--ley-*` is cosmetic
     debt, zero user impact.

## 🔁 How the next session resumes
Engine work: read PLAY-HARNESS-OVERHAUL-PLAYBOOK §5 + OVERHAUL-PLAYBOOK §5 never-lists; the
grind resumes per memory/orders/clyde-grind-relaunch.md (unchanged by this pass). UI work:
compose from `/styleguide` + `--ley-*` tokens — never hand-hex, one primary per surface, glow
= hierarchy. The button system is law: no new one-off button styles.
Method index + post-Fable model policy: [MASTER-GUIDE.md](MASTER-GUIDE.md). Forward feature queue:
[UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) — flagship ready to fire: `memory/orders/vault-overhaul.md`
(the Vault kiosk overhaul).
