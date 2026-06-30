/**
 * Phase 6 — Learn-to-Play: legalChoices.js
 *
 * Given a GameState and a player who currently holds priority (or is
 * declaring attackers/blockers), generate the list of legal actions
 * they can take. The decisionGate (PR5) presents these to the user
 * (Beginner: ask every time, Intermediate: auto+confirm, Expert:
 * silent-pick).
 *
 * Scope (per design doc §5 step 3):
 *   - pass-priority
 *   - play-land   (sorcery-speed, own main, stack empty, ≤1 land per turn)
 *   - cast-spell  (sorcery vs instant timing; mana-cost can-afford check)
 *   - declare-attacker candidates (untapped creatures, no summoning sick
 *                                   unless haste; own creatures only)
 *   - declare-blocker candidates  (untapped creatures of the defending
 *                                   player against an active attacker)
 *
 * Deferred to later PRs:
 *   - Activate-ability (needs an ability schema layer)
 *   - Target selection (caller picks; legalChoices just exposes that
 *     targets are required and how many)
 *   - Complex cost-payment beyond plain mana costs (life, tap-this,
 *     sacrifice, etc.) — surfaces as needsCostPayment: true so the
 *     decisionGate / Arbiter handle it
 *   - Modes / X-spells / hybrid pips beyond the parser hint
 *
 * Pure: takes a GameState, returns plain JS arrays/objects. No mutation,
 * no fetch.
 */

import { getZone, opponentOf, opponentsOf, totalAvailableMana, findPermanent, creaturePower } from "./gameState.js";
import { canAfford, manaSources, manaProduction, landAuraManaBonus, applyAuraManaGrantSupplement } from "./manaModel.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived tap-for-mana amount
import { hasKeyword } from "./keywords.js";
import { permanentHasKeyword, permanentIsCreature, colorsOf, grantedManaSpecsFor, grantedActivatedQuotedFor } from "./layers.js";
import { collectCostReducers, costReductionForSpell, selfCostReductionMetric, cantCastDescriptorOf, extraLandDropsOf, registerGroupActivatedBodyValidator } from "./staticAbilityParser.js";
import { canBlockAttacker, attackerHasMenace } from "./combatEvasion.js";
import { parseSpellEffect, enumerateTargets, effectNeedsTarget, parseCreatureTargetRestrictions, canBeTargetedBy } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { isNonChosenTargetType } from "./targetTypes.js";
import { counterClauseParser } from "./effects/atoms/stack.js";
import { parseActivatedAbilities, parseGrantedActivatedAbilities, sacrificeDropsTrigger, parseCyclingCost, parsePlotCost, isModeledGroupActivatedBody } from "./effects/abilities.js";
// PLOT (CR 702.171): the runtime offers a card the plot special action ONLY when its NON-plot text is
// fully native — i.e. classifyCard (which strips the plot line internally) returns a native tier. Reusing
// the metric's OWN authority means the runtime and the coverage metric can never disagree about which plot
// cards flip natively (no duplicated native-determination to drift). coverage.js does NOT import legalChoices
// (verified — metric-only, zero runtime consumers), so this import introduces no cycle.
import { classifyCard, isNativeTier, isNativeBestow, isKeywordOnly } from "./coverage.js";
import { parseKickerCounterCreature, parseKickerEtbCreature } from "./kicker.js"; // KICKER (CR 702.33) — emit a normal + a kicked cast (kicker mana folded into the cost) when the kicker is affordable; ETB-trigger payoff variant too
import { parseEmergeCard } from "./emerge.js"; // EMERGE (CR 702.97) — emit a normal hard-cast + an emerge cast per legal sacrifice victim (cost reduced by the victim's MV)

// GROUP-ACTIVATED grant (queue 1) — register the modeled-body gate so the runtime path (a SIM that imports
// legalChoices but not coverage) still emits + enumerates group-activated grants. Idempotent with coverage.js's
// identical registration; see registerGroupActivatedBodyValidator in staticAbilityParser.js.
registerGroupActivatedBodyValidator(isModeledGroupActivatedBody);
import { parseLoyaltyAbilities, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { isNativeAura, isNativeManaAura, entersWithXCounters, parseBestowCost } from "./staticAbilityParser.js";
import { isCloneCard } from "./cloneCopy.js"; // X-COST CLONE (Mockingbird): choose X at cast so the MV cap is right
import { isAdventureCard, adventureFaceCard, creatureFaceCard } from "./adventure.js"; // ADVENTURE (CR 715) — cast either face; pure shape module

// ─── Mana cost parser + can-afford check ──────────────────────────────────────

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Parse a mana cost string like "{2}{U}{U}" into a structured object:
 *   { generic: 2, W: 0, U: 2, B: 0, R: 0, G: 0, C: 0, hasX: false, xCount: 0,
 *     hybrid: [], phyrexian: [], anyColor: 0 }
 *
 * Conventions:
 *   - Plain digits → generic (treated as a single chunk; "{10}" → 10)
 *   - W/U/B/R/G  → that color's pip
 *   - C          → colorless (distinct from generic — only colorless mana works)
 *   - X/Y/Z      → hasX flag + xCount++ (caller picks ONE value for X; the
 *                  TOTAL mana owed is xCount * X — a {X}{X} cost owes 2X, CR 107.3).
 *                  All variable pips in a printed cost are the SAME letter in
 *                  practice ({X}{X}), so a single chosen X drives every pip.
 *   - Hybrid {W/U} or {2/U} or {U/P} (phyrexian) → tracked in arrays; the
 *     can-afford check uses the cheaper option per pip (a rough but
 *     workable heuristic for v1)
 *
 * This parser is forgiving: malformed pips are silently dropped rather
 * than throwing, because cardpool variance is real and we'd rather
 * surface "can't afford" than crash the engine. The Arbiter can be
 * consulted for the unusual ones.
 */
export function parseManaCost(costString) {
  const cost = {
    generic: 0,
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0,
    hasX: false,
    xCount: 0,      // number of {X}/{Y}/{Z} pips — the cost owes xCount * chosenX (CR 107.3: {X}{X} = 2X)
    hybrid: [],     // [["W","U"], ...]
    phyrexian: [],  // ["U","B",...] — can be paid with 2 life
    anyColor: 0,    // count of "any color" pips (rare)
  };
  if (typeof costString !== "string" || !costString) return cost;

  const pips = [...costString.matchAll(/\{([^}]+)\}/g)].map(m => m[1].trim());
  for (const raw of pips) {
    const pip = raw.toUpperCase();

    // Plain integer → generic.
    if (/^\d+$/.test(pip)) {
      cost.generic += parseInt(pip, 10);
      continue;
    }
    // X / Y / Z — each variable pip adds to xCount; the total owed is xCount * chosenX.
    if (pip === "X" || pip === "Y" || pip === "Z") {
      cost.hasX = true;
      cost.xCount += 1;
      continue;
    }
    // Single color
    if (SINGLE_COLORS.has(pip)) {
      cost[pip] += 1;
      continue;
    }
    if (pip === "C") {
      cost.C += 1;
      continue;
    }
    // Phyrexian pip — "{U/P}" or "{W/P}"
    if (/^[WUBRG]\/P$/.test(pip)) {
      cost.phyrexian.push(pip[0]);
      continue;
    }
    // Hybrid — "{W/U}" or "{2/W}" or rare "{B/G/P}"
    if (pip.includes("/")) {
      const parts = pip.split("/").filter(p => p && p !== "P");
      cost.hybrid.push(parts);
      continue;
    }
    // Unknown — leave it dropped. Arbiter territory.
  }
  return cost;
}

/**
 * Check whether a player's current mana pool can pay a parsed cost.
 * Conservative: hybrid pips check whether either option is payable
 * (preferring the colored side when both are color pips); phyrexian
 * pips are NOT counted toward the mana cost in v1 (the caller can
 * opt to pay 2 life — surfaced via canAffordWithPhyrexian).
 *
 * Returns true/false. No "how would you pay" plan — that's PR4.
 */
export function canPayManaCost(manaPool, cost) {
  if (!cost) return true;
  let remaining = { ...manaPool };
  const subtract = (color, amount) => {
    if ((remaining[color] || 0) < amount) return false;
    remaining = { ...remaining, [color]: (remaining[color] || 0) - amount };
    return true;
  };

  // Colored pips first (they're hardest to pay).
  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    if ((cost[color] || 0) > 0 && !subtract(color, cost[color])) return false;
  }
  // Hybrid pips: try the cheapest payable side.
  for (const options of cost.hybrid) {
    let paid = false;
    for (const opt of options) {
      if (/^\d+$/.test(opt)) {
        // Numeric side of a {2/W} pip — would pay 2 generic. Skip for
        // now and rely on the colored side; if that fails we'll see
        // can-afford = false. Engineering simplicity > completeness in v1.
        continue;
      }
      if ((remaining[opt] || 0) > 0) {
        remaining = { ...remaining, [opt]: remaining[opt] - 1 };
        paid = true;
        break;
      }
    }
    if (!paid) return false;
  }
  // Generic — any mana works (colored counts as generic).
  if (cost.generic > 0) {
    const totalRemaining = Object.values(remaining).reduce((s, v) => s + v, 0);
    if (totalRemaining < cost.generic) return false;
  }
  return true;
}

/**
 * Total mana value (CMC) from a parsed cost. Used for sort hints and
 * curve analysis, not legality. X counts as 0 here.
 */
export function totalCmc(cost) {
  return (cost.generic || 0)
    + (cost.W || 0) + (cost.U || 0) + (cost.B || 0) + (cost.R || 0) + (cost.G || 0)
    + (cost.C || 0)
    + cost.hybrid.length
    + cost.phyrexian.length;
}

/**
 * Sum two parsed mana costs into one payable cost (KICKER — fold the kicker pips onto the base cost so the
 * dispatcher's single mana plan pays the whole thing). Field-by-field: generic + colored + C are added;
 * hybrid + phyrexian + anyColor pip lists are concatenated. X is NOT combined (the kicker path rejects an
 * {X} kicker, and a base X-spell never reaches the kicker branch — both `hasX` falses through to false),
 * so the result is a plain fixed cost. Pure; returns a fresh object (never mutates either input).
 */
export function mergeManaCost(base, add) {
  return {
    generic: (base.generic || 0) + (add.generic || 0),
    W: (base.W || 0) + (add.W || 0),
    U: (base.U || 0) + (add.U || 0),
    B: (base.B || 0) + (add.B || 0),
    R: (base.R || 0) + (add.R || 0),
    G: (base.G || 0) + (add.G || 0),
    C: (base.C || 0) + (add.C || 0),
    hasX: !!base.hasX || !!add.hasX,
    xCount: (base.xCount || 0) + (add.xCount || 0),
    hybrid: [...(base.hybrid || []), ...(add.hybrid || [])],
    phyrexian: [...(base.phyrexian || []), ...(add.phyrexian || [])],
    anyColor: (base.anyColor || 0) + (add.anyColor || 0),
  };
}

// ─── Card type predicates ────────────────────────────────────────────────────

function typeLineOf(card) {
  if (!card) return "";
  if (typeof card.type === "string" && card.type) return card.type;
  if (typeof card.type_line === "string") return card.type_line;
  // DFC fallback — front face.
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].type_line || card.card_faces[0].type || "";
  }
  return "";
}

function isLand(card)        { return typeLineOf(card).includes("Land"); }
function isInstant(card)     { return typeLineOf(card).includes("Instant"); }
function isCreature(card)    { return typeLineOf(card).includes("Creature"); }

/** γ1b — does a permanent match a "Sacrifice a/an/another <type>" cost's type? "permanent" = any.
 * γ1b-SUBTYPE — an optional `subtype` (lowercased, Koma "Sacrifice another Serpent"; "Sacrifice a Swamp")
 * additionally requires the victim's type line to carry that subtype (the segment after the "—" em dash,
 * CR 205.3). The parser emits type:"permanent" for a subtype sac (a subtype can sit on a creature, a land, or
 * an artifact), so baseOk is true and the subtype gate does the narrowing — a permanent without the subtype is
 * excluded, exactly as the cost demands. */
function sacTypeMatches(card, type, subtype = null) {
  if (type === "permanent" && !subtype) return true;
  const t = typeLineOf(card);
  const baseOk =
    type === "permanent" ? true :
    type === "creature" ? t.includes("Creature") :
    type === "artifact" ? t.includes("Artifact") :
    type === "enchantment" ? t.includes("Enchantment") :
    type === "land" ? t.includes("Land") :
    // ADDCOST-1 union — "sacrifice an artifact or creature" (Deadly Dispute): a victim matching EITHER type.
    type === "artifactOrCreature" ? (t.includes("Artifact") || t.includes("Creature")) :
    false;
  if (!baseOk) return false;
  if (!subtype) return true;
  // Subtype lives after the em dash ("Legendary Creature — Serpent"); match it word-bounded, case-insensitive.
  const dash = t.indexOf("—");
  const subtypeStr = (dash >= 0 ? t.slice(dash + 1) : "").toLowerCase();
  return new RegExp(`\\b${subtype.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(subtypeStr);
}
function isSorcerySpeed(card) {
  const type = typeLineOf(card);
  // Sorcery-speed = anything that ISN'T Instant and isn't "flash" tagged.
  // Flash check is a v1.5 add — for now any non-instant defaults to sorcery.
  return !type.includes("Instant");
}
// hasKeyword is imported from keywords.js (oracle-aware) — a local copy here
// previously shadowed it (keyword-array-only, oracle-blind), so Haste / Flying
// checks silently failed on real cards that carry oracle text but no keywords
// array. Removed; all call sites now use the import.

function manaCostOf(card) {
  if (!card) return "";
  // An EMPTY cost STRING is not a real cost. A DFC / MDFC / transform card leaves the top-level
  // mana_cost "" and carries the castable cost on card_faces[0] (you cast it from its front face,
  // CR 712.4a). The old `typeof === "string"` guards returned that "" early — so such a card read
  // as FREE TO CAST. Skip empties (and a non-string mana) and fall through to the front face before
  // giving up. A genuinely costless card (suspend-only spell, token) has no face cost either, so it
  // still returns "" — correct (it has no mana cost).
  if (card.mana && typeof card.mana === "string") return card.mana;
  if (card.mana_cost && typeof card.mana_cost === "string") return card.mana_cost;
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].mana_cost || card.card_faces[0].mana || "";
  }
  return "";
}

// ─── Timing rules ─────────────────────────────────────────────────────────────

/**
 * Can the player cast a sorcery-speed card right now?
 * Per CR 307.1: only during own main phase, when the stack is empty,
 * and only the active player. Lands follow the same window.
 */
function canCastSorcerySpeed(state, playerId) {
  return (
    state.activePlayer === playerId &&
    state.priorityHolder === playerId &&
    state.stack.length === 0 &&
    (state.phase === "precombat-main" || state.phase === "postcombat-main") &&
    state.step === "main"
  );
}

/**
 * Can the player cast an instant-speed card right now?
 * Per CR 307.1: any time you have priority. We don't validate priority
 * timing windows further (e.g., during damage resolution); the engine
 * surfaces priority via state.priorityHolder.
 */
function canCastInstantSpeed(state, playerId) {
  return state.priorityHolder === playerId;
}

// ─── Action generators ───────────────────────────────────────────────────────

function actionPassPriority(playerId) {
  return { kind: "pass-priority", playerId };
}

/**
 * EXTRA-LAND-DROPS (CR 305.2 / 505.5b) — the number of lands `playerId` may play THIS turn = the base one
 * (CR 305.2) PLUS the additional plays granted by every static they control ("You may play an additional land
 * on each of your turns" — Exploration → +1; Azusa → +2). Sums extraLandDropsOf across the player's BATTLEFIELD
 * and COMMAND ZONE (a creature-commander like Azusa grants nothing while it sits in the command zone — it must
 * be on the battlefield — so the command-zone scan finds nothing for it; the scan is there only for a future
 * command-zone-functioning grant, mirroring the cost-reducer two-zone pattern). The SINGLE source of truth for
 * the per-turn land allowance — both the action gate (actionsPlayLand) and the dispatcher gate (applyPlayLand)
 * call this, so they can't drift (the CREED two-sites invariant). Pure; ≥ 1 always.
 */
export function landDropAllowance(state, playerId) {
  const player = state.players[playerId];
  if (!player) return 1;
  let extra = 0;
  for (const perm of player.battlefield || []) extra += extraLandDropsOf(perm.card);
  // Command-zone entries are BARE card objects (no { card } wrapper), like the cost-reducer scan. No modeled
  // extra-land card functions from the command zone today, so this contributes 0 — but kept for symmetry.
  for (const card of player.command || []) extra += extraLandDropsOf(card);
  // ONE-SHOT-EXTRA-LAND (CR 505.5b): a resolving "you may play [N] additional land[s] this turn" effect
  // (Explore → +1, Summer Bloom → +3) bumps the player's per-turn budget (play-extra-land-this-turn atom →
  // player.extraLandsThisTurn). It's reset each of the player's turns (resetTurnCounters) so it never persists
  // like the static "each of your turns" form (extraLandDropsOf, above). `?? 0` — not `|| 0` — so a literal 0
  // budget (no effect resolved) reads exactly 0, never a fabricated allowance.
  extra += player.extraLandsThisTurn ?? 0;
  return 1 + extra;
}

function actionsPlayLand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  if (player.landsPlayedThisTurn >= landDropAllowance(state, playerId)) return [];

  return player.hand
    .filter(card => isLand(card))
    .map(card => ({
      kind: "play-land",
      playerId,
      cardId: card.id,
      name: card.name,
    }));
}

// Bounds the X choices surfaced for an X-spell (CR 107.3). The mana ceiling already
// caps it in practice; this is the backstop so a turbo-mana board can't flood the
// action list (and the UI) with dozens of near-identical casts.
const X_CHOICE_CAP = 10;

/**
 * Affordable X values for an {X}-cost spell, as a bounded ascending list [1..maxX].
 * maxX = total available mana (pool + untapped sources) minus the fixed cost. Each
 * candidate is verified through the real `canAfford` planner (so colored-pip
 * constraints are exact, not estimated); since adding +1 generic only ever makes the
 * cost harder, affordability is monotonic in X — the first failure ends the list.
 * X=0 is legal but never useful here (a 0 X-spell does nothing), so we start at 1.
 */
function affordableXValues(state, playerId, cost) {
  const player = state.players[playerId];
  const sources = manaSources(state, playerId);
  const poolTotal = totalAvailableMana(state, playerId);
  const sourceTotal = sources.reduce((sum, s) => sum + (s.amount || 1), 0);
  const ceiling = Math.min(poolTotal + sourceTotal, X_CHOICE_CAP);
  const out = [];
  for (let x = 1; x <= ceiling; x++) {
    const xCost = xResolvedCost(cost, x);
    if (!canAfford(player.manaPool, sources, xCost)) break; // monotonic in X
    out.push(x);
  }
  return out;
}

/**
 * Resolve a parsed cost at a chosen X: fold the X mana into the generic portion.
 * The amount owed is `xCount * X` (CR 107.3) — a {X}{X} cost charges 2X, not X.
 * `xCount` defaults to 1 (a single {X}) for any cost parsed before this field
 * existed, so the single-X path is byte-identical to the old `generic + x`.
 * Pure: returns a new cost; the chosen X is NOT the effect magnitude (the action
 * still carries `xValue: x`, which resolution uses for counters/tokens/damage).
 */
export function xResolvedCost(cost, x) {
  const pips = cost.xCount ?? (cost.hasX ? 1 : 0);
  return { ...cost, generic: (cost.generic || 0) + pips * x };
}

function actionsCastSpell(state, playerId) {
  return castActionsFromZone(state, playerId, state.players[playerId].hand, "hand", null);
}

// DISCOVER (LCI) — the decision for a card found by discover (parked in exile, state.pendingDiscover): CAST
// IT FREE (full target/mode/additional-cost enumeration via the shared builder with freeCast=true, fromZone
// "exile" — so targeting/AI/the stack all reuse the normal cast path; X is forced to 0 per CR 601.2b) OR
// PUT IT IN HAND. Both clear pendingDiscover in the dispatcher. An unmodeled found card still offers a (no-op)
// free-cast — the engine's consistent behavior for any unmodeled spell, not a discover gap.
function actionsDiscoverDecision(state, playerId) {
  const pd = state.pendingDiscover;
  if (!pd || pd.controller !== playerId) return [];
  const card = (state.players[playerId]?.exile || []).find((c) => c.id === pd.cardId);
  const toHand = { kind: "discover-to-hand", playerId, cardId: pd.cardId, name: card?.name };
  if (!card) return [toHand]; // defensive: the card vanished from exile → only the (no-op) hand option remains
  return [...castActionsFromZone(state, playerId, [card], "exile", null, true), toHand];
}

// FREE-CAST (CR 601.2b) — the decision for "you may cast a spell with mana value N or less from your hand
// without paying its mana cost" (Rishkar's Expertise et al.), parked in state.pendingFreeCast by the free-cast
// atom. Offer a FREE-CAST action per still-eligible hand candidate (full target/mode/additional-cost
// enumeration via the shared builder with freeCast=true, fromZone "hand" — so targeting/AI/the stack all
// reuse the normal cast path; X is forced to 0 per CR 601.2b) PLUS a DECLINE action (the "may" — CR 601.2b).
// The candidate ids were captured at resolution; re-validate against the CURRENT hand (a card may have left,
// e.g. an intervening discard) so a stale id never offers a phantom cast. Both the cast and the decline clear
// pendingFreeCast in the dispatcher. An unmodeled candidate still offers a (no-op) free-cast — the engine's
// consistent behavior for any unmodeled spell, identical to discover.
function actionsFreeCastDecision(state, playerId) {
  const pf = state.pendingFreeCast;
  if (!pf || pf.controller !== playerId) return [];
  const hand = state.players[playerId]?.hand || [];
  const ids = new Set(pf.candidateIds || []);
  const candidates = hand.filter((c) => ids.has(c.id));
  const decline = { kind: "free-cast-decline", playerId };
  // Every candidate is cast from HAND for free; concatenate each card's enumerated cast actions, then the
  // decline. A candidate that left the hand is naturally dropped (re-validated above) — never a phantom cast.
  const castActions = candidates.flatMap((card) => castActionsFromZone(state, playerId, [card], "hand", null, true));
  return [...castActions, decline];
}

// CASCADE (CR 702.85a) — the decision for a card found by cascade (parked in exile, state.pendingCascade): CAST
// IT FREE (full target/mode/additional-cost enumeration via the shared builder with freeCast=true, fromZone
// "exile" — so targeting / the stack / cast triggers / AI all reuse the normal cast path; X is forced to 0 per
// CR 601.2b) OR DECLINE (the "may" — the found card joins "the rest" on the BOTTOM of the library). This differs
// from discover's two options only in the non-cast branch: discover puts the found card in HAND, cascade bottoms
// it (CR 702.85a — "Put the exiled cards on the bottom in a random order"). Both clear pendingCascade in the
// dispatcher. An unmodeled found card still offers a (no-op) free-cast — the engine's consistent behavior for
// any unmodeled spell, identical to discover.
function actionsCascadeDecision(state, playerId) {
  const pc = state.pendingCascade;
  if (!pc || pc.controller !== playerId) return [];
  const card = (state.players[playerId]?.exile || []).find((c) => c.id === pc.cardId);
  const decline = { kind: "cascade-decline", playerId, cardId: pc.cardId };
  if (!card) return [decline]; // defensive: the card vanished from exile → only the (no-op) decline remains
  return [...castActionsFromZone(state, playerId, [card], "exile", null, true), decline];
}

// CMD-CAST (CR 903.8) — a player may cast a commander they own FROM the command zone; it costs an
// additional {2} for each PREVIOUS time they've cast it from the command zone this game (the "commander
// tax"). This mirrors hand-casting EXACTLY (same timing / affordability / target / X / modal / additional
// -cost machinery) via the shared `castActionsFromZone`, adding only the per-commander tax + a
// `fromZone:"command"` marker. Commander-mode only: gated on a non-empty command zone, so Standard (no
// command zone) is a no-op. Most commanders are creatures → sorcery-speed timing via isSorcerySpeed.
function actionsCastCommander(state, playerId) {
  const player = state.players[playerId];
  const command = player.command || [];
  if (command.length === 0) return [];
  const counts = player.commanderCastCount || {};
  return castActionsFromZone(state, playerId, command, "command", (card) => 2 * (counts[card.id] || 0));
}

// CMD-COMPANION (CR 702.139) — the once-per-game "{3}: put this card from outside the game into your hand"
// action. Sorcery-speed (own main, empty stack); offered only while the companion is still outside the game
// (player.companion is set). The dispatcher pays {3}, moves it to hand, and clears the field, so it's offered
// exactly once. After that the companion is a NORMAL hand card — cast via actionsCastSpell, NO commander tax.
function actionsCompanion(state, playerId) {
  const player = state.players[playerId];
  const companion = player.companion;
  if (!companion) return [];
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const cost = parseManaCost("{3}");
  if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) return [];
  return [{ kind: "companion-to-hand", playerId, cardId: companion.id, name: companion.name, cost, cmc: 3 }];
}

// SELF-METRIC-COST-REDUCTION (CR 601.2f) — the generic-mana reduction a spell grants ITS OWN cast via a
// "This spell costs {X} less to cast, where X is <metric>" clause (Ghalta / The Great Henge / Cavern-Hoard
// Dragon / Excalibur). selfCostReductionMetric parses the clause to a serializable metric kind (or null); this
// evaluates that kind against the LIVE board (read at cast announce). Generic-only + floored by the caller; the
// mana value is untouched (CR 202.3). 0 when the card has no self-metric clause. The four modeled metrics:
//   • totalPowerYouControl            — Σ live power of the controller's creatures (layer-aware creaturePower).
//   • greatestPowerYouControl         — the single greatest live power (reuses countForSpec — same as the draw/mana path).
//   • greatestArtifactsAnOpponentControls — the MAX, over the controller's opponents, of that opponent's artifact count.
//   • totalManaValueHistoricYouControl — Σ MV of the controller's HISTORIC permanents (artifact / legendary / Saga, CR 702.149a).
function selfCostReductionForSpell(state, playerId, card) {
  const metric = selfCostReductionMetric(card);
  if (!metric) return 0;
  const player = state.players[playerId];
  if (!player) return 0;
  switch (metric.kind) {
    case "totalPowerYouControl":
      return (player.battlefield || [])
        .filter((p) => /\bCreature\b/.test(typeLineOf(p.card)))
        .reduce((sum, p) => sum + Math.max(0, creaturePower(p, state)), 0); // CR 107.1b — a negative power contributes 0 to a "total power" count
    case "greatestPowerYouControl":
      return countForSpec(state, { controller: playerId }, { kind: "greatestPowerYouControl" });
    case "greatestArtifactsAnOpponentControls": {
      let best = 0;
      for (const oppId of opponentsOf(state, playerId)) {
        const opp = state.players[oppId];
        if (!opp) continue;
        const n = (opp.battlefield || []).filter((p) => /\bArtifact\b/.test(typeLineOf(p.card))).length;
        if (n > best) best = n;
      }
      return best;
    }
    case "totalManaValueHistoricYouControl":
      return (player.battlefield || [])
        .filter((p) => isHistoricPermanent(p.card))
        .reduce((sum, p) => sum + manaValueOf(p.card), 0);
    default:
      return 0;
  }
}

// HISTORIC (CR 702.149a) — an artifact, a legendary permanent, OR a Saga. Used by the Excalibur self-metric.
function isHistoricPermanent(card) {
  const t = typeLineOf(card);
  return /\bArtifact\b/.test(t) || /\bLegendary\b/.test(t) || /\bSaga\b/.test(t);
}

// A permanent's mana value (CR 202.3 — the printed mana cost). Prefer the card's numeric `cmc` (Scryfall), else
// compute it from the mana-cost string. The commander tax / cost reducers never change MV, so the printed cost
// is correct.
function manaValueOf(card) {
  if (typeof card?.cmc === "number" && Number.isFinite(card.cmc)) return card.cmc;
  return totalCmc(parseManaCost(manaCostOf(card)));
}

// COUNTER-NO-TARGET GATE (CR 601.2c) — the spellFilter of a stack-targeting counter clause on an
// instant/sorcery, or null. A spell whose target requirement is a SPELL ON THE STACK ("counter target
// [noncreature|creature|…] spell", incl. soft/MV-exact forms) can't legally be cast with no legal target
// (CR 601.2c). HIGH single-/multi-atom counters already self-gate via expandCastChoices (the program path
// `continue`s before the no-target fall-through), so this exists for the LOW-confidence counters (Remand,
// Cryptic Command, Force of Will, Daze, Stubborn Denial, …) whose unmodeled rider/alt-cost drops the
// program below HIGH — they currently fall through to the no-target `else` and are wrongly OFFERED at an
// empty stack. Detection reuses the canonical, anchored counterClauseParser (so the spellFilter discipline
// can't drift): split the oracle on sentence / line / bullet / em-dash boundaries (mirroring how the parser
// segments clauses) and return the first fragment that parses to a `counter` atom targeting a spell.
//   FN-SAFE: a counter clause the parser can't anchor-match (Disallow / Voidslime "counter target spell,
//   activated ability, or triggered ability" — which can target an ABILITY, so a spell needn't be present)
//   returns null → behavior UNCHANGED. Restricted to instant/sorcery so a CREATURE/permanent whose counter
//   lives in a triggered ability (Mystic Snake "When this enters, counter target spell") is never gated —
//   its cast needs no stack target (the counter fires from the ETB trigger at resolution).
function counterSpellTargetFilter(card) {
  const type = typeLineOf(card);
  if (!type.includes("Instant") && !type.includes("Sorcery")) return null; // cast-time counters only
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!/counter target .*?spell/i.test(oracle)) return null;               // cheap pre-filter
  const fragments = oracle
    .replace(/\([^)]*\)/g, " ")    // strip reminder text
    .split(/[\n.]|•|—/)            // sentences / lines / modal bullets / em-dash mode headers
    .map((s) => s.replace(/^[\s•-]+/, "").trim())
    .filter(Boolean);
  for (const frag of fragments) {
    const atom = counterClauseParser(frag);
    if (atom && atom.op === "counter" && atom.targetType === "spell") return atom.spellFilter || "any";
  }
  return null;
}

// Shared cast-action builder for a player's castable zone (hand or command). `taxFn(card)` returns the
// extra GENERIC mana to add to the printed cost (CR 903.8 commander tax); null = untaxed. `fromZone`
// rides on every emitted action so the dispatcher splices the card out of the correct zone at cast.
// DISCOVER/free-cast: `freeCast` enumerates a "cast it without paying its mana cost" (CR 601.2b) — it
// BYPASSES the sorcery-speed timing gate (the cast happens during resolution) + the mana affordability
// gate (cost is waived), forces an X-spell's X to 0 (CR 601.2b), and stamps `freeCast` on every emitted
// action (actionDispatcher then skips the mana payment). ADDITIONAL costs still apply (still enumerated
// below). When false (every normal hand/command cast) behavior is byte-identical.
function castActionsFromZone(state, playerId, cards, fromZone, taxFn, freeCast = false) {
  const player = state.players[playerId];
  const actions = [];

  // STATIC-COST-REDUCTION: the subtype cost-reducers this player controls, gathered ONCE (each zone is
  // invariant across the loop). Skipped for a free-cast (it pays no mana). costReductionForSpell matches each
  // castable card's type line against them below. CR 601.2f. Two sources:
  //   • battlefield permanents — every reducer ("Dragon spells you cast cost {2} less" — Dragonspeaker Shaman).
  //   • the command zone — ONLY EMINENCE reducers (The Ur-Dragon's "as long as ~ is in the command zone or on
  //     the battlefield, other Dragon spells you cast cost {1} less"), so a commander discounts its tribe while
  //     it sits in the command zone (the normal pattern), not only once it has been cast onto the battlefield.
  //     command entries are BARE card objects (no { card } wrapper), unlike battlefield permanents.
  const costReducers = freeCast
    ? []
    : [
        // Pass the battlefield PERMANENTS (not bare cards) so a CHOSEN-TYPE reducer (Urza's Incubator) can pair
        // with its source permanent's stored chosenType; collectCostReducers reads `.card` + `.chosenType`.
        ...collectCostReducers(player.battlefield || []),
        ...collectCostReducers(player.command || [], { commandZone: true }),
      ];

  for (const card of cards) {
    if (isLand(card)) continue;

    const sorcerySpeed = isSorcerySpeed(card);
    const timingOk = sorcerySpeed
      ? canCastSorcerySpeed(state, playerId)
      : canCastInstantSpeed(state, playerId);
    if (!freeCast && !timingOk) continue;

    let cost = parseManaCost(manaCostOf(card));
    // Mana value is a card characteristic the commander tax does NOT change (CR 202.3b) — capture it from
    // the PRINTED cost before the tax is folded into `cost` (which becomes the payable amount).
    const printedCmc = totalCmc(cost);
    if (freeCast) {
      cost = { generic: 0 }; // waived — the dispatcher pays no mana for a free-cast (additional costs still apply)
    } else {
      const tax = taxFn ? taxFn(card) : 0;
      if (tax) cost = { ...cost, generic: (cost.generic || 0) + tax };
      // STATIC-COST-REDUCTION (CR 601.2f): subtype / color / chosen-type reducers ("Dragon spells you cast
      // cost {2} less" — Dragonspeaker; "red or green" — Goblin Anarchomancer; "of the chosen type" — Urza's
      // Incubator) reduce the GENERIC portion only, floored at {0}. SELF-METRIC reduction ("This spell costs
      // {X} less to cast, where X is <board metric>" — Ghalta, The Great Henge, Cavern-Hoard Dragon, Excalibur)
      // is the spell discounting ITS OWN cast by a LIVE board count, read here at cast announce (CR 601.2f).
      // Both are generic-only (the colored pips are NEVER reduced — Math.max(0, …) floors the generic, the pips
      // are untouched). Applied AFTER the commander tax (both adjust the cost to pay) and BEFORE affordability +
      // the {X} branch, so an X-spell's base is reduced before {X}. printedCmc (the mana value) is untouched (CR
      // 202.3). The self-metric reads the casting player's board (creature power / artifact counts / historic MV).
      const reduction = costReductionForSpell(costReducers, card) + selfCostReductionForSpell(state, playerId, card);
      if (reduction) cost = { ...cost, generic: Math.max(0, (cost.generic || 0) - reduction) };
    }
    // Castable if the pool PLUS what untapped lands/rocks/dorks could produce
    // covers the cost — the dispatcher auto-taps to pay. (Pool-only would
    // never be castable since nothing pre-fills it.) A free-cast skips this (no mana paid).
    const affordable = freeCast || canAfford(player.manaPool, manaSources(state, playerId), cost);
    // EMERGE (CR 702.97): the whole POINT of emerge is casting the Eldrazi when the FULL printed cost is out
    // of reach — sacrificing a creature cuts the cost by its mana value. So when the normal cast is NOT
    // affordable, do NOT skip the card outright (the old `if (!affordable) continue`): an emerge cast may
    // still be payable. Compute the emerge spec here (gated on a native body — the SAME gate coverage uses,
    // so the metric and the runtime can't drift) and only `continue` past the card when neither the normal
    // cast NOR any emerge cast is possible. A free-cast pays nothing, so emerge (which needs a sacrifice +
    // reduced mana) isn't offered then.
    const emergeSpec = freeCast ? null : parseEmergeCard(card, classifyCard, isNativeTier);
    if (!affordable && !emergeSpec) continue;

    const effect = parseSpellEffect(card);
    const program = parseEffectProgram(card);
    const base = {
      kind: "cast-spell",
      playerId,
      fromZone, // CMD-CAST: "hand" (default) or "command" — the dispatcher splices from the right zone
      cardId: card.id,
      name: card.name,
      cost,
      cmc: printedCmc,
      ...(freeCast ? { freeCast: true } : {}), // DISCOVER: the dispatcher skips the mana payment for this cast
      effect: effect || null,
      // P2.2: the serializable EffectProgram the dispatcher resolves through the
      // `effect-program` interpreter. `effect` stays for AI scoring of the legacy
      // single-effect shapes.
      program,
    };

    const isHigh = program && programConfidence(program) === "high";

    // ===== ADDITIONAL COSTS (cast-path, CR 601.2f) ===== a spell carrying a parser-attached additional
    // cost (`program.additionalCosts`) is paid AT CAST. Expand one cast per legal way-to-pay × the program's
    // legal target/mode combos. GATE: no legal way to pay → uncastable (continue; never offer a cast we
    // can't complete). A program is never both xSpell and additional-cost (parseEffectProgram defers that
    // compound to LOW), so this precedes the X / modal / target branches and `continue`s after — additional
    // -cost spells are fully handled here, for every effect shape (expandCastChoices covers single/multi/modal).
    // Cost kinds: sacrifice (γ1b chosen victim) · payLife (no choice) · discard (N=1, chosen hand card).
    const addCost = isHigh ? (program.additionalCosts || [])[0] : null;
    if (addCost) {
      const combos = expandCastChoices(state, playerId, program, colorsOf(card));
      if (combos.length === 0) continue;                  // a required effect target has no legal pick
      const emit = (ch, extra) => actions.push({
        ...base,
        targets: ch.targets,
        chosenMode: ch.chosenMode ?? null,
        needsTargets: ch.targets.length > 0,
        targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
        modeName: ch.label || undefined,
        ...extra,
      });
      if (addCost.kind === "sacrifice") {
        // γ1b: the player picks which permanent of <type> to sacrifice. A victim whose OWN leave-trigger
        // the dies path can't fire is excluded (sacrificeDropsTrigger) so we never partially apply.
        const victims = player.battlefield.filter(v =>
          sacTypeMatches(v.card, addCost.sacType) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""));
        if (victims.length === 0) continue;               // no legal victim → unpayable → uncastable
        for (const victim of victims) for (const ch of combos) {
          // Don't sacrifice the very permanent the effect targets — paid as a cost (gone before the spell
          // resolves) → the target would fizzle (CR 608.2b). Pointless self-defeating action; drop it.
          if (ch.targets.some(t => t.id === victim.id)) continue;
          emit(ch, { sacCreatureId: victim.id, sacCreatureName: victim.card?.name ?? null, sacName: victim.card?.name ? `sacrifice ${victim.card.name}` : undefined });
        }
      } else if (addCost.kind === "payLife") {
        // No choice — just deduct N at cast. CR 119.4: you can't pay life you don't have (paying to exactly
        // 0 is legal, an SBA loss follows), so only a strictly-unaffordable cost is uncastable.
        if ((player.life || 0) < addCost.amount) continue;
        for (const ch of combos) emit(ch, { payLifeCost: addCost.amount, payLifeName: `pay ${addCost.amount} life` });
      } else if (addCost.kind === "discard") {
        // N=1: the player picks which hand card to discard. The spell itself is being cast (on its way to
        // the stack), so it's NOT a legal discard candidate — exclude it. No legal card → uncastable.
        const discardable = player.hand.filter(h => h.id !== card.id);
        if (discardable.length < addCost.count) continue;
        for (const dc of discardable) for (const ch of combos) {
          emit(ch, { discardCardId: dc.id, discardCardName: dc.name ?? null, discardName: dc.name ? `discard ${dc.name}` : undefined });
        }
      } else {
        continue; // unknown cost kind — programConfidence already gates unsupported kinds to low (defensive)
      }
      continue;
    }

    // X-spell ({X} cost, an `amountX` atom): the player chooses X at cast (CR 601.2b).
    // Surface a BOUNDED set of affordable X values, each crossed with the program's
    // legal target combos (expandCastChoices handles per-atom target binding for both
    // sequence and modal X-spells). Each cast bakes the chosen X into the cost
    // (generic += X, so payment auto-taps fixed + X) and onto the action (xValue),
    // which the dispatcher threads into resolution.
    if (isHigh && program.xSpell) {
      // CR 601.2b — a spell cast without paying its mana cost has X = 0. Otherwise enumerate affordable X.
      const xValues = freeCast ? [0] : affordableXValues(state, playerId, cost);
      if (xValues.length === 0) continue;
      const combos = expandCastChoices(state, playerId, program, colorsOf(card));
      if (combos.length === 0) continue;
      for (const x of xValues) {
        const xCost = xResolvedCost(cost, x); // DOUBLE-X (CR 107.3): a {X}{X} spell owes 2X; xValue stays X for the effect
        const xCmc = printedCmc + (cost.xCount ?? 1) * x; // mana value = printed + total X paid (CR 202.3b); commander tax doesn't count
        // AI safety: parseSpellEffect returns null for the literal "X", so base.effect
        // is null and pickCastAction would skip its enemy-only target filter. Re-attach
        // a synthetic legacy effect for a single-atom X-damage program so the AI still
        // only aims X-burn at enemies (and holds it when there's no good target).
        let xEffect = base.effect;
        if (!xEffect && (program.atoms?.length === 1) && program.atoms[0].op === "deal-damage") {
          xEffect = { kind: "damage", amount: x, targetType: program.atoms[0].targetType };
        }
        for (const ch of combos) {
          actions.push({
            ...base,
            cost: xCost,
            cmc: xCmc,
            xValue: x,
            effect: xEffect,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
            modeName: ch.label || undefined,
            xName: `X=${x}`,
          });
        }
      }
      continue;
    }

    // P2.5: a HIGH modal or multi-atom program needs per-(mode × atom) target
    // binding the legacy single-effect path can't express — expand it through
    // `expandCastChoices` (each cast carries atomIndex-tagged targets + chosenMode).
    // Single-atom programs keep the proven legacy targeting path below unchanged.
    const atomNeedsTarget = (a) => !!a && !!a.targetType && !isNonChosenTargetType(a.targetType);
    // A single-atom program whose target the legacy `effect` can't express — the P2.7
    // extended atoms (tap/untap/bounce/exile/add-counter) — also routes through
    // expandCastChoices so its creature target is enumerated + bound.
    const isExtendedTargeted = isHigh && (program.atoms?.length || 0) === 1
      && atomNeedsTarget(program.atoms[0]) && !effectNeedsTarget(effect);
    const isMultiOrModal = isHigh
      && (program.structure === "modal" || (program.atoms?.length || 0) > 1);
    if (isMultiOrModal || isExtendedTargeted) {
      const choices = expandCastChoices(state, playerId, program, colorsOf(card));
      if (choices.length === 0) continue; // no legal cast (a required target is missing)
      for (const ch of choices) {
        actions.push({
          ...base,
          targets: ch.targets,
          chosenMode: ch.chosenMode ?? null,
          needsTargets: ch.targets.length > 0,
          targetName: ch.targets.map(t => t.name).filter(Boolean).join(", ") || undefined,
          modeName: ch.label || undefined,
        });
      }
      continue;
    }

    // ENTERS-WITH-X (hydras): a permanent whose {X} cost feeds "this creature enters with X +1/+1
    // counters" (Hungering / Lifeblood / Primordial / Hydroid Krasis Hydra…). The X isn't an effect-program
    // atom, so the xSpell branch above never fires — but the player still chooses X at cast (CR 601.2b).
    // Offer each AFFORDABLE X≥1 (a 0/0 hydra dies to the SBA instantly, so X=0 is never surfaced); the
    // dispatcher threads xValue into PERMANENT_ETB, which adds the counters so it enters at its real P/T.
    // X-COST CLONE (Mockingbird {X}{U}): an {X}-cost clone also chooses X at cast (CR 601.2b) — X sets the
    // "mana spent" the MV cap reads (cloneMvCap). Without this branch the cast would pay X=0 implicitly (an
    // underpayment FP) and the cap would be wrong. Same per-X emission as a hydra; resolveCloneChoice reads
    // xValue from the resume. (X≥1 here; X=0 — copy a 1-drop — is a safe false-negative, never surfaced.)
    if (cost.hasX && (entersWithXCounters(card) || isCloneCard(card))) {
      const xValues = affordableXValues(state, playerId, cost);
      if (xValues.length === 0) continue; // can't afford even X=1 → not usefully castable
      for (const x of xValues) {
        actions.push({
          ...base,
          cost: xResolvedCost(cost, x), // DOUBLE-X (CR 107.3): {X}{X} (Walking Ballista) owes 2X; xValue stays X for the counters
          cmc: printedCmc + (cost.xCount ?? 1) * x,
          xValue: x,
          targets: [],
          needsTargets: false,
          xName: `X=${x}`,
        });
      }
      continue;
    }

    // Aura (CR 303.4): a native Aura is a targeted permanent spell — it chooses the
    // creature it will enchant as it's cast. One cast action per creature on any
    // battlefield ("Enchant creature" has no controller restriction); no legal creature
    // → can't cast (CR 303.4a). A non-native Aura has no modeled bonus, so it falls
    // through to the no-target branch and the dispatcher routes it to the Arbiter seam.
    if (isNativeAura(card)) {
      // KW-PROTECTION (CR 702.16b): the Aura spell's colors gate targeting — a protection-from-[color]
      // creature can't be the Aura's target if the Aura is that color (also its 702.16c enchant immunity).
      const targets = enumerateTargets(state, playerId, { targetType: "creature" }, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true });
      }
      continue;
    }

    // BESTOW (CR 702.103): a bestow creature has an ALTERNATIVE cast cost that turns it into an Aura
    // spell enchanting a creature (granting "+X/+X" and/or a keyword), becoming a creature again if it
    // ever stops being attached. We offer the bestow cast ALONGSIDE the normal creature cast (this branch
    // does NOT `continue` — the iteration falls through to the no-target creature push below, so BOTH
    // modes are surfaced). Each bestow cast is the SAME shape a native Aura uses (isAuraSpell + a single
    // creature target) plus `bestow: true`, which the dispatcher routes through AURA_ETB with the
    // `bestowed` flag (the resolved permanent stays on the battlefield + becomes a creature when its host
    // leaves, vs the normal Aura falls-off-to-graveyard SBA). Only offered for a fully-native bestow card
    // (isNativeBestow — both modes clean, CREED). The bestow cost is paid INSTEAD of the printed cost, so
    // it's parsed + affordability-checked independently of the creature-mode `base.cost` above.
    const bestowCostStr = isNativeBestow(card) ? parseBestowCost(card) : null;
    if (bestowCostStr) {
      let bestowCost = parseManaCost(bestowCostStr);
      const bestowCmc = totalCmc(bestowCost); // mana value reads the (printed) bestow cost (CR 202.3b) — before the tax
      // The commander tax + static cost-reducers apply to the alt-cast too (CR 601.2f / 903.8) — mirror
      // the creature-mode cost adjustments above so a taxed/discounted bestow cast is priced correctly.
      const tax = freeCast ? 0 : (taxFn ? taxFn(card) : 0);
      if (tax) bestowCost = { ...bestowCost, generic: (bestowCost.generic || 0) + tax };
      if (!freeCast) {
        const reduction = costReductionForSpell(costReducers, card) + selfCostReductionForSpell(state, playerId, card);
        if (reduction) bestowCost = { ...bestowCost, generic: Math.max(0, (bestowCost.generic || 0) - reduction) };
      }
      const canAffordBestow = freeCast || canAfford(player.manaPool, manaSources(state, playerId), bestowCost);
      // X-cost bestow (Nyxborn Hydra is gated out by isNativeBestow today — its dynamic per-counter bonus
      // isn't modeled) — so a clean bestow card here never has {X} in its bestow cost; no X enumeration.
      if (canAffordBestow && !bestowCost.hasX) {
        const targets = enumerateTargets(state, playerId, { targetType: "creature" }, colorsOf(card));
        for (const t of targets) {
          actions.push({
            ...base,
            cost: bestowCost,
            cmc: bestowCmc,
            targets: [t],
            targetName: t.name,
            needsTargets: true,
            isAuraSpell: true,
            bestow: true,
            bestowName: `bestow onto ${t.name}`,
          });
        }
      }
      // fall through — the normal creature-mode cast is still pushed below
    }

    // AURA-LAND-MANA-BOOST (CR 303.4): a land-enchant mana Aura (Wild Growth / Overgrowth / Fertile
    // Ground) is a targeted permanent spell that chooses the LAND it enchants. "Enchant land" has no
    // controller restriction, but the only USEFUL target is one of the caster's OWN lands (enchanting an
    // opponent's land just ramps them), so we offer own lands only (a safe, useful subset). Once
    // attached, the boost mana appears inline whenever that land taps (manaModel.landAuraManaBonus).
    if (isNativeManaAura(card)) {
      const targets = enumerateTargets(state, playerId, { targetType: "land", restrictions: [{ kind: "controller", who: "you" }] }, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true, isAuraSpell: true });
      }
      continue;
    }

    // KICKER (CR 702.33) — a creature with a modeled kicker (clean single cost + an enters-with-counters
    // kicked payoff, parseKickerCounterCreature). Emit the NORMAL cast (kicked:false) and — when the kicker
    // mana is ALSO affordable on top of the base cost — a KICKED cast (kicked:true) whose `cost` folds in the
    // kicker pips, so the dispatcher's normal mana plan pays the whole thing. The dispatcher threads `kicked`
    // onto the PERMANENT_ETB payload and the resolver adds the kicked +1/+1 counters AS the creature enters.
    // These kicker creatures have no effect target (the body is keyword-only), so we own the emission here and
    // `continue`. A free-cast (Discover, CR 601.2b) is cast WITHOUT paying — kicker isn't paid (no kicked
    // option), so only the normal cast is offered (a safe limitation; the base body still resolves).
    // KICKED ETB-TRIGGER variant (Goblin Ruinblaster "When this creature enters, if it was kicked, destroy
    // target nonbasic land") — the kicked payoff is a TRIGGERED ability, not the enters-with-counters
    // replacement above. Same emission shape (the creature cast itself takes no targets — the ETB trigger
    // chooses its own target when it goes on the stack, CR 603.3c), so it shares the normal+kicked emission.
    // The dispatcher threads `kicked` onto PERMANENT_ETB → enterPermanent stamps perm.wasKicked → the "it was
    // kicked" intervening-if (interveningIf.js) fires the trigger's payoff only on a kicked cast. parseKicker-
    // EtbCreature re-classifies the kicker-line-stripped body native (the same gate coverage uses), so the
    // runtime offers the kick EXACTLY when the metric credits it. Checked alongside the counter variant (the
    // two gates are mutually exclusive — the ETB gate rejects the counters shape — so at most one matches).
    const counterKicker = parseKickerCounterCreature(card, isKeywordOnly);
    const etbKicker = !counterKicker ? parseKickerEtbCreature(card, classifyCard, isNativeTier) : null;
    const kickerSpec = counterKicker || etbKicker;
    if (kickerSpec) {
      actions.push({ ...base, targets: [], needsTargets: false, kicked: false });
      if (!freeCast) {
        const kickerCost = parseManaCost(kickerSpec.kickerCost);
        const kickedCost = mergeManaCost(cost, kickerCost); // base (already taxed/reduced) + the kicker pips
        if (canAfford(player.manaPool, manaSources(state, playerId), kickedCost)) {
          actions.push({
            ...base,
            cost: kickedCost,
            cmc: printedCmc + totalCmc(kickerCost), // CR 202.3b — mana value counts the additional kicker cost paid
            targets: [],
            needsTargets: false,
            kicked: true,
            kickedName: counterKicker ? `kicked (+${counterKicker.kicked.counters} +1/+1)` : "kicked",
          });
        }
      }
      continue;
    }

    // EMERGE (CR 702.97) — a creature with a clean "Emerge {cost}" (or "Emerge from artifact {cost}") line
    // whose BODY is native (parseEmergeCard re-classifies the keyword-line-stripped body — the SAME gate the
    // coverage classifier uses, so the metric and the runtime can't drift). For each legal sacrifice victim
    // of the emerge sac-type, emit an EMERGE cast whose `cost` is the emerge cost with its GENERIC portion
    // reduced by that victim's mana value (floored at {0}; the colored pips are never reduced — mirrors the
    // static-cost-reduction floor above). The cast carries `sacCreatureId` (the victim) + `emerge:true`; the
    // dispatcher sacrifices the victim (excluded from the mana sources, so a sacrificed dork can't also tap)
    // and pays the reduced mana, then the body's self-cast / ETB trigger fires through the normal cast path.
    // This block does NOT `continue` — the normal hard-cast (full printed cost, gated on `affordable`) still
    // falls through below, so BOTH the emerge cast and the normal cast are offered (Emerge is an ALTERNATIVE,
    // not a replacement). `emergeSpec` was computed at the affordability gate above (so an unaffordable normal
    // cost didn't skip the card). A free-cast pays nothing, so emergeSpec is null then (the base body still
    // resolves via the free-cast).
    if (emergeSpec) {
      const emergeCost = parseManaCost(emergeSpec.pips);
      const victims = player.battlefield.filter((v) => {
        const vType = String(v.card?.type || v.card?.type_line || "");
        if (!new RegExp(`\\b${emergeSpec.sacType}\\b`, "i").test(vType)) return false;
        // Exclude a victim whose own leave-trigger the dies path can't fire (mirrors the additional-cost
        // sacrifice filter), so we never offer an emerge we can't cleanly complete (CREED).
        return !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || "");
      });
      for (const victim of victims) {
        // CR 702.97a — the emerge cost is reduced by the sacrificed creature's MANA VALUE (generic only,
        // floored at {0}); the colored pips stay. parseManaCost returns a fresh object, but build a new one
        // per victim so each emerge cast carries its own reduced cost.
        const reducedGeneric = Math.max(0, (emergeCost.generic || 0) - manaValueOf(victim.card));
        const reducedCost = { ...emergeCost, generic: reducedGeneric };
        // Affordability EXCLUDES the victim from the mana sources — a sacrificed mana dork can't also tap to
        // pay (the γ1 double-spend guard; the dispatcher applies the identical exclusion).
        const sources = manaSources(state, playerId).filter((s) => s.permanentId !== victim.id);
        if (!canAfford(player.manaPool, sources, reducedCost)) continue;
        actions.push({
          ...base,
          cost: reducedCost,
          cmc: printedCmc, // CR 202.3b — mana value reads the card's PRINTED cost, unaffected by the alt-cast
          targets: [],
          needsTargets: false,
          emerge: true,
          sacCreatureId: victim.id,
          sacCreatureName: victim.card?.name ?? null,
          emergeName: victim.card?.name ? `emerge (sacrifice ${victim.card.name})` : "emerge",
        });
      }
      // fall through — the normal creature-mode hard-cast is still pushed below (only when affordable)
    }

    // EMERGE: when the normal printed cost is NOT affordable, only the emerge cast(s) emitted above are
    // offered — skip the normal-cast emission below (we got here past the affordability gate ONLY because an
    // emerge cast was viable). For every normal (affordable) cast this is a no-op (affordable === true).
    if (!affordable) continue;

    if (effectNeedsTarget(effect)) {
      // Targeted spell: one cast action per legal target (the action-expansion
      // pattern, same as multi-defender combat). No legal target → can't cast.
      // P2.4: thread target restrictions (controller/tapped/power) so a restricted
      // removal only surfaces the creatures it can legally hit.
      let targetingEffect = effect;
      if (effect.targetType === "creature") {
        const { restrictions } = parseCreatureTargetRestrictions(card);
        if (restrictions.length) targetingEffect = { ...effect, restrictions };
      }
      // KW-PROTECTION (CR 702.16b): the spell's colors gate targeting — a creature with protection from
      // a color the spell is can't be targeted by it (removal/burn immunity), even by its own controller.
      const targets = enumerateTargets(state, playerId, targetingEffect, colorsOf(card));
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true });
      }
    } else {
      // COUNTER-NO-TARGET GATE (CR 601.2c): a LOW-confidence counter that reached this no-target
      // fall-through (its unmodeled rider/alt-cost kept the program below HIGH so the self-gating program
      // path was skipped) still targets a SPELL ON THE STACK — it is uncastable with no legal target.
      // Enumerate legal stack targets via the clause's own spellFilter (so a restricted counter only counts
      // spells it can legally hit) and offer one cast per legal target; an empty / no-legal-target stack →
      // not offered. The spell still routes to the Arbiter at resolution (LOW), but is no longer OFFERED at
      // nothing. (HIGH counters never reach here — they `continue` from the program branch above.)
      const counterFilter = counterSpellTargetFilter(card);
      if (counterFilter != null) {
        const stackTargets = enumerateTargets(state, playerId, { kind: "counter", targetType: "spell", spellFilter: counterFilter }, colorsOf(card));
        if (stackTargets.length === 0) continue;       // no legal spell on the stack → can't cast (CR 601.2c)
        for (const t of stackTargets) {
          actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true });
        }
      } else {
        actions.push({ ...base, targets: [], needsTargets: false });
      }
    }
  }
  return actions;
}

/**
 * Tap-for-mana: any untapped mana source the player controls, one action per
 * (source, color) so a dual surfaces "tap for W" and "tap for U" separately.
 * Mana abilities are technically instant-speed (CR 605.3a), but surfacing
 * them at every priority window would spam the learner. v1 gates to the
 * player's OWN main phase — the window where you'd float mana to cast or to
 * pump Omnath. Casting still auto-taps at any speed via the dispatcher, so
 * this action is only the explicit manual-tap / float path (Beginner +
 * floating-mana decks). Auto modes ignore it, so they never loop on it.
 */
function actionsTapForMana(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
    let prod = manaProduction(perm.card);
    // GROUP-GRANT: a permanent with no own mana ability can have a {T}: Add … ability GRANTED by a lord
    // (Gemhide/Manaweft). DEDUP mirrors manaSources — the grant only adds a source where the permanent has
    // none of its own (the granter keeps its own quoted-text source; granting again would double it).
    if (!prod) {
      const granted = grantedManaSpecsFor(state, perm.id);
      if (granted.length) prod = { colors: granted[0].colors, amount: granted[0].amount };
    } else {
      prod = applyAuraManaGrantSupplement(state, perm, prod);   // AURA-MANA-GRANT supplement — mirrors manaSources (two-sites invariant)
    }
    if (!prod) continue;
    const isCreature = /Creature/.test(String(perm.card?.type || perm.card?.type_line || ""));
    // Granted Haste counts here too (a lord that hastes your mana dorks).
    if (isCreature && perm.summoningSick && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    // MANA-VARIABLE: a count-derived amount (Gaea's Cradle / Karametra / Bighorner) is resolved LIVE
    // against the board (CR 608.2g), floored at 0. Skip the source entirely when it would tap for 0 —
    // never offer a pointless 0-mana tap (e.g. Gaea's Cradle with no creatures).
    const amount = prod.amountSpec
      ? Math.max(0, countForSpec(state, { controller: playerId, source: perm }, prod.amountSpec))
      : prod.amount;
    if (amount <= 0) continue;
    // AURA-LAND-MANA-BOOST: a land carrying a mana-boost Aura yields extra mana INLINE when it taps
    // (the Aura is NOT tapped). landAuraManaBonus is the SAME helper manaSources/planPayment use, so
    // the explicit tap and the auto-pay planner can't drift (the CREED two-sites invariant). Each
    // bonus entry chooses its color here (a fixed-color uses its color; an any-color picks its first —
    // the explicit-tap learner play just floats the mana, no future-cost lookahead).
    const bonusSources = landAuraManaBonus(state, perm);
    const bonus = bonusSources.map(b => ({ color: b.colors[0], amount: b.amount }));
    for (const color of prod.colors) {
      actions.push({
        kind: "tap-for-mana",
        playerId,
        permanentId: perm.id,
        color,
        amount,
        sacrifices: !!prod.sacrifices,   // one-shot Treasure/Gold — applyTapForMana sacrifices it (TOK-2)
        ...(bonus.length ? { bonus } : {}),
        name: perm.card.name,
      });
    }
  }
  return actions;
}

/**
 * Activated abilities (`{cost}: effect`, CR 602.1) — P2.9. One action per (ability ×
 * legal-target combo), mirroring the cast-spell expansion. Only abilities whose cost
 * reduces to the modeled subset (mana pips + `{T}`) AND whose effect parses HIGH are
 * offered (`effects/abilities.parseActivatedAbilities`); MANA abilities (`{T}: Add …`)
 * are handled by `actionsTapForMana`, not here.
 *
 * v1 gates to the player's OWN main phase with priority (same window as
 * `actionsTapForMana`) — activated abilities are instant-speed (CR 602.2), but
 * surfacing them at every priority window would spam the learner; the AI auto-pickers
 * ignore this kind (like tap-for-mana) so they never loop on it. Instant-speed timing
 * is a later refinement.
 */
// GRANTED-ACTIVATED (subsystem 1 phase 1b): the activated abilities an Aura confers on its host creature.
// Walks the host's attachments (mirroring landAuraManaBonus) and parses each grant's quoted ability via
// the canonical parseGrantedActivatedAbilities, so cost/effect/modeled match a printed ability exactly.
function grantedActivatedForHost(state, hostPerm) {
  if (!hostPerm?.attachments?.length) return [];
  const out = [];
  for (const attId of hostPerm.attachments) {
    const lk = findPermanent(state, attId);
    if (lk?.permanent?.card) out.push(...parseGrantedActivatedAbilities(lk.permanent.card));
  }
  return out;
}

function actionsActivateAbility(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const perm of player.battlefield) {
    // GRANTED-ACTIVATED (subsystem 1 phase 1b): an Aura on this creature can confer an activated ability
    // ("Enchanted creature has \"{T}: …\""). The granted descriptors are enumerated HERE on the host, so
    // tapSelf taps the host and the effect's "this creature"/"you" bind to the host/controller at resolution.
    const printed = parseActivatedAbilities(perm.card);
    // GRANTED-ACTIVATED — abilities conferred on this permanent by (a) an Aura/Equipment ATTACHED to it
    // ("Enchanted creature has \"…\""), and (b) a GROUP static ("All Slivers have \"{2}: Regenerate this
    // permanent.\"" — Clot Sliver). The group grants come from layers.grantedActivatedQuotedFor (selector-
    // matched) as raw quoted text, parsed HERE via the SAME parseActivatedAbilities as printed/attachment
    // grants, so cost/effect/modeled/binding are identical and enumerated ON THIS permanent — "this permanent"
    // binds to perm.id (the recipient), the {T}/sacrifice cost taps/sacs perm, never the granter.
    const groupGranted = grantedActivatedQuotedFor(state, perm.id)
      .flatMap((q) => parseActivatedAbilities({ name: perm.card?.name || "GroupGranted", type: "Creature", oracle: q }))
      .filter((a) => a.modeled && !a.isManaEffect);
    const granted = [...grantedActivatedForHost(state, perm), ...groupGranted];
    const abilities = granted.length ? [...printed, ...granted] : printed;
    if (!abilities.length) continue;
    // LOCK-ACTIVATED (Koma mode 1 — "Its activated abilities can't be activated this turn"): a permanent
    // under the layer-6 "activatedAbilitiesLocked" grant (applyTapEffect, end-of-turn duration) can't have
    // ANY of its activated abilities activated this turn (CR 603-style continuous restriction). Mana abilities
    // route through the no-stack mana path, not here, so this gate covers the stack-activated abilities the
    // restriction targets; the grant auto-expires at cleanup, so the suppression is exactly one turn.
    if (permanentHasKeyword(state, perm.id, "activatedAbilitiesLocked")) continue;
    const isCreaturePerm = isCreature(perm.card);
    for (const ab of abilities) {
      if (!ab.modeled) continue;
      if (ab.tapSelf) {
        if (perm.tapped) continue; // can't tap an already-tapped source
        // CR 302.6: a creature's {T} ability needs it un-summoning-sick (granted Haste counts).
        if (isCreaturePerm && perm.summoningSick && !permanentHasKeyword(state, perm.id, "Haste")) continue;
      }
      const cost = parseManaCost(ab.manaPips || "");
      if (cost.hasX) continue; // X-cost activated abilities deferred (need the X-choice expansion)
      // γ1 — a "Pay N life" cost needs the life to spend (CR 119.4: you can't pay life you don't
      // have). Paying down to exactly 0 is legal (an SBA loss follows), so only skip a strictly-
      // unaffordable one — never hide a legal play.
      if (ab.payLife && player.life < ab.payLife) continue;
      // γ1c — a "Remove a <type> counter from this" cost needs the source to actually HAVE such a
      // counter; otherwise it's unpayable (never offer a cost we can't pay).
      if (ab.removeCounter && !((perm.counters?.[ab.removeCounter.type] || 0) >= 1)) continue;
      // γ1d — a "Sacrifice N <fungible subtype>" cost (Ruthless Knave "Sacrifice three Treasures", Olivia
      // "Sacrifice two Treasures"). The subtype is a FUNGIBLE value token (Treasure/Food/…), so the N victims
      // are interchangeable — no meaningful choice among them (CR 701.16). Gather every legal victim of the
      // subtype (excluding any that would silently drop its own leave-trigger — the single-sac fail-safe; a
      // value token has none, so it's a belt-and-suspenders no-op), and require ≥ N to exist. The N to-be-
      // sacrificed victims must NOT also tap for mana (a Treasure cracked for the cost can't ALSO pay the
      // {mana} part — that double-spend crashed the dispatcher), so they're excluded from the mana sources
      // below. Computed BEFORE the affordability gate so the cost is judged against the mana sources that
      // actually remain after paying the sac.
      let sacCountPool = null;
      if (ab.sacCount) {
        sacCountPool = player.battlefield.filter((v) =>
          sacTypeMatches(v.card, ab.sacCount.type, ab.sacCount.subtype || null) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (sacCountPool.length < ab.sacCount.count) continue; // can't pay the sac → not offered
      }
      // The set of permanents consumed BY the sac is always exactly N members of the fungible pool, whichever
      // N — so for the offer-time affordability check, excluding the first N from the mana sources is correct
      // (a different per-choice pick, forced by target overlap below, removes an equally-non-mana member).
      const sacCountManaExcluded = new Set(ab.sacCount ? sacCountPool.slice(0, ab.sacCount.count).map((v) => v.id) : []);
      // A source paying part of its OWN cost by tapping ({T}), being sacrificed, or being exiled can't
      // ALSO tap for mana — drop it from the available mana sources for the affordability + payment. The
      // γ1d sac-N victims are dropped too (a sacrificed Treasure can't also be cracked for mana).
      const sources = manaSources(state, playerId).filter((s) =>
        !((ab.tapSelf || ab.sacSelf || ab.exileSelf) && s.permanentId === perm.id) &&
        !sacCountManaExcluded.has(s.permanentId));
      if (!canAfford(player.manaPool, sources, cost)) continue;

      // Equip {cost}: target a creature YOU control (CR 702.6e). Equip is SORCERY-SPEED
      // (CR 702.6f) — unlike other activated abilities (instant-speed, conservatively
      // main-gated here), it also needs an EMPTY stack, or the player could illegally equip
      // in response to a spell already on the stack. One action per legal creature target.
      if (ab.isEquipAbility) {
        if ((state.stack?.length || 0) > 0) continue;
        for (const t of player.battlefield) {
          if (!isCreature(t.card)) continue;
          // KW-UNTARGET: Equip is a TARGETED ability (CR 702.6e), so it obeys targetability — a Shroud
          // creature (CR 702.18a) can't be targeted even by its controller. Route through the shared
          // guard (hexproof never blocks here, since Equip only targets your OWN creatures — CR 702.11b).
          if (!canBeTargetedBy(state, t, playerId, playerId)) continue;
          actions.push({
            kind: "activate-ability", playerId, permanentId: perm.id, name: perm.card.name,
            abilityIndex: ab.index, cost, cmc: totalCmc(cost), tapSelf: false, program: null,
            targets: [{ id: t.id, name: t.card?.name, type: "creature" }],
            needsTargets: true, targetName: t.card?.name, abilityText: ab.costStr, isEquipAbility: true,
          });
        }
        continue;
      }

      // γ1b — a "Sacrifice a/another <type>" cost: the PLAYER picks which permanent to sacrifice. Expand
      // one action per legal victim (a permanent you control of <type>, excluding the source when
      // "another"), so the choice is a real in-game pick from the action list. A victim that would
      // silently drop its OWN trigger on leaving (an LTB / "when you sacrifice" / compound trigger the
      // dies path can't fire) is excluded — the same fail-safe as self-sac — so we never partially apply.
      let sacVictims = [null];
      if (ab.sacOther) {
        sacVictims = player.battlefield.filter((v) =>
          (!ab.sacOther.another || v.id !== perm.id) &&
          sacTypeMatches(v.card, ab.sacOther.type, ab.sacOther.subtype || null) &&
          !sacrificeDropsTrigger(v.card?.oracle || v.card?.oracle_text || ""),
        );
        if (sacVictims.length === 0) continue; // no legal sacrifice available → the cost can't be paid
      }

      const choices = expandCastChoices(state, playerId, ab.program);
      if (choices.length === 0) continue; // a required target has no legal pick → uncastable
      for (const victim of sacVictims) {
        for (const ch of choices) {
          // Don't offer sacrificing the very permanent the effect targets — the victim is paid as a
          // cost (gone before the ability resolves), so the effect would fizzle to a no-op (CR 608.2b).
          // A clean no-op, but a pointless self-defeating action; drop it from the choice list.
          if (victim && ch.targets.some((t) => t.id === victim.id)) continue;
          // γ1d — pick the N fungible victims for a "Sacrifice N <subtype>" cost, EXCLUDING any that the
          // effect targets (same no-op guard). If the targets consume so many of the pool that fewer than N
          // remain, this choice can't pay the cost → skip it (a different target combo may still be legal).
          let sacCountIds = null;
          if (ab.sacCount) {
            const targetIds = new Set(ch.targets.map((t) => t.id));
            const pick = sacCountPool.filter((v) => !targetIds.has(v.id)).slice(0, ab.sacCount.count);
            if (pick.length < ab.sacCount.count) continue;
            sacCountIds = pick.map((v) => v.id);
          }
          actions.push({
            kind: "activate-ability",
            playerId,
            permanentId: perm.id,
            name: perm.card.name,
            abilityIndex: ab.index,
            cost,
            cmc: totalCmc(cost),
            tapSelf: ab.tapSelf,
            payLife: ab.payLife || 0,
            sacSelf: ab.sacSelf || false,
            exileSelf: ab.exileSelf || false,            // γ1c — exile the source from the battlefield
            removeCounter: ab.removeCounter || null,     // γ1c — remove a counter of this type from the source
            sacCreatureId: victim?.id ?? null,           // γ1b — the chosen victim to sacrifice (cost)
            sacCreatureName: victim?.card?.name ?? null,
            sacCountIds,                                  // γ1d — the N fungible victims to sacrifice (cost)
            program: ab.program,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
            abilityText: ab.sacCount
              ? `Sacrifice ${ab.sacCount.count} ${ab.sacCount.subtype}s: ${ab.effectClause}`
              : victim ? `Sacrifice ${victim.card?.name}: ${ab.effectClause}` : ab.effectClause,
          });
        }
      }
    }
  }
  return actions;
}

/**
 * KW-CYCLING (CR 702.29) — cycling is an activated ability usable only from a player's HAND
 * ("[Cost], Discard this card: Draw a card"). Offer one `cycle` action per hand card whose plain,
 * fully-modeled cycling cost (parseCyclingCost — null for typecycling + cycle-trigger cards) the
 * player can afford. Conservatively main + priority gated like the other activated abilities (cycling
 * is instant-speed per CR 702.29a, but under-offering it at instant speed is a safe false-negative).
 */
function actionsCycleFromHand(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    const costStr = parseCyclingCost(card);
    if (!costStr) continue;
    const cost = parseManaCost(costStr);
    if (cost.hasX) continue; // an X cycling cost would need the X-choice expansion (none in the corpus)
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    actions.push({ kind: "cycle", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost) });
  }
  return actions;
}

/**
 * PLOT (CR 702.171) — `plotPlayable` is the runtime CREED gate: a card may use the plot special action
 * (and later be cast free from exile) ONLY when (a) it has a clean modeled plot cost (parsePlotCost) AND
 * (b) its NON-plot text is fully native — classifyCard strips the plot line internally, so a native tier
 * means every remaining clause is modeled. Lands can't be plotted (CR 702.171a — nonland only); classifyCard
 * returns the native "land" tier for them, so they're excluded explicitly. A partially-modeled plot card
 * (intervening-if ETB, unmodeled spell, plot-granting body) fails this gate → never offered plot, never
 * silently dropping its unmodeled text — it routes to the Arbiter as a normal hand card (whole-card CREED).
 */
function plotPlayable(card) {
  if (!card) return false;
  if (isLand(card)) return false;
  if (!parsePlotCost(card)) return false;
  return isNativeTier(classifyCard(card));
}

/**
 * PLOT step 1 — the plot SPECIAL ACTION (CR 702.171a): any time you could cast a sorcery you may pay the
 * plot cost and exile the card face-up from your hand. Offer one `plot` action per plotPlayable hand card
 * whose plot cost the player can afford. Sorcery-speed + own-main + empty-stack + priority (canCastSorcerySpeed,
 * matching "Plot only as a sorcery"). An X plot cost would need the X-choice expansion (none in the corpus) →
 * skipped (safe under-offer). The dispatcher (applyPlot) pays the cost and moves hand → exile, stamping the
 * plotted card with the turn it was plotted so it can't be cast the SAME turn (CR 702.171b).
 */
function actionsPlotFromHand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!plotPlayable(card)) continue;
    const cost = parseManaCost(parsePlotCost(card));
    if (cost.hasX) continue; // an X plot cost would need the X-choice expansion (none in the corpus)
    if (!canAfford(player.manaPool, manaSources(state, playerId), cost)) continue;
    actions.push({ kind: "plot", playerId, cardId: card.id, name: card.name, cost, cmc: totalCmc(cost) });
  }
  return actions;
}

/**
 * PLOT step 2 — cast a PLOTTED card from exile for FREE (CR 702.171b): on a turn AFTER the one it was
 * plotted, you may cast it as a sorcery without paying its mana cost. Reuses the shared cast builder with
 * fromZone "exile" + freeCast=true (the EXACT machinery DISCOVER uses to free-cast from exile — same
 * target/mode/additional-cost enumeration, same applyCastSpell resolution), so a plotted creature enters
 * via PERMANENT_ETB and a plotted spell resolves through the effect-program interpreter, identically to a
 * hand-cast. GATES (CREED): only a card stamped `_plotted` whose `_plottedTurn !== state.turn` (NOT this
 * turn — CR 702.171b), and ONLY at sorcery speed (freeCast bypasses the builder's timing gate, so it's
 * enforced here — "cast it as a sorcery"). Once per turn per card is enforced naturally: the card leaves
 * exile onto the stack when cast, so it can't be cast again.
 */
function actionsCastPlottedFromExile(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const plotted = (player.exile || []).filter(c => c && c._plotted && c._plottedTurn !== state.turn);
  if (plotted.length === 0) return [];
  return castActionsFromZone(state, playerId, plotted, "exile", null, true);
}

/**
 * ADVENTURE step 1 — cast the ADVENTURE (instant/sorcery) HALF from hand (CR 715.3). Offered ONLY for an
 * Adventure card whose BOTH halves are modeled (classifyCard returns a native tier — the metric's own
 * authority, so the runtime and coverage can't disagree; a card with an unmodeled half is body-only and is
 * NEVER offered, so we never silently drop the unmodeled half — THE CREED). We project the card onto its
 * ADVENTURE face (adventureFaceCard — same id, the adventure half's type/oracle/mana) and run it through the
 * shared cast builder, so the adventure spell's cost / X / modal / targets / additional costs are enumerated
 * EXACTLY like any instant/sorcery (instant-vs-sorcery timing comes from the projected type line). Each emitted
 * cast-spell action is stamped `adventureCast: true` + carries the projected `faceCard`, so the dispatcher
 * (applyCastSpell) resolves the adventure spell's effect and then EXILES the card with `_onAdventure` (CR
 * 715.3d) — instead of the card just vanishing as a normal instant/sorcery does.
 */
function actionsCastAdventureFromHand(state, playerId) {
  const player = state.players[playerId];
  const actions = [];
  for (const card of player.hand) {
    if (!isAdventureCard(card)) continue;
    if (!isNativeTier(classifyCard(card))) continue;            // CREED: both halves modeled, else never offer
    const face = adventureFaceCard(card);                       // project onto the adventure (instant/sorcery) half
    if (!face) continue;
    // Reuse the shared builder on the single projected face (same id) — cost/X/modal/target/timing enumeration
    // is identical to a normal instant/sorcery cast. fromZone "hand", not free (the adventure cost is paid).
    for (const a of castActionsFromZone(state, playerId, [face], "hand", null)) {
      actions.push({ ...a, adventureCast: true, faceCard: face });
    }
  }
  return actions;
}

/**
 * ADVENTURE step 2 — cast the CREATURE HALF from adventure-exile (CR 715.3e). After the adventure spell
 * resolved, the card sits in exile flagged `_onAdventure`; while it's there the owner may cast the creature
 * half at its OWN mana cost (NOT free — unlike plot/discover). We project the card onto its CREATURE face
 * (creatureFaceCard — same id, the creature half's type/oracle/mana/P-T) and run it through the shared cast
 * builder with fromZone "exile" (sorcery-speed, since a creature is sorcery-speed — enforced by the builder's
 * timing gate via the projected creature type line). Each action carries the projected `faceCard` so
 * applyCastSpell enters the CREATURE (via PERMANENT_ETB), not the combined card. Once cast it leaves exile, so
 * it can't be double-cast. The exiled card stays castable across turns (CR 715.3e — no turn restriction).
 */
function actionsCastCreatureFromAdventureExile(state, playerId) {
  const player = state.players[playerId];
  const onAdventure = (player.exile || []).filter(c => c && c._onAdventure);
  if (onAdventure.length === 0) return [];
  const actions = [];
  for (const card of onAdventure) {
    const face = creatureFaceCard(card);                        // project onto the creature half
    if (!face) continue;
    for (const a of castActionsFromZone(state, playerId, [face], "exile", null)) {
      actions.push({ ...a, faceCard: face });
    }
  }
  return actions;
}

/**
 * Loyalty abilities (`[+N]/[−N]/[0]: effect`, CR 606) — PW-1 framework + PW-2 HYBRID. A planeswalker's
 * controller may activate ONE loyalty ability of it per turn (CR 606.3 — "only if no player has
 * previously activated a loyalty ability of that permanent that turn"), only any time they could cast
 * a sorcery (own main, empty stack, priority — `canCastSorcerySpeed`, also CR 606.3). A `−N` cost is
 * offered only when the walker has ≥ N loyalty (CR 118.3).
 *
 * HYBRID (PW-2): offered for any PLAYABLE walker (no unmodeled static/trigger residue). EVERY loyalty
 * ability is surfaced — a MODELED effect resolves natively (one action per legal-target combo); an
 * UNMODELED effect is offered as a single Arbiter-routed action (cost paid natively at activation, the
 * effect adjudicated by the Arbiter). Surfacing all of them is required by the CREED — hiding an
 * unmodeled ability would silently drop it.
 */
function actionsActivateLoyalty(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  const actions = [];
  for (const perm of player.battlefield) {
    // A live planeswalker = a permanent carrying a loyalty counter (it entered as one — so a
    // creature-front DFC is excluded). The card-level gate then confirms no unmodeled static/trigger.
    if (perm.counters?.loyalty == null) continue;
    if (!planeswalkerPlayable(perm.card)) continue;
    if (perm.loyaltyActivatedThisTurn) continue; // CR 606.3 — at most one per turn per walker
    const loyalty = perm.counters.loyalty;
    for (const ab of parseLoyaltyAbilities(perm.card)) {
      // CR 118.3: a player can't pay a cost without the resources to pay it fully — so a −N loyalty
      // cost can't be paid by a walker with fewer than N loyalty. (+N / 0 are always payable.) The
      // cost is known even when the EFFECT isn't, so this gates Arbiter-routed abilities too.
      if (ab.costDelta < 0 && loyalty + ab.costDelta < 0) continue;
      const costLabel = `${ab.costDelta >= 0 ? "+" : ""}${ab.costDelta}`;
      if (ab.modeled) {
        const choices = expandCastChoices(state, playerId, ab.program);
        if (choices.length === 0) continue; // a required target has no legal pick → can't activate THIS ability
        for (const ch of choices) {
          actions.push({
            kind: "activate-loyalty",
            playerId,
            permanentId: perm.id,
            name: perm.card.name,
            abilityIndex: ab.index,
            costDelta: ab.costDelta,
            program: ab.program,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
            abilityText: `${costLabel}: ${ab.effectClause}`,
          });
        }
      } else {
        // Unmodeled effect → one Arbiter-routed action (no native targets; the Arbiter adjudicates).
        actions.push({
          kind: "activate-loyalty",
          playerId,
          permanentId: perm.id,
          name: perm.card.name,
          abilityIndex: ab.index,
          costDelta: ab.costDelta,
          program: null,
          routeToArbiter: true,
          targets: [],
          needsTargets: false,
          abilityText: `${costLabel}: ${ab.effectClause}`,
        });
      }
    }
  }
  return actions;
}

function actionsDeclareAttacker(state, playerId) {
  // Only the active player declares attackers, and only in the
  // declare-attackers step. legalChoices doesn't enforce step phase
  // hard — the caller passes the step intent. We check explicitly.
  if (state.activePlayer !== playerId) return [];
  if (state.step !== "declare-attackers") return [];

  // Creatures already attacking this combat can't be re-declared. Tapping on
  // attack already excludes most, but a Vigilance attacker stays untapped —
  // this set is what stops it (and any future no-tap attacker) from looping.
  const declared = new Set((state.combat?.attackers || []).map(a => a.permanentId));
  const player = state.players[playerId];
  const attackers = player.battlefield
    // Layer-aware (WALT-ANIMATE): a permanent granted the Creature type — an animated
    // land or man-land — can be declared as an attacker, not just printed creatures.
    .filter(p => permanentIsCreature(state, p.id))
    .filter(p => !p.tapped)
    .filter(p => !declared.has(p.id))
    // Defender (CR 702.3b) can't attack — layer-aware so a granted/removed Defender counts (EVADE).
    .filter(p => !permanentHasKeyword(state, p.id, "Defender"))
    // Granted Haste (Concordant Crossroads, sliver) counts, not just printed.
    .filter(p => !p.summoningSick || permanentHasKeyword(state, p.id, "Haste"));

  // Legal attack targets (CR 508.1a): each opponent (their face) PLUS every planeswalker they
  // control (PW-1 — a creature may attack a planeswalker instead of its controller). A face target
  // carries just `defenderId`; a planeswalker target also carries `defenderPlaneswalkerId`.
  const targets = [];
  for (const oppId of opponentsOf(state, playerId)) {
    targets.push({ defenderId: oppId });
    for (const p of (state.players[oppId]?.battlefield || [])) {
      // A battlefield permanent is an attackable planeswalker iff it ENTERED as one (it carries a
      // loyalty counter) — so a creature-front DFC entered as a creature is never offered as a PW
      // target (PW-1 review P2.1). This is the precise runtime check, not the any-face card read.
      if (p.counters?.loyalty != null) targets.push({ defenderId: oppId, defenderPlaneswalkerId: p.id, pwName: p.card?.name });
    }
  }

  // Standard fast path (a lone opponent, no enemy planeswalkers → exactly one target): the
  // dispatcher auto-fills the defender, so emit one action per creature — unchanged shape.
  if (targets.length <= 1) {
    return attackers.map(p => ({
      kind: "declare-attacker",
      playerId,
      permanentId: p.id,
      name: p.card.name,
    }));
  }

  // Multiple targets (Commander, OR any game with an enemy planeswalker): each attacker contributes
  // one action per legal target (CR 506.2) — the player picks who/what each creature swings at.
  const actions = [];
  for (const p of attackers) {
    for (const t of targets) {
      actions.push({
        kind: "declare-attacker",
        playerId,
        permanentId: p.id,
        name: p.card.name,
        defenderId: t.defenderId,
        ...(t.defenderPlaneswalkerId ? { defenderPlaneswalkerId: t.defenderPlaneswalkerId, targetName: t.pwName } : {}),
      });
    }
  }
  return actions;
}

function actionsDeclareBlocker(state, playerId, declaredAttackers = []) {
  if (state.activePlayer === playerId) return [];  // active player attacks, doesn't block
  if (state.step !== "declare-blockers") return [];
  if (declaredAttackers.length === 0) return [];

  // A creature already assigned as a blocker this combat can't block again.
  const assigned = new Set((state.combat?.blockers || []).map(b => b.blockerId));
  const player = state.players[playerId];
  const candidateBlockers = player.battlefield
    // Layer-aware (WALT-ANIMATE): an animated permanent can be declared as a blocker.
    .filter(p => permanentIsCreature(state, p.id))
    .filter(p => !p.tapped)
    .filter(p => !assigned.has(p.id));

  // Evasion runs through ONE chokepoint (combatEvasion.canBlockAttacker), read layer-aware so a
  // GRANTED keyword counts: flying/reach, unblockable, basic landwalk (gated by THIS defender's
  // lands), skulk/fear/intimidate/horsemanship, and the blocker-side "can't block" / "can block
  // only flyers". Menace is a SET rule (≥2) — gated below + normalized at resolution.
  const eligibleByAttacker = {};
  for (const attackerId of declaredAttackers) {
    eligibleByAttacker[attackerId] = candidateBlockers.filter((b) => canBlockAttacker(state, b.id, attackerId, playerId));
  }

  // Surface one action per attacker a blocker could legally block. A menace attacker (CR 702.111b)
  // needs ≥2 blockers, so we don't offer a block on it unless this defender has ≥2 eligible blockers
  // for it; resolution drops any lone menace block as the safety net. v1 doesn't enforce "must block
  // X" effects (Lure, etc.) — those stay Arbiter cases.
  const actions = [];
  for (const blocker of candidateBlockers) {
    for (const attackerId of declaredAttackers) {
      const eligible = eligibleByAttacker[attackerId];
      if (!eligible.includes(blocker)) continue;                                  // pairwise illegal
      if (attackerHasMenace(state, attackerId) && eligible.length < 2) continue;  // can't form a legal ≥2 menace block
      actions.push({
        kind: "declare-blocker",
        playerId,
        permanentId: blocker.id,
        attackerId,
        name: blocker.card.name,
      });
    }
  }
  return actions;
}

// ─── OPPONENTS-CANT-ACT (Grand Abolisher / Voice of Victory / Conqueror's Flail) ────────────────────────

/**
 * The cant-act restriction currently imposed on `playerId` by OTHER players' static abilities (CR 720 /
 * CR 116 — "your opponents can't cast spells [or activate abilities of artifacts, creatures, or
 * enchantments] during your turn"). Returns `{ cantCast }`.
 *
 * A descriptor on player P's permanent (battlefield or command zone) suppresses P's OPPONENTS' casts — but
 * ONLY during P's turn (state.activePlayer === P), the "during your turn" window. So we look at the CURRENT
 * active player; if it isn't `playerId` and that active player controls a cant-act source AND `playerId` is
 * one of their opponents, `playerId`'s casts are suppressed. Attachment-gated sources (Conqueror's Flail)
 * count ONLY while the source permanent is actually attached (attachedTo set) — re-checked live, NOT at
 * parse time, so an unattached Flail imposes nothing. The controller is never restricted by their OWN
 * source (we only suppress the active player's opponents), so this never locks your own casts.
 *
 * Only cast suppression is returned: the activated-ability half (Grand Abolisher) is already enforced by
 * the engine's own-turn-only activation gating — see the call site in legalActionsForPlayer.
 */
function opponentsCantActAgainst(state, playerId) {
  const active = state.activePlayer;
  // The window is the active player's turn; only the ACTIVE opponent's source can restrict us right now.
  if (!active || active === playerId) return { cantCast: false };
  const activePlayer = state.players?.[active];
  if (!activePlayer) return { cantCast: false };
  // `playerId` must be one of the active player's opponents for the "your opponents" scope to apply.
  if (!opponentsOf(state, active).includes(playerId)) return { cantCast: false };

  // A static "your opponents can't cast …" ability functions ONLY while its source is on the battlefield
  // (CR 113.6) — NOT from the command zone. So scan only the battlefield: a creature-commander carrying this
  // clause (Dragonlord Dromoka, Kutzil, Myrel) imposes nothing while it sits in the command zone. None of the
  // cant-cast cards have command-zone-functioning wording, so the command zone is never scanned here.
  for (const perm of (activePlayer.battlefield || [])) {
    const d = cantCastDescriptorOf(perm.card);
    if (!d) continue;
    if (d.attachedGated && !perm.attachedTo) continue; // an unattached Conqueror's Flail imposes nothing
    return { cantCast: true };
  }
  return { cantCast: false };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregate all legal actions the given player can take right now.
 * Returns an array — empty when the player has nothing legal (the
 * decisionGate auto-passes in that case).
 *
 * Options:
 *   declaredAttackers: array of permanent IDs declared as attacking
 *                      this combat (used only during declare-blockers
 *                      to enumerate blocker candidates). Caller-supplied
 *                      because the engine tracks combat assignments
 *                      separately, not in state.
 */
export function legalActionsForPlayer(state, playerId, { declaredAttackers } = {}) {
  if (!state || !state.players?.[playerId]) {
    throw new Error(`legalActionsForPlayer: invalid playerId "${playerId}"`);
  }
  // DISCOVER (LCI) — a pending discover decision short-circuits normal priority: ONLY the discovering
  // player acts, and ONLY to resolve it (it's made mid-resolution, CR — no one else gets to act). Return
  // exactly the two discover actions for the controller; an empty list for everyone else.
  if (state.pendingDiscover) {
    return state.pendingDiscover.controller === playerId ? actionsDiscoverDecision(state, playerId) : [];
  }
  // FREE-CAST (CR 601.2b) — a pending free-cast decision short-circuits normal priority IDENTICALLY to
  // discover: the casting choice is made mid-resolution (no one else acts), so return ONLY the free-cast /
  // decline actions for the controller; an empty list for everyone else. (Both pendings are FIFO — the
  // free-cast atom is the last atom of its program, so a discover and a free-cast never coexist.)
  if (state.pendingFreeCast) {
    return state.pendingFreeCast.controller === playerId ? actionsFreeCastDecision(state, playerId) : [];
  }
  // CASCADE (CR 702.85) — a pending cascade decision short-circuits normal priority IDENTICALLY to discover /
  // free-cast: the cast-it-free / decline choice is made mid-resolution (no one else acts), so return ONLY the
  // cascade actions for the controller; an empty list for everyone else. All three pendings are FIFO — each
  // parking atom is the last atom of its program — so a cascade never coexists with a discover or a free-cast.
  if (state.pendingCascade) {
    return state.pendingCascade.controller === playerId ? actionsCascadeDecision(state, playerId) : [];
  }
  // Default the declared-attackers list from live combat state, so the
  // session driver gets blocker candidates without threading it explicitly.
  // (Tests may still pass an explicit list — including [] — which wins.)
  const attackerIds = declaredAttackers ?? (state.combat?.attackers || []).map(a => a.permanentId);
  const actions = [];

  // OPPONENTS-CANT-ACT: what an active opponent's static (Grand Abolisher / Voice of Victory / a fitted
  // Conqueror's Flail) forbids THIS player from doing right now (CR 720). `cantCast` drops every cast
  // action (spells + command-zone casts) while it is the controller's turn.
  //
  // CREED — the activated-ability half (Grand Abolisher's "or activate abilities of artifacts, creatures,
  // or enchantments") is ALREADY fully enforced, NOT silently dropped: the engine offers activated/mana/
  // loyalty/cycling abilities ONLY on the acting player's own main phase (every such generator early-returns
  // when state.activePlayer !== playerId — see actionsTapForMana/actionsActivateAbility/actionsActivateLoyalty/
  // actionsCycleFromHand). So during the abolisher controller's turn an opponent can ONLY cast spells (and act
  // in combat) — they already cannot activate ANY ability of ANY permanent. Grand Abolisher's lock is thus a
  // strict subset of a restriction the engine already imposes; honoring it needs only the cast suppression
  // here, and both clauses of the card are respected. (`includeActivated` on the descriptor remains the
  // record of the modeled scope and gates the coverage flip.)
  const { cantCast } = opponentsCantActAgainst(state, playerId);

  // Pass priority — always available IF the player has priority.
  if (state.priorityHolder === playerId) {
    actions.push(actionPassPriority(playerId));
  }

  // Lands, spells, mana.
  actions.push(...actionsPlayLand(state, playerId)); // playing a land is NOT casting a spell — never suppressed
  if (!cantCast) {
    actions.push(...actionsCastSpell(state, playerId));
    actions.push(...actionsCastCommander(state, playerId)); // CMD-CAST: cast from the command zone (CR 903.8)
    actions.push(...actionsCastPlottedFromExile(state, playerId)); // PLOT step 2 (CR 702.171b): cast a plotted card free
    actions.push(...actionsCastAdventureFromHand(state, playerId)); // ADVENTURE step 1 (CR 715.3): cast the adventure (instant/sorcery) half
    actions.push(...actionsCastCreatureFromAdventureExile(state, playerId)); // ADVENTURE step 2 (CR 715.3e): cast the creature half from exile
  }
  actions.push(...actionsCompanion(state, playerId));     // CMD-COMPANION: {3} → put the companion into hand (not a cast)
  actions.push(...actionsPlotFromHand(state, playerId));  // PLOT step 1 (CR 702.171a): exile from hand for the plot cost — a SPECIAL action, not casting
  actions.push(...actionsTapForMana(state, playerId));
  actions.push(...actionsActivateAbility(state, playerId));
  actions.push(...actionsCycleFromHand(state, playerId)); // KW-CYCLING: discard a hand card to draw
  actions.push(...actionsActivateLoyalty(state, playerId));

  // Combat actions.
  actions.push(...actionsDeclareAttacker(state, playerId));
  actions.push(...actionsDeclareBlocker(state, playerId, attackerIds));

  return actions;
}

/**
 * Group the actions by kind for UI rendering. Returns:
 *   { "pass-priority": [...], "play-land": [...], "cast-spell": [...], ... }
 */
export function groupActionsByKind(actions) {
  const out = {};
  for (const action of actions) {
    if (!out[action.kind]) out[action.kind] = [];
    out[action.kind].push(action);
  }
  return out;
}

/**
 * Filter to a single kind — convenience for callers that only want
 * "what creatures could I attack with right now?"
 */
export function filterActions(actions, kind) {
  return actions.filter(a => a.kind === kind);
}

// ─── Internal exports (for testing) ───────────────────────────────────────────

export const _internals = {
  isLand,
  isCreature,
  isInstant,
  isSorcerySpeed,
  hasKeyword,
  typeLineOf,
  manaCostOf,
  canCastSorcerySpeed,
  canCastInstantSpeed,
  opponentOf,
  getZone,
  totalAvailableMana,
};
