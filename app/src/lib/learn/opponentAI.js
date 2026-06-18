/**
 * Phase 6 — Learn-to-Play: opponentAI.js
 *
 * Picks an action for the AI side. NOT trying to be a strong opponent
 * in v1 — just coherent and consistent enough that learning sessions
 * feel like a real game.
 *
 * Strategy: archetype-aware policy reusing goldfish v2's classifier.
 * Per archetype, we have a priority ordering for cast-spell candidates
 * (matching what runGoldfish v2 does internally). For everything else
 * (play-land, declare-attacker, declare-blocker), we use rule-based
 * heuristics tuned for "obvious correct play" — the AI isn't trying
 * to beat the user, just to play coherently.
 *
 * The action picker is deterministic given the same state + same
 * declaredArchetype. Tests pass a fake state and assert specific picks.
 *
 * Deferred:
 *   - Combat math (block-to-trade vs block-to-survive)
 *   - Bluffing / mana-held-up cues
 *   - Target selection on spells (the engine will surface a "pick
 *     target" decision after PR3.5 lands; for now, the AI passes
 *     when it would need to choose)
 *   - Card-specific synergies (Atraxa stacking proliferate triggers,
 *     etc.) — that's Arbiter or PR8+ territory
 */

import { detectArchetype } from "../goldfish.js";
import { filterActions } from "./legalChoices.js";
import { opponentsOf } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { chooseAITarget } from "./spellEffects.js";
import { programContainsCounter, programContainsMassRemoval, programContainsTeamPump } from "./effects/parser.js";

// ─── Cast priority by archetype ──────────────────────────────────────────────

/**
 * Score a cast-spell action for the given archetype. Lower score =
 * cast sooner. Mirrors `buildCastScorer` from lib/goldfish.js (which
 * runGoldfish uses internally), but operating on a cast-spell
 * legal-action object rather than a fully-classified card.
 */
function scoreCastAction(action, card, archetype) {
  const type = String(card?.type || card?.type_line || "");
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const isCreature = /Creature/.test(type);
  const cmc = action.cmc || 0;

  // Heuristic flags — very rough versions of what goldfish.js does in
  // depth. Good enough for "play coherently."
  const isRamp = /add \{[WUBRGC]+/i.test(oracle) || /\bcreate.{0,30}treasure\b/i.test(oracle);
  const isDraw = /\bdraw\b/i.test(oracle);
  const isInteraction = /(counter target|destroy target|exile target|deals? \d+ damage)/i.test(oracle);
  const isTokenMaker = /create.+token/i.test(oracle);
  const isEquipment = /Equipment/.test(type);

  switch (archetype) {
    case "aggro":
      if (isCreature && cmc <= 2) return 0;
      if (isCreature && cmc <= 3) return 1;
      if (isInteraction) return 2;
      if (isRamp) return 3;
      return 5;
    case "control":
      if (isInteraction) return 0;
      if (isDraw) return 1;
      if (isRamp) return 2;
      return 4;
    case "combo":
      if (isRamp) return 0;
      if (isDraw) return 1;
      return 3;
    case "voltron":
      if (isRamp) return 0;
      if (isEquipment) return 1;
      return 2;
    case "tokens":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "aristocrats":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "ramp":
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (cmc >= 7) return 2;
      return 3;
    case "midrange":
    default:
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (isInteraction) return 2;
      return 3;
  }
}

// ─── Card lookup ─────────────────────────────────────────────────────────────

/**
 * Resolve a card by ID from the AI player's hand. Used to look up
 * full card data (oracle, type, mana) from the action's cardId.
 */
function cardFromHand(state, playerId, cardId) {
  const player = state.players[playerId];
  return player?.hand.find(c => c.id === cardId) || null;
}

// ─── Sub-pickers ──────────────────────────────────────────────────────────────

/**
 * Pick the best play-land action. Preference order:
 *   1. Lands that produce colors the AI needs (vs already has 2+ of)
 *   2. Otherwise: first land in hand alphabetically (stable)
 *
 * v1 doesn't do anything smart about basics-vs-duals or sequencing
 * tap-lands. That's PR8+ territory.
 */
function pickLandAction(state, aiPlayerId, landActions) {
  if (landActions.length === 0) return null;
  // For now, deterministic alphabetical pick. Mana-color-gap logic
  // would need to read the AI's commanders / hand colors which we
  // can revisit when archetype detection sees the full deck context.
  const sorted = [...landActions].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0];
}

/**
 * Pick the best cast-spell action via archetype-aware scoring. A targeted
 * spell appears once per legal target; we group by card, score each spell
 * once, and for targeted spells choose the AI's best enemy target — skipping
 * a targeted spell entirely when there's no good target (so the AI never
 * burns/destroys its own creatures). Returns null if nothing worth casting.
 */
function pickCastAction(state, aiPlayerId, castActions, archetype) {
  if (castActions.length === 0) return null;

  const byCard = new Map();
  for (const action of castActions) {
    if (!byCard.has(action.cardId)) byCard.set(action.cardId, []);
    byCard.get(action.cardId).push(action);
  }

  const scored = [];
  for (const [cardId, actions] of byCard) {
    const card = cardFromHand(state, aiPlayerId, cardId);
    if (!card) continue; // card vanished
    // The AI HOLDS any counter spell (deferred seam — it doesn't evaluate response
    // windows and must never counter its OWN spell). Explicit rather than relying on the
    // coincidence that a counter atom sorts its spell target first (P3.1 review finding:
    // counter+damage like Suffocating Blast held only by atom ordering). The player can
    // still cast counters normally; the AI simply passes.
    if (programContainsCounter(actions[0].program)) continue;
    // The AI HOLDS a symmetric board wipe (destroy/exile/-X-X all creatures): it can't yet
    // weigh whether the wipe nets out in its favor, and an indiscriminate Wrath into its own
    // board plays terribly. The player casts wipes normally. (Deferred board-state heuristic.)
    if (programContainsMassRemoval(actions[0].program)) continue;
    // The AI HOLDS a controller-scoped TEAM pump (Overrun / Trumpet Blast — "creatures you
    // control get +N/+N until end of turn"): the buff is its OWN, so this is purely a timing
    // call (cast it pre-combat into a profitable attack), which the AI can't make yet — casting
    // it blindly in its main phase wastes it. Holding only costs tempo, never a wrong play.
    // (Deferred "pump my team before a good attack" heuristic; player casts it normally.)
    if (programContainsTeamPump(actions[0].program)) continue;
    // The AI HOLDS Auras (deferred seam): it doesn't yet weigh which creature to enchant
    // (buff its own attacker vs. curse an enemy) and must never hang a beneficial Aura on an
    // opponent. The player casts Auras normally; the AI passes. (Belt-and-suspenders — these
    // also have a null `effect`, so the targeted branch below would hold them anyway.)
    if (actions[0].isAuraSpell) continue;
    const effect = actions[0].effect;
    let chosen = actions[0];
    // δ-1b hand disruption (Duress / Thoughtseize / …): the target is an OPPONENT (a player), and the
    // card to strip is chosen at RESOLUTION (hand-blind at cast — the faithful flow). The targets are
    // opponents only by construction, so no self-target risk; the AI picks the opponent with the most
    // cards in hand (the most to disrupt), then autoPickHandDiscardCandidate takes their best card when
    // the spell resolves. This bypasses the chooseAITarget hold below (a program-only spell, null legacy
    // `effect`) so the AI actually plays its discard.
    if ((actions[0].program?.atoms || []).some(a => a.op === "discard-chosen")) {
      const handSize = (a) => (state.players?.[a.targets?.[0]?.id]?.hand || []).length;
      chosen = actions.reduce((best, a) => (handSize(a) > handSize(best) ? a : best), actions[0]);
    } else if (actions.some(a => a.targets?.length)) {
      // A targeted spell: only cast on a good ENEMY target. chooseAITarget filters to
      // enemies for the scorable legacy effects (damage/destroy); for spells it can't
      // score yet (effect == null — the P2.7 extended atoms tap/bounce/exile/counters)
      // it returns null, so the AI HOLDS them rather than aim removal at its own board.
      const options = actions.map(a => a.targets?.[0]).filter(Boolean);
      const target = effect ? chooseAITarget(state, aiPlayerId, effect, options) : null;
      if (!target) continue;
      chosen = actions.find(a => a.targets?.[0]?.id === target.id) || actions[0];
    }
    scored.push({ action: chosen, score: scoreCastAction(actions[0], card, archetype), cmc: actions[0].cmc || 0 });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score || a.cmc - b.cmc);
  return scored[0].action;
}

/**
 * Degenerate fallback: attack with every legal attacker. Used only when the AI
 * can't evaluate the board (no living/identifiable defender — e.g. a bare test
 * state). Defaulting to "swing" here is deliberate: never freezing means the
 * anti-loop latch can't mistake the AI for a stalled game. Real boards go through
 * the profitability heuristic in `selectProfitableAttackers`.
 */
function pickAllAttackers(attackerActions) {
  return attackerActions;
}

/**
 * Pick blocking assignments. v1 policy: block only when the AI has
 * a higher-toughness creature than the attacker's power (no trades,
 * just chumps when forced). For PR4 we keep this minimal — pick one
 * blocker per attacker, preferring the smallest legal blocker.
 * Returns an array of declare-blocker actions.
 */
function pickBlockers(blockerActions, state) {
  if (blockerActions.length === 0) return [];

  // Group by attackerId so each gets at most one blocker.
  const assigned = new Map();
  const sorted = [...blockerActions].sort((a, b) => {
    // Prefer smaller creatures (cheaper-to-lose chump blockers). DERIVED power
    // (anthems/lords applied), so the AI chumps with what's actually smallest (F7a).
    const aPow = Math.max(0, permanentPower(state, a.permanentId));
    const bPow = Math.max(0, permanentPower(state, b.permanentId));
    return aPow - bPow;
  });

  for (const action of sorted) {
    if (!assigned.has(action.attackerId)) {
      assigned.set(action.attackerId, action);
    }
  }
  return [...assigned.values()];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick a single action from the legal actions list. Returns the chosen
 * action (one of the items in `actions`), or null if no action makes
 * sense (caller should pass priority).
 *
 * Priority order:
 *   1. play-land if available (always — never skip a land drop)
 *   2. cast-spell via archetype scoring
 *   3. declare-attacker — only the first one; engine batches
 *      attackers per step, but the picker is called for the FIRST
 *      decision; downstream the engine reads pickAttackPlan instead.
 *   4. pass-priority (the fallback)
 *
 * For attacks and blocks (which are batch decisions), use the
 * specialized pickers below.
 */
export function pickAction(state, aiPlayerId, actions, { archetype = null } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  // Combat is a batch decision, but the driver applies one action per tick.
  // We compute the plan and return its first still-legal choice; declared
  // attackers/blockers are excluded from the legal set next tick (attackers
  // tap on declare; blockers are tracked), so each tick drains one and the
  // step empties, after which we fall through to pass.
  if (state.step === "declare-attackers") {
    const attackerActions = filterActions(actions, "declare-attacker");
    if (attackerActions.length > 0) {
      const plan = pickAttackPlan(state, aiPlayerId, attackerActions);
      if (plan.length > 0) return plan[0];
    }
  }
  if (state.step === "declare-blockers") {
    // Only consider attackers we haven't blocked yet (v1: one blocker each),
    // so the AI doesn't pile redundant blockers on the same attacker.
    const blocked = new Set((state.combat?.blockers || []).map(b => b.attackerId));
    const blockerActions = filterActions(actions, "declare-blocker").filter(a => !blocked.has(a.attackerId));
    if (blockerActions.length > 0) {
      const plan = pickBlockPlan(state, aiPlayerId, blockerActions);
      if (plan.length > 0) return plan[0];
    }
  }

  const lands = filterActions(actions, "play-land");
  if (lands.length > 0) {
    const land = pickLandAction(state, aiPlayerId, lands);
    if (land) return land;
  }

  const casts = filterActions(actions, "cast-spell");
  if (casts.length > 0) {
    // Resolve archetype lazily if not supplied. Caller usually passes
    // it for performance — recomputing detectArchetype per priority
    // window is wasteful.
    const aiDeck = { cards: deriveDeckRepresentation(state, aiPlayerId) };
    const detected = archetype || detectArchetype(aiDeck, {}).archetype;
    const cast = pickCastAction(state, aiPlayerId, casts, detected);
    if (cast) return cast;
  }

  // No active-window action — pass priority. (The engine's combat
  // step pickers below handle declare-attackers/blockers as batch
  // decisions, not via pickAction.)
  return actions.find(a => a.kind === "pass-priority") || null;
}

/** Count an opponent's untapped creatures (rough "how hard to push through"). */
function untappedBlockerCount(state, playerId) {
  const bf = state.players?.[playerId]?.battlefield || [];
  return bf.filter(p => String(p.card?.type_line || "").includes("Creature") && !p.tapped).length;
}

/**
 * Which opponent should the AI swing at? Heuristic (design §11.5): the
 * lowest-life living opponent; ties broken by who has the fewest untapped
 * blockers (easiest to push damage through). Returns null when there's no
 * living opponent. In Standard this is just the lone opponent.
 */
function chooseDefender(state, aiPlayerId) {
  const living = opponentsOf(state, aiPlayerId).filter(id => (state.players?.[id]?.life ?? 0) > 0);
  if (living.length === 0) return null;
  return living.slice().sort((a, b) => {
    const lifeDiff = state.players[a].life - state.players[b].life;
    if (lifeDiff !== 0) return lifeDiff;
    return untappedBlockerCount(state, a) - untappedBlockerCount(state, b);
  })[0];
}

/** First/double strike on a permanent (layer-aware), guarded against bad ids. */
function hasFirstStrike(state, permanentId) {
  try {
    return permanentHasKeyword(state, permanentId, "First strike") ||
      permanentHasKeyword(state, permanentId, "Double strike");
  } catch { return false; }
}

/** Derived P/T (+ first-strike) of a player's UNTAPPED creatures — its blockers. */
function untappedDefenderBlockers(state, defenderId) {
  const bf = state.players?.[defenderId]?.battlefield || [];
  return bf
    .filter(p => String(p.card?.type_line || p.card?.type || "").includes("Creature") && !p.tapped)
    .map(p => ({
      power: Math.max(0, permanentPower(state, p.id)),
      toughness: permanentToughness(state, p.id),
      firstStrike: hasFirstStrike(state, p.id),
    }));
}

/**
 * Would this attacker die "for nothing"? True when some untapped blocker can kill
 * it (blocker power ≥ attacker toughness) without the attacker getting value back.
 * The defender, not the attacker, picks the block — so one such free-kill blocker
 * is enough to make the swing a bad trade; a competent racer holds these back
 * (unless the whole swing is lethal). Cases, given a blocker that CAN kill it:
 *   - blocker has first/double strike and the attacker doesn't → the attacker dies
 *     in the first-strike step before it can deal, so it dies for nothing.
 *   - otherwise (simultaneous damage): only "for nothing" if the blocker survives
 *     the attacker's hit (blocker toughness > attacker power); an even/ favorable
 *     trade (attacker power ≥ blocker toughness) is allowed.
 */
function attackerDiesForNothing(power, toughness, blockers, attackerHasFS = false) {
  return blockers.some(b => {
    if (b.power < toughness) return false;            // this blocker can't kill the attacker
    if (b.firstStrike && !attackerHasFS) return true; // strikes first → attacker never deals back
    return b.toughness > power;                        // vanilla: blocker outlives the attacker's hit
  });
}

/**
 * Is the swing lethal this turn? The defender blocks optimally to minimize face
 * damage — i.e. it chump-blocks the highest-power attackers — so the unavoidable
 * damage is the sum of the powers of every attacker beyond the defender's blocker
 * count. If that meets or exceeds the defender's life, the alpha strike kills.
 */
function swingIsLethal(attackerPowers, blockerCount, defenderLife) {
  if (defenderLife <= 0) return false;
  const unblocked = [...attackerPowers].sort((a, b) => b - a).slice(blockerCount);
  return unblocked.reduce((s, p) => s + p, 0) >= defenderLife;
}

/**
 * "Competent racer" attack policy: return the SET of attacker permanentIds the AI
 * should commit against `defenderId`. Swing the whole team when it's lethal or the
 * defender has no blockers (free damage); otherwise swing only creatures that
 * won't just die for nothing to a free-kill block. Returns null when the board
 * can't be evaluated (no defender / unknown seat), signalling "attack with all".
 *
 * Lethality is judged over the FULL swing — attackers already declared THIS combat
 * (state.combat.attackers, tapped + excluded from the shrinking legal set) PLUS the
 * still-legal candidates. The driver declares one attacker per tick, so without
 * folding the committed ones back in, a lethal alpha strike would lose its lethal
 * status after the first attacker taps and the rest would (correctly, for a
 * non-lethal swing) be held — fizzling the kill. (Found in adversarial review.)
 */
function selectProfitableAttackers(state, aiPlayerId, attackerActions, defenderId) {
  if (!defenderId || !state.players?.[defenderId]) return null;
  const blockers = untappedDefenderBlockers(state, defenderId);
  const defenderLife = state.players[defenderId].life ?? 0;

  const permIds = [...new Set(attackerActions.map(a => a.permanentId))];
  const stats = new Map(permIds.map(id => [id, {
    power: Math.max(0, permanentPower(state, id)),
    toughness: permanentToughness(state, id),
    firstStrike: hasFirstStrike(state, id),
  }]));

  // Powers of attackers ALREADY committed this combat against this same defender.
  const committedPowers = (state.combat?.attackers || [])
    .filter(a => a.attackingPlayer === aiPlayerId && a.defender === defenderId)
    .map(a => Math.max(0, permanentPower(state, a.permanentId)));
  const candidatePowers = [...stats.values()].map(s => s.power);
  const lethal = swingIsLethal([...committedPowers, ...candidatePowers], blockers.length, defenderLife);

  const chosen = new Set();
  for (const id of permIds) {
    const { power, toughness, firstStrike } = stats.get(id);
    if (lethal || blockers.length === 0 || !attackerDiesForNothing(power, toughness, blockers, firstStrike)) {
      chosen.add(id);
    }
  }
  return chosen;
}

/**
 * Batch-decision picker for declare-attackers: returns the array of attacker
 * actions the AI commits to, after the "competent racer" profitability filter
 * (alpha-strike when lethal / open; hold back creatures that would die for
 * nothing). Engine passes the result to its combat-state tracker.
 *
 * Commander: the legal-action set has one entry per (creature, defender); the AI
 * focuses the chosen target (chooseDefender) and emits one action per surviving
 * attacker. Standard: the actions carry no defenderId (the dispatcher fills the
 * lone opponent), so this returns the profitable subset.
 */
export function pickAttackPlan(state, aiPlayerId, attackerActions) {
  if (!Array.isArray(attackerActions) || attackerActions.length === 0) return [];
  const hasDefenderChoice = attackerActions.some(a => a.defenderId);
  const target = chooseDefender(state, aiPlayerId);
  const chosen = selectProfitableAttackers(state, aiPlayerId, attackerActions, target);

  if (!hasDefenderChoice) {
    // Standard: one action per creature, no defenderId. Can't evaluate → swing all.
    if (chosen === null) return pickAllAttackers(attackerActions);
    return attackerActions.filter(a => chosen.has(a.permanentId));
  }

  // Commander: focus the chosen target, one action per attacking creature.
  const byPermanent = new Map();
  for (const a of attackerActions) {
    if (chosen !== null && !chosen.has(a.permanentId)) continue;
    if (!byPermanent.has(a.permanentId)) byPermanent.set(a.permanentId, []);
    byPermanent.get(a.permanentId).push(a);
  }
  const plan = [];
  for (const opts of byPermanent.values()) {
    plan.push((target && opts.find(o => o.defenderId === target)) || opts[0]);
  }
  return plan;
}

/**
 * Batch-decision picker for declare-blockers.
 */
export function pickBlockPlan(state, _aiPlayerId, blockerActions) {
  // _aiPlayerId kept for the stable positional API; block sizing now reads
  // derived power straight off `state` (F7a), so the owner id isn't needed.
  return pickBlockers(blockerActions, state);
}

// ─── Deck-context helper ──────────────────────────────────────────────────────

/**
 * Construct a card list shape compatible with detectArchetype() from
 * the AI player's CURRENT zones (library + hand + battlefield + graveyard
 * + command). Used to bias play decisions to the deck's actual shape.
 * Cards in exile/sideboard aren't included — they don't reflect the
 * deck's identity for the rest of the game.
 *
 * Public for tests; consumers should use pickAction.
 */
export function deriveDeckRepresentation(state, playerId) {
  const player = state.players[playerId];
  if (!player) return [];
  const zones = [
    player.library, player.hand, player.battlefield, player.graveyard, player.command,
  ];
  const cards = [];
  for (const zone of zones) {
    for (const item of zone) {
      // Battlefield entries are permanents; unwrap to .card. Other
      // zones contain raw card objects.
      const card = item?.card || item;
      if (card?.name) {
        cards.push({ name: card.name, qty: 1, section: "Mainboard" });
      }
    }
  }
  return cards;
}
