/**
 * effects/templateMatchers.js — the collapsed-template whole-oracle matchers.
 *
 * Extracted verbatim from parser.js (slice 6 of the parser.js decomposition,
 * 2026-07-18). Same genus as spanMatchers.js but a different dispatch stage: each
 * matcher recognizes ONE corpus template whose sentences would shatter under
 * splitClauses (anaphoric "It fights …", drain-by-count compounds, reveal-top
 * conditionals, upkeep-cost shapes …) and collapses the WHOLE oracle to its atoms
 * up front. Pure `oracle → {atoms|atom,…} | null` recognizers — THE DISPATCH ORDER
 * STAYS IN parseEffectClauseImpl (parser.js); only definitions live here, so the
 * move cannot reorder matching.
 *
 * NOT here (they re-enter the clause machinery — parseEffectClauseImpl /
 * parseClauseToAtom / programConfidence — so extraction would cycle): matchEmblem +
 * emblemAbilityModeled, the optional-payment quartet (matchOptionalManaPayment /
 * SacBySubtype / DrawDiscard / DiscardPayment), the reflexive trio
 * (matchReflexiveTrigger / matchOptionalReflexiveTrigger /
 * matchDrawCounterCreaturesThenGrant), matchKickedSpellEffect, and parseModal.
 *
 * LEAF over leaves — textNormalize / parseHelpers / interveningIf plus the atoms
 * clause parsers (which never import parser.js). parseFixedManaPips is exported for
 * the still-inline matchOptionalManaPayment; the SAC_UNLESS_PAY_NOUNS /
 * INSTEAD_ABILITY_WORD_CONDITION tables stay module-private.
 */
import { stripReminder } from "./textNormalize.js";
import { CR_CREATURE_TYPES } from "./creatureTypes.js"; // the closed creature-subtype vocabulary (leaf; read at call time only — never module-init, per the import-cycle gotcha)
import { parseTutorFilter, parseCountSource, parseGrantedKeywords, SMALL_NUM } from "./parseHelpers.js";
import { parseControllerRider } from "./spanMatchers.js"; // sibling leaf (slice 4) — the controller-rider fold matchExileXControllerRider reuses
import { fightClauseParser } from "./atoms/combat.js";
import { spellConditionParseable } from "../interveningIf.js";

/**
 * ===== DIES-TRIGGER-RESOURCE-PAYOFFS ===== Lifeblood Hydra's "you gain life and draw cards equal to its
 * power" — a SHARED-magnitude compound: the controller gains N life AND draws N cards where N = the dying
 * creature's last-known power (CR 603.6e, ctx.dyingPower). The "equal to its power" governs BOTH halves
 * (CR templating), but the top-level " and " would shatter into ["you gain life" (NO amount), "draw cards
 * equal to its power"], silently dropping the gain-life magnitude — a forbidden partial. So match the WHOLE
 * compound up front and emit BOTH atoms directly (each countContext:"dyingPower" → the gain-life resolver
 * reads ctx.dyingPower via resolveScaledAmount, the draw resolver via its own countContext branch).
 *
 * Why match the WHOLE compound and NOT add a generic "draw cards equal to its power" clause matcher: that
 * bare clause ALSO appears on ETB cards (Prime Speaker Zegana) and combat-damage cards (Gregor) where "its
 * power" is the LIVE source's power, NOT a dying creature's — a context-free dyingPower binding would mis-
 * resolve those to 0 (a forbidden FP). The disambiguator is the FULL clause "you gain life and draw cards
 * equal to its power", which is corpus-unique to Lifeblood (a dies-trigger), so "its" is unambiguously the
 * dying creature. Anchored ^…$ — any rider leaves residue → no match → low → Arbiter. Returns { atoms }.
 */
export function matchDiesGainDrawByPower(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\.\s*$/, "");
  if (!/^you gain life and draw cards equal to its power$/.test(s)) return null;
  return { atoms: [
    { op: "gain-life", countContext: "dyingPower", targetType: null },
    { op: "draw", countContext: "dyingPower", targetType: null },
  ] };
}

/**
 * ===== DRAIN-X (Exsanguinate / Gray Merchant-style life swing) ===== "Each opponent loses X life. You gain
 * life equal to the life lost this way." — the SECOND sentence's amount is the SUM of life actually lost by
 * the first (CR 118.10 — "this way"), so the top-level sentence split would shatter it into ["each opponent
 * loses X life" (→ lose-life eachOpponent), "you gain life equal to the life lost this way" (an UNMODELED
 * referent)], silently dropping the linked lifegain — a forbidden partial. Collapse the whole compound up
 * front to ONE `drain-each-opponent` atom: the resolver loses X (= ctx.xValue, an {X} spell) from each
 * opponent AND gains the total it actually drained. Only the X-cost form (amountX) is matched here; a FIXED-N
 * "each opponent loses 3 life. You gain that much life." is a fast-follow (not in the breakage set). Anchored
 * ^…$ on the two-sentence shape (a trailing rider leaves residue → no match → low → Arbiter). Returns { atom }.
 * Gated to hasX by the caller so a non-X spell never reaches this (an absent X would drain 0 — a clean no-op).
 */
export function matchDrainEachOpponentX(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ");
  if (!/^each opponent loses x life\. you gain life equal to the life lost this way\.?$/.test(s)) return null;
  return { atom: { op: "drain-each-opponent", amountX: true, targetType: null } };
}

/**
 * ===== ITERATED-EDICT (Torment of Hailfire, CR 118.9) ===== "Repeat the following process X times. Each
 * opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a
 * card." — an {X}-times-repeated, per-opponent, THREE-mode edict where EACH opponent chooses their own way
 * out (lose 3 life / sacrifice a nonland permanent / discard a card). The "repeat X times" wrapper + the
 * "loses N unless that player sacrifices…or discards" multi-mode choice are BOTH unmodeled by the clause
 * splitter (the "unless…or…" would shatter into unrelated lose-life / sacrifice / discard atoms, dropping
 * the affected-player CHOICE — a forbidden partial), so the whole card is collapsed here to ONE
 * `iterated-edict` atom whose resolver drives the X × opponents pausing choice chain (each opponent picks a
 * legal mode; a life-only opponent is forced to lose 3). Anchored ^…$ on the exact printed shape — any
 * variant (a different life amount, a filtered pool, a rider) leaves residue → no match → low → Arbiter
 * (CREED — never a mis-modeled iteration). Gated to hasX by the caller (an {X} cost); the atom is stamped
 * amountX so the cast path binds the chosen X into ctx.xValue (the repeat count). Returns { atom }.
 */
export function matchIteratedEdict(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
  if (!/^repeat the following process x times\. each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card\.?$/.test(s)) return null;
  return { atom: { op: "iterated-edict", amountX: true, targetType: null } };
}

/**
 * ===== REVEAL-TOP-DRAIN-BY-MV (Yuriko, the Tiger's Shadow) ===== "Reveal the top card of your library and put
 * that card into your hand. Each opponent loses life equal to that card's mana value." The SECOND sentence's
 * amount ("that card's mana value") is a value generated MID-RESOLUTION by the first sentence (the revealed
 * card's MV) — NOT a board-state count — so the top-level sentence split would shatter it into ["reveal … and
 * put … into your hand" (an UNMODELED reveal-to-hand clause; its " and " also mis-splits), "each opponent loses
 * life equal to that card's mana value" (an UNMODELED "equal to that card" referent)], silently dropping the
 * linked drain — a forbidden partial. Collapse the whole compound up front to TWO atoms whose SEQUENCE threads
 * the captured MV (the exact roll-d20 → diceResult pattern):
 *   1. reveal-top-to-hand — reveals the top card → controller's hand AND stamps its MV on state.revealedCardMV.
 *   2. lose-life who:"eachOpponent" amountCount:{kind:"revealedCardMV"} — each opponent loses THAT captured MV,
 *      read at resolution via countForSpec (state.revealedCardMV). Each OPPONENT (not the controller) loses it,
 *      so it's correct in 1v1 AND multiplayer (applyLoseLife enumerates opponentsOf).
 * Both atoms are KNOWN (reveal-top-to-hand + lose-life), so the whole compound resolves natively or not at all
 * (no partial). revealTopSequenceOk (the caller's HIGH gate) independently re-checks the reveal precedes the MV
 * read. Whole-string anchored ^…$ (curly apostrophe normalized) — any rider/variant leaves residue → no match →
 * low → Arbiter (CREED). The "reveal … put that card into your hand. each opponent loses life equal to that
 * card's mana value" phrasing is corpus-unique to Yuriko's family, so it never false-matches another effect.
 * Returns { atoms }.
 */
export function matchRevealTopDrainByMv(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // "that card" / "the card" / "it" — the printed wordings for the just-revealed card (Yuriko prints "that
  // card"). The drain recipient is either EACH OPPONENT (Yuriko, the Tiger's Shadow) or YOU (Dark Confidant /
  // Dark Tutelage — "you lose life equal to its mana value" → the CONTROLLER loses, applyLoseLife's default
  // branch). Whole-clause-anchored ^…$ like every fused matcher here — any rider ("unless you pay", an Offspring
  // keyword line, a "then" follow-on) leaves residue → null → low → Arbiter (CREED whole-effect).
  const m = s.match(/^reveal the top card of your library and put (?:that card|the card|it) into your hand\. (each opponent loses|you lose) life equal to (?:that card's|the card's|its) mana value$/);
  if (!m) return null;
  const who = m[1] === "you lose" ? "controller" : "eachOpponent";
  return { atoms: [
    { op: "reveal-top-to-hand", targetType: null },
    { op: "lose-life", who, amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
  ] };
}

// REANIMATE-DRAIN (Reanimate, Grave Researcher // Reanimate) — "Put target creature card from a graveyard onto
// the battlefield under your control. You lose life equal to that card's mana value." The two sentences span a
// mid-resolution value the reanimate produces (the reanimated card's MV), so they'd shatter under the clause
// splitter — collapsed up front like the Yuriko/Dark-Confidant reveal-top-drain, reusing the SAME stamp slot:
// the reanimate atom (stampMv) records state.revealedCardMV = the reanimated card's MV, and the lose-life reads
// it (amountCount revealedCardMV, who:"controller" — YOU lose). HIGH iff both ops KNOWN (they are) AND the
// reanimate precedes the drain (revealTopSequenceOk, now stamper-aware). Whole-clause anchored — any rider → LOW.
export function matchReanimateDrain(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^put target creature card from a graveyard onto the battlefield under your control\. you lose life equal to (?:that card's|the card's|its) mana value$/.test(s)) return null;
  return { atoms: [
    { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true, stampMv: true },
    { op: "lose-life", who: "controller", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
  ] };
}

/**
 * ===== DRAIN-BY-COUNT (BLITZ FE-1, CR 107.3b + 119.3) ===== the count-scaled "deal-and-gain" drain family:
 * "<source> deals X damage to <target> and you gain X life, where X is [equal to] the number of <count source>."
 * (Tendrils of Corruption — Swamps → target creature; Consuming Corruption — Swamps → target creature or
 * planeswalker; Harsh Sustenance — creatures you control → any target.) The single "where X is the number of
 * <count>" governs BOTH the damage AND the lifegain (CR templating), so X is one value locked ONCE as the spell
 * resolves (CR 107.3b) — but the top-level " and " split would shatter this into ["deals X damage to <target>"
 * (NO amount — the count rides the SECOND half) and "you gain X life, where X is the number of <count>"], and
 * BOTH fragments then fail their anchors (the damage clause has no count; a bare "gain X life where X is the
 * number of" gain-life clause isn't modeled). So match the WHOLE compound up front and emit BOTH atoms directly,
 * exactly like matchDiesGainDrawByPower's shared-magnitude gain+draw.
 *
 * CREED — X LOCKED ONCE (the off-by-one guard): the gain-life atom is emitted FIRST, the deal-damage atom
 * SECOND. Gaining life NEVER mutates a permanent count, so the gain-life atom reads the count off the PRE-damage
 * board; the deal-damage atom then reads the SAME count (the gain didn't change the board) — so both bind the
 * identical value even when the target is your own creature and the count is "creatures you control" (Harsh
 * Sustenance), where the damage could otherwise drop the count by one if computed AFTER. A triggered lifegain
 * ability doesn't resolve between atoms (CR 603.3b — it waits until the whole spell finishes), so the pre-damage
 * board read is exact. Both atoms carry amountCount:{...src, per:1} → resolveScaledAmount/countForSpec computes
 * the controller board count at resolution.
 *
 * The count source is the SHARED parseCountSource leaf with DEFAULT (controller-scoped) opts — an opponent-/
 * target-scoped count ("creatures they control") has no anaphoric referent on a controller drain, so it returns
 * null → no match → low → Arbiter (a SAFE FN, never a mis-scoped count). Whole-string anchored ^…$ (the leading
 * `.+?` consumes the source-name reference exactly like dealDamageScaledClauseParser) — any rider leaves residue
 * → no match → low → Arbiter (CREED). Only the TIGHT damage-target allowlist (the fully-modeled bare forms) is
 * admitted so a restricted target never mis-resolves to the unrestricted set. Returns { atoms }.
 *
 * NOT modeled here (SAFE FN parks): the "deals damage … equal to the number of <count>. You gain life equal to
 * the DAMAGE DEALT this way." phrasing (Corrupt) — its lifegain is the ACTUAL damage dealt (a mid-resolution
 * value, sensitive to prevention), a different mechanism than the count-defined "gain X life" here.
 */
export function matchDrainByCount(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const DRAIN_TARGET = {
    "any target": "any", "target creature": "creature",
    "target creature or planeswalker": "creatureOrPlaneswalker",
  };
  const m = s.match(/^.+? deals? x damage to (any target|target creature|target creature or planeswalker) and you gain x life, where x is (?:equal to )?the number of (.+)$/);
  if (!m) return null;
  const targetType = DRAIN_TARGET[m[1]];
  const src = parseCountSource(m[2]); // DEFAULT opts — controller-scoped counts only (a "they control"/"that player" scope has no referent here)
  if (!targetType || !src) return null;
  return { atoms: [
    // gain-life FIRST — reads the count off the pre-damage board so both atoms bind the identical locked X (CR 107.3b).
    { op: "gain-life", amountCount: { ...src, per: 1 }, targetType: null },
    { op: "deal-damage", targetType, amountCount: { ...src, per: 1 } },
  ] };
}

/**
 * ===== GENESIS-WAVE (mass reveal-top-X → put-permanents-onto-battlefield → mill-the-rest) ===== the {X}-cost
 * mass permanent-drop family: "Reveal the top X cards of your library. You may put any number of <FILTER> cards
 * with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that
 * weren't put onto the battlefield into your graveyard." (Genesis Wave — `permanent`; the same template also
 * covers an `artifact`/`creature`/`enchantment`-filtered variant, though Saheeli's Directive's Improvise line
 * — an unmodeled cost keyword — keeps THAT card LOW until Improvise is stripped, a SAFE false-negative).
 *
 * This spans three sentences and reads the SPELL'S X in two places (the reveal count AND the MV cap), so the
 * top-level sentence splitter would shatter it into unmatchable fragments (the second sentence's "from among
 * them" and the third's "revealed this way" are back-references with no standalone meaning). It's therefore
 * collapsed up front to ONE `genesis-wave` atom (applyGenesisWave reveals the top X, puts every eligible
 * permanent — matching the filter AND MV ≤ X — onto the battlefield, then mills the rest to the graveyard).
 *
 * GATED to hasX (an {X}-cost spell) — the caller only calls this on an {X} spell, and the atom is stamped so
 * the program derives xSpell:true (the cast path enumerates affordable X so ctx.xValue reaches the resolver's
 * reveal+cap). CREED: the X cap is the safety — a dropped cap would put ANY-MV permanent onto the battlefield
 * (a forbidden FP) — so the anchor REQUIRES the literal "with mana value x or less" AND an {X} cost, and the
 * filter is validated (permanent → permanentOnly gate; a typed word → parseTutorFilter allowlist). The exact
 * "into your graveyard" disposition is required: a "bottom of your library in a random order" variant (Majestic
 * Genesis / Knickknack Ouphe) or a "shuffle the rest" variant (Genesis Hydra) leaves residue → no match → low →
 * Arbiter. A "put A nonland permanent" (singular) / a dynamic non-cost X ("where X is …") / a spell-mastery or
 * undergrowth rider all fail the exact anchor → low → Arbiter (CREED FN-safe). Returns { atom }.
 */
/**
 * ===== FINALE-OF-REVELATION ===== ({X}{U}{U} sorcery) — "Draw X cards. If X is 10 or more, instead shuffle
 * your graveyard into your library, draw X cards, untap up to five lands, and you have no maximum hand size for
 * the rest of the game. Exile <this>." A THRESHOLD-REPLACEMENT X-spell: the net draw is X either way, but at
 * X ≥ 10 you ALSO shuffle your graveyard into your library (BEFORE the draw, so you draw from the refilled
 * library) and untap up to five of your lands. The "you have no maximum hand size" static is VACUOUS in this
 * engine (cleanup discard is unimplemented — see stripNoMaxHandSizeRider) and is stripped, and "Exile <this>"
 * is the spell exiling ITSELF on resolution (instead of going to the graveyard) — modeled via the program's
 * `selfExile` flag (runEffectProgram honors it at GY-1). The three-sentence, "instead"-replacement, self-
 * referential shape would shatter under the generic clause splitter (the "instead" + the multi-effect comma
 * list + the self-exile all unmodeled by the splitter), so it's collapsed up front to a fixed atom list:
 *
 *   [ shuffle-graveyard-into-library (condX 10),  ← runs first, only at X ≥ 10
 *     draw (amountX),                             ← always runs, X cards (from the refilled library if shuffled)
 *     untap-lands (condX 10, uptoN 5) ]           ← only at X ≥ 10
 *
 * This is FUNCTIONALLY IDENTICAL to the printed card: below 10, only the draw fires (both condX atoms no-op);
 * at/above 10, shuffle→draw→untap all fire in printed order. The shuffle + untap resolvers each carry the same
 * condX gate as applyPumpEffect (Finale of Devastation's precedent). GATED to hasX — the caller only calls this
 * on an {X} spell, and the returned program is stamped xSpell:true so the cast path enumerates affordable X into
 * ctx.xValue (both the draw magnitude AND the ≥10 threshold read it). ANCHORED to the exact whole-oracle shape
 * (after stripping the vacuous hand-size rider): any rider / different threshold / different effect list leaves
 * residue → no match → low → Arbiter (CREED FN-safe — never a partial/wrong model). Returns { atoms, selfExile }.
 */
export function matchFinaleOfRevelation(oracle) {
  // NOTE: parseEffectClauseImpl already ran stripNoMaxHandSizeRider on `oracle` before this matcher, replacing
  // the VACUOUS "you have no maximum hand size for the rest of the game" rider with " " — which leaves a
  // DANGLING ", and  " conjunction at the tail of the ≥10 comma-list ("…untap up to five lands, and  \nExile…").
  // The cleanup-discard the rider governs is unimplemented (see stripNoMaxHandSizeRider), so the rider is a
  // documented no-op and its removal is faithful. Here we just normalize the dangling ", and" so the sentence
  // closes cleanly at "untap up to five lands." and the "Exile" self-exile sentence survives for the tail match.
  const s = stripReminder(oracle)
    .trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ")
    .replace(/,\s*and\s+(?=\.?\s*exile\b)/g, ". ")   // dangling ", and " left by the upstream hand-size strip → sentence break
    .replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim();
  // Whole-string anchored: base draw-X, then the ≥10 "instead" replacement (shuffle-GY-into-library, draw X,
  // untap up to five lands), then the self-exile sentence (the spell names ITSELF — matched generically as
  // "exile <name>" at the tail, so it's robust to the printed card name).
  const m = s.match(
    /^draw x cards\. if x is 10 or more, instead shuffle your graveyard into your library, draw x cards, untap up to five lands\. exile [a-z][a-z ',-]*\.?$/,
  );
  if (!m) return null;
  return {
    atoms: [
      { op: "shuffle-graveyard-into-library", condX: { min: 10 }, targetType: null }, // runs first, only at X ≥ 10
      { op: "draw", amountX: true, targetType: null },                                 // always — X cards
      { op: "untap-lands", uptoN: 5, condX: { min: 10 }, targetType: null },           // only at X ≥ 10
    ],
    selfExile: true, // "Exile <this>." — the spell exiles itself on resolution instead of going to the graveyard
  };
}

export function matchGenesisWave(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: reveal top X → "you may put any number of <filter> cards with mana value X or less
  // from among them onto the battlefield" → "then put all cards revealed this way that weren't put onto the
  // battlefield into your graveyard". The filter phrase is captured (group 1). "onto the battlefield tapped" is
  // NOT accepted here (Genesis Wave / Saheeli's Directive enter untapped; a "tapped" mass-put is a different,
  // unmodeled shape — Animist's Awakening's mandatory all-lands-tapped — so it stays low).
  const m = s.match(
    /^reveal the top x cards of your library\. you may put any number of ([a-z][a-z ]*?) cards with mana value x or less from among them onto the battlefield\. then put all cards revealed this way that weren't put onto the battlefield into your graveyard$/,
  );
  if (!m) return null;
  const phrase = m[1].trim();
  // "permanent" → NO type group (every card type matches) PLUS the permanentOnly gate (front-face must be a
  // permanent type, never an instant/sorcery) — exactly the Wargate `bfx` handling. Any other phrase must be a
  // parseTutorFilter-allowlisted type word ("artifact", "creature", "enchantment", …); the type group itself
  // then restricts to that permanent type (an instant/sorcery could never match "artifact"/"creature"/…).
  const filter = phrase === "permanent" ? { groups: [], permanentOnly: true } : parseTutorFilter(phrase);
  if (!filter) return null; // an unmodeled filter word → low → Arbiter (never a fabricated match)
  // A typed filter must still be permanent-only. parseTutorFilter allows "instant"/"sorcery" words (used by the
  // to-hand tutor family), so reject a group that names a NON-permanent card type — the mass-put must never put
  // an instant/sorcery onto the battlefield (they can't be permanents; a filter naming them is a malformed shape).
  const NONPERMANENT = new Set(["instant", "sorcery"]);
  if (Array.isArray(filter.groups) && filter.groups.some((g) => g.some((w) => NONPERMANENT.has(w)))) return null;
  return { atom: { op: "genesis-wave", filter, filterLabel: `${phrase} card with mana value X or less`, targetType: null } };
}

/**
 * ===== GISHATH / REVEAL-THAT-MANY-PUT-FILTERED ===== a COMBAT-DAMAGE trigger's payoff (NOT an {X} spell): "reveal
 * that many cards from the top of your library. Put any number of <SUBTYPE> creature cards from among them onto the
 * battlefield and the rest on the bottom of your library in a random order." (Gishath, Sun's Avatar — Dinosaur;
 * Pantlaza). "that many" = the combat damage this trigger dealt (countContext:"combatDamageAmount"); the referent
 * gate (combatDamageReferentSatisfied) keeps this native ONLY on a combat-damage event, so a non-combat trigger
 * can't route here and silently drop. Whole-clause anchored: any different disposition ("into your graveyard", no
 * "random order"), a missing subtype, or a non-"creature" put fails the exact anchor → low → Arbiter (CREED FN-safe).
 * The subtype is captured (group 1, single word) and folded into an AND-group filter with "creature" so
 * cardMatchesTutorFilter admits a card whose front-face type line names BOTH (e.g. "Creature — Dinosaur"). The op
 * is KNOWN (registered in libraryResolvers), so the caller emits a HIGH single-atom program. Returns { atom }.
 */
export function matchRevealThatManyPutFiltered(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const m = s.match(
    /^reveal that many cards from the top of your library\. put any number of ([a-z]+) creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order$/,
  );
  if (!m) return null;
  const subtype = m[1].trim(); // "dinosaur" — a creature subtype word
  if (!subtype) return null;
  // Filter = a creature card whose front-face type line names the subtype. cardMatchesTutorFilter ANDs a group's
  // words against the type line, so ["dinosaur","creature"] requires BOTH — "Creature — Dinosaur" matches; an
  // instant/sorcery (no "creature") never does. A bogus subtype simply matches nothing (put 0 — never fabricated).
  const filter = { groups: [[subtype, "creature"]] };
  return { atom: { op: "reveal-put-filtered", filter, countContext: "combatDamageAmount", filterLabel: `${subtype} creature card`, targetType: null } };
}

/**
 * ===== ANIMIST'S AWAKENING (mass reveal-top-X → put-all-LANDS-tapped → bottom-the-rest, + spell-mastery untap)
 * ===== the {X}-cost land-flood family: "Reveal the top X cards of your library. Put all land cards from among
 * them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery
 * — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands." (Animist's
 * Awakening — {X}{G}.)
 *
 * A DISTINCT shape from genesis-wave (which explicitly BANS "onto the battlefield tapped" and requires a "with
 * mana value X or less" MV cap + a "into your graveyard" disposition): here the filter is TYPE-ONLY (all lands,
 * no MV cap), the entry is TAPPED, and the rest goes to the BOTTOM in a random order — plus a spell-mastery
 * untap rider that back-references "those lands". The whole card is collapsed to ONE `animist-awakening` atom
 * because (a) the "put all … and the rest …" reads the SPELL'S X for the reveal count, and (b) the rider's
 * "untap those lands" is a standalone-meaningless back-reference to the lands this atom just put out — the clause
 * splitter would shatter both. GATED to hasX (the reveal count = X binds at cast; a non-X spell would reveal 0).
 *
 * CREED: whole-string anchored on the EXACT template. The base line requires the type-only "put all land cards
 * … onto the battlefield tapped" + "the rest on the bottom of your library in a random order"; the rider
 * requires the EXACT spell-mastery threshold "two or more instant and/or sorcery cards in your graveyard, untap
 * those lands". A different filter (nonland / a specific type), a non-tapped entry, a milled/shuffled/graveyard
 * disposition, an absent or different rider, or a NON-{X} spell all fail the anchor → no match → low → Arbiter
 * (a SAFE false-negative). Returns { atom }.
 */
export function matchAnimistAwakening(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/[—–]/g, "-").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: reveal top X → put ALL land cards onto the battlefield TAPPED + the rest on the bottom
  // in a random order → spell-mastery: 2+ instant and/or sorcery in graveyard untaps those lands. The exact card;
  // every deviation (filter word, tapped/untapped, disposition, rider) fails the anchor → low → Arbiter.
  const m = s.match(
    /^reveal the top x cards of your library\. put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order\.?\s*spell mastery ?-? ?if there are two or more instant and\/or sorcery cards in your graveyard, untap those lands$/,
  );
  if (!m) return null;
  return { atom: { op: "animist-awakening", targetType: null } };
}

/**
 * ===== OPEN-THE-WAY (reveal-until-X-lands → lands onto the battlefield tapped, rest to the bottom) ===== the
 * {X}-cost sorcery: "X can't be greater than the number of players in the game. Reveal cards from the top of your
 * library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (Open the Way.)
 *
 * This spans THREE sentences and reads the SPELL'S X (both the reveal-until count AND the printed player-count
 * cap), so the top-level sentence splitter would shatter it into unmatchable fragments (the "X can't be greater
 * than …" cap sentence has no atom; "reveal cards … until you reveal X land cards" is a novel dig anchor; "put
 * those land cards … and the rest …" is a back-reference to the reveal). It's therefore collapsed up front to ONE
 * `reveal-until-n-lands` atom (applyRevealUntilNLands reveals from the top until X lands appear — capped at the
 * player count — puts them all onto the battlefield TAPPED firing ETB/landfall, and bottoms every other revealed
 * card in a random order).
 *
 * GATED to hasX (an {X}-cost spell) — the caller only calls this on an {X} spell, and the atom is stamped so the
 * program derives xSpell:true (the cast path enumerates affordable X so ctx.xValue reaches the resolver). CREED:
 * the player-count cap is the printed constraint on X and is enforced at resolution (capPlayerCount → min(X,
 * players) — never a fabricated/uncapped count). The anchor REQUIRES the EXACT three-sentence shape: the leading
 * "X can't be greater than the number of players in the game." cap, the "reveal … until you reveal X land cards"
 * dig, and the EXACT "onto the battlefield tapped and the rest on the bottom of your library in a random order"
 * disposition. Any variant — a "reveal until N nonland cards", an "into your hand" disposition, an untapped put,
 * a different cap ("can't be greater than the number of Islands") — leaves residue → no match → low → Arbiter
 * (CREED whole-card, no partial). The op is KNOWN (registered in libraryResolvers), so the caller emits a HIGH
 * single-atom xSpell program. Returns { atom } or null.
 */
export function matchOpenTheWay(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // Whole-string anchored: the player-count cap sentence, then "reveal cards from the top of your library until
  // you reveal X land cards", then "put those land cards onto the battlefield tapped and the rest on the bottom
  // of your library in a random order". The cap is required (it's the printed X constraint this atom enforces).
  const m = s.match(
    /^x can't be greater than the number of players in the game\. reveal cards from the top of your library until you reveal x land cards\. put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order$/,
  );
  if (!m) return null;
  return { atom: { op: "reveal-until-n-lands", capPlayerCount: true, entersTapped: true, targetType: null } };
}

/**
 * ===== EXILE-X-CONTROLLER-RIDER (Curse of the Swine) ===== the X-COUNT twin of matchRemovalControllerRider —
 * "Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature
 * token." → ONE `exile` atom with `targetCountX:true` (the target count is X, bound at cast from the {X} mana
 * cost) + a PER-EXILED controllerRider. The lead is an X-COUNT chosen-target exile (targeting.expandAtoms picks
 * EXACTLY ctx.xValue distinct legal creatures, all tagged atomIndex 0), and the rider — parsed by the SHARED
 * parseControllerRider so the createToken token grammar (N/N <color> <subtype>[ with KW]) is reused verbatim —
 * is applied at RESOLUTION to EACH exiled creature's captured controller by applyRemovalWithRider (which already
 * loops over ctx.targets, capturing every controller before the removal, then applies the rider per-controller).
 * That loop is EXACTLY "For each creature exiled this way, its controller <rider>". GATED to hasX (the target
 * count = X is the CREED safety — the count only binds off a real {X} cost). ALL-OR-NOTHING: a non-createToken
 * rider, a fixed-count / "up to N" lead, or any residue fails the exact anchor → null → whole card low → Arbiter
 * (never the exile without the rider, never a wrong token). Anchored ^…$ on the two-sentence shape.
 */
export function matchExileXControllerRider(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  const m = s.match(/^exile x target creatures\. for each creature exiled this way, its controller (.+)$/);
  if (!m) return null;
  const rider = parseControllerRider(m[1].trim());
  // The corpus form (Curse of the Swine) is a createToken rider; restrict to that kind so a hypothetical
  // "for each creature exiled … its controller gains life / draws" (which reads a per-creature magnitude this
  // slice doesn't compute from the exiled creatures) never fires a partial. createToken is per-controller and
  // count-independent, so the per-exiled loop is faithful. Any other rider kind → null → low → Arbiter.
  if (!rider || rider.kind !== "createToken") return null;
  return { atom: { op: "exile", targetType: "creature", targetCountX: true, controllerRider: rider } };
}

/**
 * ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== "Reveal the top card of your library. If it's a
 * creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library."
 * This is a THREE-sentence effect whose branches (reveal → if-creature → otherwise-may) are shattered by the
 * clause splitter into individually-unmatchable fragments ("reveal the top card of your library" alone is not a
 * modeled atom; "if it's a creature card, put it onto the battlefield" is a conditional the splitter can't route;
 * "otherwise, you may put that card on the bottom of your library" is a back-reference to the reveal). So it's
 * collapsed up front to ONE `reveal-top-conditional` atom whose resolver (applyRevealTopConditional) executes the
 * WHOLE branch faithfully: creature → onto the battlefield (enterCardFromZone, firing ETB); non-creature → put on
 * the bottom (the deterministic "may" branch, exactly like EXPLORE's deterministic keep-on-top option). Anchored
 * ^…$ on the exact three-sentence shape (curly apostrophe + whitespace normalized, trailing period stripped) — any
 * rider / variant (a different fallback, a "then draw", "if it's a land card", a shuffle) leaves residue → no match
 * → low → Arbiter (CREED whole-card, no partial). The op is KNOWN (registered in libraryResolvers), so the caller
 * emits a HIGH single-atom program. Returns { atom }.
 */
export function matchRevealTopConditional(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // The original fused Lurking Predators shape — param-free atom, byte-identical legacy resolver branch.
  if (/^reveal the top card of your library\. if it's a creature card, put it onto the battlefield\. otherwise, you may put that card on the bottom of your library$/.test(s)) {
    return { atom: { op: "reveal-top-conditional", targetType: null } };
  }
  // ===== TOP-CARD ROUTER (the parameterized family) ===== "[Scry N, then ]Reveal the top card of your
  // library. If it's a <TYPE> card, put it <onto the battlefield[ tapped]|into your hand|into your
  // graveyard>. Otherwise, <put <it|that card> into your <graveyard|hand>|put it onto the battlefield[
  // tapped]|draw a card>." (Zoologist / Call of the Wild: creature→battlefield else graveyard; Neurok
  // Familiar: artifact→hand else graveyard; Thrasios, Triton Hero: scry 1, then land→battlefield TAPPED
  // else draw a card.) Both branches map through REVEAL_THEN/REVEAL_ELSE — a CLOSED route vocabulary
  // (each key resolves to a real modeled atom: put-onto-battlefield tapped/untapped rides
  // enterCardFromZone and fires ETB, put-into-hand/graveyard rides moveCardToZone and is NEITHER a draw
  // nor a mill, draw is a REAL draw). Exact-anchored ^…$ like every fused matcher here — a "you may"
  // then-branch (Matter Reshaper), an MV cap, a name-match predicate (Candles of Leng), a "then shuffle"
  // rider, or ANY other variant leaves residue → null → low → Arbiter (CREED whole-effect). An optional
  // leading "Scry N, then " prepends a REAL scry atom (returned as the {atoms} multi-atom shape, same as
  // the no-else rt2 branch below).
  const rt = s.match(/^(?:scry (\d+), then )?reveal the top card of your library\. if it's an? (creature|artifact|land|enchantment) card, put it (onto the battlefield tapped|onto the battlefield|into your hand|into your graveyard)\. otherwise, (?:put (?:it|that card) (into your graveyard|into your hand|onto the battlefield tapped|onto the battlefield)|(draw a card))$/);
  if (rt) {
    const REVEAL_ROUTE = { "onto the battlefield tapped": "battlefield-tapped", "onto the battlefield": "battlefield", "into your hand": "hand", "into your graveyard": "graveyard" };
    const router = { op: "reveal-top-conditional", targetType: null, predicate: rt[2], thenRoute: REVEAL_ROUTE[rt[3]], elseRoute: rt[5] ? "draw" : REVEAL_ROUTE[rt[4]] };
    if (rt[1]) return { atoms: [{ op: "scry", amount: parseInt(rt[1], 10), targetType: null }, router] };
    return { atom: router };
  }
  // NO-ELSE forms (router v2): "Reveal the top card of your library. If it's a <T1>[ or <T2>] card,
  // <put it into your hand|draw a card>." — the absent otherwise-branch is CR-literal: nothing happens,
  // the revealed card STAYS ON TOP (elseRoute:"leave", a logged no-op). thenRoute "draw" is a REAL draw
  // (Track Down "draw a card" — applyDrawEffect, draw triggers fire; the opposite of the put-into-hand
  // rule). The OR-predicate ("creature or land" — Track Down) is a union test. An optional leading
  // "Scry N, then " (Llanowar Empath / Track Down) prepends a REAL scry atom (the same pause/resume
  // machinery any multi-atom program uses); returned as {atoms} (the Windfall multi-atom shape).
  const rt2 = s.match(/^(?:scry (\d+), then )?reveal the top card of your library\. if it's an? (creature|artifact|land|enchantment)(?: or (creature|artifact|land|enchantment))? card, (put it into your hand|draw a card)$/);
  if (rt2) {
    const router = { op: "reveal-top-conditional", targetType: null, predicate: rt2[2], thenRoute: rt2[4] === "draw a card" ? "draw" : "hand", elseRoute: "leave" };
    if (rt2[3]) router.predicates = [rt2[2], rt2[3]];
    if (rt2[1]) return { atoms: [{ op: "scry", amount: parseInt(rt2[1], 10), targetType: null }, router] };
    return { atom: router };
  }
  return null;
}

/**
 * ===== IMPULSE-EXILE-AND-PLAY ===== "Exile the top card of your library. You may play that card this turn."
 * (Professional Face-Breaker's sac-Treasure activated ability; the Light Up the Stage / impulse-draw family).
 * A TWO-sentence effect: the "exile the top card" half and the "you may play that card this turn" permission
 * half are ONE modeled unit — the clause splitter would shatter them into individually-unmatchable fragments
 * ("exile the top card of your library" alone is not a modeled atom; "you may play that card this turn" is a
 * bare back-reference to the exiled card). So it's collapsed up front to ONE `impulse-exile` atom whose
 * resolver (applyImpulseExileAtom) moves the top card to exile FACE-UP + stamps the this-turn play permission,
 * which the ACTION layer (legalChoices.actionsPlayImpulseFromExile) then genuinely OFFERS + ENFORCES (a real
 * full-cost cast / play-land from exile, this turn only, cleared at cleanup) — never a parse-only marker.
 *
 * ALLOWLIST (CREED whole-effect, anchored ^…$ on the exact two-sentence shape, apostrophe/whitespace normalized,
 * trailing period stripped): the referent-pronoun variants "that card" / "it" and the duration phrasings
 * "this turn" / "until end of turn". Any rider / variant — a COUNT ("the top TWO cards"), a mana-value cap, an
 * IMPRINT / another-zone ("from your graveyard"), a cost rider ("you may play that card. If you do, …"), or a
 * different owner's library — leaves residue → no match → low → Arbiter (never a partial). The op is KNOWN
 * (registered in libraryResolvers), so the caller emits a HIGH single-atom program. Returns { atom }.
 */
export function matchImpulseExilePlay(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  // BOTH clause orders map to the SAME this-turn impulse-exile atom (the duration is identical — "this turn"
  // = "until end of turn"), only the anchor differed: the duration can trail the permission ("you may play
  // that card until end of turn" — Professional Face-Breaker) OR LEAD it ("Until end of turn, you may play
  // that card" — Abbot of Keral Keep, Experimental Synthesizer, Stromkirk Occultist, Irascible Wolverine).
  // The leading-duration form ONLY accepts the bare "until end of turn" phrasing — a "until the end of your
  // NEXT turn" two-turn window is a DIFFERENT effect the this-turn `_impulseTurn` stamp can't model, so it
  // stays unmatched → Arbiter (a SAFE false-negative, never a mis-modeled window; CREED whole-effect).
  // COUNT (census slice) — "exile the top TWO/THREE cards … you may play THEM this turn" (Reckless Impulse,
  // Wrenn's Resolve, Jeska's Will, Party Thrasher — 27 corpus carriers). The plural rides the SAME this-turn
  // `_impulseTurn` stamp and the SAME play-from-exile action layer; only the number of cards moved differs, so
  // the count is a parameter rather than a new mechanism. Singular keeps `count` unset → byte-identical atom.
  //
  // The NEXT-TURN window (Light Up the Stage's own wording) is STILL refused, for the reason this file
  // already gave and which the count change does not touch: `state.turn` increments once per PLAYER turn, so
  // "your next turn" is not `turn + 1` in multiplayer and the this-turn stamp would close the window at the
  // wrong moment. 22 corpus carriers wait on a controller-scoped expiry; a SAFE false-negative until then.
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  // The plural referent is printed as "them" OR "those cards" — both are the same set (the just-exiled
  // cards), so both map to the identical atom. "those cards" is the DOMINANT printed form (6 carriers vs 3),
  // which is why the first pass flipped nothing until it was admitted.
  const m = s.match(/^exile the top (card|two cards|three cards|four cards|five cards) of your library\. (?:you may play (?:that card|it|them|those cards)(?: this turn| until end of turn)|until end of turn, you may play (?:that card|it|them|those cards))$/);
  if (m) {
    const word = m[1] === "card" ? "one" : m[1].split(" ")[0];
    const count = NUM[word] || 1;
    return { atom: { op: "impulse-exile", targetType: null, ...(count > 1 ? { count } : {}) } };
  }
  // EXTENDED WINDOW (CR 118.10) — "…until the end of your NEXT turn" (Light Up the Stage #1211, Reckless
  // Impulse, Wrenn's Resolve, Inspired Tinkering — 22 carriers). A CONTROLLER-SCOPED two-turn window, which
  // is why it needed its own flag rather than a bigger number: `state.turn` counts PLAYER turns, so "your
  // next turn" is not `turn + 1` in multiplayer. The expiry is decided at cleanup by the OWNER + stamp turn
  // (see applyImpulseExileAtom), never by arithmetic on the turn counter.
  const e = s.match(/^exile the top (card|two cards|three cards|four cards|five cards) of your library\. (?:you may play (?:that card|it|them|those cards|cards exiled this way) until the end of your next turn|until the end of your next turn, you may play (?:that card|it|them|those cards))$/);
  if (!e) return null;
  const eWord = e[1] === "card" ? "one" : e[1].split(" ")[0];
  const eCount = NUM[eWord] || 1;
  return { atom: { op: "impulse-exile", targetType: null, ...(eCount > 1 ? { count: eCount } : {}), extendedWindow: true } };
}

/**
 * ===== BLOOD-MONEY (mass destroy + Treasure-per-nontoken-destroyed) ===== "Destroy all creatures. For each
 * nontoken creature destroyed this way, you create a tapped Treasure token." The second sentence's count
 * ("destroyed this way") is the set the FIRST destroyed — a back-reference the top-level sentence split would
 * shatter (the "for each … destroyed this way" half has no standalone count source), silently dropping the
 * Treasures. Collapse the whole compound up front to ONE mass-destroy-treasure-per-nontoken atom: the resolver
 * wipes the board (shared destroy) and creates one tapped Treasure per nontoken creature it actually destroyed.
 * Anchored ^…$ on the exact two-sentence shape (a "can't be regenerated" rider would be stripped upstream; any
 * other rider leaves residue → no match → low → Arbiter, CREED). Returns { atom }.
 */
export function matchMassDestroyTreasurePerNontoken(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^destroy all creatures\. for each nontoken creature destroyed this way, you create a tapped treasure token$/.test(s)) return null;
  return { atom: { op: "mass-destroy-treasure-per-nontoken", targetType: "eachCreature" } };
}

/**
 * ===== WINDFALL (max-discarded wheel) ===== "Each player discards their hand, then draws cards equal to the
 * greatest number of cards a player discarded this way." (Windfall, Whispering Madness' base body). A ONE-
 * sentence discard-then-draw where the draw count is the GREATEST number any player discarded — a back-
 * reference to the discard step that just resolved (CR 118.10 "this way"). The plain WHEEL rewrite (§the
 * splitClauses fold above) only handles a FIXED "draws N cards" tail; this variable "greatest discarded" count
 * has no standalone count source, so the ", then" split would orphan it → low. Collapse the whole compound up
 * front to TWO atoms in fixed order:
 *   1. discard who:eachPlayer all:true recordMaxDiscarded — every player pitches their whole hand (no choice,
 *      resolved inline — see applyDiscard), and the resolver stamps state.maxDiscardedThisWay = the greatest
 *      whole-hand size it pitched (the exact "greatest number of cards a player discarded this way").
 *   2. draw who:eachPlayer amountCount:{kind:"maxDiscardedThisWay"} — every player draws that stamped max
 *      (countForSpec reads state.maxDiscardedThisWay, the inter-atom channel — mirrors Yuriko's revealedCardMV /
 *      the dice-roll diceResult mid-resolution value capture).
 * The two atoms are emitted TOGETHER (never independently parseable), so the record-then-read order is
 * structurally guaranteed — the draw can never read a stale/absent max. Anchored ^…$ on the exact printed
 * shape; a rider (Whispering Madness' Cipher line is a SEPARATE line, so the anchored single-sentence match
 * fails on the multi-line oracle → the whole card stays Arbiter — a SAFE false-negative) leaves residue → no
 * match → low → Arbiter (CREED). Not an X spell. Returns { atoms }.
 */
export function matchWindfallMaxDiscard(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way$/.test(s)) return null;
  return { atoms: [
    { op: "discard", who: "eachPlayer", all: true, recordMaxDiscarded: true, targetType: null },
    { op: "draw", who: "eachPlayer", amountCount: { kind: "maxDiscardedThisWay", per: 1 }, targetType: null },
  ] };
}

// ===== OPTIONAL-MANA-PAYMENT (CR 603.7c — the "pay {cost}" reflexive) ===== the single-color/generic mana
// pips of an optional-pay cost, parsed into the planPayment cost shape — or null if ANY pip isn't a known
// FIXED mana symbol (digit / single color / {C} / hybrid). {X}/{Y}/{Z} → null (Shanna's "{X}" is unmodeled:
// the chosen X + its life cap aren't in this slice). Mirrors ward.js' parseWardManaPips / legalChoices'
// parseManaCost grammar but is INLINED to keep parser.js a leaf (importing legalChoices would cycle —
// legalChoices already imports parser.js).
export function parseFixedManaPips(pipStrings) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
  const SINGLE = new Set(["W", "U", "B", "R", "G"]);
  for (const raw of pipStrings) {
    const pip = String(raw).trim().toUpperCase();
    if (/^\d+$/.test(pip)) { cost.generic += parseInt(pip, 10); continue; }
    if (SINGLE.has(pip)) { cost[pip] += 1; continue; }
    if (pip === "C") { cost.C += 1; continue; }
    if (pip.includes("/")) {
      const parts = pip.split("/").map((p) => p.trim()).filter((p) => p && p !== "P");
      if (parts.length && parts.every((p) => /^\d+$/.test(p) || SINGLE.has(p) || p === "C")) { cost.hybrid.push(parts); continue; }
      return null; // unrecognized hybrid option
    }
    return null; // {X} / snow {S} / any unknown symbol → unmodeled
  }
  return cost;
}

// UPKEEP-SAC-UNLESS-PAY noun allowlist — the printed permanent-type nouns for which "sacrifice this <noun>" means
// "sacrifice the source permanent" unambiguously. An unrecognized noun → no match (safe FN → Arbiter). The sac target
// is always the source (ctx.sourceId) regardless of noun; the allowlist just gates out garbage.
const SAC_UNLESS_PAY_NOUNS = new Set(["creature", "artifact", "enchantment", "land", "permanent", "token"]);

/**
 * ===== UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword, CR 603.7c) ===== "Sacrifice this <noun> unless you pay
 * {cost}." — the upkeep-tax body of a cumulative/echo-style permanent (the effectClause of "At the beginning of your
 * upkeep, …"): a mana-payment choice with INVERTED polarity vs optional-mana-payment (PAY+afford keeps the permanent;
 * DECLINE or CAN'T-afford sacrifices the source). MUST be matched WHOLE, pre-splitter: a bare "sacrifice this creature"
 * left over hits sacrificeEdictClauseParser → an UNCONDITIONAL self-sac that silently DROPS the pay-escape (a cardinal
 * FP). CREED guards: FIXED mana cost (parseFixedManaPips → null on {X}), an allowlisted permanent noun; anchored ^…$
 * (a rider leaves residue → LOW → Arbiter). Emit the { op:"sac-unless-pay", cost } pausing atom, or null.
 */
export function matchUpkeepSacUnlessPay(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  // SAC-UNLESS-DISCARD (2026-08-07) — the Masticore cycle's cost ("sacrifice this creature unless you
  // discard a card": Masticore, Razormane, Argentum, Molten-Tail; Coral Net's Aura form). Same pausing
  // atom, a DIFFERENT cost kind — the settle path is already discriminated on `cost.kind`, so the discard
  // arm rides the machinery mana built. Fixed N=1 only; "discard two cards" has no carrier and stays parked.
  const d = s.match(/^sacrifice this(?:\s+([a-z]+))?\s+unless you discard a card$/i);
  if (d) {
    if (d[1] && !SAC_UNLESS_PAY_NOUNS.has(d[1].toLowerCase())) return null; // unrecognized noun → safe FN
    return { atom: { op: "sac-unless-pay", cost: { kind: "discard", count: 1 }, targetType: null } };
  }
  // SAC-UNLESS-SACRIFICE (2026-08-12) — the cost is sacrificing ANOTHER permanent of a printed type: Bog
  // Elemental ("a land"), Cosmic Larva ("two lands"), Endless Wurm ("an enchantment"). Only the three
  // measured victim forms are admitted — the alternation IS the allowlist, so an unmeasured victim type
  // ("a creature", "three lands") stays parked rather than guessing a pool. The victim pool at settle time
  // is sacrificePoolMatch — the SAME word-anchored edict predicate — so an Artifact Land pays a land cost.
  const v = s.match(/^sacrifice this(?:\s+([a-z]+))?\s+unless you sacrifice (a land|two lands|an enchantment)$/i);
  if (v) {
    if (v[1] && !SAC_UNLESS_PAY_NOUNS.has(v[1].toLowerCase())) return null; // unrecognized noun → safe FN
    const FORMS = { "a land": { type: "land", count: 1 }, "two lands": { type: "land", count: 2 }, "an enchantment": { type: "enchantment", count: 1 } };
    const f = FORMS[v[2].toLowerCase()];
    return { atom: { op: "sac-unless-pay", cost: { kind: "sacrifice", type: f.type, count: f.count }, targetType: null } };
  }
  // SAC-UNLESS-RETURN-LAND (2026-08-12) — the cost is BOUNCING your own land: Waterspout Djinn ("an
  // untapped Island"), Living Tsunami ("a land"). Same allowlist-by-alternation as the sacrifice arm —
  // only the two measured victim forms are admitted; "an untapped Mountain" has no carrier and parks.
  // The untapped requirement is REAL (the Djinn cannot pay with a tapped Island) and rides the cost.
  const r = s.match(/^sacrifice this(?:\s+([a-z]+))?\s+unless you return (an untapped island|a land) you control to its owner's hand$/i);
  if (r) {
    if (r[1] && !SAC_UNLESS_PAY_NOUNS.has(r[1].toLowerCase())) return null; // unrecognized noun → safe FN
    const FORMS = { "an untapped island": { subtype: "Island", untapped: true }, "a land": { subtype: null, untapped: false } };
    const f = FORMS[r[2].toLowerCase()];
    return { atom: { op: "sac-unless-pay", cost: { kind: "return-land", subtype: f.subtype, untapped: f.untapped }, targetType: null } };
  }
  // SLOW MOTION (2026-08-12) — the OTHER-PLAYER's pay-or-sacrifice: "that player sacrifices that creature
  // unless they pay {2}" on the enchanted-controller's-upkeep event. BOTH nouns arrive as sentinels the
  // event's rewrites produce ("that player" → "the upkeep player", "that creature" → "enchanted creature")
  // — neither phrase exists in printed oracle, so this arm is unreachable from any other event (the
  // sentinel-gate discipline). payerRef re-aims the choice at the upkeep player (the HOST's controller,
  // by the firing gate's construction) and victimRef re-aims the sacrifice at the HOST — the aura
  // survives either outcome; only the creature is on the line.
  const sm = s.match(/^the upkeep player sacrifices enchanted creature unless they pay\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (sm) {
    const pips = (sm[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
    const mana = pips.length ? parseFixedManaPips(pips) : null;
    if (!mana) return null; // {X} / unknown symbol → unmodeled cost (safe FN)
    return { atom: { op: "sac-unless-pay", cost: { kind: "mana", mana }, payerRef: "upkeepPlayer", victimRef: "enchanted", targetType: null } };
  }
  const m = s.match(/^sacrifice this(?:\s+([a-z]+))?\s+unless you pay\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  if (m[1] && !SAC_UNLESS_PAY_NOUNS.has(m[1].toLowerCase())) return null; // an unrecognized noun → unmodeled (safe FN)
  const pips = (m[2].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / unknown symbol → unmodeled cost
  return { atom: { op: "sac-unless-pay", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== CUMULATIVE UPKEEP (CR 702.24) ===== the SENTINEL effect clause detectTriggers synthesizes off the
 * "Cumulative upkeep {cost}" KEYWORD (whose real triggered ability — "At the beginning of your upkeep, put an
 * age counter …, then sacrifice it unless you pay its upkeep cost for each age counter on it." — lives entirely
 * in reminder parens, the Bushido/Afflict precedent). The synthesized effectClause is the bare "cumulative
 * upkeep {cost}"; this maps it to the single `cumulative-upkeep` pausing atom that (at fire time) adds one age
 * counter, scales the printed per-counter cost by the age-counter total, and suspends on the shared sac-unless-
 * pay pay-or-sacrifice choice. CREED guards: a FIXED, PURE generic/colored mana cost only — parseFixedManaPips
 * rejects {X}/snow, and we additionally reject a hybrid cost (mana.hybrid.length) because the per-counter
 * scaling can't faithfully duplicate a hybrid pip's either/or option. An unmodeled cost → null → the synthesized
 * trigger routes LOW → the whole card stays body-only/Arbiter (SAFE FN). NEVER fabricates — this only recognizes
 * the sentinel string detectTriggers itself produces.
 */
export function matchCumulativeUpkeep(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  const m = s.match(/^cumulative upkeep\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / snow / unknown symbol → unmodeled cost
  if (Array.isArray(mana.hybrid) && mana.hybrid.length) return null; // a hybrid per-counter cost can't be faithfully scaled → SAFE FN
  return { atom: { op: "cumulative-upkeep", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== ECHO (BLITZ EC-1, CR 702.30) ===== the SENTINEL "echo {cost}" detectTriggers synthesizes off the
 * keyword (whose triggered ability — "At the beginning of your upkeep, if this came under your control since
 * the beginning of your most recent upkeep, sacrifice it unless you pay its echo cost." — lives entirely in
 * reminder parens, the cumulative-upkeep precedent). Maps to the single `echo` pausing atom: the resolver
 * fires the pay-or-sacrifice ONCE (the permanent's echoDone flag replaces the came-under-control-since
 * intervening-if — for a permanent that stays under one controller, "first of your upkeeps since it entered"
 * ⟺ "echoDone not yet stamped", exactly CR 702.30c's one-payment semantics) and every later upkeep no-ops.
 * A hybrid cost DOES pay faithfully here (no per-counter scaling — the fixed printed cost), but the shared
 * sac-unless-pay payer treats mana as fixed pips, so keep the SAME pure-cost gate as cumulative upkeep:
 * {X}/snow/hybrid → null → LOW → the whole card stays body-only (a SAFE FN). Only recognizes the sentinel
 * detectTriggers itself produces.
 */
export function matchEcho(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  const m = s.match(/^echo\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null;
  if (Array.isArray(mana.hybrid) && mana.hybrid.length) return null;
  return { atom: { op: "echo", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== TOLARIAN WINDS (BLITZ TW-1) ===== "Discard [all the cards in] your hand, then draw that many
 * cards." — the whole-hand cycle as ONE composite atom (hand.applyDiscardHandDrawSame). Matched up front
 * on the WHOLE stripped oracle (the ", then" span would be shattered by splitClauses, and the bare "draw
 * that many cards" tail would mis-bind to the combat-damage countContext — the exact latent gun this
 * composite disarms for the known wordings). Any extra line (flashback / retrace / a rider) breaks the
 * whole-oracle match → LOW → Arbiter (a safe FN).
 */
export function matchDiscardHandDrawSame(oracle) {
  const s = stripReminder(oracle).trim().replace(/\.$/, "");
  if (/^discard (?:all the cards in )?your hand, then draw that many cards$/i.test(s)) {
    return { atom: { op: "discard-hand-draw-same", targetType: null } };
  }
  return null;
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-draw, CR 603.7c) ===== the effect clause of a "Whenever an opponent casts a
 * spell, you may draw a card unless that player pays {N}." trigger (Rhystic Study; Mystic Remora's draw half). The
 * PAYER is the opponent who cast (bound at resolution from ctx.castingPlayerId, threaded by checkCastTriggers); the
 * BENEFICIARY is the trigger's controller (you). applyTaxedDraw suspends on the PAYER's pay-or-let-you-draw choice.
 * A FIXED mana cost only — "{X}, where X is this creature's power" (Esper Sentinel) → parseFixedManaPips null →
 * unmodeled (SAFE FN). The bare "draw a card unless …" (no "you may") maps to the same atom (the payer's choice IS
 * the "may").
 */
export function matchTaxedDraw(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  // ===== DYNAMIC TAX AMOUNT — "{X}, where X is this creature's power" (Esper Sentinel, rank 76) =====
  // The fixed-pip arm below cannot express this: the tax is whatever the SOURCE's power is when the ability
  // resolves, so a snapshot taken at parse time would be wrong the moment the creature grows (which is the
  // card's whole plan — an Esper Sentinel wearing a +1/+1 counter taxes {2}, not {1}).
  //
  // The amount rides as a `genericSpec` the resolver evaluates live through countForSpec — the SAME
  // `selfPower` metric the mana model uses, so the tax and the mana a power-scaled dork produces can never
  // disagree about what "this creature's power" means. A source that has left the battlefield reads 0,
  // which makes the tax free rather than fabricating a number (CREED).
  //
  // ⛔ SELF-REFERENCE ONLY, for the reason the metric itself is gated: "that creature's" / "the sacrificed
  // creature's" name a DIFFERENT object, and taxing the payer by an unrelated permanent's power would be a
  // number pulled from nowhere. Anchored on "this creature's" alone.
  // ⚠⚠ BOTH SPELLINGS, AND A LOST-CARD MEASUREMENT IS WHY (TP-1, 2026-08-05). These matchers keyed on the
  // LITERAL words "that player". The cast-trigger sentinel rewrite (detectTriggers) turns that anaphor into
  // "the casting player" on every cast trigger — which is exactly what these are — so the first cut of TP-1
  // measured **+11 GAINED / 4 LOST**: Rhystic Study, White Rhystic Study, Esper Sentinel and Mystic Remora
  // all fell out of native. Same referent, same ctx.castingPlayerId, different spelling.
  // ⛔ Accepting BOTH keeps ONE vocabulary rather than special-casing the rewrite: whichever form reaches
  // this matcher, the payer is the caster. Do not "simplify" this back to one alternative.
  const dyn = s.match(/^(?:you may )?draw a card unless (?:that player|the casting player) pays \{x\}, where x is this creature's power$/i);
  if (dyn) return { atom: { op: "taxed-draw", cost: { kind: "mana", genericSpec: { kind: "selfPower" } }, targetType: null } };

  const m = s.match(/^(?:you may )?draw a card unless (?:that player|the casting player) pays (\{[^}]+\}(?:\{[^}]+\})*)$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} (Esper Sentinel) / unknown symbol → unmodeled cost
  return { atom: { op: "taxed-draw", cost: { kind: "mana", mana }, targetType: null } };
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-treasure, CR 603.7c) ===== the effect clause of a "Whenever an opponent draws
 * a card, that player may pay {N}. If the player doesn't, you create a Treasure token." trigger (Smothering Tithe).
 * The PAYER is the opponent who drew (bound at resolution from ctx.drawingPlayerId, threaded by checkCardDrawnTriggers);
 * the BENEFICIARY is the trigger's controller (you) — on decline/can't-afford YOU create a functional Treasure token
 * (the minted Treasure carries "{T}, Sacrifice: Add one mana of any color", so the mana model can tap it). Mirrors
 * matchTaxedDraw exactly but with a create-Treasure decline-payoff instead of a draw. A FIXED mana cost only ({X} /
 * unknown symbol → parseFixedManaPips null → unmodeled, SAFE FN). Anchored to the WHOLE two-sentence effect; a scaled
 * ("that many Treasure tokens") or filtered variant leaves residue → null → the clause stays LOW → Arbiter.
 */
export function matchTaxedTreasure(oracle) {
  const s = stripReminder(oracle).trim().replace(/[’]/g, "'").replace(/\.$/, "");
  // ⚠️⚠️ BOTH SPELLINGS — SECOND TIME, SAME CAUSE, AND THAT MAKES IT A PATTERN RATHER THAN AN ACCIDENT.
  // The cardDrawn sentinel rewrite (detectTriggers, TP-3) renames "that player" to "the drawing player"
  // on exactly this event, and this matcher spelled the old name out — so Smothering Tithe fell out of
  // native the moment the arm landed. The identical thing happened one slice earlier to the Rhystic Study
  // family when the CAST arm landed (see the taxed-draw matcher above).
  // ⛔ **BEFORE ADDING ANY NEW SENTINEL ARM, GREP THE EVENT'S LITERAL "that player" READERS.** A rewrite is
  // a rename; every reader that spelled the old name out breaks silently, and the card just stops being
  // native with nothing pointing at the cause.
  const m = s.match(/^(?:that player|the drawing player) may pay (\{[^}]+\}(?:\{[^}]+\})*)\. if the player doesn't, you create a treasure token$/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseFixedManaPips(pips);
  if (!mana) return null; // {X} / unknown symbol → unmodeled cost
  return { atom: { op: "taxed-treasure", cost: { kind: "mana", mana }, targetType: null } };
}
// PUMP-THEN-FIGHT (Epic Confrontation / Ruthless Predation / Savage Smash / Swift Kick / Wild Instincts /
// Chelonian Tackle) — "Target creature you control gets +X/+Y until end of turn. [Then ]It fights [up to one ]
// target creature you don't control / an opponent controls." The chosen "target creature you control" is BOTH
// the pump recipient AND the fighter ("It" is anaphoric to it), and the enemy is the second chosen target. The
// two sentences shatter under the clause splitter: the standalone "It fights …" clause parses as a SOURCE-bound
// `fight` atom (fighter = ctx.sourceId), but a spell threads no sourceId → the fight silently no-ops — the exact
// case the fightAtomMisplaced gate deliberately forces LOW. Collapse it up front into ONE `fight-pair` atom
// (the same two-chosen-target shape as Prey Upon, so targeting enumerates the you-control fighter + enemy
// dealee) carrying `fighterPump {X,Y}`; applyFightPair applies the +X/+Y (until end of turn, CR 611.2c) to the
// chosen fighter BEFORE locking powers, so the pumped power deals more and the pumped toughness survives the
// return damage. HIGH iff the op is KNOWN (fight-pair is). A filtered ("green creature"), rider ("When excess
// damage …"), modal, or cost-prefixed variant fails the exact anchor → falls through → LOW → Arbiter (CREED).
export function matchPumpThenFight(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature you control gets \+(\d+|x)\/\+(\d+|x) until end of turn\. (?:then )?it fights (up to one )?target creature (?:you don't control|an opponent controls)$/);
  if (!m) return null;
  // X form (Primal Might — "+X/+X"): both pips must be X (a mixed +X/+3 isn't this template) → an X-spell whose
  // pump binds to the chosen X (ctx.xValue) at resolution, the same amountX lane applyPumpEffect already reads.
  const isX = m[1] === "x" || m[2] === "x";
  if (isX && !(m[1] === "x" && m[2] === "x")) return null;
  const upToOne = !!m[3];
  // Reuse the canonical fight-pair (form a) shape so the targeting roles/restrictions stay in sync, then attach
  // the fighter pump. Both enemy phrasings map to the same opponent restriction in form a.
  const fp = fightClauseParser(`target creature you control fights ${upToOne ? "up to one " : ""}target creature you don't control`);
  if (!fp || fp.op !== "fight-pair") return null;
  const fighterPump = isX ? { amountX: true } : { power: parseInt(m[1], 10), toughness: parseInt(m[2], 10) };
  return { atoms: [{ ...fp, fighterPump }], xSpell: isX };
}

// UNTAP-THEN-PUMP (Ornamental Courage / Inspirit / Gerrard's Command / Spidery Grasp / Aim High / Steady Aim) —
// "Untap target creature. It gets +X/+Y [and gains reach] until end of turn." The "It" is anaphoric to the
// untap's target, so the clause splitter would shatter it into [untap, <anaphoric pump>] where the pump clause
// alone parses LOW (no bound referent). But untap-then-pump on the SAME single creature is order-independent —
// a pump atom already carries an `untap:true` flag (applyPumpEffect untaps its target after the buff), so this
// collapses UP FRONT into ONE pump atom carrying that flag (identical to the shipped "…until end of turn. Untap
// it." reverse-order form). The reach rider maps to the grantable-keyword grant (reach is grant-verified — Vines
// of the Recluse). A different granted keyword, a second target, or any other rider fails the exact anchor →
// falls through → LOW → Arbiter (CREED). Not an X spell.
export function matchUntapThenPump(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^untap target creature\. it gets \+(\d+)\/\+(\d+)( and gains reach)? until end of turn$/);
  if (!m) return null;
  const atom = { op: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, untap: true };
  if (m[3]) atom.grantKeywords = ["Reach"];
  return { atoms: [atom] };
}

// TWO-TARGET PUMP/DEBUFF (Leeching Bite / Consume Strength / Schismotivate) — "Target creature gets +X/+Y until
// end of turn. Another target creature gets -A/-B until end of turn." Two DISTINCT chosen creatures; the two
// sentences shatter under the clause splitter (the second "Another target creature gets -A/-B" alone parses LOW
// — an unbound cross-atom "another" referent), so it's collapsed UP FRONT into ONE pump-pair atom mirroring the
// unrestricted fight-pair form (c): targetType "creature" (role "target" = the -debuff recipient) +
// secondaryTargetType "creature" (role "fighter" = the +buff recipient) + distinct:true (CR 601.2c). The AI
// two-target chooser (opponentAI) assigns fighter=OWN / target=ENEMY, so the buff lands on our board and the
// debuff on an opponent's — never friendly-fire. HIGH iff the op is KNOWN (pump-pair). Not an X spell.
export function matchTwoTargetPump(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature gets \+(\d+)\/\+(\d+) until end of turn\. another target creature gets -(\d+)\/-(\d+) until end of turn$/);
  if (!m) return null;
  return { atoms: [{
    op: "pump-pair", targetType: "creature", restrictions: [], role: "target",
    secondaryTargetType: "creature", secondaryRestrictions: [], secondaryRole: "fighter", distinct: true,
    buffDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, debuffDelta: { p: -parseInt(m[3], 10) || 0, t: -parseInt(m[4], 10) || 0 },
  }] };
}

// COUNTER-THEN-GRANT (Snakeskin Veil) — "Put a/two/three +1/+1 counter[s] on target creature [you control].
// [Then ]It gains <grantable keyword[s]> until end of turn." The "It" is anaphoric to the counter's target, so
// the two sentences shatter under the clause splitter (the bare "It gains …" has no bound referent → low).
// Collapsed UP FRONT into ONE add-counter atom carrying `grantKeywords` — applyAddCounter grants each keyword
// via a layer-6 endOfTurn continuous effect on the same targets (the applyPumpEffect grant shape, CR 613.1f).
// Keywords are ALL-OR-NOTHING via parseGrantedKeywords (an ungrantable keyword → null → low → Arbiter, CREED);
// any other rider, a second target, or a non-counter lead fails the exact anchor → falls through → low.
// DAMAGE-POWER-TRAMPLE-EXCESS (Ram Through — SHELF W2) — "Target creature you control deals damage equal to
// its power to target creature you don't control. If the creature you control has trample, excess damage is
// dealt to that creature's controller instead." The second sentence is a RIDER on the one-way fight (it
// rewrites where the damage lands, CR 615 prevention-adjacent redirect), so the clause splitter would leave it
// as unmatched residue → low. Collapsed up front into the existing damage-target-power atom + trampleExcess:
// applyDamageTargetPower assigns lethal to the dealee and routes the excess to its controller only when the
// dealer ACTUALLY has trample at resolution. Any other wording fails the exact anchor → low → Arbiter (CREED).
export function matchDamagePowerTrampleExcess(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target creature you control deals damage equal to its power to target creature you don't control\. if the creature you control has trample, excess damage is dealt to that creature's controller instead$/);
  if (!m) return null;
  return { atoms: [{
    op: "damage-target-power", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
    secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
    trampleExcess: true,
  }] };
}

// COUNTER-IF-LEGENDARY-THEN-FIGHT (Ancient Animus — SHELF W3) — "Put a +1/+1 counter on target creature you
// control if it's legendary. Then it fights target creature an opponent controls." The "it" chains BOTH
// sentences to the same chosen fighter, so the splitter shatters it (a conditional counter + an unbound
// anaphoric fight). Collapsed up front into ONE fight-pair atom carrying `fighterCounter` with
// onlyIfLegendary — applyFightPair places the persistent counter (fighter legendary at resolution) BEFORE
// locking powers, the exact fighterPump ordering. Any other wording → fails the anchor → low → Arbiter.
export function matchCounterIfLegendaryThenFight(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^put a \+1\/\+1 counter on target creature you control if it's legendary\. then it fights target creature (?:an opponent controls|you don't control)$/);
  if (!m) return null;
  const fp = fightClauseParser("target creature you control fights target creature you don't control");
  if (!fp || fp.op !== "fight-pair") return null;
  return { atoms: [{ ...fp, fighterCounter: { counterType: "+1/+1", amount: 1, onlyIfLegendary: true } }] };
}

// METALCRAFT-DAMAGE (Galvanic Blast, SHELF S7) — "<name> deals 2 damage to any target. Metalcraft — <name>
// deals 4 damage instead if you control three or more artifacts." The second sentence REWRITES the amount
// (CR 614 "instead"), so the splitter would leave it as residue → low. Collapsed into ONE deal-damage atom
// with amountUpgrade — resolveScaledAmount reads the artifact count at resolution. Self-names normalized
// to a generic subject; any other wording (a different base/upgraded pair, a different threshold or target)
// fails the exact anchor → low → Arbiter (CREED).
// RAD-OR-PROLIFERATE (Vexing Radgull, SHELF S7) — "that player gets two rad counters if they don't have any
// rad counters. Otherwise, proliferate." The "Otherwise" sentence is the branch's else-arm, so the sentence
// splitter shatters it (an unbound "Otherwise, proliferate" → low). Collapsed into ONE rad atom with
// ifNoRadElseProliferate — applyRad reads the damaged player's rad at resolution (rad when none, else a
// controller proliferate). The who:damagedPlayer referent keeps it gated to combat-damage events.
// DRAW-OR-COUNTER-TRIGGERING (Marcus, Mutant Mayor — SHELF S7) — "draw a card if that creature has a +1/+1
// counter on it. If it doesn't, put a +1/+1 counter on it." The if-else pair shatters under the sentence
// splitter. Collapsed into ONE branch atom whose resolver reads the TRIGGERING creature (the combat-damage
// dealer) at resolution; the routing gate keeps it on cdmg events only (a spell never supplies the referent).
export function matchDrawOrCounterTriggering(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^draw a card if that creature has a \+1\/\+1 counter on it\. if it doesn't, put a \+1\/\+1 counter on it$/.test(t)) return null;
  return { atoms: [{ op: "draw-or-counter-triggering", targetType: null }] };
}

export function matchRadOrProliferate(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(?:they|that player) gets? (a|an|one|two|three|four|five|\d+) rad counters? if they don't have any rad counters\. otherwise, proliferate$/);
  if (!m) return null;
  return { atoms: [{ op: "rad", who: "damagedPlayer", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), ifNoRadElseProliferate: true, targetType: null }] };
}

// UPKEEP DOUBLE-OR-RESET (Lily Bowen, Raging Grandma — SHELF S7) — "double the number of +1/+1 counters on
// this creature if its power is N or less. Otherwise, remove all but one +1/+1 counter from it, then you
// gain 1 life for each +1/+1 counter removed this way." (the self-name was normalized to "this creature"
// upstream by triggers.rewriteSelfNameToThisCreature, whole-clause gated). The if/otherwise pair shatters
// under the sentence splitter, so it's collapsed into ONE branch atom; the resolver reads the SOURCE's
// layer-aware power + its live +1/+1 count at resolution (the printed condition is a trailing effect
// condition, not an intervening-if — CR 608.2 evaluates it on resolution).
// FREE-CAST-OR-LAND (Kellan, the Kid — SHELF S7) — "you may cast a permanent spell with equal or lesser
// mana value from your hand without paying its mana cost. If you don't, you may put a land card from your
// hand onto the battlefield." The RELATIONAL cap ("equal or lesser" vs the TRIGGERING cast — the
// castNotFromHand watcher event) reads ctx.castSpellMv at resolution (stamped by checkCastTriggers); the
// else-arm rides the parked pendingFreeCast decision (decline → the optional land put) or fires directly on
// a whiff. Two sentences → shatters under the splitter → collapsed here into the ONE free-cast atom.
// TIMETWISTER WHEEL (Echo of Eons / Timetwister — SHELF Phase 2): "Each player shuffles their hand and
// graveyard into their library, then draws seven cards." The ", then" would shatter under the clause
// splitter, so it's collapsed here into ONE atom (per player: fold hand+GY into the library, ONE
// deterministic shuffle, draw 7 — see applyTimetwisterWheel). Exact printed sentence only.
export function matchTimetwisterWheel(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^each player shuffles their hand and graveyard into their library, then draws seven cards$/.test(t)) return null;
  return { atoms: [{ op: "timetwister-wheel", draw: 7, targetType: null }] };
}

// WINDS OF CHANGE (SHELF-TAIL — Nekusar's vein #2, the one wheel straggler) — "Each player shuffles the cards
// from their hand into their library, then draws THAT MANY cards." The HAND-ONLY twin of the Timetwister wheel:
// only the hand folds in (the graveyard stays put, unlike Echo of Eons), and the draw count is per-player "that
// many" = the number of cards THAT player just shuffled in from hand (not a fixed seven). One collapsed atom —
// the shuffle-in + variable draw-back is a single indivisible per-player effect (a sentence split would strand
// the "that many" back-reference). applyWindsOfChange captures each hand's size BEFORE the fold, so the draw is
// exact per seat. Whole-clause anchored → any rider leaves residue → LOW → Arbiter (a SAFE false-negative).
export function matchWindsOfChange(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^each player shuffles the cards from their hand into their library, then draws that many cards$/.test(t)) return null;
  return { atoms: [{ op: "winds-of-change", targetType: null }] };
}

// BLINK + SUBTYPE-COUNTER RIDER (SHELF-TAIL — Brago's flicker vein #4; Essence Flux) — "Exile target creature
// you control, then return that card to the battlefield under (your|its owner's) control. If it's a <subtype>,
// put a +1/+1 counter on it." The base self-blink already parses (zones.blinkClauseParser), but the trailing
// conditional counter on the RETURNED card ("it" = the new object, CR 400.7) is a second sentence the clause
// splitter strands → the whole spell parks. Collapsed here into the ONE blink atom the base form emits, plus
// an ifSubtypeCounter rider the resolver honors (checks the returned permanent's type line for the subtype).
// The subtype must be a real creature type (CR_CREATURE_TYPES) — a bogus word → null → LOW → Arbiter (SAFE FN,
// never a fabricated counter). Whole-oracle anchored; a rider beyond the counter clause leaves residue → null.
export function matchBlinkSubtypeCounter(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^exile target creature you control, then return (?:that card|it) to the battlefield under (your|its owner's) control\. if it's a ([a-z]+), put a \+1\/\+1 counter on it$/);
  if (!m) return null;
  if (!CR_CREATURE_TYPES.has(m[2])) return null; // the set is lowercase; not a real creature subtype → LOW → Arbiter (CREED)
  const subtype = m[2].charAt(0).toUpperCase() + m[2].slice(1); // Title-Case for the resolver's word-bound type-line check
  return { atoms: [{ op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: m[1] === "your" ? "controller" : "owner", ifSubtypeCounter: { subtype, counterType: "+1/+1", amount: 1 } }] };
}

// DELAYED-RETURN BLINK (SHELF-TAIL SH14 — Otherworldly Journey, Long Road Home; CR 400.7 + 603.7) — "Exile
// target creature. At the beginning of the next end step, return that card to the battlefield under its owner's
// control with a +1/+1 counter on it." A two-sentence SPELL: an immediate exile of ANY creature (a legal target
// on either side of the table) + a delayed return at the NEXT end step, the returned card gaining a +1/+1
// counter. ONE collapse atom — the delayed-blink applier exiles now and schedules the `[blink-return …]`
// sentinel (the general matchDelayedTrigger can't bind "that card" to the specific exiled card). Whole-oracle
// anchored; any variant (no counter, "you control", a different delay) → null → LOW → Arbiter (a SAFE FN).
export function matchDelayedBlink(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  // DELAY-FIRST + a +1/+1 counter (Otherworldly Journey, Long Road Home): "… At the beginning of the next end
  // step, return that card … with a +1/+1 counter on it."
  if (/^exile target creature\. at the beginning of the next end step, return that card to the battlefield under its owner's control with a \+1\/\+1 counter on it$/.test(t)) {
    return { atoms: [{ op: "delayed-blink", targetType: "creature", withCounter: true }] };
  }
  // DELAY-LAST, plain (Turn to Mist — a spell; Mistmeadow Witch — the cost-stripped effect of its activated
  // ability): "Exile target creature. Return that card … at the beginning of the next end step." No counter.
  // Owner return only ("under its owner's control") — a "your control" delayed spell isn't in the corpus, so
  // it stays LOW rather than guessing the controller (the immediate "your"-blink is Conjurer's Closet, already
  // native). The delayed-blink applier + [blink-return] sentinel (SH14) resolve both forms identically.
  // "that card" and "the exiled card" are the same referent (the just-exiled card); Voyager Staff's activated
  // ability uses the latter. Both admitted here so the single-creature delay-last form flips either phrasing.
  if (/^exile target creature\. return (?:that card|the exiled card) to the battlefield under its owner's control at the beginning of the next end step$/.test(t)) {
    return { atoms: [{ op: "delayed-blink", targetType: "creature", withCounter: false }] };
  }
  // MASS "any number of target creatures you control" (Eerie Interlude): the whole chosen set is exiled and
  // EACH returns at the next end step. applyDelayedBlink already loops ctx.targets (one [blink-return] sentinel
  // per card), so this is a targeting widen only — maxTargets 999 / minTargets 0 / anyNumber (the same fill the
  // graveyard "any number" arm uses), restricted to your own creatures. "their owner's" (plural) return.
  if (/^exile any number of target creatures you control\. return those cards to the battlefield under their owner's control at the beginning of the next end step$/.test(t)) {
    return { atoms: [{ op: "delayed-blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], withCounter: false, maxTargets: 999, minTargets: 0, anyNumber: true }] };
  }
  // NON-TARGETED MASS "each creature you control" (Ghostway): no targeting — applyDelayedBlink's eachYouControl
  // mode enumerates the controller's creatures at RESOLUTION and exiles+schedules each. A token exiled this way
  // ceases to exist (CR 111.7) so its scheduled return no-ops naturally (enterCardFromZone finds nothing) — the
  // classic Ghostway board-wipe dodge, faithful. "their owner's" return.
  if (/^exile each creature you control\. return those cards to the battlefield under their owner's control at the beginning of the next end step$/.test(t)) {
    return { atoms: [{ op: "delayed-blink", targetType: null, withCounter: false, eachYouControl: true }] };
  }
  return null;
}

// RAD-TARGET-OR-TREASURE (The Ghoul, Gunslinger — SHELF S7) — "target player gets two rad counters. If
// that player is you, create a Treasure token." A chosen-PLAYER rad (CR 115.1 — any player, self included)
// whose anaphoric second sentence rewards self-targeting with a Treasure. Collapsed into ONE rad atom with
// the treasureIfSelf rider (the sentence splitter would shatter the pair); applyRad's who:"target" branch
// mints the Treasure when the chosen player IS the controller. The flush-chooser intent for a chosen-player
// rad is "enemy" (rad is harmful; radding an opponent is always a legal, faithful play policy — the
// self-rad-for-Treasure line is a strategy refinement, never a correctness requirement).
export function matchRadTargetOrTreasure(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^target player gets (a|an|one|two|three|four|five|\d+) rad counters?\. if that player is you, create a treasure token$/);
  if (!m) return null;
  return { atoms: [{ op: "rad", who: "target", targetType: "player", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), treasureIfSelf: true }] };
}

export function matchFreeCastOrLand(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  if (!/^(?:you may )?cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost\. if you don't, you may put a land card from your hand onto the battlefield$/.test(t)) return null;
  return { atoms: [{ op: "free-cast", capFromCastMv: true, typeFilter: "permanent", elseLandFromHand: true, targetType: null }] };
}

// GY-OWNER-DRAIN (Bloodchief Ascension — SHELF S7): "you may have the graveyard's owner lose N life. if you
// do, you gain N2 life" — the SENTINEL "the graveyard's owner" is delivered ONLY by detectTriggers' gyEnter
// referent rewrite (a spell's / another event's anaphoric "that player" never reaches this matcher), and the
// who:"gyOwner" pin keeps the routing gate event-locked on top. ONE composite atom, optional:true — the
// yes/no covers the whole drain, so the reflexive "If you do" payoff is both-or-neither by construction
// (the sentence splitter would shatter the pair; collapsing mirrors matchRadTargetOrTreasure).
export function matchGyOwnerDrain(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^you may have the graveyard's owner lose (\d+) life\. if you do, you gain (\d+) life$/);
  if (!m) return null;
  return { atoms: [{ op: "gy-owner-drain", who: "gyOwner", lose: parseInt(m[1], 10), gain: parseInt(m[2], 10), optional: true, targetType: null }] };
}

export function matchDoubleOrResetCounters(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^double the number of \+1\/\+1 counters on this creature if its power is (\d+) or less\. otherwise, remove all but one \+1\/\+1 counter from it, then you gain 1 life for each \+1\/\+1 counter removed this way$/);
  if (!m) return null;
  return { atoms: [{ op: "double-or-reset-counters", powerThreshold: parseInt(m[1], 10), targetType: null }] };
}

export function matchMetalcraftDamage(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(.+?) deals (\d+) damage to any target\. metalcraft — \1 deals (\d+) damage instead if you control three or more artifacts$/);
  if (!m) return null;
  return { atoms: [{
    op: "deal-damage", amount: parseInt(m[2], 10), targetType: "any",
    amountUpgrade: { kind: "artifactsYouControl", atLeast: 3, amount: parseInt(m[3], 10) },
  }] };
}

// INSTEAD-AMOUNT (BLITZ INST-1, CR 608.2 + 614 "instead") — the condition-gated ability-word amount upgrade,
// generalizing matchMetalcraftDamage beyond Metalcraft/artifacts to the wider "<base>. <Ability-word> —
// <upgraded amount> instead if <condition>" family (Brimstone Volley's Morbid burn, Cackling Flames's Hellbent
// burn, Firecannon Blast's Raid burn, Feed the Clan's Ferocious life, Hunger of the Howlpack's Morbid counter,
// Mirran Mettle's Metalcraft pump, Tragic Slip's Morbid debuff). The second sentence REWRITES the amount
// (CR 614 "instead"), so the sentence splitter would leave it as residue → low; collapsed into ONE atom
// carrying `amountUpgrade` (a scalar amount read via the SHARED resolveScaledAmount) or `ptUpgrade` (the P/T
// pair read in applyPumpEffect). Both readers evaluate the board condition at RESOLUTION (evaluateInterveningIf,
// CR 608.2) and swap to the upgraded amount ONLY when it holds — the base amount otherwise (false-negative safe).
//
// The condition is gated on a CURATED ability-word → canonical-condition map AND spellConditionParseable: the
// ability word is a designer LABEL, but the real guard is that the printed condition equals its word's exact,
// reader-verified board query. This is what keeps the graveyard-count mis-reader out — Threshold ("seven or
// more cards in your graveyard": no type word → unparseable) and Descend ("N or more permanent cards …": the
// `\bPermanent\b` type-line scan reads 0 forever, a mis-reader) are NOT in the map, so Cabal Ritual / Join the
// Dead / Kirtar's Wrath PARK (whole-card law). Both amounts are fixed numerals; a reworded upgrade (Arrow
// Storm's added "damage can't be prevented"), an X amount (Crater's Claws "X plus 2"), a non-self-name burn, or
// the leading-"If … instead" form all fail the exact anchors → low → Arbiter (CREED).
const INSTEAD_ABILITY_WORD_CONDITION = {
  metalcraft: "you control three or more artifacts",
  morbid: "a creature died this turn",
  hellbent: "you have no cards in hand",
  raid: "you attacked this turn",
  ferocious: "you control a creature with power 4 or greater",
};
// Accept a printed condition ONLY when it is the ability word's exact canonical query (CLOSED vocabulary) AND
// the resolver can actually read it (spellConditionParseable — the metric⇄runtime shared gate); else null → park.
function insteadCondition(word, cond) {
  const canon = INSTEAD_ABILITY_WORD_CONDITION[word];
  return canon && cond === canon && spellConditionParseable(cond) ? cond : null;
}
export function matchInsteadAmountUpgrade(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  // Family 1 — self-name BURN (deal-damage). Galvanic Blast is caught by matchMetalcraftDamage first (its exact
  // {kind:"artifactsYouControl"} shape preserved); this catches Brimstone Volley / Cackling Flames / Firecannon Blast.
  let m = t.match(/^(.+?) deals (\d+) damage (to any target|to target creature)\. ([a-z][a-z ]*?) — \1 deals (\d+) damage instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[4], m[6]);
    if (!cond) return null;
    return { atoms: [{ op: "deal-damage", amount: parseInt(m[2], 10), targetType: m[3] === "to any target" ? "any" : "creature", amountUpgrade: { condition: cond, amount: parseInt(m[5], 10) } }] };
  }
  // Family 2 — GAIN-LIFE (Feed the Clan): "you gain N life. <word> — you gain M life instead if <cond>".
  m = t.match(/^you gain (\d+) life\. ([a-z][a-z ]*?) — you gain (\d+) life instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[2], m[4]);
    if (!cond) return null;
    return { atoms: [{ op: "gain-life", amount: parseInt(m[1], 10), targetType: null, amountUpgrade: { condition: cond, amount: parseInt(m[3], 10) } }] };
  }
  // Family 3 — ADD-COUNTER (+1/+1 on the SINGLE target creature; the upgrade's "that creature" is the same
  // chosen target — one atom, one target): Hunger of the Howlpack "put a … Morbid — put three … on that creature".
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on target creature\. ([a-z][a-z ]*?) — put (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on that creature instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[2], m[4]);
    if (!cond) return null;
    return { atoms: [{ op: "add-counter", counterType: "+1/+1", amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature", amountUpgrade: { condition: cond, amount: SMALL_NUM[m[3]] ?? parseInt(m[3], 10) } }] };
  }
  // Family 4 — PUMP (single target creature, SIGNED P/T): Mirran Mettle "+2/+2 … Metalcraft — +4/+4 instead",
  // Tragic Slip "-1/-1 … Morbid — -13/-13 instead". ptUpgrade swaps the whole P/T pair at resolution.
  m = t.match(/^target creature gets ([+-]\d+)\/([+-]\d+) until end of turn\. ([a-z][a-z ]*?) — that creature gets ([+-]\d+)\/([+-]\d+) until end of turn instead if (.+)$/);
  if (m) {
    const cond = insteadCondition(m[3], m[6]);
    if (!cond) return null;
    return { atoms: [{ op: "pump", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, targetType: "creature", duration: "endOfTurn", ptUpgrade: { condition: cond, ptDelta: { p: parseInt(m[4], 10), t: parseInt(m[5], 10) } } }] };
  }
  return null;
}

// SELF-HIT DAMAGE (BLITZ OA-1 — the Orcish Artillery pinger frame): "<source> deals N damage to any
// target and M damage to you." ONE deal-damage atom carrying the printed self-hit as `selfDamage` —
// the resolver deals the target damage, then M to the CONTROLLER through the SAME applyDamageEffect
// (so replacements / lifegain-from-loss / infect interactions are identical to any burn). Collapsed
// up front: the clause's internal " and " would be shattered by splitClauses into an unparseable
// fragment. The `$` anchor rejects any further rider (FN-safe). Both numbers are mandatory — a
// variable ("that much") or scaled form never matches.
export function matchSelfHitDamage(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^(.+?) deals (\d+) damage to any target and (\d+) damage to you$/);
  if (!m) return null;
  return { atoms: [{ op: "deal-damage", amount: parseInt(m[2], 10), targetType: "any", selfDamage: parseInt(m[3], 10) }] };
}

/**
 * ===== SPRINGHEART NANTUKO (the last card on Colton's shelf) ===== the landfall rider:
 *   "you may pay {1}{G} if this permanent is attached to a creature you control. If you do, create a token
 *    that's a copy of that creature. If you didn't create a token this way, create a 1/1 green Insect
 *    creature token."
 *
 * ⛔ MATCHED AS ONE WHOLE CLAUSE, AND DELIBERATELY NOT GENERALISED. Three sentences that mean one thing, and
 * every piece is ambiguous on its own:
 *   - "that creature" is the ATTACHED host here; on almost every other card it means something else. A
 *     general "that creature → attached" referent would mis-copy across the corpus, so the referent is only
 *     reachable through this anchored shape.
 *   - the fallback is not a third effect: it is the ELSE of the payment. Split off, a card could make BOTH
 *     tokens.
 * The clause splitter shatters all three, so it is collapsed here — the matchDiesGainDrawByPower pattern.
 *
 * The atom is the ordinary optional-mana-payment plus the two fields the settler understands: `condition`
 * (unpayable unless attached to a creature you control) and `elseAtoms` (the Insect, run when the payment is
 * not made — declined OR impossible). Exactly one token on every path.
 */
export function matchSpringheartLandfall(oracle) {
  const s = stripReminder(oracle).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "");
  if (!/^you may pay \{1\}\{g\} if this permanent is attached to a creature you control\. if you do, create a token that's a copy of that creature\. if you didn't create a token this way, create a 1\/1 green insect creature token$/.test(s)) return null;
  return { atom: {
    op: "optional-mana-payment",
    cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, hybrid: [] } },
    // ⚠️ payCondition, NOT `condition`. runEffectProgram already owns `condition` on an atom: it is a SPELL
    // RIDER board query run through evaluateInterveningIf, and an atom whose condition that reader cannot
    // parse is SKIPPED ENTIRELY. Naming this field `condition` made the whole payment silently vanish —
    // no pause, no tokens, no error, an empty log — and cost a revert on a misdiagnosis.
    payCondition: "attachedToCreatureYouControl",
    effectAtoms: [{ op: "create-token-copy", copySource: "attached", count: 1, targetType: null }],
    elseAtoms: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "green insect", targetType: null }],
    targetType: null,
  } };
}

export function matchCounterThenGrant(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\.\s*$/, "");
  const m = t.match(/^put (a|two|three) \+1\/\+1 counters? on target creature( you control)?\. (?:then )?it gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[3]);
    if (!kws) return null;
    return { atoms: [{
      op: "add-counter", counterType: "+1/+1", amount: m[1] === "a" ? 1 : SMALL_NUM[m[1]],
      targetType: "creature", ...(m[2] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}),
      grantKeywords: kws,
    }] };
  }
  // MASS form (Vault 12 chapter I — SAGA, SHELF S7): "Put a +1/+1 counter on EACH creature you control.
  // They gain <keywords> until end of turn." The anaphoric "They" is the same resolution-time set —
  // applyAddCounter expands scope:"youControl" via controllerCreatureTargets (atomTargets) and its
  // grantKeywords loop rides the IDENTICAL `targets` array, so the counter recipients and the keyword
  // recipients cannot diverge. Keywords stay all-or-nothing via parseGrantedKeywords (CREED).
  const mm = t.match(/^put (a|two|three) \+1\/\+1 counters? on each creature you control\. (?:then )?they gain (.+) until end of turn$/);
  if (mm) {
    const kws = parseGrantedKeywords(mm[2]);
    if (!kws) return null;
    return { atoms: [{
      op: "add-counter", counterType: "+1/+1", amount: mm[1] === "a" ? 1 : SMALL_NUM[mm[1]],
      scope: "youControl",
      grantKeywords: kws,
    }] };
  }
  return null;
}
