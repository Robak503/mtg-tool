# PLAY-API CONTRACT — the engine↔Omnath seams (v1, locked 2026-07-01)

> The written contract for every seam the Omnath brain consumes from the engine. Owned by
> Clyde (engine side); consumed by omnath-tools (pilots, engine.mjs gate, the case store).
> **Change discipline:** breaking any surface below bumps the relevant MAJOR version and is
> posted to `memory/COMMS.md` BEFORE it ships in a release. Additive fields/exports are MINOR
> and safe for consumers to ignore. §5 codifies exactly what bumps what. The engine-side
> tripwire is `app/src/lib/learn/omnathSeam.test.js` — it runs in every full gate, so churn
> that would break Omnath's tools fails Clyde's build first.

---

## 1. The play-API (`app/src/lib/learn/gameApi.js`) — `PLAY_API_VERSION = "1.2.0"`

> **v1.2.x doc wave (2026-07-03 — lane E, PS-1/PS-5/PS-6/PS-7):** no runtime change. The doc
> now enumerates the REAL 20-kind decision vocabulary (§1.1a — the old "13" was doc drift),
> documents `metadata.suggestion`, the answering-seat derivation, and the `session.status`
> vocabulary (§1.1b/§1.1c), adds `lookupCard`/`lookupRulingsForCard` to the §2 table, and
> writes the §5 versioning discipline.

> **v1.2.0 (additive MINOR, 2026-07-03 — SD-5/PS-4, the session-layer policy A/B seam):**
> - `createGame` gained the optional **`policy`** option — the opponentAI A/B knob
>   (`null | "v1" | { land|block|attack|xSizing|counter: "v1" }`; see
>   `opponentAI.normalizePolicy`). It rides `session.playOpts.policy`, is merged into every
>   `nextDecision`/`act` advance (explicit per-call `opts.policy` wins, mirroring `decide`),
>   and reaches `pickAction`/`pickAttackPlan`/`pickBlockPlan` on every AI-auto-picked
>   decision — so pilots can drive old-vs-new policy probes through THIS seam
>   (`lab.mjs cmdVsDefault`-style old-policy baselines are now session-drivable).
>   `runSelfPlayGame`/`runSelfPlayBatch` grew the same `policy` passthrough. Single knob,
>   whole game — per-seat policy is out of v1.x scope (a v1.2+ additive if pods need mixing).
>   GUARD (THE CREED): policy only ever RE-RANKS actions already offered by legalChoices —
>   it never gates legality. Default `null` ⇒ byte-identical play (trajectory-hash-stable).

> **v1.1.0 (additive MINOR, 2026-07-03 — the instrumentation-threading wave):**
> - `act(session, decision, answer, opts = {})` grew an optional trailing `opts` bag — the
>   same `{ decide, pilot, recordDecision, timePressure, onTurnStart }` seam `nextDecision`
>   takes. It is threaded through every settler's internal re-advance, so a caller-driven
>   drive loop stays instrumented PAST the first `act()` (previously: engine-auto segments
>   initiated by `act()` ran default policy, unrecorded, clockless). Omitted ⇒ byte-identical
>   to v1.0.0.
> - `createGame` now HONORS the `pilots:` option documented below (previously it was silently
>   dropped — only `runSelfPlayBatch` honored it). Pilots are compiled into a per-seat router
>   stored as `session.playOpts.decide`, merged into every `nextDecision`/`act` advance;
>   **explicit per-call `opts.decide` wins** (nextDecision-opts drivers are unaffected). A
>   `decideMulligan` on any seat auto-builds the mulligan config unless the caller passed
>   `mulligan` themselves. **Malformed `pilots` THROW** (never silently default-AI). A pilots
>   session holds live closures → it is driver-memory-only (rejected by `isSerializable`).
> - Instrumented advances (timePressure and/or onTurnStart active) stamp `state.observedTurn`
>   (additive state field; save-schema v5, stamp-only migration) so a re-entrant advance never
>   re-fires the turn-boundary clock/observer within the same turn. Uninstrumented advances
>   write no such field.

### 1.1 The session layer (v1 — drives a COMPLETE game, pendings included)

```js
import { createGame, nextDecision, act, gameStatus, PLAY_API_VERSION }
  from "<app>/src/lib/learn/gameApi.js";

let { session, decision } = nextDecision(createGame({
  userDeck, opponentDeck /* 1v1 */ , // or opponentDecks: [d1,d2,d3] + mode:"commander"
  mode: "standard" | "commander",
  difficulty: "beginner" | "intermediate" | "expert",
  userCommanders, opponentCommanders,        // commander mode
  pilots: { [seat]: { decide, decideMulligan?, playbook?, temperament? } }, // the locked decide contract
  policy: null | "v1" | { /* per-subsystem */ },  // v1.2.0 — the opponentAI old-vs-new A/B seam
}));
while (decision.kind !== "game-over") {
  const answer = myPilot(decision);          // ∈ decision.options (ask) / per-kind shape (§1.1a)
  ({ session, decision } = act(session, decision, answer));
}
const verdict = gameStatus(session.state);   // { over, result, winnerSeat, reason }
```

- `nextDecision(session, opts)` — advances through SBAs, eliminations, AI seats, trigger
  flushes, and pending-settlement to the next decision (or game over). `opts` passes through
  to the driver: `{ decide, pilot, recordDecision, timePressure }` — the self-play
  instrumentation seam.
- `act(session, decision, answer, opts?)` routes by `decision.kind` and ALWAYS returns
  `{ session, decision }`. `opts` (v1.1.0) is the same instrumentation bag `nextDecision`
  takes, threaded through the settlers' internal re-advances; omit it for the v1.0.0
  behavior:

| decision.kind | answer | routing |
|---|---|---|
| `"ask"` | one of `decision.options` | validated priority dispatch — an out-of-set answer returns `dispatch-error` (`INVALID_CHOICE`) + an **unchanged session**, never a fabricated move |
| one of `PENDING_CHOICE_KINDS` (20 in v1.2 — enumerated in §1.1a) | per-kind shape; echo `answer.kind` (the wire validates it) | the kind-echo-validated settler |
| `"unresolved"` | ignored | Arbiter-ruling acknowledgement (v1 does NOT auto-settle arbiter content — the ruling is the caller's to apply) |
| `"game-over"` / `"dispatch-error"` / `"engine-stuck"` | — | returned unchanged (terminal / honest error) |
| anything else | — | `dispatch-error` `UNKNOWN_DECISION_KIND` (the contract failsafe) |

**The runtime-read rule.** The canonical kind list is the RUNTIME export
`PENDING_CHOICE_KINDS` from `app/src/lib/learn/pendingChoice.js` — consumers read it at
runtime (lab.mjs does) and treat the §1.1a table as informative documentation. A kind present
at runtime but missing from this doc is a doc bug, not a contract break; an unknown kind AT
runtime is handled by the §3 stop-and-report rule. (History: this doc said "13" until
2026-07-03 while the runtime exported 20 — the runtime was always the contract.)

### 1.1a Pending-answer shapes (one row per `PENDING_CHOICE_KINDS` entry)

General rules, all kinds:

- Every pending-kind decision is the live `state.pendingChoice` spread onto `{ kind }` — so
  `controller` (the ANSWERING seat), `candidates`, `sourceName`, and the kind's own fields
  listed below ride on the decision object itself.
- **Kind echo:** stamp `answer.kind` with the decision's kind. A mismatched echo (a stale
  double-submit racing a settled choice) is DROPPED — the session re-derives and returns the
  live decision, never misreads the payload (WI-5). A kind-LESS payload is legacy-accepted
  in v1.x (see §5 MAJOR list).
- **Illegal picks never fabricate:** an out-of-candidates id, an illegal decline, or an
  under-assigned division re-surfaces the SAME decision (or re-derives) — the engine never
  guesses an answer. Settler-level failures surface as `dispatch-error`, session unchanged.
- Yes/no settlers also accept a bare boolean `true` on the wire (legacy), but the canonical,
  kind-echoed object form below is what drivers must send.

| kind | answer shape (echo `kind`) | notes (chooser · decline · validation) |
|---|---|---|
| `tutor-search` | `{ kind, cardId }` | `cardId` ∈ `candidates[].id`; `null` = decline / fail to find — legal iff `mayFailToFind !== false` (CR 701.23b; a mandatory quantity-only search rejects null per CR 701.23d and re-surfaces). Multi-fetch tutors (`remaining > 1`) re-surface once per fetch; `destination`/`entersTapped` describe the CURRENT fetch. |
| `clone-search` | `{ kind, permId }` | `permId` ∈ `candidates[].id`; `null` declines a "you may" copy (enters as itself). A MANDATORY clone (`optional: false`, CR 707.9) rejects null and re-surfaces. |
| `scry-surveil` | `{ kind, keep: [cardId, …] }` | ordered ids to KEEP on top (subset of `cards`); the rest bottom (`mode:"scry"`) / graveyard (`mode:"surveil"`). A `reorder:true` pending (Ponder) keeps EVERYTHING on top in the submitted order. Unknown/duplicate ids are dropped defensively. |
| `optional-effect` | `{ kind, take: boolean }` | "you may &lt;effect&gt;" yes/no; the paused atom runs on `take:true`. |
| `commander-return` | `{ kind, return: boolean }` | CR 903.9a — return the commander to the command zone, or leave it in `zone`. |
| `hand-discard` | `{ kind, cardId }` | the CASTER picks from the victim's revealed, filtered hand (`victim` on the decision); no decline — null/illegal re-surfaces. |
| `impulse-dig` | `{ kind, cardId }` | keep one looked-at card to HAND; the rest go to `restTo`; no decline. |
| `look-top-take` | `{ kind, cardId }` | BLITZ LK-2 top-card take-or-leave-on-top (Dryad Greenseeker / Herald's Horn, Domri +1): `cardId` = the single matched top card (`candidates[0]`) → TAKE to HAND; `null` = LEAVE it on top (a legal, non-dominated decline — no disposal). Only ever raised when the top card matched the quality (a non-match resolves inline, unrevealed). AI policy: always take. |
| `dig-land-to-battlefield` | `{ kind, cardId }` | which offered LAND enters the battlefield (ETB fires; rest bottoms random); no decline. |
| `sacrifice-choice` | `{ kind, cardId }` | `cardId` = the chosen creature's PERMANENT id (edicts — the SACRIFICER chooses, CR 701.16); chains via `queue`; no decline. |
| `discard` | `{ kind, cardId }` | the DISCARDER picks from their own hand (CR 701.8); chains via `remaining` + `queue`; no decline. |
| `divide-damage` | `{ kind, distribution: [{ id, type: "creature"\|"player", amount }] }` | FULL assignment required (CR 601.2d): when candidates exist and the capped sum < `amount`, the same decision re-surfaces (WI-5 guard). |
| `distribute-counters` | `{ kind, distribution: [{ id, amount }] }` | same full-assignment guard; applied via the add-counter atom so counter doublers compose (CR 616). |
| `soft-counter` | `{ kind, pay: boolean }` | the targeted SPELL'S controller pays `amount` / structured `cost` to save it; decline / unaffordable ⇒ countered. Decision carries `affordable`. |
| `optional-mana-payment` | `{ kind, pay: boolean }` | CR 603.7c "you may pay {cost}. If you do, …"; pay runs `effectAtoms`. Decision carries `affordable`. |
| `optional-sac-payment` | `{ kind, sac: boolean }` | sacrifice a `subtype` permanent to run the payoff; `available:false` ⇒ only decline has effect. |
| `optional-draw-discard` | `{ kind, draw: boolean }` | loot yes/no; yes chains into a `discard` which-card pick. |
| `optional-discard-payment` | `{ kind, discard: boolean }` | discard-as-cost; yes chains the which-card pick, then the payoff (`available` on the decision). |
| `sac-unless-pay` | `{ kind, pay: boolean }` | pay `cost` keeps the permanent (`sourceId`); decline / unaffordable sacrifices it. |
| `taxed-payment` | `{ kind, pay: boolean }` | the answering seat is the PAYER (`controller === payer`, Rhystic-style); decline / can't-pay gives `beneficiary` the `declinePayoff` (`"draw"` \| `"treasure"`). |
| `edict-mode` | `{ kind, mode: "life"\|"sacrifice"\|"discard", permId?, cardId? }` | `mode` must be ∈ the decision's `modes` (anything else coerces to `"life"`); `permId` picks from the `sac` pool, `cardId` from the `disc` pool; chains via `queue`. |

(Shape source of truth: the `apply*Choice` settlers in `app/src/lib/learn/learnSession.js` —
the dispatch table in `applyPendingChoice` names all 21 (20 original + BLITZ LK-2 `look-top-take`).
The LearnView client stamps the same kind-echoed payloads, so this table matches both clients.)

### 1.1b `ask` decisions — metadata + the answering seat

An `ask` decision is `{ kind: "ask", prompt, options, metadata }` with
`metadata = { reasoning, difficulty, defaultIndex, suggestion, traps? }`:

- **`metadata.suggestion`** (stable, documented as of the v1.2.x doc wave): the engine's OWN
  pick for this window — always deep-equal to a member of `options`, so it is the
  guaranteed-legal fallback answer for a driver with no opinion (lab.mjs answers out-of-set
  asks with exactly this field).
- `metadata.defaultIndex` = `suggestion`'s index in `options` (UI convenience).
- `metadata.traps` appears only on the intermediate attack-trap ask.
- Additive metadata fields are MINOR (§5); drivers ignore unknown ones.

**The answering seat.** v1.2.x decisions carry NO first-class `seat` field:

- pending-kind decisions carry `controller` — that IS the answering seat (the wire validates
  the answer against it);
- `ask` decisions are answered by the same derivation the wire itself uses (`applyChoice`,
  SD-3 — CR 702.85a/601.2b: a mid-resolution window belongs to its controller, who may not
  hold priority):
  `state.pendingDiscover?.controller ?? state.pendingFreeCast?.controller ?? state.pendingCascade?.controller ?? state.priorityHolder`.
  With no mid-resolution window pending, that is simply the priority holder.
- A first-class `decision.seat` on every decision is a RESERVED additive change (MINOR when
  it ships); v1.x drivers must not assume its presence.

### 1.1c `session.status` vocabulary

`"active" | "user-wins" | "ai-wins" | "draw" | "timeout" | "abandoned"`

- W/L/draw are set by the driver's SBA outcome recorder (the same rules `gameStatus` reads).
- The turn-limit stalemate exit sets `"draw"` with the clock OFF (legacy, byte-identical) and
  `"timeout"` ONLY when `timePressure` was on — the honest, label-free fourth outcome
  (`trainingWeight: 0` downstream; never relabeled as a W/L).
- `"abandoned"` is set only by `abandon(session)` (the server route's explicit user exit; the
  driver never sets it). `abandonReason` rides the session.
- **status↔gameStatus:** on `"user-wins"`/`"ai-wins"`/`"draw"` the two agree; `"timeout"` and
  `"abandoned"` exist ONLY on `session.status` — `gameStatus(state)` (§1.2) never returns
  them (the turn cap is the loop's concern, and a timed-out game's `state` still reads
  not-over).

### 1.2 The pure layer (v0 — unchanged)

`legalActions(state, seat)` · `isLegalAction(state, action)` · `applyAction(state, action)`
(no-op on illegal/garbage — the security boundary) · `gameStatus(state)` · `observe(state, seat)`
(v1 = full state, perfect information; seat-scoped redaction is reserved as an OPT-IN
`createGame` flag — see §5: shipping the flag is MINOR, flipping the observe() DEFAULT is
MAJOR). **The pure layer cannot settle `pendingChoice`/`pendingArbiter`** — use the session
layer to drive full games.

### 1.3 The pilot decide contract (unchanged from the 2026-06-28 lock)

`decide({ state, legalActions, seat, pilot, features, previewFeatures }) -> action ∈ legalActions`
— fires at every auto-decided window; out-of-set/throwing returns fall back to the default pick
(never illegal, never a crash). `decideMulligan` same shape at keep/ship. Injected via `pilots` at
createGame / `runSelfPlayBatch` — the engine never imports omnath-tools. `features` is the
engine-computed feature vector (`featurizeState`); `previewFeatures(action)` is the one-dispatch
lookahead closure (null/fail-closed on any dispatch failure).

**ROUTER CONVENTION (load-bearing — four historical breaks cost a bench each):** a per-seat decide
**router forwards the WHOLE bag, never destructures-and-rebuilds.** `resolveDecideAction`
(`learnSession.js`) constructs the bag; every router hop between it and the pilot
(`selfPlayRunner.routedDecide`, `gameApi`'s pilots router) MUST spread it through
(`(bag) => pilot.decide({ ...bag, pilot: identity }))`), so any key added to the bag later reaches
the pilot automatically. Destructuring `({ state, legalActions, seat })` silently drops new keys
(`features`/`previewFeatures` were dropped four times this way). Pinned by
`selfPlayRunner.test.js` "routedDecide forwards the whole decide bag" — a sentinel that fails if any
router hop rebuilds instead of spreading.

---

## 2. The consultation surface (what omnath-tools/engine.mjs may import)

Supported, canary-pinned imports (via `MTG_APP_ROOT` + dynamic ESM):

| Module | Exports Omnath may rely on |
|---|---|
| `src/lib/learn/coverage.js` | `classifyCard(card) -> tier`, `isNativeTier(tier)` |
| `src/lib/learn/effects/parser.js` | `parseEffectProgram(card)`, `programConfidence(program) -> "high"\|"low"` |
| `src/lib/server/cardIndex.js` | `allCards()`, `publicCard(c)`, `lookupCard(name) -> card\|null`, `lookupRulingsForCard(card) -> rulings[]` |
| `src/lib/learn/gameApi.js` | everything in §1 |
| `src/lib/server/rulesRetrieval.js` | the rules-retrieval entry the `/api/rules-retrieval` route uses |

`lookupCard(name)` — exact normalized-name match, then substring fallback; a MISS returns
`null`, never a throw. It REQUIRES the bundled oracle snapshot at runtime: with no snapshot on
disk the underlying index load throws an honest `ENOENT` (it never fabricates a card), so
consumers running outside a data root guard the first call (the omnathSeam canary pins exactly
this tolerance). `lookupRulingsForCard(card)` — always an array; `[]` when the card has no
`oracle_id` or no rulings snapshot exists (the rulings index degrades to empty on ENOENT).

Anything NOT in this table is engine-internal and may churn without notice — if Omnath needs
another export, ask on COMMS and it gets added to the table + the canary. Golden-card pins
(Lightning Bolt → `native-spell`, Sol Ring → `native-mana`, Cyclonic Rift → non-vanishing tier)
are shared between `omnathSeam.test.js` (engine side) and `engine.mjs selftest` (brain side) so
both canaries fire on the same drift.

---

## 3. Decision + action vocabulary stability

- `decision.kind` values: `"ask"`, `"game-over"`, `"dispatch-error"`, `"engine-stuck"`,
  `"unresolved"`, + `PENDING_CHOICE_KINDS` (the canonical exported list — 20 in v1.2, §1.1a).
  NEW kinds are MINOR: drivers MUST treat an unknown kind as "stop and report" (never guess an
  answer shape), which `act()` itself mirrors via the `UNKNOWN_DECISION_KIND` failsafe.
- Action objects are plain JSON (`kind` + scalar payload + occasional small arrays); matching
  is canonical-key deep-compare (`actionInOfferedSet`). Additive fields on actions are MINOR
  (e.g. `defenderName` on declare-attacker, added in the overhaul pass).
- `decision.metadata.suggestion` is a stable documented field (§1.1b); additive metadata
  fields are MINOR.
- **RESERVED (ENG-FLAG-2 — documented, NOT built in v1.2.x):** a decision-metadata plumbing
  tag — `metadata.plumbingKinds: ["tap-for-mana", …]` (or a per-option `isPlumbing` flag)
  marking offered actions that are pure mana plumbing, so machine callers/recorders can skip
  them without re-deriving. When it ships it is an additive MINOR; drivers must tolerate its
  absence (and must not invent it meanwhile).

---

## 4. The engine→brain data hook (`omnath-trajectory-v1`)

`node app/scripts/self-play.mjs --export-trajectories=<path> [...]` writes one JSONL line per
game:

```jsonc
{
  "schema": "omnath-trajectory-v1",
  "generatedAt": "<ISO>",
  "mode": "commander",
  "result": "user-wins" | "ai-wins" | "draw" | "timeout" | "<error kind>",
  "winnerSeat": "<seat>" | null,
  "onThePlay": "<seat>" | null,
  "turns": <n> | null,
  "trainingWeight": 1 | 0,        // the runner's HONEST trust gate: 0 = timeout/non-completion —
                                  // hard-filter these; the engine never fabricates a label
  "meta": { seatNames, deckNames, ... },
  "rows": [ { turn, seat, pilot: {playbook, temperament} | null, features, action }, ... ]
}
```

- **Tagged:** `pilot` identity rides every row (null = the default AI).
- **Trust-gated:** `trainingWeight` is computed by the runner, not the exporter — a
  non-completion can never masquerade as a learnable game.
- Changes within v1 are additive-only; an incompatible row shape becomes
  `omnath-trajectory-v2` under a new schema string (old readers skip unknown schemas).

---

## 5. Versioning discipline (what bumps what)

`PLAY_API_VERSION` (`gameApi.js`) is semver over the contract surface: the §1 exports, the
decision/answer vocabulary (§1.1/§1.1a/§3), the §2 consultation table, and the §4 schema
strings.

**MINOR (1.x → 1.y) — additive, consumers may ignore:**

- new exports; new §2 consultation-table rows (`lookupCard`/`lookupRulingsForCard`, this pass);
- new decision kinds (drivers stop-and-report unknowns — §3; `act()` mirrors it);
- new OPTIONAL `createGame`/`nextDecision`/`act` options defaulting to current behavior (the
  v1.1.0 `opts` bag + `pilots` honoring; the v1.2.0 `policy` knob; a future opt-in
  observe-redaction flag);
- new additive fields on decisions/actions/answers/state (`state.observedTurn`; a future
  `decision.seat`; the reserved §3 plumbing tag);
- doc corrections of doc-vs-runtime drift (the 13→20 kind-count fix): the RUNTIME was always
  the contract (§1.1a runtime-read rule), so correcting the doc changes no consumer-visible
  surface — no version bump required, but it posts to COMMS like any contract edit.

**MAJOR (→ 2.0) — breaking, posted to COMMS BEFORE it ships:**

- removing or renaming any §1 export or any `PENDING_CHOICE_KINDS` entry;
- changing an existing kind's answer shape or required fields (§1.1a);
- changing `act()`/`nextDecision`'s `{ session, decision }` return shape;
- making the kind-echo check REJECT legacy kind-less payloads (§1.1a general rules);
- changing the `session.status` vocabulary (§1.1c);
- flipping `observe()` to redacted-by-DEFAULT — redaction ships as an opt-in `createGame`
  flag to stay MINOR (this supersedes the older §1.2 "reserved non-breaking change" wording:
  the reservation is for the OPT-IN flag; the default flip is MAJOR because pilots trained on
  full state would silently lose information);
- changing `trainingWeight` / trajectory-row semantics (§4's schema-string rule already
  covers rows: an incompatible shape becomes `omnath-trajectory-v2`).

**PATCH:** pure doc clarifications that change no list, shape, or behavior.

**Process (not contract):** every MINOR and MAJOR bump posts its delta to `memory/COMMS.md`
(MAJOR before it ships in a release; MINOR may post with the ship — same channel, lighter
ceremony), so lab.mjs's runtime reads (`PENDING_CHOICE_KINDS`, the `PLAY_API_VERSION` 1.x
assertion) stay coordinated. Trajectory / fingerprint hash-anchor RE-BASING after an
intentional behavior change is release-engineering process, recorded in the work log
(`docs/orchestration/play-harness-overhaul-log.md`) — it is NOT part of this contract.

---

*Locked during the Fable 5 overhaul pass (P3). Companion prompt:
`memory/orders/omnath-fable5-overhaul.md`. Questions → memory/COMMS.md.*
