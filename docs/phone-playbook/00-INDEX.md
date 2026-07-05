# 00 — INDEX · OMNATH IN POCKET EXECUTION PLAYBOOK

> **The mobile edition of MTG Tool — the complete execution playbook.**
> Authored by **Fable 5 on 2026-07-04** from Colton's authoritative
> spec (`memory/orders/phone-app-fable-brief.md`, Part 2 — the brief
> carries his 2026-07-04 calls). Executed **months from now** by
> Opus/Cindy in the real codebase, once the Mac server box lands.
> Purpose: make that execution **mechanical** — every decision made,
> every feature specified, every phase gated, every risk flagged.

---

## 1. What this is (and isn't)

- **It IS the map and the gates:** locked architecture, per-feature
  behavior + live acceptance criteria, the data/sync model, granular
  phases with box-dependency flags, the risk register, the decision
  log, and per-phase boot prompts.
- **It is NOT a script.** Future-Opus has the codebase, the tools, and
  real errors in front of it — it writes real code live and adapts
  freely *inside* the gates. Nothing here pseudo-codes what Opus can
  write better against the actual tree.
- **Authority chain:** the SPEC (brief Part 2) > this playbook > the
  older `phone-port-plan.md` (superseded skeleton; still holds useful
  recon). Where the playbook expands the spec, `14-decision-log.md`
  records what's SPEC-locked vs PLAYBOOK-chosen vs DEFERRED.

## 2. The doc registry

| Doc | Owns | Weight |
|---|---|---|
| `00-INDEX.md` | this map | — |
| `01-architecture.md` | three planes · StorageAdapter seam · service layer · topology · closed-system security · OFFLINE-FIRST model · route disposition table (living checklist) | core |
| `02-data-and-sync.md` | entity census · journal + LWW protocol · conflict UX contract · Weaviate schema · data tiers · sync chip states | core |
| `03-feat-decks.md` | deck library/CRUD/import/deck-lock | feature |
| `04-feat-agents.md` | Jace/Karn/Tibalt/Omnath UX · Arbiter · streaming · degrades | feature |
| `05-feat-pod.md` | pod balancer (pure-JS showcase) | feature |
| `06-feat-life-tracker.md` | NET-NEW: counters · Planechase · session crash-safety | feature |
| `07-feat-vault.md` | collection/grails/ledger · Mac jobs · notifications · daily brief | feature |
| `08-feat-rules.md` | CR search + oracle — the CREED backbone | feature |
| `09-feat-card-scanner.md` | FUTURE SPEC: design now, build later | feature |
| `10-ui-ia.md` | six-tab IA · wireframe intent · LEYLINE mobile · ergonomics rules · component inventory | core |
| `11-agent-tiers.md` | T0–T3 tiers · routing · RAG pipeline · CREED enforcement hooks · cost gates · Mac serving | core |
| `12-phases.md` | M0–M5: tasks (outcome/acceptance/deps/box-flag) + live exit gates | **the spine** |
| `13-risk-and-verify.md` | V1–V20 verify-at-build register · H1–H16 hazards · how to work them | **the honesty layer** |
| `14-decision-log.md` | every locked decision + WHY · supersession trails · deferred items | **the anti-relitigation layer** |
| `15-test-strategy.md` | live-acceptance doctrine · test layers · dogfood ladder · THE CON-DAY SCRIPT | core |
| `16-launch-prompts.md` | copy-paste boot prompt per phase + amendment prompt + hub-setup-day prompt | the ignition |
| `QUESTIONS-FOR-COLTON.md` | running side file: open calls with working defaults | live |
| `runbooks/` (created during M2+) | e.g. `mac-hub-setup.md` — written AS the work happens | live |

## 3. How Opus uses this set

1. **Starting a phase:** open `16-launch-prompts.md`, copy that phase's
   block into a fresh session. Each prompt bounds its own reading list
   — you never need the whole set in context at once.
2. **First contact with the project (no phase yet):** read this index →
   `01` → `02` → `12` → `14`. That's the whole system in four docs;
   pull feature docs on demand.
3. **The V#/H# workflow:** every ⚠ in docs 01–12 resolves to a numbered
   row in `13`. Verify-at-build items are FIRST ACTIONS in their phase,
   results written back into `13` (`✅ verified <date>` / `❌ fallback
   engaged`). Never trust training memory on a V# — read current docs,
   probe the real device.
4. **The amendment rule:** reality wins. When the tree/device
   contradicts a doc, fix the build AND amend the doc in the same PR
   (`16 §amendment prompt`). The decision log is append-only.
5. **Questions for the owner** go to `QUESTIONS-FOR-COLTON.md` with a
   working default — they never stall a lane.

## 4. Durable vs verify-at-build

- **DURABLE (deep, trust it):** the three-plane architecture, the
  StorageAdapter seam, the offline-first replica model, journal+LWW
  sync + its UX contract, feature behavior + acceptance criteria, the
  six-tab IA + ergonomics rules, the tier model + CREED enforcement,
  phase ordering + gates, the decision log.
- **⚠ VERIFY AT BUILD, fall 2026 (flagged, never hard-committed):**
  everything in `13`'s V-register — Tauri-Android specifics, on-device
  model runtime, webview streaming/asset/wake-lock behavior, Weaviate
  API drift, notification delivery, card-recognition stack, the exact
  Mac + serving stack, Android background/signing specifics. Each has
  a fallback; a V# verifying "bad" is a normal outcome with a designed
  exit, not a plan failure.

## 5. The non-negotiables (bind every phase, every PR)

1. **THE CREED:** no fabricated rule numbers, no card text from model
   memory — CR citations trace to bundled `cr_current.json`; card text
   comes from bundled Scryfall data. Mechanical enforcement in
   `11 §4.3`; drills in every rules-touching gate.
2. **OFFLINE-FIRST:** the full app — deck editing included — works at
   zero signal. The Mac is a merge hub and an amplifier, never a
   dependency for function. Every feature doc specifies its offline
   state; airplane mode appears in every phase gate.
3. **Closed system:** single user, Tailscale-only reach, zero public
   surface (off-mesh port-scan is an M2 acceptance item). Personal vs
   giftable is a build-time split — owner data never rides a gift.
4. **LIVE acceptance:** gates are observable behaviors on the real
   Pixel at real tables — a green suite is an instrument, never the
   gate itself (except M0, whose risk is regression).
5. **Money moves only by hand:** the API tier is manual, cost-gated,
   ledgered; normal months cost $0.00.
6. **Never-skip law:** a red gate stops the line. Two failed fixes →
   `/investigate`, not a third identical try.

## 6. Status at authoring (2026-07-04)

- **Phone lane: SHELVED until the Mac lands** (Colton) — with the
  explicit exception that **M0 (field-core extraction) is
  box-independent and may proceed opportunistically** whenever Cindy
  has a free lane. M1 is likewise buildable-without-box (its gate needs
  no hub), but sits behind M0's gate.
- The Mac Studio purchase waits for the **M5-refresh comparison
  (~fall 2026)** — `project_server_box_decision.md`.
- Desktop app continues shipping on its own track (v0.102.0 at
  authoring); nothing here blocks or is blocked by it until M0 opens.
- First carrier: **Pixel 10, sideloaded.** First field trial anchor:
  MagicCon Vegas 2026 (verify dates before treating as a deadline).

*The pocket is designed. When the box lands, boot `16 §M0`* — *or open
M0 sooner; it's ready now.*
