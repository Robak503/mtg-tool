/**
 * effects/atoms/removal.js — removal + sacrifice atoms (destroy, exile-with-rider, sacrifice).
 * Hosts the RIDER-REMOVAL dispatch (applyControllerRider) which calls into tokens.js / library.js /
 * zones.js (DAG: {tokens,library,zones} <- removal). Keep the rider logic HERE (moving it to shared.js
 * would create a cycle).
 */

import { applyDestroyEffect, applyDamageEffect, parseCreatureTargetRestrictions } from "../../spellEffects.js";
import { logEvent, gainLife, loseLife, drawCards, opponentsOf, findPermanent, moveCardToZone, creaturePower, creatureToughness, creatureBasePower } from "../../gameState.js";
import { applyScheduleDelayed } from "./delayedTrigger.js"; // ④-BD — the counter rider's delayed "may draw up to N" (Arcane Denial); delayedTrigger imports only gameState (cycle-safe)
import { checkDiesTriggers, checkLifegainTriggers, checkSacrificeTriggers } from "../../triggers.js";
import { setPendingSacrificeChoice } from "../../pendingChoice.js";
import { atomTargets, isCreatureCard, isArtifactCard, isEnchantmentCard, isLandCard, massCreatureTargets } from "./shared.js";
import { applyCreateToken, applyCreateNamedToken } from "./tokens.js";
import { applyTutor, millOnePlayer } from "./library.js";
import { applyZoneMove, applyExileUntilLeaves } from "./zones.js";
import { NAMED_TOKENS } from "./tokens.js"; // NAMED-TOKEN sacrifice pool — same registry the mint side uses, so a pool can never name a token the engine cannot create

// MULTI-COUNT "any number of target" upper bound (CR 601.2c) — the count is unbounded on the card, so use a
// sentinel large enough that targeting.targetSubsets always clamps it to the ACTUAL eligible-target count
// (hi = Math.min(maxTargets, n)). targetSubsets' MAX_CAST_EXPANSIONS backstop still caps the option blow-up.
const MULTI_COUNT_UNBOUNDED = 99;

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
    // The damageRider lead can be ANY destroyed permanent (artifact / enchantment / land / creature), so capture
    // for every removable type; the controllerRider corpus only uses creature/permanent/planeswalker leads, but
    // accepting "artifact"/"enchantment"/"land" here is harmless (those riders never attach to them).
    if (!["creature", "permanent", "planeswalker", "artifact", "enchantment", "land"].includes(t.type)) continue;
    const lk = findPermanent(state, t.id);
    // DESTROY-DAMAGE-RIDER (Molten Rain) — capture whether the target LAND is NONBASIC *before* the destroy (same
    // type-line predicate as the nonbasicLand targetType: a Land lacking the Basic supertype, CR 205.4a). Read
    // off the pre-removal state so the condition reflects the land that was actually destroyed.
    if (lk) {
      const tl = lk.permanent?.card?.type || "";
      // TOUGHNESS + MANA VALUE join POWER on the capture: a rider scaled by the removed permanent's stats must
      // read them from the PRE-removal board (Sever Soul's "you gain life equal to its toughness" — after the
      // destroy there is nothing left to measure). MV comes off the card (CR 202.3 — an absent cost is 0), so
      // it is valid for the artifact / enchantment leads too, not just creatures.
      captures.push({
        controller: lk.controller,
        power: Math.max(0, creaturePower(lk.permanent, state)),
        toughness: Math.max(0, creatureToughness(lk.permanent, state)),
        mv: Math.max(0, lk.permanent?.card?.cmc ?? lk.permanent?.card?.mana_value ?? 0),
        nonbasic: /\bLand\b/.test(tl) && !/\bBasic\b/.test(tl),
      });
    }
  }
  // Perform the removal through the shared resolver (exile → applyZoneMove, destroy → applyDestroyEffect).
  let next = atom.op === "exile"
    ? applyZoneMove(state, atom, ctx, "exile")
    : applyDestroyEffect(state, { controller: ctx.controller, targets, cannotRegenerate: atom.cannotRegenerate });
  // Apply the rider(s) to each captured controller. A removal can carry a controllerRider (Beast Within) OR a
  // damageRider (Smash to Smithereens / Molten Rain) — never both in the corpus, but both are applied if present.
  for (const cap of captures) {
    if (!next.players?.[cap.controller]) continue; // controller eliminated mid-resolution → skip (CR 800.4a)
    if (atom.controllerRider) {
      next = applyControllerRider(next, atom.controllerRider, cap, ctx);
      // A rampBasic rider suspends the program (a tutor pending-choice scoped to that player); stop the loop
      // so a (theoretical) second target can't clobber the pending choice — the runner resumes from here.
      if (next.pendingChoice && !next.pendingChoice.resume) break;
    }
    if (atom.damageRider) next = applyDamageRider(next, atom.damageRider, cap, ctx);
  }
  return next;
}

/**
 * DESTROY-DAMAGE-RIDER — the SPELL deals `rider.amount` damage to the captured target-controller `cap` (CR — the
 * second sentence's "that <noun>'s controller"). Routes through the SHARED applyDamageEffect (a player target),
 * so life loss / poison / damage replacement / lifegain-from-loss interactions are identical to any burn spell.
 * Molten Rain's `onlyIfNonbasic` gates the damage on the destroyed land having been nonbasic (captured pre-removal);
 * an unconditional rider (Smash to Smithereens / Melt Terrain) always deals. The damage is dealt even when the
 * destroy itself failed on an indestructible target (CR — the second sentence resolves regardless), exactly like
 * the controllerRider's unconditional token; `?? false` reads the flag so its absence means "always deal".
 */
export function applyDamageRider(state, rider, cap, ctx) {
  if ((rider.onlyIfNonbasic ?? false) && !cap.nonbasic) return state; // Molten Rain — basic land destroyed → no damage
  return applyDamageEffect(state, { controller: ctx.controller, amount: rider.amount, targets: [{ type: "player", id: cap.controller }], source: { id: ctx.sourceId } });
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
  if (rider.kind === "delayedMayDraw") {
    // ④-BD (Arcane Denial) — schedule the countered spell's CONTROLLER (cap.controller, never the caster) a delayed trigger
    // for the next upkeep whose effect is N optional single draws ("you may draw a card" × N ≡ "may draw up to N cards").
    const n = Math.max(1, rider.count || 1);
    const clause = Array.from({ length: n }, () => "you may draw a card").join(". ");
    return applyScheduleDelayed(state, { delayedClause: clause, fireStep: rider.fireStep || "upkeep", fireScope: rider.fireScope || "any" }, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "casterGainLife") {
    // ⭐ "You gain life equal to its <toughness|mana value>." — the CASTER gains, scaled by a metric captured
    // from the removed permanent BEFORE it left. ⛔ Distinct from `gainLifePower` (Swords to Plowshares),
    // where the TARGET'S CONTROLLER gains: same sentence shape, opposite beneficiary. Confusing the two
    // would hand the victim the life on every card in this family.
    const caster = ctx?.controller;
    if (!caster || !state?.players?.[caster]) return state;
    const amount = Math.max(0, cap[rider.metric] ?? 0);
    let next = gainLife(state, { playerId: caster, amount });
    if (amount > 0) next = checkLifegainTriggers(next, caster, amount);
    return logEvent(next, { kind: "spell-effect", effect: "rider-gain-life", controller: caster, amount });
  }
  if (rider.kind === "loseLife") {
    // ⭐ "Its controller loses N life." — scoped to the CAPTURED controller (the permanent's / spell's
    // controller as of BEFORE the removal resolved, which is why `cap` is captured up front: after a destroy
    // the permanent is gone and there is nobody left to ask).
    let next = loseLife(state, { playerId: cap.controller, amount: Math.max(0, rider.amount || 0) });
    next = logEvent(next, { kind: "spell-effect", effect: "rider-lose-life", controller: cap.controller, amount: Math.max(0, rider.amount || 0) });
    // ⛔ THE DRAIN HALF GOES TO THE SPELL'S CONTROLLER, NOT THE CAPTURED ONE — the only place in this family
    // where a rider touches a different player, and getting it backwards would hand the victim the life.
    // `youGain` is read from the printed text separately from `amount` rather than mirrored from it.
    if (rider.youGain) {
      const caster = ctx?.controller;
      if (caster && next.players?.[caster]) {
        next = gainLife(next, { playerId: caster, amount: rider.youGain });
        next = checkLifegainTriggers(next, caster, rider.youGain);
        next = logEvent(next, { kind: "spell-effect", effect: "rider-gain-life", controller: caster, amount: rider.youGain });
      }
    }
    return next;
  }
  if (rider.kind === "drawCards") {
    // CNT-DRAW-RIDER (Dream Fracture) — the COUNTERED spell's controller draws N (CR 121.2). Scoped to the
    // captured controller via the shared drawCards (deck-out is an SBA — drawCards draws as many as remain).
    const next = drawCards(state, { playerId: cap.controller, count: Math.max(0, rider.count || 0) });
    return logEvent(next, { kind: "spell-effect", effect: "rider-draw", controller: cap.controller, amount: Math.max(0, rider.count || 0) });
  }
  if (rider.kind === "rampBasic") {
    // Reuse the RAMP-1 battlefield tutor (basic land → battlefield), scoped to the TARGET's controller — their
    // library, their pick; the "may" is the tutor's find-nothing. Suspends the program (pending-choice).
    // SG-16 (Boseiju): the typed variant fetches any LAND carrying a basic land type (cardMatchesTutorFilter's
    // basicLandType gate — a typed nonbasic qualifies, a typeless one does not), else the plain basic search.
    const filter = rider.typedBasic ? { groups: [["land"]], basicLandType: true } : { groups: [["basic", "land"]] };
    const tutorAtom = { op: "tutor", filter, filterLabel: rider.typedBasic ? "land card with a basic land type" : "basic land card", destination: "battlefield", entersTapped: !!rider.entersTapped, targetType: null };
    return applyTutor(state, tutorAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "mill") {
    // CNT-MILL-RIDER (BLITZ CS-1 — Thought Collapse / Didn't Say Please): the COUNTERED spell's controller
    // mills N. Routes through the SHARED millOnePlayer chokepoint, so the mill-doubler (CR 616) and the
    // milled-trigger binds fire exactly like every other mill instruction (CR 701.13a).
    const n = Math.max(0, rider.count || 0);
    const next = millOnePlayer(state, cap.controller, n);
    return logEvent(next, { kind: "spell-effect", effect: "rider-mill", controller: cap.controller, amount: n });
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
/**
 * ⭐ CHAMPION (CR 702.71a) — "Champion a Kithkin (When this enters, sacrifice it unless you exile another
 * Kithkin you control. When this leaves the battlefield, that card returns to the battlefield.)"
 * Thoughtweft Trio, Changeling Berserker, Nova Chaser, Mistbind Clique and five more.
 *
 * ⭐ THE RETURN HALF IS FREE AND MUST NOT BE REBUILT. `applyExileUntilLeaves` stamps
 * `detainedExile: [{cardId, ownerId}]` on the SOURCE permanent, and checkLeavesTriggers synthesizes the
 * return on ANY exit (CR 610.3a) — which IS champion's "when this leaves the battlefield, that card
 * returns". So this resolver produces the exile and the link and nothing else. ⛔ Synthesizing a second,
 * LTB trigger would return the card TWICE — the same trap the two-trigger detain fold documents.
 *
 * TWO THINGS ARE GENUINELY NEW HERE:
 *  ① The exiled permanent is the controller's OWN and is CHOSEN, not targeted — champion never prints
 *     "target" — so it is picked at RESOLUTION, exactly like populate's `creatureTokenYouControl` source.
 *     The pick is DETERMINISTIC AND STATED so self-play traces reproduce: the WEAKEST eligible body
 *     (power+toughness, ties by permanent id). Keeping the champion body is the obvious play, and any legal
 *     pick is faithful because the rules constrain only the creature's TYPE.
 *  ② The SACRIFICE FALLBACK is mandatory, not optional: "sacrifice it UNLESS you exile…" means a player
 *     with no eligible creature MUST sacrifice the champion. That is the printed downside, and skipping it
 *     would leave a creature on the battlefield the card says should be gone.
 *
 * ⛔ SELF IS EXCLUDED FROM THE POOL ("ANOTHER Kithkin"). Without that the card exiles ITSELF, its own
 * leave-trigger then fires off an already-gone source, and the creature never comes back.
 *
 * ⛔ TOKENS ARE EXCLUDED, and that is CR 111.7 rather than a simplification: a token that leaves the
 * battlefield ceases to exist, so exiling one would destroy it permanently while the card promises a
 * return. applyExileUntilLeaves already refuses to LINK a token; excluding it from the pool means the
 * engine never makes that un-returnable choice in the first place.
 */
export function applyChampion(state, atom, ctx) {
  const controller = ctx.controller;
  const srcLk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!srcLk) return logEvent(state, { kind: "spell-effect", effect: "champion", controller, reason: "source-left" });
  const want = String(atom.subtype || "").toLowerCase();
  const bf = state.players?.[controller]?.battlefield || [];
  const eligible = bf.filter((p) => {
    if (p.id === ctx.sourceId) return false;                     // "ANOTHER" — never itself
    if (p.card?.token) return false;                             // CR 111.7 — a token would not come back
    if (!isCreatureCard(p.card)) return false;
    if (!want || want === "creature") return true;               // "Champion a creature"
    return new RegExp(`\\b${want}\\b`, "i").test(String(p.card.type || ""));
  });
  if (!eligible.length) {
    // No legal offering ⇒ the printed downside, not a skip.
    return sacrificeCreatureEffect(state, controller, ctx.sourceId);
  }
  const score = (p) => (Number(p.card.power) || 0) + (Number(p.card.toughness) || 0);
  const victim = eligible.slice().sort((a, b) => score(a) - score(b) || String(a.id).localeCompare(String(b.id)))[0];
  // Route the exile through the SHARED detain resolver so the link, the owner routing and the return are
  // the ones already proven — this passes the chosen permanent as the atom's target rather than
  // reimplementing any of it.
  const next = applyExileUntilLeaves(state, { op: "exile", untilSourceLeaves: true }, { ...ctx, targets: [{ type: "creature", id: victim.id }] });
  return logEvent(next, { kind: "spell-effect", effect: "champion", controller, championed: victim.id, subtype: atom.subtype || null });
}

export function sacrificeCreatureEffect(state, playerId, permId) {
  const lk = findPermanent(state, permId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: null });
  // DIES-TRIGGER-RESOURCE-PAYOFFS: capture the layer-aware POWER from the ORIGINAL `state` (the perm is
  // still on the battlefield there), BEFORE the moveCardToZone below — CR 603.6e — so a SACRIFICED
  // Goldvein/Lifeblood/Feral-Ghoul still feeds its "equal to its power" dies-trigger the real on-board power.
  const sacPower = isCreatureCard(lk.permanent.card) ? creaturePower(lk.permanent, state) : null;
  const sacBasePower = isCreatureCard(lk.permanent.card) ? creatureBasePower(lk.permanent, state) : null;
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permId });
  if (isCreatureCard(lk.permanent.card)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permId, name: lk.permanent.card?.name || "creature", card: lk.permanent.card, power: Number.isFinite(sacPower) ? sacPower : null, basePower: Number.isFinite(sacBasePower) ? sacBasePower : null, counters: { ...(lk.permanent.counters || {}) } }]);
  }
  // TRIG-SACRIFICE: fire "Whenever you sacrifice a <permanent|creature|artifact>" for the sacrificing
  // player. The perm has left the battlefield, so its type rides on the lookBack card (sacScopeMatches reads it).
  next = checkSacrificeTriggers(next, playerId, { id: permId, controller: playerId, card: lk.permanent.card });
  return logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: permId, cardName: lk.permanent.card?.name });
}

/**
 * VICTIM-POOL predicate (CR 701.16) — does card `c` belong to the pool a `what`-typed edict lets a sacrificer
 * give up? "creature" (default / unset, so every legacy creature edict is byte-stable) | "permanent" (any
 * permanent) | the TYPED pools "land"/"artifact"/"enchantment"/"artifactOrEnchantment". The typed pools use the
 * SAME word-anchored type predicates the mass-removal atoms use (isLandCard/isArtifactCard/isEnchantmentCard),
 * so an Artifact Creature is correctly a legal pick for an "artifact" edict (it IS an artifact, CR 305.4) and a
 * creature-land for a "land" edict. An unknown `what` falls back to the creature pool (defensive — the parser
 * only ever emits the five known values, so this is never reached at runtime). Pure type-line read (leaf).
 */
const SACRIFICE_POOLS = new Set(["creature", "permanent", "land", "artifact", "enchantment", "artifactOrEnchantment", "artifactCreatureOrLand", "nonbasicLand", "nontokenCreature", "creatureToken", "planeswalker"]);
// NAMED-TOKEN pool (CR 701.16) — "Sacrifice a Food token." The generic nouns above have always worked; the
// named-token nouns had no pool, so the clause produced no atom at all. Carried as a `token:<name>` string
// rather than one enum entry per kind, validated against NAMED_TOKENS — the SAME registry the mint side
// uses — so a name the engine cannot mint can never become a pool that is silently empty at resolution.
const isNamedTokenPool = (what) => typeof what === "string" && what.startsWith("token:")
  && Object.prototype.hasOwnProperty.call(NAMED_TOKENS, what.slice(6));
// CREATURE-SUBTYPE sac pools (2026-08-12, Palani's Hatcher) — one lowercased entry per MEASURED carrier
// (TF-1). Adding a word here without a carrier is forbidden; the parser arm and sacrificePoolMatch both
// key on this one set, so the offer and the charge can never disagree about what "an Egg" means.
const SAC_SUBTYPE_NOUNS = new Set(["egg"]);
export function sacrificePoolMatch(what, card) {
  // NAMED TOKEN — must be a TOKEN (CR 111.1) whose name is the printed one. Both halves matter: without
  // the token check a real Food ARTIFACT card would qualify; without the name check any token would.
  if (isNamedTokenPool(what)) {
    const want = NAMED_TOKENS[what.slice(6)]?.name;
    return !!card?.token && !!want && String(card?.name || "").toLowerCase() === want.toLowerCase();
  }
  // CREATURE-SUBTYPE pool (2026-08-12, Palani's Hatcher "sacrifice an Egg"): a CREATURE whose live type
  // line carries the subtype, word-anchored — token or nontoken alike (the printed cost says "an Egg",
  // not "an Egg token"; Palani's own minted 0/1s carry "Creature — Dinosaur Egg" and qualify).
  if (typeof what === "string" && what.startsWith("subtype:")) {
    const sub = what.slice(8);
    return isCreatureCard(card) && new RegExp(`\\b${sub}\\b`, "i").test(String(card?.type || card?.type_line || ""));
  }
  switch (what) {
    case "permanent": return true;
    // TOKEN-SPLIT EDICTS (Sheoldred's Edict #1154, Accursed Marauder #464, Gaius van Baelsar): the printed
    // filter partitions the creature pool by token-ness, which is what makes those cards good — the nontoken
    // mode blows past a wall of Zombie tokens, the token mode does the opposite. Getting the sense backwards
    // is a wrong-victim sacrifice, so the two are separate cases rather than one flag. `card.token` is the
    // marker gameState stamps on minted tokens (CR 111.1).
    case "nontokenCreature": return isCreatureCard(card) && !card?.token;
    case "creatureToken": return isCreatureCard(card) && !!card?.token;
    // PLANESWALKER pool (Sheoldred's Edict's third mode, Angrath's Rampage). Word-anchored on the type line
    // like every sibling predicate, so a creature-planeswalker DFC face qualifies via its live type line.
    case "planeswalker": return /\bPlaneswalker\b/i.test(card?.type || card?.type_line || "");
    case "land": return isLandCard(card);
    case "artifact": return isArtifactCard(card);
    case "enchantment": return isEnchantmentCard(card);
    case "artifactOrEnchantment": return isArtifactCard(card) || isEnchantmentCard(card);
    // BLITZ TR-2 — "an artifact, creature, or land" (Braids, Cabal Minion): the three-way type union over
    // the same word-anchored predicates (a multi-typed permanent qualifies via any of its types).
    case "artifactCreatureOrLand": return isArtifactCard(card) || isCreatureCard(card) || isLandCard(card);
    // BLITZ TR-2 — "a nonbasic land" (Destructive Flow): a land WITHOUT the Basic supertype (CR 205.4c —
    // "Basic" is printed in the type line's supertype slot, so the word-anchored test is exact; a
    // creature-land is a legal pick iff nonbasic, matching the printed pool).
    case "nonbasicLand": return isLandCard(card) && !/\bBasic\b/i.test(card?.type || card?.type_line || "");
    default: return isCreatureCard(card); // "creature" (and the unset default)
  }
}

/**
 * ===== EDICTS ===== — walk the sacrifice CHAIN (CR 701.21 — each sacrificing player chooses what to give
 * up). `queue` is the remaining sacrificers, head-first, each `{ playerId, what? }` (one permanent apiece —
 * `what:"creature"` default | `what:"permanent"` for the any-permanent forms | a TYPED pool). For each in turn:
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
    // VICTIM POOL — `head.what` selects which permanents this sacrificer may give up (CR 701.16). Default
    // "creature" (every legacy edict + a head with no `what`, so the migrated creature edicts are byte-stable);
    // "permanent" broadens to ALL the sacrificer's permanents (Silverclad Ferocidons etc.). The TYPED pools
    // ("land"/"artifact"/"enchantment"/"artifactOrEnchantment" — Yawning Fissure, Tribute to the Wild, the
    // Baleful Beholder mode) narrow to exactly the permanents of that type, using the SAME word-anchored type
    // predicates the mass-removal atoms use (so an Artifact Creature is a legal pick for an "artifact" edict —
    // it IS an artifact, CR 305.4). The chooser is their controller and every candidate is public, so any pool
    // is hidden-info-safe. sacrificeCreatureEffect already sacrifices ANY permanent correctly (it gates
    // dies-triggers on isCreatureCard, fires sacrifice-triggers for all), so only the pool the chooser sees changes.
    const candidates = (player.battlefield || [])
      .filter((p) => sacrificePoolMatch(head.what, p.card))
      .filter((p) => !(head.excludeId && p.id === head.excludeId)) // "another" — the source is never a victim
      .map((p) => ({ id: p.id, name: p.card?.name }));
    if (candidates.length === 0) { q = q.slice(1); continue; } // nothing to sacrifice → can't → skip
    if (candidates.length === 1) {
      next = sacrificeCreatureEffect(next, head.playerId, candidates[0].id); // forced — sole legal pick
      q = q.slice(1);
      continue;
    }
    // ≥2 — a real choice: pause for THIS sacrificer's pick, carrying the rest of the queue (each head keeps its own `what`).
    return setPendingSacrificeChoice(next, { controller: head.playerId, candidates, queue: q, sourceName });
  }
  return next;
}

/**
 * EDICTS — sacrifice-as-an-effect, resolved through the chain above. The SACRIFICING player chooses which
 * permanent (CR 701.16/701.21), never the caster. `atom.who` selects the sacrificers:
 *   - "target" (default, #214) — the player(s) targeted at cast (Diabolic Edict / Cruel Edict / Geth's Verdict).
 *   - "eachPlayer" (Innocent Blood / Reign of the Pit) — every player, the controller first (APNAP-stable).
 *   - "eachOpponent" (Liliana's Triumph / Skull Storm) — every opponent.
 * `atom.what` selects the victim pool: "creature" (default) or "permanent" (Silverclad Ferocidons — any permanent).
 * A removed sacrificer / an empty pool is a clean no-op; the caster's riders resume after the whole chain settles.
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
  } else if (atom.who === "controller") {
    // CONTROLLER EDICT (BLITZ EC-1c — "sacrifice a creature"): the ability's controller alone. For an
    // aura-GRANTED trigger (Inevitable End on an opponent's creature) the controller is the HOST's
    // controller (makePendingTrigger — the granted ability is theirs), so THEY sacrifice, as printed.
    sacrificers = state.players?.[ctx.controller] ? [ctx.controller] : [];
  } else if (atom.who === "upkeepPlayer") {
    // UPKEEP-PLAYER EDICT (BLITZ TR-2 — Molder Slug / Braids, Cabal Minion / Destructive Flow: "At the
    // beginning of each player's upkeep, that player sacrifices a[n] <pool> of their choice"): the player
    // whose upkeep it is, ctx.upkeepPlayerId (threaded by checkStepTriggers). Absent / eliminated referent
    // (a spell, a non-upkeep event) → nobody sacrifices (a clean logged no-op, never a wrong-player edict).
    sacrificers = ctx.upkeepPlayerId && state.players?.[ctx.upkeepPlayerId] ? [ctx.upkeepPlayerId] : [];
  } else if (atom.who === "damagedPlayer") {
    // DAMAGED-PLAYER EDICT (DP-SAC — Demon of Loathing, Cabal Executioner, Destructive Urge, Akki
    // Underminer): the player just dealt combat damage, ctx.damagedPlayerId (threaded by
    // checkCombatDamageTriggers). Absent / eliminated referent → nobody sacrifices — the same clean logged
    // no-op the upkeep and defending arms make, never a wrong-player edict.
    sacrificers = ctx.damagedPlayerId && state.players?.[ctx.damagedPlayerId] ? [ctx.damagedPlayerId] : [];
  } else if (atom.who === "defendingPlayer") {
    // DEFENDING-PLAYER EDICT (BLITZ TR-2 — Nefarox, Overlord of Grixis "Whenever Nefarox attacks alone,
    // defending player sacrifices a creature of their choice", CR 508.5): the declared defender,
    // ctx.defenderId (threaded by checkAttackTriggers on attacks AND attacksAlone, checkBlockTriggers on
    // becomesBlocked). Absent / eliminated referent → nobody sacrifices (the applyLoseLife mirror).
    sacrificers = ctx.defenderId && state.players?.[ctx.defenderId] ? [ctx.defenderId] : [];
  } else {
    sacrificers = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (sacrificers.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "sacrifice", who: atom.who || "target", sacrificers: 0 });
  }
  // Thread `atom.what` onto each queue head so advanceSacrificeChain builds the right victim pool, and a re-entry
  // from resolveSacrificeChoice (queue.slice(1)) preserves it per-sacrificer. The known pools pass through
  // (sacrificePoolMatch interprets them); anything else falls back to "creature" (the byte-stable default).
  // ⛔ subtype: pools joined this gate WITH their parser arm (2026-08-12, Palani's Egg) — before that,
  // an unknown `what` fell back to "creature" here and the Egg sac offered the RAPTOR as a victim: the
  // wrong-victim FP the pool discipline exists to prevent (caught by the Law-6 witness pre-push).
  const isSubtypePool = typeof atom.what === "string" && atom.what.startsWith("subtype:");
  const what = (SACRIFICE_POOLS.has(atom.what) || isNamedTokenPool(atom.what) || isSubtypePool) ? atom.what : "creature";
  // excludeSource ("sacrifice ANOTHER permanent" — Korvold): the source is never a legal victim. Threaded
  // per head so a resolveSacrificeChoice re-entry (queue.slice(1)) preserves it, like `what`.
  const excludeId = atom.excludeSource ? (ctx.sourceId ?? null) : null;
  return advanceSacrificeChain(state, { queue: sacrificers.map((pid) => ({ playerId: pid, what, ...(excludeId ? { excludeId } : {}) })), sourceName: ctx.cardName });
}

/**
 * SACRIFICE-EDICT clause parser (CR 701.16) — migrated from parser.js parseExtendedAtom (seam batch 21 / Wave C).
 * The contiguous EDICT block (each sacrificer gives up ONE creature of their choice; resolved through
 * applySacrifice → advanceSacrificeChain), three matchers in original first-match order:
 *   target (player|opponent) sacrifices a creature  → who via targetType (offensive edict)
 *   each player sacrifices a creature               → who:"eachPlayer"
 *   each (opponent|other player) sacrifices a creature → who:"eachOpponent"
 * plus the PERMANENT-EDICT twins ("sacrifices a permanent of their choice" → what:"permanent", any-permanent pool).
 * ALL-OR-NOTHING bare "a creature"/"a permanent" (count 1, unfiltered) — a count / filtered victim / typed
 * ("an artifact") / conjoined "and loses N life" fails the exact anchor → low → Arbiter (a wrong-victim sac FP).
 * Also handles the SELF + TRIGGERING sac forms (batch 22, lifted from their separate mid-function spots; they
 * ran earlier than the edicts in parseExtendedAtom, so they stay first here):
 *   "sacrifice this creature"          → target:"self"        (the ability source via ctx.sourceId)
 *   "sacrifice the triggering creature" → target:"thatCreature" (the TRIGGERING permanent, CR 608.2c)
 * Pure (no helper). Registered via registerClauseParser.
 */
export function sacrificeEdictClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // SELF-SACRIFICE — "sacrifice this <permanent-type-noun>" (CR 113.7 — "this" always names the ability's
  // SOURCE object, whatever its card type). Every noun form resolves to the SAME target:"self" (the source
  // sacrifices itself via ctx.sourceId); the noun is purely the source's own type ("sacrifice this enchantment"
  // on Defense of the Heart, "sacrifice this creature" on an aristocrat). sacrificeCreatureEffect moves ANY
  // permanent to the graveyard (dies-triggers only fire for a creature), so a non-creature self-sac is faithful.
  // The noun allowlist is the corpus's printed set of "sacrifice this X" self-references — a bare permanent type,
  // never a filtered / conjoined sacrifice, so no wrong-victim FP (CREED).
  if (/^sacrifice this (creature|permanent|token|land|artifact|enchantment|aura|equipment|vehicle)$/.test(t)) return { op: "sacrifice", target: "self" };
  if (/^sacrifice the triggering creature$/.test(t)) return { op: "sacrifice", target: "thatCreature" };
  // CONTROLLER EDICT (BLITZ EC-1c — Inevitable End's granted "At the beginning of your upkeep, sacrifice a
  // creature."; the bare imperative subject is the ability's controller, CR 109.5 — "you"): the
  // CONTROLLER sacrifices ONE creature of their choice, resolved through the SAME advanceSacrificeChain the
  // edicts use (0 creatures → clean no-op, CR 701.21a "can't sacrifice … a permanent they don't control"; 1 → forced;
  // ≥2 → the pending-sacrifice choice: a human picks, an AI auto-sacs its least valuable — the established
  // chain policy). An α2-peeled "you may sacrifice a creature" arrives with optional:true and rides the
  // generic optional-effect pause (runProgram), so a may-sac is never forced. ALL-OR-NOTHING bare
  // "a creature" (count 1, unfiltered) — a count / typed / filtered / conjoined victim ("two creatures",
  // "a creature with flying", "a creature or land") fails the exact anchor → low → Arbiter (a wrong-victim
  // sac is a forbidden FP, CREED). Placed before the target-player edicts (disjoint anchors regardless).
  if (/^sacrifice a creature$/.test(t)) return { op: "sacrifice", who: "controller", what: "creature" };
  // ⭐ THE CONTROLLER'S VICTIM VOCABULARY (2026-07-30) — measured early in the run and carried until now.
  // The line directly above was the ENTIRE controller-subject arm: one string. Its four sibling SUBJECTS
  // (target player / each player / each opponent / the upkeep player, all below) each carry EDICT_NOUN +
  // permanent + TYPED, and every one of them resolves through the SAME advanceSacrificeChain — which threads
  // `atom.what` onto the queue head regardless of `who` and narrows the pool via sacrificePoolMatch. So the
  // RUNTIME has supported all eleven pools for any subject since it was written; only this parse arm was
  // narrow. Textbook axis: capability on four arms of a function, absent on the fifth.
  //
  // ⛔ SCOPED TO THE POOLS THE RUNTIME ACTUALLY NARROWS ON, nothing else. A count ("two creatures"), a
  // characteristic filter ("a creature with flying"), or a conjoined victim fails the anchor → low → Arbiter,
  // exactly as the comment above demands — a wrong-victim sacrifice is a forbidden FP.
  //
  // "a land" is deliberately absent: sacLand.js already owns the controller's land sacrifice (including the
  // counted forms), and duplicating it here would give one printed phrase two parsers.
  // ("another" 2026-08-14 — Korvold, Fae-Cursed King "sacrifice another permanent": the SOURCE is never a
  // legal victim, CR 109.5. excludeSource threads ctx.sourceId → the queue head's excludeId, which the
  // chain's candidate filter honors — the same self-exclusion discipline every "another …" arm carries.)
  const csac = t.match(/^sacrifice (?:an?|(another)) (permanent|artifact|enchantment|nontoken creature|creature token|planeswalker|artifact or enchantment)$/);
  if (csac) {
    const POOL = { permanent: "permanent", artifact: "artifact", enchantment: "enchantment",
      "nontoken creature": "nontokenCreature", "creature token": "creatureToken", planeswalker: "planeswalker",
      "artifact or enchantment": "artifactOrEnchantment" };
    return { op: "sacrifice", who: "controller", what: POOL[csac[2]], ...(csac[1] ? { excludeSource: true } : {}) };
  }
  // NAMED-TOKEN victim (The Cabbage Merchant) — "Sacrifice a Food token." Validated against NAMED_TOKENS,
  // the same registry the mint side uses. The trailing "token" is optional: both spellings are printed.
  const tokSac = t.match(/^sacrifice an? ([a-z]+)(?: token)?$/);
  if (tokSac && Object.prototype.hasOwnProperty.call(NAMED_TOKENS, tokSac[1])) {
    return { op: "sacrifice", who: "controller", what: `token:${tokSac[1]}` };
  }
  // CREATURE-SUBTYPE victim (2026-08-12 — Palani's Hatcher "sacrifice an Egg, then create a 3/3…"): a
  // CURATED subtype allowlist, one entry per measured carrier (TF-1 — never a general subtype guess; an
  // unlisted subtype stays low → Arbiter). The pool is `subtype:<Sub>`; sacrificePoolMatch word-anchors
  // it against the live type line, so Palani's own 0/1 Dinosaur Egg tokens qualify and nothing else does.
  if (tokSac && SAC_SUBTYPE_NOUNS.has(tokSac[1])) {
    return { op: "sacrifice", who: "controller", what: `subtype:${tokSac[1].charAt(0).toUpperCase()}${tokSac[1].slice(1)}` };
  }
  // The victim NOUN. "creature" is the legacy bare form and stays byte-identical; the three filtered nouns
  // are the token-split / planeswalker pools above. Ordered LONGEST-FIRST so "creature token" can never be
  // shaved to "creature" with a dangling " token" (JS would backtrack into the right branch anyway — the
  // ordering makes it not depend on that).
  const EDICT_NOUN = "(nontoken creature|creature token|planeswalker|creature)";
  const EDICT_POOL = { "nontoken creature": "nontokenCreature", "creature token": "creatureToken", planeswalker: "planeswalker", creature: "creature" };
  const CHOICE = "(?: of (?:their|his or her) choice)?";
  let m = t.match(new RegExp(`^target (player|opponent) sacrifices a ${EDICT_NOUN}${CHOICE}$`));
  if (m) return { op: "sacrifice", targetType: m[1] === "opponent" ? "opponent" : "player", what: EDICT_POOL[m[2]] };
  m = t.match(new RegExp(`^each player sacrifices a ${EDICT_NOUN}${CHOICE}$`));
  if (m) return { op: "sacrifice", who: "eachPlayer", what: EDICT_POOL[m[1]] };
  m = t.match(new RegExp(`^each (?:opponent|other player) sacrifices a ${EDICT_NOUN}${CHOICE}$`));
  if (m) return { op: "sacrifice", who: "eachOpponent", what: EDICT_POOL[m[1]] };
  // PERMANENT-EDICT (CR 701.16) — "sacrifices a permanent of their choice" (Silverclad Ferocidons, Martyr's
  // Bond, Possessed Portal, the Rishadan pirates, Crack the Earth). The SACRIFICING player chooses ANY
  // permanent they control, not just a creature — so the victim pool is broadened to ALL their permanents in
  // advanceSacrificeChain (what:"permanent"). Genuinely resolvable + hidden-info-safe: each sacrificer's
  // permanents are public and the chooser IS their controller; an empty board is a clean no-op. ALL-OR-NOTHING
  // bare "a permanent" (count 1, unfiltered) — a count / typed ("an artifact or creature") / conjoined victim
  // fails the exact anchor → low → Arbiter (a wrong-victim sac would be a forbidden FP, CREED). The optional
  // "of their/his or her choice" suffix mirrors the creature matchers (Magic prints both forms).
  m = t.match(/^target (player|opponent) sacrifices a permanent(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", targetType: m[1] === "opponent" ? "opponent" : "player", what: "permanent" };
  m = t.match(/^each player sacrifices a permanent(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachPlayer", what: "permanent" };
  m = t.match(/^each (?:opponent|other player) sacrifices a permanent(?: of (?:their|his or her) choice)?$/);
  if (m) return { op: "sacrifice", who: "eachOpponent", what: "permanent" };
  // TYPED-EDICT (CR 701.16) — "sacrifices a/an <land|artifact|enchantment|artifact or enchantment>" (Yawning
  // Fissure: "Each opponent sacrifices a land of their choice."; Tribute to the Wild: "…an artifact or
  // enchantment of their choice."; the Baleful Beholder "…an enchantment" mode). The sacrificing player chooses
  // a permanent OF THAT TYPE (advanceSacrificeChain narrows the pool via sacrificePoolMatch). Genuinely
  // resolvable + hidden-info-safe (each sacrificer's permanents are public, the chooser IS their controller; an
  // empty-of-that-type board is a clean no-op). The TYPE_POOL map keys the canonical pool name off the matched
  // phrase. ALL-OR-NOTHING: a count / "nontoken …" / a restriction ("…with flying") / conjoined victim
  // ("an artifact and a land") fails the exact anchor → low → Arbiter (a wrong-victim sac is a forbidden FP, CREED).
  const TYPED = "(land|artifact|enchantment|artifact or enchantment)";
  const TYPE_POOL = { land: "land", artifact: "artifact", enchantment: "enchantment", "artifact or enchantment": "artifactOrEnchantment" };
  m = t.match(new RegExp(`^target (player|opponent) sacrifices an? ${TYPED}(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", targetType: m[1] === "opponent" ? "opponent" : "player", what: TYPE_POOL[m[2]] };
  m = t.match(new RegExp(`^each player sacrifices an? ${TYPED}(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", who: "eachPlayer", what: TYPE_POOL[m[1]] };
  m = t.match(new RegExp(`^each (?:opponent|other player) sacrifices an? ${TYPED}(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", who: "eachOpponent", what: TYPE_POOL[m[1]] };
  // ===== UPKEEP-PLAYER EDICT (BLITZ TR-2, CR 503.1a / 701.21) ===== "the upkeep player sacrifices a[n]
  // <pool> of their choice" — the SENTINEL detectTriggers emits for an "each player's upkeep" trigger's
  // "that player sacrifices …" (Molder Slug "an artifact"; Braids, Cabal Minion "an artifact, creature, or
  // land"; Destructive Flow "a nonbasic land"; Kuon's Essence-style "a creature"). Corpus-clean phrase (only
  // the event-gated rewrite produces it); who:"upkeepPlayer" reads ctx.upkeepPlayerId and the triggerRouting
  // referent gate pins the atom to the upkeep event. The pool set is the exact evidenced list — the shared
  // TYPED pools plus the two TR-2 additions (three-way union / nonbasic land). ALL-OR-NOTHING: a count /
  // filtered victim ("a monocolored creature" — Defiler of Souls; "a non-Elf creature" — Ruthless Winnower;
  // "a green or white permanent" — Dystopia) fails the exact anchor → low → Arbiter (a wrong-victim sac is
  // a forbidden FP, CREED).
  const UP_POOL = { ...TYPE_POOL, creature: "creature", permanent: "permanent", "artifact, creature, or land": "artifactCreatureOrLand", "nonbasic land": "nonbasicLand" };
  m = t.match(new RegExp(`^the upkeep player sacrifices an? (creature|permanent|nonbasic land|artifact, creature, or land|${TYPED.slice(1, -1)})(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", who: "upkeepPlayer", what: UP_POOL[m[1]] };
  // ⭐⭐ DAMAGED-PLAYER EDICT (DP-SAC, 2026-08-05 — Demon of Loathing, Cabal Executioner, Destructive Urge,
  // Akki Underminer): "Whenever <source> deals combat damage to a player, THAT PLAYER sacrifices a[n]
  // <pool>". The structural twin of the upkeep arm directly above and the defending-player arm below —
  // same pool, same all-or-nothing anchor, only the referent differs (ctx.damagedPlayerId).
  // ⛔ THE ANAPHOR STAYS LITERAL HERE, unlike the upkeep / cast / draw arms. Those needed an event-gated
  // SENTINEL rewrite because their events do not bind a damaged player; the combat-damage family is the
  // one whose bare "that player" the existing who:"damagedPlayer" atoms already own, and triggerRouting's
  // DAMAGED_PLAYER_EVENTS gate keeps it off every other event. So this arm reads the printed words.
  // ⛔ SAME ALL-OR-NOTHING POOL: a count or filtered victim fails the exact anchor → Arbiter. A
  // wrong-victim sacrifice is a forbidden FP (CREED), and an unenforced filter is exactly that.
  m = t.match(new RegExp(`^that player sacrifices an? (creature|permanent|nonbasic land|artifact, creature, or land|${TYPED.slice(1, -1)})(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", who: "damagedPlayer", what: UP_POOL[m[1]] };
  // ===== DEFENDING-PLAYER EDICT (BLITZ TR-2, CR 508.5 / 701.21) ===== "defending player sacrifices a
  // creature of their choice" (Nefarox, Overlord of Grixis — an attacks-alone payoff). who:"defendingPlayer"
  // reads ctx.defenderId (threaded on attacks / attacksAlone / becomesBlocked — the same referent AFFLICT's
  // life-loss rides); the triggerRouting DEFENDING_PLAYER_EVENTS gate keeps it off every other event (a
  // spell / non-combat trigger leaves the referent unset → clean no-op → never native there).
  // ⭐ POOL WIDENED TO THE SHARED UP_POOL (DP-TAIL, 2026-08-05 — Thresher Beast "defending player
  // sacrifices a LAND of their choice"). This arm was the narrowest of the four referent edicts: the
  // upkeep and damaged-player arms above both take the full pool, and this one was bare-creature only.
  // ⛔ THE COMMENT THIS REPLACES SAID "BARE creature pool only — a typed/filtered/count variant fails the
  // exact anchor". The FILTERED and COUNT halves of that are unchanged and still refuse: UP_POOL is a
  // fixed allowlist of printed pool NOUNS (creature / permanent / nonbasic land / the typed set), not a
  // wildcard, so "a non-Elf creature" and "two creatures" still miss the anchor and stay on the Arbiter.
  // Only the NOUN set widened, to exactly the set its siblings already accept and the resolver already
  // honours — a wrong-victim sacrifice remains unreachable from here.
  m = t.match(new RegExp(`^defending player sacrifices an? (creature|permanent|nonbasic land|artifact, creature, or land|${TYPED.slice(1, -1)})(?: of (?:their|his or her) choice)?$`));
  if (m) return { op: "sacrifice", who: "defendingPlayer", what: UP_POOL[m[1]] };
  return null;
}

/**
 * ORDEAL THRESHOLD-SAC clause parser (BLITZ OC-1, the Theros Ordeal cycle) — the sentinel-tagged second
 * sentence of the Ordeal attack trigger ("… Then if it has three or more +1/+1 counters on it, sacrifice
 * this Aura."). The [ordeal-threshold-sac] marker phrase is emitted ONLY by the detectTriggers Ordeal
 * rewrite (gated to the attacks/equippedCreature descriptor whose WHOLE effect matched the exact printed
 * pair), so a spell's / any other clause's text can never reach this atom — the same sentinel discipline as
 * [self-return:*] / [dies-return-bf]. Anchored to the exact marker sentence; anything else → null.
 */
export function ordealThresholdSacClauseParser(clause) {
  const t = String(clause || "").toLowerCase().trim();
  if (/^\[ordeal-threshold-sac\] sacrifice this aura if the triggering creature has three or more \+1\/\+1 counters on it$/.test(t)) {
    return { op: "ordeal-threshold-sac", counterType: "+1/+1", threshold: 3 };
  }
  return null;
}

/**
 * ORDEAL THRESHOLD-SAC resolver (BLITZ OC-1) — "Then if it has three or more +1/+1 counters on it,
 * sacrifice this Aura." Runs AFTER the counter atom in the same program (CR 608.2c — instructions in the
 * order written), so the threshold is read at exactly the printed point: the HOST's live +1/+1 counter
 * count (ALL of them, not just this Aura's — the printed "it has three or more", counting counters from
 * any source) — the just-placed counter included.
 *   - host = ctx.triggeringPermanentId (the attacker that fired the attacks/equippedCreature trigger =
 *     the enchanted creature). Host gone at resolution → the count can't be read off the battlefield and
 *     the Aura is already graveyard-bound by the SBA (CR 704.5m) → a clean no-op, never a blind sacrifice.
 *   - the Aura = ctx.sourceId (the trigger's SOURCE permanent, CR 113.7). Already left (destroyed in
 *     response) → nothing to sacrifice (CR 701.21a — a sacrifice moves it FROM the battlefield) → no-op.
 * Threshold met → sacrificeCreatureEffect under the AURA's current controller (CR 701.21a — its controller
 * moves it to the graveyard): the shared effect-sac chokepoint, so the sacrifice fires the sac watchers AND
 * the Aura's own "When you sacrifice this Aura" payoff (checkSacrificeTriggers' youSacrificeThis look-back,
 * CR 603.10a). Below-threshold → logged no-op.
 */
function applyOrdealThresholdSac(state, atom, ctx) {
  const hostLk = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
  const have = hostLk ? (hostLk.permanent.counters?.[atom.counterType || "+1/+1"] || 0) : 0;
  if (!hostLk || have < (atom.threshold ?? 3)) {
    return logEvent(state, { kind: "spell-effect", effect: "ordeal-threshold-sac", controller: ctx.controller, sacrificed: null, counters: have });
  }
  const auraLk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!auraLk) {
    return logEvent(state, { kind: "spell-effect", effect: "ordeal-threshold-sac", controller: ctx.controller, sacrificed: null, counters: have });
  }
  return sacrificeCreatureEffect(state, auraLk.controller, ctx.sourceId);
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
  // TRIG-PRONOUN exile (SHELF CAP4 — Kaldra Compleat's granted "Whenever this creature deals combat damage
  // to a creature, EXILE that creature"): the destroy sentinel's exile twin, byte-for-byte the same
  // referent plumbing — target:"thatCreature" → atomTargets/triggeringTargets → ctx.triggeringPermanentId
  // (the damaged creature), resolved through the SAME applyZoneMove the targeted-exile atoms use. Only the
  // detectTriggers rewrite produces this phrase (zero printed oracle text), so a spell anaphor never
  // reaches it; an absent id is a clean no-op.
  if (/^exile the triggering creature$/.test(t)) return { op: "exile", target: "thatCreature" };
  // BASILISK TOUCH (BLITZ DG-1, CR 511) — the DELAYED twin of the sentinel above: "destroy the triggering
  // creature at end of combat" (Deathgazer's "destroy that creature at end of combat", rewritten to the
  // sentinel by the DG-1 fire site in checkBlockTriggers). The resolver does NOT destroy now — it enqueues
  // a turn-stamped entry on state.endOfCombatEffects, which combatResolution drains at the end-of-combat
  // boundary (after the last damage sub-step's SBA + dies triggers). Only the trigger synthesis produces
  // this phrase — it appears in zero printed oracle text, so a spell anaphor can never reach it.
  if (/^destroy the triggering creature at end of combat$/.test(t)) return { op: "destroy-at-end-of-combat", target: "thatCreature" };
  // SELF AT END OF COMBAT (④-AX, 2026-09-04 — CR 511 / 603.7): "When this creature attacks or blocks, SACRIFICE IT at end
  // of combat" (Mardu Blazebringer, Runaway Carriage, Fog Elemental) and "… RETURN IT to its owner's hand at end of combat"
  // (Windscouter, Phantom Whelp, Quicksilver Behemoth). The OR-1 split hands each half (attacks/self, blocks/self) this
  // effect; the resolver does NOT act now — it enqueues a turn-stamped entry on the SAME state.endOfCombatEffects queue the
  // basilisk touch uses, and combatResolution drains it at the end-of-combat boundary (after damage, the lethal SBA and
  // the dies look-backs). "it" is the SOURCE (scope self — CR 113.7); a source that already left combat-damage-dead is a
  // clean skip at the drain ("Return it only if it's on the battlefield" — the printed reminder).
  // BLOCKED-CREATURE BOUNCE AT END OF COMBAT (④-BB, 2026-09-04 — Wall of Tears / Aether Membrane "Whenever this creature
  // blocks a creature, return THAT creature to its owner's hand at end of combat"): the blocksCreature flush threads the
  // blocked ATTACKER as the triggering permanent (checkBlockTriggers — the BLOCKER is the source, the attacker the
  // referent, CR 509.1a), and the detector rewrites the anaphor to the sentinel below. Same queue, same drain, same stale
  // guard as the self form; an attacker that died to combat damage is a clean skip.
  if (/^return the triggering creature to its owner's hand at end of combat$/.test(t)) return { op: "bounce-at-end-of-combat", target: "thatCreature" };
  const seoc = t.match(/^(sacrifice|return) (?:it|this creature)( to its owner's hand)? at end of combat$/);
  if (seoc && (seoc[1] === "sacrifice") === !seoc[2]) return { op: "self-at-end-of-combat", action: seoc[1] === "sacrifice" ? "sacrifice" : "bounce", target: "self", targetType: null };
  // DETAIN (BLITZ DT-1, CR 610.3 — the Banishing Light / Banisher Priest / Oblivion-Ring-modern frame):
  // "exile <target …> until this <enchantment|creature|artifact|permanent> leaves the battlefield." The
  // TARGET vocabulary is delegated to THIS parser recursively (strip the until-tail, parse the bare exile) so
  // the unions / controller scopes / MV filters stay single-sourced — then `untilSourceLeaves` is stamped on
  // the atom. The resolver (zones.applyExileUntilLeaves) links the exiled card to the SOURCE permanent
  // (detainedExile), and checkLeavesTriggers synthesizes the [detain-return] one-shot when the source leaves
  // (ANY exit — bounce included, CR 610.3a). Per CR 610.3b, a source already gone at resolution → the exile
  // doesn't happen at all (the resolver's source guard). An inner shape the bare parser doesn't model (an
  // "up to one target" form, an unmodeled union) returns null → LOW → Arbiter (a safe FN, whole-card CREED).
  // typeNeg:aura — a detained AURA would need attach-on-return modeling (CR 611.3c owner's choice); v1
  // excludes auras AT ENUMERATION (never offered, never a silent resolver skip) — a documented narrow FN.
  {
    // SHELF-85 V15 (2026-09-04 — Chains of Custody / Sheltered by Ghosts "When this Aura enters, exile target nonland
    // permanent an opponent controls until this AURA leaves the battlefield"): the Aura noun joins the alternation — the
    // detain link is keyed on the source permanent's id, so an Aura source returns the card on ANY exit exactly like an
    // enchantment source (its host dying takes the Aura with it, CR 704.5m → the return fires).
    const dtm = t.match(/^exile (.+?) until this (?:enchantment|creature|artifact|permanent|aura) leaves the battlefield$/);
    if (dtm) {
      let body = dtm[1];
      const extra = [{ kind: "typeNeg", type: "aura" }];
      // "another target …" (Oblivion Ring) — the source can't detain itself (CR 109.5); normalize + notSource.
      if (/^another target /.test(body)) { body = body.replace(/^another target /, "target "); extra.push({ kind: "notSource" }); }
      // "target tapped creature …" (Seal Away / Glass Casket's kin) — the tapped restriction, then normalize.
      if (/^target tapped creature\b/.test(body)) { body = body.replace("target tapped creature", "target creature"); extra.push({ kind: "tapped", value: true }); }
      // "… with mana value N or less" AFTER a controller scope (Portable Hole / Circle of Confinement) — the
      // bare mvm matcher below can't carry both, so the MV rides as a normalized restriction here.
      const mvTail = body.match(/ with mana value (\d+) or less$/);
      if (mvTail) { body = body.slice(0, -mvTail[0].length); extra.push({ kind: "manaValue", op: "<=", value: parseInt(mvTail[1], 10) }); }
      let inner = destroyExileClauseParser(`exile ${body}`);
      if (!inner) {
        // Bare "target creature [an opponent controls]" — the shared `rm` matcher deliberately excludes the
        // bare creature type (legacy-path territory), so the detain frame admits it here explicitly.
        const cm = body.match(/^target creature(?: (an opponent controls|you don't control))?$/);
        if (cm) inner = { op: "exile", targetType: "creature", restrictions: cm[1] ? [{ kind: "controller", who: "opponent" }] : [] };
      }
      if (inner && inner.op === "exile" && inner.targetType && !inner.untilSourceLeaves) {
        return { ...inner, untilSourceLeaves: true, restrictions: [...(inner.restrictions || []), ...extra] };
      }
      return null;
    }
  }
  if (/^exile target creature$/.test(t)) return { op: "exile", targetType: "creature" };
  // TRIPLE-UNION with a flying-bound creature alternative (BLITZ BW-1, CR 601.2c) — "(destroy|exile) target
  // artifact, enchantment, or creature with flying" (destroy: Broken Wings / Return to the Earth / Airship
  // Crash; exile: Shoot Down — BOTH verbs corpus-evidenced, the rm frame's destroy|exile symmetry). The
  // "with flying" restriction binds ONLY the CREATURE alternative — an artifact/enchantment needs no flying —
  // so it can't ride the flat restrictions array (which applies to every candidate); the dedicated
  // artifactOrEnchantmentOrFlyingCreature targetType carries the union INTO enumeration, where the creature
  // arm is gated LAYER-AWARE via permanentHasKeyword (a granted flyer is a legal target, a ground creature
  // never offered — spellEffects.enumerateTargets' dedicated branch). The exact `$` anchor rejects the probed
  // near-misses: a different tail ("with power 4 or greater" — Exorcise), the 4-way battle union (Atraxa's
  // Fall), any controller scope or rider, and unevidenced orderings → null → LOW → Arbiter (FN-safe). Listed
  // in parser.PERMANENT_TARGET_TYPES so the trigger-flush gate keeps treating it as chosen-permanent removal.
  const tripleM = t.match(/^(destroy|exile) target artifact, enchantment, or creature with flying$/);
  if (tripleM) {
    return { op: tripleM[1] === "destroy" ? "destroy" : "exile", targetType: "artifactOrEnchantmentOrFlyingCreature", restrictions: [] };
  }
  // SHELF-85 N8 (2026-09-04 — Bedevil "Destroy target artifact, creature, or planeswalker"): the plain three-type
  // union, a PERMANENT_PREDICATES entry (spellEffects) so the enumerator offers exactly those three types.
  const acpM = t.match(/^(destroy|exile) target artifact, creature, or planeswalker$/);
  if (acpM) {
    return { op: acpM[1] === "destroy" ? "destroy" : "exile", targetType: "artifactCreatureOrPlaneswalker", restrictions: [] };
  }
  // The two-type UNION list admits BOTH printed word-orders for the artifact/creature union — "creature or
  // artifact" (the order most cards print) AND "artifact or creature" (Putrefy: "Destroy target artifact or
  // creature. It can't be regenerated." — the cannotRegenerate rider is re-stamped by the parseEffectClause
  // wrapper). Both map to the SAME `creatureOrArtifact` targetType (the union predicate is order-free — it
  // matches a permanent that is a Creature OR an Artifact), so the alias can never mis-scope; zones.js's
  // bounce/tuck matchers already accept "artifact or creature" for the identical union.
  // NONBASIC-LAND / NONCREATURE-PERMANENT (CR 205.4a / 205.2 — a "nonbasic land" lacks the Basic supertype; a
  // "noncreature permanent" is any permanent that isn't a Creature). The land-destruction staple ("destroy
  // target nonbasic land" — Goblin Ruinblaster, Sinkhole-type body) and the broad "destroy target noncreature
  // permanent" (Mold Shambler) reuse the SAME destroy machinery — only the targetType's eligibility predicate
  // differs (added to PERMANENT_PREDICATES in spellEffects.js). Both are exact single-target anchors; a damage
  // rider (Molten Rain) or a printed union with nonbasic ("artifact or nonbasic land" — Pillage) fails the `$`
  // → low → Arbiter (whole-card CREED, never a partial). The "can't be regenerated" rider is re-stamped onto
  // this destroy atom by the parseEffectClause wrapper, exactly like the other destroy filters.
  // DEFENDING-PLAYER scope (CR 509.1a — the attacked player) — "destroy target artifact or enchantment defending
  // player controls" (Kogla, the Titan Ape's attacks trigger). It's an ATTACKS-only referent: the eligible target
  // pool is the SPECIFIC defending player's permanents (ctx.defenderId, threaded by triggers.checkAttackTriggers),
  // NOT "any opponent's" — offering a NON-defending opponent's artifact in multiplayer would be a wrong target
  // (a FORBIDDEN FP, CREED). So the scope emits (a) a controller restriction who:"defendingPlayer" that the
  // enumerator resolves against ctx.defenderId, filtering the pool to exactly that player's permanents, AND (b)
  // an atom-level who:"defendingPlayer" so the combat-referent gate (triggerRouting.combatDamageReferentSatisfied
  // / coverage's spell guard) pins this destroy to the ATTACKS event — on any other event ctx.defenderId is unset
  // → the target pool is empty → the trigger is dropped no-target, never a mis-scoped destroy (SAFE, CREED).
  // DAMAGED-PLAYER scope (CR 510.2 — the just-combat-damaged player) — "destroy target artifact or enchantment
  // that player controls" (Aberrant's "Heavy Power Hammer" combat-damage trigger). "That player" back-references
  // the player this creature just dealt combat damage to (CR 608.2c). It's a COMBAT-DAMAGE-only referent, the
  // exact mirror of defendingPlayer: the eligible pool is the SPECIFIC damaged player's permanents
  // (ctx.damagedPlayerId, threaded by triggers.checkCombatDamageTriggers), NOT "any opponent's". So it emits (a)
  // a controller restriction who:"damagedPlayer" the enumerator resolves against ctx.damagedPlayerId, filtering
  // to exactly that player's permanents, AND (b) an atom-level who:"damagedPlayer" so the combat-referent gate
  // pins this destroy to combatDamageToPlayer — on any other event (a spell, a non-combat trigger) ctx.damaged-
  // PlayerId is unset → empty pool → the ability drops no-target, never a mis-scoped destroy (SAFE, CREED).
  // COLOR-POS (CR 105.2) — an optional COLOR adjective in front of the noun: "destroy target BLUE permanent"
  // (Red Elemental Blast / Hydroblast), "destroy target MULTICOLORED permanent" (Null Elemental Blast). The
  // colour rides as a `color`/`multicolored` restriction, which enumerateTargets evaluates LAYER-AWARE
  // (permanentColors, after layer 5) — so a permanent turned blue IS a legal target and a printed-blue one
  // turned white is NOT. A restriction only ever REMOVES candidates from the pool, so this cannot widen an
  // existing target set: every noun that matched before matches identically with the group absent (CREED).
  // NONCREATURE ARTIFACT / ENCHANTMENT (Crush, Overwhelming Surge, Haywire Mite, Joven, Guerrilla Gorilla).
  // Listed BEFORE the bare "artifact"/"enchantment" alternatives so the qualifier is consumed whole — a
  // left-to-right alternation would otherwise let "artifact" match and silently drop the "noncreature",
  // widening the target set to include artifact CREATURES: the forbidden over-delivery. The enumerator side
  // (spellEffects' predicate table) is layer-aware, so an ANIMATED artifact is excluded too.
  // ⭐ CD-1 — the colour slot accepts a DISJUNCTION ("target black or red permanent" — Celestial Purge,
  // Lightwielder Paladin). Inner groups are NON-CAPTURING so every existing group number below is unchanged.
  // ⚠️ THIS COMMENT ORIGINALLY CLAIMED THE ALTERNATION ORDER WAS LOAD-BEARING — that listing the pair first
  // was what stopped "black or red" matching as bare "black". **That claim is false, and a surviving mutant
  // is how it was found**: reordering the alternation changes NOTHING here, because the pattern is anchored
  // (`^…$`) and the noun group must consume the rest. A bare "black" leaves "or red permanent", which no
  // noun alternative matches, so the whole match fails and backtracking finds the pair regardless. Written
  // down rather than quietly deleted, because the order IS load-bearing in the sibling parse in
  // spellEffects.js — there the two matches are separate statements against free-form text with no anchor
  // to force the issue, and moving the pair match after the single one parks Deathmark immediately (that
  // mutation was run; it kills two pins). Same-looking code, opposite conclusion, for a reason worth keeping.
  // DD-1 (2026-08-06) — the trailing "that was dealt damage this turn" qualifier (Vraska's Finisher, Jarl of
  // the Forsaken) is admitted as a SECOND optional group after the scope. This pattern is fully anchored
  // (`^…$`), which is why the union lane accepted a controller scope and refused this qualifier: there was
  // simply nowhere for it to go. Purely additive — absent, both new groups are undefined and every
  // previously-parsed card emits a byte-identical atom.
  // ⛔ It is a separate group rather than a widening of the scope alternation on purpose: the scope group
  // feeds `controllerWho`, which defaults to "opponent" for ANY non-empty value it does not recognise. A
  // qualifier smuggled into that slot would silently become an opponent-controls restriction — a wrong
  // restriction on a card the tier then reports as native, which is the silent do-nothing this very
  // function already carries a guarded branch against.
  // ("up to one target" 2026-08-14 — She-Hulk Jade Defender "Destroy up to one target artifact or
  // enchantment": choosing ZERO is legal, CR 601.2c. The optional prefix group stamps maxTargets:1 +
  // minTargets:0 — the exact "up to ONE target" subset path targeting already documents (subsets [t] or
  // []). Absent, every previously-parsed card emits a byte-identical atom.)
  const rm = t.match(/^(destroy|exile) (up to one )?target (?:((?:white|blue|black|red|green) or (?:white|blue|black|red|green)|white|blue|black|red|green|multicolored) )?(artifact, enchantment, or nonbasic land|noncreature artifact or noncreature enchantment|noncreature artifact|noncreature enchantment|artifact, enchantment, or land|artifact or enchantment|creature or enchantment|creature or land|creature or artifact|artifact or creature|creature or planeswalker|creature or vehicle|artifact or land|enchantment or land|nonland permanent|noncreature permanent|nonbasic land|artifact|enchantment|land|permanent|planeswalker)(?: (an opponent controls|you don't control|you control|defending player controls|that player controls))?(?: (that (?:was|were) dealt damage this turn))?$/);
  if (rm) {
    const TT = {
      "artifact": "artifact", "enchantment": "enchantment", "land": "land", "permanent": "permanent",
      "nonland permanent": "nonlandPermanent", "noncreature permanent": "noncreaturePermanent",
      "nonbasic land": "nonbasicLand", "artifact or enchantment": "artifactOrEnchantment",
      "noncreature artifact": "noncreatureArtifact", "noncreature enchantment": "noncreatureEnchantment",
      "artifact, enchantment, or land": "artifactEnchantmentOrLand",
      // SG-16 (Boseiju, Who Endures — the NEO channel land): a three-way union whose land arm is NONBASIC only
      // (CR 205.4a). The predicate lives in spellEffects.PERMANENT_PREDICATES; the enumerator's generic
      // predicate path picks it up, so the opponent scope rides the ordinary controller restriction.
      "artifact, enchantment, or nonbasic land": "artifactEnchantmentOrNonbasicLand",
      "noncreature artifact or noncreature enchantment": "noncreatureArtifactOrEnchantment",
      "creature or enchantment": "creatureOrEnchantment", "creature or land": "creatureOrLand",
      "creature or artifact": "creatureOrArtifact", "artifact or creature": "creatureOrArtifact", "artifact or land": "artifactOrLand",
      "enchantment or land": "enchantmentOrLand",
      "creature or planeswalker": "creatureOrPlaneswalker", "planeswalker": "planeswalker", // PW-7
      // ⭐ CV-1 (2026-08-06) — "creature or Vehicle" (CR 301.7: an uncrewed Vehicle is NOT a creature, so
      // this union is not redundant; a crewed one satisfies either arm). The PERMANENT_PREDICATES entry and
      // its enumeration path were built for "Enchant creature or Vehicle" (ES-1) and had exactly ONE
      // consumer — aura subjects. This is the ignition for the removal lane, not new machinery.
      "creature or vehicle": "creatureOrVehicle",
    };
    const controlScope = rm[5];
    const controllerWho = /^you control$/.test(controlScope || "") ? "you"
      : /^defending player controls$/.test(controlScope || "") ? "defendingPlayer"
      : /^that player controls$/.test(controlScope || "") ? "damagedPlayer"
      : "opponent";
    const restrictions = controlScope ? [{ kind: "controller", who: controllerWho }] : [];
    // DD-1 — same restriction kind and same order the creature lane emits, so the two paths stay pin-compatible.
    if (rm[6]) restrictions.push({ kind: "dealtDamageThisTurn", value: true });
    // COLOR-POS: prepend the colour restriction when the optional adjective matched (rm[2]). Absent → the
    // restrictions array is byte-identical to before, so every previously-parsed card is unchanged.
    const COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
    const disjM = String(rm[3] || "").match(/^(white|blue|black|red|green) or (white|blue|black|red|green)$/);
    if (disjM) restrictions.unshift({ kind: "colorAny", colors: [COLOR_LETTER[disjM[1]], COLOR_LETTER[disjM[2]]] });
    else if (rm[3] === "multicolored") restrictions.unshift({ kind: "multicolored" });
    // ⛔ GUARDED, and a survived mutant is why. `COLOR_LETTER[rm[2]]` on an unrecognised colour phrase
    // yields `{kind:"color", color: undefined}` — a restriction that matches NOTHING while the card still
    // classifies native. That is the silent do-nothing, not a safe park: the tier claims the card plays and
    // it targets an empty pool. It was unreachable before CD-1 (the alternation admitted only the five
    // singles), and CD-1 adds a multi-word alternative to that very slot — so the next person who extends
    // the alternation and forgets a branch here gets a REFUSAL, not a card that quietly does nothing.
    else if (rm[3] && COLOR_LETTER[rm[3]]) restrictions.unshift({ kind: "color", color: COLOR_LETTER[rm[3]] });
    else if (rm[3]) return null;   // an admitted colour phrase with no restriction to emit → park, loudly
    const atom = { op: rm[1] === "destroy" ? "destroy" : "exile", targetType: TT[rm[4]], restrictions, ...(rm[2] ? { minTargets: 0, maxTargets: 1 } : {}) };
    // Pin the combat-event referent onto the atom for the combat-referent gate (defending/damaged-player scopes).
    if (controllerWho === "defendingPlayer") atom.who = "defendingPlayer";
    if (controllerWho === "damagedPlayer") atom.who = "damagedPlayer";
    return atom;
  }
  // MV-FILTERED removal (CR 202.3 / 700.6 — mana value as a number) — "(exile|destroy) target <typelist> with mana
  // value N or (greater|less)". The MV-gated single-target removal staples: Despark ("permanent … 4 or greater"),
  // Eliminate ("creature or planeswalker … 3 or less"), Epic Downfall / Kin-Tree Severance ("creature"/"permanent …
  // 3 or greater"), Death in the Family ("creature … 3 or less"), Fragmentize / Natural State ("artifact or
  // enchantment … N or less"). The MV rides as a `manaValue` target restriction (the SAME restriction kind the
  // tap-target-creature path already enforces via creatureSatisfiesRestrictions — reused here for permanent targets
  // by enumerateTargets.addPermanents), so removal offers + removes ONLY a permanent whose mana value satisfies the
  // comparison — never an out-of-band target (THE CREED, enforced at enumeration). The typelist ADMITS bare
  // "creature" here (UNLIKE the unfiltered `rm` above, which excludes it for the legacy parseSpellEffect path —
  // that path models NO restriction, so an MV-filtered bare-creature removal must route through this branch to be
  // enforced). A printed controller restriction ("an opponent controls") would fail the `$` anchor → low → Arbiter
  // (none in the corpus carry both; ALL-OR-NOTHING, FN-safe). cmc reads the slim-index numeric mana value (CR 202.3).
  const mvm = t.match(/^(destroy|exile) target (creature or planeswalker|artifact or enchantment|creature|permanent|artifact|enchantment|planeswalker) with mana value (\d+) or (greater|more|less)$/);
  if (mvm) {
    const TT = {
      "creature": "creature", "permanent": "permanent", "artifact": "artifact", "enchantment": "enchantment",
      "planeswalker": "planeswalker", "creature or planeswalker": "creatureOrPlaneswalker", "artifact or enchantment": "artifactOrEnchantment",
    };
    const op = /^(greater|more)$/.test(mvm[4]) ? ">=" : "<=";
    return { op: mvm[1] === "destroy" ? "destroy" : "exile", targetType: TT[mvm[2]], restrictions: [{ kind: "manaValue", op, value: parseInt(mvm[3], 10) }] };
  }
  // POWER-FILTERED exile (BLITZ PX-1, CR 601.2c) — "exile target creature with power N or (greater|more|
  // less)" (≤: Reaver Ambush / Grotesque Demise / Complete Disregard, all N=3; ≥: Abzan Charm's mode, The
  // Wanderer's −2 — both directions corpus-evidenced). The power rides as the SAME { kind:"power" } target
  // restriction the DESTROY twin already enforces (parser.js's legacy restriction fold — Defeat / Swat /
  // Smite the Monstrous are native today; destroy is deliberately NOT re-anchored here so its proven path
  // stays byte-identical), evaluated LAYER-AWARE at enumeration via creatureSatisfiesRestrictions →
  // creaturePower — a creature pumped to 4 is NOT a legal ≤3 target even if printed 2 (CR 601.2c cast-time
  // legality). Matching the incumbent discipline (the destroy twin + MV-filtered removal): restrictions are
  // ENUMERATION gates; resolution re-checks target EXISTENCE (CR 608.2b fail-safe) but does not re-validate
  // the restriction. Exact `$` anchor — an X-power form ("power X or less", Killing Glare), a controller
  // scope, a toughness variant, or any rider fails → low → Arbiter (FN-safe).
  const pxm = t.match(/^exile target creature with power (\d+) or (greater|more|less)$/);
  if (pxm) {
    const op = /^(greater|more)$/.test(pxm[2]) ? ">=" : "<=";
    return { op: "exile", targetType: "creature", restrictions: [{ kind: "power", op, value: parseInt(pxm[1], 10) }] };
  }
  // RESTRICTED exile (BLITZ SE-1, CR 601.2c) — "exile target <restricted> creature" where the restriction is
  // one the DESTROY twin already models: combat state (attacking / blocking / attacking or blocking), tapped /
  // untapped, power / toughness N or greater|less, color negation (nonblack…), type negation (nonartifact…),
  // with|without flying, and a curated creature subtype. DESTROY has enforced these for years (parser.js's
  // legacy restriction fold — Reprisal / Smite are native), but exile shared only the bare + power forms above,
  // so "Exile target attacking creature" (Not on My Watch), "…tapped creature" (Expel / Excoriate), "…creature
  // with toughness 4 or greater" (Pillar of Light) all parked despite the machinery existing. The restriction
  // PARSER is delegated to the shared parseCreatureTargetRestrictions (removal.js already imports from
  // spellEffects.js — a one-way, cycle-safe edge; the parser is re-anchored to accept an "exile target …"
  // clause) so the vocabulary can NEVER drift from the destroy twin. A CLEAN parse — the whole phrase reduces to
  // the base noun + modeled restrictions; a union ("creature or Spacecraft"), a graveyard clause ("creature card
  // from a graveyard"), or ANY unmodeled qualifier leaves residue → clean=false → no match → LOW → Arbiter
  // (whole-clause anchor, FN-safe) — with >=1 restriction rides as the SAME { restrictions } array
  // creatureSatisfiesRestrictions enforces at ENUMERATION (targeting.atomTargetSpec threads it for every
  // creature-target op; the PX-1 power-filter exile above proves the runtime path end-to-end). The exile
  // resolver (applyZoneMove) then just moves the enumerated-legal target — no restriction re-validation needed.
  // Placed after the bare/power exile matchers so those stay byte-identical (a bare "exile target creature"
  // returns at line 462; the >=1-restriction gate would reject it here regardless).
  if (/^exile target .*\bcreature\b/.test(t)) {
    const { restrictions, clean } = parseCreatureTargetRestrictions({ oracle: clause });
    if (clean && restrictions.length) return { op: "exile", targetType: "creature", restrictions };
  }
  // MULTI-COUNT + COLLECTIVE-X-MV destroy (CR 601.2c "any number of target" + the TOTAL-MV target restriction) —
  // "destroy any number of target artifacts and/or enchantments with total mana value X or less" (Rampaging Yao
  // Guai's {X}-cast ETB). "any number of target" is the unbounded multi-count form (minTargets:0, maxTargets = an
  // effectively-unbounded sentinel that targeting.targetSubsets clamps to the actual eligible count). The
  // "total mana value X or less" is a COLLECTIVE restriction on the CHOSEN SUBSET (CR 601.2c — you choose a set of
  // targets satisfying the restriction), NOT a per-target cap: the SUM of the chosen permanents' mana values must
  // be ≤ the {X} the creature was cast with. It's stamped as `totalMvXConstraint` so targeting.expandAtoms only
  // OFFERS subsets whose MV-sum ≤ ctx.xValue (threaded from the ETB self-trigger's context.xValue — the paid X).
  // Enforced AT ENUMERATION, so the resolver (applyDestroyEffect over ctx.targets) destroys exactly a legal set —
  // never over-destroys past the X budget (a FORBIDDEN partial-model FP, CREED). The "and/or" union maps to the
  // SAME artifactOrEnchantment predicate the "artifact or enchantment" filter uses (order-free OR). Whole-clause
  // anchored; the form WITHOUT the "with total mana value X or less" tail (Consign to Dust — a Strive instant whose
  // count is bounded by its per-target cost) rides the "any number of" alternative of the counted arm below (④-AT).
  if (/^destroy any number of target artifacts and\/or enchantments with total mana value x or less$/.test(t)) {
    return { op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: MULTI_COUNT_UNBOUNDED, totalMvXConstraint: true };
  }
  // FIXED-COUNT "up to N" destroy on the SAME union (Force of Vigor "destroy up to two target artifacts
  // and/or enchantments"; Nature's Claim-style singles stay on the anchored single-target arm above). Rides
  // the Yao Guai lane end-to-end — same artifactOrEnchantment predicate, same subset enumeration
  // (minTargets:0 → choosing zero is legal, CR 601.2c), same applyDestroyEffect over ctx.targets — with a
  // FIXED cap instead of the unbounded sentinel and no collective-MV constraint. "and/or" only: the plain
  // "artifacts or enchantments" print is a different wording that has not been probed → stays LOW (FN-safe).
  const upM = t.match(/^destroy (up to (one|two|three|four)|any number of) target artifacts and\/or enchantments$/);
  if (upM) {
    const N = { one: 1, two: 2, three: 3, four: 4 };
    // ④-AT (2026-09-04): "any number of" (Consign to Dust — a STRIVE card; its per-target cost rides the cast lane off
    // program.strivePerTarget) — the unbounded sentinel with `anyNumber` so the expander offers the largest subsets first.
    if (!upM[2]) return { op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: MULTI_COUNT_UNBOUNDED, anyNumber: true };
    return { op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: N[upM[2]] };
  }
  if (/^destroy all creatures$/.test(t)) return { op: "destroy", targetType: "eachCreature" };
  if (/^exile all creatures$/.test(t)) return { op: "exile", targetType: "eachCreature" };
  // MASS-EXILE PARITY (CR 701.8a destroy / 701.10a exile) — the typed mass list was bound to the DESTROY verb
  // while exile only ever got "all creatures", so "Exile all artifacts" (Farewell, EDHREC #163) parsed low even
  // though BOTH halves already shipped: "destroy all artifacts" is HIGH and "exile all creatures" is HIGH. The
  // two were simply never crossed. The verb becomes a capture group; the targetType and its resolution path are
  // untouched, and the exile op already handles a mass (non-chosen) target set — the eachCreature exile above is
  // the proof, and the runtime test in massExileByType.test.js pins the artifact/enchantment/land arms directly
  // rather than trusting that symmetry.
  const m = t.match(/^(destroy|exile) all (artifacts and enchantments|artifacts|enchantments|lands)$/);
  if (m) {
    const TT = { "artifacts": "eachArtifact", "enchantments": "eachEnchantment", "lands": "eachLand", "artifacts and enchantments": "eachArtifactOrEnchantment" };
    return { op: m[1] === "destroy" ? "destroy" : "exile", targetType: TT[m[2]] };
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
  // POWER-FILTERED CREATURE WIPE (BLITZ PW-1 — Elspeth, Sun's Champion "−3: Destroy all creatures with power 4
  // or greater"; Solar Tide / Retribution of the Meek / Dusk // Dawn / Draw Team Lines — 8 corpus carriers):
  // the eachCreature wipe NARROWED by an effective-power threshold. massCreatureTargets reads LAYER-AWARE
  // creaturePower (CR 613.3 — counters + anthems counted), so the set is exactly the creatures whose CURRENT
  // power meets the bound at resolution (CR 208.1 power, CR 701.8a destroy). "greater" → power ≥ N; "less" →
  // power ≤ N. eachCreature stays a NON-chosen mass target (no rider, no target choice). A non-integer bound /
  // "greater than" (strict) / any trailing rider fails the exact `$` → low → Arbiter (CREED whole-clause).
  const mpow = t.match(/^destroy all creatures with power (\d+) or (greater|less)$/);
  if (mpow) return { op: "destroy", targetType: "eachCreature", powerCmp: mpow[2] === "greater" ? ">=" : "<=", powerVal: parseInt(mpow[1], 10) };
  // MANA-VALUE-FILTERED CREATURE WIPE (CR 202.3) — the direct sibling of the power form above: Austere
  // Command (EDHREC #169) "Destroy all creatures with mana value 3 or less" / "… 4 or greater". Same
  // eachCreature wipe, narrowed by mana value instead of power (massCreatureTargets reads card.cmc).
  // "destroy all creatures" was ALREADY high — only this qualifier was missing, which is why a top-200
  // staple sat on the Arbiter. Exact `$` anchor: a rider or "greater than" (strict) fails → low (CREED).
  const mmv = t.match(/^destroy all creatures with mana value (\d+) or (greater|less)$/);
  if (mmv) return { op: "destroy", targetType: "eachCreature", mvCmp: mmv[2] === "greater" ? ">=" : "<=", mvVal: parseInt(mmv[1], 10) };

  // ⭐ THE GENERAL ARM — delegate the recipient phrase to the SHARED restriction grammar, exactly as the
  // mass-DAMAGE arm does. Placed LAST so every exact matcher above stays byte-identical (the ordering rule).
  //
  // THE AXIS THIS CLOSES. The matchers above hand-roll four filters onto bespoke atom fields — subtypeFilter
  // (+negate), powerCmp, mvCmp, landSubtype — while `creatureSatisfiesRestrictions` has sixteen kinds, and the
  // damage verb has been able to say all of them since the recipient delegation. Same printed filter, sayable
  // to one verb and not its neighbour. Now `massCreatureTargets` reads that grammar too (the satisfier was
  // extracted to a leaf so this file's target enumerator could reach it), so a destroy/exile/bounce can say
  // "all tapped creatures", "all nonartifact creatures", "all green creatures", "all attacking creatures".
  //
  // ⛔ "ALL" IS PEELED AND THE NOUN IS SINGULARIZED HERE, NOT DELEGATED — two separate reasons, both measured.
  // (a) parseCreatureTargetRestrictions' filler list contains "each" but NOT "all", so "all" would survive as
  //     residue and refuse every card in the vein.
  // (b) The mass-DESTROY forms are PLURAL ("destroy all creatureS") while that grammar's entry gate is
  //     `\bcreature\b`, which does not match "creatures". Left plural, the probe returned
  //     `{restrictions: [], clean: true}` for every card — clean because nothing was examined, which is the
  //     quietest possible failure and looked exactly like "no filters found". Caught only because the first
  //     run refused all six known carriers instead of the expected zero.
  //
  // ⛔ `clean` IS THE CREED GATE, same as on the damage side: any unmodeled qualifier survives the strip and
  // the whole clause parks rather than wiping the wrong set — and a wrong mass DESTROY is unrecoverable in a
  // way a wrong mass damage often is not.
  const gen = t.match(/^(destroy|exile) all (.+)$/);
  if (gen && /\bcreature/.test(gen[2])) {
    const phrase = gen[2].replace(/^all /, "").replace(/\bcreatures\b/, "creature");
    const { restrictions, clean } = parseCreatureTargetRestrictions({ oracle: `~ deals 1 damage to each ${phrase}` });
    if (clean && restrictions.length) {
      return { op: gen[1] === "destroy" ? "destroy" : "exile", targetType: "eachCreature", restrictions };
    }
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

/**
 * BASILISK TOUCH enqueue (BLITZ DG-1, CR 511) — the destroy-at-end-of-combat resolver does NOT destroy:
 * it pushes a TURN-STAMPED entry onto state.endOfCombatEffects for the triggering creature (the contact
 * partner — ctx.triggeringPermanentId, the thatCreature referent). combatResolution.drainEndOfCombatEffects
 * performs the actual destroy at the end-of-combat boundary through the SHARED applyDestroyEffect (so
 * indestructible / shield counter / regeneration / totem armor / dies-triggers behave exactly like any
 * destroy), and DROPS any entry stamped with an earlier turn (a stale delayed destroy firing in a LATER
 * combat would be a forbidden FP; a dropped one is FN-safe). A vanished / absent referent enqueues nothing
 * (a clean no-op — the creature already left, CR 603.10a look-backs don't resurrect it for a destroy).
 */
function applyDestroyAtEndOfCombat(state, atom, ctx) {
  const id = ctx.triggeringPermanentId;
  if (!id || !findPermanent(state, id)) return state;
  const entry = { op: "destroy", permanentId: id, turn: state.turn, sourceCardName: ctx.cardName || null };
  const next = { ...state, endOfCombatEffects: [...(state.endOfCombatEffects || []), entry] };
  return logEvent(next, { kind: "spell-effect", effect: "destroy-at-end-of-combat-enqueued", target: id, source: ctx.cardName || null });
}

// ④-AX — enqueue the SOURCE's own end-of-combat sacrifice / bounce (see the parse arm above). Same entry shape and
// turn stamp as the basilisk destroy, so the drain's stale guard covers it; a source already gone → nothing to enqueue.
function applySelfAtEndOfCombat(state, atom, ctx) {
  const id = ctx.sourceId;
  if (!id || !findPermanent(state, id)) return state;
  const entry = { op: atom.action === "bounce" ? "bounce" : "sacrifice", permanentId: id, turn: state.turn, sourceCardName: ctx.cardName || null };
  const next = { ...state, endOfCombatEffects: [...(state.endOfCombatEffects || []), entry] };
  return logEvent(next, { kind: "spell-effect", effect: `${entry.op}-at-end-of-combat-enqueued`, target: id, source: ctx.cardName || null });
}

// ④-BB — enqueue the TRIGGERING creature's end-of-combat bounce (the blocked attacker on a blocksCreature trigger).
function applyBounceAtEndOfCombat(state, atom, ctx) {
  const id = ctx.triggeringPermanentId;
  if (!id || !findPermanent(state, id)) return state;
  const entry = { op: "bounce", permanentId: id, turn: state.turn, sourceCardName: ctx.cardName || null };
  const next = { ...state, endOfCombatEffects: [...(state.endOfCombatEffects || []), entry] };
  return logEvent(next, { kind: "spell-effect", effect: "bounce-at-end-of-combat-enqueued", target: id, source: ctx.cardName || null });
}

export const removalResolvers = {
  "bounce-at-end-of-combat": applyBounceAtEndOfCombat, // ④-BB — "return that creature to its owner's hand at end of combat" (Wall of Tears)
  "self-at-end-of-combat": applySelfAtEndOfCombat, // ④-AX — "sacrifice it / return it to its owner's hand at end of combat" (the attacks-or-blocks self class)
  "champion": applyChampion, // ===== CHAMPION (CR 702.71a) ===== exile ANOTHER own nontoken creature of the named type, linked to the source via the shared detain resolver (so the return is the one already proven); sacrifice the source when no legal offering exists
  "mass-destroy-treasure-per-nontoken": applyMassDestroyTreasurePerNontoken, // BLOOD-MONEY — destroy all creatures + a tapped Treasure per nontoken creature destroyed
  "destroy-at-end-of-combat": applyDestroyAtEndOfCombat, // BASILISK TOUCH (DG-1, CR 511) — enqueue a turn-stamped delayed destroy; combatResolution drains it
  "destroy": (state, atom, ctx) =>
    (atom.controllerRider || atom.damageRider)
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Beast Within / Generous Gift / Assassin's Trophy / Smash to Smithereens / Molten Rain
      : applyDestroyEffect(state, { controller: ctx.controller, targets: atomTargets(state, atom, ctx), cannotRegenerate: atom.cannotRegenerate }), // MTG-001 — honor the "can't be regenerated" rider
  "exile": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Path to Exile / Swords to Plowshares
      : atom.untilSourceLeaves
        ? applyExileUntilLeaves(state, atom, ctx) // DETAIN (DT-1) — Banishing Light: exile linked to the source permanent
        : applyZoneMove(state, atom, ctx, "exile"),
  "sacrifice": applySacrifice,
  "ordeal-threshold-sac": applyOrdealThresholdSac, // ORDEAL (BLITZ OC-1, CR 608.2c order-written) — host at 3+ +1/+1 counters → the source Aura sacrifices itself (→ its own "when you sacrifice" payoff)
};
