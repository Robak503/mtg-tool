/**
 * effects/atoms/shared.js — STRICT LEAF shared helpers for the atom resolver family modules.
 *
 * Imports ONLY from gameState.js etc. — NEVER from a sibling atoms/* module, so the import graph
 * stays a DAG (shared <- everything). Pure move out of effectAtoms.js: target gatherers, count
 * engine, type predicates, and the token descriptor word sets.
 */

import { findPermanent, creaturePower, creatureToughness, opponentsOf } from "../../gameState.js";
import { MASS_WIPE_SCOPES } from "../../targetTypes.js"; // leaf module (pure strings) — no cycle; feeds the atomTargets drift guard below
import { permanentIsCreature, permanentHasCardType, domainCount, partyCount, permIsEveryCreatureType, deriveCharacteristics } from "../../layers.js"; // + permanentHasCardType (#651): the layer-aware, face-up land read of the opponents' nonland set // + deriveCharacteristics (#587): a permanent's copiable values + layer-4 types for the nonland mana-value set // + permIsEveryCreatureType (P·39): the one every-creature-type read for these battlefield filters and counts // + partyCount (2026-09-30): ONE party evaluator for both twins; // + domainCount (2026-09-06): ONE domain evaluator for the cast reduction and the layer bonus // LAYER-AWARE creature check (layers.js is a lower leaf — no cycle back into shared.js; combat.js uses the same import)
import { creatureSatisfiesRestrictions } from "../../creatureRestrictions.js"; // the SHARED 16-kind restriction satisfier (leaf: gameState + layers + keywords only — every one of those edges already exists above, so no cycle)
import { CR_CREATURE_TYPES } from "../creatureTypes.js"; // P·39 — every creature type answers for a CREATURE type only (CR 205.3d); a zero-import leaf
import { isBlockingCreature } from "../../combatRemoval.js"; // CR 506.4 — the one "is it a blocking creature" read (a zero-import leaf)
import { evaluateInterveningIf } from "../../interveningIf.js"; // INSTEAD-AMOUNT (BLITZ INST-1) — the shared board-condition readers for a condition-gated amountUpgrade; interveningIf → gameState is a leaf edge (gameState imports neither shared.js nor interveningIf), so no cycle

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
      // LAYER-AWARE (slice 27, CR 613): an animated land / crewed Vehicle IS a creature right now.
      if (!(isCreatureCard(perm.card) || permanentIsCreature(state, perm.id))) continue;
      // "ALL OTHER creatures" (④-AV, 2026-09-04 — Shrieking Mogg / Thundermare / Timbermare "tap all other creatures"):
      // CR 109.5 — the ability's own permanent is excluded when the atom says so. Fails CLOSED without a sourceId
      // (nothing is excluded → the source is tapped too), so the parser arm is reached only from a source-bearing
      // trigger; every existing mass atom passes no excludeSource and is byte-identical.
      if (opts.excludeSource && opts.sourceId && perm.id === opts.sourceId) continue;
      if (subRes) {
        const face = typeLineStr(perm.card).split(" // ")[0]; // front face only (CR 712.4a)
        // carries ANY listed subtype — printed, or every creature type for a listed creature type (P·39: a changeling, Mirror
        // Entity's activation, an animated Mutavault IS a Dragon, so "destroy all non-Dragon creatures" spares it)
        const has = subRes.some((re) => re.test(face)) || permIsEveryCreatureType(state, perm.id);
        if (opts.subtypeNegate ? has : !has) continue;
      }
      // POWER threshold (BLITZ PW-1 — "destroy all creatures with power N or greater/less", Elspeth, Sun's
      // Champion). LAYER-AWARE effective power (CR 613.3 — counters + anthems counted), read at resolution so
      // a pumped/shrunk creature is judged by its CURRENT power (CR 208.1). ">=" keeps power ≥ N; "<=" ≤ N.
      if (opts.powerCmp && typeof opts.powerVal === "number") {
        const pw = creaturePower(perm, state);
        if (opts.powerCmp === ">=" ? pw < opts.powerVal : pw > opts.powerVal) continue;
      }
      // MANA-VALUE threshold (CR 202.3 — "destroy all creatures with mana value N or less/greater";
      // Austere Command, EDHREC #169). Reads the slim-index `cmc` with the same `?? 0` default the
      // manaValue TARGET restriction uses. That default is CORRECT here, not merely conservative: a TOKEN
      // has no mana cost and therefore mana value 0 (CR 111.5), so tokens genuinely fall inside an
      // "N or less" wipe — which is exactly what Austere Command does to a board of Soldier tokens.
      // Unlike power this is NOT layer-aware: mana value comes from the printed mana cost and no layer
      // alters it (CR 202.3b), so a pumped creature keeps its mana value.
      if (opts.mvCmp && typeof opts.mvVal === "number") {
        const mv = perm.card?.cmc ?? 0;
        if (opts.mvCmp === ">=" ? mv < opts.mvVal : mv > opts.mvVal) continue;
      }
      // ⭐ THE SHARED 16-KIND GRAMMAR (2026-07-30) — the bespoke gates above stay exactly as they were, and
      // this runs AFTER them, so every incumbent wipe is byte-identical (an atom with no `restrictions` passes
      // an empty array, and the satisfier over [] is true). What it adds is everything the destroy/exile/bounce
      // verbs could never say while the damage verb could: colour, colorNeg, typeNeg, cardType, tapped,
      // combat state, toughness, enteredThisTurn — all already implemented, just unreachable from here.
      //
      // opts.casterId is the ability's controller (needed by the controller/defendingPlayer/damagedPlayer
      // restrictions). When it is absent the satisfier still runs, and a controller-scoped restriction simply
      // cannot be satisfied — an under-inclusive sweep, which is the safe direction.
      if (opts.restrictions?.length
          && !creatureSatisfiesRestrictions(state, perm, pid, opts.casterId, opts.restrictions, opts.ctx || null)) continue;
      out.push({ type: "creature", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * SAME-NAME MASS SET (BLITZ BB-1, CR 611.2c) — every battlefield creature (all players; tokens count) whose
 * card NAME equals `name`, as `{type:"creature", id, controller}` descriptors. The fixed set for the same-name
 * mass pump (Bile Blight / Echoing Decay / Echoing Courage): the ONE chosen target's name is read AT RESOLUTION
 * and every creature sharing it (the target itself + all others) gets the ±N/±N. EXACT card-name match (CR
 * 201.2 — two objects have the same name iff their names are identical); an empty/absent name → [] (a nameless
 * object shares its name with nothing — never a fabricated all-board sweep). Pure name/type-line read (strict
 * leaf). Players-then-battlefield order (stable, serialize-deterministic), mirroring massCreatureTargets.
 */
export function sameNameCreatureTargets(state, name) {
  if (!name) return [];
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if ((isCreatureCard(perm.card) || permanentIsCreature(state, perm.id)) && perm.card?.name === name) out.push({ type: "creature", id: perm.id, controller: pid });
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
 * "EACH NONLAND PERMANENT WITH MANA VALUE N OR LESS" (Culling Ritual, play-weighted #587) — every permanent on EVERY
 * battlefield that is not a land and whose mana value is at most `mvMax`, as `{type:"permanent"}` descriptors (the type
 * applyDestroyEffect accepts; it re-reads creature / planeswalker for the dies look-back). Players-then-battlefield order,
 * like the other mass sets. Both questions are asked of the OBJECT on the battlefield, not of the printed card:
 *   - MANA VALUE (CR 202.3) — of the copiable values when a layer-1 copy effect applies (the mana cost is copied,
 *     CR 707.2, 613.1a), else of the card. `cmc` is Scryfall's mana value: a double-faced card's front face (the face the
 *     engine puts up, CR 712.8d), an adventurer's creature card (CR 715.4), {X} counted as 0 (CR 202.3e). No `cmc` reads 0
 *     (CR 202.3a): a token that isn't a copy has no mana cost (CR 202.1b), nor has a face-down permanent's stand-in
 *     (CR 708.2a) — so both are swept. A split permanent (a Room) reads its combined cost: the engine has no unlocked-half
 *     designations (CR 709.5), so its value can only read too HIGH, never too low.
 *   - LAND (CR 205.2a) — the layer-aware card types (a copy's types, layer 4's additions), EXCEPT for a multi-face card:
 *     the engine never turns a back face up (it has no transform), so a " // " permanent is front face up (CR 712.8d,
 *     712.14) and that face's printed types are its types. The layer derive reads the whole combined line, and a front
 *     face printed without subtypes ("Legendary Enchantment // Legendary Land" — Search for Azcanta) picks up the BACK
 *     face's Land there, which would spare a permanent this sweep destroys. (No effect the engine models adds the Land
 *     type to a multi-face permanent: the layer effects that can add Land act on a single-faced card itself, Arixmethes'
 *     gated static, or on Treasures.)
 */
export function nonlandPermanentsWithManaValueAtMost(state, mvMax) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      const chars = deriveCharacteristics(state, perm.id);
      const object = chars.copiableValues || perm.card;
      const line = typeLineStr(object);
      const land = line.includes(" // ") ? /\bLand\b/.test(line.split(" // ")[0]) : chars.types.includes("Land");
      if (land || (object?.cmc ?? 0) > mvMax) continue;
      out.push({ type: "permanent", id: perm.id, controller: pid });
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
  //     UNION (Vault 12's chapter III "each creature you control that's a Zombie or Mutant" — SHELF S7):
  //     an ARRAY matches ANY listed subtype (the massCreatureTargets subList pattern exactly); a single
  //     string keeps its original one-subtype behavior byte-for-byte.
  const subFilters = opts.subtypeFilter == null ? null : (Array.isArray(opts.subtypeFilter) ? opts.subtypeFilter : [opts.subtypeFilter]);
  const subRes = subFilters ? subFilters.map((s) => new RegExp(`\\b${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)) : null;
  // TYPE-NEGATED team scope (Return of the Wildspeaker "Non-Human creatures you control get +3/+3") — subtypeNegate
  // keeps only creatures NOT of that subtype. Word-bounded, case-insensitive front-face read (CR 712.4a), and a
  // CHANGELING (CR 702.73a — IS every creature type) is excluded too, mirroring greatestPtAmong's notSubtype. The
  // subtype is a curated allowlist word (parser-side), so the \b match credits exactly the non-<Subtype> creatures.
  const negRe = opts.subtypeNegate ? new RegExp(`\\b${opts.subtypeNegate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  return player.battlefield
    .filter((perm) => isCreatureCard(perm.card) || permanentIsCreature(state, perm.id))
    .filter((perm) => !(opts.excludeSource && perm.id === opts.sourceId))
    .filter((perm) => !opts.legendaryOnly || /\bLegendary\b/.test(typeLineStr(perm.card)))  // Hajar's supertype gate
    // P·39 — every creature type answers a CREATURE-type filter only (CR 205.3d): Steel Overseer's "each artifact creature you
    // control" (counters.js — the card-type qualifier rides subtypeFilter "Artifact" / "Enchantment") is never met by it.
    .filter((perm) => !subRes || subRes.some((re) => re.test(typeLineStr(perm.card)))
      || (subFilters.some(isCreatureTypeWord) && permIsEveryCreatureType(state, perm.id)))
    .filter((perm) => !negRe || !(negRe.test(typeLineStr(perm.card).split(" // ")[0])
      || permIsEveryCreatureType(state, perm.id)))
    .map((perm) => ({ type: "creature", id: perm.id, controller }));
}

// SELF-BOUNCE (forced "return a[nother] permanent|creature you control to its owner's hand" — Kor Skyfisher,
// Emancipation Angel, Cache Raiders, Roaring Primadox, Shrieking Drake, Yarok's Wavecrasher). The controller
// MUST return ONE of their OWN permanents (a real drawback), so the engine picks the LEAST-BAD to bounce,
// deterministically AT RESOLUTION (CR 608.2h): a LAND first (you replay it — minimal loss), then a TAPPED
// permanent (already spent this turn), then battlefield order (serialize-stable). `creatureOnly` restricts to
// creatures ("return a CREATURE you control"); `excludeSource` drops the trigger source ("return ANOTHER …",
// CR 109.5). Empty candidate set → [] (a clean no-op — "another" with no other permanent, or a board emptied
// between trigger and resolution — never a fabricated bounce). Tagged type:"permanent" (applyZoneMove moves by
// id regardless of card type). This is ENGINE-CORRECT (it always returns a valid own permanent, exactly as the
// card reads); the choice is a deterministic sensible default, never an opponent's permanent, never a no-op
// when a legal permanent exists.
export function worstOwnBounceTarget(state, controller, { creatureOnly = false, landOnly = false, excludeSource = false, sourceId = null, restrictions = null } = {}) {
  const bf = state.players?.[controller]?.battlefield || [];
  // KAROO (LB-1, 2026-08-06) — `landOnly` is the mirror of `creatureOnly`, for "return a LAND you control to
  // its owner's hand" (Selesnya Sanctuary and the whole Ravnica bounce-land cycle, plus Tazeem Raptor's
  // optional form). The rank below already prefers a TAPPED LAND, which is the correct Karoo line: you
  // return the land you have already used this turn.
  // ⛔ NO implicit excludeSource. "a land you control" includes the Karoo itself (CR 109.5 would need the
  // printed word "another", and these cards do not print it), so bouncing itself is LEGAL. The rank's
  // first-in-order tie-break means an EARLIER tapped land wins, so it only self-bounces when it is the sole
  // tapped land — which is a real line, not a bug. Modelling a printed permission away would be the CREED
  // violation here, in the direction of refusing something the card allows.
  // COLOUR-FILTERED (2026-09-30 — Horned Kavu's "a red or green creature you control"): the printed filter as the SHARED
  // restriction satisfier reads it (colorAny: layer-aware, fail-closed), so the pick can never return an off-colour creature.
  const cands = bf.filter((p) => (!creatureOnly || isCreatureCard(p.card)) && (!landOnly || isLandCard(p.card))
    && !(excludeSource && p.id === sourceId)
    && (!restrictions?.length || creatureSatisfiesRestrictions(state, p, controller, controller, restrictions, null)));
  if (cands.length === 0) return [];
  const rank = (p) => (isLandCard(p.card) ? 0 : 2) + (p.tapped ? 0 : 1); // tapped-land 0 · untapped-land 1 · tapped-nonland 2 · untapped-nonland 3
  let best = cands[0], bestRank = rank(best);
  for (const p of cands.slice(1)) { const r = rank(p); if (r < bestRank) { best = p; bestRank = r; } } // strict < → first-in-order ties (stable)
  return [{ type: "permanent", id: best.id, controller }];
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
      if (!(isCreatureCard(perm.card) || permanentIsCreature(state, perm.id))) continue;
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
 *
 * ⚠️ DRIFT GUARD (2026-07-18): the if-chain below is the RESOLUTION side of the mass-scope triangle
 * (castability = targetTypes.NON_CHOSEN_TARGET_TYPES · AI hold = targetTypes.MASS_WIPE_SCOPES ·
 * resolution = here). ATOM_TARGETS_MASS_HANDLED enumerates exactly the mass targetTypes this chain
 * resolves; the load-time check beneath it throws if a wipe scope exists that this chain can't
 * resolve — the "classifies native but silently does nothing" failure mode. Add a branch → add the
 * string, in the same edit.
 */
const ATOM_TARGETS_MASS_HANDLED = new Set([
  "eachCreature", "eachArtifact", "eachEnchantment", "eachLand", "eachArtifactOrEnchantment",
  "eachArtifactCreatureOrEnchantment",
  "eachOpponentCreature",
]);
for (const tt of MASS_WIPE_SCOPES) {
  if (!ATOM_TARGETS_MASS_HANDLED.has(tt)) {
    throw new Error(`atoms/shared.js: MASS_WIPE_SCOPES has "${tt}" but atomTargets has no branch resolving it — the wipe would classify native and silently resolve to nothing`);
  }
}

export const atomTargets = (state, atom, ctx) => {
  // CRUX — a subtype-filtered mass set ("destroy all Dragon creatures" / "all non-Dragon creatures"). The bare
  // "destroy all creatures" wipe carries no subtypeFilter, so it passes EVERY creature (unchanged byte-for-byte).
  // `restrictions` is the SHARED grammar (2026-07-30) — the same array the damage side has always carried,
  // now readable here too, so a destroy/exile/bounce can say every filter a burn spell could.
  if (atom.targetType === "eachCreature") return massCreatureTargets(state, { subtypeFilter: atom.subtypeFilter, subtypeNegate: atom.subtypeNegate, powerCmp: atom.powerCmp, powerVal: atom.powerVal, mvCmp: atom.mvCmp, mvVal: atom.mvVal, restrictions: atom.restrictions, casterId: ctx?.controller, ctx, excludeSource: atom.excludeSource, sourceId: ctx?.sourceId });
  if (atom.targetType === "eachArtifact") return massPermanentTargets(state, isArtifactCard);
  if (atom.targetType === "eachEnchantment") return massPermanentTargets(state, isEnchantmentCard);
  if (atom.targetType === "eachLand") return massPermanentTargets(state, atom.landSubtype
    ? (c) => isLandCard(c) && new RegExp(`\\b${atom.landSubtype}\\b`, "i").test(typeLineStr(c)) // MASS-LAND-SUBTYPE (Boil "destroy all Islands")
    : isLandCard);
  if (atom.targetType === "eachArtifactOrEnchantment") return massPermanentTargets(state, (c) => isArtifactCard(c) || isEnchantmentCard(c));
  // THE TRIPLE (stage ③ · 29 — Nevinyrral's Disk, Akroma's Vengeance): the layer-aware creature set the Wrath path uses (an
  // animated land counts), plus every artifact and enchantment by type line like the pair above — each permanent ONCE (an
  // artifact creature is in both halves; its creature descriptor wins).
  if (atom.targetType === "eachArtifactCreatureOrEnchantment") {
    const creatures = massCreatureTargets(state);
    const seen = new Set(creatures.map((t) => t.id));
    return [...creatures, ...massPermanentTargets(state, (c) => isArtifactCard(c) || isEnchantmentCard(c)).filter((t) => !seen.has(t.id))];
  }
  // MASS-OPPONENT-BOUNCE (Scourge of Fleets) — "each creature your opponents control[ with toughness X or less]"
  // gathered AT RESOLUTION (CR 611.2c — the set is fixed as the one-shot begins). The optional toughness bound X
  // is a board COUNT (atom.toughnessAtMostCount, e.g. "the number of Islands you control") resolved here via
  // countForSpec against the CONTROLLER's board, then applied as a layer-aware upper bound in opponentCreature-
  // Targets. No chosen targets (a NON-targeted mass set, like eachCreature), so the trigger routes natively on
  // program confidence alone. Absent count → no bound (a full opponent-board bounce). CR 111.7: an opponent's
  // token returned this way ceases to exist (handled by the hand-zone move in applyZoneMove).
  // MASS-OWN-BOARD (Golgari Charm "Regenerate each creature you control") — the mirror of
  // eachOpponentCreature. Scoped by CONTROLLER at resolution, not by a restriction: massCreatureTargets
  // takes characteristic filters (subtype/power/mana value) but no controller predicate, so a controller
  // restriction on eachCreature would be SILENTLY IGNORED and the effect would regenerate the opponents'
  // creatures too — a wrong effect, not a missing one. Its own targetType makes that unrepresentable.
  // Layer-aware through massCreatureTargets (CR 613), so an animated permanent you control is included.
  if (atom.targetType === "eachCreatureYouControl") {
    return massCreatureTargets(state, {}).filter((t) => t.controller === ctx.controller);
  }
  // NONLAND PERMANENTS YOUR OPPONENTS CONTROL (play-weighted #651 — Ruinous Ultimatum "Destroy all nonland permanents your opponents
  // control."): every permanent an opponent controls that is not a land as it exists right now — layers.permanentHasCardType, the
  // battlefield card-type reader: layer-aware (an animated land is still a land; Arixmethes is one while it has a slumber counter) and
  // read on the face that is up (CR 712.8d). Fixed as the effect is applied (CR 608.2h). The controller's own permanents are never in
  // the set.
  if (atom.targetType === "eachOpponentNonlandPermanent") {
    return opponentsOf(state, ctx.controller).flatMap((pid) => (state.players?.[pid]?.battlefield || [])
      .filter((perm) => !permanentHasCardType(state, perm.id, "Land"))
      .map((perm) => ({ type: "permanent", id: perm.id, controller: pid })));
  }
  if (atom.targetType === "eachOpponentCreature") {
    const cap = atom.toughnessAtMostCount ? countForSpec(state, ctx, atom.toughnessAtMostCount) : undefined;
    const set = opponentCreatureTargets(state, ctx.controller, { toughnessAtMost: cap });
    // RESTRICTIONS on the opponent-creature sweep (SHELF-85 · Halfshell Q4 — Swift Demise "destroy each creature you don't
    // control THAT WAS DEALT DAMAGE THIS TURN", 2026-09-05): the shared satisfier, applied per member — without it a
    // restricted atom on this scope swept EVERY opponent creature (the witness caught the undamaged one dying).
    if (!atom.restrictions?.length) return set;
    return set.filter((t) => {
      const lk = findPermanent(state, t.id);
      return !!lk && creatureSatisfiesRestrictions(state, lk.permanent, lk.controller, ctx.controller, atom.restrictions, ctx);
    });
  }
  // SAME-NAME MASS PUMP (BLITZ BB-1, CR 611.2c — Bile Blight / Echoing Decay / Echoing Courage) — the atom carries
  // ONE chosen target (ctx.targets, targetType:"creature"); read its NAME AT RESOLUTION and fan the ±N/±N out to
  // EVERY battlefield creature sharing that card name (the target itself + all others, all players, tokens
  // included), the fixed set locked HERE (CR 611.2c). A chosen target that vanished before resolution (killed in
  // response, CR 608.2b — a single-target spell with an illegal target doesn't resolve) → [] (a clean fizzle: the
  // same-name others are NOT independent targets, so they get nothing when the sole target is gone).
  if (atom.nameFanout) {
    const chosen = (ctx.targets || []).find((tt) => tt.type === "creature" && findPermanent(state, tt.id));
    if (!chosen) return [];
    const nm = findPermanent(state, chosen.id)?.permanent?.card?.name;
    return sameNameCreatureTargets(state, nm);
  }
  if (atom.scope === "youControl") return controllerCreatureTargets(state, ctx.controller, { excludeSource: atom.excludeSource, sourceId: ctx.sourceId, subtypeFilter: atom.subtypeFilter, subtypeNegate: atom.subtypeNegate, legendaryOnly: atom.legendaryOnly });
  // "EACH OF THOSE CREATURES" (shelf D22 — Heroes in a Half Shell): the dealers the batch combat-damage trigger named
  // (ctx.batchDealerIds, stamped by checkBatchCombatDamageTriggers) — those still on the battlefield as it resolves; one
  // that has left gets nothing (CR 400.7 — wherever it went, it is a new object, not one of "those creatures").
  if (atom.scope === "batchDealers") {
    return (ctx.batchDealerIds || []).map((id) => findPermanent(state, id)).filter(Boolean).map((lk) => ({ type: "creature", id: lk.permanent.id, controller: lk.controller }));
  }
  // EACH-CREATURE-TARGET-PLAYER-CONTROLS (Contagion Engine — "put a -1/-1 counter on each creature target
  // player controls"): the CHOSEN target is a PLAYER (it rides ctx.targets via the shared player-target
  // enumeration); the effect's recipients are every creature THAT player controls, gathered AT RESOLUTION
  // (CR 611.2c — the set is fixed as the one-shot begins). Expanded here so the consuming atom's creature
  // loop is unchanged. A vanished/invalid player target → [] (a clean no-op, never a fabricated set).
  if (atom.eachCreatureOfTargetPlayer) {
    const pt = (ctx.targets || []).find((t) => t.type === "player" && state.players?.[t.id]);
    return pt ? controllerCreatureTargets(state, pt.id) : [];
  }
  // LAND-CREATURES-YOU-CONTROL (Bumi's earthbend'd lands) — a LAYER-AWARE gather: every battlefield permanent the
  // controller controls that IS a creature right now (permanentIsCreature, so an earthbend-animated Land counts)
  // AND still carries the printed Land type (earthbend keeps Land, CR 613.7c). controllerCreatureTargets can't be
  // reused (it filters on the PRINTED creature type, missing animated lands). Read at resolution (CR 611.2c).
  if (atom.scope === "landCreaturesYouControl") {
    return (state.players[ctx.controller]?.battlefield || [])
      .filter((p) => permanentIsCreature(state, p.id) && /\bLand\b/.test(p.card?.type || ""))
      .map((p) => ({ type: "creature", id: p.id, controller: ctx.controller }));
  }
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
  // LEAST-TOUGHNESS-YOU-CONTROL — BOLSTER N (CR 701.39a — BLITZ KW-1): "Choose a creature you control with the
  // least toughness OR TIED FOR least toughness among creatures you control. Put N +1/+1 counters on that
  // creature." A NON-targeted controller choice; a +1/+1 counter is purely beneficial and it's the controller's
  // OWN pick, so the deterministic auto-pick is the least-EFFECTIVE-toughness own creature (creatureToughness —
  // LAYER-AWARE, so counters + anthems + -N/-N are all counted, CR 613 / 608.2h — NOT the printed type-line
  // stat). Ties ("or tied for least") are broken by battlefield order (serialize-stable), a LEGAL pick the
  // controller is entitled to make. The SOURCE is eligible if it's a creature you control (701.39a has no
  // "other" — unlike Support). Non-finite toughness (a */star creature) never wins the min (stays the initial
  // best only if it's the sole/first candidate). Empty own board → [] (a clean no-op, never a fabricated
  // target). Read AT RESOLUTION.
  if (atom.scope === "leastToughnessYouControl") {
    const own = controllerCreatureTargets(state, ctx.controller);
    if (own.length === 0) return [];
    let best = own[0], bestTuf = Infinity;
    for (const t of own) {
      const lk = findPermanent(state, t.id);
      const tuf = lk ? creatureToughness(lk.permanent, state) : Infinity;
      if (Number.isFinite(tuf) && tuf < bestTuf) { bestTuf = tuf; best = t; }
    }
    return [best];
  }
  // DICE-ROLL multi-target (CR 603.7 reflexive payoff — Ancient Bronze Dragon's "put X +1/+1 counters on
  // each of up to two TARGET creatures"). Modeled as a controller-scoped optimal pick: a +1/+1 counter is
  // purely beneficial, so the controller buffs up to two of ITS OWN creatures (never an opponent's). The
  // first two in battlefield order — deterministic + serialize-stable, matching the engine's first-legal
  // target philosophy; fewer than two creatures → buff whatever's there (a clean partial, never fabricated).
  if (atom.scope === "upToTwoYouControl") return controllerCreatureTargets(state, ctx.controller).slice(0, 2);
  // SELF-BOUNCE forced own-choice — "return a[nother] permanent|creature you control" (Kor Skyfisher family).
  if (atom.scope === "oneYouControlWorst") return worstOwnBounceTarget(state, ctx.controller, { creatureOnly: atom.creatureOnly, landOnly: atom.landOnly, excludeSource: atom.excludeSource, sourceId: ctx.sourceId, restrictions: atom.restrictions });
  if (atom.scope === "eachOpponentCreature") return opponentCreatureTargets(state, ctx.controller);
  // COMBAT-TEAM-PUMP — every ATTACKING / BLOCKING creature right now (Trumpet Blast "attacking creatures
  // get +1/+0", Hold the Line "blocking creatures get +0/+5"). The set is locked at resolution (CR 611.2c);
  // combat state lives in state.combat.attackers (permanentId) / .blockers (blockerId), the same source
  // creatureSatisfiesRestrictions reads for the "attacking"/"blocking" target restriction.
  if (atom.scope === "attackingCreatures") {
    // BATTLE CRY (BC-1): excludeSource drops the trigger's own source (CR 702.90a "each OTHER attacking
    // creature"); absent (Trumpet Blast), every attacker is included — byte-identical to before.
    return massCreatureTargets(state)
      .filter((t) => (state.combat?.attackers || []).some((a) => a.permanentId === t.id))
      .filter((t) => !(atom.excludeSource && ctx?.sourceId && t.id === ctx.sourceId));
  }
  // A blocker REMOVED from combat (CR 506.4 — its controller changed, it regenerated) keeps its block records, so the
  // attacker it blocked stays blocked (CR 509.1h), but it is no longer a blocking creature: isBlockingCreature reads the
  // removedFromCombat stamp it carries (combatRemoval.js — the one "is it blocking" read).
  if (atom.scope === "blockingCreatures") return massCreatureTargets(state).filter((t) => isBlockingCreature(state, findPermanent(state, t.id)?.permanent));
  if (atom.target === "self") return selfTargets(state, ctx);
  if (atom.target === "thatCreature") return triggeringTargets(state, ctx);
  // PERMANENT-WIDE triggering referent (Amulet of Vigor's "untap IT" on an entering land) — see
  // triggeringPermanentTargets; kept distinct from "thatCreature" so no creature-scoped effect can reach it.
  if (atom.target === "thatPermanent") return triggeringPermanentTargets(state, ctx);
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
  // ④-Q — LAST KNOWN INFORMATION (CR 113.7a): the Aura LEFT the battlefield as its own activation cost ("Sacrifice
  // this Aura: …"), so the host is the one stamped at activation (ctx.enchantedLkiId, actionDispatcher). Read ONLY
  // when the source is gone: an Aura still on the battlefield but detached keeps the live (empty) answer.
  const hostId = auraLk ? auraLk.permanent?.attachedTo : (ctx.enchantedLkiId || null);
  if (!hostId) return [];
  const hostLk = findPermanent(state, hostId);
  // LAYER-AWARE (census slice 23) — "enchanted creature" still requires the host to BE a creature, but that
  // is a LIVE question, not a printed one: an Aura on a permanent that has been animated (or a Vehicle that
  // is currently crewed) has a creature host right now. The printed-card check alone no-opped the effect
  // while the metric read HIGH — the same catch selfTargets already carries.
  return hostLk && (isCreatureCard(hostLk.permanent.card) || permanentIsCreature(state, hostId))
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
  // LAYER-AWARE (BLITZ SC-1 catch): an ANIMATED source (Creeping Tar Pit mid-activation — a land that
  // became a creature) counts too; the printed-card check alone silently dropped self effects on it
  // (the metric said HIGH while the runtime no-opped — the exact FP class the CREED forbids).
  if (!lk) return [];
  if (isCreatureCard(lk.permanent.card) || permanentIsCreature(state, ctx.sourceId)) {
    return [{ type: "creature", id: ctx.sourceId, controller: lk.controller }];
  }
  // NON-CREATURE SELF (census slice 22) — the same catch as the animated-land case above, one type wider.
  // An Aura / artifact / enchantment referring to ITSELF ("At the beginning of the end step, return this Aura
  // to its owner's hand.") parses to a HIGH self-targeted atom, but returning [] here made the effect a
  // SILENT NO-OP: measured on Mark of Fury, the trigger fired, resolved, and the Aura simply stayed attached.
  // The metric says HIGH while the runtime does nothing — exactly the FP class the comment above forbids.
  // Typed "permanent" (not "creature"), which is the type applyZoneMove and the other permanent-scoped atoms
  // already accept; a creature source is unchanged, so no existing self effect moves.
  return [{ type: "permanent", id: ctx.sourceId, controller: lk.controller }];
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
  // LAYER-AWARE (census slice 23) — the same catch selfTargets already carries. The PRINTED-card check alone
  // silently dropped the referent for a permanent that is a creature only BY LAYERS (an animated land that
  // triggered something), so the effect no-opped while the metric read HIGH. Verified: with an animated land
  // as the triggering permanent this returned [] while selfTargets on the same permanent returned it.
  return lk && (isCreatureCard(lk.permanent.card) || permanentIsCreature(state, id))
    ? [{ type: "creature", id, controller: lk.controller }] : [];
}

/**
 * TRIG-PRONOUN-IT, PERMANENT-WIDE — the same referent as triggeringTargets with the CREATURE predicate
 * dropped. Amulet of Vigor ("whenever a permanent you control enters tapped, untap IT") is normally
 * untapping a LAND, so the creature-only sibling above returns [] for it and the untap silently no-ops —
 * the runtime-vacuous shape. Deliberately a SEPARATE function rather than a flag on that one: every existing
 * caller of triggeringTargets is a creature-scoped effect (pump / bounce / counters) whose creature check is
 * load-bearing, and widening it in place would let those fire on a land.
 *
 * Still returns [] with no triggering permanent (a spell) or once the referent has left the battlefield —
 * a no-op, never a fabricated untap (CREED).
 */
export function triggeringPermanentTargets(state, ctx) {
  const id = ctx.triggeringPermanentId;
  const lk = id ? findPermanent(state, id) : null;
  return lk ? [{ type: "permanent", id, controller: lk.controller }] : [];
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

// P·39 — countMatches for a BATTLEFIELD permanent: its type line, or — for a creature-type subtype ("for each Elf you control",
// Magma Sliver's Slivers) — every creature type (a changeling, Mirror Entity's activation, an animated Mutavault;
// layers.permIsEveryCreatureType). A land / artifact subtype never matches by it (CR 205.3d).
function countMatchesPerm(state, perm, spec) {
  if (countMatches(perm.card, spec)) return true;
  return !!spec?.subtype && isCreatureTypeWord(spec.subtype) && permIsEveryCreatureType(state, perm.id);
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
// P·39 — a word the closed CR 205.3m creature-type list holds (every creature type answers for these only, CR 205.3d).
function isCreatureTypeWord(word) {
  return CR_CREATURE_TYPES.has(String(word || "").toLowerCase());
}
function chosenTypePermanentsCount(state, player) {
  const bf = player?.battlefield || [];
  // Tally per-subtype counts; a changeling is tracked separately and added to every candidate (and forms the
  // floor when it's the only creature-typed permanent — "creature type" still has to be chosen, CR 614.12).
  // P·39: "a changeling" is EVERY creature type read on the battlefield (layers.permIsEveryCreatureType — the keyword ability,
  // or Mirror Entity's activation / an animated Mutavault), never a bare /changeling/ match on the oracle, which also counted
  // a permanent that only MAKES changeling tokens (Belonging) or names one (Maskwood Nexus).
  const tally = new Map();
  let changelings = 0;
  for (const perm of bf) {
    const card = perm.card;
    if (permIsEveryCreatureType(state, perm.id)) { changelings += 1; continue; }
    for (const sub of permanentSubtypes(card)) tally.set(sub, (tally.get(sub) || 0) + 1);
  }
  if (tally.size === 0) return changelings; // only changelings (or nothing) → that count (0 if none)
  let best = 0;
  for (const n of tally.values()) best = Math.max(best, n + changelings);
  return best;
}
export function countForSpec(state, ctx, spec) {
  // OPPONENTS YOU ATTACKED THIS TURN (Fast Forward, 2026-09-05): the distinct OPPONENTS among the seat's stamped defenders
  // (actionDispatcher.applyDeclareAttacker writes `attackedPlayersThisTurn`; the untap reset clears it). A planeswalker
  // defender id is not a player and never counts; an eliminated player is no longer an opponent and never counts.
  if (spec.kind === "opponentsAttackedThisTurn") {
    const me = ctx?.controller;
    if (!me || !state?.players?.[me]) return 0;
    const opps = new Set(opponentsOf(state, me));
    return [...new Set(state.players[me].attackedPlayersThisTurn || [])].filter((id) => opps.has(id)).length;
  }
  if (spec.kind === "basicTypeLandsOfTargetOpponent") { // Carpet of Flowers (KT-10a): the TARGET opponent's lands of a basic land type
    const pt = (ctx?.targets || []).find((t) => t.type === "player" && state?.players?.[t.id]);
    if (!pt) return 0;
    const re = new RegExp(`\\b${String(spec.subtype || "")}\\b`);
    return (state.players[pt.id].battlefield || []).filter((perm) => /\bLand\b/.test(typeLineStr(perm.card)) && re.test(typeLineStr(perm.card))).length;
  }
  if (spec.kind === "cardsNamedInAllGraveyards") { // Rite of Flame (KT-3): every player's graveyard, by name
    const want = String(spec.name || "").toLowerCase();
    if (!want) return 0;
    let n = 0;
    for (const pid of Object.keys(state?.players || {})) for (const c of state.players[pid]?.graveyard || []) if (String(c?.name || "").toLowerCase() === want) n++;
    return n;
  }
  // ===== TAPPED-CREATURES-OF-TARGET-OPPONENT (BLITZ TD-1 — Theft of Dreams / Borrowing 100,000 Arrows:
  // "Draw a card for each tapped creature target opponent controls") ===== the count is read off the
  // CHOSEN player target's battlefield AT RESOLUTION (CR 608.2h): every permanent that IS a creature
  // right now (permanentIsCreature — layer-aware, an animated land counts) and is tapped. A vanished /
  // absent player target → 0 (a clean no-op, never a fabricated count).
  if (spec.kind === "tappedCreaturesOfTargetOpponent") {
    const pt = (ctx?.targets || []).find((t) => t.type === "player" && state?.players?.[t.id]);
    if (!pt) return 0;
    return (state.players[pt.id].battlefield || [])
      .filter((perm) => perm.tapped && permanentIsCreature(state, perm.id)).length;
  }
  // ===== CARDS IN TARGET OPPONENT'S HAND (K9 — Recurring Insight) ===== the chosen player target's LIVE hand
  // length at resolution (CR 608.2h). An absent / vanished player target → 0 (a clean no-op, never a fabricated count).
  if (spec.kind === "cardsInTargetOpponentHand") {
    const pt = (ctx?.targets || []).find((t) => t.type === "player" && state?.players?.[t.id]);
    if (!pt) return 0;
    return (state.players[pt.id].hand || []).length;
  }
  // ===== TRIGGERING-CREATURE POWER (Railway Brawler — "put X +1/+1 counters on it, where X is its
  // power") ===== the TRIGGERING permanent's LIVE layer-aware power, read at resolution (CR 608.2h — the
  // entering creature's power as the trigger resolves, BEFORE these counters land). An absent/vanished
  // referent or an unsizeable power → 0 (a clean no-op, never a fabricated count).
  if (spec.kind === "triggeringCreaturePower") {
    const lk = ctx?.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
    if (!lk) return 0;
    const pw = creaturePower(lk.permanent, state);
    return Number.isFinite(pw) ? Math.max(0, pw) : 0;
  }
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
      // P·22 — the tapped qualifier rides the opponents sum too (Mana Geyser "tapped land your opponents control").
      if (spec.kind === "permanentsYouControl") total += (opp.battlefield || []).filter((perm) => countMatches(perm.card, spec) && (!spec.tappedOnly || !!perm.tapped)).length;
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
        if (countMatchesPerm(state, perm, spec)) total += 1;
      }
    }
    return total;
  }
  // ===== RAD-AMONG-PLAYERS (Vault 12 chapter II — SHELF S7) ===== "the total number of rad counters among
  // players": every seat's radCounters summed live at resolution. An untallied seat → 0 (safe floor).
  if (spec.kind === "radAmongPlayers") {
    return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl?.radCounters || 0), 0);
  }
  // ===== DEATHS-THIS-TURN (CR 700.4), all-seats ===== "the number of creatures that died this turn" (Mahadi)
  // sums EVERY player's per-turn creature-death tally (creaturesDiedThisTurn, bumped at the death chokepoint),
  // because "a creature that died" is unscoped — any player's creature counts. The controller-scoped variant
  // ("…under your control") has no scope flag and falls to the player-lookup branch below. A seat with no tally
  // → 0 (safe). Read off the player tallies (not a board scan), so it's computed before the single-player lookup.
  if (spec.kind === "creaturesDiedThisTurn" && spec.scope === "all") {
    return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl.creaturesDiedThisTurn || 0), 0);
  }
  // SPELLS CAST THIS TURN (④-BC, 2026-09-04 — Aetherflux Reservoir "Whenever you cast a spell, you gain 1 life for each
  // spell you've cast this turn"): the controller's own per-turn cast tally (player.spellsCastThisTurn — incremented at
  // the cast chokepoint, so the triggering spell itself is already counted when its trigger resolves, CR 608.2h; reset
  // for every seat at untap). An absent tally → 0 (never a fabricated count).
  if (spec.kind === "spellsCastThisTurn") return Math.max(0, state?.players?.[ctx?.controller]?.spellsCastThisTurn || 0);
  // OPPONENT COUNT (Big Apple, 3 a.m. — "for each opponent you have"): the seat's live opponents, the same read every
  // "each opponent" effect makes (opponentsOf). An eliminated seat is not an opponent you have.
  if (spec.kind === "opponents") return opponentsOf(state, ctx?.controller).length;
  // INSTANT/SORCERY SPELLS CAST THIS TURN (K9 — Lock and Load "for each OTHER instant and sorcery spell you've cast this
  // turn"): the controller's own tally (player.instantSorcerySpellsCastThisTurn, stamped at the cast chokepoint, reset at
  // untap), less `minus` for the printed "other" — the resolving spell itself is already counted (CR 608.2h). Floored at 0.
  if (spec.kind === "instantSorcerySpellsCastThisTurn") return Math.max(0, (state?.players?.[ctx?.controller]?.instantSorcerySpellsCastThisTurn || 0) - (spec.minus || 0));
  // CARDS DRAWN THIS TURN (SHELF-85 V5, 2026-09-04 — Proft's Eidetic Memory): the controller's own per-turn draw tally
  // (player.cardsDrawnThisTurn — stamped at the one draw chokepoint, reset for every seat at untap), less the printed
  // "minus one", floored at 0 (never a negative or fabricated count).
  if (spec.kind === "cardsDrawnThisTurn") return Math.max(0, (state?.players?.[ctx?.controller]?.cardsDrawnThisTurn || 0) - (spec.minus || 0));
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
  // ===== EQUIPMENT-ATTACHED-TO-SOURCE (SHELF CAP2 — Captain America, Liberator) ===== the number of
  // Equipment permanents attached to the ability's OWN permanent (ctx.sourceId), read live at resolution
  // (CR 608.2h). Scans every seat's battlefield because an attached Equipment lives on its CONTROLLER's
  // battlefield, which need not be the host's (a stolen Equipment stays attached). Absent source → 0.
  if (spec.kind === "equipmentAttachedToSource") {
    const refId = ctx?.sourceId;
    if (!refId || !findPermanent(state, refId)) return 0;
    let total = 0;
    for (const pl of Object.values(state?.players || {})) {
      for (const perm of pl.battlefield || []) {
        if (perm.attachedTo === refId && /\bEquipment\b/i.test(String(perm.card?.type || perm.card?.type_line || ""))) total += 1;
      }
    }
    return total;
  }
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
    // SACRIFICED-SOURCE LOOK-BACK (④-AW, 2026-09-04 — CR 608.2h): a sourcePower read whose source was sacrificed AS THE
    // COST of this very ability answers from the dispatcher's pre-sacrifice stamp (sacrificedSelfLki, keyed by the
    // permanent's id — a stale stamp can never answer for another source). Only the GONE case falls back; a live source
    // still reads live. Any other absent referent stays 0 (never a fabricated count).
    if (!lk && spec.kind === "sourcePower" && refId && state?.sacrificedSelfLki?.permanentId === refId && typeof state.sacrificedSelfLki.power === "number") {
      return Math.max(0, state.sacrificedSelfLki.power);
    }
    // DIED-SOURCE LOOK-BACK (SHELF-85 H5 twin — Rampant Rejuvenator "When this creature dies, search for up to X basic
    // lands, where X is this creature's power", CR 608.2h / 603.10a): a self dies trigger reads the power the creature
    // HAD as it left — the dies context's dyingPower — never 0 for a creature that died to damage. Only when the
    // triggering permanent IS the source (a watcher of another creature's death keeps reading its own live power).
    if (!lk && spec.kind === "sourcePower" && refId && ctx?.triggeringPermanentId === refId && typeof ctx?.dyingPower === "number") {
      return Math.max(0, ctx.dyingPower);
    }
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
    // ALL-KINDS form (Warden of the Grove, W4 — "the number of counters on this creature", no type
    // qualifier): counterType absent → the whole bag summed, every kind (CR-literal). The typed form
    // below is byte-identical for every existing caller (they all stamp counterType).
    if (!spec.counterType) return Object.values(lk.permanent.counters || {}).reduce((n, v) => n + Math.max(0, v || 0), 0);
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
  // ===== SACRIFICED REFERENT (CR 608.2h + 603.6e LKI) ===== the magnitude of the permanent sacrificed to pay
  // this spell's ADDITIONAL COST — "damage equal to the sacrificed creature's power" (Fling), "discards a
  // number of cards equal to the sacrificed creature's power" (Tormented Thoughts), "draw cards equal to its
  // toughness", "search for a creature with mana value X or less" (Eldritch Evolution).
  //
  // The permanent is GONE by the time the effect resolves, so the value is captured at COST-PAYMENT time by
  // actionDispatcher (the only moment it is still on the battlefield) and read here off the same inter-atom
  // state channel revealedCardMV uses. An ABSENT stamp — a spell with no sacrifice cost, or the count-of-N
  // form which has no singular referent — reads 0: a clean no-op, never a fabricated magnitude (CR 107.3).
  // The copy frozen on the ability as its cost was paid (ctx.sacrificedForCost — shelf D12) wins over the shared state
  // channel, which a sacrifice-cost ability activated in response can overwrite before this one resolves.
  // SACRIFICED THIS WAY (P·36 — Disciple of Freyalise: "you may sacrifice another creature. If you do, you gain X life and draw X
  // cards, where X is that creature's power"): the last-known power of the creature the controller's OWN sacrifice just took, off its
  // sacrifice log (sacrificeCreatureEffect records it, CR 603.6e). Only an "if you do" payoff reads it, and runProgram runs that only
  // right after the sacrifice — so the newest such entry is this one. Distinct from the cost channel below.
  if (spec.kind === "sacrificedThisWayPower") {
    const sac = [...(state.log || [])].reverse().find((e) => e.effect === "sacrifice");
    return Math.max(0, sac?.power || 0);
  }
  const sacrificed = ctx?.sacrificedForCost ?? state?.sacrificedForCost;
  if (spec.kind === "sacrificedPower") return Math.max(0, sacrificed?.power || 0);
  if (spec.kind === "sacrificedToughness") return Math.max(0, sacrificed?.toughness || 0);
  if (spec.kind === "sacrificedManaValue") return Math.max(0, sacrificed?.manaValue || 0);
  // EXILED-FOR-COST MANA VALUE (K8 — Ellie and Alan "Discover X, where X is the mana value of the exiled card"): the
  // graveyard card exiled as this activation's cost, stamped by the dispatcher at payment; absent → 0.
  if (spec.kind === "exiledForCostManaValue") return Math.max(0, state?.exiledForCost?.manaValue || 0);
  // ⭐ CONVERGE (CR 702.117a) — "X is the number of COLORS of mana spent to cast this spell". Captured at
  // COST-PAYMENT time by actionDispatcher off the payment plan (the only moment the answer exists — the pool
  // is deducted immediately after) and read here off the SAME inter-atom state channel the sacrificed-*
  // kinds directly above use. An ABSENT stamp reads 0: a clean no-op, never a fabricated magnitude.
  if (spec.kind === "colorsSpentThisSpell") return Math.max(0, state?.colorsSpentForCast || 0);
  // ⭐ MULTIKICKER COUNT (CR 702.33c/d) — how many times the spell's kicker was paid. Offered since P·15 (legalChoices,
  // parseMultikickerCost). The count is bound to the OBJECT and handed to its reader in ctx.timesKicked: the entering
  // permanent's enters-with replacement (resolvers), a multikicker permanent's ETB self context (triggers — carried even
  // if it has left by resolution, CR 608.2h). Never a state-wide stamp: a spell cast in response would overwrite it.
  // A reader with no count of its own reads 0. (No multikicker SPELL is offered a kick yet; when one is, its count rides
  // the spell's own resolution context the same way.)
  if (spec.kind === "timesKicked") return Math.max(0, Number(ctx?.timesKicked) || 0);
  // ⭐ COUNTERS ON THE SOURCE (CR 603.6e) — "for each +1/+1 counter on it".
  // ⛔⛔ THE LOOK-BACK IS TRIED FIRST, AND THE ORDER IS THE WHOLE CORRECTNESS PROPERTY. On a dies / leaves
  // trigger the permanent is already gone, so the live board reads 0 — a silent under-count that looks like
  // a working card (Marketback Walker would draw nothing). checkDiesTriggers stamps
  // `triggeringPlusCounterCount` off the CR 603.10a death snapshot (it already does so for MODULAR), so that
  // value is authoritative whenever it exists. The live read below serves the ATTACKS / BLOCKS shape
  // (Embalmed Brawler), where the permanent is still on the battlefield and the board IS the right answer.
  // ⓘ `!= null` rather than truthy: a creature that died with ZERO counters must read 0 from the look-back,
  // not fall through to a live lookup that would find nothing anyway — but would be the wrong reason.
  // BOUND-TARGET +1/+1 count (Study the Classics, 2026-09-05): the bound slice's creature (ctx.targets — the previous
  // atom's target, threaded by runProgram's referent binding). No bound creature → 0 (a clean no-op, never fabricated).
  if (spec.kind === "plusCountersOnTarget") {
    const t = (ctx?.targets || []).find((x) => x?.type === "creature" || x?.type === "permanent");
    const lk = t ? findPermanent(state, t.id) : null;
    return Math.max(0, lk?.permanent?.counters?.["+1/+1"] || 0);
  }
  if (spec.kind === "plusCountersOnSource") {
    if (ctx?.triggeringPlusCounterCount != null) return Math.max(0, ctx.triggeringPlusCounterCount);
    const lk = ctx?.sourceId ? findPermanent(state, ctx.sourceId) : null;
    return Math.max(0, lk?.permanent?.counters?.["+1/+1"] || 0);
  }
  // NAMED-COUNTERS-ON-SOURCE (THE ONE RING, SG-17): the source's live bag of the named kind (burden, quest, …).
  if (spec.kind === "namedCountersOnSource") {
    const lk = ctx?.sourceId ? findPermanent(state, ctx.sourceId) : null;
    if (lk) return Math.max(0, lk.permanent?.counters?.[spec.counterType] || 0);
    // LKI (CR 603.10a / 608.2h) — the source is gone: a SELF dies/leaves trigger reads the death/leave look-back's
    // snapshot (the triggering object IS the source); an ability whose own cost sacrificed the source reads the
    // stamp the dispatcher wrote before the sacrifice. Anything else → 0 (never a fabricated count).
    const selfLookBack = ctx?.triggeringPermanentId && ctx.triggeringPermanentId === ctx?.sourceId;
    if (selfLookBack && ctx?.triggeringDiesCounters) return Math.max(0, ctx.triggeringDiesCounters[spec.counterType] || 0);
    if (selfLookBack && ctx?.triggeringLeaveCounters) return Math.max(0, ctx.triggeringLeaveCounters[spec.counterType] || 0);
    if (state?.sacrificedSelfLki?.permanentId && state.sacrificedSelfLki.permanentId === ctx?.sourceId) return Math.max(0, state.sacrificedSelfLki.counters?.[spec.counterType] || 0);
    return 0;
  }
  // ===== TOTAL-ATTACKING-POWER (Klauth, QUARTET Phase 4, 2026-08-15 — CR 508.3) ===== "X is the total
  // power of attacking creatures": the LAYER-AWARE power sum over the declared attackers (an anthem'd
  // board adds more — the same powerAtLeast discipline). Fired at declaration (checkAttackTriggers), so
  // every attacker is live; a since-removed id simply reads 0 through the findPermanent miss.
  // ATTACKING CREATURES (the 09-06 plan's stage ③ · 22, 2026-09-30 — the cast discounts of Ancient Stone Idol, Static Snare and
  // Embercleave): the creatures attacking right now — state.combat.attackers, each still on the battlefield and not removed
  // from combat (CR 506.4); `youControl` keeps the counting player's own. Outside combat the list is empty: the full cost.
  if (spec.kind === "attackingCreatures") {
    return (state.combat?.attackers || []).filter((a) => {
      const lk = findPermanent(state, a.permanentId);
      return lk && !lk.permanent.removedFromCombat && (!spec.youControl || lk.controller === ctx?.controller);
    }).length;
  }
  if (spec.kind === "totalAttackingPower") {
    return Math.max(0, (state.combat?.attackers || []).reduce((sum, a) => {
      const lk = findPermanent(state, a.permanentId);
      return sum + (lk ? Math.max(0, creaturePower(lk.permanent, state) || 0) : 0);
    }, 0));
  }
  // ===== TOTAL-MV-PERMANENTS-YOU-CONTROL (Summon: Bahamut's Mega Flare, 2026-08-14 — CR 202.3) =====
  // "damage equal to the total mana value of OTHER permanents you control": the SUM of the controller's
  // battlefield permanents' printed mana values (Scryfall cmc; a token/land with no cost reads 0 — CR
  // 202.3a, correct not conservative). excludeSource drops the Saga itself ("other").
  if (spec.kind === "totalMvPermanentsYouControl") {
    return Math.max(0, (state.players?.[ctx?.controller]?.battlefield || [])
      .filter((p) => !(spec.excludeSource && p.id === ctx?.sourceId))
      .reduce((s, p) => s + Math.max(0, p.card?.cmc || 0), 0));
  }
  // ===== MAX-DISCARDED-THIS-WAY (Windfall) ===== the GREATEST number of cards any player discarded during the
  // whole-hand discard the SAME spell just resolved (CR 608.2c "this way"). The discard atom (applyDiscard, on
  // the recordMaxDiscarded form) stamps state.maxDiscardedThisWay IMMEDIATELY before this draw atom resolves,
  // mirroring roll-d20 / reveal-top-to-hand. The parser emits the discard + draw atoms TOGETHER in fixed order
  // (matchWindfallMaxDiscard), so the value is always freshly written before this read (never stale). An ABSENT
  // stamp (a spell / no discard ran) → 0 (a clean no-op, CR 107.3 — never a fabricated count). Read off STATE
  // (the inter-atom channel), not a player/board tally, so it's computed BEFORE the player lookup below.
  if (spec.kind === "maxDiscardedThisWay") return Math.max(0, state?.maxDiscardedThisWay || 0);
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
  // ===== LIFE TOTAL (SHELF CAP8 — Aettir and Priwen's "base power and toughness X/X, where X is your
  // life total") ===== the resolved player's live life, read at every derive (CR 613.7 — the base P/T
  // tracks life both directions). Unclamped on purpose: CR 107.2 lets a calculated value be negative,
  // and a negative base power is legal (the game is over before it matters anyway).
  if (spec.kind === "lifeTotal") return player.life ?? 0;
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
  // DOMAIN (2026-09-06 — Stratadon's self cost reduction): the number of DISTINCT basic land types among the controller's
  // lands, off the front-face type line (CR 712.4a). Granted basic types are not counted — a documented under-read.
  if (spec.kind === "domain") return domainCount(state, ctx?.controller);
  // PARTY (2026-09-30 — the Zendikar Rising cycle's "for each creature in your party"): CR 700.8's up-to-one-each Cleric /
  // Rogue / Warrior / Wizard, maximised per 700.8b — the SAME helper layers.js's twin calls.
  if (spec.kind === "party") return partyCount(state, ctx?.controller);
  if (spec.kind === "permanentsYouControl") {
    // POWER-QUALIFIED ("creatures you control with power N or greater" — The Boulder): a power threshold is
    // LAYER-AWARE (counters + anthems count), so it's applied here against creaturePower read at resolution
    // (CR 608.2h), not in the type-line-only countMatches. Absent → no threshold (the plain count is unchanged).
    return (player.battlefield || []).filter((perm) =>
      countMatchesPerm(state, perm, spec)
      && !isExcludedSelf(perm, spec, ctx)
      && (spec.powerAtLeast == null || creaturePower(perm, state) >= spec.powerAtLeast)
      // COUNTER-QUALIFIED ("…with a +1/+1 counter on it"): count only creatures currently carrying ≥1 +1/+1
      // counter, read at resolution off the live counter bag (CR 608.2h). Absent → no filter (plain count).
      && (spec.requiresCounter == null || (perm.counters?.[spec.requiresCounter] || 0) > 0)
      // TAPPED-QUALIFIED (2026-08-14 — Throne of the God-Pharaoh "tapped creatures you control"): the
      // live tapped state at resolution. Absent → no filter (plain count, byte-identical).
      && (!spec.tappedOnly || !!perm.tapped)
      // ATTACHED-TO-TYPE (Sage's Reverie SH4 — "aura you control that's attached to a CREATURE"): the aura's
      // host must be a permanent of the named type. Read live off attachedTo (an aura on a land/artifact, or
      // a detached one, is excluded — CR 303.4). Absent → no filter (plain count, byte-identical).
      && (spec.attachedToType == null
          || (!!perm.attachedTo && new RegExp(`\\b${spec.attachedToType}\\b`, "i").test(
                String(findPermanent(state, perm.attachedTo)?.permanent?.card?.type
                    || findPermanent(state, perm.attachedTo)?.permanent?.card?.type_line || "")))),
    ).length;
  }
  // ===== CHOSEN-TYPE (Distant Melody) ===== "permanent you control of that type" where the type was chosen
  // at resolution (CR 614.12). The self-play engine maximizes the draw — the count is the greatest, over every
  // creature subtype present, of the controller's permanents of that subtype (changelings count for all). See
  // chosenTypePermanentsCount. Deterministic + optimal, so never an over/under-count.
  if (spec.kind === "chosenTypePermanents") return chosenTypePermanentsCount(state, player);
  // ===== THE SOURCE'S OWN CHOSEN TYPE (play-weighted P·7 — Three Tree City: "… equal to the number of creatures you control of
  // the chosen type") ===== the type THIS permanent chose as it entered (CR 614.12 — stamped `chosenType`, read off ctx.source),
  // not a best type picked now: the controller's creatures of that type, a changeling creature counting for every type
  // (CR 702.73a). No stamp → 0, never a guessed type.
  if (spec.kind === "creaturesOfSourceChosenType") {
    const type = ctx?.source?.chosenType;
    if (!type) return 0;
    return (player.battlefield || []).filter((p) => (permIsEveryCreatureType(state, p.id) ? permanentIsCreature(state, p.id) : permanentSubtypes(p.card).includes(type))).length; // P·39 — every creature type, read on the battlefield
  }
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
  // ===== MANA-VARIABLE ===== the SOURCE's own live power — "{T}: Add X mana of any one color, where X is
  // <this creature>'s power" (Helga Skittish Seer, Redshift Rocketeer Chief, Heronblade Elite, Kami of
  // Whispered Hopes, Doc Samson, Mona Lisa). Distinct from greatestPowerYouControl above: that one is a MAX
  // across the board, this one is the source itself, so a bigger creature elsewhere must not inflate it.
  //
  // Layer-aware via creaturePower — counters and pumps count, which is the whole point on cards whose plan is
  // to grow the source first. A source that has left the battlefield reads 0 rather than throwing: a mana
  // ability whose source is gone produces nothing (never a fabricated amount, CREED). Negative power floors
  // at 0 through the caller's Math.max, same as every other metric here.
  if (spec.kind === "selfPower") {
    // Same source resolution as isExcludedSelf — the mana path passes { source: perm }, other callers
    // pass sourceId; reading only one of the two would silently return 0 for half the callers.
    const sourceId = ctx?.sourceId ?? ctx?.source?.id ?? null;
    const lk = sourceId == null ? null : findPermanent(state, sourceId);
    return lk ? Math.max(0, creaturePower(lk.permanent, state)) : 0;
  }
  // ===== MANA-VARIABLE ===== the SOURCE's own +1/+1 counters — "{T}: Add {G} for each +1/+1 counter on
  // this creature" (Gyre Sage). The counter twin of selfPower directly above, and resolved the same way:
  // the source is read from ctx.sourceId ?? ctx.source?.id (the mana path threads the latter), a source
  // that has left the battlefield reads 0 rather than throwing, and the caller's Math.max floors it.
  //
  // Reads the LIVE counter map, not a printed value, so evolve/adapt/proliferate growth counts — which is
  // the entire plan on every card in this shape. Counters are stored under their printed key ("+1/+1"),
  // the same key addCounter/removeCounter use, so there is one spelling on both sides.
  if (spec.kind === "selfCounters") {
    const sourceId = ctx?.sourceId ?? ctx?.source?.id ?? null;
    const lk = sourceId == null ? null : findPermanent(state, sourceId);
    return lk ? Math.max(0, lk.permanent.counters?.[spec.counter || "+1/+1"] || 0) : 0;
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
    .filter((perm) => !negRe || !(negRe.test(typeLineStr(perm.card).split(" // ")[0])
      || permIsEveryCreatureType(state, perm.id))) // P·39 — every creature type IS a Human
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
export const resolveScaledAmount = (state, atom, ctx) => {
  // METALCRAFT-STYLE AMOUNT UPGRADE (Galvanic Blast, SHELF S7 — CR 614: "deals 4 damage instead if you
  // control three or more artifacts"): a deterministic board read at resolution replaces the printed amount
  // when the threshold holds. Narrow by construction — only the artifactsYouControl kind exists; the parser
  // emits it only from the exact two-sentence collapse, so no other amount path changes.
  if (atom.amountUpgrade?.kind === "artifactsYouControl") {
    const n = (state.players?.[ctx.controller]?.battlefield || [])
      .filter((p) => /\bArtifact\b/i.test(String(p.card?.type || p.card?.type_line || ""))).length;
    if (n >= (atom.amountUpgrade.atLeast ?? Infinity)) return atom.amountUpgrade.amount;
  }
  // CONDITION-GATED AMOUNT UPGRADE (BLITZ INST-1, CR 608.2 + 614 "instead") — the generalized ability-word
  // amount swap (Brimstone Volley "deals 5 instead if a creature died this turn"; Feed the Clan's Ferocious
  // life; Hunger of the Howlpack's Morbid counter): the board condition is read at RESOLUTION via the SHARED
  // intervening-if evaluator, and when it holds the printed base amount is replaced by the upgraded amount.
  // The parser attaches `condition` ONLY for a curated, spell-readable board query (the metric⇄runtime shared
  // gate), so a real game state yields a definite true/false here; a false/null read (condition unmet, or
  // can't confirm) falls through to the base amount below — the false-negative-safe direction (CREED — a
  // wrongly-true condition applying the bigger amount would be a forbidden FP, which the curated gate prevents).
  if (atom.amountUpgrade?.condition
      && evaluateInterveningIf(state, atom.amountUpgrade.condition, ctx.controller, ctx) === true) {
    return atom.amountUpgrade.amount;
  }
  return atom.countContext ? halveAmount(ctx[atom.countContext] || 0, atom.halve)
    : atom.amountCount ? halveAmount(countForSpec(state, ctx, atom.amountCount) * (atom.amountCount.per ?? 1) + (atom.amountCount.plus ?? 0), atom.halve) // + plus (Sea Gate Restoration, BI-3)
      : effectiveAmount(atom, ctx);
};
