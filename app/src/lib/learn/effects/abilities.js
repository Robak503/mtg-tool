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
  let payLife = 0;
  let sacSelf = false;
  let sacOther = null;
  let exileSelf = false;
  let removeCounter = null;
  for (const item of items) {
    if (/^\{t\}$/i.test(item)) { tapSelf = true; continue; }
    // γ1 — two NO-CHOICE non-mana costs the engine pays without a player decision:
    //   "Pay N life"          → deduct N life (the caller checks affordability).
    //   "Sacrifice this[ …]"  → sacrifice the SOURCE permanent (no "which one?" choice).
    const lifeM = /^pay (\d+) life$/i.exec(item);
    if (lifeM) { payLife += parseInt(lifeM[1], 10); continue; }
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
    const pips = [...item.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (pips.length === 0) return null;                          // a wordy item we don't model → unmodeled
    if (item.replace(/\{[^}]+\}/g, "").trim() !== "") return null; // leftover text around the pips → unmodeled
    if (!pips.every(pipIsMana)) return null;                      // {X}/{Q}/{S}/… → unmodeled
    manaPips += pips.map((p) => `{${p.trim().toUpperCase()}}`).join("");
  }
  return { manaPips, tapSelf, payLife, sacSelf, sacOther, exileSelf, removeCounter };
}

/** True when an ability's EFFECT is a mana ability ("Add …") — those use the no-stack path. */
function effectIsManaAbility(clause) {
  const c = String(clause).trim();
  return /^add\b/i.test(c) || /\badd\b\s+(\{[wubrgc]|one\b|two\b|three\b|four\b|five\b|that much|an amount|x\b|mana\b)/i.test(c);
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
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const costStr = line.slice(0, ci).trim();
    const effectClause = line.slice(ci + 1).trim();
    if (!costStr || !effectClause) continue;

    const cost = parseAbilityCost(costStr);
    // A real activated ability's cost is either symbol-bearing ({mana}/{T}) or a modeled word-cost
    // (γ1: "Pay N life" / "Sacrifice this"). A colon with neither to its left is flavor/rules text
    // (a level band, a Class line, a keyword-action colon) → skip, so we never mis-detect.
    if (!costStr.includes("{") && !cost) continue;

    const isManaEffect = effectIsManaAbility(effectClause);
    let program = null;
    let effectHigh = false;
    if (cost && !isManaEffect) {
      // CR 201.4: rewrite the card's own name → "this creature" so a self-referential effect
      // ("Regenerate Wolverine.") matches the engine's self-anchored atoms.
      program = parseEffectClause(normalizeSelfName(effectClause, card), "Instant");
      // MODAL-ACTIVATED (CR 602.1 / 700.2 — Koma "Sacrifice another Serpent: Choose one — …"): a "Choose one"
      // modal effect IS playable here. The runtime offers ONE action per mode (legalChoices →
      // expandCastChoices expands mode × target combos, stamping chosenMode) and the dispatcher executes the
      // chosen mode's atoms (applyActivateAbility threads chosenMode → runProgram), exactly like a modal
      // SPELL — so a HIGH modal program is no longer silently dropped. X-modes stay excluded (the activated
      // X-choice expansion isn't wired); a "Choose two/one or more" modal also rides this (expandCastChoices
      // handles the mode-combinations). The all-or-nothing modal HIGH gate (every mode parses) already
      // guarantees no mode is silently un-modeled, so this can't half-resolve.
      effectHigh = !!program && programConfidence(program) === "high" && !program.xSpell;
    }
    out.push({
      index: index++,
      raw: line,
      costStr,
      effectClause,
      manaPips: cost?.manaPips ?? null,
      tapSelf: cost?.tapSelf ?? false,
      payLife: cost?.payLife ?? 0,     // γ1 — "Pay N life" cost item (the runtime deducts it)
      sacSelf: cost?.sacSelf ?? false, // γ1 — "Sacrifice this" cost item (the runtime sacs the source)
      sacOther: cost?.sacOther ?? null, // γ1b — "Sacrifice a/another <type>": legalChoices picks the victim
      exileSelf: cost?.exileSelf ?? false,     // γ1c — "Exile this": exile the source from the battlefield
      removeCounter: cost?.removeCounter ?? null, // γ1c — "Remove a <type> counter from this"
      costModeled: !!cost,
      isManaEffect,
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
