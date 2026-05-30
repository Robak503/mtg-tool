import { describe, it, expect } from "vitest";

import { detectDeckUrl, isDeckUrl } from "./deckImportUrl.js";

describe("detectDeckUrl", () => {
  it("detects a Moxfield deck URL", () => {
    expect(detectDeckUrl("https://www.moxfield.com/decks/AbC123_xy-z"))
      .toEqual({ type: "moxfield", id: "AbC123_xy-z" });
  });

  it("detects Moxfield without www and with a trailing path/query", () => {
    expect(detectDeckUrl("http://moxfield.com/decks/deck123/primer?foo=1"))
      .toEqual({ type: "moxfield", id: "deck123" });
  });

  it("detects an Archidekt deck URL with a slug", () => {
    expect(detectDeckUrl("https://archidekt.com/decks/1234567/my-sweet-deck"))
      .toEqual({ type: "archidekt", id: "1234567" });
  });

  it("detects Archidekt with just the numeric id", () => {
    expect(detectDeckUrl("archidekt.com/decks/9988")).toEqual({ type: "archidekt", id: "9988" });
  });

  it("trims surrounding whitespace", () => {
    expect(detectDeckUrl("  https://www.moxfield.com/decks/zzz  "))
      .toEqual({ type: "moxfield", id: "zzz" });
  });

  it("returns null for non-deck URLs and junk", () => {
    expect(detectDeckUrl("https://moxfield.com/decks")).toBeNull();
    expect(detectDeckUrl("https://example.com/decks/123")).toBeNull();
    expect(detectDeckUrl("just a card name")).toBeNull();
    expect(detectDeckUrl("")).toBeNull();
    expect(detectDeckUrl(null)).toBeNull();
  });

  it("rejects host-spoofing URLs (trusted domain in path or as a subdomain prefix)", () => {
    // Trusted domain only in the PATH of a hostile host → no match.
    expect(detectDeckUrl("https://evil.com/moxfield.com/decks/AbC123")).toBeNull();
    expect(detectDeckUrl("https://evil.com/path?x=archidekt.com/decks/123")).toBeNull();
    // Trusted domain as a prefix of a hostile host → no match.
    expect(detectDeckUrl("https://moxfield.com.evil.com/decks/AbC123")).toBeNull();
  });

  it("accepts real subdomains of the provider", () => {
    expect(detectDeckUrl("https://www.archidekt.com/decks/42/x")).toEqual({ type: "archidekt", id: "42" });
  });

  it("isDeckUrl mirrors detectDeckUrl", () => {
    expect(isDeckUrl("https://archidekt.com/decks/42/x")).toBe(true);
    expect(isDeckUrl("nope")).toBe(false);
  });
});
