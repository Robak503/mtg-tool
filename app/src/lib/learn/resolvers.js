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

import { createPermanent, mintId, logEvent, findPermanent, attachPermanent, destroyLethalCreatures, castsAsPlaneswalker, startingLoyalty } from "./gameState.js";
import { resolveSpellEffect } from "./spellEffects.js";
import { applyTriggerEffect, checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers } from "./triggers.js";
import { markPendingArbiter } from "./pendingArbiter.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { isCloneCard, parseCloneSpec, cloneCandidates, snapshotCopiedCard } from "./cloneCopy.js";
import { setPendingCloneChoice, clearPendingChoice } from "./pendingChoice.js";
import { entersWithPlusCounters, entersWithXCounters, entersWithMetricCounters, entersTapped, isNativeManaAura } from "./staticAbilityParser.js"; // TRUNK-ENTERSCOUNTERS (CR 614.1c + 122.6a) + TRUNK-ENTERSTAPPED (CR 614.1c) + ENTERS-WITH-X + ETB-XCOUNTERS-FROM-METRIC + AURA-LAND-MANA-BOOST
import { entersWithFadeCounters } from "./fading.js"; // KW-FADING / KW-VANISHING — enters with N fade/time counters
import { applyCounterDoubling } from "./replacementEffects.js"; // Wave-3 doubler (leaf): enters-with-counters bypasses addCounter, so double here
import { countForSpec } from "./effects/atoms/shared.js"; // ETB-XCOUNTERS-FROM-METRIC: resolve a board-metric counter count (leaf: shared → gameState only)

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
/**
 * LIVING WEAPON (CR 702.92) / FOR MIRRODIN! (CR 702.163) — the Equipment's built-in ETB: create a token,
 * then attach this Equipment to it. The token is fixed by the keyword (a 0/0 black Phyrexian Germ for living
 * weapon; a 2/2 red Rebel for For Mirrodin!), so we don't parse it — we mint the exact token. Returns the token
 * card spec or null. A 0/0 Germ survives because the Equipment's +X/+Y is attached the same instant (CR 613 —
 * the layer engine reads the attached bonus), so it's never a 0-toughness SBA casualty before it's buffed.
 */
function livingWeaponToken(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (/\bliving weapon\b/i.test(oracle)) return { name: "Germ", type: "Creature — Phyrexian Germ", power: 0, toughness: 0, colors: ["B"], token: true };
  if (/\bfor mirrodin!/i.test(oracle)) return { name: "Rebel", type: "Creature — Rebel", power: 2, toughness: 2, colors: ["R"], token: true };
  return null;
}

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
    ...createPermanent({ id: permId, card, controller, tapped: entersTapped(card), summoningSick: /Creature/.test(typeStr) }),
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
  // classifies native and the SBA only kills walkers that entered with one. Use castsAsPlaneswalker
  // (front-face) so a creature-front DFC entering as its creature side never gets a spurious loyalty
  // counter from its planeswalker back face.
  // Wave-3 doubler (CR 616): enters-with-counter writes bypass gameState.addCounter (the permanent is not yet
  // on the battlefield), so each routes through applyCounterDoubling directly. `state` here is pre-entry — it
  // has the controller's doublers (Doubling Season etc.) but NOT this permanent (a permanent never doubles its
  // OWN entry counters, CR 616 — the replacement must already exist). Recipient = the entering permanent's
  // controller. A "+1/+1"-only doubler is skipped for loyalty/fade; Doubling Season (any counter) doubles them.
  if (castsAsPlaneswalker(card)) {
    const loy = startingLoyalty(card);
    if (loy != null) perm.counters = { ...perm.counters, loyalty: applyCounterDoubling(state, controller, "loyalty", loy) };
  }
  // CR 614.1c + 122.6a: "~ enters with N +1/+1 counters on it" — a replacement that adds the counters AS the
  // permanent enters, so its P/T is correct from turn 1 (Kavu Primarch, Avatar of the Resolute…). Only the
  // bare, unconditional, literal-N form (entersWithPlusCounters guards out kicker / "for each" / "where X").
  const plusCounters = entersWithPlusCounters(card);
  if (plusCounters > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", plusCounters) };
  // ENTERS-WITH-X: "this creature enters with X +1/+1 counters on it" — X is the value paid for the {X}
  // cost (threaded as opts.xValue from the cast). A hydra cast for X=5 enters as a real 5/5+, not a 0/0
  // that dies to the lethal-toughness SBA. Guarded by entersWithXCounters so only the literal-X form gets it.
  if (opts.xValue > 0 && entersWithXCounters(card)) {
    perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", opts.xValue) };
  }
  // KW-FADING (CR 702.32a) / KW-VANISHING (CR 702.63a): enters with N fade / time counters; the upkeep
  // remove-or-sacrifice runs in gameEngine (applyFadeVanishUpkeep).
  const fade = entersWithFadeCounters(card);
  if (fade && fade.n > 0) perm.counters = { ...perm.counters, [fade.type]: (perm.counters[fade.type] || 0) + applyCounterDoubling(state, controller, fade.type, fade.n) };
  // ETB-XCOUNTERS-FROM-METRIC (CR 614.1c + 122.6a + 608.2h): enters with +1/+1 counters whose count is a BOARD
  // METRIC — Squad Captain / Sheriff of Safe Passage ("for each other creature you control"), Prime Speaker
  // Zegana ("X = greatest power among other creatures"). The metric is resolved AT THIS MOMENT against the
  // PRE-ENTRY state (the permanent isn't on the battlefield yet, so "other" excludes it naturally; sourceId is
  // threaded for CR 113.7 correctness regardless). Like the fixed-N / enters-with-X writes above, this bypasses
  // gameState.addCounter, so it routes the result through applyCounterDoubling (the Wave-3 doubler) explicitly.
  // A 0-metric leaves a 0/0 that correctly dies to the lethal-toughness SBA (no fabricated floor).
  const metricCtr = entersWithMetricCounters(card);
  if (metricCtr) {
    const ctx = { controller, sourceId: permId };
    const raw = metricCtr.fixed + metricCtr.perUnit * countForSpec(state, ctx, metricCtr.metric);
    if (raw > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", raw) };
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
  // LIVING WEAPON / FOR MIRRODIN! — the Equipment makes its own token and attaches to it (CR 702.92/702.163).
  // Mint the fixed token, put it on the controller's battlefield, then attach THIS Equipment via the shared
  // attachPermanent (the same mechanism Equip / Aura use), so the layer engine buffs the token from this turn.
  const lwToken = livingWeaponToken(card);
  let lwTokenId = null;
  if (lwToken) {
    const { id: tokId, state: ts2 } = mintId(next, "perm");
    const tokPerm = { ...createPermanent({ id: tokId, card: lwToken, controller, summoningSick: true }), enteredOnTurn: ts2.turn, timestamp: ts2.timestampCounter || 0 };
    const ts3 = { ...ts2, timestampCounter: (ts2.timestampCounter || 0) + 1 };
    next = { ...ts3, players: { ...ts3.players, [controller]: { ...ts3.players[controller], battlefield: [...ts3.players[controller].battlefield, tokPerm] } } };
    next = attachPermanent(next, { equipId: permId, targetId: tokId });
    lwTokenId = tokId;
  }
  // Fire ETB triggers now that the permanent is on the battlefield (CR 603.6a). They land in
  // pendingTriggers and flushTriggers puts them on the stack at the next priority-grant checkpoint
  // (which resolveTopOfStack runs after this). `checkEnterTriggers` (triggers.js) is the SINGLE ETB-fire
  // helper, shared with the reanimation atom (β-3b) — so the cast/clone/aura and non-cast entry paths
  // can't drift.
  let afterEtb = checkEnterTriggers(next, perm);
  // LIVING WEAPON — the Germ token ALSO entered (CR 702.92), so it fires creature-ETB watchers too (Soul
  // Warden / Cathars' Crusade / subtype-ETB off the Germ). Without this the LW token bypassed every ETB
  // trigger — the same gap the create-token atom had (#345). Fire it after the equipment's own ETB.
  if (lwTokenId) {
    const tok = findPermanent(afterEtb, lwTokenId);
    if (tok?.permanent) afterEtb = checkEnterTriggers(afterEtb, tok.permanent);
  }
  return checkPermanentEntersTriggers(afterEtb, perm);
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
    const { card, controller, xValue } = obj.payload?.params || {};
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
    return enterPermanent(state, card, controller, { xValue });
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
    // AURA-LAND-MANA-BOOST: a land-enchant mana Aura (Wild Growth / Overgrowth / Fertile Ground) must
    // still be attached to a LAND at resolution; every other native Aura enchants a Creature. The
    // required target type follows the card (single source of truth — isNativeManaAura), so the
    // creature path stays byte-identical.
    const requiredType = isNativeManaAura(card) ? /Land/ : /Creature/;
    if (!tgt || !requiredType.test(tgtType)) {
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
    const { effect, controller, targets = [], context, sourcePermanentId } = obj.payload?.params || {};
    if (!effect) return resolveManual(state, obj);
    // MUST-FIX 3: thread the source permanent so a damage trigger routes through the damage-replacement consult.
    return applyTriggerEffect(state, { effect, controller, context, targets, sourcePermanentId });
  },

  // STUB in PR-1: activated abilities are Phase 2.
  [RESOLVER_KEYS.ACTIVATED_EFFECT]: (state, obj) => resolveManual(state, obj),

  // P2.2: the EffectProgram interpreter. Runs an ordered Atom[] in printed order
  // when the program is high-confidence; a low-confidence (unmodeled) program runs
  // ZERO atoms and routes to the Arbiter seam (all-or-nothing). Additive — never
  // overloads spell.effect.
  //
  // INTERVENING-IF (CR 603.4 resolution re-check) — a conditional trigger bound its interveningIf onto
  // `params.condition` (gameEngine.buildTriggerStack, the general board-query path). Re-evaluate it HERE at
  // resolution: false (condition no longer met, e.g. the artifact was sacrificed in response) OR null
  // (unresolved) → the ability does nothing (CR 603.4 — "if false at resolution, it has no effect"). A win-
  // game atom carries its own condition + re-check inside applyWinGame, so only the GENERAL path sets
  // params.condition; both re-checks are strict (never fail-open).
  [RESOLVER_KEYS.EFFECT_PROGRAM]: (state, obj) => {
    const params = obj.payload?.params;
    if (params?.condition != null) {
      const ok = evaluateInterveningIf(state, params.condition, params.controller);
      if (ok !== true) {
        return logEvent(state, { kind: "trigger-effect", effect: "intervening-if-not-met", controller: params.controller, condition: params.condition });
      }
    }
    return runEffectProgram(state, obj);
  },

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
