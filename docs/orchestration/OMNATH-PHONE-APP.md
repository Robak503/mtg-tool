# OMNATH PHONE APP — ownership boundary and build scaffold

> **Purpose.** This is the coordination anchor for turning MTG Tool's existing
> local rules and play systems into a friend-facing, offline Android assistant.
> It defines what the phone-app lane may consume, what it owns, and what it must
> not change while Cindy and the Omnath harness agent continue their upstream
> engine/corpus and play-harness work.
>
> **Status.** Phone-owned implementation is active. The browser-safe engine
> boundary, full offline knowledge pack, grounded answer contract, Tauri Android
> shell, and LiteRT-LM plugin now exist. Physical Pixel installation and
> network-isolated knowledge retrieval are proven. The full offline-art build,
> updated rule/card presentation, and optional model performance still need
> device execution.
> This document does not authorize implementation in
> the protected engine or corpus directories.
>
> **Reviewed upstream contract baseline.** The original cross-agent seam review
> receipt remains upstream commit `91cbe769`. On 2026-08-30, Codex fetched and
> reconciled this scaffold against the then-current `origin/master` at exact
> commit `06f33fe25971c97e5bf3e372b843e1551d3c5321`; the phone worktree's detached
> `HEAD` matched it exactly. Of the specifically named runtime seams, only
> `app/src/lib/learn/coverage.js` changed between those receipts, as part of the
> classifier/coverage corrections. The current audit found no new ownership or
> mobile-boundary change. This is still a review receipt, not a permanent
> implementation pin; every mobile milestone must record the exact upstream
> commit and data-pack version it actually tests.
>
> **Bootstrap data receipt.** The same worktree contained and successfully
> parsed all three canonical build inputs: Oracle (`38,254` cards;
> `83,425,972` bytes), official rulings (`77,999` rulings; `27,644,723` bytes),
> and CR JSON (`3,138` rule records; `1,236,911` bytes). Oracle and rulings report
> source updates on 2026-07-17 and local generation on 2026-07-18. These source
> snapshots must be versioned again when the mobile pack is actually built.
>
> **Relationship to the existing phone plan.** `docs/phone-playbook/` is the
> tracked July 2026 execution playbook for the broader **Omnath in Pocket**
> product: decks, pod tools, life tracker, vault, sync, Mac-hub amplification,
> and multiple agent tiers. This document is the narrower, assistant-first
> ownership and integration boundary created from Colton's later request for a
> friend-facing, fully offline rules assistant. Neither document silently
> deletes the other. Shared implementation must reconcile both decision logs;
> broader phone features remain outside this lane until Colton activates them.

### Recoverable implementation checkpoints

| Checkpoint | State | Receipt / recovery command |
| --- | --- | --- |
| Offline vertical-slice baseline | Complete | Branch `codex/omnath-phone-polish`, commit `c3b4e072` |
| Validated interpretation and pure controller | Complete | `cd app-mobile; npm run answer:test; npm run build` |
| UI, private feedback, diagnostics, and fixtures | Complete | `cd app-mobile; npm run answer:test; npm run build` |
| Native lifecycle and shell security | Complete | `cd app-mobile; npm run android:model:test; npm run shell:test` |
| Automated build receipt | Complete | `cd app-mobile; npm run receipt` |
| Final full-suite APK | Complete | Commit `96c4ecc9`; `cd app-mobile; npm run release:verify` |
| Physical Pixel verification | In progress | Installation, provisioning, FTS, exact CR lookup, and card retrieval passed manually; full-art and updated presentation plus optional model performance remain |

Each completed pre-phone checkpoint is committed separately. Generated packs,
APKs, device reports, receipts, and model binaries remain ignored artifacts.

---

## 0. Owner amendment — reconcile July D7 and D12

Colton settled the product-shape conflict on 2026-08-30. The first friend-facing
assistant APK is a **standalone offline product**, not merely a client for the
future Mac hub:

- One player-facing persona: **Omnath**, with a warm, casual conversational
  rhythm.
- No Jace/Karn/Tibalt selector in this assistant build.
- Oracle text, official rulings, a versioned CR citation index, retrieval, and
  the approved rules/play runtime live locally on the phone. Raw CR JSON is a
  build-machine input, not an APK runtime file.
- A small on-device model interprets questions and narrates verified answer
  plans. It does not supply MTG truth from its weights.
- No Mac hub, remote large model, paid API, or online fallback is part of this
  product lane. Any later connected amplifier requires a separate product
  decision and must not weaken offline operation.
- A friend's APK starts with a clean local profile. Colton's memories, vault,
  conversations, decks, and other private owner data never ship with it.

This is an explicit amendment to two July decisions for this narrower product:

- **D7 is overridden for the standalone assistant APK.** The July multi-agent,
  Mac-70B-first topology and Mac-only Arbiter do not govern this build. Omnath is
  the sole friend-facing persona, and the trust contract is re-implemented over
  local retrieval, deterministic engines, and the on-device model.
- **D12 is overridden for the standalone assistant APK.** Omnath is no longer
  hidden from giftable builds. The underlying privacy boundary remains an
  independent, absolute constraint: the Omnath persona shell may ship to
  friends; Colton's private memory never does.

July D13 (the CREED), offline-first data, deterministic citations, and the
persona-shell/private-memory separation remain in force. If the broader
18-document phone product is reactivated, its additional features and hub
topology require a separate owner reconciliation rather than silently expanding
this assistant APK.

---

## 1. Product sentence

Build an Android APK that can answer beginner through judge-level Magic
questions offline by using deterministic local MTG knowledge for truth and a
small on-device language model only for understanding and natural conversation.

The governing flow is:

```text
player question
  -> intent and card detection
  -> local Oracle / ruling / CR retrieval
  -> rules engine or play engine when applicable
  -> verified answer plan
  -> Omnath conversational rendering
  -> meaning/trust validation
  -> answer
```

The model is the narrator and interpreter. It is not the rules judge.

---

## 2. Ownership boundary — do not blur this

### The protected upstream lane has two owners

**Cindy owns the engine and corpus work**, including:

- `app/src/lib/learn/**`
- `knowledge/mtg-judge/**`
- `knowledge/mtg-engine/**`
- the corpus, classifiers, parsers, atoms, resolvers, core runtime, playability
  work, portability guards, and their tests, except for the harness-owned files
  below
- engine and corpus orchestration documents, including `ENGINE-SCAFFOLD.md`
  and `WAKE-REPORT.md`

**The Omnath harness agent owns the play/grind harness lane**, including
`selfPlayRunner.js`, `opponentAI.js`, the grind/log machinery, the external
pilot artifacts that live outside this repository, and the 486-note play-hints
corpus. That corpus is single-writer. Phone work may consume approved outputs,
but it must not edit or regenerate the harness corpus behind its owner's back.

Codex's phone-app lane treats those areas as a protected upstream dependency.
It may read, import, test, and report issues against them. It must not edit them
unless Colton explicitly authorizes a specific cross-boundary change.

If phone work uncovers an engine or corpus defect, Codex writes a reproduction
for Cindy. If it uncovers a self-play, opponent, grind/log, pilot, or play-hints
defect, Codex routes the reproduction to the Omnath harness agent. The owning
agent decides and implements the upstream fix.

### Codex owns the new Omnath phone-app lane

Planned ownership, once implementation is authorized:

- Android/mobile shell and packaging
- the friend-facing chat interface
- question routing and answer-plan orchestration
- the single Omnath conversation contract
- local knowledge packaging and mobile search adapters
- model-runtime adapter and device capability detection
- response validation and deterministic fallback presentation
- mobile-only profile, memory, feedback, diagnostics, and update UX
- phone-specific tests and evaluation cases

Candidate paths are deliberately new and isolated:

```text
app-mobile/                 # planned Android/Tauri application
packages/omnath-core/       # planned platform-neutral assistant orchestration
packages/mtg-data-schema/   # planned shared read-only data contracts
```

These names are a starting proposal, not permission to create or restructure
them without first checking the live tree and current scaffold documents.

---

## 3. What the phone app consumes from the existing project

### Rules and coverage

| Existing source                                                             | Phone use                                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/src/lib/learn/coverage.js`                                             | Classifier/capability signal whose result directly gates some legal-action enumeration   |
| `app/src/lib/learn/effects/parser.js`                                       | Oracle text to typed effect program                                                      |
| `app/src/lib/learn/effects/effectAtoms.js` and `effects/atoms/**`           | Deterministic effect vocabulary                                                          |
| `triggers.js`, `triggerRouting.js`, `staticAbilityParser.js`, `keywords.js` | Mechanism recognition and routing                                                        |
| `knowledge/mtg-judge/data/cr/cr_current.json`                               | Build-time source for the packaged CR citation index; never an engine runtime dependency |
| Arbiter response contract                                                   | Contract to re-implement on mobile; it is not a WebView-consumable module                |

`classifyCard` is the coverage metric and load-bearing runtime code.
`legalChoices.js` imports it and uses the resulting tier to gate real action
availability, including plot, adventure-half casting, and emerge. `kicker.js`,
`emerge.js`, and `tribute.js` also accept it as an injected re-classifier feeding
runtime gates. The browser-safe phone engine must therefore ship the real
coverage classifier and its reachable dependency chain; it must not stub,
replace, or tree-shake them away. The classifier does not execute an action, but
its result changes which actions the runtime offers.

Do not confuse that function with the unrelated local `classifyCard` declared
inside `app/src/lib/goldfish.js`. The goldfish helper is not the coverage
classifier; grep-driven work must resolve the import/declaration before editing
or wiring either name.

`land-partial` means playable but not fully native. The phone may still discuss
or display the card; it must not claim that every ability is deterministically
modeled.

### Play engine

| Existing source                                                       | Phone use                                                                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `gameEngine.js`                                                       | Turn structure and stack behavior                                                                                             |
| `gameState.js`                                                        | Canonical immutable game-state shape                                                                                          |
| `resolvers.js`                                                        | Resolver registry                                                                                                             |
| `effects/runProgram.js`                                               | Deterministic atom execution                                                                                                  |
| `layers.js`, `sba.js`, `combatResolution.js`, `replacementEffects.js` | Rules calculations                                                                                                            |
| `legalChoices.js`, `actionDispatcher.js`                              | Legal action enumeration and execution                                                                                        |
| `selfPlayRunner.js`                                                   | Node-dependent evaluation harness; impossible in a WebView as written and excluded from the first APK                         |
| `opponentAI.js`                                                       | Harness-owned opponent logic; not required in the first APK and included later only if the mobile manifest proves it portable |

The phone build consumes only a browser-safe runtime subset, but **that subset
is not defined or enforced today**. `app/src/lib/enginePortability.test.js`
guards against direct or transitive Tauri coupling across the durable engine
surface. It does not prohibit Node builtins—in fact its own clean-control test
explicitly accepts `node:fs`. Passing that guard proves Tauri-independence for a
Node/headless surface, not Android-WebView safety.

At reviewed upstream commit `91cbe769`, eight production files under `learn/`
have direct Node-builtin imports. Their direct imports split into two classes:

**Filesystem/path/compression-bound:**

- `crucibleRun.js`
- `gameLogStore.js`
- `grindLoop.js`
- `lossMiner.js`
- `selfPlayRunner.js`
- `winClassifier.js`

These six do not enter the first WebView graph as written.

**Crypto-only direct builtin imports:**

- `arbiterVerdictStore.js`
- `grindPod.js`

“Crypto-only direct import” does **not** make either whole module portable behind
only a one-line shim. Portability is transitive:

- `arbiterVerdictStore.js` imports filesystem-backed `server/paths.js` and
  `server/atomicJson.js` for load/save. Its deterministic core is worth carrying
  to the phone: `verdictKey`, `getVerdict`, and `putVerdict` are pure; the
  canonical verdict hash can use a platform-neutral SHA adapter. Mobile must
  extract that core and put persistence behind the Android storage adapter. It
  must not discard the verdict cache—the cache is the best deterministic path
  for validated unmodeled-card verdict atoms.
- `grindPod.js` imports `selfPlayRunner.js` and belongs to the harness lane, so a
  crypto replacement alone does not make it part of the APK. Extract only a
  pure deck-fingerprint helper later if a real phone feature needs it.

Not all of those belong in the mobile graph. Stage 2 must define an explicit
mobile entrypoint/manifest, walk its transitive imports, and add a seen-to-fail
guard that rejects Node builtins and server-only modules reachable from that
graph. Node-only logs, grind tooling, miners, desktop persistence, and the
self-play runner do not move into the WebView merely because they live under
`learn/`.

### Resolved audit receipt — `land-partial` is metric-only at runtime

The full runtime-site sweep proved that demoting a land to `land-partial` cannot
change a legal action. This conclusion is specific to lands; it does not weaken
the earlier rule that `classifyCard` is load-bearing runtime code for several
nonland mechanics.

- Plot checks `isLand(card)` before consulting the tier.
- Flashback skips lands before consulting the tier.
- Adventure and split gates first require their respective card shapes, neither
  of which recognizes a land. Spell/land MDFCs that demoted to `land-partial`
  were already outside the split recognizer.
- Emerge and kicker classify stripped creature bodies, never lands.
- The command-zone adventure path requires an adventure face, which no land
  has.
- The player-Aura path requires exactly `native-aura`.
- The real land runtime—`actionsPlayLand`, `manaProduction`, and
  `entersTapped`—does not read a coverage tier.

Therefore the 658 land demotions corrected the coverage metric without making a
land unplayable, disabling a mana source, or suppressing a cast. Mobile must
still ship the classifier chain for its genuine nonland runtime consumers, but
it may safely interpret `land-partial` as an honesty/capability distinction
rather than a changed land-play decision.

### Local knowledge and card data

The first offline data pack should contain:

- Oracle text and card identity data
- official per-card rulings
- Comprehensive Rules passages and citation metadata
- beginner glossary and curated explanations

The phone build should transform these sources into a versioned, indexed mobile
database during the build. It must not maintain a hand-edited second copy of
card text or rules.

The CR source is a **build-time input to the citation pack, not an engine runtime
dependency**. The deterministic engine has the relevant rules encoded in its
programs; its references to `cr_current.json` are comments/receipts rather than
file reads. The WebView engine subset therefore needs zero CR payload to compute
rules. CR passages are required only when the assistant retrieves or quotes
rules, so the citation pack may be built and shipped on its own versioned
schedule without blocking engine correctness.

The current citation reader is not a mobile import boundary:

- `app/src/lib/server/paths.js` is Node-only, so the APK cannot call
  `mtgJudgePath()`.
- `app/src/lib/server/rulesRetrieval.js`, `cardIndex.js`, and the
  `rules-retrieval`, `weird-rules`, and `knowledge-status` routes are runtime
  readers for desktop/server use and depend on Node/filesystem facilities.
- The Stage-3 build must resolve Oracle, rulings, and CR source paths on the
  build machine, compile the versioned SQLite/FTS pack, and ship only that pack
  plus its manifest. Mobile retrieval must query the packaged index through a
  phone-owned adapter and prove behavioral/citation parity against the
  canonical source records.

Commander Spellbook combo data remains an optional pack, not an MVP requirement.
Colton confirmed that device storage is not a constraint for card imagery, so the
art target is the full playable Oracle catalog rather than a curated deck subset.
Offline art is a separately versioned build-time pack of Scryfall small JPEG
previews keyed by Oracle/card-face identity. The base app remains fully usable
without it, missing art never weakens Oracle/rules truth, and the phone never
fetches source image URLs at runtime. Source terms and attribution still require
review before friend distribution.

---

## 4. Trust contract carried into every interface

The desktop Arbiter is Next.js server code and is hardcoded Ollama-only. It does
not run inside the Android WebView. Mobile must re-implement its behavioral
contract around the chosen on-device model rather than attempting to import or
bundle the route.

The implementations of `stripHallucinatedCitations` and
`buildInjectedContext` in `app/src/lib/server/citationInjector.js` are valuable
contract references, but the module is **not** a reusable WebView import: its
top-level `cardIndex.js` dependency reaches Node/filesystem-backed server code.
Mobile must either consume an upstream dependency-free leaf export or implement
a phone-owned equivalent with parity tests; it must not import the server module
and hope bundling removes the dependency. `detectArbiterStatus` is route-local
and unexported. If mobile needs that exact implementation, Codex must request an
upstream export from the desktop Arbiter owner instead of reaching across the
ownership boundary.

The Arbiter status fix established the trust rule the mobile UI must preserve:

- `answerTrusted: true` only accompanies a genuinely grounded, citation-clean
  `resolved` answer.
- Known untrusted/non-final statuses include `fallback_only`, `model_timeout`,
  `model_error`, `retrieval_miss`, `citation_failed`, `unresolved`,
  `needs_clarification`, and `retrieval_error`.
- The status vocabulary is open-ended. Mobile must not use an exhaustive switch
  whose default becomes trusted.
- The desktop HTTP-500 `retrieval_error` response currently omits
  `answerTrusted`. A missing, null, malformed, or non-boolean value must be
  interpreted as `false`; only literal `true` is trusted.
- Error details may be retained for diagnostics but must not be dumped into a
  beginner-facing conversation.
- A model failure may still produce a deterministic helpful answer, but Omnath
  must not represent it as model-grounded or formally verified.

The UI must branch primarily on `answerTrusted === true`; the detailed status
explains why and supports logs, tests, and recovery behavior.

```text
answerTrusted = true
  -> answer directly and naturally
  -> offer the supporting rule when useful

answerTrusted = false
  -> give only the deterministic/qualified guidance available
  -> do not call it an official ruling
  -> offer a rule lookup, clarification, or review path
```

The language model may change wording, pacing, and examples. It may not change
the answer plan's conclusion, quantities, zones, timing, targets, card text, or
citations. If validation fails, the deterministic rendering wins.

---

## 5. Omnath conversation contract

There is one player-facing persona: Omnath, using a warm, casual conversation
rhythm. There is no persona selector and no After Dark variant.

Default behavior:

1. Answer the exact question in beginner language.
2. Give only the minimum mechanism needed to make the answer understandable.
3. Use the player's concrete cards and numbers.
4. Stop before unrelated strategic or rules branches.
5. Offer one relevant follow-up rabbit hole.
6. Expand only when the player asks.

Calibration examples:

> Floating mana is mana you've made but haven't spent yet. If you tap a
> Mountain, you add one red mana to your mana pool. Until you spend it, that
> mana is floating. It disappears when the current step or phase ends, so you
> can save it briefly—but not for later in the turn.

> Your 8/8 only needs to deal 1 damage to the 9/9 because of deathtouch.
> Trample lets the other 7 damage go through to the defending player. The 9/9
> deals 9 damage back, so both creatures die and the defending player takes 7.
> If you want, I can explain why deathtouch makes just 1 damage count as lethal
> here.

---

## 6. Worktree and synchronization policy

Phone implementation must not run in Cindy's live checkout.

1. Register `C:\Projects\mtg-tool` as the Codex project.
2. Create a separate Git worktree/branch for Omnath phone work.
3. Start from a committed upstream checkpoint, never by copying another agent's live
   uncommitted working tree.
4. Keep phone commits confined to the phone-owned paths and coordination docs.
5. Bring upstream engine/corpus commits into the phone branch at deliberate
   checkpoints.
6. Do not rewrite, force-push, reset, or clean Cindy's branch or checkout.
7. `app/package-lock.json` and `app/public/card-names.json` are committed,
   tracked generated files. Regenerate them through their owning workflow when
   required; never hand-edit, discard, or clobber another worktree's changes.

Because the corpus grind may run for months, no fixed engine commit is declared
the permanent mobile baseline. Each mobile milestone records the exact upstream
commit and data-pack version it was tested against.

---

## 7. Delivery ladder

### Stage 0 — remote prototype

- Codex remains on the development computer with local file access.
- A phone remotes into the Codex task.
- A dedicated read-only friend-testing task presents Omnath behavior.
- Real questions become evaluation cases; no corpus files are edited.

### Stage 1 — device and model proof

- Test the actual first Android phone.
- Compare a roughly 1B base model with an E2B/3B-ish enhanced pack.
- Measure cold start, first-token latency, generation speed, peak RAM,
  temperature, battery use, and conversational quality.
- Choose the supported device floor from evidence.

### Stage 2 — portable-engine proof

**Implementation receipt — 2026-08-30, pending commit.** The first phone-owned
contract slice now exists in the worktree. Before final validation, the detached
worktree was synchronized from the bootstrap start commit to then-current
`origin/master` at exact commit `a09be33aa5de0d55d73b27735aa1e434ce536fcf`;
the intervening CAP9–CAP14 engine changes introduced no new mobile-graph
violation.

- `app/src/lib/mobile/runtimeManifest.js` declares the repository-relative
  Android-WebView entrypoint, its fourteen allowed exports, zero approved external
  packages, and forbidden server/API/build-tool paths.
- `app/src/lib/mobile/runtime.js` re-exports the real upstream classifier,
  game-state constructors, and legal-choice functions without copying or
  weakening their behavior.
- `app/scripts/mobile/webview-portability.mjs` walks literal static, dynamic,
  re-export, and CommonJS imports transitively. It fails closed on Node
  builtins, unapproved packages, unresolved imports, runtime asset imports,
  source outside the workspace, and forbidden server/API paths. Computed module
  specifiers remain an explicit static-analysis limit.
- The live manifest walk and browser bundle still report zero violations. Synthetic
  two-hop fixtures prove the guard detects both a Node-builtin leak and an
  indirect server-source leak. Runtime contract tests exercise classifier-gated
  Plot, Adventure, Emerge, land dispatch, layer-modified combat, state-based
  actions, counter replacement, and trigger flushing through the declared entrypoint.
- A Vite ES2020 production probe now bundles that entrypoint and executes it in
  a real Chromium document. The runtime export contract plus classifier, Plot,
  Adventure, and Emerge witnesses all pass with no Node/server import residue.
- `app-mobile/` is an isolated Tauri Android probe shell; it does not reuse or
  mutate the Windows desktop shell. The first ARM64 debug APK compiled against
  Android 36 with minimum SDK 24 and package id
  `com.colton.omnath.probe.debug`. Its 2026-08-30 build receipt is 137,108,998
  bytes, SHA-256
  `add1a472581784c6e13814071df44a41fb20553483b0f1ad650ac55b613bda5e`,
  and a valid Android debug signature. Device execution is still pending.

This establishes the import boundary before an Android shell or data pack is
coupled to it. Desktop Chromium execution and APK packaging are now proven; the
remaining Stage-2 gate is executing the packaged probe in the Pixel's Android
WebView and recording the on-device result.

- Define the mobile runtime entrypoint/manifest; no browser-safe subset exists
  as an enforced contract yet.
- Add a transitive, seen-to-fail WebView portability guard for Node builtins and
  server-only imports. The existing Tauri guard is necessary but insufficient.
- Extract the pure Arbiter verdict-cache core, preserve its canonical content
  hash through a platform-neutral SHA adapter, and prove Android persistence
  through the mobile storage adapter. Do not import the desktop store wrapper.
- Load the approved browser-safe rules/play subset in an Android WebView.
- Run representative engine cases, including combat, layers, state-based
  actions, triggers, and replacements.
- Keep the existing engine test meaning intact; add mobile contract tests.

### Stage 3 — offline-knowledge proof

**Implementation receipt — 2026-08-30, pending commit.** The first phone-owned
pack compiler now exists at `app-mobile/scripts/build-knowledge-pack.mjs`. It
reads the three canonical files directly on the build machine, validates their
declared counts and cross-record identity, and emits a SQLite 3 / FTS5 pack plus
a source-hashed manifest. It does not import `server/paths.js`, and neither raw
CR JSON nor the source Oracle/rulings envelopes are runtime APK inputs.

- Schema v1 stores canonical card identity/Oracle fields, exact normalized card
  and face names, official rulings, and CR navigation/citation records.
- Separate FTS5 indexes cover card text, ruling text, and CR rule/example text.
- Fixture tests prove exact face lookup, all three retrieval paths, source hash
  receipts, count-mismatch failure, and output-boundary refusal.
- The full build produced pack id `2ff865558090ad70c6d3f2c5`, containing 38,254
  cards, 44,647 card/face names, 77,999 rulings, and 3,138 CR records. SQLite
  `integrity_check` returned `ok`; exact Omnath lookup returned the canonical
  Oracle record and six official rulings.
- The database is 105,324,544 bytes with SHA-256
  `d9dd2756c414123ab9934263496b043ef0225d5178314f5996f4efdca4dc3d75`.
  It remains an ignored reproducible build artifact. The Android build now
  embeds it as a Tauri resource, and the native startup path streams it to app
  private storage while verifying its byte count and SHA-256 before exposing
  it to the read-only SQL adapter.
- The mobile SQL capability grants load/select/close only; it does not grant
  SQL execute. Repository tests against the full pack prove receipt and
  `quick_check` verification, exact card and face-name lookup, official ruling
  retrieval, card FTS, and CR FTS. Native tests prove successful streamed copy
  and fail-closed hash mismatch behavior. Device parity is still pending.
- A full parity gate now compares every one of the 38,254 cards, 77,999 rulings,
  and 3,138 CR records to the packed rows and verifies all three source hashes
  plus the database receipt hash. First-launch provisioning runs in a shared
  background operation, reports copied bytes, verifies before replacement, and
  lets concurrent callers join the same preparation instead of duplicating it.

- Resolve the canonical Oracle, rulings, and CR inputs on the build machine and
  generate a versioned SQLite/FTS database; the APK never calls Node path helpers
  or opens raw CR JSON.
- Resolve card names, Oracle text, rulings, glossary entries, and CR passages in
  airplane mode.
- Trace every quoted card behavior and rule citation to its source record.

### Stage 4 — vertical-slice APK

**Implementation receipt — 2026-09-03, updated APK pending device execution.** The
deterministic vertical slice, local-model seam, and pre-phone alpha polish now
exist on branch `codex/omnath-phone-polish`.

- The phone UI has one Omnath chat surface and no persona selector. It exposes
  the runtime and knowledge-pack receipt without requiring a network.
- The phone shell now follows the desktop EXE's LEYLINE visual system: true
  black surfaces, phosphor-green edges and primary action, cyan Omnath/evidence
  accents, compact monospace metadata, and dark-glass chat geometry. It does
  not copy desktop multi-agent or deck controls that the standalone assistant
  does not implement. Browser QA passed at 412x915 and the 320px minimum with
  no horizontal overflow, a fixed visible composer, and 48px controls.
- The answer planner emits a formal `AnswerPlan` with status, explicit trust,
  immutable facts/citations, narration slots, and deterministic fallback. It quotes canonical Oracle text, official ruling records, or
  exact CR passages when it can prove the match. Ambiguous retrieval is labeled
  related-only, and an empty retrieval fails closed instead of inventing a
  ruling. Ten data, repository, and trust-policy tests pass.
- A phone-owned Tauri mobile plugin pins LiteRT-LM Android 0.16.1 and exposes
  status, catalog-restricted load, streaming generation, cancellation, unload,
  and benchmark operations. It keeps one engine and one active generation.
  Model output may only arrange `{{RESULT}}` and `{{FOLLOW_UP}}` exactly once;
  unknown, duplicate, missing, oversized, or literal model content is rejected
  in favor of the deterministic answer.
- Model-assisted question interpretation accepts only a bounded JSON intent,
  card-name, and rule-number shape. Every proposed record must resolve exactly
  in the local pack before it can affect retrieval, and interaction questions
  remain untrusted without a deterministic verdict. A pure controller prevents
  cancelled or superseded requests from rendering stale results.
- Answer feedback stores only aggregate outcome/rejection counts. Correction
  reopens the composer, and exportable diagnostic receipts whitelist runtime,
  pack, model, and outcome codes without retaining question or answer text.
- Desktop fixtures cover grounded, related-only, insufficient, corrupt-pack,
  unavailable-model, invalid-model, and cancellation states. Browser testing
  caught and fixed the composer style that previously overrode the Stop
  button's hidden state.
- The first physical Pixel install exposed a Windows fallback packaging gap:
  the no-symlink Gradle recovery copied the Rust library but omitted Tauri's
  `assets/knowledge` resources, so first-launch provisioning failed closed.
  Commit `ffb2a2a1` explicitly packages the SQLite database and manifest during
  that fallback. The release receipt now rejects an APK unless both entries are
  physically present and the database and manifest hashes match their verified
  build inputs.
- LiteRT-LM 0.16.1 publishes newer Kotlin metadata than Tauri 2.11's Android
  host compiler reads by default. The phone Gradle modules use the narrow
  `-Xskip-metadata-version-check` compatibility flag and aligned JVM 17 targets;
  the clean ARM64 build compiles both modules together. Remove this bridge when
  Tauri's generated Android host advances to a matching Kotlin compiler.
- The development model catalog has a base Gemma 3 1B Tensor G5 candidate and
  an enhanced Gemma 4 E2B Tensor G5 candidate. Models are ignored side-loaded
  artifacts, never APK resources, and the APK has no download path or network
  permission. The enhanced 3,113,545,589-byte candidate is staged and verified
  at SHA-256 `af1082986639ecde7db95d91be6fe54f8b6b458104734c5bafc204e69d6852dc`.
  The base candidate's exact byte count and SHA-256 are also pinned, but its
  endpoint returns HTTP 401 until Colton accepts the Hugging Face Gemma license
  and supplies `HF_TOKEN`.
- The authoritative full-art ARM64 debug APK targets Android 36 with minimum
  SDK 24, package id `com.colton.omnath.probe.debug`, and user-facing label
  **Omnath MTG Assistant**. The offline-art build from commit `a7e47e3e` is
  767,182,782 bytes with SHA-256
  `c0dff859e5420cd480a14d1c65089d883b3811557c0f5f5d4fc2e42709553e61`.
  Its machine-generated receipt reports 37,526 entries, no
  `android.permission.INTERNET`, no bundled `.litertlm`, no raw Oracle/rulings/CR
  input, and a matching staged enhanced-model hash. It also proves that the
  105,324,544-byte SQLite pack is physically present at
  `assets/knowledge/omnath-knowledge.sqlite` and hashes to
  `d9dd2756c414123ab9934263496b043ef0225d5178314f5996f4efdca4dc3d75`.
  The only reported permission is Android's package-scoped dynamic-receiver
  protection.
- The UI/controller JavaScript is 30,487 bytes (10,870 bytes gzip), and the
  LEYLINE stylesheet is 12,029 bytes (3,240 bytes gzip); the
  995,428-byte rules-engine witness is isolated in a lazy chunk. The release
  gate passed 28 mobile JS/data/security tests, 17 engine/WebView tests, four
  Rust provisioning/art-path tests, and three Kotlin model-lifecycle tests before the
  APK receipt was issued.
- Installation, launch, and corrected first-run provisioning are proven on the
  Pixel 10 XL. The UI reached **Offline and ready** with the rules runtime and
  knowledge pack verified using APK SHA-256
  `6fb473f476106910661b12d18164a37362f73e1c0c6c9e89014e0976bf6bc032`.
  With airplane mode enabled and no model installed, `Explain first strike`
  returned local FTS evidence and `Show CR 702.7` returned a grounded exact CR
  citation. The latter exposed that a section lookup displayed only its title.
  Commit `fa9a6e9a` now expands a numbered section into its lettered subrules and
  treats a natural-language definition as grounded only when its normalized
  terms exactly match a local CR section title. Both cases have repository and
  answer-planner regression coverage.
- `What does Omnath, Locus of Creation do?` then exposed a second deterministic
  retrieval issue: free-text FTS selected Scryfall's textless `art_series`
  record instead of the playable Oracle record, producing a duplicate name and
  `Card // Card` rather than Oracle text. This is not a model dependency. Commit
  `5e4c55cc` extracts the exact name from the natural card-question template and
  explicitly ranks playable records ahead of art-series aliases. Full-pack tests
  prove exact Omnath lookup returns the normal layout and canonical Oracle text.
  Re-installing this updated APK, the packaged Android WebView report, and
  optional model performance remain pending.
- The resumable art builder compiled 36,592 playable card/face previews from the
  pinned Oracle snapshot into art pack `327497431c01b8f8908d6700`. The images
  total 510,273,231 bytes; art-series collectibles are excluded. The manifest
  records source URL, byte count, and SHA-256 for every image. The Android build
  receipt independently opened the final APK and verified all 36,592 packaged
  entries byte-for-byte against that manifest. The WebView requests art only by
  validated Oracle UUID and bounded face index through the native bridge; no
  arbitrary resource path is accepted. The Omnath preview is included and the
  UI hides the art region cleanly when a core-only APK has no art pack.

- One chat surface.
- One Omnath persona.
- Deterministic routing, retrieval, answer plans, local model narration, and
  post-generation validation.
- Streaming response and cancellation.
- Deterministic fallback when the model cannot load or changes the answer.
- `scripts/device-verify.ps1` installs without clearing data by default,
  optionally side-loads catalogued models, launches the app, records device and
  APK receipts/logcat, fails on a dead/unfocused process or fatal exception, and
  restores airplane mode when it changed it. Destructive app-data reset is an
  explicit switch.

### Stage 5 — friend alpha

- Readable trust/recovery language, correction and answer-rating controls, and
  exportable diagnostics without private conversation leakage are implemented
  in the pre-phone slice.
- Local player preferences and limited useful memory.
- Airplane-mode regression suite and signed test APK.

### Stage 6 — small pilot

- Three to five beginner players.
- Device compatibility matrix.
- Versioned model and knowledge packs.
- Promotion gates based on grounded correctness and conversational usefulness,
  not raw native-coverage percentage.

Native coverage is intentionally a moving honesty metric, not a monotonically
increasing product KPI. Correctness fixes may lower it substantially without
removing a single playable card. Phone readiness is gated by witnessed behavior,
retrieval grounding, trust handling, and declared-device tests—not by a target
coverage percentage.

---

## 8. Acceptance laws

The phone app is not ready to hand to friends until all of these are true:

- It answers its agreed core question set without internet access.
- Card text comes only from the packaged canonical card data.
- Every displayed CR citation exists in the packaged CR corpus.
- The model cannot silently convert an untrusted answer into a trusted ruling.
- A model crash, timeout, cancellation, or unavailable model has a useful
  deterministic recovery path.
- The engine and retrieval results are reproducible outside the language model.
- The APK is tested on the declared minimum device, not only the developer PC.
- The upstream agents' live checkouts, corpus lane, and harness lane remain intact.

---

## 9. Coordination rule for every agent

Before phone work, read this file, `WAKE-REPORT.md`, `PROJECT-SCAFFOLD.md`, and
`ENGINE-SCAFFOLD.md`. Code wins when documentation drifts; update this file when
the cross-lane contract changes.

For any proposed edit under an upstream owner's list, stop and hand the
reproduction or interface request to Colton and the correct owner: Cindy for
engine/corpus, the Omnath harness agent for harness/grind/pilot/play-hints. Do
not make the edit merely because it would simplify the phone implementation.
