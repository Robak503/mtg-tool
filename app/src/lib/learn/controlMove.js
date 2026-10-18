/**
 * controlMove.js — the ONE way a permanent changes controller (CR 613.1b layer-2 / CR 302.6).
 *
 * WHY THIS EXISTS. The move was written twice: once in `effects/atoms/control.js` (the indefinite
 * gain-control atom — Sliver Overlord) and once in `controlAura.js` (the while-attached control Auras —
 * Mind Control). The second copy was a DELIBERATE debt, taken to avoid destabilising a proven atom in the
 * middle of a build, and recorded as such at the time. This closes it: both callers now share one body, so
 * a fix to how control moves cannot land on one and miss the other.
 *
 * ⛔ AN ARRAY SPLICE, NOT `moveCardToZone`, and that distinction is the whole correctness of it. The
 * creature never LEAVES the battlefield when it changes hands, so:
 *   · no dies/LTB trigger fires (a creature that only changed controller has not died);
 *   · its identity survives, so every `attachedTo` back-reference pointing at it stays valid;
 *   · tapped state, counters, marked damage and attachments all ride along untouched (CR 303.4e / 301.5d —
 *     changing control of a creature does not change control of an Aura or Equipment attached to it).
 * The one thing that DOES change besides the controller is summoning sickness: it has not been under the
 * new controller's control since their turn began, so it is sick under them (CR 302.6) and untaps/clears
 * on their next untap step exactly like a freshly-entered creature.
 *
 * ⛔ OWNERSHIP NEVER MOVES. A control change does not change the owner (CR 110.2 — a permanent's owner is
 * the owner of the card that represents it; a token's owner is the player who created it, CR 111.2). The
 * engine records ownership sparsely: a permanent carries an `owner` field only when it may differ from the
 * player whose battlefield holds it (a cross-player entry stamps it — zones.enterCardFromZone,
 * resolvers.enterPermanent), and an absent field means "owned by the player whose battlefield this is". A
 * splice into ANOTHER player's battlefield breaks that reading unless the move writes the owner down, so
 * every move here stamps `owner` — the existing stamp if there is one, else the player it is leaving (who,
 * by that same convention, is its owner). Without it a stolen permanent that later left the battlefield went
 * to its CONTROLLER's graveyard, hand or library instead of its owner's (CR 400.3), and Homeward Path, the
 * owner-control blinks and Chaos Warp all read the thief as the owner. The stamp is written AFTER `extra`
 * so no caller can overwrite it, and it is kept when control later returns home (owner === controller is
 * the same fact the absent field encodes, and every reader compares values rather than testing presence).
 * One fallback sits between the two: a permanent that carries the control stash (`controlOriginal`) but no
 * stamp can only come from a game saved before the stamp existed (the stash is written in the same move as
 * the stamp now). It is away from home, so the seat it is leaving is the thief; `controlOriginal` — the
 * controller before the first theft, which for an unstamped permanent is its owner — is the owner to write
 * on its next move, home or to another thief.
 *
 * ⛔ REMOVED FROM COMBAT (CR 506.4 — "A permanent is removed from combat … if its controller changes"). A creature
 * that changes hands mid-combat stops attacking or blocking. An attacker loses its state.combat.attackers record (no
 * block is offered against it, it deals no combat damage, and its new controller may block with it if it is untapped);
 * a blocker keeps its block records — the attacker it blocked remains blocked, CR 509.1h — and is stamped
 * `removedFromCombat`, which combat damage and every "blocking creature" read honor (combatRemoval.js).
 *
 * ⛔ ONE IMPORT, AND IT IS A ZERO-IMPORT LEAF. `controlAura.js` calls this and is itself called from `gameState.js`,
 * the lowest layer — any other import here would risk a cycle back into that. combatRemoval.js imports nothing, so
 * the graph stays acyclic. Pure data in, pure data out; no closures, so a game serialized mid-resolution restores
 * byte-identical.
 *
 * Callers keep what is THEIRS: the gain-control atom keeps its own event log and soulbond teardown. Only the move
 * itself, and the record of which control effects hold a permanent (below), are shared.
 *
 * ⭐ THE CONTROL-EFFECT RECORD (CR 613.1b layer 2, CR 613.7 timestamps). Control-changing effects apply in timestamp
 * order, so the LATEST control effect still in force decides who controls a permanent. A permanent held by a
 * TEMPORARY effect carries two fields:
 *   · `controlEffects` — the temporary effects on it, oldest first: { to, until: "end-of-turn" } (a threaten — ends in
 *     the cleanup step, CR 514.2) or { to, aura: <Aura id> } (a control Aura — ends when that Aura stops being attached;
 *     a re-attach is a new timestamp, CR 613.7e, so it moves to the end);
 *   · `controlOriginal` — who controls it once every one of them has ended: the player it entered under (CR 110.2) or
 *     the controller an indefinite effect gave it to.
 * Ending an effect hands the permanent to the latest REMAINING effect's controller (endControlEffects), not straight
 * home. An INDEFINITE effect (no duration stated, CR 611.2a — Sliver Overlord, Hellkite Tyrant, Homeward Path) is
 * later than every effect on the permanent and never ends, so nothing beneath it can matter again: it clears the
 * record (gainControlIndefinitely). A player who leaves the game takes the effects that gave them control with them
 * (CR 800.4a), so their entries are skipped when the controller is worked out. Both fields are absent on a permanent no
 * temporary effect holds. An effect that gives control to whoever already has it, with nothing beneath it to end, is
 * not recorded: it could never change the outcome.
 * A game saved before this record existed carries the single-level stash instead (`controlUntilEndOfTurn: true` or
 * `controlStolenBy: <Aura id>`); controlEffectsOf reads it as the equivalent list, and the next write replaces it.
 */
import { withoutAttackerRecord, hasBlockerRecord } from "./combatRemoval.js";

/** The `until` value of an "until end of turn" control effect (a threaten), ended by the cleanup sweep. */
export const UNTIL_END_OF_TURN = "end-of-turn";

/**
 * Move `permId` to `toController`'s battlefield. Returns the state unchanged when the permanent cannot be
 * found, is already there, or either seat has left the game (CR 800.4a) — never a throw, so a caller mid-
 * resolution degrades to a clean no-op rather than aborting the game.
 *
 * @param extra extra fields to stamp on the moved permanent (the Aura path's control stash).
 */
export function moveControl(state, permId, toController, extra = {}) {
  const players = state?.players || {};
  let from = null;
  for (const pid of Object.keys(players)) {
    if ((players[pid]?.battlefield || []).some((p) => p?.id === permId)) { from = pid; break; }
  }
  if (from == null || from === toController) return state;
  const fromPlayer = players[from];
  const toPlayer = players[toController];
  if (!fromPlayer || !toPlayer) return state;
  const perm = fromPlayer.battlefield.find((p) => p.id === permId);
  if (!perm) return state;
  // OWNER (CR 110.2 / 400.3 — see the header): the existing stamp, else (a pre-stamp save) the stashed original controller,
  // else the seat it is leaving. Last, so `extra` can't replace it.
  // A BLOCKER is stamped out of combat (CR 506.4, see the header); its block records stay.
  const blocking = hasBlockerRecord(state, permId) ? { removedFromCombat: true } : {};
  const moved = { ...perm, controller: toController, summoningSick: true, ...blocking, ...extra, owner: perm.owner ?? perm.controlOriginal ?? from };
  // An ATTACKER's record leaves state.combat.attackers (CR 506.4, see the header).
  return withoutAttackerRecord({
    ...state,
    players: {
      ...players,
      [from]: { ...fromPlayer, battlefield: fromPlayer.battlefield.filter((p) => p.id !== permId) },
      [toController]: { ...toPlayer, battlefield: [...toPlayer.battlefield, moved] },
    },
  }, permId);
}

/** Which player currently controls `permId`? null when it is not on any battlefield. Shared so callers
 *  agree on what "where is it now" means. */
export function controllerOfPermanent(state, permId) {
  for (const pid of Object.keys(state?.players || {})) {
    if ((state.players[pid]?.battlefield || []).some((p) => p?.id === permId)) return pid;
  }
  return null;
}

/** The seat whose battlefield holds `permId`, and the permanent; null when it is on no battlefield. */
function locate(state, permId) {
  for (const pid of Object.keys(state?.players || {})) {
    const perm = (state.players[pid]?.battlefield || []).find((p) => p?.id === permId);
    if (perm) return { pid, perm };
  }
  return null;
}

/**
 * The temporary control effects holding `perm`, oldest first (see the header). A pre-record save's single-level stash
 * reads as the same list: the stealing Aura's effect (its controller as it is now — or, once it is off the battlefield,
 * as it is leaving, the permanent's own), then the threaten on top of it.
 */
export function controlEffectsOf(state, perm) {
  if (!perm) return [];
  if (Array.isArray(perm.controlEffects)) return perm.controlEffects;
  const legacy = [];
  if (perm.controlStolenBy) legacy.push({ to: controllerOfPermanent(state, perm.controlStolenBy) ?? perm.controller, aura: perm.controlStolenBy });
  if (perm.controlUntilEndOfTurn) legacy.push({ to: perm.controller, until: UNTIL_END_OF_TURN });
  return legacy;
}

/** Write the record onto the permanent in place: both fields when `effects` is non-empty, neither when it is empty (the
 *  pre-record fields are dropped either way). */
function restamp(state, permId, home, effects) {
  const at = locate(state, permId);
  if (!at) return state;
  const { controlOriginal: _home, controlEffects: _effects, controlUntilEndOfTurn: _legacyEot, controlStolenBy: _legacyAura, ...rest } = at.perm;
  const perm = effects.length ? { ...rest, controlOriginal: home, controlEffects: effects } : rest;
  const bf = state.players[at.pid].battlefield.map((p) => (p.id === permId ? perm : p));
  return { ...state, players: { ...state.players, [at.pid]: { ...state.players[at.pid], battlefield: bf } } };
}

/**
 * A TEMPORARY control effect begins (a threaten, or a control Aura becoming attached): it is the latest, so its player
 * controls the permanent now; it goes on the end of the record. An Aura already in the record is taken out first (a
 * re-attach is a new timestamp, CR 613.7e). No-op when the permanent or the player is gone (CR 800.4a), or when nothing
 * beneath the effect could ever end and its player already controls the permanent.
 */
export function addControlEffect(state, permId, effect) {
  const at = locate(state, permId);
  if (!at || !effect?.to || !state.players?.[effect.to]) return state;
  const prior = controlEffectsOf(state, at.perm).filter((e) => !(effect.aura && e.aura === effect.aura));
  if (!prior.length && effect.to === at.pid) return state;
  const home = prior.length ? (at.perm.controlOriginal ?? at.pid) : at.pid;
  return restamp(moveControl(state, permId, effect.to), permId, home, [...prior, effect]);
}

/**
 * The temporary control effects `ends` selects end. The permanent goes to the latest remaining effect's controller
 * (CR 613.7), else to `controlOriginal`, skipping a player who has left the game (CR 800.4a); if every candidate has
 * left, it stays where it is. The record is rewritten (cleared when nothing remains). Same state when nothing ends.
 */
export function endControlEffects(state, permId, ends) {
  const at = locate(state, permId);
  if (!at) return state;
  const effects = controlEffectsOf(state, at.perm);
  const remaining = effects.filter((e) => !ends(e));
  if (remaining.length === effects.length) return state;
  const home = at.perm.controlOriginal ?? at.pid;
  const players = state.players || {};
  const latest = [...remaining].reverse().find((e) => players[e.to]);
  const to = latest ? latest.to : (players[home] ? home : at.pid);
  return restamp(to === at.pid ? state : moveControl(state, permId, to), permId, home, remaining);
}

/**
 * An INDEFINITE control effect (no duration stated, CR 611.2a): `to` controls the permanent for the rest of the game
 * unless a later effect changes it, so the record is cleared — no earlier effect ending can move it again. When `to`
 * already controls it, only the record is cleared. No-op when the permanent or the player is gone (CR 800.4a).
 */
export function gainControlIndefinitely(state, permId, to) {
  const at = locate(state, permId);
  if (!at || !state.players?.[to]) return state;
  const held = controlEffectsOf(state, at.perm).length > 0 || at.perm.controlOriginal != null;
  if (at.pid === to && !held) return state;
  return restamp(moveControl(state, permId, to), permId, null, []);
}
