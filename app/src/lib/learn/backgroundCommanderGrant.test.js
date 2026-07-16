/**
 * backgroundCommanderGrant.test.js — the COMMANDER-qualified group selector (BLITZ BG-1: Bastion
 * Protector / Bloodsworn Steward / the Background cycle's "Commander creatures you own have …").
 * "Commander" is a game-STATE quality (card.isCommander, stamped at seat build), not a type-line
 * word — the selector carries commanderOnly and matchesSelector gates on the flag. OWN≡CONTROL is
 * an engine invariant (no native control-changing effect; permanents carry no owner field), so
 * both printed scopes map to controllerScope "you" — documented at the parse site.
 *
 * CREED FPs guarded here: a non-commander creature must NEVER take the buff; the selector must not
 * fabricate a "Commander" subtype; interiors the grant validators can't model keep their whole
 * card body-only (Inspiring Leader's quoted static, Scion of Halaster's replacement).
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const BASTION = { id: "bp", name: "Bastion Protector", type: "Creature — Human Soldier", mana: "{2}{W}",
  power: "3", toughness: "3",
  oracle: "Commander creatures you control get +2/+2 and have indestructible." };
const BLOODSWORN = { id: "bs", name: "Bloodsworn Steward", type: "Creature — Vampire Knight", mana: "{2}{B}{B}",
  power: "4", toughness: "4",
  oracle: "Flying\nCommander creatures you control get +2/+2 and have haste." };
const INSPIRING_LEADER = { id: "il", name: "Inspiring Leader", type: "Legendary Enchantment — Background", mana: "{1}{W}",
  oracle: "Commander creatures you own have \"Creature tokens you control get +2/+2.\"" };
const SCION_OF_HALASTER = { id: "sh", name: "Scion of Halaster", type: "Legendary Enchantment — Background", mana: "{1}{B}",
  oracle: "Commander creatures you own have \"The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the rest back on top of your library. Then draw a card.\"" };

describe("classify — the anthem carriers flip; unmodelable interiors hold the card back", () => {
  it("Bastion Protector + Bloodsworn Steward → native-static", () => {
    expect(classifyCard(BASTION)).toBe("native-static");
    expect(classifyCard(BLOODSWORN)).toBe("native-static");
  });
  it("CREED — a Background whose quoted interior is a STATIC anthem (not a modeled grant kind) stays body-only", () => {
    expect(classifyCard(INSPIRING_LEADER)).toBe("body-only");
  });
  it("CREED — a Background granting a REPLACEMENT effect stays body-only", () => {
    expect(classifyCard(SCION_OF_HALASTER)).toBe("body-only");
  });
});

describe("runtime — the buff reaches exactly the controller's commander creatures", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const protector = createPermanent({ id: "prot", card: BASTION, controller: "user", summoningSick: false });
    const myCommander = createPermanent({
      id: "cmdr",
      card: { id: "kc", name: "Kestia, the Cultivator", type: "Legendary Creature — Nymph", power: "4", toughness: "4", oracle: "", isCommander: true },
      controller: "user", summoningSick: false,
    });
    const myBear = createPermanent({
      id: "bear",
      card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" },
      controller: "user", summoningSick: false,
    });
    const theirCommander = createPermanent({
      id: "oppc",
      card: { id: "oc", name: "Opposing Commander", type: "Legendary Creature — Giant", power: "5", toughness: "5", oracle: "", isCommander: true },
      controller: "ai1", summoningSick: false,
    });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [protector, myCommander, myBear] },
        ai1: { ...s.players.ai1, battlefield: [theirCommander] },
      },
    };
  }

  it("own commander gets +2/+2 and indestructible; own non-commander and the OPPONENT's commander do not", () => {
    const s = board();
    const perm = (id) => {
      for (const p of Object.values(s.players)) {
        const found = (p.battlefield || []).find((x) => x.id === id);
        if (found) return found;
      }
      return null;
    };
    expect(creaturePower(perm("cmdr"), s)).toBe(6);   // 4 + 2
    expect(permanentHasKeyword(s, "cmdr", "indestructible")).toBe(true);
    expect(creaturePower(perm("bear"), s)).toBe(2);   // not a commander — no buff
    expect(permanentHasKeyword(s, "bear", "indestructible")).toBe(false);
    expect(creaturePower(perm("oppc"), s)).toBe(5);   // an opponent's commander — out of scope ("you")
    expect(permanentHasKeyword(s, "oppc", "indestructible")).toBe(false);
  });
});
