# PLAY-HINTS LEDGER — the AI's play identity for cards it can't route

**Built 2026-08-12** on Colton's order: *"fill the gap … so the AI is not just blind to the card."*
This documents what exists, the contracts, and what remains.

## The three layers of "not blind" (and which one this is)

| Layer | Question | System | Status |
|---|---|---|---|
| **Resolution** | What happens when an unmodeled card resolves? | The Arbiter seam (`pendingArbiter`): teaching-moment pause for the player's own spells; honest `spell-unresolved` log otherwise. Plus **ARBITER-IN-RUNNER** (arbiterVerdictStore + applyArbiterVerdict + the default-off `resolveArbiter` hook) — a frozen per-card verdict cache. | Built; the verdict SOURCE (structured-Ollama or curated set) remains — see ARBITER-IN-RUNNER-SPEC.md |
| **Restraint** | Does the AI waste mana on cards that would vanish? | AI-F2: a LOW-confidence spell with ZERO runnable atoms is HELD (ranking-only, never a legality gate). | Built (pre-existing) |
| **Decision** | Does the AI know how a card WANTS to be played? | **THIS BUILD** — the play-hints ledger. | Built 2026-08-12 |

## What was built

1. **`app/src/lib/learn/cardPlayHints.js`** — `deriveCardRole(card)`: a pure, deterministic, TOTAL
   role+timing classifier over PRINTED text (which exists whether or not the effect is modeled).
   Roles: wipe · counterspell · spot-removal · tutor · ramp · card-draw · recursion · token-maker ·
   protection · anthem · lifegain · equipment · finisher · utility. Most-specific-first; reminder text
   stripped; the big-body finisher prong outranks printed anthem/token text (the Craterhoof row).
   `lookupPlayHint(hints, card)`: ledger entry first, derivation otherwise — total either way.
2. **The ledger file** — `<APP_ROOT>/data/card-play-hints.json`:
   `{ version, generated, hints: { "<name>": { role, timing, note?, source, tier, parked } } }`.
   `source: "curated" | "arbiter" | "derived"` — curated/arbiter entries are NEVER overwritten by a
   re-warm; derivation only fills gaps and refreshes its own. Hand-edit a card's entry (set
   `source: "curated"`) and it sticks.
3. **`app/scripts/warm-play-hints.mjs`** — scans every saved deck, derives roles, stamps tier +
   parked, writes the ledger, prints the per-deck parked-but-hinted report. First warm (2026-08-12):
   **1,257 unique cards across 21 decks, 340 parked cards now carrying a play identity.**
4. **The scorer** — `opponentAI.scoreCastAction` gained a `hint` parameter routing to per-archetype
   **ROLE tables** (`ROLE_SCORES`) that subsume the legacy four-flag scorer and extend it: control
   casts wipes at priority 0 (the legacy interaction regex could not even SEE a wipe), combo ranks
   tutors 0, token decks rank anthems, the aggro creature-curve override survives.
5. **The thread** — the five learn API routes (start / step / choose / resume / resume-puzzle) pass
   `policy: { playHints: loadPlayHints() || true }`; `src/lib/server/playHintsLedger.js` is the lazy,
   mtime-cached loader (a re-warm is picked up without a restart). `|| true` = derivation-only when the
   ledger was never warmed — the Academy is NEVER hint-blind.

## The contracts

- **DEFAULT-OFF for self-play.** No hints threaded ⇒ `scoreCastAction` byte-identical to the legacy
  scorer (pinned in cardPlayHints.test.js) — the frozen trajectory-hash contract (the `resolveArbiter`
  precedent). `selfPlayRunner` is deliberately unwired; a probe opts in via its own advanceOpts.
- **RANKING-ONLY.** Hints re-rank offered actions. Legality lives in the engine's chokepoints (THE CREED).
- **ENGINE FILE-FREE.** Only `src/lib/server/playHintsLedger.js` reads the disk; the engine gets a map.

## What remains (in value order)

1. **Board-aware timing** — "cast the wipe only when behind," "hold the finisher until it wins."
   `scoreCastAction` is state-free; the state-aware hold belongs beside the existing wipe/fog policy
   arms in the chooser. The `timing` field already carries the vocabulary (hold-wipe / hold-interaction
   / late) — the chooser just doesn't read state against it yet.
2. **Arbiter enrichment pass** — an offline Ollama pass writing `source: "arbiter"` entries with a
   one-line `note` per parked card (the prose the panel can also show a human). Rides the same warm
   script; entries survive re-warms by the same rule as curated.
3. **The verdict-cache SOURCE** (the resolution layer's missing piece, ARBITER-IN-RUNNER-SPEC.md):
   structured-Ollama emitting verdict atom programs, or a curated set for the ~30 repeat offenders.
4. **Role vocabulary growth** — graveyard-hate, stax, land-destruction, combo-piece are absent; the
   `utility` bucket (503 of 1,257 on first warm) is the honest default and the refinement target.
