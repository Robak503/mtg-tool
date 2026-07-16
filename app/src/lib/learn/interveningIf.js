/**
 * interveningIf.js — a STRICT board-query evaluator for triggered-ability intervening-if conditions
 * (CR 603.4). Near-LEAF: its ONLY engine import is the layer-aware `creaturePower` reader from gameState.js
 * (for the power-qualified creature query) — a deliberately one-directional edge: gameState's transitive
 * closure (ptPrimitive / layers / staticAbilityParser / protection / keywords) never imports interveningIf,
 * so no cycle is introduced and gameEngine / resolvers / coverage can still consult this without one.
 *
 * CR 603.4 — an intervening-if is checked at BOTH the trigger event (flush, before the ability goes on the
 * stack) AND on resolution. If the condition is false at either point, the ability does nothing. So the
 * evaluator is consulted twice: gameEngine.buildTriggerStack drops the trigger when the condition is false
 * at flush; resolvers.js (EFFECT_PROGRAM) re-checks at resolution. This mirrors the win-game intervening-if
 * machinery (effects/atoms/winGame.js evaluateWinThreshold) but for the GENERAL conditional-trigger family.
 *
 * STRICT, never fail-open: `evaluate` returns true/false for a condition it can read, and `null` for one
 * outside its vocabulary. `interveningIfParseable` (the pure shape check, used by the coverage metric AND
 * the flush gate) returns true ONLY for conditions `evaluate` reads — so a trigger is credited native /
 * routed natively ONLY when its condition is genuinely modeled. Everything else stays body-only / Arbiter
 * (false-negative SAFE; a mis-evaluated condition would be a forbidden FP — CREED).
 *
 * SCOPE (v1) — the controller's-board queries, which are the largest clean cluster on the corpus:
 *   "you control a/an/<N> or more <type|subtype>"         (control an artifact, two or more Gates, …)
 *   "you control a/an/<N> or more tapped/untapped <filter>" (a tapped creature, two or more tapped creatures)
 *   "you control a/an/<N> or more token(s)"               (three or more tokens)
 *   "you control no <filter>"                             (no untapped lands, no Snakes)
 *   "you control a/an/<N> or more creature(s) with power N or {greater|more}" (Colossal Majesty, Garruk's
 *      Uprising, Beastbond Outcaster) — a LAYER-AWARE power query (counters + anthems count), evaluated
 *      against creaturePower at flush AND resolution, mirroring the `powerAtLeast` count-source vocabulary.
 *   "[there are|you have] <N> or more <type> cards in your graveyard" (three or more creature cards …)
 *   "an opponent controls more <lands|creatures|artifacts|enchantments> than you" (Knight of the White
 *      Orchid, Loyal Warhound, Ticket Tortoise, Linvala) — an existential board-count compare vs each
 *      opponent (CR 104.3a); and "an opponent has more <life|cards in hand> than you" (Linvala).
 *   "you have N or {less|fewer|more} life" (Convalescent Care "5 or less", Convalescence "10 or less") — the
 *      controller's own life vs a fixed threshold; a pure player.life compare (≤ for less/fewer, ≥ for more).
 *   "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard",
 *      Apothecary Geist "another Spirit", Resistance Squad "another Human") — a CURATED creature subtype,
 *      excluding the entering permanent (CR 113.7), keyed on ctx.triggeringPermanentId like SAME-NAME ETB.
 *   "[a creature|N or more creatures] died this turn" (Twinblade Assassins, Deathreap Ritual, Bulette, the
 *      Morbid family; Inga "three or more", Lagomos "five or more", Tallyman "seven or more") — a TURN-EVENT
 *      history read off the per-turn creature-death tally (gameState.creaturesDiedThisTurn, bumped at the death
 *      chokepoint, reset for all seats at untap). "a creature died" ≡ "1 or more died" (≥1); the cardinal form
 *      compares the all-seats death total (CR 700.4 — any player's creature dying counts) to N.
 *   "it was kicked" (CR 702.33e) — the kicker ETB-trigger condition (Goblin Ruinblaster, Torch Slinger,
 *      Heartstabber Mosquito …): a per-PERMANENT cast-decision flag read off the entering permanent's
 *      `wasKicked` (stamped by resolvers.enterPermanent on a kicked cast), keyed on ctx.triggeringPermanentId.
 *   "tribute wasn't paid" / "tribute was paid" (CR 702.96e) — the Tribute ETB-trigger condition (Pharagax
 *      Giant, Ornitharch, Nessian Demolok, Snake of the Golden Grove …): a per-PERMANENT decision flag read
 *      off the entering permanent's `tributePaid` (stamped by resolvers.enterPermanent when the opponent
 *      chose at ETB), keyed on ctx.triggeringPermanentId exactly like the kicked flag.
 * DEFERRED to the Arbiter (stay LOW): color/multicolored permanents, other power comparisons ("power N or
 * less", toughness), OTHER turn-event history (a NON-creature died, "you gained life this turn", attacked),
 * subtype-scoped death counts ("a Zubera died"), the OTHER cast-decision flags (bargain), state flags
 * (monarch, city's blessing) — each a future increment.
 */

import { creaturePower, creatureToughness } from "./gameState.js"; // layer-aware P/T readers (counters + anthems) — one-way edge, no cycle

// ─── cardinal vocabulary ────────────────────────────────────────────────────────
const NUM_WORD = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
function parseCount(token) {
  const t = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(NUM_WORD, t)) return NUM_WORD[t];
  return null;
}
const NUM_RE = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)";

function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}

// Does a permanent match a parsed FILTER ({ kind, word, state, powerAtLeast })? `state` (the game state) is
// threaded only for the layer-aware power read; it's unused by the type/token/tapped gates.
function permMatchesFilter(perm, filter, state) {
  if (!perm) return false;
  // tapped/untapped state gate
  if (filter.state === "tapped" && !perm.tapped) return false;
  if (filter.state === "untapped" && perm.tapped) return false;
  // POWER gate (layer-aware: counters + anthems count, read at flush AND resolution like the powerAtLeast
  // count-source). Only stamped on a creature filter (parseFilter requires kind:"type" word:"Creature").
  if (filter.powerAtLeast != null && !(creaturePower(perm, state) >= filter.powerAtLeast)) return false;
  if (filter.kind === "all") return true;                  // "permanent(s)"
  if (filter.kind === "token") return !!(perm.token || perm.card?.token);
  // type/subtype containment: whole-word, Title-cased singular ("creatures" → \bCreature\b)
  const re = new RegExp(`\\b${filter.word}\\b`, "i");
  return re.test(typeStr(perm.card));
}

// Words that read as a "you control a <word>" filter but are NOT card types/subtypes — a DESIGNATION or
// characteristic the type line never carries, so a naive \bWord\b type-line scan would silently count 0
// and mis-evaluate the condition (a forbidden FP — e.g. "you control a commander" is your commander, not a
// "Commander"-typed permanent). Reject these → the condition stays unparseable → Arbiter (false-negative SAFE).
const NON_TYPE_WORDS = new Set(["commander", "monarch", "creature's", "spell", "card", "blessing"]);

// Parse a filter phrase ("artifacts", "tapped creatures", "tokens", "permanents", "untapped lands",
// "Gates") into { kind, word, state } — or null if it isn't a clean single-word type/subtype filter.
function parseFilter(phrase) {
  let p = String(phrase || "").trim().toLowerCase();
  let state = null;
  const sm = p.match(/^(tapped|untapped)\s+(.+)$/);
  if (sm) { state = sm[1]; p = sm[2].trim(); }
  // POWER-QUALIFIED CREATURE — "creature(s) with power N or {greater|more}" (Colossal Majesty et al). Mirrors
  // the `powerAtLeast` count-source vocabulary EXACTLY: only "creature(s)", only the "N or greater/more" form
  // (a "power N or less" / "toughness …" qualifier fails the anchor → null → Arbiter, CREED). The power is
  // read LAYER-AWARE at evaluation (permMatchesFilter → creaturePower). Combinable with a tapped/untapped state.
  const pm = p.match(/^creatures? with power (\d+) or (?:greater|more)$/);
  if (pm) return { kind: "type", word: "Creature", state, powerAtLeast: parseInt(pm[1], 10) };
  // must be a single word now (no riders like "you control", "named ...", or an unmodeled power/toughness rider)
  if (!/^[a-z]+$/.test(p)) return null;
  // INVARIANT BASIC-LAND TYPES (CR 205.3i): "Plains" is spelled the same singular and plural — a naive
  // trailing-s strip yields "Plain", whose Plain type-line scan matches NOTHING, so an intervening-if
  // like "you control two or more Plains" would evaluate FALSE forever while interveningIfParseable still
  // returns true → a native-classified trigger that can never fire (Gwyllion / Duergar Hedge-Mage). Keep the
  // basic land types verbatim. (Island/Swamp/Mountain/Forest singularize correctly, but pinning all five is
  // the clearest guard.)
  const BASIC_LAND_TYPES = { plains:"Plains", island:"Island", swamp:"Swamp", mountain:"Mountain", forest:"Forest", wastes:"Wastes" };
  if (BASIC_LAND_TYPES[p]) return { kind: "type", word: BASIC_LAND_TYPES[p], state };
  const singular = p.replace(/s$/, "");
  if (NON_TYPE_WORDS.has(singular) || NON_TYPE_WORDS.has(p)) return null; // a designation, not a type → Arbiter
  if (singular === "permanent") return { kind: "all", state };
  if (singular === "token") return { kind: "token", state };
  const word = singular.charAt(0).toUpperCase() + singular.slice(1); // type lines are Title-Cased
  return { kind: "type", word, state };
}

function controllerBoard(state, controllerId) {
  return state?.players?.[controllerId]?.battlefield || [];
}

// DEATHS-THIS-TURN (CR 700.4) — total creatures that died this turn across ALL seats (the sum of every
// player's per-turn creaturesDiedThisTurn tally). "a creature died this turn" / "N or more creatures died this
// turn" are unscoped, so any player's creature dying counts. A seat with no tally → 0.
function deathsThisTurnTotal(state) {
  return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl?.creaturesDiedThisTurn || 0), 0);
}

// Opponent ids = every seat that ISN'T the controller. Computed inline from the live player map (NOT via
// gameState.opponentsOf, which assertPlayer-throws on the synthetic probe id used by interveningIfParseable).
// Stable order (Object.keys); used only for "an opponent <comparison> than you" (an existential over opponents),
// so order doesn't affect the result. A 1-seat probe board yields no opponents → the comparison is vacuously
// false there, which is exactly what interveningIfParseable wants (a parseable shape returns a boolean, not null).
function opponentIds(state, controllerId) {
  return Object.keys(state?.players || {}).filter((id) => id !== controllerId);
}

// ===== OPPONENT-COMPARISON (CR 603.4 board query — the "behind on a resource" ramp/payoff family) =========
// "an opponent <controls more X | has more Y> than you" — TRUE iff AT LEAST ONE opponent's tally strictly
// exceeds the controller's (CR 104.3a — each opponent is compared independently; "an opponent" = the existential).
// METRIC kinds (each a count the live state exposes directly, never fabricated):
//   controls more <permanent-type>  → battlefield permanents of that card type (lands/creatures/artifacts/
//                                      enchantments), a word-anchored type-line read (reuses parseFilter).
//   has more life                   → player.life
//   has more cards in hand          → player.hand.length
// Strictly LAYER-IRRELEVANT (a pure count/total compare), so it's read identically at flush AND resolution.
const OPP_CONTROLS_MORE_RE = /^an opponent controls more (lands|creatures|artifacts|enchantments) than you$/;
const OPP_HAS_MORE_RE = /^an opponent has more (life|cards in hand) than you$/;

// ===== OPPONENT CONTROLS N-OR-MORE (CR 603.4 board query — the "opponent has a board" payoff family) =======
// "an opponent controls a/an/<N> or more <filter>" (Defense of the Heart "three or more creatures") — TRUE iff
// AT LEAST ONE opponent controls ≥N permanents matching the filter (CR 104.3a — each opponent counted
// independently; "an opponent" = the existential over opponents). Distinct from OPP_CONTROLS_MORE (a compare
// vs the controller's own count): this is an ABSOLUTE per-opponent threshold. The filter reuses parseFilter /
// permMatchesFilter (so type/subtype/token/tapped-state all work, layer-irrelevant board counts read
// identically at flush AND resolution). A single opponent's board of ≥N matches satisfies it; a malformed
// filter → parseFilter null → the whole condition is unparseable → Arbiter (false-negative SAFE, CREED).
const OPP_CONTROLS_N_RE = new RegExp(`^an opponent controls ${NUM_RE}(?: or more)? (.+)$`);

// ===== CONTROLLER LIFE THRESHOLD (CR 603.4 board query — the "low-on-life payoff" family) ==================
// "you have N or {less|fewer|more} life" — a pure player.life numeric compare for the CONTROLLER (NOT an
// opponent existential like OPP_HAS_MORE). "N or less"/"N or fewer" → life ≤ N (Convalescent Care "5 or less",
// Convalescence "10 or less"); "N or more" → life ≥ N. Life is a single integer the live state exposes
// directly (player.life), strictly LAYER-IRRELEVANT, so it reads identically at flush AND resolution like
// every other board-count condition. CREED: a deterministic numeric compare, never fail-open — a malformed
// or out-of-vocabulary life phrase falls through to the final `return null` → Arbiter (false-negative SAFE).
const CTRL_LIFE_THRESHOLD_RE = /^you have (\d+) or (less|fewer|more) life$/;

function controllerMetric(state, controllerId, kind) {
  const player = state?.players?.[controllerId];
  if (!player) return 0;
  if (kind === "life") return player.life || 0;
  if (kind === "cards in hand") return (player.hand || []).length;
  // a permanent-type count — word-anchored type-line match (singular Title-case), mirroring parseFilter
  const word = kind.replace(/s$/, "");
  const re = new RegExp(`\\b${word.charAt(0).toUpperCase() + word.slice(1)}\\b`, "i");
  return (player.battlefield || []).filter((p) => re.test(typeStr(p.card))).length;
}

// ===== CONTROL-ANOTHER-SUBTYPE (CR 603.4 + 113.7 — "another" excludes the trigger source) =================
// "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard", Apothecary
// Geist "another Spirit", Resistance Squad "another Human") — TRUE iff the controller controls a creature of that
// subtype OTHER THAN the entering permanent (the trigger's triggeringPermanent, threaded as ctx.triggeringPermanentId
// exactly like SAME-NAME ETB). The subtype must be in the CURATED creature-subtype allowlist (a proper noun that
// appears verbatim ONLY in the subtype portion of a type line — no left-of-dash collision — so a `\b<sub>\b`
// type-line containment selects exactly the subtyped creatures, CR 205.3m). A non-curated word ("Outlaw" is a
// DESIGNATION, not a creature type; a color; a card type) is NOT in the set → null → Arbiter (CREED: never a
// mis-scoped / fabricated tribal gate). Mirrors the curated MASS_CREATURE_SUBTYPES allowlist discipline.
const CTRL_ANOTHER_SUBTYPE_RE = /^you control another ([a-z]+)$/;
const CONTROL_SUBTYPE_ALLOW = new Set([
  "elf", "wizard", "spirit", "human", "goblin", "dragon", "zombie", "vampire", "merfolk", "warrior",
  "knight", "soldier", "cleric", "angel", "demon", "sliver", "dinosaur", "bird", "snake", "cat",
]);

// ===== KICKED ETB (CR 702.33e + 603.4) =======================================================
// "it was kicked" — the intervening-if on a kicker creature's ETB trigger ("When this creature enters, if it
// was kicked, <effect>" — Goblin Ruinblaster, Torch Slinger, Heartstabber Mosquito …). A per-PERMANENT
// cast-decision flag, NOT a board query: it reads whether the ENTERING permanent was cast for its kicker cost.
// enterPermanent stamps `perm.wasKicked = true` when the cast paid the kicker (resolvers.js, threaded from the
// kicked cast); a normal cast leaves it unset. Keyed on ctx.triggeringPermanentId exactly like SAME-NAME ETB,
// so it reads the SAME entering permanent at BOTH the flush check (the permanent is already on the battlefield
// when ETB triggers flush) AND the resolution re-check (CR 603.4 second check). A non-kicked entry → false
// (the trigger is dropped / does nothing); a missing entering permanent → null (can't confirm → FN-safe, never
// fail-open). This closes the kicker entry in the DEFERRED list (cast-decision flags) for the ETB-trigger shape.
const KICKED_ETB_RE = /^it was kicked$/;

// ===== X-VALUE THRESHOLD (CR 608.2h — the {X} locked at resolution) ===========================
// "x is N or more" / "x is N or greater" — the intervening-if on a Ravenous creature's synthesized ETB
// draw trigger ("Ravenous (… If X is 5 or more, draw a card when it enters.)"). X is the value paid for the
// {X} cost, locked as the permanent resolves (CR 608.2h) and threaded into the entering permanent's OWN
// ETB-trigger context as ctx.xValue (checkEnterTriggers stamps enteredPerm.xValue → the self-ETB context).
// It's a fixed number for the life of the trigger, so it reads IDENTICALLY at the flush check AND the
// resolution re-check (CR 603.4). A missing xValue (a non-X entry, or the amount unthreaded) → null (can't
// confirm → FN-safe, never fail-open); a present xValue compares numerically. "or more"/"or greater" only —
// the ONLY threshold direction Ravenous prints (X≥5).
const X_THRESHOLD_RE = /^x is (\d+) or (?:more|greater)$/;

// ===== TRIBUTE ETB (CR 702.96e + 603.4) ======================================================
// "tribute wasn't paid" / "tribute was paid" — the intervening-if on a Tribute creature's ETB trigger
// ("When this creature enters, if tribute wasn't paid, <effect>" — Pharagax Giant, Ornitharch, Nessian
// Demolok, Snake of the Golden Grove …). Like the kicked flag, this is a per-PERMANENT decision flag, NOT a
// board query: it reads whether the OPPONENT chose to pay tribute (put N +1/+1 counters on the entering
// creature) AS it entered. resolvers.enterPermanent stamps `perm.tributePaid` (true = an opponent paid →
// the counters were added; false = every opponent declined → the "if tribute wasn't paid" effect runs)
// EXACTLY when the card carries Tribute (parseTribute); a non-tribute permanent leaves it undefined. Keyed
// on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at the flush
// check (the permanent is on the battlefield when ETB triggers flush) AND the resolution re-check (CR 603.4
// second check). The flag is a definite boolean once tribute resolves, so "wasn't paid" → !tributePaid and
// "was paid" → tributePaid; a missing entering permanent or an unstamped flag → null (can't confirm → the
// trigger stays unrouted / on the Arbiter — FN-safe, never fail-open). Straight + curly apostrophe tolerated.
const TRIBUTE_NOT_PAID_RE = /^tribute wasn['’]t paid$/;
const TRIBUTE_PAID_RE = /^tribute was paid$/;

// ===== NOT-A-TOKEN (CR 111.7 + 603.4) ========================================================
// "it's not a token" / "it isn't a token" — the intervening-if on a self-dies trigger whose payoff copies
// the dying creature ("When this creature dies, if it's not a token, create a token that's a copy of it…" —
// Vaultborn Tyrant, Ochre Jelly). "it" (CR 608.2c) is the object the ability triggered on — for a self-scope
// dies trigger that's the DEAD source itself. A per-PERMANENT token-status read, NOT a board query: the
// dead source's token-ness is threaded through the trigger context as ctx.triggeringCardIsToken (makePending-
// Trigger stamps !!triggeringPermanent.card.token, and checkDiesTriggers sets triggeringPermanent === the
// dead look-back for the self path). Read identically at flush (the death look-back is fixed once the SBA
// ran) AND resolution (CR 603.4 second check — the source is gone, so its captured token-ness can't change).
// This is the non-recurse guard the printed card carries: a TOKEN Vaultborn copy dying reads
// triggeringCardIsToken=true → "it's not a token" is false → no further copy (mirrors Miirym's nontoken
// gate). A missing/undefined flag → null (can't confirm → FN-safe, never fail-open). Straight + curly
// apostrophe tolerated. Anchored EXACTLY to the token-status shape (a color/type "it's not a <X>" variant
// falls through → Arbiter, CREED — never a mis-read designation).
const NOT_A_TOKEN_RE = /^it(?:'s| is)? ?not a token$|^it isn['’]t a token$/;

// ===== WAS-A-CREATURE (CR 603.4 + 603.6e last-known-info) ====================================
// "it was a creature" — the intervening-if on the "Enduring"/Glimmer self-dies-return trigger ("When this
// creature dies, if it was a creature, return it to the battlefield … It's an enchantment." — Enduring
// Curiosity, Tenacity, Vitality, Innocence, Courage). "it" (CR 608.2c) is the object the ability triggered
// on — the DEAD source itself. A per-PERMANENT last-known-info read, NOT a board query: the dying object may
// already be in a graveyard by resolution, so its captured creature-ness (fixed at the death look-back, CR
// 603.6e) is the only faithful read. Threaded through the trigger context as ctx.triggeringWasCreature
// (checkDiesTriggers stamps it from the death look-back's card type line). Read identically at flush (the
// look-back is fixed once the SBA ran) AND resolution (CR 603.4 second check — the source is gone, its
// captured type can't change). An Enchantment Creature dying reads true → the return runs; a permanent that
// had lost its creature type before dying reads false → the trigger does nothing (CR 603.4 drop). A
// missing/undefined flag → null (can't confirm → FN-safe, never fail-open). Anchored EXACTLY (a "was a <X>"
// type/color variant falls through → Arbiter, CREED — never a mis-read designation).
const WAS_A_CREATURE_RE = /^it was a creature$/;

// ===== HAD-NO-+1/+1-COUNTERS (KW-UNDYING, CR 702.92a + 603.6e) ===============================
// "it had no +1/+1 counters on it" — the intervening-if on the synthesized UNDYING dies-return trigger.
// "it" (CR 608.2c) is the dead source itself; "had" is a per-PERMANENT last-known-info read (the object is
// in a graveyard by now, counters don't travel to it), so the faithful value is the death look-back's
// counters snapshot, threaded as ctx.triggeringHadNoPlusCounters (checkDiesTriggers stamps it from
// d.counters). Identical at flush AND resolution (CR 603.4 second check — the snapshot is fixed). This is
// what terminates the undying loop: the returned body carries a +1/+1 counter, so its NEXT death reads
// false → no second return. A missing/undefined flag → null (can't confirm → FN-safe drop, never a
// fail-open return — fail-open would loop a countered body forever). Anchored EXACTLY; a "-1/-1"/named-
// counter variant (persist et al) falls through → Arbiter (CREED).
const HAD_NO_PLUS_COUNTERS_RE = /^it had no \+1\/\+1 counters on it$/;
// KW-PERSIST (BLITZ PS-1, CR 702.79a) — undying's minus-twin: the LKI counter-lessness read off
// ctx.triggeringHadNoMinusCounters (stamped by checkDiesTriggers from the death look-back).
const HAD_NO_MINUS_COUNTERS_RE = /^it had no -1\/-1 counters on it$/;

// ===== POWER-DIFFERED-FROM-BASE (Jason Bright — CR 603.4 + 603.6e) ===========================
// "its power was different from its base power" — the intervening-if on Jason Bright's tribal dies trigger
// ("Whenever a Zombie or Mutant you control dies, if its power was different from its base power, draw a
// card."). "its" (CR 608.2c) is the dead triggering creature; both values are LAST-KNOWN-INFO reads fixed
// at the death look-back (effective power = counters/anthems/pumps included; base power = printed or a
// layer-7b set value, CR 613.4a) and threaded as ctx.triggeringPowerDifferedFromBase (checkDiesTriggers
// stamps it from d.power vs d.basePower). Identical at flush AND resolution. A missing/undefined flag →
// null (can't confirm → FN-safe, never a fail-open draw). Anchored EXACTLY (a toughness/"greater than"
// variant falls through → Arbiter, CREED).
const POWER_DIFFERED_RE = /^its power was different from its base power$/;

// ===== IN-YOUR-GRAVEYARD (Infesting Radroach — CR 603.3d zone statement) ====================
// "this creature is in your graveyard" — the intervening-if on a GRAVEYARD-FUNCTIONING trigger ("Whenever
// an opponent mills a nonland card, if this creature is in your graveyard, you may return it to your
// hand."). A LIVE zone check on the SOURCE CARD (ctx.sourceCardId, threaded by checkMilledTriggers'
// graveyard scan): true iff that exact card is in the CONTROLLER's graveyard right now — re-evaluated at
// flush AND resolution (CR 603.4 second check — the card may have been exiled/recurred in between; the
// return then correctly doesn't happen). A missing sourceCardId (a battlefield-fired trigger / no context)
// → null (can't confirm → FN-safe drop). Anchored EXACTLY.
const IN_YOUR_GRAVEYARD_RE = /^this creature is in your graveyard$/;

// ===== SAME-NAME ETB (Guardian Project, CR 603.4 + 201.2) ====================================
// "it doesn't have the same name as another creature you control or a creature card in your graveyard"
// — a per-PERMANENT condition keyed on the entering creature (the trigger's triggeringPermanent). True
// iff NO OTHER creature you control AND NO creature card in your graveyard shares the entering creature's
// name. CR 201.2: two objects have "the same name" when they share an English name string (a nameless /
// empty-name token can't match a real card). "another creature you control" (CR 109.1 / 113.7 — "another"
// excludes the object itself) → exclude the entering permanent by id when scanning the battlefield. The
// graveyard half is a plain name+creature-card scan (the entering permanent is never in the graveyard, so
// no self-exclusion needed there). The entering permanent is supplied via `ctx.triggeringPermanentId`
// (checkEnterTriggers threads enteredPerm), resolved against the controller's battlefield.
const SAME_NAME_ETB_RE = /^it doesn't have the same name as another creature you control or a creature card in your graveyard$/;

// ===== EVOLVE-COMPARE (KW-EVOLVE, CR 702.100a/d — SHELF S7) ==================================
// "that creature has greater power or toughness than this creature" — the synthesized evolve trigger's
// intervening-if: LAYER-AWARE P/T of the ENTERING creature (ctx.triggeringPermanentId) vs the SOURCE
// (ctx.sourcePermanentId), re-read live at flush AND resolution (CR 702.100d — the comparison uses
// current values both times). Either permanent gone → null (can't confirm → FN-safe drop, the engine's
// vanished-referent convention).
const EVOLVE_COMPARE_RE = /^that creature has greater power or toughness than this creature$/;

// ===== OPPONENT-LOST-LIFE (Bloodchief Ascension trigger 1 — SHELF S7) ========================
// "an opponent lost N or more life this turn" — read the per-seat lifeLostThisTurn ledger (stamped at the
// gameState.loseLife chokepoint, reset for all seats at untap). An absent tally IS zero (fail-closed: the
// ledger can't miss a loss — every life-loss path funnels through loseLife). Boolean always, never null.
const OPP_LOST_LIFE_RE = new RegExp(`^an opponent lost ${NUM_RE} or more life this turn$`);

// ===== SOURCE-COUNTER-THRESHOLD (Bloodchief Ascension trigger 2 — SHELF S7, CR 603.4) ========
// "this <noun> has N or more <type> counters on it" — a LIVE read of the SOURCE permanent's counters
// (ctx.sourcePermanentId, threaded by makePendingTrigger), re-evaluated at flush AND resolution. The
// source gone from the battlefield → null (can't confirm → FN-safe drop, the engine convention for a
// vanished source). Anchored; the counter type is a bare word matched against the counters map key.
const SOURCE_COUNTER_THRESHOLD_RE = new RegExp(`^this (?:enchantment|artifact|creature|permanent) has ${NUM_RE} or more ([a-z]+) counters on it$`);

function isCreatureCard(card) {
  return /\bcreature\b/i.test(typeStr(card));
}
// A permanent is a creature when its (layer-aware-irrelevant for this name gate) printed type line says so.
// Reading the card's type line is sufficient here: the same-name gate compares the entering creature against
// OTHER creatures — a non-creature permanent sharing the name (rare) shouldn't block the draw (CR cares about
// "another CREATURE you control"). Mirrors isCreatureCard so on-field and graveyard checks stay consistent.
function isCreaturePermLocal(perm) {
  return /\bcreature\b/i.test(typeStr(perm?.card));
}

/**
 * Evaluate an intervening-if condition for `controllerId` against `state`.
 * Returns true / false (the condition's truth) or null (outside the modeled vocabulary → caller must
 * treat as "can't confirm": the trigger does NOT route natively / does NOT fire).
 *
 * `context` (optional) carries the trigger's runtime context — notably `triggeringPermanentId`, the
 * entering permanent for an ETB trigger — needed by per-permanent conditions (the SAME-NAME ETB shape).
 * Pure board-count conditions ignore it, so existing callers (which omit it) are unaffected.
 */
export function evaluateInterveningIf(state, condition, controllerId, context = null) {
  const c = String(condition || "").toLowerCase().trim();
  if (!state?.players?.[controllerId]) return false; // controller gone → condition unmet

  // EVOLVE-COMPARE (KW-EVOLVE) — layer-aware P/T of the entering creature vs the source, read live.
  if (EVOLVE_COMPARE_RE.test(c)) {
    const enteringId = context?.triggeringPermanentId;
    const sourceId = context?.sourcePermanentId;
    if (!enteringId || !sourceId) return null; // referents missing → can't confirm (FN-safe)
    let entering = null, source = null;
    for (const pid of Object.keys(state.players || {})) {
      for (const p of state.players[pid]?.battlefield || []) {
        if (p.id === enteringId) entering = p;
        if (p.id === sourceId) source = p;
      }
    }
    if (!entering || !source) return null;     // a referent left the battlefield → can't confirm (FN-safe)
    return creaturePower(entering, state) > creaturePower(source, state)
      || creatureToughness(entering, state) > creatureToughness(source, state);
  }

  // OPPONENT-LOST-LIFE (Bloodchief Ascension) — the per-seat lifeLostThisTurn ledger; absent = 0 (fail-closed).
  {
    const m = c.match(OPP_LOST_LIFE_RE);
    if (m) {
      const n = parseCount(m[1]);
      return opponentIds(state, controllerId).some((pid) => (state.players[pid]?.lifeLostThisTurn || 0) >= n);
    }
  }

  // SOURCE-COUNTER-THRESHOLD (Bloodchief Ascension) — live read of the SOURCE permanent's counters.
  {
    const m = c.match(SOURCE_COUNTER_THRESHOLD_RE);
    if (m) {
      const srcId = context?.sourcePermanentId;
      if (!srcId) return null; // no source in context → can't confirm (FN-safe; never fail-open)
      const src = controllerBoard(state, controllerId).find((p) => p.id === srcId);
      if (!src) return null;   // source left the battlefield → can't confirm (FN-safe drop)
      return (src.counters?.[m[2]] || 0) >= parseCount(m[1]);
    }
  }

  // SAME-NAME ETB (Guardian Project) — needs the entering permanent from the trigger context.
  if (SAME_NAME_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    // The entering permanent must be findable + named to evaluate (CR 201.2 — comparison is by name string).
    const name = entering?.card?.name ?? entering?.name;
    if (!entering || !name) return null; // can't read the entering creature's name → can't confirm (FN-safe)
    const nm = String(name).toLowerCase();
    // (a) another creature you control with the same name (exclude the entering permanent itself — "another")
    const dupOnField = board.some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && String(p.card?.name ?? p.name ?? "").toLowerCase() === nm);
    if (dupOnField) return false;
    // (b) a creature CARD in your graveyard with the same name
    const gy = state.players[controllerId].graveyard || [];
    const dupInGy = gy.some((card) => isCreatureCard(card) && String(card?.name ?? "").toLowerCase() === nm);
    return !dupInGy; // "doesn't have the same name as …" → true when NEITHER duplicate exists
  }

  // KICKED ETB (CR 702.33e) — "it was kicked": read the entering permanent's was-kicked flag (a per-PERMANENT
  // cast-decision flag, stamped by resolvers.enterPermanent as perm.wasKicked when the kicker cost was paid).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like SAME-NAME ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  if (KICKED_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;      // entering permanent already gone → can't confirm (FN-safe)
    return entering.wasKicked === true; // a normal (un-kicked) cast leaves wasKicked unset → false (CR 603.4 drop)
  }

  // X-VALUE THRESHOLD (CR 608.2h) — "x is N or more": read the paid {X} threaded into THIS trigger's
  // context (ctx.xValue, stamped by checkEnterTriggers from enteredPerm.xValue). A definite number for the
  // life of the trigger, so it compares identically at flush AND resolution (CR 603.4 second check). An
  // absent/non-numeric xValue (a non-X entry, or the amount unthreaded) → null (can't confirm → FN-safe,
  // never fail-open — the trigger stays unrouted). This is what gates Ravenous's "draw a card" on X≥5.
  {
    const xm = c.match(X_THRESHOLD_RE);
    if (xm) {
      const x = context?.xValue;
      if (typeof x !== "number") return null; // no X in context → can't confirm (FN-safe)
      return x >= parseInt(xm[1], 10);
    }
  }

  // TRIBUTE ETB (CR 702.96e) — "tribute wasn't paid" / "tribute was paid": read the entering permanent's
  // tributePaid flag (a per-PERMANENT decision flag, stamped by resolvers.enterPermanent as perm.tributePaid
  // = true when an opponent paid tribute / false when every opponent declined, set AS the creature entered).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  // A definite boolean once tribute resolves; an unstamped flag (a non-tribute permanent, or the entering
  // permanent already gone) → null (can't confirm → FN-safe, never fail-open — the trigger stays unrouted).
  if (TRIBUTE_NOT_PAID_RE.test(c) || TRIBUTE_PAID_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering || typeof entering.tributePaid !== "boolean") return null; // not a resolved-tribute permanent → can't confirm (FN-safe)
    return TRIBUTE_NOT_PAID_RE.test(c) ? entering.tributePaid === false : entering.tributePaid === true;
  }

  // NOT-A-TOKEN (CR 111.7) — "it's not a token" / "it isn't a token": read the triggering (dead, for a self-
  // dies trigger) object's token-ness off the context flag (ctx.triggeringCardIsToken, stamped by
  // makePendingTrigger as !!triggeringPermanent.card.token). NOT a board scan — the object may be in a
  // graveyard by now, so its captured token status (fixed at the death look-back) is the only faithful read,
  // and it's identical at flush AND resolution (CR 603.4 second check). A definite boolean once the trigger
  // fires; an undefined flag (no context / not a per-object trigger) → null (can't confirm → FN-safe).
  if (NOT_A_TOKEN_RE.test(c)) {
    const isToken = context?.triggeringCardIsToken;
    if (typeof isToken !== "boolean") return null; // no per-object token flag in context → can't confirm (FN-safe)
    return isToken === false; // "it's not a token" → true iff the triggering object was NOT a token
  }

  // WAS-A-CREATURE (CR 603.6e) — "it was a creature": read the dying object's captured creature-ness off the
  // context flag (ctx.triggeringWasCreature, stamped by checkDiesTriggers from the death look-back type line).
  // NOT a board scan — the object is in a graveyard by now, so its last-known creature-ness (fixed at the death
  // look-back) is the only faithful read, identical at flush AND resolution (CR 603.4 second check). A definite
  // boolean once the dies trigger fires; an undefined flag (no context / not a per-object dies trigger) → null
  // (can't confirm → FN-safe, never fail-open).
  if (WAS_A_CREATURE_RE.test(c)) {
    const wasCreature = context?.triggeringWasCreature;
    if (typeof wasCreature !== "boolean") return null; // no per-object was-creature flag → can't confirm (FN-safe)
    return wasCreature === true; // "it was a creature" → true iff the dying object was a creature
  }

  // HAD-NO-+1/+1-COUNTERS (KW-UNDYING, CR 702.92a + 603.6e) — read the dying object's counter-lessness off
  // the context flag (ctx.triggeringHadNoPlusCounters, stamped by checkDiesTriggers from the death
  // look-back's counters snapshot). NOT a board scan — the object is in a graveyard by now. A definite
  // boolean once the dies trigger fires from a stamped look-back; undefined (no snapshot / not a dies
  // trigger) → null (can't confirm → FN-safe drop, never a fail-open return).
  if (HAD_NO_PLUS_COUNTERS_RE.test(c)) {
    const hadNone = context?.triggeringHadNoPlusCounters;
    if (typeof hadNone !== "boolean") return null; // no per-object counters snapshot → can't confirm (FN-safe)
    return hadNone === true; // "it had no +1/+1 counters on it" → true iff the LKI showed none
  }
  // KW-PERSIST (BLITZ PS-1, CR 702.79a) — the -1/-1 mirror of the undying branch above, same LKI discipline.
  if (HAD_NO_MINUS_COUNTERS_RE.test(c)) {
    const hadNone = context?.triggeringHadNoMinusCounters;
    if (typeof hadNone !== "boolean") return null; // no per-object counters snapshot → can't confirm (FN-safe)
    return hadNone === true;
  }

  // LIFE-COMPARISON (BLITZ SC-1 — Sword Coast Sailor / the background quartet: "no opponent has more life
  // than that player"): "that player" = the ATTACKED player (ctx.defenderId, threaded by
  // checkAttackTriggers); true iff every opponent OF THE TRIGGER'S CONTROLLER has life ≤ that player's.
  // A planeswalker attack (ctx.defenderPlaneswalkerId set) is NOT "attacks a player" — FN-drop (null),
  // never a mis-fire; likewise a missing referent (a non-attack event).
  if (/^no opponent has more life than that player$/.test(c)) {
    if (context?.defenderPlaneswalkerId) return null; // a pw attack isn't "attacks a player" (CR)
    const pid = context?.defenderId;
    if (!pid || !state?.players?.[pid]) return null;  // no attacked-player referent → can't confirm
    const targetLife = state.players[pid].life;
    for (const [id, pl] of Object.entries(state.players)) {
      if (id === controllerId) continue;              // "no OPPONENT" — the controller's own life is irrelevant
      if ((pl?.life ?? 0) > targetLife) return false;
    }
    return true;
  }

  // POWER-DIFFERED-FROM-BASE (Jason Bright, CR 603.6e) — read the dying object's effective-vs-base power
  // comparison off the context flag (stamped by checkDiesTriggers from the death look-back's power +
  // basePower captures). Undefined (an unstamped death path / not a dies trigger) → null (FN-safe).
  if (POWER_DIFFERED_RE.test(c)) {
    const differed = context?.triggeringPowerDifferedFromBase;
    if (typeof differed !== "boolean") return null; // no per-object power snapshot → can't confirm (FN-safe)
    return differed === true;
  }

  // IN-YOUR-GRAVEYARD (CR 603.3d) — the source card must be in the CONTROLLER's graveyard right now (a
  // live scan, not a snapshot — the zone can change between flush and resolution, CR 603.4).
  if (IN_YOUR_GRAVEYARD_RE.test(c)) {
    const cardId = context?.sourceCardId;
    if (!cardId) return null; // no source-card thread → can't confirm (FN-safe)
    return (state.players[controllerId]?.graveyard || []).some((card) => card.id === cardId);
  }

  // "you control no <filter>"  → count == 0
  let m = c.match(/^you control no (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    return controllerBoard(state, controllerId).filter((p) => permMatchesFilter(p, filter, state)).length === 0;
  }

  // "you control a/an/<N> or more <filter>"
  m = c.match(new RegExp(`^you control ${NUM_RE}(?: or more)? (.+)$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const filter = parseFilter(m[2]);
    if (!filter) return null;
    return controllerBoard(state, controllerId).filter((p) => permMatchesFilter(p, filter, state)).length >= n;
  }

  // "[there are|you have] <N> or more <type> cards in your graveyard"
  m = c.match(new RegExp(`^(?:there are|you have) ${NUM_RE} or more ([a-z]+) cards? in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const singular = m[2].replace(/s$/, "");
    const word = singular.charAt(0).toUpperCase() + singular.slice(1);
    const re = new RegExp(`\\b${word}\\b`, "i");
    const gy = state.players[controllerId].graveyard || [];
    return gy.filter((card) => re.test(typeStr(card))).length >= n;
  }

  // "an opponent controls more <lands|creatures|artifacts|enchantments> than you"
  m = c.match(OPP_CONTROLS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }
  // "an opponent has more <life|cards in hand> than you"
  m = c.match(OPP_HAS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }
  // "an opponent controls a/an/<N> or more <filter>" — an ABSOLUTE per-opponent board threshold (Defense of
  // the Heart "an opponent controls three or more creatures"). Anchored AFTER OPP_CONTROLS_MORE so the
  // compare-vs-you form ("more … than you") wins its exact wording first; this matches the cardinal form. TRUE
  // iff some opponent controls ≥N filter-matching permanents (existential, CR 104.3a). An unparseable filter
  // (parseFilter null) drops the whole condition → Arbiter (FN-safe, never a fabricated board read — CREED).
  m = c.match(OPP_CONTROLS_N_RE);
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const filter = parseFilter(m[2]);
    if (!filter) return null;
    return opponentIds(state, controllerId).some((oid) =>
      controllerBoard(state, oid).filter((p) => permMatchesFilter(p, filter, state)).length >= n);
  }

  // "you have N or {less|fewer|more} life" — the controller's own life vs a fixed threshold (Convalescent
  // Care, Convalescence). Pure player.life compare (CR 603.4), layer-irrelevant, read identically at flush
  // AND resolution. "less"/"fewer" → ≤ N; "more" → ≥ N.
  m = c.match(CTRL_LIFE_THRESHOLD_RE);
  if (m) {
    const threshold = parseInt(m[1], 10);
    const life = controllerMetric(state, controllerId, "life");
    return m[2] === "more" ? life >= threshold : life <= threshold;
  }

  // ===== TURN-EVENT HISTORY (CR 700.4) ===== "[a creature | N or more creatures] died this turn" — read off
  // the per-turn creature-death tally (gameState.creaturesDiedThisTurn per seat, bumped at the death chokepoint).
  // "a creature died this turn" is the ≥1 case; the cardinal form ("three or more creatures died this turn")
  // compares the ALL-SEATS death total to N (CR 700.4 — any player's creature dying counts). Evaluated at flush
  // AND resolution like every other intervening-if; the counter resets for all seats at untap, so it reads the
  // current turn's deaths only. A subtype-scoped ("a Zubera died") or "an opponent's creature died" variant
  // fails the anchor → falls through → null → Arbiter (CREED — never a mis-scoped death count).
  m = c.match(/^a creature died this turn$/);
  if (m) return deathsThisTurnTotal(state) >= 1;
  m = c.match(new RegExp(`^${NUM_RE} or more creatures died this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return deathsThisTurnTotal(state) >= n;
  }

  // ===== ATTACKED-THIS-TURN (RAID, CR 508.1) ===== "you attacked this turn" — read off the controller's
  // per-turn attackedThisTurn flag (stamped when they declare an attacker in actionDispatcher.applyDeclareAttacker,
  // reset for all seats at untap). A per-CREATURE variant ("this creature attacked this turn"), a "with a
  // creature" qualifier, or a negated form fails the anchor → null → Arbiter (CREED — never a mis-scoped Raid read).
  if (/^you attacked this turn$/.test(c)) return state?.players?.[controllerId]?.attackedThisTurn === true;

  // ===== SPELLS-CAST-THIS-TURN (CR 700.4) ===== "you've cast [a|N or more] spell(s) this turn" — read off the
  // controller's per-turn spellsCastThisTurn counter (bumped at the cast chokepoint, TRIG-CAST2; reset for all
  // seats at untap — the SAME source the native "cast your second spell" triggers read). Loan Shark's ETB
  // "if you've cast two or more spells this turn". A FILTERED ("a noncreature spell") or opponent-scoped variant
  // fails the anchor → falls through → null → Arbiter (CREED — never a mis-scoped spell-count read).
  m = c.match(new RegExp(`^you've cast ${NUM_RE}(?: or more)? spells? this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return (state?.players?.[controllerId]?.spellsCastThisTurn || 0) >= n;
  }

  // "you control another <Subtype>" — a curated creature subtype, OTHER THAN the entering permanent (CR 113.7)
  m = c.match(CTRL_ANOTHER_SUBTYPE_RE);
  if (m) {
    const sub = m[1];
    if (!CONTROL_SUBTYPE_ALLOW.has(sub)) return null; // non-creature-type word (designation/color) → Arbiter (CREED)
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // "another" needs the entering permanent to exclude → can't confirm (FN-safe)
    const re = new RegExp(`\\b${sub.charAt(0).toUpperCase() + sub.slice(1)}\\b`, "i");
    return controllerBoard(state, controllerId).some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && re.test(typeStr(p.card)));
  }

  return null; // outside the modeled vocabulary → not native / not fired (never fail-open)
}

/**
 * Pure SHAPE check: is this condition one `evaluate` can read? Evaluated against an empty probe board —
 * a parseable shape returns a boolean (true/false on the empty board), an unparseable one returns null.
 * Used by the coverage metric (triggerRoutesNatively) AND the flush gate (buildTriggerStack) so the
 * metric never claims a routing the engine won't perform.
 */
export function interveningIfParseable(condition) {
  // The probe board carries a synthetic entering permanent (id "__entering__", a named creature) so a
  // per-PERMANENT shape (SAME-NAME ETB) returns a boolean here instead of null-for-missing-context. A pure
  // board-count shape ignores the extra permanent and a non-creature name, so its truth on the empty-ish
  // board is unchanged. An unparseable condition still returns null → false. The probe also stamps a
  // definite `tributePaid` boolean so the TRIBUTE ETB shape returns a boolean here (the runtime stamps it
  // for real on every tribute permanent); a non-tribute board-shape ignores the extra field. The probe
  // context ALSO carries a definite `triggeringCardIsToken` boolean so the NOT-A-TOKEN shape returns a
  // boolean here (the runtime stamps it for real off every triggering permanent's card.token); every other
  // shape ignores the extra context field. It ALSO carries a definite `triggeringWasCreature` boolean so the
  // WAS-A-CREATURE shape returns a boolean here (the runtime stamps it for real off every dying object's type
  // line); every other shape ignores the extra field.
  const entering = { id: "__entering__", card: { name: "__probe_name__", type: "Creature" }, tributePaid: false };
  // The probe graveyard holds the probe source card so the IN-YOUR-GRAVEYARD zone check (Radroach) returns
  // a boolean here (the runtime threads a real sourceCardId from the graveyard scan).
  const probe = { players: { __probe__: { battlefield: [entering], graveyard: [{ id: "__probe_gy__" }] } } };
  // The probe context ALSO carries a definite numeric `xValue` so the X-VALUE THRESHOLD shape ("x is N or
  // more") returns a boolean here (the runtime stamps a real xValue on every {X}-cost entry via
  // checkEnterTriggers); every other shape ignores the extra field.
  // It ALSO carries a definite `triggeringHadNoPlusCounters` boolean so the KW-UNDYING shape ("it had no
  // +1/+1 counters on it") returns a boolean here (the runtime stamps it off every death look-back's
  // counters snapshot); every other shape ignores the extra field.
  // It ALSO carries `sourcePermanentId` pointing at the probe permanent so the SOURCE-COUNTER-THRESHOLD
  // shape returns a boolean here (the runtime threads the real source id via makePendingTrigger's context);
  // the probe permanent has no counters → false, still a definite boolean.
  return evaluateInterveningIf(probe, condition, "__probe__", { triggeringPermanentId: "__entering__", triggeringCardIsToken: false, triggeringWasCreature: true, triggeringHadNoPlusCounters: true, triggeringHadNoMinusCounters: true, triggeringPowerDifferedFromBase: true, defenderId: "__probe__", sourceCardId: "__probe_gy__", sourcePermanentId: "__entering__", xValue: 0 }) !== null;
}
