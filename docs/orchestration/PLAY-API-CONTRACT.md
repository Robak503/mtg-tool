# PLAY-API CONTRACT — the engine↔Omnath seams (v1, locked 2026-07-01)

> The written contract for every seam the Omnath brain consumes from the engine. Owned by
> Clyde (engine side); consumed by omnath-tools (pilots, engine.mjs gate, the case store).
> **Change discipline:** breaking any surface below bumps the relevant MAJOR version and is
> posted to `memory/COMMS.md` BEFORE it ships in a release. Additive fields/exports are MINOR
> and safe for consumers to ignore. The engine-side tripwire is
> `app/src/lib/learn/omnathSeam.test.js` — it runs in every full gate, so churn that would
> break Omnath's tools fails Clyde's build first.

---

## 1. The play-API (`app/src/lib/learn/gameApi.js`) — `PLAY_API_VERSION = "1.2.0"`

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
  const answer = myPilot(decision);          // ∈ decision.options (ask) / per-kind shape (pendings)
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
| `"ask"` | one of `decision.options` | validated priority dispatch — an out-of-set answer returns `dispatch-error` + an **unchanged session**, never a fabricated move |
| one of `PENDING_CHOICE_KINDS` (13, exported from `pendingChoice.js`) | per-kind shape; echo `answer.kind` (the wire validates it) | the kind-echo-validated settler |
| `"unresolved"` | ignored | Arbiter-ruling acknowledgement (v1 does NOT auto-settle arbiter content — the ruling is the caller's to apply) |
| `"game-over"` / `"dispatch-error"` / `"engine-stuck"` | — | returned unchanged (terminal / honest error) |
| anything else | — | `dispatch-error` `UNKNOWN_DECISION_KIND` (the contract failsafe) |

### 1.2 The pure layer (v0 — unchanged)

`legalActions(state, seat)` · `isLegalAction(state, action)` · `applyAction(state, action)`
(no-op on illegal/garbage — the security boundary) · `gameStatus(state)` · `observe(state, seat)`
(v1 = full state, perfect information; a future seat-scoped redaction is a reserved
non-breaking change). **The pure layer cannot settle `pendingChoice`/`pendingArbiter`** — use
the session layer to drive full games.

### 1.3 The pilot decide contract (unchanged from the 2026-06-28 lock)

`decide({ state, legalActions, seat, pilot }) -> action ∈ legalActions` — fires at every
auto-decided window; out-of-set/throwing returns fall back to the default pick (never illegal,
never a crash). `decideMulligan` same shape at keep/ship. Injected via `pilots` at createGame /
`runSelfPlayBatch` — the engine never imports omnath-tools.

---

## 2. The consultation surface (what omnath-tools/engine.mjs may import)

Supported, canary-pinned imports (via `MTG_APP_ROOT` + dynamic ESM):

| Module | Exports Omnath may rely on |
|---|---|
| `src/lib/learn/coverage.js` | `classifyCard(card) -> tier`, `isNativeTier(tier)` |
| `src/lib/learn/effects/parser.js` | `parseEffectProgram(card)`, `programConfidence(program) -> "high"|"low"` |
| `src/lib/server/cardIndex.js` | `allCards()`, `publicCard(c)` |
| `src/lib/learn/gameApi.js` | everything in §1 |
| `src/lib/server/rulesRetrieval.js` | the rules-retrieval entry the `/api/rules-retrieval` route uses |

Anything NOT in this table is engine-internal and may churn without notice — if Omnath needs
another export, ask on COMMS and it gets added to the table + the canary. Golden-card pins
(Lightning Bolt → `native-spell`, Sol Ring → `native-mana`, Cyclonic Rift → non-vanishing tier)
are shared between `omnathSeam.test.js` (engine side) and `engine.mjs selftest` (brain side) so
both canaries fire on the same drift.

---

## 3. Decision + action vocabulary stability

- `decision.kind` values: `"ask"`, `"game-over"`, `"dispatch-error"`, `"engine-stuck"`,
  `"unresolved"`, + `PENDING_CHOICE_KINDS` (the canonical exported list). NEW kinds are MINOR
  (drivers must treat unknown kinds as "stop and report", which `act()` mirrors).
- Action objects are plain JSON (`kind` + scalar payload + occasional small arrays); matching
  is canonical-key deep-compare (`actionInOfferedSet`). Additive fields on actions are MINOR
  (e.g. `defenderName` on declare-attacker, added in the overhaul pass).

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

*Locked during the Fable 5 overhaul pass (P3). Companion prompt:
`memory/orders/omnath-fable5-overhaul.md`. Questions → memory/COMMS.md.*
