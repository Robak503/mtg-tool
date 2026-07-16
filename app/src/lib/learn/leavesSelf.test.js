/**
 * leavesSelf.test.js — BLITZ LV-1 (CR 603.6c): the SELF "leaves the battlefield" event, ANY exit.
 * Covers the "enters or leaves the battlefield" disjunction split (Aven Riftwatcher / Brandywine Farmer)
 * AND the standalone LTB sentence (Thragtusk's Beast). checkLeavesTriggers fires leavesSelf off the leave
 * look-back for EVERY exit — graveyard, exile, bounce, tuck — unlike the graveyard-gated "ltb" self-PiG.
 * Also pins the fading/vanishing REMINDER strip: the keyword's reminder carries real trigger sentences
 * that used to parse as phantom unroutable descriptors and park every vanishing+trigger card.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, checkLeavesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const THRAGTUSK = { id: "tt", name: "Thragtusk", type: "Creature — Beast", power: "5", toughness: "3", mana: "{4}{G}",
  oracle: "When this creature enters, you gain 5 life.\nWhen this creature leaves the battlefield, create a 3/3 green Beast creature token." };
const RIFTWATCHER = { id: "ar", name: "Aven Riftwatcher", type: "Creature — Bird Rebel Soldier", power: "2", toughness: "3", mana: "{1}{W}{W}",
  oracle: "Flying\nVanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature enters or leaves the battlefield, you gain 2 life." };

describe("detection + classify", () => {
  it("the split + the standalone LTB sentence detect as leavesSelf and route; the vanishing reminder no longer phantoms", () => {
    const rift = detectTriggers(RIFTWATCHER);
    expect(rift.map((t) => t.event).sort()).toEqual(["etb", "leavesSelf"]); // no phantom upkeep descriptor
    expect(rift.every((t) => triggerRoutesNatively(t))).toBe(true);
    const thrag = detectTriggers(THRAGTUSK);
    expect(thrag.map((t) => t.event).sort()).toEqual(["etb", "leavesSelf"]);
    expect(classifyCard(THRAGTUSK)).toBe("native-trigger");
    expect(classifyCard(RIFTWATCHER)).toBe("native-trigger");
    // A WATCHER form never detects as leavesSelf (safe FN).
    expect(detectTriggers({ oracle: "Whenever another creature you control leaves the battlefield, draw a card.", type: "Creature", name: "Watcher" })
      .filter((t) => t.event === "leavesSelf")).toHaveLength(0);
  });
});

describe("runtime — any exit fires it (bounce included)", () => {
  it("Thragtusk BOUNCED to hand still makes the Beast (CR 603.6c — no zone gate)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const thrag = createPermanent({ id: "tt", card: THRAGTUSK, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [thrag] } } };
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "tt" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.descriptor?.event === "leavesSelf")).toBe(true);
    s = flushTriggers(s, "user");
    let guard = 0;
    while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some((p) => /Beast/.test(String(p.card?.type || "")) && p.card?.token)).toBe(true);
    expect(s.players.user.hand.some((c) => c.name === "Thragtusk")).toBe(true); // the bounce really happened
  });
});
