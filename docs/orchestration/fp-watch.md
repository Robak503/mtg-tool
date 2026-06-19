# FP-WATCH — running false-positive log (the channel to Hans)

> **Why (Colton, 2026-06-19):** Cindy's TRUNK PLAN flips cards in bulk (150–600/slice). A broad matcher's
> blast radius scales with it — one over-broad pattern can mint *dozens* of false positives at once. CREED:
> a false positive (a card flipped native that then mis-resolves / drops a clause / fabricates) is
> **FORBIDDEN**. This file is the durable "noted for Hans" channel so nothing slips through the cracks as
> volume scales.
>
> **This is NOT the same as `retired-fp-ledger.md`.** That ledger = mechanics we *deliberately* deferred and
> will enforce later (enforce-don't-drop). THIS file = cards that **shipped native but are WRONG** and need a
> fix NOW (correct the model, or drop-to-LOW with a pin).

## Protocol

**Who APPENDS (anyone who spots one):**
- **Clyde** — at the merge gate, when a high-volume slice's sample looks risky or a shape isn't pinned.
- **Colton** — anything caught in live play / a goldfish.
- **Hans** — everything her corpus sweep surfaces.

**Who DRAINS:** **Hans** (FIX lane). Each row → either (a) tighten the matcher + add a `MUST_DROP_TO_LOW`
pin so it can never re-flip, or (b) if the whole mechanic is intractable, drop-to-LOW + log it in
`retired-fp-ledger.md` keyed to the future enforcement. Batch fixes on `fix/<batch>-hans`. Mark the row
DONE (with the fixing PR #) — don't delete it (the history is the regression record).

## High-volume guardrails (the net for bulk slices)

1. **Builder (Cindy):** every slice flipping **>100 cards** MUST paste a **sample of 15–20 newly-native
   card names** (from the adversarial corpus run) into the PR body, + the `MUST_DROP_TO_LOW` shapes it
   excludes. No sample on a big slice = Clyde holds the merge.
2. **Integrator (Clyde):** on a >100-card slice, spot-check the sample + confirm the over-broad shapes are
   pinned. Any doubt → append the suspect here and either hold for Hans or merge-with-a-watch-row.
3. **QA (Hans):** sweep the **new flip-set of every merged slice** (not just periodically) — `qa-sweep.mjs`
   over the cards that slice added — and log every FP here same-cycle.
4. **Release gate (Clyde):** don't cut a release whose >100-card slices haven't been Hans-swept yet (or note
   the unswept slices in the release entry so a fast-follow can patch).

## The log

_(newest first · status: 🔴 open · 🟡 in-fix · ✅ fixed)_

| Date | Card(s) | Slice / PR | Symptom (why it's a FP) | Severity | Status |
|---|---|---|---|---|---|
| — | _(none yet — suite green @ 2ddbf0f, 17.5%)_ | — | — | — | — |

> Severity: **P0** mis-resolves in a normal game (silent wrong result) · **P1** drops a clause/rider ·
> **P2** metric-only over-claim (no runtime harm, e.g. FIX-MANA-class). P0/P1 block the next release.
