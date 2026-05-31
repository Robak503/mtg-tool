/**
 * Tests for supportBundle.js (D5) — the pure diagnostics assembler + text view.
 */

import { describe, expect, it } from "vitest";

import { buildSupportBundle, renderSupportText } from "./supportBundle.js";

const PARTS = {
  app: { name: "MTG Tool", version: "0.11.0" },
  runtime: { platform: "win32", arch: "x64", node: "v22.0.0" },
  data: { oracleIndex: { present: true, mtime: "2026-05-31T00:00:00Z" }, rulesIndex: { present: false } },
  content: { decks: 3, collectionCards: 120 },
};

describe("buildSupportBundle", () => {
  it("assembles the diagnostics with stable shape", () => {
    const b = buildSupportBundle(PARTS, "2026-05-31T00:00:00.000Z");
    expect(b.kind).toBe("mtg-tool-support");
    expect(b.generatedAt).toBe("2026-05-31T00:00:00.000Z");
    expect(b.app.version).toBe("0.11.0");
    expect(b.runtime.platform).toBe("win32");
    expect(b.data.oracleIndex.present).toBe(true);
    expect(b.content.decks).toBe(3);
  });

  it("defaults missing fields rather than throwing", () => {
    const b = buildSupportBundle({});
    expect(b.app.version).toBe("unknown");
    expect(b.runtime.platform).toBeNull();
    expect(b.data).toEqual({});
    expect(b.content).toEqual({});
  });
});

describe("renderSupportText", () => {
  it("renders a compact paste-friendly block", () => {
    const txt = renderSupportText(buildSupportBundle(PARTS, "2026-05-31T00:00:00.000Z"));
    expect(txt).toContain("MTG Tool 0.11.0");
    expect(txt).toContain("win32/x64");
    expect(txt).toContain("node v22.0.0");
    expect(txt).toContain("oracleIndex=");
    expect(txt).toContain("decks=3");
  });
});
