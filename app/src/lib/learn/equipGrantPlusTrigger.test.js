/**
 * equipGrantPlusTrigger.test.js — EQ-GRANT+TRIGGER: an Equipment whose body is a modeled GRANTED
 * activated ability PLUS its own modeled triggered ability (Mask of Immolation).
 *
 * Both halves were already native alone — "ETB + Equip" is native-equipment, and "granted ability +
 * Equip" is native-equipment — and only the two together parked, because
 * isNativeActivatedGrantEquipment's residue walk allowed the Equip line and grant lines and nothing
 * else. A tier COMPOSITION failure, not a missing mechanic: the same shape this file's neighbours fix
 * for Auras (AU-ACT+TRIG, AU-GRANT+STATIC) and for the equipment quoted-grant composite (EQ-3).
 *
 * Composed, not loosened: the trigger line must satisfy permanentTriggersCovered ON ITS OWN, so an
 * unmodeled or unrouted trigger still parks the card. The two halves are delivered by independent
 * runtimes — the trigger fires at the shared enterPermanent chokepoint, the granted ability is
 * enumerated on the host by legalChoices.grantedActivatedForHost.
 *
 * ⭐ DRIVEN ON A BOARD BEFORE THE TIER MOVED, and here that was not ceremony: this card's ETB reads
 * "create a 1/1 red Elemental creature token, THEN ATTACH THIS EQUIPMENT TO IT." A routing check says
 * the effect parses; it cannot say the Equipment ends up attached. Measured: the token is minted and
 * the Equipment really is attached to it.
 *
 * Mutation-checked (2026-08-04, verified applied): the trigger-line allowance removed -> the flip pin
 * goes red; the permanentTriggersCovered vouch replaced with `true` -> the unrouted-trigger park goes
 * red (an Equipment with a nonsense trigger would be credited).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MASK_OF_IMMOLATION = { id: "c-mi", name: "Mask of Immolation", type: "Artifact — Equipment", mana: "{1}{R}",
  oracle: "When this Equipment enters, create a 1/1 red Elemental creature token, then attach this Equipment to it.\nEquipped creature has \"Sacrifice this creature: It deals 1 damage to any target.\"\nEquip {2}" };

describe("recognition", () => {
  it("Mask of Immolation flips to native-equipment", () => {
    expect(classifyCard(MASK_OF_IMMOLATION)).toBe("native-equipment");
  });

  it("each half was ALREADY native alone — this was pure composition", () => {
    const lines = MASK_OF_IMMOLATION.oracle.split("\n");
    expect(classifyCard({ ...MASK_OF_IMMOLATION, id: "c-h1", oracle: [lines[0], lines[2]].join("\n") })).toBe("native-equipment");
    expect(classifyCard({ ...MASK_OF_IMMOLATION, id: "c-h2", oracle: [lines[1], lines[2]].join("\n") })).toBe("native-equipment");
  });

  it("⛔ an UNROUTED trigger still parks the whole card (the vouch is not loosened)", () => {
    expect(classifyCard({ ...MASK_OF_IMMOLATION, id: "c-x", name: "Odd Mask",
      oracle: "When this Equipment enters, interpret the omens however you like.\nEquipped creature has \"Sacrifice this creature: It deals 1 damage to any target.\"\nEquip {2}" })).toBe("body-only");
  });

  it("⛔ an UNMODELED granted ability still parks it too (the other half's gate holds)", () => {
    expect(classifyCard({ ...MASK_OF_IMMOLATION, id: "c-y", name: "Riddle Mask",
      oracle: "When this Equipment enters, create a 1/1 red Elemental creature token.\nEquipped creature has \"Sacrifice this creature: Interpret the omens however you like.\"\nEquip {2}" })).toBe("body-only");
  });

  it("⛔ a non-trigger residue line is still residue (this admits trigger lines only)", () => {
    expect(classifyCard({ ...MASK_OF_IMMOLATION, id: "c-z", name: "Static Mask",
      oracle: "Creatures you control get +9/+9 as long as you have interpreted the omens.\nEquipped creature has \"Sacrifice this creature: It deals 1 damage to any target.\"\nEquip {2}" })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the ETB does something no routing check can see", () => {
  it("entering mints the token AND attaches the Equipment to it", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = enterPermanent(s, MASK_OF_IMMOLATION, "user", {});
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb")).toHaveLength(1);
    s = flushTriggers(s);
    for (let i = 0; i < 4 && s.stack?.length; i++) s = resolveTopOfStack(s);
    const bf = s.players.user.battlefield;
    const token = bf.find((p) => /Elemental/i.test(p.card?.name || ""));
    const mask = bf.find((p) => p.card?.name === "Mask of Immolation");
    expect(token, "the 1/1 Elemental token was not created").toBeTruthy();
    expect(mask.attachedTo).toBe(token.id);                    // ⭐ "then attach this Equipment to it"
    expect(token.attachments).toContain(mask.id);              // and the link is two-way
  });
});
