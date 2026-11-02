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
 *
 * EVERYTHING HERE IS RESTRAINT over actions the engine offered: every action stays legal and offered (a person can take the loop as
 * many times as they choose — CR 732.1b, 732.2a), and nothing is ever added. A seat with none of these steps on offer plays exactly
 * as before. Pure reads of game state (the demand read is cached per state object; nothing is written).
 *
 * Consumers: opponentAI.pickAction (both of its action lists, before every picker — the recast and empty-library steps; none of its
 * pickers takes an "untap this" activation, so it leaves that read, the costly one, unread). withLoopSteps wraps the tokenLoopLine
 * seam ({ tokenLoopState, isTokenLoopAction, tokenLoopAttackPlan }) so a pilot that reads that seam holds every step.
 */
import { legalActionsForPlayer, offeredPaymentPlan } from "./legalChoices.js";
import { castTriggerRemovesOwn } from "./gameEngine.js";
import { manaValueOf } from "./manaUntapLine.js";
import { manaSources } from "./manaModel.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { playerCantWinGame, playerEmptyDrawWins, withAbilityLoss, boardHasAbilityLoss } from "./layers.js"; // + the ability view (CR 613.1f)

/** How much more of each colour a building step makes the demand read pretends the seat holds: above every fixed cost printed. */
export const LOOP_MANA_PLENTY = 20;

const POOL_COLORS = ["W", "U", "B", "R", "G", "C"];

/** The ops that act on their controller's own library (and on nothing else) when they carry no target and no other player. */
const OWN_LIBRARY_OPS = new Set(["draw", "scry", "surveil", "reveal-top-conditional", "impulse-dig"]);
const actsOnOwnLibraryOnly = (atom) => OWN_LIBRARY_OPS.has(atom?.op) && atom.targetType == null
  && (atom.who == null || atom.who === "you" || atom.who === "controller");

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

/**
 * The loop step this offered action is, or null:
 *   { kind: "untap", permanentId, net, colors }  — "untap this permanent" on a mana source; net = the mana it adds over the step
 *   { kind: "empty-library", permanentId }       — an activation that reads only its controller's empty library
 *   { kind: "recast", cardName, removes }        — a recast while the caster's own cast trigger is forced onto its own permanent
 */
export function loopStepOf(state, seat, action) {
  if (!action || !state?.players?.[seat]) return null;
  if (action.kind === "activate-ability") {
    if (isUntapSelfAction(action)) {
      const perm = ownPermanent(state, seat, action.permanentId);
      if (!perm) return null;
      const makes = manaValueOf(state, seat, perm.id);
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
      return { kind: "untap", permanentId: perm.id, net, colors: producedColors(state, seat, perm.id) };
    }
    const atoms = atomsOf(action);
    if (atoms?.length && atoms.every(actsOnOwnLibraryOnly) && (state.players[seat].library || []).length === 0
      && !emptyDrawIsTheWin(state, seat, atoms)) {
      return { kind: "empty-library", permanentId: action.permanentId ?? null };
    }
    return null;
  }
  if (action.kind === "cast-spell") {
    const card = cardOfCast(state, seat, action);
    if (!card?.name || !castThisTurn(state, seat).has(card.name)) return null;
    const removes = castTriggerRemovesOwn(state, seat, card, { castFromZone: action.fromZone || "hand" });
    return removes ? { kind: "recast", cardName: card.name, removes } : null;
  }
  return null;
}

/** The colours a mana source adds when tapped — its own and its augments' (Kinnan's "of any type that permanent produced"). */
function producedColors(state, seat, permanentId) {
  const player = state.players[seat];
  const perm = player.battlefield.find((p) => p.id === permanentId);
  const asUntapped = perm?.tapped
    ? { ...state, players: { ...state.players, [seat]: { ...player, battlefield: player.battlefield.map((p) => (p.id === permanentId ? { ...p, tapped: false } : p)) } } }
    : state;
  const colors = new Set();
  for (const source of manaSources(asUntapped, seat)) {
    if (source.permanentId !== permanentId) continue;
    for (const c of source.colors || []) colors.add(c);
    for (const b of source.bonus || []) for (const c of b.colors || []) colors.add(c);
  }
  return [...colors].filter((c) => POOL_COLORS.includes(c)).sort();
}

/** What an offered action is for the demand read: the same card or ability, at any X or target, is one thing. */
function demandKey(a) {
  if (a.kind === "cast-spell") return `cast|${a.fromZone || "hand"}|${a.cardId}`;
  if (a.kind === "activate-ability" || a.kind === "activate-loyalty") return `${a.kind}|${a.permanentId}|${a.abilityIndex ?? ""}`;
  return `${a.kind}|${a.cardId ?? ""}|${a.permanentId ?? ""}|${a.abilityIndex ?? ""}`;
}
const NOT_A_SPEND = new Set(["pass-priority", "tap-for-mana", "play-land", "pending-choice"]);

/** A spend the demand read counts: a cast or an activation that is not itself a loop step. */
const isSpend = (state, seat, a) => !NOT_A_SPEND.has(a?.kind) && !isUntapSelfAction(a) && loopStepOf(state, seat, a) === null;

const demandCache = new WeakMap();
/**
 * Does more of the loop's mana (`colors`) let `seat` do something it cannot do without spending the loop's own source? The loop
 * keeps its source (`sourceId`, the permanent it untaps) for the next step, so the read is taken with that source tapped: the
 * engine's offer so (`offered` — the list the seat was handed — serves when the source is already tapped) against the offer with
 * LOOP_MANA_PLENTY more of each of those colours in its pool. true when a cast or an activation appears that was not offered at
 * all; X sizes and targets of something already offered do not count. Cached per state object.
 */
export function loopManaHasUse(state, seat, colors, { sourceId = null, offered = null } = {}) {
  if (!colors?.length) return false;
  const key = `${seat}|${sourceId ?? ""}|${colors.join("")}`;
  let byKey = demandCache.get(state);
  if (!byKey) demandCache.set(state, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const player = state.players[seat];
  const source = sourceId == null ? null : player.battlefield.find((p) => p.id === sourceId);
  const keep = source && !source.tapped
    ? { ...state, players: { ...state.players, [seat]: { ...player, battlefield: player.battlefield.map((p) => (p.id === sourceId ? { ...p, tapped: true } : p)) } } }
    : state;
  const kept = keep.players[seat];
  const nowOffered = keep === state && offered ? offered : legalActionsForPlayer(keep, seat);
  const now = new Set(nowOffered.filter((a) => isSpend(keep, seat, a)).map(demandKey));
  const pool = { ...(kept.manaPool || {}) };
  for (const c of colors) pool[c] = (pool[c] || 0) + LOOP_MANA_PLENTY;
  const rich = { ...keep, players: { ...keep.players, [seat]: { ...kept, manaPool: pool } } };
  const use = legalActionsForPlayer(rich, seat).some((a) => isSpend(rich, seat, a) && !now.has(demandKey(a)));
  byKey.set(key, use);
  return use;
}

/** Hold this offered action? (A loop step that nets nothing, adds nothing it can use, or loops a cast trigger that has nothing left to take.) */
export function isHeldLoopStep(state, seat, action, offered = null) {
  const step = loopStepOf(state, seat, action);
  if (!step) return false;
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

/** Could `seat` be offered a loop step right now? (A gate before any per-action read: an empty library, a cast this turn, or an
 *  untap-this activation on its battlefield — the oracle's "untap" word first, then the parsed ability.) */
function loopStepsPossible(state, seat) {
  const player = state?.players?.[seat];
  if (!player) return false;
  if ((player.library || []).length === 0) return true;
  if (castThisTurn(state, seat).size > 0) return true;
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
