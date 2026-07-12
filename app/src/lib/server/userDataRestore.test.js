/**
 * Tests for userDataRestore.js (I2) — bundle validation + section selection.
 */

import { describe, expect, it } from "vitest";

import { validateBackupBundle, selectRestoreSections } from "./userDataRestore.js";

describe("validateBackupBundle", () => {
  it("accepts a well-formed backup", () => {
    expect(validateBackupBundle({ kind: "mtg-tool-backup", sections: {} }).ok).toBe(true);
  });
  it("rejects the wrong kind, missing sections, and non-objects", () => {
    expect(validateBackupBundle({ kind: "something-else", sections: {} }).ok).toBe(false);
    expect(validateBackupBundle({ kind: "mtg-tool-backup" }).ok).toBe(false);
    expect(validateBackupBundle(null).ok).toBe(false);
    expect(validateBackupBundle("nope").ok).toBe(false);
  });
});

describe("selectRestoreSections", () => {
  const bundle = {
    kind: "mtg-tool-backup",
    sections: {
      decks: { version: 1, decks: [{ id: "d1" }] },
      collection: { version: 1, cards: [] },
      watchlist: null,
      feedback: [{ id: "f1" }],
      games: [],
    },
  };

  it("selects present file-based sections (skips null + dir-based stores)", () => {
    const sel = selectRestoreSections(bundle);
    expect(sel.map(s => s.section).sort()).toEqual(["collection", "decks"]);
    expect(sel.find(s => s.section === "decks").file).toBe("decks.local.json");
  });

  it("honors an explicit section filter", () => {
    const sel = selectRestoreSections(bundle, ["decks"]);
    expect(sel).toHaveLength(1);
    expect(sel[0].section).toBe("decks");
  });

  it("returns nothing for an empty bundle", () => {
    expect(selectRestoreSections({ sections: {} })).toEqual([]);
  });

  it("restores color-tag defs into color-tags.json (C5-P1.1)", () => {
    const withTags = { kind: "mtg-tool-backup", sections: { colorTags: [{ id: "t1", name: "Grail" }] } };
    const sel = selectRestoreSections(withTags);
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ section: "colorTags", file: "color-tags.json" });
    expect(sel[0].data).toEqual([{ id: "t1", name: "Grail" }]);
  });
});
