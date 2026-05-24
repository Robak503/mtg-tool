# Judge Engine Codex — Next Steps
## Recorded after initial build completion
## 94 files, 455KB — February 27, 2026 CR baseline

---

# STATUS AT TIME OF WRITING

The codex is functionally complete across all ten layers with Commander (4-player Free-for-All) as the primary format. Zero genuine rule coverage gaps remain. The following four tasks represent the next phase of work.

---

# TASK 1: CLEANUP PASS

**What:** Remove the four stale stub files from outputs and the zip. Fix one stale META entry.

**Why:** The stubs were created early in the build as placeholders and have since been superseded by full verified file pairs. They add noise and could confuse a retrieval system that indexes all files.

**Stubs to remove:**
| Stub file | Superseded by |
|---|---|
| `L03_Event_609_damage_stub.md` | `L03_Event_609to610_v.md` + `_t.md` |
| `L06_PlayerAction_601_casting_stub.md` | `L06_PlayerAction_601_seg1_v/t.md` + `seg2_v/t.md` |
| `L07_ObjectModel_400_identity_stub.md` | `L07_ObjectModel_400to408_v.md` + `_t.md` |
| `L07_ObjectModel_607_linked_stub.md` | `L07_ObjectModel_607_v.md` + `_t.md` |

**META fix:** `L10_Variant_724to730_v.md` shows `❌ NOT YET BUILT` in the META due to a sed escaping issue. The file exists and is correct — the META entry just needs updating to `✅ Complete`.

**Effort:** One session, no new content. Purely administrative.

---

# TASK 2: CROSS-REFERENCE AUDIT

**What:** Verify that `FEEDS INTO` and `SOURCES` chains across all 94 files are accurate, consistent, and complete now that the full build is done.

**Why:** Files were built incrementally over many sessions. Early files reference later files by placeholder names that sometimes changed (e.g., `L07_ObjectModel_601to602_v.md` became `seg1/seg2`). Some `FEEDS INTO` entries point to files that were renamed or reorganized. Some `FEEDS INTO` chains are incomplete — a file may affect a layer that wasn't built yet when that file was written.

**Scope of audit:**
- Every `FEEDS INTO:` line — does the target file actually exist and does it address what the source claims?
- Every `SOURCES:` line — does the source file exist and contain what the target expects?
- Bidirectional check — if file A says it feeds into file B, does file B reference file A as a source?
- Commander-specific cross-references — `L10_Variant_903_t.md` feeds into several L5/L6 files that were written before Commander was designated the primary format. Do those files adequately reference the Commander context?

**Effort:** Two to three sessions. Mostly reading and fixing header lines, but may surface actual content gaps in expansion files that need filling.

---

# TASK 3: ENGINE TESTING

**What:** Run real Commander board states and rules questions through the codex and identify where retrieval fails, where expansion files lack sufficient detail, and where the layer routing produces wrong or ambiguous answers.

**Why:** Building the codex and using it are different problems. A file may be verbatim-correct and expansion-complete but still fail to answer a specific adjudication question because the relevant rule is spread across three files with no clear routing path between them.

**Suggested test cases (known edge cases in Commander):**
1. Eminence ability triggering from the command zone — does L04 handle commander zone trigger sourcing?
2. Commander damage through combat with a copy of a commander — is the copy tracking covered?
3. Cost payment order when sacrificing a cost-reducer as part of casting — 601.2f lock-in
4. Replacement effect stacking when a commander would die (shield counter + command zone replacement) — 614.5 exception
5. Triggered ability from a commander that has left the battlefield before the trigger resolves — LKI
6. Daybound/nightbound in 4-player Commander — does the "two spells" threshold account for all four players' turns correctly?
7. Partner commanders with different color identities — color identity union, commander damage tracked separately
8. Mutate onto a commander — merged permanent, what happens when the non-commander top card goes to graveyard

**Output of testing:** A list of specific file sections that need expansion or clarification, plus any missing cross-references discovered.

**Effort:** Ongoing. Can be done in parallel with other tasks as specific questions arise.

---

# TASK 4: QUERY ROUTING DOCUMENT

**What:** Build a `META_query_router.md` — a document that maps question types directly to the files that answer them, so a retrieval system doesn't need to scan all 94 files for every query.

**Why:** The current META is a build index — it tracks what exists and what it covers. It is not a query tool. A real adjudication engine needs to know: "this question is about combat damage assignment — go to these three files in this order." Without a router, the engine either reads everything (expensive) or guesses wrong files (inaccurate).

**Structure of the router:**

| Question category | Primary file(s) | Secondary file(s) |
|---|---|---|
| Can I cast this spell right now? | L06_601_seg1_t, L06_601_seg2_t | L06_116_t, L09_100to104_t |
| What does this keyword do? | L07_702_v (look up keyword) | L07_702_t (get layer routing) |
| Is this trigger legal / does it fire? | L04_Trigger_engine | L04_603_seg1/2/3_t |
| What SBAs apply right now? | L05_704_t | L10_903_t (Commander SBAs) |
| How is this cost calculated? | L06_118to121_t | L06_601_seg1_t (601.2f) |
| Does this affect the layer? | L08_611to613_t | L08_604_t |
| Commander damage tracking | L10_903_t | L05_704_t (addendum) |
| Commander zone return | L10_903_t (§6) | L03_614to616_t |
| What does this card type do? | L07_300to315_v (look up type) | L07_300to315_t |
| Priority passing in 4-player | L06_117_t | L10_800to811_t |
| ...and so on for ~30 question categories |

**Effort:** One focused session to build the initial router. Should be updated whenever new content is added or tested.

---

# RECOMMENDED ORDER

1. **Task 1 (Cleanup)** first — removes noise before testing or routing
2. **Task 4 (Query Router)** second — enables Task 3 to be more systematic
3. **Task 3 (Testing)** ongoing — surfaces real gaps
4. **Task 2 (Cross-Reference Audit)** in parallel with Task 3 — fixes structural issues as they're found

---

*Recorded: session following initial full-codex build completion*
*CR baseline: February 27, 2026*
*File count at time of recording: 94 files, 455KB*
