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

function hasHaste(card) {
  const kw = card?.keywords;
  const kwString = Array.isArray(kw) ? kw.join(" ") : String(kw || "");
  const oracle = String(card?.oracle || card?.oracle_text || "");
  return /Haste/i.test(`${kwString} ${oracle}`);
}

function untappedReadyCreatures(state, playerId) {
  // "Ready" = can attack on their turn (untapped, not summoning sick
  // unless Haste). We do a string check on keywords / oracle so this
  // works whether the card data was hydrated from Scryfall or built
  // by hand in a test.
  return untappedPermanentsOfType(state, playerId, isCreature).filter(p =>
    !p.summoningSick || hasHaste(p.card)
  );
}

function totalPower(permanents) {
  return permanents.reduce((sum, p) => sum + (Number(p.card?.power) || 0), 0);
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
  // The opponent this attack is aimed at. Standard: the lone "ai".
  // Commander: the first opponent in turn order (PR 10 extends the
  // counter-attack check to ALL opponents, not just this one).
  const defenderId = opponentsOf(state, attackerPlayerId)[0];

  const theirReady = untappedReadyCreatures(state, defenderId);
  if (theirReady.length === 0) return null;

  const incoming = totalPower(theirReady);
  if (incoming === 0) return null;

  const committedIds = new Set(attackerActions.map(a => a.permanentId));
  const yourCreatures = state.players?.[attackerPlayerId]?.battlefield?.filter(p => isCreature(p.card)) || [];
  const stayingHome = yourCreatures.filter(p => !p.tapped && !committedIds.has(p.id));
  const defended = stayingHome.reduce((sum, p) => sum + (Number(p.card?.toughness) || 0), 0);

  const exposed = Math.max(0, incoming - defended);
  const yourLife = state.players?.[attackerPlayerId]?.life ?? 0;
  if (yourLife <= 0 || exposed === 0) return null;

  if (exposed >= yourLife) {
    return {
      type: "counter-attack-lethal",
      severity: "danger",
      message:
        `If you commit this attack, opponent has ${theirReady.length} untapped creature${theirReady.length === 1 ? "" : "s"} ` +
        `with combined power ${incoming}. After your blockers absorb what they can (${defended}), ${exposed} damage gets through — ` +
        `and you're at ${yourLife} life. That's lethal on their swing-back.`,
      details: { incoming, defended, exposed, yourLife, theirReadyCount: theirReady.length },
    };
  }
  if (exposed * 2 >= yourLife) {
    return {
      type: "counter-attack-dangerous",
      severity: "warn",
      message:
        `Opponent has ${theirReady.length} untapped creature${theirReady.length === 1 ? "" : "s"} with combined power ${incoming}. ` +
        `After this attack you'll only soak ${defended} on the swing-back, exposing ${exposed} damage against your ${yourLife} life.`,
      details: { incoming, defended, exposed, yourLife, theirReadyCount: theirReady.length },
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
  // The opponent this attack is aimed at. Standard: the lone "ai".
  // Commander: the first opponent in turn order (PR 10 extends the
  // counter-attack check to ALL opponents, not just this one).
  const defenderId = opponentsOf(state, attackerPlayerId)[0];
  const traps = [];

  const counterAttack = detectCounterAttackLethal(state, attackerPlayerId, attackerActions);
  if (counterAttack) traps.push(counterAttack);

  const instantSpeed = detectInstantSpeedResponse(state, defenderId);
  if (instantSpeed) traps.push(instantSpeed);

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
