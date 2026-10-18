/**
 * attackTax.js — THE ATTACK TAX (CR 508.1h — a cost to attack): Propaganda / Ghostly Prison / Windborn Muse.
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
 * THE DEFENDER EACH WORDING NAMES (2026-10-18). The printed subject decides which attacks pay, and readAttackTax reads it
 * from the text, never from the card's name:
 *   · "creatures can't attack you …" (Propaganda, Ghostly Prison, Windborn Muse, Koskun Falls) — attacks on the PLAYER only.
 *     The bundled rulings: "Unless some effect explicitly says otherwise, a creature that can't attack you can still attack
 *     a planeswalker you control." (Propaganda, Ghostly Prison, Koskun Falls); Windborn Muse's: planeswalkers may be
 *     attacked "without their controller paying a cost";
 *   · "… can't attack you or planeswalkers you control …" (Baird, Archon of Absolution, Sphere of Safety, Norn's Annex) —
 *     the player AND each planeswalker they control;
 *   · "… can't attack planeswalkers you control …" (Onakke Oathkeeper) — the planeswalkers only.
 * The gatherers take the attack's target: `defenderPlaneswalkerId` set means the attack is at that planeswalker, which the
 * defending player controls (CR 506.2 — a defending player and the planeswalkers they control may be attacked), so
 * "you" and "planeswalkers you control" both name the taxer's controller, the player whose battlefield is scanned. Until
 * this, every tax was keyed on the defending player, so the "you" printing also priced an attack on that player's
 * planeswalker and Onakke's printing was not read.
 *
 * BOARD-SCAN, not layer-derived: the tax is gathered by scanning the defending player's battlefield
 * through THIS parser (the Root-Sliver "can't be countered" precedent in spellEffects.enumerateTargets).
 * That means a Propaganda whose abilities were removed by some other effect would still tax. No corpus
 * card does that to an enchantment today, and the honest note is cheaper than a layer op that nothing
 * reads.
 */

import { parseCountSource } from "./effects/parseHelpers.js"; // the shared "for each <X> you control" count-source reader (parseHelpers imports only keywords.js — no cycle)

/**
 * THE PRINTED SUBJECT — the defender a tax protects, read from the sentence (one source for the sentence reader and the clause
 * check below): "you" (the player only), "you or planeswalkers you control" (both), "planeswalkers you control" (the
 * planeswalkers only). A "for each creature they control that's attacking …" tail names a defender too, and must name the same
 * one as the subject (TAIL_NAMES); "for each of those creatures" refers back to it.
 */
const TAX_SUBJECT = "(you(?: or planeswalkers you control)?|planeswalkers you control)";
const FIXED_TAIL = "(of those creatures|creature they control that's attacking (?:you|a planeswalker you control))";
const TAIL_NAMES = { "creature they control that's attacking you": "you", "creature they control that's attacking a planeswalker you control": "planeswalkers you control" };
const SENTENCE = (body) => new RegExp(String.raw`(?:^|[\n.])\s*creatures can't attack ${TAX_SUBJECT} unless their controller pays ${body}\s*(?:\.|$)`, "i");
const FIXED_SENTENCE = SENTENCE(String.raw`\{(\d+)\} for each ${FIXED_TAIL}`);
const PHYREXIAN_SENTENCE = SENTENCE(String.raw`\{([wubrg])\/p\} for each of those creatures`);
const COUNTED_SENTENCE = SENTENCE(String.raw`\{x\} for each of those creatures, where x is the number of (enchantments you control)`);
const TAX_CLAUSE = new RegExp(String.raw`^creatures can't attack ${TAX_SUBJECT} unless their controller pays (?:\{\d+\} for each ${FIXED_TAIL}|\{x\} for each of those creatures, where x is the number of enchantments you control|\{[wubrg]\/p\} for each of those creatures)$`, "i");

/** The defenders a printed subject names: attacks on the player, attacks on the planeswalkers they control. */
function defendsOf(subject) {
  const s = subject.toLowerCase();
  return { player: s !== "planeswalkers you control", planeswalkers: s !== "you" };
}

/**
 * THE SHARED READER: this card's attack tax — `{ tax, defends }` — or null. `tax` is the amount per attacking creature:
 * `{ generic }` (a fixed digit), `{ countSource }` (a counted {X} — resolved live by attackTaxToDeclare) or `{ phyrexian }`
 * (one pip). `defends` is `{ player, planeswalkers }`: whether an attack on the taxer's controller, and an attack on a
 * planeswalker they control, pays it (CR 508.1h), read from the printed subject. ONE reader, shared by the coverage marker
 * (staticAbilityParser, through parseAttackTax / isAttackTaxClause) and the runtime (legalChoices, actionDispatcher and
 * attackRequirements, through attackTaxDetail), so the metric and the game can never disagree about which cards tax, or whom.
 */
export function readAttackTax(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  // ④-AM (2026-09-03): the "you OR PLANESWALKERS you control … for each of THOSE creatures" printing (Baird, Steward of
  // Argive; Archon of Absolution) reads from the same sentence as the Ghostly Prison wording, so the metric and the runtime
  // cannot drift; its subject now decides that it also charges an attack on a planeswalker (2026-10-18). Onakke
  // Oathkeeper's "planeswalkers you control … for each creature they control that's attacking a planeswalker you control"
  // is the planeswalker-only printing.
  const m = oracle.match(FIXED_SENTENCE);
  if (m) {
    const named = TAIL_NAMES[m[3].toLowerCase()];
    if (named && named !== m[1].toLowerCase()) return null; // a tail naming another defender than the subject: not a printed tax
    const generic = parseInt(m[2], 10);
    return generic > 0 ? { tax: { generic }, defends: defendsOf(m[1]) } : null;
  }
  // PHYREXIAN TAX (SHELF-85 · Atraxa A2 — Norn's Annex, 2026-09-05): "… pays {W/P} for each of those creatures." — a
  // per-attacker pip paid with {W} OR 2 life (CR 107.4f). The one corpus carrier. attackTaxDetail lists the pips; both
  // consumers pay them with mana when the payment plan can and with life otherwise (CR 119.4 — only from a life total
  // at least that large). Never folded into the generic sum: a {W/P} is not a {1}.
  const mp = oracle.match(PHYREXIAN_SENTENCE);
  if (mp) return { tax: { phyrexian: mp[2].toUpperCase() }, defends: defendsOf(mp[1]) };
  // COUNTED TAX (SHELF-85 · Atraxa A2 — Sphere of Safety, 2026-09-05): "… pays {X} for each of those creatures, where X is
  // the number of enchantments you control." The one corpus carrier of a tax whose X is a plain controller-scoped
  // permanent count. The phrase is read through the SAME count-source parser every "for each <X> you control" effect
  // uses (parseCountSource → { kind:"permanentsYouControl", cardType }), and attackTaxToDeclare resolves it against the
  // DEFENDER's live battlefield at every declaration — the Sphere counts itself, as printed. Exactly this sentence:
  // Collective Restraint's domain {X} and every other "where X is …" stay refused (a mis-read amount is a mis-charge).
  const mx = oracle.match(COUNTED_SENTENCE);
  if (!mx) return null;
  const countSource = parseCountSource(mx[2].toLowerCase());
  return countSource && countSource.kind === "permanentsYouControl" && countSource.cardType && !countSource.who
    ? { tax: { countSource }, defends: defendsOf(mx[1]) }
    : null;
}

/**
 * The per-attacking-creature tax this card imposes (readAttackTax's amount), or null: `{ generic }`, `{ countSource }` or
 * `{ phyrexian }`. The coverage marker's descriptor; the runtime reads readAttackTax, which also says whom it protects.
 */
export function parseAttackTax(card) {
  return readAttackTax(card)?.tax ?? null;
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

/** True iff this exact clause (lowercased, whole) is the modeled attack tax — the coverage-side gate (the reader's sentence, whole). */
export function isAttackTaxClause(clause) {
  const c = String(clause || "").trim();
  return TAX_CLAUSE.test(c) && readAttackTax({ oracle: c }) !== null;
}

/** Does a tax protecting `defends` charge an attack at `defenderPlaneswalkerId` (set: that planeswalker; unset: the player)? */
function chargesAttackAt(defends, defenderPlaneswalkerId) {
  return defenderPlaneswalkerId ? defends.planeswalkers : defends.player;
}

/**
 * The generic mana the attacking player must pay to declare ONE MORE attacker at `defenderId` — or, with
 * `defenderPlaneswalkerId`, at that planeswalker (which `defenderId` controls). Sums every taxing permanent the defender
 * controls whose printed subject names that target — two Propagandas cost {4} apiece, which is how the printed cards stack
 * (each is its own cost to attack, totalled per CR 508.1h; Propaganda's ruling: "the cost is cumulative"), and a "can't
 * attack you" tax adds nothing to an attack on a planeswalker. Zero when the defender controls none, which is the
 * overwhelmingly common case and costs one scan.
 */
export function attackTaxToDeclare(state, defenderId, defenderPlaneswalkerId = null) {
  let total = 0;
  for (const perm of state?.players?.[defenderId]?.battlefield || []) {
    const read = readAttackTax(perm?.card);
    if (!read || !chargesAttackAt(read.defends, defenderPlaneswalkerId)) continue;
    if (read.tax.generic != null) total += read.tax.generic;
    else if (read.tax.countSource) total += countedTaxAmount(state, defenderId, read.tax.countSource);
    // a Phyrexian pip is NOT generic — attackTaxDetail carries it (never a free attack: both consumers read the detail)
  }
  return total;
}

/** Life per Phyrexian pip when it is paid with life (CR 107.4f). */
export const PHYREXIAN_LIFE_PER_PIP = 2;

/**
 * THE FULL TAX for one more attacker at `defenderId` (or at their planeswalker `defenderPlaneswalkerId`) — the generic total
 * (attackTaxToDeclare) plus every Phyrexian pip the defender's taxers naming that target demand (Norn's Annex: one "W" per
 * Annex). The consumers (legalChoices' withhold, the dispatcher's payment, attackRequirements' "costs nothing") read THIS,
 * with the attack's target, so a pip-only board never reads as untaxed and a tax never reaches a target its card doesn't name.
 */
export function attackTaxDetail(state, defenderId, defenderPlaneswalkerId = null) {
  const phyrexian = [];
  for (const perm of state?.players?.[defenderId]?.battlefield || []) {
    const read = readAttackTax(perm?.card);
    if (read?.tax.phyrexian && chargesAttackAt(read.defends, defenderPlaneswalkerId)) phyrexian.push(read.tax.phyrexian);
  }
  return { generic: attackTaxToDeclare(state, defenderId, defenderPlaneswalkerId), phyrexian };
}

/** The mana cost of a detail when every pip is paid with MANA — the generic plus one coloured pip per entry. */
export function attackTaxManaCost(detail) {
  const cost = { generic: detail?.generic || 0 };
  for (const c of detail.phyrexian || []) cost[c] = (cost[c] || 0) + 1;
  return cost;
}
