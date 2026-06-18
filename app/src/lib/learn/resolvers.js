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

import { createPermanent, mintId, logEvent, findPermanent, attachPermanent, destroyLethalCreatures, isPlaneswalker, startingLoyalty } from "./gameState.js";
import { resolveSpellEffect } from "./spellEffects.js";
import { applyTriggerEffect, checkDiesTriggers, checkEnterTriggers } from "./triggers.js";
import { markPendingArbiter } from "./pendingArbiter.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { isCloneCard, parseCloneSpec, cloneCandidates, snapshotCopiedCard } from "./cloneCopy.js";
import { setPendingCloneChoice, clearPendingChoice } from "./pendingChoice.js";

// Re-export the P2.1 seam marker from its leaf module (it moved out of this file
// in P2.2 so the effect interpreter can share it without an import cycle).
export { markPendingArbiter } from "./pendingArbiter.js";

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
  ATTACH: "attach",                     // Equip/Aura attach — sets attachedTo + attachments
  AURA_ETB: "spell.aura",               // an Aura spell resolving: enter + attach to its target
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
export function enterPermanent(state, card, controller, opts = {}) {
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
    // A clone enters carrying a `card` that's the COPIED creature's copiable values, while its
    // ORIGINAL card is stashed here and restored when it leaves the battlefield (CR 707.2 — off
    // the battlefield it's the original card, not the copy). moveCardToZone reads printedCard.
    ...(opts.printedCard ? { printedCard: opts.printedCard } : {}),
  };
  // A planeswalker enters with its starting loyalty as loyalty counters (CR 306.5b). Stored under
  // the generic counters map (`counters.loyalty`) so the 0-loyalty SBA + loyalty costs read it the
  // same way +1/+1 counters work. A non-finite printed loyalty (X/*) gets no counter — it never
  // classifies native and the SBA only kills walkers that entered with one.
  if (isPlaneswalker(card)) {
    const loy = startingLoyalty(card);
    if (loy != null) perm.counters = { ...perm.counters, loyalty: loy };
  }
  let next = {
    ...s3,
    players: {
      ...s3.players,
      [controller]: { ...player, battlefield: [...player.battlefield, perm] },
    },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller });
  // Aura attach (CR 303.4f): an Aura attaches to the object it's enchanting AS it enters —
  // the freshly-minted permanent's `attachedTo` is wired bidirectionally to its host so the
  // layer engine applies the bonus from the same turn. Guarded: the host must still be on a
  // battlefield (the resolver already re-checked legality, but a no-op stays safe).
  if (opts.attachTo && findPermanent(next, opts.attachTo)) {
    next = attachPermanent(next, { equipId: permId, targetId: opts.attachTo });
  }
  // Fire ETB triggers now that the permanent is on the battlefield (CR 603.6a). They land in
  // pendingTriggers and flushTriggers puts them on the stack at the next priority-grant checkpoint
  // (which resolveTopOfStack runs after this). `checkEnterTriggers` (triggers.js) is the SINGLE ETB-fire
  // helper, shared with the reanimation atom (β-3b) — so the cast/clone/aura and non-cast entry paths
  // can't drift.
  return checkEnterTriggers(next, perm);
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
 * Settle a pending clone copy-choice (CR 707): the clone enters the battlefield. With a chosen
 * creature still on the battlefield, it enters AS A COPY — its `card` becomes the source's
 * copiable values (CR 707.2) and its ORIGINAL card is stashed as `printedCard` (restored on
 * leave). With no/illegal/declined choice (a "you may" clone, or the target left — CR 707.9c),
 * it enters AS ITSELF: a 0/0 with no copy, which the lethal SBA then kills (CR 704.5f). Either
 * way the entry fires ETB triggers (enterPermanent reads the now-current card.oracle). The
 * caller (learnSession.settleCloneChoice) runs finalizeStackResolution to flush them.
 */
export function resolveCloneChoice(state, chosenPermId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "clone-search") return state;
  const { cloneCard, controller } = pc.resume || {};
  let next = clearPendingChoice(state);
  if (!cloneCard || !controller) return next;

  const chosen = chosenPermId ? findPermanent(next, chosenPermId) : null;
  const chosenIsCreature = chosen && /Creature/.test(String(chosen.permanent.card?.type || chosen.permanent.card?.type_line || ""));
  if (chosen && chosenIsCreature) {
    const copied = snapshotCopiedCard(chosen.permanent, cloneCard);
    next = enterPermanent(next, copied, controller, { printedCard: cloneCard });
  } else {
    // Declined, or the target is gone/illegal — the clone enters as itself (a 0/0).
    next = enterPermanent(next, cloneCard, controller);
  }
  // A clone that copied nothing is a 0/0 and dies immediately (CR 704.5f) — run the lethal SBA
  // (the copy case finds nothing lethal, so this is a no-op for it).
  const lethal = destroyLethalCreatures(next);
  return checkDiesTriggers(lethal.state, lethal.dead);
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
    // Clone (CR 707.9): the permanent enters AS A COPY of a creature chosen as it enters. Suspend
    // on a resolution-time choice (the player picks which creature; Expert/AI auto-pick) — the
    // same pendingChoice seam the tutor uses. With no legal target (no creatures), a clone just
    // enters as itself (a 0/0 → dies), so we only pause when there's something to copy.
    if (isCloneCard(card)) {
      const spec = parseCloneSpec(card);
      const candidates = cloneCandidates(state, controller, spec.scope);
      if (candidates.length > 0) {
        return setPendingCloneChoice(state, {
          controller,
          candidates,
          sourceName: card?.name || null,
          resume: { cloneCard: card, controller },
        });
      }
      // No creature to copy: the clone enters as itself (a 0/0) and dies (CR 704.5f).
      const entered = enterPermanent(state, card, controller);
      const lethal = destroyLethalCreatures(entered);
      return checkDiesTriggers(lethal.state, lethal.dead);
    }
    return enterPermanent(state, card, controller);
  },

  // Aura spell resolving (CR 303.4f): the Aura enters the battlefield attached to the
  // creature it targeted at cast. Re-check legality at resolution (CR 608.2b): the target
  // must still be a creature on a battlefield. If it's gone/illegal, the Aura spell doesn't
  // resolve — it's put into its owner's graveyard by game rules (CR 608.3b) and never
  // enters (logged, never fabricated). The targetId is a battlefield permanent id.
  [RESOLVER_KEYS.AURA_ETB]: (state, obj) => {
    const { card, controller, targetId } = obj.payload?.params || {};
    if (!card || !controller) return resolveManual(state, obj);
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    if (!tgt || !/Creature/.test(tgtType)) {
      return logEvent(state, { kind: "spell-fizzle", source: card?.name, reason: "aura target illegal", controller });
    }
    return enterPermanent(state, card, controller, { attachTo: targetId });
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

  // P2.2: the EffectProgram interpreter. Runs an ordered Atom[] in printed order
  // when the program is high-confidence; a low-confidence (unmodeled) program runs
  // ZERO atoms and routes to the Arbiter seam (all-or-nothing). Additive — never
  // overloads spell.effect.
  [RESOLVER_KEYS.EFFECT_PROGRAM]: (state, obj) => runEffectProgram(state, obj),

  // Equip/Aura attach (CR 701.3): move the equipment onto the target creature. Re-checks
  // legality at resolution (CR 608.2b) — the source + target must still be on the
  // battlefield, both controlled by the activating player, the target a creature; an
  // illegal target makes the ability do nothing (logged, never fabricated).
  [RESOLVER_KEYS.ATTACH]: (state, obj) => {
    const { sourceId, targetId, controller } = obj.payload?.params || {};
    const src = findPermanent(state, sourceId);
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    if (!src || !tgt || src.controller !== controller || tgt.controller !== controller || !/Creature/.test(tgtType)) {
      return resolveManual(state, obj);
    }
    return logEvent(attachPermanent(state, { equipId: sourceId, targetId }), {
      kind: "attach", source: src.permanent.card?.name, target: tgt.permanent.card?.name, controller,
    });
  },

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
