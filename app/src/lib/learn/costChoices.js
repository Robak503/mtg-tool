/**
 * COST CHOICES ON ONE CAST (CR 601.2b, 601.2h) — the payment of an alternative cost is chosen as the spell is cast. INSIDE the
 * engine, legalChoices enumerates an alternative cost payable more than one way as ONE cast per target, carrying the HOUSE
 * payment (the one the AI's dominance filter pays) and every payment on `altCostChoices: [{ altCost, altName }]`, house included,
 * in the order offered — so the AI ranks a short list. Before, every payment was its own cast: Force of Will with N spells on the
 * stack and M blue cards in hand was N × M actions for every seat at every window (a late self-play game reached 4,827,648).
 *
 * OUTSIDE the engine nothing changed: every legal play is listed, exactly as before. A VARIANT is the cast with one choice's
 * `altCost` and `altName` in place and no `altCostChoices` — key for key, the action the old enumeration emitted for that
 * payment — and `expandAllCostChoices` turns the engine's list back into every legal play, in the old order (per cast, the
 * payments in the order offered). The play-API's legalActions / isLegalAction, a pilot's decide, the Academy's options and
 * applyChoice, decisionGate.resolveChoice, the trajectory row (legal.n, kinds, rank, forced — counted here without building the
 * list) and the decision log all see variants; `altCostChoices` never leaves the engine. Pure, client-safe.
 */

import { stableActionKey } from "./actionKey.js";

/** The cast as it is paid with one choice: the choice's altCost and altName in place, the choice list gone. */
export function costChoiceVariant(action, choice) {
  const { altCostChoices: _choices, ...rest } = action;
  return { ...rest, altCost: choice.altCost, altName: choice.altName };
}

/** The cast as offered, paid the house way: the action without its choice list (an action without one, itself). */
export function withoutCostChoices(action) {
  if (!action || !Array.isArray(action.altCostChoices)) return action;
  const { altCostChoices: _choices, ...rest } = action;
  return rest;
}

/** Every way to pay one offered cast — its variants when it carries choices, else the action itself. */
export function expandCostChoices(action) {
  const choices = action?.altCostChoices;
  if (!Array.isArray(choices) || choices.length === 0) return [action];
  return choices.map((c) => costChoiceVariant(action, c));
}

/** Every legal play in an engine list (the list itself when nothing carries choices). */
export function expandAllCostChoices(actions) {
  if (!actions.some((a) => Array.isArray(a?.altCostChoices))) return actions;
  return actions.flatMap(expandCostChoices);
}

/** How many legal plays one engine action stands for. */
const playsOf = (a) => (Array.isArray(a?.altCostChoices) && a.altCostChoices.length ? a.altCostChoices.length : 1);

/** The number of legal plays in an engine list, and their kind histogram — expandAllCostChoices(actions)'s, without building it. */
export function everyPlayTally(actions) {
  const kinds = {};
  let n = 0;
  for (const a of actions) {
    const k = playsOf(a);
    n += k;
    if (a?.kind) kinds[a.kind] = (kinds[a.kind] || 0) + k;
  }
  return { n, kinds };
}

/**
 * The index of `chosen` in expandAllCostChoices(actions), without building it — the row's `rank`. `chosen` is an action of the
 * list itself (a cast that carries choices stands for its house payment), or the house variant of one (matched by its altCost, the
 * same object the cast carries); -1 otherwise — the caller records 0 then, as it always did for a pick that is not an offered object
 * (a pending choice's normalized pick, for one: found-not-fixed, the row's rank there has always been 0).
 */
export function everyPlayIndexOf(actions, chosen) {
  let offset = 0;
  for (const a of actions) {
    const choices = Array.isArray(a?.altCostChoices) && a.altCostChoices.length ? a.altCostChoices : null;
    if (a === chosen) return offset + (choices ? Math.max(0, choices.findIndex((c) => c.altCost === a.altCost)) : 0);
    if (choices && chosen) {
      const byRef = choices.findIndex((c) => c.altCost === chosen.altCost);
      if (byRef >= 0 && chosen.cardId === a.cardId && stableActionKey(costChoiceVariant(a, choices[byRef])) === stableActionKey(chosen)) return offset + byRef;
    }
    offset += playsOf(a);
  }
  return -1;
}
