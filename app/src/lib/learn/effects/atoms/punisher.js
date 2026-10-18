/**
 * effects/atoms/punisher.js — the PUNISHER: another player chooses between two outcomes (CR 118.12 — "[A player] may [do
 * something]. If [that player] doesn't, [effect].").
 *
 * The play-weighted program: #1029 Combustible Gearhulk, #1045 Charismatic Conqueror, and Risk Factor.
 *
 *   Combustible Gearhulk:  "target opponent may have you draw three cards. If the player doesn't, you mill three cards, then this
 *                           creature deals damage to that player equal to the total mana value of those cards."
 *   Risk Factor:           "Target opponent may have Risk Factor deal 4 damage to them. If that player doesn't, you draw three cards."
 *   Charismatic Conqueror: "they may tap that permanent. If they don't, you create a 1/1 white Vampire creature token with
 *                           lifelink." (on its "an artifact or creature an opponent controls enters untapped" watcher)
 *
 * ONE atom, `punisher`, carrying both outcomes as small closed descriptors (`taken` — the decider says yes; `declined` — no).
 * It is an optional atom whose decider is not its controller: the targeted opponent (`optionalDeciderIsTarget`, the Partner-with
 * lane) or the entering permanent's controller (`optionalDecider: "triggeringPermanentController"`, Selvala's lane). The
 * optional-effect pause asks that player; runProgram runs `taken` on yes and `declined` on no (resolveOptionalChoice passes
 * `declinedChoice`). A decider who CAN'T take it gets `declined` without being asked (punisherTakeable — the Conqueror's
 * permanent already tapped or gone: its bundled ruling, "the opponent can't choose to tap it, so you'll create a Vampire token").
 *
 * The outcome kinds — nothing else parses:
 *   taken:    { kind: "draw", count }        the ability's controller draws
 *             { kind: "damageDecider", amount } the source deals that much damage to the decider
 *             { kind: "tapTriggering" }      the triggering permanent is tapped
 *   declined: { kind: "millDamageTotalMv", count } the controller mills that many, then the source deals the decider damage equal
 *                                            to the milled cards' total mana value (CR 701.17c — read where they went, a public
 *                                            zone; {X} counts 0, the Gearhulk ruling)
 *             { kind: "draw", count }
 *             { kind: "createToken", token } a plain fixed-count create-token reading
 *
 * The default AI decision (punisherAutoTake) weighs damage against cards (see its note). Pure parse; the resolver reads state.
 */

import { logEvent, findPermanent } from "../../gameState.js";
import { applyDamageEffect, applyDrawEffect } from "../../spellEffects.js"; // the shared deal path and the trigger-threading draw — call-time binding, cycle-safe (the combat.js / removal.js precedent)
import { permanentIsCreature, permanentHasKeyword } from "../../layers.js";
import { damageSourceFor } from "./shared.js";
import { millOnePlayer } from "./library.js";
import { applyTapEffect } from "./combat.js";
import { applyCreateToken, createTokenClauseParser } from "./tokens.js";

const COUNT = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
// A token the declined branch makes: exactly the plain fixed-count reading (no inline ability, name, tapped or attacking rider).
const PLAIN_TOKEN_KEYS = new Set(["op", "count", "power", "toughness", "descriptor", "keywords", "targetType"]);

/**
 * The punisher sentences, whole (they span two sentences, so this runs before the clause splitter). Returns the atom, or null.
 * The Conqueror's sentence arrives as the sentinel detectTriggers writes on its watcher only: "they" and "that permanent" become
 * "the triggering permanent's controller" and "the triggering permanent".
 */
export function matchPunisher(oracle) {
  const s = String(oracle || "").toLowerCase().replace(/[’]/g, "'").trim().replace(/\.$/, "");
  let m = s.match(/^target opponent may have you draw (two|three|four|five) cards\. if (?:the|that) player doesn't, you mill (two|three|four|five) cards, then this creature deals damage to that player equal to the total mana value of those cards$/);
  if (m) {
    return { op: "punisher", targetType: "opponent", optional: true, optionalDeciderIsTarget: true,
      taken: { kind: "draw", count: COUNT[m[1]] }, declined: { kind: "millDamageTotalMv", count: COUNT[m[2]] } };
  }
  // "may have <the source> deal N damage to them" — the subject is the effect's own source (the damage parsers' convention); a
  // subject naming another object stays unread.
  m = s.match(/^target opponent may have ([^.]+?) deal (\d+) damage to them\. if that player doesn't, you draw (two|three|four|five) cards$/);
  if (m && !/\b(?:target|that|another|each|enchanted|equipped)\b/.test(m[1])) {
    return { op: "punisher", targetType: "opponent", optional: true, optionalDeciderIsTarget: true,
      taken: { kind: "damageDecider", amount: parseInt(m[2], 10) }, declined: { kind: "draw", count: COUNT[m[3]] } };
  }
  m = s.match(/^the triggering permanent's controller may tap the triggering permanent\. if they don't, (?:you )?(create .+)$/);
  if (m) {
    const token = createTokenClauseParser(m[1]);
    if (token?.op !== "create-token" || !Number.isInteger(token.count) || !Object.keys(token).every((k) => PLAIN_TOKEN_KEYS.has(k))) return null;
    return { op: "punisher", targetType: null, optional: true, optionalDecider: "triggeringPermanentController",
      taken: { kind: "tapTriggering" }, declined: { kind: "createToken", token } };
  }
  return null;
}

/** The player who decides: the targeted opponent, or the triggering permanent's controller. Null when they are not in the game. */
export function punisherDecider(state, atom, ctx) {
  const pid = atom.optionalDeciderIsTarget
    ? (ctx.targets || []).find((t) => t.type === "player")?.id
    : atom.optionalDecider === "triggeringPermanentController" ? ctx.triggeringPermanentController : null;
  return pid != null && state.players?.[pid] ? pid : null;
}

/**
 * Can the decider take the `taken` outcome at all? Tapping the triggering permanent needs it on the battlefield and untapped —
 * otherwise the decider can't choose to tap it, and the declined outcome happens (the Conqueror ruling). Every other outcome can
 * always be chosen.
 */
export function punisherTakeable(state, atom, ctx) {
  if (atom.taken?.kind !== "tapTriggering") return true;
  const hit = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
  return !!hit && !hit.permanent.tapped;
}

/** Resolve the outcome the decider chose (`atom.declinedChoice` — set by the settle on a no, or when the yes can't be chosen). */
export function applyPunisher(state, atom, ctx) {
  const outcome = atom.declinedChoice ? atom.declined : atom.taken;
  const decider = punisherDecider(state, atom, ctx);
  let next = logEvent(state, { kind: "spell-effect", effect: "punisher", controller: ctx.controller, decider, taken: !atom.declinedChoice, outcome: outcome?.kind ?? null });
  const hitDecider = (amount) => (decider && amount > 0
    ? applyDamageEffect(next, { controller: ctx.controller, amount, targets: [{ type: "player", id: decider }], source: damageSourceFor(next, ctx) })
    : next);
  switch (outcome?.kind) {
    case "draw":
      return applyDrawEffect(next, { controller: ctx.controller, amount: outcome.count });
    case "damageDecider":
      return hitDecider(outcome.amount);
    case "tapTriggering":
      return applyTapEffect(next, { op: "tap", target: "thatPermanent" }, ctx, true);
    case "createToken":
      return applyCreateToken(next, outcome.token, ctx);
    case "millDamageTotalMv": {
      const before = next;
      next = millOnePlayer(next, ctx.controller, outcome.count);
      // The cards this mill moved (its own stamp — absent when nothing was milled), found where they went: a public zone of their
      // owner, the mill's player (CR 701.17c). A card with {X} counts X as 0 (CR 202.3 — the printed mana value).
      const milled = next === before ? [] : (next._lastMilledIds || []);
      const zones = [...(next.players[ctx.controller]?.graveyard || []), ...(next.players[ctx.controller]?.exile || [])];
      const total = milled.reduce((sum, id) => sum + Math.max(0, Number(zones.find((c) => c.id === id)?.cmc) || 0), 0);
      next = logEvent(next, { kind: "spell-effect", effect: "punisher-milled-total", controller: ctx.controller, milled: milled.length, total });
      return hitDecider(total);
    }
    default:
      return next;
  }
}

/**
 * THE DEFAULT AI DECISION (the optional-effect fallback for a punisher — runProgram.optionalAutoTakeValue): true = take.
 * Damage against cards, from the decider's seat:
 *   - a draw outcome the caster's library can't cover (its size is public) makes them draw from an empty library and lose
 *     (CR 121.4, 704.5b) — always the choice that gives it;
 *   - otherwise the decider takes damage when it leaves them at PUNISHER_LIFE_FLOOR or more: a known amount (Risk Factor's 4),
 *     or the Gearhulk's total over cards nobody has seen, read pessimistically at PUNISHER_MV_PER_CARD a card;
 *   - the Conqueror's tap: taken when the permanent loses nothing by it this turn — a creature that entered on its controller's
 *     own turn without haste (it can't attack yet), or a noncreature permanent with no {T} ability; otherwise the token.
 * The life floor is the value opponentAI's LIFE_PRUDENCE_FLOOR uses (10) — the floor every other life payment of the AI keeps.
 */
export const PUNISHER_LIFE_FLOOR = 10;
export const PUNISHER_MV_PER_CARD = 4;
export function punisherAutoTake(state, decider, caster, atom, ctx = {}) {
  const life = state.players?.[decider]?.life ?? 0;
  const casterLibrary = (state.players?.[caster]?.library || []).length;
  const { taken, declined } = atom;
  if (taken?.kind === "draw" && declined?.kind === "millDamageTotalMv") {
    if (casterLibrary < taken.count) return true;
    return life - PUNISHER_MV_PER_CARD * declined.count < PUNISHER_LIFE_FLOOR;
  }
  if (taken?.kind === "damageDecider" && declined?.kind === "draw") {
    if (casterLibrary < declined.count) return false;
    return life - taken.amount >= PUNISHER_LIFE_FLOOR;
  }
  if (taken?.kind === "tapTriggering") {
    const id = ctx.triggeringPermanentId;
    const hit = id ? findPermanent(state, id) : null;
    if (!hit || hit.permanent.tapped) return false;
    if (permanentIsCreature(state, id)) return state.activePlayer === decider && !!hit.permanent.summoningSick && !permanentHasKeyword(state, id, "Haste");
    return !/\{T\}/.test(String(hit.permanent.card?.oracle ?? hit.permanent.card?.oracle_text ?? ""));
  }
  return true;
}

export const punisherResolvers = {
  "punisher": applyPunisher, // the play-weighted program — another player chooses between two outcomes (CR 118.12)
};
