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
 * least-harmful one. A seat a person plays is asked instead (enteringAuraHost, below).
 *
 * LEAF: staticAbilityParser, layers, protection, creatureRestrictions, controlAura, gameState and auraPrintedSide (which imports only
 * faceUp and staticAbilityParser) — every one of them is reachable from effects/atoms/zones.js, and none imports an atoms module or
 * the AI.
 */
import { findPermanent } from "./gameState.js";
import { abilityClauses, auraEntryHostSpec, isAttachedNoUntapLine, isNativeManaAura, parseAuraBonus } from "./staticAbilityParser.js";
import { colorsOf, permanentHasCardType, permanentIsCreature, permanentPower, permanentProtectionColors, permanentTypes } from "./layers.js";
import { protectionApplies } from "./protection.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { grantsControlWhenAttached } from "./controlAura.js";
import { printedAuraSide } from "./auraPrintedSide.js"; // where the bonus parse reads no side, the printed text's clause-by-clause reading

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
 * THE UNTAP LOCK (2026-10-17). "Enchanted creature/permanent/artifact doesn't untap during its controller's untap step" keeps the
 * host from untapping in the untap step (CR 502.3). gameState.untapAll enforces it off the attachment and parseAttachedBonus skips
 * the line (it is no layer bonus), so the bonus below saw nothing and the AI held Ice Over, Coma Veil and Claustrophobia forever.
 * It restricts the host, so it is a curse — read only when it is the whole card: every line is the Enchant line, Flash, the lock,
 * or "When this Aura enters, tap enchanted creature/permanent." (Claustrophobia: the tap makes the lock bite at once). A lock
 * printed with anything else — a buff on the same line (Leaden Fists' +3/+3), an enters draw (Eternity Snare), an untap ability
 * granted to the host, an upkeep escape — keeps the old answer (null: hold), never a guess.
 */
const ENTERS_TAP_ENCHANTED_RE = /^when this aura enters, tap enchanted (?:creature|permanent)\.$/i;
function isUntapLockAura(card) {
  const lines = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  let lock = false;
  for (const line of lines) {
    if (isAttachedNoUntapLine(line)) { lock = true; continue; }
    if (/^enchant [^.]+$/i.test(line) || /^flash$/i.test(line) || ENTERS_TAP_ENCHANTED_RE.test(line)) continue;
    return false;
  }
  return lock;
}

/**
 * W7e (AI-F6) — which side should this Aura land on? Classified from parseAuraBonus — the SAME
 * parse the battlefield layer engine applies once the Aura attaches, so the AI's read of "what
 * this Aura does" can never disagree with what it WILL do. "own" = every granted descriptor is
 * beneficial (a non-negative P/T mod, a dynamic non-negative per-count mod, a keyword or
 * protection grant); "enemy" = every descriptor is harmful (a non-positive P/T mod, a keyword
 * removal, a restriction grant); null = HOLD — an empty parse (the bonus machinery couldn't model the grant), a
 * mixed +/- delta, a base-P/T set (could buff or shrink depending on the body), or any
 * mixed own/enemy combination; an untap-lock Aura (isUntapLockAura) is "enemy". Mirrors atomTargetIntent's ambiguous→skip discipline (CREED:
 * never guess a side — a beneficial Aura on an enemy fatty is a live FP).
 * (Moved from opponentAI.js, 2026-10-16, so the non-cast entry reads the cast side's answer; the restriction grants are new.)
 * THE PRINTED READING (2026-10-17): where the bonus parse reads no side — empty (one unmodeled line about the host poisons it),
 * mixed, or an op it can't weigh — the printed text decides, clause by clause (auraPrintedSide.printedAuraSide: each sentence
 * helps the host, hurts it, is the Aura's own business, or is unreadable; their consensus, else null). Angelic Destiny reads
 * own, Darksteel Mutation enemy, Psychic Impetus (+2/+2 beside goad) still holds. Unmodeled text stays inert at runtime: this
 * moves only where the AI casts an Aura, whether it does, and where a non-cast entry puts it.
 */
export function auraCastIntent(card) {
  // ④-K CONTROL AURA (2026-09-03): "You control enchanted creature." steals the host — ENEMY-intent, whatever the
  // rest of the bonus says (Spirit Away's +2/+2 flying is a buff on a creature that is now OURS). Type-blind so a
  // bestow steal (Hypnotic Siren) reads the same. Before this, parseAuraBonus read [] for every control Aura (the
  // control line poisoned the parse) and the AI HELD Mind Control forever; once the bonus survives, a control Aura
  // with a positive bonus would have read as an OWN buff and been cast on the AI's own creature.
  if (grantsControlWhenAttached(card)) return "enemy";
  if (isUntapLockAura(card)) return "enemy"; // the untap lock alone (above) — the curse lane, like Pacifism's restriction grants
  return bonusSide(card) ?? printedAuraSide(card);
}

/** The side parseAuraBonus's descriptors read (see auraCastIntent), or null where they read none. */
function bonusSide(card) {
  // No try/catch: parseAuraBonus throws for none of the 1,297 bundled Aura faces (probed 2026-10-17), and a throw here
  // would be a parser bug to surface, not a card to quietly hold (CLAUDE.md §1.2 — never hide errors).
  const bonus = parseAuraBonus(card);
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
const frontTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];
/**
 * Is `card` a Role (CR 303.7 — an Aura with the subtype Role), read off its front face? The one reading of "a Role" for the
 * entry choice below, the token copy (tokens.applyCreateTokenCopy) and the CR 704.5y state-based check (sba.js).
 */
export const isRoleCard = (card) => /\bRole\b/.test(frontTypeLine(card));
/** Does `perm` already carry a Role (CR 303.7) that `controller` controls? */
const carriesRoleOf = (state, perm, controller) => (perm.attachments || []).some((id) => {
  const a = findPermanent(state, id);
  return a?.controller === controller && isRoleCard(a.permanent?.card);
});

// A protection quality layers.permanentProtectionColors does not read (protection.js reads colours and the "creatures" class).
// Any of these could forbid an Aura (CR 702.16c), so a permanent that prints one is never chosen.
const UNREAD_PROTECTION_RE = /protection from (?:everything|enchantments?|auras?|the chosen colou?r|the colou?r|any colou?r|a colou?r|each colou?r among|the chosen card name)/i;
// The three colour-count qualities are read exactly against the Aura's colours (CR 105.2a, 105.2b, 105.2c, 2026-10-17): protection
// from multicolored keeps out only a multicolored Aura — Stonecoil Serpent may wear mono-blue Curiosity — monocolored only a
// monocolored one, colorless only a colorless one.
const COLOUR_COUNT_PROTECTION = [
  [/protection from multicolored/i, (n) => n >= 2],
  [/protection from monocolored/i, (n) => n === 1],
  [/protection from colorless/i, (n) => n === 0],
];
// Protection GRANTED to something else is not this permanent's own (2026-10-17): a target (Mother of Runes, Giver of Runes), the
// player (The One Ring's "you gain protection from everything"), the host of an Aura or Equipment (Benevolent Blessing's
// "Enchanted creature has …"), "other creatures you control". Such a mention is masked before the reading; every other one —
// "this creature has", "creatures you control have", a condition, a keyword line — still keeps the permanent out.
const PROTECTION_GRANTED_ELSEWHERE_RE = /((?:\b(?:another )?target [a-z ]+?|(?:^|[,;:]\s*)you|\benchanted (?:creature|permanent|artifact|land|enchantment|planeswalker)|\bequipped creature|\bother creatures you control)\s+(?:gains?|has|have)\s+)protection from/gi;
const CANT_BE_ENCHANTED_RE = /can['’]t be enchanted/i;

/** Does `perm`'s own printed text give it a protection that would keep `auraCard` out (CR 702.16b, 702.16c)? Fails closed. */
function printedProtectionKeepsOut(perm, auraCard) {
  const n = colorsOf(auraCard).length;
  return abilityClauses(oracleOf(perm.card)).some((clause) => {
    const own = clause.replace(PROTECTION_GRANTED_ELSEWHERE_RE, "$1shielding from");
    return UNREAD_PROTECTION_RE.test(own) || COLOUR_COUNT_PROTECTION.some(([re, applies]) => re.test(own) && applies(n));
  });
}

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
 * May `auraCard` be attached to `perm` (controlled by `pid`) at all, as far as the engine can tell? Protection from a colour the
 * Aura is (CR 702.16c), protection from a quality the layer engine doesn't read, and an effect that says the permanent can't be
 * enchanted each keep it out (CR 303.4 — "Other effects can limit what a permanent can be enchanted by"). Fails closed. Read
 * by the entry choice below, by every Aura cast lane (auraSpellHost.enchantableHosts — the body-only lane since 2026-10-17's
 * first slice, the native, Ordeal, bestow, mana-boost and granted-ability lanes since its second) and by AURA_ETB's resolution
 * re-check. Since the second, the printed protection is the permanent's OWN (one granted to a target, the player or a host is
 * not — Mother of Runes, The One Ring) and multicolored / monocolored / colorless are read against the Aura's colours: before,
 * any mention kept the permanent out, so widening this to the native lanes would have withdrawn legal casts.
 */
export function mayBeEnchantedBy(state, perm, pid, auraCard) {
  if (protectionApplies(permanentProtectionColors(state, perm.id), colorsOf(auraCard))) return false; // CR 702.16c
  if (printedProtectionKeepsOut(perm, auraCard)) return false;
  return !cantBeEnchanted(state, perm, pid);
}

/**
 * The permanents `auraCard` may enchant entering the battlefield under `controller` without being cast (CR 303.4f), on the board
 * `state`, as `[{ id, controller }]` in battlefield order — or null when its Enchant line is one the engine can't enumerate.
 * The host options are the EFFECT's own limits on what the Aura may enchant ("any other applicable effects", CR 303.4f); they
 * only ever narrow the list:
 *   · onlyCreatures — "Only creatures can be enchanted this way" (Retether): the host must be a creature as well, read
 *     layer-aware, so an animated land is one (the bundled Retether ruling's own example).
 *   · excludeIds — permanents an earlier Aura of the same event already took, when that would be wrong to share (a Role).
 *   · presentIds — the permanents on the battlefield when the event that returns the Aura happened; only those may be chosen.
 *     A detainer's return (CR 610.3) is simultaneous with every other return its leave event set off (CR 610.3d), but the
 *     engine runs each as its own trigger, so a card another detainer returned is already on the battlefield — and an Aura
 *     can't enter attached to a permanent entering at the same time.
 * A ROLE (CR 303.7) never chooses a permanent that already carries a Role its controller controls: CR 704.5y (sba.js) would put
 * the older of the two into its owner's graveyard at the next check, so the pick never spends a Role that way. The rules allow
 * that choice, so this list is narrower than CR 303.4f's — a missed host (and, for a token with no other host, a token not
 * created), never an illegal attachment.
 */
export function auraEntryHosts(state, auraCard, controller, { onlyCreatures = false, excludeIds = null, presentIds = null } = {}) {
  const spec = auraEntryHostSpec(auraCard);
  const pred = spec ? ENTRY_HOST_PREDICATES[spec.targetType] : null;
  if (!pred) return null;
  const isRole = isRoleCard(auraCard);
  const out = [];
  for (const pid of Object.keys(state.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      if (!pred(state, perm)) continue;
      if (onlyCreatures && !isCreatureNow(state, perm)) continue;
      if (excludeIds && excludeIds.includes(perm.id)) continue;
      if (presentIds && !presentIds.includes(perm.id)) continue;
      if (isRole && carriesRoleOf(state, perm, controller)) continue;
      if ((spec.restrictions || []).length && !creatureSatisfiesRestrictions(state, perm, pid, controller, spec.restrictions)) continue;
      if (!mayBeEnchantedBy(state, perm, pid, auraCard)) continue;
      out.push({ id: perm.id, controller: pid });
    }
  }
  return out;
}

/**
 * Would `auraCard`, entering under `controller` on the board `state`, have something to enchant (its Enchant line listable and a
 * legal host on it)? An offer that would otherwise put an Aura nowhere reads this — the battlefield tutor's candidates, for one —
 * with the same host options its entry will pass.
 */
export function auraEntryHasHost(state, auraCard, controller, hostOpts = {}) {
  return (auraEntryHosts(state, auraCard, controller, hostOpts) || []).length > 0;
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
 * Aura's side before it left: its controller put it there), else its controller's side — most Auras help their host (since
 * 2026-10-17 the printed reading tells Angelic Destiny from Darksteel Mutation; what it can't tell is mixed or unreadable — Leaden
 * Fists, Pariah).
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

/**
 * A PERSON CHOOSES (2026-10-16). CR 303.4f makes the player the Aura enters under the chooser, and a seat a person plays makes
 * the choice itself, through the aura-entry-host pause (pendingChoice.js). No caller of the entry handles that pause. The step
 * that puts the Aura onto the battlefield runs inside an ASK — an effect's atom (effects/runProgram.resolveAtomAsking) or a
 * settle that enters a card (learnSession.settleAskingAuraHost) — and enteringAuraHost, meeting a person's Aura with two or more
 * legal hosts and no answer, records the question and lets the step finish on the house pick. The ask throws that run away and
 * pauses on the state the step began from; the answer re-runs the step with the host recorded. One question at a time, in entry
 * order, so an event that returns several of a person's Auras (Brago, King Eternal) asks for each in turn and then happens once,
 * every choice made on the board as the event began. The re-run is exact because the engine is: ids come from state.idSeq,
 * shuffles from state.rngSeed, and an entry never mutates the state it is given.
 *
 * Who is a person: `state.humanSeats`, stamped by learnSession.createLearnSession below Expert (the seats its driver pauses for).
 * No self-play game and no Expert game carries it, and outside an ask every caller gets the house pick, so every seat the AI
 * plays takes the path it took before.
 */
let openAsk = null;

/** Does a person make `seat`'s choices? */
export function seatIsHuman(state, seat) {
  return Array.isArray(state?.humanSeats) && state.humanSeats.includes(seat);
}

/**
 * Run `step` (a function returning a state) inside an ask holding the `answers` already given (Aura card id → host permanent id).
 * Returns `{ state, question }` — the question for the first of a person's Auras that entered without an answer, or null. An ask
 * opened inside another passes through: the outermost owns the question, and its step is the one that re-runs.
 */
export function withAuraEntryAsk(answers, step) {
  if (openAsk) return { state: step(), question: null };
  openAsk = { answers: answers || {}, question: null };
  try {
    const state = step();
    return { state, question: openAsk.question };
  } finally {
    openAsk = null;
  }
}

/**
 * The host an Aura entering under `controller` really takes — what every REAL entry asks (enterCardFromZone; an effect that makes
 * the Aura enter by another road, a token copy or a clone, the same). The house pick (chooseAuraEntryHost), except for a person's
 * seat inside an ask: their answer once given, else the question is recorded and the house pick stands in until the ask throws
 * the run away. One legal host is no choice, and none leaves the Aura where it is (CR 303.4g). A simulation (the AI's flicker
 * gain, gameEngine.pickFlickerCandidate) reads chooseAuraEntryHost, which never asks.
 */
export function enteringAuraHost(state, auraCard, controller, opts = {}) {
  const policy = chooseAuraEntryHost(state, auraCard, controller, opts);
  if (!openAsk || !policy.hostId || !seatIsHuman(state, controller)) return policy;
  const hosts = auraEntryHosts(state, auraCard, controller, opts) || [];
  if (hosts.length < 2) return policy;
  const answer = hosts.find((h) => h.id === openAsk.answers[auraCard?.id]);
  if (answer) return { ...policy, hostId: answer.id, score: auraEntryHostScore(state, auraCard, controller, answer, { intent: policy.intent, sideHint: opts.sideHint ?? null }) };
  if (!openAsk.question) {
    openAsk.question = {
      controller,
      cardId: auraCard?.id ?? null,
      cardName: auraCard?.name ?? null,
      suggestedId: policy.hostId,
      // A face-down permanent's card is the nameless 2/2 (CR 708.2), so its name never leaks onto the panel.
      candidates: hosts.map((h) => {
        const perm = findPermanent(state, h.id)?.permanent;
        return { id: h.id, name: perm?.card?.name || (perm?.faceDown ? "Face-down creature" : "a permanent"), controller: h.controller };
      }),
    };
  }
  return policy;
}
