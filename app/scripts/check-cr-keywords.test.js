/**
 * Tests for the wrong-keyword citation gate (check-cr-keywords.cjs, run by `npm run lint` after the rule-exists gate)
 * and its fixer (fix-cr-keyword-citations.cjs). The keyword map is read from the bundled CR; a citation whose
 * comment names a different keyword is reported (the seen-to-fail half), the readings that collide with ordinary
 * words stay advisory, and the fixer's rewrite is idempotent — a second run over its own output changes nothing.
 * Before this gate, "AFFLICT (CR 702.131)" (702.131 is Ascend) and 29 "ETB-FIGHT (CR 701.12)" (701.12 is Exchange)
 * passed a clean lint: the numbers exist, they just name the wrong mechanic.
 *
 * ESM test importing the CommonJS scripts — Node's interop exposes their named exports.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { keywordMap, keywordFindings, findKeywordMismatches, CR_FILE } = require("./check-cr-keywords.cjs");
const { plan, applyToSource, frontFaceTarget } = require("./fix-cr-keyword-citations.cjs");

const rules = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
const kw = keywordMap(rules);
const read = (source, file = "probe.js") => keywordFindings(source, file, kw).map((f) => `${f.rule}>${f.correct ?? "?"}:${f.tier}@${f.line}`);

function withFiles(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-keywords-"));
  try {
    const paths = Object.entries(files).map(([name, text]) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, text);
      return p;
    });
    return fn(paths, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("keywordMap — the keyword sections, read from the bundled CR", () => {
  it("names each 701/702 section by its title line, both words of a compound title, and a variant's name", () => {
    expect(kw.sections["701.14"].names).toEqual(["fight"]);
    expect(kw.sections["701.12"].names).toEqual(["exchange"]);
    expect(kw.sections["702.130"].names).toEqual(["afflict"]);
    expect(kw.sections["701.26"].names).toEqual(["tap", "untap"]);
    expect(kw.sections["702.37"].names).toContain("megamorph");
    expect(kw.sections["701.1"]).toBeUndefined(); // the chapter introduction is not a keyword
  });
});

describe("keywordFindings — a citation must cite the keyword its comment names", () => {
  it("reports a keyword named before, after, or as a label beside a citation of a different keyword", () => {
    expect(read([
      "// AFFLICT (CR 702.131) — defending player loses N life.",
      "// ETB-FIGHT — SOURCE-BOUND \"ANOTHER\" (CR 701.12).",
      "// pick which card to pitch (CR 701.8 — the discarding player chooses).",
      "// devour N (CR 702.81a, census slice 53).",
      "// BATTLE CRY (BLITZ BC-1, CR 702.90) — one trigger per instance.",
      "// RIPPLE N (CR 702.19 — Surging Might).",
      "/* the creature fights (CR 701.12) */",
    ].join("\n"))).toEqual([
      "702.131>702.130:named@1", "701.12>701.14:named@2", "701.8>701.9:named@3", "702.81a>702.82:named@4",
      "702.90>702.91:named@5", "702.19>702.60:named@6", "701.12>701.14:named@7",
    ]);
  });

  it("accepts a citation whose sentence names its own keyword, or no keyword at all", () => {
    expect(read([
      "// AFFLICT (CR 702.130) — the keyword's trigger.",
      "// regeneration (CR 701.19) replaces the destruction.",
      "// THE CITY'S BLESSING (shelf D5, CR 702.131) — a player designation.",
      "// undying (CR 702.93) and persist (CR 702.79).",
    ].join("\n"))).toEqual([]);
  });

  it("never reads a card name, a slice label, another family, or a keyword the cited rule's own text mentions", () => {
    expect(read([
      "// TEFERI'S PROTECTION (CR 702.26c).",
      "// the SHELF FIX (BLITZ BC-1, CR 702.90).",
      "// Channel (CR 702.33a — Discard this card: an activated ability).",
      "// tapped (CR 701.19a).",
    ].join("\n"))).toEqual([]);
  });

  it("gives a keyword right after one citation to that citation, not to the next", () => {
    expect(read("// (CR 701.18 reveal, CR 701.16 put-onto-the-battlefield-from-a-library)")).toEqual(["701.18>701.20:named@1"]);
  });

  it("keeps an ordinary-word collision a WEAK reading", () => {
    expect(read("// the partner gains it too (CR 702.95b)")).toEqual(["702.95b>702.124:weak@1"]);
  });

  it("reads test titles, but not other strings", () => {
    const source = [
      "it(\"AFFLICT (CR 702.131) — synthesis\", () => {",
      "  const note = \"AFFLICT (CR 702.131)\";",
      "});",
    ].join("\n");
    expect(read(source, "probe.test.js")).toEqual(["702.131>702.130:named@1"]);
    expect(read(source, "probe.js")).toEqual([]);
  });
});

describe("findKeywordMismatches — the gate", () => {
  it("fails on named hits, promotes a weak reading a named hit corroborates, moves a file's stragglers, and leaves the rest advisory", () => {
    withFiles({
      "a.js": [
        "// Mill (CR 701.13) — put the top N cards into the graveyard.",
        "",
        "/**",
        " * ETB-FIGHT (CR 701.12) — both creatures deal damage equal to their power.",
        " */",
        "// the source's hit landed even as it died (CR 701.12c).",
      ].join("\n"),
      "b.js": [
        "// each player's mill is its own event (CR 701.13a).",
        "",
        "// the partner gains it too (CR 702.95b).",
      ].join("\n"),
    }, (paths, dir) => {
      const { hits, advisory } = findKeywordMismatches(rules, paths, dir);
      expect(hits.map((h) => `${h.file}:${h.line} ${h.rule}>${h.correct} ${h.tier}`)).toEqual([
        "a.js:1 701.13>701.17 named",
        "a.js:4 701.12>701.14 named",
        "a.js:6 701.12c>701.14 file",
        "b.js:1 701.13a>701.17 weak",
      ]);
      expect(advisory.map((h) => `${h.file}:${h.line} ${h.rule}`)).toEqual(["b.js:3 702.95b"]);
    });
  });
});

describe("fix-cr-keyword-citations — the rewrite", () => {
  it("moves each hit to its keyword's section (a → a, other letters → the section), fixes 712.4a front faces, dedupes a list, and is idempotent", () => {
    withFiles({
      "c.js": [
        "// AFFLICT (CR 702.131a) — the definition.",
        "// BOAST (CR 702.135b) — only if this creature attacked this turn.",
        "// a library card has only its front face's characteristics (CR 712.4a).",
        "// the permanent's FRONT face, right now (CR 712.4a).",
        "// MILL-ON-EVENT — front-face type line (CR 712.4a / 712.8a).",
        "// meld them (CR 712.4a).",
        "const x = \"AFFLICT (CR 702.131)\";",
      ].join("\n"),
    }, ([file]) => {
      const before = fs.readFileSync(file, "utf8");
      const after = applyToSource(before, file, plan(rules, [file]));
      expect(after.split("\n")).toEqual([
        "// AFFLICT (CR 702.130a) — the definition.",
        "// BOAST (CR 702.142) — only if this creature attacked this turn.",
        "// a library card has only its front face's characteristics (CR 712.8a).",
        "// the permanent's FRONT face, right now (CR 712.8d).",
        "// MILL-ON-EVENT — front-face type line (CR 712.8a).",
        "// meld them (CR 712.4a).",
        "const x = \"AFFLICT (CR 702.131)\";",
      ]);
      fs.writeFileSync(file, after);
      expect(plan(rules, [file])).toEqual([]);
    });
  });

  it("picks the 712.8 subrule from the sentence's zone", () => {
    expect(frontFaceTarget("a card in the graveyard has only its front face (CR 712.4a)")).toBe("712.8a");
    expect(frontFaceTarget("the copy may be a non-creature artifact on the battlefield (front-face, CR 712.4a)")).toBe("712.8d");
    expect(frontFaceTarget("you cast it from its front face (CR 712.4a)")).toBe("712.11");
    expect(frontFaceTarget("Front-face only (CR 712.4a) so a back-face type can't qualify")).toBe("712.8");
    expect(frontFaceTarget("meld the pair's front faces (CR 712.4a)")).toBeNull();
  });
});
