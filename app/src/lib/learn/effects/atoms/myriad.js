/**
 * effects/atoms/myriad.js — KW-MYRIAD, played (play-weighted #898, 2026-11-03 — Blade of Selves: "Equipped creature has myriad.").
 *
 *   CR 702.116a: "Myriad" means "Whenever this creature attacks, for each opponent other than defending player, you may create a
 *   token that's a copy of this creature that's tapped and attacking that player or a planeswalker they control. If one or more
 *   tokens are created this way, exile the tokens at end of combat."  CR 702.116b: each instance triggers separately.
 *
 * Before this slice the engine declined every myriad trigger (the printed keyword was credited as an optional rider never taken —
 * coverage KW-MYRIAD); on Blade of Selves the grant is the whole card, so it needs the real copies. Now:
 *   · THE TRIGGER (myriadAttackTriggers, read by gameEngine.closeAttackDeclaration with the other attack triggers, CR 508.1m):
 *     one pending trigger per instance on each declared attacker — printed (each "myriad" of its keyword line: Scurry of Squirrels'
 *     "Myriad, myriad" is two — printedMyriadCount) and granted alike (layers.keywordInstanceCount: an
 *     Equipment's, an Aura's or a team's "have myriad" is a layer-6 grant; a loss of abilities removes the printed one, CR 613.1f) —
 *     times its controller's attack-trigger multiplier (Isshin). Its "defending player" is the player that creature attacks (or
 *     whose planeswalker it attacks), fixed as it attacks (the bundled ruling); the copy's last known card rides with it. With no
 *     opponent other than the defending player still in the game, nothing could be created (the ruling: "If the defending player is
 *     your only opponent, no tokens are put onto the battlefield") and no trigger is queued.
 *   · THE RESOLUTION (applyMyriad — the trigger's one atom, `optional`: "you may"): for each opponent other than the defending
 *     player still in the game, in APNAP order, a token copy — all of them ONE creation event, made by one call of the shared
 *     token-copy minter (tokens.applyCreateTokenCopy — CR 707.2:
 *     the copiable values only, never the counters, Auras, Equipment or pumps on it; its token doubler, its enters triggers, a
 *     copied Aura or Mox Diamond's entry, the lethal check), tapped and attacking THAT player — never declared, so no attack
 *     trigger triggers for it, its own myriad included (CR 508.4; the ruling). A token that isn't a creature enters but isn't
 *     attacking (the ruling). Then the delayed triggered ability: the tokens are exiled at end of combat (the [minted-leave exile]
 *     sentinel, fired at the end of combat step, CR 511.2). The copy is of the creature as it is now (its copiable values —
 *     layers.deriveCharacteristics, CR 707.3) or, once it has left the battlefield, as it last existed (CR 608.2h).
 *   · A PERSON'S CHOICE is the one yes/no for the trigger (every copy or none); "a planeswalker they control" resolves to the
 *     player (the house choice — Adeline's precedent, CR 508.4). The default AI takes it unless the creature is legendary
 *     (runProgram.optionalAutoTakeValue): the legend rule would leave only one of them (CR 704.5j — gameState.applyLegendRule keeps
 *     the creature that isn't a myriad token, the ruling's "you'll choose one of them to remain").
 *
 * A COPY ENTERS WITH WHAT THE COPIED CREATURE ENTERS WITH (CR 707.5, 614.1c; the rulings): each copy is run through the entry
 * replacements (enterReplacements.applyEnterReplacements — "enters with N counters", "as this enters" choices) inside the token-copy
 * minter, before its lethal check, read on the board as the creation began (`withEnterReplacements` — the replacer this module registers).
 * (The minter applies none of them for every other copy effect — a gap reported, not widened here.)
 *
 * Imports gameState, layers, keywords, enterReplacements and two sibling atom modules (tokens, delayedTrigger); never parser.js.
 */
import { findPermanent, opponentsOf, apnapOrder, logEvent } from "../../gameState.js";
import { keywordInstanceCount, deriveCharacteristics, attackTriggerMultiplierCount, permanentIsCreature, withAbilityLoss, boardHasAbilityLoss } from "../../layers.js";
import { hasKeyword } from "../../keywords.js";
import { applyCreateTokenCopy, registerTokenCopyEntryReplacer } from "./tokens.js";
import { applyScheduleDelayed } from "./delayedTrigger.js";
import { applyEnterReplacements, settleEnterReplacements } from "../../enterReplacements.js"; // the entry replacements a copy enters with (CR 707.5, 614.1c) — enterReplacements reaches no myriad module

// The token-copy minter's entry replacer (tokens.registerTokenCopyEntryReplacer): enterReplacements reaches tokens.js, so the minter can't
// import it; this module can, and registers it at load (effectAtoms and gameEngine import this module, so the engine always has it).
registerTokenCopyEntryReplacer({ apply: applyEnterReplacements, settle: settleEnterReplacements });

/** The copiable values of a battlefield permanent (CR 707.2, 707.3): a layer-1 copy effect's source when one applies, else its card. */
function copiableCard(state, perm) {
  return deriveCharacteristics(state, perm.id)?.copiableValues || perm.card;
}

/**
 * The PRINTED instances of myriad on a card's own text (CR 702.116b — "If a creature has multiple instances of myriad, each triggers
 * separately"): each whole comma-segment of a reminder-stripped line that is exactly "myriad" — Scurry of Squirrels' "Myriad, myriad"
 * is two; a grant ("Equipped creature has myriad.") is none (it is a layer-6 grant, counted by keywordInstanceCount). The flanking /
 * exalted structural counter (triggers.flankingKeywordCount), kept here so this module never imports triggers.js.
 */
export function printedMyriadCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "myriad") n++;
  }
  return n;
}

/** How many instances of myriad `perm` has now (CR 702.116b): the printed instances on its ability view, plus every layer-6 grant. */
export function myriadInstances(state, perm) {
  const view = boardHasAbilityLoss(state) ? withAbilityLoss(state, perm) : perm.card;
  const printed = Math.max(printedMyriadCount(view?.oracle ?? view?.oracle_text ?? ""), hasKeyword(view, "Myriad") ? 1 : 0);
  return keywordInstanceCount(state, perm.id, "myriad", printed);
}

/**
 * The myriad triggers of a just-closed attack declaration (CR 508.1m): one pending trigger per instance per attacker, as the inline
 * program the reflexive vehicle carries (gameEngine.buildReflexiveTriggerStack puts it on the stack; no targets). Returns the state
 * with them appended to pendingTriggers, or the state itself.
 */
export function myriadAttackTriggers(state) {
  const records = state?.combat?.attackers || [];
  if (records.length === 0) return state;
  const fired = [];
  for (const rec of records) {
    const found = findPermanent(state, rec.permanentId);
    if (!found) continue;
    const perm = found.permanent;
    const n = myriadInstances(state, perm);
    if (n <= 0) continue;
    const controller = found.controller;
    const defendingPlayerId = rec.defender ?? null;
    const others = opponentsOf(state, controller).filter((pid) => pid !== defendingPlayerId && state.players?.[pid]);
    if (others.length === 0) continue;
    const times = n * (1 + Math.max(0, attackTriggerMultiplierCount(state, controller) || 0));
    const context = { defendingPlayerId, myriadLastKnown: copiableCard(state, perm) };
    for (let i = 0; i < times; i++) {
      fired.push({
        event: "myriad",
        source: { permanentId: perm.id, cardId: perm.card?.id ?? null, name: perm.card?.name ?? null },
        controller,
        descriptor: { event: "myriad" },
        context,
        targets: [],
        reflexiveProgram: { structure: "sequence", atoms: [{ op: "myriad", optional: true, targetType: null }] },
        xValue: null,
        payload: { resolver: "manual", params: { controller, targets: [], context } },
      });
    }
  }
  return fired.length ? { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] } : state;
}

/** The myriad trigger's resolution (the file note). */
export function applyMyriad(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state;
  const live = ctx.sourceId != null ? findPermanent(state, ctx.sourceId)?.permanent : null;
  const lkiCard = live ? copiableCard(state, live) : (ctx.myriadLastKnown || null);
  if (!lkiCard) return logEvent(state, { kind: "spell-effect", effect: "myriad", controller, created: 0 });
  const defending = ctx.defendingPlayerId ?? null;
  const toward = apnapOrder(state, opponentsOf(state, controller)).filter((pid) => pid !== defending && state.players?.[pid]);
  let next = state;
  const minted = [];
  const attacking = [];
  if (toward.length) {
    // ONE CREATION EVENT (the bundled rulings: "The token creatures all enter the battlefield at the same time"): one minter call makes
    // every copy — one per opponent (`count`), each doubled by a token doubler — so the copied creature's "as this enters" and "enters
    // with" abilities read the board as the creation began (CR 614.12 — a copy entering in the same event is no part of it: Squad
    // Captain's copies count the creatures already there, never each other), the enters triggers fire once over all of them (CR 603.6a —
    // the newcomers see each other: two Soul Warden copies each gain for the other), and a once-per-event replacement applies once
    // (Peregrin Took's one Food). `withEnterReplacements`: the minter's entry replacer (CR 707.5, 614.1c — a copy of Spike Colony enters
    // with its four counters). The minter says which opponent each copy is for (`_lastMintedTokenGroups`, its index in `toward`).
    next = applyCreateTokenCopy(next, { op: "create-token-copy", copySource: "lki", lkiCard, count: toward.length, entersTapped: true, myriadToken: true, withEnterReplacements: true, targetType: null }, ctx);
    const ids = next._lastMintedTokenIds || [];
    const groups = next._lastMintedTokenGroups || [];
    if (groups.length !== ids.length) throw new Error(`myriad: the minter returned ${ids.length} copies but ${groups.length} groups`);
    const { _lastMintedTokenGroups: _groups, ...rest } = next;
    next = rest;
    ids.forEach((id, k) => {
      if (!findPermanent(next, id)) return;
      minted.push(id);
      if (permanentIsCreature(next, id)) attacking.push({ permanentId: id, attackingPlayer: controller, defender: toward[groups[k]] });
    });
  }
  if (attacking.length && next.combat) next = { ...next, combat: { ...next.combat, attackers: [...(next.combat.attackers || []), ...attacking] } };
  if (minted.length) next = applyScheduleDelayed(next, { delayedClause: `[minted-leave exile ${minted.join(",")}]`, fireStep: "end-of-combat", fireScope: "any" }, ctx);
  return logEvent(next, { kind: "spell-effect", effect: "myriad", controller, created: minted.length, attacking: attacking.map((a) => a.defender) });
}

export const myriadResolvers = {
  myriad: applyMyriad, // KW-MYRIAD (CR 702.116a) — the token copies attacking each other opponent, exiled at end of combat
};
