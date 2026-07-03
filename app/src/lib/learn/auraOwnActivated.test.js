/**
 * auraOwnActivated.test.js — AURA-OWN-ACTIVATED: an activated ability PRINTED ON THE AURA that taps/untaps
 * the ENCHANTED CREATURE (Freed from the Real "{U}: Tap enchanted creature." / "{U}: Untap enchanted
 * creature.", Pemmin's Aura's untap line). Distinct from the GRANTED-ACTIVATED family (which quotes an
 * ability the HOST gains): here the ability lives on the Aura and affects its host through the fixed
 * target:"enchanted" referent — atomTargets resolves it to the Aura's `attachedTo` host at resolution
 * (CR 303.4a), so no player chooses a target.
 *
 * The Aura's printed abilities are enumerated on the AURA permanent (legalChoices.actionsActivateAbility via
 * parseActivatedAbilities) and the tap/untap resolves on the host (combat.applyTapEffect). Recognition
 * (classifyCard) and runtime share the SAME parseActivatedAbilities gate, so they can't drift. CREED
 * boundaries proven here: a self-binding "this creature gets …" ability (which would silently no-op on the
 * non-creature Aura source), an unmodeled co-ability, and every rider (ETB trigger / restriction / P/T bonus)
 * keep the card Arbiter (body-only) — never a partially-modeled or hollow flip.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { enchantedTargets } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

const FREED_ORACLE = "Enchant creature\n{U}: Tap enchanted creature.\n{U}: Untap enchanted creature.";
const aura = (oracle, name = "Freed from the Real") => ({ name, type: "Enchantment — Aura", mana: "{2}{U}", oracle });

// A host creature enchanted with an Aura that has its own printed activated abilities (`auraOracle`).
function setup(auraOracle, { hostTapped = false, detached = false, pool = { W: 0, U: 5, B: 0, R: 0, G: 0, C: 0 } } = {}) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  host.tapped = hostTapped;
  const a = createPermanent({ id: "aura", card: { name: "Freed from the Real", type: "Enchantment — Aura", oracle: auraOracle }, controller: "user" });
  if (!detached) { a.attachedTo = "host"; host.attachments = ["aura"]; }
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [host, a], manaPool: pool } },
  };
}
const auraActs = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "aura");

describe("AURA-OWN-ACTIVATED — recognition (classifyCard)", () => {
  it("Freed from the Real → native-activated (both printed tap/untap-enchanted abilities modeled)", () => {
    expect(classifyCard(aura(FREED_ORACLE))).toBe("native-activated");
  });
  it("a single-ability variant (tap-only, untap-only) still flips native", () => {
    expect(classifyCard(aura("Enchant creature\n{U}: Tap enchanted creature."))).toBe("native-activated");
    expect(classifyCard(aura("Enchant creature\n{U}: Untap enchanted creature."))).toBe("native-activated");
  });

  it("CREED: a self-binding \"this creature gets …\" ability stays Arbiter (no hollow no-op flip)", () => {
    // "This creature" on the non-creature Aura source resolves to [] (selfTargets requires a creature source),
    // so crediting it would be a hollow flip that does nothing — the gate keeps it body-only.
    expect(classifyCard(aura("Enchant creature\n{U}: This creature gets +1/+1 until end of turn."))).toBe("body-only");
    expect(classifyCard(aura("Enchant creature\n{U}: Untap this creature."))).toBe("body-only");
  });
  it("CREED: an unmodeled co-ability keeps the whole card Arbiter (all-or-nothing)", () => {
    expect(classifyCard(aura("Enchant creature\n{U}: Tap enchanted creature.\n{5}: Untap this creature."))).toBe("body-only");
  });
  it("CREED: every rider (ETB trigger / restriction / P/T bonus) keeps the card Arbiter", () => {
    expect(classifyCard(aura("Enchant creature\nWhen this Aura enters, draw a card.\n{U}: Tap enchanted creature."))).toBe("body-only");
    expect(classifyCard(aura("Enchant creature\nEnchanted creature can't attack.\n{U}: Tap enchanted creature."))).toBe("body-only");
    expect(classifyCard(aura("Enchant creature\nEnchanted creature gets +1/+1.\n{U}: Tap enchanted creature."))).toBe("body-only");
  });
  it("CREED: Pemmin's Aura (a REAL sibling with extra unmodeled abilities) stays Arbiter", () => {
    // Pemmin's Aura also grants flying/shroud and a ±1/∓1 pump — those aren't modeled here, so the card
    // must NOT flip on the strength of its one modeled untap line.
    const pemmin = aura("Enchant creature\n{U}: Untap enchanted creature.\n{U}: Enchanted creature gains flying until end of turn.\n{U}: Enchanted creature gains shroud until end of turn.\n{1}: Enchanted creature gets +1/-1 or -1/+1 until end of turn.", "Pemmin's Aura");
    expect(classifyCard(pemmin)).toBe("body-only");
  });
});

describe("AURA-OWN-ACTIVATED — runtime: the Aura taps/untaps its HOST", () => {
  it("both printed abilities are enumerated on the Aura permanent", () => {
    const acts = auraActs(setup(FREED_ORACLE));
    expect(acts).toHaveLength(2);
    expect(acts.map((a) => a.abilityText).sort()).toEqual(["Tap enchanted creature.", "Untap enchanted creature."]);
  });

  it("\"{U}: Tap enchanted creature\" pays {U} and taps the HOST (not the Aura)", () => {
    const s = setup(FREED_ORACLE);
    const tapAct = auraActs(s).find((a) => a.abilityText === "Tap enchanted creature.");
    expect(tapAct).toBeTruthy();
    let d = dispatchAction(s, tapAct);
    expect(d.players.user.manaPool.U).toBe(4);                                            // paid {U}
    expect(d.players.user.battlefield.find((p) => p.id === "aura").tapped).toBeFalsy();   // the Aura does NOT tap
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);    // the HOST taps
    expect(d.players.user.battlefield.find((p) => p.id === "aura").tapped).toBeFalsy();
  });

  it("\"{U}: Untap enchanted creature\" untaps a tapped HOST", () => {
    const s = setup(FREED_ORACLE, { hostTapped: true });
    const untapAct = auraActs(s).find((a) => a.abilityText === "Untap enchanted creature.");
    expect(untapAct).toBeTruthy();
    let d = dispatchAction(s, untapAct);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(false);   // the HOST untaps
  });

  it("the Aura ability is affordable/repeatable — the classic untapper loop taps then untaps the host", () => {
    let s = setup(FREED_ORACLE, { pool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } });
    let d = dispatchAction(s, auraActs(s).find((a) => a.abilityText === "Tap enchanted creature."));
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);
    d = dispatchAction(d, auraActs(d).find((a) => a.abilityText === "Untap enchanted creature."));
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(false);
    expect(d.players.user.manaPool.U).toBe(0);                                            // spent both {U}
  });
});

describe("AURA-OWN-ACTIVATED — referent resolution (enchantedTargets)", () => {
  it("resolves target:\"enchanted\" to the Aura's live host", () => {
    const s = setup(FREED_ORACLE);
    expect(enchantedTargets(s, { sourceId: "aura" })).toEqual([{ type: "creature", id: "host", controller: "user" }]);
  });
  it("a detached Aura (no attachedTo) resolves to [] — a clean no-op, never a fabricated tap", () => {
    const s = setup(FREED_ORACLE, { detached: true });
    expect(enchantedTargets(s, { sourceId: "aura" })).toEqual([]);
  });
});
