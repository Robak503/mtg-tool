# "Loses all abilities" (CR 613.1f) — research inventory (read-only, 2026-11-01)

Taken against the master checkout (HEAD 35198906) with origin/master facts marked **(om)** (9c3162b3 memo caches; 700b4591 shifted
lines in ~20 files). **Line numbers drift: re-grep every one before editing.** Rules are paraphrased; exact text at
`knowledge/mtg-judge/data/cr/cr_current.json[<rule>].ruleText`; card text at the bundled oracle-index.json.

## 0. Re-grepped after S0a (day/abloss-s0a on fc8764ad, 2026-11-01, after the review's fixes) — these lines supersede the numbers in §1–§2
The program's S0a pass ([ABILITY-LOSS-PROGRAM.md](ABILITY-LOSS-PROGRAM.md) Status) moved layers.js, manaModel.js, gameState.js and
the parsers. The chokepoints, re-grepped on the S0a tree (definition lines):

| Where | Line | | Where | Line |
|---|---|---|---|---|
| layers `staticEffectsOf` | 1097 | | layers `collectContinuousEffects` / `rawContinuousEffects` | 1285 / 1310 |
| layers `abilityLossOf` | 1407 | | layers `withoutLostStatics` | 1461 |
| layers `withAbilityLoss` / `abilityCardOf` | 1561 / 1573 | | layers `effectiveTypeIdentity` | 1617 |
| layers `effectAffects` (cutoff) / `l6IndexOf` | 2018 / 2068 | | layers `permanentGrantedWardCosts` | 2101 |
| layers `applyLayer7` / `printedKeywords` | 2161 / 2305 | | layers `deriveCharacteristics` | 2319 |
| layers `applyTypeColorLayers` / `keywordSet` | 2428 / 2562 | | layers `permanentHasKeyword` / `keywordInstanceCount` | 2693 / 2742 |
| layers protection colours / classes | 2781 / 2821 | | layers `entersAsCreature` | 3106 |
| layers granted mana / activated / triggered | 3145 / 3171 / 3197 | | layers `addContinuousEffect` | 3688 |
| keywords `hasKeyword` / `printedKeywordsOf` | 160 / 170 | | ward `readPrintedWards`, its use | 159, 218 |
| gameState `isIndestructible` | 233 | | gameState `attachPermanent` / `addCounter` | 1328 / 2210 |
| gameState `untapAll` / `cardSelfPreventsUntap` / `groupPreventsUntap` | 2146 / 2090 / 2131 | | gameState `deathLookback` | 2999 |
| triggers `detectTriggers` / `triggersForEvent` | 4938 / 7663 | | triggers `grantedTriggersForHost` / `…ForGroup` | 7624 / 7640 |
| triggers `deadLookBackSources` / `departedLeaveSources` | 8206 / 8402 | | triggers `classLiveCard(` sites | 29 |
| legalChoices `lockedActivationSource` / `grantedActivatedForHost` | 2518 / 2564 | | legalChoices Crew `parseCrewCost(perm.card)` | 2627 |
| legalChoices `actionsActivateAbility` / `actionsDoubleManaPool` | 2698 / 3432 | | legalChoices `parseStaticAbilities(perm.card)` | 1220, 4153, 5126 |
| manaModel `manaProduction` / `manaProductionImpl` | 2111 / 2543 | | manaModel `grantedBasicTypeColors` / `manaCardOf` | 3146 / 3236 |
| manaModel `manaSources` / raw `extraManaLineProducts(perm.card…)` | 3278 / 3311, 3638 | | manaModel `extraLineSources` / `manualManaTaps` | 3635 / 3917 |
| combatEvasion `canBlockAttacker` / `memoByCardText` | 1281 / 125 | | combatEvasion `attackerMinBlockers` / `maxBlocksFor` | 347 / 763 |
| combatEvasion `selfCantAttackNow` / `selfCantBlockNow` | 993 / 1004 | | combatEvasion `grantedAttackerExceptions` / `attackerHasMenace` | 1263 / 1502 |
| combatResolution `toxicValue` | 75 | | attackRequirements `selfMustAttack` | 37 |
| enterReplacements `applyEnterReplacements` | 217 | | damageReplacements `collectDamageReplacements` | 308 |
| replacementEffects `applyCounterDoubling` | 435 | | gameEngine `lostManaTurnsColorless` / AI `detectTriggers(p.card)` | 309 / 1982 |
| staticAbilityParser board scanners (`castNoncreatureLockFor` … `combatCapFor`) | 6071–8529 | | **layers `grantedTriggeredQuotedFor` dead-look-back branches — no grant cutoff (review F5)** | **3207–3213, 3224–3231** |

**The S0b hand-off — the review's F5:** `grantedTriggeredQuotedFor`'s two branches for a permanent that has LEFT the battlefield skip the
grant cutoff: the stored fixed-ids grants (3207–3213) are matched by id alone, and the dynamic grants (3224–3231) go through
`effectAffects` on the departed look-back, where `abilityLossOf` answers null because the id is gone. A Feign Death grant made before
a Turn to Frog would still fire as the creature dies. Route them with the look-back (§1.9 — the death look-back stamps the view).

## 0b. The S0b hand-off, ROUTED (day/abloss-s0b on 24f69959, 2026-11-01 — every line re-grepped on that tree)
Every item of the hand-off above now reads a permanent that lost its abilities through the ability view. Four mechanisms (ENGINE-SCAFFOLD
§4.6 "The routed readers"): **the view** — `layers.withAbilityLoss(state, perm, base?)` over each reader's existing base (the stripped
view after a loss, the base itself on every other board), and `abilityView.abilityViewOf` (the same function, registered by layers.js)
for the modules layers.js imports; **the look-back stamp** — `layers.abilityLossStamp` writes `lkiAbilityLoss` on a death or leave
look-back, and withAbilityLoss reads it first (CR 603.10a); **the attachment cutoff** — `layers.attachedGrantCutByLoss(state, host,
attachment)` (CR 613.7e); **the entering side** — `layers.entersWithoutAbilities` / `enteringAbilityCard` (CR 614.12). The board fast
path asks no collection: `boardLossEffects` answers "none" off the stored effects' array (one memo per array) while no shape of the
registry can emit (`abilityLossShapes.abilityLossShapesMayEmit`); and every scan over live battlefield permanents asks
`boardHasAbilityLoss` once before its loop and reads `p.card` directly when it answers false (the list: ENGINE-SCAFFOLD §4.6 "one board
test per scan").

| Hand-off item | Where now | Routed how |
|---|---|---|
| triggers `triggersForEvent` + the 29 `classLiveCard(` scans | triggers 7628 (`liveTriggerCard`), 7684; 29 call sites | `liveTriggerCard`: the board test first, then `withAbilityLoss(state, perm, classLiveCard(perm))` (a look-back's stamp is read whatever the board) — the one trigger chokepoint |
| triggers `grantedTriggersForHost` | triggers 7644 | the attachment's own text through the view; the host's cutoff (`attachedGrantCutByLoss`) |
| triggers `deadLookBackSources` / `departedLeaveSources` (+ the self-dies, leave, orphaned-Aura, planeswalker look-backs) | triggers 8227 / 8423 (`lookBackLoss` 7635) | each look-back carries its record's `lkiAbilityLoss` |
| gameState `deathLookback` / the leave-event constructor | gameState 3012 / 1672 | `...abilityLossStamp(state, perm)` (the leave event: off `before`, the board it left); the death look-back's Rivaz grant (`diesExileAfter`, a granted "When this creature dies, exile it" kept as a flag) is dropped under any loss — the grant is always the older (given to the spell, CR 400.7a) |
| sacrifice and planeswalker look-backs | costSacrifice 53, 54, 82, 95; removal 350, 353; spellEffects 1434; gameState 359, 3263 (the legend rule) | `...abilityLossStamp(state, perm)` |
| layers `grantedTriggeredQuotedFor` dead-look-back branches (review F5) | layers 3367, 3385 | `grantCutByLoss(lookBack.lkiAbilityLoss, e, "ability")` |
| triggers Prowess | triggers 10755 | `hasKeyword(withAbilityLoss(state, perm), "Prowess")` |
| triggers' block-trigger synthesizers (rampage, the per-blocker pump, contact damage, basilisk touch, the blocks-a-flyer pump) and the exalted / flanking printed counts | `checkBlockTriggers` 8764 (8860 …); 8680, 8897 | `ownText` 7637 — the creature's own text through the view (they read the oracle directly, so the call-pattern lint could not see them; the text rule now does) |
| the AI's `detectTriggers(p.card)` | gameEngine 1983 (blink gain); opponentAI 1297 (re-buy), 301 (land drop) | the RETURNING object's abilities: `enteringAbilityCard` (it re-enters as a new object, CR 400.7) |
| legalChoices `grantedActivatedForHost` | legalChoices 2575 | the attachment's text through the view; the host's cutoff |
| legalChoices Crew, `actionsActivateAbility`, `actionsDoubleManaPool`, loyalty | legalChoices 2630, 2739, 3446, 4438; actionDispatcher 1459 | `parseCrewCost` / `crewPowerBonus` / `parseActivatedAbilities` / `parseLoyaltyAbilities` over the view |
| legalChoices `parseStaticAbilities(perm.card)` + the cast locks | legalChoices 1220, 4104, 4127, 4167, 5141; 541, 571, 4835, 4936, 5004 | the view |
| legalChoices cost reducers / taxers / equip overrides (list-taking scanners) | legalChoices 1288, 1292, 1298, 2725, 2729, 3691 | `abilityViewPermanents(state, list)` (the list itself on a loss-free board) |
| legalChoices sacrifice / bounce victims' fail-safe | `ownOracleOf` 2532 (10 sites) | the victim's text through the view |
| manaModel `manaCardOf` / `manaSources` / raw `extraManaLineProducts` / `manualManaTaps` | manaModel 3238, 3244 (`ownManaCardOf`), 3286, 3644; manualManaTaps 3927 reads manaSources | the copy-aware base through the view; the per-line reads over `ownManaCardOf` |
| manaModel Aura land boost / tap augments / lands' could-produce | manaModel 2893, 2934, 3176 | the carrier's text through the view |
| combatEvasion `canBlockAttacker` and its selfOracle readers | combatEvasion 1281 | `lossy` (one `boardHasAbilityLoss` per call), then both cards, the team gate and the group restrictions through the view |
| combatEvasion `attackerMinBlockers` / `maxBlocksFor` / team block count / `selfCantAttackNow` / `selfCantBlockNow` | 347 / 763 / 759 / 993 / 1004 | the view |
| combatEvasion `grantedAttackerExceptions` / attached prevention / prevent-and-put | 1263 / 695 / 663, 642 | the attachment's (or the group carrier's) text through the view — a restriction is a quality of the host (CR 113.12), so only the carrier's loss ends it |
| combatEvasion `attackerHasMenace` | 1507 | `permanentHasKeyword` (S0a's seed) |
| combatResolution `toxicValue`, the walls, Wolverine's arm, assign-as-unblocked | combatResolution 533; 271, 324, 364, 459, 480, 509, 516, 619; spellEffects 1592, 1602 | the view |
| attackRequirements `selfMustAttack` / must-attack-unless | attackRequirements 63 (`mustAttackNow`) | the view |
| ward `readPrintedWards` / the loose cost | ward 211 | the view (a later ward grant still counts) |
| gameState `isIndestructible` fallback | gameState 233 | the view — a stamped look-back reads stripped |
| staticAbilityParser board scanners (`castNoncreatureLockFor` … `defenderAttackCapFor`) | staticAbilityParser 6073–8549 (15 sites) | `abilityViewOf` |
| textNormalize scanners, attack tax | textNormalize 426, 440, 454, 501, 510; attackTax 159, 180 | `abilityViewOf` |
| replacementEffects `applyCounterDoubling` + multipliers, mana multiplier | replacementEffects 374 (`allDoublers`), 620 | the view |
| damageReplacements `collectDamageReplacements` / `combatDamageUnpreventable` | damageReplacements 294 (`liveCard`), 336 | the view over the Class view |
| gameState `untapAll`: `cardSelfPreventsUntap` / `groupPreventsUntap` / attached no-untap | gameState 2118, 2132, 2069; seedbornUntap 64, typeFilteredUntap 120 | the view |
| gameState graveyard / death replacements (Rest in Peace, the leaving permanent's shuffle-instead, the exile-instead statics), totem armor, life floor, life-loss multiplier, Oath's loyalty | gameState 764, 896, 3043, 2838, 2849, 1902, 2615, 2600, 318 | the view |
| gameEngine `lostManaTurnsColorless`; the cleanup's no-maximum-hand-size scan; gameState's radiation life-gain replacement | gameEngine 309, 968; gameState 2760 | the view |
| the AI's crack-back estimate and punisher pick | opponentAI 3942; punisher 156 | the view |
| enterReplacements `applyEnterReplacements` | enterReplacements 218 (`own` 231); others 132, riot 174; actionDispatcher 211 (the land drop) | its own text through `enteringAbilityCard`; the others' statics through the view; a granted riot dropped when a loss reaches it (the under-read) |
| layers `permanentHasKeyword` seed (S0a found-not-fixed (2)) | layers 2799 | `copyBaseOf(state, perm).card` (the derive's seed), O(1) on a board with no copy effect (`boardCopyEffects` 1063) |
| the remaining whole-card hooks | annihilator 99, resolvers 246 (soulbond), urDragonAttack 125, vihaanAnimate 90, wolverine 54, auraEntry 197 / 211, groupWard 76, fetchLand 54, tokenLoopLine 62, loopStepLine 237 (routed at integration), outletFinishLine 109, triggerTargetRestraint 70, removal 243, spellEffects 848 | the view |

**Left on the printed card, by design** (the source lint's two allowlists, `abilityLossLint.test.js`): layers.js's two Changeling reads
(a characteristic-defining ability applied in layer 4, before the layer-6 loss — CR 702.73a, 613.3); manaModel `tapCostPayerOrder` (a
payer sort key with no state); triggers' `gyEnterSelf` (a card in a graveyard, not a permanent); boardEval `isUntappedManaSource` (the
AI's stateless estimate); gameState `recordLeaveEvent`'s sourceLki test (it records data, applies no ability); sba.js's Aura Enchant
legality (an Aura that lost its enchant restriction is S5's — the Enchant union, backlog E6). Outside the lint: the Saga's lore counter
(a game rule, CR 714.3a); gameEngine `entersTriggerRemovesOwn`'s printed pre-filter (the decision is its simulated board's own trigger
check, which reads the view).

**What S0a consumed from this inventory:** §1a's layers.js seeds (`keywordSet`, `permanentHasKeyword`, `keywordInstanceCount`, the
protection reads, granted ward), §1d's `staticEffectsOf` / `collectContinuousEffects` (the filter), §1e's 7a CDAs (dropped with the
lost permanent's statics), the name tables of §1c (BASIC_LAND_MANA, KNOWN_ROCKS, `grantedBasicTypeColors`) and §1d (cardEffects'
REGISTRY, STATIC_REGISTRY), and §2's missing pieces (attach and counter timestamps, layer 4 in timestamp order, `setCardTypes`, a
live replace-every-creature-type op). Everything else in §1 is S0b's — every reader outside layers.js still parses the printed card.

## 1. Every ability reader
**Structural fact:** every reader parses the PRINTED card (`perm.card`), its face-up view, or a Class level view — except the
layer-6 readers in layers.js, which work off collected effects. No layered "abilities" view exists. Per-card caches key on the
card OBJECT or its TEXT → a flag on the permanent is invisible to them.

### 1a. Keywords and evasion
- `hasKeyword` keywords.js:160 (om: memoised per face-up text — textEntry:198, _textMemo:196; printedKeywordsOf:170) — printed
  text + `card.keywords` read LIVE (not in the memo key).
- `printedKeywords` → `keywordSet` layers.js:1861, 2058 — the layer-6 seed: printed keywords, keyword counters (:2061, no
  timestamp), `suspected` (:2069), then add/removeKeyword in timestamp order.
- `permanentHasKeyword` layers.js:2182 — printed seed `hasKeyword(perm.card)` :2187, counters, suspected, `kickedKeywords`
  (:2199), then the l6 index. ~115 runtime callers in 21 files funnel through this seed.
- `keywordInstanceCount` layers.js:2227 — caller supplies a printed count (flankingKeywordCount, exaltedKeywordCount, triggers.js).
- Protection colours / classes layers.js:2265 / 2305 — printed `parseProtectionColors(perm.card)` (om: memoised per text,
  protection.js:106) + addProtection effects.
- Ward layers.js:1661 (granted); ward.js:159 `readPrintedWards`, used :218 (ward is a triggered ability, CR 702.21a).
- Indestructible fallback gameState.js:233–239 `isIndestructible` — printed hasKeyword when off the battlefield.
- Other direct printed reads: triggers.js:10656 (Prowess); everyCreatureType.js:52 (Changeling); cloneCopy.js:850;
  staticAbilityParser.js:7137 (soulbond); (om) layers `creatureTypesInDerive` (Changeling).
- combatEvasion.js — ~45 readers over `selfOracle(card)`, memoised by NAME + TEXT (memoByCardText:125, selfOracleMemo:113; om
  teamPowerBlockGateMemo:1031). Entry points reading perm.card: canBlockAttacker:1261 (aCard/bCard :1273–1274; isSelfCantBlock,
  hasUnleash, isCanBlockOnlyFlyers…), attackerMinBlockers:347, maxBlocksFor:747, selfCantAttackNow:977, selfCantBlockNow:988,
  groupPreventPutCounters:652, attachedDamagePrevention:679, grantedAttackerExceptions:1243, attackerHasMenace:1482.
- Combat damage combatResolution.js:75 `toxicValue` (used :528) — printed. Must-attack attackRequirements.js:37 `selfMustAttack`.

### 1b. Triggered abilities
- `detectTriggers` triggers.js:4900 — cached per card object (`_detectCache`).
- Central dispatcher `triggersForEvent` triggers.js:7599 merges: printed `detectTriggers(classLiveCard(sourcePermanent))` :7603;
  `grantedTriggersForHost` :7560 (reads the ATTACHMENTS' printed text — bypasses layers); `grantedTriggersForGroup` :7576 via
  layers.grantedTriggeredQuotedFor:2681.
- ~28 more direct `detectTriggers(classLiveCard(watcher))` scans in triggers.js: 9151, 9495, 9643/9648/9659, 9676
  (youSacrificeThis), 9711, 9755, 9769, 9800, 9824, 9879, 9957/9970, 10107, 10156, 10189, 10220, 10275, 10290, 10306, 10545
  (cast), 10627 (heroic), 10668, 10684, 10779, 10981. **`classLiveCard` is used at 32 sites in triggers.js** — the existing
  per-permanent chokepoint.
- Look-back (CR 603.10a): `deadLookBackSources`:8142 uses `w.card` from `gameState.deathLookback`:2972 (the single death
  look-back constructor); `departedLeaveSources`:8338 uses `e.card` — both printed (RUN-LEDGER ~889 logs it as a known gap).
- Trigger suppressors (textNormalize.js): creatureEntersSuppressed:502, entersSilencer:495, entersDontTriggerOf:412.
- Whole-card hooks: applyAnnihilatorTriggers (annihilator.js:89), applySeedbornUntap (seedbornUntap.js:55),
  applyTypeFilteredUntap (typeFilteredUntap.js:108), parseUrDragonAttackTrigger (urDragonAttack.js:56), Vihaan, Wolverine, Kira.
- AI heuristics: gameEngine.js:1982/2284, opponentAI.js:273/1298 call `detectTriggers(p.card)`.

### 1c. Activated abilities, incl. mana
- `parseActivatedAbilities` effects/abilities.js:1257 — NO cache.
- legalChoices.js `actionsActivateAbility` 2654–2673: printed :2662, `grantedActivatedForHost`:2501 (attachments' printed text —
  bypasses layers), `grantedActivatedQuotedFor` :2669; `actionsDoubleManaPool` 3369/3378; Crew 2563–2564
  (`parseCrewCost(perm.card)`); loyalty ~4372; `lockedActivationSource`:2455 = the per-permanent "activatedAbilitiesLocked" gate
  shared by these 4 enumerators — a precedent for a per-permanent gate.
- manaModel.js `manaSources`:3267: `manaCardOf`:3225 (copy-aware) at :3295/:3311; raw `extraManaLineProducts(perm.card, …)` :3300;
  locked gate :3308; `grantedBasicTypeColors`:3139 (intrinsic basic-type mana, CR 305.6) :3338; `withGrantedMana` →
  layers.grantedManaSpecsFor:2629 at :3357. `manualManaTaps`:3890; `extraLineSources`:3624. `manaProductionImpl`:2543 checks
  NAME-KEYED tables first: BASIC_LAND_MANA (:79, hit :2614), KNOWN_ROCKS (:91, hit :2617). `_prodMemo`:1523 per card object.
  Other readers: opponentAI (5), fetchLand (2), tokenLoopLine, outletFinishLine.

### 1d. Statics, continuous effects, restrictions, cost / replacement effects
- layers.js `staticEffectsOf`:989 — sources: STATIC_REGISTRY by name (:69, :993); `parseStaticAbilities(classLiveCard(permanent))`
  :1002 (cached per object, staticAbilityParser.js:5514 _cardSlot); parseAttachedBonus (:1038), bestow/reconfigure type removal
  (:1050/:1066), Aura-granted mana ability (:1080), soulbond (:1101). `collectContinuousEffects`:1173 adds emblems (:1132) and
  graveyard statics (:1154); memoised per state (_boardMemo).
- Board scanners outside the layers (each passing perm.card) — staticAbilityParser.js: castNoncreatureLockFor:6051,
  abilitiesAsThoughHasteFor:6061, landDropAllowance:6091, uncounterablePlayersOnBattlefield:6200, stackSpellIsUncounterable:6251,
  playFromTopPermission:6316, plotFromLibraryTopGranted:6355, playLandFromGraveyardPermission:6369, boastTwiceFor:7465,
  escapeGrantsFor:7472, artifactActivationsLocked:7622, impositionEntersTapped:7674, combatCapFor:8505. legalChoices.js:
  parseStaticAbilities(perm.card) at 1189, 4027, 4050, 4090, 5044 + activated cost reducers 2648. textNormalize.js:
  skipsDrawStep:422, extraTurnSkipped:435, grantsWubrgAltCost:450. replacementEffects.js: doublerProfile(perm.card) :378,
  applyCounterDoubling:435, draw/token/mill multipliers 259/472/498, life-gain replacement 524, mana multiplier :623.
  damageReplacements.js collectDamageReplacements:308 via liveCard:293. gameState.js untapAll:2148 (cardSelfPreventsUntap:2082,
  groupPreventsUntap:2123). cardEffects.js manaDoesNotEmpty:61 — by NAME on REGISTRY:39. (700b4591 added combat-cap readers —
  re-grep `attackCapAgainstYou` / the Crawlspace cap.)

### 1e. CDAs
Layer-7a P/T CDAs from self statics (ptSetDynamicCount isCDA), applied layers.js:1738. Changeling printed (everyCreatureType.js:52).
Devoid `_isDevoidCard`:861, colorsOf:868; colours from permanentPrintedColors:892. Printed `*` P/T reads 0 in ptPrimitive.

### 1f. Entry replacement (CR 614.12)
enterReplacements.applyEnterReplacements:217 — the one reader for cast and non-cast entry; reads the entering card's printed text.

**Count:** ~150 consult points → ~10 chokepoints. Non-test: detectTriggers ~80 calls (33 per-permanent at runtime);
parseActivatedAbilities 33 (12 runtime); parseStaticAbilities 44; manaProduction 31; ~100 named functions receive an `x.card`.

## 2. The layer system today
deriveCharacteristics layers.js:1877, memoised per (state, id) in _charMemo.
- L1 copy: latestCopySource (:909, :1918–1922) swaps perm.card. L2–3: no-ops (control outside layers). L4: applyTypeColorLayers:1984
  (removeTypeWhileDevotionBelow, gates, removeCardType, setCreatureSubtypes with a precomputed `replaces` list, add types) — in
  COLLECTION order, NOT timestamp-sorted. L5: applyColorLayer:898, timestamp-sorted. L6: keywordSet:2058 add/removeKeyword in
  timestamp order; addProtection / addWard / addAbility read separately via l6IndexOf:1630 or the collection, plus
  effectAffects:1590. L7: applyLayer7:1721 — runs BEFORE layer 6 in code (harmless today).
- NO ability-wide removal op; no "can't have" (CR 113.11). The l6 vocabulary mixes real abilities with rules-effect
  pseudo-keywords (cantBlock, cantAttack, mustAttack, goaded, unblockable, activatedAbilitiesLocked, attacksIgnoringDefender,
  blockCapOne, assignsCombatDamageAsUnblocked, cantBlockSource:*, mustBlockSource:*, cantBeBlockedExceptBy:*) with no marker of
  which is which.
- Timestamps: stamped at entry (resolvers.js:92–97; zones.js:411); staticEffectsOf gives a permanent's statics its timestamp
  (:1110); resolution effects take state.timestampCounter (addContinuousEffect:3172). **Attaching does not restamp (CR 613.7e
  unmodelled)** — attachPermanent gameState.js:1328 sets none. **Counters have no timestamp** (addCounter:2202; CR 613.7c).
- Dependency (CR 613.8) unmodelled; only layer-4-before-6/7 selector reads via recursion-free partial readers
  (effectiveTypeIdentity:1213, boardCountColors:929, copyBaseOf:944); re-entry guards _ptPredicateInProgress,
  _withKeywordInProgress, _selectorColorInProgress. CDA-first ordering (CR 613.3) only in orderEffectsForPermanent:3140 (tests
  only). effectiveTypeIdentity relies on all transformation cards being parked (RUN-LEDGER ~10212).
- Memo-safe place for the fact: a per-state memo in layers.js (`abilityLossOf`), like _boardMemo / _cardTypeChangeMemo:209 /
  boardChangesCardTypes:210, plus the VIEW card (see the program doc). Every memo that would be defeated by a permanent flag:
  faceUpView _faceMemo (om faceUp.js:132), hasKeyword text memo (om keywords.js:196), protection text memo (om protection.js:106),
  memoByCardText, typeLineWords line memo (om layers.js:139), _detectCache, _cardSlot, _prodMemo, effects/parseMemo,
  auraPrintedSide READINGS.

## 3. Existing partial support
- auraPrintedSide.js only reads which side an Aura belongs on ("strips" marker :199; whole transformation = enemy :262–272); feeds
  auraEntry.auraCastIntent:93 (the AI's cast / entry choice). Sets no type / colour; touches no tier or runtime. Body-only
  transformation Auras are ALREADY cast on enemy creatures and do nothing (Kenrith's Transformation draws and nothing more).
- Alpine Moon (manaModel.js stripNonSelfQuotedGrants second pass :1476–1497) only stops Alpine Moon crediting ITSELF a phantom {C};
  nothing applied to anyone's lands; body-only.
- "Loses <keyword>" = single-keyword removeKeyword op: staticAbilityParser.js:6731–6738 (Colossus Hammer, native); honoured in
  keywordSet:2082, permanentHasKeyword:2212, keywordInstanceCount:2243; auraPrintedSide:200 reads it as enemy.
- Type ops existing: removeCardType, removeTypeWhileDevotionBelow, setCreatureSubtypes, addCardType, setColor/addColor, ptSet (7b).
  Missing: setCardTypes; a live replace-all-creature-types op.
- Precedents: classLiveCard (classLevels.js:160) per-permanent view; manaCardOf:3225; lockedActivationSource:2455 + the gate at
  manaSources:3308; entersAsCreature (layers.js:2590, CR 614.12 entering side); deathLookback (gameState.js:2972, already stamps
  last-known types / colours / keywords).
- Humility, Opalescence, Blood Moon, Magus of the Moon, Alpine Moon, Dress Down, Blood Sun: body-only, parseStaticAbilities []
  → inert. Turn to Frog: arbiter-spell — setBasePtTargetClauseParser (effects/atoms/combat.js:3114) anchored so the "and loses all
  abilities" rider fails; splitClauses.js:840 splits it; pinned by setBasePtTarget.test.js:56–63.
- Prior analysis in repo: Darksteel Mutation parking note (RUN-LEDGER ~3487–3499); backlog item E6 (UPGRADE-BACKLOG.md:261–276).

## 4. The classifier
classifyCard coverage.js:3334, all-or-nothing. Auras (:3633–3742) via isNativeAura (staticAbilityParser.js:7762) → parseAuraBonus
→ parseAttachedBonus:6900 → parseAttachedClauseCore:6505; unclaimed → "body-only" :3741. Spells need parseEffectProgram high
confidence; global statics staticAbilitiesCoverCard:6389; planeswalkers planeswalkerNativelyCovered. Measured: 90 commander-legal
carriers of the phrase — 71 body-only, 16 arbiter-spell, 3 arbiter-pw, NONE native (parked organically: no parser recognises the
clause). Coupling: staticEffectsOf applies parseAttachedBonus to any attached Aura whatever its tier (layers.js:1038, note :1078).

## 5. Rules (paraphrased)
613.1 / 613.1a–g layers (6 = ability-adding, keyword counters, ability-removing, can't-have); 613.3 CDAs first in 2–6, then
timestamp, dependency may reorder; 613.4a–d layer 7 sublayers; 613.6 an effect that began applying keeps applying to the same
objects in later layers even if its ability is removed partway; 613.7 timestamps (a static effects; b resolved; c counters, restamp
on add; d zone entry; e Aura/Equipment restamped on attach; m–n APNAP ties, own static earlier); 613.8a–c dependency; 613.9 grant vs
remove by timestamp, latest wins; 113.10 / 113.10b / 113.11 loses / can't have; 113.12 setting a characteristic or a quality (can't
be blocked) is not an ability (Muraganda Petroglyphs); 305.6 / 305.7 basic land types' intrinsic mana; setting a land subtype
removes rules-text abilities, not granted ones; 603.6b example: under "all creatures lose all abilities" an entering creature's ETB
doesn't trigger; 603.10a look-back; 614.1c/d / 614.12 enters-with checked against the permanent as it would exist (Yixlid Jailer +
Scarwood Treefolk example); 604.3 / 604.3a CDAs; 611.2c vs 611.3a locked vs unlocked affected sets; 707.2 copiable values; 205.1a/b
setting card types replaces, "[creature type] artifact creature" exception; 702.12b indestructible; 702.21a ward is triggered.
Bundled rulings: Kenrith's Transformation / Lignify / Turn to Frog / Darksteel Mutation remove only the abilities it had AT THAT
TIME (later gains work); earlier base-P/T sets overwritten, pumps and counters still apply; supertypes and commander designation
kept; a colour CDA still works, Changeling and P/T CDAs overwritten; Imprisoned in the Moon: a Plains stays a Plains, taps only {C};
Humility/Opalescence by layer-7b timestamps; Turn to Frog on a Theros God: its type ability still applies.

## 6. The family (bundled oracle; commander-legal unless marked)
- Aura, stays a creature, loss + P/T / subtype / colour: Lignify #2322, Utter Insignificance #7078, Kasmina's Transmutation #7513,
  Noggle the Mind #10997, Fresh Start #12781, Ichthyomorphosis #14300, Retro-Mutation #15624, Mystic Subdual #16208, Quantum
  Reduction #25650. Tap / no-untap riders: Observed Stasis #5339, Frozen in Ice #14780, Flood the Engine #15795, Stop Cold #15859,
  Tamiyo's Compleation #16329, Enchanted River's Grasp #17994, Infinite Coursework #29912, Duskmourn's Domination #23247
  (control), Ray of Frost #23763 (conditional).
- Aura replacing card types: Kenrith's Transformation #743, Amphibian Downpour #1230, Eaten by Piranhas #3898, Frogify #4689,
  Reprobation #5774, Trickster's Elk #6040 (bestow), Unable to Scream #3954 (adds Toy artifact). Name change: Witness Protection
  #1959, Honest Work #8711 (+ {T}: Add {C}).
- Aura + a grant from the same effect: Darksteel Mutation #586, Spider-Man No More #7971, Stasis Field #13585, Deep Freeze #18199
  (defender), Heliod's Punishment #15211 (granted activated).
- Aura → noncreature with a granted ability: Imprisoned in the Moon #765, Minimus Containment #7952, In Too Deep #12332, Sugar Coat
  #13824.
- EOT spells, single target: Turn to Frog #8993, Mercurial Transformation #17463, Obscura Confluence #17620, Ovinize #17393, Turn //
  Burn #19305, Snakeform #20095, Dragonshift #21403 / Dance of the Skywise #28413 (gain flying), Humble #22068, Gift of Tusks #23742,
  Flourishing Grapple #30754. Groups: Sudden Spoiling #2088, Final Showdown #2217, Polymorphist's Jest #4618, Day of Black Sun
  #6348, Hunted by The Family #9815.
- Global statics: Humility #11668, Dress Down #3947, Sludge Monster #4039, Poppet Factory #6660, Overwhelming Splendor #8661,
  Toxicrene #13694, Blood Sun #15865 (except mana abilities), Titania's Song #16554, Spark Rupture #22235, Yixlid Jailer #25794.
- From triggers / activations: planeswalkers Vraska #1311, Oko #2110, Will Kenrith #12589 (OUT OF SCOPE — planeswalker program);
  creatures Tishana's Tidebinder #2797, Azure Beastbinder #4138, Kitesail Larcenist #4319, Warkite Marauder #6550, Opportunistic
  Dragon #8300, Abigale #8409, Curious Colossus #8786, Vedalken Humiliator #8914, Merfolk Trickster #9852, Lizard, Connors's Curse
  #10566, The Wondrous Wasp #13079, Soul Sculptor #27511; artifacts The Irencrag #3935, Barrow-Blade #7200, Immovable Rod #13108,
  Monument to Perfection #14342, The Curse of Fenric #18441, Primordial Plasm #18755; self-targeting Nullhide Ferox #23901, Chromium
  #17029.
- Return themselves stripped: Xu-Ifit #4971, Harold and Bob #8981, Bronzehide Lion #9987, Retched Wretch #21451, Hellcat #22634.
- Not commander-legal: 16 more (Wrath of Oko, Fowl Play, Very Cryptic Command, …).
