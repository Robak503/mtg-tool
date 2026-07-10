/**
 * arbiterCitations.test.js — R4.1's permanent guard: every CR citation the Arbiter prompt
 * hardcodes must exist in the BUNDLED cr_current.json. The audit found FOUR wrong numbers
 * being taught as disambiguations (tax 903.7→903.8-era drift, shield 122.1g=battle defense,
 * destroy 701.7=Create, day/night 730=Mutate) — a CR renumber or a hand-typed cite now fails
 * here by rule number instead of shipping an agent that teaches falsehoods.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AGENTS } from "./agents.js";

describe("Arbiter prompt CR citations exist in the bundled CR", () => {
  it("every [NNN.NNx] cite in every agent prompt resolves to a real bundled rule", () => {
    const crPath = path.join(process.cwd(), "..", "knowledge", "mtg-judge", "data", "cr", "cr_current.json");
    const cr = JSON.parse(fs.readFileSync(crPath, "utf8"));
    const prompts = Object.values(AGENTS).map((a) => `${a.systemPrompt || ""}\n${a.prompt || ""}\n${JSON.stringify(a)}`).join("\n");
    // Bracketed citations only — [903.8], [122.1c], [616.1a]. Bare numbers in prose are
    // discussed, not asserted; the bracket form is what the Arbiter emits as RULE TRACE.
    const cites = new Set([...prompts.matchAll(/\[(\d{3}\.\d+[a-z]?)\]/g)].map((m) => m[1]));
    expect(cites.size).toBeGreaterThan(5); // the scan found the prompt's cite set
    const missing = [...cites].filter((num) => !cr[num]);
    expect(missing, `Arbiter prompt cites rules ABSENT from the bundled CR: ${missing.join(", ")}`).toEqual([]);
  });
});
