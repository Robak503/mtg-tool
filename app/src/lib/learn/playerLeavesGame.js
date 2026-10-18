/**
 * playerLeavesGame.js — a player leaves a multiplayer game (CR 800.4). In a Commander pod every eliminated player leaves
 * (CR 104.5), so this runs in most games.
 *
 * CR 800.4a, in its own order:
 *   ① "all objects … owned by that player leave the game and any effects which give that player control of any objects or
 *      players end" — both at once. The control effects are ended first here, while the leaver is still seated, so nothing is
 *      handed back to them by the objects that leave next (controlMove.releaseControlOnLeave): a creature they stole with
 *      Control Magic or Act of Treason, or took for good with Sliver Overlord, goes to the player beneath — the latest
 *      remaining control effect's controller, else the player it returns to, else its default controller (CR 110.2). Then
 *      every object they own leaves: each permanent on ANY battlefield (one they own that another player had stolen
 *      included — gameState.removePermanentFromGame, the battlefield exit without a landing: its attachments fall off,
 *      a control Aura of theirs releases its host, leaves-the-battlefield abilities trigger, CR 603.6c — a Banishing Light of
 *      theirs returns the card it held, a one-shot effect of its "until" duration, CR 610.3, while an Oblivion Ring's return
 *      is a triggered ability of theirs and never happens, CR 800.4d), each spell they
 *      own on the stack (one another player is casting included), and everything in their own zones (cards live in their
 *      owner's zones — another player's card held in exile carries a permission stamp, never a move — so their zones go
 *      with their record).
 *   ② "if that player controlled any objects on the stack not represented by cards, those objects cease to exist": their
 *      abilities and their copies of spells (CR 707.10). A trigger of theirs still waiting for the stack, and a delayed
 *      trigger of theirs, would never be put on it (CR 800.4d) — they are dropped here, and flushTriggers drops any trigger
 *      a departed player would control that is made later (a leaves trigger of their own permanent).
 *   ③ "if there are any objects still controlled by that player, those objects are exiled": the permanents left on their
 *      battlefield — the ones they control by default (a creature they reanimated from another player's graveyard) — go to
 *      their owners' exile through the ordinary zone move (a token ceases to exist; a commander may go to the command zone,
 *      CR 903.9a), and a spell they are casting that another player owns goes to its owner's exile.
 * Phased-out permanents (CR 702.26k, 702.26n): one the leaver owns leaves with them from every player's phased-out list,
 * and one they control that another player owns is exiled.
 * Then the seat itself goes: the player record, the turn-order slot, the combat they were in (an attack on them is removed
 * from combat — CR 800.4e assigns it no damage; this keeps no defenderless attackers), the commander damage their commanders
 * dealt, the Auras enchanting them (CR 303.4c), the monarch designation (CR 725.4 — the active player, else the next player
 * in turn order) and priority (CR 800.4a — the next player in turn order).
 *
 * ⛔ What does NOT end: continuous effects the leaver's spells and abilities created on other players' objects (CR 800.4a
 * ends only the effects that give them control). A pending resolution-time choice of theirs (state.pendingChoice and its
 * siblings) is not re-assigned (CR 800.4g) — not modelled.
 */
import { moveCardToZone, removePermanentFromGame, findPermanent } from "./gameState.js";
import { releaseControlOnLeave, controllerOfPermanent } from "./controlMove.js";
import { finishCleanupActions, runStepActions } from "./gameEngine.js";
import { becomeMonarch } from "./effects/atoms/monarch.js";
import { isLandCard } from "./effects/atoms/shared.js";

/** A battlefield permanent's owner: its `owner` stamp, else the player whose battlefield holds it (the sparse convention —
 *  controlMove.js header). */
const ownerOf = (perm, holder) => perm.owner ?? holder;
/** A spell on the stack that a card represents — not a copy (CR 707.10) and not an ability. */
const isCardSpell = (obj) => obj?.kind === "spell" && !obj.isCopy && !obj.source?.isCopy && !obj.source?.token;
/** The card a spell puts into a zone: the whole card, not the face cast (the same read as stack.counterSpellById). */
const spellCard = (obj) => obj.payload?.params?.adventureExile?.card || obj.payload?.params?.spellToGraveyard?.card || obj.payload?.params?.printedCard || obj.source;
/** The objects leave simultaneously; an Aura or Equipment is taken off before what it is attached to, so it leaves with the
 *  rest instead of falling into a graveyard when its host goes first. */
const attachmentsFirst = (list) => [...list.filter((x) => x.attachedTo), ...list.filter((x) => !x.attachedTo)];
const nameOf = (perm) => perm?.card?.name || null;
/** The next player after `from` in `order` who is still in the game (CR 800.4a, 725.4). */
function nextSeatedAfter(order, from, players) {
  const idx = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(idx + k) % order.length];
    if (cand !== from && players[cand]) return cand;
  }
  return null;
}

/** Every commander the leaver owns, wherever it is (their zones, any battlefield, the stack) — the keys of the commander damage
 *  their commanders dealt (CR 903.10a — tracked per commander). */
function commanderIdsOwnedBy(state, playerId) {
  const ids = new Set();
  const add = (card) => { if (card?.isCommander) ids.add(card.commanderInstanceId || card.id); };
  const gone = state.players[playerId];
  for (const zone of ["command", "graveyard", "exile", "hand", "library"]) for (const card of gone?.[zone] || []) add(card);
  for (const [pid, p] of Object.entries(state.players)) for (const perm of p.battlefield || []) if (ownerOf(perm, pid) === playerId) add(perm.card);
  for (const obj of state.stack || []) if (isCardSpell(obj) && (obj.owner ?? obj.controller) === playerId) add(obj.source);
  return ids;
}

/** The leaver's terminal vitals, read before anything moves (EPOCH-2 instrumentation: finishRank, eliminatedAtTurn and the
 *  win-condition taxonomy read them off the event). */
function vitalsOf(gone) {
  return {
    life: gone.life ?? null,
    poison: gone.poison ?? null,
    // The honest CR 120.3 stamp first (set at the drawCards chokepoint); the died-while-empty heuristic stays as the fallback
    // for deaths where the empty library was the real story.
    decked: !!gone.triedToDrawFromEmpty || (gone.library || []).length === 0,
    commanderLethal: Object.values(gone.commanderDamageFrom || {}).some((n) => n >= 21),
    // Source of the lethal blow (loseLife stamped it on the killing damage): true = combat, false = non-combat (burn/ability),
    // null = a non-damage finish (drain/pay-life) → the "damage" win-con stays generic (epochStats; CREED — never guessed).
    lethalByCombat: gone.lethalDamageCombat ?? null,
    // Lands stranded in hand at death — a "true flood" signal.
    landsInHand: (gone.hand || []).filter(isLandCard).length,
  };
}

/** Phased-out permanents (CR 702.26k / 702.26n): the leaver's own leave every list, a rider included, with no zone-change
 *  trigger; one on the leaver's own list that another player owns goes to its owner's exile (a token ceases to exist). */
function phasedOutLeave(state, playerId, record) {
  let players = state.players;
  for (const pid of Object.keys(state.players)) {
    const list = state.players[pid].phasedOut || [];
    if (!list.length) continue;
    let touched = false;
    const kept = [];
    for (const perm of list) {
      const owner = ownerOf(perm, pid);
      if (owner === playerId) {
        record.leftTheGame.push(nameOf(perm));
        touched = true;
        continue;
      }
      if (pid === playerId) {
        const card = perm.printedCard || perm.card;
        if (players[owner] && card && !card.token) players = { ...players, [owner]: { ...players[owner], exile: [...(players[owner].exile || []), card] } };
        record.exiled.push(nameOf(perm));
        record.crossed += 1;
        touched = true;
        continue;
      }
      // A rider (an Aura or Equipment that phased out with it, CR 702.26g) the leaver owns or controls leaves with them.
      const riders = perm.phasedWith || [];
      const goneIds = new Set(riders.filter((r) => r.controller === playerId || ownerOf(r.permanent, r.controller) === playerId).map((r) => r.permanent.id));
      if (goneIds.size) {
        touched = true;
        kept.push({ ...perm, phasedWith: riders.filter((r) => !goneIds.has(r.permanent.id)), attachments: (perm.attachments || []).filter((a) => !goneIds.has(a)) });
      } else kept.push(perm);
    }
    if (touched && pid !== playerId) players = { ...players, [pid]: { ...players[pid], phasedOut: kept } };
  }
  return players === state.players ? state : { ...state, players };
}

/**
 * Remove `playerId` from the game (CR 800.4a — see the header). Two cases for the turn:
 *   - a bystander leaves → the current turn goes on; priority passes on if they held it;
 *   - the ACTIVE player leaves → their turn ends now and the next surviving seat's turn starts from untap (CR 800.4j says the
 *     turn continues without an active player — a documented, bounded simplification: finishCleanupActions runs the
 *     truncated turn's end-of-turn housekeeping so nothing "until end of turn" leaks into the next turn).
 */
export function removePlayerFromGame(state, playerId) {
  const gone = state.players?.[playerId];
  if (!gone) return state;
  const oldOrder = state.turnOrder || Object.keys(state.players);
  const goneCommanderIds = commanderIdsOwnedBy(state, playerId);
  const goneVitals = vitalsOf(gone);
  const record = { leftTheGame: [], controlReleased: [], exiled: [], ceased: 0, crossed: 0 };

  let s = state;
  // ① (a) The control effects giving the leaver control end — before anything leaves, while they are still seated.
  const seen = [];
  for (const [pid, p] of Object.entries(s.players)) for (const perm of p.battlefield || []) if (ownerOf(perm, pid) !== playerId) seen.push({ pid, id: perm.id, name: nameOf(perm) });
  for (const { pid, id, name } of seen) {
    const next = releaseControlOnLeave(s, id, playerId);
    if (next === s) continue;
    s = next;
    const now = controllerOfPermanent(s, id);
    if (now && now !== pid) { record.controlReleased.push({ name, from: pid, to: now }); record.crossed += 1; }
  }
  // ① (b) Every permanent the leaver owns leaves the game, wherever it is.
  const owned = [];
  for (const [pid, p] of Object.entries(s.players)) for (const perm of p.battlefield || []) if (ownerOf(perm, pid) === playerId) owned.push({ ...perm, holder: pid });
  for (const perm of attachmentsFirst(owned)) {
    const lk = findPermanent(s, perm.id);
    if (!lk) continue;
    if (lk.controller !== playerId) record.crossed += 1; // another player had it
    s = removePermanentFromGame(s, { playerId: lk.controller, cardId: perm.id });
    record.leftTheGame.push(nameOf(perm));
  }
  // ① (c) / ② / ③ The stack: a spell the leaver owns leaves (whoever is casting it); an ability or a spell copy they control
  // ceases to exist; a spell they are casting that another player owns goes to its owner's exile.
  const toExile = [];
  const stack = [];
  for (const obj of s.stack || []) {
    if (isCardSpell(obj)) {
      const owner = obj.owner ?? obj.controller;
      if (owner === playerId) {
        record.leftTheGame.push(obj.source?.name || null);
        if (obj.controller !== playerId) record.crossed += 1; // another player was casting it
        continue;
      }
      if (obj.controller === playerId) {
        toExile.push({ card: spellCard(obj), owner });
        record.crossed += 1;
        continue;
      }
    } else if (obj.controller === playerId) {
      record.ceased += 1;
      continue;
    }
    stack.push(obj);
  }
  if (stack.length !== (s.stack || []).length) s = { ...s, stack };
  // ② A trigger of theirs waiting for the stack, or a delayed trigger of theirs, is never put on it (CR 800.4d).
  if ((s.pendingTriggers || []).some((t) => t.controller === playerId)) {
    const pendingTriggers = s.pendingTriggers.filter((t) => t.controller !== playerId);
    record.ceased += s.pendingTriggers.length - pendingTriggers.length;
    s = { ...s, pendingTriggers };
  }
  if ((s.delayedTriggers || []).some((d) => d.controller === playerId)) s = { ...s, delayedTriggers: s.delayedTriggers.filter((d) => d.controller !== playerId) };
  // ③ What the leaver still controls is exiled — to each owner's exile.
  for (const perm of attachmentsFirst(s.players[playerId].battlefield || [])) {
    if (controllerOfPermanent(s, perm.id) !== playerId) continue; // an attachment already taken off with its host
    s = moveCardToZone(s, { playerId, fromZone: "battlefield", toZone: "exile", cardId: perm.id });
    record.exiled.push(nameOf(perm));
    record.crossed += 1;
  }
  for (const { card, owner } of toExile) {
    if (!card || !s.players[owner]) continue;
    s = { ...s, players: { ...s.players, [owner]: { ...s.players[owner], exile: [...(s.players[owner].exile || []), card] } } };
    record.exiled.push(card.name || null);
  }
  s = phasedOutLeave(s, playerId, record);

  // The seat goes.
  const { [playerId]: _left, ...players } = s.players;
  const turnOrder = oldOrder.filter((id) => id !== playerId);
  for (const id of turnOrder) {
    const dmg = players[id]?.commanderDamageFrom;
    if (dmg && Object.keys(dmg).some((k) => goneCommanderIds.has(k))) {
      players[id] = { ...players[id], commanderDamageFrom: Object.fromEntries(Object.entries(dmg).filter(([k]) => !goneCommanderIds.has(k))) };
    }
  }
  let combat = s.combat;
  if (combat) {
    combat = {
      ...combat,
      attackers: (combat.attackers || []).filter((a) => a.attackingPlayer !== playerId && a.defender !== playerId),
      blockers: (combat.blockers || []).filter((b) => b.blockingPlayer !== playerId),
    };
  }
  let log = [...s.log, { turn: state.turn, kind: "player-eliminated", player: playerId, ...goneVitals }];
  // What crossed between players as they left (a stolen permanent going home, one of theirs another player held, one they
  // held exiled) — logged only when something did, so a plain elimination's log reads as before.
  if (record.crossed > 0 || record.exiled.length > 0) {
    log = [...log, { turn: state.turn, kind: "left-game-objects", player: playerId, leftTheGame: record.leftTheGame, controlReleased: record.controlReleased, exiled: record.exiled, ceased: record.ceased }];
  }
  let base = { ...s, players, turnOrder, combat, log };
  // PLAYER-AURA sweep (CR 303.4c — "the player it was attached to has left the game"): an Aura enchanting the departed
  // player is put into its owner's graveyard, through moveCardToZone so the leave and graveyard events record normally.
  for (const pid of Object.keys(base.players)) {
    for (const perm of [...(base.players[pid]?.battlefield || [])]) {
      if (perm.enchantedPlayerId === playerId) {
        base = moveCardToZone(base, { playerId: pid, fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
      }
    }
  }
  // THE MONARCH (CR 725.4): the active player becomes the monarch as the monarch leaves — the next player in turn order
  // when the active player is the one leaving.
  if (base.monarchId === playerId) {
    const heir = state.activePlayer !== playerId && base.players[state.activePlayer] ? state.activePlayer : nextSeatedAfter(oldOrder, playerId, base.players);
    if (heir) base = becomeMonarch(base, heir);
  }

  if (state.activePlayer === playerId) {
    // The ACTIVE player left: their turn ends now and the next surviving seat's turn starts from untap (see the doc comment —
    // CR 800.4j's turn-without-an-active-player is not modelled). The truncated turn's end-of-turn housekeeping runs first
    // (damage wears off, "until end of turn" effects end, the SBA fixpoint); its hand-size discard belonged to the leaver.
    // Surviving seats lose the truncated turn's remaining priority windows and end-step triggers — parked.
    const nextActive = nextSeatedAfter(oldOrder, playerId, base.players) || turnOrder[0] || null;
    return runStepActions({
      ...finishCleanupActions(base),
      activePlayer: nextActive,
      turn: state.turn + 1,
      phase: "beginning",
      step: "untap",
      priorityHolder: null,
      consecutivePasses: 0,
    });
  }

  // A bystander left — the turn goes on. Priority they held passes to the next player in turn order still in the game
  // (CR 800.4a); the pass count restarts.
  let priorityHolder = state.priorityHolder;
  if (priorityHolder === playerId) priorityHolder = nextSeatedAfter(oldOrder, playerId, base.players);
  else if (priorityHolder && !base.players[priorityHolder]) priorityHolder = base.players[state.activePlayer] ? state.activePlayer : turnOrder[0] || null;
  return { ...base, priorityHolder, consecutivePasses: 0 };
}
