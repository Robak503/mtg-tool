/**
 * resolvers.js — the serializable, data-driven stack/trigger resolver registry.
 *
 * THE Phase-7 keystone. Stack objects and triggers no longer carry a live
 * `payload.onResolve` closure (un-serializable — the save/resume blocker).
 * Instead `payload = { resolver: <key>, params: <plain data> }`, and the engine
 * resolves by looking the key up here. `state` stays pure JSON, so a game can be
 * serialized mid-stack and restored to byte-identical behavior.
 *
 * Leaf-ish module: imports only from gameState (pure data helpers) and
 * spellEffects (pure resolution). Imports NOTHING from gameEngine or
 * actionDispatcher, so gameEngine can import this without a cycle.
 *
 * Extensibility: built-ins live in the frozen RESOLVERS map; the triggers and
 * Phase-2 effect-interpreter subsystems add keys via registerResolver (a
 * separate mutable EXTENSIONS map) rather than editing this core.
 *
 * Wiring status (Phase-7 PR-1): every resolver is implemented and unit-tested,
 * but NOTHING calls this yet — `resolveTopOfStack` swaps to the registry in
 * PR-2 and the cast path emits these payloads in PR-3.
 */

import { createPermanent, mintId, logEvent } from "./gameState.js";
import { resolveSpellEffect } from "./spellEffects.js";
import { triggersForEvent, applyTriggerEffect } from "./triggers.js";

/**
 * The canonical resolver-key contract. Frozen + exported so every producer
 * (cast path, triggers, effect interpreter) references the same strings.
 * Phase-1 wires spell.effect / spell.permanent / spell.noop; trigger.effect,
 * activated.effect, manual, and effect-program are reserved named slots the
 * later subsystems fill without re-touching the dispatcher.
 */
export const RESOLVER_KEYS = Object.freeze({
  SPELL_EFFECT: "spell.effect",         // a parsed instant/sorcery effect (single SpellEffect descriptor)
  PERMANENT_ETB: "spell.permanent",     // a permanent spell entering the battlefield
  SPELL_NOOP: "spell.noop",             // a recognized-but-unhandled instant/sorcery — log + pop
  TRIGGER_EFFECT: "trigger.effect",     // a triggered ability's effect (Phase-1 triggers emit this)
  ACTIVATED_EFFECT: "activated.effect", // an activated ability's effect (Phase 2)
  MANUAL: "manual",                     // Arbiter escape valve — surfaces an "unresolved" log
  EFFECT_PROGRAM: "effect-program",     // RESERVED for Phase-2's multi-atom interpreter
});

/**
 * Put a permanent on its controller's battlefield, minting a deterministic id
 * from `state.idSeq` and stamping `enteredOnTurn`. Extracted from the old
 * `actionDispatcher.defaultSpellResolver` closure (which used a
 * non-deterministic Date.now/Math.random id and bypassed `createPermanent`) —
 * now pure and serialize-stable.
 *
 * NOTE: this is the resolution-time "permanent enters" mechanic only. The ETB
 * trigger + layer-timestamp stamps ride through `gameEngine.enterBattlefield`
 * in PR-6 (the three-way integration seam); PR-1 deliberately keeps this minimal.
 */
export function enterPermanent(state, card, controller) {
  const player = state.players[controller];
  if (!player) return state;
  const { id: permId, state: s2 } = mintId(state, "perm");
  // Stamp the CR 613.7e layer timestamp at ETB (Phase-7 PR-9), alongside the
  // deterministic id, and advance the monotonic counter. Layers reads
  // `permanent.timestamp` to order anthems/lords; threading it through state keeps
  // it serialize-stable. (The three-way ETB stamp seam, D5.)
  const ts = s2.timestampCounter || 0;
  const s3 = { ...s2, timestampCounter: ts + 1 };
  const typeStr = String(card?.type || card?.type_line || "");
  const perm = {
    ...createPermanent({ id: permId, card, controller, summoningSick: /Creature/.test(typeStr) }),
    enteredOnTurn: s3.turn,
    timestamp: ts,
  };
  let next = {
    ...s3,
    players: {
      ...s3.players,
      [controller]: { ...player, battlefield: [...player.battlefield, perm] },
    },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller });
  // Fire ETB triggers now that the permanent is on the battlefield (CR 603.6a).
  // They land in pendingTriggers and flushTriggers puts them on the stack at the
  // next priority-grant checkpoint (which resolveTopOfStack runs after this).
  return checkEtbTriggers(next, perm);
}

/**
 * Enqueue every ETB trigger that fires when `enteredPerm` enters: the
 * newcomer's own "when this enters" triggers AND every watcher already on a
 * battlefield ("whenever a creature enters"). Pure — appends to pendingTriggers.
 * (Phase-7 PR-6. The layer-timestamp stamp from D5 lands with the layers engine
 * in PR-9, which is when timestamps start to matter.)
 */
function checkEtbTriggers(state, enteredPerm) {
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of state.players[pid].battlefield) {
      const ts = triggersForEvent(state, { event: "etb", sourcePermanent: watcher, triggeringPermanent: enteredPerm });
      if (ts.length) fired = fired.concat(ts);
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Type-line predicate: does this spell resolve as a permanent entering the
 * battlefield? Matches the original `defaultSpellResolver` set exactly (Creature
 * / Artifact / Enchantment / Planeswalker) so the PR-3 swap is behavior-identical.
 */
export function isPermanentSpell(card) {
  const typeLine = String(card?.type || card?.type_line || "");
  return /Creature|Artifact|Enchantment|Planeswalker/.test(typeLine);
}

/**
 * A "no resolver / unknown key" resolution: log it and pop. This is the Arbiter
 * escape valve — the engine couldn't resolve natively, so it surfaces an
 * "unresolved" log the UI can hand to the Arbiter. Never throws, never fabricates.
 */
function resolveManual(state, obj) {
  return logEvent(state, {
    kind: "stack-resolve",
    objectId: obj.id,
    kindOfObject: obj.kind,
    source: obj.source?.name || obj.source,
    manual: true,
  });
}

/**
 * Phase-2 P2.1 — the unresolved→Arbiter seam. A cast spell the engine can't model
 * (today: an instant/sorcery whose oracle text didn't parse) used to resolve as a
 * SILENT no-op — the single biggest fidelity + honesty gap (a relevant spell did
 * nothing and the player was never told). Instead we:
 *
 *   1. Log a STRUCTURED, honest `spell-unresolved` event (never the misleading
 *      `spell-no-op-resolve`) so the record always reflects "we couldn't model
 *      this" — this is the "never a silent no-op" guarantee (CLAUDE.md §1.2/§8).
 *   2. Flag `state.pendingArbiter` so the session driver can surface an
 *      `unresolved` decision and the UI can hand the card to the Ollama-only
 *      Arbiter for a verified ruling (a teaching moment), then let the player
 *      continue.
 *
 * The engine NEVER calls the network and NEVER fabricates the effect — it only
 * leaves an honest marker. The driver (learnSession) decides whether to pause
 * (it knows difficulty + that the AI's spells shouldn't flood the player). The
 * first unresolved object wins (FIFO) — once flagged, the driver pauses before a
 * second can resolve, so this guard is belt-and-braces.
 */
export function markPendingArbiter(state, obj, reason) {
  const card = obj?.source && typeof obj.source === "object" ? obj.source : {};
  const cardName = card.name || obj?.payload?.params?.cardName || (typeof obj?.source === "string" ? obj.source : "Unknown card");
  const oracle = card.oracle || card.oracle_text || "";
  let next = logEvent(state, {
    kind: "spell-unresolved",
    objectId: obj?.id,
    cardName,
    controller: obj?.controller,
    reason,
  });
  if (!next.pendingArbiter) {
    next = {
      ...next,
      pendingArbiter: {
        stackObjectId: obj?.id ?? null,
        cardName,
        oracle,
        reason,
        controller: obj?.controller ?? null,
      },
    };
  }
  return next;
}

/**
 * Built-in resolvers. Each is `(state, stackObject) => newState`. PURE — reads
 * only `stackObject.payload.params` + `state`; never closes over cast-time data.
 */
export const RESOLVERS = Object.freeze({
  [RESOLVER_KEYS.SPELL_EFFECT]: (state, obj) => {
    const { effect, controller, targets = [] } = obj.payload?.params || {};
    if (!effect) return resolveManual(state, obj);
    return resolveSpellEffect(state, { effect, controller, targets });
  },

  [RESOLVER_KEYS.PERMANENT_ETB]: (state, obj) => {
    const { card, controller } = obj.payload?.params || {};
    if (!card || !controller) return resolveManual(state, obj);
    return enterPermanent(state, card, controller);
  },

  // P2.1: a recognized-but-unparseable instant/sorcery. No longer a silent
  // no-op — flag it for the Arbiter seam (structured `spell-unresolved` log +
  // `state.pendingArbiter`) so the player gets a verified ruling instead of the
  // spell quietly doing nothing.
  [RESOLVER_KEYS.SPELL_NOOP]: (state, obj) => {
    const { reason } = obj.payload?.params || {};
    return markPendingArbiter(state, obj, reason || "instant-or-sorcery (no recognized effect)");
  },

  // PR-6: a triggered ability resolves through applyTriggerEffect (the
  // TriggerEffect vocabulary: gain/lose life, draw, damage-to-each-opponent).
  // An unrecognized effect (null) routes to the manual/Arbiter log, never faked.
  [RESOLVER_KEYS.TRIGGER_EFFECT]: (state, obj) => {
    const { effect, controller, targets = [], context } = obj.payload?.params || {};
    if (!effect) return resolveManual(state, obj);
    return applyTriggerEffect(state, { effect, controller, context, targets });
  },

  // STUB in PR-1: activated abilities are Phase 2.
  [RESOLVER_KEYS.ACTIVATED_EFFECT]: (state, obj) => resolveManual(state, obj),

  [RESOLVER_KEYS.MANUAL]: resolveManual,
});

// Extension registry: triggers / the Phase-2 interpreter (and tests) register
// here rather than mutating the frozen built-ins.
const EXTENSIONS = new Map();

/** Register a resolver for a key not in the built-in set (static registration). */
export function registerResolver(key, fn) {
  if (typeof fn !== "function") throw new Error(`registerResolver: fn for "${key}" must be a function`);
  EXTENSIONS.set(key, fn);
}

/** Resolve a key to its function: built-ins win, then extensions, then null. */
export function getResolver(key) {
  if (key && Object.prototype.hasOwnProperty.call(RESOLVERS, key)) return RESOLVERS[key];
  return (key && EXTENSIONS.get(key)) || null;
}

/** Test-only: drop all registered extensions (call in beforeEach). */
export function _clearExtensionsForTests() {
  EXTENSIONS.clear();
}
