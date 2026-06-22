/**
 * effects/atoms/manifest.js — the manifest-dread effect atom (MKM keyword action, CR 701.62).
 *
 * MANIFEST DREAD (CR 701.62a): look at the top TWO cards of the controller's library, put ONE onto the
 * battlefield FACE DOWN as a 2/2 colorless nameless creature with no abilities, and put the OTHER into the
 * controller's graveyard. (A face-down manifest can be turned face up for its mana cost if it's a creature
 * card — that turn-up is NOT modeled here; the manifest plays as a vanilla 2/2 until it leaves.)
 *
 * THE FACE-DOWN PERMANENT (CR 708.2): its `card` snapshot is the nameless 2/2 — name "", power 2, toughness 2,
 * type "Creature", keywords []  and NO subtypes — so every reader (combat, SBA, ETB scope, lords) sees a plain
 * 2/2 and can NEVER leak the real card's name / P/T / abilities / subtypes. The REAL card lives ONLY under
 * `permanent.faceUpCard`. When the face-down LEAVES the battlefield it becomes that real card again (CR 701.40
 * / 110.5) — the unwrap lives at the single battlefield-exit chokepoint, gameState.moveCardToZone (it reads
 * `faceDown && faceUpCard`), so a dies / bounce / exile / tuck all deposit the printed card, not the 2/2.
 *
 * It is NOT a token (CR 701.40a — a manifest is a real card put onto the battlefield face down), so `token`
 * is never set: it doesn't vanish as an SBA and unwraps to a real card on leave.
 *
 * v1 auto-pick (CREED — a never-wrong engine pick, keeping the slice off runProgram's pendingChoice path):
 * with two cards looked at, manifest the FIRST that is a creature card (so a later turn-face-up would be legal
 * and meaningful) else the FIRST; the OTHER card goes to the graveyard. A pendingChoice picker is a future
 * enhancement. Hidden-info safe: the log records the disposition (count looked at, whether a card was
 * manifested) but NEVER the manifested / milled card's identity (mirrors tutor / scry logging).
 *
 * CIRCULAR-IMPORT NOTE: this module must NOT import from effects/parser.js (parser imports the atoms barrel).
 * `manifestClauseParser` is a PURE function exported here; the integrator wires registerClauseParser at the
 * bottom of parser.js. (See effectAtoms.js barrel + parser.js registry seam.)
 */

import { logEvent, mintId, createPermanent, moveCardToZone, destroyLethalCreatures } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { fireTokenEnterTriggers } from "./tokens.js";

/** Is a library card a creature card (front face)? Used only to pick the meaningful manifest target. */
function isCreatureCard(card) {
  return /\bCreature\b/.test(String(card?.type || card?.type_line || "").split(" // ")[0]);
}

/**
 * Put `realCard` onto the controller's battlefield FACE DOWN as a nameless 2/2 (CR 701.40a / 708.2). The real
 * card is removed from the library and stashed ONLY under `faceUpCard`; the permanent's `card` is the 2/2
 * face-down snapshot. Fires ETB watchers (a manifest ENTERS — Soul Warden / Impact Tremors see a creature
 * enter; subtype-ETB scopes do NOT, the face-down has no subtypes), then runs the lethal SBA (a counter could
 * make it survive / a -1/-1 could kill it). Returns the new state.
 */
export function manifestCard(state, controller, realCard) {
  const player = state.players[controller];
  if (!player || !realCard) return state;
  const idx = player.library.findIndex((c) => c.id === realCard.id);
  if (idx === -1) return state;
  // Remove the real card from the library.
  let next = {
    ...state,
    players: {
      ...state.players,
      [controller]: {
        ...player,
        library: [...player.library.slice(0, idx), ...player.library.slice(idx + 1)],
      },
    },
  };
  const minted = mintId(next, "manifest");
  next = minted.state;
  // The face-down snapshot: a nameless, colorless 2/2 with NO subtypes and NO abilities (CR 708.2). The real
  // card is carried ONLY in faceUpCard so nothing leaks it. `id` matches the createPermanent id so a clone /
  // copy reading `card.id` never collides with the real card's id.
  const faceDownCard = { id: `manifest-${minted.id}`, name: "", power: 2, toughness: 2, type: "Creature", keywords: [], faceDown: true };
  const perm = {
    ...createPermanent({ id: minted.id, card: faceDownCard, controller }),
    faceDown: true,
    faceUpCard: realCard,
    enteredOnTurn: next.turn,
  };
  const owner = next.players[controller];
  next = { ...next, players: { ...next.players, [controller]: { ...owner, battlefield: [...owner.battlefield, perm] } } };
  // ETB (CR 603.6a) — a manifest ENTERS, so fire the shared enter-trigger seam (Soul Warden / Impact Tremors;
  // a face-down has no subtypes so subtype-ETB scopes are gated out). Then the lethal SBA + dies triggers
  // (a -1/-1 counter or an anthem-down could matter), mirroring applyCreateToken's ordering.
  next = fireTokenEnterTriggers(next, [minted.id]);
  const r = destroyLethalCreatures(next);
  return checkDiesTriggers(r.state, r.dead);
}

/**
 * applyManifestDread (CR 701.62) — manifest dread for ctx.controller. Look at the top min(2, library) cards;
 * manifest one face down (auto-pick the first creature card else the first), the other → graveyard. 0 cards is
 * a logged no-op; 1 card is manifested with no graveyard half (CR 701.62a — only one card is looked at).
 */
export function applyManifestDread(state, atom, ctx) {
  const controller = ctx.controller;
  const player = state.players[controller];
  if (!player) return state;
  const top = player.library.slice(0, Math.min(2, player.library.length));
  if (top.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "manifest-dread", controller, looked: 0, manifested: false });
  }
  // Auto-pick the card to manifest: the first creature card (a turn-face-up would be legal) else the first.
  const toManifest = top.find(isCreatureCard) || top[0];
  const toGraveyard = top.find((c) => c.id !== toManifest.id) || null; // null when only one card was looked at
  let next = manifestCard(state, controller, toManifest);
  if (toGraveyard) {
    // The OTHER looked-at card goes to the controller's graveyard. It is still in the library (manifestCard
    // only removed the manifested card), so move it library → graveyard by card identity.
    if (next.players[controller].library.some((c) => c.id === toGraveyard.id)) {
      next = moveCardToZone(next, { playerId: controller, fromZone: "library", toZone: "graveyard", cardId: toGraveyard.id });
    }
  }
  // Hidden-info safe — log the disposition (count looked at, whether a card was manifested), NEVER the card
  // identities (mirrors tutor / scry logging; an opponent's manifest dread stays hidden).
  return logEvent(next, { kind: "spell-effect", effect: "manifest-dread", controller, looked: top.length, manifested: true });
}

/**
 * PURE clause parser for "manifest dread" (the integrator wires registerClauseParser at parser.js-bottom; do
 * NOT self-register from this atoms module — circular-import hazard). The caller has already stripped reminder
 * text + collapsed whitespace, so an exact "manifest dread" is all that needs matching. Anchored ^…$ so a
 * longer clause that merely CONTAINS the phrase ("…then manifest dread twice") never mis-parses → it stays low
 * → Arbiter (CREED). Returns the atom or null.
 */
export function manifestClauseParser(clause) {
  return /^manifest dread$/i.test(String(clause || "").trim()) ? { op: "manifest-dread" } : null;
}

export const manifestResolvers = {
  "manifest-dread": applyManifestDread,
};
