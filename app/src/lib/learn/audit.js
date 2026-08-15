/**
 * audit.js — THE INVARIANT AUDITOR, phase 3 of the SUBSYSTEM QUARTET (plan + gates in
 * docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md).
 *
 * THE GAP: witnesses prove mechanics in isolation; nothing checks GLOBAL state health mid-game. A
 * silently duplicated card, an orphaned attachment, or a negative counter survives every per-card
 * test and corrupts games invisibly. auditState is the sweep: PURE, read-only, returns a violations
 * array (empty = healthy) — each violation a plain string naming what and where, so a throw at the
 * dispatch hook reads as a diagnosis, not a stack trace.
 *
 * STAGING (the default-off law, applied to a QUALITY gate): the dispatcher hook is env-gated
 * (MTG_AUDIT=1) and OFF by default; the always-on-in-tests flip waits until the backfill (the full
 * suite + seeded games run audit-clean) proves the corpus of hand-built witness states honest —
 * flipping first would fail hundreds of files on harness shortcuts rather than engine bugs.
 *
 * INVARIANTS (each with a seen-to-fail witness — an audit that never fires is a hollow gate):
 *   1. ONE-ZONE-PER-CARD: a card id appears in exactly one zone across all players' library / hand /
 *      graveyard / exile / command + every battlefield permanent's card + stack spell cards.
 *      (restrictedMana is MANA, not cards — never scanned.)
 *   2. ATTACHMENT SYMMETRY: attachedTo ↔ attachments agree both ways, and both ends exist.
 *   3. COUNTERS ≥ 0, integer.
 *   4. LIFE + MANA POOLS numeric (pools also ≥ 0).
 *   5. BATTLEFIELD SHAPE: every permanent has an id and a card.
 *   6. STACK SHAPE: every stack object has an id and a controller.
 *   7. DELAYED RECORDS: every delayedTriggers record has a fireStep from the known vocabulary and a
 *      non-empty effectClause.
 */

import { DELAYED_FIRE_STEPS } from "./effects/atoms/delayedTrigger.js"; // the one shared step vocabulary

const CARD_ZONES = ["library", "hand", "graveyard", "exile", "command"];

/** Pure sweep — returns [] when healthy, else one string per violation. */
export function auditState(state) {
  const v = [];
  if (!state?.players) return ["no players object"];

  // 1. ONE-ZONE-PER-CARD — SCOPED TO WHERE ID COLLISIONS CAN ACTUALLY BITE (the backfill's first real
  // find, 2026-08-15): the self-play deck builder mints ids like "deck-Forest-1" that legitimately
  // repeat across DIFFERENT players' libraries — a harness convention, and benign there because every
  // state-level card-id lookup on hidden zones is player-scoped (moveCardToZone, bottomLibraryCardsByIds
  // — all take a playerId). So hidden-zone uniqueness is checked PER PLAYER; the BATTLEFIELD and the
  // STACK — where cross-player interaction by id is real — share one GLOBAL map. A card in a hidden
  // zone AND on the shared board is likewise caught globally.
  const globalSeen = new Map(); // battlefield + stack: cardId -> where
  const noteGlobal = (id, where) => {
    if (id == null) return;
    if (globalSeen.has(id)) v.push(`card ${id} in two zones: ${globalSeen.get(id)} AND ${where}`);
    else globalSeen.set(id, where);
  };
  for (const [pid, p] of Object.entries(state.players)) {
    const seen = new Map(); // this player's hidden zones: cardId -> where
    const note = (id, where) => {
      if (id == null) return;
      if (seen.has(id)) v.push(`card ${id} in two zones: ${seen.get(id)} AND ${where}`);
      else seen.set(id, where);
    };
    for (const zone of CARD_ZONES) {
      for (const c of p[zone] || []) note(c?.id, `${pid}.${zone}`);
    }
    for (const perm of p.battlefield || []) {
      // 5. BATTLEFIELD SHAPE
      if (!perm?.id) v.push(`${pid}.battlefield: a permanent with no id`);
      if (!perm?.card) v.push(`${pid}.battlefield: permanent ${perm?.id} has no card`);
      else { noteGlobal(perm.card.id, `${pid}.battlefield(${perm.id})`); note(perm.card.id, `${pid}.battlefield(${perm.id})`); }
      // 3. COUNTERS
      for (const [k, n] of Object.entries(perm?.counters || {})) {
        if (!Number.isInteger(n) || n < 0) v.push(`${pid}.battlefield(${perm.id}): counter "${k}" = ${n}`);
      }
    }
    // 4. LIFE + POOLS
    if (typeof p.life !== "number" || Number.isNaN(p.life)) v.push(`${pid}.life = ${p.life}`);
    for (const [c, n] of Object.entries(p.manaPool || {})) {
      if (typeof n !== "number" || Number.isNaN(n) || n < 0) v.push(`${pid}.manaPool.${c} = ${n}`);
    }
  }
  for (const so of state.stack || []) {
    // 6. STACK SHAPE
    if (!so?.id) v.push("stack: an object with no id");
    if (!so?.controller) v.push(`stack(${so?.id}): no controller`);
    if (so?.card?.id && !so?.isCopy) noteGlobal(so.card.id, `stack(${so.id})`);
  }

  // 2. ATTACHMENT SYMMETRY — over the whole battlefield space.
  const perms = new Map();
  for (const p of Object.values(state.players)) for (const perm of p.battlefield || []) if (perm?.id) perms.set(perm.id, perm);
  for (const perm of perms.values()) {
    if (perm.attachedTo != null) {
      const host = perms.get(perm.attachedTo);
      if (!host) v.push(`attachment ${perm.id}: attachedTo ${perm.attachedTo} does not exist`);
      else if (!(host.attachments || []).includes(perm.id)) v.push(`attachment ${perm.id}: host ${perm.attachedTo} does not list it`);
    }
    for (const attId of perm.attachments || []) {
      const att = perms.get(attId);
      if (!att) v.push(`host ${perm.id}: attachment ${attId} does not exist`);
      else if (att.attachedTo !== perm.id) v.push(`host ${perm.id}: attachment ${attId} points at ${att.attachedTo}`);
    }
  }

  // 7. DELAYED RECORDS
  for (const rec of state.delayedTriggers || []) {
    if (!DELAYED_FIRE_STEPS.includes(rec?.fireStep)) v.push(`delayed ${rec?.id}: bad fireStep "${rec?.fireStep}"`);
    if (!String(rec?.effectClause || "").trim()) v.push(`delayed ${rec?.id}: empty effectClause`);
  }
  return v;
}
