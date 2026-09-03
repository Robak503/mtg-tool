/**
 * uneasyAlliance.test.js — CORPUS ④-S (2026-09-03 night): the SELF-SACRIFICE AURA COMPOSITE with a carrier — "{5},
 * Sacrifice this Aura: Exile enchanted creature. You create a 1/1 black Ninja creature token. Activate only during your
 * turn." (Uneasy Alliance) and Path to Redemption's Ally twin. The plain aura tier's validator demands every atom be the
 * enchanted referent, so the token atom sends these to the static-grant + activated composite, whose GUARD-LEAVE
 * refused every self-sacrifice; with ④-Q's host LKI at runtime, a self-SACRIFICE whose host-referencing atoms are all
 * the enchanted referent is admitted. "Activate only during your turn" is implied by the main-phase gate.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const UNEASY = { id: "c-ua", name: "Uneasy Alliance", type: "Enchantment — Aura", mana: "{3}{B}", cmc: 4, keywords: [],
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\n{5}, Sacrifice this Aura: Exile enchanted creature. You create a 1/1 black Ninja creature token. Activate only during your turn." };
const PATH = { id: "c-pr", name: "Path to Redemption", type: "Enchantment — Aura", mana: "{3}{W}", cmc: 4, keywords: [],
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\n{5}, Sacrifice this Aura: Exile enchanted creature. Create a 1/1 white Ally creature token. Activate only during your turn." };
const EQUIP_TWIN = { id: "c-eq", name: "Probe Equipment", type: "Artifact — Equipment", mana: "{1}", cmc: 1, keywords: [],
  oracle: "Equipped creature gets +1/+1.\nSacrifice this Equipment: Equipped creature gets +3/+3 until end of turn.\nEquip {1}" };

function setup(auraCard, pool, { active = "user" } = {}) {
  const host = createPermanent({ id: "host", card: { id: "c-host", name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "ai", summoningSick: false });
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "host"; host.attachments = ["aura"];
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: active, priorityHolder: "user", phase: "precombat-main", step: "main", turn: 6,
    players: { ...base.players,
      user: { ...base.players.user, graveyard: [], exile: [], hand: [], battlefield: [a], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...base.players.ai, graveyard: [], exile: [], hand: [], battlefield: [host] } } };
}
const sacAct = (s) => legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "aura" && x.sacSelf);

describe("the tiers", () => {
  it("⭐ Uneasy Alliance and Path to Redemption are native; an Equipment self-sac with an equipped referent stays parked (no LKI stamp)", () => {
    expect(classifyCard(UNEASY)).toMatch(/^native/);
    expect(classifyCard(PATH)).toMatch(/^native/);
    expect(classifyCard(EQUIP_TWIN)).not.toMatch(/^native/);
  });
});

describe("runtime", () => {
  it("⭐ {5}, sacrifice: the opponent's Bear is exiled AND we get the 1/1 Ninja; the Aura is in our graveyard", () => {
    const s = setup(UNEASY, { C: 5 });
    const act = sacAct(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "host")).toBeFalsy();
    expect(out.players.ai.exile.some((c) => c.name === "Host Bear")).toBe(true);
    expect(findPermanent(out, "aura")).toBeFalsy();
    expect(out.players.user.graveyard.some((c) => c.name === "Uneasy Alliance")).toBe(true);
    const ninja = out.players.user.battlefield.find((p) => /Ninja/.test(p.card?.type || "") || p.card?.name === "Ninja");
    expect(ninja).toBeTruthy();
    expect(ninja.card.power).toBe(1);
  });
  it("⛔ not offered on the opponent's turn (\"Activate only during your turn\" is the main-phase gate)", () => {
    const s = { ...setup(UNEASY, { C: 5 }, { active: "ai" }), priorityHolder: "user" };
    expect(sacAct(s)).toBeUndefined();
  });
});
