/**
 * loopStepLine.js — the AI's line for a LOOP STEP: the one action of a repeatable loop it is offered again (2026-11-01).
 *
 * THE RULE (Colton, 2026-10-03): "A combo deck's AI plays to its combo line: build the resource only to 'enough', then forgo other
 * choices, then execute the finish. Never make infinite anything." A loop that nets mana or triggers runs only until it has enough for
 * something the seat will actually do; a loop step that adds nothing it can use is not a play.
 *
 * THE CASES THAT FORCED IT (Omnath's 10,000-game Squirrel Girl run on v0.169.0, sg-baseline-v169): 110 games ended in a turn stall,
 * and Kinnan Mana Overload sat at 108 of them (117 of its 1,034 games halted). Replayed, every stall is one of these steps, taken
 * thousands of times in one turn:
 *   UNTAP — Kinnan, Bonder Prodigy beside Basalt Monolith and Grim Monolith ("{3}: Untap this artifact." / "{4}: …"): each untap is
 *     paid by tapping a Monolith (three mana, four with Kinnan) and nets at most one colorless mana, made in a window with nothing to
 *     spend it on (another seat's upkeep, a hand of sorcery-speed cards). Grim's untap nets nothing; paid with the other Monolith's
 *     mana, it untaps an untapped artifact and nets minus four.
 *   EMPTY LIBRARY — Thrasios, Triton Hero ("{4}: Scry 1, then reveal the top card of your library…") activated 1,911 more times
 *     after the library was empty: each activation did nothing.
 *   RECAST — Tidespout Tyrant ("Whenever you cast a spell, return target permanent to its owner's hand.") once every opponent's
 *     permanent was gone: each cast returned one of the caster's own permanents (CR 603.3d — the mandatory trigger takes a legal
 *     target), the default AI cast it again, and so on 5,417 times (seed 3277877396, turn 34). The trigger loop had already done what
 *     it does — there was nothing left on an opponent's side to return.
 * The persona pilots (omnath-tools, decide.mjs) took the first two; the default AI (opponentAI.pickAction) took the third.
 *   DRAW-BACK (2026-11-02, seed 106558's turn 46, the one Kinnan stall the first three left): Kinnan's seat, its library drawn out by
 *     Thrasios, cast Green Sun's Zenith ("Search your library for a green creature card with mana value X or less … Shuffle Green
 *     Sun's Zenith into its owner's library.") into the empty library — the search found nothing and the Zenith shuffled itself in —
 *     and Thrasios ("{4}: Scry 1, then reveal the top card of your library … Otherwise, draw a card.") drew it straight back, 794
 *     times on another seat's upkeep. Each cast untapped and pumped its Birds and Otters (Valley Floodcaller: "Whenever you cast a
 *     noncreature spell, Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them."), which Enduring
 *     Vitality, Kinnan and Badgermole Cub turned into more mana than the two cost; three Hullbreaker Horrors had no target. Mana
 *     nothing could use, a pump on another player's upkeep: each iteration added nothing.
 *
 * WHAT THIS LEAF DOES: it names the offered actions that are loop steps and says which of them to hold.
 *   - An UNTAP step (an activation whose whole effect is "untap this permanent", on a mana source) builds mana: its NET is the mana
 *     the permanent makes (manaUntapLine.manaValueOf, the augments — Kinnan — counted) minus the activation's mana cost when the
 *     permanent is tapped or the offered payment taps it; minus the cost when it is untapped and paid from elsewhere (the untap does
 *     nothing). A step that nets nothing is held. A step that nets mana is a play only while the mana has a use: some cast or
 *     activation the seat could make in this window with more of the loop's own mana but cannot make now without tapping the loop's
 *     own source — the loop floats its mana and keeps its source for the next step, so a repeatable sink (Thrasios) is paid from the
 *     pool and the loop goes on (`loopManaHasUse` — the engine's own offer, read twice with that source tapped: as the board stands
 *     and with LOOP_MANA_PLENTY more of each colour the step makes; a card or ability already offered at any X counts as offered, so
 *     an X spell never makes the demand endless). Once everything the seat could spend on is offered so, there is enough: the step
 *     is held.
 *   - An EMPTY-LIBRARY step (an activation whose every effect reads its controller's own library — draw, scry, surveil, the
 *     reveal-top routes, a dig — while that library is empty) does nothing, or (a draw) loses the game (CR 704.5b): held.
 *     Unless a draw there is the win (Laboratory Maniac, `emptyDrawIsTheWin`): then it is the finish, and it is not a step.
 *   - A RECAST (a cast of a card its caster already cast this turn) while one of the caster's own cast triggers would be FORCED onto
 *     its own permanent and remove it (gameEngine.castTriggerRemovesOwn): the trigger has nothing left to take on any opponent's side,
 *     so the cast-and-return loop has done its work: held. A first cast this turn is not a loop step.
 *   - A DRAW-BACK (an activation whose every effect reads its controller's own library, as the empty-library step's, while that library
 *     holds nothing but spells that come back by themselves — each shuffles itself into its owner's library and its every effect is a
 *     search of that library that no card in it passes: Green Sun's Zenith into an otherwise empty library) takes back a card whose
 *     only use is to be cast again, find nothing and return. It is held while that recast adds nothing the seat can use
 *     (`recastAddsNothing`): none of its own cast triggers takes anything on an opponent's side or does anything but untap or pump
 *     its own permanents and add mana (gameEngine.castTriggerOutcomes — the flush's own routing and chooser), the mana has no use
 *     (the demand read, every colour), the pump has no use (`pumpHasUse`: enough for a pump is lethal — on its own turn before combat
 *     damage while its attack-capable power is short of an opponent's life; none on another player's turn), and the draw fires none
 *     of its own draw triggers. Holding the draw, not the cast, leaves the spell in the library: its controller's next draw does not
 *     lose (CR 704.5b). A draw-back with a use of its own (its recast takes an opponent's permanent, deals damage, pumps toward
 *     lethal) is the play the demand read counts as a spend, so the mana that feeds it — an untap of a Monolith — has a use.
 *
 * EVERYTHING HERE IS RESTRAINT over actions the engine offered: every action stays legal and offered (a person can take the loop as
 * many times as they choose — CR 732.1b, 732.2a), and nothing is ever added. A seat with none of these steps on offer plays exactly
 * as before. Pure reads of game state; nothing is written.
 *
 * THE MEMOS (2026-11-02). Every read here is a pure function of the state object it is handed, and the engine hands both of its AI
 * readers the same object in a tick (pickAction, then the pilot through the seam), so each read is computed once per state object:
 * the cast-trigger previews per card (one card offered at ten X values is one preview), the mana a permanent makes and the colours it
 * adds, the engine's offer for a state (`offerOf`), the demand read per (state, colours) with the source kept tapped, and each
 * offered action's step. The demand comparison reads the cheap side first (`richUnlocks`): an action of the richer offer whose card
 * or ability is already a spend now never pays for its own step read. Same answers as the reads without the memos, step for step
 * (loopStepCost.test.js counts the calls; the A/B and seed 106558 compare every pick).
 *
 * Consumers: opponentAI.pickAction (both of its action lists, before every picker — the recast and empty-library steps; none of its
 * pickers takes an "untap this" activation, so it leaves that read, the costly one, unread). withLoopSteps wraps the tokenLoopLine
 * seam ({ tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan }) so a pilot that reads that seam holds every step.
 */
import { legalActionsForPlayer, offeredPaymentPlan, offerMadeFor } from "./legalChoices.js";
import { castTriggerRemovesOwn, castTriggerOutcomes } from "./gameEngine.js";
import { manaValueFromSources } from "./manaUntapLine.js";
import { manaSources } from "./manaModel.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectProgram } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter } from "./effects/atoms/library.js";
import { checkCardDrawnTriggers } from "./triggers.js";
import { findPermanent } from "./gameState.js";
import { playerCantWinGame, playerEmptyDrawWins, withAbilityLoss, boardHasAbilityLoss, permanentIsCreature, permanentHasKeyword, permanentPower } from "./layers.js"; // + the ability view (CR 613.1f)

/** How much more of each colour a building step makes the demand read pretends the seat holds: above every fixed cost printed. */
export const LOOP_MANA_PLENTY = 20;

const POOL_COLORS = ["W", "U", "B", "R", "G", "C"];

/** The ops that act on their controller's own library (and on nothing else) when they carry no target and no other player. */
const OWN_LIBRARY_OPS = new Set(["draw", "scry", "surveil", "reveal-top-conditional", "impulse-dig"]);
const actsOnOwnLibraryOnly = (atom) => OWN_LIBRARY_OPS.has(atom?.op) && atom.targetType == null
  && (atom.who == null || atom.who === "you" || atom.who === "controller");

// ── THE MEMOS: one table per state object. Every read below is a pure function of the state it is handed (no read writes a state),
// so a value computed for a state object is the value a second computation would give. ──
const memos = new WeakMap();
function memoTable(state) {
  let table = memos.get(state);
  if (!table) memos.set(state, (table = { keyed: new Map(), byObject: new WeakMap() }));
  return table;
}
/** `compute()` once per (state object, key). */
function memoized(state, key, compute) {
  const keyed = memoTable(state).keyed;
  if (keyed.has(key)) return keyed.get(key);
  const value = compute();
  keyed.set(key, value);
  return value;
}
/** `compute()` once per (state object, object, key) — a card or an offered action, by identity. */
function memoizedFor(state, object, key, compute) {
  if (object === null || typeof object !== "object") return compute();
  const byObject = memoTable(state).byObject;
  let keyed = byObject.get(object);
  if (!keyed) byObject.set(object, (keyed = new Map()));
  if (keyed.has(key)) return keyed.get(key);
  const value = compute();
  keyed.set(key, value);
  return value;
}

/** The engine's offer to `seat` in `state`, once per state object: the list the engine itself built for that object when it did
 *  (legalChoices.offerMadeFor — the engine offers before its AI reads), else legalActionsForPlayer's. Read, never written. */
const offerOf = (state, seat) => memoized(state, `offer|${seat}`, () => offerMadeFor(state, seat) ?? legalActionsForPlayer(state, seat));

/**
 * A draw from an empty library is the FINISH, not a step, while its controller has a live "if you would draw a card while your library
 * has no cards in it, you win the game instead" static (Laboratory Maniac — a replacement effect, CR 614.1a; an effect may state that a
 * player wins the game, CR 104.2b) and nothing stops that player winning.
 */
const emptyDrawIsTheWin = (state, seat, atoms) => atoms.some((a) => a.op === "draw")
  && playerEmptyDrawWins(state, seat) && !playerCantWinGame(state, seat);

const atomsOf = (action) => (action?.program?.structure === "modal" ? null : action?.program?.atoms || null);

/** Is this program (an offered activation's, or a parsed ability's) "untap this permanent" and nothing else? */
const untapSelfAbility = (ab) => {
  const atoms = atomsOf(ab);
  return !!atoms && atoms.length === 1 && atoms[0].op === "untap" && (atoms[0].selfPermanent === true || atoms[0].target === "self");
};

/** Is this offered activation "untap this permanent" and nothing else? */
export function isUntapSelfAction(action) {
  return action?.kind === "activate-ability" && !action.isEquipAbility && untapSelfAbility(action);
}

const ownPermanent = (state, seat, id) => (state?.players?.[seat]?.battlefield || []).find((p) => p.id === id) || null;
const costTotal = (action) => (Number.isFinite(action?.cmc) ? action.cmc : 0);

/** The card names `seat` has cast this turn (the game log's cast-spell entries since the turn began). */
const castNamesCache = new WeakMap();
export function castThisTurn(state, seat) {
  let bySeat = castNamesCache.get(state);
  if (!bySeat) castNamesCache.set(state, (bySeat = new Map()));
  if (bySeat.has(seat)) return bySeat.get(seat);
  const names = new Set();
  const log = Array.isArray(state?.log) ? state.log : [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e?.turn !== state.turn) break;
    if (e.kind === "cast-spell" && e.playerId === seat && e.cardName) names.add(e.cardName);
  }
  bySeat.set(seat, names);
  return names;
}

const cardOfCast = (state, seat, action) => action.faceCard
  || (state?.players?.[seat]?.[action.fromZone || "hand"] || []).find((c) => c?.id === action.cardId) || null;

// The memoized reads under a step (pure in their arguments): the mana a permanent makes and the colours it adds, both off one
// manaSources list read with the permanent untapped (manaUntapLine.manaValueOf's read), and a cast's forced self-removal (one
// preview per card — a card offered at ten X values is one card).
function sourcesUntapped(state, seat, permanentId) {
  const player = state.players[seat];
  const perm = player.battlefield.find((p) => p.id === permanentId);
  if (!perm?.tapped) return memoized(state, `sources|${seat}`, () => manaSources(state, seat));
  return memoized(state, `sources|${seat}|${permanentId}`, () => manaSources({ ...state, players: { ...state.players, [seat]: { ...player,
    battlefield: player.battlefield.map((p) => (p.id === permanentId ? { ...p, tapped: false } : p)) } } }, seat));
}
const manaMadeBy = (state, seat, permanentId) => memoized(state, `makes|${seat}|${permanentId}`, () => manaValueFromSources(sourcesUntapped(state, seat, permanentId), permanentId));
const colorsMadeBy = (state, seat, permanentId) => memoized(state, `colors|${seat}|${permanentId}`, () => producedColors(sourcesUntapped(state, seat, permanentId), permanentId));
const castRemovesOwn = (state, seat, card, castFromZone) =>
  memoizedFor(state, card, `removes|${seat}|${castFromZone}`, () => castTriggerRemovesOwn(state, seat, card, { castFromZone }));

/**
 * The loop step this offered action is, or null:
 *   { kind: "untap", permanentId, net, colors }  — "untap this permanent" on a mana source; net = the mana it adds over the step
 *   { kind: "empty-library", permanentId }       — an activation that reads only its controller's empty library
 *   { kind: "draw-back", permanentId, returns }  — an activation that reads only its controller's library while that library holds
 *                                                  nothing but spells that come back by themselves (`returns`, their names)
 *   { kind: "recast", cardName, removes }        — a recast while the caster's own cast trigger is forced onto its own permanent
 */
export function loopStepOf(state, seat, action) {
  if (!action || !state?.players?.[seat]) return null;
  return memoizedFor(state, action, `step|${seat}`, () => readLoopStep(state, seat, action));
}

function readLoopStep(state, seat, action) {
  if (action.kind === "activate-ability") {
    if (isUntapSelfAction(action)) {
      const perm = ownPermanent(state, seat, action.permanentId);
      if (!perm) return null;
      const makes = manaMadeBy(state, seat, perm.id);
      if (!(makes > 0)) return null; // not a mana source: an untap of something else is not a mana loop
      const cost = costTotal(action);
      // An untap of its own already on the stack untaps it first: this one then untaps an untapped permanent.
      const untapPending = (state.stack || []).some((o) => o?.kind === "activated-ability" && o.controller === seat
        && o.payload?.params?.sourceId === perm.id && untapSelfAbility(o.payload.params));
      let net;
      if (perm.tapped) net = untapPending ? -cost : makes - cost;
      else {
        const plan = offeredPaymentPlan(state, seat, action);
        net = (plan?.taps || []).some((t) => t.permanentId === perm.id) ? makes - cost : -cost;
      }
      return { kind: "untap", permanentId: perm.id, net, colors: colorsMadeBy(state, seat, perm.id) };
    }
    const atoms = atomsOf(action);
    if (atoms?.length && atoms.every(actsOnOwnLibraryOnly)) {
      const library = state.players[seat].library || [];
      if (library.length === 0 && !emptyDrawIsTheWin(state, seat, atoms)) return { kind: "empty-library", permanentId: action.permanentId ?? null };
      if (library.length > 0 && libraryReturnsOnlyItself(state, seat)) {
        return { kind: "draw-back", permanentId: action.permanentId ?? null, returns: library.map((c) => c.name) };
      }
    }
    return null;
  }
  if (action.kind === "cast-spell") {
    const card = cardOfCast(state, seat, action);
    if (!card?.name || !castThisTurn(state, seat).has(card.name)) return null;
    const removes = castRemovesOwn(state, seat, card, action.fromZone || "hand");
    return removes ? { kind: "recast", cardName: card.name, removes } : null;
  }
  return null;
}

/** The colours a mana source adds when tapped — its own and its augments' (Kinnan's "of any type that permanent produced"), off
 *  `sources` read with it untapped. */
function producedColors(sources, permanentId) {
  const colors = new Set();
  for (const source of sources) {
    if (source.permanentId !== permanentId) continue;
    for (const c of source.colors || []) colors.add(c);
    for (const b of source.bonus || []) for (const c of b.colors || []) colors.add(c);
  }
  return [...colors].filter((c) => POOL_COLORS.includes(c)).sort();
}

// ── THE DRAW-BACK: a library of spells that come back by themselves ─────────────────────────────────────────────────────────────

/** A card's cast program — the parse the offer gives its cast (legalChoices: the cost-only keyword lines stripped first). Per card. */
const castPrograms = new WeakMap();
function castProgramOf(card) {
  if (!castPrograms.has(card)) castPrograms.set(card, parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card?.oracle ?? card?.oracle_text ?? "") }));
  return castPrograms.get(card);
}

const SELF_SHUFFLE_TEXT = /into its owner['’]s library/i;

/**
 * Does `card`, cast from among `library`'s cards, come back by itself and find nothing? Its resolution shuffles it into its owner's
 * library (the Sun's Zenith sentence — program.selfShuffle) and its every effect is a search of its controller's own library (a tutor,
 * library only) whose filter no card of `library` passes (cardMatchesTutorFilter; an X cap is not read — no card at any X).
 */
function comesBackFindingNothing(card, library, state, seat) {
  if (!SELF_SHUFFLE_TEXT.test(String(card?.oracle ?? card?.oracle_text ?? ""))) return false;
  const program = castProgramOf(card);
  if (!program?.selfShuffle || program.structure === "modal" || !program.atoms?.length) return false;
  return program.atoms.every((a) => a.op === "tutor" && a.targetType == null
    && (a.who == null || a.who === "you" || a.who === "controller")
    && (!Array.isArray(a.sourceZones) || a.sourceZones.every((z) => z === "library"))
    && !library.some((c) => cardMatchesTutorFilter(c, a.filter, state, seat)));
}

/** Does `seat`'s library hold cards, every one of them a spell that comes back by itself and finds nothing (Green Sun's Zenith alone)? */
function libraryReturnsOnlyItself(state, seat) {
  return memoized(state, `returns|${seat}`, () => {
    const library = state.players[seat]?.library || [];
    return library.length > 0 && library.every((card) => comesBackFindingNothing(card, library, state, seat));
  });
}

/** Could this effect atom have targeted a spell its caster controls (the cast spell itself — absent from the preview's stack)? */
const couldTargetOwnSpell = (atom) => /spell/i.test(String(atom?.targetType || "")) && atom.spellController !== "opponent";

/** Is this effect atom's subject the seat's own permanents — a scope it controls, the source itself, or (targeted) only its own? */
function ownSubject(state, seat, atom, targets) {
  if (atom.scope === "youControl" || atom.selfPermanent === true || atom.target === "self") return true;
  if (atom.targetType == null) return false;
  return targets.length > 0 && targets.every((t) => t.type !== "player" && t.type !== "spell" && findPermanent(state, t.id)?.controller === seat);
}

/**
 * What one previewed cast trigger (gameEngine.castTriggerOutcomes) yields the seat: { mana, pump } for one that only untaps or pumps
 * its own permanents and adds mana (or does nothing: removed with no target, or the flush's no-op), or null for one that does
 * anything else, reaches past the seat's own side, or cannot be read (no program of its own) — something it may use.
 */
function triggerYield(state, seat, outcome) {
  if (outcome.removed) return outcome.clauseAtoms.some(couldTargetOwnSpell) ? null : { mana: false, pump: false };
  if (outcome.noSafeTarget || outcome.forced) return { mana: false, pump: false }; // resolves as nothing / takes its own (no use)
  if (!outcome.programmed || !outcome.atoms.length) return null;
  const targets = outcome.targets || [];
  if (targets.some((t) => t.type === "player" ? t.id !== seat : t.type === "spell"
    ? (state.stack || []).find((o) => o.id === t.id)?.controller !== seat : findPermanent(state, t.id)?.controller !== seat)) return null;
  let mana = false, pump = false;
  for (const atom of outcome.atoms) {
    if (atom.op === "add-mana" && atom.targetType == null) { mana = true; continue; }
    if (atom.op === "untap" && ownSubject(state, seat, atom, targets)) { mana = true; continue; }
    if (atom.op === "pump" && (atom.duration == null || atom.duration === "endOfTurn") && ownSubject(state, seat, atom, targets)) {
      pump = true;
      if (atom.untap) mana = true;
      continue;
    }
    return null;
  }
  return { mana, pump };
}

/** The combat steps of a turn before its combat damage is dealt. */
const COMBAT_BEFORE_DAMAGE = new Set(["beginning-of-combat", "declare-attackers", "declare-blockers", "first-strike-damage"]);
/**
 * Does a pump of `seat`'s creatures until end of turn still have a use? "Enough" for a pump is lethal: on its own turn, before combat
 * damage, while the power that can reach an opponent this turn is short of the lowest life among them — the attacking creatures once
 * attackers are declared, else the creatures that could attack (untapped, not summoning sick or with haste, no defender). On another
 * player's turn, after its own combat damage, or past every opponent's life it has none: no picker of the AI builds blockers through
 * a loop (pickPumpAfterBlocks takes one pump after blocks), and a pump loop there has no enough to stop at.
 */
function pumpHasUse(state, seat) {
  if (state.activePlayer !== seat) return false;
  const inCombat = state.phase === "combat";
  if (state.phase !== "beginning" && state.phase !== "precombat-main" && !(inCombat && COMBAT_BEFORE_DAMAGE.has(state.step))) return false;
  const own = state.players[seat]?.battlefield || [];
  const declared = inCombat && state.combat?.declaredAttackerCount != null;
  const attackingIds = new Set((state.combat?.attackers || []).map((a) => a.permanentId));
  const reach = declared
    ? own.filter((p) => attackingIds.has(p.id))
    : own.filter((p) => permanentIsCreature(state, p.id) && !p.tapped && (!p.summoningSick || permanentHasKeyword(state, p.id, "Haste"))
      && !permanentHasKeyword(state, p.id, "Defender"));
  const power = reach.reduce((sum, p) => sum + Math.max(0, permanentPower(state, p.id) || 0), 0);
  const lives = Object.entries(state.players).filter(([id]) => id !== seat).map(([, p]) => p.life).filter(Number.isFinite);
  return lives.length > 0 && power < Math.min(...lives);
}

/**
 * What drawing back and recasting a spell of `seat`'s library (a draw-back step's card) yields, apart from the mana: { ownUse, mana }.
 * `ownUse` — the draw fires one of its own draw triggers (checkCardDrawnTriggers on a copy with the draw counted), one of the recast's
 * own cast triggers (castTriggerOutcomes — the flush's own routing and chooser) does anything but untap or pump its own permanents and
 * add mana (it takes an opponent's permanent, deals damage, cannot be read), or its pump has a use (pumpHasUse); `mana` — those
 * triggers make some. The spell itself finds nothing and comes back (libraryReturnsOnlyItself). Cast triggers of the other seats are
 * not read: on this seat's cast they give those seats something (Rhystic Study, Mystic Remora), never this one. No mana is read here
 * (the demand read asks this of every draw-back it meets). Once per state object.
 */
function recastYield(state, seat) {
  return memoized(state, `recast-yield|${seat}`, () => {
    const player = state.players[seat];
    const drawnBoard = { ...state, pendingTriggers: [], players: { ...state.players, [seat]: { ...player, cardsDrawnThisTurn: (player.cardsDrawnThisTurn || 0) + 1 } } };
    if ((checkCardDrawnTriggers(drawnBoard, seat, 1).pendingTriggers || []).some((t) => t.controller === seat)) return { ownUse: true, mana: false };
    let mana = false, pump = false;
    for (const card of player.library || []) {
      for (const outcome of castTriggerOutcomes(state, seat, card, { castFromZone: "hand" })) {
        const y = triggerYield(state, seat, outcome);
        if (!y) return { ownUse: true, mana };
        mana ||= y.mana;
        pump ||= y.pump;
      }
    }
    return { ownUse: pump && pumpHasUse(state, seat), mana };
  });
}

/** Would drawing back and recasting add nothing the seat can use? No use of its own (recastYield), and the mana its triggers make has
 *  none either: loopManaHasUse over every colour, a draw-back counted there only by a use of its own (`ownUseOnly` — a loop's mana
 *  is never its own use). */
function recastAddsNothing(state, seat) {
  const y = recastYield(state, seat);
  if (y.ownUse) return false;
  return !(y.mana && loopManaHasUse(state, seat, POOL_COLORS, { ownUseOnly: true }));
}

// ── THE DEMAND ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What an offered action is for the demand read: the same card or ability, at any X or target, is one thing. */
function demandKey(a) {
  if (a.kind === "cast-spell") return `cast|${a.fromZone || "hand"}|${a.cardId}`;
  if (a.kind === "activate-ability" || a.kind === "activate-loyalty") return `${a.kind}|${a.permanentId}|${a.abilityIndex ?? ""}`;
  return `${a.kind}|${a.cardId ?? ""}|${a.permanentId ?? ""}|${a.abilityIndex ?? ""}`;
}
const NOT_A_SPEND = new Set(["pass-priority", "tap-for-mana", "play-land", "pending-choice"]);

/**
 * A spend the demand read counts: a cast or an activation that is not itself a loop step — or a draw-back that is a play, the play
 * the mana feeds (an untap of a Monolith that pays for Thrasios while the Zenith's recast still takes an opponent's permanent, or
 * makes coloured mana something needs). `ownUseOnly` (the draw-back's own mana read) counts a draw-back only by a use of its own
 * (recastYield, no mana read), so no read asks itself.
 */
const isSpend = (state, seat, a, ownUseOnly = false) => {
  if (NOT_A_SPEND.has(a?.kind) || isUntapSelfAction(a)) return false;
  const step = loopStepOf(state, seat, a);
  if (step === null) return true;
  if (step.kind !== "draw-back") return false;
  return ownUseOnly ? recastYield(state, seat).ownUse : !recastAddsNothing(state, seat);
};

/** `state` with `seat`'s permanent `sourceId` tapped — the loop keeps its source for the next step. One copy per state object. */
const keptTapped = (state, seat, sourceId) => memoized(state, `kept|${seat}|${sourceId}`, () => {
  const player = state.players[seat];
  return { ...state, players: { ...state.players, [seat]: { ...player, battlefield: player.battlefield.map((p) => (p.id === sourceId ? { ...p, tapped: true } : p)) } } };
});

/**
 * Does `keep` with LOOP_MANA_PLENTY more of each of `colors` in `seat`'s pool offer a spend whose card or ability is not a spend in
 * `nowOffered` (the offer as it stands)? The cheap side first: an action of the richer offer is read as a step only when its card or
 * ability is not already a spend now (each now-key read once, on first ask). The same answer as collecting every spend of both offers.
 */
function richUnlocks(keep, seat, colors, nowOffered, ownUseOnly = false) {
  const kept = keep.players[seat];
  const pool = { ...(kept.manaPool || {}) };
  for (const c of colors) pool[c] = (pool[c] || 0) + LOOP_MANA_PLENTY;
  const rich = { ...keep, players: { ...keep.players, [seat]: { ...kept, manaPool: pool } } };
  const nowByKey = new Map();
  for (const b of nowOffered) {
    const k = demandKey(b);
    if (!nowByKey.has(k)) nowByKey.set(k, []);
    nowByKey.get(k).push(b);
  }
  const spendNow = new Map();
  const spentNow = (k) => {
    if (!nowByKey.has(k)) return false;
    if (!spendNow.has(k)) spendNow.set(k, nowByKey.get(k).some((b) => isSpend(keep, seat, b, ownUseOnly)));
    return spendNow.get(k);
  };
  return legalActionsForPlayer(rich, seat).some((a) => !spentNow(demandKey(a)) && isSpend(rich, seat, a, ownUseOnly));
}

const demandCache = new WeakMap();
/**
 * Does more of the loop's mana (`colors`) let `seat` do something it cannot do without spending the loop's own source? The loop
 * keeps its source (`sourceId`, the permanent it untaps) for the next step, so the read is taken with that source tapped: the
 * engine's offer so (`offered` — the list the seat was handed — serves when the source is already tapped) against the offer with
 * LOOP_MANA_PLENTY more of each of those colours in its pool. true when a cast or an activation appears that was not offered at
 * all; X sizes and targets of something already offered do not count. Cached per state object; with `offered` absent, the
 * richer offer's answer is shared by every source the read keeps as it stands (one per state object and colours). `ownUseOnly`
 * counts a draw-back as a spend only by a use of its own (isSpend).
 */
export function loopManaHasUse(state, seat, colors, { sourceId = null, offered = null, ownUseOnly = false } = {}) {
  if (!colors?.length) return false;
  const key = `${seat}|${sourceId ?? ""}|${colors.join("")}|${ownUseOnly ? "own" : "play"}`;
  let byKey = demandCache.get(state);
  if (!byKey) demandCache.set(state, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const player = state.players[seat];
  const source = sourceId == null ? null : player.battlefield.find((p) => p.id === sourceId);
  const keep = source && !source.tapped ? keptTapped(state, seat, sourceId) : state;
  const use = keep === state && offered
    ? richUnlocks(keep, seat, colors, offered, ownUseOnly)
    : memoized(keep, `unlocks|${seat}|${colors.join("")}|${ownUseOnly ? "own" : "play"}`, () => richUnlocks(keep, seat, colors, offerOf(keep, seat), ownUseOnly));
  byKey.set(key, use);
  return use;
}

/** Hold this offered action? (A loop step that nets nothing, adds nothing it can use, or loops a cast trigger that has nothing left to take.) */
export function isHeldLoopStep(state, seat, action, offered = null) {
  const step = loopStepOf(state, seat, action);
  if (!step) return false;
  if (step.kind === "draw-back") return recastAddsNothing(state, seat);
  if (step.kind !== "untap") return true;
  if (step.net <= 0) return true;
  return !loopManaHasUse(state, seat, step.colors, { sourceId: step.permanentId, offered });
}

/**
 * `actions` without the loop steps held now (the same array when none is held). `untapSteps: false` leaves the untap steps unread —
 * for a chooser none of whose pickers takes an "untap this" activation, where that read (two offers of the engine per decision)
 * could change no choice.
 */
export function withoutHeldLoopSteps(state, seat, actions, { offered = actions, untapSteps = true } = {}) {
  if (!Array.isArray(actions) || !actions.some((a) => a?.kind === "activate-ability" || a?.kind === "cast-spell")) return actions;
  const kept = actions.filter((a) => (!untapSteps && isUntapSelfAction(a)) || !isHeldLoopStep(state, seat, a, offered));
  return kept.length === actions.length ? actions : kept;
}

/** Could `seat` be offered a loop step right now? (A gate before any per-action read: an empty library, a cast this turn, a library
 *  of spells that come back by themselves, or an untap-this activation on its battlefield — the oracle's "untap" word first, then
 *  the parsed ability.) */
function loopStepsPossible(state, seat) {
  const player = state?.players?.[seat];
  if (!player) return false;
  if ((player.library || []).length === 0) return true;
  if (castThisTurn(state, seat).size > 0) return true;
  if (libraryReturnsOnlyItself(state, seat)) return true;
  const lossy = boardHasAbilityLoss(state);
  return (player.battlefield || []).some((p) => {
    const card = lossy ? withAbilityLoss(state, p) : p.card; // a permanent that lost its abilities has no untap activation (CR 613.1f)
    return /untap/i.test(String(card?.oracle || card?.oracle_text || "")) && parseActivatedAbilities(card).some(untapSelfAbility);
  });
}

/**
 * The tokenLoopLine seam ({ tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan }) with the loop steps held too — for a pilot that
 * reads the engine's "enough" through that seam (omnath-tools decide.mjs, LOOP RESTRAINT R1: an action is held when
 * `loop.holdLoop && isTokenLoopAction(loop, action)`). The token loop's own reads pass through unchanged; a seat where a loop step
 * could be offered gets `holdLoop: true`, and isTokenLoopAction answers per action: a held loop step, or the token loop's own ability
 * while the token loop holds. A seat with neither gets the token seam's own answer (null with no token loop).
 */
export function withLoopSteps(tokenLoop) {
  return {
    tokenLoopState(state, seat) {
      const token = typeof tokenLoop?.tokenLoopState === "function" ? tokenLoop.tokenLoopState(state, seat) : null;
      if (!loopStepsPossible(state, seat)) return token;
      const base = token || { sources: new Map(), finishNow: false, holdLoop: false, outlet: null };
      return { ...base, holdLoop: true, tokenHold: !!token?.holdLoop, loopSteps: { state, seat } };
    },
    isTokenLoopAction(loop, action) {
      if (loop?.loopSteps) {
        if (isHeldLoopStep(loop.loopSteps.state, loop.loopSteps.seat, action)) return true;
        return !!loop.tokenHold && typeof tokenLoop?.isTokenLoopAction === "function" && tokenLoop.isTokenLoopAction(loop, action);
      }
      return typeof tokenLoop?.isTokenLoopAction === "function" && tokenLoop.isTokenLoopAction(loop, action);
    },
    tokenLoopAttackPlan(state, seat, attackerActions) {
      return typeof tokenLoop?.tokenLoopAttackPlan === "function" ? tokenLoop.tokenLoopAttackPlan(state, seat, attackerActions) : null;
    },
  };
}
