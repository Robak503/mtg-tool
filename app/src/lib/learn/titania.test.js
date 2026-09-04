/**
 * titania.test.js — SHELF-85 runbook Phase 2 · T4 (2026-09-05): Titania, Protector of Argoth (Teval).
 *
 *   "When Titania enters, return target land card from your graveyard to the battlefield.
 *    Whenever a land you control is put into a graveyard from the battlefield, create a 5/3 green Elemental creature token."
 *
 * The ETB land reanimate and the Elemental token already parsed. The one cell: the LAND twin of the artifact /
 * enchantment "you control is put into a graveyard from the battlefield" watchers — scope `landYouControlPiG` on the
 * permanentLeaves look-back: graveyard exit only (a bounce never fires), controller-gated, the type line read off the
 * look-back card.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkLeavesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TITANIA = { id: "c-tit", name: "Titania, Protector of Argoth", type: "Legendary Creature — Elemental", mana: "{3}{G}{G}", power: 5, toughness: 3, keywords: [],
  oracle: "When Titania enters, return target land card from your graveyard to the battlefield.\nWhenever a land you control is put into a graveyard from the battlefield, create a 5/3 green Elemental creature token." };

const forest = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl });
const bear = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: ctrl });
function board(userPerms, aiPerms = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, battlefield: userPerms }, ai: { ...s.players.ai, battlefield: aiPerms } } };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const elementals = (s) => s.players.user.battlefield.filter((p) => p.card?.token && /Elemental/.test(String(p.card?.type || ""))).length;
/** Send a permanent from the battlefield to `toZone` through the real zone mover, then drain the leave events. */
function leave(s, pid, cardId, toZone) {
  const moved = moveCardToZone(s, { playerId: pid, fromZone: "battlefield", toZone, cardId });
  return resolveAll(flushTriggers(checkLeavesTriggers(moved), { chooseTargets: chooseTriggerTargets }));
}

describe("detection", () => {
  it("both triggers: the ETB reanimate and the land-you-control put-into-graveyard watcher", () => {
    expect(detectTriggers(TITANIA).map((d) => [d.event, d.scope])).toEqual([["etb", "self"], ["permanentLeaves", "landYouControlPiG"]]);
  });
});

describe("runtime — a land of yours hitting the graveyard makes the Elemental", () => {
  it("your Forest to the graveyard → one 5/3 Elemental", () => {
    let s = board([createPermanent({ id: "TIT", card: TITANIA, controller: "user" }), forest("F1", "user")]);
    s = leave(s, "user", "F1","graveyard");
    expect(elementals(s)).toBe(1);
  });
  it("your Forest BOUNCED to hand → nothing (graveyard exit only)", () => {
    let s = board([createPermanent({ id: "TIT", card: TITANIA, controller: "user" }), forest("F1", "user")]);
    s = leave(s, "user", "F1","hand");
    expect(elementals(s)).toBe(0);
  });
  it("an OPPONENT's Forest to the graveyard → nothing (controller-gated)", () => {
    let s = board([createPermanent({ id: "TIT", card: TITANIA, controller: "user" })], [forest("AF", "ai")]);
    s = leave(s, "ai", "AF","graveyard");
    expect(elementals(s)).toBe(0);
  });
  it("your CREATURE to the graveyard → nothing (lands only)", () => {
    let s = board([createPermanent({ id: "TIT", card: TITANIA, controller: "user" }), bear("B1", "user")]);
    s = leave(s, "user", "B1","graveyard");
    expect(elementals(s)).toBe(0);
  });
});

describe("classifier", () => {
  it("Titania, Protector of Argoth is native-trigger", () => {
    expect(classifyCard(TITANIA)).toBe("native-trigger");
  });
});
