/**
 * effects/runProgram.js — the `effect-program` resolver (Phase-2 P2.2 keystone).
 *
 * `runEffectProgram(state, stackObject)` reads the frozen `{ program, controller,
 * targets }` off the stack object's payload params and executes the program's
 * atoms in printed order (CR 608.2c).
 *
 * ALL-OR-NOTHING confidence boundary (the fail-safe core): a `high`-confidence
 * program runs EVERY atom; a `low`-confidence program runs ZERO and hands the
 * card to the Arbiter seam (`markPendingArbiter`) — never a partial execution,
 * never a fabricated effect, never a silent no-op (CLAUDE.md §1.2/§8). A defensive
 * per-atom null check routes to the same seam if an atom somehow lacks a resolver.
 *
 * Pure + serialize-safe: imports the leaf seam marker + the atom table + the
 * confidence gate. Does NOT import resolvers.js (resolvers imports THIS for the
 * `effect-program` key), so the edge never reverses into a cycle.
 */

import { markPendingArbiter } from "../pendingArbiter.js";
import { resolveAtom } from "./effectAtoms.js";
import { programConfidence } from "./parser.js";

export function runEffectProgram(state, stackObject) {
  const params = stackObject?.payload?.params || {};
  const { program, controller, targets = [] } = params;

  // Low confidence (or absent program) → ZERO atoms, route to the Arbiter seam.
  if (programConfidence(program) === "low") {
    return markPendingArbiter(state, stackObject, "effect-program (low confidence — unmodeled effect)");
  }

  let next = state;
  const ctx = { controller, targets };
  for (const atom of program.atoms) {
    const after = resolveAtom(next, atom, ctx);
    if (after == null) {
      // Belt-and-braces: an atom with no resolver. programConfidence should have
      // already forced this program to `low`, but if it didn't, never fabricate —
      // route to the Arbiter seam.
      return markPendingArbiter(next, stackObject, `effect-program (no resolver for atom "${atom?.op}")`);
    }
    next = after;
  }
  return next;
}
