/**
 * effects/atoms/shared.js — STRICT LEAF shared helpers for the atom resolver family modules.
 *
 * Imports ONLY from gameState.js etc. — NEVER from a sibling atoms/* module, so the import graph
 * stays a DAG (shared <- everything). Pure move out of effectAtoms.js: target gatherers, count
 * engine, type predicates, and the token descriptor word sets.
 */

import { findPermanent, creaturePower, opponentsOf } from "../../gameState.js";

export const TOKEN_COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "and"]);
// ===== TOKENS ===== descriptor words that are SUPERTYPES / CARD TYPES, not creature subtypes —
// so "colorless thopter artifact" mints "Token Artifact Creature — Thopter" (not a bogus "Artifact"
// subtype) and "legendary spirit" mints "Token Legendary Creature — Spirit". Anything unrecognized
// falls through to a subtype (safe: the token is still a creature with the right P/T).
export const TOKEN_SUPERTYPE_WORDS = new Set(["legendary", "snow"]);
export const TOKEN_CARDTYPE_WORDS = new Set(["artifact", "enchantment"]);
export const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export const typeLineStr = (card) => String(card?.type || card?.type_line || "");
export const isCreatureCard = (card) => /Creature/.test(typeLineStr(card));
// MASS-NC type predicates — WORD-ANCHORED (\b) so an artifact/enchantment CREATURE or a creature-land is
// still swept ("Artifact Creature" / "Creature — … Land" each contain the whole word) WITHOUT a substring
// false match: an "Artifact — Lander" token is NOT a Land ("Lander" ≠ the word "Land"). Mirrors the
// engine's canonical type predicates in spellEffects.js (\bArtifact\b / \bEnchantment\b / \bLand\b).
export const isArtifactCard = (card) => /\bArtifact\b/.test(typeLineStr(card));
export const isEnchantmentCard = (card) => /\bEnchantment\b/.test(typeLineStr(card));
export const isLandCard = (card) => /\bLand\b/.test(typeLineStr(card));

/**
 * Every creature on EVERY battlefield, as target descriptors `{type:"creature", id,
 * controller}`. The "all creatures" target set for a MASS atom (`targetType:"eachCreature"`
 * — board wipes: destroy/exile/-X-X all). The order is players-then-battlefield (stable,
 * serialize-deterministic). The mass resolvers feed this into the SAME per-effect helpers a
 * targeted spell uses, so dies-triggers fire once for the simultaneous deaths (CR 700.4 /
 * 603.10a captured pre-move in applyDestroyEffect; one lethal SBA in applyPumpEffect).
 */
export function massCreatureTargets(state) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (isCreatureCard(perm.card)) out.push({ type: "creature", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * MASS-NC — every permanent matching `matches(card)` on EVERY battlefield, as `{type:"permanent"}`
 * descriptors (the type applyDestroyEffect accepts; it re-checks isCreature for the CR 603.10a dies
 * look-back, so an artifact/enchantment CREATURE swept this way still dies + fires its dies-trigger).
 * Mirrors massCreatureTargets for "destroy all artifacts / enchantments / lands".
 */
export function massPermanentTargets(state, matches) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (matches(perm.card)) out.push({ type: "permanent", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * Every creature CONTROLLER controls right now, as target descriptors — the affected set for a
 * controller-scoped TEAM pump (`scope:"youControl"`: Overrun / Trumpet Blast). Gathered AT
 * RESOLUTION so applyPumpEffect locks the set into per-creature fixed effects (CR 611.2c — a
 * one-shot effect's set is fixed when it begins, NOT re-evaluated as creatures enter later).
 */
export function controllerCreatureTargets(state, controller) {
  const player = state.players?.[controller];
  if (!player) return [];
  return player.battlefield
    .filter((perm) => isCreatureCard(perm.card))
    .map((perm) => ({ type: "creature", id: perm.id, controller }));
}

/**
 * The atom's effective target list: every creature for a mass atom (`eachCreature`), every
 * creature the controller controls for a team pump (`scope:"youControl"`), else the chosen targets.
 */
export const atomTargets = (state, atom, ctx) => {
  if (atom.targetType === "eachCreature") return massCreatureTargets(state);
  if (atom.targetType === "eachArtifact") return massPermanentTargets(state, isArtifactCard);
  if (atom.targetType === "eachEnchantment") return massPermanentTargets(state, isEnchantmentCard);
  if (atom.targetType === "eachLand") return massPermanentTargets(state, isLandCard);
  if (atom.targetType === "eachArtifactOrEnchantment") return massPermanentTargets(state, (c) => isArtifactCard(c) || isEnchantmentCard(c));
  if (atom.scope === "youControl") return controllerCreatureTargets(state, ctx.controller);
  if (atom.target === "self") return selfTargets(state, ctx);
  return ctx.targets || [];
};

/**
 * The trigger/activated SOURCE permanent as a target list (for a "this creature gets …" self
 * effect, CR 109.2). ctx.sourceId is threaded from the trigger flush / activated dispatcher; a
 * spell has no source permanent, so a self atom there resolves to [] (a no-op, never a fabricated
 * effect). Only a CREATURE source is returned — "this creature" implies a creature.
 */
export function selfTargets(state, ctx) {
  const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  return lk && isCreatureCard(lk.permanent.card) ? [{ type: "creature", id: ctx.sourceId, controller: lk.controller }] : [];
}

// An X-amount atom (`amountX:true`, set by the parser for an {X}-cost spell) reads
// the chosen X (ctx.xValue, bound at cast time) instead of a printed numeric amount.
export const effectiveAmount = (atom, ctx) => (atom.amountX ? ctx.xValue || 0 : atom.amount);

// ===== DMG-SCALE ===== (WALT-DMG-SCALE) a board-count amount (`amountCount`, set by parseCountSource)
// is computed AT RESOLUTION from the CONTROLLER's current board/hand (CR 608.2g — a count-derived value
// is locked as the spell resolves, not at cast). Slice 1 sources: permanents you control by card TYPE
// (creature/land/artifact/enchantment) or basic-land SUBTYPE (Mountain/Forest/Island/Plains/Swamp), or
// cards in your hand. The matcher (countMatches) reads the same `card.type` line as isCreatureCard, so an
// Artifact Creature correctly counts for both "creatures" and "artifacts" (it IS both, CR 305.4-ish).
export function countMatches(card, spec) {
  const type = String(card?.type || card?.type_line || "");
  if (spec.subtype) return new RegExp(`\\b${spec.subtype}\\b`).test(type);   // basic-land subtype (Mountain…)
  // ===== TREASURE-MAKER ===== a UNION of card types — "artifacts and enchantments" (Dockside Extortionist).
  // A permanent matching ANY listed type counts ONCE (CR 305.4: an Artifact Creature that's also an
  // Enchantment still counts as one permanent). Each type is word-anchored, exactly like the single-type form.
  if (Array.isArray(spec.cardTypes)) {
    return spec.cardTypes.some((ct) => {
      const T = ct.charAt(0).toUpperCase() + ct.slice(1);
      return new RegExp(`\\b${T}\\b`).test(type);
    });
  }
  if (spec.cardType) {
    const T = spec.cardType.charAt(0).toUpperCase() + spec.cardType.slice(1); // creature → Creature
    return new RegExp(`\\b${T}\\b`).test(type);
  }
  return false;
}
export function countForSpec(state, ctx, spec) {
  // ===== TREASURE-MAKER ===== who:"opponents" sums the spec over ALL of the controller's opponents
  // ("the number of artifacts and enchantments your opponents control" — Dockside Extortionist). The
  // per-opponent count reuses the SAME spec (kind + cardType[s]/subtype) against each opponent's
  // battlefield, summed. Only permanentsYouControl is opponent-scopeable today (the parser only emits
  // who:"opponents" for that kind); any other kind under who:"opponents" sums 0 (a safe no-op).
  if (spec.who === "opponents") {
    let total = 0;
    for (const oppId of opponentsOf(state, ctx.controller)) {
      const opp = state?.players?.[oppId];
      if (!opp) continue;
      if (spec.kind === "permanentsYouControl") total += (opp.battlefield || []).filter((perm) => countMatches(perm.card, spec)).length;
    }
    return total;
  }
  // ===== OPPONENT-SCOPED ===== who:"target" counts the SPELL'S TARGET player ("…equal to the number of
  // cards in that player's hand" — Sudden Impact) OR, on a combat-damage trigger with no explicit target,
  // the DAMAGED player ("for each artifact that player controls" — Cavern-Hoard Dragon, where "that player"
  // is the player just dealt combat damage, carried as ctx.damagedPlayerId). The explicit spell target wins
  // when present (Sudden Impact path is byte-unchanged); else the damaged player. Everything else counts the
  // controller (the common case). A missing player → 0 (a safe no-op, never silently the controller's count).
  const playerId = spec.who === "target"
    ? (ctx.targets?.find((t) => t.type === "player")?.id ?? ctx.damagedPlayerId)
    : ctx.controller;
  const player = playerId ? state?.players?.[playerId] : null;
  if (!player) return 0;
  if (spec.kind === "cardsInHand") return (player.hand || []).length;
  if (spec.kind === "permanentsYouControl") return (player.battlefield || []).filter((perm) => countMatches(perm.card, spec)).length;
  // ===== FOR-EACH ===== cards in the controller's graveyard (raw card objects), optionally one card type.
  if (spec.kind === "cardsInGraveyard") return (player.graveyard || []).filter((c) => (spec.cardType ? countMatches(c, spec) : true)).length;
  // ===== EXPERIENCE ===== the controller's experience counter total (Toph, Command Beacon, etc.)
  if (spec.kind === "experienceCounters") return (player.experience || 0);
  // ===== OVERRUN-X ===== a MAX-reduction: the single greatest layer-resolved power among the controller's
  // creatures (Overwhelming Stampede). Reads creaturePower (layer-aware) so prior buffs/counters count; an
  // empty board → 0 (a safe +0/+0). Computed BEFORE applyPumpEffect adds the +X/+X, so X is the pre-buff max.
  if (spec.kind === "greatestPowerYouControl") {
    return (player.battlefield || [])
      .filter((perm) => /\bCreature\b/.test(String(perm.card?.type || perm.card?.type_line || "")))
      .reduce((mx, perm) => Math.max(mx, creaturePower(perm, state)), 0);
  }
  return 0;
}
// Resolved numeric amount: a board count (`amountCount`) × a per-unit value (FOR-EACH "gain 2 life for
// each X" → per 2; DMG-SCALE damage = the count itself → per defaults to 1), computed at resolution;
// else the X-amount (`amountX` → ctx.xValue) or the printed numeric amount.
export const resolveScaledAmount = (state, atom, ctx) => (atom.amountCount ? countForSpec(state, ctx, atom.amountCount) * (atom.amountCount.per ?? 1) : effectiveAmount(atom, ctx));
