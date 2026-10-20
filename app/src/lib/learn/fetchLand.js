/**
 * fetchLand.js — THE FETCH LANDS, as the AI plays them (2026-10-17), and the colour the AI's lands are for.
 *
 * A FETCH LAND here is a land whose activated ability is
 *     "{T}, [Pay N life,] Sacrifice this land: Search your library for a … land card, put it onto the battlefield [tapped],
 *      then shuffle."
 * — Evolving Wilds, Terramorphic Expanse, Fabled Passage, Prismatic Vista, the Zendikar / Onslaught fetches ("a Swamp or Forest
 * card", 1 life), the Mirage fetches, Escape Tunnel, Hobbit Hole, Vibrant Cityscape, the MH3 Landscapes. Read off the PARSED
 * ability — the one legalChoices offers and the dispatcher resolves — never off the printed text: no mana in the cost, no cost
 * but the tap, the sacrifice and an optional life payment, and a program that is exactly one search for ONE card whose every
 * filter group names a land, to the battlefield. Everything else that sacrifices its source (Sakura-Tribe Elder, Mind Stone,
 * Terminal Moraine's "{2}, {T}, Sacrifice"-fetch, the Panoramas, Myriad Landscape) is outside it and stays skipped by the generic
 * activation picker.
 *
 * Nothing here decides legality: the engine offers the activation (CR 602.2 — whenever its controller holds priority since
 * 2026-10-20; the AI cracks in its own main phase only), pays the costs (CR 118.3, 119.4; the sacrifice, CR 701.21a) and runs the search (CR 701.23a). This module only
 * answers AI questions — is this offered activation a fetch land's, what a fetch land in hand would fetch, and which of a land
 * search's candidates the AI takes (every search for a land card, not only a fetch's) — and owns the one colour-need reader and
 * the one land-search order the AI's land drop and its searches share (ENGINE-SCAFFOLD §6: a judgement implemented in one place).
 *
 * A leaf over the parser, the mana model and the tutor filter (none of them imports an AI module): opponentAI and runProgram both
 * import it without a cycle.
 */
import { parseActivatedAbilities } from "./effects/abilities.js";
import { cardMatchesTutorFilter, tutorManaValue } from "./effects/atoms/library.js";
import { findPermanent } from "./gameState.js";
import { manaProduction } from "./manaModel.js";

const COLOURS = ["W", "U", "B", "R", "G"];

/**
 * Colored pips in a mana cost string ({W}{U}{B}{R}{G}; each half of a hybrid pip counts as needing that color — a
 * payable-either-way pip is a soft need).
 */
function coloredPips(mana) {
  const out = [];
  for (const m of String(mana || "").matchAll(/\{([^}]+)\}/g)) {
    for (const ch of m[1].toUpperCase()) if ("WUBRG".includes(ch)) out.push(ch);
  }
  return out;
}

/**
 * THE COLOUR NEED of a player's lands: `producible` — every colour a permanent on its battlefield makes (tapped or not; the
 * question is "do I own a source of this colour at all", read through `manaProduction`, the shared mana gate); `pips` — the
 * coloured pips of the cards in its hand and command zone, per colour; `needed` — the colours among those pips no battlefield
 * source makes. The land drop ranks by `needed`; the fetch's search by `pips` behind it.
 */
export function colourNeed(state, playerId) {
  const player = state?.players?.[playerId];
  const producible = new Set();
  for (const perm of player?.battlefield || []) {
    for (const c of manaProduction(perm?.card)?.colors || []) producible.add(c);
  }
  const needed = new Set();
  const pips = Object.fromEntries(COLOURS.map((c) => [c, 0]));
  for (const card of [...(player?.hand || []), ...(player?.command || [])]) {
    for (const pip of coloredPips(card?.mana || card?.mana_cost)) {
      pips[pip] += 1;
      if (!producible.has(pip)) needed.add(pip);
    }
  }
  return { producible, needed, pips };
}

const LAND_WORDS = new Set(["land", "plains", "island", "swamp", "mountain", "forest"]);
const FILTER_WORDS = new Set([...LAND_WORDS, "basic"]);
// The only fields a fetch's search atom carries (Evolving Wilds: op, filter, filterLabel, destination, entersTapped, targetType).
// Any other field with a value — a count, a second destination, a grant, a searcher, a hand zone — is a different search.
const FETCH_ATOM_FIELDS = new Set(["op", "filter", "filterLabel", "destination", "entersTapped", "targetType", "remaining"]);

/**
 * The search atom of a fetch land's program, or null: one non-modal atom, a library search for ONE card to the battlefield,
 * every filter group naming a land ("basic land", "Swamp", "basic Forest").
 */
function fetchSearchAtom(program) {
  if (!program || program.structure === "modal" || program.modal) return null;
  const atoms = program.atoms || [];
  if (atoms.length !== 1) return null;
  const t = atoms[0];
  if (t?.op !== "tutor" || t.destination !== "battlefield" || (t.remaining ?? 1) !== 1 || t.targetType) return null;
  if (Object.entries(t).some(([k, v]) => !FETCH_ATOM_FIELDS.has(k) && v != null && v !== false)) return null;
  const filter = t.filter;
  const groups = filter?.groups || [];
  if (!groups.length || Object.keys(filter).some((k) => k !== "groups")) return null;
  if (!groups.every((g) => g.length && g.every((w) => FILTER_WORDS.has(w)) && g.some((w) => LAND_WORDS.has(w)))) return null;
  return t;
}

const frontTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];
const isLandFront = (card) => /\bLand\b/.test(frontTypeLine(card));

/**
 * The parsed fetch ability of a land card, or null (see the file note for the shape). Its program's one atom is the search
 * (`ability.program.atoms[0]`); `ability.payLife` is its life cost. The land drop reads a fetch land in hand through it.
 */
export function fetchLandAbility(card) {
  if (!isLandFront(card)) return null;
  for (const ab of parseActivatedAbilities(card)) {
    if (!ab.modeled || ab.costModeled === false || !ab.tapSelf || !ab.sacSelf || ab.manaPips || ab.needsTarget) continue;
    if (ab.sacOther || ab.sacCount || ab.sacX || ab.costX || ab.exileSelf || ab.removeCounter || ab.putCounter || ab.tapCreature || ab.discardCard
      || ab.exileGyCount || ab.discardCardFilter || ab.discardRandom || ab.returnLand || ab.unattachEquipment || ab.payEnergy
      || ab.payLifeCommanderColors || ab.condition || ab.activationLimit) continue;
    if (fetchSearchAtom(ab.program)) return ab;
  }
  return null;
}

const costHasMana = (cost) => !!cost && (cost.hasX || (cost.hybrid?.length || 0) > 0 || (cost.phyrexian?.length || 0) > 0
  || ["generic", "W", "U", "B", "R", "G", "C", "anyColor", "snow"].some((k) => (cost[k] || 0) > 0));

/**
 * The search atom when an OFFERED action is a fetch land's crack, else null: an activate-ability of a land on the battlefield
 * that taps and sacrifices it, costs no mana and nothing else but life, targets nothing, and runs a fetch's search.
 */
export function fetchCrackAtom(state, action) {
  if (action?.kind !== "activate-ability" || !action.sacSelf || !action.tapSelf) return null;
  if ((action.cmc || 0) !== 0 || costHasMana(action.cost)) return null;
  if (action.exileSelf || action.sacCreatureId || (action.sacCountIds?.length) || action.removeCounter || action.putCounter || action.tapCreatureId
    || (action.tapCountIds?.length) || (action.tapIds?.length) || action.returnLandId || action.unattachEquipmentId || action.discardCardId
    || (action.discardIds?.length) || (action.exileGyIds?.length) || (action.payEnergy || 0) > 0 || action.xValue != null
    || action.chosenMode != null || (action.targets?.length || 0) > 0) return null;
  const perm = findPermanent(state, action.permanentId)?.permanent;
  if (!perm || !isLandFront(perm.card)) return null;
  return fetchSearchAtom(action.program);
}

/** The cards in `playerId`'s library the fetch's search can find (the filter the search itself applies). */
export function fetchableLands(state, playerId, atom) {
  return (state?.players?.[playerId]?.library || []).filter((c) => cardMatchesTutorFilter(c, atom.filter, state, playerId));
}

/**
 * Is this pending search a search for a LAND card? A library search (a tutor-search choice; Demonic Consultation's name pick is
 * not one) whose every filter alternative names a land — "a basic land card", "a Forest card", "a Plains, Island, Swamp, or
 * Mountain card", "a snow land card", "a land card" — and whose card goes to the battlefield, the hand or the top of the library
 * (where its colour is what it is for). The searcher's own library: the auto-pick reads the choice controller's zones. A search
 * with any alternative that is not a land ("a creature or land card"), no filter at all ("a card") or a graveyard destination
 * answers false, and its pick keeps the old order; so does a land put from the HAND (Growth Spiral, Uro — the same choice kind,
 * but no search).
 */
function isLandSearch(pc) {
  if (pc?.kind !== "tutor-search" || pc.consultation || pc.destination === "graveyard") return false;
  const zones = Array.isArray(pc.sourceZones) && pc.sourceZones.length ? pc.sourceZones : [pc.sourceZone || "library"];
  if (!zones.some((z) => z === "library" || z === "libraryTop")) return false;
  const groups = pc.filter?.groups || [];
  return groups.length > 0 && groups.every((g) => Array.isArray(g) && g.some((w) => LAND_WORDS.has(w)));
}

/**
 * THE COLOUR A LAND IS FOR. A score per land card (higher = take it first): the pips of the hand and command zone in the colours
 * it makes that no battlefield source makes, then all their pips in those colours — a dual that makes both unmet colours
 * outranks either basic, and with every colour already made it takes the colour the hand asks for most.
 */
function colourScore(state, playerId) {
  const need = colourNeed(state, playerId);
  return (card) => {
    let unmet = 0;
    let asked = 0;
    for (const c of new Set(manaProduction(card)?.colors || [])) {
      if (!(c in need.pips)) continue;
      asked += need.pips[c];
      if (need.needed.has(c)) unmet += need.pips[c];
    }
    return unmet * 1000 + asked;
  };
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * THE ORDER A LAND SEARCH TAKES ITS CANDIDATES IN, for `playerId` searching its own library: the colour score above, then the
 * auto-pick's old order (highest mana value, then name, then id — locale-free, serialize-stable). One comparator, read by the
 * search as it resolves (runProgram.autoPickTutorCandidate) and by the land drop predicting what a fetch land in hand would
 * fetch (opponentAI.pickLandAction), so the two can't disagree.
 */
export function landSearchOrder(state, playerId) {
  const score = colourScore(state, playerId);
  return (a, b) => (score(b) - score(a))
    || tutorManaValue(b) - tutorManaValue(a)
    || cmpStr(String(a.name || ""), String(b.name || ""))
    || cmpStr(String(a.id || ""), String(b.id || ""));
}

/**
 * THE LAND SEARCH'S PICK (2026-10-17 — first a fetch land's own search; now every search for a land card the AI makes for itself:
 * Rampant Growth, Cultivate and Kodama's Reach — each pick read afresh, so the one to the battlefield takes the colour most needed
 * and the one to the hand the next —, Farseek, Nature's Lore, Three Visits, Sakura-Tribe Elder, Wood Elves, the SNC family's
 * enters trigger, a fetch land's crack). The order its candidates are taken in (landSearchOrder); null for every other search,
 * whose auto-pick keeps the old order. Read as the search resolves (a fetch land is already gone from the battlefield).
 */
export function landSearchPickOrder(state, pc) {
  return isLandSearch(pc) ? landSearchOrder(state, pc.controller) : null;
}
