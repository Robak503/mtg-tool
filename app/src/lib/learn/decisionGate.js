/**
 * Phase 6 — Learn-to-Play: decisionGate.js
 *
 * Bridge between the engine (which knows what's legal) and the player
 * (who has to make choices). Difficulty determines whether we ASK or
 * AUTO-DECIDE; the gate normalizes both into a single return shape.
 *
 * Beginner — ASK every legal action. Full narration via narrator.js.
 * Intermediate — AUTO-DECIDE obvious actions; ASK key decisions. (PR7
 *   will define "key" properly; v1 stub treats anything castable as a
 *   prompt and only auto-passes when there are no plays.)
 * Expert — AUTO-DECIDE always; surface only mistakes after the fact.
 *   (PR8.)
 *
 * Return shape from makeDecision():
 *   {
 *     kind: "auto-decided" | "ask",
 *     action?: ChosenAction,          // when auto-decided
 *     prompt?: string,                // narration block, when asking
 *     options?: LegalAction[],        // when asking
 *     metadata?: { reasoning, difficulty, defaultIndex }
 *   }
 *
 * The UI (LearnView, PR6) reads this shape and either renders a
 * DecisionModal (kind: "ask") or pipes the chosen action straight
 * back into the engine (kind: "auto-decided").
 */

import { filterActions } from "./legalChoices.js";
import { stableActionKey } from "./actionKey.js";
import { pickAction } from "./opponentAI.js";
import { narrateDecision, narrateAttackTrap } from "./narrator.js";
import { detectAttackTraps } from "./trapDetector.js";

const VALID_DIFFICULTIES = new Set(["beginner", "intermediate", "expert"]);

function normaliseDifficulty(value) {
  return VALID_DIFFICULTIES.has(value) ? value : "beginner";
}

/**
 * Trivial-pass detector: if the only legal action is pass-priority,
 * never ask the user — just pass. Every difficulty level skips this
 * one because asking "do you want to pass?" when there's literally
 * nothing else is decision-fatigue.
 */
function isOnlyPassPriority(actions) {
  return actions.length === 1 && actions[0].kind === "pass-priority";
}

/**
 * Find the action that would auto-be-picked at this difficulty. For
 * Intermediate, the "best" pick is whatever opponentAI would pick
 * for the same archetype — reusing the same scoring keeps user
 * suggestions and AI behavior consistent. Expert always picks
 * automatically.
 */
function autoPick(state, playerId, actions, { archetype = null } = {}) {
  return pickAction(state, playerId, actions, { archetype });
}

/**
 * Generate a default-action index for the UI to highlight. Beginner
 * mode still asks every time, but pre-selects the same action the AI
 * would pick — so a tired user can hit Enter to pass through obvious
 * choices.
 */
function findDefaultIndex(actions, suggested) {
  if (!suggested) return 0;
  const idx = actions.findIndex(a =>
    a.kind === suggested.kind &&
    a.cardId === suggested.cardId &&
    a.permanentId === suggested.permanentId &&
    a.attackerId === suggested.attackerId
  );
  return idx === -1 ? 0 : idx;
}

/**
 * Build the decision for the given player at the given moment.
 *
 * Arguments:
 *   state         — current GameState
 *   playerId      — "user" | "ai" | "ai1" | "ai2" | "ai3" — whose turn?
 *   actions       — legal actions array (from legalChoices.js)
 *   options       — { difficulty, archetype, cardLookup }
 *
 * For AI players, the gate always auto-picks regardless of difficulty
 * (difficulty governs what the USER sees, not what the AI does).
 *
 * For user players:
 *   - Beginner: ASK every time with full narration
 *   - Intermediate: AUTO-PASS when only pass-priority is legal;
 *                   AUTO-PICK lands; ASK casts/combat decisions
 *   - Expert: AUTO-PICK via opponentAI policy (the user trusts the
 *             engine to play their deck for them)
 */
export function makeDecision(state, playerId, actions, options = {}) {
  const difficulty = normaliseDifficulty(options.difficulty);
  const { archetype = null, cardLookup = () => null } = options;

  // Safety: empty list → engine has no work to do. Surface a sentinel
  // so callers don't pass null into the engine.
  if (!Array.isArray(actions) || actions.length === 0) {
    return {
      kind: "auto-decided",
      action: null,
      metadata: { reasoning: "no legal actions", difficulty },
    };
  }

  // AI side: always auto-decide regardless of difficulty. Any non-user
  // seat is AI-controlled — Standard "ai", Commander "ai1"/"ai2"/"ai3".
  // (difficulty governs what the USER sees, never how an AI plays.)
  if (playerId !== "user") {
    const picked = autoPick(state, playerId, actions, { archetype });
    return {
      kind: "auto-decided",
      action: picked,
      metadata: { reasoning: "ai-player", difficulty },
    };
  }

  // Pass-only situations: never ask.
  if (isOnlyPassPriority(actions)) {
    return {
      kind: "auto-decided",
      action: actions[0],
      metadata: { reasoning: "only-pass-available", difficulty },
    };
  }

  // Difficulty branches.
  if (difficulty === "expert") {
    const picked = autoPick(state, playerId, actions, { archetype });
    return {
      kind: "auto-decided",
      action: picked,
      metadata: { reasoning: "expert-auto-pilot", difficulty },
    };
  }

  if (difficulty === "intermediate") {
    // Intermediate: auto-pick lands (never a wrong choice on the
    // happy path) and auto-pass when the only options are passes +
    // unaffordable spells. ASK on castable spells (suggestion + confirm).
    // Combat: auto-attack unless a trap detector fires — then ASK with
    // the trap warning prefixed so the user understands why we paused.
    const lands = filterActions(actions, "play-land");
    if (lands.length > 0) {
      // Auto-pick the same land opponentAI would (alphabetical for
      // now; PR8 can revisit when color-need logic lands).
      const picked = autoPick(state, playerId, lands, { archetype });
      return {
        kind: "auto-decided",
        action: picked,
        metadata: { reasoning: "intermediate-auto-land", difficulty },
      };
    }

    const casts = filterActions(actions, "cast-spell");
    const attacks = filterActions(actions, "declare-attacker");
    const blocks = filterActions(actions, "declare-blocker");

    // Combat: auto-attack when no trap. Each declare-attacker action
    // gets committed one at a time; the engine re-prompts for the
    // next attacker after each pick, so this branch returns ONE
    // attacker per call and lets the loop drain naturally. When a
    // trap fires, fall through to ASK so the user sees the warning.
    if (attacks.length > 0) {
      const traps = detectAttackTraps(state, playerId, attacks);
      if (traps.length === 0) {
        return {
          kind: "auto-decided",
          action: attacks[0],
          metadata: { reasoning: "intermediate-auto-attack", difficulty },
        };
      }
      // Trap detected — surface as an ASK with the trap prefix on the prompt.
      const suggested = autoPick(state, playerId, actions, { archetype });
      const baseNarration = narrateDecision(state, actions, { difficulty, cardLookup });
      const trapPrefix = narrateAttackTrap(traps);
      const prompt = trapPrefix
        ? `${trapPrefix}\n\n${baseNarration}`
        : baseNarration;
      return {
        kind: "ask",
        prompt,
        options: actions,
        metadata: {
          reasoning: "intermediate-attack-trap",
          difficulty,
          defaultIndex: findDefaultIndex(actions, suggested),
          suggestion: suggested,
          traps,
        },
      };
    }

    if (casts.length === 0 && attacks.length === 0 && blocks.length === 0) {
      // No interesting options — auto-pass.
      const passAction = actions.find(a => a.kind === "pass-priority");
      if (passAction) {
        return {
          kind: "auto-decided",
          action: passAction,
          metadata: { reasoning: "intermediate-auto-pass", difficulty },
        };
      }
    }
    // Otherwise fall through to ASK below (casts, blocks).
  }

  // Beginner (default), or Intermediate with interesting choices.
  const suggested = autoPick(state, playerId, actions, { archetype });
  const prompt = narrateDecision(state, actions, { difficulty, cardLookup });
  return {
    kind: "ask",
    prompt,
    options: actions,
    metadata: {
      reasoning: difficulty === "beginner" ? "beginner-asks-everything" : "intermediate-key-decision",
      difficulty,
      defaultIndex: findDefaultIndex(actions, suggested),
      suggestion: suggested,
    },
  };
}

/**
 * Convenience: validate that a user's chosen action is one of the
 * legal options. Returns the matching action (so callers can rely
 * on object identity downstream) or null if the choice is invalid.
 *
 * CANONICAL pass first: the UI round-trips the FULL action object from
 * decision.options, so an exact structural match (key-order- and
 * undefined-insensitive, via stableActionKey) identifies precisely the action
 * the user picked. The old field-subset match collapsed options that differ
 * only in a field it didn't compare (defenderId, xValue, kicked, chosenMode,
 * sacCountIds, fromZone, targets beyond the first, …) and returned the FIRST —
 * dispatching an action the user never chose (e.g. attacking ai1 when they
 * picked ai2).
 *
 * LEGACY fallback second (compat: a partial choice carrying only the
 * distinguishing fields, e.g. { kind, cardId }): kept, but it must now be
 * UNAMBIGUOUS — if the partial fields fit two or more legal actions we return
 * null (invalid choice, surfaced to the caller) rather than guessing.
 */
export function resolveChoice(actions, choice) {
  if (!choice) return null;
  const choiceKey = stableActionKey(choice);
  const exact = actions.find(a => stableActionKey(a) === choiceKey);
  if (exact) return exact;
  const targetId = (x) => x?.targets?.[0]?.id ?? null;
  const legacy = actions.filter(a =>
    a.kind === choice.kind &&
    (a.cardId === choice.cardId || (a.cardId == null && choice.cardId == null)) &&
    (a.permanentId === choice.permanentId || (a.permanentId == null && choice.permanentId == null)) &&
    (a.attackerId === choice.attackerId || (a.attackerId == null && choice.attackerId == null)) &&
    (a.color === choice.color || (a.color == null && choice.color == null)) &&
    // A permanent can have more than one activated ability — disambiguate by index so
    // two abilities sharing kind+permanentId+target don't collapse to the same choice.
    (a.abilityIndex === choice.abilityIndex || (a.abilityIndex == null && choice.abilityIndex == null)) &&
    targetId(a) === targetId(choice)
  );
  return legacy.length === 1 ? legacy[0] : null;
}
