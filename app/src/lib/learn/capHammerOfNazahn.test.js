/**
 * capHammerOfNazahn.test.js — the NAZAHN-ATTACH triggering-equipment referent (SHELF CAP7 —
 * Hammer of Nazahn).
 *
 * "Whenever Hammer of Nazahn or another Equipment you control enters, you may attach that Equipment
 * to target creature you control." The subtype-ETB lane already DETECTED the condition (the
 * self-or-another union reduces to subtypeFilter:Equipment — Nazahn IS an Equipment); the effect was
 * the whole gap: "that Equipment" is the ENTERING equipment (CR 608.2c), so the rewrite maps it to
 * the self-attach atom's attachFrom:"triggering" variant (applySelfAttach reads
 * ctx.triggeringPermanentId instead of ctx.sourceId; the chosen creature rides ctx.targets).
 * CREED FP = attaching NAZAHN when a different equipment entered, firing on a non-Equipment entry,
 * or firing on an opponent's equipment.
 *
 * Real oracle fixture (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NAZAHN = { id: "c-hn", name: "Hammer of Nazahn", type: "Legendary Artifact — Equipment", mana: "{4}",
  oracle: "Whenever Hammer of Nazahn or another Equipment you control enters, you may attach that Equipment to target creature you control.\nEquipped creature gets +2/+0 and has indestructible.\nEquip {4}" };
const SWORD = { id: "c-sw", name: "Short Sword", type: "Artifact — Equipment", mana: "{1}",
  oracle: "Equipped creature gets +1/+1.\nEquip {1}" };

const perm = (card, id, controller = "user", over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function board(extra = []) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const mine = [perm(NAZAHN, "hammer"), perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear"), ...extra];
  return { ...b, activePlayer: "user", priorityHolder: "user",
    players: { ...b.players, user: { ...b.players.user, battlefield: mine } } };
}
function resolveAll(state, { accept = true } = {}) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) {
    s = resolveTopOfStack(s);
    // The "you may attach" α2 wrapper suspends on a REAL yes/no (optional-effect); answer it.
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, accept);
  }
  return s;
}

describe("detection + classify", () => {
  it("⭐ the union detects via the subtype-ETB lane; the effect rewrites to the triggering-equipment sentinel; Nazahn flips", () => {
    const [t] = detectTriggers(NAZAHN);
    expect(t).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Equipment", optional: true });
    expect(t.effectClause).toBe("you may attach the triggering equipment to target creature you control");
    expect(triggerRoutesNatively(t, NAZAHN)).toBe(true);
    expect(classifyCard(NAZAHN)).toBe("native-equipment");
  });

  it("⛔ a rider on the attach clause stays unrewritten and parks (whole-clause anchor)", () => {
    const v = { ...NAZAHN, id: "c-v", name: "Odd Hammer",
      oracle: "Whenever Odd Hammer or another Equipment you control enters, you may attach that Equipment to target creature you control and draw a card.\nEquip {4}" };
    const ds = detectTriggers(v);
    if (ds.length) expect(triggerRoutesNatively(ds[0], v)).toBe(false);
    expect(classifyCard(v)).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the ENTERING equipment is the one attached (never the source)", () => {
  it("⭐ another Equipment enters → the trigger fires and THAT equipment attaches to the creature", () => {
    const sword = perm(SWORD, "sword");
    let s = board([sword]);
    s = checkEnterTriggers(s, sword);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveAll(s);
    const sw = findPermanent(s, "sword");
    expect(sw.permanent.attachedTo).toBe("bear");            // the ENTERING equipment moved
    expect(findPermanent(s, "hammer").permanent.attachedTo).toBeNull(); // Nazahn itself stayed put
  });

  it("Nazahn's OWN entry fires it too (the union's self half) and attaches Nazahn", () => {
    let s = board();
    const hammer = findPermanent(s, "hammer").permanent;
    s = checkEnterTriggers(s, hammer);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveAll(s);
    expect(findPermanent(s, "hammer").permanent.attachedTo).toBe("bear");
  });

  it("⛔ FP guards — a NON-Equipment artifact entering, and an OPPONENT's equipment entering, both fire nothing", () => {
    const rock = perm({ name: "Mind Stone", type: "Artifact", oracle: "" }, "rock");
    let s = board([rock]);
    expect((checkEnterTriggers(s, rock).pendingTriggers || []).length).toBe(0);
    const theirs = perm(SWORD, "osword", "ai");
    let s2 = board();
    s2 = { ...s2, players: { ...s2.players, ai: { ...s2.players.ai, battlefield: [theirs] } } };
    expect((checkEnterTriggers(s2, theirs).pendingTriggers || []).length).toBe(0);
  });
});
