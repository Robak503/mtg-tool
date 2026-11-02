# GROWTH — month-by-month progress

Tracked from 2026-11-02 at Colton's request, so the project's growth is visible across releases. The RUN-LEDGER batch line
resets at every tag; this file does not. One row per month. The current month is "to date" and is updated when a slice lands
(the month-to-date line under the RUN-LEDGER batch line mirrors it); a month's row closes on the 1st of the next.

**The program these numbers serve** (the play-weighted program — Colton, 2026-10-01, widened 2026-11-02): the top 1,000
most-played Commander cards (edhrec_rank) to 90% covered (met 2026-10-16), then the top 2,500 to 90% (2,250), worked in pure
rank order across the top 5,000.

## The table

| Month | Corpus (native) | Top 1,000 | Top 2,500 | Top 5,000 | Tests | Releases | Commits |
|---|---|---|---|---|---|---|---|
| October 2026 | 15,154 → 15,957 (+803; 44.3% → 46.1%) | 826 → 935 (+109) | 1,653 → 1,904 (+251) | 2,630 → 2,941 (+311) | 17,379 → 23,002 | 8 (v0.162.0 – v0.169.0) | 270 (111 feat, 125 fix, 34 other) |
| November 2026 (to date, 11-02) | 15,957 → 15,996 (+39; 46.2%) | 935 → 937 (+2) | 1,904 → 1,914 (+10) | 2,941 → 2,953 (+12) | 23,002 → 23,490 | 0 | 10: 3 card slices, 4 engine fixes (the Spirit Guide / Force of Will crash family, the castexplode follow-up, the two Kinnan loop slices), 3 ability-loss groundwork (S0a, S0b, the S0b review's fixes) |

## How each number is measured

- **Corpus (native):** native-tier cards over the whole corpus — the RUN-LEDGER batch line's figure, recorded as each slice lands.
- **Top 1,000 / 2,500 / 5,000:** play-weighted coverage — `MTG_APP_ROOT=<data root> node scripts/measure-coverage.mjs
  --played=N` from `app/` (covered = a native tier or a plain land). The October boundaries were re-measured on 2026-11-02 with
  the current tool and the current bundled data against each boundary's engine (the last master commit before 00:00 Phoenix:
  17436c26 for October 1, 9c3162b3 for November 1), so the series compares like for like. Figures recorded at the time differ by
  a few cards, because edhrec ranks shift between data syncs (the ledger's 10-01 entry recorded 829 / 1,648).
- **Tests:** the full suite's passing count (skipped tests not counted).
- **Releases:** `v*` tags cut in the month.
- **Commits:** first-parent commits on master in the month (Phoenix time). From November on they are counted by what they did:
  card slices (credit cards), engine fixes (behaviour a player could hit), groundwork (machinery that credits nothing yet).
