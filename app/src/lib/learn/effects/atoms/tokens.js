/**
 * effects/atoms/tokens.js — token-minting atoms (create-token, create-named-token).
 */

import { logEvent, destroyLethalCreatures, findPermanent, createPermanent, mintId } from "../../gameState.js";
import { checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers } from "../../triggers.js";
import { TOKEN_COLOR_WORDS, TOKEN_SUPERTYPE_WORDS, TOKEN_CARDTYPE_WORDS, cap, countForSpec } from "./shared.js";

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
export function fireTokenEnterTriggers(state, mintedIds) {
  let next = state;
  for (const id of mintedIds) {
    const found = findPermanent(next, id);
    if (!found?.permanent) continue;
    next = checkEnterTriggers(next, found.permanent);
    next = checkPermanentEntersTriggers(next, found.permanent);
  }
  return next;
}

export function applyCreateToken(state, atom, ctx) {
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
  // ENTERS-WITH-COUNTERS: a token that enters with N +1/+1 counters (Zaxara's "0/0 Hydra with X counters").
  // `amount` is a resolved count; `countX` reads the chosen {X} (ctx.xValue). Applied BEFORE the lethal SBA
  // so a 0/0 token with counters survives as a real N/N instead of dying immediately (CR 704.5f).
  const ewc = atom.entersWithCounters;
  const counterN = ewc ? Math.max(0, ewc.countX ? (ctx.xValue || 0) : (ewc.amount || 0)) : 0;
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name, type, power: atom.power, toughness: atom.toughness, oracle, keywords, token: true };
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
export const NAMED_TOKENS = {
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
  const count = Math.max(1, atom.count || 1);
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller });
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // ETB (CR 603.6a) — each named artifact token fires artifact-ETB watchers (see fireTokenEnterTriggers).
  next = fireTokenEnterTriggers(next, mintedIds);
  return logEvent(next, { kind: "spell-effect", effect: "create-named-token", token: atom.token, count, controller: ctx.controller });
}

export const tokenResolvers = {
  "create-token": applyCreateToken,
  "create-named-token": applyCreateNamedToken, // ===== TOKENS ===== T2 Treasure/Clue/Food/Gold
};
