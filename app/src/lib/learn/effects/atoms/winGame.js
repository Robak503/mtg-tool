/**
 * effects/atoms/winGame.js — WIN-GAME / LOSE-GAME atoms (Wave 3b, UPKEEP-WIN slice).
 *
 * Two effects, one resolver:
 *   - "you win the game"            → { op: "win-game", who: "controller" }
 *   - "target player loses the game" → { op: "win-game", who: "target", outcome: "lose" }
 *
 * The resolver STAMPS a flag on the affected player (`wonGame` / `lostGame`); the actual end of the
 * game is a STATE-BASED action in learnSession.recordOutcomeIfChanged (CR 104.2a/104.3a) — exactly the
 * machinery that already ends a game on life ≤ 0 / poison / commander damage / elimination. We never
 * mutate `status` here, so a win-game atom composes with the existing termination + elimination paths
 * (a winner is read before the death/elimination branches; a loser is treated as dead → removed in a
 * pod, ends the game heads-up).
 *
 * INTERVENING-IF (CR 603.4) — the upkeep-win family ("At the beginning of your upkeep, IF you control
 * ten or more Treasures, you win the game") carries an intervening-if that must be checked at BOTH the
 * trigger event AND on resolution. The flush-time check happens in gameEngine.buildTriggerStack
 * (winGameTriggerThreshold); this resolver RE-CHECKS at resolution via `atom.condition` — if the
 * condition is no longer met (a Treasure was sacrificed in response), the win does NOT happen (the
 * premature-win FP guard). A condition the evaluator can't parse returns null = UNRESOLVED → the win
 * does NOT fire (CREED: never fail-OPEN a game-ending effect; a fail-open here is an instant fake win).
 *
 * CIRCULAR-IMPORT NOTE: this module imports gameState (logEvent) only — NOT effects/parser.js (TDZ
 * hazard). The clause parser below is a PURE export wired into parser.js's registerClauseParser seam
 * at the bottom of parser.js. The strict threshold evaluator is self-contained here (it does NOT reuse
 * triggers.checkInterveningIf, which FAILS OPEN on an unparsed condition — fatal for a win).
 */

import { logEvent } from "../../gameState.js";
import { payManaCost } from "../../manaModel.js"; // PACT rider: the shared plan-and-commit payment (manaModel -> atoms/shared only, no cycle back here)

// Spelled cardinals that appear in win-threshold conditions (ten Treasures, thirty artifacts, fifty
// life, one hundred tower counters). A win condition NEVER fires on a number the evaluator can't read
// (it returns null), so this map is the allowlist — an out-of-range word → null → no win (safe).
const THRESHOLD_WORD = {
  ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  "one hundred": 100, hundred: 100,
  thirteen: 13, // Triskaidekaphile — the sole "exactly thirteen" win (SHELF-TAIL SH2)
};

/** Parse a count token (numeric "40" or a spelled "thirty") to an integer, or null if unrecognized. */
function parseThresholdCount(token) {
  const t = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(THRESHOLD_WORD, t)) return THRESHOLD_WORD[t];
  return null;
}

function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}

/**
 * STRICTLY evaluate an upkeep-win intervening-if condition for `controllerId`. Returns:
 *   true  — the condition is met (the win fires)
 *   false — the condition is NOT met (no win)
 *   null  — the condition is OUTSIDE the modeled vocabulary → caller must NOT fire (CREED: a win
 *           effect never fail-opens; an unparsed condition is treated as "can't confirm" = no win).
 *
 * Modeled shapes (anchored, all-or-nothing — any residue/unknown word → null):
 *   "you have N or more life"                              (Felidar Sovereign 40, Test of Endurance 50)
 *   "you control N or more <Type|Subtype>"                 (Revel in Riches 10 Treasures, Knuckles 30 artifacts)
 *   "N or more creature cards are in your graveyard"       (Mortal Combat 20)
 * The <Type|Subtype> match is by literal containment in the permanent's type line — "Treasures" →
 * `\bTreasure\b`, "artifacts" → `\bArtifact\b` — i.e. exactly the existing checkInterveningIf semantics,
 * but with spelled-cardinal support and a STRICT null on anything it can't read.
 */
export function evaluateWinThreshold(state, condition, controllerId) {
  const c = String(condition || "").toLowerCase().trim();
  const player = state?.players?.[controllerId];
  if (!player) return false; // controller gone → no win (CR 800.4a)

  // "you have N or more life"
  let m = c.match(/^you have (\d+|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|hundred) or more life$/);
  if (m) {
    const n = parseThresholdCount(m[1]);
    return n == null ? null : (player.life || 0) >= n;
  }

  // "you control N or more <type|subtype>" — count battlefield permanents whose type line contains the
  // (singularized) word. The singular form is matched as a whole word (\bTreasure\b) so "Treasures"
  // counts Treasure tokens, "artifacts" counts artifacts.
  m = c.match(/^you control (\d+|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|hundred) or more ([a-z]+)$/);
  if (m) {
    const n = parseThresholdCount(m[1]);
    if (n == null) return null;
    const singular = m[2].replace(/s$/, "");                  // "treasures" → "treasure", "artifacts" → "artifact"
    const word = singular.charAt(0).toUpperCase() + singular.slice(1); // type lines are Title-Cased
    const re = new RegExp(`\\b${word}\\b`, "i");
    const count = (player.battlefield || []).filter((p) => re.test(typeStr(p.card))).length;
    return count >= n;
  }

  // "N or more creature cards are in your graveyard" (Mortal Combat). Typed graveyard-card count.
  m = c.match(/^(\d+|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|hundred) or more creature cards are in your graveyard$/);
  if (m) {
    const n = parseThresholdCount(m[1]);
    if (n == null) return null;
    const count = (player.graveyard || []).filter((card) => /Creature/.test(typeStr(card))).length;
    return count >= n;
  }

  // "you have exactly N cards in your hand" (Triskaidekaphile — SH2). A FRAGILE exact-count win (=== N,
  // never >=): the printed threshold is precise, and the "no maximum hand size" static on the same card is
  // what makes holding exactly 13 legal. Hand size is the live hand length; an absent hand → 0 (never
  // exactly-13 by accident). Only "thirteen" is in the allowlist today (the sole printed card); a number
  // the map can't read → null → no win (safe, no fail-open).
  m = c.match(/^you have exactly (\d+|thirteen) cards in your hand$/);
  if (m) {
    const n = parseThresholdCount(m[1]);
    return n == null ? null : (player.hand || []).length === n;
  }

  return null; // outside the modeled vocabulary → caller must NOT fire (no fail-open)
}

/**
 * Is an upkeep-win intervening-if condition one the strict evaluator can READ (regardless of whether
 * it's currently met)? Pure, state-free — used by the coverage metric to mirror the runtime's
 * native-routing decision (gameEngine.buildTriggerStack routes a win-game intervening-if natively only
 * when the threshold parses; an unparseable one → Arbiter). Evaluated against an empty board: a parseable
 * threshold returns a boolean (true/false), an unparseable one returns null.
 */
export function winConditionParseable(condition) {
  const probe = { players: { __probe__: { life: 0, battlefield: [], graveyard: [] } } };
  return evaluateWinThreshold(probe, condition, "__probe__") !== null;
}

/**
 * WIN-GAME resolver — stamp the outcome flag on the affected player; the SBA (recordOutcomeIfChanged)
 * reads it and ends the game. `atom.outcome === "lose"` marks a player as having lost (Door to Nothingness
 * "target player loses the game"); otherwise the controller wins (the upkeep-win family + bare "you win
 * the game").
 *
 * CR 603.4 re-check: if the atom carries a `condition` (an upkeep-win intervening-if), re-evaluate it HERE
 * at resolution. A condition no longer met (Treasure sac'd in response) → the win does NOT happen; an
 * UNPARSED condition (null) → also does NOT happen (never fail-open a win). A win-game atom with no
 * condition (a bare spell / a non-conditional trigger) always applies.
 */
export function applyWinGame(state, atom, ctx) {
  // CR 603.4 — re-check an intervening-if at resolution. Strict: false OR null both mean "do not win".
  if (atom.condition != null) {
    const ok = evaluateWinThreshold(state, atom.condition, ctx.controller);
    if (ok !== true) {
      return logEvent(state, { kind: "spell-effect", effect: "win-game", controller: ctx.controller, applied: false, reason: ok === null ? "condition-unresolved" : "condition-not-met" });
    }
  }

  if (atom.outcome === "lose") {
    // "Target player loses the game" — flag every chosen player (Door to Nothingness targets one).
    let next = state;
    let any = false;
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players?.[t.id]) {
        next = { ...next, players: { ...next.players, [t.id]: { ...next.players[t.id], lostGame: true } } };
        any = true;
      }
    }
    return logEvent(next, { kind: "spell-effect", effect: "lose-game", controller: ctx.controller, applied: any });
  }

  // "You win the game" — flag the controller as the winner.
  if (!state.players?.[ctx.controller]) {
    return logEvent(state, { kind: "spell-effect", effect: "win-game", controller: ctx.controller, applied: false, reason: "no-controller" });
  }
  const next = {
    ...state,
    players: { ...state.players, [ctx.controller]: { ...state.players[ctx.controller], wonGame: true } },
  };
  return logEvent(next, { kind: "spell-effect", effect: "win-game", controller: ctx.controller, applied: true });
}

/**
 * ===== PAY-OR-LOSE (the Pact cycle, CR 603.7 + 104.3a) ===== the delayed upkeep rider on Pact of Negation,
 * Slaughter Pact, Summoner's Pact and Pact of the Titan: *"At the beginning of your next upkeep, pay {cost}.
 * If you don't, you lose the game."*
 *
 * The rider is scheduled as a delayed trigger; THIS is what fires. Attempt the payment through the shared
 * payManaCost (which plans against the pool + untapped sources and commits, or reports failure); an
 * unpayable cost sets `lostGame` on the controller, the same flag the "target player loses the game"
 * branch above writes.
 *
 * ⭐ PAYING WHENEVER ABLE IS NOT A POLICY GUESS. CR makes this a choice, but the alternative is losing the
 * game outright — there is exactly one rational line, so an auto-pay is the correct play rather than a
 * stand-in for a decision the engine ducked. (A player who WANTS to lose is not a case worth modelling.)
 * The interesting half is the failure: a Pact you cannot pay kills you, which is the entire reason the
 * cards are costed at {0}, and the gates below assert that death.
 */
export function applyPayOrLose(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state; // eliminated mid-resolution → clean no-op (CR 800.4a)
  const { state: afterPay, paid } = payManaCost(state, controller, atom.manaCost || {});
  if (paid) {
    return logEvent(afterPay, { kind: "spell-effect", effect: "pay-or-lose", controller, paid: true });
  }
  const next = {
    ...state,
    players: { ...state.players, [controller]: { ...state.players[controller], lostGame: true } },
  };
  return logEvent(next, { kind: "spell-effect", effect: "pay-or-lose", controller, paid: false, lost: true });
}

export const winGameResolvers = {
  "win-game": applyWinGame,
  "pay-or-lose": applyPayOrLose, // PACT rider (CR 603.7) — pay at upkeep or lose the game
};

/**
 * Mana pips → the cost shape payManaCost wants. DELIBERATELY NARROW: plain generic + coloured/colourless
 * pips only. An {X}, a hybrid, a Phyrexian or a snow pip returns null, so the clause fails to parse and the
 * whole card stays LOW → Arbiter rather than being paid with a cost this reader guessed at.
 *
 * ⛔ Why not import legalChoices.parseManaCost: legalChoices imports atoms/shared.js, so an atoms module
 * importing it back would close a cycle. This reader is narrower than that one ON PURPOSE — it is not a
 * second general parser, it is a gate that admits only the shapes the Pact cycle actually prints.
 */
function pipsToCost(pips) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const tokens = String(pips || "").match(/\{[^}]+\}/g);
  if (!tokens || !tokens.length) return null;
  for (const t of tokens) {
    // ⚠️ UPPERCASED on the way in. The clause parser lowercases the whole line before matching, so the
    // pips arrive as "{u}" — an uppercase-only test silently returned null here and the entire Pact cycle
    // stayed on the Arbiter with a regex that matched perfectly. The colour keys on the cost object are
    // uppercase (MANA_COLORS), so the case has to be restored, not merely tolerated.
    const body = t.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(body)) { cost.generic += parseInt(body, 10); continue; }
    if (/^[WUBRGC]$/.test(body)) { cost[body] += 1; continue; }
    return null; // {X}, {2/U}, {U/P}, {S} … → unmodeled here, refuse the whole clause
  }
  return cost;
}

/**
 * "pay {cost}. if you don't, you lose the game" — the Pact rider, as it reaches the delayed-trigger drain.
 * Whole-clause anchored; the cost must be plain pips (see pipsToCost) or this returns null and the card
 * routes to the Arbiter. Emits the cost OBJECT so the resolver never re-parses text at resolution.
 */
export function payOrLoseClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim().replace(/\.$/, "");
  const m = t.match(/^pay ((?:\{[^}]+\})+)\. if you don't, you lose the game$/);
  if (!m) return null;
  const manaCost = pipsToCost(m[1]);
  return manaCost ? { op: "pay-or-lose", manaCost, targetType: null } : null;
}

/**
 * PURE clause parser (registered into parser.js's registerClauseParser seam at the bottom of parser.js,
 * NOT self-registered here — an atoms module must not import parser.js, TDZ hazard). Recognizes:
 *   "you win the game"             → { op: "win-game", who: "controller", targetType: null }
 *   "target player loses the game" → { op: "win-game", who: "target", outcome: "lose", targetType: "player" }
 *
 * Anchored (^…$) so any residue ("…if you control a land of each basic land type" — Coalition Victory's
 * inline condition) fails the match → null → the clause stays LOW → Arbiter (CREED: a win we can't model
 * exactly never counts native). The intervening-if shape ("At the beginning of your upkeep, if …, you win
 * the game") arrives here as the bare effect clause "you win the game" — the condition was already peeled
 * by splitTriggerSentence and is bound onto the atom in gameEngine.buildTriggerStack.
 *
 * `targetType: "player"` on the lose form routes it through the normal targeted-trigger / cast enumerator
 * (a player target), exactly like targeted lose-life.
 */
export function winGameClauseParser(clause /*, ctx */) {
  const t = String(clause || "").toLowerCase().trim().replace(/\.\s*$/, "");
  if (t === "you win the game") {
    return { op: "win-game", who: "controller", targetType: null };
  }
  if (t === "target player loses the game") {
    return { op: "win-game", who: "target", outcome: "lose", targetType: "player" };
  }
  return null;
}
