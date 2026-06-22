/**
 * Phase 6 PR 10.1 — manaModel.js
 *
 * The missing piece that makes the learn engine playable: what mana a
 * permanent can produce, and how to pay a spell's cost from the pool +
 * untapped sources. Before this, `manaPool` was never filled, so no spell
 * was ever castable and the driver auto-piloted into the safety cap.
 *
 * Design (see docs/phase6-playable-engine.md §5 PR 10.1):
 *   - Sources are untapped permanents with a mana ability: lands + non-
 *     creature rocks (no summoning-sickness gate) + creature dorks (gated
 *     by summoning sickness unless Haste).
 *   - A source produces `amount` mana of ONE chosen color from `colors`.
 *     (Sol Ring = {colors:["C"], amount:2}; a dual = {colors:["W","U"],
 *     amount:1}.)
 *   - Payment is greedy, MOST-CONSTRAINED-SOURCE-FIRST: colored pips are
 *     satisfied from the source with the fewest color options first, so a
 *     dual that's the only source of a needed color isn't wasted paying
 *     generic. Pathological multicolor costs fall to "can't afford" — never
 *     to fabricated mana.
 *
 * Pure: no fetches, no mutation. `canAfford`/`planPayment` never change
 * state — the dispatcher commits taps. This separation (pure planner +
 * separate commit) keeps castability checks side-effect free.
 *
 * Near-leaf: it imports constants from gameState plus `permanentHasKeyword` from
 * the layer engine (so a creature dork GRANTED Haste by an Aura/anthem can tap on
 * the turn it would otherwise be summoning-sick). It operates on already-parsed
 * cost objects (from legalChoices.parseManaCost), so there is no import cycle with
 * legalChoices, and layers imports none of these modules so that edge is acyclic too.
 */

import { MANA_COLORS, addMana, moveCardToZone, tapPermanent, findPermanent } from "./gameState.js";
import { checkSacrificeTriggers } from "./triggers.js"; // SAC-TREASURE: a cracked one-shot mana source is a sacrifice
import { permanentHasKeyword } from "./layers.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived mana amount (leaf-safe: shared → gameState only)
import { parseAuraLandManaBonus } from "./staticAbilityParser.js"; // AURA-LAND-MANA-BOOST: extra mana from a "tapped for mana" aura (leaf: static parser → keywords only)

// ─── Card → mana production ────────────────────────────────────────────────────

// Basic lands by name — the most reliable signal (card.oracle is sometimes
// thin in the slim index). Snow-Covered variants strip the prefix.
const BASIC_LAND_MANA = {
  Plains: ["W"],
  Island: ["U"],
  Swamp: ["B"],
  Mountain: ["R"],
  Forest: ["G"],
  Wastes: ["C"],
};

// Known mana rocks — a small belt-and-suspenders table for when oracle text
// is missing/thin. The oracle parser below handles most rocks on its own
// ("{T}: Add {C}{C}" etc.); this is the safety net for the iconic ones.
const KNOWN_ROCKS = {
  "Sol Ring": { colors: ["C"], amount: 2 },
  "Mana Crypt": { colors: ["C"], amount: 2 },
  "Mana Vault": { colors: ["C"], amount: 3 },
  "Mind Stone": { colors: ["C"], amount: 1 },
  "Arcane Signet": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
  "Fellwar Stone": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
};

const COLOR_SET = new Set(MANA_COLORS);

function typeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}

function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}

// Strip reminder text (parentheses). Used TYPE-AWARELY in manaProduction — see the note there.
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ");
}

function hasHaste(card) {
  const kws = Array.isArray(card?.keywords) ? card.keywords : [];
  if (kws.some(k => String(k).toLowerCase() === "haste")) return true;
  return /\bhaste\b/i.test(oracleOf(card));
}

// ===== MANA-VARIABLE (wave2a) ===== map a metric TAIL (the text after "Add … {C}/X mana") to a
// `countForSpec` spec. ANCHORED to a curated set of known metrics ONLY; an unrecognized metric
// returns null so the caller leaves the card NON-NATIVE (CREED: never a fabricated amount). The
// returned spec is consumed by countForSpec(state, {controller, source}, spec) at resolution
// (CR 608.2g — a count-derived mana amount is computed when the ability resolves, not at cast).
//
// `tail` includes the connector ("for each …", "equal to …", "where X is …"), which is normalized
// away first so the SAME metric body matches regardless of which connector introduced it.
const VAR_COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
function parseManaMetric(tail) {
  // Strip the leading connector + any "the/your/an amount of" filler so the body is the bare metric.
  const t = String(tail || "")
    .trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase()
    .replace(/^(?:for each|equal to|where x is)\s+/, "")
    .replace(/^(?:the|your|an amount of)\s+/, "");

  // "<type> you control" (from "for each creature you control") or "number of <type>s you control"
  // (from "equal to the number of enchantments you control") → permanents of a card TYPE.
  let m = t.match(/^(?:number of )?([a-z]+?)s? you control$/);
  if (m) {
    const cardType = m[1];
    if (["creature", "artifact", "enchantment", "land", "planeswalker"].includes(cardType)) {
      return { kind: "permanentsYouControl", cardType };
    }
    return null;
  }

  // "greatest power among (other) creatures you control" → max layer-resolved power.
  m = t.match(/^greatest power among (other )?creatures you control$/);
  if (m) return { kind: "greatestPowerYouControl", ...(m[1] ? { excludeSelf: true } : {}) };

  // "greatest toughness among (other) creatures you control" → max layer-resolved toughness.
  // (Only the "other" form exists on real cards — Bighorner's life clause / Arbor Adherent.)
  m = t.match(/^greatest toughness among (other )?creatures you control$/);
  if (m) return { kind: "greatestToughnessYouControl", ...(m[1] ? { excludeSelf: true } : {}) };

  // "devotion to <color>" (from "equal to your devotion to green") → count of that color's
  // mana-symbol pips across permanents you control.
  m = t.match(/^devotion to (white|blue|black|red|green)$/);
  if (m) return { kind: "devotion", color: VAR_COLOR_WORD[m[1]] };

  return null;
}

/**
 * Parse the first "Add ..." mana clause out of oracle text into `{ colors, amount }`, or a
 * VARIABLE-amount clause into `{ colors, amount: 0, amountSpec }`, or null if there's no
 * (modeled) mana production.
 *
 *   "Add {G}"                          → { colors: ["G"], amount: 1 }
 *   "Add {C}{C}"                       → { colors: ["C"], amount: 2 }  (concat, same color)
 *   "{T}: Add {W} or {U}."             → { colors: ["W","U"], amount: 1 }  ("or" = choice)
 *   "Add one mana of any color."       → { colors: ["W","U","B","R","G"], amount: 1 }
 *   "Add {G} for each creature …"      → { colors: ["G"], amount: 0, amountSpec:{…} }
 *   "Add X mana of any one color, where X is the number of enchantments …"
 *                                      → { colors:[5], amount: 0, amountSpec:{…} }
 *   "Add a +1/+1 counter"              → null (no mana symbols)
 *   "Add {G} for each <unrecognized>"  → null (unmodeled metric — card stays NON-NATIVE)
 */
function parseAddClause(oracle) {
  if (!/\badd\b/i.test(oracle)) return null;

  // ===== MANA-VARIABLE — checked FIRST so the bigger variable ability wins over a small fixed/any-
  // color one on the SAME card (Arbor Adherent has a line-1 "Add one mana of any color" AND a line-2
  // variable "Add X mana …, where X is …"; the variable line is the modeled one). Each shape is
  // anchored at the metric. An unmodeled metric → null (NOT amount:1) → the card stays non-native.

  // Shape A — fixed color symbol(s) + a "for each"/"equal to" connector introducing the metric:
  // "Add (an amount of )?{C}… (for each|equal to) <metric>". The connector + metric is captured whole
  // and parseManaMetric normalizes the connector away.
  let v = oracle.match(/\bAdd (?:an amount of )?((?:\{[WUBRGC]\})+)(?: mana)? ((?:for each|equal to) [^.]+)/i);
  if (v) {
    const symbols = [...v[1].matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
    const spec = parseManaMetric(v[2]);
    if (spec && symbols.length) return { colors: [...new Set(symbols)], amount: 0, amountSpec: spec };
    return null; // unmodeled metric (or no symbol) — non-native, never a fabricated fallback
  }

  // Shape B — "Add X mana (of any one color | of any color)?, where X is <metric>". "in any
  // combination of colors" (Selvala) is deliberately NOT matched here → falls through to null below.
  v = oracle.match(/\bAdd X mana(?: of any(?: one)? color)?, (where X is [^.]+)/i);
  if (v) {
    const spec = parseManaMetric(v[1]);
    if (spec) return { colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: spec };
    return null; // unmodeled metric — non-native
  }

  // "Add ... mana of any color" → any of the five colors (fixed amount 1).
  if (/add\b[^.]*\bmana of any( one)? color/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
  }

  const m = oracle.match(/Add ([^.]*)/i);
  if (!m) return null;
  const clause = m[1];
  const symbols = [...clause.matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
  if (symbols.length === 0) return null;

  const unique = [...new Set(symbols)];
  // " or " between symbols = the player CHOOSES one (amount 1, several options).
  // Plain concatenation ("{C}{C}") = produces all of them (amount = count).
  if (/\bor\b/i.test(clause)) {
    return { colors: unique, amount: 1 };
  }
  return { colors: unique, amount: symbols.length };
}

/**
 * Does this card's MANA ability pay for itself by SACRIFICING the source — a ONE-SHOT mana
 * artifact/token (Treasure / Gold / Lotus Petal) — rather than a repeatable tap source? True when the
 * line whose effect is the "Add …" clause carries "Sacrifice this/~" in its COST (left of the colon).
 * The mana subsystem sacrifices such a source on use instead of just tapping it, so it can't ramp
 * forever (the TOK-2 correctness invariant: a minted Treasure is one mana, then gone). Precise
 * per-line so a normal rock ("{T}: Add {C}") or dork ("{T}: Add {G}") is never flagged.
 */
function manaAbilitySacrificesSelf(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /\bsacrifice (?:this|~)\b/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * Does this card's MANA ability require tapping ({T} in its COST — left of the colon)? Summoning
 * sickness (CR 302.6) gates a {T}/{Q} ability, but a NON-tap mana ability — a sac-for-mana Eldrazi
 * Spawn / Treasure ("Sacrifice this token: Add {C}") — is usable the turn the creature enters, so a
 * freshly-made Spawn can ramp immediately (the WALT-TOKEN-ABIL token-mana correctness invariant).
 * Precise per-line so the flag reflects the line whose effect is the "Add …" clause.
 */
function manaAbilityRequiresTap(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /\{t\}/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * Remove the QUOTED ability a card confers on a TOKEN it CREATES ("Create a … token with \"…\"" or the
 * two-sentence "…token[ named N]. It has \"…\"" form, normalized here to the "with" form) — that ability
 * belongs to the TOKEN, not the card. Without this, a card's OWN mana production is fabricated from its
 * token's ability: an Eldrazi Spawn-maker (Blisterpod, Nest Invader) reads as a sac-for-{C} source it
 * isn't, and the engine would offer "sacrifice Blisterpod for {C}" — a fabricated ability (a false
 * positive). SCOPED to a CREATE-TOKEN context only, so a self-granting lord ("All Slivers have \"{T}:
 * Add …\"" — Gemhide IS a Sliver, a real source) and a non-token mana-grant anthem ("Creatures you
 * control have \"…\"" — a separate concern) are left intact. Mirrors the parser's splitClauses
 * normalization; shared by coverage.hasManaAbility so the classifier and runtime can't drift.
 */
export function stripCreatedTokenAbilities(text) {
  const norm = String(text || "").replace(
    /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+it has (["“'])/gi,
    "$1 with $2",
  );
  return norm.replace(
    /(\bcreates?\b[^."]*?\btokens?\b[^."]*?(?: named [^."]*?)? with )(["“][^"”]*["”])/gi,
    "$1 ",
  );
}

/**
 * What mana can this card's mana ability produce? Returns `{ colors, amount[, sacrifices] }`
 * or null if it isn't a mana source. Resolution order: basic-land name → known-rock table →
 * oracle "Add" parse → land fallback (colorless). `sacrifices:true` marks a one-shot source the
 * mana commit path sacrifices on use (Treasure / Gold) — only ever set on the oracle-parsed branch
 * (basics/known-rocks/land-fallback are all repeatable).
 *
 * Reminder text (parentheses) is read TYPE-AWARELY:
 *   - LAND: keep the raw oracle. The original dual lands / type-granting lands print their mana
 *     ability ENTIRELY as reminder text ("({T}: Add {W} or {U}.)" — Tundra, Badlands, shocklands,
 *     triomes), because the basic land types grant it intrinsically. Stripping there would drop the
 *     ability and the land would fall through to the colorless fallback (a {W}/{U} → {C} regression).
 *   - NON-LAND: strip reminder first. A creature/artifact whose only "Add … mana" text is in reminder
 *     is describing a TOKEN it creates ("…create a Treasure token. (It's an artifact with "{T},
 *     Sacrifice this token: Add one mana of any color.")" — Brazen Freebooter) or a keyword's mana
 *     (firebending) — NOT its own ability. Reading it would mis-offer the permanent as a tappable mana
 *     source in `manaSources`. A genuine rock/dork states its ability in MAIN text, so stripping never
 *     drops a real source. (Matches the coverage.hasManaAbility reminder fix; CR 207.2.)
 */
export function manaProduction(card) {
  if (!card) return null;

  const name = String(card.name || "");
  const baseName = name.replace(/^Snow-Covered\s+/i, "").trim();
  if (BASIC_LAND_MANA[baseName]) {
    return { colors: [...BASIC_LAND_MANA[baseName]], amount: 1 };
  }
  if (KNOWN_ROCKS[name]) {
    return { colors: [...KNOWN_ROCKS[name].colors], amount: KNOWN_ROCKS[name].amount };
  }

  // Type-aware reminder handling (see the note above): lands keep the raw oracle (their reminder-text
  // ability is real), non-lands strip it (a reminder "Add … mana" describes a token/keyword, not their
  // own ability). The same `oracleForAdd` feeds the sacrifice-for-mana check so a Treasure (no reminder
  // parens) still flags `sacrifices`, while a token-MAKER's reminder no longer mints a phantom source.
  const isLandCard = /\bLand\b/.test(typeLineOf(card));
  // Non-lands also strip a CREATED TOKEN's quoted ability (stripCreatedTokenAbilities) — a card's own
  // mana production must not be fabricated from the ability of a token it makes (Blisterpod is not a
  // sac-for-{C} source; its Eldrazi Spawn is). The minted TOKEN's own oracle (unquoted "Sacrifice this
  // token: Add {C}") has no create-token context, so it's untouched and still reads as a real source.
  const oracleForAdd = isLandCard
    ? oracleOf(card)
    : stripCreatedTokenAbilities(stripReminder(oracleOf(card)));
  const fromOracle = parseAddClause(oracleForAdd);
  if (fromOracle) {
    const requiresTap = manaAbilityRequiresTap(oracleForAdd);
    return manaAbilitySacrificesSelf(oracleForAdd)
      ? { ...fromOracle, sacrifices: true, requiresTap }
      : { ...fromOracle, requiresTap };
  }

  // A land we couldn't otherwise parse still taps for something — assume
  // colorless so it can at least pay generic. Never invents a color.
  if (isLandCard) {
    return { colors: ["C"], amount: 1 };
  }
  return null;
}

// ─── AURA-LAND-MANA-BOOST ───────────────────────────────────────────────────────

/**
 * The EXTRA mana an "Enchant land" mana-boost Aura (Wild Growth / Overgrowth / Fertile Ground)
 * adds when its host LAND taps for mana — as `[{ colors, amount }, …]`, one entry per attached
 * boost-Aura, or `[]`. This is a TRIGGERED MANA ABILITY (CR 605.1b): it resolves INLINE alongside
 * the land's own mana, so it rides on the land source rather than being its own tappable source —
 * the LAND taps; the Aura is NOT tapped or consumed and fires every time. Reads the host's
 * `attachments` (permanent ids) and parses each attached Aura's boost clause. Pure.
 *
 * Used by BOTH read-sites (manaSources / legalChoices.actionsTapForMana) through this single helper
 * so the auto-pay planner and the explicit tap can't drift (the CREED two-sites invariant).
 */
export function landAuraManaBonus(state, landPerm) {
  const out = [];
  for (const attId of landPerm?.attachments || []) {
    const lk = findPermanent(state, attId);
    if (!lk) continue;
    const bonus = parseAuraLandManaBonus(lk.permanent?.card);
    if (bonus) out.push({ colors: [...bonus.colors], amount: bonus.amount });
  }
  return out;
}

// ─── Battlefield → available sources ───────────────────────────────────────────

/**
 * Untapped permanents that can produce mana right now, as
 * `{ permanentId, colors, amount }`. Lands + non-creature rocks have no
 * summoning-sickness gate; creature dorks are excluded while summoning sick
 * (unless they have Haste).
 *
 * AURA-LAND-MANA-BOOST: a land carrying a mana-boost Aura also reports `bonus: [{colors,amount},…]`
 * — the additional mana that appears INLINE when this source taps (it doesn't tap the Aura). The
 * planner (planPayment) credits it on tap; the bonus is NOT a separate tappable source.
 */
export function manaSources(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return [];
  const sources = [];
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
    const prod = manaProduction(perm.card);
    if (!prod) continue;
    const isCreature = /Creature/.test(typeLineOf(perm.card));
    // GRANTED Haste counts (read through the layer engine), not just printed — a mana dork
    // enchanted/anthemed with Haste can tap the turn it enters. Falls back to the printed
    // seed when there are no continuous effects (the common case), so the hot path is cheap.
    // EXCEPTION (CR 302.6): summoning sickness gates a {T}/{Q} ability, but a sac-for-mana ability with
    // NO {T} (an Eldrazi Spawn "Sacrifice this token: Add {C}", or a Treasure on a creature body) is
    // usable the turn the creature enters — so a freshly-created Spawn ramps immediately. All other
    // summoning-sick creatures (Haste-less {T} dorks) stay excluded exactly as before.
    const usableWhileSick = prod.sacrifices && !prod.requiresTap;
    if (isCreature && perm.summoningSick && !usableWhileSick
        && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    // MANA-VARIABLE: a count-derived amount (Gaea's Cradle "for each creature", Karametra "devotion",
    // Bighorner "greatest power", …) is resolved LIVE against the controller's board (CR 608.2g),
    // floored at 0 — never the parser's amount:0 placeholder. ctx.source = this permanent so an
    // excludeSelf metric ("greatest … among OTHER creatures") drops it. A repeatable tap source with
    // a resolved amount of 0 still appears (it's a legal-but-pointless tap); the action layer
    // (actionsTapForMana) skips offering a 0-mana tap.
    const amount = prod.amountSpec
      ? Math.max(0, countForSpec(state, { controller: playerId, source: perm }, prod.amountSpec))
      : prod.amount;
    // AURA-LAND-MANA-BOOST: a LAND carrying a mana-boost Aura yields extra mana inline on tap. Only
    // lands enchant-eligible for these auras, but the helper is a no-op for non-lands (no attachments
    // parse to a land-mana bonus), so it's cheap + safe to call unconditionally.
    const bonus = landAuraManaBonus(state, perm);
    sources.push({ permanentId: perm.id, colors: prod.colors, amount, sacrifices: !!prod.sacrifices, ...(bonus.length ? { bonus } : {}) });
  }
  return sources;
}

// ─── Payment planning ──────────────────────────────────────────────────────────

/**
 * Plan how to pay `cost` from the current `pool` plus tapping `sources`.
 * Returns `{ taps: [{ permanentId, color, amount }], spend: {W,U,B,R,G,C} }`
 * or null when it can't be paid.
 *
 * `spend` is the EXACT per-color amount to remove from the topped-up pool —
 * the dispatcher applies the taps (`addMana`) then subtracts `spend` verbatim.
 * Returning the exact spend (rather than re-deriving payment with a second
 * heuristic) is what guarantees "affordable per planPayment" == "actually
 * paid": there's no algorithm divergence that could strand mana and throw.
 * Surplus from an over-producing source (Sol Ring on a single generic) floats.
 *
 * Greedy: colored pips are paid SCARCEST-COLOR-FIRST (fewest producing sources
 * first) from the most-constrained source, so the sole source of a color isn't
 * wasted on a more-flexible pip. Hybrid pips pay the cheapest colored side;
 * phyrexian pips are assumed paid with life (not mana, matching
 * legalChoices.canPayManaCost); X counts as 0. Pathological multicolor costs
 * fall to "can't afford" (null) — never to fabricated mana.
 */
export function planPayment(pool, sources, cost) {
  const spend = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!cost) return { taps: [], spend };

  const working = {};
  for (const c of MANA_COLORS) working[c] = pool?.[c] || 0;

  // `amount ?? 1` (NOT `|| 1`): a hand-built source with NO amount field defaults to 1 (the legacy
  // contract), but a resolved variable source with an explicit amount of 0 (Gaea's Cradle / Sanctum
  // Weaver on an empty board) must NOT be floored UP to 1 — that would fabricate mana (MANA-VARIABLE
  // CREED). A non-positive source produces nothing right now, so drop it from the payable set.
  const avail = sources
    .map(s => ({
      permanentId: s.permanentId,
      colors: s.colors.filter(c => COLOR_SET.has(c)),
      amount: s.amount ?? 1,
      sacrifices: !!s.sacrifices,   // one-shot source (Treasure/Gold) — the commit path sacrifices it
      // AURA-LAND-MANA-BOOST: extra mana produced INLINE when this source (a land) taps — each entry
      // {colors, amount}. Credited on tap; the bonus is part of the land tap, never a separate tap.
      bonus: Array.isArray(s.bonus) ? s.bonus.map(b => ({ colors: b.colors.filter(c => COLOR_SET.has(c)), amount: b.amount })).filter(b => b.amount > 0 && b.colors.length) : [],
      used: false,
    }))
    .filter(s => s.amount > 0);
  const taps = [];
  const spendOne = (color) => { working[color] -= 1; spend[color] += 1; };

  // AURA-LAND-MANA-BOOST: a source's full producible-color set = its OWN colors ∪ every boost-Aura
  // bonus's colors (the bonus mana appears INLINE when the land taps, CR 605.1b). So a Forest carrying
  // Fertile Ground ("additional one mana of any color") can satisfy an OFF-color pip via the bonus,
  // even though the Forest's own mana is only {G}. A bonus is never independently tappable — it rides
  // on the same land tap, so the colors merge per-SOURCE here, not as a separate source.
  const sourceCanMake = (s, color) =>
    s.colors.includes(color) || s.bonus.some(b => b.colors.includes(color));

  // Tap a source, assigning `wantColor` (if given) from whichever component can make it, then crediting
  // every other component greedily to a STILL-NEEDED color (cost minus spend minus working), else its
  // first color. Records the chosen primary `color` + `bonus` picks on the tap so the commit path
  // (commitManaTaps / payGenericMana) adds the identical mana — no planner/commit divergence. Returns
  // the assigned `wantColor` (or the primary's chosen color for a generic tap). Every choice is a legal
  // mana the source genuinely produces — never fabricated; surplus floats.
  const tapSource = (s, wantColor) => {
    s.used = true;
    // Components: the primary land mana (one chosen color from s.colors) + each bonus entry.
    const components = [{ colors: s.colors, amount: s.amount, primary: true }, ...s.bonus.map(b => ({ colors: b.colors, amount: b.amount, primary: false }))];
    let primaryColor = null;
    const bonusPicks = [];
    let assigned = false;
    const pickColor = (comp) => {
      // If we still owe `wantColor` and this component can make it, spend it there first.
      if (!assigned && wantColor && comp.colors.includes(wantColor)) { assigned = true; return wantColor; }
      // Else prefer a color the cost STILL needs (helps later pips), else the component's first color.
      const needed = comp.colors.find(c => (cost[c] || 0) - (spend[c] || 0) - (working[c] || 0) > 0);
      return needed || comp.colors[0];
    };
    for (const comp of components) {
      const color = pickColor(comp);
      working[color] += comp.amount;
      if (comp.primary) primaryColor = color;
      else bonusPicks.push({ color, amount: comp.amount });
    }
    taps.push({ permanentId: s.permanentId, color: primaryColor, amount: s.amount, ...(s.sacrifices && { sacrifices: true }), ...(bonusPicks.length && { bonus: bonusPicks }) });
    return wantColor && assigned ? wantColor : primaryColor;
  };

  // Tap the most-constrained untapped source that can make `color` (via own mana OR a boost-Aura bonus).
  const tapForColor = (color) => {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < avail.length; i++) {
      const s = avail[i];
      if (s.used || !sourceCanMake(s, color)) continue;
      // Constraint = how many distinct colors this source can make (own ∪ bonus); the least-flexible wins.
      const flex = new Set([...s.colors, ...s.bonus.flatMap(b => b.colors)]).size;
      if (flex < bestLen) { bestLen = flex; best = i; }
    }
    if (best === -1) return false;
    tapSource(avail[best], color);
    return true;
  };

  // Tap any remaining source (for generic). Returns a color it produced. Prefers a REPEATABLE source
  // over a one-shot sacrifice source (Treasure/Gold) so we never crack a Treasure for generic while an
  // untapped land/rock could pay it — a play-quality refinement, not a legality change.
  const tapAny = () => {
    for (const preferSac of [false, true]) {
      for (const s of avail) {
        if (s.used || s.colors.length === 0 || !!s.sacrifices !== preferSac) continue;
        return tapSource(s, null);
      }
    }
    return null;
  };

  // 1. Colored + colorless pips, scarcest color first. Scarcity = how many sources (plus current pool)
  // can produce it; paying the scarce color first avoids stranding the only source of a color on a
  // more-flexible pip. A source counts toward a color it can make via its own mana OR a boost bonus.
  const producerCount = (color) =>
    (working[color] || 0) + avail.filter(s => !s.used && sourceCanMake(s, color)).length;
  const coloredNeeded = ["W", "U", "B", "R", "G", "C"].filter(c => (cost[c] || 0) > 0);
  coloredNeeded.sort((a, b) => producerCount(a) - producerCount(b));

  for (const color of coloredNeeded) {
    let need = cost[color] || 0;
    while (need > 0) {
      if (working[color] > 0) { spendOne(color); need -= 1; continue; }
      if (tapForColor(color)) { spendOne(color); need -= 1; continue; }
      return null;
    }
  }

  // 2. Hybrid pips — pay one colored option.
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => COLOR_SET.has(o));
    let paid = false;
    for (const opt of colored) {
      if (working[opt] > 0) { spendOne(opt); paid = true; break; }
    }
    if (!paid) {
      for (const opt of colored) {
        if (tapForColor(opt)) { spendOne(opt); paid = true; break; }
      }
    }
    if (!paid) return null;
  }

  // 3. Generic — any mana works. Spend the pool first, then tap.
  let generic = cost.generic || 0;
  if (generic > 0) {
    for (const c of MANA_COLORS) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }
  while (generic > 0) {
    const color = tapAny();
    if (color === null) return null;
    while (generic > 0 && working[color] > 0) { spendOne(color); generic -= 1; }
  }

  return { taps, spend };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality.
 */
export function canAfford(pool, sources, cost) {
  return planPayment(pool, sources, cost) !== null;
}

/**
 * SOFT-CNT — pay a FIXED generic cost of `amount` from `playerId`'s pool + untapped mana sources
 * (the "unless its controller pays {N}" escape on Force Spike / Mana Leak / …). Plans the payment with
 * `planPayment` (the SAME planner the cast path uses, so "affordable" == "actually paid" — no second
 * heuristic that could strand mana), commits the taps — add each source's mana then TAP it, or SACRIFICE
 * a one-shot Treasure/Gold (`tap.sacrifices`) — then subtracts the spend. Returns `{ state, paid }`:
 * `paid:false` with state UNCHANGED when the player can't afford it (the caller then counters the spell),
 * never fabricated mana. `amount <= 0` is a trivial `paid:true` no-op. Mirrors actionDispatcher's
 * `commitManaTaps` + spend-deduction; kept here (a leaf) so the resolution layer can pay without importing
 * the dispatcher (which would cycle).
 */
export function payGenericMana(state, playerId, amount) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  if (n === 0) return { state, paid: true };
  return payManaCost(state, playerId, { generic: n });
}

/**
 * KW-WARD-PR2 — pay an ARBITRARY mana cost (colored / hybrid / generic, the full `planPayment` cost shape)
 * from `playerId`'s pool + untapped sources. Generalizes payGenericMana (which now delegates here) so a
 * non-all-generic ward — `Ward {1}{U}`, `Ward {W/U}` — can be paid exactly like a cast cost, never as a
 * generic approximation (which would mis-charge the wrong color = a CREED false positive). Same contract as
 * payGenericMana: `{ state, paid }`, `paid:false` with state UNCHANGED when unaffordable, never fabricated
 * mana. A zero / empty cost is a trivial `paid:true`. The corpus has no true colored-mana ward today
 * (only Minthara's `Ward {X}`, which stays unmodeled) — this exists so the cost form is COMPLETE, not
 * partial, the moment such a card is played.
 */
export function payManaCost(state, playerId, cost) {
  const c = cost || {};
  const empty =
    !(c.generic > 0) &&
    !MANA_COLORS.some((col) => (c[col] || 0) > 0) && // MANA_COLORS includes C (colorless pip)
    !(Array.isArray(c.hybrid) && c.hybrid.length);
  if (empty) return { state, paid: true };
  const player = state?.players?.[playerId];
  if (!player) return { state, paid: false };
  const plan = planPayment(player.manaPool, manaSources(state, playerId), c);
  if (!plan) return { state, paid: false };
  let next = state;
  for (const tap of plan.taps) {
    next = addMana(next, { playerId, color: tap.color, amount: tap.amount });
    // AURA-LAND-MANA-BOOST: float the boost-Aura mana that appears inline when this land taps (the
    // Aura is NOT tapped/consumed). The planner already chose the bonus color(s) and counted them in
    // `spend`, so adding them here keeps the topped pool == what the plan spent.
    for (const b of tap.bonus || []) next = addMana(next, { playerId, color: b.color, amount: b.amount });
    if (tap.sacrifices) {
      const sacPerm = next.players[playerId]?.battlefield?.find(p => p.id === tap.permanentId); // capture pre-move (for the type)
      next = moveCardToZone(next, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: tap.permanentId });
      // SAC-TREASURE: cracking a one-shot Treasure/Gold to pay mana fires "whenever you sacrifice an artifact/permanent".
      if (sacPerm) next = checkSacrificeTriggers(next, playerId, { id: sacPerm.id, controller: playerId, card: sacPerm.card });
    } else {
      next = tapPermanent(next, tap.permanentId);
    }
  }
  const topped = next.players[playerId].manaPool;
  const nextPool = {};
  for (const col of Object.keys(topped)) nextPool[col] = (topped[col] || 0) - (plan.spend?.[col] || 0);
  next = { ...next, players: { ...next.players, [playerId]: { ...next.players[playerId], manaPool: nextPool } } };
  return { state: next, paid: true };
}

// Internal exports for tests.
export const _internals = { parseAddClause, hasHaste, BASIC_LAND_MANA, KNOWN_ROCKS };
