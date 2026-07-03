/**
 * effects/atoms/shared.js — STRICT LEAF shared helpers for the atom resolver family modules.
 *
 * Imports ONLY from gameState.js etc. — NEVER from a sibling atoms/* module, so the import graph
 * stays a DAG (shared <- everything). Pure move out of effectAtoms.js: target gatherers, count
 * engine, type predicates, and the token descriptor word sets.
 */

import { findPermanent, creaturePower, creatureToughness, opponentsOf } from "../../gameState.js";

export const TOKEN_COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "and"]);
// ===== TOKENS ===== descriptor words that are SUPERTYPES / CARD TYPES, not creature subtypes —
// so "colorless thopter artifact" mints "Token Artifact Creature — Thopter" (not a bogus "Artifact"
// subtype) and "legendary spirit" mints "Token Legendary Creature — Spirit". Anything unrecognized
// falls through to a subtype (safe: the token is still a creature with the right P/T).
export const TOKEN_SUPERTYPE_WORDS = new Set(["legendary", "snow"]);
// "land" is a CARD TYPE, not a subtype — so "green Forest Dryad land" mints "Token Land Creature —
// Forest Dryad" (Land placed before Creature; Forest/Dryad as subtypes), NOT a bogus "Land" subtype.
// The create-token parser only ever admits a "land" descriptor when it carries a basic-land subtype
// (Forest/Island/…) whose intrinsic {T}: Add <color> mana ability is minted onto the token, so the
// Land card type is always accompanied by a real, engine-readable mana line (a faithful Forest token).
export const TOKEN_CARDTYPE_WORDS = new Set(["artifact", "enchantment", "land"]);
export const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export const typeLineStr = (card) => String(card?.type || card?.type_line || "");
export const isCreatureCard = (card) => /Creature/.test(typeLineStr(card));
// MASS-NC type predicates — WORD-ANCHORED (\b) so an artifact/enchantment CREATURE or a creature-land is
// still swept ("Artifact Creature" / "Creature — … Land" each contain the whole word) WITHOUT a substring
// false match: an "Artifact — Lander" token is NOT a Land ("Lander" ≠ the word "Land"). Mirrors the
// engine's canonical type predicates in spellEffects.js (\bArtifact\b / \bEnchantment\b / \bLand\b).
export const isArtifactCard = (card) => /\bArtifact\b/.test(typeLineStr(card));
export const isEnchantmentCard = (card) => /\bEnchantment\b/.test(typeLineStr(card));
export const isLandCard = (card) => /\bLand\b/.test(typeLineStr(card));
// "instant and/or sorcery" — the graveyard threshold read by spell-mastery (Animist's Awakening) and the
// gated-graveyard static family. Word-anchored so a "Tribal Sorcery — Goblin" / "Instant — Adventure" still
// counts, without a substring false match.
export const isInstantOrSorceryCard = (card) => /\b(Instant|Sorcery)\b/.test(typeLineStr(card));

/**
 * Every creature on EVERY battlefield, as target descriptors `{type:"creature", id,
 * controller}`. The "all creatures" target set for a MASS atom (`targetType:"eachCreature"`
 * — board wipes: destroy/exile/-X-X all). The order is players-then-battlefield (stable,
 * serialize-deterministic). The mass resolvers feed this into the SAME per-effect helpers a
 * targeted spell uses, so dies-triggers fire once for the simultaneous deaths (CR 700.4 /
 * 603.10a captured pre-move in applyDestroyEffect; one lethal SBA in applyPumpEffect).
 */
export function massCreatureTargets(state, opts = {}) {
  // CRUX — an optional creature-SUBTYPE filter ("destroy all Dragon creatures" / "all non-Dragon creatures",
  // Crux of Fate). A creature subtype is a proper noun that appears verbatim ONLY in the subtype portion of a
  // type line ("Creature — Dragon"), so a word-bounded, case-insensitive containment test selects exactly the
  // subtyped creatures (CR 205.3m; mirrors creatureSatisfiesRestrictions' subtype branch). `subtypeNegate`
  // flips it to "every creature that is NOT that subtype". The subtype comes from the curated parser allowlist,
  // so it's a real, collision-free MTG subtype — pure type-line read (no state), so this stays a strict leaf.
  //
  // MULTI-SUBTYPE — `subtypeFilter` may be an ARRAY of subtypes (Whelming Wave's mass bounce "except for
  // Krakens, Leviathans, Octopuses, and Serpents"). A creature matches the filter if it carries ANY one of the
  // listed subtypes (OR-union, word-bounded per subtype); `subtypeNegate` then keeps every creature carrying
  // NONE of them. A single string keeps its exact original one-subtype behavior (byte-for-byte unchanged below
  // — `subRes` is a one-element array, the .some() reduces to that single test).
  const subList = opts.subtypeFilter == null ? null : (Array.isArray(opts.subtypeFilter) ? opts.subtypeFilter : [opts.subtypeFilter]);
  const subRes = subList ? subList.map((s) => new RegExp(`\\b${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")) : null;
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (!isCreatureCard(perm.card)) continue;
      if (subRes) {
        const face = typeLineStr(perm.card).split(" // ")[0]; // front face only (CR 712.4a)
        const has = subRes.some((re) => re.test(face)); // carries ANY listed subtype
        if (opts.subtypeNegate ? has : !has) continue;
      }
      out.push({ type: "creature", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * MASS-NC — every permanent matching `matches(card)` on EVERY battlefield, as `{type:"permanent"}`
 * descriptors (the type applyDestroyEffect accepts; it re-checks isCreature for the CR 603.10a dies
 * look-back, so an artifact/enchantment CREATURE swept this way still dies + fires its dies-trigger).
 * Mirrors massCreatureTargets for "destroy all artifacts / enchantments / lands".
 */
export function massPermanentTargets(state, matches) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (matches(perm.card)) out.push({ type: "permanent", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * Every creature CONTROLLER controls right now, as target descriptors — the affected set for a
 * controller-scoped TEAM pump (`scope:"youControl"`: Overrun / Trumpet Blast). Gathered AT
 * RESOLUTION so applyPumpEffect locks the set into per-creature fixed effects (CR 611.2c — a
 * one-shot effect's set is fixed when it begins, NOT re-evaluated as creatures enter later).
 */
export function controllerCreatureTargets(state, controller, opts = {}) {
  const player = state.players?.[controller];
  if (!player) return [];
  // TEAM-PUMP-SCOPE — two optional narrowings of the controller's creatures, both fixed AT RESOLUTION:
  //   • excludeSource (CR 113.7 "OTHER creatures you control") drops the pump's own source permanent.
  //   • subtypeFilter ("<Subtype>s you control") keeps only creatures whose type line carries that
  //     subtype, word-bounded (\b) so "Elf" matches "Creature — Elf Warrior" but never a substring.
  //     The subtype comes from the curated COUNT_SUBTYPE allowlist (parser-side), so it's a real,
  //     collision-free MTG subtype — the \b match credits exactly the subtyped creatures (CREED).
  const subRe = opts.subtypeFilter ? new RegExp(`\\b${opts.subtypeFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : null;
  // TYPE-NEGATED team scope (Return of the Wildspeaker "Non-Human creatures you control get +3/+3") — subtypeNegate
  // keeps only creatures NOT of that subtype. Word-bounded, case-insensitive front-face read (CR 712.4a), and a
  // CHANGELING (CR 702.73a — IS every creature type) is excluded too, mirroring greatestPtAmong's notSubtype. The
  // subtype is a curated allowlist word (parser-side), so the \b match credits exactly the non-<Subtype> creatures.
  const negRe = opts.subtypeNegate ? new RegExp(`\\b${opts.subtypeNegate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  return player.battlefield
    .filter((perm) => isCreatureCard(perm.card))
    .filter((perm) => !(opts.excludeSource && perm.id === opts.sourceId))
    .filter((perm) => !subRe || subRe.test(typeLineStr(perm.card)))
    .filter((perm) => !negRe || !(negRe.test(typeLineStr(perm.card).split(" // ")[0]) || cardIsChangeling(perm.card)))
    .map((perm) => ({ type: "creature", id: perm.id, controller }));
}

/**
 * Every creature the controller's OPPONENTS control right now (MASS-DEBUFF scope `scope:"eachOpponentCreature"`:
 * "Creatures your opponents control get -N/-N until end of turn" — Make Obsolete / Suffocating Fumes / Cower in
 * Fear). The opponent-side mirror of controllerCreatureTargets; gathered AT RESOLUTION (CR 611.2c — the set is
 * fixed when the one-shot begins). In this engine's 1v1 + 4P-FFA formats opponentsOf = every player but the
 * controller, so this is exactly the printed "your opponents control" set.
 */
export function opponentCreatureTargets(state, controller, opts = {}) {
  // TOUGHNESS-THRESHOLD (Scourge of Fleets "…with toughness X or less", where X is a board count) — an optional
  // upper bound on the entering-creature filter. LAYER-AWARE (counters + anthems count), read at resolution via
  // creatureToughness (CR 608.2h), NOT a printed type-line stat — a creature buffed above the threshold is spared,
  // one debuffed to/below it is caught, exactly like the printed "toughness X or less". Absent → no bound (every
  // existing caller is byte-for-byte unchanged: `opts` defaults to {}, toughnessAtMost stays undefined).
  const cap = opts.toughnessAtMost;
  const out = [];
  for (const oppId of opponentsOf(state, controller)) {
    const opp = state.players?.[oppId];
    if (!opp) continue;
    for (const perm of opp.battlefield) {
      if (!isCreatureCard(perm.card)) continue;
      if (cap != null && creatureToughness(perm, state) > cap) continue; // above the count-derived bound → spared
      out.push({ type: "creature", id: perm.id, controller: oppId });
    }
  }
  return out;
}

/**
 * The atom's effective target list: every creature for a mass atom (`eachCreature`), every
 * creature the controller controls for a team pump (`scope:"youControl"`), every creature the
 * opponents control for a mass debuff (`scope:"eachOpponentCreature"`), else the chosen targets.
 */
export const atomTargets = (state, atom, ctx) => {
  // CRUX — a subtype-filtered mass set ("destroy all Dragon creatures" / "all non-Dragon creatures"). The bare
  // "destroy all creatures" wipe carries no subtypeFilter, so it passes EVERY creature (unchanged byte-for-byte).
  if (atom.targetType === "eachCreature") return massCreatureTargets(state, { subtypeFilter: atom.subtypeFilter, subtypeNegate: atom.subtypeNegate });
  if (atom.targetType === "eachArtifact") return massPermanentTargets(state, isArtifactCard);
  if (atom.targetType === "eachEnchantment") return massPermanentTargets(state, isEnchantmentCard);
  if (atom.targetType === "eachLand") return massPermanentTargets(state, atom.landSubtype
    ? (c) => isLandCard(c) && new RegExp(`\\b${atom.landSubtype}\\b`, "i").test(typeLineStr(c)) // MASS-LAND-SUBTYPE (Boil "destroy all Islands")
    : isLandCard);
  if (atom.targetType === "eachArtifactOrEnchantment") return massPermanentTargets(state, (c) => isArtifactCard(c) || isEnchantmentCard(c));
  // MASS-OPPONENT-BOUNCE (Scourge of Fleets) — "each creature your opponents control[ with toughness X or less]"
  // gathered AT RESOLUTION (CR 611.2c — the set is fixed as the one-shot begins). The optional toughness bound X
  // is a board COUNT (atom.toughnessAtMostCount, e.g. "the number of Islands you control") resolved here via
  // countForSpec against the CONTROLLER's board, then applied as a layer-aware upper bound in opponentCreature-
  // Targets. No chosen targets (a NON-targeted mass set, like eachCreature), so the trigger routes natively on
  // program confidence alone. Absent count → no bound (a full opponent-board bounce). CR 111.7: an opponent's
  // token returned this way ceases to exist (handled by the hand-zone move in applyZoneMove).
  if (atom.targetType === "eachOpponentCreature") {
    const cap = atom.toughnessAtMostCount ? countForSpec(state, ctx, atom.toughnessAtMostCount) : undefined;
    return opponentCreatureTargets(state, ctx.controller, { toughnessAtMost: cap });
  }
  if (atom.scope === "youControl") return controllerCreatureTargets(state, ctx.controller, { excludeSource: atom.excludeSource, sourceId: ctx.sourceId, subtypeFilter: atom.subtypeFilter, subtypeNegate: atom.subtypeNegate });
  // ONE-YOU-CONTROL — a non-targeted "a creature you control" the CONTROLLER picks ONE of (Titan of Industry's
  // shield-counter mode "Put a shield counter on a creature you control"). A shield counter is purely
  // beneficial, so the optimal + deterministic auto-pick is the controller's HIGHEST-POWER own creature (the
  // most valuable to protect), tie-broken by battlefield order — never an opponent's creature, never a chooser.
  // Empty own board → [] (a clean no-op, never a fabricated target). Read AT RESOLUTION (CR 608.2h).
  if (atom.scope === "oneYouControl") {
    const own = controllerCreatureTargets(state, ctx.controller);
    if (own.length === 0) return [];
    let best = own[0], bestPow = -Infinity;
    for (const t of own) {
      const lk = findPermanent(state, t.id);
      const pw = lk ? creaturePower(lk.permanent, state) : 0;
      if (Number.isFinite(pw) && pw > bestPow) { bestPow = pw; best = t; }
    }
    return [best];
  }
  // DICE-ROLL multi-target (CR 603.7 reflexive payoff — Ancient Bronze Dragon's "put X +1/+1 counters on
  // each of up to two TARGET creatures"). Modeled as a controller-scoped optimal pick: a +1/+1 counter is
  // purely beneficial, so the controller buffs up to two of ITS OWN creatures (never an opponent's). The
  // first two in battlefield order — deterministic + serialize-stable, matching the engine's first-legal
  // target philosophy; fewer than two creatures → buff whatever's there (a clean partial, never fabricated).
  if (atom.scope === "upToTwoYouControl") return controllerCreatureTargets(state, ctx.controller).slice(0, 2);
  if (atom.scope === "eachOpponentCreature") return opponentCreatureTargets(state, ctx.controller);
  // COMBAT-TEAM-PUMP — every ATTACKING / BLOCKING creature right now (Trumpet Blast "attacking creatures
  // get +1/+0", Hold the Line "blocking creatures get +0/+5"). The set is locked at resolution (CR 611.2c);
  // combat state lives in state.combat.attackers (permanentId) / .blockers (blockerId), the same source
  // creatureSatisfiesRestrictions reads for the "attacking"/"blocking" target restriction.
  if (atom.scope === "attackingCreatures") return massCreatureTargets(state).filter((t) => (state.combat?.attackers || []).some((a) => a.permanentId === t.id));
  if (atom.scope === "blockingCreatures") return massCreatureTargets(state).filter((t) => (state.combat?.blockers || []).some((b) => b.blockerId === t.id));
  if (atom.target === "self") return selfTargets(state, ctx);
  if (atom.target === "thatCreature") return triggeringTargets(state, ctx);
  if (atom.target === "enchanted") return enchantedTargets(state, ctx);
  return ctx.targets || [];
};

/**
 * AURA-OWN-ENCHANTED — the creature THIS Aura is attached to, as a target list (for an activated ability
 * PRINTED ON THE AURA that affects "enchanted creature" — Freed from the Real "{U}: Tap enchanted creature",
 * Pemmin's Aura). ctx.sourceId is the Aura permanent (threaded by the activated dispatcher); its `attachedTo`
 * names the host. Resolved AT RESOLUTION (CR 303.4a, 608.2) off the LIVE state: a detached Aura (no
 * attachedTo) or a host that has left the battlefield → [] (a clean no-op, never a fabricated tap). Only a
 * CREATURE host is returned — "enchanted creature" implies the enchanted permanent is a creature.
 */
export function enchantedTargets(state, ctx) {
  const auraLk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  const hostId = auraLk?.permanent?.attachedTo;
  if (!hostId) return [];
  const hostLk = findPermanent(state, hostId);
  return hostLk && isCreatureCard(hostLk.permanent.card)
    ? [{ type: "creature", id: hostId, controller: hostLk.controller }]
    : [];
}

/**
 * The trigger/activated SOURCE permanent as a target list (for a "this creature gets …" self
 * effect, CR 113.7). ctx.sourceId is threaded from the trigger flush / activated dispatcher; a
 * spell has no source permanent, so a self atom there resolves to [] (a no-op, never a fabricated
 * effect). Only a CREATURE source is returned — "this creature" implies a creature.
 */
export function selfTargets(state, ctx) {
  const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  return lk && isCreatureCard(lk.permanent.card) ? [{ type: "creature", id: ctx.sourceId, controller: lk.controller }] : [];
}

/**
 * TRIG-PRONOUN-IT — the TRIGGERING permanent as a target list (for the NON-SELF "it"/"that creature"
 * pronoun in a trigger effect, CR 608.2c — the object the ability triggered on, NOT the source).
 * ctx.triggeringPermanentId is threaded FLAT by the trigger flush (runEffectProgram spreads
 * trigger.context). A spell has no triggering permanent → [] (a no-op, never a fabricated effect).
 * Only a CREATURE referent is returned. Mirrors counters.triggeringCreatureTargets so pump / bounce
 * share the WAVE-3b counter path's referent resolution (one convention: target:"thatCreature").
 */
export function triggeringTargets(state, ctx) {
  const id = ctx.triggeringPermanentId;
  const lk = id ? findPermanent(state, id) : null;
  return lk && isCreatureCard(lk.permanent.card) ? [{ type: "creature", id, controller: lk.controller }] : [];
}

// ===== HALF-X (CR 107.3 — "half X, rounded down/up") ===== a HALVING post-transform applied to an already-
// resolved magnitude. `atom.halve` is "floor" (rounded down) or "ceil" (rounded up); any other value is a
// no-op (the raw amount passes through). Floors at 0 (a negative input can't arise — every amount source is
// already non-negative — but the Math.max is belt-and-suspenders so a half-of-0 stays 0, never NaN). Composes
// uniformly with amountX / amountCount / countContext because it wraps the RESOLVED value, so "draw half X
// cards" (half of ctx.xValue), "create half X tokens" (half of the X count), and a future "half (a board
// count)" (Eternal Flame's half-of-Mountains) all use the SAME mechanism — one rounding rule, no per-atom drift.
export function halveAmount(value, mode) {
  const v = Math.max(0, value || 0);
  if (mode === "floor") return Math.floor(v / 2);
  if (mode === "ceil") return Math.ceil(v / 2);
  return v;
}

// An X-amount atom (`amountX:true`, set by the parser for an {X}-cost spell) reads
// the chosen X (ctx.xValue, bound at cast time) instead of a printed numeric amount.
// HALF-X: `atom.halve` ("floor"/"ceil") halves the result with CR-correct rounding.
export const effectiveAmount = (atom, ctx) => halveAmount(atom.amountX ? ctx.xValue || 0 : atom.amount, atom.halve);

// ===== DMG-SCALE ===== (WALT-DMG-SCALE) a board-count amount (`amountCount`, set by parseCountSource)
// is computed AT RESOLUTION from the CONTROLLER's current board/hand (CR 608.2h — a count-derived value
// is locked as the spell resolves, not at cast). Slice 1 sources: permanents you control by card TYPE
// (creature/land/artifact/enchantment) or basic-land SUBTYPE (Mountain/Forest/Island/Plains/Swamp), or
// cards in your hand. The matcher (countMatches) reads the same `card.type` line as isCreatureCard, so an
// Artifact Creature correctly counts for both "creatures" and "artifacts" (it IS both, CR 305.4-ish).
export function countMatches(card, spec) {
  const type = String(card?.type || card?.type_line || "");
  if (spec.subtype) return new RegExp(`\\b${spec.subtype}\\b`).test(type);   // basic-land subtype (Mountain…)
  // ===== TREASURE-MAKER ===== a UNION of card types — "artifacts and enchantments" (Dockside Extortionist).
  // A permanent matching ANY listed type counts ONCE (CR 305.4: an Artifact Creature that's also an
  // Enchantment still counts as one permanent). Each type is word-anchored, exactly like the single-type form.
  if (Array.isArray(spec.cardTypes)) {
    return spec.cardTypes.some((ct) => {
      const T = ct.charAt(0).toUpperCase() + ct.slice(1);
      return new RegExp(`\\b${T}\\b`).test(type);
    });
  }
  if (spec.cardType) {
    const T = spec.cardType.charAt(0).toUpperCase() + spec.cardType.slice(1); // creature → Creature
    return new RegExp(`\\b${T}\\b`).test(type);
  }
  return false;
}

// CHOSEN-TYPE (CR 614.12) spell-time count — Distant Melody ("Choose a creature type. Draw a card for each
// permanent you control of that type."). The self-play engine has no interactive picker, so the OPTIMAL +
// deterministic resolution is: the chosen type is the one that MAXIMIZES the draw — i.e. the count equals the
// greatest, over every creature subtype present among the controller's permanents, of the number of permanents
// the controller controls of that subtype. A CHANGELING (CR 702.73a — every creature type) counts toward EVERY
// candidate type, so it's added to the max once any candidate exists (and is the floor when only changelings
// are present). This exactly matches what a player maximizing the draw would pick, so it's never an over- or
// under-count. Reads the card type line directly (no engine import). 0 when the controller controls no
// creature-typed permanent (a safe floor — no fabricated draw).
function permanentSubtypes(card) {
  const line = String(card?.type || card?.type_line || "");
  if (!/Creature/.test(line)) return [];
  const dash = line.indexOf("—");
  if (dash === -1) return [];
  return line.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}
function cardIsChangeling(card) {
  // Reminder-text-tolerant: the printed keyword "changeling" (CR 702.73a) appears in the oracle text.
  return /\bchangeling\b/i.test(String(card?.oracle || card?.oracle_text || ""));
}
function chosenTypePermanentsCount(player) {
  const bf = player?.battlefield || [];
  // Tally per-subtype counts; a changeling is tracked separately and added to every candidate (and forms the
  // floor when it's the only creature-typed permanent — "creature type" still has to be chosen, CR 614.12).
  const tally = new Map();
  let changelings = 0;
  for (const perm of bf) {
    const card = perm.card;
    if (cardIsChangeling(card)) { changelings += 1; continue; }
    for (const sub of permanentSubtypes(card)) tally.set(sub, (tally.get(sub) || 0) + 1);
  }
  if (tally.size === 0) return changelings; // only changelings (or nothing) → that count (0 if none)
  let best = 0;
  for (const n of tally.values()) best = Math.max(best, n + changelings);
  return best;
}
export function countForSpec(state, ctx, spec) {
  // ===== TREASURE-MAKER ===== who:"opponents" sums the spec over ALL of the controller's opponents
  // ("the number of artifacts and enchantments your opponents control" — Dockside Extortionist). The
  // per-opponent count reuses the SAME spec (kind + cardType[s]/subtype) against each opponent's
  // battlefield, summed. Only permanentsYouControl is opponent-scopeable today (the parser only emits
  // who:"opponents" for that kind); any other kind under who:"opponents" sums 0 (a safe no-op).
  if (spec.who === "opponents") {
    let total = 0;
    for (const oppId of opponentsOf(state, ctx.controller)) {
      const opp = state?.players?.[oppId];
      if (!opp) continue;
      if (spec.kind === "permanentsYouControl") total += (opp.battlefield || []).filter((perm) => countMatches(perm.card, spec)).length;
    }
    return total;
  }
  // ===== SUBTYPE-ON-BATTLEFIELD (all seats) ===== "the number of <Subtype>s on the battlefield" (Magma
  // Sliver's granted firebreathing X). Counts EVERY permanent of the curated subtype across ALL players'
  // battlefields (not just the controller's), each read off the live front-face type line via countMatches;
  // a CHANGELING (CR 702.73a — every creature type) counts too. Read off the board (not a single-player
  // tally), so computed BEFORE the single-player lookup below. An empty board → 0 (a safe floor).
  if (spec.kind === "subtypeOnBattlefield") {
    let total = 0;
    for (const pl of Object.values(state?.players || {})) {
      for (const perm of pl.battlefield || []) {
        if (countMatches(perm.card, spec) || cardIsChangeling(perm.card)) total += 1;
      }
    }
    return total;
  }
  // ===== DEATHS-THIS-TURN (CR 700.4), all-seats ===== "the number of creatures that died this turn" (Mahadi)
  // sums EVERY player's per-turn creature-death tally (creaturesDiedThisTurn, bumped at the death chokepoint),
  // because "a creature that died" is unscoped — any player's creature counts. The controller-scoped variant
  // ("…under your control") has no scope flag and falls to the player-lookup branch below. A seat with no tally
  // → 0 (safe). Read off the player tallies (not a board scan), so it's computed before the single-player lookup.
  if (spec.kind === "creaturesDiedThisTurn" && spec.scope === "all") {
    return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl.creaturesDiedThisTurn || 0), 0);
  }
  // ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== a count read off a single CREATURE referent's
  // LAYER-AWARE power/toughness AT RESOLUTION (CR 608.2h), NOT a player or board tally — the shared "equal to
  // its/that creature's power/toughness" count source that feeds tokens / counters / damage / life uniformly.
  // The referent is whichever the spec names, threaded by the trigger flush / effect program (runProgram ctx):
  //   triggeringPower / triggeringToughness → ctx.triggeringPermanentId — the TRIGGERING creature (CR 608.2c):
  //     the ENTERING creature on an ETB trigger (Terror of the Peaks "deals damage equal to that creature's
  //     power"; Verdant Sun's Avatar "gain life equal to that creature's toughness"). The detector rewrites the
  //     non-self "that creature's <stat>" → the sentinel the parser maps here, gated to the ETB entering-creature
  //     scopes, so a SPELL's anaphoric "that creature" never reaches it (CREED — sentinel gate).
  //   sourcePower / sourceToughness → ctx.sourceId — the ABILITY'S OWN permanent ("this creature's <stat>").
  // creaturePower/creatureToughness are layer-aware (counters + anthems counted) and read at resolution. An
  // ABSENT referent (a spell / the permanent already left the battlefield) or a NON-creature → 0 (a clean no-op,
  // CR 107.3 — never a fabricated count). Computed BEFORE the player lookup (these read a permanent, not a player).
  const STAT_KIND = {
    triggeringPower: { id: "triggeringPermanentId", read: creaturePower },
    triggeringToughness: { id: "triggeringPermanentId", read: creatureToughness },
    sourcePower: { id: "sourceId", read: creaturePower },
    sourceToughness: { id: "sourceId", read: creatureToughness },
  };
  const stat = STAT_KIND[spec.kind];
  if (stat) {
    const refId = ctx?.[stat.id];
    const lk = refId ? findPermanent(state, refId) : null;
    if (!lk || !/\bCreature\b/.test(String(lk.permanent.card?.type || lk.permanent.card?.type_line || ""))) return 0;
    return Math.max(0, stat.read(lk.permanent, state));
  }
  // ===== TARGET-STAT (DRAW-BY-TARGET-POWER) ===== a count read off the CHOSEN CREATURE TARGET'S layer-aware
  // power/toughness AT RESOLUTION (CR 608.2h) — "draw cards equal to the power of TARGET creature you control"
  // (Soul's Majesty). The referent is the atom's own chosen creature target (ctx.targets, the role-untagged
  // single creature for a one-target draw — exactly the same target the draw atom enumerated via its
  // targetType:"creature"). creaturePower/creatureToughness are layer-aware (counters + anthems count) and read
  // at resolution. The target having LEFT the battlefield between cast and resolution (CR 608.2b — the spell
  // would actually be countered with its only target gone, but if it somehow resolves) or a NON-creature in the
  // slot → 0 (a clean no-op, never a fabricated count). Distinct from the SOURCE-STAT block above: that reads
  // ctx.sourceId/triggeringPermanentId (an ability's own / triggering permanent); this reads the chosen target.
  const TARGET_STAT = { targetCreaturePower: creaturePower, targetCreatureToughness: creatureToughness };
  const targetRead = TARGET_STAT[spec.kind];
  if (targetRead) {
    const tgt = (ctx?.targets || []).find((t) => t.type === "creature");
    const lk = tgt ? findPermanent(state, tgt.id) : null;
    if (!lk || !/\bCreature\b/.test(String(lk.permanent.card?.type || lk.permanent.card?.type_line || ""))) return 0;
    return Math.max(0, targetRead(lk.permanent, state));
  }
  // ===== COUNTERS-ON-SOURCE (DOUBLE-COUNTERS) ===== the number of counters of a given kind CURRENTLY on
  // the ability's OWN permanent (ctx.sourceId), read AT RESOLUTION off the live counter bag. Feeds "double
  // the number of +1/+1 counters on this creature" (Voracious Hydra's modal ETB): an add-counter atom that
  // adds THIS-MANY more of the same kind nets a double (CR 121 — placing N more where N is the current
  // count). The recipient is the same source (target:"self"), and the placement still routes through
  // addCounter's doubler hook, so a counter-doubler (Doubling Season) further multiplies the placed amount
  // per CR 616 — faithful. Reads the EXACT stored count (never fabricated): an absent source (the permanent
  // already left the battlefield) or zero counters → 0 → a clean no-op (no counters added). Computed BEFORE
  // the player lookup (this reads a permanent's counter bag, not a player/board tally).
  if (spec.kind === "countersOnSource") {
    const refId = ctx?.sourceId;
    const lk = refId ? findPermanent(state, refId) : null;
    if (!lk) return 0;
    return Math.max(0, lk.permanent.counters?.[spec.counterType] || 0);
  }
  // ===== DICE-ROLL (CR 726) ===== the result of a just-rolled die (Ancient Dragons "equal to the result").
  // The roll-d20 atom stamps state.diceRoll (a uniform 1–20) IMMEDIATELY before this payoff atom resolves, so
  // this reads the rolled value. The parser gates a diceResult spec to a clause directly following a roll-d20
  // in the same program, so the value is always freshly written before this read (never stale). An ABSENT
  // roll → 0 (a clean no-op, CR 107.3 — never a fabricated count). Read off STATE (the inter-atom channel),
  // not a player/board tally, so it's computed BEFORE the player lookup below.
  if (spec.kind === "diceResult") return Math.max(0, state?.diceRoll || 0);
  // ===== REVEALED-CARD-MV (Yuriko) ===== the MANA VALUE of the card a reveal-top-to-hand atom JUST revealed
  // (Yuriko, the Tiger's Shadow: "reveal the top card of your library and put that card into your hand. Each
  // opponent loses life equal to that card's mana value"). The reveal-top-to-hand atom stamps state.revealedCardMV
  // (the EXACT revealed card's MV) IMMEDIATELY before this payoff atom resolves, mirroring roll-d20 / diceResult.
  // The parser GATES a revealedCardMV count to a clause directly following a reveal-top-to-hand in the same program
  // (revealTopSequenceOk), so the value is always freshly written before this read (never stale). An ABSENT reveal
  // (a spell / no reveal ran) → 0 (a clean no-op, CR 107.3 — never a fabricated count). Read off STATE (the inter-
  // atom channel), not a player/board tally, so it's computed BEFORE the player lookup below.
  if (spec.kind === "revealedCardMV") return Math.max(0, state?.revealedCardMV || 0);
  // ===== OPPONENT-SCOPED ===== who:"target" counts the SPELL'S TARGET player ("…equal to the number of
  // cards in that player's hand" — Sudden Impact) OR, on a combat-damage trigger with no explicit target,
  // the DAMAGED player ("for each artifact that player controls" — Cavern-Hoard Dragon, where "that player"
  // is the player just dealt combat damage, carried as ctx.damagedPlayerId). The explicit spell target wins
  // when present (Sudden Impact path is byte-unchanged); else the damaged player. Everything else counts the
  // controller (the common case). A missing player → 0 (a safe no-op, never silently the controller's count).
  // ===== DEFENDING-PLAYER-SCOPED ===== who:"defendingPlayer" counts the ATTACKED player's permanents
  // ("the number of artifacts they control" on an attacks trigger — Generous Plunderer), read off
  // ctx.defenderId (set ONLY by checkAttackTriggers). Absent (any non-attacks event) → no player → 0 (a
  // safe no-op, never silently the controller's count). The parser pins the deal-damage atom's who to
  // "defendingPlayer" too, so combatDamageReferentSatisfied keeps this native ONLY off an attacks trigger.
  const playerId = spec.who === "target"
    ? (ctx.targets?.find((t) => t.type === "player")?.id ?? ctx.damagedPlayerId)
    : spec.who === "defendingPlayer"
      ? ctx.defenderId
      : ctx.controller;
  const player = playerId ? state?.players?.[playerId] : null;
  if (!player) return 0;
  if (spec.kind === "cardsInHand") return (player.hand || []).length;
  // ===== DEATHS-THIS-TURN (CR 700.4), controller-scoped ===== "creatures that died under your control this
  // turn" (Body Count) reads THIS player's per-turn creature-death tally only. (The unscoped all-seats sum is
  // handled by the scope:"all" branch above the player lookup.) Absent tally → 0 (a safe no-op, never fabricated).
  if (spec.kind === "creaturesDiedThisTurn") return (player.creaturesDiedThisTurn || 0);
  // ===== COUNT-OTHER / DRAW-METRIC ("other") ===== a leading "other" on the count sets `spec.excludeSelf`,
  // which drops the effect's SOURCE permanent (CR 113.7) — "for each OTHER <X> you control" (#365) / the
  // greatest power/toughness "among OTHER creatures you control" (DRAW-METRIC + MANA Arbor Adherent). The
  // source id is whichever the call path threads (ctx.sourceId for a trigger/activated ability, ctx.source for
  // the mana path) — see isExcludedSelf. A plain spell threads neither → nothing excluded (no "other" referent);
  // the cardsInHand / experience kinds have no per-permanent identity, so the flag is a safe no-op there.
  if (spec.kind === "permanentsYouControl") {
    // POWER-QUALIFIED ("creatures you control with power N or greater" — The Boulder): a power threshold is
    // LAYER-AWARE (counters + anthems count), so it's applied here against creaturePower read at resolution
    // (CR 608.2h), not in the type-line-only countMatches. Absent → no threshold (the plain count is unchanged).
    return (player.battlefield || []).filter((perm) =>
      countMatches(perm.card, spec)
      && !isExcludedSelf(perm, spec, ctx)
      && (spec.powerAtLeast == null || creaturePower(perm, state) >= spec.powerAtLeast)
      // COUNTER-QUALIFIED ("…with a +1/+1 counter on it"): count only creatures currently carrying ≥1 +1/+1
      // counter, read at resolution off the live counter bag (CR 608.2h). Absent → no filter (plain count).
      && (spec.requiresCounter == null || (perm.counters?.[spec.requiresCounter] || 0) > 0),
    ).length;
  }
  // ===== CHOSEN-TYPE (Distant Melody) ===== "permanent you control of that type" where the type was chosen
  // at resolution (CR 614.12). The self-play engine maximizes the draw — the count is the greatest, over every
  // creature subtype present, of the controller's permanents of that subtype (changelings count for all). See
  // chosenTypePermanentsCount. Deterministic + optimal, so never an over/under-count.
  if (spec.kind === "chosenTypePermanents") return chosenTypePermanentsCount(player);
  // ===== FOR-EACH ===== cards in the controller's graveyard (raw card objects), optionally one card type.
  if (spec.kind === "cardsInGraveyard") return (player.graveyard || []).filter((c) => (spec.cardType ? countMatches(c, spec) : true)).length;
  // ===== EXPERIENCE ===== the controller's experience counter total (Toph, Command Beacon, etc.)
  if (spec.kind === "experienceCounters") return (player.experience || 0);
  // ===== OVERRUN-X / MANA-VARIABLE / DRAW-METRIC ===== a MAX-reduction: the single greatest layer-resolved
  // power among the controller's creatures (Overwhelming Stampede; Bighorner Rancher / Selvala mana; "draw
  // cards equal to the greatest power among creatures you control"). Reads creaturePower (layer-aware) so prior
  // buffs/counters count; an empty board → 0. The "among OTHER creatures …" form (spec.excludeSelf) drops the
  // source via greatestPtAmong. Existing callers pass no excludeSelf, so their result is unchanged.
  if (spec.kind === "greatestPowerYouControl") {
    return greatestPtAmong(state, player, spec, ctx, creaturePower);
  }
  // ===== MANA-VARIABLE / DRAW-METRIC ===== the single greatest layer-resolved TOUGHNESS among the controller's
  // creatures (Arbor Adherent mana "among OTHER creatures" → excludeSelf; DRAW-METRIC greatest-toughness draw).
  // Mirrors greatestPowerYouControl through the same exclude-aware helper.
  if (spec.kind === "greatestToughnessYouControl") {
    return greatestPtAmong(state, player, spec, ctx, creatureToughness);
  }
  // ===== MANA-VARIABLE ===== devotion to a color (Karametra's Acolyte): the number of mana symbols of that
  // color in the mana costs of permanents the controller controls (CR 700.5 — a hybrid/Phyrexian pip
  // containing the color counts too). The source itself counts (it's on the battlefield with its own cost).
  if (spec.kind === "devotion") {
    return (player.battlefield || []).reduce((sum, perm) => sum + devotionPips(perm.card, spec.color), 0);
  }
  return 0;
}

// COUNT-OTHER / DRAW-METRIC / MANA "among OTHER" exclusion (CR 113.7): `spec.excludeSelf` drops the effect's
// SOURCE permanent. The source id is whichever the call path threads — ctx.sourceId (a trigger/activated
// ability: #365 COUNT-OTHER + DRAW-METRIC) or ctx.source?.id (the mana path, where ctx.source is the tapped
// permanent — Arbor Adherent). A spell threads neither → nothing excluded (no "other" referent). Note we do
// NOT drop ctx.triggeringPermanentId: "other" excludes the ABILITY'S SOURCE, not whatever triggered it (which
// for a non-self trigger is a different permanent).
function isExcludedSelf(perm, spec, ctx) {
  if (!spec.excludeSelf || perm?.id == null) return false;
  const sourceId = ctx?.sourceId ?? ctx?.source?.id ?? null;
  return sourceId != null && perm.id === sourceId;
}

// MANA-VARIABLE / DRAW-METRIC — the greatest layer-resolved P/T among the controller's creatures, honoring the
// "among OTHER creatures" exclusion (spec.excludeSelf, via isExcludedSelf). `read` = creaturePower or
// creatureToughness. Empty (or self-only with excludeSelf) → 0.
//
// TYPE-NEGATED (Return of the Wildspeaker "greatest power among non-Human creatures you control") — spec.notSubtype
// drops every creature of that subtype from the pool. Word-bounded, case-insensitive front-face type-line read
// (CR 712.4a — a DFC/adventure's front face defines its types), mirroring massCreatureTargets' subtypeNegate; a
// CHANGELING (CR 702.73a — IS every creature type, so it IS the negated subtype) is also excluded. Absent → no
// filter (every existing caller is byte-for-byte unchanged).
function greatestPtAmong(state, player, spec, ctx, read) {
  const negRe = spec.notSubtype ? new RegExp(`\\b${spec.notSubtype.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  return (player.battlefield || [])
    .filter((perm) => /\bCreature\b/.test(String(perm.card?.type || perm.card?.type_line || "")))
    .filter((perm) => !isExcludedSelf(perm, spec, ctx))
    .filter((perm) => !negRe || !(negRe.test(typeLineStr(perm.card).split(" // ")[0]) || cardIsChangeling(perm.card)))
    .reduce((mx, perm) => Math.max(mx, read(perm, state)), 0);
}

// MANA-VARIABLE — count mana-symbol pips of `color` (a WUBRG letter) in a card's mana cost. Each pip
// `{…}` whose content (split on "/" for hybrid/Phyrexian) includes the color counts once (CR 700.5).
function devotionPips(card, color) {
  const cost = String(card?.mana || card?.mana_cost || "");
  let n = 0;
  for (const pip of cost.match(/\{[^}]+\}/g) || []) {
    if (pip.slice(1, -1).split("/").includes(color)) n += 1;
  }
  return n;
}
// Resolved numeric amount: a CONTEXT number (`countContext` — a trigger-context magnitude like the dying
// creature's power, DIES-TRIGGER-RESOURCE-PAYOFFS: "gain life … equal to its power" = ctx.dyingPower;
// mirrors the create-named-token / draw / rad countContext path), floored at 0 and a clean no-op when the
// ctx key is absent (a spell / non-dies context → 0, never a fabricated count); else a board count
// (`amountCount`) × a per-unit value (FOR-EACH "gain 2 life for each X" → per 2; DMG-SCALE damage = the
// count itself → per defaults to 1), computed at resolution; else the X-amount (`amountX` → ctx.xValue) or
// the printed numeric amount.
// HALF-X: every branch is wrapped by halveAmount(…, atom.halve) so "half (a context magnitude)" / "half (a
// board count)" round correctly too — a no-op (passes the raw value) when atom.halve is unset, so every
// existing caller is byte-identical. effectiveAmount already halves internally; halving its (already-halved)
// output would be wrong, so the X/printed branch is NOT re-wrapped here — it's the leaf that owns the halve.
export const resolveScaledAmount = (state, atom, ctx) =>
  atom.countContext ? halveAmount(ctx[atom.countContext] || 0, atom.halve)
    : atom.amountCount ? halveAmount(countForSpec(state, ctx, atom.amountCount) * (atom.amountCount.per ?? 1), atom.halve)
      : effectiveAmount(atom, ctx);
