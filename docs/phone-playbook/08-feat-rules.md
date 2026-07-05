# 08 — FEATURE: RULES / ORACLE

> **OMNATH IN POCKET · execution playbook · doc 08 of 17**
> CR search + per-card oracle/rulings, full-strength offline, the CREED
> backbone of the phone. Existing seams: `rulesRetrieval.js` (BM25 over
> the 2MB rules index), `rulesGuruRetrieval.js`, `citationInjector.js`,
> `cardIndex.js`, the card inspector surface. Pure JS end-to-end — this
> feature ports, it isn't rebuilt.

---

## 1. Behavior

### 1.1 CR search
- Query → ranked CR sections (existing BM25 retrieval as SVC) → result
  cards show rule number + text + surrounding-context expander
  (parent/sibling rules).
- Every rule number displayed is **read from the bundled
  `cr_current.json`** — the retrieval service is the only rules source
  in the app (CREED, D13). There is no path where UI copy or an agent
  invents a citation.
- Glossary hits (CR glossary entries) surface alongside numbered rules.

### 1.2 Card oracle lookup
- Search any card (oracle slim index, as-you-type) → oracle text, type
  line, mana cost, color identity, legalities snapshot, **rulings**
  (bundled rulings data), printings strip (art from cache).
- This is the same card inspector used by Decks/Vault (`03 §1.2`,
  `07 §1.1`) — one component, one data path.

### 1.3 The table use-case (why this tab exists)
- Bottom-tab direct access (`10 §tabs`): a rules argument at a pod
  table is a 10-second lookup, not a chat session.
- Recent searches persist (device-local) — the same interaction gets
  re-checked across a game night.
- "Ask Jace about this" handoff: any rule/card result → opens a Jace
  chat seeded with that context (full Jace online; offline-Jace
  degrade per `04 §1.5`).

### 1.4 Relationship to agents
- The Rules tab is model-free by construction (Tier 0, `01 §2`) — it
  works identically on every build, every tier, every connectivity
  state.
- Jace/Arbiter *consume* this same retrieval service; the tab is the
  human-direct mount of it.

### 1.5 Judge quiz — OUT (D-P7)
Deferred post-M5 (Colton, 2026-07-04). The desktop `judge-quiz` route +
`JudgeTrialsView` stay desktop. Nothing in this tab's design forecloses
adding it later.

## 2. States

| State | Rendering |
|---|---|
| **Empty** | Search box + recent searches + a few starter chips (commander damage, priority, layers — seeded from real common lookups) |
| **Loading** | Index lazy-load on first use (bootstrap tier): brief inline "loading rules…" once per install; after that, instant |
| **Error** | Index missing/corrupt (data tier incomplete): explicit "rules data not downloaded yet" with a go-to-downloads action — never a silent empty result |
| **Offline** | **Identical to online. Zero degradation.** The proof-case offline feature |

## 3. Edge cases

- **No results**: honest empty state + query tips; never pad with
  fuzzy-wrong rules (a wrong rule is worse than no rule).
- **CR version skew**: the CR snapshot has a date/version — display it
  in the tab footer ("CR as of <date>"). Post-set-release rules changes
  exist until the next data update; the footer is the honesty
  mechanism.
- **Cards with no rulings**: say "no rulings" — don't hide the section
  (absence is information).
- **Multi-face cards** (MDFC/adventure/split): inspector renders all
  faces (existing cardIndex face model — port intact).
- **Un-set / acorn cards**: display what the data says; no special
  casing.
- **Search in a language other than English**: out of scope v1 (data
  is English); note for the future, don't half-build.

## 4. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Rules index (2MB) | bundled tier (bootstrap — always present) | ✅ |
| CR JSON (full text + numbers) | bundled `cr_current.json` | ✅ |
| Oracle slim index | bootstrap tier | ✅ |
| Full oracle / rulings | full JSON tier | ✅ after first wifi pull |
| Art strips | art cache | ✅ cached / text fallback |

## 5. Box-dependency

**STANDALONE — entirely.** By design the most dependency-free feature in
the app.

## 6. Acceptance criteria (live, observable)

1. **Airplane-mode citation gate (M1 exit-gate feed):** airplane mode →
   search a layered rules interaction → results show CR numbers + text
   that **grep-match the bundled `cr_current.json` exactly** (spot-check
   3 queries; the grep-match is the CREED proof).
2. **Ten-second table test:** from any tab, cold question → Rules tab →
   typed query → readable answer in ~10s of real handling (dogfood
   check).
3. **Oracle parity:** 5 random cards' oracle text matches desktop
   byte-for-byte (same data, same index — a mismatch = port bug).
4. **Rulings render:** a card with known rulings shows them, dated;
   a card without shows "no rulings."
5. **Version honesty:** CR footer date matches the bundled snapshot's
   actual version.
6. **Handoff:** "Ask Jace" from a rule result opens a Jace chat seeded
   with that rule's real text (visible in the context, online tier) —
   and in offline mode opens offline-Jace showing the same retrieved
   text (`04 §1.5`).

---

*Cross-refs: `04-feat-agents.md §1.5` (Jace degrade shares this
retrieval) · `11-agent-tiers.md §4` (RAG uses the same sources) ·
`02-data-and-sync.md §8` (data tiers) · D13 (CREED).*
