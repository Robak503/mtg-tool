import { describe, expect, it } from "vitest";
import { artCropProxySrc } from "./artCrop.js";

describe("artCropProxySrc", () => {
  it("builds a proxy URL with id and url params", () => {
    const src = artCropProxySrc({
      scryfallId: "abc-123",
      artCropUrl: "https://cards.scryfall.io/art_crop/x.jpg",
    });
    expect(src).toContain("/api/art-crop?");
    expect(src).toContain("id=abc-123");
    expect(src).toContain(encodeURIComponent("https://cards.scryfall.io/art_crop/x.jpg"));
  });

  it("works with only an id (no stored url)", () => {
    expect(artCropProxySrc({ scryfallId: "abc-123" })).toBe("/api/art-crop?id=abc-123");
  });

  it("returns null when the card has neither id nor url", () => {
    expect(artCropProxySrc({})).toBeNull();
    expect(artCropProxySrc(null)).toBeNull();
    expect(artCropProxySrc(undefined)).toBeNull();
  });
});
