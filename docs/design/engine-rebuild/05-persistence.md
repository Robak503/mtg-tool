# SUBSYSTEM DESIGN 5: Persistence

I have everything I need. I've verified the real state shape, the closure blocker (`payload.onResolve` created in `actionDispatcher.js:230` and `gameEngine.js` `enqueueTrigger`/`flushTriggers`), the in-memory store, the profile-scoped path helper (`profilePath`), the goldfish records/insights/games routes, and grounded my CR citations against the actual JSON (correcting 903.14a → 903.10a/704.6c; 720 was Omen cards, not restart — restart is 727/801.17). Here is the blueprint.

---

# Subsystem 5 — PERSISTENCE + STORAGE + RECORDS + INSIGHTS (Phase 3)

## 0. Scope, grounding, and the one hard dependency

This subsystem makes learn games **survive a server restart** (save/resume), **records completed games** as durable per-profile artifacts, and **rolls those records up into "you keep missing X" insights** scoped to learn runs — then assesses whether to converge with the older goldfish `data/games/` pipeline.

Everything here is **Phase 3** and is deliberately the *last* phase because it is **gated on one hard contract from Agent 1 (Stack/effects):** the live session state is currently **not JSON-serializable**. Verified in code:

- `actionDispatcher.js:230` builds `onResolve` as a live closure: `(s) => resolveSpellEffect(s, {...})` and stores it in `stackObject.payload.onResolve`.
- `gameEngine.js` `resolveTopOfStack` (line ~329) calls `typeof top.payload?.onResolve === "function"`; `enqueueTrigger` carries `payload.onResolve` with the same contract.
- `start/route.js:105` `stripDecisionForWire` already exists *specifically because* `payload.onResolve` "don't round-trip — they live only in server memory" (its own comment). The in-memory store comment (`learnSessionStore.js:13`) explicitly defers disk persistence: "PR7+ can add disk persistence to `data/learn-sessions/` if the user wants to resume across restarts."

So: **a session with a non-empty stack or pending triggers cannot be serialized today.** Phase 3 does not fix that — Agent 1 does, by replacing closures with a **data-driven `resolverKey` + serializable `params`** dispatched through a registry. The contract I depend on and must state explicitly:

> **CONTRACT-A1 (Stack/effects serialization):** After Agent 1's refactor, every stack object and pending trigger carries a JSON-serializable descriptor — referred to here as `payload.resolverKey: string` plus `payload.params: object` (or whatever the Stack design names them) — and **no `payload.onResolve` function field exists on persisted state.** Resolution is `resolverFor(resolverKey)(state, stackObject)`, a pure lookup. The exact field name is owned by the Stack design; this design references it as `resolverKey` and **must be reconciled in synthesis.**

Phase 3 is built to **degrade gracefully before that contract lands**: it ships the storage layer, schema, atomic writer, records, and insights first (none of which need a serializable mid-game stack), and gates *only the resume-mid-game capability* behind a runtime `isSerializable(session)` guard. That means Phase 3 work can begin in parallel and the resume button "lights up" the moment Agent 1 ships, with no rework.

All file access goes through `paths.js` helpers (`profilePath`, never raw `process.cwd()`), per CLAUDE.md §8.7. No new external calls. ~1184 tests must stay green.

---

## 1. Storage model — where bytes live

Three new per-profile on-disk artifact families, all under the active profile namespace resolved by `profilePath()` (which already path-traversal-guards the id via `isValidProfileId`):

| Family | Path | Written when | Lifetime |
|---|---|---|---|
| **In-flight saves** | `profilePath("learn-sessions", "<sessionId>.json")` | autosaved after each `applyChoice` / decision settle | until resumed-to-completion, deleted, or pruned |
| **Save index** | `profilePath("learn-sessions", "index.json")` | rewritten (atomic) on every save/delete | lives with the saves |
| **Completed records** | `profilePath("learn-records", "<deckId>-<ISO>-<shortid>.json")` | once, at game-over (`status !== "active"`) | per-deck cap + age cap pruned |

`<sessionId>` is the existing `learn-<uuid12>` id from `learnSession.generateSessionId()` — already filename-safe (`[a-z0-9-]`), but **must still pass through `sanitiseId()`** before reaching `path.join` (defense in depth; the store currently trusts it).

Rationale for two directories (not reusing `games/`): the goldfish `games/` records have a *fixed, incompatible* schema (`{score, mulligans, turns:[{turn,draw,land,cast,...}]}` per `gameInsights.js` header) and a different lifecycle (one file per goldfish run, no resume). Learn records carry `outcome`, `mode`, `opponents[]`, `mistakes[]`, `difficulty`. Co-mingling them would force `gameInsights.summariseGameHistory` to discriminate, and `/api/games` GET would start returning learn rows to GarfieldPanel. **Convergence is addressed in §7 as a deliberate, later step — not a Phase-3 default.**

---

## 2. On-disk SCHEMA (saves) — exact shapes

### 2.1 Saved-session file: `learn-sessions/<id>.json`

```jsonc
{
  "schemaVersion": 1,                       // integer; bumped on any breaking shape change
  "engineVersion": "0.23.0",                // app version that wrote it (from package.json, injected)
  "kind": "learn-session-save",             // discriminator; rejects foreign files
  "savedAt": "2026-06-07T01:22:09.114Z",    // ISO; autosave timestamp
  "sessionId": "learn-3f1a9c2b4d6e",
  "session": { /* the FULL learnSession object, see 2.2 */ },
  "serializable": true,                     // result of isSerializable() at save time (see §4)
  "checksum": "sha256:9a1f…"                // sha256 of the canonical-JSON of `session` (corruption guard)
}
```

**Field types:**
- `schemaVersion: number` (currently `1`)
- `engineVersion: string`
- `kind: "learn-session-save"` (literal)
- `savedAt: string` (ISO 8601)
- `sessionId: string`
- `session: LearnSession` (§2.2)
- `serializable: boolean`
- `checksum: string` (`"sha256:" + hex`)

### 2.2 The `session` payload (mirrors `learnSession.js` exactly)

This is the existing object — no new fields invented:

```jsonc
{
  "id": "learn-3f1a9c2b4d6e",
  "createdAt": "2026-06-07T01:10:55.000Z",
  "difficulty": "beginner",                 // "beginner"|"intermediate"|"expert"
  "mode": "standard",                       // "standard"|"commander"
  "state": { /* GameState — turn, mode, activePlayer, turnOrder, priorityHolder,
                phase, step, stack[], pendingTriggers[], players{}, log[],
                combat? — exactly createGameState()'s shape */ },
  "decisionLog": [ /* { ts, turn, phase, step, actor, action, auto, reasoning } */ ],
  "status": "active",                       // active|user-wins|ai-wins|draw|abandoned
  "endedAt": "…?", "abandonReason": "…?"    // present only on terminal sessions
}
```

The **only** non-serializable bytes in this tree today are `state.stack[].payload.onResolve` and `state.pendingTriggers[].payload.onResolve` (functions silently drop to `undefined` under `JSON.stringify`, corrupting resume). CONTRACT-A1 removes them.

### 2.3 Save index: `learn-sessions/index.json`

A small denormalized listing so the list/resume UI never has to open + parse every save file:

```jsonc
{
  "schemaVersion": 1,
  "kind": "learn-session-index",
  "updatedAt": "2026-06-07T01:22:09.114Z",
  "saves": [
    {
      "sessionId": "learn-3f1a9c2b4d6e",
      "savedAt": "2026-06-07T01:22:09.114Z",
      "createdAt": "2026-06-07T01:10:55.000Z",
      "difficulty": "beginner",
      "mode": "standard",
      "status": "active",
      "turn": 4,
      "userDeckName": "Sliver Hivelord",   // captured at start (see §6.2 records-meta wiring)
      "opponentSummary": "1 opponent",      // "3 opponents (pod)" in commander
      "schemaVersion": 1,                   // schema the SAVE file was written under
      "engineVersion": "0.23.0",
      "resumable": true                     // schemaVersion === CURRENT && serializable
    }
  ]
}
```

The index is **rebuildable** from the save files (it's a cache): a `rebuildIndex()` helper scans the dir and regenerates it, used on corruption-detected or as a self-heal on list.

---

## 3. Forward-migration strategy (the engine shape WILL change)

The mandate is explicit: Phase 1/2 change `state` shape (data-driven stack, layers/613 continuous effects, counters, tokens). A save written under Phase-1 shape must not silently load into a Phase-2 engine and corrupt a game. Strategy:

**Single integer `schemaVersion`, additive migrations, fail-closed on unknown.**

- `CURRENT_SCHEMA_VERSION = 1` constant in a new `learnSaveSchema.js`.
- A `MIGRATIONS` ordered map: `{ [fromVersion]: (saveDoc) => saveDoc }`. Each entry upgrades exactly one version (`1→2`, `2→3`). `migrate(saveDoc)` applies them in sequence until `schemaVersion === CURRENT`.
- **Migrations are pure and total**: given a valid vN doc, return a valid v(N+1) doc, or throw a typed `SaveMigrationError` if the doc can't be carried forward (e.g. a removed field with no sensible default). The UI treats unmigratable saves as **"archived — not resumable"**, not as data loss: the file stays on disk; only the resume button is disabled, with copy ("This game was saved on an older version and can't be continued. Start a new game.").
- **No down-migration.** A save from a *newer* schema than the running app (possible if the user downgrades) is flagged `resumable:false` with reason `"future-schema"`. Never attempted.

This mirrors the `version` field already used in `decks.local.json` and the profiles registry (`{version:1}`), so it's idiomatic to the codebase.

**Migration authoring discipline (the part that keeps the suite green across phases):** when Agent 1 or Agent 2 changes the `state` shape, the *same* PR that lands the shape change must add the corresponding `MIGRATIONS[N]` entry and a fixture test. The PR breakdown (§9) makes the migration harness exist *before* those phases land so there's a home for it — but the migration *entries themselves* are authored by whoever changes the shape. This is the cross-phase contract:

> **CONTRACT-MIG:** Any phase that changes the persisted `state` shape bumps `CURRENT_SCHEMA_VERSION` and adds a `MIGRATIONS[oldVersion]` entry + a `fixtures/save-v<old>.json` round-trip test. The persistence subsystem owns the harness; the shape-changer owns the entry.

---

## 4. The resumability guard (the A1 dependency, made concrete)

A new pure predicate in `learnSaveSchema.js`:

```js
/**
 * Can this live session be serialized to disk losslessly AND read back?
 * Pre-A1: any stack object / pending trigger carrying a function payload
 * (the onResolve closure) is NOT serializable — saving it would drop the
 * resolver and corrupt resume. Post-A1 (resolverKey contract) this always
 * returns true for in-progress games.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isSerializable(session) { … }
```

Implementation (works in BOTH worlds, no rework when A1 lands):

1. Walk `session.state.stack` and `session.state.pendingTriggers`.
2. If any element has a `payload` where `typeof payload.onResolve === "function"` → `{ ok:false, reason:"live-closure-on-stack" }`. (This branch goes dead — but harmlessly — once A1 removes the field.)
3. Belt-and-suspenders: `JSON.stringify(session)` then a structural `containsFunction()` deep-scan of the *parsed-back* object differing from the original by any dropped key → `{ ok:false, reason:"non-serializable-field" }`. This catches any *future* accidental closure regression anywhere in state, not just the known sites.
4. Else `{ ok:true }`.

**Behavioral contract before A1 lands:** Autosave still *runs* every turn, but for a session that fails `isSerializable` (stack mid-resolution), it writes the save with `serializable:false` and the index marks `resumable:false`. In practice the autosave cadence (§5) fires at **decision boundaries**, where the stack is empty and priority is being passed — so even pre-A1, the *vast majority* of saves are serializable (you can resume "it's your turn, what do you play?" but not "mid-trigger-resolution"). After A1, `serializable` is always true and the distinction disappears. This is why Phase 3 delivers real value *before* Phase 1 fully lands, and full value after.

> **CONTRACT-A1-CHECK:** synthesis must confirm the autosave hook fires only at decision settle points (post-`advanceUntilDecision` return), where `state.stack.length === 0` for the common path. If Agent 1's design keeps the stack non-empty at decision boundaries (e.g. holding-priority prompts with objects on the stack), the pre-A1 resume coverage shrinks to "empty-stack turns only" — still correct, just less. No code change needed either way; flag for expectations alignment.

---

## 5. Autosave cadence + atomic writes

### 5.1 Where the autosave fires

The cleanest seam is **the route layer, not the pure session layer** — `learnSession.js` must stay fetch-free/fs-free (its own header guarantees "Pure: no fetches"). So:

- `start/route.js` and `step/route.js` already call `putSession(...)` (in-memory). Immediately after each `putSession`, call a new **`autosaveSession(session)`** from a new server module `learnSaveStore.js`.
- Autosave is **fire-and-forget, never blocks the response** (mirrors the `pruneGames().catch(()=>{})` pattern already in `/api/games`): `autosaveSession(session).catch(() => {})`. A failed autosave must never 500 a playable game.
- Cadence = **once per HTTP transition** (every `start`, every `step`). That's "after each `applyChoice`/decision" as specified. No timer, no debounce needed — turns are user-paced.
- On **game over** (`isComplete(session)`): `step/route.js` already calls `deleteSession(sessionId)` (in-memory). We add: write the **completed record** (§6), then **delete the in-flight save file** (the game is no longer resumable; it's a record now). Both via `learnSaveStore`/`learnRecordStore`, both `.catch`-guarded.

### 5.2 Atomic write (reuse the proven pattern)

`/api/games` already has the exact-right primitive (`atomicWriteJson`: write `.tmp.<pid>.<ts>` then `fs.rename`). Extract it to a shared **`app/src/lib/server/atomicJson.js`**:

```js
export async function atomicWriteJson(filePath, payload) { /* tmp + rename, mkdir -p parent */ }
export async function readJsonSafe(filePath) { /* returns null on ENOENT/parse error */ }
```

Then `/api/games` imports it (no behavior change — pure refactor with the existing test still green), and the new learn stores use it too. `fs.rename` on the same volume is atomic on NTFS, so a crash mid-write leaves either the old good file or the new good file, never a torn one. The `.tmp` files are already excluded by the `endsWith(".tmp.json")` filters — keep that convention.

### 5.3 Checksum

`atomicWriteJson` for saves computes `sha256(canonicalJson(session))` and embeds it (§2.1). On read, `loadSave()` recomputes and on mismatch returns `{ ok:false, reason:"checksum" }` → treated as corrupt (file quarantined to `<id>.json.corrupt-<ts>`, never auto-resumed). Uses `node:crypto` (already imported in `profiles.js`), zero new deps.

---

## 6. Completed-game RECORDS

### 6.1 Record file: `learn-records/<deckId>-<ISO>-<shortid>.json`

```jsonc
{
  "schemaVersion": 1,
  "kind": "learn-record",
  "recordedAt": "2026-06-07T01:40:12.000Z",
  "sessionId": "learn-3f1a9c2b4d6e",
  "deckId": "sliver-hivelord",            // sanitiseId'd; from userDeck.id at start
  "deckName": "Sliver Hivelord",
  "mode": "standard",                      // standard|commander
  "format": "standard",                    // detectDeckFormat output (lib/learn/formatDetection.js)
  "difficulty": "beginner",
  "outcome": "user-wins",                  // user-wins|ai-wins|draw|abandoned
  "outcomeReason": "opponent-eliminated",  // from decision.reason / status
  "turns": 9,                              // state.turn at end
  "startedAt": "2026-06-07T01:10:55.000Z",
  "endedAt":   "2026-06-07T01:40:12.000Z",
  "durationMs": 1757000,
  "opponents": [                           // 1 row (standard) or 3 (commander pod)
    { "id": "ai",  "deckName": "Goblin Aggro", "eliminatedOnTurn": 9, "finalLife": -2 }
  ],
  "mistakes": [ /* see 6.3 */ ],
  "stats": {                               // cheap rollups derived from decisionLog
    "userDecisions": 24,                   // decisionLog entries with auto:false
    "autoDecisions": 310,
    "manualPasses": 6,
    "mulligans": 0,                        // from player.hasMulliganed / decisionLog
    "spellsCast": 18,
    "landsPlayed": 9
  }
}
```

All fields are **derived from data already in the terminal session** (`session.state`, `session.decisionLog`, `session.status`) plus deck metadata captured at start (§6.2). Nothing fabricated, nothing from card memory.

### 6.2 Capturing deck metadata at start

`createLearnSession` today takes raw card arrays (`userDeck: Card[]`), **not** deck objects with `id`/`name`. So the record's `deckId`/`deckName` aren't currently reachable from the session. Two options; I recommend **(B)** as the minimal, contained change:

- **(A)** Thread deck ids through `createLearnSession`. Rejected: touches the pure session API and its ~357 tests for a persistence concern.
- **(B) ✅** Capture meta at the **route boundary**. `start/route.js` already receives the request body; extend its body to optionally accept `userDeckId`, `userDeckName`, `opponentDeckNames[]` (the client `useLearnSession.start` and `LearnView` know these — they fetched the deck to get its cards). Store them on the session as a **new top-level `session.meta` field** (`{ userDeckId, userDeckName, opponentNames[] }`) added *after* `createLearnSession` returns, before `putSession`. `meta` is plain data → serializes for free, ignored by the pure engine. The record builder reads `session.meta`.

`session.meta` is **purely additive** to the session shape: the engine never reads it, every existing test that constructs sessions without it keeps passing (`meta` is `undefined` → record falls back to `deckId:"unknown"`, exactly like `/api/games` already does).

### 6.3 Mistakes — what they are and where they come from

A "mistake" is a structured, **engine-grounded** observation (never an LLM hallucination). Source: the `intermediate`/`expert` difficulty machinery already emits trap/warning decisions (CLAUDE.md §9: "Intermediate trap warnings"; `decisionGate.makeDecision`). Phase 3 does **not** invent a mistake-detector; it **captures** the ones the difficulty layer already produces:

```jsonc
{
  "turn": 5, "phase": "combat", "step": "declare-attackers",
  "kind": "trap-warning",            // taxonomy below
  "detail": "Attacked into open mana with a removal-vulnerable threat",
  "ruleRef": "509.1a",               // optional, only when the source supplied a verified CR cite
  "overridden": true                 // user proceeded despite the warning
}
```

Taxonomy (closed set, extensible): `trap-warning` (declared attack/block the warner flagged), `missed-land-drop` (turn ended with a land in hand and a land drop available — derivable from `decisionLog`), `mana-floated-wasted` (mana pool emptied non-empty at step end — derivable from the engine's CR 500.4 emptying hook the playable-engine doc references), `concede-early` (abandoned before turn 4).

**Capture mechanism:** `applyChoice` in `learnSession.js` *already* logs every user action with `decision.metadata?.reasoning`. We extend the route-side record builder to scan `session.decisionLog` for entries whose `action` was taken *after* a `trap-warning` decision was shown. To make that traceable without changing the pure engine, the **decision object's warning metadata is persisted into the logEntry** — a *one-line additive* change in `learnSession.applyChoice`/`advanceUntilDecision`: when `decision.metadata?.warning` exists, copy it onto the appended `logEntry.warning`. This is additive (existing entries simply lack `.warning`), so no existing assertion breaks. Mistakes are then a pure derivation over `decisionLog` in `learnRecord.js`.

> **CONTRACT-DG (decisionGate):** the mistake taxonomy assumes Agent (decisionGate/difficulty) surfaces warnings as `decision.metadata.warning = { kind, detail, ruleRef? }`. If the difficulty subsystem names this differently, the field mapping in `learnRecord.deriveMistakes()` reconciles in synthesis. **No CR number is ever written unless the warning supplied one** (no fabrication).

### 6.4 Record retention / pruning

Reuse `/api/games`' two-cap model exactly: per-deck cap (`MAX_LEARN_RECORDS_PER_DECK`, default 200) + age cap (`MAX_LEARN_RECORDS_DAYS`, default 365), both `envNumber`-overridable. Prune runs background-after-write, `.catch`-guarded. Saves (in-flight) prune differently: cap total in-flight saves per profile (`MAX_LEARN_SAVES`, default 20 — these are big; the goldfish in-memory store already caps at 50 and warns state is large) and drop the **oldest by `savedAt`** beyond the cap. A resumable save older than `MAX_LEARN_SAVE_AGE_DAYS` (default 30) is pruned — stale mid-games go cold.

---

## 7. INSIGHTS — learn-scoped rollups + goldfish convergence

### 7.1 The rollup

New pure module **`app/src/lib/learn/learnInsights.js`**, the learn analogue of `gameInsights.js` (data-in/data-out, no fs/fetch, so it runs server-side in a route, client-side in `LearnView`, or in an agent context-builder — same three-context guarantee `gameInsights` makes):

```js
/** @param {LearnRecord[]} records  @returns {LearnInsights} */
export function summariseLearnHistory(records) { … }
/** Compact one-paragraph LLM-prompt string; "" when count < 2 (mirrors formatInsightsForAgent). */
export function formatLearnInsightsForAgent(insights) { … }
```

`LearnInsights` output shape:

```jsonc
{
  "count": 12,
  "scope": { "deckId": "sliver-hivelord", "format": "standard" },  // null deckId = all decks
  "outcomes": { "winRate": 42, "lossRate": 50, "drawRate": 8, "abandonRate": 25 },
  "byDifficulty": { "beginner": {games:8, winRate:62}, "intermediate": {...}, "expert": {...} },
  "pacing": { "avgTurns": 11, "avgDurationMin": 23 },
  "mistakePatterns": [          // THE "you keep missing X"
    { "kind": "missed-land-drop", "count": 7, "rate": 58,
      "message": "You ended your turn with a land in hand in 58% of games — play your land first." },
    { "kind": "trap-warning",    "count": 5, "rate": 42,
      "message": "You attacked into open mana 5 times despite the warning." }
  ],
  "abandonPatterns": {          // abandon-behavior analysis (spec: "abandon patterns")
    "rate": 25, "medianAbandonTurn": 3,
    "message": "You quit a quarter of games, usually by turn 3 — try playing past the early game."
  },
  "strongSignals": [ "Strong win rate at Beginner (62%) — ready to try Intermediate." ]
}
```

`mistakePatterns` is a frequency rollup over every record's `mistakes[]`, ranked by rate — this is literally "you keep missing X." `abandonPatterns` answers the spec's "abandon patterns" directly from `outcome:"abandoned"` records' end-turn. Format-scoped because the spec says "per-format" — the caller passes a `format` filter; rollup partitions records by `record.format`.

### 7.2 Convergence with the goldfish `data/games/` pipeline (the assessment)

**My recommendation: keep them separate now; converge the *reader contract*, not the *storage*, later.** Reasoning grounded in the code:

- The two record schemas are genuinely different artifacts. Goldfish (`gameInsights.js` header) is a *solo deck-pacing* record: `{score, mulligans, openingHand, turns:[{turn,draw,land,cast,mana,handSize}]}` — no opponent, no outcome, no difficulty. Learn is a *vs-AI outcome* record: `{outcome, opponents[], difficulty, mistakes[]}`. Forcing one schema would either bloat goldfish rows with empty opponent/outcome fields or strip learn's outcome semantics.
- `/api/games` GET feeds **GarfieldPanel + the agent deck-context-builder** (`games-summary` route). If learn records landed in `games/`, those goldfish-shaped consumers would suddenly see rows where `score`/`turns[]` are absent → `summariseGameHistory` produces garbage pacing (it reads `run.summary` regex + `turns[]`). That's a regression in a shipped feature.

**The convergence the owner actually wants** ("the engine eventually serves playtesting too") is achieved by making the *learn engine* able to **emit goldfish-shaped pacing records** when run in goldfish mode — i.e. the learn engine becomes the simulator backend, and a thin adapter `learnRecordToGoldfishRow(record)` projects a completed learn record (specifically a solo/goldfish-configured run) into the existing `games/` row shape so it flows through the *existing* `gameInsights` pipeline unchanged. That's an **adapter, not a merge** — the playtesting convergence point, deferred to a clearly-marked Phase 3 sub-PR (§9, PR P3.7) and explicitly optional. Until then, learn insights live in their own namespace and read cleanly.

This keeps the two pipelines independently green and gives a single, low-risk seam (`learnRecordToGoldfishRow`) for the future when goldfishing rides the real engine.

---

## 8. API + UI contracts

### 8.1 New routes (vs. extending `step`)

I extend `step`/`start` only with the *autosave side-effect* (transparent, no new request fields except the optional `userDeckId`/`userDeckName`/`opponentDeckNames` on `start`). Everything user-facing for save management goes in **new routes**, because list/resume/delete are distinct verbs with distinct shapes and overloading `step` (which means "apply a game choice") would be a category error:

| Route | Method | Body / Query | Returns |
|---|---|---|---|
| `/api/learn/saves` | `GET` | — | `{ saves: SaveIndexEntry[] }` (from `index.json`, self-healing) |
| `/api/learn/resume` | `POST` | `{ sessionId }` | `{ sessionId, decision, status, turn, activePlayer, step, table }` — **same envelope as `/api/learn/start`** so the client reuses one code path |
| `/api/learn/saves/delete` | `POST` | `{ sessionId }` | `{ ok: true }` |
| `/api/learn/records` | `GET` | `?deckId=&format=&limit=` | `{ records: LearnRecord[], count, returned }` (mirrors `/api/games` GET) |
| `/api/learn/insights` | `GET` | `?deckId=&format=` | `LearnInsights` (mirrors `/api/games-summary`) |

(Folder note: Next route segments can't contain a dynamic verb cleanly under `saves`; if `saves/delete` is awkward, use `/api/learn/saves` `POST {op:"delete", sessionId}` — synthesis picks one. I prefer distinct files for testability.)

**`/api/learn/resume` flow:**
1. `loadSave(sessionId)` → `{ ok, saveDoc, reason? }`. On `!ok` (missing/corrupt/checksum) → 404/422 with the reason.
2. `migrate(saveDoc)` → throws `SaveMigrationError` → 422 `{ error, resumable:false, reason:"unmigratable" }`.
3. Guard: `saveDoc.serializable === false` → 422 `{ error:"This game can't be resumed (it was saved mid-resolution).", resumable:false }`. (Post-A1 this never triggers.)
4. `verifyChecksum` → on mismatch quarantine + 422.
5. `putSession(saveDoc.session)` (re-hydrate into the in-memory store), then `advanceUntilDecision(session)` to recompute the current prompt, then respond with the `start`-shaped envelope. **Resume re-derives the decision rather than persisting it** — decisions hold the (formerly) non-serializable option closures; recomputing is both safer and free.

### 8.2 UI contract (`LearnView.jsx` + `useLearnSession.js`)

`useLearnSession` gains:
- `listSaves(): Promise<SaveIndexEntry[]>`
- `resume(sessionId): Promise<decision>` — sets the same hook state shape `start` does (reuses the `next` builder).
- `deleteSave(sessionId): Promise<boolean>`
- New status value: existing `status` enum (`idle→starting→active→ended→error`) is unchanged; resume routes through `starting→active`.

`LearnView` gains a **"Continue a game"** section on the learn home screen: lists `SaveIndexEntry` rows (deck name, mode, turn N, difficulty, "saved 5m ago"), with **Resume** (disabled + tooltip when `resumable:false`) and **Delete** per row. A **post-game screen** shows the just-written `LearnRecord` (outcome, turns, mistakes list) and a **"Your patterns"** panel rendering `summariseLearnHistory` for that deck — the "you keep missing X" surface.

> **CONTRACT-UI:** `LearnView` already passes `userDeck` card arrays to `start`. For records to carry `deckId`/`deckName`, `LearnView` must also pass `userDeckId`/`userDeckName`/`opponentDeckNames` into `start` (it has the deck objects in scope when it builds the card arrays). This is the only UI-side data-plumbing change records depend on.

---

## 9. TDD sub-PR breakdown (each independently shippable, suite stays green)

Ordered so nothing depends on un-landed work, and the **storage value ships before A1**:

- **P3.1 — `atomicJson.js` extraction (pure refactor).** Move `atomicWriteJson` + add `readJsonSafe` to `app/src/lib/server/atomicJson.js`. Repoint `/api/games`. *Tests:* new `atomicJson.test.js` (tmp+rename, ENOSPC bubble, ENOENT→null); existing `/api/games` tests unchanged and green. **No new behavior.**
- **P3.2 — Save schema + migration harness + `isSerializable`.** New `app/src/lib/learn/learnSaveSchema.js`: `CURRENT_SCHEMA_VERSION`, `MIGRATIONS` (empty for v1), `migrate()`, `isSerializable()`, `verifyChecksum()`, `canonicalJson()`. Pure, no fs. *Tests:* `learnSaveSchema.test.js` — v1 round-trips; an unknown-version doc → `SaveMigrationError`; a session carrying a fake `payload.onResolve` fn → `isSerializable.ok === false`; a clean session → true. **Pure module; zero integration risk.**
- **P3.3 — `learnSaveStore.js` (server fs).** `autosaveSession`, `loadSave`, `listSaves`, `deleteSave`, `rebuildIndex`, `pruneSaves`. Uses `profilePath("learn-sessions", …)` + `atomicJson` + `sanitiseId`. *Tests:* `learnSaveStore.test.js` under `process.chdir(tmpdir)` (the established test idiom — paths.js falls back to cwd when env unset): save→load round-trip, index stays consistent, corrupt file quarantined, prune respects caps, malformed id rejected.
- **P3.4 — Wire autosave into `start`/`step` routes + `session.meta`.** Add `userDeckId`/`userDeckName`/`opponentDeckNames` to `start` body; attach `session.meta`; `autosaveSession(...).catch()` after each `putSession`. *Tests:* extend `learn.test.js` — after a `start`, a save file exists and `listSaves` returns it; autosave failure (mock fs throw) does **not** fail the response. Existing `learn.test.js` assertions unchanged (new fields optional).
- **P3.5 — `/api/learn/saves` + `/api/learn/resume` + `/api/learn/saves/delete` routes.** Resume re-hydrates + `advanceUntilDecision`. *Tests:* route tests — start→(simulate restart by clearing in-memory store via `resetStore`)→resume→same `turn`; resume of a `serializable:false` save → 422; resume of a missing id → 404. **This is the headline capability; before A1 it resumes empty-stack turns, after A1 it resumes everything — same code.**
- **P3.6 — `learnRecord.js` + record store + `/api/learn/records` route.** `buildRecord(session)`, `deriveMistakes(decisionLog)`, `deriveStats(decisionLog)`; `learnRecordStore` (write/list/prune via `atomicJson`). Wire record-write + in-flight-save-delete into `step` route at game-over. *Tests:* terminal session → record with correct `outcome`/`turns`/`mistakes`; mistake derivation from a crafted `decisionLog` with a `warning` entry; prune caps; game-over deletes the in-flight save.
- **P3.7 — `learnInsights.js` + `/api/learn/insights` route + UI.** `summariseLearnHistory`, `formatLearnInsightsForAgent`; route mirrors `games-summary`; `useLearnSession.listSaves/resume/deleteSave`; `LearnView` Continue-a-game + post-game patterns panel. *Tests:* `learnInsights.test.js` (mistake-pattern rollup, abandon pattern, empty→`{count:0}`); hook + route smoke tests (import-smoke per gotcha #10).
- **P3.8 (optional, deferred) — goldfish convergence adapter.** `learnRecordToGoldfishRow(record)` + opt-in path to emit a goldfish row for solo runs. *Tests:* adapter produces a `gameInsights`-valid row; `summariseGameHistory` consumes it without error. **Ships only if/when goldfishing is moved onto the real engine.**

Each PR keeps the suite green because: P3.1 is behavior-preserving; P3.2/P3.7-insights are pure additions; P3.3/P3.6-stores are new files with new tests; P3.4/P3.5 add *optional* fields and *new* routes without altering existing route contracts.

---

## 10. Test plan

**New test files:** `atomicJson.test.js`, `learnSaveSchema.test.js`, `learnSaveStore.test.js`, `learnRecord.test.js`, `learnInsights.test.js`, route tests for `saves`/`resume`/`saves-delete`/`records`/`insights`, plus `fixtures/save-v1.json` (and `save-v2.json` etc. as schema bumps land).

**Fixtures that must exist before Phase 1/2:** a committed `fixtures/save-v1.json` so that when Agent 1 bumps the schema, the migration test for `1→2` has a real prior-shape input to upgrade — proving migrations work against *actual* old shapes, not synthetic ones.

**Existing tests that shift (and why):**
- `app/src/app/api/games/route.test.js` (if present) — only if `atomicWriteJson` extraction changes an import path; assertions unchanged. Confirm during P3.1.
- `learn.test.js` — gains assertions for autosave side-effects; **existing assertions are not modified** (autosave is additive, fields optional). If any existing test asserts the *exact* set of files in the profile dir, it shifts to allow the new `learn-sessions/` dir — flagged for P3.4.
- `learnSession` tests — **unchanged.** `session.meta` is attached at the route layer, never in the pure factory, so the ~357 learn-engine cases that call `createLearnSession` directly never see it.

**Cross-phase test obligation (CONTRACT-MIG):** every Phase-1/2 PR that mutates `state` shape adds a `MIGRATIONS[N]` entry + a `save-v<N>.json` fixture round-trip test in *its own* PR. The persistence harness from P3.2 is the landing pad.

---

## 11. CR citations (verified against `knowledge/mtg-judge/data/cr/cr_current.json`)

These ground the **records/outcomes semantics** the persistence layer captures (it does not invent rules; it labels game-over states the engine already reaches):

- **104.1** — "A game ends immediately when a player wins, when the game is a draw, or when the game is restarted." → defines the terminal states a `LearnRecord.outcome` enumerates.
- **104.2a** — "A player still in the game wins the game if that player's opponents have all left the game." → `outcome:"user-wins"` (matches `recordOutcomeIfChanged`'s all-opponents-dead branch).
- **104.3** / **104.3b** — ways to lose / life ≤ 0 loses. → `outcome:"ai-wins"`.
- **104.3a** — concede leaves immediately. → maps to `outcome:"abandoned"` (user-initiated exit).
- **104.4a** — "If all the players remaining in a game lose simultaneously, the game is a draw." → `outcome:"draw"` (matches the simultaneous-death branch in `learnSession.recordOutcomeIfChanged`).
- **104.5** — a losing player leaves the game. → opponent `eliminatedOnTurn` capture.
- **800.4a** — when a player leaves, their objects leave with them. → grounds the per-opponent record rows in Commander pods (`removePlayerFromGame`).
- **704.6c** / **903.10a** — Commander 21-combat-damage state-based loss. → commander-damage outcome reason. **(Corrects a stale comment in `learnSession.js:150` that cites `903.14a`, which does not exist in the current CR — flagged in Risks; the real rule is 903.10a / 704.6c.)**
- **727.1 / 727.2** and **801.17** — game *restart* (Karn Liberated) is a distinct terminal cause; recorded as such if/when the engine supports it (out of current scope, but the `outcomeReason` enum reserves `"restart"` so the schema doesn't need bumping later).

*(I explicitly did NOT cite a "save/load" rule — Magic's CR has no concept of mid-game serialization; that's an engine-implementation concern, so no fabricated rule is attached to the save mechanism itself.)*

---

## 12. RISKS

1. **HARD DEP on CONTRACT-A1 (resolverKey).** Until Agent 1 removes `payload.onResolve` closures, mid-resolution saves are non-serializable. *Mitigation:* `isSerializable` guard + autosave-at-decision-boundaries means we still resume the common case (empty-stack turns) pre-A1, and gain full coverage post-A1 with zero rework. **The exact field name (`resolverKey`/`params`) is owned by the Stack design and MUST be reconciled in synthesis.**
2. **Schema drift vs in-flight saves.** A save written under Phase-1 shape loaded by Phase-2 engine. *Mitigation:* `schemaVersion` + fail-closed `migrate()` + the CONTRACT-MIG obligation that shape-changers ship their migration entry + fixture in the same PR. Unmigratable saves are disabled (`resumable:false`), never silently corrupted.
3. **Corruption (crash mid-write, AV/indexer lock).** *Mitigation:* atomic tmp+rename (proven in `/api/games`), sha256 checksum verify on load, quarantine-on-mismatch. Windows file-lock races already bite this repo (see `cleanupLegacyFlatDecks` in `profiles.js`); autosave `.catch`-swallows lock failures and retries next turn — a failed autosave never breaks the live game.
4. **Large state size.** `learnSessionStore.js:8` already flags GameState as "large (full 100-card library × per-permanent state)." A Commander 4P save is ~4× a Standard one. *Mitigation:* per-profile save cap (default 20) + age prune (30d); records are far smaller (derived stats, not full state). If profiling shows save files are heavy, a follow-up can gzip the `session` blob behind the same atomic writer — schema field `"encoding":"gzip"` reserved. Not done in v1 (no new dep, premature).
5. **Profile-scoping correctness.** Saves/records resolve via `profilePath`, which falls back to flat `data/` *before* the registry exists (pre-migration window). *Mitigation:* `profilePath` already guards traversal via `isValidProfileId`; saves written in the pre-registry window land in flat `data/learn-sessions/` and are **not** swept by `profiles.ensureMigrated` (which only knows `PER_PROFILE_DIRS = ["games","backups"]`). **Flag:** add `"learn-sessions"` and `"learn-records"` to `PER_PROFILE_DIRS` in `profiles.js` so a save created in that narrow window migrates into the primary profile instead of orphaning at the data root. This is a one-line addition to an existing array — but it's a **cross-subsystem edit to `profiles.js`** and must be called out in synthesis.
6. **Goldfish convergence temptation.** Merging learn records into `data/games/` would regress GarfieldPanel + the agent context-builder (they read goldfish-shaped rows via `summariseGameHistory`). *Mitigation:* keep namespaces separate; converge via the explicit `learnRecordToGoldfishRow` adapter only (P3.8), never by co-mingling storage.
7. **Stale CR comment in code.** `learnSession.js` cites `903.14a` for commander damage; that rule number does not exist in the current CR. The real rule is **903.10a / 704.6c**. Not a persistence bug, but the record layer references commander-damage outcomes — flagged so the citation isn't propagated. *(Worth a tiny follow-up fix to the comment; out of scope for this design but noted.)*
8. **Resume recomputes decisions.** Because decision option payloads can carry closures (pre-A1), `/api/learn/resume` re-runs `advanceUntilDecision` rather than persisting the last decision. Risk: if the engine is nondeterministic across versions, the recomputed prompt could differ from the one the user last saw. *Mitigation:* the engine is pure/deterministic given state (verified — all helpers are pure), so recomputation is stable for a given `schemaVersion`; cross-version drift is exactly what the migration gate blocks.

---

### Cross-subsystem contracts to reconcile in synthesis (summary)
- **CONTRACT-A1** — serializable stack/trigger descriptor (`resolverKey`+`params`, no `onResolve` fn). Field name owned by Stack design. *Resume depends on this for full coverage.*
- **CONTRACT-A1-CHECK** — autosave fires at decision-settle points; confirm stack is empty there in the common path.
- **CONTRACT-MIG** — shape-changing phases ship their `MIGRATIONS[N]` entry + `save-v<N>.json` fixture.
- **CONTRACT-DG** — decisionGate surfaces warnings as `decision.metadata.warning = {kind, detail, ruleRef?}`; mistakes derive from these. No CR number written unless supplied.
- **CONTRACT-UI** — `LearnView` passes `userDeckId`/`userDeckName`/`opponentDeckNames` into `start` so records carry deck identity.
- **profiles.js edit** — add `"learn-sessions"`/`"learn-records"` to `PER_PROFILE_DIRS` (Risk 5).

**Relevant files (absolute):** `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\src\lib\server\paths.js`, `…\app\src\lib\server\profiles.js`, `…\app\src\lib\server\learnSessionStore.js`, `…\app\src\lib\learn\learnSession.js`, `…\app\src\lib\learn\gameState.js`, `…\app\src\lib\learn\actionDispatcher.js` (line 230 closure), `…\app\src\lib\learn\gameEngine.js` (resolveTopOfStack/enqueueTrigger), `…\app\src\app\api\learn\start\route.js`, `…\app\src\app\api\learn\step\route.js`, `…\app\src\app\api\games\route.js`, `…\app\src\app\api\games-summary\route.js`, `…\app\src\lib\gameInsights.js`, `…\app\src\lib\learn\tableSnapshot.js`, `…\app\src\lib\server\sanitiseId.js`, `…\app\src\hooks\useLearnSession.js`, `…\app\src\components\mtg\LearnView.jsx`. CR source: `…\knowledge\mtg-judge\data\cr\cr_current.json`.