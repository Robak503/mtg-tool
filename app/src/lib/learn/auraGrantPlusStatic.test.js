/**
 * auraGrantPlusStatic.test.js — AU-GRANT+STATIC: an Aura that BOTH grants its host an ability AND carries a
 * modeled static bonus. Pillory of the Sleepless · Compulsory Rest · Utopia Vow.
 *
 * ⭐ THIS FILE WAS A PARK-PIN ONE SLICE AGO, AND THE HISTORY IS THE POINT. The classification composite was
 * built first, flipped all three, moved no other tier, and passed every classification test — and was
 * REVERTED, because the runtime test below failed: `parseAttachedBonus` was dropping the Aura's ENTIRE static
 * bonus the moment a granted quoted ability appeared, so the tier would have claimed a "can't attack or
 * block" the engine had silently stopped applying.
 *
 * The runtime half landed first this time (a validator skip in parseAttachedBonus, gated by coverage.js's own
 * grant gates via the same registry seam the aura-own-ETB/activated validators use), and only then the tier.
 * ⭐ A metric that runs ahead of its runtime is worse than a parked card.
 *
 * ⛔ THE POSITIVE CONTROL STAYS. It is what made the original failure readable: a bare `false` out of a
 * hand-built harness is noise — two earlier falses in this same harness were my own signature errors
 * (`attachedTo` set by hand; then `attachPermanent` called with the wrong argument shape). Only when the
 * pure-bonus control read TRUE in the SAME harness did the composite's `false` become evidence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle, read out of the bundled index.
const PILLORY = { name: "Pillory of the Sleepless", type: "Enchantment — Aura", mana: "{1}{W}{B}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"At the beginning of your upkeep, you lose 1 life.\"" };
const COMPULSORY_REST = { name: "Compulsory Rest", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"{2}, Sacrifice this creature: You gain 2 life.\"" };
const UTOPIA_VOW = { name: "Utopia Vow", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\nEnchanted creature has \"{T}: Add one mana of any color.\"" };
const UNMODELED_GRANT = "Enchanted creature has \"Whenever a player consults an oracle, interpret its riddle however you like.\"";

/** Attach a fresh Aura to a bear through the REAL attach path and report the host's restriction. */
function hostCantAttack(auraOracle) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
  const aura = createPermanent({ id: "aura", card: { id: "c-aura", name: "A", type: "Enchantment — Aura", oracle: auraOracle }, controller: "user" });
  let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, aura] } } };
  s = attachPermanent(s, { equipId: "aura", targetId: "bear" });
  return permanentHasKeyword(s, "bear", "cantAttack");
}

describe("⭐ RUNTIME — the static bonus survives alongside a granted ability", () => {
  it("POSITIVE CONTROL — a pure-bonus Aura pins the host down", () => {
    // Without this the assertions below are unreadable: a false could just mean a broken harness.
    expect(hostCantAttack("Enchant creature\nEnchanted creature can't attack or block.")).toBe(true);
  });

  it("⭐ THE FIX — the same bonus still applies with a MODELED grant line present", () => {
    expect(hostCantAttack(PILLORY.oracle)).toBe(true);
  });

  it("⛔ CREED — an UNMODELED grant still poisons the parse, so the bonus drops and the card can't be credited", () => {
    // The skip is validator-gated on purpose: a grant the engine cannot deliver must not buy the card its
    // static half. This is what keeps The Reaver Cleaver (unmodeled granted body) unchanged.
    expect(hostCantAttack(`Enchant creature\nEnchanted creature can't attack or block.\n${UNMODELED_GRANT}`)).toBe(false);
  });
});

describe("classification — the three carriers flip to their GRANT half's tier", () => {
  it("each lands on the tier its grant would have had alone", () => {
    expect(classifyCard(PILLORY)).toBe("native-trigger");
    expect(classifyCard(COMPULSORY_REST)).toBe("native-activated");
    expect(classifyCard(UTOPIA_VOW)).toBe("native-mana-aura");
  });

  it("⛔ an UNMODELED grant parks the whole card even beside a perfectly modeled bonus", () => {
    expect(classifyCard({ ...PILLORY, name: "Fake Pillory", oracle: `Enchant creature\nEnchanted creature can't attack or block.\n${UNMODELED_GRANT}` }))
      .not.toMatch(/^native/);
  });

  it("⛔ an UNMODELED static bonus parks it too — both halves must stand on their own gate", () => {
    expect(classifyCard({ ...PILLORY, name: "Fake Pillory 2",
      oracle: "Enchant creature\nWhenever a player consults an oracle, interpret its riddle however you like.\nEnchanted creature has \"At the beginning of your upkeep, you lose 1 life.\"" }))
      .not.toMatch(/^native/);
  });

  it("⛔ the composite does NOT steal a card a plain lane already owns (priority preserved)", () => {
    expect(classifyCard({ ...PILLORY, name: "Pure Grant",
      oracle: "Enchant creature\nEnchanted creature has \"At the beginning of your upkeep, you lose 1 life.\"" })).toBe("native-trigger");
    expect(classifyCard({ ...PILLORY, name: "Pure Bonus",
      oracle: "Enchant creature\nEnchanted creature can't attack or block." })).toBe("native-aura");
  });
});
