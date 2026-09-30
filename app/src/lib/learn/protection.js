/**
 * protection.js — KW-PROTECTION enforcement (CR 702.16), quality = COLOR.
 *
 * "Protection from [quality]" is DEBT: the permanent can't be Damaged by / Enchanted-or-Equipped by /
 * Blocked by / Targeted by a source with the quality. For the common quality (a color), THREE of the four
 * sub-rules are enforced:
 *   - DAMAGE (702.16e): combat damage from a source of the stated color is PREVENTED → 0 dealt.
 *   - BLOCK  (702.16f): an ATTACKING creature with protection from a color can't be blocked by a
 *                       creature of that color.
 *   - TARGET (702.16b): can't be targeted by a spell of that color (the spell's color is threaded into
 *                       the targeting check via legalChoices → enumerateTargets → canBeTargetedBy).
 * The ENCHANT/EQUIP axis (702.16c/d — a same-color Aura/Equipment can't legally attach) is NOT enforced
 * (a safe false-negative; no in-deck consumer needs it). Non-color qualities (artifacts, creatures,
 * "everything", a card name, instants/sorceries, a dynamic "chosen"/"commander color identity") are NOT
 * parsed here → unenforced, also safe.
 *
 * parseProtectionColors reads PRINTED text only and SKIPS granted/conditional protection (so the printed
 * axis can't over-fire). GRANTED protection-from-color (a Captain America Sword's "Equipped creature has
 * protection from black and from green") is modeled LAYER-AWARE: staticAbilityParser emits a layer-6
 * addProtection op, and layers.permanentProtectionColors unions printed + granted. The three enforcement
 * sites above read permanentProtectionColors(state, id), NOT parseProtectionColors(card), so a grant via
 * an attached Equipment/Aura is honored exactly like a printed one and vanishes when it unattaches.
 *
 * Pure: regex + a Set intersection.
 */

const COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const ALL_COLORS = ["W", "U", "B", "R", "G"];

/**
 * The set of colors a card has "protection from [color]" against, uppercase ({W,U,B,R,G}).
 * Parses "protection from <color>", "protection from <A> and from <B>" (CR 702.16g), and
 * "protection from all colors" / "each color" (→ all five). Any non-color quality yields nothing for
 * that clause (it stays unenforced — a safe false-negative). Returns an empty Set when there's none.
 */
// The sentence a "protection from" match sits in, bounded by the previous and the next "." OR line break. A keyword line prints
// no period ("Protection from black and from red" above Mystic Crusader's threshold line), and a period-only end ran the sentence
// into the NEXT line, whose "As long as …" then dropped an unconditional protection at runtime (the 09-06 plan's stage ③ · 28,
// 2026-09-30 — Blood Baron of Vizkopa, Spirit of the Night, Mystic Crusader, Mystic Enforcer, Nantuko Blightcutter, Ivory
// Guardians, Beasts of Bogardan). Shared by the colour and class readers so the two cannot disagree on a boundary.
function protectionSentence(oracle, index) {
  const start = Math.max(oracle.lastIndexOf(".", index), oracle.lastIndexOf("\n", index)) + 1;
  const ends = [oracle.indexOf(".", index), oracle.indexOf("\n", index)].filter((i) => i >= 0);
  return oracle.slice(start, ends.length ? Math.min(...ends) : oracle.length).toLowerCase();
}

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
    // GATED-PROTECTION FIX (2026-08-12): the conditional test must see the WHOLE sentence, not just the
    // text from the match onward — a LEADING conditional ("As long as there are seven or more cards in
    // your graveyard, this creature … has protection from black" — Mystic Familiar; "As long as this
    // creature is untapped, it has protection from …" — Pristine Angel) was slipping through and being
    // read as UNCONDITIONAL printed protection: a live FP at the targeting/blocking/damage sites even
    // while the condition was false. The trailing form (Etched Champion "… as long as <metalcraft>")
    // stays caught — it is inside the same sentence slice. The sentence ENDS at a line break too
    // (protectionSentence — stage ③ · 28).
    if (/\bas long as\b/.test(protectionSentence(oracle, m.index))) continue;
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

/**
 * SHELF-85 B7 (2026-09-04) — the SOURCE-CLASS quality: "protection from creatures" (Beloved Chaplain, Commander
 * Eesha, Teysa, Envoy of Ghosts; granted by Unquestioned Authority / Holy Mantle / Spirit Mantle). Returns the Set of
 * printed, unconditional class qualities — today exactly {"creatures"}. The SAME skip rules as the color reader
 * (a "gains …" grant and an "as long as" gate are not this creature's own quality), and the quality must be the
 * WHOLE span: "creatures with no names" / "creatures of the chosen type" / "creatures your opponents control" are
 * filtered classes the engine cannot evaluate and stay unenforced (a safe miss — the interim-FP the keyword
 * credit already carries, not a new one). Enforced beside the color axis at the three sites (block / combat damage /
 * targeting by an ability whose SOURCE is a creature) through layers.permanentProtectionClasses.
 */
export function parseProtectionClasses(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const set = new Set();
  for (const m of oracle.matchAll(/protection from ([^.;,()\n]+)/gi)) {
    const before = oracle.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/\bgains?\s+$/.test(before)) continue;
    if (/\bas long as\b/.test(protectionSentence(oracle, m.index))) continue;
    if (m[1].toLowerCase().trim() === "creatures") set.add("creatures");
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
