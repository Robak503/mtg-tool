/**
 * foilCommanders.test.js — the podium foil-shimmer detection (Crucible follow-on, 2026-07-14).
 *
 * foilCommandersFromCollection returns the lowercased names of podium commanders the ACTIVE profile owns
 * in FOIL or ETCHED (qty > 0, not a wishlist). CREED: the shine reflects a card actually owned foil —
 * never a foil printing that merely exists, a zero-qty stack, or a want-list entry.
 */
import { describe, it, expect } from "vitest";
import { foilCommandersFromCollection } from "./route.js";

const results = (podium) => ({ podium });
const card = (name, stacks, wishlist = false) => ({ name, stacks, wishlist });

describe("foilCommandersFromCollection", () => {
  it("a commander owned in FOIL (qty>0) shimmers", () => {
    const r = results([{ commanders: ["Omnath, Locus of Creation"], companion: null }]);
    expect(foilCommandersFromCollection(r, [card("Omnath, Locus of Creation", [{ finish: "foil", quantity: 1 }])]))
      .toEqual(["omnath, locus of creation"]);
  });

  it("ETCHED counts as foil", () => {
    const r = results([{ commanders: ["Kenrith, the Returned King"] }]);
    expect(foilCommandersFromCollection(r, [card("Kenrith, the Returned King", [{ finish: "etched", quantity: 2 }])]))
      .toEqual(["kenrith, the returned king"]);
  });

  it("a nonfoil-only commander does NOT shimmer", () => {
    const r = results([{ commanders: ["The Ur-Dragon"] }]);
    expect(foilCommandersFromCollection(r, [card("The Ur-Dragon", [{ finish: "nonfoil", quantity: 1 }])])).toEqual([]);
  });

  it("a foil stack with qty 0 is not owned", () => {
    const r = results([{ commanders: ["Atraxa, Praetors' Voice"] }]);
    expect(foilCommandersFromCollection(r, [card("Atraxa, Praetors' Voice", [{ finish: "foil", quantity: 0 }])])).toEqual([]);
  });

  it("a WISHLIST foil is not owned (CREED — never a fabricated shine)", () => {
    const r = results([{ commanders: ["Yuriko, the Tiger's Shadow"] }]);
    expect(foilCommandersFromCollection(r, [card("Yuriko, the Tiger's Shadow", [{ finish: "foil", quantity: 1 }], true)])).toEqual([]);
  });

  it("matches a companion too, and ignores commanders absent from the collection", () => {
    const r = results([{ commanders: ["Kinnan, Bonder Prodigy"], companion: "Lurrus of the Dream-Den" }]);
    const col = [card("Lurrus of the Dream-Den", [{ finish: "foil", quantity: 1 }])];
    expect(foilCommandersFromCollection(r, col)).toEqual(["lurrus of the dream-den"]);
  });

  it("no podium / empty / null inputs → no shimmer (fail-closed)", () => {
    expect(foilCommandersFromCollection({ podium: [] }, [])).toEqual([]);
    expect(foilCommandersFromCollection(null, null)).toEqual([]);
  });
});
