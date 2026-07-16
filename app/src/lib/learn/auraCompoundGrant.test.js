/**
 * auraCompoundGrant.test.js — BLITZ AC-1: the COMPOUND pump+grant attachment line
 * ("Enchanted/Equipped creature gets +N/+N and has \"<activated>\"" — Deviant Glee, Trollhide,
 * Arcane Teachings, Mortarpod, Screaming Shield). parseAttachedClause folds the quoted-ACTIVATED
 * tail (the twin of the Bear Umbra triggered fold): the P/T half is the layer engine's; the granted
 * ability is extracted by GRANTED_ACTIVATED_LINE's compound form and enumerated on the HOST by
 * grantedActivatedForHost — targets expand exactly like a printed ability.
 * CREED FP guarded: an UNMODELED quoted body drops the whole bonus (body-only).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { parseGrantedActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DEVIANT_GLEE = { id: "dg", name: "Deviant Glee", type: "Enchantment — Aura", mana: "{B}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+1 and has \"{R}: This creature gains trample until end of turn.\"" };
const SCREAMING_SHIELD = { id: "scs", name: "Screaming Shield", type: "Artifact — Equipment", mana: "{1}",
  oracle: "Equipped creature gets +0/+3 and has \"{2}, {T}: Target player mills three cards.\"\nEquip {3}" };
const UNMODELED = { id: "um", name: "Probe Aura", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has \"{T}: Untap all Islands you control and shuffle your hand into your library.\"" };

describe("parse + classify", () => {
  it("the compound folds: P/T ops emit, the quoted activated body extracts for the host", () => {
    const ops = parseAttachedBonus(DEVIANT_GLEE);
    expect(ops.length).toBeGreaterThanOrEqual(1);
    expect(ops.some((o) => o.op.layerOp === "ptModify" && o.op.power === 2 && o.op.toughness === 1)).toBe(true);
    const granted = parseGrantedActivatedAbilities(DEVIANT_GLEE);
    expect(granted.length).toBe(1);
    expect(granted[0].modeled).toBe(true);
  });
  it("carriers flip: Deviant Glee → native-aura, Screaming Shield → native-equipment", () => {
    expect(classifyCard(DEVIANT_GLEE)).toBe("native-aura");
    expect(classifyCard(SCREAMING_SHIELD)).toBe("native-equipment");
  });
  it("CREED — an unmodeled quoted body drops the whole bonus; the aura stays body-only", () => {
    expect(parseAttachedBonus(UNMODELED)).toEqual([]);
    expect(classifyCard(UNMODELED)).toBe("body-only");
  });
});

describe("runtime — the granted ability enumerates ON the host with the pump live", () => {
  it("a Deviant-Glee'd creature is offered the granted {R} ability", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: DEVIANT_GLEE, controller: "user", summoningSick: false });
    aura.attachedTo = "bear"; bear.attachments = ["aura"];
    const mtn = createPermanent({ id: "m1", card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 4,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura, mtn] } },
    };
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "bear");
    expect(offers.length).toBe(1);
    expect(offers[0].abilityText || "").toMatch(/trample/i);
  });
});
