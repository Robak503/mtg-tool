/**
 * damageReplacements.js — the reusable DAMAGE-REPLACEMENT consult (CR 614, the
 * "deals double/triple/+N instead" replacement family — Wolverine, Furnace of
 * Rath, City on Fire, …).
 *
 * THE SEAM (and the original deferral's real reason). Damage and life PAYMENT
 * both flow through `loseLife`. A naive "double the damage" HOOK on that sink
 * would also double life *payments* — a false positive on already-correct game
 * actions (paying Phyrexian mana, "pay N life", Sylvan Library). So this is NOT
 * a hook on `loseLife`. It is a CONSULT placed at every point where a damage
 * AMOUNT is finalized, BEFORE it is handed to loseLife / markCombatDamage /
 * addPoison / adjustLoyalty. A life payment never constructs a damage-event, so
 * it is structurally immune.
 *
 * STORAGE MODEL (MUST-FIX 1 — synthesized-on-read). A "double all damage" static
 * ability of a permanent (CR 604.1) exists exactly while that permanent
 * is on the battlefield: no registration event, no duration, and it must VANISH
 * the instant the permanent leaves. So `isDamageReplacement` SCANS the
 * battlefield for permanents whose CARD carries the parsed doubler — the same
 * synthesized-on-read path anthems/lords use (layers.collectContinuousEffects),
 * never a stored `continuousEffect`, never an ETB/LTB removal hook. The doubler
 * appears and disappears with the permanent for free.
 *
 * THE OP IS A MULTIPLIER/ADDEND, NOT A BOOLEAN. `{op:"multiply",factor:2}` (not
 * "double=true") so triple, "+N", and a future `prevent-N` drop in without a
 * rewrite.
 *
 * 616.1 ORDERING. Multiple applicable replacements are applied in the affected
 * player/controller's chosen order (CR 616.1; deterministic default =
 * registration / battlefield order). Routed through the one 616-ordered helper
 * so partial-prevent can land later — never hard-coded "double always wins".
 *
 * 614.5 ONCE-PER-EVENT. A replacement applies at most once per event. The
 * applied-set is created FRESH per consult invocation (MUST-FIX 4), so a
 * double-striker — whose two combat-damage sub-steps are two separate consult
 * calls — correctly doubles in EACH step (never ×(step count) inside one call).
 *
 * Leaf module: imports only the layer/board readers (no gameState mutation, no
 * cycle). Pure — `applyDamageReplacements` returns `{ amount, prevented }` and
 * never mutates `state`.
 */

// ─── The doubler parser (verified oracle scope, never from memory) ──────────────
// Each entry: { op, scope }.
//   op    — { op:"multiply", factor:N } | (future) { op:"add", addend:N } | { op:"prevent" }
//   scope — { side:"source", controller?:"you" } reads the SOURCE permanent / its controller
//         | { side:"target" } reads the AFFECTED player / target (MUST-FIX 2)
// The doubler is read from the permanent's CARD oracle text so it is
// synthesized-on-read (vanishes when the card leaves). Wolverine's clause —
// "Unrivaled Lethality — Double all damage Wolverine would deal." — is
// SOURCE-SCOPED to that one permanent (the named self), so its filter matches
// only damage whose source IS this permanent.

/**
 * Parse the damage-replacement (doubling) clauses a single CARD carries, if any.
 * Returns [] for the overwhelming majority of cards (the gate stays byte-identical).
 * Scope is taken LITERALLY from the oracle (MUST-FIX 2):
 *   - "Double all damage <NAME> would deal"        → source-side, this-permanent-only
 *   - "If a source you control would deal damage…"  → source-side, controller-scoped
 *   - "If a source would deal damage to you/it…"    → target-side (affected player)
 */
export function parseDamageReplacements(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  if (!oracle) return [];
  const name = String(card?.name ?? "");
  const shortName = name.split(",")[0].trim(); // "Wolverine, Best There Is" → "Wolverine"
  const out = [];

  // SOURCE-SCOPED, this-permanent-only: "Double all damage <NAME/shortName/this creature> would deal."
  // The literal self-name (or "this creature"/"it") makes the scope a single permanent (CR 614 self-source).
  const selfRe = new RegExp(
    `double all damage (?:that )?(?:${escapeRe(name)}|${escapeRe(shortName)}|this creature|this permanent|it) would deal`,
    "i",
  );
  if (shortName && selfRe.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true } });
  }

  // SOURCE-SCOPED, controller-wide: "If a source you control would deal damage, it deals double that damage
  // instead." / "Double the damage … sources you control would deal." (Furnace-of-Rath "you control" family.)
  if (/double (?:the )?damage[^.]*sources? you control would deal/i.test(oracle)
      || /if a source you control would deal damage[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you" } });
  }

  // TARGET-SCOPED (affected player): "If a source would deal damage to you, it deals double that damage
  // instead." (Furnace of Rath proper is symmetric-all; "to you" is the target-side shape.)
  if (/if a source would deal damage to you[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "target" } });
  }

  return out;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Synthesized-on-read scan ──────────────────────────────────────────────────

/**
 * Does this permanent (its card) carry a damage-replacement static ability?
 * Synthesized-on-read from the card oracle — no stored entry, no removal hook.
 */
export function isDamageReplacement(permanent) {
  return parseDamageReplacements(permanent?.card).length > 0;
}

/**
 * Every active damage-replacement entry on the battlefield, each tagged with the
 * permanent that grants it (for the source-side `self` filter). Pure scan; the
 * entries vanish the instant a permanent leaves (it's re-scanned per call).
 */
export function collectDamageReplacements(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      for (const entry of parseDamageReplacements(perm.card)) {
        out.push({ ...entry, permanentId: perm.id, permanentController: pid });
      }
    }
  }
  return out;
}

/**
 * Fast gate: is there ANY damage-replacement on the board? Call sites gate the
 * whole consult on this so a no-doubler board runs the byte-identical path it
 * does today (the CREED negative-test guarantee).
 */
export function boardHasDamageReplacement(state) {
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      if (isDamageReplacement(perm)) return true;
    }
  }
  return false;
}

// ─── Filters (source-side AND target-side — MUST-FIX 2) ─────────────────────────

/**
 * Build the applicability predicate for one replacement entry. Supports BOTH a
 * source-side scope (matches on the damage SOURCE / its controller) and a
 * target-side scope (matches on the AFFECTED player / target controller). The
 * predicate takes the damage `event` and returns true iff this replacement
 * applies to it.
 */
export function buildSourceFilter(entry, _state) {
  const scope = entry?.scope || {};
  if (scope.side === "target") {
    // Affected-player scoped: the replacement's controller is the player being dealt to.
    return (event) => event?.targetKind === "player"
      && event?.targetId === entry.permanentController;
  }
  // Source-side (default).
  if (scope.self) {
    // This-permanent-only (Wolverine): the damage source must BE this permanent.
    return (event) => event?.sourceId != null && event.sourceId === entry.permanentId;
  }
  if (scope.controller === "you") {
    // Controller-wide: any source the entry's controller controls.
    return (event) => event?.sourceController != null
      && event.sourceController === entry.permanentController;
  }
  return () => false;
}

// ─── The 616-ordered consult ────────────────────────────────────────────────────

/**
 * Apply the op of one replacement entry to a running amount. Multiplier/addend —
 * NEVER a boolean. Unknown ops are a no-op (safe false-negative).
 */
function applyOp(amount, op) {
  if (!op) return { amount, prevented: false };
  if (op.op === "multiply") return { amount: amount * (op.factor ?? 1), prevented: false };
  if (op.op === "add") return { amount: amount + (op.addend ?? 0), prevented: false };
  if (op.op === "prevent") return { amount: 0, prevented: true };
  return { amount, prevented: false };
}

/**
 * The damage-amount-finalization CONSULT. Given the pre-replacement damage
 * `event`, returns `{ amount, prevented }` — the amount to actually deal (after
 * every applicable replacement, in 616.1 order) and whether it was prevented to
 * a no-op.
 *
 * @param {object} state
 * @param {object} event - { sourceId, sourceController, amount, targetKind:"player"|"creature"|"planeswalker", targetId, isCombat }
 */
export function applyDamageReplacements(state, event) {
  const raw = Math.max(0, Number(event?.amount) || 0);
  // 614.5 — a FRESH applied-set PER consult invocation (MUST-FIX 4). Keyed by the entry's permanentId so each
  // distinct replacement applies at most once within THIS event; a separate combat sub-step is a separate
  // call → a separate set → the doubler fires again (correct double-strike doubling, never ×step-count).
  const applied = new Set();
  if (raw <= 0) return { amount: raw, prevented: false };

  // Collect every applicable entry (both filter sides), then apply in 616.1 order. Deterministic default =
  // battlefield/registration order (collectDamageReplacements order); the affected controller's choice hook
  // can reorder later without changing this contract. Routed through the ordered loop NOW — never "double wins".
  const entries = collectDamageReplacements(state)
    .filter((entry) => buildSourceFilter(entry, state)(event));

  let amount = raw;
  let prevented = false;
  for (const entry of entries) {
    if (applied.has(entry.permanentId)) continue; // 614.5 once-per-event-per-replacement
    applied.add(entry.permanentId);
    const res = applyOp(amount, entry.op);
    amount = res.amount;
    if (res.prevented) { prevented = true; break; }
  }
  return { amount: Math.max(0, amount), prevented };
}

/**
 * Convenience for the call sites: returns the (possibly doubled) amount for a
 * damage event, or the raw amount unchanged when the board has no replacement
 * (the byte-identical gate). `prevented` collapses to 0.
 */
export function consultDamageAmount(state, event) {
  if (!boardHasDamageReplacement(state)) return Math.max(0, Number(event?.amount) || 0);
  const { amount, prevented } = applyDamageReplacements(state, event);
  return prevented ? 0 : amount;
}
