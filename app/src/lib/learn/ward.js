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
 * WHERE IT IS RAISED — every way a spell or ability gets a target: a spell as it is cast and an activated ability as it is
 * activated (actionDispatcher), a LOYALTY ability as it is activated (a loyalty ability is an activated ability, CR 606.1 —
 * 2026-10-20), a TRIGGERED ability as it is put on the stack (gameEngine.flushTriggers and the trigger-target settle record it on
 * the ability; the session driver asks it before anyone receives priority — gameEngine.raiseWardOwed), a target CHANGED onto a ward
 * permanent and a COPY put onto the stack with targets (CR 707.10c — atoms/stack.withWardOwed records it; raiseWardOwed asks it). The
 * default AI reads the same detector before it aims a spell or ability of its own (opponentAI.wardCountersAction). After the question is
 * settled, priority stays with the player who held it when the spell was cast or the ability activated or put on the stack
 * (CR 117.3c, 117.5 — the ward trigger goes on the stack before that player receives priority; the engine asks it at once
 * instead): the pending choice carries `priorityAfter`, and learnSession's settle returns priority to it.
 *
 * THE COST — every ward instance the targets carry (wardTaxForStackObject):
 *   · each ward permanent a spell or ability targets has its own ward trigger (CR 702.21a), and each instance of ward on one
 *     permanent triggers separately (CR 113.2c — a printed ward and one an Equipment grants both trigger); "If that player
 *     doesn't pay for all of them, the spell will be countered" (the bundled ruling on the ward cards). The engine asks ONE
 *     question for all of them: pay every ward, or the spell or ability is countered — the outcome of every answer to the
 *     separate questions except paying some and declining others, which counters it all the same and only spends what was paid;
 *   · the printed cost, read off the face that is up (faceUp.faceUpView — a back face's ward is never read), reminder text
 *     stripped (CR 207.2a):
 *       - mana: "Ward {2}", "Flying, ward {1}", "Ward {1}{U}", "Ward {W/U}" — a full mana cost, colored and hybrid included;
 *       - life: "Ward—Pay 3 life" (CR 119.4); "Ward—Pay life equal to this creature's power" — the power when it is asked
 *         (Phyrexian Fleshgorger, Raubahn; their rulings: the power as the ward resolves);
 *       - discard: "Ward—Discard a card" (the payer chooses, CR 701.9b) and "Ward—Discard a card at random" (no choice);
 *       - several parts: "Ward—{2}, Pay 2 life" — every part is paid (Captain Howler, Gisa, Ovika);
 *       - alternatives: "Ward—Discard a card or pay {2}" — the payer pays either one (Titania, Rugged Rumbler);
 *       - a ward its card grants itself under a condition: "Iymrith has ward {4} as long as it's untapped", "The Tarrasque has
 *         haste and ward {10} as long as it was cast", "Minthara has ward {X}, where X is the number of experience counters
 *         you have" (CR 702.21b — X is read when it is asked);
 *   · a granted ward (layers.permanentGrantedWardCosts — Cathedral Acolyte, Plate Armor, Hexing Squelcher): each grant is an
 *     instance of its own.
 * A COST THE ENGINE CAN'T TAKE — a sacrifice ("Ward—Sacrifice a creature", Vein Ripper), poison counters, collect evidence,
 * waterbend, blight, a discard of a certain card type, a ward whose cost no form above reads — is `{ kind: "unpayable", text }`:
 * the question is asked and can't be paid, so the spell or ability is countered, exactly what declining to pay does (CR
 * 118.12a — "unless" a player does something: declining is always a legal answer). Before 2026-10-20 such a ward was returned
 * as null and the spell resolved without it — a free pass no answer to the question allows.
 *
 * Pure: regex + board reads, no mutation.
 */

import { findPermanent } from "./gameState.js";
import { permanentHasKeyword, permanentGrantedWardCosts, permanentPower } from "./layers.js";
import { faceUpView } from "./faceUp.js";

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);
const COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Parse the pips of a mana ward cost (everything after "Ward ") into the planPayment cost shape, or null
 * if ANY pip isn't a known mana symbol (digit / single color / C / hybrid). {X}/{Y}/{Z} → null (an X ward is
 * read by the caller, which knows what X is). Mirrors legalChoices.parseManaCost's grammar but is inlined to keep
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
    return null; // {X}, snow {S}, or any unknown symbol
  }
  return cost;
}

const pipsOf = (s) => (String(s).match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
const unpayable = (text) => ({ kind: "unpayable", text: String(text).trim() });

/** The card's own name as its rules text says it — the full name, "this creature", or a shortened name (CR 201.5c — "Raubahn", "Iymrith"). */
function namesSelf(card, subject) {
  const s = String(subject || "").trim().toLowerCase();
  const name = String(card?.name || "").toLowerCase();
  return s === "this creature" || s === "this permanent" || (!!name && (s === name || s === name.split(",")[0].trim()));
}

/** One cost phrase of a "Ward—…" line → a descriptor, or null when it is no form the engine pays. */
function parseCostPhrase(phrase, card) {
  const p = String(phrase).trim().replace(/\.$/, "").trim();
  let m = p.match(/^pay (\d+) life$/i);
  if (m) return { kind: "life", life: parseInt(m[1], 10) };
  m = p.match(/^pay life equal to (.+)'s power$/i);
  if (m && namesSelf(card, m[1])) return { kind: "life-power" };
  m = p.match(/^discard (a|an|one|two|three|four|five|\d+) cards?( at random)?$/i);
  if (m) {
    const n = COUNTS[m[1].toLowerCase()] ?? parseInt(m[1], 10);
    if (!Number.isInteger(n) || n < 1) return null;
    return m[2] ? { kind: "discard-random", count: n } : { kind: "discard", n };
  }
  m = p.match(/^(?:pay )?((?:\{[^}]+\})+)$/i);
  if (m) {
    const mana = parseWardManaPips(pipsOf(m[1]));
    return mana ? { kind: "mana", mana } : null;
  }
  return null;
}

/** The cost after "Ward—": one phrase, parts joined by commas (all paid), or alternatives joined by "or" (one paid). */
function parseWardCostText(text, card) {
  const t = String(text).trim().replace(/\.$/, "").trim();
  const alternatives = t.split(/\s+or\s+/i);
  if (alternatives.length > 1) {
    const options = alternatives.map((s) => parseCostPhrase(s, card));
    return options.every(Boolean) ? { kind: "any", options } : unpayable(t);
  }
  const parts = t.split(/\s*,\s*/);
  if (parts.length > 1) {
    const read = parts.map((s) => parseCostPhrase(s, card));
    return read.every(Boolean) ? { kind: "all", parts: read } : unpayable(t);
  }
  return parseCostPhrase(t, card) ?? unpayable(t);
}

/** A mana ward's pips ("{2}", "{X}") → its cost; {X} reads as an X ward the caller sizes (`x`), any other unread pip as unpayable. */
function manaInstance(pipText, xFrom = null) {
  const pips = pipsOf(pipText);
  if (pips.length === 1 && pips[0].toUpperCase() === "X") return xFrom ? { cost: { kind: "mana-x" }, xFrom } : { cost: unpayable(`Ward ${pipText}`) };
  const mana = parseWardManaPips(pips);
  return { cost: mana ? { kind: "mana", mana } : unpayable(`Ward ${pipText}`) };
}

// "<self> has [haste and] ward {N}[ as long as it's untapped | as long as it was cast][, where X is the number of experience
// counters you have]." — a ward the card grants itself (Iymrith, The Tarrasque, Minthara).
const SELF_GRANT = /^(.+?) has (?:[a-z]+(?:, [a-z]+)*,? and )?ward ((?:\{[^}]+\})+)( as long as it's untapped| as long as it was cast)?(, where X is the number of experience counters you have)?\.?$/i;

/**
 * The ward instances printed on a card, in text order: `{ cost, form, condition?, xFrom? }`. `form` is "keyword" (a "Ward …"
 * line or a "ward {…}" in a keyword line — present while the permanent has the keyword) or "self" (a "<this> has ward" sentence,
 * present while its condition holds: `condition` "untapped" | "cast"). A cost the engine can't read is `{ kind: "unpayable" }`;
 * "life-power" and "mana-x" are sized against the permanent by wardInstancesOn.
 */
export function readPrintedWards(card) {
  const face = faceUpView(card);
  const text = String(face?.oracle ?? face?.oracle_text ?? "").replace(/\([^)]*\)/g, "");
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // "Ward—<cost>" (the em-dash form is always a line of its own).
    const dash = line.match(/^ward\s*[—–-]\s*(.+)$/i);
    if (dash) { out.push({ cost: parseWardCostText(dash[1], card), form: "keyword" }); continue; }
    // A keyword line: "Ward {2}", "Flying, ward {2}", "Ward {1}, haste", "Trample, ward {2}, prowess".
    const segments = line.split(/,\s*/);
    const kw = segments.map((s) => s.trim().match(/^ward\s+((?:\{[^}]+\})+)\.?$/i)).filter(Boolean);
    if (kw.length) { for (const m of kw) out.push({ ...manaInstance(m[1]), form: "keyword" }); continue; }
    const self = line.match(SELF_GRANT);
    if (self && namesSelf(card, self[1])) {
      const condition = /untapped/i.test(self[3] || "") ? "untapped" : /cast/i.test(self[3] || "") ? "cast" : null;
      out.push({ ...manaInstance(self[2], self[4] ? "experience" : null), form: "self", ...(condition ? { condition } : {}) });
    }
  }
  return out;
}

/**
 * The ward cost printed on a card, as a STRUCTURED descriptor — or null when the card prints no ward of its own
 * (the conditions of a self-granted ward aren't read here: see wardInstancesOn). Several printed instances combine as
 * combineWardCosts does.
 *   - mana: { kind: "mana", mana: <planPayment cost> }   ("Ward {2}", "Ward {1}{U}", "Ward {W/U}")
 *   - life: { kind: "life", life: N }                     ("Ward—Pay 3 life")
 *   - discard: { kind: "discard", n } / { kind: "discard-random", count }
 *   - all: { kind: "all", parts } / any: { kind: "any", options }
 *   - unpayable: { kind: "unpayable", text }              (a sacrifice, poison counters, {X} with no X, …)
 */
export function parseWardCost(card) {
  const printed = readPrintedWards(card);
  if (!printed.length) return null;
  return combineWardCosts(printed.map((p) => (p.cost.kind === "mana-x" || p.cost.kind === "life-power" ? unpayable("Ward") : p.cost)));
}

/** A granted ward (layers.permanentGrantedWardCosts) → its cost descriptor. */
function grantedCost(g) {
  if (typeof g.generic === "number") return { kind: "mana", mana: { generic: g.generic, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };
  if (typeof g.life === "number") return { kind: "life", life: g.life };
  return unpayable("Ward");
}

/**
 * Every ward instance on `permanentId` right now, each a cost descriptor: the printed keyword wards while the permanent has the
 * keyword (layers.permanentHasKeyword — a ward an effect removed doesn't trigger), the self-granted ones whose condition holds
 * (untapped; it was cast — `wasCast`, stamped as it entered), X and "its power" read now, and each granted ward. A permanent that
 * has the keyword but prints no ward cost the engine finds (a ward granted by a source it doesn't read) has one unpayable instance.
 */
function wardInstancesOn(state, permanentId) {
  const lk = findPermanent(state, permanentId);
  if (!lk?.permanent) return [];
  const perm = lk.permanent;
  const hasKeyword = permanentHasKeyword(state, permanentId, "Ward");
  const out = [];
  let printedKeyword = 0;
  for (const inst of readPrintedWards(perm.card)) {
    if (inst.form === "keyword") {
      printedKeyword++;
      if (!hasKeyword) continue;
    } else if (inst.condition === "untapped" ? perm.tapped : inst.condition === "cast" ? perm.wasCast !== true : false) {
      continue;
    }
    if (inst.cost.kind === "mana-x") {
      const x = Math.max(0, Number(state.players?.[lk.controller]?.experience) || 0);
      out.push({ kind: "mana", mana: { generic: x, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    } else if (inst.cost.kind === "life-power") {
      out.push({ kind: "life", life: Math.max(0, permanentPower(state, permanentId)) });
    } else out.push(inst.cost);
  }
  const granted = permanentGrantedWardCosts(state, permanentId).map(grantedCost);
  if (hasKeyword && printedKeyword === 0 && out.length === 0 && granted.length === 0) out.push(looseWardCost(perm.card));
  return [...out, ...granted];
}

/**
 * The keyword without a ward line the reader knows (three cards in the bundled data: Emerin, Shivan Angel's "Angels and Dragons
 * you control have … ward 2", Catch of the Day's chosen "ward {3}", Squishy Sphinx Ninja's "{TK}{TK} — Ward {2}"): the first mana
 * ward its text names — what the reader before 2026-10-20 took for any card, so these keep that cost — else a cost the engine
 * can't take. Never nothing: the permanent has ward.
 */
function looseWardCost(card) {
  const text = String(faceUpView(card)?.oracle ?? "").replace(/\([^)]*\)/g, "");
  const m = text.match(/\bward\s+(?:(\{[^}]+\}(?:\{[^}]+\})*)|(\d+)\b)/i);
  const mana = m ? (m[1] ? parseWardManaPips(pipsOf(m[1])) : parseWardManaPips([m[2]])) : null;
  return mana ? { kind: "mana", mana } : unpayable("Ward");
}

// ─── combining the instances into the one question ──────────────────────────────────────────────────────────────────────────

/** A cost as its alternatives, each a list of plain parts (mana | life | discard | discard-random | unpayable). */
function alternativesOf(cost) {
  if (cost.kind === "any") return cost.options.flatMap(alternativesOf);
  if (cost.kind === "all") return cost.parts.map(alternativesOf).reduce((acc, alts) => acc.flatMap((a) => alts.map((b) => [...a, ...b])), [[]]);
  return [[cost]];
}

const ZERO_MANA = () => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] });
const manaIsZero = (m) => !m.generic && !m.W && !m.U && !m.B && !m.R && !m.G && !m.C && !(m.hybrid || []).length;

/** One alternative's parts merged: the mana summed, the life summed, the discards counted — in that order; unpayable if any part is. */
function mergeParts(parts) {
  const bad = parts.filter((p) => p.kind === "unpayable");
  if (bad.length) return unpayable(bad.map((p) => p.text).join(" and "));
  const mana = ZERO_MANA();
  let sawMana = false;
  let life = 0;
  let discard = 0;
  let random = 0;
  for (const p of parts) {
    if (p.kind === "mana") {
      sawMana = true;
      for (const k of ["generic", "W", "U", "B", "R", "G", "C"]) mana[k] += p.mana?.[k] || 0;
      mana.hybrid.push(...(p.mana?.hybrid || []));
    } else if (p.kind === "life") life += p.life;
    else if (p.kind === "discard") discard += p.n || 1;
    else if (p.kind === "discard-random") random += p.count || 1;
  }
  const out = [];
  if (sawMana && (!manaIsZero(mana) || parts.length === 1)) out.push({ kind: "mana", mana });
  if (life > 0) out.push({ kind: "life", life });
  if (discard > 0) out.push({ kind: "discard", n: discard });
  if (random > 0) out.push({ kind: "discard-random", count: random });
  if (!out.length) return { kind: "mana", mana };
  return out.length === 1 ? out[0] : { kind: "all", parts: out };
}

/**
 * The one pay-or-be-countered question for every ward instance at once: pay every instance (CR 113.2c; the ward cards' ruling —
 * "If that player doesn't pay for all of them, the spell will be countered"), choosing for each instance with alternatives which
 * one. As the alternatives of the whole — each a merged list of parts — with an alternative the engine can't pay dropped while
 * another is payable; a single alternative is returned as itself. Exported for the tests.
 */
export function combineWardCosts(costs) {
  const alternatives = costs.map(alternativesOf).reduce((acc, alts) => acc.flatMap((a) => alts.map((b) => [...a, ...b])), [[]]).map(mergeParts);
  const payable = alternatives.filter((c) => c.kind !== "unpayable");
  const kept = [];
  for (const c of payable.length ? payable : alternatives.slice(0, 1)) if (!kept.some((k) => JSON.stringify(k) === JSON.stringify(c))) kept.push(c);
  return kept.length === 1 ? kept[0] : { kind: "any", options: kept };
}

const joinNames = (names) => (names.length <= 1 ? names[0] ?? null : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The ward a spell or ability (`stackObj` — any stack object with `controller` + `targets`) owes as it targets: every permanent
 * it targets that an OPPONENT of its controller controls (CR 702.21a — a player's own permanent never asks) and that has ward,
 * each counted once however many of its targets name it. Returns `{ cost, wardName }` — the combined cost (combineWardCosts) and
 * the ward permanents' names — or null when no target has ward. Used by every place a ward is raised (actionDispatcher's cast,
 * activation and loyalty paths; gameEngine's triggered-ability record; atoms/stack's changed-target and copy record) and by the AI's
 * trigger-target chooser and its own aim (opponentAI.wardCountersAction).
 */
export function wardTaxForStackObject(state, stackObj) {
  const caster = stackObj?.controller;
  if (!caster) return null;
  const seen = new Set();
  const costs = [];
  const names = [];
  for (const t of stackObj.targets || []) {
    if (!t || (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") || seen.has(t.id)) continue;
    seen.add(t.id);
    const lk = findPermanent(state, t.id);
    if (!lk || lk.controller === caster) continue;
    const instances = wardInstancesOn(state, t.id);
    if (!instances.length) continue;
    costs.push(...instances);
    names.push(lk.permanent.card?.name || null);
  }
  if (!costs.length) return null;
  return { cost: combineWardCosts(costs), wardName: joinNames(names) };
}

/**
 * Back-compat alias — the spell-cast path's name for wardTaxForStackObject (a spell IS a stack object).
 * Kept so the cast wiring + existing tests read naturally.
 */
export function wardTaxForSpell(state, spellObj) {
  return wardTaxForStackObject(state, spellObj);
}
