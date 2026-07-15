/**
 * PostMortemView.test.jsx — SSR render verification for "The Reflecting Pool" (Crucible dream feature
 * A-EVOLVED — the per-deck dossier). vitest env is "node" (project bans jsdom/RTL — see SimCenter.test.jsx),
 * so we render the pure-initial PostMortemBoard with react-dom/server renderToStaticMarkup: prop-driven
 * markup renders with the FIRST deck's dossier selected (useState initial), the fetch effect in
 * PostMortemView does not — which is exactly what we want to assert here.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PostMortemBoard } from "./PostMortemView.jsx";

const DECKS = [
  {
    deckId: "sliver", deckName: "Sliver Hivelord", games: 7255, wins: 1559, losses: 5696, winRate: 1559 / 7255, avgLossTurn: 37.9,
    patterns: [{ key: "no-commander", label: "Commander never came down", count: 1996, lossShare: 0.35, winShare: 0.03, lift: 0.32 }],
    winPatterns: [{ key: "commander-early", label: "Commander online early — by your turn 4", count: 900, winShare: 0.58, lossShare: 0.22, lift: 0.36 }],
    winNote: "Patterns more common in this deck's wins than its losses — the lines worth leaning into.",
    facts: {
      avgWinTurn: 33.4, avgGameTurns: 38.2,
      winConMix: [{ key: "combat", label: "combat damage", count: 970, share: 0.62 }, { key: "poison", label: "poison", count: 200, share: 0.13 }],
      commanderOnline: { rate: 0.71, avgTurn: 4.6, n: 7255 },
    },
  },
  {
    // second deck: NOT the initially selected dossier — only its shelf chip should render.
    deckId: "omnath", deckName: "Omnath, Locus of Mana", games: 7178, wins: 2891, losses: 4287, winRate: 0.403, avgLossTurn: 36.2,
    patterns: [{ key: "mulligan-tax", label: "Mulliganed to 5 or fewer — started down cards", count: 2349, lossShare: 0.55, winShare: 0.4, lift: 0.15 }],
    winPatterns: [], winNote: "Only 4 recorded wins so far — not enough to name a winning line honestly.", facts: {},
  },
];

// A deck with NO clear pattern on either side (the honest empty columns) + no facts.
const BLANK_DECK = {
  deckId: "vihaan", deckName: "Vihaan, Goldwaker", games: 7354, wins: 1714, losses: 5640, winRate: 0.233, avgLossTurn: null,
  patterns: [], note: "Patterns more common in this deck's losses than its wins, when the sim AI pilots it.",
  winPatterns: [], winNote: "Patterns more common in this deck's wins than its losses — the lines worth leaning into.",
  facts: { avgWinTurn: null, avgGameTurns: null, winConMix: null, commanderOnline: null },
};

describe("PostMortemBoard — The Reflecting Pool dossier", () => {
  const html = renderToStaticMarkup(<PostMortemBoard decks={DECKS} totalGames={24102} />);

  it("renders a shelf chip for every deck with games, most-lost order preserved from the route", () => {
    expect(html).toContain("Sliver Hivelord");
    expect(html).toContain("Omnath, Locus of Mana");
  });

  it("shows the honest proxy caveat and the total games mined", () => {
    expect(html).toContain("separate its wins from its losses");
    expect(html).toContain("24,102"); // totalGames, comma-formatted
  });

  it("renders the FIRST deck's dossier: record, both mirror columns, coaching, honest rates, lift chips", () => {
    expect(html).toContain("What wins you games");
    expect(html).toContain("What loses you games");
    // loss mirror
    expect(html).toContain("Commander never came down");
    expect(html).toContain("Your commander is carrying this deck"); // loss coaching copy
    expect(html).toContain("+32pt vs wins");                        // loss lift chip
    expect(html).toContain("35%");                                  // loss share
    expect(html).toContain("3%");                                   // win share (why it's a real reason)
    // win mirror (R1)
    expect(html).toContain("Commander online early");
    expect(html).toContain("Your best games start with the commander down early"); // win coaching copy
    expect(html).toContain("+36pt vs losses");                      // win lift chip, opposite framing
    // the second deck's dossier body is NOT rendered (only its chip) — its pattern text is absent
    expect(html).not.toContain("Mulliganed to 5 or fewer");
  });

  it("renders the dossier facts row from the miner's facts (null-guarded cells)", () => {
    expect(html).toContain("Typical game");
    expect(html).toContain("38 turns");
    expect(html).toContain("Wins end by");
    expect(html).toContain("turn 33");
    expect(html).toContain("Usually closes by");
    expect(html).toContain("combat damage");
    expect(html).toContain("62% of wins");
    expect(html).toContain("Commander online");
    expect(html).toContain("71% of games");
    expect(html).toContain("avg turn 4.6");
  });

  it("renders honest empty columns for a deck with no clear pattern on either side", () => {
    const blank = renderToStaticMarkup(<PostMortemBoard decks={[BLANK_DECK]} totalGames={100} />);
    expect(blank).toContain("No single loss pattern stands out for this deck yet");
    expect(blank).toContain("No single winning line stands out yet");
  });

  it("surfaces a too-few-games miner note over the generic empty line (the more honest message)", () => {
    const fewWins = renderToStaticMarkup(<PostMortemBoard decks={[{ ...BLANK_DECK, winNote: "Only 4 recorded wins so far — not enough to name a winning line honestly." }]} totalGames={100} />);
    expect(fewWins).toContain("Only 4 recorded wins so far");
    expect(fewWins).not.toContain("No single winning line stands out yet");
  });

  it("shows an empty-state prompt when no deck has graded games", () => {
    const empty = renderToStaticMarkup(<PostMortemBoard decks={[{ deckId: "x", games: 0 }]} totalGames={0} />);
    expect(empty).toContain("No graded games yet");
  });
});
