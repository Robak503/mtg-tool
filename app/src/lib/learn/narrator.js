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

/**
 * Default seat labels: the shared Academy wording the board shows. A caller
 * (decisionGate → narrateDecision) can override via options.seatLabel for a
 * richer label (e.g. a commander name); this is only the fallback so v1
 * ships with zero route changes.
 */
import { seatLabel as defaultSeatLabel } from "./seatLabels.js";
import { abilityWords, activationCostText, castVariantClauses, discardAbilityCostText, manaCostText } from "./actionLabel.js";

// ─── Pod-aware subject helpers ────────────────────────────────────────────────

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

// Card names are written [[like this]] (the voice rule above); `fallback` stands in, unbracketed, when the action names none.
const cardRef = (name, fallback = "it") => (name ? `[[${name}]]` : fallback);

// "A", "A and B", "A, B and C".
function joinAnd(words) {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// Does a permanent of this name sit on the battlefield under a controller other than `controller`?
function nameOnAnotherSide(state, name, controller) {
  for (const [pid, p] of Object.entries(state?.players || {})) {
    if ((p.battlefield || []).some((x) => x?.card?.name === name && (x.controller ?? pid) !== controller)) return true;
  }
  return false;
}

/**
 * " targeting <who>" for every target an action carries: a player by seat ("you", "Opponent 1"), anything else by its card
 * name. A name another target, or a permanent on another side of the board, also bears is told apart by its controller
 * ("your [[Prodigal Pyromancer]]", "Opponent's [[Prodigal Pyromancer]]"). Falls back to the engine's targetName; "" when the
 * action has no target.
 */
function targetingText(action, state, seatLabel) {
  const targets = (action.targets || []).filter(Boolean);
  const nameUses = new Map();
  for (const t of targets) if (t.type !== "player" && t.name) nameUses.set(t.name, (nameUses.get(t.name) || 0) + 1);
  const words = targets.map((t) => {
    if (t.type === "player") return t.id === "user" ? "you" : seatLabel(t.id);
    if (!t.name) return null;
    const shared = t.controller && (nameUses.get(t.name) > 1 || nameOnAnotherSide(state, t.name, t.controller));
    const owner = shared ? `${t.controller === "user" ? "your" : `${seatLabel(t.controller)}'s`} ` : "";
    return `${owner}${cardRef(t.name)}`;
  });
  if (words.length && words.every(Boolean)) return ` targeting ${joinAnd(words)}`;
  return action.targetName ? ` targeting ${cardRef(action.targetName)}` : "";
}

// " for <pips>" — a parsed mana cost as pips (a free one is {0}; X dropped once folded into generic); "" when there is none.
function forManaCost(cost, opts) {
  const pips = manaCostText(cost, opts);
  return pips ? ` for ${pips}` : "";
}

// The name of the permanent or card `id` wherever it is (battlefield, hand, graveyard, exile, command zone); null if absent.
function objectName(state, id) {
  if (!id) return null;
  for (const p of Object.values(state?.players || {})) {
    const perm = (p.battlefield || []).find((x) => x?.id === id);
    if (perm) return perm.card?.name || null;
    for (const zone of ["hand", "graveyard", "exile", "command"]) {
      const c = (p[zone] || []).find((x) => x?.id === id);
      if (c) return c.name || null;
    }
  }
  return null;
}

/**
 * An activated ability's line: "<head> (<cost>) targeting <who>: <its text>." — the action's own text (its closing full stop
 * dropped, so the line has one), cost and targets; empty parts drop out.
 */
function abilityLine(head, action, { cost = "", state, seatLabel }) {
  const text = abilityWords(action.abilityText);
  return `${head}${cost ? ` (${cost})` : ""}${targetingText(action, state, seatLabel)}${text ? `: ${text}` : ""}.`;
}

/**
 * Generate a Jace-voice description of a single legal action. Used in
 * the decision menu so the user sees not just "Cast Lightning Bolt"
 * but "Cast [[Lightning Bolt]] for {R} targeting [[Hill Giant]]." Every kind the dispatcher handles
 * has its own line, built from the action's fields with the action labeller's cost and text helpers
 * (actionLabel.js) — narratorKinds.test.js holds every ACTION_KINDS kind to one; an unknown kind
 * falls back to "Take action".
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
      const ref = cardRef(action.name || card?.name, "the spell");
      // A free cast pays nothing, and an alternative cost names its own payment among the clauses (the engine stores {0} as
      // that cast's mana cost) — neither reads "for {0}".
      const costPart = action.freeCast
        ? " without paying its mana cost"
        : (action.altName || action.altCost) ? "" : forManaCost(action.cost, { xPaid: action.xValue != null });
      const clauses = castVariantClauses(action);
      const clauseText = clauses.length ? ` (${clauses.join("; ")})` : "";
      const oracle = card?.oracle || card?.oracle_text || "";
      const oracleSnippet = oracle ? ` (${truncate(oracle, 80)})` : "";
      const targeting = targetingText(action, state, seatLabel);
      // Front-face planeswalker? (a creature-front DFC casts as its creature side, so check face 0).
      const frontType = card?.card_faces?.[0]?.type_line || card?.type || card?.type_line || "";
      const pwNote = /Planeswalker/.test(frontType)
        ? ` It enters with its starting loyalty counters, and you can activate one of its loyalty abilities this turn (loyalty abilities ignore summoning sickness).`
        : "";
      if (difficulty === "beginner") {
        return `Cast ${ref}${costPart}${targeting}${clauseText}${oracleSnippet}. The spell goes on the stack; opponents can respond before it resolves.${pwNote}`;
      }
      return `Cast ${ref}${costPart}${targeting}${clauseText}.`;
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
      // Every target, a player included — Liliana's −2 at an opponent and at you are two different lines.
      const targeting = targetingText(action, state, seatLabel);
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
      return `Activate [[${name}]]'s ${sign} ability${targeting}.`;
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

    case "activate-ability": {
      // N5: the common Commander action (mana rocks, pingers, utility lands, equip, etc.). The line names the ability's cost
      // (an Equipment's equip text carries its own), its targets and its text — the same parts as its button.
      const line = abilityLine(`Activate ${cardRef(action.name || card?.name, "the permanent")}`, action,
        { cost: action.isEquipAbility ? "" : activationCostText(action), state, seatLabel });
      if (difficulty === "beginner") {
        return `${line} The ability goes on the stack and opponents can respond before it resolves (mana abilities are the exception — they resolve immediately, no stack, rule 605.3a).`;
      }
      return line;
    }

    // These abilities' texts carry their own costs (Doubling Cube's "{3}, {T}:", a graveyard or hand ability's mana).
    case "double-mana-pool":
      return abilityLine(`Activate ${cardRef(action.name || card?.name, "the permanent")}`, action, { state, seatLabel });

    case "activate-gy-recursion":
      return abilityLine(`Activate ${cardRef(action.name || card?.name, "the card")} from your graveyard`, action,
        { cost: action.tapName ? `tap ${cardRef(action.tapName)}` : "", state, seatLabel });

    case "activate-gy-exile":
      return abilityLine(`Activate ${cardRef(action.name || card?.name, "the card")} from your graveyard`, action, { state, seatLabel });

    case "activate-hand-self-put":
      return abilityLine(`Activate ${cardRef(action.name || card?.name, "the card")} from your hand`, action, { state, seatLabel });

    case "discard-ability":
      return abilityLine(`Activate ${cardRef(action.name || card?.name, "the card")} from your hand`, action,
        { cost: discardAbilityCostText(action), state, seatLabel });

    case "crew-vehicle": {
      // CREW (CR 702.122a): the creatures the engine taps are named off the board; without the board, counted (as the button).
      const vehicle = cardRef(action.vehicleName || objectName(state, action.permanentId), "the Vehicle");
      const ids = Array.isArray(action.tapIds) ? action.tapIds : [];
      const names = ids.map((id) => objectName(state, id));
      const tapPart = !ids.length ? ""
        : names.every(Boolean) ? `, tap ${joinAnd(names.map((n) => cardRef(n)))}`
          : `, tap ${ids.length} creature${ids.length === 1 ? "" : "s"}`;
      return `Crew ${vehicle}${action.crew != null ? ` (crew ${action.crew}${tapPart})` : ""}.`;
    }

    case "cycle": {
      // CYCLING (CR 702.29a): an activated ability from hand — discard this card, draw a card. Its cost is mana, or life
      // (Street Wraith's "Pay 2 life"), never a bare "0".
      const ref = cardRef(action.name || card?.name, "the card");
      const costString = action.lifeCost != null ? ` for ${action.lifeCost} life` : forManaCost(action.cost);
      if (difficulty === "beginner") {
        return `Cycle ${ref}${costString}: discard it and draw a card. Cycling is an activated ability that uses the stack (rule 702.29a) — it can be responded to, though the draw itself can't be stopped once it resolves.`;
      }
      return `Cycle ${ref}${costString}.`;
    }

    case "suspend": {
      const n = action.suspendCounters;
      return `Suspend ${cardRef(action.name || card?.name, "the card")}${forManaCost(action.cost)}${n != null ? ` with ${n} time counter${n === 1 ? "" : "s"}` : ""}.`;
    }

    case "turn-face-up": {
      // MANIFEST (CR 701.40b): a special action (no stack) — pay the face-down card's mana cost and turn it face up.
      const ref = cardRef(action.name, "the card");
      const costString = forManaCost(action.cost);
      if (difficulty === "beginner") {
        return `Turn your face-down 2/2 face up${costString}: it becomes ${ref}. A manifested creature card can be turned face up any time you have priority by paying its mana cost — a special action that doesn't use the stack, and it isn't entering the battlefield, so its enters abilities don't trigger.`;
      }
      return `Turn ${ref} face up${costString}.`;
    }

    case "plot": {
      // PLOT (CR 702.170a-b): a special action (no stack) — exile this card (from hand, or the top of the library when an
      // effect lets you plot that) and pay its plot cost now; next turn you may cast it from exile without paying its mana cost.
      const ref = cardRef(action.name || card?.name, "the card");
      const fromTop = action.fromZone === "library";
      const costString = forManaCost(action.cost);
      if (difficulty === "beginner") {
        return `Plot ${ref}${fromTop ? " from the top of your library" : ""}${costString}: exile it ${fromTop ? "from the top of your library" : "from your hand"} now. Plotting is a special action — it doesn't use the stack and can't be responded to (rule 702.170b). Starting your next turn, you may cast it from exile without paying its mana cost.`;
      }
      return `Plot ${ref}${fromTop ? " from the top of your library" : ""}${costString}.`;
    }

    case "discover-to-hand": {
      // DISCOVER (CR 701.57a, a keyword ACTION, not an ability): the revealed card missed discover's
      // mana-value-or-less free-cast window — put it into your hand instead. A park whose decline leaves the card exiled
      // (The Key to the Vault) carries leaveExiled: it stays in exile.
      const ref = cardRef(action.name || card?.name);
      if (action.leaveExiled) return `Leave ${ref} in exile.`;
      if (difficulty === "beginner") {
        return `Put ${ref} into your hand instead of casting it. Discover lets you cast a revealed nonland card whose mana value is at most the discover number for free, or put it into your hand if you don't (or can't) cast it (rule 701.57a).`;
      }
      return `Put ${ref} into your hand.`;
    }

    case "free-cast-decline": {
      // FREE-CAST: an engine-generic "you may cast this without paying its mana cost" window (impulse/
      // foretell/discover-style effects) — no single CR number covers the family, each granting effect
      // cites its own. Decline lets the window close with no cast.
      if (difficulty === "beginner") {
        return `Decline the free cast. None of the offered cards get cast this way — the window closes and play continues.`;
      }
      return `Decline the free cast.`;
    }

    case "cast-from-among-done": {
      // CAST FROM AMONG (Etali, Primal Storm): stop casting from among the exiled cards; the rest stay in exile.
      if (difficulty === "beginner") {
        return `Stop casting. You may cast any number of the exiled spells for free; the ones you don't cast stay in exile.`;
      }
      return `Done casting from among the exiled cards.`;
    }

    case "cascade-decline": {
      // CASCADE (CR 702.85a): decline the free cast off the top of the exiled cards — it goes to the
      // bottom of your library instead. The action carries the card's id only; its name is read off the board.
      const name = action.name || card?.name || objectName(state, action.cardId);
      const head = name ? `Decline to cast ${cardRef(name)}` : "Decline the cascade cast";
      if (difficulty === "beginner") {
        return `${head}${name ? " for free" : ""}. Cascade lets you cast the first nonland card revealed with a lower mana value for free; if you don't (or can't), it goes to the bottom of your library instead (rule 702.85a).`;
      }
      return `${head}.`;
    }

    default:
      return action.name ? `Take action: ${action.name}` : "Take action";
  }
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
