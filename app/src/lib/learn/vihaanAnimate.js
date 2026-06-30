/**
 * vihaanAnimate.js — Vihaan, Goldwaker's begin-combat mass-animate of Treasures:
 *   "At the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct
 *    Assassin artifact creatures in addition to their other types until end of turn."
 *
 * WHY A TARGETED HOOK (the urDragonAttack.js / xCastToken.js / #319 precedent):
 *   The begin-combat TRIGGER itself is detected (triggerScheduler.detectPhaseTrigger → event "combatBegin",
 *   whose "yours"), but its EFFECT can't ride the generic trigger machinery:
 *     - "you may have Treasures you control become a N/N … creature" is a MASS, optional, SUBJECT-scoped
 *       (every Treasure you control) layer-4 type-change. parseEffectClause/parseTriggerEffect model only the
 *       single-TARGET "target land becomes a N/N creature" animate atom (effects/atoms/combat.js) — there is no
 *       mass-animate-your-permanents atom — so the clause parses LOW and the flush path (which re-parses a
 *       pending trigger's clause) would fail to apply anything.
 *   So this is a SELF-CONTAINED synchronous hook that builds + applies the continuous effects DIRECTLY, with
 *   ZERO change to detectTriggers / parseEffectClause. It REUSES the SHIPPED WALT-ANIMATE framework (#274/#277/
 *   #281): the exact layer-4 (ADD Creature + the named card types/subtypes, additive — "in addition to their
 *   other types") + layer-7b (SET base P/T) + (no keyword riders here) continuous-effect emission that
 *   applyAnimateEffect performs per target, here looped over every Treasure the active player controls. The
 *   PR1 framework already makes each now-creature Treasure a full combat participant (attack/block/deal+take
 *   damage/die to the SBA), and expireContinuousEffects wears the whole effect off at cleanup (CR 514.2).
 *
 * CR: 508.x (a "beginning of combat on your turn" trigger fires for the active player); 613.1d (layer 4 type-
 * changing — additive, the Artifact/other types are kept); 613.1g/613.4 (layer 7b base-P/T set); 514.2 (the
 * "until end of turn" effects expire at cleanup). "you may": the optional is auto-TAKEN (a benign value play —
 * an under-model of the human's interactive decline, but NEVER a fabrication or a dropped clause; mirrors the
 * urDragon hook's auto-take of its optional cheat). A controller with no Treasures animates nothing (no-op).
 *
 * Self-contained + pure (returns a new state). Fired at the beginning-of-combat step for the ACTIVE player,
 * alongside the combatBegin step trigger (gameEngine). ADDITIVE only — no core surgery; isolated to this module
 * + one wiring line in gameEngine + one additive coverage classifier.
 */
import { addContinuousEffect } from "./layers.js";
import { logEvent, findPermanent } from "./gameState.js";

// Anchored to the WHOLE Vihaan templating so no other card false-matches. Captures P/T (N/N) and the descriptor
// words between the P/T and "creature" (the added card types + subtypes — "Construct Assassin artifact"); the
// "in addition to their other types until end of turn" tail is required (it's what makes the animate additive +
// temporary). Reminder text is stripped before matching. A PERMANENT (no "until end of turn") or a non-"you
// control" / non-Treasure subject fails the anchor → null → not ours (the card stays on the Arbiter — CREED).
const VIHAAN_ANIMATE =
  /at the beginning of combat on your turn, you may have treasures you control become (\d+)\/(\d+) ([a-z ]+?) ?creatures? in addition to their other types until end of turn/i;

// Card-type words (CR 300.1) that can appear in the descriptor — split into layer-4 card TYPES vs creature
// SUBTYPES. "creature" itself is the anchor word (consumed by the regex), never in the descriptor. Lowercased.
const CARD_TYPE_WORDS = new Set(["artifact", "enchantment", "land"]);

/**
 * Parse a card's Vihaan-style begin-combat mass-Treasure-animate. Returns the animate shape
 * { power, toughness, cardTypes, subtypes } (capitalized, additive), or null when the card doesn't carry the
 * exact templating. cardTypes = the descriptor's card-type words (e.g. ["Artifact"]); subtypes = the rest
 * (e.g. ["Construct","Assassin"]). Treasures are already artifacts, so an "artifact" cardType is a harmless
 * additive no-op (mirrors applyAnimateEffect's additive layer-4 "still a land" handling).
 */
export function parseVihaanCombatAnimate(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(VIHAAN_ANIMATE);
  if (!m) return null;
  const power = parseInt(m[1], 10);
  const toughness = parseInt(m[2], 10);
  const words = m[3].trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null; // a bare "become N/N creatures" with no descriptor is out of this shape
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const cardTypes = [];
  const subtypes = [];
  for (const w of words) {
    if (CARD_TYPE_WORDS.has(w.toLowerCase())) cardTypes.push(cap(w));
    else subtypes.push(cap(w));
  }
  return { power, toughness, cardTypes, subtypes };
}

/** Does an artifact Treasure live on `perm`? (type-line subtype "Treasure", token or printed). */
function isTreasure(perm) {
  return /\btreasure\b/i.test(String(perm?.card?.type || perm?.card?.type_line || ""));
}

/**
 * At the beginning-of-combat step, each Vihaan-style watcher the ACTIVE player controls makes every Treasure
 * that player controls become a P/N <types/subtypes> creature until end of turn — the SHIPPED WALT-ANIMATE
 * layer-4 (ADD Creature + the named card types/subtypes, additive) + layer-7b (SET base P/T) continuous-effect
 * pair, exactly as applyAnimateEffect emits per target, looped over the player's Treasures. Optional ("you
 * may") → auto-taken. A player with no Treasures animates nothing. Fires for the ACTIVE player only (the
 * trigger reads "on your turn"). Pure (returns a new state). ADDITIVE: a board with no Vihaan-style watcher
 * is byte-identical (the watchers list is empty → no effects added).
 */
export function applyVihaanCombatAnimate(state) {
  const pid = state?.activePlayer;
  const player = state?.players?.[pid];
  if (!player) return state;
  const watchers = (player.battlefield || []).filter((perm) => parseVihaanCombatAnimate(perm.card));
  if (!watchers.length) return state;
  let next = state;
  for (const watcher of watchers) {
    const spec = parseVihaanCombatAnimate(watcher.card);
    const src = { kind: "resolution", permanentId: watcher.id, cardName: watcher.card?.name || null };
    // Layer-4 types: Creature plus any named card type (additive — the Artifact/other types are kept, "in
    // addition to their other types"). Re-read the player's Treasures fresh inside the loop is unnecessary (a
    // second Vihaan would re-animate the SAME set, an idempotent no-op on already-3/3 creatures), but snapshot
    // up front for determinism.
    const animateTypes = ["Creature", ...spec.cardTypes];
    const treasures = (next.players[pid].battlefield || []).filter(isTreasure);
    for (const treas of treasures) {
      if (!findPermanent(next, treas.id)) continue; // defensive — a Treasure that left between iterations
      const dur = { kind: "endOfTurn", turn: next.turn };
      next = addContinuousEffect(next, {
        layer: 4,
        op: { types: animateTypes, subtypes: spec.subtypes },
        affects: { mode: "fixed", permanentIds: [treas.id] },
        duration: dur, source: src,
      }).state;
      next = addContinuousEffect(next, {
        layer: 7, sublayer: "7b",
        op: { layerOp: "ptSet", power: spec.power, toughness: spec.toughness },
        affects: { mode: "fixed", permanentIds: [treas.id] },
        duration: { kind: "endOfTurn", turn: next.turn }, source: src,
      }).state;
    }
    next = logEvent(next, { kind: "vihaan-animate-treasures", controller: pid, power: spec.power, toughness: spec.toughness, count: treasures.length });
  }
  return next;
}
