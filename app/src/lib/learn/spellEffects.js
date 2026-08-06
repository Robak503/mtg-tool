/**
 * spellEffects.js — bounded oracle-text spell effects for the learn engine.
 *
 * Instants and sorceries used to resolve as a no-op (only permanents did
 * anything). This parses the COMMON single-effect patterns and resolves them,
 * so removal/burn/draw actually work:
 *   - damage  — "deals N damage to <target | any target | each opponent | each creature>"
 *   - destroy — "destroy target creature"
 *   - draw    — "draw N cards" (controller)
 *
 * Targeting reuses the engine's action-expansion pattern (one cast-spell action
 * per legal target, like multi-defender combat). Anything we don't recognize
 * falls back to the existing no-op-with-log resolver — honest and bounded, not
 * a general rules engine. Pump / counters / "until end of turn" / modal /
 * conditional effects are deferred.
 *
 * Pure: every function returns data or a new state; no mutation, no fetch.
 */

import {
  loseLife,
  drawCards,
  moveCardToZone,
  findPermanent,
  markCombatDamage,
  markExileIfDies,
  destroyLethalCreatures,
  logEvent,
  opponentsOf,
  creaturePower,
  creatureBasePower,
  creatureToughness,
  isIndestructible,
  regeneratePermanent,
  hasShieldCounter,
  consumeShieldCounter,
  consumePreventionShields,
  totemArmorAuraFor,
  applyTotemArmor,
  adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers,
  isPlaneswalker,
  addCounter,
  removeCounter,
  addRadCounters,
  addPoison,
} from "./gameState.js";
import { checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkCardDrawnTriggers, checkDealtDamageTriggers, checkDealtByTriggers } from "./triggers.js";
import { uncounterableSubtypesOnBattlefield, uncounterablePlayersOnBattlefield, uncounterableCoversSpell } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentProtectionColors, permanentIsCreature, playerHasHexproof } from "./layers.js"; // permanentColors moved out with creatureSatisfiesRestrictions (2026-07-30); playerHasHexproof = CR 702.11d, read at the target-enumeration seam
import { protectionApplies } from "./protection.js";
import { isNonChosenTargetType } from "./targetTypes.js";
import { boardHasDamageReplacement, consultDamageAmount } from "./damageReplacements.js";
import { selfDamagePrevention, attachedDamagePrevention, counterShieldPrevention } from "./combatEvasion.js"; // FOG-1/AP-1 — the printed self + attached prevent-all walls (leaf-safe: combatEvasion never imports this module)
import { armDamageToCreatureFlag } from "./wolverine.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js"; // the shared 16-kind restriction satisfier (leaf) — also read by effects/atoms/shared.massCreatureTargets
import { TARGET_SUBTYPES } from "./effects/parseHelpers.js"; // SUBTYPE-TARGET — curated creature-subtype allowlist (leaf, cycle-safe)

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreature(card) {
  return typeOf(card).includes("Creature");
}

// ===== REG-1 graveyard-recursion filter ===== the card-type filter on "Return target <X> card from your
// graveyard to your hand". Mirrors the tutor-filter allowlist discipline: a filter built only from these
// basic card types (a single type, an " or "-joined union, or "permanent") is modeled by literal
// front-face type-line containment; ANY other word (a creature subtype "goblin", a color "green", a
// negation "nonland", an intersection "artifact creature", "historic"/"arcane") makes the filter
// unmodeled → the recursion stays LOW → Arbiter, so we never silently mis-match a graveyard filter.
const GY_FILTER_TYPES = new Set(["creature", "artifact", "enchantment", "land", "planeswalker", "battle", "instant", "sorcery"]);
const GY_TYPE_WORD = { creature: "Creature", artifact: "Artifact", enchantment: "Enchantment", land: "Land", planeswalker: "Planeswalker", battle: "Battle", instant: "Instant", sorcery: "Sorcery" };

/**
 * Parse a graveyard-recursion filter phrase (the words between "target" and "card") into a canonical
 * cardFilter token, or null if unmodeled. "" → "any" (no filter); "permanent" → "permanent" (any
 * permanent-type card); a single type or an " or "-joined union of basic types → the sorted, pipe-joined
 * union ("instant or sorcery" → "instant|sorcery", "artifact or creature" → "artifact|creature"). Null for
 * any non-type word (subtype / color / negation / intersection), keeping the all-or-nothing gate.
 */
export function parseGraveyardFilter(phrase) {
  const p = String(phrase || "").trim().toLowerCase();
  if (p === "") return "any";
  if (p === "permanent") return "permanent";
  const parts = p.split(/\s+or\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (const w of parts) if (!GY_FILTER_TYPES.has(w)) return null;
  return [...new Set(parts)].sort().join("|");
}

/**
 * Does a graveyard card match a parseGraveyardFilter cardFilter token? FRONT-FACE type only (CR 712.4a):
 * a card in the graveyard has only its front-face characteristics, but the enriched type line is the
 * combined "Front // Back" for a transform-DFC / MDFC / Battle / Saga — so "Westvale Abbey // Ormendahl,
 * Profane Prince" (Land // Creature) is a LAND in the graveyard and must NOT match a creature filter.
 * Mirrors the tutor (cardMatchesTutorFilter) + counter front-face discipline.
 */
// Does a front-face type line satisfy a parseGraveyardFilter STRING token? "" / "any" → no restriction;
// "permanent" → any permanent card type; a single type or a "|"-joined union → literal front-face
// containment of any member. Shared by BOTH the string-token cardFilter path and the structured
// {typeFilter, mvMax} object (BLITZ GY-1), so the two can never drift.
function matchesGyTypeToken(front, token) {
  if (!token || token === "any") return true;
  if (token === "permanent") return /\b(?:Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/.test(front);
  return token.split("|").some((tok) => GY_TYPE_WORD[tok] && front.includes(GY_TYPE_WORD[tok]));
}
export function cardMatchesGraveyardFilter(card, cardFilter) {
  if (!cardFilter || cardFilter === "any") return true;
  const front = String(card?.type || card?.type_line || "").split(" // ")[0];
  // STRUCTURED subtype+MV filter (BLITZ SS-1 — the soulshift recursion "target Spirit card with mana
  // value N or less"): front-face subtype containment (word-bounded, CR 712.4a discipline) AND the
  // card's mana value within the cap (the same `cmc ?? mana_value ?? 0` read the Despark-class MV
  // gates use — CR 202.3, an absent cost reads 0). Object filters and string tokens share this ONE
  // chokepoint, so cast-time enumeration and the trigger-flush chooser can't drift.
  if (typeof cardFilter === "object") {
    if (cardFilter.subtype) {
      const re = new RegExp(`\\b${String(cardFilter.subtype).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (!re.test(front)) return false;
    }
    // BASE CARD-TYPE gate (BLITZ PW-1 — the reanimate-MV filter {cardType:"creature", mvMax:N}): front-face
    // type-line containment (CR 712.8a, same front-face read as the string-token branch below). An unknown
    // cardType word can never pass → the card is rejected (never a mis-scoped return; whole-or-nothing).
    if (cardFilter.cardType) {
      const word = GY_TYPE_WORD[cardFilter.cardType];
      if (!word || !front.includes(word)) return false;
    }
    // TYPE-TOKEN gate (BLITZ GY-1 — the return-to-hand MV filter {typeFilter, mvMax:N}): the SAME
    // string-token type matching the bare-recursion path uses (basic type / " or "-union / "permanent" /
    // "any"), so a wrong-type card is never returned. Shares matchesGyTypeToken with the string-token
    // branch below — no drift.
    if (cardFilter.typeFilter && !matchesGyTypeToken(front, cardFilter.typeFilter)) return false;
    if (typeof cardFilter.mvMax === "number") {
      const mv = card?.cmc ?? card?.mana_value ?? 0; // CR 202.3 — an absent cost reads MV 0
      if (mv > cardFilter.mvMax) return false;
    }
    return true;
  }
  return matchesGyTypeToken(front, cardFilter);
}

// ─── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse an instant/sorcery's oracle into an effect descriptor, or null when
 * it's a permanent (those enter the battlefield) or we don't recognize it.
 *
 *   { kind: "damage", amount, targetType: "creature"|"player"|"any"|"eachOpponent"|"eachCreature" }
 *   { kind: "destroy", targetType: "creature" }
 *   { kind: "draw", amount, targetType: null }
 */
export function parseSpellEffect(card) {
  if (!/Instant|Sorcery/.test(typeOf(card))) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!oracle) return null;

  // Damage.
  let m = oracle.match(/deals?\s+(\d+)\s+damage\s+to\s+([^.]+)/i);
  if (m) {
    const amount = parseInt(m[1], 10);
    const tgt = m[2].toLowerCase().trim();
    // Mass damage is modeled ONLY for the BARE form — "each opponent" / "each
    // creature" with no trailing qualifier. A qualifier ("each creature WITHOUT
    // flying", "each creature your opponents control", "each creature with shadow")
    // changes WHICH creatures are hit, which eachCreature would ignore (damaging
    // all). Anything qualified falls through to null → the EffectProgram rates it
    // low → Arbiter, rather than hitting the wrong set of creatures.
    if (/^each opponent('s)?$/.test(tgt)) return { kind: "damage", amount, targetType: "eachOpponent" };
    if (/^each creature$/.test(tgt)) return { kind: "damage", amount, targetType: "eachCreature" };
    // SYMBURN-1: symmetric burn — "each creature AND each player" hits every creature AND every player
    // INCLUDING the caster ("each player" ≠ "each opponent"). Bare form only — a qualifier ("…you
    // control", "and each planeswalker") doesn't match the exact anchor and falls to the each-bail below.
    if (/^each creature and each player$/.test(tgt)) return { kind: "damage", amount, targetType: "eachCreatureAndPlayer" };
    // SYMBURN-2: the PLAYERS-ONLY half — "deals N damage to each player" (Flame Rift, Slagstorm's second
    // mode, Spear Spewer, Mana Clash). SYMBURN-1 built the combined form and left this out of ITS SCOPE
    // ("each-player-only isn't modeled" — capability language, not a refusal), and the all-seat player
    // damage it needs is the SAME loop eachCreatureAndPlayer already runs, minus the creatures. Bare form
    // only; a qualifier ("each player who…", "each opponent") falls to the each-bail below.
    if (/^each player$/.test(tgt)) return { kind: "damage", amount, targetType: "eachPlayer" };
    // Any OTHER "each …" is mass damage to a subset we don't model — bail before the
    // single-target branches, so e.g. "each creature target opponent controls" can't
    // mis-match the "target opponent" → player-damage branch below.
    if (/\beach\b/.test(tgt)) return null;
    if (/any target/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    // "creature or PLAYER" → any (creature+player). PW-6: damage that can hit a planeswalker now
    // enumerates walkers too (a walker target takes the damage as loyalty removal, CR 120.3c). Order
    // matters — the "… or planeswalker" forms precede the bare "target player"/"target creature".
    if (/target creature or player\b/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    if (/target creature or planeswalker\b/.test(tgt)) return { kind: "damage", amount, targetType: "creatureOrPlaneswalker" };
    if (/target player or planeswalker\b/.test(tgt)) return { kind: "damage", amount, targetType: "playerOrPlaneswalker" };
    if (/target planeswalker\b/.test(tgt)) return { kind: "damage", amount, targetType: "planeswalker" };
    // DISCARDING-PLAYER (CR 701.9a) — "this enchantment deals 2 damage to the discarding player" (Megrim).
    // "the discarding player" is the SENTINEL detectTriggers rewrites "that player" to on the `discarded`
    // event, so a spell's anaphoric "that player" never reaches this branch. NOT a chosen target: the
    // recipient is ctx.discardingPlayerId, synthesized in the deal-damage resolver exactly like the
    // defendingPlayer / damagedPlayer referents. Placed BEFORE the generic target-player branch — it does
    // not contain the word "target", so order is not load-bearing here, but keeping the referent forms
    // together with their siblings is.
    if (/^the discarding player$/.test(tgt)) return { kind: "damage", amount, targetType: "discardingPlayer" };
    if (/target (player|opponent)/.test(tgt)) return { kind: "damage", amount, targetType: "player" };
    if (/target[^,]*creature/.test(tgt)) return { kind: "damage", amount, targetType: "creature" };
    return null; // unrecognized damage target
  }

  // Destroy target creature (other destroy targets deferred). A "creature or <type>" UNION (Mortify,
  // Wrecking Ball) is NOT a pure creature target — exclude it so the EffectProgram's union atom
  // (parseExtendedAtom → creatureOr…) handles it via expandCastChoices and BOTH halves are offered;
  // matching it here would make the legacy single-target path enumerate creatures only (β-2). A pure
  // creature target — incl. β-1 restrictions ("nonblack creature", "attacking creature") — still matches.
  m = oracle.match(/destroy\s+target\s+([^.]+)/i);
  if (m && /creature/.test(m[1].toLowerCase()) && !/\bcreature or\b|\bor creature\b/.test(m[1].toLowerCase())) {
    // MTG-001 — carry the "can't be regenerated" rider (Terminate, Rend Flesh) so resolution ignores
    // regeneration shields. Matches the wrapper's CANT_REGEN_TEST subjects (it/that creature/they/those).
    // Added only when present so a no-rider destroy keeps its prior `{kind,targetType}` shape (pinned tests).
    const cannotRegenerate = /\b(?:they|it|that creature|those creatures) can'?t be regenerated\b/i.test(oracle);
    return cannotRegenerate
      ? { kind: "destroy", targetType: "creature", cannotRegenerate: true }
      : { kind: "destroy", targetType: "creature" };
  }

  // Draw N cards (controller). "draws" (someone else) intentionally doesn't match.
  m = oracle.match(/\bdraw\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const amount = NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
    return { kind: "draw", amount, targetType: null };
  }

  // Pump: "target creature gets +X/+Y until end of turn" (Giant Growth family).
  // Anchored to the whole clause so a rider/restriction variant doesn't match here;
  // the EffectProgram clean-clause gate is the second line of defense. Resolution
  // is the P2.3 `pump` atom (a CR 613.4c layer-7c effect).
  // GUARD (TWO-TARGET PUMP/DEBUFF) — a "…gets +X/+Y … Another target creature gets -A/-B …" (Leeching Bite /
  // Consume Strength / Schismotivate) is a pump-pair, NOT a legacy single-target pump: the unanchored regex below
  // would otherwise grab the FIRST sentence, mark effectNeedsTarget=true, and force the LEGACY single-target
  // enumeration — which binds ONE untagged creature and half-resolves (applyPumpPair applies only the +buff,
  // dropping the -debuff, and can BUFF AN ENEMY — a false-positive). Returning null here (mirroring how
  // fight-pair's non-matching text defers) lets legalChoices' isExtendedTargeted route it through
  // expandCastChoices so BOTH the fighter/buff and target/debuff roles are enumerated + bound.
  if (!/another target creature gets [+-]\d+\/[+-]\d+ until end of turn/i.test(oracle)) {
    m = oracle.match(/target creature gets ([+-]\d+)\/([+-]\d+)\s+until end of turn/i);
    if (m) {
      return { kind: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, duration: "endOfTurn" };
    }
  }

  return null;
}

/** Does this effect need the caster to choose a target? */
export function effectNeedsTarget(effect) {
  return !!effect && !!effect.targetType && !isNonChosenTargetType(effect.targetType);
}

// ─── Target restrictions (P2.4) ───────────────────────────────────────────────

/**
 * Parse the MODELED restrictions on a "target creature" spec and report whether
 * the spec is fully accounted for. Returns `{ restrictions, clean }`.
 *
 * Modeled set (conservative): controller (you/opponent), tapped/untapped, and
 * power (<= / >=). `clean` is an ALLOWLIST check — true ONLY when the whole
 * creature-target text reduces to the base noun + filler + the modeled
 * restrictions. ANY leftover qualifier (a color like "nonblack", a type like
 * "artifact", "attacking", "named", "with flying", "with mana value", …) makes it
 * false, so the confidence gate routes the spell to the Arbiter rather than
 * targeting wrongly. An allowlist (the match must SPAN the spec) is what the P2.2
 * review proved necessary — a denylist of markers always has holes.
 *
 * Only meaningful for destroy / deal-damage creature targets (its regex matches
 * only those); for anything else (pump, draw, "any" target) it returns clean.
 */
const MODELED_RESTRICTION_RES = [
  /\b(?:an opponent controls|you don't control|a player other than you controls)\b/g,
  /\byou control\b/g,
  // ⭐⭐ DD-1 — LOAD-BEARING, and it took three wrong answers to establish that. Delete this line and Fatal
  // Blow drops native-spell → arbiter-spell: the phrase survives into `cleanedOracle`, and parser.js's fold
  // re-checks `isCleanClause(cleanedOracle)` after the restriction parse returns, where UNMODELED_MARKERS
  // names `that (?:…|was|…)`. Verified by DELETING THE LINE AND PRINTING IT BACK, not by grep.
  // ⚠️ IT WAS TWICE MEASURED AS DEAD, BOTH TIMES FALSELY: a perl mutation silently failed to apply while
  // `grep -c` on a pattern full of regex metacharacters (`|`, `(`, `?`) reported it removed. On that false
  // negative it was "confirmed" dead by a corpus-wide flip-diff showing 0 of 34,245 changed — a
  // measurement of nothing, run against an unmutated file. ⛔ A MUTATION IS NOT APPLIED UNTIL THE CHANGED
  // LINE HAS BEEN PRINTED. grep answering "0 occurrences" proves the pattern didn't match, not that the
  // edit landed.
  /\bthat (?:was|were) dealt damage this turn\b/g,  // DD-1
  /\buntapped\b/g,
  /\btapped\b/g,
  /\bpower \d+ or less\b/g,
  /\bpower \d+ or (?:greater|more)\b/g,
  /\btoughness \d+ or less\b/g,
  /\btoughness \d+ or (?:greater|more)\b/g,
  /\battacking or blocking\b/g,         // β-1 (order before the singles so the phrase is removed whole)
  /\battacking\b/g,
  /\bblocking\b/g,
  /\bnon(?:white|blue|black|red|green)\b/g,
  /\bnon(?:artifact|enchantment|land)\b/g,
  /\bwith flying\b/g,                    // β — anti-flyer removal ("destroy/deal N damage to target creature with flying")
  /\bwithout flying\b/g,
];

/**
 * ⭐⭐ `allowPlaneswalkerUnion` (UP-1, 2026-08-06) — OPT-IN, and opt-in is the whole safety argument.
 *
 * A UNION target ("target creature or planeswalker an opponent controls") skips parser.js's damage/destroy
 * fold entirely, because that fold is gated on `targetType === "creature"`. It then falls through to
 * `isCleanClause(s)`, where the SCOPE PHRASE is itself in UNMODELED_MARKERS — which is why ANY scope fails
 * on a union target, `you control` exactly as much as `an opponent controls`. It was never a scope problem.
 *
 * ⛔⛔ MAKING "or planeswalker" CLEAN GLOBALLY WOULD BE THE BUG. This function is shared by destroy / exile /
 * damage AND legalChoices' legacy single-target path; swallowing the union into the noun for everyone would
 * let a union be treated as a plain CREATURE target somewhere else — offering a planeswalker where only
 * creatures are legal, or the reverse. The residue is a GUARD, not an oversight. So the union is consumed
 * ONLY when the caller has already established the union targetType and is asking for its scope.
 * Default false → all six incumbent call sites are byte-identical.
 */
export function parseCreatureTargetRestrictions(card, { allowPlaneswalkerUnion = false } = {}) {
  const oracle = String(card?.oracle || card?.oracle_text || "").toLowerCase();
  let m = oracle.match(/destroy\s+target\s+([^.]+)/);
  if (!m) m = oracle.match(/deals?\s+\d+\s+damage\s+to\s+([^.]+)/);
  // SE-1 — reuse the SAME creature-target restriction grammar for an "exile target <phrase> creature" clause.
  // The destroy/damage anchors are tried first (order preserved), so a destroy/damage clause is byte-identical;
  // this anchor only bites a pure exile clause (removal.destroyExileClauseParser delegates here). Its consumers
  // (parser.js's legacy fold at line ~967, legalChoices' legacy single-target path) only ever pass destroy/
  // deal-damage clauses, where the exile anchor can never win — so adding it is inert for every incumbent path.
  if (!m) m = oracle.match(/exile\s+target\s+([^.]+)/);
  if (!m || !/\bcreature\b/.test(m[1])) {
    // Not a creature target → nothing to model. (A "creature or player" any-target
    // never reaches here — parseSpellEffect maps it to targetType "any". A genuine
    // "creature or <type>" leaves an unmodeled "or <type>" residue below → unclean.)
    return { restrictions: [], clean: true, cleanedOracle: oracle };
  }

  let t = ` ${m[1].replace(/[.,]/g, " ")} `;
  // UP-1: consume the union noun ONLY for a caller that has already resolved the union targetType (see the
  // doc block above). `t` is the ONLY place it needs removing — see the note at the `cleanedOracle` build
  // for why the second gate never cared about it, and for the mutation that proved it.
  if (allowPlaneswalkerUnion) t = t.replace(/\bor planeswalkers?\b/g, " ");
  const restrictions = [];

  // ⭐⭐ DEFENDING-PLAYER SCOPE (DP-TGT, 2026-08-05 — Mage-Ring Responder, Hellkite Whelp, Heart-Piercer
  // Bow: "deals N damage to target creature DEFENDING PLAYER CONTROLS"). Checked BEFORE the opponent arm
  // because it is STRICTLY NARROWER: in multiplayer "an opponent controls" is every opponent's board,
  // while this is only the ONE seat being attacked. Matching it as the opponent scope would offer targets
  // the printed card cannot reach — the forbidden direction — so the order here is load-bearing.
  // ⭐ The evaluator already knew this restriction (creatureRestrictions.js — `who:"defendingPlayer"` reads
  // ctx.defenderId and fails closed when it is unset); only this parser could not emit it. The permanent
  // lane (removal.js's control-scope group) has parsed the same phrase all along.
  if (/\bdefending player controls\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "defendingPlayer" });
    t = t.replace(/\bdefending player controls\b/g, " ");
  } else if (/\b(?:that player|the damaged player) controls\b/.test(t)) {
    // ⭐ THAT-PLAYER SCOPE (DT-1, 2026-08-06 — Snapping Thragg, Skirk Commando: "you may have it deal N
    // damage to target creature THAT PLAYER controls" on a combat-damage trigger). The exact twin of the
    // defending-player arm above: creatureRestrictions.js already reads `who:"damagedPlayer"` off
    // ctx.damagedPlayerId and fails closed without it, and removal.js's permanent lane has parsed this
    // same printed phrase all along — only the CREATURE lane could not emit it.
    // ⛔ ALSO STRICTLY NARROWER than "an opponent controls": it is the ONE seat just dealt combat damage,
    // not every opponent's board. Checked before the opponent arm for that reason, exactly like its twin.
    restrictions.push({ kind: "controller", who: "damagedPlayer" });
    t = t.replace(/\b(?:that player|the damaged player) controls\b/g, " ");
  } else if (/\b(?:an opponent controls|you don't control|a player other than you controls)\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "opponent" });
    t = t.replace(/\b(?:an opponent controls|you don't control|a player other than you controls)\b/g, " ");
  } else if (/\byou control\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "you" });
    t = t.replace(/\byou control\b/g, " ");
  }

  // ⭐⭐ DEALT DAMAGE THIS TURN (DD-1, 2026-08-06 — Fatal Blow, Rooftop Assassin, Vraska's Finisher and 14
  // more). The largest single-cause vein the residue census found: 26 carriers, 18 of which park on this
  // phrase ALONE. The state it needs already exists and is already CR-correct, which is why this is a
  // restriction and not a subsystem.
  // ⛔ THE SCALAR `damageMarked` IS NOT THE ANSWER ON ITS OWN, and gameState.js says so at its own
  // definition: infect/wither damage becomes -1/-1 counters and NEVER reaches damageMarked, yet it was
  // still damage DEALT — so a creature hit by an infect creature is a legal Fatal Blow target that a
  // damageMarked-only check would refuse. `damagedBy` covers exactly that case (recordDamageSource is
  // called on the infect path), and is itself incomplete in the mirror direction: it is OPTIONAL, and a
  // call site that cannot name its source records nothing. EITHER witness proves the fact, so the
  // evaluator reads BOTH. Both clear at cleanup together (clearCombatDamage, CR 514.2).
  // ⛔ "any target that was dealt damage this turn" (Needle Drop) is DELIBERATELY LEFT PARKED — that form
  // includes PLAYERS, and player damage-this-turn is not tracked. `lifeLostThisTurn` is the nearest thing
  // and gameState explicitly warns it is NOT the same fact (a drain or a pay-life cost loses life without
  // any damage being dealt), so reusing it would offer an illegal target. This regex only ever runs on a
  // creature-target spec, so the any-target form never reaches it.
  if (/\bthat (?:was|were) dealt damage this turn\b/.test(t)) {
    restrictions.push({ kind: "dealtDamageThisTurn", value: true });
    t = t.replace(/\bthat (?:was|were) dealt damage this turn\b/g, " ");
  }

  // Tapped / untapped (untapped first so "tapped" doesn't eat it).
  if (/\buntapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: false }); t = t.replace(/\buntapped\b/g, " "); }
  else if (/\btapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: true }); t = t.replace(/\btapped\b/g, " "); }

  // DISJUNCTIVE P/T BOUND (CR 208.1 / 208.2 — Warping Wail: "exile target creature with power or toughness
  // 1 or less"). Matched and stripped WHOLE and BEFORE the single-characteristic matchers below, because the
  // toughness matcher would otherwise consume "toughness 1 or less" out of the MIDDLE of the phrase and leave
  // "power or" behind as residue — which fails the cleanliness check. That is exactly why this printed form
  // parsed low while BOTH of its halves were already modeled: the two were never crossed.
  //
  // One restriction, not two: the restrictions array is AND-ed, so pushing {power} and {toughness} separately
  // would demand BOTH bounds and under-offer (Warping Wail could not hit a 3/1). The OR lives inside the kind.
  let ptm = t.match(/\bpower or toughness (\d+) or less\b/);
  if (ptm) { restrictions.push({ kind: "powerOrToughness", op: "<=", value: parseInt(ptm[1], 10) }); t = t.replace(/\bpower or toughness \d+ or less\b/g, " "); }
  ptm = t.match(/\bpower or toughness (\d+) or (?:greater|more)\b/);
  if (ptm) { restrictions.push({ kind: "powerOrToughness", op: ">=", value: parseInt(ptm[1], 10) }); t = t.replace(/\bpower or toughness \d+ or (?:greater|more)\b/g, " "); }

  // Power N or less / N or greater.
  let pm = t.match(/\bpower (\d+) or less\b/);
  if (pm) { restrictions.push({ kind: "power", op: "<=", value: parseInt(pm[1], 10) }); t = t.replace(/\bpower \d+ or less\b/g, " "); }
  pm = t.match(/\bpower (\d+) or (?:greater|more)\b/);
  if (pm) { restrictions.push({ kind: "power", op: ">=", value: parseInt(pm[1], 10) }); t = t.replace(/\bpower \d+ or (?:greater|more)\b/g, " "); }

  // Toughness N or less / N or greater (Collar the Culprit / Strangling Soot) — mirrors power; enforced
  // LAYER-AWARE by creatureSatisfiesRestrictions (creatureToughness), so a pumped/debuffed toughness counts.
  let tm = t.match(/\btoughness (\d+) or less\b/);
  if (tm) { restrictions.push({ kind: "toughness", op: "<=", value: parseInt(tm[1], 10) }); t = t.replace(/\btoughness \d+ or less\b/g, " "); }
  tm = t.match(/\btoughness (\d+) or (?:greater|more)\b/);
  if (tm) { restrictions.push({ kind: "toughness", op: ">=", value: parseInt(tm[1], 10) }); t = t.replace(/\btoughness \d+ or (?:greater|more)\b/g, " "); }

  // β-1 — combat state ("attacking" / "blocking" / "attacking or blocking"; the phrase is stripped whole
  // so its internal "or" doesn't leave a residue). The target must currently be in the named combat role.
  if (/\battacking or blocking\b/.test(t)) { restrictions.push({ kind: "combat", value: "either" }); t = t.replace(/\battacking or blocking\b/g, " "); }
  else if (/\battacking\b/.test(t)) { restrictions.push({ kind: "combat", value: "attacking" }); t = t.replace(/\battacking\b/g, " "); }
  else if (/\bblocking\b/.test(t)) { restrictions.push({ kind: "combat", value: "blocking" }); t = t.replace(/\bblocking\b/g, " "); }

  // β-1 — color negation ("nonblack/nonwhite/nonblue/nonred/nongreen creature" — Doom Blade, Ultimate
  // Price): the target's COLORS (CR 105) must NOT include that color (a colorless creature satisfies any).
  const COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  const cm = t.match(/\bnon(white|blue|black|red|green)\b/);
  if (cm) { restrictions.push({ kind: "colorNeg", color: COLOR_WORD[cm[1]] }); t = t.replace(/\bnon(?:white|blue|black|red|green)\b/g, " "); }

  // COLOR-POS (CR 105.2) — the POSITIVE mirror of colorNeg: "destroy target BLUE permanent" (Red
  // Elemental Blast), "counter target BLUE spell", "target MULTICOLORED permanent" (Null Elemental
  // Blast). Runs AFTER the colorNeg strip above, so any color word still standing here is genuinely
  // positive — "nonblue" has already been consumed and cannot be re-read as "blue".
  //
  // Before this, a bare color word survived as unstripped residue, which the cleanliness check treats
  // as unmodeled → the card parked. So this only ever converts a PARKED card into a restricted-target
  // one; it cannot loosen a target set that was already being offered. And a restriction is additive —
  // a mis-parsed color word can only REMOVE candidates from the pool (a safe FN), never admit an
  // illegal one (CREED: the forbidden direction is unreachable from here by construction).
  // ⭐⭐ CD-1 — THE DISJUNCTION IS MATCHED FIRST, AND THE ORDER IS LOAD-BEARING. "target green or white
  // creature" (Deathmark) used to fall to the single-colour match below, which took only the FIRST colour
  // word, emitted {color:"G"}, then stripped BOTH words and left a bare " or " standing. That residue is
  // what parked the card — a lucky park, because the restriction it had already built was WRONG (green
  // only). Matching the pair first is what makes the emitted restriction describe the printed card.
  // ⛔ THE "or" MUST BE CONSUMED with the colours. Leaving it behind re-parks the card, which is a safe
  // failure but silently wastes the build — so the replace covers the whole three-token phrase.
  const dcm = t.match(/\b(white|blue|black|red|green) or (white|blue|black|red|green)\b/);
  if (dcm) {
    restrictions.push({ kind: "colorAny", colors: [COLOR_WORD[dcm[1]], COLOR_WORD[dcm[2]]] });
    t = t.replace(/\b(?:white|blue|black|red|green) or (?:white|blue|black|red|green)\b/g, " ");
  }
  const pcm = t.match(/\b(white|blue|black|red|green)\b/);
  if (pcm) { restrictions.push({ kind: "color", color: COLOR_WORD[pcm[1]] }); t = t.replace(/\b(?:white|blue|black|red|green)\b/g, " "); }
  if (/\bmulticolored\b/.test(t)) { restrictions.push({ kind: "multicolored" }); t = t.replace(/\bmulticolored\b/g, " "); }

  // β-1 — type negation ("nonartifact/nonenchantment/nonland creature" — Go for the Throat): the target's
  // type line must NOT contain that card type.
  const ntm = t.match(/\bnon(artifact|enchantment|land)\b/);
  if (ntm) { restrictions.push({ kind: "typeNeg", type: ntm[1] }); t = t.replace(/\bnon(?:artifact|enchantment|land)\b/g, " "); }

  // β — keyword restriction: "creature with flying" / "creature without flying" (the anti-flyer removal
  // archetype — Pierce the Sky, Plummet, Shredding Winds). hasKeyword is enforced LAYER-AWARE by
  // creatureSatisfiesRestrictions (with → must have it; without → must not, via negate), so a GRANTED
  // flying counts. Only "flying" for now (the dominant case); any other keyword stays unmodeled → unclean.
  if (/\bwith flying\b/.test(t)) { restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: false }); t = t.replace(/\bwith flying\b/g, " "); }
  else if (/\bwithout flying\b/.test(t)) { restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: true }); t = t.replace(/\bwithout flying\b/g, " "); }

  // SUBTYPE-RESTRICTED TARGETING (CR 205.3) — "target <Subtype> creature" (Human Frailty "Destroy target
  // Human creature"; "Destroy target Goblin creature"). A CURATED creature-subtype word only (TARGET_SUBTYPES)
  // — so a color ("nongreen" is already stripped above; a bare color word isn't a subtype), a card type, or
  // any non-subtype word is NOT consumed here and survives as residue → unclean → Arbiter (FN-safe). The
  // subtype rides as a target restriction (creatureSatisfiesRestrictions kind:"subtype", a word-bound
  // front-face match), so removal offers + destroys ONLY the subtyped creatures — never an arbitrary creature
  // (THE CREED). Only ONE subtype is taken (a multi-subtype "Goblin Wizard creature" target — none in corpus —
  // would leave the second word as residue → unclean, safe). Matched here (lowercased oracle) word-bounded.
  // ⭐ NEGATED SUBTYPE (2026-07-30) — "each non-Dragon creature" (Breath Weapon), "each non-Pirate creature"
  // (Fiery Cannonade), "each non-Vampire creature" (Vampires' Vengeance). A PARITY GAP, not a new capability:
  // the mass-DESTROY path has carried `subtypeNegate` since the Crux of Fate slice ("destroy all non-Dragon
  // creatures"), and `massCreatureTargets` implements it — but this shared grammar, which the damage side
  // reads, only ever emitted the POSITIVE subtype. The same printed filter was sayable to one verb and not
  // its neighbour. Tried BEFORE the positive loop so "non-dragon" is consumed whole; the same curated
  // TARGET_SUBTYPES allowlist gates it, so a non-subtype word after "non-" stays residue → unclean → Arbiter.
  const negSub = t.match(/\bnon-?([a-z]+)\b/);
  if (negSub && TARGET_SUBTYPES.has(negSub[1])) {
    restrictions.push({ kind: "subtype", subtype: negSub[1], negate: true });
    t = t.replace(new RegExp(`\\bnon-?${negSub[1]}\\b`, "g"), " ");
  }
  for (const word of t.split(/\s+/)) {
    if (TARGET_SUBTYPES.has(word)) {
      restrictions.push({ kind: "subtype", subtype: word });
      t = t.replace(new RegExp(`\\b${word}\\b`, "g"), " ");
      break; // one subtype per target; a second subtype word stays as residue → unclean (CREED, safe)
    }
  }

  // Strip the base noun + filler; anything left is an UNMODELED qualifier → unclean.
  // ⭐ `that's` must be consumed AS ONE TOKEN (UP-1, 2026-08-06). Bare `that` matched the first four
  // letters — `\b` sits between "t" and "'" — and the `[^a-z]+` sweep then ate the apostrophe and left an
  // ORPHAN "s" standing as residue. That phantom letter parked every "target creature that's <colour>"
  // card, on the plain-creature lane as much as the union one. Fry measured it: colorAny built CORRECTLY,
  // clean=false anyway. ⛔ This does NOT loosen the gate on qualifiers — a real qualifier after the
  // contraction ("that's tapped", "that's attacking") is still left standing and still parks the card.
  // The only thing that stops surviving is a letter no printed word ever contributed.
  t = t.replace(/\b(target|a|an|another|other|each|any|creature|creatures|with|that's|that|to|the|is)\b/g, " ").replace(/[^a-z]+/g, " ").trim();

  // The oracle with the MODELED restriction phrases removed — so the confidence
  // gate (which keeps controller/tapped/power in its denylist to protect mass
  // effects like "each creature an opponent controls") can re-check the REST of
  // the clause (riders, other markers) without tripping on a restriction we model.
  let cleanedOracle = oracle;
  for (const re of MODELED_RESTRICTION_RES) cleanedOracle = cleanedOracle.replace(re, " ");
  // ⚠️ UP-1 DELIBERATELY DOES NOT STRIP THE UNION NOUN FROM `cleanedOracle`, and the reason is worth
  // keeping because a confident guess got it wrong first. The original version did strip it here, with a
  // comment claiming the fold's second gate `isCleanClause(cleanedOracle)` would otherwise refuse the
  // card. A mutation removing this line SURVIVED against all five carriers — `UNMODELED_MARKERS` never
  // names "planeswalker", so that gate was never going to reject the union noun. The only gate the union
  // was ever failing is `clean: t.length === 0` on the line below. Dead code with a persuasive comment
  // reads as load-bearing forever; it is cheaper to say why the line is absent.
  return { restrictions, clean: t.length === 0, cleanedOracle };
}

// creatureSatisfiesRestrictions MOVED 2026-07-30 to ./creatureRestrictions.js (a leaf) so the mass
// destroy/exile/bounce path in effects/atoms/shared.js can read the SAME grammar. Imported at the top.

// Hexproof / shroud targetability (CR 702.11 / 702.18), read LAYER-AWARE so a GRANTED or removed
// instance is honored (Alpha Authority hexproof, etc.). shroud = untargetable by ANYONE; hexproof =
// untargetable by the caster's OPPONENTS (the controller may still target their own). Ward is NOT here
// — it's a TAX the targeter pays (CR 702.21), not an exclusion, so modeling it as untargetable would be
// a false positive; ward stays an interim-FP until its tax/counter is modeled exactly.
export function canBeTargetedBy(state, perm, controllerOfPerm, casterId, sourceColors = []) {
  if (permanentHasKeyword(state, perm.id, "Shroud")) return false;
  if (permanentHasKeyword(state, perm.id, "Hexproof") && casterId !== controllerOfPerm) return false;
  // KW-PROTECTION (CR 702.16b): can't be targeted by a spell/ability of a color it has protection from.
  // QUALITY-based, not controller-based (unlike hexproof/ward) — a red spell can't target a creature with
  // protection from red even if cast by the creature's OWN controller. `sourceColors` is the casting
  // spell's colors (threaded from the cast-target enumeration); empty for paths not yet threaded (a safe
  // false-negative — trigger/ability targeting). Read LAYER-AWARE so protection GRANTED by an attached
  // Equipment/Aura (the Captain America Swords) is honored, not just printed protection.
  if (sourceColors.length && protectionApplies(permanentProtectionColors(state, perm.id), sourceColors)) return false;
  return true;
}

// ─── Target enumeration ───────────────────────────────────────────────────────

/**
 * Legal targets for a targeted effect, as `{ type, id, controller?, name }`.
 * Empty for non-targeted effects (draw, each-opponent, each-creature).
 *
 * P2.4: honors `effect.restrictions` (controller / tapped / power) so the player
 * and AI are only offered LEGAL creature targets — e.g. "destroy target creature
 * an opponent controls" no longer surfaces the caster's own creatures. No
 * restrictions → every creature, as before.
 */
export function enumerateTargets(state, controllerId, effect, sourceColors = [], ctx = null) {
  if (!effectNeedsTarget(effect)) return [];
  const restrictions = Array.isArray(effect.restrictions) ? effect.restrictions : [];
  const out = [];
  const addCreatures = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        // EXCLUDE-SOURCE (CR 701.41a "OTHER target creature" — Support N, BLITZ ETB-1): drop the source
        // permanent (ctx.sourceId, threaded on the ability/trigger flush) from the ANY-creature target pool, the
        // same self-exclusion the creatureYouControl branch already honors. Only add-counter/pump/damage/destroy
        // atoms that explicitly set excludeSource carry it into the spec (targeting.atomTargetSpec), and none
        // emitted targetType creature/any WITH excludeSource before this slice — so an ordinary "target creature"
        // enumeration is byte-identical. Absent ctx.sourceId simply doesn't exclude (FN-safe).
        if (effect.excludeSource && ctx?.sourceId && perm.id === ctx.sourceId) continue;
        // LAYER-AWARE creature-ness (CR 613) — a permanent that is a creature only by LAYERS (an animated
        // land, a crewed Vehicle) is a legal "target creature" right now. The printed-card check alone made
        // it UNTARGETABLE while combat happily let it attack — an invulnerable attacker, and the asymmetry
        // favours its controller, so it is not the safe direction a normal under-offer would be.
        if ((isCreature(perm.card) || permanentIsCreature(state, perm.id)) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx)) {
          out.push({ type: "creature", id: perm.id, controller: pid, owner: perm.owner || pid, name: perm.card?.name });
        }
      }
    }
  };
  const addPlayers = () => {
    for (const pid of Object.keys(state.players)) {
      if (!targetablePlayer(pid)) continue;
      out.push({ type: "player", id: pid, name: pid });
    }
  };
  // P3.1 counter: legal targets are SPELLS on the stack (kind "spell"; abilities are
  // not spells), filtered by the counter's spellFilter (any/noncreature/creature).
  // ⚠️ "Can't be countered" has NO subrule of its own — CR 701.6 (Counter) is only 701.6a/701.6b.
  // It is a continuous effect that prevents the counter action 701.6a defines. Do not go looking
  // for a 701.5e; it does not exist (this file cited it 3× until 2026-07-30).
  // An on-card uncounterable spell (CR 701.6a) is excluded — conservative: granted/
  // external "can't be countered" isn't modeled, but the on-card case is never wrong.
  // CANT-BE-COUNTERED (Root Sliver) — the subtypes whose spells a battlefield static makes uncounterable
  // ("Sliver spells can't be countered"), gathered once across every player's battlefield. A stack spell
  // whose TYPE LINE carries one of these subtypes is excluded as a counter target below. Empty in the common
  // case (no such static in play) → zero behavior change. CR 701.6a: the spell simply can't be countered.
  const uncounterableSubs = (() => {
    const cards = [];
    for (const pid of Object.keys(state.players || {})) {
      for (const perm of state.players[pid]?.battlefield || []) if (perm?.card) cards.push(perm.card);
    }
    return uncounterableSubtypesOnBattlefield(cards);
  })();
  // CANT-BE-COUNTERED — CONTROLLER scope (Chimil "Spells you control can't be countered"): the set of players
  // ALL of whose stack spells are uncounterable. Empty in the common case → zero behavior change (CR 701.6a).
  const uncounterablePlayers = uncounterablePlayersOnBattlefield(state);
  // STIFLE-CLASS (CR 701.6a) — abilities WAITING ON THE STACK are legal targets for "counter target
  // activated or triggered ability" (Stifle, Trickbind, Sublime Epiphany, Bind). They are stack objects but
  // NOT spells, which is why the counter family could never reach them.
  //
  // MANA ABILITIES ARE UNREACHABLE BY CONSTRUCTION, and that is the correct rule rather than a limitation:
  // a mana ability never uses the stack (CR 605.3a), so it is never a stack object and can never be
  // enumerated here. The printed reminder text on Stifle says exactly that.
  const addStackAbilities = (kinds) => {
    for (const obj of state.stack || []) {
      if (!kinds.has(obj.kind)) continue;
      out.push({ type: "stackAbility", id: obj.id, controller: obj.controller, name: obj.source?.name ? `${obj.source.name}'s ability` : "ability" });
    }
  };
  const addStackSpells = () => {
    for (const obj of state.stack || []) {
      if (obj.kind !== "spell") continue;
      // COPY-SPELL (Double Major, CR 707.10) — "copy" is NOT "counter": copying a spell doesn't try to counter
      // it, so the uncounterability exclusions (an on-card "can't be countered", or a Root-Sliver board static)
      // do NOT restrict a copy's legal targets. effect.copyNotCounter (set only by the copy-creature-spell atom's
      // target spec) skips those two gates. The counter path (copyNotCounter falsy) keeps them exactly as before.
      // NOT-A-COUNTER: a copy (Double Major) and an uncounterability GRANT (Vexing Shusher) both target a
      // spell without trying to counter it, so the uncounterability exclusions must not narrow THEIR legal
      // targets. Every counter atom leaves both flags undefined -> the counter path is byte-identical.
      if (!effect.copyNotCounter && !effect.grantNotCounter) {
        if (/can't be countered/i.test(String(obj.source?.oracle || obj.source?.oracle_text || ""))) continue;
        // GRANTED uncounterability (Vexing Shusher's "{R/G}: Target spell can't be countered") -- the one
        // path that cannot be re-derived from the board, so it rides the stack object as a mark set at
        // resolution. This is the gap the comment at the top of this block named for as long as it existed.
        if (obj.uncounterable) continue;
        // CANT-BE-COUNTERED (Root Sliver): a board static "<Subtype> spells can't be countered" protects any
        // stack spell whose type line carries that subtype (word-bounded, like the cost-reduction match — every
        // card's type line starts with its type, and a subtype follows the em-dash). Off-type spells unaffected.
        if (uncounterableSubs.size) {
          const typeLine = String(obj.source?.type || obj.source?.type_line || "").toLowerCase();
          let protectedSpell = false;
          for (const sub of uncounterableSubs) {
            if (new RegExp(`\\b${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(typeLine)) { protectedSpell = true; break; }
          }
          if (protectedSpell) continue;
        }
        // CANT-BE-COUNTERED (Chimil, controller scope): a spell cast by a player who controls a "spells you
        // control can't be countered" static is never a legal counter target.
        // TYPE-FILTERED (Prowling Serpopard "CREATURE spells you control can't be countered") — the
        // coverage is per spell now, not per player: reading it as per-player would protect every spell
        // the controller casts, which is Chimil rather than the Serpopard.
        if (uncounterableCoversSpell(uncounterablePlayers, obj.controller, obj.source?.type || obj.source?.type_line)) continue;
      }
      // COPY-TARGET-OWN (Double Major — "copy target creature spell YOU CONTROL"): only the controller's own
      // stack spells are legal. effect.spellController:"you" (set by the copy atom's target spec) enforces it at
      // enumeration so an opponent's spell is never offered (CR 601.2c + CREED FP-forbidden). The counter family
      // never sets it (its "target spell" is any controller), so counters are byte-identical.
      if (effect.spellController === "you" && obj.controller !== controllerId) continue;
      // `effect` rides in so CNT-MV-EXACT (Mental Misstep / Spell Snare) can require the target spell's mana
      // value EQUAL effect.exactMv at enumeration — an MV-mismatched spell is simply not offered as a target.
      if (!spellMatchesCounterFilter(obj, effect.spellFilter, effect)) continue;
      // ⭐⭐ CNT-TARGETS-WHAT (Turn Aside / Intervene / Hindering Light class) — the counter is legal ONLY
      // against a spell that is POINTING AT something matching. Every other counter filter above reads the
      // target spell's own characteristics; this one reads its CHOSEN TARGETS, which is why it needs the
      // stack object rather than just its card. Enforced here at enumeration so a non-matching spell is never
      // offered — a targeting restriction belongs at the choice, not at resolution (CR 601.2c + CREED).
      if (effect.targetsFilter && !spellTargetsMatchFilter(state, obj, effect.targetsFilter, controllerId)) continue;
      // `controller` rides for the that-player projection ("Counter target spell unless ITS
      // CONTROLLER pays {1}. THAT PLAYER discards…" — Frightful Delusion): by discard time the
      // spell may have left the stack, so the projection reads the object recorded at cast.
      out.push({ type: "spell", id: obj.id, controller: obj.controller, name: obj.source?.name });
    }
  };
  // Graveyard recursion: legal targets are CARDS in the CASTER'S OWN graveyard ("your graveyard"),
  // filtered by the atom's cardFilter (REG-1: creature / any / artifact / instant|sorcery / permanent /
  // … — see parseGraveyardFilter). The graveyard is a public zone, so this is a normal cast-time target
  // choice; cardMatchesGraveyardFilter applies the front-face (CR 712.4a) type discipline.
  const addGraveyardCards = () => {
    // Default: the CASTER'S OWN graveyard ("your graveyard" — return-from-graveyard / reanimate / GY-TO-TOP).
    // GY-EXILE / REANIMATE-FROM-ANY set effect.anyGraveyard ("a graveyard") → offer cards from EVERY player's
    // graveyard; effect.opponentGraveyard ("an opponent's graveyard" — Ashen Powder) → opponents only;
    // effect.damagedPlayerGraveyard (BLITZ SB-1 — "that player's graveyard", the Skullsnatcher / Zombie
    // Cannibal saboteur payoffs) → ONLY the just-combat-damaged player's graveyard (ctx.damagedPlayerId,
    // threaded by triggers.checkCombatDamageTriggers; absent referent — a spell / non-combat path — → EMPTY
    // pool, so the ability drops no-target rather than exile from a wrong graveyard, the
    // creatureSatisfiesRestrictions damagedPlayer discipline). Each target is stamped with its OWNER as
    // `controller` so the resolver acts on the right graveyard.
    const pids = effect.damagedPlayerGraveyard
      ? (ctx?.damagedPlayerId ? [ctx.damagedPlayerId] : [])
      : effect.anyGraveyard
        ? Object.keys(state.players)
        : effect.opponentGraveyard
          ? Object.keys(state.players).filter((pid) => pid !== controllerId)
          : [controllerId];
    for (const pid of pids) {
      for (const card of state.players[pid]?.graveyard || []) {
        if (card.token) continue; // a token is not a "card" (CR 111 / 608.2b) — never a legal target
        // ANOTHER-RETURN (CR 109.5) — "return ANOTHER target … card": the source card is never a
        // legal target for its own ability. The DANGEROUS case — the source card sitting in this
        // very graveyard — is exactly the dies-trigger, and that path always carries
        // ctx.triggeringCardId (makePendingTrigger). When the referent is ABSENT the exclusion is
        // a deliberate NO-OP, not an exclude-everything: on the ACTIVATED path (Corpse Hauler —
        // targets are chosen BEFORE the sacrifice cost is paid, CR 601.2b/601.2g) and the ETB half
        // of an enters-or-leaves trigger, the source is still ON the battlefield, and a resolving
        // spell's own card is not yet in any graveyard (CR 608.2m) — in every real path the source
        // card cannot be in this pool, so there is nothing to exclude. (A hard-exclude here was
        // caught in the flip audit: it credited Corpse Hauler while making its ability unable to
        // ever have a legal target — the runtime-invisible FP class.)
        if (effect.excludeTriggeringCard && ctx?.triggeringCardId && card.id === ctx.triggeringCardId) continue;
        if (!cardMatchesGraveyardFilter(card, effect.cardFilter)) continue;
        // MILLED-THIS-TURN restriction (Tato Farmer — "target land card in a graveyard that was milled
        // this turn"): the card must appear in the millCards ledger stamped with the CURRENT turn (stale
        // entries are inert — the reader keys on state.turn, no cleanup pass needed).
        if (effect.milledThisTurnOnly && state.milledThisTurn?.[card.id] !== state.turn) continue;
        out.push({ type: "graveyardCard", id: card.id, controller: pid, name: card?.name });
      }
    }
  };
  // δ-1b hand disruption: the target is an OPPONENT (a player), chosen at cast WITHOUT seeing their hand
  // — the faithful Duress flow (commit to the opponent, THEN reveal at resolution). We offer every
  // opponent (a SAFE subset of "target opponent"/"target player" — Thoughtseize legally allows yourself
  // but that's pointless, so opponents-only never offers an illegal or self-defeating target). The card
  // to strip is picked at RESOLUTION from THAT opponent's revealed hand (applyDiscardChosen →
  // pendingChoice), so in 4P there is no cross-opponent cherry-pick and no leak of the other hands.
  // ⭐ PLAYER HEXPROOF (CR 702.11d) is enforced HERE, at the single target-enumeration seam, and nowhere
  // else — hexproof stops TARGETING only, so damage, edicts and "each player discards" stay untouched.
  // ⛔ IT IS OPPONENT-SCOPED, NOT ABSOLUTE. "You can't be the target of spells or abilities your OPPONENTS
  // control" — a player with hexproof may still target THEMSELF (Leyline of Sanctity does not stop you
  // aiming your own effects at yourself). That is why the check is skipped when pid === controllerId.
  const targetablePlayer = (pid) => pid === controllerId || !playerHasHexproof(state, pid);
  const addOpponents = () => {
    for (const pid of Object.keys(state.players)) {
      if (pid === controllerId) continue;
      if (!targetablePlayer(pid)) continue;
      out.push({ type: "player", id: pid, name: pid });
    }
  };
  // Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "destroy target
  // permanent"). The only modeled restriction is the controller (the 3 the parser captures);
  // tapped/power aren't part of the anchored permanent shapes, so they never reach here.
  const PERMANENT_PREDICATES = {
    artifact: (tl) => /\bArtifact\b/.test(tl),
    enchantment: (tl) => /\bEnchantment\b/.test(tl),
    land: (tl) => /\bLand\b/.test(tl),
    // UNTAP-BASIC-SUBTYPE (Arbor Elf "Untap target Forest") — a land of a specific basic subtype (CR 305.6).
    // BOTH a Land type line AND the subtype are required (a non-land bearing the word can never match).
    forest: (tl) => /\bLand\b/.test(tl) && /\bForest\b/.test(tl),
    island: (tl) => /\bLand\b/.test(tl) && /\bIsland\b/.test(tl),
    swamp: (tl) => /\bLand\b/.test(tl) && /\bSwamp\b/.test(tl),
    mountain: (tl) => /\bLand\b/.test(tl) && /\bMountain\b/.test(tl),
    plains: (tl) => /\bLand\b/.test(tl) && /\bPlains\b/.test(tl),
    permanent: () => true,
    nonlandPermanent: (tl) => !/\bLand\b/.test(tl),
    // NONCREATURE-PERMANENT (Mold Shambler "destroy target noncreature permanent") — any permanent that is
    // not a Creature. addPermanents only iterates battlefield permanents, so the not-a-Creature test alone
    // is the full predicate (mirrors nonlandPermanent). An Artifact/Enchantment CREATURE (\bCreature\b) is
    // correctly excluded; a land/artifact/enchantment/planeswalker is eligible.
    noncreaturePermanent: (tl) => !/\bCreature\b/.test(tl),
    // NONBASIC-LAND (Goblin Ruinblaster / Sinkhole-type "destroy target nonbasic land") — a Land WITHOUT the
    // Basic supertype (CR 205.4a). Both a Land type line AND the absence of the Basic supertype are required,
    // so a basic land (type line "Basic Land — …") is excluded and a non-land bearing neither word never matches.
    nonbasicLand: (tl) => /\bLand\b/.test(tl) && !/\bBasic\b/.test(tl),
    // BASIC-LAND (Earthcraft "Untap target basic land") — a Land WITH the Basic supertype (CR 205.4a). Both a
    // Land type line AND the Basic supertype are required, so a nonbasic land (type line "Land — …", no "Basic")
    // is excluded and a non-land never matches. Symmetric with nonbasicLand above.
    basicLand: (tl) => /\bLand\b/.test(tl) && /\bBasic\b/.test(tl),
    artifactOrEnchantment: (tl) => /\bArtifact\b|\bEnchantment\b/.test(tl),
    // THREE-WAY union — "destroy target artifact, enchantment, or land" (Acidic Slime, Creeping Mold,
    // Reclaiming Vines, Dire-Strain Rampage, Hoodwink, World Breaker). A straight OR of the three printed
    // types, exactly as the card reads: no narrowing, and deliberately NOT mapped to "permanent", which
    // would also offer creatures and planeswalkers the card cannot touch.
    artifactEnchantmentOrLand: (tl) => /\bArtifact\b|\bEnchantment\b|\bLand\b/.test(tl),
    // NONCREATURE ARTIFACT / ENCHANTMENT (Crush, Overwhelming Surge, Haywire Mite, Joven, Guerrilla Gorilla)
    // — the qualifier EXCLUDES artifact/enchantment CREATURES, so it is a genuine narrowing of the bare
    // types above, not a synonym. Modeling it as the bare type would let the engine destroy an artifact
    // creature the printed card cannot touch: an over-delivery, the forbidden direction. That is why these
    // shapes correctly refused until now rather than being approximated.
    //
    // ⭐ LAYER-AWARE, and that is the whole point of the second argument. The printed type line alone misses
    // a permanent that is a creature only BY LAYERS — an artifact animated by March of the Machines / Karn /
    // Sydri is a CREATURE and must not be offered. (The older `noncreaturePermanent` above is printed-only;
    // it is left as-is rather than silently widened here, but the same gap applies to it.)
    noncreatureArtifact: (tl, perm) => /\bArtifact\b/.test(tl) && !/\bCreature\b/.test(tl) && !permanentIsCreature(state, perm.id),
    noncreatureEnchantment: (tl, perm) => /\bEnchantment\b/.test(tl) && !/\bCreature\b/.test(tl) && !permanentIsCreature(state, perm.id),
    noncreatureArtifactOrEnchantment: (tl, perm) => /\bArtifact\b|\bEnchantment\b/.test(tl) && !/\bCreature\b/.test(tl) && !permanentIsCreature(state, perm.id),
    creatureOrEnchantment: (tl) => /\bCreature\b|\bEnchantment\b/.test(tl), // β-2 type unions
    creatureOrLand: (tl) => /\bCreature\b|\bLand\b/.test(tl),
    creatureOrArtifact: (tl) => /\bCreature\b|\bArtifact\b/.test(tl),
    artifactOrLand: (tl) => /\bArtifact\b|\bLand\b/.test(tl),
    // ES-1 "Enchant creature or Vehicle" (Aether Meltdown, Mists of Littjara) — CR 301.7: a Vehicle is an
    // ARTIFACT that is only a creature while crewed, so this is NOT creatureOrArtifact (that would offer
    // every artifact on the board, hosts the printed card cannot touch — the forbidden direction). The
    // Vehicle arm requires BOTH the Artifact type and the Vehicle subtype, mirroring the basic-land-subtype
    // predicates above. PRINTED-only on the creature arm, consistent with its creatureOrArtifact sibling:
    // a permanent that is a creature only by LAYERS is simply not offered (a safe under-offer), and a
    // CREWED Vehicle matches the Vehicle arm regardless, so the practically-reachable pool is complete.
    creatureOrVehicle: (tl) => /\bCreature\b/.test(tl) || (/\bArtifact\b/.test(tl) && /\bVehicle\b/.test(tl)),
    // ES-2 "Enchant artifact, creature, or planeswalker" (Planar Disruption) — the triple union, read
    // exactly as printed. Deliberately NOT mapped to nonlandPermanent, which would also offer an
    // ENCHANTMENT the printed card cannot touch (the same no-narrowing/no-widening discipline as the
    // artifactEnchantmentOrLand entry above).
    artifactCreatureOrPlaneswalker: (tl) => /\bArtifact\b|\bCreature\b|\bPlaneswalker\b/.test(tl),
    enchantmentOrLand: (tl) => /\bEnchantment\b|\bLand\b/.test(tl),
  };
  const addPermanents = (pred) => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        const tl = String(perm.card?.type || perm.card?.type_line || "");
        // A double-faced permanent's CURRENT battlefield face isn't tracked (the engine has no face
        // state), so its combined "Front // Back" type line can't be trusted to pick a targetType —
        // a back-face-played MDFC (Akoum Warrior cast as the land Akoum Teeth) would mis-match. Skip
        // DFCs: they're simply not offered to native non-creature removal (a SAFE omission, never a
        // wrong target). The spell still routes to the Arbiter if a DFC is its only would-be target.
        if (tl.includes(" // ")) continue;
        // MV-FILTERED removal (Despark / Fragmentize) — a non-creature permanent target can now carry a
        // `manaValue` restriction (CR 202.3). Enforce the FULL restriction set via creatureSatisfiesRestrictions
        // (type-agnostic for the controller/manaValue/tapped kinds the permanent-removal parsers emit — it reads
        // card.cmc / tapped / controller, none creature-specific), which SUBSUMES the controllerOk check used
        // before. The power/toughness/combat/colorNeg/subtype kinds never reach here (only creature-target parsers
        // emit them), so this can't mis-handle a permanent. Without this, an MV restriction on a permanent target
        // would be silently ignored → an illegal (wrong-MV) target offered → a forbidden FP (CREED).
        // `perm` is passed as a SECOND argument so a predicate can be layer-aware (the noncreature-artifact
        // family needs the live creature-ness, not just the printed type line). Every pre-existing predicate
        // takes one parameter and ignores it, so this is inert for them.
        if (pred(tl, perm) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors)) {
          // `owner` rides the enumerated object for the same reason `controller` does (see the
          // its-controller projection note in atoms/combat.js): "…to its owner's hand. Then THAT
          // PLAYER discards" must project the OWNER after the permanent has already left the
          // battlefield. Absent stamp (never stolen/reanimated) → owner IS the controller.
          out.push({ type: "permanent", id: perm.id, controller: pid, owner: perm.owner || pid, name: perm.card?.name });
        }
      }
    }
  };
  // TRIPLE-UNION with a flying-bound creature alternative (BLITZ BW-1) — "target artifact, enchantment, or
  // creature with flying" (Broken Wings / Return to the Earth / Airship Crash destroy; Shoot Down exile).
  // The "with flying" restriction binds ONLY the CREATURE alternative, so it can't be a flat restriction on
  // the whole pool (an artifact needs no flying) and can't live in PERMANENT_PREDICATES (a pure type-line
  // predicate can't read keyword state) — hence this dedicated branch. The creature arm reads flying
  // LAYER-AWARE via permanentHasKeyword (printed ∪ keyword counter ∪ layer-6 grants — a granted flyer is a
  // legal target, a ground creature is NEVER offered, CR 601.2c + CREED FP-forbidden). Mirrors addPermanents'
  // discipline: the DFC skip (face state untracked — a combined type line can't be trusted; a SAFE omission),
  // creatureSatisfiesRestrictions (none emitted today — keeps a future scoped variant honest), and
  // canBeTargetedBy (shroud/hexproof/protection). Targets tag { type: "permanent" } regardless of which union
  // member matched — the proven creatureOrArtifact convention the destroy/exile resolvers already handle.
  const addArtifactEnchantmentOrFlyingCreature = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        const tl = String(perm.card?.type || perm.card?.type_line || "");
        if (tl.includes(" // ")) continue; // DFC — current face untracked (mirror addPermanents' safe skip)
        const artifactOrEnchantment = /\bArtifact\b|\bEnchantment\b/.test(tl);
        const flyingCreature = /\bCreature\b/.test(tl) && permanentHasKeyword(state, perm.id, "flying");
        if (!artifactOrEnchantment && !flyingCreature) continue;
        if (creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors)) {
          out.push({ type: "permanent", id: perm.id, controller: pid, owner: perm.owner || pid, name: perm.card?.name });
        }
      }
    }
  };
  // PW-6: a live planeswalker (carries a loyalty counter, PW-1 ETB) is a legal target for damage
  // (and other "any target" effects). Honors the FULL restriction set via creatureSatisfiesRestrictions
  // (subsumes the controller restriction so "… an opponent controls" never offers your own walker, AND the
  // MV-FILTERED removal manaValue restriction — Eliminate "creature or planeswalker with mana value 3 or
  // less", Despark hitting a planeswalker — reads card.cmc, type-agnostic). The creature-only kinds
  // (power/toughness/combat/colorNeg/subtype) are never emitted for a planeswalker-bearing targetType, so this
  // can't mis-handle a walker. Damage to it is removed as loyalty (applyDamageEffect, CR 120.3c).
  const addPlaneswalkers = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (perm.counters?.loyalty != null && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors)) {
          out.push({ type: "planeswalker", id: perm.id, controller: pid, owner: perm.owner || pid, name: perm.card?.name });
        }
      }
    }
  };
  if (effect.targetType === "creature") addCreatures();
  // COUNTER-TARGET-OWN — "target creature you control": only the controller's own creatures are
  // legal. Skips the full addCreatures() sweep so opponents' creatures are never offered to the
  // trigger-flush chooser (correctness gate, not just an intent hint).
  else if (effect.targetType === "creatureYouControl") {
    for (const perm of state.players[controllerId]?.battlefield || []) {
      // ANOTHER (CR 109.5) — "another target creature you control" (Benevolent Hydra) excludes the source
      // permanent itself. ctx.sourceId is threaded by the activated dispatcher; when effect.excludeSource is
      // set and this permanent IS the source, skip it so the chooser never offers the source as a target. A
      // missing ctx.sourceId simply doesn't exclude (the plain form is unaffected — excludeSource is unset).
      if (effect.excludeSource && ctx?.sourceId && perm.id === ctx.sourceId) continue;
      if (isCreature(perm.card) && canBeTargetedBy(state, perm, controllerId, controllerId, sourceColors)) {
        out.push({ type: "creature", id: perm.id, controller: controllerId, name: perm.card?.name });
      }
    }
  }
  // EQUIP-AUTO-ATTACH (WAVE 4) — "target Equipment you control" (Captain America's "Catch" auto-attach,
  // Cloud, Sokka). Only the controller's own Equipment permanents are legal; canBeTargetedBy keeps a
  // shroud/protection edge case honest. The attach-to-self atom binds this chosen equipment onto the
  // source creature (ctx.sourceId).
  else if (effect.targetType === "equipmentYouControl") {
    for (const perm of state.players[controllerId]?.battlefield || []) {
      if (/\bEquipment\b/.test(String(perm.card?.type || perm.card?.type_line || ""))
          && canBeTargetedBy(state, perm, controllerId, controllerId, sourceColors)) {
        out.push({ type: "permanent", id: perm.id, controller: controllerId, name: perm.card?.name });
      }
    }
  }
  else if (effect.targetType === "player") addPlayers();
  else if (effect.targetType === "any") { addCreatures(); addPlayers(); addPlaneswalkers(); }
  else if (effect.targetType === "creatureOrPlaneswalker") { addCreatures(); addPlaneswalkers(); }
  else if (effect.targetType === "playerOrPlaneswalker") { addPlayers(); addPlaneswalkers(); }
  else if (effect.targetType === "planeswalker") addPlaneswalkers();
  else if (effect.targetType === "spell") addStackSpells();
  else if (effect.targetType === "stackAbility") addStackAbilities(new Set(effect.abilityKinds || ["triggered-ability", "activated-ability"]));
  else if (effect.targetType === "graveyardCard") addGraveyardCards();
  else if (effect.targetType === "opponent") addOpponents();
  else if (effect.targetType === "artifactOrEnchantmentOrFlyingCreature") addArtifactEnchantmentOrFlyingCreature(); // BW-1 triple union
  else if (PERMANENT_PREDICATES[effect.targetType]) addPermanents(PERMANENT_PREDICATES[effect.targetType]);
  return out;
}

/**
 * Does a card in hand match a hand-disruption handFilter (δ-1b)? The filter is the small ALLOWLISTED
 * spec the parser built: `include` (front-face type must contain ANY listed type — "creature or
 * planeswalker"), `exclude` (must contain NONE — "noncreature, nonland"), and `maxCmc` (Inquisition's
 * "mana value 3 or less"). An empty filter ({}) matches any card (Coercion). Front-face type only
 * (CR 712.4a), mirroring the counter/tutor/graveyard discipline. A filter the parser couldn't model
 * never reaches here — the whole spell stayed low → Arbiter. Exported because the filter is now applied
 * at RESOLUTION (effectAtoms.applyDiscardChosen reveals the targeted opponent's hand and keeps only the
 * matching cards), not at cast-time enumeration.
 */
export function handCardMatches(card, hf) {
  const frontType = String(card?.type || card?.type_line || "").split(" // ")[0];
  if (Array.isArray(hf.include) && !hf.include.some((ty) => new RegExp(`\\b${ty}\\b`).test(frontType))) return false;
  if (Array.isArray(hf.exclude) && hf.exclude.some((ty) => new RegExp(`\\b${ty}\\b`).test(frontType))) return false;
  if (typeof hf.maxCmc === "number" && !((card?.cmc ?? card?.mana_value ?? 0) <= hf.maxCmc)) return false;
  return true;
}

/**
 * Does a spell on the stack match a counter's spellFilter (CR 701.6a)? `atom` carries the MV / color
 * restrictions (exactMv / minMv / maxMv / colorFilter). MIRRORS counterFilterMatches in atoms/stack.js EXACTLY
 * — the two are kept in lockstep by hand (not delegated) to avoid a spellEffects ↔ atoms/stack import cycle; any
 * filter added in one MUST be added here. spellEffects is the ENUMERATION side ("is this a legal target to
 * offer?"); counterFilterMatches is the RESOLUTION side ("does the counter still apply?").
 */
/**
 * ⭐ CNT-TARGETS-WHAT — does `stackObj` (a spell on the stack) point at something the filter accepts?
 * `casterId` is the player casting the COUNTER, so "you" / "you control" resolve to them (CR 109.5-style
 * possessive: the counter's controller, never the countered spell's).
 *
 * ⛔ CONTROL IS READ **LIVE**, not from the recorded target entry. A target's controller can change between
 * the spell being cast and the counter being cast (Act of Treason, an Aura, a Vehicle crewed by someone
 * else), and CR evaluates the counter's own targeting requirement when the counter is cast. Reading the
 * stale recorded controller would offer — or refuse — the wrong spell.
 *
 * ⛔ FAIL-CLOSED on an unresolvable target: a permanent that has already left the battlefield does not
 * satisfy anything. A dropped legal target is a safe FN; an illegal one offered is the cardinal sin.
 *
 * ⛔ TYPES ARE READ OFF THE LIVE CARD, deliberately NOT layer-aware. "Targets a creature" asks what the
 * spell is pointing at, and a target's identity was fixed when that spell was cast; a permanent animated
 * afterwards was not a creature when it became a target. The printed type line is the honest read here, and
 * it is also the conservative one.
 */
function spellTargetsMatchFilter(state, stackObj, filter, casterId) {
  const targets = stackObj?.targets || [];
  if (!targets.length) return false; // a spell pointing at nothing satisfies no "that targets" filter
  return targets.some((t) => {
    if (!t) return false;
    // PLAYER half — "targets you" / "targets a player".
    if (filter.player && t.type === "player") {
      if (filter.player === "any") return true;
      if (filter.player === "you" && t.id === casterId) return true;
    }
    // PERMANENT half.
    if (!filter.permanent) return false;
    if (t.type === "player" || t.type === "spell") return false;
    const lk = findPermanent(state, t.id);
    if (!lk) return false; // FAIL-CLOSED — already gone
    if (filter.permanent.youControl && lk.permanent.controller !== casterId) return false;
    const types = filter.permanent.types;
    if (!types) return true; // "a permanent"
    const line = String(lk.permanent.card?.type || lk.permanent.card?.type_line || "").split(" // ")[0];
    return types.some((ty) => new RegExp(`\\b${ty}\\b`, "i").test(line));
  });
}

function spellMatchesCounterFilter(stackObj, filter, atom = null) {
  const card = stackObj?.source;
  // Front-face type only — a split/MDFC spell's enriched type line is "Front // Back".
  const type = String(card?.type || card?.type_line || "").split(" // ")[0];
  const mv = card?.cmc ?? card?.mana_value ?? 0; // CR 202.3 — an absent cost reads MV 0
  // CNT-MV-EXACT (WAVE 2b — Mental Misstep / Spell Snare): equal. CNT-MV-CMP (CROSS-COUNTER — Disdainful Stroke /
  // Minor Misstep / Thoughtbind): minMv (≥) / maxMv (≤). At most one is set per atom; test each independently.
  if (atom?.exactMv != null && mv !== atom.exactMv) return false;
  if (atom?.minMv != null && !(mv >= atom.minMv)) return false;
  if (atom?.maxMv != null && !(mv <= atom.maxMv)) return false;
  // CNT-COLOR (CROSS-COUNTER — Gainsay / Frazzle / Ceremonious Rejection / Neutralizing Blast): FRONT-face colors
  // (CR 712.4a), FAIL-CLOSED when unresolvable (never offer a wrong-color counter target). Mirrors counterColorOf.
  if (atom?.colorFilter != null) {
    const cf = atom.colorFilter;
    const isDfc = / \/\/ /.test(String(card?.type || card?.type_line || ""));
    const colors = isDfc ? card?.card_faces?.[0]?.colors : card?.colors;
    if (!Array.isArray(colors)) return false;                          // FAIL-CLOSED
    if (cf.colorless && colors.length !== 0) return false;
    if (cf.multicolored && colors.length < 2) return false;
    if (cf.color && (cf.negate ? colors.includes(cf.color) : !colors.includes(cf.color))) return false;
  }
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // CNT-TYPE (CROSS-COUNTER) — single-type / 2-type-union hard counters (Dispel / Envelop / Artifact Blast /
  // Annul / Nullify). Word-bounded front-face type tests; mirrors counterFilterMatches at resolution.
  if (filter === "instant") return /\bInstant\b/.test(type);
  if (filter === "sorcery") return /\bSorcery\b/.test(type);
  if (filter === "artifact") return /\bArtifact\b/.test(type);
  if (filter === "artifactOrEnchantment") return /\b(?:Artifact|Enchantment)\b/.test(type);
  if (filter === "creatureOrAura") return /\bCreature\b/.test(type) || /\bAura\b/.test(type);
  // CNT-IS (Flusterstorm's soft-counter — "instant or sorcery spell") — mirrors counterFilterMatches.
  if (filter === "instantSorcery") return /\b(?:Instant|Sorcery)\b/.test(type);
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors counterFilterMatches at resolution).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  // CNT-ACP (WAVE 2b) — Strix Serenade's "artifact, creature, or planeswalker" union (front-face).
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type);
  return true; // "any"
}

// ─── AI target selection ──────────────────────────────────────────────────────

function powerOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creaturePower(lk.permanent, state) : 0;
}
function toughOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creatureToughness(lk.permanent, state) : 0;
}

/**
 * The AI's target pick for a damage/destroy spell. Only ever targets an enemy;
 * returns null when there's no good enemy target (so the AI won't, say, destroy
 * its own creature). Heuristics: destroy the biggest enemy creature; burn the
 * biggest enemy creature it can kill, else the lowest-life enemy player.
 *
 * Pump (kind "pump", P2.3) intentionally falls through to `return null` — the AI
 * does not yet cast combat tricks (a deliberate deferral, like attack-trap logic
 * in opponentAI). This is SAFE: the player can still cast pump normally; the AI
 * simply holds the card. A future PR can add a "pump my best attacker" heuristic.
 */
export function chooseAITarget(state, aiPlayerId, effect, targets) {
  if (!targets || targets.length === 0) return null;
  const enemies = new Set(opponentsOf(state, aiPlayerId));
  const enemyCreatures = targets.filter(t => t.type === "creature" && enemies.has(t.controller));
  const enemyPlayers = targets.filter(t => t.type === "player" && enemies.has(t.id));
  // An indestructible enemy creature can't be killed by destroy (CR 702.12b) or by lethal damage
  // (CR 704.5g) — the AI shouldn't waste removal/burn on it (the spell would fizzle / the damage
  // just wears off at cleanup). Exclude it from every creature pick; players are unaffected.
  const isIndestructibleTarget = (t) => { const lk = findPermanent(state, t.id); return !!lk && isIndestructible(lk.permanent, state); };
  const killableCreatures = enemyCreatures.filter(t => !isIndestructibleTarget(t));

  if (effect.kind === "destroy") {
    if (!killableCreatures.length) return null;
    return [...killableCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
  }
  if (effect.kind === "damage") {
    const killable = killableCreatures.filter(t => toughOf(state, t) > 0 && toughOf(state, t) <= effect.amount);
    if (killable.length) return killable.sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    if (enemyPlayers.length) return [...enemyPlayers].sort((a, b) => state.players[a.id].life - state.players[b.id].life)[0];
    if (killableCreatures.length) return [...killableCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    return null;
  }
  return null;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Per-effect resolution helpers — the single source of truth for each effect's
 * state mutation. The Phase-2 EffectProgram atoms (`effects/effectAtoms.js`)
 * call these directly — there is no second implementation to drift (W5 deleted
 * the legacy spell.effect resolver that used to share them).
 */
export function applyDrawEffect(state, { controller, amount }) {
  // `amount ?? 1` (NOT `|| 1`): a no-amount call defaults to drawing 1, but a count- or X-derived amount
  // of exactly 0 ("draw a card for each creature you control" with no creatures; "draw X cards", X=0) must
  // draw 0 — `|| 1` would fabricate a card (CR: a count-scaled draw of 0 draws nothing).
  let next = drawCards(state, { playerId: controller, count: Math.max(0, amount ?? 1) });
  // TRIG-DRAW (CR 121.2): fire "Whenever you draw a card" once per card ACTUALLY drawn (a deck-out draw of
  // fewer fires fewer — read the real delta, not the requested amount).
  const drew = next.players[controller].cardsDrawnThisTurn - state.players[controller].cardsDrawnThisTurn;
  if (drew > 0) next = checkCardDrawnTriggers(next, controller, drew);
  return logEvent(next, { kind: "spell-effect", effect: "draw", controller, amount });
}

export function applyDestroyEffect(state, { controller, targets = [], cannotRegenerate = false }) {
  let next = state;
  const dead = [];
  const deadPw = []; // PLANESWALKER-DIES (CR 700.4) — a destroyed walker also "dies"; collected for its dies-watchers
  const prevented = [];
  for (const t of targets) {
    // "creature" (the dedicated creature path / mass wipe), "permanent" (targeted non-creature
    // removal — Disenchant/Stone Rain), or "planeswalker" (PW-7 — Hero's Downfall class). Other
    // target kinds aren't destroyable here.
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(next, t.id);
    if (!lk) continue;
    // CR 702.12b — an indestructible permanent can't be destroyed. isIndestructible reads the layer
    // engine, so GRANTED indestructible (Darksteel Forge's "artifacts you control are indestructible",
    // an Equipment/Aura, an anthem) is honored, not just printed. The permanent stays put and fires
    // no dies-trigger (it never left). Exile/sacrifice/bounce are NOT destroy and never reach here.
    if (isIndestructible(lk.permanent, next)) {
      prevented.push(t.id);
      continue;
    }
    // CR 122.1c — a SHIELD COUNTER replaces this destruction: remove one shield counter (no tap), the permanent
    // survives and fires no dies-trigger (it never left the battlefield). Checked BEFORE regen (both are
    // replacements the permanent's controller orders per CR 616; a shield is strictly better — no tap). A
    // "can't be regenerated" rider (Wrath/Terminate — cannotRegenerate) does NOT bypass a shield counter: that
    // rider is specific to the regeneration replacement (CR 701.19), NOT the shield-counter replacement, so a
    // shielded creature still survives a "can't be regenerated" destroy by removing a shield (CR 122.1c).
    if (hasShieldCounter(lk.permanent)) {
      next = consumeShieldCounter(next, t.id);
      prevented.push(t.id);
      continue;
    }
    // CR 701.19 — a regeneration shield REPLACES this destruction: consume one shield, the permanent survives
    // (clear damage + tap) and fires no dies-trigger (it never left the battlefield). Same look as indestructible.
    // MTG-001 — a "can't be regenerated" destroy (Wrath of God, Terminate) sets `cannotRegenerate`, which
    // overrides the shield (CR 701.19 — the rider prevents the regeneration replacement). It does NOT bypass
    // indestructible (handled above, a separate replacement CR 702.12b), so the order here is correct.
    if (!cannotRegenerate && (lk.permanent.regenShields || 0) > 0) {
      next = regeneratePermanent(next, t.id);
      prevented.push(t.id);
      continue;
    }
    // CR 702.116 — TOTEM ARMOR (Umbra armor): if the permanent being destroyed carries a totem-armor Aura, the
    // Aura is destroyed INSTEAD, all damage is cleared, and the permanent survives (fires no dies-trigger — it
    // never left). Checked LAST among the replacements (after indestructible/shield/regen, which don't sacrifice
    // the Aura). A "can't be regenerated" rider does NOT bypass totem armor — that rider is specific to the
    // regeneration replacement (CR 701.19), not this one, exactly like the shield-counter carve-out above.
    const totemAuraId = totemArmorAuraFor(next, lk.permanent);
    if (totemAuraId) {
      next = applyTotemArmor(next, t.id, totemAuraId);
      prevented.push(t.id);
      continue;
    }
    // moveCardToZone detaches any Aura/Equipment on the destroyed permanent (CR 704.5n/q). Only a
    // CREATURE going to the graveyard "dies" (CR 700.4), so only creatures feed the dies-trigger
    // look-back (captured BEFORE the move, CR 603.10a); destroying a land/artifact fires no dies.
    if (isCreature(lk.permanent.card)) {
      // DIES-TRIGGER-RESOURCE-PAYOFFS: capture the dying creature's layer-aware POWER here (CR 603.6e),
      // BEFORE the moveCardToZone below removes it from the battlefield, so a destroy-spell kill still feeds
      // a "<payoff> equal to its power" dies-trigger the real on-board power (mirrors destroyLethalCreatures).
      const pw = creaturePower(lk.permanent, next);
      const bpw = creatureBasePower(lk.permanent, next);
      dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card, power: Number.isFinite(pw) ? pw : null, basePower: Number.isFinite(bpw) ? bpw : null, counters: { ...(lk.permanent.counters || {}) } });
    } else if (isPlaneswalker(lk.permanent.card)) {
      // A destroyed planeswalker "dies" (CR 700.4); capture its look-back (no power — the only modeled
      // PW-death watcher is Cruel Celebrant's flat creature-or-planeswalker drain).
      deadPw.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card });
    }
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: t.id });
  }
  next = checkDiesTriggers(next, dead);
  next = checkPlaneswalkerDiesTriggers(next, deadPw);
  return logEvent(next, { kind: "spell-effect", effect: "destroy", controller, targets: targets.map(t => t.id), prevented });
}

export function applyDamageEffect(state, { controller, amount: rawAmount, targetType, targets = [], source = null, restrictions = [], exileIfWouldDie = false }) {
  let next = state;
  const amount = Math.max(0, rawAmount || 0);
  // DAMAGE-REPLACEMENT (CR 614 — Wolverine "double all damage", Furnace of Rath …). Finalize the per-target
  // amount AFTER the infect/wither reroute below (the magnitude IS doubled; the keyword only changes the FORM)
  // and BEFORE hitPlayer/hitCreature/adjustLoyalty. Gated on the board carrying a replacement, so an ordinary
  // burn spell is byte-for-byte. `source` is the permanent dealing the damage (an activated/triggered ability's
  // own permanent; a spell has no permanent source → source-self doublers don't match, a safe FN). Never a hook
  // on loseLife. 120.8 zero-guard is re-checked (`> 0`) AFTER doubling at each hit below.
  const dmgConsult = boardHasDamageReplacement(next)
    ? (raw, targetKind, targetId) => raw > 0
      ? consultDamageAmount(next, { sourceId: source?.id ?? null, sourceController: source?.controller ?? controller, amount: raw, targetKind, targetId, isCombat: false })
      : raw
    : (raw) => raw;
  // KW-POISON (CR 702.90 infect / 702.79 wither): a source with infect/wither replaces ALL the damage it
  // deals — NOT just combat — to a creature as that many -1/-1 counters, and (infect only) to a player as
  // that many poison counters. `source.id` is the permanent dealing the damage (ctx.sourceId, threaded for
  // activated/triggered abilities); its keywords are read from the PRE-damage state. A spell or a sourceless
  // effect has no permanent source → it routes normally (spell-source infect/wither stays unclaimed — a safe
  // false-negative, never an FP). Gated on the keyword, so every ordinary burn source is byte-for-byte.
  const sourceInfect = source?.id ? permanentHasKeyword(next, source.id, "Infect") : false;
  const sourceWither = source?.id ? permanentHasKeyword(next, source.id, "Wither") : false;
  // AP-1 (Defang / Muzzle): the SOURCE permanent's attached "…dealt BY enchanted creature" ALL wall
  // zeroes every non-combat deal it makes (its ability pings included); the combat-only form binds
  // only at the combat funnel. Read once — the source is constant for the whole effect.
  const sourceBySilenced = source?.id ? attachedDamagePrevention(next, source.id).by === "all" : false;
  const hitPlayer = (s, pid) => {
    // DAMAGE-REPLACEMENT: double the magnitude per target. Infect still REPLACES life loss with poison —
    // the doubled magnitude becomes that many poison counters (CR 614 doubles the amount; CR 702.90a changes
    // the form). 120.8: only deal if >0 after doubling.
    let dealt = dmgConsult(amount, "player", pid);
    if (dealt <= 0) return s;
    // PV-1 (CR 615): floating prevent-next-N shields consume BEFORE the hit lands (after the doubler —
    // CR 616.1 ordering is the engine's deterministic simplification). Fast-pathed inside the helper.
    const pv = consumePreventionShields(s, { targetKind: "player", targetId: pid, amount: dealt });
    s = pv.state; dealt = pv.amount;
    if (dealt <= 0) return s;
    sourceDealtTotal += dealt; // SL-1: the source's dealt-by tally (players count — "deals damage" is any)
    return sourceInfect
      ? addPoison(s, { playerId: pid, amount: dealt })
      : loseLife(s, { playerId: pid, amount: dealt, combatDamage: false }); // non-combat (spell/ability) damage → burn win-con
  };
  // ENRAGE / DAMAGE-RECEIVED (CR 603.2): tally the FINAL amount dealt to each creature this effect so a
  // dealtDamage trigger fires ONCE per creature with its total (CR 120.8 — only > 0 entries). One entry per
  // creature here (each is hit at most once per applyDamageEffect), but the map keeps it one-event-per-creature
  // if a future effect hits one creature twice in a call. Reflects the Wave-5a doubler (dmgConsult ran).
  const dealtToCreature = {};
  let sourceDealtTotal = 0; // SL-1 — the SOURCE's total dealt this resolution (players + creatures + walkers)
  const hitCreature = (s, permId) => {
    let dealt = dmgConsult(amount, "creature", permId);
    if (dealt <= 0) return s;
    // CR 122.1c — a SHIELD COUNTER PREVENTS all damage this event would deal to the creature and removes one
    // shield counter. The damage is prevented, so it is NOT marked, feeds NO enrage/dealtDamage tally (CR 120.8 —
    // 0 damage was dealt), and no infect/wither -1/-1 counters land. One event removes exactly one shield (this
    // effect hits each creature at most once). Gated on the counter, so an unshielded creature is byte-identical.
    const lk = findPermanent(s, permId);
    if (lk && hasShieldCounter(lk.permanent)) return consumeShieldCounter(s, permId);
    // FOG-1 (CR 615): the creature's own printed "Prevent all damage …" wall — the ALL form blocks
    // non-combat damage too (Dawn Elemental shrugs off a Bolt); the combat-only form does NOT (Gomazoa
    // takes the Bolt), handled at the combat funnel instead.
    if (lk && selfDamagePrevention(lk.permanent.card) === "all") return s;
    // COUNTER-SHIELD (Phantom cycle / Bloatfly Swarm, CR 615) — the same wall the combat funnel enforces,
    // applied to NON-COMBAT damage: a Phantom shrugs off a Bolt exactly as it shrugs off a blocker. Unlike
    // the combat path (which must record and pay after its loops, because `state` there is the frozen
    // pre-step board) this site owns mutable state, so the counters are spent inline.
    //
    // ⛔ BRANCH ON THE MODE, NEVER ON TRUTHINESS — the zero-counter behaviour is OPPOSITE between the two:
    // a Phantom still prevents with nothing left to shed, while Bloatfly stops preventing entirely and must
    // FALL THROUGH to take the damage. Collapsing them makes one immortal or the other paper.
    if (lk) {
      const csMode = counterShieldPrevention(lk.permanent.card);
      if (csMode === "phantom") {
        const have = (lk.permanent.counters?.["+1/+1"]) || 0;
        return have > 0 ? removeCounter(s, { permanentId: permId, type: "+1/+1", amount: 1 }) : s;
      }
      if (csMode === "bloatfly") {
        const have = (lk.permanent.counters?.["+1/+1"]) || 0;
        if (have > 0) {
          const removed = Math.min(have, dealt);
          let out = removeCounter(s, { permanentId: permId, type: "+1/+1", amount: removed });
          // "give EACH PLAYER a rad counter for each +1/+1 counter removed this way" (CR 728).
          for (const pid of Object.keys(out.players)) out = addRadCounters(out, { playerId: pid, amount: removed });
          return out;
        }
        // no counter → NOT prevented; fall through and take it.
      }
    }
    // AP-1 (Inviolability / Heart of Light): an attached "…dealt TO enchanted creature" ALL wall blocks
    // non-combat damage too; the combat-only forms (Gaseous Form) bind only at the combat funnel.
    if (lk && attachedDamagePrevention(s, permId).to === "all") return s;
    // PV-1 (CR 615): floating prevent-next-N shields (Samite Healer on a creature) consume before the hit.
    const pv = consumePreventionShields(s, { targetKind: "creature", targetId: permId, amount: dealt });
    s = pv.state; dealt = pv.amount;
    if (dealt <= 0) return s;
    dealtToCreature[permId] = (dealtToCreature[permId] || 0) + dealt;
    sourceDealtTotal += dealt; // SL-1
    let out = (sourceInfect || sourceWither)
      ? addCounter(s, { permanentId: permId, type: "-1/-1", amount: dealt })
      : markCombatDamage(s, { permanentId: permId, amount: dealt });
    // WOLVERINE clause 2: a non-combat damage source (an ability) that hits another creature arms the
    // per-turn flag too (the oracle says "dealt damage", not "combat damage"). No-op for non-Wolverine sources.
    if (source) out = armDamageToCreatureFlag(out, source, permId);
    return out;
  };
  // A 0-damage effect deals no damage (no marks, no counters, no poison — CR 120.8); guard so an infect
  // source can't stamp a stray "-1/-1": 0 counter. The lethal SBA + log below still run for parity.
  // AP-1: a by-silenced source deals nothing at all (every hit zeroed) — same parity flow as amount 0.
  if (amount > 0 && !sourceBySilenced) {
    if (targetType === "eachOpponent") {
      for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = hitPlayer(next, opp);
    } else if (targetType === "eachCreature") {
      // MASS-FILTERED-DAMAGE: `restrictions` (a hasKeyword flying filter from massFilteredDamageClauseParser)
      // narrows the wiped set — Gale Force hits only flyers, Tremor only non-flyers. An UNrestricted wipe
      // (Pyroclasm, restrictions=[]) passes every creature (creatureSatisfiesRestrictions over [] = true).
      for (const pid of Object.keys(next.players)) {
        for (const perm of next.players[pid].battlefield) {
          if (isCreature(perm.card) && creatureSatisfiesRestrictions(next, perm, pid, controller, restrictions)) next = hitCreature(next, perm.id);
        }
      }
    } else if (targetType === "eachOtherCreature") {
      // SOURCE-EXCLUDING BOARD SWEEP (BLITZ ETB-1 — Chaos Maw / Crater Hellion / Raging Swordtooth): mirror the
      // eachCreature wipe but SKIP the source permanent (source.id = ctx.sourceId, the entering creature). CR
      // 113.7 — "each OTHER creature" is every creature except the source. An absent source.id (a sourceless
      // effect — no such printed card) excludes nothing, degrading to a full sweep rather than fabricating; but
      // the only carriers are creature ETBs whose source is always set, so the source is always excluded.
      for (const pid of Object.keys(next.players)) {
        for (const perm of next.players[pid].battlefield) {
          if (perm.id !== source?.id && isCreature(perm.card) && creatureSatisfiesRestrictions(next, perm, pid, controller, restrictions)) next = hitCreature(next, perm.id);
        }
      }
    } else if (targetType === "eachPlayer") {
      // SYMBURN-2 — every player INCLUDING the caster, and NO creatures. The same seat loop the combined
      // form runs; the creature half is simply absent, which is what "each player" says. Self-damage is
      // the point of these cards (Flame Rift), not an oversight.
      for (const pid of Object.keys(next.players)) {
        if (next.players[pid]) next = hitPlayer(next, pid);
      }
    } else if (targetType === "eachOpponentAndTheirCreatures" || targetType === "eachOpponentAndTheirCreaturesPW") {
      // SYMBURN-4 (Goblin Chainwhirler, End the Festivities, Tectonic Hazard, Wildfire Cerberus) — every
      // OPPONENT takes the damage, and so does every creature (and, in the PW variant, every planeswalker)
      // THEY control. Strictly one-sided: the caster's seat and the caster's board are never touched, which is
      // exactly what makes these cards good and what would make a symmetric implementation a different card.
      //
      // Iterating opponentsOf(controller) rather than every seat is what enforces the one-sidedness — there is
      // no filter to get wrong, because the caster is never in the loop at all.
      const walkersToo = targetType === "eachOpponentAndTheirCreaturesPW";
      for (const oid of opponentsOf(next, controller)) {
        if (!next.players[oid]) continue;
        next = hitPlayer(next, oid);
        for (const perm of [...next.players[oid].battlefield]) {
          if (isCreature(perm.card)) { next = hitCreature(next, perm.id); continue; }
          if (!walkersToo) continue;
          if (!/\bPlaneswalker\b/i.test(String(perm.card?.type || perm.card?.type_line || ""))) continue;
          // The single-target loyalty path, reused: damage replacement → prevention shields → loyalty removal.
          let dealt = dmgConsult(amount, "planeswalker", perm.id);
          if (dealt > 0) {
            const pv = consumePreventionShields(next, { targetKind: "planeswalker", targetId: perm.id, amount: dealt });
            next = pv.state; dealt = pv.amount;
          }
          if (dealt > 0) { next = adjustLoyalty(next, { permanentId: perm.id, delta: -dealt }); sourceDealtTotal += dealt; }
        }
      }
    } else if (targetType === "eachCreatureAndPlaneswalker") {
      // SYMBURN-3 (Star of Extinction, Storm's Wrath, Dragonback Assault; Magmaquake's filtered twin) — every
      // creature on every battlefield AND every planeswalker. PLAYERS ARE NOT HIT: the text says "each
      // planeswalker", not "each player", and conflating the two would drain life the card never touches.
      //
      // The creature half honours `restrictions` exactly like the eachCreature branch, so the filtered form
      // works. The planeswalker half deliberately does NOT: a creature predicate ("without flying") says
      // nothing about a planeswalker, and Magmaquake hits every walker regardless.
      //
      // ⭐ THE LOYALTY PATH IS THE SINGLE-TARGET ONE, REUSED RATHER THAN REIMPLEMENTED — damage replacement
      // (dmgConsult), then prevention shields (CR 615), then loyalty removal (CR 120.3c). Writing a second
      // loyalty path here is how the two would drift.
      for (const pid of Object.keys(next.players)) {
        for (const perm of next.players[pid].battlefield) {
          if (isCreature(perm.card) && creatureSatisfiesRestrictions(next, perm, pid, controller, restrictions)) next = hitCreature(next, perm.id);
        }
      }
      for (const pid of Object.keys(next.players)) {
        for (const perm of [...next.players[pid].battlefield]) {
          if (!/\bPlaneswalker\b/i.test(String(perm.card?.type || perm.card?.type_line || ""))) continue;
          let dealt = dmgConsult(amount, "planeswalker", perm.id);
          if (dealt > 0) {
            const pv = consumePreventionShields(next, { targetKind: "planeswalker", targetId: perm.id, amount: dealt });
            next = pv.state; dealt = pv.amount;
          }
          if (dealt > 0) { next = adjustLoyalty(next, { permanentId: perm.id, delta: -dealt }); sourceDealtTotal += dealt; }
        }
      }
    } else if (targetType === "eachCreatureAndPlayer") {
      // SYMBURN-1 (Inferno / Fire Tempest / Evincar's Justice): symmetric burn hits EVERY creature on
      // every battlefield AND EVERY player INCLUDING the caster ("each player" is all players, not just
      // opponents). Planeswalkers are NOT hit (the text says "each player", not "or planeswalker").
      //
      // ⭐ THE CREATURE HALF NOW HONOURS `restrictions`, the same way the eachCreature and eachOtherCreature
      // branches above do. Hurricane hits only flyers and every player; Earthquake only non-flyers and every
      // player. This was NOT an oversight left in the runtime — until this slice no parse arm could produce a
      // FILTERED combined sweep, so the loop had nothing to filter by. Shipping the parse arm without this
      // line would burn every creature on the board for Hurricane, which is the forbidden direction.
      //
      // ⛔ THE PLAYER HALF IS DELIBERATELY UNFILTERED. A creature restriction says nothing about who takes
      // damage — "each creature with flying and each player" hits EVERY player regardless of what they
      // control. Filtering seats by a creature predicate would be a rules error in the other direction.
      //
      // An UNRESTRICTED combined sweep (Inferno, restrictions=[]) passes every creature —
      // creatureSatisfiesRestrictions over [] is true — so the incumbent cards are byte-identical.
      for (const pid of Object.keys(next.players)) {
        if (next.players[pid]) next = hitPlayer(next, pid);
        for (const perm of next.players[pid].battlefield) {
          if (isCreature(perm.card) && creatureSatisfiesRestrictions(next, perm, pid, controller, restrictions)) next = hitCreature(next, perm.id);
        }
      }
    } else {
      for (const t of targets) {
        if (t.type === "player" && next.players[t.id]) next = hitPlayer(next, t.id);
        else if (t.type === "creature" && findPermanent(next, t.id)) next = hitCreature(next, t.id);
        // PW-6: damage to a planeswalker removes that many loyalty counters (CR 120.3c), not life. Infect
        // doesn't touch planeswalkers (it replaces damage to creatures/players only) — loyalty as normal.
        // DAMAGE-REPLACEMENT (CR 120.3c): loyalty uses the DOUBLED amount.
        else if (t.type === "planeswalker" && findPermanent(next, t.id)) {
          let dealt = dmgConsult(amount, "planeswalker", t.id);
          // PV-1 (CR 615): a prevention shield on a planeswalker consumes before the loyalty hit.
          if (dealt > 0) {
            const pv = consumePreventionShields(next, { targetKind: "planeswalker", targetId: t.id, amount: dealt });
            next = pv.state; dealt = pv.amount;
          }
          if (dealt > 0) { next = adjustLoyalty(next, { permanentId: t.id, delta: -dealt }); sourceDealtTotal += dealt; } // SL-1
        }
      }
    }
  }
  // ENRAGE / DAMAGE-RECEIVED (CR 603.2) — fire each damaged creature's "Whenever this creature is dealt
  // damage" trigger ONCE with its total, BEFORE the lethal SBA so the source binds while still on the
  // battlefield (a creature that then dies to the SBA self-no-ops at resolution — the "must survive"
  // reminder). Every entry is > 0 (the hitCreature `dealt <= 0` guard), so 0/prevented damage never fires.
  next = checkDealtDamageTriggers(next, Object.entries(dealtToCreature).map(([creatureId, dealt]) => ({ creatureId, amount: dealt })));
  // SL-1 — the DEALT-BY lifegain link: the SOURCE permanent (a ping / fight / enrage payload) dealt this
  // resolution's total. Non-combat, so a combat-only link (Sunhome Enforcer) stays silent here.
  if (source?.id && sourceDealtTotal > 0) {
    next = checkDealtByTriggers(next, [{ sourceId: source.id, amount: sourceDealtTotal }], { isCombat: false });
  }
  // EXILE-IF-DIES (subsystem 3): "If that creature would die this turn, exile it instead." (single-target)
  // / "If a creature dealt damage this way would die this turn, exile it instead." (mass). Flag exactly the
  // creatures THIS effect actually damaged — `dealtToCreature` is the per-creature hit set built above, so
  // this is correct for the single target AND the mass forms (any-target / each-creature) and NEVER marks a
  // creature the spell didn't hit. Done BEFORE the lethal SBA so destroyLethalCreatures reroutes them to
  // exile; the marker self-expires by turn (applies whether lethal now or the creature dies later this turn).
  if (exileIfWouldDie) {
    for (const permId of Object.keys(dealtToCreature)) next = markExileIfDies(next, { permanentId: permId, turn: next.turn });
  }
  const dmgResult = destroyLethalCreatures(next);
  next = checkDiesTriggers(dmgResult.state, dmgResult.dead);
  // PW-6: a planeswalker driven to 0 loyalty by the damage is put into the graveyard (CR 704.5i).
  const pwSba = destroyZeroLoyaltyPlaneswalkers(next);
  next = pwSba.state;
  // PLANESWALKER-DIES (CR 700.4) — fire the dead walker's dies-watchers (Cruel Celebrant's creature-or-PW drain).
  next = checkPlaneswalkerDiesTriggers(next, pwSba.dead);
  return logEvent(next, { kind: "spell-effect", effect: "damage", controller, amount, targets: targets.map(t => t.id) });
}

// W5: `resolveSpellEffect` (the legacy "spell.effect" resolver's thin dispatcher over the primitives
// above) was DELETED with the dead SPELL_EFFECT registry lane — zero production emitters existed.
// The primitives (applyDrawEffect / applyDestroyEffect / applyDamageEffect / …) ARE the resolution
// truth; the EffectProgram atoms call them directly. (parseSpellEffect — the PARSE half — stays live:
// legalChoices' AI scorer and the parser's legacyToAtom fallback consume it.)
