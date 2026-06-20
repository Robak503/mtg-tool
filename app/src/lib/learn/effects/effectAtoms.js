/**
 * effects/effectAtoms.js — the Atom resolver registry (Phase-2 P2.2 keystone).
 *
 * A data table keyed by `Atom.op`, each entry a pure `(state, atom, ctx) => state`
 * resolver. `ctx = { controller, targets }` (the cast-time choices frozen onto the
 * stack object). This is the mechanism that replaces the legacy closure.
 *
 * Parity by construction: the three keystone atoms delegate to the SAME per-effect
 * helpers the legacy `resolveSpellEffect` uses (`spellEffects.applyDamageEffect`
 * etc.), so an EffectProgram of these atoms is byte-for-byte equivalent to the old
 * path — there is no second implementation to drift. New atoms (pump, tokens,
 * counters, …) get their own resolvers in later PRs.
 *
 * Leaf-ish: imports only the shared effect helpers from spellEffects. Does NOT
 * import resolvers or the runner.
 */

import {
  applyDamageEffect,
  applyDestroyEffect,
  applyDrawEffect,
  handCardMatches,
} from "../spellEffects.js";
import { addContinuousEffect } from "../layers.js";
import { logEvent, destroyLethalCreatures, gainLife, loseLife, opponentsOf, tapPermanent, untapPermanent, moveCardToZone, addCounter, addRegenShield, findPermanent, createPermanent, mintId, shuffleLibrary, millCards, applyImpulseDig, attachPermanent, addEmblem, creaturePower } from "../gameState.js";
import { checkDiesTriggers, checkEnterTriggers, checkLifegainTriggers, checkSacrificeTriggers } from "../triggers.js";
import { setPendingTutorChoice, setPendingScryChoice, setPendingHandDiscardChoice, setPendingImpulseDigChoice, setPendingSacrificeChoice, setPendingDiscardChoice, setPendingDivideChoice, setPendingSoftCounterChoice } from "../pendingChoice.js";

const TOKEN_COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "and"]);
// ===== TOKENS ===== descriptor words that are SUPERTYPES / CARD TYPES, not creature subtypes —
// so "colorless thopter artifact" mints "Token Artifact Creature — Thopter" (not a bogus "Artifact"
// subtype) and "legendary spirit" mints "Token Legendary Creature — Spirit". Anything unrecognized
// falls through to a subtype (safe: the token is still a creature with the right P/T).
const TOKEN_SUPERTYPE_WORDS = new Set(["legendary", "snow"]);
const TOKEN_CARDTYPE_WORDS = new Set(["artifact", "enchantment"]);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * ===== TOKENS ===== Build a token's type line from its descriptor ("colorless thopter artifact"
 * → "Token Artifact Creature — Thopter"). Colors are dropped (color isn't tracked); supertypes and
 * card types are placed before "Creature"; everything else is a subtype. Returns { type, name }.
 */
function tokenTypeLine(descriptor) {
  const words = String(descriptor || "").split(/\s+/).filter(Boolean);
  const supertypes = [];
  const cardtypes = [];
  const subtypes = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (TOKEN_COLOR_WORDS.has(lw)) continue;
    if (TOKEN_SUPERTYPE_WORDS.has(lw)) { supertypes.push(cap(lw)); continue; }
    if (TOKEN_CARDTYPE_WORDS.has(lw)) { cardtypes.push(cap(lw)); continue; }
    subtypes.push(cap(w));
  }
  const head = ["Token", ...supertypes, ...cardtypes, "Creature"].join(" ");
  const subtypeStr = subtypes.join(" ");
  return { type: subtypeStr ? `${head} — ${subtypeStr}` : head, name: subtypeStr || "Token" };
}

const typeLineStr = (card) => String(card?.type || card?.type_line || "");
const isCreatureCard = (card) => /Creature/.test(typeLineStr(card));
// MASS-NC type predicates — WORD-ANCHORED (\b) so an artifact/enchantment CREATURE or a creature-land is
// still swept ("Artifact Creature" / "Creature — … Land" each contain the whole word) WITHOUT a substring
// false match: an "Artifact — Lander" token is NOT a Land ("Lander" ≠ the word "Land"). Mirrors the
// engine's canonical type predicates in spellEffects.js (\bArtifact\b / \bEnchantment\b / \bLand\b).
const isArtifactCard = (card) => /\bArtifact\b/.test(typeLineStr(card));
const isEnchantmentCard = (card) => /\bEnchantment\b/.test(typeLineStr(card));
const isLandCard = (card) => /\bLand\b/.test(typeLineStr(card));

/**
 * Every creature on EVERY battlefield, as target descriptors `{type:"creature", id,
 * controller}`. The "all creatures" target set for a MASS atom (`targetType:"eachCreature"`
 * — board wipes: destroy/exile/-X-X all). The order is players-then-battlefield (stable,
 * serialize-deterministic). The mass resolvers feed this into the SAME per-effect helpers a
 * targeted spell uses, so dies-triggers fire once for the simultaneous deaths (CR 700.4 /
 * 603.10a captured pre-move in applyDestroyEffect; one lethal SBA in applyPumpEffect).
 */
function massCreatureTargets(state) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (isCreatureCard(perm.card)) out.push({ type: "creature", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * MASS-NC — every permanent matching `matches(card)` on EVERY battlefield, as `{type:"permanent"}`
 * descriptors (the type applyDestroyEffect accepts; it re-checks isCreature for the CR 603.10a dies
 * look-back, so an artifact/enchantment CREATURE swept this way still dies + fires its dies-trigger).
 * Mirrors massCreatureTargets for "destroy all artifacts / enchantments / lands".
 */
function massPermanentTargets(state, matches) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      if (matches(perm.card)) out.push({ type: "permanent", id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * Every creature CONTROLLER controls right now, as target descriptors — the affected set for a
 * controller-scoped TEAM pump (`scope:"youControl"`: Overrun / Trumpet Blast). Gathered AT
 * RESOLUTION so applyPumpEffect locks the set into per-creature fixed effects (CR 611.2c — a
 * one-shot effect's set is fixed when it begins, NOT re-evaluated as creatures enter later).
 */
function controllerCreatureTargets(state, controller) {
  const player = state.players?.[controller];
  if (!player) return [];
  return player.battlefield
    .filter((perm) => isCreatureCard(perm.card))
    .map((perm) => ({ type: "creature", id: perm.id, controller }));
}

/**
 * The atom's effective target list: every creature for a mass atom (`eachCreature`), every
 * creature the controller controls for a team pump (`scope:"youControl"`), else the chosen targets.
 */
const atomTargets = (state, atom, ctx) => {
  if (atom.targetType === "eachCreature") return massCreatureTargets(state);
  if (atom.targetType === "eachArtifact") return massPermanentTargets(state, isArtifactCard);
  if (atom.targetType === "eachEnchantment") return massPermanentTargets(state, isEnchantmentCard);
  if (atom.targetType === "eachLand") return massPermanentTargets(state, isLandCard);
  if (atom.targetType === "eachArtifactOrEnchantment") return massPermanentTargets(state, (c) => isArtifactCard(c) || isEnchantmentCard(c));
  if (atom.scope === "youControl") return controllerCreatureTargets(state, ctx.controller);
  if (atom.target === "self") return selfTargets(state, ctx);
  return ctx.targets || [];
};

/**
 * The trigger/activated SOURCE permanent as a target list (for a "this creature gets …" self
 * effect, CR 109.2). ctx.sourceId is threaded from the trigger flush / activated dispatcher; a
 * spell has no source permanent, so a self atom there resolves to [] (a no-op, never a fabricated
 * effect). Only a CREATURE source is returned — "this creature" implies a creature.
 */
function selfTargets(state, ctx) {
  const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  return lk && isCreatureCard(lk.permanent.card) ? [{ type: "creature", id: ctx.sourceId, controller: lk.controller }] : [];
}

/**
 * P2.6 create-token (CR 701.7) — put `count` token creatures onto the controller's
 * battlefield. v1 conservative: tokens enter via createPermanent (correct P/T, owner,
 * summoning sick) but do NOT fire ETB-watcher triggers yet (an under-model, never a
 * fabricated effect — the token IS created).
 *
 * ===== TOKENS ===== T1 keyword tokens: a token minted with `atom.keywords` carries a real
 * keywords[] array (and the matching oracle line), so hasKeyword / permanentHasKeyword honor it
 * exactly like a printed creature — a 1/1 flyer can only be blocked by flyers/reach, a deathtouch
 * token trades up, etc. The parser only admits keywords that are ENFORCED + read-layer-aware
 * (parseTokenKeywords), so a token can never claim an ability the combat/SBA engine ignores.
 */
function applyCreateToken(state, atom, ctx) {
  let next = state;
  const { type, name } = tokenTypeLine(atom.descriptor);
  const keywords = Array.isArray(atom.keywords) ? atom.keywords : [];
  // ===== TOKENS ===== T4 ability-carrying tokens — a token minted with `atom.tokenOracle` (slice 1: a
  // CLEAN mana ability, gated by parser.parseTokenManaAbility) carries that ability as its real oracle
  // text, so the existing subsystems drive it with no special-casing: a "{T}: Add {G}" dork and a
  // "Sacrifice this token: Add {C}" Eldrazi Spawn are read by manaProduction / manaAbilitySacrificesSelf
  // exactly like a printed permanent — the same pattern as the named Treasure/Gold tokens (T2). Falls
  // back to the keyword oracle (T1) when no inline ability is present.
  const oracle = atom.tokenOracle || keywords.join(", ");
  // ===== TOKENS ===== T3 X-count: the count is the chosen {X} (ctx.xValue, bound at cast) for an
  // X-token spell (Secure the Wastes). ===== FOR-EACH ===== (WALT-FOREACH-TOK) `countFor` is a BOARD count
  // resolved at resolution ("a token for each creature you control" — Avenger of Zendikar). Both X=0 and a
  // 0 board count mint zero tokens (CR 107.3 — a clean no-op, NOT forced to 1); a fixed count is floored at 1.
  const count = atom.countFor
    ? Math.max(0, countForSpec(next, ctx, atom.countFor))
    : atom.countX ? Math.max(0, ctx.xValue || 0) : Math.max(1, atom.count || 1);
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name, type, power: atom.power, toughness: atom.toughness, oracle, keywords, token: true };
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
  }
  // A 0/0 token with no other effect dies immediately (CR 704.5f) — run the lethal SBA.
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "create-token", count, power: atom.power, toughness: atom.toughness, controller: ctx.controller });
}

// ===== TOKENS ===== T2 named artifact tokens — the canonical `token` key → { name, type, oracle }
// table. Each enters as a REAL non-creature artifact permanent carrying its printed ability, so the
// existing subsystems run it with no special-casing: Treasure/Gold are mana sources the mana model
// SACRIFICES on use (manaModel.manaProduction reads "Add … any color" + flags the self-sac cost),
// Clue/Food activate on the stack through the γ1 self-sac activated-ability path (legalChoices /
// actionDispatcher). The oracle text is the canonical Oracle wording so parseActivatedAbilities /
// manaProduction read it exactly as they would a printed permanent. Only these four are in the parser
// allowlist (Blood/Map/Powerstone are unmodeled → stay low → Arbiter).
const NAMED_TOKENS = {
  treasure: { name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
  clue: { name: "Clue", type: "Token Artifact — Clue", oracle: "{2}, Sacrifice this artifact: Draw a card." },
  food: { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life." },
  gold: { name: "Gold", type: "Token Artifact — Gold", oracle: "Sacrifice this artifact: Add one mana of any color." },
};

/**
 * ===== TOKENS ===== T2 create-named-token (CR 701.7) — put `count` named artifact tokens (Treasure /
 * Clue / Food / Gold) onto the controller's battlefield. Mirrors applyCreateToken's minting (deterministic
 * id, owner = controller, entering untapped) but produces a NON-creature artifact card (no P/T, no keywords,
 * so no lethal SBA / dies path). The token's printed ability then drives the existing engine: Treasure/Gold
 * via the mana model (sacrificed on tap-for-mana), Clue/Food via the activated-ability stack path. Like the
 * creature-token path, the token does NOT fire ETB-watcher triggers yet (an under-model, never fabricated —
 * the token IS created). An unknown key can't occur (the parser allowlist gates it); guarded to a no-op anyway.
 */
function applyCreateNamedToken(state, atom, ctx) {
  const spec = NAMED_TOKENS[atom.token];
  if (!spec) return state;
  let next = state;
  const count = Math.max(1, atom.count || 1);
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
  }
  return logEvent(next, { kind: "spell-effect", effect: "create-named-token", token: atom.token, count, controller: ctx.controller });
}

// ─── P2.7 atom family (delegate to existing gameState helpers) ────────────────

/** "You gain N life" (CR 119.3) — the spell's controller gains life. Non-targeted. FOR-EACH: the amount
 *  may be a board count × per (resolveScaledAmount), e.g. "gain 2 life for each creature you control". */
function applyGainLife(state, atom, ctx) {
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  let next = gainLife(state, { playerId: ctx.controller, amount });
  // TRIG-LIFEGAIN (CR 119.3): the controller gained life → fire their "Whenever you gain life" triggers.
  if (amount > 0) next = checkLifegainTriggers(next, ctx.controller, amount);
  return logEvent(next, { kind: "spell-effect", effect: "gain-life", controller: ctx.controller, amount });
}

/** "You lose N life" / "Each opponent loses N life" / "Each player loses N life" (CR 119.3). Non-targeted.
 *  FOR-EACH: the amount may be a board count × per (resolveScaledAmount). */
function applyLoseLife(state, atom, ctx) {
  let next = state;
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (atom.who === "eachPlayer") {
    // ===== EACH-PLAYER ===== (EP-3) EVERY player loses N life (symmetric — Crushing Disappointment).
    // Non-targeted, so it resolves identically on a spell or a trigger. An eliminated player isn't in
    // state.players (skipped); loseLife to 0 lets the loss SBA fire at the next check, as elsewhere.
    for (const pid of Object.keys(next.players)) {
      if (next.players[pid]) next = loseLife(next, { playerId: pid, amount });
    }
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = loseLife(next, { playerId: opp, amount });
    }
  } else {
    next = loseLife(next, { playerId: ctx.controller, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "lose-life", who: atom.who || "controller", amount });
}

/** Tap / untap target creature(s) (CR 701.26). */
function applyTapEffect(state, atom, ctx, tap) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type === "creature" && findPermanent(next, t.id)) next = tap ? tapPermanent(next, t.id) : untapPermanent(next, t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: tap ? "tap" : "untap", targets: (ctx.targets || []).map(t => t.id) });
}

/** Move creature(s) battlefield → hand (bounce), → exile, or → library (TUCK — top via toTop, else
 * bottom) — chosen targets, or ALL creatures for a mass `exile all creatures` (targetType "eachCreature"). */
function applyZoneMove(state, atom, ctx, toZone, toTop = false) {
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
 * ===== RIDER-REMOVAL ===== (Dex) targeted removal whose SECOND clause acts on the TARGET's controller
 * (CR — "its controller" = the just-removed permanent's controller): Swords to Plowshares (exile + that
 * controller gains life = the creature's power), Beast Within / Generous Gift (destroy + that controller
 * makes a vanilla token), Path to Exile / Assassin's Trophy (exile/destroy + that controller may ramp a
 * basic land). The controller (and the creature's power, for the lifegain rider) is captured BEFORE the
 * removal moves the permanent off the battlefield; the removal then runs through the SHARED exile/destroy
 * resolver (so indestructible/regen/dies are handled identically); finally the rider applies to the
 * captured controller. The rider is unconditional — Beast Within still makes the token even if the target
 * was indestructible (the destroy failed but the second sentence still resolves).
 */
function applyRemovalWithRider(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  // Capture each target's controller + power while it's still on the battlefield (these spells are
  // single-target in the corpus, but the loop is general).
  const captures = [];
  for (const t of targets) {
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(state, t.id);
    if (lk) captures.push({ controller: lk.controller, power: Math.max(0, creaturePower(lk.permanent, state)) });
  }
  // Perform the removal through the shared resolver (exile → applyZoneMove, destroy → applyDestroyEffect).
  let next = atom.op === "exile"
    ? applyZoneMove(state, atom, ctx, "exile")
    : applyDestroyEffect(state, { controller: ctx.controller, targets });
  // Apply the rider to each captured controller.
  for (const cap of captures) {
    if (!next.players?.[cap.controller]) continue; // controller eliminated mid-resolution → skip (CR 800.4a)
    next = applyControllerRider(next, atom.controllerRider, cap, ctx);
    // A rampBasic rider suspends the program (a tutor pending-choice scoped to that player); stop the loop
    // so a (theoretical) second target can't clobber the pending choice — the runner resumes from here.
    if (next.pendingChoice && !next.pendingChoice.resume) break;
  }
  return next;
}

/** Apply a single RIDER-REMOVAL controller-rider to the captured target-controller `cap`. */
function applyControllerRider(state, rider, cap, ctx) {
  if (rider.kind === "gainLifePower") {
    let next = gainLife(state, { playerId: cap.controller, amount: cap.power });
    if (cap.power > 0) next = checkLifegainTriggers(next, cap.controller, cap.power);
    return logEvent(next, { kind: "spell-effect", effect: "rider-gain-life", controller: cap.controller, amount: cap.power });
  }
  if (rider.kind === "createToken") {
    // A token (vanilla OR keyworded — Swan Song's flying Bird) under the captured controller; reuse
    // applyCreateToken with the controller swapped and any modeled keywords threaded.
    const tokenAtom = { op: "create-token", count: 1, power: rider.power, toughness: rider.toughness, descriptor: `${rider.color} ${rider.subtype}`, keywords: rider.keywords || [], targetType: null };
    return applyCreateToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "createNamedToken") {
    // An Offer You Can't Refuse — N named artifact tokens (Treasure/Clue/Food/Gold) under the captured controller.
    const tokenAtom = { op: "create-named-token", token: rider.token, count: rider.count, targetType: null };
    return applyCreateNamedToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "rampBasic") {
    // Reuse the RAMP-1 battlefield tutor (basic land → battlefield), scoped to the TARGET's controller — their
    // library, their pick; the "may" is the tutor's find-nothing. Suspends the program (pending-choice).
    const tutorAtom = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: !!rider.entersTapped, targetType: null };
    return applyTutor(state, tutorAtom, { ...ctx, controller: cap.controller });
  }
  return state;
}

/**
 * Graveyard recursion (CR 608) — move the targeted card(s) from the CASTER'S graveyard to their
 * hand (Raise Dead / Regrowth). The target was chosen at cast time from the caster's own
 * graveyard (a public zone). Fail-safe (CR 608.2b): if the targeted card already left the
 * graveyard, that target does nothing — a logged no-op, never a throw. Hidden-info safe: the
 * card was already visible in the graveyard, so logging the move reveals nothing new.
 */
function applyReturnFromGraveyard(state, atom, ctx) {
  let next = state;
  const returned = [];
  for (const t of ctx.targets || []) {
    if (t.type !== "graveyardCard") continue;
    const gy = next.players[ctx.controller]?.graveyard || [];
    if (!gy.some((c) => c.id === t.id)) continue; // target left the graveyard — no-op (CR 608.2b)
    next = moveCardToZone(next, { playerId: ctx.controller, fromZone: "graveyard", toZone: "hand", cardId: t.id });
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
  return { state: checkEnterTriggers(next, perm), entered: true };
}

function applyReanimate(state, atom, ctx) {
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
 * δ-1b targeted hand disruption (CR 701.8 discard) — Duress / Thoughtseize / Inquisition / Coercion /
 * Despise / Divest / Harsh Scrutiny. The spell targeted an OPPONENT at cast (a player target, chosen
 * WITHOUT seeing their hand — the faithful Duress flow). NOW it resolves: REVEAL that opponent's hand,
 * keep only the cards matching the atom's handFilter, and set a `pendingChoice` for the CASTER to pick
 * which one to discard (the driver surfaces a picker for the human, auto-picks the best card for the AI
 * / Expert — mirroring the tutor/scry/clone pause-or-autopick). The chosen card moves from the OPPONENT'S
 * hand to their graveyard in resolveHandDiscardChoice. Modeling the card pick at resolution (not cast)
 * is what makes 4P faithful: the caster commits to ONE opponent first and only ever sees THAT hand — no
 * cross-opponent cherry-pick, no leak of the other opponents' hands. An empty/no-match revealed hand is a
 * clean no-op (revealed nothing to take, CR 701.8 — no pause). Eliminated-target guard: a target that
 * left the game is skipped.
 */
function applyDiscardChosen(state, atom, ctx) {
  const victim = (ctx.targets || []).find((t) => t.type === "player");
  if (!victim || !state.players[victim.id]) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim?.id ?? null, candidates: 0 });
  }
  const hf = atom.handFilter || {};
  const candidates = (state.players[victim.id].hand || [])
    .filter((c) => !c.token && handCardMatches(c, hf))
    .map((c) => ({ id: c.id, name: c.name }));
  // Revealed but nothing the spell can take → a clean no-op (no picker, the program continues).
  if (candidates.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim.id, candidates: 0 });
  }
  // Pause for the caster's pick (driver surfaces a picker / auto-picks). runProgram attaches the resume.
  return setPendingHandDiscardChoice(state, { controller: ctx.controller, victim: victim.id, candidates, sourceName: ctx.cardName });
}

/**
 * ===== EDICTS ===== — sacrifice a creature controlled by `playerId` as an EFFECT (CR 701.21): move it
 * battlefield → graveyard and fire its + watchers' dies triggers (CR 700.4 — the aristocrats payoff).
 * The EFFECT-side twin of actionDispatcher.sacrificePermanentForCost (the cost-side self-sac), kept here
 * so the edict resolver + the resolution-time victim-choice path (runProgram.resolveSacrificeChoice)
 * share ONE implementation. These paths only ever pass a CREATURE, so dies triggers always fire; the
 * dispatch's stack-resolution finalizer flushes them above the rest (CR 603.3b). A stale id (the creature
 * already left) is a logged no-op via the findPermanent guard + moveCardToZone's own guard.
 */
export function sacrificeCreatureEffect(state, playerId, permId) {
  const lk = findPermanent(state, permId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: null });
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permId });
  if (isCreatureCard(lk.permanent.card)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permId, name: lk.permanent.card?.name || "creature", card: lk.permanent.card }]);
  }
  // TRIG-SACRIFICE: fire "Whenever you sacrifice a <permanent|creature|artifact>" for the sacrificing
  // player. The perm has left the battlefield, so its type rides on the lookBack card (sacScopeMatches reads it).
  next = checkSacrificeTriggers(next, playerId, { id: permId, controller: playerId, card: lk.permanent.card });
  return logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: permId, cardName: lk.permanent.card?.name });
}

/**
 * ===== EDICTS ===== — walk the sacrifice CHAIN (CR 701.21 — each sacrificing player chooses which creature
 * to give up). `queue` is the remaining sacrificers, head-first, each `{ playerId }` (one creature apiece —
 * the modeled "sacrifices a creature" forms). For each in turn:
 *   - eliminated / no creature → drop and move on (a clean no-op; you can't sacrifice what you don't have).
 *   - exactly 1 creature → FORCED sacrifice (no real choice): pitch it inline (dies triggers fire), move on.
 *   - ≥2 creatures → a REAL choice: pause via setPendingSacrificeChoice for THIS sacrificer (the driver
 *     pauses a human picker, auto-sacs an AI's least-valuable), carrying the queue so resolveSacrificeChoice
 *     can drop the settled head + re-enter.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes). Shared
 * by applySacrifice (the atom's first entry) and runProgram.resolveSacrificeChoice (each subsequent pick),
 * so ONE implementation drives the single-target edict (#214) AND the each-player / each-opponent forms.
 * Hidden-info safe: each sacrificer's creatures are public, and the chooser IS their controller.
 */
export function advanceSacrificeChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // sacrificer left the game (CR 800.4a) → skip
    const creatures = (player.battlefield || [])
      .filter((p) => isCreatureCard(p.card))
      .map((p) => ({ id: p.id, name: p.card?.name }));
    if (creatures.length === 0) { q = q.slice(1); continue; } // no creature → can't sacrifice → skip
    if (creatures.length === 1) {
      next = sacrificeCreatureEffect(next, head.playerId, creatures[0].id); // forced — sole legal pick
      q = q.slice(1);
      continue;
    }
    // ≥2 — a real choice: pause for THIS sacrificer's pick, carrying the rest of the queue.
    return setPendingSacrificeChoice(next, { controller: head.playerId, candidates: creatures, queue: q, sourceName });
  }
  return next;
}

/**
 * EDICTS — sacrifice-as-an-effect, resolved through the chain above. The SACRIFICING player chooses which
 * creature (CR 701.21), never the caster. `atom.who` selects the sacrificers:
 *   - "target" (default, #214) — the player(s) targeted at cast (Diabolic Edict / Cruel Edict / Geth's Verdict).
 *   - "eachPlayer" (Innocent Blood / Reign of the Pit) — every player, the controller first (APNAP-stable).
 *   - "eachOpponent" (Liliana's Triumph / Skull Storm) — every opponent.
 * A removed sacrificer / no creatures is a clean no-op; the caster's riders resume after the whole chain settles.
 */
function applySacrifice(state, atom, ctx) {
  let sacrificers;
  if (atom.who === "eachPlayer") {
    const seen = new Set();
    sacrificers = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else if (atom.who === "eachOpponent") {
    sacrificers = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  } else {
    sacrificers = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (sacrificers.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "sacrifice", who: atom.who || "target", sacrificers: 0 });
  }
  return advanceSacrificeChain(state, { queue: sacrificers.map((pid) => ({ playerId: pid })), sourceName: ctx.cardName });
}

/** Put +1/+1 or -1/-1 counters on the chosen creature(s), or the SOURCE for a self counter
 * ("put a +1/+1 counter on this creature", atom.target "self"; CR 122.1). */
function applyAddCounter(state, atom, ctx) {
  let next = state;
  const targets = atomTargets(state, atom, ctx);
  for (const t of targets) {
    if (t.type === "creature" && findPermanent(next, t.id)) {
      next = addCounter(next, { permanentId: t.id, type: atom.counterType, amount: atom.amount || 1 });
    }
  }
  // -1/-1 counters lower DERIVED toughness — run the lethal SBA so a creature it
  // drops to 0 dies at resolution (the P2.3 negative-pump discipline).
  if (atom.counterType === "-1/-1") {
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "add-counter", counterType: atom.counterType, amount: atom.amount || 1, targets: targets.map(t => t.id) });
}

/** REGEN (CR 701.15) — give the SOURCE (self) or the chosen creature a regeneration shield. The shield is
 * consumed at the next would-destroy (the lethal-damage SBA / the destroy effect), which clears damage + taps
 * the creature so it survives. No magnitude (one clause → one shield per target); atomTargets resolves "self"
 * to the source creature and "creature" to ctx.targets, exactly like the +1/+1-counter atom. */
function applyRegenerate(state, atom, ctx) {
  let next = state;
  const targets = atomTargets(state, atom, ctx);
  for (const t of targets) {
    if (t.type === "creature" && findPermanent(next, t.id)) next = addRegenShield(next, t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "regenerate", targets: targets.map(t => t.id) });
}

/**
 * P2.3 pump — "+X/+X until end of turn" (Giant Growth family). Does NOT mutate
 * P/T directly: it registers a CR 613.4c (layer 7c) continuous effect into the
 * layer engine for each targeted creature, with an endOfTurn duration so it wears
 * off at the cleanup step (CR 514.2 — `expireContinuousEffects`, already wired in
 * gameEngine). Derived P/T (combat, SBAs, the AI) reads through layers, so the
 * pump shows up everywhere. The mechanism was built + tested in Phase 1; this
 * atom just emits the record.
 */
function applyPumpEffect(state, atom, ctx) {
  let next = state;
  // X-pump ("+X/+X until end of turn") binds both pips to the chosen X (ctx.xValue);
  // a fixed pump reads its printed ptDelta.
  const x = ctx.xValue || 0;
  const power = atom.amountX ? x : atom.ptDelta?.p || 0;
  const toughness = atom.amountX ? x : atom.ptDelta?.t || 0;
  // Chosen targets for a single-creature pump (Giant Growth), EVERY creature for a mass
  // "All creatures get -X/-X until end of turn" (atom.targetType "eachCreature" — Infest /
  // Languish), or the controller's creatures for a TEAM pump (atom.scope "youControl" — Overrun
  // / Trumpet Blast; the set locked at resolution, CR 611.2c). Each becomes a per-creature fixed
  // layer effect below, so the keyword-grant + lethal-SBA machinery is shared across all three.
  const targets = atomTargets(state, atom, ctx);
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  for (const target of targets) {
    if (target.type !== "creature") continue;
    if (power !== 0 || toughness !== 0) {
      next = addContinuousEffect(next, {
        layer: 7, sublayer: "7c",
        op: { layerOp: "ptModify", power, toughness },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
    // Combat-trick keyword grant ("…and gains trample until end of turn"): a layer-6 addKeyword
    // for each granted keyword, same endOfTurn duration as the pump (wears off at cleanup, CR
    // 514.2). Granted via the layer engine, so combat reads it exactly like a printed keyword.
    for (const kw of atom.grantKeywords || []) {
      next = addContinuousEffect(next, {
        layer: 6,
        op: { layerOp: "addKeyword", keyword: kw },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
  }
  // A negative pump (-X/-Y, e.g. Disfigure / Last Gasp / Dismember) can drop a
  // creature's DERIVED toughness to <= 0 — run the lethal SBA so it dies at
  // resolution (CR 704.5f), exactly as the damage atom does. A positive pump
  // (Giant Growth) finds nothing lethal, so this is a no-op for it. Without this
  // the creature would silently survive at 0 toughness until the next combat step.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "pump", power, toughness, targets: targets.map(t => t.id) });
}

/**
 * WALT-ANIMATE PR2: "Until end of turn, target land becomes a [subtype] N/N creature [with KW…].
 * It's still a land." Layers three CR-613 continuous effects onto the chosen permanent, all until
 * end of turn (worn off at cleanup by expireContinuousEffects, CR 514.2):
 *   - layer 4: ADD the Creature card type (+ any printed creature subtype like Elemental/Dinosaur).
 *     Additive — the Land type is never stripped, so "it's still a land" is honored for free.
 *   - layer 7b: SET base power/toughness to the printed N/N. power/toughness sit at the op TOP LEVEL
 *     because the 7b handler reads `op.power`/`op.toughness` directly and ignores layerOp.
 *   - layer 6: GRANT each rider keyword (flying/haste/trample/…); combat reads it layer-aware exactly
 *     like a printed keyword (granted Haste already lets a just-animated land attack — PR1 framework).
 * PR1's framework already makes the now-creature permanent attack/block/take+deal combat damage/die to
 * the SBA. A 0/0 animate (none in the clean spell subset) has toughness 0 → dies to CR 704.5f via the
 * lethal SBA below, mirroring applyPumpEffect.
 */
function applyAnimateEffect(state, atom, ctx) {
  let next = state;
  // A man-land's activated ability animates ITSELF (PR3): target:"self" → the activating permanent via
  // ctx.sourceId. Resolved directly, NOT through selfTargets — that gates on a PRINTED creature (CR 109.2
  // self-pump) and would reject a land that is BECOMING a creature. A spell's animate targets a chosen
  // land (type:"permanent", enumerateTargets land path); skip a chosen target that left the battlefield
  // between cast and resolution (a missing-id effect is inert; filtering keeps the log honest).
  const targets = atom.target === "self"
    ? ((ctx.sourceId && findPermanent(next, ctx.sourceId)) ? [{ type: "permanent", id: ctx.sourceId }] : [])
    : atomTargets(state, atom, ctx).filter(t => t.type === "permanent" && findPermanent(next, t.id));
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  // Layer-4 types: Creature plus any printed card type the animate adds — a man-land that becomes an
  // "artifact creature" (Mishra's Factory). Additive: the Land type is never stripped (still a land).
  const animateTypes = ["Creature", ...(atom.cardTypes || [])];
  for (const target of targets) {
    next = addContinuousEffect(next, {
      layer: 4,
      op: { types: animateTypes, subtypes: atom.subtypes || [] },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur(), source: src,
    }).state;
    // Layer 5 — SET color when the animate gives one ("becomes a 3/3 GREEN Ape creature"; Creeping Tar
    // Pit "blue and black"). An animate with no color leaves the printed color (a land is colorless).
    if (atom.colors && atom.colors.length) {
      next = addContinuousEffect(next, {
        layer: 5,
        op: { layerOp: "setColor", colors: atom.colors },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
    next = addContinuousEffect(next, {
      layer: 7, sublayer: "7b",
      op: { layerOp: "ptSet", power: atom.power || 0, toughness: atom.toughness || 0 },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur(), source: src,
    }).state;
    for (const kw of atom.grantKeywords || []) {
      next = addContinuousEffect(next, {
        layer: 6,
        op: { layerOp: "addKeyword", keyword: kw },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
  }
  // A 0/0 animate has toughness 0 → CR 704.5f puts it into the graveyard at resolution.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "animate", power: atom.power, toughness: atom.toughness, targets: targets.map(t => t.id) });
}

/**
 * P3.1 counter (CR 701.5a) — counter the target spell(s) on the stack. The targeted
 * spell is removed from the stack and put into its controller's graveyard WITHOUT
 * resolving: no atoms run, no permanent enters, no effect, no triggers. This is the
 * stack-removal mechanic — the FIRST atom that mutates the stack rather than the
 * battlefield/players.
 *
 * Fail-safe (CR 608.2b): if the target already left the stack (it resolved, or a
 * higher counter got it first), the counter fizzles for that target — a logged no-op,
 * never an error, never a fabricated effect. A defensive re-check of the SPELL-TYPE
 * filter (creature/noncreature) runs here (it held at cast time + a spell's type can't
 * change on the stack). The on-card "can't be countered" exclusion (CR 701.5e) is
 * enforced at ENUMERATION only (spellEffects.enumerateTargets) — sufficient because the
 * engine models no effect that grants uncounterability after a target is chosen, and
 * on-card text is immutable, so an uncounterable spell can never reach this atom.
 */
// Front-face type only (CR 712.4a) — for a split/MDFC spell the enriched type line is the
// combined "Front // Back", so the creature/noncreature filter must read the front half.
const counterTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];
function counterFilterMatches(card, filter) {
  const type = counterTypeLine(card);
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors spellMatchesCounterFilter for enumeration).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  return true; // "any"
}
/**
 * Counter the spell with id `spellId` on the stack (CR 701.5a): remove it from the stack → its
 * controller's graveyard, logging the counter (an optional `via` tag, e.g. "soft-counter", records HOW).
 * A spell no longer on the stack (left mid-resolution) is a logged fizzle, never an error. Shared by the
 * hard counter (applyCounter) AND the SOFT-CNT pay-decline path (runProgram.resolveSoftCounterChoice) so
 * the two can't drift on how a spell is countered.
 */
export function counterSpellById(state, spellId, { via = null } = {}) {
  const idx = (state.stack || []).findIndex((o) => o.id === spellId && o.kind === "spell");
  if (idx === -1) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: spellId });
  const targetObj = state.stack[idx];
  const card = targetObj.source;
  const controller = targetObj.controller;
  const newStack = [...state.stack.slice(0, idx), ...state.stack.slice(idx + 1)];
  const player = state.players[controller];
  const next = {
    ...state,
    stack: newStack,
    players: player
      ? { ...state.players, [controller]: { ...player, graveyard: [...player.graveyard, card] } }
      : state.players,
  };
  return logEvent(next, { kind: "spell-effect", effect: "counter", targetId: spellId, cardName: card?.name, controller, ...(via && { via }) });
}

function applyCounter(state, atom, ctx) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type !== "spell") continue;
    const idx = next.stack.findIndex((o) => o.id === t.id && o.kind === "spell");
    if (idx === -1) {
      // Target already off the stack → illegal target, the counter does nothing here.
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    const targetObj = next.stack[idx];
    const card = targetObj.source;
    if (!counterFilterMatches(card, atom.spellFilter)) {
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    // SOFT-CNT — "unless its controller pays {N}": don't counter yet. Flag the TARGETED spell's
    // controller's pay-or-be-countered choice (runProgram attaches the resume + suspends; the driver
    // settles it via resolveSoftCounterChoice — pay {N} → spell survives, else countered). The parser
    // produces exactly ONE spell target per counter atom, so set the choice and stop the loop.
    if (atom.unlessPay != null && !next.pendingChoice) {
      return setPendingSoftCounterChoice(next, {
        controller: targetObj.controller,
        amount: atom.unlessPay,
        spellId: t.id,
        spellName: card?.name || null,
        sourceName: ctx.cardName || null,
      });
    }
    // SOFT-COUNTER-RIDER — capture the COUNTERED spell's controller, counter it, then apply the rider to
    // THAT player (An Offer's Treasures / Swan Song's Bird go to whoever's spell was countered, not the
    // caster). The rider only fires when the counter actually happens (a fizzle above skips it).
    const riderController = targetObj.controller;
    next = counterSpellById(next, t.id);
    if (atom.controllerRider && next.players?.[riderController]) {
      next = applyControllerRider(next, atom.controllerRider, { controller: riderController, power: 0 }, ctx);
    }
  }
  return next;
}

/**
 * ETB-EQUIP-ATTACH — "attach it to target creature you control" (CR 301.5 / 701.3). "It" is the SOURCE
 * Equipment (ctx.sourceId, the permanent whose ETB trigger fired), so this attaches the equipment to the
 * chosen creature via the shared `attachPermanent` helper — the SAME mechanism the Equip activated ability
 * uses, so the equipped-creature static bonus (parseAttachedBonus, applied by the layer engine when
 * `attachedTo` is set) lights up immediately. The target is enumerated as a creature the controller
 * controls (the parser's controller:you restriction), and atomTargetIntent("self-attach")="own" keeps the
 * trigger-flush chooser on the controller's own side. No source / target gone → attachPermanent no-ops
 * (never a fabricated attach).
 */
function applySelfAttach(state, atom, ctx) {
  if (!ctx.sourceId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId: ctx.sourceId, targetId: t.id });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId: ctx.sourceId, targetId: t.id, controller: ctx.controller });
  }
  return next;
}

/**
 * P3.2 tutor (CR 701.19) — search the caster's library for a card matching the modeled
 * type filter, put it into their hand, then shuffle. The filter (`atom.filter.groups`,
 * parsed + allowlisted by the parser) matches a library card when ANY group's words ALL
 * appear in the card's type line (so "instant or sorcery" → 2 groups; "basic land" → 1).
 *
 * v1 conservatism + "never wrong": the ENGINE auto-picks (the deepest cleanly-modelable
 * point — there's no resolution-time choice mechanism), choosing the highest-mana-value
 * match (deterministic tie-break) so the fetch is a sensible, LEGAL card. Interactive
 * tutor choice is a future enhancement. Hidden-info safe: the log records the FILTER and
 * whether a card was found, NEVER the card's name (an opponent's tutor stays hidden). A
 * "you may"/mandatory search that finds nothing (no match, CR 701.19f) is a logged no-op
 * + shuffle, never an error.
 */
export function tutorManaValue(card) {
  if (typeof card?.cmc === "number") return card.cmc;
  if (typeof card?.mana_value === "number") return card.mana_value;
  let mv = 0;
  for (const sym of String(card?.mana || card?.mana_cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) mv += 0;
    else {
      // A 2-generic hybrid pip like {2/W} has mana value 2 (CR 202.3f — the largest
      // component); a colored / colored-hybrid / phyrexian pip is 1.
      const lead = s.match(/^(\d+)/);
      mv += lead ? parseInt(lead[1], 10) : 1;
    }
  }
  return mv;
}
/** Does a library card match a tutor's filter? A null filter (unfiltered "a card") matches ALL. */
export function cardMatchesTutorFilter(card, filter) {
  if (!filter || !Array.isArray(filter.groups) || filter.groups.length === 0) return true;
  // Match the FRONT face only: a library card has just its front-face characteristics
  // (CR 712.4a), but the enriched type line is the COMBINED "Front // Back" for an MDFC —
  // so a [artifact] tutor must NOT match a card whose FRONT is a land and back an artifact.
  const type = String(card?.type || card?.type_line || "").toLowerCase().split(" // ")[0];
  return filter.groups.some((group) => group.every((w) => new RegExp(`\\b${w}\\b`).test(type)));
}
/** A deterministic PRNG (mulberry32) so the shuffle is serialize-stable (no Math.random). */
function deterministicRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Shuffle a player's library deterministically (CR 701.19e / 103.2) using the seed
 * THREADED through state (`state.rngSeed`), then advance it (an LCG step) so the next
 * shuffle differs AND a serialized game restores to byte-identical future shuffles. No
 * Math.random anywhere in game-state mutation.
 */
export function shuffleControllerLibrary(state, controller) {
  if (!state.players[controller]) return state;
  const seed = (state.rngSeed ?? 0) >>> 0;
  const shuffled = shuffleLibrary(state, { playerId: controller, rng: deterministicRng(seed) });
  return { ...shuffled, rngSeed: ((Math.imul(seed, 1664525) + 1013904223) >>> 0) };
}
/**
 * Tutor (CR 701.19) — flag a resolution-time CHOICE rather than auto-picking. Gathers the
 * caster's legal library cards (matching the filter; a null filter = "search for a card" =
 * every card) and sets `state.pendingChoice`; runProgram pauses the effect program here.
 * The driver surfaces a picker (the player's own tutor, beginner/intermediate) or auto-
 * picks (Expert autopilot / an opponent); the fetch + shuffle happen in resolveTutorChoice.
 * Hidden-info safe: the candidate list is the searcher's OWN library (names are theirs to see).
 */
function applyTutor(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  const candidates = player.library
    .filter((c) => cardMatchesTutorFilter(c, atom.filter))
    .map((c) => ({ id: c.id, name: c.name }));
  return setPendingTutorChoice(state, {
    controller,
    candidates,
    sourceName: ctx.cardName || null,
    filterLabel: atom.filterLabel || null,
    // RAMP-1 — destination "battlefield" (+ entersTapped) puts the fetched card onto the battlefield
    // instead of the hand (Rampant Growth / Farhaven Elf). Defaults to "hand" (the P3.2 tutor).
    destination: atom.destination === "battlefield" ? "battlefield" : "hand",
    entersTapped: !!atom.entersTapped,
    // RAMP-MULTI — "up to two": fetch up to `remaining` matching lands (resolveTutorChoice chains the rest).
    remaining: atom.remaining || 1,
  });
}

/**
 * Scry / surveil (CR 701.18 / 701.43) — flag a resolution-time CHOICE: peek the top N of the
 * controller's library and set state.pendingChoice (runProgram pauses the program here, like a
 * tutor). The driver surfaces a keep/move picker (the player) or auto-keeps-all (Expert/opponent);
 * resolveScryChoice (runProgram) applies the reorder + resumes. An empty library is a logged no-op.
 * Hidden-info safe: it's the searcher's OWN library, so the candidate names are theirs to see.
 */
function applyScrySurveilAtom(state, atom, ctx, mode) {
  const player = state.players[ctx.controller];
  if (!player) return state;
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: mode, controller: ctx.controller, count: 0 });
  }
  const cards = player.library.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  return setPendingScryChoice(state, { controller: ctx.controller, mode, cards, sourceName: ctx.cardName || null });
}

/**
 * Impulse-dig (δ-2 — Anticipate / Strategic Planning / Impulse) — flag a resolution-time
 * CHOICE: peek the top N of the controller's library and set state.pendingChoice (runProgram pauses,
 * like scry/tutor). The driver surfaces a pick-one picker (the player) or auto-picks the best card
 * (Expert/opponent); resolveImpulseDigChoice (runProgram) moves the chosen card to HAND and the rest to
 * the `restTo` zone (bottom / graveyard), then resumes. An empty library is a logged no-op. Hidden-info
 * safe: it's the controller's OWN library, so the candidate names are theirs to see.
 */
function applyImpulseDigAtom(state, atom, ctx) {
  const player = state.players[ctx.controller];
  if (!player) return state;
  const n = Math.min(Math.max(0, atom.amount || 0), player.library.length);
  if (n === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "impulse-dig", controller: ctx.controller, count: 0 });
  }
  const top = player.library.slice(0, n);
  // DIG-1 — FILTERED reveal-dig ("you may reveal a <type> card …"): only TYPE-MATCHING cards are keepable
  // to hand; the rest (incl. non-matching) go to `restTo`. An unfiltered dig keeps the whole looked-at set
  // as candidates (the legacy δ-2 path).
  const pool = atom.filter ? top.filter((c) => cardMatchesTutorFilter(c, atom.filter)) : top;
  if (pool.length === 0) {
    // Looked at N, nothing matching to reveal → the whole set goes to the bottom (a clean reveal-nothing,
    // no picker — chosenId null disposes all of the top N). Only reachable on the filtered reveal-dig path.
    const next = applyImpulseDig(state, { playerId: ctx.controller, n, chosenId: null, restTo: atom.restTo || "bottom" });
    return logEvent(next, { kind: "spell-effect", effect: "impulse-dig", controller: ctx.controller, count: n, kept: 0 });
  }
  const cards = pool.map((c) => ({ id: c.id, name: c.name }));
  return setPendingImpulseDigChoice(state, { controller: ctx.controller, candidates: cards, restTo: atom.restTo || "bottom", sourceName: ctx.cardName || null });
}

/** Mill (CR 701.13) — "you mill N cards" (the controller), "each opponent mills N cards", or
 * "each player mills N cards" (EP-3). Top N of each milled player's library → their graveyard. Non-targeted. */
function applyMill(state, atom, ctx) {
  let next = state;
  const amount = atom.amount || 0;
  if (atom.who === "eachPlayer") {
    // ===== EACH-PLAYER ===== (EP-3) EVERY player mills N (symmetric — Mind Funeral-adjacent / Winds of
    // Rebuke rider). Non-targeted → identical on a spell or trigger; an eliminated player isn't in the map.
    for (const pid of Object.keys(next.players)) next = millCards(next, { playerId: pid, count: amount });
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) next = millCards(next, { playerId: opp, count: amount });
  } else {
    next = millCards(next, { playerId: ctx.controller, count: amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "mill", who: atom.who || "controller", amount });
}

// ===== EACH-PLAYER ===== discard (EP-2)
/**
 * Walk the discard CHAIN (CR 701.8 — the DISCARDING player chooses which cards). `queue` is the remaining
 * discarders, head-first, each `{ playerId, remaining }`. For each in turn:
 *   - eliminated / empty hand / nothing left to discard → drop and move on (no-op).
 *   - hand ≤ remaining → a FORCED whole-hand discard (no real choice): pitch every card inline, move on.
 *   - hand > remaining → a REAL choice: pause via setPendingDiscardChoice for THIS discarder (the driver
 *     pauses a human, auto-discards an AI's cheapest), carrying the current queue so resolveDiscardChoice
 *     can decrement + re-enter. Returns the paused state immediately.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes).
 * Hidden-info safe: the discarder is the chooser of their own hand. Shared by applyDiscard (the atom's
 * first entry) and runProgram.resolveDiscardChoice (each subsequent pick), so ONE implementation drives
 * both the inline and the interactive paths.
 */
export function advanceDiscardChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // discarder left the game (CR 800.4a) → skip
    const hand = (player.hand || []).filter((c) => !c.token);
    if (head.remaining <= 0 || hand.length === 0) { q = q.slice(1); continue; }
    if (hand.length <= head.remaining) {
      // Forced — the whole hand goes (no card left to keep, so no decision). Pitch inline, no pause.
      for (const c of hand) {
        next = moveCardToZone(next, { playerId: head.playerId, fromZone: "hand", toZone: "graveyard", cardId: c.id });
      }
      next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: head.playerId, discarded: hand.length, forced: true });
      q = q.slice(1);
      continue;
    }
    // A real choice (hand > remaining): pause for this discarder's single-card pick.
    const candidates = hand.map((c) => ({ id: c.id, name: c.name }));
    return setPendingDiscardChoice(next, { controller: head.playerId, remaining: head.remaining, candidates, queue: q, sourceName });
  }
  return next;
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — "Target player discards N cards" (Mind Rot / Fugue — the
 * VICTIM chooses) and "Each player discards N cards" (Delirium Skeins — every player chooses their own).
 * CR 701.8: the discarding player picks the cards, so this routes through the resolution-time pending-
 * choice CHAIN (advanceDiscardChain) — a human discarder gets a picker, an AI discards its cheapest, and
 * N>1 / multiple discarders resolve as a sequence of single-card picks. who:"target" reads the player
 * target(s) chosen at cast; who:"eachPlayer" enumerates every player, the controller first (APNAP-stable,
 * deterministic). A zero/empty amount or no live target is a clean logged no-op.
 */
function applyDiscard(state, atom, ctx) {
  const amount = effectiveAmount(atom, ctx);
  if (!Number.isFinite(amount) || amount <= 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount: 0 });
  }
  let discarders;
  if (atom.who === "controller") {
    // LOOT-1 — the caster discards (draw-then-discard loot). A single discarder; the chain pauses for the
    // human to pick which cards / auto-discards the AI's cheapest, exactly like the each/target forms.
    discarders = state.players?.[ctx.controller] ? [ctx.controller] : [];
  } else if (atom.who === "eachPlayer") {
    const seen = new Set();
    discarders = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else {
    discarders = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (discarders.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount, discarders: 0 });
  }
  const queue = discarders.map((pid) => ({ playerId: pid, remaining: amount }));
  return advanceDiscardChain(state, { queue, sourceName: ctx.cardName || null });
}

// ===== EACH-PLAYER =====
/**
 * Draw (CR 120) — the ACTOR is the atom's `who`:
 *   - undefined / "controller" (the legacy + "draw N cards" form) — the spell's controller draws.
 *   - "eachPlayer" ("Each player draws N cards" — Vision Skeins) — EVERY player draws.
 *   - "target" ("Target player draws N cards" — Opportunity / Ancestral Recall) — the chosen player(s) draw.
 * Each drawing player goes through applyDrawEffect, the SINGLE source of truth for a draw (shared with the
 * legacy cast path), so the each/target forms are byte-identical to a controller draw, just for a different
 * player. amountX (an {X}-draw) still reads ctx.xValue for the controller form; the each/target forms are
 * numeric-only at the parser (an "{X}" each/target draw fails the anchor → Arbiter), so effectiveAmount is
 * a plain number there. An eliminated/removed player id is skipped (no throw).
 */
function applyDrawAtom(state, atom, ctx) {
  const amount = resolveScaledAmount(state, atom, ctx); // FOR-EACH: count × per (else amountX / printed)
  if (atom.who === "eachPlayer") {
    let next = state;
    for (const pid of Object.keys(state.players)) {
      if (next.players[pid]) next = applyDrawEffect(next, { controller: pid, amount });
    }
    return next;
  }
  if (atom.who === "target") {
    let next = state;
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = applyDrawEffect(next, { controller: t.id, amount });
    }
    return next;
  }
  return applyDrawEffect(state, { controller: ctx.controller, amount });
}

/** P3.2 shuffle — "[then] shuffle [your library]" as its own clause (CR 103.2). */
function applyShuffle(state, atom, ctx) {
  if (!state.players[ctx.controller]) return state;
  const next = shuffleControllerLibrary(state, ctx.controller);
  return logEvent(next, { kind: "spell-effect", effect: "shuffle", controller: ctx.controller });
}

// An X-amount atom (`amountX:true`, set by the parser for an {X}-cost spell) reads
// the chosen X (ctx.xValue, bound at cast time) instead of a printed numeric amount.
const effectiveAmount = (atom, ctx) => (atom.amountX ? ctx.xValue || 0 : atom.amount);

// ===== DMG-SCALE ===== (WALT-DMG-SCALE) a board-count amount (`amountCount`, set by parseCountSource)
// is computed AT RESOLUTION from the CONTROLLER's current board/hand (CR 608.2g — a count-derived value
// is locked as the spell resolves, not at cast). Slice 1 sources: permanents you control by card TYPE
// (creature/land/artifact/enchantment) or basic-land SUBTYPE (Mountain/Forest/Island/Plains/Swamp), or
// cards in your hand. The matcher (countMatches) reads the same `card.type` line as isCreatureCard, so an
// Artifact Creature correctly counts for both "creatures" and "artifacts" (it IS both, CR 305.4-ish).
function countMatches(card, spec) {
  const type = String(card?.type || card?.type_line || "");
  if (spec.subtype) return new RegExp(`\\b${spec.subtype}\\b`).test(type);   // basic-land subtype (Mountain…)
  if (spec.cardType) {
    const T = spec.cardType.charAt(0).toUpperCase() + spec.cardType.slice(1); // creature → Creature
    return new RegExp(`\\b${T}\\b`).test(type);
  }
  return false;
}
function countForSpec(state, ctx, spec) {
  // ===== OPPONENT-SCOPED ===== who:"target" counts the SPELL'S TARGET player ("…equal to the number of
  // cards in that player's hand" — Sudden Impact); everything else counts the controller (the common case).
  // A missing player target → 0 (a safe no-op, never silently the controller's hand).
  const playerId = spec.who === "target" ? ctx.targets?.find((t) => t.type === "player")?.id : ctx.controller;
  const player = playerId ? state?.players?.[playerId] : null;
  if (!player) return 0;
  if (spec.kind === "cardsInHand") return (player.hand || []).length;
  if (spec.kind === "permanentsYouControl") return (player.battlefield || []).filter((perm) => countMatches(perm.card, spec)).length;
  // ===== FOR-EACH ===== cards in the controller's graveyard (raw card objects), optionally one card type.
  if (spec.kind === "cardsInGraveyard") return (player.graveyard || []).filter((c) => (spec.cardType ? countMatches(c, spec) : true)).length;
  return 0;
}
// Resolved numeric amount: a board count (`amountCount`) × a per-unit value (FOR-EACH "gain 2 life for
// each X" → per 2; DMG-SCALE damage = the count itself → per defaults to 1), computed at resolution;
// else the X-amount (`amountX` → ctx.xValue) or the printed numeric amount.
const resolveScaledAmount = (state, atom, ctx) => (atom.amountCount ? countForSpec(state, ctx, atom.amountCount) * (atom.amountCount.per ?? 1) : effectiveAmount(atom, ctx));

/**
 * ===== FOG ===== (FOG-1, CR 615 prevention) — "Prevent all combat damage that would be dealt this turn."
 * Stamp the current turn onto state.preventCombatDamageTurn; combatResolution.resolveCombatDamage skips
 * ALL combat damage (both the first-strike and regular steps) while that flag === state.turn, then it
 * SELF-EXPIRES (next turn's number differs, so no cleanup is needed). Non-targeted, no choice; the flag
 * is a plain number so a mid-combat serialize/restore is byte-identical.
 */
function applyFog(state, atom, ctx) {
  const next = { ...state, preventCombatDamageTurn: state.turn };
  return logEvent(next, { kind: "spell-effect", effect: "fog", controller: ctx.controller, turn: state.turn });
}

/**
 * ===== EMBLEM ===== (PW-5, CR 114) — "You get an emblem with '[ability]'." Give the controller an
 * emblem carrying the quoted ability text (addEmblem). The parser only emits this atom when the
 * ability is a modeled static (a clean anthem the layer engine can apply); the emblem's effect then
 * applies continuously via layers.emblemEffectsOf. Non-targeted; a removed controller is a clean no-op.
 */
function applyCreateEmblem(state, atom, ctx) {
  if (!ctx.controller || !state.players?.[ctx.controller]) return state;
  const next = addEmblem(state, { playerId: ctx.controller, oracle: atom.emblemOracle || "" });
  return logEvent(next, { kind: "spell-effect", effect: "create-emblem", controller: ctx.controller });
}

/**
 * ===== DIVIDE ===== (MT-1) — "deals N damage divided as you choose among any number of target X." Gather
 * the legal target set per `atom.group` (every battlefield's creatures, and/or every player) and PAUSE for
 * the caster's division (setPendingDivideChoice); resolveDivideChoice (runProgram) applies the per-target
 * damage. Non-targeted at cast — the division is a resolution-time choice — so no ctx.targets are consumed.
 * Numeric `atom.amount` only for now (an {X} divide is a fast-follow). EXPORTED for direct testing; it is
 * intentionally NOT in ATOM_RESOLVERS yet (so divide-damage stays low → Arbiter until the picker + driver +
 * UI all land — no native-but-unplayable false positive). 0 amount / no legal target → a logged no-op.
 */
export function applyDivideDamage(state, atom, ctx) {
  const amount = atom.amount || 0;
  const group = atom.group || "anyTarget";
  if (amount <= 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount: 0 });
  const candidates = [];
  if (group !== "players") {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreatureCard(perm.card)) candidates.push({ id: perm.id, name: perm.card?.name, type: "creature", controller: pid });
      }
    }
  }
  if (group !== "creatures") {
    for (const pid of Object.keys(state.players)) candidates.push({ id: pid, name: pid, type: "player", controller: pid });
  }
  if (candidates.length === 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount, candidates: 0 });
  return setPendingDivideChoice(state, { controller: ctx.controller, amount, candidates, group, sourceName: ctx.cardName });
}

export const ATOM_RESOLVERS = Object.freeze({
  "deal-damage": (state, atom, ctx) =>
    // KW-POISON: thread the SOURCE permanent (ctx.sourceId, set for activated/triggered abilities) so an
    // infect/wither source's non-combat damage routes to -1/-1 counters / poison in applyDamageEffect.
    applyDamageEffect(state, { controller: ctx.controller, amount: resolveScaledAmount(state, atom, ctx), targetType: atom.targetType, targets: ctx.targets, source: { id: ctx.sourceId } }),
  "destroy": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Beast Within / Generous Gift / Assassin's Trophy
      : applyDestroyEffect(state, { controller: ctx.controller, targets: atomTargets(state, atom, ctx) }),
  "draw": applyDrawAtom, // ===== EACH-PLAYER ===== who-aware: controller / eachPlayer / target player
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "animate": (state, atom, ctx) => applyAnimateEffect(state, atom, ctx),
  "gain-life": applyGainLife,
  "lose-life": applyLoseLife,
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
  "bounce": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "hand"),
  "tuck": (state, atom, ctx) => applyZoneMove(state, atom, ctx, "library", atom.where === "top"),
  "exile": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Path to Exile / Swords to Plowshares
      : applyZoneMove(state, atom, ctx, "exile"),
  "add-counter": applyAddCounter,
  "regenerate": applyRegenerate, // REGEN (CR 701.15) — set a regeneration shield on self / target creature
  "return-from-graveyard": applyReturnFromGraveyard,
  "reanimate": applyReanimate,
  "discard-chosen": applyDiscardChosen,
  "discard": applyDiscard, // ===== EACH-PLAYER ===== target/each player discards N — victim chooses (CR 701.8)
  "sacrifice": applySacrifice,
  "create-token": applyCreateToken,
  "create-named-token": applyCreateNamedToken, // ===== TOKENS ===== T2 Treasure/Clue/Food/Gold
  "counter": applyCounter,
  "self-attach": applySelfAttach, // ETB-EQUIP-ATTACH — auto-attach an Equipment to a creature you control
  "tutor": applyTutor,
  "shuffle": applyShuffle,
  "scry": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "scry"),
  "surveil": (state, atom, ctx) => applyScrySurveilAtom(state, atom, ctx, "surveil"),
  "impulse-dig": applyImpulseDigAtom,
  "mill": applyMill,
  "fog": applyFog, // ===== FOG ===== (FOG-1) prevent all combat damage this turn — a turn-scoped latch
  "create-emblem": applyCreateEmblem, // ===== EMBLEM ===== (PW-5) "you get an emblem with '[modeled static]'"
  // ===== DIVIDE ===== (MT-1) — split N damage among any number of targets via a resolution-time picker.
  // Wired end-to-end: applyDivideDamage → setPendingDivideChoice → driver (AI auto-distributes /
  // human assigns via the LearnView DivideDamagePanel) → resolveDivideChoice applies it through the
  // deal-damage atom. (distribute-counters reuses this same picker — fast-follow.)
  "divide-damage": applyDivideDamage,
});

/**
 * Resolve a single atom. Returns the new state, or null when there is no resolver
 * for the atom's op — the caller (runEffectProgram) treats null as "can't model
 * this" and routes to the Arbiter seam rather than fabricating an effect.
 */
export function resolveAtom(state, atom, ctx) {
  const fn = ATOM_RESOLVERS[atom?.op];
  if (!fn) return null;
  return fn(state, atom, ctx);
}
