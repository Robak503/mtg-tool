/**
 * collectionVaultUi.test.jsx — render (SSR) verification for the C5 Vault UI slices, so the drawer
 * inputs and bulk-bar controls are proven to RENDER (not just data-layer-tested). The vitest env is
 * "node" (the project bans jsdom/RTL — see SimCenter.test.jsx), so we render with React 19's
 * react-dom/server renderToStaticMarkup: useState initial values + prop-driven markup render, effects
 * and fetches don't. That's exactly enough to assert each new control is present with the right value.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CollectionCardDetail from "./CollectionCardDetail.jsx";
import CollectionView, { BulkActionBar, HeaderOverflowMenu, ShowpieceShelf } from "./CollectionView.jsx";
import CollectionImportModal from "./CollectionImportModal.jsx";
import CollectionAddModal, { quickAddKeyAction } from "./CollectionAddModal.jsx";
import VaultHome from "./VaultHome.jsx";

const COLORS = {
  BG: "#090a0d", BG2: "#12131c", BG3: "#181922", LINE: "#2c393b",
  TEXT: "#e3e2e6", MUTED: "#b9cacb", GOLD: "#00dbe7", RED: "#e5484d",
};

describe("C5-P1.4 — CollectionCardDetail drawer acquisition fields", () => {
  const row = {
    scryfallId: "sol-1",
    name: "Sol Ring",
    setCode: "c21",
    stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM", paidUsd: 2.5, acquiredAt: "2026-01-15" }],
    language: "ja",
  };

  it("renders the per-stack acquired-date input carrying the stack's acquiredAt", () => {
    const html = renderToStaticMarkup(<CollectionCardDetail row={row} colors={COLORS} />);
    // A date input exists and holds the seeded acquisition date.
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-01-15"');
    expect(html).toContain("When you acquired these");
  });

  it("renders the per-row Language section carrying the row's language", () => {
    const html = renderToStaticMarkup(<CollectionCardDetail row={row} colors={COLORS} />);
    expect(html).toContain("Language");
    expect(html).toContain('value="ja"');
    expect(html).toContain("Printing language");
  });

  it("a row with NO acquisition fields still renders the inputs empty (additive — old rows unaffected)", () => {
    const bare = { scryfallId: "x", name: "Plains", stacks: [{ finish: "nonfoil", quantity: 1, condition: "NM" }] };
    const html = renderToStaticMarkup(<CollectionCardDetail row={bare} colors={COLORS} />);
    expect(html).toContain('type="date"'); // the input is present…
    expect(html).not.toContain('value="2026-01-15"'); // …just empty
  });
});

describe("C5-P1.5 — BulkActionBar condition-set + mark-owned controls", () => {
  const baseProps = {
    count: 3, tags: [], busy: false,
    onAssignTag: () => {}, onSetCondition: () => {}, onMarkOwned: () => {},
    onDelete: () => {}, onSelectAll: () => {}, onClear: () => {}, onExit: () => {},
    visibleCount: 10, colors: COLORS, font: "Inter",
  };

  it("renders the Set-condition select with every grade", () => {
    const html = renderToStaticMarkup(<BulkActionBar {...baseProps} />);
    expect(html).toContain("Set condition");
    for (const grade of ["NM", "LP", "MP", "HP", "DMG"]) {
      expect(html).toContain(`>${grade}</option>`);
    }
  });

  it("renders the Mark-owned button", () => {
    const html = renderToStaticMarkup(<BulkActionBar {...baseProps} />);
    expect(html).toContain("Mark owned");
  });

  it("still renders the existing tag-assign + delete controls (no regression)", () => {
    const html = renderToStaticMarkup(<BulkActionBar {...baseProps} />);
    expect(html).toContain("Assign tag");
    expect(html).toContain("Delete");
  });

  it("with nothing selected, the action controls are disabled", () => {
    const html = renderToStaticMarkup(<BulkActionBar {...baseProps} count={0} />);
    expect(html).toContain("Select cards…");
    expect(html).toContain("disabled");
  });
});

describe("C5-P2.2 — HeaderOverflowMenu (the Stacks header strip)", () => {
  const items = [
    { label: "Binder view", onClick: () => {} },
    { label: "Color tags…", onClick: () => {} },
    { label: "Export CSV", onClick: () => {} },
    { label: "Roast me", danger: true, onClick: () => {} },
  ];

  it("closed by default: renders only the ⋯ trigger, no menu items", () => {
    const html = renderToStaticMarkup(<HeaderOverflowMenu items={items} colors={COLORS} />);
    expect(html).toContain("More actions");
    expect(html).not.toContain("Binder view");
    expect(html).not.toContain("Roast me");
  });

  it("open: renders every item, with the danger item in the red", () => {
    const html = renderToStaticMarkup(<HeaderOverflowMenu items={items} colors={COLORS} initialOpen />);
    for (const item of items) expect(html).toContain(item.label.replace("…", ""));
    expect(html).toContain("var(--ley-red)");
  });
});

describe("C5-P2.3 — the Ledger split (The Census surface + kiosk door)", () => {
  it("surface='census' renders the Census chip (its own surface exists)", () => {
    const html = renderToStaticMarkup(<CollectionView surface="census" />);
    expect(html).toContain("The Census");
  });

  it("surface='ledger' keeps the Ledger chip and no longer carries the Census", () => {
    const html = renderToStaticMarkup(<CollectionView surface="ledger" />);
    expect(html).toContain("The Ledger");
    expect(html).not.toContain("The Census");
  });

  it("the kiosk renders six doors including The Census", () => {
    const html = renderToStaticMarkup(<VaultHome onPick={() => {}} fontFamily="Inter" />);
    for (const door of ["The Stacks", "The Ledger", "The Census", "The Atlas", "The Gallery", "The Forge"]) {
      expect(html).toContain(door);
    }
  });
});

describe("C5-P2.1 — ShowpieceShelf (the treasure hierarchy in The Stacks)", () => {
  const cards = [
    {
      scryfallId: "signed-1", name: "Gaea's Cradle",
      stacks: [{ finish: "nonfoil", quantity: 1 }], prices: { usd: "900.00" },
      signed: { artist: "Mark Zug", inPerson: true },
    },
    {
      scryfallId: "grail-1", name: "Doubling Season",
      stacks: [{ finish: "foil", quantity: 1 }], prices: { usdFoil: "150.00" },
    },
    {
      scryfallId: "bulk-1", name: "Rampant Growth",
      stacks: [{ finish: "nonfoil", quantity: 4 }], prices: { usd: "0.50" },
    },
  ];

  it("renders flagged + top-value rows with provenance/value captions; bulk stays off", () => {
    const html = renderToStaticMarkup(<ShowpieceShelf cards={cards} onPick={() => {}} colors={COLORS} />);
    expect(html).toContain("The Showpiece Shelf");
    expect(html).toContain("Gaea&#x27;s Cradle");
    expect(html).toContain("Signed — Mark Zug (in person)");
    expect(html).toContain("Doubling Season");
    expect(html).toContain("Top value · $150.00");
    expect(html).not.toContain("Rampant Growth");
  });

  it("an all-bulk collection renders no shelf at all", () => {
    const html = renderToStaticMarkup(<ShowpieceShelf cards={[cards[2]]} onPick={() => {}} colors={COLORS} />);
    expect(html).toBe("");
  });
});

describe("C5-P1.2 — CollectionImportModal paste-a-list pane", () => {
  it("renders the paste-a-list textarea + Preview button alongside the CSV picker (pick phase)", () => {
    const html = renderToStaticMarkup(<CollectionImportModal onClose={() => {}} onAdded={() => {}} colors={COLORS} />);
    expect(html).toContain("Choose CSV file");     // the existing CSV path is still there
    expect(html).toContain("or paste a list");     // the new pane
    expect(html).toContain("Preview list");        // its action button
    expect(html).toContain("<textarea");           // the paste box
    // The grammar hint shows the example line so the user knows the format.
    expect(html).toContain("Sol Ring");
  });
});

describe("C5-P1.3 — quick-add two-keystroke decision", () => {
  it("1st Enter (results, nothing picked) → pick the top result", () => {
    expect(quickAddKeyAction({ key: "Enter", hasSelection: false, hasResults: true, hasCheckedFinish: false, busy: false })).toBe("pick-first");
  });
  it("2nd Enter (a card picked, a finish checked, idle) → submit", () => {
    expect(quickAddKeyAction({ key: "Enter", hasSelection: true, hasResults: true, hasCheckedFinish: true, busy: false })).toBe("submit");
  });
  it("does nothing mid-request (busy) or with no finish checked", () => {
    expect(quickAddKeyAction({ key: "Enter", hasSelection: true, hasCheckedFinish: true, busy: true })).toBeNull();
    expect(quickAddKeyAction({ key: "Enter", hasSelection: true, hasCheckedFinish: false, busy: false })).toBeNull();
  });
  it("only Enter acts; other keys pass through", () => {
    expect(quickAddKeyAction({ key: "a", hasSelection: false, hasResults: true })).toBeNull();
    expect(quickAddKeyAction({ key: "Enter", hasSelection: false, hasResults: false })).toBeNull();
  });
  it("the Add modal still mounts with the search input (regression)", () => {
    const html = renderToStaticMarkup(<CollectionAddModal onClose={() => {}} onAdded={() => {}} colors={COLORS} />);
    expect(html).toContain('type="search"');
  });
});
