/**
 * Tests for the CR citation gate (check-cr-citations.cjs, run by `npm run lint`): the reader finds a rule number in
 * every form the source writes a citation, and a number the bundled CR does not hold is reported — the seen-to-fail
 * half of the gate. Before the joined-line scan, a citation wrapped across a line break ("… CR" / "702.10e)") and
 * the hyphenated form ("the CR-701.19e shuffle") were never read, so five citations to rules that do not exist
 * passed a clean run.
 *
 * ESM test importing the CommonJS checker — Node's interop exposes its named exports.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { citationsIn, findMissing } = require("./check-cr-citations.cjs");

const read = (text) => citationsIn(text).map((c) => `${c.rule}@${c.line}`);

describe("citationsIn — every form a citation takes", () => {
  it("reads one citation and the line it sits on", () => {
    expect(read("const a = 1;\n// a shuffle (CR 701.24a)\n")).toEqual(["701.24a@2"]);
  });

  it("reads a list after one CR", () => {
    expect(read("// CR 608.2n / 608.3b, 601.2f and 601.2h + CR 117.3")).toEqual(["608.2n@1", "608.3b@1", "601.2f@1", "601.2h@1", "117.3@1"]);
  });

  it("reads both ends of a range", () => {
    expect(read(" * ROLL-D20 (CR 706.1-706.2)")).toEqual(["706.1@1", "706.2@1"]);
  });

  it("reads the hyphenated form", () => {
    expect(read("// the CR-603.10a look-back")).toEqual(["603.10a@1"]);
  });

  it("reads a citation wrapped across a line break, reporting the line the number is on", () => {
    expect(read(" *   stay attached, CR\n *      303.4e). The permanent keeps its identity")).toEqual(["303.4e@2"]);
    expect(read("  // a layer-7b set (CR 613.4b /\n  // 613.4c) on top")).toEqual(["613.4b@1", "613.4c@2"]);
  });

  it("does not read a word suffix as a second number", () => {
    expect(read("// a deterministic CR 701.24a-style shuffle")).toEqual(["701.24a@1"]);
  });

  it("reads nothing that is not a CR citation", () => {
    expect(read("// version 0.150.0 · SCR 100.1 · CRUD 100.2 · rule 100.3 · a CR-style note · CR 7.5")).toEqual([]);
  });
});

describe("findMissing — the gate", () => {
  it("reports each number the CR does not hold, in every form, and passes the ones it does", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-citations-"));
    try {
      const file = path.join(dir, "probe.js");
      fs.writeFileSync(file, [
        "// shuffle (CR 701.24a); search (CR 701.19e)",
        "// the CR-701.19f find-nothing path",
        " * gaining control does not move the Aura, CR",
        " *      702.10e). Next sentence.",
        "// CR 303.4e / 702.21c",
      ].join("\n"));
      const rules = { "701.24a": {}, "303.4e": {} };
      const { cited, missing } = findMissing(rules, [file]);
      expect(cited).toBe(6);
      expect(missing.map((m) => `${m.rule}@${m.line}`)).toEqual(["701.19e@1", "701.19f@2", "702.10e@4", "702.21c@5"]);
      expect(missing[2].text).toBe("*      702.10e). Next sentence.");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
