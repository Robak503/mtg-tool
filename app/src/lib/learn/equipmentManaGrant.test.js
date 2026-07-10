/**
 * equipmentManaGrant.test.js — SUBSYSTEM 1 phase 1a extension: GRANTED-MANA EQUIPMENT (SHELF W4).
 *
 * Paradise Mantle: 'Equipped creature has "{T}: Add one mana of any color." / Equip {1}'. The
 * parse widening (parseAuraGrantedManaAbility accepts an Equipment host) is the whole runtime
 * change — layers.js already emits the layer-6 mana grant for ANY attachedTo, so the equipped
 * host taps through the same grantedManaSpecsFor → manaSources path an aura host uses.
 *
 * CREED boundaries: residue-gated all-or-nothing (a P/T-bonus rider or an unmodeled Equip
 * variant keeps the card off the tier), and an UNequipped Mantle grants nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseAuraGrantedManaAbility, isNativeManaGrantAura } from "./staticAbilityParser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { grantedManaSpecsFor } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MANTLE = {
  name: "Paradise Mantle", type: "Artifact — Equipment", mana: "{1}",
  oracle: 'Equipped creature has "{T}: Add one mana of any color."\nEquip {1}',
};

function stateWith(bf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}

describe("EQUIPMENT-MANA-GRANT (1a) — recognition", () => {
  it("Paradise Mantle: the grant parses on an Equipment host → native-equipment", () => {
    expect(parseAuraGrantedManaAbility(MANTLE)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
    expect(classifyCard(MANTLE)).toBe("native-equipment");
    expect(isNativeManaGrantAura(MANTLE)).toBe(false); // the aura gate stays aura-only
  });

  it("CREED — a P/T-bonus rider keeps the card OFF the tier", () => {
    const ridered = { ...MANTLE, name: "Sword of Paradise", oracle: 'Equipped creature gets +1/+1 and has "{T}: Add one mana of any color."\nEquip {1}' };
    expect(classifyCard(ridered)).not.toBe("native-equipment");
  });

  it("CREED — an unmodeled Equip variant (Equip—Sacrifice a land.) is residue", () => {
    const weird = { ...MANTLE, name: "Odd Mantle", oracle: 'Equipped creature has "{T}: Add one mana of any color."\nEquip—Sacrifice a land.' };
    expect(classifyCard(weird)).toBe("body-only");
  });
});

describe("EQUIPMENT-MANA-GRANT (1a) — runtime", () => {
  it("EQUIPPED host gains the any-color tap; unequipped Mantle grants nothing", () => {
    const mantle = createPermanent({ id: "mantle", card: MANTLE, controller: "user" });
    mantle.attachedTo = "host";
    const host = createPermanent({ id: "host", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    host.attachments = ["mantle"];
    const s = stateWith([mantle, host]);
    const specs = grantedManaSpecsFor(s, "host");
    expect(specs.length).toBeGreaterThan(0);
    expect(specs[0]).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });

  it("no attachment → no grant", () => {
    const mantle = createPermanent({ id: "mantle", card: MANTLE, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const s = stateWith([mantle, bear]);
    expect(grantedManaSpecsFor(s, "bear")).toEqual([]);
  });
});
