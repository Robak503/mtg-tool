/**
 * Render tests for the shared self-play presentational pieces.
 *
 * The vitest env here is "node" (no jsdom / React Testing Library, and the
 * project bans new heavy deps), so we render with React 19's own
 * react-dom/server `renderToStaticMarkup` — a real, node-safe import.
 *
 * The interactive SelfPlayPanel default export was removed as dead code
 * (SimCenter superseded it and imports only these named pieces), so this file
 * exercises BreakageTable and OutcomeSummary directly with a MOCKED API-shaped
 * payload — the same shape /api/self-play returns
 * (breakageReport.aggregateBreakages().cards + outcomes). CREED: the mock
 * mirrors the real response shape; nothing is fabricated about what the
 * engine reports.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BreakageTable, OutcomeSummary } from "./SelfPlayPanel.jsx";

const COLORS = {
  BG: "#0c0b0a",
  BG2: "#12131c",
  BG3: "#181922",
  LINE: "#272a3c",
  TEXT: "#e8e6e0",
  MUTED: "#9d98b8",
  GOLD: "#8b6f3d",
};

// Mirrors the /api/self-play JSON: breakages = aggregateBreakages().cards.
const MOCK_RESULT = {
  ok: true,
  mode: "commander",
  deckNames: ["Vihaan", "Koma", "Slivers", "Zaxara"],
  games: 1,
  outcomes: {
    total: 1,
    completed: 1,
    userWins: 1,
    aiWins: 0,
    draws: 0,
    engineStuck: 0,
    dispatchError: 0,
    setupError: 0,
    unexpected: 0,
  },
  avgTurns: 11.4,
  breakages: [
    {
      card: "Smothering Tithe",
      count: 3,
      kinds: { "spell-unresolved": 3 },
      sampleReason: "no atom matched the treasure-on-draw clause",
      sampleTurn: 5,
    },
    {
      card: "Dockside Extortionist",
      count: 1,
      kinds: { "trigger-removed-no-target": 1 },
      sampleReason: null,
      sampleTurn: null,
    },
  ],
};

describe("self-play result pieces (SelfPlayPanel named exports)", () => {
  it("renders the ranked breakage table from a mocked API response", () => {
    const html = renderToStaticMarkup(
      <BreakageTable cards={MOCK_RESULT.breakages} colors={COLORS} />
    );
    expect(html).toContain("Smothering Tithe");
    expect(html).toContain("Dockside Extortionist");
    expect(html).toContain("spell-unresolved×3");
    // The first card's sample reason + turn are surfaced (honest signal).
    expect(html).toContain("no atom matched the treasure-on-draw clause");
    expect(html).toContain("turn 5");
  });

  it("renders the clean-bill-of-health state when there are no breakages", () => {
    const html = renderToStaticMarkup(
      <BreakageTable cards={[]} colors={COLORS} />
    );
    expect(html).toContain("No unmodeled / broken cards");
  });

  it("renders the outcome summary honestly, flagging non-completions", () => {
    const stuck = { ...MOCK_RESULT.outcomes, total: 2, completed: 1, engineStuck: 1 };
    const html = renderToStaticMarkup(
      <OutcomeSummary outcomes={stuck} avgTurns={11.4} games={2} colors={COLORS} />
    );
    expect(html).toContain("11.4"); // avg turns formatted
    expect(html).toContain("did not complete"); // non-completion surfaced, not hidden
    expect(html).toContain("engine-stuck ×1");
  });
});
