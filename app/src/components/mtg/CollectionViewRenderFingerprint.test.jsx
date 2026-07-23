/**
 * CollectionViewRenderFingerprint.test.jsx — the SEAM GATE for decomposing CollectionView.jsx.
 *
 * CollectionView is a ~1,240-line god-component. Extracting its pure presentational sub-components
 * to their own module is only safe if we can prove the extraction changed no rendered output. This
 * renders each moved component to static markup with fixed props and snapshots it; move a component
 * to another module and the snapshot must not budge. Same instrument as LearnViewRenderFingerprint.
 *
 * Asserts rendered OUTPUT, not behavior. SSR via react-dom/server (the project bans jsdom/RTL).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as CV from "./CollectionView.jsx";

const noop = () => {};
const COLORS = {
  BG3: "var(--ley-surface-2)",
  LINE: "var(--ley-line)",
  TEXT: "var(--ley-text)",
  MUTED: "var(--ley-text-dim)",
  GOLD: "var(--ley-green)",
  RED: "var(--ley-red)",
};
const FONT = `var(--font-body), sans-serif`;
const SHELF_CARDS = [
  {
    scryfallId: "sc-1",
    name: "Signed Bear",
    signed: { artist: "R. Artist", inPerson: true, event: "MagicCon", date: "2026" },
  },
  { scryfallId: "sc-2", name: "Showcase Foil", showcase: true },
];

/** component name -> the props it renders with. */
const CASES = {
  CenterMessage: { text: "Loading collection…", color: "var(--ley-text-dim)" },
  EmptyState: { color: "var(--ley-text-dim)", onAddCard: noop },
  ConflictsModal: {
    conflicts: [
      {
        oracleId: "o1",
        name: "Sol Ring",
        overflow: 2,
        ownedQty: 1,
        usedQty: 3,
        deckNames: ["Aggro", "Combo"],
      },
    ],
    totalDecks: 2,
    onClose: noop,
    colors: COLORS,
  },
  BulkActionBar: {
    count: 3,
    tags: [
      { id: "t1", name: "Foils" },
      { id: "default", name: "Default" },
    ],
    busy: false,
    onAssignTag: noop,
    onSetCondition: noop,
    onMarkOwned: noop,
    onDelete: noop,
    onSelectAll: noop,
    onClear: noop,
    onExit: noop,
    visibleCount: 42,
    colors: COLORS,
    font: FONT,
  },
  HeaderOverflowMenu: {
    items: [
      { label: "Export CSV", title: "Export the collection", onClick: noop },
      { label: "Delete all", title: "Delete everything", onClick: noop, danger: true },
    ],
    colors: COLORS,
    initialOpen: true, // render the open menu (the prop exists for exactly this — SSR render tests)
  },
  ShowpieceShelf: { cards: SHELF_CARDS, onPick: noop, colors: COLORS },
};

function render(name) {
  const Comp = CV[name];
  if (typeof Comp !== "function") return `NOT-EXPORTED:${name}`;
  return renderToStaticMarkup(createElement(Comp, CASES[name])).replace(/\s+/g, " ").trim();
}

describe("CollectionView render fingerprint — markup must not change when a panel moves", () => {
  for (const name of Object.keys(CASES).sort()) {
    it(`${name} renders identically`, () => {
      expect(render(name)).toMatchSnapshot();
    });
  }
});

describe("the fingerprint stays honest", () => {
  it("every case is exported and renders non-empty (no frozen blank panels)", () => {
    const missing = Object.keys(CASES).filter((n) => typeof CV[n] !== "function");
    expect(missing).toEqual([]);
    const empty = Object.keys(CASES).filter((n) => render(n).length < 20);
    expect(empty).toEqual([]);
  });
});
