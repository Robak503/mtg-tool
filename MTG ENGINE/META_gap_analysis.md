# Judge Engine — Cross-File Knowledge Gap Analysis
## All 12 Files Analyzed Against Each Other
## March 2026

---

# EXECUTIVE SUMMARY

The 12-file set covers its declared scope well. All inter-file connections within the declared scope are internally consistent. However, the analysis identified five categories of gap:

1. **Missing rule files** — rules that are heavily referenced but have no coverage file
2. **Missing forward pointers** — files that don't say where their content feeds
3. **Missing backward pointers** — engine files that don't name which detail files they depend on
4. **Concept gaps** — topics that exist in some files but are absent or incomplete in others that need them
5. **Terminology inconsistencies** — same concept named or described differently across files

---

# 1. MISSING RULE FILES

These rules are referenced in the existing files but have no dedicated verbatim or expansion document. Every one of these is a live dependency — if the engine needs to adjudicate a situation governed by these rules, there is no coverage to consult.

## 1.1 Rule 117 — Timing and Priority
**Severity: CRITICAL**

Referenced in: 01, 02, 04, 07, 08, 11, 12

603.3 itself says "See rule 117, 'Timing and Priority.'" Every checkpoint, priority assignment, and "player would receive priority" event is governed by 117. The entire engine loop in 11 and 12 depends on the priority model but the actual rules for when priority is given, how it passes, and what the active player can do are undocumented.

Key sub-rules missing from the set:
- 117.3 (when players receive priority)
- 117.3a (active player gets priority at start of each step/phase after turn-based actions)
- 117.3b (when a spell or ability resolves, active player gets priority)
- 117.3c (after each step in casting a spell, active player gets priority)
- 117.4 (if no spells/abilities on stack and no waiting triggers, step/phase ends when all players pass)
- 117.5 (before a player gets priority, SBAs are checked and waiting triggers are placed — this is the exact rule that 11 and 12's checkpoint loop is built on)
- 117.6 (in a Planechase game, the planar controller gets priority during the planar phase)
- 117.7 (in a two-player game, passing priority while stack is empty passes the turn)

The engine files describe the *consequences* of rule 117 correctly, but without a 117 file, there is no source-of-truth document for the priority model itself.

## 1.2 Rule 608 — Resolving Spells and Abilities
**Severity: HIGH**

Referenced in: 04, 10, 11, 12

608.2b is cited directly in the failure matrix of 11: "All targets illegal when ability resolves → ability removed; does nothing." This is a live adjudication rule. 608 also governs how replacement effects interact during resolution (referenced in 10 and 12) and how modal spells resolve.

Key sub-rules missing from the set:
- 608.2 (resolving a spell or ability with targets — the full process)
- 608.2b (if all targets are illegal when the spell or ability would resolve, it's countered by game rules)
- 608.2c (if some targets become illegal — only the portion affecting legal targets still resolves)
- 608.3 (if a spell or ability has no targets and is countered — this affects triggered abilities removed from the stack under 603.3d)

Without a 608 file, "countered by rules" vs "countered by a spell/ability" is documented only in the failure matrix, not as a standalone rule.

## 1.3 Rule 607 — Linked Abilities
**Severity: MEDIUM**

Referenced in: 06 (603.11 section), 09 (614.12c section)

File 06 explains that 603.11 creates a linked relationship between a static ability and its triggered ability, and explicitly says "the static ability and the triggered ability are linked under rule 607." File 09 uses rule 607 to explain anchor-word replacement effects. But rule 607 itself — what linking means, what it restricts, how it interacts with copying — is never documented.

Key sub-rules missing:
- 607.1 (definition: abilities linked when one creates the other, or when both are printed together as a pair)
- 607.2 (linked abilities refer only to objects affected by the other linked ability)
- 607.3 (if an object has a linked triggered ability, and the static ability that creates it is no longer on the object, the triggered ability won't trigger)

This gap is live in 603.11 adjudication: a judge using 06 will know the abilities are linked but won't have the rule that governs what linking actually means operationally.

## 1.4 Rule 609.7 and 609.7b — Damage from a Source
**Severity: MEDIUM**

Referenced in: 09 (614.2, 614.9, 615.2, 615.9)

Three separate rules in 09 say "See rule 609.7" or "See rule 609.7b" but no file covers rule 609. This is directly relevant to replacement effects that apply "to damage from a source" and prevention shields that track a specific source. The source-property rechecking rule (609.7b) is particularly important for prevention shields that can become inapplicable if the source's properties change.

## 1.5 Rule 400.7 — Object Identity Across Zones
**Severity: MEDIUM**

Referenced in: 03, 04, 09, 10

Rule 400.7 is the identity rule: an object that moves from one zone to another becomes a new object, with no memory of its previous existence, with specific exceptions. This rule is foundational to:
- Zone-change triggers (03/04) — does the trigger track the "same" object?
- Delayed triggers referencing a specific object (03/04) — if the object moved zones, does the trigger still find it?
- Replacement effects that modify how an object enters (09) — is this the same object that was exiled?

Both 03 and 04 reference 400.7 for Aura and delayed trigger cases but never define what 400.7 actually says. Without this, "it's a new object" adjudications have no documented foundation.

## 1.6 Rule 601.2c–d — Casting a Spell (Choice and Target Stages)
**Severity: LOW-MEDIUM**

Referenced in: 01, 02 (603.3d says the triggered ability insertion process is "identical to rules 601.2c–d")

601.2c covers choosing modes, choosing the value of X, and choosing additional costs. 601.2d covers choosing targets. These are the exact steps that 603.3d imports for triggered ability insertion. A judge using the triggered ability rules will be directed to 601.2c–d but has no documentation of what those steps say.

## 1.7 Rules 701.19, 701.27, 701.28 — Regeneration, Transform, Convert
**Severity: LOW**

Referenced in: 09

- 701.19 (Regeneration) is referenced in 614.8 — the regeneration-as-replacement-effect rule
- 701.27 (Transform) and 701.28 (Convert) are referenced in 616.1d — the back-face-up ETB replacement effect category

These are keyword action definitions. Their absence means the context for those three specific replacement/prevention rules is undocumented.

---

# 2. MISSING FORWARD POINTERS

These files do not tell the user where their content feeds in the larger engine. A judge consulting a detail file has no signpost to the orchestration layer.

| File | Missing forward pointer to |
|---|---|
| 02 (603.1–3 expansion) | 11 (trigger engine) — the two-part APNAP process in 02 is the insertion rule that 11 §4.6 executes |
| 04 (603.4–7 expansion) | 11 (trigger engine) — intervening-if and delayed trigger controller rules feed into 11's failure matrix |
| 06 (603.8–12 expansion) | 11 (trigger engine) — state trigger, look-back, and reflexive trigger classifications feed into 11's §5 class table |
| 08 (704 expansion) | 11 and 12 — references "the Stack hub" (a document that doesn't exist in this set) instead of naming 11/12 |
| 11 (trigger engine) | 12 (game engine) — 11 is a subsystem; 12 is the full orchestration; 11 has no pointer to 12 |

**Recommended fix:** Add a one-line "FEEDS INTO:" note at the end of each detail file naming the engine file that depends on it.

---

# 3. MISSING BACKWARD POINTERS

The engine files (11 and 12) don't name the specific files they depend on. They acknowledge that subsystem modules exist but don't name them.

**File 11 (trigger engine):**
States it integrates rules 603, 704, 117, 608, and 603.3. Does not name files 01–08 as its source modules. A judge reading 11 and needing more detail has no map to which file to consult.

**File 12 (game engine):**
States "This module does not restate, in full: the complete Rule 603 module, the complete Rule 614/615/616 module, the complete Rule 704 module." Names the rule numbers but not the file numbers. The phrase "those remain the detailed authorities" gives no navigation path.

**Recommended fix:** Add a "SOURCE MODULES" section at the top of 11 and 12 explicitly listing which files cover which rules:

```
SOURCE MODULES:
- 603.1–3: files 01 (verbatim), 02 (expansion)
- 603.4–7: files 03 (verbatim), 04 (expansion)
- 603.8–12: files 05 (verbatim), 06 (expansion)
- 704: files 07 (verbatim), 08 (expansion)
- 614/615/616: files 09 (verbatim), 10 (expansion)
```

---

# 4. CONCEPT GAPS

These are topics that exist in some files but are absent from other files that need them.

## 4.1 Cleanup Step Exception — Missing from 02 and 06
**Files affected: 02, 06**

The cleanup step exception (normally no priority; if SBAs occur or triggers are waiting, priority opens) is fully documented in 11 §4.3 and 12 §5.8. However:

- File 02 (the primary expansion for triggered ability insertion) does not mention that cleanup is one of the non-standard priority windows. A judge reading 02 alone would not know to apply the cleanup exception.
- File 06 (state triggers expansion) does not mention that a state trigger becoming true during cleanup would trigger the cleanup exception. This is a live edge case: a state trigger fires in cleanup, causes SBAs, which causes the cleanup priority window.

**Recommended addition:** A note in 02 §Priority Loop Integration and in 06 §1.5 (state trigger vs standard trigger) pointing to the cleanup exception.

## 4.2 Untap Step Exception — Missing from 06
**Files affected: 06**

File 02 correctly documents that "becomes untapped" triggers don't fire if the permanent enters already untapped. Files 11 and 12 correctly document that triggers during the untap step wait until upkeep. But file 06 — which covers state triggers — does not address what happens if a state trigger condition becomes true during the untap step. State triggers during untap must also wait until the next priority checkpoint. This is not stated in 06.

## 4.3 Last Known Information — Missing from 06
**Files affected: 06**

LKI is documented in 04 (zone-change triggers and 603.6 resolution) and in 08 (704.8 — SBA-derived LKI). File 06 covers reflexive triggered abilities but does not mention LKI. A reflexive trigger checks whether an event occurred during the same resolution — if that event involved a zone change (e.g., "when you sacrifice a creature this way"), LKI governs what the trigger knows about that object. This intersection is undocumented.

## 4.4 Intervening-If and State Triggers — Missing from 06
**Files affected: 06**

File 03 covers the intervening-if clause rule (603.4). File 11 mentions it in the failure matrix. Neither 06 nor 05 addresses whether a state trigger can have an intervening-if clause. They can: a state trigger written as "Whenever [game state is true], if [additional condition], [effect]" must check the additional condition at both trigger time and resolution. File 06's state trigger section describes the firing/retriggering model but never mentions that the intervening-if rule still applies on top of it.

## 4.5 "Do This Only Once Each Turn" (603.2h) — Not Connected to Engine
**Files affected: 11**

Rule 603.2h (a triggered ability with "Do this only once each turn" tracks whether its source's controller has already taken the indicated action) is documented in 01 and 02 verbatim and in 02's expansion. But it is not in the trigger class table in 11 §5, and it is not in the failure matrix in 11 §10. This is a distinct triggering restriction — not covered by the visibility rule (603.2f), not covered by the "becomes" rule (603.2e) — that should appear as its own class entry or failure mode.

## 4.6 Simultaneous Multiple-Trigger Events (603.2c) — Not in Engine Table
**Files affected: 11**

603.2c (one event containing multiple occurrences produces one trigger per occurrence) is documented in 01/02 but absent from 11's §5 trigger class table. This is not a "class" per se, but it is a detection multiplier that affects how many triggers enter the waiting state. The table should note it under the standard event trigger entry.

## 4.7 Rule 608 Resolution Process — Gap Between 11 and 10
**Files affected: 10, 11**

File 10 (614/615/616 expansion) covers how replacement effects operate during resolution. File 11 (trigger engine) covers resolution as "triggers can fire, priority cannot be given." Neither file documents the actual resolution sequence from rule 608 — particularly:
- how a triggered ability's effect is actually executed step by step
- what "controlled by the ability's controller" means when applying effects
- when "impossible instructions" are ignored (101.3) vs when they cause partial resolution (608.2c)

This is a gap between the trigger detection/insertion layer and what actually happens when a trigger resolves.

---

# 5. TERMINOLOGY INCONSISTENCIES

## 5.1 "Waiting State" vs "Waiting Trigger" vs "Has Triggered But Is Not Yet On the Stack"

All three phrases appear across different files for the same concept:
- "waiting state" — used in 02, 11, 12 ✅ (most precise)
- "waiting trigger" — used in 11, 12
- "has triggered but is not yet on the stack" — used in 04

The concept is consistent but the terminology is not unified. 06 uses "waiting state" but only once; most of 06's descriptions just say "enters the standard waiting state" without defining it.

**Recommended fix:** Establish "waiting state" as the canonical term in a glossary note and use it exclusively.

## 5.2 "Part 1 / Part 2" vs "Two-Part Process" vs "APNAP Two-Pass"

- 01, 02: "two-part process" (verbatim from CR)
- 11 §4.6: "Part 1 / Part 2" with ability-on-ability terminology
- 12 §3.9: "Part 1 / Part 2"
- 04: references 603.3 but doesn't describe the two-part process (it's outside 04's scope of 603.4–7, but delayed triggers from 603.7 are inserted via this same process)

04 should note that delayed triggers are inserted via the 603.3b two-part process when they finally fire, as a cross-reference to 01/02.

## 5.3 "Countered by Rules" vs "Removed From the Stack"

File 11 failure matrix: "Illegal targets at insertion → removed from stack by rule (603.3c, 603.3d); not countered"
File 11 failure matrix: "Illegal targets at resolution → ability removed; does nothing" (citing 608.2b)
File 02: "the ability is simply removed from the stack" (603.3d language)
File 12 failure matrix: "Stack trigger fails to resolve with effect" — lists countering and removal together

The distinction between "countered by a spell/ability" and "countered by game rules" (which is what 608.2b does) and "removed by rule at insertion" (603.3c/3d) is a real and important three-way distinction that is blurred in 12 but correct in 11. 12 should align with 11's precision on this.

---

# 6. STRUCTURAL RECOMMENDATIONS

Based on this analysis, the following additions would close all identified gaps:

## Priority 1 — New Files Needed

| File | Coverage | Why Critical |
|---|---|---|
| 13_priority_v.md | Rule 117 verbatim (117.1–117.7) | Every checkpoint in 11/12 depends on this |
| 14_priority_t.md | Rule 117 expansion | Priority model is the foundation of the engine |
| 15_resolution_v.md | Rule 608 verbatim (608.1–608.3) | 608.2b is cited in failure matrix; 608 governs all resolutions |
| 16_resolution_t.md | Rule 608 expansion | Resolution process is the other half of the stack loop |

## Priority 2 — Additions to Existing Files Needed

| File | Addition Needed |
|---|---|
| 06 | Cleanup and untap step exceptions for state triggers |
| 06 | Intervening-if clause can apply to state triggers |
| 06 | LKI note for reflexive trigger event evaluation |
| 11 §5 | Add 603.2h ("do this only once each turn") as a trigger class |
| 11 §5 | Note 603.2c multiplier under standard event trigger class |
| 11 §10 | Add "603.2h restriction already met" as a failure mode |
| 12 §7 | Clarify three-way distinction: removed at insertion vs countered by rules vs countered by spell |
| 02 | Add cleanup step exception note to Priority Loop Integration section |
| 04 | Add note that delayed triggers insert via 603.3b two-part process |

## Priority 3 — Navigation Additions Needed

| File | Addition Needed |
|---|---|
| 02 | Add "FEEDS INTO: 11_trigger_engine.md" footer |
| 04 | Add "FEEDS INTO: 11_trigger_engine.md" footer |
| 06 | Add "FEEDS INTO: 11_trigger_engine.md" footer |
| 08 | Add "FEEDS INTO: 11_trigger_engine.md, 12_game_engine.md" footer |
| 11 | Add "SOURCE MODULES" header listing 01–08 by file number and rule coverage |
| 12 | Add "SOURCE MODULES" header listing 01–10 by file number and rule coverage |

## Priority 4 — Stub Files for Referenced Rules

These don't need full treatment but should have at least a stub noting what the rule covers and that no dedicated file exists:

- Rule 400.7 (object identity across zones) — referenced in 03, 04, 09, 10
- Rule 607 (linked abilities) — referenced in 06, 09
- Rule 609.7/609.7b (damage from a source) — referenced in 09
- Rules 601.2c–d (casting a spell, choice/target stages) — referenced in 01, 02

---

# 7. WHAT IS WORKING WELL

For completeness — the following connections and concepts are handled correctly and consistently across all files:

- The SBA loop is described consistently in 02, 08, 11, and 12 as iterative ✅
- The two-part APNAP trigger insertion (603.3b) is consistent in 01, 02, 11, and 12 ✅
- The three-state distinction (triggered / waiting / on the stack) is consistent in 02, 06, 11, 12 ✅
- Delayed trigger controller rules (603.7d–f) are in 03 verbatim, referenced correctly in 01, 02, 06, 11 ✅
- State trigger no-retrigger-while-on-stack behavior is consistent in 05, 06, 11 ✅
- Reflexive trigger immediate check is consistent in 05, 06, 11 ✅
- Look-back categories (603.10a–g) are consistent in 05, 06, 11 ✅
- 603.3d removal-by-rule vs countering distinction is correct in 01, 02, 11 ✅
- The 614.17 "can't" effects distinction from replacement effects is consistent in 09, 10, 12 ✅
- 616.1a–g selection priority order is consistent in 09 and 10 ✅
- LKI for SBA-derived zone changes (704.8) is correctly placed in 07, 08 ✅

---

# 8. SUMMARY TABLE

| Gap Type | Count | Priority |
|---|---|---|
| Missing rule files (117, 608) | 2 complete files | Critical |
| Missing rule files (607, 609.7, 400.7, 601.2c-d, 701.x) | 5 undocumented dependencies | Medium |
| Missing forward pointers | 5 files | Low |
| Missing backward pointers | 2 engine files | Low |
| Concept gaps in existing files | 7 items | Medium |
| Terminology inconsistencies | 3 items | Low |

The most impactful single addition to the set would be Rule 117 (Timing and Priority) as a new verbatim + expansion pair, followed by Rule 608 (Resolution). Everything else in the set is built on top of those two rules, and their absence is the only true structural hole in the knowledge system.
