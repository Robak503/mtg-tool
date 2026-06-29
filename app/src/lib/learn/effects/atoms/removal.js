/**
 * effects/atoms/removal.js — removal + sacrifice atoms (destroy, exile-with-rider, sacrifice).
 * Hosts the RIDER-REMOVAL dispatch (applyControllerRider) which calls into tokens.js / library.js /
 * zones.js (DAG: {tokens,library,zones} <- removal). Keep the rider logic HERE (moving it to shared.js
 * would create a cycle).
 */

import { applyDestroyEffect } from "../../spellEffects.js";
import { logEvent, gainLife, opponentsOf, findPermanent, moveCardToZone, creaturePower } from "../../gameState.js";
import { checkDiesTriggers, checkLifegainTriggers, checkSacrificeTriggers } from "../../triggers.js";
import { setPendingSacrificeChoice } from "../../pendingChoice.js";
import { atomTargets, isCreatureCard, massCreatureTargets } from "./shared.js";
import { applyCreateToken, applyCreateNamedToken } from "./tokens.js";
import { applyTutor } from "./library.js";
import { applyZoneMove } from "./zones.js";

/**
 * ===== RIDER-REMOVAL ===== (Dex) targeted removal whose SECOND clause acts on the TARGET's controller
 * (CR — "its controller" = the just-removed permanent's controller): Swords to Plowshares (exile + that
 * controller gains life = the creature's power), Beast Within / Generous Gift (destroy + that controller
 * makes a vanilla token), Path to Exile / Assassin's Trophy (exile/destroy + that controller may ramp a
 * basic land). The controller (and the creature's power, for the lifegain rider) is captured BEFORE the
 * removal moves the permanent off the battlefield; the removal then runs through the SHARED exile/destroy
 * resolver (so indestructible/regen/dies are handled identically); finally the rider applies to the
 * captured controller. The rider is unconditional — Beast Within still makes the token even if the target
 * was indestructible (the destroy failed but the second sentence still resolves).
 */
export function applyRemovalWithRider(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  // Capture each target's controller + power while it's still on the battlefield (these spells are
  // single-target in the corpus, but the loop is general).
  const captures = [];
  for (const t of targets) {
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(state, t.id);
    if (lk) captures.push({ controller: lk.controller, power: Math.max(0, creaturePower(lk.permanent, state)) });
  }
  // Perform the removal through the shared resolver (exile → applyZoneMove, destroy → applyDestroyEffect).
  let next = atom.op === "exile"
    ? applyZoneMove(state, atom, ctx, "exile")
    : applyDestroyEffect(state, { controller: ctx.controller, targets, cannotRegenerate: atom.cannotRegenerate });
  // Apply the rider to each captured controller.
  for (const cap of captures) {
    if (!next.players?.[cap.controller]) continue; // controller eliminated mid-resolution → skip (CR 800.4a)
    next = applyControllerRider(next, atom.controllerRider, cap, ctx);
    // A rampBasic rider suspends the program (a tutor pending-choice scoped to that player); stop the loop
    // so a (theoretical) second target can't clobber the pending choice — the runner resumes from here.
    if (next.pendingChoice && !next.pendingChoice.resume) break;
  }
  return next;
}

/** Apply a single RIDER-REMOVAL controller-rider to the captured target-controller `cap`. */
export function applyControllerRider(state, rider, cap, ctx) {
  if (rider.kind === "gainLifePower") {
    let next = gainLife(state, { playerId: cap.controller, amount: cap.power });
    if (cap.power > 0) next = checkLifegainTriggers(next, cap.controller, cap.power);
    return logEvent(next, { kind: "spell-effect", effect: "rider-gain-life", controller: cap.controller, amount: cap.power });
  }
  if (rider.kind === "createToken") {
    // A token (vanilla OR keyworded — Swan Song's flying Bird) under the captured controller; reuse
    // applyCreateToken with the controller swapped and any modeled keywords threaded.
    const tokenAtom = { op: "create-token", count: 1, power: rider.power, toughness: rider.toughness, descriptor: `${rider.color} ${rider.subtype}`, keywords: rider.keywords || [], targetType: null };
    return applyCreateToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "createNamedToken") {
    // An Offer You Can't Refuse — N named artifact tokens (Treasure/Clue/Food/Gold) under the captured controller.
    const tokenAtom = { op: "create-named-token", token: rider.token, count: rider.count, targetType: null };
    return applyCreateNamedToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "rampBasic") {
    // Reuse the RAMP-1 battlefield tutor (basic land → battlefield), scoped to the TARGET's controller — their
    // library, their pick; the "may" is the tutor's find-nothing. Suspends the program (pending-choice).
    const tutorAtom = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: !!rider.entersTapped, targetType: null };
    return applyTutor(state, tutorAtom, { ...ctx, controller: cap.controller });
  }
  return state;
}

/**
 * ===== EDICTS ===== — sacrifice a creature controlled by `playerId` as an EFFECT (CR 701.21): move it
 * battlefield → graveyard and fire its + watchers' dies triggers (CR 700.4 — the aristocrats payoff).
 * The EFFECT-side twin of actionDispatcher.sacrificePermanentForCost (the cost-side self-sac), kept here
 * so the edict resolver + the resolution-time victim-choice path (runProgram.resolveSacrificeChoice)
 * share ONE implementation. These paths only ever pass a CREATURE, so dies triggers always fire; the
 * dispatch's stack-resolution finalizer flushes them above the rest (CR 603.3b). A stale id (the creature
 * already left) is a logged no-op via the findPermanent guard + moveCardToZone's own guard.
 */
export function sacrificeCreatureEffect(state, playerId, permId) {
  const lk = findPermanent(state, permId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: null });
  // DIES-TRIGGER-RESOURCE-PAYOFFS: capture the layer-aware POWER from the ORIGINAL `state` (the perm is
  // still on the battlefield there), BEFORE the moveCardToZone below — CR 603.6e — so a SACRIFICED
  // Goldvein/Lifeblood/Feral-Ghoul still feeds its "equal to its power" dies-trigger the real on-board power.
  const sacPower = isCreatureCard(lk.permanent.card) ? creaturePower(lk.permanent, state) : null;
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permId });
  if (isCreatureCard(lk.permanent.card)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permId, name: lk.permanent.card?.name || "creature", card: lk.permanent.card, power: Number.isFinite(sacPower) ? sacPower : null }]);
  }
  // TRIG-SACRIFICE: fire "Whenever you sacrifice a <permanent|creature|artifact>" for the sacrificing
  // player. The perm has left the battlefield, so its type rides on the lookBack card (sacScopeMatches reads it).
  next = checkSacrificeTriggers(next, playerId, { id: permId, controller: playerId, card: lk.permanent.card });
  return logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: permId, cardName: lk.permanent.card?.name });
}

/**
 * ===== EDICTS ===== — walk the sacrifice CHAIN (CR 701.21 — each sacrificing player chooses which creature
 * to give up). `queue` is the remaining sacrificers, head-first, each `{ playerId }` (one creature apiece —
 * the modeled "sacrifices a creature" forms). For each in turn:
 *   - eliminated / no creature → drop and move on (a clean no-op; you can't sacrifice what you don't have).
 *   - exactly 1 creature → FORCED sacrifice (no real choice): pitch it inline (dies triggers fire), move on.
 *   - ≥2 creatures → a REAL choice: pause via setPendingSacrificeChoice for THIS sacrificer (the driver
 *     pauses a human picker, auto-sacs an AI's least-valuable), carrying the queue so resolveSacrificeChoice
 *     can drop the settled head + re-enter.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes). Shared
 * by applySacrifice (the atom's first entry) and runProgram.resolveSacrificeChoice (each subsequent pick),
 * so ONE implementation drives the single-target edict (#214) AND the each-player / each-opponent forms.
 * Hidden-info safe: each sacrificer's creatures are public, and the chooser IS their controller.
 */
export function advanceSacrificeChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // sacrificer left the game (CR 800.4a) → skip
    const creatures = (player.battlefield || [])
      .filter((p) => isCreatureCard(p.card))
      .map((p) => ({ id: p.id, name: p.card?.name }));
    if (creatures.length === 0) { q = q.slice(1); continue; } // no creature → can't sacrifice → skip
    if (creatures.length === 1) {
      next = sacrificeCreatureEffect(next, head.playerId, creatures[0].id); // forced — sole legal pick
      q = q.slice(1);
      continue;
    }
    // ≥2 — a real choice: pause for THIS sacrificer's pick, carrying the rest of the queue.
    return setPendingSacrificeChoice(next, { controller: head.playerId, candidates: creatures, queue: q, sourceName });
  }
  return next;
}

/**
 * EDICTS — sacrifice-as-an-effect, resolved through the chain above. The SACRIFICING player chooses which
 * creature (CR 701.21), never the caster. `atom.who` selects the sacrificers:
 *   - "target" (default, #214) — the player(s) targeted at cast (Diabolic Edict / Cruel Edict / Geth's Verdict).
 *   - "eachPlayer" (Innocent Blood / Reign of the Pit) — every player, the controller first (APNAP-stable).
 *   - "eachOpponent" (Liliana's Triumph / Skull Storm) — every opponent.
 * A removed sacrificer / no creatures is a clean no-op; the caster's riders resume after the whole chain settles.
 */
function applySacrifice(state, atom, ctx) {
  // SELF-SACRIFICE — "sacrifice this creature" (the trigger source, CR 113.7 + CR 701.21).
  // target:"self" with ctx.sourceId: the source permanent sacrifices itself. Uses
  // sacrificeCreatureEffect directly (bypasses the edict chooser chain — the victim is fixed).
  // No-op if ctx.sourceId is absent or the permanent already left the battlefield (stale source).
  if (atom.target === "self") return sacrificeCreatureEffect(state, ctx.controller, ctx.sourceId);
  // TRIG-PRONOUN-IT — "sacrifice the triggering creature" (the non-self pronoun referent, CR 608.2c): the
  // permanent that CAUSED the trigger, threaded flat as ctx.triggeringPermanentId by the trigger flush.
  // Bypasses the edict chooser chain (the victim is fixed). The detectTriggers sentinel rewrite (gated to
  // the non-self triggering scopes) is the only producer of this atom, so a spell anaphor never reaches it;
  // an absent id is a clean no-op log, never a fabricated sacrifice.
  if (atom.target === "thatCreature") {
    return ctx.triggeringPermanentId
      ? sacrificeCreatureEffect(state, ctx.controller, ctx.triggeringPermanentId)
      : logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller: ctx.controller, sacrificed: null });
  }
  let sacrificers;
  if (atom.who === "eachPlayer") {
    const seen = new Set();
    sacrificers = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else if (atom.who === "eachOpponent") {
    sacrificers = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  } else {
    sacrificers = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (sacrificers.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "sacrifice", who: atom.who || "target", sacrificers: 0 });
  }
  return advanceSacrificeChain(state, { queue: sacrificers.map((pid) => ({ playerId: pid })), sourceName: ctx.cardName });
}

/**
 * SACRIFICE-EDICT clause parser (CR 701.16) — migrated from parser.js parseExtendedAtom (seam batch 21 / Wave C).
 * The contiguous EDICT block (each sacrificer gives up ONE creature of their choice; resolved through
 * applySacrifice → advanceSacrificeChain), three matchers in original first-match order:
 *   target (player|opponent) sacrifices a creature  → who via targetType (offensive edict)
 *   each player sacrifices a creature               → who:"eachPlayer"
 *   each (opponent|other player) sacrifices a creature → who:"eachOpponent"
 * ALL-OR-NOTHING bare "a creature" (count 1, unfiltered) — a count / filtered victim / non-creature / conjoined
 * "and loses N life" fails the exact anchor → low → Arbiter (a wrong-victim sac would be a forbidden FP).
 * Also handles the SELF + TRIGGERING sac forms (batch 22, lifted from their separate mid-function spots; they
 * ran earlier than the edicts in parseExtendedAtom, so they stay first here):
 *   "sacrifice this creature"          → target:"self"        (the ability source via ctx.sourceId)
 *   "sacrifice the triggering creature" → target:"thatCreature" (the TRIGGERING permanent, CR 608.2c)
 * Pure (no helper). Registered via registerClauseParser.
 */
export function sacrificeEdictClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^sacrifice this creature$/.test(t)) return { op: "sacrifice", target: "self" };
  if (/^sacrifice the triggering creature$/.test(t)) return { op: "sacrifice", target: "thatCreature" };
  let m = t.match(/^target (player|opponent) sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", targetType: m[1] === "opponent" ? "opponent" : "player", what: "creature" };
  m = t.match(/^each player sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachPlayer", what: "creature" };
  m = t.match(/^each (?:opponent|other player) sacrifices a creature(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachOpponent", what: "creature" };
  return null;
}

/**
 * DESTROY ⇄ EXILE clause parser — co-extracted from parseExtendedAtom (seam batch 27 / Wave C, RIDER-FOLDING).
 * All five destroy/exile matchers, original first-match order:
 *   1. "exile target creature" → exile/creature
 *   2. shared `(destroy|exile) target <typelist>[ <control>]` (rm) — singles + permanent-TYPE unions + the
 *      controller restriction; emits destroy OR exile via rm[1]. typelist excludes bare "creature" (the
 *      legacy parseSpellEffect path serves "destroy/exile target creature").
 *   3. "destroy all creatures" → destroy/eachCreature   4. "exile all creatures" → exile/eachCreature
 *   5. "destroy all <artifacts|enchantments|lands|artifacts and enchantments>" → typed mass destroy
 * UNFILTERED mass only. The `cannotRegenerate` re-stamp on the destroy-all atom happens in the parseEffectClause
 * wrapper (outside this matcher), unchanged. **Rider-folding:** matchRemovalControllerRider in parser.js (the
 * "Its controller …" dispatch) resolves its rider-stripped lead via parseExtendedAtom() || this parser, so the
 * controllerRider cards (Beast Within / Generous Gift / Assassin's Trophy / Swords / Buy Your Silence …) keep
 * folding even though the bare matchers now live here. Pure (no helper). Registered via registerClauseParser.
 */
export function destroyExileClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // TRIG-PRONOUN destroy (the triggering permanent, CR 608.2c) — "destroy the triggering creature" (Toxin
  // Sliver's "destroy that creature"; detectTriggers rewrites the non-self pronoun → this sentinel before it
  // reaches here, mirroring bounceClauseParser's "return the triggering creature …" form). target:"thatCreature"
  // → atomTargets/triggeringTargets → ctx.triggeringPermanentId (the damaged creature). The "can't be
  // regenerated" rider is re-stamped onto this destroy atom by the parseEffectClause wrapper (CANT_REGEN_TEST
  // matches "that creature can't be regenerated"). Only the detectTriggers sentinel produces this clause, so a
  // spell anaphor never reaches it; an absent id is a clean no-op (applyDestroyEffect over an empty target list).
  if (/^destroy the triggering creature$/.test(t)) return { op: "destroy", target: "thatCreature" };
  if (/^exile target creature$/.test(t)) return { op: "exile", targetType: "creature" };
  // The two-type UNION list admits BOTH printed word-orders for the artifact/creature union — "creature or
  // artifact" (the order most cards print) AND "artifact or creature" (Putrefy: "Destroy target artifact or
  // creature. It can't be regenerated." — the cannotRegenerate rider is re-stamped by the parseEffectClause
  // wrapper). Both map to the SAME `creatureOrArtifact` targetType (the union predicate is order-free — it
  // matches a permanent that is a Creature OR an Artifact), so the alias can never mis-scope; zones.js's
  // bounce/tuck matchers already accept "artifact or creature" for the identical union.
  const rm = t.match(/^(destroy|exile) target (artifact or enchantment|creature or enchantment|creature or land|creature or artifact|artifact or creature|creature or planeswalker|artifact or land|enchantment or land|nonland permanent|artifact|enchantment|land|permanent|planeswalker)(?: (an opponent controls|you don't control|you control))?$/);
  if (rm) {
    const TT = {
      "artifact": "artifact", "enchantment": "enchantment", "land": "land", "permanent": "permanent",
      "nonland permanent": "nonlandPermanent", "artifact or enchantment": "artifactOrEnchantment",
      "creature or enchantment": "creatureOrEnchantment", "creature or land": "creatureOrLand",
      "creature or artifact": "creatureOrArtifact", "artifact or creature": "creatureOrArtifact", "artifact or land": "artifactOrLand",
      "enchantment or land": "enchantmentOrLand",
      "creature or planeswalker": "creatureOrPlaneswalker", "planeswalker": "planeswalker", // PW-7
    };
    const restrictions = rm[3] ? [{ kind: "controller", who: /^you control$/.test(rm[3]) ? "you" : "opponent" }] : [];
    return { op: rm[1] === "destroy" ? "destroy" : "exile", targetType: TT[rm[2]], restrictions };
  }
  if (/^destroy all creatures$/.test(t)) return { op: "destroy", targetType: "eachCreature" };
  if (/^exile all creatures$/.test(t)) return { op: "exile", targetType: "eachCreature" };
  const m = t.match(/^destroy all (artifacts and enchantments|artifacts|enchantments|lands)$/);
  if (m) {
    const TT = { "artifacts": "eachArtifact", "enchantments": "eachEnchantment", "lands": "eachLand", "artifacts and enchantments": "eachArtifactOrEnchantment" };
    return { op: "destroy", targetType: TT[m[1]] };
  }
  // MASS-LAND-SUBTYPE — "destroy all Islands|Swamps|Mountains|Plains|Forests" (Boil, Tsunami, Acid Rain,
  // Flashfires). Reuses the eachLand destroy with a basic-land-type filter (atomTargets honors landSubtype);
  // hits every land of that type on every battlefield (basic AND dual). A rider ("…For each land destroyed…"
  // — Stench of Evil) fails the `$` → low → Arbiter (FN-safe).
  const ml = t.match(/^destroy all (islands|swamps|mountains|plains|forests)$/);
  if (ml) {
    const SUB = { islands: "Island", swamps: "Swamp", mountains: "Mountain", plains: "Plains", forests: "Forest" };
    return { op: "destroy", targetType: "eachLand", landSubtype: SUB[ml[1]] };
  }
  // CRUX — subtype-filtered creature wipe: "destroy all <Subtype> creatures" / "destroy all non-<Subtype>
  // creatures" (Crux of Fate's two modes: "all Dragon creatures" / "all non-Dragon creatures"; Tranquil Path,
  // Engineered Plague-style typed wipes). Reuses the eachCreature destroy with a creature-subtype filter
  // (atomTargets → massCreatureTargets honors subtypeFilter/subtypeNegate, a pure type-line read). The subtype
  // must be in the CURATED allowlist (a word that appears verbatim ONLY in the subtype portion of a type line —
  // no left-of-dash collision — so the `\b` match selects exactly the subtyped creatures, CR 205.3m). A
  // non-curated word fails → null → low → Arbiter (CREED: never a fabricated/mis-scoped wipe). The cannotRegenerate
  // re-stamp (a "can't be regenerated" rider) is applied by the parseEffectClause wrapper, unchanged.
  const mc = t.match(/^destroy all (non-?)?([a-z]+) creatures$/);
  if (mc) {
    const sub = MASS_CREATURE_SUBTYPES[mc[2]];
    if (sub) return { op: "destroy", targetType: "eachCreature", subtypeFilter: sub, subtypeNegate: !!mc[1] };
  }
  return null;
}

// CRUX — curated creature subtypes that appear after "destroy all [non-]<X> creatures" in the corpus. Each is a
// proper-noun subtype that occurs verbatim ONLY in the subtype portion of a type line (zero left-of-dash
// collisions), so a `\b<subtype>\b` containment match in massCreatureTargets hits exactly the subtyped creatures
// (CR 205.3m). CURATED (not generic) per the CREED — a non-subtype word (a color / card type / "other") can
// never reach the filter. Singular surface form (the oracle says "all Dragon creatures", singular subtype).
const MASS_CREATURE_SUBTYPES = {
  dragon: "Dragon", zombie: "Zombie", goblin: "Goblin", elf: "Elf", merfolk: "Merfolk", sliver: "Sliver",
  vampire: "Vampire", angel: "Angel", demon: "Demon",
};

/**
 * ===== BLOOD-MONEY (mass destroy + Treasure-per-nontoken-destroyed) ===== "Destroy all creatures. For each
 * nontoken creature destroyed this way, you create a tapped Treasure token." The Treasure count is the number
 * of NONTOKEN creatures THIS effect actually destroyed (CR — "destroyed this way"), so it's NOT the size of
 * the board: an indestructible / regen-shielded creature isn't destroyed (no Treasure), and a TOKEN creature
 * is destroyed but doesn't count (nontoken). Faithful + robust: snapshot the nontoken-creature ids BEFORE the
 * wipe, run the SHARED applyDestroyEffect mass destroy (so indestructible / regeneration / dies-triggers are
 * handled identically to any board wipe), then count how many of those snapshotted ids actually LEFT the
 * battlefield — that's the exact "destroyed this way" nontoken count. Create that many TAPPED Treasures under
 * the controller via the shared applyCreateNamedToken. A "can't be regenerated" rider (cannotRegenerate) is
 * honored by applyDestroyEffect; none on Blood Money, but threaded for parity.
 */
function applyMassDestroyTreasurePerNontoken(state, atom, ctx) {
  // Snapshot the nontoken-creature ids on every battlefield BEFORE the wipe (CR — "destroyed this way").
  const nontokenIds = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of (state.players[pid].battlefield || [])) {
      if (isCreatureCard(perm.card) && !perm.card?.token) nontokenIds.push(perm.id);
    }
  }
  // Shared mass destroy (every creature). Indestructible / regen survivors stay → they won't be counted below.
  let next = applyDestroyEffect(state, { controller: ctx.controller, targets: massCreatureTargets(state), cannotRegenerate: atom.cannotRegenerate });
  // Count the snapshotted nontoken creatures that actually LEFT the battlefield (= destroyed this way).
  const destroyedNontoken = nontokenIds.filter((id) => !findPermanent(next, id)).length;
  if (destroyedNontoken > 0) {
    next = applyCreateNamedToken(next, { op: "create-named-token", token: "treasure", count: destroyedNontoken, tapped: true, targetType: null }, ctx);
  }
  return logEvent(next, { kind: "spell-effect", effect: "mass-destroy-treasure-per-nontoken", controller: ctx.controller, treasures: destroyedNontoken });
}

export const removalResolvers = {
  "mass-destroy-treasure-per-nontoken": applyMassDestroyTreasurePerNontoken, // BLOOD-MONEY — destroy all creatures + a tapped Treasure per nontoken creature destroyed
  "destroy": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Beast Within / Generous Gift / Assassin's Trophy
      : applyDestroyEffect(state, { controller: ctx.controller, targets: atomTargets(state, atom, ctx), cannotRegenerate: atom.cannotRegenerate }), // MTG-001 — honor the "can't be regenerated" rider
  "exile": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Path to Exile / Swords to Plowshares
      : applyZoneMove(state, atom, ctx, "exile"),
  "sacrifice": applySacrifice,
};
