/**
 * effects/atoms/iteratedEdict.js — the X-iterated multi-mode edict atom (Torment of Hailfire).
 *
 * MODELS (CR 118.9 / 701.16 / 701.8): "Repeat the following process X times. Each opponent loses 3 life
 * unless that player sacrifices a nonland permanent of their choice or discards a card."
 *
 * SHAPE — an {X}-cost sorcery whose body is an X-times-repeated, per-opponent, THREE-mode edict. Each
 * time the process runs, EVERY opponent (APNAP / turn order, deterministic) faces a choice they make
 * themselves (CR 118.9's "unless" is the affected player's decision, exactly like a Diabolic Edict's
 * sacrificer or a Mind Rot victim chooses):
 *   - "life"     → lose 3 life                (always available — CR 119.4, life can go below 0)
 *   - "sacrifice"→ sacrifice a nonland permanent of their choice (available iff they control one)
 *   - "discard"  → discard a card             (available iff they have a card in hand)
 *
 * RESOLUTION MODEL — a pausing CHAIN, mirroring advanceSacrificeChain / advanceDiscardChain. The queue is
 * X rounds × the opponents in APNAP order (CR 101.4), flattened head-first, each head marked with its round.
 * For each queue head:
 *   - opponent left the game (CR 800.4a) → drop, move on.
 *   - ONLY "life" is legal (no nonland permanent AND empty hand) → FORCED: "life" is locked in, move on (no
 *     real choice → no pause).
 *   - ≥2 legal modes → a REAL choice: pause via setPendingEdictModeChoice for THAT opponent (the driver
 *     surfaces a picker for a human, auto-picks for an AI via autoPickEdictMode), carrying the queue and the
 *     round's locked-in answers so resolveEdictModeChoice can lock this one in, drop the settled head + re-enter.
 * CHOOSE, THEN ACT TOGETHER, ONE ROUND AT A TIME (2026-10-17, CR 101.4): nothing is carried out while a choice
 * of the round remains; when the round's last opponent has chosen, settleEdictRound carries every answer out —
 * the discarded cards move, the round's sacrifices go as ONE event (removal.sacrificeChosen; CR 603.2c, 603.10a),
 * then the discard watchers and the life losses. The bundled rulings say it for Torment: "each opponent in
 * turn order makes their choice once, then all of the actions occur simultaneously, then they repeat this
 * process", and "Each repetition
 * through this process is done separately" — each round is the next instruction, followed in order (CR
 * 608.2c), so a round's permanents are gone before the next round's first choice. Before, each answer was
 * carried out as it was chosen: two opponents sacrificing creatures fired a "one or more creatures die"
 * watcher twice a round.
 * When the queue empties with no pause, returns the advanced state (the caster's program resumes — Torment
 * has no rider, but the seam is uniform with the other edict chains). CREED: NEVER a partial iteration —
 * the whole X × opponents queue drains, or (a `low`-confidence program never reaches this atom) the card
 * routes to the Arbiter. X=0 (cast for free / X chosen 0) is a clean no-op (an empty queue).
 *
 * Hidden-info safe: the chooser IS the affected opponent; their board (sac pool) and hand SIZE are public,
 * and the discard's specific card is chosen by them at resolution via the SAME discard chain (CR 701.8),
 * so the caster never sees or cherry-picks an opponent's hand.
 */

import { logEvent, opponentsOf, moveCardToZone } from "../../gameState.js";
import { applyDrawEffect } from "../../spellEffects.js"; // P·20 — the single draw path (draw watchers fire), as the draw atom uses
import { permanentTypes } from "../../layers.js"; // P·20 — "shares a card type with it" reads each candidate's live card types
import { checkDiscardTriggers } from "../../triggers.js"; // TRIG-DISCARD (CR 701.9a) — an edict discard is a discard
import { setPendingEdictModeChoice } from "../../pendingChoice.js";
import { apnapOrder, sacrificeChosen } from "./removal.js"; // 2026-10-17: the opponents' choice order (CR 101.4) and one round's sacrifices as one event
import { isLandCard, sacrificesByIn } from "./shared.js"; // + sacrificesByIn (2026-10-17): the controller's sacrifice, single or in a batch
import { loseLife } from "../../gameState.js";

/** The nonland permanents an opponent controls, as `{ id, name }` (public — on the battlefield). */
export function nonlandSacPool(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return [];
  return (player.battlefield || [])
    .filter((p) => !isLandCard(p.card))
    .map((p) => ({ id: p.id, name: p.card?.name }));
}

/** The cards an opponent could discard (their non-token hand cards) as `{ id, name }` (count is public). */
export function discardPool(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return [];
  return (player.hand || []).filter((c) => !c.token).map((c) => ({ id: c.id, name: c.name }));
}

/**
 * The legal modes an opponent has for ONE edict decision, in a stable order: always "life", plus
 * "sacrifice" when they control a nonland permanent, plus "discard" when they hold a card. Returned with
 * the candidate pools so the picker / auto-pick / settler all read the SAME legality (never a fabricated
 * or illegal option). "life" is always present (CR 119.4 — you can always lose life, even below 0).
 */
export function edictLegalModes(state, playerId, spec = null) {
  // P·20 (Braids, Arisen Nightmare): a SPEC narrows the chain — `sacTypes` makes the sacrifice pool "a permanent that shares a
  // card type with it" (any of the listed card types, read live), and `allowDiscard: false` drops the discard mode. No spec →
  // Torment of Hailfire's nonland pool and discard mode, byte-identical.
  const sac = spec?.sacTypes ? sharesTypeSacPool(state, playerId, spec.sacTypes) : nonlandSacPool(state, playerId);
  const disc = spec?.allowDiscard === false ? [] : discardPool(state, playerId);
  const modes = ["life"];
  if (sac.length) modes.push("sacrifice");
  if (disc.length) modes.push("discard");
  return { modes, sac, disc };
}

/** Amount of life the edict drains on the "life" branch. Torment is a fixed 3 (CR-printed); a spec may print another. */
export const EDICT_LIFE_LOSS = 3;

/** P·20 — the permanents `playerId` controls sharing at least one card type with `types` (layer-aware), as `{ id, name }`. */
export function sharesTypeSacPool(state, playerId, types) {
  const want = new Set(types || []);
  return (state.players?.[playerId]?.battlefield || [])
    .filter((p) => permanentTypes(state, p.id).types.some((ty) => want.has(ty)))
    .map((p) => ({ id: p.id, name: p.card?.name }));
}

/**
 * Resolve the "life" branch inline (the opponent chose — or was forced — to lose life). Non-targeted loss
 * for the affected opponent; loseLife lets the total go below 0 (CR 118.2) with the SBA firing on the next
 * driver tick, identical to every other life-loss path. Logged for decision-log parity.
 */
export function edictLoseLife(state, playerId, spec = null) {
  if (!state.players?.[playerId]) return state;
  const amount = spec?.lifeLoss ?? EDICT_LIFE_LOSS;
  let next = loseLife(state, { playerId, amount });
  next = logEvent(next, { kind: "spell-effect", effect: "iterated-edict-life", controller: playerId, amount });
  // P·20 (Braids): "…that player loses 2 life AND YOU DRAW A CARD" — the spec's beneficiary draws on every life branch.
  if (spec?.drawFor && next.players?.[spec.drawFor]) next = applyDrawEffect(next, { controller: spec.drawFor, amount: spec.drawCount });
  return next;
}

/**
 * Do two answers belong to ONE round (one instruction)? Both carry the same `round`. An answer with no round — a pause the chain
 * saved before rounds were marked (2026-10-17) — is its own instruction, so such a chain carries each answer out before the next
 * choice, as it did then.
 */
const sameRound = (a, b) => a.round !== undefined && a.round === b.round;

/**
 * Walk the iterated-edict CHAIN. `queue` is the remaining per-opponent decisions, head-first, each `{ playerId, round }` (one
 * decision apiece); `chosen` is the current round's answers already locked in and not yet carried out,
 * `[{ playerId, mode, permId?, cardId?, round }]`. For each head:
 *   - a new round begins → the previous round's answers are carried out first (settleEdictRound);
 *   - an eliminated opponent is dropped (CR 800.4a);
 *   - an opponent with ONLY the "life" mode has "life" locked in (forced — no real choice, no pause);
 *   - an opponent with ≥2 legal modes pauses via setPendingEdictModeChoice, carrying the rest of the queue and `chosen`.
 * Nothing is carried out while a choice of the round remains (CR 101.4 — "Then the actions happen simultaneously"); the queue's
 * end carries out the last round. Shared by applyIteratedEdict / applyEdictSharesType (the atoms' first entry) and
 * runProgram.resolveEdictModeChoice (each later decision), so ONE implementation drives both the inline and interactive paths.
 */
export function advanceEdictChain(state, { queue, sourceName = null, spec = null, chosen = [] }) {
  let next = state;
  let q = queue || [];
  let picked = chosen;
  while (q.length) {
    const head = q[0];
    // The previous round's choices are done (a new round begins): its answers are carried out now, before this round's first choice.
    if (picked.length && !sameRound(picked[picked.length - 1], head)) {
      next = settleEdictRound(next, picked, spec);
      picked = [];
    }
    if (!next.players?.[head.playerId]) { q = q.slice(1); continue; } // opponent left the game (CR 800.4a)
    const { modes, sac, disc } = edictLegalModes(next, head.playerId, spec);
    if (modes.length === 1) {
      // Only "life" is legal (no permanent in the pool, no discard) — forced, no decision, no pause; carried out with the round.
      picked = [...picked, { playerId: head.playerId, mode: "life", round: head.round }];
      q = q.slice(1);
      continue;
    }
    // A real choice (≥2 modes): pause for THIS opponent's mode pick, carrying the rest of the queue, the round's answers and the spec.
    return setPendingEdictModeChoice(next, { controller: head.playerId, modes, sac, disc, queue: q, sourceName, spec, chosen: picked });
  }
  return settleEdictRound(next, picked, spec);
}

/**
 * ===== ITERATED-EDICT ===== atom entry. Builds the decision queue = X rounds × the opponents in APNAP order (CR 101.4 — the
 * active player's turn order, whoever controls the spell; `opponentsOf` alone is seat order from the first seat), flattened
 * head-first, each head marked with its round, then advances the chain. X comes from ctx.xValue (bound at cast for the {X}
 * spell); a missing / zero X is a clean no-op (empty queue → no loss, no pause). Each opponent appears once PER round, so with X
 * rounds and K opponents the queue has X×K heads (each a single decision).
 */
export function applyIteratedEdict(state, atom, ctx) {
  const rounds = Math.max(0, ctx.xValue || 0);
  const opps = apnapOrder(state, opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]));
  const queue = [];
  for (let r = 0; r < rounds; r++) {
    for (const pid of opps) queue.push({ playerId: pid, round: r });
  }
  const logged = logEvent(state, { kind: "spell-effect", effect: "iterated-edict", controller: ctx.controller, rounds, opponents: opps.length });
  return advanceEdictChain(logged, { queue, sourceName: ctx.cardName || null });
}

/**
 * Lock in ONE opponent's answer (`playerId`): "sacrifice" names a permanent from the pool they were offered (`sac`), "discard" a
 * card in their hand; a stale or illegal pick is the mandatory life loss (never a fabricated sacrifice or discard), and so is
 * "life" or any unknown mode. Nothing is carried out here — settleEdictRound does, once the round's last opponent has chosen.
 * Returns the answer, `{ playerId, mode, permId?, cardId?, round }`.
 */
export function lockInEdictPick(state, { playerId, mode, permId = null, cardId = null, sac = [], round }) {
  if (mode === "sacrifice" && permId && sac.some((c) => c.id === permId)) return { playerId, mode, permId, round };
  if (mode === "discard" && cardId && (state.players?.[playerId]?.hand || []).some((c) => c.id === cardId)) return { playerId, mode, cardId, round };
  return { playerId, mode: "life", round };
}

/**
 * Carry out ONE round's answers — the actions happen simultaneously (CR 101.4). In order:
 *   1. the discarded cards move, hand → graveyard (CR 701.9a), while every permanent chosen for sacrifice is still on the
 *      battlefield — so a graveyard replacement of one sacrificed in this round (Rest in Peace) still applies to them (CR 614.1a);
 *   2. the sacrifices, as ONE event (removal.sacrificeChosen: one is the single sacrifice, more go together — CR 603.2c, every
 *      look-back read before any left, CR 603.10a);
 *   3. the discard watchers (TRIG-DISCARD), then 4. the life losses (Braids' controller drawing for each): after the sacrifices, so
 *      a permanent that left in this round never sees them — only leaves-the-battlefield abilities look back (CR 603.10a). For
 *      Braids the life loss and the draw are the next sentence, after the sacrifices (CR 608.2c).
 * An opponent no longer in the game does nothing; a discard whose card has left the hand is the mandatory life loss instead.
 */
function settleEdictRound(state, picks, spec) {
  const live = picks.filter((p) => state.players?.[p.playerId]);
  const inHand = (p) => (state.players[p.playerId].hand || []).some((c) => c.id === p.cardId);
  const sacrifices = live.filter((p) => p.mode === "sacrifice");
  const discards = live.filter((p) => p.mode === "discard" && inHand(p));
  const losses = live.filter((p) => p.mode !== "sacrifice" && !discards.includes(p));
  let next = state;
  for (const p of discards) next = moveCardToZone(next, { playerId: p.playerId, fromZone: "hand", toZone: "graveyard", cardId: p.cardId });
  next = sacrificeChosen(next, sacrifices.map(({ playerId, permId }) => ({ playerId, permId })));
  for (const p of discards) {
    next = checkDiscardTriggers(logEvent(next, { kind: "spell-effect", effect: "iterated-edict-discard", controller: p.playerId, discarded: 1 }), p.playerId, [p.cardId]);
  }
  for (const p of losses) next = edictLoseLife(next, p.playerId, spec);
  return next;
}

/**
 * BRAIDS, ARISEN NIGHTMARE (the play-weighted program, P·20 — EDHREC #291):
 *   "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do,
 *    each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't,
 *    that player loses 2 life and you draw a card."
 * The whole effect, read as two atoms: the controller's OPTIONAL sacrifice from the five-type pool, then this edict — gated
 * `ifSacrificed`, so it runs only when that sacrifice happened. Each opponent faces the chain's choice with a spec: the pool is
 * their permanents sharing a card type with the sacrificed one (its types as it left — the sacrifice log carries them, CR
 * 608.2h), the "life" branch loses the printed N and the caster draws, and there is no discard mode. An opponent with nothing
 * that shares a type has only the life branch (forced). Returns { atoms } | null.
 */
export function matchBraidsPunisher(oracle) {
  const s = String(oracle || "").toLowerCase();
  const m = s.match(/^you may sacrifice an artifact, creature, enchantment, land, or planeswalker\. if you do, each opponent may sacrifice a permanent of their choice that shares a card type with it\. for each opponent who doesn't, that player loses (\d+) life and you draw a card\.?$/);
  if (!m) return null;
  return { atoms: [
    { op: "sacrifice", who: "controller", what: "nonbattlePermanent", optional: true },
    { op: "edict-shares-type", ifSacrificed: true, lifeLoss: parseInt(m[1], 10), casterDraws: 1, targetType: null },
  ] };
}

export function applyEdictSharesType(state, atom, ctx) {
  // The newest permanent the controller sacrificed — alone, or in a batch (shared.sacrificesByIn, 2026-10-17); more than one of
  // theirs in that batch is no singular "it", and nothing is shared.
  const last = [...(state.log || [])].reverse().map((e) => sacrificesByIn(e, ctx.controller)).find((mine) => mine.length > 0);
  const types = last?.length === 1 ? last[0].cardTypes || [] : [];
  if (!types.length) return state; // no typed sacrifice to share with — nothing for the opponents to answer
  const spec = { lifeLoss: atom.lifeLoss, drawFor: ctx.controller, drawCount: atom.casterDraws, sacTypes: types, allowDiscard: false };
  // "each opponent may sacrifice …" is ONE instruction: one round (round 0) — the opponents choose in APNAP order (CR 101.4) and the
  // permanents they choose leave together (2026-10-17; each used to go as it was chosen).
  const queue = apnapOrder(state, opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid])).map((pid) => ({ playerId: pid, round: 0 }));
  const logged = logEvent(state, { kind: "spell-effect", effect: "edict-shares-type", controller: ctx.controller, types, opponents: queue.length });
  return advanceEdictChain(logged, { queue, sourceName: ctx.cardName || null, spec });
}

export const iteratedEdictResolvers = {
  "iterated-edict": applyIteratedEdict, // Torment of Hailfire — X × per-opponent (lose 3 / sac nonland / discard) edict chain
  "edict-shares-type": applyEdictSharesType, // P·20 — Braids, Arisen Nightmare: sac a shared-type permanent, or lose N and the caster draws
};
