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
import { logEvent, destroyLethalCreatures, gainLife, loseLife, opponentsOf, tapPermanent, untapPermanent, moveCardToZone, addCounter, findPermanent, createPermanent, mintId, shuffleLibrary } from "../gameState.js";
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

/**
 * P3.1 counter (CR 701.5a) — counter the target spell(s) on the stack. The targeted
 * spell is removed from the stack and put into its controller's graveyard WITHOUT
 * resolving: no atoms run, no permanent enters, no effect, no triggers. This is the
 * stack-removal mechanic — the FIRST atom that mutates the stack rather than the
 * battlefield/players.
 *
 * Fail-safe (CR 608.2b): if the target already left the stack (it resolved, or a
 * higher counter got it first), the counter fizzles for that target — a logged no-op,
 * never an error, never a fabricated effect. A defensive re-check of the SPELL-TYPE
 * filter (creature/noncreature) runs here (it held at cast time + a spell's type can't
 * change on the stack). The on-card "can't be countered" exclusion (CR 701.5e) is
 * enforced at ENUMERATION only (spellEffects.enumerateTargets) — sufficient because the
 * engine models no effect that grants uncounterability after a target is chosen, and
 * on-card text is immutable, so an uncounterable spell can never reach this atom.
 */
// Front-face type only (CR 712.4a) — for a split/MDFC spell the enriched type line is the
// combined "Front // Back", so the creature/noncreature filter must read the front half.
const counterTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];
function counterFilterMatches(card, filter) {
  const type = counterTypeLine(card);
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  return true; // "any"
}
function applyCounter(state, atom, ctx) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type !== "spell") continue;
    const idx = next.stack.findIndex((o) => o.id === t.id && o.kind === "spell");
    if (idx === -1) {
      // Target already off the stack → illegal target, the counter does nothing here.
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    const targetObj = next.stack[idx];
    const card = targetObj.source;
    if (!counterFilterMatches(card, atom.spellFilter)) {
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    const controller = targetObj.controller;
    const newStack = [...next.stack.slice(0, idx), ...next.stack.slice(idx + 1)];
    const player = next.players[controller];
    next = {
      ...next,
      stack: newStack,
      players: player
        ? { ...next.players, [controller]: { ...player, graveyard: [...player.graveyard, card] } }
        : next.players,
    };
    next = logEvent(next, { kind: "spell-effect", effect: "counter", targetId: t.id, cardName: card?.name, controller });
  }
  return next;
}

/**
 * P3.2 tutor (CR 701.19) — search the caster's library for a card matching the modeled
 * type filter, put it into their hand, then shuffle. The filter (`atom.filter.groups`,
 * parsed + allowlisted by the parser) matches a library card when ANY group's words ALL
 * appear in the card's type line (so "instant or sorcery" → 2 groups; "basic land" → 1).
 *
 * v1 conservatism + "never wrong": the ENGINE auto-picks (the deepest cleanly-modelable
 * point — there's no resolution-time choice mechanism), choosing the highest-mana-value
 * match (deterministic tie-break) so the fetch is a sensible, LEGAL card. Interactive
 * tutor choice is a future enhancement. Hidden-info safe: the log records the FILTER and
 * whether a card was found, NEVER the card's name (an opponent's tutor stays hidden). A
 * "you may"/mandatory search that finds nothing (no match, CR 701.19f) is a logged no-op
 * + shuffle, never an error.
 */
function tutorManaValue(card) {
  if (typeof card?.cmc === "number") return card.cmc;
  if (typeof card?.mana_value === "number") return card.mana_value;
  let mv = 0;
  for (const sym of String(card?.mana || card?.mana_cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) mv += 0;
    else {
      // A 2-generic hybrid pip like {2/W} has mana value 2 (CR 202.3f — the largest
      // component); a colored / colored-hybrid / phyrexian pip is 1.
      const lead = s.match(/^(\d+)/);
      mv += lead ? parseInt(lead[1], 10) : 1;
    }
  }
  return mv;
}
function cardMatchesTutorFilter(card, filter) {
  // Match the FRONT face only: a library card has just its front-face characteristics
  // (CR 712.4a), but the enriched type line is the COMBINED "Front // Back" for an MDFC —
  // so a [artifact] tutor must NOT match a card whose FRONT is a land and back an artifact
  // (P3.2 review catch). Split on " // " and take the front.
  const type = String(card?.type || card?.type_line || "").toLowerCase().split(" // ")[0];
  return (filter?.groups || []).some((group) => group.every((w) => new RegExp(`\\b${w}\\b`).test(type)));
}
/** A deterministic PRNG (mulberry32) so the shuffle is serialize-stable (no Math.random). */
function deterministicRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Shuffle a player's library deterministically (CR 701.19e / 103.2) — serialize-stable. */
function shuffleControllerLibrary(state, controller) {
  if (!state.players[controller]) return state;
  const seed = (((state.idSeq || 0) + 1) * 2654435761 + (state.players[controller].library.length || 0)) >>> 0;
  return shuffleLibrary(state, { playerId: controller, rng: deterministicRng(seed) });
}
function applyTutor(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  let next = state;
  const matches = player.library.filter((c) => cardMatchesTutorFilter(c, atom.filter));
  let found = false;
  if (matches.length > 0) {
    // Deterministic pick: highest mana value, then a LOCALE-FREE codepoint tie-break by
    // name then id (localeCompare's default collation is environment-dependent → would
    // break the serialize-stable mandate). cmp returns -1/0/1 by raw code points.
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const best = [...matches].sort((a, b) =>
      tutorManaValue(b) - tutorManaValue(a) ||
      cmp(String(a.name || ""), String(b.name || "")) ||
      cmp(String(a.id || ""), String(b.id || "")),
    )[0];
    next = moveCardToZone(next, { playerId: controller, fromZone: "library", toZone: "hand", cardId: best.id });
    found = true;
  }
  next = shuffleControllerLibrary(next, controller);
  // Hidden-info safe: log the filter + found-ness, NOT the fetched card's name.
  return logEvent(next, { kind: "spell-effect", effect: "tutor", controller, found, destination: "hand" });
}

/** P3.2 shuffle — "[then] shuffle [your library]" as its own clause (CR 103.2). */
function applyShuffle(state, atom, ctx) {
  if (!state.players[ctx.controller]) return state;
  const next = shuffleControllerLibrary(state, ctx.controller);
  return logEvent(next, { kind: "spell-effect", effect: "shuffle", controller: ctx.controller });
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
  "counter": applyCounter,
  "tutor": applyTutor,
  "shuffle": applyShuffle,
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
