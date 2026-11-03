/**
 * effects/atoms/animateDead.js — the reanimation Aura's two triggered abilities (the play-weighted program, P·12 — Animate Dead,
 * EDHREC #224; the gate and the synthesized descriptors live in the zero-import leaf animateDeadGate.js).
 *
 * The lane: the Aura spell TARGETS a creature card in any graveyard (CR 303.4a); resolving, it enters the battlefield attached
 * to no permanent, stamped `enchantedGraveyardCard` — the card and its owner (CR 303.4: it is attached to a card in a
 * graveyard). Then:
 *   - its ETB ("if it's on the battlefield", CR 603.4 — checked as it resolves) returns that card to the battlefield under the
 *     Aura's controller and attaches the Aura to it, stamping the creature `animatedBy` (the Aura's id). A card that left the
 *     graveyard first leaves the Aura attached to nothing, so it goes to its owner's graveyard (CR 704.5m — the SBA sweep passes
 *     over an Aura still stamped `enchantedGraveyardCard`, which is attached to that card until this trigger settles it, so the
 *     resolver does it).
 *   - its leave trigger finds the creature this Aura animated — that creature's controller sacrifices it. A creature already
 *     gone (it died, so the Aura fell off) is a clean no-op.
 * "Enchanted creature gets -1/-0." is the ordinary attached bonus, live once the Aura is attached.
 */
import { findPermanent, logEvent, moveCardToZone, attachPermanent, updatePermanentSafe } from "../../gameState.js";
import { enterCardFromZone } from "./zones.js";
import { sacrificeCreatureEffect } from "./removal.js";

/** The ETB: return the enchanted graveyard card under the Aura's controller and attach the Aura to it. */
function applyAnimateDeadReturn(state, atom, ctx) {
  const aura = ctx.sourceId != null ? findPermanent(state, ctx.sourceId) : null;
  if (!aura) return logEvent(state, { kind: "spell-effect", effect: "animate-dead", returned: false, reason: "aura-gone" }); // "if it's on the battlefield"
  const link = aura.permanent.enchantedGraveyardCard;
  const inYard = !!link && (state.players?.[link.ownerId]?.graveyard || []).some((c) => c.id === link.cardId);
  const r = inYard ? enterCardFromZone(state, { playerId: aura.controller, cardId: link.cardId, fromZone: "graveyard", fromPlayerId: link.ownerId }) : null;
  if (!r?.entered) {
    // CR 704.5m — attached to nothing it can legally enchant: the Aura goes to its owner's graveyard.
    const binned = moveCardToZone(state, { playerId: aura.controller, fromZone: "battlefield", toZone: "graveyard", cardId: aura.permanent.id });
    return logEvent(binned, { kind: "aura-falls-off", turn: binned.turn, cardName: aura.permanent.card?.name, controller: aura.controller, cause: "enchanted-card-gone" });
  }
  let next = updatePermanentSafe(r.state, aura.permanent.id, (p) => {
    const { enchantedGraveyardCard: _gone, ...rest } = p;
    return rest;
  });
  next = attachPermanent(next, { equipId: aura.permanent.id, targetId: r.permanentId });
  next = updatePermanentSafe(next, r.permanentId, (p) => ({ ...p, animatedBy: aura.permanent.id }));
  return logEvent(next, { kind: "spell-effect", effect: "animate-dead", returned: true, controller: aura.controller, permanentId: r.permanentId });
}

/** The leave trigger: the creature this Aura animated — its controller sacrifices it. */
function applyAnimateDeadSacrifice(state, atom, ctx) {
  for (const [pid, player] of Object.entries(state.players || {})) {
    const host = (player.battlefield || []).find((p) => ctx.sourceId != null && p.animatedBy === ctx.sourceId);
    if (host) return sacrificeCreatureEffect(state, pid, host.id);
  }
  return logEvent(state, { kind: "spell-effect", effect: "animate-dead-sacrifice", sacrificed: null });
}

/**
 * NECROMANCY's enters trigger (the play-weighted program, #1023 — animateDeadGate.isNecromancy): "…, if it's on the battlefield, it becomes
 * an Aura with "enchant creature put onto the battlefield with Necromancy." Put target creature card from a graveyard onto the battlefield
 * under your control and attach this enchantment to it." All of it happens as the ability resolves (its ruling). Necromancy gone → nothing
 * (the intervening-if, CR 603.4); the target no longer in its graveyard → the ability did not resolve (CR 608.2b — the engine's re-check;
 * guarded here too) and Necromancy stays the enchantment it was. Otherwise it becomes an Aura (`becameAura` — sba.js's attachment sweep
 * treats it as one whose only legal object is the creature it put onto the battlefield, CR 704.5m), the card enters under its controller
 * from its owner's graveyard, and Necromancy is attached to it (the creature stamped `animatedBy`, which its leave trigger reads). A card
 * that didn't enter leaves the Aura attached to nothing, so it goes to its owner's graveyard (CR 704.5m); a creature it can't legally
 * enchant (protection from black — its ruling) is the sweep's: it goes, and its leave trigger has the creature sacrificed.
 */
function applyNecromancyReturn(state, atom, ctx) {
  const necro = ctx.sourceId != null ? findPermanent(state, ctx.sourceId) : null;
  if (!necro) return logEvent(state, { kind: "spell-effect", effect: "necromancy", returned: false, reason: "necromancy-gone" });
  const t = (ctx.targets || []).find((x) => x?.type === "graveyardCard");
  const ownerId = t ? Object.keys(state.players || {}).find((pid) => (state.players[pid].graveyard || []).some((c) => c.id === t.id)) : null;
  if (!ownerId) return logEvent(state, { kind: "spell-effect", effect: "necromancy", returned: false, reason: "target-gone" });
  let next = updatePermanentSafe(state, necro.permanent.id, (p) => ({ ...p, becameAura: true }));
  const r = enterCardFromZone(next, { playerId: necro.controller, cardId: t.id, fromZone: "graveyard", fromPlayerId: ownerId });
  if (!r?.entered) {
    const binned = moveCardToZone(r?.state || next, { playerId: necro.controller, fromZone: "battlefield", toZone: "graveyard", cardId: necro.permanent.id });
    return logEvent(binned, { kind: "aura-falls-off", turn: binned.turn, cardName: necro.permanent.card?.name, controller: necro.controller, cause: "enchanted-card-gone" });
  }
  next = attachPermanent(r.state, { equipId: necro.permanent.id, targetId: r.permanentId });
  next = updatePermanentSafe(next, r.permanentId, (p) => ({ ...p, animatedBy: necro.permanent.id }));
  return logEvent(next, { kind: "spell-effect", effect: "necromancy", returned: true, controller: necro.controller, permanentId: r.permanentId });
}

export function animateDeadClauseParser(clause) {
  const t = String(clause || "").trim().replace(/\.$/, "").toLowerCase();
  if (t === "[animate-dead] return the enchanted creature card to the battlefield attached") return { op: "animate-dead-return", targetType: null };
  if (t === "[animate-dead] the animated creature's controller sacrifices it") return { op: "animate-dead-sacrifice", targetType: null };
  // NECROMANCY (play-weighted #1023): the reanimate atom's target shape (any graveyard, a creature card — zones.reanimate's fields, so
  // the trigger's target offer is the one that atom gets), resolved by applyNecromancyReturn.
  if (t === "[necromancy] put target creature card from a graveyard onto the battlefield under your control attached") {
    return { op: "necromancy-return", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true };
  }
  return null;
}

export const animateDeadResolvers = {
  "animate-dead-return": applyAnimateDeadReturn,
  "animate-dead-sacrifice": applyAnimateDeadSacrifice,
  "necromancy-return": applyNecromancyReturn,
};
