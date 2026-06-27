/**
 * effects/atoms/zones.js — zone-movement atoms (bounce, tuck, exile-plain, return-from-graveyard,
 * reanimate). Also hosts the shared enterCardFromZone helper (reanimation + library ramp).
 */

import { logEvent, findPermanent, createPermanent, mintId, moveCardToZone } from "../../gameState.js";
import { checkEnterTriggers, checkLandfallTriggers } from "../../triggers.js";
import { atomTargets } from "./shared.js";
import { parseGraveyardFilter } from "../../spellEffects.js"; // seam batch 16: graveyard card-type filter (leaf-safe, same as stack.js's spellEffects import) for graveyardReturnClauseParser

/** Move creature(s) battlefield → hand (bounce), → exile, or → library (TUCK — top via toTop, else
 * bottom) — chosen targets, or ALL creatures for a mass `exile all creatures` (targetType "eachCreature"). */
export function applyZoneMove(state, atom, ctx, toZone, toTop = false) {
  let next = state;
  const targets = atomTargets(state, atom, ctx);
  for (const t of targets) {
    // "creature" (bounce/exile-creature + mass eachCreature), "permanent" (targeted non-creature
    // exile — Oblivion Ring-style, incl. a land/artifact within a union target), or "planeswalker"
    // (PW-7). moveCardToZone detaches any Aura/Equip.
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(next, t.id);
    if (lk) {
      // TUCK uses the card's controller as the owner proxy (consistent with bounce's "owner's hand");
      // toTop prepends to the library (top), else moveCardToZone appends (bottom).
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone, cardId: t.id, toTop });
    }
  }
  // Exile is NOT "dies" (CR 700.4 — dies = to graveyard), so no dies triggers fire. Tuck → library.
  const effect = toZone === "exile" ? "exile" : toZone === "library" ? "tuck" : "bounce";
  return logEvent(next, { kind: "spell-effect", effect, targets: targets.map(t => t.id) });
}

/**
 * Graveyard recursion (CR 608) — move the targeted card(s) from the CASTER'S graveyard to their
 * hand (Raise Dead / Regrowth). The target was chosen at cast time from the caster's own
 * graveyard (a public zone). Fail-safe (CR 608.2b): if the targeted card already left the
 * graveyard, that target does nothing — a logged no-op, never a throw. Hidden-info safe: the
 * card was already visible in the graveyard, so logging the move reveals nothing new.
 */
export function applyReturnFromGraveyard(state, atom, ctx) {
  let next = state;
  const returned = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const gy = next.players[ctx.controller]?.graveyard || [];
    if (!gy.some((c) => c.id === t.id)) continue; // target left the graveyard — no-op (CR 608.2b)
    // GY-TO-TOP: toLibraryTop routes graveyard → TOP of library (Reclaim), else → hand (Raise Dead).
    next = atom.toLibraryTop
      ? moveCardToZone(next, { playerId: ctx.controller, fromZone: "graveyard", toZone: "library", cardId: t.id, toTop: true })
      : moveCardToZone(next, { playerId: ctx.controller, fromZone: "graveyard", toZone: "hand", cardId: t.id });
    returned.push(t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "return-from-graveyard", controller: ctx.controller, targets: returned });
}

/**
 * Reanimation (β-3b, CR 608) — "Return target creature card from your graveyard to the battlefield"
 * (Resurrection / Zombify / Breath of Life). Like return-from-graveyard but the chosen card enters the
 * battlefield as a permanent UNDER THE CASTER'S CONTROL (becomePermanent), and its ETB triggers fire
 * (checkEnterTriggers, flushed by the resolution finalizer). Target left the graveyard → no-op (CR
 * 608.2b). Tokens were excluded at enumeration (not a card). "to your HAND" stays return-from-graveyard;
 * a rider ("tapped", "under your control", "with a +1/+1 counter") fails the exact anchor → Arbiter.
 */
/**
 * Enter `cardId` from `fromZone` (graveyard / library) onto `playerId`'s battlefield as a permanent
 * under their control, then fire its ETB triggers (checkEnterTriggers; the resolution finalizer flushes
 * them). MIRRORS resolvers.enterPermanent's setup (deterministic perm id + the CR 613.7e layer timestamp
 * + enteredOnTurn + creature summoning sickness) — it can't call enterPermanent directly because
 * resolvers→runProgram→effectAtoms would cycle. `tapped` enters it tapped (RAMP-1 — Rampant Growth's
 * basic enters tapped). Returns `{ state, entered }`: entered:false (state unchanged) when the card isn't
 * in the zone (CR 608.2b — it left). Shared by reanimation (β-3b, graveyard) and battlefield ramp (RAMP-1,
 * library) so the two enter-a-found-card paths can't drift.
 */
export function enterCardFromZone(state, { playerId, cardId, fromZone, tapped = false }) {
  const player = state.players[playerId];
  if (!player) return { state, entered: false };
  const card = (player[fromZone] || []).find((c) => c.id === cardId);
  if (!card) return { state, entered: false };
  const { id: permId, state: s2 } = mintId(state, "perm");
  const ts = s2.timestampCounter || 0;
  const isCreatureCard = /Creature/.test(String(card?.type || card?.type_line || ""));
  const perm = { ...createPermanent({ id: permId, card, controller: playerId, summoningSick: isCreatureCard, tapped }), enteredOnTurn: s2.turn, timestamp: ts };
  const p = s2.players[playerId];
  let next = {
    ...s2,
    timestampCounter: ts + 1,
    players: { ...s2.players, [playerId]: { ...p,
      [fromZone]: p[fromZone].filter((c) => c.id !== cardId),
      battlefield: [...p.battlefield, perm],
    } },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller: playerId });
  // ETB fires for any entry; LANDFALL (CR 603 — a triggered ability, ability word CR 207.2c) ALSO fires
  // when the entering permanent is a LAND — a
  // RAMP/fetch that puts a land onto the battlefield (Cultivate, Rampant Growth, Kodama's Reach) is a
  // landfall event, not just an ETB. Without this, landfall payoffs (Lotus Cobra, Tatyova, Rampaging
  // Baloths) silently miss every ramp-fetched land. checkLandfallTriggers self-gates via isLandPerm, so a
  // reanimated/fetched CREATURE never fires it — only a land does. (Sibling of the play-land ETB fix.)
  next = checkEnterTriggers(next, perm);
  next = checkLandfallTriggers(next, perm);
  return { state: next, entered: true };
}

export function applyReanimate(state, atom, ctx) {
  let next = state;
  const reanimated = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const r = enterCardFromZone(next, { playerId: ctx.controller, cardId: t.id, fromZone: "graveyard" });
    next = r.state;
    if (r.entered) reanimated.push(t.id); // skipped (entered:false) = target left the graveyard (CR 608.2b)
  }
  return logEvent(next, { kind: "spell-effect", effect: "reanimate", controller: ctx.controller, targets: reanimated });
}

/**
 * TUCK clause parser (migrated from parseExtendedAtom, seam batch 10 / Wave A5).
 * "put target <creature|permanent|nonland permanent|creature or land|artifact or creature> on (top|the
 * bottom) of its owner's library" → tuck atom (applyZoneMove → library, top/bottom). A creature restriction,
 * 3-way union, positional "Nth from the top", or any rider fails the exact anchor → low → Arbiter (clean FN).
 * Pure (no parser.js import — cycle-safe); normalizes the clause exactly as parseExtendedAtom does.
 */
export function tuckClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const tk = t.match(/^put target (creature or land|artifact or creature|nonland permanent|creature|permanent) on (top|the bottom) of its owner's library$/);
  if (tk) {
    const TT = { "creature": "creature", "permanent": "permanent", "nonland permanent": "nonlandPermanent", "creature or land": "creatureOrLand", "artifact or creature": "creatureOrArtifact" };
    return { op: "tuck", targetType: TT[tk[1]], where: tk[2] === "top" ? "top" : "bottom" };
  }
  return null;
}

/**
 * GRAVEYARD-RETURN clause parser (CR 608) — co-extracted from parseExtendedAtom (seam batch 16 / Wave C). The
 * coupling pair that shares the `^return target … from your graveyard` prefix, order preserved (return-to-hand
 * first, reanimate second):
 *   return-from-graveyard — "return target <X> card from your graveyard to your hand" (Raise Dead, Regrowth,
 *     Eternal Witness). Target is a card in the CASTER'S OWN graveyard, chosen at cast time (no resolution-time
 *     picker). The card-type filter <X> is parsed by parseGraveyardFilter — a basic type / " or "-union /
 *     "permanent" / unfiltered "card"; a subtype / color / negation / intersection / "historic" → null → low.
 *   reanimate — "return target creature card from your graveyard to the battlefield" (Resurrection, Zombify).
 *     CREATURE only; "under your control" / "tapped" / "+1/+1 counter" / non-creature filter fails → low.
 * The exact "$" anchor rejects multi-card ("up to two", plural), another zone ("from a graveyard"), and any
 * trailing rider. Pure; uses parseGraveyardFilter from spellEffects (leaf-safe, like stack.js's applyDamageEffect
 * import). Registered via registerClauseParser in parser.js.
 */
export function graveyardReturnClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const gm = /^return target (.*?)card from your graveyard to your hand$/.exec(t);
  if (gm) {
    const cardFilter = parseGraveyardFilter(gm[1]);
    if (cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter };
  }
  if (/^return target creature card from your graveyard to the battlefield$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" };
  // GY-TO-TOP — "put target <X> card from your graveyard on top of your library" (Reclaim, Salvage, False
  // Mourning). Same chosen-graveyard-card target + the return-from-graveyard resolver, but the destination is
  // the TOP of the library (toLibraryTop → moveCardToZone toZone:"library", toTop). A rider / "the bottom" /
  // a non-self graveyard fails the `$` → low → Arbiter (FN-safe).
  const topM = /^put target (.*?)card from your graveyard on top of your library$/.exec(t);
  if (topM) {
    const cf = parseGraveyardFilter(topM[1]);
    if (cf) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: cf, toLibraryTop: true };
  }
  return null;
}

/**
 * BOUNCE clause parser ("return … to its owner's hand" → applyZoneMove to hand) — co-extracted from
 * parseExtendedAtom (seam batch 24 / Wave C). All four bounce matchers, original first-match order:
 *   1. "return target creature to its owner's hand" → bounce/creature
 *   2. β-3 "return target <nonland permanent|permanent|artifact|enchantment|land>[ <control>] to its owner's
 *      hand" (bp) — non-creature permanent bounce + the controller restriction (you control / opponent)
 *   3. "return this creature to its owner's hand" → target:"self" (the ability source, CR 113.7)
 *   4. "return the triggering creature to its owner's hand" → target:"thatCreature" (CR 608.2c; detectTriggers
 *      rewrites the non-self pronoun to this sentinel before it reaches here)
 * A rider / filter / different zone fails the exact anchor → low → Arbiter. NOT in the rider-folding dispatch
 * (matchRemovalControllerRider is exile/destroy-only), so this lifts cleanly. Pure (no helper). Registered via
 * registerClauseParser in parser.js.
 */
export function bounceClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^return target creature to its owner's hand$/.test(t)) return { op: "bounce", targetType: "creature" };
  const bp = t.match(/^return target (nonland permanent|permanent|artifact|enchantment|land)(?: (an opponent controls|you don't control|you control))? to its owner's hand$/);
  if (bp) {
    const TT = { "permanent": "permanent", "nonland permanent": "nonlandPermanent", "artifact": "artifact", "enchantment": "enchantment", "land": "land" };
    const restrictions = bp[2] ? [{ kind: "controller", who: /^you control$/.test(bp[2]) ? "you" : "opponent" }] : [];
    return { op: "bounce", targetType: TT[bp[1]], restrictions };
  }
  if (/^return this creature to its owner's hand$/.test(t)) return { op: "bounce", target: "self" };
  if (/^return the triggering creature to its owner's hand$/.test(t)) return { op: "bounce", target: "thatCreature" };
  return null;
}

export const zoneResolvers = {
  "bounce": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "hand"),
  "tuck": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "library", atom.where === "top"),
  "return-from-graveyard": applyReturnFromGraveyard,
  "reanimate": applyReanimate,
};
