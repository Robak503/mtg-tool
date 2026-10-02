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
import { permanentColors, permanentHasKeyword, isModifiedPermanent, permIsEveryCreatureType } from "./layers.js";

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
    } else if (r.kind === "owner") {
      // OWNER scope (SHELF CAP15, CR 108.3 — Sword of Hearth and Home: "exile up to one target creature
      // YOU OWN"). Distinct from `controller` on purpose, and the difference is the entire reason the card
      // is templated this way: a creature of yours an opponent has STOLEN is still one you own, and the
      // Sword is how you get it back. Reading this as controller-scoped would refuse exactly the target
      // the card exists to hit.
      //
      // Effective owner = `perm.owner ?? perm.controller`. `owner` is stamped only when a permanent's
      // ownership diverges from its controller (BLITZ SB-2's owner-routing); for a normally-cast permanent
      // it is absent and the controller IS the owner, so this is byte-identical to the controller check on
      // every ordinary board.
      //
      // ⛔ ONLY THE "you" ARM EXISTS, deliberately. An `opponent` twin would be one more line and is NOT
      // shipped: no card emits it today (its mutation survived, because nothing can reach it), and this
      // file's own discipline is that unreachable surface in a predicate that can only LOOSEN is how a
      // gate grows past what anyone has checked. Five corpus cards do print an "an opponent owns" /
      // "you don't own" subject — Brainstealer Dragon, Nihiloor, Bronze Tablet, Weave the Nightmare,
      // Anafenza — so the arm becomes a one-liner the day a slice actually models one of them.
      const ownerId = perm.owner ?? pid;
      if (r.who === "you" && ownerId !== casterId) return false;
    } else if (r.kind === "tapped") {
      if (!!perm.tapped !== r.value) return false;
    } else if (r.kind === "hasCounter") {
      // COUNTER-BEARING (④-AC — "target creature with a +1/+1 counter on it", "… with a counter on it"): a
      // physical fact read straight off perm.counters (CR 122.1 — counters are markers on the object; no
      // layer touches them). counterType null = any counter at all (Razorfin Abolisher, Hidden Hideout);
      // a named type must be that key with a positive count. An absent or empty map is simply "no".
      const counters = perm.counters || {};
      const has = r.counterType ? (counters[r.counterType] || 0) > 0 : Object.values(counters).some((n) => (n || 0) > 0);
      // H9 (Damning Verdict "with no counters on them"): the negated form — a creature WITH a counter is excluded.
      if (r.negate ? has : !has) return false;
    } else if (r.kind === "enchanted") {
      // ENCHANTED (CR 303.4 — SHELF-85 · Light-Paws L5 Winds of Rath "destroy all creatures that aren't enchanted",
      // 2026-09-05): a creature with an Aura attached, WHOEVER controls the Aura — narrower than MODIFIED (which also
      // takes a counter or Equipment, and wants the controller's own Aura). Read live off the attachments.
      let enchanted = false;
      for (const pid of Object.keys(state?.players || {})) {
        for (const p of state.players[pid]?.battlefield || []) {
          if (p.attachedTo === perm.id && /\baura\b/i.test(String(p.card?.type || p.card?.type_line || ""))) { enchanted = true; break; }
        }
        if (enchanted) break;
      }
      if (r.negate ? enchanted : !enchanted) return false;
    } else if (r.kind === "modified") {
      // MODIFIED (CR 701.48 — Lion Umbra's "Enchant modified creature"): has a counter / Equipment / an Aura
      // its controller controls. Layer-aware via layers.isModifiedPermanent (the same predicate Kodama's
      // "modified creatures you control" anthem reads), re-evaluated live.
      if (isModifiedPermanent(state, perm) !== r.value) return false;
    } else if (r.kind === "dealtDamageThisTurn") {
      // DD-1 — TWO witnesses, because neither is complete alone and the gap in each is the other's
      // strength. `damageMarked` is the scalar total and misses infect/wither entirely (that damage becomes
      // -1/-1 counters and never marks), while `damagedBy` is OPTIONAL and stays empty whenever a call site
      // could not name its source. Either one being non-empty PROVES damage was dealt this turn; requiring
      // both would refuse legal targets, and this is the one direction the creed calls safe but the
      // colorDisjunction slice already showed can silently reduce a card to hitting nothing.
      // Both are cleared together at cleanup (clearCombatDamage, CR 514.2 — "this turn" ends there).
      const dealt = (perm.damageMarked || 0) > 0 || (perm.damagedBy || []).length > 0;
      if (dealt !== r.value) return false;
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
      // ⛔ FAIL-CLOSED ON AN UNRECOGNISED VALUE (BS-1, 2026-08-06). The three checks below are each guarded
      // by their own value, so a value outside the set matched NONE of them and fell straight through as
      // SATISFIED — an unknown combat qualifier silently offered the ENTIRE board. Found by a mutation, not
      // by reading: swapping the bounce parser's qualifier arms emitted {kind:"combat", value:"tapped"},
      // and the expectation was a pool of nothing. It would have been a pool of everything.
      // This mirrors the fail-closed default already guarding unknown restriction KINDS; the same hole
      // existed one level down, for an unknown VALUE inside a known kind.
      if (r.value !== "attacking" && r.value !== "blocking" && r.value !== "either") return false;
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
    } else if (r.kind === "colorAny") {
      // ⭐⭐ COLOUR DISJUNCTION (CD-1, CR 105.2) — "target green or white creature" (Deathmark, Slithery
      // Stalker), "target black or red permanent" (Celestial Purge, Lightwielder Paladin). Every other
      // restriction in this function NARROWS a pool; this is the first one that describes a UNION, and
      // that makes its bug direction the forbidden one. A too-loose disjunction offers an ILLEGAL target
      // and — unlike a too-tight one — never shows up as a missing option, so it is invisible in play.
      // ⛔ WHY IT COULD NOT RIDE THE EXISTING KIND: this list is ANDed. Pushing {color:G} and {color:W}
      // would demand a creature be BOTH green AND white, so every mono-coloured legal target vanishes and
      // the card reads as working while hitting almost nothing. That is why the parsers parked instead.
      // Layer-aware and fail-closed, exactly like the `color` branch below (a creature turned green IS a
      // legal Deathmark target; a printed-green one turned blue is NOT).
      const eff = permanentColors(state, perm.id);
      const set = eff instanceof Set ? eff : new Set(Array.isArray(eff) ? eff : []);
      const colors = Array.isArray(r.colors) ? r.colors : [];
      // An EMPTY colour list would match nothing rather than everything — fail-closed, never fail-open.
      if (!colors.some((c) => set.has(c))) return false;
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
    } else if (r.kind === "token") {
      // TOKEN-NESS (SHELF-85 · O10 Hour of Reckoning "destroy all nontoken creatures", 2026-09-05): `perm.card.token`
      // is the flag every token-creating path stamps (the sacrifice pools read the same field). negate:true keeps
      // the NONTOKEN creatures; a bare kind:"token" keeps the tokens. (interveningIf still owns its OWN `token`
      // condition shape — that one never reaches this function; the audit note below is amended accordingly.)
      if (!!perm.card?.token === !!r.negate) return false;
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
      // `subtypes` (a UNION — "target Wolf or Werewolf", "target Halfling or Treefolk"; SHELF-85 Phase 3, 2026-09-05) is
      // satisfied by ANY listed word; the single `subtype` form is unchanged.
      const subs = Array.isArray(r.subtypes) && r.subtypes.length ? r.subtypes : [r.subtype];
      // P·39 — every creature type (a changeling; Mirror Entity's activation; an animated Mutavault — layers.permIsEveryCreatureType)
      // carries any listed CREATURE type (CR 205.3d): "target Goblin" may take it, "each non-Dragon creature" must spare it.
      const hasSub = subs.some((sub) => new RegExp(`\\b${sub}\\b`, "i").test(tl))
        || permIsEveryCreatureType(state, perm.id);
      if (r.negate ? hasSub : !hasSub) return false;
    } else if (r.kind === "supertype") {
      // SUPERTYPE-TARGET (CR 205.4) — "target legendary creature you control" (Mithril Coat / Mjölnir ETB
      // auto-attach; "Equip legendary" also gates on legendary, checked inline in legalChoices). A supertype
      // (legendary / basic / snow / world) appears verbatim in the type line, so a word-bounded case-insensitive
      // front-face test matches exactly the creatures carrying it. Front-face only (CR 712.4a) so a DFC's
      // back-face supertype can't wrongly qualify. Fail-closed on a missing type line (safe false-negative).
      // `negate` is "target NONLEGENDARY creature you control" (Kiki-Jiki — shelf D26): every creature WITHOUT it.
      const stl = String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0];
      const has = new RegExp(`\\b${r.value}\\b`, "i").test(stl);
      if (r.negate ? has : !has) return false;
    } else {
      // ⛔⛔ FAIL CLOSED ON AN UNKNOWN KIND (CD-1 hardening, 2026-08-05). This chain used to end without an
      // else, so a restriction whose kind had no branch was SILENTLY SATISFIED — the pool opened and the
      // spell offered targets its printed text forbids. Measured, not theorised: removing the `colorAny`
      // branch during mutation testing made "target green or white creature" enumerate ALL SIX creatures on
      // the probe board, colourless included. A typo in an emitter, or a new kind wired on the emitting side
      // before this one, lands exactly there — and it is invisible, because a too-large legal-target set
      // never looks like a bug in play.
      //
      // ⭐ AUDITED BEFORE FLIPPING, so this is a guard rather than a behaviour change: every `kind` emitted
      // into a restriction array anywhere in learn/ was compared against the branches above. Only `keyword`
      // and `token` came back unhandled, and NEITHER reached this function — combatEvasion evaluates its own
      // `keyword` arms (canBlockAttacker) and interveningIf owns its own `token` condition. The corpus flip-diff
      // confirmed it: 0 gained, 0 lost, 0 retiered. (2026-09-05: a restriction kind:"token" now has a branch
      // above — the nontoken wipe emits it; interveningIf's shape is unrelated and still never comes here.)
      //
      // Refusing is the CREED-correct direction: an unrecognised restriction becomes a dropped legal target
      // (safe, and visible as a missing option) instead of an illegal one that plays fine and is wrong.
      return false;
    }
  }
  return true;
}
