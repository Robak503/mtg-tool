# UI-OVERHAUL LOG — the LEYLINE pass (v0.86.0 → v0.87.0)

> Wave-by-wave work log of the one-time Fable 5 UI/UX overhaul
> (mission: `memory/orders/fable5-ui-overhaul.md`). Same discipline as
> play-harness-overhaul-log.md: every wave gated (suite + lint + console-clean
> + screenshots), engine fenced the whole way. Screenshots live in
> [ui-overhaul/](ui-overhaul/) — before/after gallery per surface.

## The theme

**LEYLINE** — green energy through dark glass. True-black surfaces (#050705
base, green-tinted grey ramp), phosphor-green accent (#56d65d / #74ff86 hot),
glass panels (blur 14px + 1px luminous hairlines), **glow = hierarchy** (only
primary actions, live states, and focus glow). Display face: Space Grotesk
(was Playfair — library-serif read website, not appliance). Supersedes the
Aether cyan theme. Emotional reference: the `/omnath` green-phosphor boot
screen. Agent identity survives as per-agent color ONLY on identity elements
(agent rows, bubbles, avatars): Jace cyan→**arcane blue #6ab8ff** (cyan was
the app accent, not his), Karn silver (kept), Tibalt red (kept), Arbiter
gold (kept).

## The engine fence (proven instruments)

- `app/src/lib/**` untouched except `agents.js` UI color fields (pure display
  config consumed only by components).
- **Trajectory-hash probe validated mid-pass**: the original play-harness
  probe (`traj-hash.mjs`, recovered from that session's scratchpad) run twice
  on this branch with P1+P2 in-tree, data root
  `%APPDATA%\com.colton.mtg-tool`: `games=3 rows=8281` →
  `a2a03ba8d94a9982…` **== the v0.86.0 anchor, both runs**.
- Tier-fingerprint baseline captured (34,125 rows, sha256 `330567e9e167f2c0…`)
  for the pass-end 0-diff proof.

## Wave log

### P0 — ground + inventory + baseline (commit 0e5c3d9b)
- 9-reader inventory workflow over the whole UI estate (~926k tokens read):
  **143 surfaces · 166 distinct button treatments · 219 off-token colors ·
  98 UX issues** → [ui-overhaul/INVENTORY.md](ui-overhaul/INVENTORY.md).
- 25 baseline screenshots of every reachable surface (`baseline/`).
- Suite baseline 7,661 green / lint clean — matches the v0.86.0 anchor.
- Environment: worktree + node_modules junction from the main tree; dev
  server runs with `MTG_APP_ROOT=<main>/app` so real data renders
  (the realism-gate pattern).

### P1 — the LEYLINE design system (commit c1e1c174)
- `globals.css` rewritten: LEYLINE token layer (surface ramp, green ramp,
  glass recipe, glow discipline, radius + motion scales) with every legacy
  Aether token name **aliased to LEYLINE values** — the estate re-skins at
  the token layer; waves burn the aliases down.
- **THE BUTTON SYSTEM**: `.btn` + `.btn-primary/-secondary/-ghost/-danger`
  × `-sm/default/-lg` + `.btn-icon/.btn-loading` + disabled + focus-visible
  glow ring. One primary per surface; only primary glows.
- `/styleguide` hidden route — the living reference every wave composes from.
- Cyan burn-down: all 41 hard-coded Aether-cyan accents flipped across 14
  files (patch-script pattern, gotcha 19a). Jace → arcane blue.
- Font: Playfair → Space Grotesk (display), Inter + JetBrains Mono kept.
- Gate: 7,661 green / lint clean / screenshots (styleguide + gate + shell).

### P2 — the kiosk shell (commit 36e74c86)
- `pb()`/`sb()` style helpers re-grounded to system green (geometry mirrors
  the `.btn` classes) — **agent-tinted chrome is dead**; identity colors now
  live only on identity elements.
- Sidebar: nav rows get a green "you are here" active state (there was NONE
  before — a P0 inventory finding), agent rows active only on the chat view,
  tracked-caps mono section labels, larger kiosk targets.
- AppHeader: provider segmented control + freshness chips → tokens
  (`color-mix` borders); RightPanel tabs + MobileTabBar → green actives.
- frontend-placeholder → LEYLINE (phosphor wordmark + scan-line loader).
- Rust: window title now `MTG Tool v{version}` at setup (`cargo check
  --release` clean; tray/close/single-instance untouched).
- Incident: first P2 commit claimed lint-clean while 3 `no-unused-vars`
  warnings existed (`cfg` props orphaned by the conversion) — caught in the
  same session, fixed, amended before push. Rule kept: read the gate output
  BEFORE writing the commit message, not after.
- Gate: 7,661 green / lint clean / cargo clean / shell screenshot.

### P3 — surface waves (lanes, ≤2 concurrent, worktree-per-builder)
- Lane plan (file-disjoint): C = Academy (LearnView/LearnBoard, fable) ·
  E = Vault/collection (14 files, sonnet) · A = chat (ChatPanel/
  SessionSidebar/GarfieldPanel, fable) · B = deck (DeckView/Import/
  DeckConfirm/PodBalance, sonnet) · D = sim (SimCenter/SelfPlayPanel,
  sonnet) · F = system modals (Updates/Settings/Onboarding/Profile*/
  Feedback*, sonnet).
- Every lane: isolated git worktree + node_modules junction to the MAIN
  tree (removed by the lane itself via `rmdir` before finishing), full
  suite + lint inside the lane, one commit, orchestrator cherry-picks and
  re-gates + screenshots before the next round.
- (per-lane entries appended as they integrate)
