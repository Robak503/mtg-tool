/**
 * LEVEL UP — the leveler-card frame (BLITZ LV-1).
 *
 * CR 702.87a: "Level up [cost]" means "[Cost]: Put a level counter on this permanent.
 * Activate only as a sorcery." CR 711.2a/b: each {LEVEL N1-N2} / {LEVEL N3+} symbol is a
 * STATIC ability — "as long as this creature has at least N1 (and at most N2) level
 * counters on it, it has base power and toughness [P/T] and has [abilities]". CR 711.5:
 * below N1 of the first band the creature has its uppermost (printed) P/T. CR 711.4: any
 * ability NOT inside a band striation is a normal, always-on ability. (All cites verified
 * against knowledge/mtg-judge/data/cr/cr_current.json, 2026-07-16.)
 *
 * This module is the PURE STRUCTURAL parser for the frame — it takes a card and returns
 * the band structure, classifying every oracle line into exactly one bucket:
 *   the level-up line · a band header · a band P/T line · a band KEYWORD line (validated
 *   against the closed GRANTABLE_STATIC_KEYWORDS vocabulary — an unknown word fails the
 *   line, never silently matches) · a band ACTIVATED (colon) line · anything else
 *   (unmodeledLines — the fail-closed bucket).
 *
 * It deliberately imports ONLY the keyword vocabulary (like staticAbilityParser), so it can
 * be consumed by both staticAbilityParser.js (band statics) and effects/abilities.js (the
 * level-up activated ability + band-gated activated abilities) without an import cycle.
 * Whether the WHOLE card is modeled (every colon line parses to a modeled activated
 * ability) is decided in effects/abilities.js (`modeledLeveler`), which owns the activated
 * parse — this module only reports structure. THE CREED: a line this parser can't bucket
 * lands in unmodeledLines, and every consumer treats a non-empty unmodeledLines as
 * "park the whole card" (safe false negative, never a partial band).
 *
 * Class enchantments ("{cost}: Level N" — CR 716.4) are a DIFFERENT mechanic: they have no
 * "Level up {cost}" line, so parseLeveler returns null for them and they stay parked.
 */

import { GRANTABLE_STATIC_KEYWORDS } from "./keywords.js";

// Reminder text carries no rules weight (CR 207.2) — strip parenthesized runs before the
// line scan (the level-up reminder "({W}: Put a level counter on this. Level up only as a
// sorcery.)" and keyword reminders like Islandwalk's are the only parens on the frame).
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ");
}

const LEVEL_UP_RE = /^Level up ((?:\{[^}]+\})+)$/i;
// Printed band headers are uppercase ("LEVEL 1-4" / "LEVEL 5+") — kept case-sensitive so a
// prose sentence mentioning "level" can never read as a band header.
const BAND_RANGE_RE = /^LEVEL (\d+)-(\d+)$/;
const BAND_OPEN_RE = /^LEVEL (\d+)\+$/;
const PT_RE = /^(\d+)\/(\d+)$/;

/** Does this card carry the leveler frame at all (a "Level up {cost}" line or a band header)? */
export function isLevelerFrame(oracle) {
  const stripped = stripReminder(oracle);
  return stripped.split("\n").some((ln) => {
    const t = ln.trim();
    return LEVEL_UP_RE.test(t) || BAND_RANGE_RE.test(t) || BAND_OPEN_RE.test(t);
  });
}

/**
 * A band ability line that is a pure comma-separated KEYWORD list ("First strike",
 * "Lifelink, indestructible", "Flying, vigilance") → the lowercased keyword array, each
 * validated against the closed grantable vocabulary (the layers engine enforces exactly
 * these — keywords.js is the single source of truth). Anything else (an unknown keyword
 * like "islandwalk"/"protection from …", a static sentence, prose) → null (fail closed).
 */
export function parseBandKeywordLine(line) {
  const body = String(line || "").trim().replace(/\.$/, "");
  if (!body) return null;
  const parts = body.split(/,\s*/);
  const out = [];
  for (const p of parts) {
    const kw = p.trim().toLowerCase();
    if (!GRANTABLE_STATIC_KEYWORDS.has(kw)) return null;
    out.push(kw);
  }
  return out.length ? out : null;
}

// A colon line whose colon sits OUTSIDE any quoted grant (the same quote-parity guard
// parseActivatedAbilities uses, CR 113.7) — a quoted group grant inside a band (Joraga
// Treespeaker's «Elves you control have "{T}: Add {G}{G}."») is NOT this card's own
// activated ability and must land in unmodeledLines instead.
function isOwnColonLine(line) {
  const ci = line.indexOf(":");
  if (ci === -1) return false;
  const preColonQuotes = (line.slice(0, ci).match(/["“”]/g) || []).length;
  return preColonQuotes % 2 === 0;
}

/**
 * Parse a leveler card's oracle into its structural frame:
 *   {
 *     levelUpPips: "{1}{G}",                 // the level-up activation cost (mana pips)
 *     preBandLines: [...],                   // always-on lines before the first band (CR 711.4)
 *     bands: [{
 *       atLeast, atMost,                     // atMost null for the open "N+" band
 *       pt: { power, toughness } | null,     // the band's base P/T box (CR 711.2a)
 *       keywords: [...],                     // validated grantable keywords, may be []
 *       colonLines: [...],                   // the band's own activated-ability lines
 *       unmodeledLines: [...],               // anything else — non-empty ⇒ park the card
 *     }],
 *   } | null
 *
 * null when the frame doesn't parse cleanly: no/duplicate "Level up" line, no bands, a
 * non-numeric or non-monotonic band sequence (bands must be strictly increasing and
 * non-overlapping, the last band open-ended — every printed leveler satisfies this), or a
 * band range with min > max. Pure and deterministic; no state, no card-text fabrication.
 */
export function parseLeveler(card) {
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  if (!oracle.trim()) return null;
  const lines = oracle.split("\n").map((l) => l.trim()).filter(Boolean);

  let levelUpPips = null;
  const preBandLines = [];
  const bands = [];
  let current = null; // the band being filled

  for (const line of lines) {
    const lu = line.match(LEVEL_UP_RE);
    if (lu) {
      if (levelUpPips !== null || current) return null; // duplicate, or level-up inside a band → malformed
      levelUpPips = lu[1];
      continue;
    }
    const range = line.match(BAND_RANGE_RE);
    const open = line.match(BAND_OPEN_RE);
    if (range || open) {
      current = {
        atLeast: parseInt((range || open)[1], 10),
        atMost: range ? parseInt(range[2], 10) : null,
        pt: null,
        keywords: [],
        colonLines: [],
        unmodeledLines: [],
      };
      bands.push(current);
      continue;
    }
    if (!current) {
      preBandLines.push(line);
      continue;
    }
    // Inside a band striation — bucket the line.
    const pt = line.match(PT_RE);
    if (pt) {
      if (current.pt) { current.unmodeledLines.push(line); continue; } // two P/T lines → malformed band
      current.pt = { power: parseInt(pt[1], 10), toughness: parseInt(pt[2], 10) };
      continue;
    }
    if (isOwnColonLine(line)) {
      current.colonLines.push(line);
      continue;
    }
    const kws = parseBandKeywordLine(line);
    if (kws) {
      current.keywords.push(...kws);
      continue;
    }
    current.unmodeledLines.push(line); // fail-closed bucket
  }

  if (levelUpPips === null || bands.length === 0) return null;
  // Band sequence sanity (CR 711.2a/b): strictly increasing, non-overlapping, only the LAST
  // band open-ended, and every range has min <= max. A malformed sequence → null (park).
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!(b.atLeast >= 0)) return null;
    if (b.atMost != null && b.atMost < b.atLeast) return null;
    const isLast = i === bands.length - 1;
    if (isLast ? b.atMost != null : b.atMost == null) return null;
    if (!isLast && !(bands[i + 1].atLeast > b.atMost)) return null;
  }

  return { levelUpPips, preBandLines, bands };
}
