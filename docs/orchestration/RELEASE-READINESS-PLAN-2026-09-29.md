# RELEASE-READINESS PLAN — 2026-09-29 (Colton's go; the WAKE-REPORT top block points a booting seat HERE)

> **THE ORDER (Colton, 2026-09-29, chat):** approved Cindy's recommendation — a release-readiness pass, then tag
> **v0.161.0 after Reality Fracture releases (2026-10-02)**, then resume
> [OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ②.
>
> **A seat boots from THIS file.** Find the first stage whose DONE line is not met, take its first unfinished item, work
> it under §0. Do not re-plan. Anything that needs Colton goes under §9 and you move on. Card slices that land while the
> tag waits for 10-02 ride the same tag.

**State at the go (2026-09-29, measured at 5df810d2 / c7f8fffd):** suite **1585 files / 16,429 tests** green (1
deliberate skip) · lint 0 · corpus **14,772 / 34,245 (43.1%)** · 30 decks, 88% aggregate, 13 at ≥90 · master CI green
(run 36655091557) · repo PUBLIC, stays public · last tag v0.160.0 (2026-08-16) · 340 commits unreleased.

---

## §0 LAW (every slice)

Non-card slices (this plan's R1–R6): **test first, SEEN TO FAIL against the old code → the smallest honest fix →
mutants seen to fail** (a `Mutation-checked:` line in the commit naming what was broken and which test caught it; a
survivor is documented, deleted, or gets its missing test) **→ `npm run lint` + `VITEST_TIMEOUT_MS=900000 npm test`**
(gate on the fail count) **→ docs** (RUN-LEDGER, CHANGELOG `[Unreleased]`, the WAKE-REPORT top block when a stage closes)
**→ commit by explicit path → push to master → check that run** (jobs' `steps` length, not the run-level conclusion).
Card slices follow the 09-06 plan's §0 in full (flip-diff, witness, mutants). Never edit app-tree source while a suite
runs; one gate run at a time; never write JSON from PowerShell (BOM); the CREED holds.

---

## §1 R1 — reference data freshness (`app/src/lib/server/paths.js`)

**The bug (found 2026-09-29):** `dataPath()` returns the writable AppData copy whenever one exists, so once an install
has synced (or imported) reference data, every newer bundle an app update brings is shadowed forever. The box's
v0.160.0 app reported all seven datasets synced 2026-07-19 (72 days, STALE) although v0.160.0's CI downloaded
oracle_cards fresh on 08-16 (38,626 records).

**Build:** for the five REFERENCE groups only — `scryfall-bulk/*` (stamp: `scryfall-bulk/manifest.json` `generatedAt`),
the Spellbook four (`spellbook-meta.local.json` `syncedAt`), the EDHREC salt pair (`edhrec-salt-meta.local.json`
`syncedAt`), `cardkingdom-prices.json` (its own head `generatedAt`), `rules-index.json` (file mtime — a bare array) —
a bundled copy whose group stamp is STRICTLY newer than the synced copy's is read instead. Ties, unreadable stamps,
and every non-reference file (user data: price history, play hints, caches, logs) keep the writable copy. Writes are
unaffected (every sync script writes `MTG_APP_ROOT/data` itself). `/api/sync-data` GET reports each dataset's
`source` ("bundle" / "appdata").

**DONE R1:** new tests seen to fail on the old `dataPath()`; the fix green; mutants killed; CLAUDE.md §2.3 describes the
new rule; full gates. Post-release acceptance is R7's. ✅ **MET 2026-09-29** — suite 1586 files / 16,443 tests, lint 0,
mutants 8/8 killed (RUN-LEDGER R1 entry).

## §2 R2 — an honest engine version stamp

`engineVersion()` (`app/src/lib/learn/grindLoop.js:38`) returns `app/package.json`'s version — "0.150.0" on every
local record since the in-repo version stopped moving (release.yml stamps the tag's version on the runner only). Omnath's
Squirrel Girl baseline must not record 10k games under a meaningless version. Build: stamp a version that identifies
the engine build (e.g. the version plus the git commit when running from a checkout; the packaged exe keeps its
CI-stamped version). Find every consumer of the stamp first (grind records, self-play shards, Omnath's harness).

**DONE R2:** local records carry a build-identifying stamp; consumers checked; tests; COMMS note to Omnath. ✅ **MET
2026-09-29** — `app/src/lib/learn/engineBuild.js` (git describe → `0.160.0+343.g916dfa71[.dirty]`; the exe keeps its
tag version); suite 1588 files / 16,461 tests, lint 0, mutants 9/9 killed (RUN-LEDGER R2 entry). Omnath's own
`pilots/_env.mjs engineVersion()` still reads package.json — his lane; the COMMS note says how to switch.

## §3 R3 — Omnath's batch 19 into `card-play-hints.json`

The queue block (`<MEMDIR>/orders/arbiter-nuance-queue.md`, batch 19) holds 5 new notes + **10** REFRESH blocks in a
third heading form (`**REFRESH — Card**`); the 08-16 merge was a one-off parser and `warm-play-hints.mjs` only preserves
curated entries. Build a committed, tested merger that parses all three note forms, replaces refreshed notes, adds new
ones as `source: "curated"`, and reports the count. Run it against the real ledger; verify the write landed on the
REAL disk (not the MSIX mirror) by reading it back through the app (`/api` or the live file's mtime/content).

**DONE R3:** merged count reported to Omnath in COMMS (expected: +5 curated, 10 replaced). ✅ **MET 2026-09-30T02:14Z**
— +5 curated, 10 replaced, curated 486 → 491, verified on re-read, real disk (tool: 76f65fab; RUN-LEDGER R3 entry).

## §4 R4 — release pipeline safety

(1) `release.yml`'s test gate runs the whole suite unsharded under a 900 s wall — mirror `ci.yml`'s two shards (or gate
the build on them). (2) `sync-spellbook.yml` sets `continue-on-error: true` on the whole job, so a job that never ran
reports the run green — move it to the sync step and end with a step that fails the run when the sync failed (keep the
cache save on `always()`). Then run `sync-spellbook` once by hand to rebuild its fallback cache.

**DONE R4:** both workflow changes pushed and exercised (a green ci run; one manual sync-spellbook run that executes).
✅ **MET 2026-09-30** (db6f08b1, pushed with e29c5412). The manual sync-spellbook run (36659346685) executed every step:
the combos bulk completed (**112,543 variants**, up from 108,046 on 08-30), the per-card flag crawl hit Spellbook's
rate limit (`HTTP 429 after 10 retries … offset=10100` — gotchas #17), the partial progress was cached, and the run went
**RED** — the fix working: the old job-level continue-on-error would have reported it green. The release's sharded gate
runs for real only at the tag (R7). All workflow YAML is ASCII-clean (gotchas #14).

## §5 R5 — CHANGELOG

`[0.160.0]` was never cut: that release's batch still sits at the bottom of `[Unreleased]`. Cut the `[0.160.0] -
2026-08-16` heading at the tag boundary (`git log v0.159.0..v0.160.0` decides which entries shipped), and leave
everything after it in `[Unreleased]` for 0.161.0.

**DONE R5:** `[0.160.0]` exists; `[Unreleased]` holds only post-v0.160.0 work. ✅ **MET 2026-09-30** — the tag-time
`[Unreleased]` (a lone `### Fixed`, 31 bullets) sat contiguously at the bottom of today's; moved verbatim under
`## [0.160.0] - 2026-08-16` by a verified script (no line lost or duplicated; the diff is +4 lines); 304 bullets stay
in `[Unreleased]` for 0.161.0.

## §6 R6 — docs QoL (the 2026-09-29 audit backlog)

RUN-LEDGER's duplicate block (lines ~7,254–23,322 = ~23,327–39,395; commit 26645a2a) — delete one copy and restore the
truncated line from `git show 26645a2a^`; rotate WAKE-REPORT and RUN-LEDGER (archive everything below the live block to
`docs/orchestration/archive/`); RELEASE.md / CLAUDE.md `v0.2.0` tag examples → the real next tag; the repo SessionStart
hook's COMMS anchor (`indexOf('## LOG')` matches the backticked mention on COMMS line 9 — anchor on
`\n## LOG (newest first)`); CLAUDE.md's gstack skill references → the skills this box has; the quartet plan's Phase 2
premise (the decision trajectory already exists). One commit per file family.

**DONE R6:** each item landed or parked with a reason under §9. ✅ **MET 2026-09-30** — landed: the RUN-LEDGER duplicate
repaired (e29c5412; proven on 26645a2a itself); WAKE-REPORT + RUN-LEDGER rotated into `archive/` (5,539 → 671 and
23,409 → 2,201 live lines; KT-5 moved below KT-4b); the `v0.2.0` tag examples → v0.161.0 with the "one above the newest
tag" rule (RELEASE.md, CLAUDE.md §1.6); CLAUDE.md §3.4 matches the workflows; the SessionStart hook anchors on the real
`## LOG (newest first)` line; a gstack-availability note in CLAUDE.md's skill routing; the quartet plan's stale Phase 2
bannered (the 09-06 plan §4 repointed at its real tail); the 09-06 plan's trap list = the union with SHELF-85's; the
playbooks' `npx vitest run` → the CI wrapper and the laptop `MAIN` path → the install root; SHELF-85 bannered CLOSED;
gotchas #20–#23 (worktree footing · `$'` in String.replace · the MSIX install mirror · new reference datasets). Parked
(§9): the repo-root `tier-snapshot.json` tracked file (a `--out`-less run overwrites it) — NICE, not release-relevant
(done 2026-09-30 — see §9).

## §7 R7 — the release

~~Merge PR #466~~ — done 2026-09-30 (squash, d71ce96a). **Before the tag:** re-dispatch `sync-spellbook` (`gh workflow run
sync-spellbook.yml --ref master`) so the per-card flag crawl resumes from its cached offset (it stopped at 10,100 on
2026-09-30 — Spellbook's rate limit) and the release restores a fuller fallback. On/after **2026-10-02**: fresh `git fetch`, green master run, CHANGELOG
`[Unreleased]` → `[0.161.0] - <date>`, `git tag v0.161.0 -a -m "Release v0.161.0"` + push; watch the release run
(its own Scryfall/EDHREC/Spellbook sync); verify `latest.json` BY CONTENT (version 0.161.0, signature present); then
the acceptance for R1: once the box's app updates, `GET http://127.0.0.1:3000/api/sync-data` shows `source: "bundle"`
with the release's dates, not 2026-07-19.

**DONE R7:** v0.161.0 published and verified; the box app reads the fresh bundle. ✅ **Published 2026-10-01T05:26Z and verified** (release run 36817109773; `latest.json` checked by content; moved up from 10-02 by Colton, Reality Fracture already on Scryfall). ⏸ The box acceptance waits on Colton's app update.

## §8 THEN

[OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ② (tap-a-creature alt cost, then the party-count
reducer) → ③ → ④. ✅ Stage ② MET 2026-09-30 (+2, +4 — both riding v0.161.0); stage ③, the residue loop, is live until R7.

## §9 PARKED / NEEDS COLTON

- GitHub settings (owner-only): secret scanning + push protection; private vulnerability reporting (SECURITY.md already
  points there); optional rulesets blocking force-push/deletion on master and `v*` tags.
- Commit metadata carries personal email addresses on all 3,752 commits — only a history rewrite removes them; the
  noreply address going forward is Colton's call.
- Codex read "keep everything private" as repo visibility on 2026-09-05 — reuse that phrasing only with "the mtg-tool
  repo stays public".
- ~~(NICE, builder) the repo-root `tier-snapshot.json` is tracked (1.1 MB); `scripts/tier-snapshot.mjs` without `--out` from
  the repo root overwrites it — untrack + ignore it, or make `--out` required.~~ Done 2026-09-30, both halves: the two
  stale tracked snapshots (repo root and `app/`) are removed, and the script now requires `--out=<file>` or
  `--diff=<before>,<after>` and exits 2 on anything else, before it writes.
- (SHOULD, builder) the release's strict bundle guard (`prepare-tauri-resources.cjs`) checks that Spellbook files EXIST,
  not that the crawl completed — a rate-limited crawl ships partial card flags on a green run. Check the meta file /
  counts instead.
