/**
 * effects/atoms/zones.js — zone-movement atoms (bounce, tuck, exile-plain, return-from-graveyard,
 * reanimate). Also hosts the shared enterCardFromZone helper (reanimation + library ramp).
 */

import { logEvent, findPermanent, createPermanent, mintId, moveCardToZone } from "../../gameState.js";
import { checkEnterTriggers, checkLandfallTriggers, checkPermanentEntersTriggers } from "../../triggers.js";
import { atomTargets } from "./shared.js";
import { parseGraveyardFilter } from "../../spellEffects.js"; // seam batch 16: graveyard card-type filter (leaf-safe, same as stack.js's spellEffects import) for graveyardReturnClauseParser
import { SMALL_NUM } from "../parseHelpers.js"; // MULTI-COUNT: number-word → int for "up to N target … cards" (leaf, cycle-free)

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
 * GY-EXILE (CR 608) — "exile target card from a graveyard" (Coffin Purge, Cremate, Purify the Grave, Fade
 * from Memory). UNLIKE return-from-graveyard (the caster's OWN graveyard), the target is a card in ANY
 * player's graveyard (a public zone), chosen at cast; it is moved graveyard → exile from its OWNER's
 * graveyard (t.controller, stamped at enumeration). Fail-safe (CR 608.2b): a target that already left its
 * graveyard is a logged no-op, never a throw. The graveyard is public, so logging the move leaks nothing.
 */
export function applyExileFromGraveyard(state, atom, ctx) {
  let next = state;
  const exiled = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const owner = t.controller; // the graveyard's owner, set at enumeration (may be an opponent)
    const gy = next.players[owner]?.graveyard || [];
    if (!gy.some((c) => c.id === t.id)) continue; // target left the graveyard — no-op (CR 608.2b)
    next = moveCardToZone(next, { playerId: owner, fromZone: "graveyard", toZone: "exile", cardId: t.id });
    exiled.push(t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "exile-from-graveyard", controller: ctx.controller, targets: exiled });
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
 * basic enters tapped). `fromPlayerId` (default `playerId`) is the player whose zone HOLDS the card — for
 * "put target creature card from a/an opponent's graveyard onto the battlefield UNDER YOUR CONTROL"
 * (Reanimate / Hymn of Rebirth / Ashen Powder, CR 608) the card lives in another player's graveyard but
 * the permanent enters under the CASTER's control; the card is removed from fromPlayerId's zone and the
 * permanent is added to playerId's battlefield. When fromPlayerId === playerId (the common own-graveyard /
 * own-library case) this is exactly the original single-player move. Returns `{ state, entered }`:
 * entered:false (state unchanged) when the card isn't in the source zone (CR 608.2b — it left). Shared by
 * reanimation (β-3b, graveyard) and battlefield ramp (RAMP-1, library) so the two enter-a-found-card paths
 * can't drift.
 */
export function enterCardFromZone(state, { playerId, cardId, fromZone, tapped = false, fromPlayerId = playerId }) {
  const owner = state.players[fromPlayerId];
  const controllerPlayer = state.players[playerId];
  if (!owner || !controllerPlayer) return { state, entered: false };
  const card = (owner[fromZone] || []).find((c) => c.id === cardId);
  if (!card) return { state, entered: false };
  const { id: permId, state: s2 } = mintId(state, "perm");
  const ts = s2.timestampCounter || 0;
  const isCreatureCard = /Creature/.test(String(card?.type || card?.type_line || ""));
  const perm = { ...createPermanent({ id: permId, card, controller: playerId, summoningSick: isCreatureCard, tapped }), enteredOnTurn: s2.turn, timestamp: ts };
  // Remove the card from its OWNER's source zone (fromPlayerId), then add the new permanent to the
  // CONTROLLER's battlefield (playerId). Build both player updates from s2 so a same-player move (the
  // common case, fromPlayerId === playerId) composes into one object and a cross-player move (reanimation
  // from an opponent's graveyard) updates the two distinct players without clobbering either.
  const srcZoneList = (s2.players[fromPlayerId][fromZone] || []).filter((c) => c.id !== cardId);
  const ctrlBattlefield = [...s2.players[playerId].battlefield, perm];
  const playersPatch = fromPlayerId === playerId
    ? { [playerId]: { ...s2.players[playerId], [fromZone]: srcZoneList, battlefield: ctrlBattlefield } }
    : {
        [fromPlayerId]: { ...s2.players[fromPlayerId], [fromZone]: srcZoneList },
        [playerId]: { ...s2.players[playerId], battlefield: ctrlBattlefield },
      };
  let next = {
    ...s2,
    timestampCounter: ts + 1,
    players: { ...s2.players, ...playersPatch },
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
  // PERM-ENTERS (artifact-ETB / enchantment-ETB watchers) — enterPermanent (resolvers.js) fires this
  // immediately after checkEnterTriggers, but this non-cast entry path historically did not, so a
  // reanimated / ramped / put-from-hand ARTIFACT or ENCHANTMENT silently missed "whenever an artifact
  // you control enters" (Reckless Fireweaver) / "whenever an enchantment you control enters"
  // (Constellation) payoffs. PUT-FROM-HAND needs it (an artifact card put from hand — Copper Gnomes,
  // Quicksilver Amulet targets — must trigger artifact-ETB watchers). checkPermanentEntersTriggers
  // self-gates on the entering permanent's type, so a creature/land entry is a no-op here. Pure addition —
  // it can only fire correctly-owed triggers that the canonical enter path already fires.
  next = checkPermanentEntersTriggers(next, perm);
  return { state: next, entered: true };
}

export function applyReanimate(state, atom, ctx) {
  let next = state;
  const reanimated = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    // "from your graveyard" → the card lives in (and is removed from) the CASTER's graveyard. "from a
    // graveyard" (anyGraveyard) / "from an opponent's graveyard" (opponentGraveyard) → it lives in the
    // TARGET's owner graveyard (t.controller, stamped at enumeration, possibly an opponent), but enters
    // under the CASTER's control. fromPlayerId routes the removal to the right graveyard; playerId (the
    // caster) always gets the entering permanent.
    const crossZone = atom.anyGraveyard || atom.opponentGraveyard;
    const fromPlayerId = crossZone ? (t.controller || ctx.controller) : ctx.controller;
    const r = enterCardFromZone(next, { playerId: ctx.controller, cardId: t.id, fromZone: "graveyard", fromPlayerId });
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
  // MULTI-COUNT (CR 601.2c "up to N") — "return up to <N> target <filter> cards from your graveyard to your hand"
  // (Morbid Plunder, March of the Returned, Soul Salvage, Dutiful Return). The SAME return-from-graveyard resolver
  // (applyReturnFromGraveyard already loops over every ctx.target); `maxTargets` tells targeting.expandAtoms to
  // offer each subset of 0..N legal own-graveyard cards. `minTargets:0` — "up to" permits choosing zero (CR 601.2c).
  const multiM = /^return up to (two|three|four|five) target (.*?)cards from your graveyard to your hand$/.exec(t);
  if (multiM) {
    const n = SMALL_NUM[multiM[1]];
    const cardFilter = parseGraveyardFilter(multiM[2]);
    if (n >= 2 && cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter, maxTargets: n, minTargets: 0 };
  }
  const gm = /^return target (.*?)card from your graveyard to your hand$/.exec(t);
  if (gm) {
    const cardFilter = parseGraveyardFilter(gm[1]);
    if (cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter };
  }
  if (/^return target creature card from your graveyard to the battlefield$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" };
  // REANIMATE-FROM-ANY (CR 608) — the Reanimate-family phrasing "put target creature card from a graveyard
  // onto the battlefield under your control" (Hymn of Rebirth, Endless Obedience, Vat Emergence's first
  // clause) and the opponent-scoped "from an opponent's graveyard" (Ashen Powder). UNLIKE the own-graveyard
  // reanimate above, the card may live in ANOTHER player's graveyard (enumerated via anyGraveyard /
  // opponentGraveyard), yet always enters under the CASTER's control (applyReanimate's fromPlayerId routes
  // the removal to the target's owner). CREATURE only; "tapped" / "with a +N counter" / a life-loss /
  // indestructible / proliferate rider fails the exact `$` anchor → low → Arbiter (CREED whole-card).
  if (/^put target creature card from a graveyard onto the battlefield under your control$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true };
  if (/^put target creature card from an opponent's graveyard onto the battlefield under your control$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true };
  // GY-TO-TOP — "put target <X> card from your graveyard on top of your library" (Reclaim, Salvage, False
  // Mourning). Same chosen-graveyard-card target + the return-from-graveyard resolver, but the destination is
  // the TOP of the library (toLibraryTop → moveCardToZone toZone:"library", toTop). A rider / "the bottom" /
  // a non-self graveyard fails the `$` → low → Arbiter (FN-safe).
  const topM = /^put target (.*?)card from your graveyard on top of your library$/.exec(t);
  if (topM) {
    const cf = parseGraveyardFilter(topM[1]);
    if (cf) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: cf, toLibraryTop: true };
  }
  // GY-EXILE — "exile target card from a graveyard" (Coffin Purge, Cremate, Purify the Grave, Fade from
  // Memory). ANY player's graveyard (anyGraveyard → enumerate every graveyard), destination exile. The exact
  // `$` anchor rejects "from your graveyard" (the caster-only forms above), "up to N"/plural, a type-filtered
  // variant, or a trailing rider → low → Arbiter (FN-safe). cardFilter "any" matches every graveyard card.
  if (/^exile target card from a graveyard$/.test(t)) return { op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" };
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
  // MULTI-COUNT (CR 601.2c "up to N") — "return up to <N> target <creatures|permanents|…> to their owners' hands"
  // (each card returns to its OWN owner's hand; applyZoneMove → atomTargets(ctx.targets) already loops). Same bounce
  // resolver + a maxTargets count so targeting.expandAtoms offers each subset of 0..N legal targets. minTargets:0.
  const multiB = t.match(/^return up to (two|three|four|five) target (creatures|nonland permanents|permanents|artifacts|enchantments|lands)(?: (an opponent controls|you don't control|you control))? to their owners' hands$/);
  if (multiB) {
    const TTm = { "creatures": "creature", "permanents": "permanent", "nonland permanents": "nonlandPermanent", "artifacts": "artifact", "enchantments": "enchantment", "lands": "land" };
    const n = SMALL_NUM[multiB[1]];
    const restrictions = multiB[3] ? [{ kind: "controller", who: /^you control$/.test(multiB[3]) ? "you" : "opponent" }] : [];
    if (n >= 2) return { op: "bounce", targetType: TTm[multiB[2]], restrictions, maxTargets: n, minTargets: 0 };
  }
  if (/^return target creature to its owner's hand$/.test(t)) return { op: "bounce", targetType: "creature" };
  const bp = t.match(/^return target (nonland permanent|permanent|artifact|enchantment|land)(?: (an opponent controls|you don't control|you control))? to its owner's hand$/);
  if (bp) {
    const TT = { "permanent": "permanent", "nonland permanent": "nonlandPermanent", "artifact": "artifact", "enchantment": "enchantment", "land": "land" };
    const restrictions = bp[2] ? [{ kind: "controller", who: /^you control$/.test(bp[2]) ? "you" : "opponent" }] : [];
    return { op: "bounce", targetType: TT[bp[1]], restrictions };
  }
  if (/^return this (?:creature|permanent) to its owner's hand$/.test(t)) return { op: "bounce", target: "self" };
  if (/^return the triggering creature to its owner's hand$/.test(t)) return { op: "bounce", target: "thatCreature" };
  // MASS-BOUNCE — "return all creatures to their owners' hands" (Evacuation, CR 707-free; the bounce mirror of
  // the eachCreature mass DESTROY/EXILE in removal.js). Routes through the SAME bounce resolver (applyZoneMove
  // → atomTargets → massCreatureTargets returns every creature; each card moves to its OWN owner's hand). An
  // UNFILTERED whole-board bounce — a token returned this way ceases to exist (CR 111.7 — handled by the
  // hand-zone move), exactly like a token swept by Evacuation. A rider (Faerie Slumber Party's token payoff,
  // Turtles in Time's shuffle-and-draw + self-exile) is a separate clause that stays LOW → Arbiter (whole-card
  // CREED, no partial).
  if (/^return all creatures to their owners' hands$/.test(t)) return { op: "bounce", targetType: "eachCreature" };
  // MASS-BOUNCE-EXCEPT — the tribal-protected mass bounce "return all creatures to their owners' hands except
  // for <Subtype>s[, <Subtype>s, … and <Subtype>s]" (Whelming Wave: "…except for Krakens, Leviathans,
  // Octopuses, and Serpents."). Reuses the eachCreature bounce with a MULTI-subtype NEGATE filter
  // (massCreatureTargets honors an array subtypeFilter + subtypeNegate: keep every creature carrying NONE of the
  // listed subtypes). Every printed exclusion word must be in the curated, collision-free allowlist below — a
  // non-curated word fails the gate → null → low → Arbiter (CREED: never a fabricated/mis-scoped sweep).
  const me = t.match(/^return all creatures to their owners' hands except for (.+)$/);
  if (me) {
    const subs = parseExceptSubtypes(me[1]);
    if (subs) return { op: "bounce", targetType: "eachCreature", subtypeFilter: subs, subtypeNegate: true };
  }
  return null;
}

// Curated, collision-free creature subtypes that may appear in a mass-bounce "except for …" exclusion list.
// Each is a word that appears verbatim ONLY in the subtype portion of a type line (never left-of-dash), so the
// word-bounded \b containment test in massCreatureTargets selects exactly the subtyped creatures (CR 205.3m).
// Verified collision-free against the bundled corpus. A LOCAL literal (leaf discipline — no cross-atom import).
const BOUNCE_EXCEPT_SUBTYPES = {
  kraken: "Kraken", leviathan: "Leviathan", octopus: "Octopus", serpent: "Serpent", merfolk: "Merfolk",
};

// Parse a printed "<Subtype>s, <Subtype>s, … and <Subtype>s" exclusion list (plural, Oxford-comma "and"
// separated, the singular MTG subtype carried by a trailing "s") into an array of canonical subtype names, or
// null if ANY word isn't in the curated allowlist (→ caller PARKs the whole card). Strips a trailing period.
function parseExceptSubtypes(listStr) {
  const cleaned = String(listStr || "").replace(/\.$/, "").trim();
  // Split on commas and " and " (covers "A and B", "A, B, and C", "A, B and C").
  const words = cleaned.split(/,\s*and\s+|,\s*|\s+and\s+/).map((w) => w.trim()).filter(Boolean);
  if (!words.length) return null;
  const out = [];
  for (const w of words) {
    // Singularize the printed plural: prefer "-es"→"" ("octopuses"→"octopus"), else "-s"→"" ("krakens"→
    // "kraken"). Try the exact word first (so a non-plural printing still resolves), then each singular form;
    // the allowlist lookup is the real gate, so an over-aggressive strip can't admit a wrong subtype.
    const canon = BOUNCE_EXCEPT_SUBTYPES[w]
      || BOUNCE_EXCEPT_SUBTYPES[w.replace(/es$/, "")]
      || BOUNCE_EXCEPT_SUBTYPES[w.replace(/s$/, "")];
    if (!canon) return null; // unmodeled / non-curated subtype → PARK the whole card (CREED)
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}

export const zoneResolvers = {
  "bounce": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "hand"),
  "tuck": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "library", atom.where === "top"),
  "return-from-graveyard": applyReturnFromGraveyard,
  "reanimate": applyReanimate,
  "exile-from-graveyard": applyExileFromGraveyard,
};
