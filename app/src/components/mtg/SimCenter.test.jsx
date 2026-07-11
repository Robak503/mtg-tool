/**
 * Render/smoke test for SimCenter (the dedicated Sim Center section).
 *
 * The vitest env is "node" (no jsdom / RTL; the project bans new heavy deps), so
 * we render with React 19's own react-dom/server `renderToStaticMarkup`. Under
 * static SSR, useState initial values render but effects/async fetch don't — so
 * the deck list (which the panel fetches on mount) shows its initial loading
 * state. That's exactly enough to assert the static shell: the header, the
 * offline note, the disabled run button, the bank-data toggle + cumulative stat,
 * and the saved-report history section.
 *
 * The data-driven result render reuses SelfPlayPanel's already-tested pure pieces
 * (BreakageTable / OutcomeSummary), so we don't re-assert those here. The
 * cross-profile grouping is pure, so we exercise the exported `groupByProfile`
 * helper directly with mocked picker rows — the same { id, name, profile } shape
 * the GET endpoint returns. CREED: nothing about the engine's signals is faked.
 *
 * The LEYLINE glass pass added the run-control segs (games / format / pairings),
 * the grid⇄list roster toggle, and the /api/health freshness confession — the
 * static shell of each is asserted below (health hasn't fetched under SSR, so
 * the confession renders its honest "checking" state, never a green claim).
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import SimCenter, { groupByProfile } from "./SimCenter.jsx";

const COLORS = {
  BG: "#090a0d",
  BG2: "#12131c",
  BG3: "#181922",
  LINE: "#2c393b",
  TEXT: "#e3e2e6",
  MUTED: "#b9cacb",
  GOLD: "#00dbe7",
};
const CFG = { color: "#00dbe7", border: "#3a7a7a", dim: "rgba(0,219,231,0.12)", glow: "#00dbe7" };

describe("SimCenter", () => {
  it("mounts with the Sim Center header and the offline note", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Sim Center");
    // The local-first promise is shown verbatim.
    expect(html).toContain("Runs entirely offline on your machine");
    expect(html).toContain("0 network, 0 AI");
  });

  it("shows the loading state for the cross-profile deck list before the fetch resolves", () => {
    // Effects don't run under static SSR, so the initial deck-load state renders.
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Loading decks from every profile");
  });

  it("renders the run button disabled in the initial (no decks selected) state", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Run simulation");
    expect(html).toMatch(/Run simulation<\/button>/);
    expect(html).toContain("disabled");
  });

  it("renders the bank-training-data toggle and the cumulative banked stat", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Bank training data from this run");
    expect(html).toContain("Banked runs:");
    expect(html).toContain("Training rows banked:");
  });

  it("renders the saved-report history section", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Saved reports");
  });

  it("offers the format + pairings (run-all vs single-pod) choices", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Commander 4P");
    expect(html).toContain("Standard 1v1");
    expect(html).toContain("Run all pairings");
    expect(html).toContain("Just the selected pod");
  });

  it("offers the games presets up to the server clamp, plus the endless (grind) stop", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Games / pairing");
    expect(html).toContain("×25");
    expect(html).toContain("×50"); // the one-shot route clamps gamesPer at 50 (R2.7)
    expect(html).not.toContain("×100"); // no fabricated ×100/×1000 stops — bulk data is the grind's job
    expect(html).toContain("∞");
  });

  it("renders the roster grid⇄list toggle", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Grid");
    expect(html).toContain("List");
  });

  it("renders the freshness confession in its honest pre-fetch state (no green claim before /api/health answers)", () => {
    const html = renderToStaticMarkup(
      <SimCenter cfg={CFG} colors={COLORS} fontFamily="Inter" />
    );
    expect(html).toContain("Checking server freshness");
    expect(html).not.toContain("All Systems Green");
    expect(html).not.toContain("Stale data detected");
  });
});

describe("groupByProfile", () => {
  it("groups picker rows by profile, ordered alphabetically by profile name", () => {
    const decks = [
      { id: "a", name: "Vihaan", profile: "Colton" },
      { id: "b", name: "Raph & Mikey", profile: "Joe" },
      { id: "c", name: "Koma", profile: "Colton" },
    ];
    const groups = groupByProfile(decks);
    expect(groups.map((g) => g.profile)).toEqual(["Colton", "Joe"]);
    expect(groups[0].decks.map((d) => d.name)).toEqual(["Vihaan", "Koma"]);
    expect(groups[1].decks.map((d) => d.name)).toEqual(["Raph & Mikey"]);
  });

  it("falls back to an 'Unknown' group when a deck has no profile", () => {
    const groups = groupByProfile([{ id: "x", name: "Orphan", profile: "" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].profile).toBe("Unknown");
  });

  it("returns an empty array for no decks", () => {
    expect(groupByProfile([])).toEqual([]);
  });
});
