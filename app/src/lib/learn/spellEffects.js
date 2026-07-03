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
  creatureToughness,
  isIndestructible,
  regeneratePermanent,
  hasShieldCounter,
  consumeShieldCounter,
  totemArmorAuraFor,
  applyTotemArmor,
  adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers,
  isPlaneswalker,
  addCounter,
  addPoison,
} from "./gameState.js";
import { checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkCardDrawnTriggers, checkDealtDamageTriggers } from "./triggers.js";
import { uncounterableSubtypesOnBattlefield } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentProtectionColors } from "./layers.js";
import { protectionApplies } from "./protection.js";
import { isNonChosenTargetType } from "./targetTypes.js";
import { boardHasDamageReplacement, consultDamageAmount } from "./damageReplacements.js";
import { armDamageToCreatureFlag } from "./wolverine.js";
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
function cardMatchesGraveyardFilter(card, cardFilter) {
  if (!cardFilter || cardFilter === "any") return true;
  const front = String(card?.type || card?.type_line || "").split(" // ")[0];
  if (cardFilter === "permanent") return /\b(?:Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/.test(front);
  return cardFilter.split("|").some((tok) => GY_TYPE_WORD[tok] && front.includes(GY_TYPE_WORD[tok]));
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
  m = oracle.match(/target creature gets ([+-]\d+)\/([+-]\d+)\s+until end of turn/i);
  if (m) {
    return { kind: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, duration: "endOfTurn" };
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

export function parseCreatureTargetRestrictions(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").toLowerCase();
  let m = oracle.match(/destroy\s+target\s+([^.]+)/);
  if (!m) m = oracle.match(/deals?\s+\d+\s+damage\s+to\s+([^.]+)/);
  if (!m || !/\bcreature\b/.test(m[1])) {
    // Not a creature target → nothing to model. (A "creature or player" any-target
    // never reaches here — parseSpellEffect maps it to targetType "any". A genuine
    // "creature or <type>" leaves an unmodeled "or <type>" residue below → unclean.)
    return { restrictions: [], clean: true, cleanedOracle: oracle };
  }

  let t = ` ${m[1].replace(/[.,]/g, " ")} `;
  const restrictions = [];

  // Controller — "an opponent controls" / "you don't control" vs "you control".
  if (/\b(?:an opponent controls|you don't control|a player other than you controls)\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "opponent" });
    t = t.replace(/\b(?:an opponent controls|you don't control|a player other than you controls)\b/g, " ");
  } else if (/\byou control\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "you" });
    t = t.replace(/\byou control\b/g, " ");
  }

  // Tapped / untapped (untapped first so "tapped" doesn't eat it).
  if (/\buntapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: false }); t = t.replace(/\buntapped\b/g, " "); }
  else if (/\btapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: true }); t = t.replace(/\btapped\b/g, " "); }

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
  for (const word of t.split(/\s+/)) {
    if (TARGET_SUBTYPES.has(word)) {
      restrictions.push({ kind: "subtype", subtype: word });
      t = t.replace(new RegExp(`\\b${word}\\b`, "g"), " ");
      break; // one subtype per target; a second subtype word stays as residue → unclean (CREED, safe)
    }
  }

  // Strip the base noun + filler; anything left is an UNMODELED qualifier → unclean.
  t = t.replace(/\b(target|a|an|another|other|each|any|creature|creatures|with|that|to|the|is)\b/g, " ").replace(/[^a-z]+/g, " ").trim();

  // The oracle with the MODELED restriction phrases removed — so the confidence
  // gate (which keeps controller/tapped/power in its denylist to protect mass
  // effects like "each creature an opponent controls") can re-check the REST of
  // the clause (riders, other markers) without tripping on a restriction we model.
  let cleanedOracle = oracle;
  for (const re of MODELED_RESTRICTION_RES) cleanedOracle = cleanedOracle.replace(re, " ");
  return { restrictions, clean: t.length === 0, cleanedOracle };
}

/** Does a creature permanent (controlled by `pid`) satisfy a restriction set, from `casterId`'s view? */
function creatureSatisfiesRestrictions(state, perm, pid, casterId, restrictions, ctx = null) {
  for (const r of restrictions) {
    if (r.kind === "notSource") {
      // "ANOTHER" (CR 109.5) — "untap another target permanent" (Formidable Speaker) may not target the
      // source permanent itself. ctx.sourceId is threaded from the activated ability's expandCastChoices; a
      // permanent whose id equals the source is excluded. FAIL-CLOSED when the source is unknown (no
      // ctx.sourceId): no permanent qualifies → the pool is empty and the ability drops no-target (SAFE, CREED
      // — never targets the wrong permanent). A source that has already left play (id no longer on any
      // battlefield) simply never matches, which is harmless.
      if (!ctx?.sourceId || perm.id === ctx.sourceId) return false;
    } else if (r.kind === "controller") {
      if (r.who === "you" && pid !== casterId) return false;
      if (r.who === "opponent" && pid === casterId) return false;
      // DEFENDING-PLAYER scope (CR 509.1a) — only the SPECIFIC attacked player's permanents are legal
      // (ctx.defenderId, threaded from an attacks trigger's context). Absent defenderId (a spell / a non-
      // attack path) → no permanent qualifies → the pool is empty and the ability drops no-target (SAFE, CREED
      // — never a mis-scoped destroy). A non-defending opponent's permanent is excluded, so in multiplayer the
      // pool is exactly the defending player's, never "any opponent's".
      if (r.who === "defendingPlayer" && (!ctx?.defenderId || pid !== ctx.defenderId)) return false;
    } else if (r.kind === "tapped") {
      if (!!perm.tapped !== r.value) return false;
    } else if (r.kind === "power") {
      const pw = creaturePower(perm, state);
      if (r.op === "<=" && !(pw <= r.value)) return false;
      if (r.op === ">=" && !(pw >= r.value)) return false;
    } else if (r.kind === "combat") {
      const atk = (state.combat?.attackers || []).some((a) => a.permanentId === perm.id);
      const blk = (state.combat?.blockers || []).some((b) => b.blockerId === perm.id);
      if (r.value === "attacking" && !atk) return false;
      if (r.value === "blocking" && !blk) return false;
      if (r.value === "either" && !(atk || blk)) return false;
    } else if (r.kind === "colorNeg") {
      // FRONT-face colors (CR 712.4a): a DFC's top-level `colors` is unreliable in the slim index — often
      // [] even for a colored front face (Graveyard Trespasser is black but enriches top-level []), so read
      // card_faces[0].colors for a DFC and top-level for a single-face card. FAIL-CLOSED when the colors are
      // unresolvable (no face data / an absent field): never risk offering a wrong-color creature to
      // non<color> removal — an illegal target is the cardinal sin, a dropped legal target is safe.
      const card = perm.card || {};
      const isDfc = / \/\/ /.test(String(card.type || card.type_line || ""));
      const colors = isDfc ? card.card_faces?.[0]?.colors : card.colors;
      if (!Array.isArray(colors)) return false;
      if (colors.includes(r.color)) return false; // a non<color> target can't be that color
    } else if (r.kind === "typeNeg") {
      // FRONT-face type only (CR 712.4a) — a DFC's combined "Front // Back" line would wrongly match a
      // back-face type (mirrors the front-face discipline used for counter/tutor/graveyard targets here).
      const tl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0].toLowerCase();
      if (tl.includes(r.type)) return false;       // a non<type> target can't be that card type
    } else if (r.kind === "toughness") {
      // TAP-TARGET-CREATURE: "with toughness N or less" (Errant Doomsayers). Mirrors the power branch.
      const th = creatureToughness(perm, state);
      if (r.op === "<=" && !(th <= r.value)) return false;
      if (r.op === ">=" && !(th >= r.value)) return false;
    } else if (r.kind === "manaValue") {
      // TAP-TARGET-CREATURE: "with mana value N or greater" (Law-Rune Enforcer). Uses the slim-index
      // cmc field (mana value as a number); defaults to 0 when absent (safe false-negative for lands/tokens).
      const mv = perm.card?.cmc ?? 0;
      // MV-CAP-BY-X (Here Comes a New Hero! — "with mana value X or less"): `valueX` resolves the cap from the
      // chosen X (ctx.xValue, bound at cast per CR 202.3b). `?? 0` (not `|| 0`) so an explicit X=0 caps at MV 0
      // (a legal, conservative choice — target only 0-drops), and a missing xValue is treated as 0, NEVER as
      // "uncapped" — the CREED guarantee that the X-bound cap is never silently dropped into an illegal target.
      // A cast-time enumeration threads ctx={xValue:x} per affordable X (legalChoices X-spell branch), so this
      // fires with the concrete X for each candidate cast.
      const cap = r.valueX ? Math.max(0, ctx?.xValue ?? 0) : r.value;
      if (r.op === "<=" && !(mv <= cap)) return false;
      if (r.op === ">=" && !(mv >= cap)) return false;
    } else if (r.kind === "hasKeyword") {
      // TAP-TARGET-CREATURE: "without flying" (Dromoka Dunecaster, Cephalid Retainer, Flood) or
      // "with flying" (Storm Front). Layer-aware read via permanentHasKeyword so granted/removed
      // flying (e.g. via an Aura) is honored. Fail-closed: if the keyword state is unresolvable,
      // treating the creature as NOT having the keyword is a safe false-negative.
      const hasKw = permanentHasKeyword(state, perm.id, r.keyword);
      if (r.negate && hasKw) return false;  // "without flying" → must NOT have flying
      if (!r.negate && !hasKw) return false; // "with flying" → must have flying
    } else if (r.kind === "subtype") {
      // SUBTYPE-TARGET (CR 205.3) — "target <Subtype>" (e.g. "Regenerate target Sliver", Crypt Sliver's
      // group-granted ability). A creature subtype is a proper noun appearing verbatim ONLY in the subtype
      // portion of a type line ("Creature — Sliver"), so a word-bounded, case-insensitive containment test
      // matches exactly the subtyped creatures. The matcher (combatKeywordClauseParser) only emits a CURATED
      // creature-subtype word, so this never mis-matches a color/card-type word. Front-face only (CR 712.4a):
      // a DFC's combined "Front // Back" line would wrongly match a back-face subtype.
      const tl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0];
      if (!new RegExp(`\\b${r.subtype}\\b`, "i").test(tl)) return false;
    }
  }
  return true;
}

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
        if (isCreature(perm.card) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx)) {
          out.push({ type: "creature", id: perm.id, controller: pid, name: perm.card?.name });
        }
      }
    }
  };
  const addPlayers = () => {
    for (const pid of Object.keys(state.players)) out.push({ type: "player", id: pid, name: pid });
  };
  // P3.1 counter: legal targets are SPELLS on the stack (kind "spell"; abilities are
  // not spells), filtered by the counter's spellFilter (any/noncreature/creature).
  // An on-card uncounterable spell (CR 701.5e) is excluded — conservative: granted/
  // external "can't be countered" isn't modeled, but the on-card case is never wrong.
  // CANT-BE-COUNTERED (Root Sliver) — the subtypes whose spells a battlefield static makes uncounterable
  // ("Sliver spells can't be countered"), gathered once across every player's battlefield. A stack spell
  // whose TYPE LINE carries one of these subtypes is excluded as a counter target below. Empty in the common
  // case (no such static in play) → zero behavior change. CR 701.5e: the spell simply can't be countered.
  const uncounterableSubs = (() => {
    const cards = [];
    for (const pid of Object.keys(state.players || {})) {
      for (const perm of state.players[pid]?.battlefield || []) if (perm?.card) cards.push(perm.card);
    }
    return uncounterableSubtypesOnBattlefield(cards);
  })();
  const addStackSpells = () => {
    for (const obj of state.stack || []) {
      if (obj.kind !== "spell") continue;
      // COPY-SPELL (Double Major, CR 707.10) — "copy" is NOT "counter": copying a spell doesn't try to counter
      // it, so the uncounterability exclusions (an on-card "can't be countered", or a Root-Sliver board static)
      // do NOT restrict a copy's legal targets. effect.copyNotCounter (set only by the copy-creature-spell atom's
      // target spec) skips those two gates. The counter path (copyNotCounter falsy) keeps them exactly as before.
      if (!effect.copyNotCounter) {
        if (/can't be countered/i.test(String(obj.source?.oracle || obj.source?.oracle_text || ""))) continue;
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
      }
      // COPY-TARGET-OWN (Double Major — "copy target creature spell YOU CONTROL"): only the controller's own
      // stack spells are legal. effect.spellController:"you" (set by the copy atom's target spec) enforces it at
      // enumeration so an opponent's spell is never offered (CR 601.2c + CREED FP-forbidden). The counter family
      // never sets it (its "target spell" is any controller), so counters are byte-identical.
      if (effect.spellController === "you" && obj.controller !== controllerId) continue;
      // `effect` rides in so CNT-MV-EXACT (Mental Misstep / Spell Snare) can require the target spell's mana
      // value EQUAL effect.exactMv at enumeration — an MV-mismatched spell is simply not offered as a target.
      if (!spellMatchesCounterFilter(obj, effect.spellFilter, effect)) continue;
      out.push({ type: "spell", id: obj.id, name: obj.source?.name });
    }
  };
  // Graveyard recursion: legal targets are CARDS in the CASTER'S OWN graveyard ("your graveyard"),
  // filtered by the atom's cardFilter (REG-1: creature / any / artifact / instant|sorcery / permanent /
  // … — see parseGraveyardFilter). The graveyard is a public zone, so this is a normal cast-time target
  // choice; cardMatchesGraveyardFilter applies the front-face (CR 712.4a) type discipline.
  const addGraveyardCards = () => {
    // Default: the CASTER'S OWN graveyard ("your graveyard" — return-from-graveyard / reanimate / GY-TO-TOP).
    // GY-EXILE / REANIMATE-FROM-ANY set effect.anyGraveyard ("a graveyard") → offer cards from EVERY player's
    // graveyard; effect.opponentGraveyard ("an opponent's graveyard" — Ashen Powder) → opponents only. Each
    // target is stamped with its OWNER as `controller` so the resolver acts on the right graveyard.
    const pids = effect.anyGraveyard
      ? Object.keys(state.players)
      : effect.opponentGraveyard
        ? Object.keys(state.players).filter((pid) => pid !== controllerId)
        : [controllerId];
    for (const pid of pids) {
      for (const card of state.players[pid]?.graveyard || []) {
        if (card.token) continue; // a token is not a "card" (CR 111 / 608.2b) — never a legal target
        if (!cardMatchesGraveyardFilter(card, effect.cardFilter)) continue;
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
  const addOpponents = () => {
    for (const pid of Object.keys(state.players)) {
      if (pid === controllerId) continue;
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
    creatureOrEnchantment: (tl) => /\bCreature\b|\bEnchantment\b/.test(tl), // β-2 type unions
    creatureOrLand: (tl) => /\bCreature\b|\bLand\b/.test(tl),
    creatureOrArtifact: (tl) => /\bCreature\b|\bArtifact\b/.test(tl),
    artifactOrLand: (tl) => /\bArtifact\b|\bLand\b/.test(tl),
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
        if (pred(tl) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions, ctx) && canBeTargetedBy(state, perm, pid, controllerId, sourceColors)) {
          out.push({ type: "permanent", id: perm.id, controller: pid, name: perm.card?.name });
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
          out.push({ type: "planeswalker", id: perm.id, controller: pid, name: perm.card?.name });
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
  else if (effect.targetType === "graveyardCard") addGraveyardCards();
  else if (effect.targetType === "opponent") addOpponents();
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
 * Does a spell on the stack match a counter's spellFilter (CR 701.5a)? `atom` carries the MV / color
 * restrictions (exactMv / minMv / maxMv / colorFilter). MIRRORS counterFilterMatches in atoms/stack.js EXACTLY
 * — the two are kept in lockstep by hand (not delegated) to avoid a spellEffects ↔ atoms/stack import cycle; any
 * filter added in one MUST be added here. spellEffects is the ENUMERATION side ("is this a legal target to
 * offer?"); counterFilterMatches is the RESOLUTION side ("does the counter still apply?").
 */
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
    // rider is specific to the regeneration replacement (CR 701.15), NOT the shield-counter replacement, so a
    // shielded creature still survives a "can't be regenerated" destroy by removing a shield (CR 122.1c).
    if (hasShieldCounter(lk.permanent)) {
      next = consumeShieldCounter(next, t.id);
      prevented.push(t.id);
      continue;
    }
    // CR 701.15 — a regeneration shield REPLACES this destruction: consume one shield, the permanent survives
    // (clear damage + tap) and fires no dies-trigger (it never left the battlefield). Same look as indestructible.
    // MTG-001 — a "can't be regenerated" destroy (Wrath of God, Terminate) sets `cannotRegenerate`, which
    // overrides the shield (CR 701.15 — the rider prevents the regeneration replacement). It does NOT bypass
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
    // regeneration replacement (CR 701.15), not this one, exactly like the shield-counter carve-out above.
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
      dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card, power: Number.isFinite(pw) ? pw : null });
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
  const hitPlayer = (s, pid) => {
    // DAMAGE-REPLACEMENT: double the magnitude per target. Infect still REPLACES life loss with poison —
    // the doubled magnitude becomes that many poison counters (CR 614 doubles the amount; CR 702.90a changes
    // the form). 120.8: only deal if >0 after doubling.
    const dealt = dmgConsult(amount, "player", pid);
    if (dealt <= 0) return s;
    return sourceInfect
      ? addPoison(s, { playerId: pid, amount: dealt })
      : loseLife(s, { playerId: pid, amount: dealt });
  };
  // ENRAGE / DAMAGE-RECEIVED (CR 603.2): tally the FINAL amount dealt to each creature this effect so a
  // dealtDamage trigger fires ONCE per creature with its total (CR 120.8 — only > 0 entries). One entry per
  // creature here (each is hit at most once per applyDamageEffect), but the map keeps it one-event-per-creature
  // if a future effect hits one creature twice in a call. Reflects the Wave-5a doubler (dmgConsult ran).
  const dealtToCreature = {};
  const hitCreature = (s, permId) => {
    const dealt = dmgConsult(amount, "creature", permId);
    if (dealt <= 0) return s;
    // CR 122.1c — a SHIELD COUNTER PREVENTS all damage this event would deal to the creature and removes one
    // shield counter. The damage is prevented, so it is NOT marked, feeds NO enrage/dealtDamage tally (CR 120.8 —
    // 0 damage was dealt), and no infect/wither -1/-1 counters land. One event removes exactly one shield (this
    // effect hits each creature at most once). Gated on the counter, so an unshielded creature is byte-identical.
    const lk = findPermanent(s, permId);
    if (lk && hasShieldCounter(lk.permanent)) return consumeShieldCounter(s, permId);
    dealtToCreature[permId] = (dealtToCreature[permId] || 0) + dealt;
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
  if (amount > 0) {
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
    } else if (targetType === "eachCreatureAndPlayer") {
      // SYMBURN-1 (Inferno / Fire Tempest / Evincar's Justice): symmetric burn hits EVERY creature on
      // every battlefield AND EVERY player INCLUDING the caster ("each player" is all players, not just
      // opponents). Planeswalkers are NOT hit (the text says "each player", not "or planeswalker").
      for (const pid of Object.keys(next.players)) {
        if (next.players[pid]) next = hitPlayer(next, pid);
        for (const perm of next.players[pid].battlefield) {
          if (isCreature(perm.card)) next = hitCreature(next, perm.id);
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
          const dealt = dmgConsult(amount, "planeswalker", t.id);
          if (dealt > 0) next = adjustLoyalty(next, { permanentId: t.id, delta: -dealt });
        }
      }
    }
  }
  // ENRAGE / DAMAGE-RECEIVED (CR 603.2) — fire each damaged creature's "Whenever this creature is dealt
  // damage" trigger ONCE with its total, BEFORE the lethal SBA so the source binds while still on the
  // battlefield (a creature that then dies to the SBA self-no-ops at resolution — the "must survive"
  // reminder). Every entry is > 0 (the hitCreature `dealt <= 0` guard), so 0/prevented damage never fires.
  next = checkDealtDamageTriggers(next, Object.entries(dealtToCreature).map(([creatureId, dealt]) => ({ creatureId, amount: dealt })));
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
