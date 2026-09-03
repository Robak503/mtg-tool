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

/**
 * The per-attacking-creature generic tax this card imposes on attacks against its controller, or null.
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
  if (!m) return null;
  const generic = parseInt(m[1], 10);
  return generic > 0 ? { generic } : null;
}

/** True iff this exact clause (lowercased, whole) is the modeled attack tax — the coverage-side gate. */
export function isAttackTaxClause(clause) {
  return /^creatures can't attack you(?: or planeswalkers you control)? unless their controller pays \{\d+\} for each (?:of those creatures|creature they control that's attacking you)$/i.test(String(clause || "").trim());
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
    if (tax) total += tax.generic;
  }
  return total;
}
