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

import { getZone, opponentOf, opponentsOf, totalAvailableMana } from "./gameState.js";
import { canAfford, manaSources, manaProduction, landAuraManaBonus } from "./manaModel.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived tap-for-mana amount
import { hasKeyword } from "./keywords.js";
import { permanentHasKeyword, permanentIsCreature, colorsOf, grantedManaSpecsFor } from "./layers.js";
import { collectCostReducers, costReductionForSpell, cantCastDescriptorOf } from "./staticAbilityParser.js";
import { canBlockAttacker, attackerHasMenace } from "./combatEvasion.js";
import { parseSpellEffect, enumerateTargets, effectNeedsTarget, parseCreatureTargetRestrictions, canBeTargetedBy } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { isNonChosenTargetType } from "./targetTypes.js";
import { parseActivatedAbilities, sacrificeDropsTrigger, parseCyclingCost } from "./effects/abilities.js";
import { parseLoyaltyAbilities, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { isNativeAura, isNativeManaAura, entersWithXCounters } from "./staticAbilityParser.js";

// ─── Mana cost parser + can-afford check ──────────────────────────────────────

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Parse a mana cost string like "{2}{U}{U}" into a structured object:
 *   { generic: 2, W: 0, U: 2, B: 0, R: 0, G: 0, C: 0, hasX: false,
 *     hybrid: [], phyrexian: [], anyColor: 0 }
 *
 * Conventions:
 *   - Plain digits → generic (treated as a single chunk; "{10}" → 10)
 *   - W/U/B/R/G  → that color's pip
 *   - C          → colorless (distinct from generic — only colorless mana works)
 *   - X/Y/Z      → hasX flag (caller picks value; 0 used in can-afford check)
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
    // X / Y / Z
    if (pip === "X" || pip === "Y" || pip === "Z") {
      cost.hasX = true;
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

/** γ1b — does a permanent match a "Sacrifice a/an/another <type>" cost's type? "permanent" = any. */
function sacTypeMatches(card, type) {
  if (type === "permanent") return true;
  const t = typeLineOf(card);
  if (type === "creature") return t.includes("Creature");
  if (type === "artifact") return t.includes("Artifact");
  if (type === "enchantment") return t.includes("Enchantment");
  if (type === "land") return t.includes("Land");
  return false;
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

function actionsPlayLand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  if (player.landsPlayedThisTurn >= 1) return [];

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
    const xCost = { ...cost, generic: (cost.generic || 0) + x };
    if (!canAfford(player.manaPool, sources, xCost)) break; // monotonic in X
    out.push(x);
  }
  return out;
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
        ...collectCostReducers((player.battlefield || []).map((p) => p.card)),
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
      // STATIC-COST-REDUCTION (CR 601.2f): subtype reducers ("Dragon spells you cast cost {2} less to cast"
      // — Dragonspeaker Shaman) reduce the GENERIC portion only, floored at {0}. Applied AFTER the commander
      // tax (both adjust the cost to pay) and BEFORE affordability + the {X} branch, so an X-spell's base is
      // reduced before {X} is added. printedCmc (the mana value) is untouched (CR 202.3).
      const reduction = costReductionForSpell(costReducers, card);
      if (reduction) cost = { ...cost, generic: Math.max(0, (cost.generic || 0) - reduction) };
    }
    // Castable if the pool PLUS what untapped lands/rocks/dorks could produce
    // covers the cost — the dispatcher auto-taps to pay. (Pool-only would
    // never be castable since nothing pre-fills it.) A free-cast skips this (no mana paid).
    const affordable = freeCast || canAfford(player.manaPool, manaSources(state, playerId), cost);
    if (!affordable) continue;

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
        const xCost = { ...cost, generic: (cost.generic || 0) + x };
        const xCmc = printedCmc + x; // mana value = printed + chosen X (CR 202.3b); the commander tax doesn't count
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
    if (cost.hasX && entersWithXCounters(card)) {
      const xValues = affordableXValues(state, playerId, cost);
      if (xValues.length === 0) continue; // can't afford even X=1 → not usefully castable
      for (const x of xValues) {
        actions.push({
          ...base,
          cost: { ...cost, generic: (cost.generic || 0) + x },
          cmc: printedCmc + x,
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
      actions.push({ ...base, targets: [], needsTargets: false });
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
function actionsActivateAbility(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const perm of player.battlefield) {
    const abilities = parseActivatedAbilities(perm.card);
    if (!abilities.length) continue;
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
      // A source paying part of its OWN cost by tapping ({T}), being sacrificed, or being exiled can't
      // ALSO tap for mana — drop it from the available mana sources for the affordability + payment.
      const sources = manaSources(state, playerId).filter((s) => !((ab.tapSelf || ab.sacSelf || ab.exileSelf) && s.permanentId === perm.id));
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
          sacTypeMatches(v.card, ab.sacOther.type) &&
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
            program: ab.program,
            targets: ch.targets,
            chosenMode: ch.chosenMode ?? null,
            needsTargets: ch.targets.length > 0,
            targetName: ch.targets.map((t) => t.name).filter(Boolean).join(", ") || undefined,
            abilityText: victim ? `Sacrifice ${victim.card?.name}: ${ab.effectClause}` : ab.effectClause,
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
  }
  actions.push(...actionsCompanion(state, playerId));     // CMD-COMPANION: {3} → put the companion into hand (not a cast)
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
