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
      ? `${activeName} draw step (skipped — the player who goes first doesn't draw on turn 1, rule 103.7a).`
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
  const isFirstTurnSkip = state.turn === 1 && state.activePlayer === state.startingPlayer;

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
      if (difficulty === "beginner") {
        return `Cast [[${cardName}]] for ${costString}${oracleSnippet}. The spell goes on the stack; opponents can respond before it resolves.`;
      }
      return `Cast [[${cardName}]] for ${costString}.`;
    }

    case "declare-attacker": {
      const name = action.name || "the creature";
      if (difficulty === "beginner") {
        return `Attack with [[${name}]]. It becomes tapped (unless it has vigilance) and deals damage equal to its power during the combat-damage step.`;
      }
      return `Attack with [[${name}]].`;
    }

    case "declare-blocker": {
      const name = action.name || "the creature";
      if (difficulty === "beginner") {
        return `Block the attacker with [[${name}]]. Both creatures deal damage to each other simultaneously during the combat-damage step.`;
      }
      return `Block with [[${name}]].`;
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
