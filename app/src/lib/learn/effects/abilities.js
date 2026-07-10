/**
 * effects/abilities.js — activated-ability detection (Phase-2 P2.9).
 *
 * An activated ability is `[cost]: [effect]` (CR 602.1). This module splits a
 * permanent's oracle text into its activated-ability lines and, for each, parses the
 * COST (the part before the colon) and the EFFECT (the part after). It is the single
 * source of truth both the runtime (`legalChoices.actionsActivateAbility` /
 * `actionDispatcher.applyActivateAbility`) and the coverage metric
 * (`coverage.permanentActivatedCovered`) read, so the two can never drift.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8): an ability is only `modeled` (playable on the
 * stack) when its WHOLE cost reduces to the modeled subset — mana pips + `{T}` — AND
 * its effect parses to a HIGH, non-modal, non-X EffectProgram. Any unmodeled cost item
 * (Sacrifice / Pay N life / Discard / {Q} / {X} / {S} / {E} / …) or unmodeled effect
 * leaves the ability un-offered (never a cost we can't pay, never a fabricated effect).
 * MANA abilities (`{cost}: Add …`) resolve through the existing no-stack tap-for-mana
 * path (CR 605.3a), so they're flagged `isManaEffect` and excluded from the stack path.
 *
 * Leaf-ish: imports only the effect parser. No gameState, no legalChoices (which would
 * cycle), no mana model — the mana COST string is returned raw for the caller's
 * `parseManaCost`, so this stays a pure leaf.
 */

import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./parser.js";

/** Strip reminder text (parens) but PRESERVE newlines so per-ability line splitting works. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/[ \t]+/g, " ");
}

/**
 * Strip a trailing "Activate only as a sorcery" timing restriction (CR 602.5i) from an activated ability's
 * EFFECT clause before it's parsed. The restriction governs WHEN the ability may be activated, never WHAT it
 * does — and the runtime ALREADY enforces sorcery speed for every activated ability (legalChoices.actions-
 * ActivateAbility offers them only at step==="main"), so dropping the sentence can NEVER let the engine play
 * an ability faster than the card allows (THE CREED — a strict, safe simplification, exactly like the
 * cost-only keyword strips). Without this, the trailing sentence is swept into the effect program and drags
 * an otherwise-HIGH effect ("Put two +1/+1 counters on each creature you control. Activate only as a
 * sorcery.") to LOW, silently parking a fully-modelable ability. Both printed forms are handled ("Activate
 * only as a sorcery." and "Activate this ability only as a sorcery."). Single-sourced here so the parser and
 * the coverage metric strip identically.
 */
function stripSorcerySpeedRider(clause) {
  return String(clause || "").replace(/\.?\s*Activate (?:this ability )?only as a sorcery\.?\s*$/i, "").trim();
}

/**
 * Self-name normalization (CR 201.4 — a card referring to itself by name means THIS object). An activated
 * effect like "Regenerate Wolverine." means "Regenerate this permanent" — the engine's effect parser anchors
 * the self-regen / self-pump atoms on "this creature"/"this permanent", so map the card's OWN name (full and
 * the pre-comma short name, e.g. "Wolverine, Best There Is" → "Wolverine") onto "this creature" before
 * parsing. Word-bounded, longest-first, so it only ever rewrites the literal self-name (never a substring of
 * another word). A card with no name, or whose clause doesn't mention it, is returned unchanged.
 */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeSelfName(clause, card) {
  const name = String(card?.name || "").trim();
  if (!name) return clause;
  const forms = [name];
  const short = name.split(",")[0].trim();
  if (short && short !== name) forms.push(short);
  // Longest first so the full name is consumed before the short prefix.
  forms.sort((a, b) => b.length - a.length);
  let out = clause;
  for (const f of forms) {
    out = out.replace(new RegExp(`\\b${escapeRe(f)}\\b`, "g"), "this creature");
  }
  return out;
}

/** A single pip the engine's mana model understands. {X}/{Q}/{S}/{E} are deliberately NOT mana. */
function pipIsMana(pipRaw) {
  const P = String(pipRaw).trim().toUpperCase();
  return /^\d+$/.test(P) ||
    ["W", "U", "B", "R", "G", "C"].includes(P) ||
    /^[WUBRG]\/P$/.test(P) ||           // phyrexian
    /^[WUBRG2]\/[WUBRG]$/.test(P);       // hybrid (incl. {2/C}-style)
}

/**
 * Parse an ability cost (the text before the colon) into `{ manaPips, tapSelf }`, or
 * null when ANY cost item is outside the modeled subset (mana pips + `{T}`). The
 * ALLOWLIST discipline: every comma-separated item must be exactly `{T}` or a run of
 * pure mana pips — a leftover word (Sacrifice/Discard/Pay) or a non-mana symbol
 * ({X}/{Q}/{S}/{E}) drops the whole cost to null, so we never offer an ability whose
 * cost we can't pay.
 */
export function parseAbilityCost(costStr) {
  const items = String(costStr || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  let manaPips = "";
  let tapSelf = false;
  let costX = false;
  let payLife = 0;
  let payEnergy = 0;
  let sacSelf = false;
  let sacOther = null;
  let sacCount = null;
  let sacX = null;
  let exileSelf = false;
  let removeCounter = null;
  let tapCreature = null;
  let returnLand = null;
  for (const item of items) {
    if (/^\{t\}$/i.test(item)) { tapSelf = true; continue; }
    // γ1f — TAP-CREATURE cost (Earthcraft "Tap an untapped creature you control: …"): a CHOICE cost
    // (CR 602.1b — "tap an untapped creature you control" is a cost to tap ANOTHER permanent, distinct
    // from the source's own {T}). The player picks WHICH untapped creature they control to tap (like
    // the sacOther victim pick); the parser only records the shape. legalChoices expands one action per
    // legal untapped creature you control, and the dispatcher taps it (excluding it from the mana
    // sources — a creature tapped for the cost can't also tap for mana). Whole-item anchored ($) so a
    // COUNT ("tap two untapped creatures"), a subtype filter, or an "you control or a land" compound
    // doesn't match → null (deferred), keeping the all-or-nothing gate — a safe false-negative.
    if (/^tap an untapped creature you control$/i.test(item)) { tapCreature = { another: false }; continue; }
    // γ1g — RETURN-A-LAND cost (Oboro Breezecaller "{2}, Return a land you control to its owner's hand:
    // Untap target land."): a CHOICE cost — the player picks WHICH land they control to bounce to its owner's
    // hand (CR 601.2b / 118 — returning a permanent you control to hand as an activation cost). The parser only
    // records the shape; legalChoices expands one action per legal land you control (excluding any that would
    // silently drop its OWN leaves-the-battlefield trigger — the shared bounce/leave fail-safe), and the
    // dispatcher ACTUALLY moves the chosen land battlefield → its owner's hand (CREED — never activate without
    // paying the cost). Whole-item anchored ($) so a COUNT ("return two lands"), a subtype filter ("return a
    // Forest"), or a "to their owner's hand" plural variant doesn't match → deferred, keeping the all-or-nothing
    // gate (a safe false-negative → Arbiter).
    if (/^return a land you control to its owner's hand$/i.test(item)) { returnLand = { another: false }; continue; }
    // γ1 — two NO-CHOICE non-mana costs the engine pays without a player decision:
    //   "Pay N life"          → deduct N life (the caller checks affordability).
    //   "Sacrifice this[ …]"  → sacrifice the SOURCE permanent (no "which one?" choice).
    const lifeM = /^pay (\d+) life$/i.exec(item);
    if (lifeM) { payLife += parseInt(lifeM[1], 10); continue; }
    // γ1e — "Pay {E}…" (energy, CR 122.1e): a NO-CHOICE numeric resource cost, one per {E} pip. legalChoices
    // gates the activation on player.energy >= payEnergy; actionDispatcher deducts it via spendEnergy at activate
    // time (CREED — never activate without paying). The energy GAIN side is modeled (add-energy, Slice A).
    const energyM = /^pay ((?:\{e\})+)$/i.exec(item);
    if (energyM) { payEnergy += (energyM[1].match(/\{e\}/gi) || []).length; continue; }
    if (/^sacrifice (?:this|~)(?: creature| permanent| artifact| enchantment| land)?$/i.test(item)) { sacSelf = true; continue; }
    // γ1c — two more NO-CHOICE self costs:
    //   "Exile this[ <type>]"            → exile the SOURCE from the battlefield (NOT "dies"; no dies
    //                                      triggers). The `$` anchor excludes "Exile this card from your
    //                                      graveyard" (a graveyard ability) and "…from exile" variants.
    //   "Remove a <type> counter from this" → remove one counter of <type> from the SOURCE (no choice).
    if (/^exile (?:this|~)(?: creature| permanent| artifact| enchantment| land)?$/i.test(item)) { exileSelf = true; continue; }
    // The item MUST END after the optional permanent-type noun ($) — like the exileSelf allowlist — so a
    // COMPOUND cost ("Remove a quest counter from this enchantment AND SACRIFICE IT") doesn't match the
    // prefix and silently drop its trailing cost (a partial-payment false-positive); it routes to the Arbiter.
    const rcM = /^remove (?:a|an|one) ([+\-\w/]+) counter from (?:this|~|it)(?: creature| permanent| artifact| enchantment| land)?$/i.exec(item);
    // Keep "+1/+1" / "-1/-1" verbatim (the counter-model keys); lowercase named types (charge, fade…).
    if (rcM) { removeCounter = { type: /^[+-]\d/.test(rcM[1]) ? rcM[1] : rcM[1].toLowerCase() }; continue; }
    // γ1b — "Sacrifice a/an/another <type>": a CHOICE cost. The single victim is picked at offer time
    // (legalChoices expands one action per legal sacrificeable permanent of <type>), so the parser only
    // records the shape; "another" excludes the source. A COUNT ("two creatures") or a compound type
    // ("a creature or planeswalker") doesn't match → null (deferred), keeping the all-or-nothing gate.
    const sacOtherM = /^sacrifice (a|an|another) (creature|permanent|artifact|enchantment|land)$/i.exec(item);
    if (sacOtherM) { sacOther = { type: sacOtherM[2].toLowerCase(), another: /^another$/i.test(sacOtherM[1]) }; continue; }
    // γ1b-SUBTYPE — "Sacrifice a/an/another <Subtype>" (Koma "Sacrifice another Serpent"; Goblin Sledder
    // "Sacrifice a Goblin"; Strands of Night "Sacrifice a Swamp"; Wand of the Elements "Sacrifice an Island"):
    // a CHOICE cost scoped to a SUBTYPE rather than a base card type. The victim is any PERMANENT you control
    // whose type line carries that subtype — so it works uniformly for a CREATURE subtype (Goblin/Serpent), a
    // LAND subtype (Swamp/Island — those sac a LAND, never a creature, so scoping to "creature" would make the
    // cost unpayable yet still count native: a CREED metric over-claim), or an artifact subtype. type:"permanent"
    // + the subtype filter is exactly CR-correct (CR 701.16 — sacrifice a permanent you control matching the
    // description); legalChoices' sacTypeMatches narrows on the subtype and the leave-trigger fail-safe still
    // applies. Gated to a SINGLE Capitalized word (a real subtype is one capitalized token on the type line)
    // NOT a base card type (those are the case-insensitive branch above) — so a lowercase noun or a compound
    // phrase ("a creature or planeswalker") never matches → null (deferred), preserving the all-or-nothing gate.
    const sacSubM = /^[Ss]acrifice (a|an|another) ([A-Z][a-z]+)$/.exec(item);
    if (sacSubM) { sacOther = { type: "permanent", subtype: sacSubM[2].toLowerCase(), another: /^another$/i.test(sacSubM[1]) }; continue; }
    // γ1d — SAC-N-SUBTYPE: "Sacrifice <N> <Subtype>s" (a COUNT ≥ 2 of a FUNGIBLE value-TOKEN subtype —
    // "Sacrifice three Treasures" / "Sacrifice two Foods", Ruthless Knave / Savvy Hunter / Olivia / Magda).
    // Scoped DELIBERATELY to the fungible value-token subtypes (Treasure/Clue/Food/Gold/Blood/Map/Powerstone/
    // Incubator) — those are interchangeable tokens, so paying N of them is a NO-DECISION cost (any N satisfy
    // it identically, CR 701.16); the runtime auto-picks N matching permanents. A COUNT-sac of a DISTINGUISHABLE
    // class ("two artifacts", "two creatures", "two other artifacts and/or creatures") is a REAL choice (which
    // value permanents to give up) the auto-pick can't make faithfully — those stay UNMODELED → Arbiter (a safe
    // false-negative, never a mis-paid cost). type:"permanent" + the subtype filter reuses sacTypeMatches exactly
    // like the single-subtype branch; count is the parsed integer the legalChoices victim-gather and the
    // dispatcher payment both read. Word-numbers two–five and digits 2–5 only (a higher fixed count is rare and
    // still routes to the Arbiter). Singular/plural tolerated on the subtype noun ("Foods"/"Food").
    const sacNM = /^[Ss]acrifice (two|three|four|five|2|3|4|5) ([A-Z][a-z]+?)s?$/.exec(item);
    if (sacNM) {
      const FUNGIBLE = new Set(["treasure", "clue", "food", "gold", "blood", "map", "powerstone", "incubator"]);
      const sub = sacNM[2].toLowerCase();
      if (FUNGIBLE.has(sub)) {
        const words = { two: 2, three: 3, four: 4, five: 5 };
        sacCount = { type: "permanent", subtype: sub, count: words[sacNM[1]] ?? parseInt(sacNM[1], 10) };
        continue;
      }
      return null; // a fixed-count sac of a non-fungible/unknown subtype → unmodeled (deferred)
    }
    // γ1e — SAC-X-SUBTYPE: "Sacrifice X <Subtype>" (a VARIABLE count the PLAYER chooses at activation — "Sacrifice
    // X Treasures", Grim Hireling). Scoped to the SAME fungible value-token subtypes as γ1d (Treasure/Clue/Food/…):
    // those tokens are interchangeable, so paying X of them is a NO-DECISION cost given a chosen X (any X satisfy it
    // identically, CR 701.16); the runtime offers one action per affordable X (1..available) and auto-picks X victims.
    // The X threads into the ability's EFFECT (Grim Hireling's "-X/-X" reads the SAME X the player paid), so the
    // caller (parseActivatedAbilities) parses the effect with hasX:true and REQUIRES an X-scaled (amountX) atom —
    // an effect that doesn't consume X would leave the sac-X choice with no payoff (a broken half-model). A sac-X of
    // a DISTINGUISHABLE / non-fungible class ("Sacrifice X creatures/lands/artifacts", Eliminate the Competition /
    // Krav / Champion of Stray Souls) is a REAL choice the auto-pick can't make faithfully → null (deferred, a safe
    // false-negative). Singular/plural tolerated on the subtype noun; ONE capitalized subtype word only.
    const sacXM = /^[Ss]acrifice X ([A-Z][a-z]+?)s?$/.exec(item);
    if (sacXM) {
      const FUNGIBLE = new Set(["treasure", "clue", "food", "gold", "blood", "map", "powerstone", "incubator"]);
      const sub = sacXM[1].toLowerCase();
      if (FUNGIBLE.has(sub)) { sacX = { type: "permanent", subtype: sub }; continue; }
      return null; // a variable-count sac of a non-fungible/unknown subtype → unmodeled (deferred)
    }
    // γ1f — ACTIVATED-{X} (Candelabra of Tawnos "{X}, {T}: Untap X target lands."): a lone `{X}` cost item is a
    // GENERIC-X mana cost the player picks at activation (CR 601.2b/107.3). It threads into `manaPips` verbatim
    // (parseManaCost sets hasX/xCount++), and legalChoices' actionsActivateAbility now enumerates one action per
    // affordable X (like the cast path's X-spell branch). Gated to a STANDALONE `{X}` item ONLY — a mixed pip
    // ("{2}{X}") or a second `{X}` ({X}{X} — a double-X activated cost, none in the corpus) is rare and NOT split
    // into its own item, so it falls through to the multi-pip run below where `pipIsMana("X")` is false → null
    // (deferred, a safe false-negative). Recording costX lets parseActivatedAbilities require an X-scaled effect.
    if (/^\{x\}$/i.test(item)) { costX = true; manaPips += "{X}"; continue; }
    const pips = [...item.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (pips.length === 0) return null;                          // a wordy item we don't model → unmodeled
    if (item.replace(/\{[^}]+\}/g, "").trim() !== "") return null; // leftover text around the pips → unmodeled
    if (!pips.every(pipIsMana)) return null;                      // {X}/{Q}/{S}/… → unmodeled
    manaPips += pips.map((p) => `{${p.trim().toUpperCase()}}`).join("");
  }
  return { manaPips, tapSelf, payLife, payEnergy, sacSelf, sacOther, sacCount, sacX, exileSelf, removeCounter, tapCreature, returnLand, costX };
}

/** True when an ability's EFFECT is a mana ability ("Add …") — those use the no-stack path. */
function effectIsManaAbility(clause) {
  const c = String(clause).trim();
  return /^add\b/i.test(c) || /\badd\b\s+(\{[wubrgc]|one\b|two\b|three\b|four\b|five\b|that much|an amount|x\b|mana\b)/i.test(c);
}

/**
 * DOUBLE-MANA-POOL (Doubling Cube — "Double the amount of each type of unspent mana you have.").
 * This is a MANA ability (CR 605.1a — an activated ability with no target that could put mana into its
 * controller's pool), so it resolves without using the stack (CR 605.3a), exactly like a tap-for-mana
 * ability — NOT through the stack effect-program interpreter. `effectIsManaAbility` above keys on "Add …"
 * and misses this doubling wording, so we flag it here as a distinct mana-effect kind. The runtime
 * (legalChoices.actionsDoubleManaPool → actionDispatcher.applyDoubleManaPool) doubles every color in the
 * activating player's pool. Gated to the EXACT printed shape — a doubling of "each type of unspent mana
 * you have" — so it matches ONLY Doubling Cube's effect (audited corpus-wide: the sole card with this
 * wording); any other doubling clause (a static mana-doubler like Mana Reflection, worded as a replacement
 * effect, never as "{cost}: Double …") never reaches this matcher. Tolerates the "each type of" phrasing
 * only (the printed Oracle) — a variant that doubled a SUBSET, added a cap, or drained life would not
 * match and would stay unmodeled → Arbiter (a safe false-negative, never a partial application — THE CREED).
 */
function effectIsDoubleManaPool(clause) {
  return /^double the amount of each type of unspent mana you have\.?$/i.test(String(clause).trim());
}

/**
 * γ1 fail-safe — would sacrificing this permanent as a COST silently drop one of its OWN triggers?
 * The self-sac path fires only creature "dies" triggers (checkDiesTriggers); a "leaves the battlefield"
 * / "when you sacrifice this" trigger, or a COMPOUND condition the detector under-splits ("…enters AND
 * when you sacrifice it", "…enters OR leaves the battlefield"), would NOT be put on the stack — a silent
 * partial application. When true, the card's self-sac ability stays UNMODELED so the WHOLE card routes
 * to the Arbiter instead (CLAUDE.md §1.2 — a false-negative is safe; a partial application is forbidden).
 * "X or another creature dies" is NOT flagged: that's one event (all-creature scope), fired by the dies
 * path — only a second WHEN-clause or a distinct leave/sacrifice verb trips this.
 *
 * CR 700.4 dies-EQUIVALENT wording ("is put into a graveyard from the battlefield") and the exile/zone
 * LTB variants ("put into exile from the battlefield") ALSO trip this: the dies detector keys on the
 * literal word "dies", so checkDiesTriggers never fires for that wording — without this guard a victim
 * worded that way (Brood of Cockroaches, the God-Eternal cycle…) would have its death trigger silently
 * dropped on sacrifice. Conservative by design — route the whole card to the Arbiter.
 */
export function sacrificeDropsTrigger(oracle) {
  // Match each trigger CLAUSE wherever it starts — not anchored to the start of a line/sentence — so an
  // ability-word prefix ("Praesidium Protectiva — When this creature is put into your graveyard…") or
  // reminder text "(When a creature is put into your graveyard from the battlefield…)" is still seen.
  // Callers pass the RAW oracle (reminder included) so death-keyword reminders (Recover…) are caught.
  const clauses = String(oracle).match(/(?:When|Whenever|At)\b[^.]*/gi) || [];
  for (const s of clauses) {
    if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(s)) return true;       // a second embedded when-clause
    if (/\bleaves the battlefield\b/i.test(s)) return true;           // LTB — the dies path won't fire it
    if (/\bwhen(?:ever)? you sacrifice\b/i.test(s)) return true;      // a sacrifice trigger
    if (/\bput into\b[^.]*\bfrom the battlefield\b/i.test(s)) return true; // CR 700.4 dies-equiv / zone-LTB the detector misses
  }
  return false;
}

/**
 * KW-CYCLING (CR 702.29a): the card's plain, FULLY-MODELED cycling cost — "Cycling {2}" → "{2}",
 * "Cycling {3}{R}" → "{3}{R}". Returns null when the card has no plain cycling, OR when it carries a
 * cycle/discard TRIGGER ("when you cycle this card" / "whenever you cycle or discard") — that trigger
 * is unmodeled (the trigger-compiler lane), so we must NOT offer a native cycle that would silently
 * drop it (THE CREED). TYPEcycling (Plainscycling/Landcycling, CR 702.29e) is excluded by the
 * line-start anchor — its library search needs the tutor atom, so it routes to the Arbiter until covered.
 */
export function parseCyclingCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // ANY "When/Whenever … cycle[d]" trigger within a single clause (until the period) is an unmodeled
  // cycle trigger — gate the whole card. BROAD on purpose (a false-negative is safe): catches the
  // bare "When you cycle this card …" AND the split form "When you cast OR cycle ~, create a token …"
  // (Warped Tusker / Drownyard Lurker) + "Whenever you cycle or discard …" (Curator of Mysteries).
  if (/\b(?:when|whenever)\b[^.]*\bcycle/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*cycling\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * LIFE-COST CYCLING (Street Wraith — "Cycling—Pay 2 life.", SHELF S7): the cycling cost is a LIFE
 * payment instead of mana. Returns the integer life cost, or null. Same cycle-trigger gate as the
 * mana form (an unmodeled cycle trigger parks the whole card). Paying life IS losing life
 * (CR 118.8), so the dispatcher routes it through loseLife — life-loss watchers fire, as printed.
 */
export function parseCyclingLifeCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (/\b(?:when|whenever)\b[^.]*\bcycle/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*cycling\s*[—–-]\s*pay (\d+) life\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * PLOT (CR 702.171) — "Plot {cost}" is a special action: any time you could cast a sorcery you may pay
 * the plot cost and exile the card face-up from your hand ("plotted"); on a LATER turn you may cast it
 * from exile WITHOUT paying its mana cost (CR 702.171b). Returns the plot mana-cost STRING the caller
 * feeds to parseManaCost, or null when plot isn't a clean modeled action for this card.
 *
 * GATES (a false-negative is SAFE; a fabricated/partial plot is FORBIDDEN — CLAUDE.md §1.2):
 *   • Only a printed "Plot {cost}" line (line-anchored, mana-only cost). A non-mana plot cost would
 *     match nothing → null.
 *   • A "when/whenever … plot" TRIGGER (e.g. a future "whenever you plot a card" watcher) is unmodeled
 *     → gate the whole card to null, exactly like the cycling-trigger gate. BROAD on purpose.
 *   • A card that GRANTS plot to OTHER cards ("… has plot", "you may plot … from the top of your
 *     library" — Fblthp, Lost on the Range) is NOT a self-plot card: its "plot" mentions never begin a
 *     line as "Plot {cost}", so the cost regex doesn't match → null. (Its unmodeled granting body also
 *     keeps it non-native, so it's never offered — defense in depth.)
 */
export function parsePlotCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // Any "When/Whenever … plot" trigger within a clause is an unmodeled plot trigger — gate the card.
  if (/\b(?:when|whenever)\b[^.]*\bplot/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*plot\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * WARP (CR 702.176, Edge of Eternities) — "Warp {cost}" is an ALTERNATIVE cast cost from hand: you may cast
 * the card for its warp cost, then exile it at the beginning of the next end step, and may cast it from exile
 * on a later turn. It changes ONLY how/when the card is cast — never WHAT the card does on resolution or what
 * the permanent's printed abilities are. Every card carrying Warp ALSO has a normal printed mana cost, so the
 * engine hard-casts it at full price and resolves its body 100% CORRECTLY; the only unmodeled part is the
 * optional cheaper/temporary cast, which can NEVER mis-resolve / mis-count / drop a payoff clause / fabricate
 * (THE CREED — the SAME safe trade the Plot/Convoke/Spectacle cost gates make). A hard-cast permanent simply
 * stays on the battlefield exactly as printed (the "exile at end step" rider only applies to a WARP cast,
 * which the engine never offers), so crediting its body is faithful to what the runtime actually plays.
 *
 * Returns the warp mana-cost STRING, or null when warp isn't a clean modeled alternative for this card.
 * GATES (a false-negative is SAFE; a fabricated/partial credit is FORBIDDEN — CLAUDE.md §1.2), mirroring
 * parsePlotCost: only a printed "Warp {cost}" LINE (line-anchored, mana-only cost), and any "when/whenever …
 * warp" TRIGGER (a future "whenever you cast a spell for its warp cost" watcher) gates the whole card to null.
 */
export function parseWarpCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // Any "When/Whenever … warp" trigger within a clause is an unmodeled warp trigger — gate the card.
  if (/\b(?:when|whenever)\b[^.]*\bwarp/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*warp\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * All activated-ability lines on a permanent, as serializable descriptors. Each entry:
 *   { index, raw, costStr, effectClause, manaPips, tapSelf, costModeled, isManaEffect,
 *     program, modeled, needsTarget }
 *
 * A line counts as an activated ability only when the cost (left of the first colon)
 * contains a `{…}` symbol — this excludes flavor/rules colons and pure word-costs we
 * don't model (those stay in the coverage gap rather than being mis-detected). `modeled`
 * is the gate the runtime offers on; the coverage metric reads the full list.
 */
/**
 * MODAL-ACTIVATED line-join (CR 602.1 / 700.2): a "Choose one —" modal activated ability prints each mode on
 * its OWN bullet line ("Sacrifice another Serpent: Choose one —\n• Tap target permanent. …\n• Koma gains …" —
 * Koma). Fold a continuation line that starts with a bullet "•" back onto the preceding line, so the ability's
 * full modal effect ("Choose one — • … • …") is ONE line: the parser sees the whole modal effect, and the
 * coverage residue strips (permanentActivatedCovered / permanentFullyCovered) drop the whole ability as one
 * activated-ability line instead of leaving the mode bullets as apparent residue. Only a LEADING-bullet line
 * is folded (a real new ability / keyword / trigger line never starts with "•"), so this can't merge two
 * distinct abilities — strictly a promotion for the split modal layout. SINGLE SOURCE OF TRUTH for both the
 * parser and the coverage metric, so they can't drift. Input is the (reminder-stripped) oracle; returns the
 * trimmed, folded, non-empty lines.
 */
export function foldModalBulletLines(oracle) {
  const rawLines = String(oracle || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const lines = [];
  for (const l of rawLines) {
    if (/^•/.test(l) && lines.length) lines[lines.length - 1] += ` ${l}`;
    else lines.push(l);
  }
  return lines;
}

export function parseActivatedAbilities(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  if (!oracle.trim()) return [];
  // Card-level: would a self-sac drop a trigger? Use the RAW oracle (reminder included) so a death
  // keyword whose trigger lives in reminder text (Recover…) is caught, matching the victim path.
  const sacUnsafe = sacrificeDropsTrigger(card?.oracle || card?.oracle_text || "");
  const out = [];
  let index = 0;
  for (const line of foldModalBulletLines(oracle)) {
    if (!line) continue;
    // "Equip {cost}" — the attach activated ability (CR 702.6); no colon, the cost is mana
    // and the effect is to attach to a creature you control (the ATTACH resolver, not an
    // effect program). Sorcery-speed only. A non-mana / typed equip cost ("Equip — Sacrifice
    // …", "Equip legendary creature {2}") doesn't match → unmodeled (body-only).
    const em = !line.includes(":") && line.match(/^equip\b\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (em) {
      const cost = parseAbilityCost(em[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
      });
      continue;
    }
    // "Equip [quality] {cost}" — a RESTRICTED equip variant (CR 702.6c). Identical to a plain Equip EXCEPT its
    // legal targets are narrowed to a creature you control that HAS the stated quality (legalChoices enforces it
    // via `equipQuality`). Two qualities are modeled — the ones the runtime can evaluate from state:
    //   "commander" → isCommander travels the card (CR 903.3);
    //   "legendary creature" → the target's type line is Legendary (Excalibur, Sword of Eden — Cap America deck).
    // Any OTHER quality ("Equip Human {1}") is deliberately NOT matched here → body-only (whole-card CREED).
    const ecm = !line.includes(":") && line.match(/^equip\s+commander\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (ecm) {
      const cost = parseAbilityCost(ecm[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
        equipQuality: "commander",
      });
      continue;
    }
    const elm = !line.includes(":") && line.match(/^equip\s+legendary\s+creature\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (elm) {
      const cost = parseAbilityCost(elm[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
        equipQuality: "legendary",
      });
      continue;
    }
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    // QUOTED-GRANT GUARD (CR 113.7) — a GROUP-GRANT / attached static grants a quoted ability to OTHER
    // permanents ("Treasures you control have \"{T}, Sacrifice this artifact: Add two mana of any one
    // color.\"" — Goldspan Dragon; "Sliver creatures you control have \"{T}: Add …\"" — Manaweft). The
    // ability's colon sits INSIDE the quotes, so the naive first-colon split mis-reads the whole grant line
    // as THIS card's own activated ability with an unparseable cost ("Treasures you control have \"{T}, …")
    // → modeled:false → a false residue that fails permanentFullyCovered's every-modeled gate on a MIXED
    // (trigger + group-grant) card. The grant is a STATIC (staticAbilityParser owns it), never the card's own
    // activated ability. Detect it by odd double-quote parity before the split colon (the colon is inside an
    // open quote) → skip the line. A normal activated ability has no quote before its cost colon (parity 0),
    // so this is inert for every printed ability. Straight " and curly “/” both count.
    const preColonQuotes = (line.slice(0, ci).match(/["“”]/g) || []).length;
    if (preColonQuotes % 2 === 1) continue;   // colon inside a quoted granted ability → a static grant, not our own
    const costStr = line.slice(0, ci).trim();
    // Strip a trailing "Activate only as a sorcery" timing rider (CR 602.5i) — a WHEN restriction the runtime
    // already enforces (activated abilities are offered only at main / sorcery speed), never a WHAT, so the
    // effect parses on its real payload instead of being dragged LOW by the trailing sentence.
    const effectClause = stripSorcerySpeedRider(line.slice(ci + 1).trim());
    if (!costStr || !effectClause) continue;

    const cost = parseAbilityCost(costStr);
    // A real activated ability's cost is either symbol-bearing ({mana}/{T}) or a modeled word-cost
    // (γ1: "Pay N life" / "Sacrifice this"). A colon with neither to its left is flavor/rules text
    // (a level band, a Class line, a keyword-action colon) → skip, so we never mis-detect.
    if (!costStr.includes("{") && !cost) continue;

    // DOUBLE-MANA-POOL (Doubling Cube): a mana ability (CR 605.1a) with the doubling wording rather than
    // "Add …" — flag it as a mana effect (routes off the stack path, via actionsDoubleManaPool) and carry
    // a `doubleManaPool` marker the runtime enumerator/dispatcher key on. `isManaEffect` true ⇒ no stack
    // program is parsed and `modeled` stays false (like every mana ability), so it's never offered as a
    // stack `activate-ability`.
    const doubleManaPool = effectIsDoubleManaPool(effectClause);
    const isManaEffect = effectIsManaAbility(effectClause) || doubleManaPool;
    // γ1e — a "Sacrifice X <fungible subtype>" cost makes the ability's X a PLAYER CHOICE that threads into the
    // EFFECT (Grim Hireling: "-X/-X" scales by the X Treasures paid). Parse the effect with hasX:true so an
    // amount-X atom binds to ctx.xValue, and REQUIRE the effect to be an X-scaled program (see the effectHigh
    // gate below) — a sac-X whose effect DOESN'T consume X would leave the paid X with no payoff (a half-model,
    // CREED). Every other cost keeps hasX:false (the prior behavior — no {X} in an activated cost otherwise).
    const sacX = cost?.sacX ?? null;
    // γ1f — ACTIVATED-{X} (Candelabra of Tawnos "{X}, {T}: Untap X target lands."): a lone `{X}` mana cost item
    // makes the ability's X a PLAYER CHOICE bound at activation. Like sacX, the effect MUST be X-scaled — the
    // paid X must be consumed (here: the TARGET COUNT = X, a targetCountX atom); a fixed effect under a mana-{X}
    // cost would leave the X with no payoff (a half-model). Parse with hasX:true and require an xSpell program.
    const costX = cost?.costX ?? false;
    let program = null;
    let effectHigh = false;
    if (cost && !isManaEffect) {
      // CR 201.4: rewrite the card's own name → "this creature" so a self-referential effect
      // ("Regenerate Wolverine.") matches the engine's self-anchored atoms.
      program = parseEffectClause(normalizeSelfName(effectClause, card), "Instant", { hasX: !!sacX || costX });
      // γ1f — the ONLY X-payoff the activated-{X} RUNTIME wires (legalChoices.actionsActivateAbility) is a
      // TARGET-COUNT = X set (a targetCountX atom, expanded per-X). An {X}-cost ability whose effect scales X some
      // OTHER way (an amountX magnitude — "{X}: deal X damage") parses xSpell:true but has NO runtime path here,
      // so gating it modeled would over-claim native for a card the engine can't offer. Require a targetCountX
      // atom so classify (metric) and the runtime stay in lock-step; every other {X} activated effect stays parked
      // (a safe false-negative → Arbiter) until its runtime lane is built.
      const costXTargetCount = !!program && (program.atoms || []).some((a) => a.targetCountX);
      // MODAL-ACTIVATED (CR 602.1 / 700.2 — Koma "Sacrifice another Serpent: Choose one — …"): a "Choose one"
      // modal effect IS playable here. The runtime offers ONE action per mode (legalChoices →
      // expandCastChoices expands mode × target combos, stamping chosenMode) and the dispatcher executes the
      // chosen mode's atoms (applyActivateAbility threads chosenMode → runProgram), exactly like a modal
      // SPELL — so a HIGH modal program is no longer silently dropped. X-modes stay excluded (the activated
      // X-choice expansion isn't wired); a "Choose two/one or more" modal also rides this (expandCastChoices
      // handles the mode-combinations). The all-or-nothing modal HIGH gate (every mode parses) already
      // guarantees no mode is silently un-modeled, so this can't half-resolve.
      // sacX (γ1e): the effect must be ANY X-scaled program (xSpell — Grim Hireling's amountX "-X/-X" is wired by
      // the sacX runtime path). costX (γ1f): NARROWER — only a targetCountX program (the sole wired runtime lane).
      // Both require HIGH + non-modal (the activated X-choice × modal-mode cross-expansion isn't wired). Every
      // non-X ability keeps the original gate: HIGH, non-modal, non-X (a stray {X} effect under a non-X cost stays
      // parked). A mis-model (X paid, nothing consumes it) is a forbidden half-model — the gate forbids it.
      effectHigh = sacX
        ? (!!program && programConfidence(program) === "high" && !!program.xSpell && !program.modal)
        : costX
          ? (!!program && programConfidence(program) === "high" && costXTargetCount && !program.modal)
          : (!!program && programConfidence(program) === "high" && !program.xSpell);
    }
    out.push({
      index: index++,
      raw: line,
      costStr,
      effectClause,
      manaPips: cost?.manaPips ?? null,
      tapSelf: cost?.tapSelf ?? false,
      payLife: cost?.payLife ?? 0,     // γ1 — "Pay N life" cost item (the runtime deducts it)
      payEnergy: cost?.payEnergy ?? 0, // γ1e — "Pay {E}…" energy cost (legalChoices gates on player.energy; dispatcher spends it)
      sacSelf: cost?.sacSelf ?? false, // γ1 — "Sacrifice this" cost item (the runtime sacs the source)
      sacOther: cost?.sacOther ?? null, // γ1b — "Sacrifice a/another <type>": legalChoices picks the victim
      sacCount: cost?.sacCount ?? null, // γ1d — "Sacrifice N <fungible subtype>": legalChoices auto-picks N victims
      sacX,                             // γ1e — "Sacrifice X <fungible subtype>": player chooses X, X threads to the effect
      costX,                            // γ1f — "{X}" mana cost item: player chooses X, X = the effect's target count
      exileSelf: cost?.exileSelf ?? false,     // γ1c — "Exile this": exile the source from the battlefield
      removeCounter: cost?.removeCounter ?? null, // γ1c — "Remove a <type> counter from this"
      tapCreature: cost?.tapCreature ?? null,  // γ1f — "Tap an untapped creature you control": legalChoices picks the creature
      returnLand: cost?.returnLand ?? null,    // γ1g — "Return a land you control to its owner's hand": legalChoices picks the land, dispatcher bounces it
      costModeled: !!cost,
      isManaEffect,
      doubleManaPool, // DOUBLE-MANA-POOL (Doubling Cube) — the runtime doubles the activator's pool (no stack)
      program,
      // Playable on the stack: cost is mana+{T}(+pay-life/self-sac/exile/remove-counter), effect is HIGH
      // (non-modal, non-X), NOT a mana ability (no-stack path), AND — for a cost that can make the source
      // LEAVE the battlefield (self-sac, self-exile, OR a remove-counter that can be LETHAL: a +1/+1
      // removal drops derived toughness, so the source dies) — leaving won't silently drop one of the
      // card's own triggers (the shared γ1 fail-safe; a normal "When this dies" still fires via the dies
      // path, so it's not flagged and not over-restricted).
      modeled: !!cost && !isManaEffect && effectHigh && !((cost.sacSelf || cost.exileSelf || cost.removeCounter) && sacUnsafe),
      needsTarget: effectHigh && !!program && programNeedsChosenTarget(program),
    });
  }
  return out;
}

// Host = the enchanted/equipped CREATURE (Aura/Equipment) OR an enchanted LAND (a land-enchanting Aura that
// grants the land an activated ability — Squirrel Nest "Enchanted land has \"{T}: Create a 1/1 …\"", Caustic
// Tar, Barbed Field). The quoted body is parsed identically; the caller enumerates it on the host permanent
// (a land taps for its {T} cost with no summoning-sickness gate). A land-MANA grant ("{T}: Add …") is the
// phase-1a path and is filtered out by isManaEffect below, so this never double-counts a mana land-aura.
const GRANTED_ACTIVATED_LINE = /^(?:enchanted|equipped) (?:creature|land)\s+(?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/i;

/**
 * GRANTED activated abilities (subsystem 1 phase 1b) — an Aura/Equipment that grants the enchanted/equipped
 * CREATURE an activated ability: "Enchanted creature has \"{T}: This creature deals 1 damage to any
 * target.\"" (Hermetic Study), "\"{B}: This creature gets +1/+1 until end of turn.\"" (Midnight Covenant),
 * "Equipped creature has \"{T}: This creature deals 2 damage to any target.\"" (Bow of the Hunter). The
 * QUOTED ability text is parsed through the SAME parseActivatedAbilities path, so its cost / effect /
 * `modeled` flag / target shape are identical to a printed ability — the runtime + coverage can't drift.
 *
 * The descriptors are enumerated by the caller ON THE HOST permanent (legalChoices), so "this creature"
 * / "you" in the granted effect bind to the host / its controller at resolution (sourceId = host). A
 * granted MANA ability (phase 1a, the tap-for-mana path) and a granted TRIGGERED ability (a different
 * runtime — phase 1c) are NOT returned here. Pure; card-based (no state). Returns [] for a non-grant card.
 */
export function parseGrantedActivatedAbilities(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  if (!oracle.trim()) return [];
  const out = [];
  for (const rawLine of oracle.split(/\n+/)) {
    const m = rawLine.trim().match(GRANTED_ACTIVATED_LINE);
    if (!m) continue;
    const quoted = m[1].trim();
    if (/^(?:when|whenever|at the beginning)/i.test(quoted)) continue;   // granted TRIGGERED ability → phase 1c
    for (const ab of parseActivatedAbilities({ name: "Granted", type: "Creature", oracle: quoted })) {
      if (ab.isManaEffect) continue;                                     // granted MANA ability → phase 1a path
      out.push({ ...ab, granted: true, index: 1000 + out.length });
    }
  }
  return out;
}

/**
 * GROUP-GRANT (CR 113.7) — whether a quoted group-grant body ("{2}: Regenerate this permanent.", "{2},
 * Sacrifice this permanent: Draw a card.") is a FULLY-MODELED, non-mana ACTIVATED ability. The single CREED
 * gate staticAbilityParser registers its group-activated emission with (registerGroupActivatedBodyValidator)
 * AND that legalChoices filters the runtime enumeration on — single-sourced here, over the SAME
 * parseActivatedAbilities a printed ability uses, so classification and runtime can't drift. A targeted/
 * X-scaling/otherwise-unmodeled body returns false → no grant emitted, none offered (a safe FN → Arbiter).
 */
export function isModeledGroupActivatedBody(quoted) {
  const abs = parseActivatedAbilities({ name: "GroupGranted", type: "Creature", oracle: String(quoted || "") });
  return abs.length > 0 && abs.every((a) => a.modeled && !a.isManaEffect);
}
