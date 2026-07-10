/**
 * effects/atoms/library.js — library-manipulation atoms (tutor, shuffle, scry, surveil, impulse-dig,
 * discover, mill).
 */

import { logEvent, opponentsOf, findPermanent, shuffleLibrary, millCards, applyImpulseDig, creatureToughness, addCounter, untapPermanent, moveCardToZone } from "../../gameState.js";
import { setPendingTutorChoice, setPendingScryChoice, setPendingImpulseDigChoice, setPendingDigLandChoice } from "../../pendingChoice.js";
import { countForSpec, isLandCard, isCreatureCard, isInstantOrSorceryCard, resolveScaledAmount } from "./shared.js";
import { NUM_WORD, parseTutorFilter, parseTutorMv, BASIC_LAND_SUBTYPES, UP_TO_N_WORD, parseCountSource, TUTOR_COLOR_WORD } from "../parseHelpers.js"; // seam batch 11 (NUM_WORD) + 12b/12d (tutor helpers leaf) — cycle-free shared parse helpers; TUTOR_COLOR_WORD for the color-qualified X-tutor (Green Sun's Zenith)
// MILL-ON-EVENT (Wave 3b): the mill atom is one of the two real mill chokepoints, so it enqueues the
// "milled" trigger bind. checkDiesTriggers is imported by sibling atoms (counters/combat/manifest) without
// a cycle, so importing checkMilledTriggers from the same leaf triggers.js module is equally safe (the
// atoms barrel must NOT import effects/parser.js — that's the TDZ hazard; triggers.js is fine).
import { checkMilledTriggers } from "../../triggers.js";
// GENESIS-WAVE — the mass reveal-top-X → put-permanents-onto-battlefield atom reuses the shared
// enterCardFromZone helper (fires ETB / landfall / permanent-enters exactly like reanimation + library ramp),
// so a Genesis-Wave-put permanent behaves identically to a Wargate/reanimate entry. library.js → zones.js is a
// ONE-WAY atom-module edge (zones.js does NOT import library.js), so it's cycle-free — the atoms barrel must
// not be imported here (that would TDZ-cycle, since the barrel imports library.js). Direct sibling import only.
import { enterCardFromZone } from "./zones.js";
// Router v2 "draw" route — the SAME applyDrawEffect edge misc.js's draw atom rides (count bump + draw
// watchers), so the router's real-draw semantics can't drift from the draw atom's.
import { applyDrawEffect } from "../../spellEffects.js";

/**
 * P3.2 tutor (CR 701.19) — search the caster's library for a card matching the modeled
 * type filter, put it into their hand, then shuffle. The filter (`atom.filter.groups`,
 * parsed + allowlisted by the parser) matches a library card when ANY group's words ALL
 * appear in the card's type line (so "instant or sorcery" → 2 groups; "basic land" → 1).
 *
 * v1 conservatism + "never wrong": the ENGINE auto-picks (the deepest cleanly-modelable
 * point — there's no resolution-time choice mechanism), choosing the highest-mana-value
 * match (deterministic tie-break) so the fetch is a sensible, LEGAL card. Interactive
 * tutor choice is a future enhancement. Hidden-info safe: the log records the FILTER and
 * whether a card was found, NEVER the card's name (an opponent's tutor stays hidden). A
 * "you may"/mandatory search that finds nothing (no match, CR 701.19f) is a logged no-op
 * + shuffle, never an error.
 */
export function tutorManaValue(card) {
  if (typeof card?.cmc === "number") return card.cmc;
  if (typeof card?.mana_value === "number") return card.mana_value;
  let mv = 0;
  for (const sym of String(card?.mana || card?.mana_cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) mv += 0;
    else {
      // A 2-generic hybrid pip like {2/W} has mana value 2 (CR 202.3f — the largest
      // component); a colored / colored-hybrid / phyrexian pip is 1.
      const lead = s.match(/^(\d+)/);
      mv += lead ? parseInt(lead[1], 10) : 1;
    }
  }
  return mv;
}
/** Does a library card match a tutor's filter? A null filter (unfiltered "a card") matches ALL.
 *
 * WAVE-2b TUTOR — a filter can additionally carry an MV constraint (`filter.mv`: {max:N} for
 * Spellseeker's "mana value 2 or less", {exact:N} for Trophy Mage's "mana value 3"). The MV gate is
 * applied UPSTREAM here, so applyTutor's candidate list (and therefore autoPickTutorCandidate's pool,
 * which reads only those candidates) is already MV-filtered — never just narrowed in the picker. Both
 * the TYPE groups (if any) AND the MV cap must hold. An empty groups list (`{ groups: [], mv }`) is a
 * type-unfiltered, MV-only filter ("a card with mana value 3"): every type matches, the MV gate decides.
 *
 * PUT-FROM-HAND — a filter can ALSO carry a COLOR constraint (`filter.colors`: e.g. ["green"] for Dramatic
 * Entrance's "a green creature card", ["nonwhite"] for a negated color). The gate reads the card's enriched
 * `colors` array (cardIndex stamps it on every real card; CR 105 / 202.2). A `green` color requires the card
 * to BE that color; `nonwhite` requires the card NOT be that color. A card lacking a `colors` array fails a
 * positive color gate (FN-safe — never a fabricated match; the rare un-enriched stub stays out of the pool). */
export function cardMatchesTutorFilter(card, filter) {
  if (!filter) return true;
  // MV gate first (cheap, and applies even when there are no type groups). tutorManaValue reads the
  // card's cmc/mana_value/mana_cost — the same MV the discover/auto-pick paths use, so it's consistent.
  if (filter.mv) {
    const mv = tutorManaValue(card);
    if (typeof filter.mv.max === "number" && mv > filter.mv.max) return false;
    if (typeof filter.mv.exact === "number" && mv !== filter.mv.exact) return false;
  }
  // COLOR gate (PUT-FROM-HAND) — applied upstream like MV so applyTutor's candidate pool is already
  // color-filtered. Each entry is a single-color word ("green") or its negation ("nonwhite"). A positive
  // word requires membership in the card's colors; a "non<color>" requires absence. ALL listed constraints
  // must hold (currently only a single color is ever produced; the loop keeps it future-proof).
  if (Array.isArray(filter.colors) && filter.colors.length) {
    const COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
    const cardColors = Array.isArray(card?.colors) ? card.colors : null;
    for (const spec of filter.colors) {
      const neg = spec.startsWith("non");
      const colorWord = neg ? spec.slice(3) : spec;
      const letter = COLOR_LETTER[colorWord];
      if (!letter) return false; // an unknown color word never matches (defensive; the parser only emits the five)
      const has = cardColors ? cardColors.includes(letter) : false; // no colors array → treat as not-that-color
      if (neg) {
        if (has) return false; // "nonwhite" excludes a white card
      } else {
        if (!has) return false; // "green" requires the card be green (a colorless / un-enriched card fails — FN-safe)
      }
    }
  }
  // PERMANENT-CARD gate (bfx — Wargate "a permanent card with mana value X or less"): a "permanent card" is
  // any card whose FRONT face is a permanent type (CR 110.4a — artifact / creature / enchantment / land /
  // planeswalker / battle), i.e. NOT an instant or sorcery. We require a POSITIVE permanent-type match (not
  // merely "not instant/sorcery") so any non-permanent card type stays out of the pool (FN-safe — never a
  // fabricated match). The front-face split mirrors the groups gate below (an MDFC matches on its front type).
  if (filter.permanentOnly) {
    const frontType = String(card?.type || card?.type_line || "").toLowerCase().split(" // ")[0];
    const isPermanentType = /\b(?:artifact|creature|enchantment|land|planeswalker|battle)\b/.test(frontType);
    if (!isPermanentType) return false;
  }
  const groups = Array.isArray(filter.groups) ? filter.groups : [];
  if (groups.length === 0) return true; // type-unfiltered (null filter handled above; MV-only / permanentOnly fall here)
  // Match the FRONT face only: a library card has just its front-face characteristics
  // (CR 712.4a), but the enriched type line is the COMBINED "Front // Back" for an MDFC —
  // so a [artifact] tutor must NOT match a card whose FRONT is a land and back an artifact.
  const type = String(card?.type || card?.type_line || "").toLowerCase().split(" // ")[0];
  return groups.some((group) => group.every((w) => new RegExp(`\\b${w}\\b`).test(type)));
}
/** A deterministic PRNG (mulberry32) so the shuffle is serialize-stable (no Math.random). */
function deterministicRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Shuffle a player's library deterministically (CR 701.19e / 103.2) using the seed
 * THREADED through state (`state.rngSeed`), then advance it (an LCG step) so the next
 * shuffle differs AND a serialized game restores to byte-identical future shuffles. No
 * Math.random anywhere in game-state mutation.
 */
export function shuffleControllerLibrary(state, controller) {
  if (!state.players[controller]) return state;
  const seed = (state.rngSeed ?? 0) >>> 0;
  const shuffled = shuffleLibrary(state, { playerId: controller, rng: deterministicRng(seed) });
  return { ...shuffled, rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0) };
}
/**
 * Tutor (CR 701.19) — flag a resolution-time CHOICE rather than auto-picking. Gathers the
 * caster's legal library cards (matching the filter; a null filter = "search for a card" =
 * every card) and sets `state.pendingChoice`; runProgram pauses the effect program here.
 * The driver surfaces a picker (the player's own tutor, beginner/intermediate) or auto-
 * picks (Expert autopilot / an opponent); the fetch + shuffle happen in resolveTutorChoice.
 * Hidden-info safe: the candidate list is the searcher's OWN library (names are theirs to see).
 */
export function applyTutor(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  // LAND-FROM-HAND — `sourceZone:"hand"` gathers candidates from the HAND instead of the library (Growth
  // Spiral); every other tutor searches the library (the default). The choice/picker/auto-pick are identical.
  // MULTI-ZONE (bfxg — Finale's "library and/or graveyard") — `sourceZones` is the UNION of zones the search
  // draws from; each candidate is tagged with the zone it lives in so resolveTutorChoice enters it from the
  // right zone. A single `sourceZone` is the degenerate 1-element case; when `sourceZones` is present it wins.
  const sourceZones = Array.isArray(atom.sourceZones) && atom.sourceZones.length
    ? atom.sourceZones.map((z) => (z === "hand" ? "hand" : z === "graveyard" ? "graveyard" : "library"))
    : null;
  const sourceZone = atom.sourceZone === "hand" ? "hand" : "library";
  // SEARCH→BATTLEFIELD MV-CAPPED-BY-X (bfx) — a `mvCapX` filter resolves its MV cap from the CHOSEN X at
  // resolution (Wargate / Nature's Rhythm "mana value X or less", X bound at cast per CR 601.2b / 202.3b).
  // `?? 0` (not `|| 0`) so an explicit X=0 caps at 0 (fetch only MV-0 — a legal, conservative search), and a
  // missing xValue (never happens for an xSpell, but defensive) is treated as 0, never as "uncapped" — the
  // cardinal CREED guarantee that the cap is never silently dropped. The resolved filter (with a concrete
  // `mv:{max}`) is used for BOTH the candidate pre-filter AND threaded into the pendingChoice so the auto-pick's
  // defensive re-gate and any chained pick keep the same cap.
  const effFilter = atom.filter?.mvCapX
    ? { ...atom.filter, mv: { max: Math.max(0, ctx.xValue ?? 0) } }
    : atom.filter;
  // RAMP-MULTI-X — resolve the dynamic fetch cardinality (Traverse the Outlands / Boundless Realms) ONCE from
  // the board source. Math.max(0, …) clamps an empty/zero board to 0 (never a fabricated count). When the count
  // is 0 ("search for up to 0 cards" — e.g. Traverse with no creatures), the search fetches NOTHING: a logged
  // no-op + a shuffle (CR 701.19e — you still searched, so a library search shuffles), NEVER coerced up to 1
  // by setPendingTutorChoice's Math.max(1, …) RAMP guard. A static-`remaining` / non-countFor tutor is
  // untouched (this branch is countFor-only).
  const dynCount = atom.countFor ? Math.max(0, countForSpec(state, ctx, atom.countFor)) : null;
  // A library search always shuffles afterward (CR 701.19e); a multi-zone search that includes the library
  // (bfxg) shuffles too. A from-hand / graveyard-only search never touches the library.
  const searchesLibrary = sourceZones ? sourceZones.includes("library") : sourceZone === "library";
  if (dynCount === 0) {
    const shuffled = searchesLibrary ? shuffleControllerLibrary(state, controller) : state;
    return logEvent(shuffled, { kind: "spell-effect", effect: "tutor", found: false, destination: atom.destination || "hand", controller });
  }
  // Gather candidates. MULTI-ZONE (bfxg) — pull from every source zone, tagging each with its zone so the
  // resolver moves the chosen card from the correct place. Single-zone tutors keep the original untagged shape
  // (the resolver falls back to `pc.sourceZone` when a candidate carries no `zone`), so no existing card drifts.
  const candidates = sourceZones
    ? sourceZones.flatMap((zone) => (player[zone] || [])
        .filter((c) => cardMatchesTutorFilter(c, effFilter))
        .map((c) => ({ id: c.id, name: c.name, zone })))
    : (player[sourceZone] || [])
        .filter((c) => cardMatchesTutorFilter(c, effFilter))
        .map((c) => ({ id: c.id, name: c.name }));
  return setPendingTutorChoice(state, {
    controller,
    candidates,
    sourceZone,
    sourceZones,
    sourceName: ctx.cardName || null,
    filterLabel: atom.filterLabel || null,
    // WAVE-2b TUTOR — thread the structured filter so the auto-pick can defensively re-apply the type/MV gate.
    // bfx — thread the RESOLVED filter (concrete mv:{max} from the chosen X), not the symbolic mvCapX one, so
    // the auto-pick's defensive re-gate and chained picks use the same concrete cap (never re-reads xValue).
    filter: effFilter || null,
    // RAMP-1 — destination "battlefield" (+ entersTapped) puts the fetched card onto the battlefield instead
    // of the hand (Rampant Growth / Farhaven Elf). WAVE-2b FETCH-TO-TOP adds "top" (shuffle-then-place-on-top
    // — Vampiric/Mystical Tutor). Defaults to "hand" (the P3.2 tutor); setPendingTutorChoice coerces.
    destination: atom.destination === "battlefield" ? "battlefield" : atom.destination === "top" ? "top" : "hand",
    entersTapped: !!atom.entersTapped,
    // RAMP-MULTI — "up to two": fetch up to `remaining` matching lands (resolveTutorChoice chains the rest).
    // RAMP-MULTI-X — `countFor` resolves the fetch cardinality (computed above as dynCount; a 0 short-circuits
    // to the no-op return before this point, so here dynCount is ≥1). A static `remaining` wins when present;
    // otherwise the dynamic count; otherwise the default 1.
    remaining: dynCount ?? (atom.remaining ?? 1),
    // RAMP-SPLIT (Cultivate / Kodama's Reach) — an ordered per-fetch destination sequence; setPendingTutorChoice
    // derives this pick's destination from its head and carries the tail to the next chained fetch.
    destinations: Array.isArray(atom.destinations) ? atom.destinations : null,
    // AI-F10 — may the searcher legally fail to find? A search WITH a stated quality (any
    // structured filter — type group / MV cap / color) may fail (CR 701.23b); a quantity-only
    // unfiltered search ("search your library for a card" — effFilter null) MUST find when a
    // candidate exists (CR 701.23d), so its find-nothing option is dropped from the offer.
    // `atom.optional` rides along defensively, but by the time applyTutor runs, the α2
    // optional-effect wrapper has already consumed + stripped the "you may" (runProgram pauses
    // the optional atom for its yes/no first and re-runs it with optional:false) — and having
    // CHOSEN to search, the find requirement is the filter's alone, which is exactly what this
    // predicate encodes. (The design sketch also keyed on filterLabel, but the unfiltered tutor
    // atom carries filterLabel "card" — using it would re-open the very hole being closed.)
    mayFailToFind: Boolean(atom.optional || effFilter),
  });
}

/**
 * Scry / surveil (CR 701.22 / 701.25) — flag a resolution-time CHOICE: peek the top N of the
 * controller's library and set state.pendingChoice (runProgram pauses the program here, like a
 * tutor). The driver surfaces a keep/move picker (the player) or auto-keeps-all (Expert/opponent);
 * resolveScryChoice (runProgram) applies the reorder + resumes. An empty library is a logged no-op.
 * Hidden-info safe: it's the searcher's OWN library, so the candidate names are theirs to see.
 */
export function applyScrySurveilAtom(state, atom, ctx, mode) {
  const player = state.players[ctx.controller];
  if (!player) return state;
  // CONDITIONAL SURVEIL (S6/Kellan — Plan the Heist: "Surveil 3 if you have no cards in hand."):
  // a deterministic state read at resolution — with cards in hand the surveil part simply does
  // not happen; the program's following atoms (the "Then draw…" clause) still resolve. Skipping
  // IS the correct rules behavior, not a silent no-op.
  if (atom.onlyIfHandEmpty && (player.hand || []).length > 0) {
    return logEvent(state, { kind: "spell-effect", effect: mode, controller: ctx.controller, count: 0, conditionNotMet: "hand-not-empty" });
  }
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: mode, controller: ctx.controller, count: 0 });
  }
  const cards = player.library.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  return setPendingScryChoice(state, { controller: ctx.controller, mode, cards, sourceName: ctx.cardName || null });
}

/**
 * ===== REORDER-TOP (Ponder / Serum Visions-adjacent "any order" dig) ===== "Look at the top N cards of your
 * library, then put them back in any order. [You may shuffle.]" (Ponder — N=3, with an optional shuffle;
 * CR 701.18 look + a within-library reorder + an optional CR 103.2 shuffle). A DISTINCT effect from scry: NONE
 * of the looked-at cards leave the top — the WHOLE set is put BACK on top in a player-chosen order (scry can
 * bottom some; reorder never does). Reuses the existing scry-surveil pending choice (the same top-N reorder +
 * pause→resume seam) narrowed to reorder mode via `reorder:true` — every looked-at card is kept on top, so the
 * settle's "moved → bottom" partition is empty and a pure reorder results. `mayShuffle` carries Ponder's
 * OPTIONAL post-reorder shuffle onto the choice so resolveScryChoice can honor it (a human may shuffle; the
 * deterministic/auto line declines — you don't shuffle away a deliberate ordering, so declining is the strictly
 * stronger legal play, never a dropped clause). An EMPTY library is a logged no-op. Hidden-info safe (the
 * controller's own library). Pausing (sets pendingChoice), so `reorder-top` is registered in PAUSING_ATOM_OPS.
 */
export function applyReorderTopAtom(state, atom, ctx) {
  const player = state.players[ctx.controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "reorder-top", controller: ctx.controller, count: 0 });
  }
  const cards = player.library.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  return setPendingScryChoice(state, { controller: ctx.controller, mode: "scry", cards, sourceName: ctx.cardName || null, reorder: true, mayShuffle: !!atom.mayShuffle });
}

/**
 * Impulse-dig (δ-2 — Anticipate / Strategic Planning / Impulse) — flag a resolution-time
 * CHOICE: peek the top N of the controller's library and set state.pendingChoice (runProgram pauses,
 * like scry/tutor). The driver surfaces a pick-one picker (the player) or auto-picks the best card
 * (Expert/opponent); resolveImpulseDigChoice (runProgram) moves the chosen card to HAND and the rest to
 * the `restTo` zone (bottom / graveyard), then resumes. An empty library is a logged no-op. Hidden-info
 * safe: it's the controller's OWN library, so the candidate names are theirs to see.
 */
export function applyImpulseDigAtom(state, atom, ctx) {
  const player = state.players[ctx.controller];
  if (!player) return state;
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "impulse-dig", controller: ctx.controller, count: 0 });
  }
  const top = player.library.slice(0, n);
  // DIG-1 — FILTERED reveal-dig ("you may reveal a <type> card …"): only TYPE-MATCHING cards are keepable
  // to hand; the rest (incl. non-matching) go to `restTo`. An unfiltered dig keeps the whole looked-at set
  // as candidates (the legacy δ-2 path).
  const pool = atom.filter ? top.filter((c) => cardMatchesTutorFilter(c, atom.filter)) : top;
  if (pool.length === 0) {
    // Looked at N, nothing matching to reveal → the whole set goes to the bottom (a clean reveal-nothing,
    // no picker — chosenId null disposes all of the top N). Only reachable on the filtered reveal-dig path.
    const next = applyImpulseDig(state, { playerId: ctx.controller, n, chosenId: null, restTo: atom.restTo || "bottom" });
    return logEvent(next, { kind: "spell-effect", effect: "impulse-dig", controller: ctx.controller, count: n, kept: 0 });
  }
  const cards = pool.map((c) => ({ id: c.id, name: c.name }));
  return setPendingImpulseDigChoice(state, { controller: ctx.controller, candidates: cards, restTo: atom.restTo || "bottom", sourceName: ctx.cardName || null });
}

/**
 * DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2) — "Look at the top N cards of your library. You may put
 * a land card from among them onto the battlefield [tapped]. Put the rest on the bottom of your library in a
 * random order." A DIFFERENT effect from impulse-dig: the chosen LAND enters the BATTLEFIELD (firing its ETB,
 * resolveDigLandChoice handles the enter + bottom), while the REST of the looked-at set (non-chosen lands +
 * every nonland card) go to the bottom of the library in a RANDOM order (CR 701.19e-style deterministic shuffle
 * of just those cards). At RESOLUTION this atom peeks the top N, gathers the LAND cards as the puttable
 * candidates (the "you may put a LAND card" gate — nonland cards are never puttable), and either:
 *   - NO land in the top N → no put; bottom the WHOLE looked-at set in a random order inline (a clean no-pause
 *     no-op-put — you looked, there was no land to put, so everything goes under). Never fabricated.
 *   - ≥1 land → set the pending dig-land choice (candidates = the lands; restIds = the full top-N id list) so
 *     the controller picks which land to put out; the driver pauses a human / auto-picks the best land for AI.
 * An empty library is a logged no-op. Hidden-info safe (the controller's own library). Pure (the random bottom
 * uses the threaded rngSeed, advanced like discover/cascade, so a serialized game restores byte-identical).
 */
export function applyDigLandToBattlefieldAtom(state, atom, ctx) {
  const player = state.players[ctx.controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "dig-land-to-battlefield", controller: ctx.controller, count: 0, put: false });
  }
  const top = player.library.slice(0, n);
  const lands = top.filter((c) => isLandCard(c));
  if (lands.length === 0) {
    // Looked at N, no land to put → the whole looked-at set goes to the bottom in a random order (no pause).
    const next = bottomTopNInRandomOrder(state, ctx.controller, n);
    return logEvent(next, { kind: "spell-effect", effect: "dig-land-to-battlefield", controller: ctx.controller, count: n, put: false });
  }
  const candidates = lands.map((c) => ({ id: c.id, name: c.name }));
  return setPendingDigLandChoice(state, {
    controller: ctx.controller,
    candidates,
    restIds: top.map((c) => c.id), // the full looked-at set (ordered) — the settler bottoms all-but-the-chosen
    entersTapped: !!atom.entersTapped,
    sourceName: ctx.cardName || null,
  });
}

/**
 * Move the top `n` cards of `controller`'s library to the BOTTOM in a deterministic RANDOM order (CR "in a
 * random order"), advancing the threaded rngSeed exactly like shuffleControllerLibrary / discover / cascade so
 * a serialized game restores byte-identical (no Math.random in state mutation). Shared by the no-land inline
 * path here and the settler (which bottoms the top-N minus the chosen land). Pure.
 */
export function bottomTopNInRandomOrder(state, controller, n) {
  const player = state.players[controller];
  if (!player) return state;
  const count = Math.min(Math.max(0, n || 0), (player.library || []).length);
  if (count === 0) return state;
  const moved = player.library.slice(0, count);
  const remaining = player.library.slice(count);
  const seed = (state.rngSeed ?? 0) >>> 0;
  const rng = deterministicRng(seed);
  const shuffledMoved = [...moved];
  for (let i = shuffledMoved.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledMoved[i], shuffledMoved[j]] = [shuffledMoved[j], shuffledMoved[i]];
  }
  return {
    ...state,
    rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0),
    players: {
      ...state.players,
      [controller]: { ...player, library: [...remaining, ...shuffledMoved] },
    },
  };
}

/**
 * Move the specific library cards whose ids are in `ids` to the BOTTOM of `controller`'s library in a
 * deterministic RANDOM order (CR "in a random order"), leaving every other library card in place. Used by
 * resolveDigLandChoice to bottom the looked-at REST after the chosen land has already left the library for the
 * battlefield (so a positional top-N helper can't be used — the ids are the frozen looked-at set minus the put
 * land). Advances the threaded rngSeed like the other random-order helpers so a serialized game restores
 * byte-identical (no Math.random). Ids not currently in the library are silently ignored (the card moved). Pure.
 */
export function bottomLibraryCardsByIds(state, controller, ids) {
  const player = state.players[controller];
  if (!player) return state;
  const idSet = new Set(ids || []);
  const moved = (player.library || []).filter((c) => idSet.has(c.id));
  if (moved.length === 0) return state;
  const remaining = (player.library || []).filter((c) => !idSet.has(c.id));
  const seed = (state.rngSeed ?? 0) >>> 0;
  const rng = deterministicRng(seed);
  const shuffledMoved = [...moved];
  for (let i = shuffledMoved.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledMoved[i], shuffledMoved[j]] = [shuffledMoved[j], shuffledMoved[i]];
  }
  return {
    ...state,
    rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0),
    players: {
      ...state.players,
      [controller]: { ...player, library: [...remaining, ...shuffledMoved] },
    },
  };
}

/**
 * ===== ANIMIST'S AWAKENING ===== ({X}-cost mass reveal-top-X → put-all-LANDS-tapped → bottom-the-rest, with a
 * spell-mastery untap rider) — "Reveal the top X cards of your library. Put all land cards from among them onto
 * the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there
 * are two or more instant and/or sorcery cards in your graveyard, untap those lands." (Animist's Awakening —
 * {X}{G}.)
 *
 * A SIBLING of genesis-wave (mass reveal-top-X) and dig-land-to-battlefield (put lands out + bottom-the-rest in
 * a random order), but a DISTINCT shape genesis-wave explicitly rejects (its matcher bans "onto the battlefield
 * tapped"): here EVERY revealed LAND enters (no MV cap — a type-only filter, so X caps ONLY the reveal count,
 * never a mana value), it enters TAPPED, and the REST bottoms in a random order (not milled). X is the SPELL'S
 * chosen X (bound at cast, CR 601.2b, threaded via ctx.xValue) and caps the reveal count only. `?? 0` (never
 * `|| 0`) so an explicit X=0 reveals 0 and does nothing — the CREED guarantee the cap is never treated as
 * "uncapped".
 *
 * FAITHFUL WHOLE-CARD, no clause dropped, executed as ONE atom (the "put all land cards … and the rest …" spans
 * one sentence but the spell-mastery rider back-references "those lands" — the lands this atom just put out — so
 * it can't be split off; matchAnimistAwakening collapses the whole card up front):
 *   1. REVEAL the top X (or fewer if the library is short). An empty reveal is a clean no-op (never fabricated).
 *   2. PUT every revealed LAND onto the battlefield TAPPED via the SHARED enterCardFromZone (tapped:true), firing
 *      ETB / landfall / permanent-enters exactly like a Cultivate/Wargate/reanimation entry — one at a time so
 *      each entry's triggers enqueue in order. Each entered land's fresh perm id is captured (the last-appended
 *      battlefield perm) so the spell-mastery untap targets EXACTLY these lands, never a pre-existing tapped land.
 *   3. BOTTOM the REST — every revealed card that is NOT a land — on the bottom of the library in a random order
 *      via the shared bottomLibraryCardsByIds (the deterministic threaded-rngSeed shuffle, byte-identical on
 *      re-serialize). After step 2 removed only the lands from the library, the non-land revealed cards are still
 *      the frozen revealed set minus the lands, addressed by their captured ids (a positional top-N helper can't
 *      be used — the lands already left the library, shifting positions).
 *   4. SPELL MASTERY (CR 702.x ability word — no rules meaning, a threshold gate): if the controller's graveyard
 *      holds TWO OR MORE instant-and/or-sorcery cards AT RESOLUTION, UNTAP those just-entered lands (untapPermanent
 *      on each captured id). The rider is modeled in FULL — the untap is not silently dropped — so a spell-mastery
 *      Animist's Awakening plays as printed (the lands come in untapped, i.e. ready to tap for mana). Below the
 *      threshold, the lands stay tapped (the printed default). The graveyard count reads the stored card `.type`
 *      lines (a milled/discarded spell carries its type), matching the isInstantOrSorcery predicate.
 *
 * Pure data mutation (library moves + permanent adds + tapped flips) so a game serialized mid-resolution restores
 * byte-identical (no closures). Non-pausing (deterministic — "all lands" and "the rest" are not player choices,
 * and the untap is a mandatory threshold), so no PAUSING_ATOM_OPS entry and no session-driver wiring is needed.
 */
export function applyAnimistAwakening(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const x = Math.max(0, ctx.xValue ?? 0); // X caps the reveal count ONLY (bound at cast, CR 601.2b) — a type-only filter, no MV cap
  const lib = player.library || [];
  const revealed = lib.slice(0, Math.min(x, lib.length)); // the top X (or fewer if the library is short)
  if (revealed.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "animist-awakening", controller, x, lands: 0, bottomed: 0, spellMastery: false });
  }
  // Partition the revealed set: LANDS enter tapped; the REST bottom in a random order. Freeze the id lists BEFORE
  // any mutation so the bottom step can address the non-land revealed cards after the lands have left the library.
  const landIds = revealed.filter((c) => isLandCard(c)).map((c) => c.id);
  const restIds = revealed.filter((c) => !isLandCard(c)).map((c) => c.id);
  // Put every revealed LAND onto the battlefield TAPPED, one at a time (each entry's ETB / landfall enqueues in
  // order). enterCardFromZone appends exactly ONE perm to the controller's battlefield per successful entry, so
  // the last element of the post-entry battlefield is the perm we just made — capture its id to untap later.
  let next = state;
  const enteredLandPermIds = [];
  for (const id of landIds) {
    const r = enterCardFromZone(next, { playerId: controller, cardId: id, fromZone: "library", tapped: true });
    if (r.entered) {
      next = r.state;
      const bf = next.players[controller].battlefield;
      enteredLandPermIds.push(bf[bf.length - 1].id);
    }
  }
  // Bottom the REST (the revealed non-lands) in a random order (the lands are gone from the library, so a
  // positional top-N helper can't be used — address the frozen non-land ids directly).
  if (restIds.length > 0) next = bottomLibraryCardsByIds(next, controller, restIds);
  // SPELL MASTERY — two or more instant-and/or-sorcery cards in the controller's graveyard at resolution untaps
  // the lands this spell just put out. Read the CURRENT graveyard (after the entries above; those entries only
  // touched the library + battlefield, never the graveyard, so the count is stable).
  const gy = next.players[controller]?.graveyard || [];
  const isCount = gy.filter((c) => isInstantOrSorceryCard(c)).length;
  const spellMastery = isCount >= 2;
  if (spellMastery) {
    for (const permId of enteredLandPermIds) next = untapPermanent(next, permId);
  }
  return logEvent(next, { kind: "spell-effect", effect: "animist-awakening", controller, x, lands: enteredLandPermIds.length, bottomed: restIds.length, spellMastery });
}

/**
 * ===== DISCOVER ===== (LCI keyword, CR 701.x) — "Discover N/X": exile cards from the TOP of the
 * controller's library until a NONLAND card with mana value <= N is exiled (or the library runs out). The
 * found card is parked in `state.pendingDiscover` for the controller's CAST-IT-FREE-or-PUT-IN-HAND decision
 * (resolved at the ACTION layer: legalChoices offers a free-cast action — reusing the cast machinery so
 * target selection / the stack / cast triggers / AI all behave exactly like a normal cast — plus a
 * put-to-hand action). The OTHER exiled cards (lands + nonlands with MV > N) go to the BOTTOM of the
 * library in a RANDOM order (deterministic, via the threaded rngSeed). A whiff (no matching card) bottoms
 * everything exiled and sets no decision. The found card sits in EXILE until the decision resolves.
 * N comes from `atom.amount` (fixed "discover 5") or `atom.amountCount` (a board count — Pantlaza's
 * "discover X, where X is that creature's toughness", PR2). Pure data mutation (no closures) so a game
 * serialized mid-discover restores intact.
 */
export function applyDiscoverAtom(state, atom, ctx) {
  // ONCE-PER-TURN gate (Pantlaza "Do this only once each turn."): if this source has already
  // triggered its discover this turn, suppress the effect (safe no-op — the trigger went on the
  // stack and resolved, but the discover is skipped per the frequency restriction).
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_discover`;
    if ((state.onceTriggersFiredThisTurn || {})[gateKey]) return state;
  }
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  // PANTLAZA — "discover X, where X is that creature's toughness": X is the layer-resolved toughness of the
  // TRIGGERING creature (the Dinosaur that just entered, threaded as ctx.triggeringPermanentId by the trigger
  // path). 0 if it already left the battlefield (a safe whiff, never fabricated). Otherwise a board count
  // (amountCount) or the fixed printed amount.
  const x = atom.amountToughnessOfTrigger
    ? Math.max(0, (findPermanent(state, ctx.triggeringPermanentId)?.permanent ? creatureToughness(findPermanent(state, ctx.triggeringPermanentId).permanent, state) : 0))
    : atom.amountCount ? Math.max(0, countForSpec(state, ctx, atom.amountCount)) : Math.max(0, atom.amount || 0);
  const lib = player.library || [];
  let foundIdx = -1;
  for (let i = 0; i < lib.length; i++) {
    const c = lib[i];
    const isLand = /\bLand\b/.test(String(c.type || c.type_line || ""));
    if (!isLand && tutorManaValue(c) <= x) { foundIdx = i; break; }
  }
  const end = foundIdx === -1 ? lib.length : foundIdx + 1;
  const found = foundIdx === -1 ? null : lib[foundIdx];
  const rest = lib.slice(0, end).filter((c) => c !== found); // exiled-except-found → bottom, random order
  const remaining = lib.slice(end);                          // cards below the found one stay (now the top)
  // Deterministic Fisher-Yates of `rest` (CR "random order"), advancing the threaded seed exactly like
  // shuffleControllerLibrary so a serialized game restores byte-identical (no Math.random in state mutation).
  const seed = (state.rngSeed ?? 0) >>> 0;
  const rng = deterministicRng(seed);
  const shuffledRest = [...rest];
  for (let i = shuffledRest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledRest[i], shuffledRest[j]] = [shuffledRest[j], shuffledRest[i]];
  }
  let next = {
    ...state,
    rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0),
    players: {
      ...state.players,
      [controller]: {
        ...player,
        library: [...remaining, ...shuffledRest],
        exile: found ? [...(player.exile || []), found] : (player.exile || []),
      },
    },
  };
  if (found) next = { ...next, pendingDiscover: { controller, cardId: found.id, mv: tutorManaValue(found) } };
  let result = logEvent(next, { kind: "spell-effect", effect: "discover", controller, x, found: !!found });
  // Mark the once-per-turn latch (regardless of whiff) — the effect ran, so the gate is consumed.
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_discover`;
    result = { ...result, onceTriggersFiredThisTurn: { ...(result.onceTriggersFiredThisTurn || {}), [gateKey]: true } };
  }
  return result;
}

/**
 * ===== CASCADE ===== (CR 702.85, the Storm/Discover keyword-trigger precedent) — "Cascade (When you cast this
 * spell, exile cards from the TOP of your library until you exile a NONLAND card that costs LESS. You may cast
 * it without paying its mana cost. Put the exiled cards on the bottom in a random order.)". This atom is the
 * synthesized cascade trigger's payload (triggers.detectTriggers emits a selfCast `cascade:true` descriptor;
 * checkCastTriggers threads the cascading spell's mana value onto ctx.cascadeSpellMv at cast). It DIGS the
 * controller's library exiling from the top until it exiles a nonland card with mana value STRICTLY LESS than
 * the cascading spell's (CR 702.85a — "costs less"), parks that card in `state.pendingCascade` for the
 * controller's CAST-IT-FREE-or-DECLINE decision (resolved at the ACTION layer: legalChoices offers a free-cast
 * action — reusing the cast machinery so target selection / the stack / cast triggers / AI behave EXACTLY like
 * a normal cast — plus a decline action that bottoms the found card). EVERY other exiled card (lands + nonlands
 * with MV >= the cap) goes to the BOTTOM of the library in a RANDOM order (deterministic, via the threaded
 * rngSeed — the same Fisher-Yates discover uses). A WHIFF (no card with MV < cap, e.g. a 0-MV cascade spell or
 * an all-too-expensive library) bottoms everything exiled and sets no decision (never fabricated). The found
 * card sits in EXILE until the decision resolves; a decline then bottoms it too (CR 702.85a — "the rest").
 *
 * The cap is ctx.cascadeSpellMv, snapshotted at cast (`?? 0` — a missing cap, never the real path, is treated
 * as 0 so the dig whiffs rather than fabricating an uncapped hit; a genuine MV-0 spell also whiffs since no card
 * can cost < 0 — CR-correct, a cascade spell that costs nothing finds nothing). Pure data mutation (no closures)
 * so a game serialized mid-cascade restores intact.
 */
export function applyCascadeAtom(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const cap = Math.max(0, ctx.cascadeSpellMv ?? 0); // "costs less" than the cascading spell (CR 702.85a)
  const lib = player.library || [];
  let foundIdx = -1;
  for (let i = 0; i < lib.length; i++) {
    const c = lib[i];
    const isLand = /\bLand\b/.test(String(c.type || c.type_line || ""));
    if (!isLand && tutorManaValue(c) < cap) { foundIdx = i; break; } // STRICTLY less (CR 702.85a)
  }
  const end = foundIdx === -1 ? lib.length : foundIdx + 1;
  const found = foundIdx === -1 ? null : lib[foundIdx];
  // Everything exiled EXCEPT the found card goes to the bottom in random order; cards below the found one are
  // untouched and remain the new top of the library (CR 702.85a — only the exiled cards are bottomed).
  const rest = lib.slice(0, end).filter((c) => c !== found);
  const remaining = lib.slice(end);
  // Deterministic Fisher-Yates of `rest` (CR "random order"), advancing the threaded seed exactly like
  // shuffleControllerLibrary / discover so a serialized game restores byte-identical (no Math.random).
  const seed = (state.rngSeed ?? 0) >>> 0;
  const rng = deterministicRng(seed);
  const shuffledRest = [...rest];
  for (let i = shuffledRest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledRest[i], shuffledRest[j]] = [shuffledRest[j], shuffledRest[i]];
  }
  let next = {
    ...state,
    rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0),
    players: {
      ...state.players,
      [controller]: {
        ...player,
        library: [...remaining, ...shuffledRest],
        exile: found ? [...(player.exile || []), found] : (player.exile || []),
      },
    },
  };
  if (found) next = { ...next, pendingCascade: { controller, cardId: found.id, mv: tutorManaValue(found), cap } };
  return logEvent(next, { kind: "spell-effect", effect: "cascade", controller, cap, found: !!found });
}

/** Mill ONE player `count` cards (CR 701.13), then fire the MILL-ON-EVENT trigger bind for that player's
 * mill (CR 701.13a — one event per mill instruction). Captures the ACTUAL milled cards (top N, bounded by
 * library size) BEFORE the move so checkMilledTriggers can read their front-face types. A no-op mill (empty
 * library) mills nothing → no trigger (checkMilledTriggers no-ops on an empty batch). Pure. */
function millOnePlayer(state, playerId, count) {
  const player = state.players[playerId];
  if (!player) return state;
  const n = Math.min(Math.max(0, count || 0), (player.library || []).length);
  if (n === 0) return state;
  const milledCards = player.library.slice(0, n); // captured pre-move (top N → graveyard)
  const next = millCards(state, { playerId, count: n });
  return checkMilledTriggers(next, { milledByPlayer: playerId, milledCards });
}

/** Mill (CR 701.13) — "you mill N cards" (the controller), "each opponent mills N cards", or
 * "each player mills N cards" (EP-3). Top N of each milled player's library → their graveyard. Non-targeted.
 * Each player's mill is its OWN event (CR 701.13a), so millOnePlayer fires the milled trigger bind per seat. */
export function applyMill(state, atom, ctx) {
  let next = state;
  const amount = atom.amount || 0;
  if (atom.who === "eachPlayer") {
    // ===== EACH-PLAYER ===== (EP-3) EVERY player mills N (symmetric — Mind Funeral-adjacent / Winds of
    // Rebuke rider). Non-targeted → identical on a spell or trigger; an eliminated player isn't in the map.
    for (const pid of Object.keys(next.players)) next = millOnePlayer(next, pid, amount);
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) next = millOnePlayer(next, opp, amount);
  } else if (atom.who === "damagedPlayer") {
    // CDMG-MILL (Sword of Body and Mind) — the player the equipped creature just dealt combat damage to
    // (ctx.damagedPlayerId, carried by checkCombatDamageTriggers). Absent / eliminated referent (a spell, a
    // non-combat trigger, a player who left the game) → mill nobody (a clean no-op, never a fabrication —
    // mirrors the rad damagedPlayer resolver's guard).
    const pid = ctx.damagedPlayerId;
    if (pid && next.players?.[pid]) next = millOnePlayer(next, pid, amount);
  } else {
    next = millOnePlayer(next, ctx.controller, amount);
  }
  return logEvent(next, { kind: "spell-effect", effect: "mill", who: atom.who || "controller", amount });
}

/**
 * ===== REVEAL-TOP-TO-HAND (Yuriko) ===== "reveal the top card of your library and put that card into your
 * hand" (CR 701.18 reveal + CR 121 put-to-hand). Functionally a draw — reveal is public-info and the card
 * goes to the controller's hand — BUT it ALSO captures the revealed card's MANA VALUE so a FOLLOWING drain
 * atom can read it (Yuriko: "Each opponent loses life equal to that card's mana value"). This is the exact
 * mid-resolution value-capture pattern roll-d20 uses: the atom stamps the value on `state.revealedCardMV`,
 * and the next atom's count source `{kind:"revealedCardMV"}` reads it (countForSpec). The parser GATES that
 * count source to a clause directly following a reveal-top-to-hand in the same program (revealTopSequenceOk),
 * so the read can never occur without its reveal first writing the value — and the value is overwritten by
 * the next reveal, never read stale. An EMPTY library reveals nothing → MV stamped 0 (a clean no-op, the
 * drain is 0 — never a fabricated value). The card goes to the SOURCE's controller (ctx.controller, the
 * Ninja's controller threaded by the trigger flush). Pure data mutation (state.revealedCardMV is a plain
 * number) so a game serialized mid-resolution restores byte-identical.
 *
 * NOTE: this captures the EXACT revealed card's MV (via tutorManaValue — the same MV the tutor/discover/
 * dice paths use), never a guess or board count, so the drain magnitude is always the real drawn card's MV.
 */
export function applyRevealTopToHand(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state;
  const lib = player.library || [];
  if (lib.length === 0) {
    // Empty library — nothing to reveal. Stamp MV 0 so a following drain is a clean no-op (never fabricated).
    const next = { ...state, revealedCardMV: 0 };
    return logEvent(next, { kind: "spell-effect", effect: "reveal-top-to-hand", controller, revealed: null });
  }
  const top = lib[0];
  const mv = tutorManaValue(top);
  let next = {
    ...state,
    revealedCardMV: mv,
    players: {
      ...state.players,
      [controller]: { ...player, library: lib.slice(1), hand: [...(player.hand || []), top] },
    },
  };
  // Reveal is public info (the card is named in the log); the put-to-hand is the same library→hand move a draw makes.
  return logEvent(next, { kind: "spell-effect", effect: "reveal-top-to-hand", controller, revealed: top.name, mv });
}

/**
 * ===== IMPULSE-EXILE-AND-PLAY ===== (CR 701.x "play" + CR 118.10 permission) — "Exile the top card of your
 * library. You may play that card this turn." (Professional Face-Breaker's sac-Treasure activated ability;
 * Light Up the Stage / Chandra's impulse-draw family). The top card of the CONTROLLER's library is moved to
 * their exile FACE-UP and stamped `_impulse: true` + `_impulseTurn: state.turn`. The play PERMISSION is then
 * offered at the ACTION layer (legalChoices.actionsPlayImpulseFromExile) THIS TURN ONLY (the turn stamp gates
 * it, exactly like PLOT's `_plottedTurn`): a NONLAND card is cast at FULL COST from exile via the shared
 * castActionsFromZone builder (freeCast=false — "play" means pay costs normally, unlike discover/cascade/plot's
 * free-cast), and a LAND is played from exile through the play-land path (consuming a land drop). The permission
 * LAPSES at end of turn — gameEngine's cleanup step clears the `_impulse`/`_impulseTurn` flags, leaving the
 * unplayed card inert in exile (CR-correct: the "you may play … this turn" window closes; the card is NOT put
 * anywhere else). A card actually played leaves exile onto the stack / battlefield through the normal cast /
 * play-land machinery, so the flag goes with it — never a phantom re-play.
 *
 * FAITHFUL WHOLE-EFFECT (no clause dropped): the "Exile the top card" and "You may play that card this turn"
 * sentences are ONE modeled unit — the exile writes the card to exile AND the play permission is genuinely
 * offered + enforced (a real castable/playable action the pilot/driver can take), never a parse-only marker. An
 * EMPTY library exiles nothing → a clean logged no-op (never fabricated). Pure data mutation (a library→exile
 * move + a boolean/turn stamp) so a game serialized mid-resolution restores byte-identical (no closures). The
 * controller reads ctx.controller (threaded by the activated-ability / spell resolution path); an eliminated
 * controller mid-resolution is a clean no-op (CR 800.4a).
 */
export function applyImpulseExileAtom(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const lib = player.library || [];
  if (lib.length === 0) {
    // Empty library — nothing to exile. A clean logged no-op (never fabricated).
    return logEvent(state, { kind: "spell-effect", effect: "impulse-exile", controller, exiled: null });
  }
  const top = lib[0];
  // Move the top card to exile FACE-UP, stamped with the play permission for THIS turn. The turn stamp is what
  // enforces "this turn" — actionsPlayImpulseFromExile compares `_impulseTurn === state.turn`, and gameEngine's
  // cleanup clears the flags at end of turn — so the same monotonic turn counter gates the window (no per-turn
  // reset flag to wire). Mirrors PLOT's `_plotted` stamp on the exiled copy.
  const stampedTop = { ...top, _impulse: true, _impulseTurn: state.turn };
  const next = {
    ...state,
    players: {
      ...state.players,
      [controller]: { ...player, library: lib.slice(1), exile: [...(player.exile || []), stampedTop] },
    },
  };
  // Exiling from your own library is public-info here (the card is named in the log — it's the controller's own
  // card revealed by the play permission), matching the impulse-draw family's face-up exile.
  return logEvent(next, { kind: "spell-effect", effect: "impulse-exile", controller, exiled: top.name });
}

/**
 * ===== GENESIS-WAVE ===== (CR 701 "put onto the battlefield" + CR 701.13 mill) — the mass reveal-top-X
 * spell family: "Reveal the top X cards of your library. You may put any number of <FILTER> cards with mana
 * value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put
 * onto the battlefield into your graveyard." (Genesis Wave — `permanent`; Saheeli's Directive — `artifact`).
 *
 * X is the SPELL'S chosen X (bound at cast per CR 601.2b, threaded via ctx.xValue). It caps BOTH the reveal
 * count (top X) AND the eligible permanents' mana value (MV ≤ X) — the same X in both places, read once here.
 * `?? 0` (never `|| 0`) so an explicit X=0 reveals 0 and puts nothing (a clean no-op, the mill of an empty
 * reveal is a no-op) — the cardinal CREED guarantee that the cap is never silently treated as "uncapped".
 *
 * THE "YOU MAY PUT ANY NUMBER" CHOICE — resolved deterministically (v1, the same posture as the tutor
 * auto-pick / Expert autopilot): put EVERY eligible permanent card (matching the type filter AND within the
 * MV cap) onto the battlefield. Putting all of them is a LEGAL resolution of "any number" (choosing to put
 * all), and it's the maximizing, standard line for a Genesis Wave cast — the atom applies the WHOLE card
 * (reveal + selective put + mill-the-rest), no clause dropped, so this is faithful, not a partial. An
 * interactive per-card multi-select picker is a future refinement (like scry's / the multi-count picker).
 *
 * DISPOSITION OF THE REST — every revealed card NOT put onto the battlefield (an over-cap permanent, an
 * instant/sorcery, or — for the artifact filter — a non-artifact permanent) goes into the controller's
 * GRAVEYARD (Genesis Wave / Saheeli's Directive both say "into your graveyard"). This slice models ONLY the
 * graveyard disposition (`restTo:"graveyard"`); a "bottom of library in a random order" variant (Majestic
 * Genesis, Knickknack Ouphe) is a DIFFERENT disposition and stays unmatched → low → Arbiter (CREED FN-safe).
 *
 * Each eligible permanent enters via enterCardFromZone (fires ETB / landfall / permanent-enters triggers,
 * mints a fresh perm id + timestamp) — the exact shared entry the battlefield-tutor / reanimation paths use,
 * so a Genesis-Wave-put permanent can't drift from a Wargate-fetched one. The mill-the-rest goes through the
 * millOnePlayer chokepoint (fires the milled trigger bind, CR 701.13a). An EMPTY library reveals nothing → a
 * clean no-op. Pure data mutation — a game serialized mid-resolution restores byte-identical (no closures).
 */
export function applyGenesisWave(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const x = Math.max(0, ctx.xValue ?? 0); // X caps BOTH the reveal count and the MV (bound at cast, CR 601.2b)
  const lib = player.library || [];
  const revealed = lib.slice(0, Math.min(x, lib.length)); // the top X (or fewer if the library is short)
  if (revealed.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "genesis-wave", controller, x, put: 0, milled: 0 });
  }
  // Eligible = matches the type filter (permanent / artifact / …) AND MV ≤ X. cardMatchesTutorFilter is the
  // exact gate Wargate uses (permanentOnly rejects instants/sorceries; a groups filter matches the front-face
  // type line; mv.max caps the mana value) — so "put any number of permanent cards with MV ≤ X" is enforced
  // identically to the battlefield-tutor cap, never fabricated.
  const capFilter = { ...(atom.filter || {}), mv: { max: x } };
  const eligibleIds = new Set(revealed.filter((c) => cardMatchesTutorFilter(c, capFilter)).map((c) => c.id));
  // Put EVERY eligible permanent onto the battlefield (the deterministic "put all" resolution of "any number").
  // enterCardFromZone removes the card from the library and enters it under the controller's control, firing
  // ETB / landfall / permanent-enters — one card at a time so each entry's triggers are enqueued in order.
  let next = state;
  let put = 0;
  for (const c of revealed) {
    if (!eligibleIds.has(c.id)) continue;
    const r = enterCardFromZone(next, { playerId: controller, cardId: c.id, fromZone: "library" });
    if (r.entered) { next = r.state; put += 1; }
  }
  // The REST — every revealed card that wasn't put onto the battlefield — goes to the graveyard. After the
  // puts above, those cards are STILL at the top of the library (enterCardFromZone only removed the put ones,
  // preserving relative order), so the leftover-revealed cards remain the top `revealed.length - put` of the
  // library. Mill exactly that many (through the millOnePlayer chokepoint so the milled trigger bind fires).
  const milled = revealed.length - put;
  if (milled > 0) next = millOnePlayer(next, controller, milled);
  return logEvent(next, { kind: "spell-effect", effect: "genesis-wave", controller, x, put, milled });
}

/**
 * ===== REVEAL-THAT-MANY-PUT-FILTERED (Gishath, Sun's Avatar) ===== a COMBAT-DAMAGE trigger's payoff — "reveal
 * that many cards from the top of your library. Put any number of <SUBTYPE> creature cards from among them onto
 * the battlefield and the rest on the bottom of your library in a random order." (Gishath — Dinosaur; Pantlaza).
 *
 * COUNT — "that many" = ctx.combatDamageAmount, the combat damage THIS trigger dealt (resolveScaledAmount reads
 * the atom's countContext). The referent is supplied by the combatDamageToPlayer event; combatDamageReferentSatisfied
 * gates this atom native ONLY on a combat-damage event, so an absent amount (a non-combat trigger) can never route
 * here. `Math.max(0, …)` so 0 damage / an absent referent reveals nothing — a clean no-op, never fabricated.
 *
 * THE "PUT ANY NUMBER" CHOICE — resolved deterministically (v1, the genesis-wave posture): put EVERY matching
 * <subtype> creature onto the battlefield. Putting all of them is a LEGAL resolution of "any number" (choosing to
 * put all) and the maximizing line — the whole clause is applied (reveal + selective put + bottom-the-rest), no
 * clause dropped. Each put enters via enterCardFromZone (fires ETB / permanent-enters), one at a time so triggers
 * enqueue in order — identical to the genesis-wave put loop.
 *
 * DISPOSITION OF THE REST — every revealed card NOT put (a non-matching card) goes to the BOTTOM of the library in
 * a RANDOM order (CR "in a random order" — the rngSeed-threaded shuffle, serialize-stable, no Math.random). After
 * the puts, the leftover-revealed cards are STILL the top `revealed.length - put` of the library (enterCardFromZone
 * removed only the put ones, preserving order), so bottomTopNInRandomOrder bottoms exactly those. An empty reveal
 * (0 damage / empty library) is a clean logged no-op. Pure — a game serialized mid-resolution restores byte-identical.
 */
export function applyRevealPutFiltered(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const n = Math.max(0, resolveScaledAmount(state, atom, ctx)); // "that many" = the combat damage dealt (ctx.combatDamageAmount)
  const lib = player.library || [];
  const revealed = lib.slice(0, Math.min(n, lib.length)); // the top N (or fewer if the library is short)
  if (revealed.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "reveal-put-filtered", controller, count: 0, put: 0, rest: 0 });
  }
  const eligibleIds = new Set(revealed.filter((c) => cardMatchesTutorFilter(c, atom.filter)).map((c) => c.id));
  // Put EVERY matching creature onto the battlefield (the deterministic "put all" resolution of "any number").
  let next = state;
  let put = 0;
  for (const c of revealed) {
    if (!eligibleIds.has(c.id)) continue;
    const r = enterCardFromZone(next, { playerId: controller, cardId: c.id, fromZone: "library" });
    if (r.entered) { next = r.state; put += 1; }
  }
  // The REST — every revealed card not put — is STILL at the top of the library (enterCardFromZone removed only
  // the put ones, preserving relative order), so the leftover-revealed cards remain the top `revealed.length - put`.
  // Bottom exactly that many in a random order (the rngSeed-threaded shuffle, serialize-stable).
  const rest = revealed.length - put;
  if (rest > 0) next = bottomTopNInRandomOrder(next, controller, rest);
  return logEvent(next, { kind: "spell-effect", effect: "reveal-put-filtered", controller, count: revealed.length, put, rest });
}

/**
 * ===== REVEAL-UNTIL-N-LANDS (Open the Way) ===== ({X}-cost sorcery) — "X can't be greater than the number of
 * players in the game. Reveal cards from the top of your library until you reveal X land cards. Put those land
 * cards onto the battlefield tapped and the rest on the bottom of your library in a random order."
 *
 * A DISTINCT dig from genesis-wave / dig-land-to-battlefield: it reveals from the top ONE AT A TIME until it has
 * seen `n` LAND cards (or the library runs out), puts ALL of those found lands onto the battlefield TAPPED, and
 * bottoms EVERY OTHER revealed card (the interleaved nonlands) in a random order. There is NO choice — every land
 * found goes to the battlefield, so this is deterministic (non-pausing) like genesis-wave / reveal-top-conditional.
 *
 * X is the SPELL'S chosen X (bound at cast per CR 601.2b, threaded via ctx.xValue), CAPPED at the number of
 * players in the game — the printed "X can't be greater than the number of players in the game" constraint. The
 * cap is enforced HERE at resolution (min(xValue, playerCount)) so the effect can NEVER reveal-until more lands
 * than the card legally allows even if the cast path offered a larger X: the whole clause is honored, never
 * partially (CREED). `?? 0` (never `|| 0`) so an explicit X=0 reveals nothing (a clean no-op) — the cap is never
 * silently treated as "uncapped".
 *
 * Each found LAND enters via enterCardFromZone (tapped, firing its ETB / landfall / permanent-enters triggers —
 * the exact shared entry the battlefield-tutor / reanimation / genesis-wave paths use), one at a time so each
 * entry's triggers enqueue in order. THE REST — every revealed card that isn't one of the put lands — is still at
 * the TOP of the library after the puts (enterCardFromZone removed only the lands, preserving relative order), so
 * the leftover-revealed cards remain the top `revealed.length - landsPut` of the library; bottomTopNInRandomOrder
 * moves exactly those to the bottom in a deterministic random order (CR "in a random order", threaded rngSeed —
 * a serialized game restores byte-identical). An EMPTY library (or X capped to 0) reveals nothing → clean no-op.
 * Pure data mutation (no closures). Non-pausing → no PAUSING_ATOM_OPS entry, no session-driver wiring.
 */
export function applyRevealUntilNLands(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  // X caps the number of LANDS to reveal-until. Open the Way caps X at the number of players in the game (the
  // printed constraint) — enforced here so the effect never reveals-until more lands than legal, whatever X the
  // cast path bound. min(xValue, playerCount); ?? 0 so an explicit X=0 is a no-op, never "uncapped".
  const rawX = Math.max(0, ctx.xValue ?? 0);
  const playerCount = Object.keys(state.players || {}).length;
  const n = atom.capPlayerCount ? Math.min(rawX, playerCount) : rawX;
  const lib = player.library || [];
  if (n === 0 || lib.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "reveal-until-n-lands", controller, n, lands: 0, bottomed: 0 });
  }
  // Reveal from the top until we've seen `n` land cards (or the library is exhausted). The revealed set is the
  // contiguous prefix ending at (and including) the Nth land — exactly what "reveal until you reveal X land
  // cards" describes. Fewer than N lands in the whole library → the whole library is revealed (CR: you reveal
  // until you can't; you put whatever lands you found).
  let landsSeen = 0;
  let revealEnd = 0; // exclusive index into lib
  for (let i = 0; i < lib.length; i++) {
    revealEnd = i + 1;
    if (isLandCard(lib[i])) {
      landsSeen += 1;
      if (landsSeen >= n) break;
    }
  }
  const revealed = lib.slice(0, revealEnd);
  const landIds = new Set(revealed.filter((c) => isLandCard(c)).map((c) => c.id));
  // Put every revealed LAND onto the battlefield TAPPED (enterCardFromZone removes it from the library and enters
  // it under the controller's control, firing ETB / landfall / permanent-enters). One at a time so each entry's
  // triggers enqueue in order — identical to the genesis-wave put loop.
  let next = state;
  let landsPut = 0;
  for (const c of revealed) {
    if (!landIds.has(c.id)) continue;
    const r = enterCardFromZone(next, { playerId: controller, cardId: c.id, fromZone: "library", tapped: true });
    if (r.entered) { next = r.state; landsPut += 1; }
  }
  // THE REST — every revealed card that wasn't a put land — is still the top `revealed.length - landsPut` of the
  // library (enterCardFromZone removed only the lands, preserving relative order, exactly like genesis-wave's
  // mill-the-rest). Bottom exactly that many in a deterministic random order (CR "in a random order").
  const bottomCount = revealed.length - landsPut;
  if (bottomCount > 0) next = bottomTopNInRandomOrder(next, controller, bottomCount);
  return logEvent(next, { kind: "spell-effect", effect: "reveal-until-n-lands", controller, n, lands: landsPut, bottomed: bottomCount });
}

/**
 * ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== "Reveal the top card of your library. If it's a
 * creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library."
 * (CR 701.18 reveal, CR 701.16 put-onto-the-battlefield-from-a-library, CR 601-free bottom move.) A cast-trigger
 * effect (fired by "Whenever an opponent casts a spell, …" — ctx.controller is the enchantment's controller).
 * Three faithful outcomes, all executed here as ONE atom (the sentences span the clause splitter, so the parser
 * collapses them up front to this single atom — see matchRevealTopConditional):
 *   1. CREATURE → the revealed card enters the controller's battlefield as a permanent (enterCardFromZone from
 *      the library, firing its ETB / permanent-enters / landfall watchers exactly like reanimation / ramp — a
 *      free creature is the whole point of the card). The card is REMOVED from the library and becomes a
 *      permanent under the controller's control.
 *   2. NON-CREATURE → the "you may put that card on the bottom of your library" is a genuine player option; both
 *      legal branches (bottom vs. leave-on-top) DROP no clause, so — exactly like EXPLORE's "back or graveyard"
 *      option (CR 701.44a) and scry's keep/bottom — it is resolved DETERMINISTICALLY here. We take the "may"
 *      action (put on the bottom), the card-selection identity of the effect: it cycles the dead card away so
 *      the next opponent's cast can reveal a fresh top. An interactive keep/bottom picker is a future refinement
 *      (mirroring explore / scry), never a correctness gap — leave-on-top is the strictly weaker alternative and
 *      skips no instruction. The move stays WITHIN the library (top → bottom), so no ETB / zone-change fires.
 *   3. EMPTY library → nothing to reveal (a clean no-op, a legal reveal of zero cards — never a fabrication).
 * Pure data mutation (a library shuffle/move + a permanent add) so a game serialized mid-resolution restores
 * byte-identical. Non-pausing (deterministic), so it needs no PAUSING_ATOM_OPS entry and no session driver wiring.
 */
export function applyRevealTopConditional(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state;
  const lib = player.library || [];
  if (lib.length === 0) {
    // Empty library — nothing to reveal (a legal reveal of zero cards).
    return logEvent(state, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: null });
  }
  const top = lib[0];
  // ===== TOP-CARD ROUTER (the parameterized family) ===== atom.{predicate,thenRoute,elseRoute} generalize
  // the original fused Lurking Predators shape (whose atoms carry NO params → the legacy branch below runs
  // byte-identically). Predicate = the revealed card's TYPE test; thenRoute/elseRoute = where it goes.
  // CR notes: "put it into your hand" is NOT a draw (no draw triggers — moveCardToZone, never drawCards);
  // the revealed card going "into your graveyard" is NOT a mill (CR 701.13a — mill is its own action;
  // Zoologist's revealed-card move fires no milled watchers). battlefield rides enterCardFromZone (ETB /
  // permanent-enters / landfall fire exactly like the legacy creature branch).
  if (atom.predicate) {
    const TYPE_TESTS = {
      creature: isCreatureCard,
      land: isLandCard,
      // Plain substring on the type line — no other card type contains these words as substrings, and
      // the supertype segment always spells them in full ("Artifact Creature — Golem").
      artifact: (c) => String(c?.type || c?.type_line || "").includes("Artifact"),
      enchantment: (c) => String(c?.type || c?.type_line || "").includes("Enchantment"),
    };
    // Router v2: an OR-predicate list ("creature or land" — Track Down) is a union test; single
    // predicate is the degenerate one-element case.
    const preds = atom.predicates || [atom.predicate];
    if (!preds.every((p) => TYPE_TESTS[p])) return state; // unknown predicate — defensive no-op
    const route = preds.some((p) => TYPE_TESTS[p](top)) ? atom.thenRoute : atom.elseRoute;
    if (route === "battlefield") {
      const r = enterCardFromZone(state, { playerId: controller, cardId: top.id, fromZone: "library" });
      return logEvent(r.state, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, toBattlefield: r.entered });
    }
    if (route === "hand" || route === "graveyard") {
      const r = moveCardToZone(state, { playerId: controller, cardId: top.id, fromZone: "library", toZone: route });
      return logEvent(r, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, toZone: route });
    }
    if (route === "draw") {
      // "If it's a <T> card, DRAW a card" (Track Down) — a REAL draw of the just-revealed top card:
      // applyDrawEffect owns the whole draw semantics (count bump + draw watchers — the opposite of the
      // put-into-hand rule; the same edge misc.js's draw atom rides, so the two can't drift).
      const drawn = applyDrawEffect(state, { controller, amount: 1 });
      return logEvent(drawn, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, drew: true });
    }
    if (route === "leave") {
      // NO-ELSE form (CR-literal): the condition failed and the card simply STAYS ON TOP — a revealed
      // no-op, logged so the reveal is visible (never a silent disappearance).
      return logEvent(state, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, left: true });
    }
    // route === "bottom" (the may-bottom else of the Lurking shape, param form)
    const bottomed = { ...state, players: { ...state.players, [controller]: { ...player, library: [...lib.slice(1), top] } } };
    return logEvent(bottomed, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, toBottom: true });
  }
  if (isCreatureCard(top)) {
    // The revealed creature card enters the controller's battlefield from the library, firing its ETB /
    // permanent-enters / landfall watchers (enterCardFromZone — the same put-onto-the-battlefield seam
    // reanimation and library ramp use). enterCardFromZone removes the card from the library and adds the
    // permanent; entered:false (an unchanged state) only if the card already left, which can't happen for the
    // library top we just read — but the guard keeps it a no-op rather than a throw.
    const r = enterCardFromZone(state, { playerId: controller, cardId: top.id, fromZone: "library" });
    return logEvent(r.state, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, toBattlefield: r.entered });
  }
  // Non-creature → take the optional "put that card on the bottom of your library" (a legal choice; leave-on-top
  // is the strictly weaker alternative and skips no instruction — see the header note). A same-zone move can't go
  // through moveCardToZone (its fromZone/toZone patch would collide on the "library" key), so splice the top off
  // and append it to the bottom directly: library index 0 is the TOP (drawCardEffect slices from the front), so
  // the last element is the bottom.
  const bottomLib = [...lib.slice(1), top];
  const next = {
    ...state,
    players: { ...state.players, [controller]: { ...player, library: bottomLib } },
  };
  return logEvent(next, { kind: "spell-effect", effect: "reveal-top-conditional", controller, revealed: top.name, toBottom: true });
}

/** P3.2 shuffle — "[then] shuffle [your library]" as its own clause (CR 103.2). */
export function applyShuffle(state, atom, ctx) {
  if (!state.players[ctx.controller]) return state;
  const next = shuffleControllerLibrary(state, ctx.controller);
  return logEvent(next, { kind: "spell-effect", effect: "shuffle", controller: ctx.controller });
}

/**
 * SHUFFLE-GRAVEYARD-INTO-LIBRARY (Finale of Revelation "shuffle your graveyard into your library", CR 701.19)
 * — move EVERY card in the controller's graveyard into their library, then shuffle deterministically (the same
 * threaded-seed shuffle as every other library shuffle, so it's serialize-stable). The graveyard is emptied
 * (its cards are now in the library and randomized), matching the printed effect exactly. condX-gated: when
 * atom.condX is set, this only happens once the chosen X reaches the threshold — a below-threshold cast leaves
 * the graveyard untouched (the "If X is N or more, …instead…" branch simply isn't met, CR). `?? 0` treats a
 * missing xValue as 0. Mirrors the applyPumpEffect / applyUntapLands condX gate. Hidden-info safe: the log
 * records the controller + how many cards moved, never the card identities.
 */
export function applyShuffleGraveyardIntoLibrary(state, atom, ctx) {
  const controller = ctx.controller;
  if (atom?.condX && (ctx.xValue ?? 0) < atom.condX.min) {
    return logEvent(state, { kind: "spell-effect", effect: "shuffle-graveyard-into-library", controller, moved: 0 });
  }
  const player = state.players?.[controller];
  if (!player) return state;
  const graveyard = player.graveyard || [];
  if (graveyard.length === 0) {
    // Empty graveyard — still shuffle the library (CR: you shuffle regardless), a logged near-no-op.
    const shuffled = shuffleControllerLibrary(state, controller);
    return logEvent(shuffled, { kind: "spell-effect", effect: "shuffle-graveyard-into-library", controller, moved: 0 });
  }
  // Move all graveyard cards into the library (order is irrelevant — the shuffle randomizes), empty the GY.
  const merged = {
    ...state,
    players: {
      ...state.players,
      [controller]: { ...player, library: [...(player.library || []), ...graveyard], graveyard: [] },
    },
  };
  const shuffled = shuffleControllerLibrary(merged, controller);
  return logEvent(shuffled, { kind: "spell-effect", effect: "shuffle-graveyard-into-library", controller, moved: graveyard.length });
}

/**
 * ===== EXPLORE ===== (CR 701.44) — the exploring creature's controller reveals the top card of their
 * library: a LAND goes to their hand; otherwise a +1/+1 counter is put on the exploring creature and the
 * card stays on top (the controller's CR 701.44a "back or graveyard" choice — resolved deterministically to
 * keep-on-top, a legal option; an interactive keep/bin picker is a future refinement, like scry's picker).
 *
 * The exploring permanent is the SOURCE (atom.target "self" → ctx.sourceId: Merfolk Branchwalker's ETB) or
 * the TRIGGERING creature (atom.target "thatCreature" → ctx.triggeringPermanentId: Path of Discovery). The
 * reveal uses that permanent's CONTROLLER's library; if the permanent has already left the battlefield the
 * reveal/land-to-hand still happens (no counter then — CR 701.44b) using ctx.controller as the library owner.
 * "explores N times" runs the whole process N times (Jadelight Ranger's "then it explores again" → 2).
 * An empty library reveals nothing (a legal no-op). Pure data mutation — serialization-safe.
 */
export function applyExplore(state, atom, ctx) {
  const times = Math.max(1, atom.times || 1);
  const subjectId = atom.target === "thatCreature" ? ctx.triggeringPermanentId : ctx.sourceId;
  let next = state;
  for (let i = 0; i < times; i++) {
    const lk = subjectId ? findPermanent(next, subjectId) : null;
    const controller = lk ? lk.controller : ctx.controller;
    const player = next.players?.[controller];
    if (!player || (player.library || []).length === 0) {
      next = logEvent(next, { kind: "spell-effect", effect: "explore", controller, revealed: null });
      continue; // empty library — the explore reveals nothing (still a legal explore)
    }
    const top = player.library[0];
    if (isLandCard(top)) {
      next = { ...next, players: { ...next.players, [controller]: {
        ...player, library: player.library.slice(1), hand: [...(player.hand || []), top],
      } } };
      next = logEvent(next, { kind: "spell-effect", effect: "explore", controller, revealed: top.name, land: true });
    } else {
      // Nonland → +1/+1 on the exploring creature (only if still on the battlefield), card kept on top.
      if (lk && isCreatureCard(lk.permanent.card)) {
        next = addCounter(next, { permanentId: subjectId, type: "+1/+1", amount: 1 });
      }
      next = logEvent(next, { kind: "spell-effect", effect: "explore", controller, revealed: top.name, land: false });
    }
  }
  return next;
}

/**
 * EXPLORE clause parser (CR 701.44) — migrated from parser.js parseExtendedAtom (seam batch 1).
 * A keyword action on the SOURCE / TRIGGERING creature: reveal the top card of the controller's library;
 * a LAND → its owner's hand; otherwise put a +1/+1 counter on the exploring creature and keep the card on
 * top (a legal CR 701.44a "back or graveyard" choice — resolved deterministically to keep-on-top; an
 * interactive keep/bin picker is a future refinement, mirroring scry's picker). detectTriggers rewrites the
 * pronoun "it" → "this creature" (a SELF trigger: Merfolk Branchwalker, Emperor's Vanguard) or "the
 * triggering creature" (a non-self enters-watcher: Path of Discovery); Jadelight Ranger's "it explores, then
 * it explores again" → two "this creature explores" clauses, modeled as two explore atoms by the sequence
 * parser. "explores X times" (a variable count, Jadelight Spelunker) is deliberately NOT matched → LOW →
 * Arbiter (FN-safe). Pure (no parser.js import — cycle-safe); normalizes the clause exactly as
 * parseExtendedAtom does, then whole-clause-anchored matches. Registered via registerClauseParser in parser.js.
 */
export function exploreClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'"); // normalize curly apostrophe (parseExtendedAtom parity)
  if (/^this creature explores$/.test(t)) return { op: "explore", target: "self", targetType: null };
  if (/^the triggering creature explores$/.test(t)) return { op: "explore", target: "thatCreature", targetType: null };
  return null;
}

/**
 * Library keyword-action clause parsers (migrated from parseExtendedAtom, seam batch 6 / Wave A1):
 *   - discover N (LCI, CR 701.x) — exile-top-until-nonland-MV≤N, cast free / to hand (applyDiscoverAtom +
 *     the action-layer cast-free/to-hand decision). FIXED numeric N only.
 *   - discover X = "that creature's toughness" (Pantlaza) — X read at resolution from ctx.triggeringPermanentId.
 *   - standalone "[then] shuffle [your library]" (CR 103.2) — shuffles the controller's library.
 *   - scry N / surveil N (numeric only; a variable/modal form leaves the anchor → low → Arbiter).
 * All non-targeted, whole-clause-anchored. Pure (no parser.js import — cycle-safe); normalizes the clause
 * exactly as parseExtendedAtom does. Registered via registerClauseParser in parser.js.
 */
export function libraryKeywordClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const dsc = t.match(/^discover (\d+)$/);
  if (dsc) return { op: "discover", amount: parseInt(dsc[1], 10), targetType: null };
  if (/^discover x, where x is that creature's toughness$/.test(t)) return { op: "discover", amountToughnessOfTrigger: true, targetType: null };
  if (/^(?:then |and )?shuffle(?: your library)?$/.test(t)) return { op: "shuffle", targetType: null };
  let m = t.match(/^scry (\d+)$/);
  if (m) return { op: "scry", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^surveil (\d+)$/);
  if (m) return { op: "surveil", amount: parseInt(m[1], 10), targetType: null };
  // Plan-the-Heist shape (S6/Kellan): conditional surveil — the condition is enforced at the
  // ATOM (onlyIfHandEmpty), so the whole card (surveil-if + the draw clause) models natively.
  m = t.match(/^surveil (\d+) if you have no cards in hand$/);
  if (m) return { op: "surveil", amount: parseInt(m[1], 10), onlyIfHandEmpty: true, targetType: null };
  return null;
}

/**
 * CASCADE (CR 702.85) clause parser — the SYNTHETIC effect clause triggers.detectTriggers emits for the Cascade
 * KEYWORD ("cascade through your library"). It is NOT printed oracle text — Cascade's real trigger lives in
 * stripped reminder parens — so this matcher is anchored EXACTLY to the synthesized sentinel and to nothing in
 * the printed corpus (no real card says "cascade through your library" as parseable text; the printed line is
 * the reminder, stripped before clause parsing). Emits a NON-targeted `cascade` atom (no targetType →
 * programNeedsChosenTarget=false → the trigger routes natively via the α1 non-targeted path); the cascading
 * spell's mana value rides on ctx (threaded at cast — ctx.cascadeSpellMv). A different shape never matches →
 * no atom → the card stays on the Arbiter (CREED FN-safe). Pure. Registered via registerClauseParser in parser.js.
 */
export function cascadeClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  if (t === "cascade through your library") return { op: "cascade", targetType: null };
  return null;
}

/**
 * MILL clause parser (CR 701.13) — migrated from parseExtendedAtom (seam batch 11 / Wave A6).
 * Top N of a library to its graveyard. Non-targeted only: "you mill N" (controller) / "each opponent mills N"
 * / "each player mills N" (mutually-exclusive anchors). "TARGET player mills N" is deferred (a targeted mill
 * on a trigger could first-legal the controller); a variable "mills X cards" isn't matched → low → Arbiter.
 * CDMG-MILL (the Sword of Body and Mind payload): "that player mills N" / "they mill N" — the just-damaged
 * player (who:"damagedPlayer"), mirroring the rad CDMG-PLAYER-PAYOFF subject vocabulary in parser.js. This is
 * NON-targeted (the referent is the combat-damage event's damagedPlayer, not a chosen target), so it routes on
 * a trigger flush with no first-legal hazard and clean-no-ops as a spell (no ctx.damagedPlayerId → applyMill's
 * damagedPlayer branch mills nobody). A FIXED-N count only (a variable "mills X" stays low → Arbiter).
 * Pure (no parser.js import — cycle-safe); uses the shared NUM_WORD leaf map.
 */
export function millClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  let m = t.match(/^(?:you )?mill (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent mills (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  m = t.match(/^each player mills (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  m = t.match(/^(?:that player|they) mills? (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "damagedPlayer", targetType: null };
  return null;
}

/**
 * TUTOR clause parser (CR 701.19) — migrated from parseExtendedAtom (seam batch 12e / Wave B2b), verbatim.
 * SIX contiguous match blocks, FIRST-MATCH ORDER LOAD-BEARING (tm/ttm/bfm share the `^search your library for
 * a…` prefix; tm fetch-to-hand wins over ttm fetch-to-top wins over bfm ramp-1, and the bare-both "up to two"
 * mf must precede the split spm — preserve tm,ttm,bfm,mf,spm,lfh exactly):
 *   tm  — fetch-to-HAND single card (optional allowlisted filter + optional MV cap)
 *   ttm — fetch-to-TOP single card (shuffle-then-place; same optional filter/MV)
 *   bfm — RAMP-1 / RAMP-TYPED single LAND to battlefield (guaranteed-land guard + ambiguous-basic guard)
 *   mf  — RAMP-MULTI up-to-N LANDS to battlefield (same land/ambiguous-basic guard)
 *   spm — RAMP-SPLIT up-to-two LANDS, one→battlefield-tapped + one→hand (ordered destinations)
 *   lfh — LAND-FROM-HAND optional put (Growth Spiral) — sourceZone:"hand", lands only, untapped
 * A regex-matched-but-rejected case (non-land/unmodeled-filter/ambiguous-basic/unmodeled-MV) returns null so
 * the clause falls through to the rest of the dispatch — identical to the old in-function `return null`.
 * Pure (no parser.js import — cycle-safe); helpers (parseTutorFilter/parseTutorMv/BASIC_LAND_SUBTYPES/
 * UP_TO_N_WORD) come from the parseHelpers leaf. Registered via registerClauseParser in parser.js.
 */
export function tutorClauseParser(clause, ctx = {}) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // bfx — SEARCH→BATTLEFIELD, MV-CAPPED-BY-X (LIBRARY-TUTOR-TO-BATTLEFIELD): "search your library for a
  // <creature|permanent> card with mana value X or less, put it onto the battlefield, then shuffle" on an
  // {X}-cost spell (Wargate "permanent card", Nature's Rhythm "creature card"). Distinct from bfm (which is
  // LAND-only, guaranteed by the land-guard): here the SAFETY is the MV cap itself — the fetched card's mana
  // value must be <= the chosen X (bound at cast, read at resolution via ctx.xValue). `mvCapX:true` (a) tells
  // applyTutor to build filter.mv = { max: xValue } at resolution and (b) makes the program derive xSpell:true
  // so the cast path enumerates affordable X. CREED: the X cap is NEVER dropped — without a real cap this
  // would fetch ANY creature/permanent (a forbidden FP), so this branch ONLY fires for an {X}-cost spell
  // (ctx.hasX) carrying the literal "mana value x or less", and parseTutorFilter validates the type word.
  // Tried BEFORE bfm so the MV-X shape is claimed here (bfm's regex wouldn't match the "with mana value …"
  // text anyway, but the explicit ordering documents the precedence). A non-creature/permanent type, a fixed
  // numeric cap (that's the tm to-HAND path, not battlefield), or a "graveyard"/rider variant won't match the
  // anchor → falls through → low → Arbiter (Finale's library-and/or-graveyard + X≥10 pump rider stays LOW).
  if (ctx.hasX) {
    // bfxg — SEARCH LIBRARY-AND/OR-GRAVEYARD → BATTLEFIELD, MV-CAPPED-BY-X (Finale of Devastation): "search
    // your library and/or graveyard for a creature card with mana value X or less and put it onto the
    // battlefield" on an {X}-cost spell. Same MV-cap SAFETY as bfx (the fetched card's mana value must be
    // <= the chosen X, bound at cast, read at resolution via ctx.xValue — CR 202.3b), but the candidate pool
    // is the UNION of the caster's LIBRARY and GRAVEYARD: `sourceZones:["library","graveyard"]` tells applyTutor
    // to gather from both zones (tagging each candidate with its zone) and resolveTutorChoice to enter the
    // chosen card from whichever zone it lives in. The library is ALWAYS searched (so the CR-701.19e shuffle
    // always runs — Finale's separate "If you search your library this way, shuffle." reminder is stripped in
    // splitClauses since the tutor's own shuffle covers it). Finale prints "and put" (no comma before "put"),
    // so the anchor accepts "(and )?put" with the "and/or graveyard" zone phrase required. CREED: the X cap
    // is never dropped (mvCapX); a graveyard-only ("search your graveyard …") or library-only variant does NOT
    // match this anchor (the "library and/or graveyard" phrase is mandatory here) → falls through to bfx / low.
    const bfxg = t.match(/^search your library and\/or graveyard for an? (creature|permanent) cards? with mana value x or less(?:,)?(?: reveal (?:it|that card),?)?(?: and)? put (?:it|that card) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
    if (bfxg) {
      const phrase = bfxg[1];
      const base = phrase === "permanent" ? { groups: [], permanentOnly: true } : parseTutorFilter(phrase);
      if (!base) return null; // defensive (the regex already constrains to the two allowed words)
      return {
        op: "tutor",
        filter: { ...base, mvCapX: true }, // mv resolved to { max: ctx.xValue } in applyTutor (CR 202.3b)
        filterLabel: `${phrase} card with mana value X or less`,
        destination: "battlefield",
        entersTapped: !!bfxg[2],
        sourceZones: ["library", "graveyard"], // candidate pool = library ∪ graveyard; enter from the chosen card's zone
        targetType: null,
      };
    }
    // COLOR-QUALIFIED (Green Sun's Zenith "a green creature card with mana value X or less") — an OPTIONAL
    // single leading color word ("green" / "nonwhite") before "creature". The color is peeled into
    // `filter.colors` and enforced upstream by cardMatchesTutorFilter's COLOR gate (which reads the card's
    // enriched `colors` array — CR 105 / 202.2), so only a creature of that color AND MV ≤ X is offered. A
    // color prefix is admitted ONLY on the "creature" phrase (a "green permanent" isn't a printed shape and
    // color-gating a typeless permanent is out of scope) — a "<color> permanent" won't match the anchor. CREED:
    // the color is NEVER dropped — a green-creature fetch that silently ignored "green" would over-fetch (a
    // forbidden FP); the gate makes the color as load-bearing as the MV cap.
    const bfx = t.match(/^search your library for an? (?:(white|blue|black|red|green|nonwhite|nonblue|nonblack|nonred|nongreen) )?(creature|permanent) cards? with mana value x or less,?(?: reveal (?:it|that card),?)?(?: and)? put (?:it|that card) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
    if (bfx) {
      const colorWord = bfx[1]; // undefined when no color prefix
      const phrase = bfx[2];
      // A color prefix is only modeled on "creature" (a "green permanent" filter is out of scope — see above).
      if (colorWord && phrase !== "creature") return null;
      if (colorWord && !TUTOR_COLOR_WORD.has(colorWord)) return null; // defensive (regex already constrains)
      // "creature" → a type-group filter (matches `\bcreature\b` in the type line). "permanent" → no type
      // group (every type matches) PLUS the permanentOnly gate (front-face must be a permanent type, never an
      // instant/sorcery) — "permanent" is intentionally NOT in TUTOR_FILTER_WORDS because `\bpermanent\b`
      // never appears in a real type line, so a group match would be vacuous; the permanentOnly gate is correct.
      const base = phrase === "permanent" ? { groups: [], permanentOnly: true } : parseTutorFilter(phrase);
      if (!base) return null; // defensive (the regex already constrains to the two allowed words)
      const filter = { ...base, mvCapX: true }; // mv resolved to { max: ctx.xValue } in applyTutor (CR 202.3b)
      if (colorWord) filter.colors = [colorWord]; // color gate enforced upstream by cardMatchesTutorFilter
      return {
        op: "tutor",
        filter,
        filterLabel: `${colorWord ? `${colorWord} ` : ""}${phrase} card with mana value X or less`,
        destination: "battlefield",
        entersTapped: !!bfx[3],
        targetType: null,
      };
    }
  }
  // tm — fetch-to-HAND single card.
  const tm = t.match(/^search your library for an? (?:([a-z][a-z ]*?) )?cards?(?: with mana value (\d+(?: or less)?))?,?(?: reveal (?:it|that card|the card),?)?(?: and)? put (?:it|that card|the card) into your hand(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (tm) {
    const phrase = tm[1]; // undefined for an unfiltered "a card"
    const mvCapture = tm[2]; // undefined when there's no "with mana value …"
    const mv = parseTutorMv(mvCapture);
    if (mvCapture !== undefined && mv === null) return null;
    if (phrase === undefined) {
      const filter = mv ? { groups: [], mv } : null;
      const label = mv ? `card with mana value ${mvCapture}` : "card";
      return { op: "tutor", filter, filterLabel: label, destination: "hand", targetType: null };
    }
    const base = parseTutorFilter(phrase);
    if (!base) return null;
    const filter = mv ? { ...base, mv } : base;
    const label = mv ? `${phrase} card with mana value ${mvCapture}` : `${phrase} card`;
    return { op: "tutor", filter, filterLabel: label, destination: "hand", targetType: null };
  }
  // ttm — fetch-to-TOP single card.
  const ttm = t.match(/^search your library for an? (?:([a-z][a-z ]*?) )?cards?(?: with mana value (\d+(?: or less)?))?,?(?: reveal (?:it|that card|the card),?)?(?: (?:then|and))* shuffle(?: your library)? and put (?:it|that card|the card) on top\.?$/);
  if (ttm) {
    const phrase = ttm[1];
    const mvCapture = ttm[2];
    const mv = parseTutorMv(mvCapture);
    if (mvCapture !== undefined && mv === null) return null;
    if (phrase === undefined) {
      const filter = mv ? { groups: [], mv } : null;
      const label = mv ? `card with mana value ${mvCapture}` : "card";
      return { op: "tutor", filter, filterLabel: label, destination: "top", targetType: null };
    }
    const base = parseTutorFilter(phrase);
    if (!base) return null;
    const filter = mv ? { ...base, mv } : base;
    const label = mv ? `${phrase} card with mana value ${mvCapture}` : `${phrase} card`;
    return { op: "tutor", filter, filterLabel: label, destination: "top", targetType: null };
  }
  // bfm — RAMP-1 / RAMP-TYPED single LAND to battlefield.
  const bfm = t.match(/^search your library for an? ([a-z][a-z ,]*?) cards?,?(?: reveal (?:it|that card),?)?(?: and)? put (?:it|that card) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (bfm) {
    const phrase = bfm[1];
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!bfm[2], targetType: null };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic battlefield tutor → low → Arbiter
  }
  // mf — RAMP-MULTI up-to-N LANDS (or PLAIN CREATURES) to battlefield. "put them" (the ramp forms) OR "put
  // those cards" (Defense of the Heart's compound-trigger multi-fetch) — the two printed anaphors for the
  // up-to-N pile; the multi-fetch chains identically for both (resolveTutorChoice re-suspends per remaining).
  const mf = t.match(/^search your library for up to (two|three|four|five) ([a-z][a-z ,]*?) cards,? put (?:them|those cards) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (mf) {
    const phrase = mf[2];
    const count = UP_TO_N_WORD[mf[1]];
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!mf[3], remaining: count, targetType: null };
    }
    // MULTI-FETCH-CREATURES-TO-BATTLEFIELD (Defense of the Heart) — an up-to-N fetch of PLAIN "creature" cards
    // straight onto the battlefield. Faithful: cardMatchesTutorFilter selects exactly the caster's creature
    // cards, and resolveTutorChoice's battlefield path enters each via enterCardFromZone (ETB triggers fire),
    // chaining `remaining` picks exactly like the land ramp. Gated to the EXACT single unqualified `creature`
    // filter (one group `["creature"]`, no MV cap / subtype / union / tapped rider) — the corpus's only such
    // card — so no filtered / typed / non-creature multi-fetch can slip through (a wrong-cheat FP would be
    // forbidden, CREED). A subtyped or unioned creature fetch (none in the corpus) still falls through → Arbiter.
    if (filter && filter.groups.length === 1 && filter.groups[0].length === 1 && filter.groups[0][0] === "creature") {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!mf[3], remaining: count, targetType: null };
    }
    return null; // a non-land / non-plain-creature / unmodeled-filter / ambiguous-basic multi-fetch → low → Arbiter
  }
  // mfx — RAMP-MULTI-X up-to-X LANDS to battlefield, count from a board source (Traverse the Outlands "X =
  // greatest power among creatures you control"; Boundless Realms "X = number of lands you control"). The X is
  // a CARDINALITY (how many to fetch), resolved at resolution via countForSpec — mirrors the for-each token
  // count path (createTokenClauseParser mtf), reusing the same parseCountSource resolver and the same
  // RAMP-MULTI land guard as `mf` above. Two sentences (the count clause ends in a period, then "Put those
  // cards…") arrive as ONE clause; the regex spans both. The count phrase is normalized the same way the
  // dynamic-token parser does — an optional leading "the" and "number of" are stripped before parseCountSource,
  // which wants the bare board phrase ("lands you control", "greatest power among creatures you control"). An
  // unmodeled count source (parseCountSource → null — e.g. "number of tapped creatures you control") drops the
  // whole clause → low → Arbiter (CREED: a fetch count is NEVER fabricated, and X is never silently treated as
  // a fixed number). Non-basic-land / ambiguous-basic filters reject via the shared guard, exactly like `mf`.
  const mfx = t.match(/^search your library for up to x ([a-z][a-z ,]*?) cards,? where x is (?:the )?(?:number of )?(.+?)[.,]?\s*(?:then |and )?put (?:them|those cards) onto the battlefield( tapped)?(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (mfx) {
    const phrase = mfx[1];
    const countFor = parseCountSource(mfx[2], { allowScopes: true });
    if (!countFor) return null; // unmodeled count source → low → Arbiter (never a fabricated fetch count)
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "battlefield", entersTapped: !!mfx[3], countFor, targetType: null };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic X-fetch → low → Arbiter
  }
  // spm — RAMP-SPLIT up-to-two LANDS, one→battlefield-tapped + one→hand.
  const spm = t.match(/^search your library for up to two ([a-z][a-z ,]*?) cards,? reveal those cards,? put one onto the battlefield( tapped)? and the other into your hand(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (spm) {
    const phrase = spm[1];
    const filter = parseTutorFilter(phrase);
    const guaranteedLand = (g) => g.includes("land") || g.some((w) => BASIC_LAND_SUBTYPES.has(w));
    const someBasic = filter && filter.groups.some((g) => g.includes("basic"));
    const allBasic = filter && filter.groups.every((g) => g.includes("basic"));
    if (filter && filter.groups.every(guaranteedLand) && !(someBasic && !allBasic)) {
      return {
        op: "tutor", filter, filterLabel: `${phrase} card`, remaining: 2,
        destinations: [{ zone: "battlefield", tapped: !!spm[2] }, { zone: "hand" }],
        targetType: null,
      };
    }
    return null; // a non-land / unmodeled-filter / ambiguous-basic split-fetch → low → Arbiter
  }
  // lfh — LAND-FROM-HAND optional put (Growth Spiral).
  const lfh = t.match(/^(?:you may )?put a land card from your hand onto the battlefield( tapped)?\.?$/);
  if (lfh) {
    return { op: "tutor", sourceZone: "hand", filter: { groups: [["land"]] }, filterLabel: "land card from your hand", destination: "battlefield", entersTapped: !!lfh[1], targetType: null };
  }
  return null;
}

export const libraryResolvers = {
  "tutor": applyTutor,
  "shuffle": applyShuffle,
  "shuffle-graveyard-into-library": applyShuffleGraveyardIntoLibrary, // SHUFFLE-GY-INTO-LIBRARY (Finale of Revelation) — move controller's whole GY into library, then shuffle; condX-gated
  "scry": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "scry"),
  "surveil": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "surveil"),
  "reorder-top": applyReorderTopAtom, // ===== REORDER-TOP (Ponder) ===== look at top N, put them ALL back in any order (reuses the scry-surveil choice in reorder mode — nothing bottomed), with an optional shuffle. Ponder flips native-spell.
  "impulse-dig": applyImpulseDigAtom,
  "dig-land-to-battlefield": applyDigLandToBattlefieldAtom, // DIG-LAND-TO-BATTLEFIELD (Silverback Elder) — look top N, put a land onto the battlefield, rest → bottom random. Settled by resolveDigLandChoice.
  "discover": applyDiscoverAtom, // ===== DISCOVER ===== exile-top-until-nonland-MV<=N → park for cast-free/hand (action layer). Pantlaza + Primordial Gnawer flip native-trigger (PR #325 + PANTLAZA PR2).
  "cascade": applyCascadeAtom, // ===== CASCADE (CR 702.85) ===== exile-top-until-nonland-MV<spell-MV → park for cast-free/decline (action layer). The Cascade keyword (Bloodbraid Elf, Shardless Agent, …) flips native via the synthesized selfCast trigger.
  "mill": applyMill,
  "explore": applyExplore, // ===== EXPLORE ===== (CR 701.44) reveal top: land→hand, else +1/+1 + keep-on-top. Ixalan ETB family flips native-trigger.
  "reveal-top-to-hand": applyRevealTopToHand, // ===== REVEAL-TOP-TO-HAND (Yuriko) ===== reveal top → hand + stamp its MV (state.revealedCardMV) for a following drain.
  "impulse-exile": applyImpulseExileAtom, // ===== IMPULSE-EXILE-AND-PLAY ===== exile top card → exile face-up, stamp `_impulse`/`_impulseTurn`; play permission offered THIS TURN at the action layer (full-cost cast / play-land from exile), cleared at cleanup. Professional Face-Breaker's sac-Treasure ability flips native-mixed.
  "genesis-wave": applyGenesisWave, // ===== GENESIS-WAVE ===== ({X} spell) reveal top X → put all eligible permanents (MV≤X) onto battlefield → mill the rest. Genesis Wave flips native-spell.
  "reveal-put-filtered": applyRevealPutFiltered, // ===== REVEAL-THAT-MANY-PUT-FILTERED (Gishath) ===== combat-damage trigger: reveal that many (= combatDamageAmount) → put all matching <subtype> creatures onto battlefield → bottom the rest random. Gishath/Pantlaza flip native-trigger.
  "reveal-until-n-lands": applyRevealUntilNLands, // ===== REVEAL-UNTIL-N-LANDS (Open the Way) ===== ({X} spell, X≤players) reveal top until X lands → all lands onto battlefield tapped → rest to bottom random. Open the Way flips native-spell.
  "reveal-top-conditional": applyRevealTopConditional, // ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== reveal top: creature → onto battlefield (fires ETB); else put on bottom (deterministic "you may", like explore).
  "animist-awakening": applyAnimistAwakening, // ===== ANIMIST'S AWAKENING ===== ({X} spell) reveal top X → put all LANDS onto battlefield tapped → bottom the rest random; spell-mastery (2+ IS in GY) untaps those lands. Animist's Awakening flips native-spell.
};
