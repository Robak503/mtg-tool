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

  it("models a Sacrifice-this cost (γ1 — no-choice self-sac)", () => {
    const [a] = one("{1}, Sacrifice this creature: Draw a card.");
    expect(a).toMatchObject({ manaPips: "{1}", sacSelf: true, costModeled: true, modeled: true });
  });
  it("models a bare Sacrifice-this cost with no mana/{T} (γ1 — detection relaxed for word-costs)", () => {
    const [a] = one("Sacrifice this creature: Draw a card.");
    expect(a).toMatchObject({ manaPips: "", tapSelf: false, sacSelf: true, costModeled: true, modeled: true });
  });
  it("models a Pay-life cost (γ1 — no-choice life payment)", () => {
    const [a] = one("{T}, Pay 1 life: Draw a card.");
    expect(a).toMatchObject({ tapSelf: true, payLife: 1, costModeled: true, modeled: true });
  });
  it("does NOT model a Sacrifice-A-creature cost (needs a picker — deferred to γ1b)", () => {
    const [a] = one("{1}, Sacrifice a creature: Draw a card.");
    expect(a.costModeled).toBe(false);
    expect(a.modeled).toBe(false);
  });
  it("does NOT model a Discard cost (needs a picker — deferred to γ1b)", () => {
    const [a] = one("{T}, Discard a card: Draw a card.");
    expect(a.costModeled).toBe(false);
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

  // γ1 fail-safe: a self-sac cost is UNMODELED when sacrificing would silently drop one of the card's
  // own triggers (an LTB / "when you sacrifice" / compound condition the dies path can't fire), so the
  // whole card routes to the Arbiter rather than partially applying.
  it("does NOT model a self-sac whose card has a compound 'and when you sacrifice it' trigger (Carrot Cake)", () => {
    const abilities = one("When this artifact enters and when you sacrifice it, create a 1/1 white Rabbit creature token and scry 1.\n{2}, {T}, Sacrifice this artifact: You gain 3 life.", { type: "Artifact" });
    const sac = abilities.find((a) => a.sacSelf);
    expect(sac.costModeled).toBe(true);   // the COST parses…
    expect(sac.modeled).toBe(false);      // …but offering it would drop the sacrifice token-trigger
  });
  it("does NOT model a self-sac whose card has an 'enters or leaves the battlefield' trigger (Mouser Foundry)", () => {
    const abilities = one("When this artifact enters or leaves the battlefield, create a 1/1 colorless Robot artifact creature token.\n{4}{R}, Sacrifice this artifact: It deals 3 damage to target creature.", { type: "Artifact" });
    expect(abilities.find((a) => a.sacSelf).modeled).toBe(false);
  });
  it("STILL models a self-sac whose only trigger is a normal dies trigger (the dies path fires it)", () => {
    // "When this dies" fires correctly on the sacrifice (checkDiesTriggers) — never dropped — so this
    // genuine aristocrats outlet stays playable (no over-blocking).
    const abilities = one("When this creature dies, draw a card.\nSacrifice this creature: You gain 2 life.");
    expect(abilities.find((a) => a.sacSelf).modeled).toBe(true);
  });
  it("a pay-life ability is unaffected by a leaves-the-battlefield trigger (no sacrifice → no drop)", () => {
    const abilities = one("When this creature leaves the battlefield, create a Treasure token.\n{T}, Pay 2 life: Draw a card.");
    expect(abilities.find((a) => a.payLife).modeled).toBe(true);
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
