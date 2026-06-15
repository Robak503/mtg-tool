/**
 * Tests for effects/abilities.js — activated-ability detection (P2.9).
 *
 * The single source of truth both the runtime (legalChoices/actionDispatcher) and the
 * coverage metric read, so its cost-allowlist + effect-confidence gate are pinned here.
 */

import { describe, expect, it } from "vitest";
import { parseActivatedAbilities } from "./abilities.js";

const card = (oracle, over = {}) => ({ name: "Test", type: "Creature — Wizard", oracle, ...over });
const one = (oracle, over) => parseActivatedAbilities(card(oracle, over));

describe("parseActivatedAbilities — cost parsing (mana + {T} allowlist)", () => {
  it("parses a bare {T} cost", () => {
    const [a] = one("{T}: Draw a card.");
    expect(a).toMatchObject({ manaPips: "", tapSelf: true, costModeled: true, modeled: true });
  });
  it("parses a mana + {T} cost", () => {
    const [a] = one("{2}{U}, {T}: Draw a card.");
    expect(a).toMatchObject({ manaPips: "{2}{U}", tapSelf: true, costModeled: true, modeled: true });
  });
  it("parses a mana-only cost (no tap)", () => {
    const [a] = one("{1}{R}: This creature deals 1 damage to any target.");
    expect(a).toMatchObject({ manaPips: "{1}{R}", tapSelf: false, modeled: true });
  });

  it("does NOT model a Sacrifice cost (unmodeled → not playable)", () => {
    const [a] = one("{1}, Sacrifice this creature: Draw a card.");
    expect(a.costModeled).toBe(false);
    expect(a.modeled).toBe(false);
  });
  it("does NOT model a Pay-life cost", () => {
    const [a] = one("{T}, Pay 1 life: Draw a card.");
    expect(a.modeled).toBe(false);
  });
  it("does NOT model an {X} cost", () => {
    const [a] = one("{X}: This creature deals X damage to any target.");
    expect(a.modeled).toBe(false);
  });
  it("does NOT model a {Q} (untap-symbol) cost", () => {
    const [a] = one("{Q}: Draw a card.");
    expect(a.modeled).toBe(false);
  });
  it("ignores a flavor/rules colon with no symbol cost (not an ability)", () => {
    expect(one("Choose a color: that becomes the chosen color.")).toHaveLength(0);
  });
});

describe("parseActivatedAbilities — effect gating", () => {
  it("flags a MANA ability ({T}: Add …) and does NOT model it on the stack", () => {
    const [a] = one("{T}: Add {G}.");
    expect(a.isManaEffect).toBe(true);
    expect(a.modeled).toBe(false); // mana abilities use the no-stack tap-for-mana path
  });
  it("does NOT model an unparseable effect (tutor)", () => {
    const [a] = one("{2}, {T}: Search your library for a card, then shuffle.");
    expect(a.modeled).toBe(false);
  });
  it("does NOT model a MODAL effect (a mode would be silently picked)", () => {
    const [a] = one("{T}: Choose one — Draw a card; or you gain 2 life.");
    expect(a.modeled).toBe(false);
  });
  it("marks a TARGETED effect as needsTarget", () => {
    const [a] = one("{T}: This creature deals 1 damage to target creature.");
    expect(a.modeled).toBe(true);
    expect(a.needsTarget).toBe(true);
    expect(a.program.atoms[0].op).toBe("deal-damage");
  });
  it("a non-targeted effect (gain life) is modeled, needsTarget false", () => {
    const [a] = one("{T}: You gain 2 life.");
    expect(a).toMatchObject({ modeled: true, needsTarget: false });
  });
  it("detects MULTIPLE activated abilities, indexed", () => {
    const abilities = one("{3}{U}, {T}: Tap target creature.\n{3}{B}, {T}: Destroy target tapped creature.");
    expect(abilities).toHaveLength(2);
    expect(abilities.map((a) => a.index)).toEqual([0, 1]);
    expect(abilities.every((a) => a.modeled)).toBe(true);
  });
  it("returns [] for a card with no oracle / no activated abilities", () => {
    expect(one("")).toEqual([]);
    expect(one("Flying")).toEqual([]);
    expect(one("When this creature enters, draw a card.")).toEqual([]); // trigger, no colon
  });
});
