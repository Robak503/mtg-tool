import { describe, it, expect } from "vitest";

import {
  isFoilTreatment,
  foilTreatmentLabel,
  bestFoilTreatment,
  treatmentButtons,
  finishDisplayLabel,
} from "./foilTreatments.js";

describe("finishDisplayLabel — the Vault ledger's Finish column (Colton, 2026-07-19)", () => {
  it("names his exact examples: halo / surge / mana / oil slick", () => {
    expect(finishDisplayLabel("foil", ["halofoil"])).toBe("Halo Foil");
    expect(finishDisplayLabel("foil", ["surgefoil"])).toBe("Surge Foil");
    expect(finishDisplayLabel("foil", ["manafoil"])).toBe("Mana Foil");
    expect(finishDisplayLabel("foil", ["oilslick"])).toBe("Oil Slick Foil");
  });
  it("basic foil stays plain 'Foil' — index absent or no treatment → never a guessed name", () => {
    expect(finishDisplayLabel("foil", [])).toBe("Foil");
    expect(finishDisplayLabel("foil", null)).toBe("Foil");
    expect(finishDisplayLabel("foil", undefined)).toBe("Foil");
  });
  it("nonfoil is Normal, etched is Etched — foilTypes noise never leaks across finishes", () => {
    expect(finishDisplayLabel("nonfoil", ["surgefoil"])).toBe("Normal");
    expect(finishDisplayLabel(undefined, null)).toBe("Normal");
    expect(finishDisplayLabel("etched", ["halofoil"])).toBe("Etched");
  });
  it("a specific treatment beats a generic substrate descriptor", () => {
    expect(finishDisplayLabel("foil", ["raisedfoil", "oilslick"])).toBe("Oil Slick Foil");
  });
});

describe("isFoilTreatment", () => {
  it("accepts *foil promo_types", () => {
    expect(isFoilTreatment("surgefoil")).toBe(true);
    expect(isFoilTreatment("galaxyfoil")).toBe(true);
    expect(isFoilTreatment("chocobotrackfoil")).toBe(true);
  });
  it("accepts the named non-foil-suffixed treatments", () => {
    expect(isFoilTreatment("oilslick")).toBe(true);
    expect(isFoilTreatment("stepandcompleat")).toBe(true);
    expect(isFoilTreatment("neonink")).toBe(true);
  });
  it("rejects promo metadata that isn't a treatment", () => {
    expect(isFoilTreatment("boosterfun")).toBe(false);
    expect(isFoilTreatment("prerelease")).toBe(false);
    expect(isFoilTreatment("datestamped")).toBe(false);
    expect(isFoilTreatment(null)).toBe(false);
  });
});

describe("foilTreatmentLabel", () => {
  it("uses the curated display name", () => {
    expect(foilTreatmentLabel("surgefoil")).toBe("Surge Foil");
    expect(foilTreatmentLabel("oilslick")).toBe("Oil Slick Foil");
    expect(foilTreatmentLabel("stepandcompleat")).toBe("Step-and-Compleat Foil");
  });
  it("humanizes an unmapped *foil treatment", () => {
    expect(foilTreatmentLabel("sparklefoil")).toBe("Sparkle Foil");
  });
});

describe("bestFoilTreatment", () => {
  it("returns null when there are no foil treatments", () => {
    expect(bestFoilTreatment([])).toBeNull();
    expect(bestFoilTreatment(["boosterfun"])).toBeNull();
  });
  it("prefers a specific treatment over a generic substrate descriptor", () => {
    // Real case: oil slick cards are tagged ["oilslick","raisedfoil"].
    expect(bestFoilTreatment(["oilslick", "raisedfoil"])).toBe("oilslick");
  });
  it("falls back to the only generic one when nothing specific exists", () => {
    expect(bestFoilTreatment(["raisedfoil"])).toBe("raisedfoil");
  });
});

describe("treatmentButtons", () => {
  it("nonfoil + foil → Normal then Foil", () => {
    expect(treatmentButtons(["nonfoil", "foil"], [])).toEqual([
      { finish: "nonfoil", label: "Normal", treatment: null },
      { finish: "foil", label: "Foil", treatment: null },
    ]);
  });

  it("labels the foil button with the special treatment", () => {
    expect(treatmentButtons(["nonfoil", "foil"], ["surgefoil"])).toEqual([
      { finish: "nonfoil", label: "Normal", treatment: null },
      { finish: "foil", label: "Surge Foil", treatment: "surgefoil" },
    ]);
  });

  it("foil-only special printing → a single special button", () => {
    expect(treatmentButtons(["foil"], ["galaxyfoil"])).toEqual([
      { finish: "foil", label: "Galaxy Foil", treatment: "galaxyfoil" },
    ]);
  });

  it("orders Normal, Foil, Etched", () => {
    const out = treatmentButtons(["etched", "foil", "nonfoil"], []);
    expect(out.map(b => b.finish)).toEqual(["nonfoil", "foil", "etched"]);
  });

  it("defaults to Normal when finishes are missing", () => {
    expect(treatmentButtons(undefined, undefined)).toEqual([
      { finish: "nonfoil", label: "Normal", treatment: null },
    ]);
  });
});
