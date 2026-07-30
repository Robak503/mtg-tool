# RUN-LEDGER — live resume anchor for the long build run

> **The work queue lives in [NEXT-QUEUE.md](NEXT-QUEUE.md)** — roadmap v2 is cleared, and that file is its
> successor. It is sequenced so risky work happens while sharp and mechanical work is available late.

> ## 🚦 RELEASE CADENCE — BATCH, DO NOT TAG PER SLICE (Colton, 2026-07-29)
> *"you cutting to many releases put more work in before each cut do 100 plus slices or something close."*
>
> **Accumulate ~100+ cards of native gains, then cut ONE release.** The slice discipline does not change —
> flip-diff, mutation checks, pin verdicts, a ledger entry at every slice boundary, and a push to `master`
> per slice. **Only the TAG batches.** A tag makes an update banner appear in every running `.exe`, and one
> banner per +21 is noise.
>
> - 🔬 **SIZING RULE (2026-07-30): use PHRASE-SWAP attribution, never containment or line-removal.**
>   Swap the mechanic's PHRASE for a known-good payload of the same shape, leaving triggers/costs/
>   conditions intact. Line-removal deletes the TRIGGER along with its payload and over-counts badly
>   (Treasure measured 35 that way; the true number is **0**, and Treasure is already fully built).
>   **Grep the source for a mechanic before believing it is unbuilt** — Ward, Treasure and Food all were.
>   Full evidence in the METHOD CORRECTION entry below.
> - 🎯 **READ THE SHELF ENTRY BELOW BEFORE PICKING MORE CORPUS WORK.** Colton's shelf is at **93%** with
>   exactly ONE deck under the >=90% bar (`cdh`, **87/100 — THREE cards, each a MULTI-mechanism build**, re-measured 2026-07-30 after
>   Borne Upon a Wind + Vexing Shusher landed). Its full gap is diagnosed per clause in the entry.
>   ⚠️ **The TRACTABLE half of that gap is now spent.** The 15 remaining slots are each a distinct
>   bespoke mechanism (Battle card type · Cipher · Food · Treasure+Dash · Bestow+landfall · alt-cost
>   +change-targets · hexproof-from-COLOR · per-cast mana provenance [REFUSED]) — there is no
>   vocabulary work left on this deck. Expect ~1 card per slice from here, not a cycle.
>   That is still the stated objective; corpus veins are the fallback, not the target.
> - ✅ **v0.149.22 TAGGED 2026-07-30 with 84 cards** — EARLY TAG on the cadence rule's bug-fix
>   exception (the permanent-card-put FP corrupts board state on a shelf deck's commander; the batch
>   was at 84 so the cost was near zero). **Next batch starts from ZERO here.**
> - ✅ **v0.149.22 PUBLISHED AND VERIFIED BY CONTENT** (2026-07-30) — the published `latest.json`
>   reports **version 0.149.22**, `pub_date 2026-07-30T20:59:29Z`, a URL pointing at the real
>   installer, and a **424-char** minisign signature. **5 assets**, full updater chain. Job
>   completed in **27m7s**. ⚠️ `gh run list` still read `in_progress` after the job had finished —
>   the JOB view (`gh run view --job=`) was the honest reading. Another instance of the standing
>   rule: check the artifact, not the status line.
> - **BATCH IN FLIGHT: 2 cards since v0.149.22** (targeted permanent keyword grant +1, granted RIOT +1) (protection-from-a-colour grant +3, colour change +4, "its power" lifegain +6, look-at-hand +5, THE DISCARD EVENT +7, Megrim +1, cast-from-hand rider +5, descend +5, control-conjunction +2, THE PACT CYCLE +4, adapt-ignores-counters +1, bestow+trigger widening +2, SPRINGHEART +1 — **SHELF CLOSED**, self-exile-after-keyword +3, spectacle credit +4, keyword parity +3, escape line-credit +3, escape on auras +3, ninjutsu x clone/reducer +3, self-untap non-creature nouns +5, layer-7c subtype counts +5, regenerate non-creature +5, X-capped tutor allowlist +1, put-from-hand subtypes +3 **+ A LIVE CREED FP FIXED**) (v0.149.21 shipped **79 cards across twelve slices**) (granted Ward—Pay-life +2, **REFERENT FAMILY +67 across SEVEN slices**, named-token sac trigger +1, combat-dmg-to-YOU pair +1) (v0.149.20 shipped 89 cards across ten slices) (planeswalker subtypes + `another <filter>` +11,
>   negated + conjoined filters +4, controller sac nouns + counter placement +5, turn-scoped flash grant +1, cost-reducer filter vocabulary +8, colour cast-trigger filter +52, granted uncounterability +1, life-gain replacement +7). **ALL SHIPPED IN v0.149.20.**
> - **v0.149.19 SHIPPED 2026-07-30 with 92 cards** (condition-filter vocabulary
>   +13, per-turn ledger readers +10, metric/scope readers +22, planeswalker sweep + negated subtype +13,
>   one-sided opponent sweep +4, mass-removal filter delegation +19, mass-bounce delegation +3,
>   condition disjunction + singular graveyard reader +8). Start the next batch's count here.
> - **✅ v0.149.19 PUBLISHED AND VERIFIED BY CONTENT** — `releases/latest/download/latest.json` reports
>   `version 0.149.19`, a URL pointing at the real installer, and a 424-char minisign signature. 5 assets,
>   full updater chain. Master at `0778f0a7`.
> - Write CHANGELOG entries under `## [Unreleased]` per slice; promote the whole block and bump both version
>   files (`app/package.json` + `app/src-tauri/tauri.conf.json`) only at TAG time.
> - Tag early ONLY for a real reason: a user-facing bug fix, a release-pipeline fix, or Colton asking.
> - This supersedes CLAUDE.md §7.2's "cut releases freely when work is shippable" for the engine grind.

> **If you are a fresh session picking this up after a crash, timeout, or context loss: READ THIS FILE
> FIRST, then `docs/orchestration/WAKE-REPORT.md`.** This file is rewritten at every slice boundary and is
> the single source of truth for what is in flight. Everything above the `---` is current; everything below
> is the completed trail.
>
> Rebuild your footing in four commands:
> ```
> git fetch origin && git log --oneline -8 origin/master
> git status --porcelain                       # must be clean, or finish/discard what's dirty
> grep -rl MUTANT app/src/ | head              # MUST be empty — a crash mid-mutation leaves sabotage
> cd app && npm test && npx eslint . --max-warnings 0
> ```
> If `MUTANT` appears anywhere in `app/src/`, a mutation check was interrupted. Restore that line to its
> pre-mutation form before doing anything else — the tests will be lying until you do.
>
> **⚠️ AND WHEN YOU MUTATE: `grep -c MUTANT` proves a mutation APPLIED, not that it applied to YOUR line.**
> **⚠️⚠️ A GREEN SUITE IS NOT EVIDENCE THE MODULE GRAPH STILL LOADS.** After touching imports anywhere in
> `src/lib/learn/`, run `node --input-type=module -e "import './src/lib/learn/legalChoices.js'"`. One added
> import edge (a constant read only inside a function, per the existing convention) reordered module init
> into `ReferenceError: Cannot access '_lifeLossWatcher' before initialization` while **914 test files stayed
> green** — vitest resolves modules in a different order than node. Fixed by extracting the constant to a
> leaf; the check is one command and it is now mandatory.
>
> **⚠️⚠️ AND A DELETION MUTATION IS INVISIBLE TO THE SWEEP.** `grep -rl MUTANT` only finds mutations that
> left a MARKER. A mutation that DELETES a line leaves none — so when a revert fails (mine failed on a file
> Windows had locked, and `cp` printed `Permission denied` in the middle of a long output block), the sweep
> still reads clean while the sabotage is still in the tree. **After any mutation round, confirm the revert
> with `git diff -- <file>`, not with the marker sweep.** Verified live 2026-07-28: the synonym line was
> missing and every gate was green.
>
> `perl` without `/g` replaces the FIRST occurrence in the file. I burned two runs "confirming" a test was
> hollow when the mutation was landing on an identical string 180 lines earlier (a different atom's
> `spellFilter: "instantSorcery"`). **Anchor on something unique, or `grep -n` the line number before and
> after.** A green mutation run is only evidence if you know WHAT you broke.

## 🚨 SHIPPED 2026-07-29 — THE RELEASE PIPELINE WAS DEAD. v0.149.13 NEVER PUBLISHED.

**Found by a QA/audit pass, not by a test.** The tag `v0.149.13` exists on the remote and master carries all
its work, but `api.github.com/.../releases/tags/v0.149.13` → **404**; the newest published release was still
v0.149.12. The GitHub Actions REST API is public read on a public repo, so the failing step is readable with
no `gh` and no auth: run `30498926398`, step 12 **"Build slim oracle index" — failure in 0 seconds**.

**Root cause, upstream + ours, and ours is the one that matters.** Scryfall replaced `download_uri` (plain
JSON array) with **`jsonl_download_uri`** (gzipped JSONL); `size` is gone, only `compressed_size` survives.
`sync-scryfall-bulk.cjs` looped the four wanted types and did `if (!item.download_uri) continue;` — so it
downloaded **zero of four** files, wrote a manifest with `files: []`, and **exited 0**. CI step 11 went green
in **one second** against a step that normally runs ten minutes. The release then died two steps later on a
missing `oracle_cards.json` — a perfectly good error message for the wrong problem.

**⭐ THIS IS THE HOLLOW-GATE LAW AS A BUILD OUTAGE.** A one-second green step is a *measurement* that nothing
happened. Nothing in the pipeline asserted that a sync moved bytes, so absence read as success — the same
shape as every hollow gate this run has caught in the engine, except this one silently stopped shipping.

**The fix (`app/scripts/scryfall-bulk-fetch.cjs`, shared by both scryfall syncs so they can't drift):**
- Accepts `jsonl_download_uri` **then** `download_uri`, so an upstream rollback needs no code change.
- Streams gunzip → JSONL → a plain JSON array, so the format change is contained at the seam and every
  downstream reader (`cardIndex.js`, `build-oracle-index.cjs`: `readFileSync` + `JSON.parse` +
  `Array.isArray(parsed) ? parsed : parsed.cards`) is untouched.
- **`StringDecoder`, not `chunk.toString()`** — a gzip chunk boundary lands mid-codepoint and would silently
  corrupt `Æther Vial` / `Lim-Dûl's Vault` / `Jötun Grunt` with U+FFFD. No record count would ever notice.
- **Three fail-loud guards**: no wanted types matched · any item missing a URL field (checked *before* any
  download, so a rename fails in one second naming the fields it found) · files-written ≠ files-intended.
  Plus per-file refusals: implausibly small, or zero decoded records, with the temp file cleaned up.
- `prepare-tauri-resources.cjs`: the helper is staged into the bundle (a missing `require()` would be
  MODULE_NOT_FOUND inside the `.exe`), and a missing sync script is now **fatal under STRICT** instead of a
  warning — that warn-only path is how `sync-cardkingdom-prices.cjs` once shipped absent.

**Verification — three layers, because the synthetic layer could not answer the real question.**
- 21 new tests, **all three mutations seen to fail**: `StringDecoder`→`toString` (caught by the one-byte-chunk
  test alone), the URL field reverted to `download_uri`-only (6 tests incl. the positive control), the size
  refusal disabled (1). The empty-snapshot test *still passed* under mutation 3 — proof the two refusal guards
  are independently live rather than one masking the other.
- **Live probe against the real endpoint**, which the local server could not settle: `data.scryfall.io` sends
  `content-type: application/gzip` with **`content-encoding: null`**, so `fetch` does *not* auto-decompress
  and the explicit `createGunzip()` is required. Had that header been `gzip`, the fix would have shipped broken.
- **CI steps 11–13 reproduced end-to-end** into a throwaway `MTG_APP_ROOT`: 4/4 synced (oracle 38,416 ·
  unique_artwork 53,849 · default_cards 116,311 · rulings 77,998), then step 12 wrote the slim index
  (36,173/38,416, 192.4MB→38.2MB) and step 13 the printings index (104,226/116,311). All exit 0.

**Gate:** full suite **980 files / 12,477 green** (+21, one new file), lint 0, MUTANT sweep clean.
**Shipped as v0.149.14** — v0.149.13 was *not* re-tagged; no force operations on a published tag.
**✅ v0.149.14 PUBLISHED AND VERIFIED** (run `30500810492`, 28.5 min tag→publish). 5 assets, full updater chain:
`latest.json` + `MTG-Tool-Setup.exe` + `.exe.sig` + the versioned installer + its `.sig`. Verified **by content,
not by filename** — `releases/latest/download/latest.json` reports `version 0.149.14`, `windows-x86_64`, a URL
pointing at the real v0.149.14 installer, and a 424-char minisign signature. Running `.exe`s will see it.

**⭐ THE STANDING RULE THIS COST US: A PUSHED TAG IS NOT A RELEASE.** After every `git push origin vX.Y.Z`,
check `api.github.com/repos/Robak503/mtg-tool/releases/latest` (public read, no `gh` needed) and confirm the
tag name AND the asset set. v0.149.13 sat "shipped" for a day because nobody looked.

---

## 🎯 ## ✅ BANKED 2026-07-30 — **ESCAPE ON THE AURA PATH. GAINED 3. The escape family is now complete (6/6).**

Sentinel's Eyes · Escape Velocity · Mogis's Favor.

### ⭐ ONE CLAUSE HERE, A WHOLE LINE THERE — the same keyword needed TWO shapes
| path | tokenizer | what the fix had to be |
|---|---|---|
| `coverage.isKeywordOnly` (creatures) | splits clauses on **commas** | remove the whole LINE **before** `stripReminder` |
| `staticAbilityParser.auraResidueClauses` (auras) | `abilityClauses` keeps `Escape—{W}, Exile two other cards…` **INTACT** | a single clause pattern in the existing allowlist |

⭐ *This is exactly why the creature fix did not carry the auras, and why the previous entry recorded
"predicted 6, paid 3" instead of assuming the rest would follow. Two residue paths for the same card text,
tokenizing differently — a keyword is not "handled" until every path that can park a card has been checked
against it. That is the parity lesson one level down from the sweep.*

The CR rationale is unchanged (**702.138a** — a graveyard re-cast the runtime never offers, so the from-hand
cast puts the identical Aura on the battlefield), and the mana-cost check was repeated for the aura
carriers: Sentinel's Eyes {W} · Escape Velocity {R} · Mogis's Favor {B} — all castable without the keyword.
The dash guard is carried over: a clause beginning with the CARD NAME *"Escape Velocity …"* has no dash
after the keyword and cannot match.

**Gates:** the escape file now runs 8 tests across both paths. Suite **1027 files / 13,033 green**, lint 0,
MUTANT clean. Commit `168f56f3`. **Batch 4: 62 cards.**

### ➡️ WHERE THE KEYWORD-PARITY THREAD STANDS
Started as *"miracle is 2 cards"*; it has paid **16** across five slices (self-exile ordering 3 · spectacle
4 · parity credits 3 · escape creatures 3 · escape auras 3). Remaining from the sweep:
- ⛔ **suspend** (3) — REFUSED, and permanently unless the engine learns to PLAY a suspend-only card:
  Lotus Bloom / Sol Talisman / Mox Tantalite print no mana cost.
- ⛔ **awaken** — no real carrier; the one hit was my own regex matching the name "Awakened Amalgam".
- The remaining one-sided keywords (splice onto arcane · harmonize · overload · entwine · conspire ·
  jump-start · retrace · recover · buyback) have **no permanent carriers that the credit alone would flip** —
  the sweep said so up front, which is the other half of its value.

**The parity vein is spent.** Next work should go back to the Joe shelf-gap list card by card.

---

## ✅ BANKED 2026-07-30 — **ESCAPE CREDITED BY WHOLE-LINE REMOVAL. GAINED 3.**
## ⭐ AND SUSPEND REFUSED FOR A REASON THAT ONLY A MANA-COST CHECK COULD FIND.

Nethergoyf · Bloodbraid Challenger · Lunar Hatchling.

### THE MECHANISM
Escape's cost is COMPOUND — *"Escape—{2}{B}, Exile two other cards from your graveyard."* — and
`isKeywordOnly` splits clauses on commas, so no clause-level pattern can reach it. Crediting the bare
*"exile two other cards from your graveyard"* fragment is out of the question: that is a real effect
elsewhere. **The LINE is the only safe unit**, removed BEFORE `stripReminder` collapses the newlines,
because that is the only point where line structure still exists.

Vacuous on flashback's basis (**CR 702.138a** — a graveyard re-cast the runtime never offers). The dash is
load-bearing and pinned: escape must be followed by its cost dash, so a line beginning *"Escape Velocity
…"* (the CARD NAME) can never match.

### ⛔ SUSPEND REFUSED — **the vacuity argument does not survive a card with no mana cost**
Suspend looked like the identical compound-cost shape and would have paid **3 more cards**. Then the
printed costs:

| card | printed mana cost |
|---|---|
| Lotus Bloom · Sol Talisman · Mox Tantalite | **`""` — none at all** |
| every escape carrier | {B} · {W} · {R} · {B} · {3}{R}{G} · {4}{G}{U} |

**Suspend is the ONLY way to play those three.** Crediting the line would mark a card native that the
engine cannot play by ANY route — a false positive, not a missing option. ⭐ *Every vacuous-keyword credit
in this file rests on "the card is castable WITHOUT the keyword." That premise is usually so obviously true
that it goes unchecked — and on a suspend-only card it is simply false. CHECK THE PRINTED MANA COST before
crediting any alt-cast keyword.*

### ⛔ AWAKEN dropped — my own scan lied
Its lone "carrier" was a false match: `^awaken` matched the card NAME **"Awakened Amalgam"**. *A
keyword-prefix regex will always collect cards whose NAME starts with that keyword; anchor on the cost, not
the word.*

### ✅ FIFTH BOUNDARY-MARKER PIN GRADUATED THIS SESSION
`cdaCountVocabulary.test.js` listed Nethergoyf as *"a CDA with an unmodeled escape rider"*. Re-pointed to
`native-static`; the surrounding cases still park CDAs carrying a genuinely unmodeled rider.

### ⚠️ PREDICTED 6, PAID 3 — the three escape AURAS did not flip
Sentinel's Eyes · Escape Velocity · Mogis's Favor. The AURA classifier has its own residue path that does
not go through `isKeywordOnly`, and they are **not claimed**. That path is the next thing to look at, and
it is the same parity question one level down.

**Gates:** 6 tests, including the dash guard and the Lotus Bloom refusal. Suite **1027 files / 13,031
green**, lint 0, MUTANT clean. Commit `4c7eb5ae`. **Batch 4: 59 cards.**

---

## ✅ BANKED 2026-07-30 — **THE PARITY SWEEP: 16 keywords handled on ONE side only. GAINED 3 so far.**

Jwar Isle Avenger · Goblin Freerunner (surge) · Zephyrim (miracle).

### ⭐ THE INSTRUMENT IS THE POINT — a SET comparison, not a card hunt
Spectacle was found card-by-card. That was the wrong altitude. Testing **every cost-carrying entry of
`CAST_KEYWORD_LINE`** (the SPELL-side vacuous-line strip) against **`isKeywordOnly`** (the PERMANENT-side
credit) found **SIXTEEN** keywords handled on one side and absent from the other:

> flashback · splice onto arcane · recover · harmonize · prowl · surge · miracle · overload · buyback ·
> entwine · conspire · jump-start · retrace · escape · suspend · awaken

⭐ *Two lists that should agree, in two modules, with no test comparing them. The same shape as the
writer-count sweep: enumerate BOTH sides of a contract and diff them, instead of waiting for a card to
expose each gap one at a time.* Most of those sixteen have no permanent carriers at all (splice / harmonize
/ overload / entwine / conspire / jump-start / retrace are instant-sorcery keywords) — the sweep says so
immediately, which is the other half of its value.

### WHAT SHIPPED — the simple `KEYWORD {cost}` shape, CR-checked
`surge` **702.117a** · `prowl` **702.76a** (both *"You may pay [cost] rather than pay this spell's mana
cost…"*) · `miracle` **702.94a** · `flashback` (on the graveyard-re-cast basis `CAST_KEYWORD_LINE` already
states). Card castable at its printed cost, resulting permanent identical → the unoffered alt entry is a
missing OPTION, never a mis-resolution.

✅ **THE ANCHOR IS THE SAFETY PROPERTY, and a real card proves it.** `Catalyst Stone` prints
*"Flashback costs you pay cost {2} less."* — a keyword-REFERENCING static. It has more words, cannot match
`^flashback {cost}$`, and the card correctly stays parked. *A card that CARES about a keyword must never be
credited for merely mentioning it* — pinned in the gates.

### ⚠️ PREDICTED 6, PAID 3 — said so rather than rounding up
The flashback and prowl carriers (Catalyst Stone, Thieves' Fortune) have OTHER blockers and are not
claimed. Thieves' Fortune is a Kindred **Instant** — it never touches the permanent-side credit at all.

### ⛔ STILL REFUSED — escape · suspend · awaken (10 permanents)
Compound dash-joined costs (`Escape—{2}{B}, Exile two other cards…`, `Suspend 3—{1}{U}`). `isKeywordOnly`
splits on commas AND dashes before testing, so no whole-line pattern can reach them; they need the LINE
removed before the split. escape 6 · suspend 3 · awaken 1.

### ⚠️ A FIXTURE TRAP WORTH REMEMBERING
`cards.find(name)` is NOT safe for fixtures: **"Zephyrim" has a TOKEN row** (*"Flying, vigilance"*, no
miracle line) ahead of the real card. Pulling by name alone grabbed the token and would have tested
nothing while looking green. Match on name AND type line.

**Gates:** 6 tests. Suite **1026 files / 13,025 green**, lint 0, MUTANT clean. Commit `c63f6a68`.

**Batch 4: 56 cards.**

---

## ✅ BANKED 2026-07-30 — **SPECTACLE CREDITED ON THE PERMANENT SIDE. GAINED 4.**

Blade Juggler · Hackrobat · Spawn of Mayhem · Spikewheel Acrobat.

**CR 702.137a** (verified): *"You may pay [cost] rather than pay this spell's mana cost if an opponent lost
life this turn."* A pure ALTERNATIVE COST — the card is fully castable at its printed cost and the
resulting permanent is identical, so the unoffered alt entry is a missing OPTION, never a mis-resolution.
The same rationale `coverage.js` already applies to foretell / blitz / freerunning / madness / ninjutsu.

⭐ **HANDLED-OVER-THERE IS NOT HANDLED-HERE.** Spectacle was already in `CAST_KEYWORD_LINE`
(`textNormalize.js`, the SPELL side). Nothing credited it on the PERMANENT side, so ordinary creatures
parked on the keyword line alone while their bodies were fully modelled. **Second time in two slices that
the bug was a keyword handled in one module and absent from its sibling** — worth checking the other
CAST_KEYWORD_LINE entries against `isKeywordOnly` as a pair, rather than one card at a time.

### ⛔ ESCAPE REFUSED — and it is STRUCTURAL, not a judgement
Escape (CR 702.138a) is the same vacuous shape and would pay **5 more permanents** (Nethergoyf · Sentinel's
Eyes · Escape Velocity · Mogis's Favor · Bloodbraid Challenger). It cannot be credited the same way:

> `Escape—{2}{B}, Exile two other cards from your graveyard.`

`isKeywordOnly` **splits clauses on commas BEFORE testing them**, so the line arrives as two fragments and
no whole-line pattern can ever match. Crediting the second fragment (*"exile two other cards from your
graveyard"*) is out of the question — that is a real effect on other cards. Escape needs the LINE removed
before the split, the way the spell path does it. Documented in-file at the refusal site.

⚠️ **A first pass added a `reEscapeCost` pattern that matched nothing.** It was removed rather than left
sitting there with a comment claiming it worked — dead code carrying a confident wrong explanation is the
thing the next reader believes.

### ⚠️ THIRD FIXTURE-FROM-MEMORY FAILURE THIS SESSION
Typed all three fixtures from recall and got **three of three wrong**: Spawn of Mayhem's rider is *"if YOU
have 10 or less life"* (not an opponent), Hackrobat's second ability is **+2/-2** (not trample), Blade
Juggler costs **{4}{B}**. The corpus test caught it, as it did the previous two times. *Recall produces
card text that is confidently, specifically wrong — and it fails tests for reasons that look like engine
bugs.* Noted in-file.

**Gates:** 5 tests, including that a spectacle-REFERENCING clause is NOT credited and that escape still
is not. Suite **1025 files / 13,019 green**, lint 0, MUTANT clean. Commit `390ddd8c`.

**Batch 4: 53 cards.**

---

## ✅ BANKED 2026-07-30 — **THE SELF-EXILE RETRY MUST LOOK PAST A CAST-KEYWORD LINE. GAINED 3.**
## ⚠️ AND I BANKED TWO WRONG ROOT CAUSES BEFORE FINDING IT — both corrected below.

Temporal Mastery (miracle) · Part the Waterveil (awaken) · Alrund's Epiphany (foretell).

### THE ACTUAL CAUSE
`stripSelfExileSentence` requires *"Exile &lt;this&gt;."* to be the **TRAILING** sentence. On these cards a
vacuous cast-keyword line prints AFTER the body:

```
Take an extra turn after this one. Exile Temporal Mastery.
Miracle {1}{U} (…)
```

…so the exile sentence is no longer last, the retry finds nothing, and the card parks with a body the
engine can otherwise resolve. Stripping the already-vacuous keyword line **before** the retry looks restores
the shape it was written for.

✅ **Safe by construction:** the retry runs ONLY when the direct parse came back LOW, so nothing that
parses today can change — and it is the SAME strip `parseEffectClauseImpl` already applies downstream. An
ORDERING fix, not a new permission. The `selfExile` stamp is preserved and asserted (GY-1 must EXILE these
spells, not graveyard them — gaining the parse while losing the stamp would be a silent rules error).

### ⛔ CORRECTIONS — two wrong causes I banked on this same thread
| I banked | why it was wrong |
|---|---|
| *"the strip is never reached on the classify path"* | it IS reached — `parseEffectClauseImpl:1493`, downstream |
| *"`stripReminder` eats the newline, so `CAST_KEYWORD_LINE`'s per-line anchor can't match"* | `stripReminder` really does collapse newlines, but `parseEffectClauseImpl` receives the **raw multi-line** oracle — a red herring built out of a true fact |

⭐ **What finally settled it was ordering the SAME oracle two ways** — keyword line last vs keyword line
first — and seeing only the trailing-exile arrangement parse. *Two plausible causes, each supported by a
true observation, and both wrong. A mechanism is not identified until you can make the symptom appear and
disappear on demand.*

### ⚠️ AND THE SIZE WAS OVER-CLAIMED: **3, not 25**
The earlier measurement ("25 cards a fully-applied strip would flip") pre-stripped the WHOLE oracle and
re-classified — which exercises more paths than this one retry. This ordering fix pays **3**. The other
**22 are NOT claimed** and still carry a different blocker; the escape (5) and spectacle (5) clusters are
the next things to diagnose, and they should be diagnosed, not assumed to be the same bug.

*A measurement that pre-applies a fix measures the CEILING of every path that fix could touch — not the
reach of the specific change you then make.*

**Gates:** 6 tests, including an order-independence case and the preserved `selfExile` stamp. Suite
**1024 files / 13,014 green**, lint 0, MUTANT clean. Commit `c2d0ae04`. **Batch 4: 49 cards.**

---

## ⛔ SUPERSEDED (wrong cause — kept for the trail)

## 🔍 ROOT CAUSE FOUND — **`stripReminder` EATS THE NEWLINE, SO `CAST_KEYWORD_LINE` CAN NEVER MATCH. ~25 cards.**

Followed the miracle thread to the bottom. It is not miracle-specific and it is not a missing keyword —
**it is one collapsed line break**, and it silently disarms an entire strip list.

### THE CHAIN, EACH HOP MEASURED
| hop | result |
|---|---|
| `CAST_KEYWORD_LINE` lists `miracle\s*\{` | ✅ already there, with foretell/blitz/flashback/buyback/… |
| `stripCastKeywordLines(oracle)` called directly | ✅ removes the line; the remainder classifies **native-spell** |
| `parseEffectClauseImpl` calls that strip (parser.js:1493) | ✅ it does |
| `parseEffectProgram(card)` on the same card | ⛔ **LOW**, atoms `[]` |

The contradiction resolves one hop earlier:

```
stripReminder("…Exile Temporal Mastery.\nMiracle {1}{U} (reminder…)")
  → "…Exile Temporal Mastery. Miracle {1}{U}"        ← THE NEWLINE IS GONE
```

`CAST_KEYWORD_LINE` is `^[ \t]*(?:…)[^\n]*$` with the `m` flag — **per-LINE anchors**. Once the reminder
strip has joined the keyword line onto the body line, `^` can never sit before `miracle`, so the strip runs,
matches nothing, and the keyword survives as residue that drags the whole spell to LOW.

⭐ *Two correct components composed into a broken whole. The strip list is right, the strip function is
right, and the call site is right — the ORDER is wrong. Nothing in either file is falsifiable on its own,
which is why it survived this long.*

### SIZE — measured across the corpus, not guessed
**25 non-native cards** would flip if the existing strip actually reached them, across **11 keyword
families**:

| n | keyword | e.g. |
|---|---|---|
| 5 | escape | Nethergoyf · Sentinel's Eyes · Escape Velocity |
| 5 | spectacle | Drill Bit · Blade Juggler · Hackrobat · Spawn of Mayhem |
| 3 | suspend | Lotus Bloom · Sol Talisman · Mox Tantalite |
| 3 | surge | Jwar Isle Avenger · Goblin Freerunner |
| 2 | **miracle** | **Temporal Mastery** (Yuriko shelf card) · Zephyrim |
| 2 | basic landcycling | Lunar Hatchling · World-Weary |
| 1 each | awaken · buyback · foretell · dredge · prowl | Part the Waterveil · Alrund's Epiphany · … |

### THE FIX — and the trap inside it
Strip the cast-keyword lines **BEFORE** reminder text is removed (or make the strip newline-agnostic for the
keyword+cost shape). ⚠️ **Order the two carefully:** `MADNESS_LINE` and `SPLIT_SECOND_LINE` deliberately
allow an optional trailing reminder paren, so they are written to run either way — but
`CAST_KEYWORD_LINE`'s `[^\n]*$` tail depends on the reminder still being present to consume. Changing the
order without re-reading both consts risks turning a vacuous-line strip into a body-eating one.

⛔ **Do NOT widen the regex to match mid-line.** A `miracle {`-anywhere match would strip real text out of
a sentence that merely mentions the word. The line break is the safety property; restore it, do not remove
the reliance on it.

**Verify with a full flip-diff** — the prediction is GAINED 25 / LOST 0, and any LOSS means the reordering
ate a body.

---

## 🔍 DIAGNOSED, NOT STARTED — **MIRACLE IS ALREADY DECLARED VACUOUS AND IS STILL PARKING CARDS**

Chased lead ① (Miracle) to the seam. It is **not** a missing keyword — it is a path that does not run.

### THE PRECEDENT READS ACROSS (checked, per the banked instruction)
`CAST_KEYWORD_LINE` in `effects/textNormalize.js` **already lists `miracle\s*\{`**, alongside
foretell / blitz / freerunning / flashback / buyback / entwine / conspire / mayhem. The rationale on that
const is exactly right for miracle, and **CR 702.94a confirms the shape**: *"You may reveal this card from
your hand as you draw it if it's the first card you've drawn this turn"* — an OPTIONAL alternative cast on
a card that also has a normal mana cost. The engine hard-casts it and the body resolves identically; the
only unmodelled part is an option the player is never offered (a SAFE FN, the madness/ninjutsu rationale).

### ⚠️ BUT THE STRIP IS NEVER REACHED ON THE CLASSIFY PATH
Measured on Temporal Mastery (printed: *"Take an extra turn after this one. Exile Temporal Mastery."* +
the Miracle line):

| input | tier |
|---|---|
| the full printed oracle | `arbiter-spell` |
| **the output of `stripCastKeywordLines(oracle)`** | **`native-spell`** |
| the miracle line deleted by hand | `native-spell` |
| miracle line with its reminder text removed | `arbiter-spell` |

So the strip PRODUCES a natively-classifying string and the classifier still parks the card — i.e.
**`classifyCard`'s residue path does not apply `stripCastKeywordLines`.** The fix is to run the existing
strip where residue is computed, not to add a keyword.

⭐ *A keyword can be "handled" in one module and still park every card, because handled-here and
reached-from-there are different claims. The strip list was not wrong; nothing called it.*

### SIZE — small, and honestly measured
Only **2** non-native miracle carriers are blocked SOLELY by the miracle line: **Temporal Mastery**
(a Yuriko-deck shelf card) and **Zephyrim**. The other 17 have their own blockers. So this is a 2-card fix
— worth doing for the consistency more than the count, and worth checking whether the same
never-reached-strip explains other keyword families before assuming it is miracle-specific.

⚠️ **Also corrected here:** my earlier line-drop note called Temporal Mastery's body *"Take an extra turn
after this one"*. The printed line is *"Take an extra turn after this one. Exile Temporal Mastery."* — the
self-exile matters and was dropped from my own summary. Read the printed line, not the paraphrase.

---

## ✅ BANKED 2026-07-30 — **RIOT, GRANTED. GAINED 1 CARD — BUT +2 SHELF SLOTS AND JOE CROSSES 78%.**
## ⭐ THE DESIGN DECISION IS THE ENTRY: I REFUSED THE OBVIOUS IMPLEMENTATION.

**Rhythm of the Wild (#211)** — the highest-value single card left on Joe's shelf, in **two** decks.
Jurassic Ramp **78 → 79%** · Wolverine **73 → 74%**. Joe **851/1098 (77% → 78%)**.

### ⛔⭐ WHY IT IS NOT A GRANTED KEYWORD — the trap I had just built a guard for
**CR 702.136a** (read from `cr_current.json`): *"Riot is a static ability. 'Riot' means 'You may have this
permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste.'"*

The obvious build is one line: add `riot` to `GRANTABLE_STATIC_KEYWORDS` and let the existing group-grant
parser emit a layer-6 `addKeyword`. **It would have been a false positive.** Riot is an **AS-ENTERS**
replacement, and a layer-6 keyword only exists once the permanent is ON the battlefield — *after* the entry
it is supposed to modify. The keyword would sit there visible and meaningless, the card would read
`native-static`, and no creature would ever get a counter or haste.

⭐ *That is the "classifies native, does nothing" class the non-creature-target drift guard was built for
ONE SLICE AGO. Having just spent a slice naming the pattern, I recognised it in a design I had not written
yet — which is the entire return on that work. The guard's value was never the 12 cases; it was the shape.*

### THE BUILD — an ENTRY-TIME battlefield scan, on an existing precedent
`resolvers.grantedRiotCount(state, controller, card)` scans the controller's battlefield at entry, exactly as
**`applyCounterDoubling`** already reads printed doubler text off the battlefield at the moment counters are
placed — same problem, same shape, so no new convention was invented. CR 702.136b (multiple instances work
separately) falls out for free; two grants give two counters, asserted.

⛔ **Three CREED gates, each seen to fail:** the entering card must be a **nontoken CREATURE** (the printed
grant says *"Nontoken creatures"*), the granting permanent must be controlled by the **same player**, and the
clause is matched by the **same anchored predicate the classifier credits** — so metric and runtime cannot
drift apart. ⛔ Spider-Punk's *"Other **Spiders** you control have riot"* is subtype-scoped, deliberately NOT
matched, and asserted to stay parked.

### ✅ TWO MORE BOUNDARY-MARKER PINS GRADUATED (seventh and eighth this run)
`riot.test.js` — *"a GRANT-only enchantment is NEVER credited/stripped"* · `typedUncounterable.test.js` —
*"Rhythm of the Wild #211 stays PARKED — riot is unmodeled"*. Both stated reasons are closed. **Each guard
was re-aimed rather than deleted**: the first now pins the subtype-scoped grant that IS still unmodeled, the
second pins the same typed-uncounterable line beside genuinely unmodeled text.

**Mutation-checked: 3 seen to fail** — M1 runtime scan unwired (the 3 runtime tests fail, coverage stays
green — the FP this slice exists to avoid, demonstrated) · M2 token+creature gates dropped (a token and an
artifact wrongly get riot) · M3 coverage marker not emitted (the tier).

**Gates:** flip-diff **GAINED 1 / LOST 0**, no other tier moved (12924 → 12925 / 34245). 11 new tests, eight
runtime. Suite **1036 files / 13,128 green**, lint 0, module graph loads, MUTANT clean. **Batch: 2 cards.**

### ➡️ SHELF-GAP LIST REFRESHED (section-filtered): **214 non-native, 91 one-away.** Only TWO cards sit in
2+ decks and both are now spent (Rhythm here; "Level Up" — a real Aura, #5087, in **3 decks** — is the other,
blocker = *"Enchanted creature has \"Whenever this creature attacks, double the number of +1/+1 counters on
it…\""*, i.e. a granted-triggered-ability-on-an-Aura. **That is the single highest-value card left.**

---

## ✅ BANKED 2026-07-30 — **THE OWED SWEEP, RUN. RESULT: CLEAN — AND POSITIVE-CONTROLLED BEFORE BELIEVED.**
## ⭐ Zero cards. The deliverable is an INSTRUMENT: a discovery script + a CI drift guard.

The previous entry banked a debt: *"34 `t.type === creature` gates across ten atom modules — audit them
before the next noun slice."* Paid.

### THE METHOD — don't read 34 gates, ask which ones can ever be WRONG
A creature-only effect SHOULD gate on creatures; the gate is a bug only where the PARSER can hand that
resolver a non-creature target. So the sweep enumerates every **(op, targetType) pair the parser emits with a
non-creature permanent targetType** across the whole corpus — **25 pairs, 8 distinct ops**: destroy · bounce ·
exile · tuck · animate · untap · regenerate · pump. Then each is RESOLVED against a permanent-tagged target
and asked the only question that matters: **did anything happen?**

**All 12 representative cases act.** The three found this run (untap-self · regenerate · pump) were the three
that existed; the other 31 gates sit on ops the parser never hands a non-creature target.

### ⭐ THE ZERO WAS POSITIVE-CONTROLLED, AND THAT IS THE POINT OF THE ENTRY
A clean sweep is worth nothing until the probe is shown capable of failing — the lesson the Planar Bridge
*"0 of 36,068 cards affected"* incident paid for with a shipped regression. **Reverted the pump gate and
re-ran: `pump/permanent *** NO-OP ***`.** So the zero is a MEASUREMENT. Restored, verified by `git diff`.

### THE DELIVERABLE — an instrument, not a card count
| artifact | role |
|---|---|
| `app/scripts/sweep-noncreature-target-gates.mjs` (`npm run sweep:noncreature-gates`) | **discovery** — re-run after teaching a parser any new non-creature noun; anything it prints the guard does not cover needs a case |
| `nonCreatureTargetResolvers.test.js` (14 tests) | **ratchet** — CI-safe (index-free), asserts every listed op ACTS on a permanent-tagged target |

⚠️ **The guard states its own limit in-file:** the case list is a SNAPSHOT, so a brand-new pair is not
auto-covered — the script is how you find one. Saying so beats implying coverage it does not have.

⭐ **And the guard carries its own non-vacuity checks**, because a green drift guard is exactly the thing
that could be hollow: one asserts the "did anything happen" helper returns *null* for an untouched state
(otherwise every case above it passes for free), and one asserts a CREATURE-scoped atom handed a
permanent-tagged target STILL no-ops — proving the three fixes opened their gates for permanent-SCOPED atoms
only, not universally.

**Gates:** no engine change, so no flip-diff (nothing could move). Suite **1035 files / 13,115 green**,
lint 0, module graph loads, MUTANT clean. **Batch unchanged at 1 card since v0.149.22.**

### ⏳ v0.149.22 at 16m27s (run 30579604476) — v0.149.21 took 21m46s, so still on schedule.
**Verify by the published manifest**, not by a green run.

### ➡️ NEXT: the noun-gap shelf queue is EMPTY. Run a fresh shelf-gap pass (the probe is section-filtered
now) or go back to the 97-entry one-away list and pick by adjacency to something already modeled.

---

## ✅ BANKED 2026-07-30 — **A TARGETED KEYWORD GRANT ON A NON-CREATURE PERMANENT. GAINED 1.**
## ⭐ THREE THINGS HAD TO LINE UP AND TWO WERE INVISIBLE FROM THE CARD TEXT.

**Tamiyo's Safekeeping** (#484 EDHREC, Hulk Smash **74 → 75%**). Joe **849/1098**. The last card on the
noun-gap shelf list — **that queue is now empty**; the next resume needs a fresh shelf-gap pass.

### THE THREE LAYERS
| # | layer | what was wrong |
|---|---|---|
| 1 | the parser arm | no "target permanent you control gains …" beside the existing creature arm |
| 2 | `applyPumpEffect`'s loop | `target.type !== "creature" → continue` dropped the permanent-tagged target |
| 3 | ⭐ **`splitClauses`** | the keep-whole rule is anchored `^target creature`, so the sentence **SHATTERED on its internal " and "** into *"…gains hexproof"* + *"indestructible until end of turn"* |

### ⭐ (3) IS THE ONE WORTH KEEPING — the parser was right and the driver ate the input
`pumpClauseParser` returned the **correct atom** when called directly, and `parseEffectClause` returned
**nothing at all**. Same signature as the Springheart field-name collision earlier this run — *when a parser
works in isolation but not through its driver, the driver is doing something to the input.* There it was
`runEffectProgram` skipping an atom on a colliding field name; here it was the SPLITTER, one stage EARLIER
than the parser I was staring at. **Read the driver, don't re-read the parser.** Cost: minutes, because the
direct-vs-driver comparison was the first thing tried instead of the fifth.

### ⚠️ **THIRD `t.type === "creature"` RESOLVER GATE THIS RUN** — this is now a KNOWN VEIN
untap-self · regenerate · pump/keyword-grant. Every one had the same shape: a parser noun widened, a card
classifying native, and **the runtime silently doing nothing** because the cast path tags a chosen
non-creature target `type:"permanent"` and the loop guard drops it.

➡️ **A SWEEP IS OWED: `grep -rn 'type !== "creature"\|type === "creature"' src/lib/learn/effects/` returns
34 hits across ten atom modules.** Most are correct (a creature-only effect SHOULD gate), but each one is a
place where widening a parser noun without touching the resolver produces a false positive that no
classification test can see. **Audit them against their atom's noun vocabulary before the next noun slice** —
that is a better use of a slice than one more card.

### THE SCOPE HELD
⛔ You-control only, and ⛔ no P/T form — *"target permanent an opponent controls gains …"* and
*"target permanent you control gets +2/+2"* are not printed shapes for this family, and inventing either from
symmetry would be a guess. Both are asserted to park. The gate opened for `targetType === "permanent"` ONLY,
so a stray permanent-tagged target on a creature-scoped pump is still dropped (asserted).

The runtime was already permanent-wide: both keywords are layer-6 grants, `groupGrantClauseParser` has
carried a `permanentsYouControl` scope for the MASS form, and `applyDestroyEffect`'s indestructible check
reads the layer engine (how Darksteel Forge protects artifacts). Only the single-target path was missing.

**Mutation-checked: 2 seen to fail** — M1 splitter keep-rule removed (5 tests) · **M2 resolver gate restored:
every PARSE test stays green and only the two RUNTIME tests fail**, which is the third demonstration this run
that a tier assertion cannot see a dead resolver.

**Gates:** flip-diff **GAINED 1 / LOST 0**, no other tier moved (12923 → 12924 / 34245). 11 tests, six runtime
including the CREED control (without the grant the same destroy kills the artifact). Suite **1034 files /
13,101 green**, lint 0, module graph loads, MUTANT clean.

### ⏳ v0.149.22 STILL BUILDING at 10m13s (run 30579604476). **Verify by the published manifest.**

---

## ⛔⭐ BANKED 2026-07-30 — **A LIVE CREED FALSE POSITIVE, FOUND WHILE SIZING A ROUTINE SLICE.**
## Plus put-from-hand subtype filters, GAINED 3 (Stoneforge Mystic is a shelf card). Joe **848/1098**.

### ⛔ THE BUG — "put a permanent card from your hand onto the battlefield" OFFERED INSTANTS
`putFromHand.TYPE_FILTER.permanent` was `{ groups: [] }` with **no `permanentOnly` gate**. An empty `groups`
means *"every card type"* to `cardMatchesTutorFilter` (`groups.length === 0 → return true`). Measured, not
theorised — the resolver returned **`["Lightning Bolt", "Grizzly Bears"]`** from a two-card hand.

⚠️ **REACHABLE IN A REAL GAME, ON THE SHELF.** **The Ur-Dragon** classifies `native-mixed`, prints this exact
clause on its attack trigger, and is the **COMMANDER of Joe's "Did you say Dragons?"**. Seven more carriers:
Flood of Tears · Selvala's Stampede · Kona, Rescue Beastie · The Golden City of Orazca · Redshift ·
The Majestic Duo · A-Kona. The library-side tutor has ALWAYS carried `permanentOnly` for the same printed
word (CR 110.4a). Same word, same meaning — the hand-side copy just never got the gate.

### ⭐⛔ AND A TEST WAS DEFENDING IT
`putFromHand.test.js` asserted, in as many words, *"'permanent' = an empty (all-type) filter"* — and expected
`{ groups: [] }`. **The suite was green because the bug was pinned as intended behaviour.**

⭐ *This is NOT a boundary marker graduating; it is a WRONG ASSERTION corrected, and the two must not be
confused in the ledger. A pin that records the CURRENT behaviour without ever asking whether the behaviour is
RIGHT will defend a defect as loyally as a feature — and it will do it silently, forever, in a green suite.
Every gate I have written this run assumes the pins encode intent. This one encoded an accident.*

**How it surfaced:** not by a probe or a gate, but by READING `TYPE_FILTER` while sizing an unrelated
widening, and noticing the one entry with no filter in it. The flip-diff would never have caught it (it is a
runtime pool, not a tier), and the suite actively vouched for it.

### THE ORDINARY HALF — subtype put-from-hand, GAINED 3
Three printed shapes, gated on **COUNT_SUBTYPE** (the one curated allowlist now shared by four readers):
bare subtype (**Stoneforge Mystic** — "an Equipment card"), `<Subtype> permanent` (**Goblin Lackey**),
`<Subtype> creature` (**Warren Instigator**). Same peel the library-side `bfn` does for "Rebel permanent".

⛔ **Didgeridoo stays parked deliberately.** Its "Minotaur permanent card" would flip if Minotaur joined the
allowlist, and Minotaur would almost certainly qualify. *Not added: that allowlist is curated per-need with
corpus verification and is shared by four readers — bumping it for one obscure card (#17717) trades a shared
invariant for a number.* A safe FN is the right answer.

**Mutation-checked: 3 seen to fail** — M1 `permanentOnly` removed (the 3 FP tests, including the live
regression) · M2 allowlist gate removed (both uncurated-word guards) · M3 the `creature` AND dropped from the
group (parser + the runtime Goblin-land case). Reverts confirmed by `git diff --stat`.

**Gates:** flip-diff **GAINED 3 / LOST 0**, no other tier moved (12920 → 12923 / 34245). 12 new tests, six
runtime including a full card-type sweep (instant/sorcery out; artifact/creature/enchantment/land/
planeswalker/battle in). Suite **1033 files / 13,090 green**, lint 0, module graph loads, MUTANT clean.
**Batch 4: 84 cards.**

### ⚖️ TAG JUDGEMENT — asked out loud, per the cadence rule
The batch rule's test: *under-report only → batch; misleads a decision, wedges a game, or corrupts stored
state → early tag.* An instant sitting on the battlefield is a **corrupted board state a player acts on**,
on a shelf deck's COMMANDER. **That qualifies for the early tag** — and the batch is at 84, so the cost of
tagging now is near zero anyway. Cutting **v0.149.22**.

---

## ✅ BANKED 2026-07-30 — **THE X-CAPPED TUTOR TAKES ITS OWN ALLOWLIST. GAINED 1 (Whir of Invention).**
## ⛔⭐ AND THE SHELF PROBE WAS COUNTING **SIDEBOARD** CARDS. A whole slice was aimed at a card that
## cannot move the number. **Probe fixed; read this before trusting any shelf-gap list.**

### ⛔ THE PROBE DEFECT, FIRST — it is worth more than the card
Last slice I banked a course correction: *filter picks through `shelfgap.json` before building.* I did.
The probe returned three shelf cards; I picked Whir of Invention, built it, and **Joe's total did not move
— 847 before, 847 after.**

**Whir is in Kinnan's SIDEBOARD.** `measure-coverage` counts Mainboard + Commander only; my walker pushed
every `{name}` object it found, section be damned. Verified against the real profile data: **1442 Mainboard
/ 17 Commander / 32 Sideboard** entries — so ~2% of what the probe called "shelf cards" can never count.

⭐ *A probe that reads the same FILE as the metric is not the same as a probe that reads the same SET. The
section field was right there in every entry and I never looked at it, because the card names all looked
plausible. The tell was cheap and I had it: the deck total is an ABSOLUTE count, so "flip-diff GAINED 1" and
"deck total unchanged" cannot both be right unless the card was never in the denominator.*
**Fixed in `shelfnoun.mjs` — section must be Mainboard or Commander. Re-run says the real list is TWO:**
**Stoneforge Mystic** (Captain America, Mainboard) and **Tamiyo's Safekeeping** (Hulk Smash, Mainboard).

### THE BUILD ITSELF IS STILL RIGHT — an inconsistency, not a guard
`bfx` (X-capped search → battlefield) was hard-limited to the two literal words `creature|permanent`. Its
FIXED-cap twin **`bfn`, ten lines below in the same file**, has always taken any `parseTutorFilter` phrase —
artifact, enchantment, Equipment, "Rebel permanent". Both arms carry the identical safety argument, and bfn's
own comment states it: **the MV cap is what makes an uncapped fetch impossible.** X-bound-at-cast
(CR 202.3b) is exactly as real a cap as a printed N.

So Soul of Mirrodin's artifact fetch at a fixed cap worked while Whir's at an X cap parked, for a reason
neither comment ever gave. bfx now peels `permanent` / `<subtype> permanent` and runs the allowlist, mirroring
bfn line for line. The colour prefix is still admitted ONLY on "creature".

**Mutation-checked: 3 seen to fail** — M1 word set narrowed back (5 tests) · M2 colour guard dropped (the
green-artifact park) · M3 `permanentOnly` gate dropped (the byte-identical check on the two old forms).
⚠️ M1's first attempt inserted a `/* comment */` INSIDE the regex literal and vitest reported
**"no tests"** rather than a failure — *a mutation that breaks the file proves nothing; re-run it as a real
edit.*

**Gates:** flip-diff **GAINED 1 / LOST 0**, no other tier moved (12919 → 12920 / 34245). 10 tests, four
runtime including two CREED caps (X=0 caps at 0; a missing xValue is 0, never uncapped). Suite **1032 files /
13,078 green**, lint 0, module graph loads, MUTANT clean. **Batch 4: 81 cards.**

### ➡️ NEXT TWO, BOTH VERIFIED MAINBOARD
1. **Stoneforge Mystic** — blocker is the SECOND line, *"{1}{W}, {T}: You may put an Equipment card from your
   hand onto the battlefield."* (the tutor-to-hand line already parses for every noun including Equipment).
2. **Tamiyo's Safekeeping** — *"Target permanent you control gains hexproof and indestructible"*. The grant
   maps to a `pump` atom with `targetType:"creature"`; a targeted non-creature grant is a real build, but
   note `groupGrantClauseParser` ALREADY carries a `permanentsYouControl` scope — the MASS form exists, only
   the single-target one does not.

---

## ✅ BANKED 2026-07-30 — **REGENERATE REACHES NON-CREATURE PERMANENTS. GAINED 5.**
## ⚠️ CORPUS-ONLY — **ZERO SHELF MOVEMENT.** Joe stays at 847/1098. Say it plainly rather than round up.

Welding Jar · Metallurgeon · Loxodon Mender · Pteron Ghost · Reknit. Off the noun-swap queue.

### THE MECHANISM — the rule and the destroy site already agreed
**CR 701.19a** (read out of `cr_current.json`, not from memory): *"If the effect of a resolving spell or
ability regenerates a **PERMANENT**…"* — not a creature. And `spellEffects.applyDestroyEffect` consults
`regenShields` on **any** permanent it is about to destroy, with no creature gate. **The shield has always
been honoured for an artifact; nothing ever produced one**, because both the parse arm and `applyRegenerate`
stopped at "creature". Two lines, and a rules-correct effect became reachable.

⛔ The SUBTYPE arm ("regenerate target Sliver") stays creature-only — its restriction rides
`creatureSatisfiesRestrictions`, which has no non-creature path. Widening it would be a wrong target pool.

### ⭐ THE HARNESS WAS WRONG, NOT THE CODE — and the CONTROL is what proved it
I wrote the runtime targets as `{ type: "artifact" }`. Three tests failed — **including the no-shield control
that asserts the artifact DIES.** That control failing is the tell: if my change were broken, the control
would still have passed. The cast path tags every non-creature target **`type: "permanent"`** (verified in
breakageWave2's expandCastChoices note), and `applyDestroyEffect` accepts exactly creature | permanent |
planeswalker.

⭐ *A negative control that fails alongside the positive is not noise — it is the harness raising its hand.
It also sharpened the slice: the old `t.type === "creature"` gate would drop a "permanent"-tagged target just
as surely as an "artifact" one, so the resolver half was needed for the REAL shape, not a hypothetical.*

### ✅ A FIFTH BOUNDARY-MARKER PIN GRADUATED
`trunkRegenerate.test.js` listed `regenerate target artifact` and `regenerate target permanent` under
*"does NOT recognize filtered / off-type regenerate"*. Both moved to a MUST_EMIT assertion; the guard
survives aimed at what IS unmodeled — a control rider, a mass form, a colour qualifier, an uncurated noun.

**Mutation-checked: 3 seen to fail** — M1 parse arm disabled · **M2 resolver reverted ALONE: classification
stays green and only the runtime test fails**, which is this slice's whole argument · M3 noun set opened to
`[a-z]+`, caught by the uncurated-noun guard. Reverts confirmed by `git diff --stat`.

**Gates:** flip-diff **GAINED 5 / LOST 0**, no other tier moved (12914 → 12919 / 34245). 9 tests, five of
them runtime including two CREED controls (no shield → it dies; the shield is one-shot). Suite **1031 files
/ 13,068 green**, lint 0, module graph loads, MUTANT clean. **Batch 4: 80 cards.**

### ➡️ COURSE CORRECTION FOR THE NEXT SLICE
Three slices in a row have come off the corpus-wide noun-swap queue, and this one paid the shelf **nothing**.
The queue is good at finding cheap correct wins, but the standing objective is the SHELF. **Next pick should
be filtered through `shelfgap.json` first** — intersect the noun-swap candidates with the 97 one-away shelf
cards, and only fall back to corpus-only work when that intersection is empty.

---

## ✅ BANKED 2026-07-30 — **THE LAYER-7c SELF-BUFF LEARNS SUBTYPE COUNTS. GAINED 5.**
## ⭐ THE EVALUATOR ALREADY EXISTED — ONLY THE VOCABULARY REFUSED TO REACH IT.

Swordsman's Steel · Militant Inquisitor · Gatebreaker Ram · Adelbert Steiner · Raised by Wolves.
Third slice off the Joe shelf. **Captain America Shoot your Shot 70 → 71%**; Joe **847/1098**.

### ⭐ THE PROBE THAT FOUND IT — NOUN-SWAP ATTRIBUTION, a new instrument
Generalising last slice's untap-noun find: swap a permanent noun (`artifact` / `permanent` / `enchantment` /
`Equipment` / `land` / `planeswalker`) for **creature** — the best-modeled noun — across every non-native
card, leaving triggers, costs and structure intact, and see who flips. **60 corpus cards are attributable to
a missing noun somewhere.** Clustering those by their blocking SENTENCE is what named this slice's template.

| swap | attributable |
|---|---|
| artifact → creature | 18 |
| land → creature | 14 |
| Equipment → creature | 11 |
| permanent → creature | 9 |
| enchantment → creature | 7 |
| planeswalker → creature | 1 |

⭐ *Keep this probe. It converts "which noun is missing" from a hunch into a ranked list, and the 55 cards it
found beyond this slice are the next several slices' queue — no more hunting card by card.*

### THE MECHANISM — a count the runtime already computed exactly
`layers.countSelfSpecOnBoard`'s `permanentsYouControl` branch reads **`spec.cardType || spec.subtype`** and
does a word-bounded type-line scan — the identical wire the basic-land arm (Squelching Leeches, *"the number
of Swamps you control"*) has used since it shipped. Card types worked; `Equipment`, `Gate` and every tribe
did not. **Only `parseSelfCountSource` refused to produce the spec.** One arm, gated on `COUNT_SUBTYPE` — the
same curated allowlist `parseCountSource` and the team-pump scope already share — and the count was reachable.

⛔ **CREED:** that allowlist's own criterion is corpus-verified — every entry appears ONLY in the subtype
position of a type line, so `\b<Subtype>\b` can never mis-match a card type. An uncurated word returns null
and the card parks. The arm sits AFTER the card-type arm so creature/artifact/land/enchantment keep their
`cardType` wire byte-for-byte (flip-diff: **no other tier moved**).

### ⚠️ A NEW IMPORT EDGE — checked, not assumed
`staticAbilityParser` had no edge to `parseHelpers`. Added one for `COUNT_SUBTYPE` rather than duplicating a
120-entry list that would drift. Safe because parseHelpers imports **only** `keywords.js`, a zero-import leaf
this file already imports — and confirmed with the mandatory
`node -e "import './src/lib/learn/legalChoices.js'"` graph check, which exists precisely because a green
suite is not evidence the module graph still loads.

### ✅ A FOURTH BOUNDARY-MARKER PIN GRADUATED
`trunkSelfBuff.test.js` rejected *"for each Goblin you control"* with the reason **"subtype not in the
dup-free allowlist"**. That reason is now closed, so the case moved to a MUST_EMIT assertion on the descriptor
shape; the guard survives intact aimed at what IS still unmodeled — an uncurated word, a graveyard count, and
the `other` / excludeSelf form.

### ⭐ WHAT M2 TAUGHT ME ABOUT MY OWN GUARD
I wrote the qualified-count test as *"the `^…$` anchor keeps 'tapped Equipment you control' out."* **Wrong:**
the anchor's character class allows spaces, so that phrase matches the pattern fine — it is the ALLOWLIST
LOOKUP that rejects it. Mutation M2 (allowlist replaced by a bare capitalize) failed that test and named the
real guard. *Corrected in the test comment rather than left as a plausible-sounding explanation.*

**Mutation-checked: 2 seen to fail** — M1 the arm disabled (3 tests, classification AND runtime) · M2 the
allowlist gate replaced by a capitalize (both CREED guards). Reverts confirmed by `git diff --stat`.

**Gates:** flip-diff **GAINED 5 / LOST 0**, no other tier moved (12909 → 12914 / 34245). 7 tests, four of them
live layer reads (grow, shrink, opponent's Equipment not counted, a Bear is not an Equipment). Suite
**1030 files / 13,058 green**, lint 0, module graph loads, MUTANT clean. **Batch 4: 75 cards.**

---

## ✅ BANKED 2026-07-30 — **SELF-UNTAP LEARNS ITS NON-CREATURE NOUNS. GAINED 5 — ALL STAPLES.**
## ⭐ AND THE PARSER HALF ALONE WOULD HAVE BEEN A FALSE POSITIVE.

**Mana Vault** · **Staff of Domination** · **Retrofitter Foundry** · Summoning Station · Blasting Station.
Second slice off the Joe shelf. Mana Vault is in **Kinnan Mana Overload** (75 → 76%); Joe **846/1098**.

### HOW IT WAS FOUND — the shelf-gap probe, not a hunch
Ran a line-drop over **all 231 non-native cards across Joe's nine sub-bar decks**: 97 are one line from
flipping, and clustering their blockers confirmed the recon's verdict — **no shared mechanism**, the biggest
cluster is a trigger SHAPE whose payloads all differ. But the listing put *Mana Vault* next to *Brass Man*,
which already works, and the two lines are the same sentence with one word changed.

| corpus form | count | parsed before |
|---|---|---|
| `untap this creature` | 94 | ✅ since BLITZ UP-1 |
| `untap this artifact` | 15 | ❌ |
| `untap this land` / `untap this permanent` | 1 + 1 | ❌ |

⭐ *The referent is IDENTICAL in every case — `target:"self"` is `ctx.sourceId`, and `selfTargets` has handed
back a `{type:"permanent"}` entry for a non-creature source since census slice 22. **The noun is descriptive,
not a filter**: a card's own text always names its own type, and this referent can only ever be the source.*

### ⭐⛔ THE HALF THAT WOULD HAVE SHIPPED A LIE
`applyTapEffect` ends its type check with `t.type === "creature"`. **With only the parse arm, Mana Vault
classifies `native-mana` and the runtime untaps NOTHING** — the "classifies native but does nothing" trap
that combat.js's own `thatPermanent` note, two lines above the edit, was written about (an entering LAND
dropped by the same fallback). So the resolver's gate is widened by the atom's own `selfPermanent` flag —
set only by the new parse arm, so **no existing tap/untap atom's type check moves at all**.

**Mutation M1 reverts ONLY the resolver half: the runtime test fails while every tier assertion stays
green.** That is the pair the hollow-gate law asks for — a classification assertion could not have caught it,
and the runtime assertion is the reason this slice is honest rather than a +5 on paper.

### ✅ THREE BOUNDARY-MARKER PINS GRADUATED — all three named Mana Vault, none deleted
| pin | its stated reason | now |
|---|---|---|
| `selfUntapTax` coverage pin | *"draw-step self-damage + {T}:Add unmodeled; 'untap this artifact' is LOW anyway"* | last clause closed → `native-mana` |
| `selfUntapTax` parser pin | *"'untap this artifact' is NOT (why Mana Vault parks)"* | both nouns HIGH |
| `manaTierPins` MUST_NOT_OVER-CLAIM | mana ability + unmodeled residue | **moved UP to MUST_STAY_HIGH** |

⭐ *The third is the careful one: that block is a CREED guard against inflating coverage, so Mana Vault was
MOVED to the must-stay-native list rather than dropped — the guard keeps seven cards across the same distinct
residue shapes. A pin graduates when its reason is closed; it is never deleted for going green.*

**Mutation-checked: 3 seen to fail** — M1 resolver half reverted (runtime only) · M2 parse arm removed
(4 tests across two files) · M3 whole-clause anchors dropped, which credits *"you may choose not to untap
this artifact during your untap step"* — **16 corpus cards print that untap RESTRICTION**, and a containment
match would have turned every one into a free untap. Reverts confirmed by `git diff --stat`.

**Gates:** flip-diff **GAINED 5 / LOST 0**, no other tier moved (12904 → 12909 / 34245). 9 new tests, four of
them runtime. Suite **1029 files / 13,050 green**, lint 0, module graph loads, MUTANT clean.
**Batch 4: 70 cards.**

### ➡️ THE SHELF-GAP PROBE IS THE NEXT SLICE'S QUEUE
A scratch `shelfgap.mjs` dumps every non-native Joe card with its single blocking line; the **97 one-away**
entries are the working list. The clusters are still all single-mechanism, so keep expecting 1–5 a slice —
and keep picking blockers that sit NEXT TO something already modeled. That adjacency is what found this one.

---

## ✅ BANKED 2026-07-30 — **NINJUTSU REACHES THE TWO PATHS THAT NEVER CALLED IT. GAINED 3.**
## ⭐ AND THE FIRST SIZING OF THIS SLICE WAS WRONG BY 200% — CAUGHT BY THE LEDGER'S OWN RULE.

Sakashima's Student · Silver-Fur Master · A-Silver-Fur Master. **First slice off the Joe shelf-gap list**
(lead ② in the recon entry below). Shelf effect: **2 real deck slots, both in *Believe it!***; the Alchemy
rebalance is corpus-only. Joe now measures **845/1098 (77%)**, *Believe it!* **78%**.

### ⛔ THE SIZING TRAP, FIRST — a line-drop probe anchored on `/^ninjutsu\b/` reported THREE flips
Two of them were Silver-Fur Master, whose SECOND line also begins with the word *"Ninjutsu"*:

```
Ninjutsu {U}{B} (…)                                        ← the keyword line
Ninjutsu abilities you activate cost {1} less to activate. ← A REAL STATIC ABILITY
Other Ninja and Rogue creatures you control get +1/+1.
```

The probe was **deleting a real ability along with the keyword and crediting the card for text it had
removed** — the exact over-count the batch header's phrase-swap rule warns about, in a new disguise: not a
trigger swallowed by its payload this time, but *a second ability that happens to start with the same word.*
Re-anchored on the brace cost, the true count for the keyword line is **ONE**. ⭐ *A keyword-prefix anchor
collects every line that merely STARTS with the keyword, not only the cost line — the same family of error as
`^awaken` matching "Awakened Amalgam" two slices ago, and it cost a 3x over-estimate before a single edit.*

### ① THE CLONE PATH — handled-over-there is not handled-here, again
`isKeywordOnly` has credited the bare `Ninjutsu {cost}` line since the KW-NINJUTSU gate shipped. Sakashima's
Student parked at `body-only` anyway: `parseCloneSpec` requires the WHOLE oracle to be the copy clause, and
**nothing stripped the keyword line before it looked**. coverage.js already pre-strips plot / convoke /
affinity for exactly this reason — ninjutsu was simply never added.

Fixed with `stripNinjutsuCostLines` in that same pre-strip. Ninjutsu joins on its OWN precedent rather than
by widening `COST_ONLY_KEYWORD_LINE`: **it is an alternative ENTRY, not a cost reduction**, and that list's
whole argument is *"the runtime hard-casts at full cost."* Same outcome, honest reason.

### ② THE COST-REDUCER — a BENIGN MARKER, deliberately not a reducer
*"Ninjutsu abilities you activate cost {1} less to activate"* (Silver-Fur Master + its Alchemy twin — the
**only two cards in the index** with the clause) can discount exactly one thing: a ninjutsu activation. The
engine **has no ninjutsu lane at all** — grepped before building, per the header rule: no `legalChoices`
offer, no apply site, only comments citing the rationale. A price cut on an ability that can never be
activated cannot change any price.

So the clause is vacuous on the **IDENTICAL premise** that credits the keyword line itself, and it emits
`ninjutsuCostReductionNoop` beside `activatedCostReductionFloor` rather than a real `activatedCostReduction`
descriptor. ⭐ *Emitting a reducer would have fabricated a runtime hook for an ability that does not exist —
a wrong PRICE waiting to happen, which is worse than a missing effect. The equip-only variant one line above
is a real reducer because equip abilities are real.* **The two credits are COUPLED and the file says so: if
ninjutsu is ever offered, both die together and both must be revisited.**

### ✅ A HOLLOW ASSERTION CAUGHT BY ITS OWN MUTATION — the law working as designed
The Monet guard was written first as *"the real Monet card stays parked"*. **Mutation M3 loosened the start
anchor to `/^(?:[a-z]+ )?(?:commander |library )?ninjutsu …/` and all 8 tests stayed GREEN** — because Monet
parks for its OWN reasons (its ETB reads *"If Monet was ninjutsu'd"*), whether the anchor holds or not.
⭐ *A negative assertion on a card that would fail the assertion anyway proves nothing.* Rewritten to put
Monet's real printed line — `Fixed commander ninjutsu {3}{B}{G}`, a THIRD prefix the anchor does not know —
**in front of a body that WOULD flip**, so a loosened anchor now shows up as a wrong credit. M3 re-run: fails.

**Mutation-checked: 5 seen to fail** — M1 pre-strip removed · M2 reminder tolerance dropped · M3 start anchor
loosened (after the guard was made real) · M4 reducer `$` anchor dropped · M5 marker not emitted. Every revert
confirmed by `git diff --stat`, not by the marker sweep.

**Gates:** flip-diff **GAINED 3 / LOST 0**, and no other tier moved at all (12901 → 12904 / 34245). 8 tests.
Suite **1028 files / 13,041 green**, lint 0, module graph loads, MUTANT clean. **Batch 4: 65 cards.**

### ➡️ WHAT THE JOE SHELF LOOKS LIKE AFTER ONE SLICE
Both recon leads are now spent — ① miracle went with the self-exile ordering fix, ② ninjutsu here. The
recon's own finding stands: **no shared lever remains**, so the rest is nine separate grinds. Next pick
should come off the line-drop table in the recon entry (Moon-Circuit Hacker · Thousand-Faced Shadow ·
Orcish Bowmasters · Ingenious Prodigy · Satoru · Roaming Throne — one trigger each).

---

## 🎯 TARGET MOVED TO **JOE'S SHELF** (Colton, 2026-07-30) — reconnaissance done, two leads sized

> *"yup moving to joes shelf the same way — kinnan and yuriko are both cdh decks so be prepped for slow
> hard work there"*

Colton's shelf is closed; the standing objective is now **Joe's 9 sub-90 decks** (77%, 842/1098 across 11).
He is right that two of them are cEDH. The reconnaissance below says the work is single-card, but **not as
grim as "slow hard work" implies**.

### ⚠️ SHARED BLOCKERS ACROSS THE WHOLE SHELF: essentially NONE
Scanned every sub-90 deck for a blocker shared by 2+ cards. The maximum is **×2**, twice:
`Silver-Fur Master` (ninjutsu cost reduction) and `Temporal Mastery` (Miracle). Everything else is
one-card. **There is no vein left on the shelf** — confirming Colton's read, and worth knowing before
anyone goes hunting for one.

### ⭐ BUT THE LINE-DROP DIAGNOSTIC SAYS 9 OF 12 ARE **ONE MECHANISM AWAY**
Run across the Yuriko deck (*"Believe it!"*, 75%, needs 15 — identified by its Doomsday / Thassa's Oracle /
Demonic Consultation / Tainted Pact shell):

| card | drop one line → | the single blocker |
|---|---|---|
| **Sakashima's Student** | `native-clone` | **the Ninjutsu line** — the clone half already works |
| **Temporal Mastery** | `native-spell` | **the Miracle line** |
| Moon-Circuit Hacker · Thousand-Faced Shadow · Orcish Bowmasters · Ingenious Prodigy · Satoru · Roaming Throne | `native-*` | one trigger each |
| Brainstorm · Tainted Pact · Thassa's Oracle | — | single-line cards, nothing to drop |

⭐ *The gap ledger's "ONE-CARD" label describes the SHARING, not the difficulty. Nine of these are a single
mechanism from flipping, which the label does not say and the line-drop does.*

### THE TWO LEADS, SIZED — pick these up first
**① MIRACLE — 23 carriers, only 4 native, 19 NON-native.** `miracle` does not appear in `coverage.js` at
all, so it is pure residue: Temporal Mastery drops it and becomes `native-spell`. ⭐ **There is an
established precedent for crediting an alt-cast keyword** — `coverage.js:451` credits MADNESS as *"a
discard-window cast option, vacuous for the hard-cast"*. Miracle is the same shape: the card is fully
playable at its printed cost, and the miracle option is a MISSING OPTION, not a wrong play. **Verify that
rationale reads across before crediting it** — if it does, this is the biggest single item left on the
shelf.

**② NINJUTSU × CLONE composition — 50 carriers, 20 native, 30 NON-native.** Ninjutsu IS credited
(`coverage.js:480`, bare `ninjutsu {cost}` lines only) — yet Sakashima's Student goes `native-clone` the
moment the ninjutsu line is removed. So the keyword is credited in one classifier and not composed in
another. **This is the SAME shape as the bestow+trigger widening banked above** (a tier that demanded a
keyword-only body). Check which classifier rejects it before assuming a new mechanism is needed.

⚠️ **And the gap ledger's blocker attribution is suspect here as it was on Pact of Negation** — it names
`Ninjutsu {1}{U}` for Sakashima's Student, which the line-drop confirms, but it named the rider for Pact of
Negation and was wrong. **Always line-drop before building.**

---

## 🏁 **COLTON'S SHELF IS CLOSED** 2026-07-30 — `cdh` 90/100, **"below the bar: none — every deck is at 90%+"**

Springheart Nantuko landed and the objective this whole run was pointed at is **met**:

| deck | |
|---|---|
| Slivers 100% · Vihaan 96% · Omnath 93% · Zaxara 92% · Earth Bent 91% · Mothman 90% · **cdh 90%** | ✅ all ≥ 90 |

**colton: 94% (470/499 across 5 decks) — below the bar: NONE.**

### ⚠️ THE BUG THAT COST A REVERT AND HALF A SESSION — A FIELD-NAME COLLISION
The conditioned payment first carried its gate as **`condition`**. `runEffectProgram` **already owns that
field name** on an atom: it is a SPELL-RIDER board query run through `evaluateInterveningIf`, and

```js
if (atom.condition && evaluateInterveningIf(...) !== true) continue;   // SKIP THE ATOM
```

so an atom whose `condition` that reader cannot parse is **skipped entirely**. The payment therefore
vanished: **no pause, no tokens, no error, an empty log.** Renamed to `payCondition`; the collision is
documented at both ends.

⭐ **AND THE FAILURE MODE LIED ABOUT ITS OWN CAUSE.** A silently-skipped atom looks exactly like a broken
test harness — so I diagnosed "unproven runtime", reverted a build that was 95% correct, and banked a
WRONG cause. It took a direct `resolveAtom` probe (which worked) against `runEffectProgram` (which did not)
to localise it. *When a resolver works in isolation but not through its driver, the driver is doing
something to the atom — read the driver's loop before blaming the harness.*

✅ **The revert was still right.** An unproven runtime must not ship, and the metric said 90% both times.
What was wrong was the DIAGNOSIS, not the decision — and correcting it in the ledger is what made this
rebuild take one pass.

### THE BUILD
`copySource:"attached"` (reads the source's `attachedTo` live at resolution) · `payCondition` on the
optional payment · `elseAtoms` carried into the pending choice · the settler's payoff loop **extracted into
a shared branch helper** so the fallback inherits the same WI-3 mid-branch-pause guard instead of a second
copy that would drift.

Matched as ONE clause before the splitter: *"that creature"* is the attached host — a referent reachable
only through this anchored shape, since a general rewrite would mis-copy across the corpus — and the Insect
is the payment's ELSE, not a third effect. **Exactly one token on every path**, all four asserted.

**Gates:** 8 tests, every one a runtime fact (which token, how many, whose mana). **Six mutations seen to
fail**, including *copies Springheart not the host*, *declining makes no token*, and *both branches run →
two tokens*. Suite **1023 files / 13,008 green**, lint 0, MUTANT clean. Commit `985c15a7`.

**Batch 4: 46 cards.**

### ➡️ WHAT THE TARGET IS NOW
Colton's shelf is done, so the standing objective needs a new pointer. The obvious candidate is **Joe's
shelf: 77% across 11 decks, 9 below the bar** (Dragons 80% · Jurassic Ramp 78% · Believe it! 75% · Kinnan
75% · Hulk Smash 74% · Wolverine 73% · Kellan 72% · Captain America 70% · Halfshell 66%). **That is
Colton's call, not mine** — flagged here rather than assumed.

---

## ✅ BANKED (batch 4) 2026-07-30 — **BESTOW MAY CARRY A NATIVELY-ROUTING TRIGGER. GAINED 2.**
## ⛔ AND SPRINGHEART WAS BUILT, MEASURED AT **cdh 90%**, THEN REVERTED — read this before rebuilding it.

Herald of Torment · Crystalline Nautilus.

### THE WIDENING (kept)
`isNativeBestow` condition (3) demanded a **keyword-only** creature-mode body, parking every bestow card
with a triggered ability — even ones the engine already routes. The aura mode is untouched by a self-body
trigger and the creature mode is exactly what `triggerRoutesNatively` validates, so the modes compose.
Still all-or-nothing: every trigger must route AND the body with its trigger LINES removed must be
keyword-only.

⭐ **Whole LINES, not `sourceText`.** A descriptor's `sourceText` is only the trigger's HEAD — it carries
neither the ability-word label (*"Landfall — "*) nor any later sentence of the effect. A substring strip
leaves debris that is not keyword-only, so the card parks **for the wrong reason**. A printed trigger owns
its line; the line is the unit.

✅ **Fourth BOUNDARY-MARKER pin graduated this session** — `bestow.test.js` listed Herald of Torment as
"trigger residue". Re-pointed; the neighbouring cases still guard unmodeled aura bonuses and non-routing
triggers.

---

### ⛔ SPRINGHEART: THE SHELF WAS CLOSED, AND I BACKED IT OUT
The build worked. `measure-coverage` printed **`cdh 90/100`** and **"below the bar: none — every deck is at
90%+"**. It is reverted anyway, and the reason is the only one that matters:

**I could not prove the RUNTIME.** The test harness never got the payment choice to surface, so nothing
demonstrated that the token is created, that it copies the ATTACHED creature rather than Springheart, or
that exactly ONE token appears instead of two or none. A card that classifies native but does not play is
the precise failure this whole run exists to prevent — shipping a 90% on an unverified runtime would have
made the shelf number a lie.

⭐ *The flip-diff and the shelf metric BOTH said done. Neither can see whether the effect happens. That is
the entire lesson of this session, and it applied hardest to the card I most wanted to finish.*

### ✅ CAUSE FOUND (2026-07-30, after the revert) — IT WAS NOT THE HARNESS

Tested both harness shapes against an EXISTING optional-payment clause, no rebuild needed:

| harness | pendingChoice surfaced? |
|---|---|
| the working file's shape (duel state, land with `{T}: Add {G}.`, return used directly) | ✅ yes |
| MY shape (commander state, bare basic land, `out?.state ?? out`) | ✅ **also yes** |

So the board shape and the unwrapping were both fine — which means the SPRINGHEART PROGRAM was empty when
it ran. The suspect is concrete: I built it with **`const PROGRAM = parseEffectClause(...)` at MODULE SCOPE**,
which executes at import time — potentially *before* `parser.js`'s `registerClauseParser` calls at the
bottom of that module have run. The codebase already warns about this initialisation-order hazard
("an atoms module must not import parser.js, TDZ hazard").

⭐ **Next attempt: build the program INSIDE the test body, never at module scope.** That turns the blocker
into a one-line change. Re-apply the build exactly as specified two entries above, then assert LIFE-LEVEL
runtime facts (one token, the right token, on all four paths) before believing any flip.

⚠️ *I spent the tail of a session concluding "the runtime is unproven" when the actual fault was a test
file's module-scope initialisation. The revert was still correct — an unproven runtime must not ship — but
the DIAGNOSIS was wrong, and a wrong diagnosis banked as fact is how the next attempt starts in the wrong
place. It is corrected here rather than left standing.*

### ⭐ THE ORIGINAL (SUPERSEDED) LEAD — copy the harness that already works
`src/lib/learn/optionalManaPayment.test.js` drives this exact atom successfully. Two divergences in my
version, either of which could be the whole problem:
1. it uses **`runEffectProgram(...)`'s return value DIRECTLY as the state** (`paused.pendingChoice`), where
   mine unwrapped it as `out?.state ?? out`;
2. its lands carry an **explicit `{T}: Add {G}.` oracle** (`{ name: "Forest", type: "Land", oracle: "{T}: Add {G}." }`),
   where mine were bare basics with no mana ability.
Its `ompObject` helper is the canonical stack-object shape. **Start by making a Springheart test that is a
copy of that file's harness**, and only then re-apply the build (matcher + `copySource:"attached"` +
`condition` + `elseAtoms` + the settler branch helper — all specified in the entry above this one).

⚠️ The settler reads `ctx.sourceId` off `pendingChoice.resume`, which ONLY the program path sets — a bare
`resolveAtom` leaves it null and the paid branch silently makes no token. That is a real property of the
code, not a test artifact, and any harness must go through `runEffectProgram`.

**Suite 1022 files / 13,000 green**, lint 0, MUTANT clean. Commit `20578e4f`. **Batch 4: 45 cards.**
**`cdh` 89% — one card out, and that card is Springheart.**

---

## 🎯 THE LAST CARD ON COLTON'S SHELF — **SPRINGHEART NANTUKO, fully specified, ready to execute**

`cdh` is **89/100**. This ONE card closes Colton's entire shelf (every other deck of his is already over the
1.0 bar). Diagnosed to the seam; not started, because the last piece is a refactor of the pause SETTLER and
a half-refactored settler is worse than an unbuilt card.

### WHAT ALREADY WORKS — verified, not assumed
Dropping the landfall line leaves **`native-aura`**: bestow and *"Enchanted creature gets +1/+1"* are done.
The whole remaining gap on the shelf is **one printed line**:

> *Landfall — Whenever a land you control enters, you may pay {1}{G} if this permanent is attached to a
> creature you control. If you do, create a token that's a copy of that creature. If you didn't create a
> token this way, create a 1/1 green Insect creature token.*

| piece | state |
|---|---|
| the landfall trigger | ✅ detected (`ev=landfall`, `scope=landYouControl`) |
| `you may pay {1}{G}. If you do, <effect>` | ✅ `optional-mana-payment` exists |
| `create a 1/1 green Insect creature token` | ✅ `create-token` |
| `create a token that's a copy of …` | ✅ `create-token-copy` exists — **45 native carriers** |
| **the ATTACHED referent** (`that creature`) | ⛔ `copySource` has self / triggering / target, not attached |
| **the payment CONDITION** (`if this permanent is attached…`) | ⛔ the atom has no condition field |
| **the FALLBACK** (`if you didn't create a token this way…`) | ⛔ the atom has no else-branch |

### THE BUILD, IN ORDER — and the design decision is already made
1. **A WHOLE-CLAUSE template matcher** for this exact printed line (the Lifeblood Hydra pattern). ⛔ Do NOT
   add a general `that creature → attached` referent: *"that creature"* means something different on almost
   every other card, and a general arm would mis-copy. Anchored to the one printed shape.
2. `copySource: "attached"` in `atoms/tokenCopy.js` — resolve via the source permanent's `attachedTo`.
3. ⭐ **ALWAYS PAUSE; carry `available`.** Do not skip the offer when unattached — the **reflexive-sac atom in
   the same file already establishes this exact pattern** (*"a false-`available` pause still surfaces — the
   player/AI must decline since you can't sacrifice what you don't have"*). `available` = attached AND
   affordable. This keeps the resolver from having to run sub-atoms itself.
4. `elseAtoms` carried into the pending choice.
5. **The settler (`resolveOptionalManaPaymentChoice`, runProgram ~1114).** Its payoff loop carries real
   pause-chaining logic (a mid-payoff pause must not drop the tail — WI-3). **Extract that loop into a helper
   and call it for `effectAtoms` on paid / `elseAtoms` on decline** rather than duplicating it; two copies of
   that logic WILL drift.

### GATES THE BUILD MUST CARRY
- attached + pay → a token copy of the **attached** creature (not of Springheart, not of a random creature)
- attached + decline → the 1/1 Insect, and **exactly one** token — never both
- **not** attached → the Insect, and the payment must not be payable
- the copy is of the creature it is attached to at RESOLUTION, not at trigger time

---

## ✅ BANKED (batch 4) 2026-07-30 — **ADAPT-IGNORES-COUNTERS. GAINED 1. ⭐ `cdh` 88% → 89% — ONE CARD LEFT.**

Biomancer's Familiar. *"{T}: The next time target creature adapts this turn, it adapts as though it had no
+1/+1 counters on it."* (CR 701.46a, verified.)

### ⭐ THE LINE-DROP DIAGNOSTIC PICKED THE TARGET, AND IT WAS NOT THE OBVIOUS ONE
Running it across all six `cdh` "composites" found **two cards with exactly ONE blocker each** — and `cdh`
needs exactly two:

| card | drop a line → | remaining blocker |
|---|---|---|
| **Biomancer's Familiar** | `native-static` | the adapt-modifier ✅ **BUILT** |
| **Springheart Nantuko** | `native-aura` | the landfall line — **bestow already works** |
| Deflecting Swat · Wan Shi Tong · Hidden Strings · Mindbreak Trap | still blocked either way | 2+ mechanisms each |

⭐ *"Composite" in the gap ledger means "more than one line is involved", NOT "more than one line is
missing". Two of six were one build away and the label hid it.*

### THE SEAM WAS ALREADY WAITING
`applyAdapt`'s own comment explained that adapt re-reads the LIVE +1/+1 count rather than latching — and
**named Biomancer's Familiar as the reason**. The build fills the seam the earlier slice described.

One stamp enforces both halves: `_adaptIgnoreTurn` records the turn granted; `applyAdapt` honours it only
while the turn matches and **consumes it on use**. So *"the NEXT time"* is real (a second adapt the same
turn gets the gate back) and a stale stamp is inert without a cleanup hook. Mutations for **fires-forever**
(the CR-forbidden direction the comment warns about) and **stale-stamp-still-works** both fail; 5 of 5 do.

### ✅ A THIRD BOUNDARY-MARKER PIN GRADUATED
`activatedCostReduction.test.js` pinned this card `body-only` **because** the adapt-modifier was unmodelled.
Re-pointed to `native-mixed`, still guarding that the reducer ALONE is not enough for `native-static`.
That is three pins this session that recorded "not built yet" and correctly became assertions that it is.
*A boundary marker is a promise to come back, not a verdict.*

**Gates:** 11 tests. Suite **1021 files / 12,994 green**, lint 0, MUTANT clean. Commit `fc5b1838`.

**Batch 4: 43 cards. ⭐ `cdh` 89% — ONE card from the 1.0 bar, and it is SPRINGHEART NANTUKO: bestow and the
+1/+1 line already work, so the whole remaining gap on Colton's shelf is one landfall line
(optional pay + attached-check + copy-token + fallback token).**

---

## ⛔ FOUNDATIONAL GAP FOUND 2026-07-30 — **CROSS-SEAT ZONE TRANSFER DOES NOT EXIST. Ragavan and 22 others sit behind it.**

Followed my own banked build order (cast-path plumbing FIRST) and found the wall is one level deeper than
the revert note said. **Stopping the Ragavan line here** — this is an engine capability, not a shelf slice.

### THE DISTINCTION THAT MATTERS
| operation | supported? | example |
|---|---|---|
| writing to **another seat's own** zones | ✅ yes | milling an opponent — `moveCardToZone({playerId: opp, library → graveyard})` |
| **transferring** a card from seat A's zone to seat B's | ⛔ **no** | casting a card out of an OPPONENT's exile |

`moveCardToZone(state, { playerId, fromZone, toZone, cardId })` takes **one** `playerId` — source and
destination are always the same seat. There is no cross-seat transfer primitive anywhere in the engine, and
`actionsPlayImpulseFromExile` / the dispatcher's splice are both hardcoded to the acting player's own zone.

So Ragavan's two halves are wildly different in cost:
- **exile the top card of THAT PLAYER's library** → easy, already expressible (a same-seat write on their zones)
- **"until end of turn, you may CAST that card"** → needs a cross-seat transfer, plus an owner threaded
  through the cast path, the zone splice, and the action layer

⭐ *"Write to another player's zone" and "move a card between players' zones" look like the same capability
and are not. The first is everywhere in this engine; the second is nowhere.*

### THE REACH — measured, and it is why this is worth doing properly later
**23 corpus carriers, ALL non-native**, print a foreign-library impulse: Brainstealer Dragon · Vaan, Street
Thief · Daxos of Meletis · Stolen Strategy · Court of Locthwain · Circu, Dimir Lobotomist · Grenzo ·
Ramirez DePietro · Rashmi and Ragavan · Mindleecher · Predators' Hour · Rogue Class … plus Ragavan.

Like the LEAD-form composition, **the primitive alone flips 0** — each carrier still needs its own parse
work. But unlike a parse arm, this one is load-bearing: `moveCardToZone` is the most-used function in the
engine, and widening it deserves its own slice with its own gates, not a corner of a shelf push.

### ⚠️ CONSEQUENCE FOR THE SHELF — `cdh`'s last two cards are NOT cheap
With Ragavan parked, the remaining `cdh` candidates are:
- **Biomancer's Familiar** — one blocker, an adapt-REPLACEMENT (*"the next time target creature adapts this
  turn, it adapts as though it had no +1/+1 counters"*). Check whether adapt itself is modelled first.
- **Springheart Nantuko** (bestow + landfall + optional pay + copy-token + fallback) · **Chain of Vapor**
  (bounce + opponent-sacrifices-a-land + SPELL COPYING) · 6 composites.
- ⛔ refused: Valley Floodcaller · Veil of Summer · Vibrance.

**So `cdh` 88% → 90% is two real mechanism builds, not two slices.** Colton's other four decks are already
over the bar; this one deck is the whole remaining 1.0 gap on his shelf, and it should be planned as such
rather than picked at.

---

## ⛔ STARTED, THEN REVERTED 2026-07-30 — **RAGAVAN: the parse was the easy 80%, and the last 20% is CAST-PATH plumbing**

Built four of the six pieces, hit the real blocker, and **reverted rather than ship a hollow native.**
Recorded in full so the next attempt starts from the wall, not from the parser.

### WHAT WAS BUILT AND WORKED
| piece | done |
|---|---|
| the `create a Treasure token AND <impulse form>` compound → an ATOM PAIR | ✅ |
| library owner `that player's` → `libraryOwner:"damagedPlayer"` | ✅ |
| verb `cast` alongside `play` | ✅ |
| referent gate pinning the owner to combat-damage events | ✅ |
| resolver splitting OWNER (whose deck is exiled) from CONTROLLER (who may cast) | ✅ |

### ⛔ THE WALL: THE CARD SITS IN THE OPPONENT'S EXILE AND NOTHING CAN CAST IT
`actionsPlayImpulseFromExile` scans **`state.players[playerId].exile`** — the acting player's OWN zone — and
`actionDispatcher`'s splice is likewise hardcoded to `action.playerId`'s zone. A card exiled off an
opponent's library correctly lands in **their** exile, where the controller's action layer cannot see it.
Making Ragavan real therefore needs an OWNER threaded through the cast path and the zone splice —
correctness-critical plumbing that deserves its own slice.

### ⭐ THE THREE ENDINGS, AND WHY ONLY ONE IS HONEST
- **Put the card in the CONTROLLER's exile.** Casting would work today. But the container IS the ownership
  model here, so the card would resolve into the wrong player's graveyard afterwards — the wrong-owner class
  of bug this run has caught four times.
- **Exile correctly, never offer the cast.** Declining an optional *"you may"* is a legal line, so nothing
  would be rules-illegal — and that is exactly what makes it dangerous. `classifyCard` would say **native**
  while the entire reason the card is played never fires. Same hollow shape the look-at-hand slice was built
  to avoid, and Ragavan's impulse cast is not a rider, it is the card.
- ✅ **Revert, and write down where the wall is.** Taken.

⭐ *A parse that lands four of six pieces is not "nearly done" — the remaining pieces are the ones that
decide whether the flip is real. The flip-diff would have shown GAINED 1 either way.*

### FOR THE NEXT ATTEMPT
The build order is: **cast-path owner threading FIRST** (`actionsPlayImpulseFromExile` scanning other seats'
exiles for a `_impulseCaster` stamp + the dispatcher splicing from the stamped owner's zone), and only then
the parse work above, which is straightforward and now specified line by line. Corpus reach stays **1** —
Grenzo, Havoc Raiser prints the same exile line inside a modal `choose one —` with a spend-mana-as-though
rider and is a separate build.

---

## 🔍 DIAGNOSED, NOT STARTED — **THE LAST TWO `cdh` CARDS, both now reduced to ONE mechanism each**

`cdh` is at **88%** and needs **2**. Every remaining candidate was diagnosed by DROPPING each printed line
and re-classifying — which is how you learn what already works, and both answers were a pleasant surprise.

### ✅ RAGAVAN, NIMBLE PILFERER — **Dash already works**
Dropping the combat-damage trigger line leaves **`native-body`**. So the keyword is fine and the card has
exactly ONE blocker: the trigger payoff *"create a Treasure token and exile the top card of that player's
library. Until end of turn, you may cast that card."*

| piece | state |
|---|---|
| `create a Treasure token` | ✅ parses |
| `exile the top card of YOUR library. Until end of turn, you may play that card` | ✅ parses → `impulse-exile` |
| **`that player's`** library (the damaged player) | ⛔ the owner referent is unmodelled |
| **`cast`** rather than `play` | ⛔ the matcher is anchored on `play` |
| **the compound** — `create a Treasure token AND <impulse form>` | ⛔ shatters; `low`, atoms `[]` |

⚠️ **FOUR pieces for TWO cards.** The impulse resolver reads `players[controller].library` directly, so the
source library must be parameterised while the play permission stays with the CONTROLLER — and the owner
referent then needs pinning to combat-damage events, the `damagedPlayer` discipline already in the file.
Corpus reach: the exact wording is **2** (Ragavan + Grenzo, Havoc Raiser); the looser family is 15 carriers
/ 9 non-native, but those are separate shapes.

### ✅ BIOMANCER'S FAMILIAR — **the cost-reduction static already works**
Dropping the activated ability leaves **`native-static`**, so *"Activated abilities of creatures you control
cost {2} less to activate"* is modelled. The single blocker is the other line: *"{T}: The next time target
creature adapts this turn, it adapts as though it had no +1/+1 counters on it."* — an adapt-REPLACEMENT,
one of the most niche shapes on the shelf, and worth checking whether adapt itself is modelled before
costing it.

### ⛔ STILL REFUSED, do not re-pick
`Valley Floodcaller` (3 blockers) · `Veil of Summer` (3 mechanics, all 0-attributable) · `Vibrance`
(mana provenance). `Springheart Nantuko` (bestow + landfall + optional pay + copy-token + fallback token)
and `Chain of Vapor` (bounce + opponent-sacrifices-a-land + SPELL COPYING) are each larger than the Pact
cycle was.

⭐ **The line-drop diagnostic is the cheap half of every one of these.** Two cards that read as intimidating
multi-ability builds turned out to have one working half apiece — and knowing WHICH half works is most of
the estimate.

---

## ✅ BANKED (batch 4) 2026-07-30 — **THE PACT CYCLE. GAINED 4, LOST 0. ⭐ `cdh` 87% → 88% — TWO CARDS LEFT.**

Pact of Negation *(the shelf card)* · Slaughter Pact · Summoner's Pact · Pact of the Titan.

### ⚠️ THE SHELF LEDGER'S BLOCKER ATTRIBUTION WAS WRONG, AND THE SWAP CAUGHT IT
The ledger flagged Pact of Negation as `shared×2` on the rider line. Replacing the rider with a known-good
delayed trigger flipped **0 of 6**. **Two** gaps had to close together — removal-attribution names ONE line
and stops. *Removal says "this line is involved"; only a swap says "this line is sufficient".*

| gap | reach |
|---|---|
| **LEAD-form composition** | 46 non-native instants/sorceries carry the shape — **unlocks 0 alone** |
| **the pay-or-lose rider** | the Pact cycle |

`matchDelayedTrigger`'s TRAIL branch already accepted leading sentences; only the **LEAD** word order was
anchored to the whole clause, so every *"&lt;effect&gt;. At the beginning of your next upkeep, &lt;rider&gt;"*
card fell through. ⭐ *A prerequisite that measures 0 on its own is still worth building — but only
alongside the thing it unblocks, and the ledger should say so or someone will build it as a slice.*

### ⛔ THE FAILURE BRANCH IS THE CARD
Paying when able is **not** a policy guess — the alternative is losing outright, so there is exactly one
rational line. What earns the gates is the other branch: **an unpayable Pact sets `lostGame`**, which is the
entire reason these cost `{0}`. Mutations that fail-open on an unpayable Pact, or price an unmodelled cost
as free, both **fail**.

The cost reader is deliberately **narrower** than `legalChoices.parseManaCost` — which cannot be imported
into an atom without closing a cycle (legalChoices → atoms/shared). Plain generic + coloured pips only;
`{X}`, hybrid, Phyrexian and Guild Pact's *"one mana of each of the chosen colors"* are refused, so those
cards stay on the Arbiter rather than being **underpaid**. Intervention Pact and Guild Pact correctly did
not follow the other four in.

### ⚠️ THE BUG THAT HID BEHIND A PERFECT REGEX — and the shell trap that hid the measurement
1. The clause parser lowercases before matching, so pips arrived as `{u}`. `pipsToCost` tested `[WUBRGC]`
   **uppercase only** → null → the whole cycle stayed on the Arbiter **while the regex matched perfectly**.
   An isolation probe of the regex PASSED and proved nothing, because it stopped one step short of the
   failure. ⭐ *Probe the whole path to the value you care about, not the step you suspect.*
2. ⚠️ **A constructed `new RegExp("\s+")` loses its backslashes in this environment's shell heredocs.**
   That silently turned an earlier run of the composition measurement into a **false zero** — I nearly
   recorded "no carriers" as a finding. Verified by printing `regex.source`: `^(.+.)s+…`. **Measurement
   scripts now use regex LITERALS and are written with the Write tool, never a heredoc.** Same trap has now
   cost four separate anchors this run.

**Gates:** 13 tests, the death branch leading. Five mutations seen to fail. Suite **1020 files / 12,983
green**, lint 0, MUTANT clean. Commit `ea990601`.

**Batch 4: 42 cards. ⭐ Colton's shelf: `cdh` 88% — TWO cards from the 1.0 bar; every other deck of his is
already over it.**

---

SHELF RE-MEASURED 2026-07-30 — **COLTON IS AT 94%. ONE DECK, THREE CARDS FROM THE BAR.**

Re-ran `measure-coverage.mjs` against the live AppData decks after 38 cards of engine work. The objective
is the SHELF, not corpus %, and it has moved:

| owner | shelf | below the bar |
|---|---|---|
| **colton** | **94%** (467/499, 5 decks) | **`cdh` 87% — needs 3 cards** |
| joe | 77% (842/1098, 11 decks) | 9 decks |

Slivers 100% · Vihaan 96% · Omnath 93% · Zaxara 92% · Earth Bent 91% · Mothman 90%. Corpus is 37.6%;
top-1000-played is 74.5%.

**⭐ THREE CARDS PUT COLTON'S ENTIRE SHELF OVER THE 1.0 BAR.** That is the cheapest remaining objective on
the board and it should be picked up before any more corpus work.

### THE `cdh` GAP, PER CARD (from `shelf-gap-ledger.mjs`)
`Pact of Negation` · `Springheart Nantuko` · `Valley Floodcaller` ⛔ · `Chain of Vapor` ·
`Biomancer's Familiar` · `Veil of Summer` ⛔ · `Ragavan` · + 6 composites (Deflecting Swat, Wan Shi Tong,
Hidden Strings, Invasion of Ikoria, Vibrance ⛔, Mindbreak Trap). The ⛔ marks are already on the refusal list.

---

## 🔍 DIAGNOSED, NOT STARTED — **THE PACT CYCLE: ceiling 4, and it needs THREE mechanisms**

Pact of Negation is the shelf card, and the shelf ledger flagged its blocker as `shared×2` — the delayed
rider. **The swap says otherwise**, and the difference is the whole lesson of this entry.

### ⚠️ THE LEDGER'S BLOCKER ATTRIBUTION DISAGREED WITH THE SWAP
Replacing the rider with a known-good delayed trigger (`At the beginning of your next upkeep, draw a card.`)
flipped **0 of 6** Pacts. The ledger attributes blockers by REMOVAL; the swap keeps the card whole. *Removal
says "this line is involved"; only a swap says "this line is sufficient".* On this card they disagree.

### ⭐ THE FIND: A DELAYED RIDER CANNOT COMPOSE WITH ANY PRECEDING CLAUSE
Verified synthetically — each of these is `low`, atoms `[]`:

  `Draw a card.` + a delayed rider · `Create a 4/4 red Giant creature token.` + a delayed rider ·
  `Counter target spell.` + a delayed rider

…while the delayed rider **alone** parses `high` → `schedule-delayed`. `schedule-delayed` is a WHOLE-CLAUSE
parse; it cannot be one sentence among several.

⛔ **And measured across the corpus, fixing composition ALONE pays ZERO**: of 120 non-native instants and
sorceries carrying a delayed rider, there is **not one** where the rest is native and the rider parses. So
this is a PREREQUISITE, never a slice of its own.

### THE PACT BUILD, SIZED
| | |
|---|---|
| **ceiling** | **4 cards** — Pact of Negation, Slaughter Pact, Pact of the Titan, Summoner's Pact |
| verified | all four first clauses ALREADY classify `native-spell` standalone |
| out of scope | Intervention Pact (damage-prevention shield) · Guild Pact (choose-two-colours mana) — both `arbiter-spell` on their first clause alone |
| needs | ① delayed-rider **composition** ① a **pay-or-lose** delayed effect ③ the AI/human **payment decision** |
| exists already | the delayed-trigger scheduler; a `lose-game` effect in `atoms/winGame.js` |

⚠️ **Three mechanisms, one of which is a real DECISION** (pay the cost or lose the game outright) — and a
wrong default there does not misprice a card, it ends the game. Deliberately left for a cold start rather
than begun at the tail of a session; the discard event was banked the same way and went smoothly next
morning.

---

## 📉 THE INTERVENING-IF TAIL, SWEPT END TO END — **and the honest answer is that it is spent**

Before building anything I swap-measured **every** unparseable intervening-if shape in the corpus (replace
the condition with a known-good one, keep the card otherwise intact). The result is the strategic finding
of this session:

> **105 attributable cards, spread across 87 distinct shapes, out of 387 shapes total.**
> **The largest single shape is 5 — and it is already REFUSED.**

| attr | shape | verdict |
|---|---|---|
| **5** | `{M} was spent to cast it` | ⛔ **REFUSED** — per-cast mana provenance, pinned twice already |
| 3 | `you haven't cast a spell from your hand this turn` | needs per-turn cast-BY-ZONE tracking (pinned, see below) |
| 3 | `your team controls another warrior` | team/2HG semantics |
| **3→2** | `you control an artifact and an enchantment` | ✅ **BUILT** (the sweep counts INSTANCES; Naomi's *enters-or-attacks* is two) |
| 2 each | 8 further shapes | … then a 1-card tail, 70+ shapes deep |

⭐ **Two-thirds of the tail's shapes are worth ONE card.** At a slice apiece — each needing its own reader,
its own gates, its own mutations — this surface is no longer a lever. Recorded so nobody re-derives it.

⚠️ **And note the sweep counts trigger INSTANCES, not cards.** The conjunction measured 3 and paid 2,
because a card whose trigger reads *"enters or attacks"* contributes two descriptors. *An instance count is
an upper bound on cards; only the flip-diff is the card count.*

---

## ✅ BANKED (batch 4) 2026-07-30 — **ELIDED-SUBJECT "YOU CONTROL X AND Y". GAINED 2, LOST 0.**

Naomi, Pillar of Order · Kami of Terrible Secrets.

*"if you control an artifact and an enchantment"* drops the repeated subject — it means *you control an
artifact AND you control an enchantment*, so the right half is the bare noun `an enchantment`, which is not
a condition at all. Each half is rebuilt into a full condition and handed back to the same evaluator, which
**re-gates the noun against the curated vocabulary** (a DESIGNATION like *"a commander"* is refused there,
so the conjunction inherits the refusal instead of answering false).

### ⛔ WHY THIS IS NOT A GENERIC " and " SPLITTER — measured, then refused
The disjunction splitter already exists, so the symmetric build was the obvious move. It is worth **zero**:
**all 18** AND-shaped unparseable conditions have a half that does not read standalone. And it would be
actively dangerous — several conditions carry an **internal** " and " that must never be split:

`your devotion to white and black is seven or greater` · `you gained and lost life this turn` ·
`you've cast three or more instant and sorcery spells this turn`

Splitting those hands the evaluator nonsense halves and gets a confident answer back. All pinned; the
loosened-anchor mutation that would split them **fails**. ⭐ *The existence of a symmetric mechanism is not
evidence that its mirror is worth building — measure the mirror separately.*

**Gates:** 11 tests. Five mutations seen to fail. Suite **1019 files / 12,970 green**, lint 0, MUTANT clean.
Commit `117f4f9c`.

**Batch 4: 38 cards.**

---

## ✅ BANKED (batch 4) 2026-07-30 — **"IF YOU DESCENDED THIS TURN" (CR 700.11). GAINED 5, LOST 0.**

Child of the Volcano · Enterprising Scallywag · Deep Goblin Skulltaker · Canonized in Blood · Ruin-Lurker Bat.

**CR 700.11** (verified, not recalled): a player descended iff a **PERMANENT CARD** was put into their
graveyard from anywhere this turn. Tallied at `recordGraveyardEvents` — *the single graveyard-entry
chokepoint every entry site already routes through* — reusing layers' existing permanent-card predicate
rather than duplicating the regex, reset for every seat at untap beside its siblings. **Counted, not
flagged**: The Mycotyrant reads *"the number of times you descended"*, so a boolean would need widening
later and a count answers both questions.

### ⛔ THE RISK WAS THE TALLY NEXT DOOR
`gyEnteredThisTurn` already counts every CARD entering a graveyard. Descend is **strictly narrower**: an
instant or sorcery raises that counter and is *not* a descend; a dying token is not a card at all
(CR 111.7). Every carrier is an end-step rider meant to reward **losing permanents** — so binding the
neighbouring counter would have fired all five off a cantrip. That substitution is one of the five
mutations, and all five fail. ⭐ *When a new metric sits one field away from an existing one, the mutation
that swaps them is the only test that matters.*

### ✅ A DEAD GUARD REMOVED — and its COMMENT was the actual defect
My first draft added a missing-seat check returning `null`. `evaluateSingleCondition`'s **opening guard
already returns `false`** for a gone controller, so the line was unreachable — and worse, its comment
documented a `null` return *this function never makes*. Caught because a test asserted `toBeNull()` and got
`false`. ⭐ *Dead code is cheap; dead code carrying a confident wrong explanation is what the next reader
believes.*

### ⭐ TWO REFUSAL PINS RE-POINTED, NOT DELETED — and one of them was SCAFFOLDING
Building this broke two pins from an earlier slice, in two different ways:

| pin | why it broke | resolution |
|---|---|---|
| `conditionTurnEventReaders` still-parks list | a **BOUNDARY MARKER**: "not tracked yet" | descend **graduated** — the pin now asserts it IS readable |
| `conditionDisjunction` unreadable-half | descend was its **STAND-IN** for an unreadable condition | stand-in **migrated** to `you created a token this turn` |

⚠️ **The second is the one worth remembering.** That test guards disjunction handling; it merely BORROWED
descend as an unreadable phrase. When descend graduated, the test did not fail about disjunctions — it
failed about its own scaffolding, in a file with nothing to do with this slice. ⭐ *A stand-in phrase is a
silent dependency on something staying unbuilt, and it always breaks somewhere unrelated. Note the
migration in-file so the next person does not "fix" it by deleting the guard.*

**Gates:** 13 tests, negatives leading (instant / sorcery / token / wrong seat / cross-turn leak). Five
mutations seen to fail. Suite **1018 files / 12,959 green**, lint 0, MUTANT clean. Commit `2371cf58`.

**Batch 4: 36 cards.**

---

## ✅ BANKED (batch 4) 2026-07-30 — **"IF YOU CAST IT FROM YOUR HAND". GAINED 5, LOST 0.**

Furnace Dragon · Reiver Demon · Angel of the Dire Hour · Wakening Sun's Avatar · Coal Stoker.

### ⭐ THE PHRASE-SWAP EARNED ITS KEEP BEFORE A LINE WAS WRITTEN
The census listed five intervening-if candidates. Swapping each condition for a known-good one:

| candidate | census | **attributable** |
|---|---|---|
| `you cast it from your hand` | 15 | **5** ✅ built |
| `you descended this turn` | 9 | **5** ⭐ next |
| `this permanent is an enchantment` | 14 | **0** ⛔ |
| `this card is in your graveyard` | 9 | **0** ⛔ |
| `it had counters on it` | 7 | **0** ⛔ |

**Three of five measure ZERO.** Building the top-of-census candidate would have bought nothing at all.
*The census ranks CANDIDATES; only the swap ranks value — and the gap between the two is not a small
correction, it is three out of five.*

### THE BUILD — four one-line hops, no new context plumbing
`action.fromZone` → `PERMANENT_ETB` params → `enterPermanent` opts → **stamped on the permanent beside
`wasCast`**. The evaluator reads it off the entering permanent directly, so unlike the discard slice this
needed **no trigger-context threading at all** — the `wasCast` arm had already proved that route.

### ⛔ THE FAIL-SAFE DIRECTION IS THE ENTIRE POINT
Every carrier is a **board wipe** whose printed cost is that you had to hard-cast it. Reiver Demon destroys
all nonartifact nonblack creatures; Furnace Dragon exiles ALL artifacts. Three ways this could have gone
wrong, all mutation-covered:
- **stamp defaults to `"hand"`** → every reanimated copy fires the sweep for free
- **evaluator ignores the zone** → a flashback/exile cast fires it
- **evaluator fails open on an absent stamp** → tokens and blinks fire it

Only the CAST branch of the dispatcher sets the value, so a permanent arriving any other way never reaches
the line. **Five mutations, five seen to fail.**

### ⚠️ I PARAPHRASED CARD TEXT FROM MEMORY AND THE SUITE CAUGHT ME
The first draft of the fixtures had **Reiver Demon as *"non-Demon"* — the real text is *"nonblack"*** —
plus three wrong mana costs. The corpus test failed immediately; the fixtures are now read out of the
snapshot. ⭐ *The "never write card text from memory" rule is not about doctrine, it is about the fact
that recall is CONFIDENT and wrong at the same time — and a paraphrase that happens to still classify
native would have shipped silently.*

**Gates:** 8 tests, negatives leading. Suite **1017 files / 12,946 green**, lint 0, MUTANT clean.
Commit `6646e7e5`.

**Batch 4: 31 cards. Next measured target: `you descended this turn` (5 attributable, swap-verified).**

---

## 🧭 FRESH CENSUS 2026-07-30 — **THE NEXT-TARGET MAP, and a correction to how I was reading censuses**

⚠️ **These are CANDIDATE counts, not attributable ones.** Every number below is "instances where THIS is
*a* blocker" — a card may have others. Per the sizing rule, phrase-swap each before believing it. Recorded
so the next session starts from measurement instead of a guess.

### ⭐ FIRST FINDING: CLUSTERING BY TRIGGER LEAD IS USELESS
The obvious census — group non-native cards by trigger line — returns *"when this creature enters"* (1542),
*"at the beginning of your upkeep"* (633). **All already-detected events.** The lead phrase is not the
blocker; it is just the commonest English in Magic. The useful census asks a narrower question: *for
triggers the engine DOES detect, which payoff will not route?* ⭐ *Census the thing that FAILS, not the
thing that is common.*

### THE PAYOFFS THAT WILL NOT ROUTE (detected triggers only)
| n | effect clause | example |
|---|---|---|
| 30 | `remove a time counter` | Lotus Bloom |
| **25** | **`draw a card`** | Zegana, Utopian Speaker |
| **23** | **`put a +N/+N counter on this creature`** | Hulkling, Burgeoning Bruiser |
| 22 | `venture into the dungeon` | Zombie Ogre |
| 19 | `you take the initiative` | Ravenloft Adventurer |
| 17 | `open an attraction` · 17 `return this card from your graveyard` | Complaints Clerk · Fear of Infinity |
| 15 | `the ring tempts you` | Uruk-hai Berserker |
| 14 | `incubate N` · 14 `return a land you control to its owner's hand` | Phyrexian Awakening · Selesnya Sanctuary |

### ⭐ SECOND FINDING: ROWS 2 AND 3 ARE NOT PAYOFF PROBLEMS AT ALL
`draw a card` and `put a +1/+1 counter on this creature` are the two simplest clauses in Magic and both
parse perfectly. **They fail on the INTERVENING-IF condition** (CR 603.4):

- Zegana — *"if you control another creature with a +1/+1 counter on it"*
- Hulkling — *"if it has greater power or toughness than Hulkling"*

⭐ *A payoff appearing in a failure census does not mean the payoff is the problem — 48 rows here are one
gate further up.* Same shape as the discard vein, where the census phrase was a payoff and the missing
piece was the event.

### THE INTERVENING-IF SURFACE, MEASURED
**569 unparseable instances across 389 DISTINCT shapes** — the largest single shape is **15**. This is a
true long tail, not a vein: no single build moves it much.

| n | condition | example |
|---|---|---|
| 15 | `you cast it from your hand` | Soulhunter Rakshasa |
| 14 | `this permanent is an enchantment` | Veiled Sentry |
| 10 | `{M}{M} was spent to cast it` | Vibrance *(already REFUSED — see the refusal list)* |
| 9 | `this card is in your graveyard` · 9 `it was kicked with its {M}{M} kicker` · 9 `you descended this turn` | Ghastly Remains · Stormscape Battlemage · Child of the Volcano |
| 7 | `it was bargained` · 7 `it had counters on it` | Troublemaker Ouphe · Buzzard-Wasp Colony |
| 5 | `you have a full party` · 5 `you have the initiative` · 5 `this card is suspended` | Squad Commander · Imoen · Deep-Sea Kraken |

**Reading:** the tractable-vein era is over on the corpus side too, exactly as it already was on `cdh`.
Expect single-digit slices. The honest next targets are `you cast it from your hand` (15) and
`this permanent is an enchantment` (14) — **phrase-swap both before building**; several mana-provenance
shapes below them are already on the REFUSED list and must not be re-picked.

---

## ✅ BANKED (batch 4) 2026-07-30 — **MEGRIM: the DAMAGE form of the discarding-player referent. GAINED 1, LOST 0. The discard vein is closed.**

### THE BANKED DIAGNOSIS HELD — and that is the point of banking one
Last entry recorded: *the recipient phrase is the ONLY blocker; `deals 2 damage to target player` already
parses.* Correct on both counts. The follow-up took one build instead of a fresh investigation. ⭐ *A
diagnosis banked at the moment of understanding is worth more than the card it was blocking.*

### ⚠️ BUT THREE SEPARATE PLACES HAD TO KNOW BEFORE ONE POINT OF DAMAGE LANDED
Adding the recipient vocabulary made Megrim classify **native-trigger** immediately. It dealt **zero
damage** — twice, for two different reasons:

| fix | symptom before it |
|---|---|
| recipient vocabulary (`spellEffects`) | did not parse at all |
| resolver synthesis off `ctx.discardingPlayerId` | — |
| **`NON_WIPE_MASS_SCOPES` registration** | **`trigger-removed-no-target` at flush** — native by the metric, silently dropped by the runtime |

⭐ **The third one is the trap, and the file WARNS about it four lines above the entry I added.** The
`eachOpponentCreature` comment says in as many words: *"'needs a chosen target?' checks treated it as
targeted and the live trigger flush silently DROPPED the effect while the classifier credited native — the
documented drift trap made real."* It caught me the first time I added a new referent targetType. *A
warning written in the file is only worth something if you read it BEFORE you need it — register a new
non-chosen targetType in the same commit that creates it.*

**Every one of these was invisible to classification and to the atom shape.** Only a life-total assertion
saw them. Third slice running where that is the finding.

### ⚠️ AND ONE ARM I ADDED IS NOT LOAD-BEARING — said so rather than implying otherwise
The damage-normalization arm (`discardingPlayer → "player"`) **passed its mutation**: an unrecognized
targetType already falls through `applyDamageEffect`'s switch to the same per-target path. So Megrim works
**by accident**, not by declaration. Kept — the moment that switch grows a case or its default changes,
this would silently deal 0 — with the non-load-bearing status written into the code. *A guard whose
mutation passes is either dead or a bet on the future; say WHICH, in the file, or the next reader has to
re-derive it.*

**Gates:** the discard file now runs 16 tests. Five mutations run, four seen to fail, the fifth documented.
Suite **1016 files / 12,938 green**, lint 0, MUTANT clean. Commit `5a201953`.

**Batch 4: 26 cards. The discard vein (13 carriers) is now fully mined — 8 native, the rest are filtered
variants and Station/Tinybones shapes that are their own builds.**

---

## ✅ BANKED (batch 4) 2026-07-30 — **THE DISCARD EVENT. GAINED 7, LOST 0. A whole event that did not exist.**

Tourach, Dread Cantor · Sangromancer · Abyssal Nocturnus · Geth's Grimoire (the event alone) ·
Liliana's Caress · Raiders' Wake · Fell Specter (the event + the referent).

### ⭐ THE CENSUS SAID 3. IT WAS MEASURING THE WRONG THING.
The census phrase was a PAYOFF (*"that player loses N life"*). Swapping the **event** phrase instead —
leaving every payoff intact — showed `detectTriggers` returned **nothing at all** for this line: the engine
had no discard event. Four more cards were blocked purely by the missing event, with payoffs that already
parsed. ⭐ **When a census phrase is a payoff, check whether the TRIGGER underneath it exists — the payoff
count is a floor, not the size.**

### SIX PARTS, AND THE ONE THAT SILENTLY ATE EVERYTHING
detection arm · **`scopeMatches` case** · `checkDiscardTriggers` · sentinel rewrite · payoff + resolver ·
referent pin.

⚠️ **The scopeMatches case is the trap.** A discard has no triggering PERMANENT, so a scope with no
explicit `case` falls to `default: return false` — detection, routing and classification were all green
while **not one trigger ever fired**. Caught only because the first runtime test asserted a life total.
The `opponentDraw` / `milled` / `lifeLost` scopes all carry the same carve-out; mine now sits beside them.

### ELEVEN SITES, NO CHOKE POINT — wired all of them
There is no `discardCard()` helper to hook. Every discard is its own `moveCardToZone(hand → graveyard)`:
five COST payments in `actionDispatcher` (a discard paid as a cost is still a discard, CR 701.9a), the
forced chain and the random pitch in `hand.js`, connive, the iterated edict, and **both pending-choice
settles — where the discard happens at the SETTLE, not when the chain started.** One fire per card
(CR 603.2): a two-card discard is two triggers, not one doubled one.

### ⚠️ MY WIRING TEST PASSED WHILE THE CODE WAS BROKEN
I added a structural test asserting every hand→graveyard site is accompanied by a fire — because nine of
the eleven sites have no cheap behavioural driver and would rot in silence. It passed. **The build was
still broken:** `runProgram.js` got both its fire calls and no IMPORT, so every discard through a pending
choice threw `ReferenceError`. The structural test checks that a fire is WRITTEN, not that it RUNS.

**The existing suite caught it — 24 failures across 9 files.** ⭐ *A structural invariant and a behavioural
one fail in different directions, and neither substitutes for the other. The regression suite is not
overhead; it is the only thing that read the code the way the runtime does.* Both are kept, with the
limitation written into the test.

### VERDICTS
- ⛔ **Megrim deliberately left out — and the diagnosis is DONE, so it is a minutes-long job next time.**
  Its payoff is *damage* to that player. **Verified, not assumed:** `this enchantment deals 2 damage to
  target player` parses fine → `{op:"deal-damage", amount:2, targetType:"player"}`, so the subject and the
  fixed-damage shape are both already handled. **The recipient phrase is the ONLY blocker** — the sentinel
  rewrite turns Megrim's clause into *"… to the discarding player"*, which the damage recipient vocabulary
  does not know. The work: add that phrase beside `"that player": "damagedPlayer"` in `atoms/stack.js`'s
  TT map (or the fixed-damage equivalent) + synthesize the player target from `ctx.discardingPlayerId` the
  way damagedPlayer does. The triggerRouting pin **already covers `who:"discardingPlayer"`**, so that half
  is done. Pinned non-native meanwhile so the gap stays visible rather than assumed covered.
- ⛔ A **filtered** variant (*"discards a nonland card"*) is not this event — pinned, SAFE FN.
- ✅ **Fixed my own citation:** the previous entry said CR 701.8a for discard. **701.8 is Destroy; discard is
  701.9a.** Corrected in-file. *A rule number recalled is not a rule number checked.*

**Gates:** 15 tests — real discards driven down the forced-chain, random and self-discard paths, plus the
structural wiring invariant. **Seven mutations seen to fail**, including one that deletes a single fire site.
Suite **1016 files / 12,937 green**, lint 0, MUTANT clean. Commit `8d984df8`.

**Batch 4: 25 cards.**

---

## ✅ DONE — superseded by the entry above (kept for the measurement trail)

## 📏 SCOPED, MEASURED, READY TO BUILD 2026-07-30 — **THE DISCARD EVENT (`whenever an opponent discards a card`) — worth ~8, and it is a SEVEN-SITE build**

Measured but deliberately NOT started at the tail of a session: a partial build here produces **silently
missing triggers**, which is the worst failure shape in the engine (no error, no FP, just an ability that
never fires). Everything the next session needs is below — pick it up cold.

### THE MEASUREMENT (phrase-swap, per the sizing rule)
`detectTriggers` returns **NOTHING** for this event — it is not a missing payoff clause, **the whole event
is undetected**. Swapping ONLY the event phrase (`whenever an opponent discards a card` →
`whenever you gain life`) and leaving every payoff intact:

| | count | cards |
|---|---|---|
| non-native carriers | 13 | |
| **flip on the EVENT alone** | **4** | Tourach, Dread Cantor · Sangromancer · Abyssal Nocturnus · Geth's Grimoire |
| **+ need a `discardingPlayer` referent** | **3** | Liliana's Caress · Raiders' Wake · Fell Specter (*"that player loses 2 life"*) |
| + the same referent, damage form | 1 | Megrim (*"deals 2 damage to that player"*) |

⭐ **The original census called this vein "3".** It counted only the `that player loses N life` payoff.
Sizing the EVENT instead more than doubled it — *when a census phrase is a PAYOFF, check whether the
TRIGGER underneath it exists at all; the payoff count is a floor, not the size.*

### WHY IT IS BIG: SEVEN DISCARD SITES, NO CHOKE POINT
A discard trigger must fire from **every** way a card is discarded (CR 701.9a), and this engine has no
single `discardCard` helper to hook. Files performing discards today:

`effects/atoms/hand.js` (the chain + random discard) · `effects/runProgram.js` · `learnSession.js`
(the CR 514.1 cleanup hand-size discard) · `effects/castModifiers.js` (discard as a COST) ·
`effects/atoms/connive.js` · `effects/atoms/iteratedEdict.js` · `pendingChoice.js`

⚠️ **And the main chain PAUSES for human choice** (`pendingChoice` carries five discard kinds:
`hand-discard`, `discard`, `optional-draw-discard`, `optional-discard-payment`, `cleanup-discard`). Each
discard is its own event (CR 603.2), so the fire point has to be correct ACROSS the pause — not once at
the end of the chain. That is the whole risk of this slice.

### THE SHAPE
1. `detectTriggers` arm → `{ event: "discarded", whose: "opponent" }`.
2. A `checkDiscardTriggers` called from **all seven** sites, one fire per card discarded.
3. Context stamp `discardingPlayerId` + a `who:"discardingPlayer"` referent for the lose-life / damage payoffs.
4. **Pin the referent to the event in `triggerRouting`'s referent gate** — the same discipline the
   `dyingPower` pin got this run, and non-optional here: an absent referent reads as a dropped clause.
5. Gates must drive a REAL discard through the pausing chain, not just assert the descriptor.

---

## ✅ BANKED (batch 4) 2026-07-30 — **LOOK AT TARGET PLAYER'S HAND (CR 701.20e). GAINED 5, LOST 0.**

Peek · Gitaxian Probe · Clairvoyance · Ingenious Thief · Glasses of Urza.

### ⭐ THE FIRST EFFECT IN THE CORPUS WITH NO BOARD CONSEQUENCE — and the easiest kind to fake
CR 701.20e: *"Some effects instruct a player to look at one or more cards. Looking at a card follows the
same rules as revealing a card, except that the card is shown only to the specified player."* No zone
change, no state change. **The information IS the effect**, so delivering it is the entire implementation.

⛔ **Which is exactly why this could have shipped hollow.** A resolver logging a bare
`effect:"look-at-hand"` marker would flip five cards to native while conveying *nothing* — and every test
that asserts only *"an atom was produced"* passes on it. So the bar was set BEFORE building: **the log
entry carries the real card names, and the deciding gate asserts that list EQUALS the target's hand.**
If that could not be asserted truthfully, the arm was not worth having. *A no-op is only honest when the
effect itself is a no-op — an information effect that delivers no information is a fabrication.*

✅ **First checked that the log is a CONSUMED surface, not a debug artifact** — `/api/why-you-lost`,
`/api/self-play` and `/api/grind` all read it. Had it been write-only, this vein would have been refused.

### THE +5th CARD CAME FROM A TARGETING INTENT, NOT A PARSE
The flip-diff paid **4** on the first run: Ingenious Thief's ETB parsed HIGH and still would not route.
`atomTargetIntent` had no case for the new op → `"ambiguous"` → `programTriggerTargetsResolvable` false →
**the trigger silently routes to the Arbiter.** Adding `enemy` (you want an OPPONENT's hand; looking at
your own tells you nothing) flipped it to 5/5 against the census. ⭐ *A new op is not finished when it
parses and resolves — the TRIGGER path asks a third question, and it fails closed and silently.* The
fight/cant-block cases carry the same warning in-file; this is the third card that gate has caught.

### ⚠️ M5: A GUARD THAT DID NOTHING, AND MY STATED REASON FOR IT WAS WRONG
Loosening the `^…$` anchor to a prefix match **broke no test**. Investigated instead of shrugged: the
look-and-choose cards are not protected by my anchor at all — the clause SPLITS on `" and "`, and it is the
**second fragment** (`choose two cards from it`) failing that sinks the program. The file said otherwise.
⭐ *A mutation does not only test the code — it tests the STORY you wrote about the code, and this one
caught a false explanation sitting in a comment.*

Resolution: the anchor stays (a rider on a conjunction the splitter does not break on would silently drop
its tail), but it is now asserted **directly against the clause parser**, where it is observable, instead
of through a program-level path where the split hides it. Both mechanisms are now on record. **Six of six
mutations fail.**

**Gates:** 13 tests, led by the logged-contents equality. Suite **1015 files / 12,922 green**, lint 0,
MUTANT clean. Commit `c89ccb37`.

**Batch 4: 18 cards.**

---

## ✅ BANKED (batch 4) 2026-07-30 — **"ITS POWER" LIFEGAIN: THE EVENT PICKS THE REFERENT. GAINED 6, LOST 0.**

Bottle Golems · Willow Geist · Conclave Mentor · Packsong Pup (dies) · Boulderbranch Golem ·
Sunscourge Champion token (etb).

### ⭐ ONE CLAUSE, FIVE ANTECEDENTS — the census counted 7 and the corpus disagreed usefully
`you gain life equal to its power` is **byte-identical on all 13 corpus rows**, but *"its"* names a
different object — **with a different READ PATH** — depending on the ability it hangs off:

| shape | "its" = | how its power is readable | built? |
|---|---|---|---|
| **dies** (4) | the dying creature | **GONE at resolution** → only the CR 603.6e look-back (`ctx.dyingPower`) | ✅ |
| **etb** (2) | the entering creature | **LIVE on the battlefield** → the existing triggering sentinel | ✅ |
| **spell** (3) | the destroyed/exiled TARGET | Chastise · Infernal Reckoning · Rashida Scalebane | ⛔ refused |
| **cost** (1) | the permanent sacrificed to pay | Syr Ginger | ⛔ refused |
| **watcher** (1) | an exiled creature | Captain Marvel | ⛔ refused |

**A context-free arm would bind ONE of those and silently resolve the other four to 0** — the forbidden
dropped-clause FP. The engine already *documented* this trap: `matchDiesGainDrawByPower` carries a comment
explaining why Lifeblood Hydra's payoff was matched as a whole collapsed template instead of a generic
"equal to its power" clause. **The warning was written by an earlier slice and it was exactly right.**

⭐ **The existing two `dyingPower` carriers both DODGED the ambiguity via corpus-uniqueness** (Lifeblood's
compound and Feral Ghoul's rad clause are each unique to a dies trigger). Mine is unique to nothing, so the
dodge was unavailable — which forced the real fix rather than a fourth special case.

### THE MECHANISM — the repo's own event-gated SENTINEL REWRITE, not a new seam
`parseEffectClause` is context-free by construction, so the referent is resolved **one layer up**, in
`detectTriggers`, where the event is known — the same precedent `"it" → "the triggering creature"` and the
milled/counters-placed/lifegain sentinels already use. `dies` → a new *dying-creature* sentinel; `etb` → the
sentinel that **already existed and already parsed**. Threading a `triggerEvent` opt through
`parseClauseToAtom`'s six call sites was the alternative; it would have added a second mechanism for a job
the first one does.

✅ **A gate widened for free:** `countContext:"dyingPower"` is now pinned to the dies event in
`triggerRouting`'s referent gate — which retroactively protects **Lifeblood Hydra and Feral Ghoul**, both of
which had been emitting that key ungated.

### ⚠️ THE FLIP-DIFF CALLED THE ETB HALF A WIN AND IT GAINED **ZERO LIFE**
GAINED 6 / LOST 0, no surplus — and **four of the fifteen gates still failed on the first run.** The two ETB
cards classified `native-trigger` while gaining nothing at all. ⭐ *This is the third slice this run where
"the atom is right" and "the effect is right" came apart, and the only thing that caught it was leading
with a LIFE TOTAL instead of an atom shape.*

Both failures were mine, not the engine's — `createPermanent` hardcodes `counters:{}` and ignores extra
props, and `checkEnterTriggers` takes ONE permanent rather than an array. **The `powerAtDeath` control
caught the first one**, exactly as the colour slice's vacuity control did. *A control earns its line the
first time the harness lies to you.*

⚠️ **Nothing in the suite had ever driven `dyingPower` → gain-life end to end.** Lifeblood Hydra's payoff
was classification-tested only. That path is now runtime-covered.

### ⭐ M6: A GATE THAT COULD NOT FAIL (CLAUSE D, again)
Five of six mutations failed on the first battery. **M6 — dropping the `scope:"self"` requirement —
PASSED**, i.e. the gate was decoration. Investigated rather than deleted: watchers *do* reach the arm with
non-self scopes, and for them the referent is a DIFFERENT object from the trigger's source whose per-fire
stamp this slice has **not** runtime-verified. So the gate stays, deliberately tighter than the semantics
strictly require, and now has a test proving it blocks both watcher shapes. **Six of six fail.**
*Unverified → body-only is a SAFE FN; unverified → routed is how a false positive ships.*

### BANKED FINDINGS
- **Chastise is the 7th attributable card and is deliberately unbuilt** — its "its" is a SPELL's destroyed
  target, needing target-LKI. A separate mechanism; the census's 7 minus my 6 is fully accounted for.
- **The non-token Sunscourge Champion is blocked by ETERNALIZE alone** — verified by removing the keyword
  (`body-only` → `native-trigger`), not inferred. One card sits behind that keyword.

**Gates:** 16 tests, every enforcement one asserting a real life total. Six mutations seen to fail. Suite
**1014 files / 12,909 green**, lint 0, MUTANT clean. Commit `b8e1b6fe`.

**Batch 4: 13 cards.**

---

## 🧪 AUDIT 2026-07-30 — **THE WRITER-COUNT SWEEP, RUN ACROSS THREE SURFACES. One real gap, and it is built.**

The *"does anything actually PARSE to this primitive?"* question paid three times in two batches (poison,
protection, colour change), so I ran it **mechanically over every registry I could enumerate** rather than
card-by-card. Recorded here as a COMPLETED audit so nobody re-runs it.

| surface | population | produced-but-never-consumed | consumed-but-never-produced |
|---|---|---|---|
| **layer ops** (`layers.js`) | 13 | — | **`addColor` (0 writers)** — measured **1 carrier / 0 attributable**, deliberately left unwritten |
| **trigger events** | 48 produced / 60 matched | **none** | none |
| **atom resolver ops** | 145 registered / 165 emitted | **none** | none |

✅ **The one real find was NOT the zero-writer op.** `setColor` had exactly ONE writer — buried inside
`applyAnimateEffect` — so a *pure* colour change had none. That paid **4 cards**. `addColor`, the op with
literally zero writers, pays **nothing**. ⭐ *A dead read-side capability is only worth a writer if cards
actually need it — measure before building, even when the structural signal looks perfect.*

### ⚠️ TWO FALSE ALARMS, and why the grep lied both times
| candidate | why it looked dead | why it is not |
|---|---|---|
| `gyLeaveBatch` | never appeared as a literal `event: "…"` at a fire site | fired through a **loop variable** — `for (const [dir, evName] of [["leave","gyLeaveBatch"], …])` |
| `dealtBy` | same | `checkDealtByTriggers` **builds the descriptor inline** and is called from BOTH damage paths; it never goes through `triggersForEvent` |

⭐ **A grep for literal call shapes under-reports every dynamic dispatch.** Both candidates had to be traced
by hand before either could be called dead — and both were alive. *When a structural sweep flags something,
the flag is a QUESTION, not a finding.*

**Net: the engine has no dead resolvers and no dead trigger events.** The layer surface has exactly one
unwritten op, measured worthless, left alone on purpose.

---

## ✅ BANKED (batch 4) 2026-07-30 — **COLOUR CHANGE AS A TARGETED GRANT. GAINED 4, LOST 0.**

Cerulean Wisps · Singe · Fylamarid · Metathran Transport.

### ⭐ THE SWEEP THAT FOUND IT — now a standing technique, third hit in two batches
**Enumerate every layer op; count its WRITERS.** Poison and protection were found by asking the question
card-by-card; this time it was mechanical:

| layer op | writers |
|---|---|
| **`addColor`** | **0** ← looked like the prize |
| `addWard` · `ptModifyDynamic` · `removeKeyword` · `setColor` · `setCreatureSubtypes` … | 1 each |
| `addKeyword` | 4 |

**`setColor` had exactly ONE writer — inside `applyAnimateEffect`**, where an animate carries a colour along
with its P/T and types. So a **pure** colour change had no writer at all. The layer op and its readers
existed; nothing parsed to it.

**⛔ AND THE ZERO-WRITER OP WAS NOT THE PRIZE.** `addColor` measured **1 corpus carrier, 0 attributable** —
it stays unwritten. *A dead read-side capability is only worth a writer if cards actually need it, and that
is a MEASUREMENT, not an inference.* The op with 1 writer paid 4; the op with 0 paid nothing.

**SET, not ADD** (CR 105.1): *"becomes blue"* REPLACES the creature's colours. Both the in-addition form and
*"becomes colorless"* are pinned refused, and the mutation swapping `setColor` → `addColor` fails.

**Two of the four ride referent arms built earlier this run** — Cerulean Wisps uses *"Untap that creature"*
and Singe uses *"That creature becomes black"*. **Fourth slice in a row where the referent work paid again
without being the subject of the slice.**

### ⚠️ THE VACUITY CONTROL EARNED ITS PLACE, LITERALLY
My first draft called `colorsOf(state, id)` — but `colorsOf` takes a **CARD**, so it returned `[]` for
everything. The **vacuity control caught it on the first run.** Without it, the *"SETS rather than ADDS"*
assertion (`not.toContain("G")`) would have **PASSED on an empty array**. ⭐ *A negative assertion proves
nothing until some positive assertion has shown the reader works at all.* Written into the file.

**Gates:** 8 tests, led by runtime assertions. **Four mutations seen to fail**, including the `addColor` swap
and granting to every creature. Suite **1013 files / 12,893 green**, lint 0, MUTANT clean.

**Batch 4: 7 cards.**

---

## ✅ BANKED (batch 4) 2026-07-30 — **PROTECTION-FROM-A-COLOUR GRANT. GAINED 3, LOST 0.**

Obsidian Acolyte · Crimson Acolyte · Keeper of Kookus.

**⭐ THE "DOES ANYTHING PARSE TO IT?" QUESTION HAS NOW PAID TWICE.** Same shape as the poison slice: the
**layer op already existed** — the static anthem path emits `addProtection` and `layers.permanentProtectionColors`
reads it — but **nothing parsed to it** for a targeted, turn-scoped grant. *The read side had been waiting for
a writer.* That is a different question from *"is the mechanic built"*, and it is now a repeatable move:
**enumerate the runtime primitives, then check which have no clause reaching them.**

The resolver is a deliberate **mirror of `applyCantBlock`** — both are *"grant a layer-6 quality to the
targets for the turn"*, only the op differs. Keeping them structurally identical is what stops them drifting.

**⛔ ONE COLOUR ONLY, anchored.** *"protection from everything"* / *"from all colors"* / *"from the colour of
your choice"* are **different mechanics**; collapsing them to a colour the card never named would be a
**confidently wrong grant** rather than a missing one. All three pinned refused; the mutation opening the
quality group fails.

### 🧭 HOW THIS SLICE WAS CHOSEN — by measurement, not by proximity
`cdh` sits at **87/100** with **13 slots left, every one multi-mechanism**. I probed the nearest one,
**Veil of Summer**, clause by clause:
| its three mechanics | pool | attributable |
|---|---|---|
| hexproof FROM a colour | 8 | **0** |
| turn-scoped "spells you control can't be countered" | 1 | **0** |
| conditional draw on an opponent's cast | 6 | **0** |

⛔ **Veil of Summer REFUSED** — three mechanics, none of which pays on its own. The same probe surfaced
*protection from a colour (grant)* at **12 pool / 3 attributable**, which is **not a `cdh` card at all** — it
is simply the one nearby vein that pays. *Probing a shelf card's neighbourhood is worth doing even when the
shelf card itself is refused: the measurement covers the whole area, not just the target.*

**Gates:** 7 tests, **led by a runtime assertion** per batch 3's wrong-owner lesson (*asserting the atom is
not asserting the effect*). **Four mutations seen to fail**, including granting to every creature rather than
the target. Suite **1012 files / 12,885 green**, lint 0, MUTANT clean.

⚠️ Lint caught an unused test helper on the first pass — the `--max-warnings 0` gate doing its job before
the commit rather than after.

**Batch 4: 3 cards.**

---

## 🚀 SHIPPED 2026-07-30 — **v0.149.21 PUBLISHED AND VERIFIED BY CONTENT.**

| check | result |
|---|---|
| `latest.json` version | **0.149.21** |
| installer URL | resolves to a real asset **in this release** |
| signature | **424 chars**, decodes to `untrusted comment: signature from...` |
| installer size | **129,865,324 bytes** — not a stub |
| release state | published; **not** draft, **not** prerelease |
| tag ↔ tree | tag == master == the bump commit; **both** version files read 0.149.21 |

Verified by CONTENT, never by filename — the standing law since the v0.149.13 incident, where a pushed tag
rendered a release-looking page that had shipped nothing. The tag/tree check ran BEFORE the push.

✅ **Carries no known defects.** The lifegain under-report that shipped in v0.149.20 was fixed on master and
is included here.

---

## 🚀 SHIPPED 2026-07-30 — **v0.149.21. 79 cards across twelve slices — and a coverage AUDIT of the whole batch.**

**The referent family is the story: 67 of the 79**, across seven slices, all from one structural question
asked repeatedly — *"what does the parser explicitly refuse, and what is the antecedent?"*

| slice | cards |
|---|---|
| bound-referent keyword grants | 17 |
| object-first referent untap | 14 |
| self-antecedent referents | 10 |
| player referents (`its controller …`) | 9 |
| mass-antecedent referents + multi-keyword keep-whole | 9 |
| referent can't-block / P/T | 6 |
| poison counters as a clause | 6 |
| mass add-counter antecedent | 2 |
| granted Ward—Pay-life | 2 |
| investigate for a named player | 2 |
| combat damage to YOU + named-token sacrifice | 1 (a `cdh` shelf card) |
| named-token sacrifice trigger | 1 |

**Shelf: `cdh` 85 → 87 of 100.** Colton's other four decks remain ≥ 90%.

### ⭐ THE BATCH'S MOST VALUABLE OUTPUT IS NOT A CARD — IT IS A LIMIT ON THE INSTRUMENT
The investigate/shuffle near-miss proved that **the flip-diff measures whether a card PARSES, not whether it
does the right thing.** Two atoms carried a `who` field their resolvers never read; the flip-diff read
`GAINED 4 / LOST 0` while the Clue went to the caster and a shuffle would have hit the caster's own deck.
Every slice tonight had leaned on that instrument.

**So the whole batch was audited for the same gap.** Nine test files, eight already driving a resolver. The
ninth (named-token sacrifice pool) was parse-only — driven end-to-end it proved correct, so the finding was a
missing PROOF rather than a defect, and both assertions now exist. One file stays parse-only **by
construction** and now says so: its descriptor is byte-identical to an already-runtime-pinned spelling, and
the equivalence assertion is what makes that pin cover it. ⭐ **"The atom is right" and "the effect is right"
are different claims, and only the second one ships.**

### 🧪 Discipline notes worth keeping from this batch
- **A fail-closed switch turns a broken feature into a passing NEGATIVE test.** `scope:"any"` was not a scope
  `scopeMatches` knows; the trigger never fired and *"does not fire for the attacker"* passed on nothing
  firing. Only the paired POSITIVE caught it.
- **A ternary payload chain ending in a payload** makes every future capture group a silent mis-route —
  investigate resolved as a poison counter for exactly that reason. End the chain in `null`.
- **A pin written to be re-pointed costs one line** when it graduates; ten of them moved this batch for one
  line each. A bare assertion would have cost an investigation apiece.
- **Choose a CREED stand-in with ZERO attribution** (`reveals their hand`, 126 carriers / 0 attributable) so
  it never graduates out from under the pins that use it.
- **Three dead lines removed**, each found by a mutation that could not fail — and one KEPT with a note,
  because *redundant-today-dangerous-tomorrow* is not the same as *dead*.

---

## ✅ BANKED (batch 3) 2026-07-30 — **INVESTIGATE FOR A NAMED PLAYER. GAINED 2, LOST 0.**
### ⚠️⚠️ AND THE MOST IMPORTANT ENTRY OF THE RUN: **I NEARLY SHIPPED TWO WRONG-OWNER FALSE POSITIVES.**

Panther Pounce · Fateful Absence. Two cards — and the slice is mostly a report on how it nearly went wrong.

**What I did:** bundled *"‹player› investigates"* with *"‹player› shuffles their library"* and emitted a `who`
field on both atoms. **Neither resolver reads that field.**
| half | what actually happened |
|---|---|
| **investigate** | the Clue mint's recipient is **`whoCreates`** — so every Clue went to the **CASTER** |
| **shuffle** | `applyShuffle` has **no recipient at all** and always shuffles `ctx.controller`'s library — Soldier of Fortune would have shuffled **the caster's deck** |

⭐ **THE FLIP-DIFF READ `GAINED 4 / LOST 0` THE ENTIRE TIME.** *A card that resolves the WRONG effect still
classifies native.* The flip-diff measures whether a card parses, **not whether it does the right thing** —
which is the sharpest limit of that instrument found this run, and it had been carrying every slice tonight.

**✅ The pre-existing `actInvestigate` pins caught the investigate half BY NAME** — *"a 3rd-person
(wrong-owner) investigate is NOT native"* — which is precisely the failure they were written for. Someone
wrote that pin specifically so a future author could not do what I just did.

**⛔ NOTHING caught the shuffle half.** No pin existed, and **my own tests asserted ATOM SHAPES rather than
driving the resolver.** Every other slice tonight had a runtime test; this one did not, and that is exactly
where the bug lived. ⭐ **ASSERTING THE ATOM IS NOT ASSERTING THE EFFECT.** The new test file leads with a
runtime check of **who received the token**.

**Resolution:** investigate is fixable because the plumbing exists (`whoCreates:"target"`, now verified at
runtime — Clue to the target, zero to the caster). **Shuffle is DROPPED** — it needs a resolver dispatch, not
a parse arm — and is banked as **worth 2 cards** (Soldier of Fortune, Boggart Forager). *"Each opponent
investigates"* stays refused: `whoCreates` has no such form, and **refusing is the only honest option when the
runtime cannot express the printed recipient.**

### ⚠️ A SECOND BUG FROM THE SAME CUT — the ternary catch-all
The bound-referent payload chain **ended in a payload rather than `null`**, making poison an implicit
catch-all. Adding `investigates` as a new capture group **shifted the indices**, its test read the wrong
group, and *"Its controller investigates"* **silently resolved as a poison counter**. Every branch now tests
its own group and the chain ends in `null`. ⭐ *A ternary chain whose last arm is a payload turns every future
capture group into that bug.*

**Three pins re-pointed with reasons intact**, including one KWACT-INVEST line whose refusal existed **only**
because the mint could not name a different owner — it can now.

**Gates:** 11 tests, led by the runtime owner check that was missing. Three mutations seen to fail (including
re-introducing the index bug). Suite **1011 files / 12,876 green**, lint 0, MUTANT clean.

**Batch 3: 79 cards.**

---

## ✅ BANKED (batch 3) 2026-07-30 — **POISON COUNTERS AS A CLAUSE. GAINED 6, LOST 0.**

Prologue to Phyresis · Infectious Inquiry · Infectious Bite · Pistus Strike · Ichor Rats · Phyrexian Vatmother.

**⭐ THE TRACK EXISTED; NO CLAUSE EVER PARSED TO IT.** `gameState.addPoison` has been there since KW-POISON
(ten counters lose the game), and infect/toxic combat damage already fed it — but **every card handing out
poison OUTSIDE combat was unmodelled** because nothing turned the sentence into an atom. Six cards fell out of
one small arm. *When a runtime primitive exists and pays nothing, check whether anything actually PARSES to
it — that is a different question from "is the mechanic built".*

`applyAddPoison` is a deliberate **structural mirror of `applyLoseLife`** — same four recipients, same order,
same eliminated-player handling. Poison is a player resource like life and should read like one; keeping them
identical is what stops them drifting as recipient kinds are added.

**⭐ TWO SLICES COMPOSED WITHOUT EITHER KNOWING ABOUT THE OTHER.** Pistus Strike (*"Destroy target creature
with flying. **Its controller** gets a poison counter."*) rides the **player-referent projection** built in the
PREVIOUS slice. The poison payload needed **no runtime work beyond existing**, because `applyAddPoison`'s
`who:"target"` branch reads the same projected slice every other payload in that arm does. *That is the payoff
for putting the projection at the BIND SITE instead of in each resolver — a new payload joins for free.*

**Predicted 5, measured 6, both surprises audited:** Ichor Rats uses *"each player"* and Phyrexian Vatmother
uses *"you"* — arms I included on purpose but my probe's regex never searched for. **The build was wider than
the probe**, which is the safe direction (fourth slice running that the probe under-counted).

**⚠️ One mutation was a DUD and was replaced rather than counted.** Unanchoring the FRONT of the subject regex
changed nothing — `" gets"` still has to follow the subject immediately, so *"each opponent who attacked gets
…"* never matched either way. The real hazard is an **open-ended subject group** (`[a-z ]+`), which would let
any qualified subject through and silently fall back to `who:"target"`. That is what the replacement mutates,
and it fails. *A mutation that does not change behaviour is not evidence — check that your sabotage actually
sabotages.*

**Gates:** 10 new tests, **each recipient paired with a check that the WRONG player was not poisoned**. Four
mutations seen to fail. Suite **1010 files / 12,866 green**, lint 0, MUTANT clean.

### 📊 THE PLAYER-PAYLOAD VOCABULARY — measured, for whoever picks this up next
`target player <payload>` parses for **6** payloads (discard · draw · lose life · gain life · mill · sacrifice)
and **not** for 8 others. Attribution per missing payload:
| payload | pool | attributable |
|---|---|---|
| **gets a poison counter** | 11 | **5** ✅ built (paid 6) |
| exiles a card from their graveyard | 5 | **3** — needs a card CHOICE |
| shuffles their library | 2 | **2** |
| investigates | 2 | **2** ⚠️ see below |
| creates a Treasure token | 4 | 0 |
| reveals their hand | 126 | **0** |

⚠️ **`investigates` is currently the STAND-IN in ten CREED pins** (re-pointed there this run when the discard
rider graduated). Building it means re-pointing them an eleventh time. If you do, move the stand-in to
**`reveals their hand`** — pool 126 but **0 attributable**, so nobody will ever have a reason to build it.
*Choosing a stand-in with zero attribution makes it permanent.*

**Batch 3: 77 cards.**

---

## ✅ BANKED (batch 3) 2026-07-30 — **PLAYER REFERENTS: "ITS CONTROLLER …". GAINED 9, LOST 0.**

Vapor Snag · Nature's Claim · Last Breath · Assassin's Strike · Clutch of the Undercity · Dismal Failure ·
Desecrated Earth · Call to Heel · Ajani, Inspiring Leader. **Referent family: 67 across seven slices.**

**A fourth referent shape, found by asking the same structural question a second time.** The permanent family
BINDS to the previous atom's target; this one **PROJECTS** off it — the recipient is the target's CONTROLLER.
Projecting **once at the bind site** means every player-payload resolver keeps seeing an ordinary
`{type:"player"}` target and **needed no change at all**.

**⚠️ Reading the controller off the TARGET OBJECT rather than the board is load-bearing.** The canonical
carrier is *"**DESTROY** target creature. Its controller …"* — the permanent is **already gone** when the
second atom resolves, so a board lookup finds nothing. Enumerated targets carry `controller`, so the
projection **survives its own antecedent**. That is exactly what the runtime test asserts.

### ⚠️ I SHIPPED A REGRESSION INTO THE FLIP-DIFF AND IT CAUGHT IT: **GAINED 15 / LOST 17**
The first cut also matched **"that player"** — which `atoms/cdmgDiscard.js` already owns as the COMBAT-DAMAGE
referent (`who:"damagedPlayer"`). Every *"deals combat damage to a player, that player discards a card"*
**specter in the corpus went body-only**. The **ORDERING RULE** says gate a widening behind the prior path's
failure so *"no regressions"* is STRUCTURAL — and **removing the overlapping alternative outright is the
strongest form of that**, because then no ordering can reintroduce it. Net **9** instead of **−2**, plus a
regression-guard test asserting the specter shape stays native. *The flip-diff is the only reason this was a
ten-minute detour instead of a shipped defect.*

### 📌 TEN CREED PINS RE-POINTED ACROSS SEVEN FILES — none deleted
Most use *"its controller discards a card"* as a **STAND-IN** for an unmodeled rider **and say so in the
line**. One had **already been re-pointed on 07-29** when the lose-life rider graduated, and its comment
explains the convention — so this was the second (and for `destroyTokenRider`, the **third**) move of the same
line. Stand-in now `investigates`, unmodeled even for an explicit *"Target player investigates."*
**Two were NOT stand-ins but the real cards** (Nature's Claim, Last Breath) and now assert the flip. Three
merge-gate entries moved `MUST_DROP_TO_LOW` → `MUST_STAY_HIGH`.
⭐ *A pin written to be re-pointed costs one line each time it graduates. A pin written as a bare assertion
costs an investigation. These cost one line.*

**⚠️ Two of MY OWN tests were over-specified and the engine was right both times:** one asserted WHICH parser
wins a payload that the pre-existing `controllerRider` fold already owns after a `destroy`; the other asserted
an immediate discard when a discard raises a **pending choice**. Both now assert the OUTCOME — and the
replacement is *stronger*: **who the choice is addressed to** is the thing that proves the projection.

**Gates:** 7 new tests; **three mutations seen to fail**, including widening back to *"that player"*. Suite
**1009 files / 12,856 green**, lint 0, MUTANT clean.

**Batch 3: 71 cards.** — approaching the ~100 tag threshold.

---

## ✅ BANKED (batch 3) 2026-07-30 — **COMBAT DAMAGE TO *YOU* + NAMED-TOKEN SACRIFICE. GAINED 1, LOST 0.**
### 🎯 **`cdh` 86 → 87 of 100** — a SHELF card, re-measured with `deck-gap`.

**The Cabbage Merchant.** Two mechanics, **each measured 0-attributable on its own** in earlier slices — the
recipient-side combat-damage trigger (7 carriers) and the named-token sacrifice effect (7 carriers).
**Together they flip exactly one card, and it is a shelf card**, which is why they ship as a PAIR rather than
as two zero-flip slices. *A mechanic that pays nothing alone is not automatically worthless — check what it
pays in combination with the other thing that card needs.*

**⭐ THE PAIRED POSITIVE IS WHY THIS WORKS AT ALL — and it caught my bug.** Every other arm in
`checkCombatDamageTriggers` is written from the DEALER's side; the only difference here is **which player's
permanents get scanned**. So the load-bearing test is *"the watcher belongs to the DAMAGED player and does
NOT fire for the attacker's controller."*

I first wrote the descriptor with `scope:"any"` — **not a scope `scopeMatches` knows.** The switch **fails
closed** on an unknown scope, so the descriptor was detected, `detectTriggers` reported it perfectly, and the
trigger **silently never fired**. ⚠️ **The NEGATIVE half of the pair passed the entire time — on nothing
firing at all.** Only the paired POSITIVE assertion made it visible. *This is the concrete case for pairing
every exclusion with the same measurement in the affirmative: a fail-closed switch turns a broken feature into
a passing negative test.* Corrected to `scope:"eachCreature"` and the reason written into the source.

**The sacrifice pool is validated against `NAMED_TOKENS`** — the same registry the mint side uses — so a name
the engine cannot mint can never become a pool that is **empty at resolution**, i.e. a card credited for a
sacrifice that never happens. Pinned with a Wombat token; the mutation dropping the check fails.

♻️ **This is the effect arm I REVERTED last slice as 0-flip.** It ships now because the card that needs it
does. The ledger note from that revert made rebuilding it a two-minute job — which is the whole point of
banking a measurement instead of the code.

**Gates:** 9 new tests; **three mutations seen to fail**, including *scanning the attacking player instead of
the defender*. Suite **1008 files / 12,850 green**, lint 0, MUTANT clean.

**Batch 3: 62 cards.** `cdh` now needs **3** more, all multi-mechanism.

---

## ✅ BANKED (batch 3) 2026-07-30 — **NAMED-TOKEN SACRIFICE TRIGGER. GAINED 1, LOST 0.**

**Gluttonous Guest** — *"Whenever you sacrifice a Blood **token**, you gain 1 life."*

**The mechanic was already built.** `sacSubtype` matches the sacrificed permanent's TYPE LINE word-bounded,
and a Blood token's line is *"Token Artifact — Blood"*, so Captain Lannery Storm's *"sacrifice a Treasure"*
has worked for ages. **Only the PARSE rejected the printed trailing word** — the arm was `$`-anchored, and
**its own comment named "a creature token" as a casualty of that anchor**. One optional group. The existing
`NON_SUBTYPE_ETB_WORDS` guard still runs, which is what keeps *"a CREATURE token"* refused (creature is a
card TYPE with its own matcher and its own predicate; admitting it here would duplicate that matcher with the
wrong one). Reusing the guard rather than adding an allowlist means the two spellings **cannot drift apart**.

### ⚠️ I BUILT AND THEN REVERTED THE EFFECT-SIDE TWIN — the reason is worth more than the code
*"Sacrifice a Food token."* as an EFFECT produces no atom today, so I built the pool for it. **Flip-diff:
GAINED 0.** My own rule is that 0-flip changes do not ship, so it was reverted.

**Why it measured zero is the finding.** My attribution probe matched `sacrifice a <named> token` **anywhere
in the oracle** and I read the hit as an EFFECT clause — but Gluttonous Guest's is a **TRIGGER**
(*"WHENEVER YOU sacrifice a Blood token"*). The number was real and pointed at **a different mechanic than
the one I built**. ⭐ **A regex that finds the words does not tell you which CLAUSE they are in.** Same family
as containment-vs-attribution: the probe was right about the text and wrong about the mechanism. *Attribution
probes must distinguish trigger clauses from effect clauses — they are different parsers, different tests, and
different flip counts.*

**⛔ The effect arm is banked, not built.** Corpus: 7 carriers, 6 non-native, **0 attributable**. It is
genuinely needed later — it is **half of The Cabbage Merchant** (a `cdh` card), whose other half is the
unmodelled **combat-damage-to-YOU** trigger (7 carriers, 0 attributable alone; the two together flip exactly
that one card). Rebuilding it is minutes of work from this note.

**Gates:** 4 new tests; 2 mutations seen to fail (dropping the suffix, dropping the card-TYPE guard). Suite
**1007 files / 12,841 green**, lint 0, MUTANT clean.

**Batch 3: 61 cards.**

---

## ✅ BANKED (batch 3) 2026-07-30 — **MASS ADD-COUNTER ANTECEDENT. GAINED 2, LOST 0.** Family **58**.

**Felidar Retreat** · **Domri, City Smasher** (its −8). *"Put a +1/+1 counter on each creature you control.
**Those creatures** gain vigilance until end of turn."* — the same unfiltered you-control set the mass pump
already qualified as, reached by a different verb.

**⭐ FOUND BY APPLYING LAST SLICE'S OWN LESSON, DELIBERATELY.** I re-ran the family's remaining-work probe
**filtered for shapes I believe are already built** — six rows came back. **The named cards were mostly MODAL,
which looked like a modal-path bug and was not:** each mode runs through `parseEffectClauseImpl`, the FULL
clause machinery, so the gate was applied correctly the whole time. The six rows were **two further antecedent
kinds** hiding behind one symptom. *Checking the suspicious list is now a repeatable step, not a lucky catch.*

### ⛔ THE OTHER KIND IS REFUSED, AND THE DISTINCTION IS THE POINT
*"Create two 1/1 Warrior tokens. **They** gain first strike"* (Mardu Charm) means **the NEW TOKENS ONLY**.
Rewriting it to a `creaturesYouControl` group grant would buff **every creature on the board** — a **strictly
WRONG** answer rather than an incomplete one. That is the whole difference between a false positive and a
false negative, and it is why `create-token` is explicitly NOT in the antecedent allowlist with a comment
saying so. Binding to freshly-minted ids is a real runtime mechanism (the mint path already threads them for
token-enter triggers) and **wants its own slice**.

### ⚠️ A MUTATION SHOWED THE ARM WAS TESTED BUT ITS GUARD WAS NOT
Dropping the allowlist key check **survived the entire file** — because nothing exercised a **FILTERED**
add-counter. *"Put a +1/+1 counter on each **Bird** you control"* keeps `scope:"youControl"` and adds
`subtypeFilter`; without the check it would have granted vigilance to **every** creature. **Testing the happy
path of a guarded arm is not testing the guard.** Pinned; the mutation now fails.

**A merge-gate pin GRADUATED and was MOVED, not deleted** — out of `MUST_DROP_TO_LOW` and into
`MUST_STAY_HIGH` (the same Felidar Retreat text, previously pinned *"rider unmodeled → whole drops"*). **A
graduated pin belongs in the opposite list, where it protects the flip instead of the refusal.**

**Gates:** 3 new tests; 2 mutations seen to fail. Suite **1006 files / 12,837 green**, lint 0, MUTANT clean.

### 📊 THE REFERENT FAMILY, SIX SLICES IN — 58 CARDS
| antecedent kind | how bound | status |
|---|---|---|
| a CHOSEN TARGET | read the previous atom's target slice | ✅ built |
| an UNFILTERED MASS SET (pump / untap / **add-counter**) | rewrite to the equivalent mass atom | ✅ built |
| the SOURCE PERMANENT (`this creature`) | rewrite to `target:"self"` | ✅ built |
| **FRESHLY-CREATED TOKENS** | needs runtime minted-id binding | ⛔ **refused — own slice** |

### ⚠️ CORRECTION — I SAID VALLEY FLOODCALLER WAS "DOWN TO EXACTLY ONE BLOCKER". IT IS THREE.
Written twice in the last two entries and **wrong both times**. Measured directly: simulating the union as a
single subtype leaves it **still `body-only`**, because a **subtype-FILTERED** pump does not qualify as a mass
antecedent either — only the fully unfiltered set does. Floodcaller actually needs **(1)** a multi-subtype
union as a mass-pump selector, **(2)** the antecedent allowlist widened to accept a filtered set, and **(3)** a
subtype-filtered mass UNTAP atom to rewrite into, which does not exist. **Three mechanisms for one card.**
⛔ **REFUSED** — and the corpus agrees: the subtype-union subject pool is 28 cards, 22 non-native, and
**0 attributable to the union alone**. *I compounded this by repeating the "one blocker" line in a second
entry without re-measuring — a claim restated is not a claim rechecked.*

### ⛔ REFUSED 2026-07-30 — **TOKEN-ANTECEDENT REFERENTS. Upper bound 5, and one is an Un-set card.**
*"Create two 1/1 Warrior tokens. **They** gain first strike"* — 266 cards carry the shape, **5** are cards where
everything else parses, and one of those five is *Handy Dandy Clone Machine* (*"it must be represented by a
unique hand…"*), which is not a real payload. **~4 cards for a genuine runtime minted-id binding.** The
alternative — rewriting to a `creaturesYouControl` group grant — stays **forbidden**: it would buff every
creature on the board, a strictly wrong answer. Number banked so nobody re-measures it.

Remaining upper bound ~80, but **no cluster larger than 3** — the family is down to its long tail
(*"it deals damage equal to its power to…"* ·3, *"it must be blocked this turn if able"* ·3 — the latter
unmodelled even for an explicit target). **Batch 3: 60 cards.**

---

## ✅ BANKED (batch 3) 2026-07-30 — **SELF-ANTECEDENT REFERENTS. GAINED 10, LOST 0.** Family total **56**.

Bloodsky Berserker · Undercity Necrolisk · Bristling Hydra · Fearless Fledgling · Syndicate Trafficker ·
Mushroom Watchdogs · Agent of the Shadow Thieves · Blistercoil Weird · Infernal Pet · Sabertooth Mauler.

**⭐ THE THIRD ANTECEDENT KIND — and the family now has a complete taxonomy:**
| antecedent | binding | slices |
|---|---|---|
| a CHOSEN TARGET | read the previous atom's target slice | scope A, scope C, untap |
| an UNFILTERED MASS SET | **rewrite** into the equivalent mass atom | mass |
| the SOURCE PERMANENT (`this creature`) | **rewrite** to `target:"self"` | this one |

**Two of the three are rewrites, and that is the durable lesson:** *when a referent can be rewritten into an
atom the engine already resolves, do that instead of teaching the runtime a new kind of recipient.* Both
rewrites are pinned by asserting the rewritten atom **equals the explicit wording's atom**. Self is the safest
of the three — no set to compute, no target to choose.

**⭐ FOUND BY RE-MEASURING, NOT BY GUESSING.** After four slices I re-ran the family's upper-bound probe purely
to decide whether to keep mining it. The remaining list still showed *"it gains haste / menace until end of
turn"* — shapes **scope A should already have covered**. That contradiction was the thread; pulling it exposed
an entire antecedent kind. **A remaining-work list that still contains shapes you believe you built is a bug
report about your own build.**

**Predicted 11, measured 10, and 3 of the 10 were NOT in the predicted set** — all audited: Blistercoil Weird's
referent sentence starts with *"Untap"*, not a pronoun; Infernal Pet and Sabertooth Mauler print the
conjunction in ONE sentence (*"… on this creature **and** it gains flying …"*), which `splitClauses` breaks
anyway. The probe was subject-first and required a sentence boundary, so it saw none of them. **Third slice
running where the probe under-counted** — the safe direction.

**Two more CREED pins graduated**, both on the same text (*"untap this creature and it gains flying until end
of turn"*). ⭐ **`coverage.test.js` had PREDICTED its own graduation in a comment** — *"the example events keep
graduating as the engine grows"* — so its example was swapped for a still-undetected event, which is what that
comment was asking a future author to do.

### ⚠️ ONE MUTATION SURVIVED AND IS RECORDED, NOT PAPERED OVER
The op allowlist in `rebindToSelfAntecedent` (only `pump` / `untap` rewrite) **cannot be distinguished by any
`classifyCard` test**: a `cant-block` atom with a self recipient is refused **downstream as well**, so two
independent refusals mask each other. The test now asserts **only the outcome and says so in the body**. The
allowlist is **kept** — unlike the three dead lines removed earlier tonight, this one has a real future failure
mode: an op that later becomes self-resolvable would otherwise be rewritten silently. *Distinguish "redundant
today, dangerous tomorrow" from "dead" — the first is kept with a note, the second is deleted.*

**Gates:** 3 new tests; 2 of 3 mutations seen to fail (third documented above). Suite **1006 files / 12,834
green**, lint 0, MUTANT clean.

**Batch 3: 58 cards.** `cdh` still 86/100 — Valley Floodcaller's remaining blocker is unchanged (a
multi-subtype union as a mass-pump selector).

---

## ✅ BANKED (batch 3) 2026-07-30 — **MASS-ANTECEDENT REFERENTS + MULTI-KEYWORD KEEP-WHOLE. GAINED 9, LOST 0.**

Rallying Roar · War Flare · Rally to Battle · Tenacity · Gleam of Resistance · Jeskai Ascendancy · Join
Shields · Flying Crane Technique · Celestial Armor. **Referent family total: 46 across four slices.**

**⭐ THE PREVIOUS ENTRY'S WARNING PAID OFF, AND THE ANSWER WAS BETTER THAN THE ONE IT WARNED AGAINST.** Last
slice I wrote *"do NOT fold this into `bindPreviousTargets` — a mass atom's recipients are computed at
resolution, not chosen at cast."* Correct, and the resolution is not a second binding mechanism at all: the
referent is **REWRITTEN AT ASSEMBLY into the equivalent mass atom the engine already resolves.** The atom that
runs is **byte-identical** to the one the explicit wording produces (asserted in a test), so **there is no
runtime change whatsoever.** *When a referent can be rewritten into an existing atom, do that instead of
teaching the runtime a new kind of recipient.*

Both directions work off one helper:
| printed shape | rewritten to |
|---|---|
| `Creatures you control get +1/+1 UEOT. **Untap them**.` | `{op:"untap-lands", all:true, scope:"creature"}` |
| `Untap all creatures you control. **They gain** flying UEOT.` | `{op:"grant-keywords-group", scope:"creaturesYouControl"}` |

**⛔ THE FILTER IS THE ENTIRE DANGER — guarded by an ALLOWLIST, not a denylist.** *"Birds you control get
+1/+1"* parses to the **SAME** `scope:"youControl"` **plus a `subtypeFilter`**. Rewriting that would untap
**every creature the card never mentioned** — a confident false positive. An antecedent qualifies only when
its **key set is EXACTLY the unfiltered shape**, so a filter field added later **disqualifies it
automatically** rather than needing this guard updated. Opponent-scoped antecedents are refused the same way.
Both pinned.

### ⚠️ A SILENT MISS IN MY OWN EARLIER SLICES, found by an unexplained flip
**Celestial Armor** flipped and was NOT in the predicted set. It is a *targeted* antecedent with a **TWO-keyword**
grant — so it flipped on the **clause-splitter keep-whole guard**, not the mass rewrite. *"They gain flying
**and** double strike until end of turn"* was shattering into `they gain flying` + `double strike until end of
turn`. **The referent arms had been shipping correct for ONE keyword and silently missing two since the first
slice.** A single-keyword grant has no internal `" and "`, which is exactly why nothing caught it — every test
I wrote used one keyword. Widening a keep-whole guard is the SAFE direction (keeping a sentence whole can only
fail to match; SPLITTING drops halves), and this is the second time that rule has paid this run.

**One of my OWN pins from the previous slice graduated within the same session** — it asserted a mass antecedent
stays refused. Re-pointed, with the FILTERED case kept as the live negative, since that is the hazard it was
really protecting.

**Gates:** 8 new tests including a runtime *untap-them* paired with a vacuity control, and an assertion that
the rewritten atom equals the explicit wording's atom. **Five mutations seen to fail.** Suite **1006 files /
12,831 green**, lint 0, MUTANT clean.

**Batch 3: 48 cards.** ⚠️ `cdh` still 86/100 — **Valley Floodcaller remains parked**: its mass antecedent is
SUBTYPE-FILTERED (*"Birds, Frogs, Otters, and Rats you control"*), which is precisely the case the allowlist
refuses. Its remaining blocker is now exactly one thing: **a multi-subtype union as a mass-pump selector.**

---

## ✅ BANKED (batch 3) 2026-07-30 — **OBJECT-FIRST REFERENT UNTAP. GAINED 14, LOST 0.** Best single slice since the colour filter.

Savage Surge · Veteran's Reflexes · Stony Strength · Vault Skyward · Soldier On · Refuse to Yield · Leo's
Guidance · Seedcradle Witch · Super Suit · Galadhrim Bow · Guac & Marshmallow Pizza · Burst of Strength ·
Dragonscale Boon · Silverflame Squire // On Alert.

**The referent family keeps paying because the BINDING is reusable and only the payload changes.** This arm
is the same mechanism with the pronoun as the verb's **OBJECT** (*"Untap it."*) rather than its subject
(*"It gains flying."*) — one regex and one atom, no new machinery. **Referent-family total so far: 37 cards
across three slices.**

**⭐ PREDICTED 11, MEASURED 14 — and every surplus row was audited, not assumed.**
| surprise | why the probe missed it |
|---|---|
| Burst of Strength · Dragonscale Boon | print the conjunction in ONE sentence — *"Put a +1/+1 counter on target creature **AND** untap it"* — which `splitClauses` breaks into two clauses anyway. My probe only looked for `". Untap"`. |
| Silverflame Squire // On Alert | an **adventure** card: the creature face has empty `oracle_text` and the real text lives on the *On Alert* face. A flip on a card whose `oracle_text` is `''` is exactly the kind of thing to distrust until explained — it explained. |

Same direction as the colour slice: **the sizing method UNDER-counted**, which is the safe way for it to be
wrong.

**⚠️ DELIBERATELY LIMITED TO A TARGETED ANTECEDENT.** Eight printed cards read *"Creatures you control get
+1/+1 until end of turn. **Untap them**."* — a **MASS** antecedent with no chosen targets. Binding there needs
the previous atom's **AFFECTED SET**, not its target list: a different mechanism. The assembly gate rejects
them (a mass atom has no `targetType`), so they stay on the Arbiter rather than **silently untapping
nothing**. Pinned in the tests.

⚠️ **`Valley Floodcaller` is one of those eight** — which is why this slice does NOT move `cdh`. Its two
blockers are now precisely: (1) the multi-subtype union in a TRIGGERED pump, and (2) a **mass-antecedent**
referent untap. Both are known, both are scoped, neither is built.

**Gates:** 4 new tests including a runtime one that untaps the bound creature and asserts its neighbour stays
tapped. Two mutations seen to fail. Suite **1006 files / 12,823 green**, lint 0, MUTANT clean.

### 📌 THE MASS-ANTECEDENT ARM IS THE NEXT MEASURED ITEM IN THIS FAMILY
Binding a referent to a mass atom's affected set would reach the 8 untap cards above **plus** whatever the
`gains <kw>` / `can't block` payloads add on mass antecedents (unmeasured). It is a genuinely different
binding — *affected set* rather than *target list* — so it wants its own measurement and its own gate before
any code. **Do not fold it into the existing `bindPreviousTargets` flag**; a mass atom's recipients are
computed at resolution, not chosen at cast, and conflating the two is how a referent starts granting to the
wrong permanents.

---

## ✅ BANKED (batch 3) 2026-07-30 — **REFERENT SCOPE C: can't-block + P/T. GAINED 6, LOST 0.**

Mugging · Blindblast · Duel Tactics · Wrap in Flames · Sparkmage's Gambit · Merciless Javelineer.

**The plan said +7; the measurement corrected it to 6 BEFORE any code was written.** *"Must be blocked this
turn if able"* is unmodelled **even for an EXPLICIT target** — so it is a separate mechanic, not a referent
arm. Including it would have credited cards whose payload nothing can resolve. **Check that the payload
exists for the SIMPLE case before adding the hard case's plumbing.**

**Plural referents needed no plural path.** Two of the six read *"each of up to N target creatures … those
creatures can't block"*; the previous atom's slice is a list either way. It DID need a test that separates a
per-permanent grant from a board-wide one — paired with a single-target vacuity control, because the plural
assertion alone would pass on a board-wide grant.

### ⚠️ I DELETED AN ARM I HAD JUST WRITTEN — third dead-code removal tonight, all three found by mutation
The compound `gets +N/+N and gains <kw>` form **never reaches the referent arm**: `splitClauses` breaks that
conjunction, so the clause arrives in halves. A mutation proved its all-or-nothing guard **untestable**. The
one printed card needing it (**Moment of Valor**) is MODAL and does not flip on this alone. Removed rather
than kept. *An arm that cannot be exercised is an arm that cannot be trusted.*

**Two more CREED pins GRADUATED, re-pointed with live negatives:**
| pin | why it graduated |
|---|---|
| `untapThenPump` — *"a draw rider past the anchor stays LOW"* | that matcher only ever handled its exact TWO-clause collapse. The general referent path parses the same text **compositionally**: `[untap target] → [bound pump] → [draw]`. Live negative kept: a referent with no antecedent. |
| `multiCountTarget` — *"Sparkmage's Gambit: can't-block rider unmodeled → zero atoms"* | that is exactly what this slice built. Live negative kept: a rider whose PAYLOAD is unmodelled (`must be blocked`) still drops the whole card to zero atoms. |

### ⚠️ PROCESS INCIDENT — a crashed mutation harness left a LIVE MUTANT in the tree
Running the mutation loop through a **Python subprocess** died on a Windows `cp1252` decode error mid-run,
leaving `return null; // MUTANT` in `combat.js`. **Caught immediately by the residue grep**, restored, and
re-run through bash instead. This is the exact scenario the auto-resume protocol's `grep -rl MUTANT` step
exists for, and it is the first time it has actually fired. **Run mutation loops through bash, not a Python
subprocess** — vitest's output is not cp1252-decodable and the wrapper dies mid-mutation.

**Gates:** 6 new tests; three mutations seen to fail. Suite **1006 files / 12,819 green**, lint 0, MUTANT
clean. Flip-diff **GAINED 6 / LOST 0**.

**Batch 3: 25 cards.** `cdh` unchanged at 86/100 — the referent family is corpus work, taken because the
scoped measurement said it was the best remaining vein.

---

## ✅ BANKED (batch 3) 2026-07-30 — **BOUND-REFERENT KEYWORD GRANTS. GAINED 17, LOST 0.** The scoped build shipped.

Rile · Justiciar's Portal · Battlefield Promotion · Arbor Armament · Assure // Assemble · Eutropia the
Twice-Favored · Captain America · Foggy Nelson · and **eight Equipment** with an attach-then-grant ETB
(Coral Sword, Squire's Lightblade, Quick-Draw Dagger, Twin Blades, Barbed Bloodletter, Bladed Battle-Fan,
Hidden Footblade, Illvoi Light Jammer, Stolen Stark Tech).

**Predicted ≤ 33 (scope A's upper bound), measured 17** — a 52% conversion, the safe direction for a bound to
be wrong. Rile, Coral Sword and Eutropia audited by hand against bundled oracle text before the number was
believed. Flip-diff **GAINED 17 / LOST 0**.

**The design in one line:** the atom carries **no `targetType`**, so it never enumerates a target; at
resolution it reads the PREVIOUS atom's target slice. The parser's long-standing refusal of unbound referents
is preserved **structurally** rather than by refusal.

### ⚠️ THREE MUTATIONS SURVIVED THE FIRST PASS — all three were real defects, none a nuisance
| mutation | what it exposed |
|---|---|
| *delete the binding entirely* | **My runtime test passed UNTAGGED targets.** The real cast path tags each target with the atom that chose it (`targeting.expandCastChoices`); untagged, `targetsForAtom` hands EVERY atom ALL targets — so the referent atom got the creature for free and the entire feature could be deleted with the file still green. |
| *bind to every target* | **Indistinguishable with ONE target on the stack.** Needed a three-atom case where a later atom targets independently. Without it, "bind to the previous atom" and "bind to everything" are the same test. |
| *ignore the index-0 case* | The explicit `i === 0` guard was **dead** — `atoms[-1]` is undefined, so the predecessor check already covered it. One check now, not two. **Second dead-line find of the night** (see the ward slice). |

### ⭐ AND THEN THE FULL SUITE CAUGHT WHAT THE TARGETED TESTS COULD NOT
Five failures across three files. The important pair: `parser.test.js`'s merge gate asserts **"low confidence
AND ZERO atoms"**, and my `programConfidence` check only lowered the confidence — **the atom was still there**.
Moved the check to **assembly**, where an unbindable referent is treated as an unparsed clause and the whole
program collapses to zero atoms, exactly as the `exile-if-dies` rider directly above it already did.
*A gate that lowers a verdict is not the same as a gate that removes the evidence.*

**Two CREED pins GRADUATED and were re-pointed, never deleted** (`equipAttach.test.js`) — their criterion was
*"the UEOT-grant rider is unmodeled"*, which stopped being true. **Each keeps a live negative**: an unmodeled
grant word (`protection from everything`), and a referent with no antecedent. ⚠️ One of them was carrying a
**hand-typed approximation of Squire's Lightblade** (no Flash line, wrong P/T and equip cost) that classifies
to a different tier than the real card — harmless while the assertion was `body-only`, wrong the moment the
card flipped. Corrected to the bundled text.

Also unescaped a literal `\u2014` that an earlier patch script wrote into seven JS comments (the one inside
`staticAbilityParser`'s REGEX literal is correct JS and was deliberately left).

**Gates:** 10 new tests; five mutations seen to fail. Suite **1006 files / 12,813 green**, lint 0, MUTANT clean.

**Shelf: `cdh` unchanged at 86/100** — none of the 17 is a `cdh` card. This slice was corpus work taken because
the scoped measurement said it was the best remaining vein, not shelf work. **Batch 3: 19 cards.**

**Next in this family (measured, not guessed):** scope B adds `gets +N/+N until end of turn` for **+1** card;
scope C adds `can't block this turn` / `must be blocked this turn if able` for **+7**. Scope C is the
worthwhile follow-up; B alone is not.

---

## 🎯 NEXT BUILD, SCOPED AND MEASURED 2026-07-30 — **REFERENT BINDING. Upper bound 113; scope A reaches 33.**

**The biggest remaining vein by a wide margin, and the first thing in this whole session that is NOT a
long-tail axis.** Found by asking why `Valley Floodcaller` needs *"Untap them"* — the parser **refuses
unbound referents by design** (`parser.js`: `if (/^(?:it|they|that|those|this)\b/.test(reflexiveText)) return
null; // primary-object referent`). It is a documented refusal, not a missing arm, and it recurs in several
places in that file.

**Measured:** **1,697** cards carry a sentence opening with a referent pronoun. **113** are cards where
*everything else already parses* — i.e. the referent sentence is the last thing standing.

⚠️ **113 IS AN UPPER BOUND, NOT AN ATTRIBUTION, AND THE DIFFERENCE MATTERS HERE.** The probe DELETES the
referent sentence, which deletes real payload text. A flip therefore means *"everything else on this card
parses"*, which is the most referent-binding could ever deliver — not what it will. The real number depends
on how many referent PAYLOADS get modeled, which is why the scope table below exists.

### The payload distribution (among the 113)
Subjects: `it` **58** · `that` **38** · `those` **8** · `it's` **6** · `they` **5**.
The dominant shape is overwhelmingly **a keyword grant to the previously-chosen object** — *"gains first
strike / indestructible / haste / hexproof / menace / trample until end of turn"*.

| scope | payload set | cards FULLY covered (every referent sentence on the card) |
|---|---|---|
| **A** | `<ref> gains <kw> until end of turn` | **33** |
| **B** | A + `gets +N/+N until end of turn` | 34 |
| **C** | B + `can't block this turn` / `must be blocked this turn if able` | **41** |

**Scope A is the slice to build**: it is 33 of the 41 available (80% of the reachable set for the least
machinery), and the payload — a keyword grant lasting until end of turn — is **already fully modeled for an
EXPLICIT target**. Only the BINDING is new. B adds one card for a whole second payload family; C adds seven
more and is the natural follow-up, not the first cut.

### The build, in order
1. **Bind the referent** to the immediately-preceding clause's chosen target(s) — the one genuinely new piece.
2. **Route the payload through the existing until-end-of-turn keyword-grant path**, so a bound referent and an
   explicit target resolve through identical code (no second implementation to drift).
3. Gate hard: a referent with **no** resolvable antecedent must stay unparsed (CREED — a mis-bound "it" is a
   confident wrong grant on the wrong permanent, the worst possible failure here).

⚠️ **Do NOT let this widen into pronoun resolution in general.** The 1,697-card pool is the temptation; the
113 is the reachable part; scope A is the profitable part. Everything else stays refused until measured.

**Shelf note:** this does NOT flip `Valley Floodcaller` on its own — it needs the multi-subtype union in a
TRIGGERED pump as well (verified: fixing either alone leaves it `body-only`; both → `native-mixed`). Note the
union works in a STATIC anthem already (*"Birds and Rats you control get +1/+1"* is `native-static`), so that
second gap is a trigger-path arm, not a new mechanic.

---

## 🧭 REGIME CHANGE 2026-07-30 — **FOUR AXES MEASURED, ALL PAY ZERO. Read this before hunting another.**

Four separate veins measured this session with verified controls. **Every one is a real axis. Every one
attributes to ZERO.** That is not four unlucky picks — it is a description of what the corpus has become.

| vein | carriers | attributable | why it pays nothing |
|---|---|---|---|
| spell-side delayed triggers | 157 non-native | **4** | and 0 of those 4 have a modeled inner payload |
| `deals combat damage to YOU` | 7 | **0** | dealer side fully built; every carrier has a 2nd blocker |
| opponent-scoped impulse exile | 25 | **0** | `your library` impulse IS native; scope is never the only gap |
| `you may CAST that card` vs `play` | 7 | **0** | a ONE-WORD gap, and still not the only one on any card |

**⭐ THE SHAPE OF THE REMAINING CORPUS.** Take the impulse family, which is the clearest specimen. Exactly
ONE form is modeled: *"exile the top card of YOUR library. Until end of turn, you may PLAY that card."* Around
that single sentence sit **four independent gaps**, each verified separately:
- the opponent scope (`that player's` / `each opponent's` / `target opponent's`)
- the verb (`cast` instead of `play`)
- the free-cast rider (`without paying its mana cost`)
- the compound trigger (`create a Treasure token AND exile…`)

**Ragavan needs three of the four.** No single widening flips him, or anyone else. Earlier in this run one
parse arm paid **52 cards**; that regime is over. **The remaining corpus is narrow modeled forms surrounded by
several independent gaps each**, so the unit of work is now "a card's whole stack," not "a vein."

**What this means for the shelf, stated plainly rather than discovered again in three sessions:**
`cdh` sits at **86/100** and needs **4**. Every remaining card is a 2-to-4-mechanic build. That is perfectly
doable — it is just **~4 multi-mechanic slices, not 4 vocabulary slices**, and the honest forecast is a few
cards per session rather than tens.

**⚠️ THE METHOD LESSON, since it fired four times:** an axis being REAL is not evidence it is PROFITABLE.
*Dealer-side built + recipient-side absent* looked identical in all four cases to the shapes that paid 52 and
7 earlier today. **The only thing that separated them was the measurement.** Cost of measuring: one probe,
about two minutes. Cost of building unmeasured: a slice that flips nothing and must be reverted. **Always
phrase-swap first, always print the control** (clause D — two of these four probes had a bad control on the
first attempt and would have reported a false zero for the wrong reason).

---

## ✅ BANKED (batch 3) 2026-07-30 — **GROUP-GRANTED "WARD—PAY N LIFE". GAINED 2, LOST 0.** cdh 85 → 86.

**Hexing Squelcher** (a `cdh` slot) · **Hag of Mage's Doom**.

**⭐ NEITHER GAP WAS THE MECHANIC.** Granted ward has worked since Cathedral Acolyte — it just carried
**generic mana only**, so a LIFE cost had nowhere to live. And the quoted-grant branch swallowed *every*
`<selector> have "…"` clause on an assumption **written into its own closing comment**: that such a clause is
never also a plain keyword grant. **Quoting is a printing convention, not a rules distinction** (CR 702.21 —
a granted keyword ability is the same ability either way), which is why `have flying.` was `native-static`
while `have "Flying."` was `body-only`. The quoted form now delegates to `parseAnthemHaveTail`, the SAME
all-or-nothing oracle the unquoted path uses, so it can only accept bodies the unquoted path already did.

**⚠️ A MUTATION KILLED A LINE I WROTE — and that is the entry worth reading.** I added a guard to reject
unmodeled ward spans explicitly. Disabling it **failed nothing**: the grantable-keyword check downstream
already rejects `ward—sacrifice a permanent` and `ward {2}` after punctuation-stripping. **Belt-and-braces
that no mutation can kill is dead code justified by a hypothetical.** Removed; the comment in its place names
the change that WOULD need it (adding `ward` to `GRANTABLE_KEYWORDS`). *A line no mutation can kill is either
dead or untested — decide which, don't leave it.*

**A test name was hollow too:** it claimed to *sum* a printed and granted ward while only asserting a selector
miss. Split into the two things it should prove; the sum case (**printed 1 + granted 2 = 3**) now pins the
addition itself.

**Refusals asserted, not assumed:** `Ward—Sacrifice` (Mishra) and `Ward—Discard` have no payer-choice model,
and the MANA form belongs to the existing `generic` channel — routing it here would price a `{2}` ward as
**2 life**, a different cost.

**Gates:** 11 new tests driving `ward.wardTaxForStackObject`, every enforcement claim paired with the same
measurement without the granter. Five mutations seen to fail (the sixth is the dead line above). Predicted 2,
measured 2. Flip-diff **GAINED 2 / LOST 0**. Suite **1005 files / 12,802 green**, lint 0, MUTANT clean.

### ⚠️ TWO LEDGER CLAIMS THIS PROBE FALSIFIED — corrected here so the next resume isn't misled
1. **`noncreature` flash qualifier is ALREADY BUILT.** It sat at **#2 on the recommended build order** as
   unmodeled. Per-line probing shows Valley Floodcaller's *"You may cast noncreature spells as though they had
   flash"* classifies **OK** today. **Do not build it.**
2. **Valley Floodcaller has TWO blockers, not one.** Its only remaining failure is the pump line — and the
   comma list is a red herring: *"Birds AND Rats you control get +1/+1"* fails too, so it is **any
   multi-subtype union in an anthem target**, not the comma count. *"Untap them"* is a second, independent
   blocker (it fails on its own with a single subtype). Two mechanics for one card.

**⚠️ Also measured and REFUSED: "deals combat damage to YOU"** — the recipient-side twin of the fully-built
dealer-side family (`deals combat damage to a player`). Textbook axis shape, and it still pays **0**: 7 cards
carry it, **0 are attributable** (control verified `native-trigger` first). Every one has a second blocker —
The Cabbage Merchant needs *"sacrifice a Food token"* as well. **An axis being real does not make it
profitable; measure before building.**

---

## 🚀 SHIPPED 2026-07-30 — **v0.149.20 PUBLISHED AND VERIFIED BY CONTENT. 89 cards, ten slices, one tag.**

**The first full batch under the new cadence** (Colton, 07-29: *"you cutting to many releases put more work in
before each cut"*). Ten slices landed on master individually with their own gates; **one** update banner.

| check | result |
|---|---|
| `latest.json` version | **0.149.20** |
| installer URL | resolves to a real asset **in this release** |
| signature | **424 chars**, decodes to `untrusted comment: signature from...` |
| installer size | **129,882,641 bytes** — not a stub |
| release state | published; **not** draft, **not** prerelease |
| tag ↔ tree | tag == master == the bump commit; **both** version files read 0.149.20 |

**Verified by CONTENT, never by filename** — the standing law after the v0.149.13 incident, where a pushed tag
rendered a release-looking page that had shipped nothing. The tag/tree check was run BEFORE the push, which is
the cheap half: tagging ahead of the version-bump commit is the easiest way to publish a correct-looking
release of the wrong tree.

**Slice roll-up:** colour cast-trigger filter **52** · planeswalker subtypes + `another <filter>` **11** ·
cost-reducer filter vocabulary **8** · life-gain replacement **7** · controller sac nouns + counter placement
**5** · condition disjunction/negation **4** · turn-scoped flash grant **1** · granted uncounterability **1**.
Plus the 24-citation CR correction (comment-only) and two refusals banked with their numbers.

⚠️ **Carries one known defect**, found after the tag was already building and fixed on master for the next
release: the lifegain trigger read the OFFERED amount (entry below). Under-report only, nothing fabricated.

**BATCH 3 STARTS AT 0.** The next tag wants ~100 cards again — but see the shelf pointer at the top: the
tractable veins are spent on both `cdh` and the corpus census, so batch 3 will fill from **bespoke mechanisms
at roughly 1–7 cards each**, not from another 52-card find. Budget the batch accordingly rather than reading
the slow fill as a problem.

---

## ✅ BANKED (batch 2) 2026-07-30 — **LIFE-GAIN REPLACEMENT, BOTH ARMS. GAINED 7, LOST 0.**

Rhox Faithmender · Boon Reflection · The Wind Crystal (**×2**) · Angel of Vitality · Heron of Hope ·
Honor Troll · Knight of Dawn's Light (**+1**).

**⭐ THE LAST MISSING MEMBER OF A FAMILY.** `replacementEffects.js` already carried **counters, tokens, mill
and mana — each with BOTH a multiplier and an additive arm.** Life gain had neither, and it is the same shape
as the four that worked. The axis pattern again, this time *inside a module whose other four arms were already
built* and could be copied almost line for line. **When a module has N parallel arms, enumerate them and check
for the missing one** — that is now three finds this run from the same question.

**Order is `(base + additive) × multiplier`**, byte-identical to `applyCounterDoubling`. CR 616.1 hands the
choice to the AFFECTED PLAYER when replacements compete, and that is the order they'd pick — an Angel of
Vitality plus a Rhox Faithmender turns a gain of 2 into **6, not 5**. Applied at `gameState.gainLife`, whose own
comment establishes it as **the single verified life-gain chokepoint** ("no direct `p.life +=` elsewhere") — so
spell, drain-half, lifelink combat damage and the radiation replacement are all covered by one call site. The
this-turn ledger records the **REPLACED** amount (*"you gained life this turn"* must see what the player
actually gained).

**⚠️ TWO BUGS OF MY OWN, both caught before the flip-diff:**
| bug | why it mattered |
|---|---|
| the profile's **null guard didn't list the new field** | a card whose ONLY ability is the replacement — **Boon Reflection, the purest case** — had its whole profile dropped |
| the parse was **`^`-anchored** | cost **5 of the 7 cards**. `doublerProfile` splits the oracle on `"."`, so a preceding keyword line with no period of its own (`"Flying\nIf you would gain life…"`) or a reminder-text tail rides at the head of the same fragment. **The other arms in this file are unanchored for exactly that reason.** I anchored on the assumption that a sentence split yields sentences. It does not. |

**Gates:** 12 new tests, every enforcement claim paired with the same measurement in the effect's absence.
**All six mutations seen to fail** — dropping the controller gate (1), flipping the order to `base*mult+add`
(1), letting a 0 gain fabricate life (1), making the chokepoint ignore the replacement (5), recording the
offered amount in the ledger (1), collapsing the additive arm into the factor arm (5). Clean `MUTANT` grep.
Predicted 7, measured 7. Flip-diff **GAINED 7 / LOST 0**. Suite **1004 files / 12,789 green**, lint 0.

---

## 🐛 FIXED 2026-07-30 (post-tag) — **THE LIFEGAIN TRIGGER READ THE OFFERED AMOUNT. My bug, two commits old.**

**⭐ THE CODEBASE ALREADY CARRIED THE ANSWER AND I DIDN'T READ IT.** `atoms/counters.js:156` has done this
correctly for as long as counter-doubling has existed, with the rule written in its own comment: *"Mirror the
ACTUAL placed amount for the watcher."* I wrote a new arm of the SAME family and skipped the step. The token
arm is right too (it iterates the actually-minted ids). **Life gain was the only arm that got it wrong — so
there is no wider bug**, which I verified rather than assumed.

**What broke:** the replacement made `gainLife` apply a different number than the caller asked for, and **nine
call sites** hand `checkLifegainTriggers` the amount the EFFECT OFFERED. Identical numbers until this morning.
Under a Rhox Faithmender a *"whenever you gain life"* trigger saw **4** where the player gained **8**, so any
*"for each 1 life you gained"* rider counted half. Direction was UNDER-report — FN-safe, nothing fabricated —
but wrong.

**Fixed centrally in `checkLifegainTriggers`, not at the nine sites**, so a call site that never learns about
replacements stays correct and the fix cannot drift as sites are added. Reading the replacement off the
POST-gain state is exact, not approximate: `gainLife` moves no permanents, so the sources are identical either
side of the gain it just applied.

**⭐ HOW IT WAS FOUND, and the transferable part:** I went to confirm a claim **I had already written into a
code comment and a commit message** — that lifelink routes through `gainLife`. It does (`combatResolution:584`).
**The line immediately next to the one I was verifying was the bug.** Verifying a claim you already made, and
expect to be right about, is worth doing — the cost is one grep and it caught a shipped defect.

⚠️ **It shipped in v0.149.20**, which was already tagged and building when I found it. Rides to the next
release; a tag is not re-cut mid-build.

### ⚠️ AND THE ENTRY ABOVE HAD TO BE WRITTEN TWICE — shell-quoting ate it, for the SIXTH time this run
The first attempt went through `python -c "..."` from bash. **Every backticked identifier in it was read by
bash as command substitution and replaced with the empty string** before Python ever saw the source — the
entry committed with `gainLife`, `checkLifegainTriggers` and the file:line citation simply *missing*, which
reads as a sentence with a hole in it rather than as an error. Bash even printed
`atoms/counters.js:156: No such file or directory` and I had already moved on.

**The banked rule is one line and I keep breaking it: write patch scripts with the Write tool, never through
shell quoting.** Five incidents earlier this run (heredocs eating backslashes, a `\n` becoming a real
newline); this is six. The failure mode is always the same shape — **the shell silently edits the payload and
the result still looks plausible.** Treat any `python -c` / `node -e` containing backticks, `$`, or
backslashes as already broken.

---

## ⛔ REFUSED 2026-07-30 — **THE COLOSSUS GRAVEYARD-SHUFFLE. 4 attributable, but 15 chokepoints.**

*"If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead"* —
**Darksteel Colossus · Progenitus · Legacy Weapon · Blightsteel Colossus** (Nexus of Fate carries another
blocker). Phrase-swap says **4**, and the census ranked it the biggest shelf-relevant cluster left.

**Not built tonight — but ⚠️ MY FIRST STATED REASON WAS WRONG BY 3x, corrected below before anyone inherits it.**

I wrote "15 distinct graveyard write sites" off a grep for `graveyard:`. **The real number is 5 writes**, and
a general zone mover (`gameState.moveCardToZone`, :648) already exists and carries the battlefield-to-graveyard
death path. The other four are `placeCounteredCard` (stack.js:101, already a named helper), runProgram.js:109,
and three bulk moves in gameState (surveil :864 / reveal :890 / mill :910). **The 15 was initializations
(`graveyard: []` in fresh player state and test probes) and READS counted as writes** — the third time this
session a COUNTING METHOD produced a confidently wrong number (see also the non-global `.replace` and
containment-vs-attribution). Grep the shape you actually mean: `graveyard: [...` not `graveyard:`.

**The honest reason to defer is scope-at-this-hour, not structure.** It is a real refactor with real blast
radius (every zone change in the engine) and it wants a session with a clean tree in front of it, not the tail
of a ten-slice batch. There are only two ways to ship this today and **both are forbidden**: a
coverage marker with no runtime enforcement (the hollow-gate law — ABSENCE ≠ VALUE), or partial enforcement
that is silently wrong on every path I didn't touch (a **confident false positive** — the card reads native
while still hitting the graveyard from an unpatched site).

**The prerequisite is a refactor, and it is a good one on its own merits:** funnel the 15 sites through one
`putIntoGraveyard(state, card, {from})` chokepoint, the way `gainLife` already is for life and `counterSpellById`
is for the stack. **Every replacement in this family has needed exactly one chokepoint to be correct** — that is
the pattern the module is built on. Do the refactor first; this card family, and any future graveyard
replacement, then costs one arm each. **Queued, not abandoned.**

---

## ✅ BANKED (batch 2) 2026-07-30 — **GRANTED UNCOUNTERABILITY + 24 WRONG CR CITATIONS. GAINED 1, LOST 0.**

**Vexing Shusher** — `{R/G}: Target spell can't be countered.` **cdh 84 → 85 of 100** (verified by re-running
`deck-gap.mjs`, not assumed from the flip).

**⭐ THE MISSING ARM OF A MECHANIC THAT WAS OTHERWISE COMPLETE — and the source had named the gap.**
`spellEffects.js` carried the sentence *"granted / external 'can't be countered' isn't modeled"* for as long as
the gap existed. Four uncounterability paths already worked and **all four are STATIC or ON-CARD**: the printed
self-reference, the subtype board static (Root Sliver), the controller static (Chimil), the type-filtered
controller static (Prowling Serpopard). Every one answers *"is this spell uncounterable?"* by **re-deriving it
from the board**. A one-shot grant leaves nothing on the board to re-derive from — so it needed a **mark on the
stack object**, not a fifth derivation. That is the entire design; the rest is plumbing.

**The mark rides the stack OBJECT, not the card.** Two copies of one spell on the stack are separate objects and
only the targeted one is protected; a spell that resolves and is re-cast is a new object with no mark. A test
asserts the *neighbouring* spell stays counterable — the only thing separating this from Chimil, and nothing
else in the file would have caught a leak.

**`grantNotCounter` is the Double Major precedent read a second way.** A copy and a grant both target a spell
*without trying to counter it*, so neither may have the uncounterability exclusions applied to its own target
enumeration. Targeting an already-protected spell with the grant is legal if pointless (CR 601.2c); excluding it
would be a false negative on legality. The counter path sets neither flag and is byte-identical.

**⭐ POSITIVE CONTROL RUN BEFORE THE BUILD, NOT AFTER.** Line 1 alone → `native-static`; line 1 + a known-good
activated ability → `native-mixed`; line 2 alone → `body-only`. The harness could demonstrably produce a native
in that slot, so the whole card's `body-only` was attributable to line 2 **and nothing else**. Predicted 1,
measured 1 — the wording is a corpus of exactly one card. Flip-diff **GAINED 1 / LOST 0** against a baseline
regenerated from a clean tree (diff saved, `git checkout`, measure, re-apply — never `git stash`, per the
shared-worktree hazard).

**Gates:** 9 new tests, **every exclusion paired with the same assertion in the grant's absence** so an empty
target list can never pass for a working gate. **All five mutations seen to fail** — disabling the read-site
exclusion (2), making the mark global (2), dropping the parse registration (1), dropping the not-a-counter carve
(1), letting the fizzle path mark the wrong object (1). Reverts confirmed by a clean `MUTANT` grep. Suite **1003
files / 12,777 green**, lint 0.

### 🚨 SEPARATE COMMIT — **24 CR CITATIONS FOR COUNTERING POINTED AT THE WRONG RULE** (9 files)
Every `CR 701.5a` and `CR 701.5e` in the counter/uncounterable code was wrong. In the current bundle **701.5a is
the CAST rule** — *"To cast a spell is to take it from the zone it's in…"* — nothing to do with countering. **701.5e
does not exist at any point in the bundle.** The counter keyword action is **701.6**, with exactly two subrules:
**701.6a** (what countering is, where the card goes) and **701.6b** (no refund of costs paid).

The CR renumbered the keyword-action section out from under these comments and nothing re-checked them. **Found
only because I verified a citation before writing a new one into a comment of my own** — the code was correct the
whole time and no test could ever have caught it. This is precisely the rot the never-fabricate rule exists for.
⚠️ **"Can't be countered" has NO subrule of its own** — it is a continuous effect preventing the 701.6a action.
Eleven comments implied otherwise. The load-bearing site now says so and **names the dead number**, so the next
reader doesn't re-search the bundle for a 701.5e. Comment-only; zero behavior change, verified by diffing for any
non-comment line.

---

## ⛔ REFUSED 2026-07-30 — **SPELL-SIDE DELAYED TRIGGERS. Containment said 157; attribution says 4.**

Chased because `Pact of Negation` (a `cdh` slot) is blocked by *"At the beginning of your next upkeep, pay
{3}{U}{U}. If you don't, you lose the game"*, and the Pact cycle is a clean bounded six (Guild · Slaughter ·
Summoner's · Intervention · of the Titan · of Negation, all `{0}`).

**The phrase-swap killed it in one step, and the first control I wrote was itself hollow.** Swapping the pact
rider for *"At the beginning of your next upkeep, draw a card."* left **all six still `arbiter-spell`** — so the
rider was never the blocker. Isolating one variable at a time proved the `{0}` cost is irrelevant (the payload
alone is `native-spell` at `{0}`, at `{2}{B}`, and at an EMPTY cost) and that **any second-line delayed trigger
flips an instant to arbiter** — including my supposedly-known-good control. ⚠️ **A control is not a control until
you have checked that IT is modeled.** I asserted a positive without verifying the positive existed.

Widening to the whole family: **191** instants/sorceries carry a *"at the beginning of the next …"* delayed
trigger and **34 are already native** (Ephemerate, Staggershock, Profound Journey, Terramorph) — the scheduler
itself works. Of the **157** non-native, phrase-swap attributes **exactly 4** to the delayed clause (Mangara's
Blessing · Synthetic Destiny · Quenchable Fire · Liberate), and **of those 4, ZERO have an inner payload that
already parses inline** — so the buildable subset is smaller than 4. The 157 are carrying other blockers.

**Containment 157 → attribution 4 → buildable <4.** The single sharpest demonstration yet of why the sizing rule
is written the way it is. Not built; the number is banked so nobody re-measures it.

---

## ✅ BANKED (batch 2) 2026-07-30 — **COLOUR AS A CAST-TRIGGER FILTER. GAINED 52, LOST 0.** Biggest slice since v0.149.19.

The Talisman / Horn / Tooth / Sphere / Rod / Cup artifact cycles · **Aragorn, the Uniter** · Warmth ·
Kor Firewalker · Sol'kanar the Swamp King · Nettle Sentinel · Kozilek's Sentinel · Molten Nursery ·
Cinder Pyromancer · Iron Man, Tony Stark · Zuko, Avatar Hunter · Drowned Secrets · Balefire Liege · the Duo
and Initiate cycles.

**⭐ THE MISSING SIBLING OF A FILTER THAT WAS ALREADY THERE.** `castSpellFilter` had already carved out
`historic` and `multicolored` as whole-object QUALITIES — precisely because a quality is not a type-line token,
so the subtype denylist rejects it and it must be handled explicitly. Single colours are the same shape, and
the `multicolored` comment had **already written the CR justification**: *"the color of a spell is fixed by its
mana cost / color indicator at cast, so the printed colorsOf reading is CR-faithful for the cast event."*
Nothing about a single colour differs. Two arms and one matcher branch.

**⛔ COLORLESS IS THE ABSENCE OF COLOUR, NOT A SIXTH COLOUR (CR 105.2c)** — its own filter with an empty-set
test. Folding it in would make every colourless spell match every colour filter. **This is the THIRD place in
the engine that distinction has had to be made explicitly** (the condition grammar and the mass-damage grammar
are the others) — a recurring shape worth recognising on sight.

**⭐ PREDICTED 13, MEASURED 52 — and the surplus was real.** The phrase-swap probe scanned only the
`whenever YOU cast` wording, while `castSpellFilter` serves **all four cast subjects** (you / an opponent /
a player / each player). The artifact cycles all read *"whenever a PLAYER casts a <colour> spell"* and were
invisible to the probe while being fixed by the same line. **Audited by hand against bundled oracle text
before being believed** — Wurm's Tooth (`whose:any`), Warmth (`whose:opponent`), Kozilek's Sentinel
(`colorless`, devoid), and Aragorn emitting FOUR separate colour triggers were each checked. Note the
direction: this is the sizing method under-counting, which is the safe way for it to be wrong.

**Five pins moved across four files, every one the SAME capability sentence:** *"these words are NOT type-line
subtypes, so a subtype match would never fire → staying undetected avoids a never-firing native."* That
objection was to a SUBTYPE SCAN, not to the filter — and colour is no longer a scan.
| pin | verdict |
|---|---|
| `castTriggers` "does NOT detect an unmodeled filter (color / kicked / permanent / legendary)" | colour graduated; **`kicked` / `permanent` / `legendary` / `alliterative` untouched** — they still have no reader |
| `castTriggers` "a color/kicked cast-trigger stays body-only" | colour graduated, kicked kept |
| `castTriggerForms` "'from your graveyard' rider / color filter stay undetected" | colour graduated, the rider guard kept |
| `anthemProtection` "Balefire Liege — the cast-trigger riders are unmodeled residue" | its own reason was the criterion; the anthems were always fine, only the riders parked it |
| `murkfiendUntap` "Balefire Liege … stays body-only" | same card, same verdict |

**Gates:** 17 new tests including a **RUNTIME fire test** (the matcher is module-private, so it drives
`checkCastTriggers` and counts what enqueued — a red watcher fires on red, not on green, not on colourless,
and does fire on a multicoloured spell containing red, CR 105.2b). **All three mutations seen to fail** —
folding colourless into the colour list (1), making the colour match any colour (1), dropping the parse arm
(**12**). Reverts confirmed by `git diff`. Flip-diff **GAINED 52 / LOST 0**. Suite **1002 files / 12,768
green**, lint 0 unpiped, MUTANT clean.

⚠️ One test in the first draft was HOLLOW — a "matcher" block that dynamically imported a non-existent export
and asserted `typeof x === "function" || x === undefined`, which is true either way. Replaced with the runtime
fire test above before running the mutations.

**BATCH 2: 81 cards** since v0.149.19 — at the ~100 threshold soon.

---

## ✅ BANKED (batch 2) 2026-07-30 — **COST-REDUCER FILTER VOCABULARY. GAINED 8, LOST 0** (first cut LOST 5).

Ballyrush · Bosk · Brighthearth · Frogtosser · Stonybrook Banneret · Iron Lad, Young Avenger ·
Longshot, Rebel Bowman · Valeria Richards, Precocious.

**⭐ FOUND WITH THE CORRECTED METHOD, WHICH IS WHY THE NUMBER HELD.** The phrase-swap probe (see the METHOD
CORRECTION entry) measured **14 attributable** cost-reducer filter cards, grouped by the failing token. 8 of
those 14 sit in two shapes; the build took both and the flip-diff matched. Compare the containment/line-removal
numbers that sent the previous turn chasing an already-built Treasure vein.

The reducer's parse arm anchored on a SINGLE `[a-z]+` word, so every multi-word filter failed outright:
- **two-SUBTYPE union** — "Goblin spells and Rogue spells you cast cost {1} less" (the Banneret cycle, 5)
- **negated CARD TYPE** — "Noncreature spells you cast cost {1} less" (3)

**⭐ THE NEGATION'S EXCLUSION WAS CAPABILITY LANGUAGE, and the source said so.** `noncreature` sat in
`NON_SUBTYPE_COST_FILTER_WORDS` because *"a word-bound type-line match for these would NEVER fire, so claiming
the reducer native while it silently reduces nothing is a CREED false positive."* Exactly right — about the
IMPLEMENTATION. The fix is a real `notCardType` PREDICATE (does the type line LACK the word?) rather than a
scan, so the word stays excluded from the scan-based arm and the reducer fires on exactly the printed set.

**⛔⭐ THE FIRST CUT REGRESSED FIVE CARDS, AND THAT IS THE LESSON.** My union arm `return`ed unconditionally, so
when its guard REJECTED a filter it still CONSUMED the clause — and the Familiar cycle (Nightscape /
Stormscape / Sunscape / Thornscape / Thunderscape, *"Blue spells and red spells you cast cost {1} less"*,
whose words are colours) stopped reaching the later arm that already handled it. **GAINED 8, LOST 5.**
A widening must be gated behind the prior paths' FAILURE; swallowing the clause on rejection inverts the
ordering rule and silently NARROWS the engine. Fixed by falling through instead of returning → **LOST 0**.
Caught by the flip-diff's LOST column, which is precisely what it is for — no test would have flagged it,
because the regressed cards had no failing assertion, only a quieter tier.

**Two pins moved, both naming their own criterion:**
| pin | verdict |
|---|---|
| `costReduction` "noncreature → no cost-reduction marker" | Its block's rationale — *"its word-bounded type-line match would never fire"* — described the implementation. Graduated and removed from the exclusion list; positive pins (both directions + fail-closed) live in the new file |
| `staticResidueST2` "Brighthearth Banneret … emits NO reducer" | ⭐ Its sentence WAS the criterion: *"the single-subtype enforcement **can't OR two subtypes**, so the compound stays unmodeled."* It can now — ONE descriptor carrying `subtypes: [...]`. **The hazard it named is preserved, not dropped**: a new sibling pin asserts a spell matching BOTH halves (a second Brighthearth IS an Elemental Warrior) is reduced **ONCE**. Two descriptors would have given it {2} off a card that says {1} |

**Gates:** 11 new tests + 1 new sibling pin; **all three mutations seen to fail** — consuming the clause on
reject (2, the regression itself), double-counting the union (1), inverting the negation (1). Reverts confirmed
by `git diff`. Flip-diff **GAINED 8 / LOST 0**. Suite **1001 files / 12,751 green**, lint 0 unpiped, MUTANT
clean, module graph loads.

**STILL PARKED from the measured 14** (each a distinct filter shape, 1 card apiece): `planeswalker` ·
`aura and equipment` · `face-down creature` · `historic` (needs the CR definition: legendary OR artifact OR
Saga) · `colorless` (not a WUBRG colour, so the colour arm correctly refuses it).

**BATCH 2: 29 cards** since v0.149.19.

---

## 🔬 METHOD CORRECTION 2026-07-30 — **LINE-REMOVAL ATTRIBUTION IS WRONG. Use PHRASE-SWAP.** Read before sizing any vein.

No code shipped. This invalidates a sizing method used repeatedly in this run and explains several
under-predictions, so it outranks the slice it interrupted.

**THE THREE MEASUREMENTS OF THE SAME MECHANICS, WORST TO BEST:**

| method | Ward | Treasure | "you may cast that card" | Food |
|---|---|---|---|---|
| **containment** (oracle contains the marker) | 155 | 280 | 90 | 150 |
| **line-removal** (delete the whole line, re-classify) | 8 | **35** | **33** | 8 |
| **⭐ phrase-swap** (swap the PHRASE for a known-good payload) | — | **0** | **0** | **2** |

**⛔ WHY LINE-REMOVAL LIES, and it is subtle enough that it passed as rigour.** Deleting the LINE containing a
mechanic also deletes whatever else lives on that line — and for a triggered ability that is **the trigger
itself**. Removing *"Whenever Ragavan deals combat damage to a player, create a Treasure token"* flips the card
because the TRIGGER vanished, not because Treasure was the blocker. The measurement answers "is this line a
problem?" while the question is "is this MECHANIC the problem?".

**✅ PHRASE-SWAP IS THE HONEST TEST:** replace only the mechanic's phrase with a known-good payload of the same
grammatical shape (`create a Treasure token` → `draw a card`), leaving every trigger, cost, condition and
sibling clause intact. Only a card that flips is genuinely blocked by the mechanic. **Removal attribution only
works when you remove the MINIMAL thing under test** — the whole-line version silently widens the removal.

**⭐ WHAT THIS COST, AND WHAT IT EXPLAINS.** Acting on the 35 would have meant building a Treasure vein that is
**already fully built** (`NAMED_TOKENS.treasure` plus ~8 parse arms). The 35 head cards are each blocked by
something else entirely — a replacement effect (Hullbreacher), a remove-counter activation cost (Fain), a
combat-damage trigger (Ragavan), an end-step intervening-if (Relic Retriever), an exile-then-conditional chain
(Bonehoard Dracosaur). It also retroactively explains this batch's misses: **mass bounce predicted 6 / got 3**,
**turn-scoped flash predicted 4 / got 1**. Those predictions came from clause-level or line-level probes that
could not see the rest of the card.

**AND THE CONTAINMENT TRAP FIRED AGAIN IN THE SAME HOUR.** Ward measured "53 parked / 3 native" by containment
and looked like the biggest unbuilt mechanic on the board — **Ward is already implemented** (actionDispatcher's
`KW-WARD` block, CR 702.21a, verified in `cr_current.json`: *"Ward is a triggered ability… counter that spell
or ability unless that player pays [cost]"*). I wrote "a LEAD, not an attribution" in that probe's own header
and then let it drive the decision anyway. **Writing the caveat is not the same as honouring it.**

**THE RULE, for every future vein:**
1. Containment answers nothing. It is a candidate list, never a size.
2. Line-removal over-counts whenever the mechanic shares a line with a trigger/cost/condition — i.e. usually.
3. **Phrase-swap, then audit the head by hand.** If a group's members each fail for a different reason, the
   group is an artifact of the probe, not a vein.
4. Before building any "unbuilt" mechanic, **grep for it in the source first** — Ward, Treasure and Food were
   all already implemented.

**STATUS: batch 2 unchanged at 21.** The cdh gap's remaining items are still bespoke per-card mechanisms; the
mechanism-reach ranking that motivated this detour is withdrawn.

---

## ✅ BANKED (batch 2) 2026-07-30 — **TURN-SCOPED FLASH GRANT. GAINED 1, LOST 0.** The third attempt, and the fix was one line.

**Borne Upon a Wind** — and it is the **first card off the `cdh` shelf gap: 83 → 84 of 100.**

**⭐⭐ THE WHOLE STORY IS "READ THE DISPATCH INSTEAD OF PROBING IT".** Two earlier attempts banked FOUR separate
"gates", every one inferred from black-box probing of `parseEffectClause` / `parseEffectProgram` outputs:
- **Gate 3 (a card-level gate rejecting the two-line card) NEVER EXISTED.** A control run — one unparseable
  line plus one good one — produces the identical `low` + whole-oracle `unparsedTail`. That output is how
  all-or-nothing failure is REPORTED. I had read a failure MESSAGE as a failure CAUSE.
- **Gates 1 and 2 collapsed into ONE real cause.** The α2 "you may" peel does strip the prefix (Gate 1, a true
  observation) and does stamp `optional: true` (Gate 2) — but the stamp was not a cosmetic wart, it was the
  blocker, because an optional grant is rejected downstream.
- Reading `parseClauseToAtom` end-to-end found the answer in minutes: the peel **already had a documented
  NON-optional allowlist for exactly this situation**, with the reasoning written beside it —

```js
return (inner.op === "free-cast" || inner.op === "play-extra-land-this-turn") ? inner : { ...inner, optional: true };
//  "…its optionality is realized at the ACTION layer … Stamping `optional` would double-prompt"
//  "…costless upside with no resolution-time decision, so the atom is left UN-optional too"
```

A turn-scoped casting permission is the **third member of that family**. The fix was adding the op to that
list. ⭐ **Two sessions of probing versus one bounded read of the dispatch — and the codebase had already
written down the answer.**

**THE THREE TOUCH POINTS** (each verified in isolation across the earlier attempts, all correct):
- `gameState.grantFlashThisTurn` + `flashGrantsThisTurn`, cleared inside `resetSpellsCastAllPlayers` — the
  SAME untap reset as the other per-turn player counters, so there is ONE reset site and a new turn cannot
  half-clear it. ⛔ A permission that leaked would let the player cast at instant speed **forever**: strictly
  MORE PERMISSIVE than the card, the forbidden direction, and it would never surface as a failing card — only
  as an engine quietly allowing more than the rules do.
- `legalChoices.flashPermissionSpecsFor` reading the turn stamp alongside the battlefield statics — ONE list.
- `staticAbilityParser.parseFlashCastFilter` **exported and reused**, so the turn-scoped twin cannot drift from
  the static form of the identical printed words.

**Gates:** 10 new tests; **all three mutations seen to fail** — restoring the `optional` stamp (**4**),
dropping the untap reset (1), dropping the collector (3). Reverts confirmed by `git diff`. Flip-diff
**GAINED 1 / LOST 0**. Suite **1000 files / 12,740 green**, lint 0 unpiped, MUTANT clean, module graph loads.

**⚠️ MIXED LINE ENDINGS BIT THE PATCH SCRIPT.** `gameState.js` is CRLF while `legalChoices.js`, `parser.js`,
`misc.js` and `staticAbilityParser.js` are LF. A script assuming one newline style asserted out mid-run
(correctly — the assert protected the tree, and the partial patch was reverted before retrying). **Patch
scripts must detect the newline PER FILE.** Also the fifth shell-quoting incident of the run: rewriting that
script through a shell heredoc mangled its escapes. Same banked rule, fifth failure to follow it — patch
content goes through Write/Edit, never a shell.

**The other three turn-scoped carriers do NOT flip** (Complete the Circuit · Cherished Hatchling · Ride the
Avalanche) — each has separate blockers. The predicted 4 was a clause-level estimate; the measured answer is 1.

**BATCH 2: 21 cards** since v0.149.19.

---

## 🔍 DIAGNOSIS 2026-07-30 — **"GATE 3" WAS A MISDIAGNOSIS. The real blocker is the clause-parser DISPATCH.**

Follow-up to the reverted turn-scoped flash grant. No code shipped; the point is that the map from last turn
was **wrong in a way that would have cost the next attempt a whole session**, and it is corrected here.

**⛔ WHAT I GOT WRONG.** I recorded a "card-level gate that rejects the two-line card whole", inferred from
`parseEffectProgram` returning `low` with the **entire oracle** as `unparsedTail`. A control run kills that
reading:

```
high  atoms=2  tail=null                      << two lines, both parseable
low   atoms=0  tail="<THE WHOLE ORACLE>"      << one UNPARSEABLE line + one good one   ← the control
low   atoms=0  tail="<THE WHOLE ORACLE>"      << the target card
```

**The whole-oracle tail is simply how all-or-nothing failure is REPORTED.** Any card with one unparseable
clause looks exactly like this. There is no card-level gate, there is nothing special about two lines, and
nothing about "as though" or "you may cast" is denylisted. **I read a failure MESSAGE as a failure CAUSE.**

**⭐ AND THE REAL BLOCKER IS NARROWER AND MORE INTERESTING.** With a probe arm applied,
`miscClauseParser` returns the correct atom for **all three** forms called directly —

```
{"op":"grant-flash-this-turn",...}  <- "You may cast spells this turn as though they had flash"
{"op":"grant-flash-this-turn",...}  <- "you may cast spells this turn as though they had flash"
{"op":"grant-flash-this-turn",...}  <- "cast spells this turn as though they had flash"   (the peeled form)
```

— while `parseEffectClause` on the very same string returns **low with zero atoms**. The clause parser is
correct AND reachable in isolation; the registry path never returns its result. **So the blocker is in the
CLAUSE-PARSER DISPATCH, not in the clause, not in the α2 peel, and not in any card-level gate.**

That also collapses last turn's Gate 1 and Gate 2. The peel *does* strip "You may ", but since the peeled form
is equally rejected by `parseEffectClause`, the peel was never the blocker either — it was a real observation
attached to the wrong conclusion.

**⚠️ THE LESSON, and it generalises past this card:** three of the four "gates" I banked last turn were
inferred from black-box probing of `parseEffectClause` / `parseEffectProgram` outputs. Two were wrong.
**Where a dispatch is involved, read the dispatch** — the next attempt should open `parser.js`'s
`CLAUSE_PARSERS` registration and `parseClauseToAtom` end-to-end and find why a registered parser's non-null
return does not survive, rather than probing from outside and inferring. That is a bounded read, and it is
almost certainly worth more than the 4 cards that prompted it: **anything that silently discards a registered
parser's result affects every clause family, not this one.**

**STATUS: still not built, still 4 corpus cards + 1 cdh slot. Batch 2 unchanged at 20.** The three touch
points from the first attempt (turn-scoped grant on the player cleared at untap · the offer-gate collector
reading it alongside the statics · the static's own filter parser exported and reused) were each verified in
isolation and remain the right design.

---

## ⛔ ATTEMPTED + REVERTED 2026-07-30 — **TURN-SCOPED FLASH GRANT.** Three gates deep, stopped on the fail-fast rule.

Shelf item 1 (`Borne Upon a Wind`, + Complete the Circuit · Cherished Hatchling · Ride the Avalanche).
**Nothing shipped. Batch 2 stays at 20.** What follows is the map, so the next attempt starts three obstacles
ahead instead of rediscovering them.

**THE PLAN WAS SOUND AND MOST OF IT WORKED.** Three touch points, all built and all correct in isolation:
- `gameState.grantFlashThisTurn` + `flashGrantsThisTurn` cleared inside `resetSpellsCastAllPlayers` — one
  reset site for per-turn player state, so a new turn cannot half-clear it.
- `legalChoices.flashPermissionSpecsFor` reading the turn stamp alongside the battlefield statics, ONE list.
- `staticAbilityParser.parseFlashCastFilter` **exported and reused** rather than re-implemented, so the
  turn-scoped twin cannot drift from the static form of the identical printed words.

**⛔ GATE 1 — THE α2 OPTIONAL-EFFECT PEEL EATS "You may ".** The arm anchored on the full printed wording was
never reached, while calling `miscClauseParser` directly returned the right atom. The peel strips the prefix
before the registered clause parsers run. Fixed by accepting `^(?:you may )?cast …`.

**⛔ GATE 2 — AND THE PEEL THEN STAMPS `optional: true`, WHICH IS WRONG HERE.** "You may cast" is part of the
PERMISSION's wording (CR 601.3e), not an optional effect to accept or decline; there is no choice on
resolution. Shipping it would have added a meaningless yes/no prompt. Not fixable from inside the arm — the
peel wraps the result — so it needs either a pre-peel matcher or an op-level opt-out.

**⛔ GATE 3 — A CARD-LEVEL GATE, NOT LOCATED.** With the clause parsing HIGH on its own, `parseEffectProgram`
on the two-line card still returned `low` with the **entire oracle** as `unparsedTail` — it did not even split
the lines. So something rejects the card before clause splitting. `isCleanClause`'s `UNMODELED_MARKERS`
contains `may`, which is suggestive but is a legacy-path gate, not this one. **Find that gate first next time**
— it is upstream of everything else and would have invalidated the other two fixes anyway.

**⭐ WHY I STOPPED RATHER THAN PUSHED A THIRD FIX.** The standing rule is two failed attempts then re-approach.
Payoff here is 4 corpus cards and one cdh slot; cost was already a full slice with a new obstacle at each
layer. Continuing would have meant a third speculative fix on a mechanism whose real blocker I still had not
found — the exact shape of the "retrying the same broken approach" failure mode.

**⚠️ AND NOTE WHAT THIS SAYS ABOUT THE SHELF LIST.** The shelf entry ranked this the MOST tractable cdh item
("its only other clause already parses → flips outright"). That ranking was made from a clause-level probe,
which cannot see card-level gates. **Treat the rest of that ranking as a lead, not a size estimate** — the
same lesson the corpus veins taught (containment ≠ attribution), one layer up.

**IF PICKED UP AGAIN, IN THIS ORDER:** (1) find the card-level gate that rejects the two-line card whole;
(2) decide the pre-peel-vs-opt-out question for `optional`; (3) then re-apply the three touch points above,
which were all verified individually.

---

## 🎯 SHELF RE-MEASURED 2026-07-30 — **COLTON IS AT 93%. ONE DECK IS BELOW THE BAR. READ THIS BEFORE MORE CORPUS WORK.**

The standing objective is **Colton's DECK SHELF at ≥90% native PER DECK**, not corpus %. That had not been
measured since the batch-1 grind began, and ~110 cards have landed since. Measured now:

```
CORPUS:            37.1% native  (12,692 / 34,245)
top 1000 played:   74%   ·  top 2500: 56%  ·  top 5000: 44.7%
AGGREGATE shelf:   82%   (1302/1597 slots across 16 decks)

  93%  COLTON   (463/499 across 5 decks)   ← below the bar: cdh 83%  ...and nothing else
  76%  joe      (839/1098 across 11 decks) ← 9 decks below: 80/77/75/74/73/73/72/70/66%
```

**⭐ THE HEADLINE: four of Colton's five decks already clear the bar.** The whole remaining distance on his
shelf is **ONE deck, `cdh`, at 83/100 — seven cards from ≥90%.** That is a bounded, nameable target, and it
is a materially better use of the next slices than another corpus vein. Joe's shelf is the larger body of work
but is not the stated objective.

### THE `cdh` GAP — all 17 parked slots, diagnosed per clause (no re-derivation needed)

**Tractable / next up**
| card | the blocking clause | note |
|---|---|---|
| **Borne Upon a Wind** | "You may cast spells **this turn** as though they had flash" | its only other clause already parses → **flips outright**. ⭐ The STATIC form of this grant is fully modeled (Yeva, Vedalken Orrery — `staticAbilityParser.parseFlashCastFilter` + `legalChoices.flashPermissionSpecsFor`); the parser comment even names the gap: *"Anchored ^…$ so any rider variant ('… this turn') never matches."* The axis again: static modeled, turn-scoped spell form absent. **Corpus size: 4** (Complete the Circuit · Cherished Hatchling · Borne Upon a Wind · Ride the Avalanche) |
| **Valley Floodcaller** | static "cast **noncreature** spells as though they had flash" | the filter qualifier is unmodeled. **Corpus size: 2** (+ Kianne, Corrupted Memory). ⚠️ Floodcaller has TWO more blockers: the splitter shatters "Birds, Frogs, Otters, and Rats you control get +1/+1" on its commas, and "Untap them" is unbound |
| **Vexing Shusher** | "This spell can't be countered" + "{R/G}: Target spell can't be countered" | both clauses are the same mechanic — a counter-restriction. Also on Hexing Squelcher and Veil of Summer |
| **Hidden Strings** | "You may tap **or** untap target permanent" ×2 | the modal tap-or-untap is tractable; **Cipher blocks the card anyway** (8 corpus carriers) |

**Hard / different mechanisms — not vocabulary work**
Chain of Vapor (sacrifice-then-copy-this-spell chain) · Deflecting Swat (alternative cost + change targets) ·
Mindbreak Trap (alternative cost + "any number of target spells") · Springheart Nantuko (Bestow + landfall +
copy-that-creature) · Wan Shi Tong (X counters + "draw half X, rounded down") ·
**Invasion of Ikoria (the BATTLE card type — a whole type the engine lacks)** · The Cabbage Merchant (Food
subsystem) · Ragavan (Treasure + "you may cast that card" exile permission + Dash) · Pact of Negation
(delayed "pay or lose the game") · Hexing Squelcher (needs Ward as well) · Veil of Summer (splitter shatters
"You and permanents you control gain hexproof from blue and from black"; plus hexproof-from-COLOR)

**⛔ REFUSED, consistent with the standing pin:** **Vibrance** — both its ETB clauses are gated on
`{R}{R}`/`{G}{G}` *having been spent to cast it*. Per-cast mana provenance is not recorded anywhere in the
engine (the same refusal already pinned for the 7-card `{R} was spent to cast it` family). It cannot be built
without that ledger, and guessing would be a confidently-wrong native.

### RECOMMENDED ORDER FOR THE NEXT SLICES
1. ✅ **Turn-scoped flash grant — DONE 2026-07-30** (Borne Upon a Wind; cdh 83 → 84). Took three attempts;
   the fix was one line in the α2 peel's non-optional allowlist. Superseded note follows. Three
   gates deep (the α2 peel eats "You may "; the peel then stamps a wrong `optional: true`; and an
   UNLOCATED gate). ⚠️ **CORRECTED — see the DIAGNOSIS entry below: there is NO card-level gate.** The
   whole-oracle `unparsedTail` is just how all-or-nothing failure is reported, and the peel is not the
   blocker either. The real blocker is the CLAUSE-PARSER DISPATCH: `miscClauseParser` returns the right
   atom for every form when called directly, while `parseEffectClause` on the same string returns low.
   **Read `parser.js`'s CLAUSE_PARSERS registration + parseClauseToAtom end-to-end FIRST** — do not probe
   from outside. The three touch points were each built and verified in isolation. Original note: a parse
   arm for the "this turn" rider, a turn-scoped stamp on the player, and `flashPermissionSpecsFor` reading the
   stamp alongside the statics.
2. **`noncreature` flash qualifier** (2 cards; does NOT flip Floodcaller alone — see its other two blockers).
3. **"can't be countered"** (Vexing Shusher outright; Veil of Summer and Hexing Squelcher need more).
4. Then reassess: the rest of `cdh` is genuinely per-mechanism work, and **Battle** is a card type, not a slice.

---

## 🏦 BANKED (batch 2, unreleased) 2026-07-30 — **CONTROLLER SAC NOUNS + COUNTER PLACEMENT. GAINED 5, LOST 0.**

Drinker of Sorrow · Lorehold Command · Perilous Research · Recycla-bird · Selfcraft Mechan.

**Two small axes measured EARLY in the run and carried unbuilt until now.** Leaving measured work on the shelf
is its own kind of debt — the census cost was already paid, and the build was two parse arms.

**⭐ 1 · THE CONTROLLER'S SACRIFICE VICTIM.** `sacrificeEdictClauseParser`'s controller arm was ONE string,
`/^sacrifice a creature$/`, while its four sibling SUBJECTS (target player / each player / each opponent / the
upkeep player) each carried EDICT_NOUN + permanent + TYPED. All five resolve through the same
`advanceSacrificeChain`, which threads `atom.what` onto the queue head **regardless of `who`** and narrows via
`sacrificePoolMatch` — so the runtime has supported all eleven pools for any subject since it was written.
Capability on four arms of a function, absent on the fifth.
⛔ Scoped to the pools the runtime actually narrows on; a count / characteristic filter / conjoined victim
still parks. And "a land" is deliberately absent — `sacLand.js` already owns it, and two parsers for one
printed phrase is how they drift.

**⭐ 2 · COUNTER PLACEMENT.** `shieldCounterClauseParser` was exact string equality, so
"…on target creature **you control**" refused a card whose effect is identical to one it already accepted. And
there was no arm to PLACE a keyword counter at all, though `permanentHasKeyword` has read them off the counter
pile since the enters-with static shipped.

**⛔⭐ THE GATE THAT MATTERS, and it produced a refusal as well as a gain.** The keyword arm is bounded by
`ENFORCED_KEYWORD_COUNTER_KINDS` — **exported from the module that does the granting rather than copied**, so
the two cannot drift. A counter placed for a keyword nobody enforces would sit on the board looking correct
and do NOTHING: a silent wrong-behaviour FP, worse than parking. That is exactly why **Emissary of Soulfire
("an exalted counter") is REFUSED** — exalted is not in the enforced set. Recycla-bird's flying counter is,
so it flips.

**One pin moved, and its own annotation was the criterion:** `controllerSacrificeUpkeep`'s ANTI-FP list held
`"Sacrifice a nontoken creature."` annotated *"token-status not honored"*. It **is** honored —
`sacrificePoolMatch`'s `nontokenCreature` arm (`isCreatureCard(card) && !card.token`) has been implemented the
whole time and was merely unreachable from the controller subject. Graduated; the other five probes (count,
filtered, type union, controller filter, subtype pool) all still park and are untouched.

**Gates:** 17 new tests; **all three mutations seen to fail** — opening the enforced-keyword gate (1),
collapsing every sacrifice pool to "creature" (**7**), dropping the controller restriction from the shield
form (1). Reverts confirmed by `git diff`. Flip-diff **GAINED 5 / LOST 0**. Suite **999 files / 12,730 green**,
lint 0 unpiped, MUTANT clean, module graph loads (a new edge `atoms/counters → staticAbilityParser`, verified).

**BATCH 2: 20 cards** since v0.149.19.

---

## 🏦 BANKED (batch 2, unreleased) 2026-07-30 — **NEGATED + CONJOINED FILTERS. GAINED 4, LOST 0.**

Fathom Fleet Captain · Iron Man, Modern Marvel · Reclusive Wight · Wildwood Tracker.

**⭐ THE SAME AXIS ONE MORE TIME — and it is now a pattern, not an incident.** The shared TARGET grammar
(`parseCreatureTargetRestrictions`) has carried `typeNeg`, `colorNeg` and a negated `subtype` for a while;
this CONDITION grammar had none of them. The identical printed filter was readable when a spell TARGETED with
it and unreadable when a trigger ASKED about it. Two grammars, one vocabulary, drifted apart — the fifth
instance this run, after the mass-damage recipient, mass removal, mass bounce and the subtype negation itself.

**⛔⭐ NEGATION FAILS THE OPPOSITE WAY FROM EVERYTHING ELSE IN THIS FILE, which is why it needed its own
allowlist.** On the POSITIVE side an unrecognised word becomes a type-line scan that matches nothing — the
filter reads "no permanent qualifies", a safe false negative. On the NEGATED side an unrecognised word
excludes nothing — the filter silently widens to **EVERY permanent**. Same typo, opposite blast radius. Hence
`NEGATABLE_TYPE_WORDS`, and a mutation that opens it fails immediately.

**⭐ "nonblue" INCLUDES COLOURLESS (CR 105.2)** — it means NOT blue, not "is some other colour". Reading it the
other way would wrongly exclude every artifact.

**TYPE CONJUNCTION** — "artifact creature" needs BOTH words (`allWords`), distinct from the " or " union arm
directly beside it. Under a union either half alone would satisfy it.

**⚠️ I PARAPHRASED A CARD FROM MEMORY AGAIN — second time in two slices.** The carrier fixture had Wildwood
Tracker as an *Elf Scout* that triggers on *attacks*; the bundle says **Elf Warrior**, triggering on **attacks
or blocks**. Corrected from the bundle. Twice in a row is not a slip, it is a habit to watch: when writing a
fixture for a real card, READ IT FIRST — the flip-diff already names the card, so the text is one query away.

**Gates:** 10 new tests; **all three mutations seen to fail** — opening the negation allowlist (1), collapsing
the conjunction to a union (1), ignoring `notWords` (2). Reverts confirmed by `git diff`. Flip-diff
**GAINED 4 / LOST 0**. Suite **998 files / 12,713 green**, lint 0 unpiped, MUTANT clean, module graph loads.

**⚠️ A NEW MUTATION-ANCHOR TRAP, worth the line because it is not the same as the previous three:** the target
line lives inside a JS **template literal**, where `\\b` is what produces a literal `\b` for the RegExp
constructor. A single-backslash anchor matched zero times. The rule is now: **anchor against the bytes on
disk** (`repr()` the line) rather than against how the regex reads.

**BATCH 2: 15 cards** since v0.149.19.

---

## 🏦 BANKED (batch 2, unreleased) 2026-07-30 — **PLANESWALKER SUBTYPES + `another <filter>`. GAINED 11, LOST 0.**

Adherent of Hope · Ajani's Comrade · Companion of the Trials · Desiccated Naga · Historian of Zhalfir ·
Jace's Triumph · Karplusan Hound · Nessian Hornbeetle · Sacred White Deer · Turret Ogre · Vraska's Conquistador.

**⭐ `you control a Teferi planeswalker` (CR 205.3j) IS A CONJUNCTION** — structurally identical to the snow
filter, so `allWords` is set and the quantifier is `.every()`. A union would make "a Teferi planeswalker" true
for ANY planeswalker, and the Superfriends payoffs would fire off the wrong walker.

**⭐ THE NAME LIST WAS DERIVED FROM THE BUNDLE BY SCRIPT.** 93 words, every one taken from a real
`Planeswalker — X` type line in the shipped snapshot. Card characteristics never come from recall here, and an
invented name would be a filter that matches nothing and reads FALSE forever while the shape gate says
"readable". Because the filter is a conjunction with "Planeswalker", an unusual entry can only fail to match.

**⛔ `another <filter>` WIDENED THE FILTER ONLY — the referent rule was left alone ON PURPOSE.**
`activationCondition.test.js` pins that an activated ability may not answer "another": *"a trigger can supply
the triggering permanent; an activated ability cannot. If this ever returns true, the activation probe is
claiming a context it does not have."* A source-relative reading is arguable — the activation lane genuinely
has `sourcePermanentId` — but that is a **JUDGEMENT pin about referent semantics, not a capability marker**,
and a vocabulary slice is not the place to overturn it. The mutation that relaxes it is one of the three below,
so the decision is now enforced rather than merely intended.

**⚠️⭐ I BROKE THE PROJECT'S FIRST RULE IN MY OWN TEST, and the suite caught it.** The carrier block was
written from RECALL — wrong creature types, wrong P/T, wrong abilities on both cards — and Vraska's
Conquistador failed even though the corpus flip-diff had just shown it flipping. **Card text comes from the
bundle, never from memory**, and the failure mode is exactly why: a plausible paraphrase tests nothing about
the real card, and had it happened to pass it would have been a green test asserting fiction. Replaced with
the bundled strings and a comment saying so.

**⚠️ AND THE FOURTH SHELL-QUOTING INCIDENT OF THE RUN** — a `\n` inside a JS string literal became a real
newline when the patch went through a heredoc, breaking the file into a syntax error. Same banked rule
(**write patch content with the Write/Edit tools, never through shell quoting**), same failure to follow it.
Fixed with Edit, no shell in the path.

**Gates:** 9 new tests; **all three mutations seen to fail** — the conjunction collapsed to a union, the
derived name list opened, and the "another" referent relaxed to the source. Reverts confirmed by `git diff`.
Flip-diff **GAINED 11 / LOST 0**. Suite **997 files / 12,703 green**, lint 0 unpiped, MUTANT clean.

**STILL PARKED in this bucket, needing `parseFilter` widenings this slice did not make:** a TYPE CONJUNCTION
(`another artifact creature` — "Artifact AND Creature"; `parseFilter`'s union arm only reads " or ") and
NEGATION (`another non-Human creature`, `another nonland permanent`). Note the shared *target* grammar
(`parseCreatureTargetRestrictions`) has both — `typeNeg` and negated `subtype` — so this is the same
two-grammars-drifting axis one more time, and the next obvious slice in this file.

**BATCH 2: 11 cards** since v0.149.19.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **CONDITION DISJUNCTION + THE SINGULAR GRAVEYARD READER. GAINED 8, LOST 0.**

Dawnhand Eulogist · Desert's Hold · Gilded Cerodon · Sand Strangler · Unquenchable Thirst ·
Wall of Forgotten Pharaohs · Walltop Sentries · Wretched Camel — the whole Desert cycle, plus two.

**⭐ THE SEQUENCING IS THE STORY, AND IT WAS DECIDED BY A PROBE TWO SLICES AGO.** A top-level `or` splitter was
the obvious build then: the single biggest phrase in the three-lane census was *"you control a Desert OR there
is a Desert card in your graveyard"* (6 cards), which reads as a plain disjunction. **RULE 1b said probe the
HALVES first** — and the graveyard half was ALSO unreadable, so the splitter would have gained exactly ZERO.
It was not written. It is written now because the singular graveyard reader made that half readable. *The probe
did not just size the work; it ordered it.*

**THE SINGULAR GRAVEYARD READER** — `there is / there's a <X> card in your graveyard`, the ≥1 case of two
counters that had only ever been reachable through the "N or more" wording. The typed scan is word-anchored
against the whole type line, so SUBTYPES come free: "desert card" matches `Land — Desert`, "lesson card"
matches `Sorcery — Lesson`. ⚠️ It inherits its sibling's exposure **deliberately and in writing** — an
unrecognised word becomes a scan that matches nothing and reads FALSE forever while the shape gate says
"readable". The typed COUNT reader has carried that since it shipped; diverging here would mean the same
phrase answered differently depending on whether it said "a" or "one or more".

**⛔ THE WHOLE CONDITION IS ALWAYS TRIED FIRST — the entire safety argument in one line.** Many single
conditions legitimately contain " or ": *power 4 or greater* · *N or more* · *5 or less life* · *gained or
lost life this turn* · *seven or more cards in hand*. Splitting eagerly shatters a READABLE condition into two
unreadable halves and regresses every card carrying one. Gating the split behind the whole form's failure makes
"no regressions" **structural** rather than something to re-verify — and the mutation that removes that
ordering fails **9 of 14 tests**.

**⛔ BOTH HALVES MUST BE INDEPENDENTLY READABLE.** If either is null the disjunction is null; an unreadable
half must never be treated as FALSE, which would answer a definite "no" to a question the engine cannot
evaluate. Only a two-way split is attempted — a three-way chain refuses.

**Gates:** 14 new tests; **all three mutations seen to fail** — splitting eagerly (9), treating an unreadable
half as false (1), dropping the singular reader (5). Reverts confirmed by `git diff`. Flip-diff
**GAINED 8 / LOST 0**. Suite **996 files / 12,694 green**, lint 0 unpiped, MUTANT clean, module graph loads
(`evaluateInterveningIf` is now a wrapper; the original body is `evaluateSingleCondition`, and the three
probe functions call the wrapper so disjunctions are readable on all three lanes).

**Census re-measured after the batch's three condition slices: 189 → 160 attributable.** Remaining head:
T9 other 60 · T1 turn-event history 44 (needs real tracking, not readers) · T2 you-control 37.
Next-biggest single phrases: `you cast it from your hand` (5, needs cast-zone tracking) ·
`you descended this turn` (5) · `you haven't cast a spell from your hand this turn` (3, deliberately refused —
`spellsCastThisTurn` is zone-blind).

**BATCH NOW 92 CARDS** since v0.149.18 — at the tag threshold.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **MASS BOUNCE JOINS THE SHARED GRAMMAR. GAINED 3, LOST 0.**
### (predicted 6 · the mass-PUMP half shipped 0 and was REVERTED)

Aetherize · Inundate · Part the Veil.

Third verb onto the 16-kind restriction grammar, after damage and destroy/exile. The mechanics are the same
as the removal delegation — peel "all", singularize the noun, probe, refuse on residue — so the slice is
mostly interesting for the two things it got wrong first, both of which only surfaced because the prediction
was written down.

**⚠️⭐ 1 · AN APOSTROPHE, NOT A MECHANISM.** The first build anchored on the plural `to their ownerS' handS`,
copying the bare wipe above it, and measured **1 flip against a prediction of 3**. Auditing the two misses
showed the bundle prints the FILTERED bounces with the SINGULAR `to their owner's hand` (Aetherize, Part the
Veil). Nothing structural was blocking them — they differed from the anchor by **one character**. Both forms
are accepted now, and a mutation back to plural-only fails 4 tests. **A prediction that comes in low is a
lead, not a rounding error** — the same discipline that caught the two EXTRA cards in the mass-damage slice
caught two missing ones here, in the opposite direction.

**⛔⭐ 2 · THE MASS-PUMP HALF SHIPPED ZERO AND WAS REVERTED.** The identical delegation was written for
`all <filtered> creatures get +N/+N`, and three corpus filters read cleanly — Noxious Ghoul (non-Zombie),
Tidal Influence (blue), Tori D'Avenant (other attacking you control). It gained **0 cards**: every one sits on
a card blocked elsewhere (Ghoul's trigger SUBJECT "this creature or another Zombie"; Tidal Influence's
counter-gated static; Tori's three unmodeled clauses). Per the standing rule a 0-flip widening does not enter
the baseline, so it was reverted rather than kept as "already done". **Reading a filter is not flipping a
card** — the probe measured the former and I had let it stand for the latter.

⛔ Worth noting for the pump case specifically: it is the one verb where a wrong filter cuts BOTH ways. A
too-wide destroy kills extra creatures; a too-wide `-N/-N` does the same; but a too-wide `+N/+N` hands the
OPPONENT a team pump. If it is ever built, the `clean` gate matters at least as much as it does on removal.

**Gates:** 8 new tests; **all three mutations seen to fail** — plural-only anchor (4), dropping the
singularize peel (4), dropping the `clean` gate (1). Reverts confirmed by `git diff`; `combat.js` reverted to
pristine and confirmed with an EMPTY diff. Flip-diff **GAINED 3 / LOST 0**. Suite **995 files / 12,680 green**,
lint 0 unpiped, MUTANT clean, module graph loads.

**⚠️ AND A PROCESS FAILURE WORTH THE LINE: the third backslash-through-a-shell incident of this run.** The
mutation script was written with a heredoc; the heredoc ate the backslash in `\bcreatures\b`, Python then read
`\b` as a BACKSPACE escape, and the anchor matched zero times — which reads like a moved target rather than a
quoting bug. The banked rule already covers it (**write patch scripts to a FILE, never through shell
quoting**); I did not follow my own rule and it cost a cycle. Re-written with the Write tool and raw strings.

**BATCH NOW 84 CARDS** since v0.149.18.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **MASS-REMOVAL FILTER DELEGATION. GAINED 19, LOST 0.** (predicted 17)

Aligned Hedron Network · Citywide Bust · **Cleanse** · Crystalline Entity · Extinguish All Hope ·
Guan Yu's 1,000-Li March · Mass Calcify · Nature's Ruin · Organic Extinction · **Perish** · **Plague Wind** ·
Planar Outburst · Realm-Cloaked Giant // Cast Off · Split Up · **Sunblast Angel** · Their Name Is Death ·
Vault 75: Middle School · Virtue's Ruin · **Whirlwind**.

**⭐ THE AXIS, ONE LAYER UP FROM A VOCABULARY.** Two subsystems filtered creature SETS and had drifted: the
damage side carried a 16-kind `restrictions` array evaluated by `creatureSatisfiesRestrictions`, while mass
destroy/exile/bounce hand-rolled a parallel, narrower one on bespoke atom fields (`subtypeFilter`/
`subtypeNegate`, `powerCmp`, `mvCmp`, `landSubtype`) inside `massCreatureTargets`. Same printed filter,
sayable to one verb and not its neighbour — but this time the asymmetry was between two IMPLEMENTATIONS, not
two regexes.

**THE EXTRACTION.** It could not simply be imported: `effects/atoms/shared.js` is a STRICT LEAF and
`spellEffects.js` is not. So the satisfier moved to its own leaf, **`creatureRestrictions.js`**, which both
sides import. Its only edges are gameState + layers + keywords — every one of which `atoms/shared.js` already
had — so the move adds no cycle in either direction. **The body was copied VERBATIM by script, never retyped**,
so the move alone cannot change behaviour; the damage-side suites passing unchanged is the witness.

**⛔ TWO PEELS AT THE CALL SITE, AND THE SECOND ONE FAILED SILENTLY.**
- `all` — the grammar's filler list has `each` but not `all`, so it would survive as residue.
- **THE PLURAL NOUN.** Mass removal says "destroy all creature**s**" while the grammar's entry gate is
  `\bcreature\b`, which does not match "creatures". Left plural, the probe returned
  `{restrictions: [], clean: true}` for **every** card — *clean because nothing was ever examined*. That is
  the quietest failure shape there is: indistinguishable from "this card has no filters". It was caught only
  because the first run refused all six known carriers instead of the expected zero — i.e. by having a
  predicted set to check against, not by any assertion.

**Four pins moved across three files, every one CAPABILITY language:**
| pin | verdict |
|---|---|
| `mass` "a FILTERED wipe is low **(the unfiltered eachX scope would hit the wrong set)**" | The parenthesis WAS the criterion, and it is why the fix had to be real rather than a strip — the scope is filtered now. Graduated; boundary re-pointed to filtered NON-creature wipes, which have no equivalent grammar |
| `mass` coverage "filtered → arbiter-spell" | Graduated with its parser sibling, plus a re-pointed negative |
| `planeswalkerLoyaltyCompletion` "rejects strict 'greater than' **and a toughness bound**" | ⭐ Two halves, never the same claim. The toughness note said "still unmodeled — a real refusal": true when written, capability language. The shared grammar has always had a layer-aware `toughness` on the SAME "N or greater/less" anchor. **STRICT "greater than" is the real refusal and is untouched** — "power greater than 4" is not "power 4 or greater", and conflating them destroys a 4-power creature the card spares |
| `parser` MUST_DROP_TO_LOW ×3 (keyword / colour / controller filters) | All three annotations described a missing capability. Graduated; the slots re-pointed to an EVENT-history filter, the strict bound, and a filtered non-creature wipe |

**Gates:** 19 new tests; **all three mutations seen to fail** — dropping the `restrictions` pass-through in
`atomTargets` (2 tests: without it Cleanse becomes Wrath of God), dropping the plural peel (**11 tests**),
dropping the `clean` gate (3). Reverts confirmed by `git diff`. Flip-diff **GAINED 19 / LOST 0**.
Suite **994 files / 12,672 green**, lint 0 unpiped, MUTANT clean, module graph loads (checked at each step of
the extraction, not just at the end).

**BATCH NOW 81 CARDS** since v0.149.18 — approaching the ~100 tag threshold.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **THE ONE-SIDED OPPONENT SWEEP. GAINED 4, LOST 0.**

**Goblin Chainwhirler** · End the Festivities · Tectonic Hazard · Wildfire Cerberus.
Predicted 4 from the census, got exactly 4.

**⭐ THE DEFINING PROPERTY IS ONE-SIDEDNESS, and it is why these cards are good.** "…deals N damage to each
opponent **and each creature they control**": the caster's seat and the caster's board are never touched. A
symmetric implementation would not be a slightly-wrong Chainwhirler — it would be Pyroclasm plus a Shock to
yourself, a different card credited under this one's name. The runtime enforces it **structurally** by
iterating `opponentsOf(controller)` rather than every seat, so there is no filter to get wrong: the caster is
never in the loop at all.

**⛔ `they control` IS INSIDE THE ANCHOR, not filler.** It is the phrase that scopes the creatures to the
opponents' boards. `each opponent and each creature` (no tail) is refused.

**TWO SCOPES, NOT A FLAG** — third time this run the same call has come up, and the reason is unchanged:
damage to a planeswalker is LOYALTY removal (CR 120.3c), a different effect on a different object. Chainwhirler
and End the Festivities say "and planeswalker"; Tectonic Hazard and Wildfire Cerberus do not and must leave
walkers alone. The loyalty path is the single-target one, reused for the third time rather than reimplemented.

**⭐ THE SPLITTER, FOR THE FOURTH TIME.** This shape carries TWO internal " and "s. Without a keep-whole guard
the sentence broke into a first half that **parses HIGH on its own** — `"…deals 1 damage to each opponent"` is
a modeled scope — beside an unbindable `"each creature they control"`. A confident half plus a dropped half is
the dropped-effect shape, so keeping it whole is again the conservative direction. The subject-prefix guard is
carried over unchanged, and is pinned: `"You gain 5 life and <name> deals …"` must still split, or the life
gain is silently swallowed.

**Gates:** 11 new tests; **all three mutations seen to fail** — iterating every seat instead of the opponents
(2 tests), letting the non-walker scope hit walkers (1), collapsing the two scopes at the parse site (1).
Reverts confirmed by `git diff`. Flip-diff **GAINED 4 / LOST 0**. Suite **993 files / 12,653 green**, lint 0
unpiped, MUTANT clean, module graph loads. No pin claimed these shapes stay low.

**THE MASS-DAMAGE CENSUS IS NOW EXHAUSTED except for two deliberate refusals:** multi-target damage division
(10 cards — `each of two targets`, `each of X targets`; a genuinely different mechanism) and the per-card
one-offs (`each creature blocking it`, `each creature for each aura attached to that creature`,
`each creature except for creatures you control with flying`).

**NEXT BIG MEASURED VEIN:** mass DESTROY / EXILE / BOUNCE filter delegation (~17 attributable, measured
2026-07-30). Those verbs hand-roll a parallel filter implementation — `subtypeFilter`/`subtypeNegate`,
`powerCmp`, `mvCmp`, `landSubtype` on bespoke atom fields, resolved by `massCreatureTargets` — while the damage
side reads the 16-kind shared grammar. Unifying them needs `creatureSatisfiesRestrictions` extracted from
`spellEffects.js` into a leaf module (`atoms/shared.js` is a strict leaf and cannot import spellEffects).
Its deps are only gameState + layers readers, both of which shared.js already imports, so the extraction is
mechanical — but it touches a 16-branch function and both call sites, so it wants a slice of its own with the
module-graph load check run at every step.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **PLANESWALKER SWEEP SCOPE + NEGATED SUBTYPE. GAINED 13, LOST 0.**

Breath Weapon · Consuming Bonfire · Deathmark Prelate · Dragonback Assault · Electric Seaweed ·
Eyeblight's Ending · Fiery Cannonade · **Magmaquake** · Rend Flesh · **Star of Extinction** · **Storm's Wrath** ·
Vampires' Vengeance · **Walk the Plank**.

Two independent pieces, both finishing work the run had already started and measured.

**⭐ 1 · `and each PLANESWALKER` is its OWN recipient set, not a variant of the player scope.** The players are
untouched, and damage to a planeswalker removes that much **LOYALTY** (CR 120.3c) rather than life — a
different effect on a different object. So `eachCreatureAndPlaneswalker` is a new scope rather than a flag on
the existing one. The loyalty path REUSES the single-target one (damage replacement → prevention shields →
loyalty removal) instead of being reimplemented, because a second loyalty path is how the two drift.
Third instance of the splitter gate: the SYMBURN keep-whole guard had to learn the walker tail too, or the
sentence shattered into a half that parsed HIGH beside an unbindable `each planeswalker`.

**⭐ 2 · NEGATED SUBTYPE was a PARITY GAP, and it paid twice.** The mass-DESTROY path has carried
`subtypeNegate` since Crux of Fate and `massCreatureTargets` implements it — but the SHARED restriction
grammar that the damage side reads only ever emitted the POSITIVE subtype. Same printed filter, sayable to one
verb and not its neighbour. Fixing it in the shared grammar flipped the mass sweeps (Breath Weapon, Fiery
Cannonade, Vampires' Vengeance) **and** single-target removal (Eyeblight's Ending, Rend Flesh, Walk the Plank,
Consuming Bonfire) in the same change — 6 of the 13 were the single-target side, which was not the target of
the work and came along because the grammar is shared.

**⛔⭐ A MUTATION CAUGHT A HOLLOW GATE IN MY OWN TEST, and this is the part worth keeping.** HAZARD B says the
walker half must NOT be narrowed by a creature restriction (Magmaquake hits every walker even though its
creature half is non-flyers only). I wrote that test with the card's own restriction — `without flying` — and
applying the filter to the walker loop left **all 16 tests green**. Because "without flying" is a predicate a
planeswalker PASSES, so filtering the walkers by it changes nothing. The test was asserting the right claim
with an input that could not discriminate. Fixed by adding the case a walker FAILS (`hasKeyword flying`
positive, which no walker has): under the mutation both walkers are skipped and their loyalty is untouched.
**Generalised lesson: a "this filter must not apply here" test is only a gate if the filter would actually
CHANGE the outcome — pick an input the wrong code path rejects.**

**Gates:** 17 new tests; **all three mutations seen to fail** — the walker sweep draining players (1), the
walker half being filtered (1, only after the test was strengthened), the subtype negate flip dropped (1).
Reverts confirmed by `git diff`. Flip-diff **GAINED 13 / LOST 0**. Suite **992 files / 12,642 green**, lint 0
unpiped, MUTANT clean, module graph loads. No pin claimed these shapes stay low.

**⚠️ ALSO BANKED, a mechanical trap that cost one failed run:** a mutation anchor must never span a line
break. These sources are CRLF, so a multi-line anchor written with `\n` matches zero times and the script
reports "anchor count 0" — which reads like a moved target rather than a quoting bug. **Single-line anchors
only**, and read the file with `newline=""` so the existing line endings survive the rewrite.

**STILL REFUSED from the mass-damage census:** `and each opponent` (an opponents-only sweep beside the
creature set — no combined targetType, and the splitter deliberately does NOT keep it whole) · multi-target
damage division (10 — `each of two targets`, `each of X targets`) · `opponent and each creature they control`
(4 — Goblin Chainwhirler, Tectonic Hazard) · `nontoken`-style non-subtype negations, which the curated
allowlist correctly refuses rather than turning into a type-line scan that silently matches nothing.

---

## ⛔ REFUSED + REVERTED 2026-07-30 — **STEP-WINDOW ACTIVATION. Built, measured GAINED 13, reverted anyway.**

`Activate only during your upkeep.` (CR 602.5a) and its siblings — 22 corpus carriers, ~13 otherwise complete:
Augur il-Vec · Augur of Skulls · Aven Augur · Black Carriage · Colossus of Sardia · Dwarven Weaponsmith ·
Emberwilde Augur · Gate to Phyrexia · Hell's Caretaker · Life Chisel · Llanowar Augur · Svyelunite Priest ·
Trade Caravan.

**It worked. Flip-diff GAINED 13 / LOST 0. It still had to go back.**

**⛔ WHY: THE OFFER LANE IS MAIN-STEP-ONLY, SO THE WINDOWS ARE DISJOINT.**
`legalChoices.actionsActivateAbility` opens with `if (state.step !== "main") return []`. An ability gated to
the upkeep can therefore never be offered, so crediting those cards would be a **METRIC-ONLY gain** — the
classifier saying a card plays while the runtime can never activate it. Same divergence the
classifier⇄runtime parity slices existed to kill, and the same call `precombatOnlyActivation.test.js` already
made for the opponent's-turn form: *"the engine's window and the card's are DISJOINT — it could never legally
be offered at all, so it stays parked rather than being credited into a window the card forbids."*

**⭐ HOW IT WAS CAUGHT: A FAILED POSITIVE CONTROL.** The runtime test asserted the ability IS offered during
the controller's own upkeep and got **zero**. Every parse-side test passed. Without that one positive case
this ships 13 unplayable cards and the flip-diff congratulates you for it. **RULE 1b earns its keep on the
turn you would rather not run it.**

**✅ THE TURN MODEL IS NOT THE BLOCKER**, which is what makes this a scoped build rather than an impossibility:
`gameEngine.NO_PRIORITY_STEPS` is exactly `{untap, cleanup}`, so a player genuinely holds priority in their
upkeep. The main-step return is an **enumeration shortcut**, not a rules requirement.

**⛔ THE PREREQUISITE, and it is why this is not a one-line widening.** Several shapes in that lane are
sorcery-speed BY RULE and carry no flag — they free-ride on the blanket return. **EQUIP is the clearest
(CR 702.6b): `isEquipAbility` has no timing gate anywhere in `actionsActivateAbility`.** Loosening the early
return without first giving equip (and every other by-rule sorcery-speed shape there) an explicit gate would
make the engine **more permissive than the rules** — the forbidden direction. Verified by reading the lane,
and pinned in a test that asserts equip carries `isEquipAbility` with no `sorceryOnly`.

**THE ORDER OF WORK, banked for whoever takes it:**
1. Give the lane's by-rule sorcery-speed free-riders explicit timing gates (equip first; audit plot/crew/
   level-up — level-up already has `sorceryOnly`).
2. Replace the blanket `step !== "main"` return with a per-ability window decision, defaulting to
   own-turn+main so an ungated ability is byte-identical.
3. THEN land the step rider. The parse side is straightforward and was proven: a `STEP_RIDER` regex, an
   ALLOWLIST of checkable windows (`your upkeep` · `an opponent's upkeep` · `the declare attackers step` ·
   `the declare blockers step` · `your turn`), and — the part worth keeping — the compound forms
   (`"…and only if <cond>"`, `"…and only once each turn"`) decompose by REWRITING the tail into a standalone
   `Activate only ….` sentence, which the incumbent `CONDITION_RIDER` and `LIMIT_RIDER` peels already match.
   No second condition parser, no second limit parser.

**Left behind:** `stepWindowActivationRefused.test.js` — 5 tests pinning the refusal, the zero-offer
measurement, the RULE 1b positive control that makes the zero meaningful, and the equip dependency. So the
gap is a decision on the record, not an oversight, and nobody re-adds it naively.

**Batch unchanged at 45 cards.** Suite **991 files / 12,625 green**, lint 0, MUTANT clean, working tree
reverted and confirmed by `git diff` (empty), not by the marker sweep.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **METRIC + SCOPE READERS. GAINED 22, LOST 0.**

Battle of Wits · Butterbur, Bree Innkeeper · Dust Stalker · Emperor Crocodile · Feudkiller's Verdict ·
Glorious Enforcer · Gutwrencher Oni · Imaginary Pet · Ivory Crane Netsuke · Kezzerdrix · Lone Revenant ·
Near-Death Experience · Painwracker Oni · Raving Oni-Slave · Scalding Tongs · Scourge of Numai ·
Scroll of Origins · Survival Cache · Synod Centurion · Takenuma Bleeder · Thopter Assembly · Thumbscrews.

**Third slice off the same census, and the fattest.** The T9 "other" bucket (71 cards) looked like an
undifferentiated long tail. It wasn't — it held four coherent groups, every one of them **a zero-case that
never got its threshold, or a scope that never got its inverse**:

| already modeled | was missing |
|---|---|
| `you have no cards in hand` | the hand COUNT in all three directions — while `controllerMetric` has read `player.hand.length` since the opponent hand-compare shipped |
| `you have N or less life` | `exactly N` (not expressible as a one-sided threshold) |
| `you control no <filter>` | `no OTHER <filter>` · `no <filter> other than this <noun>` · `you don't control a <filter>` |
| `an opponent has more life than you` | the INVERSE direction |
| — | the library count (Battle of Wits) · `your opponents control no <filter>` · `colorless` as a filter |

**⛔ THE THREE PLACES THIS COULD HAVE GONE WRONG, all pinned and all mutation-checked:**
- **A · the source-excluding count must exclude the source, and FAIL CLOSED without a referent.** The
  discriminating board is the one where the source IS the only match: without the exclusion the count is 1 and
  the condition reads FALSE, suppressing an ability whose printed condition is TRUE. Placed ABOVE the incumbent
  `no <filter>` arm on purpose — `parseFilter` strips "other" as filler, so a lower placement would have
  silently dropped the exclusion entirely. That is the **same trap the mass-damage recipient delegation hit one
  slice earlier**, and knowing it was there is why this arm was written source-first.
- **B · `your opponents control no X` is UNIVERSAL over opponents, not existential.** `.some()` would read TRUE
  on a table where one opponent is empty and another has a creature.
- **C · `you have more life than an opponent` is NOT the negation of its sibling.** On a tie BOTH phrases are
  false, so implementing either as `!other` answers wrongly. Each gets its own strict comparison.

Also: **`colorless` is the ABSENCE of colour (CR 105.2c), not a sixth colour** — it needs an empty-`colors`
predicate, and its fail-closed direction is the opposite of the colour gate's (an unresolvable read must not
claim colourlessness).

**Gates:** 16 new tests (both directions per reader); **all three mutations seen to fail** — dropping the
source exclusion (3 tests), `.every()` → `.some()` (1), the life compare as a negation (2, incl. the tie).
Reverts confirmed by `git diff`. Flip-diff **GAINED 22 / LOST 0**. Suite **990 files / 12,620 green**, lint 0
unpiped, MUTANT clean, module graph loads. **No pin claimed these shapes stay low** — nothing to graduate.

**STILL REFUSED, and now with a reason on the record:** the MANA-SPENT family (7 cards — `{R}/{U}/{G}/{B} was
spent to cast it`, `mana from a Treasure was spent to cast it`) needs per-cast mana provenance, which nothing
in the engine records. Pinned as refused so the gap is a decision rather than an oversight.

---

## 🏦 BANKED (unreleased) 2026-07-30 — **THE PER-TURN LEDGER, GIVEN READERS. GAINED 10, LOST 0.**

Curious Obsession · Franklin Richards, Ascendant · H.E.R.B.I.E., Lovable Robot · Human Torch ·
Mercadian Atlas · **Nightpack Ambusher** · See Red · Seeker of Insight · Starlit Soothsayer · Tapestry of the Ages.

**⭐ NOTHING NEW IS TRACKED BY THIS SLICE — that is the whole finding.** Both incumbent readers NAMED their own
missing arm: *"a FILTERED (a noncreature spell) variant fails the anchor"* and *"a with-a-creature qualifier, or
a negated form, fails the anchor"*. In every case the LEDGER FIELD ALREADY EXISTED and simply had no reader —
`noncreatureSpellsCastThisTurn`, `attackedThisTurn`, `landsPlayedThisTurn`, `spellsCastThisTurn`,
`lifeGainedThisTurn`, `lifeLostThisTurn` were all being maintained every turn and never asked a question. Five
readers added; zero new stamps at any fire site.

- **noncreature spell count** (5 cards) — read from its OWN counter, never approximated from the total. A seat
  that cast two CREATURE spells has a total of 2 and a noncreature count of 0; reading the total would fire
  Seeker of Insight off a creature.
- **`attacked with a creature` + the negations** — only creatures are ever declared as attackers (CR 508.1a),
  so the qualifier is flavour, and `didn't attack` is the exact inverse of one boolean.
- **the ZERO case of two existing counters** — `didn't play a land` / `didn't cast a spell`.
- **`gained or lost life this turn`** — a disjunction of two independently tracked counters.

**⛔ ONE PRINTED PHRASE REFUSED ON PURPOSE, and it is the honest half of the same census.** *"You haven't cast
a spell FROM YOUR HAND this turn"* (3 cards) is NOT read: `spellsCastThisTurn` is zone-blind, so answering from
it would return FALSE for a player who cast only from the graveyard — suppressing an ability whose printed
condition is TRUE. It parks until casts are tracked per source zone, and there is now a pin saying so, so
nobody "fixes" it by reusing the coarse counter.

**Three pins moved, and all three had named their own criterion:**
| pin | verdict |
|---|---|
| `activationCondition` "an unmodeled board query is refused rather than guessed" | Its own sentence was the criterion — refusing the filtered form *"rather than approximating it with the unfiltered one"*. Still the point: the new reader does not approximate. Graduated; boundary re-pointed to the zone-qualified phrase |
| `attackedThisTurn` "near-misses are NOT parseable" | 2 of its 4 near-misses graduated (both read the flag it already trusted); the boundary now holds where the SCOPE genuinely differs — a per-creature or opponent-scoped subject asks about a different referent |
| `spellCountAndCreatureBounce` "a FILTERED spell-count stays non-native — **the anchor is unfiltered spells only**" | Title named the criterion → graduated, plus a NEW sibling guard so the substance (never approximate a filtered tally with a coarser one) is kept, aimed at the zone case |

**Gates:** 10 new tests, both directions per reader; **all three mutations seen to fail** — pointing the
noncreature reader at the zone-blind total (2 tests), flipping the attack negation (1), turning
`gained or lost` into an AND (1). Reverts confirmed by `git diff`. Flip-diff **GAINED 10 / LOST 0**.
Suite **989 files / 12,604 green**, lint 0 unpiped, MUTANT clean, module graph loads.

**STILL OPEN from the T1 census (needs NEW tracking, not a reader):** *you created a token this turn* (2) ·
*you descended this turn* (5) · *you put a counter on a creature this turn* (2) · *you've discarded a card this
turn* (2) · the *"X entered the battlefield under your control this turn"* family (7 — ⚠️ a battlefield scan on
`enteredOnTurn` would UNDER-report a permanent that entered and then left, which is a confidently-wrong
answer, so this one needs a real per-turn entered-ledger rather than a scan).

---

## 🏦 BANKED (unreleased) 2026-07-30 — **CONDITION-FILTER VOCABULARY. GAINED 13, LOST 0.**

Bloodhall Ooze · Celestial Enforcer · Gangrenous Zombies · Goblin Bird-Grabber · Heidar, Rimewind Master ·
Mirror-Sigil Sergeant · Moonlit Scavengers · Parasitic Strix · Rhox Meditant · Rimewind Cryomancer ·
Ronom Serpent · Sedraxis Alchemist · Stone Haven Pilgrim.

**⭐ THE MULTIPLIER, AND THE ENGINE STATES IT ITSELF.** `evaluateInterveningIf` is ONE grammar behind three
probes — `interveningIfParseable` (triggers), `spellConditionParseable` (spells) and
`activationConditionParseable` (activated abilities, CR 602.5d) — and `conditionVocabularyReaders.test.js`
says so: *"a single reader added here reaches all three."* So the unit of work is a READER, not a card.

**How it was found.** `probe-trailing-tail-vein` reports **1058 parked cards are ONE trailing sentence from
native**; the head was `"activate only if…"` (44) + `"activate only during…"` (22). The activation-rider
machinery turned out to be fully built already — `abilities.js` attaches the condition only when
`activationConditionParseable` says yes — so the cards park on the CONDITION VOCABULARY, not the rider. A
three-lane census then measured **189 cards whose condition is the SOLE blocker**, bucketed by mechanism:
T1 turn-event history 49 · T2 "you control &lt;filter&gt;" 45 · T9 long tail 71 · the rest small. This slice took T2.

**⛔ RULE 1b KILLED THE FIRST DESIGN BEFORE A LINE WAS WRITTEN.** The single biggest exact phrase was
`"you control a desert or there is a desert card in your graveyard"` (6 cards), which reads as a plain
disjunction — so the obvious build was a top-level `or` splitter. Probing the halves first showed
`"there is a desert card in your graveyard"` is ALSO unreadable, so the splitter would have gained **zero**
there; and `"you control an artifact or enchantment"` needs SUBJECT PROPAGATION, not a bare split (half B is
`"enchantment"`). The real misses were all in `parseFilter`'s vocabulary, so that is what got widened.

**Four filter kinds added, each whole-anchored, each refusing outside its own vocabulary:**
KEYWORD (`a creature with flying`, layer-aware via `permanentHasKeyword`, curated word list) · COLOR
(`a blue permanent`, layer-aware via `permanentColors`, CR 105.2) · TYPE UNION (`an artifact or enchantment`,
both sides must be clean single-word type filters) · SNOW supertype (CR 205.4h).

**⭐ THE SHARPEST HAZARD — UNION vs CONJUNCTION.** `filter.word` may be an array, and the quantifier differs:
`artifact or enchantment` is a UNION (`.some()`) while `snow land` → `["Land","Snow"]` is a CONJUNCTION
(`.every()`, flagged `allWords`). Quantifying both with `.some()` would let *"you control four or more snow
permanents"* count ordinary lands — Heidar and Rimewind Cryomancer activating off an untapped Island, i.e. an
ability firing on a printed condition that is false. Pinned in both directions and mutation-checked.

**One pin moved — and the finding is that its EXAMPLE was mis-filed, not that its rule was wrong:**
`interveningIf.test.js` listed `"you control a blue permanent"` beside `"you control a commander"` under
*"a DESIGNATION read as a type would silently count 0 → must be rejected."* That reason is exactly right for
commander / monarch / the city's blessing — designations with no characteristic at all — but a COLOUR is a
real characteristic (CR 105.2), and it is now read from layer 5 rather than scanned for on the type line, so
it can never count 0 by mistake. Graduated in both of its lists (the value pin now asserts `false` on an empty
board, which is the correct answer, not `null`); the shape-gate list gained a re-pointed boundary trio — an
uncurated keyword word, a union with a non-type side, and a designation riding the keyword arm.

**Gates:** 16 new tests (every filter asserted in BOTH directions — a condition that reads but evaluates wrong
is worse than one that parks); **all three mutations seen to fail** — collapsing the conjunction to `.some()`,
opening the keyword allowlist, opening the colour gate. Reverts confirmed by `git diff`. Flip-diff
**GAINED 13 / LOST 0**. Suite **988 files / 12,593 green**, lint 0 unpiped, MUTANT clean, module graph loads
(a NEW import edge `interveningIf → layers` was added; verified one-way — layers reaches gameState / keywords /
staticAbilityParser / protection, none of which reach interveningIf).

**NEXT FROM THIS CENSUS:** T1 turn-event history (49) — the per-turn ledger exists (`a creature died this
turn`, `you've gained life this turn` are readable) but its event vocabulary is narrow: *you created a token* ·
*you attacked* · *you've cast a noncreature spell* · *a planeswalker/artifact/creature entered under your
control* · *you put a counter on a creature* · *you descended* · *you've sacrificed an artifact*. Then T2's
remainder (`another <filter>` with a rider, `no <X> other than this creature`, opponent-side queries) and the
graveyard-card-type reader that the desert cycle needs.

---

## ✅ SHIPPED 2026-07-30 — **MASS-DAMAGE RECIPIENT DELEGATION. GAINED 25, LOST 0.**

Blockbuster · Calamity of Cinders · Cinder Giant · Claws of Wirewood · Cloudthresher · Delete · **Earthquake** ·
Fang Dragon // Forktail Sweep · Fault Line · Fire Ants · Hammerfist Giant · Harbinger of the Hunt · Howling Gale ·
**Hurricane** · Leonin Bladetrap · Marrow Shards · Oros, the Avenger · Rain of Blades · Rockcaster Platoon ·
Sandstorm · Scorch the Fields · Scourge of Kher Ridges · **Squall Line** · Volcanic Spray · Whipflare.

**How it was found: `probe-vocabulary-asymmetry.mjs`, and the first two leads it gave were both nearly empty.**
The probe reported 21 asymmetric rows. Triage by REMOVAL, not containment, killed the first two: the
controller-subject sacrifice noun (136 cards CONTAIN it, **3** attributable) and named-counter-on-target (78
contain, **3**). The third row — sweeping-damage recipients — measured **65 attributable**, and that was the vein.
The two small ones are banked below, not lost.

**⭐ THE AXIS: the mass arm hand-rolled 2 of the 16 restriction kinds its own runtime already enforced.**
`massFilteredDamageClauseParser` had one regex per printed phrase — `with|without flying` and
`you control|your opponents control` — while `creatureSatisfiesRestrictions` already implemented typeNeg,
colorNeg, subtype, tapped, combat, power, toughness, manaValue, cardType, enteredThisTurn and more, **on this
very sweep**. Single-target removal reaches all of them by delegating its recipient phrase to the shared
`parseCreatureTargetRestrictions` grammar. The mass arm now delegates too, so the vocabulary arrives whole
instead of one printed phrase at a time — and two restrictions can finally COMPOSE (Leonin Bladetrap:
`each attacking creature without flying`, which one-regex-per-phrase structurally cannot express).

**THREE GATES had to open, in the order a clause meets them. Finding gate 1 was the whole slice.**
1. **`splitClauses.js` — the SYMBURN-1 keep-whole guard.** Anchored on `\d+` and the BARE form, so it
   **shattered** every filtered and every X-amount "…and each player" sentence. Hurricane split into
   `deals X damage to each creature with flying` — which parsed **HIGH on its own** — plus an unbindable
   `each player`. I had theorised the atom parser was the gate; probing the REAL bundled oracle showed the
   sentence never reached it intact. ⭐ **Widening a keep-whole guard is the SAFE direction**: keeping a
   sentence whole can only fail to match (→ low → Arbiter), while SPLITTING is what drops halves. Both
   original anchors survive (the tail `$`, and the subject-prefix guard against a dropped leading effect).
2. **`stack.js` — the delegating arm**, placed LAST so the four exact matchers above stay byte-identical
   (the ordering rule: a widening gated behind the prior paths' failure cannot regress them).
3. **`spellEffects.js` — the `eachCreatureAndPlayer` runtime**, which never filtered its creature half because
   no parse arm could hand it a restriction. Shipping gate 2 without gate 3 would make Hurricane burn the whole
   board. The PLAYER half stays deliberately unfiltered — a creature predicate says nothing about which seats
   take damage, and "each player" includes the caster.

**⛔ THE TWO GUARDS THAT CARRY THE FP RISK:**
- **"other" is PEELED, never delegated.** `parseCreatureTargetRestrictions` treats "other" as filler and
  silently strips it, so delegating `each other creature you control` would return clean with only a controller
  restriction — and the source would damage **itself** (CR 113.7). Harbinger of the Hunt and Scourge of Kher
  Ridges are flying Dragons whose second ability hits "each other creature with flying"; losing the peel makes
  each Dragon nuke itself.
- **`clean === false` refuses.** The shared parser returns whatever it could not model; any residue parks the
  card. That gate is why this shipped 25 and not 65 — `each creature dealt damage this turn`, `each creature
  blocking it`, `each creature except for creatures you control with flying`, `each creature target opponent
  controls` all still route to the Arbiter, correctly.

**PREDICT-THEN-AUDIT: predicted 23, got 25 — and the two extras were MY probe's fault, not the model's.**
Harbinger of the Hunt and Scourge of Kher Ridges each carry TWO sweeping-damage abilities, and my attribution
probe used a non-global `String.replace`, which swaps only the FIRST occurrence — so clause 2 still blocked and
both cards were excluded from the 65. **Same banked lesson as the `perl`-without-`/g` incident, in a different
language.** Both audited by hand afterwards: correct, and the `eachOtherCreature` scope held on the second
ability of each.

**Two pins moved, each with a stated verdict:**
| pin | verdict |
|---|---|
| `etbSupportSweep` "a FILTERED / extended each-other-creature sweep stays LOW (**deliberately parked**)" | CAPABILITY — 2 of its 4 probes graduated (Harbinger, Cinder Giant); the boundary was RE-POINTED to the two that still park (an extra recipient scope: Avacyn's `and each opponent`, Conductor's `and each player`), and a new atom-level pin asserts the source is still excluded once a filter is in play |
| `parser.test` MUST_DROP_TO_LOW `"…each creature an opponent controls"` | ⭐ BOUNDARY — its note said "only bare `each creature` is modeled", capability language. **Checked the phrase against the corpus instead of reasoning about it:** its only 3 printed carriers are acorn cards (Ol' Buzzbark, Slaying Mantis, Unhinged Beast Hunt), each with a further physical qualifier, all still body-only — and the 35-card `each creature your opponents control` family already maps to the SAME `{controller:"opponent"}` restriction. So HIGH is not wrong. Re-pointed to `each creature **target** opponent controls` (Simoon), which IS still dangerous: it must hit ONE opponent's creatures and `controller:"opponent"` would hit ALL of them — a multiplayer FP |

**Gates:** 30 new tests + 2 re-pointed pins; **all three mutations seen to fail** — dropping the runtime filter
(2 tests), forcing `isOther = false` (1), disabling the `clean` gate (2). ⚠️ The mutation anchors had to be
UNIQUE SPANS, not lines: the `eachCreature` branch holds a **byte-identical** `creatureSatisfiesRestrictions`
line, so a line-anchored replace would have sabotaged the wrong branch and "proven" a test that never covered
the change. Reverts confirmed by `git diff --stat`, not the marker sweep. Flip-diff **GAINED 25 / LOST 0**,
zero within-native shifts. Suite **987 files / 12,577 green**, lint 0 unpiped, MUTANT clean, module graph loads.

**⚠️ AND THE MUTATION RUN CORRECTED ONE OF MY OWN TEST COMMENTS.** I had written that the runtime self-damage
test was "THE test for guard A" and that "no parser-level assertion would catch it". Forcing `isOther = false`
failed exactly ONE test — the *parser* one. The runtime test hand-builds its atom, so it cannot see a parse-side
regression. Guard A is a two-link chain and each test pins one link; the comment now says so exactly.

**BANKED, MEASURED, NOT BUILT** (two small axes from the same probe run, both real, both ~3 cards):
- **Controller-subject sacrifice nouns** (`removal.js:378` is the single string `/^sacrifice a creature$/`, while
  its four sibling subjects — target player / each player / each opponent / the upkeep player — each carry
  EDICT_NOUN + permanent + TYPED, and `sacrificePoolMatch` already handles all 11 pools for any subject).
  Attributable: Drinker of Sorrow, Perilous Research (`a permanent`). +1 more (Korozda Guildmage,
  `nontoken creature`) sits on the ACTIVATED-COST noun list at `abilities.js:411`, which needs a `nontoken`
  flag honoured at the legalChoices victim filter or it offers a token to pay a cost that forbids one.
- **Named-counter placement on a target**: `shieldCounterClauseParser` is exact string equality, so
  `put a shield counter on target creature **you control**` (Brokers Veteran) fails; and there is no
  keyword-counter placement op at all, though `_ENFORCED_KEYWORD_COUNTER_KINDS` + `permanentHasKeyword` already
  grant flying/exalted from a counter (Recycla-bird, Emissary of Soulfire).

**STILL REFUSED from the 65, by mechanism:** multi-target damage division (10 — `each of two targets`,
`each of X targets`); `and each planeswalker` (4 — needs a new combined scope + loyalty removal, Star of
Extinction / Storm's Wrath / Magmaquake); `opponent and each creature they control` (4 — Goblin Chainwhirler,
Tectonic Hazard); negated SUBTYPE sweeps (4 — non-Dragon / non-Pirate / non-Vampire / nontoken; the grammar has
`subtype` but not its negation); horsemanship (2); combat-referent forms (`each creature blocking it`).

---

## ✅ SHIPPED 2026-07-30 — **TARGETED OPTIONAL-PAYMENT PAYOFFS. GAINED 21, LOST 0.**

Bearer of Silence · Conduit Goblin · Drainpipe Vermin · Embersmith · Equilibrium · Eternal Taskmaster ·
Frenzied Goblin · Furnace Celebration · Genesis · Haazda Snare Squad · Insidious Bookworms · Jubilant Mascot ·
Kalastria Highborn · Leyline of Lightning · Maulfist Doorbuster · Quiet Contemplation · Searing Meditation ·
Serene Steward · Shu Yun the Silent Tempest · Surgespanner · Veinwitch Coven.

**The gap the engine had already named:** `matchOptionalManaPayment` rejected any payoff needing a chosen target,
with the note *"would need its target threaded through the pay-choice **(unbuilt)**"*. Built it — a four-point
thread: the parser lifts the payoff's single chosen target type onto the wrapper, the suspend captures
`ctx.targets`, the pending choice carries them, the settler replays them instead of the hardcoded `targets: []`.

**⭐ WHY THE ORDERING IS LEGAL (and why this isn't a hack):** the target is chosen when the ability is PUT ON THE
STACK (CR 603.3d); the optional payment happens as it RESOLVES. Declaring the payoff's target type on the wrapper
makes the trigger lock its target at flush — exactly on time — and the later pay/decline cannot change it.
Declining runs nothing, and the target was still legally chosen.

**⛔ THE FIFTH TOUCH-POINT WAS THE SAFETY ONE, and it was not obvious.** After all four wiring changes the cards
STILL parked: `triggerRoutesNatively` refused them, because the trigger-flush auto-chooser only fires when it can
place a target on a **provably correct side** (`atomTargetIntent`), and my new wrapper op was unknown to that
classifier → ambiguous → refused. The fix is DELEGATION: a wrapper does no targeting of its own, so its intent IS
its payoff's intent. Disagreement or unreadability → `"ambiguous"`, the refusing direction. **That gate is why
this shipped 21 and not 34** — the other 13 have payoffs whose side the engine cannot place, and they correctly
stay parked.

**⚠️ ONE FAILURE I HAD TO TREAT AS A POSSIBLE FALSE POSITIVE, and it is the most useful thing here.**
`becomesTapped.test.js` pinned Surgespanner body-only with the comment *"the ambiguous-target bounce fails
triggerRoutesNatively"* — and Surgespanner was in my flip list. If my delegation had invented a side for a bounce,
that pin would have been reporting a real FP. Checked it directly: **a `bounce` atom reports ENEMY intent**, and
had been graduated from ambiguous at some earlier slice — **the pin's comment was stale**, not my code. The only
thing parking Surgespanner was the wrapper's blanket refusal. Verified before editing the test, not after.

**Five pins moved, each for a stated reason (never deleted):**
| pin | verdict |
|---|---|
| `optionalManaPayment` "chosen-TARGET stays LOW **(target wiring … is unbuilt)**" | CAPABILITY — its title named the criterion → graduated, + a new boundary (two distinct target types still refuse) |
| `optionalManaPayment` "an UNMODELED payoff stays body-only" | BOUNDARY — it used a *targeted* payoff as its "unmodeled" example → re-pointed to a filtered-sacrifice victim |
| `cantBlock` "an optional 'pay then' rider stays body-only" | BOUNDARY → graduated (Frenzied Goblin is one of the 21) |
| `becomesTapped` Surgespanner | premise stale (see above) → graduated + comment corrected |
| `optionalPaymentSelfPronoun` "a CHOSEN target payoff is not rewritten" | ⭐ its `confidence !== high` was a PROXY for "no pronoun rewrite". The proxy died; the CLAIM did not — now asserted directly (`inner.target !== "self"`), which is stronger than what it replaced |

**Gates:** 12 new tests + 5 graduated; **both mutations seen to fail** — reverting the settler to `targets: []`
(caught by the PAY test alone) and collapsing `"ambiguous"` into a guess (caught by both safety tests).
Flip-diff **GAINED 21 / LOST 0**. Suite **986 files / 12,546 green**, lint 0 unpiped, MUTANT clean.

**✅ v0.149.17 PUBLISHED AND VERIFIED BY CONTENT** — `releases/latest/download/latest.json` reports
`version 0.149.17`, a URL pointing at the real `MTG.Tool_0.149.17_x64-setup.exe`, and a 424-char minisign
signature. 5 assets, full updater chain. Master at `c00cafe3`.

**STILL REFUSED, deliberately:** the 12 `"When you do"` variants (an optional primary with a reflexive tail would
fire even when the player DECLINES) and the 13 whose payoff intent is unplaceable.

---

## 🎯 THE VEIN AS FIRST MEASURED — 34 cards, and the engine NAMES what is unbuilt.
### `you may pay {N}. If you do, <TARGETED effect>` — target threading through the pay-choice. START HERE COLD.

**How it was found:** chasing why the reflexive-wrapper Role cards park. The controls failed too, which pointed
at a mechanism rather than a phrasing. Then the population split three ways by WHICH documented guard stops it —
and only one third is a single buildable mechanism.

**⛔ THE MATCHER NAMES THE MISSING PIECE ITSELF** (`parser.js` `matchOptionalManaPayment`, line ~1099):
> "SELF-CONTAINED gate (CREED): a chosen-target payoff would need its target threaded through the pay-choice
> **(unbuilt)** → keep it LOW. The draw-family payoffs are targetless (programNeedsChosenTarget false)."

So this is a **CAPABILITY pin with its graduation criterion written down**: thread the chosen target through
the optional-mana-payment pay/decline suspend, and 34 cards graduate at once.

**THE THREE-WAY SPLIT (attributed by removal; payoff verified to parse on a known-good anchor):**
```
⭐ (B) 34  "If you do" + a TARGETED payoff   -> ONE capability pin. THE VEIN.
   (A) 12  "When you do" instead of "If you do" -> DELIBERATE refusal, do not touch: an optional primary with a
                                                   reflexive tail would fire even when the player DECLINES the
                                                   "may" (parser.js:1046-1048, pinned LOW by diceRoll.test.js).
   (C) 34  "If you do" + targetless, still parked -> NOT one gap. 34 DIFFERENT unmodeled TRIGGER EVENTS.
```
**The 34 in (B), all one shape:** Ruthless Sniper · Smolder Initiate · Malachite/Hematite/Onyx/Nacre/Lapis
Lazuli Talisman (×5) · Conduit Goblin · Genesis · Drowner Initiate · Intimidator Initiate · Haazda Snare Squad ·
Surgespanner · Lightning Cloud · Serene Steward · Frenzied Goblin · Maulfist Doorbuster · Kalastria Highborn ·
Nurturer Initiate · Shu Yun · Searing Meditation · Eternal Taskmaster · Veinwitch Coven · Lightning Rift ·
Furnace Celebration · Drainpipe Vermin · Leyline of Lightning · Equilibrium · Bearer of Silence · Embersmith ·
Knowledge and Power · Quiet Contemplation · Sludge Strider · Insidious Bookworms.

**⚠️ (C) IS A TRAP AND I NEARLY FELL IN IT.** It looked like 34 more cards of the same vein — the wrapper shape
matches, the payoff parses, and `parser.js`'s own docstring even NAMES Symmetry Matrix and Pedantic Learning as
cards it handles. But the wrapper is fine on those cards; their TRIGGER LEAD is the blocker, and every lead is
different (filtered-ETB "power equal to its toughness", library-PiG, bounce-watcher, colored-spell-cast,
PiG-with-intervening-if). Proven by holding the payoff constant and varying only the lead: upkeep / ETB /
attacks / dies all go native, `whenever you cycle or discard a card` parks. **Same surface string, different
mechanism — the fourth time this session.**

**BUILD NOTES for whoever takes it:** the pay-choice already suspends and resumes
(`runProgram.resolveOptionalManaPaymentChoice`; pay → `payManaCost` + run the payoff, decline → nothing). What
is missing is carrying the chosen target across that suspend. ⚠️ Respect the sibling guard while you are in
there: a NON-LAST payoff atom that can itself pause must still be rejected (`PAUSING_ATOM_OPS`), because the
settler chains a mid-payoff pause onto the program continuation and would DROP the atoms after it. And the
`targetType: null` on the emitted atom is currently load-bearing — it will need to become the real target type.

---

## ⚠️ PHASE 4 RE-SCOPED (2026-07-30) — **"attached to it" is NOT one 5-card form. "it" binds to 3 different things.**

Correcting my own census one entry down. I grouped 5 cards under `attached to it` and called it phase 4's
biggest form. Reading the printed text, the pronoun resolves differently on each, so it is **~1 card per
referent kind** — a singleton tail, not a form:
```
ETB SELF ("it" = the entering creature = the source)
  Cursed Courtier    "When this creature enters, create a Cursed Role token attached to it."     ← CLEAN, 1 card
  Faunsbane Troll    same form, but ALSO blocked by its fight/exile activated ability
  Unassuming Sage    same form, wrapped in "you may pay {2}. If you do, …" (reflexive)

SPELL TARGET ("it" = a creature targeted EARLIER in the same spell — a cross-clause referent)
  Monstrous Rage     "Target creature gets +2/+0 until end of turn. Create a … token attached to it."
  Return Triumphant  "it" = a creature RETURNED FROM A GRAVEYARD — not even a targeted battlefield object
  Become Brutes      "For each of those creatures, … attached to it" — a PLURAL per-creature loop

INSIDE A QUOTED GRANT
  Not Dead After All  the "it" sits inside a granted quoted trigger that itself creates a Role. Nested.
```
**So phase 4 is per-card work at roughly one card per referent mechanism**, and the cheapest single build is the
ETB-self case → **Cursed Courtier alone (+1)**. Not started: a 1-card build on a referent thread is not worth a
slice while cheaper work exists elsewhere, and the correct scoping is now recorded so nobody re-derives it.

**⭐ THE LESSON, and it is the third instance this session:** grouping by a SURFACE STRING (`attached to it`)
is not grouping by MECHANISM. It produced a phantom 5-card form exactly as "Enchant creature ×496" and the
74-card flash vein did. **Group by what the engine must DO, not by what the card says.**

---

## ⛔ LEAD DISSOLVED (2026-07-30) — **the "7-card composition bug" is 3+ unrelated narrow interactions. DO NOT BUILD.**

The entry below said: *"do not call this a bug until the refusal is checked for a documented reason."* Checked.
It is not one bug, one of its causes is an explicit refusal, and the rest are 1–2 cards each. **No vein here.**

**(a) DELIBERATE, DOCUMENTED REFUSAL — Witch's Mark · Incinerating Blast.** `matchOptionalDiscardPayment`
(`parser.js:1226`) rejects any payoff where `programNeedsChosenTarget(payoff)`, and its CREED guard list at
:1201 states **`targetless`** outright. The reason is its PAUSE MODEL: it runs `[cost-discard, …payoff]` as one
program through a resume cursor, and that is proven safe only for a **last-position pausing atom**. A chosen
target is a different kind of choice, outside the proven-safe family. **CAPABILITY pin** — graduates only when
the pause chain is proven safe for a chosen-target payoff, which is a real piece of work, not a widening.

**(b) IMPULSE-EXILE SECOND LINES — Inspired Tinkering · Blazing Crescendo · Mjölnir's Might.** All three pair
something with "Exile the top card…. Until the end of your next turn, you may play that card." Cause not
chased (each is 1 card); presumably its own guard.

**(c) TWO GENUINELY NARROW COMPOSITION GAPS, measured:**
```
Orcish Cannonade   "…deals 2 damage to any target and 3 damage to you."  ALONE          -> native ✅
                   "…deals 2 damage to any target."  +  "Draw a card."                  -> native ✅
                   the SELF-DAMAGE RIDER  +  "Draw a card."                             -> ARBITER ⛔
Verdant Rebirth    the until-EOT quoted grant  ALONE                                     -> native ✅
                   that  +  "Draw a card."                                               -> ARBITER ⛔
```
**⚠️ AND MY ORDER HYPOTHESIS WAS WRONG.** I guessed targeted-then-plain was the failing direction, since my
earlier passing case was plain-then-targeted. Tested both ways plus same-line: **all native.** Order is not the
variable at all — it is these two specific clause shapes refusing to compose with anything after them.

**⭐ THE POINT OF THIS ENTRY IS THE NEGATIVE RESULT.** "Every line native ⇒ the card should be native" is not a
law in this engine, and treating it as one would have sent someone building a general composition fix for
a phantom 7-card vein that is really 2 cards of real gap behind one principled refusal and three unexamined
singletons. The ledger's own caution — *don't call it a bug until you check* — is what saved the work.

---

## 🔍 THE ORIGINAL LEAD (superseded by the verdict above) — spell-line composition, 7 cards
### ⚠️ CAUSE NOT ESTABLISHED at the time of writing.

**v0.149.16 published and verified by content** (`version 0.149.16`, real installer URL, 424-char signature,
full 5-asset chain) — 18 cards live.

**How this surfaced:** phase 4's census listed **Witch's Mark** under "TARGETED (already built)" yet still
non-native, which should have been impossible. Chasing the anomaly instead of shrugging at it:
```
"You may discard a card. If you do, draw two cards."                    -> native-spell  ✅
"Create a Wicked Role token attached to up to one target creature …"    -> native-spell  ✅
the WHOLE CARD                                                          -> arbiter-spell ⛔
```
Both lines native, card not. So this is a COMPOSITION failure, not a Role gap.

**The matrix, measured** (A = "Draw a card.", B = "Create a Treasure token.",
C = "You may discard a card. If you do, draw two cards.", D = the targeted Role line):
```
A + B      plain + plain              -> native     ✅
A + D      plain + targeted           -> native     ✅
C + B      reflexive + plain          -> native     ✅
C + D      reflexive + targeted       -> ARBITER    ⛔   <-- Witch's Mark's shape
A + B + C  three lines                -> ARBITER    ⛔
C then D on ONE line (two sentences)  -> ARBITER    ⛔   (so it is not a line-splitting artifact)
```
It is **not a simple clause count** — `C + B` is three clauses and native, `C + D` is three and parks. The
suspicious pair is a REFLEXIVE optional ("you may … if you do …") composed with a TARGETED clause.

**Corpus reach — spells where EVERY line classifies native but the card does not: 7.**
Witch's Mark · Inspired Tinkering · Incinerating Blast · Blazing Crescendo · Mjölnir's Might ·
Orcish Cannonade · Verdant Rebirth.

**⛔ WHY THIS IS A LEAD AND NOT A FINDING.** "Every line native ⇒ the card should be native" is NOT a law in
this engine — the whole-card rule deliberately parks combinations it cannot sequence faithfully (ordering,
target dependencies between clauses). Some or all of these 7 may be correct refusals. **Before building:
find whether a reflexive+targeted composition is deliberately declined and why** (grep the reflexive/optional
machinery and parser.js for a documented guard). Only then decide. Treat the 7 as an upper bound.

### Phase 4 scope, measured (for whenever it is taken)
Counting ONLY cards whose Role is registered and whose Role line is the sole blocker:
```
5  "attached to it"   (self/ETB referent)  Cursed Courtier · Monstrous Rage · Become Brutes ·
                                            Return Triumphant · Not Dead After All
4  reflexive wrapper  ("you may pay {1}. When you do, …" / "When you do, that creature fights …")
                                            Spellbook Vendor · Curse of the Werefox · Merry Bards · Witch's Mark
1  "that creature"                          Royal Treatment
2  other                                    Giant Inheritance (granted attack trigger) · Twisted Sewer-Witch
1  ⛔ unregistered Role — no gain possible   Questing Cosplayer (Questing has no bundled definition)
```
**Biggest single form is `attached to it` (5).** "it" binds to the entering/targeted creature, so it needs a
referent thread — `ctx.triggeringPermanentId` for the ETB cases, the chosen target for the spell cases.
⚠️ Witch's Mark appears in BOTH lists: it is the reflexive-composition case above, not a phrasing gap.

---

## ✅ SHIPPED — **ROLE TOKENS PHASE 3: WICKED + the Aura-PiG generalisation. GAINED 8, LOST 0.**
### Role project total: **18 cards** (7 + 3 + 8). All SEVEN data-defined Roles now registered.

Wicked Roles: Charming Scoundrel · Conceited Witch // Price of Beauty · Eriette's Whisper · Shatter the Oath.
**And four MORE that were never Role cards at all:** Audacity · Chime of Night · Mantle of the Wolf ·
Reach for the Sky — freed by the same generalisation. The slice paid twice.

**THE REAL FIX WAS A HARDCODED PAYOFF.** The Aura-own put-into-graveyard trigger existed and routed — but only
for ONE payoff:
```
"…is put into a graveyard from the battlefield, return it to its owner's hand."  -> native  ✅ (18 cards)
"…, each opponent loses 1 life."                                                 -> 0 triggers ⛔
"…, draw a card."                                                                -> 0 triggers ⛔
"When this creature DIES, each opponent loses 1 life."                           -> native  ✅ (same effect!)
```
The effect vocabulary was never the problem — the same payoffs parse fine on a *dies* anchor. `"this aura"`
was **deliberately excluded** from the general SELF-PiG alternation (`triggers.js`), with a documented reason:
`classifyCondition` has priority over the `selfReturn.js` registry, so matching it there stripped the
`selfReturnKind` rewrite that Rancor's bare "return it to its owner's hand" depends on.

**⭐ THE FIX WAS TO CARRY THE MARKER, NOT AVOID THE SUBJECT.** `"this aura"` now rides the general arm and
returns the SAME descriptor the registry returned (`selfReturnKind: "self"`), so Rancor is byte-identical while
every other payoff reaches the normal pipeline. **The discrimination already lived where the EFFECT is in
scope** — the caller gates the rewrite on `cls.selfReturnKind && SELF_RETURN_IT_RE.test(effectClause)`. Rancor's
effect matches and keeps its rewrite; Wicked's does not and routes normally. `classifyCondition` never needed to
see the payoff at all.
⚠️ The marker is set ONLY for the aura subject — setting it for artifact/creature/enchantment/permanent would
newly hand the rewrite to their bare self-returns (Spine of Ish Sah), an unmeasured widening.

**⭐⭐ THE GATE DEMANDED THIS PROMOTION TOO — THE THIRD TIME.** `verify-role-token-data.mjs` failed with
**"Wicked: its body is NOW EXECUTABLE — register it"** the moment the trigger generalised. Its
`KNOWN_UNMODELED` list is now EMPTY: every Role the bundled data defines is registered, and the only refusals
left are Chef / Questing / Huntsman, which have no definition to copy.

**Gates:** 19 hermetic tests + the corpus gate (exit 0); **the mutation seen to fail** — dropping the
`selfReturnKind` marker breaks Rancor and nothing else, caught by the named regression pin. Also pinned: an
UNMODELED payoff still parks (the widening is not a blank cheque — the effect pipeline is still the gate).
Flip-diff **GAINED 8 / LOST 0**, every row audited. Suite **985 files / 12,534 green**, lint 0, MUTANT clean.

**REMAINING:** phase 4 = the referent phrasings (`attached to that creature` / `it`, Gylwain's modes, the
reflexive "you may pay {1}. When you do, …" wrappers) — Merry Bards, Return Triumphant, Cursed Courtier,
Unassuming Sage, Gylwain, Asinine Antics, Ratatwotwo, Questing Cosplayer.

---

## ✅ SHIPPED — **ROLE TOKENS PHASE 2: YOUNG HERO. GAINED 3, LOST 0.** (Role project total: 10)

Cut In · Embereth Veteran · Protective Parents.

**What landed:** the self-P/T-threshold intervening-if (`its <power|toughness> is N or <less|greater>`), then
Young Hero registered and added to the parse alternation.

**⭐⭐ THE GATE DEMANDED THE PROMOTION — TWICE — WHICH IS THE WHOLE POINT OF PHASE 1'S DESIGN.** The moment the
intervening-if arm landed, `verify-role-token-data.mjs` failed with **"Young Hero: its body is NOW EXECUTABLE —
register it in NAMED_TOKENS and add its parse arm"**. Then it failed AGAIN because its own `KNOWN_UNMODELED`
list still called Young Hero unmodeled. A refusal encoded as a live capability check, not a verdict — and the
gate refusing to pass on its own stale bookkeeping is the strongest evidence it wasn't passing vacuously.

**⭐ AND THE ARM IS THE SAME CODE I SHIPPED-AND-REVERTED EARLIER**, when its flip-diff was GAINED 0 because no
corpus card PRINTS that condition — only the Young Hero token carries it. Reverting then and re-applying it
here, with the Role that needs it, is exactly what the 0-flip rule is for: it kept an unverified widening out of
the baseline and cost nothing but a re-paste.

**⛔ LAYER-AWARE IS LOAD-BEARING, and it is pinned:** Young Hero pumps only while toughness ≤ 3, so the read
must be live. Asserted at 1/1 → true, 3/3 (two counters) → still true, 4/4 (three counters) → **false**. A
printed-P/T read would pump forever, which the printed Role forbids. Missing/vanished referent → `null`.

**⚠️ A BOUNDARY PIN BROKE, AND IT PREDICTED ITSELF.** `aura.test.js`'s "a non-native Aura routes to the Arbiter"
fixture was **Writ of Passage** — *"if its power is 2 or less"*, precisely the condition this arm made readable.
Its own comment said **"FIXTURE SWAPPED TWICE… Expect to swap the fixture again."** Third swap done, to
**Ghostly Touch**: the Aura DELIVERY is modelled, its granted body ("you may tap or untap target permanent") is
not. Re-pointed, never deleted — the behaviour under test is permanent even though every example of it is
temporary. The comment now names what will un-park it next.

**⚠️ 3, not the predicted 5.** Merry Bards and Return Triumphant did not flip: Merry Bards wraps the creation in
a reflexive "you may pay {1}. When you do, …", and Return Triumphant pairs it with a graveyard-return half.
Both are second blockers, not Role problems.

**Gates:** 15 hermetic tests + the corpus gate (exit 0); flip-diff **GAINED 3 / LOST 0**; suite **985 files /
12,530 green**; lint 0 unpiped; MUTANT sweep clean.

**REMAINING:** phase 3 = an Aura put-into-graveyard trigger → **Wicked (+6)**; phase 4 = the referent phrasings
(`attached to that creature` / `it`, Gylwain's modes, the reflexive wrappers) → the rest.

---

## ✅ SHIPPED — **ROLE TOKENS PHASE 1 (CR 303.4). GAINED 7, LOST 0.**

Besotted Knight // Betroth the Beast · Charmed Clothier · Ferocious Werefox // Guard Change · Living Lectern ·
Redtooth Genealogist · Spiteful Hexmage · Splashy Spellcaster.

**What landed:** five Roles registered in `NAMED_TOKENS` (`aura: true`), an attach path in
`applyCreateNamedToken`, and a parse arm for the measured TARGETED phrasings. `NAMED_TOKENS` previously held
only free-standing artifact tokens; a Role is an **Aura that enters attached**, and that attachment is where its
entire effect comes from.

**⛔ THE TWO GUARDS THAT MATTER, both mutation-verified:**
- **Attachment goes through `attachPermanent`, never a hand-stamped `attachedTo`.** That helper maintains BOTH
  sides — `attachedTo` on the Aura AND `attachments[]` on the host — and is the single chokepoint where a
  control-Aura's control change applies. ⚠️ **Under the half-link mutation the buff STILL WORKED** (the layer
  Aura path reads `attachedTo`), so only the explicit `host.attachments` assertion caught it. A one-sided link
  would have been invisible to every reader that walks the host — the ATTACHED-watcher scan in
  `checkCombatDamageTriggers`, for one.
- **No legal object to enchant → the token is NOT created (CR 303.4).** Minting it unattached would put a
  permanent on the battlefield the rules say shouldn't exist, buffing nobody. Covers the legal zero-target
  choice on "up to one target creature" AND a target that left before resolution. Caught by 2 tests.

**⛔ THE REFUSALS ARE HALF THE SLICE — and they are two different refusals, both tested:**
- **Wicked · Young Hero** — defined in bundled data, bodies unmodeled (`body-only` as Auras). Registering them
  would mint a token whose ability silently does nothing: the phantom-mana mistake in a new costume, which is
  the bar `NAMED_TOKENS` sets for itself.
- **Chef · Questing · Huntsman** — cards ASK for them; **no definition exists in the bundled data**, so their
  text cannot be written at all (CLAUDE.md §1.2). Permanent refusal until the data carries them.

**⭐ THE DATA-PINNING GATE, and why it is a SCRIPT not a unit test.** `scripts/verify-role-token-data.mjs`
re-reads the bundled Role token objects and asserts each registry string matches byte-for-byte, that every
registered body is executable, that the two unmodeled Roles are STILL unmodeled (if one becomes native the gate
fails and says "register it"), and that the three undefined ones are still undefined.
**It caught a real omission on its first run** — Royal's bundled text carries its ward reminder inline and the
registry had dropped it. ⚠️ It is a script because **the vitest suite is HERMETIC: `allCards()` THROWS in it**
(verified). A unit test that silently skipped when the corpus is absent would be a hollow gate — green because
it checked nothing. Run it with `MTG_APP_ROOT` as part of any Role work.

**Gates:** 11 hermetic tests + the corpus gate (exit 0); **both mutations seen to fail** (CR 303.4 guard removed
→ 2 tests; half-link → the both-sides test alone). Diff additive only (+76, zero deletions). **Tier flip-diff
over 34,210 cards: GAINED 7 / LOST 0**, every row audited. Suite **985 files / 12,526 green**, lint 0 (checked
unpiped).

**⚠️ 7, not the 13 I estimated — and the gap is by CHOICE, not by surprise:** the REFERENT phrasings
(`attached to that creature` / `attached to it`, Gylwain's modes, Cursed Courtier, Unassuming Sage) are
deliberately unmatched because they need a saga/ETB self-reference; Questing Cosplayer's reversed
"create … and attach it to" word order likewise; and the Wicked / Young Hero cards await phases 2–3.

**REMAINING PHASES:** (2) the self-P/T-threshold intervening-if → Young Hero, **+5**; (3) an Aura
put-into-graveyard trigger → Wicked, **+6**; (4) the referent phrasings → the rest. Phase 2's exact patch is
recorded two entries down.

---

## 🔧 ROLE TOKENS — PHASE 1 IMPLEMENTATION SPEC (as planned; kept as the record)

Runtime and data both verified this session. **Phase 1 must land as ONE unit** (registry + attach + parse arm):
the registry alone flips nothing, and a 0-flip change does not ship (the subtype-pump / self-P-T precedents).

**✅ RUNTIME PROVEN — an attached Aura TOKEN is fully honoured by the layer engine.** Minted a token with
`attachedTo` + `card.token` and derived the host: Monster → **3/3 + trample**, Cursed → **base 1/1**, a printed
non-token Aura with the same text → identical, and the SAME token left unattached → **2/2, nothing**. So
minting an attached Role hands the player a permanent the engine actually drives. (Royal's ward does not appear
in the keyword list because ward rides `permanentGrantedWardCosts`, a separate path — probe artifact, not a bug.)

**✅ DEFINITIONS COME FROM BUNDLED DATA.** The Roles are DFC token objects, type line
`Token Enchantment — Aura Role`; 7 faces present. Copy the text from there and **pin it with a test that
re-reads the bundled objects**, so the registry cannot drift from the source (CLAUDE.md §1.2).

**REGISTER ONLY THESE FIVE — the ones whose body the engine can actually execute:**
```
Cursed    native-aura      Enchanted creature has base power and toughness 1/1.
Monster   native-aura      Enchanted creature gets +1/+1 and has trample.
Royal     native-aura      Enchanted creature gets +1/+1 and has ward {1}.
Sorcerer  native-trigger   … gets +1/+1 and has "Whenever this creature attacks, scry 1."
Virtuous  native-aura      … gets +1/+1 for each enchantment you control.
```
**⛔ REFUSE (and TEST the refusal), for two different reasons:**
- **Wicked** (body-only: its put-into-graveyard drain) and **Young Hero** (body-only: its quoted toughness
  trigger) — defined in data but their bodies are unmodeled. Minting them would hand over a token whose
  ability silently does nothing: *the phantom-mana mistake in a new costume*, which is the bar
  `NAMED_TOKENS` already states for itself. They arrive in phases 2 and 3.
- **Chef · Questing · Huntsman** — cards ask for them but **no definition exists in the bundled data**, so
  their text cannot be written at all. Permanent refusal until the data carries them.

**Cards ask for:** Cursed 4 · Wicked 4 · Monster 4 · Sorcerer 3 · Young Hero 2 · Royal 2 · Chef/Questing/
Virtuous/Huntsman 1 each. Phase-1 ceiling is the five registered Roles; the flip-diff is the real number.

**THE PARSE ARM — build to the MEASURED phrasings only.** `tokens.js` states its own standard: *"this file's
standard is that an anchor states what was measured"*, and it deliberately does NOT derive its alternation
from `Object.keys(NAMED_TOKENS)`. Measured Role-creation clause forms (38 shapes, all 0 native), core clause
`Create a <ROLE> Role token attached to <TARGET>`, with TARGET being:
```
target creature you control            (3)   up to one target creature you control   (2)
that creature                          (3)   another target creature you control     (2)
it                                     (2)   up to one other target creature you control
up to one target creature              (1)   another target creature                 (1)
"create a <ROLE> Role token and attach it to target creature"   (1 — Questing Cosplayer, different word order)
```
Start with the **targeted** forms (`[up to one] [other] target creature [you control]`); `that creature` / `it`
need a referent (a saga/ETB self-reference) and can follow.

**THE NEW CAPABILITY IS ATTACHMENT.** `applyCreateNamedToken` mints a free-standing permanent and has no
attach path; every existing entry is a non-creature ARTIFACT. Phase 1 must mint with `attachedTo: <targetId>`
(the same field `gateMet`'s `isEquipped` walk and `isModifiedPermanent` already read) and set the Aura type
line. ⚠️ Attaching to an ILLEGAL target, or minting unattached when the target is gone, are both FP paths —
CR 303.4: an Aura entering with no legal object to enchant simply is not created/attached. Test both.

---

## 🎯 ROLE TOKENS — WHY (the census that picked this target). **24 cards, 3 phases.**

The biggest attributed vein found this run, and unusually well-conditioned: **5 of the 7 Role bodies are
ALREADY native**, so most of the work is one effect (create-a-token-ATTACHED) rather than seven mechanics.

**Attributed BY REMOVAL — 24 cards where the Role line IS the blocker** (0 already native, 18 composite):
```
6  Wicked      Witch's Mark · Eriette's Whisper · Not Dead After All · Twisted Sewer-Witch ·
               Charming Scoundrel · Shatter the Oath
5  Young Hero  Embereth Veteran · Merry Bards · Cut In · Return Triumphant · Protective Parents
4  Sorcerer    Living Lectern · Unassuming Sage · Splashy Spellcaster · Spellbook Vendor
4  Monster     Monstrous Rage · Curse of the Werefox · Giant Inheritance · Become Brutes
3  Royal       Charmed Clothier · Redtooth Genealogist · Royal Treatment
2  Cursed      Cursed Courtier · Spiteful Hexmage
```
**The gap is the ATTACHED token creation.** Plain token creation is native (`Create a 1/1 white Soldier
creature token.` → native-spell); `Create a Young Hero Role token attached to …` is `arbiter-spell`.

**⭐ THE ROLE DEFINITIONS ARE IN BUNDLED DATA — read them, never write them from memory** (CLAUDE.md §1.2).
They are DFC token objects whose type line is `Token Enchantment — Aura Role`; 7 faces, real printed text.
Tested each face as an Aura card:
```
✅ Cursed     native-aura      Enchanted creature has base power and toughness 1/1.
✅ Monster    native-aura      Enchanted creature gets +1/+1 and has trample.
✅ Royal      native-aura      Enchanted creature gets +1/+1 and has ward {1}.
✅ Sorcerer   native-trigger   … gets +1/+1 and has "Whenever this creature attacks, scry 1."
✅ Virtuous   native-aura      … gets +1/+1 for each enchantment you control.
⛔ Wicked     body-only        blocker: "When this Aura is put into a graveyard from the battlefield, each opponent loses 1 life."
⛔ Young Hero body-only        blocker: the quoted "…if its toughness is 3 or less…" trigger
```

**PHASES (each independently shippable, each with its own flip-diff):**
1. **Create-a-Role-token-ATTACHED** — mint the token from the bundled definition (look it up; do NOT hardcode
   the text) and attach it. Unlocks **Sorcerer 4 + Monster 4 + Royal 3 + Cursed 2 = 13 cards** immediately.
2. **+ the self P/T threshold arm** → Young Hero, **+5**.
3. **+ an Aura put-into-graveyard trigger** → Wicked, **+6**. Total **24**.

### ⚠️ PHASE 2's CODE IS ALREADY WRITTEN, VERIFIED, AND DELIBERATELY REVERTED
I built the self P/T threshold arm this session, proved it correct, and reverted it because **its flip-diff was
GAINED 0** — no corpus card prints that condition directly; only the Young Hero TOKEN carries it. Consistent
with the subtype-list-pump precedent (a 0-flip change is not a slice and must not enter the next baseline).
**Re-apply it WITH phase 2, where it becomes load-bearing.** It goes in `interveningIf.js` beside the existing
self-power arm, and it must stay LAYER-AWARE (`creaturePower` / `creatureToughness`) — that is the point on this
cycle: a creature that has already collected +1/+1 counters correctly stops qualifying for "toughness 3 or less",
which is the self-limiting behaviour the printed card is designed around.
```js
const ptM = c.match(/^its (power|toughness) is (\d+) or (less|fewer|greater|more)$/);
// referent = context.sourcePermanentId (CR 608.2c "its" = the object the ability is on — correct for a
// GRANTED copy too, since the grant binds the ability to the recipient). Missing/vanished → null (FN-safe).
// value = power ? creaturePower(p, state) : creatureToughness(p, state);  less|fewer → <= , else >=
```
Verified while applied: all four phrasings became parseable, the trigger printed direct went native-trigger,
and the Aura GRANT of the Young Hero body went native-trigger.

**⚠️ AND A PREDICTION I GOT FLATLY WRONG, recorded so it isn't repeated:** I predicted that arm would flip 11
cards (Iron-Shield Elf, Embereth Veteran, Pitiless Vizier …). **It flipped 0.** Those cards never print the
condition — they CREATE a Role token, and my census regex matched the Role's text quoted in their reminder.
Attribution by removal on the CARD, not a regex over its full oracle text, is what caught it.

---

## ⛔ CORRECTION (earlier the same night) — **THE "QUOTED-GRANT PROJECT" BELOW IS WRONG. DELIVERY IS ALREADY BUILT.**

I committed the target below (`f7854846`) on a false premise and disproved it an hour later. Read this first.

**THE DISPROOF — one clean test, same modeled body, five carriers:**
```
"Whenever this creature attacks, draw a card."   printed on a creature  -> native-trigger    ✅
Creatures you control have "<body>"              GROUP static           -> native-static     ✅
Other creatures you control have "<body>"        GROUP static           -> native-static     ✅
Enchant creature / Enchanted creature has "…"    AURA carrier           -> native-trigger    ✅
Equipped creature has "…" / Equip {2}            EQUIPMENT carrier      -> native-trigger    ✅
Commander creatures you own have "…"             COMMANDER carrier      -> native-static     ✅
```
Identical result for an ACTIVATED body (`{T}: Draw a card.`) on all five. **Every carrier already delivers a
quoted ability.** `grantUntilEot.js` documents the vehicle outright — a layer-6 `addAbility` continuous effect
(`op.grant {kind, quoted}`) "the GROUP-GRANT statics already use", with collectors
(`grantedTriggeredQuotedFor` → `grantedTriggersForGroup`; `grantedActivatedQuotedFor` → legalChoices) and the
CREED validators (`isModeledGroupTriggeredBody` / `isModeledGroupActivatedBody`) all already wired.

**WHY I GOT IT WRONG — attribution by proxy, FOURTH instance this session.** The frontier's "unparsed tail" is
RESIDUE, not the blocker. I read `enchanted creature has "…"` at the top of the tail ranking and concluded the
grant was unbuilt. Then I compounded it: I tested whether each quoted BODY parses printed-direct and called the
passes "delivery-only", which measures a property of a fragment and infers a cause. **A tail is not a blocker;
a fragment's tier is not a card's blocker.** Same error as the "Enchant creature ×496" ghost cluster, the flash
vein (74→36), and the nontoken 22.

**WHAT IS ACTUALLY TRUE, attributed BY REMOVAL over the 81 non-native quoted-grant carriers:**
```
32  the GRANT LINE is the blocker      -> the quoted BODY is not in the modeled vocabulary
11  blocked by ANOTHER single line     -> 11 distinct shapes, a singleton tail
38  COMPOSITE (no single line)         -> the most expensive kind
```
So the real work is **widening the modeled-BODY vocabulary**, and those 32 bodies are heterogeneous — sac-for-
value activated abilities, damage with die-roll riders, toughness-conditional attack triggers, untap-for-a-cost.
Sampled: Compulsory Rest, Sorcerer's Wand, Rock, Sisay's Ingenuity, Trusty Boomerang, Umbral Mantle, Blinding
Powder, Lobe Lobber, Sinking Feeling, Embereth Veteran, Merry Bards, Level Up.
**⚠️ It is NOT one 37-card mechanism. It is ~32 per-card content builds behind a shared, already-working gate.**

**⚠️ I also ran a follow-up bucketing probe whose two buckets conflated distinct conditions** (a card could land
in "needs new content" either because its body failed OR because the minimal carrier succeeded). Its numbers are
NOT reportable and are deliberately omitted here. The three counts above come from removal attribution and stand.

**So: no months-long quoted-grant project.** The banked target below is retained only as the record of the
mistake. The honest position is the one two entries down — **the shelf is gated on expensive per-card work** —
and the next mover should re-derive from `shelf-blocker-shapes.mjs` / `shelf-gap-ledger.mjs`, not from a
frontier TAIL ranking. **⭐ Use the frontier to find candidates; use REMOVAL to decide what to build.**

---

## 🎯 ~~THE NEXT MAJOR PROJECT~~ (SUPERSEDED — see the correction above) — quoted-ability grants

Colton, 2026-07-30: *"just keep grinding we're gonna be going for months so just keep going."* So this entry
picks the target with data instead of one-card opportunism.

**⛔ FIRST: `clause-frontier.mjs --decks` WAS REPORTING FICTION. Two silent bugs, both now fixed** (commits
`fa5368b2` + `2940c5f5`). It read a RELATIVE `data/profiles` (threw from a worktree → catch → `[]` → printed
"non-native=0", i.e. "the shelf is perfect"), and it rebuilt each deck card as `{type, oracle, name}`,
**dropping mana/power/toughness** — so every `{X}` card (the cost IS the X value) and every creature was
mis-classified. It claimed 300 non-native deck cards; **32 of those are already native** (Gelatinous Genesis,
Mistcutter Hydra, Steelbane Hydra, Stonecoil Serpent, Biomass Mutation, Braingeyser, Pull from Tomorrow,
Nature's Rhythm). Its apparent "X-value cluster" was an artifact of the stripped object.
**⭐ X IS NOT A GAP** — X draw / X tokens X/X / X damage / X-or-less tutor / team base P/T X/X / enters-with-X
counters ALL classify native in isolation. Post-fix the deck frontier reads **268 non-native, 35
one-clause-from-native**, which cross-checks `shelf-gap-ledger.mjs`'s independent ~260. Two instruments agree.

**THE CORPUS FRONTIER'S TOP CLUSTERS (`--min 6`, single-sentence tails — the "one clause from native" trunk):**
```
16  enchant creature / enchanted creature has "…"     Ghostly Touch · Mark of Sakiko · Splinter Twin ·
                                                       Elemental Mastery · Dual Casting · Instill Furor
15  commander creatures you own have "…"              Dungeon Delver · Scion of Halaster · Acolyte of Bahamut ·
                                                       Passionate Archaeologist · Veteran Soldier · Tavern Brawler
 6  equipped creature has "…"  (+ equip {N})          the Equipment carriers
 7  banding                                            (a real mechanism, separate project)
 6  soulbond                                           (ditto)
```
**⭐ THE TOP THREE ARE ONE MECHANISM: GRANTING A QUOTED ABILITY. ~37 cards.** Aura carriers, Background/
commander carriers, Equipment carriers — three printed shapes over the same machinery.

**⛔ AND IT IS THE FAMILY THIS RUN HAS ALREADY REFUSED TWICE, for good reasons that now become the spec:**
- **Hexing Squelcher** — `Other creatures you control have "Ward—Pay 2 life."` refused because
  `permanentGrantedWardCosts` reads **generic mana only** (`staticAbilityParser.js:4363`).
- **Rhythm of the Wild** — `Nontoken creatures you control have riot.` refused because
  `coverage.js:2461` states the grant is unmodeled; riot needs per-member enters-with-choice synthesis.
- The clone family draws the same line explicitly: `cloneCopy.js` admits artifact/Equipment scopes because the
  runtime proved them, and **PARKS enchantment / nonland-permanent** (Copy Enchantment, Clever Impersonator).

**So the project is: make a GRANTED quoted ability a first-class thing the runtime honours** — per-member
trigger synthesis, granted activated abilities with real costs, and granted keywords whose cost is not generic
mana. Every existing refusal in this family graduates off that one capability, which is why it is worth months
rather than another 2-card widening.

**⚠️ NOT STARTED DELIBERATELY.** It touches layers + trigger synthesis + coverage tier in one motion — the
exact FP-sensitive shape `[[quoted-grant-statics-slice]]` says must not be built at the bottom of a long
session. **Start it COLD, on the 16-card Aura shape first** (the biggest single carrier, and Auras already have
`isNativeAura` / `parseAuraBonus` / `auraEnchantSubject` machinery to hang it on).

---

## ✅ SHIPPED 2026-07-29 — **ADAPT (CR 701.46a). GAINED 10, LOST 0.** The biggest slice in many turns.

> **CR 701.46a** — "'Adapt N' means 'If this permanent has no +1/+1 counters on it, put N +1/+1 counters on
> it.'" (verified against `cr_current.json`, reader positive-controlled).

**⚠️ FOUND ONLY BECAUSE A CENSUS ZERO WAS DISBELIEVED.** My first adapt census used
`/(?:^|\n)\s*adapt \d+/` and returned **0 blocked** — I nearly moved on to a 2-card slice. The printed line is
`{2}{G}: Adapt 2.`, so adapt is an activated-ability EFFECT and is **never line-initial**. Re-measured with
`/\badapt \d+\b/`: **12 blocked in 6 constructions.** RULE 1b again — *a zero from a census is a claim about
the probe until a positive control says otherwise.* That single re-measure is the whole slice.

**The isolation, before writing anything:**
```
{2}{G}: Put two +1/+1 counters on this creature.                       -> native-activated ✅  (shell + effect exist)
{2}{G}: If this creature has no +1/+1 counters on it, put two …        -> body-only       ⛔  (the CONDITION)
{2}{G}: Adapt 2.                                                        -> body-only       ⛔
```
So the shell and the counter effect were both already native and **only the condition was missing** — which is
exactly why adapt could not be modelled as a plain self add-counter: that would let an already-adapted creature
stack N more counters on every activation, doing what the printed card forbids.

**Built on the MONSTROSITY template** (`applyMonstrosity`, CR 701.32 — its older sibling, parsed two lines
away): a dedicated `adapt` op + `applyAdapt`, wired into the same op table.

**⛔ THE ONE REAL DIFFERENCE, AND IT IS PINNED: ADAPT IS NOT A LATCH.** Monstrosity sets a `monstrous` flag
that never clears. Adapt re-reads the LIVE +1/+1 count, so a creature whose counters were removed can legally
adapt again. A flag-based implementation would pass every other assertion in the file, so the test asserts the
CONTRAST directly — monstrosity refusing at zero counters while adapt succeeds on the same cleared board.
Also pinned: the gate is **+1/+1 specifically** (a shield counter does not block adapting), and a `+1/+1` key
sitting at **zero** still adapts (the value is read, never the key).

**Gates.** 10 new tests; **both mutations seen to fail** — the gate removed (caught by 3, including the
no-latch contrast) and the gate widened to "any counter" (caught by the shield test alone). Diff additive
only (+34, zero deletions). **Tier flip-diff over 34,210 cards: GAINED 10 / LOST 0, every row audited** —
Aeromunculus · Dreamdrinker Vampire · Evolution Witness · Knighted Myr · Sauroform Hybrid · Sharktocrab ·
Skatewing Spy · Skitter Eel · Temperamental Oozewagg · Trollbred Guardian. Suite **984 files / 12,515 green**,
lint 0.

**The 2 that correctly did NOT flip:** Pteramander and Etherium Pteramander carry a cost-reduction rider
("this ability costs {1} less to activate for each …"), which the census had already separated into its own
construction. Faithful refusal, not a miss.

**⭐ Temperamental Oozewagg is now native — it was one of the six "one blocker away" cards** the modified-anthem
entry listed. That list is working as a map.

---

## ✅ SHIPPED 2026-07-29 — NONTOKEN group anthem (CR 111.1). **GAINED 2, LOST 0.** Two pins GRADUATED.

Always Watching + Thraben Watcher: *"[Other] nontoken creatures you control get +1/+1 and have vigilance."*

**⭐ THE MISSING HALF OF A PAIR.** The TOKEN direction shipped with Teysa Karlov (`token: true` selector,
enforced in `layers.matchesSelector`); `nontoken` existed ONLY as an exclusion in
`NON_SUBTYPE_ANTHEM_WORDS` — rightly barred from the tribal-lord path (a "Nontoken"-SUBTYPE grant selects
zero creatures, a CREED FP) but never given a path of its own. Its mirror image was native; it parked.

**⛔ THE RUNTIME GATE IS PART OF THE SLICE, NOT A FOLLOW-UP.** Parsing alone would pump the tokens the card
explicitly excludes — the forbidden direction. So `matchesSelector` gained a `nontoken` gate: the exact
inverse of its token twin, reading the SAME `card.token` stamp so the two can never disagree. Verified
through the real layer pipeline: nontoken Bear → **3/3 + vigilance**, token Soldier → **1/1, no vigilance**.

**⚠️ POSITION WAS LOAD-BEARING, AND ONLY A PROBE FOUND IT.** Placed beside its token twin, only the BARE
spelling worked. The determiner arm (`^(all|other|each)\s+([a-z]+)\s+(?:creatures?\s+)?…`) matches
"**Other** nontoken creatures you control …" with `word="nontoken"`, hits the exclusion set, and **returns
null** — pre-empting everything below it. Thraben Watcher stayed body-only with a green targeted test on the
other spelling. The arm now sits ABOVE the determiner arms; its regex demands the literal word before
"creatures you control", so it cannot shadow anything either way. **Both spellings are asserted as a PAIR**
so a future re-order can't silently re-break one.

**⭐⭐ TWO EXISTING PINS GRADUATED — AND EACH ONE NAMED ITS OWN CRITERION.**
`staticAbilities.test.js` carried *"`nontoken` has no carrier-backed field **yet**, so it stays parked"* in two
places, listing how `tapped` / `colorless` had graduated before it. `card.token` (CR 111.1) is exactly that
field. **The second pin names Thraben Watcher by name** — it was a placeholder awaiting this work.
**⛔ Both were RE-POINTED, never deleted:** the graduated assertions now check the real selector shape
(including `excludeSelf` for the "other" form, CR 113.7), and the CREED guard moved to **`monocolored`** — a
genuine quality word still in the same exclusion list with no backing field — so "an un-added word must grant
to NOBODY" is still enforced by a live assertion.

**Gates.** 8 new tests + 2 graduated; **both mutations seen to fail** — the runtime gate removed (caught by
the token test alone) and `excludeSelf` dropped (caught by the CR 113.7 test). Diff additive only (+41, zero
deletions). **Tier flip-diff over 34,210 cards: exactly the predicted GAINED 2 / LOST 0.**

**⚠️ HONEST ACCOUNTING: +2 corpus, +0 shelf.** Neither card is on Colton's shelf — this was the pre-measured
"cheapest remaining" item from the strategy entry below, and it is corpus work. Stated plainly rather than
dressed up as shelf progress.

### 📎 Found in passing — a LATENT hole with ZERO carriers (noted, deliberately not chased)
`historic` / `world` / `basic` / `nonbasic` / `snow` are NOT in `NON_SUBTYPE_ANTHEM_WORDS`, so
"Historic creatures you control have flying" falls through to the single-word SUBTYPE arm and emits
`subtypes:["Historic"]` — a zero-selecting subtype grant that would still flip a card native, precisely the FP
class the guard exists to prevent. **Corpus carriers of that subject shape: 0 for all five.** So it is a
latent hole, not a live false positive. Recorded rather than fixed; if a future set prints one, it becomes
real and this entry is the map.

### ✅ SHIPPED — the `modified` qualifier (CR 700.9). **GAINED 1, LOST 0.** Predicted 5–6; audited the gap.
`modified` was a parked quality word with three genuine backing fields, so it met the same graduation test
`nontoken` had just passed. Built: a `modified` selector emitted by the parser (both spellings, above the
determiner arms) and `layers.isModifiedPermanent` implementing all three CR 700.9 clauses in ONE place.

**⛔ THE CONTROLLER SCOPE ON THE AURA CLAUSE IS THE FP TRAP, and it is now the load-bearing test.** An Aura
counts only when the permanent's OWN controller controls it — an opponent's Pacifism must NOT make your
creature modified. Equipment has no such clause (CR 301.5b). Verified live across all six cases; a
counters map holding only **zero** is correctly NOT modified (the value is read, not the key — a permanent
that once held a counter keeps the key forever).

**⭐ PREDICT-THEN-AUDIT PAID OFF. I predicted 5–6 flips and got 1.** The anthem LINE went `native-static` on
**all 7** carriers — the build works, printed reminder and all — but six are blocked by an INDEPENDENT second
line, so only **Envoy of the Ancestors** (outlast + the anthem, both native) flipped. Every miss named, and
this is the cheapest-remaining map for these cards:
```
Temperamental Oozewagg   Adapt 2 activated ability
Artillery Enthusiast     "you may discard a card … seek a card" ETB
Invigorating Hot Spring  remove-a-counter activated ability
Kodama of the West Tree  "Whenever a modified creature you control deals combat damage → search for a basic land"
Red XIII, Proud Warrior  Cosmo Memory ETB (return an Aura/Equipment from your graveyard)
Towashi                  a QUOTED-trigger grant + "whenever chaos ensues" (a Plane card)
```
**That is the real value beyond the one card: six carriers are now exactly ONE blocker each from native.**

**Gates.** 9 new tests; **both mutations seen to fail** — the Aura controller comparison dropped (caught by
the FP-trap test alone) and counter key-presence instead of value (caught by the zero-counter test). Diff
additive only. **Tier flip-diff over 34,210 cards: GAINED 1 / LOST 0**, matching the audited expectation.
Suite **983 files / 12,505 green**, lint 0. **+1 corpus, +0 shelf** — stated plainly.

**Still open, same family:** `enchanted` (**3** carriers: Syr Armont, A Tale for the Ages, Greater Auramancy)
is the remaining parked quality word with a plausible backing read (an Aura attached, CR 303.4 — a strict
subset of what `isModifiedPermanent` already walks).

**⛔ CITATION CORRECTED — I FABRICATED A RULE NUMBER.** The commit that shipped the nontoken anthem, and this
entry as first written, cited *"CR 701.48"* for `modified`. **CR 701.48 is "Learn".** The real rule is:

> **CR 700.9** — "Some cards refer to modified permanents. A permanent is modified if it has one or more
> counters on it (see rule 122), if it is equipped (see rule 301.5), or if it is enchanted by an Aura that is
> **controlled by that permanent's controller** (see rule 303.4)."

Verified against `knowledge/mtg-judge/data/cr/cr_current.json`. Two lessons, both cheap and both mine:
- **Never write a rule number from memory** (CLAUDE.md §1.2 / §8.5). It cost nothing to check and the check
  is one script; the number was wrong on the first try.
- **⚠️ AND THE FIRST CHECK "CONFIRMED" IT BY RETURNING NOTHING.** The CR file is a FLAT map keyed by rule
  number (`{"100.1": {...}}`); my first reader looked for a nested collection, found none, and printed an
  empty result — which reads exactly like "no such rule" instead of "broken reader". Only the RULE 1b positive
  controls (111.1 / 400.1 / 603.4 — rules I had already cited and verified) exposed it. **A CR lookup must
  assert a known-good rule before any negative is believed.**

The Aura clause matters for the build: an Aura enchanting the permanent counts only when **that permanent's
controller** controls the Aura, so an opponent's Aura does NOT make it modified. Verify carriers and the
runtime read before crediting, exactly as with `nontoken`.

---

## 🗺 SHELF STRATEGY 2026-07-29 — **THE SHELF HAS NO CHEAP BUILD LEFT.** Every remaining shape, priced.

Two turns of measurement produced one conclusion worth more than either turn's cards: **the ≥90% bar is now
gated on expensive builds, not on finding the right cheap one.** Every shape below was probed, not guessed.

**⛔ FIRST, A TOOL CORRECTION I HAD BEEN READING WRONG.** `shelf-gap-ledger.mjs` groups each blocker by how
many **CORPUS** cards share it. That answers "is this a slice?" — NOT "does it move Colton's shelf." I aimed a
whole slice at cdh off a `shared×2` row and shipped Pyrohemia, which lives in **Hulk Smash**. So there is now
a second view: `scratchpad/shelf-blocker-shapes.mjs` groups blockers **across the shelf** and reports
shelf-card count + how many DECKS each shape touches. Use that one for shelf targeting.

**Standings (10 decks under the bar):** cdh 83%/7 · Dragons 80%/10 · Jurassic Ramp 77%/13 · Believe it! 75%/15
· Kinnan 74%/16 · Wolverine 73%/17 · Hulk Smash 73%/17 · Kellan 72%/18 · Captain America 70%/20 · Halfshell 65%/25.

**The highest-leverage shelf shapes, and what each actually costs:**
| shape | shelf slots | verdict |
|---|---|---|
| **Level Up** (Aura) | 3 (3 decks) | `Enchanted creature has "<quoted attack trigger that doubles counters>"` — Aura quoted-grant of a compound trigger. Expensive. |
| Valley Floodcaller | 2 | **`splitClauses` shreds the subject** — see the entry below. Splitter change, corpus-wide blast radius. |
| Rhythm of the Wild | 2 | **TWO gaps**, one a hard refusal — see below. |
| Chain of Vapor · Veil of Summer · Strength of Will | 2 each | `arbiter-spell`, multi-part effects (bounce + optional land-sac chain; conditional draw + uncounterable + hexproof grant; indestructible + a quoted damage trigger). Each a real build. |
| The Cabbage Merchant | 2 | TWO gaps: the `to you` damage direction AND an unconditional typed self-sacrifice. |
| Hexing Squelcher | 2 | **REFUSED** — ward grant carries generic mana only (below). |
| Thassa's Oracle | 2 | ⚠️ my devotion hypothesis was WRONG: the **control failed too** — `look at the top three cards of your library` is itself `body-only`. The gap is the whole look/put effect, not devotion. |

### ⛔ RHYTHM OF THE WILD — two gaps, and the riot half is an EXPLICIT documented refusal
`Nontoken creatures you control have riot.` Probed both halves separately:
- `Nontoken creatures you control have flying.` → **body-only**, while `Creatures you control have flying.` is
  native-static. So **`nontoken` is a missing group-subject QUALIFIER** (see below).
- `Creatures you control have riot.` → **body-only** too. Riot itself is fully modelled and ENFORCED
  (`riotKeywordCount`, `riotPicksHaste` — a deterministic documented house auto-pick, CR 702.136a, applied at
  `resolvers.js:366`), but **`coverage.js:2461` names Rhythm of the Wild explicitly** and says the
  `…have riot` GRANT line "is NEVER stripped → those stay body-only (their grant is unmodeled)."
  **CAPABILITY pin**: granting riot needs per-member enters-with-choice synthesis, not a vocabulary widening.

### 📏 The `nontoken` qualifier — measured, priced, and OFF-TARGET (+22 corpus, **+0 shelf**)
The qualifier set is otherwise rich: `other` / `attacking` / `tapped` / `legendary` / `red` / subtype all parse.
`nontoken` and `token` do not — and the parser *deliberately* excludes them as non-subtype words
(`staticAbilityParser.js:229, 554, 1357, 3268, 3357, 3447`), so there is a clear place to add support.

**Gain predicted WITHOUT writing code** — strip the word and re-classify, which simulates a qualifier-only
fix per card: **22 cards would flip**, 307 stay blocked by their effect. ⚠️ That is an UPPER BOUND and the
strip is semantically WRONG (it lets tokens in); shipping it requires the runtime to actually exclude tokens
or the credit is an FP. Grouped by PARSE SITE, the 22 are **not one fix**:
```
11  TRIGGER subject   — but mostly the GLOBAL form ("Whenever a nontoken creature dies", no "you control")
                        plus count-sources ("X is the number of nontoken creatures you control").
                        ⭐ "nontoken creature YOU CONTROL" as a trigger subject ALREADY WORKS.
 5  ACTIVATED ability — "Sacrifice a nontoken artifact:" costs (Thopter Foundry, Infernal Tribute, …)
 3  other/spell       — Incandescent Aria, Lorehold Charm, Rise of the Dread Marn
 2  GROUP-STATIC      — Always Watching, Thraben Watcher   <-- the cleanest single site, and Rhythm's half
 1  MASS-REMOVAL      — Hour of Reckoning
```
**NONE of the 22 is on Colton's shelf.** Under the standing target (shelf, not corpus %) this is explicitly
off-target — banked so the next session can price it in one glance rather than re-measuring.

**⭐ THE NEXT CHEAP-ISH BUILD, fully pre-measured:** the GROUP-STATIC `nontoken`/`token` qualifier (2 corpus
cards, and it is one of Rhythm of the Wild's two gaps). Runtime already carries the token flag
(`perm.token` / `card.token`, the same one `permMatchesFilter`'s `kind:"token"` and `SACRIFICE_POOLS`'
`nontokenCreature` read), so the runtime half exists. **Deliberately NOT started at the bottom of a long
session** — the quoted-grant order's own rule: an FP-sensitive touch across parser + layers + coverage tier
does not get built while tired. Start there cold.

---

## ✅ SHIPPED 2026-07-29 — GLOBAL board-empty intervening-if (CR 603.4 + 400.1). **GAINED 2, LOST 0.**

Pyrohemia + Pestilence: *"At the beginning of the end step, if no creatures are on the battlefield, sacrifice
this enchantment."* One of the four remaining SHARED blockers on the shelf.

**⭐ AN AXIS FIX, PROBED BEFORE A LINE WAS WRITTEN.** Every other component already worked:
```
end-step trigger + plain effect                          -> native-trigger ✅
end-step + self-sacrifice, NO condition                  -> native-trigger ✅
end-step + "if YOU CONTROL no creatures" + self-sac       -> native-trigger ✅   <-- the sibling
end-step + "if no creatures are ON THE BATTLEFIELD"       -> body-only      ⛔   <-- the whole gap
```
The controller-scoped predicate existed; the GLOBAL one did not. One arm in `interveningIf.js`, reusing the
existing `parseFilter` / `permMatchesFilter` vocabulary. **No `triggers.js` change was needed** — the
intervening-if peel → `interveningIfParseable` → route chain is generic, which is exactly why the sibling
already worked. And `interveningIfParseable` derives from `evaluateInterveningIf` against a probe board, so a
new arm is admitted automatically: **no second allowlist to drift.**

**⛔ THE SCOPE WAS THE ENTIRE RISK.** The battlefield is a SHARED zone (CR 400.1) — "no creatures are on the
battlefield" asks about EVERY seat. A `controllerBoard` read would sacrifice Pyrohemia while an opponent's
creature is still out: doing something the card forbids, the forbidden direction. So the cross-seat scan is
the load-bearing assertion, not a nicety.

**Gates.** 11 new tests; **both mutations seen to fail** — controller-only scope (caught by the 2 cross-seat
tests, including the named FP-trap one) and ignore-the-board-entirely (caught by 4). Restore confirmed with
`git diff`, not the marker sweep (+31 insertions only, per the deletion-mutation lesson). **Tier flip-diff
over 34,210 cards: exactly the predicted GAINED 2 / LOST 0**, nothing to audit.

**⚠️ HONEST SHELF ACCOUNTING: Pyrohemia is in HULK SMASH (72%), not cdh.** cdh's shared blocker is Pact of
Negation. So this is **+2 corpus, +1 shelf card on Hulk Smash (still needs 17), no deck crossed 90.** The
"shared×2" rows in the gap ledger are corpus-wide counts and are NOT all on the same deck — read the deck
header before assuming a shared fix moves the deck you were aiming at.

### The other three shared blockers, triaged and priced (do not re-derive)
| blocker | verdict |
|---|---|
| **Pact of Negation** (cdh) | The whole *"pay {cost}. If you don't, <consequence>"* delayed-payment shape is missing — even `pay {3}. If you don't, sacrifice this creature` is `arbiter-spell`. A real build, not a widening. |
| **Ninjutsu cost reduction** (Silver-Fur Master) | **Its generic control fails too**: `Activated abilities you activate cost {1} less to activate` is `body-only`. Two gaps (the generic activated-class reduction, then the ninjutsu class). Ninjutsu itself IS native-body. |
| **Miracle** (Temporal Mastery) | Whole keyword absent (`arbiter-spell`). Alternative-cost + first-draw-this-turn tracking + a reveal window. Biggest of the four. |

### ⛔ HEXING SQUELCHER — CORRECTLY REFUSED, do not "fix" it
`Other creatures you control have "Ward—Pay 2 life."` needs two things, and the second is a hard runtime wall.
Quotes break the group-grant parser (`have "Flying."` is body-only where `have flying.` is native-static) —
but more importantly **`permanentGrantedWardCosts` reads `generic` mana ONLY**, stated outright at
`staticAbilityParser.js:4363`: "A colored / {X} / life / discard ward grant falls" through. Ward IS genuinely
enforced (`ward.js` + `actionDispatcher.js:622`, CR 702.21, mana-or-life structured cost), and GRANTED ward is
enforced too — but only as generic mana. Parsing this card would credit it native while the runtime taxes
**zero**. **CAPABILITY pin**: it graduates when `addWard` / `permanentGrantedWardCosts` learn a life cost.

---

## 🔬 DIAGNOSED + REVERTED 2026-07-29 — the subtype-list pump axis: **the blocker is `splitClauses`, not the matcher**

**⛔ NOTHING SHIPPED. A matcher-level fix flipped ZERO of 34,210 cards, and the flip-diff is the only reason
I know that.** Written up in full because the diagnosis is the value, and because the next session would
otherwise repeat the same two hours.

**The axis is real** (verified both arms, same subject):
```
static  : "Birds, Frogs, Otters, and Rats you control get +1/+1."                     -> native-static  ✅
trigger : "Whenever you cast a noncreature spell, <same subject> … until end of turn." -> body-only      ⛔
control : "…, creatures you control get +1/+1 until end of turn."                      -> native-trigger ✅
```
So the anchor is fine and the SUBJECT vocabulary is the gap. Blocks **Valley Floodcaller** (cdh).

**⭐ AND BOTH HALVES OF THE OBVIOUS FIX ALREADY EXISTED**, which is what made it look cheap:
`controllerCreatureTargets` already accepts an **ARRAY** `subtypeFilter` (the mass-counter atom passes one —
`counters.js:667-672`, "ANY listed subtype matches, word-bounded"), and the pump arm at
`atoms/combat.js:1448` passes a single word. Same gatherer, two callers, one of them narrower.

**⛔ THE ACTUAL BLOCKER IS UPSTREAM OF ALL OF THAT.** `splitClauses` splits on `and` / `, and`, so the
subject never arrives intact — measured:
```
"Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn."
   -> "Birds, Frogs, Otters,"  +  "Rats you control get +1/+1 until end of turn"        (2 clauses)
"Bats and Rats you control get +1/+1 and gain flying until end of turn."
   -> "Bats" + "Rats you control get +1/+1" + "gain flying until end of turn"           (3 clauses)
"Bats or Rats you control get +1/+1 until end of turn."                                  (1 clause — "or" is NOT split)
```
**That is why a two-member `or` list passed my probe and the real card did not.** The list regex matches all
four subjects perfectly in isolation — I verified that before suspecting the splitter, which is the only
reason I didn't spend the night widening a regex that was already correct.

**What I tried, and the measured verdict:** added `frog/otter/bat/raccoon` to `COUNT_SUBTYPE` + a
subtype-LIST arm below the single-word arm (ordering-rule safe: the list regex requires an `and`/`or`, so it
is unreachable for anything the single-word arm matches). Synthetic cases went native. **Full tier
flip-diff over 34,210 cards: ZERO flips, GAINED 0, LOST 0.** Every real card printing the list subject is
shredded by the splitter first, so the matcher widening is unreachable in practice. **Reverted both files** —
a 0-flip change is not a slice, and leaving it would fold unverified widening into the next diff's baseline.

**⭐ THE LESSON, worth more than the cards: A FIX DOWNSTREAM OF A SPLITTER BUG FLIPS NOTHING.** Synthetic
probes went green on every arm I added; only the corpus-wide flip-diff showed it bought nothing. When a
capability exists on one arm and not its neighbour, **check what the text looks like when it ARRIVES at the
neighbour** before widening the neighbour — the two arms may not be reading the same string at all. (Statics
never go through `splitClauses`; that asymmetry IS the axis here.)

**The real slice, when someone takes it (do BOTH halves together, or it flips nothing):**
1. `splitClauses` must not split an `and` inside a subject list — narrowly, e.g. suppress the split when the
   right-hand side continues `… you control get ±N/±N`. **Splitter changes are corpus-wide; gate it behind a
   lookahead so it is reachable only where the current split produces an unparseable fragment.**
2. Then the `COUNT_SUBTYPE` additions + the list arm (both re-derivable from this entry).
3. **Curation evidence, already measured** against `COUNT_SUBTYPE`'s own criterion (all occurrences in the
   subtype position, ZERO left of the em dash): **Frog 93 · Bat 59 · Otter 32 · Raccoon 32**, control
   **Elf 721 / 0-left**. ⚠️ The first run of that probe reported **0 for all four** — a shell-mangled
   backslash, caught only because Valley Floodcaller is *itself* an Otter. RULE 1b paid again.
4. **Ceiling: 6 cards in 6 constructions** (attributed by removal) — Valley Floodcaller · Regal Sliver ·
   Brambleguard Veteran · Gale, Storm Conduit · Captain Vargus Wrath · Moonstone Harbinger. Each of the
   other five ALSO has its own unsupported anchor (expend N, "perpetually gains", "for each time",
   gain-or-lose-life), so **realistically this slice is +1 to +2, not +6.** Size it before starting it.

**⚠️ THIRD SHELL-MANGLED-BACKSLASH INCIDENT THIS SESSION.** `\\b` through a `node -e` double-quoted shell
string became a literal backslash-b and silently matched nothing. **Write probes to a FILE.** The two that
went through `Write` were correct first time; all three that went through `node -e` were not.

---

## 📏 MEASURED 2026-07-29 — the "as though it had flash" vein, and why 74 was really 36 (then 5)

Chased because **Borne Upon a Wind** blocks cdh and its neighbour clause classifies fine: Valley Floodcaller's
`You may cast noncreature spells as though they had flash` is **native-static**, so the capability plainly
exists on one arm. Containment count: **92 cards carry an as-though-had-flash clause, 74 non-native.** That
looked like the biggest vein in weeks.

**⛔ IT WASN'T, AND THE ERROR WAS ATTRIBUTION BY PROXY AGAIN — third instance this run.** Counting cards that
*contain* a clause is not counting cards *blocked* by it. Re-attributed by REMOVAL (delete the flash-bearing
line, does the whole card flip?):

| bucket | n | meaning |
|---|---|---|
| genuinely flash-blocked | **36** in **28** constructions | a flash fix could flip these |
| flash clause is NOT the blocker | **10** | Valley Floodcaller, Najal, Sally Sparrow, Gandalf, Liberator, Heliod… |
| COMPOSITE (flash **and** something else) | **28** | Asinine Antics, Vivien, A-Teferi, Savage Summoning, **Borne Upon a Wind** |

**28 constructions for 36 cards** — a singleton tail, not a slice. The only real clusters:
```
5  "You may cast this spell as though it had flash"            Spider Climb · Lightning Reflexes · Mystic Veil · Parapet · Soar
4  ...same + "if you pay {N} more to cast it"                   Saproling Symbiosis · Ghitu Fire · Rout · Mystical Tether
2  "If you cast a spell this way, you may cast it as though…"    Primal Prayers · Elsha of the Infinite
```

**⛔ AND THE SLICE IS 5, NOT 9. THE CREED CUTS THE SURCHARGE FOUR.** "…if you pay {N} more to cast it" is a
*conditional* timing permission; the engine never pays optional additional costs, so crediting those four
would let it cast at instant speed WITHOUT the surcharge — offering the player something the card does not
allow. That is the forbidden direction. They stay parked, faithfully.

**The 5-card build, when someone wants it (cheap, tight, does NOT move the shelf):** the machinery is all
present — `flashCastPermissionsOf` / `spellMatchesFlashFilter` / `flashPermissionSpecsFor`
(`legalChoices.js:389`, sorcery-speed decided at `:294`) — but it gathers specs from PERMANENTS the player
controls. `"You may cast **this spell** as though it had flash"` is a property of the card being cast, so it
needs a per-card check at the timing gate, not a permanent scan. Effectively: treat it as the card having
flash (CR 601.3e / 702.8).

**⚠️ Borne Upon a Wind is COMPOSITE — the flash slice would not flip it, so cdh gains nothing here.**

### cdh sizing (the shelf target, 83%, needs 7) — 17 blockers, and only ONE is shared
`Pact of Negation` shared×2 · 11 one-card · 6 composite (Deflecting Swat, Wan Shi Tong, Hidden Strings,
Invasion of Ikoria, Vibrance, Mindbreak Trap). Per-line diagnosis is banked; the tractable one-card starts,
cheapest first, are **The Cabbage Merchant** (a `combat damage to you` anchor variant — the unified
combat-damage anchor already exists) and **Hexing Squelcher** (`Other creatures you control have "Ward—Pay 2
life."` — a group quoted grant of a keyword the engine already models on the card itself; the anthem filter
grammar it needs is already built). Corpus reach of each, measured: **1 card apiece.** No slice hides here —
cdh's remaining 7 are seven individual builds, which is the honest cost Colton already accepted.

**⚠️ The stale order:** `[[quoted-grant-statics-slice]]` still headlines "35 cards, mana-ability first". Its
own 07-29 warning is correct — that half is BUILT. What remains is Joiner Adept's `Lands you control have
"{T}: Add…"`, `Artifacts you control`, bare `Tokens you control`, and the 44-card quoted-TRIGGER slice.
Hexing Squelcher's keyword-grant shape is in neither. Re-census before building to that file.

---

## 🌊 SCOPED WAVE (start here cold) — EXTRA COMBAT PHASES, CR 500.8. **51 cards, ALL non-native.**

Named by the mass-untap slice: every big card on that clause list was blocked by this rider, not by the
untap. **51 corpus cards carry "additional combat phase" and not one is native.** The first ten by rank:
```
699 Aggravated Assault · 820 Aurelia, the Warleader · 995 Moraug, Fury of Akoum · 1000 Combat Celebrant
1039 Karlach, Fury of Avernus · 1118 Great Train Heist · 1229 Genji Glove · 1277 Scourge of the Throne
1491 Full Throttle · 1543 Relentless Assault
```
**That is the densest top-1600 cluster left in the corpus.** No deliberate refusal exists — the only pin
that mentions it is my own note in `massUntapOwnCreatures.test.js`.

**⭐ THE PRECEDENT IS ALREADY IN THE ENGINE, and it is an exact structural twin.**
```
CR 500.7 extra TURNS  → state.extraTurns, a LIFO queue popped in advanceStep   ← BUILT (BLITZ XT-1)
CR 500.8 extra PHASES → "added directly after the specified phase … the most
                         recently created phase will occur first"              ← the SAME LIFO shape
```
`gameEngine.advanceStep` is the single step-transition chokepoint and **already does both moves this needs**:
it consults per-state data to take an extra turn instead of rotating, and it JUMPS the sequence pointer
(the CR 508.8 empty-combat skip to `end-of-combat`). An extra combat is the same jump backwards.

**THE ONE STRUCTURAL OBSTACLE, named so nobody rediscovers it:** `TURN_SEQUENCE` is a **module-level
constant** (`PHASES.flatMap(...)`, gameEngine.js:125) and `findSequenceIndex` searches it by (phase, step).
A spliced phase cannot live in that array — it must be a **per-STATE queue** consulted at the transition,
exactly like `extraTurns`.

**Increment plan:**
1. ✅ **SHIPPED (`68d7287b`)** — the mechanism works. `state.extraPhases` is a lazy LIFO queue popped at the
   `advanceStep` chokepoint; leaving `end-of-combat` with a run queued jumps BACK to `beginning-of-combat`.
   **Tier diff GAINED 0 — correct for a turn-structure increment, and evidence it is behaviour-preserving
   on every game that never queues a phase.** No card credited yet, deliberately.
   ⭐ **The non-termination assertion is the headline:** the test walks a full extra combat and proves the
   SECOND arrival at `end-of-combat` proceeds to the postcombat main. **M113** (never pop) is killed by 3.
   ⛔ `combat: null` on the jump — a stale combat object would let the previous attackers count as attacking
   again, dealing damage twice off one declaration (**M114**). A CONTROL pins that the no-queue path does
   NOT clear combat, keeping the reset scoped to the splice branch.
2. ⛔ **CR 505.1a — the additional MAIN phase that follows is a POSTCOMBAT main**, not a precombat one.
   Most of these cards read "an additional combat phase FOLLOWED BY an additional main phase", so the queue
   entry is a two-phase run, and getting the main's identity wrong would mis-fire every precombat-main
   trigger on the board.
2b. ✅ **SHIPPED (`df14047f`)** — the ATOM + both after-this-phase word orders (**27 of the 51**).
   **GAINED 1 — Aurelia, the Warleader (#820)**, which composes with the mass untap from `c5697dc8`:
   *"untap all creatures you control. After this phase, there is an additional combat phase."* is native
   end to end. The **join** (atom → queue → real second combat) has its own assertion, because the stun
   slice showed that testing two halves separately hides a dead seam.
   ⛔ The `"followed by an additional main phase"` tail is accepted and modelled by **doing nothing** —
   CR 505.1a makes every main after the first a postcombat main, which the forward transition already
   reaches. Stated in code so nobody "fixes" it.

3. ⛔ **THE REMAINING WORK IS THE SECOND INSERTION POINT** — "after this MAIN phase" (Aggravated Assault
   #699, Relentless Assault #1543, Seize the Day, Full Throttle #1491). Those splice after a MAIN phase,
   not after `end-of-combat`; firing the current queue for them would grant a combat at a moment the card
   never promised. **M116 admits that form and is killed**, so the refusal is enforced, not just intended.
   Give each queue entry its OWN insertion point (`{ kind: "combat", after: "main" }`) and check it at the
   matching transition. Full Throttle additionally needs a COUNT ("two additional combat phases").

   ⛔⛔ **DO NOT BUILD THIS AS A SECOND SPLICE POINT. I traced it and it is a bigger piece of machinery than
   it looks — recorded here so the next session does not rediscover it by shipping a subtly wrong combat.**
   CR 500.8 adds phases *directly after the specified phase*, so Aggravated Assault activated in the
   precombat main owes:
   ```
   precombat main → EXTRA combat → EXTRA main → NORMAL combat → postcombat main
   ```
   The engine's actual forward sequence from a precombat main is:
   ```
   precombat-main/main → combat/beginning-of-combat → combat/declare-attackers
                       → combat/end-of-combat → postcombat-main/main → ending/end → ending/cleanup
   ```
   **A jump at "leaving main" therefore produces the NORMAL combat and consumes the grant** — one combat
   where the card promised two. The correct model needs a multi-phase spliced RUN with a cursor (combat,
   then main, then resume the normal sequence), not a second jump. Half-right here risks a soft-lock, which
   is the one failure mode this engine cannot ship. Budget it as its own wave.

⛔ **THE TRAP TO TEST FOR FIRST:** an extra combat that never terminates. `extraTurns` is popped exactly
once per grant; the phase queue must be too, or a Relentless Assault loops the turn forever. **Assert the
queue drains** — a combat count of exactly 2, and a third combat only from a second grant.

⚠️ And expect the flip count to trail the 51: several pair the extra combat with their own riders (Moraug's
landfall, Scourge's dethrone). Size with the tier diff, as always.

## ⚠️⚠️ A CORRECTION, AND THEN A CORRECTION TO THE CORRECTION — **read this one carefully**

I published a claim here and to COMMS that **"the playability sweep never attacks."** ⛔ **THAT WAS FALSE.**
Measured directly by counting option kinds through the driver, 12 games:
```
OFFERED  declare-attacker 421 · declare-blocker  51 · cast-spell 359 · play-land 285 · tap-for-mana 6536
PICKED   declare-attacker 117 · declare-blocker  23 · cast-spell 109 · play-land 104
```
**It attacks constantly.** My two observations were each correct and the inference from them was not: the
script never mentions `declare-attackers` by name (its generic third-choice clause picks any non-pass,
non-activate option, so attacks are selected without ever being named), and the decision-kind census shows
only `ask` (attacks are OPTIONS *inside* an ask decision, not a decision kind). **Absence of the word in the
driver is not absence of the behaviour** — and I corrected a true statement into a false one on that basis.

### ⭐ THE REAL REASON THE LOOP DETECTOR WAS VACUOUS — and it is a better finding
Re-run properly, with Aurelia forced 20× into every deck **and a payable mana base** (my first witness deck
was 60 Forests against a `{2}{R}{R}{W}{W}` card — she was uncastable, so that run proved nothing):
```
latch INTACT     12/12 complete        latch RE-BROKEN  12/12 complete
```
Still clean. So I drove the turn structure directly instead, latch removed:
```
extra combats granted in ONE turn: 40 · ended at combat/declare-attackers · 200-step guard EXHAUSTED
```
⭐ **The turn genuinely never ends — my ORIGINAL Aurelia claim was right.** The sweep cannot see it because
**a non-terminating turn that kills the opponent looks exactly like a completed game.** 40 combats of a
flying 3/4 with an untap-all rider is lethal long before any step cap is reached. The game "finishes"; the
turn never does.

⛔ **SO D6 AS I FIRST WROTE IT WAS WRONG.** The detector is not "teach the sweep to attack" — it already
does. It is: **assert a BOUND on phases-within-a-turn**, because game completion and turn termination are
different properties and only the second one catches this class. Requeued that way.

⚠️ **FOUR precondition failures in one day** (the dead-permanent audit's 4 ghosts, the trigger-parity
probe's 6 ghosts, the all-Forest Aurelia deck, and this). Every one the same shape: **a harness that cannot
satisfy a card's preconditions reports "cannot happen" indistinguishably from "did not happen here."**
Before believing any negative result, prove the harness can produce the positive one.

## 🪦 SHIPPED — **THE LAND TIER HIDES DEAD CARDS** (`eb57c773`) · Fabled Passage #50, in 3 shelf decks

⛔ **`tier: "land"` is assigned to EVERY land regardless of what it does**, so a land whose only ability
never fires counts as fully modelled while being a blank card in play. **Coverage is structurally blind to
this.** Fabled Passage offered NO action at all — its fetch is the Evolving Wilds shape and parses fine, but
the bonus rider *"Then if you control four or more lands, untap that land."* killed the whole ability.

Fixed by DROPPING the rider — a **deliberate under-delivery** (the fetched land now always stays tapped),
which is the safe half of the asymmetry `probe-ignored-restrictions` is built on: *a tail that ADDS
under-delivers (FN, safe); a tail that RESTRICTS over-delivers (FP, forbidden)*. Corpus-verified one-card
shape, anchored to the printed sentence — **M143 turns it into a general trailing-sentence dropper and
dies**, which is the guard that matters.

### ⛔ AND THE AUDIT DOES **NOT** GENERALIZE OFF LANDS — measured, so nobody rebuilds it
I ran the same audit over **non-land `native-activated` permanents, top-2000**: 4 candidates, and **all 4
are HARNESS ARTIFACTS, not bugs.** Each was refused because my "generous board" failed the card's own
precondition, and each works the moment it is satisfied:
```
Phyrexian Reclamation #940  needs a CREATURE card in the graveyard   → offered (1)
Weathered Wayfarer   #1412  needs an opponent with MORE lands        → offered (1)
Glen Elendra Archmage #1641 needs a noncreature spell ON THE STACK   → offered (1)
Reassembling Skeleton #766  activates FROM THE GRAVEYARD, not play   → offered (activate-gy-recursion)
```
⭐ **WHY LANDS WERE THE EXCEPTION: they are precondition-FREE.** A land sits there and its ability is
available; a non-land ability wants a zone, a stack object, a graveyard card, an opponent's board. A generic
board cannot satisfy those, so the audit reports ghosts. **Do not promote this to a standing probe** — it
would hand every future session four false alarms. The land-tier version stays valuable exactly because that
tier is both blind (`tier:"land"` for everything) and precondition-free.

### 🔍 THE DEAD-LAND AUDIT (run once, worth re-running after any land-side change)
Top-3000 lands with **no mana production AND an activated ability that yields zero actions** → **5**:
Fabled Passage (fixed) · Maze of Ith · Dark Depths · Eye of Ugin (real mechanics, not one-liners) ·
Ancient Ziggurat (spend-restricted mana — a banked refusal). **Only Fabled Passage was on the shelf.**

⭐ **THE CHAIN IS THE METHOD.** Phantom mana → *"fine, but do these lands do their REAL job?"* → a dead card
in three decks. **After removing something an object was doing wrongly, ask what it should have been doing
instead.** Neither find is visible to the corpus number.

## 🚨🚨 SHIPPED — **PHANTOM MANA: every fetchland was tapping for {C}** (`ac5c6595`) · 54 lands

The single worst correctness bug found this run. manaModel's land fallback assumed *"a land we couldn't
otherwise parse still taps for something"*. **False for 54 corpus lands** — every fetchland (Polluted Delta
#36, Evolving Wilds #18, Terramorphic Expanse #27, Fabled Passage #50), Maze of Ith, Glacial Chasm, Diamond
Valley, Dark Depths — each credited a **repeatable, TAPLESS {C}**. Measured: a board holding nothing but
Maze of Ith could pay {1}. In a fetch-heavy deck that is fabricated mana every turn, straight into
**self-play training data**.

**The rule now:** a land makes mana only with a BASIC LAND TYPE (CR 305.6) or the word "add" in its oracle.
Everything else → nothing (under-count, safe direction). Urborg/Yavimaya are an accepted, pinned
under-count — they were already wrong ({C} for a colour they cannot make).

### ⭐⭐ THE METHOD LESSON — **THE CONTROL WAS THE FINDING**
I was measuring something else entirely (whether a quoted mana GRANT reached lands). The *with-granter*
number looked right. **The control — the same board WITHOUT the granter — came back 1 instead of 0.** The
grant was irrelevant; the blank land was a source on its own. **Second time this run** a without-the-thing
control turned a green measurement into a bug (the first was the team-pump runtime block, where three ⛔
assertions all passed on an empty result). **Write the control even when you are sure what the answer is —
especially then.**

### ⚠️ AND A STALE ORDER, CAUGHT BY VERIFYING FIRST
I opened this session to build [[quoted-grant-statics-slice]] (35 cards, "the biggest single lever left").
**The order is STALE** — dated 2026-07-18, and the mana-grant runtime it calls the hard part has since been
built. Measured live: `Elves you control have "{T}: Add {G}"` delivers (with 1 / without 0) and the
classifier already credits it. What is actually left there is small and mostly *correctly* parked. **Verify
an order's premise before building to it**; this one would have been a day spent re-implementing something
that works.

⚠️ Also re-learned: **never name a synthetic probe card `"T"`** — it collides with the tap symbol under
name normalization and silently corrupts quoted-grant classification. Cost several wrong readings before
`"A"`, `"Ab"` and `"Zzz"` behaved differently from `"T"` and gave it away.

## ⛔ NOT A VEIN — the phantom-reminder sweep, and my own lesson unlearned

Swept the corpus for the squad shape: cards that gain a TRIGGER only when reminder parens are present. 11,390
cards with parentheticals → 14 keyword groups, headed by graft (13, all unroutable), storm 36, cascade 30.

⛔ **AND THE DISCRIMINATOR IS WRONG.** "Trigger sourced from reminder text" is **correct** for a keyword whose
reminder RESTATES a real ability. Graft (CR 702.58a) genuinely has "whenever another creature enters, you may
move a +1/+1 counter from this permanent onto it" — detecting it is right, and it is unroutable because that
ability is genuinely unmodeled. **Those 13 cards are correctly parked.** Same for storm, cascade, suspend,
ravenous.

⭐ **SQUAD WAS SPECIAL AND THAT IS THE WHOLE POINT:** its reminder trigger is conditional on an OPTIONAL COST
THE ENGINE NEVER PAYS, so the ability genuinely does not exist. The test is not "did this come from a paren?"
but "does the ability exist unconditionally?" — which is per-keyword rules judgment, not a sweep.

### ⚠️ AND I REPEATED THE ATTRIBUTION MISTAKE I HAD BANKED ONE TURN EARLIER
The sweep grouped by the first parenthetical's leading word, so Corpulent Corpse was filed under **"fear"** when
its trigger comes from **suspend** — and a 75-card "(unknown)" bucket absorbed the rest. That is the same
proxy-attribution error as the shelf ledger's "Enchant creature ×496", one turn after I wrote *"attribute by
the operation you actually care about, never by a proxy that correlates with it."*

⭐ **A LESSON WRITTEN DOWN IS NOT A LESSON APPLIED.** The ledger entry did not stop me building the same
mistake into the next instrument; only checking two of its rows by hand did. Spot-check the top rows of any new
ranking against the cards themselves BEFORE reading meaning into the shape.

Squad remains the only card in this class. No slice here.

## 🔧 SHIPPED — SQUAD's reminder was a PHANTOM ETB TRIGGER (+3) · a runtime defect, not a metric quirk

Roadkill Rodney · Wasteland Raider · Securitron Squadron. GAINED 3 · LOST 0.

⛔ **REMINDER TEXT WAS BEING READ AS RULES TEXT (CR 207.2).** Squad's reminder ends *"…When this creature
enters, create that many tokens that are copies of it.)"* — "When" at a sentence boundary INSIDE the paren, so
the trigger anchor caught it. Every squad creature grew an ETB trigger it does not have, with the malformed
effect clause `create that many tokens that are copies of it. )` — **stray paren included, which is the tell.**

⚠️ **AND IT ROUTED UNNATIVELY**, so a squad creature sent its ETB **to the Arbiter for an ability it never
had.** Not a scoring artefact — a wrong runtime behaviour that no coverage number would ever have surfaced.

⭐ **FOUND BY CHASING A PATH ACCIDENT, WHICH IS THE TRANSFERABLE PART.** Squad was credited on the STATIC
residue path and refused on the TRIGGER path — so an identical card flipped or parked purely on what its OTHER
line happened to be. That asymmetry is *never* cosmetic: this engine has fixed the same shape before (the
self-no-untap static, whose comment calls it "a pure path accident"). **When the same clause gets two verdicts
depending on its neighbours, something upstream is wrong.** Third time this run that a partial/asymmetric
result was the tell (destroy-CREATURE leads, the tapless tap-OTHER half, now this).

The fix sits on the fading/vanishing reminder strip directly above it — same failure mode, different keyword.
Mutation-checked: removing it fails 5 assertions, including "every detected trigger ROUTES", which is what
catches the phantom's actual cost where a count would not.

## 📍 THE FRONTIER CHANGED CHARACTER — measured, and now sized (`shelf-gap-ledger.mjs`)

⚠️ **CORRECTED THE SAME DAY — my first numbers here were wrong.** The ledger initially reported "35 shared /
225 one-card"; both figures came from a broken attribution. Verified attribution gives:

⭐ **5 SHARED · 153 ONE-CARD · 102 COMPOSITE** (of 260 blocked cards across the 10 sub-90 decks).

The bug: blockers were attributed to each card's first line that failed to parse STANDING ALONE. "Enchant
creature" is not an ability, so it never parses alone — and every Aura on the shelf got filed under it,
inventing a corpus×496 "cluster". Blockers are now attributed **BY REMOVAL**: the line whose deletion makes the
whole card native.

**The correction cuts both ways**, which is why it was worth rewriting rather than caveating:
• **far FEWER shared blockers** — 5, not 35. Even less slice-shaped work than I claimed, and I would have gone
hunting clusters that were artefacts of my own grouping.
• **a category the first pass could not see** — **102 COMPOSITE** cards needing two or more fixes each. The most
expensive cards on the shelf, previously filed under one invented blocker.

The 5 real shared blockers: squad ×3 · Pact of Negation's upkeep-or-lose ×2 · ninjutsu cost reduction ×2 ·
miracle ×2 · Pyrohemia's end-step sacrifice ×2.

⭐ **THIRD INSTRUMENT CORRECTION OF THE RUN, AND THE SAME LESSON EACH TIME:** an instrument that GUESSES an
attribution produces confident, plausible, wrong rankings that read exactly like findings. Attribute by the
operation you actually care about — here "does removing it fix the card?" — never by a proxy that merely
correlates with it.

Every vein this run mined is now measured out, and the numbers are recorded so nobody re-mines them:
| vein | state |
|---|---|
| corpus trailing-sentence tail | 397 shapes, **246 single-card** |
| removal-rider family | 116 cards / 77 shapes, largest cluster **5** |
| mana-cost guard | every SPENDABLE kind graduated (tap-OTHER, tapless, pay-life); rest need a resource model |
| keyword vein | 3 paid (their machinery already existed); the rest are real mechanisms |
| per-spell uncounterability | **1 card** in 35,364 (the last cdh lead chased) |

⛔ **AND THE LEDGER SIZES SHARED-NESS CORPUS-WIDE, NOT SHELF-WIDE** — a blocker on one shelf card plus nine
other corpus cards beats one on two shelf cards and nothing else. Sizing on the shelf alone is how a run ends
up building single cards without noticing, which is the drift this instrument exists to make visible.

Build order is closest-to-the-bar first: **cdh 83% (needs 7)** · Dragons 80% (10) · Jurassic Ramp 77% (13).

## 🔧 SHIPPED — two measured payer nouns (+2) · **cdh 82 → 83**

Gene Pollinator (cdh) · Seton, Krosan Protector. GAINED 2 · LOST 0. Both earned by measurement — of the parked
tap-OTHER mana cards, exactly these two were blocked ONLY by the payer noun.

⛔ **"PERMANENT" MUST NOT USE THE WORD-BOUND TYPE-LINE TEST — third sighting of the VACUOUS-FILTER trap** in
this engine (Norn's Choirmaster, Keleth were the others). The word never appears in a type line, so
`permanent` is a gate no printed card satisfies: source built, never offered, card reads modeled while
producing nothing. **Silent in every metric.** Everything on a battlefield IS a permanent (CR 110.1).

### ⭐ ALLOWING "PERMANENT" EXPOSED A POLICY BUG IN MY OWN ORDERING — and then the FIX had one too
With lands legal as payers, the sim would tap a Forest for one mana: legal, pointless, **net zero, every
activation.** Non-mana payers now preferred. Then the first fix STILL picked the land — `createPermanent`
stamps summoningSick on every fresh permanent, lands included, so the sick-first key ranked a just-played
Forest above a ready creature. Key is now creature-scoped.

⭐ **CAUGHT ONLY BECAUSE THE TEST ASSERTS *WHICH* PAYER WAS CHOSEN.** "A payer exists" passes through both
bugs. When a build makes a CHOICE, assert the choice — not that a choice happened.

⚠️ Backslash-through-heredoc trap, third time this run; `no-control-regex` caught it a third time.

## ✅ VERIFIED — the run's 126 flips do not break the HUMAN path · **+ two banked negatives**

### PLAYABILITY SWEEP (intermediate, commander, the human-decision path)
**COMPLETED 12/12 · no wedges.** Finished on turn min 31 / median 53 / max 67. Decision kinds genuinely
exercised: ask 210 · cleanup-discard 6 · tutor-search 6 · taxed-payment 5 · scry-surveil 4 · optional-effect 4 ·
soft-counter 2 · sacrifice-choice 1 · clone-search 1. ⭐ Read the COVERAGE WITNESS, not just the 12/12 — the
kinds fired are the claims this run is entitled to make, and the sweep prints its own honest caveat on the
controller check ("a 0 with 0 exposure is not a pass").

⚠️ **SAMPLE SIZE IS 12 GAMES**, not a season. It says "sixteen slices of parser/mana/keyword work did not
wedge the human path", which is the question that mattered after +126 cards. It does NOT say the new cards play
*well*.

### ⛔ NOT BUILT — the exile-top-of-library op (INGEST and friends)
Ingest decomposed cleanly: the combat-damage trigger works, and the MILL twin already carries
`who:"damagedPlayer"` — so ingest is mill's exile counterpart and `millOnePlayer` is an exact template.
**Then the measurement killed it.** 336 corpus cards carry an exile-top clause, 44 already native, and swapping
the clause for its modeled mill equivalent flips only **3** — none of them ingest cards. 289 have second
blockers, because exile-top is almost always part of something larger (impulse draw, "you may play it").
A new effect op + resolver + exile-zone semantics + tests, for 3 cards. Refused on yield, not on difficulty.

### ⛔ NOT BUILT — the rest of the keyword vein
Measured written-out, NEITHER ingest NOR sunburst classifies native, so neither is a keyword-expansion slice;
they are real mechanisms. That is exactly the warning `probe-keyword-vein.mjs` now carries in its header, and
it held on first contact. **The three keyword slices that paid (aftermath, outlast, escalate) were the only
rows whose machinery already existed.**

## 🔧 SHIPPED — ESCALATE, option withheld (+4) · **+ the keyword probe is now a script**

Borrowed Hostility · Borrowed Malevolence · Borrowed Grace · Collective Resistance. GAINED 4 · LOST 0.

⛔ **ESCALATE IS NOT A FREE STRIP, AND ONLY MEASUREMENT SHOWED IT.** It reads like another cost-shaped keyword
until the modal is checked: *"Choose one or both —"* parses to **chooseCount 2 / upTo true**, so the cast path
genuinely CAN pick both modes — and picking both without paying escalate casts the spell **for less than its
cost.** That is an FP, not an under-model, and stripping the line would have shipped it.

⭐ Admitted the AFTERMATH way instead: unpark only once the lane withholds the option it cannot price. The
modal is clamped to ONE mode — a real, complete, legal cast at the printed cost — the same bargain fuse / delve
/ myriad / replicate / squad are credited under. `escalateSingleMode` records WHY the modal is narrower than
the card.

⭐ **THE TEST ASSERTS THE CLAMPED AND UNCLAMPED TWINS TOGETHER.** Same modal text minus the keyword still
offers a two-mode cast; with it, every offer has exactly one. Either assertion alone would pass on an engine
that never offers two modes to anything — **only the pair pins the clamp.** Same reasoning as the
caster-vs-controller life pair earlier in the run; it is becoming the default shape for "this thing, not its
neighbour" claims.

### 📍 `probe-keyword-vein.mjs` SHIPPED — three slices from one question
AFTERMATH +7 · OUTLAST +8 · ESCALATE +4 all came from *"which single printed keyword line, dropped, makes this
card native?"* — a gap **invisible to a tier census**, because a card blocked by one keyword looks identical to
one blocked by its whole body. Two warnings are in the script header: a cluster is a **LEAD** (most rows are
real mechanics — cipher 8, ingest 6, specialize 5, double team 5, sunburst 5, phasing 4), and **deleting a
keyword line can itself be the FP**. Its ranking already shows its own work: 194 → 177.

## 🔧 SHIPPED — OUTLAST expanded (+8) · **second finished-mechanism-delivering-nothing in a row**

Abzan Falconer · Abzan Battle Priest · Mer-Ek Nightblade · Ainok Bond-Kin · Tuskguard Captain · Longshot
Squad · Salt Road Patrol · Disowned Ancestor. GAINED 8 · LOST 0.

⭐ **NO NEW MACHINERY.** CR 702.107a: "Outlast [cost]" IS "[cost], {T}: Put a +1/+1 counter on this creature.
Activate only as a sorcery." Writing that sentence out by hand already classified native-activated. The
keyword needed only to be **said in words the parser knew** — so the keyword-vein probe has now paid twice in
a row on the same shape.

⭐ **THE EXPANDER IS EXPORTED AND SHARED** with coverage.js, whose `isActivatedAbilityLine` is documented as an
exact mirror of the parser and keys on a COLON — which "Outlast {W}" has none of. Duplicating the regex would
leave the mirror one edit from lying. Mutation-checked: letting it drift parks the cards while the parse still
succeeds.

### ⚠️ THE PIN DEMANDED AN END-TO-END OFFER AND MY FIRST CHECK OF IT WAS WRONG
The refusal warned that crediting outlast "would claim a card plays natively while the engine never offers the
ability at all." My first harness reported **NOT OFFERED** — because the state had phase "beginning" and
`priorityHolder: null`, so `legalActionsForPlayer` returned **zero actions of any kind.** A positive control (a
written-out ability that has always worked) exposed the harness rather than the engine; with a real priority
window both forms are offered identically.

⭐ **THIRD TIME THIS RUN RULE 1b SEPARATED A FINDING FROM A FICTION, AND ALWAYS THE SAME DIRECTION:** an
absent signal that turned out to be my instrument, not the engine. The pattern is now reliable enough to
state as a habit — *when a check says "the engine doesn't do X", first prove the check can see the engine
doing anything at all.*

Two pins re-pointed. Outlast was the standing example of a keyword that fails the untaken-option test AND has
no enforcement; it now fails only the first half, so the example moves to RECONFIGURE and the rule is
restated: **a keyword is never credited for being declinable, only for being genuinely modeled** — opposite
routes, and conflating them is what that pin exists to prevent.

## 🔧 SHIPPED — the AFTERMATH keyword line (+7) · **a finished mechanism delivering nothing**

Claim // Fame · Farm // Market · Spring // Mind · Destined // Lead · Consign // Oblivion · Mouth // Feed ·
Never // Return. GAINED 7 · LOST 0. Predicted 7, got 7.

⚠️ **THE MECHANISM WAS ALREADY COMPLETE AND CORRECT.** A previous slice set `rightGraveyardOnly`, threaded it
to `graveyardOnly`, and made the hand-cast lane skip that face so the engine could never make the illegal cast
CR 702.127a forbids — reasoning the whole case out in its comment. **And every aftermath card was still
arbiter-spell**, because the literal `Aftermath (…)` line stayed in the right half's oracle, so that half
parsed LOW and the both-halves gate refused the card.

⭐ **THE TRANSFERABLE LESSON IS WHERE TO LOOK.** A mechanism can be complete, correct, carefully argued, and
still deliver **zero** because one redundant line of the text it describes was never removed. No coverage
number, tier diff or existing test could point at that — the gap is invisible unless you ask *"which single
printed keyword line, dropped, makes this card native."*

### 📍 NEW INSTRUMENT QUESTION: the KEYWORD VEIN
194 parked cards unblock by dropping ONE keyword line, across 122 distinct keywords. Largest clusters:
cipher 8 · **aftermath 7 (built)** · ingest 6 · specialize 5 · double team 5 · sunburst 5 · phasing 4 ·
outlast 4. ⚠️ Most are REAL mechanics needing real work — aftermath was the outlier precisely because its
mechanism already existed. Treat the ranking as "look here", never as "these are all one-line fixes".

## 🔧 SHIPPED — PAY-LIFE mana costs (+10)

Staff of Compleation · Standing Stones · Blood Celebrant · Myr Convert · Vesper Ghoul · +5. GAINED 10 · LOST 0.

⭐ **SAME GRADUATION AS TAP-OTHER, DIFFERENT CURRENCY.** The guard lumps pay-life with discard /
remove-counter / exile / return-to-hand as "a resource the sim can't spend" — but **life is tracked state
with a mutator.** Gated on affordability in manaSources, actually spent in commitManaTap.

⛔ **THE BAR FOR THE OTHERS IS UNCHANGED BECAUSE IT IS ABOUT SPENDABILITY, NOT DIFFICULTY.** A discard needs
a hand the mana model never consults; a remove-counter draws on a FINITE pool the sim would treat as
infinite. Both still refuse **in the same test as the graduation**, so the principle stays beside its
exception.

⭐ **THE GATE IS `>` NOT `>=`.** CR 118.4 permits paying life to exactly 0, and an SBA then ends the game —
so `>=` lets the sim **kill itself for one mana**, a legal move no player would make and a corrupted training
game. Declining that last point is a documented NARROWING, not a rules claim. Mutation-checked.

### 📍 THE MANA-COST GUARD IS NOW SORTED BY A REAL CRITERION
Three cost kinds graduated this session (tap-OTHER, its tapless twin, pay-life) and three remain refused
(discard, remove-counter, exile/return). The line between them is no longer "what the guard happened to
list" — it is **whether the resource is state this seam can honestly spend.** Remaining corpus behind the
refused kinds: discard 8 · remove-counter 18 · exile 33 · return-to-hand 8, each needing a resource model the
mana seam does not have.

## 🔧 SHIPPED — the TAPLESS half of tap-OTHER (+5)

Heritage Druid · Birchlore Rangers · Baylen · Supportive Parents · The Massive Zatcatl. GAINED 5 · LOST 0.

⚠️ **A PARTIAL FLIP SENT ME LOOKING — SECOND TIME TODAY, AND IT PAID BOTH TIMES.** The previous slice flipped
5 of 10; the rest were the tapless form. **Three** bugs were hiding behind that one split:
1. **greedy regex** — `([a-z]+)s?` ate "elves"/"creatures" whole, so every count>1 card kept its refusal;
2. **the source excluded itself unconditionally** — but Birchlore Rangers IS an untapped Elf and may pay its
   own cost; excluding it demanded two OTHER Elves where the card asks for two total;
3. ⭐ **summoning sickness gated it (CR 302.6)** — `usableWhileSick` was `sacrifices && !requiresTap`, the right
   rule stated over one example. ANY mana ability without {T} is legal the turn the creature lands. The engine
   now applies that clause on **both sides** of the cost instead of one.

### ⚠️ AND GENERALISING IT NEARLY SHIPPED A REGRESSION
`!prod.requiresTap` is TRUE for lands — they carry no such key, and **undefined means "does tap"** — so every
mass-animated land became usable the turn it was played. **The existing CR 302.6 land test caught it inside
one run.** The check is `=== false`. ⭐ The generalisation was right and the predicate was wrong; those fail
identically in a diff and only the older test told them apart.

## 🔧 SHIPPED — TAP-OTHER mana costs (+5) · Springleaf Drum hits 2 shelf decks

Springleaf Drum · Loam Dryad · Saruli Caretaker · Jaspera Sentinel · Dragonbroods' Relic. GAINED 5 · LOST 0.

⭐ **THIRD CAPABILITY PIN THIS RUN TO GRADUATE ON ITS OWN STATED CONDITION** — the guard refused the family
because *"the sim doesn't tap the other Elves."* It taps them now: `extraTap` → manaSources (resolves real
payers, refuses to offer the source without them) → commitManaTap (taps them), mirroring how `sacrifices`
already carried the Treasure self-crack.

⛔ **THE HONESTY CLAIM IS UNCHANGED, ONLY ITS MECHANISM.** Still not STANDING sources — sources only while a
payer exists. Phantom mana prevented by making the cost REAL, not by refusing the card. Sphere of the Suns
(remove-counter, a finite pool) stays refused **in the same test**: two costs, two verdicts, one principle.

### ⭐⭐ THE RULES SUBTLETY THAT NOTHING WOULD HAVE CAUGHT
**Summoning sickness is NOT a payer filter (CR 302.6).** Sickness restricts the {T} symbol in a creature's
OWN cost; this is a cost of the DRUM's ability, so a creature played this turn is a legal payer — *exactly the
turn this card is meant to matter*. The naive implementation filters by `!summoningSick` and is **wrong in the
restrictive direction**, which no coverage number, no tier diff and no other test would ever flag. Pinned, and
payer ordering now PREFERS sick creatures since they have nothing else to do.

⚠️ The ``-through-heredoc backspace trap bit again; eslint's `no-control-regex` caught it, second time this
run. **The lesson is not "be careful" — it is that the lint rule is the detector**, so never silence it.

## 🔧 SHIPPED — two-colour tokens in the rider grammar (+3)

Reduce to Memory · Harsh Annotation · Resculpt. GAINED 3 · LOST 0.

⭐ **THE BUILDER ALWAYS UNDERSTOOD IT** — `"and"` is an entry in TOKEN_COLOR_WORDS, so `tokenTypeLine`
produces the SAME type line for "red and white spirit" as for "red spirit". The main create-token path took
two colours as well. **Only the RIDER copy of the grammar was single-colour**, so the sentence parked as a
rider and went native as a card's own effect. Sixth axis instance, and the first one entirely INSIDE a family
whose other arms I had already widened this session.

⛔ **Three colours stay out.** One more alternation would admit them and no corpus card prints one. Same rule
as the caster-gain-life slice: **widen to what the CARDS print, never to what the grammar could swallow.**

⚠️ **Fourth stand-in-went-stale episode** — two pins used the two-colour token as their unmodeled example.
Re-pointed to a three-colour token. That is now a reliable rhythm: *widen a vocabulary → the suite's own
counter-examples go stale → re-point them.* Worth expecting rather than rediscovering each time.

### 📍 THE REMOVAL-RIDER FAMILY IS NOW MEASURED OUT
A scoped probe (modeled removal/counter LEAD + exactly one unmodeled trailing sentence) reports **116 cards
across 77 shapes**, largest cluster 5. Three slices took this family from "the biggest lever on the board" to
fragmented. **Nothing left here is worth more than ~3 cards**; the next lever has to come from a different
question.

## 🔧 SHIPPED — caster-subject gain-life rider (+5)

Sever Soul · Divine Offering · Serene Offering · Terashi's Grasp · Exile. GAINED 5 · LOST 0.

⭐ **THE SUBJECT IS THE OTHER ONE.** The fold already handled "ITS CONTROLLER <rider>"; this is the "YOU
<rider>" sibling on the identical lead grammar. TOUGHNESS and MANA VALUE join POWER on the shared pre-removal
capture. **Rode the creature-lead fallback from the previous slice** — so that hole did not have to be found
twice, which is the point of fixing causes rather than instances.

⛔ **THE BENEFICIARY IS THE ENTIRE RISK.** Swords to Plowshares pays the TARGET'S CONTROLLER; Sever Soul pays
the CASTER. One word apart, same matcher family, same atom field — swap them and the card reads native,
resolves cleanly, and **heals the player it was cast at.** The two are asserted TOGETHER, because each alone
is satisfiable by an implementation that always pays one player.

⭐ **POWER IS DELIBERATELY NOT WIRED** to the caster subject even though the capture holds it. Admitting it
would be one word of regex and no corpus card prints it that way. **Widening a vocabulary to what the data
structure could support, rather than to what the cards actually say, is how a parser starts inventing shapes.**

⚠️ And one of my own refusals was WRONG: "you gain life equal to the number of Swamps you control" parses
HIGH through a pre-existing count-source path — correctly, because a board count needs no capture. The
assertion is inverted and kept, so nobody folds a working path into this rider thinking it is a gap.

## 🔧 SHIPPED — "Its controller loses N life" rider (+16) · **and the hole under the hole**

16 cards, GAINED 16 · LOST 0. Hideous End · Sip of Hemlock · Certain Death · Undermine · Countersquall · +11.

⭐ **A MISSING MAP ENTRY.** Lead grammar, controller CAPTURE and apply seam were all already built for
gain-life / token / draw / mill riders; `parseControllerRider` had no arm for the most common printed rider
in its own family.

### ⚠️ THE SECOND HOLE, AND HOW IT ANNOUNCED ITSELF
Adding the entry flipped Despoil and Glissa's Scorn but NOT Sip of Hemlock or Hideous End — identical text
differing only in target type. ⭐ **A uniform build producing non-uniform results is a second bug, not a rough
edge.** Chasing it found that the fold's lead resolver owns destroy-LAND / destroy-ARTIFACT / exile-ANYTHING
but **not destroy-CREATURE** (which lives in the main clause grammar with the regeneration riders). So the
most common printing of this shape had **never** been reachable, on any rider, since the fold was written.

Fixed by injection — spanMatchers can't import parser.js (cycle), so parser.js passes its clause parser down
as a fallback lead resolver, reached only where the existing one returns null. **Third slice on that ordering
rule, third LOST 0.**

⛔ **THE DRAIN HALF GOES TO THE CASTER**, the only place in this family a rider touches anyone but the
captured controller — so the natural wrong implementation has Certain Death healing the player it kills.
Mutation-checked both ways (drain-to-victim fails; stripping the lead's restrictions fails, so a "nonblack
creature" fold can't become destroy-anything).

**8 CREED pins across 5 files** used this rider as their example of an unmodeled one — all RE-POINTED to a
verified-unmodeled stand-in (discard), never weakened. Third stand-in-went-stale episode of the run; the
lesson from the first one (grep the suite for your own counter-examples before widening) held.

## 🔧 SHIPPED — kicked MAGNITUDE replacement (`nonKickedOnly`, +7)

Burst Lightning · Shivan Fire · Roil Eruption · Firebending Lesson · Might of Murasa · Explosive Growth ·
Gift of Growth. GAINED 7 · LOST 0. Predicted 5-6; both extras name-audited clean.

⭐ **THE COMPLEMENT FLAG.** `kickedOnly` existed for the ADDITIVE payoff. A REPLACEMENT needs BOTH halves
conditional, or a kicked Burst Lightning deals 2 damage **AND** 4. `nonKickedOnly` is the exact mirror; the
pair is mutually exclusive, which is what "instead" means. **Sixth missing-arm-of-a-pair this run.**

Another CAPABILITY pin that named its condition ("a conditional-replacement model we don't have") — re-pointed,
not deleted. Field Research (same shape, unsupported op) still refuses and is kept as the boundary marker.

⭐ **CLONE, DON'T RE-PARSE — and the audit proved it right.** The printed tail is elliptical ("it deals 4
damage instead" names no target), so the kicked atom is the BASE with one field swapped: op/targetType/
restrictions identical by construction. **Gift of Growth was an unpredicted gain whose base is a single pump
atom with `untap: true` folded in** — the clone carried the untap through. An independent parse would have
dropped it: a kicked mode that pumps but forgets to untap, on a card reading native.

### ⚠️ A MUTATION CAUGHT MY OWN TEST BEING HOLLOW — the cleanest instance of the run
Removing the `nonKickedOnly` skip from runProgram left **all 12,359 tests green.** Every assertion I had
written read the PARSE shape; nothing resolved a kicked spell to see whether the base was suppressed.
⭐ **A flag the runtime ignores is decoration, and a parse-shape test cannot tell the two apart.** The witness
now resolves Burst Lightning both ways — 2 not kicked, 4 kicked; the mutation makes it 6.

## 🔧 SHIPPED — trailing "Exile <this>." disposition (`f57c497f`, +7)

Temporal Trespass (shelf: Believe it!) · Time Reversal · Treasured Find · Flood of Recollection · Game Plan ·
Rite of Renewal · Rise of the Eldrazi. GAINED 7 · LOST 0.

⭐ **THE MIRROR THAT WAS NEVER WRITTEN, AND THE CODEBASE ALREADY NAMED IT.** The self-SHUFFLE strip's own
comment calls the exile form *"the exact mechanical mirror of Finale of Revelation's 'Exile <this>.'
selfExile"* — the disposition flag existed and GY-1 honored it, but nothing peeled the trailing EXILE
sentence. **The file that names the pair implemented half of it.** Sixth axis instance of the run.

⛔ **THE STAMP IS THE POINT, NOT THE STRIP.** These spells never reach the graveyard; peeling without
stamping flips the card native while silently sending it to the yard, corrupting every graveyard count,
recursion target and delve/escape cost. Mutation-checked — removing the stamp fails both runtime assertions.

### ⚠️ I REGRESSED FINALE OF REVELATION, AND THE FIX WAS ORDERING RATHER THAN CLEVERNESS
The first version stripped up front, beside the self-shuffle strip. Finale is already owned by a collapse
matching its whole *"draw X … Exile <this>."* shape, so peeling the sentence first meant that collapse no
longer recognised it: **native-spell → arbiter-spell. A working card broken to make a broken one work.**

Fix: the normal parse runs FIRST and is returned untouched whenever HIGH; only a **LOW** program is retried
with the sentence peeled. The pre-existing owner always goes first, so the handlers compose instead of compete.

⭐ **SAME DISCIPLINE AS THE RESTRICTED-MANA SLICE AN HOUR EARLIER** (restricted production runs only where
`manaProductionImpl` already returned null). Make the new path reachable ONLY where the old one already
failed, and **"no regressions" stops being a hope you verify and becomes a property you cannot violate.**
Two slices, two LOST 0s, one rule — this is now the default shape for widening anything in this engine.

## 🔧 SHIPPED — SPEND-RESTRICTED MANA enforced (`323791ab`, **+34**) · **the biggest slice of the run**

Jeweled Lotus · Herd Heirloom · Dalakos · Ixalli's Lorekeeper · Vedalken Engineer · +29. GAINED 34 · LOST 0.
**FOUR SHELF DECKS MOVED:** Captain America 68→70 · Wolverine 72→73 · Jurassic Ramp 75→77 · **Earth Bent
90→91.** Six of sixteen decks now at/over the bar.

⭐ **A CAPABILITY PIN GRADUATING, AND IT NAMED ITS OWN CONDITION.** The guard read *"route the whole card
out … UNTIL RESTRICTIONS ARE REAL."* That phrasing is the tell: a CAPABILITY pin cites a missing capability
as its reason, and graduates on runtime proof. Contrast the uncapped-tutor axis reverted hours earlier, whose
pins said *"cheat"* and *"landmine"* — JUDGEMENT, which never graduates. **Same day, same shape, opposite
correct answers, and the words in the pin are what tell them apart.** All 7 pins were RE-POINTED, never
deleted.

### THE FOUR PROPERTIES, both safety ones mutation-checked
1. pays the cast it is printed for · 2. pays no other cast ·
3. ⭐ **DEFAULT-DENY** — no spend context ⇒ not offered. This is what makes partial adoption sound: the ~9
   payment call sites nobody threaded stay correct **by construction**, and a caller that forgets the context
   under-pays. The unsafe direction requires an explicit, wrong context.
4. ⭐ **NO LAUNDERING** — an over-producing restricted source may not pay a smaller cost. Surplus floats into
   a pool with no restriction tag, so one such tap converts Jeweled Lotus's commander-only mana into general
   mana **permanently.** This is the one that would have shipped silently.

### ⚠️ TWO FALSE POSITIVES OF MINE, BOTH CAUGHT BY PINS RATHER THAN BY ME
• **QUOTED GRANTS** — Battery Bearer grants a restricted ability to OTHER creatures and taps for nothing
itself; my re-parse credited the GRANTER with {C}, a fabricated source on a card that makes no mana. Worse
than the bug the feature fixes.
• ⭐ **LOSSY QUALIFIERS** — Helga prints *"cast creature spells WITH MANA VALUE 4 OR GREATER"*; prefix-matching
read "creature spells", modeling a restriction **LOOSER** than printed. **For a RESTRICTION the usual
intuition inverts:** an unread tail normally means under-delivery (a safe FN), but on a restriction it means
the restriction is WEAKER — an over-delivery. That inversion is why it slipped past me, and it generalises to
every negative-space clause: can't-be-blocked-by, protection-from, activate-only-if.

Blast radius bounded by ORDERING, not by care: the restricted path runs **only** on cards the existing code
already returned null for, so nothing that makes mana today can change. **LOST 0 is a consequence of that
ordering, not luck.**

## 🔧 SHIPPED — UNION list on ETB trigger subjects (`d0caded6`, +2) · **the SHELF moved**

**April O'Neil, Live on the Scene — Halfshell heroes 63% → 64%**, the first shelf card since Biogenic Ooze.
Plus Valley Mightcaller. GAINED 2 · LOST 0.

⭐ **THE LIST WAS ALREADY SAYABLE ON THE `dies` SIBLING TWENTY LINES AWAY IN THE SAME FILE** — same
`parseSubtypeList` helper, same `subtypeFilter` field, and `subtypeFilterMatches` has always matched ANY
member of an array. Only the ETB arms still read a single word, so the identical printed sentence fired on
death and was invisible on entry. **Fifth consecutive slice of this exact shape.** The axis is no longer a
hypothesis about this codebase; it is its dominant defect class.

⛔ **THE VACUOUS FILTER is why runtime witnessing was mandatory here** and not a nicety: a gate no printed
card satisfies leaves the card NATIVE while the trigger fires ZERO times — **invisible to the tier diff,
because nothing moves.** Two have shipped that way before (Norn's Choirmaster, Keleth). Every list member is
fired on a real board; the vacuous-filter probe reports 383 filters minted, 0 vacuous.

### ⚠️ MY HARNESS SAID "NOTHING FIRES" AND THE POSITIVE CONTROL IS THE ONLY REASON THAT ISN'T A FILED BUG
`checkEnterTriggers` returns the next **STATE**, not a list of fired triggers. Reading it as an array made
everything silent — and **all four negative assertions passed against that broken harness**, because nothing
firing satisfies "should not fire" perfectly. Running the already-native single-subtype card through the same
helper exposed it in one step. It is now a permanent fixture in the file, not a one-off check.

⭐ Second time today RULE 1b was the difference between a finding and a fiction (the first: the hollow zero
in the tutor detour). **A harness that produces no signal is indistinguishable from an engine that produces
no signal.**

### ⚠️ AND THE PREDICTION UNDERSHOT — 3 forecast, 1 delivered
The measurement swapped every list for a single subtype and asked "does the card flip." That proves the list
is the blocker; it does **not** prove which ARM the list lives in. Valley Mightcaller's was behind the
"another" determiner (added, hence +2); Moria Marauder's is a combat-damage subject and is still parked.
**➕ ADDENDUM (`0fe608cc`, +1 — Moria Marauder).** Chasing the undershoot per-construction found the fourth
arm, and it was the most instructive of the four: **list support there was REAL BUT HALF-SHAPED.** The anchor
required a COMMA before it could reach the "or", so Spawning Kraken's four-element comma list matched and the
bare two-element "a Goblin or Orc" did not — while the comment above it read *"OR a multi-subtype LIST"*,
which was **true for the form somebody had tested.** ⭐ **A half-shaped feature ships with honest
documentation of the case that was checked**, so reading the comment confirms it works; only running the other
printed form finds the hole. All four constructions now read one grammar. The undershoot audit is +3 total.

⭐ **Measure per CONSTRUCTION, not per shape** — and audit an UNDERSHOOT as hard as the overshoot that caught
the Timber Protector FP this morning. Both directions are the model of the build being wrong.

## 🔧 SHIPPED — bounce noun vocabulary (`cc31834f`, +2) · **predicted 2, got 2**

Stern Proctor · Quandrix Command. GAINED 2 · LOST 0. Small, and shipped anyway because it is the shape the
frontier is made of now — and because it is the clean CONTRAST to the tutor detour directly below.

⭐ **THE DIFFERENCE BETWEEN A GAP AND A DECISION COSTS ONE GREP.** Both looked like the same axis. Before
building this one I grepped the suite for pins on the missing nouns: **none.** The tutor axis, grepped after
the fact, had **eight files** pinning it in the words "cheat" and "landmine". That grep is now the first step
of any vocabulary widening — before the parse arm, before the measurement.

Three pieces of evidence, all pre-build: `destroy` already says all three nouns and emits the very targetTypes
reused here; the graveyard-recursion sibling already says the union; and `return target PERMANENT to its
owner's hand` is native today and **demonstrably bounces a planeswalker** — so the runtime question was
already answered and only the sentence was unsayable.

### ⚠️ THE MUTATION CHECK CAUGHT MY REASONING, NOT MY CODE — a use for it I had not had before
I documented the union-before-prefix regex ordering as **load-bearing**, with a confident mechanism:
first-match alternation would match bare "artifact" and silently drop the enchantment half. Mutating the order
to demonstrate it left **all 13 tests green.** The whole-clause `$` anchor forces a backtrack into the longer
alternative; the ordering is cosmetic. Both comments now say so.

⭐ **A CONFIDENT EXPLANATION IS A CLAIM, AND IT GETS MUTATED LIKE ANY OTHER.** Mutation testing is normally
aimed at "can this test fail?" — here it answered "is my stated REASON true?", and it wasn't. A wrong
rationale in a load-bearing comment survives longer than wrong code, because nothing ever runs it.

Also caught, by insisting on a runtime witness rather than a parse-only test: **a planeswalker is identified by
its loyalty COUNTERS**, not its type line, and `createPermanent` drops `counters` from its opts bag — so the
board had no planeswalker at all and the assertions would have passed for the wrong reason. Same harness trap
already recorded in controlAura.test.js; second sighting.

## ⛔ NOT SHIPPED — the uncapped battlefield tutor · **I was wrong twice in one investigation**

Reverted in full. Suite back to 967 / 12,293. Only the legibility refactor (`bc81416f`, 0/0/0) survives.
Worth the space because **both errors were caught by an instrument rather than by me**, and they were
different kinds of wrong.

### ⚠️ WRONG #1 — a HOLLOW ZERO, and I skipped the positive control because the answer looked right
I read the vacuous `[].every(guaranteedLand)` in bfm as a latent CREED false positive. A corpus probe said
**"0 of 36,068 cards affected"**, so I closed the case as dead code — and the tier diff came back **LOST 2**,
naming Planar Bridge and Tezzeret, Artifice Master. The probe had parsed each oracle **LINE** whole, so an
**ACTIVATED** ability (`{6}, {T}: Search …`) never reached the clause parser and every card carrying the
shape behind a cost was invisible to it.

⭐ **A ZERO IS A MEASUREMENT AND A MEASUREMENT NEEDS ITS POSITIVE CONTROL.** RULE 1b exists for precisely
this, and I skipped it *because the number I got was the number I expected.* That is the whole failure mode:
the control feels redundant exactly when it is load-bearing. **Any line-split corpus probe in this repo is
blind to activated abilities** — check that before trusting the next zero.

There was no hole. `parseTutorFilter` returns empty groups ONLY when `permanentOnly` is set, so the real gate
was always there; the vacuity made a correct outcome unreadable, which is what `bc81416f` fixed.

### ⛔ WRONG #2 — I MISTOOK A JUDGEMENT PIN FOR AN AXIS GAP, and argued past the doctrine that said so
Reasoning: Planar Bridge fetches ANY permanent uncapped and is native; a creature card is a strict SUBSET of a
permanent card; therefore an uncapped creature fetch is strictly safer. It parsed, the runtime honored it
(Tinker genuinely put Sol Ring onto the battlefield), the diff was **GAINED 6 · LOST 0**.

**And 14 tests across EIGHT independent files failed**, every one of them deliberately pinning this exact
behavior in the words *"the non-land battlefield cheat stays LOW"* and *"no creature cheat-into-play"*. One of
them — `vocabularyAsymmetry.test.js` — uses the asymmetry as the axis probe's **own positive control.**

⭐ **The taxonomy this run built already had the answer: CAPABILITY pins graduate on runtime proof; JUDGEMENT
pins ("cheat", "landmine") never do.** Runtime proof was the wrong evidence to bring — it answers *can we*,
and the pins are about *should we*. Eight files of deliberate agreement is not a gap to close unattended.

⭐ **And Planar Bridge was never a counterexample — it was the accidental exception the vacuity created.**
"We found one card that slipped through the rule" argues for examining the exception, never for deleting the
rule. I had it backwards.

### ❓ GENUINELY OPEN FOR COLTON (not a build — a call)
The rule now has an unprincipled edge: **Planar Bridge (any permanent, uncapped) is native; Tinker (any
artifact, uncapped) is not** — and artifact is the narrower fetch. Both are faithful to their printed text.
Either the doctrine should admit named permanent CARD TYPES, or Planar Bridge should park. Evidence is banked:
+6 corpus available (Tinker · Dragonstorm · Moggcatcher · Skyshroud Poacher · Seahunter · Shadow-Rite Priest),
runtime proven, and the exact 14 pins that would need re-pointing. **0 shelf decks either way**, so nothing is
blocked on the answer.

## 🔧 SHIPPED — multi-subtype LIST anthems (`57b5b9bf`, +7) · **and the FP my own audit caught**

Death-Priest of Myrkul (+A-) · Ultron, Machine Overlord · Warg Rider · The Swarmweaver · Master
Trinketeer · Brightcap Badger. GAINED 7 · LOST 0. **0 shelf decks** — stated plainly; the shelf tail is
391 shapes touching one deck each, so corpus-wide veins are now the better value per unit of work.

⭐ **A MISSING PARSE ARM, NOT A MISSING MECHANIC — the fifth straight slice of that shape.** `selector.subtypes`
was always an array and matchesSelector always ORed it; the comment at that match site reads *"OR semantics,
same as a multi-subtype list."* The runtime was **built for lists and had never been handed one.**

⭐ **CURATION WAS MEASURED AND REJECTED.** "Skeletons / Robots / Servos / Thopters / Orcs you control get
+1/+1" all classify native TODAY, uncurated — the static branch normalizes rather than curates. Requiring an
allowlist would have parked cards that already work. I had a collision audit of 22 subtypes ready to add and
**threw it away when the measurement said it was unnecessary.** No allowlist was touched.

### ⚠️ I SHIPPED A FALSE POSITIVE AND THE NAME AUDIT IS THE ONLY REASON IT DIDN'T SURVIVE
`Other Treefolk and **Forests** you control have indestructible` (Timber Protector) passed every guard I
wrote, because `NON_CREATURE_SUBTYPES` covered artifact and enchantment subtypes and held **no land types at
all.** Under the Creature-restricted selector the Forests half selects nothing — native claimed, half the
printed text never delivered, green suite. Land subtypes added; it parks again; **LOST 0** proves nothing
pre-existing leaned on the hole.

⭐ **THE TRANSFERABLE PART: I predicted 6 flips and the diff said 8, and the two unforecast names are what
exposed it.** An unpredicted GAIN is evidence about the build, not a bonus. Predict the count *before* the
diff, and audit every row that beats the prediction — the surplus is where the FP hides.

Mutation-checked both ways: first-word-only → 4 fail (both runtime assertions among them); guard dropped →
the 2 CREED pins fail. Suite 967 files / 12,293 tests.

## 🔧 SHIPPED — 8 curated subtypes (`b030e27b`, +3) · **first per-card slice under the new ordering**

Picked by the rule the last two resumes established — **order by DECK count, take what is genuinely one
build** — and it is the first shelf card to land since B1: **Biogenic Ooze is in Halfshell heroes.**
Also Minwu, White Mage · Citizen V, Helmut Zemo. GAINED 3 · LOST 0.

⭐ **A LIST, NOT A MECHANISM.** `put a +1/+1 counter on each Vampire you control` already parsed with a
subtypeFilter; `each Ooze you control` did not, purely because Ooze was absent from `COUNT_SUBTYPE`.

**Verified against that list's OWN criterion** (an entry must appear verbatim only in the SUBTYPE portion of
a type line): corpus-counted all eight — Cleric 722 · Villain 212 · Advisor 187 · Ooze 74 · Leech 21 ·
Wraith 14 · Fractal 8 · Moogle 8 — **every occurrence in the subtype position, ZERO left of the dash.**

**Sized before building:** 15 corpus cards print the shape, 13 parked, and exactly **3** have curation as
their ONLY blocker (measured by swapping in an already-curated subtype and re-classifying). The other 10
each carry a second gap. **+3, not +13** — the shared allowlist widened on evidence, not on hoped-for
downstream flips.

### ⚠️ THREE CREED PINS BROKE, AND THAT WAS THE CAREFUL PART
All three used **"Villain"** (one also "Fractal") as their stand-in for *"a word not in the curated list"* —
and this change made Villain curated, so each pin was about to assert the curation gate **using a word that
now passes it**. A pin that tests a gate through an example is only as good as the example. All three moved
to "Scarecrow" (verified still uncurated), with the reason in place and an instruction to **move the example
again rather than weaken the assertion** if Scarecrow is ever curated.

⭐ **Generalises:** when you widen an allowlist, grep the test suite for its counter-examples first — they
are, by construction, drawn from exactly the set you are about to admit.

## 🔬 MEASURED — **I went hunting for leverage where the structure PROMISED it. It was worth 1 card.**

Follow-up on "the shelf is per-card from here", testing that conclusion against its most likely
counterexample. Result: **it survives**, and the way it survived is the useful part.

**The hunt.** Ordered by deck count, the top one-line-away shelf card is **Level Up (3 decks)**. Isolating
its blocker by exact difference found **TWO independent ones, each sufficient**:
```
grant only, 1 sentence   → native-trigger      ETB only                → native-trigger
ETB + grant              → body-only  ⛔       grant only, 2 sentences → body-only  ⛔
```
So *"one line from native"* ≠ *"one build away"* — the line holds two sentences and the card holds two gaps.

**The composition gap is real and precisely located.** An Aura's own-ETB composes with a granted ACTIVATED
ability but NOT with a granted TRIGGERED one:
```
NATIVE  Dragon Mantle · Karametra's Favor · Ringing Strike Mastery · Singing Bell Strike   (grant an ACTIVATED ability)
PARKED  Sisay's Ingenuity · Nurturing Presence · Nerd Rage · Level Up · Bewitching Leechcraft  (grant a TRIGGERED one)
```
`coverage.js` widens the ETB rider per grant family — `isNativeManaGrantAuraWithEtb` is the mana one, the
activated family has its own — and **the triggered family never got a widener**. A precedented ~15-line fix.

⛔ **AND IT WOULD FLIP EXACTLY ONE CARD.** Simulated by stripping the ETB line and re-classifying: only
**Nurturing Presence** (#15527, in no shelf deck) has a remainder that is already native. The other four —
Level Up included — each carry a SECOND blocker of their own.

⭐ **THAT IS THE CONFIRMATION.** The per-card conclusion was derived from clause counts; this tests it
structurally, by chasing the one composition gap the corpus offered — and even there the leverage
evaporates on contact, because each card carries its own additional gap. **Two independent routes, same
answer: there is no lever left, only cards.**

**Banked, not built** (1 corpus card / 0 shelf decks does not justify an FP-sensitive coverage-gate change):
the triggered-grant ETB widener, mirroring `isNativeManaGrantAuraWithEtb` in `coverage.js`.

## 📐 MEASURED — **THE SHELF IS PER-CARD FROM HERE. There is no clause family left to lever it.**

Re-measured after B1 (+7) and the answer is strategy-shaping, so it is written down with the numbers.

**1. B1's +7 moved the CORPUS and not one shelf deck.** Every per-deck figure is byte-identical to the
pre-B1 measurement (aggregate 81% · colton 92% · joe 75% · Dragons 80% · cdh 81% …); corpus went
12,354 → 12,370. **None of the seven control Auras is in any of the 16 decks.** I had been picking work by
corpus leverage while the stated target is the shelf — worth naming rather than repeating.

**2. The shelf has 126 cards ONE LINE from native — and ~118 DISTINCT blocking clauses.** Full distribution
(all 126, not the default 25-row sample):
```
4×  "Whenever equipped creature deals combat damage to a player, …"
3×  "Landfall — Whenever a land you control enters, …"
2×  "Whenever this creature deals combat damage to …"     2×  "Whenever another nontoken creature you control …"
1×  …every one of the remaining ~118
```
⛔ **And the biggest "cluster" is not one:** those 4 equipped-creature cards share a trigger the engine
ALREADY models (scope `equippedCreature`) and differ entirely in EFFECT — draw-then-cast (Buster Sword),
sacrifice-then-draw-N (Foot Chopper), exile-and-search (Sword of Hearth and Home), look-at-N (The Key to the
Vault). Four separate builds wearing the same first six words.

### ⭐ WHAT THIS MEANS FOR THE REMAINING RUN
- **Clause-family work is exhausted for the shelf.** The corpus frontier said the same thing from the other
  side (only 2 families ≥6, both quoted grants, neither one slice).
- **Per-card grinding still works** — each of the 126 is a genuine small slice — **but it is unleveraged**:
  roughly one card per slice, and the sub-90 decks need 10–38 slots each.
- So the honest ordering for shelf movement is **by DECK COUNT, not corpus rank**: regenerate the leverage
  head (`deck-gap.mjs` piped through a name-frequency count) and take the ×3s and ×2s first.
- ⚠️ **The ≥90%-per-deck bar is a per-card project of that size**, not a few more mechanisms. That is a real
  input to Colton's 1.0 call and it agrees with the cdh cap Omnath derived independently.

## 🔎 SHIPPED — the CONTROLLER INVARIANT check, and **the exposure rule it forced** (`8b594558`)

Follow-through on the half-blind-test finding. Controller is stored TWICE — the battlefield ARRAY that holds
the permanent, and the permanent's own `.controller` FIELD (~628 sites read the field). They must never
disagree.

**Measured with a positive control, because a bare zero here means nothing:**
```
random decks         →   0 mismatches over    0 control-change observations
forced Mind Control  →   0 mismatches over  956 observations   ← the invariant HOLDS
same, mover broken   →  25 mismatches over  956 observations   ← the check DETECTS
```
The middle line is the result. The third is the witness. **The first is the lesson:** my initial run was the
random-deck one, and I nearly recorded "0 mismatches, invariant holds" — from a check that had never once
been handed a control change to examine. Breaking the mover ALSO gave 0, which is what exposed it.

⭐ **SO THE REPORT NOW PRINTS ITS OWN EXPOSURE:** `0 (over N control-change observations — a 0 with 0
exposure is not a pass)`. Same discipline as the turn-decisions number. **A count without what produced it
is not evidence**, and this is the second instrument this run to need that fix.

Incidental but worth banking: **956 observations means the +7 control Auras are genuinely being cast and
resolving in real games**, not merely classifying.

## 🏆 SHIPPED — **B1 CLOSED: control Auras, runtime + credit** (`0c19d9c0` + `9e0…`, +7)

`"You control enchanted creature."` — Mind Control · Control Magic · Treachery · Persuasion · Spirit Away ·
Corrupted Conscience · Yavimaya's Embrace. **GAINED 7 · LOST 0 · RETIERED 0.** The queue's biggest remaining
engine lever, and it landed in two halves on purpose.

⛔ **THE FAILURE MODE SHAPED EVERYTHING: permanent control theft is a LEGAL-LOOKING BOARD.** Nothing
crashes, no game wedges, no number moves — the sim just plays on with the wrong player holding the creature.
So the revert hangs off ONE verified battlefield-exit chokepoint, and the test kills the Aura by every route
(graveyard / exile / hand / library).

### ⭐ THE TWO-HALF SPLIT PAID FOR ITSELF, IMMEDIATELY
Runtime shipped first with **GAINED 0 by design**; crediting shipped second. That ordering caught a real
problem: measuring the cast lane before crediting showed **Mind Control's cast action carried
`targets: []`** — it would have cast into nothing, and crediting it would have claimed native for a card the
engine could not play. The grant-aura cast lane is TIER-gated, so the fix was to credit through
`isNativeAura` (which owns its own cast branch) rather than bolt on a new lane. After: `targets: [["E"]]`.
**Had both halves shipped together, the tier would have moved and the card would still have been broken.**

### ⭐ NAME-AUDITED, and the audit earned its keep
Six of seven are control plus already-modeled text. The seventh, **Treachery**, carries an ETB rider
(*"untap up to five lands"*) — verified rather than assumed: parses HIGH and resolves for real (3 tapped
lands → 0). That check is the difference between +7 and +6-plus-a-half-credited-card.

### ⭐ A PIN GRADUATED — capability, re-pointed not deleted
`"a control-theft rider parks the whole card (Corrupted Conscience)"` sat with toxic and nonbasic landwalk
under the same *"no enforcement path"* reason. It graduates now the line has a runtime — **but only after
verifying the card's OTHER half (infect) is genuinely granted and enforced**, so the whole-card rule holds
on both lines. Its principle is re-pointed onto a still-unmodeled rider: control + toxic **still parks**.
Modelling control is not a licence to credit whatever else the card prints.

✅ **Debt CLOSED** — one `controlMove.js` leaf now serves both callers. And the unification's witness found
something bigger than the duplication:

### ⚠️⚠️ `findPermanent().controller` IS THE ARRAY. `.permanent.controller` IS THE FIELD. ~628 SITES READ THE FIELD.
Breaking the shared mover so it stopped assigning `controller` left **the entire 12,276-test suite green** —
because `findPermanent` reports which battlefield ARRAY a permanent sits in, and every control test on BOTH
sides was asserting only that. **My own control-Aura tests, written specifically to prove control moves, had
the identical hole.** The two facts can silently disagree, which is exactly the legal-looking-board failure
this slice exists to prevent. Both files now assert the field; the re-run witness fails on both sides.

⭐ **The general lesson: when a fact is stored in two places, a test that reads one of them is half a test.**
A green suite under a deliberate break is the only thing that would ever have shown it.

Sweep after: 120/120, max 57 decisions in a single turn.

## 🔬 SHIPPED — **`probe-rules-fidelity.mjs`: the first RULES-FIDELITY instrument** (`efa84b3b`)

⭐ **A THIRD AXIS, and Omnath named it.** Coverage % measures what is modelled; the playability sweep
measures whether games finish. **Neither can see a card played wrongly but plausibly.** Aurelia is the proof:
she granted more combats than she prints, and coverage said native-trigger, the sweep said complete, the
suite said 12,000 green — **because nothing about the OUTCOME was wrong. Only the fidelity was.** She was
caught by a human reading the card against the descriptor. This automates that reading for the part that is
mechanically checkable: **a printed LIMITER must appear as a flag on the thing it limits.**

⭐ **SHIPPED BECAUSE IT HAS A DETERMINISTIC WITNESS** — the thing the turn-termination detector never got, and
why that one was withheld. Re-break the latch → **28 flagged, Aurelia at the top**. Restore → **1**. No board,
no preconditions, nothing the operator supplies; the descriptor is the entire input.

**RESULT: 28 checked · 1 flagged · that 1 is a VERIFIED false positive** (Mighty Servant of Leuk-o — the
descriptor is the granted INNER trigger, the limiter wraps the OUTER crew trigger). Left visible rather than
suppressed, so a real regression on that card can still surface.

### ⚠️ THE GHOST TAXONOMY IS THE OTHER HALF OF THE DELIVERABLE
The first draft reported 23 and **the first five I checked by hand were all false.** Three distinct ways a
limiter looks unmodelled and is not:
1. **The limited LINE is undetected while a DIFFERENT line is** (Tataru Taru ETB, Exemplar of Light lifegain,
   Fear of Missing Out ETB). A coverage gap — an ability the engine never detected **cannot over-fire**.
   Fixed by matching per-DESCRIPTOR on `sourceText` instead of card-wide.
2. **The descriptor is a granted INNER ability** and the limiter wraps it.
3. **The ability is parked anyway.** `"Activate only once each turn AND ONLY IF <cond>"` does defeat the
   end-anchored limiter matcher on Skinshifter / Groundling Pouncer / Chronatog Totem — but all three offer
   **ZERO** activations, so nothing over-fires. **A latent shape, not a live bug.**
⭐ **The rule that falls out: an infidelity requires the ability to actually BE OFFERED.** Parse-level
mismatch alone is not a defect.

**Seventh ghost-class of the day — and the first caught entirely before it was reported.**

### ➕ SECOND LANE, SAME DAY: OPTIONALITY (`"you may"` printed → descriptor mandatory)
**1,921 descriptors checked corpus-wide · 1 flagged · that one is a VERIFIED false positive** (Infesting
Radroach — its "may" is deliberately auto-taken; triggers.js says so, *"returning your own card is pure
upside"*). **Witnessed:** forcing `optional: false` makes the lane report 175/175 on the top-3000 slice, 0
restored. ⚠️ **Renamed `probe-limiter-fidelity` → `probe-rules-fidelity`** when the second lane landed —
naming a tool after its first check is the same trap as the stale docstring that cost a slice this morning.


## 🧭 STATE OF THE INSTRUMENTS (swept 2026-07-29) — **the safe veins are DRY; stop hunting, go build**

Four probes run back to back after the two soft-lock fixes. **All four now read clean**, which is the most
useful thing this block says: a session that opens by hunting will spend itself confirming these.

| Instrument | Result | Read |
|---|---|---|
| `playability-sweep` ×4 configs (430 games) | **100%, zero wedges** | beginner/intermediate × commander/standard + targeted. Paid once (`b903119f`), now clean. |
| `probe-classifier-runtime-parity` | 0 divergent | covers native-spell / activated / equipment. ⚠️ **does NOT cover native-trigger.** |
| **`probe-trigger-routing-parity`** (NEW, `7013f236`) | **324 measurable · 0 divergent** | closes that gap. Witness-proven: over-claiming the classifier makes it report 68. 84 targeted/conditional descriptors remain outside the sound subset. |
| `probe-ignored-restrictions` (732 cards, 13 phrases) | worked out | the one real find was `activate only as a sorcery` (`24349d75`). Spot-checked the rest as ENFORCED: menace + the whole `can't be blocked except by` family (combatEvasion EV-2/EV-3 with explicit safe-FN refusals) · `can't attack unless` both forms (CR 508.1c) · echo + cumulative upkeep · the activation limiter + condition riders. |
| **ghost-event check** (new, ad hoc) | **0 dead events** | every `event:` string a descriptor can carry has a runtime producer. No repeat of the ghost-registry incident. |
| `clause-frontier --min 6` | **only 2 families left** | both are quoted grants: `enchanted creature has "…"` (16) and `commander creatures you own have "…"` (15). **Neither is one slice** — Agent of the Iron Throne proves the GRANT already works, so all 31 are blocked by 15 different INNER abilities. |

### 🎯 THE ONE INSTRUMENT GAP WORTH BUILDING — trigger-tier parity (scoped, not started)
`probe-classifier-runtime-parity` covers native-spell / activated / equipment and **skips native-trigger,
the largest tier — and the tier where BOTH of this run's engine bugs lived.** The gap is not cosmetic:
`triggerRouting.triggerRoutesNatively` is a HAND-WRITTEN MIRROR of `gameEngine.buildTriggerStack`'s α1
allowlist — its own comment says *"Mirror buildTriggerStack's α1 ALLOWLIST EXACTLY"*. **A mirror drifts.**
This run hit five separate whitelist/mirror divergences, and a drift here means the metric claims a routing
the runtime will not perform (FP) or refuses one it would (FN).

**The probe to build:** for every card classified `native-trigger`, drive each descriptor through the RUNTIME
path (`buildTriggerStack` on a synthetic board with the source in play) and compare the verdict against
`triggerRoutesNatively`. Report every disagreement. ⚠️ **Do not call `triggerRoutesNatively` anywhere inside
the probe** — reusing it is how this becomes circular and reports a clean sweep it never earned.
Deliberately not started at the tail of this run: a half-right probe hands the next session false alarms,
which is worse than a known gap.

⭐ **WHAT THIS MEANS FOR THE NEXT SESSION.** The corpus tail is flat and the safe instruments are clean. The
remaining levers are all things deliberately deferred **for freshness, not for lack of scope**:
- **quoted-grant mana statics — 35 cards, fully designed and build-ready** ([[quoted-grant-statics-slice]]
  in the vault: parser shape, runtime plan, four named FP risks, gates, and the `manaTierPins` tripwire that
  already exists). Its own order defers it because it touches layers + mana model + legalChoices in one
  motion. **That is a FIRST-HOUR job, and it is the biggest single lever left.**
- **B1 layer-2 control** (28 cards) — high risk, early-or-never per the sequencing law.
- the cEDH wave for cdh, which Omnath's correction already ruled optional and non-blocking.

Do not open these at hour seven; do not spend hour one re-running the probes above.

## 🔒 SHIPPED — the EMPTY-STACK half of "Activate only as a sorcery" (`24349d75`) · 125 native cards

An **ignored restriction over-delivers**, which is the forbidden direction. The rider was stripped as
"already enforced" and that was PARTLY true — the generic gate holds own-turn + main step — but CR 602.5i
also demands an **empty stack**, so the engine offered sorcery-speed abilities **in response to a spell**.

⚠️ **THE GATE EXISTED AND ITS FLAG WAS NEVER SET.** `legalChoices` has always read
`ab.sorceryOnly && !canCastSorcerySpeed(...)`; `sorceryOnly` was only ever stamped by Level Up and one
graveyard-exile rider. **A gate whose flag nobody sets is the whitelist-drift shape a fifth time this run.**
When you find an unenforced restriction, grep for the flag before assuming the gate is missing — here the
gate was fine and the producer was the hole.

### ⚠️ AND THE CONTROL CORRECTED MY OWN WRITE-UP — worth more than the fix
I claimed the "own combat" case proved sorcery enforcement. It does not: **the generic lane offers activated
abilities ONLY at the main step, for EVERY ability**, restricted or not. That case was never evidence of
anything; the empty-stack case is the only one that is. Consequence, now named in the test: the engine
**under-offers instant-speed activations generally** (no pump in combat) — an FN, safe, out of scope, but
recorded so a green file is not mistaken for "activation timing is modelled".

Tier diff **GAINED 0 · LOST 0** — correct for a timing gate. Sweep 120/120.

## 🚨 SHIPPED — **SECOND SOFT-LOCK OF THE RUN: "a cost is not an effect"** (`b903119f`) · 34 spells

```
legalChoices:  const addCost = isHigh ? (program.additionalCosts || [])[0] : null;
dispatcher:    for (const ac of program?.additionalCosts || [])        ← UNCONDITIONAL, and must be
```
A spell whose **EFFECT** the parser cannot model but whose **COST** it can was emitted as a plain cast with
no victim frozen; the dispatcher then correctly refused to cast it cost-free and threw `ADDCOST_UNPAID`.
**Every one of the 34 corpus instants/sorceries in that class was a guaranteed wedge** — Eldritch Evolution,
Neoform, Tinker, Final Strike, Tormented Thoughts, Rite of Consumption, Scapegoat, Gaea's Balance …

⛔ **ENUMERATE, DON'T SUPPRESS.** Killing the wedge by not offering the cast trades a soft-lock for a **DEAD
CARD in hand** — the exact failure NEXT-QUEUE D2 exists to find, and worse than the coverage gap it hides
behind. The cost is now paid as printed; the unmodeled effect still routes to the Arbiter.

### ⚠️ THE SUITE STAYED GREEN THROUGH THE FIX — a hollow gate seen from the inside
12,234 tests and **not one cast an Arbiter-bound spell that had a cost to pay.** Found by the playability
sweep, not by a test. The new test pins the PREMISE too (Eldritch Evolution's effect does NOT parse, its
cost DOES) so a future slice that models the search **re-points this test instead of silently voiding its
coverage**. Seen to fail: restoring the `isHigh` gate fails 4 of 6.

### 🔧 THE SWEEP IS NOW DEBUGGABLE, WHICH IT WASN'T
A wedge reported by decision KIND plus a 90-char reason is enough to **count** wedges and not enough to
**fix** one — identifying the card cost a separate run. Added: `--only=N` (each game already seeded its own
rng + session, so game N was always reproducible in isolation; there was simply no way to ask for it), the
offending ACTION named in a throw's detail, and a full decision dump under `--only`.

**Playability sweep now 150/150, ZERO wedges.**

## 🔧 SHIPPED — the MISTFORM cycle, NEXT-QUEUE **B5 closed** (`d1e34e10`, +5)

Sized in the queue as "5 sole · the cheapest of the engine items" and it landed **exactly 5**. A layer-4
continuous effect with an endOfTurn duration, so tribal anthems / the subtype pump / chosen-type gates all
see the change with no knowledge the atom exists.

⛔ **"BECOMES" REPLACES; "IN ADDITION TO ITS OTHER TYPES" ADDS** — one phrase, and it is the entire
difference between Mistform Dreamer and Mistform Sliver. The new `setCreatureSubtypes` op carries the
printed subtypes it supersedes, snapshotted at RESOLUTION (CR 613.1d) so the effect never re-reads a type
line it is itself changing, and deletes exactly those — never the whole subtype set, which also holds
Equipment/Vehicle/land subtypes.

### ⭐ A POLICY IS NOT A FORMATTER — the rule this slice adds
`autoPickCreatureType` moved out of `resolvers.js` into **`choicePolicy.js`, a leaf that imports NOTHING**.
That is the only shape shareable across the runProgram cycle (`resolvers → runProgram → effectAtoms →
atoms/*`, so an atom can never import resolvers back), and this codebase's usual answer — a local mirror,
which it does three times over for `creatureSubtypesOf` — is **right for a pure formatter and wrong here**:
if *"which creature type does the engine pick"* exists twice, a later tune to one copy makes the sim choose
one type at an ETB and a different one at an activation, **on the same board, with every test green**. A
drift-guard test pins it. Rule of thumb going forward: **duplicate formatters freely, never duplicate a
decision.**

### ⚠️ AND THE DEGENERATE BOARD FOUND A DESIGN FLAW THE GOOD BOARDS COULDN'T
The activated caller passes the LIVE state, where the source is already on the battlefield — so a lone
Mistform Dreamer tallied one Illusion, picked Illusion, and **replaced Illusion with Illusion**. A legal
activation that does nothing whatsoever. Every two-Goblin case was green the entire time; only the
empty-board assertion showed it. Fixed with an explicit `excludePermanentId` on the shared policy rather
than a second heuristic. **Test the board with nothing on it — that is where a choice policy shows its
seams.**

## 🔧 SHIPPED — "other &lt;Subtype&gt;s you control get …" (`fc33087b`, +4) · **the purest axis of the run**

```
"other creatures you control get …"                     → HIGH   (excludeSource)
"<Subtype>s you control OTHER THAN THIS CREATURE get …" → HIGH   (subtypeFilter + excludeSource)
"other <Subtype>s you control get …"                    → was LOW
```
Both halves existed; only their **combination** was missing — and the missing one is **the word order every
carrier actually prints**. Nothing in the corpus prints the trailing form with a subtype. The engine
modelled the spelling no card uses and parked on the one all four use. GAINED **4**, which is every corpus
card of this shape (Hamlet Captain · Belle of the Brawl · Perimeter Sergeant · Heron's Grace Champion).

⚠️ **TWO SITES — the first fix looked complete and wasn't.** `splitClauses` keeps its own list of team-pump
shapes whose internal `" and gain …"` is not a clause boundary; it named `other creatures` and `<Subtype>s`
but not `other <Subtype>s`, so Heron's Grace Champion's sentence was TORN at the " and " while the identical
clause parsed perfectly when handed to the parser directly. **Fifth whitelist of this run. When a form spans
a splitter and a parser, teaching one of them is teaching neither.**

### ⭐⭐ THE TRANSFERABLE LESSON — **PROBE WITH THE CARD TEXT, NOT A RECONSTRUCTION OF IT**
I reached these 4 cards through **two wrong hypotheses**, each killed by measurement rather than argument:
1. *"subtype UNIONS are the gap"* (Valley Floodcaller's "Birds, Frogs, Otters, and Rats"; April O'Neil's
   "a Mutant, Ninja, or Turtle") — **wrong**: union ETB triggers are already native.
2. *"the subtype mass-pump SUBJECT is the gap"* — **wrong**: `Humans/Knights/Goblins/Dinosaurs you control
   get +N/+N` all parse today.

Worse, the swap-test I used to SIZE it (rewrite the clause to the generic form, re-classify) reported **3**
cards and named the right cards **for the wrong reason** — it proved only that *something* in that sentence
blocked, not what. Reading the printed oracle showed the real blocker was word order, and that it was 4.
**A synthesized probe string tests your model of the card; only the card tests the card.**

## 🎯 THE SHELF, MEASURED 2026-07-29 — **and the honest read on what is left**

Corpus **36.1%** (12,354/34,245) · aggregate **81%** (1,286/1,597 across 16 decks) · **colton 92%** (461/499,
5 decks) · joe 75% (825/1,098, 11 decks).

```
100% Slivers    96% Vihaan    93% Omnath    92% Zaxara    90% Mothman    90% Earth Bent
 81% cdh        80% Dragons   75% Jurassic  73% Believe   73% Kinnan     72% Kellan
 72% Wolverine  72% Hulk      68% Cap America           62% Halfshell heroes
```

⭐ **COLTON'S SHELF IS 4-OF-5 OVER THE BAR; `cdh` (Rograkh/Thrasios) at 81% is the only deck under it.**

⛔ **THIS WAS ALREADY CHARACTERIZED — see "🎯 cdh IS THE WHOLE PLAYABILITY GAP" further down this file.**
That section is the canonical one: it sweeps sole-blocker vs multi-blocker, and it records that cdh is
**arithmetically capped near ~82%** — a stronger and more useful statement than the one I re-derived here.
Read it instead of re-measuring. My independent pass reached the same conclusion by a different route (all
19 remaining slots sit on different subsystems — pay-or-lose, cipher, retargeting, alt-costs, an
opponent-searches-library event that does not exist), which is corroboration, not new information.

⚠️⚠️ **AND I GOT ONE THING WRONG BY NOT READING IT FIRST.** I wrote up Springleaf Drum / Gene Pollinator as
a **CAPABILITY** pin that "graduates once the mana planner can tap another creature". **The canonical
section already classifies them DELIBERATELY REFUSED — "Do not 'fix' these"** (phantom mana, the SHELF S7
audit; `manaCostModelable` names Springleaf Drum outright). A refusal is not a capability gap, and the
difference is the whole point of the three-kinds-of-pin taxonomy. **Treat them as REFUSED.** The resume
prompt says to read the REFUSED list before touching anything, and this is exactly what that instruction
is for — I asserted a graduation for a decision that had already been made. Corrected here rather than
quietly deleted, because the misclassification is the instructive part.

The one genuinely additive detail from my pass: **Halfshell heroes (62%) is an entire unmodeled SET** — 38
slots, nearly all TMNT-set bespoke — so the bottom of the shelf is not a soft tail either.

### ⭐ THE LEVERAGE HEAD, REGENERATED 2026-07-29 (unmodeled cards by DECK COUNT — start here)
```
×3  Wan Shi Tong, Librarian · Teferi's Protection · Mindbreak Trap · Level Up · Herd Heirloom
×2  Veil of Summer · Valley Floodcaller · The Ozolith · The One Ring · The Cabbage Merchant
    Thassa's Oracle · Tezzeret the Seeker · Strength of Will · Springleaf Drum · Rhythm of the Wild
    Neyith of the Dire Hunt · Monster Manual · Mjölnir · Misdirection · Mana Drain · Lizard Blades
    Jeska's Will
```
Regenerate any time with `node app/scripts/deck-gap.mjs` (no filter = every deck) piped through a
name-frequency count. **Rhythm of the Wild's blocker is RIOT** (its "creature spells you control can't be
countered" half is already native) — riot needs the keyword AND an enters-with-a-CHOICE replacement, so it
is a small wave, not a one-liner.

### ⛔ A VERIFIED DEAD END — **do not build the `nontoken` grant subject.** It flips ZERO cards.
It looks like a perfect axis and it is not. The group keyword-grant selector already carries a token filter
(`Creature tokens you control have haste` → `selector.token = true`) and its complement is simply unparsed —
textbook "capability on one arm, absent on its neighbour". But **all 4 corpus carriers grant something the
engine cannot model anyway**: Rhythm of the Wild + Uncivil Unrest grant *riot*, Cayth grants *fabricate 1*,
Ghired grants a quoted activated ability. The subject was never the blocker on any of them.

⚠️ **AND IT WOULD HAVE SILENTLY DONE NOTHING EVEN THEN**: layers.js:902 reads
`if (selector.token && !candidate.card?.token) return false` — `token: false` is falsy, so a nontoken
selector would be IGNORED and the grant would hit every creature. The over-fire direction, invisible to a
descriptor probe. Whitelist drift's twin: emitting a field the reader doesn't check.

### 🔧 NEW TOOL — `app/scripts/deck-gap.mjs`
```
MTG_APP_ROOT=<root> node app/scripts/deck-gap.mjs <deck-name-substring>
```
Per-CARD gap list for a deck: tier + mechanism bucket, **sorted so same-blocker cards sit adjacent** (two
cards on one clause is what makes a slice worth building). `measure-coverage` only ever gave a percentage
plus three-card samples of the biggest global buckets, so every shelf session was re-deriving this by hand.
Qty-weighted against the same denominator — verified to reproduce 92/81/62 exactly for Zaxara/cdh/Halfshell.
⚠️ Its first draft counted distinct ROWS instead of slots and *still* printed the right numbers, because no
unmodeled card in those decks is duplicated. Coincidence is not agreement; the check was to run all three.

## ⚠️⚠️ RETRACTION #2 ON AURELIA — **"soft-lock" IS NOT SUPPORTED. The OVER-FIRE is.**

Read this before the section below, which is written in the framing I am now withdrawing.

**WHAT IS VERIFIED, and it is still a real bug worth the fix:** Aurelia's descriptor carried no
once-per-turn latch, so her trigger **re-fired on a second attack in the same turn** — more combats than the
card prints. `firstTimeEachTurnTrigger.test.js` proves it seen-to-fail (revert the fix, 3 tests fail). The
fix and its tier diff stand.

⛔ **WHAT IS NOT VERIFIED: that it produced a non-terminating turn in play.** I asserted that repeatedly —
"loops the turn forever", "the run's worst bug", "a soft-lock" — and **every attempt to demonstrate it
unrigged failed**:
```
latch re-broken · 20 Aurelias · payable mana base   → 12/12 complete, max 45 decisions/turn
decisions-per-turn cap of 600 (12× the measured 50) → never fired
combats-per-turn counter                            → 0 observed (beginning-of-combat has no decision point)
```
And the one result that looked like proof — *"40 extra combats, 200-step guard exhausted"* — came from a
harness **where I re-injected the attacker every iteration** instead of letting the engine choose. A rigged
positive is not evidence. I built the claim on it anyway, and then built a queue item and a COMMS message on
top of that.

⭐ **THE HONEST STATEMENT: an over-fire, of unknown termination consequence.** Fixing it was right. Calling
it the run's worst bug was an inference I never earned, and Omnath has filed it as C-gate evidence in
[[project_1v0_scope_checklist]] specifically for the soft-lock framing — flagged to him for revision.

⚠️ **FIVE harness artifacts in one day, and this is the one that cost most.** The others produced ghosts I
caught; this produced a *positive* I believed. **A rigged harness is more dangerous than an insufficient one
— an insufficient harness reports nothing and you go looking, a rigged one reports what you expected.**
Standing rule for this seat, now twice-earned: *before believing a result, ask what the harness supplied that
the engine should have decided.*

## 🚨 SHIPPED — the Aurelia OVER-FIRE (`720ede1f`, +4) · framing retracted above

**Aurelia, the Warleader was native and looping the turn forever.** Her descriptor read
`oncePerTurnTrigger: false` on a card whose text says *"attacks FOR THE FIRST TIME EACH TURN"*. The latch
was stamped ONLY from the trailing sentence *"This ability triggers only once each turn."*; the same
limiter baked into the EVENT WORDING was silently ignored. Fire-every-attack + her own extra-combat grant =
attack, untap, queue a combat, attack again, queue another. Forever.

⭐⭐ **THE LESSON IS WHERE IT HID.** The extra-combat mechanism has a dedicated non-termination test that
proves ONE grant drains. The trigger detector has tests that prove the latch works. **Neither could see
that the grant could be RE-ISSUED** — the loop lived in the join between them. That is the **third** time
this run a bug survived in the seam between two individually-tested halves (stun matcher ↔ splitter; tutor
destination ↔ whitelist; now trigger latch ↔ phase queue). **When two subsystems compose into a LOOP,
the loop is a third thing and needs its own assertion.**

The fix is vocabulary, not mechanism — the latch has existed since Mirelurk Queen. One match, one strip,
then the existing `|| !!cls.oncePerTurnTrigger` carries it. GAINED **4** · LOST 0 — Vanguard Seraph ·
**Raphael, Tag Team Tough** (needed BOTH this and the wording widen below) · Angelic Cub · Cleric of
Life's Bond. Each read back descriptor-first before being counted.

⛔ **SUBJECT GATE — the latch key is `otpt_<permanentId>_<event>`, so it can only express a window owned by
the SOURCE or its CONTROLLER.** *"Whenever an opponent loses life for the first time each turn"* gives each
opponent their own first time; one shared per-source latch would suppress the second opponent's — an
under-fire. Those keep parking. Every corpus carrier of this wording is self- or you-subject (censused
2026-07-29: 45 cards). **The 12-card Valiant cluster is the next axis** — it parks on its *narrower*
`"a spell or ability YOU CONTROL"` event, not on the qualifier.

### ⚠️⚠️ TOOLING LAW — **A SURVIVED MUTANT AND A NO-OP PATCH LOOK IDENTICAL**
M123/M124 first reported SURVIVED. They had never applied. **`\\b` written through a Python heredoc
collapses to `\b`, which Python reads as 0x08 BACKSPACE** — the search string contained a control character
and `str.replace` silently no-opped. This is the same trap that cost time earlier in the run, in a new
disguise. **Every mutation script must `assert old in s` before writing** (or use a raw `r'...'` literal, or
the Edit tool). The header's existing `grep -c MUTANT` warning covers marker mutations; this covers
substitutions.

### ⭐ AND WHEN A MUTANT REALLY DOES SURVIVE, THE SURVIVOR IS THE FINDING
M124 (drop the trailing `$`) survived legitimately at first. Reading *why* was the whole value: without the
anchor the match becomes greedy-prefix and **TRUNCATES** *"for the first time during each of your turns"*
to a bare condition, which detects as `{ whose:"any", oncePerTurnTrigger:false }` — an over-fire on **both**
axes. The pin was asserting the wrong thing (an absent event rather than the full descriptor). It also
exposed a redundant-guard smell: a test-then-replace pair is one anchor written twice, and a mutation
dropping either half survives on the other. Collapsed to a single match with a capture.

**A PIN GRADUATED AND WAS RE-POINTED, NOT DELETED.** `trigLifegain`'s *"does NOT detect a conditional
'first time each turn'"* was a **CAPABILITY** pin — it graduates on a runtime proof. It now asserts
detection **with the latch** (detection without it is the over-fire), and its opponent-subject half is
pinned in its place. The three-kinds-of-pin taxonomy held.

## 🔧 SHIPPED — VALIANT, the "…a spell or ability YOU CONTROL" narrowing (`45e91001`, +5)

Predicted as the next axis one slice earlier and it held: the `becomesTarget` event was built, the
once-per-turn latch had just landed, and **the only missing piece was the narrowing — which is the whole
card.** Valiant exists so YOUR pump spell grows the mouse and an OPPONENT'S removal does not; firing on any
targeter would hand all 13 carriers a trigger off every opposing Shock. The gate lives at the FIRING SITE
(only the runtime knows who cast the spell) and DROPS the flagged trigger rather than skipping the scan, so
unnarrowed watchers on the same permanent still fire — pinned by a control keeping Phantasmal Bear
sacrificing itself to anyone's spell. Also strips `Valiant —` as a CR 207.2c label; without it the
boundary-anchored regex never sees the "Whenever" and the card detects NOTHING.

GAINED **5** of 13 (Mouse Trapper · Emberheart Challenger · Nettle Guard · Whiskerquill Scribe · Seedglaive
Mentor); the rest hold a second unmodeled ability. Each gained payoff was read back to a real ATOM, not to
a HIGH confidence.

⚠️ **WHITELIST DRIFT — FOURTH OF THIS RUN, and the warning was written directly above the line I missed.**
`detectTriggers`' descriptor build is an explicit allowlist whose own comment says an unlisted field is
silently dropped and becomes an over-fire. It happened anyway: the arm returned `targeterIsController`, the
descriptor did not carry it, every probe looked perfect. **Whenever a new descriptor field is introduced,
grep that allowlist before testing anything.** (Running tally: trigger descriptor · tutor destination ×3 ·
stun count ×2 · this one.)

## 🔧 SHIPPED — attacking-only mass untap + the Raphael wording (`ef54c6a2`, +1)

Third scope on the same untap resolver: `scope: "attacking"` filters by membership in the live
`state.combat.attackers` set instead of a type line. Outside combat it untaps **nothing** — never a
fallback to "all creatures", which would untap the whole board off a card that promised only the attackers.
Plus a one-word widen: *"after this COMBAT phase"* is the same insertion point as *"after this phase"*
(Raphael is the only printing), kept as a **separate alternative** so the after-MAIN form can never be
reached by widening — M120 over-widens it and dies.

GAINED **1** — Hellkite Charger #2125. ⚠️ **6 cards carry the clause; 5 hold a second blocker of their own.**
Its whole clause rides an optional-mana-payment, so the **seam got its own block**: PAY taps seven lands,
untaps the attacker, queues the combat; DECLINE spends nothing and queues nothing — the free-attack FP this
would be if the cost were cosmetic.

## 🔧 SHIPPED — mass untap of your OWN creatures (`c5697dc8`, +8) · **a THIRD kind of pin**

The untap resolver always did a greedy mass untap with an `all`/up-to-N cap — scoped to LANDS by **one
hardcoded type-line check**. The same resolver plays the creature form with `scope: "creature"`.
GAINED **8** · LOST 0 — To Arms! · Vitalize · Mobilize · Roar of the Kha · Ready // Willing · Thoughtweft
Gambit · Village Bell-Ringer · Veteran Beastrider.

⚠️ **HONEST SCOPE NOTE, because the clause count flatters it:** 43 cards carry the clause and the big names
— **Aggravated Assault #699 · Aurelia #820 · Moraug #995 · Great Train Heist #1118** — do **NOT** flip.
Every one pairs the untap with an *"additional combat phase"* rider that is its own blocker. Aggravated
Assault is pinned parked so the number cannot be misread later.

⛔ **"Untap all creatures" WITHOUT "you control" is deliberately not this atom** — that untaps opponents'
blockers, a real downside and a different card. M112 admits it and is killed.

### ⭐ A THIRD KIND OF PIN — the MOVING BOUNDARY MARKER

The capability/judgement split now has a third member, and it is the subtlest:
```
CAPABILITY  "isn't modeled"                    → graduate on a runtime proof
JUDGEMENT   "cheat" · "landmine"               → do NOT graduate; the pins are the decision
BOUNDARY    "an UNMODELED <x> stays Arbiter"   → RE-POINT it; the pin is about the BOUNDARY, not the x
```
`auraGrantedActivated.test.js` failed here, and **its own comment showed it had already been re-pointed
once**: `"{5}: Untap this creature."` sat there until UT-1 modelled the self-untap, then the mass form
replaced it — and I have now modelled that too. So it moves again rather than flipping.

**⭐ AND ITS SUCCESSOR WAS CHOSEN TO BE STABLE:** the SYMMETRIC mass untap is unmodelled **by design**
(it untaps opponents' blockers) rather than by omission — so it will not quietly graduate out from under
that test the way the previous two examples did. *When you re-point a boundary marker, pick an example that
is refused on purpose, not merely unbuilt yet.*

## 🔧 SHIPPED — SYMBURN-2, "damage to each player" (`8cafbc48`, +6) · **the pin-wording rule, applied**

The lead I recorded rather than built last stretch — and **the pin's wording is exactly why it graduated.**
```
symburn.test.js      "each-player-only isn't modeled"        → CAPABILITY  ("cannot")  → GRADUATES
the fetch guard      "cheat" · "landmine" ×9 across 7 files  → JUDGEMENT   ("will not") → REVERTED
```
And the proof was already sitting there: `eachCreatureAndPlayer` **has always damaged every player INCLUDING
the caster.** "each player" alone is a strict SUBSET of behaviour the engine performs today — the same seat
loop, minus the creatures. SYMBURN-1 just drew its scope at the combined form.

GAINED **6** · LOST 0 — Flame Rift · Slagstorm · Spear Spewer · Rumbling Slum · Xenagos's Strike ·
Shadowheart.

**⛔ THE CASTABILITY ASSERTION IS THE ONE THAT MATTERS**, and `targetTypes.js`'s own header says why: when
SYMBURN-1 added its type to only **2 of the 5** places that needed it, the cards **classified native and
were SILENTLY UNCASTABLE** — the cast flow treated the mass effect as targeted, found no legal target, and
dropped the action. **A tier assertion shows green straight through that bug.** So the type went into
`targetTypes.js` (the single source of truth built after exactly that incident) and the test casts Flame
Rift for real: offered as a legal action, both players to 4 less life *including the caster*, and an
opposing Bear left at **zero damage**.

That last control is what separates it from the combined form — without it `eachPlayer` could quietly
resolve as `eachCreatureAndPlayer` and every other assertion would still pass. **M110** is killed by it
alone.

Mutation-checked: **M109** drop from the non-chosen registry → killed by 4 (incl. castability) · **M110**
resolver also damages creatures → killed by the control.

## 🔧 SHIPPED — the STUN rider parses its COUNT (`596326fe`, +4) · probe families extended

The probe's new **counter-placement** family found it. The runtime has had full stun support all along —
`untapOrConsumeStun` implements CR 122.1c exactly, and `applyTapEffect` already passed
`amount: atom.stunCounter` to `addCounter`. **Only the text said "a".** GAINED 4 — Freeze in Place ·
Tranquilize · Impede Momentum · Collector's Case.

**⚠️ THE COUNT LIVED IN TWO PLACES, AND WIDENING ONE DID NOTHING.** I widened the matcher first and **no
card moved** — `splitClauses`' fold rule was *also* anchored on `"a stun counter"`, so the multi-count
sentence had already been torn into `["Tap target creature…", "put three stun counters on it"]`, where the
pronoun has nothing to bind to. **The matcher never saw the whole sentence.** Same shape as the tutor
destination's three whitelists. **M108** (splitter anchor back to singular) is killed by **7 of 9** tests —
it was the load-bearing half, not the matcher.

### 📋 TWO LEADS RECORDED, NOT BUILT — and the distinction now has a test

⭐ **"deals N damage to EACH PLAYER"** — 24 corpus cards, ALL non-native (Flame Rift #3920, Slagstorm #7292,
Spear Spewer, Mana Clash). `each OPPONENT` parses and the compound `each creature and each player` parses;
only the bare form fails. `symburn.test.js` pins it: *"each-player-only isn't modeled"*.
**⭐ THAT IS CAPABILITY LANGUAGE ("cannot"), NOT REFUSAL LANGUAGE ("will not")** — so unlike the
battlefield-fetch guard I reverted last stretch (*"cheat"*, *"landmine"*, nine pins), this one is a genuine
graduate-able lead. **Read the pin's WORDS, not just its existence.**

- named-counter placement is per-kind — shield has a bespoke two-string atom, stun rides the tap atom, and
  `"put a stun counter on target creature"` (no tap) still parks. A general named-counter placement
  vocabulary is its own slice.

## ⛔ ATTEMPTED AND REVERTED — the non-land fetch-to-battlefield. **NINE PINS SAY NO.**

I built the 11-row probe lead (uncapped battlefield tutor accepts only lands; its MV-capped twin `bfn`
accepts every permanent type) and **reverted it.** Recording the whole thing because the reasoning was
sound and the conclusion was still wrong — that combination is worth more than the slice would have been.

**THE ARGUMENT FOR BUILDING IT, which I still think is factually correct:**
- `bfn` (MV-capped) already puts ANY permanent type onto the battlefield — measured, not assumed.
- Resolving its creature form against a real library **lands the creature**. The machinery works.
- A 3-MV creature entering is the identical code path to a 9-MV creature entering. **A mana-value cap
  cannot be what makes a zone change legal.**
- The guard's originating commit (`93433dca`, the RAMP-TYPED land slice) uses **scope-boundary language** —
  a non-land "cheat-into-play (Natural Order)" stays *"OUT OF SCOPE"*.

**WHY IT IS REVERTED ANYWAY — the suite answered, nine times:**
```
7 test files · 9 assertions, written at different times, all independently pinning the same thing:
  "the non-land battlefield CHEAT still stays LOW → Arbiter"      ramp.test.js  (×2)
  "CREED landmines stay LOW → Arbiter"                            tutorToBattlefieldX.test.js
  "landmines remain arbiter-spell (Natural Order color-sac …)"    naturalOrder-adjacent
  "Dragonstorm (tutor-to-battlefield, LOW body) is NOT native"    storm.test.js
  … plus coverage.test.js, gyRecursion-adjacent, and the probe's own witness
```
**"Cheat" and "landmine" are the vocabulary of a deliberate CREED refusal, not of an absent capability.**
One comment reading as a scope boundary is ambiguous; **nine assertions across seven files is a record of a
decision that was made and re-affirmed.** The standing rule is explicit — *do not restart settled refusals
blind*, and Omnath's note adds the reason: rediscovering one is the most expensive kind of wasted session
*because it feels like progress.*

⭐ **THE LESSON, and it sharpens "verify before graduating":** a failing pin is evidence, and **the evidence
can be against you.** I have graduated six pins this run by proving the runtime does the thing. Here the
runtime *does* do the thing — and the pins still win, because they are recording a JUDGEMENT about what the
engine should offer, not a claim about what it can execute. **Distinguish a pin that says "we cannot" from a
pin that says "we will not."** Only the first kind graduates on a runtime proof.

**❓ FOR A WAKING SESSION (Colton's call, not mine):** ~63 cards sit behind this — Birthing Pod #2008, Whir
of Invention #1308, Tezzeret #1688, Kuldotha Forgemaster #2694, Godo #3193, Academy Rector, Arena Rector.
The question is not "does it work" (it does) but **"is an uncapped non-land fetch-to-battlefield something
this engine should offer?"** If yes, the nine pins get updated together, deliberately, in one slice.

## 🔭 SHIPPED — `probe-vocabulary-asymmetry.mjs` (`55a64210`): the axis pattern is now an INSTRUMENT

Three slices found the same way is a pattern; four would be a waste of a pattern. This diffs twin clause
templates that differ in **one dimension** and reports any word one arm can say and its neighbour cannot.
**Hermetic (parser only, no card index) — it runs anywhere, and its coverage witness lives in CI.**

**FIRST RUN — 17 rows across four families. Reading them is the whole skill:**

| rows | family | verdict |
|---|---|---|
| **11** | uncapped battlefield TUTOR accepts `land`/`basic land`/`permanent` but **not** `creature`/`artifact`/`enchantment` — its MV-capped twin accepts all | ⛔ **ATTEMPTED AND REVERTED** — see the section above. **Nine pins across seven files** call it a "cheat"/"landmine". Settled refusal, not an absent capability. |
| 3 | instant/sorcery → battlefield | ✅ **RULES-CORRECT** (CR 110.4a). The probe working as designed. |
| 3 | bounce vs destroy/exile on planeswalker + 2 unions | Measured: worth **2 cards**. Not a slice. |
| 0 | cardinality (single vs up-to-N) | clean |

**❓ THE OPEN QUESTION, for a session with more room than 5am:** `bfn` (MV-capped) already puts ANY
permanent type onto the battlefield, so the runtime demonstrably handles it. The guard's stated rationale —
*"the fetch can never cheat an uncapped permanent into play"* — reads as a **power-level** argument rather
than a correctness one, and a card's printed text is not a power-level question. **Resolve the rationale
before touching it**; if it is genuinely power-level, the guard is wrong and 63 cards are waiting.

**⛔ A CORRECTION I MADE MID-SIZING, worth more than the rows:** I read a corpus tally of 19 `"nonland
permanent"` bounce cards as though it were one of the probe's rows. **It was not** — that noun parses fine
for bounce, the probe never flagged it, and those cards are non-native for other reasons. *The probe's rows
are the claim; a similar-looking count measured beside them is not.*

**The witness ships with it.** The hollow-gate law: an instrument that reports zero is worthless unless
proven able to report non-zero — a probe whose templates silently stopped parsing would print *"no
asymmetry"* forever and read as good news. `vocabularyAsymmetry.test.js` pins **both** directions.

## 🔧 SHIPPED — bare-REANIMATE filter vocabulary (`a061bc55`, **+13** — the biggest of the axis slices)

**The asymmetry was INSIDE ONE FUNCTION, fifteen lines apart:**
```
"return target <X> card WITH MANA VALUE N OR LESS from your graveyard to the battlefield"
      → any permanent-compatible filter, via parseGraveyardFilter + isPermanentReanimateFilter
"return target <X> card from your graveyard to the battlefield"
      → hardcoded CREATURE
```
Same clause family, same destination, same file. **~50 corpus cards parked on a filter the file could
already parse one branch away.** GAINED **13** · LOST 0 — Sharuum · Refurbish · Obzedat's Aid · Trash for
Treasure · Argivian Restoration · Profound Journey · Silent Sentinel · Ghen · Archon of Falling Stars ·
Erinis · Quarry Beetle · Protomatter Powder · Harnessed Snubhorn.

**⛔ `isPermanentReanimateFilter` IS WHAT MAKES THE WIDENING LEGAL** — a card entering the battlefield must
BE a permanent, so an instant/sorcery filter, **or the unfiltered "any card" which INCLUDES instants**, must
never reach the atom. A sorcery on the battlefield is not a legal state and nothing downstream would catch
it. Pinned four ways.

**⭐ VERIFIED ON A BOARD BEFORE GRADUATING THE PIN — second slice running, and it is now the habit.**
`gyRecursion.test.js` pinned *"non-creature reanimation → Arbiter"*. Before flipping it I resolved the atom
against a graveyard holding a **Sol Ring and a Lightning Bolt**: the Sol Ring lands, the Bolt stays. The
runtime reanimator is genuinely type-agnostic, so the credit is honest.

Deliberate safe FNs: subtype / negation / intersection filters ("Rebel permanent", "nonland permanent",
"legendary creature") still park, and the `tapped` rider still parks on the `$` anchor — which is why the
flip count is smaller than the raw corpus tally. The creature form keeps its **pinned string** `cardFilter`
shape so existing consumers are untouched (mutation-checked).

Mutation-checked: **M103** drop the permanent guard → killed by 2 · **M104** let creature lose its pinned
shape → killed.

## 🔧 SHIPPED — tutor FILTER vocabulary (`ae1cfc49`, **+6**) · the SAME shape as the destination slice

The graveyard slice ended on the pin *"a destination landing does not widen the search vocabulary."* This is
that other axis — and it was the same shape twice over: **both gates already existed in
`cardMatchesTutorFilter`; only the PARSE was missing.** `filter.permanentOnly` (built for Wargate),
`filter.colors` (built for Green Sun's Zenith).

GAINED **6** · LOST 0: Merchant Scroll · Bond of Flourishing · Planar Bridge · Beastrider Vanguard ·
Trail of Crumbs · **Tezzeret, Artifice Master** (playable-pw → native-planeswalker).

**⛔ WHY COLORS MUST NOT BECOME GROUP WORDS.** A group word is matched by `<word>` **containment against
the TYPE LINE**. No type line contains "green" — admitting it to `TUTOR_FILTER_WORDS` would make the tutor
classify native, **find nothing, ever**, and *the tier would never show it because the card was already
counted*. The vacuous-subtype-filter FP class, exactly. Colors route to `filter.colors`.

**⛔ A COLOR UNION PARKS.** The color loop is an **AND**; printed text means **OR**. Emitting both would
demand a card be BOTH — narrower than printed. Kaito parks rather than silently under-delivering.

**⭐ THE GRADUATED PIN WAS VERIFIED BEFORE FLIPPING, NOT AFTER — and this is the transferable bit.**
`permanentOnly` emits `groups: []`, and **an empty group list matches EVERY card.** If the impulse-dig path
had ignored the flag, Beastrider Vanguard would have gone native while offering *any* card — wider than
printed, and invisible to the tier diff. Resolved against a real library (Sol Ring / Lightning Bolt / Bear),
the dig offers the artifact and the creature and **not** the instant. *When a new filter can be satisfied
vacuously, prove it discriminates on a board before you let a pin graduate.*

Honest about reach: **Natural Order and Summoner's Pact do NOT flip** — additional-cost and pact riders are
separate blockers. The filter lands; those cards do not, and a pin says so.

Mutation-checked: **M100** union-as-AND → killed · **M101** parse the color but never apply it → killed by 3 ·
**M102** consume "permanent" without setting the gate → killed by 5.

⭐ **THE PATTERN THIS STRETCH ESTABLISHED, worth reusing:** two slices in a row landed by finding a subsystem
where **the machinery was already built and only the vocabulary was absent** — first the graveyard
DESTINATION, then the permanent/color FILTERS. Both were found by sizing an *axis* of an existing system
rather than a card. **Ask what dimensions a working subsystem already supports, and which of them nothing
can currently say.**

⭐ **THREE FOR THREE NOW** (destination → tutor filters → reanimate filters, +6/+6/+13). The sharpest
variant: **the same capability present on one arm of a function and absent on its neighbour.** When a
matcher has an MV-capped twin, a triggered twin, or an "up to N" twin, **diff their vocabularies** — that is
where this keeps hiding.

## 🔧 SHIPPED — tutor-to-GRAVEYARD (`904d4304`, **+6** incl. **Entomb #328** and **Buried Alive #371**)

**17 corpus cards, not one modelled, for a single reason:** the tutor had hand / battlefield / top
destinations and **no graveyard**. The search itself was already right — this is a DESTINATION, not a
mechanic. Parser arms mirror the fetch-to-hand ones; the settler runs the SAME `moveCardToZone` with a
different `toZone`, so the CR 701.19e shuffle, the multi-pick chain and the auto-pick filter are untouched.

GAINED **6** · LOST 0: Entomb (328) · Buried Alive (371) · Goblin Engineer (1172) · Vile Entomber (1887) ·
Corpse Connoisseur · **Disciples of Gix** (unpredicted, verified as the same shape).

**⚠️ THE DESTINATION HAD TO BE NAMED IN THREE SEPARATE WHITELISTS, AND MISSING ANY ONE FAILED SILENTLY INTO
THE HAND.** The parser emitted `"graveyard"` correctly and the settler understood it — and the card still
landed in the **hand**, because `applyTutor`'s ternary and `setPendingTutorChoice`'s `coerce()` each drop an
unlisted destination to `"hand"`. **Every layer looked right in isolation.**
```
effects/atoms/library.js   the parser arm emits    destination: "graveyard"
effects/atoms/library.js   applyTutor WHITELISTS it onto the pendingChoice   ← silently drops unlisted
pendingChoice.js           coerce() re-whitelists it                          ← silently drops unlisted
effects/runProgram.js      the settler picks the toZone
```
Same silently-dropped-field shape as the trigger descriptor whitelist from the Esper slice, in a different
subsystem. **The parse test passed the whole time — the RUNTIME assertion is what caught it.** All three
sites are now commented as a set that moves together, and each is separately mutation-checked (M97/M98/M99,
all killed), so none is decorative.

⛔ **Unmarked Grave stays PARKED** — its `"nonlegendary card"` filter is not in `parseTutorFilter`'s
vocabulary. **A destination landing does not widen the search vocabulary**, and that pin is what proves it.

*The auto-pick takes the highest mana value — correct here (a reanimator wants the fattest body) but only by
coincidence with the fetch-to-hand heuristic, so it is asserted rather than assumed.*

## 🧭 LEAD SWEEP — EIGHT SIZED, EIGHT CLOSED. The cheap work is out in the TOP-1000 too, not just the shelf.

This stretch shipped no slice, on purpose: I sized eight candidate levers and **none is slice-sized**. That
is the finding. Recorded here so the next session does not re-derive any of them.

| lead | reach | verdict |
|---|---|---|
| **reconfigure** (CR 702.151) | 20 corpus, ALL non-native | **SOLE blocker on 2**, neither on the shelf. The other 18 each carry their own equipment-grant blocker. Not a lever. |
| the **33 remaining "if you cast it"** cards | 33 | Each is its own distinct effect (protection-from-everything, mass sac+reanimate, Aura tutor…). **No repeated second blocker.** The rider vein is worked out. |
| **temporary clone** ("becomes a copy … until end of turn") | 34 corpus, **SOLE on 9** | ⭐ **THE BEST ONE — and it is a WAVE.** See the scoping below. |
| **d20 roll** | 54 corpus | Randomness in a deterministic engine + a per-card outcome table each. Wave, and a design call. |
| **ascend** (CR 702.131) | 32 corpus, 29 non-native | **SOLE on 1** (Radiant Destiny). A co-blocker, not a lever. |
| **spree** | 21 corpus, all non-native | **SOLE on 0.** Pure co-blocker. |
| total-toughness threshold | 2 | Betor (Dragons) + one. Nested triple-conditional; not worth its own machinery yet. |
| miracle-grant-to-hand · life-cost spell tax | 2 · 1 | Lorehold; Terror of the Peaks (rank **517**, shelf) needs TWO new concepts — a life-denominated cost channel AND a target-dependent tax — for one card. |

⚠️ **THE PROBE LESSON, CONFIRMED AGAIN.** `probe-top2500-blockers --maxRank=1000` ranked Spree 8× and Class
levels 7× at the top. Both are **co-blocking lines counted once per card**, so the ranking overstates them —
exactly what the ledger already records about sentence-spread probes. **The sole-blocker test is the only one
that sizes a lever.** Run it before believing any spread ranking.

## 🌊 SCOPED WAVE (start here cold) — LAYER-1 COPY, CR 707.9 temporary copies

**Worth 9 cards where it is the SOLE blocker, and two of them are DRAGONS shelf cards** — Sarkhan, Soul
Aflame (2053) and Scion of the Ur-Dragon (5861), so this alone is **Dragons 80% → 82%**. 32 non-native
corpus cards carry the shape, so more follow as their other blockers clear.

**MOST OF THE INFRASTRUCTURE ALREADY EXISTS — this is smaller than "a new layer" sounds:**
```
addContinuousEffect(state, descriptor)   layers.js ~1807 — mints ceff-<idSeq>, stamps CR 613.7b timestamp
duration: { kind: ... }                  already on every effect record; cleanup drops expired (CR 514.2/500.4, ~1841)
copiableValues: null                     layers.js 1112/1264/1285 — the field is ALREADY RESERVED "for CR 707"
```
**The actual gap is one thing: the derive pipeline never APPLIES a copy.** A layer-1 effect must replace the
permanent's base characteristics with the copied card's copiable values BEFORE layers 2–7 run, so counters and
anthems then apply on top of the new base (CR 613.1a).

**Increment plan — each independently shippable:**
1. ✅ **SHIPPED (`9e893b8a`)** — the layer exists and works. `{ layer: 1, op: "copy", copiableCard, affects,
   duration }`; the derive substitutes the copied card ahead of the printed-value readers and layers 4–7 are
   untouched. **Tier diff GAINED 0 — correct for infrastructure, and evidence the derive change is
   behaviour-preserving on every board with no copy effect.** Counters survive (CR 707.2 — they are on the
   PERMANENT, not the card); latest timestamp wins (CR 613.7b). **No card credited yet, deliberately.**
   ⚠️ Two fixture traps found the hard way and worth knowing: `effectAffects` wants
   `affects: { mode: "self", permanentId }` (not a `{kind,id}` shape), and **`createPermanent` DROPS
   `counters` from its opts bag** — set it on the built permanent or the counters test passes for the wrong
   reason.
2a. ✅ **SHIPPED (`755bc0dd`)** — the SHARED rider vocabulary: pronoun generality (`his name is` / `he's 4/4`
   / `he has flying` normalized once, ahead of every arm) + the **keep-name rider**. GAINED 1 (Chameleon,
   Master of Disguise, rank 2189).
   ⛔ **THE CANONICAL RIDER IS THE ELIDED ONE** — `parseCloneSpec` replaces the card's own name with `~`
   BEFORE splitting riders, so printed text arrives as `"its name is ~"`. My first arm returned the literal
   and would have stamped a copy with the name `"~"`. A pin caught it.
   ⛔ **AND I REVERTED AN ARM THE PINS PROVED WRONG.** I made *"it's legendary in addition to its other
   types"* a no-op because the engine does not enforce the legend rule (CR 704.5j). **`clone.test.js`
   failed and it was right — the legend rule is not the point.** LEGENDARY-MATTERS effects are real here
   (Bard Class taxes "Legendary spells"; anthems scope on the supertype), so a copy that should BE legendary
   and is not would be credited native with a real modification dropped. Proper fix = prepend the supertype
   to the copy's type line (as `addCardType` does, further left). **Consequence, recorded: Sarkhan, Soul
   Aflame stays parked, so this wave is worth ONE Dragons shelf card (Scion), not two.**
   ⚠️ **TOOLING: a Python heredoc turned `` into a real BACKSPACE (0x08) inside three regexes.**
   `JSON.stringify` renders 0x08 as ``, so the file *looked* right and the regexes silently never
   matched. Same class as the recorded `node -e` trap. **Use Edit for anything with regex escapes**, and
   grep for stray control chars after any scripted write.

2b. ✅ **SHIPPED (`d01089f5`)** — the `become-copy` atom + resolver, for the **targeted SELF** form. Snapshots
   at resolution (CR 707.2), stores ONE layer-1 effect with an `endOfTurn` duration; riders reuse
   `parseCloneRider` and the snapshot reuses `snapshotCopiedCard`, so the two copy paths cannot drift.
   **GAINED 1** (Impossible Man). Board assertions, not tier assertions, are the substance.
   ⛔ **CORRECTION (`8991361a`) — I called Tilonalli's "a one-line follow-up" and that was WRONG.**
   `atomTargetIntent` already defaults to `ambiguous`, so become-copy on a TRIGGER was routing to the
   Arbiter correctly all along: **a safe FN, not a gap.** The decision is now stated explicitly (following
   the bare `suspect` precedent) and pinned. **Why ambiguous is right:** a copy's value is the QUALITY of
   the body, not whose it is — copying an opponent's fattest attacker is the classic line and copying your
   own is equally common, so no side is provable from the atom.
   ⛔ **DO NOT declare a side to "fix" it.** Tilonalli's LOOKS own-side (during your own attack every
   attacker is yours), but that is a property of its ATTACKING restriction, which the atom does not carry —
   the noun map flattens it to `"creature"`. Own-side here would **mis-target every other member of the
   family**. The honest route is a distinct attacking-creature targetType, a real build for one rank-22835
   card. *A parked card is not automatically a gap; check whether the gate is doing its job first.*

3. Remaining, all BINDING problems rather than copy problems: `snapshotCopiedCard` (cloneCopy.js) already
   produces the copiable card — **reuse it, do not write a second snapshotter**, or the two drift.
3. The two Dragons cards' own riders (Sarkhan: "except its name is Sarkhan… and it's still a Planeswalker";
   Scion: tutor-to-graveyard then copy that card).

⛔ **DO NOT tier-credit any of the 9 until the runtime assertion passes.** A copy effect that classifies
native while the permanent's characteristics never change is precisely the ATTACHED-UNBLOCKABLE revert
recorded in the BLOCKED list — GAINED 4 · LOST 0 and still wrong. **Ask the board, not the diff.**

## 🔧 SHIPPED — the "if you cast it" ETB rider (`6b92fe37`, +5 · **Dragons 79 → 80%**)

**38 corpus cards** print `When ~ enters, IF YOU CAST IT, <effect>` and none could be modelled — yet
`detectTriggers` had been **capturing the condition all along** (`interveningIf: "you cast it"`); only the
evaluator had no vocabulary for it. Sole blocker on **five**: Tiamat (shelf) · **Zacama, Primal Calamity**
(rank 1786) · Geological Appraiser · Yathan Roadwatcher · Iridescent Tiger. The remaining 33 need their own
payoffs and will collect this rider for free when they land.

The rider separates CAST from PUT (reanimation, Show and Tell, blink, token copy), so it is a per-permanent
fact about HOW the object arrived — modelled exactly like the `wasKicked` flag sitting one arm above it.
**⛔ Fail-open would hand a free Tiamat tutor to every reanimation spell**, which is the abuse the printed
rider exists to prevent; every uncertain path returns null or false.

**⭐ BOTH OF TIAMAT'S SEARCH RIDERS ARE ENFORCED, NOT WAVED THROUGH AS VACUOUS.** "not named Tiamat" and
"that each have different names" are *automatically satisfied by a singleton Commander library* — Tiamat is
on the battlefield, every name unique. Ignoring them would have passed every realistic game and still been a
search wider than the card allows. **The riders were cheap to honour; the argument for skipping them was the
expensive part.**

**⭐ A THIRD SURVIVED SABOTAGE CHECK OF THE SEAM KIND — and the second in two slices.** Removing
`wasCast: true` from the PERMANENT_ETB resolver (so no real cast is ever stamped and the rider can never
fire) left all twelve assertions green, because they call `enterPermanent` directly with the flag already
set. Stamp mechanism: covered. Evaluator: covered. **The cast path actually setting it: not covered.** A
section now casts through `legalChoices → dispatchAction → resolveTopOfStack` and reads the flag off the
permanent that entered. *Two slices running, the survivor was the join between two well-tested halves. When
a check survives, look at the seam first.*

Tier diff **GAINED 5 · LOST 0 · RETIERED 0** — predicted and confirmed. Sixth capability pin graduated
(`conniveSuspectKeywords` parked Geological Appraiser because this vocabulary "is unmodeled" — its own
words); learn and incubate stay parked for their own still-valid reasons.

Mutation-checked: **M85** fail open → killed by 3 · **M86** drop the name exclusion → killed ·
**M87 SURVIVED** → seam section → **M87b** killed by 2.

## 🔧 SHIPPED — colored-PIP cost reduction (`1ba87fc5`, +3 · **Dragons 78 → 79%**)

Every reducer before this returned a **scalar** the cast site subtracts from `generic`. Four cards reduce
**COLORED PIPS**, and Edgewalker's own reminder states the difference: a `{1}{W}` Cleric costs `{1}` — the
generic is untouched and the `{W}` goes. Through the scalar channel that Cleric would cost `{W}`, and
Morophon would take 5 off a `{4}{R}{R}` Dragon's generic (leaving `{R}{R}`) where the card leaves `{4}{R}`.
**Cheaper than printed is the forbidden direction** — which is why the family was parked, not approximated.

**⛔ A RUNTIME-VACUOUS NATIVE THIS SLICE NEARLY SHIPPED, AND AN OLD PIN IS WHAT CAUGHT IT.** A `chosenType`
reduction resolves against the source's stored `chosenType` (CR 614.12), which exists only because the card
prints the modelled *"choose a creature type"* ETB. I argued the classifier was structurally safe — *"a card
with the reducer but no chooser still has the chooser line as residue"* — **which is circular: a card that
never prints a chooser has no such line to park on.** `chosenTypeSelfAdd.test.js` had pinned that exact
fixture as body-only and failed. `parseStaticAbilities` now drops a chooser-less `chosenType` descriptor.
Closes the same latent hole on the older GENERIC chosen-type path for free.

**⭐ A PIN THAT OUTLIVED ITS REASON AND EARNED A NEW ONE** — worth knowing this shape exists. That same
assertion was written to prove the colored reduction wasn't quietly credited; when the reduction became
real it failed, and **the failure was still correct, for a different reason than it was written for.**
Read what a failing pin is telling you now, not what it was for.

**⭐ AND ONE PIN WAS RE-POINTED, NOT FLIPPED.** The residue-swallow guard used Morophon's unmodelled rider
as a canary. Flipping it to `native-static` would have left the guard with no end-to-end assertion at all,
so it moves to **Vorthos, Steward of Myth** (an unmodellable filter that will stay unmodellable). *When a
graduated pin was someone else's canary, find it a live bird.*

**M79 SURVIVED → pinned, not deleted** (same call as storm, one commit earlier). Ungating the qualifier
sentence left everything green because Vorthos and Head of the Class are held by their own unmatched
clause. The case the gate defends is a GENERIC reducer printed with the colored-only qualifier — no such
card exists yet, which is exactly the point.

⚠️ **Two fabricated fixtures, exposed by the tier diff's SILENCE** (3 gained where I predicted 4):
Ragemonger is `{1}{B}{R}`, not `{2}{B}`; **Nekrataal Avatar is a VANGUARD card** — no mana cost, no P/T,
outside the playable corpus — and was in my test as an invented *"Creature — Zombie Avatar"*. *A diff that
moves FEWER cards than predicted is as informative as one that moves more.*

Mutation-checked: **M78** shave generic instead of pips → killed by 2 · **M79 SURVIVED** → pin → **M79b**
killed · **M80** apply an unfiltered pip reducer to every spell → killed.

## 🔧 SHIPPED — STORM on a PERMANENT spell (`9a177075`, +2 · **Dragons 77 → 78%**)

Every storm card the engine handled was an instant or a sorcery. A storm **CREATURE** resolves through
`PERMANENT_ETB` (`params.card`), not an EFFECT_PROGRAM body, so `applyCopySpell`'s program-clone path
produced nothing usable: N copies **all sharing the original card's id**, none flagged `token`, each headed
for a graveyard as a real card. The classifier parked them at body-only, so **the hole never surfaced as an
FP — the path was simply never built.** CR **707.10f** is the rule; the per-copy snapshot is the one
`applyCopyCreatureSpell` (Double Major) already used.

**⛔ THE BARE-KEYWORD-LINE ANCHOR EARNED ITS KEEP IMMEDIATELY.** Five corpus cards **GRANT** storm rather
than having it — Prismari, the Inspiration · the Ral, Crackling Wit emblem · Storm, Force of Nature ·
Crackling Spellslinger. Matching the reminder sentence would strip the granting ability off all five and
credit them native with the card's whole point gone — *the nine-card cascade mistake, waiting to be
repeated one line below where it is written down.* **Read the note next to the code you are copying.**

**⛔ The three storm AURAS are NOT credited** — their tier path reads oracle separately from the shared
strip, and an Aura copy needs an attach target this arm does not model. Safe FN, left deliberately.

**⭐ A SURVIVED MUTANT MADE A GUARD REAL INSTEAD OF DELETED.** Removing `!params.program` left all 33 tests
green — no payload the dispatcher builds carries BOTH `card` and `program` (EFFECT_PROGRAM carries `cardId`;
`card` only ever appears nested under `spellToGraveyard`/`adventureExile`). The M65 precedent says drop a
redundant guard, but this one is real protection that merely had nothing exercising it. So the new test
**drives `applyCopySpell` directly with the ambiguous payload the guard exists for** — re-mutated after, and
killed. *A guard nothing can kill is not proven redundant; it is proven untested. Those are different, and
the fix is usually a test, not a deletion.*

Mutation-checked: **M74** no fresh per-copy id → killed · **M75** drop `token:true` → killed by 2 ·
**M76 SURVIVED** → pin added → **M76b** killed · **M77** reminder-wide anchor → killed by the granting pin.
**Reverts confirmed by `git diff`, not by the marker sweep.**

## 🔧 SHIPPED — the selfPower mana metric (`25f90a28`, +9 incl. **Marwyn, the Nurturer**)

Nine mana dorks whose whole plan is *grow, then tap* produced **ZERO** mana at runtime: `parseManaMetric`
knew permanentsYouControl / devotion / greatest-power-or-toughness-among-creatures-you-control and had no
**SELF** metric. Two printed connectors, one metric — `"where X is this creature's power"` and
`"Add an amount of {G} equal to Marwyn's power"`.

**⛔ THE SELF-REFERENCE GATE IS THE WHOLE SAFETY ARGUMENT.** Printed text names the source three ways —
"this creature", the full name, or the **pre-comma short name** ("Helga" for "Helga, Skittish Seer"). Every
OTHER `"<x>'s power"` in the corpus is a referent to a **different object**: "that creature's" (Mercy
Killing), "the sacrificed creature's" (Ghoulcaller Gisa), "the exiled card's" (Lobelia). Reading the
source's power there fabricates an amount belonging to another permanent, so the name arm matches only this
card's own name and refuses everything else.

**Helga and Redshift print the identical metric behind "Spend this mana only to …"** and stay parked on the
per-ability restriction refusal — pinned so they cannot ride in.

**⭐ A CAPABILITY PIN GRADUATED.** `coverage.test.js` pinned "this creature's power" under `MUST_STAY_BODY`
while the metric was absent — that pinned a **missing capability, not a decision**, so it MOVES to
`MUST_FLIP` rather than being deleted. The two genuinely-unmodelled metrics beside it (battlefield-wide
Elves, graveyard counts) stay, and a referent case joins them. *A capability pin outlives its truth
silently; the suite is where you find out.*

**⚠️ AND THE TRAP THAT NEARLY MIS-SCORED THIS SLICE AS CORPUS-NEUTRAL: MEASURE ON THE CENSUS CARD SHAPE.**
Fed a **raw oracle-index record** (`oracle_text`/`type_line`) instead of the `{type, oracle, mana}` that
`publicCard` hands the census, `classifyCard` reads an **empty oracle** and calls the card a vanilla
`native-body` — **Sol Ring included**. My scratch probe did exactly that and reported all nine already
native. Normalize before you classify, or the number is fiction.

Tier diff **GAINED 9 · LOST 0 · RETIERED 0** (all `body-only → native-mana`). Five of the nine I did not
predict — the mono-green connector form (Cradle Clearcutter, Topiary Lecturer, Rainveil Rejuvenator,
Viridian Joiner, Marwyn). **The shelf does not move; none of the nine are on it.**

Mutation-checked: **M71** drop the self-reference gate → killed by 2 · **M72** fall through to the
board-wide max → killed by the bystander control · **M73** printed power instead of layer-aware → killed by
the counters test.

## 🩸 THE VACUOUS SUBTYPE FILTER — a new FP class, found and closed (`57011a09`)

**A filter the runtime can never satisfy is worse than a missing one.** `subtypeFilterMatches` enforces
`subtypeFilter` as a substring of the triggering permanent's TYPE LINE. Mint a string no card carries —
"Commander", "Outlaw", "Allie" — and the card classifies **native**, the trigger fires **zero**, and
**nothing in the static toolkit can see it**: the per-card tier diff shows no movement because the card was
already native and stays native. This is the same lesson as the dropped layer grant, in a second location:
**the tier is not evidence about the board.**

**The instrument: `app/scripts/probe-vacuous-subtype-filters.mjs`.** It derives the real subtype vocabulary
from printed type lines and reports any minted filter absent from it. **A finding here is always a defect** —
there is no benign reason to gate on a subtype no printed card carries. Run it after touching ANY path that
mints a `subtypeFilter`. It reads **0** today.

**⚠️ AND THE PROBE WAS WRONG ON ITS FIRST RUN — 72 false findings.** It scoped the vocabulary to post-dash
subtypes, but `subtypeFilterMatches` tests the WHOLE line, so "Artifact" legitimately matches
"Artifact — Equipment". *The instrument was the problem, not the engine.* Fixed before trusting a single row.

The three real classes, all now closed:
```
"Commander"  CR 903.3 DESIGNATION, not a type word   Norn's Choirmaster #3286 (etb+attacks) · Keleth #6637
"Outlaw"     CR 203.4c UMBRELLA over five subtypes    Rakish Crew
"Allie"      naive -s strip on the plural "Allies"    Invasion Tactics #13305
```
Commander now takes `commanderYouControl` (the scope Kediss already proved); outlaw expands to its five;
singularization now **generates candidates and validates against `CR_CREATURE_TYPES`** — the closed 317-word
set — instead of trusting a rule (Allies→Ally, Elves→Elf, Wolves→Wolf, Oxen→Ox; unresolvable → null →
Arbiter, a safe FN). **Do not replace that with a hand-written plural dictionary — it would just relocate
the fabrication.**

**⭐ TWO FOLLOW-ONS THE DIFF CAUGHT AND REASONING DID NOT.** Both are the argument for running it every time:
1. Moving commander triggers off the subtype path dropped **Keleth to body-only** — `NONSELF_TRIGGERING_SCOPES`
   gates the "put a +1/+1 counter on IT" pronoun rewrite, and the new scope wasn't in it. Fixing only the
   scope would have swapped a silent no-op for a silent park.
2. Denying "commanders" to `parseSubtypeList` killed the BATCHED form outright — and the pin protecting it
   was protecting an FP (its old output was itself vacuous). `batchCommander` makes the plural CORRECT
   rather than absent. **New descriptor field → the whitelist, or it is silently dropped.**

**Tier diff GAINED 0 · LOST 0 · RETIERED 0. Coverage does not move.** Three cards that claimed native and did
nothing now work. That is the whole result, and it is worth more than a number.

### 📋 NEXT OFF THIS SHELF — the 26 top-2500 "one or more" carriers still parked, DIAGNOSED

**⚠️ FIRST, THE TRAP THAT COST ME A WRONG ANSWER: `publicCard()` STRIPS `edhrec_rank`.** An ad-hoc probe
built on `publicCard` read every rank as the 999999 fallback and reported *"0 of the remaining carriers are
in the top 2500"* — which would have retired this whole vein. `measure-coverage.mjs` reads `raw.edhrec_rank`
off `allCards()` for exactly this reason. **Take the rank from the RAW card, the oracle from `publicCard`.**

The real answer is 26, and detection status splits them cleanly (`detectTriggers` count in brackets):

```
DETECTION IS THE ONLY BLOCKER — the batch arm exists, the SUBJECT FILTER is the gap
  1729 Elvish Warmaster   [0]  "one or more other ELVES you control enter" + rider   ← the subtype cross
  1544 Losheel            [0]  "one or more ARTIFACT CREATURES you control enter" + rider
   648 Caretaker's Talent [0]  "one or more TOKENS you control enter" + rider   ⚠️ any token, incl. Treasure
  2459 General Kreat      [0]  "one or more GOBLINS you control attack"          ← maps onto youAttack
  2500 Dollmaker's Shop   [0]  "one or more NON-TOY creatures you control attack a player"
  1281 Duelist's Heritage [0]  "one or more creatures attack"  ⚠️ ANY player's — NOT youAttack
  1591 The Skullspore Nexus [0] "one or more NONTOKEN creatures you control die"  ← diesBatch + nontoken
  2356 Spiteful Banditry  [1]  "one or more creatures YOUR OPPONENTS CONTROL die" + rider

DETECTED ALREADY — the EFFECT is the blocker, so these are spell-effect work, not trigger work
  1903 Grazilaxx   combatDamageBatch ✓ … blocked by its OTHER line ("becomes blocked")
  2484 Nature's Will combatDamageBatch ✓ … "tap all lands that player controls and untap all lands you control"
  2438 Rev          combatDamageBatch ✓ … "look at the top card of that player's library" rider
   897 The Gitrog Monster / 1290 Hedge Shredder / 1987 Colossal Grave-Reaver — gyEnterBatch ✓, effect gaps
  1838 Teval's Judgment  gyLeaveBatch ✓ … modal "choose one that hasn't been chosen this turn"
   914 Evolution Witness / 2085 Basking Broodscale / 1259 Simic Ascendancy — countersPut ✓, effect gaps
```

**The cheapest next slice is the ETB SUBJECT CROSS** (the first three rows): the batched-ETB arm shipped at
`619b9513` handles *"with power/mana value N or less"*, and these are the same grid cell with a different
filter — subtype, card-type, token-ness — all of which the SINGULAR etb path already enforces
(`subtypeYouControl` / `otherSubtypeYouControl` / `tokenFilter` / `nontokenFilter`).

**⭐ BUILD IT BY DELEGATION, NOT BY A SECOND PARSER.** De-pluralize the subject and hand the singular clause
back to `classifyCondition`, then decorate the result with `requiresOncePerTurn: true`. That inherits every
scope the singular arm can enforce **and every refusal it makes** — which is the whole safety argument, and
the shape the `diesBatch` arm already documents. Use `singularCreatureType` for the subtype word; it is the
validated singularizer built in `57011a09` precisely so "Elves" cannot become "Elve".

**⚠️ Caretaker's Talent needs care: "tokens" is ANY token, including Treasures.** A creature-scoped gate
would under-fire while claiming native — the FP direction. It needs a token-permanent scope or it parks.

### ✅ THE DELEGATION ARM IS BUILT (`ef8bfbfc`, +2: Elvish Archivist, Ingenious Smith)

Shipped exactly as scoped above, and **the shape is the deliverable — the two cards are not.** Reuse it for
every remaining batch verb rather than writing a second subject parser.

**⭐ THE GATE WAS TOO NARROW ON THE FIRST CUT, and only measuring caught it.** The singular path splits
"something entered" across **two** events — `etb` for creature-shaped subjects and **`permanentEnters`** for
the card-type ones ("an artifact you control" → `artifactYouControl`, "a token you control" →
`tokenYouControl`, each with its own check function `checkPermanentEntersTriggers`). Gating on `etb` alone
silently dropped the artifact and token carriers, i.e. most of the family. **Before assuming a subject is
unmodeled, check BOTH entry events.**

**⚠️ AND ONE GUARD MEASURED INERT** — the subject-list early-out in `singularizeBatchSubject` changes nothing
when mutated away, because the delegated clause is refused downstream anyway. Kept as intent, labelled as
belt-and-suspenders in both source and pin. *Do not re-sell it as the guard.*

Still parked and why: **Caretaker's Talent #648** (Class levels), **Losheel #1544** ("artifact creatures" is
not modeled SINGULAR either — fix it there and the batch form follows for free), **Elvish Warmaster #1729**
(detects correctly now; blocked by its `{5}{G}{G}` subtype pump), **Kambal #1145** ("tokens your opponents
control" + a copy effect), **Merry #5398** / **Baron Bertram #4221** (effects).

## 🎯 THE OBJECTIVE — RETARGETED BY COLTON, 2026-07-28 (supersedes the shelf framing below)

**The target is now the TOP 2500 MOST-PLAYED CARDS by `edhrec_rank`.** Colton, verbatim: *"lets focus now
on the top 2500 that['s] probably 95% of what's actually played."* This supersedes both "corpus %" and
"the deck shelf" as the number to move. The shelf sections further down are still TRUE and still useful
as a secondary read — do not delete them — but they are no longer the bar.

Measure it with the project's own tool (it already had this view; the comment in the script says the
corpus number *"treats a never-played junk card the same as Sol Ring"*):
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```
`playable = native OR land`. Lands count — they run trivially, which is why **Bojuka Bog #24 was never
a gap** even though an ad-hoc probe of mine listed it as parked. Do not re-derive that; it is settled.

**WHY THE RETARGET HAPPENED — the lesson is worth more than the number.** Colton pushed back twice, and
both times the instrument was the problem, not the codebase:

1. *"why are we gated on no new card or easy cards when we're not even half way"* — every search
   instrument built in this run asks the SAME question: *"which cards are ONE sentence from flipping?"*
   That seam genuinely was exhausted, but it is a thin surface layer. It goes quiet long before the WORK
   does. "No cheap wins" was an artifact of the instrument.
2. *"we don't [want to] assume cards are hard just cause they['re] multi part — some of those may be
   really easy as we have a lot of what they're doing already done."* — **Blocker COUNT is not cost.**
   A card needing two VOCABULARY fixes is cheaper than one needing a new SUBSYSTEM. Every slice shipped
   since that message was a case of the engine already knowing the effect and not knowing the phrasing.

**The instrument that replaced them:** for a given family, parse each blocking phrase in isolation AND a
near variant that differs by one qualifier. When "destroy all artifacts" is HIGH and "exile all artifacts"
is LOW, the gap is a missing CROSS, not a missing mechanic. That single diff found three slices in a row.

Full authority granted: cut releases freely, choose the work, no check-ins. Stop only for something that
needs Colton's hands, touches secrets, or would ship a guess.

## 🪶 THE TOP-2500 GAP IS A LONG TAIL — measured, not guessed (`probe-top2500-blockers.mjs`)

**This is the most important strategic fact on the page, and it is unwelcome.** The probe asks what no earlier
instrument in this run asked — *which SENTENCES block the cards that matter, and how many each* — with a card
blocked by three lines counting toward all three, so a shape can rank high even when no single card flips from
it alone. The answer:

```
1137 parked top-2500 cards  →  1626 distinct blocking shapes  →  1568 of them block exactly ONE card
                                                                 the LARGEST cluster is 9
```

**There is no big lever left in the top 2500 by sentence shape.** This is the quantified form of the rate
problem: ~438 cards to reach 70% against a tail where the median shape is worth one card. Any plan that
assumes a hidden vein is wrong; the work is either (a) whole MECHANICS, or (b) accepting a low per-slice yield.

**⚠️ THE PROBE WAS WRONG THREE TIMES BEFORE IT WAS RIGHT — all three corrections are baked in.** Every one was
a line that cannot classify standing alone, scoring as a blocker for every card carrying it:
```
"//"                21 cards, looked like the biggest lever on the board — it is a FACE SEPARATOR.
                    Multi-face cards in the top 2500 are 72.7% native (56/77), ABOVE the 54.2% baseline.
"Enchant creature"  19 cards — CR 702.5 is a targeting restriction handled by the aura path, not an ability.
"Choose one —" + 4  the modal WRAPPER and its bullets. VERIFIED DIRECTLY: "Choose one — • Destroy target
 mode shapes        artifact. • Draw a card." classifies native-spell. Modes are now de-bulleted and judged
                    as the whole spells they are, so a mode that ranks is a REAL gap.
```
**Two classes still over-report and are labelled in the file:** bare KEYWORDS (Spree, Ascend, Flashback), and
EFFECT FRAGMENTS off a permanent ("Draw a card." as a whole Artifact; "Equipped creature gets +3/+2" without
its Equip line). **The probe is trustworthy on instants and sorceries, where a printed line IS the spell.**

**The genuinely actionable clusters it found — all whole MECHANICS, none a one-liner:**
```
  9x  "You may look at the top card of your library any time."   Bolas's Citadel #263 · Mystic Forge #414 · Realmwalker #607
  8x  Spree                                                       Return the Favor #625 · Three Steps Ahead #1093
  7x  "{2}{U}: Level 2"  (Class enchantments)                     Wizard Class #634 · Caretaker's Talent #648 · Innkeeper's Talent #678
  5x  "As this creature enters, choose a creature type."          Roaming Throne #133 · Realmwalker #607 · Metallic Mimic #1055
  5x  Ascend (CR 702.131, the city's blessing)                    Wayward Swordtooth #986 · Twilight Prophet #1095 · Ocelot Pride #1122
  4x  Choose a Background · 4x Gift a card · 3x Station           Jaheira #876 · Dawn's Truce #359
  4x  "each player draws an additional card" (symmetric draw)     Rites of Flourishing #1524 · Kami of the Crescent Moon #1817
  3x  "If you would gain life, you gain twice that much instead"  Alhammarret's Archive #982 · Rhox Faithmender #1637
```
**Roaming Throne #133 and Realmwalker #607 each appear TWICE**, which is the probe's whole point — they are
two mechanics from flipping, and no one-mode-away list would ever surface them.

### ✅ THE DRAW-STEP CROSS IS DONE (`2c102157`, +5 — Howling Mine #723 is top-1000)

Shipped as scoped below. **Three findings worth more than the five cards:**

1. **The trigger was never the blocker — the word "additional" was.** Once the draw-step arm landed,
   *"that player loses 1 life"* on the draw step routed immediately while *"draws an additional card"* failed
   **on the upkeep twin too**. Widened on the `upkeepPlayer` arm ONLY: the corpus prints *"that player draws N
   additional cards"* 12 times and the each-player / target-player variants **zero** times. **Always isolate
   which half is broken before building the half you assumed.**
2. **⚠️ THE REFERENT IS A DOUBLE GATE** — `checkStepTriggers`' ctx threading AND `triggerRouting`'s event
   check. Widen one without the other and you get the two failure modes this project cares about: thread
   without routing → refused (safe FN); **route without threading → the referent is unset at resolution and
   the clause silently NO-OPS while the card claims native** (the FP). Mutation M10 un-widens the threading
   and four runtime pins fail.
3. **A whole intervening-if family was missing: the SELF TAP-STATE** (CR 603.4 + 106.1). The machinery
   understood only BOARD-COUNT conditions, so *"if this artifact is untapped"* parked everything carrying it —
   **29 cards across five wordings, including Mana Vault #145.** Only 2 flipped (Howling Mine, Nim Abomination);
   **the rest are parked for their own effects, so this seam is now open but nearly exhausted** — do not
   re-mine it expecting the other 27.

**⚠️ AND A PROCESS RULE, one step past the last one: `git checkout --` IS NOT A MUTATION REVERT.** M12's perl
anchor silently failed to apply, and using `git checkout` to "restore" **discarded the real change instead**.
The mutation round then measured a file that no longer had the feature in it. `git diff --stat` after every
mutation round is the standing check — the marker sweep cannot see this class either.

### ✅ THE RESTRICTION WORKLIST IS AUDITED AND CLEAN — no second Mox Opal. Do not re-mine it.

Every remaining entry was checked against the engine, not assumed. **All modeled:**
```
Rhystic Study #44 · Mystic Remora #98   a dedicated `taxed-draw` atom (OPPONENT-PAYS-TO-DENY, CR 603.7c)
                                        with a real payer choice in learnSession. NOT an unconditional draw.
Torment of Hailfire #614                a dedicated `iterated-edict` atom whose resolver drives the
                                        X × opponents pausing choice chain. Its own comment names the naive
                                        split as "a forbidden partial" — the exact hazard, already handled.
Weathered Wayfarer #1412                legalChoices ~1736 gates on `ab.condition` via evaluateInterveningIf,
                                        and uses `!== true` so an UNPARSEABLE condition also blocks. Safe.
can't-be-blocked-except-by              ignoring a blocking restriction makes the attacker EASIER to block —
                                        weaker than printed, the safe direction. Deprioritized, not skipped.
```
**⚠️ And one fixture lesson, again:** my board test showed Weathered Wayfarer's ability offered in NEITHER
the condition-true nor condition-false case, which looked like a dead gate. `evaluateInterveningIf` answers
that exact string **`true`** when asked directly — the fixture was incomplete, not the engine. *Isolate the
predicate before concluding the mechanism is broken.*

### ✅ DONE (`a65dd03e`, +6) — condition-gated mana is now ENFORCED, not refused

The follow-up below was built the same session it was written. The condition rides on the mana product and
is evaluated LIVE at **`manaSources` — the ONE chokepoint**; gating at each consumer would guarantee one of
them forgets. `!== true` so an unconfirmable condition blocks, matching `legalChoices`' comparison exactly.

**Board-asserted:** a lone Mox Opal (metalcraft unmet) yields NO source, still none one artifact short, and
exactly one at three artifacts.

**⚠️ THE PIECE THAT KEEPS THE METRIC HONEST — `conditionIsExpressible`.** Tagging every gate and letting
`manaSources` drop whatever is not `=== true` would be runtime-safe **and still wrong**: the card would be
credited `native-mana` while its source could never be offered — a runtime-vacuous native, the same class as
the vacuous subtype filter and the aura grants that never applied. **A gate the evaluator cannot DECIDE
parks the card.** So the 16 split honestly: **6 back, 10 still parked.**

**This was the THIRD time the same pattern paid this run** — a guard that existed at one entry point and not
its sibling (`legalChoices` gated activated abilities; `manaSources` gated nothing).

### 🎯 (original scoping, kept) — the 16 parked mana cards can be RESTORED properly

`b84252af` routes condition-gated mana sources out entirely (a safe FN) "until conditions are real". **They
are more real than that fix assumed:** `evaluateInterveningIf` already answers these gates —
`"you control three or more artifacts"` → `false` on an empty board, correctly. So the honest fix is to keep
`manaProduction` and have **`manaSources` filter on the condition at runtime**, exactly as `legalChoices`
~1736 already does for activated abilities. That restores Mox Opal #241 and 15 others as the cards they
actually are, instead of leaving them parked.

**Scope note before starting:** the source list is consumed by the payment planner in several places, so the
condition must gate at `manaSources` (one chokepoint), never at each consumer.

### 🔬 AMULET OF VIGOR #1301 — SCOPED, NOT BUILT. Four pieces, and the FOURTH is the one that matters.

Applied last turn's rule ("re-read the machinery before believing the subsystem label") to the rest of Earth
Bent. Amulet looked like the best candidate and **one piece IS a clean missing-family-member** — but it is
not the piece that decides the card.

**The enter-subject family is complete except one:**
```
an artifact you control enters     → permanentEnters/artifactYouControl   ✅
an enchantment you control enters  → permanentEnters/enchantmentYouControl ✅
a token you control enters         → permanentEnters/tokenYouControl      ✅
a creature you control enters      → etb/creatureYouControl               ✅
a land you control enters          → landfall/landYouControl              ✅
a PERMANENT you control enters     → (none)                               ⛔  ← the gap
```
**Corpus reach is only 2 cards** (Amulet of Vigor #1301, Fire Lord Zuko #6200), so this is worth doing for
the shelf, not for volume.

**The four pieces:**
1. the `permanentYouControl` subject above;
2. an **"enters TAPPED"** filter on the entering permanent (the play path DOES tap before triggers fire —
   `actionDispatcher` ~161 taps, ~202 fires — so the state is readable);
3. an **"untap it"** referent atom bound to the triggering permanent;
4. **⚠️ THE DECIDER — `checkPermanentEntersTriggers` DOES NOT FIRE ON THE PLAY-LAND PATH.** It is called from
   exactly three sites (`tokens.js` ~68 mint, `zones.js` ~241 zone-enter, `resolvers.js` ~537 cast), and
   `actionDispatcher`'s land drop calls only `checkEnterTriggers`. **Amulet's entire purpose is untapping
   lands that entered tapped.** Building 1–3 without 4 produces a card that classifies native and never fires
   on its signature use — a runtime-vacuous native, the FP class this run keeps closing.

**So the build order is 4 FIRST** (wire the fire site, prove it on a board with a tapped land drop), then the
subject, filter and referent. This is the same "10+ callers, wiring each is how a path silently misses the
pass" trap the `diesBatch` note already records — and the reason it is scoped rather than started at depth.

### ✅ EARTH BENT **87%** — 3 from the bar (`8454dbe6` Planar Engineering). Shelf-wide it is still the closest.

**⭐ "SUBSYSTEM" WAS TOO PESSIMISTIC ON ONE OF THEM — check the machinery before believing the label.** I had
Planar Engineering filed as needing multi-pick sacrifice. It needed nothing new: `advanceSacrificeChain`
already drives a QUEUE "one permanent apiece", and `setPendingSacrificeChoice` already accepted that queue.
N sacrifices are N entries. **When a card is filed as a subsystem, re-read the machinery — the last three
"subsystems" have each turned out to be one guard, one field, or one queue entry away.**

**⚠️ A DOCUMENTED APPROXIMATION rides with it, and the reasoning is the reusable part.** The fetch half
prints the MANDATORY *"Search your library for FOUR basic land cards"*; the engine models it on the "up to
four" chain. The only divergence is whether the player MAY take fewer — **strictly worse for them, so it
cannot make the engine play a better card than printed.** A choice-FIDELITY gap in the safe direction, which
is categorically unlike a dropped effect. **No unread `mandatory` flag was stamped** — a field nothing
enforces is the captured-but-unread trap in another costume.

**⚠️ AND ANOTHER PIN PASSING FOR THE WRONG REASON.** M38 admits *"any number"* to the sacrifice arm and the
Scapeshift refusal STILL passes — **the linked-X fetch is what holds it**, not the sacrifice count. Relabelled.
That is the third pin this run found to be green for a reason other than the one it claimed.

### ✅ EARTH BENT 86% (`dbb5f632` Avatar Kyoshi) — the referent lesson

**⭐ THE REFERENT LESSON, which generalizes:** *"untap that land"* is printed on FOUR cards and **THREE mean a
DIFFERENT land** — Fabled Passage (fetched), Land Aid '04 (searched), Tiller Engine (entered), Avatar Kyoshi
(earthbent). A bare clause parser would bind all four to the earthbend stamp. **Match the COMPOUND when a
referent's meaning comes from the clause before it.** The stamp itself reuses the `revealedCardMV` /
`diceResult` pattern.

**⚠️ AND A MUTATION THAT PROVED NOTHING.** M35's first form loosened the regex prefix but left the rest
requiring the earthbend count, so a bare clause still could not match and nothing failed. **A green from a
mutation that never reaches the behaviour is not evidence** — re-run as M35b (add the actual unsafe arm),
which fails correctly. Same family as the deletion-mutation and `git checkout` traps already in this file.

**THE REMAINING 14, and none is a slice** (re-derived, not recalled):
```
LINKED X ("up to THAT MANY")   Scapeshift · The Earth King        ← the biggest shared mechanism left here
multi-pick sacrifice           Planar Engineering                 applySacrificeLand pauses for ONE
layer-4 GROUP type-add         Ashaya  ⚠️ its own P/T counts lands — a real feedback loop
mass GY return                 Lumra ("return ALL land cards from your graveyard")
new trigger EVENT              Amulet of Vigor ("enters tapped" is a play-path check today)
two unmodeled triggers         The Ozolith
REFUSED by our own guards      Scythecat Cub (inexpressible condition) · Herd Heirloom (spend-restricted mana)
Saga/DFC · quoted grant · replacement-meta   Legend of Kyoshi · Tale of Katara · Traveling Chocobo
```
**`earthbend N, then earthbend N` already composes** (Cracked Earth Technique is native-spell) — only the
untap referent was missing, which is why this was the last contained item in the deck.

### ✅ BUILT (`6975eb40`, +5 — Scute Swarm #229, Entish Restoration #439). **Earth Bent 83% → 85%.**

The scoping below was accurate, including the prescribed order. **Two bugs came out of it, and both are the
kind that look exactly like success — record them, they will recur:**

**1. ⚠️⚠️ FIELD-NAME COLLISION — the atom field is `branchOn`, NEVER `condition`.** `atom.condition` already
means something else in `runProgram` (~163): a rider GATE, *"skip this atom unless the condition holds"*.
Naming the branch field `condition` made the runner **skip the whole conditional whenever it was false** — so
`ifTrue` worked perfectly and `ifFalse` silently never ran. **Every true-condition test passed.** Only a
three-lands board showed it. *Before reusing a field name, grep what the runner already does with it.*

**2. ⚠️ HIJACKING BY FALLING SHORT — a new arm must FALL THROUGH, not return LOW.** The grammar also matches
*"…If that creature would die this turn, exile it instead"* — **23 cards** (Anger of the Gods, Pillar of
Flame) already modeled elsewhere, whose alternative is a rider rather than a branch. Returning LOW on a match
this arm could not fully model dragged all 23 from `native-spell` to `arbiter-spell`. **The tier diff caught
it (LOST 23 → LOST 0).** Falling through leaves everything unclaimed byte-identical.

**Decidability is checked at PARSE time, not just resolution**, so the metric and runtime agree — Scythecat
Cub's *"second time this ability has resolved this turn"* parks by design rather than rejecting mid-resolve.

**Three stale pins split, member by member** — Scapeshift (linked X) and Scythecat Cub keep their
assertions; Entish Restoration, Life Goes On and Scute Swarm moved to positive pins. The conditional-spell
RIDER family (the *additive* form) is a different shape and is untouched.

### ⭐ (original scoping, kept — it was accurate) "IF \<condition\>, \<X\> INSTEAD"

**This is the highest-leverage thing left on the shelf's nearest deck, and the expensive half is already
built.** No general conditional-replacement wrapper exists today (only two anchored exile-if-dies riders),
so all three cards park:
```
Scute Swarm       create a 1/1 Insect. IF you control six or more lands, create a COPY of this creature instead.
Entish Restoration search for up to two basic lands. IF you control a creature with power 4+, up to THREE instead.
Scythecat Cub     put a +1/+1 counter. IF this is the SECOND time this ability resolved this turn, DOUBLE instead.
```
**⭐ THE CONDITIONS WERE PRE-VERIFIED against `evaluateInterveningIf` — two of three already answer:**
```
"you control six or more lands"                              → true   ✅ expressible
"you control a creature with power 4 or greater"             → false  ✅ expressible (correctly, on that board)
"this is the second time this ability has resolved this turn" → null   ⛔ NOT expressible — Scythecat parks
```
So the work is **NOT** a conditional subsystem from scratch. It is: a **branch node in the effect program**
(`{ condition, ifTrue:[…], ifFalse:[…] }`), evaluated at resolution through the evaluator that already
exists. Narrow arms of this shape are precedent — `reveal-top-conditional` carries `thenRoute`/`elseRoute`,
and `structure:"modal"` already means the program shape is not flat.

**⚠️ REFUSING THE HALF-MODEL IS CORRECT TODAY, so do not "simplify" by dropping the instead-clause:** creating
the 1/1 when the card says copy is under-delivery, but it is still a printed effect that does not happen —
the dropped-effect class. Park until the branch is real.

**Build order, from the pattern that has worked three times this run:** the evaluator half is done, so add
the branch node and its resolution FIRST, then admit the parse arm — never the reverse.

### 🎯 EARTH BENT — 81% → **83%** (`25f9943d` Lotus Cobra, `74533daf` Toph). SEVEN cards to the bar.

**⭐ A GUARD THAT EXPLAINS ITSELF IS AN INSTRUCTION, NOT A WALL — third time this run.** The CDA count
allowlist's rule is *"every branch maps to an evaluator `countForSpec` computes EXACTLY"*, and its comment
named Toph's *"+1/+1 counters on lands"* as excluded **for having none**. Writing the evaluator dissolved the
reason. Same shape as the once-per-turn latch (*latch first, admit second*) and the condition-gated mana
whose *"until conditions are real"* had already come true. **Satisfy the condition; do not widen the guard.**
Order is load-bearing here: a CDA SETS base P/T, so admitting first would have set a fabricated **0/0**.

**The remaining seven, diagnosed — do not re-derive:**
```
Scapeshift          "sacrifice ANY NUMBER of lands … up to THAT MANY" — a linked X. Subsystem.
Planar Engineering  "sacrifice TWO lands" — a pure COUNT variant of a modeled arm, BUT applySacrificeLand
                    pauses for ONE pick; N picks need multi-select choice machinery. 15 corpus carriers.
Entish Restoration  a third sentence: "instead search for up to three" — a conditional REPLACEMENT.
Ashaya              "Nontoken creatures you control are Forest LANDS in addition…" — a layer-4 GROUP
                    type-add. The applier already handles op.types/op.subtypes; the selector is the work.
                    ⚠️ Its own first line counts lands, so this is a real feedback loop — check for it.
Amulet of Vigor     needs an "enters tapped" TRIGGER event (entersTapped is a play-path check today).
Scute Swarm         six-land token-copy rider · Scythecat Cub second-resolution doubler — both riders.
The Ozolith         counter-migration on leave + a combat-step move. Two triggers, both unmodeled.
```
**`sacrifice a land` already composes with the fetch** (`["sacrifice-land","tutor"]` parses HIGH) — the count
is the only gap, which is why Planar Engineering is the nearest of these and still not a slice.

With no shared lever left (below), the way to move the 1.0 metric is to convert ONE deck at a time, and Earth
Bent is nearest. Its gap, from `measure-coverage.mjs "earth bent"`:
```
8 ETB trigger · 4 spell effect · 2 static anthem · 1 each dies / attacks / activated / upkeep / other
```
Named: Amulet of Vigor · Scute Swarm · **Lotus Cobra** · Scythecat Cub · Lumra · Toph · Ashaya · Scapeshift ·
The Ozolith · Earth Rumble.

### ✅ BUILT (`25f9943d`, +4 — Lotus Cobra #323; Earth Bent 81% → **82%**)

**The scoping below held up exactly, and its central claim is the reusable part: this had the SHAPE of a
missing-sibling guard and was not one.** A tap source can DEFER the colour choice to the payment planner; a
resolution-time add must commit, because the pool has no wildcard slot. The regex was the easy half.

**THE RULE:** colour from the controller's **commander colour identity** (CR 903.4), falling back to the
**source permanent's own colours**. Board-asserted — green cmdr → `{G}`, **blue cmdr → `{U}`** (the identity
drives it, not the source), no cmdr → the source's `{G}`, nothing determinable → **adds nothing**.

**⚠️ THE IMPORT EDGE WAS AVOIDED ON PURPOSE.** `layers.commanderColorIdentity` exists but is module-local;
exporting it adds an edge into layers — *the class that crashed module init while the suite stayed green.*
The command zone is plain state, so it is read inline (the codebase's own "kept local to avoid coupling"
convention). **Module-graph check run.**

**⭐ N=1 ONLY** — "two mana of any ONE color" is a different promise and "two mana of any color" lets them
DIFFER. Corpus: **615** printings of the N=1 form vs 35/29/23 for the multi forms. The rest stay Arbiter.

**⚠️ AND A FIXTURE LESSON, AGAIN:** the source-colour fallback looked DEAD until tested against the REAL
card — a synthetic fixture without a `colors` field makes that branch unreachable and the whole effect look
broken. **That is the fourth time this session a fixture, not the engine, was the bug.**

Two stale CREED pins were **split, not rewritten**: both named Lotus Cobra on *"a fabricated mana is a
forbidden FP"* (true when written). Their other members — the filtered basic-land subject, Scute Swarm's
six-land rider, Scythecat Cub's second-resolution doubler — were **re-verified as still parking** and left
untouched.

### ⚠️ (original scoping, kept — it was accurate) "ADD ONE MANA OF ANY COLOR" IS A DESIGN CALL

The parse gap is real and tiny: **`add {G}` parses HIGH, `add one mana of any color` parses LOW**, while the
MANA-ABILITY side has understood that phrasing forever (Birds of Paradise is `native-mana`). Fifth
missing-sibling of the run — *except it isn't, and that is the point.*

**The blocker is not the regex, it is the COLOUR CHOICE.** `addMana` takes one specific colour and the pool
has no wildcard slot, so a tap-source defers the choice to the payment planner (`colors:[W,U,B,R,G]`) while a
RESOLUTION-time add must commit to a colour immediately. Inventing that heuristic is a modelling decision,
not a parse fix, and a quietly-wrong one degrades sim fidelity invisibly.

**Payoff, measured:** 234 parked cards contain the phrase, but only **11 are trigger-shaped** (the rest are
tap abilities already handled). **Lotus Cobra #323** is the prize; then Nissa #2106, Outcaster Trailblazer
#2968, Quirion Sentinel.

**Two viable designs — pick deliberately, do not drift into one:**
1. **Controller's commander colour identity**, deterministic in WUBRG order. `commanderColorIdentity` already
   exists in `layers.js` (~1495) but is NOT exported — exporting it adds a manaModel→layers edge, and *that
   edge class is what crashed module init two slices ago*, so check the graph before adding it.
2. **The source card's own colour identity** (Lotus Cobra → `{G}`). No new import, and it matches what the
   card's deck almost always wants — but it is wrong for a 5-colour deck holding a mono-coloured source.

**Either way the AMOUNT is exact, so the error can only be play-QUALITY (a safe FN), never more mana than
printed.** That is what makes this buildable at all — but it still deserves a deliberate choice, not one
invented at the end of a session.

### 🪶🪶 THE SHELF GAP IS A PER-DECK TAIL TOO — measured (`probe-shelf-blockers.mjs`, `c1204aa2`)

**Read this before planning any "push Joe to 90%" work.** The probe ranks blocking sentences by **how many
DECKS** they touch, because the 1.0 bar is per-deck: six cards inside one deck move one deck; the same six
spread across six decks move six.
```
16 decks · 340 parked card-slots · 468 distinct blocking shapes · 411 of them touch exactly ONE deck
```
**There is no shared lever left on the shelf.** Joe's ten sub-bar decks are **ten separate grinds of ~30
slots each**, not a few mechanics. This is the same shape the top-2500 blocker probe found, arrived at
independently — treat "a mechanic will unlock several decks" as disproven unless a probe says otherwise.

**The widest shared blocker is `Teamwork` (3 decks) and it is a SUBSYSTEM, not a slice:** an optional
additional cost (*tap any number of creatures you control with total power N or more*) **plus a cast-time
flag every carrier reads back** (*"if this spell was cast using teamwork, choose both instead"*). Crediting
the keyword alone drops the conditional half — the forbidden direction. 17 corpus cards.

**⚠️ THE PROBE OVER-REPORTS IN THREE WAYS** (all documented in-file): bare KEYWORDS, EFFECT FRAGMENTS off a
permanent, and — surfaced live by this run — **multi-face/Saga lines**, because each line is judged carrying
the SOURCE CARD'S TYPE. That rule is load-bearing everywhere else; the noise is its price on transforming
cards, and it is why a bare `Flying` appeared in the top rows.

### 🎯 THE SHELF IS THE TARGET — and Colton's side is effectively DONE

```
colton  92%  (457/499, 5 decks)   below the bar: cdh 79% ONLY — and cdh is arithmetically capped (~82%)
joe     73%  (797/1098, 11 decks) below the bar: TEN decks. Halfshell heroes 57% is the worst on the shelf.
```
**So every remaining point of shelf work is JOE'S**, which matches the standing note that 1–2 Joe cards per
subsystem is a big win. `node app/scripts/measure-coverage.mjs <deckname>` filters to one deck and prints its
gap by mechanism — that is the fastest way in.

### ✅ COMMAND-ZONE PAIRING KEYWORDS (`62c473c9`, +7) — found by walking the SHELF, not the corpus

Halfshell heroes has **three of the four turtles** blocked on `Partner—Character select`. Bare `Partner` was
already credited as inert; its siblings were not, on a comment claiming they *"carry extra unmodeled text"*.
**Read against the corpus rather than recalled, that was wrong** — all 47 pairing lines carry ONLY a reminder,
and the engine never reads them to seat anyone (`commanderCards` comes from the DECK DEFINITION).
```
Partner—Friends forever / Character select / Survivors / Father & son   ×18
Choose a Background  ×31        Doctor's companion  ×27
```
**⛔ `Partner with <name>` STAYS REFUSED** — its reminder is a REAL linked ETB tutor (CR 702.124f). The
em-dash in the label alternation is what keeps it out; M26 loosens it to `.` and three pins fail.

**⚠️ The alternation is corpus-derived — I enumerated every distinct pairing line before writing it.
`Partner—Father & son` is why the class is `[a-z'& ]`; omitting the ampersand silently dropped two cards.**

**The turtles still park** (Donatello's token replacement, Raphael's damage doubler, Leonardo's token trigger,
Michelangelo's Raid) — this removed one shared blocker, not all of them. **Those four effects are the next
shelf target, and they are one deck's commanders.**

### ✅ LEONARDO IS THE FIRST TURTLE HOME (`e1e1977c`, +1 — Halfshell 57% → 58%)

His real blocker was **`"Do this only once each turn."`** on an ADD-COUNTER atom. The rider was modeled for
`discover / draw / gain-life / create-token` and not for counters, because `ONCE_PER_TURN_HONORED` admits
only ops whose RESOLVER reads the flag. **Latch first, admit second** — implementing the latch before
touching the set is what kept this from crediting a card that fires on every token. Board-asserted: first
token 3 → 4, second token places nothing.

**⚠️ TWO FIXTURE TRAPS, both mine, both cost real time — they are in the test file so nobody repeats them:**
1. **Token-ness is read off the CARD, not the permanent wrapper.** `token:true` on the permanent alone fires
   NOTHING and looks exactly like a dead trigger.
2. **A one-letter fixture name ("T") collided with self-reference detection** and turned *"Whenever a TOKEN
   you control enters"* into an `etb/self` trigger. The real card was always fine.

Both were caught the same way: **re-test against the REAL card before concluding anything about the engine.**
That rule has now saved three wrong conclusions this session (this pair plus Weathered Wayfarer).

### ✅ MICHELANGELO HOME TOO (`83269996`, +2 — Halfshell 58% → **60%**)

He needed **two** independent fixes, and my prediction above was **half wrong in an instructive way**:

1. **`"At the beginning of your SECOND main phase"` detected NOTHING** — while *first / precombat* main had
   mapped to `firstMain` since its own slice. **The fourth missing-sibling guard this run.** Fires at the
   postcombat-main entry, gated on the PHASE because both mains share step `"main"` (the firstMain comment
   already calls that double-fire "the landmine here").
2. The `Raid (the Fridge) —` label — corpus-checked: **exactly ONE card** prints a parenthesised ability word.

**⭐ THE LEDGER PREDICTED (2) AND CALLED IT THE BLOCKER. It wasn't.** Bisecting to the simplest failing form —
*"At the beginning of your second main phase, draw a card."* — showed EVERY variant failing, label or no
label. **Fixing the label alone would have moved nothing.** Bisect to the simplest failing case before
believing a diagnosis, including one of mine.

**⚠️ AND A PIN THAT READ STRONGER THAN IT WAS:** `post.hand === pre.hand + 1` still passes under the
double-fire mutation (pre becomes 2, post 3). Measured, then tightened to ABSOLUTE counts. **A relative
assertion about a counter is no guard against something that increments both sides.**

**The remaining two turtles:** Raphael's filtered damage doubler ("Double all damage that creatures you
control WITH COUNTERS ON THEM would deal") and Donatello's "those tokens PLUS a Mutagen token" replacement.
Both are replacement effects with a filter, and `tokenMultiplier` (Wave-3a) is the nearest existing seam.

### ⭐⭐ THE RULE THAT MAKES THIS WHOLE SEAM TRACTABLE — DIRECTION, NOT PRESENCE

Auditing the tail-injection probe's top five clusters (~110 of its 165 cards) found **exactly one** defect.
The clusters that were fine and the one that wasn't differ in one way, and it is the whole filter:
```
an ignored tail that ADDS an effect  →  the engine UNDER-delivers  →  FN, SAFE       (Talismans, Signets)
an ignored tail that RESTRICTS       →  the engine OVER-delivers   →  FP, FORBIDDEN  (Mox Opal, Jeweled Lotus)
```
**Do not grind "is any text ignored" — grind "is a RESTRICTION ignored".** `probe-ignored-restrictions.mjs`
does exactly that: restriction-shaped phrases on cards the metric already calls NATIVE. **22 cards across 7
phrases in the top 2500** — small enough to audit by hand, and it found Mox Opal on its FIRST run.

### 🩸 CONDITION-GATED MANA — Mox Opal #241 offered unconditionally (`b84252af`, −16)

*"Metalcraft — {T}: Add one mana of any color. **Activate only if** you control three or more artifacts."*
`manaSources` has no activation-condition concept. **Verified on a board: a LONE Mox Opal — its own
metalcraft unmet, being the only artifact — came back as a live any-colour source.** A turn-one ritual out
of a card that should be dead. Fanatic of Rhonas #418 handed over `{G}{G}{G}{G}` with no ferocious check.
All 16 LOST cards carry the gate, **zero collateral**.

**NARROW ON PURPOSE:** only the `activate only if <condition>` board gate. *"Activate only as a sorcery"* is
a TIMING rule handled elsewhere and is deliberately excluded (pinned).

**✅ AUDITED AND CLEARED — do not re-mine these:** the Talisman/Signet mana cluster (under-models: the
coloured painful ability is not offered AT ALL, so the engine gets less than printed), **enters-tapped**
(handled at the play path in `actionDispatcher`, not `createPermanent` — a low-level constructor check will
mislead you), and the **token/counter doublers** (`tokenMultiplier`, Wave-3a).

**Still unaudited on the restriction worklist:** `unless that player pays` (Rhystic Study #44, Mystic Remora
#98 — a "may draw unless they pay" the AI must actually be offered), `activate only as a sorcery`,
`can't be blocked except by`. **Rhystic Study is the highest-rank card on the list — start there.**

### 🩸 SPEND-RESTRICTED MANA WAS GENERAL MANA — 60 cards, incl. JEWELED LOTUS (`9861e475`, −60)

**Corpus went 12,288 → 12,228 and that is the honest direction.** `"{T}: Add {U}. Spend this mana only to
cast an artifact spell."` (CR 106.6) was modeled as ordinary mana, because the payment planner has no
restricted-mana concept. Jeweled Lotus's three **commander-only** mana were spendable on anything — the
engine was playing a strictly better card than the one printed.

**⚠️ THE GUARD ALREADY EXISTED — for QUOTED/GRANTED abilities only** (`stripNonSelfQuotedGrants`, Battery
Bearer), with the reasoning spelled out in its own comment: *"the payment planner has no restricted-mana
concept → route out (FN-safe)"*. **A card's OWN printed mana line had no such check.** That is the identical
shape as the lossy anthem tail: **a guard written for one entry point and never applied to its sibling.**
When you find a guard, check every other path that needs it — this run has now hit that pattern three times.

Verified NARROW: all 60 LOST cards carry a spend restriction, **zero collateral**.

### ⭐ THE INSTRUMENT — `probe-lossy-clause-tails.mjs` (find this class ON PURPOSE)

Injects a clause that can never be modeled (`"and glorbulate"`) into each printed line of every native card
and re-classifies. **A card that STAYS native proves its parser read a prefix and ignored the rest.** The
previous instance of this FP class was found BY ACCIDENT; this one was found by looking.

**⚠️ EXCLUDE `tier === "land"` — the probe's own first run was wrong.** A land is credited playable by BEING
a land, so its tier cannot respond to an injected tail and every land reports as a finding: 4 of the top 5
shapes and ~48% of flagged cards. Excluding lands cut 612 shapes/657 cards → **148/169** and left the real
cluster visible. `native-mana` cards are KEPT — their tier does come from parsing.

**The remaining 148 shapes are an unworked seam.** The mana cluster was the biggest and is now closed; the
rest (`Storm`, `Flashback {2}{R}`, token/counter doublers, `Overload`, `Enchant creature`) are unaudited —
some will be legitimately-dropped whole lines, some will be more of this. **Re-run it after the fix and work
down the list.**

### ⛔⛔ A PIN THAT PASSES IS NOT EVIDENCE IT TESTS WHAT IT SAYS (`bd4973cd`) — the run's sharpest lesson

Crediting the ETB chosen-type chooser (a real setup replacement the engine implements) turned **five green
tests red**. Every one was already broken; the chooser line was an unaccounted line propping them up.

**The live FP it uncovered — the group-anthem parser had an all-or-nothing guard for a `have <tail>` and NONE
for any other tail:**
```
"Creatures you control get +1/+1 and can't be blocked."   →  native-static, PUMP ONLY
"Creatures you control get +1/+1 and glorbulate."         →  native-static, PUMP ONLY
```
**Half the printed effect, credited.** Two CREED pins claimed to cover exactly this and passed for the wrong
reason. Fixed: any trailing text that is not a `parseAnthemHaveTail`-validated grant now drops the WHOLE
clause. **Tier diff LOST 0** — no real card was leaning on it, so this was a loaded gun, not a wall.

**⭐ AND FOUR STALE FIXTURES, each VERIFIED rather than re-baselined.** Two named a clause "unmodeled" that
has since been BUILT — *"exile target nonland permanent an opponent controls"* classifies `native-trigger`
standing alone, and *"draw a card. Then discard a card"* is captured WHOLE (nothing was being shed). Both
now use clauses that **cannot be built later**, so the pins cannot go stale again. **When a CREED pin goes
red, first ask whether its "unmodeled" fixture got modeled — do not flip the expectation.**

**Realmwalker #607 (top-1000) also landed**: chosen-type cast-from-top, a DYNAMIC filter resolved in
`playFromTopPermission` against the granter's stored `chosenType`. **Unchosen grants NOTHING, not everything.**

### ✅ CHOSEN-TYPE ON CREATURES — BUILT (`665e45fa`, +1) and the scoping below held up exactly

Built in the order the scoping demanded: **selector layer-awareness FIRST**, then the self-type-add, then the
`"Other …"` cell. Building the parser arm first — the obvious order — would have credited these cards native
while their printed self-type-add did nothing for any selector.

**⛔ THE REAL FIND IS A PRE-EXISTING FALSE POSITIVE IT SURFACED, and its class is broad.** Morophon, the
Boundless flipped to native-static with its **{W}{U}{B}{R}{G} cost reduction UNMODELED**. Cause: the residue
builders stripped periods (`.replace(/[\s.]+/g, " ")`), **deleting the sentence boundaries `isKeywordOnly`
splits on** — the exact guard its own comment describes (*"a trailing non-keyword sentence glued on by a
strip is swallowed whole"*). A leading `"Changeling "` then absorbed the whole rider:
```
isKeywordOnly("Changeling Spells … cost {W}{U}{B}{R}{G} less to cast. This effect …")   → false  ✅
isKeywordOnly(same text with periods stripped)                                          → TRUE   ⛔
```
**Any keyword line could have swallowed any unmodeled text behind it.** Fixed on the two residues that feed
`isKeywordOnly`; the three siblings that merely test `length > 0` are unaffected and were left alone.
`LOST 0` says nothing else was leaning on it — this was a loaded gun, not a load-bearing wall.

**⭐ THE RULE: a residue that feeds `isKeywordOnly` MUST keep its periods.** Normalize whitespace with
`/\s+/g`, never `/[\s.]+/g`.

Still parked, with reasons: **Metallic Mimic #1055** (an enters-with-counters replacement), **Roaming Throne
#133** (trigger doubling), **Realmwalker #607** (chosen-type cast-from-top — the one place the cast-from-top
seam and this one meet).

### 🔬 (original scoping, kept — it was accurate) CHOSEN-TYPE ON CREATURES

The blocker probe ranked this cluster high (*"As this creature enters, choose a creature type"* ×5 plus
*"This creature is the chosen type in addition to its other types"* ×3), and it holds real cards:
**Roaming Throne #133 · Metallic Mimic #1055 · Adaptive Automaton #1755 · Realmwalker #607**. I scoped it
fully before writing any code. **Do not treat it as a vocabulary cross — it is not.**

**What ALREADY exists (more than expected):**
```
perm.chosenType + resolvers.autoPickCreatureType     ✅  the ETB chooser is real state
chosen-type ANTHEM statics (Vanquisher's Banner #361) ✅  native today
chosen-type CAST trigger (Kindred Discovery #345)     ✅  native today
layer-4 subtype ADDITION                              ✅  the applier already does `op.subtypes → subtypes.add()`
```

**The three things missing, in dependency order:**
1. **No parser arm** for *"This creature is the chosen type in addition to its other types."* It needs to emit
   a layer-4 effect whose subtype is read from `permanent.chosenType` at DERIVE time (the value does not
   exist at parse time), so it must be emitted in `staticEffectsOf`, not baked into the card descriptor.
2. **⚠️ THE TRAP, and it is the reason this is a subsystem: `permHasChosenTypeLayer` (layers.js ~126) reads
   the PRINTED CARD'S TYPE LINE, not the layer-4 derived subtypes.** So even after (1) emits the effect
   correctly, a Metallic Mimic that IS the chosen type still would not satisfy any chosen-type selector —
   the card would classify native while its printed self-type-add did nothing. **That is the vacuous-filter
   class again, in a third location.** Making the selector layer-aware is the real work, and its blast radius
   covers every chosen-type consumer.
3. **`classifyChosenTypeCastDraw` explicitly excludes creatures** (`coverage.js` ~3104:
   `if (!/\b(?:artifact|enchantment)\b/.test(type) || /\bcreature\b/.test(type)) return null;`). That gate is
   correct TODAY precisely because of (2) — lift it only after the selector is layer-aware.

**Also one genuine one-diff waiting behind it:** `CT_CAST_ANTHEM_LINE_RE` matches *"Creatures you control of
the chosen type get +N/+N"* but not **"OTHER creatures…"** (Adaptive Automaton). One word — but worthless
until (2) lands, because that card carries the self-type-add line too.

**Verdict: correct order is (2) → (1) → (3) → the "other" cross.** Anything else credits a card whose printed
text does nothing.

### ✅ CAST-FROM-TOP IS DONE (`9afbfb0d`, +7 — Elven Chorus #1376)

**⚠️⚠️ THE FINDING THAT MATTERS MOST IN THIS SLICE HAS NOTHING TO DO WITH CARDS: I SHIPPED A CRASH THE
SUITE COULD NOT SEE.** Adding one import edge — `CR_CREATURE_TYPES` into `staticAbilityParser`, read only
inside a function, exactly as the existing convention prescribes — reordered module init so that a plain
`import legalChoices.js` threw:
```
ReferenceError: Cannot access '_lifeLossWatcher' before initialization
```
**914 test files stayed green**, because vitest resolves modules in a different order than node. It surfaced
only because an ad-hoc probe script imported the module directly. **Reading a constant lazily does NOT make
an import edge safe — the EDGE is what reorders init.** Fixed by extracting the constant to the leaf
`effects/creatureTypes.js` (targeting.js re-exports it, so no existing importer changed).

**⭐ THE STANDING RULE THIS ADDS: after touching imports in `src/lib/learn/`, run
`node --input-type=module -e "import './src/lib/learn/legalChoices.js'"` — a green suite is not evidence
that the module graph still loads.**

Two other things worth keeping:
- **A closed vocabulary, again.** Filter words are validated against card types + `CR_CREATURE_TYPES`; an
  unlisted word parks the clause. Galea #12094 ("aura and equipment spells" — non-creature SUBTYPES) pays
  for that line and parks. Correct trade, straight from the vacuous-filter class.
- **The merge had to become a UNION.** `a || b` was fine while the only values were `"any"` and `null`;
  with type filters it silently dropped the second permission (Eladamri + Mystic Forge → creature-only).

**⛔ AND A DELIBERATE PIN WAS OVERTURNED — read this before re-parking it.** The parser declined to credit
*"You may look at the top card of your library any time"* citing "an existing pin (topCardRouter's Iron Lad)
deliberately keeps such cards body-only". **That was circular** — Iron Lad was parked ONLY by that line, and
its activated ability classifies `native-activated` standing alone. The line is now credited INERT beside
its already-credited and strictly MORE public sibling *"play with the top card revealed"*: looking changes
no game state and this sim is perfect-information, so **no effect is being dropped**, which is exactly why
crediting it cannot become a claimed-native no-op. It was the shared blocker on **6 of the 8** cards here.

Still parked and why: **Bolas's Citadel #263** (life-cost cast rider), **Mystic Forge #414** ("artifact
spells and COLORLESS spells" — colorless is not a type word), **Realmwalker #607** (needs the chosen-type
mechanic), **Augur of Autumn #1124** (Coven), **The Reality Chip #1025** (attach-gated permission).

### (original scoping, kept) — CAST-FROM-TOP-OF-LIBRARY, and half the seam already exists

The 9-card cluster the blocker probe ranked #1. **Measured, so build against this and not a guess:**
```
"You may play lands from the top of your library."            → native-static   ✅ ALREADY MODELED
"You may look at the top card of your library any time."      → body-only       ⛔
"You may cast artifact spells from the top of your library."  → body-only       ⛔  ← the real machinery
"You may play the top card of your library."                  → body-only       ⛔
```
**The land form is the reference implementation** — a play-from-top seam already exists and works; this is
extending it to a TYPE-FILTERED cast and to the unfiltered form.

Cards: **Bolas's Citadel #263 · Mystic Forge #414 · Realmwalker #607** (+6).

**The look-at-top static is a separate, cheaper piece and is safe to model as a genuine no-op:** "look" changes
no game state (it changes DECISIONS), so recognizing it costs nothing and unparks the cards that pair it with
a cast-from-top they'd otherwise get credit for. **Do the cast machinery first** — crediting the look line
alone would be the transformed-text trap in a new outfit.

### (original scoping, kept — "each player's DRAW STEP" is the missing sibling of a pattern already SHIPPED)

The cheapest item on the list above, and it is a textbook missing-cross. Measured with the one-diff probe:
```
At the beginning of your draw step, draw an additional card.               →  draw/you          ✅
At the beginning of each player's UPKEEP, that player loses 1 life.        →  upkeep/you        ✅  fully built
At the beginning of each END STEP, draw a card.                            →  endStep/you       ✅
At the beginning of each player's DRAW STEP, that player draws a card.     →  (none)            ⛔  THE GAP
```
**The upkeep version is complete and is the reference implementation** — `triggers.js` ~3099 carries the
UPKEEP-PLAYER REFERENT machinery (CR 603.2b + 503.1a): an `eachPlayersUpkeep` flag set only by the anchored
"each player's upkeep" condition, a "that player" → "the upkeep player" rewrite, and `ctx.upkeepPlayerId`
threaded at ~4918. **Mirror it for the draw step; do not invent a second mechanism.**

Cards: **Rites of Flourishing #1524 · Kami of the Crescent Moon #1817 · Dictate of Kruphix #1907** (+1 more).

**⚠️ Check FIRST whether the draw-step check function fires for EVERY player or only the active one** — that
is the real work, and it is the same question the batch-arm feasibility table asks. The detection arm is
worthless if the event only reaches the controller, and that is exactly the trap the `enter` arm hit.

## 📈 THE CEILING QUESTION — ANSWERED WITH EVIDENCE (Colton asked 2026-07-28: "can't we get top 2500 to 70%?")

**There is NO structural cap. 70% is reachable; the constraint is RATE, not possibility.**
Regenerate with `node app/scripts/probe-top2500-ceiling.mjs` (MTG_APP_ROOT set to the install).

**⚠️ THE TWO TOOLS DISAGREE BY ~0.3pp — `measure-coverage.mjs` IS AUTHORITATIVE.** The ceiling probe read
52.5% (1,312/2,500 · 1,188 parked) while `measure-coverage` read 52.2% (1,305/2,500) *later*, which is
impossible from shipping features. Cause: they slice the top 2500 from DIFFERENT POOLS — `measure-coverage`
filters to "real cards in the active index" (dropping art-series and similar), the probe uses `allCards()`
raw, so the two 2,500-card memberships differ. **Trust `measure-coverage` for any number quoted to Colton;
trust the probe for the BUCKET SHAPE only** (which is what it exists for and is unaffected by a few
membership swaps). Reconciling the probe's pool to measure-coverage's loader is a small unstarted task.

```
 381  (cum 32%)  Spell effect (other)      Chaos Warp #30 · Brainstorm #72 · Deflecting Swat #77
 195  (cum 48%)  ETB trigger               The One Ring #90 · Chrome Mox #144 · Tireless Provisioner #182
 118  (cum 58%)  Activated ability         Ashnod's Altar #132 · Sensei's Divining Top #226
 112  (cum 68%)  Upkeep/phase trigger      Arcane Denial #55 · Mana Drain #117 · Mana Vault #145
  94  (cum 76%)  Other / unclassified      Toxic Deluge #67 · Panharmonicon #261
  78  (cum 82%)  Attacks/blocks trigger    Ragavan #271 · Etali #260
```

**Four ORDINARY buckets are 68% of everything left** — spell effects, ETB triggers, activated abilities,
phase triggers. Categorically unlike cdh, where the cap is arithmetic and proven (79% now → 82% ceiling,
short by 8 multi-blocker staples). Nothing of that shape exists here.

**70% needs 438 more cards (37% of parked). 80% needs 688 (58%).**

### ⚠️ AND THE HONEST PART — THE RATE PROBLEM IS SELF-INFLICTED

This run's 14 slices moved top-2500 by only **~16 cards**, because every one was a *named single staple*
picked off the one-mode-away shortlist (Austere Command, Rakdos Charm, Cryptic Command, Warping Wail…).
Superb value per CARD — each is a real format staple — and terrible VOLUME. At ~1.3 top-2500 cards per
slice, 438 cards is hundreds of slices.

**So the strategy must change to reach 70%: stop hunting named staples, attack the BUCKETS.** The
one-mode-away list is a finishing tool, not a grinding tool — it goes quiet by construction (that is the
same instrument-blindness Colton caught twice already; see THE OBJECTIVE above).

### 🧭 THE VEINS ARE MINED OUT — what remains are THREE WAVES, each scoped below

Re-ran `probe-spell-effect-veins.mjs` after 23 slices: the pile is 381 → **371** and every remaining vein is
≤12 cards AND needs real machinery rather than vocabulary. The cheap-crossing phase of this pile is over.
**Do not go looking for another one-line fix here — pick a wave and commit to it.**

**~~WAVE A — SPELL COPY~~ ✅ SHIPPED `3c3fd256` (+5).** Remaining in it: Fork's "except that the copy is red" (changes the copy), Narset's Reversal #740 (copy + return to hand), Return the Favor #625 (Spree). ORIGINAL SCOPING BELOW — kept because the reference-implementation note is what made it quick:
**WAVE A — SPELL COPY** (Reverberate #1380 · Fork · Narset's Reversal #740 · Return the Favor #625).
`"copy target instant or sorcery spell"` is **entirely unmodeled** — the "you may choose new targets for the
copy" rider is NOT the gap, the copy itself is. Only CREATURE-spell copy exists today (Double Major, via
`snapshotCopiedCard` + the `copyNotCounter` targeting flag). Needs: a stack copy of a non-creature spell,
plus optional retargeting through `expandCastChoices`. The creature path is the reference implementation.

**WAVE B — THE ATTACK TAX** (⭐ highest RANK on the board: Propaganda #115 · Ghostly Prison #161 ·
Windborn Muse #1011). *"Creatures can't attack you unless their controller pays {2} for each creature they
control that's attacking you."* No attack-cost machinery exists at all.
**⚠️ THE FP TRAP, and it is a bad one:** modelling this as a mere RESTRICTION without actually DEDUCTING the
mana makes the AI attack for free — i.e. Propaganda does nothing while the card claims native. That is a
wrong model, not a missing one. It needs a combat-time payment (the `pendingChoice` machinery) AND an AI
decision to pay. Do not ship the restriction half alone.

**WAVE C — BATCHED ETB ENTRY. ATTEMPTED AND REVERTED — read all of this before retrying.**

**The design is CORRECT and was validated; do not re-derive it.** The one-permanent signature of
`checkEnterTriggers` is NOT the real obstacle: record each entry on a `pendingEnterEvents` queue from INSIDE
that function (covering all six call sites at once, the diesBatch trick) and drain it in `flushTriggers`
beside the graveyard / tap / counter queues. **`flushTriggers` runs at every priority-grant checkpoint
(CR 603.3), so entries between two flushes are EXACTLY the simultaneous ones** — three tokens from one effect
fire a watcher once; separate resolutions are separated by a flush. That reasoning held up; the build did not.

**WHY IT WAS REVERTED — three findings, in the order they landed:**
1. **My "~28 cards" was wrong.** The BARE forms are only **5** (Twilight Diviner, Celes, Frantic Scapegoat,
   Kotis, Back-Alley Gardener). The other ~23 carry FILTERS — "with power 2 or less" (Welcoming Vampire
   #428, Enduring Innocence #785), "with mana value 3 or less" (Tocasia's Welcome #866), nontoken, subtype,
   "tokens your opponents control".
2. **Those 5 bare-form cards flip ZERO** — every one is blocked by other text.
3. **⭐ THE ACTUAL BLOCKER, and the thing to fix FIRST:** the FILTERED clause never reaches a new detection
   arm at all. `detectTriggers` returns 0 for "whenever one or more other creatures you control WITH POWER 2
   OR LESS enter" even though a correct regex matches that exact string — so something UPSTREAM rewrites or
   rejects the clause before the arm runs. **Find that guard before writing any batch machinery**; the
   valuable cards are all behind it, and the machinery is worthless until it is found.

**AND THE COST THAT MADE REVERTING RIGHT:** the queue records on EVERY permanent entry. Paying for that with
0 cards, while the cards that mattered sat behind an undiagnosed guard, was a bad trade.

### ⭐ FOLLOW-UP: THE GUARD IS FOUND, AND WAVE C MAY NOT NEED THE MACHINERY AT ALL

**THE GUARD (finding #3 above):** `triggers.js` ~810 —
`if (!castWithExempt && /\b(?:with|while|during|named)\b/.test(c)) return null;`
A blanket reject of any trigger condition containing "with". Several PRECISELY-CHECKABLE shapes are already
carved out ABOVE it (keyword-batch combat damage, with-keyword attacks, cast-with-mana-value). A
`with power N or less` / `with mana value N or less` filter is equally checkable and belongs in that carve-out.

**AND THE SCOPING INVERTS — the FILTERED cards are the clean ones, the bare ones are hopeless:**
```
Welcoming Vampire #428   Flying + the batched trigger + the once-per-turn rider   ← NOTHING else blocks it
Tocasia's Welcome #866   the batched trigger + the rider, and nothing else        ← NOTHING else blocks it
Twilight Diviner · Celes · Kotis (the BARE forms)   all carry an "if they entered
   from a graveyard" intervening-if                                               ← blocked regardless
```

**⭐ THE CHEAP PATH — and it needs NO queue, NO drain, and NO per-entry cost.** Both clean cards carry
*"This ability triggers only once each turn"*, and that rider IS ENFORCED (`gameEngine` ~1401, keyed per
source+event on `onceTriggersFiredThisTurn`, cleared at untap). So for a card carrying the rider:

| model | behaviour |
|---|---|
| batch-once, then rider-capped | once per turn |
| **per-creature (singular `etb`), then rider-capped** | **once per turn** |

**Observably IDENTICAL** — the printed rider does the capping either way. So the batched phrasing can map
onto the EXISTING singular `etb` event, with the filter as a descriptor field.

**⚠️ VALID ONLY WITH THE RIDER.** A rider-less batched ETB mapped this way OVER-FIRES (once per token). Gate
it: have the condition matcher return `requiresOncePerTurn: true` and have the descriptor builder DROP the
descriptor when the rider is absent — the builder computes `oncePerTurnTrigger` from the effect clause and
has `cls` in hand, so that gate belongs there.

**⚠️ AND REMEMBER THE WHITELIST:** any new descriptor field (`etbMaxPower`, `etbMaxMv`, `requiresOncePerTurn`)
must be added to the explicit field list at `triggers.js` ~3171 or it is SILENTLY DROPPED — the trap that
nearly shipped the Sidisi over-fire.

### ✅ THE CATCH-ALL IS NOW DECOMPOSED — `app/scripts/probe-spell-effect-veins.mjs`

The 381-card `Spell effect (other)` pile, split into sentences with the modeled ones filtered out. The
veins, in order (top-2500 ranks shown — these are the next grinding targets, NOT single staples):

```
 12x  choose one —                                     (modal — the wrapper is built; the MODES fail)
  7x  exile ~                                          Teferi's Protection #107 · Mizzix's Mastery #796
  6x  this ability triggers only once each turn        Morbid Opportunist #255 · Welcoming Vampire #428
  5x  as an additional cost …, sacrifice a creature    Eldritch Evolution #728 · Fling #1462
  4x  gift a card                                      Dawn's Truce #359 (the Gift mechanic)
  4x  you may choose new targets for the copy          Narset's Reversal #740 · Return the Favor #625
  3x  creatures can't attack you unless … pays {C}     ⭐ Propaganda #115 · Ghostly Prison #161
  3x  you may look at the top card of your library     Bolas's Citadel #263 · Mystic Forge #414
  3x  exile target creature you control, then return   Cloudshift #792 (BLINK) — see the BLINK box below
  3x  exile top two + play them until end of next turn Light Up the Stage #1211 — see IMPULSE box
```

### ⭐ THE FAMILY IS NOW BUILT ON ONE SHAPE — DELEGATION. Reuse it; do not write a fourth subject parser.

Two arms rebuilt (`ef8bfbfc` entry, `1bc0b717` dies). Both singularize the plural subject via
`singularizeBatchSubject`, hand the clause back to `classifyCondition`, and keep only what they need from the
result. **The batch form therefore inherits the singular arm's REFUSALS as well as its capabilities and can
never be more permissive than the arm it is built on** — that containment is the entire safety argument, and
a parallel subject parser destroys it.

**The two arms differ in ONE way, and it is the thing to get right when adding the next verb:**
```
diesBatch     its OWN event + own check fn, fires once per CALL   → deaths arrive as an ARRAY: batching is REAL
              → NO rider needed
batched ENTRY mapped onto the per-entry event (etb / permanentEnters) → batching is SIMULATED
              → the printed "triggers only once each turn" rider is MANDATORY; riderless is refused
```
**Ask which one the verb is before writing anything:** if the check function already receives the whole batch,
build a dedicated event; if it receives one object, you need the rider and you must refuse without it.

### 🥇 THE BIGGEST VEIN IN THE ENGINE — "Whenever ONE OR MORE …" (CR 603.1), **291 parked cards**

Found by the vein probe and then ISOLATED with the one-diff technique. This is an order of magnitude
bigger than anything else on the board, and it is dense in the top 2500: Morbid Opportunist #255,
Kutzil #385, Welcoming Vampire #428, Caretaker's Talent #648, Enduring Innocence #785, Tocasia's
Welcome #866, The Gitrog Monster #897, Evolution Witness #914, Kambal #1145, Simic Ascendancy #1259,
Coveted Jewel #1278, Duelist's Heritage #1281, Laelia #1297, Insidious Roots #1386, Dour Port-Mage #1485.

**The one-diff isolation — the surprise is what is ALREADY done:**
```
native-trigger   Whenever another creature dies, draw a card.
native-trigger   … draw a card. This ability triggers ONLY ONCE EACH TURN.   <- the RIDER is already modeled
body-only        Whenever ONE OR MORE creatures die, draw a card.            <- the ONLY blocker
body-only        Whenever ONE OR MORE creatures you control enter, …
```
The events are modeled. The once-per-turn rider is modeled. `detectTriggers` returns **0** on the
"one or more" phrasing — it is a pure DETECTION gap, and everything downstream already exists.

### ⛔ BUT IT IS A WAVE, NOT A SLICE — and the reason is a FALSE-POSITIVE hazard, not size

**"One or more" is NOT a synonym for the singular.** "Whenever one or more creatures die" fires **ONCE**
for a simultaneous batch; "whenever a creature dies" fires once PER creature. Mapping the plural onto the
existing singular detector would OVER-FIRE — a forbidden false positive (a board wipe would draw 5 cards
instead of 1).

And the phrasing spans **SEVEN events**, each with its own check function that batches independently:
```
  77  deal (combat damage)   57  are put (into a graveyard)   46  attack   39  leave
  28  enter                  20  die                           5  become
```
`checkDiesTriggers` iterates `for (const d of dead)` and fires per object. A batched trigger needs a
SECOND pass that fires ONCE per call when ANY member of the batch matches its scope.

### ⭐ THE PATTERN ALREADY EXISTS — copy `combatDamageBatch`, do NOT invent a mechanism

**This is the single most useful thing on this page: the engine ALREADY batches triggers.** The
combat-damage arm of this very family is built and shipped — Grim Hireling / Professional Face-Breaker /
Olivia ("Whenever one or more creatures you control deal combat damage to a player"). Its anatomy:

- **A DEDICATED EVENT NAME** — `combatDamageBatch`, *not* a `batched:true` flag on `combatDamageToPlayer`
  (`triggers.js` ~1532).
- **Its own check function** — `checkBatchCombatDamageTriggers` (`triggers.js` ~5148), which fires once
  per controller rather than once per object.
- **A `descriptorFilter` predicate on `triggersForEvent`** (already a supported parameter, ~4113) that
  gates a FILTERED batch on the actual matching objects — the documented no-over-fire gate.

**A separate event name is strictly better than the whitelist I sketched above.** The singular `dies`
path is then untouched *by construction* — an unbuilt event simply has no detection and no check
function, so over-firing is unrepresentable rather than merely gated. Ignore the whitelist idea; it was
written before this precedent was found.

### ✅ ARM 1 SHIPPED — `diesBatch` (`028a999b`). **Copy this shape for the remaining six.**

The reference implementation is done and is the deliverable; the +4 cards (Morbid Opportunist #255,
Vraan #4072, Sengir Connoisseur, Vengeful Townsfolk) are almost beside the point.

**The shape to repeat, per event verb:**
1. Detection: an ANCHORED `/^one or more (…) <verb>$/` arm returning a DEDICATED event name
   (`diesBatch`), normalising the plural subject to its singular form ("one or more other creatures" →
   "another creature") and handing it to the EXISTING `creatureSubjectScope` switch — scope semantics
   shared, never duplicated. Any rider fails the `$` → undetected → Arbiter (safe FN).
2. A `check<Event>BatchTriggers(state, objects)` modelled on `checkBatchCombatDamageTriggers`: loop
   watchers, and **`break` after the first matching object** — that one line IS the batching.
3. **Chain it from INSIDE the singular check function**, not at the call sites. `checkDiesTriggers` has
   10+ callers (combat, destroy, sacrifice, amass, SBA); wiring each is how a death path silently
   misses the pass.
4. **Mind the early-return fast path** — see the bug below.
5. The pin MUST include the n=3 once-only test AND its singular n=3 counterpart firing three times.
   The contrast is the whole safety argument.

**⚠️ THE BUG THE n=1 TEST CAUGHT — expect its twin in every remaining arm.** `checkDiesTriggers` ends
with `if (!fired.length) return state2`. A board holding ONLY batch watchers fires no SINGULAR trigger,
so that early return skipped the batch pass entirely: the card classified native and never fired. **The
n=3 test passed the whole time; only n=1 exposed it.** Every singular check function has an equivalent
fast path — check it before chaining.

**CONFIRMED ON THE SECOND ARM.** `checkGraveyardEventTriggers` has the identical
`if (!fired.length) return cleared` shape. Because this entry existed, placing the batch pass ABOVE it was
a five-second check instead of a second debugging session — and the only-batch-watcher test is pinned in
`gyLeaveBatchTrigger.test.js`. **Assume the trap is present in every remaining arm until you have looked.**

### 🔍 PER-ARM FEASIBILITY — CHECKED, and it is NOT six mechanical repeats

**The arm is only buildable if its check function already sees the WHOLE batch.** `dies` worked because
`checkDiesTriggers(state, dead[])` takes an ARRAY — deaths are naturally batched by the SBA. Verified
signatures for the rest:

| arm | check function | receives | verdict |
|---|---|---|---|
| ~~`are put` (57)~~ | `checkGraveyardEventTriggers(state)` | drains `pendingGraveyardEvents` | ✅ **DONE** `e05c796b` |
| ~~`attack` (46)~~ | `checkAttackTriggers(state)` | whole combat (all attackers at once) | ✅ **DONE** `eb701643` |
| ~~`leave` (39)~~ | `checkGraveyardEventTriggers(state)` — the GY half | drains `pendingGraveyardEvents` | ✅ **DONE** `22e2293d` (+13) |
| ~~`enter` (28)~~ | `checkEnterTriggers(state, enteredPerm)` | **ONE permanent** | ✅ **DONE** `619b9513` (+3) — via the rider, no batching |

**⚡ `attack` cost ONE LINE and no machinery — check for this before building any arm.** "Whenever one or
more creatures you control attack" is merely the OLDER TEMPLATING for "Whenever you attack" (CR 508.1);
both fire once per combat, so it maps straight onto the EXISTING `youAttack` event whose once-per-combat
pass long predates this work. **Before writing a batch check function, ask whether the modern wording of
that trigger already has a once-per-event home.** It flips 0 cards today (the five bare-form carriers —
Grand Warlord Radha #5380, Angelic Guardian, Ancestor Dragon — are blocked by their EFFECTS, not
detection), and it is recorded as 0 rather than counted.

**⛔ `enter` MUST NOT be built the same way — it would over-fire.** Entries are dispatched one at a time,
so an `etbBatch` watcher would fire once PER entering permanent: "create three 1/1 tokens" would make
Welcoming Vampire #428 draw THREE cards instead of one. Building it requires first teaching the entry
path to collect simultaneous entries (token creation, mass reanimation, blink returns) and dispatch them
as one batch — a separate, larger piece of work. **Do not treat `enter` as a repeat of `dies`; the
signature is the tell.**

**So the ready work is 142 cards (are-put + attack + leave), not 214.** Plus the 16 remaining `die`
carriers, which add subtype/nontoken filters to the shape already built. `become` (5) unchecked.

**Note the 77 "deal" cards are ALREADY partly served** by `combatDamageBatch`; the parked ones there
carry a variant its anchors reject (a qualified object, a rider, a colour filter). So the true remaining
volume is nearer 214 than 291 — do not claim 291 without re-measuring per event.

### ⚠️ THE PROBE LIED TWICE BEFORE IT WAS RIGHT — both corrections are baked in, do not undo them

This instrument reported TWO false veins before it was trustworthy. Both are the same class of error as the
line-deletion trap in THE PROBE RULE, and both are now fixed in the banked script:

1. **`parseEffectClause` is not the modeled-oracle.** It misses the LEGACY whole-card path
   (`parseSpellEffect`), so plain `"draw a card"` and `"destroy target creature"` reported as blockers —
   a 9-card phantom vein. Use `classifyCard` on a synthetic single-sentence card instead.

2. **The synthetic card must carry the SOURCE CARD'S TYPE.** Wrapping every sentence as an *Instant* means
   a PERMANENT'S STATIC can never classify native however well modeled. That reported
   `"you may play an additional land on each of your turns"` as a 4-card vein (Dryad of the Ilysian Grove
   #295, Oracle of Mul Daya #499, Wayward Swordtooth #986) when `extraLandDropsOf` has modeled it all
   along — Exploration and Azusa are `native-static` TODAY. Those three are parked for their OTHER lines
   (Dryad's basic-land-type layer effect, Oracle's play-from-top, Wayward's Ascend).

**Both were caught by checking the claim against the real cards BEFORE building.** That check costs one
command and it has now prevented two wasted slices in a single sitting.

## THE SHELF (secondary read — no longer the bar, kept because it is measured and true)

## THE TARGET — the real shelf, measured

Measure with the REAL profile dir, not the dev tree:
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```

At run start: Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 90 · Mothman 90 · **Earth Bent 80 · cdh 79 ·
Dragons 76 · Jurassic 75 · Believe it 72 · Kellan 70 · Wolverine 70 · Captain America 69 · Kinnan 69.**

Blocking mechanisms, ranked by that same tool: 97 spell-effect · 78 ETB trigger · 35 attacks/blocks ·
33 upkeep/phase · 27 activated · 16 cast trigger · 15 static anthem · 11 aura/equip · 9 dies/LTB.

**Prefer mechanisms that appear across MULTIPLE decks** — one ETB pattern can move four decks at once.
That is the whole reason this target beats corpus %.

## THE DISCIPLINE (non-negotiable — this is what earned the autonomy)

1. Full suite + `eslint . --max-warnings 0` before every commit. Not the targeted tests — the FULL suite.
   It has caught things targeted runs could not (a dropped `"backup"` that silently un-credited 19 cards).
2. **Mutation-check every load-bearing change.** Break it on purpose, watch the RIGHT test fail, restore.
   A green test proves nothing until it has been seen to fail. Grep for the marker afterwards — a perl
   substitution has silently failed to apply before.
3. **THE PROBE RULE — a "would flip" probe must SIMULATE THE FIX AND CHANGE ONE VARIABLE.** This cost
   more time than anything else in the run; it misfired FOUR times, three of which I acted on before
   catching. The failure is always the same: **deleting the whole line** answers "is the REST of the card
   modelable?", which is not the question. The line carries the trigger, the condition, and the effect
   together, so a card blocked by any of them scores as blocked by the one you're studying.
   - **Right instrument:** substitute a KNOWN-GOOD equivalent for the one thing under test and re-classify.
     Swap the unknown token name for Treasure. Swap the unrecognized condition for "you control a Forest".
     Everything else on the card holds still, so the delta is attributable.
   - It turned a "68-card lever" into 15 real cards, and it killed a "5-card Lieutenant cycle" that was
     worth **zero** — the condition was never the blocker there, the compound static content was.
   - **Second clause:** a "would flip" probe measures whether the METRIC would credit a card. It says
     NOTHING about whether crediting it would be CORRECT. The tap-another-permanent mana sources "would
     flip" 5 cards and would mint phantom mana. Check the runtime can actually pay/execute before believing
     any number.

4. **Re-measure, don't infer.** When a flip count and a corpus delta disagree, isolate by disabling only
   that change and re-measuring. Twice this run the gap was innocent; assuming would have been wrong both times.
5. **Per-flip audit** anything over ~10 cards. Read the cards.
6. CI green on master before tagging. Never tag a red tree.
7. When a diagnosis and the runtime disagree, **the runtime wins** — and correct the written diagnosis in
   place rather than quietly rewriting it.

## IN FLIGHT

### ✅ SHIPPED — Esper Sentinel (`a117f8a5`, rank **76** · Kellan 71→72% · Cap America 67→68%)

Both halves landed. **A** the "first <kind> spell each turn" FREQUENCY gate (CR 603.2) — **per PLAYER**, not
the source's once-per-turn, so three opponents means up to three fires a turn. The bare form was already
handled by `castNth`; only the filtered form was missing, so this adds a noncreature counter beside
`spellsCastThisTurn`. **B** the LIVE tax amount — `{X}` resolved at resolution through the SAME `selfPower`
metric slice 78 built, so a grown Sentinel taxes more and the tax can never drift from the mana model.

**⚠️ THE FIRST ATTEMPT SHIPPED AN OVER-FIRE THAT LOOKED PERFECTLY HEALTHY.** `firstEachTurn` was not in
`detectTriggers`' descriptor whitelist, so it was silently dropped — the built descriptor kept only its
`spellFilter` and fired on **every** opponent noncreature spell. `detectTriggers(card)` showed an event and
a filter and looked right. **The ledger already records this exact trap from batchCommander** ("new
descriptor field → the whitelist, or it is silently dropped") and I walked into it anyway. *Read the BUILT
descriptor, never the arm's return.*

**⭐ A SURVIVED SABOTAGE CHECK THAT WAS A TEST GAP, NOT A REDUNDANT GUARD — the third this run, and the
first of that kind.** Weakening the runtime gate from `n !== 1` to `n < 1` (fire on EVERY cast) left every
descriptor and counter assertion green. Those covered the two halves; **nothing covered the join**, which is
the only place the card's behaviour lives. Six end-to-end assertions now drive `checkCastTriggers` directly.
*When a check survives, ask which of the three it is: redundant guard, untested guard, or untested SEAM
between two tested halves. Storm and the pip qualifier were the second kind; this was the third.*

**Tier diff GAINED 1 / LOST 0** — scored honestly per `eb701643`: the trigger half reaches **9** cards, each
still needs its own payoff modelled, and only Esper Sentinel had both. Predicted and confirmed, not
discovered.

Mutation-checked: **M81** drop the whitelist entry → killed by 2 · **M82 SURVIVED** → end-to-end section →
**M82b** killed · **M83** count creature spells as noncreature → killed by 2 · **M84** ignore the metric →
killed by 2.

⚠️ **A NOTE ON THE BOOT SWEEP:** my first draft of the new test wrote the literal marker word in a comment,
which would have tripped `grep -rl MUTANT app/src/` on every future boot and trained the next session to
ignore a real alarm. Reworded. **Never let that token appear outside a live sabotage check.**

- **Nothing mid-edit.** Corpus **36.1%** (12,344/34,245). Suite **956 files / 12,176 tests**,
  lint 0, MUTANT sweep clean. Branch `claude/aura-enchant-noun-vocab` (NOT pushed; the name is stale —
  it carries dozens of unrelated slices and wants a rename before any PR).

  **PLAY-WEIGHTED — the bar:** top-1000 **73.2%** 🎉 · top-2500 **55.0%** · top-5000 **43.5%** · top-10k **36.1%**.
  (Session start: 69.6 / 51.8 / 41.5 / 34.7.)

  **SHELF:** six decks at/above 90% — Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 92 · Mothman 90 ·
  Earth Bent 90. Next real target **Did you say Dragons? 80%**. Aggregate **81%** (Colton's own 5 decks: **92%**). cdh 81% (capped ~82 — do not start).

  **⚠️ THE SHELF IS NOW WAVE-SHAPED, NOT SLICE-SHAPED — read this before hunting for another quick win.**
  Every deck below the bar needs 13+ cards across DISTINCT mechanics; the one-line-away list's repeated
  shapes are worked out (equipment-combat-damage: non-lever · power-scaled mana: shipped). Dragons needs 12
  and has 12 one-line-away rows, each its own build. Sized cold, so the next session does not re-derive it:
  ```
  Hellkite Courser   NO COMMAND ZONE in gameState — a whole zone, not a slice
  Ancient Brass Dragon  d20 roll
  Klauth             TRIGGERED mana + spend-restricted — the over-claim class, likely a refusal
  Terror of the Peaks   a LIFE-cost tax on opponents' spells — Hexing Squelcher's class
  Morophon           ✅ SHIPPED (colored-pip cost reduction)
  ✅ Tiamat SHIPPED · Sarkhan Soul Aflame · Betor · Call the Spirit Dragons · Scion of the Ur-Dragon · Lorehold  multi-piece
  ```

### Shipped this stretch — EVERY ONE was "the engine knew the EFFECT, not the PHRASING"

| commit | slice | flips |
|---|---|---|
| `3259071d` | attached-bonus parser reads the host NOUN, not the literal `"creature"` | 0 — infrastructure |
| `48d8560c` | positive COLOR target restriction (CR 105.2), layer-aware | **+18**, incl. Red Elemental Blast #433 |
| `4f915ba6` | whole-graveyard exile (CR 701.10a) + mass-exile verb parity | **+10**, incl. Farewell #163 |
| `1fc6a1f8` | mana-value-filtered creature wipe (CR 202.3) | **+2**, incl. **Austere Command #169** |
| `40359cd4` | disjunctive power-OR-toughness bound | **+1**, Warping Wail #2046 |
| `45a9e771` | symmetric self-damage atom (CR 119.3) | **+1**, **Rakdos Charm #330** |
| `97415979` | mass own-board regenerate (CR 701.19) + `eachCreatureYouControl` scope | **+1**, Golgari Charm #1603 |
| `0361e27c` | opponent-scoped mass tap (CR 701.21a) — applier now honors non-chosen scopes | **+1**, Cryptic Command #1617 |
| `b7bf0e46` | counter an ABILITY on the stack (CR 701.5a) — new `stackAbility` target class | **+7**, Stifle · Bind · Trickbind · **Sublime Epiphany #1709** |
| `75dbd1a1` | repeatable modes (CR 700.2d) — `kMultisets` in the cast enumerator | **+5**, **Mystic #1431** · **Fiery Confluence #1561** |
| `028a999b` | batched DEATH triggers (CR 603.1) — new `diesBatch` event ⭐ reference impl | **+4**, **Morbid Opportunist #255** · Vraan #4072 |
| `eb701643` | batched ATTACK → the existing `youAttack` event (one line, no machinery) | **0** — detection half only, honestly scored |
| `22e2293d` | batched GRAVEYARD-LEAVE — new `gyLeaveBatch` event | **+13**, **Insidious Roots #1386** · Desecrated Tomb #4196 · Quintorius #9596 |
| `f682aadb` | scoped counters-put WATCHERS — the slice the source comment deferred | **+2**, Enduring Scalelord · Wickersmith's Tools |
| `e05c796b` | batched graveyard-ENTER + a silently-dropped zone filter ⚠️ | **+1**, Sidisi #3513 |
| `c5e68496` | BLINK / FLICKER (CR 400.7) + a splitter keep-whole guard ⚠️ | **+7**, **Ephemerate #440** · Cloudshift #792 · Blur · Momentary Blink |
| `a3488b65` | impulse-exile takes a COUNT (the runtime already existed) | **+2**, Act on Impulse · Rob the Archives |
| `db4e6d51` | SACRIFICED REFERENT (CR 608.2h LKI) — narrowed a safety guard ⚠️ | **+7**, **Fling #1462** · Thud · Bloodshot Cyclops |
| `484c3a0d` | …second reader off that stamp: GAIN-LIFE | **+7**, Reckoner's Bargain #3671 (family 14) |
| `6e030eb0` | …third reader: DRAW | **+2**, Life's Legacy #2490 (family 16) |
| `46798947` | …and the NATIVE-TRIGGER chain gets the same strip | **+1**, plus 42 cards RETIERED mixed→trigger (a better label, not a gain) |
| `f61fd1d6` | ⭐⭐ **THE RESIDUE CHAIN STOPS GUESSING** — measured GAINED 49 · LOST 0 · RETIERED 0 | **+49** corpus-wide; Abbot of Keral Keep · Sea Gate Oracle · Voldaren Epicure · Adaptive Omnitool |
| `6d892d21` | ⭐ **EQUIPMENT composes with its trigger** — a composition gap, not a card gap | **+8**, **Mask of Memory #1002** · **Goldvein Pick #2100** · Prying Blade · Skeleton Key |
| `2c90b6fa` | typed uncounterable — the read went per-PLAYER → per-SPELL | **+2**, Prowling Serpopard #3581 · **Surrak Dragonclaw #3186** |
| `58c1dd23` | ⚠️ subtype-scaled MANA — the vocabulary gate runs the OPPOSITE way | **+4**, **Elvish Archdruid #942** · Magus of the Coffers #5409 |
| `04a8e665` | activated-cost reduction for ARTIFACTS — the subject is a FILTER | **+1**, Forensic Gadgeteer #1374 |
| `44e2b391` | the "creature TOKEN you control" trigger scope — THREE states, not two | **+2**, **Curiosity Crafter #1734** · Anointer Priest #11214 |
| `469bee92` | ⭐ the **"ANOTHER" qualifier** (CR 109.5) — bounce target + ETB scope | **+7**, **Aether Channeler #1526** · **Garruk's Packleader #2014** · Paleoloth |
| `1b43caf7` | ⚠️ basic-land-SUBTYPE tap augment — a banked "can't" that wasn't true | **+2**, **Crypt Ghast #525** · Nirkana Revenant #2848 |
| `80261920` | untap target ARTIFACT / ENCHANTMENT / NONLAND PERMANENT — vocabulary, not machinery | **+6**, **Voltaic Key #1776** |
| `766bfabe` | ⭐ ENTERS-trigger multiplier — **two** fire sites (ETB *and* landfall) | **+4**, **Panharmonicon #261** · **Ancient Greenwarden #681** · **Yarok #2530** · Starfield Vocalist #2082 |
| `3b2ac11a` | ATTACK-trigger multiplier — Teysa's twin, shared expansion body | **+1**, **Isshin, Two Heavens as One #1456** |
| `d0d0c09c` | token-split + planeswalker EDICT pools — the sense IS the card | **+5**, **Sheoldred's Edict #1154** · **Accursed Marauder #464** · Angrath's Rampage · M.O.D.O.K. |
| `7a1fab1d` | type-filtered untap — the family's 3rd shape, PARAMETERIZED not a 3rd twin | **+3**, Unwinding Clock #545 · Drumbellower #1940 · Prophet of Kruphix |
| `ab92c504` | ⭐ **THE MISSING-CROSS FINDER** (probe) + COLOR×TYPE cost reduction | **+4**, the **Monument cycle** #664 · #1009 · #1879 · #2151 |
| `9d1e4f8b` | lands-only play-from-top — needed a NEW spell gate to stay honest | **+2**, **Oracle of Mul Daya #499** · **Courser of Kruphix #1232** |
| `d1cc3eb4` | the you-scoped land doubler — an empty CELL, zero new machinery | **+2**, **Mirari's Wake #680** · Zendikar Resurgent #2260 |
| `0168559a` | ⭐ **WAVE B — the ATTACK TAX** (CR 508.1g): restriction + payment as ONE change | **+3**, **Propaganda #115** · **Ghostly Prison #161** · Windborn Muse #1011 |
| `b9d1d3c9` | ⭐ THE DRAIN MIRROR — lifegain⇄lifeloss, one UNBLOCKED + one RE-POINTED | **+6**, **Sanguine Bond #496** · **Vito #492** · **Exquisite Blood #508** · Bloodthirsty Conqueror #901 |
| `619b9513` | ⭐ WAVE C — batched-ETB filter, WITHOUT the batch machinery | **+3**, **Welcoming Vampire #428** · **Tocasia's Welcome #866** · Enduring Innocence #785 |
| `3c3fd256` | ⭐ WAVE A — copy an instant or sorcery (CR 707.10) | **+5**, **Reverberate #1380** · Reiterate · Twincast |
| `9381112d` | impulse NEXT-TURN window — controller-scoped expiry ⭐ | **+6**, **Light Up the Stage #1211** · Reckless Impulse #2120 · Wrenn's Resolve #2116 |

### ⭐ THE MISSING-CROSS METHOD — `app/scripts/probe-near-miss-clauses.mjs` (banked 2026-07-28)

Four slices in a row were the same shape and **none was a new mechanic**: a parked clause sitting one
word from a clause the engine already reads, with the runtime for it fully built. A grid whose other
cells exist and whose corner nobody closed.

```
MANA DOUBLER          all players            controller ("you tap")
  land                MF-1 Mana Flare ✓      ← Mirari's Wake sat HERE
  nonland             —                      MD-1 Kinnan ✓

COST REDUCTION        color only             color × card-type
                      Ruby Medallion ✓       ← the Monument cycle sat HERE
```

**Run it before hunting named staples.** `--maxRank=2500 --distance=1` is 28s and returned 23 honest
candidates. `--distance=3` widens to 157.

⚠️ **NEAR ≠ EASY.** "Destroy target creature" and "Exile target creature" are one word apart and
different subsystems. The probe sizes the candidate list; the build still opens the file.

⚠️ **AND THE PROBE'S FIRST TWO RUNS WERE BOTH WRONG.** `land` is inside `NATIVE_TIERS`, but a land is
credited *wholesale by its type line* — its printed abilities may be entirely unmodeled. Harvesting
land text as "shapes the engine reads" produced a confident false lead (Ashnod's Altar ← Phyrexian
Tower, whose sac-for-mana is **not** modeled); excluding lands from the harvest *alone* was worse —
they fell into the parked branch and the report's whole top became phantom "blocks 13 cards" clusters.
Lands are skipped outright now. **A ranked list of plausible leads is exactly the output that doesn't
announce when it's wrong.** Verify against the corpus, never off the report.

**⚠️ THE CHEAP CROSSES ARE EXHAUSTED.** Twelve of the original nineteen distance-1 rows shipped this
run; the remainder is **wave-sized, not slice-sized**. Checked card by card, not assumed — each row
below needs a subsystem that doesn't exist yet, and each is worth roughly ONE card.

| card | what it actually needs | flips |
|---|---|---|
| Aqueous Form #735 | an `unblockable` grantable pseudo-keyword + enforcement in canBlockAttacker | 1 of 2 |
| Blade of Selves #905 | the MYRIAD keyword itself (unbuilt) | 1 |
| Reprieve #633 | a SPELL target class for bounce — only counters can target the stack today | 1 |
| Mother of Runes #512 | protection-from-a-chosen-colour, as an activated grant | 1 |
| Deafening Silence #1946 | a per-turn cast limit filtered by card type | 1 |
| Helm of Awakening #1889 | a SYMMETRIC cost reducer — the collector is controller-only by construction | 1 |

✅ **The can't-be-countered AND is DONE** (`2c90b6fa`) — it was the last row with a better-than-one-card
ratio, so **everything left in this table is subsystem work**: a keyword, a target class, or a scope the
engine doesn't express.

**`--distance=2` on the top-2500 was then run** (44 blockers) and it does NOT change that picture — the
new rows are all one card each, but they're cheap-looking and un-triaged, so they're recorded rather
than lost:

| card | the gap | note |
|---|---|---|
| Stormfist Crusader #1913 | `each player` vs `target player` draws-and-loses | an eachPlayer arm on a compound upkeep payoff |
| Spine of Ish Sah #2486 | "when this **artifact** is put into a graveyard…" vs "this **aura**" | a noun widening on the self-return; its ETB destroy already parses |
| Junk Diver #1977 · Myr Retriever #875 | dies + **another** target artifact card in your graveyard | ⚠️ "another" here excludes a GRAVEYARD card, and `notSource` matches battlefield permanent ids — not the same restriction |
| Adaptive Omnitool #2237 + 3 | an equipment trigger whose effect spans SENTENCES | the trigger-sentence strip can't fold them — a different gap in a different chain |

✅ **Goldvein Pick was looked at first and it paid — 8 cards, not 1** (`6d892d21`). The equippedCreature
scope was never the problem; two TIERS couldn't talk to each other, and each understood its own half.

⭐ **That is the transferable lesson of this whole run.** When a near-miss row can't be explained by its
own one-word diff, spend ONE probe on *why not* before writing it off as a one-card cross. Three of the
biggest finds today — the mana-doubler cell, the untap type list, this one — were all "the machinery is
built, the composition isn't."

### 🔶 THE NEXT PROBE TO RUN — `app/scripts/probe-residue-artifacts.mjs`

Asks the sub-gates directly instead of reading the tier: for every parked card, does EVERY detected
trigger route, is EVERY activated ability modeled, and was every trigger-SHAPED sentence actually
DETECTED (that third check is not optional — without it Archaeomancer's Map reported as a candidate
because its ETB routes while its second trigger isn't detected at all, so "every detected trigger
routes" passed vacuously). **68 such cards in the top-2500.** It prints the leftover text so a genuine
unmodeled static can be told from a residue artifact by eye.

Reading that list, the big remaining cluster is **EQUIPMENT/AURA grants the layer engine can't express**:
unions ("can't be blocked and has shroud"), conditionals ("as long as equipped creature is legendary"),
myriad, nonbasic landwalk. Most are honestly parked. See the attached-unblockable entry under
BLOCKED / REFUSED before touching any of them — that seam bites this whole cluster.

### ✅ DONE — the residue chain's trigger strip was a REGEX GUESS (`f61fd1d6`, +49 · LOST 0)

Chasing the four Equipment that still park (Adaptive Omnitool #2237 · Sword of Hours · Reaper's Talisman
· Mask of Immolation) leads somewhere general. Every residue chain in `coverage.js` strips trigger
sentences with

```js
.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n")
```

`[^.]+` stops at the FIRST period. So a trigger whose EFFECT spans sentences — Adaptive Omnitool's
"look at the top six… You may reveal… Put the rest on the bottom…" — is verified as modeled by
`allTriggerSentencesModeled` (the span matchers fold it into one trigger, correctly) and then leaves its
2nd and 3rd sentences behind as *apparent residue*, sinking a card every piece of which is understood.

The accumulated `.replace()` tail-strips (reflexive "if you do", the entering-pronoun pump, the
counters-on-it tail) are all **patches on that one wrong assumption** — each added when a specific card
fell through.

**Shipped.** Strip what detectTriggers actually consumed — `effectClause`, which carries the WHOLE folded
effect (`sourceText` does not; it truncates at the first period, so the obvious field is the wrong one).
**GAINED 49 · LOST 0 · RETIERED 0**, measured per card.

⭐ **`app/scripts/tier-snapshot.mjs` is the tool that made this safe and is the reusable part.** A TOTAL
can hide a swap — five gained and five lost nets zero and reads as "no change". For any change to a
SHARED path (a residue chain, the layer engine, a splitter) run it before and after and diff per card;
it classifies every movement GAINED / LOST / RETIERED and exits non-zero on any LOST.

⚠️ **TWO BUGS ON THE WAY, both worth knowing:**
1. **My licence was wrong.** I claimed `allTriggerSentencesModeled` proved every sentence parses HIGH so
   stripping was free. It doesn't — that gate passes for triggers whose folded follow-up is unmodeled,
   and for those cards *the residue check is the only guard*. Four FP pins went red. The licence is
   per-descriptor `triggerRoutesNatively`. **Measured afterwards, it is inert today** (remove it: suite
   green, diff zero) — labelled as belt-and-suspenders in both source and test rather than sold as a guard.
2. **`\s` matches a NEWLINE.** The strip swallowed the line break, welded the NEXT oracle line onto the
   stripped one, and hid it — Drowner of Hope credited native with a real unmodeled ability.
   `tokenAbilityGrantResidue.test.js` pins that exact card for that exact reason, **from a previous
   author's previous attempt at this same idea.** I reproduced it verbatim. Horizontal whitespace only.

**FOUR scope pins graduated, every one DRIFTED into looking like a safety pin** — each was parking its
card only because the residue chain left a sentence behind, for a reason that had stopped being true:
the optional discard, Blood tokens, the folded `damageRider`, and — on the trigger chain — a
discard-CHOICE from a trigger, which now fires, resolves, and pauses with correctly filtered candidates.
Verified end to end, not assumed.

⭐ **THE PATTERN, banked because it will recur:** a residue check that parks a card for the WRONG reason
looks exactly like one that parks it for the right reason, and the pins written on top of it age into
false confidence. That is why the **per-card tier diff — not the total —** is what makes this class of
change safe to attempt at all.

**NOT crosses, don't re-diagnose:** Shriekmaw #1546 — its "sibling" is also unparsed. Jhoira's Familiar
#1035 — "historic" isn't a type-line token, and that refusal is CORRECT.

**Deliberately NOT taken:** the Altar family (Ashnod's #132, Phyrexian #307, Skirk Prospector #1351,
Krark-Clan Ironworks #1356 — 12 corpus carriers). A costless "Sacrifice a creature: Add {C}{C}" needs
the mana model to pick a *victim* at production time; the modeled sibling sacrifices the SOURCE. Real
work, not a cross — but the best-sized unbuilt mana lever on the board.

### 🔶 THE TRIGGER-MULTIPLIER FAMILY — three of five shapes built; the 4th is scoped and NOT worth it

"If <event> causes a triggered ability of a permanent you control to trigger, that ability triggers an
additional time." All of it now shares one expansion body (`multiplyTriggers`, parameterized by its
counter) and one `triggerMultiplierCount` walk, so the distinct-instance rule can't fork.

```
  ✅ DIES     Teysa Karlov #1270                                  (pre-existing)
  ✅ ATTACKS  Isshin #1456                                         3b2ac11a
  ✅ ENTERS   Panharmonicon #261 · Greenwarden #681 · Yarok #2530   766bfabe  ← FILTERED, two fire sites
  ⛔ CAST     Veyran #789 · Wulfgar #4729 · Felix Five-Boots #4799  — not attempted
  ⛔ SOURCE   "a triggered ability OF <filter> you control"         — MEASURED AND DECLINED, see below
```

**The SOURCE-filtered shape is the one to skip, and here is the receipt.** It multiplies ANY trigger
from a matching permanent regardless of event, so it can't ride an enqueue site — it wants a pass at
the `flushTriggers` chokepoint, which is more surface than any slice this run. A one-diff probe on all
seven carriers says the payoff is **2 cards**: Harmonic Prodigy #676 and Katara #4836, and BOTH need a
subtype filter with an "another" exclusion. Delney #854, Annie Joins Up #1033 and Echoes of Eternity
#1505 all stay parked on their OTHER text even with the multiplier free. Don't build it on the
strength of the name recognition.

Also parked with a NAMED reason, not an oversight: Naban #6168 and Traveling Chocobo #2035 (controller-
qualified / subtype entry filter), Elesh Norn #1003 (her second static HALVES opponents' triggers — a
genuinely different mechanism), Drivnod #1801 (Teysa's own twin, blocked on its activated ability).

### 🔶 IMPULSE-EXILE — the COUNT is done; the **NEXT-TURN WINDOW** is the remaining 22 cards

`a3488b65` generalised the count only. The family splits cleanly by (count / window), measured:
```
  27  N>1 / this-turn    ✅ machinery done (a3488b65) — most still parked on their OTHER text
  22  N>1 / NEXT-TURN    ⛔ BLOCKED — needs a controller-scoped expiry
  10  N>1 / other        (until-your-next-end-step, "one of those cards", filtered)
```

### ✅ THE NEXT-TURN WINDOW IS DONE — `9381112d` (+6). The pattern below is reusable for any "your next turn".

Solved WITHOUT arithmetic on the turn counter: the stamp carries the **OWNER** plus its creation turn, and
`gameEngine.finishCleanupActions` lapses it when a turn ENDS that (a) belongs to that owner and (b) began
after the stamp. Cleanup runs BEFORE the turn advance, so `state.activePlayer` is the ENDING turn's player —
that is the fact the whole rule rests on. Correct for both castings (own turn / opponent's turn), pinned in
`impulseExtendedWindow.test.js`.

**TWO SITES, DELIBERATELY ASYMMETRIC — copy this shape.** The offer gate (`legalChoices`) treats the mere
PRESENCE of an extended stamp as permission; ONLY the cleanup knows when it dies. Giving both sites the
window logic is precisely how they drift; giving exactly one the authority removes the possibility.

**Reuse it for any other "until your next turn" effect** — the same owner-plus-stamp-turn trick applies and
needs no scheduler.

**⛔ THE ORIGINAL ANALYSIS (kept — it is why the fix took the shape it did): do not "just add turn + 1".** `state.turn`
increments once per PLAYER turn, so in a 4-player game "until the end of YOUR next turn" is roughly
`turn + 4`, not `turn + 1`. The shipped `_impulseTurn === state.turn` gate and the cleanup that strips it
both assume a single-turn window. Reusing that stamp closes the window at the WRONG MOMENT — a wrong
effect, not a missing one. `templateMatchers.matchImpulseExilePlay` documented this refusal before I got
here and it still stands.

**The shape of the fix:** stamp a controller-scoped expiry (an `_impulseUntil` keyed to the controller's
next turn, or schedule the lapse through the delayed-trigger scheduler that already exists) and change BOTH
the offer gate (`legalChoices.actionsPlayImpulseFromExile`) and the cleanup (`gameEngine
.clearImpulsePlayPermissions`) to read it. Two sites, and they must not drift.

**⚠️ ALSO: read the printed wording before writing the matcher.** My first pass admitted "them" but not
"those cards" and flipped ZERO cards — "those cards" is the dominant printed referent (6 carriers vs 3).
The fix took seconds; finding it took a corpus dump. Dump the real sentences first.

### ✅ BLINK / FLICKER — SHIPPED `c5e68496` (+7). The lesson below outlived the blocker; keep it.

**Ephemerate #440 · Cloudshift #792 · Blur #2252 · Momentary Blink #2675 · Acrobatic Maneuver #5574 ·
Personify · Settle Beyond Reality.** The atom was pure composition (moveCardToZone off the battlefield →
`enterCardFromZone` back on); the real work was the splitter, described below, which is why the original
"blocked" analysis is kept rather than deleted.

### ☠️ THE SPLITTER'S SAFE-FAILURE ASSUMPTION HAS AN EXCEPTION — the generalisable finding

`splitClauses` reasons, in its own comment, that a mis-split *"just yields an unmodeled clause → low →
Arbiter, never a confident wrong partial."* **That is true only when every fragment is individually
unmodelable.** Blink is the counter-example:

```
"Exile target creature you control, then return that card to the battlefield under your control."
   split →  "Exile target creature you control"            <- parses HIGH, entirely on its own
            "return that card to the battlefield…"          <- fails
```
**⚠️ CORRECTION TO MY OWN FIRST WRITE-UP (verify before repeating it).** I first recorded this as the card
*"becoming a spell that exiles your creature and never returns it."* **That overstated it — the hazard was
LATENT, never live.** The trailing fragment is LOW on its own, so the whole program was LOW and the card
PARKED. Nothing ever played wrong. Checked by parsing the orphaned fragment in isolation.

The accurate statement, which is still worth the guard: **the card's safety depended entirely on the
TRAILING fragment failing to parse.** The leading one is a complete, confident instruction. The day anything
teaches the parser "return that card to the battlefield" in isolation — a plausible future slice — the card
flips native meaning *exile, then return something unbound*. The split moved the safety from "by
construction" to "by luck", and that is what the keep-whole guard restores.

**THE RULE: before trusting a split to fail safe, parse the LEADING fragment alone.** If it is HIGH, the
split is not safe and the sentence needs a keep-whole guard (the mechanism the conditional-rider seams at
`splitClauses` ~455/473 already use).

### ✅ HUNTED FOR LIVE FALSE POSITIVES OF THIS CLASS — **found none.** Do not re-run this.

The obvious follow-up worry: are there NATIVE cards where a split orphaned a back-reference ("it", "that
card", "those creatures") and the fragments all parsed anyway — i.e. cards playing the wrong effect today?
Swept all **11,141** native cards for a split fragment OPENING with a back-reference. 158 flagged; the
highest-value ones were checked by hand and **every one is correctly bound**:

```
Swords to Plowshares #11  exile + controllerRider{gainLifePower}
Path to Exile #15         exile + controllerRider{rampBasic, entersTapped}
Beast Within #25          destroy + controllerRider{createToken 3/3 green Beast}
Swan Song #71             counter + controllerRider{createToken 2/2 blue Bird, Flying}
Assassin's Trophy #124    destroy(opponent) + controllerRider{rampBasic}
Pongify #155              destroy + cannotRegenerate:true + controllerRider{createToken}
Inspiring Call #270       draw{requiresCounter} + grant-keywords-group{requiresCounter}  ← scope matches
```

**⚠️ AND THE INSTRUMENT CORRECTION, which is why the 158 is not a finding:** `splitClauses` output is **NOT
the parser's final clause set.** The SPAN MATCHERS (`spanMatchers.js`) fold multi-sentence patterns —
"…Its controller creates a 3/3" becomes a `controllerRider` ON THE SAME ATOM — before/independently of the
clause split. So reading `splitClauses` alone massively over-reports orphans. **To reason about what the
engine actually does, read the ATOMS of `parseEffectProgram`, never the clause split.**

Blink was reachable only because no span matcher covered its shape. The class is otherwise well defended.

### 🔵 THE ORIGINAL BLOCKED ANALYSIS (kept — it is how the above was found)

**Ephemerate #440 · Conjurer's Closet #485 · Cloudshift #792 · Essence Flux #928 · Blur #2252 · Momentary
Blink · Splash Portal · Acrobatic Maneuver · Siren's Ruse …** — a core Commander mechanic at 0 native.

**ATTEMPTED AND REVERTED THIS SESSION — read this before re-attempting.** The atom and applier are
straightforward and were written: blink is pure COMPOSITION of two existing chokepoints —
`moveCardToZone` off the battlefield (fires LTB) then `enterCardFromZone` (the same helper reanimation
uses, fires ETB). CR 400.7's "new object" (fresh id, no counters, summoning-sick) follows for free because
`enterCardFromZone` mints a new permanent.

**The blocker is upstream of all that.** `splitClauses` breaks the printed sentence on ", then":
```
"Exile target creature you control, then return that card to the battlefield under your control."
  ->  ["Exile target creature you control",
       "return that card to the battlefield under your control"]
```
So a whole-clause matcher is UNREACHABLE — the first fragment parses HIGH on its own (a plain exile!) and
the second fails, dropping the card. Writing the atom without fixing the splitter produces dead code, which
is why it was reverted rather than left in the tree.

**THE FIX, with precedent:** `splitClauses` already carries normalize FOLDS that rewrite a sentence before
the split — see the WHEEL fold (~line 120) turning `"each player discards their hand, then draws N cards"`
into two properly-subjected sentences. Blink needs the mirror: a fold that keeps the two halves together (or
rewrites them into one recognisable clause) so the matcher sees the whole thing.

**Do it in a session with room.** `splitClauses` shapes EVERY card's parse, so it is the highest-blast-radius
file touched by this vein — worth the full suite between each step, not a tail-end slice.

**⚠️ And note the shape of the trap:** the first fragment parsing HIGH as a bare exile is exactly the kind of
partial success that could ship a card which EXILES a creature and never returns it. Any future fold must be
paired with a runtime test that the creature comes BACK and its ETB fires.

### 🩸 THE SACRIFICED REFERENT — `db4e6d51`. Capture is GENERAL; only the DAMAGE arm reads it yet.

`state.sacrificedForCost = { power, toughness, manaValue }` is stamped by actionDispatcher at COST-PAYMENT
time (the only moment the victim is still on the battlefield — CR 608.2h + 603.6e LKI), read back through
`countForSpec` kinds `sacrificedPower` / `sacrificedToughness` / `sacrificedManaValue`, and the phrase lives
in the SHARED `parseCountSource` so every scaling atom family gets it from one edit.

**~84 parked cards reference this** (29 power · 23 mana value · 18 toughness · 7 "power to any target").
Family is at **14 native** after two readers (damage `db4e6d51`, gain-life `484c3a0d`).

**⭐ THE SHAPE OF THE REMAINING WORK: this vein is ONE capture plus N SMALL READERS, not one fix.** Each
atom family carries its OWN "equal to …" grammar rather than sharing one, so the stamp has to be read
per-family. Every reader so far has been a two-line sibling of an existing `the triggering creature's …`
arm in the same file — find that arm, copy it, swap the count kind. Near-mechanical.

**⚠️ TWO TRAPS INSIDE THAT, both hit for real:**
1. The triggering-creature arms are SENTINEL-gated ("the triggering creature's …" is text `detectTriggers`
   writes INTO a trigger, never printed on a spell). Assert a new reader at the CLAUSE level, not with a
   whole-card fixture — a card fixture tests the sentinel gate instead of your arm and fails for the wrong
   reason.
2. **Check whether the sibling arm you are copying TAKES A TARGET.** The draw family's neighbour is
   "draw cards equal to the power of TARGET creature", which does. The sacrificed referent is the
   ALREADY-PAID cost, so `targetType` must be null — copying the neighbour would make the spell demand a
   target it never prints (a wrong cast, not a missing one). Pinned with both arms side by side.

**⚠️ AND A PROBE CORRECTION — do not trust a "governing verb" bucket without checking the tier.** Bucketing
this vein by verb reported 9 parked gain-life cards; most were not gaps at all. Miren, the Moaning Well is
`land` tier (already counted playable), Animal Boneyard and Bloodshot Cyclops had ALREADY flipped, and Life
Chisel is blocked by "Activate only during your upkeep" — not the referent. Check the tier and the ACTUAL
blocker before queueing from a verb bucket.

Next reads, cheapest first:
```
~~gain-life  equal to the sacrificed creature's toughness   Reckoner's Bargain #3671~~  ✅ 484c3a0d
discard    a number of cards equal to its power           Tormented Thoughts #22752 — needs a NEW discard-scaled matcher (the arm is absent even for the ordinary count form)
tutor      a creature with mana value X or less           Eldritch Evolution #728
```

**⚠️ I NARROWED A REAL SAFETY GUARD HERE — read before touching it again.** `castModifiers` refused ANY body
referencing the paid cost, on the stated grounds that such an effect *"can't be fed the cost details."* That
was true until this slice. It is now narrowed to admit ONLY the three modeled magnitudes; an object
reference, an unmodeled characteristic, or a discard/exile self-reference still parks the card.

**AND THE HONEST LIMIT, found by mutation:** deleting that guard entirely leaves every "still refused" test
PASSING. The guard is **belt-and-suspenders** (its own comment says so) — the UNDERLYING PARSE is what
refuses those bodies. No reachable input makes it load-bearing, which is exactly why narrowing it was safe.
The pins are labelled in-file as INTENT, not proof. **Do not cite them as evidence the guard works.** The
capture-and-read chain IS mutation-verified separately.

### ☠️ THE DESCRIPTOR WHITELIST SILENTLY DROPS UNLISTED FIELDS — this nearly shipped an over-fire

`detectTriggers` rebuilds every descriptor through an **explicit field whitelist** (`triggers.js` ~3171).
A key your detector returns that is NOT listed there **vanishes with no error**. On the gyEnterBatch arm
that meant `gyFromZone` never reached the check, so **Sidisi fired on EVERY graveyard entry** instead of
only on a mill — a live over-fire.

**Why nothing caught it:** the card classified `native-trigger` either way, so the tier was unchanged; the
full suite was green; and the trigger DID fire, just too often. It surfaced only because a probe printed
the descriptor field and it read `undefined`.

**THE RULE: after adding any new descriptor field, print the descriptor and confirm the field survives
`detectTriggers` before writing a single test.** A test written first would simply have encoded the
dropped-field behaviour as correct. The whitelist entry now carries a warning comment for the next field.

### ⚠️ NOT EVERY "ONE OR MORE" NEEDS BATCHING — the counters arm proves the rule has an exception

`f682aadb` looked like a seventh batch arm and is NOT one. **One `addCounter` event places N counters on ONE
permanent**, so "one or more counters are put on…" is already satisfied per event — and a spell putting
counters on three creatures correctly fires THREE times, because the plural counts COUNTERS, not creatures.
A batch pass there would have been WRONG (an under-fire).

**The test to apply per arm: does the plural quantify the OBJECTS the event is about, or something INSIDE a
single object's event?** Deaths/graveyard-leaves quantify objects → batch. Counters quantify counters on one
object → no batch. Getting this backwards is a silent wrong-count in either direction.

Its real hazard was different and worth remembering: the watcher pass needed a `scope !== "self"` guard,
because `scopeMatches` also matches a SELF descriptor when the watcher happens to BE the receiving
permanent — which the self loop already fired. Without it every self-trigger fires TWICE.

**The last three flip 1–2 cards each and are still the right work** — that is the entire point of the
play-weighted target. Austere Command #169 and Rakdos Charm #330 are worth more than fifty pieces of jank,
and the corpus % barely notices either. Do not judge a slice by its corpus delta any more.

### ⚠️ THREE SCOPE-BOUNDARY PINS GRADUATED THIS STRETCH — read the pin's COMMENT before judging it

`gyExile.test.js` (whole-graveyard exile) and `planeswalkerLoyaltyCompletion.test.js` (the MV wipe, listed
among near-misses of the POWER anchor) each fired against new work. **Neither was a safety pin.** Both were
markers for what a PRIOR slice deliberately didn't build, and `gyExile.test.js` already documented the exact
graduation ritual for Scarab Feast. Each was retired the same way: annotate the graduation in place, point
at the new test file, and keep the genuine refusals (the filtered whole-zone wording; the strict
"greater than"; the toughness bound) alive in the new file.

**A scope marker graduates when the machinery lands. A safety pin never does. Both look like a red test —
the comment is what tells them apart.** This is now 3 graduations vs 0 wrongly-dropped pins.

### ⭐ AND ONE **BEHAVIOURAL** PIN FIRED — a different animal, handled differently

`counterWiring.test.js` asserted Cryptic Command is never offered at an empty stack. That was CORRECT while
its unmodeled tap mode dropped the whole card below HIGH and made it a blanket counter. Once the mass-tap
scope landed it became a real modal card, and CR 700.2 says a "Choose two" whose counter mode has no legal
target is still castable via two OTHER modes — so continuing to withhold it would itself be the bug,
making the card uncastable in a whole class of board states.

**The procedure that made this safe, and the one to repeat:** do NOT edit the test to match the new
behaviour. First ask the ENGINE what it now does. A throwaway probe printed the offers — exactly one
combination, `[2,3]` = tap-all + draw, the only legal pair on an empty stack and empty board. Only THEN
was the assertion replaced, and replaced with a STRONGER one: offered, exactly one combination, and the
counter mode never present in ANY offered pair (CR 601.2c). *"Offered at all"* is the weak assertion that
would have let an illegal combination through.

**Three pin types, three responses.** SCOPE marker → graduate with a pointer to the new file. SAFETY pin →
never retire. BEHAVIOURAL pin → verify against the engine, then replace with a tighter assertion.

**Running count: 6 scope graduations + 1 behavioural replacement, 0 safety pins dropped.** The fourth was
`parser.test.js`'s MUST_DROP_TO_LOW merge gate, which listed "Counter target activated or triggered
ability." annotated *"an ability is not a spell"* — a scope marker for the counter-SPELL slice. Note that
file already documents its OWN graduations (Windfall, fixed-N at-random discard), so the convention was
there to follow rather than invent: move the entry out, leave a NOTE naming the positive pin.

**Every one of these fired on a green suite that had just passed.** They are the reason the "full suite,
not the targeted tests" rule exists — a targeted run would have shipped all five silently.

`3259071d` flips NOTHING on its own and is recorded that way rather than dressed up. It still earned its
place: the subject sniff was misfiling `"Enchanted permanent …"` Auras as EQUIPMENT, and the metric's
no-untap gate was NARROWER than the runtime matcher it was supposed to describe. Its second half — the
Enchant SUBJECT vocabulary plus the offer / CR 608.2b / CR 704.5n wiring — is measured at **+15** and is
deliberately deferred, because the play-rank data says modal staples outrank it.

### ⭐ A PRIOR CREED PIN FIRED AND WAS **GRADUATED**, NOT DROPPED — the precedent matters

`gyExile.test.js` pinned `"exile target player's graveyard"` as low, commented *"whole graveyard, not a
single card"*. That is a **SCOPE-BOUNDARY marker** left by the single-card slice, NOT a safety pin — and
the very same file records the identical graduation for Scarab Feast once ITS machinery landed. So the
line was retired the documented way: the near-miss intent lives on (the filtered wording
`"exile all creature cards from all graveyards"` is still refused, now pinned in the NEW file), and the
graduation is annotated in place with a pointer to `exileGraveyardZone.test.js`.

**Read the pin's COMMENT before deciding it is stale.** A scope marker graduates when the machinery lands;
a safety pin never does. Both look like a red test.

### 🎯 THE LIVE QUEUE — top-2500 staples, each ONE small effect away (probe-verified, not guessed)

The modal WRAPPER is already built and is genuinely sophisticated (escalate, "choose one or more", even
Akroma's-Will conditional-both). `effects/parser.js:602` is the whole story: **one mode that parses low
kills the entire card.** So these are single-effect builds, not mechanic builds:

Re-measured after this stretch — **27 parked modal instants/sorceries in the top 2500, 26 blocked by ≥1
mode.** Regenerate the list any time with `scratchpad/modes.mjs` (it prints both the ranked failing modes
and the one-mode-away shortlist). ~~Austere Command~~, ~~Warping Wail~~, ~~Rakdos Charm~~,
~~Red/Null Elemental Blast~~ are DONE. Still one mode away:

- ~~**Golgari Charm #1603**~~ ✅ `97415979` · ~~**Cryptic Command #1617**~~ ✅ `0361e27c` ·
  ~~**Sublime Epiphany #1709**~~ ✅ `b7bf0e46`
- **Flame of Anor #1760** — `if you control a Wizard as you cast this spell, you may choose both` (the
  Akroma's-Will conditional-both lead, generalized off "commander" to an arbitrary permanent type)
- **Dawn Charm #2079** — `counter target spell that targets you`
- **Hull Breach #2368** — `destroy target artifact and target enchantment` (TWO targets in one mode)

**⛔ DEFERRED WITH A REASON — Archmage's Charm #1746** (`gain control of target nonland permanent with mana
value 1 or less`). Looks like noun vocabulary; it is not. `control.js` line ~82 hard-refuses a non-creature
target (`if (t?.type !== "creature") continue`), so this needs control-change extended to arbitrary
permanents — which touches layers, mana abilities, and the soulbond teardown. That is a WAVE, not a slice,
for one card. Do not start it as a "quick vocabulary fix"; that misread is exactly what the deferral records.

**Two modes away** (so cheaper than they look — count is not cost): Prismari Command #1108 wants
`target player creates a Treasure token` AND `target player draws two cards, then discards two cards`;
both are player-scoped versions of effects that already parse for the controller.

**24 cards** want REPEATABLE modes (`"you may choose the same mode more than once"` — the Confluence cycle
incl. Mystic #1431 / Fiery #1561, plus the Season cycle). Needs multiset expansion in `expandCastChoices`;
a wrapper feature, bigger than every single above, and the largest remaining modal lever.

**24 cards** additionally want REPEATABLE modes (`"you may choose the same mode more than once"` — the
Confluence cycle incl. Mystic #1431 / Fiery #1561, plus the Season cycle). That needs multiset expansion
in `expandCastChoices` — a wrapper feature, bigger than the singles above.

### ⛔ MEASURED AND CLOSED THIS STRETCH — do not re-derive

- **Graveyard exile was 0-native/62-parked before `4f915ba6`.** The remaining 52 are blocked by OTHER
  text, not by the zone exile.
- **`exile all artifacts and enchantments`** still parses low (the clause splitter appears to break on
  `" and "` before the matcher sees it). Not needed for Farewell; unexamined beyond that.
- **Pyroblast / Hydroblast are DELIBERATELY not claimed.** They word colour as a post-hoc condition on an
  UNRESTRICTED target (`"counter target spell if it's blue"`) — a different rule from the adjective form,
  and pinned as a CREED test so surface similarity cannot sweep them in later.
- **The play-weighted view already existed** in `measure-coverage.mjs`. Making it the TARGET is what
  changed; the instrument was not missing.

## 📊 THE SPLIT IS LIVE WITH THE REAL MAPPING — the two bars, measured

Omnath supplied `deck-owners.json` from [[reference_deck_sources]] (Colton's Archidekt table + Joe's
Moxfield table, user `Blocks420`, verified live). All 16 decks assigned, nothing unassigned:

```
  92%  colton   (457/499 across 5 decks)     below the bar: cdh 79%
  73%  joe      (802/1098 across 11 decks)   below the bar: 10 of 11
```

**The two bars are now separately readable, and they say different things.** PLAYABILITY (Colton's own
decks — can the one real user play his own decks?) is 92% and blocked by a SINGLE deck. POD REALISM (Joe's
decks — can he sim his playgroup?) is 73% across 11 decks and is a broad grind. The old single 79% could
not distinguish "one deck from done" from "ten decks out", which is exactly why it was worth splitting.

**"Believe it!" is Joe's Yuriko** — neither of us could place it because the deck is named for the
catchphrase, not the commander. Closed in both our notes.

**A near-miss worth keeping:** Omnath nearly mis-assigned *Halfshell heroes* to Colton by reasoning from the
crossover pattern (TMNT → Colton's `deck_raph_and_mikey`). The registry carries a note written for exactly
that trap — TWO different TMNT decks exist; Joe's "Halfshell heroes" is NOT Colton's "Raph & Mikey", which
isn't built and isn't in the app. **Ownership is not inferable from card themes**, only from the roster.

**OPERATIONAL NOTE (Omnath's flag, confirmed):** the file lives in AppData, which is what `MTG_APP_ROOT`
resolves to for deck runs — the measurement above used exactly that and worked. A run that points
`MTG_APP_ROOT` at the MAIN TREE for the corpus pass ([[reference_realism_gate_in_worktree]]) will not see it
and simply prints the single aggregate, which is the designed graceful degradation, not a failure.

**No deck is CLOSE to the bar.** cdh needs ~11 slots (characterized below — no slice closes it); the nearest
of Joe's is Earth Bent at 81%, ~9 slots. The shelf is a long grind on both halves, not a near-miss anywhere.

## 🎯 cdh IS THE WHOLE PLAYABILITY GAP — and here is exactly what it needs

The owner split named the target precisely: **Colton's playability shelf is 92% and cdh (79%) is the only
deck below the 1.0 bar.** So I characterized cdh rather than guessing at it. It needs ~11 more slots; 21
non-land slots are parked. Sole-blocker sweep scoped to the deck:

**SOLE-BLOCKER (one sentence away) — 6 cards, and 3 of them are REFUSED or BANKED, not open work:**
- Springleaf Drum, Gene Pollinator — the tap-another-permanent mana cost. **DELIBERATELY REFUSED**
  (phantom mana, SHELF S7 audit, `manaCostModelable` names Springleaf Drum outright). Do not "fix" these.
- Hexing Squelcher — group-granted ward, and the LIFE form specifically, which the layer op cannot represent.
  Already banked.
- Biomancer's Familiar — an adapt-cost modifier. Niche, 1 card.
- Vexing Shusher — "{R/G}: Target spell can't be countered." Needs an uncounterable flag on a stack object.
- Borne Upon a Wind — a TURN-SCOPED flash permission. The mechanism nearly exists (`flashPermissionSpecsFor`
  + `flashCastPermissionsOf` already serve the STATIC form, e.g. Valley Floodcaller), but the turn-scoped
  variant needs a new per-player field, an atom, a spec source and an untap reset — **four touch points for
  ONE card** (corpus-wide the shape is 12 cards / 9 parked / only this one would flip). Below the bar.

**MULTI-BLOCKER — 15 cards, each needing two or more independent builds.** These are cEDH staples and none
is a slice: Chrome Mox (imprint), Pact of Negation (delayed cost with a loss condition), Chain of Vapor,
Mindbreak Trap (alt cost + exile-any-number-of-spells), Wan Shi Tong, Hidden Strings (cipher), Invasion of
Ikoria (Battle // Siege), Vibrance, Deflecting Swat, Flare of Duplication, Veil of Summer, Ragavan,
Springheart Nantuko (bestow), Valley Floodcaller, The Cabbage Merchant.

**THE HONEST CONCLUSION: cdh will not close soon, and no single slice moves it.** It is ~11 slots spread
across 15 multi-blocker cEDH cards plus 3 refusals. Anyone told "just finish cdh" should read this list
first — the deck is hard because cEDH cards are hard, not because a lever is missing.

## ✅ SHIPPED — the SHELF OWNER SPLIT (Omnath's call, and he was right)

`measure-coverage` can now report the shelf **per owner** instead of one aggregate. Omnath's argument, which
the numbers back: the single figure AVERAGES TWO DIFFERENT QUESTIONS — the owner's decks gate PLAYABILITY
(can the one actual user play his own decks?), the pod's decks gate POD REALISM (can he sim his playgroup?).
Neither is the other, and "79%" cannot tell you which is failing.

**Measured with the split on** (temporary config, using only the four decks Omnath said he Moxfield-verified):

```
  92%  colton (playability)   (457/499 across 5 decks)   below the bar: cdh 79%
  76%  joe (pod realism)      (304/400 across 4 decks)   below the bar: 4 decks
  71%  (unassigned)           (498/698 across 7 decks)
```

**The playability half is ONE DECK from the 1.0 bar.** The aggregate was hiding that completely.

**DESIGN — ownership is NOT derivable from the data, so it is not guessed.** Verified earlier: every deck
lives in ONE profile on this box, so profile structure says nothing. Rather than hard-code Colton's deck
names into a repo script, the split reads an OPTIONAL `<MTG_APP_ROOT>/data/deck-owners.json`
(`{ "Deck Name": "owner-label" }`) and stays completely silent when absent — output byte-identical to before.
A deck the file omits lands in "(unassigned)" rather than being dropped, because a silently shrinking
denominator is how a split metric starts lying.

**I did NOT ship a mapping file.** The roster is Omnath's ([[deck_joe_roster]]) and my knowledge of it is
second-hand; asserting ownership I cannot verify is exactly the kind of confident-wrong entry this run has
already had to retract twice. Told him in COMMS that the seam is live and the mapping is his to supply.

## 🧭 ALL FOUR INSTRUMENTS ARE MINED OUT — the run's search phase is over

Four independent instruments were built and exhausted this run. Recording them together so the next session
does not rebuild any of them:

| instrument | what it found | state |
|---|---|---|
| shelf sole-blocker sweep | 105 single blockers, all singletons | mined out |
| mis-park scanner (`residuegap.mjs`) | 3 real bugs (+15, +1, +4) | mined out |
| undetected trigger events (`undetected2.mjs`) | 1 feasible lead (+2); the rest are UNBUILT mechanics | mined out |
| tier composition (`composition.mjs`) | the aura pair (+10); no general fix | closed |

**All four converge on the same answer: what remains is per-shape work at 1-4 cards each.** Even inside a
single bucket the shapes do not share a fix — the 9 composition-failing Enchantments need four DIFFERENT
gate pairs (static+granted-activated, activated+trigger, trigger+trigger, trigger+mana-aura), one or two
cards apiece.

**That is not a reason to stop; it is a change of mode.** Stop hunting for levers — there are none left —
and grind shapes individually, cheapest-first, verifying each against the gate that owns it.

## ⛔ CLOSED — the GENERAL tier-composition lead (38 cards) has no general fix

The aura static+trigger composition paid +10, so I generalized the instrument: for every parked card,
classify each oracle line ALONE; if every line is native by itself, only the composition is missing.
**38 cards** match — 17 Creature, 9 Enchantment, 4 Artifact, 4 Legendary Creature — and they line up exactly
with the residue census's TWO-FLIP list (Artisan of Kozilek, Wasteland Raider, Vat of Rebirth, Tundra Tank,
Compulsory Rest, Verdant Haven, Fiery Mantle, Nurturing Presence, Mouser Foundry, Tishana).

**There is no general fix, and chasing one would be a false positive.** Two things killed it:

1. **The single-mechanism discipline is DELIBERATE.** `permanentTriggersCovered` and its siblings each own
   ONE mechanism and treat everything else as residue — the code says so outright: *"this single-mechanism
   tier must never claim one through a residue coincidence."* Birthing Hulk is keyword + trigger + activated
   ability; composing across all three would dissolve the tier system, not extend it. The aura fix worked
   precisely because it composed TWO NAMED gates with each half re-verified by its OWN gate — that is
   composition. A blanket "every line is native alone" rule is loosening wearing composition's clothes.

2. **The COVERED_KEYWORDS angle is a mirage.** It looked like the residue set was merely missing modeled
   keywords. Ranking the "keywords credited alone but absent" gave equip (394), crew (142), draw a card
   (147) — **none of which are vacuous keywords.** They classify alone because their OWN tier handles them
   (equipment, vehicle, spell). Adding them to the residue set would make the walk treat a real ability as
   inert text: a false positive on hundreds of cards. And the two genuinely-missing modeled keywords I
   suspected — squad, firebending — turn out to have **zero** parked carriers; earlier slices already
   covered them.

**Take from this**: composition is only safe when each half is re-verified by the gate that owns it. If you
cannot name the two gates, you are loosening. The remaining 38 need per-shape work at 1-4 cards each.

## 🛑 THE MIS-PARK SCANNER IS MINED OUT — re-run after shipping, and it is thin

Re-ran `scratchpad/residuegap.mjs` after the counters + once-per-turn slices landed. 888 candidates, but the
buckets are exhausted for practical purposes and the next session should not re-mine them:

- **Top bucket (116) = "trailing sentence inside a trigger line."** Already mined — the once-per-turn rider
  came out of it (+4). Re-extracted its sub-shapes: the largest remaining is 3 cards
  ("you may play that card this turn"), then a tail of 1-2.
- **"this ability triggers only once each turn" still shows 9 — those are NOT residue failures any more.**
  My strip fixed the residue; they now park because a SECOND trigger line's event is undetected. Verified on
  Twilight Diviner and Tolls of War: two trigger lines, one detected. Do not "re-fix" the rider.
- **The keyword buckets (flying 14, cumulative upkeep 6, enchant creature 5-7) are the same story** — an
  undetected second trigger EVENT, not a keyword problem and not a residue blindness.

**So what remains is genuine feature work at ~1-3 cards per mechanism**, which is the same conclusion the
shelf sweep reached independently. There is no cheap lever left in either instrument.

## ⛔ CLOSED LEAD — the SCOPED counters-put-on variants are worth ~1 card each

The natural follow-on to the shipped self-scoped slice, and it does NOT pay. 15 non-self carriers, 14 parked
— but I swapped each scoped subject for the known-good `this creature` and re-classified, and only **4** flip:

| card | scope it needs |
|---|---|
| Enduring Scalelord | "another creature you control" — `otherCreatureYouControl`, already exists |
| Wildwood Scourge | "another NON-HYDRA creature you control" — a negated subtype filter |
| Wickersmith's Tools | "a creature" — any player's, a global scope |
| Axgard Artisan | "…for the first time each turn" — a frequency rider, not a scope at all |

**The biggest bucket flips ZERO.** "a creature you control" (5 cards — Simic Ascendancy, The Powerful Dragon,
A-Moss-Pit Skeleton …) is stuck on other clauses entirely. So this is roughly one new mechanism per card.

Also worth knowing: **Lonis and Berta are NOT scope gaps.** Their subject is the card's own name, which the
shipped detector already resolves via `shortName`; they park on their effects ("investigate that many times").

## ✅ SHIPPED — the +1/+1 COUNTERS-PUT-ON trigger event (CR 122.6), +4

Rebuilt from the ledger's own notes and landed. Both paths verified at runtime, mutation-checked three ways.

**A BUG WORTH NOT REPEATING — Python `` is a BACKSPACE.** The rebuild silently wrote literal 0x08 control
characters into two JS regexes (`/^Hone or more…`), so the detector never matched and I burned most of a turn
probing a correct-looking arm. `cat -A` on the line is what finally showed it. **Write regexes into JS with
Python RAW strings (`r'...'`) or an Edit tool — never a plain quoted string.** Third escaping incident of the
run and by far the most expensive.

**The cascade concern, resolved honestly.** Two carriers (Generous Pup; Scurry Oak via evolve) do feed each
other — a genuine paper infinite, which the rules call a draw (CR 104.4b). `learnSession`'s per-turn tick
budget is the backstop. **I could NOT construct a valid end-to-end demonstration that it bounds THIS
cascade** — my session test injected a board that setup discarded — so that stays UNVERIFIED rather than
claimed. Shipped anyway because: the trigger models the card correctly (the loop is a real game interaction,
not a modeling error), no saved deck holds two of the four carriers, and suite + sweep are green.

**Prior entries here were wrong twice and both are superseded:** "no cascade guard anywhere" (false — the
tick budget exists) and then the implication that the hazard blocked shipping (it does not).

## ⭐ BANKED — "Do this only once each turn." does NOT set the flag

The sibling wording of the rider just fixed. `detectTriggers` does NOT set `oncePerTurnTrigger` for it and
leaves the rider INSIDE the effect clause — contrary to what a comment in `permanentTriggersCovered` claims.
So it needs the DETECTOR taught, not just a residue strip, and the runtime enforcement already exists to
receive it. Recorded rather than guessed at. Verify the comment's claim before trusting it.

## ⭐ THE DIAGNOSTIC THAT FOUND TWO BUGS IN A ROW — ask WHICH LAYER said no

Both engine bugs this stretch were found the same way, and neither was a missing mechanic. When a card looks
like it should already work, do NOT go hunting for the feature. Ask which layer rejected it:

| symptom | meaning |
|---|---|
| `triggerRoutesNatively` true + `classifyCard` body-only | a WHOLE-CARD gate (residue check) — not a mechanic |
| effect clause parses HIGH standalone + ability `program === null` | the ability was rejected BEFORE its effect was parsed — look at what gated it |
| `classify` native + `permanentActivatedCovered` false | the card is being credited while carrying something unmodeled (a possible FP) |

Bug 1 was `permanentTriggersCovered`'s residue strip never being told about token ability-grants (+15).
Bug 2 was `effectIsManaAbility` reading "Add" inside a QUOTED GRANT and flagging a token-maker as the card's
own mana ability — which skipped building its program entirely, so it was invisible from both the effect
lane and the mana lane (+1, and a whole misclassification class removed).

I burned several probes on bug 1 hunting a mechanic that already existed. The layer question would have
answered it in one step.

## ⚠️ TWO OF MY OWN FAILURES THIS STRETCH — read these before trusting a green number

**1. I SHIPPED A FALSE POSITIVE AND CAUGHT IT AN HOUR LATER.** The token-grant residue strip ended with
`\s*`, and `\s` matches a NEWLINE — so it swallowed the line break and welded the NEXT oracle line onto the
stripped one, hiding it from the residue check. Drowner of Hope was credited native-trigger while carrying
"Sacrifice an Eldrazi Scion: Tap target creature." — an ability `parseActivatedAbilities` does not model.
A false positive is the one direction the CREED forbids.

**How it surfaced is the reusable part: I applied the diagnostic rule the SAME slice had just taught me to
the cards the slice did NOT flip.** Drowner came back `classify=native-trigger` with `actCov=false`, and a
card cannot honestly be both. **Checking the cards a change did NOT move is how the one it moved WRONGLY
shows up.** Do that after every coverage change. Fixed with `[^\S
]`, both directions pinned as tests;
net was one FP out and one legitimate card (Catacomb Sifter) in.

**2. THE DIRECT-TO-MASTER DRIFT RECURRED AFTER I SAID I HAD FIXED IT.** Last entry I wrote "branch first
next slice." Three commits then went to master anyway. Worse, `git push -q … 2>&1 | tail -1` hid a failing
push for two commits, so I believed work was on a branch that had actually diverged, and PR #443 sat open
containing none of it.

**The mechanical fixes, since intent alone demonstrably did not work:**
- After `git checkout -b`, VERIFY: `[ "$(git rev-parse --abbrev-ref HEAD)" = "<branch>" ]`. A `-b` onto an
  existing branch fails, and in a `&&` chain that silently leaves you where you were.
- NEVER `git push -q` into a pipe. The `-q` plus `| tail -1` swallowed a non-fast-forward rejection twice.
  Push plainly and read the result, or assert `git rev-parse origin/<branch>` afterwards.
- Before opening a PR, confirm the remote head is what you think: `gh pr view N --json headRefOid`.

No work was lost — master carries all of it, CI green — but I reported branch discipline I had not achieved,
which matters more than the drift itself.

## ⭐ A DIAGNOSTIC RULE THAT PAID FOR ITSELF — routing vs. whole-card gates

The last slice (+15) was NOT a missing mechanic. TK-1 had already built the trigger fold AND the splitClauses
normalization for `…token. It has "<ability>"`; the effect parsed HIGH and the trigger routed natively. The
only thing missing was that `permanentTriggersCovered`'s RESIDUE check had never been told, so the grant
sentence looked like leftover text and parked a fully-modeled card.

**The tell, and it generalizes:** `triggerRoutesNatively === true` while `classifyCard === "body-only"` means
a WHOLE-CARD gate is rejecting it — never a missing mechanic. Check that pair FIRST on any parked card whose
text looks like it should already work. I burned several probes hunting a mechanic that already existed.

The whole-card gates worth checking in order: `permanentTriggersCovered` (residue strip — the one that bit),
`permanentActivatedCovered`, `permanentFullyCovered`.

## STILL PARKED IN THAT FAMILY — 22 cards, not yet diagnosed

Serpent Generator · Mitotic Slime · From Beyond · Blight Herder · Call Up Emrakul to Help. They carry the
same `It has "…"` grant but park for other reasons (their granted abilities are outside the curated
mana/triggered gates, or a sibling clause is unmodeled). Diagnose with the routing-vs-gate pair above before
assuming a mechanic is missing.

## WHAT SHIPPED THIS STRETCH — the activation-restriction vocabulary

Three riders the engine parsed straight past, so every carrier parked. All three now flag-then-enforce:

1. **`before attackers are declared`** (+21) — a NARROWING to the precombat main. Two sibling riders are
   safely stripped as implied; this one is not, because `step === "main"` spans BOTH mains and the
   postcombat one is after attackers. Refused the opponent's-turn form (disjoint windows).
2. **BOAST, CR 702.135** (+10) — needed a PER-PERMANENT attacked flag. The seat-level Raid flag already
   existed and reading it would have been the one-line build; it is also a materially stronger card.
3. **`Activate only if <cond>`, CR 602.5d** (+23) — added a THIRD probe to the existing interveningIf
   family rather than a second condition language. Trigger / spell / activation lanes now share ONE
   vocabulary, so every future reader reaches all three at once.
4. **DELIRIUM + FORMIDABLE readers** (+7) — the first slice that compounding paid for.

**Three CREED pins fired against my own work and graduated on evidence**, each with the reason recorded in
place rather than edited away. All four seams of every slice were mutation-checked.

## ❌ RETRACTED — the "trailing conditional clause" lever does not exist (I was wrong, same session)

I banked a 121-card lever here and it was **wrong**. Retracted rather than deleted, because the mistake is
more useful than the entry was.

**The claim:** the parser handled the LEADING conditional rider (`If <cond>, <effect>`) but not the TRAILING
form (`<effect> if <cond>`), and 121 parked cards carried the trailing form — the biggest lever of the run.

**The runtime disagreed, and the runtime wins.** The trailing form is ALREADY implemented — BLITZ CD-2, in
`effects/parser.js`, directly beneath the leading peel, with the same shared gate and guards. Verified live:

```
Draw a card if you have no cards in hand.  -> high  [{op:"draw", amount:1, condition:"you have no cards in hand"}]
Draw three cards if a creature died this turn. -> high [{op:"draw", amount:3, condition:"a creature died this turn"}]
```

**What my probe actually measured**, versus what I read it as:
- measured: parked cards CONTAINING a trailing-if clause whose condition is readable.
- read as:  cards that WOULD FLIP if the trailing form were built.
Those 121 cards park for reasons ELSEWHERE ON THE CARD. The trailing clause was never their blocker.

**This is the probe-instrument law biting a second time this run** — a probe reporting a big number is a
claim about the PROBE until each hit is explained. The cheap check I skipped: parse one example clause and
look at the output. It took under a minute once I finally did it, and it would have saved the whole banked
entry. **Before banking any lever, parse one real example and confirm the gap is real.**

Corollary worth keeping: a "would flip if X" probe must actually SIMULATE X (strip the blocker, re-classify)
— which is exactly what the alternative-cost probe did correctly ten minutes earlier, and it cheaply killed
that direction by showing only 2 of 14 would flip. Same session, right method and wrong method side by side.

## THE SHELF TAIL IS GENUINELY CARD-BY-CARD — measured, not assumed

I ran a SOLE-BLOCKING-SENTENCE sweep over every parked deck card: remove one sentence at a time, re-classify,
and record the sentence whose removal flips the card. 320 parked cards, **105 with a single identifiable
blocking sentence — and essentially every one is a singleton.** The top blocker unblocks 2 deck slots. There
is no cluster left.

**So Colton's guess was right: from here the shelf moves card by card.** That is a finding, not a
complaint — it means the remaining work is small, safe, individually auditable, and does not need a big
lever. It also means nobody should go looking for one again; the search is done and this is the answer.

Probe: `scratchpad/sole-sentence.mjs` (the method is the correct one — simulate the fix and re-classify).

## BANKED WITH SCOPE — group-granted WARD (4 corpus cards, ~0 deck slots)

Ward on a creature ITSELF is fully modeled, both cost forms. Bare-keyword GROUP grants work. The gap is
ward specifically inside a group grant, because ward carries a COST and so cannot be a bare member of
`GRANTABLE_STATIC_KEYWORDS`.

Good news, and the reason this is scoped rather than open: **the runtime already supports granted ward.**
`layers.permanentGrantedWardCosts` reads layer-6 `addWard` effects and `ward.js` unions them with printed
ward at the tax site. So this is a PARSER-emission gap, not an enforcement gap — no false-positive risk in
crediting it, provided only the fixed-generic form is emitted (which is all the layer op represents).

Why I did not build it at depth: the four carriers print four DIFFERENT selector shapes — "Other creatures
you control", "Other artifacts you control", "Artifacts you control", "Beasts and Birds you control" — which
means an arm in each shape's handler inside a 4,000-line parser. And the only card worth deck slots
(Hexing Squelcher, 2 slots) prints the LIFE form, which the layer op cannot represent, so it would not flip
even after the work. **~4 corpus cards, ~0 deck slots, medium blast radius.** Correct trade is to leave it.

If someone takes it: mirror the COUNTER-GATED GROUP WARD emission (staticAbilityParser ~line 2012) — it is
the exact pattern, already correct, already refusing the colored/{X}/life forms for the same reason.

## ✅ RESOLVED — the token lever was 15 cards, not 68, and needed no subsystem work

Shipped as three NAMED_TOKENS entries (Lander / Mutagen / Junk) + one alternation. **+18 corpus, +2 deck
slots, corpus crossed 35.1%.** All 18 flips audited individually, mutation-checked three ways.

**I banked this as a 68-card subsystem extension and it was neither.** Both errors were the same error:

- **The bad instrument.** I measured "would flip" by DELETING the line carrying the create-token clause —
  but that line also carries the TRIGGER, so I counted cards blocked by their trigger as blocked by their
  token. The tell was in my own output and I missed it: the hit list contained Treasure(12), Food(8),
  Clue(2), all already in the registry, so the token demonstrably was not their blocker.
- **The good instrument — CHANGE ONLY THE THING UNDER TEST.** Rename the unknown token to a known one,
  strip its defining reminder, re-classify. Nothing else moves. Real answer: 15 cards, three names.

**Third time this run a probe's big number was a claim about the probe.** The standing rule now has two
clauses: *(1) parse one real example before banking a lever; (2) a "would flip" probe must simulate the
ACTUAL fix and change ONE variable.*

## ⛔ DO NOT REBUILD — tap-another-permanent mana costs are a DELIBERATE refusal

A probe said 5 cards flip if `manaProduction` accepted "{T}, Tap an untapped creature you control: Add …"
(Springleaf Drum, Gene Pollinator — both in cdh, plus Loam Dryad / Saruli Caretaker / Jaspera Sentinel).
**Do not act on that number.** `manaModel.manaCostModelable` refuses this cost explicitly, names Springleaf
Drum in its comment, and cites a prior audit (SHELF S7): riding the {T} half alone **minted phantom mana
every turn**, because the sim never taps the other permanent.

Crediting these without teaching the mana subsystem to spend a second resource is a false positive, not a
coverage win. **The lesson generalizes: a "would flip" probe measures whether the METRIC would credit a card,
never whether crediting it would be CORRECT.** That distinction is the whole false-positive direction.

## cdh IS ALSO CARD-BY-CARD — its clusters were checked and are empty

Per Omnath's sequencing (cdh is Colton's only sub-90 deck), I measured its 21 parked non-land slots.
Cluster candidates all came back near-zero: can't-be-countered self (83 corpus / 0 would-flip),
can't-be-countered static (0), flash permission (1). Its remaining blockers are individually hard cEDH
cards — imprint (Chrome Mox), cipher (Hidden Strings), Battle//Siege (Invasion of Ikoria), X-counters+draw-half
(Wan Shi Tong). Consistent with the shelf-wide finding: no clusters anywhere.

**Data note for the roster split:** all 16 decks live in ONE profile on this box (`prof_bdb11b3e`), so the
Colton-vs-Joe split CANNOT be derived from profile structure — it rests entirely on `deck_joe_roster`. Told
Omnath, since his two-number recommendation depends on it.

## ⛔ CLOSED LEAD — the LIEUTENANT cycle is NOT a condition gap (worth 0, not 5)

"Lieutenant — As long as you control your commander, <static>" (6 corpus cards). The line-removal probe said
5 would flip, and the diagnosis looked clean: conditional statics WORK ("gets +2/+2 as long as you control a
Forest" is native-static, in both word orders), so the missing piece appeared to be the condition
"you control your commander" — which the TRIGGER lane already has and the STATIC lane does not. A tidy
parallel to the activation-condition slice, and a small build.

**It is worth zero.** I substituted the known-good Forest condition into all six real cards and re-classified:
every one stays body-only. The condition was never the blocker — the COMPOUND STATIC CONTENT is
("gets +2/+2 AND has '<quoted triggered ability>'", "AND other creatures you control get +2/+2 and have
trample"). Adding the condition would have modeled nothing.

Anyone reviving this needs compound gated statics — a self pump PLUS a granted quoted trigger or a group
effect, all under one gate — not a condition entry. That is a real subsystem, correctly sized before it is
started.

**Caught BEFORE building, which is the first time in this run.** The probe rule above is why.

## ✅ SHIPPED — Amulet of Vigor #1301, and the RUNTIME-VACUOUS trap it nearly walked into (`e0d15930`)

Four pieces; **only three were visible to any static instrument.**

1. `permanentYouControl` — the missing member of a subject family that already had artifact / enchantment /
   token / creature / land. Every other subject there is a type-narrowed version of this one.
2. `enteredTapped` — a live read on the entering permanent, gated in `scopeMatches` beside
   nontokenFilter/tokenFilter, and carried EXPLICITLY through the descriptor build (an unlisted field there
   is silently dropped → fires on every entry → over-fire).
3. The "untap it" referent → sentinel `untap the triggering permanent` → `target:"thatPermanent"`. **NOT the
   existing `thatCreature` referent**: that one is creature-only by design and Amulet normally untaps a
   LAND, so reusing it returns `[]` and no-ops. New `triggeringPermanentTargets` rather than a flag on the
   creature one — every existing caller of that is creature-scoped and its check is load-bearing.
4. **THE FIRE SITE.** `checkPermanentEntersTriggers` was called from token mint, zone-enter and the
   cast/resolve path, and NOWHERE ELSE. A land is PLAYED, not cast, so a land drop reached none of them.
   Building 1–3 alone produces a card that classifies native and never fires on its signature use.

⭐ **THE LESSON, restated because it will recur:** the per-card tier diff would have read `GAINED 1` for the
broken version too. A subject/filter/referent can all be correct while the EVENT never reaches them, and no
instrument keyed on classification can see that — the tier is not evidence about a board. **When a slice adds
a subject to an event family, enumerate the event's fire sites before building anything else.** The order in
the scoping was right and it is the reason this shipped working.

Mutation-checked M39–M42, each seen to fail: fire site deleted → 4 runtime tests; `enteredTapped` deleted →
the untapped-land no-fire test; `thatPermanent` dropped from the resolver's permanent branch → 4 (the
creature-only fallback silently drops an entering land); controller scope made optional → the CREED refusal.

Tier diff (34,189 cards): **GAINED 1 · LOST 0 · RETIERED 0.** Fire Lord Zuko, the only other corpus card on
this subject, reads "enters FROM EXILE" — a different filter, still Arbiter.

One stale pin updated (`subtypeScopedTriggers.test.js`): it asserted the permanent-wide subject was
UNDETECTED, true only while the subject was unmodeled. Its real guarantee — never mis-read as a SUBTYPE — is
what it asserts now, the same way that file's token line was updated when the token slice landed.

## 🚨 SHIPPED — MIXED MANA BUNDLES: a live FALSE POSITIVE on 51 staples, found by chasing a +2 (`003e29d1`)

I went looking for Bloom Tender (NEXT ACTIONS #1, worth 2 cards / 3 deck slots) and found that **"Add {G}{W}"
has never worked.** The planner's primary component picked ONE color and credited `amount` of it, so a
Selesnya Signet was wrong in BOTH directions — measured on the real card before a line changed:

```
{G}{W}  → REFUSED   the only thing the card actually does   (false negative)
{G}{G}  → PAID      which it cannot do                      (THE FORBIDDEN DIRECTION)
```

**51 corpus cards sit on this shape**: every karoo bounce land, every Signet, the Eggs, the filter duals.
Core Commander mana, on Colton's shelf and Joe's.

⭐ **WHY NOTHING CAUGHT IT — and this is the SECOND time this stretch:** all 51 were ALREADY `native-mana`.
The tier was right; the BEHAVIOR was wrong. A per-card tier diff cannot see it, a census cannot see it, and
the coverage % was never off by a point. Same lesson as the Amulet fire site one slice earlier, reached from
the opposite direction: **the tier is not evidence about a board.** Two independent instances in one stretch
means the runtime-assertion rule is not a nicety — a native card with no runtime pin is an unverified claim.

**THE SHAPE:** a bundle is a per-color tally (`fixed`), not a bigger `amount`, threaded parser → manaSources
→ planPayment → commitManaTap. Stamped ONLY when >1 distinct color, so every single-color source is
byte-identical (Sol Ring pinned). The commit half is load-bearing: "affordable per planPayment" == "actually
paid" is the invariant that seam exists to hold.

**A companion bug the bundle exposed:** the generic loop drained only the tap's recorded primary color,
stranding the rest — a Signet could not pay {2}. Generic is paid LAST, so anything left in `working` is
legitimately spendable there.

**VIVID (+2) rides the same shape** with a board-derived color set (Bloom Tender, Faeburrow Elder). It CANNOT
ride the existing amountSpec path — that yields N mana freely spendable across its colors, which on a W/G
board pays {G}{G}, reintroducing the exact FP above. That near-miss is the reason to distrust "just reuse the
variable-amount path" for anything whose colors are simultaneous.

Mutation-checked M43–M46, each seen to fail. Tier diff: **GAINED 2 · LOST 0 · RETIERED 0.**

⚠️ **ONE PROCESS NOTE ON MYSELF:** my first probe of this used `planPayment(sources, cost)` — the real
signature is `(pool, sources, cost)`. Every cost read as "nothing owed" and everything came back PAYABLE. I
had written the words "51 staples over-deliver" before noticing. **A probe that reports what you expected is
the one to re-check first.** The real seam then showed a worse bug than the imagined one.

## 🔭 SCOPED, NOT BUILT — IMPRINT (29 corpus cards, 0 native today). Build in THIS order.

Chrome Mox is a ×3 shelf card and the leverage head's next entry, but it is not a card-sized job: **imprint
has zero engine support.** Measured: 29 corpus cards carry an `Imprint —` line, none classify native.

**THE 29 SHARE ONLY THE STAMP.** The payoffs diverge hard, and lumping them is how this becomes a swamp:

- **STATIC-CHARACTERISTIC payoffs (the contained subset — build these):** Chrome Mox (the exiled card's
  COLORS → a mana source), Semblance Anvil (shares a card type → cost reduction), Extraplanar Lens (same-name
  land taps → extra mana), Ugin's Labyrinth.
- **COPY/CAST payoffs (a separate, much larger project — do NOT start here):** Isochron Scepter, Panoptic
  Mirror, Soul Foundry, Spellbinder, Prototype Portal, Mimic Vat.
- **TARGETED-EXILE-ON-ETB payoffs (a third family):** Duplicant, Phyrexian Ingester, Exclusion Ritual,
  Invader Parasite, Mirror Golem.

**PIECES, in build order — and the order is the whole point:**

1. ⚠️ **THE STAMP AND ITS FIRE SITE, FIRST.** An optional "you may exile a card from your hand" ETB choice
   that records the exiled card on the permanent. `setPendingHandDiscardChoice` (pendingChoice.js) is the
   nearest sibling to copy. **Nothing may read the stamp until something SETS it at runtime.**
2. The colors-from-imprint mana source for Chrome Mox — a `colors` set read off the stamp, `amount: 1` (a
   CHOICE among the imprinted colors, which the existing `colors` array already expresses; no new shape).
3. Only then the other static payoffs.

⛔ **THE TRAP, NAMED IN ADVANCE** (this is Amulet's lesson and the mixed-bundle lesson, and imprint is where
they meet): build 2 before 1 and Chrome Mox classifies `native-mana` while tapping for **nothing** — a
runtime-vacuous native the tier diff reads as a WIN. And an empty Mox modeled as "any color" is worse than
useless: it is a turn-one ritual out of a card that should be dead, the same forbidden shape as the
condition-gated Mox Opal already refused elsewhere in this ledger. **An un-imprinted Mox must produce
nothing.** Pin that on a board before pinning anything else.

## ✅ SHIPPED — IMPRINT pieces 1+2: Chrome Mox is native (`5d24a81d`, `7af34dc1`)

The scoped order held, and the two commits are the proof of why it is the right one:
**piece 1 (the stamp) moved ZERO cards. Piece 2 (the payoff) moved one.** Had they been built in the other
order, the tier diff would have read GAINED 1 for a Chrome Mox that taps for nothing.

**Piece 1 — the stamp and its fire site.** `setPendingImprintChoice` / `resolveImprintChoice` / `applyImprint`,
plus an ALLOWLIST span matcher. Two details worth keeping:
- The **first bug was the ability word.** Imprint is CR **207.2c** — the same list as landfall/enrage/raid —
  so the unstripped "Imprint —" label sat between the line start and "When" and the boundary-anchored trigger
  regex never matched. Measured: even `Imprint — When this artifact enters, draw a card.` detected NOTHING.
  All 29 cards' ETB was invisible.
- The **"you may" is NOT peeled before the span matchers.** α2's peel lives inside parseEffectClause and the
  up-front matchers run first, so the prefix is consumed in the matcher and re-stamped `optional:true`.
  Measured, not assumed — the clause fell to LOW until this was handled.

**Piece 2 — the payoff is the GATE, nothing else.** "One mana of any of the exiled card's colors" is a CHOICE
among the stamp's colors; the existing `colors` array already expresses it, so no new shape. No stamp → not a
mana source AT ALL. Colorless card imprinted → same. Mutation-checked both.

⚠️ **A FABRICATED RULE NUMBER, MINE, CAUGHT IN-FLIGHT.** I wrote "CR 702.61" throughout the first draft of
this slice. **702.61 is Split Second.** Fixed every instance — and the check turned up the SAME class of bug
sitting in the tree already: `rulesRetrieval.js` mapped **suspend** to 702.61, so a suspend question was being
handed the split-second rule. Fixed to 702.62 and audited all **129** hint numbers in that table against
cr_current.json; the rest are clean. **The lesson is procedural: I cited a plausible number from memory in a
codebase whose §1.2 forbids exactly that. Verify against the CR file at WRITE time, not at review time.**

⚠️ **THE CONTRACT TESTS EARNED THEIR KEEP.** Adding a pendingChoice kind failed three pins immediately —
a missing fixture, and `KNOWN_UNWIRED` (which is empty and *may only shrink*) catching that a human seat had
no panel to answer with. That is a soft-lock, not a cosmetic gap, so this shipped with `ImprintPanel` + hook
method + server entry/dispatch rather than an ignore-list entry. **The panel's submit guard differs from the
one it was cloned from on purpose**: HandDiscardPanel's `if (!cardId) return` would have swallowed imprint's
legal DECLINE.

**Still body-only, deliberately:** Semblance Anvil, Isochron Scepter, Soul Foundry, Spellbinder, Prototype
Portal, Mimic Vat. Their payoffs (cost reduction / copy / cast) are separate slices; the stamp they all need
now exists and is board-proven.

## 🗺 FRESH SHELF READ (2026-07-28, after slices 57–61) — the cheap shelf work is DONE

⚠️ **RUN THE SHELF PROBE AGAINST APPDATA, NOT THE REPO.** `MTG_APP_ROOT=<repo>/app` makes
probe-shelf-blockers.mjs report **`decks scanned: 0`** and print an empty, entirely convincing table. The real
deck store is the installed app's:

```
MTG_APP_ROOT="C:/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/probe-shelf-blockers.mjs
```

(The *oracle* probes still want the main-tree `app/`. The two roots are different and neither errors when
wrong — the shelf one just reads zero.)

**THE REAL STATE: 403 shapes touch exactly ONE deck.** The ×3 head is now entirely subsystems — there is no
cheap shelf card left:

| card | ×decks | what it actually needs |
|---|---|---|
| Wan Shi Tong | 3 | an **opponent-searches-their-library EVENT** the engine has no concept of |
| Mindbreak Trap | 3 | an alternate cost + "exile any number of TARGET spells" |
| Teferi's Protection | 3 | **PHASING** (a whole subsystem) + "life total can't change" |
| Level Up | 3 | THREE unbuilt pieces — sized below |
| Herd Heirloom | 3 | ⛔ spend-restricted mana — a DELIBERATE refusal, do not "fix" |

**LEVEL UP, sized honestly** (all three measured LOW today, none exist):
1. the Aura's own ETB "put a +1/+1 counter on ENCHANTED CREATURE" (the enchanted referent on a counter atom);
2. the quoted GRANT of an attack trigger to the host;
3. "DOUBLE the number of +1/+1 counters on it", then a power≥10 threshold draw.
It is the most contained of the four, and it is still a three-piece slice. **Build the grant (2) before the
payoff (3)** — same law as Amulet and imprint.

## ⛔ MEASURED AND CLOSED — the "another target creature" BITE is a FALSE SHELF LEAD

The probe ranks `Target creature you control deals damage equal to its power to another target creature` at
2 decks (Contest of Claws, Hulk's Thunderclap), and the existing bite arm is genuinely one target-scope away
(it anchors "target creature you don't control"). **Building it moves NEITHER shelf card**: Contest of Claws
is blocked by **discover**, Hulk's Thunderclap by **behold** + a conditional destroy. The bite is not their
blocker.

Corpus-wide the shape is 11 cards, and only **Fall of the Hammer** is the bare one-arm case (+1). The others
are distinct shapes, not one vein: Mutiny/Breaking of the Fellowship put the damage on an OPPONENT'S creature
with a linked "that player controls" target, Deadshot is a tap-compound with an "it" referent, Cosmic Hunger
widens to a creature/planeswalker/battle union.

**+1 corpus, +0 shelf.** Recorded so no future resume re-chases the row — this is the probe header's own
"confirm against the real card before building" rule paying for itself a seventh time.

## 🏁 EARTH BENT IS AT 90% — the first JOE-side deck across the 1.0 per-deck bar (`277f161b`, `977b72e9`)

Verified, not asserted: `90%  Earth Bent  (90/100)` · `below the bar: none`. It was the closest deck on the
shelf at 88%, and it took exactly the two cards it needed.

**Earth Rumble (+1)** — one arm. Earthbend, the CR 603.7 reflexive "when you do" seam and fight-pair ALL
already existed; "up to one" was supported on the ENEMY side of the pair and never on the FIGHTER side — the
missing-sibling shape again. It needed its OWN flag (`secondaryOptionalTarget`): `optionalTarget` binds to
the PRIMARY, and a fight-pair's primary is the ENEMY, so reusing it would have made the OPPONENT's creature
declinable — a different card, and one that reads as working until you check which half got declined. M50
puts the flag on the wrong half to pin exactly that.

**Tale of Katara and Toph (+1)** — ⚠️ **the detection arm was the small part, and on its own it shipped a card
that classified `native-static` while doing NOTHING at runtime.** Two false positives underneath, neither
visible to the classifier:

1. **THE FIRE SITE.** `checkTapTriggers` read the PRINTED card (`lk.permanent.card`) and never consulted
   GROUP-GRANTED abilities. The recipient creatures' own text says nothing about tapping, so the granted
   trigger could never fire. Routed through `triggersForEvent`, which already collects grants AND applies the
   gates that path skipped entirely. **Every granted becomes-tapped ability now works**, not just this card.
2. **THE DROPPED LATCH.** The descriptor build RECOMPUTES `oncePerTurnTrigger` from the printed sentence
   "This ability triggers only once each turn." and overwrote the flag the arm sets from the EVENT wording
   ("for the first time"). Detection looked correct and the latch was gone — it would have fired on EVERY tap
   instead of the first: an over-fire, the forbidden direction.

⭐ **THE RULE THIS COST ME, stated plainly: assert on the BUILT DESCRIPTOR, not on the arm's return value.**
The arm returned the right object and a later stage overwrote the field. Same class as the
captured-but-unread trap, one layer further down the pipeline.

⚠️ **PLACEMENT, banked so it is not rediscovered:** `classifyCondition` has a blanket
`with|while|during|named` reject. The first draft of the arm sat BELOW it and was simply never reached
(measured — the bare form detected, EVERY qualified form returned `[]`). A specific, enforceable qualifier
belongs beside `castWithExempt` ABOVE the reject, never as a weakening of it.

**Remaining Earth Bent gap (10 slots — at the bar now, so no longer blocking):** Scapeshift + The Earth King
(linked X), Ashaya, Lumra, The Ozolith, Traveling Chocobo, Earthbender Ascension, The Legend of Kyoshi —
plus the two DELIBERATE refusals, Scythecat Cub (inexpressible condition) and Herd Heirloom
(spend-restricted mana). **Do not re-chase the refusals.**

## ✅ SHIPPED — NONCREATURE artifact/enchantment targets (+5), a narrowing (`a8279062`)

48 corpus cards use "noncreature artifact / enchantment" and NONE classified native. The qualifier EXCLUDES
artifact and enchantment CREATURES, so approximating it as the bare type would let the engine destroy an
artifact creature the printed card cannot touch. **These shapes were REFUSING correctly** — this slice is
FP-closing, and the new arms are strictly narrower than the bare ones beside them.

Two details worth keeping:
- **Alternation order is load-bearing.** The qualified nouns are listed BEFORE the bare ones so the qualifier
  is consumed whole; left-to-right matching would otherwise let "artifact" win and silently drop
  "noncreature". M53 reproduces exactly that.
- **⭐ The enumerator is LAYER-AWARE.** A permanent can be a creature only BY LAYERS. `addPermanents` now
  passes the permanent as a second argument (every pre-existing predicate takes one parameter and ignores it,
  so it is inert for them) and the new predicates consult `permanentIsCreature`.
  **Proven on real machinery, not asserted:** an ARTIFACT LAND under a mass land-animation (Nature's Revolt)
  is an Artifact whose live type line includes Creature — un-animated it is offered, animated it is not.

⚠️ **MEASURED SCOPE LIMIT:** the engine models mass LAND animation but **not** mass ARTIFACT animation ("All
artifacts are 2/2 creatures" does not animate; March of the Machines is not modelled as an animator). So the
artifact-land case is the only scenario reaching the layer branch today. Recorded because the obvious test to
reach for — March of the Machines — silently proves nothing.

⛔ **AND THE ADJACENT VERBS ARE NOT WORTH EXTENDING — measured, 0 would flip.** `exile` already shares
the destroy arm, so it came free. `return` / `gain control of` / `tap` / `untap` + a noncreature target exist
on 6 corpus cards (Salvaging Station, Ghirapur, Yuffie, Blinkmoth Well, The Fearsome Flock, Souvenir
Snatcher) and EVERY ONE stays blocked with the qualifier stripped — the qualifier is not their blocker. The
destroy/exile arm captured the whole vein.

## ⛔ MEASURED AND CLOSED — TEAMWORK is a FALSE LEVER (the shelf probe's new #1 row)

`Teamwork 2` ranks TOP of the shelf blockers at **3 cards across 3 decks** (We Say Thee Nay!, HULK SMASH!,
Earth's Mightiest Heroes) — the best spread on the board. It is not worth building, and here is the
arithmetic so nobody re-derives it:

- Teamwork is an OPTIONAL additional cost, *"tap any number of creatures you control with total power N or
  more"* — i.e. **exactly the banked "tap N creatures as a cost" design fork** (enumerate combinations =
  correct but explosive, vs. auto-pick = legal but removes agency). It is a parked DECISION, not a slice.
- ⭐ **And solving it would move at most ONE of the three cards**, because teamwork is not their only
  blocker. Measured on the non-teamwork halves judged alone:
  - We Say Thee Nay! — "counter target spell unless its controller pays {2}" → **HIGH** (only card teamwork
    actually gates)
  - HULK SMASH! — mode 1 "destroy target noncreature artifact" was LOW (**now fixed by this slice**), but the
    modal wrapper + the "if cast using teamwork, choose both instead" conditional remain
  - Earth's Mightiest Heroes — "reveal the top eight … put a creature card from among them onto the
    battlefield" → **LOW**, unrelated to teamwork

**Verdict: a top-ranked row by spread that is worth ~1 card.** Same shape as the bite row closed earlier —
the probe measures WHERE a blocking sentence appears, never whether it is the card's ONLY blocker. That check
is manual and it has now paid off twice in two sessions.

## 🚨 SHIPPED — MANA REFUSALS ARE PER-ABILITY, NOT PER-CARD: 23 DEAD LANDS revived (+16) (`9eba4b2e`)

An ability is a LINE (CR 113.3). Both standing mana refusals — the SPEND RESTRICTION and the CONDITION GATE
— matched anywhere in the oracle and nulled the WHOLE CARD, so a restricted or gated SECOND ability silently
killed an UNCONDITIONAL FIRST one.

**Measured: 30 corpus LANDS produced NO MANA AT ALL.**
- the entire **Verge cycle** — Bleachbone Verge prints a plain `{T}: Add {B}.` beside a gated
  `{T}: Add {W}. Activate only if …`
- the **Village cycle**, Tournament Grounds, **Castle Garenbrig**
- **Madblind Mountain**, whose gated ability is a **SHUFFLE** and whose mana is the basic-land reminder
  `({T}: Add {R}.)` — pure collateral

23 are now live. The remaining 7 are genuinely restricted-only and still refuse.

⭐ **AND NO METRIC COULD SEE IT — this is the THIRD find of this exact class this run.** Lands are credited
native by BEING lands, so coverage was never off by a point while ~100 real fixing lands (painlands, filter
lands, Verges) were **Wastes** in the sim. Identical blind spot to the karoo/signet bundle. **The rule is now
earned, not theoretical: when a card class is credited by TYPE rather than by parse, the metric cannot see
its runtime at all — audit those classes directly.**

**The refusals are unchanged where they matter.** A card whose ONLY mana line is restricted or inexpressibly
gated still returns null — Herd Heirloom, Jeweled Lotus, Springleaf Drum all stay refused (pinned). Keeping
the UNRESTRICTED line is strictly what the card does with no strings attached, so the change can only
under-deliver.

**Two precision fixes on the gate stamp**, both under-delivering bugs the naive version would have added:
an inexpressible gate must not be stamped onto mana parsed from a DIFFERENT line; and the gate is taken from
the line actually PARSED. Fanatic of Rhonas is the case that proves the second — plain `{T}: Add {G}.` plus a
Ferocious-gated bigger line, and the old any-match form gated the {G} on ferocious, switching the dork off
until a 4-power creature was out. **Mox Opal keeps its live gate** (expressible, on its only mana line).

Mutation-checked M55–M56. Tier: **GAINED 16 · LOST 0 · RETIERED 0**, every gain verified as crediting only
freely-made mana (Delighted Halfling gets its {C}, never the legendary-restricted any-color). **The land
fixes do not appear in the tier at all, which is the whole point.**

## ⚠️ STILL OPEN IN THIS AREA — the colorless-only lands (73), NOT yet fixed

Separate bug, same family, **left deliberately**: `parseAddClause` takes the FIRST `Add` clause and stops, so
a land printing `{T}: Add {C}.` on line 1 and its colours on line 2 models as **colorless only**. That is the
whole painland cycle (Shivan Reef, Adarkar Wastes, Karplusan Forest, Battlefield Forge…), the filter lands
(Flooded Grove, Mystic Gate, Graven Cairns) and ~60 more. **22 SHELF land-slots across 18 cards.**

⛔ **Do NOT just union the colours — the riders are the reason it is not a one-liner.** Each second ability
carries a real cost the engine would otherwise ignore, which turns an under-delivery into an over-delivery:
- **painlands** — `This land deals 1 damage to you.` Ignoring it = painless painlands, strictly better than
  printed (the forbidden direction). Needs a life cost on the tap; `commitManaTap` already has the shape for
  it (`sacrifices` does the same job).
- **filter lands** — `{G/U}, {T}: Add {G}{G}, {G}{U}, or {U}{U}.` A hybrid mana COST to make a 2-mana
  BUNDLE. The bundle half already exists (`fixed`, shipped this run); the mana-cost-to-tap half does not.
- **Mogg Hollows** — `doesn't untap during your next untap step` (`setDoesNotUntapNext` exists).

Sized honestly: the colour union is easy, the riders are the slice. Build the rider first, then the union —
the same order law that has held all run.

## 🚨 FOUND, MEASURED, NOT FIXED — MANA-ABILITY ACTIVATION COSTS ARE NEVER CHARGED (93 cards, FP direction)

**A mana ability's own MANA cost is dropped.** `manaProduction` records what the ability produces and nothing
records what it costs, so `planPayment` taps it for free.

⭐ **Verified live, not inferred:** a lone **Prismite** (`{2}: Add one mana of any color.`) on an otherwise
EMPTY board — no lands, empty pool — pays `{U}`. Mana fabricated from nothing. That is the forbidden
direction and it needs no board state at all to trigger.

**Precise split** (the modelled line's cost carries plain mana symbols; `{X}`/phyrexian/hybrid skipped as
uncountable, variable output skipped):

| class | count | reality vs engine | examples |
|---|---|---|---|
| **NET-ZERO or worse** | **51** | produce ≤ cost → real net is 0; engine gives free mana | Prismite, Prophetic Prism, Orochi Leafcaller, Golden Egg, Nomadic Elf (`{1}{G}` for ONE mana) |
| **NET-POSITIVE** | **39** | real ramp, engine over-counts by exactly the cost | every Signet (`{1}, {T}` → 2 mana), Sungrass Prairie, Shadowblood Ridge |

⛔ **I TRIED THE PARSE-LAYER FIX AND BACKED IT OUT — read this before trying it again.** Refusing net-zero
abilities in `manaProduction` works and removes the fabrication, but it **breaks five existing pins that
deliberately keep filters producing**, and `manaModel.test.js` states the design intent in its own words:

> *"A mana FILTER (pure mana cost, no {T}) is **payable from the pool** — kept exactly as before."*

That is a claim about the **PAYMENT layer**, and the payment layer is precisely where the gap is. The parse
layer is the wrong place to fix it, and refusing there would also delete the cards' colour FIXING, which is
most of why they are played. **The pins are not wrong; the runtime never implemented what they assume.**

**THE FORK (Colton-grade or sharp-Cindy-grade, not a 3am call):**
- **(A) Charge it in `planPayment`** — the architecturally right layer. Give the source an activation cost;
  a costed source may only be tapped when the cost is coverable. Conservative first cut: require the cost
  from ALREADY-FLOATING mana (never chain tap→filter→spend). Never fabricates; under-delivers on
  land-then-filter lines, which is the safe direction.
- **(B) Refuse net-zero at the parse layer** — smaller, but contradicts the shipped design intent above,
  deletes colour fixing, and costs 51 cards of native-mana.

**Recommendation: (A), and only while sharp** — it touches the payment core that the karoo bundle and the
generic-drain fix also live in, and that core is the one seam where "affordable == actually paid" must hold.

⚠️ **Note the asymmetry vs. the per-line refusal shipped in slice 65:** that one was a pure under-delivery
being corrected, so it was safe to ship unattended. This one is an over-delivery whose fix trades against a
documented decision — different risk class, deliberately left for a waking decision.

## ✅ SHIPPED — PAINLANDS tap for their colours and pay the life (`b15cdecd`)

All 10 (`Shivan Reef`, `Adarkar Wastes`, `Karplusan Forest`, `Battlefield Forge`, `Llanowar Wastes`,
`Caves of Koilos`, `Yavimaya Coast`, `Brushland`, `Underground River`, `Sulfurous Springs`) modelled as
**COLORLESS ONLY** — premium fixing that could not cast a coloured spell.

⛔ **The life cost is why this was not a one-line colour union.** Admitting {U}/{R} while ignoring
"deals 1 damage to you" is a PAINLESS painland — strictly better than printed. Colours ride together with
`painColors`/`painAmount`, charged only when the tap actually picks a painful colour; the {C} half stays
free. **M58 over-charges the free half specifically**, because over-charging is just a different infidelity.

**Mogg Hollows deliberately KEEPS its colourless read** — same two-line shape, but a "doesn't untap during
your next untap step" rider. Dropping that drawback is the same over-delivery in a different costume.

⭐ **Tier diff: GAINED 0 · LOST 0 — and that IS the point.** The fix is invisible to every number the project
tracks, because lands are credited by TYPE. Third find of that blind spot this run.

## 📌 STILL OPEN in the colorless-land family (~60 lands) — the RIDERS are the work, not the union

- **FILTER LANDS** (Flooded Grove, Mystic Gate, Graven Cairns, Twilight Mire, Sunken Ruins, Wooded Bastion,
  Fetid Heath, Rugged Prairie — **the biggest SHELF group here**): `{G/U}, {T}: Add {G}{G}, {G}{U}, or
  {U}{U}.` Needs a MANA cost to activate → **blocked on the activation-cost fork banked above**, not on the
  colour union. Do not start it before that decision.
- **MOGG HOLLOWS-class**: needs the no-untap rider (`setDoesNotUntapNext` already exists) — the nearest
  buildable one after painlands.
- **Storage / counter lands** (Saltcrusted Steppe, Dreadship Reef, Fountain of Cho): remove-counter costs,
  already covered by the consumable-cost refusal. Leave alone.

## ✅ SHIPPED — enchanted-creature counter referent + the self doubling pronoun (+4) (`21c471a8`)

Two pronoun gaps, each one word wide, found while chasing Level Up:
- **`target:"enchanted"` on add-counter** (+4: Forced Adaptation, Sadistic Glee, Ephara's Enlightenment,
  Predatory Hunger). The referent already existed for tap / untap / pump / regenerate — only the counter atom
  lacked it, so the whole card parked. Runtime-verified: counter lands on the HOST; a DETACHED aura
  fabricates nothing.
- **`"double the number of +1/+1 counters on IT"`** — the parser already models the same clause written
  "…on THIS CREATURE", so only the pronoun was missing. Joins `SELF_PUMP_IT` / `SELF_COUNTER_IT`, same
  self-scope + whole-clause guards.

## 📏 RE-SIZED HONESTLY — LEVEL UP IS A **FOUR**-PIECE CARD, NOT THREE (and still body-only)

The ledger sized it at three. Measured, it is four, and one of the three was already done:

| piece | state |
|---|---|
| the Aura's ETB "counter on enchanted creature" | ✅ **shipped above** |
| the quoted attack-trigger GRANT to the host | ✅ **already worked** — verified with a control: an Aura's quoted trigger reaches its host and an unmodelled body routes to the Arbiter |
| "double the number of +1/+1 counters on it" | ✅ **shipped above** (the bare clause) |
| the COMPOUND + a SELF power-threshold ("Then if it has power 10 or greater, draw a card") | ❌ **unbuilt — the remaining blocker** |

`"draw a card if THIS CREATURE has power 10 or greater"` is LOW while the board-condition form
(`"…if you CONTROL a creature with power 4 or greater"`) is HIGH — so the gap is a SELF power threshold in
the condition vocabulary, plus the "A. Then if <cond>, B." composition. **Level Up stays body-only until both
land: a partial fire is the false positive.**

⚠️ **The build-order law had nothing to enforce here** — the grant was already live, so there was no
payoff-before-grant hazard. Worth recording: checking the fire site FIRST cost one probe and saved building a
piece that already existed.

## 🎓 TWO PARK PINS GRADUATED — and the pattern is now explicit

`auraOwnTriggered.test.js` asserted Forced Adaptation parks **because the counter parser rejected
`target:'enchanted'`** — a statement about a MISSING CAPABILITY, not a refusal to keep. That file already
carried the precedent in its own words on the very next test: *"This pin asserted the opposite and fired the
moment the detector arm landed, which is exactly its job."* So it graduated, and the park guarantee it
protected kept a live fixture (Followed Footsteps).

⭐ **DISTINGUISH THIS FROM THE FILTER-LAND PINS I REFUSED TO OVERRIDE LAST SLICE.** Those state a design
INTENT ("payable from the pool") about a layer that was never implemented — overriding them would decide a
banked question. These state a CAPABILITY GAP that has now closed. **Capability pins graduate; intent pins
need a decision.** Read which kind you are looking at before touching it.

⚠️ `aura.test.js`'s routing test had Forced Adaptation as its FIXTURE (itself a swap from Bequeathal for the
same reason — this is the third rotation). Re-anchored on Writ of Passage, and it now asserts the fixture is
**actually OFFERED** before reading it: the board's pool is colorless-only, so a coloured fixture is never
offered and the test dies on a `TypeError` that reads exactly like a routing failure. Hit live while
swapping.

## ✅ SHIPPED — SELF power threshold in the condition vocabulary, layer-aware (`fb3bfa85`)

`"if THIS CREATURE has power N or greater"` — the SELF referent beside the existing board-wide form,
resolved through `context.sourcePermanentId`. **Layer-aware** (`creaturePower(perm, state)`), which is the
entire point on a card that doubles its counters and then asks whether it got big enough. FN-safe: a missing
or departed referent is `null` ("can't confirm"), never `false`.

Reachable today through the **intervening-if** path, pinned end to end in both directions including the
10-vs-9 boundary. Tier GAINED 0 — no corpus card uses that variant yet; the value is the vocabulary plus its
pinned consumer.

## 🚧 LEVEL UP — ONE BLOCKER LEFT, AND IT IS PARSER PLUMBING, NOT VOCABULARY

Three of four pieces are done (`21c471a8` shipped two, the grant already worked, `fb3bfa85` the condition).
The last one is precise:

> Both parser arms that attach an atom-level `condition` — the LEADING `"If <cond>, <effect>"` and the
> TRAILING `"<effect> if <cond>"` — gate on **`spellConditionParseable`**, which BY DESIGN probes with an
> EMPTY context. A source-dependent condition can never pass it. **The parser cannot tell a TRIGGER clause
> (which supplies `sourcePermanentId`) from a SPELL clause (which does not).**

⭐ **The runtime half is already verified and is NOT the problem:** `triggers.js` threads `sourcePermanentId`
into the trigger context and `runProgram` passes that context to `evaluateInterveningIf`, so a trigger CAN
answer at resolution and a spell gets `null` and skips. **No runtime-vacuous native lurking here** — checked
before building anything.

**THE FIX (contained, but it touches shared plumbing — do it while sharp):** thread a `triggerScoped` flag
through `parseEffectClause` options from `buildTriggerStack`, and let the two conditional arms accept
source-dependent conditions only when it is set. Sized: one option, two call sites, two arms.

**Then the compound:** `"A. Then if COND, B."` is already the LEADING form once `"Then"` is stripped — no new
condition machinery needed. Measured: with the compound rewritten and a KNOWN condition, the whole clause
parses HIGH, so the composition works.

**What it is worth, measured, so the next resume can judge it cold:**
- the "Then if" compound alone → **+4 corpus** (Shuri, Replicating Ring, Psychic Whorl, Hour of Promise);
  118 cards carry the shape but it is rarely their only blocker
- the self threshold alone → **2 cards** (Level Up, Hog-Monkey Rampage)
- **together → Level Up, a ×3 SHELF card** — which is the actual reason to do it

## ✅ SHIPPED — source-scoped atom conditions + the sequenced "Then if" form (+3) (`9b6441c0`)

Two composing changes. **The scope gate:** an atom-level `condition` may attach only when the resolver can
evaluate it, but BOTH conditional arms used the SPELL probe (empty context) — so a source-dependent condition
could never attach even on a TRIGGER, which has a source. Now split by the context the caller can honestly
supply:

- resolving SPELL → no object thread → `spellConditionParseable`
- a PERMANENT'S ABILITY → has its SOURCE → `activationConditionParseable`

⭐ **The source-only probe is deliberate.** A trigger's context also carries per-event fields (triggering
permanent, defender, damage snapshots) that VARY BY EVENT; probing with all of them would admit conditions
some other event's trigger cannot answer. `sourcePermanentId` is the one field EVERY trigger carries — the
honest floor.

⚠️ **`triggerRouting`'s validator had to move WITH `buildTriggerStack`** — its own comment requires it to
mirror the allowlist exactly, and leaving it behind would have been a metric⇄runtime divergence (the metric
saying "won't route" about something the runtime routes).

**The sequenced form** `"A. Then if COND, B."` needed no new machinery: `splitClauses` already hands the
second sentence over as `"then if <cond>, <effect>"`, so peeling the connective was the whole gap.

## 🎓 ONE MORE PIN GRADUATED — and I verified it was a graduation, not an FP

`rampMulti` asserted **Hour of Promise** stays LOW because a "Then if" rider had no route. Before flipping it
I checked BOTH halves are real: `"you control three or more Deserts"` evaluates correctly at the boundary
(0/2 → false, 3/5 → true) and the rider parses to a genuine `create-token` atom **carrying** that condition.
A rider that fires only when its condition holds is not a dropped rider. The guarantee it protected keeps a
live fixture — a rider whose condition is outside the vocabulary still parks the whole card.

**This is the capability-vs-intent rule from slice 68 paying off twice now.** Capability pins graduate once
the capability lands; intent pins (the filter-land "payable from the pool") need a decision. Check which kind
before touching one.

## ⛔ LEVEL UP — PARKED, and the last blocker is a CREED ANCHOR, not a gap

Four of five pieces are in (`21c471a8` two, the grant already worked, `fb3bfa85` the condition, `9b6441c0`
the scope gate + compound). The remainder:

> The `SELF_DOUBLE_IT` pronoun rewrite is **whole-clause anchored ON PURPOSE** so a rider can never be
> silently dropped. Level Up's granted body is `"…on it. Then if…"`, which does not match — deliberately.

**Completing it means deciding whether that anchor may fire PER-SENTENCE inside a compound.** That is a real
CREED call (the anchor is the thing standing between "modelled" and "silently dropped rider"), not plumbing,
so it is NOT a 3am change. Pinned as parked in `sourceScopedCondition.test.js` so the state cannot drift
unnoticed.

⭐ **Worth noting what this cost:** Level Up was sized at 3 pieces, then 4, and is now 5 — each re-size came
from measuring the next layer rather than assuming it. The three shipped pieces are all independently useful;
none of the work is stranded on the card that motivated it.

## ✅ SHIPPED — painland cycle COMPLETED: 5 slow variants + 6 that were PAINLESS (`aad5b36c`)

Two more shapes of the same family. The second was live in the **forbidden** direction:

1. **THE SLOW HALF (+5).** Skyshroud Forest, Scabland, Pine Barrens, Salt Flats, Caldera Lake carry a leading
   `"This land enters tapped."` line; my original anchor started at `{T}: Add {C}` and silently missed FIVE of
   the fifteen. ⚠️ **I shipped that arm last slice believing it covered the cycle** — it covered two thirds.
   Counting the family AFTER building, not before, is what caught it.
2. ⭐ **THE SINGLE-ABILITY FORM — an FP that was already live.** The Odyssey threshold cycle (Cabal Pit,
   Barbarian Ring, Cephalid Coliseum, Centaur Garden, Nomad Stadium) + Fogwell's Gym print ONE coloured
   ability that costs life. These were **never colourless** — their first Add clause IS coloured, so they
   parsed fine and the damage rider was simply DROPPED. Painless painlands: strictly better than printed.
   Unlike the two-line cycle's under-delivery, this was an **over**-delivery.

⛔ **Tomb of Urami stays excluded** — `"deals 1 damage to you IF you don't control an Ogre"` is a condition
nothing models, so charging always would over-charge. Known, recorded gap; not a new wrong answer.

⭐ **A REDUNDANT GUARD REMOVED BECAUSE ITS MUTATION SURVIVED.** I wrote a second `!/damage to you if/` test
beside the regex. M65 removed it and nothing failed — the anchor's own `\.` already excludes the conditional
printing, which has no period there. **Dropped rather than kept: a guard that cannot be seen to fail implies
protection it does not add.** This is the hollow-gate law applied to my own belt-and-braces.

Tier GAINED 0 · LOST 0, as expected — this whole family is invisible to the metric.

## 🗺 THE COLOURLESS-LAND REMAINDER, grouped (so the next resume picks by shape, not by card)

| shape | n | state |
|---|---|---|
| COUNTER cost (Saltcrusted Steppe, Dreadship Reef) | 15 | ⛔ covered by the consumable-cost refusal — leave |
| CONDITION-gated (the Tainted cycle) | 10 | needs per-line conditions + colour union |
| NO-UNTAP (Mogg Hollows cycle) | 10 | buildable (`setDoesNotUntapNext` exists) — **but 0 SHELF slots, 0 tier** |
| "other" (Phyrexian Tower, Crypt of Agadeem) | 10 | mixed one-offs |
| FILTER, hybrid cost (Mystic Gate, Flooded Grove) | 10 | ⛔ **blocked on the activation-cost fork** — biggest shelf group |
| MANA-COST activation (Cabal Stronghold) | 8 | ⛔ same fork |
| SPEND-restricted (Village cycle) | 6 | ⛔ deliberate refusal — leave |
| PAINLAND | ✅ | **done, all 15** |

**Read: the cheap land work is finished.** What remains is either a deliberate refusal, worth zero on the
shelf, or blocked on the banked activation-cost decision.

## 🔍 AUDIT — the `native-body` tier is HONEST (and one hollow test found) (`45b23547`)

I swept `native-body` for the blind spot the lands had: **a tier credited by ABSENCE of parsed abilities
rather than by parse.** If a vanilla-credited creature carries a real restriction the engine ignores, that is
an over-delivery nobody would ever see.

**Result: the tier is honest.** 1,844 native-body cards carry non-reminder text; almost all is keyword-only,
and of the 102 distinct non-keyword SENTENCES the high-frequency ones are all genuinely implemented AND
wired — `can't block` (39), `attacks each combat if able` (29), `can block only creatures with flying` (24),
`can't attack unless defending player controls…` (10), `enters tapped` (15, verified behaviourally on both a
creature and an artifact). **No FP found.** Recording that, because "we checked and it was clean" is worth
exactly as much as a find the next time someone wonders.

⚠️ **ONE PROBE OF MINE WAS WORTHLESS AND I ALMOST BELIEVED IT.** I grepped the engine source for each
restriction sentence and got "55 of 62 unimplemented" — including `can't block`, which I had *already
confirmed* is implemented. The engine stores these as REGEXES (`reCantBlock`), never as literal sentences, so
fragment-matching source text can never distinguish implemented from missing. **Discarded the list; tested
behaviourally instead.** A probe whose answer contradicts something you have already verified is wrong about
everything else too.

## ⭐ THE REAL FIND — a green test that never touched the shipped path

`attackDefenderLandRequirement` / `defenderMeetsAttackLandRequirement` are exported and **tested**, with **no
engine caller**: `legalChoices` enforces islandhome via the generalized `attackDefenderRequirementOf` +
`defenderMeetsAttackRequirement`. So `islandhome.test.js`'s helper assertions were green while never
exercising the live path — **and would have stayed green if the live path broke.** The file header even
documented the dead function as the enforcement route.

Fixed in the order that keeps the guarantee live at every step: (1) verify the live pair is behaviourally
IDENTICAL on island / snow land / swamp; (2) repoint both test files and correct the header; (3) only then
delete. The old comment claimed the pair was *"kept because tests and callers pin the land-string contract"*
— true of the tests, false of the callers, which is precisely how it survived.

**The integration half of that file (`legalActionsForPlayer`) was always real** and is untouched — it is the
part that actually proved the restriction works, and it is why this was a bookkeeping hazard rather than a
live bug.

⭐ **RULE EARNED: "exported + tested" is not "wired."** Before trusting a green suite as evidence for a
behaviour, check the function it calls has a NON-TEST caller. Cheap: `grep -rl <fn> src/ | grep -v test`.

## 🔧 SHIPPED — `probe-dead-exports.mjs`: "exported + tested" is not "wired", mechanized (`c053e89b`)

The islandhome find generalizes into a sweep: **a green suite is evidence only if the function it calls has a
production caller.** Definitions from `src/lib/learn`, callers searched across ALL of `src/` and `scripts/`.

⭐ **IT CARRIES ITS OWN CONTROL, and the control earned its place TWICE.**
1. My first version printed **"0 dead exports" while completely blind** — a mangled `\b` escape made every
   reference count wrong. A sweep that cannot see a dead export reports a comforting zero.
2. After adding the control, it failed again on the real script for a DIFFERENT reason: `scripts/` is in the
   caller set and the file mentions the control name as a literal, so the control counted as referenced.

**Both bugs were invisible in the output. Both were caught by the control.** The probe now refuses to print a
result unless the planted export is found.

⚠️ **SCOPE CORRECTED:** a learn-only caller scan reported **37** rows, mostly false — engine functions are
routinely consumed by API routes, components and hooks (`puzzleGoalLabel` ← `LearnView.jsx`).

## ✅ TRIAGE OF THE 16 REAL ROWS — all benign (do not re-chase)

| class | examples | verdict |
|---|---|---|
| test helpers by convention | `_resetComboCacheForTests` | hidden unless `--all` |
| CONTRACT PINS | `serializeState` / `deserializeState` | trivial JSON wrappers; the file's own docstring says the round-trip test **is** the contract |
| BACK-COMPAT SHIMS | `blockableOnlyBySubtypeOf` | documented as superseded by `groupBlockRestrictionOf` |
| THIN WRAPPERS over a used fn | `opponentsEnterTappedOf`, `cantAttackOrBlockAlone` | guarantee live through the other name — verified |

Every underlying guarantee is wired: menace via `attackerMinBlockers` (legalChoices:2903), the
alone-restrictions via the `cantAttackAlone`/`cantBlockAlone` pair (both return true on the combined text).

**So islandhome was the ONLY genuine instance, and it is already fixed.** A clean sweep is worth recording
precisely because the next run would otherwise wonder.

⚠️ **FIXTURE TRAP, logged in the probe header:** I briefly "found" that a Bear could block a
can't-be-blocked-except-by-Walls attacker — using a wording **I invented**. Nearly all real
"can't be blocked except by" text is REMINDER text for Menace / Flying / Fear, modelled as keywords. Test
against the real card; this is the seventh time that rule has caught me this run.

## 🧭 THE AUDIT PROGRAMME SO FAR — where the blind spots were, and were not

| class | credited by | result |
|---|---|---|
| **lands** | TYPE (playable because they are lands) | ⭐ **3 real bugs** — karoo bundles, per-ability refusals, painlands |
| **native-body** | ABSENCE of parsed abilities | ✅ clean — every high-frequency combat restriction implemented AND wired |
| **exported+tested helpers** | a passing test | ⭐ **1 real hollow gate** (islandhome), now mechanized against |

**Read:** the productive audits target things credited WITHOUT a parse. That vein is now swept. The next
candidates would be `native-equipment` / `native-aura` / `native-clone` (grants credited from a parse but
applied through a separate layer walk) — i.e. parse-credited but APPLICATION-unverified, a different shape
worth its own pass.

## 🚨 SHIPPED — a clone with a cost-only keyword line NEVER CLONED at runtime (`368cb402`)

**Visage Bandit** was credited `native-clone` and, on a board with a legal copy target, raised **no clone
choice at all** — it entered as itself.

`parseCloneSpec` requires the WHOLE oracle to be the copy clause, so a cost-only keyword line
(`Plot {2}{U}`, Convoke, Affinity) made it return null. **coverage.js knew that and stripped those lines
before calling `isCloneCard` — the RUNTIME (`resolvers.js` PERMANENT_ETB) called it on the RAW card.**
Classifier and runtime were reading different text about the same card.

⭐ **FIXED AT THE SHARED READER, NOT THE CALL SITE.** The strip now lives inside `parseCloneSpec`, so every
consumer — classifier, resolver, `legalChoices`' X-cost check — sees the same oracle. Patching `resolvers.js`
would have fixed this card and left the next caller free to repeat it. **This is the same lesson as
`triggerRouting` mirroring `buildTriggerStack` in slice 70: when two sides must agree, make them read one
source rather than promising to stay in step.**

⚠️ **MY FIRST RUNTIME HARNESS WAS WRONG AND THE CONTROLS CAUGHT IT.** I drove `enterPermanent`, and EVERY
card — Clone and Mirror Image included — showed "no choice", which reads exactly like the bug. That is not
the clone route; the PERMANENT_ETB resolver is. **Both controls now live in the test file** so the harness
cannot silently stop reaching the path.

Tier: GAINED 0 · LOST 0 — the tier was already claiming this card; the fix is that **the claim is now true.**

## 🧭 AUDIT PROGRAMME — the third shape swept, and this one paid

| shape | credited by | result |
|---|---|---|
| lands | TYPE (playable because they are lands) | ⭐ 3 real bugs |
| native-body | ABSENCE of parsed abilities | ✅ clean |
| exported+tested helpers | a passing test | ⭐ 1 hollow gate (islandhome) |
| **grants: parse-credited, APPLICATION-unverified** | a parse, applied through a separate layer/resolver | **⭐ 1 real bug (clone)** |

Within the last shape: **Equipment and Aura grants are CLEAN** — Bonesplitter/Loxodon Warhammer apply P/T
and keywords, Rancor/Unholy Strength/Flight apply theirs, all with unattached controls. `native-clone` is
where it broke, and it broke on the one card in the tier carrying an extra keyword line.

⭐ **THE GENERALIZABLE QUESTION, now stated for the next pass:** *does the classifier transform the oracle
before deciding, and does the runtime apply the SAME transform?* Every pre-strip, normalization or elision in
`coverage.js` is a candidate. That is a concrete, finite list worth walking — this find was one entry in it.

## 🚨 SHIPPED — CLASSIFIER/RUNTIME ORACLE PARITY: 8 native spells were routed to the Arbiter (`7fbd341d`)

The question the last slice told me to ask, asked corpus-wide: **for every card classified `native-spell`,
does the program the RUNTIME parses come back HIGH?** Eight said no — counted native by the metric, adjudicated
by the Arbiter in play.

- **PLOT** (Plan the Heist, Rise of the Varmints) — coverage stripped the `Plot {cost}` line before deciding;
  the runtime did not, and the leftover line dragged the body LOW.
- **CASCADE** (Violent Outburst, Demonic Dread, Deny Reality, Captured Sunlight, Forceful Denial, Natural
  Reclamation) — the keyword line belongs to the TRIGGER subsystem, not the spell's effect program. Verified
  the cascade trigger detects AND routes natively before stripping, so the effect still fires.

⭐ **Both fixed in the SHARED helper** — third time this conclusion has come up (clone `368cb402`,
triggerRouting `9b6441c0`). **When two readers must agree, make them read one source instead of promising to
stay in step.**

⛔ **The plot strip is GATED and the gate is real:** a `becomes plotted` TRIGGER card (Longhorn Sharpshooter,
Aloe Alchemist) keeps its line, or an unmodeled trigger would be hidden. The text check reproduces coverage's
`parsePlotCost` gate **34/34 across the corpus** — measured before relying on it, not assumed.

## ⚠️ THE FIRST CASCADE FIX WAS TOO WIDE, AND THE TIER DIFF IS THE ONLY REASON I KNOW

Reusing coverage's cascade matcher (which also matches the reminder sentence) stripped a **REAL ability** off
cards that GRANT cascade — *"Delirium — This spell has cascade as long as…"* (Bloodbraid Marauder), *"The
first spell you cast each turn has cascade"* (Maelstrom Nexus) — and credited **9** of them native with the
granting ability silently gone. The forbidden direction.

**Why the borrow was unsafe:** coverage can use that matcher because it runs INSIDE a branch already gated on
the card HAVING cascade. A shared helper runs on EVERY card, so the same regex means something different.
⭐ **RULE: a matcher lifted out of a gated branch must be re-narrowed for the ungated context.**

⭐ **AND THE ACCEPTANCE TEST FOR A PARITY FIX IS "THE TIER MOVES ZERO."** Parity work aligns two readers; it
should not reclassify anything. When the tier moved, the strip was wrong. That is now the stated check.

## 🧪 THE SWEEP IS A PROBE, NOT A TEST — and that distinction bit me

I first wrote the corpus invariant as a test assertion. It died with `Local Oracle repository missing`: it
needs the bundled index the hermetic suite lacks, so it would have **failed CI for a reason unrelated to the
thing under test**. Per-card regressions are pinned hermetically in `classifierRuntimeParity.test.js`; the
sweep ships as `scripts/probe-classifier-runtime-parity.mjs`.

**Convention, now explicit: corpus-wide checks are PROBES (local-only, need the oracle); per-card guarantees
are TESTS (hermetic).** Mixing them makes the suite environment-dependent.

## 🧭 AUDIT PROGRAMME — the transform list is now walked for spells

`coverage.js` applies ~12 distinct oracle transforms (`stripReminder` ×25, `stripCostOnlyKeywordLines` ×4,
`stripTriggerEffectTails`, `stripTriggerAbilityLabel`, `stripModeledSelfNoUntap`, `stripCounterCostManaLines`,
`foldModalBulletLines`, `stripKickerText`, …). **The spell-cast path is now parity-clean (2282 cards, 0
divergences) and guarded by a probe.** The same question is open for the PERMANENT paths — triggers, statics,
activated abilities — where the runtime reads through different entry points. That is the next pass.

## ✅ PARITY SWEEP EXTENDED TO THE PERMANENT PATHS — all clean (`f334d31b`)

The spell side found 8 bugs last slice; this walks the same question through the permanent entry points.

```
native-spell      2282 checked · 0 divergent
native-activated  1782 checked · 0 divergent
native-equipment   170 checked · 0 divergent
```

**EQUIPMENT was the sharpest case** and is the one I expected to break: coverage strips trigger sentences
before its own Equip check (a trigger-bearing equipment like Pip-Boy would otherwise fail the residue test),
so it is *exactly* the transform-divergence shape that broke clones. The runtime reads the RAW card and finds
the Equip ability on all 170 regardless.

**TRIGGERS are aligned by construction, not by sweep:** `triggerRouting`'s validator is required to mirror
`buildTriggerStack`'s allowlist exactly, both call `detectTriggers` on the raw card, and the one divergence
that did exist (the source-scoped condition gate) was fixed in `9b6441c0`.

## ⚠️ MY FIRST ACTIVATED RUN REPORTED 71 "DIVERGENCES" — EVERY ONE WAS MY PROBE

I checked only the PRINTED abilities. The runtime has **three** entry points and the other two are not
optional:
- **GRANTED** — an Aura's quoted ability lives on the HOST (Dragon Mantle, Hot Springs); `legalChoices` reads
  it via `grantedActivatedQuotedFor`, never off the Aura's own card.
- **GRAVEYARD** — `"{4}{B}: Return this card from your graveyard…"` (Tunnel Rats, Stitchwing Skaab) is
  offered from the graveyard, a separate path entirely.

With all three: **0**.

⭐ **THIRD TIME THIS EXACT SHAPE:** the dead-export sweep's first 37, the restriction-grep's "55 of 62", now
this 71. **A probe that models only PART of the runtime reports the missing part as a defect.** The tell is
always the same — a suspiciously large number against code that has been exercised for months. The habit that
saves it: open two or three of the named cards and read them before believing the count.

## 🧭 THE TRANSFORM-PARITY VEIN IS SWEPT

| side | result |
|---|---|
| spells | ⭐ **8 real bugs** (2 plot, 6 cascade) — fixed in the shared helper |
| activated / equipment / triggers | ✅ clean |

Both sides are now guarded by `probe-classifier-runtime-parity.mjs`, so a future transform added to
`coverage.js` without a runtime counterpart shows up as a row instead of shipping silently.

**The audit programme's four shapes are now all swept** (things credited without a parse: lands ⭐3,
native-body ✅; a passing test as evidence: ⭐1; parse-credited but application-unverified: ⭐1 clone;
transform parity: ⭐8). **The systematic-audit vein is worked out** — further finds will come from specific
mechanics, not from another sweep of this kind.

## 🔧 SHIPPED — the shelf "ONE LINE AWAY" probe, + its first target (+3) (`e549e411`)

⭐ **THE PROBE IS THE BIGGER DELIVERABLE.** `probe-shelf-one-line-away.mjs` drops exactly ONE oracle line and
asks whether the card goes native. If yes, **that line IS the whole blocker** — a sized build target, not a
lead. **132 shelf cards qualify**, ranked by DECKS touched.

**Why it was needed:** `probe-shelf-blockers` ranks blocking SENTENCES by spread and kept surfacing rows
worth ~1 card — Teamwork ranked #1 (3 cards / 3 decks, worth one); the bite row ranked high and was worth
ZERO on the shelf. Both times the sentence was not the card's *only* blocker. **That is precisely the
question this probe asks instead**, and it is the shelf-gap list this run has needed all along.

⚠️ Its header carries the three ways a row still misleads: "one line" measures the CLASSIFIER not the effort
(Level Up tops the list and is a four-piece build); some rows are **deliberate refusals** (Hexing Squelcher's
life-cost ward); and proving the line is the blocker does not prove it can be modelled CREED-safely.
⭐ And the wrong-`MTG_APP_ROOT` trap that cost a run earlier is now a **guard** — pointed at the repo it
REFUSES rather than printing a convincing empty table.

### THE TOP OF THE LIST (for the next resume, cold)
| decks | card | blocker |
|---|---|---|
| 3 | Level Up | the granted compound — **banked**, needs the per-sentence anchor decision |
| 2 | Hexing Squelcher | ⛔ life-cost ward — **deliberate refusal, do not build** |
| 2 | Rhythm of the Wild | group grant of **riot** — riot is an ENTRY REPLACEMENT, not a static keyword, so it cannot join `GRANTABLE_STATIC_KEYWORDS`; multi-piece for 3 cards |
| 2 | Valley Floodcaller | multi-subtype batch pump on noncreature cast |
| 1 | Acidic Slime | ✅ **done below** |

## ✅ FIRST TARGET OFF IT — the three-way type union (+3)

Every TWO-way union existed; no three-way one did, so `destroy target artifact, enchantment, or land` parked
six corpus cards including **Acidic Slime** (staple, shelf card).

⛔ **Mapped as a straight OR of the three printed types, NOT to "permanent"** — the lazy mapping offers
creatures and planeswalkers the card cannot touch. M70 makes that substitution and the enumerator pin
catches it.

⚠️ **MY ENUMERATOR PIN PASSED VACUOUSLY AT FIRST.** A combo is `{targets:[…]}`, not a bare array, so my
extractor produced `[undefined]` and *"the creature is not offered"* was trivially true. **The hollow-gate
shape this whole run has been hunting, in my own test.** The fix is the non-empty assertion beside it —
a negative assertion needs a positive one next to it or it proves nothing.

## 🧭 WHERE THE SHELF STANDS

Six decks at/above 90% (Slivers 100, Vihaan 96, Omnath 93, Zaxara 92, Mothman 90, Earth Bent 90). cdh 81%
(capped ~82 — do not start). Next real target **Did you say Dragons? 77%**, needing ~13 cards across distinct
mechanics. Recent slices moved Zaxara 91→92, cdh 80→81, Kinnan 72→73.

**The cheap shelf work is genuinely done; the 132-row list is now the map for what remains.**

## NEXT ACTIONS

1. ✅ **DONE — Bloom Tender / Faeburrow Elder** (`003e29d1`). Shipped as the VIVID half of the mixed-bundle
   fix above; the read was right that it needed the color SET rather than the count, and wrong that it was
   contained — the shape it needed did not exist and 51 staples were broken for want of it.
2. **BANKED WITH A DESIGN QUESTION — `Tap N untapped creatures you control` as a cost** (39 corpus / 32
   parked; plus 40/28 for the singular). The SINGULAR is already fully modeled (γ1f, Earthcraft):
   parser → legalChoices expands one action per legal creature → dispatcher taps it. **The plural is NOT a
   simple generalization.** Enumerating N-combinations explodes legalChoices — 45 actions for two-of-ten,
   120 for three. The real choice is: enumerate combinations (correct, explosive) vs. auto-pick a
   deterministic set (legal, no explosion, silently removes player agency the singular case has). I did NOT
   guess at depth. Decide this one while sharp.
3. **Upkeep-only activation** (11) — still needs the offer window WIDENED, not narrowed. Riskier than
   anything above; take it EARLY in a run.
3b. ⭐ **THE VALIANT CLUSTER (12 cards, 0 native) — the cleanest next axis, named 2026-07-29.** All twelve
   print *"Whenever this creature becomes the target of a spell or ability **you control** for the first
   time each turn, …"* (Heartfire Hero, Veteran Guardmouse, Recruit Instructor, Brave Meadowguard, …), plus
   4 more on the untargeted `"a spell or ability"` form (Shimmering/Jetting Glasskite). The
   `becomesTarget` event EXISTS and now carries the once-per-turn latch — Angelic Cub proves the whole
   chain end to end on the **untargeted** form. **The only thing missing is the `you control` narrowing on
   the targeting spell's controller.** Do not widen it to any targeter: the whole point of Valiant is that
   an opponent's removal spell does NOT grow the creature.
4. Shelf grind: the leverage head (2+ decks), re-read 2026-07-28 after Bloom Tender closed:
   - ✅ **Bloom Tender ×3** — DONE (`003e29d1`).
   - ✅ **Chrome Mox ×3** — DONE (`7af34dc1`). The imprint STAMP is now shared infrastructure.
   - ✅ **High Score ×3** — VERIFIED at runtime (`405756b6`), no bug. Both halves hold: the +1/+1
     replacement really is N+1 (pinned at 3→4, since a DOUBLING bug reads 6 and passes a 1→2 test), and the
     end-step draw really is gated in both directions. ⭐ The probe that "proved" the gate first was a
     BROKEN HARNESS — wrong runEffectProgram signature, so nothing drew, which reads identically to
     fail-closed. A plain unconditional draw through the same harness also returned 0; that is what exposed
     it. **The control is now a test.** Third fixture-trap of this run, and the only one caught by a control
     rather than by luck.
   - **Wan Shi Tong ×3** — ETB X-counters + "half X rounded down" draw, plus an
     opponent-SEARCHES-their-library trigger the engine has no event for.
   - **Level Up ×3** — an Aura granting a quoted attack trigger that DOUBLES counters, then a
     power-threshold draw. Multi-piece.
   - **Mindbreak Trap ×3 / Teferi's Protection ×3** — alternate cost + "exile any number of target spells",
     and PHASING. Both are subsystems, not cards; neither is a grind item.
   then a long ×2 tail.

## A3 IS DONE — verified, not built

Went to wire Forge-as-a-Karn-function and found it already shipped end to end: `/api/collection/deck-overlap`
feeds Karn's system prompt the owned-in-deck count AND the in-color owned upgrade pool;
`/api/collection/ownership` is called by ChatPanel's KarnApplyBar to tag each suggested ADD with
owned/wishlist; the KARN_DELTA collection line is already in agents.js. **Do not rebuild it.** Only real
gap: `isBuildFromCollectionPrompt` is exported and unused — a cosmetic "build from collection" affordance,
not plumbing. Receipts posted to COMMS.

## WHAT THE SWEEP IS FOR — it found the run's best bug

Running `playability-sweep.mjs` at 150 games surfaced a real SOFT-LOCK (a tutor finding nothing wedged
~6% of human-path games) that no unit test could have caught, because every tutor fixture supplies
candidates. **Re-run it after any engine change to the decision path.** If it reports a catastrophe,
suspect the harness first — it has been wrong that way before.

## A POSTING BUG WORTH NOT REPEATING

COMMS entries live directly under the 4-line file header (line ~6). There is a legacy
`## LOG (newest first)` string ~670 lines down; anchoring a post on THAT buries the entry mid-file where
Omnath never reads it. Three of my entries went into that hole before Colton's screenshot of his idle loop
exposed it. **Post above the first `### ` header, and verify with `grep -n "^### " | head -3`.**

## PROBE LESSONS FROM THIS RUN — do not re-learn these

- **A probe that reports a big number is a claim about the PROBE** until each hit is explained. The
  shelf dead-card probe flagged 18; all 18 were board defects (ninjutsu casts from hand, "destroy target
  artifact" with no artifact on the board, Treasure-sacrificers with no Treasures).
- **The playability-sweep was scoring its own missing handlers as engine soft-locks** — it said 4/12
  games finish. With `unresolved` (the Arbiter escape hatch) and `soft-counter` handled: 24/24, zero
  wedges. Fixed. If it reports a catastrophe again, suspect the harness first.

## ✅ AURA GRANTS THAT NEVER APPLY — **ALL CLOSED** (`4096bfae` + `303858c5`). The probe reads ZERO.

**Reproducer:** `MTG_APP_ROOT=… node app/scripts/probe-dropped-attached-grants.mjs` — attaches each to a
2/2 and compares the host's LAYER-DERIVED P/T against the printed bonus.

| card | resolution |
|---|---|
| Dark Privilege #11269 · Serpent Skin · The Brute · Gaea's Embrace | ✅ **FIXED** — grants apply (3/3, 3/3, 3/2, 5/5); now `native-aura` (`4096bfae`) |
| Elephant Guide · Griffin Guide · Most Wanted · A-Most Wanted · Failed Conversion · Sleeper's Robe · Elder Mastery | ✅ **PARKED** — they did NOTHING; the composition crediting them was a false positive (`303858c5`) |

⚠️ **COVERAGE WENT DOWN, and that is the honest direction:** 35.9% → 35.8% (12,278 → 12,271). Those seven
were counted and delivered neither half. *A metric that only ever rises has stopped measuring.*

**⛔ THE COMPOSITION SLICE SHIPPED EARLIER IN THIS RUN WAS WRONG.** It credited ten Auras by verifying the
static half and the trigger half each through its own gate — "composed, not loosened". But each half is
verified on **text the composition invented**, and the runtime sees neither: `parseAuraBonus` drops the
static (an aura-own trigger line isn't on its skip list) and `checkDiesTriggers` never enqueues an
aura-own dies trigger (the Aura leaves with its host and is never scanned — measured, pendingTriggers 0).

⭐ **THREE of the ten survive, and the split is the reusable part:** Demonic Appetite, Mark of Fury and
Recumbent Bliss carry the AURA'S OWN upkeep/end-step trigger, which never references the enchanted
creature and so never poisons the bonus. **The dividing line is whether the trigger keys on the ENCHANTED
CREATURE.**

**To make the seven honestly native the ENGINE must change, not the metric** — `parseAuraBonus` must skip
a modeled aura-own host trigger, AND `checkDiesTriggers` must scan auras attached to a dying creature (an
LKI walk; the Aura is already gone by then). Neither is a slice.

**Root cause, diagnosed:** `parseAuraBonus` is all-or-nothing BY DESIGN — an Aura carrying a sibling the
bonus parser doesn't own (a regenerate activated line, an unmodeled own-trigger) drops the WHOLE bonus
to `[]`. Correct. But two crediting paths reason about a **transformed card the layer engine never sees**:
`nativeStaticGrantPlusActivated` (strips the extra activated lines, then asks `isNativeAura(stripped)`)
and `isNativeOwnTriggeredAura` (composes the halves, each checked in isolation). Each gate is right about
its own half; neither checks that the UNTRANSFORMED card still produces the grant.

**FIXED in `4096bfae`** — the aura-own-activated validator admits `regenerate`, and its caller's
pre-filter stopped demanding a MANA symbol before the colon (Dark Privilege's cost is "Sacrifice a
creature:", so its line was never even handed to the validator).

⚠️ **That widening re-opened a DIFFERENT FP** — letting ANY cost-bearing line be skipped meant a
SELF-SAC aura (Briar Shield, Thrull Retainer, Stamina, Carapace) kept its static half and went native.
Sacrificing the AURA detaches the host as a COST, before the ability resolves. Caught by two GUARD-LEAVE
pins that already existed; that rule now lives on both paths, not one.

⚠️ **AND I REPORTED THE OPPOSITE ONE TURN EARLIER** — that widening the validator "did NOT restore the
grant" — and reverted on that basis. I had checked only Gaea's Embrace, whose "+3/+3 AND HAS TRAMPLE"
union failed for a different reason; three of the four were already fixed by that change. **Re-test per
card. Never generalize a subsystem verdict from one sample.**

`auraOwnRegenerate.test.js` pinned all four at `native-activated` — written on the assumption the
composite delivers the bonus. Corrected, with the reason recorded in the test.

⭐ **THE STANDING RULE THIS LEAVES:** no static instrument can see this class — the tier says native, the
residue walk is satisfied, and a per-card tier diff shows nothing because nothing MOVES. **Anything that
emits a layer grant needs a RUNTIME assertion. The tier is not evidence about the board.**

## BLOCKED / REFUSED — do not restart these blind

- **ATTACHED UNBLOCKABLE** ("Equipped/Enchanted creature can't be blocked" — Whispersilk Cloak #329,
  Aqueous Form #735, Cloak of Mists, Protective Bubble). **BUILT, MEASURED CLEAN, AND REVERTED**
  (`055a47f2`) — do not re-attempt without closing the seam below first.
  - The `unblockable` pseudo-keyword and its enforcement ALREADY exist (canBlockAttacker reads it for
    Herald of Secret Streams); only the attach-side emission is missing. It looks like a one-line win.
  - Tier diff said **GAINED 4 · LOST 0 · RETIERED 0**. Suite green. Lint green. It was still wrong.
  - ⚠️ **Aqueous Form classified native-trigger while its grant did NOT apply** —
    `permanentHasKeyword(host, "unblockable")` was FALSE on a real board. `parseAuraBonus` returns `[]`
    for ANY aura with an own-trigger outside `isModeledAuraOwnTrigger` (scry-on-attack isn't in it), which
    is DELIBERATE. But a clause-level "modeled static" credit let the TRIGGER tier's residue check pass,
    so the card went native through a different door while the bonus was still being dropped.
  - ⭐ **THE SEAM IS PRE-EXISTING AND GENERAL: a clause-level static credit can contradict the CARD-level
    attached-bonus gate, and the tier diff CANNOT SEE IT.** GAINED/LOST/RETIERED all looked perfect. Only
    asking the runtime "is the keyword actually on the creature" exposed it. **For any change that emits
    a layer GRANT, add a runtime keyword/board assertion — the tier diff is necessary and not sufficient.**
  - Reconciling the trigger tier with the attached-bonus gate is its own wave. Three cards is not worth
    shipping a known FP to reach it early.
- **Foundry rail re-home** — REFUSED solo. Needs live browser QA with Colton available same-day. Do the
  MTGAssistant decomp first regardless; the re-home is not a solo-at-2am change.
- **Layer-2 control** (28 cards) — control is represented STRUCTURALLY here (the permanent moves between
  battlefield arrays; 628 sites read `.controller`). Needs move-and-revert that can never miss a path, or
  it becomes permanent control theft. Scoped in the triage ledger. Take it EARLY in a run, never late.
- **Learn keyword** — uncredited on an UNCERTAIN rule reading, deliberately. Do not credit it without
  checking the actual rule.

---

## COMPLETED TRAIL (newest first)

- `e549e411` — shelf one-line-away probe + three-way type union (+3). Slice 77.
- `f334d31b` — parity sweep extended to permanents; all clean. Slice 76.
- `7fbd341d` — classifier/runtime oracle parity: 8 native spells were Arbiter-routed. Slice 75.
- `368cb402` — clone with a cost-only keyword line never cloned (metric/runtime divergence). Slice 74.
- `c053e89b` — probe-dead-exports (self-controlled); 16 rows triaged benign. Slice 73.
- `45b23547` — native-body audit (clean) + a green test that never touched the shipped path. Slice 72.
- `aad5b36c` — painland cycle completed: 5 slow variants + 6 painless (FP). Slice 71.
- `9b6441c0` — source-scoped atom conditions + sequenced "Then if" (+3). Slice 70.
- `fb3bfa85` — SELF power threshold condition, layer-aware (+0; Level Up 3/4 pieces). Slice 69.
- `21c471a8` — enchanted counter referent + self doubling pronoun (+4); Level Up re-sized to 4 pieces. Slice 68.
- `b15cdecd` — painlands tap for colours + pay the life; 10 lands un-Wastes-ed (+0 tier, by nature). Slice 67.
- `9eba4b2e` — mana refusals per-ABILITY; 23 dead lands revived (+16). Slice 65.
- `a8279062` — NONCREATURE artifact/enchantment targets, layer-aware (+5). Slice 64.
- `977b72e9` — first-tap-each-of-your-turns + GRANTED becomes-tapped fire site (+1). **Earth Bent 90%.** Slice 63.
- `277f161b` — optional FIGHTER half of fight-pair; Earth Rumble (+1). Slice 62.
- `405756b6` — High Score pinned at runtime; verified, no bug (+0, x3 slots confirmed). Slice 61.
- `7af34dc1` — IMPRINT piece 2: Chrome Mox's mana gated on the stamp (+1). Slice 60.
- `5d24a81d` — IMPRINT piece 1: the stamp + its fire site; the CR-207.2c ability word (+0, by design). Slice 59.
- `003e29d1` — mixed mana bundles one-of-each: a live runtime FP on 51 staples, + Vivid (+2). Slice 58.
- `e0d15930` — Amulet of Vigor: permanent-wide enters-tapped trigger + the missing land fire site (+1). Slice 57.
- `d7148fa3` — v0.149.5: graveyard-ability composition (+14). Slice 56.
- v0.149.4 — devour/amplify, fuse unpark, aftermath unpark (+22). Slices 53–55.
- v0.149.3 — assist/casualty/provoke/ripple, training (+23). Slices 51–52.
- v0.149.2 — play-lands-from-graveyard, enters-tapped type set, dethrone, squad, the optional-mode
  family (+36), enlist/extort, unleash. Slices 44–50.
- v0.149.1 — firebending + end-of-combat held mana, split second, self-power block gate. Slices 41–43.
