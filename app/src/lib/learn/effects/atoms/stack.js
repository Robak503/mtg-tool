/**
 * effects/atoms/stack.js — stack / damage / attach atoms (counter, self-attach, deal-damage).
 * Imports applyControllerRider from removal.js (DAG: removal <- stack) for the soft-counter rider.
 */

import { applyDamageEffect } from "../../spellEffects.js";
import { logEvent, attachPermanent, findPermanent, creaturePower, opponentsOf } from "../../gameState.js";
import { setPendingSoftCounterChoice, setPendingOptionalManaPaymentChoice, setPendingOptionalSacBySubtypeChoice } from "../../pendingChoice.js";
import { resolveScaledAmount, countForSpec, isCreatureCard } from "./shared.js";
import { applyControllerRider } from "./removal.js";
import { parseCountSource } from "../parseHelpers.js"; // seam batch 15: shared count-source parser (leaf, cycle-free) for dealDamageScaledClauseParser

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
// CNT-MV-EXACT (WAVE 2b) — Mental Misstep / Spell Snare: the target spell's mana value must EQUAL
// atom.exactMv (NOT "or less"/"or greater"). A spell with no cmc reads 0 (CR 202.3 — an absent cost is MV 0).
const counterMvOk = (card, atom) =>
  atom == null || atom.exactMv == null || (card?.cmc ?? card?.mana_value ?? 0) === atom.exactMv;
export function counterFilterMatches(card, filter, atom = null) {
  const type = counterTypeLine(card);
  if (!counterMvOk(card, atom)) return false; // CNT-MV-EXACT — fails the MV test → not a legal counter target
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors spellMatchesCounterFilter for enumeration).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  // CNT-ACP (WAVE 2b) — Strix Serenade's 3-way "artifact, creature, or planeswalker" union (front-face).
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type);
  return true; // "any"
}
/**
 * Counter the spell — or ABILITY — with id `spellId` on the stack (CR 701.5a): remove it from the stack,
 * logging the counter (an optional `via` tag, e.g. "soft-counter", records HOW). A SPELL goes to its
 * controller's graveyard (or exile, exileInstead); a countered ACTIVATED/TRIGGERED ABILITY is not a card
 * and goes to no zone — it simply leaves the stack and ceases to exist (CR 701.5a). An object no longer on
 * the stack (left mid-resolution) is a logged fizzle, never an error. Shared by the hard counter
 * (applyCounter) AND the SOFT-CNT pay-decline path (runProgram.resolveSoftCounterChoice — KW-WARD-PR2 also
 * routes a warded ABILITY here) so the paths can't drift.
 */
export function counterSpellById(state, spellId, { via = null, exileInstead = false } = {}) {
  const idx = (state.stack || []).findIndex((o) => o.id === spellId);
  if (idx === -1) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: spellId });
  const targetObj = state.stack[idx];
  const card = targetObj.source;
  const controller = targetObj.controller;
  const isSpell = targetObj.kind === "spell"; // an ability is not a card → no zone change on counter
  const newStack = [...state.stack.slice(0, idx), ...state.stack.slice(idx + 1)];
  const player = state.players[controller];
  // CNT-EXILE-INSTEAD (WAVE 2b) — Deny Existence et al. route the countered spell to its owner's EXILE zone
  // instead of the graveyard (CR 701.5a + the card's "exile it instead" rider). Otherwise it's the graveyard.
  const next = {
    ...state,
    stack: newStack,
    players: (isSpell && player)
      ? { ...state.players, [controller]: exileInstead
          ? { ...player, exile: [...(player.exile || []), card] }
          : { ...player, graveyard: [...player.graveyard, card] } }
      : state.players,
  };
  return logEvent(next, { kind: "spell-effect", effect: "counter", targetId: spellId, cardName: card?.name, controller, ...(exileInstead && { exiled: true }), ...(via && { via }) });
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
    // The atom rides into the filter so CNT-MV-EXACT (Mental Misstep / Spell Snare) can re-check the
    // target spell's mana value here, mirroring the enumeration-time check (spellMatchesCounterFilter).
    if (!counterFilterMatches(card, atom.spellFilter, atom)) {
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    // SOFT-CNT — "unless its controller pays {N}" (FIXED) or "{X}" (SOFT-CNT-X, the counterspell's own cast
    // {X}, read from ctx.xValue floored at 0 — CR 107.3). Don't counter yet: flag the TARGETED spell's
    // controller's pay-or-be-countered choice (runProgram attaches the resume + suspends; the driver settles
    // it via resolveSoftCounterChoice — pay → spell survives, else countered). The parser produces exactly
    // ONE spell target per counter atom, so set the choice and stop the loop.
    if ((atom.unlessPay != null || atom.unlessPayX || atom.unlessPayCount) && !next.pendingChoice) {
      // SOFT-CNT-COUNT — "pays {N} for each <count source>" (Rakshasa's Disdain {1}/GY card, Override
      // {1}/artifact, Oppressive Will {1}/hand card): the tax is per × a board/zone count resolved HERE via
      // the shared countForSpec (the same primitive the deal-damage-by-count path uses). An unmodeled count
      // source never reaches this (parseCountSource → null → the clause stayed LOW → Arbiter).
      const amount = atom.unlessPayCount
        ? Math.max(0, (atom.unlessPayCount.per || 1) * countForSpec(next, ctx, atom.unlessPayCount.spec))
        : atom.unlessPayX ? Math.max(0, ctx.xValue || 0) : atom.unlessPay;
      return setPendingSoftCounterChoice(next, {
        controller: targetObj.controller,
        amount,
        spellId: t.id,
        spellName: card?.name || null,
        sourceName: ctx.cardName || null,
      });
    }
    // SOFT-COUNTER-RIDER — capture the COUNTERED spell's controller, counter it (CNT-EXILE-INSTEAD routes it to
    // exile not the graveyard), then apply the rider to THAT player (An Offer's Treasures / Swan Song's Bird go
    // to whoever's spell was countered, not the caster). The rider only fires when the counter actually happens
    // (a fizzle above skips it).
    const riderController = targetObj.controller;
    next = counterSpellById(next, t.id, { exileInstead: !!atom.exileInstead });
    if (atom.controllerRider && next.players?.[riderController]) {
      next = applyControllerRider(next, atom.controllerRider, { controller: riderController, power: 0 }, ctx);
    }
  }
  return next;
}

/**
 * ETB-EQUIP-ATTACH — "attach it to target creature you control" (CR 301.5 / 701.3). "It" is the SOURCE
 * Equipment (ctx.sourceId, the permanent whose ETB trigger fired), so this attaches the equipment to the
 * chosen creature via the shared `attachPermanent` helper — the SAME mechanism the Equip activated ability
 * uses, so the equipped-creature static bonus (parseAttachedBonus, applied by the layer engine when
 * `attachedTo` is set) lights up immediately. The target is enumerated as a creature the controller
 * controls (the parser's controller:you restriction), and atomTargetIntent("self-attach")="own" keeps the
 * trigger-flush chooser on the controller's own side. No source / target gone → attachPermanent no-ops
 * (never a fabricated attach).
 */
function applySelfAttach(state, atom, ctx) {
  if (!ctx.sourceId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId: ctx.sourceId, targetId: t.id });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId: ctx.sourceId, targetId: t.id, controller: ctx.controller });
  }
  return next;
}

/**
 * EQUIP-AUTO-ATTACH (WAVE 4) — the REVERSE of self-attach: the SOURCE is a CREATURE (Captain America's
 * "Catch" trigger, Cloud, Sokka) and the chosen TARGET is an Equipment the controller controls, attached
 * ONTO the source via the shared `attachPermanent` helper (equipId = the chosen equipment, targetId = the
 * source creature ctx.sourceId). The same mechanism Equip / self-attach use, so the equipped-creature
 * static bonus lights up immediately. The atom is OPTIONAL ("up to one target Equipment") — buildTriggerStack
 * enumerates the controller's equipment, and with NONE on the board the targeted trigger is removed from the
 * stack (CR 603.3c), a clean no-op (never a fabricated attach). No source / target gone → attachPermanent
 * no-ops.
 */
function applyAttachToSelf(state, atom, ctx) {
  if (!ctx.sourceId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId: t.id, targetId: ctx.sourceId });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId: t.id, targetId: ctx.sourceId, controller: ctx.controller });
  }
  return next;
}

/**
 * Equip-attach clause parsers (migrated from parseExtendedAtom, seam batch 9 / Wave A4):
 *   - self-attach: "attach it to target creature you control" — an Equipment's ETB auto-attach ("it" = the
 *     source Equipment via ctx.sourceId; host enumerated controller:you).
 *   - attach-to-self: "attach up to one target equipment you control to <self>" — a creature attaching a
 *     chosen Equipment onto itself. The destination guard accepts only a self-pronoun (it/him/her/them) OR a
 *     bare proper-name (no target/creature/control/rebel/ally/attacking/that/each/another/other/up-to word);
 *     a NON-self destination DECLINES → returns null so the clause continues to later parsers (preserves the
 *     inline fall-through). optionalTarget — an empty board is a clean no-op.
 * Pure (no parser.js import — cycle-safe); normalizes the clause exactly as parseExtendedAtom does.
 */
export function attachClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^attach it to target creature you control$/.test(t)) {
    return { op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
  }
  const ats = t.match(/^attach up to one target equipment you control to (.+)$/);
  if (ats) {
    const dest = ats[1].trim();
    const SELF_PRONOUN = /^(it|him|her|them)$/.test(dest);
    const NON_SELF = /\b(target|creature|control|rebel|ally|allies|attacking|that|each|another|other|up to)\b/.test(dest);
    if (SELF_PRONOUN || !NON_SELF) {
      return { op: "attach-to-self", targetType: "equipmentYouControl", optionalTarget: true };
    }
  }
  return null;
}

/**
 * DMG-SCALE clause parser (WALT-DMG-SCALE) — migrated from parser.js parseExtendedAtom (seam batch 15 / Wave C).
 * "<source> deals damage to <target> equal to the number of <count source>" — the damage AMOUNT is a board
 * count resolved at resolution (`amountCount`), not a printed number (Massive Raid, Spitting Earth, Outnumber,
 * Feedback Bolt). Reuses the deal-damage atom + targeting verbatim; only the amount is new. TIGHT target
 * ALLOWLIST (the bare, fully-modeled forms) so a restricted target never mis-resolves to the unrestricted set;
 * an unmodeled count source (parseCountSource → null) drops the whole clause → low → Arbiter. The standard
 * printed "N damage" form is NOT here — it stays on the legacyToAtom path. "twice the number of" / "in excess
 * of" don't match the anchor (deliberate deferral — never a half-scaled native). Pure; uses the parseCountSource
 * leaf. Registered via registerClauseParser in parser.js.
 */
export function dealDamageScaledClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const TT = {
    "any target": "any", "target creature": "creature", "target player": "player",
    "target player or planeswalker": "playerOrPlaneswalker",
    "target creature or planeswalker": "creatureOrPlaneswalker", "each opponent": "eachOpponent",
  };
  const build = (targetPhrase, countPhrase) => {
    const targetType = TT[String(targetPhrase).trim()];
    const amountCount = parseCountSource(countPhrase, { allowTarget: true });
    if (!targetType || !amountCount) return null;
    // a "that player's hand" count is only meaningful against a targeted player (CR — "that player")
    if (amountCount.who === "target" && targetType !== "player" && targetType !== "playerOrPlaneswalker") return null;
    return { op: "deal-damage", targetType, amountCount };
  };
  // ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== "<source> deals damage equal to the triggering creature's
  // power to <target>" — the AMOUNT is the TRIGGERING (entering) creature's layer-aware power at resolution
  // (Terror of the Peaks: "Whenever another creature you control enters, this creature deals damage equal to
  // that creature's power to any target"). "the triggering creature's power" is the SENTINEL detectTriggers
  // rewrites "that creature's power" to (gated to the ETB entering-creature scopes — see triggers.js), so a
  // SPELL's anaphoric "that creature's power" (Grab the Reins / Rakdos Joins Up — a sacrificed-creature fling,
  // a DIFFERENT referent) never reaches this matcher and stays low → Arbiter (CREED — sentinel gate). Reuses the
  // deal-damage atom + the TIGHT target allowlist verbatim; only the amount source is new (amountCount → the
  // shared countForSpec triggeringPower kind, read off ctx.triggeringPermanentId). who:"target" cards never use
  // this form (the count is a creature's power, not a player's hand), so no who-vs-targetType guard is needed.
  const sst = t.match(/^.+? deals? damage equal to the triggering creature's (power|toughness) to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (sst) {
    const targetType = TT[sst[2]];
    return targetType ? { op: "deal-damage", targetType, amountCount: { kind: sst[1] === "power" ? "triggeringPower" : "triggeringToughness", per: 1 } } : null;
  }
  // OLD word order: "<source> deals damage TO <target> equal to the number of <count>" (Massive Raid, Spitting Earth).
  const mds = t.match(/^.+? deals? damage to (.+?) equal to the number of (.+)$/);
  if (mds) return build(mds[1], mds[2]);
  // DMG-SCALE-2 — MODERN word order: "<source> deals damage equal to the number of <count> TO <target>"
  // (Cabaretti Charm, Coordinated Maneuver, Bumi Bash modes). The count is non-greedy so the FIRST " to
  // <allowlisted target>" wins; a multi-count ("…plus the number of Equipment…", Slash of Light) or an
  // unmodeled count → parseCountSource null → low → Arbiter. Emits the SAME amountCount atom (resolver shared).
  const mds2 = t.match(/^.+? deals? damage equal to the number of (.+?) to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (mds2) return build(mds2[2], mds2[1]);
  // DMG-SCALE-3 — "where X is" word order: "<source> deals X damage to <target>, where X is [equal to] the
  // number of <count>" (Scourge of Valkas / Dragon Tempest "…to any target, where X is the number of Dragons
  // you control"; Tribal Flames, Profane Prayers, Sparksmith, Gempalm Incinerator, Tendrils of Corruption).
  // The literal "X damage" (not a printed "N damage") is the anchor that keeps the fixed-N form on the
  // legacyToAtom path; the TARGET is the TIGHT allowlist (so a restricted target never widens), and the count
  // routes through the SAME parseCountSource → an unmodeled source ("colors of mana spent", "permanents with
  // oil counters") → null → low → Arbiter (CREED FN-safe). Emits the SAME amountCount atom (resolver shared).
  // allowTarget stays OFF here: every "where X is" card scales by a board/graveyard count, never "that player's
  // hand" (which only appears in the legacy "deals damage to target player equal to…" word order), so a "that
  // player's hand" referent has no anaphoric player on this form and must route to the Arbiter — not silently 0.
  const mds3 = t.match(/^.+? deals? x damage to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent),? where x is (?:equal to )?the number of (.+)$/);
  if (mds3) {
    const targetType = TT[mds3[1]];
    const amountCount = parseCountSource(mds3[2]);
    return targetType && amountCount ? { op: "deal-damage", targetType, amountCount } : null;
  }
  return null;
}

/**
 * COUNTER clause parser (CR 701.5a) — co-extracted from parseExtendedAtom (seam batch 28 / Wave C, RIDER-FOLDING).
 * The full counter-target-spell family, original first-match order:
 *   bare hard counters: "counter target spell" (any) / noncreature / creature / "enchantment, instant, or
 *     sorcery" (Swan Song) / "artifact, creature, or planeswalker" (Strix Serenade lead)
 *   CNT-MV-EXACT: "counter target spell with mana value N" (Mental Misstep / Spell Snare) — exactMv
 *   SOFT-CNT: "counter target [noncreature|creature] spell unless its controller pays {N}" — unlessPay (fixed)
 *   SOFT-CNT-X: "… pays {X}" — unlessPayX + countX (the counterspell's own X, bound at resolution)
 * All anchored to `$`; a tax/modal/rider/2-way-subset variant fails → low → Arbiter (never a confidently-wrong
 * partial counter). **Rider-folding:** matchCounterControllerRider + matchCounterExileInstead in parser.js resolve
 * their rider-stripped lead via `parseExtendedAtom() || counterClauseParser` (the rider regex only matches a HARD
 * counter lead), so Strix Serenade / Swan Song / An Offer / Deny Existence keep folding. Pure (no helper).
 * Registered via registerClauseParser in parser.js.
 */
export function counterClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^counter target spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell" };
  if (/^counter target noncreature spell$/.test(t)) return { op: "counter", spellFilter: "noncreature", targetType: "spell" };
  if (/^counter target creature spell$/.test(t)) return { op: "counter", spellFilter: "creature", targetType: "spell" };
  if (/^counter target enchantment, instant, or sorcery spell$/.test(t)) return { op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell" };
  const mv = /^counter target spell with mana value (\d+)$/.exec(t);
  if (mv) return { op: "counter", spellFilter: "any", targetType: "spell", exactMv: parseInt(mv[1], 10) };
  if (/^counter target artifact, creature, or planeswalker spell$/.test(t)) return { op: "counter", spellFilter: "artifactCreaturePlaneswalker", targetType: "spell" };
  const sc = /^counter target (noncreature |creature )?spell unless its controller pays \{(\d+)\}$/.exec(t);
  if (sc) return { op: "counter", spellFilter: sc[1] ? sc[1].trim() : "any", targetType: "spell", unlessPay: parseInt(sc[2], 10) };
  const scx = /^counter target (noncreature |creature )?spell unless its controller pays \{x\}$/.exec(t);
  if (scx) return { op: "counter", spellFilter: scx[1] ? scx[1].trim() : "any", targetType: "spell", unlessPayX: true, countX: true };
  // SOFT-CNT-COUNT — "counter target spell unless its controller pays {N} for each <count source>" (Rakshasa's
  // Disdain / Countervailing Winds / Circular Logic [GY], Override [artifacts], Oppressive Will [hand]). Reuses
  // the soft-counter pendingChoice + the shared parseCountSource/countForSpec. An unmodeled count (color-filtered
  // "blue permanent", Domain, all-battlefield, "revealed/discarded this way") → parseCountSource null → low → Arbiter.
  const scc = /^counter target (noncreature |creature )?spell unless its controller pays \{(\d+)\} for each (.+)$/.exec(t);
  if (scc) {
    const spec = parseCountSource(scc[3]);
    if (!spec) return null;
    return { op: "counter", spellFilter: scc[1] ? scc[1].trim() : "any", targetType: "spell", unlessPayCount: { per: parseInt(scc[2], 10), spec } };
  }
  return null;
}

/**
 * MASS-FILTERED-DAMAGE clause parser — "<source> deals N damage to each creature <filter>" where the filter
 * is with|without flying (Gale Force / Seismic Shudder) OR you control | your opponents control (Blazing
 * Volley, Scouring Sands). Reuses the eachCreature deal-damage path + a restriction (hasKeyword / controller)
 * that creatureSatisfiesRestrictions filters the mass set with (layer-aware). Whole-clause anchored — a "and
 * each player" / kicker / flashback / threshold rider fails the `$` → low → Arbiter (FN-safe). Registered
 * via registerClauseParser in parser.js.
 */
export function massFilteredDamageClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^.+? deals? (\d+) damage to each creature (with|without) flying$/);
  if (m) return { op: "deal-damage", amount: parseInt(m[1], 10), targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: m[2] === "without" }] };
  const cm = t.match(/^.+? deals? (\d+) damage to each creature (you control|your opponents control)$/);
  if (cm) return { op: "deal-damage", amount: parseInt(cm[1], 10), targetType: "eachCreature", restrictions: [{ kind: "controller", who: cm[2] === "you control" ? "you" : "opponent" }] };
  return null;
}

/**
 * ===== SOURCE-POWER-FANOUT (Chandra's Ignition, CR 701) ===== the CHOSEN target creature (you control) deals
 * damage equal to ITS layer-aware power to each OTHER creature (every creature on every battlefield except the
 * source) AND each opponent. All the damage is dealt by the source simultaneously, so it's ONE applyDamageEffect
 * call with the fan-out target list + source:{id:sourceCreatureId} (so a source-scoped damage doubler / infect
 * / wither on the chosen creature applies through the shared primitive, identical to every other damage atom).
 * The source's power is read BEFORE the damage (CR 608.2h — locked as the effect resolves); a source that left
 * the battlefield between cast and resolution, or a non-creature target, is a clean no-op (no fabricated damage).
 * The source EXCLUDES itself from the creature set ("each OTHER creature", CR 113.7) but still hits opponents.
 */
function applySourcePowerFanout(state, atom, ctx) {
  // The chosen target creature is the damage source (a single creature you control — the parser's
  // targetType:"creature" + controller:you restriction; the cast/flush path binds exactly one).
  const chosen = (ctx.targets || []).find((t) => t.type === "creature");
  const lk = chosen?.id ? findPermanent(state, chosen.id) : null;
  if (!lk || !isCreatureCard(lk.permanent.card)) {
    return logEvent(state, { kind: "spell-effect", effect: "source-power-fanout", controller: ctx.controller, amount: 0 });
  }
  const sourceId = chosen.id;
  const amount = Math.max(0, creaturePower(lk.permanent, state)); // CR 608.2h — locked at resolution
  // Fan-out targets: every OTHER creature on every battlefield (exclude the source), then every opponent.
  const targets = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of (state.players[pid].battlefield || [])) {
      if (perm.id !== sourceId && isCreatureCard(perm.card)) targets.push({ type: "creature", id: perm.id });
    }
  }
  for (const opp of opponentsOf(state, ctx.controller)) {
    if (state.players[opp]) targets.push({ type: "player", id: opp });
  }
  // ONE damage event from the source (CR — dealt simultaneously). source:{id} threads the source-scoped
  // damage-replacement / infect / wither hook, exactly like every other deal-damage atom.
  return applyDamageEffect(state, { controller: ctx.controller, amount, targets, source: { id: sourceId } });
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== "you may pay {cost}. if you do, <effect>." — flag the
 * controller's pay-or-decline choice instead of resolving the payoff outright (the parser already validated
 * the cost is fixed mana + the payoff is a HIGH, targetless, non-modal program). The CONTROLLER (ctx.controller
 * — the player whose trigger/ability this is) is who pays + decides, so the driver's `pause = pc.controller
 * === "user"` rule pauses a human and auto-decides an AI (pay-if-able). runProgram attaches the resume +
 * suspends; resolveOptionalManaPaymentChoice settles it (PAY → payManaCost + run the payoff atoms; DECLINE →
 * nothing). The payoff atoms ride on the choice as plain JSON (serialize-safe). FIFO-guarded by the setter.
 */
function applyOptionalManaPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time (belt-and-braces; setter re-guards)
  return setPendingOptionalManaPaymentChoice(state, {
    controller: ctx.controller,
    cost: atom.cost,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
  });
}

// REFLEXIVE-SAC-BY-SUBTYPE — true iff `player` controls ≥1 permanent whose TYPE LINE carries `subtype`
// word-bounded (CR 205.3). The SAME match sacScopeMatches uses for the watcher side, so the "can I sacrifice
// one?" test and the "did this sac fire a Treasure watcher?" test never drift. A Food token's type line is
// "Token Artifact — Food" → matches; word-bounded so "Food" never matches a longer word.
export function controllerSacSubtypeMatch(perm, subtype) {
  const ts = String(perm?.card?.type || perm?.card?.type_line || "");
  const esc = String(subtype).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(ts);
}

// REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. if you do, <effect>". Suspend on the
// sac/decline choice, recording whether the controller actually has a matching permanent to give up (a false-
// `available` pause still surfaces — the player/AI must "decline" since you can't sacrifice what you don't have,
// and resolveOptionalSacChoice runs NO payoff). The payoff atoms ride on the pause for the settle.
function applyOptionalSacPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time (belt-and-braces; setter re-guards)
  const player = state.players?.[ctx.controller];
  const available = !!(player?.battlefield || []).some((p) => controllerSacSubtypeMatch(p, atom.subtype));
  return setPendingOptionalSacBySubtypeChoice(state, {
    controller: ctx.controller,
    subtype: atom.subtype,
    available,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
  });
}

export const stackResolvers = {
  "optional-mana-payment": applyOptionalManaPayment, // OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. if you do, <effect>"
  "optional-sac-payment": applyOptionalSacPayment, // REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. if you do, <effect>"
  "source-power-fanout": applySourcePowerFanout, // SOURCE-POWER-FANOUT (Chandra's Ignition) — chosen creature deals its power to each other creature + each opponent
  "deal-damage": (state, atom, ctx) =>
    // KW-POISON: thread the SOURCE permanent (ctx.sourceId, set for activated/triggered abilities) so an
    // infect/wither source's non-combat damage routes to -1/-1 counters / poison in applyDamageEffect.
    // MASS-FILTERED-DAMAGE: thread atom.restrictions so an eachCreature wipe can be flying-filtered.
    // EXILE-IF-DIES (subsystem 3): thread atom.exileIfWouldDie so the damaged creature is marked for the
    // dies→exile replacement (Lava Coil / Magma Spray).
    applyDamageEffect(state, { controller: ctx.controller, amount: resolveScaledAmount(state, atom, ctx), targetType: atom.targetType, targets: ctx.targets, source: { id: ctx.sourceId }, restrictions: atom.restrictions, exileIfWouldDie: atom.exileIfWouldDie }),
  "counter": applyCounter,
  "self-attach": applySelfAttach, // ETB-EQUIP-ATTACH — auto-attach an Equipment to a creature you control
  "attach-to-self": applyAttachToSelf, // EQUIP-AUTO-ATTACH — attach a chosen Equipment you control onto the source creature
};
