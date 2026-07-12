/**
 * collectionTextImport.test.js — the paste-a-list parser (C5-P1.2). Pins the decklist grammar: qty · name ·
 * optional (SET) · optional collector# · optional foil, plus blank/comment skipping and error rows — all in
 * the same { format, entries, errors } shape parseCollectionCsv produces so the import pipeline is reused.
 */
import { describe, expect, it } from "vitest";

import { parseCollectionText, parseCollectionTextLine } from "./collectionTextImport.js";

describe("parseCollectionTextLine — the decklist grammar", () => {
  const entryOf = (line) => parseCollectionTextLine(line, 1)?.entry;

  it("bare name → qty 1, nonfoil, no set", () => {
    expect(entryOf("Sol Ring")).toMatchObject({ count: 1, name: "Sol Ring", setCode: "", finish: "nonfoil" });
  });

  it("leading quantity, with or without the x", () => {
    expect(entryOf("4 Sol Ring")).toMatchObject({ count: 4, name: "Sol Ring" });
    expect(entryOf("4x Sol Ring")).toMatchObject({ count: 4, name: "Sol Ring" });
    expect(entryOf("2× Lightning Bolt")).toMatchObject({ count: 2, name: "Lightning Bolt" });
  });

  it("trailing (SET) and collector number", () => {
    expect(entryOf("1 Sol Ring (C21)")).toMatchObject({ count: 1, name: "Sol Ring", setCode: "C21" });
    expect(entryOf("1 Sol Ring (C21) 263")).toMatchObject({ name: "Sol Ring", setCode: "C21" });
    expect(entryOf("Sol Ring (LTC) 447a")).toMatchObject({ name: "Sol Ring", setCode: "LTC" });
  });

  it("foil tokens in every common form", () => {
    expect(entryOf("1 Sol Ring *F*")).toMatchObject({ name: "Sol Ring", finish: "foil" });
    expect(entryOf("Sol Ring [foil]")).toMatchObject({ name: "Sol Ring", finish: "foil" });
    expect(entryOf("Sol Ring foil")).toMatchObject({ name: "Sol Ring", finish: "foil" });
  });

  it("the full Moxfield-style line: qty name (SET) # *F*", () => {
    expect(entryOf("4 Sol Ring (C21) 263 *F*")).toMatchObject({
      count: 4, name: "Sol Ring", setCode: "C21", finish: "foil", condition: "NM", language: "English",
    });
  });

  it("a multi-word name with a comma survives (no set/foil to strip)", () => {
    expect(entryOf("1 Krenko, Mob Boss")).toMatchObject({ name: "Krenko, Mob Boss", count: 1 });
  });

  it("blank + comment lines are skipped (null)", () => {
    expect(parseCollectionTextLine("", 1)).toBeNull();
    expect(parseCollectionTextLine("   ", 1)).toBeNull();
    expect(parseCollectionTextLine("# my binder", 1)).toBeNull();
    expect(parseCollectionTextLine("// section", 1)).toBeNull();
  });

  it("a line with a quantity but no name is an error", () => {
    expect(parseCollectionTextLine("4 (C21)", 3)?.error).toMatchObject({ line: 3 });
  });
});

describe("parseCollectionText — whole list", () => {
  it("parses a real haul, skipping blanks/comments, in CSV-compatible shape", () => {
    const { format, entries, errors } = parseCollectionText(
      "# prerelease pulls\n4 Sol Ring (C21) 263 *F*\n\n2x Lightning Bolt\nArcane Signet\n",
    );
    expect(format).toBe("text");
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(3);
    expect(entries.map(e => e.name)).toEqual(["Sol Ring", "Lightning Bolt", "Arcane Signet"]);
    expect(entries[0]).toMatchObject({ count: 4, setCode: "C21", finish: "foil", sourceLineNumber: 2 });
  });

  it("an empty paste yields a helpful error, not a silent empty result", () => {
    const { entries, errors } = parseCollectionText("\n\n# just a comment\n");
    expect(entries).toEqual([]);
    expect(errors[0].message).toMatch(/No card lines found/);
  });
});
