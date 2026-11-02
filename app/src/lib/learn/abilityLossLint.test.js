/**
 * abilityLossLint.test.js — THE SOURCE LINT of the ability-loss program (docs/orchestration/ABILITY-LOSS-PROGRAM.md §5.5; rebuilt
 * inverted after the S0b review's F4).
 *
 * A permanent that lost all its abilities (CR 613.1f) must read as one with none to every reader of its abilities. The card a
 * battlefield permanent carries (`perm.card`) is its PRINTED card, so a battlefield permanent's card reaches an ability reader only
 * through the ability view — layers.withAbilityLoss / abilityCardOf (abilityView.abilityViewOf in the modules layers.js imports), the
 * look-back stamp, the entering side (layers.enteringAbilityCard).
 *
 * THE INVERSION (the review's F4c): the first lint listed the known ability readers and matched one call shape, `reader(<x>.card)`,
 * so an unlisted reader, a call-result argument (`findPermanent(…)?.permanent?.card`), `x.card || y` and an alias all passed it. This
 * one lists what MAY take a printed card and flags everything else. It reads the engine's source (comments, strings, regex and template
 * contents blanked; calls spanning lines followed) and fails on:
 *   1. A PRINTED CARD INTO A CALL — any argument, in any position, whose value can be a permanent's card object (`<expr>.card`,
 *      `<expr>.card || …`, `<expr>.card ?? …`, a ternary branch — not a member read like `.card.name`, not inside an inner call or an
 *      object literal, which are scanned as their own sites), handed to a function that is NOT
 *        · a CHARACTERISTIC READER (closed list: functions that read a card's characteristics — name, type line, mana cost / value,
 *          colours, P/T, printed loyalty — and never its rules text; every definition of each name is checked to read no rules text),
 *        · a CARD HANDLER (closed list: the ability view itself and the copy path — functions that take the card as a BASE),
 *      unless the argument is the ROUTED form (`<board test> ? withAbilityLoss(<state>, X) : X.card` — the view under a loss, the
 *      printed card on a loss-free board) or the site is in SITE_ALLOWLIST with its reason;
 *   2. AN ALIAS OF A PRINTED CARD (`const card = perm.card` …) that then reaches a non-characteristic call or a direct text read in the
 *      same function, outside ALIAS_ALLOWLIST;
 *   3. A DIRECT TEXT READ — `<x>.card.oracle` / `<x>.card?.oracle_text` (a reader inlined at its call site) outside TEXT_ALLOWLIST;
 *   4. A CLASS VIEW read unwrapped — classLiveCard(…) outside layers.js / classLevels.js on a line that does not hand it to the view;
 *   5. A PRINTED GRANT read outside the layer system — a reader of the abilities one permanent GRANTS others (GRANT_READERS: an Aura's or
 *      Equipment's "Enchanted creature has …", Kira's "Creatures you control have …") on a battlefield permanent, in a function that does
 *      not apply the recipient's cutoff (layers.attachedGrantCutByLoss — a grant older than the recipient's loss is removed, CR 613.7);
 *   6. A STALE entry — every allowlist entry matches the source exactly (site and count) and states its reason.
 * Allowlist entries are keyed by SITE: the file, the enclosing top-level function, and the call (callee + argument) or holder — never by
 * file alone, so a new read in the same file is a new site. A new reader of a permanent's text needs no registration: it is flagged
 * until it routes through the view or earns an entry with its reason.
 *
 * Known limits: a card that reaches a reader through a function parameter is caught where the caller hands it over (rule 1), not
 * inside; a destructured `{ card }` and an expression inside a template literal are not scanned.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEARN = path.dirname(fileURLToPath(import.meta.url));

// ─── the closed lists ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// CHARACTERISTIC READERS — each reads a card's type line, mana cost / mana value, colours, P/T or printed loyalty (CR 613.1: a loss in
// layer 6 changes none of these), never its rules text or keywords. `defs`: every module that defines a function of that name (checked:
// a second definition elsewhere fails until it is classified, and no definition may read rules text).
const CHARACTERISTIC_READERS = [
  { fn: "typeStr", defs: ["effects/atoms/winGame.js", "interveningIf.js", "triggers.js"], reads: "the type line" },
  { fn: "typeLineOf", defs: ["faceUp.js", "layers.js", "legalChoices.js", "manaModel.js"], reads: "the type line" },
  { fn: "typeLineStr", defs: ["effects/atoms/shared.js"], reads: "the type line" },
  { fn: "faceUpTypeLine", defs: ["faceUp.js"], reads: "the type line of the face that is up" },
  { fn: "characteristicTypeLine", defs: ["faceUp.js"], reads: "the characteristic type line" },
  { fn: "frontFaceType", defs: ["triggers.js"], reads: "the front face's type line" },
  { fn: "cardTypesOf", defs: ["layers.js"], reads: "the card types" },
  { fn: "subtypesOf", defs: ["actionDispatcher.js", "layers.js"], reads: "the subtypes" },
  { fn: "printedCreatureSubtypes", defs: ["choicePolicy.js"], reads: "the creature subtypes" },
  { fn: "subtypeFilterMatches", defs: ["triggers.js"], reads: "a subtype filter against the type line" },
  { fn: "permHasChosenType", defs: ["triggers.js"], reads: "a chosen subtype against the type line" },
  { fn: "cardHasChosenType", defs: ["effects/atoms/library.js", "enterReplacements.js"], reads: "a chosen subtype against the creature types" },
  { fn: "isLand", defs: ["choicePolicy.js", "effects/atoms/library.js", "effects/atoms/zones.js", "effects/runProgram.js", "gameFeatures.js", "legalChoices.js", "mulliganPolicy.js", "trapDetector.js"], reads: "the Land type" },
  { fn: "isLandCard", defs: ["discardLandToEnter.js", "effects/atoms/hideaway.js", "effects/atoms/shared.js", "manaUntapLine.js"], reads: "the Land type" },
  { fn: "isLandFront", defs: ["fetchLand.js"], reads: "the front face's Land type" },
  { fn: "isPlaneswalker", defs: ["gameState.js"], reads: "the Planeswalker type" },
  { fn: "castsAsPlaneswalker", defs: ["gameState.js"], reads: "the front face's Planeswalker type" },
  { fn: "enteringTypeWords", defs: ["layers.js"], reads: "the types an entering card has (entersAsCreature — a God below its devotion, a bestowed card)" },
  { fn: "isArtifact", defs: ["legalChoices.js"], reads: "the Artifact type" },
  { fn: "isAuraCard", defs: ["staticAbilityParser.js"], reads: "the Aura subtype" },
  { fn: "isRoleCard", defs: ["auraEntry.js"], reads: "the Role subtype" },
  { fn: "isCreatureCardType", defs: ["manaModel.js"], reads: "the Creature type" },
  { fn: "isSnowPermanent", defs: ["manaModel.js"], reads: "the Snow supertype" },
  { fn: "isHistoricPermanent", defs: ["legalChoices.js"], reads: "the historic types (artifact, legendary, Saga)" },
  { fn: "sacrificePoolMatch", defs: ["effects/atoms/removal.js"], reads: "a named token pool against the name and type line" },
  { fn: "permanentPrintedColors", defs: ["layers.js"], reads: "the printed colours" },
  { fn: "tutorManaValue", defs: ["effects/atoms/library.js"], reads: "the mana value" },
  { fn: "manaValueOf", defs: ["cardPlayHints.js", "legalChoices.js", "manaUntapLine.js"], reads: "the mana value" },
  { fn: "manaValueOfCard", defs: ["cloneCopy.js", "effects/atoms/library.js"], reads: "the mana value" },
  { fn: "manaValueOfCardLocal", defs: ["interveningIf.js"], reads: "the mana value" },
  { fn: "mvOf", defs: ["effects/atoms/removal.js", "legalChoices.js", "manaModel.js", "mulliganPolicy.js"], reads: "the mana value" },
  { fn: "mv", defs: ["effects/atoms/zones.js", "gameEngine.js"], reads: "the mana value" },
  { fn: "altCardMv", defs: ["opponentAI.js"], reads: "the mana value" },
  { fn: "devotionPips", defs: ["effects/atoms/shared.js"], reads: "the mana cost's pips" },
  { fn: "ptScore", defs: ["cloneCopy.js"], reads: "the printed power and toughness" },
  { fn: "startingLoyalty", defs: ["gameState.js"], reads: "the printed loyalty" },
  { fn: "typeOf", defs: ["boardSnapshot.js", "effects/textNormalize.js", "mulliganPolicy.js", "spellEffects.js"], reads: "the type line" },
  { fn: "manaOf", defs: ["boardSnapshot.js", "effects/textNormalize.js"], reads: "the mana cost" },
];

// CARD HANDLERS — functions that take a printed card as a BASE: the ability view itself (it returns the stripped view under a loss), and
// the copy path (CR 707.2 — a copy copies the printed card, never a lost state).
const CARD_HANDLERS = [
  { fn: "withAbilityLoss", reason: "the ability view: its base card (the printed card, a Class view, a copy's card) returned stripped under a loss" },
  { fn: "abilityViewOf", reason: "the ability view for the modules layers.js imports (abilityView.js — the same function)" },
  { fn: "enteringAbilityCard", reason: "the entering side's view (CR 614.12): the entering card as a static loss that reaches it would leave it" },
  { fn: "cloneWidenedCopiable", reason: "the copy path: a copy acquires the printed card's copiable values (CR 707.2), never a lost state" },
];

// THE SITE ALLOWLIST — a printed card handed to a function outside the two lists, with the reason the card there is not a battlefield
// permanent's abilities as they are now. { file, fn (enclosing top-level function), call (callee + "(" + the argument), count?, reason,
// requires? — a pattern the enclosing function must also read: a LOOK-BACK's printed card read raw sits beside that look-back's stamp }.
const LAYER4 = "applied in layer 4 (or 1–5), before a layer-6 loss removes abilities (CR 613.1, 613.6 — S0a's design: layers 1–5 keep applying)";
const S5 = "an Aura's Enchant restriction — an Aura that lost its abilities is the program's S5 (the Enchant union, backlog E6); the printed line keeps today's legality";
const AI = "the AI's estimate (an estimate of the board, never a legal play — the play itself goes through the routed readers)";
const SITE_ALLOWLIST = [
  // layers.js internals (the seeds read the loss themselves)
  { file: "layers.js", fn: "changelingCounts", call: "hasKeyword(p.card", reason: `Changeling is a characteristic-defining ability (CR 702.73a, 604.3) ${LAYER4}; a later layer-4 effect overrides it (changelingOverridden — S0a)` },
  { file: "layers.js", fn: "matchesSelector", call: "hasKeyword(candidate.card", reason: "the same Changeling read inside matchesSelector (CR 702.73a, 613.3 — layer 4, before the loss)" },
  { file: "layers.js", fn: "matchesSelector", call: "permHasChosenTypeLayer(candidate.card", reason: "a chosen creature type against the types, a Changeling's CDA included (CR 702.73a — layer 4, before the loss)" },
  { file: "layers.js", fn: "sourceMultiplierFilterMatches", call: "permHasChosenTypeLayer(subject.card", reason: "a chosen creature type against the types, a Changeling's CDA included (CR 702.73a — layer 4, before the loss)" },
  { file: "layers.js", fn: "permIsEveryCreatureType", call: "hasKeyword(chars.copiableValues || perm.card", reason: "Changeling over the copiable card (CR 702.73a, 707.2 — layer 4, before the loss)" },
  { file: "layers.js", fn: "equipmentBarredAsCreature", call: "hasReconfigure(findPerm(state, permanentId)?.card", reason: `Reconfigure's "an attached Equipment isn't a creature" (CR 702.151b) — a type change ${LAYER4}` },
  { file: "layers.js", fn: "keywordSet", call: "printedKeywords(loss ? strippedCardView(perm.card, loss.keep) : perm.card", reason: "the derive's keyword seed: the stripped view built from the loss decided one line above (layers.js's own reading)" },
  { file: "layers.js", fn: "keywordSet", call: "strippedCardView(perm.card", reason: "the view builder itself, over the printed card (the same line)" },
  // layer 2 and layer 4 effects of a permanent's own static abilities
  { file: "controlAura.js", fn: "isControlAuraPermanent", call: "isControlAura(perm.card", reason: `a control-changing Aura's effect (CR 613.1b, layer 2) — ${LAYER4}` },
  { file: "controlAura.js", fn: "isControlAuraPermanent", call: "grantsControlWhenAttached(perm.card", reason: "the bestowed form of the same layer-2 control effect (CR 613.1b)" },
  { file: "everyCreatureType.js", fn: "grantHolders", call: "grantsEveryCreatureType(perm.card", reason: `"creatures you control are every creature type" (Maskwood Nexus) — a type change ${LAYER4}` },
  { file: "triggers.js", fn: "permIsEveryTypeNow", call: "cardIsEveryCreatureType(perm.card", reason: "Changeling (a characteristic-defining ability, CR 702.73a, 604.3) for a trigger's subtype scope — layer 4, before the loss" },
  // the mana model's own sort key and the rider of a mana ability the view already kept
  { file: "manaModel.js", fn: "tapCostPayerOrder", call: "manaProduction(a.card", reason: "a payer-preference comparator with no state (a sort key; both orders are legal plays)" },
  { file: "manaModel.js", fn: "tapCostPayerOrder", call: "manaProduction(b.card", reason: "tapCostPayerOrder (as above)" },
  { file: "manaModel.js", fn: "manaSources", call: "parseManaSpentRider(perm.card", count: 2, reason: "the rider of the mana ability manaSources just read through the view (manaCardOf): reached only when the view kept that ability (no loss, or an exceptMana loss that keeps its line)" },
  // a card that is not a battlefield permanent's abilities: a graveyard card, a moving card, a record, a report
  { file: "triggers.js", fn: "checkGraveyardEventTriggers", call: "detectTriggers(ev.card", reason: "the gyEnterSelf event: a card that entered a GRAVEYARD (not a permanent — a loss applies on the battlefield only)" },
  { file: "triggers.js", fn: "walkerExiledInstead", call: "graveyardExiledFor(d.card", reason: "the card going to the graveyard, asked whether a replacement exiles it (the replacements' carriers are read through the view inside)" },
  { file: "triggers.js", fn: "checkSacrificeTriggers", call: "recordSacrificeThisTurn(sacrificed.card", reason: "a per-turn record of the sacrificed card (data, no ability applied)" },
  { file: "triggers.js", fn: "checkEnterTriggers", call: "etbTriggerMultiplierCount(enteredPerm.card", reason: "the entering card matched against a multiplier's printed filter by its types (enteringMatchesFilter); the multipliers are collected through the layers" },
  { file: "triggers.js", fn: "checkLandfallTriggers", call: "etbTriggerMultiplierCount(enteredLand.card", reason: "the same multiplier filter for a land entering" },
  { file: "triggers.js", fn: "checkEnterTriggers", call: "parseMultikickerCost(enteredPerm.card", reason: "the context its own enters triggers resolve with (times kicked); those triggers are read through liveTriggerCard, so a lost permanent has none to use it" },
  { file: "triggers.js", fn: "checkLeavesTriggers", call: "detainReturnIsTriggered(e.card", count: 2, requires: "\\be\\.lkiAbilityLoss\\b", reason: "which PRINTING the departed detainer has (the old two-trigger printing returns the card with its own leaves ability; the \"until\" printing with a duration, CR 610.3) — read beside the look-back's stamp (`e.lkiAbilityLoss`), which decides whether that ability was still there (the S0b review's F2g)" },
  { file: "effects/atoms/tokens.js", fn: "fireTokenEnterTriggers", call: "checkTokenCreatedTriggers(found.permanent.card", reason: "the created token's card as the event's data (its Creature type); the watchers are read through liveTriggerCard" },
  { file: "playerLeavesGame.js", fn: "commanderIdsOwnedBy", call: "add(perm.card", reason: "collecting the cards a leaving player owns (CR 800.4a — data)" },
  { file: "breakageReport.js", fn: "formatBreakageTxt", call: "col(c.card", reason: "a report row's card NAME (a string), formatted into a column" },
  { file: "effects/atoms/shared.js", fn: "massPermanentTargets", call: "matches(perm.card", reason: "a mass effect's card-type predicate (permanentTypeWordNow — the types it has now)" },
  { file: "trapDetector.js", fn: "untappedPermanentsOfType", call: "predicate(p.card", reason: "a card-type predicate (isLand)" },
  { file: "enterReplacements.js", fn: "settleEnterReplacements", call: "applyFabricateServos(perm.card", reason: "the servo count read again off the card whose ROUTED entry read chose servos (settle.fabricateServos is set only by applyEnterReplacements' own text through enteringAbilityCard)" },
  { file: "legalChoices.js", fn: "actionsActivateLoyalty", call: "planeswalkerPlayable(perm.card", reason: "the modeled-walker gate (a whole-card tier check); its loyalty abilities are then read through the view (parseLoyaltyAbilities over withAbilityLoss), so a lost planeswalker offers none" },
  // an Aura's Enchant restriction (S5)
  { file: "creatureRestrictions.js", fn: "creatureSatisfiesRestrictions", call: "auraEntryHostSpec(perm.card", reason: S5 },
  { file: "effects/atoms/stack.js", fn: "applyAttachSourceToTriggering", call: "auraMayEnchantCreature(src.permanent.card", reason: S5 },
  { file: "effects/atoms/stack.js", fn: "applyAttachPair", call: "auraMayEnchantCreature(findPermanent(state, attachT.id)?.permanent?.card", reason: S5 },
  // the AI's estimates and the agents' view
  { file: "gameEngine.js", fn: "pickFlickerCandidate", call: "chooseAuraEntryHost(p.card", reason: `${AI}: where a blinked Aura would return (its Enchant restriction — S5)` },
  { file: "gameEngine.js", fn: "pickFlickerCandidate", call: "auraEntryHostScore(p.card", reason: `${AI}: the same blinked Aura's host score` },
  { file: "auraEntry.js", fn: "manaAurasOn", call: "isNativeManaAura(findPermanent(state, id)?.permanent?.card", reason: `${AI}: how many mana Auras a land already carries, for a new mana Aura's host pick` },
  { file: "opponentAI.js", fn: "assignsAsUnblocked", call: "mayAssignAsUnblocked(findPermanent(state, id)?.permanent?.card", reason: `${AI}: the attack estimate's assign-as-unblocked read (the S0b review's F7 — combat damage itself reads the view)` },
  { file: "opponentAI.js", fn: "pickTargetedSpell", call: "entersTriggerRemovesOwn(perm.card", reason: `${AI}: a printed pre-filter; the decision is the simulated board's own trigger check, which reads the view (S0b found-not-fixed (4))` },
  { file: "mandatoryLoop.js", fn: "mandatoryLinkName", call: "cardOffersNoChoice(source.card", reason: `${AI}: the loop estimate's "offers no choice" read (the S0b review's F7)` },
  { file: "boardSnapshot.js", fn: "permanentView", call: "oracleOf(perm.card", reason: "the board view's printed text (what the card says); a permanent that lost its abilities is marked beside it (`abilitiesLost`, the S0b review's F7)" },
];

// THE ALIAS ALLOWLIST — an alias of a printed card that reaches a non-characteristic call or a text read in its function.
// { file, fn, alias, use (the callee, or ".oracle" for a text read), reason }.
const CLASS_BUILDER = "the Class level view's own builder (CR 716.2a); every reader of a Class permanent's abilities hands its result to the ability view (liveTriggerCard, the lint's rule 4)";
const SPELL = "a SPELL's card (on the stack or just resolved / countered — not a permanent; a loss applies on the battlefield only)";
const COLLECTION = "the collection's own read of a permanent's statics; the post-collection filter (withoutLostStatics) drops a lost source's layer-6+ effects and keeps its layers 1–5 (CR 613.6 — S0a §1.4)";
const SUBJECT = "the entering card as the SUBJECT of other permanents' statics (its types, as it enters — CR 614.12); those statics' sources are read through the view inside";
const LISTED = "a list-taking scanner: its callers hand it abilityViewPermanents(state, list), so each entry's card is already the view (S0b)";
const ALIAS_ALLOWLIST = [
  { file: "boardEval.js", fn: "permanentValue", alias: "card", use: "deriveCardRole", reason: AI },
  { file: "classLevels.js", fn: "classLiveCard", alias: "card", use: "hasClassLevelBar", reason: CLASS_BUILDER },
  { file: "classLevels.js", fn: "classLiveCard", alias: "card", use: "classCardModeled", reason: CLASS_BUILDER },
  { file: "classLevels.js", fn: "classLiveCard", alias: "card", use: "classLevelView", reason: CLASS_BUILDER },
  { file: "effects/atoms/becomeCopy.js", fn: "applyBecomeCopy", alias: "selfCard", use: ".oracle", reason: "the copy path: the resolving copy ability's own \"except it has this ability\" line off the printed card (CR 707.9b, 707.2 — the ability on the stack is independent of its source)" },
  { file: "effects/atoms/becomeCopy.js", fn: "applyBecomeCopy", alias: "selfCard", use: "snapshotCopiedCard", reason: "the copy path's copiable values (CR 707.2 — a copy copies the printed card, never a lost state)" },
  { file: "effects/atoms/stack.js", fn: "counterSpellById", alias: "card", use: "shufflesIntoLibraryInsteadOfGraveyard", reason: SPELL },
  { file: "effects/atoms/stack.js", fn: "counterSpellById", alias: "card", use: "shuffleIntoLibraryInstead", reason: SPELL },
  { file: "effects/atoms/stack.js", fn: "counterSpellById", alias: "card", use: "graveyardExileFor", reason: SPELL },
  { file: "effects/runProgram.js", fn: "finishSpellResolution", alias: "card", use: "shufflesIntoLibraryInsteadOfGraveyard", reason: SPELL },
  { file: "effects/runProgram.js", fn: "finishSpellResolution", alias: "card", use: "shuffleIntoLibraryInstead", reason: SPELL },
  { file: "effects/runProgram.js", fn: "finishSpellResolution", alias: "card", use: "graveyardExileFor", reason: SPELL },
  { file: "enterReplacements.js", fn: "applyEnterReplacements", alias: "card", use: "impositionEntersTapped", reason: SUBJECT },
  { file: "enterReplacements.js", fn: "applyEnterReplacements", alias: "card", use: "othersEnterWithCountersFor", reason: SUBJECT },
  { file: "enterReplacements.js", fn: "applyEnterReplacements", alias: "card", use: "grantedRiotCount", reason: `${SUBJECT}; a granted riot is dropped when a loss reaches the entering card (\`own === card\` on the same line — S0b)` },
  { file: "enterReplacements.js", fn: "applyEnterReplacements", alias: "card", use: "planeswalkerEntryLoyalty", reason: "the entering planeswalker's printed loyalty (CR 306.5b — a characteristic), with Oath of Gideon's extra read through the view inside" },
  { file: "enterReplacements.js", fn: "applyEnterReplacements", alias: "card", use: "parseSagaChapters", reason: "a Saga's lore counter as it enters (CR 714.3a — a game rule, not an ability of the Saga)" },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "parseAttachedBonus", reason: COLLECTION },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "isGraveyardReanimateAura", reason: COLLECTION },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "animateDeadBonusView", reason: COLLECTION },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "hasReconfigure", reason: COLLECTION },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "parseAuraGrantedManaAbility", reason: COLLECTION },
  { file: "layers.js", fn: "staticEffectsOf", alias: "card", use: "parseSoulbondBond", reason: COLLECTION },
  { file: "layers.js", fn: "permanentHasKeyword", alias: "base", use: "hasKeyword", reason: "the keyword seed: the stripped view built from the loss on the same line (layers.js's own reading)" },
  { file: "layers.js", fn: "permanentHasKeyword", alias: "base", use: "strippedCardView", reason: "the view builder itself, over the copy-aware base (the same line)" },
  { file: "sba.js", fn: "grantSparesAttachment", alias: "card", use: ".oracle", reason: "the rider of a protection grant the layer system already applies (\"This effect doesn't remove this Aura\" — a lost source's grant is filtered out of the collection, so its rider is never asked)" },
  { file: "staticAbilityParser.js", fn: "collectCostTaxers", alias: "card", use: "parseStaticAbilities", reason: LISTED },
  { file: "staticAbilityParser.js", fn: "collectCostReducers", alias: "card", use: "parseStaticAbilities", reason: LISTED },
  { file: "staticAbilityParser.js", fn: "collectActivatedCostReducers", alias: "card", use: "parseStaticAbilities", reason: LISTED },
  { file: "staticAbilityParser.js", fn: "collectEquipCostOverrides", alias: "card", use: "parseStaticAbilities", reason: LISTED },
];

// THE TEXT ALLOWLIST — a direct `<holder>.card.oracle` read whose card is not a battlefield permanent's abilities as they are now.
// { file, fn, holder, count, reason }.
const TEXT_ALLOWLIST = [
  { file: "boardEval.js", fn: "isUntappedManaSource", holder: "perm", count: 2, reason: "the AI's development proxy with no state (an estimate of the board, never a rules read)" },
  { file: "gameState.js", fn: "recordLeaveEvent", holder: "permanent", count: 2, reason: "recordLeaveEvent's sourceLki: whether to RECORD the leaving permanent's power for a later look-back (data kept, no ability applied)" },
  { file: "sba.js", fn: "sweepAttachmentLegality", holder: "perm", count: 2, reason: "an Aura's Enchant restriction at the attachment state-based action (CR 303.4, 704.5m): an Aura that lost its abilities is the program's S5 (the Enchant union, backlog E6); the printed line keeps today's legality" },
];

// THE CLASS-VIEW CHOKEPOINTS — functions that read classLiveCard and hand it to the view themselves (on another line).
const CLASS_VIEW_HELPERS = [{ file: "triggers.js", fn: "liveTriggerCard", reason: "the trigger scans' one helper: the board test first, then withAbilityLoss over the Class view" }];

// THE PRINTED GRANT READERS — the abilities one permanent grants others, read off its printed text outside the layer system.
const GRANT_READERS = ["parseGrantedActivatedAbilities", "parseGrantedTriggeredAbilities", "hasKiraGrant"];

// THE ABILITY READERS — functions that read a card's triggered, activated, mana, static or keyword abilities, its replacement and
// prevention text, its combat restrictions, the board scanners' per-card reads (the first lint's list + the S0b review's F2 / F3 seven).
// The inverted rule needs no list of them; this one guards the two closed lists: no ability reader may sit in either.
const READERS = [
  "detectTriggers", "hasTriggerFor", "parseStaticAbilities", "parseActivatedAbilities", "parseGrantedActivatedAbilities", "parseGrantedTriggeredAbilities",
  "parseLoyaltyAbilities", "parseCrewCost", "crewPowerBonus", "manaProduction", "extraManaLineProducts", "manaActivationCost", "hasKeyword",
  "printedKeywordsOf", "parseProtectionColors", "parseProtectionClasses", "readPrintedWards", "looseWardCost", "parseWardCost",
  "cardSelfPreventsUntap", "groupNoUntapFiltersOf", "doublerProfile", "manaMultiplierProfile", "parseDamageReplacements", "graveyardExileSpecOf",
  "exilesCreaturesItDamaged", "exilesOpponentCreaturesOnDeath", "othersEnterWithCounters", "lifeFloorOf", "opponentLifeLossMultiplierOf",
  "auraHasTotemArmor", "grantsUmbraArmorToAuras", "lostManaBecomesColorless", "parseAuraLandManaBonus", "parseGlobalTapManaAugment",
  "parseSoulbondBond", "parseGroupWard", "readAttackTax", "annihilatorInstances", "isSeedbornUntap", "parseTypeFilteredUntap",
  "parseSelfOtherUntap", "parseUrDragonAttackTrigger", "parseVihaanCombatAnimate", "marksDamageToCreature", "isSelfCantBlock",
  "isSelfUnblockable", "minBlockerCountOf", "menaceTeamMinBlockersOf", "maxBlocksOf", "selfCantAttackBlockGate", "attachedExceptByOf",
  "groupBlockRestrictionOf", "teamPowerBlockGateOf", "groupPreventPutCountersOf", "attachedPreventPutCountersOf", "attachedPreventionOf",
  "lureFilterOf", "mustBeBlockedIfAble", "cantAttackAlone", "cantBlockAlone", "attackControllerRequirementOf", "attackDefenderRequirementOf",
  "selfDamagePrevention", "selfDamagePreventionBy", "counterShieldPrevention", "selfPreventPutCounters", "mayAssignAsUnblocked",
  "mustAttackUnlessOf", "selfMustAttack", "toxicValue", "hasUnleash", "isCanBlockOnlyFlyers", "parseAttackerRestrictions",
  "parseAttackerExceptions", "castNoncreatureLockLine", "abilitiesAsThoughHasteLock", "extraLandDropsOf", "everyPlayerExtraLandDropsOf",
  "artifactActivationLockOf", "opponentsEnterTappedTypesOf", "skipsDrawStepOf", "skipsOpponentExtraTurnsOf", "grantsWubrgAltCostOf",
  "oppEntersDontTriggerOf", "entersDontTriggerOf", "castOwnTurnOnlyLock", "flashCastPermissionsOf", "cantCastDescriptorOf",
  "castsPerTurnLimitOf", "noncreatureCastsPerTurnLimitOf", "castFromHandOnlyLockOf", "sacrificeDropsTrigger", "shufflesIntoLibraryInsteadOfGraveyard",
  "entersTapped", "conditionalEntersTapped", "paysLifeOrEntersTapped", "revealLandEntersTapped", "entersWithPlusCounters", "entersWithFadeCounters",
  "entersWithNamedCounters", "choosesColorOnEnter", "choosesCreatureTypeOnEnter", "parseFabricate", "parseTribute", "riotKeywordCount",
  "parseAttachedBonus", "parseAuraGrantedManaAbility", "flankingKeywordCount", "exaltedKeywordCount",
  // the S0b review's F2 / F3
  "cardHasAscend", "parseFadingVanishing", "playerDamageRedirectOf", "hasKiraGrant", "isMurkfiendUntap", "parseXCastTokenTrigger", "isBlockedByAtMostOne",
];

// ─── the scanner ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function sources(dir = LEARN, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") sources(p, out); }
    else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(LEARN, p).split(path.sep).join("/");
const norm = (s) => s.replace(/\s+/g, " ").trim();

const REGEX_PREV = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_WORD = /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do)$/;
/** The source with comments and string / regex / template contents blanked to spaces (every length and newline kept). */
function blank(src) {
  const out = [];
  const put = (ch) => out.push(ch === "\n" ? "\n" : " ");
  let i = 0, prev = "", word = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") put(src[i++]); continue; }
    if (c === "/" && d === "*") { put(c); put(d); i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) put(src[i++]); if (i < src.length) { put("*"); put("/"); i += 2; } continue; }
    if (c === "\"" || c === "'" || c === "`") {
      out.push(c); i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") { put(src[i]); put(src[i + 1] ?? " "); i += 2; continue; }
        if (c !== "`" && src[i] === "\n") break;
        put(src[i++]);
      }
      if (i < src.length) { out.push(c); i++; }
      prev = c; word = ""; continue;
    }
    if (c === "/" && (prev === "" || REGEX_PREV.has(prev) || REGEX_WORD.test(word))) {
      out.push("/"); i++;
      let cls = false;
      while (i < src.length && src[i] !== "\n") {
        const r = src[i];
        if (r === "\\") { put(r); put(src[i + 1] ?? " "); i += 2; continue; }
        if (r === "[") cls = true; else if (r === "]") cls = false; else if (r === "/" && !cls) break;
        put(r); i++;
      }
      if (src[i] === "/") { out.push("/"); i++; }
      while (i < src.length && /[a-z]/i.test(src[i])) out.push(src[i++]);
      prev = "/"; word = ""; continue;
    }
    out.push(c);
    if (/[\w$]/.test(c)) word += c; else if (!/\s/.test(c)) word = "";
    if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? "a" : c;
    i++;
  }
  return out.join("");
}
const HEADER = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*\(|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
/** Per line (0-based): the enclosing top-level function (or top-level const). */
function enclosing(blanked) {
  let fn = "(top)";
  return blanked.split("\n").map((l) => { const m = HEADER.exec(l); if (m) fn = m[1] || m[2]; return fn; });
}
function lineStarts(text) { const s = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) s.push(i + 1); return s; }
function lineAt(starts, pos) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; }
/** The top-level arguments of the call whose "(" is at `open`. */
function argsAt(t, open) {
  const args = [];
  let depth = 0, start = open + 1;
  for (let j = open + 1; j < t.length; j++) {
    const c = t[j];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) { args.push({ text: t.slice(start, j), start }); return args; } depth--; }
    else if (c === "," && depth === 0) { args.push({ text: t.slice(start, j), start }); start = j + 1; }
  }
  return args;
}
/** The routed form `<board test> ? withAbilityLoss|abilityViewOf(<state>, X…) : X.card` — the fallback is the loss-free branch. */
function unrouted(arg) {
  return norm(arg).replace(/\?\s*\(?\s*(?:withAbilityLoss|abilityViewOf)\s*\(\s*[\w$.]+\s*,\s*([\w$]+(?:\??\.[\w$]+)*)\s*(?:,[^()]*)?\)\s*\)?\s*:\s*([\w$]+(?:\??\.[\w$]+)*)\??\.card\b(?!\s*\??\.)/g,
    (m, x, y) => (x === y ? "? VIEW : ROUTED" : m));
}
/** Collapse arrow parameters, inner calls' argument lists, object literals and parenthesized groups read by a member. */
function collapse(a) {
  let prev;
  a = a.replace(/\(\s*[\w$\s,={}[\].]*\)\s*=>/g, "ARGS =>");
  do { prev = a; a = a.replace(/\{[^{}]*\}/g, "OBJ").replace(/([\w$])\s*\([^()]*\)/g, "$1CALL").replace(/\([^()]*\)(\s*\??\.)/g, "GROUP$1"); } while (a !== prev);
  return a;
}
/** Does `expr` evaluate to (or carry) a permanent's card object — a `<expr>.card` VALUE, not a member read, a call, a condition or a
 *  comparison, outside an inner call and an object literal? `name` (an alias) is tested the same way in place of `.card`. */
function carries(expr, name = null) {
  // an alias's routed form: `<board test> ? withAbilityLoss(<state>, <perm>, ALIAS) : ALIAS` (the view over the alias as its base)
  const routedAlias = (s) => s.replace(new RegExp(`\\?\\s*\\(?\\s*(?:withAbilityLoss|abilityViewOf)\\s*\\([^()]*,\\s*${String(name).replace(/\$/g, "\\$")}\\s*\\)\\s*\\)?\\s*:\\s*${String(name).replace(/\$/g, "\\$")}\\b(?!\\s*\\??\\.)`, "g"), "? VIEW : ROUTED");
  const a = collapse(name ? routedAlias(norm(expr)) : unrouted(expr));
  if (/^\(?\s*(?:async\s*)?(?:ARGS|[\w$]+)\s*=>/.test(a) || /^function\b/.test(a)) return false; // an arrow / a function argument
  if (/^OBJ$/.test(a)) return false; // a record (a look-back, an event — its `card` is the printed card by design, CR 707.2)
  const re = name ? new RegExp(`(!?)\\s*(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\b`, "g") : /(!?)\s*[\w$)\]]\??\.card\b/g;
  for (const m of a.matchAll(re)) {
    if (m[1] === "!") continue;
    const after = a.slice(m.index + m[0].length);
    if (/^\s*(?:\??\.|\[|\(|[\w$])/.test(after)) continue; // a member read or a call
    if (/^\s*(?:\?(?!\.)|&&|===|!==|==|!=)/.test(after)) continue; // a condition or a comparison
    return true;
  }
  return false;
}
const KW = new Set(["if", "for", "while", "switch", "return", "function", "catch", "typeof", "await", "new", "delete", "void", "super"]);

let _scan = null;
function scanAll() {
  if (_scan) return _scan;
  const calls = [], aliasUses = [], texts = [], grants = [], classViews = [], defs = new Map(), bodies = new Map(), declared = new Set();
  for (const f of sources()) {
    const file = rel(f);
    const src = fs.readFileSync(f, "utf8");
    const t = blank(src);
    const starts = lineStarts(t);
    const fns = enclosing(t);
    const tLines = t.split("\n");
    const srcLines = src.split("\n");
    tLines.forEach((l, i) => { const k = `${file}|${fns[i]}`; bodies.set(k, (bodies.get(k) || "") + l + "\n"); });
    for (const m of t.matchAll(/\b(?:function\*?\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\b/g)) declared.add(m[1]);
    // definitions (any depth), with their body text for the characteristic check
    for (const m of t.matchAll(/\bfunction\*?\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*function\b/g)) {
      const name = m[1] || m[2] || m[3];
      let body = "";
      const brace = t.indexOf("{", m.index + m[0].length);
      const lineEnd = t.indexOf("\n", m.index);
      if (brace !== -1 && (m[1] || m[3] || brace < (lineEnd === -1 ? t.length : lineEnd))) {
        let depth = 0;
        for (let j = brace; j < t.length; j++) { if (t[j] === "{") depth++; else if (t[j] === "}" && --depth === 0) { body = src.slice(brace, j + 1); break; } }
      } else body = src.slice(m.index, lineEnd === -1 ? t.length : lineEnd);
      if (!defs.has(name)) defs.set(name, []);
      defs.get(name).push({ file, body, blankBody: blank(body) });
    }
    // calls
    for (const m of t.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const callee = m[1];
      if (KW.has(callee) || /function\*?\s*$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
      const args = argsAt(t, m.index + m[0].length - 1);
      const line = lineAt(starts, m.index);
      const fn = fns[line - 1];
      for (const a of args) if (carries(a.text)) calls.push({ file, fn, line, callee, call: `${callee}(${norm(src.slice(a.start, a.start + a.text.length))}` });
      if (GRANT_READERS.includes(callee) && /\.card\b|\b(?:withAbilityLoss|abilityViewOf|enteringAbilityCard)\s*\(/.test(args[0]?.text ?? "")) grants.push({ file, fn, line, callee });
    }
    // aliases of a printed card, and where each reaches a non-characteristic call or a text read in its function
    for (const m of t.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g)) {
      const [, alias, expr] = m;
      if (/^\s*(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>/.test(expr) || /^\s*function\b/.test(expr) || !carries(expr)) continue;
      const line = lineAt(starts, m.index);
      const fn = fns[line - 1];
      for (let i = line; i < tLines.length && fns[i] === fn; i++) {
        const l = tLines[i];
        if (new RegExp(`(?<![\\w$.])${alias}\\??\\.(?:oracle|oracle_text)\\b`).test(l)) aliasUses.push({ file, fn, alias, use: ".oracle", line: i + 1 });
        for (const c of l.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
          if (KW.has(c[1])) continue;
          const lineOffset = starts[i];
          const args = argsAt(t, lineOffset + c.index + c[0].length - 1);
          if (args.some((a) => carries(a.text, alias))) aliasUses.push({ file, fn, alias, use: c[1], line: i + 1 });
        }
      }
    }
    // direct text reads, and the Class-view reads
    tLines.forEach((l, i) => {
      for (const m of l.matchAll(/\b([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*?)\??\.card\??\.(?:oracle|oracle_text)\b/g)) texts.push({ file, fn: fns[i], line: i + 1, holder: m[1] });
      if (/\bclassLiveCard\(/.test(l) && !/\bimport\b/.test(srcLines[i]) && !/\bfunction\s+classLiveCard\b/.test(l)) classViews.push({ file, fn: fns[i], line: i + 1, text: srcLines[i].trim().slice(0, 120), viewed: /\b(?:withAbilityLoss|abilityViewOf)\(/.test(l) });
    });
  }
  _scan = { calls, aliasUses, texts, grants, classViews, defs, bodies, declared };
  return _scan;
}

const CHAR_NAMES = new Set(CHARACTERISTIC_READERS.map((c) => c.fn));
const HANDLER_NAMES = new Set(CARD_HANDLERS.map((c) => c.fn));
const okCallee = (callee) => CHAR_NAMES.has(callee) || HANDLER_NAMES.has(callee);
const siteKey = (e) => `${e.file} | ${e.fn} | ${e.call ?? `${e.alias} → ${e.use}`}`;
/** Each entry matched exactly `count` (default 1) times by the hits under its key. */
function countsMismatch(entries, hits, keyOf) {
  const seen = new Map();
  for (const h of hits) seen.set(keyOf(h), (seen.get(keyOf(h)) || 0) + 1);
  return entries.filter((e) => (seen.get(keyOf(e)) || 0) !== (e.count ?? 1)).map((e) => `${keyOf(e)}: expected ${e.count ?? 1}, found ${seen.get(keyOf(e)) || 0}`);
}

describe("the ability-loss source lint (ABILITY-LOSS-PROGRAM.md §5.5 — inverted after the S0b review's F4)", () => {
  it("every name the lint lists is a real function of the engine (the lint reads real names)", () => {
    const { declared } = scanAll();
    const listed = [...READERS, ...GRANT_READERS, ...CHAR_NAMES, ...HANDLER_NAMES, ...CLASS_VIEW_HELPERS.map((h) => h.fn), "attachedGrantCutByLoss"];
    expect([...new Set(listed)].filter((n) => !declared.has(n))).toEqual([]);
  });

  it("the closed lists hold no ability reader, every characteristic reader's definitions are where the list says and read no rules text", () => {
    const { defs } = scanAll();
    expect(READERS.filter((r) => okCallee(r))).toEqual([]);
    const bad = [];
    for (const c of CHARACTERISTIC_READERS) {
      const found = (defs.get(c.fn) || []).map((d) => d.file);
      if (JSON.stringify([...new Set(found)].sort()) !== JSON.stringify([...c.defs].sort())) bad.push(`${c.fn}: defined in ${JSON.stringify([...new Set(found)].sort())}, listed ${JSON.stringify(c.defs)}`);
      for (const d of defs.get(c.fn) || []) {
        if (/\.(?:oracle|oracle_text|keywords)\b|\b(?:hasKeyword|detectTriggers|parseStaticAbilities|parseActivatedAbilities|manaProduction)\s*\(/.test(d.blankBody)) bad.push(`${c.fn} (${d.file}) reads rules text`);
      }
      if (!(typeof c.reads === "string" && c.reads.length > 5)) bad.push(`${c.fn}: no stated read`);
    }
    expect(bad).toEqual([]);
    expect(CARD_HANDLERS.every((h) => typeof h.reason === "string" && h.reason.length > 20)).toBe(true);
  });

  it("no printed card reaches a call outside the characteristic readers, the card handlers, the routed form and the site allowlist", () => {
    const { calls } = scanAll();
    const allowed = new Set(SITE_ALLOWLIST.map(siteKey));
    const bad = calls.filter((c) => !okCallee(c.callee) && !allowed.has(siteKey(c))).map((c) => `${c.file}:${c.line}  [${c.fn}]  ${c.call}`);
    expect(bad).toEqual([]);
  });

  it("an allowlisted read of a LOOK-BACK's printed card sits in a function that reads that look-back's stamp (CR 603.10a)", () => {
    const { bodies } = scanAll();
    expect(SITE_ALLOWLIST.some((e) => e.requires)).toBe(true);
    expect(SITE_ALLOWLIST.filter((e) => e.requires && !new RegExp(e.requires).test(bodies.get(`${e.file}|${e.fn}`) || "")).map((e) => `${siteKey(e)}: does not read ${e.requires}`)).toEqual([]);
  });

  it("no alias of a printed card reaches a non-characteristic call or a text read outside the alias allowlist", () => {
    const { aliasUses } = scanAll();
    const allowed = new Set(ALIAS_ALLOWLIST.map(siteKey));
    const bad = aliasUses.filter((u) => (u.use === ".oracle" || !okCallee(u.use)) && !allowed.has(siteKey(u))).map((u) => `${u.file}:${u.line}  [${u.fn}]  ${u.alias} → ${u.use}`);
    expect(bad).toEqual([]);
  });

  it("no direct `<x>.card.oracle` text read outside the text allowlist (the readers inlined at their call sites)", () => {
    const { texts } = scanAll();
    const key = (e) => `${e.file} | ${e.fn} | ${e.holder}`;
    const allowed = new Set(TEXT_ALLOWLIST.map(key));
    expect(texts.filter((x) => !allowed.has(key(x))).map((x) => `${x.file}:${x.line}  [${x.fn}]  ${x.holder}.card.oracle`)).toEqual([]);
  });

  it("a Class level view (classLiveCard) outside layers.js is always handed to the ability view", () => {
    const { classViews } = scanAll();
    const bad = classViews.filter((c) => c.file !== "layers.js" && c.file !== "classLevels.js" && !c.viewed
      && !CLASS_VIEW_HELPERS.some((h) => h.file === c.file && h.fn === c.fn)).map((c) => `${c.file}:${c.line}  ${c.text}`);
    expect(bad).toEqual([]);
  });

  it("a printed grant read off a battlefield permanent sits beside the recipient's cutoff (layers.attachedGrantCutByLoss — CR 613.7)", () => {
    const { grants, bodies } = scanAll();
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.filter((g) => !/\battachedGrantCutByLoss\s*\(/.test(bodies.get(`${g.file}|${g.fn}`) || "")).map((g) => `${g.file}:${g.line}  [${g.fn}]  ${g.callee}`)).toEqual([]);
  });

  it("every allowlist entry matches the source exactly (site and count — no stale exemption) and states its reason", () => {
    const { calls, aliasUses, texts } = scanAll();
    expect(countsMismatch(SITE_ALLOWLIST, calls, siteKey)).toEqual([]);
    expect(countsMismatch(ALIAS_ALLOWLIST, aliasUses, siteKey)).toEqual([]);
    expect(countsMismatch(TEXT_ALLOWLIST, texts, (e) => `${e.file} | ${e.fn} | ${e.holder}`)).toEqual([]);
    const all = [...SITE_ALLOWLIST, ...ALIAS_ALLOWLIST, ...TEXT_ALLOWLIST, ...CLASS_VIEW_HELPERS];
    expect(all.filter((a) => !(typeof a.reason === "string" && a.reason.length > 20)).map(siteKey)).toEqual([]);
    expect(SITE_ALLOWLIST.filter((a) => okCallee(a.call.split("(")[0])).map(siteKey)).toEqual([]); // an entry a closed list already covers is noise
  });
});
