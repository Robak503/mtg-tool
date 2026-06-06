/**
 * Phase 6 PR 7 — Intermediate-mode trap detector.
 *
 * Pure analysis of public board state. Surfaces moments where an
 * intermediate player would benefit from pausing instead of auto-
 * piloting through. The decisionGate uses these warnings to decide
 * whether to AUTO-ATTACK silently or ASK with context.
 *
 * What "trap" means here:
 *   - Something a thoughtful player should notice before committing
 *   - Computable from public information (opponent untapped permanents,
 *     opponent hand SIZE, life totals) — no hidden-info peeking
 *   - Worth interrupting the auto-pilot flow for (we tune thresholds
 *     to avoid noise; a trap that fires every turn is just nag)
 *
 * Each detector returns null when no trap, or a TrapWarning object:
 *   {
 *     type:     "instant-speed-response" | "counter-attack-lethal" | ...,
 *     severity: "info" | "warn" | "danger",
 *     message:  string,    // Jace-voice one-liner the narrator can prefix
 *     details:  object,    // structured data for tests / future telemetry
 *   }
 *
 * Public entry: detectAttackTraps(state, attackerPlayerId, attackerActions).
 *
 * Pure: no fetches, no LLM, no mutation. Same inputs always produce the
 * same warnings — important for deterministic tests and replays.
 */

import { opponentsOf } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";

// ─── Type helpers ────────────────────────────────────────────────────────────

function cardType(card) {
  return String(card?.type || card?.type_line || "");
}

function isLand(card) {
  return /Land/.test(cardType(card));
}

function isCreature(card) {
  return /Creature/.test(cardType(card));
}

function untappedPermanentsOfType(state, playerId, predicate) {
  const player = state.players?.[playerId];
  if (!player?.battlefield) return [];
  return player.battlefield.filter(p => !p.tapped && predicate(p.card));
}

function untappedLandCount(state, playerId) {
  return untappedPermanentsOfType(state, playerId, isLand).length;
}

function untappedReadyCreatures(state, playerId) {
  // "Ready" = can attack on their turn (untapped, not summoning sick unless Haste).
  // Haste goes through the layer engine (permanentHasKeyword), so GRANTED haste
  // counts — keeping this readiness gate consistent with legalChoices' attack gate,
  // which combat actually resolves on (F7a). Otherwise the counter-swing heuristic
  // would undercount a granted-haste creature that can legally attack.
  return untappedPermanentsOfType(state, playerId, isCreature).filter(p =>
    !p.summoningSick || permanentHasKeyword(state, p.id, "Haste")
  );
}

// Threat math reads DERIVED power (anthems/lords/pump), not printed (F7a), so the
// AI's "is this attack a trap" heuristic sees the same board combat resolves on.
function totalPower(state, permanents) {
  return permanents.reduce((sum, p) => sum + Math.max(0, permanentPower(state, p.id)), 0);
}

function handSize(state, playerId) {
  return state.players?.[playerId]?.hand?.length || 0;
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/**
 * Opponent has enough open mana + cards in hand to credibly cast a
 * counter, removal, or bounce spell at instant speed. We don't try to
 * guess which spell — the warning is about the SHAPE of the threat.
 *
 * Thresholds tuned to avoid noise:
 *   - 2+ untapped lands AND 1+ cards in hand → warn (a Counterspell-
 *     class threat is on the table)
 *   - 4+ untapped lands AND 2+ cards in hand → danger (broad response
 *     range including hard counters, sweepers from Wrath cost, etc.)
 *   - Below those: silent (a single open mana isn't worth interrupting
 *     for)
 */
export function detectInstantSpeedResponse(state, defenderId) {
  const lands = untappedLandCount(state, defenderId);
  const cards = handSize(state, defenderId);
  if (lands < 2 || cards < 1) return null;

  const severity = lands >= 4 && cards >= 2 ? "danger" : "warn";
  const message =
    `Opponent has ${lands} untapped land${lands === 1 ? "" : "s"} and ${cards} card${cards === 1 ? "" : "s"} in hand. ` +
    `They could counter, bounce, or remove what you cast or attack with at instant speed.`;
  return {
    type: "instant-speed-response",
    severity,
    message,
    details: { lands, cards },
  };
}

/**
 * After you commit to this attack, your committed attackers are tapped
 * on opponent's turn. Their untapped ready creatures get the counter-
 * swing. If their incoming damage exceeds what your remaining untapped
 * creatures can block, you risk dying on the swing-back.
 *
 * Math (v1, intentionally rough):
 *   incoming  = total power of opponent's untapped ready creatures
 *   blockers  = your creatures NOT in the attack plan, still untapped
 *   defended  = total toughness of blockers (caps damage they can soak,
 *                under the simplest "1 blocker per attacker" assumption)
 *   exposed   = max(0, incoming - defended)
 *
 *   exposed >= your life  → "danger" (lethal on the swing-back)
 *   exposed >= life / 2   → "warn"   (you'll take half life or more)
 *   otherwise             → null
 *
 * This intentionally ignores trample, evasion, deathtouch, and combat
 * tricks — v1 is a heuristic, not a solver. The point is to make the
 * user PAUSE, not to compute the precise outcome.
 */
export function detectCounterAttackLethal(state, attackerPlayerId, attackerActions) {
  if (!Array.isArray(attackerActions) || attackerActions.length === 0) return null;
  const yourLife = state.players?.[attackerPlayerId]?.life ?? 0;
  if (yourLife <= 0) return null;

  const committedIds = new Set(attackerActions.map(a => a.permanentId));
  const yourCreatures = state.players?.[attackerPlayerId]?.battlefield?.filter(p => isCreature(p.card)) || [];
  const stayingHome = yourCreatures.filter(p => !p.tapped && !committedIds.has(p.id));
  const defended = stayingHome.reduce((sum, p) => sum + Math.max(0, permanentToughness(state, p.id)), 0);

  // The opponent who can punish hardest after this attack — in Commander any
  // opponent can swing back, not just the one you attacked. Standard: the lone
  // opponent (label stays "opponent" so the Standard warning text is unchanged).
  const opponents = opponentsOf(state, attackerPlayerId);
  let worst = null;
  for (const oppId of opponents) {
    const theirReady = untappedReadyCreatures(state, oppId);
    const incoming = totalPower(state, theirReady);
    if (incoming === 0) continue;
    const exposed = Math.max(0, incoming - defended);
    if (exposed === 0) continue;
    if (!worst || exposed > worst.exposed) {
      worst = { oppId, incoming, exposed, readyCount: theirReady.length };
    }
  }
  if (!worst) return null;

  const multi = opponents.length > 1;
  const who = multi ? worst.oppId : "opponent";
  const Who = who.charAt(0).toUpperCase() + who.slice(1);
  const plural = worst.readyCount === 1 ? "" : "s";

  if (worst.exposed >= yourLife) {
    return {
      type: "counter-attack-lethal",
      severity: "danger",
      message:
        `If you commit this attack, ${who} has ${worst.readyCount} untapped creature${plural} ` +
        `with combined power ${worst.incoming}. After your blockers absorb what they can (${defended}), ${worst.exposed} damage gets through — ` +
        `and you're at ${yourLife} life. That's lethal on their swing-back.`,
      details: { opponent: worst.oppId, incoming: worst.incoming, defended, exposed: worst.exposed, yourLife, theirReadyCount: worst.readyCount },
    };
  }
  if (worst.exposed * 2 >= yourLife) {
    return {
      type: "counter-attack-dangerous",
      severity: "warn",
      message:
        `${Who} has ${worst.readyCount} untapped creature${plural} with combined power ${worst.incoming}. ` +
        `After this attack you'll only soak ${defended} on the swing-back, exposing ${worst.exposed} damage against your ${yourLife} life.`,
      details: { opponent: worst.oppId, incoming: worst.incoming, defended, exposed: worst.exposed, yourLife, theirReadyCount: worst.readyCount },
    };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run all attack-relevant detectors. Returns an array of TrapWarnings;
 * empty means "safe to auto-attack."
 *
 * Ordering convention: most severe first ("danger" before "warn" before
 * "info"), then in detector-registration order for ties. UI rendering
 * can rely on traps[0] being the headline warning.
 */
export function detectAttackTraps(state, attackerPlayerId, attackerActions) {
  if (!state || !attackerPlayerId) return [];
  const traps = [];

  // Counter-attack check now scans every opponent internally.
  const counterAttack = detectCounterAttackLethal(state, attackerPlayerId, attackerActions);
  if (counterAttack) traps.push(counterAttack);

  // Instant-speed response: surface the most threatening opponent (any of them
  // can hold up interaction). Standard reduces to the lone opponent.
  let worstInstant = null;
  for (const oppId of opponentsOf(state, attackerPlayerId)) {
    const w = detectInstantSpeedResponse(state, oppId);
    if (w && (!worstInstant || severityRank(w.severity) > severityRank(worstInstant.severity))) {
      worstInstant = w;
    }
  }
  if (worstInstant) traps.push(worstInstant);

  return traps.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(s) {
  switch (s) {
    case "danger": return 3;
    case "warn":   return 2;
    case "info":   return 1;
    default:       return 0;
  }
}
