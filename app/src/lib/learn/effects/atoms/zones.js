/**
 * effects/atoms/zones.js — zone-movement atoms (bounce, tuck, exile-plain, return-from-graveyard,
 * reanimate). Also hosts the shared enterCardFromZone helper (reanimation + library ramp).
 */

import { logEvent, findPermanent, createPermanent, mintId, moveCardToZone, recordGraveyardEvents, addCounter } from "../../gameState.js";
import { impositionEntersTapped } from "../../staticAbilityParser.js"; // KM-1 (CR 614.1c) — Kismet taxes non-cast entries too (leaf-safe: staticAbilityParser imports only keywords.js)
import { checkEnterTriggers, checkLandfallTriggers, checkPermanentEntersTriggers } from "../../triggers.js";
import { atomTargets } from "./shared.js";
import { setPendingMilledPickChoice } from "../../pendingChoice.js"; // ④-P — the target player's graveyard pick rides the milled-pick pause (toZone "exile"); library.js already imports the same module, so no new cycle
import { parseGraveyardFilter, cardMatchesGraveyardFilter, parseCreatureTargetRestrictions } from "../../spellEffects.js"; // seam batch 16: graveyard card-type filter (leaf-safe, same as stack.js's spellEffects import) for graveyardReturnClauseParser. cardMatchesGraveyardFilter joins it for MASS-REANIMATE, which selects at RESOLUTION (no enumerated targets) — same import edge, no new module dependency.
import { SMALL_NUM, parseCountSource } from "../parseHelpers.js"; // MULTI-COUNT: number-word → int for "up to N target … cards"; parseCountSource: MASS-OPPONENT-BOUNCE toughness-threshold count (leaf, cycle-free)
import { CR_CREATURE_TYPES } from "../creatureTypes.js"; // SUBTYPE RETURN (Atzocan Seer) — the closed CR subtype vocabulary (a zero-import leaf, cycle-free)
import { shuffleControllerLibrary } from "./library.js";
import { applyScheduleDelayed } from "./delayedTrigger.js"; // the CR 603.7 queue (a sibling leaf)
// CZ-COMMANDER-VISIT cross-layer doors — INJECTED, never imported: a static resolvers.js/layers.js
// import from this atoms leaf TDZ-crashed 56 suites (zones sits under effectAtoms → parser, and
// resolvers.js reaches back through that chain). The integrators register at their own load
// (resolvers.js registers enterPermanent; layers.js registers addContinuousEffect) — the same
// registerGrantTriggeredBodyValidator pattern grantUntilEot.js uses for the identical reason.
let _enterPermanent = null;
let _addContinuousEffect = null;
export function registerCzEnterPermanent(fn) { if (typeof fn === "function") _enterPermanent = fn; }
export function registerCzAddContinuousEffect(fn) { if (typeof fn === "function") _addContinuousEffect = fn; } // GS-1 — the deterministic rngSeed shuffle (works for any player id); library.js never imports zones.js → cycle-free sibling edge

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
 * graveyard (a public zone). GY-TO-BOTTOM (AR-1): the anyGraveyard form ("put target card from a
 * graveyard on the bottom of its owner's library") instead reads the ZONE HOLDER off the target
 * (t.controller) and moves within THAT player — graveyard → bottom of their library. Fail-safe
 * (CR 608.2b): if the targeted card already left the graveyard, that target does nothing — a
 * logged no-op, never a throw. Hidden-info safe: the card was already visible in the graveyard,
 * so logging the move reveals nothing new.
 */
export function applyReturnFromGraveyard(state, atom, ctx) {
  let next = state;
  const returned = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    // GY-TO-BOTTOM (AR-1): "from a graveyard" (anyGraveyard) — the card lives in the TARGET's owner
    // graveyard (t.controller, stamped at enumeration — the applyExileFromGraveyard/applyReanimate cross-zone
    // routing), and the destination zone belongs to THAT player ("its owner's library"). Every own-graveyard
    // form leaves anyGraveyard unset → holder === ctx.controller (byte-identical to before).
    const holder = atom.anyGraveyard ? (t.controller || ctx.controller) : ctx.controller;
    const gy = next.players[holder]?.graveyard || [];
    if (!gy.some((c) => c.id === t.id)) continue; // target left the graveyard — no-op (CR 608.2b)
    // GY-TO-TOP: toLibraryTop routes graveyard → TOP of library (Reclaim); GY-TO-BOTTOM (AR-1):
    // toLibraryBottom → library WITHOUT toTop = append = the bottom (library index 0 is the top);
    // else → hand (Raise Dead).
    next = atom.toLibraryTop
      ? moveCardToZone(next, { playerId: holder, fromZone: "graveyard", toZone: "library", cardId: t.id, toTop: true })
      : atom.toLibraryBottom
        ? moveCardToZone(next, { playerId: holder, fromZone: "graveyard", toZone: "library", cardId: t.id })
        : moveCardToZone(next, { playerId: holder, fromZone: "graveyard", toZone: "hand", cardId: t.id });
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
 * WHOLE-GRAVEYARD EXILE (CR 701.10a) — exile every card in one or more graveyards (Bojuka Bog, Farewell,
 * Rakdos Charm). The graveyard list is SNAPSHOT before the moves so the iteration can't be disturbed by
 * moveCardToZone rebuilding the zone underneath it.
 *
 * An empty graveyard is a legal no-op, NOT a failure: "exile target player's graveyard" still resolves
 * against a player with nothing in the yard (CR 608.2 — an effect that does nothing still resolves).
 */
/**
 * BLINK / FLICKER (CR 400.7) — exile a permanent you control and immediately return it to the battlefield.
 *
 * Deliberately COMPOSED from the two existing chokepoints rather than reimplemented: `moveCardToZone` off
 * the battlefield (which runs the exit path, so LTB watchers see it leave) and `enterCardFromZone` (the same
 * helper reanimation uses, so ETB watchers see it arrive). Re-triggering that ETB is the entire point of the
 * card — a blink that skips it is a blank — which is why the test asserts a watcher's ETB actually FIRED
 * rather than merely that the permanent still exists.
 *
 * CR 400.7 — the returned object is a NEW object: fresh permanent id, no counters, no attachments,
 * summoning-sick. That follows from enterCardFromZone minting a new permanent; nothing here carries state
 * across the hop. The counters case is pinned because preserving them is the tempting shortcut.
 *
 * The CARD id, not the permanent id, is what lands in exile (the battlefield-exit chokepoint pushes
 * `perm.card`), so it is captured BEFORE the move. `returnTo` picks the controller: "controller" for
 * "under your control", "owner" for "under its owner's control" — different cards for a stolen creature.
 *
 * A target that vanished before resolution is a clean no-op (CR 608.2b), never a fabricated entry.
 */
export function applyBlink(state, atom, ctx) {
  let next = state;
  const blinked = [];
  for (const t of ctx.targets || []) {
    const lk = findPermanent(next, t.id);
    if (!lk) continue;                       // gone before resolution — no-op, never a fabricated return
    const perm = lk.permanent;
    const cardId = perm.card?.id;
    if (!cardId) continue;
    // findPermanent returns { permanent, controller } — the CONTROLLER key, not playerId. The `owner` stamp
    // is present only on a cross-player entry (a stolen/reanimated permanent); absent means owner ===
    // controller, which is why the fallback chain ends there rather than guessing.
    const owner = perm.owner || lk.controller;
    const returnController = atom.returnTo === "owner" ? owner : ctx.controller;
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "exile", cardId: perm.id });
    const r = enterCardFromZone(next, { playerId: returnController, cardId, fromZone: "exile", fromPlayerId: owner });
    next = r.state;
    if (r.entered) {
      blinked.push(cardId);
      // SUBTYPE-COUNTER RIDER (Essence Flux — CR 400.7 the returned object is NEW): "if it's a <subtype>, put
      // a +1/+1 counter on it" — read the RETURNED permanent's live type line; a match adds the counter to the
      // new object (r.permanentId). A non-matching subtype adds nothing (never a fabricated counter — CREED).
      if (atom.ifSubtypeCounter && r.permanentId) {
        const np = findPermanent(next, r.permanentId);
        if (np && new RegExp(`\\b${atom.ifSubtypeCounter.subtype}\\b`, "i").test(np.permanent.card?.type || "")) {
          next = addCounter(next, { permanentId: r.permanentId, type: atom.ifSubtypeCounter.counterType, amount: atom.ifSubtypeCounter.amount || 1 });
        }
      }
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "blink", controller: ctx.controller, targets: blinked });
}

/**
 * ④-P — TARGET-PLAYER GRAVEYARD PICK: "Target player exiles a card from their graveyard." The chooser is the TARGET
 * player, not the controller. 0 cards → a logged no-op; 1 → forced, moved directly; 2+ → the milled-pick pause aimed
 * at the target player with toZone:"exile" (the same picker/driver/panel the milled-pick uses, re-labelled). The
 * candidates are ORDERED least-valuable-first (lands, then ascending mana value) so the AI's deterministic
 * first-candidate auto-pick is the sensible give-up, and a human sees the same order. Single chosen target only
 * (the corpus prints no multi-target form); a vanished target → no-op.
 */
export function applyExileGraveyardPick(state, atom, ctx) {
  const t = (ctx.targets || []).find((x) => x.type === "player");
  if (!t || !state.players?.[t.id]) return logEvent(state, { kind: "spell-effect", effect: "exile-graveyard-pick", controller: ctx.controller, target: null, picked: null });
  const gy = state.players[t.id].graveyard || [];
  if (gy.length === 0) return logEvent(state, { kind: "spell-effect", effect: "exile-graveyard-pick", controller: ctx.controller, target: t.id, picked: null });
  const isLand = (c) => /\bLand\b/.test(String(c.type || c.type_line || "").split(" // ")[0]);
  const mv = (c) => Number(c.cmc ?? 0) || 0;
  const ordered = [...gy].sort((x, y) => (Number(isLand(y)) - Number(isLand(x))) || (mv(x) - mv(y)) || String(x.name).localeCompare(String(y.name)));
  if (ordered.length === 1) {
    const next = moveCardToZone(state, { playerId: t.id, fromZone: "graveyard", toZone: "exile", cardId: ordered[0].id });
    return logEvent(next, { kind: "spell-effect", effect: "exile-graveyard-pick", controller: ctx.controller, target: t.id, picked: ordered[0].name });
  }
  return setPendingMilledPickChoice(state, {
    controller: t.id,
    candidates: ordered.map((c) => ({ id: c.id, name: c.name, type: c.type || c.type_line || "" })),
    sourceName: ctx.cardName || null,
    toZone: "exile",
  });
}

export function applyExileGraveyard(state, atom, ctx) {
  let next = state;
  const pids = Object.keys(next.players || {});
  const owners = atom.who === "eachPlayer" ? pids
    : atom.who === "eachOpponent" ? pids.filter((p) => p !== ctx.controller)
      : (ctx.targets || []).filter((t) => t.type === "player").map((t) => t.id);
  const exiled = [];
  for (const owner of owners) {
    for (const card of [...(next.players[owner]?.graveyard || [])]) {   // snapshot — the zone is rebuilt per move
      next = moveCardToZone(next, { playerId: owner, fromZone: "graveyard", toZone: "exile", cardId: card.id });
      exiled.push(card.id);
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "exile-graveyard", controller: ctx.controller, targets: exiled });
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
  // KM-1 (CR 614.1c): an opposing Kismet-class static forces this non-cast entry (reanimate / ramp /
  // detain-return / earthbend-return) in tapped too — every entry path consults the one reader.
  const forcedTapped = tapped || impositionEntersTapped(s2, card, playerId);
  // OWNER STAMP (BLITZ SB-2, CR 110.2 / 404.1): a CROSS-PLAYER entry (reanimation out of another player's
  // graveyard — Ashen Powder / Hymn of Rebirth / the Ink-Eyes saboteur theft) creates a permanent whose
  // controller is NOT its owner (the zone holder — a player's graveyard contains only their own cards,
  // CR 404.1). Stamp `owner` so the battlefield-exit chokepoint (gameState.moveCardToZone) routes the
  // card back to its OWNER's graveyard/hand/library when it dies / is bounced / is tucked (CR 404.1 — a
  // destroyed object "is put on top of its owner's graveyard"; CR 700.4 — dies = put into a graveyard
  // from the battlefield). The common same-player entry stamps nothing → byte-identical.
  const perm = { ...createPermanent({ id: permId, card, controller: playerId, summoningSick: isCreatureCard, tapped: forcedTapped }), enteredOnTurn: s2.turn, timestamp: ts, ...(fromPlayerId !== playerId && { owner: fromPlayerId }) };
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
  // GY-EVENT (SHELF S7): a reanimated card LEAVES its owner's graveyard for the battlefield (a library
  // ramp entry touches no graveyard). gyOwner is the zone HOLDER (fromPlayerId — cross-player reanimation
  // leaves the OPPONENT's graveyard).
  if (fromZone === "graveyard") {
    next = recordGraveyardEvents(next, [{ dir: "leave", card, gyOwner: fromPlayerId, zone: "battlefield" }]);
  }
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
  // `permanentId` is returned so a caller that must do something TO the permanent it just created can find
  // it without guessing. The Aura self-return (gy-self-attach-return) needs it to attach the Aura to its
  // named host; scanning the battlefield for a matching card id afterwards would pick the wrong copy when
  // two are in play. Additive — every existing caller destructures only {state, entered}.
  return { state: next, entered: true, permanentId: permId };
}

// Mana value of a graveyard Card (CR 202.3) — cmc/mana_value when present (Scryfall cards carry cmc), else a
// pip sum ({X}=0, generic-hybrid = its number, everything else = 1). Local leaf (zones.js can't import the
// sibling library.tutorManaValue without a cycle) — mirrors it for the REANIMATE-DRAIN MV stamp.
function reanimateCardMv(card) {
  if (typeof card?.cmc === "number") return card.cmc;
  if (typeof card?.mana_value === "number") return card.mana_value;
  let mv = 0;
  for (const sym of String(card?.mana || card?.mana_cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) continue;
    else { const lead = s.match(/^(\d+)/); mv += lead ? parseInt(lead[1], 10) : 1; }
  }
  return mv;
}

export function applyReanimate(state, atom, ctx) {
  let next = state;
  const reanimated = [];
  let lastMv = 0;
  // NO-TARGET PICK (Teval "you may return A land card from your graveyard to the battlefield tapped",
  // 2026-08-15): the article form is NOT a targeted return (CR 601.2c — nothing is targeted; the card is
  // chosen as the effect resolves), so the atom carries pickFromGraveyard instead of a targetType and the
  // pick is synthesized HERE off the live graveyard: the FIRST card matching the atom's cardFilter (a
  // deterministic house pick, the riot discipline — lands are near-fungible; a smarter pick is a
  // play-quality upgrade, never a rules question). No matching card → the loop runs zero times and the
  // resolve logs a clean no-op (the printed "may" had nothing to take).
  let picks = ctx.targets || [];
  if (!picks.length && atom.pickFromGraveyard) {
    const found = (next.players[ctx.controller]?.graveyard || []).find((c) => cardMatchesGraveyardFilter(c, atom.cardFilter));
    if (found) picks = [{ type: "graveyardCard", id: found.id }];
  }
  for (const t of picks) {
    if (t.type !== "graveyardCard") continue;
    // REANIMATE-DRAIN (Reanimate): capture the reanimated card's MV BEFORE it leaves the graveyard, so a
    // following "you lose life equal to that card's mana value" atom reads it (via state.revealedCardMV,
    // amountCount kind:"revealedCardMV") — mirrors reveal-top-to-hand's stamp. Only when the matcher set stampMv.
    if (atom.stampMv) {
      const fromPid = (atom.anyGraveyard || atom.opponentGraveyard || atom.damagedPlayerGraveyard) ? (t.controller || ctx.controller) : ctx.controller;
      const gyCard = (next.players[fromPid]?.graveyard || []).find((c) => c.id === t.id);
      if (gyCard) lastMv = reanimateCardMv(gyCard);
    }
    // "from your graveyard" → the card lives in (and is removed from) the CASTER's graveyard. "from a
    // graveyard" (anyGraveyard) / "from an opponent's graveyard" (opponentGraveyard) / "from that player's
    // graveyard" (damagedPlayerGraveyard, BLITZ SB-2 — the pool was already narrowed to the just-combat-
    // damaged player at enumeration) → it lives in the TARGET's owner graveyard (t.controller, stamped at
    // enumeration, possibly an opponent), but enters under the CASTER's control. fromPlayerId routes the
    // removal to the right graveyard; playerId (the caster) always gets the entering permanent.
    const crossZone = atom.anyGraveyard || atom.opponentGraveyard || atom.damagedPlayerGraveyard;
    const fromPlayerId = crossZone ? (t.controller || ctx.controller) : ctx.controller;
    // entersTapped (Tato Farmer's milled-land reanimate — "…onto the battlefield under your control TAPPED"):
    // rides enterCardFromZone's tapped param; every existing reanimate leaves it unset → false (byte-identical).
    const r = enterCardFromZone(next, { playerId: ctx.controller, cardId: t.id, fromZone: "graveyard", fromPlayerId, tapped: !!atom.entersTapped });
    next = r.state;
    if (r.entered) reanimated.push(t.id); // skipped (entered:false) = target left the graveyard (CR 608.2b)
  }
  if (atom.stampMv) next = { ...next, revealedCardMV: lastMv }; // for the following drain (Reanimate); 0 if no card reanimated → clean no-op drain
  return logEvent(next, { kind: "spell-effect", effect: "reanimate", controller: ctx.controller, targets: reanimated });
}

/**
 * MASS REANIMATE (CR 608) — "Return ALL <type> cards from your graveyard to the battlefield[ tapped]"
 * (Splendid Reclamation, Replenish, World Shaper, Lumra's ETB, …). The mass sibling of applyReanimate above.
 *
 * NON-TARGETED by construction, which is the whole difference: applyReanimate walks `ctx.targets` chosen at
 * cast time, and this walks the CONTROLLER'S OWN graveyard at RESOLUTION. That is why it needs the shared
 * `cardMatchesGraveyardFilter` — the same chokepoint the targeted arms use for enumeration — rather than a
 * private predicate that could drift from the filter the parser emitted.
 *
 * Each card enters via the SAME `enterCardFromZone` every reanimate and library-ramp path uses, so ETB /
 * landfall / permanent-enters triggers all fire per card exactly as they do for a single reanimate. A card
 * that fails to enter is simply skipped (entered:false), never counted.
 *
 * ⛔ AURA CARDS ARE SKIPPED, and this is a deliberate, CR-grounded false negative — the one real hazard in
 * this atom. CR 303.4f: when an effect puts an Aura onto the battlefield without specifying what it enchants,
 * its controller CHOOSES a legal object as it enters. CR 303.4g: if there is no legal object, "the Aura
 * remains in its current zone". This engine has no attach-choice for a non-targeted mass return, so entering
 * an Aura here would put it onto the battlefield attached to NOTHING — an illegal state that CR 704.5m would
 * immediately bin, i.e. a fabricated permanent. Skipping under-delivers when a legal object existed (an FN,
 * which the creed permits) and is exactly correct when none did. Replenish's own printed reminder says the
 * quiet part out loud: "(Auras with nothing to enchant remain in your graveyard.)"
 */
/**
 * MASS RETURN TO HAND (CR 608) — "Return ALL <type> cards from your graveyard to your hand" (Wisdom of Ages,
 * Crystal Chimes). The hand-destination mirror of applyMassReanimate below, and a DELIBERATE mirror in the
 * same sense `tgm` mirrors `tm` in the tutor family: same selection, different destination zone.
 *
 * TWO THINGS ARE DELIBERATELY LOOSER HERE THAN ON THE BATTLEFIELD ARM, and both follow from the destination:
 *  · NO permanent-type gate. `isPermanentReanimateFilter` exists because only a permanent card can be put onto
 *    the battlefield; a card can be put into a HAND regardless of type, so "all instant and sorcery cards"
 *    (Wisdom of Ages) is legal here and would be a forbidden fetch there.
 *  · NO Aura skip. CR 303.4f/g govern an Aura ENTERING THE BATTLEFIELD with nothing to enchant; an Aura going
 *    to hand is an ordinary zone change with no attachment to choose.
 * An unfiltered "all cards" is admitted for the same reason — moving a whole graveyard to hand fabricates
 * nothing, unlike the battlefield arm where it would be the one shape that could cheat a sorcery into play.
 */
export function applyMassReturnToHand(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  // Snapshot ids BEFORE moving: each move rewrites the graveyard, so a live re-read mid-loop would skip cards.
  const ids = (player.graveyard || [])
    .filter((c) => cardMatchesGraveyardFilter(c, atom.cardFilter))
    .map((c) => c.id);
  let next = state;
  for (const id of ids) {
    next = moveCardToZone(next, { playerId: controller, fromZone: "graveyard", toZone: "hand", cardId: id });
  }
  return logEvent(next, { kind: "spell-effect", effect: "mass-return-hand", controller, targets: ids });
}

export function applyMassReanimate(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  // Snapshot the matching ids BEFORE entering anything: entries mutate the graveyard as they go, and a live
  // re-read mid-loop would skip cards (or, with a return-to-graveyard trigger, re-enter one).
  const ids = (player.graveyard || [])
    .filter((c) => cardMatchesGraveyardFilter(c, atom.cardFilter))
    .filter((c) => !/\bAura\b/.test(String(c?.type || c?.type_line || "").split(" // ")[0])) // CR 303.4f/g — see above
    .map((c) => c.id);
  let next = state;
  const entered = [];
  for (const id of ids) {
    const r = enterCardFromZone(next, { playerId: controller, cardId: id, fromZone: "graveyard", tapped: !!atom.entersTapped });
    next = r.state;
    if (r.entered) entered.push(id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "mass-reanimate", controller, targets: entered });
}

/**
 * TUCK clause parser (migrated from parseExtendedAtom, seam batch 10 / Wave A5).
 * "put target <creature|permanent|nonland permanent|creature or land|artifact or creature|land> on (top|the
 * bottom) of its owner's library" → tuck atom (applyZoneMove → library, top/bottom). A creature restriction,
 * 3-way union, positional "Nth from the top", or any rider fails the exact anchor → low → Arbiter (clean FN).
 * LAND-TUCK (BLITZ LT-1 — Fallow Earth / Uproot spells; Rootrunner's sac-self activated): "land" joins the
 * alternation — the SAME proven machinery end to end (PERMANENT_PREDICATES.land enumeration → a
 * type:"permanent" target → applyZoneMove's library move, owner = the permanent's controller — the
 * controller-as-owner proxy every bounce/tuck uses). A scoped ("you control") / subtype ("Forest") /
 * "another target" variant fails the exact anchor → low → Arbiter (FN-safe).
 * Pure (no parser.js import — cycle-safe); normalizes the clause exactly as parseExtendedAtom does.
 */
export function tuckClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const TT = { "creature": "creature", "permanent": "permanent", "nonland permanent": "nonlandPermanent", "creature or land": "creatureOrLand", "artifact or creature": "creatureOrArtifact", "land": "land" };
  const tk = t.match(/^put target (creature or land|artifact or creature|nonland permanent|creature|permanent|land) on (top|the bottom) of its owner's library$/);
  if (tk) {
    return { op: "tuck", targetType: TT[tk[1]], where: tk[2] === "top" ? "top" : "bottom" };
  }
  // ⭐ SCOPED TUCK — the SAME atom with a target RESTRICTION, which this parser simply had no lane for. Found
  // by tier-splitting the phrase: the bare form is native on 7 carriers while "…you control" was native on
  // ZERO (Nightscape Apprentice, Sunscape Apprentice, Civic Guildmage, Shadow Guildmage) and "attacking or
  // blocking" on ZERO (Warrant // Warden, Whisk Away, Aethertow). **One missing restriction group, two
  // families** — the attacking/blocking cards are the out-of-family confirmation that the cause is the
  // parser's shape and not something particular to Guildmages.
  // ⭐ NOTHING NEW AT RUNTIME. Both restriction kinds already ship and are enforced layer-aware by
  // creatureSatisfiesRestrictions: `controller/you` and `combat/either`. atomTargetSpec's generic branch
  // already forwards `atom.restrictions`. This arm only lets the wording produce them.
  // ⛔ ONLY THE TWO EVIDENCED FORMS. Bare "attacking" / "blocking" (Condemn's family) would enforce fine —
  // the restriction kind is the same one — but every corpus carrier of those carries a rider that parks the
  // card anyway, so admitting them would claim coverage nothing can currently use. One regex away when a
  // clean carrier appears.
  const scoped = t.match(/^put target (creature or land|artifact or creature|nonland permanent|creature|permanent|land) you control on (top|the bottom) of its owner's library$/);
  if (scoped) {
    return { op: "tuck", targetType: TT[scoped[1]], where: scoped[2] === "top" ? "top" : "bottom", restrictions: [{ kind: "controller", who: "you" }] };
  }
  const combat = t.match(/^put target attacking or blocking creature on (top|the bottom) of its owner's library$/);
  if (combat) {
    return { op: "tuck", targetType: "creature", where: combat[1] === "top" ? "top" : "bottom", restrictions: [{ kind: "combat", value: "either" }] };
  }
  return null;
}

// REANIMATE PERMANENT-COMPATIBILITY (BLITZ GY-2, CR 110.4a) — a reanimate destination is the BATTLEFIELD, and
// only a PERMANENT card can be put onto the battlefield (an instant/sorcery card can't). A filtered reanimate's
// parseGraveyardFilter typeFilter is admitted ONLY when it resolves to permanent card types: "permanent" (any
// permanent type) always passes; a single type or a "|"-union passes iff EVERY member is a permanent card type.
// A lone or union-member "instant"/"sorcery" → false → the whole clause parks (never reanimates a non-permanent
// — an FP guard; no printed reanimate names instant/sorcery in this slot, but the check keeps the atom honest).
const PERMANENT_GY_TYPES = new Set(["creature", "artifact", "enchantment", "land", "planeswalker", "battle"]);
function isPermanentReanimateFilter(typeFilter) {
  if (typeFilter === "permanent") return true;
  return typeFilter.split("|").every((tok) => PERMANENT_GY_TYPES.has(tok));
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
  // "up to ONE target … card" (Cormela's dies-trigger; single-return sorceries — Lethal Protection, True
  // Ancestry, Walk with the Ancestors) is the N=1 member of the same family: singular "card", maxTargets:1,
  // minTargets:0 — the subset machinery (largest-first auto-pick) returns the one card or declines only
  // when the graveyard is empty. targeting.expandAtoms' gate admits the maxTargets:1 + minTargets:0 shape.
  const multiM = /^return up to (one|two|three|four|five) target (.*?)cards? from your graveyard to your hand$/.exec(t);
  if (multiM) {
    const n = SMALL_NUM[multiM[1]];
    const cardFilter = parseGraveyardFilter(multiM[2]);
    if (n >= 1 && cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter, maxTargets: n, minTargets: 0 };
  }
  // MODAL-GY-PAIR (BLITZ MG-1 — Return from Extinction / Raise the Draugr / Unbury, mode 2): "return two
  // target creature cards that share a creature type from your graveyard to your hand". A MANDATORY pair
  // (no "up to" — CR 601.2c requires both targets), riding the SAME return-from-graveyard resolver
  // (applyReturnFromGraveyard already loops every ctx.target). minTargets:2/maxTargets:2 →
  // targeting.expandAtoms offers ONLY size-2 subsets, and the sharesCreatureType SUBSET constraint
  // (enforced at ENUMERATION, the singleGraveyard pattern) keeps only pairs sharing a real CR 205.3m
  // creature type (a changeling is every type, CR 702.73a) — an off-type pair is never offered. The exact
  // `$` anchor rejects a different count ("three target"), a different shared property ("share a card
  // type"), another zone/destination, or any rider → null → LOW → Arbiter (FN-safe).
  if (/^return two target creature cards that share a creature type from your graveyard to your hand$/.test(t)) {
    return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature", maxTargets: 2, minTargets: 2, sharesCreatureType: true };
  }
  // RETURN-TO-HAND MV/TYPE filter (BLITZ GY-1, CR 608) — "return target <X> card with mana value N or less
  // from your graveyard to your hand": the OWN-graveyard return-to-hand (Leonin Squire, Pillardrop Rescuer,
  // Auriok Salvagers, Disciple of the Sun) NARROWED by a mana-value cap. The return-to-hand analog of PW-1's
  // reanimate-MV: a STRUCTURED cardFilter rides the SAME return-from-graveyard resolver + the ONE
  // cardMatchesGraveyardFilter chokepoint (cast / activate / trigger-flush chooser all read it, so a
  // wrong-MV / wrong-type card is NEVER offered — CR 601.2c target restriction, CR 202.3 mana value, CR
  // 712.8a a card in the graveyard has only its front-face characteristics). The SS-1 soulshift subtype
  // ("spirit" — the only word that reminder prints) keeps the {subtype, mvMax} branch; every other filter
  // <X> runs through parseGraveyardFilter → a modeled basic type / " or "-union / "permanent" / bare "card"
  // (→ "any") becomes {typeFilter, mvMax}. A subtype / color / negation / intersection ("goblin", "nonland
  // permanent", "creature or Vehicle") → parseGraveyardFilter null → the WHOLE clause stays unmodeled →
  // LOW → Arbiter (CREED whole-clause, FN-safe; never a mis-match). The exact `$` anchor rejects a count
  // ("up to two"), a dynamic cap ("lesser mana value"), another zone/destination ("to the battlefield"), or
  // any trailing rider.
  const mvHandM = /^return target (.*?)card with mana value (\d+) or less from your graveyard to your hand$/.exec(t);
  if (mvHandM) {
    const mvMax = parseInt(mvHandM[2], 10);
    const word = mvHandM[1].trim();
    if (word === "spirit") return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { subtype: "spirit", mvMax } };
    const typeFilter = parseGraveyardFilter(word);
    if (typeFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter, mvMax } };
    return null; // an unmodeled filter word → the whole clause stays unmodeled (never a mis-match)
  }
  // ANOTHER-RETURN (CR 109.5) — "return ANOTHER target <X> card from your graveyard to your hand":
  // the Myr Retriever / Junk Diver / Workshop Assistant dies-trigger (and the same clause on
  // Corpse Hauler's activated sac, Deadwood Treefolk's enters-or-leaves, Carrion Thrash's
  // pay-{2} rider). "Another" excludes the SOURCE CARD — on a dies trigger it is in that same
  // graveyard by resolution time and must never be offered as its own target.
  // `excludeTriggeringCard` rides the spec into enumeration, which drops the card matching
  // ctx.triggeringCardId (stamped by makePendingTrigger); with the referent ABSENT (the activated
  // path — targets chosen before the sacrifice is paid, CR 601.2b — or the ETB half) the source
  // card cannot be in the pool, so the exclusion deliberately no-ops (see the enumeration note).
  const anotherM = /^return another target (.*?)card from your graveyard to your hand$/.exec(t);
  if (anotherM) {
    const cardFilter = parseGraveyardFilter(anotherM[1]);
    if (cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter, excludeTriggeringCard: true };
  }
  // NO-TARGET LAND REANIMATE (Teval, 2026-08-15) — "return A land card from your graveyard to the
  // battlefield [tapped]": the ARTICLE form (no "target") is a resolution-time pick, not a targeted
  // return — the atom carries pickFromGraveyard and applyReanimate synthesizes the choice off the live
  // graveyard. LAND ONLY this slice (the printed carrier class; a wider article-form filter would need
  // its own pick policy per type). The α2 peel stamps the printed "you may" as optional exactly like
  // any other clause.
  const noTargetLand = /^return a land card from your graveyard to the battlefield( tapped)?$/.exec(t);
  if (noTargetLand) {
    return { op: "reanimate", targetType: null, pickFromGraveyard: true, cardFilter: { typeFilter: "land" }, ...(noTargetLand[1] ? { entersTapped: true } : {}) };
  }
  const gm = /^return target (.*?)card from your graveyard to your hand$/.exec(t);
  if (gm) {
    const cardFilter = parseGraveyardFilter(gm[1]);
    if (cardFilter) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter };
    // SUBTYPE RETURN (Atzocan Seer "Return target Dinosaur card from your graveyard to your hand",
    // 2026-08-15): a SINGLE creature-subtype word, validated against the closed CR vocabulary
    // (CR_CREATURE_TYPES — a zero-import leaf), rides the STRUCTURED {subtype} filter the soulshift
    // shape already enforces word-bounded at the ONE cardMatchesGraveyardFilter chokepoint. A
    // non-subtype word / multi-word phrase still nulls the whole clause (CREED FN-safe, never a mis-match).
    const word = gm[1].trim().toLowerCase();
    if (/^[a-z]+$/.test(word) && CR_CREATURE_TYPES.has(word)) {
      return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { subtype: word } };
    }
  }
  // ===== BARE REANIMATE — the filter vocabulary the MV-CAPPED arm below already has ====================
  // "Return target ARTIFACT / PERMANENT / LAND / ENCHANTMENT card from your graveyard to the battlefield."
  // This arm was hardcoded to "creature" while its own MV-capped twin (rmvM, ~15 lines down) already ran
  // every other word through parseGraveyardFilter + isPermanentReanimateFilter. Same clause family, same
  // destination, asymmetric vocabulary — so Sevinne's Reclamation #339, Titania #1135, Forge Anew #1263,
  // Daretti #1920 and ~50 more parked on a filter the file could already parse one branch away.
  //
  // ⛔ isPermanentReanimateFilter IS THE LOAD-BEARING GUARD, and it is the reason this can be widened at all:
  // a card entering the battlefield must BE a permanent, so an instant/sorcery filter or the unfiltered
  // "any" must never reach here — that would put a sorcery onto the battlefield, which no rule allows.
  // parseGraveyardFilter also returns null for a subtype / color / negation / intersection ("Rebel
  // permanent", "nonland permanent", "Aura or Equipment"), so those still park — a safe FN, and the reason
  // the phrase counts below are smaller than the raw corpus tally.
  // ===== MASS REANIMATE — "return ALL <type> cards from your graveyard to the battlefield[ tapped]" ========
  // Splendid Reclamation, Replenish, Resurgent Belief, World Shaper, Aftermath Analyst, Will of the Sultai,
  // Brilliant Restoration, Redress Fate, Primevals' Glorious Rebirth, Knights' Charge, Lumra's ETB.
  // 25 corpus carriers and not one modeled before — no mass-reanimate resolver existed at all.
  //
  // A DELIBERATE MIRROR of the targeted `rbM` arm directly below: the SAME parseGraveyardFilter vocabulary and
  // the SAME isPermanentReanimateFilter guard, differing only in being non-targeted (targetType null — the
  // graveyard is walked at resolution) and in accepting the optional " tapped".
  //
  // ⛔ isPermanentReanimateFilter STAYS LOAD-BEARING HERE and matters MORE than on the targeted arm: a mass
  // return has no cast-time enumeration to reject a bad card, so the filter is the only gate between this and
  // putting a sorcery onto the battlefield. An unfiltered "all cards" ("any") is refused for the same reason.
  //
  // A subtype / union-of-subtype filter ("Knight creature", "Zombie creature", "Nightstalker permanent",
  // "Mount and Vehicle") returns null from parseGraveyardFilter and parks the whole clause — a safe FN, and
  // the reason this arm sizes at 11 flips rather than 25.
  // ===== MASS RETURN TO HAND — "return ALL <type> cards from your graveyard to your hand" ==================
  // Wisdom of Ages ("all instant and sorcery cards"), Crystal Chimes ("all enchantment cards"). The hand
  // mirror of the battlefield arm below; see applyMassReturnToHand for why the permanent gate and the Aura
  // skip do NOT apply to a hand destination. Tried FIRST only because its anchor is disjoint — the two
  // destinations can never both match.
  //
  // "legendary creature" (Lychguard) still parks: "legendary" is a SUPERTYPE and not in the filter
  // vocabulary, so parseGraveyardFilter returns null. A safe FN, and the reason this arm is 2 cards not 3.
  const rhandM = /^return all (.*?)cards? from your graveyard to your hand$/.exec(t);
  if (rhandM) {
    const cardFilter = parseGraveyardFilter(rhandM[1].trim().replace(/\s+and\s+/g, " or "));
    if (cardFilter) return { op: "mass-return-hand", cardFilter, targetType: null };
    return null; // an unmodeled filter word → the whole clause parks
  }
  const rallM = /^return all (.*?)cards? from your graveyard to the battlefield( tapped)?$/.exec(t);
  if (rallM) {
    const word = rallM[1].trim();
    // " AND "-UNION, normalized LOCALLY (Brilliant Restoration / Redress Fate: "all artifact and enchantment
    // cards"). In this slot the printed "and" is a UNION over the card set — every artifact card AND every
    // enchantment card — not an intersection, because a MASS return names the groups it sweeps rather than
    // narrowing one object. parseGraveyardFilter only splits on " or ", so the phrase returned null and both
    // cards parked despite being sized as flips.
    //
    // ⛔ NORMALIZED HERE AND NOT IN parseGraveyardFilter, deliberately. That helper is shared with the
    // TARGETED reanimate and return-to-hand arms, where "target artifact and enchantment card" would mean a
    // SINGLE object that is both — an intersection, the opposite reading. Widening the shared helper would
    // silently change those arms' semantics; the union reading is only sound for this mass slot.
    //
    // SAFE BY CONSTRUCTION: every member still has to be a basic permanent type to survive
    // parseGraveyardFilter + isPermanentReanimateFilter below, so a subtype pair ("Mount and Vehicle") is
    // rejected exactly as before — this can only admit unions of already-legal type words.
    const unionWord = word.replace(/\s+and\s+/g, " or ");
    const typeFilter = parseGraveyardFilter(unionWord);
    if (typeFilter && typeFilter !== "any" && isPermanentReanimateFilter(typeFilter)) {
      return { op: "mass-reanimate", cardFilter: typeFilter, entersTapped: !!rallM[2], targetType: null };
    }
    return null; // unmodeled / non-permanent / unfiltered → the whole clause parks (never a mis-reanimate)
  }
  // ⭐⭐ RT-1 (2026-08-06) — the TAPPED rider ("… to the battlefield TAPPED": Helping Hand, Writ of Return,
  // Gravewaker, Undergrowth Recon and more). The resolver ALREADY honours it — applyReanimate threads
  // `atom.entersTapped` into enterCardFromZone's `tapped` param, built for Tato Farmer — and the MASS form
  // above already emits it. Only this single-target matcher was `$`-anchored with nowhere for the rider to
  // go, so every carrier parked. Thirteenth "built engine, partial ignition" of this run.
  // ⛔ AN OPTIONAL GROUP, so the bare form matches exactly as before and every existing reanimate emits a
  // byte-identical atom (`entersTapped` is only added when the rider actually matched, not as a `false`).
  const rbM = /^return target (.*?)card from your graveyard to the battlefield( tapped)?$/.exec(t);
  if (rbM) {
    const word = rbM[1].trim();
    const tap = rbM[2] ? { entersTapped: true } : {};
    if (word === "creature") return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", ...tap };
    const typeFilter = parseGraveyardFilter(word);
    if (typeFilter && typeFilter !== "any" && isPermanentReanimateFilter(typeFilter)) {
      return { op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter }, ...tap };
    }
    return null; // unmodeled / non-permanent filter → the whole clause parks (never a mis-reanimate)
  }
  // REANIMATE-MV-FILTER (BLITZ PW-1 creature — Ajani, Adversary of Tyrants "−2: Return target creature card
  // with mana value 2 or less…"; BLITZ GY-2 non-creature types — Sun Titan, Shepherd of the Cosmos "return
  // target permanent card with mana value N or less…"): the plain own-graveyard reanimate (above) NARROWED by
  // a mana-value cap. A STRUCTURED cardFilter rides the SAME applyReanimate resolver + the ONE
  // cardMatchesGraveyardFilter chokepoint (cast-time enumeration AND the trigger-flush chooser both read it, so
  // a wrong-MV / wrong-type card is NEVER offered — CR 601.2c target restriction, CR 202.3 mana value, CR
  // 712.8a a card in the graveyard has only its front-face characteristics). CREATURE keeps the PW-1
  // {cardType:"creature", mvMax} shape (pinned, byte-identical); every other <X> runs through the SAME
  // parseGraveyardFilter the return-to-hand MV filter uses (GY-1) → a modeled basic type / " or "-union /
  // "permanent" becomes {typeFilter, mvMax}, PERMANENT-COMPATIBLE only (isPermanentReanimateFilter — a card
  // entering the battlefield must be a permanent; an instant/sorcery/bare-"any" filter parks). A subtype /
  // color / negation / intersection ("Rebel permanent", "nonland permanent", "creature or Spacecraft",
  // "Aura or Equipment") → parseGraveyardFilter null → the WHOLE clause parks → LOW → Arbiter (CREED
  // whole-clause, FN-safe). The exact `$` anchor rejects every rider ("tapped", "with a +1/+1 counter", a
  // "with a finality counter" rider, an "X"/power/"lesser mana value" dynamic cap) → those stay LOW → Arbiter.
  const rmvM = /^return target (.*?)card with mana value (\d+) or less from your graveyard to the battlefield$/.exec(t);
  if (rmvM) {
    const mvMax = parseInt(rmvM[2], 10);
    const word = rmvM[1].trim();
    if (word === "creature") return { op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax } };
    const typeFilter = parseGraveyardFilter(word);
    if (typeFilter && typeFilter !== "any" && isPermanentReanimateFilter(typeFilter)) {
      return { op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter, mvMax } };
    }
    return null; // an unmodeled / non-permanent filter → the whole clause stays unmodeled (never a mis-reanimate)
  }
  // REANIMATE-FROM-ANY (CR 608) — the Reanimate-family phrasing "put target creature card from a graveyard
  // onto the battlefield under your control" (Hymn of Rebirth, Endless Obedience, Vat Emergence's first
  // clause) and the opponent-scoped "from an opponent's graveyard" (Ashen Powder). UNLIKE the own-graveyard
  // reanimate above, the card may live in ANOTHER player's graveyard (enumerated via anyGraveyard /
  // opponentGraveyard), yet always enters under the CASTER's control (applyReanimate's fromPlayerId routes
  // the removal to the target's owner). CREATURE only; "tapped" / "with a +N counter" / a life-loss /
  // indestructible / proliferate rider fails the exact `$` anchor → low → Arbiter (CREED whole-card).
  if (/^put target creature card from a graveyard onto the battlefield under your control$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true };
  if (/^put target creature card from an opponent's graveyard onto the battlefield under your control$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true };
  // DAMAGED-PLAYER REANIMATE (BLITZ SB-2, CR 608.2c "that player" back-reference) — the SABOTEUR graveyard
  // theft "put target creature card from that player's graveyard onto the battlefield under your control"
  // (Ink-Eyes, Servant of Oni; Scion of Darkness — the ONLY corpus carriers of this exact anchored shape;
  // both wrap it in the α2 "you may"). COMPOSES SB-1's damagedPlayerGraveyard pool (atomTargetSpec →
  // spellEffects.addGraveyardCards enumerates ONLY ctx.damagedPlayerId's graveyard; absent referent → EMPTY
  // pool, never a wrong graveyard) with the REANIMATE-FROM-ANY cross-zone resolver directly above
  // (applyReanimate's fromPlayerId routes the removal to the damaged player's graveyard; the permanent
  // enters under the TRIGGER CONTROLLER's battlefield — enterCardFromZone stamps `owner` so a later death
  // returns the card to its OWNER's graveyard, CR 110.2 / 404.1). The atom-level who:"damagedPlayer" pins
  // the combat referent (triggerRouting.combatDamageReferentSatisfied + coverage's spell guard): native
  // ONLY off combatDamageToPlayer — a spell / non-combat trigger carrying this clause stays Arbiter (SAFE
  // FN). Enemy-side intent (the pool holds only the damaged opponent's cards — CR 506.2a, a defending
  // player is always one of the attacking player's opponents). Exact `$` anchor — a missing creature
  // filter, a count ("up to two"), a "tapped" / counter rider, or a different controller clause → null →
  // LOW → Arbiter (FN-safe; Sepulchral Primordial / Zareth San-class variants park honestly).
  if (/^put target creature card from that player's graveyard onto the battlefield under your control$/.test(t)) {
    return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", damagedPlayerGraveyard: true, who: "damagedPlayer" };
  }
  // MILLED-LAND REANIMATE (Tato Farmer — SHELF S7): "put target land card in a graveyard that was milled
  // this turn onto the battlefield under your control tapped". The SAME cross-graveyard reanimate resolver
  // (fromPlayerId routes the removal; entersTapped rides enterCardFromZone), narrowed by the
  // milledThisTurnOnly enumeration gate (the millCards ledger, keyed to the CURRENT turn). Exact `$` anchor
  // — an untapped / non-land / non-milled variant → low → Arbiter (FN-safe).
  if (/^put target land card in a graveyard that was milled this turn onto the battlefield under your control tapped$/.test(t)) {
    return { op: "reanimate", targetType: "graveyardCard", cardFilter: "land", anyGraveyard: true, milledThisTurnOnly: true, entersTapped: true };
  }
  // GY-TO-TOP — "put target <X> card from your graveyard on top of your library" (Reclaim, Salvage, False
  // Mourning). Same chosen-graveyard-card target + the return-from-graveyard resolver, but the destination is
  // the TOP of the library (toLibraryTop → moveCardToZone toZone:"library", toTop). A rider / "the bottom" /
  // a non-self graveyard fails the `$` → low → Arbiter (FN-safe).
  const topM = /^put target (.*?)card from your graveyard on top of your library$/.exec(t);
  if (topM) {
    const cf = parseGraveyardFilter(topM[1]);
    if (cf) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: cf, toLibraryTop: true };
  }
  // NOXIOUS REVIVAL (2026-08-14) — "put target card from A graveyard on top of ITS OWNER's library":
  // the anyGraveyard twin of the arm above. applyReturnFromGraveyard already routes an anyGraveyard
  // target to the ZONE HOLDER's library (the same t.controller stamp GY-TO-BOTTOM documents), so the
  // whole card is this one arm. "its owner's" is what the holder routing implements — a card sits in
  // its owner's graveyard (CR 404.1), so holder === owner by construction.
  if (/^put target card from a graveyard on top of its owner's library$/.test(t)) {
    return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", anyGraveyard: true, toLibraryTop: true };
  }
  // ⭐ GY-TO-TOP, MULTI-COUNT (CR 601.2c "up to N") — "put up to <N> target <filter> card(s) from your
  // graveyard on top of your library" (Meldweb Curator, Biblioplex Assistant, Monastery Messenger, Runo
  // Stromkirk, Treason of Isengard, Boseiju Reaches Skyward). Found by tier-splitting the destination phrase:
  // the SINGLE-target top form directly above is native on 3+ carriers while the up-to-N wording was native
  // on ZERO — the count was the entire difference, exactly as the return-TO-HAND family already handles it.
  // ⭐ NOTHING NEW AT RUNTIME: applyReturnFromGraveyard already loops every ctx.target, and
  // targeting.expandAtoms already admits the maxTargets/minTargets:0 subset shape (the up-to-N return-to-hand
  // arm at the top of this parser is the same mechanism). This arm only says the wording out loud.
  const topMultiM = /^put up to (one|two|three|four|five) target (.*?)cards? from your graveyard on top of your library$/.exec(t);
  if (topMultiM) {
    const n = SMALL_NUM[topMultiM[1]];
    const cf = parseGraveyardFilter(topMultiM[2]);
    if (n >= 1 && cf) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: cf, toLibraryTop: true, maxTargets: n, minTargets: 0 };
  }
  // ⭐⭐ GY-TO-TOP, ANY NUMBER (CR 601.2c) — "put ANY NUMBER of target <filter> cards from your graveyard on
  // top of your library" (Footbottom Feast, Bone Harvest, Forever Young, Gravepurge).
  // ⛔ THIS WORDING WAS REFUSED UNTIL THE ENUMERATION ORDER EXISTED, and the refusal was the right call.
  // `targetSubsets` used to fill from the SMALLEST k upward against a MAX_CAST_EXPANSIONS cap, so on any real
  // graveyard "choose ALL of them" — the option these four cards exist for — was the first subset dropped.
  // Admitting the regex alone would have produced four cards that read native and played wrong. The
  // `anyNumber` flag flips the fill to largest-first (and seeds the legal empty subset), so both extremes are
  // guaranteed and only middle-sized subsets can be capped.
  // ⓘ `maxTargets: 999` rather than Infinity: targetSubsets clamps with Math.min(maxK, n) so any number ≥ the
  // graveyard size behaves identically, and a finite number stays JSON-serializable (Infinity stringifies to
  // null, which would silently become a single-target atom if a program is ever round-tripped).
  const topAnyM = /^put any number of target (.*?)cards from your graveyard on top of your library$/.exec(t);
  if (topAnyM) {
    const cf = parseGraveyardFilter(topAnyM[1]);
    if (cf) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: cf, toLibraryTop: true, maxTargets: 999, minTargets: 0, anyNumber: true };
  }
  // GY-TO-BOTTOM (BLITZ AR-1 — Cogwork Archivist / Jade-Cast Sentinel / Phyrexian Archivist / Junktroller /
  // Reito Lantern class, 14 corpus carriers): "put target card from a graveyard on the bottom of its owner's
  // library". ANY player's graveyard (anyGraveyard — the GY-EXILE scope), destination = the BOTTOM of the
  // ZONE HOLDER's library ("its owner's" — the engine's controller-as-owner proxy; t.controller is stamped at
  // enumeration, and applyReturnFromGraveyard routes both the removal and the library by it). Bottom = a plain
  // library append (moveCardToZone without toTop — library index 0 is the top). UNFILTERED "card" only: the
  // exact `$` anchor rejects a type-filtered form ("target artifact, instant, or sorcery card" — Keeper of the
  // Cadence), an "up to one [other] target" count (Swiftgear Drake / Hoarding Recluse), "your graveyard", a
  // top/hand destination, or any rider → null → LOW → Arbiter (FN-safe). NOTE atomTargetIntent: the
  // anyGraveyard flag makes a TRIGGER carrying this clause "ambiguous" → Arbiter (the reanimate-from-any
  // discipline) — only the player-driven activated/cast paths run it natively.
  if (/^put target card from a graveyard on the bottom of its owner's library$/.test(t)) {
    return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", anyGraveyard: true, toLibraryBottom: true };
  }
  // ⭐ GY-TO-BOTTOM, OWN-GRAVEYARD ("put target card from YOUR graveyard on the bottom of YOUR library" —
  // Barkform Harvester, Canal Dredger, Epitaph Golem, Tomb Trawler, Transplant Theorist, Paradox Shaper).
  // Found by tier-splitting the phrase: the any-graveyard wording directly above is native on 10 carriers
  // while this one was native on 1 and parked on 6 — the SCOPE WORDING was the entire difference, and the
  // parked wording is the SIMPLER one (own graveyard, own library, no cross-player routing at all).
  // ⓘ Nothing new in the resolver: leaving `anyGraveyard` unset makes `holder` resolve to ctx.controller,
  // which is the byte-identical path the OWN-TOP arm (17 native carriers) has always used. Only the
  // destination flag differs, and toLibraryBottom is the same one the any-graveyard arm sets.
  // ⛔ Separately anchored rather than folded into one regex with an alternation: the two forms differ in
  // WHOSE library the card goes to, and a single loosened pattern that accepted "a graveyard … your library"
  // would silently move an opponent's card into the caster's library.
  if (/^put target card from your graveyard on the bottom of your library$/.test(t)) {
    return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", toLibraryBottom: true };
  }
  // GY-EXILE — "exile target card from a graveyard" (Coffin Purge, Cremate, Purify the Grave, Fade from
  // Memory). ANY player's graveyard (anyGraveyard → enumerate every graveyard), destination exile. The exact
  // `$` anchor rejects "from your graveyard" (the caster-only forms above), "up to N"/plural, a type-filtered
  // variant, or a trailing rider → low → Arbiter (FN-safe). cardFilter "any" matches every graveyard card.
  // WHOLE-GRAVEYARD EXILE (CR 701.10a) — the graveyard-hate staple, distinct from the single-CARD
  // exile-from-graveyard family above: this exiles an ENTIRE graveyard zone, so there is no target card to
  // choose and no cardFilter. Bojuka Bog (EDHREC #24) is the most-played card the engine could not model.
  //
  // "target player's graveyard" TARGETS THE PLAYER (CR 115.4 — the player is the target, the cards are not),
  // which is why targetType is player/opponent rather than graveyardCard. "all graveyards" and "each
  // opponent's graveyard" are non-targeted sweeps and carry targetType null.
  //
  // Anchored whole-clause: a filtered variant ("exile all creature cards from all graveyards" — Rest in Peace's
  // sibling wording) does NOT match and stays low → Arbiter, because exiling the WHOLE zone for it would exile
  // cards the card never touches — the forbidden over-apply, not a safe miss (CREED).
  // BLINK / FLICKER (CR 400.7) — "Exile target creature you control, then return that card to the
  // battlefield under your control" (Cloudshift #792, Ephemerate #440, Essence Flux #928, Blur, Splash
  // Portal, Acrobatic Maneuver, Siren's Ruse — 19 corpus carriers, 0 native before this).
  //
  // Reachable only because splitClauses now keeps this sentence WHOLE: its ", then" split used to sever the
  // instruction, and the leading half ("exile target creature you control") parses HIGH on its own — so the
  // split described a card that exiles your creature and never returns it. See the keep-whole guard there.
  //
  // "under YOUR control" vs "under ITS OWNER's control" are genuinely different cards when the blinked
  // creature was stolen — the owner form hands it back. Both are parsed; `returnTo` resolves it at runtime.
  const blinkM = t.match(/^exile target creature you control, then return (?:that card|it) to the battlefield under (your|its owner's) control$/);
  if (blinkM) return { op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: blinkM[1] === "your" ? "controller" : "owner" };
  // UP-TO-TWO blink (2026-08-12 — Displace "Exile up to two target creatures you control, then return
  // those cards to the battlefield under their owner's control"): the multi-target twin of the arm
  // above. applyBlink already iterates ctx.targets, so only the enumeration bound is new
  // (maxTargets 2 / minTargets 0 — the bounce multi-form's exact shape). "their owner's" = returnTo
  // owner, the stolen-creature-goes-home semantics the single arm already resolves.
  const blink2M = t.match(/^exile up to two target creatures you control, then return those cards to the battlefield under (your|their owner's) control$/);
  if (blink2M) return { op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: blink2M[1] === "your" ? "controller" : "owner", maxTargets: 2, minTargets: 0 };
  // DISPLACER KITTEN (2026-08-14) — "exile up to one target nonland permanent you control, then return
  // that card to the battlefield under its owner's control": the up-to-ONE nonland form, and the blink
  // family's FIRST TRIGGER-side carrier (a cast trigger — Displace/Flicker are spells), which is why
  // atomTargetIntent gained its "blink" → own case in the same slice. maxTargets 1 + minTargets 0 rides
  // the same subset path as up-to-two (the [t]-or-[] expansion).
  const blink1M = t.match(/^exile up to one target nonland permanent you control, then return that card to the battlefield under (your|its owner's) control$/);
  if (blink1M) return { op: "blink", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "you" }], returnTo: blink1M[1] === "your" ? "controller" : "owner", maxTargets: 1, minTargets: 0 };
  // GHOSTLY FLICKER (2026-08-14) — "Exile two target artifacts, creatures, and/or lands you control,
  // then return those cards…": the own-side TRIPLE-UNION targetType (enumerated in spellEffects) with
  // EXACTLY two targets — minTargets 2 = maxTargets 2, the CR 601.2c exact-N discipline the
  // untap-exact-lands arm documents (one legal target ⇒ uncastable, never a half-cast).
  const blink3M = t.match(/^exile two target artifacts, creatures, and\/or lands you control, then return those cards to the battlefield under (your|their owner's) control$/);
  if (blink3M) return { op: "blink", targetType: "artifactCreatureOrLandYouControl", restrictions: [], returnTo: blink3M[1] === "your" ? "controller" : "owner", maxTargets: 2, minTargets: 2 };
  // ④-P (2026-09-03 night) — "Target player exiles a card from their graveyard." (Relic of Progenitus / Scrabbling
  // Claws / Merrow Bonegnawer): the TARGET PLAYER chooses the card (CR 601.2c targets; the choice is theirs at
  // resolution). Resolved by applyExileGraveyardPick — a milled-pick pause aimed at THAT player with toZone "exile"
  // (a human target picks on the panel; the AI target auto-picks its least valuable card). Whole-clause anchored:
  // Graveyard Shovel's "If it's a creature card, you gain 2 life." rider falls through → Arbiter.
  if (/^target player exiles a card from their graveyard$/.test(t)) return { op: "exile-graveyard-pick", who: "target", targetType: "player" };
  if (/^exile target player's graveyard$/.test(t)) return { op: "exile-graveyard", who: "targetPlayer", targetType: "player" };
  if (/^exile target opponent's graveyard$/.test(t)) return { op: "exile-graveyard", who: "targetPlayer", targetType: "opponent" };
  if (/^exile all graveyards$/.test(t)) return { op: "exile-graveyard", who: "eachPlayer", targetType: null };
  if (/^exile each opponent's graveyard$/.test(t)) return { op: "exile-graveyard", who: "eachOpponent", targetType: null };
  if (/^exile target card from a graveyard$/.test(t)) return { op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" };
  // ⭐⭐ GX-2 (2026-08-06) — the FILTERED form ("exile target CREATURE card from a graveyard" — Shamble Back,
  // Vile Rebirth, Cemetery Reaper, Thraben Heretic, Selesnya Eulogist, Necrogenesis). Everything this needs
  // already existed: the `exile-from-graveyard` atom, `applyExileFromGraveyard`, and the shared
  // `cardFilter` vocabulary that `cardMatchesGraveyardFilter` enforces at ENUMERATION. Only the bare-noun
  // matcher above was reachable, so any filter parked the card.
  // ⭐ THE VERB WAS THE WHOLE TIER SPLIT, which is what made this findable: `return … from a graveyard` is
  // native on 53+28 carriers while `exile … from a graveyard` was 25 carriers and ONE native. Identical
  // shape, identical filter vocabulary, one verb never wired.
  // ⛔ `parseGraveyardFilter` is REUSED rather than re-implemented, so the exile lane and the return lane
  // cannot drift into two different ideas of what "creature card" means — and an unmodeled filter word
  // returns null here, parking the card (FN-safe) instead of exiling the wrong card.
  const gxM = /^exile target (.*?)cards? from (a|your|an opponent's) graveyard$/.exec(t);
  if (gxM) {
    const cardFilter = parseGraveyardFilter(gxM[1]);
    if (cardFilter) {
      const zone = gxM[2];
      return { op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter,
        ...(zone === "a" && { anyGraveyard: true }),
        ...(zone === "an opponent's" && { opponentGraveyard: true }) };
    }
  }
  // GY-EXILE-UP-TO-THREE (BLITZ GX-1 — Decompose / Rapid Decay / Scarab Feast): "exile up to three target
  // cards from a single graveyard." The up-to-N subset machinery + the singleGraveyard SUBSET constraint
  // (targeting.expandAtoms filters to subsets whose cards share ONE owner — the totalMvX pattern), so a
  // mixed-graveyard pick is never offered (CR 601.2c — the chosen set must satisfy the restriction).
  if (/^exile up to three target cards from a single graveyard$/.test(t)) {
    return { op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any", maxTargets: 3, minTargets: 0, singleGraveyard: true };
  }
  // GY-EXILE-OPPONENT — "exile target card from an opponent's graveyard" (Disposal Mummy, Leonin of the Lost
  // Pride, Disruptor Wanderglyph). Opponent-scoped (opponentGraveyard → enumerate only opponents' graveyards),
  // destination exile. Reuses applyExileFromGraveyard's cross-zone move (it already handles opponentGraveyard,
  // like Ashen Powder's reanimate above) — only the parser form was missing. Same `$`-anchored FN-safe rejection.
  if (/^exile target card from an opponent's graveyard$/.test(t)) return { op: "exile-from-graveyard", targetType: "graveyardCard", opponentGraveyard: true, cardFilter: "any" };
  // GY-EXILE-DAMAGED-PLAYER (BLITZ SB-1, CR 608.2c "that player" back-reference) — the SABOTEUR graveyard-hate
  // payoffs "exile target card from that player's graveyard" (Zombie Cannibal, optional via the α2 "you may"
  // peel) and "exile up to two target cards from that player's graveyard" (Skullsnatcher). The graveyard scope
  // is the JUST-COMBAT-DAMAGED player's (ctx.damagedPlayerId, threaded by triggers.checkCombatDamageTriggers):
  // damagedPlayerGraveyard rides atomTargetSpec → spellEffects.addGraveyardCards, which pools ONLY that
  // player's graveyard (absent referent → empty pool). The atom-level who:"damagedPlayer" pins the combat
  // referent (triggerRouting.combatDamageReferentSatisfied) so the trigger routes natively ONLY off
  // combatDamageToPlayer — a spell / non-combat trigger carrying this clause stays Arbiter (SAFE FN). The
  // up-to-two form reuses the maxTargets subset machinery (targeting.expandAtoms, largest subset first at
  // flush; minTargets:0 — "up to" permits zero, CR 601.2c). Exact `$` anchors — a different count, a type
  // filter, another zone, or any rider → null → LOW → Arbiter (FN-safe).
  if (/^exile target card from that player's graveyard$/.test(t)) {
    return { op: "exile-from-graveyard", targetType: "graveyardCard", damagedPlayerGraveyard: true, cardFilter: "any", who: "damagedPlayer" };
  }
  if (/^exile up to two target cards from that player's graveyard$/.test(t)) {
    return { op: "exile-from-graveyard", targetType: "graveyardCard", damagedPlayerGraveyard: true, cardFilter: "any", maxTargets: 2, minTargets: 0, who: "damagedPlayer" };
  }
  // GY-SHUFFLE-IN (BLITZ GS-1, CR 701.24) — two anchored forms sharing one resolver:
  //   PLAYER form — "target player shuffles up to <N> target cards from their graveyard into their library"
  //     (N=2 Krosan Reclamation, N=3 Memory's Journey / Gaea's Blessing / Quandrix Command's mode, N=4 Dwell
  //     on the Past / Stream of Consciousness / Witness the Future / Rite of Renewal — the count vocabulary
  //     is corpus-evidenced). TWO DEPENDENT target dimensions: ONE chosen player + an up-to-N subset of
  //     cards drawn FROM THAT PLAYER'S graveyard ("their"). The dependency is enforced BY CONSTRUCTION at
  //     enumeration (targeting.expandAtoms' gyFromTargetPlayer branch pairs each candidate player ONLY with
  //     subsets of their own graveyard — a cross-player pairing is never enumerated, CR 601.2c).
  //   SELF form — "shuffle up to <N> target cards from your graveyard into your library" (N=1 Put Away,
  //     N=4 Cathartic Parting / Devious Cover-Up, N=5 Wand of Vertebrae's activated) — no player target
  //     (the controller), riding the EXISTING own-graveyard subset machinery (maxTargets/minTargets:0).
  // Both: cards only ("cards?" — token exclusion at enumeration), unfiltered. The exact `$` anchors reject
  // a mandatory count (no "up to"), a filtered form, "a graveyard"/cross-zone scopes, or riders → LOW →
  // Arbiter (FN-safe). atomTargetIntent: the op takes the AMBIGUOUS default, so a TRIGGER carrying either
  // form (Covetous Castaway's ETB) routes to the Arbiter — only player-driven cast/activated paths run it.
  const shufP = /^target player shuffles up to (one|two|three|four|five) target cards? from their graveyard into their library$/.exec(t);
  if (shufP) {
    const n = SMALL_NUM[shufP[1]];
    if (n >= 1) return { op: "gy-shuffle-into-library", targetType: "player", gyFromTargetPlayer: true, maxTargets: n, minTargets: 0 };
  }
  const shufS = /^shuffle up to (one|two|three|four|five) target cards? from your graveyard into your library$/.exec(t);
  if (shufS) {
    const n = SMALL_NUM[shufS[1]];
    if (n >= 1) return { op: "gy-shuffle-into-library", targetType: "graveyardCard", cardFilter: "any", maxTargets: n, minTargets: 0 };
  }
  return null;
}

/**
 * GY-SHUFFLE-IN resolver (GS-1, CR 701.24) — move each chosen card from the SUBJECT player's graveyard into
 * that player's library, then SHUFFLE that library. The subject is the chosen player target (the PLAYER
 * form) or the controller (the SELF form — no player target in ctx.targets). CR 608.2b fail-safe (the
 * incumbent per-target discipline): a chosen card that already left the graveyard is skipped, never a
 * throw. CR 701.24c/d: the library is shuffled EVEN IF some or all of the chosen cards are gone — and even
 * if the chosen set was empty ("up to" zero, a legal cast) — so the shuffle is unconditional. The shuffle
 * is the deterministic rngSeed shuffle (shuffleControllerLibrary — serialize-stable, no Math.random).
 * Hidden-info safe: graveyards are public, and the shuffle randomizes a hidden zone's ORDER only.
 */
export function applyGyShuffleIntoLibrary(state, atom, ctx) {
  const playerT = (ctx.targets || []).find((t) => t.type === "player");
  const pid = playerT ? playerT.id : ctx.controller;
  if (!state.players?.[pid]) {
    return logEvent(state, { kind: "spell-effect", effect: "gy-shuffle-into-library", controller: ctx.controller, player: pid, targets: [], reason: "player-missing" });
  }
  let next = state;
  const shuffledIn = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const gy = next.players[pid]?.graveyard || [];
    if (!gy.some((c) => c.id === t.id)) continue; // left the graveyard — a logged no-op (CR 608.2b)
    next = moveCardToZone(next, { playerId: pid, fromZone: "graveyard", toZone: "library", cardId: t.id });
    shuffledIn.push(t.id);
  }
  next = shuffleControllerLibrary(next, pid); // CR 701.24c/d — shuffle even when zero cards moved
  return logEvent(next, { kind: "spell-effect", effect: "gy-shuffle-into-library", controller: ctx.controller, player: pid, targets: shuffledIn });
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
  // EXACT-N joined 2026-08-14 (Step Through — "Return TWO target creatures to their owners' hands"):
  // without "up to", minTargets = maxTargets = N (CR 601.2c, the untap-exact-lands / Ghostly Flicker
  // discipline — one legal creature ⇒ the spell is UNCASTABLE, never a half-cast). The up-to form is
  // byte-identical (minTargets 0).
  const multiB = t.match(/^return (up to )?(two|three|four|five) target (creatures|nonland permanents|permanents|artifacts|enchantments|lands)(?: (an opponent controls|you don't control|you control))? to their owners' hands$/);
  if (multiB) {
    const TTm = { "creatures": "creature", "permanents": "permanent", "nonland permanents": "nonlandPermanent", "artifacts": "artifact", "enchantments": "enchantment", "lands": "land" };
    const n = SMALL_NUM[multiB[2]];
    const restrictions = multiB[4] ? [{ kind: "controller", who: /^you control$/.test(multiB[4]) ? "you" : "opponent" }] : [];
    if (n >= 2) return { op: "bounce", targetType: TTm[multiB[3]], restrictions, maxTargets: n, minTargets: multiB[1] ? 0 : n };
  }
  // "return target creature[ you control | an opponent controls | you don't control | that player controls]
  // to its owner's hand" (Chulane, Teller of Tales's {3},{T} bounce). Mirrors the non-creature `bp` branch
  // below's OPTIONAL controller restriction; the plain unrestricted form (no clause) is byte-identical to
  // before. legalChoices' creature-target enumeration honors the { kind:"controller" } restriction exactly
  // as it does for the nonland-permanent bounce.
  // DAMAGED-PLAYER bounce (BLITZ SB-1, CR 608.2c "that player" back-reference) — the SABOTEUR payoff
  // "return target creature that player controls to its owner's hand" (Mistblade Shinobi's combat-damage
  // trigger; Sigil of Sleep's aura form). The exact mirror of removal.js's damagedPlayer destroy scope:
  // (a) a controller restriction who:"damagedPlayer" the enumerator resolves against ctx.damagedPlayerId
  // (creatureSatisfiesRestrictions — absent referent → empty pool), AND (b) an atom-level who:"damagedPlayer"
  // so the combat-referent gate (triggerRouting.combatDamageReferentSatisfied / coverage's spell guard) pins
  // the bounce to combatDamageToPlayer — on any other event (a spell, an ETB) the referent is unset → not
  // native there (a SAFE FN, never a mis-scoped bounce).
  // ⚠️ BOTH SPELLINGS — the DT-2 sentinel renames "target creature that player controls" to "…the damaged
  // player controls" on combat-damage triggers, and this matcher spelled the old name out. Arm with Aether
  // (which GRANTS a quoted combat-damage trigger carrying exactly this clause) fell out of native the
  // moment the rewrite landed. Same cause as the Rhystic Study family and Smothering Tithe: **a rewrite is
  // a rename, and every reader that spelled the old name out breaks silently.** One vocabulary, both forms.
  // ⭐⭐ BS-1 (2026-08-06) — the STATE QUALIFIER group ("tapped"/"attacking"/"blocking"), added the same way
  // and for the same reason as the SCOPED TUCK above: the atom and the restriction kinds already existed,
  // this parser simply had no lane for them. Found by tier-splitting the bounce noun — the bare form is
  // native on 53 carriers while "tapped creature" was native on ZERO (Selkie Hedge-Mage, Spellweaver Duo,
  // Harbinger of the Tides, Surrakar Banisher, Select for Inspection) and "attacking creature" on ZERO
  // (Champion's Victory, Remove). ⭐ Two families, one missing group — and the attacking/blocking cards are
  // the OUT-OF-FAMILY confirmation that the cause is this parser's shape rather than anything about tapped
  // permanents (gate 20).
  // The qualifier composes with the existing controller scope (Harbinger of the Tides, Point to the
  // Scoreboard: "target tapped creature an opponent controls"), which is why it is its own group in front
  // of the noun rather than more alternatives inside the scope group.
  // ⭐ CV-3 (2026-08-06) — the noun becomes an alternation so "creature or Vehicle" rides the SAME matcher
  // (Bounce Off, Roadside Blowout). CR 301.7: an uncrewed Vehicle is not a creature, so the union reaches a
  // permanent the bare noun cannot. `creatureOrVehicle` and its enumeration path already exist (CV-1 lit
  // removal, CV-2 the counter lane) — this is the bounce lane's ignition, not new machinery.
  // ⛔ THE NOUN GROUP IS OPTIONAL-SUFFIX, NOT A FULL ALTERNATION OF THE WHOLE NOUN, so `creature` alone
  // still matches exactly as before and every incumbent form emits a byte-identical atom (pinned).
  // SUBTYPE bounce (2026-08-12 — Vedalken Aethermage "return target Sliver to its owner's hand"): a
  // CURATED subtype set, one entry per measured carrier (TF-1 — a generic capitalized-word capture would
  // swallow non-subtype nouns). Emits the creature targetType + the SAME kind:"subtype" restriction the
  // targeting evaluator (creatureRestrictions) already enforces — one evaluator, no new machinery.
  const BOUNCE_SUBTYPES = { sliver: "Sliver" };
  const subB = t.match(/^return target ([a-z]+) to its owner's hand$/);
  if (subB && BOUNCE_SUBTYPES[subB[1]]) {
    return { op: "bounce", targetType: "creature", restrictions: [{ kind: "subtype", subtype: BOUNCE_SUBTYPES[subB[1]] }] };
  }
  // VENSER (2026-08-14 — "return target spell or permanent to its owner's hand"): the STACK∪BATTLEFIELD
  // union. The resolver lives in stack.js (applyBounceSpellOrPermanent — the layering is {zones} <-
  // removal <- stack, so only stack may reach both counterSpellById and applyZoneMove). `notCounter`
  // rides the atom into enumeration: a bounce is NOT a counter (CR 701.6a), so the stack-spell pool must
  // NOT exclude uncounterable spells — Venser bounces what Counterspell cannot touch.
  if (/^return target spell or permanent to its owner's hand$/.test(t)) {
    return { op: "bounce-spell-or-permanent", targetType: "spellOrPermanent", notCounter: true };
  }
  const cb = t.match(/^return (another )?target (tapped |attacking |blocking )?creature( or vehicle)?(?: (an opponent controls|you don't control|you control|that player controls|the damaged player controls))? to its owner's hand$/);
  if (cb) {
    const who = /^you control$/.test(cb[4] || "") ? "you"
      : /^that player controls$/.test(cb[4] || "") ? "damagedPlayer"
      : "opponent";
    // "ANOTHER" (CR 109.5 — Icefeather Aven, Exit Specialist): same target class, source excluded. See the
    // fail-closed note on the permanent form below.
    const another = cb[1] ? [{ kind: "notSource" }] : [];
    // BS-1 — the SAME restriction kinds the removal lane emits, so one evaluator serves both.
    const q = (cb[2] || "").trim();
    const state = q === "tapped" ? [{ kind: "tapped", value: true }]
      : q ? [{ kind: "combat", value: q }] : [];
    const restrictions = [...(cb[4] ? [{ kind: "controller", who }] : []), ...state, ...another];
    // CV-3 — the union targetType when the noun suffix matched; otherwise byte-identical to before.
    const targetType = cb[3] ? "creatureOrVehicle" : "creature";
    if (!restrictions.length) return { op: "bounce", targetType };
    const atom = { op: "bounce", targetType, restrictions };
    if (cb[4] && who === "damagedPlayer") atom.who = "damagedPlayer";
    return atom;
  }
  // "ANOTHER" (CR 109.5 — Aether Channeler #1526's bounce mode, Rushing River, Jace the Living Guildpact):
  // the same targeted bounce, excluding the SOURCE permanent. Reuses the `notSource` restriction the untap
  // family already carries, so the exclusion is one implementation rather than two.
  //
  // ⚠️ notSource FAILS CLOSED when ctx.sourceId is unknown — the pool comes back EMPTY rather than wrongly
  // including the source. That is the right default, and it also means the qualifier is only safe to emit
  // where the source id genuinely reaches target enumeration. The runtime pin in anotherTargetBounce.test.js
  // exercises the real ETB-trigger path for exactly that reason; a parse-only test would have proved nothing
  // about whether the mode has any targets at all.
  //
  // ⭐ THE NOUN LIST IS THE ONLY THING THAT WAS NARROW — "planeswalker" and the two UNIONS were sayable to
  // `destroy` (which emits targetType planeswalker / creatureOrPlaneswalker / artifactOrEnchantment) and to
  // the graveyard-recursion sibling ("return target artifact or enchantment CARD from your graveyard"), but
  // not here. enumerateTargets has always understood all three, and `return target PERMANENT to its owner's
  // hand` — already native — demonstrably bounces a planeswalker today, so there was never a runtime question
  // about whether a planeswalker can be returned: only about whether the sentence could be said. Added on
  // that evidence, with no new targetType invented.
  // LANDS-TIER slice 5 (Otawara, Soaring City): the FOUR-type union. Deliberately its own targetType rather
  // than "nonland permanent" — that would also admit a Battle, which Otawara cannot target (an over-claim).
  if (/^return target artifact, creature, enchantment, or planeswalker to its owner's hand$/.test(t)) {
    return { op: "bounce", targetType: "artifactCreatureEnchantmentOrPlaneswalker", restrictions: [] };
  }
  const bp = t.match(/^return (another )?target (nonland permanent|permanent|artifact or enchantment|creature or planeswalker|artifact|enchantment|land|planeswalker)(?: (an opponent controls|you don't control|you control))? to its owner's hand$/);
  if (bp) {
    const TT = {
      "permanent": "permanent", "nonland permanent": "nonlandPermanent", "artifact": "artifact",
      "enchantment": "enchantment", "land": "land", "planeswalker": "planeswalker",
      // ⚠️ THE UNIONS ARE LISTED BEFORE THEIR OWN PREFIXES FOR READABILITY, NOT FOR CORRECTNESS — and that
      // distinction was MEASURED, not assumed. I first wrote that the order was load-bearing (first-match
      // alternation would match bare "artifact" and silently drop the enchantment half); mutating the order
      // to prove it left all 13 tests GREEN. The whole-clause `$` anchor is what actually protects it: bare
      // "artifact" leaves " or enchantment" before "to its owner's hand", the match fails, and the engine
      // backtracks into the longer alternative. Keep the order anyway — it reads correctly and costs nothing
      // — but do NOT rely on ordering here as though it were the guard.
      "artifact or enchantment": "artifactOrEnchantment", "creature or planeswalker": "creatureOrPlaneswalker",
    };
    const restrictions = bp[3] ? [{ kind: "controller", who: /^you control$/.test(bp[3]) ? "you" : "opponent" }] : [];
    if (bp[1]) restrictions.push({ kind: "notSource" });
    return { op: "bounce", targetType: TT[bp[2]], restrictions };
  }
  // SELF-BOUNCE (forced, own-choice) — "return a[nother] permanent|creature you control to its owner's hand"
  // (Kor Skyfisher / Emancipation Angel / Cache Raiders ETB · Roaring Primadox / Shrieking Drake upkeep/ETB ·
  // Yarok's Wavecrasher "another"). NON-targeted: the controller MUST return one of their OWN permanents (a real
  // drawback), modeled scope-side (oneYouControlWorst → worstOwnBounceTarget picks the least-bad at resolution)
  // rather than as a chosen target — so programNeedsChosenTarget is false and the ETB/upkeep TRIGGER routes
  // natively. "another" (CR 109.5) drops the source; "creature" restricts to creatures. Disjoint anchor from the
  // "return TARGET …" chosen-target forms above → no overlap.
  // ⭐⭐ LB-1 (2026-08-06) — `land` joins the noun alternation, which is the KAROO cycle: Selesnya Sanctuary,
  // Azorius Chancery, Simic Growth Chamber, Golgari Rot Farm, Izzet Boilerworks, Rakdos Carnarium and the
  // rest, plus Tazeem Raptor / Sutina / Wayward Guide-Beast on the "you may" wrapper. Everything else was
  // already here — `oneYouControlWorst`, `worstOwnBounceTarget`, the optional wrapper — so this is a noun
  // and a filter flag, not machinery.
  // ⭐⭐ SIXTEEN CARDS IN PLAY, FIVE VISIBLE TO THE METRIC. `classifyCard` short-circuits every Land to the
  // `land` tier, so the 11 KAROO bounce-lands (Selesnya Sanctuary, Azorius Chancery, Simic Growth Chamber,
  // Golgari Rot Farm, Izzet Boilerworks, Rakdos Carnarium …) count the same before and after — but their
  // ETB bounce genuinely works now. Verified end to end, and pinned in landBounceScope.test.js.
  // ⚠️⚠️ AN EARLIER DRAFT OF THIS COMMENT SAID THE OPPOSITE — that land ETB triggers never fire, so the
  // Karoos were dead weight. That was a HARNESS artifact and it is worth naming here because the same trap
  // is one line away from anyone editing this file: `applyPlayLand` puts the ETB into `pendingTriggers`,
  // which flushes on the next PRIORITY PASS. A probe that reads `state.stack` straight after the land drop
  // sees an empty stack, which is correct and means nothing.
  const selfB = t.match(/^return (a|another) (permanent|creature|land) you control to its owner's hand$/);
  if (selfB) {
    return { op: "bounce", scope: "oneYouControlWorst",
      ...(selfB[2] === "creature" ? { creatureOnly: true } : {}),
      ...(selfB[2] === "land" ? { landOnly: true } : {}),
      ...(selfB[1] === "another" ? { excludeSource: true } : {}) };
  }
  // "return up to one [other] target permanent|creature you control to its owner's hand" (Stickytongue Sentinel
  // / Exosuit Savior / Mischievous Pup ETB). The SAME worst-pick self-bounce, but "up to one" makes it OPTIONAL
  // (the controller may bounce ZERO — atom.optional pauses for a real yes/no at runProgram.js), and "other"
  // (CR 109.5) drops the source. The printed "target" is auto-picked sensibly (least-bad own permanent); the
  // "up to one" optionality is the load-bearing faithfulness (never forces a bounce the card leaves optional).
  const uptoB = t.match(/^return up to one (other )?target (permanent|creature|land) you control to its owner's hand$/);
  if (uptoB) {
    return { op: "bounce", scope: "oneYouControlWorst", optional: true,
      ...(uptoB[2] === "creature" ? { creatureOnly: true } : {}),
      ...(uptoB[2] === "land" ? { landOnly: true } : {}),   // LB-1
      ...(uptoB[1] ? { excludeSource: true } : {}) };
  }
  // SELF-BOUNCE — "return this <self-noun> to its owner's hand". The self-target atom bounces the SOURCE, so
  // the noun is pure templating: an Aura/Enchantment/Artifact/Equipment says it exactly the way a creature
  // does. Census 2026-07-25 found the Aura wording as a 12-card sole-blocker across two cost shapes
  // (Shackles / Cage of Hands' "{W}: Return this Aura to its owner's hand") purely because the alternation
  // was creature|permanent — the atom, the resolver and the bounce path all already handled it.
  if (/^return this (?:creature|permanent|aura|enchantment|artifact|equipment|land) to its owner's hand$/.test(t)) return { op: "bounce", target: "self" };
  // ⭐ SELF-TUCK — "put this <self-noun> on top of its owner's library" (Sensei's Divining Top #226, Argothian
  // Wurm, Shivan Wumpus, Thalakos Mistfolk, Fencer Clique, Wayward Soul). The EXACT sibling of the self-bounce
  // directly above: same self referent, same zone-move resolver, one zone over. `tuck` already had a chosen-
  // TARGET form (line ~310) and `bounce` already had a SELF form — the one combination nobody had written was
  // tuck+self, so six cards sat parked on a cell of a two-by-two grid whose other three cells were built.
  // The noun is pure templating (the atom moves the SOURCE), so the alternation mirrors self-bounce's exactly.
  // ⛔ TOP ONLY: every corpus carrier says "on top of"; a bottom-of-library self form is not a printed shape
  // here, so it is not invented. applyZoneMove already accepts the {type:"permanent"} entry selfTargets hands
  // back for a non-creature source (the same path the regenerate slice verified), so no resolver change.
  if (/^put this (?:creature|permanent|aura|enchantment|artifact|equipment|land) on top of its owner's library$/.test(t)) return { op: "tuck", target: "self", where: "top" };
  if (/^return the triggering creature to its owner's hand$/.test(t)) return { op: "bounce", target: "thatCreature" };
  // SUBTYPE-CREATURE-BOUNCE (CR 205.3m) — "return target <Subtype> you control to its owner's hand" (Kogla,
  // the Titan Ape's activated ability "{1}{G}, …: Return target Human you control to its owner's hand"). The
  // bare-"creature" bounce (matcher 1) has no controller/subtype filter and the `bp` matcher deliberately
  // excludes creature-typed targets, so a subtype-scoped, you-control creature bounce needs its own anchor.
  // Modeled as a bounce/creature atom carrying BOTH a subtype restriction (creatureSatisfiesRestrictions
  // kind:"subtype", a word-bounded type-line match) AND a you-control controller restriction — the enumerator
  // then offers ONLY the controller's own creatures of that subtype. The subtype must be in the CURATED,
  // collision-free allowlist below (a word that appears verbatim ONLY in the subtype portion of a type line —
  // no left-of-dash collision), so the `\b<subtype>\b` match selects exactly the subtyped creatures; a non-
  // curated word fails → null → low → Arbiter (CREED: never a fabricated/mis-scoped bounce).
  const sb = t.match(/^return target ([a-z][a-z-]*) you control to its owner's hand$/);
  if (sb) {
    const sub = BOUNCE_TARGET_SUBTYPES[sb[1]];
    if (sub) return { op: "bounce", targetType: "creature", restrictions: [{ kind: "subtype", subtype: sub }, { kind: "controller", who: "you" }] };
  }
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
  // ⭐ FILTERED MASS BOUNCE, delegated — the third verb onto the shared 16-kind restriction grammar, after
  // damage and destroy/exile. Inundate ("all nonblue creatures"), Aetherize ("all attacking creatures"),
  // Part the Veil ("all creatures you control"). Placed AFTER the two exact matchers so both stay
  // byte-identical, and it peels "all" + singularizes for the same two reasons the removal arm documents —
  // the grammar's filler list has "each" but not "all", and its entry gate is `\bcreature\b`, which a plural
  // noun silently fails in a way that looks exactly like "this card has no filters".
  // ⚠️ BOTH POSSESSIVE FORMS. The bundled oracle prints the FILTERED mass bounces with the SINGULAR
  // "to their owner's hand" (Aetherize, Part the Veil) while the bare wipe above uses the plural
  // "their owners' hands". Anchoring on the plural alone measured ONE flip against a prediction of three,
  // and the two misses turned out to differ from the anchor by an apostrophe — not by a mechanism.
  const bf = t.match(/^return all (.+?) to (?:their owners' hands|their owner's hand|its owner's hand)$/);
  if (bf && /\bcreature/.test(bf[1])) {
    const phrase = bf[1].replace(/^all /, "").replace(/\bcreatures\b/, "creature");
    const { restrictions, clean } = parseCreatureTargetRestrictions({ oracle: `~ deals 1 damage to each ${phrase}` });
    if (clean && restrictions.length) return { op: "bounce", targetType: "eachCreature", restrictions };
  }
  // MASS-OPPONENT-BOUNCE (Scourge of Fleets) — "return each creature your opponents control[ with toughness X or
  // less] to its owner's hand[, where X is <board count>]". A NON-targeted mass bounce scoped to the OPPONENTS'
  // creatures, gathered AT RESOLUTION (targetType:"eachOpponentCreature" → atomTargets → opponentCreatureTargets;
  // each card moves to its OWN owner's hand). TWO forms:
  //   • bare "return each creature your opponents control to its owner's hand" — every opponent creature.
  //   • toughness-bounded "…with toughness X or less…, where X is <count>" — the entering-creature filter's upper
  //     bound X is a board COUNT (parseCountSource, e.g. "Islands you control"). The count is bound to the atom
  //     (toughnessAtMostCount) and resolved at RESOLUTION against the controller's board (CR 608.2h — layer-aware
  //     via creatureToughness), so a creature buffed above X is spared. An UNMODELED count source (a non-curated
  //     "where X is …") → null → low → Arbiter (CREED: never a silently mis-scoped sweep). ANCHORED to the exact
  //     "your opponents control" scope so the you-control/no-scope bounces above are untouched.
  if (/^return each creature your opponents control to its owner's hand$/.test(t)) {
    return { op: "bounce", targetType: "eachOpponentCreature" };
  }
  const tb = t.match(/^return each creature your opponents control with toughness x or less to its owner's hand, where x is the number of (.+)$/);
  if (tb) {
    const count = parseCountSource(tb[1]);
    if (count) return { op: "bounce", targetType: "eachOpponentCreature", toughnessAtMostCount: count };
  }
  return null;
}

// SUBTYPE-CREATURE-BOUNCE — CURATED creature subtypes that appear after "return target <X> you control to its
// owner's hand" in the corpus (Kogla "Human"; Riptide Laboratory "Wizard"; Walker of Secret Ways "Ninja"; Ally
// Encampment "Ally"; Spectral Shepherd "Spirit"). Each is a word that occurs verbatim ONLY in the subtype
// portion of a type line (verified zero left-of-dash collisions against the bundled corpus), so the word-bounded
// \b match in creatureSatisfiesRestrictions (kind:"subtype") selects exactly the subtyped creatures (CR 205.3m).
// CURATED (not generic) per the CREED — a color / card type / "creature" / "permanent" (those already route via
// the bare + `bp` matchers) can never reach the restriction. Keys are LOWERCASE (the regex lowercases the clause).
const BOUNCE_TARGET_SUBTYPES = {
  human: "Human", wizard: "Wizard", ninja: "Ninja", ally: "Ally", spirit: "Spirit",
};

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

/**
 * EARTHBEND-RETURN (CR 603.7 delayed triggered ability) — the "When it dies or is exiled, return it to the
 * battlefield tapped" rider earthbend grants the animated land. The rider is NOT in the card's own oracle (it's
 * a keyword-action grant on an arbitrary land), so it can't be a detected trigger — combat.applyEarthbend tags
 * the land `earthbendReturn:true`, and triggers.checkLeavesTriggers synthesizes this delayed trigger off the flag
 * when the land leaves to a GRAVEYARD (dies) or EXILE (never a bounce to hand / tuck to library). The marker
 * carries the source zone so the card is pulled from the right place.
 *
 * Returns the card as a PLAIN LAND, TAPPED: the animation was continuous effects keyed to the OLD permanent id,
 * gone with the old object, so enterCardFromZone re-creates it as its printed land. Entering a land fires ETB +
 * LANDFALL (a returning land IS a land-entry — e.g. Toph's own "whenever a land you control enters" experience
 * counter), faithfully matching the printed rider's battlefield entry. CR 111.7 — a token ceased to exist, never
 * returns (guarded via ctx.triggeringCardIsToken). CR 608.2b — a card that already left the source zone is a
 * logged no-op (enterCardFromZone → entered:false), never a fabricated permanent.
 */
const EARTHBEND_RETURN_RE = /^\[earthbend-return:(graveyard|exile)\] return it to the battlefield tapped$/i;
export function earthbendReturnClauseParser(clause) {
  const m = EARTHBEND_RETURN_RE.exec(String(clause || "").trim());
  return m ? { op: "earthbend-return", fromZone: m[1].toLowerCase() } : null;
}
export function applyEarthbendReturn(state, atom, ctx) {
  const owner = ctx.triggeringController;
  const cardId = ctx.triggeringCardId;
  if (!owner || !cardId || !state.players?.[owner]) return state;
  if (ctx.triggeringCardIsToken) {
    return logEvent(state, { kind: "spell-effect", effect: "earthbend-return", returned: false, reason: "token", controller: owner });
  }
  const fromZone = atom.fromZone === "exile" ? "exile" : "graveyard";
  const { state: next, entered } = enterCardFromZone(state, { playerId: owner, cardId, fromZone, tapped: true });
  return logEvent(next, { kind: "spell-effect", effect: "earthbend-return", returned: entered, controller: owner });
}

/**
 * DETAIN (BLITZ DT-1, CR 610.3 — Banishing Light / Banisher Priest / Journey to Nowhere-modern): "exile
 * <target> until this <enchantment|creature> leaves the battlefield." The exile is LINKED to the SOURCE
 * permanent: each exiled card's {cardId, ownerId} is stamped onto the source's `detainedExile` (plain JSON —
 * serialize→restore replays; gameState.recordLeaveEvent carries it onto the leave look-back, and
 * triggers.checkLeavesTriggers synthesizes the [detain-return] one-shot on ANY exit — bounce included,
 * CR 610.3a "until … leaves", not a dies-only rider).
 *
 * CR guards, all enforced here:
 *   - CR 610.3b — the SOURCE already left before the ETB resolved → the duration has expired → the exile
 *     does NOT happen at all (a logged no-op, never an unlinked permanent exile).
 *   - CR 111.7 — a TOKEN target is exiled (moveCardToZone's token branch vanishes it) but never linked:
 *     nothing returns.
 *   - The target must still be a live battlefield permanent (CR 608.2b) — a vanished target is skipped.
 * The exiled card sits in its CONTROLLER's exile zone (the engine's owner proxy, matching bounce/tuck), and
 * the link's ownerId records that player so the return re-enters it under the same player's control.
 */
export function applyExileUntilLeaves(state, atom, ctx) {
  const srcLk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!srcLk) {
    return logEvent(state, { kind: "spell-effect", effect: "detain-exile", targets: [], reason: "source-left" });
  }
  let next = state;
  const links = [];
  const exiled = [];
  for (const t of atomTargets(state, atom, ctx)) {
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(next, t.id);
    if (!lk) continue;
    const card = lk.permanent.card;
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "exile", cardId: t.id });
    exiled.push(t.id);
    // OWNER-LINK (SB-2 desk completion): a STOLEN permanent (owner-stamped by a cross-player reanimation)
    // has its exile card OWNER-routed by moveCardToZone, so the link must record the OWNER — else the
    // return one-shot (CR 610.3; enterCardFromZone reads exactly players[ownerId].exile) misses the card
    // and it strands in exile forever. Owner-return also matches the class's printed text ("return that
    // card to the battlefield under its owner's control"). No owner stamp → controller, unchanged.
    if (!card?.token) links.push({ cardId: card.id, ownerId: lk.permanent.owner && next.players[lk.permanent.owner] ? lk.permanent.owner : lk.controller });
  }
  if (links.length) {
    // Stamp the links on the LIVE source permanent (it may have moved in `next`'s player objects — re-find).
    const src = findPermanent(next, ctx.sourceId);
    if (src) {
      next = {
        ...next,
        players: {
          ...next.players,
          [src.controller]: {
            ...next.players[src.controller],
            battlefield: next.players[src.controller].battlefield.map((p) =>
              p.id === ctx.sourceId ? { ...p, detainedExile: [...(p.detainedExile || []), ...links] } : p),
          },
        },
      };
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "detain-exile", targets: exiled });
}

/**
 * DETAIN-RETURN (DT-1, CR 610.3a) — the one-shot checkLeavesTriggers synthesizes off the leave look-back's
 * `detainedExile` links when the detaining permanent leaves (any exit). Each linked card returns from its
 * OWNER's exile zone to the battlefield under that owner's control (enterCardFromZone — ETB/landfall/
 * permanent-enters fire like any entry; a fresh permanent id, CR 400.7). A card no longer in that exile zone
 * is a clean no-op (CR 608.2b-style fail-safe); a token never linked, so nothing fabricated returns.
 */
const DETAIN_RETURN_RE = /^\[detain-return\] return the exiled cards to the battlefield$/i;
export function detainReturnClauseParser(clause) {
  return DETAIN_RETURN_RE.test(String(clause || "").trim()) ? { op: "detain-return", targetType: null } : null;
}
export function applyDetainReturn(state, atom, ctx) {
  let next = state;
  const returned = [];
  for (const link of ctx.detainedExile || []) {
    if (!link?.cardId || !next.players?.[link.ownerId]) continue;
    const { state: after, entered } = enterCardFromZone(next, { playerId: link.ownerId, cardId: link.cardId, fromZone: "exile" });
    next = after;
    if (entered) returned.push(link.cardId);
  }
  return logEvent(next, { kind: "spell-effect", effect: "detain-return", returned });
}

/**
 * CZ-COMMANDER-VISIT (Hellkite Courser, 2026-08-14 — CR 903 + 603.7): "you may put a commander you own
 * from the command zone onto the battlefield. It gains haste. Return it to the command zone at the
 * beginning of the next end step." ONE atom for the whole three-sentence instruction (splitClauses
 * keeps it folded). The fetch enters through resolvers.enterPermanent (ETB triggers, Kismet, the
 * timestamp — the same door every non-cast entry uses); haste is a fixed-id endOfTurn addKeyword
 * (behaviorally exact: the return fires at the NEXT end step, and haste only matters on a turn the
 * commander has been under its controller's control since the start of anyway); the return rides the
 * CR 603.7 delayed queue as a `[cz-return <permId>]` SENTINEL clause only czClauseParser reads.
 * POLICY (documented house auto-pick, the riot discipline): the MAY is always taken when the command
 * zone is non-empty (a free commander is never worse than declining in this sim's evaluation), and
 * with partners the FIRST commander in the zone is fetched — deterministic, logged.
 */
export function czClauseParser(clause) {
  const t = String(clause || "").trim().toLowerCase();
  if (/^(?:you may )?put a commander you own from the command zone onto the battlefield\. it gains haste\. return it to the command zone at the beginning of the next end step$/.test(t)) {
    return { op: "cz-commander-visit" };
  }
  const rm = t.match(/^\[cz-return ([\w:.-]+)\]$/);
  if (rm) return { op: "cz-return", permanentId: rm[1] };
  // ④-X (2026-09-03 night) — COMMAND BEACON: "{T}, Sacrifice this land: Put your commander into your hand from the
  // command zone." (Earth Bent; a Commander staple). The card leaves the command zone for the HAND — from there it
  // is cast like any card in hand, at printed cost (CR 903.8's tax counts only casts from the command zone, which
  // legalChoices keys on fromZone === "command"), and it stays the commander (the isCommander flag rides the card).
  // Partners: the FIRST commander in the zone, the same deterministic house pick the visit atom above documents.
  if (/^put your commander into your hand from the command zone$/.test(t)) return { op: "cz-commander-to-hand" };
  return null;
}

/** ④-X — Command Beacon's payoff: the first commander in the controller's command zone moves to their hand. An empty
 *  zone is a logged no-op (the cost was legally paid — CR 602.2 — and the effect simply finds nothing to move). */
export function applyCzCommanderToHand(state, atom, ctx) {
  const player = state.players?.[ctx.controller];
  const cz = player?.command || [];
  if (!cz.length) return logEvent(state, { kind: "spell-effect", effect: "cz-commander-to-hand", moved: null, controller: ctx.controller });
  const card = cz[0];
  const next = { ...state, players: { ...state.players, [ctx.controller]: { ...player, command: cz.filter((c) => c !== card), hand: [...(player.hand || []), card] } } };
  return logEvent(next, { kind: "spell-effect", effect: "cz-commander-to-hand", moved: card.name || null, controller: ctx.controller });
}

export function applyCzCommanderVisit(state, atom, ctx) {
  const player = state.players?.[ctx.controller];
  const cz = player?.command || [];
  if (!cz.length) return logEvent(state, { kind: "spell-effect", effect: "cz-commander-visit", fetched: null, controller: ctx.controller });
  const card = cz[0];
  let next = { ...state, players: { ...state.players, [ctx.controller]: { ...player, command: cz.filter((c) => c !== card) } } };
  if (!_enterPermanent || !_addContinuousEffect) throw new Error("cz-commander-visit: integrator doors unregistered — load resolvers.js (the engine always does; a harness must too)");
  next = _enterPermanent(next, card, ctx.controller);
  // The just-entered permanent: this card's id, highest timestamp (enterPermanent stamps monotonically).
  const perm = (next.players[ctx.controller]?.battlefield || [])
    .filter((p) => p.card?.id === card.id)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  if (!perm) return next; // entry replaced/redirected — nothing to haste or schedule
  next = _addContinuousEffect(next, {
    layer: 6,
    op: { layerOp: "addKeyword", keyword: "Haste" },
    affects: { mode: "fixed", permanentIds: [perm.id] },
    duration: { kind: "endOfTurn", turn: next.turn },
    source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
  }).state;
  next = applyScheduleDelayed(next, { delayedClause: `[cz-return ${perm.id}]`, fireStep: "end", fireScope: "any" }, ctx);
  return logEvent(next, { kind: "spell-effect", effect: "cz-commander-visit", fetched: card.name || null, permanentId: perm.id, controller: ctx.controller });
}

export function applyCzReturn(state, atom, ctx) {
  const lk = findPermanent(state, atom.permanentId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "cz-return", returned: null, controller: ctx.controller }); // already left — CR 603.7, a clean no-op
  const next = moveCardToZone(state, { playerId: lk.controller, fromZone: "battlefield", toZone: "command", cardId: atom.permanentId });
  return logEvent(next, { kind: "spell-effect", effect: "cz-return", returned: lk.permanent?.card?.name || null, controller: ctx.controller });
}

/**
 * DELAYED-RETURN BLINK (Otherworldly Journey, Long Road Home — SHELF-TAIL SH14; CR 400.7 + 603.7): "Exile
 * target creature. At the beginning of the next end step, return that card to the battlefield under its
 * owner's control with a +1/+1 counter on it." The delayed twin of applyBlink — the creature is exiled NOW
 * (any creature, not just yours: a legal target on either side), and the return is scheduled on the CR 603.7
 * delayed queue as a `[blink-return <cardId> <ownerId> <counter|plain>]` SENTINEL only blinkReturnClauseParser
 * reads, firing at the NEXT end step. Mirrors cz-commander-visit's fetch+schedule shape exactly, but exiles
 * (battlefield → exile) instead of fetching, and the delayed half re-enters FROM EXILE (enterCardFromZone).
 * A target gone before the exile resolves is a clean no-op (CR 608.2b).
 */
export function applyDelayedBlink(state, atom, ctx) {
  let next = state;
  const done = [];
  // NON-TARGETED MASS (Ghostway "exile each creature you control"): enumerate the controller's creatures at
  // resolution — there are no chosen targets. A snapshot of ids taken BEFORE any exile, so the loop is stable.
  const targets = atom.eachYouControl
    ? (state.players?.[ctx.controller]?.battlefield || []).filter((p) => /\bcreature\b/i.test(p.card?.type || "")).map((p) => ({ id: p.id }))
    : (ctx.targets || []);
  for (const t of targets) {
    const lk = findPermanent(next, t.id);
    if (!lk) continue;                       // gone before resolution — no-op, never a fabricated exile
    const perm = lk.permanent;
    const cardId = perm.card?.id;
    if (!cardId) continue;
    const owner = perm.owner || lk.controller;
    next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "exile", cardId: perm.id });
    next = applyScheduleDelayed(next, { delayedClause: `[blink-return ${cardId} ${owner} ${atom.withCounter ? "counter" : "plain"}]`, fireStep: "end", fireScope: "any" }, ctx);
    done.push(cardId);
  }
  return logEvent(next, { kind: "spell-effect", effect: "delayed-blink", controller: ctx.controller, targets: done });
}

/** The delayed half's sentinel parser (mirrors czClauseParser's `[cz-return …]`). Case-preserving on the ids —
 * the fixed tokens are matched case-insensitively, but the card/owner ids keep their original case. */
export function blinkReturnClauseParser(clause) {
  const m = String(clause || "").trim().match(/^\[blink-return (\S+) (\S+) (counter|plain)\]$/i);
  if (m) return { op: "blink-return", cardId: m[1], ownerId: m[2], withCounter: /^counter$/i.test(m[3]) };
  return null;
}

/** Return the exiled card to the battlefield under its owner's control (CR 400.7 — a NEW object), with a
 * +1/+1 counter when the source printed one. Owner eliminated / card already gone from exile → a clean no-op. */
export function applyBlinkReturn(state, atom, ctx) {
  if (!state.players?.[atom.ownerId]) return logEvent(state, { kind: "spell-effect", effect: "blink-return", returned: null, controller: ctx.controller });
  const r = enterCardFromZone(state, { playerId: atom.ownerId, cardId: atom.cardId, fromZone: "exile", fromPlayerId: atom.ownerId });
  let next = r.state;
  if (r.entered && atom.withCounter && r.permanentId) {
    next = addCounter(next, { permanentId: r.permanentId, type: "+1/+1", amount: 1 });
  }
  return logEvent(next, { kind: "spell-effect", effect: "blink-return", returned: r.entered ? atom.cardId : null, controller: ctx.controller });
}

/**
 * GRANT-FLASHBACK (CORPUS ④-G, 2026-09-03 — Snapcaster Mage / Stingcaster Mage, CR 702.34): "target instant or
 * sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost."
 * Stamps the targeted graveyard card with `flashbackGrant: { cost, turn }` — the card's PRINTED mana cost (a card
 * with no printed mana cost, or an {X} cost, gains nothing the lane could price: a logged no-op, never a fabricated
 * cost). The graveyard-cast lane (legalChoices) reads the stamp only while `turn` is the current turn — "until end
 * of turn" without a cleanup pass — and the existing flashback cast path exiles the card after it resolves.
 */
export function applyGrantFlashback(state, atom, ctx) {
  let next = state;
  const granted = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const owner = t.controller;
    const gy = next.players?.[owner]?.graveyard || [];
    const card = gy.find((c) => c.id === t.id);
    if (!card) continue; // left the graveyard — no-op (CR 608.2b)
    const cost = String(card.mana ?? card.mana_cost ?? "").trim();
    if (!/^(?:\{[^}]+\}\s*)+$/.test(cost) || /\{X\}/i.test(cost)) continue; // nothing the lane could price
    next = { ...next, players: { ...next.players, [owner]: { ...next.players[owner], graveyard: gy.map((c) => (c.id === t.id ? { ...c, flashbackGrant: { cost, turn: next.turn } } : c)) } } };
    granted.push(t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "grant-flashback", controller: ctx.controller, targets: granted });
}

export const zoneResolvers = {
  "grant-flashback": applyGrantFlashback, // ④-G (Snapcaster Mage) — a graveyard instant/sorcery gains flashback = its mana cost until end of turn
  "cz-commander-visit": applyCzCommanderVisit, // Hellkite Courser — the CZ fetch + haste + delayed return
  "cz-commander-to-hand": applyCzCommanderToHand, // ④-X Command Beacon — the commander leaves the command zone for the hand
  "cz-return": applyCzReturn,                  // the delayed half's sentinel
  "delayed-blink": applyDelayedBlink,          // DELAYED-RETURN BLINK (Otherworldly Journey / Long Road Home) — exile now, return at next end step
  "blink-return": applyBlinkReturn,            // its delayed half's sentinel (re-enter from exile + optional +1/+1)
  "bounce": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "hand"),
  "tuck": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "library", atom.where === "top"),
  "return-from-graveyard": applyReturnFromGraveyard,
  "reanimate": applyReanimate,
  "exile-from-graveyard": applyExileFromGraveyard,
  "exile-graveyard": applyExileGraveyard,   // WHOLE-ZONE graveyard hate (Bojuka Bog / Farewell / Rakdos Charm)
  "exile-graveyard-pick": applyExileGraveyardPick, // ④-P — the TARGET player picks one of their graveyard cards to exile (Relic of Progenitus)
  "mass-reanimate": applyMassReanimate,     // "return ALL <type> cards from your graveyard to the battlefield[ tapped]"
  "mass-return-hand": applyMassReturnToHand, // the hand-destination mirror of the above
  "blink": applyBlink,                      // BLINK/FLICKER (CR 400.7) — Cloudshift / Ephemerate / Essence Flux
  "earthbend-return": applyEarthbendReturn, // EARTHBEND-RETURN (CR 603.7) — the animated land's dies/exile delayed return, tapped
  "detain-return": applyDetainReturn, // DETAIN-RETURN (DT-1, CR 610.3a) — the linked exiles return when the detainer leaves
  "gy-shuffle-into-library": applyGyShuffleIntoLibrary, // GY-SHUFFLE-IN (GS-1, CR 701.24) — chosen graveyard cards shuffle into their owner's library
};
