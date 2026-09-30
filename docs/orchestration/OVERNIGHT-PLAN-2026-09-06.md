# OVERNIGHT PLAN — 2026-09-06 (the fresh handoff Colton asked for; a NEW seat boots from THIS file)

> **RESUMED 2026-09-29 — verified by the booting seat (read this before the 09-06 text below).** Everything the
> "Banked state" paragraph calls held was pushed 2026-09-05: origin/master = **5df810d2**, nothing held. Re-measured at
> 5df810d2: suite **1585 files / 16,429 tests** green (1 skipped) · lint 0 · corpus **14,772 / 34,245 (43.1%)** · 30
> decks, 88% aggregate, 13 at ≥90, Atraxa 74 the floor. The repo is PUBLIC and stays public; CI executes again (PR
> #466's run green 2026-09-30T00:37Z). Stage ① is MET; **stage ② is next**. The "09-06" stamps in this file are
> mislabelled — by git the bank commit (e134b616) is 2026-09-05 18:43Z. No cron runs this plan any more.

> **THE ORDER (Colton, 2026-09-06 ~05:00Z, verbatim intent):** "after current work safe pause and bank everything then
> create a new hand off so the next cindy grind command can start fresh and keep working."
>
> **A fresh seat boots from THIS file.** Read it, find the first stage whose DONE line is not met, take its first
> unfinished item, and work it through §5 in full. Do not re-plan. Do not wait for Colton — anything that needs him
> gets WRITTEN DOWN under §6 and you move to the next item. The 2026-09-02 plan is CLOSED (every stage met); its §5
> discipline and §6 parks are carried here by reference.

**Banked state (measured 2026-09-06 ~05:00Z):** suite **1584 files / 16,426 tests** green · lint 0 · corpus **14,767 /
34,245 (43.1%)** · shelf: **13 decks ≥90 · 14 at 85–89 · 3 ceilings** (Atraxa 74 · Halfshell 84 · Light-Paws 82) · **111
commits held on `claude/cindy-grind-1482df`** since 78ca923d, none pushed — CI is billing-blocked (repo PRIVATE; runs die in
6–7 s with zero steps). The worktree is CLEAN at this handoff.

**Read next, in this order:** `docs/orchestration/WAKE-REPORT.md` (the live anchor — its top block is this handoff) ·
`docs/orchestration/RUN-LEDGER.md` (every slice, newest first — read its first ~150 lines only; the file is ~39k lines) · `docs/orchestration/RESIDUE-GRIND-RUNBOOK.md`
(the census method) · `docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md` (Phase 4 step 3's status ledger).

---

## §0 STANDING LAW (unchanged — the 09-02 plan's §5, restated in one screen)

Every slice: **probe the real oracle → the smallest honest arm → the RUNTIME half before the classifier → flip-diff by tier
snapshot (`scripts/tier-snapshot.mjs --out=… ; --diff=before,after` — ZERO LOST; every gain audited whole-card, and audit the
RUNTIME of an unplanned gain, not just its tier: the domain slice's Aura classified native while the layer engine read no bonus
— the flip-diff's runtime probe caught it) → a witness file (`WITNESS` console rows; `--disable-console-intercept`) → mutants
SEEN to fail (assert the match applied; a survivor is documented, deleted, or gets its missing test — never ignored) → lint +
the FULL suite (gate on the fail count, never on grep's exit) → RUN-LEDGER + CHANGELOG + WAKE-REPORT (+ the shelf runbook /
quartet ledger when they apply) → measure the deck → commit by explicit path → push to master → check the run (CI posture below).**

The nine traps are law: no regex escapes through scripted rewrites (Edit, never a bash heredoc — `grep -c $'\b'` must be 0);
encode-before-write / temp-then-rename; never edit app-tree source while a suite runs (hold new witnesses as `.hold` in the
scratchpad and `mv` them in after); one gate run at a time (never mutants beside a snapshot or a suite); deck writes only via the
app API; stamp the real date; THE CREED — false-negative SAFE, false-positive FORBIDDEN; a park = a §6 entry + a terse COMMS line
anchored on the exact `## LOG (newest first)` line + `node C:/Projects/omnath-vault/omnath-tools/sync-brain.cjs`.

**CI posture (Colton's standing rule, REVISED 2026-09-29):** the repo is PUBLIC and STAYS public — never set it private,
never add collaborators. Push each slice to master as soon as its full local gates pass (`git push origin HEAD:master` after
`git merge --ff-only origin/master`), then CHECK THAT RUN (`gh run list --branch master --limit 3`; a run's job `steps`
length, not the run-level conclusion — a billing-refused job reports zero steps). If a run dies in seconds with the
billing annotation ("recent account payments have failed…"), report it in one line and keep going. The 09-05 "hold pushes;
push the whole stack on the first green run" posture is RETIRED.

---

## §1 STAGE ① — the QUARTET's Phase 4 step 3, last class: COLOUR WORDS in a spend restriction

**Carriers:** Shrine of the Forsaken Gods ("{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if
you control seven or more lands.") · Eldrazi Temple ("{T}: Add {C}{C}. Spend this mana only to cast colorless Eldrazi spells or
activate abilities of colorless Eldrazi."). Sized **M**: a colour predicate on BOTH purposes.

**Build (the shape the four shipped classes established — read their ledger entries first):**
1. `parseSpendRestriction` (manaModel.js): the cast phrase admits a leading `colorless` → the restriction records
   `castColorless: true` beside the type words (Eldrazi Temple: types [eldrazi] + colorless); the ability tail form
   "activate abilities of colorless Eldrazi" (no "source(s)") → abilityOf [eldrazi] + `abilityColorless: true`.
2. `spendRestrictionAllows`: casts — `colorsOf(castCard).length === 0` when castColorless; activations — the sites already pass
   `activatingTypeLine`; add `activatingColors` (the source's colours, layer-aware via `permanentColors`) at the same eight sites
   (seven in legalChoices, one in the dispatcher — the RG-Q4b edit shows exactly where) and the planner's two forwarding sites.
3. `EXTRA_MANA_LINE_RE`: admit `colorless` in the cast phrase and the "Activate only if you control N or more lands" tail after
   the restriction sentence (Shrine) — check the alternative order; the activation condition must ride the existing
   `activationCondition` field, not be dropped.
4. Witness end to end: Shrine's record pays a colourless artifact spell, refuses a red one; Eldrazi Temple's record pays a
   colourless Eldrazi's ability and refuses a red Eldrazi's (a coloured Eldrazi exists — Eldrazi Displacer is colourless; use a
   made-up red Eldrazi as the negative) and a colourless non-Eldrazi's.

**DONE ①:** both carriers `land`, witnessed as above, mutants killed, the quartet ledger updated — Phase 4 step 3 CLOSES. ✅ **MET 2026-09-06** (+5; mutants 5/5 killed).

---

## §2 STAGE ② — the two scoped residue rows with existing machinery (scoped in the WAKE-REPORT's census blocks, commit 8e2d9598)

1. **The tap-a-creature alternative cost** — "If you control a Plains, you may tap an untapped creature you control rather than
   pay this spell's mana cost." (Ramosian Rally, Angelic Favor — 3 sole). The alt lane's condition parser already reads "you
   control a Plains" (`parseAltCostCondition` → `controlLand:Plains`). Build: a matcher-table entry with kind `tapCreature`;
   `enumerateAltPayments` → one payment per untapped creature you control (`{ tapCreatureId, tapCreatureName }`; a summoning-sick
   creature IS legal — CR 302.6 restricts only its own {T} abilities); the dispatcher's altCost branch taps it; add the kind to
   `OFFERED_ALT_COST_KINDS` and `SUPPORTED_ALT_COST_KINDS`; `altCastName`. Angelic Favor also prints "Cast this spell only
   during combat" — check `castTimingAllows` handles it or leave Favor parked on that line. Sized **M-small**.
2. **The party-count cost reducer** — "This spell costs {1} less to cast for each creature in your party" (Shatterskull
   Minotaur, Journey to Oblivion — 3 sole + 5 co). Needs a `party` count kind (up to one each of Cleric / Rogue / Warrior /
   Wizard among creatures you control — CR 700.8): add it as ONE helper beside `layers.domainCount` and route BOTH count
   evaluators through it (the domain slice's lesson). Sized **S/M**.

**DONE ②:** each carrier witnessed end to end; flip-diffs audited whole-card.

---

## §3 STAGE ③ — the residue loop (RESIDUE-GRIND-RUNBOOK §2–§7)

Re-run the census (`MTG_APP_ROOT=… node scripts/build-residue-census.mjs --out=<scratch>/residue-census.json --top=40`, ~100 s).
The top of the 2026-09-06 04:20Z census is ALL banked or sub-game / CHOICE machinery — do not re-scope these: initiative ·
double team · attractions · specialize · poison tolerance · stickers · pilot tokens · ward—discard · increment · unspecialize ·
the Ring · the Clockwork end-of-combat counter removal (the delayed-trigger lane) · contraptions · buyback (ALL forms — a real
build: an optional additional cost + a resolution finalizer handing the card back; the mana form is deliberately NOT stripped) ·
"sacrifice it unless {C} was spent to cast it" (a payment stamp onto the entering permanent) · planechase · incubate · Loxodon
Smiter's discard replacement · "the color of your choice" / "the basic land type of your choice" / "tap or untap" (choices →
the choice-eval subsystem) · manifest dread · exert. Take the first ≥3-sole row BELOW them with existing machinery; six
scoped-not-shipped in a row → the vein is dry → §4.

**DONE ③:** the census's top-40 has no un-scoped row with existing machinery (record the verdicts in the run ledger).

---

## §4 STAGE ④ — when the residue vein is dry: the QUARTET's open phases (Colton's ordered subsystems)

`docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md`: Phase 1 is built + gated (the flag flip awaits a policy that earns it — the
08-15 A/B lost 21–26); Phase 2's decision log has its spine and one diagnostic verdict; Phase 3 is complete; Phase 4 closes with
§1 above. The next open work there is **Phase 2 — the decision log**, whose read on the 64 divergent A/B games is what the
Phase 1 tuner needs. Boot from that plan's own build list; interleave card-slices when a shelf deck's residue is dominated by a
class it unparks. Alternatively the SHELF-85 hand-off's L rows are all still Omnath's for nuance notes — Cindy does not
re-open them without a new order.

---

## §5 THE PER-SLICE DISCIPLINE
As §0. The scratchpad scripts of the last run (`docs-*.py`, `mutate-*.py`, `probe-*.mjs`, `dump-decks.mjs`,
`probe-halfshell-lines.mjs`) live in the session scratchpad and are disposable — a fresh seat rewrites its own; the pattern is
in every RUN-LEDGER entry (witness → mutants → suite → docs → commit).

## §6 PARKED / NEEDS COLTON (carried from the 09-02 plan's §6 — read that section; nothing here is new)
- ~~**CI BLOCKED (billing; repo PRIVATE)**~~ — RESOLVED 2026-09-29: the stack was pushed 2026-09-05 (head 5df810d2); the
  repo is PUBLIC and stays public; a PR run executed real steps again at 2026-09-30T00:28Z. See the §0 CI posture.
- **Theft veto (standing):** Bringer of the Red Dawn, Oko's −5, Gilded Drake, Eriette's Tempting Apple and every gain-control
  effect stay parked on purpose — never trained.
- **Omnath's queue:** the SHELF-85 hand-off ([Q-SHELF-85-OMNATH] + [Q-SHELF-85-OMNATH-A]) is posted; the ✍ notes are Omnath's.

## §7 WHAT THE MORNING REPORT MUST CONTAIN
The WAKE-REPORT's top block (this handoff), the shelf table at its end state, the slice count and corpus number, the CI
posture, and the COMMS tags posted. All of it is already written for the 2026-09-06 05:00Z state; the next seat only appends.
