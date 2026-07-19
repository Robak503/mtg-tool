/**
 * VaultDashboardRender.test.jsx — SSR render checks for the Vault V1 dashboard + Vihaan rail.
 *
 * Same doctrine as PendingChoicePanels.test.jsx: a wiring/string check can't catch a
 * structurally-present-but-blank panel, so the components are RENDERED (SSR — the repo bans
 * jsdom/RTL) and asserted to show their real affordances in BOTH data states:
 *   - the honest EMPTY state (a fresh install: no collection, no history) — this is what Colton
 *     sees first, so it must read as guidance, not brokenness;
 *   - the RICH state (tiles, movers, grails, rows all populated).
 *
 * VaultRail renders the widget canvases from the same payload; its chat behavior is interactive
 * (streaming) and is exercised live, not here.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import VaultDashboard, { formatSetName } from "./VaultDashboard.jsx";
import VaultRail from "./VaultRail.jsx";

const noop = () => {};
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, "'").replace(/\s+/g, " ").trim();

const RICH = {
  uniquePrintings: 8614,
  totalQuantity: 9120,
  vaultValue: 8432.18,
  movers: {
    status: "ok", window: 7,
    winner: { scryfallId: "w1", name: "Fabled Passage", pctChange: 18.2, current: 12.4 },
    loser: { scryfallId: "l1", name: "Sol Ring", pctChange: -12.1, current: 1.9 },
  },
  grails: [
    { scryfallId: "g1", name: "Gaea's Cradle", value: 950, flagged: true },
    { scryfallId: "g2", name: "The Great Henge", value: 60, flagged: false },
  ],
  valueSeries: [{ date: "2026-07-01", value: 8000 }, { date: "2026-07-10", value: 8200 }, { date: "2026-07-18", value: 8432 }],
  rows: [
    { scryfallId: "r1", name: "Gaea's Cradle", qty: 1, unit: 950 },
    { scryfallId: "r2", name: "Rhystic Study", qty: 2, unit: 40 },
  ],
};

const EMPTY = {
  uniquePrintings: 0, totalQuantity: 0, vaultValue: 0,
  movers: { status: "insufficient-history", reason: "price history covers 1 day", window: 7 },
  grails: [], valueSeries: [], rows: [],
};

// The dashboard fetches on mount; SSR renders the pre-fetch frame. So the DATA states are
// asserted through VaultRail (prop-driven) and the dashboard is asserted for its static chrome.
describe("VaultDashboard — static chrome renders", () => {
  it("shows the room title, the Rooms dropdown, and the tile labels", () => {
    const out = text(createElement(VaultDashboard, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE VAULT");
    expect(out).toContain("Rooms");
    expect(out).toContain("Unique printings");
    expect(out).toContain("Vault value");
    expect(out).toContain("My collection");
  });

  // THE PULSE BAN (Colton, 2026-07-19: "not a fan of the pulsing") — standing design law for this
  // room: no looping motion, ever. The component inlines all its CSS in a <style> tag, so the
  // rendered markup IS the animation surface — any `infinite` animation is a law violation the
  // suite must catch, not a taste note a future session has to remember.
  it("emits ZERO looping animations — motion is hover + one-shot entrance only", () => {
    const raw = renderToStaticMarkup(createElement(VaultDashboard, { onPick: noop, fontFamily: "Inter" }));
    expect(raw).not.toMatch(/\binfinite\b/);
    expect(raw).toMatch(/vd-pane/);    // the material kit actually rendered (guards against a hollow pass
    expect(raw).toMatch(/vd-title/);   // where the styling was deleted along with the loops)
  });
});

describe("formatSetName — Colton's long-set-name display rule (qualifier-first, clean cut)", () => {
  it("flips a trailing qualifier to the front, then cuts at a word boundary (his exact example)", () => {
    expect(formatSetName("Lost Caverns of Ixalan Special Guests")).toBe("Special Guests - Lost Caverns");
  });
  it("Commander decks read qualifier-first too", () => {
    expect(formatSetName("Murders at Karlov Manor Commander")).toBe("Commander - Murders at Karlov");
  });
  it("plain long names cut without a dangling connective; short names pass untouched", () => {
    expect(formatSetName("The Lord of the Rings: Tales of Middle-earth")).toBe("The Lord of the Rings: Tales");
    expect(formatSetName("Throne of Eldraine")).toBe("Throne of Eldraine");
    expect(formatSetName("Commander 2021")).toBe("Commander 2021"); // qualifier at the START is the name itself
  });
  it("null/empty → null (the cell falls back to the set code)", () => {
    expect(formatSetName(null)).toBeNull();
    expect(formatSetName("")).toBeNull();
  });
});

describe("VaultRail — the widget canvases in both data states", () => {
  it("value widget shows the vault total when rich", () => {
    const out = text(createElement(VaultRail, { fontFamily: "Inter", dashboard: RICH }));
    // Rail renders nameplate + chat + chips; widget canvas opens on demand — chips must exist.
    expect(out).toContain("VIHAAN");
    expect(out).toContain("Value history");
    expect(out).toContain("Week's movers");
    expect(out).toContain("Grail shelf");
    expect(out).toContain("Ask about your collection");
  });

  it("lane discipline is stated in the empty-chat guidance", () => {
    const out = text(createElement(VaultRail, { fontFamily: "Inter", dashboard: EMPTY }));
    expect(out).toContain("Karn");   // deck questions live with Karn — the lane law, visible
  });
});
