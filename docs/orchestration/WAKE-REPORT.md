# 🌅 WAKE REPORT — 2026-07-03 (LEYLINE UI/UX OVERHAUL pass — v0.87.0)

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
