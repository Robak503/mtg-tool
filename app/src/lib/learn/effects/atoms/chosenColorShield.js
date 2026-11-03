/**
 * effects/atoms/chosenColorShield.js — SKRELV, DEFECTOR MITE (the play-weighted program, EDHREC #1123):
 *
 *   "{W/P}, {T}: Choose a color. Another target creature you control gains toxic 1 and hexproof from that color until end of turn. It
 *    can't be blocked by creatures of that color this turn."
 *
 * ONE atom for the three sentences, because the second and third read the first's choice ("that color"). The colour is chosen as the
 * ability resolves (CR 608.2d): a person's answer rides the atom as `chosenColor` (runProgram.resolveAtomAsking raises the colour question
 * the protection grants use — protectionChoice.protectionColorQuestion, which names this grant — and resolveProtectionColorChoice runs the
 * atom with the answer); every other seat takes the shared automatic chooser (protectionChoice.protectionColorPick: the colour of the
 * opponents' spells and abilities on the stack that target the creature — the threats hexproof stops, CR 702.11d — else the board read
 * over the opponents' permanents' colours). Then, until end of turn (CR 514.2 — "this turn" ends at the same cleanup), three layer-6 effects
 * on the target as it is (CR 611.2c — a fixed set):
 *   · toxic 1 — a granted `toxic` keyword instance carrying its amount (layers.grantedToxicAmount; cumulative with the creature's own,
 *     CR 702.164b — the ruling; combatResolution adds it to the poison counters its combat damage to a player gives, CR 702.164c);
 *   · hexproof from that colour — the target shield Veil of Summer's grant makes (opponents' sources of that colour can't target it,
 *     CR 702.11d; a "can't have hexproof" removes it, CR 702.11e — `hexproof`);
 *   · can't be blocked by creatures of that colour — `cantBeBlockedByColor` (layers.permanentUnblockableByColors, read by
 *     combatEvasion as blockers are declared, CR 509.1b).
 * The target is "another target creature you control" (excludeSource — CR 109.5); a target gone or no longer legal as the ability resolves
 * means the ability does nothing (CR 608.2b — the program's re-check). Pure data mutation, serialize-safe.
 */
import { findPermanent, logEvent } from "../../gameState.js";
import { addContinuousEffect } from "../../layers.js";
import { protectionColorPick, protectionThreats } from "../../protectionChoice.js"; // the shared automatic chooser (combat.js's grant-protection reads it too)
import { atomTargets } from "./shared.js";

export const CHOSEN_COLOR_SHIELD_OP = "chosen-color-toxic-shield";

/** The whole effect of Skrelv's ability, exactly. Returns { atom } | null. */
export function matchChosenColorToxicShield(oracle) {
  const s = String(oracle || "").trim().toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "");
  return s === "choose a color. another target creature you control gains toxic 1 and hexproof from that color until end of turn. it can't be blocked by creatures of that color this turn"
    ? { atom: { op: CHOSEN_COLOR_SHIELD_OP, targetType: "creatureYouControl", excludeSource: true, toxic: 1 } }
    : null;
}

/** The threats hexproof from a colour stops: an opponent's spell or ability of that colour that TARGETS the creature (not one that only deals damage to it). */
export function chosenColorShieldThreats(state, controller, permIds) {
  return protectionThreats(state, controller, permIds).filter((t) => t.how === "targets");
}

/** The permanents the grant reaches as it resolves (the resolver's own read — the targets still on the battlefield). */
export function chosenColorShieldPermanentIds(state, atom, ctx) {
  return atomTargets(state, atom, ctx).filter((t) => t && findPermanent(state, t.id)).map((t) => t.id);
}

export function applyChosenColorToxicShield(state, atom, ctx) {
  const ids = chosenColorShieldPermanentIds(state, atom, ctx);
  if (ids.length === 0) return logEvent(state, { kind: "spell-effect", effect: "chosen-color-shield", targets: [], reason: "no-target" });
  const color = atom.chosenColor ?? protectionColorPick(state, ctx.controller, ids, { threats: chosenColorShieldThreats(state, ctx.controller, ids) });
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: state.turn };
  const affects = { mode: "fixed", permanentIds: ids };
  let next = state;
  next = addContinuousEffect(next, { layer: 6, op: { layerOp: "addKeyword", keyword: "toxic", toxicAmount: atom.toxic ?? 1 }, affects, duration: dur, source: src }).state;
  // The shield names no source permanent (Veil of Summer's form): hexproof is the creature's own ability, so its "your opponents" are the
  // opponents of the creature's CURRENT controller (CR 702.11d, 109.5) — not Skrelv's controller once the creature changes hands.
  next = addContinuousEffect(next, { layer: 6, op: { layerOp: "targetShield", colors: [color], opponentsOnly: true, hexproof: true }, affects, duration: dur, source: { ...src, permanentId: null } }).state;
  next = addContinuousEffect(next, { layer: 6, op: { layerOp: "cantBeBlockedByColor", color }, affects, duration: dur, source: src }).state;
  return logEvent(next, { kind: "spell-effect", effect: "chosen-color-shield", color, toxic: atom.toxic ?? 1, targets: ids });
}

export const chosenColorShieldResolvers = {
  [CHOSEN_COLOR_SHIELD_OP]: applyChosenColorToxicShield, // Skrelv — the chosen colour's toxic 1, hexproof from it, and unblockable by it, until end of turn
};
