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

import { createPermanent, mintId, logEvent, findPermanent, attachPermanent, destroyLethalCreatures, castsAsPlaneswalker, moveCardToZone, tapPermanent, recordGraveyardEvents, updatePermanentSafe } from "./gameState.js";
import { queueEvokeSacrifice, checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkLandfallTriggers } from "./triggers.js";
import { applyEnterReplacements, settleEnterReplacements, sagaEntryChapterTriggers } from "./enterReplacements.js"; // the entry replacements (CR 614.1c, 614.1d, 614.12) — the ONE reader the cast entry and the non-cast entry (zones.enterCardFromZone) share
import { markPendingArbiter } from "./pendingArbiter.js";
import { runEffectProgram, finishSpellResolution } from "./effects/runProgram.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { isCloneCard, parseCloneSpec, cloneCandidates, cloneMvCap, snapshotCopiedCard, autoPickCloneCandidate, cloneWidenedCopiable, enteredThisTurnCopiable } from "./cloneCopy.js"; // + cloneWidenedCopiable (KN-2) + enteredThisTurnCopiable (shelf D36)
import { setPendingCloneChoice, clearPendingChoice } from "./pendingChoice.js";
import { isNativeManaAura, auraChoosesColorOnEnter, parseSoulbondBond } from "./staticAbilityParser.js"; // AURA-LAND-MANA-BOOST + CHOSEN-COLOR (Utopia Sprawl) — the Aura spell's host re-check; SOULBOND (BLITZ SL-1) — the modeled bond reader
import { equipmentBarredAsCreature, permanentHasCardType, colorsOf, permanentColors } from "./layers.js"; // CR 301.5c — a creature Equipment can't equip (the Equip resolver's guard); + permanentHasCardType (#511): the Aura host re-check reads layer-4 card types; + the colours the CR 608.2b re-checks judge protection against
import { canBeTargetedBy, playerTargetableBy } from "./spellEffects.js"; // the ONE targetability predicate the Aura / Equip offers read — re-asked as those spells and abilities resolve (CR 608.2b, 608.3b)

// Re-export the P2.1 seam marker from its leaf module (it moved out of this file
// in P2.2 so the effect interpreter can share it without an import cycle).
export { markPendingArbiter } from "./pendingArbiter.js";

// The canonical resolver-key contract lives in its leaf module (P·23 — the effect atoms need it and cannot import this
// file without a cycle); re-exported here so every importer is unchanged.
import { RESOLVER_KEYS } from "./resolverKeys.js";
export { RESOLVER_KEYS };

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

// The as-enters choosers (the creature type, the colour) moved with every other entry replacement to enterReplacements.js — one
// copy for the cast entry below and the non-cast entry (zones.enterCardFromZone). Re-exported for their existing importers
// (actionDispatcher's play-land drop).
export { choosesCreatureTypeOnEnter, autoPickManaColor } from "./enterReplacements.js";

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
  const base = {
    ...createPermanent({ id: permId, card, controller, summoningSick: /Creature/.test(typeStr) }),
    enteredOnTurn: s3.turn,
    timestamp: ts,
    // A clone enters carrying a `card` that's the COPIED creature's copiable values, while its
    // ORIGINAL card is stashed here and restored when it leaves the battlefield (CR 707.2 — off
    // the battlefield it's the original card, not the copy). moveCardToZone reads printedCard.
    ...(opts.printedCard ? { printedCard: opts.printedCard } : {}),
    // BESTOW (CR 702.103): a card cast for its bestow cost enters as an Aura flagged `bestowed`. The flag
    // (a) drives the layer-4 Creature-type removal in layers.staticEffectsOf while it's attached, and (b)
    // exempts it from the Aura falls-off-to-graveyard SBA (gameState.detachPermanentFromAll) — it stays on
    // the battlefield and becomes a creature again when its host leaves. A non-bestow permanent omits it.
    ...(opts.bestowed ? { bestowed: true } : {}),
    // PLAYER-AURA (Fraying Sanity — SHELF S7, CR 303.4): the enchanted PLAYER's id, stamped durably (the
    // attachments machinery is untouched — no host permanent). Read by the enchanted-player effect
    // referents and swept to the graveyard by the elimination pass when that player leaves the game.
    ...(opts.enchantedPlayerId ? { enchantedPlayerId: opts.enchantedPlayerId } : {}),
    // ANIMATE DEAD (play-weighted P·12, CR 303.4): the graveyard card a reanimation Aura enchants as it enters — { cardId,
    // ownerId }. Read and cleared by its ETB (effects/atoms/animateDead.js).
    ...(opts.enchantedGraveyardCard ? { enchantedGraveyardCard: opts.enchantedGraveyardCard } : {}),
    // KICKER (CR 702.33b/e): stamp the was-kicked flag DURABLY on the permanent when this cast paid the kicker
    // (opts.kicked, threaded from the kicked cast). Mirrors how `xValue` / `chosenType` persist — a plain
    // boolean that serializes via the JSON pass-through. Read back by the "it was kicked" intervening-if
    // (interveningIf.js, keyed on ctx.triggeringPermanentId) so a kicked ETB trigger ("When this creature
    // enters, if it was kicked, <effect>" — Goblin Ruinblaster) fires its payoff at BOTH the flush check and
    // the resolution re-check (CR 603.4). The enters-with-+1/+1-counters kicked payoff still reads opts.kicked
    // directly (enterReplacements) — this flag is the ADDITIONAL hook the trigger/spell pipelines need. A normal cast omits it.
    ...(opts.kicked ? { wasKicked: true } : {}),
    // MULTIKICKER (CR 702.33c/d, P·15): how many times the cast was kicked, durable on the permanent — the count its
    // own payoffs read (countForSpec's timesKicked kind: an ETB's "for each time it was kicked", via the trigger's
    // self context). A permanent that wasn't cast, or was cast unkicked, omits it (read as 0).
    ...(opts.timesKicked > 0 ? { timesKicked: opts.timesKicked } : {}),
    // CAST-vs-PUT (CR 603.2) — stamp HOW this permanent arrived, for the "if you cast it" intervening-if
    // (Tiamat, Zacama, Primal Calamity). Set ONLY by the two CAST resolvers (PERMANENT_ETB / AURA_ETB);
    // every other entry route — reanimation, put-onto-the-battlefield, blink, a token copy — leaves it
    // unset, so the condition reads false and the trigger correctly does not fire. Mirrors `wasKicked`
    // exactly: a per-permanent fact about the cast, durable on the object, JSON-serializable.
    ...(opts.wasCast ? { wasCast: true } : {}),
    // CAST-DURING-MAIN-PHASE (SHELF-85 · Light-Paws L4 Sentinel's Mark, 2026-09-05 — the Addendum "if you cast it during your
    // main phase"): stamped by the cast chokepoint beside castFromZone, carried here by the two CAST resolvers; every other
    // entry route leaves it unset, so the look-back reads false.
    ...(opts.castDuringMainPhase ? { castDuringMainPhase: true } : {}),
    ...(opts.castForNoMana ? { castForNoMana: true } : {}), // SATORU (BI-5): cast, but for no mana (free / pitch / alt cost)
    ...(opts.evoked ? { evoked: true } : {}), // EVOKE (Solitude): its evoke cost was paid — the sacrifice trigger is queued as it enters
    ...(opts.escaped ? { escaped: true } : {}), // ESCAPE (P·29, CR 702.138b): cast with escape — "sacrifice it unless it escaped" reads it
    // CAST-FROM-ZONE (CR 601.2 / 400.7) — WHICH zone this permanent's spell was cast from, for the
    // "if you cast it from your hand" ETB rider (Furnace Dragon, Reiver Demon, Angel of the Dire Hour,
    // Wakening Sun's Avatar, Coal Stoker). A per-PERMANENT fact about HOW the object arrived, so it lives
    // beside wasCast for exactly the same reason.
    // ⛔ STAMPED ONLY BY THE CAST RESOLVERS. A permanent put onto the battlefield any other way —
    // reanimated, blinked, cheated in with Show and Tell — never gets it, so the rider reads false and the
    // trigger correctly does not fire. Defaulting an absent value to "hand" would hand every reanimation
    // effect the payoff the printed rider exists to deny.
    ...(opts.castFromZone ? { castFromZone: opts.castFromZone } : {}),
    // ⭐ COLOURS SPENT (CR 702.44a sunburst / converge) — how many COLOURS of mana paid for this permanent's
    // spell, captured off the payment plan at cast time. Lives beside wasCast/castFromZone for the same
    // reason: a per-permanent fact about HOW the object arrived, JSON-serializable, read at ETB.
    // ⛔ `!= null` RATHER THAN TRUTHY, and the difference is a real card. A mono-coloured-cost spell paid
    // entirely with generic-eating colourless mana spends ZERO colours, and `0` is the CORRECT answer —
    // a truthy check would drop the stamp and leave the rider reading "unknown" instead of "none".
    ...(opts.colorsSpent != null ? { colorsSpent: opts.colorsSpent } : {}),
    // SPENT PIPS (shelf D4) — the per-colour tally of the mana spent to cast it ({W,U,B,R,G,C}, off the dispatcher's payment
    // plan), read by "if {R}{R} was spent to cast it". Absent when the permanent wasn't cast, or was cast for an
    // alternative cost whose mana the engine doesn't tally.
    ...(opts.manaSpentByColor ? { manaSpentByColor: opts.manaSpentByColor } : {}),
    // GRANTED DIES-EXILE (RIVAZ, 2026-08-15) — the cast-trigger grant 'it gains "When this creature dies,
    // exile it."' stamped on the SPELL's stack payload rides here onto the permanent (the castFromZone
    // pattern exactly). Read by the dies path: the card exiles from the graveyard after death processing.
    ...(opts.grantDiesExile ? { grantDiesExile: true } : {}),
    // ANOTHER PLAYER'S CARD (shelf D3, Ragavan): a spell cast from its owner's exile enters under the caster's control
    // and stays its owner's — the same `owner` stamp enterCardFromZone writes, which every leave-the-battlefield move
    // already reads to send the card home (gameState.moveCardToZone). Absent ⇒ owner === controller.
    ...(opts.owner && opts.owner !== controller ? { owner: opts.owner } : {}),
  };
  // THE ENTRY REPLACEMENTS (CR 614.1c, 614.1d, 614.12) — the tapped status, the counters it enters with (loyalty, +1/+1,
  // −1/−1, X, sunburst, Saga lore, fade, named, conditional, choice, metric, others', riot) and the as-enters choices
  // (creature type, colour, tribute) — read by enterReplacements.applyEnterReplacements, the ONE reader the non-cast entry
  // (zones.enterCardFromZone) shares, so a reanimated permanent enters exactly as a cast one would. Only the cast facts are
  // this path's own (opts: the cast's X, its kicks, the colours spent, the zone it was cast from, a clone copy's extra
  // counter). `s3` is the pre-entry board: the spell is resolving, so its card is in no zone and the permanent is not on the
  // battlefield yet (an "other" count never sees it; it never doubles its own entry counters, CR 616).
  const { perm, settle } = applyEnterReplacements(s3, base, opts);
  let next = {
    ...s3,
    players: {
      ...s3.players,
      [controller]: { ...player, battlefield: [...player.battlefield, perm] },
    },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller });
  // What the replacements decided that lands once the permanent is on the battlefield: the shockland's life payment, the
  // CR 122.6 counter events of the counters it entered with, riot's haste, Fabricate's Servos (enterReplacements).
  next = settleEnterReplacements(next, perm, settle);
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
  if (opts.evoked) afterEtb = queueEvokeSacrifice(afterEtb, perm); // EVOKE (CR 702.74): queued UNDER the card's own ETB (resolves after it)
  // LIVING WEAPON — the Germ token ALSO entered (CR 702.92), so it fires creature-ETB watchers too (Soul
  // Warden / Cathars' Crusade / subtype-ETB off the Germ). Without this the LW token bypassed every ETB
  // trigger — the same gap the create-token atom had (#345). Fire it after the equipment's own ETB.
  if (lwTokenId) {
    const tok = findPermanent(afterEtb, lwTokenId);
    if (tok?.permanent) afterEtb = checkEnterTriggers(afterEtb, tok.permanent);
  }
  // SAGA (CR 714.3a): the entry lore counter(s) fire every chapter crossed from 0 — chapter I normally;
  // I AND II under a Doubling Season entry (the counter write routed through the doubler). The same call the non-cast entry makes.
  afterEtb = sagaEntryChapterTriggers(afterEtb, perm);
  // SOULBOND auto-pair (BLITZ SL-1, CR 702.95a) — after every creature entry, attempt the deterministic pairing.
  return maybeAutoPairSoulbond(checkPermanentEntersTriggers(afterEtb, perm), perm.id);
}

// SOULBOND auto-pair (BLITZ SL-1, CR 702.95a) — the two soulbond triggered abilities, modeled as a DETERMINISTIC
// ETB pairing (the bond is beneficial, so auto-pairing when able is a safe policy; a human-interactive "you may
// pair" choice is a deferred PLAY-API change). Fired at EVERY creature ETB. POLICY: pair the entering creature
// with the FIRST eligible unpaired creature the SAME controller controls, in battlefield iteration order —
// where AT LEAST ONE of the pair is a soulbond creature whose bond we MODEL (parseSoulbondBond non-null). A
// soulbond carrier whose bond we can't model (Doom Weaver's quoted trigger) never pairs, so its whole card
// stays Arbiter's (no half-modeled state). Both must be unpaired (CR 702.95d — one partner only). Pure.
function isCreaturePerm(p) {
  return /\bCreature\b/.test(String(p?.card?.type || p?.card?.type_line || ""));
}
function modelableSoulbondPerm(p) {
  return isCreaturePerm(p) && !!parseSoulbondBond(p?.card);
}
function maybeAutoPairSoulbond(state, enteredPermId) {
  const lk = findPermanent(state, enteredPermId);
  if (!lk) return state;
  const entered = lk.permanent;
  if (entered.soulbondPartner || !isCreaturePerm(entered)) return state; // already paired (CR 702.95d) or not a creature
  const bf = state.players[entered.controller]?.battlefield || [];
  let partnerId = null;
  if (modelableSoulbondPerm(entered)) {
    // The entrant is a modelable soulbond creature → pair it with the first unpaired creature it controls.
    const cand = bf.find((p) => p.id !== entered.id && isCreaturePerm(p) && !p.soulbondPartner);
    if (cand) partnerId = cand.id;
  } else {
    // The entrant is a plain creature → pair it with the controller's first unpaired MODELABLE soulbond creature.
    const cand = bf.find((p) => p.id !== entered.id && !p.soulbondPartner && modelableSoulbondPerm(p));
    if (cand) partnerId = cand.id;
  }
  if (!partnerId) return state;
  let next = updatePermanentSafe(state, entered.id, (p) => ({ ...p, soulbondPartner: partnerId }));
  next = updatePermanentSafe(next, partnerId, (p) => ({ ...p, soulbondPartner: entered.id }));
  return logEvent(next, { kind: "soulbond-paired", controller: entered.controller, a: entered.id, b: partnerId, cardName: entered.card?.name || null });
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
 * ADVENTURE (CR 715.3d): put the just-resolved adventure card into its owner's exile, flagged `_onAdventure`
 * so legalChoices offers the CREATURE half as a cast from exile. `card` is the FULL combined card (it left
 * hand at cast and lived only on the stack object); we clear any prior _onAdventure stamp defensively and add
 * it. Idempotent on the flag. Pure (returns new state). No SBA/trigger fires from this move (it's a spell
 * leaving the stack to exile, not a permanent leaving the battlefield).
 */
export function applyAdventureExile(state, { playerId, card }) {
  if (!card || !playerId) return state;
  const player = state.players?.[playerId];
  if (!player) return state;
  const exiledCard = { ...card, _onAdventure: true };
  const next = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, exile: [...(player.exile || []), exiledCard] },
    },
  };
  return logEvent(next, { kind: "adventure-exile", playerId, cardName: card.name });
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
  const { cloneCard, controller, riders = [], optional, scope, printedCard, owner, escaped } = pc.resume || {}; // printedCard: V1 slice 3 (Glasspool Mimic's real two-face card); owner: shelf D3 (a clone cast from its owner's exile)
  let next = clearPendingChoice(state);
  if (!cloneCard || !controller) return next;

  // A clone with the "creature or planeswalker" scope (Spark Double) may copy a PLANESWALKER too (front-face,
  // CR 712.4a). A copied planeswalker enters with its starting loyalty via enterPermanent's castsAsPlaneswalker
  // path, so it's a real, non-dying permanent (NOT a 0/0). Front-face only: a creature-front DFC copies as its
  // creature side. (creature-clones still copy creatures; this only WIDENS what a PW-scope clone accepts.)
  // A clone with the "artifact or creature" scope (Phyrexian Metamorph) may copy a NON-creature ARTIFACT too
  // (front-face, CR 712.4a) — the resolution-time re-check (CR 707.9c) must accept an artifact source for that
  // scope, else a valid artifact pick would be treated as illegal and the clone would wrongly enter as a 0/0
  // (a forbidden FP). Scope-gated so a creature-only / PW clone still rejects an artifact source.
  // Resolution-time source re-check (CR 707.9c), SCOPE-GATED so it exactly mirrors cloneCandidates (defense-in-
  // depth: production callers already constrain the pick to the enumerated candidates, but a re-check looser than
  // enumeration is a latent footgun — a future unvalidated caller could copy an illegal source). Per scope:
  //   anyEquipment — ONLY an Equipment artifact (Masterwork of Ingenuity); a bare artifact/creature is illegal.
  //   anyArtifact  — ONLY an artifact (Sculpting Steel / Copy Artifact); a non-artifact creature is illegal.
  //   anyArtifactOrCreature — an artifact OR a creature (Phyrexian Metamorph).
  //   creature / PW scopes — a creature, plus a planeswalker for the youControlCreatureOrPw scope (Spark Double).
  const copiable = (c) => {
    if (!c) return false;
    const tl = String(c?.permanent?.card?.type || c?.permanent?.card?.type_line || "").split(" // ")[0];
    if (scope === "anyEquipment") return /Artifact/.test(tl) && /\bEquipment\b/.test(tl);
    if (scope === "anyArtifact") return /Artifact/.test(tl);
    if (scope === "anyEnchantment" || scope === "anyNonlandPermanent") return cloneWidenedCopiable(c.permanent.card, scope); // KN-2
    if (scope === "anyPermanentEnteredThisTurn") return enteredThisTurnCopiable(next, c.permanent); // shelf D36 (Sakashima's Protege)
    if (scope === "opponentCreature") return /Creature/.test(tl) && c.permanent.controller !== controller; // KN-3 (Imposter Mech): never your own
    return /Creature/.test(tl) || (scope === "youControlCreatureOrPw" && /Planeswalker/.test(tl)) || (scope === "anyArtifactOrCreature" && /Artifact/.test(tl));
  };
  let chosen = chosenPermId ? findPermanent(next, chosenPermId) : null;
  // WI-2 (CREED — CR 707.9): a MANDATORY clone ("~ enters as a copy of …", no "you may") cannot
  // decline. A null/stale submit while at least one OFFERED candidate is still on the battlefield
  // falls back to the deterministic auto-pick — entering a mandatory clone as an illegal 0/0 would
  // be playing the card wrong (a forbidden FP). Genuinely-empty candidates keep the enters-as-itself
  // path below (CR 707.9c: nothing to copy). `optional === false` only — an old serialized save
  // (no `optional` on the resume) keeps the historical declinable behavior.
  if (optional === false && !copiable(chosen)) {
    const fallbackId = autoPickCloneCandidate(next, pc);
    if (fallbackId) chosen = findPermanent(next, fallbackId);
  }
  const chosenIsCopiable = copiable(chosen);
  if (chosen && chosenIsCopiable) {
    // Snapshot the copiable values + apply the CARD-LEVEL "except …" copy modifications (CR 707.9): added
    // subtype, granted keyword, set P/T, conditional vanishing all bake into the copy's card. The
    // entersWithCounterIf / noop riders are NOT card-level (a counter lives on the permanent; isn't-legendary is
    // unenforced) — they're filtered out here so snapshotCopiedCard only sees card riders.
    const cardRiders = riders.filter((r) => r.kind !== "entersWithCounterIf" && r.kind !== "noop");
    const copied = snapshotCopiedCard(chosen.permanent, cloneCard, cardRiders);
    // CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c) — resolve the gate against the COPIED
    // card's resulting type (creature copy → +1/+1; planeswalker copy → loyalty) and pass the concrete counter
    // to enterPermanent so it's applied AS the permanent enters (before the lethal SBA + before ETB triggers
    // see it), exactly like every other enters-with-counter replacement. A non-matching condition adds nothing.
    const extraCounter = resolveCloneEntersCounter(riders, copied);
    next = enterPermanent(next, copied, controller, { printedCard: printedCard || cloneCard, extraCounter, ...(owner ? { owner } : {}), ...(escaped ? { escaped: true } : {}) });
  } else {
    // Declined, or the target is gone/illegal — the clone enters as itself (a 0/0).
    next = enterPermanent(next, cloneCard, controller, { ...(printedCard ? { printedCard } : {}), ...(owner ? { owner } : {}) });
  }
  // A clone that copied nothing is a 0/0 and dies immediately (CR 704.5f) — run the lethal SBA
  // (the copy case finds nothing lethal, so this is a no-op for it).
  const lethal = destroyLethalCreatures(next);
  return checkDiesTriggers(lethal.state, lethal.dead);
}

/**
 * CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c) — given the clone's riders and the
 * COPIED card, return the single { type, n } counter the matching condition adds (a creature copy gets the
 * "+1/+1 if it's a creature" rider, a planeswalker copy the "loyalty if it's a planeswalker" rider), or null
 * when no condition matches. The gate reads the copy's FRONT face (CR 712.4a) via castsAsPlaneswalker /
 * the Creature type line, so a creature-front DFC copy is treated as a creature. At most one rider matches
 * (the copy is one type), so the first match wins. Pure card read.
 */
function resolveCloneEntersCounter(riders, copiedCard) {
  const isPw = castsAsPlaneswalker(copiedCard);
  const isCreature = /\bCreature\b/.test(String(copiedCard?.type || copiedCard?.type_line || "").split(" // ")[0]);
  for (const r of riders || []) {
    if (r.kind !== "entersWithCounterIf") continue;
    if (r.ifType === "creature" && isCreature) return { type: r.counterType, n: r.n };
    if (r.ifType === "planeswalker" && isPw) return { type: r.counterType, n: r.n };
  }
  return null;
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

  [RESOLVER_KEYS.PERMANENT_ETB]: (state, obj) => {
    // `printedCard` (V1 slice 3): the REAL two-face card behind a modal-DFC FACE cast — stamped on the entering permanent
    // so every zone move restores the whole card (moveCardToZone reads printedCard; the clone precedent).
    const { card, controller, xValue, kicked, timesKicked, castFromZone, colorsSpent, grantDiesExile, printedCard, manaSpent, evoked, castDuringMainPhase, manaSpentByColor, escaped } = obj.payload?.params || {}; // + manaSpent (Satoru, BI-5) + evoked (Solitude) + castDuringMainPhase (Sentinel's Mark) + manaSpentByColor (shelf D4)
    if (!card || !controller) return resolveManual(state, obj);
    // Clone (CR 707.9): the permanent enters AS A COPY of a creature chosen as it enters. Suspend
    // on a resolution-time choice (the player picks which creature; Expert/AI auto-pick) — the
    // same pendingChoice seam the tutor uses. With no legal target (no creatures), a clone just
    // enters as itself (a 0/0 → dies), so we only pause when there's something to copy.
    if (isCloneCard(card)) {
      const spec = parseCloneSpec(card);
      // MV-LIMITED clone (Mockingbird): "copy any creature with mana value ≤ the mana spent to cast
      // this". The cap = the clone's fixed pips + the value paid for {X} (threaded as xValue). null
      // for an unrestricted clone. The candidate list is filtered here so the picker only ever offers
      // legal targets; the riders ride in the resume so resolveCloneChoice applies them to the copy.
      const mvCap = cloneMvCap(card, spec, xValue);
      const candidates = cloneCandidates(state, controller, spec.scope, mvCap);
      if (candidates.length > 0) {
        // WI-2 (CR 707.9): thread the parsed mandatory-ness. `optional:false` ("~ enters as a copy
        // of …", no "you may") means the copy choice CANNOT be declined — the pilot seam drops the
        // null action, the UI hides the decline button, and resolveCloneChoice auto-picks on a
        // null/stale submit. Top-level for the UI panel; on the resume for the settle path.
        return setPendingCloneChoice(state, {
          controller,
          candidates,
          sourceName: card?.name || null,
          optional: spec.optional,
          resume: { cloneCard: card, controller, riders: spec.riders, optional: spec.optional, scope: spec.scope, ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}), ...(escaped ? { escaped: true } : {}) },
        });
      }
      // No creature to copy: the clone enters as itself (a 0/0) and dies (CR 704.5f).
      const entered = enterPermanent(state, card, controller, { ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}) });
      const lethal = destroyLethalCreatures(entered);
      return checkDiesTriggers(lethal.state, lethal.dead);
    }
    return enterPermanent(state, card, controller, { xValue, kicked, timesKicked, wasCast: true, castFromZone, castDuringMainPhase: !!castDuringMainPhase, colorsSpent, grantDiesExile, castForNoMana: manaSpent === false, evoked: !!evoked, escaped: !!escaped, ...(manaSpentByColor ? { manaSpentByColor } : {}), ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}) }); // owner: shelf D3 — a spell cast from its owner's exile (the stack object's stamp)
  },

  // Aura spell resolving (CR 303.4f): the Aura enters the battlefield attached to the
  // creature it targeted at cast. Re-check legality at resolution (CR 608.2b): the target
  // must still be a creature on a battlefield. If it's gone/illegal, the Aura spell doesn't
  // resolve — it's put into its owner's graveyard by game rules (CR 608.3b) and never
  // enters (logged, never fabricated). The targetId is a battlefield permanent id.
  [RESOLVER_KEYS.AURA_ETB]: (state, obj) => {
    const { card, controller, targetId, bestowed, enchantsPlayer, enchantsGraveyardCard, hostType, kicked, printedCard, castDuringMainPhase } = obj.payload?.params || {}; // printedCard: V1 slice 3 (a modal-DFC Aura front — Glasswing Grace); castDuringMainPhase: Sentinel's Mark's Addendum look-back
    if (!card || !controller) return resolveManual(state, obj);
    // PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4): the target is a PLAYER.
    // Re-check at resolution (CR 608.2b — the player may have been eliminated); gone → the Aura card
    // reaches its owner's graveyard (CR 608.3b, the same fizzle as a vanished creature target). Enters
    // UNATTACHED to any permanent, with `enchantedPlayerId` stamped for the enchanted-player referents.
    // ANIMATE DEAD (play-weighted P·12): the target is a creature CARD in a graveyard. Still there (CR 608.2b) → the Aura enters
    // attached to no permanent, stamped with it; its ETB returns the card and attaches. Gone → the spell fizzles (CR 608.3b).
    if (enchantsGraveyardCard) {
      const link = enchantsGraveyardCard;
      const still = (state.players?.[link.ownerId]?.graveyard || []).some((c) => c.id === link.cardId);
      if (!still) {
        return logEvent(finishSpellResolution(state, { playerId: obj.owner || controller, card }), { kind: "spell-fizzle", source: card?.name, reason: "enchanted card left the graveyard", controller });
      }
      return enterPermanent(state, card, controller, { enchantedGraveyardCard: { cardId: link.cardId, ownerId: link.ownerId }, wasCast: true, ...(obj.owner ? { owner: obj.owner } : {}) });
    }
    if (enchantsPlayer) {
      // CR 608.3b / 608.2b — still in the game AND still targetable by this Aura spell: the offer's playerTargetableBy (shroud,
      // hexproof, protection from everything, hexproof from colours), read against the Aura's own colours, which are definite
      // here — the offer, threading none, refuses every hexproof-from-colours player.
      if (!state.players?.[targetId] || !playerTargetableBy(state, targetId, controller, colorsOf(card))) {
        return logEvent(finishSpellResolution(state, { playerId: obj.owner || controller, card }), { kind: "spell-fizzle", source: card?.name, reason: "enchanted player gone", controller });
      }
      return enterPermanent(state, card, controller, { enchantedPlayerId: targetId, ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}) });
    }
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    // AURA-LAND-MANA-BOOST: a land-enchant mana Aura (Wild Growth / Overgrowth / Fertile Ground) must
    // still be attached to a LAND at resolution; every other native Aura enchants a Creature. The
    // required target type follows the card (single source of truth — isNativeManaAura), so the
    // creature path stays byte-identical.
    // CHOSEN-COLOR (Utopia Sprawl) enchants the FOREST subtype specifically, so its resolution re-check
    // requires a Forest (CR 303.4h — an Aura whose enchant restriction its target no longer meets isn't put
    // onto the battlefield). A bare land-mana Aura requires any Land; a creature Aura requires a Creature.
    // GRANT-AURA CAST (BLITZ TS-1): a grant-family Aura cast stamps its host type onto the SERIALIZABLE
    // payload (actionDispatcher, from the shared grantAuraCastHostType gate) — the CR 608.2b re-check
    // requires that type ("Enchant land" must still point at a Land). Legacy payloads carry no hostType
    // and keep the original mana-aura/creature derivation byte-identical.
    // ES-1 (2026-08-05): the NON-CREATURE host types. This re-check defaulted to /Creature/ for every
    // hostType it didn't recognise, so the moment an "Enchant artifact" Aura became native its cast would
    // have FIZZLED here — spell to the graveyard, nothing on the battlefield, and the coverage metric
    // claiming the card plays. That is the silent-do-nothing the CREED forbids, and it is why this seam
    // was mapped before the parser was touched rather than discovered afterwards.
    // ⛔ A LOOKUP, NOT A NINTH TERNARY. This started as two branches and reached eight; at that depth the
    // `else` tail is genuinely hard to see, and the tail is the DANGEROUS part — it is the /Creature/
    // default that silently fizzled every non-creature host before ES-1. A miss here still falls to that
    // default, so the table keeps ONE key per targetType auraEnchantHostSpec can emit and nothing else.
    // nonlandPermanent is a NEGATIVE requirement, hence a lookahead rather than a type name; `.test()`
    // against the host's type line is the same contract either way.
    const HOST_TYPE_RE = {
      land: /Land/, creature: /Creature/, artifact: /Artifact/,
      creatureOrArtifact: /Creature|Artifact/, creatureOrVehicle: /Creature|Vehicle/,
      nonlandPermanent: /^(?!.*\bLand\b)/, creatureOrPlaneswalker: /Creature|Planeswalker/,
      artifactCreatureOrPlaneswalker: /Artifact|Creature|Planeswalker/,
    };
    const requiredType = HOST_TYPE_RE[hostType]
      || (isNativeManaAura(card) ? (auraChoosesColorOnEnter(card) ? /Forest/ : /Land/) : /Creature/);
    // #511 — the host-type read the cast enumerated with (spellEffects' PERMANENT_PREDICATES `has`): an Artifact a layer-4
    // effect added satisfies the artifact hosts (a creature Liquimetal Torque made an artifact is a legal "Enchant artifact"
    // host), and a Land one added breaks "nonland permanent" (CR 613.1d). Offer and re-check read the same characteristics.
    const layerArtifactHost = !!tgt && (hostType === "artifact" || hostType === "creatureOrArtifact" || hostType === "artifactCreatureOrPlaneswalker")
      && permanentHasCardType(state, tgt.permanent.id, "Artifact");
    const layerLandBreaksNonland = !!tgt && hostType === "nonlandPermanent" && permanentHasCardType(state, tgt.permanent.id, "Land");
    // CR 608.3b / 608.2b — the host must also still be TARGETABLE by this Aura spell: hexproof, shroud, protection from its
    // colour gained in response make the target illegal (Control Magic on a creature that gained hexproof does not resolve).
    // The same canBeTargetedBy call, with the same colours, every Aura offer enumerated its hosts through (legalChoices).
    if (!tgt || layerLandBreaksNonland || !(requiredType.test(tgtType) || layerArtifactHost)
      || !canBeTargetedBy(state, tgt.permanent, tgt.controller, controller, colorsOf(card))) {
      // BESTOW (CR 702.103e, 608.3b): a bestowed Aura spell whose target is illegal as it begins resolving — gone, or no
      // longer targetable — ceases to be bestowed and continues resolving as a CREATURE spell: it enters unattached, a
      // creature, and never goes to the graveyard. (This branch used to fizzle it, citing a superseded rule.)
      if (bestowed) return enterPermanent(state, card, controller, { wasCast: true, ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}) });
      // GY-2 (CR 608.3b): the fizzled Aura CARD reaches its owner's graveyard (it used to vanish).
      return logEvent(finishSpellResolution(state, { playerId: obj.owner || controller, card }), { kind: "spell-fizzle", source: card?.name, reason: "aura target illegal", controller }); // obj.owner: shelf D3 — a fizzled Aura cast from its owner's exile goes to THEIR graveyard
    }
    // BESTOW: thread `bestowed` so enterPermanent flags the permanent (layer-4 Creature-type removal while
    // attached + the falls-off SBA exemption). A printed Aura passes bestowed=undefined → identical path.
    // ④-J KICKER (CR 702.33b/e): a kicked Aura cast stamps wasKicked on the entering Aura (enterPermanent), so
    // its own "When this Aura enters, if it was kicked, …" trigger fires (Bubble Snare taps the host).
    // wasCast + castDuringMainPhase (Sentinel's Mark, 2026-09-05): an Aura spell resolving IS a cast (CR 303.4f) — stamp it like
    // the permanent resolver does, so the Aura's own ETB look-backs can read how and when it arrived.
    return enterPermanent(state, card, controller, { attachTo: targetId, bestowed, wasCast: true, ...(castDuringMainPhase ? { castDuringMainPhase: true } : {}), ...(kicked ? { kicked: true } : {}), ...(printedCard ? { printedCard } : {}), ...(obj.owner ? { owner: obj.owner } : {}) });
  },

  // P2.1: a recognized-but-unparseable instant/sorcery. No longer a silent
  // no-op — flag it for the Arbiter seam (structured `spell-unresolved` log +
  // `state.pendingArbiter`) so the player gets a verified ruling instead of the
  // spell quietly doing nothing.
  [RESOLVER_KEYS.SPELL_NOOP]: (state, obj) => {
    const { reason } = obj.payload?.params || {};
    return markPendingArbiter(state, obj, reason || "instant-or-sorcery (no recognized effect)");
  },

  // W4 (DEPRECATED lane — retired): the naive TRIGGER_EFFECT vocabulary was deleted (it drew without
  // firing draw-triggers and resolved damage as plain loseLife — CREED-divergent from the atoms).
  // makePendingTrigger now emits a manual payload directly and the flush stage upgrades faithful
  // triggers to EFFECT_PROGRAM. The key is KEPT for one release so a serialized mid-stack save (or a
  // stray legacy payload) still resolves SAFELY as the Arbiter no-op instead of crashing the registry.
  [RESOLVER_KEYS.TRIGGER_EFFECT]: (state, obj) => resolveManual(state, obj),

  // P2.2: the EffectProgram interpreter — THE live resolution lane. Runs an ordered
  // Atom[] in printed order when the program is high-confidence; a low-confidence
  // (unmodeled) program runs ZERO atoms and routes to the Arbiter seam (all-or-nothing).
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
      // Pass params.context (the bound trigger context) so a per-PERMANENT condition (SAME-NAME ETB —
      // Guardian Project) re-reads the entering permanent at resolution (CR 603.4 second check).
      const ok = evaluateInterveningIf(state, params.condition, params.controller, params.context);
      if (ok !== true) {
        // ADVENTURE: even a condition-not-met adventure spell still EXILES the card (CR 715.3d — the card is
        // exiled as the spell finishes resolving regardless of whether the effect did anything). Apply the
        // exile before returning so the creature half stays castable from exile.
        const skipped = logEvent(state, { kind: "trigger-effect", effect: "intervening-if-not-met", controller: params.controller, condition: params.condition });
        return params.adventureExile ? applyAdventureExile(skipped, params.adventureExile) : skipped;
      }
    }
    // recheckTargets — this is the start of the resolution, so the CR 608.2b re-check asks whether each target is still LEGAL
    // (the predicate that offered it), not just still present (runEffectProgram).
    const next = runEffectProgram(state, obj, { recheckTargets: true });
    // ADVENTURE (CR 715.3d): the adventure spell's card goes to EXILE (not the graveyard like a normal
    // instant/sorcery), flagged `_onAdventure` so the creature half is castable from exile. We append the FULL
    // card (params.adventureExile.card) to the controller's exile here, after the program ran. The card left
    // hand at cast and lives only on the stack object, so this is the move into exile — there's no graveyard
    // disposition to redirect (the engine doesn't track resolved instant/sorcery cards into the graveyard).
    // NOTE: if the program SUSPENDED on a resolution-time choice (a tutor — Fertile Footsteps), `next` carries
    // a pendingChoice and the rest of the atoms run on resume; the exile is applied now regardless. That's safe
    // for the whole clean adventure set — no clean adventure effect targets/references its own card, so the
    // card sitting in exile during the pause changes nothing (verified by the corpus audit).
    if (!params?.adventureExile) return next;
    // A FIZZLED Adventure never resolved (CR 608.2b — every target illegal: "removed from the stack and … put into its
    // owner's graveyard"), and 715.3d replaces only the graveyard "as it resolves" — so the full card goes to its owner's
    // graveyard and the creature is not castable from exile. The fizzle is read off what this resolution logged (the
    // interpreter's entry check is the only "spell-fizzle" a program run writes), never predicted from the board.
    const fizzled = (next.log || []).slice((state.log || []).length).some((e) => e.kind === "spell-fizzle");
    return fizzled ? finishSpellResolution(next, params.adventureExile) : applyAdventureExile(next, params.adventureExile);
  },

  // Equip/Aura attach (CR 701.3): move the equipment onto the target creature. Re-checks
  // legality at resolution (CR 608.2b) — the source + target must still be on the
  // battlefield, both controlled by the activating player, the target a creature; an
  // illegal target makes the ability do nothing (logged, never fabricated).
  [RESOLVER_KEYS.ATTACH]: (state, obj) => {
    const { sourceId, targetId, controller, aura = false } = obj.payload?.params || {};
    const src = findPermanent(state, sourceId);
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    // SHELF-85 V15 (Detainment Spell): an AURA re-attach ("Attach this Aura to target creature") may land on an
    // opponent's creature — Equip's own-creature rule (CR 702.6a) is Equip's alone. The Aura still must be the
    // activator's, and the target a creature (the printed "Enchant creature").
    if (!src || !tgt || src.controller !== controller || (!aura && tgt.controller !== controller) || !/Creature/.test(tgtType)) {
      return resolveManual(state, obj);
    }
    // CR 608.2b — the target must also still be TARGETABLE by this ability: shroud (even on its own controller's creature),
    // hexproof for an Aura moved onto another player's creature, protection from the source's colour. The offer's
    // canBeTargetedBy, read against the source's CURRENT colours (it is on the battlefield, so they are definite).
    if (!canBeTargetedBy(state, tgt.permanent, tgt.controller, controller, permanentColors(state, sourceId))) {
      return logEvent(state, { kind: "spell-fizzle", source: src.permanent.card?.name, reason: "all targets illegal (CR 608.2b)", controller }); // the kind runEffectProgram logs for an ability too
    }
    // CR 301.5c — an Equipment that is a creature RIGHT NOW and has no reconfigure (a crewed Rover Blades paying its own
    // Equip) can't equip a creature: the ability does nothing and the Equipment stays where it is (CR 701.3b). Logged as
    // refused, never as an "attach" — the log narrator reads that kind as one. Reconfigure (Lizard Blades) is the exception.
    // The 09-06 plan's stage ③ · 34, the attach-pair's guard (③ · 33) on the Equip lane.
    if (!aura && equipmentBarredAsCreature(state, sourceId)) {
      return logEvent(state, { kind: "attach-refused", rule: "CR 301.5c", source: src.permanent.card?.name, target: tgt.permanent.card?.name, controller });
    }
    return logEvent(attachPermanent(state, { equipId: sourceId, targetId }), {
      kind: "attach", source: src.permanent.card?.name, target: tgt.permanent.card?.name, controller,
    });
  },

  // GY SELF-RECURSION (BLITZ GY-1, CR 602.2 — Reassembling Skeleton / Sanitarium Skeleton class): the
  // graveyard-activated "Return this card from your graveyard to <your hand | the battlefield [tapped]>".
  // Re-checks the card is STILL in the controller's graveyard at resolution — removed in response, the
  // ability does nothing (a logged fizzle, never a fabricated return). The hand path rides moveCardToZone
  // (its graveyard-LEAVE event fires the gy-event watchers); the battlefield path splices the card, records
  // the same leave event, then enters through the SAME enterPermanent a resolved permanent spell uses (ETB
  // replacements + triggers fire identically), tapping the fresh permanent when the ability says "tapped".
  [RESOLVER_KEYS.GY_SELF_RETURN]: (state, obj) => {
    const { cardId, controller, dest, entersTapped: tapIt } = obj.payload?.params || {};
    const player = state.players?.[controller];
    const card = (player?.graveyard || []).find((c) => c.id === cardId);
    if (!card) return logEvent(state, { kind: "spell-effect", effect: "gy-self-return", controller, fizzled: true });
    if (dest === "hand") {
      const next = moveCardToZone(state, { playerId: controller, fromZone: "graveyard", toZone: "hand", cardId });
      return logEvent(next, { kind: "spell-effect", effect: "gy-self-return", controller, dest: "hand", cardName: card.name });
    }
    const gy = player.graveyard.filter((c) => c.id !== cardId);
    let next = { ...state, players: { ...state.players, [controller]: { ...player, graveyard: gy } } };
    next = recordGraveyardEvents(next, [{ dir: "leave", card, gyOwner: controller, zone: "battlefield" }]);
    next = enterPermanent(next, card, controller);
    if (tapIt) {
      const bf = next.players[controller].battlefield;
      if (bf.length) next = tapPermanent(next, bf[bf.length - 1].id, { fromEnter: true }); // CR 701.26a: re-enters tapped ≠ "becomes tapped" — suppress the event
    }
    return logEvent(next, { kind: "spell-effect", effect: "gy-self-return", controller, dest: "battlefield", cardName: card.name, tapped: !!tapIt });
  },

  // HAND SELF-PUT (play-weighted #570 — Talon Gates of Madara, CR 113.6m): the hand-activated "{N}: Put this card from your
  // hand onto the battlefield." The card stays in its owner's hand while the ability waits on the stack, so it is looked up
  // there again at resolution — discarded or otherwise moved in response, the ability does nothing (a logged fizzle, never a
  // fabricated entry). Otherwise the GY_SELF_RETURN shape: splice the card out of the hand, enter it through the SAME
  // enterPermanent a resolved permanent spell uses (its own enters-tapped / enters-with replacements apply; its enters
  // triggers fire, CR 603.6a), and — a LAND entering — fire landfall, which enterPermanent leaves to its callers. Not a land
  // play: landsPlayedThisTurn is untouched (CR 305.4), and a "whenever you play a land" watcher stays quiet.
  [RESOLVER_KEYS.HAND_SELF_PUT]: (state, obj) => {
    const { cardId, controller } = obj.payload?.params || {};
    const player = state.players?.[controller];
    const card = (player?.hand || []).find((c) => c.id === cardId);
    if (!card) return logEvent(state, { kind: "spell-effect", effect: "hand-self-put", controller, fizzled: true });
    let next = { ...state, players: { ...state.players, [controller]: { ...player, hand: player.hand.filter((c) => c.id !== cardId) } } };
    next = enterPermanent(next, card, controller);
    const bf = next.players[controller].battlefield;
    next = checkLandfallTriggers(next, bf[bf.length - 1]);
    return logEvent(next, { kind: "spell-effect", effect: "hand-self-put", controller, cardName: card.name });
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

// CZ-COMMANDER-VISIT injection (Hellkite Courser, 2026-08-14): hand the atoms leaf the two cross-layer
// doors it must not import statically (zones.js sits under effectAtoms → parser; a static import of this
// module from there TDZ-crashed 56 suites). resolvers.js already imports zones-ward safely at runtime via
// the resolver registry, and layers.js is imported here transitively — registering at THIS module's load
// guarantees the doors exist before any game resolves an atom.
import { registerCzEnterPermanent, registerCzAddContinuousEffect } from "./effects/atoms/zones.js";
import { addContinuousEffect as _czAddContinuousEffect } from "./layers.js";
registerCzEnterPermanent(enterPermanent);
registerCzAddContinuousEffect(_czAddContinuousEffect);
