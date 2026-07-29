/**
 * effects/atoms/sacLand.js — SAC-LAND-RAMP (Toph TIER-2): "Sacrifice a land." as a RESOLUTION EFFECT (not a
 * cast cost), the lead clause of the sac-then-fetch ramp spells (Roiling Regrowth, Cycle of Renewal):
 *   "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield
 *    tapped, then shuffle."
 *
 * WHY A DEDICATED ATOM (not the edict path): the EDICT sacrifice atom (removal.js applySacrifice /
 * advanceSacrificeChain) is hard-scoped to CREATURES — it scans `isCreatureCard` for victims and fires dies
 * triggers. "Sacrifice a land" is the CONTROLLER giving up one of THEIR OWN lands of their choice (CR 701.16),
 * a different victim pool. This atom gathers the controller's LANDS and:
 *   • 0 lands  → a clean logged no-op (you can't sacrifice what you don't have; the fetch still resolves).
 *   • 1 land   → FORCED (no real choice): sacrifice it inline via the shared sacrificeCreatureEffect.
 *   • ≥2 lands → a REAL choice: pause via the EXISTING `sacrifice-choice` pending kind (resolveSacrificeChoice
 *                settles it) with the LAND candidates and NO queue — so the single settle resumes the program
 *                straight into the tutor atom, never re-entering advanceSacrificeChain's creature scan.
 *
 * sacrificeCreatureEffect is permanent-safe despite its name: it computes power only for creatures (null for a
 * land), moves the permanent battlefield→graveyard (type-agnostic), fires dies triggers only for creatures
 * (skipped for a land — correct), and fires the "whenever you sacrifice a permanent" sacrifice trigger (which
 * SHOULD fire for a land too, CR 603.x). So the land genuinely leaves the battlefield + feeds sac-watchers.
 *
 * CREED: the spell is native iff its WHOLE body parses HIGH. The clause parser matches ONLY the bare
 * "sacrifice a land" self-sac (the controller's land); a filtered/numbered/each-player land-sac ("sacrifice
 * two lands", "each player sacrifices a land", "sacrifice a land you control unless …") fails the exact anchor
 * → null → low → Arbiter. The FETCH half is the already-proven RAMP-MULTI tutor (atoms/library.js); a
 * conditional rider on the fetch (Entish Restoration's "If you control a creature with power 4 or greater,
 * instead …") leaves that sentence as an unmodeled clause → the program stays LOW → Arbiter (a SAFE FN).
 *
 * Pure (returns a new state). Hidden-info safe — the candidate lands are the controller's own, public board.
 */
import { logEvent, findPermanent } from "../../gameState.js";
import { setPendingSacrificeChoice } from "../../pendingChoice.js";
import { sacrificeCreatureEffect } from "./removal.js";
import { isLandCard } from "./shared.js";

/**
 * SAC-LAND — the controller sacrifices one of their own lands of their choice (CR 701.16). Single-victim only
 * (the bare "Sacrifice a land." form). Reuses the `sacrifice-choice` pending kind + resolveSacrificeChoice for
 * the ≥2-lands pick; the runner attaches `resume` so the program continues into the tutor after the pick.
 */
export function applySacrificeLand(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state;
  const lands = (player.battlefield || [])
    .filter((p) => isLandCard(p.card))
    .map((p) => ({ id: p.id, name: p.card?.name }));
  if (lands.length === 0) {
    // No land to sacrifice — a clean no-op (the following fetch still resolves; you sacrificed nothing).
    return logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller, sacrificed: null, what: "land" });
  }
  // COUNT (Planar Engineering — "Sacrifice TWO lands"). N sacrifices are N entries on the chain queue, which
  // advanceSacrificeChain already drives "one permanent apiece" — no new machinery, and the pause/resume into
  // the following tutor is the same path the single form has always used.
  const n = Math.max(1, atom.count || 1);
  if (lands.length <= n) {
    // No more lands than must go → every one is sacrificed and there is nothing to choose. Covers the sole-land
    // case the single form handled before, byte-identically.
    let next = state;
    for (const l of lands) if (findPermanent(next, l.id)) next = sacrificeCreatureEffect(next, controller, l.id);
    return next;
  }
  // A real choice. `queue` carries the REMAINING sacrifices (n-1 of them); null for the single form keeps its
  // "one settle, then resume into the tutor" behaviour exactly as it was.
  const queue = Array.from({ length: n - 1 }, () => ({ playerId: controller, what: "land" }));
  return setPendingSacrificeChoice(state, { controller, candidates: lands, queue: queue.length ? queue : null, sourceName: ctx.cardName });
}

/**
 * SAC-LAND clause parser — the bare controller self-sac of ONE land, as a resolution EFFECT (CR 701.16).
 * ALL-OR-NOTHING exact anchor: only "sacrifice a land" (optionally "you control"). A count ("sacrifice two
 * lands", "sacrifice any number of lands" — Scapeshift), a filtered land ("a basic land", "a tapped land"),
 * an each-player form, or a conjoined unless-clause fails the `^…$` anchor → null → low → Arbiter (a wrong
 * sacrifice is a forbidden FP). Pure; registered via registerClauseParser in parser.js.
 */
export function sacrificeLandClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim();
  // A FIXED count is admitted (Planar Engineering "Sacrifice two lands"); the chain drives N picks. "ANY
  // NUMBER of lands" (Scapeshift) is still refused — its count is player-chosen AND feeds a linked "up to
  // that many" fetch, so crediting it would need a threaded count the tutor cannot yet read.
  const m = t.match(/^sacrifice (a|one|two|three|four) lands?(?: you control)?$/);
  if (m) return { op: "sacrifice-land", count: { a: 1, one: 1, two: 2, three: 3, four: 4 }[m[1]], targetType: null };
  return null;
}

export const sacLandResolvers = {
  "sacrifice-land": applySacrificeLand,
};
