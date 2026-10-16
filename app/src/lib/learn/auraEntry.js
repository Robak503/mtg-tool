/**
 * auraEntry.js — an Aura put onto the battlefield WITHOUT being cast: what it may enchant, and which one it takes.
 *
 * CR 303.4f: "If an Aura is entering the battlefield under a player's control by any means other than by resolving as an Aura
 * spell, and the effect putting it onto the battlefield doesn't specify the object or player the Aura will enchant, that player
 * chooses what it will enchant as the Aura enters the battlefield. The player must choose a legal object or player according to
 * the Aura's enchant ability and any other applicable effects." CR 303.4g: with no legal object or player, the Aura remains in
 * its current zone. Every non-cast entry (a blink's return, a reanimation, a put from library or hand) runs through
 * effects/atoms/zones.enterCardFromZone, which asks chooseAuraEntryHost below.
 *
 * NOTHING IS TARGETED. The bundled Brago, King Eternal ruling: "An Aura put onto the battlefield this way doesn't target anything
 * (so it could be attached to an opponent's permanent with hexproof, for example), but the Aura's enchant ability restricts what
 * it can be attached to." So shroud, hexproof and ward never narrow the choice. What does:
 *   · the Enchant line (CR 702.5a) — staticAbilityParser.auraEntryHostSpec, the cast side's host spec plus the subjects its other
 *     cast lanes own; an Enchant line it can't read leaves the Aura where it is (`modeled: false`), never attached to a guess;
 *   · protection (CR 702.16c — "can't be enchanted by Auras that have the stated quality"): a colour the layer engine reads; a
 *     quality it doesn't read (everything, enchantments, multicolored, the chosen colour) keeps the permanent out;
 *   · an effect that says the permanent can't be enchanted (Consecrate Land, Anti-Magic Aura, Guardian Beast) keeps it out.
 * A permanent kept out wrongly is a missed host; one let in wrongly is an illegal attachment. The rules above all fail closed.
 * The caller passes the board the Aura is entering — for one card of a larger event, the board as that event began, so a
 * permanent entering at the same time is not on it (the same Brago ruling: "The Aura can't enter the battlefield enchanting a
 * permanent that enters the battlefield at the same time").
 *
 * THE CHOICE is the house policy for every seat, like the other choices made as a permanent enters during an effect's
 * resolution (riot, the shockland's payment, Cloud Key's card type): an Aura that helps its host goes on its controller's
 * highest-power creature, one that hurts it on an opponent's (auraCastIntent — the cast side's reading, moved here so the two
 * agree), a mana Aura on the controller's land already carrying the most of them (manaUntapLine.pickManaAuraTarget's rule).
 * One whose side that reading can't tell goes back to the side it left when it is blinked (`sideHint`), else to its
 * controller's. When the side it wants has no legal host the Aura still must enter (CR 303.4f), so it takes the other side's
 * least-harmful one. A human seat is chosen for by the same policy; giving the human the choice is a pause this path does not
 * have yet.
 *
 * LEAF: staticAbilityParser, layers, protection, creatureRestrictions, controlAura and gameState — every one of them is already
 * reachable from effects/atoms/zones.js, and none imports an atoms module or the AI.
 */
import { findPermanent } from "./gameState.js";
import { auraEntryHostSpec, isNativeManaAura, parseAuraBonus } from "./staticAbilityParser.js";
import { colorsOf, permanentHasCardType, permanentIsCreature, permanentPower, permanentProtectionColors, permanentTypes } from "./layers.js";
import { protectionApplies } from "./protection.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { grantsControlWhenAttached } from "./controlAura.js";

/**
 * THE RESTRICTION GRANTS (2026-10-16). "Can't attack", "can't block" and "its activated abilities can't be activated" parse to
 * layer-6 grants of the cantAttack / cantBlock / activatedAbilitiesLocked pseudo-keywords (the Pacifism class — the PA-1 and
 * AU-2 arms of staticAbilityParser.parseAttachedClause), and auraCastIntent counted every keyword grant as a buff: the AI cast
 * Pacifism, Arrest and Prison Term on its OWN best creature. Each restricts the host, so alone (Pacifism) or beside a change
 * that hurts it (Crippling Blight's -1/-1) it is ENEMY; beside a buff (Undying Rage's +2/+2, Cagemail) it is that buff's
 * drawback and the buff decides, as before.
 */
const RESTRICTION_KEYWORDS = new Set(["cantAttack", "cantBlock", "activatedAbilitiesLocked"]);

/**
 * W7e (AI-F6) — which side should this Aura land on? Classified from parseAuraBonus — the SAME
 * parse the battlefield layer engine applies once the Aura attaches, so the AI's read of "what
 * this Aura does" can never disagree with what it WILL do. "own" = every granted descriptor is
 * beneficial (a non-negative P/T mod, a dynamic non-negative per-count mod, a keyword or
 * protection grant); "enemy" = every descriptor is harmful (a non-positive P/T mod, a keyword
 * removal, a restriction grant); null = HOLD — an empty parse (the bonus machinery couldn't model the grant), a
 * mixed +/- delta, a base-P/T set (could buff or shrink depending on the body), or any
 * mixed own/enemy combination. Mirrors atomTargetIntent's ambiguous→skip discipline (CREED:
 * never guess a side — a beneficial Aura on an enemy fatty is a live FP).
 * (Moved from opponentAI.js, 2026-10-16, so the non-cast entry reads the cast side's answer; the restriction grants are new.)
 */
export function auraCastIntent(card) {
  // ④-K CONTROL AURA (2026-09-03): "You control enchanted creature." steals the host — ENEMY-intent, whatever the
  // rest of the bonus says (Spirit Away's +2/+2 flying is a buff on a creature that is now OURS). Type-blind so a
  // bestow steal (Hypnotic Siren) reads the same. Before this, parseAuraBonus read [] for every control Aura (the
  // control line poisoned the parse) and the AI HELD Mind Control forever; once the bonus survives, a control Aura
  // with a positive bonus would have read as an OWN buff and been cast on the AI's own creature.
  if (grantsControlWhenAttached(card)) return "enemy";
  let bonus;
  try { bonus = parseAuraBonus(card); } catch { return null; }
  if (!Array.isArray(bonus) || bonus.length === 0) return null;
  let own = 0;
  let enemy = 0;
  for (const d of bonus) {
    const op = d?.op || {};
    if (op.layerOp === "ptModify") {
      const p = op.power || 0;
      const t = op.toughness || 0;
      if (p >= 0 && t >= 0) own++;
      else if (p <= 0 && t <= 0) enemy++;
      else return null;                                   // mixed +/- delta → ambiguous
    } else if (op.layerOp === "ptModifyDynamicCount") {
      if ((op.perPower || 0) >= 0 && (op.perToughness || 0) >= 0) own++;
      else return null;
    } else if (op.layerOp === "addKeyword" && RESTRICTION_KEYWORDS.has(op.keyword)) {
      continue;                                           // a restriction: a buff beside it decides, else it is a curse (below)
    } else if (op.layerOp === "addKeyword" || op.layerOp === "addProtection") {
      own++;
    } else if (op.layerOp === "removeKeyword") {
      enemy++;                                            // grounding a flyer — a soft curse
    } else {
      return null;                                        // base-P/T set / future ops → unevaluable
    }
  }
  if (own > 0 && enemy > 0) return null;
  return own > 0 ? "own" : "enemy";
}

/** The side a non-cast Aura entry aims for: "mana" for a mana Aura (Wild Growth), else the cast side's intent (null = unknown). */
export function auraEntryIntent(card) {
  return isNativeManaAura(card) ? "mana" : auraCastIntent(card);
}

/** Card types and subtypes after layer 4 (CR 613.1d), front face up — the same reads the cast enumeration and the SBA use. */
const isCreatureNow = (state, perm) => permanentIsCreature(state, perm.id);
const hasType = (state, perm, type) => permanentHasCardType(state, perm.id, type);
const hasSubtype = (state, perm, subtype) => permanentTypes(state, perm.id).subtypes.includes(subtype);

/**
 * One predicate per targetType auraEntryHostSpec can emit; a targetType without one is unmodeled (fail closed). The cast
 * enumeration's PERMANENT_PREDICATES / addCreatures read the same types, layer-aware.
 */
const ENTRY_HOST_PREDICATES = {
  creature: (state, perm) => isCreatureNow(state, perm),
  artifact: (state, perm) => hasType(state, perm, "Artifact"),
  creatureOrArtifact: (state, perm) => isCreatureNow(state, perm) || hasType(state, perm, "Artifact"),
  // CR 301.7 — a Vehicle is an artifact; uncrewed it is not a creature, and it is still a legal host.
  creatureOrVehicle: (state, perm) => isCreatureNow(state, perm) || (hasType(state, perm, "Artifact") && hasSubtype(state, perm, "Vehicle")),
  nonlandPermanent: (state, perm) => !hasType(state, perm, "Land"),
  creatureOrPlaneswalker: (state, perm) => isCreatureNow(state, perm) || hasType(state, perm, "Planeswalker"),
  artifactCreatureOrPlaneswalker: (state, perm) => hasType(state, perm, "Artifact") || isCreatureNow(state, perm) || hasType(state, perm, "Planeswalker"),
  land: (state, perm) => hasType(state, perm, "Land"),
  forest: (state, perm) => hasType(state, perm, "Land") && hasSubtype(state, perm, "Forest"),
  permanent: () => true,
};

const oracleOf = (card) => String(card?.oracle ?? card?.oracle_text ?? "");

// A protection quality layers.permanentProtectionColors does not read (protection.js reads colours and the "creatures" class).
// Any of these could forbid an Aura (CR 702.16c), so a permanent that prints one is never chosen.
const UNREAD_PROTECTION_RE = /protection from (?:everything|enchantments?|auras?|multicolored|monocolored|colorless|the chosen colou?r|the colou?r|any colou?r|a colou?r|each colou?r among|the chosen card name)/i;
const CANT_BE_ENCHANTED_RE = /can['’]t be enchanted/i;

/**
 * "Can't be enchanted", read wherever it can sit: the permanent's own text, an Aura on it ("Enchanted creature … can't be
 * enchanted by other Auras" — Anti-Magic Aura, Consecrate Land), or a static of its controller's that covers permanents they
 * control (Guardian Beast's "noncreature artifacts you control can't be enchanted"). Read broadly on purpose: a permanent this
 * keeps out wrongly is a missed host, never an illegal attachment.
 */
function cantBeEnchanted(state, perm, controller) {
  if (CANT_BE_ENCHANTED_RE.test(oracleOf(perm.card))) return true;
  for (const id of perm.attachments || []) {
    if (CANT_BE_ENCHANTED_RE.test(oracleOf(findPermanent(state, id)?.permanent?.card))) return true;
  }
  return (state.players?.[controller]?.battlefield || []).some((p) => /you control can['’]t be enchanted/i.test(oracleOf(p.card)));
}

/**
 * The permanents `auraCard` may enchant entering the battlefield under `controller` without being cast (CR 303.4f), on the board
 * `state`, as `[{ id, controller }]` in battlefield order — or null when its Enchant line is one the engine can't enumerate.
 * The host options are the EFFECT's own limits on what the Aura may enchant ("any other applicable effects", CR 303.4f); they
 * only ever narrow the list:
 *   · onlyCreatures — "Only creatures can be enchanted this way" (Retether): the host must be a creature as well, read
 *     layer-aware, so an animated land is one (the bundled Retether ruling's own example).
 */
export function auraEntryHosts(state, auraCard, controller, { onlyCreatures = false } = {}) {
  const spec = auraEntryHostSpec(auraCard);
  const pred = spec ? ENTRY_HOST_PREDICATES[spec.targetType] : null;
  if (!pred) return null;
  const auraColors = colorsOf(auraCard);
  const out = [];
  for (const pid of Object.keys(state.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      if (!pred(state, perm)) continue;
      if (onlyCreatures && !isCreatureNow(state, perm)) continue;
      if ((spec.restrictions || []).length && !creatureSatisfiesRestrictions(state, perm, pid, controller, spec.restrictions)) continue;
      if (protectionApplies(permanentProtectionColors(state, perm.id), auraColors)) continue; // CR 702.16c
      if (UNREAD_PROTECTION_RE.test(oracleOf(perm.card))) continue;
      if (cantBeEnchanted(state, perm, pid)) continue;
      out.push({ id: perm.id, controller: pid });
    }
  }
  return out;
}

/** Mana Auras already on a land (the stacking rule — Colton 2026-10-03). */
function manaAurasOn(state, landId) {
  const land = findPermanent(state, landId)?.permanent;
  return (land?.attachments || []).filter((id) => isNativeManaAura(findPermanent(state, id)?.permanent?.card)).length;
}

/**
 * The house policy's score for putting `auraCard` (entering under `controller`) on `host` ({ id, controller }) — higher is
 * better; the flicker policy compares an Aura's current host with where it would return by the same numbers. On the side the
 * Aura wants, the host's power (a non-creature host 0; for a mana Aura, the mana Auras already on that land); on the other side,
 * always below every wanted host, the less harm the better. An unknown intent wants `sideHint` ("own" / "enemy" — a blinked
 * Aura's side before it left: its controller put it there), else its controller's side — two in three of the Auras whose side the
 * reading can't tell help their host (Curiosity, Bear Umbra, Angelic Destiny; the others hurt it — Darksteel Mutation, Lignify).
 */
export function auraEntryHostScore(state, auraCard, controller, host, { intent = auraEntryIntent(auraCard), sideHint = null } = {}) {
  const ownSide = host.controller === controller;
  if (intent === "mana") return ownSide ? manaAurasOn(state, host.id) : -1;
  const power = permanentIsCreature(state, host.id) ? Math.max(0, permanentPower(state, host.id) || 0) : 0;
  const wantsOwn = intent ? intent !== "enemy" : sideHint !== "enemy";
  return ownSide === wantsOwn ? power : -power - 1;
}

/**
 * The CR 303.4f choice: `{ modeled, hostId, score, intent }`. `modeled` false — the Enchant line is one the engine can't list,
 * so the caller leaves the Aura where it is; `hostId` null with `modeled` true — no legal host (CR 303.4g). Among equal scores
 * the lowest permanent id, so the choice is deterministic. Every option but `sideHint` is a host option of auraEntryHosts above.
 */
export function chooseAuraEntryHost(state, auraCard, controller, { sideHint = null, ...hostOpts } = {}) {
  const hosts = auraEntryHosts(state, auraCard, controller, hostOpts);
  const intent = auraEntryIntent(auraCard);
  if (!hosts) return { modeled: false, hostId: null, score: null, intent };
  let best = null;
  let bestScore = -Infinity;
  for (const h of hosts) {
    const s = auraEntryHostScore(state, auraCard, controller, h, { intent, sideHint });
    if (s > bestScore || (s === bestScore && String(h.id) < String(best.id))) { best = h; bestScore = s; }
  }
  return { modeled: true, hostId: best ? best.id : null, score: best ? bestScore : null, intent };
}
