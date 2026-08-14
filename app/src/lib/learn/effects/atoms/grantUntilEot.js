/**
 * effects/atoms/grantUntilEot.js — UNTIL-EOT QUOTED GRANTS (BLITZ TG-1).
 *
 * The one-shot spell family that GRANTS a quoted ability to one-or-more creatures until end of turn:
 *
 *   (A) `Until end of turn, target creature gets +N/+M and gains "<body>".`   — Feign Death's pump kin
 *       (Demonic Gifts / Supernatural Stamina / Abnormal Endurance / Ashnod's Intervention)
 *   (B) `Until end of turn, target creature gains "<body>".`                  — Feign Death / Undying Malice
 *   (C) `Until end of turn, creatures you control gain "<body>".`             — Showstopper / Lightning Volley
 *
 * THE GRANT VEHICLE: one stored continuous effect in the layer-6 `addAbility` shape the GROUP-GRANT statics
 * already use (op.grant {kind:"triggered"|"activated", quoted}), with an EXPLICIT-IDS selector
 * (`affects: {mode:"fixed", permanentIds}`) captured AT RESOLUTION — CR 611.2c: a one-shot's affected set is
 * locked as it resolves ("creatures you control" = the creatures you controlled THEN; a creature entering
 * later is never granted). Because the shape is identical, the EXISTING collectors light both halves up with
 * no new fire path:
 *   - triggered: layers.grantedTriggeredQuotedFor → triggers.grantedTriggersForGroup → triggersForEvent
 *     (plus that collector's dead-look-back fallback for the dies fire — the granted "When this creature
 *     dies, …" is on the object's last-known abilities, CR 603.6e/603.10a).
 *   - activated: layers.grantedActivatedQuotedFor → legalChoices' group-granted enumeration (the granted
 *     "{T}: …" binds to the RECIPIENT exactly like a printed ability).
 * Expiry is free: `duration {kind:"endOfTurn", turn}` rides layers.expireContinuousEffects at cleanup.
 * A granted creature that dies and RETURNS (Feign Death's own return included) comes back as a NEW
 * permanent id — never in the fixed set, so a grant can never loop or outlive its object (CR 611.2c).
 *
 * THE CREED GATE lives at PARSE time: the quoted body must be FULLY modeled — confirmed by the SAME
 * validators the static group-grant emission gate uses (isModeledGroupTriggeredBody /
 * isModeledGroupActivatedBody), injected below to avoid the load cycle (this module is imported by
 * parser.js; the validators live above it — the registerGroupTriggeredBodyValidator pattern). An
 * unvalidated body → null → LOW → Arbiter (Resuscitate's regenerate and Galuf's power-counters park
 * here — no per-card lists, pure vocabulary; Arm with Aether's may-bounce body un-parked in BLITZ SB-1
 * when the damaged-player bounce became a modeled saboteur payoff). No validator registered yet
 * (a load order where classification ran first) → null — fail-safe, never fail-open.
 *
 * CIRCULAR-IMPORT NOTE: mirrors combat.js's import set exactly (gameState + layers + shared + combat) —
 * proven cycle-safe. MUST NOT import effects/parser.js or the atoms barrel.
 */

import { findPermanent, logEvent } from "../../gameState.js";
import { addContinuousEffect } from "../../layers.js";
import { atomTargets } from "./shared.js";
import { applyPumpEffect } from "./combat.js";
import { parseGrantedKeywords } from "../parseHelpers.js"; // a leaf (proven cycle-free — combat.js imports it)

// ── Injected body validators (the registerGroupTriggeredBodyValidator pattern — no load cycle) ──────────
let grantTriggeredBodyValidator = null;
let grantActivatedBodyValidator = null;
/** coverage.js + gameEngine.js register triggerRouting.isModeledGroupTriggeredBody here. */
export function registerGrantTriggeredBodyValidator(fn) {
  if (typeof fn === "function") grantTriggeredBodyValidator = fn;
}
/** coverage.js + legalChoices.js register abilities.isModeledGroupActivatedBody here. */
export function registerGrantActivatedBodyValidator(fn) {
  if (typeof fn === "function") grantActivatedBodyValidator = fn;
}

/** The validated grant KIND for a quoted body — "triggered" / "activated" / null (unmodeled → Arbiter). */
function validatedGrantKind(quoted) {
  if (grantTriggeredBodyValidator && grantTriggeredBodyValidator(quoted)) return "triggered";
  if (grantActivatedBodyValidator && grantActivatedBodyValidator(quoted)) return "activated";
  return null;
}

/**
 * PURE clause parser (registered via registerClauseParser in parser.js; splitClauses keeps the whole
 * sentence intact via its until-EOT-grant guard — the internal " and gains" / any " and " inside the quoted
 * body is never a top-level boundary). Shapes anchored ^…$ against the ORIGINAL-case clause so the quoted
 * body keeps its printed case; a rider outside the quotes fails the anchor → null → LOW → Arbiter.
 * Both straight and curly quotes accepted (Scryfall prints straight; belt-and-suspenders).
 */
export function grantUntilEotClauseParser(clause) {
  const t = String(clause || "").trim();
  // (A) pump + grant — ONE chosen target shared by both halves.
  let m = t.match(/^until end of turn, target creature gets ([+-]\d+)\/([+-]\d+) and gains ["“](.+)["”]\.?$/i);
  if (m) {
    const kind = validatedGrantKind(m[3]);
    return kind ? { op: "grant-until-eot", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, grantKind: kind, quoted: m[3] } : null;
  }
  // (B) bare single-target grant.
  m = t.match(/^until end of turn, target creature gains ["“](.+)["”]\.?$/i);
  if (m) {
    const kind = validatedGrantKind(m[1]);
    return kind ? { op: "grant-until-eot", targetType: "creature", grantKind: kind, quoted: m[1] } : null;
  }
  // (C) team grant — the controller's creatures, set fixed at resolution (CR 611.2c).
  m = t.match(/^until end of turn, creatures you control gain ["“](.+)["”]\.?$/i);
  if (m) {
    const kind = validatedGrantKind(m[1]);
    return kind ? { op: "grant-until-eot", scope: "youControl", grantKind: kind, quoted: m[1] } : null;
  }
  // (D) keyword(s) + quoted grant, optional you-control scope — Strength of Will ("… target creature
  // you control gains indestructible and 'Whenever this creature is dealt damage, put that many +1/+1
  // counters on it.'"). The lazy keyword group is bounded by the REQUIRED ` and "` before the quote, so
  // a multi-keyword list ("flying and first strike and '…'") lands whole in group 3; parseGrantedKeywords
  // is the all-or-nothing validator (an unmodeled keyword parks the card, FN-safe) exactly as the
  // counter-then-grant fold uses it. The scope group becomes a controller restriction the shared target
  // enumeration already honors — never a second predicate implementation.
  m = t.match(/^until end of turn, target creature( you control)? gains ([a-z][a-z' ]*?) and ["“](.+)["”]\.?$/i);
  if (m) {
    const kws = parseGrantedKeywords(m[2].trim());
    const kind = kws ? validatedGrantKind(m[3]) : null;
    if (!kws || !kind) return null;
    return { op: "grant-until-eot", targetType: "creature",
      ...(m[1] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}),
      grantKeywords: kws, grantKind: kind, quoted: m[3] };
  }
  return null;
}

/**
 * applyGrantUntilEot — resolve the grant (and shape A's pump) onto the affected set.
 *
 * The pump half delegates to applyPumpEffect with a synthetic pump atom over the SAME ctx (same chosen
 * target, same CR 608.2b departed-target skip, same layer storage + lethal-SBA sweep) — never a second
 * pump implementation. The grant half captures the affected ids AT RESOLUTION (post-pump state; the pump
 * never changes the set) and stores ONE fixed-ids addAbility effect. A fully-departed set (the lone target
 * killed in response) stores nothing — a logged fizzle, never a dangling grant.
 */
export function applyGrantUntilEot(state, atom, ctx) {
  let next = state;
  if (atom.ptDelta && (atom.ptDelta.p !== 0 || atom.ptDelta.t !== 0)) {
    next = applyPumpEffect(next, { op: "pump", targetType: atom.targetType, ptDelta: atom.ptDelta }, ctx);
  }
  const ids = [];
  for (const t of atomTargets(next, atom, ctx) || []) {
    if (t.type !== "creature" || !findPermanent(next, t.id)) continue; // CR 608.2b — departed target
    ids.push(t.id);
  }
  if (!ids.length) {
    return logEvent(next, { kind: "spell-effect", effect: "grant-until-eot", granted: 0, controller: ctx.controller });
  }
  let s2 = addContinuousEffect(next, {
    layer: 6,
    op: { layerOp: "addAbility", grant: { kind: atom.grantKind, quoted: atom.quoted } },
    affects: { mode: "fixed", permanentIds: ids },
    duration: { kind: "endOfTurn", turn: next.turn },
    source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
  }).state;
  // Shape D's keyword half — one addKeyword effect per granted keyword over the SAME fixed set and the
  // SAME duration (the counter-then-grant storage shape), so the keyword and the quoted ability expire
  // together at the same cleanup.
  for (const kw of atom.grantKeywords || []) {
    s2 = addContinuousEffect(s2, {
      layer: 6,
      op: { layerOp: "addKeyword", keyword: kw },
      affects: { mode: "fixed", permanentIds: ids },
      duration: { kind: "endOfTurn", turn: next.turn },
      source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
    }).state;
  }
  return logEvent(s2, { kind: "spell-effect", effect: "grant-until-eot", granted: ids.length, grantKind: atom.grantKind, controller: ctx.controller });
}

export const grantUntilEotResolvers = {
  "grant-until-eot": applyGrantUntilEot,
};
