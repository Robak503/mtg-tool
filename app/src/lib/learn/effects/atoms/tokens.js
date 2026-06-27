/**
 * effects/atoms/tokens.js — token-minting atoms (create-token, create-named-token).
 */

import { logEvent, destroyLethalCreatures, findPermanent, createPermanent, mintId } from "../../gameState.js";
import { tokenMultiplier, applyCounterDoubling } from "../../replacementEffects.js"; // Wave-3 doubler (leaf): token count + enters-with-counters bypass addCounter
import { checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers } from "../../triggers.js";
import { snapshotCopiedCard } from "../../cloneCopy.js"; // leaf (imports only gameState) — CR 707.2 copiable-values snapshot
import { TOKEN_COLOR_WORDS, TOKEN_SUPERTYPE_WORDS, TOKEN_CARDTYPE_WORDS, cap, countForSpec } from "./shared.js";
import { SMALL_NUM, NUM_WORD, parseCountSource, parseTokenManaAbility, parseTokenKeywords } from "../parseHelpers.js"; // seam batch 18/19: shared parse helpers (leaf, cycle-free) for create-named-token + create-token clause parsers

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
  const baseCount = atom.countFor
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
  // ===== TREASURE-MAKER ===== the count, mirroring applyCreateToken (the typed-token resolver). DYNAMIC
  // forms resolve AT RESOLUTION (CR 608.2h — a count-derived value is locked as the effect resolves, not at
  // cast/flush): `countFor` is a board count (countForSpec — Dockside "X = artifacts+enchantments your
  // opponents control"; Cavern-Hoard "for each artifact that player controls"); `countX` reads the chosen
  // {X} (ctx.xValue); `countContext` reads a trigger-context number (Old Gnawbone "that many" =
  // ctx.combatDamageAmount, carried by the combat-damage trigger). A 0 dynamic count mints ZERO tokens
  // (CR 107.3 — a clean no-op, NOT forced to 1); a FIXED count is floored at 1.
  const baseCount = atom.countFor
    ? Math.max(0, countForSpec(next, ctx, atom.countFor))
    : atom.countX ? Math.max(0, ctx.xValue || 0)
      : atom.countContext ? Math.max(0, ctx[atom.countContext] || 0)
        : Math.max(1, atom.count || 1);
  // Wave-3 token doubler (CR 616): a "create one or more tokens" doubler (Doubling Season / Parallel Lives /
  // Anointed Procession) doubles named artifact tokens (Treasure/Clue/Food/Gold) too. Multiplied once here.
  const count = baseCount * tokenMultiplier(next, ctx.controller);
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = { id: `tok-${minted.id}`, name: spec.name, type: spec.type, oracle: spec.oracle, token: true };
    // ===== TREASURE-MAKER ===== a "tapped" rider (Generous Plunderer's "a tapped Treasure token") enters
    // the token TAPPED, so it's NOT a mana source until it untaps (manaSources skips perm.tapped + the
    // Treasure ability requires {T}). It still ENTERS, so it fires artifact-ETB watchers exactly like an
    // untapped one (fireTokenEnterTriggers below).
    const perm = createPermanent({ id: minted.id, card, controller: ctx.controller, tapped: !!atom.tapped });
    const player = next.players[ctx.controller];
    next = { ...next, players: { ...next.players, [ctx.controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // ETB (CR 603.6a) — each named artifact token fires artifact-ETB watchers (see fireTokenEnterTriggers).
  next = fireTokenEnterTriggers(next, mintedIds);
  return logEvent(next, { kind: "spell-effect", effect: "create-named-token", token: atom.token, count, tapped: !!atom.tapped, controller: ctx.controller });
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
  if (atom.copySource === "triggering") return ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId)?.permanent : null;
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
  const copiable = snapshotCopiedCard(sourcePerm, undefined);
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
 * The contiguous named-artifact-token family (Treasure/Clue/Food/Gold only — the modeled allowlist), six
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
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  let m = t.match(/^create x (treasure|clue|food|gold) tokens,? where x is (?:equal to )?(?:the number of )?(.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  m = t.match(/^create (?:a|an|one) (treasure|clue|food|gold) tokens? for each (.+)$/);
  if (m) {
    const countFor = parseCountSource(m[2], { allowScopes: true });
    return countFor ? { op: "create-named-token", token: m[1], countFor, targetType: null } : null;
  }
  m = t.match(/^create that many (treasure|clue|food|gold) tokens$/);
  if (m) return { op: "create-named-token", token: m[1], countContext: "combatDamageAmount", targetType: null };
  m = t.match(/^create a number of (tapped )?(treasure|clue|food|gold) tokens equal to its power$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[2], countContext: "dyingPower", targetType: null };
    if (m[1]) atom.tapped = true;
    return atom;
  }
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (tapped )?(treasure|clue|food|gold) tokens?$/);
  if (m) {
    const atom = { op: "create-named-token", token: m[3], count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: null };
    if (m[2]) atom.tapped = true; // only stamp the flag when present, so the untapped atom shape is unchanged
    return atom;
  }
  m = t.match(/^investigate(?: (twice|(?:two|three|four|five|six|seven|eight|nine|ten) times))?$/);
  if (m) return { op: "create-named-token", token: "clue", count: m[1] === "twice" ? 2 : (m[1] ? NUM_WORD[m[1].split(" ")[0]] : 1), targetType: null };
  return null;
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
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const mtf = t.match(/^create (?:a|an|one) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens? for each (.+)$/);
  if (mtf) {
    const toughness = parseInt(mtf[2], 10);
    if (toughness < 1) return null;
    if (/\bland\b/.test(mtf[3])) return null;
    const countFor = parseCountSource(mtf[4]);
    return countFor ? { op: "create-token", power: parseInt(mtf[1], 10), toughness, descriptor: mtf[3].trim(), countFor, targetType: null } : null;
  }
  const m = t.match(/^create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?(?:(?: named [a-z' ]+?)? with (.+))?$/);
  if (m) {
    const power = parseInt(m[2], 10);
    const toughness = parseInt(m[3], 10);
    if (toughness < 1) return null;  // 0-toughness token dies to the lethal SBA → incomplete capture → Arbiter
    if (/\bland\b/.test(m[4])) return null;  // a LAND creature token's intrinsic mana would be dropped → Arbiter
    const base = { op: "create-token", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), power, toughness, descriptor: m[4].trim(), targetType: null };
    if (m[5] === undefined) return base;
    // A QUOTED inline ability → clean-mana-ability gate; a non-quoted phrase → the keyword path. The quote disambiguates.
    if (/^["“']/.test(m[5].trim())) {
      const tokenOracle = parseTokenManaAbility(m[5]);
      return tokenOracle ? { ...base, tokenOracle } : null;
    }
    const kws = parseTokenKeywords(m[5]);
    return kws ? { ...base, keywords: kws } : null;
  }
  return null;
}

export const tokenResolvers = {
  "create-token": applyCreateToken,
  "create-named-token": applyCreateNamedToken, // ===== TOKENS ===== T2 Treasure/Clue/Food/Gold
  "create-token-copy": applyCreateTokenCopy,   // ===== TOKEN-COPY ===== (Wave 5b) CR 707.1 — token that's a copy
};
