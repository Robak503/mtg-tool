/**
 * effects/effectAtoms.js — the Atom resolver registry (Phase-2 P2.2 keystone).
 *
 * A data table keyed by `Atom.op`, each entry a pure `(state, atom, ctx) => state`
 * resolver. `ctx = { controller, targets }` (the cast-time choices frozen onto the
 * stack object). This is the mechanism that replaces the legacy closure.
 *
 * Parity by construction: the three keystone atoms delegate to the SAME per-effect
 * helpers the legacy `resolveSpellEffect` uses (`spellEffects.applyDamageEffect`
 * etc.), so an EffectProgram of these atoms is byte-for-byte equivalent to the old
 * path — there is no second implementation to drift. New atoms (pump, tokens,
 * counters, …) get their own resolvers in later PRs.
 *
 * Leaf-ish: imports only the shared effect helpers from spellEffects. Does NOT
 * import resolvers or the runner.
 */

import {
  applyDamageEffect,
  applyDestroyEffect,
  applyDrawEffect,
} from "../spellEffects.js";
import { addContinuousEffect } from "../layers.js";
import { logEvent, destroyLethalCreatures, gainLife, loseLife, opponentsOf, tapPermanent, untapPermanent, moveCardToZone, addCounter, findPermanent, createPermanent, mintId } from "../gameState.js";
import { checkDiesTriggers } from "../triggers.js";

const TOKEN_COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "and"]);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * P2.6 create-token (CR 701.7) — put `count` token creatures onto the controller's
 * battlefield. v1 conservative: tokens enter via createPermanent (correct P/T, owner,
 * summoning sick) but do NOT fire ETB-watcher triggers yet (an under-model, never a
 * fabricated effect — the token IS created). Keyword-granting tokens ("…with flying")
 * stay low at the parser, so we never silently drop a granted ability.
 */
function applyCreateToken(state, atom, ctx) {
  let next = state;
  const words = String(atom.descriptor || "").split(/\s+/).filter(Boolean);
  const subtypes = words.filter(w => !TOKEN_COLOR_WORDS.has(w.toLowerCase())).map(cap).join(" ");
  const type = subtypes ? `Token Creature — ${subtypes}` : "Token Creature";
  const count = Math.max(1, atom.count || 1);
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: subtypes || "Token", type, power: atom.power, toughness: atom.toughness, oracle: "", token: true };
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
  }
  // A 0/0 token with no other effect dies immediately (CR 704.5f) — run the lethal SBA.
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "create-token", count, power: atom.power, toughness: atom.toughness, controller: ctx.controller });
}

// ─── P2.7 atom family (delegate to existing gameState helpers) ────────────────

/** "You gain N life" (CR 119.3) — the spell's controller gains life. Non-targeted. */
function applyGainLife(state, atom, ctx) {
  const amount = Math.max(0, atom.amount || 0);
  const next = gainLife(state, { playerId: ctx.controller, amount });
  return logEvent(next, { kind: "spell-effect", effect: "gain-life", controller: ctx.controller, amount });
}

/** "You lose N life" / "Each opponent loses N life" (CR 119.3). Non-targeted. */
function applyLoseLife(state, atom, ctx) {
  let next = state;
  const amount = Math.max(0, atom.amount || 0);
  if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = loseLife(next, { playerId: opp, amount });
    }
  } else {
    next = loseLife(next, { playerId: ctx.controller, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "lose-life", who: atom.who || "controller", amount });
}

/** Tap / untap target creature(s) (CR 701.26). */
function applyTapEffect(state, atom, ctx, tap) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type === "creature" && findPermanent(next, t.id)) next = tap ? tapPermanent(next, t.id) : untapPermanent(next, t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: tap ? "tap" : "untap", targets: (ctx.targets || []).map(t => t.id) });
}

/** Move target creature(s) battlefield → hand (bounce) or → exile. */
function applyZoneMove(state, atom, ctx, toZone) {
  let next = state;
  const dead = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "creature") continue;
    const lk = findPermanent(next, t.id);
    if (lk) {
      if (toZone === "exile") dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card });
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone, cardId: t.id });
    }
  }
  // Exile is NOT "dies" (CR 700.4 — dies = to graveyard), so no dies triggers fire.
  return logEvent(next, { kind: "spell-effect", effect: toZone === "exile" ? "exile" : "bounce", targets: (ctx.targets || []).map(t => t.id) });
}

/** Put +1/+1 or -1/-1 counters on target creature(s) (CR 122.1). */
function applyAddCounter(state, atom, ctx) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type === "creature" && findPermanent(next, t.id)) {
      next = addCounter(next, { permanentId: t.id, type: atom.counterType, amount: atom.amount || 1 });
    }
  }
  // -1/-1 counters lower DERIVED toughness — run the lethal SBA so a creature it
  // drops to 0 dies at resolution (the P2.3 negative-pump discipline).
  if (atom.counterType === "-1/-1") {
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "add-counter", counterType: atom.counterType, amount: atom.amount || 1, targets: (ctx.targets || []).map(t => t.id) });
}

/**
 * P2.3 pump — "+X/+X until end of turn" (Giant Growth family). Does NOT mutate
 * P/T directly: it registers a CR 613.4c (layer 7c) continuous effect into the
 * layer engine for each targeted creature, with an endOfTurn duration so it wears
 * off at the cleanup step (CR 514.2 — `expireContinuousEffects`, already wired in
 * gameEngine). Derived P/T (combat, SBAs, the AI) reads through layers, so the
 * pump shows up everywhere. The mechanism was built + tested in Phase 1; this
 * atom just emits the record.
 */
function applyPumpEffect(state, atom, ctx) {
  let next = state;
  // X-pump ("+X/+X until end of turn") binds both pips to the chosen X (ctx.xValue);
  // a fixed pump reads its printed ptDelta.
  const x = ctx.xValue || 0;
  const power = atom.amountX ? x : atom.ptDelta?.p || 0;
  const toughness = atom.amountX ? x : atom.ptDelta?.t || 0;
  for (const target of ctx.targets || []) {
    if (target.type !== "creature") continue;
    next = addContinuousEffect(next, {
      layer: 7,
      sublayer: "7c",
      op: { layerOp: "ptModify", power, toughness },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: { kind: "endOfTurn", turn: next.turn },
      source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
    }).state;
  }
  // A negative pump (-X/-Y, e.g. Disfigure / Last Gasp / Dismember) can drop a
  // creature's DERIVED toughness to <= 0 — run the lethal SBA so it dies at
  // resolution (CR 704.5f), exactly as the damage atom does. A positive pump
  // (Giant Growth) finds nothing lethal, so this is a no-op for it. Without this
  // the creature would silently survive at 0 toughness until the next combat step.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "pump", power, toughness, targets: (ctx.targets || []).map(t => t.id) });
}

// An X-amount atom (`amountX:true`, set by the parser for an {X}-cost spell) reads
// the chosen X (ctx.xValue, bound at cast time) instead of a printed numeric amount.
const effectiveAmount = (atom, ctx) => (atom.amountX ? ctx.xValue || 0 : atom.amount);

export const ATOM_RESOLVERS = Object.freeze({
  "deal-damage": (state, atom, ctx) =>
    applyDamageEffect(state, { controller: ctx.controller, amount: effectiveAmount(atom, ctx), targetType: atom.targetType, targets: ctx.targets }),
  "destroy": (state, atom, ctx) =>
    applyDestroyEffect(state, { controller: ctx.controller, targets: ctx.targets }),
  "draw": (state, atom, ctx) =>
    applyDrawEffect(state, { controller: ctx.controller, amount: effectiveAmount(atom, ctx) }),
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "gain-life": applyGainLife,
  "lose-life": applyLoseLife,
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
  "bounce": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "hand"),
  "exile": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "exile"),
  "add-counter": applyAddCounter,
  "create-token": applyCreateToken,
});

/**
 * Resolve a single atom. Returns the new state, or null when there is no resolver
 * for the atom's op — the caller (runEffectProgram) treats null as "can't model
 * this" and routes to the Arbiter seam rather than fabricating an effect.
 */
export function resolveAtom(state, atom, ctx) {
  const fn = ATOM_RESOLVERS[atom?.op];
  if (!fn) return null;
  return fn(state, atom, ctx);
}
