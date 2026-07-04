import { describe, it, expect } from "vitest";
import { sanitizeTags } from "./colorTagStore.js";

describe("sanitizeTags — the server-side tag-shape guard (E4)", () => {
  it("keeps the known fields and coerces types", () => {
    const out = sanitizeTags([{ id: "have", name: "Have", color: "#37d67a", behavior: "collection", extra: "drop me" }]);
    expect(out).toEqual([{ id: "have", name: "Have", color: "#37d67a", behavior: "collection" }]);
  });

  it("preserves builtin:true but never fabricates it", () => {
    expect(sanitizeTags([{ id: "default", builtin: true }])[0].builtin).toBe(true);
    expect(sanitizeTags([{ id: "have" }])[0]).not.toHaveProperty("builtin");
  });

  it("defaults missing name/color/behavior", () => {
    expect(sanitizeTags([{ id: "x" }])[0]).toEqual({ id: "x", name: "Tag", color: "#999999", behavior: "marker" });
  });

  it("drops entries with no id (ids join to per-card assignments) and non-objects", () => {
    expect(sanitizeTags([{ name: "no id" }, null, "str", { id: "keep" }])).toEqual([
      { id: "keep", name: "Tag", color: "#999999", behavior: "marker" },
    ]);
  });

  it("is null/non-array safe", () => {
    expect(sanitizeTags(null)).toEqual([]);
    expect(sanitizeTags(undefined)).toEqual([]);
    expect(sanitizeTags("nope")).toEqual([]);
  });

  it("caps the array at 100 tags and strings at 120 chars", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `t${i}` }));
    expect(sanitizeTags(many)).toHaveLength(100);
    const long = sanitizeTags([{ id: "x", name: "z".repeat(500) }])[0];
    expect(long.name.length).toBe(120);
  });
});
