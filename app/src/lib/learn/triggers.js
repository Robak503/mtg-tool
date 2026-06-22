/**
 * triggers.js — triggered-ability detection + resolution (Phase-7 PR-5).
 *
 * Leaf module: imports ONLY gameState reads, so gameEngine/combat can import it
 * without a cycle (resolvers.js imports applyTriggerEffect from here in PR-6, so
 * this file must never import resolvers.js back). Detects triggered abilities
 * from a card's oracle text (the When/Whenever/At grammar, CR 603.1), matches
 * them to game events, and applies a small, FAIL-SAFE Phase-1 effect vocabulary
 * (gain/lose life, draw, damage-to-each-opponent). Anything it doesn't recognize
 * yields effect:null → the engine resolves it through the no-op/Arbiter path,
 * never a fabricated effect (CLAUDE.md §1.2).
 *
 * PR-5 ships detection + matching + application, all unit-tested, but NOTHING is
 * enqueued in a real game yet — the ETB/dies/step/attack hooks that call
 * triggersForEvent + enqueueTrigger land in PR-6..8.
 */

import {
  loseLife,
  gainLife,
  drawCards,
  opponentsOf,
  findPermanent,
  creaturePower,
  logEvent,
} from "./gameState.js";
import { hasKeyword } from "./keywords.js";
import { applyMothmanRadOnEnter } from "./mothmanRad.js";
import { boardHasDamageReplacement, consultDamageAmount } from "./damageReplacements.js";

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
function parseCount(word) {
  if (word == null) return 1;
  const w = String(word).toLowerCase();
  return NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreaturePerm(perm) {
  return /Creature/.test(typeStr(perm?.card));
}

function isLandPerm(perm) {
  return /Land/.test(typeStr(perm?.card));
}

/**
 * Strip a leading ability-word label that precedes a trigger keyword ("Landfall — Whenever …"). Ability
 * words (CR 207.2c) are flavor with no rules meaning; the label otherwise sits between the line start and
 * "Whenever", so the boundary-anchored trigger regex (here AND coverage.js's TRIGGER_SENTENCE_RE / residue
 * strip) never matches. Exported so the coverage metric normalizes IDENTICALLY — the shaped-sentence count
 * and the detected-trigger count must agree, or a landfall card mis-classifies. Currently just "Landfall —".
 */
export function stripTriggerAbilityLabel(oracle) {
  // "treasure hunter" is Knuckles the Echidna's flavor ability-word label on its upkeep-win trigger
  // ("Treasure Hunter — At the beginning of your upkeep, …"). Like the others it's CR 207.2c flavor with
  // no rules meaning; stripping it lets the boundary-anchored trigger regex see the bare "At the beginning".
  return String(oracle || "").replace(/^(?:landfall|constellation|eerie|heroic|magecraft|treasure hunter)\s*[—–-]\s*/gim, "");
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Is `sentence` a FOLLOW-UP that belongs to the trigger just matched (vs a separate ability)? A
 * triggered ability's WHOLE effect lives on ONE oracle line — "each opponent loses 2 life. You gain
 * 2 life and draw a card." (Shroudstomper), "create a 0/0 token. Put a +1/+1 counter on it."
 * (Recon Craft Theta), "mill a card. If a land card was milled this way, you gain 2 life." (Loafing
 * Giant) — while DISTINCT abilities are newline-delimited. So on the SAME line, every sentence after
 * the trigger's first IS part of its effect; the caller walks only up to the first newline. The
 * sole same-line sentences that are NOT this trigger's effect are a SECOND trigger (When/Whenever/At)
 * or an activated ability (`{cost}: …`), which we exclude here. Appending the whole effect lets the
 * all-or-nothing parser see it all: a modeled follow-up resolves too; an unmodeled one drops the
 * WHOLE program to low → Arbiter. Never a partial (CR-faithful: a trigger does all of its effect or,
 * when we can't model it, none of it — routed to the Arbiter).
 */
function isFollowupSentence(sentence) {
  const t = String(sentence).trim().toLowerCase();
  if (!t) return false;
  if (/^(when|whenever|at)\b/.test(t)) return false; // a SECOND trigger, not this one's effect
  if (t.includes(":")) return false;                  // an activated ability
  return true;                                         // any other same-line sentence continues the effect
}

/**
 * Split "<condition>, <effect>" (the text after the leading keyword, sans the
 * trailing period) into its parts, peeling off an "if <cond>," intervening
 * clause (CR 603.4) when present.
 */
function splitTriggerSentence(inner) {
  // EVENT_VERBS: verbs that appear in trigger CONDITIONS. If the text before the first comma
  // lacks one, that comma is inside a card name ("Pantlaza, Sun's Vanguard or another Dinosaur
  // you control enters …") — advance to the next comma that yields an event-verb condition.
  // MILL-ON-EVENT (Wave 3b): "milled"/"mills" are condition verbs ("one or more nonland cards are milled",
  // "a player mills a nonland card"). Without them, the advance-past-name-commas loop below would wrongly
  // skip the real condition boundary — for "one or more nonland cards are milled, draw a card, …" the FIRST
  // comma's left side lacks a (pre-mill) event verb, so the loop would advance to the comma after "draw a
  // card" (matching "draws? a"), swallowing the first effect sentence INTO the condition. Listing the mill
  // verbs anchors the split at the correct comma.
  const hasEventVerb = (s) => /\b(?:enters|dies|attacks|blocks|deals|casts?|sacrifice[sd]?|gain(?:s)? life|draws? (?:a|your)|beginning|milled|mills)\b/.test(s);
  let splitIdx = inner.indexOf(",");
  if (splitIdx === -1) return null;
  if (!hasEventVerb(inner.slice(0, splitIdx))) {
    let pos = splitIdx + 1;
    while (pos < inner.length) {
      const next = inner.indexOf(",", pos);
      if (next === -1) break;
      if (hasEventVerb(inner.slice(0, next))) { splitIdx = next; break; }
      pos = next + 1;
    }
  }
  // TYPED-CAST-LIST guard — a "cast a <A>, <B>, or <C> spell" condition (Sram: "cast an Aura, Equipment, or
  // Vehicle spell") puts a comma INSIDE the condition, before the word "spell". The prefix "you cast an
  // Aura" already has the "cast" event verb, so the loop above stops at that first comma and TRUNCATES the
  // type list — leaving a partial condition + a garbled effect. The cast condition only ends at "…spell", so
  // when the chosen split prefix is a cast clause that hasn't reached "spell" yet, advance to the first
  // comma AFTER "spell". Gated to the cast case (prefix has "cast", lacks "spell"); other triggers unchanged.
  if (/\bcasts?\b/.test(inner.slice(0, splitIdx)) && !/\bspell\b/.test(inner.slice(0, splitIdx))) {
    const spellIdx = inner.search(/\bspell\b/);
    if (spellIdx !== -1) {
      const afterSpell = inner.indexOf(",", spellIdx);
      if (afterSpell !== -1) splitIdx = afterSpell;
    }
  }
  const condition = inner.slice(0, splitIdx).trim();
  let rest = inner.slice(splitIdx + 1).trim();
  let interveningIf = null;
  if (/^if\b/i.test(rest)) {
    const nextComma = rest.indexOf(",");
    if (nextComma !== -1) {
      interveningIf = rest.slice(0, nextComma).replace(/^if\s+/i, "").trim();
      rest = rest.slice(nextComma + 1).trim();
    }
  }
  return { condition, effectClause: rest, interveningIf };
}

/** The subject phrase before an event verb ("a creature", "another creature you control"). */
function subjectBefore(condition, verb) {
  return String(condition).split(new RegExp(`\\b${verb}\\b`))[0].trim();
}

/**
 * Map an etb/dies subject phrase to a creature-scope `scopeMatches` ENFORCES, or null. Only the
 * shapes the matcher can faithfully restrict are modeled — bare ("a creature" / "another
 * creature") + the controller restriction ("you control" / "an opponent controls" / "you don't
 * control"). A subject carrying anything else (a keyword/type/power filter, "named", "token",
 * "nontoken") returns null → the trigger is left UNDETECTED → safe no-op (never an over-fire on a
 * restriction we can't check, CLAUDE.md §1.2). "another … an opponent controls" === the opponent
 * scope (an opponent's creature is never the source, so "another" is redundant there).
 */
function creatureSubjectScope(subj) {
  switch (subj) {
    case "a creature": return "eachCreature";
    case "another creature": return "eachOtherCreature";
    case "a creature you control": return "creatureYouControl";
    case "another creature you control": return "otherCreatureYouControl";
    case "a creature an opponent controls":
    case "another creature an opponent controls":
    case "a creature you don't control": return "creatureOpponentControls";
    default: return null;
  }
}

/**
 * Classify a trigger condition into { event, scope, whose } or null. selfRef is
 * "this <permanent>" or the card's own name. The CR 603.6d static guard makes
 * "enters tapped / enters with / as ~ enters" NOT an etb trigger.
 */
function classifyCondition(condRaw, cardName, cardType) {
  const c = condRaw.toLowerCase().trim();
  const nameL = String(cardName || "").toLowerCase();
  // SHORT-NAME SELF-REF (CR 201.4) — a LEGENDARY card refers to itself by the portion of its name before
  // the first comma ("Pantlaza" for "Pantlaza, Sun-Favored"). The full-name match below misses that, so a
  // self-trigger templated with the short name (the standard for legends) goes UNDETECTED → the whole card
  // wrongly routes to the Arbiter. Match the short name word-bounded (len >= 3), gated to legendary to keep
  // a common-word first name (rare on non-legends) from over-matching unrelated condition text. Exposed by
  // Pantlaza, Sun-Favored ("Whenever Pantlaza or another Dinosaur you control enters …").
  const isLegendary = /legendary/i.test(String(cardType || ""));
  const shortName = isLegendary ? nameL.split(",")[0].trim() : "";
  const shortNameRef = shortName.length >= 3 && shortName !== nameL
    && new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(c);
  const selfRef = /\bthis\b/.test(c) || (nameL && c.includes(nameL)) || shortNameRef;

  // ===== COMPOUND self-event guard (CREED, CLAUDE.md §1.2) ===== A condition that names TWO trigger
  // events — "enters or leaves the battlefield" (Brandywine Farmer), "enters or dies" (Vinereap Mentor),
  // "enters or attacks" (Grave Titan — makes its Zombies on ETB only, never on attack), "enters or is put
  // into a graveyard" (Ichor Wellspring / Servo Schematic — the artifact-recursion family), or an embedded
  // second when-clause "dies and when you discard this card" (Bartered Cow) — would be TRUNCATED by the
  // single-event branches below to just the FIRST verb, silently DROPPING the other half (the trigger
  // would fire on only one of the two events — a confident WRONG partial). Until compound trigger events
  // are modeled, leave it UNDETECTED: the trigger-sentence count then mismatches in
  // allTriggerSentencesModeled and the whole card routes to the Arbiter (a SAFE false-negative), mirroring
  // the attacks-or-blocks / becomes-blocked guards below. FIX-TRIG-COMPOUND (Rod QA #1): the original tally
  // counted only enters/dies/leaves, so "enters or attacks" (Grave Titan) and "enters or is put into a
  // graveyard" slipped through (eventVerbs==1) — attacks/blocks/put-into-graveyard are now counted too. A
  // single-event "attacks"/"blocks"/etc. stays at eventVerbs==1 and resolves normally below.
  const eventVerbs = [/\benters\b/, /\bdies\b/, /leaves the battlefield/, /\battacks\b/, /\bblocks\b/, /put into a graveyard/]
    .filter((re) => re.test(c)).length;
  if (eventVerbs >= 2) return null;
  if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(c)) return null; // an embedded second trigger clause

  // ===== DEATH-DRAIN — compound self-subject, creature UNION (carve-out BEFORE the "or another" rejects) =====
  // "this creature/<name> or another creature [you control] dies" is the union { self } ∪ { other creatures
  // [you control] } = EXACTLY the bare "a creature [you control] dies" event (CR 603.6e) — so it maps to the
  // very scope+effect path Bastion of Remembrance / Dictate of Erebos already resolve natively (aristocrats
  // drains: Blood Artist, Zulaport Cutthroat, Butcher of Malakir, …). The general guards below reject all
  // "or another" (a partial-fire risk in the open-ended case); this recognizes ONLY the clean creature-only
  // union and maps it to the equivalent enforceable scope. CREED: the subject must reduce EXACTLY to the
  // creature union — ANY extra type ("or planeswalker"/"or artifact"), keyword, power, or named/with/while/
  // during restriction falls through to the reject and stays on the Arbiter (Cruel Celebrant's "or
  // planeswalker" half is intentionally NOT modeled here). Dies only — the etb union stays deferred.
  if (selfRef && /\bdies\b/.test(c) && /\bor another creature\b/.test(c)) {
    const subj = subjectBefore(c, "dies");
    if (/^(?:this [a-z]+|[a-z0-9',. -]+?) or another creature(?: you control)?$/.test(subj)
        && !/\b(?:or planeswalker|or artifact|or enchantment|or land|named|with|while|during|token|nontoken|that)\b/.test(subj)) {
      return { event: "dies", scope: /you control$/.test(subj) ? "creatureYouControl" : "eachCreature", whose: "any" };
    }
  }

  // ===== SUBTYPE-ETB-SELF (Pantlaza family) — "NAME or another SUBTYPE you control enters" =====
  // "Pantlaza, Sun's Vanguard or another Dinosaur you control enters the battlefield" = the union
  // { self } ∪ { other SUBTYPEs you control } where self IS always a SUBTYPE (Pantlaza is a Dinosaur).
  // That union = "a SUBTYPE you control enters" — so the scope maps faithfully to a type-filtered
  // controller-scoped ETB. The subtype MUST be a single-word creature subtype checkable via typeStr;
  // any multi-word, keyword, power, or named restriction falls through to the rejects below (Arbiter).
  // ETB only — the DEATH-DRAIN carve-out above handles the dies analog.
  if (selfRef && /\bor another\b/.test(c) && /\benters(?:\s+the battlefield)?\s*$/.test(c)) {
    const subtypeM = subjectBefore(c, "enters").match(/\bor another ([a-z]+) you control\s*$/);
    if (subtypeM) {
      const sub = subtypeM[1];
      return { event: "etb", scope: "subtypeYouControl", whose: "any", subtypeFilter: sub.charAt(0).toUpperCase() + sub.slice(1) };
    }
  }

  // ===== POWER-THRESHOLD ETB (Garruk's Uprising, Elemental Bond, Temur Ascendancy) ===== "a creature you
  // control with power N or greater enters" — the "with" here is a SCOPE-EXPRESSIBLE restriction (the
  // entering creature's layer-resolved power ≥ N, checked at ETB), UNLIKE the generic unmodeled "with <…>"
  // (a +1/+1 counter / keyword) the FIX-TRIG-CONDITION guard below rejects. Carved out BEFORE that guard.
  // "a creature" → creature-only (no land-entry concern). scopeMatches reads creaturePower(perm, state).
  if (/\benters(?:\s+the battlefield)?\s*$/.test(c)) {
    const powM = subjectBefore(c, "enters").match(/^a creature you control with power (\d+) or greater$/);
    if (powM) return { event: "etb", scope: "creatureYouControlPower", whose: "any", powerThreshold: parseInt(powM[1], 10) };
  }

  // ===== COMPOUND-SUBJECT guard (CREED, CLAUDE.md §1.2; Rod QA #1 FIX-TRIG-CONDITION, the "or another"
  // sub-case) ===== A single-event condition that names a SECOND subject after the self — "this creature
  // OR ANOTHER creature you control dies/enters" (Butcher of Malakir, Zulaport Cutthroat, Cruel Celebrant)
  // — is read as a BARE SELF trigger by the selfRef branches below (selfRef matches "this"), silently
  // DROPPING the "or another creature you control" half so the ability fires ONLY on the source's own
  // event — a confident WRONG partial. Leave it UNDETECTED → the whole card routes to the Arbiter (a SAFE
  // false-negative), mirroring the compound-event guard above. Exposed by the ED-2 each-player/each-opponent
  // edict slice (the sacrifice EFFECT became modeled, flipping these toward native). The BROADER
  // FIX-TRIG-CONDITION sub-case (scope-inexpressible restrictions) remains Rod/Erin's lane.
  if (selfRef && /\bor another\b/.test(c)) return null;

  // ===== FIX-TRIG-CONDITION (Rod QA #1, CREED CLAUDE.md §1.2) ===== Reject conditions whose SUBJECT or
  // RESTRICTION the scope system can't faithfully represent — the single-event branches below would map
  // them to a bare self / controller scope and silently DROP the restriction or a second subject, then
  // over- or under-fire (a confident WRONG partial). All route to the Arbiter (safe false-negative):
  //  - an alternate 2nd subject — "this/<name> OR ANOTHER creature you control dies/enters" (Zulaport
  //    Cutthroat, Cruel Celebrant, Rotlung Reanimator, Headless Rider, the Rally tribe) — only the leading
  //    subject is modeled, so the "or another …" half would be dropped (drains/recurs only on self-death).
  //  - "dealt damage by <…>" (Sengir Vampire / Sengir Bats / Vampiric Dragon / Blood Cultist) — a
  //    restriction the broad selfRef misreads as a bare self-dies (fires when the SOURCE dies, never works).
  //  - a scope-inexpressible restriction: "with <…>" (Tenured Inkcaster "with a +1/+1 counter on it"),
  //    "while <…>" (Seasoned Warrenguard), "the player with <…>" (Preacher of the Schism), "named <…>",
  //    "during <…>" (Mongrel Pack "dies during combat"). The modeled clean forms (this/<name>/a-creature-
  //    you-control + bare enters/dies/attacks/blocks, upkeep/end/draw step, cast-a-spell) carry NONE of
  //    these tokens, so this is purely additive (confirmed collateral-free by the corpus A/B sweep).
  if (/\bor another\b/.test(c)) return null;
  if (/\bdealt damage by\b/.test(c)) return null;
  if (/\bthe player with\b/.test(c)) return null;
  // The "with …" rejection guards scope-INEXPRESSIBLE restrictions ("with a +1/+1 counter on it"). Two cast
  // shapes use "with" but are PRECISELY checkable on the cast spell itself — "cast a spell with {X} in its
  // mana cost" (printed-cost test) and "cast a spell with mana value N or greater/less" (CR 202.3). Exempt
  // ONLY those exact anchored shapes here so they reach the cast matchers below; everything else "with …"
  // still routes to the Arbiter (a SAFE false-negative). The shapes are re-anchored at their matchers.
  const castWithExempt = /^(?:you|an opponent|a player|each player) casts? an? spell with (?:\{x\} in its mana cost|mana value \d+ or (?:greater|more|less|fewer))$/.test(c);
  if (!castWithExempt && /\b(?:with|while|during|named)\b/.test(c)) return null;

  // The subject is mapped ONLY to a scope scopeMatches can ENFORCE (bare, or the controller
  // restriction); any other restriction (keyword/type/power/named/token) → null → UNDETECTED, so
  // we never over-fire on a restriction we can't check (CLAUDE.md §1.2). `subjectBefore` is the
  // exact text before the event verb.
  if (/\benters\b/.test(c) && !/\benters (the battlefield )?(tapped|with|as)\b/.test(c)) {
    if (selfRef) return { event: "etb", scope: "self", whose: "any" };
    // NONTOKEN-SUBJECT ETB (wave3b) — "a nontoken creature you control enters" (Guardian Project / The
    // Great Henge / Blessed Sanctuary) and "a nontoken <Subtype> you control enters" (Sosuke's Summons —
    // "create a 1/1 green Snake"). Same scope-expressible nontoken restriction (CR 111.1) as the dies
    // analog above: nontokenFilter:true GATES on the entering permanent's token-ness in scopeMatches, so
    // a TOKEN of the matching kind entering does NOT fire. Controller-scoped only; the bare "enters" is
    // matched (the tapped/with/as guard above already excluded the static-replacement shapes). Checked
    // BEFORE the another-subtype / creatureSubjectScope matchers, which don't recognize "nontoken".
    const etbSubjRaw = subjectBefore(c, "enters");
    if (etbSubjRaw === "a nontoken creature you control") return { event: "etb", scope: "creatureYouControl", whose: "any", nontokenFilter: true };
    const ntSubEtb = etbSubjRaw.match(/^a nontoken ([a-z]{3,}) you control$/);
    if (ntSubEtb && !NON_SUBTYPE_ETB_WORDS.has(ntSubEtb[1])) {
      return { event: "etb", scope: "subtypeYouControl", whose: "any", subtypeFilter: ntSubEtb[1].charAt(0).toUpperCase() + ntSubEtb[1].slice(1), nontokenFilter: true };
    }
    // ANOTHER-SUBTYPE ETB — "another <type/subtype> [you control] enters" (Elvish Vanguard / Youthful Valkyrie /
    // Arcbound Crusher families). A single-word type that typeStr can enforce; NON_SUBTYPE_ETB_WORDS rejects
    // supertypes, meta words, and colors whose typeStr check would silently never fire (CREED FP guard).
    // "creature" stays in the denylist → falls through to creatureSubjectScope below (existing handling).
    // "artifact" / "enchantment" / "land" are NOT in the denylist — typeStr includes them literally.
    const etbSubj = subjectBefore(c, "enters");
    const anotherSubM = etbSubj.match(/^another ([a-z]+)(?: you control)?$/);
    if (anotherSubM && !NON_SUBTYPE_ETB_WORDS.has(anotherSubM[1])) {
      const sub = anotherSubM[1].charAt(0).toUpperCase() + anotherSubM[1].slice(1);
      const youControl = /you control$/.test(etbSubj.trim());
      return { event: "etb", scope: youControl ? "otherSubtypeYouControl" : "otherSubtypeAnywhere", whose: "any", subtypeFilter: sub };
    }
    const scope = creatureSubjectScope(subjectBefore(c, "enters"));
    if (scope) return { event: "etb", scope, whose: "any" };
  }
  if (/\bdies\b/.test(c)) {
    if (selfRef) return { event: "dies", scope: "self", whose: "any" };
    // NONTOKEN-SUBJECT dies (wave3b) — "a nontoken creature you control dies" (Remembrance / Open the
    // Graves / Ulvenwald Mysteries — the token-recursion family) and "a nontoken <Subtype> you control
    // dies" (Lazotep Sliver — "amass Slivers 2"). The "nontoken" qualifier is a SCOPE-EXPRESSIBLE
    // restriction (the dead permanent must NOT be a token, CR 111.1 — checked via card.token in
    // scopeMatches), so it's carved out HERE rather than rejected. nontokenFilter:true GATES firing on
    // the dead permanent's token-ness; without the gate a token of the matching kind dying would fire
    // (the #1 FP — Lazotep's own amass-minted Sliver Army token dying would re-fire its amass). Anchored
    // controller-scoped ONLY ("you control"): the scope below enforces both the controller AND the
    // nontoken gate; a no-controller form ("a nontoken creature dies", Mimic Vat) stays UNDETECTED (its
    // eachCreature scope can't carry the controller-agnostic nontoken check cleanly) → Arbiter (SAFE FN).
    // Checked BEFORE the bare creatureSubjectScope / subtype matchers because those don't see "nontoken".
    const ntCreatureDies = c.match(/^a nontoken creature you control dies$/);
    if (ntCreatureDies) return { event: "dies", scope: "creatureYouControl", whose: "any", nontokenFilter: true };
    // The NON_SUBTYPE_ETB_WORDS denylist (shared with the ETB path) rejects a meta-word subject
    // ("permanent"/"planeswalker"/a color) whose typeStr-substring scope check would silently never fire —
    // claiming native on a do-nothing trigger is a CREED FP. "artifact"/"enchantment" are NOT denylisted
    // (real type-line tokens — Replication Specialist's "nontoken artifact"). Zero live corpus hits today;
    // the guard keeps the path robust against future additions, matching the ETB matcher's hygiene.
    const ntSubDies = c.match(/^a nontoken ([a-z]{3,}) you control dies$/);
    if (ntSubDies && !NON_SUBTYPE_ETB_WORDS.has(ntSubDies[1])) {
      return { event: "dies", scope: "subtypeYouControl", whose: "any", subtypeFilter: ntSubDies[1].charAt(0).toUpperCase() + ntSubDies[1].slice(1), nontokenFilter: true };
    }
    const scope = creatureSubjectScope(subjectBefore(c, "dies"));
    if (scope) return { event: "dies", scope, whose: "any" };
    // SUBTYPE dies (tribal payoffs — Laid to Rest / Slimefoot / Crossway Troublemakers). Single-word
    // subtype filter reusing subtypeYouControl; checkDiesTriggers threads the dead creature as
    // triggeringPermanent. The with/while/during/named/or-another guards above already rejected the
    // restricted shapes, so this only captures the clean "a <Subtype> you control dies" form.
    const diesSub = c.match(/^a ([a-z]{3,}) you control dies$/);
    if (diesSub) return { event: "dies", scope: "subtypeYouControl", whose: "any", subtypeFilter: diesSub[1].charAt(0).toUpperCase() + diesSub[1].slice(1) };
  }
  // LANDFALL (CR 603 — landfall is an ability word, CR 207.2c, for a TRIGGERED ability; NOT a replacement
  // effect, so not CR 614) — "Landfall — Whenever a land you control enters" /
  // "… a land enters the battlefield under your control" (Tatyova, Lotus Cobra, Rampaging Baloths, Jaddi
  // Offshoot, the Zendikar landfall payoffs). A NEW land-entry event fired by the play-land path
  // (checkLandfallTriggers). Controller-scoped ONLY — the entering land is YOURS. The "Landfall —" ability-word
  // label (CR 207.2c, flavor) is stripped upstream in detectTriggers so the bare condition reaches here. Only
  // the anchored bare forms: a filtered subject ("a basic land", "another land", "a land an opponent controls")
  // or an added "enters tapped" rider fails the anchor → UNDETECTED → Arbiter (never an over-fire we can't scope).
  if (/^a land you control enters$/.test(c) || /^a land enters(?: the battlefield)? under your control$/.test(c)) {
    return { event: "landfall", scope: "landYouControl", whose: "any" };
  }
  // PERM-ENTERS — "Whenever an artifact you control enters" (affinity/improvise payoffs — Reckless
  // Fireweaver, Salivating Gremlins, Thopter Architect) and "Whenever an enchantment you control
  // enters" (Constellation payoffs — Setessan Champion, Nexus Wardens, Favored of Iroas). The
  // "Constellation —" / "Eerie —" ability-word labels are stripped by stripTriggerAbilityLabel before
  // classifyCondition sees them. Controller-scoped ONLY: bare "an artifact enters" (without "you
  // control") covers the opponent's artifacts too — a scope the engine cannot enforce without knowing
  // who controls the entering permanent → UNDETECTED → Arbiter (SAFE false-negative; CLAUDE.md §1.2).
  // Artifact Creature spells match the "artifact" filter (type-line substring, matching CR 205.2).
  if (/^an artifact you control enters(?: the battlefield)?$/.test(c)) {
    return { event: "permanentEnters", permanentFilter: "artifact", scope: "artifactYouControl", whose: "any" };
  }
  if (/^an enchantment you control enters(?: the battlefield)?$/.test(c)) {
    return { event: "permanentEnters", permanentFilter: "enchantment", scope: "enchantmentYouControl", whose: "any" };
  }
  // "Leaves the battlefield" (LTB) is intentionally NOT detected: the engine fires only etb / dies /
  // step / attacks events (triggersForEvent has no "ltb" caller), so an ltb trigger detected here would
  // be classified native yet NEVER fire — a false positive (the whole ability silently does nothing,
  // e.g. City Pigeon / Featherbrained Filcher's "When this leaves the battlefield, create a Food token").
  // Leave it UNDETECTED → the card routes to the Arbiter (safe) until the engine fires LTB on every
  // zone-change (dies + exile + bounce). NOTE: the self-sac fail-safe (abilities.sacrificeDropsTrigger)
  // independently detects "leaves the battlefield" to keep self-sac costs safe — that path is unaffected.

  if (/beginning of (your|each) (upkeep|end step|draw step)/.test(c)) {
    const whose = /\beach\b/.test(c) ? "any" : "yours";
    const event = /end step/.test(c) ? "endStep" : /draw step/.test(c) ? "draw" : "upkeep";
    return { event, scope: "you", whose };
  }
  // TRIG-LIFEGAIN — the lifegain event (CR 119.3, a player gaining life). BARE "you gain life" only,
  // anchored: a conditional ("…for the first time each turn") or compound ("…gain or lose life") leaves
  // residue and stays UNDETECTED → Arbiter (a SAFE false-negative). whose:"any" NOT "yours" — life gain
  // isn't tied to the active player's turn (lifelink / an instant resolve on ANY turn), and the activePlayer
  // gate on "yours" (triggersForEvent) would wrongly drop an off-turn gain. checkLifegainTriggers instead
  // scans ONLY the gaining player's sources, so "you gain life" still fires for the gainer alone.
  if (/^you gain life$/.test(c)) return { event: "lifegain", scope: "you", whose: "any" };
  // TRIG-DRAW — the card-draw event (CR 121.1, drawing a card). BARE "you draw a card" only, anchored: a
  // conditional ("…your second card each turn"), scaled, or compound variant leaves residue and stays
  // UNDETECTED → Arbiter (a SAFE false-negative). Like lifegain, whose:"any" + checkCardDrawnTriggers scans
  // ONLY the drawing player's sources (drawing is turn-agnostic — an instant draws on any player's turn).
  if (/^you draw a card$/.test(c)) return { event: "cardDrawn", scope: "you", whose: "any" };
  // TRIG-DRAW2 — "draw your second card each turn" (the draw-doubler payoff). Anchored to the BARE
  // second-card form (each/this turn); a different ordinal ("first/third"), scaled, or rider variant stays
  // UNDETECTED → Arbiter. Same whose:"any" + scan-only-the-drawer as cardDrawn; fires ONCE when the draw
  // crosses the 2nd card of the turn (checkCardDrawnTriggers reads cardsDrawnThisTurn, reset for all seats).
  if (/^you draw your second card (?:each|this) turn$/.test(c)) return { event: "drawSecond", scope: "you", whose: "any" };
  // TRIG-SACRIFICE — "Whenever you sacrifice a <permanent|creature|artifact>" (the sac'd thing is always
  // YOURS, so the scope is an EXACT type-predicate on the sacrificed permanent, checked in
  // checkSacrificeTriggers — NOT a scopeMatches scope). Only the three type-checkable subjects classify; a
  // SUBTYPE ("a Clue/Food/Treasure"), token, land, or "creature you control"-style restriction subject →
  // null → Arbiter (SAFE — a restriction the engine can't check exactly, CLAUDE.md §1.2). "another"
  // excludes the source permanent. The generic dies/etb subject mapper (creatureSubjectScope) is the model.
  const sacM = c.match(/^you sacrifice (a|an|another) (permanent|creature|artifact)$/);
  if (sacM) return { event: "sacrifice", scope: "you", whose: "any", sacScope: sacM[2], sacAnother: sacM[1] === "another" };
  // ===== YOU ATTACK ===== "you attack" (the bare condition for "Whenever you attack, …" — fires ONCE
  // per combat when the controller declares any attacker). Different from "attacks" (per-attacker scope):
  // "you attack" is a controller-scoped once-per-combat event (Toph, Earthbending Master's second trigger).
  // Must be checked BEFORE the \battacks\b guard since both words are in "you attack".
  if (/^you attack$/.test(c)) return { event: "youAttack", scope: "you", whose: "any" };
  // ===== EACH-PLAYER (compound-combat-trigger guard) ===== A condition that names BOTH "attacks" and
  // "blocks" ("Whenever this creature attacks or blocks …" — Howling Golem, Burning Sun Cavalry) is a
  // COMPOUND combat event. The single-verb branches below model only ONE event, so detecting it as just
  // "attacks" would silently DROP the "blocks" half — the trigger would fire on attack only, a confident
  // WRONG partial (CLAUDE.md §1.2). Until compound combat events are modeled, leave it UNDETECTED: the
  // card's trigger-sentence count then mismatches in allTriggerSentencesModeled and the whole card routes
  // to the Arbiter (a SAFE false-negative). Exposed by the each-player draw slice (Howling Golem's
  // "each player draws a card" became modeled); the guard also retires the pre-existing Burning Sun
  // Cavalry false-positive. (The "blocks or becomes blocked" compound is a separate, unexposed case.)
  if (/\battacks\b/.test(c) && /\bblocks\b/.test(c)) return null;
  // ===== ATTACKS-ALONE (sole-attacker restriction guard, CR 508.4a) ===== "attacks alone" fires ONLY when
  // exactly one creature is attacking. The engine has NO sole-attacker gate, so the non-anchored
  // "a creature you control" match below would silently DROP "alone" and fire on EVERY attacker (Black
  // Panther / Agent 13 would grant their bonus whenever any creature attacks — a confident over-fire FP,
  // CLAUDE.md §1.2). Leave it UNDETECTED → the card routes to body-only/Arbiter (SAFE false-negative) until
  // an attacks-alone system exists. Also neutralizes Exalted's "attacks alone" reminder text. Caught by the
  // WAVE-3b adversarial sweep + a full-surface scan (this also retired the pre-existing Agent 13 FP).
  if (/\battacks\b/.test(c) && /\balone\b/.test(c)) return null;
  if (/\battacks\b/.test(c)) {
    if (selfRef) return { event: "attacks", scope: "self", whose: "any" };
    if (/a creature you control/.test(c)) return { event: "attacks", scope: "creatureYouControl", whose: "any" };
    // SUBTYPE attacks (tribal payoffs — Utvara Hellkite / Sanctum Seeker / Grolnok). Single-word subtype
    // filter reusing subtypeYouControl; checkAttackTriggers threads the attacker as triggeringPermanent.
    const atkSub = c.match(/^a ([a-z]{3,}) you control attacks$/);
    if (atkSub) return { event: "attacks", scope: "subtypeYouControl", whose: "any", subtypeFilter: atkSub[1].charAt(0).toUpperCase() + atkSub[1].slice(1) };
  }
  // ===== BLOCKS compound / restricted-block guard (CREED, CLAUDE.md §1.2) ===== The only modeled block
  // trigger is the BARE self-block ("Whenever this creature blocks, …"). A COMPOUND condition that also
  // names "becomes blocked" (Serra Inquisitors / Raging Gorilla / Assembled Alphas — "blocks or becomes
  // blocked by one or more X creatures") names a SECOND event; a RESTRICTED block ("blocks a creature
  // with flying" — Snarespinner / Skystinger; "blocks … by one or more <type/color> creatures") carries
  // a restriction the engine can't enforce. The bare-blocks branch below would DROP both and fire the
  // (modeled) self-pump on ANY plain block — a confident WRONG partial. Leave any non-bare self-block
  // UNDETECTED → Arbiter, mirroring the attacks-or-blocks guard. A self-pump on a plain block stays native.
  if (/\bbecomes blocked\b/.test(c)) return null;
  if (/\bblocks\b/.test(c) && selfRef && !/\bblocks\s*$/.test(c.trim())) return null;
  if (/\bblocks\b/.test(c) && selfRef) return { event: "blocks", scope: "self", whose: "any" };

  // Combat-damage-to-a-player (CR 510.2 — combat damage dealt). "Whenever <self> deals combat damage to a player" (self) /
  // "Whenever a creature you control deals combat damage to a player" (creatureYouControl). BARE form
  // only — END-anchored on "a player" so a qualified variant ("…to a player or planeswalker", "…to a
  // creature", "one or more creatures you control deal…", or any trailing rider) stays UNDETECTED →
  // Arbiter (a SAFE false-negative). combatResolution fires it off the real per-attacker player-damage.
  if (/\bdeals combat damage to a player$/.test(c)) {
    if (selfRef) return { event: "combatDamageToPlayer", scope: "self", whose: "any" };
    if (/a creature you control/.test(c)) return { event: "combatDamageToPlayer", scope: "creatureYouControl", whose: "any" };
    // SUBTYPE combat-damage (tribal payoffs — Curious Altisaur "Whenever a Dinosaur you control deals
    // combat damage to a player, draw a card"). A single-word creature SUBTYPE filter, reusing the
    // subtypeYouControl scope (controller + type-line substring; the attacker is threaded as
    // triggeringPermanent by combatResolution). Anchored single word, len >= 3 — "creature" is already
    // handled above; any other shape leaves residue → undetected → Arbiter (never an over-fire).
    const cdSub = c.match(/^a ([a-z]{3,}) you control deals combat damage to a player$/);
    if (cdSub) return { event: "combatDamageToPlayer", scope: "subtypeYouControl", whose: "any", subtypeFilter: cdSub[1].charAt(0).toUpperCase() + cdSub[1].slice(1) };
  }
  // BATCH combat-damage (CR 510.4 — all combat damage is dealt as ONE event). "Whenever one or more
  // creatures you control deal combat damage to a player, <effect>" fires ONCE per combat regardless of
  // how many creatures connected (Grim Hireling, Professional Face-Breaker, the treasure/investigate/Food
  // payoffs) — distinct from the per-attacker combatDamageToPlayer above. checkBatchCombatDamageTriggers
  // fires it exactly once per controller who dealt player damage this combat. Anchored: a qualified variant
  // ("…to a player or planeswalker", a rider) leaves residue → undetected → Arbiter (a SAFE false-negative).
  if (/^one or more creatures you control deal combat damage to a player$/.test(c)) {
    return { event: "combatDamageBatch", scope: "you", whose: "any" };
  }

  // HEROIC (CR 702.35) — "Whenever you cast a spell that targets this creature, <effect>".
  // Fires when the controller casts any spell that has this permanent as a chosen target. The
  // scope is "self" (this permanent only); the engine fires it in checkCastTriggers by scanning
  // the cast spell's targets array for permanents with heroic descriptors. Anchored: a rider
  // ("that targets this creature and another target", a creature-type restriction) stays
  // UNDETECTED → Arbiter (a safe false-negative; never an over-fire).
  if (/^you cast a spell that targets this creature$/.test(c))
    return { event: "heroic", scope: "self", whose: "you" };

  // MAGECRAFT (CR 702.173) — "Whenever you cast or copy an instant or sorcery spell, <effect>".
  // Routes to the existing cast event + instantSorcery filter; "copy" is a separate CR 706.10
  // event not yet tracked, so the copy half is a safe false-negative (never over-fires).
  // checkCastTriggers already handles event:"cast" whose:"you" spellFilter:"instantSorcery",
  // so magecraft gets the CAST half for free. Anchored bare form only.
  if (/^you cast or copy an instant or sorcery spell$/.test(c))
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: "instantSorcery" };

  // Cast-spell triggers (CR 603.2, the spell-cast event). The WHOLE condition must reduce
  // to "(you|an opponent|a player|each player) cast(s) a[n] <filter> spell" — ANCHORED, so a
  // trailing rider ("… spell that targets …", "… spell from your graveyard", "… spell during
  // your turn", "… your first/second spell each turn") leaves residue and is NOT detected
  // (→ Arbiter), never an over-fire. `whose` = which caster; `spellFilter` = which types —
  // only the modeled filters (any / instant-or-sorcery / creature / noncreature) classify; a
  // color/subtype/historic/timing filter returns null → undetected. ("an?" greedily takes the
  // "n" of "an" but stops at the space of a bare "a".)
  // TRIG-CAST2 — "cast your second spell each turn" (the magecraft-second-spell payoff). Checked BEFORE the
  // generic cast matcher below (which is anchored to "…spell$" and so deliberately leaves this for the
  // Arbiter). BARE second-spell form only; a different ordinal ("first/third"), a spell-type rider, or any
  // other trailing text stays UNDETECTED → Arbiter. Fires via checkCastTriggers when the caster's
  // spellsCastThisTurn reaches 2 (reset for all seats at untap); whose:"any" + scan only the caster.
  if (/^you cast your second spell (?:each|this) turn$/.test(c)) return { event: "castSecond", scope: "you", whose: "any" };
  // TRIG-CASTNTH — "cast your <ordinal> spell each turn" generalized to the off-by-one-safe Nth-per-turn
  // event (CR 601, spells cast one at a time → spellsCastThisTurn equals N exactly once per turn). Covers the
  // controller form ("you cast your first/third spell each turn" — Rashmi) AND the opponent form ("an
  // opponent casts their first spell each turn" — Mind's Dilation). BARE form ONLY — a spell-type rider
  // ("…first noncreature spell") fails the `$` anchor → UNDETECTED → Arbiter (never an over-fire). The
  // PAYOFF still has to parse HIGH to fire (Rashmi's reveal/free-cast does not → stays non-native; the
  // detection is correct but the whole card routes to the Arbiter, a SAFE false-negative). checkCastTriggers
  // reads the CASTER's count. (The bare "second" form stays its own castSecond event for stable identity.)
  const nthM = c.match(/^(you|an opponent) casts? (?:your|their) (first|second|third) spell (?:each|this) turn$/);
  if (nthM) {
    const nth = nthM[2] === "first" ? 1 : nthM[2] === "second" ? 2 : 3;
    const whose = nthM[1] === "you" ? "you" : "opponent";
    return { event: "castNth", scope: "castWatcher", whose, nth };
  }
  // X-SPELL cast trigger — "cast a spell with {X} in its mana cost" (CR 107.3 / 601.2b). The {X} and "mana
  // cost" land AFTER "spell", so this never matches the generic "…spell$" matcher; it's its own anchored
  // form. spellFilter:{ kind:"hasX" } → spellMatchesFilter inspects the cast spell's printed mana cost.
  // (Zaxara's token-with-X-counters PAYOFF is owned by the xCastToken.js targeted hook; here a non-HIGH
  // payoff just no-ops through buildTriggerStack — no double token. A simple payoff like "draw a card" fires.)
  const xCastM = c.match(/^(you|an opponent|a player|each player) casts? an? spell with \{x\} in its mana cost$/);
  if (xCastM) {
    const whose = /you/.test(xCastM[1]) ? "you" : /opponent/.test(xCastM[1]) ? "opponent" : "any";
    return { event: "cast", scope: "castWatcher", whose, spellFilter: { kind: "hasX" } };
  }
  // MANA-VALUE-THRESHOLD cast trigger — "cast a spell with mana value N or greater/less" (CR 202.3). Like
  // the X form, the "with mana value …" rider is AFTER "spell", so it's an anchored standalone form. The
  // comparison reads the cast spell's mana value at cast time. "or more"/"or greater" → >= N; "or
  // less"/"or fewer" → <= N. An "exactly N" or unbounded variant isn't in this shape → UNDETECTED.
  const mvCastM = c.match(/^(you|an opponent|a player|each player) casts? an? spell with mana value (\d+) or (greater|more|less|fewer)$/);
  if (mvCastM) {
    const whose = /you/.test(mvCastM[1]) ? "you" : /opponent/.test(mvCastM[1]) ? "opponent" : "any";
    const op = /greater|more/.test(mvCastM[3]) ? "gte" : "lte";
    return { event: "cast", scope: "castWatcher", whose, spellFilter: { kind: "manaValue", op, value: parseInt(mvCastM[2], 10) } };
  }
  const castM = c.match(/^(you|an opponent|a player|each player) casts?\s+(?:an?|your|its|their)?\s*([a-z,\- ]*?)\s*spell$/);
  if (castM) {
    const whose = /you/.test(castM[1]) ? "you" : /opponent/.test(castM[1]) ? "opponent" : "any";
    const spellFilter = castSpellFilter(castM[2].trim());
    if (spellFilter) return { event: "cast", scope: "castWatcher", whose, spellFilter };
  }
  // ===== MILL-ON-EVENT (Wave 3b, CR 701.13a — milling cards is a SINGLE game event) ===== Two corpus
  // templates, both classified to the shared "milled" event (fired by checkMilledTriggers off the real
  // mill chokepoints — the mill effect atom + the inherent radiation ability):
  //   BATCH ("one or more [nonland] cards are milled") — fires ONCE per mill event regardless of how many
  //     cards were milled (Mirelurk Queen, Screeching Scorchbeast, The Wise Mothman). perCard:false.
  //   PER-CARD ("a player|an opponent mills a [nonland] card") — fires once per MATCHING card milled (CR
  //     701.13a — each milled card is a distinct object, so a payoff phrased per-card fires per-card;
  //     Glowing One "you gain 1 life" per nonland, Infesting Radroach). perCard:true.
  // `milledFilter` = "nonland" gates on the milled card's FRONT-face type (checkMilledTriggers), null = any
  // card. `whose` = "any" ("a player") or "opponent" (the milling player must be an opponent of the
  // watcher's controller — Infesting Radroach). Anchored end-to-end: a TYPE-filtered variant ("one or more
  // CREATURE cards are milled", "mills one or more cards" rider) or any other shape leaves residue → null →
  // Arbiter (a SAFE false-negative; CLAUDE.md §1.2). This is the trigger BIND only — the milled-card payoffs
  // (rad/draw/counter/token) already exist; an effect that can't parse HIGH (a "once each turn"/scaling
  // rider) still routes the WHOLE trigger to the Arbiter at flush (buildTriggerStack), never a partial.
  let milledM = c.match(/^one or more (nonland )?cards are milled$/);
  if (milledM) return { event: "milled", scope: "milled", whose: "any", perCard: false, milledFilter: milledM[1] ? "nonland" : null };
  milledM = c.match(/^(a player|an opponent) mills (?:a|an|one) (nonland )?card$/);
  if (milledM) {
    return { event: "milled", scope: "milled", whose: /opponent/.test(milledM[1]) ? "opponent" : "any", perCard: true, milledFilter: milledM[2] ? "nonland" : null };
  }
  return null;
}

// CAST-SUBTYPE: single bare words in "cast a[n] <word> spell" that are NOT a permanent/spell SUBTYPE — a
// type/supertype/category/ordinal/color that a word-bounded type-line match would NEVER fire on (claiming
// native while the trigger silently never fires = a CREED false positive). Mirrors staticAbilityParser's
// merged denylist convention (#338, NON_SUBTYPE_COST_FILTER_WORDS). Real subtypes (Elf, Dog, Dragon,
// Adventure, Aura, Knight…) are never here. Kept local so triggers.js stays a leaf module.
const NON_SUBTYPE_CAST_WORDS = new Set([
  "instant", "sorcery", "artifact", "enchantment", "creature", "noncreature", "land", "planeswalker", "battle",
  "historic", "legendary", "permanent", "spell", "colorless", "multicolored", "monocolored", "snow",
  "nonland", "kindred", "tribal", "first", "second", "third", "another", "your", "this",
  // COLORS — "cast a red/white/… spell" is a COLOR filter, never a type-line token, so subtype:Red would
  // never fire → claiming native = FP (Dragon's Claw, the Gnarr/Duo cycles, Sol'kanar, Titania's Chosen).
  // Caught by the corpus flip-diff. Color cast-triggers stay body-only → Arbiter until a color filter exists.
  "white", "blue", "black", "red", "green",
  // CAST-MODIFIERS / DEFINED TERMS — "a kicked spell" (kicker, Merfolk Falconer), "a LOUD spell" (a defined
  // term, The Karfell Rocker) describe HOW a spell was cast / a named property, never a type-line subtype →
  // would never fire → FP. Also flip-diff-caught. (The denylist is the codebase convention, #338; a future
  // subtype-allowlist would make this airtight — deferred as infra.)
  "kicked", "loud",
  // UN-SET DEFINED TERM — "an alliterative spell" (Treacherous Trapezist) is a name-based joke property
  // (two+ same-initial capitalized words in the name), NOT a type-line subtype → subtype:Alliterative would
  // never fire → a do-nothing native = FP (Hans, cycle 44 — the denylist leaked; concrete proof the
  // subtype-allowlist infra is worth building).
  "alliterative",
]);

// ANOTHER-SUBTYPE ETB: words that are NOT a creature subtype or permanents type — type/supertype/meta words
// whose typeStr inclusion check would never fire (claiming native while the trigger silently never fires = FP).
// "artifact", "enchantment", "land" are intentionally OMITTED — typeStr covers them faithfully
// ("Artifact", "Enchantment", "Land" appear literally in type lines). "creature" routes via creatureSubjectScope.
const NON_SUBTYPE_ETB_WORDS = new Set([
  "creature", "permanent", "spell", "planeswalker", "battle",
  "historic", "legendary", "colorless", "snow", "nonland", "noncreature",
  "nontoken", "token", "nonlegendary",
  "white", "blue", "black", "red", "green", // colors (never in type line)
  "another", "your", "this", "that", "each", "every",
  // CR-defined umbrella terms — not type-line tokens; typeStr check would silently never fire (FP).
  "outlaw", // CR 203.4c: {Assassin, Mercenary, Pirate, Rogue, Warlock}
]);

/** Map the words between "cast a[n]" and "spell" to a MODELED spell filter, or null. */
function castSpellFilter(text) {
  const f = String(text).trim();
  if (f === "") return "any";                                  // "casts a spell"
  if (/^(?:instant|sorcery|instant or sorcery)$/.test(f)) return "instantSorcery";
  if (f === "artifact") return "artifact";       // "Whenever you cast an artifact spell" (improvise/affinity payoffs)
  if (f === "enchantment") return "enchantment"; // "Whenever you cast an enchantment spell" (enchantress payoffs)
  if (f === "creature") return "creature";
  if (f === "noncreature") return "noncreature";
  // CAST-SUBTYPE — a single bare word that's a real subtype (not in the denylist) → match the cast spell's
  // type line (Elf/Dog/Dragon/Adventure/Aura spells; tribal cast payoffs). A multi-word phrase, color, or
  // denylisted word → null → undetected → Arbiter (a SAFE false-negative). Serialized as "subtype:Name".
  if (/^[a-z]+$/.test(f) && !NON_SUBTYPE_CAST_WORDS.has(f)) return `subtype:${f.charAt(0).toUpperCase() + f.slice(1)}`;
  // TYPED-LIST — an "A, B, or C" list of type words ("Aura, Equipment, or Vehicle" — Sram). Split on
  // commas / "or" / "and", strip a leftover leading "or "/"and " (the Oxford comma ", or" leaves "or
  // vehicle" when the comma split fires first), and require EVERY word to be a real type/subtype token (NOT
  // denylisted — same NON_SUBTYPE_CAST_WORDS gate as the single-word path, so a color/category word in the
  // list rejects the whole filter → null → Arbiter). The cast spell matches if its type line carries ANY
  // listed word (CR 205.2), exactly how "Aura, Equipment, or Vehicle" reads. Serialized as a typed object.
  const words = f
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/)
    .map((w) => w.trim().replace(/^(?:or|and)\s+/, ""))
    .filter(Boolean);
  if (words.length >= 2 && words.every((w) => /^[a-z]+$/.test(w) && !NON_SUBTYPE_CAST_WORDS.has(w))) {
    return { kind: "typed", words: words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) };
  }
  return null; // color / multi-word non-type / denylisted category → unmodeled
}

/**
 * Parse a Phase-1 trigger effect clause into a TriggerEffect, or null when it's
 * outside the bounded vocabulary (→ fail-safe no-op/Arbiter, never fabricated).
 */
function parseTriggerEffect(clauseRaw) {
  const c = clauseRaw.toLowerCase().trim();
  let m = c.match(/\bdraws?\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/);
  if (m) return { kind: "draw", amount: parseCount(m[1]), who: "controller" };
  m = c.match(/each opponent loses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "eachOpponent" };
  m = c.match(/deals?\s+(\d+)\s+damage to each opponent/);
  if (m) return { kind: "damage", amount: parseInt(m[1], 10), targetType: "eachOpponent" };
  m = c.match(/\bgains?\s+(\d+)\s+life/);
  if (m) return { kind: "gainLife", amount: parseInt(m[1], 10), who: "controller" };
  m = c.match(/\bloses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "controller" };
  return null;
}

const _detectCache = new WeakMap();

/**
 * TRIG-PUMP-1 (the trigger-effect compiler pilot) — a SELF-scope trigger states the pump on its OWN
 * source with the pronoun "it": "Whenever this creature attacks, IT gets +2/+0 until end of turn"
 * (Brazen Wolves), "…, IT gains trample until end of turn" (the combat-buff family). The modeled
 * self-pump atom keys off the literal subject "this creature" (target:"self" → ctx.sourceId in the
 * parser), so the effectClause "it gets/gains … until end of turn" must be normalized "it" →
 * "this creature" for the parser to model it. This regex is the CREED guard on WHEN to do that: it
 * matches ONLY the WHOLE-clause self-pump shapes the parser accepts (pure ±P/±T, ±P/±T + keyword
 * grant, or keyword-grant only — anchored start-to-end). A rider/compound ("it gets +2/+0 until end
 * of turn. Draw a card") leaves residue past `until end of turn$` → no match → no rewrite → stays
 * LOW → Arbiter (a SAFE false-negative). It mirrors parser.js's three self-pump matchers exactly;
 * the parser still re-gates the keyword set (an unmodeled keyword → LOW), so this only GIVES the
 * parser the chance to model it — it never asserts coverage on its own.
 */
const SELF_PUMP_IT_RE = /^it (?:gets [+-]\d+\/[+-]\d+(?: and gains .+)?|gains .+) until end of turn$/i;

// IT-COUNTER — the self-COUNTER analogue of SELF_PUMP_IT_RE: a SELF-scope trigger states its +1/+1 (or
// -1/-1) counter on its own source with the pronoun "it" — "Whenever this creature attacks, put a +1/+1
// counter on it" (the firebreathing-counter family). Mirrors the parser's self-counter shape
// (parser.js: "…counters? on this creature$", target:"self") with "it"; whole-clause anchored, so a
// rider/compound ("…on it. Draw a card") leaves it untouched → LOW → Arbiter (a SAFE false-negative).
const SELF_COUNTER_IT_RE = /^put (?:a|an|one|two|three|four|five|\d+) [+-]1\/[+-]1 counters? on it$/i;

// WAVE 3b COUNTERS-ON-EVENT — the NON-SELF triggering-referent counter. A NON-self attack / combat-damage
// trigger ("Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on THAT
// CREATURE" — Sphere Grid; "…attacks, put a +1/+1 counter on IT") names the TRIGGERING permanent (CR
// 608.2c — a pronoun in later text refers to the object the ability triggered on), NOT the source — so
// the self "it"→"this creature" rewrite above is WRONG here (it would target
// the source). Instead, for a NON-self scope ONLY, normalize the referent → the canonical sentinel "the
// triggering creature", which the WAVE-3b clause parser (effects/atoms/counterClauses.js) binds to
// ctx.triggeringPermanentId. The sentinel is a phrase that appears in ZERO printed oracle text, so a
// SPELL's anaphoric "it"/"that creature" (Big Play / Puncture Bolt / Miraculous Recovery) is NEVER
// rewritten (it isn't a non-self trigger) and stays LOW → Arbiter (CREED — no fabricated/mis-bound counter).
// ±1/±1 only (the enforced counter kinds); whole-clause anchored, so a rider/compound leaves it untouched.
const NONSELF_COUNTER_REF_RE = /^put (?:a|an|one|two|three|four|five|\d+) [+-]1\/[+-]1 counters? on (?:it|that creature)$/i;
// The NON-self scopes for which a bare "it"/"that creature" referent is the TRIGGERING permanent: the
// "a creature you control" / "a <Subtype> you control" attack + combat-damage watchers (Sphere Grid family).
const NONSELF_TRIGGERING_SCOPES = new Set(["creatureYouControl", "subtypeYouControl"]);

// ADDITIVE registry seam (WAVE 0): module-level list of extra trigger-condition detectors. A detector
// is `(condition, cardName, typeLine) => TriggerDescriptorClassification | null` and is consulted by
// detectTriggers ONLY after the inline classifyCondition returns falsy (inline matchers keep priority).
// Empty by default — a no-op until a slice registers one — so existing classification is untouched.
const _triggerDetectors = [];
export function registerTriggerDetector(fn) {
  if (typeof fn !== "function") throw new Error("detector must be a function");
  _triggerDetectors.push(fn);
}

/**
 * All triggered abilities printed on a card, as serializable TriggerDescriptors.
 * Cached by card identity (the regex pass runs once per distinct card object).
 */
export function detectTriggers(card) {
  if (!card || typeof card !== "object") return [];
  if (_detectCache.has(card)) return _detectCache.get(card);
  // Strip the leading "Landfall —" ability-word label (CR 207.2c — flavor, no rules meaning) so the trigger
  // regex below, which anchors "Whenever" at a line/sentence boundary, sees the bare "Whenever a land you
  // control enters …". Without this, "Landfall — Whenever …" puts "Whenever" mid-line and never matches.
  // SHARED with coverage.js (the trigger-sentence count + residue strip must see the same normalized text).
  const oracle = stripTriggerAbilityLabel(oracleOf(card));
  const out = [];
  if (oracle) {
    // Anchored at start / after a sentence boundary, like keywords.js — so a
    // mid-sentence "when" never false-matches.
    const re = /(?:^|[\n.;]\s*)(When|Whenever|At)\b\s+([^.]+)\./gi;
    let m;
    while ((m = re.exec(oracle)) !== null) {
      const inner = m[2].trim();
      const split = splitTriggerSentence(inner);
      if (!split) continue;
      let cls = classifyCondition(split.condition, card.name, card.type || card.type_line);
      // ADDITIVE registry seam (WAVE 0): a future slice registers a condition detector instead of
      // editing this dispatch body. The inline classifyCondition keeps priority — the registry runs
      // ONLY when it returns falsy, and the first detector to return a truthy descriptor wins. An
      // empty registry is an exact no-op (the loop body never runs). Each detector gets the same
      // inputs classifyCondition does (condition text, card name, type line).
      if (!cls) {
        for (const d of _triggerDetectors) {
          const r = d(split.condition, card.name, card.type || card.type_line);
          if (r) { cls = r; break; }
        }
      }
      if (!cls) continue;
      // Extend the effect with the trigger's remaining SAME-LINE sentences (reminder text stripped)
      // so the parser sees its WHOLE effect. A triggered ability's effect is one oracle line, so we
      // stop at the first newline — that avoids swallowing a separate ability on the next line. An
      // unmodeled follow-up then drops the whole program to low → Arbiter, instead of firing the
      // first effect natively and dropping the rest (a forbidden partial application).
      let effectClause = split.effectClause;
      const sameLine = oracle.slice(re.lastIndex).split("\n")[0].replace(/\([^)]*\)/g, " ");
      for (const sent of sameLine.split(/\.\s+|\.\s*$|;\s+/)) {
        const s = sent.trim();
        if (!s) continue;
        if (!isFollowupSentence(s)) break;
        effectClause += `. ${s}`;
      }
      // TRIG-PUMP-1: for a SELF-scope trigger only, normalize a leading "it" → "this creature" when
      // the WHOLE effect is the self-pump shape (SELF_PUMP_IT_RE), so the parser's self-pump atom
      // (target:"self") models it. Gated on `cls.scope === "self"`: in a NON-self trigger
      // ("Whenever a creature you control attacks, it gets…") the "it" is the OTHER triggering
      // creature, not the source — rewriting there would mis-pump the source, a forbidden false
      // positive. The whole-clause anchor leaves any rider/compound untouched (→ stays LOW → Arbiter).
      if (cls.scope === "self" && SELF_PUMP_IT_RE.test(effectClause)) {
        effectClause = effectClause.replace(/^it /i, "this creature ");
      } else if (cls.scope === "self" && SELF_COUNTER_IT_RE.test(effectClause)) {
        // IT-COUNTER: "…put a +1/+1 counter on IT" — "it" is the source (CR 113.7). Same self-scope gate
        // as the pump (a NON-self trigger's "it" is the OTHER triggering creature, never the source) +
        // the whole-clause anchor, so the parser's self-counter atom (target:"self") models it.
        effectClause = effectClause.replace(/ on it$/i, " on this creature");
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && NONSELF_COUNTER_REF_RE.test(effectClause)) {
        // WAVE 3b COUNTERS-ON-EVENT: a NON-self attack/combat-damage trigger's "…put a +1/+1 counter on IT
        // / on THAT CREATURE" — the referent is the TRIGGERING permanent (CR 608.2c), not the source.
        // Normalize → the sentinel "the triggering creature" so the WAVE-3b clause parser binds it to
        // ctx.triggeringPermanentId. Gated to the non-self triggering scopes (the spell anaphor never
        // reaches here) + the whole-clause anchor (a rider stays untouched → LOW → Arbiter), CREED-safe.
        effectClause = effectClause.replace(/ on (?:it|that creature)$/i, " on the triggering creature");
      }
      out.push({
        event: cls.event,
        scope: cls.scope,
        whose: cls.whose,
        spellFilter: cls.spellFilter,         // cast triggers only (undefined otherwise)
        nth: cls.nth,                         // TRIG-CASTNTH: 1|2|3 ("cast your Nth spell each turn"); else undefined
        permanentFilter: cls.permanentFilter, // PERM-ENTERS: "artifact"|"enchantment" (permanentEnters triggers only)
        subtypeFilter: cls.subtypeFilter,     // SUBTYPE-ETB-SELF only (e.g. "Dinosaur" for Pantlaza)
        nontokenFilter: cls.nontokenFilter,   // NONTOKEN-SUBJECT dies/enters only (Lazotep Sliver) — gate on !card.token
        powerThreshold: cls.powerThreshold,   // POWER-THRESHOLD ETB only (N for "power N or greater")
        sacScope: cls.sacScope,               // TRIG-SACRIFICE: "permanent"|"creature"|"artifact" (sacrifice triggers only)
        sacAnother: cls.sacAnother,           // TRIG-SACRIFICE: true for "another <subject>" — excludes the source
        perCard: cls.perCard,                 // MILL-ON-EVENT: true = per-card ("mills a card"), false = once-per-event ("one or more … are milled")
        milledFilter: cls.milledFilter,       // MILL-ON-EVENT: "nonland" | null (which milled cards count)
        optional: /\bmay\b/.test(effectClause.toLowerCase()),
        interveningIf: split.interveningIf,
        effect: parseTriggerEffect(effectClause),
        // Raw effect text so the flush stage (gameEngine, which can import the parser
        // without the triggers→parser→effectAtoms→triggers cycle) can parse it into a
        // full EffectProgram. P2.8 routes the rich-parsed program through the
        // EFFECT_PROGRAM resolver; `effect` stays the small fallback.
        effectClause,
        sourceText: `${m[1]} ${inner}`,
      });
    }
  }
  _detectCache.set(card, out);
  return out;
}

/** Convenience: does this card have any trigger for the given event? */
export function hasTriggerFor(card, event) {
  return detectTriggers(card).some(d => d.event === event);
}

// ─── Matching ──────────────────────────────────────────────────────────────────

function scopeMatches(descriptor, sourcePermanent, triggeringPermanent, state) {
  // NONTOKEN-SUBJECT gate (wave3b, CR 111.1) — "a nontoken creature/<Subtype> you control dies/enters"
  // (Lazotep Sliver, Remembrance, Guardian Project). The "nontoken" qualifier EXCLUDES token permanents:
  // a token of the matching kind triggering must NOT fire. A created token's card carries `token: true`
  // (tokenFactory / amass / resolvers convention); a real card has no such flag. This gate runs BEFORE the
  // scope switch so it composes with whichever scope (creatureYouControl / subtypeYouControl) the descriptor
  // chose. Load-bearing FP guard: without it Lazotep's OWN amass-minted Sliver Army token (a Sliver, so the
  // subtypeYouControl scope would match it) dying would re-fire its amass — a confident wrong fire.
  if (descriptor.nontokenFilter && triggeringPermanent?.card?.token) return false;
  switch (descriptor.scope) {
    case "self":
      return !triggeringPermanent || triggeringPermanent.id === sourcePermanent.id;
    case "you":
      return true; // step / lifegain / cardDrawn / youAttack triggers — `whose` gates ownership
    case "milled":
      // MILL-ON-EVENT — a player-mill event has NO triggering PERMANENT (the milled cards are library
      // objects, not permanents); the milling-player `whose` gate is applied in checkMilledTriggers, which
      // scans ALL players' watchers directly. Always matches here (like "you"): the event already proved a
      // mill happened, and the filter (nonland) + whose gate are enforced at the checkMilledTriggers site.
      return true;
    case "eachCreature":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent);
    case "eachOtherCreature":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent);
    case "creatureYouControl":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "otherCreatureYouControl":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "creatureOpponentControls":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller !== sourcePermanent.controller;
    case "landYouControl":
      // LANDFALL — the entering land must be controlled by the watcher's controller. checkLandfallTriggers
      // only fires on a land entry (triggeringPermanent is a land), but the isLandPerm guard keeps it exact.
      return !!triggeringPermanent && isLandPerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "artifactYouControl":
      // PERM-ENTERS artifact — type-line substring (CR 205.2) catches Artifact Creature; controller gate.
      return !!triggeringPermanent && /Artifact/.test(triggeringPermanent.card?.type || triggeringPermanent.card?.type_line || "") && triggeringPermanent.controller === sourcePermanent.controller;
    case "enchantmentYouControl":
      // PERM-ENTERS enchantment — Enchantment Creature / Aura matches too; controller gate.
      return !!triggeringPermanent && /Enchantment/.test(triggeringPermanent.card?.type || triggeringPermanent.card?.type_line || "") && triggeringPermanent.controller === sourcePermanent.controller;
    case "subtypeYouControl":
      // SUBTYPE scope — shared by FOUR events: SUBTYPE-ETB-SELF ("NAME or another SUBTYPE you control
      // enters", Pantlaza — #330), SUBTYPE combat-damage (#333), and SUBTYPE attacks / dies (#335). Fires
      // when the triggering permanent CARRIES the subtype in its type line AND is controlled by the source's
      // controller. The ETB-SELF "NAME" half is subsumed by the subtype check because that NAME is ALWAYS
      // the subtype (Pantlaza IS a Dinosaur), so self-inclusion is only valid when the SOURCE ITSELF carries
      // the subtype — a robustness hedge for the source's own entry. GATING self-inclusion on the source's
      // subtype is load-bearing across ALL these events: without it a non-SUBTYPE creature whose trigger
      // watches a SUBTYPE ("a Saproling you control dies" on Slimefoot, a Fungus — LIVE P0; "a Vehicle you
      // control deals combat damage" on Setzer, a Human) would over-fire on its OWN non-matching
      // death / damage / attack — a forbidden false positive (Hans, cycle 42; widened to attacks/dies #335).
      return !!triggeringPermanent
        && triggeringPermanent.controller === sourcePermanent.controller
        && (typeStr(triggeringPermanent.card).includes(descriptor.subtypeFilter || "")
            || (triggeringPermanent.id === sourcePermanent.id
                && typeStr(sourcePermanent.card).includes(descriptor.subtypeFilter || "")));
    case "otherSubtypeYouControl":
      // "another <SUBTYPE> you control enters" (Youthful Valkyrie / Champion of the Perished family).
      // Fires when a non-self permanent the source's controller controls carries the subtype in its type line.
      // Unlike subtypeYouControl (Pantlaza — "NAME or another SUBTYPE"), this NEVER self-triggers (id check).
      return !!triggeringPermanent
        && triggeringPermanent.id !== sourcePermanent.id
        && triggeringPermanent.controller === sourcePermanent.controller
        && typeStr(triggeringPermanent.card).includes(descriptor.subtypeFilter || "");
    case "otherSubtypeAnywhere":
      // "another <SUBTYPE> enters" — no controller restriction (Elvish Vanguard / Kavu Monarch / Arcbound Crusher).
      // Fires when any permanent from any controller carries the subtype, excluding the source itself.
      return !!triggeringPermanent
        && triggeringPermanent.id !== sourcePermanent.id
        && typeStr(triggeringPermanent.card).includes(descriptor.subtypeFilter || "");
    case "creatureYouControlPower":
      // POWER-THRESHOLD ETB — the entering creature you control with LAYER-RESOLVED power ≥ N (counters +
      // anthems included; checkEnterTriggers fires after the permanent + its enters-with counters are on
      // the battlefield, so creaturePower is accurate at ETB). `state` threaded through scopeMatches for this.
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller
        && creaturePower(triggeringPermanent, state) >= (descriptor.powerThreshold || 0);
    default:
      return false;
  }
}

function makePendingTrigger(descriptor, sourcePermanent, triggeringPermanent, triggeringContext) {
  const controller = sourcePermanent.controller;
  const context = {
    triggeringPermanentId: triggeringPermanent?.id,
    triggeringCardName: triggeringPermanent?.card?.name,
    triggeringController: triggeringPermanent?.controller,
    ...triggeringContext,
  };
  return {
    event: descriptor.event,
    source: { permanentId: sourcePermanent.id, cardId: sourcePermanent.card?.id, name: sourcePermanent.card?.name },
    controller,
    descriptor,
    context,
    targets: [],
    optional: descriptor.optional,
    // Serializable payload for flushTriggers -> stack. `resolver` MUST equal
    // RESOLVER_KEYS.TRIGGER_EFFECT — written as a literal so triggers.js stays a
    // leaf (resolvers.js imports applyTriggerEffect from here in PR-6).
    payload: {
      resolver: "trigger.effect",
      // MUST-FIX 3: thread the SOURCE permanent (the ability's own permanent — the one DEALING the damage) so
      // a damage trigger can route through the damage-replacement consult source-scoped. Serializable id only.
      params: { effect: descriptor.effect, controller, targets: [], context, sourcePermanentId: sourcePermanent.id },
    },
  };
}

/**
 * The PendingTriggers that fire for `event` from `sourcePermanent`, given the
 * object that caused the event (`triggeringPermanent`, may === source for
 * self-triggers) and any event extras (e.g. { defenderId }). Pure — returns data,
 * does not enqueue.
 */
export function triggersForEvent(state, { event, sourcePermanent, triggeringPermanent = null, triggeringContext = {} }) {
  if (!sourcePermanent?.card) return [];
  const descriptors = detectTriggers(sourcePermanent.card).filter(d => d.event === event);
  if (!descriptors.length) return [];
  const out = [];
  for (const d of descriptors) {
    if (!scopeMatches(d, sourcePermanent, triggeringPermanent, state)) continue;
    if (d.whose === "yours" && sourcePermanent.controller !== state.activePlayer) continue;
    // PHASE-TRIGGER (Wave 1): "At the beginning of each opponent's upkeep" — fire ONLY on an OPPONENT's
    // upkeep, never the source controller's own (CR 603.2b). The shared "upkeep" event also carries
    // whose:"yours" ("your upkeep") and whose:"any" ("each upkeep"); this branch excludes the
    // controller's own upkeep, the #1 false positive for the each-opponent shape (Viseling, Davriel,
    // Price of Knowledge). When the active player isn't an opponent of the source's controller (i.e. it
    // IS the controller, or a non-opponent in some future multiplayer wrinkle), skip.
    if (d.whose === "opponents" && !opponentsOf(state, sourcePermanent.controller).includes(state.activePlayer)) continue;
    out.push(makePendingTrigger(d, sourcePermanent, triggeringPermanent, triggeringContext));
  }
  return out;
}

/**
 * PW-8: an EMBLEM as a trigger SOURCE. An emblem has no battlefield permanent, but its triggered
 * abilities still fire (CR 114.2 — an emblem has the listed ability). Shaped like a permanent so
 * triggersForEvent / detectTriggers / makePendingTrigger treat it uniformly (its `card.oracle` is the
 * emblem's ability text; its `controller` scopes "you control" / "your upkeep").
 */
function emblemAsSource(emblem, controller) {
  return { id: emblem.id, controller, card: { oracle: emblem.oracle, name: "Emblem", type: "Emblem" }, isEmblem: true };
}

/** Every trigger SOURCE a player has: battlefield permanents + emblems (PW-8). */
function triggerSourcesOf(state, pid) {
  const p = state.players[pid];
  if (!p) return [];
  return [...(p.battlefield || []), ...(p.emblems || []).map((e) => emblemAsSource(e, pid))];
}

/**
 * Enqueue dies triggers for a batch of creatures that just died (CR 603.6c).
 * `dead` is destroyLethalCreatures' return — [{ id, controller, name, card }],
 * the look-back snapshot (CR 603.10a), since the permanents are already in the
 * graveyard. For each death we fire its own "when this dies" trigger plus every
 * surviving battlefield watcher ("whenever a creature dies"). Pure — appends to
 * pendingTriggers and returns new state.
 *
 * Phase-1 limitation: simultaneously-dying watchers don't see each other's
 * deaths (a dead Blood Artist won't drain off another creature that died in the
 * same batch). The common case — a death + a surviving drain — is covered.
 */
/**
 * Fire ETB ("enters the battlefield") triggers for a permanent that just entered (β-3b reanimation,
 * and reusable for any non-cast entry). `enteredPerm` is already ON the battlefield, so iterating every
 * battlefield watcher covers BOTH its own "when this enters" trigger AND others' "whenever a creature
 * enters" — mirrors enterPermanent's inline ETB loop. Pure — appends to pendingTriggers.
 */
export function checkEnterTriggers(state, enteredPerm) {
  if (!enteredPerm) return state;
  // The Wise Mothman "enters or attacks → each player gets a rad counter": detectTriggers' compound-event
  // guard Arbiter-routes this disjunction, so the rad bump is applied here at the single ETB-fire chokepoint
  // (#319-style targeted hook in mothmanRad.js). Fires only when the ENTERED permanent itself carries the
  // trigger — a no-op for every other card and for other creatures' entries. See mothmanRad.js for the
  // double-fire coordination note if the guard ever learns this disjunction.
  const s = applyMothmanRadOnEnter(state, enteredPerm);
  let fired = [];
  for (const pid of Object.keys(s.players)) {
    for (const watcher of triggerSourcesOf(s, pid)) {
      fired = fired.concat(triggersForEvent(s, { event: "etb", sourcePermanent: watcher, triggeringPermanent: enteredPerm }));
    }
  }
  if (!fired.length) return s;
  return { ...s, pendingTriggers: [...(s.pendingTriggers || []), ...fired] };
}

/**
 * LANDFALL — fire "landfall" triggers for a LAND that just entered (`enteredLand`, already on the
 * battlefield). Every battlefield/emblem watcher is checked; scopeMatches' `landYouControl` keeps it to
 * watchers controlled by the land's controller. Mirrors checkEnterTriggers/checkDiesTriggers. Pure —
 * appends to pendingTriggers. Called from the play-land path (applyPlayLand); a future slice fires it on
 * the ramp/fetch land-entry path too (a missed landfall there is a SAFE under-fire, never a wrong fire).
 */
export function checkLandfallTriggers(state, enteredLand) {
  if (!enteredLand) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "landfall", sourcePermanent: watcher, triggeringPermanent: enteredLand }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * PERM-ENTERS — fire "permanentEnters" triggers for a permanent that just entered the battlefield
 * (`enteredPerm`, already on the battlefield). Handles artifact-ETB ("whenever an artifact you
 * control enters") and enchantment-ETB ("whenever an enchantment you control enters") watchers.
 * scopeMatches' `artifactYouControl` / `enchantmentYouControl` gates each watcher to only fire when
 * the entering permanent is the right type AND controlled by the watcher's controller. Called from
 * enterPermanent (resolvers.js) immediately after checkEnterTriggers. Pure — appends to pendingTriggers.
 */
export function checkPermanentEntersTriggers(state, enteredPerm) {
  if (!enteredPerm) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "permanentEnters", sourcePermanent: watcher, triggeringPermanent: enteredPerm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

export function checkDiesTriggers(state, dead) {
  if (!dead || !dead.length) return state;
  let fired = [];
  for (const d of dead) {
    if (!d?.card) continue;
    const lookBack = { id: d.id, controller: d.controller, card: d.card };
    // DIES-TRIGGER-RESOURCE-PAYOFFS: the dying creature's last-known POWER (CR 603.6e), captured at the
    // SBA/destroy/sacrifice look-back BEFORE the permanent left the battlefield. Threaded as ctx.dyingPower
    // so a "<payoff> equal to its power" dies-trigger (Goldvein Hydra Treasures, Lifeblood Hydra gain+draw,
    // Feral Ghoul rad) reads the real on-board power. ONLY the SOURCE's OWN dies-trigger ("when THIS creature
    // dies") references "its power"; a surviving watcher ("whenever a creature dies") that reads a magnitude
    // off the triggering creature would also want it, so it's carried on both fires (a watcher that doesn't
    // use it simply ignores the ctx key). A dead entry with no captured power (PW SBA, an unsized CDA) carries
    // `undefined` → the payoff resolves to 0 (a clean no-op, never a fabricated count).
    const diesCtx = d.power != null ? { dyingPower: d.power } : {};
    fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: lookBack, triggeringPermanent: lookBack, triggeringContext: diesCtx }));
    for (const pid of Object.keys(state.players)) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: watcher, triggeringPermanent: lookBack, triggeringContext: diesCtx }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue step-boundary triggers (CR 603.2b) for the given event ("upkeep" /
 * "draw" / "endStep"). Scans every battlefield permanent; the descriptor's
 * `whose:"yours"` gate (applied in triggersForEvent) fires "your upkeep" only on
 * the controller's own turn while "each upkeep" fires on every turn. Pure.
 */
export function checkStepTriggers(state, event) {
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event, sourcePermanent: perm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue attack triggers (CR 508.3) for the full declared-attacker batch in
 * state.combat.attackers: each attacker's own "whenever this attacks" plus every
 * "whenever a creature you control attacks" watcher the attacking player
 * controls. Context carries the defenderId. Pure.
 */
export function checkAttackTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  let fired = [];
  // ===== "WHENEVER YOU ATTACK" — fires ONCE per combat (not per attacker) =====
  // All attackers belong to the same active player, so we use the first entry's attackingPlayer.
  // triggerSourcesOf covers battlefield permanents + emblems; triggersForEvent gates on scope:"you"
  // (always true) + whose:"any", so the trigger fires regardless of whose turn it is.
  const attackingPlayer = attackers[0]?.attackingPlayer;
  if (attackingPlayer) {
    for (const watcher of triggerSourcesOf(state, attackingPlayer)) {
      fired = fired.concat(triggersForEvent(state, { event: "youAttack", sourcePermanent: watcher, triggeringPermanent: null, triggeringContext: {} }));
    }
  }
  // ===== PER-ATTACKER triggers ("this attacks", "a creature you control attacks") =====
  for (const a of attackers) {
    const lk = findPermanent(state, a.permanentId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { defenderId: a.defender };
    // self ("this attacks") + the attacker's own "creature you control attacks"
    fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // other watchers the attacking player controls
    for (const watcher of triggerSourcesOf(state, a.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue combat-damage triggers (CR 510.2) for the attackers that dealt combat damage to a PLAYER this
 * step — driven by combatResolution's `playerEvents` (kind "combat-damage-player"), so they fire exactly
 * when real damage landed on a player. Each such attacker fires its own "Whenever this creature deals
 * combat damage to a player" plus every "a creature you control deals combat damage to a player" watcher
 * the attacking player controls. Mirrors checkAttackTriggers; pure. Called BEFORE the lethal-damage SBA
 * (a trading attacker may die to the SBA, but it triggered at the damage event — CR 510.2; abilities
 * that triggered on combat damage are put on the stack after the SBA, CR 510.3a — so we capture them
 * pre-SBA while the source still resolves).
 */
export function checkCombatDamageTriggers(state, playerEvents) {
  const hits = (playerEvents || []).filter((e) => e.kind === "combat-damage-player");
  if (!hits.length) return state;
  let fired = [];
  for (const ev of hits) {
    const lk = findPermanent(state, ev.attackerId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { damagedPlayerId: ev.defender, combatDamageAmount: ev.amount };
    // self ("this creature deals combat damage to a player")
    fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // the attacking player's "a creature you control deals combat damage to a player" watchers
    for (const watcher of triggerSourcesOf(state, ev.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * BATCH combat-damage (CR 510.4) — "Whenever one or more creatures you control deal combat damage to a
 * player" fires ONCE per combat per controller who connected, NOT once per attacker. From the same
 * `playerEvents` checkCombatDamageTriggers reads, collect the distinct set of attacking players who dealt
 * player damage this step, then fire each "combatDamageBatch" watcher that player controls exactly once
 * (triggeringPermanent is null — it's a batch event, not a single creature). Pure — appends to
 * pendingTriggers; the effect rides the normal flush → EffectProgram path (Treasure/Food/investigate/…).
 */
export function checkBatchCombatDamageTriggers(state, playerEvents) {
  const dealers = new Set((playerEvents || []).filter((e) => e.kind === "combat-damage-player" && e.amount > 0).map((e) => e.attackingPlayer));
  if (!dealers.size) return state;
  let fired = [];
  for (const pid of dealers) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageBatch", sourcePermanent: watcher, triggeringPermanent: null, triggeringContext: { batchController: pid } }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-LIFEGAIN — enqueue "Whenever you gain life" triggers (CR 119.3 lifegain event) for the player who
 * just gained life. Fired at each gainLife site (the gain-life effect atom + combat lifelink). Scans ONLY
 * `gainingPlayerId`'s trigger sources, so "you gain life" fires for the gainer alone — the descriptor uses
 * whose:"any" (life gain is turn-agnostic; the "yours"/activePlayer gate would wrongly drop off-turn gains).
 * No-op on a non-positive amount or unknown player. Pure — appends to pendingTriggers (flushed at the next
 * priority point, like the combat-damage triggers). The amount rides the context for any amount-aware effect.
 */
export function checkLifegainTriggers(state, gainingPlayerId, amount = 0) {
  if (!gainingPlayerId || !(amount > 0) || !state.players?.[gainingPlayerId]) return state;
  let fired = [];
  for (const perm of triggerSourcesOf(state, gainingPlayerId)) {
    fired = fired.concat(triggersForEvent(state, { event: "lifegain", sourcePermanent: perm, triggeringContext: { gainingPlayerId, amount } }));
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-DRAW / TRIG-DRAW2 — enqueue card-draw triggers for the player who just drew. Fired at each draw
 * site (the turn-based draw-step draw + the spell/EFFECT_PROGRAM draw atom) with `count` = cards ACTUALLY
 * drawn (the caller passes the real delta, so a deck-out draw of fewer fires fewer). Two events:
 *  - "cardDrawn" ("Whenever you draw a card"): each card is a SEPARATE draw (CR 121.2 — "drawn one at a
 *    time"), so a batch of N fires N times (e.g. Lorescale Coatl gets N counters) — triggersForEvent is
 *    re-called per card so each pending trigger is a distinct object.
 *  - "drawSecond" ("…your second card each turn"): fires ONCE iff this batch crossed the 2nd draw of the
 *    turn. cardsDrawnThisTurn was already incremented by drawCards (reset for ALL seats at untap via
 *    resetCardsDrawnAllPlayers), so the batch covered (drawnAfter-count, drawnAfter]; the 2nd card is in it
 *    when drawnAfter-count < 2 <= drawnAfter.
 * Scans ONLY the drawing player's sources (whose:"any"; drawing is turn-agnostic, like lifegain — the
 * "yours"/activePlayer gate would drop off-turn draws). Pure — appends to pendingTriggers.
 */
export function checkCardDrawnTriggers(state, drawingPlayerId, count = 1) {
  if (!drawingPlayerId || !(count > 0) || !state.players?.[drawingPlayerId]) return state;
  const drawnAfter = state.players[drawingPlayerId].cardsDrawnThisTurn;
  const crossedSecond = (drawnAfter - count) < 2 && drawnAfter >= 2; // the 2nd draw of the turn was in this batch
  let fired = [];
  for (const perm of triggerSourcesOf(state, drawingPlayerId)) {
    for (let i = 0; i < count; i++) {
      fired = fired.concat(triggersForEvent(state, { event: "cardDrawn", sourcePermanent: perm, triggeringContext: { drawingPlayerId } }));
    }
    if (crossedSecond) {
      fired = fired.concat(triggersForEvent(state, { event: "drawSecond", sourcePermanent: perm, triggeringContext: { drawingPlayerId } }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-SACRIFICE — does the sacrificed permanent match this "Whenever you sacrifice a <subject>" descriptor?
 * EXACT type-predicate (the sac'd thing is always the controller's own, so there's no controller scope to
 * check). `sacrificed` is a lookBack { id, controller, card } captured BEFORE the permanent left the
 * battlefield (so card.type is readable). "another" excludes the source permanent itself.
 */
function sacScopeMatches(d, watcher, sacrificed) {
  if (d.sacAnother && sacrificed.id === watcher.id) return false;
  switch (d.sacScope) {
    case "permanent": return true;
    case "creature": return isCreaturePerm(sacrificed);
    case "artifact": return /\bArtifact\b/.test(String(sacrificed.card?.type || sacrificed.card?.type_line || ""));
    default: return false;
  }
}

/**
 * TRIG-SACRIFICE — enqueue "Whenever you sacrifice a <permanent|creature|artifact>" triggers for the player
 * who just sacrificed. Fired at each sacrifice chokepoint (the effect/edict sac + the cost sac), AFTER the
 * permanent has moved to the graveyard, with the captured permanent passed as `sacrificed` (a lookBack so
 * its type is readable post-move). Scans the SACRIFICING player's surviving watchers — the common case is a
 * separate watcher ("Whenever you sacrifice another permanent, …" on a DIFFERENT permanent); a permanent's
 * trigger on its OWN sacrifice is a SAFE false-negative (it already left → not a watcher). Each watcher's
 * sacScope is matched EXACTLY against the sacrificed permanent's type (so creature-scope never fires on an
 * artifact sac, and vice-versa). whose:"any" is moot (only the sacrificer's sources are scanned). Pure.
 */
export function checkSacrificeTriggers(state, sacrificingPlayerId, sacrificed) {
  if (!sacrificed?.card || !state.players?.[sacrificingPlayerId]) return state;
  let fired = [];
  for (const watcher of triggerSourcesOf(state, sacrificingPlayerId)) {
    for (const d of detectTriggers(watcher.card).filter((x) => x.event === "sacrifice")) {
      if (!sacScopeMatches(d, watcher, sacrificed)) continue;
      fired.push(makePendingTrigger(d, watcher, sacrificed, {}));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/** The cast spell's mana value: prefer a numeric cmc/mana_value, else 0 (a missing cost can't pass a >=N gate). */
function spellManaValue(spellCard) {
  if (typeof spellCard?.cmc === "number") return spellCard.cmc;
  if (typeof spellCard?.mana_value === "number") return spellCard.mana_value;
  return 0;
}

/** MILL-ON-EVENT — front-face type line (CR 712.4a / 712.8a). A card in the library has ONLY its front-face
 * characteristics, so an MDFC whose BACK is a land (Malakir Rebirth // Malakir Mire) is a NONLAND when milled.
 * Mirrors gameState.frontFaceTypeLine (kept local so triggers.js stays a leaf — no gameState type import). */
function frontFaceType(card) {
  const faces = card?.card_faces;
  const raw = Array.isArray(faces) && faces.length > 0
    ? String(faces[0]?.type_line || faces[0]?.type || "")
    : String(card?.type || card?.type_line || "");
  return raw.split("//")[0];
}
function isNonlandCard(card) {
  return !/\bLand\b/.test(frontFaceType(card));
}

/**
 * MILL-ON-EVENT (Wave 3b, CR 701.13a) — enqueue "milled" triggers for ONE player-mill event. `milledCards`
 * is the ordered batch of card objects that just moved from `milledByPlayer`'s library to their graveyard
 * (captured by the caller — the mill effect atom or the inherent radiation ability — BEFORE/at the mill so
 * the front-face type is readable). Fires every battlefield/emblem watcher of EVERY player, because the
 * corpus triggers watch mills globally ("one or more nonland cards are milled" / "a player mills …"):
 *   - BATCH descriptors (perCard:false) fire ONCE for this event when ≥1 matching card was milled (CR
 *     701.13a — milling is a single event; the count rides the context for an amount-aware payoff).
 *   - PER-CARD descriptors (perCard:true) fire ONCE PER matching card milled (each milled card is its own
 *     object — Glowing One's "you gain 1 life" per nonland is N separate triggers).
 * `milledFilter:"nonland"` counts only nonland cards (front-face); null counts all. The `whose:"opponent"`
 * gate (Infesting Radroach) requires the MILLING player to be an opponent of the watcher's controller.
 * Pure — appends to pendingTriggers; the effect rides the normal flush → buildTriggerStack path, so a
 * payoff that can't parse HIGH (a "once each turn"/scaling/conditional rider) routes the WHOLE trigger to
 * the Arbiter no-op, never a partial (CLAUDE.md §1.2). No-op on an empty/missing mill (a clean library no-op).
 */
export function checkMilledTriggers(state, { milledByPlayer, milledCards } = {}) {
  const cards = Array.isArray(milledCards) ? milledCards : [];
  if (!milledByPlayer || !state.players?.[milledByPlayer] || cards.length === 0) return state;
  const nonlandCount = cards.filter(isNonlandCard).length;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "milled")) {
        // whose:"opponent" — the MILLING player must be an opponent of this watcher's controller.
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(milledByPlayer)) continue;
        // The filtered count this trigger cares about: nonland-only or every milled card.
        const matchCount = d.milledFilter === "nonland" ? nonlandCount : cards.length;
        if (matchCount === 0) continue; // no matching card milled → this descriptor doesn't fire
        const context = { milledByPlayer, milledCount: cards.length, nonlandMilledCount: nonlandCount };
        // PER-CARD fires once per matching card (CR 701.13a — each milled card is a distinct object); BATCH
        // fires exactly once for the whole event. makePendingTrigger is re-called so each is a distinct object.
        const times = d.perCard ? matchCount : 1;
        for (let i = 0; i < times; i++) fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/** Does the cast spell match a cast trigger's modeled spell-type filter? */
function spellMatchesFilter(filter, spellCard) {
  const t = typeStr(spellCard);
  // CAST-SUBTYPE — "subtype:Name" → the cast spell's type line carries that subtype (word-bounded so
  // "Elf" doesn't match "Elfin…"; type lines are space/em-dash delimited so a bare \b is exact enough).
  if (typeof filter === "string" && filter.startsWith("subtype:")) {
    const sub = filter.slice(8);
    return new RegExp(`\\b${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);
  }
  // PARAMETERIZED object filters: typed-list (ANY listed type/subtype on the line, CR 205.2), the X-spell
  // printed-cost test (CR 107.3), and the mana-value threshold (CR 202.3).
  if (filter && typeof filter === "object") {
    switch (filter.kind) {
      case "typed":
        return filter.words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
      case "hasX":
        return /\{x\}/i.test(String(spellCard?.mana ?? spellCard?.mana_cost ?? ""));
      case "manaValue": {
        const mv = spellManaValue(spellCard);
        return filter.op === "gte" ? mv >= filter.value : mv <= filter.value;
      }
      default: return false;
    }
  }
  switch (filter) {
    case "any": return true;
    case "instantSorcery": return /Instant|Sorcery/.test(t);
    case "creature": return /Creature/.test(t);
    case "noncreature": return !/Creature/.test(t);
    case "artifact": return /Artifact/.test(t);
    case "enchantment": return /Enchantment/.test(t);
    default: return false;
  }
}

// The canonical Prowess ability (CR 702.108) as a descriptor — built once from the reminder text so the
// runtime prowess trigger rides the EXACT detectTriggers -> makePendingTrigger -> buildTriggerStack ->
// self-pump (#238) path, with NO change to detectTriggers (which would churn the trigger-counting
// coverage classifiers — a "Prowess + ETB" creature's detected-vs-shaped count would mismatch).
let _prowessDescriptor;
function prowessDescriptor() {
  if (!_prowessDescriptor) {
    _prowessDescriptor = detectTriggers({ oracle: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn." }).find((d) => d.event === "cast");
  }
  return _prowessDescriptor;
}

/**
 * Enqueue cast-spell triggers (CR 603.2) when `spellCard` is cast by `casterId`. Scans
 * every battlefield permanent for a "Whenever … casts a … spell" watcher whose `whose`
 * (you / opponent / any caster) and `spellFilter` (the modeled types) match this cast,
 * and enqueues it. The trigger then rides the normal flush → stack path, so it inherits
 * the EffectProgram routing (an unmodeled effect like "untap this" stays a no-op, never
 * fabricated). Context carries the cast spell's name + type for future referential
 * effects. Pure — appends to pendingTriggers and returns new state.
 */
export function checkCastTriggers(state, { spellCard, casterId, targets = [] }) {
  if (!spellCard) return state;
  const context = { castSpellName: spellCard?.name, castSpellType: typeStr(spellCard) };
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      const descriptors = detectTriggers(watcher.card).filter(d => d.event === "cast");
      for (const d of descriptors) {
        if (d.whose === "you" && casterId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(casterId)) continue;
        if (!spellMatchesFilter(d.spellFilter, spellCard)) continue;
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  // HEROIC (CR 702.35): for each targeted battlefield permanent that the CASTER controls,
  // fire any heroic triggers on that permanent. Targets are the cast-time chosen targets
  // threaded from applyCastSpell; scope:"self" + whose:"you" — only fires when the caster
  // controls the targeted permanent (self-targeting spells like "target creature you control
  // gets +2/+2" are the primary heroic enablers).
  for (const target of targets) {
    if (!target?.id) continue;
    let targetPerm = null;
    for (const pid of Object.keys(state.players)) {
      targetPerm = (state.players[pid]?.battlefield || []).find(p => p.id === target.id);
      if (targetPerm) break;
    }
    if (!targetPerm || targetPerm.controller !== casterId) continue;
    for (const d of detectTriggers(targetPerm.card).filter(x => x.event === "heroic")) {
      fired.push(makePendingTrigger(d, targetPerm, null, context));
    }
  }
  // ===== TRIG-PROWESS (CR 702.108) ===== Prowess is a printed keyword = "Whenever you cast a noncreature
  // spell, this creature gets +1/+1 until end of turn." detectTriggers can't see it (no When/Whenever
  // text), so fire it here for each of the CASTER's prowess creatures on a noncreature cast, via the same
  // descriptor -> the identical flush -> #238 self-pump path. Printed-keyword detection mirrors how
  // coverage classifies prowess (granted prowess isn't modeled anywhere — a consistent, honest scope).
  if (spellMatchesFilter("noncreature", spellCard)) {
    for (const perm of state.players[casterId]?.battlefield || []) {
      if (isCreaturePerm(perm) && hasKeyword(perm.card, "Prowess")) {
        fired.push(makePendingTrigger(prowessDescriptor(), perm, null, context));
      }
    }
  }
  // TRIG-CAST2 (CR 601): "Whenever you cast your second spell each turn." recordSpellCast (applyCastSpell)
  // just incremented the caster's count BEFORE this call, and spells are cast one at a time, so it equals
  // exactly 2 on the 2nd cast of the turn (reset for all seats at untap → fires again next turn). Fires for
  // the CASTER's own watchers only (scope "you"), so no whose gate is needed — never on an opponent's cast.
  const castCount = state.players[casterId]?.spellsCastThisTurn;
  if (castCount === 2) {
    for (const watcher of triggerSourcesOf(state, casterId)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "castSecond")) {
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  // TRIG-CASTNTH (CR 601): "Whenever (you|an opponent) casts (your|their) <Nth> spell each turn." The count
  // just incremented in applyCastSpell is the CASTER's running total, so it equals descriptor.nth EXACTLY
  // ONCE this turn (the off-by-one trap: the count is already post-increment, so an Nth trigger compares ===
  // nth, NOT > nth-1 — a single fire on the Nth cast). A "you" watcher fires only when its controller IS the
  // caster; an "opponent" watcher fires only when the caster is one of the watcher's opponents (so each
  // opponent's Mind's Dilation fires once on that opponent's Nth cast). Scanned across ALL seats so opponent
  // watchers see the cast. The PAYOFF still must parse HIGH at flush to fire natively.
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "castNth")) {
        if (castCount !== d.nth) continue;
        if (d.whose === "you" && casterId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(casterId)) continue;
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// ─── Intervening-if (CR 603.4) ──────────────────────────────────────────────────

/**
 * Evaluate a trigger's intervening-if. Phase-1 recognizes a small condition
 * vocabulary; unknown conditions FAIL OPEN (return true) so we never fabricate a
 * "doesn't fire" outcome.
 */
export function checkInterveningIf(state, pendingTrigger) {
  const cond = pendingTrigger?.descriptor?.interveningIf;
  if (!cond) return true;
  const c = String(cond).toLowerCase();
  const player = state.players?.[pendingTrigger.controller];
  let m = c.match(/you have (\d+) or more life/);
  if (m) return (player?.life || 0) >= parseInt(m[1], 10);
  m = c.match(/you have (\d+) or (fewer|less) life/);
  if (m) return (player?.life || 0) <= parseInt(m[1], 10);
  m = c.match(/you control (\d+) or more (\w+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const re = new RegExp(m[2], "i");
    const count = (player?.battlefield || []).filter(p => re.test(typeStr(p.card))).length;
    return count >= n;
  }
  return true; // unknown → fail-open
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Apply a Phase-1 TriggerEffect on resolution. Returns new state. Mirrors
 * spellEffects.resolveSpellEffect's structure (gain/lose life, draw,
 * damage-to-each-opponent). Targeted damage triggers are Phase-2 and resolve as
 * an honest "unresolved" log, never fabricated.
 */
export function applyTriggerEffect(state, { effect, controller, targets = [], sourcePermanentId = null }) {
  // `context` (the look-back snapshot) is accepted by callers but unused by the
  // Phase-1 effect vocabulary; targeted/contextual effects in Phase 2 will read it.
  if (!effect) return state; // fail-safe: unrecognized → no-op
  const amt = Math.max(0, effect.amount || 0);
  let next = state;
  // DAMAGE-REPLACEMENT (CR 614, MUST-FIX 3): a triggered DAMAGE effect's source is the ability's own permanent
  // (`sourcePermanentId`, threaded by the resolver). Finalize the per-opponent amount through the consult,
  // source-scoped. Gated on the board carrying a replacement so a non-Wolverine eachOpponent trigger is
  // byte-identical (consult returns the raw amount → the same loseLife with the same number). This is the ONLY
  // damage path here; "loseLife"/"gainLife" are life CHANGES, not damage, and never consult (guard 4).
  const dmgConsult = (raw, targetId) => {
    if (raw <= 0 || !boardHasDamageReplacement(next)) return raw;
    const src = sourcePermanentId ? findPermanent(next, sourcePermanentId) : null;
    return consultDamageAmount(next, {
      sourceId: sourcePermanentId,
      sourceController: src?.controller ?? controller,
      amount: raw, targetKind: "player", targetId, isCombat: false,
    });
  };
  switch (effect.kind) {
    case "gainLife":
      if (next.players[controller]) next = gainLife(next, { playerId: controller, amount: amt });
      return logEvent(next, { kind: "trigger-effect", effect: "gainLife", controller, amount: amt });
    case "loseLife":
      if (effect.who === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: amt });
      } else if (next.players[controller]) {
        next = loseLife(next, { playerId: controller, amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect", effect: "loseLife", controller, who: effect.who, amount: amt });
    case "draw":
      if (next.players[controller]) next = drawCards(next, { playerId: controller, count: Math.max(0, effect.amount || 1) });
      return logEvent(next, { kind: "trigger-effect", effect: "draw", controller, amount: effect.amount });
    case "damage":
      if (effect.targetType === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) {
          if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: dmgConsult(amt, opp) });
        }
        return logEvent(next, { kind: "trigger-effect", effect: "damage", controller, targetType: "eachOpponent", amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect, targets });
    default:
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect });
  }
}

// ─── PHASE-TRIGGER-FRAMEWORK (Wave 1) registration ──────────────────────────────
// Register the phase/step detector for the four step-kinds the inline classifyCondition doesn't cover
// (combat-on-your-turn, each-combat, first-main-phase, each-opponent's-upkeep). Done HERE — at the
// BOTTOM of triggers.js, after registerTriggerDetector + _triggerDetectors are defined — so it has
// GLOBAL visibility: every importer of triggers.js (runtime AND the coverage metric) sees the detector.
// The import is hoisted; triggerScheduler.js defines only pure functions (no top-level register call)
// and references opponentsOf only at call-time, so this import is load-safe (no TDZ cycle). The module
// must NOT also self-register — registering both here and there would push the detector twice.
import { detectPhaseTrigger } from "./triggerScheduler.js";
registerTriggerDetector(detectPhaseTrigger);
