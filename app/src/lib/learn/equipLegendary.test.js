/**
 * equipLegendary.test.js — EQUIP-LEGENDARY quality (CR 702.6c).
 *
 * "Equip legendary creature {cost}" is a restricted equip variant — identical to plain Equip except the
 * legal targets are narrowed to a Legendary creature you control (legalChoices enforces it via
 * equipQuality:"legendary", mirroring the existing "commander" quality). Modeled because the runtime can
 * evaluate the restriction from state (the target's type line is Legendary). Flip-diff over the corpus:
 * GAINED = {Excalibur Sword of Eden [Joe's Captain America deck], Blackblade Reforged}, LOST = 0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const C = (name, oracle, type = "Artifact — Equipment") => ({ name, oracle, type, keywords: [], mana: "" });

describe("EQUIP-LEGENDARY — 'Equip legendary creature {cost}' is a modeled quality", () => {
  it("Excalibur, Sword of Eden is native-equipment (self-cost-reduction pre-stripped; +10/+0 vigilance bonus + equip-legendary all modeled)", () => {
    const card = C(
      "Excalibur, Sword of Eden",
      "This spell costs {X} less to cast, where X is the total mana value of historic permanents you control. (Artifacts, legendaries, and Sagas are historic.)\nEquipped creature gets +10/+0 and has vigilance.\nEquip legendary creature {2}",
    );
    expect(classifyCard(card)).toBe("native-equipment");
  });

  it("CREED guard: an UNMODELED equip quality (Equip Human) stays body-only — only commander + legendary are modeled", () => {
    const card = C("Tribal Blade", "Equipped creature gets +2/+0.\nEquip Human {1}");
    expect(classifyCard(card)).not.toMatch(/^native/);
  });
});
