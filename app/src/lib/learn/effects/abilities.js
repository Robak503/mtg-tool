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
  for (const item of items) {
    if (/^\{t\}$/i.test(item)) { tapSelf = true; continue; }
    // γ1 — two NO-CHOICE non-mana costs the engine can pay without a player decision:
    //   "Pay N life"          → deduct N life (the caller checks affordability).
    //   "Sacrifice this[ …]"  → sacrifice the SOURCE permanent (no "which one?" choice).
    // A "Sacrifice a creature" / "Discard a card" (which need a picker) still drop to null —
    // deferred to γ1b — so we never offer a cost we can't pay cleanly.
    const lifeM = /^pay (\d+) life$/i.exec(item);
    if (lifeM) { payLife += parseInt(lifeM[1], 10); continue; }
    if (/^sacrifice (?:this|~)(?: creature| permanent| artifact| enchantment| land)?$/i.test(item)) { sacSelf = true; continue; }
    const pips = [...item.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (pips.length === 0) return null;                          // a wordy item we don't model → unmodeled
    if (item.replace(/\{[^}]+\}/g, "").trim() !== "") return null; // leftover text around the pips → unmodeled
    if (!pips.every(pipIsMana)) return null;                      // {X}/{Q}/{S}/… → unmodeled
    manaPips += pips.map((p) => `{${p.trim().toUpperCase()}}`).join("");
  }
  return { manaPips, tapSelf, payLife, sacSelf };
}

/** True when an ability's EFFECT is a mana ability ("Add …") — those use the no-stack path. */
function effectIsManaAbility(clause) {
  const c = String(clause).trim();
  return /^add\b/i.test(c) || /\badd\b\s+(\{[wubrgc]|one\b|two\b|three\b|four\b|five\b|that much|an amount|x\b|mana\b)/i.test(c);
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
      costModeled: !!cost,
      isManaEffect,
      program,
      // Playable on the stack: cost is mana+{T}, effect is HIGH (non-modal, non-X), and
      // it's NOT a mana ability (those resolve via the no-stack tap-for-mana path).
      modeled: !!cost && !isManaEffect && effectHigh,
      needsTarget: effectHigh && !!program && programNeedsChosenTarget(program),
    });
  }
  return out;
}
