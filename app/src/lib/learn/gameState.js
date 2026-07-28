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
import { permanentPower, permanentToughness, permanentBasePower, permanentHasKeyword, permanentIsCreature, permanentTypes } from "./layers.js";
import { groupNoUntapFiltersOf, groupNoUntapMatches, groupNoUntapFilterNeedsPower } from "./groupNoUntap.js"; // GROUP NO-UNTAP static (UT-1: Winter-Orb / Meekstone / Choke lock family) — leaf module, no cycle
import { hasKeyword } from "./keywords.js";
import { applyCounterDoubling, millMultiplier, playerCounterAdditive } from "./replacementEffects.js"; // Wave-3 counter-doubler + MILL-DOUBLER (Bruvac, M2) + PLAYER-COUNTER additive (Constrictor) replacements (leaf, no cycle)
import { auraHasTotemArmor } from "./staticAbilityParser.js"; // TOTEM ARMOR (CR 702.116) destruction-replacement detector (staticAbilityParser is a leaf on keywords.js; gameState already depends on it via layers.js — no new cycle)

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Legacy no-id fallback minter — DETERMINISTIC on purpose (flake root-cause pass,
 * 2026-07-17). It used to embed `crypto.randomUUID()` (or `Date.now()`), which made
 * any id minted through this path RANDOM per process. Ids feed sort tie-breaks in
 * opponentAI/legalChoices (`String(a.id) < String(b.id)`), so one random id reaching
 * a compared structure silently breaks the "same seed ⇒ byte-identical game" replay
 * invariant. Every production path threads the state-carried `mintId` below (perm-7,
 * stk-8 — serialize-stable); this fallback exists only for legacy/no-id callers and
 * hand-built test fixtures, and the module-global counter keeps it unique per process.
 * The engine bans Date.now()/Math.random() in state paths — this was the last one.
 */
function nextId(prefix) {
  _idCounter += 1;
  return `${prefix}-legacy-${_idCounter}`;
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
 * BASE power (CR 613.4a — printed, or a layer-7b set value; NEVER includes counters/anthems/pumps, which
 * are 7c/7d). The Jason-Bright dies-trigger intervening-if compares the death look-back's effective power
 * against this. Same delegation contract as creaturePower: on-battlefield → the layer engine's basePower;
 * off-battlefield/no-state → the printed value (a look-back's base can't carry board effects).
 */
export function creatureBasePower(permanent, state = null) {
  if (!permanent?.card) return 0;
  if (state && permanent.id != null && findPermanent(state, permanent.id)) {
    return permanentBasePower(state, permanent.id);
  }
  return printedPower(permanent);
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
 * NO-UNTAP LOCKDOWN (Junk Winder — "It doesn't untap during its controller's next untap step"): flag a
 * permanent so untapAll SKIPS untapping it exactly once, clearing the flag as it skips (so ONLY the next
 * untap step is affected — a self-clearing one-shot restriction, CR 302.6). Set at the tap effect's
 * resolution (effects/atoms/combat.applyTapEffect). Pure. A permanent with no flag untaps normally.
 */
export function setDoesNotUntapNext(state, permanentId, value = true) {
  return updatePermanent(state, permanentId, (p) => ({ ...p, doesNotUntapNext: value }));
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
export function createPlayerState({ library = [], life = STARTING_LIFE_COMMANDER, commanderCards = [], companionCard = null, seatId = null } = {}) {
  return {
    life,
    startingLife: life,       // CR 119.1 — the game's starting total, read by "less than your starting life total" metrics (Shadow of Mortality)
    poison: 0,
    energy: 0,                // ENERGY ({E}, CR 122.1e / 107.4c) — a player resource counter; "you get {E}" adds, "Pay {E}" spends
    commanderDamageFrom: {},  // CR 903.10a — { commanderInstanceId (fallback: cardId): combatDamage } (per-commander, 21 = a loss)
    commanderCastCount: {},   // CMD-CAST (CR 903.8): { commanderCardId: timesCastFromCommandZone } — drives the {2} tax
    manaPool: emptyManaPool(),
    // MANA-HOLD (CR 500.4 exception) — a per-color CAP on how much mana survives step/phase-end emptying,
    // for mana printed as lasting longer than the step that made it ("Firebending N … This mana lasts until
    // end of combat"). The mana itself stays in the NORMAL pool, so every existing payment path spends it
    // unchanged; only gameEngine.emptyManaPools reads this, and the end-of-combat step clears it.
    manaHold: emptyManaPool(),
    library: [...library],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    // CMD-COMPANION (CR 702.139): the companion starts OUTSIDE the game here. The once-per-game "{3}: put
    // this card into your hand" action moves it → hand (then it's a normal card, NOT a commander — no tax),
    // and clears this field so the action isn't re-offered. null = no companion / already brought in.
    companion: companionCard ? { ...companionCard } : null,
    // CR 903.3 — "commander" is a designation on the CARD itself that rides across zones (not a
    // characteristic). Tag each so isCommander travels card → battlefield permanent → (PR2) back to the zone.
    // CMD-MIRROR (CR 903.10a): stamp a per-SEAT commander instance id — two seats running the SAME
    // commander card (a mirror; self-play pads pods by wrapping the deck list, so mirrors are routine)
    // must track 21-rule damage separately. The id rides the card across zones exactly like the
    // isCommander designation; every reader falls back to card.id, so unstamped fixtures/old saves
    // behave byte-identically.
    command: commanderCards.map((c) => (c ? { ...c, isCommander: true, ...(seatId ? { commanderInstanceId: `${seatId}::${c.id}` } : {}) } : c)),
    emblems: [],              // PW-5: emblems this player owns (objects with a continuous/triggered ability)
    experience: 0,
    radCounters: 0,           // RAD (CR 728): rad counters a player has; the inherent radiation ability (applyRadiation) mills + drains at their precombat main
    landsPlayedThisTurn: 0,
    extraLandsThisTurn: 0,    // ONE-SHOT-EXTRA-LAND (CR 505.5b / 305.2): the per-turn land-play budget RAISED by a resolving "you may play [N] additional land[s] this turn" effect (Explore → +1, Summer Bloom → +3). landDropAllowance adds it; resetTurnCounters zeroes it each of the player's turns.
    cardsDrawnThisTurn: 0,
    spellsCastThisTurn: 0,    // TRIG-CAST2: "cast your second spell each turn" — incremented at the cast chokepoint, reset for all seats at untap
    creaturesDiedThisTurn: 0, // DEATHS-THIS-TURN (CR 700.4): creatures that DIED (battlefield→graveyard) under this player's control this turn — incremented at the death chokepoint (checkDiesTriggers via recordCreatureDeaths), reset for all seats at untap. Read by "for each creature that died [under your control] this turn" (Mahadi sums all seats / Body Count reads the controller) + the "if a creature died this turn" intervening-if.
    attackedThisTurn: false, // RAID (CR 508.1): set true when this player declares an attacker (actionDispatcher.applyDeclareAttacker), reset for ALL seats at untap. Read by the "you attacked this turn" intervening-if.
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
  userCompanion = null,
  aiCompanion = null,
  opponentCompanions = [],
  startingLife = STARTING_LIFE_COMMANDER,
  activePlayer = "user",
  mode = "standard",
} = {}) {
  if (!MODES.includes(mode)) {
    throw new Error(`createGameState: mode must be one of ${MODES.join(", ")}`);
  }

  const { players, turnOrder } =
    mode === "commander"
      ? buildCommanderSeats({ userDeck, userCommanders, opponentDecks, opponentCommanders, userCompanion, opponentCompanions, startingLife })
      : buildStandardSeats({ userDeck, aiDeck, userCommanders, aiCommanders, userCompanion, aiCompanion, startingLife });

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
    // DELAYED TRIGGERS (CR 603.7) — abilities a resolving spell/ability SCHEDULES for a future step
    // ("At the beginning of the next end step, sacrifice it"; "draw a card at the beginning of the
    // next turn's upkeep"). Each entry is plain JSON: { id, controller, fireStep, fireScope,
    // effectClause, sourceName, sourceCardId, createdTurn }. gameEngine drains matching entries at
    // step entry into `pendingTriggers` (so they ride the SAME flush→stack→resolve pipeline every
    // printed trigger uses) and REMOVES them — CR 603.7's "triggers only once, then ceases to exist".
    delayedTriggers: [],
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
function buildStandardSeats({ userDeck, aiDeck, userCommanders, aiCommanders, userCompanion, aiCompanion, startingLife }) {
  return {
    turnOrder: ["user", "ai"],
    players: {
      user: createPlayerState({ library: userDeck, life: startingLife, commanderCards: userCommanders, companionCard: userCompanion, seatId: "user" }),
      ai: createPlayerState({ library: aiDeck, life: startingLife, commanderCards: aiCommanders, companionCard: aiCompanion, seatId: "ai" }),
    },
  };
}

// Build the four Commander (4P FFA) seats: the user plus exactly three
// pod opponents (ai1/ai2/ai3). opponentCommanders is an array of
// per-opponent commander arrays, parallel to opponentDecks.
function buildCommanderSeats({ userDeck, userCommanders, opponentDecks, opponentCommanders, userCompanion, opponentCompanions, startingLife }) {
  if (!Array.isArray(opponentDecks) || opponentDecks.length !== 3) {
    throw new Error("createGameState: commander mode requires opponentDecks to be an array of exactly 3 decks (the pod)");
  }
  const players = {
    user: createPlayerState({ library: userDeck, life: startingLife, commanderCards: userCommanders, companionCard: userCompanion, seatId: "user" }),
  };
  const turnOrder = ["user"];
  opponentDecks.forEach((deck, i) => {
    const seat = `ai${i + 1}`;
    players[seat] = createPlayerState({
      library: deck,
      life: startingLife,
      commanderCards: (Array.isArray(opponentCommanders) && opponentCommanders[i]) || [],
      companionCard: (Array.isArray(opponentCompanions) && opponentCompanions[i]) || null,
      seatId: seat,
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
export function moveCardToZone(state, { playerId, fromZone, toZone, cardId, becomePermanent = false, toTop = false }) {
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
    // MANIFEST-DREAD — a FACE-DOWN manifest (CR 701.40a / 110.5) is a nameless 2/2 permanent whose
    // REAL card is stashed under `faceUpCard`; when it LEAVES the battlefield it becomes that real card
    // again (the graveyard/exile/hand sees the printed card, NEVER the nameless 2/2). Unwraps when moving
    // to any non-battlefield zone; a blink (→ battlefield) keeps the same permanent so it stays face-down.
    const card = (permanent.faceDown && permanent.faceUpCard && toZone !== "battlefield")
      ? permanent.faceUpCard
      : (permanent.printedCard || permanent.card);

    const nextSource = [...sourceList.slice(0, index), ...sourceList.slice(index + 1)];
    // OWNER ROUTING (BLITZ SB-2, CR 110.2 / 404.1): a permanent stamped with an `owner` different from the
    // moving player (a cross-player reanimation — zones.enterCardFromZone stamps it; every other permanent
    // carries no `owner` field → destPid === playerId, byte-identical) sends its unwrapped CARD to the
    // OWNER's destination zone: dies → its owner's graveyard (CR 404.1 — a destroyed object "is put on top
    // of its owner's graveyard"; CR 700.4 — dies = put into a graveyard from the battlefield), bounce → its
    // owner's hand, tuck → its owner's library. The PERMANENT is still removed from the
    // controller's battlefield (it lives there); only the card's landing zone re-routes. A stale/eliminated
    // owner falls back to the controller (never a throw). Every battlefield exit funnels through here
    // (destroyLethalCreatures, sacrifice, destroy/exile resolvers, the legend/0-loyalty SBAs), so the
    // owner discipline can't drift per-path.
    const destPid = (toZone !== "battlefield" && permanent.owner && permanent.owner !== playerId && state.players[permanent.owner])
      ? permanent.owner : playerId;
    let nextDest;
    if (toZone === "battlefield") {
      // Permanent moves to battlefield from battlefield — weird but possible (blinks).
      nextDest = [...player[toZone], permanent];
    } else if (card?.token) {
      // TOKEN CEASES-TO-EXIST (CR 111.7 / 704.5d) — a token that leaves the battlefield to ANY other zone
      // (graveyard via death, hand via bounce, exile, library via tuck) ceases to exist as a state-based
      // action. Its death/leave EVENTS still fire (checkDiesTriggers reads the LKI `dead` list, and
      // detachPermanentFromAll below queues the leave event), so a token's dies/LTB triggers resolve exactly
      // as printed — we simply DON'T add the token card to the destination, so it vanishes instead of
      // persisting as a castable card in hand or a body in the graveyard. Without this, every bounce / exile /
      // tuck / death leaked the token into a public zone (pre-existing engine-wide gap; pollutes self-play data).
      nextDest = state.players[destPid][toZone];
    } else {
      // Unwrapping: drop permanent state, keep the card. `toTop` (tuck-to-top-of-library) prepends
      // instead of appending — library index 0 is the TOP (drawCardEffect slices from the front).
      nextDest = toTop ? [card, ...state.players[destPid][toZone]] : [...state.players[destPid][toZone], card];
    }
    let result = destPid === playerId
      ? withPlayer(state, playerId, p => ({
          ...p,
          [fromZone]: nextSource,
          [toZone]: nextDest,
        }))
      : withPlayer(withPlayer(state, playerId, p => ({ ...p, [fromZone]: nextSource })), destPid, p => ({ ...p, [toZone]: nextDest }));
    // GY-EVENT (SHELF S7): a battlefield→graveyard move puts the unwrapped CARD into the graveyard (dies /
    // destroyed / sacrificed / aura falls off). A token never lands (the vanish branch above) and is not a
    // card — recordGraveyardEvents' token filter makes that structural. gyOwner is the RECEIVING player
    // (destPid — the card's owner when the owner-routing above re-routed a stolen permanent's death).
    if (toZone === "graveyard") {
      result = recordGraveyardEvents(result, [{ dir: "enter", card, gyOwner: destPid, zone: "battlefield" }]);
    }
    // Leaving the battlefield: detach this permanent from its host and unattach anything
    // on it (CR 704.5n/704.5q). A blink (→ battlefield) keeps attachments out of scope here.
    // SELF-LTB: pass whether this exit is to a graveyard so detachPermanentFromAll's leave-event
    // look-back records `toGraveyard` correctly (Rancor's self-PiG-return keys on it).
    return toZone === "battlefield" ? result : detachPermanentFromAll(result, permanent, toZone === "graveyard", toZone);
  }

  // Non-battlefield source: cardId is matched against card.id (caller's
  // convention — Card objects are expected to have a unique id field).
  const index = sourceList.findIndex(c => c.id === cardId);
  if (index === -1) throw new Error(`Card ${cardId} not found in ${playerId}.${fromZone}`);
  let card = sourceList[index];
  // CMD-RETURN (CR 903.9a): the "owner declined to return this commander" marker (_returnHandled) is scoped
  // to its CURRENT graveyard/exile residency — 903.9a fires for a commander "put there since the last SBA
  // check". When the card LEAVES that zone (reanimated, returned to hand, …) the decline is stale, so strip
  // it; a later death then re-offers the return instead of stranding the commander.
  if ((fromZone === "graveyard" || fromZone === "exile") && card._returnHandled) {
    const { _returnHandled: _drop, ...rest } = card;
    card = rest;
  }
  const nextSource = [...sourceList.slice(0, index), ...sourceList.slice(index + 1)];
  // GY-EVENT (SHELF S7): a card leaving/entering a graveyard through the generic single-card move —
  // graveyard→hand (Raise Dead), graveyard→library (Reclaim), graveyard→exile, graveyard→command
  // (CR 903.9a), graveyard→battlefield (becomePermanent), hand→graveyard (every discard), etc.
  // fromZone===toZone can't reach here (the same card can't be removed and re-added meaningfully),
  // so at most ONE of the two records.
  const gyEvent = fromZone === "graveyard" ? [{ dir: "leave", card, gyOwner: playerId, zone: toZone }]
    : toZone === "graveyard" ? [{ dir: "enter", card, gyOwner: playerId, zone: fromZone }]
    : null;
  if (toZone === "battlefield" && becomePermanent) {
    // Mint a deterministic permanent id from state.idSeq and build the result
    // from the advanced state (s2) so the counter persists — the single
    // production path that creates a permanent from a card (Phase-7 PR-0).
    const { id: permId, state: s2 } = mintId(state, "perm");
    const nextDest = [...player[toZone], createPermanent({ id: permId, card, controller: playerId })];
    const moved = withPlayer(s2, playerId, p => ({
      ...p,
      [fromZone]: nextSource,
      [toZone]: nextDest,
    }));
    return gyEvent ? recordGraveyardEvents(moved, gyEvent) : moved;
  }

  const nextDest = toTop ? [card, ...player[toZone]] : [...player[toZone], card];
  const moved = withPlayer(state, playerId, p => ({
    ...p,
    [fromZone]: nextSource,
    [toZone]: nextDest,
  }));
  return gyEvent ? recordGraveyardEvents(moved, gyEvent) : moved;
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
 * Shuffle a player's library. `rng` (() => float 0..1) is REQUIRED (R2.5, audit 2026-07-09):
 * this module is determinism-critical — a Math.random fallback would silently break replay
 * determinism (the property the grind store's "replay-regenerable" lifecycle rests on) the
 * first time a caller forgot the seeded stream. The sole caller (effects/atoms/library.js)
 * passes deterministicRng.
 */
export function shuffleLibrary(state, { playerId, rng }) {
  assertPlayer(playerId);
  if (typeof rng !== "function") {
    throw new Error("shuffleLibrary: a seeded rng is required (determinism-critical — never Math.random)");
  }
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
 * Apply a scry/surveil decision (CR 701.22 / 701.25): the top `n` cards of the player's library
 * are repartitioned — `keepIdsOrdered` stay on top in that exact order, and the rest of the looked-
 * at cards go to the BOTTOM (scry) or to the GRAVEYARD (surveil), in their original top-first order.
 * The library below the top `n` is untouched. `keepIdsOrdered` is filtered to ids actually among
 * the top `n` (defensive — a stale/duplicate id is ignored), so no card is duplicated or lost.
 */
export function applyScrySurveil(state, { playerId, n, keepIdsOrdered, mode }) {
  assertPlayer(playerId);
  if (!state.players[playerId]) return state; // controller eliminated mid-resolution → clean no-op
  let surveilled = []; // the cards a surveil puts into the graveyard — GY-EVENT (SHELF S7)
  const next = withPlayer(state, playerId, player => {
    const top = player.library.slice(0, n);
    const rest = player.library.slice(n);
    const byId = new Map(top.map(c => [c.id, c]));
    const seen = new Set();
    const kept = [];
    for (const id of keepIdsOrdered || []) {
      if (byId.has(id) && !seen.has(id)) { kept.push(byId.get(id)); seen.add(id); }
    }
    const moved = top.filter(c => !seen.has(c.id)); // not kept → bottom (scry) / graveyard (surveil)
    if (mode === "surveil") surveilled = moved;
    return mode === "surveil"
      ? { ...player, library: [...kept, ...rest], graveyard: [...player.graveyard, ...moved] }
      : { ...player, library: [...kept, ...rest, ...moved] };
  });
  return recordGraveyardEvents(next, surveilled.map((card) => ({ dir: "enter", card, gyOwner: playerId, zone: "library" })));
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
  let discarded = []; // the non-chosen cards a graveyard-disposing dig puts into the GY — GY-EVENT (SHELF S7)
  const next = withPlayer(state, playerId, player => {
    const top = player.library.slice(0, n);
    const rest = player.library.slice(n);
    const chosen = top.find(c => c.id === chosenId);
    const others = top.filter(c => c.id !== chosenId); // every non-chosen looked-at card → bottom / graveyard
    const hand = chosen ? [...player.hand, chosen] : player.hand;
    if (restTo === "graveyard") discarded = others;
    return restTo === "graveyard"
      ? { ...player, hand, library: [...rest], graveyard: [...player.graveyard, ...others] }
      : { ...player, hand, library: [...rest, ...others] };
  });
  return recordGraveyardEvents(next, discarded.map((card) => ({ dir: "enter", card, gyOwner: playerId, zone: "library" })));
}

/**
 * Mill (CR 701.13) — put the top `count` cards of a player's library into their graveyard, top
 * first. Bounded by the library size (milling an empty/short library is a clean no-op). A removed/
 * stale player resolves to a no-op (never a throw). Pure.
 */
export function millCards(state, { playerId, count }) {
  assertPlayer(playerId);
  if (!state.players[playerId]) return state;
  const lib = state.players[playerId].library || [];
  const n = Math.min(Math.max(0, count || 0), lib.length);
  if (n === 0) return state;
  const milled = lib.slice(0, n);
  const milledIds = milled.map((c) => c.id);
  let next = withPlayer(state, playerId, player => ({
    ...player, library: player.library.slice(n), graveyard: [...player.graveyard, ...player.library.slice(0, n)],
  }));
  // GY-EVENT (SHELF S7): every milled card enters its owner's graveyard from the library.
  next = recordGraveyardEvents(next, milled.map((card) => ({ dir: "enter", card, gyOwner: playerId, zone: "library" })));
  // MILLED-THIS-TURN ledger (Tato Farmer "…that was milled this turn"; the Raul cast-permission class):
  // every milled card id → the turn it was milled, stamped HERE at the single mill primitive (the
  // mill-effect path AND the radiation mill both flow through millCards, so the ledger can't miss a
  // source). Readers key on `=== state.turn`, so stale entries are inert — no cleanup pass. Plain data
  // (serialize-safe); bounded by total library sizes.
  return { ...next, milledThisTurn: { ...(next.milledThisTurn || {}), ...Object.fromEntries(milledIds.map((id) => [id, state.turn])) } };
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
export function updatePermanentSafe(state, permanentId, updater) {
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
 * GY-EVENT queue (Syr Konrad / Bloodchief Ascension — SHELF S7, CR 603.6c/603.10a look-back): record a card
 * ENTERING a graveyard ({dir:"enter", zone: the zone it came FROM}) or LEAVING one ({dir:"leave", zone: the
 * zone it went TO}) on `state.pendingGraveyardEvents`. The pendingLeaveEvents/pendingUntapEvents pattern —
 * gameState can't import triggers.js, so a triggers-side drain (checkGraveyardEventTriggers, fired at the
 * flushTriggers funnel) converts events into pending triggers. TOKENS never record: a token is not a CARD
 * (CR 111.1), and "a card is put into / leaves a graveyard" watchers are card-scoped by definition — the
 * battlefield token-vanish branch in moveCardToZone also never lands one in the array. Events are plain
 * JSON (card snapshot + owner + zone) so serialize→restore replays identically. Every write site that
 * touches a graveyard array records here — the colocated diff tripwire test (graveyardEvents.test.js)
 * asserts recorded events match the actual graveyard-array delta across engine transforms, so a future
 * write site that forgets to record fails the suite instead of silently starving the watchers.
 */
export function recordGraveyardEvents(state, events) {
  const evs = (events || []).filter((e) => e && e.card && !e.card.token);
  if (!evs.length) return state;
  // GY-ENTERED-THIS-TURN tally (Fraying Sanity — SHELF S7): per-player count of CARDS that entered that
  // player's graveyard this turn, stamped here at the single recording chokepoint (every entry site
  // already routes through this fn — the same can't-miss argument as milledThisTurn). Reset for all
  // seats at untap alongside creaturesDiedThisTurn. Tokens never count (filtered above — not cards).
  let players = state.players;
  for (const e of evs) {
    if (e.dir !== "enter" || !players[e.gyOwner]) continue;
    players = { ...players, [e.gyOwner]: { ...players[e.gyOwner], gyEnteredThisTurn: (players[e.gyOwner].gyEnteredThisTurn || 0) + 1 } };
  }
  return { ...state, players, pendingGraveyardEvents: [...(state.pendingGraveyardEvents || []), ...evs] };
}

/**
 * SELF-LTB (Wave 4) — record a "leaves the battlefield" look-back event (CR 603.6e/603.10a) on
 * `state.pendingLeaveEvents` so a triggers-importing drainer (triggers.checkDiesTriggers →
 * checkLeavesTriggers) can fire LTB/PiG triggers WITHOUT gameState importing triggers.js (the circular-
 * import hazard the brief flags). The look-back snapshot is the permanent as it LAST existed on the
 * battlefield, since by trigger-resolution time it's already in the graveyard. Pure; the event is plain
 * JSON so serialize→restore replays identically. `toGraveyard` distinguishes a graveyard exit (Rancor's
 * PiG) from a non-graveyard exit (bounce/exile) — the Aura self-PiG-return detector keys on the former.
 */
function recordLeaveEvent(state, permanent, toGraveyard, toZone = null) {
  if (!permanent?.card) return state;
  const ev = { id: permanent.id, controller: permanent.controller, card: permanent.card, toGraveyard: !!toGraveyard };
  // EARTHBEND-RETURN (CR 603.7): carry the animated land's flag + destination zone so triggers.checkLeavesTriggers
  // can synthesize the "when it dies or is exiled, return it to the battlefield tapped" delayed trigger. Only a
  // graveyard (dies) or exile exit qualifies — a bounce to hand / tuck to library does NOT (the rider is dies-or-exiled).
  if (permanent.earthbendReturn) { ev.earthbendReturn = true; ev.toZone = toZone; }
  // DETAIN (DT-1, CR 610.3a): carry the detainer's linked-exile records so checkLeavesTriggers can
  // synthesize the [detain-return] one-shot — fires on ANY exit (bounce included), unlike earthbend.
  if (permanent.detainedExile?.length) ev.detainedExile = permanent.detainedExile;
  return { ...state, pendingLeaveEvents: [...(state.pendingLeaveEvents || []), ev] };
}

/**
 * Detach a permanent as it LEAVES the battlefield (CR 704.5n / 704.5q): drop it from its
 * host's `attachments`, and clear `attachedTo` on everything attached to IT. Pure.
 *
 * SELF-LTB (Wave 4): also records a leave event (recordLeaveEvent) for the leaving permanent AND for
 * each Aura it orphans to a graveyard — the single chokepoint every battlefield exit passes through
 * (moveCardToZone calls this on any non-battlefield move). `toGy` marks whether the leaving permanent is
 * itself headed to a graveyard (passed by moveCardToZone); the orphaned Aura is always graveyard-bound.
 */
export function detachPermanentFromAll(state, permanent, toGy = false, toZone = null) {
  if (!permanent) return state;
  let next = recordLeaveEvent(state, permanent, toGy, toZone);
  // SOULBOND teardown (BLITZ SL-1, CR 702.95e) — a paired creature LEAVING the battlefield unpairs its partner.
  // Clear the partner's back-reference so its soulbond carrier stops conferring the bond (layers.staticEffectsOf
  // reads soulbondPartner). The leaving permanent's own field departs with it. This is the single battlefield-
  // exit chokepoint, so bounce / destroy / exile / sacrifice all tear the pairing down uniformly.
  if (permanent.soulbondPartner) {
    next = updatePermanentSafe(next, permanent.soulbondPartner, (p) => ({ ...p, soulbondPartner: null }));
  }
  if (permanent.attachedTo) {
    next = updatePermanentSafe(next, permanent.attachedTo, p => ({ ...p, attachments: (p.attachments || []).filter(id => id !== permanent.id) }));
  }
  for (const attId of permanent.attachments || []) {
    const lk = findPermanent(next, attId);
    if (!lk) continue;
    // CR 704.5n: an AURA that loses its host can't stay on the battlefield — it's put into
    // its owner's graveyard. An Equipment just becomes unattached (stays on the battlefield).
    // BESTOW (CR 702.103e): a permanent cast for its bestow cost is an Aura WHILE attached, but when its
    // host leaves it does NOT fall off to the graveyard — it stays on the battlefield and becomes a
    // creature again. So a `bestowed` attachment takes the Equipment-like path (clear attachedTo, stay).
    // Its card type is "Enchantment Creature" (no "Aura" word) so the type test below already routes it
    // here, but the explicit `bestowed` guard makes the rule intentional + robust to any future change.
    const isFallingAura = !lk.permanent.bestowed
      && /\bAura\b/.test(String(lk.permanent.card?.type || lk.permanent.card?.type_line || ""));
    if (isFallingAura) {
      // The orphaned Aura's own leave event is recorded by the recursive detachPermanentFromAll that
      // moveCardToZone(→ graveyard) invokes on it (the top-of-function recordLeaveEvent) — so do NOT record
      // it here too (that double-fired Rancor's PiG-return). The single chokepoint is the recursion.
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: attId });
    } else {
      // Equipment OR a bestowed permanent: just unattach (CR 702.103e — bestow becomes a creature again,
      // which it does automatically once attachedTo is null: layers stops emitting its Creature-type removal).
      next = updatePermanentSafe(next, attId, p => ({ ...p, attachedTo: null }));
    }
  }
  return next;
}

export function tapPermanent(state, permanentId, { fromEnter = false } = {}) {
  // BECOMES-TAPPED event (BLITZ TR-1, CR 701.26a): record the untapped→tapped transition so a self
  // "Whenever this creature becomes tapped, …" watcher can fire (triggers.checkTapTriggers drains the queue at
  // the flush funnel — gameState can't import triggers, the pendingUntapEvents pattern). Recorded ONLY when the
  // permanent was genuinely UNTAPPED (a re-tap of an already-tapped permanent is not a transition) AND this is
  // not the ETB-tapped path (`fromEnter` — a permanent that ENTERS tapped never "becomes" tapped, CR 701.26a;
  // the tapland / gy-self-return sites pass fromEnter:true). Every other tapPermanent caller (attack, mana,
  // crew, cost payment) is a real transition and records.
  const lk = fromEnter ? null : findPermanent(state, permanentId);
  const transitions = !!lk && !lk.permanent.tapped;
  const next = updatePermanent(state, permanentId, p => ({ ...p, tapped: true }));
  if (!transitions) return next;
  return { ...next, pendingTapEvents: [...(next.pendingTapEvents || []), { id: permanentId, controller: lk.controller }] };
}

/**
 * STUN (CR 122.1c) — the single untap replacement used by EVERY untap path (untapAll's untap step, untapPermanent
 * for "untap target …" effects, and the Seedborn Muse / Murkfiend additional-untap hooks), so the tap-lock can
 * never be bypassed by a non-untap-step untap. If a TAPPED permanent has a stun counter, it does NOT untap —
 * remove ONE stun counter instead. Otherwise it untaps normally. Returns the post-attempt permanent (tap/stun
 * only; callers layer on any untap-STEP flag resets like summoning sickness themselves).
 */
export function untapOrConsumeStun(p) {
  if (p.tapped && (p.counters?.stun || 0) > 0) {
    return { ...p, counters: { ...p.counters, stun: p.counters.stun - 1 } };
  }
  return { ...p, tapped: false };
}

export function untapPermanent(state, permanentId) {
  // BECOMES-UNTAPPED event (Mesmeric Orb): record the transition ONLY when the permanent was TAPPED and no
  // stun counter replaces the untap (untapOrConsumeStun keeps it tapped in that case — it never "became"
  // untapped). Recorded, not fired (gameState can't import triggers — the pendingLeaveEvents pattern);
  // triggers.checkUntapTriggers drains the queue at the engine/atom fire sites.
  const lk = findPermanent(state, permanentId);
  const transitions = !!lk?.permanent?.tapped && !((lk.permanent.counters?.stun || 0) > 0);
  const next = updatePermanent(state, permanentId, p => untapOrConsumeStun(p));
  if (!transitions) return next;
  return { ...next, pendingUntapEvents: [...(next.pendingUntapEvents || []), { id: permanentId, controller: lk.controller }] };
}

// ── REGEN (CR 701.19) — regeneration shields ──────────────────────────────────────────────────────────────
// "Regenerate <permanent>" sets up a replacement: the NEXT time it would be destroyed this turn, instead
// remove all damage from it, tap it, and remove it from combat (CR 701.19a). Modeled as a per-permanent
// `regenShields` count: `addRegenShield` is the regen atom's effect; the two destruction sites (the lethal-
// damage SBA destroyLethalCreatures + the explicit-destroy effect applyDestroyEffect) consume one shield via
// `regeneratePermanent` INSTEAD of destroying. Shields clear at cleanup (the replacement is "this turn" only).
// Gated entirely on regenShields > 0, so a permanent without a regen ability is byte-identical to before.
export function addRegenShield(state, permanentId) {
  return updatePermanent(state, permanentId, p => ({ ...p, regenShields: (p.regenShields || 0) + 1 }));
}

/** Consume one regeneration shield: clear marked damage, tap, and REMOVE FROM COMBAT (CR 701.19a). The caller
 * has already confirmed a shield is present and is skipping the destruction (the creature stays on the
 * battlefield, never entering the dead set). The `removedFromCombat` flag — set only while a combat is active —
 * makes combatResolution skip the creature as both a damage dealer and receiver in any LATER damage step this
 * combat, so a creature regenerated in the first-strike sub-step can't deal/take damage again in the regular
 * sub-step. The flag is transient: the engine wipes it via clearRemovedFromCombatFlags when combat ends (and
 * defensively at beginning-of-combat), so it attacks/blocks normally next time. (Outside combat — e.g. a
 * Destroy spell in a main phase — no flag is set: there's no combat to leave.) */
export function regeneratePermanent(state, permanentId) {
  const inCombat = (state.combat?.attackers?.length || 0) > 0;
  // BECOMES-TAPPED event (BLITZ TR-1, CR 701.19a + 701.26a): a regenerated permanent is tapped by the shield;
  // record the untapped→tapped transition (an already-tapped attacker being regenerated is not a transition)
  // so a self "becomes tapped" watcher fires exactly as it would for any other tap. This is the ONE tap site
  // that bypasses tapPermanent, so it records here directly (the pendingUntapEvents / pendingTapEvents pattern).
  const lk = findPermanent(state, permanentId);
  const transitions = !!lk && !lk.permanent.tapped;
  const next = updatePermanent(state, permanentId, p => ({
    ...p,
    regenShields: Math.max(0, (p.regenShields || 0) - 1),
    damageMarked: 0,
    tapped: true,
    ...(inCombat ? { removedFromCombat: true } : {}),
  }));
  if (!transitions) return next;
  return { ...next, pendingTapEvents: [...(next.pendingTapEvents || []), { id: permanentId, controller: lk.controller }] };
}

// ── TOTEM ARMOR (CR 702.116 / "Umbra armor") — a destruction-replacement on an Aura ──────────────────────
// "If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura." When
// the enchanted permanent WOULD be destroyed (the lethal-damage SBA OR a targeted-destroy effect), the Aura is
// destroyed INSTEAD, all damage is removed from the creature, and the creature survives (CR 614 replacement).
// Modeled at BOTH destruction sites so no site silently drops the totem-armor save (CREED — all sites).

/** The id of a TOTEM-ARMOR Aura attached to `perm` (its host), or null. Walks the host's attachments and
 * returns the FIRST live totem-armor Aura found (CR 616 — with multiple, the creature's controller would
 * order them; picking the first is a faithful deterministic choice since each replacement is identical). Pure. */
export function totemArmorAuraFor(state, perm) {
  for (const attId of perm?.attachments || []) {
    const lk = findPermanent(state, attId);
    if (lk && auraHasTotemArmor(lk.permanent.card)) return attId;
  }
  return null;
}

/** Apply the totem-armor replacement: remove ALL marked damage from the saved host creature (it survives) and
 * DESTROY the Aura (move it to its controller's graveyard, CR 702.116a). The host never leaves the battlefield
 * (fires no dies-trigger); the Aura's own LTB is handled by the normal move (detach + leave-event look-back, so
 * a self-return Aura like a hypothetical totem-armor Rancor would still bounce). Returns the next state. */
export function applyTotemArmor(state, hostId, auraId) {
  let next = updatePermanentSafe(state, hostId, p => ({ ...p, damageMarked: 0 }));
  const lk = findPermanent(next, auraId);
  if (!lk) return next; // the Aura already gone (defensive) — the host was still saved above
  next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: auraId });
  return logEvent(next, { kind: "spell-effect", effect: "totem-armor", targets: [auraId] });
}

/** Clear the transient `removedFromCombat` flag on every permanent (CR 701.19a — removal from combat lasts
 * only for the combat it happened in). Called by the engine when it resets combat at end-of-combat (and
 * defensively at beginning-of-combat) and by actionDispatcher.clearCombat, so a creature regenerated
 * mid-combat deals/takes damage normally in every later combat. Cheap: only rebuilds a player whose board
 * actually carries the flag; returns the same state object when no flag is set anywhere. */
export function clearRemovedFromCombatFlags(state) {
  let changed = false;
  const players = {};
  for (const [pid, player] of Object.entries(state.players)) {
    if (player.battlefield?.some(p => p.removedFromCombat)) {
      changed = true;
      players[pid] = { ...player, battlefield: player.battlefield.map(p => (p.removedFromCombat ? { ...p, removedFromCombat: false } : p)) };
    } else {
      players[pid] = player;
    }
  }
  return changed ? { ...state, players } : state;
}

// ── SHIELD COUNTER (CR 122.1c) — a permanent counter that protects the permanent ────────────────────────────
// One or more shield counters on a permanent create a SINGLE replacement + a SINGLE prevention effect:
//   • "If this permanent would be DESTROYED as the result of an effect, instead REMOVE a shield counter."
//   • "If DAMAGE would be DEALT to this permanent, PREVENT that damage and REMOVE a shield counter."
// Unlike a regeneration shield (turn-scoped, taps + clears damage), a shield counter is a PERSISTENT counter
// (it lives in the standard `counters.shield` map, so proliferate / move-counter / remove-counter all compose
// and it does NOT clear at cleanup). Each "would be dealt damage / destroyed" EVENT removes exactly one shield.
// `hasShieldCounter` is the read the destruction sites (destroyLethalCreatures SBA + applyDestroyEffect) and the
// damage sites (applyDamageEffect + combatResolution) gate on; `consumeShieldCounter` removes one. Gated on the
// counter being present, so a permanent without a shield counter is byte-identical to before.
export function hasShieldCounter(permanent) {
  return ((permanent?.counters?.shield) || 0) > 0;
}

/** Remove one shield counter from a permanent (the replacement/prevention "remove a shield counter from it").
 * Goes through removeCounter so the counters map is normalized (the key is deleted when it hits 0). A no-op if
 * the permanent has no shield counter (belt-and-suspenders — every caller checks hasShieldCounter first). */
export function consumeShieldCounter(state, permanentId) {
  return removeCounter(state, { permanentId, type: "shield", amount: 1 });
}

// ===== PREVENTION SHIELDS (BLITZ PV-1, CR 615) — "Prevent the next N damage that would be dealt to
// <target> this turn." (the Samite Healer / Bandage / Healing Salve frame). A resolved prevention
// effect pushes a FLOATING shield entry { targetKind: "creature"|"player"|"planeswalker", targetId,
// amount, turn } onto state.preventionShields (plain JSON — serialize-stable). Shields are THIS-TURN
// scoped: entries stamped with an older turn are inert and purged on the next write (the Tato-ledger
// self-expiry pattern — no cleanup pass). Consumption decrements in array order (CR 616.1 — the
// affected player's ordering choice is out of scope; deterministic order is the engine's standing
// simplification, same as applyDamageReplacements' registration order). Both damage paths consume:
// applyDamageEffect per hit (state threads immediately) and combatResolution via a local pool written
// back after the apply loops (the shieldConsumed pattern).
/** The live (this-turn) prevention shields. Cheap empty-board read for the byte-identical gate. */
export function preventionShieldsFor(state) {
  const all = state?.preventionShields || [];
  if (!all.length) return all;
  return all.filter((s) => s.turn === state.turn && (s.amount || 0) > 0);
}

/** Add a prevention shield. Purges stale/spent entries on write so the array never accumulates. */
export function addPreventionShield(state, { targetKind, targetId, amount, turn }) {
  const live = preventionShieldsFor(state);
  return { ...state, preventionShields: [...live, { targetKind, targetId, amount: Math.max(0, amount || 0), turn }] };
}

/** Consume up to `amount` of matching shields. Returns { state, amount } — the unprevented remainder.
 * Fast path: no live shields → the same state object back (byte-identical for every ordinary hit). */
export function consumePreventionShields(state, { targetKind, targetId, amount }) {
  const live = preventionShieldsFor(state);
  if (!live.length || amount <= 0) return { state, amount };
  let rem = amount;
  let touched = false;
  const nextShields = [];
  for (const sh of live) {
    if (rem > 0 && sh.targetKind === targetKind && sh.targetId === targetId && sh.amount > 0) {
      const used = Math.min(sh.amount, rem);
      rem -= used;
      touched = true;
      if (sh.amount - used > 0) nextShields.push({ ...sh, amount: sh.amount - used });
    } else {
      nextShields.push(sh);
    }
  }
  if (!touched && nextShields.length === (state.preventionShields || []).length) return { state, amount };
  return { state: { ...state, preventionShields: nextShields }, amount: rem };
}

/**
 * Untap every permanent the given player controls AND remove summoning
 * sickness from creatures that started the turn under their control.
 * Standard untap step behavior.
 */
// PARALYZE-CLASS attached tap-lock (BLITZ PZ-1, CR 302 — Waterknot / Capture Sphere / Bonds of
// Quicksilver: "Enchanted creature doesn't untap during its controller's untap step."): a CONTINUOUS
// attached static, read off the permanent's ATTACHMENTS per untap step so the lock lifts the moment
// the Aura leaves. gameState can't import staticAbilityParser (cycle), so the exact printed line is
// matched locally — the same text the aura-side gates admit (staticAbilityParser.ATT_NO_UNTAP shapes).
const RE_ATTACHED_NO_UNTAP = /(?:^|[\n.;])\s*enchanted (?:creature|permanent) doesn't untap during its controller's untap step\s*(?:\.|$)/i;
function attachmentPreventsUntap(state, perm) {
  if (!perm?.attachments?.length) return false;
  for (const attId of perm.attachments) {
    const lk = findPermanent(state, attId);
    if (lk?.permanent?.card && RE_ATTACHED_NO_UNTAP.test(String(lk.permanent.card.oracle || lk.permanent.card.oracle_text || ""))) return true;
  }
  return false;
}

// SELF NO-UNTAP LOCKDOWN (BLITZ UP-1, CR 302.6 — Brass Man / Brass Gnat / Goblin War Wagon / Mana Vault):
// "This <permanent> doesn't untap during your untap step." is a CONTINUOUS static restriction on the SOURCE
// permanent itself (the untap-tax family whose escape is "At the beginning of your upkeep, you may pay {cost}.
// If you do, untap this <permanent>."). Read off the permanent's OWN oracle so untapAll SKIPS it — otherwise the
// untap step would untap it for free and the pay-to-untap upkeep trigger would be a meaningless no-op (a false
// positive: the metric flips the card native, so the runtime MUST honor this or the two diverge, CREED). The
// subject is anchored to SELF: "this <noun>" or the printed card name (older printings templated the name), never
// "enchanted …" (the attached form above) nor "each other player's …" (the Seedborn phase static, opposite polarity).
const SELF_NO_UNTAP_NOUNS = "creature|artifact|permanent|land|enchantment|equipment|vehicle";
// DESK AUDIT (director): the "your NEXT untap step" wording is EXCLUDED — that form is a ONE-SHOT rider
// printed inside activated abilities ("{T}: Add {W} or {U}. This land doesn't untap during your next untap
// step." — the Cloudcrest Lake / Vec Townships slow-dual family, 17 corpus permanents), not a continuous
// lock. Matching it froze those lands forever after one tap (a live FP the flip-diff can't see — the tier
// never changed). The continuous Brass Man-class static is exactly the "your untap step" wording.
const RE_SELF_NO_UNTAP_THIS = new RegExp(`(?:^|[\\n.;])\\s*this (?:${SELF_NO_UNTAP_NOUNS}) doesn't untap during your untap step\\s*(?:\\.|$)`, "i");
/**
 * CARD-level twin of selfPreventsUntap — "does this CARD print the CONTINUOUS self no-untap static?"
 *
 * Exported because manaModel needs exactly this question and must not re-implement it. Its own guard used a
 * loose `/doesn't untap during your (?:next )?untap step/` text test to route such cards out of the mana
 * model entirely, on the (then-true) grounds that the restriction wasn't enforced and the card would read as
 * a free repeatable rock. It IS enforced now — by this very predicate, via untapStep — so sharing the
 * predicate is what keeps the two from drifting apart again.
 */
export function cardSelfPreventsUntap(card) {
  if (!card) return false;
  const oracle = String(card.oracle || card.oracle_text || "").replace(/[’]/g, "'");
  if (!oracle) return false;
  if (RE_SELF_NO_UNTAP_THIS.test(oracle)) return true;
  // Legacy printings name the card explicitly ("Mana Vault doesn't untap during your untap step."). Still a SELF
  // reference (CR 201.4 — a permanent's rules text referring to itself by name means itself). Escape the name.
  const name = String(card.name || "");
  if (name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]");
    if (new RegExp(`(?:^|[\\n.;])\\s*${esc} doesn't untap during your untap step\\s*(?:\\.|$)`, "i").test(oracle)) return true;
  }
  return false;
}

function selfPreventsUntap(perm) {
  return cardSelfPreventsUntap(perm?.card);
}

// GROUP NO-UNTAP LOCKDOWN (BLITZ UT-1, CR 302.6 — Winter-Orb / Meekstone / Choke / Back to Basics / Marble
// Titan / Juntu Stakes): a CONTINUOUS static "<filter> don't untap during their controllers' untap steps" holds
// EVERY matching permanent tapped through its controller's untap step, regardless of who controls the static.
// Collect the active filters ONCE per untapAll (scan every battlefield's oracle — a permanent leaving the field
// lifts its lock the same untap step, like the attached PZ-1 form), then match the active player's tapped
// permanents against them using LIVE layer-aware characteristics (never printed-only — an animated permanent's
// current type/power is what the filter reads). groupNoUntap.js is the SINGLE recognition source the coverage
// classifier also reads, so metric and runtime can't drift. Empty on the overwhelmingly common no-lock board
// (fast bail). Distinct from selfPreventsUntap (self) / attachmentPreventsUntap (attached) / doesNotUntapNext
// (one-shot) / stun (consumable) — this is the GROUP static, its own disjoint skip branch below.
function groupNoUntapActiveFilters(state) {
  const filters = [];
  const players = state?.players || {};
  for (const key of Object.keys(players)) {
    const bf = players[key]?.battlefield || [];
    for (const perm of bf) {
      const fs = groupNoUntapFiltersOf(perm?.card);
      for (const f of fs) filters.push(f);
    }
  }
  return filters;
}
function groupPreventsUntap(state, perm, filters) {
  if (!filters.length || !perm?.card) return false;
  const isCreature = permanentIsCreature(state, perm.id);
  const needsPower = filters.some(groupNoUntapFilterNeedsPower);
  const t = permanentTypes(state, perm.id); // layer-aware { types, subtypes }
  const chars = {
    types: t.types,
    subtypes: t.subtypes,
    isCreature,
    // Power read only when a power filter is active AND this is a creature (a non-creature never has combat power).
    power: needsPower && isCreature ? permanentPower(state, perm.id) : null,
  };
  return filters.some((f) => groupNoUntapMatches(f, chars));
}

export function untapAll(state, { playerId }) {
  assertPlayer(playerId);
  // GROUP NO-UNTAP (UT-1): the continuous "<filter> don't untap" statics active on ANY battlefield this step.
  const groupFilters = groupNoUntapActiveFilters(state);
  // BECAME-UNTAPPED events (Mesmeric Orb — CR 613.10a-style look-back list): record every permanent that
  // actually TRANSITIONS tapped→untapped this step (the doesNotUntapNext / stun / attached-lock skips below
  // stay tapped and must NOT fire; an already-untapped permanent doesn't "become" untapped). gameState can't
  // import triggers.js (cycle), so this only records; triggers.checkUntapTriggers drains the queue (the
  // pendingLeaveEvents pattern exactly). Computed BEFORE the map so the skip conditions are read unmutated.
  const becameUntapped = (state.players[playerId]?.battlefield || [])
    .filter((p) => p.tapped && !p.doesNotUntapNext && !((p.counters?.stun || 0) > 0) && !attachmentPreventsUntap(state, p) && !selfPreventsUntap(p) && !groupPreventsUntap(state, p, groupFilters))
    .map((p) => ({ id: p.id, controller: playerId }));
  const untapped = withPlayer(state, playerId, player => ({
    ...player,
    battlefield: player.battlefield.map(p => {
      // PZ-1 (Waterknot class): an attached "doesn't untap during its controller's untap step" lock —
      // stays tapped while the Aura holds; non-tap flags reset like every skip branch here.
      if (p.tapped && attachmentPreventsUntap(state, p)) {
        return { ...p, summoningSick: false, loyaltyActivatedThisTurn: false };
      }
      // UP-1 (Brass Man / Mana Vault class): a SELF "This <permanent> doesn't untap during your untap step."
      // lock — stays tapped this untap step (its pay-to-untap upkeep trigger is the only escape); non-tap flags
      // reset like every skip branch here. Read off the permanent's OWN oracle (a continuous static, not a flag).
      if (p.tapped && selfPreventsUntap(p)) {
        return { ...p, summoningSick: false, loyaltyActivatedThisTurn: false };
      }
      // UT-1 (Meekstone / Choke / Back to Basics / Marble Titan / Juntu Stakes class): a GROUP "<filter> don't
      // untap during their controllers' untap steps" continuous static — this permanent matches an active
      // filter, so it stays tapped this untap step (the lock lifts when the source leaves or the permanent stops
      // matching). Non-tap flags reset like every skip branch here. Matched on LIVE characteristics via
      // groupPreventsUntap (layer-aware type/power) so an animated permanent reads its current form.
      if (p.tapped && groupPreventsUntap(state, p, groupFilters)) {
        return { ...p, summoningSick: false, loyaltyActivatedThisTurn: false };
      }
      // NO-UNTAP LOCKDOWN (Junk Winder — "It doesn't untap during its controller's next untap step"): a
      // permanent flagged doesNotUntapNext (setDoesNotUntapNext) is SKIPPED for the tap-clear this untap
      // step; the flag is CLEARED here so only THIS (the next) untap step is affected — the permanent stays
      // tapped and untaps normally on the following turn (CR 302.6 self-clearing one-shot). Summoning
      // sickness / loyalty flags still clear (those are tied to the controller's untap step, not the tap
      // state), matching how a normally-tapped permanent's non-tap flags reset.
      if (p.doesNotUntapNext) {
        const { doesNotUntapNext, ...rest } = p; // eslint-disable-line no-unused-vars
        return { ...rest, summoningSick: false, loyaltyActivatedThisTurn: false };
      }
      // STUN (CR 122.1c): a TAPPED permanent with a stun counter doesn't untap — instead REMOVE one stun counter
      // this untap step (a self-clearing tap-lock, one skipped untap per counter). It stays tapped; its non-tap
      // flags (summoning sickness, once-per-turn loyalty) still reset like any permanent's at its controller's untap.
      if (p.tapped && (p.counters?.stun || 0) > 0) {
        return { ...p, counters: { ...p.counters, stun: p.counters.stun - 1 }, summoningSick: false, loyaltyActivatedThisTurn: false };
      }
      return {
        ...p,
        tapped: false,
        summoningSick: false,
        // CR 606.3 once-per-turn loyalty reset: clear the flag at the controller's untap so each of
        // their planeswalkers can activate one loyalty ability again this turn. Harmless on non-walkers.
        loyaltyActivatedThisTurn: false,
      };
    }),
  }));
  if (!becameUntapped.length) return untapped;
  return { ...untapped, pendingUntapEvents: [...(untapped.pendingUntapEvents || []), ...becameUntapped] };
}

export function addCounter(state, { permanentId, type, amount = 1 }) {
  if (typeof type !== "string" || !type) throw new Error("addCounter: type required");
  if (!Number.isInteger(amount)) throw new Error("addCounter: amount must be integer");
  // Wave-3 doubler replacement (CR 616): the recipient controller's counter doublers (Doubling Season,
  // Hardened Scales, Branching Evolution, Vorinclex, …) replace the placed amount. Resolved HERE — the central
  // counter-mutation chokepoint — so every caller (counters.js applyAddCounter/proliferate, amass existing-Army,
  // combat/spellEffects -1/-1, actionDispatcher fade) inherits the doubling without its own wiring. A "+1/+1"-only
  // doubler is skipped for other counter types; floors at 0. (The three enters-with-counter sites that bypass
  // addCounter — resolvers.js / tokens.js / amass.js mint — call applyCounterDoubling directly.)
  const lk = findPermanent(state, permanentId);
  // Thread the recipient permanent id so a self-excluding "another creature you control" replacement (CR 109.5,
  // Benevolent Hydra) is skipped when THIS permanent is the replacement's own source.
  const placed = lk ? applyCounterDoubling(state, lk.controller, type, amount, permanentId) : amount;
  return updatePermanent(state, permanentId, p => ({
    ...p,
    counters: { ...p.counters, [type]: (p.counters[type] || 0) + placed },
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

/**
 * MANA-HOLD — raise the per-color cap of mana that survives step/phase-end emptying (CR 500.4's printed
 * exceptions: "This mana lasts until end of combat"). Deliberately a CAP and not a tagged sub-pool: the
 * mana stays in the ordinary pool so no payment path needs to learn a second currency, and emptyManaPools
 * keeps min(pool, hold) per color. The bounded imprecision that buys is documented at emptyManaPools —
 * it can only ever preserve UP TO what the printed effect promised, never more.
 */
export function holdMana(state, { playerId, color, amount = 1 }) {
  assertPlayer(playerId);
  if (!MANA_COLORS.includes(color)) throw new Error(`Invalid mana color "${color}"`);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("holdMana: amount must be a non-negative integer");
  return withPlayer(state, playerId, p => ({
    ...p,
    manaHold: { ...(p.manaHold || emptyManaPool()), [color]: ((p.manaHold || {})[color] || 0) + amount },
  }));
}

/** Drop every player's mana hold — the end-of-combat expiry point for "lasts until end of combat" mana. */
export function clearManaHolds(state) {
  const nextPlayers = {};
  for (const pid of Object.keys(state.players)) nextPlayers[pid] = { ...state.players[pid], manaHold: emptyManaPool() };
  return { ...state, players: nextPlayers };
}

// R7 (audit 2026-07-09): emptyManaPoolForPlayer/emptyAllManaPools removed — dead exports
// that BYPASSED gameEngine.emptyManaPools' preservation hook (the one legal pool-drain path).

// ─── Life / damage ────────────────────────────────────────────────────────────

// LIFE-LOSS EVENT (SHELF M3 — Mindcrank's "Whenever an opponent loses life"): a REGISTERED watcher
// transforms state after every life loss. A registry, not an import — triggers.js registers
// checkLifeLossTriggers at module load (gameState is a leaf and must not import the trigger layer).
// Null until registered → loseLife is byte-identical to before. The watcher only ENQUEUES pending
// triggers (the flush runs at the next priority checkpoint), so no recursion happens here; a payoff
// that itself loses life re-enters through the same append (the session resolution cap backstops any
// pathological loop). Every life change routes through loseLife/gainLife (verified — no direct
// `p.life` mutation elsewhere), so damage-caused loss (CR 119.3) fires the event too.
let _lifeLossWatcher = null;
export function registerLifeLossWatcher(fn) { _lifeLossWatcher = fn; }

export function loseLife(state, { playerId, amount, combatDamage }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("loseLife: amount must be non-negative integer");
  // LIFE-LOST-THIS-TURN ledger (Bloodchief Ascension "if an opponent lost 2 or more life this turn" —
  // SHELF S7, CR 603.4): tallied HERE at the single life-loss chokepoint (damage + pay-life + drains all
  // flow through loseLife — the same funnel the lifeLost watcher rides), reset for all seats at untap
  // alongside creaturesDiedThisTurn. Absence of a tally IS "no life lost" (fail-closed).
  //
  // WIN-CON ATTRIBUTION (combat vs burn): `combatDamage` is passed ONLY by the two damage callers —
  // true from combat resolution, false from the burn/ability damage atom — and is undefined for every
  // non-damage loss (pay-life, drains). We stamp `lethalDamageCombat` on the player ONLY when THIS loss
  // is the killing blow (newLife <= 0) and it came from damage, so removePlayerFromGame can split the
  // "damage" win-con into combat / burn. Stamping only on the lethal blow means it can never go stale (a
  // player at <=0 is removed by the very next SBA) and a drain/pay-life finish never mislabels as either.
  const next = withPlayer(state, playerId, p => {
    const newLife = p.life - amount;
    return {
      ...p, life: newLife,
      ...(amount > 0 && { lifeLostThisTurn: (p.lifeLostThisTurn || 0) + amount }),
      // DAMAGE-TAKEN-THIS-TURN (CR 119.3 vs 120.3 — the DAMAGE-only ledger, added 2026-07-25 for
      // bloodthirst). Deliberately NOT the same thing as lifeLostThisTurn: a drain, a pay-life cost or a
      // "each player loses 1 life" effect all lose life WITHOUT damage, and bloodthirst's "if an opponent
      // was dealt DAMAGE this turn" must not fire on those (a forbidden FP). The discriminator is free and
      // exact: both damage callers pass `combatDamage` (true from combat resolution, false from the
      // burn/ability damage atom) while every non-damage loss leaves it undefined — so tallying only when
      // it is defined tracks damage and nothing else. Reset for all seats at untap beside the siblings.
      ...(combatDamage !== undefined && amount > 0 && { damageTakenThisTurn: (p.damageTakenThisTurn || 0) + amount }),
      ...(combatDamage !== undefined && amount > 0 && newLife <= 0 && { lethalDamageCombat: combatDamage }),
    };
  });
  return _lifeLossWatcher && amount > 0 ? _lifeLossWatcher(next, { playerId, amount }) : next;
}

export function gainLife(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("gainLife: amount must be non-negative integer");
  // LIFE-GAINED-THIS-TURN ledger (BLITZ LG-1, CR 119.3 + 603.4): the exact GAIN mirror of loseLife's
  // lifeLostThisTurn — tallied HERE at the single life-GAIN chokepoint. Every gain path (a "you gain N life"
  // spell/trigger, a drain's gain half, lifelink combat, the radiation life-gain replacement) funnels through
  // gainLife (verified — no direct `p.life +=` elsewhere), so a single += here counts each gain exactly once:
  // no double-count, no missed path. A 0-amount "gain" is not a life-gain event (CR 119.3 adjusts only on a
  // real amount) so it's skipped — it must not satisfy "you gained life this turn". The ledger sums the TURN's
  // TOTAL gained (cumulative, not a single event), reset for all seats at untap alongside lifeLostThisTurn /
  // creaturesDiedThisTurn (resetCreatureDeathsAllPlayers). Absence of a tally IS "no life gained" (fail-closed).
  // Read by the "if you('ve) gained [N or more] life this turn" intervening-if (interveningIf.js, CR 603.4).
  return withPlayer(state, playerId, p => ({
    ...p, life: p.life + amount,
    ...(amount > 0 && { lifeGainedThisTurn: (p.lifeGainedThisTurn || 0) + amount }),
  }));
}

/**
 * KW-POISON (CR 122 / 704.5c): give a player poison counters. Infect/Toxic combat damage routes here
 * instead of (or in addition to) life loss; at ten or more the player loses (isPlayerDead). The poison
 * track already exists on player state (createPlayerState `poison: 0`).
 */
// PLAYER-COUNTER ADDITIVE (Winding Constrictor clause 2, CR 122.6): the "+1 of each kind YOU get"
// replacement, applied at these four chokepoints — the single place every energy/experience/poison/rad
// grant flows through. A 0 base amount is NOT an event (CR 614 replaces an existing get), so no bonus.
const withPlayerCounterAdd = (state, playerId, amount) =>
  amount > 0 ? amount + playerCounterAdditive(state, playerId) : amount;

export function addPoison(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("addPoison: amount must be non-negative integer");
  const total = withPlayerCounterAdd(state, playerId, amount);
  return withPlayer(state, playerId, p => ({ ...p, poison: (p.poison || 0) + total }));
}

export function addExperience(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("addExperience: amount must be non-negative integer");
  const total = withPlayerCounterAdd(state, playerId, amount);
  return withPlayer(state, playerId, p => ({ ...p, experience: (p.experience || 0) + total }));
}

/** ENERGY (CR 122.1e): give a player energy counters ("you get {E}"). A player-level resource counter
 * (mirrors addExperience/addPoison) that "Pay {E}" abilities later spend. Non-negative integer amounts. */
export function addEnergy(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("addEnergy: amount must be non-negative integer");
  const total = withPlayerCounterAdd(state, playerId, amount);
  return withPlayer(state, playerId, p => ({ ...p, energy: (p.energy || 0) + total }));
}

/** ENERGY spend (CR 118.8 / 122.1e): pay N energy from a player's pool. Returns the state with energy reduced;
 * callers gate on hasEnergy(state, playerId, n) so this never drives energy negative. */
export function spendEnergy(state, { playerId, amount }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, p => ({ ...p, energy: Math.max(0, (p.energy || 0) - Math.max(0, amount || 0)) }));
}

/** Does a player have at least N energy? (the "Pay {E}" affordability gate) */
export function hasEnergy(state, playerId, amount) {
  return (state.players?.[playerId]?.energy || 0) >= (amount || 0);
}

/** RAD-COUNTERS (CR 728): give a player rad counters. A player-level counter (mirrors addPoison/addExperience).
 * The inherent radiation ability (applyRadiation), fired by the engine at each player's precombat main, mills +
 * drains based on the count. */
export function addRadCounters(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("addRadCounters: amount must be non-negative integer");
  const total = withPlayerCounterAdd(state, playerId, amount);
  return withPlayer(state, playerId, p => ({ ...p, radCounters: (p.radCounters || 0) + total }));
}

/** Remove rad counters from a player, floored at 0 (the radiation ability removes one per nonland milled — CR 728.1). */
export function removeRadCounters(state, { playerId, amount }) {
  assertPlayer(playerId);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("removeRadCounters: amount must be non-negative integer");
  return withPlayer(state, playerId, p => ({ ...p, radCounters: Math.max(0, (p.radCounters || 0) - amount) }));
}

/** Front-face type line (CR 712.8a) — a card in a hidden/graveyard zone has ONLY its front-face characteristics,
 * so an MDFC whose BACK is a land (Malakir Rebirth // Malakir Mire = Instant // Land) is a NONLAND when milled.
 * Mirrors castsAsPlaneswalker's face[0] read; also splits a "//"-joined type string defensively. */
function frontFaceTypeLine(card) {
  const faces = card?.card_faces;
  const raw = Array.isArray(faces) && faces.length > 0
    ? String(faces[0]?.type_line || faces[0]?.type || "")
    : String(card?.type || card?.type_line || "");
  return raw.split("//")[0];
}

/**
 * RAD-COUNTERS inherent ability (CR 728.1) — at the beginning of a player's precombat main phase, if that
 * player has one or more rad counters, that player mills a number of cards equal to the number of rad counters
 * they have. For each NONLAND card milled this way, that player loses 1 life and removes one rad counter from
 * themselves. Lands milled cost nothing (no life, no counter removed). The ability has no source and is
 * controlled by the active player; gameEngine fires it for the active player at their precombat-main begin.
 * Milled cards are judged by their FRONT face (frontFaceTypeLine). Pure. An empty/short library mills what it
 * can — fewer nonlands milled → fewer counters removed → the remaining rad persists (CR-correct partial). */
export function applyRadiation(state, { playerId }) {
  assertPlayer(playerId);
  const player = state.players[playerId];
  if (!player) return state;
  const rad = player.radCounters || 0;
  if (rad <= 0) return state;
  // MILL-DOUBLER (Bruvac, SHELF M2 — CR 616): radiation's mill IS a mill, so an opponent's mill-count
  // replacement doubles it (the doubled nonlands then cost life + rad removal below — the real synergy).
  const toMill = Math.min(rad * millMultiplier(state, playerId), player.library.length);
  if (toMill === 0) return state;
  const nonland = player.library.slice(0, toMill).filter((c) => !/\bLand\b/.test(frontFaceTypeLine(c))).length;
  let next = millCards(state, { playerId, count: toMill });
  if (nonland > 0) {
    // RADIATION LIFE-GAIN REPLACEMENT (Strong, the Brutish Thespian — "You gain life rather than lose life
    // from radiation.", SHELF S7 / CR 614): checked by the EXACT printed phrase on the radiated player's own
    // battlefield (gameState is a leaf — no parser import; the phrase appears on no other effect). The rad
    // counters are still removed either way (the replacement rewrites only the life event).
    const gains = (player.battlefield || []).some((p) =>
      /you gain life rather than lose life from radiation/i.test(String(p?.card?.oracle || "")));
    next = gains ? gainLife(next, { playerId, amount: nonland }) : loseLife(next, { playerId, amount: nonland });
    next = removeRadCounters(next, { playerId, amount: nonland });
  }
  return next;
}

/** Mark combat (or other) damage on a permanent. */
export function markCombatDamage(state, { permanentId, amount }) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("markCombatDamage: amount must be a non-negative integer");
  if (amount === 0) return state;
  return updatePermanent(state, permanentId, p => ({ ...p, damageMarked: (p.damageMarked || 0) + amount }));
}

// EXILE-IF-DIES (subsystem 3) — flag a creature so the lethal SBA (destroyLethalCreatures) sends it to
// EXILE instead of the graveyard if it would die on `turn`. Models the floating death-replacement "If that
// creature would die this turn, exile it instead" (Lava Coil / Magma Spray / Puncturing Blow). The flag
// stores the turn it applies to, so it SELF-EXPIRES — destroyLethalCreatures honors it ONLY when
// `exileIfDiesTurn === state.turn`, so a creature surviving this turn dies normally on any later turn (no
// stale-flag exile, no end-of-turn cleanup pass needed).
export function markExileIfDies(state, { permanentId, turn }) {
  return updatePermanent(state, permanentId, p => ({ ...p, exileIfDiesTurn: turn }));
}

/** Wipe marked damage off every permanent (combat damage wears off at cleanup). Also expires unused
 * regeneration shields (CR 701.19 — the replacement lasts "this turn" only), since both are turn-scoped
 * cleanup state cleared at the same step. */
export function clearCombatDamage(state) {
  let changed = false;
  const players = {};
  const dirty = (p) => (p.damageMarked || 0) !== 0 || (p.regenShields || 0) !== 0;
  for (const [pid, player] of Object.entries(state.players)) {
    if (!player.battlefield.some(dirty)) {
      players[pid] = player;
      continue;
    }
    changed = true;
    players[pid] = {
      ...player,
      battlefield: player.battlefield.map(p => (dirty(p) ? { ...p, damageMarked: 0, regenShields: 0 } : p)),
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
export function destroyLethalCreatures(state, deathtouched = new Set(), cause = "sba") {
  const dead = [];
  const regenerated = []; // REGEN (CR 701.19) — creatures whose destruction a regen shield replaces this SBA
  const shieldSaved = []; // SHIELD COUNTER (CR 122.1c) — creatures whose destruction a shield counter replaces
  const totemSaved = []; // TOTEM ARMOR (CR 702.116) — {hostId, auraId} pairs whose destruction the Aura replaces
  // Look-back snapshot (CR 603.10a): by the time dies-triggers are checked the permanent is
  // already in the graveyard, so its last-known characteristics travel with the `dead` entry.
  // SELF-LTB (Wave 4): the look-back also carries the dead creature's `attachments` ids (the
  // equipment/aura that WERE on it at death) — captured here BEFORE destroyLethalCreatures' move loop
  // detaches them — so the "Whenever equipped creature dies, return it to its owner's hand" trigger
  // (Sword of the Realms) can match its watcher (an equipment whose id is in this list) even though the
  // equipment's own `attachedTo` is already null by the time checkDiesTriggers runs.
  // DIES-TRIGGER-RESOURCE-PAYOFFS (Wave 3b): capture the dying creature's POWER here too (CR 603.6e — a
  // dies-trigger that reads "its power" uses the creature's last-known power AS IT EXISTED ON THE
  // BATTLEFIELD just before it left). `creaturePower(perm, state)` reads the full layer-aware value
  // (counters + anthems + pumps) BECAUSE this runs inside the loop over the ORIGINAL pre-move `state`
  // (the perm is still on the battlefield) — captured BEFORE the moveCardToZone look-back below, so a
  // Goldvein/Lifeblood/Feral-Ghoul "equal to its power" payoff sees the real on-board power, never the
  // post-death printed-only value. Non-finite (CDA "*" not yet captured) → null (the payoff no-ops to 0,
  // never a fabricated count).
  const markDead = (pid, perm) => {
    const pw = creaturePower(perm, state);
    // BASE power too (CR 613.4a) — the Jason-Bright dies intervening-if ("its power was different from its
    // base power") compares the two look-back values; captured here pre-move like `power`.
    const bpw = creatureBasePower(perm, state);
    dead.push({
      controller: pid,
      id: perm.id,
      name: perm.card?.name || "creature",
      card: perm.card,
      attachments: [...(perm.attachments || [])],
      power: Number.isFinite(pw) ? pw : null,
      basePower: Number.isFinite(bpw) ? bpw : null,
      // KW-UNDYING (CR 702.92a + 603.6e): snapshot the dying permanent's counters BEFORE the move loop —
      // the undying intervening-if ("if it had no +1/+1 counters on it") reads this last-known state.
      counters: { ...(perm.counters || {}) },
      // EXILE-IF-DIES (subsystem 3): a creature flagged "if it would die this turn, exile it instead" goes
      // to EXILE instead of the graveyard — but ONLY this turn (the flag stores the turn it applies to, so
      // it self-expires; a stale flag from a prior turn is ignored).
      exileInstead: perm.exileIfDiesTurn === state.turn,
    });
  };
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      // Layer-aware creature-ness (WALT-ANIMATE): an animated land/man-land is subject to the
      // lethal/0-toughness SBAs as the creature it has become, not just printed creatures.
      if (!permanentIsCreature(state, perm.id)) continue;
      // Printed creatures keep the legacy guard EXACTLY: an unevaluable printed toughness
      // ("*"/unknown) is skipped so the SBA never mis-sizes e.g. a CDA creature the engine
      // can't size. A permanent that is a creature ONLY via a layer-4 effect (an animated land)
      // has no printed toughness — its toughness is supplied by the animating layer, so it's
      // read from the derived value below instead of being skipped here.
      const printedCreature = String(perm.card?.type || perm.card?.type_line || "").includes("Creature");
      if (printedCreature && !Number.isFinite(Number(perm.card?.toughness))) continue;
      const tough = creatureToughness(perm, state);
      if (!Number.isFinite(tough)) continue; // animated permanent whose derived toughness is unknown — skip
      const dmg = perm.damageMarked || 0;
      if (tough <= 0) {
        markDead(pid, perm); // CR 704.5f — indestructible does NOT prevent this
        continue;
      }
      const lethalDamage = (dmg > 0 && dmg >= tough) || (deathtouched.has(perm.id) && dmg > 0);
      if (lethalDamage && !isIndestructible(perm, state)) {
        // CR 122.1c — a SHIELD COUNTER replaces this destruction (704.5g "would be destroyed"): remove one
        // shield counter (applied below) instead of dying, no tap. Checked BEFORE regen (both are replacements;
        // the permanent's controller orders them per CR 616, and a shield is strictly better — no tap). In
        // normal flow damage to a shielded creature is PREVENTED at the damage site (never marked, so this rarely
        // fires), but this mirrors the regen safety net so any lethal-damage that reached the SBA still consumes
        // a shield rather than killing. Checked after indestructible (a creature can't be both).
        // TOTEM ARMOR (CR 702.116) is a THIRD "would be destroyed" replacement — checked LAST so a shield/regen
        // (which don't sacrifice the Aura) is preferred when the controller has both; if the only save is totem
        // armor, the Aura is destroyed instead and damage is cleared (applied below).
        const totemAuraId = totemArmorAuraFor(state, perm);
        if (hasShieldCounter(perm)) shieldSaved.push(perm.id);
        else if ((perm.regenShields || 0) > 0) regenerated.push(perm.id); // CR 701.19 — regen shield replaces
        else if (totemAuraId) totemSaved.push({ hostId: perm.id, auraId: totemAuraId }); // CR 702.116 — totem armor replaces
        else markDead(pid, perm); // CR 704.5g — destruction; an indestructible creature survives
      }
    }
  }
  let next = state;
  for (const d of dead) {
    // EXILE-IF-DIES (subsystem 3): the death-replacement reroutes a flagged creature to exile (CR 614 — a
    // replacement effect; "exile it instead" of the graveyard). All other deaths go to the graveyard.
    const toZone = d.exileInstead ? "exile" : "graveyard";
    next = moveCardToZone(next, { playerId: d.controller, fromZone: "battlefield", toZone, cardId: d.id });
    // N4: log every death at this single chokepoint (combat AND non-combat — a -X/-X wipe, a 0/0 token,
    // a direct-damage spell) so the board-visible "a creature just died" event is never silent. `cause`
    // defaults to "sba" (the generic SBA path); combatResolution.js passes "combat" explicitly so its
    // own (now-removed) duplicate emission collapses into this one without changing the log shape.
    // EXILE-INSTEAD gets its own kind (R1.1): an exiled creature did NOT die (CR 700.4) — labeling it
    // "creature-dies" over-counted deaths in every log consumer (gameAnalysis combat trades included).
    next = logEvent(next, { kind: d.exileInstead ? "creature-exiled-instead" : "creature-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause });
  }
  for (const id of shieldSaved) next = consumeShieldCounter(next, id); // CR 122.1c — remove one shield, survive (no tap)
  for (const pid of regenerated) next = regeneratePermanent(next, pid); // CR 701.19a — clear damage + tap, survive
  for (const t of totemSaved) next = applyTotemArmor(next, t.hostId, t.auraId); // CR 702.116 — destroy the Aura, clear damage, host survives
  return { state: next, dead };
}

/**
 * State-based action: the LEGEND RULE (CR 704.5j, CR-remediation B2). If a player controls two or more
 * legendary permanents with the same name, that player chooses one and the rest are put into their
 * owners' graveyards ("put into", NOT "destroyed" — indestructible/regeneration/shield/totem-armor do
 * not apply, exactly like the 0-toughness SBA). v1 keep-policy (a deterministic legal choice — the CR
 * lets the controller pick either): keep the permanent with the HIGHEST timestamp (the most recent
 * arrival — matches the intent of casting/cloning a fresh copy). Legendary-ness and the name are read
 * off the permanent's CURRENT card (perm.card), so a clone that copied a legendary participates as the
 * copy it is. Returns `{ state, dead }` where `dead` carries the same look-back shape
 * destroyLethalCreatures emits — CREATURE entries only (feed to checkDiesTriggers); a non-creature
 * legend's graveyard trip still queues its leave events via moveCardToZone.
 */
export function applyLegendRule(state) {
  const dead = [];
  const moves = []; // {controller, id, toZone} — non-creature legends move without a dies entry
  for (const [pid, player] of Object.entries(state.players)) {
    const byName = new Map();
    for (const perm of player.battlefield) {
      const type = String(perm.card?.type || perm.card?.type_line || "");
      if (!/\bLegendary\b/.test(type)) continue;
      const name = perm.card?.name;
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(perm);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const keep = group.reduce((a, b) => ((b.timestamp || 0) >= (a.timestamp || 0) ? b : a));
      for (const perm of group) {
        if (perm.id === keep.id) continue;
        const isCreature = /\bCreature\b/.test(String(perm.card?.type || perm.card?.type_line || ""));
        if (isCreature) {
          // Same look-back capture as destroyLethalCreatures.markDead — power/counters read BEFORE the move.
          const pw = creaturePower(perm, state);
          const bpw = creatureBasePower(perm, state);
          dead.push({
            controller: pid,
            id: perm.id,
            name: perm.card?.name || "creature",
            card: perm.card,
            attachments: [...(perm.attachments || [])],
            power: Number.isFinite(pw) ? pw : null,
            basePower: Number.isFinite(bpw) ? bpw : null,
            counters: { ...(perm.counters || {}) },
            // EXILE-IF-DIES: "if it would die this turn, exile it instead" applies to ANY death,
            // legend-rule included (CR 700.4 — this IS a death).
            exileInstead: perm.exileIfDiesTurn === state.turn,
          });
        } else {
          moves.push({ controller: pid, id: perm.id });
        }
      }
    }
  }
  let next = state;
  for (const d of dead) {
    next = moveCardToZone(next, { playerId: d.controller, fromZone: "battlefield", toZone: d.exileInstead ? "exile" : "graveyard", cardId: d.id });
    next = logEvent(next, { kind: d.exileInstead ? "creature-exiled-instead" : "creature-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "legend-rule" });
  }
  for (const m of moves) {
    next = moveCardToZone(next, { playerId: m.controller, fromZone: "battlefield", toZone: "graveyard", cardId: m.id });
    next = logEvent(next, { kind: "legend-rule", turn: next.turn, controller: m.controller });
  }
  return { state: next, dead };
}

/**
 * Track commander combat damage to a player, keyed PER-COMMANDER (by the source commander's card id) —
 * CR 903.10a is "21+ combat damage from a SINGLE commander", so a player with two partner commanders
 * (different cards) tracks each separately. `isPlayerDead` reads `commanderDamageFrom` for the 21-loss SBA.
 * A copy of a commander is not a commander, so only a real `isCommander` source ever supplies a `commanderId`.
 *
 * KEYING (overhaul pass): the key is the commander's per-seat INSTANCE id (card.commanderInstanceId,
 * stamped at seat build — "<seatId>::<cardId>"), falling back to the raw card id for unstamped
 * fixtures/old saves. Persists across re-cast (CR 704.6c) AND keeps a same-commander MIRROR's two
 * instances separate (11+10 split across two seats is NOT a 21-rule death). The CMD-CAST tax never
 * collapsed (it lives in a per-player map); it now uses the same key purely for uniformity.
 */
export function addCommanderDamage(state, { commanderId, toPlayer, amount }) {
  assertPlayer(toPlayer);
  if (!commanderId || !(amount > 0)) return state;
  return withPlayer(state, toPlayer, p => ({
    ...p,
    commanderDamageFrom: {
      ...p.commanderDamageFrom,
      [commanderId]: (p.commanderDamageFrom[commanderId] || 0) + amount,
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
    extraLandsThisTurn: 0,  // ONE-SHOT-EXTRA-LAND: the resolving "additional land this turn" budget is per-turn; reset alongside landsPlayedThisTurn so it never carries into a later turn (CR 505.5b — "this turn" only).
    cardsDrawnThisTurn: 0,
  }));
}

/**
 * TRIG-DRAW2 — reset the per-turn DRAW counter for EVERY player at turn start. Unlike landsPlayedThisTurn
 * (active-player only — you play lands on your own turn), "draw your second card each turn" must count each
 * player's draws within the CURRENT turn regardless of whose turn it is (a player can draw off-turn via
 * instants), so cardsDrawnThisTurn resets for all seats each turn — otherwise an off-turn draw would read a
 * stale count from the player's last turn and false-fire (CR: "each turn" is per game-turn). Idempotent for
 * the active player (resetTurnCounters already zeroed theirs). Called alongside resetTurnCounters at untap.
 */
export function resetCardsDrawnAllPlayers(state) {
  const players = {};
  for (const id of Object.keys(state.players)) {
    players[id] = { ...state.players[id], cardsDrawnThisTurn: 0 };
  }
  return { ...state, players };
}

/**
 * TRIG-CAST2 — record that `playerId` cast a spell (increments spellsCastThisTurn). Called at the cast
 * chokepoint (actionDispatcher.applyCastSpell) BEFORE checkCastTriggers, so "cast your second spell each
 * turn" reads the running count and fires when it reaches 2. Each cast is one spell (CR 601 — spells are
 * cast one at a time), so the count passes through 2 exactly once per turn.
 */
export function recordSpellCast(state, { playerId }) {
  assertPlayer(playerId);
  return withPlayer(state, playerId, p => ({ ...p, spellsCastThisTurn: (p.spellsCastThisTurn || 0) + 1 }));
}

/**
 * TRIG-CAST2 — reset the per-turn SPELL counter for EVERY player at turn start (the spell analogue of
 * resetCardsDrawnAllPlayers). You cast instants on any player's turn, so "second spell each turn" must
 * count per game-turn for all seats — a stale off-turn count would false-fire. Called alongside the draw
 * reset at untap.
 */
export function resetSpellsCastAllPlayers(state) {
  const players = {};
  for (const id of Object.keys(state.players)) {
    players[id] = { ...state.players[id], spellsCastThisTurn: 0 };
  }
  return { ...state, players };
}

/**
 * DEATHS-THIS-TURN (CR 700.4) — record that one or more creatures DIED, bumping each dying creature's
 * controller's `creaturesDiedThisTurn`. Called from the single creature-death chokepoint
 * (triggers.checkDiesTriggers) with that batch's `dead` look-back list, BEFORE the dies-triggers fire — so a
 * dies-triggered "for each creature that died this turn" payoff (Mahadi at end step) and the
 * "if a creature died this turn" intervening-if both read the up-to-date running count.
 *
 * A creature "dies" only when it's put into a GRAVEYARD from the battlefield (CR 700.4). So this deliberately
 * EXCLUDES two kinds of `dead` entries that did NOT die:
 *   - `exileInstead` (EXILE-IF-DIES replacement, CR 614): the creature was exiled instead of being put into a
 *     graveyard, so it never died — it must not count (a forbidden over-count would be a CREED FP).
 *   - a non-CREATURE look-back: every checkDiesTriggers caller passes creatures (planeswalker deaths route
 *     through checkPlaneswalkerDiesTriggers), but the count is guarded on the look-back's card type anyway so
 *     a stray non-creature can never inflate the tally.
 * Per-controller storage (not a single global) lets the controller-scoped reader ("…died under your control
 * this turn" — Body Count) read one seat while the all-seats reader ("…died this turn" — Mahadi) sums them.
 * An entry with no controller is skipped (a safe no-op). Pure; returns a new state.
 */
export function recordCreatureDeaths(state, dead) {
  if (!Array.isArray(dead) || dead.length === 0) return state;
  let next = state;
  for (const d of dead) {
    if (!d || d.exileInstead || !d.controller || !state.players[d.controller]) continue;
    if (!/\bCreature\b/.test(String(d.card?.type || d.card?.type_line || ""))) continue; // only creatures count (CR 700.4)
    next = withPlayer(next, d.controller, (p) => ({ ...p, creaturesDiedThisTurn: (p.creaturesDiedThisTurn || 0) + 1 }));
  }
  return next;
}

/**
 * DEATHS-THIS-TURN — reset the per-turn creature-death counter for EVERY player at turn start (the death
 * analogue of resetCardsDrawnAllPlayers / resetSpellsCastAllPlayers). A creature can die on ANY player's turn
 * (combat, instant-speed removal, a sacrifice cost), so "died this turn" must count per game-turn for all seats
 * — a stale count from a player's previous turn would mis-feed an end-step "for each creature that died this
 * turn" / "if a creature died this turn" check. Called alongside the draw/spell resets at untap.
 */
export function resetCreatureDeathsAllPlayers(state) {
  const players = {};
  for (const id of Object.keys(state.players)) {
    // lifeLostThisTurn + lifeGainedThisTurn + gyEnteredThisTurn reset on the SAME per-game-turn cadence
    // (Bloodchief Ascension's end-step check / Regal Bloodlord's end-step "if you gained life this turn" /
    // Fraying Sanity's end-step mill — any can accrue on any player's turn, so all seats clear each turn).
    players[id] = { ...state.players[id], creaturesDiedThisTurn: 0, lifeLostThisTurn: 0, lifeGainedThisTurn: 0, gyEnteredThisTurn: 0, damageTakenThisTurn: 0 };
  }
  return { ...state, players };
}

/**
 * RAID (CR 508.1) — clear every seat's `attackedThisTurn` flag at untap. ALL-seats (not active-only): a Raid
 * ETB can fire off-turn (blink/reanimate at instant speed on another player's turn), so a stale flag from a
 * seat's own last combat must be cleared each turn, not just the active player's — closes a stale-read FP.
 */
export function resetAttackedThisTurnAllPlayers(state) {
  const players = {};
  for (const id of Object.keys(state.players)) {
    players[id] = {
      ...state.players[id],
      attackedThisTurn: false,
      // BOAST's per-permanent history clears HERE, beside the seat flag, so the two can never drift.
      // Only rewrite the permanents that actually carry the flag — the common case allocates nothing.
      battlefield: (state.players[id].battlefield || []).some((p) => p.attackedThisTurn)
        ? state.players[id].battlefield.map((p) => (p.attackedThisTurn ? { ...p, attackedThisTurn: false } : p))
        : state.players[id].battlefield,
    };
  }
  return { ...state, players };
}

/**
 * KIRA "for the first time each turn" (CR 603.2) — clear every permanent's per-turn `becameTargetThisTurn` flag
 * at untap, for EVERY seat's battlefield. ALL-seats (not active-only): a creature can become a target on ANY
 * player's turn (an instant-speed spell/ability targets it off-turn), and the "first time each turn" gate resets
 * once per turn cycle — so the flag every permanent carries must be cleared each turn regardless of whose turn it
 * is. Only permanents that actually carry the flag are rewritten (the common untapped-fresh permanent is left
 * byte-identical), so this is cheap. Pure.
 */
export function resetBecameTargetThisTurnAllPlayers(state) {
  const players = {};
  for (const id of Object.keys(state.players)) {
    const player = state.players[id];
    players[id] = {
      ...player,
      battlefield: player.battlefield.map((p) =>
        p.becameTargetThisTurn ? { ...p, becameTargetThisTurn: false } : p,
      ),
    };
  }
  return { ...state, players };
}

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * Append a log entry. The log is the source of truth for replay and
 * for the narrator (PR5). Engine + helpers add to it; UI reads from it.
 */
export function logEvent(state, event) {
  return appendLog(state, event);
}
