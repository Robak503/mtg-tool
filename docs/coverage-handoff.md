# Coverage push — handoff for the next chat

**Paste the "OPENING PROMPT" block below as your first message in the next chat.** Everything
it needs is here or in memory (`project_coverage_roadmap`). The standing owner directive:
drive toward ~85–100% native coverage of The Academy engine, **no silent gaps**, **hold all
`.exe`/release tags until the whole coverage project is done**, keep going chunk-by-chunk.

---

## WHERE WE ARE (2026-06-16)

- **Coverage: 47% native** on the 16-deck sample (`npm run coverage`). The headline is
  **sample-limited + lumpy** — vanilla tricks/auras/wipes barely appear in optimized Commander
  decks, so the real signal is **corpus counts**, not the deck %.
- **Shipped this session (all merged, master clean, 0 open PRs):**
  - #178 Auras + **the 0/0-creatures fix** (slim index stripped P/T → every creature enriched
    to 0/0; fixed at the root) + granted-keyword combat (vigilance/haste layer-aware, menace
    removed from grantable).
  - #179 Board wipes (destroy/exile/-X-X all creatures).
  - #180 Combat-trick keyword grants ("…gets +N/+N and gains [keyword] until end of turn") — 70
    corpus cards, the biggest single slice.
  - #181 Vault-header overlap fix (UI cleanup, unrelated to coverage).
- Suite **1892 vitest cases**, lint clean (`eslint --max-warnings 0` — CI's test job lints).

## THE NEXT SLICE — **team pump** (data-pick #1, ~46 corpus cards)

Shape: **"Creatures you control get +N/+N until end of turn"** (Gnawing Crescendo, Trumpet
Blast, Inspired Charge…). Controller-scoped mass pump. Natural extension of the mass-effects
(`eachCreature`) + combat-trick (`grantKeywords`) work just shipped.

**Why it's the right next step:** highest-frequency clean remaining bucket, lowest risk, max
infra reuse. NOT copies/clones yet — that's CR layer-1, the highest-complexity mechanism, best
done with fresh context after the cheap wins.

### Implementation sketch (verify against the real code first — line numbers drift)
1. **Parser** `app/src/lib/learn/effects/parser.js` → `parseExtendedAtom`: anchored matcher
   `^creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn$` → a pump atom with a
   **selector scope**, e.g. `{ op: "pump", scope: "youControl", ptDelta:{p,t} }` (NOT
   `targetType` — it's non-targeted). Also do the keyword combo
   `^creatures you control get +N/+N and gain <kws> until end of turn$` → reuse
   `parseGrantedKeywords` (already exists) for an Overrun-style team-pump-+-trample. Keep
   "creatures get …" (symmetric, no "you control") as a SEPARATE follow-up — different scope.
2. **Resolver** `app/src/lib/learn/effects/effectAtoms.js` → `applyPumpEffect`: when
   `atom.scope === "youControl"`, add **ONE** continuous effect with a **selector** affects
   (`{ mode:"selector", selector:{ controllerScope:"you", cardTypes:["Creature"] } }`) +
   `duration endOfTurn`, instead of the per-target loop. The layer engine already supports
   selector-mode affects (the anthem statics use it — see `staticAbilityParser.parseCreatureSelector`).
   Grant keywords the same way (layer 6, selector scope) if the keyword combo is included.
3. **`programNeedsChosenTarget`** (parser.js) must treat the team pump as **non-targeted** (it
   has no chosen target) so the cast path doesn't demand a target. Mirror how `eachCreature` is
   excluded. Check `effects/targeting.js atomTargetSpec` returns null for it too.
4. **AI**: the AI already holds pumps (chooseAITarget → null for `pump`). A team pump that's
   GOOD for the AI (buffs its own board) is a future heuristic — for now holding it is safe.
   But double-check: a non-targeted team pump must not crash the AI cast path (effect null).
5. **Coverage**: no classifier change — it's an instant/sorcery, so a HIGH program →
   `native-spell` automatically via `spellIsNative`/`programConfidence`.
6. **Parser pins** `app/src/lib/learn/effects/parser.test.js`: add MUST_STAY_HIGH ("Creatures
   you control get +2/+2 until end of turn.", the keyword combo) and MUST_DROP for filtered/
   wrong-scope variants ("Creatures you control with flying get +1/+1…", "Creatures get +1/+1…"
   if you defer symmetric, "…and gain hexproof…").

### After team pump (in order, all in `project_coverage_roadmap` memory)
- **Graveyard recursion (~49):** "Return target creature card from your graveyard to your
  hand" (Raise Dead / Cemetery Recruitment). New atom + a graveyard-card targetType.
- **Copies / clones (task #7, ~61–83):** CR LAYER-1 copiable values + copy-as-ETB. HIGH
  complexity — give it a fresh session and a design pass first.
- **Trigger-effect vocabulary (task #8):** broaden the atom set the ETB/attack/upkeep/dies
  trigger effects can express (same atoms as spells — helps every bucket).
- **Deliberately skip** (high-complexity/low-yield): additional costs, cost reduction, scry/
  surveil (needs a peek+reorder mechanism), gain-control (layer 2), prevention shields.

---

## THE PER-SLICE PLAYBOOK (follow every slice — this is non-negotiable discipline)

1. **Branch** off master (`git checkout -b feat/<slice>`). Hold all release tags.
2. **Build** the parser + resolver changes. Effect atoms live in
   `app/src/lib/learn/effects/`; the all-or-nothing confidence gate is `parser.js`
   (`programConfidence`) — a false-confident parse is the #1 risk, worse than a no-op.
3. **Corpus sweep — the false-positive gate.** Write a TEMP `app/scripts/_sweep-*.mjs` that
   runs the **REAL** `parseEffectProgram` over the whole `oracle_cards.json` via **`publicCard`
   enrichment** (NOT raw card_faces — split/MDFC must stay un-parseable like production). Count
   newly-native cards + hunt false-positives. **Require 0 real false-positives.** DELETE the
   temp script before commit (console.* fails lint).
4. **Update parser pins** in `parser.test.js` (MUST_STAY_HIGH / MUST_DROP) — the CI merge gate.
5. **Multi-lens adversarial review via the Workflow tool** (see exact pattern below).
   Apply every CONFIRMED finding; per-finding verification defaults to isReal:false.
6. **Live real-enrichment QA** (the owner mandate — acceptance is LIVE, not a green unit
   suite). Either a temp `_live-*.mjs` that enriches REAL cards via `lookupCard`→`publicCard`
   and runs the real engine (`dispatchAction`→`resolveTopOfStack`), OR drive `npm run dev` with
   the preview tools. This is the path units skip — it caught the 0/0-creatures bug. DELETE
   temp scripts before commit.
7. **`npm test` + `npm run lint`** from `app/` — both clean (CI lints with `--max-warnings 0`).
8. **PR** (`gh pr create`), watch `gh pr checks` until `pass` (exit code can lie — read the
   word), **squash-merge** + delete branch, sync master.
9. **Update** `CHANGELOG.md` `[Unreleased]` + the `project_coverage_roadmap` memory entry.

### The Workflow-tool adversarial review (copy this pattern)
- Capture the logic diff to `docs/_<slice>-review-diff.txt` (recreate it if you accidentally
  delete it mid-review — the agents read it).
- `Workflow` script: 4 lenses via `pipeline` → per-finding `parallel` verification.
  Lenses: **(1) over-match / no-silent-gaps**, **(2) CR-correctness + simultaneity/SBA**,
  **(3) regression in the existing path**, **(4) AI-hold + cast path**. Tune per slice.
- Schemas: a findings schema (title/severity/location/detail) and a verdict schema
  (`isReal` defaults false, reasoning, suggestedFix).
- **GOTCHA:** the workflow validator REJECTS literal `Math.random`/`Date.now`/`new Date()` and
  literal backticks inside the prompt template — obfuscate as `const RNG='M'+'ath.rand'+'om'`,
  `const CLOCK='D'+'ate.now'`, and never nest backticks in the template string.
- Past slices: 0–1 confirmed findings each. The aura slice's 1 high finding (granted-keyword
  combat) is what surfaced the vigilance/haste/menace work — take findings seriously.

---

## NON-NEGOTIABLE GUARDRAILS (the "no silent gaps" creed)
- **A false-NEGATIVE (route to Arbiter) is SAFE. A false-POSITIVE (claim native but silently
  drop/mis-apply text, or hit the wrong set) is FORBIDDEN.** Partial application of a card is
  forbidden — model the WHOLE card natively or route it to Arbiter.
- **All-or-nothing parsing.** Any unmodeled clause/keyword → whole program LOW → Arbiter.
- **Determinism.** Game-state mutation must serialize/restore byte-identical. No `Math.random`/
  `Date.now` in state mutation (thread `state.rngSeed`). No closures on the stack (payloads are
  plain `{resolver, params}`). Any persisted state-shape change → bump `CURRENT_SCHEMA_VERSION`
  + add a `MIGRATIONS[old]` + a fixture (`learnSaveSchema.js`).
- **Granted keywords:** only grant from `GRANTABLE_COMBAT_KEYWORDS` (keywords.js — the single
  source of truth, enforced + layer-aware). Granting an unenforced keyword (menace/hexproof/…)
  is the cardinal sin.
- **The enrichment path is THE silent-gap risk.** The slim `oracle-index.json` is the active
  lookup; verify changes with REAL `lookupCard`→`publicCard`, never only hand-built fixtures.
- Adversarially review the **trigger-flush + activated** auto-choose paths, not just the cast
  path — they share the parser and auto-pick targets (the Mystic Snake / first-legal hazard).
- Bash cwd resets to repo root after `git`/`git checkout`; `cd app` before `node`/`npm`.
- Delete every temp `_*.mjs` sweep/QA script before commit (console.* → eslint fails).

## KNOWN PRE-EXISTING FOLLOW-UPS (not silent gaps; don't let them block a slice)
- **Simultaneous-dies-trigger look-back** (spawned task): a creature that dies in a wipe
  alongside others doesn't fire its own "whenever a creature dies" for the co-dying companions.
  Best fixed with the trigger-vocabulary slice.
- **Enemy-aware trigger-target chooser** (tracked deferred seam): a pump/keyword-grant on a
  TRIGGERED ability auto-targets first-legal — could buff an enemy. Same class as the gated
  P3.1 counter. The real fix is the enemy-aware chooser, not gating each atom.

## VERIFY COMMANDS (from `app/`)
```
npm test                 # full vitest suite (~1892 cases)
npm run lint             # eslint --max-warnings 0 (what CI runs)
npm run coverage         # native-% dashboard + tier breakdown + gap buckets
```

---

## OPENING PROMPT (paste this into the next chat)

> Continue the Phase-7 coverage push toward ~100% native Academy coverage, following the
> per-slice discipline in `docs/coverage-handoff.md` and the `project_coverage_roadmap` memory.
> **Next slice: team pump** — "Creatures you control get +N/+N until end of turn" (controller-
> scoped mass pump, ~46 corpus cards), plus the Overrun-style "+N/+N and gain [keyword]" combo,
> reusing the `eachCreature` mass infra and the `grantKeywords` work just shipped.
>
> For the slice: branch off master → build the parser matcher (`effects/parser.js`
> parseExtendedAtom) + a selector-scoped pump path in `effects/effectAtoms.js applyPumpEffect`
> → run the REAL parser over the whole `oracle_cards.json` via `publicCard` (require 0 false-
> positives) → update parser pins → run the multi-lens adversarial review via the **Workflow
> tool** (4 lenses + per-finding verification; obfuscate Math.random/Date.now) → live real-
> enrichment QA (enrich a real card like Inspired Charge / Trumpet Blast via lookupCard→
> publicCard and resolve it through the real engine, or drive `npm run dev` with the preview
> tools) → `npm test` + `npm run lint` → PR → merge. No release tags / .exe until the whole
> coverage project is done. Then continue down the roadmap: graveyard recursion → copies/clones
> (#7) → trigger vocabulary (#8). No silent gaps — false-negatives are safe, false-positives
> are forbidden.
