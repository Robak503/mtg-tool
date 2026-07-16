/**
 * LIVING WEAPON (CR 702.91) / FOR MIRRODIN! (CR 702.157) — the Equipment's built-in ETB: it enters, creates a
 * token (a 0/0 black Phyrexian Germ for living weapon; a 2/2 red Rebel for For Mirrodin!), and attaches itself
 * to that token. The equipped-creature +X/+Y then buffs the token via the layer engine — so a 0/0 Germ never
 * dies to the 0-toughness SBA (it's buffed the same instant it's created, CR 613). Modeled in enterPermanent
 * (resolvers.js) reusing the shared attachPermanent; coverage credits the keyword as a modeled clause.
 *
 * CREED: only the clean "keyword + Equip {cost} + a parseable +X/+Y[/keyword] bonus" flips. A complex
 * equipped-creature ability (Mortarpod's granted "Sacrifice this creature: …") drops the bonus parse → LOW.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const equip = (oracle, name = "LW Equip") => ({ type: "Artifact — Equipment", name, mana: "{2}", oracle });

describe("LIVING WEAPON / FOR MIRRODIN! — coverage flips", () => {
  it("a living-weapon equipment with a clean bonus + Equip flips native", () => {
    expect(classifyCard(equip("Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +1/+1.\nEquip {1}", "Flayer Husk"))).toBe("native-equipment");
    expect(classifyCard(equip("For Mirrodin!\nEquipped creature gets +2/+0.\nEquip {3}", "Mirran Bardiche"))).toBe("native-equipment");
    expect(classifyCard(equip("Living weapon\nEquipped creature gets +2/+2.\nEquip {2}", "Batterbone"))).toBe("native-equipment");
  });
  it("CREED: an UNMODELED equipped-creature granted ability stays body-only (bonus parse drops)", () => {
    // Mortarpod's granted-sac ping held this pin until BLITZ AC-1 folded the compound pump+grant line
    // (pinned native in auraCompoundGrant.test.js); an unmodeled granted body holds it now.
    expect(classifyCard(equip("Living weapon\nEquipped creature gets +0/+1 and has \"Sacrifice this creature: Untap all Islands you control and shuffle your hand into your library.\"\nEquip {2}", "Probe Pod"))).toBe("body-only");
  });
});

describe("LIVING WEAPON / FOR MIRRODIN! — engine: enters, makes its token, attaches, and buffs it", () => {
  it("For Mirrodin! creates a 2/2 Rebel, attaches, and the bonus applies (2/2 + 2/0 = 4/2)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = enterPermanent(s, equip("For Mirrodin!\nEquipped creature gets +2/+0.\nEquip {3}", "Bardiche"), "user");
    const bf = s.players.user.battlefield;
    const equipPerm = bf.find((p) => p.card.name === "Bardiche");
    const token = bf.find((p) => p.card.name === "Rebel");
    expect(token).toBeTruthy();
    expect(equipPerm.attachedTo).toBe(token.id);              // the Equipment attached to its token
    expect(permanentPower(s, token.id)).toBe(4);              // 2 base + 2 equip
    expect(permanentToughness(s, token.id)).toBe(2);
  });
  it("living weapon's 0/0 Germ SURVIVES because the +X/+Y is attached the same instant", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = enterPermanent(s, equip("Living weapon\nEquipped creature gets +1/+1.\nEquip {1}", "Flayer Husk"), "user");
    const germ = s.players.user.battlefield.find((p) => p.card.name === "Germ");
    expect(germ).toBeTruthy();                                // 0/0 Germ created
    expect(permanentToughness(s, germ.id)).toBe(1);           // 0 base + 1 equip → 1 toughness, not a 0-toughness SBA casualty
    expect(permanentPower(s, germ.id)).toBe(1);
    expect(germ.card.colors).toEqual(["B"]);                  // black Phyrexian Germ
  });
  it("a non-living-weapon equipment makes NO token (the hook is keyword-gated)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = enterPermanent(s, equip("Equipped creature gets +2/+0.\nEquip {1}", "Bonesplitter"), "user");
    expect(s.players.user.battlefield).toHaveLength(1);       // just the Equipment, no token
  });
});
