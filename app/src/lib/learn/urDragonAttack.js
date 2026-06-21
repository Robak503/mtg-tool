/**
 * urDragonAttack.js — the variable-count tribal attack trigger (The Ur-Dragon):
 *   "Whenever one or more Dragons you control attack, draw that many cards, then you may put a
 *    permanent card from your hand onto the battlefield."
 *
 * WHY A TARGETED HOOK (the xCastToken.js / #319 pattern):
 *   Cindy's trigger compiler does NOT reach this trigger, and extending it is out of lane:
 *     - the condition "one or more Dragons you control attack" uses the PLURAL verb "attack" — the
 *       compiler's attack matcher (triggers.js) is anchored on the singular "attacks" ("a Dragon you
 *       control attacks"), so detectTriggers returns null here;
 *     - the effect "draw THAT MANY cards" is a combat-derived VARIABLE count — parseTriggerEffect only
 *       admits fixed counts (a|one|…|N), so it returns null;
 *     - "put a permanent card from your hand onto the battlefield" is not in the effect vocabulary at all.
 *   The flush path (gameEngine.flushTriggers) RE-PARSES a pending trigger's clause via parseEffectClause,
 *   so enqueuing this card's clause as a pending trigger would just fail to parse — it can't ride the
 *   normal trigger machinery. The in-lane move (per Walt's manual + the #319 precedent) is a SELF-CONTAINED
 *   synchronous hook that builds and applies the effect DIRECTLY, with ZERO change to detectTriggers /
 *   parseEffectClause. Corpus sweep (37,474 cards): the "…attack, draw that many cards…" templating is
 *   UNIQUE to The Ur-Dragon — this is a single-card hook, exactly as xCastToken is essentially Zaxara's.
 *
 * CR: 508.3a (an attack trigger fires when the creatures are declared as attackers — here, once per combat
 * for the batch, drawing a card per attacking Dragon); 121.1 (drawing a card); 603.6a (the cheated
 * permanent ENTERS, so its ETB triggers fire); 704.5f (a 0/0 entering dies to the toughness SBA).
 *
 * Self-contained + pure (returns a new state). Fired at the declare-blockers transition alongside
 * checkAttackTriggers, so the cardDrawn / ETB sub-triggers it ENQUEUES flush in the same priority-grant
 * pass (gameEngine line 302). ADDITIVE only — no core-death surgery.
 */
import { drawCards, createPermanent, mintId, findPermanent, destroyLethalCreatures, logEvent } from "./gameState.js";
import { checkCardDrawnTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkDiesTriggers } from "./triggers.js";

// Anchored to the WHOLE unique templating so none of the 24 other "one or more <X> you control attack"
// cards (which carry DIFFERENT effects — add mana, gain life, make tokens, goad …) can false-match. The
// captured subtype is plural in oracle ("Dragons"); singularized for the type-line substring test below.
const UR_DRAGON_ATTACK =
  /whenever one or more ([a-z]+) you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield/i;

/** A card whose type line makes it a PERMANENT card (CR 110.4a) — anything that is NOT instant/sorcery-only. */
function isPermanentCard(card) {
  const t = String(card?.type || card?.type_line || "").toLowerCase();
  return /\b(creature|artifact|enchantment|land|planeswalker|battle)\b/.test(t);
}

/** Live type line of an attacker's permanent (printed subtype substring — mirrors the engine's subtype-attack scope). */
function attackerTypeLine(state, permanentId) {
  const card = findPermanent(state, permanentId)?.permanent?.card;
  return String(card?.type || card?.type_line || "").toLowerCase();
}

/**
 * Parse a card's "one or more <subtype> attack → draw that many, then may cheat a permanent" trigger.
 * Reminder text is stripped first. Returns { subtype } (lowercased, singularized) or null.
 */
export function parseUrDragonAttackTrigger(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(UR_DRAGON_ATTACK);
  if (!m) return null;
  const plural = m[1].toLowerCase();
  // Strip a single trailing "s" ("dragons" → "dragon"); if singularization misses an irregular plural the
  // count below comes back 0 → draw 0 → a SAFE false-negative (under-deliver), never an over-fire.
  const subtype = plural.endsWith("s") ? plural.slice(0, -1) : plural;
  return { subtype };
}

/**
 * AI heuristic for the optional "you may put a permanent card from your hand onto the battlefield": the
 * highest-mana-value permanent in hand (the card you'd most want for free), deterministic tie-break by
 * hand order. Returns the hand index, or -1 when the hand holds no permanent. NOTE: this auto-takes the
 * option whenever a permanent exists — an under-model of the human's interactive decline, but NEVER a
 * fabrication or a dropped clause (a permanent IS put into play, which is correct in ~all real lines).
 */
function pickPermanentToCheat(hand) {
  let bestIdx = -1;
  let bestMv = -1;
  for (let i = 0; i < hand.length; i++) {
    if (!isPermanentCard(hand[i])) continue;
    const mv = Number(hand[i]?.cmc) || 0;
    if (mv > bestMv) {
      bestMv = mv;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Put the chosen hand card onto pid's battlefield as a permanent (CR: a one-shot "put onto the battlefield"
 * — no cost, no stack), fire its ETB, then run the lethal SBA. Pure.
 *
 * Entry stamping mirrors the canonical enterCardFromZone / enterPermanent exactly: a deterministic mintId,
 * the CR 613.7e layer timestamp (threaded via timestampCounter so two permanents entering this combat sort
 * youngest-last), enteredOnTurn, and PER-TYPE summoning sickness (only a creature is sick — CR 302.6). It
 * does NOT delegate to enterCardFromZone on purpose: that helper fires only checkEnterTriggers, whereas a
 * fresh permanent "put onto the battlefield" must ALSO fire the artifact/enchantment-ETB watchers
 * (checkPermanentEntersTriggers, the token-entry path) — delegating would silently DROP that ETB coverage.
 * CR: 603.6a (the cheated permanent ENTERS → its ETB / others' enters-watchers trigger); 704.5f (a 0/0
 * entering dies to the toughness SBA). A landfall trigger on a cheated LAND is a SAFE under-fire (omitted).
 */
function cheatPermanentFromHand(state, pid, handIdx) {
  const player = state.players[pid];
  const card = player.hand[handIdx];
  const minted = mintId(state, "perm");
  let next = minted.state;
  const ts = next.timestampCounter || 0;
  const isCreatureCard = /creature/i.test(String(card?.type || card?.type_line || ""));
  const perm = {
    ...createPermanent({ id: minted.id, card, controller: pid, summoningSick: isCreatureCard }),
    enteredOnTurn: next.turn,
    timestamp: ts,
  };
  const p = next.players[pid];
  next = {
    ...next,
    timestampCounter: ts + 1,
    players: {
      ...next.players,
      [pid]: { ...p, hand: p.hand.filter((_, i) => i !== handIdx), battlefield: [...p.battlefield, perm] },
    },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller: pid });
  next = checkEnterTriggers(next, perm);
  next = checkPermanentEntersTriggers(next, perm);
  const r = destroyLethalCreatures(next);
  return checkDiesTriggers(r.state, r.dead);
}

/**
 * At the declare-blockers transition (the full attacker batch is in state.combat.attackers), each Ur-Dragon-
 * style watcher its controller has on the battlefield draws one card per attacking creature of its captured
 * subtype, THEN (the drawn cards are now in hand and eligible) may put the best permanent from hand onto the
 * battlefield. Fires once per watcher (a batch "one or more … attack" trigger, NOT once per attacker). A
 * controller with no attacking <subtype> creature draws 0 → no-op (the real trigger wouldn't have fired). Pure.
 */
export function applyUrDragonAttackTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  // Distinct attacking players (each could control an Ur-Dragon-style watcher).
  const attackingPlayers = [...new Set(attackers.map((a) => a.attackingPlayer).filter(Boolean))];
  let next = state;
  for (const pid of attackingPlayers) {
    const player = next.players?.[pid];
    if (!player) continue;
    // Snapshot the watchers up front: the cheat-in below mutates the battlefield, and a freshly cheated
    // permanent never attacked, so it must not be (re)counted as a watcher this combat.
    const watchers = (player.battlefield || [])
      .map((perm) => ({ perm, spec: parseUrDragonAttackTrigger(perm.card) }))
      .filter((w) => w.spec);
    for (const { spec } of watchers) {
      // "that many" = the number of this player's attacking creatures of the captured subtype (read from the
      // pre-cheat attacker batch — counts only creatures actually declared as attackers).
      const count = attackers.filter(
        (a) => a.attackingPlayer === pid && attackerTypeLine(next, a.permanentId).includes(spec.subtype),
      ).length;
      if (count <= 0) continue;
      const before = next.players[pid].library.length;
      next = drawCards(next, { playerId: pid, count });
      const drawn = before - next.players[pid].library.length;
      if (drawn > 0) next = checkCardDrawnTriggers(next, pid, drawn);
      // "then you may put a permanent card from your hand onto the battlefield" (drawn cards are eligible).
      const handIdx = pickPermanentToCheat(next.players[pid].hand);
      if (handIdx >= 0) next = cheatPermanentFromHand(next, pid, handIdx);
    }
  }
  return next;
}
