/**
 * effects/atoms/amass.js — AMASS (CR 701.47) atom + its clause parser.
 *
 * AMASS N <Subtype> (CR 701.47): "If you control an Army, put N +1/+1 counters on it and it becomes
 * the named subtype too. Otherwise, create a 0/0 black <Subtype> Army creature token, then put N +1/+1
 * counters on it." — as ONE event (Orcish Bowmasters "amass Orcs 1", Lazotep Sliver "amass Slivers 2",
 * Saruman's Trickery "Counter target spell. Amass Orcs 1.").
 *
 * THE #1 FP GUARD: a repeated amass REUSES the existing Army (one token across many amasses) — it never
 * spawns a second token. The token is minted at 0/0 with its counters STAMPED BEFORE the battlefield
 * insert (a single event), so it survives the lethal SBA as a real N/N instead of dying as a 0/0.
 *
 * CIRCULAR-IMPORT HAZARD (Wave-0): this module must NOT import from effects/parser.js (parser.js imports
 * the atoms barrel → importing parser back is a load-time TDZ cycle). It EXPORTS a pure clause parser
 * (amassClauseParser) referencing only gameState/tokens helpers; the INTEGRATOR wires
 * registerClauseParser at parser.js-bottom (tests register it in-test, registrySeams.test.js precedent).
 */

import { logEvent, destroyLethalCreatures, createPermanent, mintId, addCounter } from "../../gameState.js";
import { applyCounterDoubling } from "../../replacementEffects.js"; // Wave-3 doubler (leaf): the new-Army mint stamps counters directly, bypassing addCounter
import { checkDiesTriggers } from "../../triggers.js";
import { permIsEveryCreatureType } from "../../layers.js"; // P·39 — every creature type is an Army (layers is already reached through triggers.js; no new cycle)
import { fireTokenEnterTriggers } from "./tokens.js";

/** Replace the controller's battlefield via a pure mapper (updatePermanent / withPlayer are private to
 *  gameState; this is the same inline rebuild applyCreateToken uses). No-ops if the player is missing. */
function withControllerBattlefield(state, controller, mapper) {
  const player = state.players?.[controller];
  if (!player) return state;
  return { ...state, players: { ...state.players, [controller]: { ...player, battlefield: mapper(player.battlefield) } } };
}

// AMASS keeps the +1/+1 counters in the shared counter type so the (future Wave-3) counter-doubler that
// hooks gameState.addCounter intercepts an amass exactly as it does a hardcast +1/+1 grant.
const PLUS_ONE = "+1/+1";

/** A battlefield permanent IS an Army (CR 701.47a) iff its type line carries the Army creature subtype. */
function isArmy(perm) {
  return /\bArmy\b/.test(String(perm?.card?.type || perm?.card?.type_line || ""));
}

/**
 * AMASS N <Subtype> (CR 701.47). `atom.subtype` is the SINGULAR creature subtype ("Sliver"/"Orc"/…);
 * `atom.amount` is a fixed count (floored at 1 like every fixed count), or `atom.countX` reads the
 * chosen {X} (ctx.xValue, floored at 0 — CR 107.3, a 0-count is a clean no-op). Routes ALL counters
 * through gameState.addCounter (the shared path) — no private counter mutation.
 */
export function applyAmass(state, atom, ctx) {
  const subtype = atom.subtype;
  if (!subtype) return state; // an unmodeled subtype never reaches the resolver (the parser drops it) — guard anyway.
  const amount = atom.countX ? Math.max(0, ctx.xValue || 0) : Math.max(0, atom.amount || 0);
  const me = ctx.controller;
  let next = state;

  // (1) If the controller already controls an Army, ADD the counters to it and (CR 701.47a) give it the
  // named subtype too — REUSE, never recreate (the #1 FP guard: repeated amass grows the SAME token).
  const player = next.players?.[me];
  if (!player) return next;
  // P·39 — EVERY CREATURE TYPE IS AN ARMY (CR 701.47a "an Army creature you control"): a changeling, Mirror Entity's activation,
  // an animated Mutavault. Amass reuses it — a second Army token would be a creature the rules never make.
  const existing = player.battlefield.find((p) => isArmy(p) || permIsEveryCreatureType(next, p.id));
  if (existing) {
    if (amount > 0) next = addCounter(next, { permanentId: existing.id, type: PLUS_ONE, amount });
    // "It's also a <Subtype>." — append the subtype to the readable type line so tribal readers
    // (countMatches's `\b<Subtype>\b`, lord static abilities) see it. Rebuild the card.type in place
    // (updatePermanent is private to gameState); idempotent — only appends when absent. CR 701.47a adds it only "if it isn't
    // a [subtype]" — an every-creature-type Army already is one, so nothing is written (it stays no Orc once the effect ends).
    const tl = String(existing.card?.type || existing.card?.type_line || "");
    if (!new RegExp(`\\b${subtype}\\b`).test(tl) && !permIsEveryCreatureType(next, existing.id)) {
      const newType = appendSubtype(tl, subtype);
      next = withControllerBattlefield(next, me, (bf) =>
        bf.map((p) => (p.id === existing.id ? { ...p, card: { ...p.card, type: newType } } : p)),
      );
    }
    return logEvent(next, { kind: "spell-effect", effect: "amass", subtype, amount, reused: true });
  }

  // (2) No Army → mint a 0/0 black <Subtype> Army creature token, then put N +1/+1 counters on it — as
  // ONE event. Counters are stamped on perm.counters BEFORE the battlefield insert so the token is never
  // a counterless 0/0 on the battlefield (it survives the lethal SBA as a real N/N — the earthbend/
  // enters-with-counters template).
  const minted = mintId(next, "tok");
  next = minted.state;
  const card = {
    id: `tok-${minted.id}`,
    name: `${subtype} Army`,
    type: `Token Creature — ${subtype} Army`,
    power: 0,
    toughness: 0,
    token: true,
    colors: ["B"], // CR 701.47a — "a 0/0 black [subtype] Army creature token" (CR 111.3: the token's color is the one defined)
  };
  let perm = createPermanent({ id: minted.id, card, controller: me });
  // Wave-3 doubler (CR 616): the amass +1/+1 counters bypass addCounter (stamped on the freshly-minted token),
  // so route them through applyCounterDoubling — Branching Evolution / Doubling Season double an amass too. (The
  // existing-Army path above uses addCounter and is already doubler-aware. The Army-token creation itself is the
  // singleton amass mint, not a "create N tokens" event, so it is deliberately not token-doubled.)
  if (amount > 0) {
    const n = applyCounterDoubling(next, me, PLUS_ONE, amount);
    perm = { ...perm, counters: { ...perm.counters, [PLUS_ONE]: (perm.counters?.[PLUS_ONE] || 0) + n } };
  }
  next = withControllerBattlefield(next, me, (bf) => [...bf, perm]);

  // ETB (CR 603.6a) — the token ENTERED, so it fires "enters" watchers (Soul Warden / Impact Tremors /
  // subtype-ETB), enqueued BEFORE the lethal SBA. Then the lethal SBA: a 0-amass token (X=0) is a 0/0
  // and dies; a 1+ token is a real N/N and survives.
  next = fireTokenEnterTriggers(next, [minted.id]);
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "amass", subtype, amount, reused: false });
}

/** Append a subtype to a type line. "Token Creature — Orc Army" + "Sliver" → "Token Creature — Orc Sliver
 *  Army"-ish? No: append AFTER the existing subtypes ("… — Orc Army Sliver"). Order is cosmetic; the only
 *  contract is that `\b<Subtype>\b` then matches. If the line has no subtype dash, add one. */
function appendSubtype(typeLine, subtype) {
  if (/—/.test(typeLine)) return `${typeLine} ${subtype}`;
  return `${typeLine} — ${subtype}`;
}

export const amassResolvers = { amass: applyAmass };

// ─── Clause parser (pure; wired via registerClauseParser by the integrator / in-test) ───────────────

// PLURAL oracle subtype → SINGULAR creature subtype. CURATED — every entry is a real amass subtype seen
// in the corpus; an UNKNOWN plural → null → the clause stays LOW → Arbiter (CREED: never fabricate a
// subtype the tribal readers can't anchor on). The amass corpus is small and closed (Zombies dominate;
// Slivers/Orcs are the deck-relevant ones), so a curated map is exact, not a guess.
const AMASS_SUBTYPE = {
  slivers: "Sliver",
  orcs: "Orc",
  zombies: "Zombie",
  oozes: "Ooze",
  birds: "Bird",
  phyrexians: "Phyrexian",
};

/**
 * Parse a bare amass clause "amass <Plural> <N|x>" into an `amass` atom, or null (→ low → Arbiter).
 * Reminder text is already stripped by the dispatch; matched case-insensitively. The `^…$` anchor is
 * the ALLOWLIST discipline: a VARIABLE form ("amass Orcs X, where X is …") carries trailing text and
 * fails the anchor → null (stays LOW), so a board-derived X is never mis-modeled as a fixed/cost count.
 */
export function amassClauseParser(clause, _ctx) {
  const m = String(clause || "").trim().match(/^amass (\w+?) (\d+|x)$/i);
  if (!m) return null;
  const subtype = AMASS_SUBTYPE[m[1].toLowerCase()];
  if (!subtype) return null; // unknown plural → Arbiter (CREED)
  const n = m[2].toLowerCase();
  if (n === "x") return { op: "amass", subtype, countX: true, targetType: null };
  return { op: "amass", subtype, amount: Number(n), targetType: null };
}
