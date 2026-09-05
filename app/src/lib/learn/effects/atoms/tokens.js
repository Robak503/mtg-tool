/**
 * effects/atoms/tokens.js — token-minting atoms (create-token, create-named-token).
 */

import { logEvent, destroyLethalCreatures, findPermanent, createPermanent, mintId, attachPermanent, moveCardToZone, opponentsOf } from "../../gameState.js"; // opponentsOf — PER-OPPONENT tokens (Endless Foot Assault)
import { tokenMultiplier, tokenAdditive, tokenExtraKinds, tokenOneOfEachPasses, applyCounterDoubling } from "../../replacementEffects.js"; // + tokenOneOfEachPasses — Academy Manufactor (Bumble F4) // Wave-3 doubler (leaf): token count + enters-with-counters bypass addCounter; Xorn additive Treasure bonus
import { checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkTokenCreatedTriggers } from "../../triggers.js";
import { snapshotCopiedCard } from "../../cloneCopy.js"; // leaf (imports only gameState) — CR 707.2 copiable-values snapshot
import { TOKEN_COLOR_WORDS, TOKEN_SUPERTYPE_WORDS, TOKEN_CARDTYPE_WORDS, cap, countForSpec, halveAmount } from "./shared.js";
import { SMALL_NUM, NUM_WORD, parseCountSource, parseTokenManaAbility, parseTokenTriggeredAbility, parseTokenStaticAbility, parseTokenKeywords, BASIC_LAND_SUBTYPES } from "../parseHelpers.js"; // seam batch 18/19: shared parse helpers (leaf, cycle-free) for create-named-token + create-token clause parsers

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
  // ===== TOKEN-EXTRA-KIND (SG-10, 2026-09-03 — Peregrin Took, CR 614.1) ===== every mint site funnels its
  // freshly created tokens through here, so this is the ONE place a "those tokens plus an additional Food
  // token" replacement applies — once per creation EVENT (not per token), under the tokens' creator (the
  // controller of what was minted — "under your control"), for each Took-like permanent that creator
  // controls. The extra Food is minted RAW here (createPermanent, not applyCreateNamedToken) so it is part of
  // this same event and never re-enters the replacement (CR 614.5); it then fires its own enter watchers with
  // the rest of the batch. Greedy-max ordering with a token doubler (CR 616.1e): the extra Food is doubled too.
  let ids = mintedIds;
  if (mintedIds.length > 0) {
    const first = findPermanent(next, mintedIds[0]);
    const creatorId = first?.permanent?.controller ?? null;
    const kinds = creatorId ? tokenExtraKinds(next, creatorId) : [];
    if (kinds.length > 0) {
      const extra = [];
      const mult = tokenMultiplier(next, creatorId);
      for (const kind of kinds) {
        const spec = NAMED_TOKENS[kind];
        if (!spec) continue;
        for (let i = 0; i < mult; i++) {
          const minted = mintId(next, "tok");
          next = minted.state;
          const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
          const perm = createPermanent({ id: minted.id, card, controller: creatorId });
          const player = next.players[creatorId];
          next = { ...next, players: { ...next.players, [creatorId]: { ...player, battlefield: [...player.battlefield, perm] } } };
          extra.push(minted.id);
        }
      }
      if (extra.length > 0) {
        next = logEvent(next, { kind: "spell-effect", effect: "token-extra-kind", controller: creatorId, kinds, count: extra.length });
        ids = [...mintedIds, ...extra];
      }
    }
  }
  // ===== ONE-OF-EACH (Academy Manufactor — SHELF-85 · Bumble F4, 2026-09-05; CR 614.1) ===== each pass turns every
  // Clue / Food / Treasure token in the batch into one of each: for each such token, the two MISSING kinds are minted
  // RAW here (part of the same creation event, never re-entering the replacement — CR 614.5), under the tokens'
  // creator. ⛔ NOT multiplied by a token doubler, unlike the Took extra above: Manufactor REPLACES each token with
  // one of each, so with Anointed Procession beside it one Food is two of each in EITHER replacement order (double
  // first → two Foods → each becomes one of each; Manufactor first → one of each → doubled) — the doubler has already
  // acted on the batch this pass reads, and doubling the spawn again gave 2/4/4 (caught by the first witness run).
  // Passes apply in turn (two Manufactors: one Food → three of each — the printed ruling), so each pass reads the
  // batch the previous pass left. The spawned tokens then fire their own enter watchers with the rest of the batch.
  if (ids.length > 0) {
    const first = findPermanent(next, ids[0]);
    const creatorId = first?.permanent?.controller ?? null;
    const passes = creatorId ? tokenOneOfEachPasses(next, creatorId) : 0;
    if (passes > 0) {
      const KINDS = ["clue", "food", "treasure"];
      for (let p = 0; p < passes; p++) {
        const spawned = [];
        for (const id of ids) {
          const kindOf = String(findPermanent(next, id)?.permanent?.card?.name || "").toLowerCase();
          if (!KINDS.includes(kindOf)) continue;
          for (const kind of KINDS) {
            if (kind === kindOf) continue;
            const spec = NAMED_TOKENS[kind];
            if (!spec) continue;
            const minted = mintId(next, "tok");
            next = minted.state;
            const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
            const perm = createPermanent({ id: minted.id, card, controller: creatorId });
            const player = next.players[creatorId];
            next = { ...next, players: { ...next.players, [creatorId]: { ...player, battlefield: [...player.battlefield, perm] } } };
            spawned.push(minted.id);
          }
        }
        if (spawned.length > 0) {
          next = logEvent(next, { kind: "spell-effect", effect: "token-one-of-each", controller: creatorId, pass: p + 1, count: spawned.length });
          ids = [...ids, ...spawned];
        }
      }
    }
  }
  for (const id of ids) {
    const found = findPermanent(next, id);
    if (!found?.permanent) continue;
    next = checkEnterTriggers(next, found.permanent);
    next = checkPermanentEntersTriggers(next, found.permanent);
    next = checkTokenCreatedTriggers(next, found.permanent.controller, 1, found.permanent.card); // + the token's card (Staff of the Storyteller's creature gate)
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
  // ④-F — TARGET-OPPONENT CREATES (CR 111.2): the effect names a different creator — the chosen opponent (the
  // player target) mints, controls and owns the tokens, and THEIR doubler counts. An absent/gone target → nothing
  // (no fabricated token). Every other create-token keeps ctx.controller, byte-identical.
  const tokenCreatorId = atom.whoCreates === "target"
    ? (ctx.targets?.find((t) => t.type === "player")?.id ?? null)
    : ctx.controller;
  if (tokenCreatorId == null || !state.players?.[tokenCreatorId]) return logEvent(state, { kind: "spell-effect", effect: "create-token", count: 0, controller: ctx.controller, noCreator: true });
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
  // PER-OPPONENT (Endless Foot Assault): one token per LIVE opponent at resolution (CR 608.2h); zero opponents → zero tokens.
  const perOpponentIds = atom.perOpponent ? opponentsOf(next, tokenCreatorId) : null;
  const baseCount = atom.perOpponent ? perOpponentIds.length
    : atom.countContext ? Math.max(0, ctx[atom.countContext] || 0)
    : atom.countFor
    ? Math.max(0, countForSpec(next, ctx, atom.countFor))
    : atom.countX ? Math.max(0, ctx.xValue || 0) : Math.max(1, atom.count || 1);
  // Wave-3 token doubler (CR 616 — Doubling Season / Parallel Lives / Anointed Procession / Primal Vigor /
  // Mondrak): the NUMBER of tokens created under the controller's control is multiplied. Computed once here
  // (a minted token is never itself a doubler), so the count doubles without per-token recursion.
  const count = baseCount * tokenMultiplier(next, tokenCreatorId);
  // ENTERS-WITH-COUNTERS: a token that enters with N +1/+1 counters (Zaxara's "0/0 Hydra with X counters").
  // `amount` is a resolved count; `countX` reads the chosen {X} (ctx.xValue). Applied BEFORE the lethal SBA
  // so a 0/0 token with counters survives as a real N/N instead of dying immediately (CR 704.5f). The counters
  // bypass addCounter (the token is minted locally), so the Wave-3 counter doubler is applied here, once.
  const ewc = atom.entersWithCounters;
  const counterBase = ewc ? Math.max(0, ewc.countX ? (ctx.xValue || 0) : (ewc.amount || 0)) : 0;
  const counterN = counterBase > 0 ? applyCounterDoubling(next, tokenCreatorId, ewc.type || "+1/+1", counterBase) : 0;
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
    // TAPPED (Tormod — "create a TAPPED 2/2…"): the same atom.tapped flag the Treasure-maker mints honored.
    let perm = createPermanent({ id: minted.id, card, controller: tokenCreatorId, tapped: !!atom.tapped });
    if (counterN > 0) perm = { ...perm, counters: { ...perm.counters, [ewc.type || "+1/+1"]: (perm.counters?.[ewc.type || "+1/+1"] || 0) + counterN } };
    const player = next.players[tokenCreatorId];
    next = { ...next, players: { ...next.players, [tokenCreatorId]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // ATTACKING JOIN (Otharri O1 — CR 508.1c): a token minted "tapped and attacking" must be REGISTERED in
  // state.combat.attackers to actually be attacking — the entersAttacking permanent flag alone is inert
  // (the dead-field warning on createTokenCopy names this exactly). The applyMobilize convention verbatim:
  // append each minted token vs the trigger's defender (ctx.defenderId, threaded by the attack-trigger
  // flush). It was NEVER declared as an attacker, so no attack triggers fire for it (CR 508.4). A missing
  // defender (a non-attack resolution path) leaves the tokens tapped but un-joined — FN-safe, never a
  // fabricated combat entry (the Raph & Mikey convention).
  if (atom.perOpponent && perOpponentIds && perOpponentIds.length && mintedIds.length) {
    // PER-OPPONENT — the i-th minted token attacks the i-th opponent ("attacking THAT player"), round-robin under a doubler.
    // No trigger defender is consulted: the printed card names each token's own defender.
    const entries = mintedIds.map((id, i) => ({ permanentId: id, attackingPlayer: ctx.controller, defender: perOpponentIds[i % perOpponentIds.length] }));
    next = { ...next, combat: { ...(next.combat || { attackers: [], blockers: [] }), attackers: [...(next.combat?.attackers || []), ...entries] } };
  } else if (atom.entersAttacking && ctx.defenderId && mintedIds.length) {
    const entries = mintedIds.map((id) => ({ permanentId: id, attackingPlayer: ctx.controller, defender: ctx.defenderId }));
    next = { ...next, combat: { ...(next.combat || { attackers: [], blockers: [] }), attackers: [...(next.combat?.attackers || []), ...entries] } };
  }
  // ATTACH-TO-CREATED-TOKEN (CR 701.3) — "…, then attach this Equipment to it." Attach BEFORE the ETB fire
  // and the lethal SBA below, exactly like the Living Weapon path in resolvers.enterPermanent: a token whose
  // survival depends on the Equipment's bonus (a 0/0 germ-shaped token) must already be wearing it when the
  // SBA runs, or it dies before the buff applies (CR 613 — the layer engine reads the attached bonus).
  // ctx.sourceId is the Equipment whose trigger this is; the parser guarantees exactly one minted token.
  if (atom.attachSourceToCreated && ctx.sourceId && mintedIds.length === 1 && findPermanent(next, ctx.sourceId)) {
    next = attachPermanent(next, { equipId: ctx.sourceId, targetId: mintedIds[0] });
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
  // LAST-MINTED stamp (Cori-Steel Cutter, W9 — the _lastMilledIds convention): the freshest mint is the
  // referent a following "attach this Equipment to IT" atom reads (∩ still-alive at its own resolution).
  // Overwritten per create; plain JSON, serialize-safe; every other consumer ignores it.
  if (mintedIds.length) next = { ...next, _lastMintedTokenIds: [...mintedIds] };
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
// chosen creature. Powerstone joined 2026-09-06 (its restricted mana parses now — see its entry); Incubator (transform)
// stays unmodeled → low → Arbiter.
export const NAMED_TOKENS = {
  treasure: { name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
  clue: { name: "Clue", type: "Token Artifact — Clue", oracle: "{2}, Sacrifice this artifact: Draw a card." },
  food: { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life." },
  gold: { name: "Gold", type: "Token Artifact — Gold", oracle: "Sacrifice this artifact: Add one mana of any color." },
  blood: { name: "Blood", type: "Token Artifact — Blood", oracle: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card." },
  map: { name: "Map", type: "Token Artifact — Map", oracle: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery." },
  // ── SHELF: three more predefined artifact tokens (2026-07-28). Each oracle string below is the PRINTED
  // reminder text read out of the bundled index, not written from memory, and each is identical across every
  // printing that makes one. They earn a registry slot on the same bar the six above meet: the token's
  // ability PARSES AND RUNS, so minting one hands the player a permanent the engine can actually use —
  // verified per token rather than assumed (tutor / add-counter / impulse-exile programs, all HIGH).
  // Registering a token whose ability the engine could NOT execute would be the phantom-mana mistake in a
  // new costume: a card credited native whose payoff silently does nothing.
  lander: { name: "Lander", type: "Token Artifact — Lander", oracle: "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." },
  mutagen: { name: "Mutagen", type: "Token Artifact — Mutagen", oracle: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery." },
  // POWERSTONE (QUARTET Phase 4 step 3, 2026-09-06 — Koilos Roc, Stone Retrieval Unit, the Brothers' War cycle): the printed
  // reminder text, verbatim. Its mana is RESTRICTED — the negative "can't be spent to cast a nonartifact spell" now parses
  // (manaModel.parseSpendRestriction: artifact casts + every ability), so the token taps for a {C} the planner spends only where
  // the card allows — the same bar the other entries meet: the ability PARSES AND RUNS, never a phantom-mana rock.
  powerstone: { name: "Powerstone", type: "Token Artifact — Powerstone", oracle: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
  junk: { name: "Junk", type: "Token Artifact — Junk", oracle: "{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery." },
  // ── ROLE TOKENS (Wilds of Eldraine; CR 303.4 Auras). ⛔ NOT artifacts like every entry above: a Role is an
  // AURA token that enters ATTACHED to a creature, which is why applyCreateNamedToken grew an attach path and
  // why these carry `aura: true`.
  //
  // ⭐ EVERY ORACLE STRING BELOW IS COPIED OUT OF THE BUNDLED DATA, never written from memory (CLAUDE.md §1.2).
  // The Roles ship as DFC token objects whose type line is "Token Enchantment — Aura Role";
  // roleTokenData.test.js re-reads those objects and asserts each string here matches them, so this table
  // cannot drift from its source.
  //
  // ⛔ ONLY THE FIVE WHOSE BODY THE ENGINE CAN ACTUALLY EXECUTE ARE REGISTERED — the same bar the artifact
  // tokens above set for themselves. Verified per Role by classifying its body as an Aura card: Cursed
  // native-aura · Monster native-aura · Royal native-aura · Sorcerer native-trigger · Virtuous native-aura.
  // And the runtime was proven before any of this: an attached Aura TOKEN derives correctly on its host
  // (Monster → 3/3 + trample; Cursed → base 1/1; the same token unattached → nothing).
  //
  // ⛔ DELIBERATELY ABSENT, for two different reasons, both pinned as refusal tests:
  //   • Wicked     — "When this Aura is put into a graveyard from the battlefield, each opponent loses 1 life."
  //                  is unmodeled (the Role body classifies body-only). Arrives with that trigger.
  //   • Young Hero — its quoted "…if its toughness is 3 or less…" trigger is unmodeled (body-only). Arrives
  //                  with the self-P/T-threshold intervening-if.
  //   • Chef / Questing / Huntsman — cards ASK for these, but NO definition exists in the bundled data, so
  //                  their text cannot be written at all. Permanent refusal until the data carries them.
  // Registering any of those would mint a token whose ability silently does nothing — the phantom-mana
  // mistake in a new costume, which is exactly what this registry's own standard forbids.
  cursed: { name: "Cursed", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature has base power and toughness 1/1." },
  monster: { name: "Monster", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has trample." },
  // Royal keeps its printed ward REMINDER because the bundled object carries it inline on the ability line
  // (reminder text has no rules meaning — CR 207.2 — and the body classifies native-aura with it present).
  // The data-pinning test compares byte-for-byte, and it caught this omission on its first run.
  royal: { name: "Royal", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has ward {1}. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)" },
  sorcerer: { name: "Sorcerer", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has \"Whenever this creature attacks, scry 1.\"" },
  virtuous: { name: "Virtuous", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control." },
  // ⭐ PHASE 2 — Young Hero joined once its granted trigger became executable (the self-P/T-threshold
  // intervening-if, interveningIf.js). ⛔ AND THE GATE DEMANDED IT: verify-role-token-data.mjs failed with
  // "Young Hero: its body is NOW EXECUTABLE — register it", which is the gate proving it wasn't passing
  // vacuously. The registry never leads the engine here; it follows what the engine can execute.
  "young hero": { name: "Young Hero", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\"" },
  // ⭐ PHASE 3 — Wicked joined once the Aura-own put-into-graveyard trigger stopped being hardcoded to a single
  // payoff (triggers.js: "this aura" now rides the general SELF-PiG arm). The gate demanded this promotion too,
  // for the third time: "Wicked: its body is NOW EXECUTABLE — register it". With Wicked in, all SEVEN Roles
  // that exist in the bundled data are registered, and the only remaining refusals are the three with no
  // definition at all.
  wicked: { name: "Wicked", type: "Token Enchantment — Aura Role", aura: true, oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhen this Aura is put into a graveyard from the battlefield, each opponent loses 1 life." },
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
  // ===== ROLE / AURA-TOKEN ATTACHMENT (CR 303.4) =====================================================
  // A Role is an AURA token: it enters ATTACHED to the chosen creature, and its whole effect flows from the
  // attachment (layers reads `attachedTo` and applies the Aura's bonus — proven on a minted token before this
  // was written). Every OTHER entry in NAMED_TOKENS is a free-standing artifact, so this branch is gated on
  // `spec.aura` and the artifact path stays byte-identical.
  //
  // ⛔ NO LEGAL OBJECT TO ENCHANT → THE TOKEN IS NOT CREATED AT ALL (CR 303.4). Minting it unattached would
  // be worse than doing nothing: a permanent on the battlefield that the rules say shouldn't exist, and whose
  // buff silently applies to no one. This also covers the "up to one target creature" forms with zero targets
  // chosen (a legal choice) and a target that left the battlefield before resolution.
  const attachTargetId = spec.aura
    ? (ctx.targets?.find((tg) => tg?.type === "creature" && findPermanent(next, tg.id))?.id ?? null)
    : null;
  if (spec.aura && !attachTargetId) {
    return logEvent(next, { kind: "spell-effect", effect: "create-named-token", token: atom.token, count: 0, note: "no legal object to enchant", controller: creatorId });
  }
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
    // An Aura token enters ALREADY ATTACHED (CR 303.4b). ⛔ Routed through attachPermanent rather than stamping
    // `attachedTo` by hand: that helper maintains BOTH sides of the link — `attachedTo` on the Aura AND the
    // host's `attachments` array — and a half-link would be invisible to every reader that walks the host
    // (the ATTACHED-watcher scan in checkCombatDamageTriggers, for one) while looking correct to the readers
    // that walk the Aura. It is also the single chokepoint where a control-Aura's control change is applied,
    // so using it keeps Role attachment on the same path as every printed Aura.
    if (attachTargetId) next = attachPermanent(next, { equipId: minted.id, targetId: attachTargetId });
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
 * ⚠️ DEAD-FIELD WARNING (verified 2026-07-25, census scoping for mobilize): `atom.entersAttacking` sets
 * `permanent.attacking = true`, and NOTHING READS THAT PROPERTY. Attacking-ness is determined solely by
 * membership in `state.combat.attackers` — combatResolution iterates that list for every damage step, and
 * layers.js's `attacking` selector queries it too (grep confirms zero other readers). So a token minted
 * "tapped and attacking" today would sit inert: never dealing combat damage, never seen by an attacking
 * selector. Any future slice crediting mobilize / "create N tapped and attacking tokens" MUST also register
 * the minted tokens in state.combat.attackers with a defender, or it ships a classification that the
 * runtime silently never honors (the exact trap the runbook's failure table row 4 names). Left as-is rather
 * than deleted: the field is the right shape for that build, it just isn't wired yet.
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
  // ATTACHED (Springheart Nantuko) — the creature this permanent is ATTACHED TO. A bestowed Aura's own
  // `attachedTo` is the referent for its "create a token that's a copy of THAT creature": "that creature" is
  // the one named by the payment condition ("if this permanent is attached to a creature you control"), never
  // the source itself. Read LIVE at resolution — if the host left in response, there is nothing to copy and
  // CR 111.12 gives a clean no-op rather than a fabricated body or a copy of the wrong creature.
  if (atom.copySource === "attached") {
    const self = ctx.sourceId ? findPermanent(state, ctx.sourceId)?.permanent : null;
    return self?.attachedTo ? findPermanent(state, self.attachedTo)?.permanent || null : null;
  }
  if (atom.copySource === "target") {
    const t = (ctx.targets || []).find((x) => x?.type === "creature") || (ctx.targets || [])[0];
    return t?.id ? findPermanent(state, t.id)?.permanent : null;
  }
  // POPULATE (CR 701.32a) — "Create a token that's a copy of a creature token you control." The source is
  // CHOSEN by the controller from their own creature TOKENS, and it is not a target (populate never uses
  // the word), so nothing is chosen at cast time and the pick happens here at resolution.
  //
  // ⛔ TOKENS ONLY, and that is the rule rather than a simplification: `card.token` is the same flag the
  // token-copy minter stamps and Miirym's nontoken gate reads. A nontoken creature is NOT a legal populate
  // source, so copying one would be strictly more than the card allows.
  //
  // NO LEGAL SOURCE ⇒ null ⇒ applyCreateTokenCopy's CR 111.12 clean no-op. That is the printed outcome for
  // a player with no creature tokens, not an engine shortfall.
  //
  // THE PICK IS DETERMINISTIC AND STATED, so a self-play trace is reproducible: the largest body by
  // power+toughness, ties broken by the permanent id. Populate's own choice is unconstrained by the rules
  // (any creature token you control), so any legal pick is faithful; picking the biggest is the obvious
  // play and never illegal.
  if (atom.copySource === "creatureTokenYouControl") {
    const bf = state.players?.[ctx.controller]?.battlefield || [];
    const tokens = bf.filter((p) => p?.card?.token && /\bcreature\b/i.test(String(p.card.type || "")));
    if (!tokens.length) return null;
    const score = (p) => (Number(p.card.power) || 0) + (Number(p.card.toughness) || 0);
    return tokens.slice().sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)))[0];
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
  // ⭐ CR 707.9a — "except the token isn't legendary" (Miirym Sentinel Wyrm, Quasiduplicate's kin). The SAME
  // stripLegendary rider cloneCopy uses, so the token's type line genuinely lacks the supertype.
  // ⛔ THIS IS LOAD-BEARING, NOT COSMETIC. sba.js enforces CR 704.5j (applyLegendRule) by grouping a
  // player's legendary permanents BY NAME off the type line and destroying all but the newest. A token copy
  // of a legendary permanent that KEPT "Legendary" dies to that rule the instant it enters — which for
  // Miirym (a token copy of every legendary Dragon you cast) meant the card did nothing at all.
  if (atom.notLegendary) copyRiders.push({ kind: "stripLegendary" });
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
  // TREASURE VAULT (KN-4): "Create X Treasure tokens." with NO "where X is" — X is the activation's chosen X (ctx.xValue).
  const bareX = t.match(/^create x (treasure|clue|food|gold|blood) tokens?$/);
  if (bareX) return { op: "create-named-token", token: bareX[1], countX: true, targetType: null };
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
  //
  // LANDER / MUTAGEN / JUNK join on the SAME evidence-first rule, and the narrowness is deliberate rather
  // than an oversight — I counted the printed clauses before widening anything. Of every corpus clause
  // creating one of the three, 50 use this fixed-N form ("create a <tok> token", plus one each of "two" and
  // "three"); the dynamic anchors above account for ~6 between them ("create X Lander tokens", "for each
  // +1/+1 counter on it"). Only the form the cards actually print is opened, exactly as Map was. Blanket-
  // deriving this alternation from Object.keys(NAMED_TOKENS) would have been one line and would have opened
  // token/form pairs no card prints — harmless to coverage, but it discards the evidence the narrow anchors
  // encode, and this file's standard is that an anchor states what was measured.
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (tapped )?(treasure|clue|food|gold|blood|map|lander|mutagen|junk|powerstone) tokens?$/); // + powerstone (2026-09-06)
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
  // ===== ROLE TOKENS (CR 303.4) — "Create a <Role> Role token attached to <target creature>" ============
  // The anchor states what was measured, per this file's standard. All 38 printed Role-creation clauses were
  // censused; the TARGETED family is built here:
  //   "attached to target creature you control"                 "attached to another target creature you control"
  //   "attached to up to one target creature you control"        "attached to up to one other target creature you control"
  //   "attached to up to one target creature"                    "attached to another target creature"
  // The REFERENT forms ("attached to that creature", "attached to it") need a saga/ETB self-reference and are
  // NOT matched here → Arbiter (a safe FN); likewise Questing Cosplayer's reversed "create a … token and attach
  // it to target creature" word order.
  //
  // ⛔ THE ROLE ALTERNATION IS THE FIVE REGISTERED ROLES, SPELLED OUT — not derived from Object.keys. Wicked
  // and Young Hero are absent because their bodies are unmodeled, and Chef / Questing / Huntsman because no
  // definition exists in the bundled data. A card naming any of those falls through unmatched → Arbiter, which
  // is the whole point: an unregistered Role must never mint a do-nothing token.
  //
  // "up to one" makes the target OPTIONAL (a legal zero-target choice); the resolver's CR 303.4 guard then
  // creates nothing, which is correct rather than a silent unattached mint.
  m = t.match(/^create a (cursed|monster|royal|sorcerer|virtuous|young hero|wicked) role token attached to (?:up to one )?(?:another |other )?target creature( you control)?$/);
  if (m) {
    return { op: "create-named-token", token: m[1], count: 1, targetType: m[2] ? "creatureYouControl" : "creature" };
  }
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
/**
 * ATTACH-TO-CREATED-TOKEN (CR 701.3) — the printed, spelled-out form of what Living Weapon / For Mirrodin!
 * do as a keyword: "When this Equipment enters, create a 1/1 white Soldier creature token, then attach this
 * Equipment to it." (Ancestral Blade, Hook Swords, Foot Chopper, Barbed Spike, Kyoshi Battle Fan …).
 *
 * The keyword forms mint a FIXED token in resolvers.enterPermanent; these print their token spec, so they
 * route through the ordinary create-token atom instead — the rider just has to survive the parse. Peel it
 * here, parse the remainder with the unchanged core, and stamp the flag onto the resulting atom (the same
 * fold shape as the tap+noUntapNext rider): "it" is the token this very atom mints, so there is no
 * cross-atom reference to resolve.
 *
 * DELIBERATELY NOT routed through livingWeaponToken: these cards carry a REAL printed trigger sentence, so
 * minting from the keyword path as well would create the token TWICE the moment this clause parses HIGH.
 *
 * Guarded to a single, statically-counted token — "it" presupposes exactly one. A dynamic or multiple count
 * returns null (park → Arbiter) rather than guessing which token the Equipment lands on.
 */
export function createTokenClauseParser(clause) {
  const m = String(clause || "").replace(/[’]/g, "'").match(/^(.*?),?\s*then attach this equipment to it\.?\s*$/i);
  if (!m) return createTokenClauseParserCore(clause);
  const inner = createTokenClauseParserCore(m[1]);
  if (!inner || inner.op !== "create-token") return null;
  const singleStaticToken = (inner.count == null || inner.count === 1)
    && !inner.countX && !inner.countContext && !inner.countFor;
  if (!singleStaticToken) return null;
  return { ...inner, attachSourceToCreated: true };
}

/**
 * ATTACH-SOURCE-TO-LAST-TOKEN (Cori-Steel Cutter, W9 — CR 701.3): the OPTIONAL sibling of the folded
 * mandatory rider above. The Cutter prints the attach as its OWN sentence — "You may attach this Equipment
 * to it." — so the splitter hands it over as a separate clause, the α2 peel strips "you may" and stamps
 * `optional` (a REAL yes/no: attaching moves the Cutter OFF its current host, which a human may want or
 * refuse — the fresh hasty Monk is often the better wearer). "It" is the token the PRECEDING create-token
 * atom just minted — read off the _lastMintedTokenIds stamp ∩ still-alive (CR 608.2b); a missing stamp /
 * dead token / vanished source → a logged no-op (the FN-safe referent convention). The parser's sequence
 * gate (attachLastTokenSequenceOk) refuses the atom without a preceding create-token in the SAME program,
 * so a stray printed sentence can never parse HIGH and silently no-op (the dropped-clause FP).
 */
export function applyAttachSourceToLastToken(state, atom, ctx) {
  const ids = Array.isArray(state._lastMintedTokenIds) ? state._lastMintedTokenIds : [];
  const tokenId = ids.length === 1 ? ids[0] : null;
  const src = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!tokenId || !src || !findPermanent(state, tokenId)) {
    return logEvent(state, { kind: "spell-effect", effect: "attach-source-to-last-token", controller: ctx.controller, attached: false });
  }
  const next = attachPermanent(state, { equipId: ctx.sourceId, targetId: tokenId });
  return logEvent(next, { kind: "spell-effect", effect: "attach-source-to-last-token", controller: ctx.controller, attached: true, target: tokenId });
}

export function attachSourceToLastTokenClauseParser(clause) {
  const t = String(clause || "").replace(/[’]/g, "'").trim().toLowerCase().replace(/\.$/, "");
  if (t === "attach this equipment to it") return { op: "attach-source-to-last-token", targetType: null };
  return null;
}

function createTokenClauseParserCore(clause) {
  // A leading "you " is a redundant subject — the token's controller is ALWAYS the effect's controller
  // (CR 111.1), so "you create …" ≡ "create …". The conjoined payload form ("you create a … token and …",
  // e.g. Sword of Body and Mind) carries it on the first sub-clause; strip it so the create anchors below
  // bind. Strictly a PROMOTION (can only let an already-low clause parse) — never changes a token's owner.
  let t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/^you create /, "create ");
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
  // "A NUMBER OF" DYNAMIC COUNT (SHELF-85 H5, 2026-09-04 — Krenko, Tin Street Kingpin "create a number of 1/1 red Goblin
  // creature tokens equal to this creature's power"): the "X … where X is" form one wording over; the same parseCountSource
  // gate (an unmodeled count → null → Arbiter, never a fabricated count).
  const mnum = t.match(/^create a number of (\d+)\/(\d+) ([a-z/ ]+?) creature tokens equal to (.+)$/);
  if (mnum) {
    const toughness = parseInt(mnum[2], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(mnum[3]);
    if (!landMana.ok || landMana.oracle) return null;
    const countFor = parseCountSource(mnum[4].replace(/^the (?:total )?number of /, ""));
    return countFor ? { op: "create-token", power: parseInt(mnum[1], 10), toughness, descriptor: mnum[3].trim(), countFor, targetType: null } : null;
  }
  const mxw = t.match(/^create x (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?,? where x is (?:equal to )?(.+)$/);
  if (mxw) {
    const toughness = parseInt(mxw[2], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(mxw[3]);
    if (!landMana.ok || landMana.oracle) return null; // a land token's intrinsic mana + a dynamic count is unprinted — park (CREED)
    const countFor = parseCountSource(mxw[4].replace(/^the (?:total )?number of /, ""));
    return countFor ? { op: "create-token", power: parseInt(mxw[1], 10), toughness, descriptor: mxw[3].trim(), countFor, targetType: null } : null;
  }
  // ===== TAPPED-AND-ATTACKING FOR-EACH (Otharri, Suns' Glory — SHELF-TAIL O1, CR 508.1c) ===== "create a
  // <P>/<T> <desc> creature token that's tapped and attacking for each <count source>". The mobilize
  // disposition (enters TAPPED and joins combat.attackers vs the trigger's defender — applyCreateToken's
  // entersAttacking wiring, the applyMobilize convention) on a dynamic count. Placed BEFORE the plain
  // for-each anchor: that regex needs "creature token" immediately followed by "for each", so this
  // disposition-carrying variant never reaches it. tapped + entersAttacking are COMBAT STATE (per the
  // dead-field warning above) — a type-add descriptor is still forbidden here (a Rebel/Warrior subtype is
  // fine; the parser's non-land descriptor gate keeps it clean).
  // ===== PER-OPPONENT TAPPED-AND-ATTACKING (SHELF-85 · Halfshell Q4 Endless Foot Assault, 2026-09-05; Ainok Strike
  // Leader) ===== "for each opponent, create a <P>/<T> <desc> creature token that's tapped and attacking THAT PLAYER": one
  // token per opponent, EACH joining combat against ITS opponent (not the trigger's single defender). `perOpponent` sets the
  // count to the live opponent count at resolution and applyCreateToken assigns the i-th minted token to the i-th opponent
  // (round-robin under a token doubler — every copy still attacks a player). Adeline's "that player or a planeswalker that
  // player controls" is a CHOICE this arm does not read — it falls through and parks (CREED).
  const mpo = t.match(/^for each opponent, create (?:a|an|one) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens? that's tapped and attacking that player$/);
  if (mpo) {
    const toughness = parseInt(mpo[2], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(mpo[3]);
    if (!landMana.ok || landMana.oracle) return null; // a land token minting tapped-and-attacking is unprinted → park (CREED)
    return { op: "create-token", power: parseInt(mpo[1], 10), toughness, descriptor: mpo[3].trim(), perOpponent: true, tapped: true, entersAttacking: true, targetType: null };
  }
  const mta = t.match(/^create (?:a|an|one) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens? that's tapped and attacking for each (.+)$/);
  if (mta) {
    const toughness = parseInt(mta[2], 10);
    if (toughness < 1) return null;
    const landMana = landTokenManaOracle(mta[3]);
    if (!landMana.ok || landMana.oracle) return null; // a land token minting tapped-and-attacking is unprinted → park (CREED)
    const countFor = parseCountSource(mta[4]);
    return countFor ? { op: "create-token", power: parseInt(mta[1], 10), toughness, descriptor: mta[3].trim(), countFor, tapped: true, entersAttacking: true, targetType: null } : null;
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
  // TAPPED creature token (Tormod, the Desecrator "create a TAPPED 2/2 black Zombie…", 2026-08-15): the
  // adjective rides the SAME atom.tapped flag the Treasure-maker already mints honored (createPermanent
  // tapped at the one mint chokepoint) — no new enforcement, one captured word.
  // TARGET-OPPONENT CREATES A CREATURE TOKEN (CORPUS ④-F, 2026-09-03 — Forbidden Orchard, the Hunted cycle, Ox Drover, the
  // Phelddagrifs; CR 111.2): the creature-token sibling of the treasure/food arm above. RECURSES on the "create …"
  // form so every count / P/T / colour / keyword rule stays in ONE place, then stamps the chosen opponent as the
  // creator (whoCreates:"target" — applyCreateToken mints under THAT player, their doubler applies). A rider the
  // general arm can't read ("with protection from black" — Hunted Horror) returns null → the whole clause stays
  // LOW → Arbiter, never a stub token.
  const toc = t.match(/^target opponent creates? (.+)$/);
  if (toc) {
    const inner = createTokenClauseParser("create " + toc[1]);
    if (inner && inner.op === "create-token") return { ...inner, targetType: "opponent", whoCreates: "target" };
    return null;
  }
  // SHELF-85 S4 (2026-09-04 — Parhelion II "create two 4/4 white Angel creature tokens with flying and vigilance THAT ARE
  // ATTACKING"): the trailing attacking disposition on the fixed-count arm. The rider is peeled BEFORE the main match
  // (so the "with …" keyword list stays exactly what it was); `that are tapped and attacking` also taps. Combat state,
  // not a characteristic — applyCreateToken registers the minted tokens as attackers against ctx.defenderId (the
  // Otharri / mobilize convention); outside an attack context the flag is inert and the tokens simply enter.
  let attackingRider = null;
  {
    const ar = t.match(/^(create .+?)( that are (tapped and )?attacking)$/);
    if (ar) { attackingRider = { tapped: !!ar[3] }; t = ar[1]; }
  }
  const m = t.match(/^create (a|an|one|two|three|four|five|\d+) (tapped )?(\d+)\/(\d+) ([a-z/ ]+?) creature tokens?(?: named ([a-z' ]+?))?(?: with (.+))?$/);
  if (m) {
    const entersTapped = !!m[2] || !!attackingRider?.tapped;
    m.splice(2, 1); // drop the tapped group so every existing index below reads unchanged
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
    const base = { op: "create-token", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), power, toughness, descriptor: m[4].trim(), ...(entersTapped ? { tapped: true } : {}), ...(attackingRider ? { entersAttacking: true } : {}), ...(tokenName ? { name: tokenName } : {}), ...(landMana.oracle ? { tokenOracle: landMana.oracle } : {}), targetType: null };
    if (m[6] === undefined) return base;
    // A QUOTED inline ability → the clean-mana-ability gate (T4) OR the curated self-dies TRIGGERED-ability gate
    // (T5: a Pest's dies→gain-life, a Devil's dies→deal-damage — both minted as real oracle so checkDiesTriggers
    // fires them); a non-quoted phrase → the keyword path. The quote disambiguates ability-vs-keyword; a quoted
    // ability outside BOTH curated gates → null → low → Arbiter (CREED — never a token carrying an unfired ability).
    if (/^["“']/.test(m[6].trim())) {
      const tokenOracle = parseTokenManaAbility(m[6]) || parseTokenTriggeredAbility(m[6]) || parseTokenStaticAbility(m[6]); // S8: the Pilot's crew boost
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
    // PROWESS TOKEN (Cori-Steel Cutter's Monk, W9): prowess is a TRIGGERED keyword — not a grantable
    // static — so it can't ride parseTokenKeywords (that would stamp an inert word the runtime ignores).
    // The changeling convention: mint the token with "Prowess" as its ORACLE, so the real prowess
    // machinery (native-body-proven — detection reads the permanent's card) fires its cast-pump exactly
    // like a printed Monastery Swiftspear. Bare "prowess" only; a companion list stays all-or-nothing
    // through the static path (no corpus carrier mixes them).
    if (/^prowess\.?$/i.test(withPhrase.trim())) return { ...base, tokenOracle: "Prowess" };
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
  "attach-source-to-last-token": applyAttachSourceToLastToken, // W9 (Cori-Steel Cutter) — the optional attach onto the just-minted token
  "create-named-token": applyCreateNamedToken, // ===== TOKENS ===== T2 Treasure/Clue/Food/Gold
  "create-token-copy": applyCreateTokenCopy,   // ===== TOKEN-COPY ===== (Wave 5b) CR 707.1 — token that's a copy
  "create-token-copy-each": applyCreateTokenCopyEach, // ===== TOKEN-COPY-EACH ===== (COPY-RIDER) Second Harvest — copy each token you control
  "mobilize": applyMobilize,        // KW-MOBILIZE (CR 702.174) — N tapped tokens that JOIN combat.attackers (see below)
  "mobilize-sac": applyMobilizeSac, // the CR 603.7 delayed half, fired at the next end step
};

// ─── KW-MOBILIZE (CR 702.174) ────────────────────────────────────────────────────
/**
 * The kind-tagged sentinel detectTriggers synthesizes from the printed keyword
 * ("[mobilize] create N tapped attacking warrior tokens"). Only this parser models that sentinel, so no
 * printed clause can route here — the same containment renown and evolve use.
 */
export function mobilizeClauseParser(clause) {
  const m = String(clause || "").trim().match(/^\[mobilize\] create (\d+) tapped attacking warrior tokens$/i);
  return m ? { op: "mobilize", amount: parseInt(m[1], 10), targetType: null } : null;
}

/**
 * KW-MOBILIZE resolution — "create N tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them
 * at the beginning of the next end step."
 *
 * THE PART THAT ACTUALLY MATTERS: "attacking" is NOT a property of the permanent. The engine determines
 * attacking-ness solely by membership in `state.combat.attackers`; the `permanent.attacking` field is a
 * DEAD WRITE that nothing reads (see the warning block above applyCreateTokenCopy). So a token minted
 * "tapped and attacking" without a combat.attackers entry would sit inert — never dealing combat damage,
 * never seen by an attacking selector — and crediting the card would be a classification the runtime
 * silently never honors. Each minted token is therefore registered as a real attacker against the SAME
 * defender the source is attacking (ctx.defenderId, threaded by checkAttackTriggers for the attacks event).
 *
 * NO defender in context → mint NOTHING and log it. That can only happen off a non-attacks event, and a
 * pile of inert tokens is worse than none: it would inflate the board with permanents that are attacking on
 * paper and inert in fact (CREED — never a half-modeled effect).
 *
 * The sacrifice is a genuine CR 603.7 delayed trigger through the shared scheduler, not a bespoke sweep.
 * Tokens carry `mobilizedToken` so the delayed clause can find exactly them at the next end step.
 */
export function applyMobilize(state, atom, ctx) {
  const n = Math.max(0, atom.amount || 0);
  const controller = ctx.controller;
  const defender = ctx.defenderId;
  if (!n || !state.players?.[controller]) return state;
  if (!defender) {
    return logEvent(state, { kind: "spell-effect", effect: "mobilize", note: "no defender in context — nothing minted", controller });
  }
  let next = state;
  const mintedIds = [];
  for (let i = 0; i < n; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: "Warrior", type: "Creature — Warrior", power: 1, toughness: 1, colors: ["R"], token: true };
    // Enters TAPPED and already in combat, so it is never summoning-sick-gated out of attacking.
    const perm = { ...createPermanent({ id: minted.id, card, controller }), tapped: true, summoningSick: false, mobilizedToken: true };
    const player = next.players[controller];
    next = { ...next, players: { ...next.players, [controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // Join the CURRENT combat against the source's defender (CR 508.1 — put onto the battlefield attacking;
  // it was never DECLARED as an attacker, so no attack triggers fire for it, which is why this appends to
  // combat.attackers directly rather than routing through the declare-attacker dispatcher.
  const entries = mintedIds.map((id) => ({ permanentId: id, attackingPlayer: controller, defender }));
  next = { ...next, combat: { ...(next.combat || { attackers: [], blockers: [] }), attackers: [...(next.combat?.attackers || []), ...entries] } };
  // ETB: a minted token still ENTERS, so watchers (Impact Tremors / Cathars' Crusade) fire as usual.
  next = fireTokenEnterTriggers(next, mintedIds);
  // CR 603.7 — the sacrifice rides the shared delayed scheduler at the NEXT end step (the printed wording;
  // it is NOT end-of-combat, which is what the reminder text actually says).
  const queue = next.delayedTriggers || [];
  next = {
    ...next,
    delayedTriggers: [...queue, {
      id: `dly-mob-${queue.length + 1}-${next.turn || 0}`,
      controller,
      fireStep: "end",
      fireScope: "any",
      effectClause: "[mobilize-sac] sacrifice the mobilized tokens",
      sourceName: ctx.cardName || null,
      sourceCardId: ctx.sourceCardId || null,
      sourcePermanentId: ctx.sourceId || null,
      createdTurn: next.turn || 0,
    }],
  };
  return logEvent(next, { kind: "spell-effect", effect: "mobilize", controller, count: mintedIds.length, defender });
}

/** The delayed half's sentinel — only this parser models it. */
export function mobilizeSacClauseParser(clause) {
  return /^\[mobilize-sac\] sacrifice the mobilized tokens$/i.test(String(clause || "").trim())
    ? { op: "mobilize-sac", targetType: null } : null;
}

/**
 * Sacrifice every mobilized token the controller still has (CR 701.17). Reads the `mobilizedToken` marker
 * rather than remembering ids, so a token that already left the battlefield is simply absent — never a
 * sacrifice aimed at a stale id. Routed through moveCardToZone + checkDiesTriggers so death triggers and
 * the graveyard event log behave exactly as they do for any other sacrifice.
 */
export function applyMobilizeSac(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state;
  const doomed = player.battlefield.filter((p) => p.mobilizedToken).map((p) => p.id);
  if (doomed.length === 0) return state;
  let next = state;
  for (const id of doomed) {
    const lk = findPermanent(next, id);
    if (!lk) continue;
    next = moveCardToZone(next, { playerId: controller, fromZone: "battlefield", toZone: "graveyard", cardId: id });
  }
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "mobilize-sac", controller, count: doomed.length });
}
