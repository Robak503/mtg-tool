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
import { opponentsOf, findPermanent } from "./gameState.js";
import { lookupPlayHint } from "./cardPlayHints.js"; // PLAY-HINTS (2026-08-12) — a zero-import leaf, cycle-safe
import { permanentPower, permanentToughness, permanentHasKeyword, permanentIsCreature, goaderControllersOf } from "./layers.js";
import { grantsControlWhenAttached } from "./controlAura.js"; // ④-K — a control Aura (or a bestow steal) is ENEMY-intent for auraCastIntent; controlAura is a zero-engine-import leaf
import { chooseAITarget } from "./spellEffects.js";
import { manaProduction } from "./manaModel.js";
import { attackerMinBlockers, canBlockAttacker, lureFilterOf, mustBeBlockedIfAble, mustAttackUnlessOf, controllerMeetsBoardPredicate } from "./combatEvasion.js";
import { programContainsCounter, programContainsMassRemoval, programContainsCreatureMassRemoval, programContainsTeamPump, teamPumpAmount, programContainsFog, atomTargetIntent, programConfidence } from "./effects/parser.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { changeTargetAlternatives, atomForStackTarget } from "./effects/targeting.js"; // CHANGE THE TARGET (shelf D14) — where a redirect could send an opponent's spell; the redirected slot's atom
import { tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan } from "./tokenLoopLine.js"; // THE COMBO LINE for a self-scaling token loop: enough, then nothing else, then the finish

// ─── Play-policy flags (the A/B probe seam) ──────────────────────────────────

/**
 * Policy flags select between the CURRENT (default) decision heuristics and the
 * LEGACY ("v1") ones they replaced. `scripts/play-quality-probe.mjs` uses them to
 * run seeded head-to-head A/B batches (old policy vs new) over the real profile
 * decks — the evidence instrument for every opponent-AI play-quality change.
 *
 * Accepted shapes:
 *   null / undefined                        → all-current (the shipping behavior)
 *   "v1"                                    → every subsystem legacy
 *   { land|block|attack|xSizing|counter|unresolvable: "v1" } → per-subsystem legacy
 *
 * The DEFAULT is always the new behavior (the Academy and self-play improve
 * automatically); "v1" exists only so the probe can measure old-vs-new inside one
 * seeded run. Policies only ever re-rank actions already offered by legalChoices —
 * never gate legality on a policy flag (THE CREED: the engine's chokepoints, not
 * private heuristics, decide what is legal).
 *
 * Exported so the A/B probe derives its legacy-key list from THIS array (AI-F11:
 * a hand-copied list silently drops every new subsystem from `--legacy=all`).
 */
export const POLICY_KEYS = ["land", "block", "attack", "xSizing", "counter", "unresolvable", "wipe", "fog", "aura", "pump", "ability", "altCost"];
function normalizePolicy(policy) {
  if (policy === "v1") return Object.fromEntries(POLICY_KEYS.map((k) => [k, "v1"]));
  if (policy && typeof policy === "object") return policy;
  return {};
}

// ─── Cast priority by archetype ──────────────────────────────────────────────

/**
 * Score a cast-spell action for the given archetype. Lower score =
 * cast sooner. Mirrors `buildCastScorer` from lib/goldfish.js (which
 * runGoldfish uses internally), but operating on a cast-spell
 * legal-action object rather than a fully-classified card.
 */
// ─── PLAY-HINTS role tables (2026-08-12, the decision-layer ledger — docs/orchestration/PLAY-HINTS-LEDGER.md) ──
// Per-archetype score by ROLE (lower casts sooner), used ONLY when a hints map is threaded via
// pol.playHints — absent, scoreCastAction's legacy flag path runs byte-identical (the resolveArbiter
// default-off precedent; frozen self-play trajectory hashes untouched). The tables SUBSUME the legacy
// flags (ramp/draw/interaction/token map to their roles at the legacy scores) and extend each archetype
// in its own spirit: control WANTS wipes at 0 (the legacy interaction regex could not even see a wipe),
// combo tutors are gold at 0 (legacy scored them as "else"), token decks finally rank anthems.
// Timing is folded into the numbers (late/hold roles sit higher); board-AWARE timing is phase 2.
const ROLE_SCORES = {
  aggro: { ramp: 3, "card-draw": 3, counterspell: 2, "spot-removal": 2, protection: 2, wipe: 4, tutor: 3, recursion: 4, "token-maker": 2, anthem: 2, equipment: 3, lifegain: 5, finisher: 4, utility: 5 },
  control: { counterspell: 0, "spot-removal": 0, wipe: 0, "card-draw": 1, protection: 1, ramp: 2, tutor: 2, recursion: 3, finisher: 3, lifegain: 3, "token-maker": 4, anthem: 4, equipment: 4, utility: 4 },
  combo: { ramp: 0, tutor: 0, "card-draw": 1, counterspell: 2, protection: 2, recursion: 2, "spot-removal": 3, wipe: 4, "token-maker": 3, anthem: 4, equipment: 4, lifegain: 4, finisher: 3, utility: 3 },
  voltron: { ramp: 0, equipment: 1, protection: 1, anthem: 2, tutor: 2, "card-draw": 2, counterspell: 2, "spot-removal": 2, finisher: 2, wipe: 4, recursion: 3, "token-maker": 3, lifegain: 4, utility: 3 },
  tokens: { ramp: 0, "token-maker": 1, anthem: 1, "card-draw": 2, "spot-removal": 2, counterspell: 3, tutor: 2, recursion: 3, protection: 3, wipe: 4, equipment: 4, lifegain: 4, finisher: 3, utility: 3 },
  aristocrats: { ramp: 0, "token-maker": 1, recursion: 1, "card-draw": 2, "spot-removal": 2, tutor: 2, counterspell: 3, protection: 3, wipe: 3, anthem: 3, equipment: 4, lifegain: 3, finisher: 3, utility: 3 },
  ramp: { ramp: 0, "card-draw": 1, tutor: 1, finisher: 2, "spot-removal": 3, counterspell: 3, wipe: 3, recursion: 3, "token-maker": 3, anthem: 3, equipment: 4, protection: 3, lifegain: 4, utility: 3 },
  midrange: { ramp: 0, "card-draw": 1, tutor: 1, "spot-removal": 2, counterspell: 2, wipe: 2, "token-maker": 3, recursion: 3, protection: 3, anthem: 3, equipment: 3, lifegain: 4, finisher: 3, utility: 3 },
};
function scoreByRole(hint, card, action, archetype) {
  const type = String(card?.type || card?.type_line || "");
  const cmc = action.cmc || 0;
  // The aggro creature-curve override survives from the legacy scorer: cheap bodies outrank every role.
  if (archetype === "aggro" && /Creature/.test(type)) {
    if (cmc <= 2) return 0;
    if (cmc <= 3) return 1;
  }
  const table = ROLE_SCORES[archetype] || ROLE_SCORES.midrange;
  const s = table[hint.role];
  return typeof s === "number" ? s : table.utility;
}

/** Test-only handle on the cast scorer — pins the default-off byte-identity contract (cardPlayHints.test.js). */
export const __scoreCastActionForTests = (...args) => scoreCastAction(...args);

function scoreCastAction(action, card, archetype, hint = null, state = null, aiPlayerId = null) {
  // QUARTET slice 5 WITHDRAWN (2026-08-15): the within-tier cardValue adjustment was FALSIFIED by the
  // gate diagnostic — 62/64 divergent games forked on a cast-spell decision and the evaluator seat won
  // 18 vs 23 there (eval-gate --diagnose, 100 seeds; the plan's status ledger holds the full reading).
  // The SEAM (the state/aiPlayerId threading + the tier split) deliberately REMAINS so a data-backed
  // replacement can slot in and re-gate; until one passes, the tier is the whole score on BOTH sides
  // of the flag. The withdrawal is pinned in boardEval.test.js — a re-introduced adjustment that
  // forgets to re-gate fails there first.
  void state; void aiPlayerId;
  return scoreCastTier(action, card, archetype, hint);
}
function scoreCastTier(action, card, archetype, hint = null) {
  // Commander framework — the AI prioritizes casting its commander: a key threat + engine piece, and the
  // path to commander damage / the 21-loss (CR 903.10a). A command-zone cast outranks every other play
  // (lowest score wins), so the AI deploys its commander as soon as it can afford the taxed cost.
  if (action?.fromZone === "command" || card?.isCommander) return -1;
  // PLAY-HINTS (default-off): a threaded hint routes to the role tables; absent → the legacy flag path
  // below, byte-identical.
  if (hint) return scoreByRole(hint, card, action, archetype);
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
 * Resolve a card by ID from the AI player's castable zones. Used to look up
 * full card data (oracle, type, mana) from the action's cardId.
 */
function cardFromHand(state, playerId, cardId, fromPlayerId = null) {
  const player = state.players[playerId];
  // ANOTHER PLAYER'S CARD (shelf D3, Ragavan): the action names the owner whose exile holds it — and only a card
  // stamped castable by THIS player is ever resolved there. CAST FROM AMONG (P·16 — Etali): or a candidate of this
  // player's own open decision, the same permission the dispatcher checks.
  if (fromPlayerId && fromPlayerId !== playerId) {
    const pc = state.pendingCastFromAmong;
    const amongMine = pc?.controller === playerId && (pc.candidates || []).some((c) => c.cardId === cardId && c.ownerId === fromPlayerId);
    return state.players[fromPlayerId]?.exile?.find(c => c.id === cardId && (c._impulseFor === playerId || amongMine)) || null;
  }
  // CMD-CAST: a commander cast action (fromZone:"command") references a card in the command zone, not
  // the hand — check both so the AI can actually cast its commander (CR 903.8), not sit on it all game.
  // EXILE: cascade / discover free-cast candidates, plotted cards, and adventure creature-halves cast
  // from exile all carry fromZone:"exile" — without this lookup every such action was silently dropped
  // (`if (!card) continue`), so cascade ALWAYS declined and plotted cards were never cast.
  // LIBRARY (P·17 — Bolas's Citadel, and every play-from-top permission: Future Sight, Mystic Forge): a cast offered off the
  // top of the library (fromZone:"library") was dropped here the same way, so the AI never cast from the top at all.
  return player?.hand.find(c => c.id === cardId)
    || player?.command?.find(c => c.id === cardId)
    || player?.exile?.find(c => c.id === cardId)
    || player?.library?.find(c => c.id === cardId)
    || null;
}

// ─── Sub-pickers ──────────────────────────────────────────────────────────────

/**
 * Does this land's own text say it enters the battlefield tapped? CONSERVATIVE:
 * the conditional forms ("… enters tapped unless …", "… you may pay 2 life. If
 * you don't, it enters tapped.") also count as TAPPED, so a conditionally-tapped
 * land ranks below an always-untapped one. Ranking-only, never legality — a
 * mis-rank costs tempo at worst; the pick is always one of the OFFERED land drops.
 */
function landEntersTapped(card) {
  return /\benters(?: the battlefield)? tapped\b/i.test(String(card?.oracle || card?.oracle_text || ""));
}

/**
 * Colored pips in a mana cost string ({W}{U}{B}{R}{G}; each half of a hybrid pip
 * counts as needing that color — a payable-either-way pip is a soft need).
 */
function coloredPips(mana) {
  const out = [];
  for (const m of String(mana || "").matchAll(/\{([^}]+)\}/g)) {
    for (const ch of m[1].toUpperCase()) if ("WUBRG".includes(ch)) out.push(ch);
  }
  return out;
}

/**
 * Pick the best play-land action (W1 — land sequencing). Rank by:
 *   1. enters UNTAPPED first — an enters-tapped land costs a mana turn;
 *   2. fills a COLOR GAP — produces a color that hand/command-zone pips need and
 *      no battlefield source can already make. Colors come from `manaProduction`
 *      (the shared mana gate), so the ranking can never disagree with what the
 *      engine will actually tap the land for;
 *   3. codepoint name order (the engine's replay-stable tiebreak —
 *      localeCompare is environment/ICU-dependent).
 * Deterministic + read-only over state. `pol.land === "v1"` recovers the legacy
 * pure-alphabetical pick (the A/B probe's OLD side).
 */
function pickLandAction(state, aiPlayerId, landActions, pol = {}) {
  if (landActions.length === 0) return null;
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  // LAND-V1 (legacy, probe-only): pure codepoint-alphabetical pick.
  if (pol.land === "v1") return [...landActions].sort(byName)[0];

  const player = state.players?.[aiPlayerId];
  // Colors the AI's battlefield can already produce (any owned source, tapped or
  // not — the gap question is "do I own a source of this color at all").
  const producible = new Set();
  for (const perm of player?.battlefield || []) {
    for (const c of manaProduction(perm?.card)?.colors || []) producible.add(c);
  }
  // Colors its hand + command zone still need but can't produce yet.
  const needed = new Set();
  for (const card of [...(player?.hand || []), ...(player?.command || [])]) {
    for (const pip of coloredPips(card?.mana || card?.mana_cost)) {
      if (!producible.has(pip)) needed.add(pip);
    }
  }

  const ranked = landActions.map((action) => {
    const card = cardFromHand(state, aiPlayerId, action.cardId);
    return {
      action,
      untapped: card && !landEntersTapped(card) ? 1 : 0,
      fillsGap: (manaProduction(card)?.colors || []).some((c) => needed.has(c)) ? 1 : 0,
    };
  });
  ranked.sort((a, b) => (b.untapped - a.untapped) || (b.fillsGap - a.fillsGap) || byName(a.action, b.action));
  return ranked[0].action;
}

/**
 * W5 — choose WHICH X to cast from an X-spell's offered action group (one action
 * per affordable X × target combo; the list is affordability-exact via the real
 * canAfford planner, so every candidate is payable).
 *   - UNTARGETED X (enters-with-X hydras, X tokens/draw/team-pump): take the MAX
 *     offered X — the biggest body/payoff the mana buys.
 *   - TARGETED X-damage (the synthetic per-X `effect` legalChoices attaches):
 *     kill the biggest enemy creature with the MINIMUM lethal X (no overpay);
 *     with no killable creature, aim the MAX X at the lowest-life enemy player
 *     when the program allows player targets; otherwise HOLD.
 *   - Any other targeted X program is unscorable → HOLD (parity with the legacy
 *     targeted-spell hold — never aim an unknown effect).
 * Returns the chosen action or null (hold). Deterministic (stable action order +
 * strict-improvement comparisons with id tiebreaks).
 */
function pickXCast(state, aiPlayerId, actions) {
  const xOf = (a) => a.xValue ?? 0;
  const targeted = actions.some((a) => (a.targets?.length || 0) > 0);
  if (!targeted) {
    return actions.reduce((best, a) => (xOf(a) > xOf(best) ? a : best), actions[0]);
  }
  let enemies;
  try { enemies = new Set(opponentsOf(state, aiPlayerId)); } catch { return null; }
  let bestKill = null; // biggest-threat enemy creature, minimum lethal X
  let bestFace = null; // lowest-life enemy player, maximum X
  for (const a of actions) {
    if (a.effect?.kind !== "damage") continue; // unscorable targeted X → contributes nothing
    const t = a.targets?.[0];
    if (!t) continue;
    if (t.type === "player") {
      if (!enemies.has(t.id)) continue;
      const life = state.players?.[t.id]?.life ?? 0;
      if (!bestFace || life < bestFace.life || (life === bestFace.life && xOf(a) > bestFace.x)) {
        bestFace = { action: a, life, x: xOf(a) };
      }
      continue;
    }
    if (!enemies.has(t.controller)) continue;
    let pow, tou;
    try {
      pow = Math.max(0, permanentPower(state, t.id));
      tou = permanentToughness(state, t.id);
    } catch { continue; }
    if (tou <= 0 || xOf(a) < tou) continue; // this X doesn't kill it
    if (!bestKill
      || pow > bestKill.pow
      || (pow === bestKill.pow && xOf(a) < bestKill.x)
      || (pow === bestKill.pow && xOf(a) === bestKill.x && String(t.id) < String(bestKill.targetId))) {
      bestKill = { action: a, pow, x: xOf(a), targetId: t.id };
    }
  }
  if (bestKill) return bestKill.action;
  if (bestFace) return bestFace.action;
  // AI-F12 — MIXED-TARGET X GROUP: one targeted variant used to flip the WHOLE group
  // into the damage-only scorer, holding groups whose "up to …" DECLINE variant is
  // pure castable value (draw X / token X with an optional rider target). When the
  // targeted scan approves nothing, fall back to the best UNTARGETED variant — the
  // decline is a legal cast by construction (CR 601.2c; expandAtoms enumerates it).
  // An all-targeted unscorable group still returns null (the existing safe hold).
  const untargeted = actions.filter((a) => !(a.targets?.length));
  if (untargeted.length) {
    return untargeted.reduce((best, a) => (xOf(a) > xOf(best) ? a : best), untargeted[0]);
  }
  return null;
}

/**
 * W7a — should the AI cast a held COUNTER, and at which stack spell? Only a
 * PURE single-target counter cast is taken (a multi-target counter+rider combo
 * — Suffocating Blast — stays held: the extra target isn't evaluated yet). The
 * target spell's CONTROLLER is resolved from state.stack (the target descriptor
 * carries only {type:'spell', id, name}); the AI NEVER counters its own spell —
 * the ownership check is the FP guard the old blanket hold existed for.
 * Threat gate: the target's PAID cost (the stack object's parsed cost — X and
 * commander tax already folded in) totals ≥ 3 mana; a cheap cantrip isn't worth
 * the card, and an unknown/null cost reads 0 → hold (the safe direction).
 * Among qualifying enemy spells, counter the most expensive (id tiebreak).
 * Returns the chosen action or null (keep holding). Deterministic.
 */
const COUNTER_THREAT_MIN_COST = 3;
function castCostTotal(cost) {
  if (!cost || typeof cost !== "object") return 0;
  let total = cost.generic || 0;
  for (const c of ["W", "U", "B", "R", "G", "C"]) total += cost[c] || 0;
  return total;
}
function pickCounterCast(state, aiPlayerId, actions) {
  let enemies;
  try { enemies = new Set(opponentsOf(state, aiPlayerId)); } catch { return null; }
  const spellById = new Map((state.stack || []).filter((o) => o?.kind === "spell").map((o) => [o.id, o]));
  let best = null;
  for (const a of actions) {
    if ((a.targets?.length || 0) !== 1) continue;       // pure single-target counters only
    const t = a.targets[0];
    if (!t || t.type !== "spell") continue;
    const obj = spellById.get(t.id);
    if (!obj || !enemies.has(obj.controller)) continue; // unknown stack object or OUR OWN spell → never
    const cost = castCostTotal(obj.cost);
    // ALT-COST: a PAID alternative cost (pitch a card / pay life / sac / bounce lands — never the free
    // kind) is a built-in 2-for-1 — it only answers a genuinely scary threat (≥5 mana), so the AI never
    // trades two cards for a mid-curve spell it could simply let resolve. Free alt-casts and normal casts
    // keep the standard ≥3 threat bar.
    const minCost = a.altCost && a.altCost.kind !== "free" ? 5 : COUNTER_THREAT_MIN_COST;
    if (cost < minCost) continue;                       // below the threat bar → not worth the counter
    if (!best || cost > best.cost || (cost === best.cost && String(t.id) < String(best.targetId))) {
      best = { action: a, cost, targetId: t.id };
    }
  }
  return best?.action || null;
}

/**
 * CHANGE THE TARGET (shelf D14 — Misdirection, Deflection, Bolt Bend, Redirect Lightning …): a pure change-target spell is cast
 * only at an OPPONENT's single-target spell or ability that is aimed at this seat or something it controls, whose effect HARMS
 * its target (atomTargetIntent "enemy" — removal, burn, a counterspell on our spell), and which the resolution can move onto an
 * opponent's side (changeTargetAlternatives offers a candidate this seat doesn't control; the resolution's auto-pick takes that
 * side for an "enemy" slot). Otherwise hold: the card's use is saving our stuff, and a redirect that can't is a card for nothing.
 * Among qualifying objects, the costliest (the biggest threat), id tiebreak — deterministic.
 */
function pickChangeTargetCast(state, aiPlayerId, actions) {
  const enemies = new Set(opponentsOf(state, aiPlayerId));
  const sideOf = (t) => (t?.type === "player" ? t.id : t?.controller);
  let best = null;
  for (const a of actions) {
    if ((a.targets?.length || 0) !== 1) continue;
    const t = a.targets[0];
    const obj = (state.stack || []).find((o) => o.id === t?.id);
    if (!obj || !enemies.has(obj.controller)) continue;           // an opponent's spell or ability only
    const orig = obj.payload?.params?.targets?.[0];
    if (!orig || sideOf(orig) !== aiPlayerId) continue;            // aimed at this seat or its stuff
    if (atomTargetIntent(atomForStackTarget(obj, orig)) !== "enemy") continue; // and it hurts what it hits
    const alternatives = changeTargetAlternatives(state, obj);
    if (!alternatives || !alternatives.some((x) => enemies.has(sideOf(x)))) continue; // somewhere on their side to send it
    const cost = castCostTotal(obj.cost);
    if (!best || cost > best.cost || (cost === best.cost && String(t.id) < String(best.targetId))) {
      best = { action: a, cost, targetId: t.id };
    }
  }
  return best?.action || null;
}

// ─── ALT-COST variant discipline (CR 601.2b/118.9 offers; ranking only — THE CREED gates nothing here) ──
//
// legalChoices' alt-cost dual offer twins each cast of an alt-carrier (Fierce Guardianship, Force of Will,
// Snuff Out …) with `altCost` payment variants. Before the normal per-card cascade scores the group, apply
// a CONSERVATIVE dominance filter so the AI pays an alternative cost only when it is clearly worth it:
//   • FREE twin (same targets/mode) → strictly dominates its normal-cost twin: same effect, zero mana.
//     Keep the free variant, drop the normal (the mana stays open for the rest of the turn).
//   • PAID twin whose normal cast is ALSO offered (the printed cost is affordable) → pay mana, never the
//     card/life/board resource. Drop the paid variant.
//   • PAID variants with NO normal twin (the printed cost was unaffordable — the only reason to pitch):
//     kept ONLY for interaction (a counter, or single-target removal — the spells worth a 2-for-1), only
//     when a life payment leaves ≥10 life, and only the single CHEAPEST payment per target (lowest-MV
//     pitch/sac candidate, id tiebreak — deterministic, never emission-order-dependent). Non-interaction
//     paid alts (Gush draw / Unmask discard / Pyrokinesis burn / Snapback bounce / Flare of Cultivation
//     tutor / Cave-In) are dropped — human-only offers, a safe false-negative.
// pol.altCost === "v1" recovers the legacy never-pay-alt arm for the A/B probe.
const ALT_REMOVAL_OPS = new Set(["destroy", "exile", "tuck"]);
function altSingleTargetRemovalProgram(program) {
  if (!program || program.structure === "modal") return false;
  const atoms = program.atoms || [];
  return atoms.length === 1 && ALT_REMOVAL_OPS.has(atoms[0].op) && !!atoms[0].targetType;
}
function altVariantKey(a) {
  const t = (a.targets || []).map((x) => String(x?.id)).sort().join(",");
  return `${t}|${a.chosenMode ?? ""}|${a.xValue ?? ""}`;
}
function altCardMv(c) { return typeof c?.cmc === "number" ? c.cmc : 0; }
function altPaymentMv(state, aiPlayerId, alt) {
  if (alt.exilePitchId) return altCardMv((state.players?.[aiPlayerId]?.hand || []).find((h) => h.id === alt.exilePitchId));
  if (alt.sacId) return altCardMv((state.players?.[aiPlayerId]?.battlefield || []).find((p) => p.id === alt.sacId)?.card);
  return 0;
}
function altResourceId(alt) { return String(alt.exilePitchId ?? alt.sacId ?? (alt.returnLandIds || []).join("+")); }
function filterAltCastVariants(state, aiPlayerId, actions) {
  if (!actions.some((a) => a.altCost)) return actions;
  const normalKeys = new Set(actions.filter((a) => !a.altCost).map(altVariantKey));
  const freeKeys = new Set(actions.filter((a) => a.altCost?.kind === "free").map(altVariantKey));
  const program = actions[0].program;
  const interaction = programContainsCounter(program) || altSingleTargetRemovalProgram(program);
  const life = state.players?.[aiPlayerId]?.life ?? 0;
  // Alt-only PAID variants: pick the single cheapest payment per (targets, mode) key.
  const bestPaidByKey = new Map();
  for (const a of actions) {
    const alt = a.altCost;
    if (!alt || alt.kind === "free") continue;
    if (normalKeys.has(altVariantKey(a))) continue;            // the affordable normal cast wins
    // BOLAS'S CITADEL (P·17): paying life for the top card IS the card — not a pitch spell's emergency mode — so a
    // life-cost cast from the top survives without being interaction, behind the same life floor below.
    if (!interaction && !a.lifeCostFromTop) continue;          // non-interaction paid alt → human-only
    if (alt.payLife && life - alt.payLife < 10) continue;      // life prudence floor
    const mv = altPaymentMv(state, aiPlayerId, alt);
    const k = altVariantKey(a);
    const cur = bestPaidByKey.get(k);
    if (!cur || mv < cur.mv || (mv === cur.mv && altResourceId(alt) < altResourceId(cur.a.altCost))) {
      bestPaidByKey.set(k, { a, mv });
    }
  }
  const keptPaid = new Set([...bestPaidByKey.values()].map((v) => v.a));
  const out = [];
  for (const a of actions) {
    if (!a.altCost) {
      if (!freeKeys.has(altVariantKey(a))) out.push(a);        // a free twin strictly dominates its normal
    } else if (a.altCost.kind === "free") {
      out.push(a);                                             // free alt-cast: always the preferred variant
    } else if (keptPaid.has(a)) {
      out.push(a);
    }
  }
  return out;
}

/**
 * W7c (AI-F4) — is the AI CLEARLY behind on the creature board? Layer-aware counts + power
 * sums over the AI's battlefield vs the UNION of every living opponent's (pod-aware — a wipe
 * answers the whole table, not one seat). Clearly behind when the table has 3+ more creatures
 * than the AI, OR the table's total power is at least double the AI's plus 6 (so an empty own
 * board vs one 7/7 qualifies, but 4-vs-2 or an empty table never does). Deterministic reads.
 */
function clearlyBehindOnBoard(state, aiPlayerId) {
  let enemies;
  try { enemies = opponentsOf(state, aiPlayerId); } catch { return false; }
  const boardOf = (pid) => (state.players?.[pid]?.battlefield || [])
    .filter((p) => { try { return permanentIsCreature(state, p.id); } catch { return false; } });
  const powerOf = (perms) => perms.reduce((s, p) => {
    try { return s + Math.max(0, permanentPower(state, p.id)); } catch { return s; }
  }, 0);
  const own = boardOf(aiPlayerId);
  let enemyCount = 0;
  let enemyPower = 0;
  for (const pid of enemies) {
    if ((state.players?.[pid]?.life ?? 0) <= 0) continue; // a dead seat's board answers nothing
    const board = boardOf(pid);
    enemyCount += board.length;
    enemyPower += powerOf(board);
  }
  if (enemyCount === 0) return false; // empty enemy boards — a wipe answers nothing
  return (enemyCount - own.length >= 3) || (enemyPower >= 2 * powerOf(own) + 6);
}

/**
 * W7b (AI-F5) — the total UNBLOCKED attacking power currently aimed at this seat's FACE:
 * attackers in state.combat attacking aiPlayerId (walker-directed rows excluded — they don't
 * hit the life total) minus every attacker already blocked (state.combat.blockers). The same
 * math pickBlockers' chump stage runs over its local structures — kept as one shared read so
 * the fog timing can never disagree with the block plan about what is incoming. Zero when the
 * AI isn't the defender in this combat.
 */
function unblockedIncomingFace(state, aiPlayerId) {
  const blocked = new Set((state.combat?.blockers || []).map((b) => b.attackerId));
  return (state.combat?.attackers || [])
    .filter((a) => a.attackingPlayer !== aiPlayerId && a.defender === aiPlayerId && !a.defenderPlaneswalkerId)
    .filter((a) => !blocked.has(a.permanentId))
    .map((a) => combatStatsOf(state, a.permanentId))
    .filter(Boolean)
    .reduce((s, a) => s + a.power, 0);
}

/**
 * W7d (AI-F7) — the AI's would-be attackers THIS turn: its battlefield creatures that could be
 * declared (untapped, not summoning-sick unless Haste, no Defender) — the SAME eligibility
 * filters legalChoices' declare-attacker enumeration applies, read here at precombat-main time
 * (before the declare-attackers step exists) so the pump timing can model the coming swing.
 */
function wouldBeAttackerIds(state, aiPlayerId) {
  return (state.players?.[aiPlayerId]?.battlefield || [])
    .filter((p) => {
      try {
        return permanentIsCreature(state, p.id)
          && !p.tapped
          // The as-though escape must be honored HERE too or the AI would never swing with a creature the
          // rules let it attack with — legalChoices' twin site carries the full rationale.
          && (!permanentHasKeyword(state, p.id, "Defender") || permanentHasKeyword(state, p.id, "attacksIgnoringDefender"))
          && (!p.summoningSick || permanentHasKeyword(state, p.id, "Haste"));
      } catch { return false; }
    })
    .map((p) => p.id);
}

/**
 * W7d (AI-F7) — would a flat +N team pump FLIP this turn's swing from non-lethal to lethal on
 * the chosen defender? Runs the SAME per-attacker describe pipeline the W4 attack filter uses
 * (block legality via eligibleBlockersFor, menace in the budget, swingIsLethalV2), once at the
 * printed powers and once at power+N. Already-lethal → false (never waste the pump); trample
 * riders ignored (a safe underestimate — the unpumped lethality check would have fired anyway).
 */
function teamPumpFlipsLethal(state, aiPlayerId, pumpPower) {
  const defenderId = chooseDefender(state, aiPlayerId);
  if (!defenderId || !state.players?.[defenderId]) return false;
  const atkIds = wouldBeAttackerIds(state, aiPlayerId);
  if (atkIds.length === 0) return false; // no attackers — nothing to pump into
  const blockers = untappedDefenderBlockers(state, defenderId);
  const rows = atkIds.map((id) => {
    const s = combatStatsOf(state, id);
    if (!s) return null;
    const eligible = eligibleBlockersFor(state, defenderId, id, blockers);
    return { power: s.power, minBlockers: minBlockersFor(state, id), eligibleCount: eligible.length };
  }).filter(Boolean);
  if (rows.length === 0) return false;
  const defenderLife = state.players[defenderId].life ?? 0;
  if (swingIsLethalV2(rows, blockers.length, defenderLife)) return false; // already lethal — don't waste it
  const pumped = rows.map((r) => ({ ...r, power: r.power + pumpPower }));
  return swingIsLethalV2(pumped, blockers.length, defenderLife);
}

/**
 * W7e (AI-F6) — which side should this Aura land on? Classified from parseAuraBonus — the SAME
 * parse the battlefield layer engine applies once the Aura attaches, so the AI's read of "what
 * this Aura does" can never disagree with what it WILL do. "own" = every granted descriptor is
 * beneficial (a non-negative P/T mod, a dynamic non-negative per-count mod, a keyword or
 * protection grant); "enemy" = every descriptor is harmful (a non-positive P/T mod, a keyword
 * removal); null = HOLD — an empty parse (the bonus machinery couldn't model the grant), a
 * mixed +/- delta, a base-P/T set (could buff or shrink depending on the body), or any
 * mixed own/enemy combination. Mirrors atomTargetIntent's ambiguous→skip discipline (CREED:
 * never guess a side — a beneficial Aura on an enemy fatty is a live FP).
 */
function auraCastIntent(card) {
  // ④-K CONTROL AURA (2026-09-03): "You control enchanted creature." steals the host — ENEMY-intent, whatever the
  // rest of the bonus says (Spirit Away's +2/+2 flying is a buff on a creature that is now OURS). Type-blind so a
  // bestow steal (Hypnotic Siren) reads the same. Before this, parseAuraBonus read [] for every control Aura (the
  // control line poisoned the parse) and the AI HELD Mind Control forever; once the bonus survives, a control Aura
  // with a positive bonus would have read as an OWN buff and been cast on the AI's own creature.
  if (grantsControlWhenAttached(card)) return "enemy";
  let bonus;
  try { bonus = parseAuraBonus(card); } catch { return null; }
  if (!Array.isArray(bonus) || bonus.length === 0) return null;
  let own = 0;
  let enemy = 0;
  for (const d of bonus) {
    const op = d?.op || {};
    if (op.layerOp === "ptModify") {
      const p = op.power || 0;
      const t = op.toughness || 0;
      if (p >= 0 && t >= 0) own++;
      else if (p <= 0 && t <= 0) enemy++;
      else return null;                                   // mixed +/- delta → ambiguous
    } else if (op.layerOp === "ptModifyDynamicCount") {
      if ((op.perPower || 0) >= 0 && (op.perToughness || 0) >= 0) own++;
      else return null;
    } else if (op.layerOp === "addKeyword" || op.layerOp === "addProtection") {
      own++;
    } else if (op.layerOp === "removeKeyword") {
      enemy++;                                            // grounding a flyer — a soft curse
    } else {
      return null;                                        // base-P/T set / future ops → unevaluable
    }
  }
  if (own > 0 && enemy > 0) return null;
  return own > 0 ? "own" : "enemy";
}

/**
 * W7e (AI-F6) — pick the Aura cast the AI should take from the card's offered per-target
 * actions, or null to HOLD. A LAND-enchant mana Aura (Wild Growth — the only isAuraSpell shape
 * whose targets aren't creatures) is offered on the caster's OWN lands only by construction
 * (legalChoices' mana-aura branch), so it's pure ramp upside: take the deterministic first
 * target. A CREATURE Aura casts on-intent only: an OWN-intent buff onto the AI's highest-power
 * creature, an ENEMY-intent curse onto the biggest enemy threat among the offered targets; an
 * unparsed/ambiguous grant, or an intent with no on-side legal target (an enemy-intent
 * "enchant creature you control" corner), HOLDS. Chooses among OFFERED actions only.
 */
function pickAuraCast(state, aiPlayerId, actions, card) {
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const opts = actions.filter((a) => (a.targets?.length || 0) === 1);
  if (opts.length === 0) return null;
  if (opts.every((a) => a.targets[0].type !== "creature")) {
    // Land mana Aura — own lands only by the offer; deterministic pick.
    return [...opts].sort((x, y) => cmp(String(x.targets[0].id), String(y.targets[0].id)))[0];
  }
  const intent = auraCastIntent(card);
  if (!intent) return null;
  let enemies;
  try { enemies = new Set(opponentsOf(state, aiPlayerId)); } catch { return null; }
  const powerOf = (id) => { try { return Math.max(0, permanentPower(state, id)); } catch { return 0; } };
  const onSide = opts.filter((a) => {
    const t = a.targets[0];
    if (t.type !== "creature") return false;
    return intent === "own" ? t.controller === aiPlayerId : enemies.has(t.controller);
  });
  if (onSide.length === 0) return null;
  return [...onSide].sort((x, y) =>
    (powerOf(y.targets[0].id) - powerOf(x.targets[0].id)) || cmp(String(x.targets[0].id), String(y.targets[0].id)))[0];
}

/**
 * The target-discipline cascade for ONE card's action group (or a kicked/unkicked
 * SUBSET of it — AI-F1 runs it once per variant set). Applies the per-shape
 * choosers (hand disruption / edicts / fights / generic targeted) and returns the
 * approved action, or null to HOLD (no good enemy target / unscorable effect).
 * Untargeted groups with no special shape return their first action unchanged.
 */
function chooseDisciplinedVariant(state, aiPlayerId, actions) {
  if (!actions.length) return null;
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
  } else if ((actions[0].program?.atoms || []).some(a => a.op === "sacrifice")) {
    // ===== EDICTS ===== (Diabolic Edict / Cruel Edict): a program-only edict targeting a player. The AI
    // only ever edicts an OPPONENT that controls a creature to lose — never itself, never a creatureless
    // player (the edict would just fizzle) — and picks the opponent with the MOST creatures. The victim
    // creature is chosen at RESOLUTION (autoPickSacrificeCandidate sacs that opponent's least valuable).
    // Restricted to a PURE single-target edict (the player is the only chosen target): a multi-target
    // edict program (e.g. Grave Exchange = graveyard-return + edict) is HELD — the AI doesn't yet pick
    // the extra target — which is safe (a miss only costs tempo). Bypasses the chooseAITarget hold below.
    const creatureCount = (pid) => (state.players?.[pid]?.battlefield || [])
      .filter(p => permanentIsCreature(state, p.id)).length;  // layer-aware: an animated man-land counts
    const oppActions = actions.filter(a => {
      if ((a.targets?.length || 0) !== 1) return false;       // pure single-target edict only
      const tid = a.targets[0]?.id;
      return tid && tid !== aiPlayerId && creatureCount(tid) > 0;
    });
    if (oppActions.length === 0) return null; // no clean opponent target → the edict fizzles / is multi-target; hold
    chosen = oppActions.reduce((best, a) => (creatureCount(a.targets[0].id) > creatureCount(best.targets[0].id) ? a : best), oppActions[0]);
  } else if ((actions[0].program?.atoms || []).some(a => a.op === "fight-pair" || a.op === "damage-target-power")) {
    // TWO-CHOSEN-TARGET fight (Prey Upon / Pounce = fight-pair; Aggressive Instinct / Rabid Bite =
    // one-way damage-target-power): each cast action carries a role-tagged pair — a `fighter` (the AI's
    // own creature, the dealer) + a `target` (the creature it hits). The generic chooser below can't
    // score a two-target program (null legacy `effect`), so pick here. Discipline: the fighter must be
    // the AI's OWN creature and the target an ENEMY (never aim it at our own board), and the fight must
    // KILL the enemy (fighter power ≥ enemy toughness) — and for the two-way fight-pair the fighter must
    // SURVIVE (enemy power < fighter toughness) so we never trade our creature into a worse one. Among
    // qualifying casts, hit the biggest enemy; if none qualifies, HOLD (a miss only costs a card, never a
    // wrong play). CREED — a confidently-bad fight (suicide / friendly-fire) is never offered.
    const oneWay = (actions[0].program.atoms).some(a => a.op === "damage-target-power");
    const enemies = new Set(opponentsOf(state, aiPlayerId));
    const lk = (id) => findPermanent(state, id)?.permanent;
    const good = [];
    for (const a of actions) {
      const fighterT = (a.targets || []).find(t => t.role === "fighter");
      const targetT = (a.targets || []).find(t => t.role === "target");
      if (!fighterT || !targetT) continue;
      if (fighterT.controller !== aiPlayerId) continue;            // our fighter must be ours
      if (!enemies.has(targetT.controller)) continue;              // the victim must be an opponent's
      const fp = lk(fighterT.id), tp = lk(targetT.id);
      if (!fp || !tp) continue;
      const fPow = Math.max(0, permanentPower(state, fighterT.id));
      const tTou = Math.max(0, permanentToughness(state, targetT.id));
      const tPow = Math.max(0, permanentPower(state, targetT.id));
      const fTou = Math.max(0, permanentToughness(state, fighterT.id));
      const fDeath = permanentHasKeyword(state, fighterT.id, "Deathtouch");
      const kills = (fDeath && fPow > 0) || (tTou > 0 && fPow >= tTou); // lethal to the enemy
      if (!kills) continue;
      if (!oneWay && tPow >= fTou) continue;                        // fight-pair: our fighter would die → skip
      good.push({ a, enemyPow: tPow });
    }
    if (good.length === 0) return null;                            // no profitable fight → hold
    chosen = good.sort((x, y) => y.enemyPow - x.enemyPow)[0].a;    // kill the biggest threat
  } else if ((actions[0].program?.atoms || []).some(a => a.op === "pump-pair")) {
    // TWO-TARGET PUMP/DEBUFF (Leeching Bite / Consume Strength / Schismotivate): each cast carries a role-tagged
    // pair — a `fighter` (gets the +buff, must be OURS) + a `target` (gets the -debuff, must be an ENEMY's). The
    // generic scorer can't handle a two-target program, so pick here. Discipline (CREED — never friendly-fire):
    // the buff lands ONLY on our creature, the debuff ONLY on an opponent's, and we cast only when the -toughness
    // debuff is LETHAL to the enemy (its layer-aware toughness ≤ |debuff|). Among killing casts, kill the biggest
    // enemy (buffing our biggest); if nothing dies (e.g. a -N/-0 power-only debuff), HOLD — a miss only costs a card.
    const enemies = new Set(opponentsOf(state, aiPlayerId));
    const lk = (id) => findPermanent(state, id)?.permanent;
    const debuffT = (actions[0].program.atoms.find(a => a.op === "pump-pair")?.debuffDelta?.t) || 0; // ≤ 0
    const good = [];
    for (const a of actions) {
      const fighterT = (a.targets || []).find(t => t.role === "fighter"); // +buff → ours
      const targetT = (a.targets || []).find(t => t.role === "target");   // -debuff → enemy's
      if (!fighterT || !targetT) continue;
      if (fighterT.controller !== aiPlayerId) continue;            // the buff must land on OUR creature
      if (!enemies.has(targetT.controller)) continue;              // the debuff must hit an ENEMY's creature
      if (!lk(fighterT.id) || !lk(targetT.id)) continue;
      const tTou = Math.max(0, permanentToughness(state, targetT.id));
      if (debuffT >= 0 || tTou <= 0 || tTou > -debuffT) continue;  // the -toughness debuff must be lethal
      good.push({ a, enemyPow: Math.max(0, permanentPower(state, targetT.id)), buffPow: Math.max(0, permanentPower(state, fighterT.id)) });
    }
    if (good.length === 0) return null;                            // no lethal debuff → hold
    chosen = good.sort((x, y) => (y.enemyPow - x.enemyPow) || (y.buffPow - x.buffPow))[0].a; // kill the biggest, buff our biggest
  } else if (actions.some(a => a.targets?.length)) {
    // A targeted spell: only cast on a good ENEMY target. chooseAITarget filters to
    // enemies for the scorable legacy effects (damage/destroy); for spells it can't
    // score yet (effect == null — the P2.7 extended atoms tap/bounce/exile/counters)
    // it returns null, so the AI HOLDS them rather than aim removal at its own board.
    const options = actions.map(a => a.targets?.[0]).filter(Boolean);
    const target = effect ? chooseAITarget(state, aiPlayerId, effect, options) : null;
    if (!target) return null;
    chosen = actions.find(a => a.targets?.[0]?.id === target.id) || actions[0];
  }
  return chosen;
}

/**
 * Pick the best cast-spell action via archetype-aware scoring. A targeted
 * spell appears once per legal target; we group by card, score each spell
 * once, and for targeted spells choose the AI's best enemy target — skipping
 * a targeted spell entirely when there's no good target (so the AI never
 * burns/destroys its own creatures). Returns null if nothing worth casting.
 */
function pickCastAction(state, aiPlayerId, castActions, archetype, pol = {}) {
  if (castActions.length === 0) return null;

  const byCard = new Map();
  for (const action of castActions) {
    if (!byCard.has(action.cardId)) byCard.set(action.cardId, []);
    byCard.get(action.cardId).push(action);
  }

  const scored = [];
  for (const [cardId, groupActions] of byCard) {
    // ALT-COST variant discipline (see filterAltCastVariants): free twins replace their normal casts, paid
    // alts survive only as interaction-of-last-resort. policy "v1" = the legacy never-pay arm (probe).
    // TEAMWORK (shelf D16): tapping creatures is a real cost — they can't attack, or block on the next turn — so the AI pays
    // teamwork only when every creature it taps is summoning-sick (crew's take-it signal, `teamworkFree`); any other teamwork
    // variant is dropped here, before every chooser below, and the card is cast plain.
    const actions = (pol.altCost === "v1"
      ? groupActions.filter((a) => !a.altCost)
      : filterAltCastVariants(state, aiPlayerId, groupActions)).filter((a) => !a.teamworkTapIds || a.teamworkFree);
    if (actions.length === 0) continue; // every variant filtered (e.g. an imprudent alt-only paid cast) → hold
    // ADVENTURE: an adventure action projects the half actually being cast as `faceCard`
    // (creature half from hand/exile, or the Adventure spell half) — score THAT face, not
    // the combined card, so the pick reflects what will really resolve.
    const card = actions[0].faceCard || cardFromHand(state, aiPlayerId, cardId, actions[0].fromPlayerId);
    if (!card) continue; // card vanished
    // PLAY-HINTS (default-off — docs/orchestration/PLAY-HINTS-LEDGER.md): pol.playHints threads the
    // ledger map (or `true` for pure derivation). lookupPlayHint is TOTAL — ledger entry first, derived
    // role otherwise — so with hints on, every card (parked included) carries a play identity. Absent →
    // hint null → the legacy scorer, byte-identical (frozen trajectory hashes untouched).
    const hint = pol.playHints ? lookupPlayHint(pol.playHints === true ? null : pol.playHints, card) : null;
    // AI-F2 — UNRESOLVABLE SPELLS: a LOW-confidence instant/sorcery whose program carries ZERO
    // runnable atoms (and no legacy `effect`, no chosen target) resolves as markPendingArbiter —
    // in self-play the spell just VANISHES (the Tier-1 breakage census's spell-unresolved rows:
    // Ember Island Production / Reality Shift / Teferi's Protection). Casting it burns the card
    // + mana for literally nothing, so HOLD it. Ranking-only (the action stays offered by
    // legalChoices — THE CREED gates nothing here); the zero-atoms clause is belt-and-suspenders
    // so a partial LOW model that still runs atoms is not over-held. parseEffectProgram returns
    // null for permanents, so this can never suppress a creature/permanent cast. policy
    // 'v1' (`unresolvable`) recovers the legacy cast-it-anyway for the A/B probe.
    if (pol.unresolvable !== "v1" && actions[0].program && programConfidence(actions[0].program) !== "high"
      && !actions[0].effect && !(actions[0].targets?.length) && !(actions[0].program.atoms || []).length) continue;
    // W7a — COUNTERS: cast a held counter at a threatening ENEMY spell on the
    // stack (ownership resolved via state.stack — the AI never counters its OWN
    // spell, the FP guard the old blanket hold existed for). Only pure
    // single-target counters fire; counter+rider multi-target combos
    // (Suffocating Blast) and sub-threshold/unknown-cost targets stay held.
    // policy 'v1' recovers the legacy hold-everything for the A/B probe.
    // SHELF-85 V12 (2026-09-04 — Final Fortune / Last Chance / Warrior's Oath): a spell that schedules its caster's OWN
    // loss ("at the beginning of that turn's end step, you lose the game") is a gamble the AI never takes — it has no
    // "I win this extra turn" oracle, and casting it otherwise is the one play that ends its game. A human may.
    if ((actions[0].program?.atoms || []).some((a) => (a.op === "schedule-delayed" && /\byou lose the game\b/i.test(String(a.delayedClause || ""))) || (a.op === "win-game" && a.outcome === "lose" && a.who === "controller"))) continue; // + One with Death's immediate "you lose the game"
    if (programContainsCounter(actions[0].program)) {
      if (pol.counter === "v1") continue;
      const counterPick = pickCounterCast(state, aiPlayerId, actions);
      if (!counterPick) continue; // no on-side threatening target → keep holding
      scored.push({ action: counterPick, score: scoreCastAction(actions[0], card, archetype, hint, state, aiPlayerId), cmc: actions[0].cmc || 0 });
      continue;
    }
    // CHANGE THE TARGET (shelf D14): a pure change-target spell fires only as a redirect of an opponent's harmful spell or
    // ability aimed at this seat's stuff (pickChangeTargetCast); otherwise it is held, as every unscorable targeted spell is.
    // (A modal carrier — Untimely Malfunction — keeps the generic path's hold for now.)
    const ctAtoms = actions[0].program?.atoms || [];
    if (ctAtoms.length && ctAtoms.every((a) => a.op === "change-target")) {
      const redirectPick = pickChangeTargetCast(state, aiPlayerId, actions);
      if (!redirectPick) continue;
      scored.push({ action: redirectPick, score: scoreCastAction(actions[0], card, archetype, hint, state, aiPlayerId), cmc: actions[0].cmc || 0 });
      continue;
    }
    // W7c (AI-F4) — BOARD WIPES: cast a held symmetric wipe when the AI is CLEARLY behind on
    // the creature board (3+ creatures down, or facing double-plus-6 total power — summed over
    // the whole table, pod-aware); otherwise keep holding. Only a CREATURE wipe unlocks — the
    // behind-metric says nothing about lands/artifacts, so Armageddon-class mass removal keeps
    // the unconditional hold. A qualifying wipe FALLS THROUGH the cascade: an untargeted Wrath
    // scores like any sorcery; an X-scaled wipe (Black Sun's Zenith) still sizes X via the
    // X-sizing branch below. Sorcery-speed timing is the OFFER side's (legalChoices), so a
    // "when behind" cast lands in the AI's own main. policy 'v1' recovers hold-always (probe).
    if (programContainsMassRemoval(actions[0].program)) {
      if (pol.wipe === "v1"
        || !programContainsCreatureMassRemoval(actions[0].program)
        || !clearlyBehindOnBoard(state, aiPlayerId)) continue;
    }
    // W7d (AI-F7) — TEAM PUMP (Overrun / Trumpet Blast): cast it in the AI's OWN precombat
    // main ONLY when the flat +N flips this turn's swing from non-lethal to LETHAL on the
    // chosen defender (the W4 describe pipeline at power+N; already-lethal → keep holding, the
    // pump would be wasted). A dynamic/filtered/X pump (teamPumpAmount null) is unevaluable →
    // keep holding, the legacy-safe direction. policy 'v1' recovers hold-always for the probe.
    if (programContainsTeamPump(actions[0].program)) {
      if (pol.pump === "v1") continue;
      if (state.activePlayer !== aiPlayerId || state.phase !== "precombat-main") continue;
      const pumpPower = teamPumpAmount(actions[0].program);
      if (pumpPower == null || pumpPower <= 0) continue;
      if (!teamPumpFlipsLethal(state, aiPlayerId, pumpPower)) continue;
    }
    // W7b (AI-F5) — FOG: cast it exactly when it saves the game — mid-combat (declare-blockers
    // / combat-damage) with the UNBLOCKED power aimed at this seat's face ≥ its life. Counting
    // only attacks on THIS seat's face makes "the AI is the defender" implicit, so the own-turn
    // self-fog risk the old blanket hold guarded against can't arise (the AI's own attack never
    // aims at itself). Below-lethal pressure keeps holding — the card is worth more at the
    // moment it wins the game. policy 'v1' recovers hold-always for the probe.
    if (programContainsFog(actions[0].program)) {
      if (pol.fog === "v1") continue;
      if (state.step !== "declare-blockers" && state.step !== "combat-damage") continue;
      const life = state.players?.[aiPlayerId]?.life ?? 0;
      if (life <= 0 || unblockedIncomingFace(state, aiPlayerId) < life) continue;
    }
    // W7e (AI-F6) — AURAS: cast on-intent only. The grant side comes from parseAuraBonus (the
    // SAME parse the layer engine applies on attach, so the read can't drift): a beneficial
    // grant → the AI's own highest-power creature; a harmful grant → the biggest enemy threat
    // among the offered targets; an unparsed/ambiguous grant, or no on-side legal target,
    // HOLDS (CREED — never hang a buff on an enemy). A land mana Aura (Wild Growth) is offered
    // on own lands only, so it casts as pure ramp. policy 'v1' recovers hold-always (probe).
    if (actions[0].isAuraSpell) {
      if (pol.aura === "v1") continue;
      const auraPick = pickAuraCast(state, aiPlayerId, actions, card);
      if (!auraPick) continue;
      scored.push({ action: auraPick, score: scoreCastAction(actions[0], card, archetype, hint, state, aiPlayerId), cmc: actions[0].cmc || 0 });
      continue;
    }
    // W5 — X-SPELL SIZING: an X card is offered once per affordable X (× target
    // combo). The legacy path fell through to actions[0] — always X=1 — burning
    // near-total value on every X card. Choose the right X via pickXCast; hold
    // when it has no on-side use. Sort-key parity: score/cmc still come from the
    // group's first action (the smallest X), so sizing changes WHICH X is cast,
    // never where the card ranks against the rest of the hand.
    if (pol.xSizing !== "v1" && actions.some((a) => a.xValue != null)) {
      const xChosen = pickXCast(state, aiPlayerId, actions);
      if (!xChosen) continue; // no killable threat / no legal face → hold
      scored.push({ action: xChosen, score: scoreCastAction(actions[0], card, archetype, hint, state, aiPlayerId), cmc: actions[0].cmc || 0 });
      continue;
    }
    // KICKER (CR 702.33): a kicker card is emitted as a normal cast plus — when the kicker mana is also
    // affordable — a `kicked:true` cast (legalChoices only offers the kicked option when payable). For the
    // modeled kicked payoffs the kicked play adds strictly more value on the identical base, so paying the
    // kicker is the higher-value play — prefer it when offered. This is the AI's "decide yes/no by value":
    // pay when affordable (the kicked action exists), else cast normally.
    const kickedActions = actions.filter(a => a.kicked === true);
    if (kickedActions.length && kickedActions.every(a => !(a.targets?.length))) {
      // TARGETLESS kicked group — kicker CREATURES (counter + ETB variants always emit targets:[]) and
      // untargeted kicked-spell-effects: no aiming to get wrong, take the kicked cast (legacy behavior).
      // MULTIKICKER (P·15): one kicked cast per affordable kick count — take the most kicks, since each adds to the
      // payoff (a counter, a token, 2 life). A single kicker has one kicked cast, so this is that cast.
      const kickPick = kickedActions.reduce((best, a) => ((a.kickCount || 1) > (best.kickCount || 1) ? a : best), kickedActions[0]);
      scored.push({ action: kickPick, score: scoreCastAction(kickPick, card, archetype, hint, state, aiPlayerId), cmc: kickPick.cmc || 0 });
      continue;
    }
    if (kickedActions.length) {
      // AI-F1 — TARGETED kicked group (kicked-spell-effect, CR 702.33e: Into the Roil / Blink of an Eye /
      // Hurloon Battle Hymn). The old short-circuit cast the FIRST enumerated kicked combo — seat-order
      // targeting that aimed bounce/removal at the AI's OWN permanents. Route the kicked variants through
      // the SAME discipline cascade as every other targeted spell, preferring kicked-when-approved, then
      // the unkicked remainder; when neither is approved (e.g. bounce — no scorer yet) the card is HELD,
      // the same safe hold the unkicked path already took.
      const unkicked = actions.filter(a => a.kicked !== true);
      const chosen = chooseDisciplinedVariant(state, aiPlayerId, kickedActions)
        ?? chooseDisciplinedVariant(state, aiPlayerId, unkicked);
      if (!chosen) continue;
      scored.push({ action: chosen, score: scoreCastAction(chosen, card, archetype, hint, state, aiPlayerId), cmc: chosen.cmc || 0 });
      continue;
    }
    const chosen = chooseDisciplinedVariant(state, aiPlayerId, actions);
    if (!chosen) continue;
    scored.push({ action: chosen, score: scoreCastAction(actions[0], card, archetype, hint, state, aiPlayerId), cmc: actions[0].cmc || 0 });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score || a.cmc - b.cmc);
  // M5.1 — expose the final ranking (top 5) for the decision recorder (see the side-channel note
  // above pickAction). Raw scores, ascending = best-first; read-and-cleared by takeLastCastRanking.
  _lastCastRanking = scored.slice(0, 5).map((s) => ({ cardId: s.action.cardId ?? null, name: s.action.name ?? null, score: s.score }));
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

// ─── Combat policy math (shared by the block plan + the attack filter) ────────

/** Deathtouch on a permanent (layer-aware), guarded against bad ids. */
function hasDeathtouch(state, permanentId) {
  try { return permanentHasKeyword(state, permanentId, "Deathtouch"); } catch { return false; }
}

/** SET-level minimum block size for an attacker (menace's 2 / the printed "except by <N> or more creatures"
 * / the Howlbonder team static — attackerMinBlockers, layer-aware; BLITZ EV-3), guarded against bad ids.
 * 1 = unrestricted. */
function minBlockersFor(state, permanentId) {
  try { return attackerMinBlockers(state, permanentId); } catch { return 1; }
}

/** Derived combat stats of a live permanent, or null when it can't be resolved. */
function combatStatsOf(state, permanentId) {
  try {
    if (!findPermanent(state, permanentId)?.permanent) return null;
    return {
      id: permanentId,
      power: Math.max(0, permanentPower(state, permanentId)),
      toughness: permanentToughness(state, permanentId),
      firstStrike: hasFirstStrike(state, permanentId),
      deathtouch: hasDeathtouch(state, permanentId),
    };
  } catch { return null; }
}

/**
 * Outcome of one attacker/blocker duel (POLICY math, not rules execution — the
 * real combat step stays combatResolution.js; this only RANKS offered actions).
 * Honors first/double-strike asymmetry (the lone first-striker kills before
 * taking damage back, CR 510.5) and deathtouch (any nonzero hit is lethal,
 * CR 702.2b). Both stat objects come from combatStatsOf (derived, layer-aware).
 */
function combatDuel(att, blk) {
  const aHit = (att.deathtouch && att.power > 0) || (blk.toughness > 0 && att.power >= blk.toughness);
  const bHit = (blk.deathtouch && blk.power > 0) || (att.toughness > 0 && blk.power >= att.toughness);
  if (blk.firstStrike && !att.firstStrike) {
    const attackerDies = bHit;
    return { attackerDies, blockerDies: attackerDies ? false : aHit };
  }
  if (att.firstStrike && !blk.firstStrike) {
    const blockerDies = aHit;
    return { attackerDies: blockerDies ? false : bHit, blockerDies };
  }
  return { attackerDies: bHit, blockerDies: aHit };
}

/**
 * Pick blocking assignments (W3 — block plan v2). Per attacker, in threat order
 * (power desc), with one blocker per attacker (the per-tick driver drains one
 * block per tick and excludes already-blocked attackers):
 *   1. VALUE block — a blocker that kills it AND survives → smallest such blocker;
 *   2. TRADE block — kills it but dies: taken only when trading up or even
 *      (attacker power ≥ blocker power — never feed a bigger body to a smaller one);
 *   3. CHUMP — ONLY under lethal pressure (total unblocked incoming face damage
 *      ≥ our life): soak the biggest attackers with the smallest spare blockers;
 *   4. otherwise NO BLOCK — take the damage. (The legacy policy chump-blocked
 *      EVERY attacker with its smallest creature, feeding the whole board away
 *      one 1/1 at a time; `pol.block === "v1"` recovers it for the A/B probe.)
 * A MENACE attacker is never single-blocked: one blocker resolves as unblocked
 * (CR 509.1c — combatResolution treats it as unblocked), so the block would be a
 * pure no-op. (Double-block support is a parked follow-on — the per-tick driver
 * currently assigns at most one blocker per attacker.)
 * Legality is entirely the offered set's (legalChoices already ran
 * canBlockAttacker); this function only ranks what was offered. Deterministic:
 * attackers by power desc then id; blockers by power asc then id.
 */
function pickBlockers(blockerActions, state, aiPlayerId, pol = {}) {
  if (blockerActions.length === 0) return [];

  if (pol.block === "v1") {
    // BLOCK-V1 (legacy, probe-only): chump EVERY attacker with the smallest blocker.
    const assigned = new Map();
    const sorted = [...blockerActions].sort((a, b) => {
      const aPow = Math.max(0, permanentPower(state, a.permanentId));
      const bPow = Math.max(0, permanentPower(state, b.permanentId));
      return aPow - bPow;
    });
    for (const action of sorted) {
      if (!assigned.has(action.attackerId)) assigned.set(action.attackerId, action);
    }
    return [...assigned.values()];
  }

  // Group the offered blocks per attacker; resolve stats once per participant.
  const byAttacker = new Map();
  for (const action of blockerActions) {
    if (!byAttacker.has(action.attackerId)) byAttacker.set(action.attackerId, []);
    byAttacker.get(action.attackerId).push(action);
  }
  const blockerStats = new Map();
  for (const action of blockerActions) {
    if (!blockerStats.has(action.permanentId)) blockerStats.set(action.permanentId, combatStatsOf(state, action.permanentId));
  }

  const byId = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const plan = [];
  const usedBlockers = new Set();
  const blockedAttackers = new Set();
  // PAIRWISE MUST-BLOCK (the 09-06 plan's stage ③ · 13, 2026-09-30 — "Target creature blocks this creature this turn if able":
  // Trumpeting Armodon, Matsu-Tribe Decoy, Tangle Angler …): a requirement on ONE blocker toward ONE attacker (CR 509.1c), the
  // endOfTurn `mustBlockSource:<attackerId>` keyword the atom grants. Seeded FIRST, whenever that exact pair is among the LEGAL
  // block actions (byAttacker is pre-filtered through canBlockAttacker, so "if able" already excludes every restriction). CR
  // 509.1c asks for the most requirements obeyed without breaking a restriction, so a menace / ≥N attacker takes the forced
  // blocker(s) PLUS the fewest others that make the block legal — the smallest power, then id, the MUST-BE-BLOCKED recruiting
  // order below; with too few left, the block can't be completed and nothing is seeded. Same house bar as LURE and MUST-ATTACK
  // below: the AI seat complies; the human seat is never hard-gated.
  for (const attId of [...byAttacker.keys()].sort(byId)) {
    const offered = (byAttacker.get(attId) || []).filter((action) => !usedBlockers.has(action.permanentId));
    const forced = offered.filter((action) => permanentHasKeyword(state, action.permanentId, `mustBlockSource:${attId}`));
    if (!forced.length) continue;
    const need = minBlockersFor(state, attId);
    const helpers = offered.filter((action) => !forced.includes(action))
      .map((action) => ({ action, stats: blockerStats.get(action.permanentId) }))
      .filter((c) => c.stats)
      .sort((x, y) => (x.stats.power - y.stats.power) || byId(x.stats.id, y.stats.id))
      .slice(0, Math.max(0, need - forced.length))
      .map((c) => c.action);
    if (forced.length + helpers.length < need) continue;
    for (const action of [...forced, ...helpers]) {
      plan.push(action);
      usedBlockers.add(action.permanentId);
    }
    blockedAttackers.add(attId);
  }
  // LURE (BLITZ LU-1, CR 509.1c — "All creatures able to block this creature do so": Taunting Elf /
  // Prized Unicorn / Elvish Bard / Breaker of Armies / Noxious Toad kin): a BLOCK REQUIREMENT, enforced
  // at the AI block plan exactly like MUST-ATTACK (CR 508.1a) is at pickAttackPlan — the versioned house
  // bar for combat requirements (the human seat is never hard-gated; coverage's credit states the same
  // bar). blockerActions are pre-filtered to LEGAL blocks upstream (canBlockAttacker — "able" already
  // excludes cantBlock/restrictions, CR 509.1c requirements never override restrictions), so EVERY
  // offered blocker for a lure-carrying attacker is force-assigned here, BEFORE the value heuristic
  // runs. A blocker able to block two lured attackers goes to the first in attacker-id order — with
  // conflicting requirements the CR accepts any legal maximum; deterministic + documented. The normal
  // heuristic then plans the rest around the pre-seeded assignments.
  {
    // LU-2: a THIS-TURN lure marker (Alluring Scent / Taunting Challenge / Mortipede's activation —
    // state.lureThisTurn[permId] === the current turn) requires blocks exactly like the printed line;
    // it self-expires when the turn number moves on (the FOG-1 latch pattern). The printed read is
    // lureFilterOf (BLITZ CS-1 — the LU-1 regex generalized in combatEvasion, ONE core shared with the
    // classifier mirror): the bare form forces EVERY offered blocker, Talruum Piper's "with flying"
    // filter forces only the FLYING ones (layer-aware — a granted flying counts).
    const luredAttackers = [...byAttacker.keys()].map((attId) => {
      if ((state.lureThisTurn || {})[attId] === state.turn) return { attId, filter: null };
      const lk = findPermanent(state, attId);
      const lu = lk ? lureFilterOf(lk.permanent.card) : null;
      return lu ? { attId, filter: lu.filter } : null;
    }).filter(Boolean).sort((a, b) => byId(a.attId, b.attId));
    for (const { attId, filter } of luredAttackers) {
      for (const { action } of candidatesForLure(attId, filter)) {
        plan.push(action);
        usedBlockers.add(action.permanentId);
        blockedAttackers.add(attId);
      }
    }
    function candidatesForLure(attackerId, filter) {
      return (byAttacker.get(attackerId) || [])
        .map((action) => ({ action }))
        .filter((c) => !usedBlockers.has(c.action.permanentId))
        .filter((c) => !filter || permanentHasKeyword(state, c.action.permanentId, filter));
    }
  }
  const candidatesFor = (attackerId) => (byAttacker.get(attackerId) || [])
    .map((action) => ({ action, stats: blockerStats.get(action.permanentId) }))
    .filter((c) => c.stats && !usedBlockers.has(c.action.permanentId))
    .sort((x, y) => (x.stats.power - y.stats.power) || byId(x.stats.id, y.stats.id));
  const take = (pick, attackerId) => {
    plan.push(pick.action);
    usedBlockers.add(pick.action.permanentId);
    blockedAttackers.add(attackerId);
  };

  // Attackers in threat order. An attacker we can't resolve (bare/corrupt state —
  // real boards always resolve) is skipped: blocks are optional, and with no stats
  // a block can't be judged profitable.
  const attackers = [...byAttacker.keys()]
    .map((id) => combatStatsOf(state, id))
    .filter(Boolean)
    .sort((a, b) => (b.power - a.power) || byId(a.id, b.id));

  for (const att of attackers) {
    if (minBlockersFor(state, att.id) > 1) continue; // a single block on a menace/≥N attacker is a no-op
    const candidates = candidatesFor(att.id);
    let pick = candidates.find(({ stats }) => {
      const { attackerDies, blockerDies } = combatDuel(att, stats);
      return attackerDies && !blockerDies; // VALUE: kills it, survives it
    });
    if (!pick) {
      pick = candidates.find(({ stats }) => {
        const { attackerDies, blockerDies } = combatDuel(att, stats);
        return attackerDies && blockerDies && att.power >= stats.power; // TRADE up/even
      });
    }
    if (pick) take(pick, att.id);
  }

  // MUST-BE-BLOCKED (BLITZ CS-1, CR 509.1c — Riveteers Decoy / Goblin Fire Fiend / Gaea's Protector
  // class): "This creature must be blocked if able." requires the block to CONTAIN it — satisfied by a
  // minimum legal block (normally ONE blocker; a granted menace/≥N needs minBlockersFor many, and with
  // too few unused candidates the requirement is unobeyable → no forced block, CR 509.1c's "maximum
  // possible number of requirements … without disobeying any restrictions"). Runs AFTER the value
  // heuristic: a value/trade block (or a lure force, or an earlier tick's declared block) already
  // satisfies the requirement, so this seeds a forced chump ONLY for a carrier the plan left unblocked
  // — the same versioned house bar as LURE/MUST-ATTACK (AI seats comply; the human seat is never
  // hard-gated). Deterministic: attackers by id; forced blockers are the smallest-power unused
  // candidates, power asc then id.
  {
    const declaredEarlier = new Set((state.combat?.blockers || []).map((b) => b.attackerId));
    const mustIds = [...byAttacker.keys()].filter((attId) => {
      if (blockedAttackers.has(attId) || declaredEarlier.has(attId)) return false;
      const lk = findPermanent(state, attId);
      return !!lk && mustBeBlockedIfAble(lk.permanent.card);
    }).sort(byId);
    for (const attId of mustIds) {
      const need = minBlockersFor(state, attId);
      const cands = (byAttacker.get(attId) || [])
        .filter((action) => !usedBlockers.has(action.permanentId))
        .map((action) => ({ action, stats: blockerStats.get(action.permanentId) }))
        .filter((c) => c.stats)
        .sort((x, y) => (x.stats.power - y.stats.power) || byId(x.stats.id, y.stats.id));
      if (cands.length < need) continue; // a legal block can't be completed → not required (CR 509.1c)
      for (const c of cands.slice(0, need)) {
        plan.push(c.action);
        usedBlockers.add(c.action.permanentId);
        blockedAttackers.add(attId);
      }
    }
  }

  // CHUMP stage — only when the remaining unblocked FACE damage is lethal.
  // Walker-directed attacks don't hit our life total; already-declared blocks
  // (state.combat.blockers — earlier ticks) and this plan's blocks are excluded.
  const alreadyBlocked = new Set((state.combat?.blockers || []).map((b) => b.attackerId));
  const faceAttackers = (state.combat?.attackers || [])
    .filter((a) => a.attackingPlayer !== aiPlayerId && a.defender === aiPlayerId && !a.defenderPlaneswalkerId)
    .map((a) => combatStatsOf(state, a.permanentId))
    .filter(Boolean);
  const unblockedFace = () => faceAttackers.filter((a) => !alreadyBlocked.has(a.id) && !blockedAttackers.has(a.id));
  let incoming = unblockedFace().reduce((s, a) => s + a.power, 0);
  const life = state.players?.[aiPlayerId]?.life ?? 0;
  if (life > 0 && incoming >= life) {
    const targets = unblockedFace().sort((a, b) => (b.power - a.power) || byId(a.id, b.id));
    for (const t of targets) {
      if (incoming < life) break;
      if (minBlockersFor(state, t.id) > 1) continue; // a lone chump on a menace/≥N attacker absorbs nothing
      const candidates = candidatesFor(t.id);
      if (candidates.length === 0) continue;
      take(candidates[0], t.id); // smallest spare blocker soaks the biggest attacker
      incoming -= t.power;
    }
  }

  return plan;
}

// ─── Loyalty-ability piloting (PW-3) ────────────────────────────────────────────

/**
 * The atoms of a modeled loyalty ability's effect program (non-modal — `modeled` requires it).
 */
function loyaltyAtoms(action) {
  return action.program?.atoms || [];
}

/**
 * Is this loyalty action SAFE + on-intent for the AI to activate? A non-targeted ability is always
 * safe. A targeted ability is safe only when every chosen target sits on its atom's intended side —
 * a harmful atom (removal/damage/−X−X, intent "enemy") aimed at an OPPONENT, a beneficial atom
 * (buff/+1/+1/own, intent "own") aimed at the AI's OWN permanent. An ambiguous-intent targeted atom
 * is rejected (don't risk hitting the wrong side) — mirrors the trigger chooser's discipline.
 */
function loyaltyActionSafe(state, aiPlayerId, action) {
  const targets = action.targets || [];
  if (targets.length === 0) return true;
  let enemies;
  try { enemies = new Set(opponentsOf(state, aiPlayerId)); } catch { return false; }
  const atoms = loyaltyAtoms(action);
  const sideOf = (t) => (t.type === "player" ? t.id : t.controller);
  return targets.every((t) => {
    const intent = atomTargetIntent(atoms[t.atomIndex]);
    if (intent === "enemy") return enemies.has(sideOf(t));
    if (intent === "own") return sideOf(t) === aiPlayerId;
    return false; // ambiguous targeted atom → skip rather than risk the wrong side
  });
}

/** Value of activating a loyalty action: removal/damage on an enemy is impactful; otherwise build loyalty. */
function loyaltyActionScore(action) {
  const atoms = loyaltyAtoms(action);
  const harmful = (action.targets || []).some((t) => atomTargetIntent(atoms[t.atomIndex]) === "enemy");
  if (harmful) return 100;                          // an enemy-side removal/damage ability
  return 40 + Math.max(0, action.costDelta || 0);   // build loyalty; prefer a higher +N
}

/**
 * Pick the best MODELED loyalty ability for the AI to activate this turn (the caller pre-filters out
 * Arbiter-routed ones so self-play never stalls). Among safe/on-intent actions, prefer an enemy-side
 * removal, else the highest loyalty-building +N. Returns null when nothing is safe (the AI then
 * leaves that walker alone this turn). Deterministic → serialize-stable.
 */
export function pickLoyaltyAction(state, aiPlayerId, loyaltyActions) {
  const safe = (loyaltyActions || []).filter((a) => loyaltyActionSafe(state, aiPlayerId, a));
  if (safe.length === 0) return null;
  return safe.slice().sort((a, b) => loyaltyActionScore(b) - loyaltyActionScore(a))[0];
}

// ─── W6 (AI-F3) — activated-ability piloting ──────────────────────────────────

/**
 * Slice 1 — EQUIP: attach each equipment to the AI's BEST creature (highest derived power via
 * permanentPower — layers.js, so anthems/counters/the equipment's own bonus all count), id
 * tiebreak. Equip targets are the AI's OWN creatures by construction (legalChoices enumerates
 * the controller's battlefield only, CR 702.6e), so there is no side to get wrong — only
 * PROFITABILITY: skip when the equipment already sits on the chosen best body (a no-op
 * re-equip), and only MOVE an attached equipment onto a STRICTLY higher-power body. The
 * strict-improvement rule is also the TERMINATION guard (recon-flagged loop risk): once the
 * equipment sits on the best body — whose derived power now includes the equipment's own
 * bonus — no offered target ranks strictly higher, so a free equip (Lightning Greaves {0})
 * can never oscillate. Equipment are visited in id order; one equip per tick.
 */
function pickEquipAction(state, aiPlayerId, equipActions) {
  if (!equipActions.length) return null;
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const powerOf = (id) => { try { return Math.max(0, permanentPower(state, id)); } catch { return 0; } };
  const byEquip = new Map();
  for (const a of equipActions) {
    if ((a.targets?.length || 0) !== 1) continue;
    if (!byEquip.has(a.permanentId)) byEquip.set(a.permanentId, []);
    byEquip.get(a.permanentId).push(a);
  }
  for (const equipId of [...byEquip.keys()].sort(cmp)) {
    const best = byEquip.get(equipId).slice().sort((x, y) =>
      (powerOf(y.targets[0].id) - powerOf(x.targets[0].id)) || cmp(String(x.targets[0].id), String(y.targets[0].id)))[0];
    const holder = findPermanent(state, equipId)?.permanent?.attachedTo ?? null;
    if (holder === best.targets[0].id) continue;                        // already on the best body
    if (holder != null && powerOf(best.targets[0].id) <= powerOf(holder)) continue; // move on strict improvement only
    return best;
  }
  return null;
}

/**
 * Slice 2 — generic MODELED activated abilities, conservative whitelist. Activate only when
 * every one of these holds (anything else keeps the legacy never-activate — a held ability
 * only costs value, never a wrong play):
 *   - the ability carries a fully-modeled effect program whose every atom is an UNTARGETED
 *     pure-upside op (draw / create-token / scry / surveil / gain-life) — no targets to aim
 *     wrong, no side to get wrong, resolvable without the Arbiter;
 *   - the COST is the safe subset: {T} and/or mana only — no sacrifice (self/other/N/X), no
 *     exile-self, no counter removal, no life payment, no tap-another, no land bounce, no
 *     modal/X choice (each of those is a real cost the AI can't yet value);
 *   - it either taps the source or costs ≥1 mana — the per-turn TERMINATION bound (a free
 *     non-tapping ability would be re-offered forever).
 * Rank: draw > token > scry/surveil > lifegain, then cheapest, then name/id — deterministic.
 */
const SAFE_ABILITY_OPS = new Map([["draw", 0], ["create-token", 1], ["scry", 2], ["surveil", 2], ["gain-life", 3]]);
// LEVEL UP (BLITZ LV-1): a level-up activation is the single untargeted atom
// {op:"add-named-counter-self", counterType:"level"}. Within the modeled set it is PURE UPSIDE by
// construction — legalChoices offers level-up ONLY on a WHOLLY-modeled leveler (modeledLeveler), whose
// bands can only set base P/T and grant closed-vocabulary keywords — so spending leftover main-phase
// mana on it is never a wrong play. Ranked LAST (after draw/token/scry/lifegain) so it only soaks mana
// no better safe activation wants; the existing cmc>=1 bound is the termination guard (every printed
// level-up cost is >=1 mana). A named counter OTHER than "level" stays outside the whitelist (its
// value isn't knowable in general).
function isLevelUpAtomList(atoms) {
  return atoms.length === 1 && atoms[0].op === "add-named-counter-self" && atoms[0].counterType === "level";
}
// CLASS LEVEL (CR 716.2a): the class level bar's activation is the single untargeted atom {op:"class-level-become"}.
// It is offered ONLY on a WHOLLY-modeled Class (coverage.modeledClassCard), whose every gained ability the engine
// plays, and gaining a level never removes one (the printed rulings) — so, like a leveler's level up, it soaks leftover
// main-phase mana at the same last rank. Termination is structural: each bar is offered only at the level below it,
// so a Class can be levelled at most once per bar, and every printed bar costs at least one mana.
function isClassLevelUpAtomList(atoms) {
  return atoms[0].op === "class-level-become"; // the bar's program is that one atom (effects/abilities.classLevelUpAbilities)
}
/**
 * COMBAT-ROLE ACTIVATIONS (④-AP, 2026-09-04 — the play-quality half of ④-AE's combat window). The generic picker below
 * skips every TARGETED activation, so an AI archer never shot and an AI pumper never pumped. This picker takes exactly
 * the abilities the combat window exists for — a program whose one atom targets a creature BY COMBAT ROLE — and places
 * them on the provably-right side:
 *   · an ENEMY-facing atom (deal-damage, a negative pump, cant-block, tap, destroy) goes on the biggest OPPOSING creature
 *     in combat — an attacker attacking the AI, or a blocker of the AI's attacker;
 *   · an OWN-facing atom (a positive pump / keyword grant, regenerate) goes on the biggest OWN creature in combat.
 * Anything else (a mixed or unknown op, a target on the wrong side) is left alone — the generic picker's skip stands,
 * never a wrong play. Deterministic: biggest power first, then id. Runs only in a combat step (the window itself
 * only offers these there), so main-phase play is byte-identical.
 */
const COMBAT_ROLE_ENEMY_OPS = new Set(["deal-damage", "cant-block", "tap", "destroy", "exile", "cant-be-blocked"]);
const COMBAT_ROLE_OWN_OPS = new Set(["regenerate"]);
function pickCombatRoleActivation(state, aiPlayerId, abilityActions) {
  if (!state?.combat || !new Set(["beginning-of-combat", "declare-attackers", "declare-blockers", "combat-damage", "end-of-combat"]).has(state.step)) return null;
  const attackers = state.combat.attackers || [];
  const blockers = state.combat.blockers || [];
  const attackingMe = new Set(attackers.filter((a) => a.defender === aiPlayerId).map((a) => a.permanentId));
  const myAttackers = new Set(attackers.filter((a) => a.attackingPlayer === aiPlayerId || findPermanent(state, a.permanentId)?.permanent?.controller === aiPlayerId).map((a) => a.permanentId));
  const blockingMine = new Set(blockers.filter((b) => myAttackers.has(b.attackerId)).map((b) => b.blockerId));
  const myBlockers = new Set(blockers.filter((b) => findPermanent(state, b.blockerId)?.permanent?.controller === aiPlayerId).map((b) => b.blockerId));
  const power = (id) => permanentPower(state, id) ?? 0;
  const ranked = [];
  for (const a of abilityActions) {
    const atoms = a.program?.atoms || [];
    if (atoms.length !== 1 || a.program.structure === "modal" || (a.targets?.length || 0) !== 1) continue;
    const atom = atoms[0];
    if (!(atom.restrictions || []).some((r) => r.kind === "combat")) continue;
    const t = a.targets[0];
    const tPerm = findPermanent(state, t.id)?.permanent;
    if (!tPerm) continue;
    const enemyFacing = COMBAT_ROLE_ENEMY_OPS.has(atom.op) || (atom.op === "untap" && atom.preventCombatDamageTurn) /* SHELF-85 V13: Maze of Ith fogs an ENEMY attacker */ || (atom.op === "pump" && ((atom.ptDelta?.p ?? 0) < 0 || (atom.ptDelta?.t ?? 0) < 0));
    const ownFacing = COMBAT_ROLE_OWN_OPS.has(atom.op) || (atom.op === "pump" && !enemyFacing && ((atom.ptDelta?.p ?? 0) > 0 || (atom.ptDelta?.t ?? 0) > 0 || (atom.grantKeywords?.length || 0) > 0));
    if (enemyFacing) {
      if (tPerm.controller === aiPlayerId) continue;
      if (!attackingMe.has(t.id) && !blockingMine.has(t.id)) continue;
    } else if (ownFacing) {
      if (tPerm.controller !== aiPlayerId) continue;
      if (!myAttackers.has(t.id) && !myBlockers.has(t.id)) continue;
    } else continue;
    ranked.push({ a, p: power(t.id), id: String(t.id) });
  }
  if (!ranked.length) return null;
  ranked.sort((x, y) => (y.p - x.p) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return ranked[0].a;
}

function pickSafeAbilityActivation(abilityActions) {
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const safe = [];
  for (const a of abilityActions) {
    if (!a.program || a.program.structure === "modal") continue;
    if ((a.targets?.length || 0) > 0) continue;
    if (a.sacSelf || a.exileSelf || a.sacCreatureId || (a.sacCountIds?.length) || a.removeCounter
      || (a.payLife || 0) > 0 || a.tapCreatureId || (a.tapCountIds?.length) || a.returnLandId || a.xValue != null || a.chosenMode != null) continue; // V6 slice 2: a counted tap cost taps real bodies — never auto-spent
    if (!a.tapSelf && (a.cmc || 0) < 1) continue;         // termination bound: tap or a real mana cost
    const atoms = a.program.atoms || [];
    if (atoms.length === 0) continue;                     // nothing runnable — activating burns the cost
    if (isLevelUpAtomList(atoms)) { safe.push({ a, rank: 4 }); continue; } // LV-1 — level up with leftover mana
    if (isClassLevelUpAtomList(atoms)) { safe.push({ a, rank: 4 }); continue; } // CLASS — gain a class level with leftover mana
    if (!atoms.every((atom) => SAFE_ABILITY_OPS.has(atom.op) && !atom.targetType)) continue;
    const rank = Math.min(...atoms.map((atom) => SAFE_ABILITY_OPS.get(atom.op)));
    safe.push({ a, rank });
  }
  if (safe.length === 0) return null;
  safe.sort((x, y) => (x.rank - y.rank) || ((x.a.cmc || 0) - (y.a.cmc || 0))
    || cmp(String(x.a.name || ""), String(y.a.name || ""))
    || cmp(String(x.a.permanentId), String(y.a.permanentId))
    || ((x.a.abilityIndex ?? 0) - (y.a.abilityIndex ?? 0)));
  return safe[0].a;
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
// ===== CAST-RANKING SIDE-CHANNEL (M5.1 — nearTie/top-k in rows; Omnath handoff) =====
// pickCastAction's scored candidate list, exposed for the decision recorder. A TICK-SCOPED slot:
// pickAction ENTRY clears it (every auto-decide tick calls pickAction exactly once, so a stale
// ranking can never outlive its tick), pickCastAction fills it after its final sort, and
// learnSession's recorder TAKES it (read-and-clear) — attaching it to a row ONLY when the chosen
// action is the cast the ranking described (kind + cardId guarded there). Scores are the raw
// pickCastAction scores (LOWER = better; the sort is ascending): scoreGap = scored[1] − scored[0].
// Non-cast decisions (combat plans, pending windows) have no uniform score — their rows stay null,
// an HONEST partial (documented in the runbook as the scored-class scope).
let _lastCastRanking = null;
export function takeLastCastRanking() {
  const r = _lastCastRanking;
  _lastCastRanking = null;
  return r;
}

export function pickAction(state, aiPlayerId, actions, { archetype = null, policy = null } = {}) {
  _lastCastRanking = null; // tick boundary — a previous tick's cast ranking must never leak forward
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const pol = normalizePolicy(policy);

  // DISCOVER (LCI) — a pending discover decision short-circuits everything (legalChoices offers ONLY the
  // free-cast options + put-to-hand). Cast the found card free if pickCastAction likes a cast (a free
  // permanent body, or a spell with a good enemy target); it HOLDS counters / declines a targetless or
  // self-harmful cast → fall through to taking the card to hand. Never returns null (there is no pass here).
  if (state.pendingDiscover && state.pendingDiscover.controller === aiPlayerId) {
    const castOpts = filterActions(actions, "cast-spell");
    const pick = castOpts.length ? pickCastAction(state, aiPlayerId, castOpts, archetype, pol) : null;
    return pick || actions.find(a => a.kind === "discover-to-hand") || actions[0] || null;
  }

  // CASCADE (CR 702.85) — a pending cascade decision short-circuits everything (legalChoices offers ONLY the
  // free-cast-from-exile options + a decline). Cast the found card free if pickCastAction likes the cast (a free
  // permanent body, or a spell with a good enemy target — cascade is virtually always pure upside, so the AI
  // takes it); it HOLDS counters / declines a targetless or self-harmful cast → fall through to the decline
  // (found card → bottom). Never returns null (there is no pass mid-resolution). Mirrors the discover branch.
  if (state.pendingCascade && state.pendingCascade.controller === aiPlayerId) {
    const castOpts = filterActions(actions, "cast-spell");
    const pick = castOpts.length ? pickCastAction(state, aiPlayerId, castOpts, archetype, pol) : null;
    return pick || actions.find(a => a.kind === "cascade-decline") || actions[0] || null;
  }

  // CAST FROM AMONG (P·16 — Etali, Primal Storm): the same window, "any number" — cast the candidate pickCastAction likes
  // best; the decision re-offers the rest after each cast, so the AI keeps casting until nothing scores, then takes "done".
  // Never returns null (no pass mid-resolution; "done" clears the window).
  if (state.pendingCastFromAmong && state.pendingCastFromAmong.controller === aiPlayerId) {
    const castOpts = filterActions(actions, "cast-spell");
    const pick = castOpts.length ? pickCastAction(state, aiPlayerId, castOpts, archetype, pol) : null;
    return pick || actions.find(a => a.kind === "cast-from-among-done") || actions[0] || null;
  }

  // FREE-CAST (CR 601.2b) — a pending free-cast decision short-circuits everything (legalChoices offers ONLY
  // the free-cast candidates + a decline; there is NO pass-priority in this window). Cast the best candidate
  // free when pickCastAction likes one; when EVERY offered candidate is a held type (a counterspell, a wipe,
  // a fog, an Aura) or scores badly, take the DECLINE. Returning null here would make the session driver
  // force-pass WITHOUT clearing pendingFreeCast — legalChoices would keep offering only this window and the
  // game would wedge for good. Mirrors the discover / cascade branches above.
  if (state.pendingFreeCast && state.pendingFreeCast.controller === aiPlayerId) {
    const castOpts = filterActions(actions, "cast-spell");
    const pick = castOpts.length ? pickCastAction(state, aiPlayerId, castOpts, archetype, pol) : null;
    return pick || actions.find(a => a.kind === "free-cast-decline") || actions[0] || null;
  }

  // Combat is a batch decision, but the driver applies one action per tick.
  // We compute the plan and return its first still-legal choice; declared
  // attackers/blockers are excluded from the legal set next tick (attackers
  // tap on declare; blockers are tracked), so each tick drains one and the
  // step empties, after which we fall through to pass.
  if (state.step === "declare-attackers") {
    const attackerActions = filterActions(actions, "declare-attacker");
    if (attackerActions.length > 0) {
      const plan = pickAttackPlan(state, aiPlayerId, attackerActions, { policy: pol });
      if (plan.length > 0) return plan[0];
    }
  }
  if (state.step === "declare-blockers") {
    // Only consider attackers we haven't blocked yet (v1: one blocker each),
    // so the AI doesn't pile redundant blockers on the same attacker.
    const blocked = new Set((state.combat?.blockers || []).map(b => b.attackerId));
    const blockerActions = filterActions(actions, "declare-blocker").filter(a => !blocked.has(a.attackerId));
    if (blockerActions.length > 0) {
      const plan = pickBlockPlan(state, aiPlayerId, blockerActions, { policy: pol });
      if (plan.length > 0) return plan[0];
    }
  }

  // THE TOKEN-LOOP LINE (tokenLoopLine.js — Colton 2026-10-03: a combo deck plays its line). null for a seat with no
  // self-scaling token loop, and then nothing below changes. With one: once the creatures that can attack kill every
  // opponent, FORGO EVERYTHING ELSE — no land, no cast, no activation — and pass to combat, where pickAttackPlan
  // executes the finish.
  const loop = tokenLoopState(state, aiPlayerId);
  if (loop?.finishNow && (state.stack || []).length === 0) {
    const pass = actions.find(a => a.kind === "pass-priority");
    if (pass) return pass;
  }

  const lands = filterActions(actions, "play-land");
  if (lands.length > 0) {
    const land = pickLandAction(state, aiPlayerId, lands, pol);
    if (land) return land;
  }

  const casts = filterActions(actions, "cast-spell");
  if (casts.length > 0) {
    // Resolve archetype lazily if not supplied. Caller usually passes
    // it for performance — recomputing detectArchetype per priority
    // window is wasteful.
    const aiDeck = { cards: deriveDeckRepresentation(state, aiPlayerId) };
    const detected = archetype || detectArchetype(aiDeck, {}).archetype;
    const cast = pickCastAction(state, aiPlayerId, casts, detected, pol);
    if (cast) return cast;
  }

  // Activate a beneficial loyalty ability (PW-3). Only MODELED abilities (the AI knows what they do);
  // Arbiter-routed ones are skipped so self-play never stalls. After lands + casts so the board is
  // developed first; the once-per-turn rule (enforced in the offer) caps it at one per walker.
  const loyalties = filterActions(actions, "activate-loyalty").filter(a => !a.routeToArbiter);
  if (loyalties.length > 0) {
    const loy = pickLoyaltyAction(state, aiPlayerId, loyalties);
    if (loy) return loy;
  }

  // W6 (AI-F3) — ACTIVATED ABILITIES: the AI previously never activated ANY activated ability
  // (dead equipment / stranded utility). Two disjoint slices, both consuming already-offered
  // actions only (the offer side gates timing/affordability — THE CREED). After lands + casts +
  // loyalty so mana develops the board first; one activation per tick (the driver re-offers).
  // policy 'v1' recovers never-activate for the A/B probe.
  if (pol.ability !== "v1") {
    const abilities = filterActions(actions, "activate-ability");
    if (abilities.length > 0) {
      // Slice 1 — EQUIP: move each equipment onto the AI's best body (strict improvement only).
      const equip = pickEquipAction(state, aiPlayerId, abilities.filter(a => a.isEquipAbility));
      if (equip) return equip;
      // Slice 1b — COMBAT-ROLE activations in a combat step (④-AP): the archer shoots the biggest creature attacking
      // the AI; the pumper pumps its own biggest attacker/blocker. Side-checked, so never a wrong play.
      const combatRole = pickCombatRoleActivation(state, aiPlayerId, abilities.filter(a => !a.isEquipAbility));
      if (combatRole) return combatRole;
      // Slice 2 — cost-safe generic abilities (a.program non-null; equip is program:null, so the
      // two slices are disjoint by construction).
      // The token loop is held while its own copy is on the stack (X is read on resolution) and once there is enough.
      const generic = pickSafeAbilityActivation(abilities.filter(a => !a.isEquipAbility && !(loop?.holdLoop && isTokenLoopAction(loop, a))));
      if (generic) return generic;
    }
    // CREW (VH-1) — take a ZERO-COST crew: the offer's auto-picked tap set is all summoning-sick
    // creatures (they can't attack this turn anyway), so animating the Vehicle is strictly free
    // upside before declare-attackers. A crew that would tap ready attackers is left to the user's
    // judgment (the AI never spends attack power on it — conservative, never a wrong play).
    const crews = filterActions(actions, "crew-vehicle").filter(a => a.allSick);
    if (crews.length > 0) return crews[0];
  }

  // MANIFEST (P·19, CR 701.40b) — turn a face-down creature card face up on its own main phase, after lands, casts and
  // abilities: only one whose real card is bigger than the vanilla 2/2 it is now (power + toughness over 4), biggest first.
  if (state.activePlayer === aiPlayerId && /main/i.test(String(state.phase || ""))) {
    const sizeOf = (a) => {
      const real = (state.players[aiPlayerId]?.battlefield || []).find((p) => p.id === a.permanentId)?.faceUpCard;
      return (Number(real?.power) || 0) + (Number(real?.toughness) || 0);
    };
    const turnUps = filterActions(actions, "turn-face-up").filter((a) => sizeOf(a) > 4);
    if (turnUps.length) return turnUps.reduce((best, a) => (sizeOf(a) > sizeOf(best) ? a : best), turnUps[0]);
  }

  // No active-window action — pass priority. (The engine's combat
  // step pickers below handle declare-attackers/blockers as batch
  // decisions, not via pickAction.)
  return actions.find(a => a.kind === "pass-priority") || null;
}

/** Count an opponent's untapped creatures (rough "how hard to push through"). */
function untappedBlockerCount(state, playerId) {
  const bf = state.players?.[playerId]?.battlefield || [];
  return bf.filter(p => permanentIsCreature(state, p.id) && !p.tapped).length;  // layer-aware (animated man-lands)
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

/** Derived combat stats of a player's UNTAPPED creatures — its potential blockers. */
function untappedDefenderBlockers(state, defenderId) {
  const bf = state.players?.[defenderId]?.battlefield || [];
  return bf
    .filter(p => permanentIsCreature(state, p.id) && !p.tapped)  // layer-aware (animated man-lands)
    .map(p => ({
      id: p.id,
      power: Math.max(0, permanentPower(state, p.id)),
      toughness: permanentToughness(state, p.id),
      firstStrike: hasFirstStrike(state, p.id),
      deathtouch: hasDeathtouch(state, p.id),
    }));
}

/**
 * The defender's untapped creatures that may LEGALLY block this attacker —
 * filtered through `canBlockAttacker` (combatEvasion), the SAME chokepoint the
 * block enumeration uses, so the attack model can never disagree with block
 * legality (a flyer over ground blockers, protection, fear, landwalk, …).
 * An unresolvable check counts as "can block" — the cautious direction.
 */
function eligibleBlockersFor(state, defenderId, attackerId, defenderBlockers) {
  return defenderBlockers.filter((b) => {
    try { return canBlockAttacker(state, b.id, attackerId, defenderId); } catch { return true; }
  });
}

/**
 * W4 — would this attacker die "for nothing" into its ELIGIBLE blockers? Uses
 * the shared duel math (first/double strike, deathtouch on BOTH sides). A block
 * that kills the attacker without dying is a free kill for the defender; a
 * mutual kill is a real trade UNLESS the blocker is a small deathtouch wall
 * eating a clearly bigger body (the 5/5-into-1/1-deathtouch suicide).
 */
function attackerDiesForNothingV2(att, eligibleBlockers) {
  return eligibleBlockers.some((b) => {
    const { attackerDies, blockerDies } = combatDuel(att, b);
    if (!attackerDies) return false;
    if (!blockerDies) return true;                 // dies and kills nothing back
    if (b.deathtouch && att.power + att.toughness > b.power + b.toughness) return true;
    return false;                                  // mutual kill — a real trade
  });
}

/**
 * W4 lethality: unavoidable damage if the defender blocks optimally, judged with
 * block LEGALITY + the SET-level minimum block size (menace's 2 / the printed
 * "except by <N> or more creatures" — BLITZ EV-3). An attacker with zero eligible
 * blockers (or a ≥N attacker with fewer than N — the declaration gate never
 * offers that block, CR 509.1b / 702.111b) always connects; a blockable ≥N
 * attacker consumes N blockers from the budget. The defender chumps the biggest
 * blockable attackers first. Approximation: eligibility is per-attacker but the
 * budget is the global untapped-creature count (exact optimal assignment is a
 * matching problem); trample-through damage is ignored (a safe underestimate of
 * the swing). `attackers`: [{ power, minBlockers, eligibleCount }].
 */
function swingIsLethalV2(attackers, blockerCount, defenderLife) {
  if (defenderLife <= 0) return false;
  let budget = blockerCount;
  let unavoidable = 0;
  const blockable = [];
  for (const a of attackers) {
    if (a.eligibleCount >= (a.minBlockers || 1)) blockable.push(a);
    else unavoidable += a.power;
  }
  blockable.sort((x, y) => y.power - x.power);
  for (const a of blockable) {
    const cost = a.minBlockers || 1;
    if (budget >= cost) budget -= cost;
    else unavoidable += a.power;
  }
  return unavoidable >= defenderLife;
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
function selectProfitableAttackers(state, aiPlayerId, attackerActions, defenderId, pol = {}) {
  if (!defenderId || !state.players?.[defenderId]) return null;
  const blockers = untappedDefenderBlockers(state, defenderId);
  const defenderLife = state.players[defenderId].life ?? 0;
  const permIds = [...new Set(attackerActions.map(a => a.permanentId))];

  if (pol.attack === "v1") {
    // ATTACK-V1 (legacy, probe-only): a GLOBAL blocker list with no block-legality,
    // deathtouch, or menace awareness — suicides into deathtouch walls and holds
    // back evasive attackers a ground blocker "kills for nothing".
    const stats = new Map(permIds.map(id => [id, {
      power: Math.max(0, permanentPower(state, id)),
      toughness: permanentToughness(state, id),
      firstStrike: hasFirstStrike(state, id),
    }]));
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

  // W4 — legality-aware profitability. Each attacker is judged against the
  // blockers that may LEGALLY block it (canBlockAttacker — the block
  // enumeration's own chokepoint), with deathtouch on both sides and the ≥N
  // block-size rule (menace / EV-3) in the lethality budget. A stat we can't
  // resolve (bare test state) keeps the legacy swing-with-it default — never
  // freeze on an unevaluable board.
  const describe = (id) => {
    const s = combatStatsOf(state, id);
    if (!s) return null;
    const eligible = eligibleBlockersFor(state, defenderId, id, blockers);
    return { ...s, minBlockers: minBlockersFor(state, id), eligible, eligibleCount: eligible.length };
  };
  const stats = new Map(permIds.map((id) => [id, describe(id)]));

  // Attackers ALREADY committed this combat vs this defender fold into the
  // lethality sum (the per-tick driver declares one attacker per tick — without
  // this the alpha strike loses lethal status after the first declaration).
  const committed = (state.combat?.attackers || [])
    .filter(a => a.attackingPlayer === aiPlayerId && a.defender === defenderId)
    .map(a => describe(a.permanentId))
    .filter(Boolean);
  const candidates = [...stats.values()].filter(Boolean);
  const lethal = swingIsLethalV2(
    [...committed, ...candidates].map(s => ({ power: s.power, minBlockers: s.minBlockers, eligibleCount: s.eligibleCount })),
    blockers.length,
    defenderLife,
  );

  const chosen = new Set();
  for (const id of permIds) {
    const s = stats.get(id);
    if (!s) { chosen.add(id); continue; } // unresolvable candidate → legacy swing-all default
    const unstoppable = s.eligibleCount < (s.minBlockers || 1); // menace/≥N + too few eligible = never offered a block
    if (lethal || unstoppable || !attackerDiesForNothingV2(s, s.eligible)) {
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
// MUST-ATTACK (subsystem 4, CR 508.1a) — does THIS card carry a self "attacks each combat/turn if able"
// requirement? Normalize the card name → "this creature" (so "Crazed Goblin attacks each combat if able"
// matches), then require the bare self subject — a GROUP form ("creatures you control attack…", "each
// creature attacks…", "attacking creatures…") is excluded (it's not a self requirement on this permanent).
export function selfMustAttack(card) { // exported for the legendShortName unit pins
  const o = String(card?.oracle || card?.oracle_text || "");
  if (!/attacks each (?:combat|turn) if able/i.test(o)) return false;
  // ATTACK-RESTRICTION RIDER (skeptic-flagged): a must-attacker that ALSO carries a "can't attack …"
  // restriction (Xantcha "…can't attack its owner…", Alexios) would be force-declared at a target the
  // restriction forbids — pickAttackPlan models no attack restrictions. Don't force those (the pre-slice
  // status quo for them; an under-enforced requirement is the safe direction, a forbidden attack is not).
  if (/can't attack/i.test(o)) return false;
  const name = String(card?.name || "").split(" //")[0].trim();
  let t = name ? o.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "this creature") : o;
  // LEGENDARY SHORT NAME: a comma-carrying legend self-references by its pre-comma short name ("Toski
  // attacks each combat if able" on "Toski, Bearer of Secrets") — normalize that form too, mirroring
  // coverage.isKeywordOnly so recognition and ENFORCEMENT flip together (the subsystem's own both-halves
  // rule). The group forms stay excluded (plural "attack" never matches the singular anchor).
  const shortName = name.split(",")[0].trim();
  if (shortName && shortName !== name) t = t.replace(new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "this creature");
  return /\bthis creature attacks each (?:combat|turn) if able\b/i.test(t);
}

export function pickAttackPlan(state, aiPlayerId, attackerActions, { policy = null } = {}) {
  if (!Array.isArray(attackerActions) || attackerActions.length === 0) return [];
  const hasDefenderChoice = attackerActions.some(a => a.defenderId);
  // THE TOKEN-LOOP FINISH: a seat with a self-scaling token loop whose attackers kill EVERY opponent this combat splits
  // them across all of them, instead of focusing one. null for every other seat and every non-lethal board.
  if (hasDefenderChoice) {
    const finish = tokenLoopAttackPlan(state, aiPlayerId, attackerActions);
    if (finish) return finish;
  }
  const target = chooseDefender(state, aiPlayerId);
  const chosen = selectProfitableAttackers(state, aiPlayerId, attackerActions, target, normalizePolicy(policy));
  // MUST-ATTACK (subsystem 4, CR 508.1a) — a creature that "attacks each combat/turn if able" MUST be
  // declared if it can. It's already in attackerActions (the eligible set, i.e. "able"), so force-include
  // it regardless of the profitability filter (the racer would otherwise illegally hold back an
  // unprofitable must-attacker). The chooseDefender/walker focus still picks ITS target below.
  // FORCED-ATTACK (FORCE-ATTACK-1, CR 508.1a) — an EXTERNAL turn-scoped requirement (Bident of Thassa's
  // "Creatures your opponents control attack this turn if able"): when this declaring seat is under an active
  // force this turn (forcedToAttackTurn[aiPlayerId] === state.turn), EVERY one of its eligible attackers (the
  // "able" set = attackerActions) must be declared. Force-include them all alongside the self-must-attackers,
  // so the profitability filter can't illegally hold an able creature back. Self-expires by the turn-number
  // compare (no stale carry-over). ONE action per creature is in attackerActions in Standard; in Commander the
  // per-(creature,defender) fan-out means force-including every action for a forced permanent, which the
  // byPermanent focus below collapses back to one attack per creature — correct either way.
  const forcedSeat = (state.forcedToAttackTurn || {})[aiPlayerId] === state.turn;
  // MUST-ATTACK-UNLESS (BLITZ CS-1, CR 508.1d — Reckless Cohort / Marauding Maulhorn): "attacks each
  // combat if able UNLESS you control <predicate>" is a CONDITIONAL requirement — live only while the
  // predicate FAILS. selfMustAttack matches the sentence prefix, so without this read the two carriers
  // were force-declared unconditionally (over-enforcement); the shared predicate grammar
  // (parseControllerBoardPredicate — the same parser the classifier mirror credits) releases the
  // requirement the moment the controller's board satisfies the unless.
  const selfMustAttackNow = (permanent) => {
    const card = permanent?.card;
    // ⭐ GRANTED must-attack (CR 508.1a) — an AURA can hand the requirement to a creature whose own card
    // says nothing ("Enchanted creature attacks each combat if able" — Bloodshed Fever, Furor of the
    // Bitten, Infectious Bloodlust). selfMustAttack reads the CARD's printed text, so it structurally
    // cannot see those; the layer-6 `mustAttack` pseudo-keyword is the granted twin, read layer-aware
    // here so the requirement lifts the instant the Aura leaves.
    // ⓘ The "unless" release below is deliberately NOT consulted for the granted form: no Aura in the
    // corpus grants a CONDITIONAL requirement, and mustAttackUnlessOf reads printed text anyway. If one
    // ever prints, the parser must carry the predicate onto the grant rather than this line assuming none.
    if (permanent && permanentHasKeyword(state, permanent.id, "mustAttack")) return true;
    if (!selfMustAttack(card)) return false;
    const unless = mustAttackUnlessOf(card);
    if (unless && controllerMeetsBoardPredicate(state, aiPlayerId, permanent.id, unless)) return false;
    return true;
  };
  const forced = new Set(
    attackerActions
      .filter(a => forcedSeat || selfMustAttackNow(state.players?.[aiPlayerId]?.battlefield?.find(p => p.id === a.permanentId)))
      .map(a => a.permanentId),
  );

  if (!hasDefenderChoice) {
    // Standard: one action per creature, no defenderId. Can't evaluate → swing all.
    if (chosen === null) return pickAllAttackers(attackerActions);
    return attackerActions.filter(a => chosen.has(a.permanentId) || forced.has(a.permanentId));
  }

  // Commander: focus the chosen target, one action per attacking creature.
  const byPermanent = new Map();
  for (const a of attackerActions) {
    if (chosen !== null && !chosen.has(a.permanentId) && !forced.has(a.permanentId)) continue;
    if (!byPermanent.has(a.permanentId)) byPermanent.set(a.permanentId, []);
    byPermanent.get(a.permanentId).push(a);
  }

  // PW-3: remove an enemy planeswalker when it's a clean, worthwhile kill. Focus the whole chosen
  // swing on the most dangerous enemy walker the AI can kill this combat — but only when the swing
  // isn't lethal on the focused player (kill the player first) and the walker's controller has no
  // untapped blockers (a clean hit, no wasted attack). Overkill is fine for v1.
  const chosenPowers = [...byPermanent.values()].map(opts => Math.max(0, permanentPower(state, opts[0].permanentId)));
  const walkerTarget = chooseWalkerToKill(state, aiPlayerId, attackerActions, target, chosenPowers);

  const plan = [];
  for (const opts of byPermanent.values()) {
    // ⭐ GOAD, SECOND HALF (CR 701.38): "attacks a player other than YOU if able" — YOU being the GOADER,
    // which is normally NOT this creature's controller. The must-attack half rides the shared `mustAttack`
    // keyword and is already handled above; this is the defender restriction.
    // ⛔ "IF ABLE", NOT "NEVER" — the trap this whole feature turns on. If the goader is the ONLY player
    // this creature can attack, it MUST still attack them. Filtering the goader out unconditionally would
    // produce a creature that attacks nobody while carrying a must-attack requirement: an illegal board
    // state, and a false positive rather than a safe miss. So the filter is applied ONLY when it leaves at
    // least one option, and the unfiltered list is used otherwise.
    // ⓘ Vacuous in two-player (the sole opponent IS the goader, and hasDefenderChoice is false there
    // anyway) — this branch is multiplayer-only, which is exactly where goad is printed to matter.
    const goaders = goaderControllersOf(state, opts[0].permanentId);
    const legal = goaders.size ? opts.filter(o => !goaders.has(o.defenderId)) : opts;
    const pool = legal.length ? legal : opts;
    if (walkerTarget) {
      const atWalker = pool.find(o => o.defenderPlaneswalkerId === walkerTarget.walkerId);
      if (atWalker) { plan.push(atWalker); continue; }
    }
    plan.push((target && pool.find(o => o.defenderId === target && !o.defenderPlaneswalkerId)) || pool[0]);
  }
  return plan;
}

/**
 * Pick an enemy planeswalker for the AI to remove this combat (PW-3): the highest-loyalty enemy
 * walker whose controller has NO untapped blockers (a clean hit) and whose loyalty the chosen
 * attackers' total power can cover — UNLESS the swing is already lethal on the focused player (kill
 * the player first). Returns { walkerId, loyalty } or null. Deterministic → serialize-stable.
 */
function chooseWalkerToKill(state, aiPlayerId, attackerActions, targetPlayer, chosenPowers) {
  const totalChosen = chosenPowers.reduce((s, p) => s + p, 0);
  let best = null;
  const seen = new Set();
  for (const a of attackerActions) {
    if (!a.defenderPlaneswalkerId || seen.has(a.defenderPlaneswalkerId)) continue;
    seen.add(a.defenderPlaneswalkerId);
    if (untappedBlockerCount(state, a.defenderId) > 0) continue; // defender could block → not a clean kill
    const walker = state.players?.[a.defenderId]?.battlefield?.find(p => p.id === a.defenderPlaneswalkerId);
    const loy = walker?.counters?.loyalty;
    if (loy != null && loy > 0 && totalChosen >= loy && (!best || loy > best.loyalty)) {
      best = { walkerId: a.defenderPlaneswalkerId, loyalty: loy };
    }
  }
  // Don't divert from a lethal swing on the focused player.
  if (best && targetPlayer && state.players[targetPlayer]) {
    const committed = (state.combat?.attackers || [])
      .filter(x => x.attackingPlayer === aiPlayerId && x.defender === targetPlayer && !x.defenderPlaneswalkerId)
      .map(x => Math.max(0, permanentPower(state, x.permanentId)));
    const blockers = untappedDefenderBlockers(state, targetPlayer);
    if (swingIsLethal([...committed, ...chosenPowers], blockers.length, state.players[targetPlayer].life ?? 0)) return null;
  }
  return best;
}

/**
 * Batch-decision picker for declare-blockers. `aiPlayerId` (the defending seat)
 * feeds the W3 facing-lethal pressure check; `policy` selects the probe's legacy
 * block plan ("v1" = the old chump-everything policy).
 */
export function pickBlockPlan(state, aiPlayerId, blockerActions, { policy = null } = {}) {
  return pickBlockers(blockerActions, state, aiPlayerId, normalizePolicy(policy));
}

// ─── Mulligan heuristic (W2 — OPT-IN via the pilot seam) ─────────────────────

/**
 * London-mulligan keep/ship heuristic for an AI seat (CR 103.5). SHIP when the
 * hand is unkeepable on lands — fewer than 2 or more than 5 of the 7 — and the
 * seat has shipped fewer than 2 times (never mulligan below an effective
 * 5-card keep); otherwise KEEP. Prior ships are recounted from the engine's own
 * `mulligan-ship` log events (the loop doesn't stamp players[seat].mulligans
 * until the keep), so the decider stays a pure read of the offered state.
 *
 * OPT-IN, never default: the engine only runs a mulligan phase for a seat whose
 * pilot supplies `decideMulligan` (runMulliganPhaseForSeat — gameEngine.js), so
 * the Academy / existing self-play stay byte-identical until a caller wires
 * this in (the probe's --mull flag; a pilot scaffold can adopt it later).
 * Returns one of the OFFERED actions; anything else is treated as KEEP by the
 * engine (the safe default), so this can never over-mulligan or strand setup.
 */
export function decideMulliganForAI({ state, legalActions, seat }) {
  const offered = Array.isArray(legalActions) ? legalActions : [];
  const keep = offered.find((a) => a?.kind === "mulligan-keep") || { kind: "mulligan-keep" };
  const ship = offered.find((a) => a?.kind === "mulligan-ship");
  if (!ship) return keep;
  const hand = state?.players?.[seat]?.hand || [];
  const lands = hand.filter((c) => String(c?.type || c?.type_line || "").includes("Land")).length;
  const ships = (state?.log || []).filter((e) => e?.kind === "mulligan-ship" && e?.player === seat).length;
  return (lands < 2 || lands > 5) && ships < 2 ? ship : keep;
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
