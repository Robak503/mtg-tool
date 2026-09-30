/**
 * playHintsBatch.test.js — merging ONE curated batch of Omnath's play-nuance notes into the play-hints ledger
 * (release-readiness R3, 2026-09-29). The fixture is cut from the real queue file's three note forms: batch 19's
 * bullet + REFRESH blocks and batch 18's one-line inline form (with its wrapped header paragraph).
 */
import { describe, expect, it } from "vitest";
import { applyCuratedBatch, parseCuratedBatch } from "./playHintsBatch.js";

const QUEUE = [
  "# ARBITER PLAY-NUANCE QUEUE",
  "",
  "## The worklist (2 cards)",
  "| Gemstone Caverns | land | ramp | Kinnan | ✍ |",
  "",
  "## ⭐ CURATED NOTES (Omnath) — the `note` column, newest batch on top",
  "",
  "**BATCH 19 (2026-09-05 — the POD-SIM THREE leftovers). A REFRESH line REPLACES the card's existing note on merge.**",
  "",
  "**Gemstone Caverns** — `ramp · early`",
  "- CAST WHEN: it is in your opening hand and you are NOT the starting player.",
  "- NEVER: as the starting player, or drawn later.",
  "",
  "**Hydroelectric Specimen // Hydroelectric Laboratory** — `utility · hold-interaction`",
  "- CHOOSE: early, the LAND face as your land drop;",
  "  later, the CREATURE face held with {2}{U} open.",
  "- TRAP: single-target spells only.",
  "",
  "**REFRESH — Lim-Dûl's Vault** — `tutor · hold-interaction`",
  "- CAST WHEN: at instant speed — the REST of the library is shuffled and the last five go on top.",
  "- TRAP: no card reaches your hand.",
  "",
  "**BATCH 18 (2026-08-16 — THE TAIL: all 80 remaining — 🏁 QUEUE",
  "COMPLETE, 492/492).** Oracle verified this session.",
  "",
  "**Agonasaur Rex** — `finisher · curve` — CAST WHEN: usually never — CYCLE it. TRAP: the trick rides the CYCLE, not the cast.",
  "**Animate Dead** — `recursion · early` — CAST WHEN: a fat body is in ANY graveyard.",
  "",
  "## The worklist (340 cards — an older snapshot)",
  "**Not A Note** — `x · y` — must never be read as batch content",
].join("\n");

const ledger = () => ({
  version: 1,
  generated: "2026-08-16T12:06:46.159Z",
  hints: {
    "Gemstone Caverns": { role: "ramp", timing: "early", source: "derived", tier: "land", parked: false },
    "Hydroelectric Specimen // Hydroelectric Laboratory": { role: "utility", timing: "curve", source: "derived", tier: "land-partial", parked: true },
    "Lim-Dûl's Vault": { role: "tutor", timing: "hold-interaction", note: "CAST WHEN: … a no-shuffle Doomsday-lite …", source: "curated", tier: "arbiter-spell", parked: true },
    "Sol Ring": { role: "ramp", timing: "early", note: "untouched curated note", source: "curated", tier: "native-mana", parked: false },
  },
});

describe("parseCuratedBatch", () => {
  it("reads batch 19's bullet and REFRESH blocks — bullets joined in the ledger's 'LABEL: text · LABEL: text' register", () => {
    const entries = parseCuratedBatch(QUEUE, 19);
    expect(entries.map((e) => [e.name, e.refresh])).toEqual([
      ["Gemstone Caverns", false],
      ["Hydroelectric Specimen // Hydroelectric Laboratory", false],
      ["Lim-Dûl's Vault", true],
    ]);
    const caverns = entries[0];
    expect(caverns.role).toBe("ramp");
    expect(caverns.timing).toBe("early");
    expect(caverns.note).toBe(
      "CAST WHEN: it is in your opening hand and you are NOT the starting player. · NEVER: as the starting player, or drawn later.",
    );
  });

  it("joins a wrapped bullet's continuation line onto that bullet", () => {
    const hydro = parseCuratedBatch(QUEUE, 19)[1];
    expect(hydro.note).toBe(
      "CHOOSE: early, the LAND face as your land drop; later, the CREATURE face held with {2}{U} open. · TRAP: single-target spells only.",
    );
  });

  it("reads batch 18's one-line inline form and skips its wrapped header paragraph", () => {
    const entries = parseCuratedBatch(QUEUE, 18);
    expect(entries.map((e) => e.name)).toEqual(["Agonasaur Rex", "Animate Dead"]);
    expect(entries[0].note).toBe("CAST WHEN: usually never — CYCLE it. TRAP: the trick rides the CYCLE, not the cast.");
    expect(entries[1]).toMatchObject({ role: "recursion", timing: "early", refresh: false });
  });

  it("never reads past the CURATED NOTES section or into another batch", () => {
    expect(parseCuratedBatch(QUEUE, 19).map((e) => e.name)).not.toContain("Agonasaur Rex");
    expect(parseCuratedBatch(QUEUE, 18).map((e) => e.name)).not.toContain("Not A Note");
  });

  it("an absent batch throws", () => {
    expect(() => parseCuratedBatch(QUEUE, 7)).toThrow(/batch 7 not found/);
  });

  it("a card listed twice in one batch throws", () => {
    const dup = QUEUE.replace("**Animate Dead** — `recursion · early`", "**Agonasaur Rex** — `recursion · early`");
    expect(() => parseCuratedBatch(dup, 18)).toThrow(/appears twice/);
  });

  it("an entry with no note throws", () => {
    const bare = QUEUE.replace("- TRAP: no card reaches your hand.", "").replace(
      "- CAST WHEN: at instant speed — the REST of the library is shuffled and the last five go on top.\n",
      "",
    );
    expect(() => parseCuratedBatch(bare, 19)).toThrow(/has no note/);
  });

  it("a queue with no CURATED NOTES section throws", () => {
    expect(() => parseCuratedBatch("# empty\n\n## Other\n", 19)).toThrow(/CURATED NOTES/);
  });
});

describe("applyCuratedBatch", () => {
  it("curates a derived entry, keeps its tier / parked, and reports it as added", () => {
    const { doc, report } = applyCuratedBatch(ledger(), parseCuratedBatch(QUEUE, 19));
    expect(doc.hints["Gemstone Caverns"]).toEqual({
      role: "ramp",
      timing: "early",
      note: "CAST WHEN: it is in your opening hand and you are NOT the starting player. · NEVER: as the starting player, or drawn later.",
      source: "curated",
      tier: "land",
      parked: false,
    });
    expect(report.added).toEqual(["Gemstone Caverns", "Hydroelectric Specimen // Hydroelectric Laboratory"]);
  });

  it("a REFRESH replaces the curated note and is reported as replaced", () => {
    const { doc, report } = applyCuratedBatch(ledger(), parseCuratedBatch(QUEUE, 19));
    expect(doc.hints["Lim-Dûl's Vault"].note).toMatch(/the REST of the library is shuffled/);
    expect(doc.hints["Lim-Dûl's Vault"].note).not.toMatch(/no-shuffle/);
    expect(report.replaced).toEqual(["Lim-Dûl's Vault"]);
  });

  it("every entry outside the batch is left exactly as it was, and the input is not mutated", () => {
    const before = ledger();
    const snapshot = JSON.stringify(before);
    const { doc } = applyCuratedBatch(before, parseCuratedBatch(QUEUE, 19));
    expect(doc.hints["Sol Ring"]).toEqual(before.hints["Sol Ring"]);
    expect(Object.keys(doc.hints)).toEqual(Object.keys(before.hints));
    expect(doc.generated).toBe(before.generated);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("a card the ledger doesn't carry is reported, never invented", () => {
    const { doc, report } = applyCuratedBatch(ledger(), parseCuratedBatch(QUEUE, 18));
    expect(report.skipped.map((s) => s.name)).toEqual(["Agonasaur Rex", "Animate Dead"]);
    expect(doc.hints["Agonasaur Rex"]).toBeUndefined();
  });

  it("a REFRESH of a card with no curated note is applied but flagged", () => {
    const l = ledger();
    l.hints["Lim-Dûl's Vault"] = { role: "tutor", timing: "curve", source: "derived", tier: "arbiter-spell", parked: true };
    const { doc, report } = applyCuratedBatch(l, parseCuratedBatch(QUEUE, 19));
    expect(report.refreshOfUncurated).toEqual(["Lim-Dûl's Vault"]);
    expect(doc.hints["Lim-Dûl's Vault"].source).toBe("curated");
  });

  it("a ledger with no hints object throws", () => {
    expect(() => applyCuratedBatch({ version: 1 }, [])).toThrow(/no hints/);
  });
});
