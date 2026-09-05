/**
 * attackTax.js — THE ATTACK TAX (CR 508.1g): Propaganda / Ghostly Prison / Windborn Muse.
 *
 *   "Creatures can't attack you unless their controller pays {2} for each creature they control
 *    that's attacking you."
 *
 * ⚠️ THE FALSE POSITIVE THIS MODULE EXISTS TO PREVENT, stated first because it is the whole design:
 * modelling the RESTRICTION without the PAYMENT is worse than not modelling the card. The engine would
 * read Propaganda, decide attacking is permitted, and swing for free — the card would classify native
 * while doing nothing at all. The other half-model is just as wrong in the other direction: treating the
 * tax as unpayable turns a {2} toll into Moat. So the restriction and the payment ship together or
 * neither ships. There is no partial credit here.
 *
 * SEQUENTIAL DECLARATION vs. THE PRINTED COST. The card charges {2} × (creatures attacking you) once, as
 * the attack declaration's total cost. This engine declares attackers ONE AT A TIME, so the tax is
 * charged per declaration instead: the k-th attacker costs {2}, and N attackers cost {2N} — the same
 * total the printed card asks for, reached one step at a time. The difference that remains is that a
 * player here cannot declare a swing they can't afford and then take it back; they simply stop when the
 * mana runs out. Every board state reachable under the printed rule is reachable under this one.
 *
 * SCOPE — the exact fixed-{N} sentence only, anchored whole:
 *   ✓ Propaganda #115 · Ghostly Prison #161 · Windborn Muse #1011
 *   ✗ Collective Restraint ({X} domain — a variable tax), Elephant Grass ("nonblack creatures",
 *     a color-filtered subject), Summon: Yojimbo (a Saga chapter's temporary version)
 * Those stay body-only. A tax whose amount or subject we read wrong is a mis-charge, and a mis-charge is
 * a false positive; refusing to read them at all is the safe direction.
 *
 * BOARD-SCAN, not layer-derived: the tax is gathered by scanning the defending player's battlefield
 * through THIS parser (the Root-Sliver "can't be countered" precedent in spellEffects.enumerateTargets).
 * That means a Propaganda whose abilities were removed by some other effect would still tax. No corpus
 * card does that to an enchantment today, and the honest note is cheaper than a layer op that nothing
 * reads.
 */

import { parseCountSource } from "./effects/parseHelpers.js"; // the shared "for each <X> you control" count-source reader (parseHelpers imports only keywords.js — no cycle)

/**
 * The per-attacking-creature generic tax this card imposes on attacks against its controller, or null.
 * Either `{ generic }` (a fixed digit) or `{ countSource }` (a counted {X} — resolved live by attackTaxToDeclare).
 * ONE parser, shared by the coverage marker (staticAbilityParser) and the runtime (legalChoices +
 * actionDispatcher), so the metric and the game can never disagree about which cards tax.
 */
export function parseAttackTax(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  // ④-AM (2026-09-03): the "you OR PLANESWALKERS you control … for each of THOSE creatures" printing (Baird, Steward of
  // Argive; Archon of Absolution) is the same tax — the declare action's `defender` is the PLAYER whether the attack is
  // at them or at their planeswalker (defenderPlaneswalkerId rides beside it), so attackTaxToDeclare already charges
  // both. Read from the same regex as the Ghostly Prison wording, so the metric and the runtime cannot drift.
  const m = oracle.match(/(?:^|[\n.])\s*creatures can't attack you(?: or planeswalkers you control)? unless their controller pays \{(\d+)\} for each (?:of those creatures|creature they control that's attacking you)\s*(?:\.|$)/i);
  if (m) {
    const generic = parseInt(m[1], 10);
    return generic > 0 ? { generic } : null;
  }
  // PHYREXIAN TAX (SHELF-85 · Atraxa A2 — Norn's Annex, 2026-09-05): "… pays {W/P} for each of those creatures." — a
  // per-attacker pip paid with {W} OR 2 life (CR 107.4f). The one corpus carrier. attackTaxDetail lists the pips; both
  // consumers pay them with mana when the payment plan can and with life otherwise (CR 119.4 — only from a life total
  // at least that large). Never folded into the generic sum: a {W/P} is not a {1}.
  const mp = oracle.match(/(?:^|[\n.])\s*creatures can't attack you(?: or planeswalkers you control)? unless their controller pays \{([wubrg])\/p\} for each of those creatures\s*(?:\.|$)/i);
  if (mp) return { phyrexian: mp[1].toUpperCase() };
  // COUNTED TAX (SHELF-85 · Atraxa A2 — Sphere of Safety, 2026-09-05): "… pays {X} for each of those creatures, where X is
  // the number of enchantments you control." The one corpus carrier of a tax whose X is a plain controller-scoped
  // permanent count. The phrase is read through the SAME count-source parser every "for each <X> you control" effect
  // uses (parseCountSource → { kind:"permanentsYouControl", cardType }), and attackTaxToDeclare resolves it against the
  // DEFENDER's live battlefield at every declaration — the Sphere counts itself, as printed. Exactly this sentence:
  // Collective Restraint's domain {X} and every other "where X is …" stay refused (a mis-read amount is a mis-charge).
  const mx = oracle.match(/(?:^|[\n.])\s*creatures can't attack you(?: or planeswalkers you control)? unless their controller pays \{x\} for each of those creatures, where x is the number of (enchantments you control)\s*(?:\.|$)/i);
  if (!mx) return null;
  const countSource = parseCountSource(mx[1].toLowerCase());
  return countSource && countSource.kind === "permanentsYouControl" && countSource.cardType && !countSource.who ? { countSource } : null;
}

/**
 * The live amount of a COUNTED tax for `defenderId` — the defender's battlefield permanents whose front-face type line
 * carries the counted card type (the same type-line read the shared count evaluator's countMatches makes; this module
 * is a pure leaf and cannot import that evaluator without closing a cycle through gameState → staticAbilityParser).
 * parseAttackTax admits exactly one spec shape, so this resolver has exactly one shape to resolve.
 */
function countedTaxAmount(state, defenderId, spec) {
  const word = String(spec?.cardType || "");
  if (!word) throw new Error("attack tax: a counted tax without a card type"); // unreachable by construction — never a free attack
  const re = new RegExp(`\\b${word.charAt(0).toUpperCase()}${word.slice(1)}\\b`);
  return (state?.players?.[defenderId]?.battlefield || []).filter((perm) => re.test(String(perm?.card?.type ?? perm?.card?.type_line ?? ""))).length;
}

/** True iff this exact clause (lowercased, whole) is the modeled attack tax — the coverage-side gate. */
export function isAttackTaxClause(clause) {
  return /^creatures can't attack you(?: or planeswalkers you control)? unless their controller pays (?:\{\d+\} for each (?:of those creatures|creature they control that's attacking you)|\{x\} for each of those creatures, where x is the number of enchantments you control|\{[wubrg]\/p\} for each of those creatures)$/i.test(String(clause || "").trim());
}

/**
 * The generic mana the attacking player must pay to declare ONE MORE attacker against `defenderId`.
 * Sums every taxing permanent the defender controls — two Propagandas cost {4} apiece, which is how the
 * printed cards stack (each is its own independent restriction, CR 509.1a's "each applicable requirement").
 * Zero when the defender controls none, which is the overwhelmingly common case and costs one scan.
 */
export function attackTaxToDeclare(state, defenderId) {
  let total = 0;
  for (const perm of state?.players?.[defenderId]?.battlefield || []) {
    const tax = parseAttackTax(perm?.card);
    if (!tax) continue;
    if (tax.generic != null) total += tax.generic;
    else if (tax.countSource) total += countedTaxAmount(state, defenderId, tax.countSource);
    // a Phyrexian pip is NOT generic — attackTaxDetail carries it (never a free attack: both consumers read the detail)
  }
  return total;
}

/** Life per Phyrexian pip when it is paid with life (CR 107.4f). */
export const PHYREXIAN_LIFE_PER_PIP = 2;

/**
 * THE FULL TAX for one more attacker against `defenderId` — the generic total (attackTaxToDeclare) plus every Phyrexian pip
 * the defender's taxers demand (Norn's Annex: one "W" per Annex). The two consumers (legalChoices' withhold and the
 * dispatcher's payment) read THIS, so a pip-only board never reads as untaxed.
 */
export function attackTaxDetail(state, defenderId) {
  const phyrexian = [];
  for (const perm of state?.players?.[defenderId]?.battlefield || []) {
    const tax = parseAttackTax(perm?.card);
    if (tax?.phyrexian) phyrexian.push(tax.phyrexian);
  }
  return { generic: attackTaxToDeclare(state, defenderId), phyrexian };
}

/** The mana cost of a detail when every pip is paid with MANA — the generic plus one coloured pip per entry. */
export function attackTaxManaCost(detail) {
  const cost = { generic: detail?.generic || 0 };
  for (const c of detail.phyrexian || []) cost[c] = (cost[c] || 0) + 1;
  return cost;
}
