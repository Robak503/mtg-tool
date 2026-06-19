/**
 * protection.js — KW-PROTECTION enforcement (CR 702.16), quality = COLOR.
 *
 * "Protection from [quality]" is DEBT: the permanent can't be Damaged by / Enchanted-or-Equipped by /
 * Blocked by / Targeted by a source with the quality. PR1 enforces the two sub-rules that reuse seams
 * already built, for the common quality (a color):
 *   - DAMAGE (702.16e): damage from a source of the stated color is PREVENTED → 0 dealt.
 *   - BLOCK  (702.16f): an ATTACKING creature with protection from a color can't be blocked by a
 *                       creature of that color.
 * TARGET (702.16b — needs the spell/ability's color threaded into the targeting check) and
 * ENCHANT/EQUIP (702.16c/d — Aura/Equipment attach + the SBA) are deferred to PR2 (safe false-negatives —
 * protection stays a PARTIAL interim-FP there, never mis-resolved). Non-color qualities (artifacts,
 * creatures, "everything", a card name, the chosen color) are NOT parsed here → unenforced, also safe.
 *
 * Protection is already claimed in COVERED_KEYWORDS (a silent no-op until now); this is pure enforcement,
 * so there's no coverage.js change — the metric is unchanged but now honest for the colors it covers.
 *
 * Pure: regex + a Set intersection. The colors are read from PRINTED text (parseProtectionColors on the
 * card) — GRANTED protection ("gains protection from red") is PR2.
 */

const COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const ALL_COLORS = ["W", "U", "B", "R", "G"];

/**
 * The set of colors a card has "protection from [color]" against, uppercase ({W,U,B,R,G}).
 * Parses "protection from <color>", "protection from <A> and from <B>" (CR 702.16g), and
 * "protection from all colors" / "each color" (→ all five). Any non-color quality yields nothing for
 * that clause (it stays unenforced — a safe false-negative). Returns an empty Set when there's none.
 */
export function parseProtectionColors(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const set = new Set();
  // Capture the quality phrase up to a sentence/clause boundary — stop at a comma so "protection from
  // red, flying" reads only "red"; stop at "(" so reminder text is excluded.
  for (const m of oracle.matchAll(/protection from ([^.;,()\n]+)/gi)) {
    // Only a STATIC, UNCONDITIONAL self-protection is honored — the engine doesn't evaluate conditions
    // or track temporary grants, so reading those unconditionally would forbid a legal target / prevent
    // damage it shouldn't (a CREED false positive). Skip:
    //  - GRANTED ("gains protection from …", until end of turn — not a property this creature has);
    //  - CONDITIONAL ("… protection from X as long as <metalcraft/threshold/…>") — Etched Champion etc.
    const before = oracle.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/\bgains?\s+$/.test(before)) continue;
    const periodIdx = oracle.indexOf(".", m.index);
    const sentence = oracle.slice(m.index, periodIdx >= 0 ? periodIdx : oracle.length).toLowerCase();
    if (/\bas long as\b/.test(sentence)) continue;
    const tail = m[1].toLowerCase().trim();
    if (/^all colors\b/.test(tail) || /^each color\b/.test(tail)) {
      for (const c of ALL_COLORS) set.add(c);
      continue;
    }
    // A color list joined by "and from" / "and" — keep only recognized color words (others → unenforced).
    for (const word of tail.split(/\band from\b|\band\b/)) {
      const q = word.trim();
      if (COLOR_WORD[q]) set.add(COLOR_WORD[q]);
    }
  }
  return set;
}

/** True if any of `sourceColors` (array/iterable of color letters) is in the protected-from Set. */
export function protectionApplies(protColors, sourceColors) {
  if (!protColors || protColors.size === 0) return false;
  for (const c of sourceColors || []) {
    if (protColors.has(String(c).toUpperCase())) return true;
  }
  return false;
}
