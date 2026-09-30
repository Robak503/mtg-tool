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

**DONE R6:** each item landed or parked with a reason under §9.

## §7 R7 — the release

Merge PR #466 (Omnath's docs, green). On/after **2026-10-02**: fresh `git fetch`, green master run, CHANGELOG
`[Unreleased]` → `[0.161.0] - <date>`, `git tag v0.161.0 -a -m "Release v0.161.0"` + push; watch the release run
(its own Scryfall/EDHREC/Spellbook sync); verify `latest.json` BY CONTENT (version 0.161.0, signature present); then
the acceptance for R1: once the box's app updates, `GET http://127.0.0.1:3000/api/sync-data` shows `source: "bundle"`
with the release's dates, not 2026-07-19.

**DONE R7:** v0.161.0 published and verified; the box app reads the fresh bundle.

## §8 THEN

[OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ② (tap-a-creature alt cost, then the party-count
reducer) → ③ → ④.

## §9 PARKED / NEEDS COLTON

- GitHub settings (owner-only): secret scanning + push protection; private vulnerability reporting (SECURITY.md already
  points there); optional rulesets blocking force-push/deletion on master and `v*` tags.
- Commit metadata carries personal email addresses on all 3,752 commits — only a history rewrite removes them; the
  noreply address going forward is Colton's call.
- Codex read "keep everything private" as repo visibility on 2026-09-05 — reuse that phrasing only with "the mtg-tool
  repo stays public".
