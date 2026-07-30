/**
 * creatureRestrictions.js — the ONE creature-restriction satisfier, extracted 2026-07-30.
 *
 * ⭐ WHY IT MOVED. Two subsystems filter creature SETS and they had drifted apart. The damage side carried a
 * 16-kind `restrictions` array (controller, tapped, power, toughness, manaValue, combat, colour, colorNeg,
 * cardType, typeNeg, subtype ±negate, hasKeyword, enteredThisTurn, notSource, powerVsSource, multicolored)
 * evaluated by THIS function; the mass destroy / exile / bounce side hand-rolled a parallel, much narrower
 * one on bespoke atom fields (`subtypeFilter`/`subtypeNegate`, `powerCmp`, `mvCmp`, `landSubtype`) inside
 * `effects/atoms/shared.massCreatureTargets`. The same printed filter was therefore sayable to one verb and
 * not its neighbour — the axis pattern, one layer up from a vocabulary.
 *
 * It could not simply be imported: `effects/atoms/shared.js` is a STRICT LEAF and spellEffects.js is not one.
 * So the satisfier moved to its own leaf, which both sides import.
 *
 * LEAF, and deliberately so — it imports only gameState (layer-aware P/T + permanent lookup), layers
 * (layer-aware colours + keywords) and keywords. None of those reach spellEffects.js or atoms/shared.js, so
 * this adds no cycle in either direction. Every one of these edges already existed in atoms/shared.js.
 *
 * The body below is a VERBATIM MOVE — copied, never retyped — so this refactor cannot change behaviour. The
 * flip-diff for the slice that moved it must show 0 changes from the move alone; any gain belongs to the
 * delegation that follows it.
 */
import { creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { permanentColors, permanentHasKeyword } from "./layers.js";

export /** Does a creature permanent (controlled by `pid`) satisfy a restriction set, from `casterId`'s view? */
function creatureSatisfiesRestrictions(state, perm, pid, casterId, restrictions, ctx = null) {
  for (const r of restrictions) {
    if (r.kind === "enteredThisTurn") {
      // ENTERED-THIS-TURN (Cathedral Acolyte's activated — "target creature that entered this turn"):
      // the perm's enteredOnTurn stamp (written by every enter path) must equal the CURRENT turn. An
      // unstamped permanent (a pre-stamp fixture) never qualifies — FN-safe, never a wrongly-legal target.
      if ((perm.enteredOnTurn ?? -1) !== state.turn) return false;
    } else if (r.kind === "notSource") {
      // "ANOTHER" (CR 109.5) — "untap another target permanent" (Formidable Speaker) may not target the
      // source permanent itself. ctx.sourceId is threaded from the activated ability's expandCastChoices; a
      // permanent whose id equals the source is excluded. FAIL-CLOSED when the source is unknown (no
      // ctx.sourceId): no permanent qualifies → the pool is empty and the ability drops no-target (SAFE, CREED
      // — never targets the wrong permanent). A source that has already left play (id no longer on any
      // battlefield) simply never matches, which is harmless.
      if (!ctx?.sourceId || perm.id === ctx.sourceId) return false;
    } else if (r.kind === "controller") {
      if (r.who === "you" && pid !== casterId) return false;
      if (r.who === "opponent" && pid === casterId) return false;
      // DEFENDING-PLAYER scope (CR 509.1a) — only the SPECIFIC attacked player's permanents are legal
      // (ctx.defenderId, threaded from an attacks trigger's context). Absent defenderId (a spell / a non-
      // attack path) → no permanent qualifies → the pool is empty and the ability drops no-target (SAFE, CREED
      // — never a mis-scoped destroy). A non-defending opponent's permanent is excluded, so in multiplayer the
      // pool is exactly the defending player's, never "any opponent's".
      if (r.who === "defendingPlayer" && (!ctx?.defenderId || pid !== ctx.defenderId)) return false;
      // DAMAGED-PLAYER scope (CR 510.2 — the just-combat-damaged player) — only the SPECIFIC player this
      // creature dealt combat damage to is legal (ctx.damagedPlayerId, threaded from the combat-damage
      // trigger's context by triggers.checkCombatDamageTriggers). Absent damagedPlayerId (a spell / a
      // non-combat path) → no permanent qualifies → empty pool → the ability drops no-target (SAFE, CREED —
      // never a mis-scoped destroy). A non-damaged opponent's permanent is excluded, so in multiplayer the
      // pool is exactly the damaged player's, never "any opponent's" — the exact mirror of defendingPlayer.
      if (r.who === "damagedPlayer" && (!ctx?.damagedPlayerId || pid !== ctx.damagedPlayerId)) return false;
    } else if (r.kind === "tapped") {
      if (!!perm.tapped !== r.value) return false;
    } else if (r.kind === "power") {
      const pw = creaturePower(perm, state);
      if (r.op === "<=" && !(pw <= r.value)) return false;
      if (r.op === ">=" && !(pw >= r.value)) return false;
    } else if (r.kind === "powerVsSource") {
      // MENTOR (BLITZ MN-1, CR 702.134a) — "target attacking creature with lesser power": the target's power
      // must be STRICTLY below the SOURCE's (op "<"; CR 702.134a — equal power is NOT lesser). Both reads are
      // LAYER-AWARE (creaturePower folds counters/anthems/pumps), evaluated at the choice (flush enumeration) —
      // the ONLY CR-honest moment for a dynamic comparison. The source is ctx.sourceId (the mentor), threaded
      // by buildTriggerStack from the attacks trigger. FAIL-CLOSED when the source is unresolvable (no
      // ctx.sourceId, or it already left play): no creature qualifies → the pool empties and the trigger drops
      // no-target (SAFE, CREED — never a wrongly-legal equal/greater-power target). The op "<" naturally
      // excludes the source itself (its power is never < its own), so a mentor attacking alone finds no target.
      if (!ctx?.sourceId) return false;
      const srcLk = findPermanent(state, ctx.sourceId);
      if (!srcLk) return false;
      const srcPw = creaturePower(srcLk.permanent, state);
      if (r.op === "<" && !(creaturePower(perm, state) < srcPw)) return false;
    } else if (r.kind === "combat") {
      const atk = (state.combat?.attackers || []).some((a) => a.permanentId === perm.id);
      const blk = (state.combat?.blockers || []).some((b) => b.blockerId === perm.id);
      if (r.value === "attacking" && !atk) return false;
      if (r.value === "blocking" && !blk) return false;
      if (r.value === "either" && !(atk || blk)) return false;
    } else if (r.kind === "colorNeg") {
      // FRONT-face colors (CR 712.4a): a DFC's top-level `colors` is unreliable in the slim index — often
      // [] even for a colored front face (Graveyard Trespasser is black but enriches top-level []), so read
      // card_faces[0].colors for a DFC and top-level for a single-face card. FAIL-CLOSED when the colors are
      // unresolvable (no face data / an absent field): never risk offering a wrong-color creature to
      // non<color> removal — an illegal target is the cardinal sin, a dropped legal target is safe.
      const card = perm.card || {};
      const isDfc = / \/\/ /.test(String(card.type || card.type_line || ""));
      const colors = isDfc ? card.card_faces?.[0]?.colors : card.colors;
      if (!Array.isArray(colors)) return false;
      if (colors.includes(r.color)) return false; // a non<color> target can't be that color
    } else if (r.kind === "color" || r.kind === "multicolored") {
      // COLOR-POS (CR 105.2) — read LAYER-AWARE (permanentColors → derived characteristics after layer 5),
      // NOT the printed card. A permanent turned blue by an effect IS a legal "target blue permanent", and a
      // printed-blue permanent turned white is NOT. Reading the printed colors here (as colorNeg still does)
      // would offer that white permanent to Red Elemental Blast — an illegal target, the forbidden direction.
      // FAIL-CLOSED when the colors are unresolvable: a dropped legal target is safe, a wrong one never is.
      const eff = permanentColors(state, perm.id);
      const set = eff instanceof Set ? eff : new Set(Array.isArray(eff) ? eff : []);
      if (r.kind === "color" && !set.has(r.color)) return false;
      if (r.kind === "multicolored" && set.size < 2) return false;  // CR 105.3 — two or more colors
    } else if (r.kind === "typeNeg") {
      // FRONT-face type only (CR 712.4a) — a DFC's combined "Front // Back" line would wrongly match a
      // back-face type (mirrors the front-face discipline used for counter/tutor/graveyard targets here).
      const tl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0].toLowerCase();
      if (tl.includes(r.type)) return false;       // a non<type> target can't be that card type
    } else if (r.kind === "cardType") {
      // CARD-TYPE TARGET (CR 205.2) — the positive mirror of typeNeg: "target artifact creature" (Modular's
      // dies payoff, BLITZ MOD-1) requires the target creature's type line to ALSO carry the named card type.
      // Front-face only (CR 712.4a) so a DFC back-face type can't wrongly qualify; fail-closed on a missing
      // type line (a creature with no readable type → not that type → SAFE false-negative, never a wrong pick).
      const tl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0].toLowerCase();
      if (!tl.includes(r.type)) return false;      // a non-<type> creature can't be a "<type> creature" target
    } else if (r.kind === "toughness") {
      // TAP-TARGET-CREATURE: "with toughness N or less" (Errant Doomsayers). Mirrors the power branch.
      const th = creatureToughness(perm, state);
      if (r.op === "<=" && !(th <= r.value)) return false;
      if (r.op === ">=" && !(th >= r.value)) return false;
    } else if (r.kind === "powerOrToughness") {
      // DISJUNCTIVE P/T BOUND (Warping Wail) — EITHER characteristic satisfying the bound is enough, so a
      // 3/1 is a legal target for "power or toughness 1 or less". Both reads are LAYER-AWARE (CR 613.3),
      // matching the single-characteristic branches above, so counters and anthems count.
      const p = creaturePower(perm, state);
      const th = creatureToughness(perm, state);
      const ok = r.op === "<=" ? (p <= r.value || th <= r.value) : (p >= r.value || th >= r.value);
      if (!ok) return false;
    } else if (r.kind === "manaValue") {
      // TAP-TARGET-CREATURE: "with mana value N or greater" (Law-Rune Enforcer). Uses the slim-index
      // cmc field (mana value as a number); defaults to 0 when absent (safe false-negative for lands/tokens).
      const mv = perm.card?.cmc ?? 0;
      // MV-CAP-BY-X (Here Comes a New Hero! — "with mana value X or less"): `valueX` resolves the cap from the
      // chosen X (ctx.xValue, bound at cast per CR 202.3b). `?? 0` (not `|| 0`) so an explicit X=0 caps at MV 0
      // (a legal, conservative choice — target only 0-drops), and a missing xValue is treated as 0, NEVER as
      // "uncapped" — the CREED guarantee that the X-bound cap is never silently dropped into an illegal target.
      // A cast-time enumeration threads ctx={xValue:x} per affordable X (legalChoices X-spell branch), so this
      // fires with the concrete X for each candidate cast.
      const cap = r.valueX ? Math.max(0, ctx?.xValue ?? 0) : r.value;
      if (r.op === "<=" && !(mv <= cap)) return false;
      if (r.op === ">=" && !(mv >= cap)) return false;
    } else if (r.kind === "hasKeyword") {
      // TAP-TARGET-CREATURE: "without flying" (Dromoka Dunecaster, Cephalid Retainer, Flood) or
      // "with flying" (Storm Front). Layer-aware read via permanentHasKeyword so granted/removed
      // flying (e.g. via an Aura) is honored. Fail-closed: if the keyword state is unresolvable,
      // treating the creature as NOT having the keyword is a safe false-negative.
      const hasKw = permanentHasKeyword(state, perm.id, r.keyword);
      if (r.negate && hasKw) return false;  // "without flying" → must NOT have flying
      if (!r.negate && !hasKw) return false; // "with flying" → must have flying
    } else if (r.kind === "subtype") {
      // SUBTYPE-TARGET (CR 205.3) — "target <Subtype>" (e.g. "Regenerate target Sliver", Crypt Sliver's
      // group-granted ability). A creature subtype is a proper noun appearing verbatim ONLY in the subtype
      // portion of a type line ("Creature — Sliver"), so a word-bounded, case-insensitive containment test
      // matches exactly the subtyped creatures. The matcher (combatKeywordClauseParser) only emits a CURATED
      // creature-subtype word, so this never mis-matches a color/card-type word. Front-face only (CR 712.4a):
      // a DFC's combined "Front // Back" line would wrongly match a back-face subtype.
      const tl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0];
      // `negate` flips it to "every creature that is NOT that subtype" (Breath Weapon's "each non-Dragon
      // creature"), mirroring massCreatureTargets' subtypeNegate so the same printed filter means the same
      // set on the damage side as on the destroy side.
      const hasSub = new RegExp(`\\b${r.subtype}\\b`, "i").test(tl);
      if (r.negate ? hasSub : !hasSub) return false;
    } else if (r.kind === "supertype") {
      // SUPERTYPE-TARGET (CR 205.4) — "target legendary creature you control" (Mithril Coat / Mjölnir ETB
      // auto-attach; "Equip legendary" also gates on legendary, checked inline in legalChoices). A supertype
      // (legendary / basic / snow / world) appears verbatim in the type line, so a word-bounded case-insensitive
      // front-face test matches exactly the creatures carrying it. Front-face only (CR 712.4a) so a DFC's
      // back-face supertype can't wrongly qualify. Fail-closed on a missing type line (safe false-negative).
      const stl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0];
      if (!new RegExp(`\\b${r.value}\\b`, "i").test(stl)) return false;
    }
  }
  return true;
}
