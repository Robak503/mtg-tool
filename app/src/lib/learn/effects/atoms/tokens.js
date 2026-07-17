/**
 * effects/atoms/tokens.js — token-minting atoms (create-token, create-named-token).
 */

import { logEvent, destroyLethalCreatures, findPermanent, createPermanent, mintId } from "../../gameState.js";
import { tokenMultiplier, tokenAdditive, applyCounterDoubling } from "../../replacementEffects.js"; // Wave-3 doubler (leaf): token count + enters-with-counters bypass addCounter; Xorn additive Treasure bonus
import { checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkTokenCreatedTriggers } from "../../triggers.js";
import { snapshotCopiedCard } from "../../cloneCopy.js"; // leaf (imports only gameState) — CR 707.2 copiable-values snapshot
import { TOKEN_COLOR_WORDS, TOKEN_SUPERTYPE_WORDS, TOKEN_CARDTYPE_WORDS, cap, countForSpec, halveAmount } from "./shared.js";
import { SMALL_NUM, NUM_WORD, parseCountSource, parseTokenManaAbility, parseTokenKeywords, BASIC_LAND_SUBTYPES } from "../parseHelpers.js"; // seam batch 18/19: shared parse helpers (leaf, cycle-free) for create-named-token + create-token clause parsers

/**
 * ===== TOKENS ===== Build a token's type line from its descriptor ("colorless thopter artifact"
 * → "Token Artifact Creature — Thopter"). Colors are dropped (color isn't tracked); supertypes and
 * card types are placed before "Creature"; everything else is a subtype. Returns { type, name }.
 */
export function tokenTypeLine(descriptor) {
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
// MTG-002 — a created token ENTERS the battlefield (CR 603.6a), so it fires the same ETB seams as any
// other permanent entry. This mirrors enterPermanent (resolvers.js): checkEnterTriggers (creature-ETB
// watchers — Soul Warden / Impact Tremors / Cathars' Crusade + the subtype-ETB scopes) THEN
// checkPermanentEntersTriggers (artifact-ETB / enchantment-ETB watchers — so an artifact-creature token
// like a Servo/Thopter AND a named artifact token like Treasure/Clue/Food/Gold fire "whenever an artifact
// you control enters"). Both helpers are scope-gated and pure (enqueue only), so firing both on every
// minted token can never over-fire — a non-artifact creature token is a no-op for the perm-enters pass.
//
// TOKEN-CHANGE on-create (Mirkwood Bats — "Whenever you create … a token, each opponent loses 1 life"):
// each minted token is also a token-CREATED event (CR 111.1 — each token is its own object), DISTINCT from
// the ETB watchers above (Mirkwood Bats triggers on CREATION, not entry — it fires even for a token created
// elsewhere, and an existing creature ETBing is NOT a creation). Fired here at the single shared mint
// chokepoint so ALL five token sources (create-token / create-named-token / create-token-copy / amass /
// manifest) cover it uniformly, ONCE PER token, scanning each token's actual CONTROLLER (read off the minted
// permanent, so this stays controller-agnostic). checkTokenCreatedTriggers is scope-gated + pure (a no-op
// when no tokenChange watcher exists — the overwhelming common case), so it can never over-fire.
export function fireTokenEnterTriggers(state, mintedIds) {
  let next = state;
  for (const id of mintedIds) {
    const found = findPermanent(next, id);
    if (!found?.permanent) continue;
    next = checkEnterTriggers(next, found.permanent);
    next = checkPermanentEntersTriggers(next, found.permanent);
    next = checkTokenCreatedTriggers(next, found.permanent.controller, 1);
  }
  return next;
}

export function applyCreateToken(state, atom, ctx) {
  let next = state;
  // ONCE-PER-TURN gate (Screeching Scorchbeast — "…create that many … tokens. Do this only once each turn.",
  // SHELF M1b): the same per-source frequency latch discover/draw/gain-life honor (parser.js
  // ONCE_PER_TURN_HONORED). Checked before any mint; marked after the mint (below), so a second same-turn
  // firing is a clean logged no-op. Cleared each untap step with the rest of the ledger.
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_create-token`;
    if ((state.onceTriggersFiredThisTurn || {})[gateKey]) {
      return logEvent(state, { kind: "spell-effect", effect: "create-token", count: 0, oncePerTurnLatched: true, controller: ctx.controller });
    }
  }
  const { type, name: derivedName } = tokenTypeLine(atom.descriptor);
  // NAMED-TOKEN (CR 111.4): a parsed "named X" suffix (atom.name) overrides the subtype-derived name (Koma's
  // Coil, not "Serpent"). Cosmetic to the rules — the subtype on the type line still drives every interaction.
  const name = atom.name || derivedName;
  // CHANGELING (CR 702.73a) — a "with changeling" token is EVERY creature type. Carry "Changeling" as a real
  // keyword so hasKeyword(card,"changeling") is true (combat/ward subtype checks, layer selectors) AND so the
  // keyword-derived oracle below contains "changeling" (cardIsChangeling, the tribal-count path). Prepended,
  // then deduped, so it composes with any other granted keyword without duplicating.
  const baseKeywords = Array.isArray(atom.keywords) ? atom.keywords : [];
  const keywords = atom.changeling ? [...new Set(["Changeling", ...baseKeywords])] : baseKeywords;
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
  // MILLED-COUNT (Screeching Scorchbeast — "create that many … tokens" on a milled trigger, SHELF M1b):
  // countContext reads a TRIGGER-context magnitude (ctx.nonlandMilledCount / ctx.milledCount, threaded by
  // checkMilledTriggers). An absent context → 0 tokens — a clean under-fire, never a fabricated count.
  const baseCount = atom.countContext ? Math.max(0, ctx[atom.countContext] || 0)
    : atom.countFor
    ? Math.max(0, countForSpec(next, ctx, atom.countFor))
    : atom.countX ? Math.max(0, ctx.xValue || 0) : Math.max(1, atom.count || 1);
  // Wave-3 token doubler (CR 616 — Doubling Season / Parallel Lives / Anointed Procession / Primal Vigor /
  // Mondrak): the NUMBER of tokens created under the controller's control is multiplied. Computed once here
  // (a minted token is never itself a doubler), so the count doubles without per-token recursion.
  const count = baseCount * tokenMultiplier(next, ctx.controller);
  // ENTERS-WITH-COUNTERS: a token that enters with N +1/+1 counters (Zaxara's "0/0 Hydra with X counters").
  // `amount` is a resolved count; `countX` reads the chosen {X} (ctx.xValue). Applied BEFORE the lethal SBA
  // so a 0/0 token with counters survives as a real N/N instead of dying immediately (CR 704.5f). The counters
  // bypass addCounter (the token is minted locally), so the Wave-3 counter doubler is applied here, once.
  const ewc = atom.entersWithCounters;
  const counterBase = ewc ? Math.max(0, ewc.countX ? (ctx.xValue || 0) : (ewc.amount || 0)) : 0;
  const counterN = counterBase > 0 ? applyCounterDoubling(next, ctx.controller, ewc.type || "+1/+1", counterBase) : 0;
  // X/X P/T (DOUBLE-X subsystem): a token whose printed P/T is the spell's {X} (Gelatinous Genesis "X X/X",
  // Slime Molding "an X/X") mints at xValue/xValue. CR 107.3 — an X of 0 makes a 0/0 that dies to the lethal
  // SBA below (the countX path already mints zero tokens at X=0, so this only bites a fixed-count X/X token).
  // ptContext reads a TRIGGER-context number the same way count's countContext does (Quartzwood Crasher —
  // "an X/X … token …, where X is the amount of damage those creatures dealt to that player this combat" →
  // ctx.combatDamageAmount). An absent context value mints a 0/0 that dies to the same SBA — a clean
  // under-fire, never a fabricated size.
  const dynPt = atom.ptX ? Math.max(0, ctx.xValue || 0)
    : atom.ptContext ? Math.max(0, ctx[atom.ptContext] || 0)
    : null;
  const tokPower = dynPt != null ? dynPt : atom.power;
  const tokToughness = dynPt != null ? dynPt : atom.toughness;
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name, type, power: tokPower, toughness: tokToughness, oracle, keywords, token: true };
    let perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
    if (counterN > 0) perm = { ...perm, counters: { ...perm.counters, [ewc.type || "+1/+1"]: (perm.counters?.[ewc.type || "+1/+1"] || 0) + counterN } };
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // ETB (CR 603.6a) — a created token ENTERS, so it fires "enters" triggers: its own (rare) plus every
  // watcher (Soul Warden / Impact Tremors / Cathars' Crusade) AND the subtype-ETB scopes (Pantlaza off a
  // created Dinosaur), plus artifact-ETB watchers for an artifact-creature token (Servo/Thopter). Fired
  // here, per token, BEFORE the lethal SBA (the token entered before a 0/0 dies). Without this, token
  // creation silently bypassed every ETB trigger — a core gap (see issue #345, MTG-002). No real card loops
  // (create-token → "creature enters" → create-token is unprinted) and the session resolution safety cap
  // backstops any pathological case; the trigger helpers only ENQUEUE (the flush is later).
  next = fireTokenEnterTriggers(next, mintedIds);
  // A 0/0 token with no other effect dies immediately (CR 704.5f) — run the lethal SBA (after ETB enqueue).
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  // Mark the once-per-turn latch (regardless of a 0-count whiff) — the effect ran, the gate is consumed.
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_create-token`;
    next = { ...next, onceTriggersFiredThisTurn: { ...(next.onceTriggersFiredThisTurn || {}), [gateKey]: true } };
  }
  return logEvent(next, { kind: "spell-effect", effect: "create-token", count, power: atom.power, toughness: atom.toughness, controller: ctx.controller });
}

// ===== TOKENS ===== T2 named artifact tokens — the canonical `token` key → { name, type, oracle }
// table. Each enters as a REAL non-creature artifact permanent carrying its printed ability, so the
// existing subsystems run it with no special-casing: Treasure/Gold are mana sources the mana model
// SACRIFICES on use (manaModel.manaProduction reads "Add … any color" + flags the self-sac cost),
// Clue/Food/Blood activate on the stack through the γ1 self-sac activated-ability path (legalChoices /
// actionDispatcher). The oracle text is the canonical Oracle wording so parseActivatedAbilities /
// manaProduction read it exactly as they would a printed permanent.
//
// BLOOD (BLITZ TOK-1) — the real Innistrad Blood token is "{1}, {T}, Discard a card, Sacrifice this
// token: Draw a card." (verified via cardIndex.lookupCard, NOT the loot-effect the ETB-1 park note
// paraphrased): the discard is an ADDITIONAL COST (CR 601.2h — the γ1h discard-cost path, discardCost.test.js),
// not a "draw then discard" rider. parseActivatedAbilities models the full {mana}+{T}+discard-a-card+sac-self
// cost (it recognizes "Sacrifice this artifact", NOT the printed "Sacrifice this token", so the stored oracle
// uses the artifact wording exactly like Clue/Food); the runtime pays all four costs and the token's draw
// resolves (tokensT2.test.js).
//
// MAP (BLITZ EX-1) — the real Map token is "{1}, {T}, Sacrifice this artifact: Target creature you control
// explores. Activate only as a sorcery." (verified via cardIndex.lookupCard; the token card's stored oracle
// already uses the "Sacrifice this artifact" wording, matching the Blood/Clue/Food convention — reminder text
// is stripped by parseActivatedAbilities.stripReminder). With EX-1's chosen-target explore atom
// (library.exploreClauseParser "target creature you control explores" → targetType creatureYouControl), the
// activated ability now models fully: parseActivatedAbilities parses the {1}+{T}+sac-self cost and the HIGH
// targeted-explore effect (the "Activate only as a sorcery" rider stripped + enforced at the offer gate via
// stripEnforcedTimingRider — identical to Olivia's sac-Treasure sorcery ability). legalChoices offers it
// sorcery-speed with per-target enumeration; applyActivateAbility → runProgram → applyExplore explores the
// chosen creature. Powerstone (restricted mana, explicitly unmodeled — manaModel.js) / Incubator (transform)
// stay unmodeled → low → Arbiter.
export const NAMED_TOKENS = {
  treasure: { name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
  clue: { name: "Clue", type: "Token Artifact — Clue", oracle: "{2}, Sacrifice this artifact: Draw a card." },
  food: { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life." },
  gold: { name: "Gold", type: "Token Artifact — Gold", oracle: "Sacrifice this artifact: Add one mana of any color." },
  blood: { name: "Blood", type: "Token Artifact — Blood", oracle: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card." },
  map: { name: "Map", type: "Token Artifact — Map", oracle: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery." },
};

/**
 * ===== TOKENS ===== T2 create-named-token (CR 701.7) — put `count` named artifact tokens (Treasure /
 * Clue / Food / Gold) onto the controller's battlefield. Mirrors applyCreateToken's minting (deterministic
 * id, owner = controller, entering untapped) but produces a NON-creature artifact card (no P/T, no keywords,
 * so no lethal SBA / dies path). The token's printed ability then drives the existing engine: Treasure/Gold
 * via the mana model (sacrificed on tap-for-mana), Clue/Food via the activated-ability stack path. A named
 * token ENTERS, so (MTG-002) it fires ETB watchers via the shared fireTokenEnterTriggers seam: these are
 * non-creature artifacts, so creature-ETB watchers (Soul Warden) are gated out, but artifact-ETB watchers
 * ("whenever an artifact you control enters") DO fire — Treasure/Clue/Food/Gold each count as an artifact
 * entering. An unknown key can't occur (the parser allowlist gates it); guarded to a no-op anyway.
 */
export function applyCreateNamedToken(state, atom, ctx) {
  const spec = NAMED_TOKENS[atom.token];
  if (!spec) return state;
  let next = state;
  // ===== TARGET-OPPONENT-CREATES ===== whoCreates:"target" — the token's controller/owner is the CHOSEN
  // opponent (ctx.targets player), not the effect's controller (Generous Plunderer's reflexive "target
  // opponent creates a tapped Treasure token"). CR 111.2 — the effect's controller creates the token, but
  // this effect explicitly names a different creator, so the token enters under that player's control (and
  // they own it). An absent/gone target → the effect does nothing (no fabricated token). The token-count
  // multiplier (doubler) below is read against the CREATOR (that opponent), per CR 616 — their doubler, not ours.
  const creatorId = atom.whoCreates === "target"
    ? (ctx.targets?.find((t) => t.type === "player")?.id ?? null)
    : ctx.controller;
  if (creatorId == null || !next.players?.[creatorId]) return next;
  // ===== TREASURE-MAKER ===== the count, mirroring applyCreateToken (the typed-token resolver). DYNAMIC
  // forms resolve AT RESOLUTION (CR 608.2h — a count-derived value is locked as the effect resolves, not at
  // cast/flush): `countFor` is a board count (countForSpec — Dockside "X = artifacts+enchantments your
  // opponents control"; Cavern-Hoard "for each artifact that player controls"); `countX` reads the chosen
  // {X} (ctx.xValue); `countContext` reads a trigger-context number (Old Gnawbone "that many" =
  // ctx.combatDamageAmount, carried by the combat-damage trigger). A 0 dynamic count mints ZERO tokens
  // (CR 107.3 — a clean no-op, NOT forced to 1); a FIXED count is floored at 1.
  // HALF-X-CREATE-TOKENS (CR 107.3): the countX path optionally HALVES the chosen {X} with the shared
  // rounding primitive (atom.halve "floor"|"ceil" — The Goose Mother's "create half X Food tokens, rounded
  // up"). halveAmount is a no-op pass-through when atom.halve is unset, so every existing countX caller
  // (Dockside et al never set halve) is byte-identical — the unset case returns the raw (un-halved) X.
  const baseCount = atom.countFor
    ? Math.max(0, countForSpec(next, ctx, atom.countFor))
    : atom.countX ? Math.max(0, halveAmount(ctx.xValue || 0, atom.halve))
      : atom.countContext ? Math.max(0, ctx[atom.countContext] || 0)
        : Math.max(1, atom.count || 1);
  // Wave-3 token doubler (CR 616): a "create one or more tokens" doubler (Doubling Season / Parallel Lives /
  // Anointed Procession) doubles named artifact tokens (Treasure/Clue/Food/Gold) too. Multiplied once here.
  // TOKEN-ADDITIVE (Xorn, CR 614): a kind-FILTERED "+1 additional Treasure" replacement adds a FIXED bonus of a
  // specific token kind PER creation event (not per token). Xorn only ever mints Treasures via this named path,
  // so the additive is keyed off the token kind (spec.name → "Treasure"). Greedy-max ordering (CR 616.1e — the
  // creator orders their own replacements to maximize): ADD first, THEN multiply — (base + add) × mult beats
  // base × mult + add (a Xorn + Doubling Season on 1 Treasure = (1+1)×2 = 4, not 1×2+1 = 3). A base of 0 stays 0
  // (no creation event → no additive; CR 614 replaces an existing creation, it doesn't manufacture one). The
  // additive is never itself multiplied by a further additive (a minted Treasure isn't a Xorn), so it's applied
  // exactly once here. BOTH replacements key off creatorId (the token's CREATOR, CR 614/616 — for Generous
  // Plunderer's "target opponent creates a tapped Treasure" the creator is that OPPONENT, so their Xorn/doubler
  // apply, not the controller's). In the ordinary case creatorId === ctx.controller (byte-identical).
  const additive = baseCount > 0 ? tokenAdditive(next, creatorId, spec.name) : 0;
  const count = (baseCount + additive) * tokenMultiplier(next, creatorId);
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
    // ===== TREASURE-MAKER ===== a "tapped" rider (Generous Plunderer's "a tapped Treasure token") enters
    // the token TAPPED, so it's NOT a mana source until it untaps (manaSources skips perm.tapped + the
    // Treasure ability requires {T}). It still ENTERS, so it fires artifact-ETB watchers exactly like an
    // untapped one (fireTokenEnterTriggers below). The token enters under `creatorId` (the controller for the
    // ordinary case, or the CHOSEN opponent for whoCreates:"target" — Generous Plunderer's reflexive).
    const perm = createPermanent({ id: minted.id, card, controller: creatorId, tapped: !!atom.tapped });
    const player = next.players[creatorId];
    next = { ...next, players: { ...next.players, [creatorId]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // ETB (CR 603.6a) — each named artifact token fires artifact-ETB watchers (see fireTokenEnterTriggers).
  next = fireTokenEnterTriggers(next, mintedIds);
  return logEvent(next, { kind: "spell-effect", effect: "create-named-token", token: atom.token, count, tapped: !!atom.tapped, controller: creatorId });
}

/**
 * ===== TOKEN-COPY ===== (Wave 5b) create-token-copy (CR 707.1 — "Some effects create a token that's
 * a copy of another object"). DISTINCT from cloneCopy.js's enters-AS-a-copy (Clone replaces a permanent's
 * own enter): this MINTS a brand-new token whose card IS the copy-source's copiable card.
 *
 * COPY-SOURCE (atom.copySource), gated to what the engine threads:
 *   - "self"       → a copy of THIS creature (the ability source, ctx.sourceId — Scute Swarm's 6+ branch).
 *   - "triggering" → a copy of IT (the triggering permanent, ctx.triggeringPermanentId — Miirym off a
 *                    nontoken Dragon's entry; the Wave-3b dies-payoff threading convention).
 *   - "target"     → a copy of a chosen creature (ctx.targets[0]); only used when the atom carries a
 *                    chosen-target targetType (so legalChoices / the cast path picks it).
 * No copy source resolvable (e.g. a "self" copy on a spell with no source permanent, or a triggering
 * source already gone) → ZERO tokens (CR 111.12 — a token that's a copy of a nonexistent object is not
 * created), never a fabricated body.
 *
 * THE COPY: snapshotCopiedCard (CR 707.2) copies the source's PRINTED card as a fresh object — NO counters,
 * NO auras, NO continuous effects (they live on the permanent, not the card), and strips isCommander. We
 * stamp token:true (CR 707.1/111 — a token that's a copy IS still a token). token:true is the LOAD-BEARING
 * non-recurse guard: a nontoken-gated trigger (Miirym's "another NONTOKEN Dragon") sees token:true on the
 * minted copy and does NOT re-fire (triggers.scopeMatches' nontokenFilter), so one nontoken Dragon entry
 * mints exactly ONE copy, which mints zero further — no infinite loop.
 *
 * COUNT: routed through tokenMultiplier (Wave-3a) so a Doubling-Season-style doubler composes (2^k copies).
 * The minted copy is itself token:true, so it can never be a doubler — the multiply is computed once here.
 *
 * RIDERS (atom.entersTapped / atom.entersAttacking) are COMBAT STATE, not card characteristics, so they're
 * applied to the PERMANENT, never to the copied card — a TYPE-ADDITION rider (subtype / "4/4 Hero") is
 * FORBIDDEN here (it would feed the live subtype-ETB/attacks/dies scopes) and the parser routes such a card
 * non-native instead, so this atom never receives one. "isnt-legendary" (Miirym) is a no-op (the legend
 * rule is unenforced) and carries no atom field.
 *
 * ETB (CR 603.6a): each minted copy ENTERS, so it fires its own ETB triggers + every watcher via the shared
 * fireTokenEnterTriggers seam (the same path applyCreateToken uses). The lethal SBA then runs (a 0/0 copy
 * dies), like every other token mint.
 */
function resolveCopySource(state, atom, ctx) {
  if (atom.copySource === "self") return ctx.sourceId ? findPermanent(state, ctx.sourceId)?.permanent : null;
  if (atom.copySource === "triggering") {
    const live = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId)?.permanent : null;
    if (live) return live;
    // DIES-COPY (Vaultborn Tyrant / Ochre Jelly, CR 707.2) — "create a token that's a copy of it" on a
    // self-DIES trigger: the triggering creature has ALREADY left the battlefield, so findPermanent fails.
    // CR 707.2 copies the creature's LAST-KNOWN printed characteristics, which the death look-back preserved
    // as ctx.triggeringCard (a plain card object). Return a synthetic { card } source so snapshotCopiedCard
    // (which reads only sourcePerm.card) can copy it. A NON-token source only (a token that died ceases to
    // exist and can't be copied, CR 111.7 — and Vaultborn's own "if it's not a token" intervening-if already
    // gates that off; guarding here too keeps the resolver correct for any caller). No look-back card at all
    // → null → CR 111.12 no copy (a clean no-op, never a fabricated body).
    if (ctx.triggeringCard && !ctx.triggeringCard.token) return { card: ctx.triggeringCard };
    return null;
  }
  if (atom.copySource === "target") {
    const t = (ctx.targets || []).find((x) => x?.type === "creature") || (ctx.targets || [])[0];
    return t?.id ? findPermanent(state, t.id)?.permanent : null;
  }
  return null;
}

export function applyCreateTokenCopy(state, atom, ctx) {
  let next = state;
  const sourcePerm = resolveCopySource(next, atom, ctx);
  // CR 111.12 — no copy source (nonexistent / already left) ⇒ no token is created. A clean no-op, never a
  // fabricated body. (Logged so a self-play trace shows the gated miss rather than a silent nothing.)
  if (!sourcePerm?.card) {
    return logEvent(next, { kind: "spell-effect", effect: "create-token-copy", copySource: atom.copySource, count: 0, controller: ctx.controller });
  }
  // CR 707.2 — the copiable card (printed values, fresh object, NO counters/auras/continuous effects,
  // isCommander stripped). cloneCard is undefined: snapshotCopiedCard reads `cloneCard?.id` for the id, so
  // a per-token id is stamped below instead (two minted copies must never share one id).
  // CR 707.9a — a KEYWORD-grant rider (Irenicus's Vile Duplication: "…except the token has flying…") is
  // applied to the snapshot via the SAME addKeyword rider a clone uses (writes card.keywords → layers'
  // printedKeywords seeds from it), so the copy genuinely gains the keyword. The parser only ever supplies
  // layer-grantable keywords (tokenCopy.GRANTABLE_KEYWORDS), so this can never fabricate an unenforced ability.
  // CR 707.9a — an ADD-CARD-TYPE rider (Vaultborn Tyrant: "…except it's an artifact in addition to its other
  // types") prepends the card type to the copy's type line (snapshotCopiedCard addCardType rider), so the
  // minted token genuinely IS that type for every type-line read. The parser only supplies an allowlisted
  // permanent card type (tokenCopy.ADDABLE_CARD_TYPES).
  const copyRiders = [];
  if (Array.isArray(atom.grantKeywords) && atom.grantKeywords.length) copyRiders.push({ kind: "addKeyword", keywords: atom.grantKeywords });
  if (Array.isArray(atom.addCardTypes) && atom.addCardTypes.length) {
    for (const ct of atom.addCardTypes) copyRiders.push({ kind: "addCardType", cardType: ct });
  }
  const copiable = snapshotCopiedCard(sourcePerm, undefined, copyRiders);
  // Wave-3a token doubler (CR 616): a token-copy is still "a token created", so a doubler multiplies it.
  // Computed once (the minted copy is token:true, never itself a doubler).
  const count = Math.max(0, atom.count || 1) * tokenMultiplier(next, ctx.controller);
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    // token:true is the load-bearing non-recurse guard (Miirym's nontoken gate). isCommander already
    // stripped by snapshotCopiedCard. Per-token unique id.
    const card = { ...copiable, id: `tok-${minted.id}`, token: true };
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller, tapped: !!atom.entersTapped });
    const player = next.players[ctx.controller];
    let entered = perm;
    // COMBAT-STATE rider (CR 508 — "enters … attacking"): a permanent characteristic of the ENTRY, not the
    // copied card. Recorded on the permanent so combat reads it; never written to the card (which would leak
    // into the copiable values). Only the clean tapped/attacking riders reach here (parser-gated).
    if (atom.entersAttacking) entered = { ...entered, attacking: true };
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, entered] } } };
    mintedIds.push(minted.id);
  }
  // ETB (CR 603.6a) — each minted copy fires its own + every watcher's enter triggers (Soul Warden /
  // subtype-ETB / artifact-ETB). The copy is token:true, so a nontoken-gated watcher (Miirym) is a no-op
  // on it (no re-trigger loop).
  next = fireTokenEnterTriggers(next, mintedIds);
  // A 0/0 copy dies to the lethal SBA (CR 704.5f), after the ETB enqueue — same ordering as applyCreateToken.
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "create-token-copy", copySource: atom.copySource, count, sourceName: sourcePerm.card?.name, controller: ctx.controller });
}

/**
 * CREATE-NAMED-TOKEN clause parser — migrated from parser.js parseExtendedAtom (seam batch 18 / Wave C).
 * The contiguous named-artifact-token family (Treasure/Clue/Food/Gold/Blood — the modeled allowlist), six
 * matchers in original first-match order (dynamic-count anchors before fixed-N):
 *   (a) "create X <tok> tokens, where X is [equal to] [the number of] <src>" (Dockside) — countFor allowScopes
 *   (b) "create a/an/one <tok> token for each <src>" (Cavern-Hoard Dragon) — countFor allowScopes
 *   (c) "create that many <tok> tokens" (Old Gnawbone) — countContext combatDamageAmount
 *   (d) "create a number of [tapped] <tok> tokens equal to its power" (Goldvein Hydra) — countContext dyingPower
 *   (e) "create [a tapped] [N] <tok> token(s)" (T2 fixed-N; optional leading tapped) — SMALL_NUM
 *   (f) "investigate[ twice|N times]" (KWACT-INVEST → clue token) — NUM_WORD
 * An unmodeled count source (parseCountSource → null) drops the whole clause → low → Arbiter (never a fabricated
 * count). The vanilla creature-token family (create-token) has a DISJOINT "create N P/T … creature token" anchor
 * and stays inline (its parseTokenManaAbility/parseTokenKeywords deps are parser.js-local, a later leaf batch).
 * Pure; uses parseCountSource/SMALL_NUM/NUM_WORD from the leaf. Registered via registerClauseParser in parser.js.
 */
export function createNamedTokenClauseParser(clause) {
  // A leading "you " is a redundant subject — the token's controller is ALWAYS the effect's controller
  // (CR 111.1), so "you create …" ≡ "create …". A combat-damage trigger states it that way ("…you create a
  // Treasure token for each artifact that player controls" — Cavern-Hoard Dragon). Strip it so the create
  // anchors below bind, exactly as createTokenClauseParser already does for the vanilla-token family. Strictly
  // a PROMOTION (can only let an already-low clause parse) — never changes a token's owner.
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/^you create /, "create ");
  let m = t.match(/^create x (treasure|clue|food|gold|blood) tokens,? where x is (?:equal to )?(?:the number of )?(.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  m = t.match(/^create (?:a|an|one) (treasure|clue|food|gold|blood) tokens? for each (.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  // HALF-X-CREATE-TOKENS (CR 107.3) — "create half X <tok> tokens, rounded up/down" (The Goose Mother's ETB:
  // "create half X Food tokens, rounded up"). The count is the chosen {X} HALVED with stated rounding (countX
  // + halve), resolved at ETB via ctx.xValue. CREED: the rounding MUST be stated — a bare "create half X Food
  // tokens" with no "rounded up/down" is ambiguous and stays unmatched → Arbiter (mirrors radClauseParser).
  m = t.match(/^create half x (treasure|clue|food|gold|blood) tokens, rounded (up|down)$/);
  if (m) return { op: "create-named-token", token: m[1], countX: true, halve: m[2] === "up" ? "ceil" : "floor", targetType: null };
  m = t.match(/^create that many (treasure|clue|food|gold|blood) tokens$/);
  if (m) return { op: "create-named-token", token: m[1], countContext: "combatDamageAmount", targetType: null };
  m = t.match(/^create a number of (tapped )?(treasure|clue|food|gold|blood) tokens equal to its power$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[2], countContext: "dyingPower", targetType: null };
    if (m[1]) atom.tapped = true;
    return atom;
  }
  // MAP (BLITZ EX-1) is FIXED-COUNT only in the corpus ("create a Map token" — Cartographer's Companion,
  // Spyglass Siren, Waterwind Scout, Sentinel of the Nameless City; "create two Map tokens" — Get Lost), so it
  // joins the allowlist HERE (the fixed-N form) and NOT the dynamic count anchors above (no "X Map tokens" /
  // "half X Map tokens" / "that many Map tokens" card is printed → those stay unmatched → Arbiter, a safe FN).
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (tapped )?(treasure|clue|food|gold|blood|map) tokens?$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[3], count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: null };
    if (m[2]) atom.tapped = true; // only stamp the flag when present, so the untapped atom shape is unchanged
    return atom;
  }
  // ===== TARGET-OPPONENT-CREATES ===== "target opponent creates a[ tapped] <tok> token" — a CHOSEN opponent
  // (NOT the controller) mints the token (Generous Plunderer's reflexive: "…When you do, target opponent
  // creates a tapped Treasure token."). targetType:"opponent" enumerates the opponents (spellEffects.addOpponents),
  // and whoCreates:"target" tells applyCreateNamedToken to put the token on the CHOSEN player's battlefield
  // (ctx.targets), not the controller's. Single fixed token only (a/an/one); a dynamic/count form on this
  // rarer shape isn't printed → stays unmatched → Arbiter (CREED — never a partial). "tapped" rider preserved.
  m = t.match(/^target opponent creates? (?:a|an|one) (tapped )?(treasure|clue|food|gold|blood) token$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[2], count: 1, targetType: "opponent", whoCreates: "target" };
    if (m[1]) atom.tapped = true;
    return atom;
  }
  m = t.match(/^investigate(?: (twice|(?:two|three|four|five|six|seven|eight|nine|ten) times))?$/);
  if (m) return { op: "create-named-token", token: "clue", count: m[1] === "twice" ? 2 : (m[1] ? NUM_WORD[m[1].split(" ")[0]] : 1), targetType: null };
  return null;
}

// ===== LAND-CREATURE-TOKEN (CR 305.6) ===== the intrinsic mana ability of a basic-land-subtype token.
// A permanent with a basic land subtype has the intrinsic mana ability "{T}: Add <color>" (CR 305.6) —
// so a "Forest Dryad land creature token" (Awaken the Woods) genuinely taps for {G}. To model this
// FAITHFULLY the token must FUNCTION as that land: we mint it with the SAME reminder-text mana line the
// engine already reads off a real dual land / Dryad Arbor ("({T}: Add {G}.)"), so manaModel.manaProduction
// / manaSources tap it for the right color with ZERO new mana-model code — the shipped T4 "ability-carrying
// token" pattern (mint real oracle text; existing subsystems drive it).
//
// CREED GATE: this returns the mana oracle ONLY when the descriptor carries EXACTLY ONE basic-land subtype
// (Forest/Island/Swamp/Mountain/Plains). A "land" descriptor with NO basic subtype (a bare "Dryad land" /
// "Saproling land") has no defined intrinsic color — minting it would drop or fabricate its mana — so it
// returns null and the whole clause stays LOW → Arbiter (a faithful non-native park, not a partial model).
// MULTIPLE basic subtypes (a hypothetical "Forest Island land" token) also returns null: the token would
// tap for a CHOICE of colors and the single-color reminder line can't model that (whole card or nothing).
const BASIC_SUBTYPE_COLOR = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G" };
function landTokenManaOracle(descriptor) {
  const words = String(descriptor || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.includes("land")) return { ok: true, oracle: null }; // not a land token — no mana line, unchanged
  const basics = words.filter((w) => BASIC_LAND_SUBTYPES.has(w));
  if (basics.length !== 1) return { ok: false, oracle: null };     // no basic subtype, or a multi-color dual → park
  return { ok: true, oracle: `({T}: Add {${BASIC_SUBTYPE_COLOR[basics[0]]}}.)` };
}

/**
 * CREATE-TOKEN clause parser (vanilla typed creature tokens) — migrated from parser.js parseExtendedAtom
 * (seam batch 20 / Wave C). Two matchers, original first-match order (for-each before fixed-N):
 *   mtf (FOR-EACH) — "create a/an/one P/T <descriptor> creature token for each <count source>" (Avenger of
 *     Zendikar, Garruk Primal Hunter): one token per source-unit, count at resolution (countFor). No "with"
 *     rider in scope. CREED guards travel: toughness<1 → null (dies to lethal SBA); a LAND creature token →
 *     null (intrinsic mana dropped); unmodeled count source → null.
 *   m (FIXED-N + optional "with") — "create N P/T <descriptor> creature token(s) [named X] with <…>": the
 *     "with" slot is a QUOTED inline mana ability (parseTokenManaAbility → tokenOracle) OR a keyword phrase
 *     (parseTokenKeywords → keywords[]); the quote disambiguates. Same toughness<1 + land guards. A bare
 *     unmatched "with" / unmodeled keyword / non-mana quoted ability → null → low → Arbiter.
 * Pure; uses parseCountSource/SMALL_NUM/parseTokenManaAbility/parseTokenKeywords from the leaf. Registered via
 * registerClauseParser in parser.js.
 */
export function createTokenClauseParser(clause) {
  // A leading "you " is a redundant subject — the token's controller is ALWAYS the effect's controller
  // (CR 111.1), so "you create …" ≡ "create …". The conjoined payload form ("you create a … token and …",
  // e.g. Sword of Body and Mind) carries it on the first sub-clause; strip it so the create anchors below
  // bind. Strictly a PROMOTION (can only let an already-low clause parse) — never changes a token's owner.
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/^you create /, "create ");
  // MILLED-COUNT sentinel (Screeching Scorchbeast, SHELF M1b) — "create that many milled[-nonland] N/N <desc>
  // creature tokens": the event-specific sentinel detectTriggers rewrites a milled trigger's "create that
  // many …" payoff to (a phrase in ZERO printed oracle text — the milledFilter picks which context count).
  // The count is the milled-cards magnitude threaded by checkMilledTriggers (ctx.nonlandMilledCount /
  // ctx.milledCount). The "you may" wrapper is peeled by α2 (optional:true); keep the inline anchor too so a
  // raw clause passed directly still stamps optional. The land-token gate mirrors the numeric form below.
  const sm = t.match(/^(you may )?create that many (milled|milled-nonland) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?$/);
  if (sm) {
    const toughness = parseInt(sm[4], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(sm[5]);
    if (!landMana.ok || landMana.oracle) return null; // a land token's intrinsic mana + a dynamic count is unprinted — park (CREED)
    return { op: "create-token", countContext: sm[2] === "milled-nonland" ? "nonlandMilledCount" : "milledCount", power: parseInt(sm[3], 10), toughness, descriptor: sm[5].trim(), ...(sm[1] ? { optional: true } : {}), targetType: null };
  }
  // ===== X-WHERE (Vault 12 chapter II — SHELF S7) ===== "create X <P>/<T> <desc> creature tokens, where
  // X is [equal to] <count phrase>" — the count is a BOARD tally resolved at resolution (countForSpec),
  // never a cast {X}. The count phrase drops its "the [total] number of" lead and must map through
  // parseCountSource (an unmodeled source → null → Arbiter, never a fabricated count — CREED).
  const mxw = t.match(/^create x (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?,? where x is (?:equal to )?(.+)$/);
  if (mxw) {
    const toughness = parseInt(mxw[2], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(mxw[3]);
    if (!landMana.ok || landMana.oracle) return null; // a land token's intrinsic mana + a dynamic count is unprinted — park (CREED)
    const countFor = parseCountSource(mxw[4].replace(/^the (?:total )?number of /, ""));
    return countFor ? { op: "create-token", power: parseInt(mxw[1], 10), toughness, descriptor: mxw[3].trim(), countFor, targetType: null } : null;
  }
  const mtf = t.match(/^create (?:a|an|one) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens? for each (.+)$/);
  if (mtf) {
    const toughness = parseInt(mtf[2], 10);
    if (toughness < 1) return null;
    // LAND-CREATURE-TOKEN (CR 305.6): a "land" descriptor is admitted ONLY with exactly one basic-land subtype
    // whose intrinsic {T}: Add <color> ability is minted onto the token (landTokenManaOracle); a bare/multi
    // land token returns ok:false → null → Arbiter (the intrinsic mana would be dropped/ambiguous — CREED).
    const landMana = landTokenManaOracle(mtf[3]);
    if (!landMana.ok) return null;
    const countFor = parseCountSource(mtf[4]);
    return countFor ? { op: "create-token", power: parseInt(mtf[1], 10), toughness, descriptor: mtf[3].trim(), countFor, targetType: null, ...(landMana.oracle ? { tokenOracle: landMana.oracle } : {}) } : null;
  }
  // NAMED-TOKEN (CR 111.4) — a typed creature token can carry a printed name ("…creature token named Koma's
  // Coil", Koma/Ur-Dragon-style). The name is captured into atom.name (applyCreateToken stamps it on the
  // minted permanent), but it's PURELY cosmetic to the rules — the token's subtype (from the descriptor)
  // drives every tribal/sac/layer interaction, never its name. Allowing the "named X" suffix INDEPENDENTLY
  // of the "with" rider is a strict PROMOTION (it can only let an already-near-HIGH clause parse): the old
  // regex only accepted "named X" when followed by "with (.+)", so a bare "…token named X" (no "with") fell
  // to LOW. The name group is non-capturing-anchored and the "with" group stays optional + separate.
  const m = t.match(/^create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?(?: named ([a-z' ]+?))?(?: with (.+))?$/);
  if (m) {
    const power = parseInt(m[2], 10);
    const toughness = parseInt(m[3], 10);
    if (toughness < 1) return null;  // 0-toughness token dies to the lethal SBA → incomplete capture → Arbiter
    // LAND-CREATURE-TOKEN (CR 305.6): admit a "land" descriptor ONLY with exactly one basic-land subtype whose
    // intrinsic {T}: Add <color> ability is minted onto the token; otherwise its intrinsic mana would be
    // dropped/ambiguous → null → Arbiter (Saproling land / bare Dryad land stay parked — CREED).
    const landMana = landTokenManaOracle(m[4]);
    if (!landMana.ok) return null;
    // A land token's intrinsic mana line (tokenOracle) and a "with <ability/keyword>" rider would BOTH claim
    // the single tokenOracle slot — modeling one would drop the other. So a land token carrying a "with"
    // rider is parked (whole card or nothing — CREED). Awaken's tokens have no "with" clause, so this only
    // guards a hypothetical "Forest Dryad land creature token with flying".
    if (landMana.oracle && m[6] !== undefined) return null;
    const tokenName = m[5] ? m[5].trim().split(/\s+/).map(cap).join(" ") : null; // title-case the parsed name (it was lowercased upstream)
    const base = { op: "create-token", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), power, toughness, descriptor: m[4].trim(), ...(tokenName ? { name: tokenName } : {}), ...(landMana.oracle ? { tokenOracle: landMana.oracle } : {}), targetType: null };
    if (m[6] === undefined) return base;
    // A QUOTED inline ability → clean-mana-ability gate; a non-quoted phrase → the keyword path. The quote disambiguates.
    if (/^["“']/.test(m[6].trim())) {
      const tokenOracle = parseTokenManaAbility(m[6]);
      return tokenOracle ? { ...base, tokenOracle } : null;
    }
    // CHANGELING (CR 702.73a — the token is EVERY creature type): "with changeling" is an ability-defining
    // keyword, NOT a grantable static, so it can't ride the parseTokenKeywords path (that would stamp an
    // inert "Changeling" keyword without granting the types). Peel it off → atom.changeling, which
    // applyCreateToken honors by minting a token whose oracle carries "Changeling" so hasKeyword /
    // cardIsChangeling (and thus every tribal counter, layer selector, combat/ward subtype check) treats it
    // as all creature types. Any OTHER keywords alongside ("with flying and changeling") still go through
    // parseTokenKeywords; an unmodeled companion keyword → null → low (CREED — whole token or nothing).
    const withPhrase = m[6];
    if (/\bchangeling\b/i.test(withPhrase)) {
      const remainder = withPhrase.replace(/\bchangeling\b/i, "").replace(/\b(and|,)\b/gi, " ").replace(/\s+/g, " ").trim();
      if (remainder) {
        const kws = parseTokenKeywords(remainder);
        return kws ? { ...base, keywords: kws, changeling: true } : null;
      }
      return { ...base, changeling: true };
    }
    const kws = parseTokenKeywords(m[6]);
    return kws ? { ...base, keywords: kws } : null;
  }
  return null;
}

/**
 * ===== TOKEN-COPY-EACH ===== (COPY-RIDER) create-token-copy-each — "For each token you control, create a
 * token that's a copy of that permanent" (Second Harvest, CR 707.1). DISTINCT from applyCreateTokenCopy
 * (which copies ONE resolved source N times): this copies EACH of the controller's TOKEN permanents once —
 * a per-source for-each, the source for each minted copy being a DIFFERENT token.
 *
 * SNAPSHOT-FIRST (CR 608.2 — the effect copies the tokens present AS IT RESOLVES; the copies are created in a
 * single batch and are NOT themselves re-copied): the list of token permanents is captured ONCE up front, off
 * the pre-mint battlefield, so a freshly-minted copy never becomes a copy-source (no doubling, no loop). A
 * source token's copiable card is the SAME printed snapshot a clone takes (snapshotCopiedCard, CR 707.2 — NO
 * counters, NO auras, NO continuous effects; isCommander stripped), stamped token:true (a copy of a token is
 * still a token, CR 707.10a).
 *
 * COUNT / DOUBLER: each source token yields "a token" (CR 707.1) — one create-event per source — so the
 * Wave-3a token doubler (Doubling Season / Parallel Lives) multiplies EACH copy independently (computed once
 * per source, since a minted copy is token:true and can never itself be a doubler).
 *
 * ETB (CR 603.6a): every minted copy fires its own + every watcher's enter triggers via the shared
 * fireTokenEnterTriggers seam, then the lethal SBA runs (a 0/0 copy dies) — the same ordering as every other
 * token mint. ZERO source tokens ⇒ ZERO copies (a clean no-op, never a fabricated body).
 */
export function applyCreateTokenCopyEach(state, atom, ctx) {
  let next = state;
  const player = next.players[ctx.controller];
  if (!player) return logEvent(next, { kind: "spell-effect", effect: "create-token-copy-each", count: 0, controller: ctx.controller });
  // CR 608.2 — snapshot the source tokens ONCE, off the pre-mint battlefield, so a minted copy is never itself
  // re-copied (the copies are created simultaneously). Each source's copiable card is taken now (CR 707.2).
  const sources = (player.battlefield || []).filter((perm) => perm?.card?.token);
  const copiables = sources.map((perm) => snapshotCopiedCard(perm, undefined, []));
  const doubler = tokenMultiplier(next, ctx.controller); // Wave-3a (CR 616) — same for every copy this resolution
  const mintedIds = [];
  for (const copiable of copiables) {
    for (let i = 0; i < doubler; i++) {
      const minted = mintId(next, "tok");
      next = minted.state;
      const card = { ...copiable, id: `tok-${minted.id}`, token: true };
      const perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
      const pl = next.players[ctx.controller];
      next = { ...next, players: { ...next.players, [ctx.controller]: { ...pl, battlefield: [...pl.battlefield, perm] } } };
      mintedIds.push(minted.id);
    }
  }
  // ETB (CR 603.6a) — each minted copy fires its own + every watcher's enter triggers (the copy is token:true,
  // so a nontoken-gated watcher is a no-op on it). Then the lethal SBA (a 0/0 copy dies), after the ETB enqueue.
  next = fireTokenEnterTriggers(next, mintedIds);
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "create-token-copy-each", count: mintedIds.length, controller: ctx.controller });
}

export const tokenResolvers = {
  "create-token": applyCreateToken,
  "create-named-token": applyCreateNamedToken, // ===== TOKENS ===== T2 Treasure/Clue/Food/Gold
  "create-token-copy": applyCreateTokenCopy,   // ===== TOKEN-COPY ===== (Wave 5b) CR 707.1 — token that's a copy
  "create-token-copy-each": applyCreateTokenCopyEach, // ===== TOKEN-COPY-EACH ===== (COPY-RIDER) Second Harvest — copy each token you control
};
