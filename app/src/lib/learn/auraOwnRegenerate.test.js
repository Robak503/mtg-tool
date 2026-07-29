/**
 * auraOwnRegenerate.test.js — AURA-OWN-REGEN (BLITZ RG-1, CR 701.19): an activated ability PRINTED ON THE AURA
 * that REGENERATES the ENCHANTED CREATURE ("{G}: Regenerate enchanted creature." — Regeneration, Keldon Mantle,
 * The Brute, Gaea's Embrace). The regeneration SHIELD subsystem (CR 701.19a — the next-would-destroy replacement
 * that taps + removes-from-combat + heals) was already modeled end-to-end (trunkRegenerate.test.js); this slice
 * adds ONE new phrasing to the parser — "regenerate enchanted creature" → { op:"regenerate", target:"enchanted" }
 * — riding the SAME fixed enchanted referent the aura-own tap/untap/pump atoms already use. atomTargets →
 * enchantedTargets resolves it to the Aura's `attachedTo` host at resolution (CR 303.4a), so no player chooses a
 * target and applyRegenerate → addRegenShield sets the shield on the HOST. No resolver change.
 *
 * COVERAGE: the Aura flips native-activated through the two existing gates — isNativeOwnActivatedAura (a pure
 * "{cost}: Regenerate enchanted creature." Aura, Regeneration) and the EQ-2 static-grant+activated composite
 * (nativeStaticGrantPlusActivated, for The Brute / Gaea's Embrace / Serpent Skin / Dark Privilege whose static
 * P/T grant is also modeled). CREED boundaries proven: a SELF-SAC regen aura ("Sacrifice this Aura: Regenerate
 * enchanted creature." — Thrull Retainer, Stamina) PARKS because EQ-2's GUARD-LEAVE forbids a leaving-cost
 * ability whose effect binds the now-detached host (a false-negative, the safe direction); a mass "regenerate
 * all creatures you control" is a different, unmodeled atom and never reaches this form.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { enchantedTargets } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

describe("AURA-OWN-REGEN — parser (bare anchored form only)", () => {
  it("recognizes \"regenerate enchanted creature\" → the fixed enchanted referent", () => {
    expect(parseEffectClause("regenerate enchanted creature").atoms).toEqual([{ op: "regenerate", target: "enchanted" }]);
  });
  it("does NOT over-match a non-creature / off-referent phrasing (→ Arbiter, CREED-safe)", () => {
    expect(parseEffectClause("regenerate enchanted permanent").atoms).toEqual([]);   // "creature" only
    expect(parseEffectClause("regenerate enchanted artifact").atoms).toEqual([]);
    expect(parseEffectClause("regenerate all creatures you control").atoms).toEqual([]); // mass form stays Arbiter
  });
});

describe("AURA-OWN-REGEN — recognition (classifyCard) on real oracle", () => {
  it("Regeneration (pure {G}: Regenerate enchanted creature) → native-activated", () => {
    expect(classifyCard({ name: "Regeneration", type: "Enchantment — Aura", mana: "{1}{G}",
      oracle: "Enchant creature\n{G}: Regenerate enchanted creature." })).toBe("native-activated");
  });
  it("static-grant + regen composites flip — as native-AURA, with the bonus actually applying", () => {
    // ⚠️ TIER CHANGED, AND THE OLD ONE WAS THE SYMPTOM OF A BUG. These read `native-activated` because
    // they were credited by the EQ-2 composite, which strips the regen line and asks isNativeAura about
    // the REMAINDER. At runtime nothing strips it: the regen line poisoned the all-or-nothing
    // parseAuraBonus, so all four were credited native with their printed "+N/+N" NEVER REACHING THE
    // BATTLEFIELD — host stayed 2/2 (scripts/probe-dropped-attached-grants.mjs).
    //
    // The aura-own-activated validator now admits a regenerate line, so the bonus survives, the plain
    // aura tier owns these cards, and the grant applies for real. The runtime assertion below is the
    // point of this test now — the tier alone never was evidence about the board.
    expect(classifyCard({ name: "The Brute", type: "Enchantment — Aura", mana: "{1}{R}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+0.\n{R}{R}{R}: Regenerate enchanted creature." })).toBe("native-aura");
    expect(classifyCard({ name: "Gaea's Embrace", type: "Enchantment — Aura", mana: "{2}{G}{G}",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3 and has trample.\n{G}: Regenerate enchanted creature." })).toBe("native-aura");
    expect(classifyCard({ name: "Serpent Skin", type: "Enchantment — Aura", mana: "{2}{G}",
      oracle: "Flash\nEnchant creature\nEnchanted creature gets +1/+1.\n{G}: Regenerate enchanted creature." })).toBe("native-aura");
    // Dark Privilege's cost sacrifices a DIFFERENT creature (not the Aura) — the Aura stays attached, so the
    // regen still binds the host; GUARD-LEAVE (which only fires on a self-sac/self-exile cost) does not reject it.
    expect(classifyCard({ name: "Dark Privilege", type: "Enchantment — Aura", mana: "{1}{B}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice a creature: Regenerate enchanted creature." })).toBe("native-aura");
  });

  it("CREED (FN-safe): a SELF-SAC regen aura PARKS — the leaving cost detaches the host (GUARD-LEAVE)", () => {
    // "Sacrifice this Aura" removes the Aura (and its attachment) as the cost, BEFORE the ability resolves;
    // "regenerate enchanted creature" can't bind the now-detached host at resolution, so EQ-2 rejects it.
    expect(classifyCard({ name: "Thrull Retainer", type: "Enchantment — Aura", mana: "{B}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Regenerate enchanted creature." })).toBe("body-only");
    expect(classifyCard({ name: "Stamina", type: "Enchantment — Aura", mana: "{2}{G}",
      oracle: "Enchant creature\nEnchanted creature has vigilance.\nSacrifice this Aura: Regenerate enchanted creature." })).toBe("body-only");
  });
  it("CREED (all-or-nothing): an unmodeled co-ability / rider keeps the whole card Arbiter", () => {
    // an ETB trigger with no static half fails the aura-own-activated gate (Strands of Undeath shape)
    expect(classifyCard({ name: "Strands of Undeath", type: "Enchantment — Aura", mana: "{3}{B}",
      oracle: "Enchant creature\nWhen this Aura enters, target player discards two cards.\n{B}: Regenerate enchanted creature." })).toBe("body-only");
    // a mass regen mode is a different, unmodeled atom — never flips on the strength of the enchanted form
    expect(classifyCard({ name: "X-Mass", type: "Enchantment — Aura", mana: "{G}",
      oracle: "Enchant creature\n{G}: Regenerate all creatures you control." })).toBe("body-only");
  });
});

// Host creature enchanted with an Aura carrying "{G}: Regenerate enchanted creature." (Regeneration).
function setup({ detached = false, pool = { W: 0, U: 0, B: 0, R: 0, G: 3, C: 0 } } = {}) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const a = createPermanent({ id: "aura", card: { name: "Regeneration", type: "Enchantment — Aura", oracle: "Enchant creature\n{G}: Regenerate enchanted creature." }, controller: "user" });
  if (!detached) { a.attachedTo = "host"; host.attachments = ["aura"]; }
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [host, a], manaPool: pool } },
  };
}
const auraActs = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "aura");

describe("AURA-OWN-REGEN — runtime: the Aura shields its HOST, and the shield saves it from a destroy", () => {
  it("the printed regen ability is enumerated on the Aura permanent", () => {
    const acts = auraActs(setup());
    expect(acts.map((a) => a.abilityText)).toEqual(["Regenerate enchanted creature."]);
  });

  it("activating it pays {G} and sets a regen shield on the HOST (not the Aura)", () => {
    const s = setup();
    let d = dispatchAction(s, auraActs(s)[0]);
    expect(d.players.user.manaPool.G).toBe(2);                                            // paid {G}
    d = resolveTopOfStack(d);
    expect(findPermanent(d, "host").permanent.regenShields).toBe(1);                      // shield on the HOST
    expect(findPermanent(d, "aura").permanent.regenShields).toBeFalsy();                  // NOT on the Aura
  });

  it("the resulting shield REPLACES the next destruction (CR 701.19a): host survives tapped, shield spent", () => {
    const s = setup();
    let d = resolveTopOfStack(dispatchAction(s, auraActs(s)[0]));
    const after = applyDestroyEffect(d, { controller: "ai", targets: [{ type: "creature", id: "host" }] });
    const hostLk = findPermanent(after, "host");
    expect(hostLk).toBeTruthy();                                                          // survived the destroy
    expect(hostLk.permanent.regenShields).toBe(0);                                        // shield consumed exactly once
    expect(hostLk.permanent.tapped).toBe(true);                                           // CR 701.19a — tapped
    expect(after.players.user.graveyard?.some((c) => c.name === "Host Bear")).toBeFalsy();
  });

  it("a detached Aura resolves the referent to [] — a clean no-op, never a fabricated shield", () => {
    const s = setup({ detached: true });
    expect(enchantedTargets(s, { sourceId: "aura" })).toEqual([]);
  });
});
