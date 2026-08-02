/**
 * effects/spanMatchers.js — the up-front multi-sentence SPAN matchers.
 *
 * Extracted verbatim from parser.js (slice 4 of the parser.js decomposition,
 * 2026-07-18). Every matcher here recognizes a modeled shape whose text SPANS what
 * splitClauses would shatter (a two-sentence rider, a comma-joined "then" chain, an
 * internal " and "), so parseEffectClauseImpl consults them UP FRONT — before the
 * split — and collapses each span to its atom(s). The matchers are pure
 * `oracle → {atom(s), …} | null` recognizers; THE DISPATCH ORDER STAYS IN
 * parseEffectClauseImpl (parser.js) — this module only holds the definitions, so the
 * move cannot reorder matching.
 *
 * Families: hand disruption (δ-1) · the removal/counter rider folds (controller-token /
 * damage / exile-instead / zone-redirect — leads resolved via the atoms clause parsers) ·
 * the library span collapses (impulse-dig / reorder-top / dig-land / look-top-take /
 * choose-type-draw).
 *
 * LEAF over leaves — imports textNormalize + parseHelpers (pure leaves) and the
 * atoms clause parsers (which never import parser.js, per the one-way-edge rule);
 * no cycle. parser.js imports all 12 back for its dispatch + the trigger/activated
 * rider paths (parseControllerRider / matchRemovalControllerRider).
 */
import { stripReminder } from "./textNormalize.js";
import { parseTutorFilter, parseTokenKeywords, NUM_WORD } from "./parseHelpers.js";
import { destroyExileClauseParser } from "./atoms/removal.js";
import { counterClauseParser } from "./atoms/stack.js";

// δ-1 hand disruption — the filter phrase between "you choose a/an" and "card" mapped to a modeled
// handFilter spec (the enumerator's predicate: `include` = front-face type must contain ANY, `exclude`
// = must contain NONE, `maxCmc` = the optional "mana value N or less"). ALLOWLIST: only these exact
// phrases are modeled — Duress, Thoughtseize, Distress, Inquisition, Coercion, Despise, Divest, Harsh
// Scrutiny. Any other filter ("nonblack", "with the highest mana value", a tribal type) isn't in the
// map → matchHandDisruption returns null → the whole spell routes to the Arbiter (CLAUDE.md §1.2).
const HAND_FILTER_MAP = {
  "": {},                                                      // Coercion — any card
  "nonland": { exclude: ["Land"] },                            // Thoughtseize / Distress / Inquisition
  "noncreature, nonland": { exclude: ["Creature", "Land"] },   // Duress
  "creature": { include: ["Creature"] },                       // Harsh Scrutiny
  "creature or planeswalker": { include: ["Creature", "Planeswalker"] }, // Despise
  "artifact or creature": { include: ["Artifact", "Creature"] },         // Divest
};

// IMPRINT (CR 207.2c) — the filter phrase between "exile a/an" and "card from your hand", mapped to the
// SAME modeled handFilter spec the discard family uses (include / exclude / maxCmc). ALLOWLIST, deliberately:
// only these exact phrases are modeled, and anything else returns null so the card routes to the Arbiter
// rather than imprinting something the payoff will misread.
const IMPRINT_FILTER_MAP = {
  "nonartifact, nonland": { exclude: ["Artifact", "Land"] },  // Chrome Mox
  "nonland": { exclude: ["Land"] },                           // Semblance Anvil
  "creature": { include: ["Creature"] },                      // Soul Foundry
  "artifact": { include: ["Artifact"] },                      // Prototype Portal
  "instant": { include: ["Instant"] },                        // Spellbinder / Isochron Scepter (+ maxCmc)
};

/**
 * IMPRINT (CR 207.2c) — match an imprint ETB's effect clause, "[you may] exile a <filter> card from your
 * hand [with mana value N or less]". The "Imprint —" ability-word label is already gone
 * (stripTriggerAbilityLabel), but the "you may" is NOT: α2's optional peel lives INSIDE parseEffectClause,
 * and the up-front span matchers run before it. So the prefix is consumed here and re-stamped as
 * `optional: true`, the same shape α2 produces ({op:"draw", optional:true}) — measured, not assumed: without
 * this the clause reached the matcher with "you may" attached and fell to LOW.
 *
 * Every printed imprint is a "may", so the prefix is effectively mandatory in practice; it stays OPTIONAL in
 * the regex rather than required so a hypothetical mandatory printing still parses rather than silently
 * routing to the Arbiter.
 *
 * Whole-clause anchored: a rider past the exile (Summoner's Egg's "face down", Ugin's Labyrinth's tail)
 * does NOT match and routes to the Arbiter — a safe FN. Returns `{ atom, rest }` like its siblings.
 */
export function matchImprint(oracle) {
  const m = String(oracle).match(
    /^(you may )?exile an? ?([a-z, ]*?) ?card from your hand(?: with mana value (\d+) or less)?\.?$/i,
  );
  if (!m) return null;
  const phrase = m[2].trim().toLowerCase();
  if (!(phrase in IMPRINT_FILTER_MAP)) return null;            // an unmodeled filter → low → Arbiter
  const handFilter = { ...IMPRINT_FILTER_MAP[phrase] };
  if (m[3]) handFilter.maxCmc = parseInt(m[3], 10);
  return { atom: { op: "imprint", handFilter, filterLabel: phrase || null, ...(m[1] ? { optional: true } : {}) }, rest: "" };
}

/**
 * Match the leading "Target <opponent|player> reveals their hand. You choose a <filter> card from it
 * [with mana value N or less]. That player discards that card." template (δ-1). Returns
 * `{ atom, rest }` — the `discard-chosen` atom plus the oracle text AFTER the template (rider
 * sentences like "You lose 2 life." / "Scry 1.") — or null when the text isn't this exact shape or
 * carries an unmodeled card filter. "You MAY choose …" (Reckoner Shakedown's optional branch) and the
 * exile/graveyard variant (Agonizing Remorse) don't match → Arbiter. `an?` matches the article whether
 * the filter starts with a vowel ("an artifact …") or not ("a nonland …").
 */
export function matchHandDisruption(oracle) {
  const m = String(oracle).match(
    /^target (?:opponent|player) reveals their hand\. you choose an? ?([a-z, ]*?) ?card from it(?: with mana value (\d+) or less)?\. that player discards that card\.?/i,
  );
  if (!m) return null;
  const phrase = m[1].trim().toLowerCase();
  if (!(phrase in HAND_FILTER_MAP)) return null;               // an unmodeled filter → low → Arbiter
  const handFilter = { ...HAND_FILTER_MAP[phrase] };
  if (m[2]) handFilter.maxCmc = parseInt(m[2], 10);
  // δ-1b: the atom TARGETS the opponent (a player), bound at cast WITHOUT seeing their hand. The
  // handFilter rides along and is applied at RESOLUTION (applyDiscardChosen reveals that opponent's hand,
  // sets a pendingChoice of the matching cards). This is the faithful Duress flow — commit to the
  // opponent, THEN reveal — and in 4P it can't cross-opponent cherry-pick / leak other hands (the δ-1a
  // `handCard` cast-time model could). `who` records opponent-vs-player for completeness (both enumerate
  // opponents — a safe subset of "target player", never the caster's own hand).
  const who = /reveals their hand/i.test(m[0]) && /^target opponent/i.test(m[0]) ? "opponent" : "player";
  return { atom: { op: "discard-chosen", targetType: "opponent", handFilter, who }, rest: oracle.slice(m[0].length).trim() };
}

// ===== RIDER-REMOVAL ===== (Dex, real-deck slice 2) — targeted removal whose SECOND sentence acts on the
// TARGET's controller: "Exile/Destroy target X. Its controller {gains life equal to its power | creates a
// N/N <color> <subtype> creature token | may search their library for a basic land card, put it onto the
// battlefield[ tapped], then shuffle}." (Swords to Plowshares, Beast Within / Generous Gift, Path to Exile /
// Assassin's Trophy). The lead removal is parsed by the SHARED removal grammar (parseExtendedAtom), so it
// reuses EVERY modeled targetType + controller restriction (creature / permanent / "permanent an opponent
// controls") with no targeting changes; the rider rides on the atom as `controllerRider` and is applied at
// RESOLUTION to the captured target-controller (CR — "its controller" = the just-removed permanent's
// controller). ALL-OR-NOTHING: an unmodeled rider, or a lead the removal grammar doesn't model, → null →
// the whole card stays low → Arbiter (never a confident partial that fires the removal but drops the rider).
const RIDER_COUNT = { a: 1, two: 2, three: 3, four: 4, five: 5 };
export function parseControllerRider(t) {
  // Swords to Plowshares — "gains life equal to its power" (the exiled creature's power, captured pre-removal).
  if (/^gains life equal to its power$/.test(t)) return { kind: "gainLifePower" };
  // Beast Within / Generous Gift (vanilla) + Swan Song (KEYWORD) — "creates a N/N <color> <subtype> creature
  // token[ with <KW…>]". A single color word + a single creature subtype; an optional " with <KW>" is parsed
  // by parseTokenKeywords (the enforced+layer-aware set), so an UNMODELED keyword (or a "with flying and you
  // gain 2 life" rider tail) → null → the whole card stays low → Arbiter.
  // ⭐ THE COLOR PHRASE ACCEPTS A PAIR ("red and white", "white and black"), matching what the MAIN
  // create-token path has always accepted and what the token builder has always understood — "and" is
  // literally an entry in TOKEN_COLOR_WORDS, so tokenTypeLine strips a two-colour phrase exactly as it strips
  // a one-colour one. Only this RIDER copy of the grammar was single-colour, so "Its controller creates a 3/2
  // red and white Spirit creature token." (Reduce to Memory, Harsh Annotation) parked while the identical
  // sentence as a card's own effect went native. Downstream built for it, one arm never handed it over.
  let m = t.match(/^creates a (\d+)\/(\d+) ((?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))?) ([a-z]+) creature token(?: with (.+))?$/);
  if (m) {
    const keywords = m[5] ? parseTokenKeywords(m[5]) : [];
    if (m[5] && !keywords) return null;                       // unmodeled token keyword → low → Arbiter
    const rider = { kind: "createToken", power: parseInt(m[1], 10), toughness: parseInt(m[2], 10), color: m[3], subtype: m[4] };
    if (keywords && keywords.length) rider.keywords = keywords; // vanilla tokens keep NO keywords field (slice-2 shape)
    return rider;
  }
  // An Offer You Can't Refuse — "creates a/two/three <Treasure|Clue|Food|Gold> token(s)" (a NAMED artifact
  // token; reuses applyCreateNamedToken). The parenthetical reminder is stripped before this runs.
  m = t.match(/^creates (a|two|three|four|five) (treasure|clue|food|gold) tokens?$/);
  if (m) return { kind: "createNamedToken", token: m[2], count: RIDER_COUNT[m[1]] };
  // CNT-DRAW-RIDER (Dream Fracture) — "draws a card" / "draws N cards" (the COUNTERED spell's controller draws,
  // applied to the captured controller via the drawCards rider). Only the unconditional, fixed-count form (no
  // "may", no "up to", no delayed "at the beginning of …") — a delayed/optional draw (Arcane Denial) leaves the
  // anchor unmatched → null → low → Arbiter. Used only on the counter-rider path (a removal never says "draws").
  m = t.match(/^draws (a|two|three|four|five) cards?$/);
  if (m) return { kind: "drawCards", count: RIDER_COUNT[m[1]] };
  // Path to Exile / Assassin's Trophy — "may search their library for a basic land card, put it/that card
  // onto the battlefield[ tapped], then shuffle". Reuses the RAMP-1 battlefield tutor scoped to that player;
  // the optional "may" is the tutor's find-nothing (identical to how Farhaven Elf's "you may search" models).
  m = t.match(/^may search their library for a basic land card, put (?:it|that card) onto the battlefield( tapped)?, then shuffle$/);
  if (m) return { kind: "rampBasic", entersTapped: !!m[1] };
  // CNT-MILL-RIDER (BLITZ CS-1 — Thought Collapse / Didn't Say Please) — "mills N cards" (the COUNTERED
  // spell's controller mills, applied to the captured controller via library.millOnePlayer so the
  // mill-doubler + milled-trigger binds fire exactly like any other mill). Fixed count only; a scaled/
  // conditional form leaves the anchor unmatched → null → low → Arbiter.
  m = t.match(/^mills (a|two|three|four|five|six|seven|eight|\d+) cards?$/);
  if (m) return { kind: "mill", count: RIDER_COUNT[m[1]] ?? parseInt(m[1], 10) };
  // ⭐ LOSE-LIFE RIDER — "Its controller loses N life." (Hideous End, Sip of Hemlock, Soul Reap, Bitter
  // Downfall, Despoil, Spreading Rot, Glissa's Scorn, Launch Party, Inevitable Defeat …), and the drain
  // twin "…loses N life and you gain N life." (Certain Death). THE MOST COMMON PRINTED RIDER IN THIS FAMILY
  // and the one entry this vocabulary never had: the lead grammar, the controller CAPTURE and the apply seam
  // were all already built for gain-life / tokens / draw / mill, so every one of these cards parked on a
  // missing map entry rather than a missing mechanism.
  //
  // ⛔ THE DRAIN HALF IS THE CONTROLLER'S LOSS PLUS THE CASTER'S GAIN, and the two amounts are read
  // SEPARATELY from the printed text rather than assumed equal. Every corpus printing happens to match, but
  // binding the gain to the loss would be a fabrication the moment a card prints otherwise — and this is the
  // ONE place a rider touches a player other than the captured controller, so it says so explicitly.
  // Fixed amounts only: a scaled form ("loses life equal to its power") has no captured metric here and
  // leaves the anchor unmatched → null → low → Arbiter.
  m = t.match(/^loses (\d+) life(?: and you gain (\d+) life)?$/);
  if (m) {
    const rider = { kind: "loseLife", amount: parseInt(m[1], 10) };
    if (m[2] !== undefined) rider.youGain = parseInt(m[2], 10);
    return rider;
  }
  return null; // an unmodeled controller rider → low → Arbiter
}
/**
 * @param parseLead  OPTIONAL fallback lead parser, injected by parser.js.
 *
 * ⭐ WHY AN INJECTED FALLBACK RATHER THAN A WIDER `destroyExileClauseParser`. That parser handles
 * destroy-LAND, destroy-ARTIFACT, exile-anything — but NOT destroy-CREATURE, which lives in the main clause
 * grammar with its regeneration / can't-be-regenerated riders. So this fold has always worked for
 * "Destroy target land. Its controller …" and silently never for "Destroy target creature. Its controller …",
 * which is the single most common printing of the shape (Hideous End, Sip of Hemlock, Certain Death …).
 *
 * spanMatchers cannot import parser.js (parser imports THIS file — a cycle), so parser.js passes its own
 * `parseEffectClause` down. ⛔ The fallback runs ONLY when `destroyExileClauseParser` returns null, so no lead
 * that resolves today can be re-resolved through a different path — the same ordering rule that kept the
 * restricted-mana and self-exile slices at LOST 0.
 */
/**
 * ===== REMOVAL + CASTER GAIN-LIFE RIDER ===== — "Destroy/Exile target X. You gain life equal to its
 * <toughness|mana value>." (Sever Soul, Divine Offering, Serene Offering, Vampiric Rites' kin).
 *
 * ⭐ THE SUBJECT IS THE OTHER ONE. `matchRemovalControllerRider` folds "ITS CONTROLLER <rider>"; this folds
 * "YOU <rider>" on the identical lead grammar. The metric capture (power / toughness / mana value, read
 * pre-removal) is shared, so the only new thing is the beneficiary — and ⛔ getting THAT backwards is the
 * whole risk: Swords to Plowshares gives the life to the target's controller, Sever Soul gives it to the
 * caster, and the two sentences differ by one word.
 *
 * Reuses the same injected fallback lead resolver, so destroy-CREATURE leads work here from the start rather
 * than needing the same hole found twice.
 */
export function matchRemovalCasterGainLife(oracle, parseLead = null) {
  const m = stripReminder(oracle).trim().replace(/[’]/g, "'")
    .match(/^((?:exile|destroy) target .+?)\.\s+you gain life equal to (?:its|that creature's) (toughness|mana value)\.?$/i);
  if (!m) return null;
  let lead = destroyExileClauseParser(m[1].trim());
  if (!lead && parseLead) {
    const atoms = parseLead(m[1].trim())?.atoms;
    if (Array.isArray(atoms) && atoms.length === 1 && (atoms[0].op === "destroy" || atoms[0].op === "exile")) lead = atoms[0];
  }
  if (!lead || (lead.op !== "exile" && lead.op !== "destroy")) return null;
  const metric = /mana value/i.test(m[2]) ? "mv" : "toughness";
  return { atom: { ...lead, controllerRider: { kind: "casterGainLife", metric } }, rest: "" };
}

export function matchRemovalControllerRider(oracle, parseLead = null) {
  // A TRAILING sentence is handed back as `rest` rather than blocking the match. The rider itself is always
  // period-free (every shape parseControllerRider models is a single clause, and its anchors are ^…$ — a
  // rider containing a period could never have matched one), so `[^.]+` greedily takes exactly the rider and
  // stops at its terminator; whatever follows becomes rest, which collapsed() parses into further atoms and
  // fails cleanly on if it doesn't parse. Without this the whole-oracle `$` anchor meant a perfectly ordinary
  // second sentence — "Draw a card." on Geomancer's Gambit / Price of Freedom — sent the card to the Arbiter
  // even though both halves were individually modeled.
  const m = stripReminder(oracle).trim().match(/^((?:exile|destroy) target .+?)\.\s+its controller ([^.]+)\.?(?:\s+([\s\S]+))?$/i);
  if (!m) return null;
  // The bare destroy/exile lead lives in atoms/removal.destroyExileClauseParser (seam batch 27), so resolve
  // the rider-stripped lead via that clause parser directly. (The old parseExtendedAtom() || fallback was
  // provably dead — a destroy/exile lead can never match the draw/rad sentinels — and went with the S2 drain.)
  let lead = destroyExileClauseParser(m[1].trim());
  if (!lead && parseLead) {
    // Creature-lead fallback. Accept ONLY a single-atom destroy/exile program: a multi-atom lead would mean
    // the "lead" text carried more than the removal, and folding a rider onto the first of several atoms
    // would attach it to the wrong effect. Any other shape → null → the card keeps its refusal.
    const p = parseLead(m[1].trim());
    const atoms = p?.atoms;
    if (Array.isArray(atoms) && atoms.length === 1 && (atoms[0].op === "destroy" || atoms[0].op === "exile")) lead = atoms[0];
  }
  if (!lead || (lead.op !== "exile" && lead.op !== "destroy")) return null; // lead must be a modeled removal
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                   // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: (m[3] || "").trim() };
}
// ===== DESTROY-DAMAGE-RIDER ===== — targeted DESTROY whose SECOND sentence is the SPELL ITSELF dealing damage
// to the TARGET's controller (CR — "that <noun>'s controller" = the just-destroyed permanent's controller):
// Smash to Smithereens ("Destroy target artifact. Smash to Smithereens deals 3 damage to that artifact's
// controller."), Destructive Revelry (artifact or enchantment, 2), Melt Terrain / Poison the Well (land, 2),
// Consign to the Pit (creature, 2). This is the damage-dealing twin of matchRemovalControllerRider's
// "Its controller <rider>" fold: the lead reuses the SAME shared removal grammar (parseExtendedAtom ||
// destroyExileClauseParser — so every modeled targetType rides along, but the typed-land leads "Plains or
// Island"/"Mountain" the grammar doesn't model fail the lead parse → null → Arbiter, ALL-OR-NOTHING), and the
// damage rides on the atom as `damageRider` (applied at RESOLUTION to the captured target-controller through
// the SAME applyDamageEffect every burn spell uses — so triggers/replacements/lifeloss are handled identically).
// The damage is UNCONDITIONAL by default; the ONE modeled condition is Molten Rain's "If that land was nonbasic,
// …" (`onlyIfNonbasic`) — evaluated by capturing the target land's nonbasic-ness BEFORE the destroy (the same
// type-line predicate the nonbasicLand targetType uses). Any OTHER condition (Icequake's "if that land was a
// snow land" — snow isn't tracked at resolution; Unlicensed Disintegration's "if you control an artifact" — a
// board-state gate) fails the anchor → null → low → Arbiter (whole-card CREED, never a partial that fires
// damage that shouldn't, or drops the condition).
// The damage rider = an OPTIONAL nonbasic condition (the ONLY modeled condition) + the SELF name + "deals N
// damage to that/the <noun>'s controller". The self-name is `[a-z'][a-z' ]*?` — letters/apostrophe/space only,
// NO comma — so it can't swallow ANOTHER leading conditional clause ("If that land was a snow land,",
// "If you control an artifact,"): those carry a comma the self-name can't cross, and they aren't the modeled
// nonbasic prefix → the whole rider fails the anchor → null → Arbiter (CREED — never fire damage gated on an
// unmodeled condition). Anchored ^…$ over the rider sentence.
const DAMAGE_RIDER_RE =
  /^(?:(if that land was nonbasic), )?[a-z'][a-z' ]*? deals (\d+) damage to (?:that|the) (?:artifact|creature|enchantment|permanent|land)(?:'s)? controller$/i;
export function matchRemovalDamageRider(oracle) {
  // The lead destroy + the second sentence. The rider portion is captured greedily to end-of-string, then
  // validated by DAMAGE_RIDER_RE (which enforces the comma-free self-name, so an unmodeled "If …, X deals …"
  // condition can't pass even though the outer .+? captured it).
  const m = stripReminder(oracle).trim().replace(/[’]/g, "'").match(/^(destroy target .+?)\.\s+(.+? deals \d+ damage to (?:that|the) (?:artifact|creature|enchantment|permanent|land)(?:'s)? controller)\.?$/i);
  if (!m) return null;
  const lead = destroyExileClauseParser(m[1].trim());
  if (!lead || lead.op !== "destroy") return null;                           // DESTROY lead only (no exile form in the corpus)
  const dm = m[2].trim().match(DAMAGE_RIDER_RE);
  if (!dm) return null;                                                       // an unmodeled condition / shape → low → Arbiter
  const damageRider = { amount: parseInt(dm[2], 10) };
  if (dm[1]) damageRider.onlyIfNonbasic = true;                              // Molten Rain — "If that land was nonbasic,"
  return { atom: { ...lead, damageRider }, rest: "" };
}
// SOFT-COUNTER-RIDER — "Counter target <filter> spell. Its controller <rider>.[ <tail>]" (An Offer You Can't
// Refuse "creates two Treasure tokens", Swan Song "creates a 2/2 blue Bird … with flying", Dream Fracture "draws
// a card. Draw a card."). The lead reuses the counter grammar (spellFilter incl. the 3-way enchantment/instant/
// sorcery); the rider rides on the atom and is applied at resolution to the COUNTERED spell's controller
// (captured in applyCounter). The parenthetical token reminder is stripped. The rider capture stops at the FIRST
// sentence period — any FURTHER sentences (Dream Fracture's caster-side "Draw a card.") are returned as `rest` so
// collapsed() parses them as additional atoms (ALL-OR-NOTHING — an unmodeled tail drops the whole card to LOW).
// ALL-OR-NOTHING: an unmodeled rider, a soft-counter ("unless pays {N}", which the lead grammar returns WITH
// unlessPay — rejected here so the rider+pay interaction isn't half-modeled), or a non-counter lead → null → low
// → Arbiter.
export function matchCounterControllerRider(oracle) {
  // Non-greedy rider capture to the first "." — a `rest` (the trailing caster-side clause[s]) is parsed by collapsed().
  // The filter words are OPTIONAL ((?:.+? )?) so the bare "Counter target spell" form (Dream Fracture) matches too.
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell)\.\s+its controller ([^.]+?)\.(.*)$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim()); // counter matchers moved to a clause parser (batch 28)
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only (defer soft+rider)
  const rider = parseControllerRider(m[2].trim().toLowerCase());
  if (!rider) return null;                                                    // unmodeled rider → low → Arbiter
  return { atom: { ...lead, controllerRider: rider }, rest: (m[3] || "").trim() };
}
// CNT-EXILE-INSTEAD (WAVE 2b + BLITZ CS-1) — "Counter target <filter> spell[ unless its controller pays
// {N}/{X}]. If that spell is countered this way, exile it instead of putting it into its owner's graveyard."
// (Deny Existence "creature" — hard; Syncopate "{X}" / No More Lies "{3}" — SOFT: the pay-decision suspends
// first, and the DECLINE path exiles instead — setPendingSoftCounterChoice carries counterDest through to
// resolveSoftCounterChoice, so the redirect can't be dropped on the suspend). The lead reuses the counter
// grammar (a lead filter the grammar doesn't model — Deny the Divine's "creature or enchantment", Faerie
// Trickery's "non-Faerie" — fails the lead parse → null → low → Arbiter, ALL-OR-NOTHING). Spans two
// sentences (the "If that spell …" rider would be shattered by splitClauses), so it's matched up front as
// ONE collapsed atom. The optional unless-pays span rides INSIDE the lead capture (the sc/scx grammar
// parses it); an unmodeled soft form (pay-count, pay-life) isn't in the span → no match → Arbiter.
export function matchCounterExileInstead(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell(?: unless its controller pays \{[\dx]+\})?)\. if that spell is countered this way, exile it instead of putting it into its owner's graveyard\.?$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim()); // counter matchers moved to a clause parser (batch 28)
  if (!lead || lead.op !== "counter") return null; // soft leads OK (CS-1): the choice carries the dest
  return { atom: { ...lead, exileInstead: true }, rest: "" };
}
// CNT-ZONE-REDIRECT (CROSS-COUNTER) — "Counter target <filter> spell. If that spell is countered this way, put
// it into its owner's hand|on top of its owner's library instead of into that player's graveyard.[ <tail>]"
// (Remand → owner's hand + "Draw a card."; Memory Lapse → top of owner's library). The lead reuses the counter
// grammar; the redirect sets counterDest on the atom (applyCounter → counterSpellById routes the countered card
// to that zone instead of the graveyard). Any FURTHER sentences (Remand's "Draw a card.") are returned as `rest`
// for collapsed() to parse as additional atoms (ALL-OR-NOTHING — an unmodeled tail drops the whole card to LOW).
// Tried AFTER matchCounterExileInstead (disjoint anchors — that one says "exile it instead", this one "put it
// into its owner's hand / on top of its owner's library instead"). Hard-counter lead only (the soft-counter
// pay-decision isn't composed here). The two-sentence span would be shattered by splitClauses, so it's matched
// up front like the exile-instead form.
export function matchCounterZoneRedirect(oracle) {
  const m = stripReminder(oracle).trim().match(/^(counter target (?:.+? )?spell)\. if that spell is countered this way, put it (into its owner's hand|on top of its owner's library) instead of into that player's graveyard\.(.*)$/i);
  if (!m) return null;
  const lead = counterClauseParser(m[1].trim());
  if (!lead || lead.op !== "counter" || lead.unlessPay != null || lead.unlessPayX) return null; // hard counter only
  const counterDest = /hand/i.test(m[2]) ? "hand" : "library-top";
  return { atom: { ...lead, counterDest }, rest: (m[3] || "").trim() };
}

// δ-2 impulse-dig — spelled cardinals the "top <N> cards" template uses (2-10; bigger digs are rare).
const DIG_NUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Match the "Look at the top N cards of your library. Put one of them into your hand and the rest
 * <on the bottom of your library [in any/a random order] | into your graveyard>." dig template (δ-2 —
 * Anticipate, Strategic Planning, Impulse — a 3-way "one to hand / one on top / one on bottom" split
 * like Telling Time correctly fails the anchor → Arbiter). Returns `{ atom, rest }`
 * — the `impulse-dig` atom plus any oracle text AFTER the template — or null. Like hand disruption this
 * SPANS two sentences (the "Put one … and the rest …" clause's internal " and " would be shattered by
 * splitClauses), so it's matched up front as ONE atom. ALL-OR-NOTHING ALLOWLIST: EXACTLY "put one …
 * into your hand" + rest → bottom or graveyard. A multi-pick ("put two", "put any number"), a 3-way
 * split (Telling Time), "rest in random order ON TOP", or an X/Domain count all fail the anchor → low →
 * Arbiter. DIG-1 ADDS: the N=2 "and the OTHER on the bottom" phrasing (Sleight of Hand), and the FILTERED
 * reveal-dig "you may reveal a <type> card from among them and put it into your hand. Put the rest on the
 * bottom" (Commune with Nature, Seek the Wilds, Peer Through Depths).
 */
export function matchImpulseDig(oracle) {
  // (1) Plain keep-one dig — "put one of them into your hand and the rest|the other on the bottom|graveyard".
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. put (one|two|three) of (?:them|those cards|these cards) into your hand and (?:put )?(?:the rest|the other) (on the bottom of your library(?: in (?:any|a random) order)?|into your graveyard)\.?/i,
  );
  if (m) {
    const amount = DIG_NUM[m[1].toLowerCase()];
    if (!amount) return null;                                   // "the top X cards" (variable) / unspelled → Arbiter
    // MULTI-KEEP (Stock Up, Dig Through Time, Ancestral Memories …): the allowlist above used to admit ONLY
    // "put ONE of them", so every "put two/three" card fell to the Arbiter. The keep count now rides on the
    // atom and the choice RE-RAISES until that many are picked. Still an allowlist — "any number", a 3-way
    // split (Telling Time) and a variable/X count all still fail the anchor.
    const keep = { one: 1, two: 2, three: 3 }[m[2].toLowerCase()];
    if (!keep || keep >= amount) return null;                   // keep-all is not a dig; keep>look is nonsense → Arbiter
    const restTo = /graveyard/i.test(m[3]) ? "graveyard" : "bottom";
    return { atom: { op: "impulse-dig", amount, keep, restTo }, rest: oracle.slice(m[0].length).trim() };
  }
  // (2) FILTERED reveal-dig — "look at top N. you may reveal a <type> card from among them and put it into
  // your hand. Put the rest on the bottom." Only TYPE-MATCHING cards are keepable to hand; the rest (incl.
  // non-matching) go to the bottom — applyImpulseDig disposes the whole looked-at set minus the kept card.
  // The "you may" DECLINE is omitted as STRICTLY DOMINATED: a free card to hand vs. that card going to the
  // bottom either way, with no cost / no decking risk to decline (unlike "you may draw") — so the modeled
  // line (keep the best matching; human picks which) is always faithful-or-better. The type phrase reuses
  // the tutor filter allowlist (parseTutorFilter); a tribal ("dinosaur") / unlisted word → null → Arbiter.
  // Plural "put the revealed CARDS" (multi-keep) / "any number" / "onto the battlefield" don't match "put
  // it into your hand" → low → Arbiter (those are different effects, deferred).
  // LK-1 CHOSEN-TYPE (CR 614.12) — an OPTIONAL " of the chosen type" qualifier after "card" (Icon of Ancestry's
  // "reveal a creature card OF THE CHOSEN TYPE from among them …"). The chooser (CHOSEN_TYPE_CHOOSER) stored the
  // controller's pick on the source permanent at ETB (perm.chosenType); the resolver AND-filters the looked-at
  // set by BOTH the base type (creature) AND that stored chosenType via ctx.sourceId (applyImpulseDigAtom's
  // chosenTypeOfSource branch). A card carrying the qualifier without a chosen-type source (impossible in the
  // real corpus — the qualifier only appears on chooser cards) would filter nothing → all to the bottom (a SAFE
  // reveal-nothing). Group 3 records whether the qualifier is present.
  const rd = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. you may reveal an? ([a-z][a-z ]*?) card( of the chosen type)? from among them and put (?:it|that card) into your hand\. put the rest on the bottom of your library(?: in (?:any|a random) order)?\.?/i,
  );
  if (rd) {
    const amount = DIG_NUM[rd[1].toLowerCase()];
    const filter = parseTutorFilter(rd[2].trim());
    if (!amount || !filter) return null;                        // unspelled N / tribal-or-unlisted type → Arbiter
    const chosen = !!rd[3];
    if (chosen) filter.chosenTypeOfSource = true;               // AND the source's stored chosenType at resolve time
    const label = chosen ? `${rd[2].trim()} card of the chosen type` : `${rd[2].trim()} card`;
    return { atom: { op: "impulse-dig", amount, restTo: "bottom", filter, filterLabel: label }, rest: oracle.slice(rd[0].length).trim() };
  }
  return null;
}

/**
 * Match the "Look at the top N cards of your library, then put them back in any order.[ You may shuffle.]"
 * REORDER-TOP template (Ponder — N=3 + optional shuffle; Preordain-family "look, reorder, no bottom"). A
 * DISTINCT effect from impulse-dig / scry: EVERY looked-at card is put BACK on top in a chosen order (none go
 * to hand, none are bottomed), with an OPTIONAL shuffle. The "look … then put them back … You may shuffle."
 * span (the comma-joined "then" and the separate optional-shuffle sentence) would be shattered by splitClauses,
 * so it's matched up front as ONE `reorder-top` atom; any trailing sentence (Ponder's "Draw a card.") runs
 * through the normal clause pipeline via collapsed(). Returns `{ atom, rest }` or null.
 *
 * ALL-OR-NOTHING ALLOWLIST: EXACTLY "look at the top N cards of your library, then put them back in any order"
 * + an OPTIONAL trailing "You may shuffle." A variable/unspelled N, a "reveal" (not "look"), a filtered reorder,
 * a MANDATORY shuffle ("then shuffle"), or a "put … on the bottom" disposition all fail the anchor → low →
 * Arbiter (FN-safe — a partial would be forbidden). `mayShuffle` records whether the optional shuffle is present.
 */
export function matchReorderTop(oracle) {
  // The trailing period after "any order" is OPTIONAL (`\.?`): a SPELL carries it ("…any order. You may
  // shuffle.\nDraw a card." — Ponder), but a TRIGGER / activated-ability effect clause arrives with its
  // sentence-final period already stripped ("look at the top four cards of your library, then put them back
  // in any order" — Spire Owl / Sage Owl / Sage of Epityr's ETB). Both feed the SAME reorder-top atom, which
  // resolves identically; only the anchor blocked the period-stripped form. The optional-shuffle group already
  // requires its own leading whitespace, so a with-period spell still matches greedily (period consumed first),
  // never a regression. Any non-final continuation ("…any order and <more>") leaves a `rest` for the pipeline.
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library, then put them back in any order\.?(\s+you may shuffle\.)?/i,
  );
  if (!m) return null;
  const amount = DIG_NUM[m[1].toLowerCase()];
  if (!amount) return null;                                     // "the top X cards" (variable) / unspelled → Arbiter
  return { atom: { op: "reorder-top", amount, mayShuffle: !!m[2] }, rest: oracle.slice(m[0].length).trim() };
}

/**
 * Match the "Look at the top N cards of your library. You may put a land card from among them onto the
 * battlefield [tapped]. Put the rest on the bottom of your library in a random order." template — a DIFFERENT
 * effect from impulse-dig (Silverback Elder mode 2). Instead of keeping a card to HAND, it puts a LAND onto the
 * BATTLEFIELD (dig-land-to-battlefield atom → applyDigLandToBattlefieldAtom → a pick-which-land choice, the
 * chosen land enters + fires its ETB/landfall, the rest bottom in a random order). Two sentences whose effect
 * spans them (the internal " and " / "from among them" would be shattered by splitClauses), so it's matched up
 * front as ONE atom like the impulse-dig template. Returns `{ atom, rest }` or null.
 *
 * ALL-OR-NOTHING ALLOWLIST: EXACTLY "put A LAND card from among them onto the battlefield [tapped]" + rest →
 * bottom in a random order. A TYPED/FILTERED put ("a basic land", "a Forest card"), a MANDATORY put (no "you
 * may"), a MULTI put ("put any number of lands"), a keep-to-HAND ("put it into your hand" — that's the impulse-
 * dig template), an "into your graveyard" rest, or a variable/unspelled N all fail the anchor → the mode/card
 * stays low → Arbiter (FN-safe — a partial would be forbidden). Only the unfiltered "a land card" + battlefield
 * + rest-to-bottom-random shape is claimed.
 */
export function matchDigLandToBattlefield(oracle) {
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. you may put a land card from among them onto the battlefield( tapped)?\. put the rest on the bottom of your library in a random order\.?/i,
  );
  if (!m) return null;
  const amount = DIG_NUM[m[1].toLowerCase()];
  if (!amount) return null;                                     // "the top X cards" (variable) / unspelled → Arbiter
  return { atom: { op: "dig-land-to-battlefield", amount, entersTapped: !!m[2] }, rest: oracle.slice(m[0].length).trim() };
}

/**
 * ===== TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2) ===== "Look at the top card of your library. If it's a
 * <quality> card[ of the chosen type], you may reveal it and put it into your hand." (Dryad Greenseeker's
 * activated dig, Frost Augur's snow dig, Herald's Horn's upkeep trigger.) A DISTINCT mechanic from impulse-dig:
 * top-1, and a declined OR non-matching card STAYS ON TOP with NO rest / bottom / graveyard disposal — so
 * declining is NOT strictly dominated (the card is simply drawn next turn either way). The effect spans two
 * sentences ("Look at … . If it's … , you may …"), so it's collapsed up front to ONE `look-top-take` atom
 * before splitClauses shatters it. Returns `{ atom, rest }` or null.
 *
 * ALL-OR-NOTHING ALLOWLIST (CREED — false-positive FORBIDDEN): the `$`-anchor after "put it into your hand"
 * (plus an optional trailing period) is LOAD-BEARING — a decline-DISPOSAL tail ("If you don't put the card into
 * your hand, you may put it on the bottom / into your graveyard" — Vivien's Grizzly, Archghoul, Cabaretti
 * Ascendancy, Traveling Botanist, …) is a DIFFERENT mechanic (an explicit alternate zone) and must NOT match;
 * those stay Arbiter/body-only, correctly parked. A MANDATORY reveal ("reveal it and put it" with no "you may"),
 * a multi-card dig, or a "reveal the top card" (public reveal, not a private "look") all fail the anchor too.
 * Reminder text is stripped first (Frost Augur trails "({S} can be paid with one mana from a snow source.)").
 * The quality phrase reuses the tutor filter allowlist (parseTutorFilter) — a tribal / unlisted word → null →
 * Arbiter. The optional " of the chosen type" qualifier (Herald's Horn) emits filter.chosenTypeOfSource, which
 * applyLookTopTakeAtom AND-filters at resolution against the source permanent's stored chosenType (perm.chosenType),
 * exactly like the LK-1 impulse-dig chosen-type path (CR 614.12 membership + changeling, CR 702.73a).
 */
export function matchLookTopTake(oracle) {
  const s = stripReminder(oracle).trim();
  const m = s.match(
    /^look at the top card of your library\. if it['’]s an? ([a-z][a-z ]*?) card( of the chosen type)?, you may reveal it and put it into your hand\.?$/i,
  );
  if (!m) return null;
  const filter = parseTutorFilter(m[1].trim());
  if (!filter) return null;                                     // tribal / unlisted quality word → Arbiter
  const chosen = !!m[2];
  if (chosen) filter.chosenTypeOfSource = true;                 // AND the source's stored chosenType at resolve time
  const label = chosen ? `${m[1].trim()} card of the chosen type` : `${m[1].trim()} card`;
  // The $-anchor guarantees NO trailing text, so `rest` is always empty; returned for collapsed()'s uniform shape.
  return { atom: { op: "look-top-take", filter, filterLabel: label }, rest: "" };
}

/**
 * CHOSEN-TYPE DRAW (CR 614.12) — Distant Melody "Choose a creature type. Draw a card for each permanent you
 * control of that type." Two sentences whose effect spans them (the count refers back to the chosen type), so
 * it's matched up front as ONE draw atom like the other collapsed templates. The draw count is a
 * `chosenTypePermanents` board count (shared.countForSpec): the self-play engine resolves the choice OPTIMALLY
 * — the greatest, over every creature subtype present, of the controller's permanents of that subtype
 * (changelings count for all) — so the magnitude is deterministic + never an over/under-count. Whole-string
 * anchored ("Choose a creature type. Draw a card for each permanent you control of that type." + an optional
 * trailing period); any rider/variant leaves residue (→ rest), which `collapsed` runs through the normal
 * pipeline (an unmodeled rider → LOW → Arbiter, never a partial). The "for each permanent … of that type"
 * phrasing is unique to the chosen-type chooser, so this never false-matches a static count source.
 */
export function matchChooseTypeDraw(oracle) {
  const m = String(oracle).match(
    /^choose a creature type\. draw a card for each permanent you control of that type\.?\s*/i,
  );
  if (!m) return null;
  return {
    atom: { op: "draw", amountCount: { kind: "chosenTypePermanents", per: 1 }, targetType: null },
    rest: oracle.slice(m[0].length).trim(),
  };
}

/**
 * DELAYED TRIGGER (CR 603.7) — a resolving spell/ability schedules an ability for a future step.
 * Two printed word orders, same meaning:
 *   LEAD:    "At the beginning of the next end step, <effect>."      (the blink/sacrifice family)
 *   TRAIL:   "<effect> at the beginning of the next turn's upkeep."  (Heal / Bone Harvest — 40 carriers)
 *
 * Returns `{ atom: {op:"schedule-delayed", fireStep, fireScope, delayedClause}, rest }`. The INNER
 * clause is left as text; parser.js gates it — the atom is emitted only when the inner clause itself
 * parses HIGH, so a scheduled ability can never fire an unmodeled effect (CREED). The scheduler runs
 * on state.delayedTriggers (atoms/delayedTrigger.js) and drains at step entry in gameEngine.
 *
 * TIMING MAP (only these; anything else fails the anchor → the whole card routes to the Arbiter):
 *   "the next end step"                → end   / any    "your next end step"      → end   / yours
 *   "the next turn's upkeep"           → upkeep/ any    "your next upkeep"        → upkeep/ yours
 *   "the next turn's main phase"       → main  / any    "your next main phase"    → main  / yours
 *   ("your next PRECOMBAT main phase" also maps to main/yours — same phase, CR 505.1a.)
 * DELIBERATELY EXCLUDED: "the beginning of the next cleanup step" (CR 514 has no priority window —
 * a trigger there would need the special 514.3a extra-step handling this engine doesn't model) and
 * every "your next combat" wording (the engine's combat entry has its own combatBegin lane).
 */
const DELAYED_TIMING = "(?:the next end step|your next end step|the next turn's upkeep|your next upkeep|the next turn's main phase|your next (?:precombat )?main phase)";
function delayedTimingSpec(raw) {
  const t = String(raw).toLowerCase().trim();
  const scope = /^your\b/.test(t) ? "yours" : "any";
  const step = /end step/.test(t) ? "end" : /upkeep/.test(t) ? "upkeep" : /main phase/.test(t) ? "main" : null;
  return step ? { fireStep: step, fireScope: scope } : null;
}
export function matchDelayedTrigger(oracle) {
  const text = String(oracle).trim();
  // LEAD form — "[<immediate sentences>. ]At the beginning of <timing>, <effect>."
  //
  // The leading half is OPTIONAL and was originally absent: the branch was anchored so the whole clause
  // had to be the delayed ability, which is why every "<spell effect>. At the beginning of your next
  // upkeep, <rider>" card (the Pact cycle) fell through to the Arbiter. The TRAIL branch below already
  // supported leading sentences; only the LEAD word order did not. 46 non-native instants/sorceries carry
  // this shape.
  //
  // The timing is captured explicitly now rather than sliced back out of m[0] — with an optional leading
  // group, m[0] no longer starts at "at the beginning of", so the old positional slice would have read
  // the wrong text. Greedy `(.*\.)` prefers the LONGEST immediate half, so on a card carrying more than
  // one "at the beginning of" it splits at the LAST one, keeping the delayed half whole.
  let m = text.match(new RegExp(`^(?:(.*\\.)\\s+)?at the beginning of (${DELAYED_TIMING}),\\s+(.+?)\\.?\\s*$`, "i"));
  if (m) {
    const spec = delayedTimingSpec(m[2]);
    if (!spec) return null;
    return { immediateClause: m[1] ? m[1].trim() : null, delayedClause: m[3].trim(), ...spec };
  }
  // TRAIL form — "[<immediate sentences>. ]<final effect> at the beginning of <timing>."
  // ONLY THE FINAL SENTENCE IS DELAYED. Everything before it is part of the spell's own resolution
  // and happens IMMEDIATELY (CR 603.7 — the resolving spell creates the delayed ability; the rest of
  // that spell still resolves now). Ideas Unbound — "Draw three cards. Discard three cards at the
  // beginning of the next end step." — draws NOW and discards later; a greedy capture of both
  // sentences into the delayed clause would defer the draw too, a resolution-order FP (CREED).
  // `(.*\.)` is greedy so it consumes every complete leading sentence; `[^.]+?` keeps the delayed
  // half to the final period-free sentence. The caller parses the two halves separately and requires
  // BOTH to be modeled before emitting anything.
  m = text.match(new RegExp(`^(?:(.*\\.)\\s+)?([^.]+?)\\s+at the beginning of ${DELAYED_TIMING}\\.?\\s*$`, "i"));
  if (m) {
    const timing = text.slice(text.lastIndexOf(m[2]) + m[2].length).replace(/^\s*at the beginning of\s*/i, "").replace(/\.\s*$/, "");
    const spec = delayedTimingSpec(timing);
    if (!spec) return null;
    return { immediateClause: m[1] ? m[1].trim() : null, delayedClause: m[2].trim(), ...spec };
  }
  return null;
}

/**
 * CHOSEN-TYPE REVEAL TO HAND (For the Ancestors) — "Choose a creature type. Look at the top N cards of
 * your library. You may reveal any number of cards of the chosen type from among them and put the
 * revealed cards into your hand. Put the rest on the bottom of your library in a random order." Four
 * sentences whose effect spans them (the reveal/take/bottom all key off the SAME chosen type), collapsed
 * up front like the chosen-type draw just above. The type choice itself is resolved deterministically at
 * resolution (applyChosenTypeRevealToHand — the type with the most matches among the revealed cards,
 * mirroring the chosen-type draw's own maximizing-count policy); the parser only needs the fixed reveal
 * count. Whole-string anchored (optional trailing period) so any rider/variant leaves residue → the
 * normal pipeline drops an unmodeled rider to LOW → Arbiter, never a partial.
 */
export function matchChosenTypeRevealToHand(oracle) {
  const m = String(oracle).match(
    /^choose a creature type\. look at the top (\w+) cards of your library\. you may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand\. put the rest on the bottom of your library in a random order\.?\s*/i,
  );
  if (!m) return null;
  const n = NUM_WORD[m[1].toLowerCase()] ?? parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null; // an un-parseable count word → safe FN, never a fabricated amount
  return {
    atom: { op: "chosen-type-reveal-to-hand", amount: n, targetType: null },
    rest: oracle.slice(m[0].length).trim(),
  };
}

/**
 * Parse a card into an EffectProgram, or null.
 *
 * Returns null ONLY when the card is NOT an instant/sorcery with oracle text
 * (a permanent enters via the ETB path; a card with no oracle has nothing to
 * parse). An instant/sorcery WITH text always returns a program: `high` when
 * EVERY clause (or, for modal, every mode) parses to a known atom, `low` (zero
 * atoms → Arbiter seam) otherwise. NEVER null for a non-permanent spell, NEVER a
 * fabricated effect.
 */
// ===== ADDITIONAL COSTS (cast-path, CR 601.2f) =====
// A spell's "As an additional cost to cast this spell, <cost>." sentence is paid AT CAST, not at
// resolution — it is NOT an effect atom. Today the clause parser can't match that sentence, so any such
// card stays LOW (safe). This slice recognizes the single cleanest, highest-yield cost-type — a
// CHOSEN-VICTIM sacrifice ("sacrifice a/an <creature|permanent|artifact|enchantment|land>") — strips the
// cost sentence, parses the REMAINING effect through the normal all-or-nothing pipeline, and attaches
// `additionalCosts` to the program. The cast path enforces it (legalChoices.actionsCastSpell enumerates one
// cast per legal victim + gates the spell uncastable when none can be sacrificed; actionDispatcher.
// applyCastSpell pays it via the γ1b `sacrificePermanentForCost` helper). The sac allowlist MIRRORS
// abilities.parseAbilityCost's `sacOther` regex — we can't import it (abilities.js imports parser.js → a
// cycle), so the discipline is duplicated, not shared. AC-1 extends this to a COUNT-of-N ("sacrifice two
// creatures" / "discard two cards" / "sacrifice five lands") via SAC_COUNT_COST_RE / DISCARD_COUNT_COST_RE
// (SUPPORTED count words two–five, single types only) — the cast path pays EXACTLY N (legalChoices offers a
// policy-picked N-victim set + gates uncastable when fewer than N exist; the dispatcher sacrifices/discards
// each). Still LOW: a compound type ("a creature or artifact" with a count), an "or pay {N}" alternative, or
// "another" (a spell has no source permanent to exclude) doesn't match → the sentence is left in place.
