/**
 * typeFilteredUntap.js — the TYPE-filtered member of the "during each other player's untap step" family:
 *
 *   "Untap all artifacts you control during each other player's untap step."          Unwinding Clock #545
 *   "Untap all creatures you control during each other player's untap step."          Drumbellower #1940
 *   "Untap all creatures and lands you control during each other player's untap step." Prophet of Kruphix
 *
 * THE FAMILY ALREADY HAD TWO MEMBERS and both are single-card hooks: seedbornUntap.js ("all permanents")
 * and murkfiendUntap.js ("all green and/or blue creatures"). This is the third shape, and it is
 * deliberately PARAMETERIZED by its type list rather than being a third hard-coded twin — three
 * near-identical modules is how the untap-step semantics drift apart, and the stun / becomes-untapped /
 * summoning-sickness handling below is exactly the fiddly part that must not fork again.
 *
 * WHY A TARGETED HOOK AT ALL (the seedbornUntap.js precedent): detectTriggers has no "during each other
 * player's untap step" event and the effect vocabulary has no untap-others atom, so the clause parses LOW
 * and the card parks. The runtime fires a dedicated synchronous hook at the untap step instead
 * (gameEngine.runStepActions → case "untap", alongside its two siblings).
 *
 * CR 502.x: the untap step's turn-based action untaps the ACTIVE player's permanents; this static creates
 * an ADDITIONAL untap of ITS controller's matching permanents during every OTHER player's untap step. We
 * set `tapped:false` ONLY — summoning sickness and once-per-turn loyalty flags stay, because those are
 * tied to the permanent controller's OWN untap step (CR 302.6 / 606.3) and clearing them on an opponent's
 * untap would be a fabrication. That is the same call both siblings make, and the reason they are worth
 * reading together.
 *
 * TYPE READ IS LAYER-AWARE (permanentTypes, layer 4), like Murkfiend's: an animated Vehicle that is a
 * creature right now IS untapped by the creature form, and a creature that lost the type is not.
 *
 * SCOPE — the three printed type shapes above, anchored whole. A SUBTYPE filter (Ohabi Caleria's
 * "Archers") and a counter-gated form (Quest for Renewal's "as long as there are four or more quest
 * counters") stay unmatched → those cards park (safe FNs). Pure; a board with no watcher returns the
 * state unchanged.
 *
 * THE SELF MEMBER (play-weighted #558, 2026-10-17) — "Untap this <permanent> during each other player's untap step."
 * (Bender's Waterskin, Thousand Moons Infantry, Endbringer, Victory Chimes): the same extra untap, of the ONE permanent
 * the line is printed on. "This artifact" is that object even if it stops being an artifact (CR 700.7), so the self
 * line reads no type. It joins THIS pass rather than a fourth module: a permanent matched by a type watcher and by its
 * own line untaps once (the union below), and the stun / becomes-untapped / summoning-sickness handling stays one copy.
 *   · ONE untap per step, across the family too — the bundled rulings say these untaps happen "at the same time as the
 *     active player's permanents" and "you'll only untap your artifacts once during each other player's untap step"
 *     (Unwinding Clock). Seedborn Muse's and Murkfiend Liege's hooks run first (gameEngine), so the engine hands this
 *     pass the board as the family's untaps began (`stepStart`): a permanent one of them already untapped, or whose
 *     stun counter one of them already removed (CR 122.1d), is not untapped again here.
 *   · What holds it tapped: a stun counter (CR 122.1d replaces ANY untap). What does not: "doesn't untap during its
 *     controller's untap step" (Inertia Bubble, Rust Tick) — a different step; the Waterskin's bundled ruling: "These
 *     effects won't apply and stop Bender's Waterskin from untapping during another player's untap step."
 *   · Line-anchored: the line must be the whole printed line, so a quoted grant ("Enchanted land has \"Untap this land
 *     during each other player's untap step.\"" — Urban Burgeoning, an ability of the land, unmodeled) and a conditional
 *     tail stay unmatched.
 */
import { logEvent, untapOrConsumeStun } from "./gameState.js";
import { permanentTypes } from "./layers.js";

// Anchored whole. The three type words map to the layer-4 type tokens the runtime tests.
const TYPE_UNTAP_RE =
  /untap all (artifacts|creatures|creatures and lands) you control during each other player'?s untap step/i;

const TYPES_FOR = {
  artifacts: ["Artifact"],
  creatures: ["Creature"],
  "creatures and lands": ["Creature", "Land"],
};

/**
 * The type list this card's phase-static untaps, or null. Mechanism-keyed (not name-keyed), so a reprint
 * or a future card with identical templating flips automatically. ONE parser, shared by the coverage
 * classifier and the runtime hook, so the metric and the game can't disagree about which cards untap.
 */
export function parseTypeFilteredUntap(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(TYPE_UNTAP_RE);
  return m ? TYPES_FOR[m[1].toLowerCase()] : null;
}

// THE SELF LINE — the whole printed line, curly apostrophe tolerated, reminder text already gone. The nouns are the ones a
// permanent's self reference prints (CR 700.7 — "this [something]").
const SELF_OTHER_UNTAP_LINE_RE = /^[ \t]*untap this (?:artifact|creature|permanent|land|enchantment) during each other player['’]s untap step\.?[ \t]*$/im;
const SELF_OTHER_UNTAP_LINE_RE_G = new RegExp(SELF_OTHER_UNTAP_LINE_RE.source, "gim");

/**
 * Does this card print "Untap this <permanent> during each other player's untap step." as a line of its own? ONE reader for
 * the runtime pass below and the coverage pre-strip (stripModeledSelfOtherUntap), so the metric credits exactly what the game
 * untaps. Pure.
 */
export function parseSelfOtherUntap(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  return SELF_OTHER_UNTAP_LINE_RE.test(oracle);
}

/**
 * The metric mirror (coverage.classifyCard's pre-strips): the oracle with each printed self line removed, the remaining lines
 * kept in order. An oracle without the line comes back unchanged (the same string).
 */
export function stripModeledSelfOtherUntap(oracle) {
  const text = String(oracle || "");
  if (!SELF_OTHER_UNTAP_LINE_RE.test(text)) return text;
  return text.replace(SELF_OTHER_UNTAP_LINE_RE_G, "").split("\n").filter((l) => l.trim() !== "").join("\n");
}

/**
 * At the untap step of `activePlayer`, each type-filtered watcher controlled by a NON-active player makes
 * that player untap their matching permanents too, and each of that player's permanents printing the self
 * line untaps itself. Sets `tapped:false` only (see the CR note above); records real tapped→untapped
 * transitions as becomes-untapped events (Mesmeric Orb), and a stunned permanent consumes a stun counter
 * instead of untapping (CR 122.1d). `stepStart` (optional) is the board as the family's untaps began this
 * step: a permanent an earlier member already untapped or un-stunned is left alone (one untap per step). Pure.
 */
export function applyTypeFilteredUntap(state, activePlayer, { stepStart = null } = {}) {
  const players = state?.players;
  if (!players) return state;
  let next = state;
  for (const pid of Object.keys(players)) {
    if (pid === activePlayer) continue; // the active player already untapped via the normal turn-based untapAll
    const player = next.players[pid];
    if (!player?.battlefield?.length) continue;
    // A player controlling TWO different watchers (an Unwinding Clock and a Drumbellower) untaps the UNION
    // — each static applies independently, so collecting them is what the cards actually say.
    const wanted = new Set();
    for (const perm of player.battlefield) {
      for (const t of parseTypeFilteredUntap(perm.card) || []) wanted.add(t);
    }
    const selfIds = new Set(player.battlefield.filter((perm) => parseSelfOtherUntap(perm.card)).map((perm) => perm.id));
    if (!wanted.size && !selfIds.size) continue;
    // ONE UNTAP PER STEP: what an earlier member of the family (Seedborn Muse, Murkfiend Liege) already did to a permanent this
    // step — untapped it (it reads untapped now and is skipped below) or removed a stun counter instead (CR 122.1d).
    const startStun = new Map((stepStart?.players?.[pid]?.battlefield || []).map((p) => [p.id, p.counters?.stun || 0]));
    const alreadyMet = (p) => startStun.has(p.id) && startStun.get(p.id) !== (p.counters?.stun || 0);
    let changed = false;
    const becameUntapped = [];
    const selfUntapped = [];
    const untapped = player.battlefield.map((p) => {
      if (!p.tapped || alreadyMet(p)) return p;
      const bySelf = selfIds.has(p.id);
      const byType = wanted.size > 0 && (permanentTypes(next, p.id)?.types || []).some((t) => wanted.has(t));
      if (!bySelf && !byType) return p;
      changed = true;
      if (bySelf) selfUntapped.push(p.card?.name ?? p.id);
      if (!((p.counters?.stun || 0) > 0)) becameUntapped.push({ id: p.id, controller: pid });
      return untapOrConsumeStun(p);
    });
    if (!changed) continue;
    next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], battlefield: untapped } } };
    if (becameUntapped.length) next = { ...next, pendingUntapEvents: [...(next.pendingUntapEvents || []), ...becameUntapped] };
    next = logEvent(next, { kind: "type-filtered-untap", controller: pid, types: [...wanted], ...(selfUntapped.length ? { selfUntapped } : {}), duringUntapOf: activePlayer });
  }
  return next;
}
