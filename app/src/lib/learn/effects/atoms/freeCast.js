/**
 * effects/atoms/freeCast.js — the FREE-CAST atom (CR 601.2b — "you may cast … without paying its
 * mana cost"). The cast-one-card-from-hand-free family (Rishkar's Expertise / the Expertise cycle /
 * Electrodominance et al.: "you may cast a spell with mana value N or less from your hand without
 * paying its mana cost").
 *
 * ARCHITECTURE — mirrors DISCOVER exactly (the proven free-cast precedent). At resolution this atom
 * does NOT cast anything itself; it PARKS the eligible hand cards in `state.pendingFreeCast` (a plain-
 * data flag, like `pendingDiscover`). The controller's "which card to cast for free, or decline"
 * decision is then resolved at the ACTION layer: legalChoices.actionsFreeCastDecision offers a
 * `freeCast:true` cast action per eligible hand card (reusing castActionsFromZone — so target/mode/
 * additional-cost enumeration, the stack, cast triggers, ward, and the AI all behave EXACTLY like a
 * normal cast) plus a decline action. actionDispatcher's free-cast branch (applyCastSpell with
 * action.freeCast) skips the mana payment; both the cast and the decline clear pendingFreeCast.
 *
 * Because the decision resolves AFTER the effect program finishes, programConfidence forces the
 * free-cast atom to be the LAST atom of its program (same invariant as discover) — any atom after it
 * would wrongly run before the decision. The Expertise cycle's lead effect (draw / make tokens /
 * -3/-3 / bounce) is a normal modeled atom that runs first; the free-cast atom is the tail.
 *
 * Eligibility (filtered HERE so the parked candidate set is honest):
 *   - mana value <= atom.maxMv (the printed cap; CR 202.3 — an absent cost is MV 0).
 *   - type: any spell, or instant-or-sorcery only (atom.typeFilter === "instantSorcery").
 *   - LAND cards are never castable spells (CR 601.2 — you cast spells, you play lands), so excluded.
 *   - the SOURCE spell itself is on the stack (not in hand), so it's never a candidate.
 *
 * Pure data mutation (no closures) so a game serialized mid-decision restores intact. Imports only
 * logEvent (leaf) + tutorManaValue (the shared MV reader the discover/tutor paths use) — cycle-free.
 */

import { logEvent } from "../../gameState.js";
import { tutorManaValue } from "./library.js";

/** A hand card is a castable spell for free-cast iff it's not a land and clears the MV cap + type filter. */
export function freeCastEligible(card, { maxMv, typeFilter }) {
  const typeLine = String(card?.type || card?.type_line || "");
  if (/\bLand\b/.test(typeLine)) return false; // CR 601.2 — lands are played, not cast
  if (typeof maxMv === "number" && tutorManaValue(card) > maxMv) return false; // CR 202.3 MV cap
  if (typeFilter === "instantSorcery" && !/\b(Instant|Sorcery)\b/.test(typeLine)) return false;
  return true;
}

/**
 * FREE-CAST atom — "you may cast a spell with mana value N or less from your hand without paying its
 * mana cost." Park the eligible hand cards for the controller's action-layer cast-or-decline decision.
 * A controller who's gone (eliminated mid-resolution, CR 800.4a) or has NO eligible card is a clean
 * no-op — the "may" simply isn't taken (never a fabricated cast). `maxMv` is the printed cap; an
 * absent cap (atom.maxMv == null) means no MV restriction. `typeFilter` narrows to instant/sorcery.
 */
export function applyFreeCastAtom(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const opts = { maxMv: atom.maxMv ?? null, typeFilter: atom.typeFilter || null };
  const eligible = (player.hand || []).filter((c) => freeCastEligible(c, opts));
  // No eligible card → the optional cast is simply not taken (CR 601.2b is a "may"). Log the whiff so
  // the decision log is honest; never park an empty decision (the action layer would offer only a no-op).
  if (eligible.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "free-cast", controller, found: false });
  }
  const next = {
    ...state,
    pendingFreeCast: {
      controller,
      candidateIds: eligible.map((c) => c.id),
      maxMv: opts.maxMv,
      typeFilter: opts.typeFilter,
      sourceName: ctx.cardName || null,
    },
  };
  return logEvent(next, { kind: "spell-effect", effect: "free-cast", controller, found: true, count: eligible.length });
}

/**
 * FREE-CAST clause parser (CR 601.2b). The cast-one-card-from-hand-free family, fixed forms only:
 *   "cast a spell with mana value N or less from your hand without paying its mana cost"
 *   "cast an instant or sorcery spell with mana value N or less from your hand without paying its mana cost"
 *   "cast an instant or sorcery spell from your hand without paying its mana cost" (no MV cap)
 *
 * IMPORTANT — the LEADING "you may" is already PEELED by parseClauseToAtom's α2 optional wrapper before
 * the registered clause parsers run, so this matcher anchors on the INNER "cast …" form (the post-peel
 * text). parseClauseToAtom special-cases a free-cast atom so it is NOT stamped optional (its "may" is
 * the action-layer decline, not an optional-effect yes/no pause). A standalone "cast …" with no "you
 * may" (not a printed form for free-cast) would also match — harmless, as no such card exists.
 *
 * Whole-clause anchored. A VARIABLE cap ("mana value X or less" — Electrodominance's cast rides the
 * spell's own X, not modeled here), an "any number of spells" (Aetherflux / Omniscience — a multi-cast
 * loop, a SAFE deferral), a "shares a card type with it" / "equal or lesser mana value" relational cap
 * (Counterlash / Reinterpret — needs the just-countered spell as the referent), a subtype filter, or any
 * other rider fails the `$` → null → the clause stays low → Arbiter (CREED — never a confidently-wrong
 * partial free-cast). Pure (no helper). Registered via registerClauseParser.
 *
 * NOTE: only "a spell" (singular) is matched — the singular guarantees the single-card park + single
 * action-layer decision the runtime models. The plural "spells" multi-cast is deliberately deferred.
 */
export function freeCastClauseParser(clause) {
  // Tolerate a still-present "you may" prefix (a direct caller / a future path that bypasses the peel),
  // so the matcher is robust whether it sees the wrapped or the peeled form.
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/^you may /, "");
  // "cast a[n] [instant or sorcery] spell with mana value N or less from your hand without paying its mana cost"
  const m = t.match(/^cast an? (instant or sorcery )?spell with mana value (\d+) or less from your hand without paying its mana cost$/);
  if (m) {
    return { op: "free-cast", maxMv: parseInt(m[2], 10), typeFilter: m[1] ? "instantSorcery" : null, targetType: null };
  }
  // "cast an instant or sorcery spell from your hand without paying its mana cost" (no MV cap)
  const m2 = t.match(/^cast an instant or sorcery spell from your hand without paying its mana cost$/);
  if (m2) {
    return { op: "free-cast", maxMv: null, typeFilter: "instantSorcery", targetType: null };
  }
  return null;
}

export const freeCastResolvers = {
  // FREE-CAST (CR 601.2b) — park eligible hand cards for the action-layer cast-free/decline decision.
  // Rishkar's/Baral's/Sram's/Yahenni's/Kari Zev's Expertise + Electrodominance(fixed-cap forms) flip native-spell.
  "free-cast": applyFreeCastAtom,
};
