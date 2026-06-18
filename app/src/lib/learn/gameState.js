/**
 * Phase 6 — Learn-to-Play: gameState.js
 *
 * Pure data layer. No fetches. No React. No game logic — the engine
 * (PR2) consumes this; legalChoices (PR3) reads it; LearnView (PR6)
 * renders it. Everything here is deterministic and immutable: every
 * helper returns a NEW state object rather than mutating in place. We
 * pay the GC cost for testability — small game states (~hundreds of
 * objects max) make the structural copies cheap.
 *
 * Design source of truth: `docs/phase6-learn-to-play.md` §4 (Data shapes).
 *
 * Coordinate system:
 *   - Players: "user" + opponent(s). Standard (1v1) uses {user, ai};
 *     Commander (4P FFA) uses {user, ai1, ai2, ai3}. Seats come from
 *     state.turnOrder / Object.keys(state.players), never a hardcoded
 *     constant (see §11.2 of the design doc).
 *   - Zones (per player): library, hand, battlefield, graveyard, exile,
 *     command. Stack is shared and lives at the top-level state.
 *   - Permanents have stable IDs (separate from card IDs) so attachments
 *     and counters survive shuffles within a zone.
 *
 * Naming conventions:
 *   - `create*` — factory, returns fresh data
 *   - `apply*` / `with*` — pure update, returns a new state
 *   - Everything else — pure read, returns a value
 */

import { printedPower, printedToughness, counterPtDelta } from "./ptPrimitive.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { hasKeyword } from "./keywords.js";

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;

function nextId(prefix) {
  _idCounter += 1;
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}-${_idCounter}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`;
}

/**
 * Reset the in-process ID counter. ONLY for tests — never call in
 * production code. Test isolation depends on this. (Legacy fallback path:
 * factories without an explicit `id` and any un-migrated caller still mint
 * through `nextId`; the authoritative, serialize-stable counter is
 * `state.idSeq` via `mintId` below.)
 */
export function _resetIdsForTests() {
  _idCounter = 0;
}

/**
 * Mint the next stable id of a given kind, threaded through `state.idSeq`.
 * Returns `{ id, state }` — the returned state has the counter advanced, so
 * the caller MUST build its result from it (not from the input state) or the
 * counter silently fails to move and the next mint collides.
 *
 * Deterministic and reproducible: the same state in always yields the same id
 * (`perm-7`, `stk-8`, …). This is what lets a serialized game restore to
 * byte-identical ids — the keystone of Phase-7 mid-game save/resume. Unlike
 * the legacy module-global `nextId`, the counter lives in game state, so it
 * survives a serialize → restore round-trip and never depends on process
 * lifetime or `crypto`/`Date` entropy.
 */
export function mintId(state, prefix) {
  const seq = (state.idSeq || 0) + 1;
  return { id: `${prefix}-${seq}`, state: { ...state, idSeq: seq } };
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Standard (1v1) seats — the default mode and the only seats the
// engine's ~250 Standard tests ever see.
export const PLAYER_IDS = ["user", "ai"];

// Commander (4P FFA) seats. Opponents are ai1/ai2/ai3 so no single "ai"
// ever collides with a specific pod seat.
export const COMMANDER_PLAYER_IDS = ["user", "ai1", "ai2", "ai3"];

// The two supported formats. `state.mode` is one of these; it equals the
// string returned by formatDetection.detectDeckFormat (see §11.9).
export const MODES = ["standard", "commander"];

// Every player ID the engine may legally encounter across both modes,
// for VALIDATION ONLY — the actual seats in a given game come from
// Object.keys(state.players) / state.turnOrder, never this set.
const VALID_PLAYER_IDS = new Set([...PLAYER_IDS, ...COMMANDER_PLAYER_IDS]);

export const ZONES = [
  "library", "hand", "battlefield", "graveyard", "exile", "command",
];

export const MANA_COLORS = ["W", "U", "B", "R", "G", "C"];

export const PHASES = [
  "beginning", "precombat-main", "combat", "postcombat-main", "ending",
];

export const STEPS = {
  beginning: ["untap", "upkeep", "draw"],
  "precombat-main": ["main"],
  combat: [
    "beginning-of-combat",
    "declare-attackers",
    "declare-blockers",
    "first-strike-damage",
    "combat-damage",
    "end-of-combat",
  ],
  "postcombat-main": ["main"],
  ending: ["end", "cleanup"],
};

const STARTING_LIFE_COMMANDER = 40;

// ─── Factories ────────────────────────────────────────────────────────────────

function emptyManaPool() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

/**
 * Create a new permanent (something on the battlefield). The `card` field
 * is the snapshot of the printed card; everything else is per-permanent
 * state. Cards leaving the battlefield drop their permanent ID.
 */
export function createPermanent({ id, card, controller, tapped = false, summoningSick = true }) {
  if (!card) throw new Error("createPermanent requires a card");
  if (!VALID_PLAYER_IDS.has(controller)) throw new Error(`createPermanent requires a valid controller (one of ${[...VALID_PLAYER_IDS].join(", ")})`);
  return {
    // Caller-supplied (deterministic, via mintId) wins; else legacy fallback.
    id: id || nextId("perm"),
    card,
    controller,
    tapped,
    summoningSick,
    counters: {},
    damageMarked: 0,     // combat (and other) damage marked this turn; clears at cleanup
    attachments: [],     // ids of permanents (equipment/auras) attached to THIS one
    attachedTo: null,    // id of the permanent THIS is attached to (for equipment/auras)
    enteredOnTurn: null, // set by the engine when entering the battlefield
  };
}

/**
 * Effective power / toughness of a creature permanent — THE numbers all readers
 * use (combat, UI, legality, SBAs), so characteristics can't drift between
 * callers (CR 613). `state` is optional:
 *
 *   - WITH state: delegate to the CR 613 layer engine
 *     (`permanentPower`/`permanentToughness`), which applies every continuous
 *     effect (counters in 7c, anthems/lords/Omnath, pump-until-EOT) in layer
 *     order. Returns the TRUE CR value — can be negative; combat floors at 0
 *     (Math.max(0, …) at the call sites) and the lethal SBA reads it raw.
 *   - WITHOUT state: printed value + ±1/±1 counters only (no continuous
 *     effects can be resolved), via the shared ptPrimitive — preserving the
 *     "no state ⇒ printed only" contract.
 *
 * The delegation edge points OUTWARD (gameState → layers); layers never imports
 * gameState (it reads ptPrimitive + keywords), so the cycle never closes
 * (eng-review F3 — ptPrimitive is the cut point). Phase-7 PR-11.
 *
 * Delegation requires the permanent to be ON a battlefield in `state` (continuous
 * effects can only apply there). An off-battlefield or null-id permanent — e.g. a
 * CR 603.10a look-back snapshot of a creature that just died — reads as its
 * printed value + counters (last-known characteristics), never a silent 0.
 */
export function creaturePower(permanent, state = null) {
  if (!permanent?.card) return 0;
  if (state && permanent.id != null && findPermanent(state, permanent.id)) {
    return permanentPower(state, permanent.id);
  }
  return printedPower(permanent) + counterPtDelta(permanent);
}
export function creatureToughness(permanent, state = null) {
  if (!permanent?.card) return 0;
  if (state && permanent.id != null && findPermanent(state, permanent.id)) {
    return permanentToughness(state, permanent.id);
  }
  return printedToughness(permanent) + counterPtDelta(permanent);
}

/**
 * CR 702.12: does this permanent have indestructible right now? Reads the layer engine
 * (permanentHasKeyword) so a GRANTED indestructible is honored, not just a printed keyword —
 * an Equipment/Aura ("Equipped creature has indestructible"), an anthem ("Creatures you control
 * have indestructible"), or a self-grant ("Artifacts you control are indestructible"). The single
 * indestructible check for the whole native engine: the destroy effect (CR 702.12b — can't be
 * destroyed) and the lethal-damage SBA (CR 704.5g — not destroyed by lethal/deathtouch damage)
 * both call it.
 *
 * NOTE the carve-out lives at the CALL SITE, not here: indestructible does NOT save a permanent
 * from 0-or-less toughness (CR 704.5f), sacrifice, exile, or bounce — none of those is "destroy".
 *
 * Mirrors creaturePower/creatureToughness: an on-battlefield permanent reads the full layer-aware
 * value; an off-battlefield / null-id snapshot reads the printed keyword (last-known
 * characteristics), never a silent false.
 */
export function isIndestructible(permanent, state = null) {
  if (!permanent?.card) return false;
  if (state && permanent.id != null && findPermanent(state, permanent.id)) {
    return permanentHasKeyword(state, permanent.id, "indestructible");
  }
  return hasKeyword(permanent.card, "indestructible");
}

// ===== PLANESWALKER / LOYALTY (PW-1) =====

/**
 * Type-line predicate: is this card a planeswalker? Reads the printed type line, or — for a
 * double-faced card — any face that's a planeswalker (the back of a flip-walker). Pure card read,
 * mirroring isIndestructible's printed-fallback contract. The single source of truth every reader
 * (resolvers ETB, legalChoices offer, actionDispatcher, combat, coverage) shares.
 */
export function isPlaneswalker(card) {
  const t = String(card?.type || card?.type_line || "");
  if (/Planeswalker/.test(t)) return true;
  const faces = card?.card_faces;
  return Array.isArray(faces) && faces.some((f) => /Planeswalker/.test(String(f?.type_line || f?.type || "")));
}

/**
 * Does this card CAST / ENTER as a planeswalker? — its FRONT face is a planeswalker. Distinct from
 * `isPlaneswalker` (which is true if ANY face is one): a creature-front double-faced card (Jace,
 * Vryn's Prodigy; Nissa, Vastwood Seer) has a planeswalker BACK face but casts and enters as its
 * creature front, so it must NOT hit the planeswalker cast/ETB/classify paths (it would otherwise
 * route to the Arbiter and get a spurious back-face loyalty counter). A modal/transforming DFC is
 * treated by its front face (the conservative default — face-choice/transform isn't modeled). A
 * single-faced planeswalker (no `card_faces`) falls back to its own type line.
 */
export function castsAsPlaneswalker(card) {
  const faces = card?.card_faces;
  const frontType = Array.isArray(faces) && faces.length > 0
    ? String(faces[0]?.type_line || faces[0]?.type || "")
    : String(card?.type || card?.type_line || "");
  return /Planeswalker/.test(frontType);
}

/**
 * The starting loyalty a planeswalker enters with (CR 306.5b) — its printed `loyalty`, or the
 * loyalty on its planeswalker FACE (DFC). Returns the integer, or null when it isn't a finite
 * number (an "X"/"*" printed loyalty — that card never classifies native, and the 0-loyalty SBA
 * only ever fires on a planeswalker that actually entered WITH a loyalty counter, so a null here
 * can never insta-kill one).
 */
export function startingLoyalty(card) {
  let raw = card?.loyalty;
  if (raw == null && Array.isArray(card?.card_faces)) {
    raw = card.card_faces.find((f) => /Planeswalker/.test(String(f?.type_line || f?.type || "")))?.loyalty;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Adjust a planeswalker's loyalty by a SIGNED delta (+N add, −N remove, 0 no-op). Unlike
 * removeCounter (which deletes the key at 0), this ALWAYS keeps the `loyalty` key present — even at
 * or below 0 — so the 0-loyalty SBA (destroyZeroLoyaltyPlaneswalkers) can see a walker that a −N
 * cost or combat damage drove to 0 and put it into the graveyard (CR 704.5i). Used for loyalty
 * costs and damage-to-planeswalker alike, so the "key persists at 0" invariant lives in one place.
 */
export function adjustLoyalty(state, { permanentId, delta }) {
  if (!Number.isInteger(delta)) throw new Error("adjustLoyalty: delta must be an integer");
  return updatePermanent(state, permanentId, (p) => ({
    ...p,
    counters: { ...p.counters, loyalty: (p.counters?.loyalty || 0) + delta },
  }));
}

/**
 * Mark (or clear) that a planeswalker's controller has activated one of its loyalty abilities this
 * turn (CR 606.3 — at most one per turn per permanent). Set true when an ability is activated;
 * cleared back to false by untapAll at the controller's untap step (the once-per-turn reset).
 */
export function markLoyaltyActivated(state, permanentId, value = true) {
  return updatePermanent(state, permanentId, (p) => ({ ...p, loyaltyActivatedThisTurn: value }));
}

/**
 * State-based action (CR 704.5i): a planeswalker with 0 (or less) loyalty is put into its owner's
 * graveyard. Only fires on a planeswalker that actually carries a `loyalty` counter key (entered
 * with finite starting loyalty), so a non-numeric-loyalty walker is never spuriously killed.
 * Mirrors destroyLethalCreatures' shape — returns `{ state, dead }` with a look-back snapshot — so
 * callers can fire any leaves-the-battlefield watchers off `dead` (none are modeled yet, but the
 * shape is forward-compatible and consistent with the creature SBA).
 */
export function destroyZeroLoyaltyPlaneswalkers(state) {
  const dead = [];
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      if (!isPlaneswalker(perm.card)) continue;
      const loy = perm.counters?.loyalty;
      if (loy == null) continue; // entered without a finite loyalty counter → SBA doesn't apply
      if (loy <= 0) dead.push({ controller: pid, id: perm.id, name: perm.card?.name || "planeswalker", card: perm.card });
    }
  }
  let next = state;
  for (const d of dead) {
    next = moveCardToZone(next, { playerId: d.controller, fromZone: "battlefield", toZone: "graveyard", cardId: d.id });
  }
  return { state: next, dead };
}

/**
 * Give a player an emblem (CR 114 — "[Player] gets an emblem with '[ability]'"). An emblem is a
 * marker in the command zone with no characteristics except the listed ability; it can't be targeted,
 * removed, or interacted with (CR 114.3). Stored minimally as `{ id, oracle, timestamp }` on the
 * player; the layer engine reads its static abilities (PW-5), the trigger engine its triggered ones
 * (PW-6). Mints a deterministic id + a CR 613.7e timestamp (so an emblem anthem orders against
 * permanents), both threaded through state → serialize-stable. Pure.
 */
export function addEmblem(state, { playerId, oracle }) {
  assertPlayer(playerId);
  const { id, state: s2 } = mintId(state, "emblem");
  const ts = s2.timestampCounter || 0;
  const s3 = { ...s2, timestampCounter: ts + 1 };
  const emblem = { id, oracle: String(oracle || ""), timestamp: ts };
  return withPlayer(s3, playerId, (p) => ({ ...p, emblems: [...(p.emblems || []), emblem] }));
}

/**
 * Create a stack object — a spell on the stack or a triggered/activated
 * ability waiting to resolve. The engine pushes these on, resolves the
 * top, and pops.
 */
export function createStackObject({ id, kind, source, controller, targets = [], cost = null, payload = {} }) {
  const validKinds = new Set(["spell", "triggered-ability", "activated-ability"]);
  if (!validKinds.has(kind)) throw new Error(`createStackObject: invalid kind "${kind}"`);
  if (!VALID_PLAYER_IDS.has(controller)) throw new Error("createStackObject requires a valid controller");
  return {
    // Caller-supplied (deterministic, via mintId) wins; else legacy fallback.
    id: id || nextId("stk"),
    kind,
    source,        // card reference or permanent id
    controller,
    targets: [...targets],
    cost,
    payload,       // ability-specific data (counters added, damage dealt, etc.)
  };
}

/**
 * Create a fresh player state. Pass a library (array of card objects)
 * which becomes the deck; everything else starts empty/zero.
 */
export function createPlayerState({ library = [], life = STARTING_LIFE_COMMANDER, commanderCards = [] } = {}) {
  return {
    life,
    poison: 0,
    commanderDamageFrom: {},  // { otherPlayerId: number }
    manaPool: emptyManaPool(),
    library: [...library],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    command: [...commanderCards],
    emblems: [],              // PW-5: emblems this player owns (objects with a continuous/triggered ability)
    experience: 0,
    landsPlayedThisTurn: 0,
    cardsDrawnThisTurn: 0,
    hasMulliganed: false,
  };
}

/**
 * Create a fresh game state.
 *
 * Standard (1v1): pass `userDeck` + `aiDeck` (+ optional commanders).
 * Commander (4P FFA): pass `mode: "commander"`, `userDeck`, and
 * `opponentDecks` (exactly 3 libraries) + optional `opponentCommanders`
 * (array of per-opponent commander arrays, parallel to opponentDecks).
 *
 * Game starts pre-mulligan at (beginning, untap) — call startGame (or
 * drawCards) to take opening hands.
 */
export function createGameState({
  userDeck,
  aiDeck,
  opponentDecks = null,
  userCommanders = [],
  aiCommanders = [],
  opponentCommanders = [],
  startingLife = STARTING_LIFE_COMMANDER,
  activePlayer = "user",
  mode = "standard",
} = {}) {
  if (!MODES.includes(mode)) {
    throw new Error(`createGameState: mode must be one of ${MODES.join(", ")}`);
  }

  const { players, turnOrder } =
    mode === "commander"
      ? buildCommanderSeats({ userDeck, userCommanders, opponentDecks, opponentCommanders, startingLife })
      : buildStandardSeats({ userDeck, aiDeck, userCommanders, aiCommanders, startingLife });

  return {
    turn: 1,
    // Monotonic id counter threaded through state (Phase-7 PR-0). mintId reads
    // and advances it; carrying it in state (not a module global) is what makes
    // permanent/stack ids stable across a serialize -> restore round-trip.
    idSeq: 0,
    mode,
    activePlayer,
    // Seat rotation. nextInTurnOrder() walks this for turn AND priority
    // passing. Standard is a two-seat toggle; Commander is the four-seat
    // pod order (user → ai1 → ai2 → ai3).
    turnOrder,
    priorityHolder: null,
    phase: "beginning",
    step: "untap",
    stack: [],
    pendingTriggers: [],
    // CR 613 continuous-effects/layers state (Phase-7 PR-9). `continuousEffects`
    // holds resolution-generated effects (pump-until-EOT); static-ability effects
    // (anthems/lords) are synthesized on read, never stored. `timestampCounter` is
    // the monotonic 613.7 source — each permanent gets a timestamp at ETB and each
    // resolution effect at creation. Both are plain JSON ⇒ serialize for free.
    continuousEffects: [],
    timestampCounter: 0,
    // Deterministic PRNG seed THREADED through state — the tutor/shuffle path reads it
    // and advances it (an LCG step) so library shuffles are reproducible AND a game
    // serialized mid-shuffle restores to byte-identical future shuffles (no Math.random).
    rngSeed: 0,
    players,
    log: [],  // append-only history of events for replay/debugging
  };
}

// Build the two Standard (1v1) seats. Output is byte-identical to the
// pre-Commander engine, so the existing Standard test corpus is unaffected.
function buildStandardSeats({ userDeck, aiDeck, userCommanders, aiCommanders, startingLife }) {
  return {
    turnOrder: ["user", "ai"],
    players: {
      user: createPlayerState({ library: userDeck, life: startingLife, commanderCards: userCommanders }),
      ai: createPlayerState({ library: aiDeck, life: startingLife, commanderCards: aiCommanders }),
    },
  };
}

// Build the four Commander (4P FFA) seats: the user plus exactly three
// pod opponents (ai1/ai2/ai3). opponentCommanders is an array of
// per-opponent commander arrays, parallel to opponentDecks.
function buildCommanderSeats({ userDeck, userCommanders, opponentDecks, opponentCommanders, startingLife }) {
  if (!Array.isArray(opponentDecks) || opponentDecks.length !== 3) {
    throw new Error("createGameState: commander mode requires opponentDecks to be an array of exactly 3 decks (the pod)");
  }
  const players = {
    user: createPlayerState({ library: userDeck, life: startingLife, commanderCards: userCommanders }),
  };
  const turnOrder = ["user"];
  opponentDecks.forEach((deck, i) => {
    const seat = `ai${i + 1}`;
    players[seat] = createPlayerState({
      library: deck,
      life: startingLife,
      commanderCards: (Array.isArray(opponentCommanders) && opponentCommanders[i]) || [],
    });
    turnOrder.push(seat);
  });
  return { players, turnOrder };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function assertPlayer(playerId) {
  if (!VALID_PLAYER_IDS.has(playerId)) {
    throw new Error(`Invalid playerId "${playerId}" (must be one of ${[...VALID_PLAYER_IDS].join(", ")})`);
  }
}

function assertZone(zone) {
  if (!ZONES.includes(zone)) {
    throw new Error(`Invalid zone "${zone}" (must be one of ${ZONES.join(", ")})`);
  }
}

function withPlayer(state, playerId, updater) {
  assertPlayer(playerId);
  const next = updater(state.players[playerId]);
  return {
    ...state,
    players: { ...state.players, [playerId]: next },
  };
}

function appendLog(state, entry) {
  return { ...state, log: [...state.log, { turn: state.turn, ...entry }] };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function getPlayer(state, playerId) {
  assertPlayer(playerId);
  return state.players[playerId];
}

export function getZone(state, playerId, zone) {
  assertPlayer(playerId);
  assertZone(zone);
  return state.players[playerId][zone];
}

export function findPermanent(state, permanentId) {
  for (const playerId of Object.keys(state.players)) {
    const found = state.players[playerId].battlefield.find(p => p.id === permanentId);
    if (found) return { permanent: found, controller: playerId };
  }
  return null;
}

export function totalAvailableMana(state, playerId) {
  const pool = state.players[playerId].manaPool;
  return MANA_COLORS.reduce((sum, color) => sum + (pool[color] || 0), 0);
}

/**
 * Standard-only convenience: the lone opponent in a 1v1 game. Hardcoded
 * user↔ai. Mode-aware code MUST NOT use this — use opponentsOf() (all
 * enemies) or nextInTurnOrder() (seat rotation), both of which read the
 * actual seats from state.
 */
export function opponentOf(playerId) {
  assertPlayer(playerId);
  return playerId === "user" ? "ai" : "user";
}

/**
 * Every player other than `playerId`, in turn order. The "enemies"
 * primitive: combat targeting, threat assessment, trap detection.
 *   Standard:  opponentsOf(state, "user")  → ["ai"]
 *   Commander: opponentsOf(state, "user")  → ["ai1", "ai2", "ai3"]
 */
export function opponentsOf(state, playerId) {
  assertPlayer(playerId);
  const order = state.turnOrder || Object.keys(state.players || {});
  return order.filter(id => id !== playerId);
}

/**
 * The next seat after `playerId` in turn order, wrapping around. Drives
 * turn passing and priority passing alike.
 *   Standard:  toggles user↔ai
 *   Commander: user → ai1 → ai2 → ai3 → user
 */
export function nextInTurnOrder(state, playerId) {
  assertPlayer(playerId);
  const order = state.turnOrder || Object.keys(state.players || {});
  const idx = order.indexOf(playerId);
  if (idx === -1) {
    throw new Error(`nextInTurnOrder: "${playerId}" not in turn order [${order.join(", ")}]`);
  }
  return order[(idx + 1) % order.length];
}

// ─── Zone transitions ────────────────────────────────────────────────────────

/**
 * Move a card by ID from one zone to another within the same player.
 * Returns a new state. The card retains its identity through the move.
 *
 * Special cases:
 *   - Moving TO battlefield: caller should pass `becomePermanent: true`
 *     to wrap the card in a permanent. Otherwise the raw card is added
 *     (e.g., for lands going to battlefield via cheat scripts).
 *   - Moving FROM battlefield: the permanent is unwrapped; only the card
 *     object travels. Counters, attachments, etc. are discarded.
 *   - If `cardId` is not found in the source zone, throws.
 */
export function moveCardToZone(state, { playerId, fromZone, toZone, cardId, becomePermanent = false }) {
  assertPlayer(playerId);
  assertZone(fromZone);
  assertZone(toZone);

  const player = state.players[playerId];
  const sourceList = player[fromZone];

  // Battlefield → ? : source list contains permanents, key by permanent.id
  if (fromZone === "battlefield") {
    const index = sourceList.findIndex(p => p.id === cardId);
    if (index === -1) throw new Error(`Permanent ${cardId} not found on ${playerId}'s battlefield`);
    const permanent = sourceList[index];
    // A clone leaving the battlefield reverts to its ORIGINAL card (CR 707.2 — the copy effect
    // only applied on the battlefield; in the graveyard/exile/hand it's the printed card again).
    // `printedCard` is set only on a permanent that entered as a copy; normal permanents use card.
    const card = permanent.printedCard || permanent.card;

    const nextSource = [...sourceList.slice(0, index), ...sourceList.slice(index + 1)];
    let nextDest;
    if (toZone === "battlefield") {
      // Permanent moves to battlefield from battlefield — weird but possible (blinks).
      nextDest = [...player[toZone], permanent];
    } else {
      // Unwrapping: drop permanent state, keep the card.
      nextDest = [...player[toZone], card];
    }
    const result = withPlayer(state, playerId, p => ({
      ...p,
      [fromZone]: nextSource,
      [toZone]: nextDest,
    }));
    // Leaving the battlefield: detach this permanent from its host and unattach anything
    // on it (CR 704.5n/704.5q). A blink (→ battlefield) keeps attachments out of scope here.
    return toZone === "battlefield" ? result : detachPermanentFromAll(result, permanent);
  }

  // Non-battlefield source: cardId is matched against card.id (caller's
  // convention — Card objects are expected to have a unique id field).
  const index = sourceList.findIndex(c => c.id === cardId);
  if (index === -1) throw new Error(`Card ${cardId} not found in ${playerId}.${fromZone}`);
  const card = sourceList[index];
  const nextSource = [...sourceList.slice(0, index), ...sourceList.slice(index + 1)];
  if (toZone === "battlefield" && becomePermanent) {
    // Mint a deterministic permanent id from state.idSeq and build the result
    // from the advanced state (s2) so the counter persists — the single
    // production path that creates a permanent from a card (Phase-7 PR-0).
    const { id: permId, state: s2 } = mintId(state, "perm");
    const nextDest = [...player[toZone], createPermanent({ id: permId, card, controller: playerId })];
    return withPlayer(s2, playerId, p => ({
      ...p,
      [fromZone]: nextSource,
      [toZone]: nextDest,
    }));
  }

  const nextDest = [...player[toZone], card];
  return withPlayer(state, playerId, p => ({
    ...p,
    [fromZone]: nextSource,
    [toZone]: nextDest,
  }));
}

/**
 * Draw N cards from the top of library to hand. If the library is empty
 * mid-draw, draws as many as are available — the engine handles
 * deck-out as a state-based action.
 */
export function drawCards(state, { playerId, count }) {
  assertPlayer(playerId);
  if (!Number.isInteger(count) || count < 0) throw new Error(`drawCards: count must be a non-negative integer, got ${count}`);

  return withPlayer(state, playerId, player => {
    const drawCount = Math.min(count, player.library.length);
    const drawn = player.library.slice(0, drawCount);
    const remaining = player.library.slice(drawCount);
    return {
      ...player,
      library: remaining,
      hand: [...player.hand, ...drawn],
      cardsDrawnThisTurn: player.cardsDrawnThisTurn + drawCount,
    };
  });
}

/**
 * Shuffle a player's library. Takes an optional `rng` (() => float 0..1)
 * so tests can supply a deterministic shuffle.
 */
export function shuffleLibrary(state, { playerId, rng = Math.random }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, player => {
    const copy = [...player.library];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return { ...player, library: copy };
  });
}

/**
 * Move N cards from a player's hand to the bottom of their library —
 * used by the London mulligan and by effects like "put a card on the
 * bottom of your library." cardIds is an array of card.id values in
 * the order they should be appended to the library (so last in =
 * bottom-most).
 */
export function putCardsOnBottom(state, { playerId, cardIds }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, player => {
    const remaining = [];
    const moved = [];
    const lookup = new Map(player.hand.map(c => [c.id, c]));
    for (const id of cardIds) {
      const card = lookup.get(id);
      if (card) moved.push(card);
    }
    for (const card of player.hand) {
      if (!cardIds.includes(card.id)) remaining.push(card);
    }
    return {
      ...player,
      hand: remaining,
      library: [...player.library, ...moved],
    };
  });
}

/**
 * Apply a scry/surveil decision (CR 701.18 / 701.43): the top `n` cards of the player's library
 * are repartitioned — `keepIdsOrdered` stay on top in that exact order, and the rest of the looked-
 * at cards go to the BOTTOM (scry) or to the GRAVEYARD (surveil), in their original top-first order.
 * The library below the top `n` is untouched. `keepIdsOrdered` is filtered to ids actually among
 * the top `n` (defensive — a stale/duplicate id is ignored), so no card is duplicated or lost.
 */
export function applyScrySurveil(state, { playerId, n, keepIdsOrdered, mode }) {
  assertPlayer(playerId);
  if (!state.players[playerId]) return state; // controller eliminated mid-resolution → clean no-op
  return withPlayer(state, playerId, player => {
    const top = player.library.slice(0, n);
    const rest = player.library.slice(n);
    const byId = new Map(top.map(c => [c.id, c]));
    const seen = new Set();
    const kept = [];
    for (const id of keepIdsOrdered || []) {
      if (byId.has(id) && !seen.has(id)) { kept.push(byId.get(id)); seen.add(id); }
    }
    const moved = top.filter(c => !seen.has(c.id)); // not kept → bottom (scry) / graveyard (surveil)
    return mode === "surveil"
      ? { ...player, library: [...kept, ...rest], graveyard: [...player.graveyard, ...moved] }
      : { ...player, library: [...kept, ...rest, ...moved] };
  });
}

/**
 * Apply an impulse-dig decision (δ-2 — Anticipate / Strategic Planning / Impulse): of the
 * top `n` looked-at cards, the CHOSEN one goes to HAND and ALL the rest go to the BOTTOM (`restTo:
 * "bottom"`) or to the GRAVEYARD (`restTo: "graveyard"`), in their original top-first order. The
 * library below the top `n` is untouched. A `chosenId` not among the top `n` (stale/eliminated) just
 * puts nothing in hand and still disposes the rest — no card duplicated or lost. Mirrors
 * applyScrySurveil's eliminated-controller guard + immutable withPlayer shape.
 */
export function applyImpulseDig(state, { playerId, n, chosenId, restTo }) {
  assertPlayer(playerId);
  if (!state.players[playerId]) return state; // controller eliminated mid-resolution → clean no-op
  return withPlayer(state, playerId, player => {
    const top = player.library.slice(0, n);
    const rest = player.library.slice(n);
    const chosen = top.find(c => c.id === chosenId);
    const others = top.filter(c => c.id !== chosenId); // every non-chosen looked-at card → bottom / graveyard
    const hand = chosen ? [...player.hand, chosen] : player.hand;
    return restTo === "graveyard"
      ? { ...player, hand, library: [...rest], graveyard: [...player.graveyard, ...others] }
      : { ...player, hand, library: [...rest, ...others] };
  });
}

/**
 * Mill (CR 701.13) — put the top `count` cards of a player's library into their graveyard, top
 * first. Bounded by the library size (milling an empty/short library is a clean no-op). A removed/
 * stale player resolves to a no-op (never a throw). Pure.
 */
export function millCards(state, { playerId, count }) {
  assertPlayer(playerId);
  if (!state.players[playerId]) return state;
  return withPlayer(state, playerId, player => {
    const n = Math.min(Math.max(0, count || 0), player.library.length);
    if (n === 0) return player;
    return { ...player, library: player.library.slice(n), graveyard: [...player.graveyard, ...player.library.slice(0, n)] };
  });
}

// ─── Permanent helpers ────────────────────────────────────────────────────────

function updatePermanent(state, permanentId, updater) {
  const lookup = findPermanent(state, permanentId);
  if (!lookup) throw new Error(`Permanent ${permanentId} not found`);
  const { controller } = lookup;
  return withPlayer(state, controller, player => ({
    ...player,
    battlefield: player.battlefield.map(p => (p.id === permanentId ? updater(p) : p)),
  }));
}

/** updatePermanent that NO-OPs (instead of throwing) if the permanent is gone — attach cleanup. */
function updatePermanentSafe(state, permanentId, updater) {
  return findPermanent(state, permanentId) ? updatePermanent(state, permanentId, updater) : state;
}

/**
 * Attach `equipId` to `targetId` (CR 701.3) — bidirectional: the equipment's `attachedTo`
 * and the target's `attachments`. Detaches the equipment from any prior host first
 * (re-equip / move). Pure; no-ops if EITHER the equipment or the target is missing (so the
 * two sides can never desync into a dangling `attachedTo` pointing at a ghost id).
 */
export function attachPermanent(state, { equipId, targetId }) {
  const src = findPermanent(state, equipId);
  const tgt = findPermanent(state, targetId);
  if (!src || !tgt) return state;
  let next = state;
  const prev = src.permanent.attachedTo;
  if (prev && prev !== targetId) {
    next = updatePermanentSafe(next, prev, p => ({ ...p, attachments: (p.attachments || []).filter(id => id !== equipId) }));
  }
  next = updatePermanentSafe(next, equipId, p => ({ ...p, attachedTo: targetId }));
  next = updatePermanentSafe(next, targetId, p => ({ ...p, attachments: [...(p.attachments || []).filter(id => id !== equipId), equipId] }));
  return next;
}

/**
 * Detach a permanent as it LEAVES the battlefield (CR 704.5n / 704.5q): drop it from its
 * host's `attachments`, and clear `attachedTo` on everything attached to IT. Pure.
 */
export function detachPermanentFromAll(state, permanent) {
  if (!permanent) return state;
  let next = state;
  if (permanent.attachedTo) {
    next = updatePermanentSafe(next, permanent.attachedTo, p => ({ ...p, attachments: (p.attachments || []).filter(id => id !== permanent.id) }));
  }
  for (const attId of permanent.attachments || []) {
    const lk = findPermanent(next, attId);
    if (!lk) continue;
    // CR 704.5n: an AURA that loses its host can't stay on the battlefield — it's put into
    // its owner's graveyard. An Equipment just becomes unattached (stays on the battlefield).
    if (/\bAura\b/.test(String(lk.permanent.card?.type || lk.permanent.card?.type_line || ""))) {
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: attId });
    } else {
      next = updatePermanentSafe(next, attId, p => ({ ...p, attachedTo: null }));
    }
  }
  return next;
}

export function tapPermanent(state, permanentId) {
  return updatePermanent(state, permanentId, p => ({ ...p, tapped: true }));
}

export function untapPermanent(state, permanentId) {
  return updatePermanent(state, permanentId, p => ({ ...p, tapped: false }));
}

/**
 * Untap every permanent the given player controls AND remove summoning
 * sickness from creatures that started the turn under their control.
 * Standard untap step behavior.
 */
export function untapAll(state, { playerId }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, player => ({
    ...player,
    battlefield: player.battlefield.map(p => ({
      ...p,
      tapped: false,
      summoningSick: false,
      // CR 606.3 once-per-turn loyalty reset: clear the flag at the controller's untap so each of
      // their planeswalkers can activate one loyalty ability again this turn. Harmless on non-walkers.
      loyaltyActivatedThisTurn: false,
    })),
  }));
}

export function addCounter(state, { permanentId, type, amount = 1 }) {
  if (typeof type !== "string" || !type) throw new Error("addCounter: type required");
  if (!Number.isInteger(amount)) throw new Error("addCounter: amount must be integer");
  return updatePermanent(state, permanentId, p => ({
    ...p,
    counters: { ...p.counters, [type]: (p.counters[type] || 0) + amount },
  }));
}

export function removeCounter(state, { permanentId, type, amount = 1 }) {
  if (typeof type !== "string" || !type) throw new Error("removeCounter: type required");
  return updatePermanent(state, permanentId, p => {
    const current = p.counters[type] || 0;
    const next = Math.max(0, current - amount);
    const nextCounters = { ...p.counters };
    if (next === 0) delete nextCounters[type];
    else nextCounters[type] = next;
    return { ...p, counters: nextCounters };
  });
}

export function getCounter(state, permanentId, type) {
  const lookup = findPermanent(state, permanentId);
  if (!lookup) return 0;
  return lookup.permanent.counters[type] || 0;
}

// ─── Mana pool ────────────────────────────────────────────────────────────────

export function addMana(state, { playerId, color, amount = 1 }) {
  assertPlayer(playerId);
  if (!MANA_COLORS.includes(color)) throw new Error(`Invalid mana color "${color}"`);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("addMana: amount must be a non-negative integer");
  return withPlayer(state, playerId, p => ({
    ...p,
    manaPool: { ...p.manaPool, [color]: (p.manaPool[color] || 0) + amount },
  }));
}

export function emptyManaPoolForPlayer(state, { playerId }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, p => ({ ...p, manaPool: emptyManaPool() }));
}

export function emptyAllManaPools(state) {
  return Object.keys(state.players).reduce(
    (acc, playerId) => emptyManaPoolForPlayer(acc, { playerId }),
    state,
  );
}

// ─── Life / damage ────────────────────────────────────────────────────────────

export function loseLife(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("loseLife: amount must be non-negative integer");
  return withPlayer(state, playerId, p => ({ ...p, life: p.life - amount }));
}

export function gainLife(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("gainLife: amount must be non-negative integer");
  return withPlayer(state, playerId, p => ({ ...p, life: p.life + amount }));
}

/** Mark combat (or other) damage on a permanent. */
export function markCombatDamage(state, { permanentId, amount }) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("markCombatDamage: amount must be a non-negative integer");
  if (amount === 0) return state;
  return updatePermanent(state, permanentId, p => ({ ...p, damageMarked: (p.damageMarked || 0) + amount }));
}

/** Wipe marked damage off every permanent (combat damage wears off at cleanup). */
export function clearCombatDamage(state) {
  let changed = false;
  const players = {};
  for (const [pid, player] of Object.entries(state.players)) {
    if (!player.battlefield.some(p => (p.damageMarked || 0) !== 0)) {
      players[pid] = player;
      continue;
    }
    changed = true;
    players[pid] = {
      ...player,
      battlefield: player.battlefield.map(p => (p.damageMarked ? { ...p, damageMarked: 0 } : p)),
    };
  }
  return changed ? { ...state, players } : state;
}

/**
 * State-based action: move dying creatures to their graveyard. Two distinct SBAs,
 * which is why indestructible (CR 702.12b) splits them:
 *   - CR 704.5f — toughness 0 or less → put into graveyard. NOT "destroy", so an
 *     indestructible creature still dies this way (a 0/0 token, an -X/-X wipe).
 *   - CR 704.5g — lethal marked damage (≥ effective toughness), OR any damage from a
 *     deathtouch source (pass `deathtouched` as a Set of permanent ids) → DESTROYED.
 *     An indestructible creature is NOT destroyed and survives.
 * Shared by combat damage and direct-damage spells so the lethality rule lives in one
 * place. Returns `{ state, dead }`.
 */
export function destroyLethalCreatures(state, deathtouched = new Set()) {
  const dead = [];
  // Look-back snapshot (CR 603.10a): by the time dies-triggers are checked the permanent is
  // already in the graveyard, so its last-known characteristics travel with the `dead` entry.
  const markDead = (pid, perm) =>
    dead.push({ controller: pid, id: perm.id, name: perm.card?.name || "creature", card: perm.card });
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      const typeStr = String(perm.card?.type || perm.card?.type_line || "");
      if (!typeStr.includes("Creature")) continue;
      const printed = Number(perm.card?.toughness);
      if (!Number.isFinite(printed)) continue; // skip "*"/unknown toughness
      const tough = creatureToughness(perm, state);
      const dmg = perm.damageMarked || 0;
      if (tough <= 0) {
        markDead(pid, perm); // CR 704.5f — indestructible does NOT prevent this
        continue;
      }
      const lethalDamage = (dmg > 0 && dmg >= tough) || (deathtouched.has(perm.id) && dmg > 0);
      if (lethalDamage && !isIndestructible(perm, state)) {
        markDead(pid, perm); // CR 704.5g — destruction; an indestructible creature survives
      }
    }
  }
  let next = state;
  for (const d of dead) {
    next = moveCardToZone(next, { playerId: d.controller, fromZone: "battlefield", toZone: "graveyard", cardId: d.id });
  }
  return { state: next, dead };
}

/**
 * Track commander damage from one player to another. Used by SBAs
 * (engine PR) to check the 21-commander-damage rule.
 */
export function addCommanderDamage(state, { fromPlayer, toPlayer, amount }) {
  assertPlayer(fromPlayer);
  assertPlayer(toPlayer);
  if (fromPlayer === toPlayer) throw new Error("Commander damage cannot be self-inflicted");
  return withPlayer(state, toPlayer, p => ({
    ...p,
    commanderDamageFrom: {
      ...p.commanderDamageFrom,
      [fromPlayer]: (p.commanderDamageFrom[fromPlayer] || 0) + amount,
    },
  }));
}

// ─── Per-turn counter resets ──────────────────────────────────────────────────

/**
 * Reset per-turn counters for the active player. Called by the engine
 * on turn start (untap step). Counters reset:
 *   - landsPlayedThisTurn → 0
 *   - cardsDrawnThisTurn → 0  (the engine resets BEFORE the draw step,
 *                              so the actual turn-draw is correctly
 *                              counted as 1)
 */
export function resetTurnCounters(state, { playerId }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, p => ({
    ...p,
    landsPlayedThisTurn: 0,
    cardsDrawnThisTurn: 0,
  }));
}

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * Append a log entry. The log is the source of truth for replay and
 * for the narrator (PR5). Engine + helpers add to it; UI reads from it.
 */
export function logEvent(state, event) {
  return appendLog(state, event);
}
