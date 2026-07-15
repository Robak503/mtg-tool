/**
 * PostMortemView.test.jsx — SSR render verification for the "why you lost" panel (Crucible dream
 * feature A). vitest env is "node" (project bans jsdom/RTL — see SimCenter.test.jsx), so we render
 * the PURE PostMortemBoard with react-dom/server renderToStaticMarkup: prop-driven markup renders,
 * the fetch effect in PostMortemView does not — which is exactly what we want to assert here.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PostMortemBoard } from "./PostMortemView.jsx";

const DECKS = [
  {
    deckId: "sliver", deckName: "Sliver Hivelord", games: 7255, wins: 1559, losses: 5696, winRate: 1559 / 7255, avgLossTurn: 37.9,
    patterns: [{ key: "no-commander", label: "Commander never came down", count: 1996, lossShare: 0.35, winShare: 0.03, lift: 0.32 }],
  },
  {
    deckId: "omnath", deckName: "Omnath, Locus of Mana", games: 7178, wins: 2891, losses: 4287, winRate: 0.403, avgLossTurn: 36.2,
    patterns: [{ key: "mulligan-tax", label: "Mulliganed to 5 or fewer — started down cards", count: 2349, lossShare: 0.55, winShare: 0.40, lift: 0.15 }],
  },
  {
    // real miner always sets the generic `note`; the board must NOT echo it for the empty case,
    // it must show its own "nothing stands out" line — so this fixture sets the generic note on purpose.
    deckId: "vihaan", deckName: "Vihaan, Goldwaker", games: 7354, wins: 1714, losses: 5640, winRate: 0.233, avgLossTurn: 38,
    patterns: [], note: "Patterns more common in this deck's losses than its wins, when the sim AI pilots it.",
  },
];

describe("PostMortemBoard — the 'why you lost' panel", () => {
  const html = renderToStaticMarkup(<PostMortemBoard decks={DECKS} totalGames={24102} />);

  it("renders every deck with games, most-lost order preserved from the route", () => {
    expect(html).toContain("Sliver Hivelord");
    expect(html).toContain("Omnath, Locus of Mana");
    expect(html).toContain("Vihaan, Goldwaker");
  });

  it("shows the honest proxy caveat and the total games mined", () => {
    expect(html).toContain("more in your losses than your wins");
    expect(html).toContain("24,102"); // totalGames, comma-formatted
  });

  it("shows each surfaced pattern's coaching line, honest loss/win rates, and lift chip", () => {
    expect(html).toContain("Commander never came down");
    expect(html).toContain("Your commander is carrying this deck"); // coaching copy
    expect(html).toContain("+32pt vs wins");                        // lift chip
    expect(html).toContain("35%");                                  // loss share
    expect(html).toContain("3%");                                   // win share (why it's a real reason)
    // the one deck where mulligan-tax is genuinely discriminative
    expect(html).toContain("+15pt vs wins");
  });

  it("renders a deck with no clear pattern using its honest note (no fabricated reason)", () => {
    expect(html).toContain("No single loss pattern stands out for this deck yet");
  });

  it("shows an empty-state prompt when no deck has graded games", () => {
    const empty = renderToStaticMarkup(<PostMortemBoard decks={[{ deckId: "x", games: 0 }]} totalGames={0} />);
    expect(empty).toContain("No graded games yet");
  });
});
