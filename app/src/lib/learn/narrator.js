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

// ─── Pod-aware subject helpers ────────────────────────────────────────────────

/**
 * Default opponent seat labels, mirroring LearnView's SEAT_LABELS. A caller
 * (decisionGate → narrateDecision) can override via options.seatLabel for a
 * richer label (e.g. a commander name); this is only the fallback so v1
 * ships with zero route changes.
 */
const DEFAULT_SEAT_LABELS = { user: "You", ai: "Opponent", ai1: "Opponent 1", ai2: "Opponent 2", ai3: "Opponent 3" };

function defaultSeatLabel(id) {
  return DEFAULT_SEAT_LABELS[id] || id;
}

/**
 * Build a grammatically-correct subject descriptor for `playerId` so
 * templates never have to interpolate "You" into a third-person slot.
 * Second person (the user): name="you", poss="your", is="are", verb(v)=v.
 * Third person (any AI seat): name=<seat label>, poss="<label>'s" (or
 * "their" mid-sentence), is="is", verb(v)=v+"s" (drops/adds for the couple
 * of irregular verbs the step templates use).
 */
function subjectFor(state, playerId, { seatLabel = defaultSeatLabel } = {}) {
  if (playerId === "user") {
    return {
      id: playerId,
      name: "you",
      Name: "You",
      poss: "your",
      Poss: "Your",
      is: "are",
      verb: (base) => base,
    };
  }
  const label = seatLabel(playerId) || "Opponent";
  return {
    id: playerId,
    name: label,
    Name: label,
    poss: `${label}'s`,
    Poss: `${label}'s`,
    is: "is",
    verb: (base) => conjugateThirdPerson(base),
  };
}

function conjugateThirdPerson(base) {
  if (base === "have") return "has";
  if (/(s|sh|ch|x|z)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

function cap(text) {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Is this a multiplayer pod (3+ seats) rather than 1v1? */
function isPod(state) {
  const order = state.turnOrder || Object.keys(state.players || {});
  return order.length > 2;
}

// ─── Phase / step narration ──────────────────────────────────────────────────

const STEP_TEMPLATES = {
  untap: ({ subj, turn }) =>
    `Turn ${turn}. ${cap(subj.poss)} untap step: all of ${subj.poss} tapped permanents untap, ` +
    `and creatures that have been under ${subj.poss} control since the start of their turn ` +
    `lose summoning sickness. No player gets priority during untap (rule 117.3a).`,

  upkeep: ({ subj }) =>
    `${cap(subj.poss)} upkeep. Any "at the beginning of your upkeep" triggers go on the stack now. ` +
    `Once they're on the stack, players get priority — ${subj.name} first.`,

  draw: ({ subj, isFirstTurnSkip }) =>
    isFirstTurnSkip
      ? `${cap(subj.poss)} draw step (skipped — in a two-player game, the player who goes first doesn't draw on turn 1, rule 103.8a).`
      : `${cap(subj.poss)} draw step. ${cap(subj.name)} ${subj.verb("draw")} one card, then each player gets priority.`,

  main: ({ subj, phase, pod }) =>
    `${cap(subj.poss)} ${phase === "precombat-main" ? "pre-combat" : "post-combat"} main phase. ` +
    `${cap(subj.name)} can play lands (one per turn), cast sorcery-speed spells, ` +
    `and activate abilities. ${pod ? "Any opponent" : "Both players"} can respond at instant speed.`,

  "beginning-of-combat": ({ subj, pod }) =>
    `Beginning of ${subj.poss} combat phase. ${cap(subj.name)} ${subj.verb("choose")} ${pod ? "an opponent" : "the opponent"} to attack. ` +
    `Triggers like "at the beginning of combat" go on the stack now.`,

  "declare-attackers": ({ subj }) =>
    `${cap(subj.poss)} declare-attackers step. ${cap(subj.name)} ${subj.verb("choose")} which untapped, non-sick creatures attack. ` +
    `Attacking creatures become tapped (unless they have vigilance, rule 702.20).`,

  "declare-blockers": ({ subj, pod }) =>
    `Declare-blockers step. ${pod ? "Each defending player" : cap(subj.name)} ${pod ? "chooses" : subj.verb("choose")} which of their untapped creatures block which attackers. ` +
    `Each attacker can be blocked by any number of blockers; each blocker can only block one attacker (rule 509.1).`,

  "first-strike-damage": () =>
    `First-strike damage step. Creatures with first strike or double strike deal damage now. ` +
    `Creatures dealt lethal damage die before regular damage is dealt.`,

  "combat-damage": () =>
    `Combat-damage step. All other attacking and blocking creatures deal damage simultaneously. ` +
    `Damage assignment follows the order chosen during the declare-blockers step.`,

  "end-of-combat": ({ subj }) =>
    `End of ${subj.poss} combat phase. "Until end of combat" effects end now.`,

  end: ({ subj }) =>
    `${cap(subj.poss)} end step. "At the beginning of the end step" triggers go on the stack.`,

  cleanup: ({ subj }) =>
    `${cap(subj.poss)} cleanup step. ${cap(subj.name)} ${subj.verb("discard")} down to their maximum hand size (7 by default). ` +
    `All damage on permanents is removed. "Until end of turn" effects end. ` +
    `No priority is granted unless something triggers (rule 514.3).`,
};

/**
 * Generate a narration string for the current (phase, step). Returns
 * empty string when the step has no template (defensive — shouldn't
 * happen in practice).
 *
 * options.seatLabel(id) → string, optional override for AI-seat display
 * names (default: "Opponent"/"Opponent N"). Always pod-aware — a 3+ seat
 * game never says "both players"/"The opponent".
 */
export function narrateStep(state, { difficulty = "beginner", seatLabel } = {}) {
  if (difficulty === "expert") return "";

  const template = STEP_TEMPLATES[state.step];
  if (!template) return "";

  const subj = subjectFor(state, state.activePlayer, { seatLabel });
  // Mirrors the engine draw-skip gate (gameEngine runStepActions): CR 103.8a is TWO-PLAYER only;
  // in a multiplayer pod no seat skips (CR 103.8c) — the narration must not claim a skip the
  // engine no longer performs.
  const isFirstTurnSkip =
    state.turn === 1 &&
    state.activePlayer === state.startingPlayer &&
    (state.turnOrder?.length || 0) === 2;

  const full = template({
    subj,
    turn: state.turn,
    phase: state.phase,
    isFirstTurnSkip,
    pod: isPod(state),
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
export function narrateAction(action, state, { card = null, difficulty = "beginner", seatLabel = defaultSeatLabel } = {}) {
  switch (action.kind) {
    case "pass-priority":
      return difficulty === "beginner"
        ? "Pass priority. If everyone passes with the stack empty, the step ends."
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
          ? ` targeting ${tgt.id === "user" ? "you" : seatLabel(tgt.id)}`
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
      // N2: name the defending PLAYER too — in a pod, "Attack with [[X]]." repeated per
      // opponent is a blind choice. defenderName falls back to a seat label when the
      // action doesn't carry a friendlier one (e.g. a commander name) from legalChoices.
      const defenderName = action.defenderName || (action.defenderId ? seatLabel(action.defenderId) : null);
      if (difficulty === "beginner") {
        if (atWalker) {
          // The combat-redirection misconception: you attack a planeswalker DIRECTLY now (PW-4).
          return `Attack [[${atWalker}]] with [[${name}]]. You declare attacks against a planeswalker directly (the old "redirect" rule is gone) — combat damage to it removes that many loyalty counters (rule 120.3c), not life from its controller. The defending player can still block to protect it.`;
        }
        if (defenderName) {
          return `Attack ${defenderName} with [[${name}]]. It becomes tapped (unless it has vigilance) and deals damage equal to its power during the combat-damage step.`;
        }
        return `Attack with [[${name}]]. It becomes tapped (unless it has vigilance) and deals damage equal to its power during the combat-damage step.`;
      }
      if (atWalker) return `Attack [[${atWalker}]] with [[${name}]].`;
      if (defenderName) return `Attack ${defenderName} with [[${name}]].`;
      return `Attack with [[${name}]].`;
    }

    case "declare-blocker": {
      const name = action.name || "the creature";
      // N2: name the ATTACKER being blocked — without it, N identical attackers in a pod
      // render as byte-identical "Block the attacker with [[X]]." lines.
      const attackerName = action.attackerName || null;
      if (difficulty === "beginner") {
        if (attackerName) {
          return `Block [[${attackerName}]] with [[${name}]]. Both creatures deal damage to each other simultaneously during the combat-damage step.`;
        }
        return `Block the attacker with [[${name}]]. Both creatures deal damage to each other simultaneously during the combat-damage step.`;
      }
      return attackerName ? `Block [[${attackerName}]] with [[${name}]].` : `Block with [[${name}]].`;
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
export function narrateDecision(state, actions, { difficulty = "beginner", cardLookup = () => null, seatLabel = defaultSeatLabel } = {}) {
  if (difficulty === "expert") return "";

  const stepLine = narrateStep(state, { difficulty, seatLabel });
  const header = difficulty === "beginner"
    ? `${stepLine}\n\nYour legal actions right now:`
    : stepLine;

  if (difficulty === "intermediate") return header;

  const lines = actions.map((action, i) => {
    const card = action.cardId ? cardLookup(action.cardId) : null;
    const description = narrateAction(action, state, { card, difficulty, seatLabel });
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
