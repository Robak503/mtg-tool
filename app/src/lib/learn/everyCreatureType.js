/**
 * everyCreatureType.js — EVERY CREATURE TYPE OFF THE BATTLEFIELD: the zone half of the question every creature-type reader asks
 * (the play-weighted program, P·39b — Maskwood Nexus, EDHREC #490).
 *
 * Two things make an object every creature type:
 *   · CHANGELING (CR 702.73a) — the object's own characteristic-defining ability, working in every zone. Read with
 *     keywords.hasKeyword, which reads the keyword ABILITY — never a bare /changeling/ match on the oracle, which also hits a
 *     card that only MAKES changeling tokens (Belonging, Springleaf Parade) or mentions one (Maskwood Nexus itself).
 *   · a GRANT from a permanent its holder controls — Maskwood Nexus: "Creatures you control are every creature type. The same
 *     is true for creature spells you control and creature cards you own that aren't on the battlefield." A static ability
 *     (CR 604.1) applies at any moment to whatever its text indicates (CR 611.3a). Its first sentence is a layer-4 effect on the
 *     battlefield (staticAbilityParser's allCreatureTypes arm → layers.permIsEveryCreatureType); this module is its second
 *     sentence: the controller's creature SPELLS and the creature CARDS they own in every other zone. Only a creature takes a
 *     creature type (CR 205.3d), so a Kindred noncreature spell or card stays as printed.
 *
 * A battlefield permanent asks layers.permIsEveryCreatureType; a spell on the stack or a card in a hand, library, graveyard,
 * exile or the command zone asks cardIsEveryCreatureType here, with its holder: the spell's controller, the card's owner.
 *
 * A LEAF on purpose (the creatureTypes.js lesson — an import edge alone can reorder module init and crash it): the trigger
 * matchers, the cost readers, the tutors and the graveyard filters all read it, so it imports only the keyword leaf. The grant
 * scan is a plain board read of each permanent's printed oracle (a face-down permanent's card has none), memoized per state.
 */
import { hasKeyword } from "./keywords.js";

const GRANT_RE = /^creatures you control are every creature type\. the same is true for creature spells you control and creature cards you own that aren't on the battlefield\.$/;

/** Does this card print the grant (Maskwood Nexus)? The exact two sentences, on a line of their own. */
export function grantsEveryCreatureType(card) {
  return String(card?.oracle || card?.oracle_text || "").toLowerCase().replace(/’/g, "'").split("\n").some((l) => GRANT_RE.test(l.trim()));
}

const _holderMemo = new WeakMap();
/** The players who control a granting permanent right now. */
function grantHolders(state) {
  let holders = _holderMemo.get(state);
  if (holders) return holders;
  holders = new Set();
  for (const p of Object.values(state?.players || {})) {
    for (const perm of p.battlefield || []) if (grantsEveryCreatureType(perm.card)) holders.add(perm.controller);
  }
  _holderMemo.set(state, holders);
  return holders;
}

/** A spell or a card off the battlefield: changeling, or a creature whose holder has the grant. The caller names the holder:
 *  a spell's CONTROLLER ("creature spells you control" — a creature cast from an opponent's graveyard is yours to have), a
 *  card's OWNER — the player whose hand, library, graveyard or exile holds it (the engine files every card under its owner:
 *  moveCardToZone moves within one player's zones, a battlefield exit is routed to the owner's — CR 400.3 — and an exile of
 *  another player's card goes to that player's exile, as Etali's does). */
export function cardIsEveryCreatureType(state, card, holderId) {
  if (!card) return false;
  if (hasKeyword(card, "changeling")) return true;
  if (!state || !grantHolders(state).has(holderId)) return false;
  return /\bCreature\b/.test(String(card.type || card.type_line || "").split(" // ")[0]);
}
