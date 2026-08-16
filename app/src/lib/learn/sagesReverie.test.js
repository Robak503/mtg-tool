/**
 * sagesReverie.test.js — "for each Aura you control that's ATTACHED TO A CREATURE" (SHELF-TAIL SH4 — Sage's
 * Reverie; CR 303.4). The base "Aura you control" count already existed; the gap was the attached-to-a-
 * CREATURE filter (an aura on a land/artifact/player, or a detached one, must NOT count). One count source,
 * added to BOTH count parsers — parseCountSource (the ETB draw arm) and parseSelfCountSource (the layer-7c
 * static arm) — flips the whole card. countForSpec's permanentsYouControl counter honors `attachedToType`.
 * Flip +1/0/0.
 *
 * Mutation-checked (via Edit): disabling the attachedToType filter in countForSpec → an aura on a LAND is
 * wrongly counted → the buffed creature's magnitude is +1 too high (the count pin dies — the SH3 lesson:
 * a magnitude break is invisible to the flip-diff, so the witness measures it via the real layer path).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REVERIE_ORACLE = "Enchant creature\nWhen this Aura enters, draw a card for each Aura you control that's attached to a creature.\nEnchanted creature gets +1/+1 for each Aura you control that's attached to a creature.";

describe("SH4 — parse + classify", () => {
  it("the filtered aura count parses (the ETB-draw parser); Sage's Reverie is native-aura", () => {
    expect(parseCountSource("aura you control that's attached to a creature"))
      .toMatchObject({ kind: "permanentsYouControl", subtype: "Aura", attachedToType: "creature" });
    expect(classifyCard({ name: "Sage's Reverie", type: "Enchantment — Aura", oracle: REVERIE_ORACLE })).toBe("native-aura");
  });
});

describe("SH4 — the count filters to auras on CREATURES (the magnitude, via the layer path)", () => {
  // Board: Bear (creature) enchanted by Sage's Reverie + Aura2 (both on the Bear = a creature → count);
  // a Forest with Aura3 on it (aura on a LAND → does NOT count). Static = +1/+1 per counted aura → the Bear
  // gets +2/+2 (Sage's + Aura2), NOT +3/+3 (Aura3 excluded). Bear base 2/2 → 4/4.
  function board(includeLandAura) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", controller: "user", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle_text: "" } });
    const reverie = createPermanent({ id: "rev", controller: "user", card: { id: "cr", name: "Sage's Reverie", type: "Enchantment — Aura", oracle_text: REVERIE_ORACLE } });
    const aura2 = createPermanent({ id: "a2", controller: "user", card: { id: "ca2", name: "Aura2", type: "Enchantment — Aura", oracle_text: "" } });
    const forest = createPermanent({ id: "forest", controller: "user", card: { id: "cf", name: "Forest", type: "Basic Land — Forest", oracle_text: "" } });
    const aura3 = createPermanent({ id: "a3", controller: "user", card: { id: "ca3", name: "Aura3", type: "Enchantment — Aura", oracle_text: "" } });
    reverie.attachedTo = "bear"; aura2.attachedTo = "bear"; aura3.attachedTo = "forest";
    bear.attachments = ["rev", "a2"]; forest.attachments = ["a3"];
    const bf = [bear, reverie, aura2, forest, ...(includeLandAura ? [aura3] : [])];
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
    return permanentPower(s, "bear") + "/" + permanentToughness(s, "bear");
  }
  it("Sage's + Aura2 on the Bear → +2/+2 → 4/4 (the aura on the FOREST is excluded — mutation-check line)", () => {
    expect(board(true)).toBe("4/4"); // Aura3-on-land present but NOT counted
  });
  it("control: removing the land-aura leaves the count identical (it never contributed)", () => {
    expect(board(false)).toBe("4/4");
  });
});
