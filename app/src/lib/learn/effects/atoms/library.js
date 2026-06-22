/**
 * effects/atoms/library.js — library-manipulation atoms (tutor, shuffle, scry, surveil, impulse-dig,
 * discover, mill).
 */

import { logEvent, opponentsOf, findPermanent, shuffleLibrary, millCards, applyImpulseDig, creatureToughness } from "../../gameState.js";
import { setPendingTutorChoice, setPendingScryChoice, setPendingImpulseDigChoice } from "../../pendingChoice.js";
import { countForSpec } from "./shared.js";

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
/** Does a library card match a tutor's filter? A null filter (unfiltered "a card") matches ALL. */
export function cardMatchesTutorFilter(card, filter) {
  if (!filter || !Array.isArray(filter.groups) || filter.groups.length === 0) return true;
  // Match the FRONT face only: a library card has just its front-face characteristics
  // (CR 712.4a), but the enriched type line is the COMBINED "Front // Back" for an MDFC —
  // so a [artifact] tutor must NOT match a card whose FRONT is a land and back an artifact.
  const type = String(card?.type || card?.type_line || "").toLowerCase().split(" // ")[0];
  return filter.groups.some((group) => group.every((w) => new RegExp(`\\b${w}\\b`).test(type)));
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
  const sourceZone = atom.sourceZone === "hand" ? "hand" : "library";
  const candidates = (player[sourceZone] || [])
    .filter((c) => cardMatchesTutorFilter(c, atom.filter))
    .map((c) => ({ id: c.id, name: c.name }));
  return setPendingTutorChoice(state, {
    controller,
    candidates,
    sourceZone,
    sourceName: ctx.cardName || null,
    filterLabel: atom.filterLabel || null,
    // RAMP-1 — destination "battlefield" (+ entersTapped) puts the fetched card onto the battlefield
    // instead of the hand (Rampant Growth / Farhaven Elf). Defaults to "hand" (the P3.2 tutor).
    destination: atom.destination === "battlefield" ? "battlefield" : "hand",
    entersTapped: !!atom.entersTapped,
    // RAMP-MULTI — "up to two": fetch up to `remaining` matching lands (resolveTutorChoice chains the rest).
    remaining: atom.remaining || 1,
    // RAMP-SPLIT (Cultivate / Kodama's Reach) — an ordered per-fetch destination sequence; setPendingTutorChoice
    // derives this pick's destination from its head and carries the tail to the next chained fetch.
    destinations: Array.isArray(atom.destinations) ? atom.destinations : null,
  });
}

/**
 * Scry / surveil (CR 701.18 / 701.43) — flag a resolution-time CHOICE: peek the top N of the
 * controller's library and set state.pendingChoice (runProgram pauses the program here, like a
 * tutor). The driver surfaces a keep/move picker (the player) or auto-keeps-all (Expert/opponent);
 * resolveScryChoice (runProgram) applies the reorder + resumes. An empty library is a logged no-op.
 * Hidden-info safe: it's the searcher's OWN library, so the candidate names are theirs to see.
 */
export function applyScrySurveilAtom(state, atom, ctx, mode) {
  const player = state.players[ctx.controller];
  if (!player) return state;
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: mode, controller: ctx.controller, count: 0 });
  }
  const cards = player.library.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  return setPendingScryChoice(state, { controller: ctx.controller, mode, cards, sourceName: ctx.cardName || null });
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

/** Mill (CR 701.13) — "you mill N cards" (the controller), "each opponent mills N cards", or
 * "each player mills N cards" (EP-3). Top N of each milled player's library → their graveyard. Non-targeted. */
export function applyMill(state, atom, ctx) {
  let next = state;
  const amount = atom.amount || 0;
  if (atom.who === "eachPlayer") {
    // ===== EACH-PLAYER ===== (EP-3) EVERY player mills N (symmetric — Mind Funeral-adjacent / Winds of
    // Rebuke rider). Non-targeted → identical on a spell or trigger; an eliminated player isn't in the map.
    for (const pid of Object.keys(next.players)) next = millCards(next, { playerId: pid, count: amount });
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) next = millCards(next, { playerId: opp, count: amount });
  } else {
    next = millCards(next, { playerId: ctx.controller, count: amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "mill", who: atom.who || "controller", amount });
}

/** P3.2 shuffle — "[then] shuffle [your library]" as its own clause (CR 103.2). */
export function applyShuffle(state, atom, ctx) {
  if (!state.players[ctx.controller]) return state;
  const next = shuffleControllerLibrary(state, ctx.controller);
  return logEvent(next, { kind: "spell-effect", effect: "shuffle", controller: ctx.controller });
}

export const libraryResolvers = {
  "tutor": applyTutor,
  "shuffle": applyShuffle,
  "scry": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "scry"),
  "surveil": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "surveil"),
  "impulse-dig": applyImpulseDigAtom,
  "discover": applyDiscoverAtom, // ===== DISCOVER ===== exile-top-until-nonland-MV<=N → park for cast-free/hand (action layer). Pantlaza + Primordial Gnawer flip native-trigger (PR #325 + PANTLAZA PR2).
  "mill": applyMill,
};
