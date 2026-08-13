/**
 * cardPlayHints.js — the PLAY-HINTS layer (2026-08-12, Colton's order: "the AI must not be blind to
 * cards it can't route").
 *
 * THE GAP THIS FILLS. The engine's coverage tier decides what RESOLVES natively; the Arbiter seam +
 * AI-F2's unresolvable-hold decide what happens when it can't. But the AI's DECISION layer scored casts
 * off four crude regex flags (ramp/draw/interaction/token) — a parked or partially-modeled card had no
 * play identity at all. This module gives EVERY card a deterministic role + timing derived from its
 * PRINTED text (which exists whether or not the effect is modeled), and defines the ledger-entry shape
 * a curated/generated hints file can override it with.
 *
 * TWO SOURCES, ONE SHAPE:
 *   · deriveCardRole(card)      — pure text → { role, timing, reason }. Deterministic, total (every
 *                                 card gets an answer; "utility"/"curve" is the honest default).
 *   · a LEDGER FILE entry       — { role, timing, note?, source: "curated"|"derived"|"arbiter" } keyed
 *                                 by exact card name. Loaded runner-side (scripts/warm-play-hints.cjs
 *                                 writes it; the engine stays file-free) and threaded into the AI as a
 *                                 plain map. lookupPlayHint(hints, card) prefers the ledger, falls back
 *                                 to derivation — so a curated correction always wins.
 *
 * ⛔ RANKING-ONLY, DEFAULT-OFF. Hints influence cast ORDER inside opponentAI when (and only when) a
 * hints map is threaded in — the resolveArbiter default-off precedent: absent map ⇒ the legacy scorer
 * byte-identical, so frozen self-play trajectory hashes are untouched. Legality is never gated on a
 * hint (THE CREED: the engine's chokepoints decide what is legal, policies only re-rank).
 *
 * ROLE VOCABULARY (specific → general; the first matching signal wins):
 *   wipe · counterspell · spot-removal · tutor · ramp · card-draw · recursion · token-maker ·
 *   protection · anthem · lifegain · equipment · finisher · utility
 * TIMING VOCABULARY: early · curve · late · hold-interaction · hold-wipe
 *   (board-AWARE timing — "cast the wipe only when behind" — is deliberately phase 2: scoreCastAction
 *   is state-free today, and a state-dependent hold belongs beside the existing wipe/fog policy arms.
 *   Notated in docs/orchestration/PLAY-HINTS-LEDGER.md.)
 */

const T = (card) => String(card?.type || card?.type_line || "");
const O = (card) => String(card?.oracle || card?.oracle_text || "");

/** Mana value from the printed cost — pips summed, generic added; null when no cost is printed. */
function manaValueOf(card) {
  const mana = String(card?.mana || card?.mana_cost || "");
  const pips = mana.match(/\{([^}]+)\}/g);
  if (!pips) return null;
  let mv = 0;
  for (const p of pips) {
    const sym = p.slice(1, -1);
    mv += /^\d+$/.test(sym) ? parseInt(sym, 10) : sym.toUpperCase() === "X" ? 0 : 1;
  }
  return mv;
}

/**
 * Derive a play role for ANY card from printed text. Pure, deterministic, total. The signal list is
 * ordered most-specific-first so a board wipe never reads as spot removal and a tutor-to-battlefield
 * ramp spell reads as ramp, not tutor.
 */
export function deriveCardRole(card) {
  const type = T(card);
  const o = O(card).replace(/\([^)]*\)/g, ""); // reminder text carries no play identity (CR 207.2)
  const isCreature = /\bCreature\b/.test(type);
  const mv = manaValueOf(card);

  // WIPE — mass removal in any of its printed families.
  if (/\b(?:destroy|exile) all\b/i.test(o) || /\beach creature\b[^.]*\b(?:gets? -|deals? damage to itself)/i.test(o)
    || /deals? \d+ damage to each creature/i.test(o) || /\beach player sacrifices\b/i.test(o)) {
    return { role: "wipe", timing: "hold-wipe", reason: "mass removal text" };
  }
  // COUNTERSPELL — held interaction by definition.
  if (/\bcounter target\b/i.test(o)) {
    return { role: "counterspell", timing: "hold-interaction", reason: "counter target" };
  }
  // PROTECTION — the save-a-creature / blank-a-turn instants.
  if (/\b(?:Instant)\b/.test(type)
    && /\b(?:hexproof|indestructible|protection from|phases? out|prevent all (?:combat )?damage)\b/i.test(o)) {
    return { role: "protection", timing: "hold-interaction", reason: "protective instant" };
  }
  // SPOT REMOVAL — targeted answers.
  if (/\b(?:destroy|exile) target\b/i.test(o) || /deals? \d+ damage to (?:any target|target creature)/i.test(o)
    || /\btarget creature gets -\d+\/-\d+/i.test(o)) {
    return { role: "spot-removal", timing: "hold-interaction", reason: "targeted removal text" };
  }
  // RAMP — mana producers and land fetchers (checked BEFORE tutor: a basic-land search is ramp).
  if (/\badd \{[WUBRGC0-9]/i.test(o) || /search your library for [^.]*basic land/i.test(o)
    || /\bcreate[^.]{0,40}\bTreasure\b/i.test(o) || /put [^.]*land[^.]* onto the battlefield/i.test(o)) {
    return { role: "ramp", timing: "early", reason: "mana/land acceleration text" };
  }
  // TUTOR — generic library search.
  if (/search your library for/i.test(o)) {
    return { role: "tutor", timing: "curve", reason: "library search" };
  }
  // RECURSION — graveyard value.
  if (/\breturn [^.]*from your graveyard\b/i.test(o)) {
    return { role: "recursion", timing: "curve", reason: "graveyard return" };
  }
  // CARD DRAW.
  if (/\bdraws? (?:a|two|three|four|x|\d+) cards?\b/i.test(o)) {
    return { role: "card-draw", timing: "curve", reason: "draw text" };
  }
  // TOKEN MAKER.
  if (/\bcreate\b[^.]*\btoken/i.test(o)) {
    return { role: "token-maker", timing: "curve", reason: "token creation" };
  }
  // FINISHER (the BIG-BODY prong) — checked BEFORE anthem/token text: Craterhoof Behemoth prints a
  // group pump, but the 8-mana body is its play identity — you sequence it as the payoff, not as an
  // anthem on curve. (The witness row caught the original order deriving Hoof as "anthem".)
  if (isCreature && ((Number(card?.power) || 0) >= 6 || (mv != null && mv >= 7))) {
    return { role: "finisher", timing: "late", reason: "big body" };
  }
  // ANTHEM — group pumps.
  if (/creatures you control (?:get|gain) \+/i.test(o)) {
    return { role: "anthem", timing: "curve", reason: "group pump" };
  }
  // EQUIPMENT — by type line.
  if (/\bEquipment\b/.test(type)) {
    return { role: "equipment", timing: "curve", reason: "equipment type" };
  }
  // LIFEGAIN.
  if (/\bgain \d+ life\b/i.test(o) && !isCreature) {
    return { role: "lifegain", timing: "curve", reason: "lifegain text" };
  }
  // FINISHER — the big printed bodies and extra-combat/win text.
  if (/\b(?:extra combat|additional combat|you win the game|loses half their life)\b/i.test(o)
    || (isCreature && ((Number(card?.power) || 0) >= 6 || (mv != null && mv >= 7)))) {
    return { role: "finisher", timing: "late", reason: "big body / game-ending text" };
  }
  return { role: "utility", timing: "curve", reason: "no specific signal" };
}

/**
 * Ledger-first lookup: the hints map (card name → entry) wins; a missing/malformed entry falls back to
 * derivation, so a partially-warmed ledger never blinds a card that derivation could see. `hints` null/
 * absent → pure derivation (still total).
 */
export function lookupPlayHint(hints, card) {
  const entry = hints && card?.name ? hints[card.name] : null;
  if (entry && typeof entry.role === "string" && typeof entry.timing === "string") return entry;
  return deriveCardRole(card);
}
