/**
 * ascend.js — ASCEND and the city's blessing (CR 702.131, shelf deck work D5, 2026-09-30 — Arch of Orazca and Wayward
 * Swordtooth in Jurassic Ramp).
 *
 * CR 702.131b: Ascend on a permanent is a static ability — "Any time you control ten or more permanents and you don't
 * have the city's blessing, you get the city's blessing for the rest of the game." CR 702.131c: the city's blessing is a
 * player designation with no rules meaning of its own; it stays for the rest of the game, whatever the permanent count
 * does afterwards.
 *
 * The grant runs at the state-based-action cadence (sba.checkAllStateBasedActions — before every priority window and
 * after every resolution). That is where "any time" becomes observable here: the permanent count only changes through
 * an action, a resolution or an SBA, and every one of those is followed by this check before anyone can act on the
 * result. Phased-out permanents sit outside `battlefield` and are not counted (CR 702.26b).
 *
 * Ascend on an instant or sorcery (CR 702.131a — a spell ability applied as the spell resolves) is NOT modeled: those
 * spells keep parking. The Un-set "Ascend MagicCon …" variant is not Ascend and never matches.
 *
 * Readers: interveningIf ("you have the city's blessing" — trigger conditions, "Activate only if …" riders, spell
 * conditions) and combatEvasion ("can't attack or block unless you have the city's blessing").
 */
import { logEvent } from "./gameState.js";

const ASCEND_LINE_RE = /(?:^|\n)[ \t]*Ascend[ \t]*(?:\(|\n|$)/;

/** True when the card prints the Ascend keyword ability (the real one — not "Ascend MagicCon …"). */
export function cardHasAscend(card) {
  return ASCEND_LINE_RE.test(String(card?.oracle ?? card?.oracle_text ?? ""));
}

/** Has `playerId` got the city's blessing? A plain player flag, set once and never cleared (CR 702.131c). */
export function hasCitysBlessing(state, playerId) {
  return state?.players?.[playerId]?.citysBlessing === true;
}

/**
 * Give the city's blessing to every player who controls a permanent with Ascend and ten or more permanents, and doesn't
 * already have it. Returns the same state object when nothing changes (the SBA fixpoint's reference-stability contract).
 */
export function grantCitysBlessings(state) {
  let next = state;
  for (const [pid, player] of Object.entries(state?.players || {})) {
    if (player?.citysBlessing) continue;
    const bf = player?.battlefield || [];
    if (bf.length < 10) continue;
    if (!bf.some((p) => cardHasAscend(p.card))) continue;
    next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], citysBlessing: true } } };
    next = logEvent(next, { kind: "citys-blessing", playerId: pid, permanents: bf.length });
  }
  return next;
}
