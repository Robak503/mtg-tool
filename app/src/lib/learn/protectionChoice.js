/**
 * protectionChoice.js — "protection from the color of your choice" (Mother of Runes, Giver of Runes, Benevolent Bodyguard,
 * Gods Willing, Shelter …; CR 702.16).
 *
 * WHO CHOOSES, AND WHEN. The colour is not chosen as the ability is activated or the spell is cast: it is a choice the effect
 * offers, so the controller of the spell or ability announces it while applying the effect, as it resolves (CR 608.2d). By then
 * the spells and abilities it answers are on the stack below it — the colour is chosen knowing them.
 *
 * ONE PICK FOR EVERY CALLER. The automatic chooser (protectionColorPick) is what an AI seat takes as the grant resolves
 * (effects/atoms/combat.applyGrantProtection), what the AI previews when it decides whether the grant would save its permanent
 * (opponentAI.pickSaveInResponse), and what a person is shown as the suggestion when they are asked (protectionColorQuestion,
 * the protection-color pause). Written once, so the preview and the resolution can never pick differently on the same board.
 *
 * THE THREATS (protectionThreats): the opponents' spells and abilities on the stack that protection from a colour stops —
 * one that targets the protected permanent (CR 702.16b: it can't be targeted by a spell of that colour or an ability from a source
 * of that colour, so as the spell or ability resolves its target is illegal, CR 608.2b), and one that deals damage to it without
 * targeting it ("2 damage to each creature" — CR 702.16e: the damage is prevented). Their colours are the ones the CR 608.2b
 * re-check judges protection by (spellEffects.resolutionSourceColors — a spell's own, the face being cast; an ability's source
 * permanent's, layer-aware). The threats' colour comes first; with none, the board read (choicePolicy.autoPickProtectionColor).
 *
 * ONLY WHAT THE ENGINE ENFORCES IS READ (false-negative safe): a threat is read only where the colour picked for it really stops
 * it here, so neither the AI's save nor a person's suggestion promises a save the game won't give. Two reads stay out until the
 * engine enforces them: a colourless threat (protection from colourless is not enforced — protection.protectionApplies reads
 * colour letters, and a colourless source has none), and an ability whose source has left the battlefield doing anything but
 * deal damage (the re-check keeps no last known colours, so its target stays legal; only its damage is prevented).
 */

import { findPermanent, opponentsOf } from "./gameState.js";
import { permanentColors, permanentHasCardType } from "./layers.js";
import { resolutionSourceColors } from "./spellEffects.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { autoPickProtectionColor } from "./choicePolicy.js";
import { seatIsHuman } from "./auraEntry.js"; // who is a person: state.humanSeats (a leaf over layers and gameState)
import { atomTargets, damageSourceFor } from "./effects/atoms/shared.js"; // the permanents the grant reaches — the resolver's own read; + a departed ability source's last known colours

/** The five colours (CR 105.1) in WUBRG order, and "C" — colourless — for a grant that offers it (Giver of Runes). */
export const PROTECTION_COLOR_ORDER = ["W", "U", "B", "R", "G"];
export const PROTECTION_COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

/** The atoms a stack object will run: its program's, or its chosen mode's (the read effects/targeting.atomForStackTarget makes). */
function stackObjectAtoms(obj) {
  const params = obj?.payload?.params;
  const program = params?.program;
  if (!program) return [];
  if (program.structure !== "modal") return program.atoms || [];
  const modes = program.modal?.modes || [];
  return Array.isArray(params.chosenMode) ? params.chosenMode.flatMap((k) => modes[k]?.atoms || []) : (modes[params.chosenMode]?.atoms || []);
}

/**
 * The colours protection judges a stack object by (CR 702.16b — a spell's colours, or the colours of an ability's source), as the
 * engine enforces it: the CR 608.2b re-check's own read (resolutionSourceColors) — a spell's, the face being cast; an ability's, its
 * source permanent's, layer-aware. An ability whose source has left the battlefield: the re-check reads no colour for it (the engine
 * keeps no last known colours there, so protection doesn't make its target illegal), and only the damage it deals is stopped — by
 * the last known colours the damage path keeps (effects/atoms/shared.damageSourceFor — the ability's own record, the
 * sacrificed-as-a-cost record; CR 702.16e). So such an object is read only when all it does is deal damage (Mogg Fanatic's ping);
 * anything else (Executioner's Capsule's destroy), or no record kept, is null — the engine can't tell, so it is never read as
 * colourless or as stopped here.
 */
export function stackObjectProtectionColors(state, obj) {
  if (!obj) return null;
  if (obj.kind === "spell") return resolutionSourceColors(state, obj, null);
  const params = obj.payload?.params || {};
  const sourceId = params.context?.sourceId ?? params.sourceId ?? null;
  if (sourceId == null) return null;
  if (findPermanent(state, sourceId)) return resolutionSourceColors(state, obj, sourceId);
  const atoms = stackObjectAtoms(obj);
  if (atoms.length === 0 || atoms.some((a) => a?.op !== "deal-damage")) return null;
  const source = damageSourceFor(state, { ...(params.context || {}), sourceId });
  return Array.isArray(source?.qualities?.colors) ? [...source.qualities.colors] : null;
}

const NOT_A_PERMANENT_TARGET = new Set(["player", "spell", "stackAbility", "graveyardCard"]);

/** Does the stack object target one of `ids` (a recorded target)? */
function targetsOneOf(obj, ids) {
  return (obj?.payload?.params?.targets || obj?.targets || []).some((t) => t && !NOT_A_PERMANENT_TARGET.has(t.type) && ids.has(t.id));
}

// The gates an atom can carry that make it run only sometimes — an atom behind one is not read as a threat (an under-read).
const GATE_KEYS = ["condition", "optional", "kickedOnly", "nonKickedOnly", "ifSacrificed", "ifExiledCardType", "reflexiveTrigger"];
// The sweeps of applyDamageEffect that deal damage to creatures without targeting them (spellEffects.applyDamageEffect's branches).
const CREATURE_SWEEPS = new Set(["eachCreature", "eachOtherCreature", "eachCreatureAndPlayer", "eachCreatureAndPlaneswalker", "eachOpponentAndTheirCreatures", "eachOpponentAndTheirCreaturesPW"]);

/**
 * Does the stack object deal damage to one of `ids` without targeting it — a `deal-damage` atom over a creature sweep that reaches it,
 * read the way applyDamageEffect reads the sweep (a creature now; the restrictions; "each other" spares the source; the one-sided
 * sweep only the controller's opponents' creatures)? An amount of 0 deals none (CR 120.8). A gated atom is not read.
 */
function damagesOneOf(state, obj, ids) {
  const sourceId = obj?.payload?.params?.context?.sourceId ?? obj?.payload?.params?.sourceId ?? null;
  for (const atom of stackObjectAtoms(obj)) {
    if (atom?.op !== "deal-damage" || !CREATURE_SWEEPS.has(atom.targetType) || GATE_KEYS.some((k) => atom[k])) continue;
    if (typeof atom.amount === "number" && atom.amount <= 0 && !atom.amountX && !atom.amountCount && !atom.countFor) continue;
    for (const id of ids) {
      const lk = findPermanent(state, id);
      if (!lk || !permanentHasCardType(state, id, "Creature")) continue;
      if (atom.targetType === "eachOtherCreature" && id === sourceId) continue;
      if (atom.targetType === "eachOpponentAndTheirCreatures" || atom.targetType === "eachOpponentAndTheirCreaturesPW") {
        if (opponentsOf(state, obj.controller).includes(lk.controller)) return true;
        continue;
      }
      if (creatureSatisfiesRestrictions(state, lk.permanent, lk.controller, obj.controller, atom.restrictions || [])) return true;
    }
  }
  return false;
}

/**
 * The opponents' spells and abilities on the stack that threaten one of the permanents `permIds` in a way protection from a colour
 * stops: one that targets it (CR 702.16b), one that deals damage to it without targeting it (CR 702.16e). A non-targeted destroy,
 * exile or -N/-N is not read — protection doesn't stop it. Topmost (the next to resolve) first, each `{ id, name, colors, how }`:
 * `colors` the ones protection judges it by, `how` "targets" | "damage". An object whose colours the engine can't tell is left out
 * (stackObjectProtectionColors), and so is a colourless one: protection from colourless is not enforced (protection.protectionApplies
 * reads colour letters), so naming it — or picking colourless for it — would promise a save the game doesn't give.
 */
export function protectionThreats(state, controller, permIds) {
  const ids = new Set(permIds || []);
  if (ids.size === 0 || !state?.players?.[controller]) return [];
  const enemies = new Set(opponentsOf(state, controller));
  const stack = state.stack || [];
  const out = [];
  for (let k = stack.length - 1; k >= 0; k--) {
    const obj = stack[k];
    if (!enemies.has(obj?.controller)) continue;
    const how = targetsOneOf(obj, ids) ? "targets" : damagesOneOf(state, obj, ids) ? "damage" : null;
    if (!how) continue;
    const colors = stackObjectProtectionColors(state, obj);
    if (colors == null || colors.length === 0) continue;
    out.push({ id: obj.id ?? null, name: obj.source?.name ?? null, colors: [...colors], how });
  }
  return out;
}

/**
 * The colour the automatic chooser takes for a "protection from the color of your choice" grant to `permIds` controlled by
 * `controller`: the threats' colour (protectionThreats) first, else the board read — choicePolicy.autoPickProtectionColor over each
 * opponent permanent's current colours (layers.permanentColors, CR 613.1e). `threats` may be passed when already read.
 */
export function protectionColorPick(state, controller, permIds, { orColorless = false, threats = null } = {}) {
  return autoPickProtectionColor(state, controller, {
    orColorless,
    colorsOfPermanent: (p) => permanentColors(state, p.id),
    threats: threats ?? protectionThreats(state, controller, permIds),
  });
}

/**
 * The permanents a `grant-protection` atom gives protection to as it resolves now — the resolver's own read (atomTargets, those
 * still on the battlefield).
 */
export function protectionGrantPermanentIds(state, atom, ctx) {
  return atomTargets(state, atom, ctx).filter((t) => t && findPermanent(state, t.id)).map((t) => t.id);
}

/**
 * THE PERSON'S QUESTION (CR 608.2d). For a `grant-protection` atom "of the color of your choice" (`colorChoice`) about to resolve
 * for a seat a person plays (state.humanSeats), the protection-color question: `{ controller, cardName, candidates, suggestedId }` —
 * `candidates` the colours on offer, WUBRG and "C" for a grant that offers colourless, each `{ id, name, threats?, suggested? }`
 * (`threats` the names of the threats of that colour; `suggested` "threat" or "board" on the automatic chooser's pick, which is
 * `suggestedId`), `cardName` the protected permanents' names. Null for every other atom, for an AI seat, for an atom that already
 * carries its answer (`chosenColor`), and when no permanent it would protect is on the battlefield (the grant does nothing — no
 * choice to make).
 */
export function protectionColorQuestion(state, atom, ctx) {
  if (atom?.op !== "grant-protection" || !atom.colorChoice || atom.chosenColor != null) return null;
  const controller = ctx?.controller;
  if (!seatIsHuman(state, controller)) return null;
  const ids = protectionGrantPermanentIds(state, atom, ctx);
  if (ids.length === 0) return null;
  const threats = protectionThreats(state, controller, ids);
  const suggestedId = protectionColorPick(state, controller, ids, { orColorless: !!atom.orColorless, threats });
  const letters = [...PROTECTION_COLOR_ORDER, ...(atom.orColorless ? ["C"] : [])];
  const candidates = letters.map((id) => {
    const named = threats.filter((t) => (t.colors.length ? t.colors.includes(id) : id === "C")).map((t) => t.name || "a spell or ability");
    return {
      id,
      name: PROTECTION_COLOR_NAMES[id],
      ...(named.length ? { threats: named } : {}),
      ...(id === suggestedId ? { suggested: named.length ? "threat" : "board" } : {}),
    };
  });
  const names = ids.map((id) => {
    const perm = findPermanent(state, id)?.permanent;
    return perm?.card?.name || (perm?.faceDown ? "Face-down creature" : "a permanent");
  });
  return { controller, cardName: names.join(", "), candidates, suggestedId };
}
