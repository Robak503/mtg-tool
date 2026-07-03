/**
 * kiraTargetCounter.js — KIRA, GREAT GLASS-SPINNER (a HARD-counter group-ward analogue with a per-turn gate).
 *
 * "Creatures you control have \"Whenever this creature becomes the target of a spell or ability for the first
 * time each turn, counter that spell or ability.\"" This is the DIRECT sibling of Diffusion Sliver (groupWard.js):
 * a board static that confers, to a GROUP of the controller's creatures, a becomes-target (CR 603.2) trigger
 * that counters the targeting spell/ability. Three differences from groupWard, each modeled faithfully here:
 *
 *   1. HARD counter — there is NO "unless its controller pays" escape. So instead of the soft-counter
 *      pay-or-be-countered pending-choice groupWard/ward raise, this counters the stack object OUTRIGHT via the
 *      shared hard-counter path (counterSpellById — the SAME primitive a printed counterspell / ward-decline
 *      uses; it removes a spell to its owner's graveyard and an ability off the stack with no zone change).
 *   2. NO opponent restriction — Kira fires for ANY spell or ability that targets your creature, INCLUDING
 *      your own (CR 603.2 makes no controller distinction; unlike ward/Diffusion which are opponent-only). So a
 *      player pinging / pumping their OWN Kira-protected creature the first time each turn gets that spell
 *      countered too — a real, well-known Kira gotcha, modeled honestly.
 *   3. "For the first time each turn" — a PER-CREATURE, PER-TURN gate. Each creature counters only the FIRST
 *      spell/ability to target it each turn; the second targeting resolves normally. Tracked with a
 *      per-permanent `becameTargetThisTurn` flag: set (unconditionally, for EVERY targeted creature) at the
 *      becomes-target chokepoint, read BEFORE it is set to decide the counter, and cleared for all permanents
 *      of all players at each turn's untap step (resetBecameTargetThisTurnAllPlayers, gameState.js).
 *
 * TIMING APPROXIMATION (identical to ward.js / groupWard.js, an accepted CREED model): the real trigger goes on
 * the stack ABOVE the targeting object and counters it on resolution (CR 603.3b). This hook counters SYNCHRONOUSLY
 * at the cast / activated-ability / loyalty-ability chokepoint, right after the object is placed and its targets
 * are chosen. The OBSERVABLE OUTCOME is byte-identical — the targeting spell/ability is countered and never
 * resolves — which is exactly the approximation ward's soft-counter and Diffusion's group-ward already ship.
 *
 * MULTI-TARGET (CR 603.2 / 603.3b): when one object targets several of your creatures, EACH becomes a target
 * simultaneously and each triggers; the first trigger to resolve counters the whole object and the rest fizzle
 * harmlessly. So we counter the object iff AT LEAST ONE targeted creature is Kira-eligible-and-fresh, and we
 * mark ALL targeted creatures as having-become-a-target this turn (they all did). Countering removes the whole
 * stack object — never a partial resolve.
 *
 * SCOPE — only the canonical Kira sentence is modeled (anchored whole-quoted-body). A subtype-restricted variant
 * ("Sliver creatures you control have …"), an opponent-restricted variant (that IS Diffusion → groupWard.js), a
 * pay-rider, or any other becomes-target grant → NOT this module (a safe false-negative). isNativeKira is
 * all-or-nothing: the card's only non-keyword text must be exactly this grant, or it stays body-only.
 *
 * Pure: regex + board reads for the parse/decision; the flag-set + counter are explicit state transforms.
 */

import { findPermanent } from "./gameState.js";
import { permanentIsCreature } from "./layers.js";
import { counterSpellById } from "./effects/atoms/stack.js";

// The canonical Kira grant sentence → true/false. Reminder text (CR 207.2) is parenthetical and stripped; the
// match is lowercased. ANCHORED to a WORD-START "Creatures you control have" (the leading (?<![A-Za-z] )
// lookbehind rejects a subtype prefix — "Sliver creatures you control have …" is a DIFFERENT, narrower card,
// not matched here) and to the exact becomes-target-first-time-each-turn + counter body (no "unless … pays",
// no "an opponent controls" — that opponent-restricted, pay-rider shape is Diffusion Sliver → groupWard.js).
const RE_KIRA_GRANT =
  /(?<![a-z] )creatures you control have "whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability\.?"/i;

/** Does this card carry the modeled Kira group-grant sentence? Pure (regex + reminder strip). */
export function hasKiraGrant(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  return RE_KIRA_GRANT.test(oracle);
}

/** Does `playerId` control a Kira-style group-grant source right now? (Scans that player's battlefield.) */
function controlsKira(state, playerId) {
  for (const perm of state.players?.[playerId]?.battlefield || []) {
    if (hasKiraGrant(perm?.card)) return true;
  }
  return false;
}

/**
 * KIRA enforcement at a target-choice chokepoint. Given a `stackObj` (a spell OR an activated/triggered/loyalty
 * ability, already on the stack with chosen `targets`), returns the next state:
 *   - For EVERY targeted permanent that is a creature, mark `becameTargetThisTurn = true` (it became a target
 *     this turn — CR 603.2; done for all such creatures regardless of Kira, so the "first time each turn" gate
 *     is honest even for creatures whose controller has no Kira).
 *   - If AT LEAST ONE targeted creature (a) is controlled by a player who controls a Kira source AND (b) had NOT
 *     yet become a target this turn (its pre-existing flag was falsy), COUNTER the whole stack object
 *     (counterSpellById) — the first such trigger counters it, the rest fizzle (CR 603.3b).
 * The flag is read from the pre-existing permanent state (before this call sets it), so a single object targeting
 * two fresh Kira creatures still counters (both were fresh). A no-op when the object targets no creature or no
 * targeted creature is Kira-eligible-and-fresh. Pure — returns a new state, never mutates.
 */
export function applyKiraTargetCounter(state, stackObj) {
  const targets = stackObj?.targets || [];
  if (!targets.length) return state;
  // Collect the distinct targeted CREATURE permanents (by id) and whether each was already targeted this turn.
  const seen = new Set();
  const creatures = []; // { id, wasFresh, controller }
  for (const t of targets) {
    if (!t || !t.id || seen.has(t.id)) continue;
    // Only PERMANENT-typed targets can be creatures on the battlefield (a player/spell/card target never is).
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(state, t.id);
    if (!lk?.permanent) continue; // target already gone (a fizzled earlier target) — skip
    if (!permanentIsCreature(state, t.id)) continue; // Kira grants only to CREATURES you control (layer-aware)
    seen.add(t.id);
    creatures.push({ id: t.id, wasFresh: !lk.permanent.becameTargetThisTurn, controller: lk.controller });
  }
  if (!creatures.length) return state;

  // Decide the counter from the PRE-EXISTING freshness (before we set the flag below): counter iff some targeted
  // creature is fresh AND its controller controls a Kira source.
  const shouldCounter = creatures.some((c) => c.wasFresh && controlsKira(state, c.controller));

  // Mark every targeted creature as having become a target this turn (CR 603.2 — they all did, regardless of
  // Kira / of whether the object gets countered). One battlefield map per affected controller.
  let next = state;
  const ids = new Set(creatures.map((c) => c.id));
  const affectedControllers = new Set(creatures.map((c) => c.controller));
  for (const pid of affectedControllers) {
    const player = next.players[pid];
    if (!player) continue;
    next = {
      ...next,
      players: {
        ...next.players,
        [pid]: {
          ...player,
          battlefield: player.battlefield.map((p) =>
            ids.has(p.id) ? { ...p, becameTargetThisTurn: true } : p,
          ),
        },
      },
    };
  }

  if (shouldCounter) {
    next = counterSpellById(next, stackObj.id, { via: "kira" });
  }
  return next;
}

/**
 * Is this a native KIRA-style group-target-counter card? Its whole non-reminder text, minus the modeled grant
 * sentence, must be KEYWORD-ONLY (so Kira's own "Flying" is honored — a modeled body keyword — while any
 * UNMODELED extra clause leaves residue → body-only, THE CREED all-or-nothing). `isKeywordOnly` is injected to
 * keep this module a leaf (the same predicate the dispatch body uses). The runtime (applyKiraTargetCounter at
 * the three chokepoints) enforces the grant, so crediting it native is honest. Pure.
 */
export function isNativeKira(card, isKeywordOnly) {
  if (!hasKiraGrant(card)) return false;
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  // Strip reminder text + the matched grant sentence; the residue must be keyword-only (Flying, etc.).
  const residue = oracle.replace(/\([^)]*\)/g, " ").replace(RE_KIRA_GRANT, " ");
  return isKeywordOnly(residue, card?.name);
}
