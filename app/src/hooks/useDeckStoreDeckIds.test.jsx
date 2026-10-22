/**
 * useDeckStoreDeckIds.test.jsx — the deck store's creation paths save every deck with an id (2026-10-21).
 *
 * The in-app imports (paste a list, import from a URL) always stamped an id. The library-JSON import
 * (Deck menu → import library) did not: it merged the file's decks as they were, so a library exported
 * before decks carried ids — or any hand-made one — added decks the pickers could never select. These
 * tests drive the real hook (SSR probe: the project bans jsdom/RTL) and read what it POSTs to /api/decks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import useDeckStore from "./useDeckStore.js";

let posts;

beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (url === "/api/decks" && init?.method === "POST") posts.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ powerLevel: 5, bracket: 2, bracketLabel: "Core" }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Render a component that calls the hook once and hand back its API (effects don't run under SSR). */
function deckStore() {
  let api;
  function Probe() {
    api = useDeckStore("Colton");
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return api;
}

const libraryFile = (decks) => ({ text: async () => JSON.stringify({ version: 1, decks }) });
const deck = (name, extra = {}) => ({ name, cards: [{ name: "Forest", qty: 99, section: "Mainboard" }], memory: { owner: "Colton" }, ...extra });

describe("useDeckStore — every saved deck has an id", () => {
  it("a library JSON whose decks have no id is saved with an id on each, all distinct (two share a name)", async () => {
    const store = deckStore();
    const result = await store.importDeckLibrary(libraryFile([deck("Old Export A"), deck("Old Export B"), deck("Old Export A")]));
    expect(result).toEqual({ imported: 3, total: 3 });
    expect(posts).toHaveLength(1);
    const saved = posts[0].decks;
    expect(saved.map((d) => d.name)).toEqual(["Old Export A", "Old Export B", "Old Export A"]);
    for (const d of saved) expect(typeof d.id === "string" && d.id !== "", `${d.name} has an id`).toBe(true);
    expect(new Set(saved.map((d) => d.id)).size).toBe(3);
  });

  it("the ids are derived, not random: the same id-less library imported into the same library gets the same ids", async () => {
    await deckStore().importDeckLibrary(libraryFile([deck("Again A"), deck("Again B")]));
    await deckStore().importDeckLibrary(libraryFile([deck("Again A"), deck("Again B")]));
    expect(posts).toHaveLength(2);
    expect(posts[0].decks.every((d) => d.id)).toBe(true);
    expect(posts[1].decks.map((d) => d.id)).toEqual(posts[0].decks.map((d) => d.id));
  });

  it("a library whose decks carry ids keeps them exactly (control)", async () => {
    await deckStore().importDeckLibrary(libraryFile([deck("Kept", { id: "keep-1" }), deck("Also Kept", { id: "keep-2" })]));
    expect(posts[0].decks.map((d) => d.id)).toEqual(["keep-1", "keep-2"]);
  });

  it("a deck imported from a URL is saved with an id (control: this path always stamped one)", async () => {
    const saved = deckStore().importDeckFromUrl({ name: "From A Link", source: "archidekt", cards: [{ name: "Forest", qty: 99, section: "Mainboard" }] }, "Colton");
    expect(typeof saved.id === "string" && saved.id !== "").toBe(true);
    expect(posts.at(-1).decks.at(-1).id).toBe(saved.id);
  });
});
