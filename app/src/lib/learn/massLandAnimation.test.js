/**
 * massLandAnimation.test.js — BLITZ NV-1: "All lands are N/N creatures that are still lands."
 * (Nature's Revolt 2/2, Living Plane 1/1 — the only two carriers of the exact color-free line.)
 *
 * The line parses to TWO REAL layer descriptors on a dynamic every-land selector (no controller
 * scope — symmetric, CR 109.2): a layer-4 Creature ADD ("still lands" = additive, CR 613.1d) and a
 * layer-7b base-P/T SET (CR 613.3b/613.4a). Consequences pinned here:
 *   • every land, every player, is an N/N creature while the carrier is out; anthems/counters apply
 *     ON TOP of the base set (7b before 7c — effectiveTypeIdentity's dynamic-add branch lets a
 *     "creatures you control" selector see the animated type);
 *   • animated lands attack/block through the normal layer-aware combat reads, and DIE to lethal
 *     damage (the SBA reads layered P/T);
 *   • CR 302.6 — a land played THIS turn is a summoning-sick creature: no attacking AND no {T}
 *     mana ability until its controller's next turn (layers.summoningSickNow, enforced at the
 *     declare-attacker / tap-for-mana / manaSources gates); a land in play since an earlier turn is
 *     unaffected, and the moment the carrier leaves even the fresh land taps again (not a creature);
 *   • the whole animation lifts LIVE when the carrier leaves.
 * PARKED: Kormus Bell ("All Swamps are 1/1 BLACK creatures that are still lands") — the layer-5
 * color set has no delivery into selector color reads; admitting it would silently drop the "black"
 * half (a CREED half-enforcement). Pinned body-only.
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { manaSources } from "./manaModel.js";
import { permanentIsCreature, permanentPower, permanentToughness, summoningSickNow } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NATURES_REVOLT = { id: "nr", name: "Nature's Revolt", type: "Enchantment", mana: "{3}{G}{G}",
  oracle: "All lands are 2/2 creatures that are still lands." };
const LIVING_PLANE = { id: "lp", name: "Living Plane", type: "World Enchantment", mana: "{2}{G}{G}",
  oracle: "All lands are 1/1 creatures that are still lands." };
const KORMUS_BELL = { id: "kb", name: "Kormus Bell", type: "Artifact", mana: "{4}",
  oracle: "All Swamps are 1/1 black creatures that are still lands." };
const FOREST = { id: "fo", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const MOUNTAIN = { id: "mt", name: "Mountain", type: "Basic Land — Mountain", oracle: "({T}: Add {R}.)" };
const ANTHEM = { id: "ga", name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}",
  oracle: "Creatures you control get +1/+1." };

describe("parse + classify", () => {
  it("Nature's Revolt and Living Plane flip native-static", () => {
    expect(classifyCard(NATURES_REVOLT)).toBe("native-static");
    expect(classifyCard(LIVING_PLANE)).toBe("native-static");
  });
  it("PARKED — Kormus Bell's color half is unmodeled, the whole card stays body-only (CREED)", () => {
    expect(classifyCard(KORMUS_BELL)).toBe("body-only");
  });
});

describe("runtime — the mass animation", () => {
  const perm = (id, card, over = {}) => Object.assign(
    createPermanent({ id, card, controller: over.controller || "user", summoningSick: false }),
    { enteredOnTurn: 1, ...over });
  function board(userBf, aiBf = []) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return { ...base, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...base.players, user: { ...base.players.user, battlefield: userBf }, ai: { ...base.players.ai, battlefield: aiBf } } };
  }

  it("every land on EVERY battlefield is an N/N creature; the values track the carrier's printed N", () => {
    const s = board([perm("rev", NATURES_REVOLT), perm("f1", FOREST)], [perm("m1", MOUNTAIN, { controller: "ai" })]);
    expect(permanentIsCreature(s, "f1")).toBe(true);
    expect(`${permanentPower(s, "f1")}/${permanentToughness(s, "f1")}`).toBe("2/2");
    expect(permanentIsCreature(s, "m1")).toBe(true); // symmetric — the opponent's land animates too
    expect(`${permanentPower(s, "m1")}/${permanentToughness(s, "m1")}`).toBe("2/2");
    const lp = board([perm("lp", LIVING_PLANE), perm("f1", FOREST)]);
    expect(`${permanentPower(lp, "f1")}/${permanentToughness(lp, "f1")}`).toBe("1/1");
  });

  it("anthems apply ON TOP of the 7b base set (CR 613.3 — a selector sees the animated type)", () => {
    const s = board([perm("lp", LIVING_PLANE), perm("f1", FOREST), perm("an", ANTHEM)]);
    expect(`${permanentPower(s, "f1")}/${permanentToughness(s, "f1")}`).toBe("2/2"); // 1/1 base + 1/1 anthem
  });

  it("an animated land attacks (in play since an earlier turn) and DIES to lethal damage", () => {
    const s = board([perm("rev", NATURES_REVOLT), perm("f1", FOREST)]);
    const combat = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect(legalActionsForPlayer(combat, "user").some((a) => a.kind === "declare-attacker" && a.permanentId === "f1")).toBe(true);
    // Lethal SBA reads the LAYERED P/T: a 1/1 Living Plane land with 1 damage marked dies…
    const dmg = board([perm("lp", LIVING_PLANE), perm("f1", FOREST, { damageMarked: 1 })]);
    const out = destroyLethalCreatures(dmg);
    expect(out.dead.some((d) => d.id === "f1")).toBe(true);
    // …and the SAME damaged land without a carrier is not a creature and survives.
    const noCarrier = destroyLethalCreatures(board([perm("f1", FOREST, { damageMarked: 1 })]));
    expect(noCarrier.dead).toHaveLength(0);
  });

  it("CR 302.6 — a land played THIS turn is a sick creature: no attack, no {T} mana; an old land is fine", () => {
    const s = board([perm("rev", NATURES_REVOLT), perm("oldf", FOREST), perm("newf", FOREST, { enteredOnTurn: 4 })]);
    expect(summoningSickNow(s, s.players.user.battlefield.find((p) => p.id === "newf"))).toBe(true);
    expect(summoningSickNow(s, s.players.user.battlefield.find((p) => p.id === "oldf"))).toBe(false);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana").map((a) => a.permanentId)).toEqual(["oldf"]);
    expect(manaSources(s, "user").map((x) => x.permanentId)).toEqual(["oldf"]);
    const combat = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect(legalActionsForPlayer(combat, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId)).toEqual(["oldf"]);
  });

  it("the animation lifts LIVE when the carrier leaves — even the fresh land taps again (not a creature)", () => {
    const lifted = board([perm("oldf", FOREST), perm("newf", FOREST, { enteredOnTurn: 4 })]);
    expect(permanentIsCreature(lifted, "oldf")).toBe(false);
    expect(legalActionsForPlayer(lifted, "user").filter((a) => a.kind === "tap-for-mana").map((a) => a.permanentId).sort()).toEqual(["newf", "oldf"]);
    const combat = { ...lifted, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    expect(legalActionsForPlayer(combat, "user").filter((a) => a.kind === "declare-attacker")).toEqual([]);
  });
});
