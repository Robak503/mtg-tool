> 🚀 **v0.106.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — subset auto-pick generalized (+5 native · ~14 natives made HONEST).**
> Slice `2be79bc6` + chore; tag **`v0.106.0`** → CI (verdict → CONTINUITY). **The parked slice-5 mystery is
> SOLVED — one root cause:** targetSubsets emits the EMPTY subset first and the trigger-flush chooser takes the
> first all-correct-side candidate → every "up to N target" trigger resolved as a silent no-op (native-classified,
> did nothing). Yao Guai's author had patched + documented it for ONE atom; the largest-first sort is now
> generalized to all subset atoms (side-gate intact — probed mixed boards both intents; EMPTY = last resort).
> **Effect: ~14 shipped natives now genuinely act at runtime** (Baloth Null, Gavony Silversmith, Kitesail Cleric,
> Elder Deep-Fiend, Nefashu, The Reaper…) **+ 5 new flips** (up-to-ONE anchor): Cormela · **Sword of Light and
> Shadow [Joe-Cap]** · Lethal Protection · True Ancestry · Walk with the Ancestors (Discover 4 runtime-verified).
> 5/5 skeptic-CONFIRMED (side-by-side baseline corpus diff; AI cast path provably unaffected; pod hash held for a
> verified STRUCTURAL reason). **Fence: suite 7,796 (+6) · lint 0 · trajectory `ab524e20` ×2.**
> **Session total (2026-07-05): +20 native across v0.103–106, LOST=0 throughout · 4 latent FP generators closed**
> (reminder-anchor drop · vacuous batch filters · restriction-dropping attacks matcher · empty-first subset pick).
> **NEXT (in flight): cost-tax static** (runtime-first mirror of collectCostReducers/costReductionForSpell at the
> legalChoices pricing chokepoint; taxes collect from ALL battlefields; simple shapes only — Thalia family).
> **Menu after:** k-descending subset enumeration (skeptic-flagged 64-cap truncation) · War-and-Peace hand-count
> metric · Toski statics · monarch.
>
> ── prior release (below) ──
> 🚀 **v0.105.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — Reyav attached-only attacks + SoFF conjunct (+5 native, LOST=0).**
> Slices `6b19a8e2` + `f60cfef7` + release chore; tag **`v0.105.0`** → release CI (verdict → CONTINUITY).
> **Slice A (attached-only attacks + that-creature referent):** the attacks subject matcher ANCHORED (was a bare
> substring test — any "a creature you control <restriction> attacks" silently dropped its restriction: a latent
> over-fire generator, now closed); "that's enchanted or equipped" modeled via descriptor `attachedOnly` (≥1
> attachment, enforced in scopeMatches); the entering/attacking pronoun rewrite accepts the spelled-out "that
> creature gets/gains" form (etb arm + attacks/creatureYouControl arm). **Flips (4/4 skeptic-CONFIRMED, 28/28
> runtime probes, independent full-corpus re-diff +4/LOST=0/MOVED=0):** Reyav [Joe-Cap], Ogre Battledriver,
> Primal Forcemage, Ardoz (union scope + activated lane live-probed; Ardoz's own minted token fires the union).
> **Slice B (the "you <verb>" second conjunct):** the untap-all-lands anchor accepts the and-compound's leading
> subject → **Sword of Feast and Famine** [Joe-Cap] native-equipment (runtime e2e: damaged player's discard
> pendingChoice + controller's lands untap; 4 stale FN pins re-specimened, intent preserved; skeptic verdict —
> see CONTINUITY).
> **Fence: suite 7,790 (+12 this release) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical).**
> **Session running total (2026-07-05): v0.103.0 +7 · v0.104.0 +3 · v0.105.0 +5 = +15 native, LOST=0 throughout;
> 3 latent FP generators closed** (reminder-anchor silent drop · vacuous batch filters · restriction-dropping
> attacks matcher). **NEXT menu:** Sword of War and Peace (their-hand damage metric) · Sword of Light and Shadow
> (GY-return conjunct) · cost-tax static (fattest corpus) · Toski statics · monarch (Pantlaza).
>
> ── prior release (below) ──
> 🚀 **v0.104.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — with-keyword batch combat-damage (+3 native, LOST=0).**
> Slice `8f1497cd` + release chore; tag **`v0.104.0`** → release CI (verdict → CONTINUITY). "Whenever one or
> more creatures you control WITH <keyword> deal combat damage to a player" is modeled end to end: carved out
> before the with-reject guard (keyword gated to FILTERABLE_ETB_KEYWORDS) · a new PER-DEFENDER pass in
> `checkBatchCombatDamageTriggers` (fires once per damaged player per the ruling, ctx = layer-aware MATCHING
> dealers' totals; Grim Hireling's once-per-controller semantics untouched + pinned) · the "X/X token where X =
> that damage" payload (`ptContext:"combatDamageAmount"`, outside the hasX gate) · multi-subtype batch lists
> ("Ninja or Rogue creatures") parse via a separator- AND qualifier-denylist-gated "creatures" strip.
> **Flips (3/3 skeptic-CONFIRMED w/ live probes):** Quartzwood Crasher [Joe-Pantlaza], Prosperous Thief +
> A-Prosperous Thief [Joe-Yuriko; Ninjutsu line = the documented bare-cost KW-NINJUTSU credit].
> **Two FPs killed before ship:** the suite's own guard caught the "colorless creatures" over-strip; the skeptic
> flagged the latent "red or green creatures" variant — both denylisted + pinned (`batchKeywordCombatDamage.test.js`).
> **Fence: suite 7,778 (+12) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical).**
> Prior evidence-ranked NEXT list (below, v0.103.0 block) still stands minus item ①: next = equip payload atoms
> (Reyav / War-and-Peace / Feast-and-Famine) · cost-tax static · Toski statics.
>
> ── prior release (below) ──
> 🚀 **v0.103.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — granted compound-keyword line (+7 native, LOST=0).**
> Master carries `2ce6a34a` (the slice) + the release chore; tag **`v0.103.0`** → release CI (verdict → CONTINUITY).
> **The slice:** the "Enchanted/Equipped creature [gets +X/+Y and] has <keyword(s)> and \"<quoted trigger>\"" line
> now models coherently across its three seams — `GRANTED_ABILITY_LINE` reaches past the keyword segment (+ strips
> reminder text pre-anchor, an audit-caught FP: Eternal Thirst was credited while extraction returned nothing → the
> runtime would never fire it), `parseAttachedClause` strips a validator-approved quoted tail so the keyword half
> parses as a layer-6 grant, and coverage adds a STATIC-HALF GUARD (parseAttachedBonus must parse non-empty).
> **Flips (7/7 CONFIRMED by refute-default skeptics w/ live runtime probes):** Power Fist [Joe-Wolverine],
> Web-Shooters, Take Flight, Staggering Insight, Eternal Thirst, Cathar's Call, Commanding Presence (+4 benign
> native-aura→native-trigger relabels: Consuming Fervor, Grasp of the Hieromancer, Infernal Scarring, Verdant
> Embrace). **Fence: suite 7,766 (+9) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical — flips
> outside the Tier-1 pod; nothing to re-baseline).** CREED guards pinned: Reaver Cleaver ("player or planeswalker"
> object), ungrantable keyword half, activated quote, trailing rider — all stay body-only.
> **📊 FRESH 13-deck census (2026-07-05, lands-in-denominator method — THE baseline going forward):** aggregate
> **73.9%** (1015/1373). Colton: Slivers 98.9 · Koma 93.3 · Vihaan 92.2 · Zaxara 91.5 · Omnath 90.9 · Rograkh 76.
> Joe: Ur-Dragon 75 · Kinnan 72 · Toph 69.1 · Pantlaza 64 · Yuriko 63.3 · Cap 63 · Mothman 57.4 · Kellan 55.3 ·
> Wolverine 51.8 (Power Fist adds +1 post-census). ⚠️ Counts LANDS in the denominator — prior per-deck %s used a
> different denominator; compare within-method only.
> **NEXT (evidence-ranked, from the combat-family probe of all 51 candidates):** ① batch group combat-damage
> detector ("one or more <filter> creatures you control deal combat damage" — runtime
> `checkBatchCombatDamageTriggers` EXISTS; needs a with-keyword filter + the trailing-"creatures" list fix +
> batch damage-total context + a scaled-token payload → Quartzwood Crasher [Pantlaza] + corpus; Prosperous Thief
> still blocked by ninjutsu) · ② attack/combat-damage payload atoms (Reyav double-strike grant · Sword of War and
> Peace hand-count damage · Sword of Feast and Famine discard+untap — each ~1 card, all on the existing
> equippedCreature trigger scope) · ③ cost-tax static (fattest corpus yield; needs real runtime cost-INCREASE
> enforcement) · ④ can't-be-countered + attacks-each-combat statics (Toski, corpus singles). Probe artifacts in
> the session scratchpad: `probe-combat` output, `system-rank.json`, `census-full.json`, `tier-base.tsv`.
>
> ── prior release (below) ──
> 🚀 **v0.102.0 — 2026-07-04 (Cindy, Opus 4.8). SHIPPED — Joe-shelf coverage (+6 native).**
> Master `618731f0` (ff-pushed, no PR gate this env this time), tag **`v0.102.0`** pushed → release CI **in progress**
> (run 28730962117; verdict → CONTINUITY). The two clean Joe-shelf slices, cherry-picked onto master `bec794d5`:
> **LEYLINE opening-hand pre-strip** (`460cf3f6` — CR 103.6 "begin the game with it on the battlefield" stripped in
> classifyCard; +4: Leyline Axe/Anticipation/Lifeforce/Vitality) + **Equip-legendary quality** (`95561644` — "Equip
> legendary creature {cost}" modeled, mirror of Equip-commander; +2: Excalibur, Blackblade Reforged). **Cap 61→63,
> Wolverine 58→59.** Fence: suite **7,757** green · lint 0 · **classification-tier ONLY → trajectory `ab524e20` holds**
> (flipped cards outside the Tier-1 pod; pod play byte-identical; nothing to re-baseline). Spent branch
> `claude/grind-etb-combat` = deletable (its commits are in master).
> **⛰️ GRIND CEILING:** the clean-grind tier is EXHAUSTED — Joe's decks sit at their honest 58–75% native ceiling; the
> rest is genuine Arbiter tail (ninjutsu / library-digs / play-from-zone / planeswalkers / crossover) + FP-prone
> dedicated systems. Next coverage = fresh careful mini-features (cost-tax static = fattest yield; Power Fist /
> counter-double = Wolverine; ninjutsu = Yuriko) with full adversarial verify — NOT marathon grinding.
> **📱 PHONE PORT:** Colton "phone plan is out"; Omnath same-day logged it on-hold-until-the-Mac-box. Not building now
> either way. Server box = Mac Studio, wait for M5 (`project_server_box_decision.md`).
>
> ── prior release (below) ──
> 🧩 **v0.101.0 — 2026-07-04 (Cindy, Opus 4.8). SHIPPED (tag `v0.101.0` on `122975af`, CI success — see CONTINUITY).**
> Landed as PR #413 (P3+P7+P9, `7f443b07`) + follow-up PR #414 (E4/Q4/D5, `122975af`), then tagged. Detail:
> The `orders/p3-p7-p9-backlog.md` chunk, all three additive Academy/Learn features, stacked on `d226091b`
> (v0.100.0): **P3 post-game debrief** (`0b5bf2fe` — the Academy result scrim tallies the player's own picks vs
> `metadata.suggestion`; the "un-strip decisionWire" premise was STALE like E1's — suggestion lives only on `ask`,
> already on the wire, so it's built off that + a pin test, no dead plumbing) · **P7 replay scrubber** (`9d7014be` —
> Table Records detail steps a finished game per-turn via `groupLogByTurn` + the shared `LearnLogEntry`; also fixed a
> latent P2 bug where `logTail.join("\n")` rendered `[object Object]`, and bumped record log capture 5→160 lines so
> there's a game to scrub) · **P9 puzzle mode** (`08bffb34` — Save-as-puzzle → `/api/puzzles` (store mirrors
> gameRecordsStore, reuses learnSaveSchema checksum/serialize guards) + `/api/learn/resume-puzzle` session-from-
> snapshot loader (fresh id, reuses `advanceUntilDecision`, `/learn/start` untouched) + a Puzzles list & result overlay
> driven by the pure, unit-tested `evaluatePuzzle`; v1 goal = win-this-turn).
> **FENCE: suite 7,744 (+19) · lint 0 · trajectory `ab524e20` ×2 byte-identical to the v0.100.0 anchor** (rows 5706,
> seed 1 — zero engine files touched; git-verifiable). Round-trip test proves serialize→restore→same board. **Verified
> LIVE in the preview:** P7 scrubber stepped T1→T2; P9 listed an injected real snapshot → Solve loaded the board+goal
> badge → passing the turn fired the "Puzzle failed" overlay; zero console errors throughout.
> **LANDING (Colton's call 2026-07-04): open a PR → merge → tag ONE release v0.101.0** (master-push is gated in this
> env). New app surfaces for Omnath tooling: `/api/puzzles` (GET list · GET ?id= · POST save-from-live-session) +
> `/api/learn/resume-puzzle` (POST {puzzleId}); Table Records `logTail` is now a fuller narrative tail (≤160). No
> engine/self-play/trajectory change — `ab524e20` holds; nothing to re-baseline.
>
> **THEN (same session, Colton "do all recs · full rights"):** folded three more into PR #413 →
> **E4 durable color tags** (`e76da578` — definitions move to the server `/api/color-tags` →
> `profilePath("color-tags.json")`, the U-F4 durable fix; localStorage demoted to a write-through sync cache
> reconciled server-wins on mount; new `colorTagStore.sanitizeTags` unit-tested; +6 tests) · **Q4 LEYLINE
> alias sweep** (`dbfe8851` — 31 legacy Aether-token usages → `--ley-*` across 5 components + the 37-line dead
> alias block deleted; 0 refs verified before removal; MTGAssistant hand-hex was already fixed) · **D5** Garfield
> doc refresh. Suite **7,750** · lint 0 · **still zero engine deltas** (`ab524e20` holds by construction). New
> surface: `GET/PUT /api/color-tags`. **DEFERRED (deliberate):** D1 archive move (cosmetic + cross-doc
> link-risk), D2 TODOS/ROADMAP delete (Colton's files), D3 mobile (parked on Colton), D4 tray-eyeball (manual
> .exe). E2/E3 AI-tuning stays PARKED on evidence. **PR #413 now = P3+P7+P9+E4+Q4/D5 → v0.101.0 on Colton's
> merge** (self-merge is harness-blocked; needs his click).
>
> ── prior release (below) ──
> 🚀 **v0.100.0 RELEASED — 2026-07-04 (Cindy, Opus 4.8) — the full P5→K→release run, after the engine-tail pass below.**
> Shipped to master + PUBLISHED (signed `.exe` + `latest.json`, all 3 CI workflows green): **P5 reality report** COMPLETE
> (route `analyze` flag `c944acd5` + DeckReport UI `73dc0f98`) · **K4 tokens/meld + K9 flavor + K5 combo steps** (`f1bbb4c0`
> — populate at the next data sync; K4/K9 at this release's index build, K5 at the next weekly spellbook sync) ·
> **housekeeping** (swept `_flipbase` + `friendly-golick` worktrees junction-safe, main `node_modules` verified intact;
> CHANGELOG current) · **release** (`9b4a4cd2`, tag **v0.100.0**, bumped from 0.99.0; CI SUCCESS 23m45s — all 5 assets
> published, auto-updater live). Health sweep: Next production build ✓ · suite **7,725** · lint 0 · ci+rust CI ✓. Nothing broken.
>
> **NEXT (Colton's plan, post-release):**
> - **P3 debrief** (recon'd — moderate, NOT purely client-side): `decision.metadata.suggestion` EXISTS but is wire-STRIPPED
>   for pending-choice kinds (`decisionWire.js` `PENDING_WIRE_FIELDS` whitelist — add `metadata`/a slimmed `suggestion`);
>   then LearnView accumulates the user's pick vs the suggestion + shows a debrief at the result scrim (`LearnView.jsx` ~:367).
>   `/api/learn/step`+`/choose` return `decisionViewForWire(...)`; non-pending decisions already pass metadata through.
> - **P7 spectate + P9 puzzle** — LAY OUT WITH COLTON (P7 = a replay viewer over the Table Records data; P9 = a live-session
>   snapshot exporter). **Roadmap planning** — with Colton. Other backlog: E4 color-tags, D archive (the `friendly-golick`
>   orphan dir lingers locked — clears on reboot).
>
> ── prior pass (below) ──
> 🔧 **ENGINE-TAIL PASS — 2026-07-04 (Cindy, Opus 4.8) — E1 + P5-analyzer SHIPPED · E2/E3 PARKED (evidence) · ENGINE-WRITE lock LIFTED.**
> **E1 earthbend-return** (commit `a2dfdc34`, on master, UNTAGGED — releases batched with E2/E3): the CR 603.7
> "when it dies or is exiled, return it tapped" rider is now enforced (`combat.applyEarthbend` flags the animated land →
> `triggers.checkLeavesTriggers` synthesizes a delayed trigger → `zones.applyEarthbendReturn`, `enterCardFromZone` tapped,
> fires landfall). Fence: **suite 7,718** (+7) · lint 0 · tier flip-diff **LOST=0/GAINED=0** (0 tier changes — the
> earthbend permanents were ALREADY native safe-FN partials, NOT the 34-card flip the stale order/CAP assumed; the
> reminder count-strip had already shipped. `retired-fp-ledger.md` CAP corrected) · trajectory byte-identical before/after.
>
> **⚠️ TRAJECTORY ANCHOR RE-BASELINED: `a2a03ba8` (v0.88.0, doc) → `ab524e20` (current, reproducible ×4, rows 5706, seed=1).**
> Root-caused BENIGN: `git diff v0.88.0..master -- app/src/lib/learn` is EMPTY (engine byte-identical) + the deck-loader is
> too, so the change is DECK-DATA drift (Colton's profile `prof_a981996c` edited 2026-07-04; rows 8281→5706), NOT a code
> regression. **`ab524e20` is the honest pre-E2/E3 anchor — E2/E3 re-anchors FROM it, not from the stale `a2a03ba8`.**
>
> **🅿️ E2/E3 AI-TUNING — PARKED ON EVIDENCE (do NOT re-anchor; `ab524e20` holds).** A/B baseline
> (`play-quality-probe.mjs`, standard·mirror·seed=7·legacy=all, 60 games, reproducible ×2): NEW(shipping default)
> **58.3%** vs OLD(v1) 41.7% — the AI is ALREADY strong. altCost isolated (`--legacy=altCost`, 2 seeds): standard 1v1
> NEW **46–49%** vs OLD 51–54% (current altCost marginally net-NEGATIVE in 1v1); commander NEW 66.7% vs OLD 33.3%
> (net-POSITIVE in the pod — the real use case). Read: the tune is marginal + noisy + needs a risky card-specific value
> heuristic (a wrong HOLD is its own bad play), and it's already net-positive where it matters. Per "ship only if clearly
> up + don't regress the real case," **E3 doesn't clear the bar; E2's offered-X-subset re-anchors every deck for a
> similarly narrow gain** — both parked. The A/B harness is proven + wired for a future attempt (`--legacy=<key>`,
> `altCost`/`xSizing` arms in `opponentAI.POLICY_KEYS`); re-open only with a decisive-signal design (bigger samples, or a
> specific logged bad-decision to target).
>
> **✅ P5 (reality report) — FOUNDATION SHIPPED** (commit `e6c3379d`): the post-game analyzer promoted to a shared lib
> `src/lib/learn/gameAnalysis.js` (`analyzeGame` + `summarizeSeatReality` — per-deck dead-turn rate / avg casts·lands /
> mulligan rate / avg X), consumed by the A/B probe (de-drifted) + the future route. Suite 7,724 (+6), lint 0, trajectory
> `ab524e20` ×2 (behavior-neutral). **NEXT (app-side, no engine lock):** P5 Part 2 = a self-play `analyze` route over a
> `record:true` batch → `summarizeSeatReality`; Part 3 = the DeckView report surface. Then P3 debrief, E4 color-tags, K-items.
>
> ⚠️ **SYNC NOTE — 2026-07-04 post-merge:** current version is **0.99.0**; suite is now **7,718** (E1 added 7; was 7,711).
> A parallel chat shipped collector UX + full-card frames as 0.96-0.99 (a version collision:
> my tags v0.96-0.98 point at E5/P4/P8, their v0.99.0 at the collector UX). **BOTH are in
> master** — E5/P4/P8 code all present. Engine byte-identical v0.88.0→master (git-verified); the historical
> `a2a03ba8` no longer reproduces on current decks — see the anchor re-baseline above. Numbers below that say 7,703/7,711 are pre-E1.

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
