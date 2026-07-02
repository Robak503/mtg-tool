/**
 * Phase 6 — Learn-to-Play: narrator.js
 *
 * Generates Jace-voice prose for each engine event: phase/step
 * transitions, legal-action prompts, decision recaps. Pure text-out;
 * the UI (PR6) consumes it.
 *
 * Difficulty determines verbosity, not content. Beginner gets full
 * walkthroughs. Intermediate gets one-liners. Expert gets nothing
 * (silent until something interesting happens) — that mode is handled
 * by decisionGate skipping narration entirely.
 *
 * Voice rules (CLAUDE.md §6, Jace section):
 *   - Plain English. Cite rules inline when relevant.
 *   - Friendly but never sycophantic. No "Great question!"
 *   - No closing flourishes ("Hope that helps!").
 *   - Card names in [[double brackets]].
 *
 * No fetches, no LLM calls. Pure functions over the GameState +
 * legal-action shape. The LLM-voice version is a polish pass (PR10);
 * v1 is template-driven and deterministic, which is good for tests.
 */

// ─── Phase / step narration ──────────────────────────────────────────────────

const STEP_TEMPLATES = {
  untap: ({ activeName, turn }) =>
    `Turn ${turn}. ${activeName} untap step: all of ${activeName}'s tapped permanents untap, ` +
    `and creatures that have been under ${activeName}'s control since the start of their turn ` +
    `lose summoning sickness. No player gets priority during untap (rule 117.3a).`,

  upkeep: ({ activeName }) =>
    `${activeName} upkeep. Any "at the beginning of your upkeep" triggers go on the stack now. ` +
    `Once they're on the stack, players get priority — ${activeName} first.`,

  draw: ({ activeName, isFirstTurnSkip }) =>
    isFirstTurnSkip
      ? `${activeName} draw step (skipped — in a two-player game, the player who goes first doesn't draw on turn 1, rule 103.8a).`
      : `${activeName} draw step. ${activeName} draws one card, then both players get priority.`,

  main: ({ activeName, phase }) =>
    `${activeName} ${phase === "precombat-main" ? "pre-combat" : "post-combat"} main phase. ` +
    `${activeName} can play lands (one per turn), cast sorcery-speed spells, ` +
    `and activate abilities. Both players can respond at instant speed.`,

  "beginning-of-combat": ({ activeName }) =>
    `Beginning of ${activeName}'s combat phase. ${activeName} chooses an opponent to attack ` +
    `(in 1v1, that's the only opponent). Triggers like "at the beginning of combat" go on the stack now.`,

  "declare-attackers": ({ activeName }) =>
    `${activeName}'s declare-attackers step. ${activeName} chooses which untapped, non-sick creatures attack. ` +
    `Attacking creatures become tapped (unless they have vigilance, rule 702.20).`,

  "declare-blockers": ({ defenderName }) =>
    `Declare-blockers step. ${defenderName} chooses which of their untapped creatures block which attackers. ` +
    `Each attacker can be blocked by any number of blockers; each blocker can only block one attacker (rule 509.1).`,

  "first-strike-damage": () =>
    `First-strike damage step. Creatures with first strike or double strike deal damage now. ` +
    `Creatures dealt lethal damage die before regular damage is dealt.`,

  "combat-damage": () =>
    `Combat-damage step. All other attacking and blocking creatures deal damage simultaneously. ` +
    `Damage assignment follows the order chosen during the declare-blockers step.`,

  "end-of-combat": ({ activeName }) =>
    `End of ${activeName}'s combat phase. "Until end of combat" effects end now.`,

  end: ({ activeName }) =>
    `${activeName} end step. "At the beginning of the end step" triggers go on the stack.`,

  cleanup: ({ activeName }) =>
    `${activeName} cleanup step. ${activeName} discards down to their maximum hand size (7 by default). ` +
    `All damage on permanents is removed. "Until end of turn" effects end. ` +
    `No priority is granted unless something triggers (rule 514.3).`,
};

/**
 * Generate a narration string for the current (phase, step). Returns
 * empty string when the step has no template (defensive — shouldn't
 * happen in practice).
 */
export function narrateStep(state, { difficulty = "beginner" } = {}) {
  if (difficulty === "expert") return "";

  const template = STEP_TEMPLATES[state.step];
  if (!template) return "";

  const activeName = state.activePlayer === "user" ? "You" : "The opponent";
  const defenderName = state.activePlayer === "user" ? "The opponent" : "You";
  // Mirrors the engine draw-skip gate (gameEngine runStepActions): CR 103.8a is TWO-PLAYER only;
  // in a multiplayer pod no seat skips (CR 103.8c) — the narration must not claim a skip the
  // engine no longer performs.
  const isFirstTurnSkip =
    state.turn === 1 &&
    state.activePlayer === state.startingPlayer &&
    (state.turnOrder?.length || 0) === 2;

  const full = template({
    activeName,
    defenderName,
    turn: state.turn,
    phase: state.phase,
    isFirstTurnSkip,
  });

  if (difficulty === "intermediate") {
    // Intermediate: one-line summary — first sentence only.
    return full.split(/(?<=\.)\s/)[0];
  }
  return full;
}

// ─── Action narration ────────────────────────────────────────────────────────

/**
 * Generate a Jace-voice description of a single legal action. Used in
 * the decision menu so the user sees not just "Cast Lightning Bolt"
 * but "Cast [[Lightning Bolt]] for {R}: deal 3 damage to any target."
 */
export function narrateAction(action, state, { card = null, difficulty = "beginner" } = {}) {
  switch (action.kind) {
    case "pass-priority":
      return difficulty === "beginner"
        ? "Pass priority. If both players pass with the stack empty, the step ends."
        : "Pass priority.";

    case "play-land": {
      const cardName = action.name || card?.name || "the land";
      if (difficulty === "beginner") {
        return `Play [[${cardName}]] from your hand. Lands don't go on the stack — they enter the battlefield immediately. You can play at most one land per turn.`;
      }
      return `Play [[${cardName}]].`;
    }

    case "cast-spell": {
      const cardName = action.name || card?.name || "the spell";
      const costString = formatCost(action.cost);
      const oracle = card?.oracle || card?.oracle_text || "";
      const oracleSnippet = oracle ? ` (${truncate(oracle, 80)})` : "";
      const tgt = action.targets?.[0];
      const targeting = tgt
        ? (tgt.type === "player"
          ? ` targeting ${tgt.id === "user" ? "you" : "the opponent"}`
          : ` targeting [[${tgt.name || "a creature"}]]`)
        : "";
      // Front-face planeswalker? (a creature-front DFC casts as its creature side, so check face 0).
      const frontType = card?.card_faces?.[0]?.type_line || card?.type || card?.type_line || "";
      const pwNote = /Planeswalker/.test(frontType)
        ? ` It enters with its starting loyalty counters, and you can activate one of its loyalty abilities this turn (loyalty abilities ignore summoning sickness).`
        : "";
      if (difficulty === "beginner") {
        return `Cast [[${cardName}]] for ${costString}${targeting}${oracleSnippet}. The spell goes on the stack; opponents can respond before it resolves.${pwNote}`;
      }
      return `Cast [[${cardName}]] for ${costString}${targeting}.`;
    }

    case "declare-attacker": {
      const name = action.name || "the creature";
      const atWalker = action.defenderPlaneswalkerId ? (action.targetName || "an enemy planeswalker") : null;
      if (difficulty === "beginner") {
        if (atWalker) {
          // The combat-redirection misconception: you attack a planeswalker DIRECTLY now (PW-4).
          return `Attack [[${atWalker}]] with [[${name}]]. You declare attacks against a planeswalker directly (the old "redirect" rule is gone) — combat damage to it removes that many loyalty counters (rule 120.3c), not life from its controller. The defending player can still block to protect it.`;
        }
        return `Attack with [[${name}]]. It becomes tapped (unless it has vigilance) and deals damage equal to its power during the combat-damage step.`;
      }
      return atWalker ? `Attack [[${atWalker}]] with [[${name}]].` : `Attack with [[${name}]].`;
    }

    case "declare-blocker": {
      const name = action.name || "the creature";
      if (difficulty === "beginner") {
        return `Block the attacker with [[${name}]]. Both creatures deal damage to each other simultaneously during the combat-damage step.`;
      }
      return `Block with [[${name}]].`;
    }

    case "tap-for-mana": {
      const name = action.name || "the source";
      const amt = action.amount && action.amount > 1 ? `${action.amount} ` : "";
      if (difficulty === "beginner") {
        return `Tap [[${name}]] for ${amt}{${action.color}}. Mana abilities don't use the stack — the mana goes straight into your pool to spend this step. (You don't have to tap first; casting taps for you.)`;
      }
      return `Tap [[${name}]] for ${amt}{${action.color}}.`;
    }

    case "activate-loyalty": {
      // The planeswalker teaching moment — pre-empts the common loyalty misconceptions (PW-4).
      const name = action.name || "the planeswalker";
      const delta = action.costDelta;
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      const targeting = action.targetName ? ` targeting [[${action.targetName}]]` : "";
      if (difficulty === "beginner") {
        const costLine = delta > 0
          ? `Pay the cost by adding ${delta} loyalty counter${delta === 1 ? "" : "s"}`
          : delta < 0
            ? `Pay the cost by removing ${Math.abs(delta)} loyalty counter${Math.abs(delta) === 1 ? "" : "s"} — you can't activate this if it would drop loyalty below 0 (rule 118.3)`
            : "This ability costs no loyalty change";
        const arbiterNote = action.routeToArbiter
          ? " This ability isn't fully modeled yet, so the Arbiter will rule its effect — the loyalty cost is still paid."
          : "";
        return `Activate [[${name}]]'s ${sign} loyalty ability${targeting}. ${costLine}. ` +
          `You may activate only ONE loyalty ability of a given planeswalker each turn, and only when you could cast a sorcery — your main phase, stack empty (rule 606.3). ` +
          `A planeswalker CAN use a loyalty ability the turn it enters; loyalty abilities ignore summoning sickness.${arbiterNote}`;
      }
      return `Activate [[${name}]]'s ${sign} ability${action.targetName ? ` (${action.targetName})` : ""}.`;
    }

    case "companion-to-hand": {
      // CMD-COMPANION (CR 702.139) — the companion starts OUTSIDE the game. This is the only way to
      // get it into play: pay {3} to put it into your hand, then cast it like any other card.
      const name = action.name || card?.name || "your companion";
      if (difficulty === "beginner") {
        return `Pay {3} to put [[${name}]] from outside the game into your hand (rule 702.139a) — a special action that doesn't use the stack. You may do this only once per game, and only at sorcery speed (your main phase, empty stack). It is NOT your commander — once it's in your hand you cast it for its normal cost with no commander tax.`;
      }
      return `Pay {3}: put [[${name}]] (companion) into your hand.`;
    }

    default:
      return action.name ? `Take action: ${action.name}` : "Take action";
  }
}

function formatCost(cost) {
  if (!cost) return "0";
  const parts = [];
  if (cost.generic) parts.push(`{${cost.generic}}`);
  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    for (let i = 0; i < (cost[color] || 0); i++) parts.push(`{${color}}`);
  }
  for (const opt of cost.hybrid || []) parts.push(`{${opt.join("/")}}`);
  for (const c of cost.phyrexian || []) parts.push(`{${c}/P}`);
  return parts.join("") || "0";
}

function truncate(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

// ─── Decision recap ──────────────────────────────────────────────────────────

/**
 * Compose a multi-line "here's what's happening, here are your
 * options" block for the decision UI. Beginner gets the full step
 * narration + per-action descriptions. Intermediate gets a terse
 * summary. Expert never sees this — decisionGate auto-decides.
 */
export function narrateDecision(state, actions, { difficulty = "beginner", cardLookup = () => null } = {}) {
  if (difficulty === "expert") return "";

  const stepLine = narrateStep(state, { difficulty });
  const header = difficulty === "beginner"
    ? `${stepLine}\n\nYour legal actions right now:`
    : stepLine;

  if (difficulty === "intermediate") return header;

  const lines = actions.map((action, i) => {
    const card = action.cardId ? cardLookup(action.cardId) : null;
    const description = narrateAction(action, state, { card, difficulty });
    return `${i + 1}. ${description}`;
  });

  return `${header}\n\n${lines.join("\n")}`;
}

// ─── Trap warnings (Intermediate mode, PR 7) ─────────────────────────────────

/**
 * Format a list of TrapWarnings (from trapDetector.js) as a Jace-voice
 * paragraph for prefixing the decision prompt. The intermediate gate
 * uses this to convert "you might want to think about this" into prose
 * the user actually reads.
 *
 * Returns "" when no traps — callers can safely concatenate.
 *
 * Format:
 *   "Heads up before you commit:
 *    • [danger trap message]
 *    • [warn trap message]
 *
 *    Press a button to choose, or pass priority to hold."
 */
export function narrateAttackTrap(traps) {
  if (!Array.isArray(traps) || traps.length === 0) return "";
  const lead = traps.some(t => t.severity === "danger")
    ? "Stop. This attack has a problem:"
    : "Heads up before you commit:";
  const bullets = traps.map(t => `• ${t.message}`).join("\n");
  return `${lead}\n${bullets}`;
}
