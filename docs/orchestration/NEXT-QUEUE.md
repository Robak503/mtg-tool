# NEXT QUEUE — the successor to roadmap v2

> **Why this file exists.** Roadmap v2's six waves are effectively cleared (2, 3-item-8, 4 and most of 5
> landed 2026-07-27/28). Colton's standing order is a 5-hour minimum run, 8-hour stretch, no check-ins —
> and the thing that would end that run early is not stamina, it is **running out of queue**. This is the
> queue. It is sequenced so the risky work happens while sharp and the mechanical work is available late.
>
> Read with [RUN-LEDGER.md](RUN-LEDGER.md) (what is in flight right now) and the triage ledger (banked
> engine findings with their traps named).

## THE SEQUENCING LAW FOR A LONG RUN

Judgment degrades before mechanics do. So:

1. **Risky / novel / subsystem work goes EARLY**, while the run is fresh. Layer-2 control is the standing
   example — it can produce permanent control theft if the revert misses a path.
2. **Mechanical, testable work goes LATE.** A decomp or a card-by-card grind is still safe at hour seven.
3. **Anything needing Colton's eyes is REFUSED, not deferred quietly** — say so and move on.
4. Every item below states its SIZE and its FAILURE MODE, so a tired seat can judge whether to start it.

---

## A — UNBLOCKED NOW (do these first, in this order)

### A0b. ✅ **SHIPPED 2026-08-02 — +5, not 3** ("that player" bound to the preceding atom's subject)
Assembly-loop rebind (parser.js): bounce→OWNER (`playerFrom:"owner"`, the enumerated target now
records `owner`), counter→spell's CONTROLLER, damage→the targeted player. All four cards flipped
PLUS **Dinrova Horror** (the same payload on an ETB trigger — assembly-level fixes fan out wider
than the clause-level census count predicts). **Compelling Deterrence shipped too**: the trap note
below said its condition "is dropped from the atom list" — that was STALE; the conditional-rider
slice now carries it as `condition` and the runtime gates on it (both branches runtime-proven).
⭐ Queue-hygiene lesson: a banked trap is a snapshot — re-verify its load-bearing claim with one
parse probe before building around it. Tests: `thatPlayerReferent.test.js` (19). Original entry
below kept for the trap history.

### A0b-history. ⚠️ TRAP BANKED — "that player" on a SPELL is mis-bound to `damagedPlayer` · 4 cards · READ BEFORE BUILDING
Found 2026-08-01 by asking "which spells parse HIGH but still classify non-native?" — a probe for
over-refusals. Exactly four: **Recoil · Ozai's Cruelty · Compelling Deterrence · Frightful Delusion**.
All four end in a `discard` atom carrying `who: "damagedPlayer"`.

**They are correctly refused today**, by the `who === "damagedPlayer"` guards in coverage.js: that referent is
stamped ONLY by combat-damage triggers (`ctx.damagedPlayerId`, set by checkCombatDamageTriggers), never by a
spell, so the atom could not bind at resolution.

⛔ **THE TRAP: the obvious "fix" is to thread a spell-side damagedPlayer referent, and that would create a
REAL false positive.** The binding is wrong on three of the four — "that player" does not mean the damaged
player there:
> · **Recoil** — "Return target permanent to its owner's hand. Then THAT PLAYER discards a card." → the
>   bounced permanent's OWNER. No damage is dealt at all.
> · **Compelling Deterrence** — same bounce-owner referent, AND its condition ("…discards a card **if you
>   control a Zombie**") is DROPPED from the atom list entirely. Crediting it would discard unconditionally.
> · **Frightful Delusion** — "Counter target spell unless its controller pays {1}. THAT PLAYER discards…" →
>   the countered spell's CONTROLLER.
> · **Ozai's Cruelty** — "deals 2 damage to target player. That player discards two cards." → the only one
>   where damagedPlayer is genuinely the right referent.

So the honest build is: bind "that player" to the PRECEDING ATOM'S subject (bounce → owner, counter →
spell's controller, damage → damaged player), then thread it at spell resolution — and leave Compelling
Deterrence parked until its intervening condition is modeled too. **Yield ~3 cards for a referent-binding
slice; the gate that looks like the blocker is actually the thing keeping this correct.**

### A0. ✅ **FIXED 2026-08-02, SHIPPED in v0.150.1** — the hypothesis was RIGHT
The bundled Node v22.12.0's TLS ClientHello is what Cloudflare 403'd: a byte-identical `node:https`
request through the bundled binary → 403 challenge page; through v22.23.x → 200. Same machine, same
headers, same TLS 1.3 cipher. Fix: portable-Node pin → v22.23.2 (current LTS); the ship artifact
itself probed 200. Archidekt probed through both binaries — never affected. The error-message defect
is fixed too (status-honest hints, mutation-checked). The install dir is `%LOCALAPPDATA%\MTG Tool`
(the space is why the 08-01 search missed it). Reusable measurement: `scripts/probe-deck-fetch.mjs`.
Original entry kept below for the investigation record.

### A0-history. 🐞 MOXFIELD IMPORT IS BROKEN IN THE PACKAGED APP · size UNKNOWN until the cause is confirmed · USER-FACING
Found 2026-08-01 while importing four test decks Colton supplied. **Every Moxfield URL 403s through
`/api/decks/import-url` in the running .exe.** Archidekt untested.

**PROVEN (each measured, not inferred):**
- 4 URLs failed, plus a single retry minutes later — not a rate-limit burst.
- The links are PUBLIC and fine: the same deck ids fetch 200 by curl.
- **NOT the User-Agent.** The app's actual UA string returns **200** by curl and by a plain `node:https`
  request with byte-identical headers. (I wrongly blamed the UA first — my grep captured an empty string
  from a multi-line `const`, so the "app UA" probe was really an empty-UA probe. Read the constant.)
- **NOT stale code.** `git diff v0.149.23 HEAD -- app/src/lib/server/deckUrlFetch.js` is EMPTY; the
  installed build has the same fetch path as master, including the documented `node:https` Cloudflare
  workaround that has been there since the feature shipped (3cd62776, 2026-05-30).
- So: the packaged server gets 403 at the same moment a plain Node process on the same machine, with the
  same headers, gets 200.

**HYPOTHESIS, NOT PROVEN — do not write this into a fix without testing it:** the BUNDLED Node
(`resources/node/node.exe`) presents a different TLS fingerprint than the system Node, and Cloudflare
blocks it. I could not locate the bundled binary to test it (install path not found under Program Files or
AppData\Local\Programs). **First step for whoever takes this: find the bundled node and run the same
`node:https` request through it.** That single test confirms or kills the theory.

**SECOND DEFECT, INDEPENDENT OF THE CAUSE:** the error message reads "Check the link is public." The links
WERE public. That sentence sent this investigation down the wrong path first and would do the same to a
user. A fetch failure should not assert a cause it has not established.

**Workaround used meanwhile (not a fix):** fetch the deck JSON outside the app, then run it through the
app's OWN `normalizeMoxfieldDeck` + the import route's OWN `resolveCard`, and commit via `POST /api/decks`.
Only the network hop is swapped, so the stored deck shape is exactly what the importer would have written.
Script: `scratchpad/import-test-decks.mjs`.

### A1. ✅ **SHIPPED 2026-08-02** — Tibalt gremlin mode, wired end to end
The policy module (`lib/tibaltGremlin.js`) already existed with tests and ZERO consumers — this was
a wiring job: per-profile `gremlin.json` store (session cap resets via a boot marker) · keyed
findings in `powerRanker.landAssessment` (issues now DERIVED from them — can't drift) ·
`/api/tibalt/interject` (GET/PUT toggle · POST policy+model · PATCH reaction) · emits at
useDeckStore's save/import sites (card-LIST changes only — a game note is not deck work) · the
red bubble (ley-rise one-shot, registry tokens, art-crop avatar, pulse-ban test) · Settings→Models
toggle. **Live-fired end to end**: real deck → `lands-low` finding → policy → real Ollama → jab →
fire recorded. Both standing-law failure modes are pinned by test: default OFF (guests never
jabbed), and Omnath's mutation check (no finding → NO bubble; empty model answer → no bubble AND
no suppression burned). Reaction ledger lives in `gremlin.json` `log[]` — Omnath's to consume.
Not built: `bench.statCrossedThreshold` (no producer exists; the event allowlist keeps the slot).

### A2. `MTGAssistant.jsx` decomp · ~2h · **RISK RE-RATED UPWARD — the safety net does not exist**

⚠️ **Checked 2026-07-28 before starting, and the estimate was wrong.** The CollectionView precedent
(`2d726b0a`) was only safe because it fingerprinted ALREADY-EXPORTED sub-components and snapshotted their
markup before moving them. MTGAssistant has **no sub-components at all** — it is one 1,704-line function
with everything inline — so there is nothing to fingerprint until after the risky step.

The obvious fallback, snapshotting the whole component before and after, **does not work either**: it
touches `window` at render time and dies under `renderToStaticMarkup` with `ReferenceError: window is not
defined`. The project bans jsdom/RTL, so there is no cheap harness.

**What that means:** a 1,700-line refactor with no render net and no live QA is the same shape as C1, and
it should be treated the same way. Do NOT do the full decomp solo at hour seven.

**The safe subset, if you want progress here:** the three BANNERS (app-update, first-launch import, Ollama
health — roughly lines 1091–1351) are purely presentational, touch no `area` state, and take explicit
props. Extract those into their own module AS PURE COMPONENTS, and fingerprint the extracted components
directly — they do not touch `window`. That shrinks the god-component ~260 lines with a real net over the
moved code. The residual risk is only the call-site wiring, which the full suite and lint do cover.

**Original note, still true:** 11 hardcoded `setArea("agents")` sites; leave the `area` state machine
alone — re-homing and decomposing in one step is how you get an unreviewable diff.

**Failure mode:** a nav regression nobody notices until a room stops opening.

### A3. Forge wiring — ownership into the bench context · ~1h · low risk
Scoped in the triage ledger. `/api/collection/ownership` is built and has **zero consumers**; the
COLLECTION SUMMARY Karn already gets is aggregate-only (no per-card status, no `inDecks`).
**The decision that must come first, and it is mine to make with a stated assumption:** ownership of WHICH
names? The locked deck's cards are known up front (context injection); Karn's SUGGESTED cards are not
known until he answers (post-hoc UI enrichment). **Assumption to build on: do the deck's cards now** — it
is the half that is a clean context injection, it answers "what have I already committed elsewhere", and
it does not block the other half later.

---

## B — THE ENGINE BACKLOG (each is a real slice; sizes measured, traps named)

### B1. Layer-2 control — ✅ **RUNTIME SHIPPED (`0c19d9c0`)** · classifier credit still open

**The runtime half is done and proven**: attach moves control, and the host goes home by every route the
Aura can leave (graveyard / exile / hand / library), hung off the single verified battlefield-exit
chokepoint. 14 tests, 3 mutations killed, suite green. The queue's stated unknown ("requires a single
chokepoint") turned out to already exist, with the soulbond teardown in that same function as a precedent.

### B1b. CREDIT the control Auras — ✅ **SHIPPED, +7 · B1 CLOSED**
**GAINED 0 so far, by design.** The sim now plays these cards correctly, but `classifyCard` still returns
body-only for Mind Control / Control Magic / Treachery / Corrupted Conscience. Crediting is where the
false-positive risk lives — claiming native for a card whose runtime has a hole — so it was split out to
start from a verified base.
**Before crediting:** re-run `controlAura.test.js`, then take a tier diff and NAME-AUDIT every GAINED row
(several of the 27 carry riders — an ETB, an untap clause, a "can't be regenerated" — that must still park).
⚠️ Also open, from the same slice: the control MOVE is duplicated between `controlAura.js` and
`effects/atoms/control.js`'s `applyGainControl`. Deliberate (not destabilising a proven atom mid-build), but
two copies of a mechanism drift. Unify when B1b lands, with both test files as the net.

### B1-original. Layer-2 control · 28 cards · original entry:

> ⭐ **RECON DONE 2026-07-29 — the spec's load-bearing prerequisite is ALREADY SATISFIED, verified by
> measurement rather than by reading the code.** The entry below says *"Requires a single chokepoint for
> 'Aura left the battlefield'"*. **That chokepoint exists, is genuinely single, and fires on every route:**
>
> `gameState.detachPermanentFromAll` has **exactly one call site** (the battlefield-exit path in
> `moveCardToZone`). Probed by removing an attached Aura to each zone and reading the host back:
> ```
> AURA -> graveyard | host.attachments = []      AURA -> hand    | host.attachments = []
> AURA -> exile     | host.attachments = []      AURA -> library | host.attachments = []
> HOST -> graveyard | aura falls off (CR 704.5n) ✓
> ```
> **And the exact shape B1 needs already has a working precedent sitting in that function:** the SOULBOND
> teardown clears a partner's back-reference on exit, for the same reason and at the same point.
>
> So B1 is not "build a chokepoint, then 28 cards" — it is **"add a control-revert beside an existing
> teardown at a proven single point."** Still high risk (628 sites read `.controller`, and the failure mode
> is silent permanent control theft that a green suite cannot see), but the scary unknown is closed.
> ⚠️ NOT verified: that the revert itself is correct — that IS the build. And note the routes above all run
> through `moveCardToZone`; a control change made anywhere that does NOT go through it would bypass this.

### B1. Layer-2 control · 28 cards · original entry:
"You control enchanted creature" (7 sole + 21 co). Control is represented STRUCTURALLY here: the permanent
MOVES between battlefield arrays, and 628 sites read `.controller`. So this is a move-and-revert, not a
layer. **Failure mode: permanent control theft** — if the revert misses any path by which the Aura leaves,
the creature never goes home. Requires a single chokepoint for "Aura left the battlefield" and a test that
kills the Aura by every route (destroy, bounce, exile, sacrifice, its host dying).

### B2. Phantom damage prevention with counter cost · 6 sole · **HIGH RISK**
"If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter." **Failure mode:
an INVULNERABLE CREATURE** if the prevention lands but the decrement does not. The decrement is the whole
slice; the prevention is the easy half.

### B3. Shuffle-into-library instead of graveyard · 5 sole · medium
Darksteel Colossus / Progenitus. Needs a hook at `moveCardToZone` — the chokepoint every zone change runs
through, so a mistake here is broad. Read the existing replacement-effect registry first.

### B4. Sunburst · 6 sole · medium
Requires tracking WHICH COLORS were spent to cast. The mana system has no such record today; that is the
real work, not the counter placement.

### B5. Mistform type-change · 5 sole · low-medium — ✅ **SHIPPED (`d1e34e10`), exactly +5**
"{1}: This creature becomes the creature type of your choice until end of turn." The size estimate was
right on the nose. Two things the scoping note did not anticipate, both recorded in `becomeCreatureType.test.js`:
- **"Becomes" REPLACES.** A new layer-4 `setCreatureSubtypes` op carrying the printed subtypes it supersedes
  (snapshotted at resolution, CR 613.1d). Mistform Sliver's "in addition to its other types" is a DIFFERENT
  effect and still parks.
- **The auto-pick had to MOVE, not be mirrored.** `autoPickCreatureType` now lives in `choicePolicy.js`, a
  zero-import leaf — the only shape shareable across the runProgram cycle. A duplicated formatter is
  harmless; a duplicated POLICY forks the sim's behaviour silently. And the activated caller must pass
  `excludePermanentId`: the source is on the battlefield, so it tallied its own type and replaced Illusion
  with Illusion — a legal activation that did nothing. Only the empty-board assertion caught it.

### B7. ~~Quoted mana grant to an ATTACHED permanent~~ ⛔ **RETRACTED — it already works**
**I queued this on a broken probe. The attached mana grant is BUILT** (`auraManaGrant.test.js`, Multani's
Harmony + Settlement + Sheltered Aerie, all `native-mana-aura`). My "positive control" wired the Aura's
`attachedTo` but not the host's `attachments` back-link, so the grant could not resolve and I read 0/0 as
"unbuilt". Re-measured with the two-way link the existing test uses:
```
blank land host  → WITH aura 1 source · WITHOUT 0    ← the grant DELIVERS
Forest host      → WITH aura 1 source · WITHOUT 1    ← DEDUPED onto the existing producer
```
⚠️ Two traps fed this: the test file's own docstring still said "the LAND-host form stays non-native this
slice" while the tests below it asserted the opposite (corrected in place), and rule 1b protects against a
harness that cannot produce a positive — **not against one that is simply mis-wired**. A positive control
proves the harness CAN show the effect; it does not prove the harness is correct.

### B7b. SUPPLEMENT an existing mana producer · ~4-6 cards · medium (mana model)
The real remaining gap, and it is narrower: `manaSources` ADDS a granted source where there was none but
cannot SUPPLEMENT one that exists. A Forest under Discreet Retreat should offer both its `{G}` and the
granted any-colour; today it offers one.
⭐ **The premise moved recently:** while every land was credited a phantom `{C}` (removed in `ac5c6595`),
EVERY land host was the deduped case. Removing that fallback is what made blank-land hosts start working
and shrank this item to hosts with real mana abilities.

### B6. The GY-1 cost vocabulary tail · ~7 · low
Three carriers are blocked by unsafe timing riders — leave those. The rest are cost-shape additions to a
lane that already works.

---

## C — REFUSED / NEEDS COLTON (do not start these solo)

### C1. Foundry rail re-home (roadmap wave 3 item 10)
Stateful navigation across the app's most central, least-decomposed file, with 11 hardcoded call sites.
A previous session of mine wrote: *"fresh session, live browser QA, ideally with Colton able to eyeball it
same-day — not a 1am solo pass."* That judgment stands.

**Note the knock-on:** A2 was the prerequisite for this, and A2 has now been re-rated as needing the same
treatment. So C1 is not merely waiting on a refactor — the whole MTGAssistant surface wants Colton awake
before it is touched. Both are gated on the same thing, and neither is a solo job.

### C2. Anything touching secrets, repo visibility, or the signing keys
Standing rule, no exceptions.

---

## D — THE STANDING WORK (never runs out; use it to fill any gap)

### D1. Shelf grind, card by card
The 1.0 bar is shelf ≥90% per deck. **Measure with the REAL profile dir**, not the dev tree:
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```
Genuinely long-tail now — 129 distinct blocking shapes across 362 unmodeled slots, biggest cluster 3. So
it is card-by-card, and Colton has explicitly said that rate is acceptable.

### D2. DEAD-CARD hunting — higher value than coverage, and invisible to the corpus number
⭐ **PAID TWICE ON 2026-07-29** — and the second one names a whole blind spot: **`tier: "land"` is assigned
to every land regardless of what it does**, so the metric can never see a dead land. Audit that works:
*top-3000 lands with no mana production AND an activated ability yielding zero legal actions* → 5 dead,
one of them (Fabled Passage #50) in three shelf decks. Re-run it after any land-side change.
**And the chain that found it:** phantom mana → "fine, but do these lands do their REAL job?". After
removing something an object was doing WRONGLY, ask what it should have been doing INSTEAD.
The Mana Vault find (three premium ramp cards offered NO ability at all) was worth more than any coverage
point, and the coverage metric could not see it. The productive method is NOT a broad "offers nothing"
probe — that flagged 18 cards and all 18 were board defects. The method that worked: take the shelf's
blocking-shape list, and for each shape ask whether the RUNTIME agrees with the CLASSIFIER.

### D3. Playability sweep at scale — ⭐ **RAN IT, AND IT PAID (2026-07-29)**
150 games: **150/150 complete, zero wedges** — but only after the one it caught. 60 games surfaced a
`dispatch-error` that turned out to be a whole CLASS: 34 instants/sorceries whose additional cost was never
enumerated because legalChoices gated cost-reading on `isHigh` while the dispatcher enforces costs
unconditionally (`b903119f`). **A cost is not an effect.** The full suite was green before, during, and
after — this is only findable by playing games.
**The sweep is now debuggable:** `--only=N` replays a single game, throws name the ACTION rather than the
decision kind, and `--only` dumps the wedging decision. Use those before writing a repro by hand.

### D3. Playability sweep at scale
Now that the harness is honest (it was scoring its own missing handlers as engine soft-locks), run it
wide — hundreds of games — and mine any genuine wedge. Each wedge is a real soft-lock and the 1.0 bar is
zero of them.
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/playability-sweep.mjs 200 beginner commander
```

### D6. ⭐⭐ BOUND THE PHASES-PER-TURN (turn termination ≠ game completion) · ~1h · low risk
⚠️ **REWRITTEN 2026-07-29 — the first version of this item said "teach the sweep to attack" and was wrong.
The sweep already attacks** (measured: 117 `declare-attacker` picks in 12 games). The real gap is subtler
and more interesting.

**Aurelia with her once-per-turn latch removed grants 40+ extra combats in a single turn and the turn NEVER
ENDS** — driven directly, the 200-step guard exhausts at `combat/declare-attackers`. Yet the sweep reports
12/12 complete with her forced 20× into every deck, because **a non-terminating turn that kills the opponent
looks exactly like a completed game.** Lethal arrives long before any step cap.

**Build:** a per-turn phase counter with a hard bound (a real turn never needs more than a handful of
combats), reported as its own wedge class distinct from `step-cap`. Game completion and turn termination are
different properties; the sweep only measures the first.
**Failure mode:** a bound tight enough to false-positive on legitimate multi-combat cards (Aggravated
Assault chains are real Magic). Report the count, do not just assert a limit.

### D5. ⭐ TRIGGER-TIER PARITY PROBE — ✅ **BUILT (`7013f236`)**, 324 measurable / 0 divergent
`probe-classifier-runtime-parity` covers native-spell / activated / equipment and **skips native-trigger**,
the largest tier and the one where both of this run's engine bugs lived. `triggerRoutesNatively` is a
hand-written MIRROR of `buildTriggerStack`'s α1 allowlist (its own comment says so) — and this run hit five
mirror/whitelist divergences, so drift here is likely rather than hypothetical. Build: drive each
native-trigger descriptor through `buildTriggerStack` on a synthetic board and diff the verdict against the
classifier's.
The named failure mode (calling `triggerRoutesNatively` inside it) was avoided — it drives the public
`flushTriggers` instead. **A DIFFERENT one bit anyway:** the first draft reported 6 divergences, all ghosts,
because the runtime folds five different outcomes into one byte-identical `resolver:"manual"` return. It now
measures only the subset where that return can only mean a routing refusal (targetless + no intervening-if),
and reports the rest as `notSoundlyMeasurable`. Coverage witness: forcing the classifier to over-claim makes
it report 68; restored, 0.

### D4. Census re-run when a vein feels dry
`node app/scripts/build-residue-census.mjs` — 52s, and it re-ranks everything. The keyword vein is mined
out; do not re-mine it on a hunch.

---

## THE STANDING DISCIPLINE (unchanged — this is what earned the autonomy)

Full suite + `eslint . --max-warnings 0` before every commit. Mutation-check every load-bearing change and
grep for the marker afterwards. Re-measure rather than infer when two numbers disagree. Per-flip audit
anything over ~10 cards. CI green on master before tagging. **When a diagnosis and the runtime disagree,
the runtime wins** — and correct the written diagnosis in place rather than quietly rewriting it.

Sweep `memory/COMMS.md` at every boundary. Post ABOVE the first `### ` header — there is a legacy
`## LOG (newest first)` string ~670 lines down and anchoring on it buries the entry where Omnath never
reads it. Verify with `grep -n "^### " memory/COMMS.md | head -3`.
