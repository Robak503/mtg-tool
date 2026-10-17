/**
 * spellColors.js — a card's colours as WUBRG letters, derived from its own data (a leaf: it imports nothing).
 *
 * The Scryfall `colors` array when present, else the colours of the mana-cost pips (CR 202.2; a hybrid pip counts each
 * of its colours, CR 202.2d), with Devoid making the card colourless in every zone (CR 702.114a). Moved here from
 * staticAbilityParser.js (2026-10-17) so the face builders (splitCard, adventure, modalDfc) can read it without
 * importing the parser: faceUp.js imports splitCard.js, and keywords.js / staticAbilityParser.js import faceUp.js, so a
 * splitCard → staticAbilityParser edge closed the cycle keywords → faceUp → splitCard → staticAbilityParser → keywords
 * and left GRANTABLE_STATIC_KEYWORDS undefined at module load. staticAbilityParser re-exports this function.
 */
const _WUBRG = ["W", "U", "B", "R", "G"];

export function colorsOfSpell(card) {
  if (Array.isArray(card?.colors)) return card.colors.map((c) => String(c).toUpperCase());
  // DEVOID (CR 702.114, BLITZ DV-1) — a characteristic-defining ability makes the card colorless in EVERY zone
  // regardless of its mana-cost pips. Real cards carry Scryfall's baked colors:[] (returned above); this guards
  // only a fixture lacking a colors array so a devoid {2}{R} spell isn't mis-derived as red. Colorless is always
  // correct for a devoid card — this can only REMOVE a wrong color, never add one (the CREED). Anchored to a
  // WHOLE "Devoid" keyword line (or the Scryfall keyword), so a devoid REFERENCE is never matched.
  if ((card?.keywords || []).some((k) => String(k).toLowerCase() === "devoid")
      || /^[ \t]*devoid\b[ \t]*(?:\([^)]*\))?[ \t]*$/im.test(String(card?.oracle || card?.oracle_text || ""))) {
    return [];
  }
  const cost = String(card?.mana || card?.mana_cost || "");
  const out = [];
  for (const pip of cost.match(/\{[^}]+\}/g) || []) {
    for (const part of pip.slice(1, -1).split("/")) {
      const up = part.toUpperCase();
      if (_WUBRG.includes(up) && !out.includes(up)) out.push(up);
    }
  }
  return out;
}
