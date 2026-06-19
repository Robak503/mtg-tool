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
  destroyLethalCreatures,
  logEvent,
  opponentsOf,
  creaturePower,
  creatureToughness,
  isIndestructible,
  regeneratePermanent,
  adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers,
  addCounter,
  addPoison,
} from "./gameState.js";
import { checkDiesTriggers, checkCardDrawnTriggers } from "./triggers.js";
import { permanentHasKeyword } from "./layers.js";
import { isNonChosenTargetType } from "./targetTypes.js";

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
    return { kind: "destroy", targetType: "creature" };
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
  // is the P2.3 `pump` atom (a CR 613.4c layer-7c effect), not the legacy
  // resolveSpellEffect (which has no pump branch and is no longer the cast path).
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
  /\battacking or blocking\b/g,         // β-1 (order before the singles so the phrase is removed whole)
  /\battacking\b/g,
  /\bblocking\b/g,
  /\bnon(?:white|blue|black|red|green)\b/g,
  /\bnon(?:artifact|enchantment|land)\b/g,
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
function creatureSatisfiesRestrictions(state, perm, pid, casterId, restrictions) {
  for (const r of restrictions) {
    if (r.kind === "controller") {
      if (r.who === "you" && pid !== casterId) return false;
      if (r.who === "opponent" && pid === casterId) return false;
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
    }
  }
  return true;
}

// Hexproof / shroud targetability (CR 702.11 / 702.18), read LAYER-AWARE so a GRANTED or removed
// instance is honored (Alpha Authority hexproof, etc.). shroud = untargetable by ANYONE; hexproof =
// untargetable by the caster's OPPONENTS (the controller may still target their own). Ward is NOT here
// — it's a TAX the targeter pays (CR 702.21), not an exclusion, so modeling it as untargetable would be
// a false positive; ward stays an interim-FP until its tax/counter is modeled exactly.
export function canBeTargetedBy(state, perm, controllerOfPerm, casterId) {
  if (permanentHasKeyword(state, perm.id, "Shroud")) return false;
  if (permanentHasKeyword(state, perm.id, "Hexproof") && casterId !== controllerOfPerm) return false;
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
export function enumerateTargets(state, controllerId, effect) {
  if (!effectNeedsTarget(effect)) return [];
  const restrictions = Array.isArray(effect.restrictions) ? effect.restrictions : [];
  const out = [];
  const addCreatures = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreature(perm.card) && canBeTargetedBy(state, perm, pid, controllerId) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions)) {
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
  const addStackSpells = () => {
    for (const obj of state.stack || []) {
      if (obj.kind !== "spell") continue;
      if (/can't be countered/i.test(String(obj.source?.oracle || obj.source?.oracle_text || ""))) continue;
      if (!spellMatchesCounterFilter(obj, effect.spellFilter)) continue;
      out.push({ type: "spell", id: obj.id, name: obj.source?.name });
    }
  };
  // Graveyard recursion: legal targets are CARDS in the CASTER'S OWN graveyard ("your graveyard"),
  // filtered by the atom's cardFilter (REG-1: creature / any / artifact / instant|sorcery / permanent /
  // … — see parseGraveyardFilter). The graveyard is a public zone, so this is a normal cast-time target
  // choice; cardMatchesGraveyardFilter applies the front-face (CR 712.4a) type discipline.
  const addGraveyardCards = () => {
    for (const card of state.players[controllerId]?.graveyard || []) {
      if (card.token) continue; // a token is not a "card" (CR 111 / 608.2b) — never a legal target
      if (!cardMatchesGraveyardFilter(card, effect.cardFilter)) continue;
      out.push({ type: "graveyardCard", id: card.id, controller: controllerId, name: card?.name });
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
    permanent: () => true,
    nonlandPermanent: (tl) => !/\bLand\b/.test(tl),
    artifactOrEnchantment: (tl) => /\bArtifact\b|\bEnchantment\b/.test(tl),
    creatureOrEnchantment: (tl) => /\bCreature\b|\bEnchantment\b/.test(tl), // β-2 type unions
    creatureOrLand: (tl) => /\bCreature\b|\bLand\b/.test(tl),
    creatureOrArtifact: (tl) => /\bCreature\b|\bArtifact\b/.test(tl),
    artifactOrLand: (tl) => /\bArtifact\b|\bLand\b/.test(tl),
    enchantmentOrLand: (tl) => /\bEnchantment\b|\bLand\b/.test(tl),
  };
  const controllerOk = (pid) => restrictions.every((r) =>
    r.kind !== "controller" || (r.who === "you" ? pid === controllerId : pid !== controllerId));
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
        if (pred(tl) && controllerOk(pid) && canBeTargetedBy(state, perm, pid, controllerId)) {
          out.push({ type: "permanent", id: perm.id, controller: pid, name: perm.card?.name });
        }
      }
    }
  };
  // PW-6: a live planeswalker (carries a loyalty counter, PW-1 ETB) is a legal target for damage
  // (and other "any target" effects). Honors the controller restriction so "… an opponent controls"
  // never offers your own walker. Damage to it is removed as loyalty (applyDamageEffect, CR 120.3c).
  const addPlaneswalkers = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (perm.counters?.loyalty != null && controllerOk(pid) && canBeTargetedBy(state, perm, pid, controllerId)) {
          out.push({ type: "planeswalker", id: perm.id, controller: pid, name: perm.card?.name });
        }
      }
    }
  };
  if (effect.targetType === "creature") addCreatures();
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

/** Does a spell on the stack match a counter's spellFilter (CR 701.5a)? */
function spellMatchesCounterFilter(stackObj, filter) {
  // Front-face type only — a split/MDFC spell's enriched type line is "Front // Back".
  const type = String(stackObj?.source?.type || stackObj?.source?.type_line || "").split(" // ")[0];
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
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
 * state mutation. `resolveSpellEffect` (the legacy `spell.effect` resolver) AND
 * the Phase-2 EffectProgram atoms (`effects/effectAtoms.js`) both call these, so
 * the interpreter's atoms are byte-for-byte equivalent to the legacy path by
 * construction — there is no second implementation to drift.
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

export function applyDestroyEffect(state, { controller, targets = [] }) {
  let next = state;
  const dead = [];
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
    // CR 701.15 — a regeneration shield REPLACES this destruction: consume one shield, the permanent survives
    // (clear damage + tap) and fires no dies-trigger (it never left the battlefield). Same look as indestructible.
    if ((lk.permanent.regenShields || 0) > 0) {
      next = regeneratePermanent(next, t.id);
      prevented.push(t.id);
      continue;
    }
    // moveCardToZone detaches any Aura/Equipment on the destroyed permanent (CR 704.5n/q). Only a
    // CREATURE going to the graveyard "dies" (CR 700.4), so only creatures feed the dies-trigger
    // look-back (captured BEFORE the move, CR 603.10a); destroying a land/artifact fires no dies.
    if (isCreature(lk.permanent.card)) {
      dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card });
    }
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: t.id });
  }
  next = checkDiesTriggers(next, dead);
  return logEvent(next, { kind: "spell-effect", effect: "destroy", controller, targets: targets.map(t => t.id), prevented });
}

export function applyDamageEffect(state, { controller, amount: rawAmount, targetType, targets = [], source = null }) {
  let next = state;
  const amount = Math.max(0, rawAmount || 0);
  // KW-POISON (CR 702.90 infect / 702.79 wither): a source with infect/wither replaces ALL the damage it
  // deals — NOT just combat — to a creature as that many -1/-1 counters, and (infect only) to a player as
  // that many poison counters. `source.id` is the permanent dealing the damage (ctx.sourceId, threaded for
  // activated/triggered abilities); its keywords are read from the PRE-damage state. A spell or a sourceless
  // effect has no permanent source → it routes normally (spell-source infect/wither stays unclaimed — a safe
  // false-negative, never an FP). Gated on the keyword, so every ordinary burn source is byte-for-byte.
  const sourceInfect = source?.id ? permanentHasKeyword(next, source.id, "Infect") : false;
  const sourceWither = source?.id ? permanentHasKeyword(next, source.id, "Wither") : false;
  const hitPlayer = (s, pid) => sourceInfect
    ? addPoison(s, { playerId: pid, amount })
    : loseLife(s, { playerId: pid, amount });
  const hitCreature = (s, permId) => (sourceInfect || sourceWither)
    ? addCounter(s, { permanentId: permId, type: "-1/-1", amount })
    : markCombatDamage(s, { permanentId: permId, amount });
  // A 0-damage effect deals no damage (no marks, no counters, no poison — CR 120.8); guard so an infect
  // source can't stamp a stray "-1/-1": 0 counter. The lethal SBA + log below still run for parity.
  if (amount > 0) {
    if (targetType === "eachOpponent") {
      for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = hitPlayer(next, opp);
    } else if (targetType === "eachCreature") {
      for (const pid of Object.keys(next.players)) {
        for (const perm of next.players[pid].battlefield) {
          if (isCreature(perm.card)) next = hitCreature(next, perm.id);
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
        else if (t.type === "planeswalker" && findPermanent(next, t.id)) next = adjustLoyalty(next, { permanentId: t.id, delta: -amount });
      }
    }
  }
  const dmgResult = destroyLethalCreatures(next);
  next = checkDiesTriggers(dmgResult.state, dmgResult.dead);
  // PW-6: a planeswalker driven to 0 loyalty by the damage is put into the graveyard (CR 704.5i).
  next = destroyZeroLoyaltyPlaneswalkers(next).state;
  return logEvent(next, { kind: "spell-effect", effect: "damage", controller, amount, targets: targets.map(t => t.id) });
}

/**
 * Apply a parsed effect on resolution. Returns a new state. Damage runs the
 * shared lethal SBA so creatures it kills hit the graveyard. Delegates to the
 * per-effect helpers above (which the EffectProgram atoms also use).
 */
export function resolveSpellEffect(state, { effect, controller, targets = [] }) {
  if (!effect) return state;
  if (effect.kind === "draw") return applyDrawEffect(state, { controller, amount: effect.amount });
  if (effect.kind === "destroy") return applyDestroyEffect(state, { controller, targets });
  if (effect.kind === "damage") {
    return applyDamageEffect(state, { controller, amount: effect.amount, targetType: effect.targetType, targets });
  }
  return state;
}
