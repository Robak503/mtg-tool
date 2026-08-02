/**
 * effects/atoms/selfReturn.js — SELF-LTB-RETURN-TO-HAND (Wave 4).
 *
 * The self-recursion / blink-return family where a permanent's OWN "leaves the battlefield" trigger returns
 * an object that has ALREADY LEFT the battlefield to its OWNER's hand. In the 13 training decks this reduces
 * to exactly TWO live shapes:
 *
 *   (A) AURA self-PiG-return — Rancor: "When this Aura is put into a graveyard from the battlefield, return
 *       it to its owner's hand." "it" = the Aura itself, now sitting in the graveyard.
 *   (B) EQUIPMENT-grants-return-on-equipped-death — Sword of the Realms (Halvar back face): "Whenever
 *       equipped creature dies, return it to its owner's hand." "it" = the dead creature, now in the
 *       graveyard. (The DFC merges to an EMPTY oracle_text and the engine doesn't read card_faces, so the
 *       real Halvar // Sword card stays body-only off face-enrichment — OUT of this slice; this builds the
 *       SUBSYSTEM the back face composes on once faces are enriched.)
 *
 * Both are distinct from the LIVE self-bounce (Zephyr Spirit's "When this creature blocks, return it to its
 * owner's hand" — the source is STILL on the battlefield): those must NOT route here (returning a battlefield
 * permanent from the graveyard would find nothing → a do-nothing native = a forbidden false positive). The
 * disambiguation is upstream in triggers.detectTriggers, which rewrites "return it to its owner's hand" to the
 * kind-tagged marker `[self-return:self|attached] …` ONLY for the two narrow detectors below; the bare clause
 * (Zephyr Spirit, Mortus Strider self-dies-recursion, etc.) is left untouched → unmatched here → unchanged.
 *
 * CR notes honored:
 *   - CR 400.3 / 603.6e: "its owner's hand" — the engine has no explicit owner field and uses `controller`
 *     as the owner proxy (mirrors zones.js's bounce). For the Sword case the returned creature's owner is the
 *     DEAD creature's controller from the dies look-back (ctx.triggeringController), not the equipment's.
 *   - CR 111.7 / 704.5d: a TOKEN ceases to exist and never returns to a hand — guarded via card.token.
 *   - CR 603.10a look-back: the returned object's card id + owner travel on the trigger context
 *     (makePendingTrigger threads triggeringCardId / triggeringController), since the permanent id is stale
 *     once it left the battlefield.
 *
 * CIRCULAR-IMPORT NOTE: imports gameState only (leaf-safe); MUST NOT import effects/parser.js (parser imports
 * the atoms barrel — a back-edge would TDZ-crash at load) and does NOT import triggers.js here. Both registry
 * fns (the trigger detector AND the clause parser) are PURE exports the integrator wires at the bottom of
 * parser.js — parser.js already imports both triggers.detectTriggers and registerClauseParser, so registering
 * there guarantees the detector is installed before ANY classification runs (a self-registration from this
 * atoms module could race a direct `import triggers` + detectTriggers call and miss the WeakMap-cached card).
 */

import { addCounter, logEvent, moveCardToZone, destroyLethalCreatures, attachPermanent, findPermanent } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js"; // PS-1: a 1/1 persister returns 0/0 → the immediate lethal SBA (CR 704.5f) — cycle-safe (triggers doesn't import atoms/selfReturn)
import { enterCardFromZone } from "./zones.js";

/**
 * The two NARROW self-LTB trigger CONDITIONS, classified for detectTriggers' registry seam (consulted only
 * after inline classifyCondition returns null — which it does for both: "equipped creature dies" isn't a
 * modeled creatureSubjectScope, and "is put into a graveyard from the battlefield" is the explicitly
 * un-detected LTB shape). Returns a TriggerDescriptor classification or null.
 *
 *   (A) "this aura is put into a graveyard from the battlefield" (or the card's own name in place of "this
 *       aura" — Eye of Nidhogg-style) → { event: "ltb", scope: "self", selfReturnKind: "self" }. Fired by
 *       triggers.checkLeavesTriggers off the gameState leave-event look-back (toGraveyard only — a bounce/exile
 *       is not a PiG). The `selfReturnKind` marker makes detectTriggers rewrite the effect to the self-return
 *       atom; the effect itself ("return it to its owner's hand") is re-validated there (a rider → no rewrite
 *       → LOW → Arbiter), so this classifier need not see the effect text.
 *   (B) "equipped creature dies" → { event: "dies", scope: "equippedCreature", selfReturnKind: "attached" }.
 *       Rides the existing dies pipeline (checkDiesTriggers); scopeMatches' equippedCreature gate fires it only
 *       when the dead creature WAS this equipment's host (via the dead creature's look-back attachments).
 *
 * ANCHORED exactly (^…$ on the lowercased condition). A PiG variant on a non-Aura ("this artifact is put into
 * a graveyard" — Spine of Ish Sah, a different effect) or "equipped creature dies, draw a card" never reaches a
 * native return here: the artifact-PiG isn't matched (only "this aura"/self-name), and the draw form's effect
 * clause isn't the return shape so it isn't rewritten → stays body-only (CREED all-or-nothing).
 *
 * EXPORTED PURE (registered in parser.js via registerTriggerDetector — see the circular-import note above).
 * `effectClause` is the trigger's first same-line effect sentence; BOTH shapes require it to be EXACTLY the
 * bare "return it to its owner's hand" — so "equipped creature dies, DRAW A CARD" (Skullclamp / Transmogrant's
 * Crown, and equipment.test.js's body-only assertion) is NOT classified here (a different effect → unmatched →
 * the equippedCreature scope is never created for it → it keeps its existing body-only/Arbiter handling).
 */
const RETURN_IT_EFFECT_RE = /^return it to its owner's hand$/i;
export function selfReturnTriggerDetector(condition, cardName, typeLine, effectClause) {
  const c = String(condition || "").toLowerCase().trim();
  // Gate BOTH shapes on the effect being exactly the bare self-return (CREED — only the return-it form flips;
  // any other effect, or a rider on the return, leaves this unmatched → the card stays body-only / Arbiter).
  if (!RETURN_IT_EFFECT_RE.test(String(effectClause || "").trim())) return null;
  // (A) Aura self-PiG. "this aura" or the legendary/own card name (e.g. "eye of nidhogg") + the PiG wording.
  //     Gate on an Aura type line so a non-Aura self-PiG ("this artifact is put into a graveyard" — Spine of
  //     Ish Sah's destroy-a-permanent effect) is never mis-detected as an Aura return.
  if (/\baura\b/i.test(String(typeLine || "")) && /\bput into a graveyard from the battlefield$/.test(c)) {
    const nameL = String(cardName || "").toLowerCase();
    const subjectIsSelf = /^this aura is/.test(c)
      || (nameL && c.startsWith(`${nameL} is`))
      || (nameL.includes(",") && c.startsWith(`${nameL.split(",")[0].trim()} is`));
    if (subjectIsSelf) return { event: "ltb", scope: "self", whose: "any", selfReturnKind: "self" };
  }
  // (B) Equipped-creature-dies. EXACT bare condition only (a "…or is exiled", a power/type restriction, or any
  //     rider leaves residue → unmatched → Arbiter). scopeMatches' equippedCreature gate enforces the linkage.
  if (c === "equipped creature dies") {
    return { event: "dies", scope: "equippedCreature", whose: "any", selfReturnKind: "attached" };
  }
  return null;
}

/**
 * applySelfReturn — return the TRIGGERING object (its card now in a graveyard) to its OWNER's hand.
 *
 * Uniform across both shapes because the returned object IS the trigger's triggeringPermanent in each:
 *   - Aura PiG: checkLeavesTriggers fires with source === triggering === the Aura look-back, so the triggering
 *     card IS the Aura.
 *   - Equipped-creature-dies: checkDiesTriggers fires with the dead creature as triggeringPermanent, so the
 *     triggering card IS the dead creature.
 * Either way we move ctx.triggeringCardId from ctx.triggeringController's graveyard → that player's hand.
 *
 * Fail-safe (CR 608.2b): if the card already left the graveyard (a later effect grabbed it, or it never landed
 * there), this is a logged no-op — never a throw, never a fabricated card in hand. CR 111.7: a token ceases to
 * exist, so a token is dropped (left in / removed from the graveyard by the SBA), never placed in hand.
 */
export function applySelfReturn(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  // CR 111.7 / 704.5d — a token never returns to a hand (it ceases to exist).
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "self-return", returned: false, reason: "token", controller: owner });
  }
  const gy = state.players[owner].graveyard || [];
  if (!gy.some((c) => c.id === cardId)) {
    // CR 608.2b — the object left the graveyard before this resolved: a logged no-op.
    return logEvent(state, { kind: "spell-effect", effect: "self-return", returned: false, controller: owner });
  }
  const next = moveCardToZone(state, { playerId: owner, fromZone: "graveyard", toZone: "hand", cardId });
  return logEvent(next, { kind: "spell-effect", effect: "self-return", returned: true, controller: owner });
}

/**
 * PURE clause parser for the self-LTB return marker (the integrator wires registerClauseParser at parser.js-
 * bottom; NOT self-registered here — circular-import hazard). Matches ONLY the kind-tagged marker phrase
 * triggers.detectTriggers produces for the two narrow shapes — `[self-return:self] return it to its owner's
 * hand` / `[self-return:attached] …`. A bare "return it to its owner's hand" (never rewritten — Zephyr Spirit,
 * Mortus Strider) is NOT matched → it keeps its existing (Arbiter/body-only) handling. Anchored ^…$.
 */
export function selfReturnClauseParser(clause) {
  const t = String(clause || "").trim();
  if (/^\[self-return:(?:self|attached)\] return it to its owner's hand$/i.test(t)) return { op: "self-return" };
  // SELF-DIES-RETURN-AS-ENCHANTMENT (the "Enduring"/Glimmer cycle) — the kind-tagged marker
  // triggers.detectTriggers produces for "return it to the battlefield under its owner's control. It's an
  // enchantment." (Enduring Curiosity et al). Anchored ^…$ so any rider on the return leaves it unmatched →
  // LOW → Arbiter (CREED all-or-nothing). Bare (un-marked) text is never rewritten so it never reaches here.
  if (/^\[self-return-bf:enchantment\] return it to the battlefield under its owner's control as an enchantment$/i.test(t)) {
    return { op: "self-return-bf-enchantment" };
  }
  // KW-UNDYING (CR 702.92a) — the kind-tagged sentinel triggers.detectTriggers synthesizes from the printed
  // "Undying" keyword line (undyingKeywordCount). The intervening-if half ("if it had no +1/+1 counters on
  // it") rides the DESCRIPTOR, enforced by interveningIf.js at flush + resolution — this atom is only the
  // return+counter half. Anchored ^…$; the marker never occurs in real oracle text, so a spell can't reach it.
  if (/^\[undying\] return it to the battlefield under its owner's control with a \+1\/\+1 counter on it$/i.test(t)) {
    return { op: "undying-return" };
  }
  // KW-PERSIST (BLITZ PS-1, CR 702.79a) — undying's -1/-1 mirror sentinel (triggers.persistKeywordCount).
  if (/^\[persist\] return it to the battlefield under its owner's control with a -1\/-1 counter on it$/i.test(t)) {
    return { op: "persist-return" };
  }
  // GY-FUNCTIONING self-return (Infesting Radroach — the Bloodghast-class zone shape): the kind-tagged
  // sentinel detectTriggers produces for "…if this creature is in your graveyard, you may return it to
  // your hand" (the zone gate is the descriptor's intervening-if; this atom is only the graveyard→hand
  // move). The optional "may" is auto-taken — returning your own card is pure upside.
  if (/^\[gy-self-return:hand\] return it to your hand$/i.test(t)) {
    return { op: "gy-self-return-hand" };
  }
  // GY-FUNCTIONING AURA SELF-RETURN (Dragon Fangs cycle / Smoke Shroud) — the battlefield-and-ATTACHED
  // sibling of the hand form directly above. Same sentinel discipline: detectTriggers produces the marker
  // for "you may return this card from your graveyard to the battlefield attached to that creature", and
  // this atom is only the move + attach. The "may" is auto-taken — returning your own Aura onto a creature
  // you just watched enter is pure upside, the same reasoning the hand form uses.
  if (/^\[gy-self-attach-return\] return it to the battlefield attached to that creature$/i.test(t)) {
    return { op: "gy-self-attach-return" };
  }
  // DIES-RETURN-TO-BATTLEFIELD (BLITZ TG-1 — the Feign Death frame): the dies/self sentinel
  // detectTriggers produces for "return it to the battlefield [tapped] under its owner's control
  // [with a +1/+1 counter on it]" — undying's zone mechanics with the tapped/counter knobs
  // re-derived from the preserved printed text. Marker-gated (the bare wording is a FLICKER spell
  // half — Momentary Blink — that must stay Arbiter); anchored ^…$.
  const drb = t.match(/^\[dies-return-bf\] return it to the battlefield( tapped)? under its owner's control( with a \+1\/\+1 counter on it)?$/i);
  if (drb) return { op: "dies-return-bf", tapped: !!drb[1], plusCounter: !!drb[2] };
  return null;
}

/**
 * applySelfReturnBattlefieldEnchantment — SELF-DIES-RETURN-AS-ENCHANTMENT (the "Enduring"/Glimmer cycle:
 * Enduring Curiosity, Tenacity, Vitality, Innocence, Courage, …).
 *
 * "When <this creature> dies, if it was a creature, return it to the battlefield under its owner's control.
 * It's an enchantment. (It's not a creature.)" The dying object (an Enchantment Creature — its card now in a
 * graveyard) is put BACK onto the battlefield under its OWNER's control, but AS A NON-CREATURE ENCHANTMENT:
 * per the printed rider it's an enchantment that's no longer a creature (CR 604.3 / 613 — a type-changing
 * effect baked into the returning permanent), so it has NO power/toughness and can't attack/block or be hit
 * by "creature" removal. The "if it was a creature" intervening-if (CR 603.4) is enforced upstream by
 * interveningIf.js (evaluated at flush AND resolution against ctx.triggeringWasCreature), so this resolver
 * only ever runs when the dying object WAS a creature — it does the return + the type strip.
 *
 * FAITHFUL TYPE STRIP: the returning object's card is cloned with "Creature" removed from its type line (an
 * "Enchantment Creature — Cat Glimmer" becomes "Enchantment — Cat Glimmer") and its power/toughness cleared,
 * so every downstream reader (combat, lethal SBA, "destroy target creature", isCreaturePerm, P/T layers)
 * correctly treats the returned permanent as a non-creature — the WHOLE state change is modeled, never a
 * parse-only flip (CREED). The clone keeps the SAME card id so look-backs / the graveyard removal still key on
 * it; enterCardFromZone reads the card from the graveyard by id, so we first REPLACE the graveyard copy with
 * the type-stripped clone, then enter it (firing its enchantment-ETB / constellation triggers — CR 603: the
 * return IS an enters-the-battlefield event).
 *
 * Fail-safe (CR 608.2b): if the card already left the graveyard (a later effect grabbed it, or it never
 * landed there — e.g. it was exiled instead of dying), this is a logged no-op — never a throw, never a
 * fabricated permanent. CR 111.7: a token ceases to exist and never returns (guarded via triggeringCardIsToken).
 */
function stripCreatureFromCard(card) {
  const line = String(card?.type || card?.type_line || "");
  // Remove the "Creature" card type (and a redundant leading/trailing space) from BOTH type + type_line so
  // every reader (some read .type, some .type_line) sees the non-creature enchantment. Collapse doubled spaces.
  const strip = (s) => String(s || "").replace(/\bCreature\b/g, "").replace(/\s{2,}/g, " ").replace(/\s+—/g, " —").replace(/^\s+|\s+$/g, "");
  const next = { ...card, type: strip(card?.type ?? line) };
  if (card?.type_line != null) next.type_line = strip(card.type_line);
  // A non-creature has no power/toughness (CR 208.3) — clear them so the P/T primitive reads null (the
  // permanent is not a creature and has no combat stats).
  next.power = null;
  next.toughness = null;
  return next;
}

export function applySelfReturnBattlefieldEnchantment(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  // CR 111.7 / 704.5d — a token never returns (it ceases to exist).
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "self-return-bf-enchantment", returned: false, reason: "token", controller: owner });
  }
  const gy = state.players[owner].graveyard || [];
  const card = gy.find((c) => c.id === cardId);
  if (!card) {
    // CR 608.2b — the object left the graveyard before this resolved: a logged no-op.
    return logEvent(state, { kind: "spell-effect", effect: "self-return-bf-enchantment", returned: false, controller: owner });
  }
  // Replace the graveyard copy with the type-stripped (non-creature enchantment) clone, SAME id, so
  // enterCardFromZone (which reads the card from the graveyard by id) enters the transformed object.
  const strippedCard = stripCreatureFromCard(card);
  const withStripped = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...state.players[owner],
        graveyard: gy.map((c) => (c.id === cardId ? strippedCard : c)),
      },
    },
  };
  // Enter it under the OWNER's control (CR 400.3 — the printed "under its owner's control"). enterCardFromZone
  // fires ETB / enchantment-enters / constellation triggers (the return IS an enters event). isCreatureCard
  // inside enterCardFromZone reads the stripped type line → NOT a creature → no summoning sickness bookkeeping.
  const { state: entered, entered: didEnter } = enterCardFromZone(withStripped, { playerId: owner, cardId, fromZone: "graveyard" });
  return logEvent(entered, { kind: "spell-effect", effect: "self-return-bf-enchantment", returned: didEnter, controller: owner });
}

/**
 * applyUndyingReturn — KW-UNDYING (CR 702.92a): return the dead source (its card now in its owner's
 * graveyard) to the battlefield under its owner's control WITH a +1/+1 counter on it.
 *
 * The "if it had no +1/+1 counters on it" intervening-if is enforced UPSTREAM (interveningIf.js reads
 * ctx.triggeringHadNoPlusCounters at flush AND resolution — CR 603.4), so this resolver only ever runs when
 * the dying object's last-known state showed no +1/+1 counters. It mirrors applySelfReturnBattlefield-
 * Enchantment's zone mechanics (same dies pipeline, same look-back ids) minus the type strip, plus the
 * counter: enterCardFromZone (graveyard → battlefield under the owner, firing ETB/landfall/permanent-enters
 * watchers — the return IS an enters event, CR 603), then ONE +1/+1 counter via gameState.addCounter, which
 * routes through applyCounterDoubling (CR 614 — Doubling Season doubles undying's counter per the official
 * ruling). KNOWN APPROXIMATION: the counter lands immediately AFTER the enter-triggers fire rather than
 * being on the body as they fire (CR 614.1c would have it enter with the counter); no modeled ETB watcher
 * reads the entering body's counters, so no observable difference today — the post-resolution state is exact.
 *
 * Fail-safes: CR 608.2b — the card already left the graveyard → logged no-op, never a fabricated permanent.
 * CR 111.7 — a token ceases to exist and never returns (ctx.triggeringCardIsToken guard).
 */
export function applyUndyingReturn(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "undying-return", returned: false, reason: "token", controller: owner });
  }
  const gy = state.players[owner].graveyard || [];
  if (!gy.some((c) => c.id === cardId)) {
    // CR 608.2b — the object left the graveyard before this resolved: a logged no-op.
    return logEvent(state, { kind: "spell-effect", effect: "undying-return", returned: false, controller: owner });
  }
  const { state: entered, entered: didEnter } = enterCardFromZone(state, { playerId: owner, cardId, fromZone: "graveyard" });
  let next = entered;
  if (didEnter) {
    // The new permanent's id was minted inside enterCardFromZone; recover it by the returned CARD id (unique
    // per physical card, so the battlefield holds exactly one permanent wrapping it).
    const perm = (next.players[owner].battlefield || []).find((p) => p.card?.id === cardId);
    if (perm) next = addCounter(next, { permanentId: perm.id, type: "+1/+1", amount: 1 });
  }
  return logEvent(next, { kind: "spell-effect", effect: "undying-return", returned: didEnter, controller: owner });
}

/**
 * applyGySelfReturnHand — GY-FUNCTIONING self-return (Infesting Radroach, CR 603.3d): move THE SOURCE CARD
 * (ctx.sourceCardId — the graveyard card the trigger fired from, threaded by checkMilledTriggers' graveyard
 * scan) from its controller's graveyard to their hand. The zone intervening-if was re-checked at flush AND
 * resolution upstream, but the CR 608.2b guard here is still load-bearing (the card can leave between the
 * second check and this move in a multi-trigger stack): gone → a logged no-op, never a fabricated card.
 */
export function applyGySelfReturnHand(state, atom, ctx) {
  const owner = ctx.controller;
  const cardId = ctx.sourceCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  const gy = state.players[owner].graveyard || [];
  if (!gy.some((c) => c.id === cardId)) {
    return logEvent(state, { kind: "spell-effect", effect: "gy-self-return-hand", returned: false, controller: owner });
  }
  const next = moveCardToZone(state, { playerId: owner, fromZone: "graveyard", toZone: "hand", cardId });
  return logEvent(next, { kind: "spell-effect", effect: "gy-self-return-hand", returned: true, controller: owner });
}

/**
 * applyGySelfAttachReturn - GY-FUNCTIONING AURA self-return (Dragon Fangs cycle, CR 603.3d): move THE SOURCE
 * CARD (ctx.sourceCardId - the Aura in the graveyard, threaded by checkEnterTriggers' graveyard scan) onto
 * the battlefield ATTACHED to the creature that just entered (ctx.triggeringPermanentId).
 *
 * THREE WAYS THIS DECLINES TO ACT, and each is a real rule rather than defensive padding:
 *  - the Aura is no longer in the graveyard (CR 608.2b - it left between trigger and resolution);
 *  - the HOST is no longer on the battlefield. CR 303.4g: an Aura put onto the battlefield with nothing
 *    legal to enchant "remains in its current zone". Entering it anyway would attach it to nothing, which
 *    CR 704.5m bins instantly - a permanent that existed for zero time and a fabricated ETB along the way.
 *  - enterCardFromZone reports it did not enter.
 * All three log a no-op rather than half-acting, so an Aura is never left on the battlefield unattached.
 *
 * The attach itself needs nothing new: attachPermanent is bidirectional, no-ops if either side is missing,
 * and already routes control-Auras (CR 613.1b), so this composes with everything downstream.
 */
export function applyGySelfAttachReturn(state, atom, ctx) {
  const owner = ctx.controller;
  const cardId = ctx.sourceCardId;
  const hostId = ctx.triggeringPermanentId;
  const noop = (why) => logEvent(state, { kind: "spell-effect", effect: "gy-self-attach-return", returned: false, why, controller: owner });
  if (!owner || !cardId || !state.players?.[owner]) return state;
  if (!(state.players[owner].graveyard || []).some((c) => c.id === cardId)) return noop("card-left-graveyard");
  if (!hostId || !findPermanent(state, hostId)) return noop("no-legal-host");   // CR 303.4g
  const r = enterCardFromZone(state, { playerId: owner, cardId, fromZone: "graveyard" });
  if (!r.entered || !r.permanentId) return noop("did-not-enter");
  const next = attachPermanent(r.state, { equipId: r.permanentId, targetId: hostId });
  return logEvent(next, { kind: "spell-effect", effect: "gy-self-attach-return", returned: true, controller: owner, host: hostId });
}

/**
 * applyPersistReturn — KW-PERSIST (CR 702.79a): undying's -1/-1 mirror, byte-for-byte the same zone
 * mechanics (the "it had no -1/-1 counters on it" intervening-if enforced upstream at flush + resolution;
 * CR 608.2b gone-card no-op; CR 111.7 token guard) with the returned body carrying one -1/-1 counter
 * through the same doubling-aware addCounter path — so the loop terminates exactly as printed.
 */
export function applyPersistReturn(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "persist-return", returned: false, reason: "token", controller: owner });
  }
  const gy = state.players[owner].graveyard || [];
  if (!gy.some((c) => c.id === cardId)) {
    return logEvent(state, { kind: "spell-effect", effect: "persist-return", returned: false, controller: owner });
  }
  const { state: entered, entered: didEnter } = enterCardFromZone(state, { playerId: owner, cardId, fromZone: "graveyard" });
  let next = entered;
  if (didEnter) {
    const perm = (next.players[owner].battlefield || []).find((p) => p.card?.id === cardId);
    if (perm) {
      next = addCounter(next, { permanentId: perm.id, type: "-1/-1", amount: 1 });
      // A 1-toughness persister returns 0/0 → dies IMMEDIATELY to the SBA (CR 704.5f) — and stays dead
      // (its LKI now shows a -1/-1 counter, so the intervening-if blocks a second return). Run the sweep
      // here so the zero-toughness body never lingers as a phantom blocker until some later chokepoint.
      const lethal = destroyLethalCreatures(next);
      next = checkDiesTriggers(lethal.state, lethal.dead);
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "persist-return", returned: didEnter, controller: owner });
}

/**
 * applyDiesReturnBattlefield — DIES-RETURN-TO-BATTLEFIELD (BLITZ TG-1, the Feign Death frame): return the
 * dead source (its card now in its owner's graveyard) to the battlefield under its owner's control,
 * TAPPED when the printed text says so (enterCardFromZone's tapped option — the KM-1 imposition still
 * unions on top), with ONE +1/+1 counter when printed (the doubling-aware addCounter path, mirroring
 * undying). No lethal sweep needed: a plus counter or a tapped entry can never make the return lethal.
 * Fail-safes: CR 608.2b gone-card → logged no-op; CR 111.7 token → never returns.
 */
export function applyDiesReturnBattlefield(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "dies-return-bf", returned: false, reason: "token", controller: owner });
  }
  const gy = state.players[owner].graveyard || [];
  if (!gy.some((c) => c.id === cardId)) {
    return logEvent(state, { kind: "spell-effect", effect: "dies-return-bf", returned: false, controller: owner });
  }
  const { state: entered, entered: didEnter } = enterCardFromZone(state, { playerId: owner, cardId, fromZone: "graveyard", tapped: !!atom.tapped });
  let next = entered;
  if (didEnter && atom.plusCounter) {
    const perm = (next.players[owner].battlefield || []).find((p) => p.card?.id === cardId);
    if (perm) next = addCounter(next, { permanentId: perm.id, type: "+1/+1", amount: 1 });
  }
  return logEvent(next, { kind: "spell-effect", effect: "dies-return-bf", returned: didEnter, controller: owner });
}

export const selfReturnResolvers = {
  "self-return": applySelfReturn,
  "self-return-bf-enchantment": applySelfReturnBattlefieldEnchantment,
  "undying-return": applyUndyingReturn,
  "persist-return": applyPersistReturn, // KW-PERSIST (PS-1, CR 702.79a) — undying's -1/-1 mirror
  "gy-self-return-hand": applyGySelfReturnHand,
  "gy-self-attach-return": applyGySelfAttachReturn,
  "dies-return-bf": applyDiesReturnBattlefield, // TG-1 — the Feign Death frame (granted dies-return)
};
