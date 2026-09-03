/**
 * auraBonusSurvivesOwnAbility.test.js — an Aura's own ACTIVATED line must not swallow its P/T grant.
 *
 * ⛔ THIS FIXES FOUR LIVE FALSE POSITIVES, not a coverage gap. Dark Privilege #11269, Gaea's Embrace,
 * Serpent Skin and The Brute were all credited NATIVE while their printed "+N/+N" never reached the
 * battlefield — attach any of them to a 2/2 and the host stayed 2/2.
 *
 * Cause: `parseAuraBonus` is all-or-nothing by design, and an Aura's own regenerate line was not on the
 * skip list, so it poisoned the bonus parse to []. The EQ-2 composite still credited the card, because
 * it strips that line and asks isNativeAura about the REMAINDER — reasoning about text the layer engine
 * never sees. Two gates each right about their own half; neither checking the printed card.
 *
 * ⚠️ NO STATIC INSTRUMENT COULD SEE IT. The tier said native, the residue walk was satisfied, and a
 * per-card tier diff showed nothing because nothing moved. Every assertion below that matters therefore
 * reads the HOST'S DERIVED P/T on a real board, not the tier.
 *
 * ⚠️ AND WIDENING THE SKIP RE-OPENED A DIFFERENT FP, caught by two pins that already existed. Letting
 * ANY cost-bearing line be skipped meant a SELF-SAC aura (Briar Shield, Thrull Retainer, Stamina,
 * Carapace) kept its static half and went native — but sacrificing the Aura DETACHES the host, so the
 * ability can't resolve onto it. GUARD-LEAVE lived only in the composite; it belongs on this path too.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const A = (name, oracle) => ({ name, type: "Enchantment — Aura", mana: "{1}{G}", keywords: [], oracle });

const DARK_PRIVILEGE = A("Dark Privilege", "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice a creature: Regenerate enchanted creature.");
const SERPENT_SKIN = A("Serpent Skin", "Flash\nEnchant creature\nEnchanted creature gets +1/+1.\n{G}: Regenerate enchanted creature.");
const THE_BRUTE = A("The Brute", "Enchant creature\nEnchanted creature gets +1/+0.\n{R}{R}{R}: Regenerate enchanted creature.");
const GAEAS_EMBRACE = A("Gaea's Embrace", "Enchant creature\nEnchanted creature gets +3/+3 and has trample.\n{G}: Regenerate enchanted creature.");
const THRULL_RETAINER = A("Thrull Retainer", "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Regenerate enchanted creature.");
const BRIAR_SHIELD = A("Briar Shield", "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Enchanted creature gets +3/+3 until end of turn.");

/** Attach `aura` to a vanilla 2/2 and report the host's LIVE power/toughness. */
function hostPT(aura) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "bear", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const au = createPermanent({ id: "au", card: aura, controller: "user" });
  au.attachedTo = "bear";
  bear.attachments = ["au"];
  const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, au] } } };
  return `${permanentPower(s, "bear")}/${permanentToughness(s, "bear")}`;
}

describe("THE FIX — the grant reaches the board, checked on the board", () => {
  it("THE LOAD-BEARING ONE — all four now actually pump their host", () => {
    expect(hostPT(DARK_PRIVILEGE)).toBe("3/3");
    expect(hostPT(SERPENT_SKIN)).toBe("3/3");
    expect(hostPT(THE_BRUTE)).toBe("3/2");
    expect(hostPT(GAEAS_EMBRACE)).toBe("5/5");   // the "+3/+3 and has trample" union too
  });

  it("the bonus parse is non-empty — the regen line no longer poisons it", () => {
    for (const a of [DARK_PRIVILEGE, SERPENT_SKIN, THE_BRUTE, GAEAS_EMBRACE]) {
      expect(parseAuraBonus(a).length).toBeGreaterThan(0);
    }
  });

  it("and they classify through the plain AURA tier, which is where they belong", () => {
    for (const a of [DARK_PRIVILEGE, SERPENT_SKIN, THE_BRUTE, GAEAS_EMBRACE]) {
      expect(classifyCard(a)).toBe("native-aura");
    }
  });

  it("A NON-MANA COST IS THE POINT of Dark Privilege — the pre-filter used to require a mana symbol", () => {
    // "Sacrifice a creature:" has no {mana} before the colon, so the old pre-filter never handed the line
    // to the validator and the bonus stayed poisoned. Its cost sacrifices a DIFFERENT creature, so the
    // Aura stays attached and the regen still binds the host.
    expect(parseAuraBonus(DARK_PRIVILEGE)).toHaveLength(1);
  });
});

describe("GUARD-LEAVE re-scoped (④-Q, 2026-09-03) — a SELF-SAC cost no longer parks: the host is read by LKI", () => {
  it("the four former FPs are honest natives now — sacrificing the Aura stamps its host on the activation (CR 113.7a)", () => {
    // Widening the pre-filter to any cost once made these skip their self-sac line and go native while the effect
    // could not bind the detached host — four false positives, caught here. The runtime half exists now: the
    // dispatcher stamps the host as the cost is paid and enchantedTargets reads it once the Aura is gone
    // (hostSacLki.test.js drives Briar Shield's +3/+3 and Thrull Retainer's regen onto the host). Exile-self costs,
    // equipped referents and text-only host mentions still park.
    expect(classifyCard(THRULL_RETAINER)).toMatch(/^native/);
    expect(classifyCard(BRIAR_SHIELD)).toMatch(/^native/);
  });

  it("…and their static half survives the bonus parse, so the +1/+1 is applied while attached", () => {
    expect(parseAuraBonus(THRULL_RETAINER)).toHaveLength(1);
    expect(parseAuraBonus(BRIAR_SHIELD)).toHaveLength(1);
  });
});

describe("REGRESSION — the shapes that were already right", () => {
  it("a pure regen Aura with no static half is still native-activated", () => {
    expect(classifyCard(A("Regeneration", "Enchant creature\n{G}: Regenerate enchanted creature."))).toBe("native-activated");
  });

  it("a plain static Aura is unchanged", () => {
    expect(hostPT(A("Baseline", "Enchant creature\nEnchanted creature gets +1/+1."))).toBe("3/3");
  });

  it("an aura whose own ability is UNMODELED still parks (all-or-nothing intact)", () => {
    expect(classifyCard(A("Odd Aura", "Enchant creature\nEnchanted creature gets +1/+1.\n{G}: Choose a card name at random from outside the game."))).toBe("body-only");
  });
});
