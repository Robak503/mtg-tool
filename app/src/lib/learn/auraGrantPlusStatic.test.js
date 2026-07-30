/**
 * auraGrantPlusStatic.test.js — ⛔ A CREED PARK-PIN WITH A RUNTIME PROOF ATTACHED.
 *
 * Pillory of the Sleepless · Compulsory Rest · Utopia Vow all print BOTH a modeled static bonus
 * ("Enchanted creature can't attack or block.") AND a modeled granted ability
 * ("Enchanted creature has \"…\""). Each half classifies native ALONE. The pair parks.
 *
 * ⭐ THAT LOOKS EXACTLY LIKE A MISSING COMPOSITE, AND I BUILT ONE. It flipped all three to their grant
 * half's tier, no other tier moved, and every classification test passed. **Then the runtime test failed**,
 * and the positive control below is what made the failure readable rather than dismissable:
 *
 *   pure-bonus Aura      → cantAttack = TRUE    (the harness works)
 *   composite Aura       → cantAttack = FALSE   (the static half is DEAD)
 *
 * ⛔ **Adding the quoted grant line stops the Aura's own static bonus from applying at all.** So the
 * composite would have been a textbook false positive: Pillory reading `native-trigger` while the creature
 * it is supposed to pin down attacks freely. The classification change was REVERTED; these three stay parked.
 *
 * ⭐ THE ORDER OF WORK IS THE LESSON. The metric change was the easy half and it was ready first; the
 * runtime was the real work and it was not done. A tier that claims what the engine does not do is worse
 * than a parked card, so the tier waits. **Fix the LAYER half first** — make the aura-bonus path tolerate a
 * quoted-grant line so the bonus still reaches the host — and only then re-add the composite lane, which is
 * a ~15-line strip-then-revalidate on the EQ-2 (nativeStaticGrantPlusActivated) pattern.
 *
 * This file exists so the next attempt starts from the proof instead of repeating the build.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const PILLORY = { name: "Pillory of the Sleepless", type: "Enchantment — Aura", mana: "{1}{W}{B}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"At the beginning of your upkeep, you lose 1 life.\"" };
const COMPULSORY_REST = { name: "Compulsory Rest", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"{2}, Sacrifice this creature: You gain 2 life.\"" };
const UTOPIA_VOW = { name: "Utopia Vow", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"{T}: Add one mana of any color.\"" };

/** Attach a fresh Aura to a bear through the REAL attach path and report the host's restriction. */
function hostCantAttack(auraOracle) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
  const aura = createPermanent({ id: "aura", card: { id: "c-aura", name: "A", type: "Enchantment — Aura", oracle: auraOracle }, controller: "user" });
  let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, aura] } } };
  s = attachPermanent(s, { equipId: "aura", targetId: "bear" });
  return permanentHasKeyword(s, "bear", "cantAttack");
}

describe("⭐ THE RUNTIME DEFECT, PROVEN — a quoted grant kills the Aura's own static bonus", () => {
  it("POSITIVE CONTROL — a pure-bonus Aura really does pin the host down", () => {
    // Without this the negative below would be unreadable: a false could just mean a broken harness.
    expect(hostCantAttack("Enchant creature\nEnchanted creature can't attack or block.")).toBe(true);
  });

  it("⛔ the SAME bonus stops applying once a quoted grant line is added", () => {
    expect(hostCantAttack(PILLORY.oracle)).toBe(false);
  });
});

describe("⛔ CREED PARK-PIN — these three must stay parked until the runtime above is fixed", () => {
  // ⚠️ DO NOT flip these by adding a classification composite. That was tried, it worked at the tier level,
  // and it was reverted BECAUSE of the runtime defect proven above. When the layer half is fixed, change
  // these expectations in the SAME commit as the fix — never ahead of it.
  it("Pillory of the Sleepless / Compulsory Rest / Utopia Vow", () => {
    expect(classifyCard(PILLORY)).toBe("body-only");
    expect(classifyCard(COMPULSORY_REST)).toBe("body-only");
    expect(classifyCard(UTOPIA_VOW)).toBe("body-only");
  });

  it("the two halves each remain native ALONE — which is what made the composite look free", () => {
    expect(classifyCard({ ...PILLORY, name: "Pure Bonus", oracle: "Enchant creature\nEnchanted creature can't attack or block." })).toBe("native-aura");
    expect(classifyCard({ ...PILLORY, name: "Pure Grant", oracle: "Enchant creature\nEnchanted creature has \"At the beginning of your upkeep, you lose 1 life.\"" })).toBe("native-trigger");
  });
});
