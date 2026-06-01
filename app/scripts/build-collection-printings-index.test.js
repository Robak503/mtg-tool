/**
 * Smoke test for build-collection-printings-index.cjs.
 *
 * Validates the slimPrinting projection — the pure function that
 * decides which Scryfall fields land in the bundled Collection
 * lookup index. Catches regressions in art-crop selection (DFC vs
 * single-faced), finish defaults, price preservation, and skip-row
 * logic (art_series, missing ids).
 *
 * Pattern mirrors /api/engine/route.test.js — module-import + behavior
 * smoke, no real bulk-data dependency.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { slimPrinting } = require("./build-collection-printings-index.cjs");

describe("slimPrinting", () => {
  it("projects a normal single-faced card with all expected fields", () => {
    const out = slimPrinting({
      id: "abc-123",
      oracle_id: "oracle-456",
      name: "Sol Ring",
      set: "C21",
      set_name: "Commander 2021",
      collector_number: "256",
      rarity: "uncommon",
      set_type: "commander",
      reserved: false,
      finishes: ["nonfoil", "foil"],
      layout: "normal",
      released_at: "2021-04-23",
      image_uris: { art_crop: "https://example.com/sol-ring.jpg" },
      prices: { usd: "3.50", usd_foil: "12.00", usd_etched: null },
    });

    expect(out).toEqual({
      id: "abc-123",
      oracleId: "oracle-456",
      name: "Sol Ring",
      set: "c21",
      setName: "Commander 2021",
      collectorNumber: "256",
      rarity: "uncommon",
      setType: "commander",
      reserved: false,
      finishes: ["nonfoil", "foil"],
      foilTypes: [],
      layout: "normal",
      releasedAt: "2021-04-23",
      artCropUrl: "https://example.com/sol-ring.jpg",
      prices: { usd: "3.50", usdFoil: "12.00", usdEtched: null },
    });
  });

  it("keeps only foil-treatment promo_types in foilTypes (drops promo metadata)", () => {
    const out = slimPrinting({
      id: "x", oracle_id: "y", name: "Phyrexian Vindicator", set: "one",
      set_name: "Phyrexia: All Will Be One", collector_number: "347",
      finishes: ["foil"], layout: "normal", image_uris: { art_crop: "x" }, prices: {},
      promo_types: ["oilslick", "raisedfoil", "boosterfun"],
    });
    // boosterfun is promo metadata, not a foil treatment → dropped.
    expect(out.foilTypes).toEqual(["oilslick", "raisedfoil"]);
    expect(out.setName).toBe("Phyrexia: All Will Be One");
  });

  it("defaults foilTypes to [] when promo_types is absent", () => {
    const out = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "x", collector_number: "1",
      finishes: ["nonfoil"], layout: "normal", image_uris: { art_crop: "x" }, prices: {},
    });
    expect(out.foilTypes).toEqual([]);
  });

  it("captures releasedAt as null when the source omits it", () => {
    const out = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "x", collector_number: "1",
      finishes: ["nonfoil"], layout: "normal", image_uris: { art_crop: "x" }, prices: {},
    });
    expect(out.releasedAt).toBeNull();
  });

  it("returns null for digital-only printings (not ownable in paper)", () => {
    const out = slimPrinting({
      id: "mtgo-1",
      oracle_id: "oracle-digital",
      name: "Sol Ring",
      set: "pmtg1",
      collector_number: "1",
      layout: "normal",
      digital: true,
      image_uris: { art_crop: "https://example.com/digital.jpg" },
    });
    expect(out).toBeNull();
  });

  it("pulls art crop from card_faces[0] for DFC / transform layouts", () => {
    const out = slimPrinting({
      id: "dfc-1",
      oracle_id: "oracle-dfc",
      name: "Delver of Secrets // Insectile Aberration",
      set: "isd",
      collector_number: "51",
      finishes: ["nonfoil", "foil"],
      layout: "transform",
      card_faces: [
        { image_uris: { art_crop: "https://example.com/delver-front.jpg" } },
        { image_uris: { art_crop: "https://example.com/insectile-back.jpg" } },
      ],
      prices: { usd: "0.50" },
    });

    expect(out.artCropUrl).toBe("https://example.com/delver-front.jpg");
    expect(out.layout).toBe("transform");
  });

  it("returns null artCropUrl when no image_uris exist anywhere", () => {
    const out = slimPrinting({
      id: "no-art",
      oracle_id: "oracle-no-art",
      name: "Placeholder",
      set: "tst",
      collector_number: "1",
      finishes: ["nonfoil"],
      layout: "normal",
      prices: {},
    });

    expect(out.artCropUrl).toBeNull();
  });

  it("defaults finishes to ['nonfoil'] when missing or empty", () => {
    const noFinishes = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "x", collector_number: "1",
      layout: "normal", image_uris: { art_crop: "x" }, prices: {},
    });
    expect(noFinishes.finishes).toEqual(["nonfoil"]);

    const emptyFinishes = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "x", collector_number: "1",
      finishes: [],
      layout: "normal", image_uris: { art_crop: "x" }, prices: {},
    });
    expect(emptyFinishes.finishes).toEqual(["nonfoil"]);
  });

  it("preserves price nulls (no synthesis)", () => {
    const out = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "x", collector_number: "1",
      finishes: ["nonfoil"],
      layout: "normal", image_uris: { art_crop: "x" },
      prices: { usd: null, usd_foil: "5.00", usd_etched: undefined },
    });

    expect(out.prices).toEqual({
      usd: null,
      usdFoil: "5.00",
      usdEtched: null,
    });
  });

  it("returns null for art_series cards (excluded from index)", () => {
    const out = slimPrinting({
      id: "art-1",
      oracle_id: "oracle-art",
      name: "Sol Ring (Art)",
      set: "sld",
      collector_number: "1",
      layout: "art_series",
      image_uris: { art_crop: "https://example.com/art.jpg" },
    });

    expect(out).toBeNull();
  });

  it("returns null when oracle_id is missing", () => {
    const out = slimPrinting({
      id: "no-oracle",
      name: "Phantom",
      set: "tst",
      collector_number: "1",
      layout: "normal",
    });

    expect(out).toBeNull();
  });

  it("returns null when id (scryfallId) is missing", () => {
    const out = slimPrinting({
      oracle_id: "y",
      name: "Phantom",
      set: "tst",
      collector_number: "1",
      layout: "normal",
    });

    expect(out).toBeNull();
  });

  it("returns null on non-object input", () => {
    expect(slimPrinting(null)).toBeNull();
    expect(slimPrinting(undefined)).toBeNull();
    expect(slimPrinting("string")).toBeNull();
    expect(slimPrinting(42)).toBeNull();
  });

  it("lowercases set codes (CSV matching is case-insensitive)", () => {
    const out = slimPrinting({
      id: "x", oracle_id: "y", name: "Test", set: "LEA", collector_number: "1",
      finishes: ["nonfoil"],
      layout: "normal", image_uris: { art_crop: "x" }, prices: {},
    });

    expect(out.set).toBe("lea");
  });
});
