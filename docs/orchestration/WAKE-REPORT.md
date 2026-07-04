# 🌅 WAKE REPORT — 2026-07-04 (backlog tail cont. — v0.96→v0.98: E5 + P4 + P8)

> After the questions (Colton: E5→owning-profile · AI-tuning→yes-with-evidence · releases→per-feature),
> shipped three more additive wins: **v0.96 E5** cross-profile rating persistence (POST
> /api/pod-balance/rate → writes into the owning profile; proven safe on both file shapes) · **v0.97 P4**
> matchup ledger (per-game sidecar rows + /api/self-play?action=matchups + a head-to-head heat table in
> Pod Balance) · **v0.98 P8** mulligan lab (seeded deal + engine-verdict compare in DeckView). Suite
> 7,703 + lint 0; **engine untouched** (zero lib/learn deltas; trajectory a2a03ba8 holds).
>
> **THE CLEAN-ADDITIVE TAIL IS NOW EXHAUSTED.** What remains needs FOCUSED FENCED PASSES, not
> marathon-tail grinding — each specced in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) STATUS with recon:
> - **E1 earthbend** (delayed dies/exile-return trigger; flips ~34 permanents incl. Toph native) —
>   recon: tractable via the selfReturn.js template + enterCardFromZone; STRICT ORDER (build the return
>   FIRST, THEN strip reminders in coverage.js:179 shaped-count, or the 34 flip to dropped-rider FPs —
>   see retired-fp-ledger.md CAP). Full battery + flip-diff GAINED=the 34 named + e2e (Toph returns tapped).
> - **E2/E3 AI tuning** (Colton GREENLIT with evidence) — re-anchors trajectory; need play-quality A/B
>   probe (play-quality-probe.mjs --legacy=KEY) + a v1 legacy arm. Omnath re-baselines self-play data once.
> - **P5 reality report** — promote analyzeGame (play-quality-probe.mjs:186) to a shared lib + a route
>   analyze-flag over a record:true batch; never-cast needs recordDecisions. **P3 debrief** — thread the
>   v1.1 act-opts bag through /api/learn/step+choose. **P7 spectate** needs the P2 replay viewer; **P9
>   puzzle** needs a live-session snapshot exporter. **E4** color-tags server-side (rewrite risk).
>   **K4/K5** data-at-sync. **K9** no flavor source. **D** archive move (cosmetic).

# (previous report below — the v0.89→v0.95 backlog push)

# 🌅 WAKE REPORT — 2026-07-04 (the backlog push: v0.89.0 → v0.95.0, 8 releases, Opus at the helm)

> **"Do all next best remaining" → "keep pushing through the entire backlog":** after the
> Vault/Trophy/Records/Gallery run (v0.89-0.91), Colton swapped Fable→Opus and ordered the
> whole backlog. Shipped **v0.92-0.95** on Opus (per MASTER-GUIDE §2 — the expected post-Fable
> seat): **Judge Trials + The Library + formatted chat + universal shopping list + finish
> analytics** (v0.92) · **local card inspector + command palette** (v0.93; fixed a real
> printings-API key bug that had silently broken the v0.90 artist-autofill) · **binder view +
> continue-strip** (v0.94) · **practice-this-deck + cost basis** (v0.95). Suite **7,703** +
> lint 0 throughout. **ENGINE PROVABLY UNTOUCHED across all 8 releases** — zero
> `app/src/lib/learn` deltas since v0.88.0; trajectory hash a2a03ba8 ×2 at close + tier fp
> 0-diff.
>
> **What's LEFT is the evidence-heavy tail** — every remaining item is either engine-behavior-
> changing (needs A/B probe evidence: E2/E3), a bounded engine fix that needs its own fenced
> pass (E1 earthbend), an additive engine/harness export (P3/P4/P5/P8), a real project
> (P7 replay/P9 puzzle), data-lands-at-sync (K4/K5/K9), a working stopgap (E4), or Colton's
> call (E5). **All specced with reasons in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) STATUS.**
> The rapid app-side backlog is DONE; the rest is deliberately left for focused passes.
>
> Dev-tree residue (gitignored, harmless): seeded cards + a synthetic printings-index in the
> Player-1 profile (used to walk Gallery/Trophy/Binder/cost-basis).

# (previous report below — v0.89-0.91 wave-V + Trophy + Gallery/Records)

# 🌅 WAKE REPORT — 2026-07-04 (v0.89.0 wave-V+Q · v0.90.0 Trophy Case · v0.91.0 tail: Gallery + Records + Prove-the-Pod)

> **v0.91.0 ("do all next best remaining", same finale session):** **V7 THE GALLERY** (5th
> Vault door — collection by printing artist via new `/api/collection/artists`; drawer
> "Use printing artist" autofill; honest pre-V5-index fallbacks) · **P2 CORE — TABLE
> RECORDS** (4th Proving Grounds door; Academy games PERSIST at game over via
> `gameRecordsStore` + `/api/records` — the step/choose terminal blocks write the record
> before dropping the save; list→detail with the narrated tail) · **P1 Prove the Pod**
> (20 real games from Pod Balance → empirical seatSummary + rated-vs-wins line) · **Q7**
> SeatSummaryTables in Sim Center results · **Q3** DeckReadyView post-import moment ·
> **Q8** per-message Copy/Save chips (locked-deck-safe) · **Q9** pod→sim handoff
> (consume-once initialSelection) · **Q4-lite** shell hand-hex → tokens. Suite **7,696**
> + lint 0 · fence a2a03ba8 ×2 + tier 0-diff (3rd time this session). PARKED: P2 replay
> scrubber + self-play records + game-log merge (backlog P2 note) · Q4 full alias sweep ·
> Q7 report-history trend · Q9 reverse link · V7 artist filter token. Dev-tree residue:
> synthetic printings-index seed + Sol Ring trophy row (Gallery/Trophy walk demos).

> **v0.90.0 (same finale session, "do your next best moves"):** **V6 THE TROPHY CASE** —
> additive provenance fields on collection rows (`signed {artist,date,event,inPerson}`,
> `altered`, `artistProof`, `showcase`) through validateProvenance + the PATCH whitelist;
> the drawer's Provenance section; the ★ showcase hero strip atop The Stacks (art tiles +
> caption). **V5** — printings-index schema now carries artist/fullArt/borderColor/
> storySpotlight (builder + docs + pins; fields land in bundles at the NEXT CI index build —
> verify in the v0.90.0 release log; local dev has no bulk so no local rebuild). Suite
> **7,693** + lint 0 · fence a2a03ba8 ×2 + tier 0-diff AGAIN · PATCH round-trip proven live
> (400 on unknown signed field, 200 + persisted on good payload). Dev-tree residue: one
> seeded "Sol Ring" trophy row in the dev profile (walk demo; delete from the drawer if it
> annoys). Parked → V7 session: artist autofill in the drawer · the dedicated showcase
> surface/door · Gallery.

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
