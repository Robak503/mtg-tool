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
  for (const item of items) {
    if (/^\{t\}$/i.test(item)) { tapSelf = true; continue; }
    // γ1 — two NO-CHOICE non-mana costs the engine pays without a player decision:
    //   "Pay N life"          → deduct N life (the caller checks affordability).
    //   "Sacrifice this[ …]"  → sacrifice the SOURCE permanent (no "which one?" choice).
    const lifeM = /^pay (\d+) life$/i.exec(item);
    if (lifeM) { payLife += parseInt(lifeM[1], 10); continue; }
    if (/^sacrifice (?:this|~)(?: creature| permanent| artifact| enchantment| land)?$/i.test(item)) { sacSelf = true; continue; }
    // γ1b — "Sacrifice a/an/another <type>": a CHOICE cost. The single victim is picked at offer time
    // (legalChoices expands one action per legal sacrificeable permanent of <type>), so the parser only
    // records the shape; "another" excludes the source. A COUNT ("two creatures") or a compound type
    // ("a creature or planeswalker") doesn't match → null (deferred), keeping the all-or-nothing gate.
    const sacOtherM = /^sacrifice (a|an|another) (creature|permanent|artifact|enchantment|land)$/i.exec(item);
    if (sacOtherM) { sacOther = { type: sacOtherM[2].toLowerCase(), another: /^another$/i.test(sacOtherM[1]) }; continue; }
    const pips = [...item.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (pips.length === 0) return null;                          // a wordy item we don't model → unmodeled
    if (item.replace(/\{[^}]+\}/g, "").trim() !== "") return null; // leftover text around the pips → unmodeled
    if (!pips.every(pipIsMana)) return null;                      // {X}/{Q}/{S}/… → unmodeled
    manaPips += pips.map((p) => `{${p.trim().toUpperCase()}}`).join("");
  }
  return { manaPips, tapSelf, payLife, sacSelf, sacOther };
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
 */
export function sacrificeDropsTrigger(oracle) {
  const sentences = String(oracle).match(/(?:^|[\n.;]\s*)(?:When|Whenever|At)\b[^.]*\.?/gi) || [];
  for (const s of sentences) {
    if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(s)) return true;       // a second embedded when-clause
    if (/\bleaves the battlefield\b/i.test(s)) return true;           // LTB — the dies path won't fire it
    if (/\bwhen(?:ever)? you sacrifice\b/i.test(s)) return true;      // a sacrifice trigger
  }
  return false;
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
export function parseActivatedAbilities(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  if (!oracle.trim()) return [];
  const sacUnsafe = sacrificeDropsTrigger(oracle); // card-level: would a self-sac drop a trigger?
  const out = [];
  let index = 0;
  for (const rawLine of oracle.split(/\n+/)) {
    const line = rawLine.trim();
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
      program = parseEffectClause(effectClause, "Instant");
      effectHigh = !!program && programConfidence(program) === "high" && program.structure !== "modal" && !program.xSpell;
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
      costModeled: !!cost,
      isManaEffect,
      program,
      // Playable on the stack: cost is mana+{T}(+pay-life/self-sac), effect is HIGH (non-modal,
      // non-X), it's NOT a mana ability (those use the no-stack tap-for-mana path), AND — for a
      // self-sac cost — sacrificing won't silently drop one of the card's own triggers (γ1 fail-safe).
      modeled: !!cost && !isManaEffect && effectHigh && !(cost.sacSelf && sacUnsafe),
      needsTarget: effectHigh && !!program && programNeedsChosenTarget(program),
    });
  }
  return out;
}
