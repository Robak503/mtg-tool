/**
 * ward.js — KW-WARD enforcement (CR 702.21).
 *
 * "Ward [cost]" is a triggered ability: whenever the permanent becomes the target of a spell or
 * ability an OPPONENT controls, counter that spell or ability unless that player pays [cost]. It is a
 * TAX, not an exclusion — the permanent IS a legal target (unlike hexproof/shroud, which gate
 * targetability in enumerateTargets). So ward never touches `canBeTargetedBy`; it fires AFTER a
 * target is chosen.
 *
 * REUSE: the "counter unless its controller pays [cost]" machinery already exists as the SOFT-COUNTER
 * path (effectAtoms.applyCounter `unlessPay` → pendingChoice "soft-counter" → resolveSoftCounterChoice
 * + the driver/AI settle + the UI). Ward is a thin trigger that raises the SAME pendingChoice with the
 * spell/ability's controller as the payer and the ward cost as the cost — so the decision, the AI
 * heuristic, the UI panel, and the counter are all inherited, not rebuilt.
 *
 * SCOPE — PR1 (shipped): all-generic mana ward ({2}, {1}, {3}, {4}). PR2 (this slice) adds:
 *   - COLORED / HYBRID mana ward ({1}{U}, {W/U}) — parsed to a full mana cost and paid via payManaCost
 *     (the soft-counter settle now carries a structured `cost`, not a bare generic). No corpus card uses
 *     this today (the only non-all-generic mana ward is Minthara's `Ward {X}`, which stays null), but
 *     the path is COMPLETE so such a card resolves correctly the moment it appears — never a generic
 *     approximation that mis-charges a color (a CREED false positive).
 *   - LIFE ward ("Ward—Pay N life") — 19 corpus cards. Paid deterministically (loseLife) when the payer
 *     has >= N life (CR 119.4); declined otherwise → countered. No card/permanent CHOICE is involved, so
 *     it threads through the binary soft-counter pay-or-decline pause unchanged.
 *   - ABILITY targeting (vs only spell targeting). Activated/triggered abilities go on the stack with
 *     targets, so an opponent's ABILITY targeting a ward permanent now raises the ward tax too.
 *
 * STILL OUT (safe false-negatives, returned as null = unenforced, never mis-resolved):
 *   - DISCARD / SACRIFICE ward ("Ward—Discard a card" / "Ward—Sacrifice a creature") — paying these
 *     requires the payer to CHOOSE a card/permanent, which the binary soft-counter pay-or-decline pause
 *     cannot express without a second nested pending-choice (high-blast-radius shared-infra change for 0
 *     in-deck and ~20 corpus cards). Left unenforced rather than half-built.
 *   - {X} ward (Minthara) — the cost is a value the ATTACKER would choose; no soft-counter shape for it.
 *   - A spell/ability targeting 2+ opponent ward permanents (each ward is its own trigger, CR 702.21c).
 *
 * Pure: regex + board reads, no mutation.
 */

import { findPermanent } from "./gameState.js";
import { permanentHasKeyword, permanentGrantedWardCosts } from "./layers.js";

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Parse the pips of a mana ward cost (everything after "Ward ") into the planPayment cost shape, or null
 * if ANY pip isn't a known mana symbol (digit / single color / C / hybrid). {X}/{Y}/{Z} → null (the
 * attacker-chosen value is unmodeled). Mirrors legalChoices.parseManaCost's grammar but is inlined to keep
 * ward.js a leaf (importing legalChoices would pull the whole cast graph + risk a cycle).
 */
function parseWardManaPips(pipStrings) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
  for (const raw of pipStrings) {
    const pip = raw.trim().toUpperCase();
    if (/^\d+$/.test(pip)) { cost.generic += parseInt(pip, 10); continue; }
    if (SINGLE_COLORS.has(pip)) { cost[pip] += 1; continue; }
    if (pip === "C") { cost.C += 1; continue; }
    // Hybrid "{W/U}" / "{2/W}" — every option must be a digit or a single color (drop a "/P" phyrexian
    // marker, which the planner pays as colored). A phyrexian-only "{U/P}" reduces to ["U"].
    if (pip.includes("/")) {
      const parts = pip.split("/").map((p) => p.trim()).filter((p) => p && p !== "P");
      if (parts.length && parts.every((p) => /^\d+$/.test(p) || SINGLE_COLORS.has(p) || p === "C")) {
        cost.hybrid.push(parts);
        continue;
      }
      return null; // unrecognized hybrid option
    }
    return null; // {X}, snow {S}, or any unknown symbol → unmodeled ward
  }
  return cost;
}

/**
 * The ward cost printed on a card, as a STRUCTURED descriptor — or null when it's a form this slice does
 * not enforce (discard/sacrifice/{X} ward, or no ward at all).
 *   - mana: { kind: "mana", mana: <planPayment cost> }    ("Ward {2}", "Ward {1}{U}", "Ward {W/U}")
 *   - life: { kind: "life", life: N }                      ("Ward—Pay 3 life")
 * Discard / sacrifice / {X} → null (a safe false-negative; see the file header).
 */
export function parseWardCost(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");

  // NON-MANA forms use an em-dash or hyphen: "Ward—Pay 3 life" / "Ward — Discard a card".
  // LIFE is the one non-mana form this slice pays (no card/permanent choice). Anchor on the digit+life.
  const lifeM = oracle.match(/\bward\s*[—-]\s*pay\s+(\d+)\s+life/i);
  if (lifeM) return { kind: "life", life: parseInt(lifeM[1], 10) };
  // Discard / sacrifice ward — recognized but UNENFORCED (needs a payer choice). Return null = safe FN.
  if (/\bward\s*[—-]\s*(discard|sacrifice)/i.test(oracle)) return null;

  // MANA form: "Ward {…}". Pips must be DIRECTLY adjacent ({1}{U}) — no `\s*` between them, or a greedy
  // match would cross the newline after "Ward {2}" and swallow the NEXT ability's mana ("{1}{R}{G},
  // Exile…" → a false colored read on Wilson, Ardent Bear / Pippin). A mana cost never has whitespace
  // inside it, so this is exact.
  const m = oracle.match(/\bward\s+(\{[^}]+\}(?:\{[^}]+\})*)/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (!pips.length) return null;
  const mana = parseWardManaPips(pips);
  if (!mana) return null; // {X} / unknown symbol → unmodeled
  return { kind: "mana", mana };
}

/**
 * If `stackObj` (a stack object — spell OR activated/triggered ability) targets EXACTLY ONE permanent
 * that (a) is controlled by an opponent of the object's controller and (b) has ward with a cost this
 * slice can pay (mana or life), return { cost, wardName }; otherwise null. Used to raise a soft-counter
 * (pay-or-be-countered) against the object's controller. CR 702.21a: ward fires on a spell OR an ability
 * an opponent controls — both go on the stack with `controller` + `targets` here.
 */
export function wardTaxForStackObject(state, stackObj) {
  const caster = stackObj?.controller;
  if (!caster) return null;
  const wardTargets = (stackObj.targets || []).filter((t) => {
    if (!t || (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker")) return false;
    const lk = findPermanent(state, t.id);
    // GRANTED ward (Cathedral Acolyte, layer-6 addWard) counts alongside a printed/keyword-granted Ward.
    return lk && lk.controller !== caster
      && (permanentHasKeyword(state, t.id, "Ward") || permanentGrantedWardCosts(state, t.id).length > 0);
  });
  if (wardTargets.length !== 1) return null; // 0 → no ward; 2+ → separate triggers (CR 702.21c), safe FN
  const lk = findPermanent(state, wardTargets[0].id);
  const printed = parseWardCost(lk?.permanent?.card);
  // GRANTED ward costs (CR 702.21c — each instance triggers separately; for all-MANA costs, "pay each or
  // the spell is countered" is outcome-identical to one combined tax, so the generic pips are SUMMED into
  // the soft-counter). A printed NON-mana ward (life) plus a grant can't be combined into one binary tax —
  // fall back to the printed cost alone (an under-tax, FN-safe — never a fabricated combined cost).
  const granted = permanentGrantedWardCosts(state, wardTargets[0].id);
  const grantedGeneric = granted.reduce((s, g) => s + (g.generic || 0), 0);
  const grantedLife = granted.reduce((s, g) => s + (g.life || 0), 0);
  let cost = printed;
  // GRANTED LIFE WARD (CR 702.21c — each ward instance triggers separately; for costs of a SINGLE kind,
  // "pay each or the spell is countered" is outcome-identical to one combined tax, which is the same
  // argument the generic-mana branch below already makes). Handled BEFORE the mana branch so a
  // mixed board falls through to it and keeps today's behaviour exactly.
  if (grantedLife > 0 && grantedGeneric === 0) {
    if (!printed) cost = { kind: "life", life: grantedLife };
    else if (printed.kind === "life") cost = { kind: "life", life: printed.life + grantedLife };
    // printed MANA + a granted LIFE ward cannot become one binary choice → keep the printed cost alone
    // (an under-tax, FN-safe — never a fabricated combined cost). Mirrors the documented case below.
  }
  if (grantedGeneric > 0) {
    if (!printed) cost = { kind: "mana", mana: { generic: grantedGeneric, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };
    else if (printed.kind === "mana") cost = { kind: "mana", mana: { ...printed.mana, generic: (printed.mana.generic || 0) + grantedGeneric } };
    // printed non-mana (life) + a grant → keep the printed cost alone (documented under-tax above)
  }
  if (!cost) return null; // discard/sacrifice/{X} ward → unenforced
  return { cost, wardName: lk.permanent.card?.name || null };
}

/**
 * Back-compat alias — the spell-cast path's name for wardTaxForStackObject (a spell IS a stack object).
 * Kept so the cast wiring + existing tests read naturally.
 */
export function wardTaxForSpell(state, spellObj) {
  return wardTaxForStackObject(state, spellObj);
}
