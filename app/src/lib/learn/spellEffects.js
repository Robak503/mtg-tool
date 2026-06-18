/**
 * spellEffects.js — bounded oracle-text spell effects for the learn engine.
 *
 * Instants and sorceries used to resolve as a no-op (only permanents did
 * anything). This parses the COMMON single-effect patterns and resolves them,
 * so removal/burn/draw actually work:
 *   - damage  — "deals N damage to <target | any target | each opponent | each creature>"
 *   - destroy — "destroy target creature"
 *   - draw    — "draw N cards" (controller)
 *
 * Targeting reuses the engine's action-expansion pattern (one cast-spell action
 * per legal target, like multi-defender combat). Anything we don't recognize
 * falls back to the existing no-op-with-log resolver — honest and bounded, not
 * a general rules engine. Pump / counters / "until end of turn" / modal /
 * conditional effects are deferred.
 *
 * Pure: every function returns data or a new state; no mutation, no fetch.
 */

import {
  loseLife,
  drawCards,
  moveCardToZone,
  findPermanent,
  markCombatDamage,
  destroyLethalCreatures,
  logEvent,
  opponentsOf,
  creaturePower,
  creatureToughness,
  isIndestructible,
} from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreature(card) {
  return typeOf(card).includes("Creature");
}

// ─── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse an instant/sorcery's oracle into an effect descriptor, or null when
 * it's a permanent (those enter the battlefield) or we don't recognize it.
 *
 *   { kind: "damage", amount, targetType: "creature"|"player"|"any"|"eachOpponent"|"eachCreature" }
 *   { kind: "destroy", targetType: "creature" }
 *   { kind: "draw", amount, targetType: null }
 */
export function parseSpellEffect(card) {
  if (!/Instant|Sorcery/.test(typeOf(card))) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!oracle) return null;

  // Damage.
  let m = oracle.match(/deals?\s+(\d+)\s+damage\s+to\s+([^.]+)/i);
  if (m) {
    const amount = parseInt(m[1], 10);
    const tgt = m[2].toLowerCase().trim();
    // Mass damage is modeled ONLY for the BARE form — "each opponent" / "each
    // creature" with no trailing qualifier. A qualifier ("each creature WITHOUT
    // flying", "each creature your opponents control", "each creature with shadow")
    // changes WHICH creatures are hit, which eachCreature would ignore (damaging
    // all). Anything qualified falls through to null → the EffectProgram rates it
    // low → Arbiter, rather than hitting the wrong set of creatures.
    if (/^each opponent('s)?$/.test(tgt)) return { kind: "damage", amount, targetType: "eachOpponent" };
    if (/^each creature$/.test(tgt)) return { kind: "damage", amount, targetType: "eachCreature" };
    // Any OTHER "each …" is mass damage to a subset we don't model — bail before the
    // single-target branches, so e.g. "each creature target opponent controls" can't
    // mis-match the "target opponent" → player-damage branch below.
    if (/\beach\b/.test(tgt)) return null;
    if (/any target/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    // "creature or PLAYER" is any (creature+player). "creature or PLANESWALKER" is
    // NOT — it excludes players; since we don't model planeswalkers, offer creatures
    // ONLY (mapping it to "any" would let a creature-or-pw burn illegally hit a player).
    if (/target creature or player\b/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    if (/target creature or planeswalker\b/.test(tgt)) return { kind: "damage", amount, targetType: "creature" };
    if (/target (player|opponent)/.test(tgt)) return { kind: "damage", amount, targetType: "player" };
    if (/target[^,]*creature/.test(tgt)) return { kind: "damage", amount, targetType: "creature" };
    return null; // unrecognized damage target
  }

  // Destroy target creature (other destroy targets deferred).
  m = oracle.match(/destroy\s+target\s+([^.]+)/i);
  if (m && /creature/.test(m[1].toLowerCase())) {
    return { kind: "destroy", targetType: "creature" };
  }

  // Draw N cards (controller). "draws" (someone else) intentionally doesn't match.
  m = oracle.match(/\bdraw\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const amount = NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
    return { kind: "draw", amount, targetType: null };
  }

  // Pump: "target creature gets +X/+Y until end of turn" (Giant Growth family).
  // Anchored to the whole clause so a rider/restriction variant doesn't match here;
  // the EffectProgram clean-clause gate is the second line of defense. Resolution
  // is the P2.3 `pump` atom (a CR 613.4c layer-7c effect), not the legacy
  // resolveSpellEffect (which has no pump branch and is no longer the cast path).
  m = oracle.match(/target creature gets ([+-]\d+)\/([+-]\d+)\s+until end of turn/i);
  if (m) {
    return { kind: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, duration: "endOfTurn" };
  }

  return null;
}

/** Does this effect need the caster to choose a target? */
export function effectNeedsTarget(effect) {
  return !!effect && !!effect.targetType && !["eachOpponent", "eachCreature"].includes(effect.targetType);
}

// ─── Target restrictions (P2.4) ───────────────────────────────────────────────

/**
 * Parse the MODELED restrictions on a "target creature" spec and report whether
 * the spec is fully accounted for. Returns `{ restrictions, clean }`.
 *
 * Modeled set (conservative): controller (you/opponent), tapped/untapped, and
 * power (<= / >=). `clean` is an ALLOWLIST check — true ONLY when the whole
 * creature-target text reduces to the base noun + filler + the modeled
 * restrictions. ANY leftover qualifier (a color like "nonblack", a type like
 * "artifact", "attacking", "named", "with flying", "with mana value", …) makes it
 * false, so the confidence gate routes the spell to the Arbiter rather than
 * targeting wrongly. An allowlist (the match must SPAN the spec) is what the P2.2
 * review proved necessary — a denylist of markers always has holes.
 *
 * Only meaningful for destroy / deal-damage creature targets (its regex matches
 * only those); for anything else (pump, draw, "any" target) it returns clean.
 */
const MODELED_RESTRICTION_RES = [
  /\b(?:an opponent controls|you don't control|a player other than you controls)\b/g,
  /\byou control\b/g,
  /\buntapped\b/g,
  /\btapped\b/g,
  /\bpower \d+ or less\b/g,
  /\bpower \d+ or (?:greater|more)\b/g,
];

export function parseCreatureTargetRestrictions(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").toLowerCase();
  let m = oracle.match(/destroy\s+target\s+([^.]+)/);
  if (!m) m = oracle.match(/deals?\s+\d+\s+damage\s+to\s+([^.]+)/);
  if (!m || !/\bcreature\b/.test(m[1])) {
    // Not a creature target → nothing to model. (A "creature or player" any-target
    // never reaches here — parseSpellEffect maps it to targetType "any". A genuine
    // "creature or <type>" leaves an unmodeled "or <type>" residue below → unclean.)
    return { restrictions: [], clean: true, cleanedOracle: oracle };
  }

  let t = ` ${m[1].replace(/[.,]/g, " ")} `;
  const restrictions = [];

  // Controller — "an opponent controls" / "you don't control" vs "you control".
  if (/\b(?:an opponent controls|you don't control|a player other than you controls)\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "opponent" });
    t = t.replace(/\b(?:an opponent controls|you don't control|a player other than you controls)\b/g, " ");
  } else if (/\byou control\b/.test(t)) {
    restrictions.push({ kind: "controller", who: "you" });
    t = t.replace(/\byou control\b/g, " ");
  }

  // Tapped / untapped (untapped first so "tapped" doesn't eat it).
  if (/\buntapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: false }); t = t.replace(/\buntapped\b/g, " "); }
  else if (/\btapped\b/.test(t)) { restrictions.push({ kind: "tapped", value: true }); t = t.replace(/\btapped\b/g, " "); }

  // Power N or less / N or greater.
  let pm = t.match(/\bpower (\d+) or less\b/);
  if (pm) { restrictions.push({ kind: "power", op: "<=", value: parseInt(pm[1], 10) }); t = t.replace(/\bpower \d+ or less\b/g, " "); }
  pm = t.match(/\bpower (\d+) or (?:greater|more)\b/);
  if (pm) { restrictions.push({ kind: "power", op: ">=", value: parseInt(pm[1], 10) }); t = t.replace(/\bpower \d+ or (?:greater|more)\b/g, " "); }

  // Strip the base noun + filler; anything left is an UNMODELED qualifier → unclean.
  t = t.replace(/\b(target|a|an|another|other|each|any|creature|creatures|with|that|to|the|is)\b/g, " ").replace(/[^a-z]+/g, " ").trim();

  // The oracle with the MODELED restriction phrases removed — so the confidence
  // gate (which keeps controller/tapped/power in its denylist to protect mass
  // effects like "each creature an opponent controls") can re-check the REST of
  // the clause (riders, other markers) without tripping on a restriction we model.
  let cleanedOracle = oracle;
  for (const re of MODELED_RESTRICTION_RES) cleanedOracle = cleanedOracle.replace(re, " ");
  return { restrictions, clean: t.length === 0, cleanedOracle };
}

/** Does a creature permanent (controlled by `pid`) satisfy a restriction set, from `casterId`'s view? */
function creatureSatisfiesRestrictions(state, perm, pid, casterId, restrictions) {
  for (const r of restrictions) {
    if (r.kind === "controller") {
      if (r.who === "you" && pid !== casterId) return false;
      if (r.who === "opponent" && pid === casterId) return false;
    } else if (r.kind === "tapped") {
      if (!!perm.tapped !== r.value) return false;
    } else if (r.kind === "power") {
      const pw = creaturePower(perm, state);
      if (r.op === "<=" && !(pw <= r.value)) return false;
      if (r.op === ">=" && !(pw >= r.value)) return false;
    }
  }
  return true;
}

// ─── Target enumeration ───────────────────────────────────────────────────────

/**
 * Legal targets for a targeted effect, as `{ type, id, controller?, name }`.
 * Empty for non-targeted effects (draw, each-opponent, each-creature).
 *
 * P2.4: honors `effect.restrictions` (controller / tapped / power) so the player
 * and AI are only offered LEGAL creature targets — e.g. "destroy target creature
 * an opponent controls" no longer surfaces the caster's own creatures. No
 * restrictions → every creature, as before.
 */
export function enumerateTargets(state, controllerId, effect) {
  if (!effectNeedsTarget(effect)) return [];
  const restrictions = Array.isArray(effect.restrictions) ? effect.restrictions : [];
  const out = [];
  const addCreatures = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreature(perm.card) && creatureSatisfiesRestrictions(state, perm, pid, controllerId, restrictions)) {
          out.push({ type: "creature", id: perm.id, controller: pid, name: perm.card?.name });
        }
      }
    }
  };
  const addPlayers = () => {
    for (const pid of Object.keys(state.players)) out.push({ type: "player", id: pid, name: pid });
  };
  // P3.1 counter: legal targets are SPELLS on the stack (kind "spell"; abilities are
  // not spells), filtered by the counter's spellFilter (any/noncreature/creature).
  // An on-card uncounterable spell (CR 701.5e) is excluded — conservative: granted/
  // external "can't be countered" isn't modeled, but the on-card case is never wrong.
  const addStackSpells = () => {
    for (const obj of state.stack || []) {
      if (obj.kind !== "spell") continue;
      if (/can't be countered/i.test(String(obj.source?.oracle || obj.source?.oracle_text || ""))) continue;
      if (!spellMatchesCounterFilter(obj, effect.spellFilter)) continue;
      out.push({ type: "spell", id: obj.id, name: obj.source?.name });
    }
  };
  // Graveyard recursion: legal targets are CARDS in the CASTER'S OWN graveyard ("your
  // graveyard"), filtered by the atom's cardFilter (creature → creature cards only; any → every
  // card). The graveyard is a public zone, so this is a normal cast-time target choice.
  // Front-face type only (CR 712.4a) — a card in the graveyard has just its FRONT-face
  // characteristics, but the enriched type line is the combined "Front // Back" for a
  // transform-DFC / MDFC / Battle / Saga. So "Westvale Abbey // Ormendahl, Profane Prince"
  // (Land // Creature) is a LAND in the graveyard and must NOT match the creature filter.
  // Mirrors the counter (counterTypeLine) + tutor (cardMatchesTutorFilter) front-face discipline.
  const frontIsCreature = (card) => /Creature/.test(String(card?.type || card?.type_line || "").split(" // ")[0]);
  const addGraveyardCards = () => {
    for (const card of state.players[controllerId]?.graveyard || []) {
      if (card.token) continue; // a token is not a "card" (CR 111 / 608.2b) — never a legal target
      if (effect.cardFilter === "creature" && !frontIsCreature(card)) continue;
      out.push({ type: "graveyardCard", id: card.id, controller: controllerId, name: card?.name });
    }
  };
  // Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "destroy target
  // permanent"). The only modeled restriction is the controller (the 3 the parser captures);
  // tapped/power aren't part of the anchored permanent shapes, so they never reach here.
  const PERMANENT_PREDICATES = {
    artifact: (tl) => /\bArtifact\b/.test(tl),
    enchantment: (tl) => /\bEnchantment\b/.test(tl),
    land: (tl) => /\bLand\b/.test(tl),
    permanent: () => true,
    nonlandPermanent: (tl) => !/\bLand\b/.test(tl),
    artifactOrEnchantment: (tl) => /\bArtifact\b|\bEnchantment\b/.test(tl),
  };
  const controllerOk = (pid) => restrictions.every((r) =>
    r.kind !== "controller" || (r.who === "you" ? pid === controllerId : pid !== controllerId));
  const addPermanents = (pred) => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        const tl = String(perm.card?.type || perm.card?.type_line || "");
        // A double-faced permanent's CURRENT battlefield face isn't tracked (the engine has no face
        // state), so its combined "Front // Back" type line can't be trusted to pick a targetType —
        // a back-face-played MDFC (Akoum Warrior cast as the land Akoum Teeth) would mis-match. Skip
        // DFCs: they're simply not offered to native non-creature removal (a SAFE omission, never a
        // wrong target). The spell still routes to the Arbiter if a DFC is its only would-be target.
        if (tl.includes(" // ")) continue;
        if (pred(tl) && controllerOk(pid)) {
          out.push({ type: "permanent", id: perm.id, controller: pid, name: perm.card?.name });
        }
      }
    }
  };
  if (effect.targetType === "creature") addCreatures();
  else if (effect.targetType === "player") addPlayers();
  else if (effect.targetType === "any") { addCreatures(); addPlayers(); }
  else if (effect.targetType === "spell") addStackSpells();
  else if (effect.targetType === "graveyardCard") addGraveyardCards();
  else if (PERMANENT_PREDICATES[effect.targetType]) addPermanents(PERMANENT_PREDICATES[effect.targetType]);
  return out;
}

/** Does a spell on the stack match a counter's spellFilter (CR 701.5a)? */
function spellMatchesCounterFilter(stackObj, filter) {
  // Front-face type only — a split/MDFC spell's enriched type line is "Front // Back".
  const type = String(stackObj?.source?.type || stackObj?.source?.type_line || "").split(" // ")[0];
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  return true; // "any"
}

// ─── AI target selection ──────────────────────────────────────────────────────

function powerOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creaturePower(lk.permanent, state) : 0;
}
function toughOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creatureToughness(lk.permanent, state) : 0;
}

/**
 * The AI's target pick for a damage/destroy spell. Only ever targets an enemy;
 * returns null when there's no good enemy target (so the AI won't, say, destroy
 * its own creature). Heuristics: destroy the biggest enemy creature; burn the
 * biggest enemy creature it can kill, else the lowest-life enemy player.
 *
 * Pump (kind "pump", P2.3) intentionally falls through to `return null` — the AI
 * does not yet cast combat tricks (a deliberate deferral, like attack-trap logic
 * in opponentAI). This is SAFE: the player can still cast pump normally; the AI
 * simply holds the card. A future PR can add a "pump my best attacker" heuristic.
 */
export function chooseAITarget(state, aiPlayerId, effect, targets) {
  if (!targets || targets.length === 0) return null;
  const enemies = new Set(opponentsOf(state, aiPlayerId));
  const enemyCreatures = targets.filter(t => t.type === "creature" && enemies.has(t.controller));
  const enemyPlayers = targets.filter(t => t.type === "player" && enemies.has(t.id));
  // An indestructible enemy creature can't be killed by destroy (CR 702.12b) or by lethal damage
  // (CR 704.5g) — the AI shouldn't waste removal/burn on it (the spell would fizzle / the damage
  // just wears off at cleanup). Exclude it from every creature pick; players are unaffected.
  const isIndestructibleTarget = (t) => { const lk = findPermanent(state, t.id); return !!lk && isIndestructible(lk.permanent, state); };
  const killableCreatures = enemyCreatures.filter(t => !isIndestructibleTarget(t));

  if (effect.kind === "destroy") {
    if (!killableCreatures.length) return null;
    return [...killableCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
  }
  if (effect.kind === "damage") {
    const killable = killableCreatures.filter(t => toughOf(state, t) > 0 && toughOf(state, t) <= effect.amount);
    if (killable.length) return killable.sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    if (enemyPlayers.length) return [...enemyPlayers].sort((a, b) => state.players[a.id].life - state.players[b.id].life)[0];
    if (killableCreatures.length) return [...killableCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    return null;
  }
  return null;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Per-effect resolution helpers — the single source of truth for each effect's
 * state mutation. `resolveSpellEffect` (the legacy `spell.effect` resolver) AND
 * the Phase-2 EffectProgram atoms (`effects/effectAtoms.js`) both call these, so
 * the interpreter's atoms are byte-for-byte equivalent to the legacy path by
 * construction — there is no second implementation to drift.
 */
export function applyDrawEffect(state, { controller, amount }) {
  const next = drawCards(state, { playerId: controller, count: Math.max(0, amount || 1) });
  return logEvent(next, { kind: "spell-effect", effect: "draw", controller, amount });
}

export function applyDestroyEffect(state, { controller, targets = [] }) {
  let next = state;
  const dead = [];
  const prevented = [];
  for (const t of targets) {
    // "creature" (the dedicated creature path / mass wipe) or "permanent" (targeted non-creature
    // removal — Disenchant/Stone Rain). Other target kinds aren't destroyable here.
    if (t.type !== "creature" && t.type !== "permanent") continue;
    const lk = findPermanent(next, t.id);
    if (!lk) continue;
    // CR 702.12b — an indestructible permanent can't be destroyed. isIndestructible reads the layer
    // engine, so GRANTED indestructible (Darksteel Forge's "artifacts you control are indestructible",
    // an Equipment/Aura, an anthem) is honored, not just printed. The permanent stays put and fires
    // no dies-trigger (it never left). Exile/sacrifice/bounce are NOT destroy and never reach here.
    if (isIndestructible(lk.permanent, next)) {
      prevented.push(t.id);
      continue;
    }
    // moveCardToZone detaches any Aura/Equipment on the destroyed permanent (CR 704.5n/q). Only a
    // CREATURE going to the graveyard "dies" (CR 700.4), so only creatures feed the dies-trigger
    // look-back (captured BEFORE the move, CR 603.10a); destroying a land/artifact fires no dies.
    if (isCreature(lk.permanent.card)) {
      dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card });
    }
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: t.id });
  }
  next = checkDiesTriggers(next, dead);
  return logEvent(next, { kind: "spell-effect", effect: "destroy", controller, targets: targets.map(t => t.id), prevented });
}

export function applyDamageEffect(state, { controller, amount: rawAmount, targetType, targets = [] }) {
  let next = state;
  const amount = Math.max(0, rawAmount || 0);
  if (targetType === "eachOpponent") {
    for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount });
  } else if (targetType === "eachCreature") {
    for (const pid of Object.keys(next.players)) {
      for (const perm of next.players[pid].battlefield) {
        if (isCreature(perm.card)) next = markCombatDamage(next, { permanentId: perm.id, amount });
      }
    }
  } else {
    for (const t of targets) {
      if (t.type === "player" && next.players[t.id]) next = loseLife(next, { playerId: t.id, amount });
      else if (t.type === "creature" && findPermanent(next, t.id)) next = markCombatDamage(next, { permanentId: t.id, amount });
    }
  }
  const dmgResult = destroyLethalCreatures(next);
  next = checkDiesTriggers(dmgResult.state, dmgResult.dead);
  return logEvent(next, { kind: "spell-effect", effect: "damage", controller, amount, targets: targets.map(t => t.id) });
}

/**
 * Apply a parsed effect on resolution. Returns a new state. Damage runs the
 * shared lethal SBA so creatures it kills hit the graveyard. Delegates to the
 * per-effect helpers above (which the EffectProgram atoms also use).
 */
export function resolveSpellEffect(state, { effect, controller, targets = [] }) {
  if (!effect) return state;
  if (effect.kind === "draw") return applyDrawEffect(state, { controller, amount: effect.amount });
  if (effect.kind === "destroy") return applyDestroyEffect(state, { controller, targets });
  if (effect.kind === "damage") {
    return applyDamageEffect(state, { controller, amount: effect.amount, targetType: effect.targetType, targets });
  }
  return state;
}
